import { useEffect, useRef, useState } from 'react'
import { Radio } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './DraftTicker.css'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_MODEL = "gemini-2.5-flash"

async function callGemini(prompt, retries = 2) {
  if (!API_KEY) return null
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 5000, temperature: 1.4 }
      })
    })
    if (res.status === 429 && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 8000))
      return callGemini(prompt, retries - 1)
    }
    const data = await res.json()
    if (data.promptFeedback?.blockReason) return null
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } catch (error) {
    console.error("Gemini Fehler:", error)
    return null
  }
}

async function generateIntro({ gpName, draftOrder, lastWeekPoints }) {
  const orderText = draftOrder.map((o, i) =>
    `${i + 1}. ${o.profiles?.display_name}`
  ).join(', ')

  const pointsText = lastWeekPoints?.length
    ? lastWeekPoints
        .sort((a, b) => a.weekend_rank - b.weekend_rank)
        .map(p => `${p.name}: ${p.total_points} Punkte (Platz ${p.weekend_rank})`)
        .join(', ')
    : 'keine Vorwochendaten verfügbar'

  const prompt = `
Du bist Kies Bettmann – F1-Kommentator, 54, erschöpft aber mit Herzblut dabei.
Schreib ein Intro (3-5 Sätze) für den Fantasy Draft zum GP von ${gpName}.

Kontext:
- Draft-Reihenfolge heute: ${orderText}
- Letzte Woche: ${pointsText}

Spieler-Kontext:
- Mandi: Sicherheitsdenker, sportlich, beim Wetten zu konservativ.
- Alex: Analysiert alles dreimal, Familienvater, methodisch.
- Andii: Entspannter Typ, Eishockey-Fan, Zocker.
- Ferk: Entscheidet aus dem Bauch, Paragleiter.

Stil: Trockener Witz, erschöpfte Präzision. Begrüße zum Draft, erwähne wer als erster dran ist, kommentiere kurz die Vorwochenergebnisse mit Kies-typischer Ironie.
WICHTIG: Nur Fließtext, keine Überschriften, keine Anführungszeichen am Anfang oder Ende.
`
  return callGemini(prompt)
}

async function generatePickComment({ playerName, pickName, gpName }) {
  const prompt = `
Du bist Kies Bettmann – F1-Kommentator, 54, der diesen Job seit 19 Jahren macht und insgeheim immer noch daran hängt.
Dein Stil: Trockener Witz, erschöpfte Präzision, Ironie mit leichter Verzögerungszündung.

Spieler-Kontext (sparsam, ~20% der Kommentare):
- Mandi: Sicherheitsdenker, sportlich, beim Wetten einen Tick zu konservativ.
- Alex: Analysiert alles dreimal, Familienvater, Picks kommen kurz vor Deadline.
- Andii: Entspannter Typ, Eishockey-Fan, Zocker – behandelt F1-Fantasy wie ein Casual Game.
- Ferk: Entscheidet aus dem Bauch, Paragleiter – springt rein, hofft auf Aufwind.

Ereignis: ${playerName} pickt ${pickName} beim GP von ${gpName}.

KATEGORIE-WÜRFEL – wähle zufällig eine:
[A] SPORT & F1 – 65%: Taktische Einschätzung, historischer Vergleich, Streckenanalyse, Reifenstrategie, Lobeshymne die sich nach Verriss anfühlt oder umgekehrt.
[B] SPIELER-BEZUG – 20%: Mit Wärme, nicht Spott.
[C] KIES' LEBEN – 15%: Opel Corsa, Rückenschmerzen, Mahnbescheide – aber mit kleinem Zugeständnis am Ende.

Regeln:
- Genau 2 Sätze.
- Ironie darf eine halbe Sekunde brauchen.
- Erschöpft, nicht verbittert.
- WICHTIG: Nur die 2 Sätze, keine Kategorienbezeichnung, kein Präambel, keine Anführungszeichen.
`
  return callGemini(prompt)
}

async function generateOutro({ gpName, draftOrder, allPicks }) {
  const playerSummaries = draftOrder.map(o => {
    const name = o.profiles?.display_name
    const playerPicks = allPicks.filter(p => p.profile_id === o.profile_id)
    const drivers = playerPicks
      .filter(p => p.pick_type === 'driver')
      .map(p => `${p.drivers?.first_name} ${p.drivers?.last_name}`)
      .filter(Boolean).join(', ')
    const teams = playerPicks
      .filter(p => p.pick_type === 'constructor')
      .map(p => p.constructors?.short_name)
      .filter(Boolean).join(', ')
    return `${name}: ${drivers}${teams ? ` + ${teams}` : ''}`
  }).join(' | ')

  const prompt = `
Du bist Kies Bettmann – F1-Kommentator, 54, erschöpft aber mit Herzblut dabei.
Schreib ein Outro (3-5 Sätze) für den abgeschlossenen Fantasy Draft zum GP von ${gpName}.

Alle Picks:
${playerSummaries}

Spieler-Kontext:
- Mandi: Sicherheitsdenker, sportlich, beim Wetten zu konservativ.
- Alex: Analysiert alles dreimal, Familienvater, methodisch.
- Andii: Entspannter Typ, Eishockey-Fan, Zocker.
- Ferk: Entscheidet aus dem Bauch, Paragleiter.

Stil: Erschöpfter Abschluss mit Wärme. Kurzer Kommentar zu interessanten Picks, Ausblick aufs Wochenende – Kies-typisch trocken aber nicht böse.
WICHTIG: Nur Fließtext, keine Überschriften, keine Anführungszeichen am Anfang oder Ende.
`
  return callGemini(prompt)
}

async function loadCommentary(raceWeekendId) {
  const { data } = await supabase
    .from('draft_commentary')
    .select('intro, outro')
    .eq('race_weekend_id', raceWeekendId)
    .maybeSingle()
  return data
}

async function saveCommentary(raceWeekendId, field, value) {
  await supabase.from('draft_commentary').upsert(
    { race_weekend_id: raceWeekendId, [field]: value },
    { onConflict: 'race_weekend_id' }
  )
}

// ── Spielerfarben ─────────────────────────────────────────────
const PLAYER_COLORS = [
  '#e60000', // Rot   (accent)
  '#3b82f6', // Blau
  '#f59e0b', // Amber
  '#10b981', // Grün
]

// ── Hauptkomponente ───────────────────────────────────────────
export default function DraftTicker({ picks, draftOrder, isDraftComplete, weekend }) {
  const raceWeekendId = weekend?.id
  const gpName = weekend?.city ?? 'dem Grand Prix'

  const prevLengthRef = useRef(picks.length)
  const introGeneratedRef = useRef(false)
  const outroGeneratedRef = useRef(false)

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
  const [newId, setNewId] = useState(null)

  // Spieler → Farbe (stabil nach Position in draftOrder)
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
    if (entries.length > 0 && !introGeneratedRef.current && draftOrder.length > 0) {
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
        setLoading(prev => ({ ...prev, [newest.id]: true }))
        const pickName = newest.pick_type === 'driver'
          ? `${newest.drivers?.first_name} ${newest.drivers?.last_name}`
          : newest.constructors?.short_name

        generatePickComment({ playerName: newest.playerName, pickName, gpName })
          .then(text => {
            if (text) {
              setComments(prev => ({ ...prev, [newest.id]: text }))
              supabase.from('picks').update({ ai_comment: text }).eq('id', newest.id)
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
