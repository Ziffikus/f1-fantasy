import './LiveBetaPage.css'
import { useLiveTimingSession, TYRE_COLORS, TYRE_SHORT, TRACK_STATUS } from '../hooks/useLiveTimingSession'

function lapClass(status) {
  if (status === 4) return 'lb-col-time--purple'
  if (status === 2) return 'lb-col-time--green'
  return 'lb-col-time--normal'
}

function TrackBadge({ status }) {
  if (!status) return null
  const info = TRACK_STATUS[status.Status]
  if (!info) return null
  return (
    <span className="lb-track-badge" style={{ background: info.color + '22', color: info.color, border: `1px solid ${info.color}44` }}>
      {info.label}
    </span>
  )
}

function TyreBadge({ tyre }) {
  if (!tyre) return <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>–</span>
  const compound = tyre.Compound?.toUpperCase() ?? 'UNKNOWN'
  const color = TYRE_COLORS[compound] ?? TYRE_COLORS.UNKNOWN
  return (
    <span className="lb-tyre" style={{ background: color + '22', color, border: `1px solid ${color}44` }}>
      {TYRE_SHORT[compound] ?? '?'}
      {tyre.TotalLaps != null && <span className="lb-tyre-laps">+{tyre.TotalLaps}</span>}
    </span>
  )
}

function DriverRow({ d, isFirst }) {
  const rowClass = [
    'lb-row',
    isFirst     ? 'lb-row--leader'  : '',
    d.inPit     ? 'lb-row--pit'     : '',
    d.retired   ? 'lb-row--retired' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={rowClass}>
      <span className={`lb-cell-pos${isFirst ? ' lb-cell-pos--leader' : ''}`}>{d.position}</span>

      <div className="lb-cell-driver">
        <div className="lb-driver-stripe" style={{ background: `#${d.teamColour}`, opacity: d.retired ? 0.4 : 1 }} />
        <div className="lb-driver-info">
          <span className={`lb-driver-code${d.retired ? ' lb-driver-code--retired' : ''}`}>{d.driverCode}</span>
          <span className="lb-driver-team">{d.teamName}</span>
        </div>
        {d.retired && <span className="lb-tag lb-tag--dnf">DNF</span>}
        {!d.retired && d.inPit  && <span className="lb-tag lb-tag--pit">PIT</span>}
        {!d.retired && d.pitOut && <span className="lb-tag lb-tag--out">OUT</span>}
      </div>

      <span className="lb-cell-laps">{d.numberOfLaps || '–'}</span>

      <span className={`lb-cell-time ${lapClass(d.lastLapStatus)}`}>
        {d.lastLapTime || '–'}
      </span>

      <span className="lb-cell-best lb-cell-time lb-col-time--purple">
        {d.bestLapTime || '–'}
      </span>

      <span className={`lb-cell-gap${isFirst ? ' lb-cell-gap--leader' : ''}`}>
        {isFirst ? 'Leader' : (d.gapToLeader || '–')}
      </span>

      <span className={`lb-cell-interval${d.catching ? ' lb-catching' : ''}`}>
        {isFirst ? '–' : (d.interval || '–')}
      </span>

      <TyreBadge tyre={d.tyre} />
    </div>
  )
}

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

      {/* Header */}
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
            {lapCount?.CurrentLap && lapCount?.TotalLaps ? ` · Runde ${lapCount.CurrentLap} / ${lapCount.TotalLaps}` : ''}
          </p>
        )}

        <div className="lb-toolbar">
          <button className="btn btn-secondary btn-sm" onClick={refetch}>↻ Neu laden</button>
          {lastUpdate && <span className="lb-update-hint">Stand: {lastUpdate.toLocaleTimeString('de-AT')} · alle 15 Sek.</span>}
          <span className="lb-source">livetiming.formula1.com</span>
        </div>

        {error && <div className="lb-error">⚠ {error}</div>}
      </div>

      {/* Wetter */}
      {weather && (
        <div className="lb-weather">
          <span className="lb-chip">🌡 {weather.AirTemp}°C Luft</span>
          <span className="lb-chip">🏎 {weather.TrackTemp}°C Asphalt</span>
          <span className="lb-chip">💧 {weather.Humidity}%</span>
          <span className="lb-chip">🌬 {weather.WindSpeed} m/s</span>
          {parseFloat(weather.Rainfall) > 0 && <span className="lb-chip lb-chip--rain">🌧 Regen</span>}
        </div>
      )}

      {/* Timing Tabelle */}
      {drivers.length > 0 ? (
        <div className="lb-table">
          {/* Header */}
          <div className="lb-header-row">
            <span className="lb-cell-pos">#</span>
            <span className="lb-cell-driver">Fahrer</span>
            <span className="lb-cell-laps">Rnd</span>
            <span className="lb-cell-time">Letzte Runde</span>
            <span className="lb-cell-best">Beste Runde</span>
            <span className="lb-cell-gap">Gap</span>
            <span className="lb-cell-interval">Interval</span>
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

      {/* Race Control */}
      {raceControl.length > 0 && (
        <div className="lb-rc">
          <div className="lb-rc-title">Race Control</div>
          {[...raceControl].reverse().slice(0, 8).map((msg, i) => (
            <div key={i} className="lb-rc-item" style={{
              borderLeftColor:
                msg.Flag === 'RED'        ? '#ef4444' :
                msg.Flag === 'YELLOW'     ? '#ffd700' :
                msg.Flag === 'GREEN'      ? '#4ade80' :
                msg.Flag === 'CHEQUERED' ? '#ffffff' : 'var(--text-muted)',
            }}>
              {msg.Lap != null && <span className="lb-rc-lap">Runde {msg.Lap}</span>}
              <span className="lb-rc-msg">{msg.Message}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
