import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { useStandings } from '../hooks/useStandings'
import Countdown from '../components/race/Countdown'
import { supabase } from '../lib/supabase'
import { Trophy, Calendar, Shuffle, ChevronRight, Flag, Zap } from 'lucide-react'
import './DashboardPage.css'

// ── Fahrerfoto-URL aus Kürzel ─────────────────────────────────
function driverImgUrl(abbreviation) {
  if (!abbreviation) return null
  const abbr = abbreviation.toUpperCase()
  return `https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/${abbr[0]}/${abbr}01_${abbr[0].toLowerCase()}${abbr.slice(1).toLowerCase()}_${abbr[0].toLowerCase()}${abbr.slice(1).toLowerCase()}/driver.png.transform/2col/image.png`
}

function PositionBadge({ pos }) {
  if (pos === undefined || pos === null || pos === '') return <span className="race-pos-unknown">–</span>
  const p = Number(pos)
  if (!p) return <span className="race-pos-unknown">–</span>
  return (
    <span className={`race-pos ${p === 1 ? 'race-pos--1' : p === 2 ? 'race-pos--2' : p === 3 ? 'race-pos--3' : ''}`}>
      P{p}
    </span>
  )
}

function calcPlayerPoints(playerPicks, raceResultMap, sprintResultMap, isSprint, allDrivers) {
  let racePoints = 0, sprintPoints = 0
  for (const pick of playerPicks) {
    if (pick.pick_type === 'driver') {
      const pos = raceResultMap[pick.driver_id]
      racePoints += pos ?? 0
      if (isSprint) {
        const spos = sprintResultMap[pick.driver_id]
        sprintPoints += spos ? (spos / 2) : 0
      }
    } else if (pick.pick_type === 'constructor') {
      const teamDrivers = (allDrivers ?? []).filter(d => d.constructor_id === pick.constructor_id)
      for (const td of teamDrivers) {
        const pos = raceResultMap[td.id]
        racePoints += pos ?? 0
        if (isSprint) {
          const spos = sprintResultMap[td.id]
          sprintPoints += spos ? (spos / 2) : 0
        }
      }
    }
  }
  return { racePoints, sprintPoints, total: racePoints + sprintPoints }
}

