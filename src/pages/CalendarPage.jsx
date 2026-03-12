import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { MapPin, Clock } from 'lucide-react'
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

export default function CalendarPage() {
  const { weekends, loading } = useRaceWeekends()
  const [expanded, setExpanded] = useState(null)
  const now = new Date()

  const past = weekends.filter(w => new Date(w.race_start) < now)
  const upcoming = weekends.filter(w => new Date(w.race_start) >= now)

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  )

  function RaceCard({ w }) {
    const isExpanded = expanded === w.id
    const isPast = new Date(w.race_start) < now
    const isNext = upcoming[0]?.id === w.id

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
          <div className="cal-sessions">
            <div className="cal-sessions-inner">
              <SessionRow label="FP1" dateStr={w.fp1_start} />
              {w.is_sprint_weekend ? (
                <>
                  <SessionRow label="Sprint Qualifying" dateStr={w.sprint_quali_start} />
                  <SessionRow label="Sprint" dateStr={w.sprint_start} />
                </>
              ) : (
                <>
                  <SessionRow label="FP2" dateStr={w.fp2_start} />
                  <SessionRow label="FP3" dateStr={w.fp3_start} />
                </>
              )}
              <SessionRow label="Qualifying" dateStr={w.qualifying_start} />
              <SessionRow label="Rennen 🏁" dateStr={w.race_start} />
            </div>
            <div className="cal-sessions-footer">
              <span className="cal-circuit">
                <Clock size={11} /> {w.circuit}
              </span>
              <Link to={`/rennen/${w.id}`} className="btn btn-secondary btn-sm">
                Details
              </Link>
            </div>
          </div>
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
