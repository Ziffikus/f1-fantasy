import { useEffect, useRef, useState } from 'react'
import { Radio } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { chooseCategory, generateIntro, generateOutro, generatePickComment } from '../lib/draftCommentary'
import './DraftTicker.css'

// ── Supabase Helpers ──────────────────────────────────────────
async function loadCommentary(raceWeekendId) {
  const { data } = await supabase
    .from('draft_commentary')
    .select('intro, outro, category_history, c_used_by_player')
    .eq('race_weekend_id', raceWeekendId)
    .maybeSingle()
  return data
}

// Retry mit exponentiellem Backoff
async function withRetry(fn, { retries = 4, baseDelay = 800 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn()
      if (result?.error) throw result.error
      return result
    } catch (err) {
      if (attempt === retries) throw err
      const delay = baseDelay * 2 ** attempt + Math.random() * 200
      console.warn(`[DraftTicker] Save fehlgeschlagen (Versuch ${attempt + 1}), Retry in ${Math.round(delay)}ms`, err)
      await new Promise(res => setTimeout(res, delay))
    }
  }
}

// Globale Pending-Queue für Offline-Pufferung
const _pendingQueue = []
let _flushScheduled = false

function enqueueSave(fn) {
  _pendingQueue.push(fn)
  scheduleFlush()
}

async function flushQueue() {
  _flushScheduled = false
  while (_pendingQueue.length > 0) {
    const fn = _pendingQueue[0]
    try {
      await withRetry(fn)
      _pendingQueue.shift()
    } catch (err) {
      console.error('[DraftTicker] Queue-Eintrag endgültig fehlgeschlagen, bleibt in Queue:', err)
      scheduleFlush(10_000) // nochmal in 10s probieren
      return
    }
  }
}

function scheduleFlush(delay = 0) {
  if (_flushScheduled) return
  _flushScheduled = true
  setTimeout(flushQueue, delay)
}

// Flush bei Reconnect / Tab-Fokus
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { console.log('[DraftTicker] Wieder online – Queue wird geleert'); scheduleFlush() })
  window.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleFlush() })
}

async function saveCommentary(raceWeekendId, field, value) {
  const fn = () =>
    supabase.from('draft_commentary').upsert(
      { race_weekend_id: raceWeekendId, [field]: value },
      { onConflict: 'race_weekend_id' }
    )
  try {
    await withRetry(fn)
  } catch (err) {
    console.warn('[DraftTicker] saveCommentary in Queue verschoben:', field, err)
    enqueueSave(fn)
  }
}

async function savePickComment(pickId, text) {
  const fn = () =>
    supabase.from('picks').update({ ai_comment: text }).eq('id', pickId)
  try {
    await withRetry(fn)
  } catch (err) {
    console.warn('[DraftTicker] savePickComment in Queue verschoben:', pickId, err)
    enqueueSave(fn)
  }
}

// ── Spielerfarben ─────────────────────────────────────────────
const PLAYER_COLORS = [
  '#e60000',
  '#3b82f6',
  '#f59e0b',
  '#10b981',
]

