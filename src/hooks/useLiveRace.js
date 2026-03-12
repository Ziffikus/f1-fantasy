import { useState, useEffect, useRef } from 'react'

const OPENF1_BASE = 'https://api.openf1.org/v1'
const POLL_INTERVAL = 60000 // 60 Sekunden

export function useLiveRace(weekend) {
  const [livePositions, setLivePositions] = useState({}) // driver_number → position
  const [isLive, setIsLive] = useState(false)
  const [sessionType, setSessionType] = useState(null) // 'race' | 'sprint' | null
  const [lastUpdate, setLastUpdate] = useState(null)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!weekend) return

    const now = new Date()
    const raceStart = new Date(weekend.race_start)
    const sprintStart = weekend.sprint_start ? new Date(weekend.sprint_start) : null

    // Ist gerade ein Rennen oder Sprint aktiv? (±4 Stunden Fenster)
    const WINDOW = 4 * 60 * 60 * 1000 // 4 Stunden in ms
    const raceActive = Math.abs(now - raceStart) < WINDOW && now > raceStart
    const sprintActive = sprintStart && Math.abs(now - sprintStart) < WINDOW && now > sprintStart

    if (raceActive) { setIsLive(true); setSessionType('race') }
    else if (sprintActive) { setIsLive(true); setSessionType('sprint') }
    else { setIsLive(false); setSessionType(null); return }

    // Sofort laden + Interval starten
    fetchLivePositions()
    intervalRef.current = setInterval(fetchLivePositions, POLL_INTERVAL)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [weekend?.id])

  async function fetchLivePositions() {
    setLoading(true)
    try {
      // Aktuelle Session holen
      const sessionRes = await fetch(`${OPENF1_BASE}/sessions?session_type=Race&year=${new Date().getFullYear()}&limit=1`)
      const sessions = await sessionRes.json()
      if (!sessions?.length) { setLoading(false); return }

      const session = sessions[0]

      // Positionen holen
      const posRes = await fetch(`${OPENF1_BASE}/position?session_key=${session.session_key}&date>=${getRecentTime()}`)
      const positions = await posRes.json()

      if (!positions?.length) { setLoading(false); return }

      // Neueste Position pro Fahrer
      const latest = {}
      for (const pos of positions) {
        if (!latest[pos.driver_number] || new Date(pos.date) > new Date(latest[pos.driver_number].date)) {
          latest[pos.driver_number] = pos
        }
      }

      const posMap = {}
      for (const [driverNum, pos] of Object.entries(latest)) {
        posMap[Number(driverNum)] = pos.position
      }

      setLivePositions(posMap)
      setLastUpdate(new Date())
    } catch (err) {
      console.warn('OpenF1 fetch error:', err)
    }
    setLoading(false)
  }

  function getRecentTime() {
    const d = new Date(Date.now() - 2 * 60 * 60 * 1000) // letzte 2 Stunden
    return d.toISOString()
  }

  return { livePositions, isLive, sessionType, lastUpdate, loading, refetch: fetchLivePositions }
}

/**
 * Mappt driver_number → driver_id anhand der Fahrerliste
 */
export function mapLivePositionsToDriverIds(livePositions, drivers) {
  const mapped = {}
  for (const [driverNumber, position] of Object.entries(livePositions)) {
    const driver = drivers.find(d => d.number === Number(driverNumber))
    if (driver) mapped[driver.id] = position
  }
  return mapped
}
