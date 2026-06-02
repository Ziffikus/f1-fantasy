import { useState } from 'react'
import { RefreshCw, Thermometer, Droplets, Wind, CloudRain, Flag, Timer } from 'lucide-react'
import { useLiveSession, formatLapTime, formatSector, getSessionCategory } from '../hooks/useLiveSession'
import './LivePage.css'

const TYRE_COLOR = {
  SOFT: '#E8002D', MEDIUM: '#FFF200', HARD: '#FFFFFF',
  INTERMEDIATE: '#39B54A', WET: '#0067FF',
}
const TYRE_SHORT = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' }

const RC_COLOR = {
  'GREEN FLAG': '#4ade80', 'YELLOW FLAG': '#fbbf24', 'RED FLAG': '#ef4444',
  'SAFETY CAR': '#f97316', 'VIRTUAL SAFETY CAR': '#f97316', 'CHEQUERED FLAG': '#fff',
}

function TyreBadge({ compound, lap }) {
  const color = TYRE_COLOR[compound] ?? '#888'
  const short = TYRE_SHORT[compound] ?? '?'
  const dark = compound === 'HARD' || compound === 'MEDIUM'
  return (
    <span className="live-tyre" style={{ background: color, color: dark ? '#000' : '#fff' }}>
      {short}
      {lap != null && <span className="live-tyre-lap">{lap}L</span>}
    </span>
  )
}

function EmptyState({ label }) {
  return <p className="live-empty-state">{label}</p>
}

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
    session, weather, currentLap, raceControl,
    loading, lastUpdate, isLive,
    getDriver, getLapTimesRanked,
    getBestSectors, getSessionBestSectors,
    getDriversRanked,
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

  const sessionCategory = getSessionCategory(session?.session_name)
  const isQualifying = sessionCategory === 'qualifying' || sessionCategory === 'practice'
  const isRace = sessionCategory === 'race'

  const hasWeather = !!weather
  const hasRaceControl = raceControl?.length > 0
  const raining = weather?.rainfall > 0

  const driversRanked = getDriversRanked()
  const lapTimesRanked = getLapTimesRanked()
  const sessionBestSectors = getSessionBestSectors()

  // Qualifying: nach Bestzeit sortiert; Race/andere: nach Position
  const displayList = isQualifying && lapTimesRanked.length > 0
    ? lapTimesRanked.map(({ driver_number, rank, bestLap, gap }) => {
        const base = driversRanked.find(d => d.driver_number === driver_number) ?? {}
        return { ...base, driver_number, rank, bestLap, gap }
      })
    : driversRanked.map((d, i) => ({ ...d, rank: d.position ?? i + 1 }))

  const hasData = displayList.length > 0

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

        {/* ── Vereinte Fahrer-Card ─────────────────────────────────── */}
        <div className="live-drivers card">
          <div className="live-drivers-title">
            <Timer size={14} />
            {isQualifying ? ' Qualifying' : isRace ? ' Rennen' : ' Fahrer'}
          </div>

          {hasData ? (
            <div className="live-drivers-list">
              {/* Header */}
              <div className="live-drivers-header">
                <span>#</span>
                <span>Fahrer</span>
                <span>Reifen</span>
                <span className="col-right">{isRace ? 'Letzte' : 'Beste'}</span>
                <span className="col-right">Gap</span>
              </div>

              {displayList.map((entry) => {
                const driver = entry.driver ?? getDriver(entry.driver_number)
                const acronym = driver?.name_acronym ?? driver?.broadcast_name ?? `#${entry.driver_number}`
                const color = driver?.team_colour ? `#${driver.team_colour}` : '#888'
                const tyre = entry.tyre
                const pitCount = entry.pitCount ?? 0
                const status = entry.status  // 'DNF' | 'DNS' | 'DSQ' | null

                const timeVal = status
                  ? null
                  : isRace
                    ? formatLapTime(entry.lastLap?.lap_duration)
                    : formatLapTime(entry.bestLap?.lap_duration)

                const gapVal = isQualifying
                  ? (entry.gap != null && entry.gap !== 0 ? `+${entry.gap.toFixed(3)}` : null)
                  : entry.rank !== 1 && entry.interval?.gap_to_leader != null
                    ? `+${typeof entry.interval.gap_to_leader === 'number'
                        ? entry.interval.gap_to_leader.toFixed(1)
                        : entry.interval.gap_to_leader}`
                    : null

                const bestSectors = entry.bestSectors ?? getBestSectors(entry.driver_number)
                const hasSectors = isQualifying && (bestSectors.s1 || bestSectors.s2 || bestSectors.s3)

                return (
                  <div key={entry.driver_number}>
                    <div className={`live-drivers-row${entry.rank === 1 ? ' live-drivers-row--leader' : ''}${status ? ' live-drivers-row--out' : ''}`}>
                      <span className="live-dc-pos">{entry.rank}</span>

                      <div className="live-dc-name">
                        <div className="live-dc-stripe" style={{ background: color }} />
                        <span className={`live-dc-acronym${status ? ' live-dc-acronym--out' : ''}`}>{acronym}</span>
                        {isRace && pitCount > 0 && (
                          <span className="live-dc-pits">{pitCount}×pit</span>
                        )}
                      </div>

                      <div className="live-dc-tyre">
                        {!status && tyre?.compound
                          ? <TyreBadge compound={tyre.compound} lap={entry.lapsSinceTyre} />
                          : <span className="live-dc-no-tyre">–</span>
                        }
                      </div>

                      <span className="live-dc-time">
                        {status
                          ? <span className="live-dc-status">{status}</span>
                          : (timeVal ?? '–')
                        }
                      </span>

                      <span className="live-dc-gap">
                        {status ? '' : entry.rank === 1
                          ? <span className="live-lapgap--leader">P1</span>
                          : gapVal ?? '–'
                        }
                      </span>
                    </div>

                    {/* Sektoren nur Qualifying, als Sub-Zeile */}
                    {hasSectors && (
                      <div className="live-drivers-sectors">
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
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState label="Noch keine Daten verfügbar." />
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

        {/* Wetter – kompakt am Ende */}
        <div className="live-weather card">
          {hasWeather ? (
            <div className="live-weather-row">
              <span className="live-weather-chip">
                <Thermometer size={11} />
                {weather.air_temperature?.toFixed(1)}° Luft
              </span>
              <span className="live-weather-chip">
                <Thermometer size={11} style={{ color: '#f97316' }} />
                {weather.track_temperature?.toFixed(1)}° Strecke
              </span>
              <span className="live-weather-chip">
                <Droplets size={11} />
                {weather.humidity}%
              </span>
              <span className="live-weather-chip">
                <Wind size={11} />
                {weather.wind_speed?.toFixed(1)} m/s
              </span>
              {raining && (
                <span className="live-weather-chip live-weather-chip--rain">
                  <CloudRain size={11} />
                  {weather.rainfall} mm
                </span>
              )}
            </div>
          ) : (
            <EmptyState label="Keine Wetterdaten." />
          )}
        </div>

      </div>
    </div>
  )
}
