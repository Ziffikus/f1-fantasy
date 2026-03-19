import { useState } from 'react'
import { RefreshCw, Thermometer, Droplets, Wind, CloudRain, Flag, AlertTriangle } from 'lucide-react'
import { useLiveSession } from '../hooks/useLiveSession'
import './LivePage.css'

// Reifen-Farben und Abkürzungen
const TYRE_COLOR = {
  SOFT: '#E8002D', MEDIUM: '#FFF200', HARD: '#FFFFFF',
  INTERMEDIATE: '#39B54A', WET: '#0067FF',
}
const TYRE_SHORT = {
  SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W',
}

// Rennkontrolle Farbe
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

function WeatherCard({ weather }) {
  if (!weather) return null
  const raining = weather.rainfall > 0
  return (
    <div className="live-weather card">
      <div className="live-weather-title">🌤 Wetter</div>
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
    </div>
  )
}

function RaceControlCard({ messages }) {
  if (!messages?.length) return null
  return (
    <div className="live-rc card">
      <div className="live-rc-title"><Flag size={14} /> Rennkontrolle</div>
      <div className="live-rc-list">
        {messages.slice(0, 8).map((msg, i) => {
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
    </div>
  )
}

export default function LivePage() {
  const {
    session, positions, weather, currentLap, raceControl,
    loading, lastUpdate, isLive,
    getCurrentTyre, getInterval, getDriver,
    refetch,
  } = useLiveSession()

  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const totalLaps = session?.session_type === 'Race' ? null : null // OpenF1 hat keine Gesamtrunden

  const sessionLabel = {
    'Practice 1': 'FP1', 'Practice 2': 'FP2', 'Practice 3': 'FP3',
    'Qualifying': 'Qualifying', 'Sprint': 'Sprint',
    'Sprint Qualifying': 'Sprint Qualifying', 'Race': 'Rennen',
  }[session?.session_name] ?? session?.session_name ?? '–'

  return (
    <div className="live-page-root">
      {/* Header */}
      <div className="live-page-header">
        <div>
          <h1 className="live-page-title">Live</h1>
          {session && (
            <p className="live-page-subtitle">
              {session.location} · {sessionLabel}
              {currentLap > 0 && <span> · Runde {currentLap}</span>}
            </p>
          )}
        </div>
        <div className="live-page-header-right">
          {isLive && <span className="live-badge"><span className="live-dot" /> LIVE</span>}
          <button className="btn btn-secondary live-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {lastUpdate && (
        <p className="live-update-hint">
          Aktualisiert: {lastUpdate.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          {' '}· alle 15 Sek. automatisch
        </p>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : !session ? (
        <div className="live-no-session card">
          <AlertTriangle size={24} style={{ color: '#f59e0b' }} />
          <p>Keine aktive Session gefunden. Die Seite aktualisiert sich automatisch.</p>
        </div>
      ) : (
        <div className="live-page-content">
          {/* Wetter */}
          <WeatherCard weather={weather} />

          {/* Positionen */}
          <div className="live-standings card">
            <div className="live-standings-title">🏎️ Positionen</div>
            {positions.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.82rem' }}>Noch keine Positionsdaten verfügbar.</p>
            ) : (
              <div className="live-standings-list">
                {positions.map((p) => {
                  const driver = getDriver(p.driver_number)
                  const tyre = getCurrentTyre(p.driver_number)
                  const interval = getInterval(p.driver_number)
                  const name = driver?.full_name ?? driver?.broadcast_name ?? `#${p.driver_number}`
                  const team = driver?.team_name ?? ''
                  const color = driver?.team_colour ? `#${driver.team_colour}` : '#888'
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
            )}
          </div>

          {/* Rennkontrolle */}
          <RaceControlCard messages={raceControl} />
        </div>
      )}
    </div>
  )
}
