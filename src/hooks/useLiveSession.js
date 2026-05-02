import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getLatestSession, getPositions, getWeather,
  getLatestLapNumber, getRaceControl, getIntervals,
  getStints, getDrivers, getLaps
} from '../lib/openf1'

const REFRESH_INTERVAL = 15000 // 15 Sekunden

// ── Lap-Zeit formatieren: 83.456 → "1:23.456" ─────────────────
export function formatLapTime(seconds) {
  if (seconds == null || seconds <= 0) return null
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(3).padStart(6, '0')
  return mins > 0 ? `${mins}:${secs}` : `${secs}s`
}

// ── Sektorzeit formatieren: 28.123 → "28.1" ───────────────────
export function formatSector(seconds) {
  if (seconds == null || seconds <= 0) return null
  return seconds.toFixed(3)
}

// ── Session-Typ-Kategorie ──────────────────────────────────────
export function getSessionCategory(sessionName) {
  if (!sessionName) return 'other'
  const n = sessionName.toLowerCase()
  if (n.includes('qualifying') || n.includes('sprint qualifying')) return 'qualifying'
  if (n.includes('practice')) return 'practice'
  if (n === 'race' || n === 'sprint') return 'race'
  return 'other'
}

export function useLiveSession() {
  const [session, setSession]         = useState(null)
  const [drivers, setDrivers]         = useState([])
  const [positions, setPositions]     = useState([])
  const [weather, setWeather]         = useState(null)
  const [currentLap, setCurrentLap]   = useState(0)
  const [raceControl, setRaceControl] = useState([])
  const [intervals, setIntervals]     = useState([])
  const [stints, setStints]           = useState([])
  const [laps, setLaps]               = useState([])   // ← NEU: alle Runden
  const [loading, setLoading]         = useState(true)
  const [lastUpdate, setLastUpdate]   = useState(null)
  const [isLive, setIsLive]           = useState(false)
  const timerRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const sess = await getLatestSession()
      if (!sess) return

      setSession(sess)

      const now = new Date()
      const start = new Date(sess.date_start)
      const end   = new Date(sess.date_end)
      const live  = now >= start && now <= end
      setIsLive(live)

      const [pos, wx, lap, rc, iv, st, dr, lp] = await Promise.allSettled([
        getPositions(sess.session_key),
        getWeather(sess.session_key),
        getLatestLapNumber(sess.session_key),
        getRaceControl(sess.session_key),
        getIntervals(sess.session_key),
        getStints(sess.session_key),
        getDrivers(sess.session_key),
        getLaps(sess.session_key),   // ← NEU
      ])

      if (pos.status === 'fulfilled')  setPositions(pos.value ?? [])
      if (wx.status === 'fulfilled')   setWeather(wx.value)
      if (lap.status === 'fulfilled')  setCurrentLap(lap.value)
      if (rc.status === 'fulfilled')   setRaceControl((rc.value ?? []).slice(-20).reverse())
      if (iv.status === 'fulfilled')   setIntervals(iv.value ?? [])
      if (st.status === 'fulfilled')   setStints(st.value ?? [])
      if (dr.status === 'fulfilled')   setDrivers(dr.value ?? [])
      if (lp.status === 'fulfilled')   setLaps(lp.value ?? [])

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

  // ── Helfer: aktueller Reifen pro Fahrernummer ─────────────────
  function getCurrentTyre(driverNumber) {
    const driverStints = stints
      .filter(s => s.driver_number === driverNumber)
      .sort((a, b) => (b.stint_number ?? 0) - (a.stint_number ?? 0))
    return driverStints[0] ?? null
  }

  // ── Helfer: Interval pro Fahrernummer ─────────────────────────
  function getInterval(driverNumber) {
    return intervals.find(i => i.driver_number === driverNumber) ?? null
  }

  // ── Helfer: Fahrerinfo ────────────────────────────────────────
  function getDriver(driverNumber) {
    return drivers.find(d => d.driver_number === driverNumber) ?? null
  }

  // ── Helfer: Beste Runde eines Fahrers ─────────────────────────
  // Filtert Pit-Out-Laps und ungültige Zeiten heraus
  function getBestLap(driverNumber) {
    const driverLaps = laps
      .filter(l =>
        l.driver_number === driverNumber &&
        l.lap_duration != null &&
        l.lap_duration > 0 &&
        !l.is_pit_out_lap
      )
    if (!driverLaps.length) return null
    return driverLaps.reduce((best, l) =>
      l.lap_duration < best.lap_duration ? l : best
    )
  }

  // ── Helfer: Letzte Runde eines Fahrers ───────────────────────
  function getLastLap(driverNumber) {
    const driverLaps = laps
      .filter(l =>
        l.driver_number === driverNumber &&
        l.lap_duration != null &&
        l.lap_duration > 0
      )
      .sort((a, b) => (b.lap_number ?? 0) - (a.lap_number ?? 0))
    return driverLaps[0] ?? null
  }

  // ── Helfer: Alle Runden-Zeiten einer Session ranken ──────────
  // Gibt sortierte Liste: [{ driver_number, bestLap, gap }]
  // gap = Differenz zur schnellsten Zeit in der Session (in Sekunden)
  function getLapTimesRanked() {
    const driverNumbers = [...new Set(laps.map(l => l.driver_number))]
    const entries = driverNumbers
      .map(num => ({ driver_number: num, bestLap: getBestLap(num) }))
      .filter(e => e.bestLap != null)
      .sort((a, b) => a.bestLap.lap_duration - b.bestLap.lap_duration)

    if (!entries.length) return []

    const fastestTime = entries[0].bestLap.lap_duration
    return entries.map((e, i) => ({
      ...e,
      rank: i + 1,
      gap: i === 0 ? 0 : e.bestLap.lap_duration - fastestTime,
    }))
  }

  // ── Helfer: Beste Sektorzeiten pro Fahrer ────────────────────
  // Nützlich für Qualifying um violette/grüne Sektoren anzuzeigen
  function getBestSectors(driverNumber) {
    const driverLaps = laps.filter(
      l => l.driver_number === driverNumber && !l.is_pit_out_lap
    )
    const best = { s1: null, s2: null, s3: null }
    for (const l of driverLaps) {
      if (l.duration_sector_1 > 0 && (best.s1 == null || l.duration_sector_1 < best.s1))
        best.s1 = l.duration_sector_1
      if (l.duration_sector_2 > 0 && (best.s2 == null || l.duration_sector_2 < best.s2))
        best.s2 = l.duration_sector_2
      if (l.duration_sector_3 > 0 && (best.s3 == null || l.duration_sector_3 < best.s3))
        best.s3 = l.duration_sector_3
    }
    return best
  }

  // ── Helfer: Beste Session-Sektorzeiten (für Farbmarkierung) ──
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

  return {
    session, positions, weather, currentLap, raceControl, laps,
    loading, lastUpdate, isLive,
    getCurrentTyre, getInterval, getDriver,
    getBestLap, getLastLap, getLapTimesRanked,
    getBestSectors, getSessionBestSectors,
    refetch: fetchAll,
  }
}
