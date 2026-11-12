// ============================================================
// Picks & Punkte eines Rennwochenendes (Optik wie im Dashboard).
//   <RaceWeekendPicks w={weekend} standings={standings} />                       → alle Spieler
//   <RaceWeekendPicks w={weekend} standings={standings} playerId={id} />         → nur dieser Spieler (Rang unter allen bleibt erhalten)
// Teamfarben folgen dem Team am Wochenende (Team-Wechsel / Ersatzfahrer).
// ============================================================
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { calcPlayerPointsSafe } from '../../lib/points'
import {
  applyTeamOverrides, applyDriverSubs, fetchTeamOverrides,
  fetchConstructorsById, applyPickTeams,
} from '../../lib/teams'
import PointsError from '../ui/PointsError'
import PlayerPicksCard from './PlayerPicksCard'

export default function RaceWeekendPicks({ w, standings = [], playerId = null }) {
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
    let cancelled = false
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
      let drivers = [], ov = []
      if (season) {
        const { data } = await supabase.from('drivers')
          .select('id, first_name, last_name, number, abbreviation, constructor_id')
          .eq('season_id', season.id)
        drivers = data ?? []
        ov = await fetchTeamOverrides(w.id)
      }
      const byId = await fetchConstructorsById()
      if (cancelled) return
      setAllDrivers(applyTeamOverrides(drivers, ov))
      setTeamOverrides(ov)
      setConstructorsById(byId)
      setPicks(p ?? [])
      setResults(res ?? [])
      setProfiles(prof ?? [])
      setDraftOrder(dOrder ?? [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
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

  const coloredPicks = applyPickTeams(picks, teamOverrides, constructorsById, allDrivers)
  const playerPoints = orderedProfiles.map(player => {
    const playerPicks = coloredPicks.filter(p => p.profile_id === player.id)
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

  const visible = playerPoints
    .map((pp, rank) => ({ ...pp, rank }))
    .filter(pp => !playerId || pp.player.id === playerId)
  const single = !!playerId

  if (single && visible.length === 0) return (
    <p className="text-muted" style={{ fontSize: '0.85rem', padding: '0.5rem' }}>
      Für dieses Rennen gibt es keine Picks.
    </p>
  )

  return (
    <div
      className="ppc db-lastrace-grid"
      style={single ? { gridTemplateColumns: '1fr', maxWidth: 560, margin: '0 auto' } : undefined}
    >
      <PointsError errors={visible.map(p => p.error && `${p.player.display_name}: ${p.error}`)} />
      {visible.map(({ player, playerPicks, racePoints, sprintPoints, total, rank }) => (
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
    </div>
  )
}
