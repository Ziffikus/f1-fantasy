import { useEffect, useRef, useState } from 'react'
import { Car, Users, Flag, Mic } from 'lucide-react'

 Gemini API Konfiguration
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_MODEL = gemini-2.0-flash  Schnell, kostenlos und aktuell

function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('de-AT', {
    hour '2-digit', minute '2-digit', second '2-digit'
  })
}

 ── Gemini API Fetch Funktion ────────────────────────────
async function callGemini(prompt) {
  try {
    const res = await fetch(`httpsgenerativelanguage.googleapis.comv1betamodels${GEMINI_MODEL}generateContentkey=${API_KEY}`, {
      method 'POST',
      headers {
        'Content-Type' 'applicationjson',
      },
      body JSON.stringify({
        contents [{
          parts [{ text prompt }]
        }],
        generationConfig {
          maxOutputTokens 250,
          temperature 0.7,
        }
      })
    })
    
    const data = await res.json()
     Pfad zur Antwort candidates[0].content.parts[0].text
    const text = data.candidates.[0].content.parts.[0].text  ''
    return text.trim()
  } catch (error) {
    console.error(Gemini API Error, error)
    return ''
  }
}

 ── Intro beim Draft-Start ───────────────────────────────────
async function fetchIntro(weekend) {
  const gpName = weekend.city  'dem nächsten Grand Prix'
  const prompt = `Du bist ein F1-Fantasy-Draft-Moderator. 
Wir haben das Jahr 2026. Schreibe eine kurze, begeisterte Eröffnung (2-3 Sätze) auf Deutsch für den Draft zum ${gpName} Grand Prix. 
Nutze dein Wissen über die Strecke und aktuelle F1-Fakten. 
Antworte NUR mit dem Eröffnungstext.`
  return callGemini(prompt)
}

 ── Outro wenn Draft abgeschlossen ──────────────────────────
async function fetchOutro(weekend, totalPicks) {
  const gpName = weekend.city  'dem Grand Prix'
  const prompt = `Du bist ein F1-Fantasy-Draft-Moderator. 
Der Draft für den ${gpName} GP ist mit ${totalPicks} Picks beendet. 
Schreibe ein kurzes, cooles Schlusswort auf Deutsch (max 2 Sätze) und wünsche viel Erfolg. 
Antworte NUR mit dem Schlusstext.`
  return callGemini(prompt)
}

 ── Pick-Kommentar ───────────────────────────────────────────
async function fetchComment(pick, allPicks, draftOrder, weekend) {
  const playerName = draftOrder.find(o = o.profile_id === pick.profile_id)
    .profiles.display_name  'Ein Spieler'

  const pickName = pick.pick_type === 'driver'
     `${pick.drivers.first_name} ${pick.drivers.last_name} (${pick.drivers.constructors.short_name})`
     pick.constructors.short_name

  const gpName = weekend.city  'dem Grand Prix'

  const prompt = `Du bist ein F1-Sportkommentator. 
Der Spieler ${playerName} hat gerade ${pickName} für den ${gpName} GP gewählt. 
Schreibe einen kurzen, fachkundigen Kommentar dazu auf Deutsch (1-2 Sätze). 
Nenne konkrete sportliche Gründe für diesen Pick (Form, Strecke). 
Antworte NUR mit dem Kommentar.`

  return callGemini(prompt)
}

 ── TickerEntry & ModeratorMessage Komponenten bleiben identisch zu deinem Original ──
function TickerEntry({ entry, comment, isLoading, isNew }) {
  return (
    div className={`ticker-entry ${isNew  'ticker-entry--new'  ''}`}
      div className=ticker-entry-main
        span className=ticker-time{formatTime(entry.inserted_at)}span
        span className=ticker-pick-num#{entry.globalPickNumber}span
        span className=ticker-player{entry.playerName}span
        span className=ticker-arrow→span

        {entry.pick_type === 'driver'  (
          span className=ticker-pick ticker-pick--driver
            Car size={11} className=ticker-icon 
            span className=ticker-color-dot
              style={{ background entry.drivers.constructors.color  '#888' }} 
            span className=ticker-pick-name
              {entry.drivers.first_name} {entry.drivers.last_name}
            span
            span className=ticker-pick-abbr{entry.drivers.abbreviation}span
          span
        )  (
          span className=ticker-pick ticker-pick--constructor
            Users size={11} className=ticker-icon 
            span className=ticker-color-dot
              style={{ background entry.constructors.color  '#888' }} 
            span className=ticker-pick-name{entry.constructors.short_name}span
          span
        )}
      div

      {(comment  isLoading) && (
        div className=ticker-comment
          Mic size={10} className=ticker-comment-icon 
          {isLoading
             span className=ticker-comment-loadingspan span span span
             span className=ticker-comment-text{comment}span
          }
        div
      )}
    div
  )
}

