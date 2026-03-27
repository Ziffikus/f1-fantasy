import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useRaceWeekends() {
  const [weekends, setWeekends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('race_weekends')
        .select('*')
        .order('round', { ascending: true })
      if (error) setError(error)
      else setWeekends(data ?? [])
      setLoading(false)
    }
    fetch()
  }, [])

  const now = new Date()

  const nextWeekend = weekends.find(w => new Date(w.race_start) > now) ?? null
  const currentWeekend = weekends.find(w => {
    const fp1 = w.fp1_start ? new Date(w.fp1_start) : new Date(w.qualifying_start)
    const race = new Date(w.race_start)
    return now >= fp1 && now <= race
  }) ?? null
  const activeWeekend = currentWeekend ?? nextWeekend

  return { weekends, loading, error, nextWeekend, currentWeekend, activeWeekend }
}

export function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState(calcTimeLeft(targetDate))

  useEffect(() => {
    if (!targetDate) return
    const interval = setInterval(() => {
      setTimeLeft(calcTimeLeft(targetDate))
    }, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  return timeLeft
}

function calcTimeLeft(targetDate) {
  if (!targetDate) return null
  const diff = new Date(targetDate) - new Date()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, over: true }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    over: false,
  }
}
