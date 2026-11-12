import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { useStandings } from '../hooks/useStandings'
import Countdown from '../components/race/Countdown'
import { supabase } from '../lib/supabase'
import { calcPlayerPointsSafe } from '../lib/points'
import PointsError from '../components/ui/PointsError'
import PlayerPicksCard, { PlayerPicksGrid } from '../components/race/PlayerPicksCard'
import { applyTeamOverrides, applyDriverSubs, fetchTeamOverrides, fetchConstructorsById, applyPickTeams } from '../lib/teams'
import { Trophy, Calendar, Shuffle, ChevronRight, Flag, Zap, Gamepad2 } from 'lucide-react'
import './DashboardPage.css'

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

// ── Dashboard-Karte für letztes Rennen ────────────────────────
function DashboardLastRace({ w, standings = [] }) {
  const { profile } = useAuthStore()
  const [picks, setPicks] = useState([])
  const [results, setResults] = useState([])
  const [draftOrder, setDraftOrder] = useState([])
  const [profiles, setProfiles] = useState([])
  const [allDrivers, setAllDrivers] = useState([])
  const [teamOverrides, setTeamOverrides] = useState([])
  const [constructorsById, setConstructorsById] = useState({})
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
        const ov = await fetchTeamOverrides(w.id)
        setAllDrivers(applyTeamOverrides(drivers ?? [], ov))
        setTeamOverrides(ov)
        setConstructorsById(await fetchConstructorsById())
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
  Object.assign(raceResultMap, applyDriverSubs(raceResultMap, allDrivers, 'race'))
  Object.assign(sprintResultMap, applyDriverSubs(sprintResultMap, allDrivers, 'sprint'))
  const hasResults = results.length > 0

  const orderedProfiles = draftOrder.length > 0
    ? draftOrder.map(d => profiles.find(p => p.id === d.profile_id)).filter(Boolean)
    : profiles

  const playerPoints = orderedProfiles.map(player => {
    const playerPicks = applyPickTeams(picks, teamOverrides, constructorsById, allDrivers).filter(p => p.profile_id === player.id)
    const pts = calcPlayerPointsSafe(playerPicks, raceResultMap, sprintResultMap, w.is_sprint_weekend, allDrivers)
    return { player, playerPicks, ...pts }
  })
  if (hasResults) playerPoints.sort((a, b) => {
    if (a.total !== b.total) return a.total - b.total
    const aStanding = standings.find(s => s.profile_id === a.player.id)?.total_points ?? Infinity
    const bStanding = standings.find(s => s.profile_id === b.player.id)?.total_points ?? Infinity
    return aStanding - bStanding
  })

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <PlayerPicksGrid>
      <PointsError errors={playerPoints.map(p => p.error && `${p.player.display_name}: ${p.error}`)} />
      {playerPoints.map(({ player, playerPicks, racePoints, sprintPoints, total }, rank) => (
        <PlayerPicksCard
          key={player.id}
          player={player}
          playerPicks={playerPicks}
          rank={rank}
          hasResults={hasResults}
          isMe={player.id === profile?.id}
          isSprintWeekend={w.is_sprint_weekend}
          racePoints={racePoints}
          sprintPoints={sprintPoints}
          total={total}
          raceResultMap={raceResultMap}
          sprintResultMap={sprintResultMap}
          allDrivers={allDrivers}
        />
      ))}
    </PlayerPicksGrid>
  )
}

export default function DashboardPage() {
  const { profile } = useAuthStore()
  const { activeWeekend, weekends, loading: racesLoading } = useRaceWeekends()
  const { standings, loading: standingsLoading, errors: standingsErrors } = useStandings()

  const completedRaces = weekends.filter(w => new Date(w.race_start) < new Date()).length
  const totalRaces = weekends.length
  const lastRace = [...weekends].reverse().find(w => new Date(w.race_start) < new Date()) ?? null

  // Prüfe ob Draft für activeWeekend abgeschlossen ist
  const [activeDraftComplete, setActiveDraftComplete] = useState(false)
  useEffect(() => {
    if (!activeWeekend) return
    async function checkDraft() {
      const [{ data: order }, { data: picks }] = await Promise.all([
        supabase.from('draft_orders').select('profile_id').eq('race_weekend_id', activeWeekend.id),
        supabase.from('picks').select('id').eq('race_weekend_id', activeWeekend.id),
      ])
      const numPlayers = order?.length ?? 0
      const totalExpected = numPlayers * 6
      setActiveDraftComplete(numPlayers > 0 && (picks?.length ?? 0) >= totalExpected)
    }
    checkDraft()
  }, [activeWeekend?.id])

  // Zeige activeWeekend wenn dessen Draft fertig, sonst lastRace
  const displayWeekend = activeDraftComplete ? activeWeekend : lastRace

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

          {!racesLoading && displayWeekend && (
            <div className="card">
              <div className="dashboard-section-header">
                <Flag size={16} />
                <span>{displayWeekend.flag_emoji} {displayWeekend.name}</span>
                <span className="dashboard-last-race-round">R{displayWeekend.round}</span>
              </div>
              <DashboardLastRace w={displayWeekend} standings={standings} />
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
                <PointsError errors={standingsErrors} />
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
            <Link to="/gaming" className="dashboard-quick-link"><Gamepad2 size={20} /><span>Gaming</span></Link>
          </div>
        </div>
      </div>
    </div>
  )
}
