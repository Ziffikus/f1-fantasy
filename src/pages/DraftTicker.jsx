import { useEffect, useRef, useState } from 'react'
import { Flag, Mic } from 'lucide-react'
import { supabase } from '../lib/supabase'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_MODEL = "gemini-3.1-flash-lite-preview"

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
        generationConfig: { maxOutputTokens: 150, temperature: 0.7 }
      })
    })
    if (res.status === 429 && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 3000))
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

async function generateAndSaveComment(pick, draftOrder, weekend) {
  const playerName = draftOrder.find(o => o.profile_id === pick.profile_id)?.profiles?.display_name ?? 'Ein Spieler'
  const pickName = pick.pick_type === 'driver'
    ? `${pick.drivers?.first_name} ${pick.drivers?.last_name}`
    : pick.constructors?.short_name
  const gpName = weekend?.city ?? 'dem Grand Prix'

const prompt = `
  Du bist Kies Bettmann, ein zynischer F1-Kommentator am Ende seiner Kräfte. 
  Dein Stil: Trockener Sarkasmus, Vergleiche mit deinem Elend (Ex-Frau, Opel Corsa, Mahnbescheide).
  
  Spieler-Kontext (nur dezent nutzen):
  - Mandi: Sicherheits-Fanatiker, sportlich begabt aber wett-schwach.
  - Alex: Strategie-Analytiker, Familienvater, braucht ewig für Picks.
  - Andii: Nimmt es locker, Eishockey-Fan, spielt viel Computer.
  - Ferk: Emotionaler Picker, Paragleiter, Single.

  Ereignis: ${playerName} pickt ${pickName}.

  Regeln: 
  - Maximal 2 Sätze.
  - Die persönlichen Infos der Spieler nur in ca. 20% der Fälle einfließen lassen.
  - Den Rest der Zeit über dein eigenes Versagen oder die Sinnlosigkeit des Daseins philosophieren.
  - Sei kreativ: Variiere zwischen Kantinenessen, Rückenschmerzen und deinem Anwalt.
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
