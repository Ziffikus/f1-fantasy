import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
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

// Session-Meta (Path, Name, SessionStatus) wird weiterhin gepollt –
// das ist eine leichte statische Datei und liefert auch live brauchbare Infos.
const SESSION_POLL_INTERVAL = 15000

// Wenn die letzte Live-Tabellen-Aktualisierung älter ist als das hier,
// gilt der Live-Collector als "nicht aktiv" → Fallback auf Archiv-Endpunkte.
const LIVE_DATA_FRESHNESS_MS = 2 * 60 * 1000

// ─── Hilfsfunktion ───────────────────────────────────────────
// F1-Feeds liefern Listen (Messages, Stints, ...) manchmal als
// Objekt mit numerischen String-Keys statt als Array (Artefakt
// des Delta-Merge-Formats) → hier robust normalisieren
function toArray(x) {
  if (!x) return []
  return Array.isArray(x) ? x : Object.values(x)
}

// ─── Session live? ───────────────────────────────────────────
// "Finalised" = Session abgeschlossen & archiviert, alles andere = live/aktiv
function checkIsLive(session) {
  if (!session) return false
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
  // ── Session-Metadaten (statisch, immer abgerufen) ──────────
  const [session,     setSession]     = useState(null)
  const [sessionPath, setSessionPath] = useState(null)
  const [isLive,      setIsLive]      = useState(false)

  // ── Live-Daten aus Supabase (live_timing Tabelle, Realtime) ─
  // Form: { TimingData: { payload, updated_at }, DriverList: {...}, ... }
  const [liveTopics, setLiveTopics] = useState({})
  const liveTopicsRef = useRef({})
  useEffect(() => { liveTopicsRef.current = liveTopics }, [liveTopics])

  // ── Archiv-Fallback (statische Endpunkte über f1timing.js) ──
  const [archiveTimingData,  setArchiveTimingData]  = useState(null)
  const [archiveDriverList,  setArchiveDriverList]  = useState({})
  const [archiveWeather,     setArchiveWeather]     = useState(null)
  const [archiveRaceControl, setArchiveRaceControl] = useState([])
  const [archiveTrackStatus, setArchiveTrackStatus] = useState(null)
  const [archiveLapCount,    setArchiveLapCount]    = useState(null)
  const [archiveTyreData,    setArchiveTyreData]    = useState(null)

  const [loading,     setLoading]     = useState(true)
  const [lastUpdate,  setLastUpdate]  = useState(null)
  const [error,       setError]       = useState(null)
  const [liveSource,  setLiveSource]  = useState(false) // true = Daten kommen gerade aus live_timing

  const timerRef = useRef(null)

  function isLiveFresh(topics) {
    const ts = topics?.TimingData?.updated_at
    if (!ts) return false
    return Date.now() - new Date(ts).getTime() < LIVE_DATA_FRESHNESS_MS
  }

  // ── Initial-Load + Realtime-Subscription auf live_timing ───
  useEffect(() => {
    let channel
    let cancelled = false

    async function loadInitialLiveData() {
      const { data, error } = await supabase.from('live_timing').select('*')
      if (cancelled) return
      if (error) {
        console.warn('Supabase live_timing initial load error:', error.message)
        return
      }
      const map = {}
      for (const row of data ?? []) {
        map[row.topic] = { payload: row.payload, updated_at: row.updated_at }
      }
      setLiveTopics(map)
    }

    loadInitialLiveData()

    channel = supabase
      .channel('live_timing_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_timing' }, (payload) => {
        const row = payload.new
        if (!row) return
        setLiveTopics(prev => ({
          ...prev,
          [row.topic]: { payload: row.payload, updated_at: row.updated_at },
        }))
      })
      .subscribe()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // ── Polling: Session-Meta + Archiv-Fallback ─────────────────
  const fetchAll = useCallback(async () => {
    try {
      const sess = await getTimingSession()
      setSession(sess)
      setIsLive(checkIsLive(sess))

      const path = sess.Path
      setSessionPath(path)

      const fresh = isLiveFresh(liveTopicsRef.current)
      setLiveSource(fresh)

      // Archiv-Endpunkte nur abrufen, wenn die Live-Tabelle nicht aktuell ist
      // (spart Requests, und während Live-Sessions würden diese sowieso 404 werfen)
      if (!fresh) {
        const [td, dl, wx, rc, ts, lc, tad] = await Promise.allSettled([
          getTimingData(path),
          getDriverList(path),
          getWeatherData(path),
          getRaceControlMessages(path),
          getTrackStatus(path),
          getLapCount(path),
          getTimingAppData(path),
        ])

        if (td.status === 'fulfilled') setArchiveTimingData(td.value)
        if (dl.status === 'fulfilled') setArchiveDriverList(dl.value)
        if (wx.status === 'fulfilled') setArchiveWeather(wx.value)
        if (rc.status === 'fulfilled') setArchiveRaceControl(toArray(rc.value?.Messages))
        if (ts.status === 'fulfilled') setArchiveTrackStatus(ts.value)
        if (lc.status === 'fulfilled') setArchiveLapCount(lc.value)
        if (tad.status === 'fulfilled') setArchiveTyreData(tad.value)
      }

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
    timerRef.current = setInterval(fetchAll, SESSION_POLL_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchAll])

  // ── Finale Werte: live_timing bevorzugt, sonst Archiv ────────
  const timingData   = liveSource ? (liveTopics.TimingData?.payload ?? null)    : archiveTimingData
  const driverList   = liveSource ? (liveTopics.DriverList?.payload ?? {})      : archiveDriverList
  const weather      = liveSource ? (liveTopics.WeatherData?.payload ?? null)   : archiveWeather
  const trackStatus  = liveSource ? (liveTopics.TrackStatus?.payload ?? null)   : archiveTrackStatus
  const lapCount     = liveSource ? (liveTopics.LapCount?.payload ?? null)      : archiveLapCount
  const tyreData     = liveSource ? (liveTopics.TimingAppData?.payload ?? null) : archiveTyreData
  const raceControl  = liveSource
    ? toArray(liveTopics.RaceControlMessages?.payload?.Messages)
    : archiveRaceControl

  // ─── Retired-Status aus RC-Messages ableiten ───────────────
  function isRetiredFromRC(racingNumber) {
    const patterns = [/RETIRED/i, /MECHANICAL/i]
    const carRegex = new RegExp(`\\bCAR\\s+${racingNumber}\\b`)
    return raceControl.some(msg => {
      const text = String(msg.Message ?? '')
      const matchesDriver =
        String(msg.RacingNumber) === String(racingNumber) ||
        carRegex.test(text)
      return matchesDriver && patterns.some(p => p.test(text))
    })
  }

  function getCurrentTyre(racingNumber) {
    const stints = toArray(tyreData?.Lines?.[racingNumber]?.Stints)
    if (!stints.length) return null
    return stints[stints.length - 1]
  }

  function getDriversRanked() {
    if (!timingData?.Lines) return []

    return Object.entries(timingData.Lines)
      .map(([num, timing]) => {
        const driver = driverList[num] ?? {}
        const tyre   = getCurrentTyre(num)

        const retired = timing.Retired === true || timing.Stopped === true || isRetiredFromRC(num)

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
    liveSource,    // true = Daten kommen gerade live aus dem Collector, false = Archiv-Fallback
    loading,
    lastUpdate,
    error,
    getDriversRanked,
    getCurrentTyre,
    refetch: fetchAll,
  }
}
