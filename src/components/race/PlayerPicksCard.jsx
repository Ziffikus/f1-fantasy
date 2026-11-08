// ============================================================
// Spieler-Karte mit Picks & Punkten (Optik wie im Dashboard).
// Wird von Dashboard, Rennseite und Kalender gemeinsam genutzt.
// ============================================================
import { Flag, Zap } from 'lucide-react'
import './PlayerPicksCard.css'

const FILE_MAP = {
  'McLaren': 'mcl', 'Mercedes': 'mer', 'Red Bull': 'rbr', 'Ferrari': 'fer',
  'Williams': 'wil', 'Racing Bulls': 'rb', 'Aston Martin': 'ast',
  'Haas': 'haa', 'Audi': 'aud', 'Alpine': 'alp', 'Cadillac': 'cad',
}
const LOGO_MAP = { mer: 'log_mer', wil: 'logo_will' }

const fmt = n => (n % 1 === 0 ? n : n.toFixed(1))

/** Raster, in dem die Karten stehen (2 Spalten, mobil 1 Spalte) */
export function PlayerPicksGrid({ children }) {
  return <div className="ppc db-lastrace-grid">{children}</div>
}

export default function PlayerPicksCard({
  player,
  playerPicks = [],
  rank = 0,
  hasResults = false,
  isMe = false,
  isSprintWeekend = false,
  racePoints = 0,
  sprintPoints = 0,
  total = 0,
  raceResultMap = {},
  sprintResultMap = {},
  allDrivers = [],
  isLive = false,
  renderDriverExtra = null, // optional: (pick) => ReactNode, z. B. Reifen-Badge im Live-Betrieb
}) {
  const driverPicks = playerPicks.filter(p => p.pick_type === 'driver')
  const teamPicks   = playerPicks.filter(p => p.pick_type === 'constructor')

  return (
    <div
      className={`db-lastrace-card ${isMe ? 'db-lastrace-card--me' : ''} ${rank === 0 && hasResults ? 'db-lastrace-card--leading' : ''}`}
    >
      {/* Spieler-Kopf */}
      <div className="db-lastrace-player-header">
        {hasResults && (
          <span className={`db-lastrace-rank ${rank === 0 ? 'db-lastrace-rank--1' : rank === 1 ? 'db-lastrace-rank--2' : rank === 2 ? 'db-lastrace-rank--3' : ''}`}>
            {rank + 1}
          </span>
        )}
        <div className="draft-player-avatar">
          {player.avatar_url
            ? <img src={player.avatar_url} alt={player.display_name} />
            : <span>{player.display_name?.[0]?.toUpperCase()}</span>}
        </div>
        <span className="db-lastrace-player-name">
          {player.display_name}
          {isMe && <span className="dashboard-you"> (du)</span>}
        </span>
        {hasResults && total > 0 && (
          <div className="race-player-total-wrap">
            <span className="race-player-total">
              {fmt(total)}
              <span className="race-player-total-unit">Pkt</span>
              {isLive && <span className="live-dot" style={{ marginLeft: '0.3rem' }} />}
            </span>
            <div className="race-player-pts-breakdown">
              <span className="race-pts-item">
                <Flag size={10} />
                {fmt(racePoints)}
              </span>
              {isSprintWeekend && (
                <span className="race-pts-item race-pts-item--sprint">
                  <Zap size={10} />
                  {fmt(sprintPoints)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Picks – exakt wie Draft */}
      <div className="draft-zone-picks">
        <div className="draft-picks-drivers">
          {[1, 2, 3, 4].map(n => {
            const pick = driverPicks.find(p => p.pick_number === n)
            const abbr = pick?.drivers?.abbreviation?.toLowerCase()
            const firstName = pick?.drivers?.first_name
            const lastName  = pick?.drivers?.last_name
            const displayName = firstName && lastName ? `${firstName[0]}. ${lastName}` : abbr?.toUpperCase()
            const teamColor = pick?.drivers?.constructors?.color
            const pos  = pick ? raceResultMap[pick.driver_id] : null
            const spos = pick ? sprintResultMap[pick.driver_id] : null
            return (
              <div
                key={`d${n}`}
                className={`draft-pick-driver-slot ${pick ? 'draft-pick-slot--filled' : 'draft-pick-slot--empty'}`}
                style={pick ? { '--slot-color': teamColor } : {}}
              >
                {pick ? (
                  <>
                    <div className="draft-pick-portrait-wrap">
                      <img
                        className="draft-pick-portrait"
                        src={`${import.meta.env.BASE_URL}drivers/${abbr}.avif`}
                        alt={abbr}
                        onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling.style.display = 'flex' }}
                      />
                      <div className="draft-pick-portrait-fallback">{displayName}</div>
                    </div>
                    <div className="draft-pick-driver-label">
                      {lastName ?? displayName}
                    </div>
                    {renderDriverExtra?.(pick)}
                    {hasResults && (
                      <div className="db-pick-pts-overlay">
                        <span className="db-slot-pts">
                          <Flag size={8} />
                          {pos ?? '–'}
                        </span>
                        {isSprintWeekend && (
                          <span className="db-slot-pts db-slot-pts--sprint">
                            <Zap size={8} />
                            {spos ? fmt(spos / 2) : '–'}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="draft-pick-slot-num">F{n}</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Team-Rechtecke */}
        <div className="draft-picks-teams">
          {[1, 2].map(n => {
            const pick = teamPicks.find(p => p.pick_number === n)
            const teamColor = pick?.constructors?.color
            const teamShort = pick?.constructors?.short_name
            const fileKey = FILE_MAP[teamShort] ?? teamShort?.toLowerCase()
            const logoKey = LOGO_MAP[fileKey] ?? `logo_${fileKey}`
            const teamDrivers     = allDrivers.filter(d => d.constructor_id === pick?.constructor_id)
            const teamTotal       = teamDrivers.reduce((sum, td) => sum + (td.out_race ? 0 : (raceResultMap[td.id] ?? 0)), 0)
            const teamSprintTotal = teamDrivers.reduce((sum, td) => {
              const s = sprintResultMap[td.id]
              return sum + (s && !td.out_sprint ? s / 2 : 0)
            }, 0)
            return (
              <div
                key={`t${n}`}
                className={`draft-pick-team-slot ${pick ? 'draft-pick-slot--filled' : 'draft-pick-slot--empty'}`}
                style={pick ? { '--slot-color': teamColor } : {}}
              >
                {pick ? (
                  <>
                    <div className="draft-pick-car-wrap">
                      <img
                        className="draft-pick-car"
                        src={`${import.meta.env.BASE_URL}autos/${fileKey}.avif`}
                        alt={teamShort}
                        onError={e => { e.currentTarget.style.display = 'none' }}
                      />
                      <div className="draft-pick-team-overlay">
                        <img
                          className="draft-pick-team-logo"
                          src={`${import.meta.env.BASE_URL}logos/${logoKey}.avif`}
                          alt={teamShort}
                          onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling.style.display = 'block' }}
                        />
                        <span className="draft-pick-team-logo-fallback" style={{ color: teamColor }}>{teamShort?.toUpperCase()}</span>
                      </div>
                    </div>
                    <div className="draft-pick-team-label">{teamShort}</div>
                    {hasResults && (teamTotal > 0 || teamSprintTotal > 0) && (
                      <div className="db-team-pts-row">
                        <span className="db-team-pts">
                          <Flag size={8} />
                          {teamTotal}
                        </span>
                        {isSprintWeekend && (
                          <span className="db-team-pts db-team-pts--sprint">
                            <Zap size={8} />
                            {fmt(teamSprintTotal)}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="draft-pick-slot-num">T{n}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
