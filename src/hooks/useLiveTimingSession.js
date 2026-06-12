import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getTimingSession,
  getTimingData,
  getDriverList,
  getWeatherData,
  getRaceControlMessages,
  getTrackStatus,
  getLapCount,
  getTimingAppData,
} from '../lib/f1timing'

// Kein Rate Limiting bei F1 Live Timing → 15s reicht
const REFRESH_INTERVAL = 15000

// ─── Session live? ───────────────────────────────────────────
function checkIsLive(session) {
  if (!session) return false
  // "Finalised" = abgeschlossen, alles andere = aktiv/live
  return session.SessionStatus !== 'Finalised'
}

// ─── Tyre Farben & Kürzel ────────────────────────────────────
export const TYRE_COLORS = {
  SOFT:         '#e8002d',
  MEDIUM:       '#ffd700',
  HARD:         '#ffffff',
  INTERMEDIATE: '#39b54a',
  WET:          '#0067ff',
  UNKNOWN:      '#888888',
}

export const TYRE_SHORT = {
  SOFT:         'S',
  MEDIUM:       'M',
  HARD:         'H',
  INTERMEDIATE: 'I',
  WET:          'W',
  UNKNOWN:      '?',
}

// ─── Track Status Labels ─────────────────────────────────────
export const TRACK_STATUS = {
  '1': { label: 'Track Clear',  color: '#4ade80' },
  '2': { label: 'Yellow Flag',  color: '#ffd700' },
  '3': { label: 'Flag',         color: '#ffd700' },
  '4': { label: 'Safety Car',   color: '#f97316' },
  '5': { label: 'Red Flag',     color: '#ef4444' },
  '6': { label: 'VSC',          color: '#f97316' },
  '7': { label: 'VSC Ending',   color: '#fbbf24' },
}

export function useLiveTimingSession() {
  const [session,      setSession]      = useState(null)
  const [sessionPath,  setSessionPath]  = useState(null)
  const [timingData,   setTimingData]   = useState(null)
  const [driverList,   setDriverList]   = useState({})
  const [weather,      setWeather]      = useState(null)
  const [raceControl,  setRaceControl]  = useState([])
  const [trackStatus,  setTrackStatus]  = useState(null)
  const [lapCount,     setLapCount]     = useState(null)
  const [tyreData,     setTyreData]     = useState(null)
  const [isLive,       setIsLive]       = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [lastUpdate,   setLastUpdate]   = useState(null)
  const [error,        setError]        = useState(null)

  const timerRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      // 1. Session holen (gibt uns Path + Status)
      const sess = await getTimingSession()
      setSession(sess)
      setIsLive(checkIsLive(sess))

      const path = sess.Path
      setSessionPath(path)

      // 2. Alle Daten parallel – Fehler einzelner Endpoints brechen nichts ab
      const [td, dl, wx, rc, ts, lc, tad] = await Promise.allSettled([
        getTimingData(path),
        getDriverList(path),
        getWeatherData(path),
        getRaceControlMessages(path),
        getTrackStatus(path),
        getLapCount(path),
        getTimingAppData(path),
      ])

      if (td.status  === 'fulfilled') {
        setTimingData(td.value)
        // DEBUG: Rohdaten für Diagnose zugänglich machen – nach Fix entfernen
        window.__f1timing = td.value
      }
      if (dl.status  === 'fulfilled') setDriverList(dl.value)
      if (wx.status  === 'fulfilled') setWeather(wx.value)
      if (rc.status  === 'fulfilled') setRaceControl(rc.value?.Messages ?? [])
      if (ts.status  === 'fulfilled') setTrackStatus(ts.value)
      if (lc.status  === 'fulfilled') setLapCount(lc.value)
      if (tad.status === 'fulfilled') setTyreData(tad.value)

      setLastUpdate(new Date())
      setError(null)
    } catch (e) {
      console.warn('F1 Timing fetch error:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    timerRef.current = setInterval(fetchAll, REFRESH_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchAll])

  // ─── Fahrer sortiert nach Position mit allen Timing-Daten ──
  // ─── Retired-Status aus RC-Messages ableiten ───────────────
  function isRetiredFromRC(racingNumber) {
    // Nur echte Retirement-Meldungen, keine Safety-Car/Yellow-Flag Unfälle ohne Fahrerbezug
    const patterns = [/RETIRED/i, /MECHANICAL/i]
    // Word-Boundary Regex: "CAR 1" matcht nicht auf "CAR 10", "CAR 11", etc.
    const carRegex = new RegExp(`\\bCAR\\s+${racingNumber}\\b`)
    return raceControl.some(msg => {
      const text = String(msg.Message ?? '')
      const matchesDriver =
        String(msg.RacingNumber) === String(racingNumber) ||
        carRegex.test(text)
      return matchesDriver && patterns.some(p => p.test(text))
    })
  }

  function getDriversRanked() {
    if (!timingData?.Lines) return []

    return Object.entries(timingData.Lines)
      .map(([num, timing]) => {
        const driver = driverList[num] ?? {}
        const tyre   = getCurrentTyre(num)

        // Retired: direkt aus TimingData ODER aus Race Control Messages
        const retired = timing.Retired === true || isRetiredFromRC(num)

        return {
          racingNumber:  num,
          position:      parseInt(timing.Position ?? '99'),
          driverCode:    driver.Tla ?? num,
          fullName:      driver.FullName   ?? `#${num}`,
          firstName:     driver.FirstName  ?? '',
          lastName:      driver.LastName   ?? '',
          teamName:      driver.TeamName   ?? '',
          teamColour:    driver.TeamColour ?? '888888',
          lastLapTime:   timing.LastLapTime?.Value ?? null,
          lastLapStatus: timing.LastLapTime?.Status ?? null,
          bestLapTime:   timing.BestLapTime?.Value ?? null,
          bestLapLap:    timing.BestLapTime?.Lap   ?? null,
          gapToLeader:   timing.GapToLeader ?? null,
          interval:      timing.IntervalToPositionAhead?.Value ?? null,
          catching:      timing.IntervalToPositionAhead?.Catching ?? false,
          numberOfLaps:  timing.NumberOfLaps ?? 0,
          inPit:         timing.InPit   ?? false,
          pitOut:        timing.PitOut  ?? false,
          stopped:       timing.Stopped ?? false,
          retired,
          sectors:       timing.Sectors ?? [],
          tyre,
        }
      })
      .sort((a, b) => a.position - b.position)
  }

  function getCurrentTyre(racingNumber) {
    const stints = tyreData?.Lines?.[racingNumber]?.Stints
    if (!stints?.length) return null
    return stints[stints.length - 1]
  }

  return {
    session,
    sessionPath,
    timingData,
    driverList,
    weather,
    raceControl,
    trackStatus,
    lapCount,
    tyreData,
    isLive,
    loading,
    lastUpdate,
    error,
    getDriversRanked,
    getCurrentTyre,
    refetch: fetchAll,
  }
}
