import { useEffect, useRef, useState } from 'react'
import { Car, Users, Flag, Mic } from 'lucide-react'

// Gemini API Konfiguration
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_MODEL = "gemini-2.0-flash" // v2

function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('de-AT', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

// ── Gemini API Fetch Funktion ────────────────────────────
async function callGemini(prompt) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 250, temperature: 0.7 }
      })
    })
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  } catch (error) {
    console.error("Gemini API Error:", error)
    return ''
  }
}

async function fetchIntro(weekend) {
  const gpName = weekend?.city ?? 'dem nächsten Grand Prix'
  const prompt = `Du bist ein F1-Fantasy-Draft-Moderator. Wir haben das Jahr 2026. Schreibe eine kurze, begeisterte Eröffnung (2-3 Sätze) auf Deutsch für den Draft zum ${gpName} Grand Prix. Antworte NUR mit dem Eröffnungstext.`
  return callGemini(prompt)
}

async function fetchOutro(weekend, totalPicks) {
  const gpName = weekend?.city ?? 'dem Grand Prix'
  const prompt = `Du bist ein F1-Fantasy-Draft-Moderator. Der Draft für den ${gpName} GP ist mit ${totalPicks} Picks beendet. Schreibe ein kurzes, cooles Schlusswort auf Deutsch (max 2 Sätze) und wünsche viel Erfolg. Antworte NUR mit dem Schlusstext.`
  return callGemini(prompt)
}

async function fetchComment(pick, draftOrder, weekend) {
  const playerName = draftOrder.find(o => o.profile_id === pick.profile_id)?.profiles?.display_name ?? 'Ein Spieler'
  const pickName = pick.pick_type === 'driver' ? `${pick.drivers?.first_name} ${pick.drivers?.last_name}` : pick.constructors?.short_name
  const gpName = weekend?.city ?? 'dem Grand Prix'
  const prompt = `Du bist ein F1-Sportkommentator. Spieler ${playerName} hat "${pickName}" für den ${gpName} GP gewählt. Schreibe einen kurzen Kommentar dazu auf Deutsch (1-2 Sätze). Antworte NUR mit dem Kommentar.`
  return callGemini(prompt)
}

// ── TickerEntry Komponente ──────────────────────────────────
function TickerEntry({ entry, comment, isLoading, isNew }) {
  return (
    <div className={`ticker-entry ${isNew ? 'ticker-entry--new' : ''}`}>
      <div className="ticker-entry-main">
        <span className="ticker-time">{formatTime(entry.inserted_at)}</span>
        <span className="ticker-pick-num">#{entry.globalPickNumber}</span>
        <span className="ticker-player">{entry.playerName}</span>
        <span className="ticker-arrow">→</span>
        <span className="ticker-pick">
          {entry.pick_type === 'driver' ? <Car size={11} className="ticker-icon" /> : <Users size={11} className="ticker-icon" />}
          <span className="ticker-color-dot" style={{ background: (entry.drivers?.constructors?.color || entry.constructors?.color) ?? '#888' }} />
          <span className="ticker-pick-name">{entry.pick_type === 'driver' ? `${entry.drivers?.first_name} ${entry.drivers?.last_name}` : entry.constructors?.short_name}</span>
        </span>
      </div>
      {(comment || isLoading) && (
        <div className="ticker-comment">
          <Mic size={10} className="ticker-comment-icon" />
          {isLoading ? <span className="ticker-comment-loading"><span /><span /><span /></span> : <span className="ticker-comment-text">{comment}</span>}
        </div>
      )}
    </div>
  )
}

function ModeratorMessage({ text, isLoading, type }) {
  return (
    <div className={`ticker-moderator ticker-moderator--${type}`}>
      <Mic size={11} className="ticker-comment-icon" />
      {isLoading ? <span className="ticker-comment-loading"><span /><span /><span /></span> : <span className="ticker-moderator-text">{text}</span>}
    </div>
  )
}

export default function DraftTicker({ picks, draftOrder, isDraftComplete, weekend }) {
  const listRef = useRef(null)
  const prevLengthRef = useRef(picks.length)
  const [comments, setComments] = useState({})
  const [loading, setLoading] = useState({})
  const [newId, setNewId] = useState(null)
  const [intro, setIntro] = useState(null)
  const [outro, setOutro] = useState(null)

  const entries = [...picks]
    .sort((a, b) => new Date(a.inserted_at ?? 0) - new Date(b.inserted_at ?? 0))
    .map((p, i) => ({
      ...p,
      playerName: draftOrder.find(o => o.profile_id === p.profile_id)?.profiles?.display_name ?? '?',
      globalPickNumber: i + 1,
    }))

  // Intro nur wenn gerade ein Draft läuft
  useEffect(() => {
    if (entries.length > 0 && intro === null) fetchIntro(weekend).then(setIntro)
  }, [entries.length])

  // Nur auf NEUE Picks reagieren
  useEffect(() => {
    if (entries.length > prevLengthRef.current) {
      const newest = entries[entries.length - 1]
      prevLengthRef.current = entries.length
      
      setNewId(newest.id)
      setTimeout(() => setNewId(null), 2000)
      
      setLoading(prev => ({ ...prev, [newest.id]: true }))
      fetchComment(newest, draftOrder, weekend)
        .then(text => setComments(prev => ({ ...prev, [newest.id]: text })))
        .finally(() => setLoading(prev => ({ ...prev, [newest.id]: false })))
    }
  }, [entries.length])

  useEffect(() => {
    if (isDraftComplete && !outro) fetchOutro(weekend, entries.length).then(setOutro)
  }, [isDraftComplete])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [entries.length, comments, intro, outro])

  if (entries.length === 0 && !isDraftComplete) return null

  return (
    <div className="draft-ticker">
      <div className="draft-ticker-header">
        <span className="draft-ticker-title"><Flag size={13} /> Live Ticker (Gemini 2.0)</span>
        {!isDraftComplete && <span className="draft-ticker-live"><span className="ticker-live-dot" /> LIVE</span>}
        <span className="draft-ticker-count">{entries.length} Picks</span>
      </div>
      <div className="draft-ticker-list" ref={listRef}>
        {intro && <ModeratorMessage text={intro} type="intro" />}
        {entries.map(entry => (
          <TickerEntry key={entry.id} entry={entry} comment={comments[entry.id]} isLoading={loading[entry.id]} isNew={entry.id === newId} />
        ))}
        {outro && <ModeratorMessage text={outro} type="outro" />}
      </div>
    </div>
  )
}