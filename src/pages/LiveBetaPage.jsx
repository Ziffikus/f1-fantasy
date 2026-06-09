import './LiveBetaPage.css'
import '../pages/LivePage.css'   // live-tyre, live-rc-*, live-weather-chip etc.
import { useLiveTimingSession, TYRE_COLORS, TYRE_SHORT, TRACK_STATUS } from '../hooks/useLiveTimingSession'

// ─── Lap Status → CSS class ──────────────────────────────────
function lapClass(status) {
  if (status === 4) return 'lb-col-time--purple'
  if (status === 2) return 'lb-col-time--green'
  return 'lb-col-time--normal'
}

// ─── Track Status Badge ──────────────────────────────────────
function TrackBadge({ status }) {
  if (!status) return null
  const info = TRACK_STATUS[status.Status]
  if (!info) return null
  return (
    <span
      className="lb-track-badge"
      style={{
        background: info.color + '22',
        color: info.color,
        border: `1px solid ${info.color}44`,
      }}
    >
      {info.label}
    </span>
  )
}

// ─── Tyre Badge ───────────────────────────────────────────────
function TyreBadge({ tyre }) {
  if (!tyre) return <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>–</span>
  const compound = tyre.Compound?.toUpperCase() ?? 'UNKNOWN'
  const color    = TYRE_COLORS[compound] ?? TYRE_COLORS.UNKNOWN
  return (
    <span
      className="live-tyre"
      style={{ background: color + '22', color, border: `1px solid ${color}44` }}
    >
      {TYRE_SHORT[compound] ?? '?'}
      {tyre.TotalLaps != null && (
        <span className="live-tyre-lap">+{tyre.TotalLaps}</span>
      )}
    </span>
  )
}

