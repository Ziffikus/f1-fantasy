import { useEffect, useRef, useState } from 'react'
import { Radio } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './DraftTicker.css'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_MODEL = "gemini-2.5-flash"

async function callGemini(prompt, retries = 2, maxTokens = 5000) {
  if (!API_KEY) return null
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 1.4 }
      })
    })
    if (res.status === 429 && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 8000))
      return callGemini(prompt, retries - 1, maxTokens)
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
Du bist Kies Bettmann – F1-Kommentator, 54, erschöpft aber mit Herzblut dabei. Wir sind mitten in der F1-Saison 2026. Alle vier Spieler sind Männer.
Schreib ein Intro (3-4 Sätze) für den Fantasy Draft zum GP von ${gpName}.

Kontext:
- Draft-Reihenfolge heute: ${orderText}
- Letzte Woche: ${pointsText}

Spieler-Kontext:
- Mandi: Mann, sportlich, beim Wetten zu konservativ, beschäftigt sich nicht intensiv mit F1.
- Alex: Analysiert alles dreimal, Familienvater, methodisch.
- Andii: Entspannter Typ, sportlich, Gamer.
- Ferk: Entscheidet aus dem Bauch, Paragleiter, ehrgeizig.

Stil: Trockener Witz, erschöpfte Präzision. Begrüße zum Draft, erwähne wer als erster dran ist, kommentiere kurz die Vorwochenergebnisse mit Kies-typischer Ironie.
WICHTIG: Nur Fließtext, keine Überschriften, keine Anführungszeichen am Anfang oder Ende.
`
  return callGemini(prompt)
}

async function generatePickComment({ playerName, pickName, gpName }) {
  const prompt = `
Du bist Kies Bettmann – F1-Kommentator, 54, der diesen Job seit 19 Jahren macht und insgeheim immer noch daran hängt. Wir sind mitten in der F1-Saison 2026.
Dein Stil: Trockener Witz, erschöpfte Präzision, Ironie mit leichter Verzögerungszündung.

Pick: ${pickName}, GP von ${gpName}.

Kommentiere ausschließlich den Pick selbst. Ignoriere wer ihn gemacht hat.
Wähle EINE Kategorie – Kategorie A ist der klare Normalfall:

[A] SPORT & F1: Taktische Einschätzung, Streckenanalyse, Reifenstrategie, historischer Vergleich, Lobeshymne die sich nach Verriss anfühlt oder umgekehrt. KEIN Bezug auf den Spieler.
[B] KIES' LEBEN (nur alle 5-6 Picks einmal): Alter silberner BMW, rostig, klappernde Türen, Rückenschmerzen, Mahnbescheide – mit kleinem Zugeständnis am Ende. KEIN Bezug auf den Spieler.
[C] SPIELER-BEZUG (maximal 1x pro Draft, nur wenn Kategorie A und B schon mehrfach dran waren): ${playerName} ist einer von vier Männern.
- Mandi: konservativ, wenig F1-Tiefe.
- Alex: methodisch, Familienvater, Picks kurz vor Deadline.
- Andii: entspannt, Gamer, casual.
- Ferk: Bauchentscheider, Paragleiter, ehrgeizig.

Regeln:
- MAXIMAL 1-2 kurze Sätze. Absolute Obergrenze: 200 Zeichen gesamt.
- Ironie darf eine halbe Sekunde brauchen.
- Erschöpft, nicht verbittert.
- WICHTIG: Nur die Sätze, keine Kategorienbezeichnung, kein Präambel, keine Anführungszeichen.
- Zu lang = falsch. Kürzer ist besser.
`
  return callGemini(prompt, 2, 37)
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
Du bist Kies Bettmann – F1-Kommentator, 54, erschöpft aber mit Herzblut dabei. Wir sind mitten in der F1-Saison 2026. Alle vier Spieler sind Männer.
Schreib ein Outro (3-5 Sätze) für den abgeschlossenen Fantasy Draft zum GP von ${gpName}.

Alle Picks:
${playerSummaries}

Spieler-Kontext:
- Mandi: Mann, Sicherheitsdenker, sportlich, beim Wetten zu konservativ.
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
              const trimmed = (() => {
                if (text.length <= 300) return text
                const cut = text.slice(0, 300)
                const lastEnd = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'))
                return lastEnd > 50 ? text.slice(0, lastEnd + 1) : cut.trimEnd()
              })()
              setComments(prev => ({ ...prev, [newest.id]: trimmed }))
              supabase.from('picks').update({ ai_comment: trimmed }).eq('id', newest.id)
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
