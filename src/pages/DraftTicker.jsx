import { useEffect, useRef, useState } from 'react'
import { Flag, Mic } from 'lucide-react'
import { supabase } from '../lib/supabase'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_MODEL = "gemini-2.5-flash"

function formatTime(isoString) {
  if (!isoString) return null
  return new Date(isoString).toLocaleTimeString('de-AT', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

async function callGemini(prompt, retries = 2) {
  if (!API_KEY) return null
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 1.4 }
      })
    })
    if (res.status === 429 && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 8000))
      return callGemini(prompt, retries - 1)
    }
    const data = await res.json()
    if (data.promptFeedback?.blockReason) return null
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
    if (!raw) return null
    // Prompt-Leakage abschneiden falls Modell Kategorien mit ausgibt
    return raw.split(/KATEGORIE|\[A\]|\[B\]|\[C\]|Regeln:/)[0].trim() || null
  } catch (error) {
    console.error("Gemini Fehler:", error)
    return null
  }
}

async function generateAndSaveComment(pick, draftOrder, weekend) {
  const playerName = draftOrder.find(o => o.profile_id === pick.profile_id)?.profiles?.display_name ?? 'Ein Spieler'
  const pickName = pick.pick_type === 'driver'
    ? `${pick.drivers?.first_name} ${pick.drivers?.last_name}`
    : pick.constructors?.short_name
  const gpName = weekend?.city ?? 'dem Grand Prix'

  const prompt = `
Du bist Kies Bettmann – F1-Kommentator, 54, der diesen Job seit 19 Jahren macht und insgeheim immer noch daran hängt.
Dein Stil: Trockener Witz, erschöpfte Präzision, Ironie mit leichter Verzögerungszündung.
Du klingst wie jemand, der alles schon gesehen hat – aber trotzdem hinschaut.

Spieler-Kontext (sparsam, ~20% der Kommentare):
- Mandi: Sicherheitsdenker, sportlich, beim Wetten einen Tick zu konservativ.
- Alex: Analysiert alles dreimal, Familienvater, Picks kommen kurz vor Deadline – methodisch wie ein Boxenstopp mit Formular.
- Andii: Entspannter Typ, Eishockey-Fan, Zocker – behandelt F1-Fantasy wie ein Casual Game. Funktioniert irgendwie.
- Ferk: Entscheidet aus dem Bauch, Paragleiter – springt rein, hofft auf Aufwind.

Ereignis: ${playerName} pickt ${pickName} beim ${gpName}.

KATEGORIE-WÜRFEL – wähle zufällig eine dieser Kategorien:

[A] SPORT & F1 – 65% der Fälle
  Mögliche Winkel (variieren!):
  - Taktische Einschätzung des Picks mit scheinbarer Expertise ("klassische Undercut-Logik, funktioniert in Monaco, nirgendwo sonst")
  - Historischer F1-Vergleich, leicht deplatziert
  - Meteorologie / Streckenanalyse als Pseudoargument
  - DRS, Reifenstrategie, Motorenstrafen – als wäre das alles völlig offensichtlich
  - Scherze über Teams, die eigentlich niemand ernstnimmt
  - Lobeshymne die sich nach Verriss anfühlt, oder umgekehrt

[B] SPIELER-BEZUG – 20% der Fälle
  Mit Wärme, nicht Spott. Kies kennt sie, mag sie (auf seine Art).
  Nie mehr als einen Bezug pro Kommentar.

[C] KIES' LEBEN – 15% der Fälle
  Opel Corsa, Rückenschmerzen, Mahnbescheide, lauwarmer Kaffee –
  aber immer mit einem kleinen Zugeständnis: „Wenigstens einer weiß was er tut."

Regeln:
- Maximal 2 Sätze.
- Nimm dir einen Moment. Der beste Kommentar ist nicht der erste, sondern der mit der unerwarteten Wendung im zweiten Satz.
- Ironie darf eine halbe Sekunde brauchen – das ist gewollt.
- Kein Zynismus ohne Herz. Erschöpft, nicht verbittert.
- Niemals zweimal denselben Winkel in Folge.
- WICHTIG: Antworte NUR mit den 2 Sätzen des Kommentars. Keine Kategorienbezeichnung, kein [A]/[B]/[C], kein Präambel, keine Anführungszeichen.
`

  const comment = await callGemini(prompt)
  if (!comment) return null

  // In Supabase speichern
  await supabase.from('picks').update({ ai_comment: comment }).eq('id', pick.id)

  return comment
}

