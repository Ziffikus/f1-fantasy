import { useState } from 'react'
import { RefreshCw, Thermometer, Droplets, Wind, CloudRain, Flag, Timer } from 'lucide-react'
import { useLiveSession, formatLapTime, formatSector, getSessionCategory } from '../hooks/useLiveSession'
import './LivePage.css'

const TYRE_COLOR = {
  SOFT: '#E8002D', MEDIUM: '#FFF200', HARD: '#FFFFFF',
  INTERMEDIATE: '#39B54A', WET: '#0067FF',
}
const TYRE_SHORT = {
  SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W',
}
const RC_COLOR = {
  'GREEN FLAG': '#4ade80',
  'YELLOW FLAG': '#fbbf24',
  'RED FLAG': '#ef4444',
  'SAFETY CAR': '#f97316',
  'VIRTUAL SAFETY CAR': '#f97316',
  'CHEQUERED FLAG': '#fff',
}

function TyreBadge({ compound, lap }) {
  const color = TYRE_COLOR[compound] ?? '#888'
  const short = TYRE_SHORT[compound] ?? '?'
  const dark = compound === 'HARD' || compound === 'MEDIUM'
  return (
    <span className="live-tyre" style={{ background: color, color: dark ? '#000' : '#fff' }}>
      {short}
      {lap != null && <span className="live-tyre-lap">+{lap}</span>}
    </span>
  )
}

function EmptyState({ label }) {
  return <p className="live-empty-state">{label}</p>
}

// ── Sektor-Badge ──────────────────────────────────────────────
// Lila = Session-Bestzeit, Grün = Persönliche Bestzeit, normal = keine Auszeichnung
function SectorBadge({ time, isSessionBest, isPersonalBest }) {
  if (!time) return <span className="live-sector live-sector--empty">–</span>
  const cls = isSessionBest
    ? 'live-sector live-sector--purple'
    : isPersonalBest
      ? 'live-sector live-sector--green'
      : 'live-sector'
  return <span className={cls}>{formatSector(time)}</span>
}