// ── Hauptkomponente ───────────────────────────────────────────
export default function DraftTicker({ picks, draftOrder, isDraftComplete, weekend }) {
  const raceWeekendId = weekend?.id
  const gpName = weekend?.city ?? 'dem Grand Prix'

  const prevLengthRef = useRef(picks.length)
  const introGeneratedRef = useRef(false)
  const outroGeneratedRef = useRef(false)

  // Kategorie-Tracking als Refs – immer aktuell in Effects
  const categoryHistoryRef = useRef([])
  const cUsedByPlayerRef = useRef({ Mandi: false, Alex: false, Andii: false, Ferk: false })

  const [intro, setIntro] = useState(null)
  const [outro, setOutro] = useState(null)
  const [comments, setComments] = useState(() => {
    const init = {}
    for (const p of picks) {
      if (p.ai_comment) init[p.id] = p.ai_comment
    }
    return init
  })
  const [loading, setLoading] = useState({})
  const [introLoading, setIntroLoading] = useState(false)
  const [outroLoading, setOutroLoading] = useState(false)
  const [commentaryLoaded, setCommentaryLoaded] = useState(false)
  const [newId, setNewId] = useState(null)

  const playerColorMap = Object.fromEntries(
    draftOrder.map((o, i) => [o.profile_id, PLAYER_COLORS[i % PLAYER_COLORS.length]])
  )

  const entries = [...picks]
    .sort((a, b) => new Date(a.inserted_at ?? 0) - new Date(b.inserted_at ?? 0))
    .map((p, i) => ({
      ...p,
      playerName: draftOrder.find(o => o.profile_id === p.profile_id)?.profiles?.display_name ?? '?',
      playerColor: playerColorMap[p.profile_id] ?? PLAYER_COLORS[0],
      globalPickNumber: i + 1,
    }))

  // Gespeicherte Kommentare beim Mount laden
  useEffect(() => {
    if (!raceWeekendId) return
    loadCommentary(raceWeekendId).then(data => {
      if (data?.intro) { setIntro(data.intro); introGeneratedRef.current = true }
      if (data?.outro) { setOutro(data.outro); outroGeneratedRef.current = true }
      if (data?.category_history?.length) categoryHistoryRef.current = data.category_history
      if (data?.c_used_by_player) cUsedByPlayerRef.current = { ...cUsedByPlayerRef.current, ...data.c_used_by_player }
      setCommentaryLoaded(true)
    })
  }, [raceWeekendId])

  // Bestehende ai_comments übernehmen
  useEffect(() => {
    setComments(prev => {
      const updated = { ...prev }
      for (const p of picks) {
        if (p.ai_comment && !updated[p.id]) updated[p.id] = p.ai_comment
      }
      return updated
    })
  }, [picks])

  // Intro beim ersten Pick
  useEffect(() => {
    if (entries.length > 0 && !introGeneratedRef.current && draftOrder.length > 0 && commentaryLoaded) {
      introGeneratedRef.current = true
      setIntroLoading(true)

      const fetchAndGenerate = async () => {
        let lastWeekPoints = []
        try {
          const { data: prevPoints } = await supabase
            .from('player_race_points')
            .select('profile_id, total_points, weekend_rank')
            .eq('race_weekend_id', raceWeekendId - 1)
          if (prevPoints?.length) {
            lastWeekPoints = prevPoints.map(p => ({
              ...p,
              name: draftOrder.find(o => o.profile_id === p.profile_id)?.profiles?.display_name ?? '?'
            }))
          }
        } catch (_) {}

        const text = await generateIntro({ gpName, draftOrder, lastWeekPoints })
        if (text) { setIntro(text); saveCommentary(raceWeekendId, 'intro', text) }
        setIntroLoading(false)
      }
      fetchAndGenerate()
    }
  }, [entries.length > 0, draftOrder.length])

  // Neuen Pick kommentieren
  useEffect(() => {
    if (entries.length > prevLengthRef.current) {
      const newest = entries[entries.length - 1]
      prevLengthRef.current = entries.length

      setNewId(newest.id)
      setTimeout(() => setNewId(null), 3000)

      if (!comments[newest.id]) {
        // Kategorie wählen – Refs sind immer aktuell
        const category = chooseCategory(categoryHistoryRef.current, newest.playerName, cUsedByPlayerRef.current)

        // Refs sofort aktualisieren
        categoryHistoryRef.current = [...categoryHistoryRef.current, category]
        if (category === 'C') {
          cUsedByPlayerRef.current = { ...cUsedByPlayerRef.current, [newest.playerName]: true }
        }

        // In Supabase persistieren
        saveCommentary(raceWeekendId, 'category_history', categoryHistoryRef.current)
        saveCommentary(raceWeekendId, 'c_used_by_player', cUsedByPlayerRef.current)

        const pickName = newest.pick_type === 'driver'
          ? `${newest.drivers?.first_name} ${newest.drivers?.last_name}`
          : newest.constructors?.short_name

        console.log(`[DraftTicker] Pick #${entries.length} – Kategorie ${category} – ${newest.playerName}: ${pickName}`)

        setLoading(prev => ({ ...prev, [newest.id]: true }))

        generatePickComment({ category, playerName: newest.playerName, pickName, gpName })
          .then(text => {
            if (text) {
              setComments(prev => ({ ...prev, [newest.id]: text }))
              savePickComment(newest.id, text)
            }
          })
          .finally(() => setLoading(prev => ({ ...prev, [newest.id]: false })))
      }
    }
  }, [entries.length])

  // Outro wenn Draft abgeschlossen
  useEffect(() => {
    if (isDraftComplete && !outroGeneratedRef.current && entries.length > 0) {
      outroGeneratedRef.current = true
      setOutroLoading(true)
      generateOutro({ gpName, draftOrder, allPicks: picks })
        .then(text => {
          if (text) { setOutro(text); saveCommentary(raceWeekendId, 'outro', text) }
        })
        .finally(() => setOutroLoading(false))
    }
  }, [isDraftComplete])

  console.log('[DraftTicker] picks:', picks.length, 'entries:', entries.length, 'commentaryLoaded:', commentaryLoaded)
  if (entries.length === 0 && !introLoading) return null

  return (
    <div className="draft-commentary">
      <div className="draft-commentary-header">
        <span className="draft-commentary-title">
          <Radio size={13} />
          Kies Bettmann kommentiert
        </span>
        {!isDraftComplete && (
          <span className="draft-commentary-live">
            <span className="ticker-live-dot" /> LIVE
          </span>
        )}
      </div>

      <div className="draft-commentary-body">

        {/* Intro */}
        {(intro || introLoading) && (
          <div className="draft-commentary-intro">
            {introLoading
              ? <div className="draft-commentary-loading"><span /><span /><span /></div>
              : <p>{intro}</p>
            }
          </div>
        )}

        {/* Picks */}
        {entries.length > 0 && (
          <div className="draft-commentary-picks">
            {entries.map((entry, idx) => {
              const pickName = entry.pick_type === 'driver'
                ? `${entry.drivers?.first_name} ${entry.drivers?.last_name}`
                : entry.constructors?.short_name

              return (
                <div
                  key={entry.id}
                  className={`draft-commentary-pick ${entry.id === newId ? 'draft-commentary-pick--new' : ''}`}
                >
                  {idx > 0 && <div className="draft-commentary-divider">—</div>}

                  <div className="draft-commentary-pick-label">
                    <span className="draft-commentary-player" style={{ color: entry.playerColor }}>{entry.playerName}</span>
                    {' '}<span className="draft-commentary-pickt">pickt</span>{' '}
                    <span className="draft-commentary-pick-name">{pickName}</span>
                  </div>

                  {(comments[entry.id] || loading[entry.id]) && (
                    <div className="draft-commentary-text">
                      {loading[entry.id]
                        ? <div className="draft-commentary-loading"><span /><span /><span /></div>
                        : <p>{comments[entry.id]}</p>
                      }
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Outro */}
        {(outro || outroLoading) && (
          <div className="draft-commentary-outro">
            <div className="draft-commentary-divider draft-commentary-divider--end">✦</div>
            {outroLoading
              ? <div className="draft-commentary-loading"><span /><span /><span /></div>
              : <p>{outro}</p>
            }
          </div>
        )}

      </div>
    </div>
  )
}
