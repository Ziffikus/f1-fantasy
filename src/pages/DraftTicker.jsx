import { useEffect, useRef, useState } from 'react'
import { Flag, Mic } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './DraftTicker.css' // WICHTIG: Stellt sicher, dass das CSS geladen wird

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_MODEL = "gemini-2.0-flash"

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
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return raw ? raw.replace(/^["']|["']$/g, '') : null
  } catch (err) {
    console.error('Gemini error:', err)
    return null
  }
}

export default function DraftTicker({ picks, draftOrder, isDraftComplete, weekend }) {
  const [entries, setEntries] = useState([])
  const [comments, setComments] = useState({})
  const [loading, setLoading] = useState({})
  const [newId, setNewId] = useState(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!picks.length) return
    const sorted = [...picks].sort((a, b) => 
      new Date(b.inserted_at) - new Date(a.inserted_at)
    )
    const latest = sorted.map(p => ({
      ...p,
      playerName: draftOrder.find(o => o.profile_id === p.profile_id)?.profiles?.display_name || '?'
    }))
    setEntries(latest)

    const mostRecent = latest[0]
    if (mostRecent) {
      setNewId(mostRecent.id)
      const t = setTimeout(() => setNewId(null), 3000)
      if (!comments[mostRecent.id] && !loading[mostRecent.id]) {
        generateComment(mostRecent)
      }
      return () => clearTimeout(t)
    }
  }, [picks, draftOrder])

  async function generateComment(pick) {
    setLoading(prev => ({ ...prev, [pick.id]: true }))
    const pName = pick.playerName
    const pickInfo = pick.pick_type === 'driver'
      ? `${pick.drivers?.first_name} ${pick.drivers?.last_name}`
      : pick.constructors?.name
    
    const prompt = `Du bist ein Formel 1 Kommentator. ${pName} hat gerade ${pickInfo} für das Rennen in ${weekend?.name || 'dem nächsten GP'} ausgewählt. Schreib einen SEHR kurzen, fachkundigen und humorvollen Kommentar dazu (max 10 Wörter).`
    
    const text = await callGemini(prompt)
    if (text) setComments(prev => ({ ...prev, [pick.id]: text }))
    setLoading(prev => ({ ...prev, [pick.id]: false }))
  }

  return (
    <div className="draft-ticker">
      <div className="draft-ticker-header">
        <div className="draft-ticker-title">
          <Flag size={14} />
          <span>Live Ticker</span>
        </div>
        {!isDraftComplete && (
          <div className="draft-ticker-live">
            <span className="ticker-live-dot" />
            LIVE
          </div>
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
