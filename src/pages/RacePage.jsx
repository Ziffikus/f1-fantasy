import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useLiveRace, mapLivePositionsToDriverIds, mapLiveTyresToDriverIds, TYRE_COLORS, TYRE_SHORT } from '../hooks/useLiveRace'
import TrackMap from '../components/ui/TrackMap'
import { ArrowLeft, Trophy, Zap, Flag, Clock, RefreshCw } from 'lucide-react'
import './RacePage.css'

function formatDate(dateStr) {
  if (!dateStr) return '–'
  return new Date(dateStr).toLocaleString('de-AT', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })
}

function SessionRow({ label, dateStr }) {
  if (!dateStr) return null
  const isPast = new Date(dateStr) < new Date()
  return (
    <div className={`race-session-row ${isPast ? 'race-session-row--past' : ''}`}>
      <span className="race-session-label">{label}</span>
      <span className="race-session-time">{formatDate(dateStr)}</span>
      {isPast && <span className="race-session-done">✓</span>}
    </div>
  )
}

function PositionBadge({ pos, isLive }) {
  if (pos === undefined || pos === null || pos === '') return <span className="race-pos-unknown">–</span>
  const p = Number(pos)
  if (!p) return <span className="race-pos-unknown">–</span>
  return (
    <span className={`race-pos ${p === 1 ? 'race-pos--1' : p === 2 ? 'race-pos--2' : p === 3 ? 'race-pos--3' : ''} ${isLive ? 'race-pos--live' : ''}`}>
      P{p}
    </span>
  )
}

function TyreBadge({ tyre }) {
  if (!tyre) return null
  const color = TYRE_COLORS[tyre.compound] ?? '#888'
  const short = TYRE_SHORT[tyre.compound] ?? '?'
  return (
    <span className="race-tyre-badge" style={{ background: color, color: tyre.compound === 'HARD' || tyre.compound === 'MEDIUM' ? '#000' : '#fff' }}>
      {short}
      {tyre.lap_start && <span className="race-tyre-lap">+{tyre.lap_start}L</span>}
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
        sprintPoints += spos ? (spos  / 2) : 0
      }
    } else if (pick.pick_type === 'constructor') {
      const teamDrivers = (allDrivers ?? []).filter(d => d.constructor_id === pick.constructor_id)
      for (const td of teamDrivers) {
        const pos = raceResultMap[td.id]
        racePoints += pos ?? 0
        if (isSprint) {
          const spos = sprintResultMap[td.id]
          sprintPoints += spos ? (spos  / 2) : 0
        }
      }
    }
  }
  return { racePoints, sprintPoints, total: racePoints + sprintPoints }
}