// ─── Fahrer-Zeile ─────────────────────────────────────────────
function DriverRow({ d, isFirst }) {
  return (
    <div
      className={[
        'lb-table-row',
        isFirst  ? 'lb-table-row--leader' : '',
        d.inPit  ? 'lb-table-row--pit'    : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Pos */}
      <span className={`lb-col-pos${isFirst ? ' lb-col-pos--leader' : ''}`}>
        {d.position}
      </span>

      {/* Fahrer */}
      <div className="lb-col-driver">
        <div
          className="lb-driver-stripe"
          style={{ background: `#${d.teamColour}` }}
        />
        <div style={{ minWidth: 0 }}>
          <div className="lb-driver-code">{d.driverCode}</div>
          <div className="lb-driver-team">{d.teamName}</div>
        </div>
        {d.inPit  && <span className="lb-pit-tag">PIT</span>}
        {d.pitOut && <span className="lb-out-tag">OUT</span>}
      </div>

      {/* Runden */}
      <span className="lb-col-laps">{d.numberOfLaps || '–'}</span>

      {/* Letzte Runde */}
      <span className={`lb-col-time ${lapClass(d.lastLapStatus)}`}>
        {d.lastLapTime || '–'}
      </span>

      {/* Beste Runde */}
      <span className="lb-col-time lb-col-best lb-col-time--purple">
        {d.bestLapTime || '–'}
      </span>

      {/* Gap */}
      {isFirst
        ? <span className="lb-col-gap lb-col-gap--leader">Leader</span>
        : <span className="lb-col-gap">{d.gapToLeader || '–'}</span>
      }

      {/* Interval */}
      <span
        className={`lb-col-gap lb-col-interval${d.catching ? ' lb-col-catching' : ''}`}
      >
        {isFirst ? '–' : (d.interval || '–')}
      </span>

      {/* Reifen */}
      <TyreBadge tyre={d.tyre} />
    </div>
  )
}

// ─── Hauptkomponente ──────────────────────────────────────────
export default function LiveBetaPage() {
  const {
    session, isLive, loading, lastUpdate, error,
    weather, trackStatus, lapCount, raceControl,
    getDriversRanked, refetch,
  } = useLiveTimingSession()

  const drivers = getDriversRanked()

  if (loading) return (
    <div className="container" style={{ paddingTop: '4rem', display: 'flex', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="container page-enter" style={{ padding: '1.25rem 1rem' }}>

      {/* ── Header ── */}
      <div className="lb-header">
        <div className="lb-title-row">
          <h1 className="lb-title">Live</h1>
          <span className="lb-badge-beta">Beta · F1 Timing</span>

          {isLive
            ? <span className="badge badge-live">● Live</span>
            : <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Archiv</span>
          }

          <TrackBadge status={trackStatus} />
        </div>

        {session && (
          <p className="lb-meta">
            {session.Meeting?.Name} · {session.Name}
            {lapCount?.CurrentLap && lapCount?.TotalLaps
              ? ` · Runde ${lapCount.CurrentLap} / ${lapCount.TotalLaps}`
              : ''}
          </p>
        )}

        <div className="lb-toolbar">
          <button className="btn btn-secondary btn-sm" onClick={refetch}>
            ↻ Neu laden
          </button>
          {lastUpdate && (
            <span className="lb-update-hint">
              Stand: {lastUpdate.toLocaleTimeString('de-AT')} · alle 15 Sek.
            </span>
          )}
          <span className="lb-toolbar-right">livetiming.formula1.com</span>
        </div>

        {error && <div className="lb-error">⚠ {error}</div>}
      </div>

      {/* ── Wetter ── */}
      {weather && (
        <div className="lb-weather">
          <span className="live-weather-chip">🌡 {weather.AirTemp}°C Luft</span>
          <span className="live-weather-chip">🏎 {weather.TrackTemp}°C Asphalt</span>
          <span className="live-weather-chip">💧 {weather.Humidity}%</span>
          <span className="live-weather-chip">🌬 {weather.WindSpeed} m/s</span>
          {parseFloat(weather.Rainfall) > 0 && (
            <span className="live-weather-chip live-weather-chip--rain">🌧 Regen</span>
          )}
        </div>
      )}

      {/* ── Timing Tabelle ── */}
      {drivers.length > 0 ? (
        <div className="lb-table-wrap">
          <div className="lb-table-header">
            <span style={{ textAlign: 'center' }}>#</span>
            <span>Fahrer</span>
            <span style={{ textAlign: 'center' }}>Rnd</span>
            <span style={{ textAlign: 'right' }}>Letzte Runde</span>
            <span className="lb-col-best" style={{ textAlign: 'right' }}>Beste Runde</span>
            <span style={{ textAlign: 'right' }}>Gap</span>
            <span className="lb-col-interval" style={{ textAlign: 'right' }}>Interval</span>
            <span>Reifen</span>
          </div>

          {drivers.map((d, i) => (
            <DriverRow key={d.racingNumber} d={d} isFirst={i === 0} />
          ))}
        </div>
      ) : (
        <div className="lb-empty">
          <span className="lb-empty-icon">📡</span>
          <span className="lb-empty-title">Keine Timing-Daten verfügbar</span>
          <span className="lb-empty-sub">Daten erscheinen wenn eine Session aktiv ist</span>
        </div>
      )}

      {/* ── Race Control ── */}
      {raceControl.length > 0 && (
        <div>
          <div className="lb-rc-title">Race Control</div>
          <div className="live-rc-list">
            {[...raceControl].reverse().slice(0, 8).map((msg, i) => (
              <div
                key={i}
                className="live-rc-item"
                style={{
                  borderLeftColor:
                    msg.Flag === 'RED'    ? '#ef4444' :
                    msg.Flag === 'YELLOW' ? '#ffd700' :
                    msg.Flag === 'GREEN'  ? '#4ade80' :
                    msg.Flag === 'CHEQUERED' ? '#fff'  :
                    'var(--text-muted)',
                }}
              >
                {msg.Lap != null && (
                  <span className="live-rc-time">Runde {msg.Lap}</span>
                )}
                <span className="live-rc-msg">{msg.Message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
