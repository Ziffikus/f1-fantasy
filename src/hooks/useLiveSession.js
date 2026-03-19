import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getLatestSession, getPositions, getWeather,
  getLatestLapNumber, getRaceControl, getIntervals,
  getStints, getDrivers
} from '../lib/openf1'

const REFRESH_INTERVAL = 15000 // 15 Sekunden

export function useLiveSession() {
  const [session, setSession]         = useState(null)
  const [drivers, setDrivers]         = useState([])
  const [positions, setPositions]     = useState([])
  const [weather, setWeather]         = useState(null)
  const [currentLap, setCurrentLap]   = useState(0)
  const [raceControl, setRaceControl] = useState([])
  const [intervals, setIntervals]     = useState([])
  const [stints, setStints]           = useState([])
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

      const [pos, wx, lap, rc, iv, st, dr] = await Promise.allSettled([
        getPositions(sess.session_key),
        getWeather(sess.session_key),
        getLatestLapNumber(sess.session_key),
        getRaceControl(sess.session_key),
        getIntervals(sess.session_key),
        getStints(sess.session_key),
        getDrivers(sess.session_key),
      ])

      if (pos.status === 'fulfilled')  setPositions(pos.value ?? [])
      if (wx.status === 'fulfilled')   setWeather(wx.value)
      if (lap.status === 'fulfilled')  setCurrentLap(lap.value)
      if (rc.status === 'fulfilled')   setRaceControl((rc.value ?? []).slice(-20).reverse())
      if (iv.status === 'fulfilled')   setIntervals(iv.value ?? [])
      if (st.status === 'fulfilled')   setStints(st.value ?? [])
      if (dr.status === 'fulfilled')   setDrivers(dr.value ?? [])

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

  // Helfer: aktueller Reifen pro Fahrernummer
  function getCurrentTyre(driverNumber) {
    const driverStints = stints
      .filter(s => s.driver_number === driverNumber)
      .sort((a, b) => (b.stint_number ?? 0) - (a.stint_number ?? 0))
    return driverStints[0] ?? null
  }

  // Helfer: Interval pro Fahrernummer
  function getInterval(driverNumber) {
    return intervals.find(i => i.driver_number === driverNumber) ?? null
  }

  // Helfer: Fahrerinfo
  function getDriver(driverNumber) {
    return drivers.find(d => d.driver_number === driverNumber) ?? null
  }

  return {
    session, positions, weather, currentLap, raceControl,
    loading, lastUpdate, isLive,
    getCurrentTyre, getInterval, getDriver,
    refetch: fetchAll,
  }
}
