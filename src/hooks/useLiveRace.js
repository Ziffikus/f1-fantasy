// ─── useLiveRace.js ──────────────────────────────────────────
// OPENF1_BASE auf Supabase Proxy geändert

import { useState, useEffect, useRef } from 'react'

const OPENF1_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openf1-proxy`
const POLL_INTERVAL = 60000

const PROXY_HEADERS = {
  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
}

export const TYRE_COLORS = {
  SOFT:         '#e8002d',
  MEDIUM:       '#ffd700',
  HARD:         '#ffffff',
  INTERMEDIATE: '#39b54a',
  WET:          '#0067ff',
  TEST_UNKNOWN: '#888',
}

export const TYRE_SHORT = {
  SOFT:         'S',
  MEDIUM:       'M',
  HARD:         'H',
  INTERMEDIATE: 'I',
  WET:          'W',
  TEST_UNKNOWN: '?',
}

export function useLiveRace(weekend) {
  const [livePositions, setLivePositions] = useState({})
  const [liveTyres, setLiveTyres] = useState({})
  const [isLive, setIsLive] = useState(false)
  const [sessionType, setSessionType] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef(null)
  const sessionKeyRef = useRef(null)

  useEffect(() => {
    if (!weekend) return

    const now = new Date()
    const raceStart = new Date(weekend.race_start)
    const sprintStart = weekend.sprint_start ? new Date(weekend.sprint_start) : null

    const WINDOW = 4 * 60 * 60 * 1000
    const raceActive   = now > raceStart   && (now - raceStart)   < WINDOW
    const sprintActive = sprintStart && now > sprintStart && (now - sprintStart) < WINDOW

    if (raceActive)        { setIsLive(true); setSessionType('race') }
    else if (sprintActive) { setIsLive(true); setSessionType('sprint') }
    else { setIsLive(false); setSessionType(null); return }

    fetchLivePositions()
    intervalRef.current = setInterval(fetchLivePositions, POLL_INTERVAL)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [weekend?.id])

  async function fetchLivePositions() {
    setLoading(true)
    try {
      if (!sessionKeyRef.current) {
        const sType = sessionType === 'sprint' ? 'Sprint' : 'Race'
        const sessionRes = await fetch(`${OPENF1_BASE}?endpoint=/sessions&session_type=${sType}&year=${new Date().getFullYear()}&limit=1`, { headers: PROXY_HEADERS })
        const sessions = await sessionRes.json()
        if (!sessions?.length) { setLoading(false); return }
        sessionKeyRef.current = sessions[0].session_key
      }
      const sessionKey = sessionKeyRef.current

      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const [posRes, stintRes] = await Promise.all([
        fetch(`${OPENF1_BASE}?endpoint=/position&session_key=${sessionKey}&date>=${since}`, { headers: PROXY_HEADERS }),
        fetch(`${OPENF1_BASE}?endpoint=/stints&session_key=${sessionKey}`, { headers: PROXY_HEADERS }),
      ])
      const [positions, stints] = await Promise.all([posRes.json(), stintRes.json()])

      if (positions?.length) {
        const latest = {}
        for (const pos of positions) {
          if (!latest[pos.driver_number] || new Date(pos.date) > new Date(latest[pos.driver_number].date)) {
            latest[pos.driver_number] = pos
          }
        }
        const posMap = {}
        for (const [num, pos] of Object.entries(latest)) posMap[Number(num)] = pos.position
        setLivePositions(posMap)
      }

      if (stints?.length) {
        const tyreMap = {}
        for (const stint of stints) {
          const num = stint.driver_number
          if (!tyreMap[num] || stint.stint_number > tyreMap[num].stint_number) {
            tyreMap[num] = {
              compound:     stint.compound?.toUpperCase() ?? 'TEST_UNKNOWN',
              lap_start:    stint.lap_start,
              stint_number: stint.stint_number,
            }
          }
        }
        setLiveTyres(tyreMap)
      }

      setLastUpdate(new Date())
    } catch (err) {
      console.warn('OpenF1 fetch error:', err)
    }
    setLoading(false)
  }

  return { livePositions, liveTyres, isLive, sessionType, lastUpdate, loading, refetch: fetchLivePositions }
}

export function mapLivePositionsToDriverIds(livePositions, drivers) {
  const mapped = {}
  for (const [driverNumber, position] of Object.entries(livePositions)) {
    const driver = drivers.find(d => d.number === Number(driverNumber))
    if (driver) mapped[driver.id] = position
  }
  return mapped
}

export function mapLiveTyresToDriverIds(liveTyres, drivers) {
  const mapped = {}
  for (const [driverNumber, tyre] of Object.entries(liveTyres)) {
    const driver = drivers.find(d => d.number === Number(driverNumber))
    if (driver) mapped[driver.id] = tyre
  }
  return mapped
}