export default function RacePage() {
  const { id } = useParams()
  const { profile } = useAuthStore()
  const [weekend, setWeekend] = useState(null)
  const [picks, setPicks] = useState([])
  const [results, setResults] = useState([])
  const [profiles, setProfiles] = useState([])
  const [draftOrder, setDraftOrder] = useState([])
  const [allDrivers, setAllDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('picks')

  const { livePositions, liveTyres, isLive, sessionType, lastUpdate, loading: liveLoading, refetch } = useLiveRace(weekend)

  useEffect(() => { loadAll() }, [id])

  async function loadAll() {
    setLoading(true)
    const [
      { data: rw },
      { data: p },
      { data: res },
      { data: prof },
      { data: dOrder },
    ] = await Promise.all([
      supabase.from('race_weekends').select('*').eq('id', id).single(),
      supabase.from('picks').select('*, drivers(id, first_name, last_name, number, abbreviation, constructor_id, constructors(short_name, color)), constructors(id, name, short_name, color)').eq('race_weekend_id', id),
      supabase.from('race_results').select('*').eq('race_weekend_id', id),
      supabase.from('profiles').select('*'),
      supabase.from('draft_orders').select('*, profiles(display_name)').eq('race_weekend_id', id).order('pick_order'),
    ])

    setWeekend(rw)
    setPicks(p ?? [])
    setResults(res ?? [])
    setProfiles(prof ?? [])
    setDraftOrder(dOrder ?? [])

    // Fahrer für Team-Punkte laden
    if (rw) {
      const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
      if (season) {
        const { data: drivers } = await supabase.from('drivers').select('id, first_name, last_name, number, abbreviation, constructor_id').eq('season_id', season.id)
        setAllDrivers(drivers ?? [])
      }
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  )

  if (!weekend) return <div className="card">Rennen nicht gefunden.</div>

  const isPast = new Date(weekend.race_start) < new Date()

  // Ergebnis-Maps: driver_id → position
  const raceResultMap = {}
  const sprintResultMap = {}
  for (const r of results) {
    if (r.session_type === 'race') raceResultMap[r.driver_id] = r.position
    if (r.session_type === 'sprint') sprintResultMap[r.driver_id] = r.position
  }

  // Live-Positionen (driver_number → driver_id) überlagern die gespeicherten
  const liveByDriverId = mapLivePositionsToDriverIds(livePositions, allDrivers)
  const tyrByDriverId = mapLiveTyresToDriverIds(liveTyres, allDrivers)
  const activeRaceMap = isLive && sessionType === 'race'
    ? { ...raceResultMap, ...liveByDriverId }
    : raceResultMap
  const activeSprintMap = isLive && sessionType === 'sprint'
    ? { ...sprintResultMap, ...liveByDriverId }
    : sprintResultMap

  const hasResults = results.length > 0 || isLive

  // Spieler-Reihenfolge
  const orderedProfiles = draftOrder.length > 0
    ? draftOrder.map(d => profiles.find(p => p.id === d.profile_id)).filter(Boolean)
    : profiles

  // Punkte berechnen + sortieren für Rang
  const playerPoints = orderedProfiles.map(player => {
    const playerPicks = picks.filter(p => p.profile_id === player.id)
    const pts = calcPlayerPoints(playerPicks, activeRaceMap, activeSprintMap, weekend.is_sprint_weekend, allDrivers)
    return { player, playerPicks, ...pts }
  })

  if (hasResults) {
    playerPoints.sort((a, b) => a.total - b.total)
  }

  return (
    <div className="race-page page-enter">
      <Link to="/kalender" className="race-back">
        <ArrowLeft size={16} /> Zurück zum Kalender
      </Link>

      {/* Hero */}
      <div className="race-hero">
        <div className="race-hero-flag">{weekend.flag_emoji}</div>
        <div className="race-hero-info">
          <div className="race-hero-round">Runde {weekend.round} · 2026</div>
          <h1 className="race-hero-title">{weekend.name}</h1>
          <div className="race-hero-meta">
            <span>{weekend.city}, {weekend.country}</span>
            <span>·</span>
            <span>{weekend.circuit}</span>
            {weekend.is_sprint_weekend && <span className="badge badge-sprint">Sprint</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
          <TrackMap round={weekend.round} size="lg" />
          {isLive && (
            <div className="race-hero-status race-hero-status--live">
              <span className="live-dot" /> LIVE · {sessionType === 'sprint' ? 'Sprint' : 'Rennen'}
            </div>
          )}
          {isPast && !isLive && (
            <div className="race-hero-status race-hero-status--done">
              <Flag size={14} /> Abgeschlossen
            </div>
          )}
        </div>
      </div>

      {/* Live Banner */}
      {isLive && (
        <div className="live-banner">
          <div className="live-banner-left">
            <span className="live-dot" />
            <span>Live-Hochrechnung aktiv</span>
            {lastUpdate && (
              <span className="live-update-time">
                · Aktualisiert {lastUpdate.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
          <button className="live-refresh-btn" onClick={refetch} disabled={liveLoading}>
            <RefreshCw size={13} className={liveLoading ? 'spinning' : ''} />
            {liveLoading ? 'Lade…' : 'Jetzt aktualisieren'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="race-tabs">
        {[
          { id: 'picks', label: 'Picks & Punkte', icon: Trophy },
          { id: 'sessions', label: 'Sessions', icon: Clock },
        ].map(t => (
          <button
            key={t.id}
            className={`race-tab ${activeTab === t.id ? 'race-tab--active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Picks Tab */}
      {activeTab === 'picks' && (
        <div className="race-picks-grid">
          {playerPoints.map(({ player, playerPicks, racePoints, sprintPoints, total }, rank) => {
            const driverPicks = playerPicks.filter(p => p.pick_type === 'driver')
            const teamPicks = playerPicks.filter(p => p.pick_type === 'constructor')

            return (
              <div
                key={player.id}
                className={`race-player-card ${player.id === profile?.id ? 'race-player-card--me' : ''} ${rank === 0 && hasResults ? 'race-player-card--leading' : ''}`}
              >
                <div className="race-player-header">
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
                  <span className="race-player-name">{player.display_name}</span>
                  {hasResults && total > 0 && (
                    <span className="race-player-total">
                      {total}
                      <span className="text-muted" style={{ fontSize: '0.68rem', marginLeft: '0.2rem' }}>Pkt</span>
                      {isLive && <span className="live-dot" style={{ marginLeft: '0.3rem' }} />}
                    </span>
                  )}
                </div>

                {playerPicks.length === 0 ? (
                  <p className="text-muted" style={{ fontSize: '0.8rem', padding: '0.5rem 0' }}>Keine Picks.</p>
                ) : (
                  <div className="race-picks-list">
                    {driverPicks.map(pick => {
                      const pos = activeRaceMap[pick.driver_id]
                      const spos = activeSprintMap[pick.driver_id]
                      const isLivePos = isLive && liveByDriverId[pick.driver_id] !== undefined
                      return (
                        <div key={pick.id} className="race-pick-row">
                          <div className="race-pick-label">F{pick.pick_number}</div>
                          <div className="race-pick-color" style={{ background: pick.drivers?.constructors?.color ?? '#888' }} />
                          <div className="race-pick-info">
                            <span className="race-pick-name">{pick.drivers?.first_name} {pick.drivers?.last_name}</span>
                            <span className="race-pick-team" style={{ color: pick.drivers?.constructors?.color }}>
                              {pick.drivers?.constructors?.short_name} · #{pick.drivers?.number}
                            </span>
                          </div>
                          <div className="race-pick-results">
                            {isLive && <TyreBadge tyre={tyrByDriverId[pick.driver_id]} />}
                            {hasResults && <PositionBadge pos={pos} isLive={isLivePos} />}
                            {hasResults && weekend.is_sprint_weekend && spos && (
                              <span className="race-sprint-pts">
                                <Zap size={10} />{(spos / 2) % 1 === 0 ? (spos / 2) : (spos / 2).toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {teamPicks.map(pick => {
                      const teamDrivers = allDrivers.filter(d => d.constructor_id === pick.constructor_id)
                      const color = pick.constructors?.color ?? '#888'
                      const teamTotal = teamDrivers.reduce((sum, td) => sum + (activeRaceMap[td.id] ?? 0), 0)
                      const teamSprintTotal = teamDrivers.reduce((sum, td) => {
                        const spos = activeSprintMap[td.id]
                        return sum + (spos ? (spos  / 2) : 0)
                      }, 0)
                      return (
                        <div key={pick.id} className="race-pick-row race-pick-row--team">
                          <div className="race-pick-label">T{pick.pick_number}</div>
                          <div className="race-pick-color" style={{ background: color }} />
                          <div className="race-pick-info">
                            <span className="race-pick-name">{pick.constructors?.name}</span>
                            {hasResults && teamDrivers.length > 0 ? (
                              <span className="race-pick-team-drivers">
                                {teamDrivers.map(td => {
                                  const pos = activeRaceMap[td.id]
                                  const spos = activeSprintMap[td.id]
                                  return (
                                    <span key={td.id} className="race-pick-team-driver-pos">
                                      <span className="race-pick-abbr" style={{ color }}>
                                        {td.abbreviation}
                                      </span>
                                      <PositionBadge pos={pos} isLive={isLive && liveByDriverId[td.id] !== undefined} />
                                      {weekend.is_sprint_weekend && spos && (
                                        <span className="race-sprint-pts"><Zap size={10} />{(spos  / 2)}</span>
                                      )}
                                    </span>
                                  )
                                })}
                              </span>
                            ) : (
                              <span className="race-pick-team" style={{ color }}>Team</span>
                            )}
                          </div>
                          {hasResults && teamTotal > 0 && (
                            <div className="race-pick-results">
                              <PositionBadge pos={teamTotal} isLive={isLive} />
                              {weekend.is_sprint_weekend && teamSprintTotal > 0 && (
                                <span className="race-sprint-pts">
                                  <Zap size={10} />{teamSprintTotal % 1 === 0 ? teamSprintTotal : teamSprintTotal.toFixed(1)}
                                </span>
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
      )}

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="card race-sessions-card">
          {weekend.is_sprint_weekend ? (
            <>
              <SessionRow label="FP1" dateStr={weekend.fp1_start} />
              <SessionRow label="Sprint Qualifying" dateStr={weekend.sprint_quali_start} />
              <SessionRow label="Sprint ⚡" dateStr={weekend.sprint_start} />
            </>
          ) : (
            <>
              <SessionRow label="FP1" dateStr={weekend.fp1_start} />
              <SessionRow label="FP2" dateStr={weekend.fp2_start} />
              <SessionRow label="FP3" dateStr={weekend.fp3_start} />
            </>
          )}
          <SessionRow label="Qualifying" dateStr={weekend.qualifying_start} />
          <SessionRow label="Rennen 🏁" dateStr={weekend.race_start} />
        </div>
      )}
    </div>
  )
}