export default function DraftTicker({ picks, draftOrder, isDraftComplete, weekend }) {
  const listRef = useRef(null)
  const prevLengthRef = useRef(picks.length)
  // Kommentare aus picks.ai_comment vorinitialisieren
  const [comments, setComments] = useState(() => {
    const init = {}
    for (const p of picks) {
      if (p.ai_comment) init[p.id] = p.ai_comment
    }
    return init
  })
  const [loading, setLoading] = useState({})
  const [newId, setNewId] = useState(null)

  const entries = [...picks]
    .sort((a, b) => new Date(a.inserted_at ?? 0) - new Date(b.inserted_at ?? 0))
    .map((p, i) => ({
      ...p,
      playerName: draftOrder.find(o => o.profile_id === p.profile_id)?.profiles?.display_name ?? '?',
      globalPickNumber: i + 1,
    }))

  // Neue Picks aus Supabase haben noch kein ai_comment → generieren & speichern
  useEffect(() => {
    if (entries.length > prevLengthRef.current) {
      const newest = entries[entries.length - 1]
      prevLengthRef.current = entries.length

      setNewId(newest.id)
      setTimeout(() => setNewId(null), 3000)

      // Nur generieren wenn noch kein Kommentar vorhanden
      if (!comments[newest.id]) {
        setLoading(prev => ({ ...prev, [newest.id]: true }))
        generateAndSaveComment(newest, draftOrder, weekend)
          .then(text => {
            if (text) setComments(prev => ({ ...prev, [newest.id]: text }))
          })
          .finally(() => setLoading(prev => ({ ...prev, [newest.id]: false })))
      }
    }
  }, [entries.length, draftOrder, weekend])

  // Wenn picks neu geladen werden, ai_comment Felder in State übernehmen
  useEffect(() => {
    setComments(prev => {
      const updated = { ...prev }
      for (const p of picks) {
        if (p.ai_comment && !updated[p.id]) {
          updated[p.id] = p.ai_comment
        }
      }
      return updated
    })
  }, [picks])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [entries.length, comments])

  if (entries.length === 0) return null

  return (
    <div className="draft-ticker">
      <div className="draft-ticker-header">
        <span className="draft-ticker-title"><Flag size={13} /> Live Ticker</span>
        {!isDraftComplete && (
          <span className="draft-ticker-live"><span className="ticker-live-dot" /> LIVE</span>
        )}
        <span className="draft-ticker-count">{entries.length} Picks</span>
      </div>

      <div className="draft-ticker-list" ref={listRef}>
        {entries.map(entry => {
          const time = formatTime(entry.inserted_at)
          const pickName = entry.pick_type === 'driver'
            ? `${entry.drivers?.first_name} ${entry.drivers?.last_name}`
            : entry.constructors?.short_name

          return (
            <div
              key={entry.id}
              className={`ticker-entry ${entry.id === newId ? 'ticker-entry--new' : ''}`}
            >
              <div className="ticker-entry-main">
                {time && <span className="ticker-time">{time}</span>}
                <span className="ticker-player">{entry.playerName}</span>
                <span className="ticker-arrow">→</span>
                <span className="ticker-pick-name">{pickName}</span>
              </div>

              {(comments[entry.id] !== undefined || loading[entry.id]) && (
                <div className="ticker-comment">
                  <Mic size={10} className="ticker-comment-icon" />
                  {loading[entry.id] ? (
                    <div className="ticker-comment-loading">
                      <span /><span /><span />
                    </div>
                  ) : (
                    <span className="ticker-comment-text">{comments[entry.id]}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
