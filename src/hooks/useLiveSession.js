import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getLatestSession, getPositions, getWeather,
  getLatestLapNumber, getRaceControl, getIntervals,
  getStints, getDrivers, getLaps, getPitStops, getSessionResult
} from '../lib/openf1'

const REFRESH_INTERVAL = 15000

export function formatLapTime(seconds) {
  if (seconds == null || seconds <= 0) return null
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(3).padStart(6, '0')
  return mins > 0 ? `${mins}:${secs}` : `${secs}s`
}

export function formatSector(seconds) {
  if (seconds == null || seconds <= 0) return null
  return seconds.toFixed(3)
}

export function getSessionCategory(sessionName) {
  if (!sessionName) return 'other'
  const n = sessionName.toLowerCase()
  if (n.includes('qualifying') || n.includes('sprint qualifying')) return 'qualifying'
  if (n.includes('practice')) return 'practice'
  if (n === 'race' || n === 'sprint') return 'race'
  return 'other'
}

function checkIsLive(sess) {
  if (!sess?.date_start) return false
  const now = new Date()
  const start = new Date(sess.date_start)
  const end = sess.date_end
    ? new Date(sess.date_end)
    : new Date(start.getTime() + 4 * 60 * 60 * 1000)
  return now >= start && now <= end
}

// ── Qualifying-Segment aus session_result ableiten ────────────
// gap_to_leader ist ein Array [q1_gap, q2_gap, q3_gap] oder null
// Das letzte nicht-null Element zeigt das höchste erreichte Segment.
function getQualifyingSegment(gapArray) {
  if (!Array.isArray(gapArray)) return null
  if (gapArray[2] != null) return 'Q3'
  if (gapArray[1] != null) return 'Q2'
  if (gapArray[0] != null) return 'Q1'
  return null
}

