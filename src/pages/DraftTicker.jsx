import { useEffect, useRef, useState } from 'react'
import { Car, Users, Flag, Mic } from 'lucide-react'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_MODEL = "gemini-3.1-flash-lite-preview"

function formatTime(isoString) {
  if (!isoString) return '–'
  return new Date(isoString).toLocaleTimeString('de-AT', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

async function callGemini(prompt, retries = 2) {
  if (!API_KEY) return 'Kein API Key'
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
    if (data.promptFeedback?.blockReason) return 'Interessante Wahl! 🏎️'
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Interessante Wahl! 🏎️'
  } catch (error) {
    console.error("Gemini Fehler:", error)
    return 'Fehler beim Laden'
  }
}

async function fetchComment(pick, draftOrder, weekend) {
  const playerName = draftOrder.find(o => o.profile_id === pick.profile_id)?.profiles?.display_name ?? 'Ein Spieler'
  const pickName = pick.pick_type === 'driver' ? `${pick.drivers?.first_name} ${pick.drivers?.last_name}` : pick.constructors?.short_name
  const gpName = weekend?.city ?? 'dem Grand Prix'

  const prompt = `Du bist ein enthusiastischer Formel-1-Kommentator. ${playerName} hat soeben ${pickName} für den ${gpName} Grand Prix gedraftet. Schreibe genau einen kurzen, witzigen Kommentarsatz dazu auf Deutsch.`
  return callGemini(prompt)
}

export default function DraftTicker({ picks, draftOrder, isDraftComplete, weekend }) {
  const listRef = useRef(null)
  const prevLengthRef = useRef(picks.length)
  const [comments, setComments] = useState({})
  const [loading, setLoading] = useState({})
  const [newId, setNewId] = useState(null)

  const entries = [...picks]
    .sort((a, b) => new Date(a.inserted_at ?? 0) - new Date(b.inserted_at ?? 0))
    .map((p, i) => ({
      ...p,
      playerName: draftOrder.find(o => o.profile_id === p.profile_id)?.profiles?.display_name ?? '?',
      globalPickNumber: i + 1,
    }))

  useEffect(() => {
    if (entries.length > prevLengthRef.current) {
      const newest = entries[entries.length - 1]
      prevLengthRef.current = entries.length

      setNewId(newest.id)
      setTimeout(() => setNewId(null), 3000)

      setLoading(prev => ({ ...prev, [newest.id]: true }))
      fetchComment(newest, draftOrder, weekend)
        .then(text => setComments(prev => ({ ...prev, [newest.id]: text || 'Interessante Wahl! 🏎️' })))
        .finally(() => setLoading(prev => ({ ...prev, [newest.id]: false })))
    }
  }, [entries.length, draftOrder, weekend])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [entries.length, comments])

  if (entries.length === 0) return null

  return (
    <div className="draft-ticker">
      <div className="draft-ticker-header">
        <span className="draft-ticker-title"><Flag size={13} /> Live Ticker</span>
        {!isDraftComplete && <span className="draft-ticker-live"><span className="ticker-live-dot" /> LIVE</span>}
        <span className="draft-ticker-count">{entries.length} Picks</span>
      </div>
      <div className="draft-ticker-list" ref={listRef}>
        {entries.map(entry => (
          <div key={entry.id} className={`ticker-entry ${entry.id === newId ? 'ticker-entry--new' : ''}`}>
            <div className="ticker-entry-main">
              <span className="ticker-time">{formatTime(entry.inserted_at)}</span>
              <span className="ticker-player">{entry.playerName}</span>
              <span className="ticker-arrow">→</span>
              <span className="ticker-pick-name">
                {entry.pick_type === 'driver' ? `${entry.drivers?.first_name} ${entry.drivers?.last_name}` : entry.constructors?.short_name}
              </span>
            </div>
            {(comments[entry.id] !== undefined || loading[entry.id]) && (
              <div className="ticker-comment">
                <Mic size={10} className="ticker-comment-icon" />
                {loading[entry.id] ? <span>...</span> : <span className="ticker-comment-text">{comments[entry.id]}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