// ── Dashboard-Karte für letztes Rennen ────────────────────────
function DashboardLastRace({ w }) {
  const { profile } = useAuthStore()
  const [picks, setPicks] = useState([])
  const [results, setResults] = useState([])
  const [draftOrder, setDraftOrder] = useState([])
  const [profiles, setProfiles] = useState([])
  const [allDrivers, setAllDrivers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [
        { data: p },
        { data: res },
        { data: prof },
        { data: dOrder },
      ] = await Promise.all([
        supabase.from('picks')
          .select('*, drivers(id, first_name, last_name, number, abbreviation, constructor_id, constructors(short_name, color)), constructors(id, name, short_name, color)')
          .eq('race_weekend_id', w.id),
        supabase.from('race_results').select('*').eq('race_weekend_id', w.id),
        supabase.from('profiles').select('*'),
        supabase.from('draft_orders').select('*, profiles(display_name)').eq('race_weekend_id', w.id).order('pick_order'),
      ])
      const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
      if (season) {
        const { data: drivers } = await supabase.from('drivers')
          .select('id, first_name, last_name, number, abbreviation, constructor_id')
          .eq('season_id', season.id)
        setAllDrivers(drivers ?? [])
      }
      setPicks(p ?? [])
      setResults(res ?? [])
      setProfiles(prof ?? [])
      setDraftOrder(dOrder ?? [])
      setLoading(false)
    }
    load()
  }, [w.id])

  const raceResultMap = {}
  const sprintResultMap = {}
  for (const r of results) {
    if (r.session_type === 'race')   raceResultMap[r.driver_id]   = r.position
    if (r.session_type === 'sprint') sprintResultMap[r.driver_id] = r.position
  }
  const hasResults = results.length > 0

  const orderedProfiles = draftOrder.length > 0
    ? draftOrder.map(d => profiles.find(p => p.id === d.profile_id)).filter(Boolean)
    : profiles

  const playerPoints = orderedProfiles.map(player => {
    const playerPicks = picks.filter(p => p.profile_id === player.id)
    const pts = calcPlayerPoints(playerPicks, raceResultMap, sprintResultMap, w.is_sprint_weekend, allDrivers)
    return { player, playerPicks, ...pts }
  })
  if (hasResults) playerPoints.sort((a, b) => b.total - a.total)

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="db-lastrace-grid">
      {playerPoints.map(({ player, playerPicks, racePoints, sprintPoints, total }, rank) => {
        const driverPicks = playerPicks.filter(p => p.pick_type === 'driver')
        const teamPicks   = playerPicks.filter(p => p.pick_type === 'constructor')
        const isMe = player.id === profile?.id

        return (
          <div
            key={player.id}
            className={`db-lastrace-card ${isMe ? 'db-lastrace-card--me' : ''} ${rank === 0 && hasResults ? 'db-lastrace-card--leading' : ''}`}
          >
            {/* Player Header */}
            <div className="db-lastrace-player-header">
              {hasResults && (
                <span className={`race-rank-badge ${rank === 0 ? 'race-rank-1' : rank === 1 ? 'race-rank-2' : rank === 2 ? 'race-rank-3' : ''}`}>
                  {rank + 1}
                </span>
              )}
              <div className="race-player-avatar">
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
                    {total % 1 === 0 ? total : total.toFixed(1)}
                    <span className="text-muted" style={{ fontSize: '0.68rem', marginLeft: '0.2rem' }}>Pkt</span>
                  </span>
                  {w.is_sprint_weekend && sprintPoints > 0 && (
                    <div className="race-player-pts-breakdown">
                      <span>🏁 {racePoints % 1 === 0 ? racePoints : racePoints.toFixed(1)}</span>
                      <span className="race-player-pts-sep">·</span>
                      <span>⚡ {sprintPoints % 1 === 0 ? sprintPoints : sprintPoints.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Driver Picks als Bild-Grid */}
            {driverPicks.length > 0 && (
              <div className="db-lastrace-drivers">
                {driverPicks.map(pick => {
                  const pos   = raceResultMap[pick.driver_id]
                  const spos  = sprintResultMap[pick.driver_id]
                  const color = pick.drivers?.constructors?.color ?? '#888'
                  const imgUrl = driverImgUrl(pick.drivers?.abbreviation)
                  return (
                    <div key={pick.id} className="db-driver-chip">
                      <div className="db-driver-chip-img" style={{ borderColor: color }}>
                        {imgUrl
                          ? <img src={imgUrl} alt={pick.drivers?.abbreviation}
                              onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }} />
                          : null}
                        <div className="db-driver-chip-fallback" style={{ display: imgUrl ? 'none' : 'flex' }}>
                          {pick.drivers?.abbreviation}
                        </div>
                      </div>
                      <span className="db-driver-chip-abbr" style={{ color }}>{pick.drivers?.abbreviation}</span>
                      {hasResults && (
                        <div className="db-driver-chip-pts">
                          <PositionBadge pos={pos} />
                          {w.is_sprint_weekend && spos && (
                            <span className="race-sprint-pts"><Zap size={9} />{(spos / 2) % 1 === 0 ? (spos / 2) : (spos / 2).toFixed(1)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Team Picks */}
            {teamPicks.length > 0 && (
              <div className="db-lastrace-teams">
                {teamPicks.map(pick => {
                  const color = pick.constructors?.color ?? '#888'
                  const teamDrivers     = allDrivers.filter(d => d.constructor_id === pick.constructor_id)
                  const teamTotal       = teamDrivers.reduce((sum, td) => sum + (raceResultMap[td.id] ?? 0), 0)
                  const teamSprintTotal = teamDrivers.reduce((sum, td) => {
                    const spos = sprintResultMap[td.id]
                    return sum + (spos ? (spos / 2) : 0)
                  }, 0)
                  return (
                    <div key={pick.id} className="db-team-chip" style={{ borderColor: color }}>
                      <span className="db-team-chip-name" style={{ color }}>{pick.constructors?.short_name}</span>
                      {hasResults && teamDrivers.length > 0 && (
                        <div className="db-team-chip-drivers">
                          {teamDrivers.map(td => {
                            const pos  = raceResultMap[td.id]
                            const spos = sprintResultMap[td.id]
                            return (
                              <span key={td.id} className="db-team-driver-item">
                                <span className="race-pick-abbr" style={{ color, fontSize: '0.65rem' }}>{td.abbreviation}</span>
                                <PositionBadge pos={pos} />
                                {w.is_sprint_weekend && spos && (
                                  <span className="race-sprint-pts"><Zap size={9} />{(spos / 2)}</span>
                                )}
                              </span>
                            )
                          })}
                        </div>
                      )}
                      {hasResults && (teamTotal > 0 || teamSprintTotal > 0) && (
                        <div className="db-team-chip-total">
                          <span className="db-team-pts">{teamTotal}<span className="text-muted" style={{fontSize:'0.6rem'}}> R</span></span>
                          {w.is_sprint_weekend && teamSprintTotal > 0 && (
                            <span className="race-sprint-pts"><Zap size={9} />{teamSprintTotal % 1 === 0 ? teamSprintTotal : teamSprintTotal.toFixed(1)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function DashboardPage() {
  const { profile } = useAuthStore()
  const { activeWeekend, weekends, loading: racesLoading } = useRaceWeekends()
  const { standings, loading: standingsLoading } = useStandings()

  const completedRaces = weekends.filter(w => new Date(w.race_start) < new Date()).length
  const totalRaces = weekends.length
  const lastRace = [...weekends].reverse().find(w => new Date(w.race_start) < new Date()) ?? null

  return (
    <div className="dashboard page-enter">
      <div className="dashboard-hero">
        <div>
          <h1 className="dashboard-hello">
            Hey, <span className="text-accent">{profile?.display_name ?? '...'}</span>
          </h1>
          <p className="text-secondary" style={{ marginTop: '0.25rem' }}>
            Saison 2026 · {completedRaces} von {totalRaces} Rennen absolviert
          </p>
        </div>
        <div className="dashboard-progress-bar">
          <div
            className="dashboard-progress-fill"
            style={{ width: totalRaces ? `${(completedRaces / totalRaces) * 100}%` : '0%' }}
          />
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-col-main">
          {racesLoading ? (
            <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <div className="spinner" />
            </div>
          ) : activeWeekend ? (
            <Countdown weekend={activeWeekend} />
          ) : (
            <div className="card"><p className="text-secondary">Saison beendet!</p></div>
          )}

          {!racesLoading && lastRace && (
            <div className="card">
              <div className="dashboard-section-header">
                <Flag size={16} />
                <span>{lastRace.flag_emoji} {lastRace.name}</span>
                <span className="dashboard-last-race-round">R{lastRace.round}</span>
              </div>
              <DashboardLastRace w={lastRace} />
            </div>
          )}

          {!racesLoading && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="dashboard-section-header">
                <Calendar size={16} />
                <span>Nächste Rennen</span>
                <Link to="/kalender" className="dashboard-more-link">
                  Alle <ChevronRight size={14} />
                </Link>
              </div>
              <div className="dashboard-race-list">
                {weekends
                  .filter(w => new Date(w.race_start) > new Date())
                  .slice(0, 4)
                  .map(w => (
                    <Link to={`/rennen/${w.id}`} key={w.id} className="dashboard-race-item">
                      <span className="dashboard-race-flag">{w.flag_emoji}</span>
                      <div className="dashboard-race-info">
                        <span className="dashboard-race-name">{w.city}</span>
                        <span className="dashboard-race-date">
                          {new Date(w.race_start).toLocaleDateString('de-AT', {
                            day: '2-digit', month: 'short'
                          })}
                        </span>
                      </div>
                      <div className="dashboard-race-meta">
                        {w.is_sprint_weekend && <span className="badge badge-sprint">S</span>}
                        <span className="dashboard-race-round">R{w.round}</span>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="dashboard-col-side">
          <div className="card">
            <div className="dashboard-section-header">
              <Trophy size={16} />
              <span>Gesamtwertung</span>
              <Link to="/wertung" className="dashboard-more-link">
                Details <ChevronRight size={14} />
              </Link>
            </div>
            {standingsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                <div className="spinner" />
              </div>
            ) : standings.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Noch keine Rennen gewertet.
              </p>
            ) : (
              <div className="dashboard-standings">
                {standings.map((player, i) => (
                  <div key={player.profile_id}
                    className={`dashboard-standing-row ${player.profile_id === profile?.id ? 'dashboard-standing-row--me' : ''}`}>
                    <span className={`pos-badge ${i < 3 ? `pos-${i + 1}` : ''}`}
                      style={i >= 3 ? { background: 'var(--bg-elevated)', color: 'var(--text-muted)' } : {}}>
                      {i + 1}
                    </span>
                    <div className="dashboard-standing-avatar">
                      {player.avatar_url
                        ? <img src={player.avatar_url} alt={player.display_name} />
                        : <span>{player.display_name?.[0]?.toUpperCase()}</span>}
                    </div>
                    <span className="dashboard-standing-name">
                      {player.display_name}
                      {player.profile_id === profile?.id && <span className="dashboard-you"> (du)</span>}
                    </span>
                    <span className="dashboard-standing-pts">
                      {player.total_points} <span className="text-muted" style={{ fontSize: '0.7rem' }}>Pkt</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dashboard-quick-links">
            <Link to="/draft" className="dashboard-quick-link"><Shuffle size={20} /><span>Draft</span></Link>
            <Link to="/kalender" className="dashboard-quick-link"><Calendar size={20} /><span>Kalender</span></Link>
            <Link to="/wertung" className="dashboard-quick-link"><Trophy size={20} /><span>Wertung</span></Link>
            <Link to="/profil" className="dashboard-quick-link"><Flag size={20} /><span>Profil</span></Link>
          </div>
        </div>
      </div>
    </div>
  )
}