export function useLiveSession() {
  const [session, setSession]             = useState(null)
  const [drivers, setDrivers]             = useState([])
  const [positions, setPositions]         = useState([])
  const [weather, setWeather]             = useState(null)
  const [currentLap, setCurrentLap]       = useState(0)
  const [raceControl, setRaceControl]     = useState([])
  const [intervals, setIntervals]         = useState([])
  const [stints, setStints]               = useState([])
  const [pitStops, setPitStops]           = useState([])
  const [sessionResult, setSessionResult] = useState([])
  const [laps, setLaps]                   = useState([])
  const [loading, setLoading]             = useState(true)
  const [lastUpdate, setLastUpdate]       = useState(null)
  const [isLive, setIsLive]               = useState(false)
  const timerRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const sess = await getLatestSession()
      if (!sess) return
      setSession(sess)
      setIsLive(checkIsLive(sess))

      const [pos, wx, lap, rc, iv, st, dr, lp, pt, sr] = await Promise.allSettled([
        getPositions(sess.session_key),
        getWeather(sess.session_key),
        getLatestLapNumber(sess.session_key),
        getRaceControl(sess.session_key),
        getIntervals(sess.session_key),
        getStints(sess.session_key),
        getDrivers(sess.session_key),
        getLaps(sess.session_key),
        getPitStops(sess.session_key),
        getSessionResult(sess.session_key),
      ])

      if (pos.status === 'fulfilled') setPositions(pos.value ?? [])
      if (wx.status  === 'fulfilled') setWeather(wx.value)
      if (lap.status === 'fulfilled') setCurrentLap(lap.value)
      if (rc.status  === 'fulfilled') setRaceControl((rc.value ?? []).slice(-20).reverse())
      if (iv.status  === 'fulfilled') setIntervals(iv.value ?? [])
      if (st.status  === 'fulfilled') setStints(st.value ?? [])
      if (dr.status  === 'fulfilled') setDrivers(dr.value ?? [])
      if (lp.status  === 'fulfilled') setLaps(lp.value ?? [])
      if (pt.status  === 'fulfilled') setPitStops(pt.value ?? [])
      if (sr.status  === 'fulfilled') setSessionResult(sr.value ?? [])

      setLastUpdate(new Date())
    } catch (e) {
      console.warn('Live session fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    timerRef.current = setInterval(fetchAll, REFRESH_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchAll])

  function getCurrentTyre(driverNumber) {
    const driverStints = stints
      .filter(s => s.driver_number === driverNumber)
      .sort((a, b) => (b.stint_number ?? 0) - (a.stint_number ?? 0))
    return driverStints[0] ?? null
  }

  function getInterval(driverNumber) {
    return intervals.find(i => i.driver_number === driverNumber) ?? null
  }

  function getDriver(driverNumber) {
    return drivers.find(d => d.driver_number === driverNumber) ?? null
  }

  function getBestLap(driverNumber) {
    const driverLaps = laps.filter(l =>
      l.driver_number === driverNumber &&
      l.lap_duration != null && l.lap_duration > 0 &&
      !l.is_pit_out_lap
    )
    if (!driverLaps.length) return null
    return driverLaps.reduce((best, l) => l.lap_duration < best.lap_duration ? l : best)
  }

  function getLastLap(driverNumber) {
    return laps
      .filter(l => l.driver_number === driverNumber && l.lap_duration != null && l.lap_duration > 0)
      .sort((a, b) => (b.lap_number ?? 0) - (a.lap_number ?? 0))[0] ?? null
  }

  function getLapTimesRanked() {
    const driverNumbers = [...new Set(laps.map(l => l.driver_number))]
    const entries = driverNumbers
      .map(num => ({ driver_number: num, bestLap: getBestLap(num) }))
      .filter(e => e.bestLap != null)
      .sort((a, b) => a.bestLap.lap_duration - b.bestLap.lap_duration)
    if (!entries.length) return []
    const fastestTime = entries[0].bestLap.lap_duration
    return entries.map((e, i) => ({
      ...e, rank: i + 1,
      gap: i === 0 ? 0 : e.bestLap.lap_duration - fastestTime,
    }))
  }

  function getBestSectors(driverNumber) {
    const driverLaps = laps.filter(l => l.driver_number === driverNumber && !l.is_pit_out_lap)
    const best = { s1: null, s2: null, s3: null }
    for (const l of driverLaps) {
      if (l.duration_sector_1 > 0 && (best.s1 == null || l.duration_sector_1 < best.s1)) best.s1 = l.duration_sector_1
      if (l.duration_sector_2 > 0 && (best.s2 == null || l.duration_sector_2 < best.s2)) best.s2 = l.duration_sector_2
      if (l.duration_sector_3 > 0 && (best.s3 == null || l.duration_sector_3 < best.s3)) best.s3 = l.duration_sector_3
    }
    return best
  }

  function getSessionBestSectors() {
    const allDrivers = [...new Set(laps.map(l => l.driver_number))]
    let bestS1 = null, bestS2 = null, bestS3 = null
    for (const num of allDrivers) {
      const b = getBestSectors(num)
      if (b.s1 != null && (bestS1 == null || b.s1 < bestS1)) bestS1 = b.s1
      if (b.s2 != null && (bestS2 == null || b.s2 < bestS2)) bestS2 = b.s2
      if (b.s3 != null && (bestS3 == null || b.s3 < bestS3)) bestS3 = b.s3
    }
    return { s1: bestS1, s2: bestS2, s3: bestS3 }
  }

  function getPitCount(driverNumber) {
    return pitStops.filter(p => p.driver_number === driverNumber).length
  }

  // ── DNF-Status: session_result (nach Session) → RC (live) ────
  const RC_RETIRED_PATTERNS = [/\bRETIRED\b/, /\bACCIDENT\b/, /\bMECHANICAL\b/, /\bCOLLISION DAMAGE\b/]

  function getDriverStatus(driverNumber) {
    const result = sessionResult.find(r => r.driver_number === driverNumber)
    if (result) {
      if (result.dnf) return 'DNF'
      if (result.dns) return 'DNS'
      if (result.dsq) return 'DSQ'
    }
    const rcMatch = raceControl.find(msg => {
      const inMsg = String(msg.message ?? '').toUpperCase()
      const matchesDriver = msg.driver_number === driverNumber || inMsg.includes(`CAR ${driverNumber}`)
      return matchesDriver && RC_RETIRED_PATTERNS.some(p => p.test(inMsg))
    })
    if (rcMatch) return 'DNF'
    return null
  }

  // ── Qualifying: Eliminated-Fahrer aus session_result ─────────
  // session_result.gap_to_leader ist Array [q1, q2, q3]
  // Fahrer die nur Q1 haben (q2==null) schieden in Q1 aus, etc.
  // Gibt sortierte Liste der bereits eliminierten Fahrer zurück
  // die NICHT mehr in den aktiven laps/positions auftauchen.
  function getEliminatedDrivers() {
    if (!sessionResult.length) return []
    const category = getSessionCategory(session?.session_name)
    if (category !== 'qualifying') return []

    const activeDriverNumbers = new Set(laps.map(l => l.driver_number))

    return sessionResult
      .filter(r => {
        // Nur Fahrer die aus einem früheren Segment eliminiert wurden
        const seg = getQualifyingSegment(r.gap_to_leader)
        // Wenn gap_to_leader ein Array ist und der Fahrer nicht mehr aktiv läuft
        if (!Array.isArray(r.gap_to_leader)) return false
        // Fahrer der nur Q1-Zeit hat aber keine Q2-Zeit → Q1-eliminiert
        // Wir zeigen alle die ein Segment hinter dem aktuellen sind
        return !activeDriverNumbers.has(r.driver_number) || seg !== 'Q3'
      })
      .map(r => ({
        driver_number: r.driver_number,
        position: r.position,
        eliminatedIn: getQualifyingSegment(r.gap_to_leader),
        bestTime: Array.isArray(r.gap_to_leader)
          ? (r.gap_to_leader[2] ?? r.gap_to_leader[1] ?? r.gap_to_leader[0])
          : null,
      }))
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
  }

  function getDriversRanked() {
    if (!positions.length) return []
    return positions.map(p => {
      const driver        = getDriver(p.driver_number)
      const tyre          = getCurrentTyre(p.driver_number)
      const interval      = getInterval(p.driver_number)
      const bestLap       = getBestLap(p.driver_number)
      const lastLap       = getLastLap(p.driver_number)
      const bestSectors   = getBestSectors(p.driver_number)
      const pitCount      = getPitCount(p.driver_number)
      const status        = getDriverStatus(p.driver_number)
      const lapsSinceTyre = tyre?.lap_start && currentLap ? currentLap - tyre.lap_start : null
      return { ...p, driver, tyre, interval, bestLap, lastLap, bestSectors, pitCount, status, lapsSinceTyre }
    })
  }

  return {
    session, positions, weather, currentLap, raceControl, laps,
    loading, lastUpdate, isLive,
    getCurrentTyre, getInterval, getDriver,
    getBestLap, getLastLap, getLapTimesRanked,
    getBestSectors, getSessionBestSectors,
    getPitCount, getDriverStatus, getDriversRanked,
    getEliminatedDrivers,
    refetch: fetchAll,
  }
}
