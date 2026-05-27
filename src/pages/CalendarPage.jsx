import { useState, useEffect } from 'react'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { useSessionResults } from '../hooks/useSessionResults'
import { useDraft } from '../hooks/useDraft'
import TrackMap from '../components/ui/TrackMap'
import { MapPin, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import './CalendarPage.css'

function formatDate(dateStr) {
  if (!dateStr) return '–'
  return new Date(dateStr).toLocaleString('de-AT', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })
}

function SessionRow({ label, dateStr }) {
  if (!dateStr) return null
  return (
    <div className="cal-session-row">
      <span className="cal-session-label">{label}</span>
      <span className="cal-session-time">{formatDate(dateStr)}</span>
    </div>
  )
}

// ── Countdown-Timer — exportiert damit GamingPage ihn mitnutzen kann ──────────
export function RaceCountdown({ targetDate, raceName, flag }) {
  const [diff, setDiff] = useState(targetDate - Date.now())

  useEffect(() => {
    const id = setInterval(() => setDiff(targetDate - Date.now()), 1000)
    return () => clearInterval(id)
  }, [targetDate])

  if (diff <= 0) return null

  const days    = Math.floor(diff / 86400000)
  const hours   = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000)  / 60000)
  const seconds = Math.floor((diff % 60000)    / 1000)

  const pad = (n) => String(n).padStart(2, '0')

  return (
    <div className="cal-countdown">
      <div className="cal-countdown-label">
        {flag} Nächstes Rennen: <strong>{raceName}</strong>
      </div>
      <div className="cal-countdown-timer">
        <div className="cal-countdown-unit">
          <span className="cal-countdown-value">{days}</span>
          <span className="cal-countdown-unit-label">Tage</span>
        </div>
        <span className="cal-countdown-sep">:</span>
        <div className="cal-countdown-unit">
          <span className="cal-countdown-value">{pad(hours)}</span>
          <span className="cal-countdown-unit-label">Std</span>
        </div>
        <span className="cal-countdown-sep">:</span>
        <div className="cal-countdown-unit">
          <span className="cal-countdown-value">{pad(minutes)}</span>
          <span className="cal-countdown-unit-label">Min</span>
        </div>
        <span className="cal-countdown-sep">:</span>
        <div className="cal-countdown-unit">
          <span className="cal-countdown-value">{pad(seconds)}</span>
          <span className="cal-countdown-unit-label">Sek</span>
        </div>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const { weekends, loading, error } = useRaceWeekends()
  const [expanded, setExpanded] = useState(null)
  const now = new Date()

  const past     = weekends.filter(w => new Date(w.race_start) < now)
  const upcoming = weekends.filter(w => new Date(w.race_start) >= now)
  const nextRace = upcoming[0] ?? null

  if (error) return (
    <div style={{ padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
      ⚠️ Fehler beim Laden: {error?.message ?? String(error)}
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  )

  function PastRaceExpanded({ w }) {
    const { fetchSession, results, loading: sLoading, error: sError, activeKey } = useSessionResults(w)
    const { picks, draftOrder, loading: dLoading } = useDraft(w.id)

    const sessions = w.is_sprint_weekend
      ? ['fp1', 'sprint_quali', 'sprint', 'qualifying', 'race']
      : ['fp1', 'fp2', 'fp3', 'qualifying', 'race']
    const SESSION_LABELS = {
      fp1: 'FP1', fp2: 'FP2', fp3: 'FP3',
      sprint_quali: 'Sprint Qualifying', sprint: 'Sprint',
      qualifying: 'Qualifying', race: 'Rennen 🏁',
    }

    // Picks & Punkte gruppiert nach Spieler
    const playerData = draftOrder.map(order => {
      const playerPicks = picks.filter(p => p.profile_id === order.profile_id)
      const drivers = playerPicks.filter(p => p.pick_type === 'driver')
      const constructors = playerPicks.filter(p => p.pick_type === 'constructor')
      return { order, drivers, constructors }
    })

    return (
      <div className="cal-sessions">
        {/* ── Session-Ergebnisse ── */}
        <div className="cal-sessions-inner">
          <div className="cal-past-sessions-header">Session-Ergebnisse</div>
          <div className="cal-session-tabs">
            {sessions.map(key => {
              const dateField = {
                fp1: 'fp1_start', fp2: 'fp2_start', fp3: 'fp3_start',
                sprint_quali: 'sprint_quali_start', qualifying: 'qualifying_start',
                sprint: 'sprint_start', race: 'race_start',
              }[key]
              if (!w[dateField]) return null
              return (
                <button
                  key={key}
                  className={`cal-session-tab ${activeKey === key ? 'cal-session-tab--active' : ''}`}
                  onClick={() => fetchSession(key)}
                >
                  {SESSION_LABELS[key]}
                </button>
              )
            })}
          </div>

          {sLoading && <div className="cal-past-loading">Laden…</div>}
          {sError && <div className="cal-past-error">{sError}</div>}
          {!sLoading && !sError && results.length > 0 && (
            <div className="cal-results-list">
              {results.map(r => (
                <div key={r.driver_number} className="cal-result-row">
                  <span className="cal-result-pos">{r.position}</span>
                  <span
                    className="cal-result-dot"
                    style={{ background: r.team_colour }}
                  />
                  <span className="cal-result-abbr">{r.abbreviation}</span>
                  <span className="cal-result-team">{r.team_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Picks & Punkte ── */}
        {playerData.length > 0 && (
          <div className="cal-past-picks">
            <div className="cal-past-sessions-header">Picks</div>
            {dLoading
              ? <div className="cal-past-loading">Laden…</div>
              : (
                <div className="cal-picks-grid">
                  {playerData.map(({ order, drivers, constructors }) => (
                    <div key={order.profile_id} className="cal-pick-player">
                      <div className="cal-pick-player-name">
                        {order.profiles?.display_name ?? '–'}
                      </div>
                      <div className="cal-pick-items">
                        {drivers.map(p => (
                          <span key={p.id} className="cal-pick-chip cal-pick-chip--driver">
                            {p.drivers?.abbreviation ?? '–'}
                          </span>
                        ))}
                        {constructors.map(p => (
                          <span key={p.id} className="cal-pick-chip cal-pick-chip--team"
                            style={{ borderColor: p.constructors?.color ?? undefined }}>
                            {p.constructors?.short_name ?? '–'}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        )}

        {/* ── Track + Circuit ── */}
        <div className="cal-sessions-track">
          <TrackMap round={w.round} size="md" />
        </div>
        <div className="cal-sessions-footer">
          <span className="cal-circuit">
            <Clock size={11} /> {w.circuit}
          </span>
        </div>
      </div>
    )
  }

  function RaceCard({ w }) {
    const isExpanded = expanded === w.id
    const isPast     = new Date(w.race_start) < now
    const isNext     = upcoming[0]?.id === w.id

    return (
      <div className={`cal-card ${isPast ? 'cal-card--past' : ''} ${isNext ? 'cal-card--next' : ''}`}>
        <button className="cal-card-header" onClick={() => setExpanded(isExpanded ? null : w.id)}>
          <span className="cal-round">R{w.round}</span>
          <span className="cal-flag">{w.flag_emoji}</span>
          <div className="cal-info">
            <span className="cal-race-name">{w.name}</span>
            <span className="cal-location">
              <MapPin size={11} /> {w.city}, {w.country}
            </span>
          </div>
          <div className="cal-right">
            {w.is_sprint_weekend && <span className="badge badge-sprint">Sprint</span>}
            {isNext && <span className="badge badge-live">Next</span>}
            <span className="cal-race-date">
              {new Date(w.race_start).toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })}
            </span>
            <span className="cal-chevron">{isExpanded ? '▲' : '▼'}</span>
          </div>
        </button>

        {isExpanded && (
          isPast ? (
            <PastRaceExpanded w={w} />
          ) : (
            <div className="cal-sessions">
              <div className="cal-sessions-inner">
                <SessionRow label="FP1" dateStr={w.fp1_start} />
                {w.is_sprint_weekend ? (
                  <>
                    <SessionRow label="Sprint Qualifying" dateStr={w.sprint_quali_start} />
                    <SessionRow label="Sprint"            dateStr={w.sprint_start} />
                  </>
                ) : (
                  <>
                    <SessionRow label="FP2" dateStr={w.fp2_start} />
                    <SessionRow label="FP3" dateStr={w.fp3_start} />
                  </>
                )}
                <SessionRow label="Qualifying" dateStr={w.qualifying_start} />
                <SessionRow label="Rennen 🏁"  dateStr={w.race_start} />
              </div>
              <div className="cal-sessions-track">
                <TrackMap round={w.round} size="md" />
              </div>
              <div className="cal-sessions-footer">
                <span className="cal-circuit">
                  <Clock size={11} /> {w.circuit}
                </span>
              </div>
            </div>
          )
        )}
      </div>
    )
  }

  return (
    <div className="calendar-page page-enter">
      <h1>Kalender 2026</h1>
      <p className="text-secondary" style={{ marginTop: '0.3rem', marginBottom: '1.5rem' }}>
        {weekends.length} Rennen · {weekends.filter(w => w.is_sprint_weekend).length} Sprint-Wochenenden
        · Alle Zeiten in Ortszeit ({Intl.DateTimeFormat().resolvedOptions().timeZone})
      </p>

      {nextRace && (
        <RaceCountdown
          targetDate={new Date(nextRace.race_start).getTime()}
          raceName={nextRace.name}
          flag={nextRace.flag_emoji}
        />
      )}

      {upcoming.length > 0 && (
        <section className="cal-section">
          <h3 className="cal-section-title">Kommende Rennen</h3>
          <div className="cal-list">
            {upcoming.map(w => <RaceCard key={w.id} w={w} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="cal-section">
          <h3 className="cal-section-title text-muted">Vergangene Rennen</h3>
          <div className="cal-list">
            {[...past].reverse().map(w => <RaceCard key={w.id} w={w} />)}
          </div>
        </section>
      )}
    </div>
  )
}