export default function LivePage() {
  const {
    session, positions, weather, currentLap, raceControl,
    loading, lastUpdate, isLive,
    getCurrentTyre, getInterval, getDriver,
    getBestLap, getLastLap, getLapTimesRanked,
    getBestSectors, getSessionBestSectors,
    refetch,
  } = useLiveSession()

  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const sessionLabel = {
    'Practice 1': 'FP1', 'Practice 2': 'FP2', 'Practice 3': 'FP3',
    'Qualifying': 'Qualifying', 'Sprint': 'Sprint',
    'Sprint Qualifying': 'Sprint Qualifying', 'Race': 'Rennen',
  }[session?.session_name] ?? session?.session_name ?? null

  // Kategorie bestimmt wie Lap-Daten angezeigt werden
  const sessionCategory = getSessionCategory(session?.session_name)
  const isQualifying = sessionCategory === 'qualifying' || sessionCategory === 'practice'
  const isRace       = sessionCategory === 'race'

  const hasWeather    = !!weather
  const hasPositions  = positions.length > 0
  const hasRaceControl = raceControl?.length > 0

  // Lap-Daten aufbereiten
  const lapTimesRanked    = getLapTimesRanked()
  const hasLapTimes       = lapTimesRanked.length > 0
  const sessionBestSectors = getSessionBestSectors()
  const raining = weather?.rainfall > 0

  return (
    <div className="live-page-root">
      {/* Header */}
      <div className="live-page-header">
        <div>
          <h1 className="live-page-title">Live</h1>
          <p className="live-page-subtitle">
            {session
              ? `${session.location}${sessionLabel ? ` · ${sessionLabel}` : ''}${currentLap > 0 ? ` · Runde ${currentLap}` : ''}`
              : 'Kein aktives Rennen'}
          </p>
        </div>
        <div className="live-page-header-right">
          {isLive && <span className="live-badge"><span className="live-dot" /> LIVE</span>}
          <button className="btn btn-secondary live-refresh-btn" onClick={handleRefresh} disabled={refreshing || loading}>
            <RefreshCw size={13} className={refreshing || loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {lastUpdate && (
        <p className="live-update-hint">
          Aktualisiert: {lastUpdate.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          {' '}· alle 15 Sek. automatisch
        </p>
      )}

      <div className="live-page-content">

        {/* Wetter */}
        <div className="live-weather card">
          <div className="live-weather-title">🌤 Wetter</div>
          {hasWeather ? (
            <div className="live-weather-grid">
              <div className="live-weather-item">
                <Thermometer size={13} />
                <div>
                  <span className="live-weather-val">{weather.air_temperature?.toFixed(1)}°</span>
                  <span className="live-weather-label">Luft</span>
                </div>
              </div>
              <div className="live-weather-item">
                <Thermometer size={13} style={{ color: '#f97316' }} />
                <div>
                  <span className="live-weather-val">{weather.track_temperature?.toFixed(1)}°</span>
                  <span className="live-weather-label">Strecke</span>
                </div>
              </div>
              <div className="live-weather-item">
                <Droplets size={13} />
                <div>
                  <span className="live-weather-val">{weather.humidity}%</span>
                  <span className="live-weather-label">Luftfeuchte</span>
                </div>
              </div>
              <div className="live-weather-item">
                <Wind size={13} />
                <div>
                  <span className="live-weather-val">{weather.wind_speed?.toFixed(1)} m/s</span>
                  <span className="live-weather-label">Wind</span>
                </div>
              </div>
              {raining && (
                <div className="live-weather-item live-weather-item--rain">
                  <CloudRain size={13} />
                  <div>
                    <span className="live-weather-val">REGEN</span>
                    <span className="live-weather-label">{weather.rainfall} mm</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState label="Keine Wetterdaten verfügbar." />
          )}
        </div>

        {/* ── Rundenzeiten ────────────────────────────────────────
            Qualifying / Practice: Beste Runde + Sektoren + Gap
            Race / Sprint:        Letzte Runde + Beste Runde
        */}
        <div className="live-laps card">
          <div className="live-laps-title">
            <Timer size={14} />
            {isQualifying ? ' Qualifying-Zeiten' : isRace ? ' Rundenzeiten' : ' Rundenzeiten'}
          </div>

          {hasLapTimes ? (
            <div className="live-laps-list">
              {/* Spaltenköpfe */}
              <div className="live-laps-header">
                <span className="live-laps-col-pos">#</span>
                <span className="live-laps-col-name">Fahrer</span>
                {isQualifying && (
                  <>
                    <span className="live-laps-col-time">Beste Zeit</span>
                    <span className="live-laps-col-gap">Abstand</span>
                    <span className="live-laps-col-sectors">Sektoren</span>
                  </>
                )}
                {isRace && (
                  <>
                    <span className="live-laps-col-time">Letzte Runde</span>
                    <span className="live-laps-col-best">Beste</span>
                  </>
                )}
                {!isQualifying && !isRace && (
                  <span className="live-laps-col-time">Beste Zeit</span>
                )}
              </div>

              {lapTimesRanked.map(({ driver_number, rank, bestLap, gap }) => {
                const driver     = getDriver(driver_number)
                const name       = driver?.broadcast_name ?? driver?.full_name ?? `#${driver_number}`
                const color      = driver?.team_colour ? `#${driver.team_colour}` : '#888'
                const bestSectors = getBestSectors(driver_number)
                const lastLap    = getLastLap(driver_number)

                return (
                  <div key={driver_number} className={`live-laps-row ${rank === 1 ? 'live-laps-row--leader' : ''}`}>
                    <span className="live-laps-col-pos">{rank}</span>

                    <div className="live-laps-col-name">
                      <div className="live-pos-color" style={{ background: color }} />
                      <span className="live-pos-name">{name}</span>
                    </div>

                    {isQualifying && (
                      <>
                        <span className="live-laps-col-time live-laptime">
                          {formatLapTime(bestLap.lap_duration) ?? '–'}
                        </span>
                        <span className="live-laps-col-gap live-lapgap">
                          {gap === 0 ? <span className="live-lapgap--leader">P1</span> : `+${gap.toFixed(3)}`}
                        </span>
                        <span className="live-laps-col-sectors">
                          <SectorBadge
                            time={bestSectors.s1}
                            isSessionBest={bestSectors.s1 != null && bestSectors.s1 === sessionBestSectors.s1}
                            isPersonalBest={true}
                          />
                          <SectorBadge
                            time={bestSectors.s2}
                            isSessionBest={bestSectors.s2 != null && bestSectors.s2 === sessionBestSectors.s2}
                            isPersonalBest={true}
                          />
                          <SectorBadge
                            time={bestSectors.s3}
                            isSessionBest={bestSectors.s3 != null && bestSectors.s3 === sessionBestSectors.s3}
                            isPersonalBest={true}
                          />
                        </span>
                      </>
                    )}

                    {isRace && (
                      <>
                        <span className="live-laps-col-time live-laptime">
                          {formatLapTime(lastLap?.lap_duration) ?? '–'}
                        </span>
                        <span className="live-laps-col-best live-laptime live-laptime--best">
                          {formatLapTime(bestLap.lap_duration) ?? '–'}
                        </span>
                      </>
                    )}

                    {!isQualifying && !isRace && (
                      <span className="live-laps-col-time live-laptime">
                        {formatLapTime(bestLap.lap_duration) ?? '–'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState label="Noch keine Rundenzeiten verfügbar." />
          )}
        </div>

        {/* Positionen */}
        <div className="live-standings card">
          <div className="live-standings-title">🏎️ Positionen</div>
          {hasPositions ? (
            <div className="live-standings-list">
              {positions.map((p) => {
                const driver = getDriver(p.driver_number)
                const tyre   = getCurrentTyre(p.driver_number)
                const interval = getInterval(p.driver_number)
                const name   = driver?.full_name ?? driver?.broadcast_name ?? `#${p.driver_number}`
                const team   = driver?.team_name ?? ''
                const color  = driver?.team_colour ? `#${driver.team_colour}` : '#888'
                const lapsSinceTyre = tyre?.lap_start && currentLap ? currentLap - tyre.lap_start : null

                return (
                  <div key={p.driver_number} className={`live-pos-row ${p.position === 1 ? 'live-pos-row--leader' : ''}`}>
                    <span className="live-pos-num">{p.position}</span>
                    <div className="live-pos-color" style={{ background: color }} />
                    <div className="live-pos-info">
                      <span className="live-pos-name">{name}</span>
                      <span className="live-pos-team" style={{ color }}>{team}</span>
                    </div>
                    {tyre?.compound && (
                      <TyreBadge compound={tyre.compound} lap={lapsSinceTyre} />
                    )}
                    {interval && p.position > 1 && (
                      <span className="live-interval">
                        {interval.gap_to_leader != null
                          ? `+${typeof interval.gap_to_leader === 'number' ? interval.gap_to_leader.toFixed(3) : interval.gap_to_leader}`
                          : interval.interval != null
                            ? `+${typeof interval.interval === 'number' ? interval.interval.toFixed(3) : interval.interval}`
                            : ''}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState label="Noch keine Positionsdaten verfügbar." />
          )}
        </div>

        {/* Rennkontrolle */}
        <div className="live-rc card">
          <div className="live-rc-title"><Flag size={14} /> Rennkontrolle</div>
          {hasRaceControl ? (
            <div className="live-rc-list">
              {raceControl.slice(0, 8).map((msg, i) => {
                const color = Object.entries(RC_COLOR).find(([k]) => msg.message?.toUpperCase().includes(k))?.[1] ?? 'var(--text-secondary)'
                return (
                  <div key={i} className="live-rc-item" style={{ borderLeftColor: color }}>
                    <span className="live-rc-time">
                      {msg.date ? new Date(msg.date).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                    </span>
                    <span className="live-rc-msg">{msg.message}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState label="Keine Meldungen verfügbar." />
          )}
        </div>

      </div>
    </div>
  )
}
