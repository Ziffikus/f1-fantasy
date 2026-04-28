import { useEffect, useRef, useState } from 'react'
import { Car, Users, Flag, Mic } from 'lucide-react'

function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('de-AT', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

async function fetchComment(pick, allPicks, draftOrder) {
  const playerName = draftOrder.find(o => o.profile_id === pick.profile_id)
    ?.profiles?.display_name ?? 'Ein Spieler'

  const pickName = pick.pick_type === 'driver'
    ? `${pick.drivers?.first_name} ${pick.drivers?.last_name} (${pick.drivers?.constructors?.short_name})`
    : pick.constructors?.short_name

  const pickNumber  = allPicks.length
  const isMilestone = pickNumber % 10 === 0
  const isFirst     = pickNumber === 1
  const isLast      = pickNumber >= draftOrder.length * 6

  const nextPlayer = (() => {
    const currentIdx = draftOrder.findIndex(o => o.profile_id === pick.profile_id)
    const next = draftOrder[(currentIdx + 1) % draftOrder.length]
    return next?.profiles?.display_name ?? null
  })()

  const prompt = `Du bist ein freundlicher, begeisterter F1-Fantasy-Draft-Moderator. 
Kommentiere diesen Pick auf Deutsch in 1-2 kurzen Sätzen. Fachbegriffe aus der Formel 1 auf Englisch sind erlaubt (z.B. "Pole Position", "Undercut", "Safety Car").
Sei positiv und neutral – kein Sarkasmus, nichts Gemeines.
${isFirst ? 'Es ist der allererste Pick des Drafts – eröffne den Draft entsprechend.' : ''}
${isLast ? 'Das ist der letzte Pick – schließe den Draft feierlich ab.' : ''}
${isMilestone ? `Es ist Pick Nummer ${pickNumber} – mach einen kurzen, ruhigen Zwischenstand-Kommentar ohne Spekulation.` : `Falls es passt, kannst du kurz spekulieren was ${nextPlayer ?? 'der nächste Spieler'} wohl als nächstes picken könnte.`}

Spieler: ${playerName}
Pick (${pick.pick_type === 'driver' ? 'Fahrer' : 'Team'}): ${pickName}
Pick Nummer: ${pickNumber}

Antworte NUR mit dem Kommentar, kein Präambel, keine Anführungszeichen.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  const data = await res.json()
  return data.content?.[0]?.text?.trim() ?? ''
}

function TickerEntry({ entry, comment, isLoading, isNew }) {
  return (
    <div className={`ticker-entry ${isNew ? 'ticker-entry--new' : ''}`}>
      <div className="ticker-entry-main">
        <span className="ticker-time">{formatTime(entry.inserted_at)}</span>
        <span className="ticker-pick-num">#{entry.globalPickNumber}</span>
        <span className="ticker-player">{entry.playerName}</span>
        <span className="ticker-arrow">→</span>

        {entry.pick_type === 'driver' ? (
          <span className="ticker-pick ticker-pick--driver">
            <Car size={11} className="ticker-icon" />
            <span className="ticker-color-dot"
              style={{ background: entry.drivers?.constructors?.color ?? '#888' }} />
            <span className="ticker-pick-name">
              {entry.drivers?.first_name} {entry.drivers?.last_name}
            </span>
            <span className="ticker-pick-abbr">{entry.drivers?.abbreviation}</span>
          </span>
        ) : (
          <span className="ticker-pick ticker-pick--constructor">
            <Users size={11} className="ticker-icon" />
            <span className="ticker-color-dot"
              style={{ background: entry.constructors?.color ?? '#888' }} />
            <span className="ticker-pick-name">{entry.constructors?.short_name}</span>
          </span>
        )}
      </div>

      {(comment || isLoading) && (
        <div className="ticker-comment">
          <Mic size={10} className="ticker-comment-icon" />
          {isLoading
            ? <span className="ticker-comment-loading"><span /><span /><span /></span>
            : <span className="ticker-comment-text">{comment}</span>
          }
        </div>
      )}
    </div>
  )
}

export default function DraftTicker({ picks, draftOrder, isDraftComplete }) {
  const listRef       = useRef(null)
  const prevLengthRef = useRef(0)
  const [comments, setComments] = useState({})
  const [loading,  setLoading]  = useState({})
  const [newId,    setNewId]    = useState(null)

  const entries = [...picks]
    .sort((a, b) => new Date(a.inserted_at ?? 0) - new Date(b.inserted_at ?? 0))
    .map((p, i) => ({
      ...p,
      playerName: draftOrder.find(o => o.profile_id === p.profile_id)
        ?.profiles?.display_name ?? '?',
      globalPickNumber: i + 1,
    }))

  useEffect(() => {
    if (entries.length <= prevLengthRef.current) return
    const newest = entries[entries.length - 1]
    if (!newest || comments[newest.id] !== undefined) return

    prevLengthRef.current = entries.length
    setNewId(newest.id)
    setTimeout(() => setNewId(null), 2000)

    setLoading(prev => ({ ...prev, [newest.id]: true }))
    fetchComment(newest, entries, draftOrder)
      .then(text => setComments(prev => ({ ...prev, [newest.id]: text })))
      .catch(()   => setComments(prev => ({ ...prev, [newest.id]: '' })))
      .finally(()  => setLoading(prev => ({ ...prev, [newest.id]: false })))
  }, [entries.length])

  useEffect(() => {
    if (listRef.current)
      listRef.current.scrollTop = listRef.current.scrollHeight
  }, [entries.length, Object.keys(comments).length])

  if (entries.length === 0 && !isDraftComplete) return null

  return (
    <div className="draft-ticker">
      <div className="draft-ticker-header">
        <span className="draft-ticker-title"><Flag size={13} /> Live Ticker</span>
        {!isDraftComplete && <span className="draft-ticker-live"><span className="ticker-live-dot" /> LIVE</span>}
        {isDraftComplete  && <span className="draft-ticker-done">✅ Abgeschlossen</span>}
        <span className="draft-ticker-count">{entries.length} Picks</span>
      </div>

      <div className="draft-ticker-list" ref={listRef}>
        {entries.length === 0
          ? <div className="ticker-empty">Noch keine Picks – Draft startet gleich…</div>
          : entries.map(entry => (
              <TickerEntry
                key={entry.id}
                entry={entry}
                comment={comments[entry.id]}
                isLoading={loading[entry.id]}
                isNew={entry.id === newId}
              />
            ))
        }
      </div>
    </div>
  )
}
