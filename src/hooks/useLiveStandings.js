import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const OPENF1_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openf1-proxy`
const POLL_INTERVAL = 60000

export function useLiveStandings(weekends, standings) {
  const [liveWeekend, setLiveWeekend] = useState(null)
  const [isLive, setIsLive] = useState(false)
  const [sessionType, setSessionType] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [livePlayerPoints, setLivePlayerPoints] = useState({})
  const [storedPointsForLiveRound, setStoredPointsForLiveRound] = useState({})
  const intervalRef = useRef(null)
  const picksCacheRef = useRef(null)

  useEffect(() => {
    if (!weekends?.length) return

    const now = new Date()
    const WINDOW = 4 * 60 * 60 * 1000

    const active = weekends.find(w => {
      const raceStart = new Date(w.race_start)
      const sprintStart = w.sprint_start ? new Date(w.sprint_start) : null
      const raceActive = now > raceStart && (now - raceStart) < WINDOW
      const sprintActive = sprintStart && now > sprintStart && (now - sprintStart) < WINDOW
      return raceActive || sprintActive
    })

    if (!active) {
      setIsLive(false)
      setLiveWeekend(null)
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    const sprintStart = active.sprint_start ? new Date(active.sprint_start) : null
    const sprintActive = sprintStart && (now - sprintStart) < WINDOW
    setIsLive(true)
    setSessionType(sprintActive ? 'sprint' : 'race')
    setLiveWeekend(active)
    picksCacheRef.current = null

    fetchLive(active, sprintActive ? 'sprint' : 'race')
    intervalRef.current = setInterval(() => fetchLive(active, sprintActive ? 'sprint' : 'race'), POLL_INTERVAL)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [weekends?.length])

  async function fetchLive(weekend, sType) {
    try {
      if (!picksCacheRef.current) {
        const { data: picks } = await supabase
          .from('picks')
          .select('profile_id, pick_type, driver_id, constructor_id, drivers(number, constructor_id), constructors(id)')
          .eq('race_weekend_id', weekend.id)
        picksCacheRef.current = picks ?? []

        const { data: stored } = await supabase
          .from('player_race_points')
          .select('profile_id, total_points')
          .eq('race_weekend_id', weekend.id)
        const storedMap = {}
        for (const s of (stored ?? [])) storedMap[s.profile_id] = s.total_points
        setStoredPointsForLiveRound(storedMap)
      }
      const picks = picksCacheRef.current

      const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
      const { data: allDrivers } = await supabase
        .from('drivers').select('id, number, constructor_id').eq('season_id', season.id)

      const sessionRes = await fetch(`${OPENF1_BASE}?endpoint=/sessions&session_type=${sType === 'sprint' ? 'Sprint' : 'Race'}&year=${new Date().getFullYear()}&limit=1`)
      const sessions = await sessionRes.json()
      if (!sessions?.length) return

      const sessionKey = sessions[0].session_key
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const posRes = await fetch(`${OPENF1_BASE}?endpoint=/position&session_key=${sessionKey}&date>=${since}`)
      const positions = await posRes.json()
      if (!positions?.length) return

      const latestByNum = {}
      for (const p of positions) {
        if (!latestByNum[p.driver_number] || new Date(p.date) > new Date(latestByNum[p.driver_number].date)) {
          latestByNum[p.driver_number] = p
        }
      }
      const posByDriverId = {}
      for (const d of (allDrivers ?? [])) {
        if (latestByNum[d.number]) posByDriverId[d.id] = latestByNum[d.number].position
      }

      const playerPoints = {}
      const profileIds = [...new Set(picks.map(p => p.profile_id))]

      for (const pid of profileIds) {
        const myPicks = picks.filter(p => p.profile_id === pid)
        let pts = 0

        for (const pick of myPicks) {
          if (pick.pick_type === 'driver') {
            const pos = posByDriverId[pick.driver_id] ?? 22
            pts += sType === 'sprint' ? Math.ceil(pos / 2) : pos
          } else if (pick.pick_type === 'constructor') {
            const teamDrivers = (allDrivers ?? []).filter(d => d.constructor_id === pick.constructor_id)
            for (const td of teamDrivers) {
              const pos = posByDriverId[td.id] ?? 22
              pts += sType === 'sprint' ? Math.ceil(pos / 2) : pos
            }
          }
        }
        playerPoints[pid] = pts
      }

      setLivePlayerPoints(playerPoints)
      setLastUpdate(new Date())
    } catch (err) {
      console.warn('Live standings fetch error:', err)
    }
  }

  function getLiveTotal(profileId, storedSeasonTotal) {
    if (!isLive || livePlayerPoints[profileId] === undefined) return storedSeasonTotal
    const alreadySaved = storedPointsForLiveRound[profileId] ?? 0
    return (storedSeasonTotal - alreadySaved) + livePlayerPoints[profileId]
  }

  function getLiveRoundPoints(profileId) {
    return livePlayerPoints[profileId] ?? null
  }

  return { liveWeekend, isLive, sessionType, lastUpdate, getLiveTotal, getLiveRoundPoints }
}