function ModeratorMessage({ text, isLoading, type }) {
  return (
    div className={`ticker-moderator ticker-moderator--${type}`}
      Mic size={11} className=ticker-comment-icon 
      {isLoading
         span className=ticker-comment-loadingspan span span span
         span className=ticker-moderator-text{text}span
      }
    div
  )
}

export default function DraftTicker({ picks, draftOrder, isDraftComplete, weekend }) {
  const listRef       = useRef(null)
  const prevLengthRef = useRef(0)
  const outroSentRef  = useRef(false)

  const [comments,     setComments]     = useState({})
  const [loading,      setLoading]      = useState({})
  const [newId,        setNewId]        = useState(null)
  const [intro,        setIntro]        = useState(null)
  const [introLoading, setIntroLoading] = useState(false)
  const [outro,        setOutro]        = useState(null)
  const [outroLoading, setOutroLoading] = useState(false)

  const entries = [...picks]
    .sort((a, b) = new Date(a.inserted_at  0) - new Date(b.inserted_at  0))
    .map((p, i) = ({
      ...p,
      playerName draftOrder.find(o = o.profile_id === p.profile_id)
        .profiles.display_name  '',
      globalPickNumber i + 1,
    }))

  useEffect(() = {
    if (entries.length  0 && intro === null && !introLoading) {
      setIntroLoading(true)
      fetchIntro(weekend)
        .then(text = setIntro(text))
        .catch(() = setIntro(''))
        .finally(() = setIntroLoading(false))
    }
  }, [entries.length])

  useEffect(() = {
    if (entries.length = prevLengthRef.current) return
    const newest = entries[entries.length - 1]
    if (!newest  comments[newest.id] !== undefined) return

    prevLengthRef.current = entries.length
    setNewId(newest.id)
    setTimeout(() = setNewId(null), 2000)

    setLoading(prev = ({ ...prev, [newest.id] true }))
    fetchComment(newest, entries, draftOrder, weekend)
      .then(text = setComments(prev = ({ ...prev, [newest.id] text })))
      .catch(() = setComments(prev = ({ ...prev, [newest.id] '' })))
      .finally(() = setLoading(prev = ({ ...prev, [newest.id] false })))
  }, [entries.length])

  useEffect(() = {
    if (isDraftComplete && !outroSentRef.current && outro === null) {
      outroSentRef.current = true
      setOutroLoading(true)
      fetchOutro(weekend, entries.length)
        .then(text = setOutro(text))
        .catch(() = setOutro(''))
        .finally(() = setOutroLoading(false))
    }
  }, [isDraftComplete])

  useEffect(() = {
    if (listRef.current)
      listRef.current.scrollTop = listRef.current.scrollHeight
  }, [entries.length, outro, Object.keys(comments).length])

  if (entries.length === 0 && !isDraftComplete) return null

  return (
    div className=draft-ticker
      div className=draft-ticker-header
        span className=draft-ticker-titleFlag size={13}  Live Ticker (Gemini Powered)span
        {!isDraftComplete && span className=draft-ticker-livespan className=ticker-live-dot  LIVEspan}
        {isDraftComplete  && span className=draft-ticker-done✅ Abgeschlossenspan}
        span className=draft-ticker-count{entries.length} Picksspan
      div
      div className=draft-ticker-list ref={listRef}
        {(intro  introLoading) && ModeratorMessage text={intro} isLoading={introLoading} type=intro }
        {entries.map(entry = (
          TickerEntry key={entry.id} entry={entry} comment={comments[entry.id]} isLoading={loading[entry.id]} isNew={entry.id === newId} 
        ))}
        {(outro  outroLoading) && ModeratorMessage text={outro} isLoading={outroLoading} type=outro }
      div
    div
  )
}