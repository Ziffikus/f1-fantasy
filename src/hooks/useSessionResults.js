// ─── useSessionResults.js ────────────────────────────────────
// Lädt Fahrerpositionen für eine Session eines bestimmten Rennwochenendes.
//
// Strategie:
//   1. Über /meetings das Meeting des Wochenendes per Renndatum finden
//      → meeting_key ist eindeutig pro Rennwochenende
//   2. Über /sessions?meeting_key=...&session_type=... die exakte Session holen
//   3. Positionen + Fahrerinfos über session_key laden
//
// Das ist zuverlässiger als ein Zeitfenster, weil FP3/Qualifying/Sprint
// oft nur 2–3 Stunden auseinanderliegen und sich ein ±6h-Fenster überlappen
// würde.

import { useState, useCallback } from 'react'

const OPENF1_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openf1-proxy`

const SESSION_TYPE_MAP = {
  fp1:          'Practice 1',
  fp2:          'Practice 2',
  fp3:          'Practice 3',
  sprint_quali: 'Sprint Qualifying',
  qualifying:   'Qualifying',
  sprint:       'Sprint',
  race:         'Race',
}

const DATE_FIELD_MAP = {
  fp1:          'fp1_start',
  fp2:          'fp2_start',
  fp3:          'fp3_start',
  sprint_quali: 'sprint_quali_start',
  qualifying:   'qualifying_start',
  sprint:       'sprint_start',
  race:         'race_start',
}

/**
 * @param {object|null} weekend  – race_weekends-Objekt aus Supabase
 */
export function useSessionResults(weekend) {
  const [results, setResults]         = useState([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [activeKey, setActiveKey]     = useState(null)
  // meeting_key cachen – bleibt gleich für alle Sessions dieses Wochenendes
  const [meetingKey, setMeetingKey]   = useState(null)

  const fetchSession = useCallback(async (sessionKey) => {
    // Toggle: nochmals klicken schließt das Panel
    if (sessionKey === activeKey) {
      setActiveKey(null)
      setResults([])
      setError(null)
      return
    }

    const sessionType = SESSION_TYPE_MAP[sessionKey]
    if (!sessionType || !weekend) return

    const dateField   = DATE_FIELD_MAP[sessionKey]
    const sessionDate = weekend[dateField]
    if (!sessionDate) {
      setError('Kein Datum für diese Session hinterlegt.')
      setActiveKey(sessionKey)
      return
    }

    setActiveKey(sessionKey)
    setLoading(true)
    setError(null)
    setResults([])

    try {
      // ── Schritt 1: meeting_key ermitteln (einmal pro Weekend cachen) ──
      let mKey = meetingKey
      if (!mKey) {
        // Renndatum als Ankerpunkt – das Meeting enthält immer das Rennen
        const raceDate   = new Date(weekend.race_start)
        // OpenF1 /meetings nach Jahr filtern, dann das richtige anhand
        // des Datums heraussuchen
        const year       = raceDate.getFullYear()
        const meetingRes = await fetch(
          `${OPENF1_BASE}?endpoint=/meetings&year=${year}`
        )
        const meetings   = await meetingRes.json()

        if (!meetings?.length) {
          setError('Keine Meeting-Daten in OpenF1 gefunden.')
          setLoading(false)
          return
        }

        // Das Meeting dessen date_start am nächsten am Renn-Datum liegt
        // (race_start ist immer das späteste Event des Weekends →
        //  Meeting-Start liegt wenige Tage früher, aber ist eindeutig)
        const closest = meetings.reduce((best, m) => {
          const diff     = Math.abs(new Date(m.date_start) - raceDate)
          const bestDiff = Math.abs(new Date(best.date_start) - raceDate)
          return diff < bestDiff ? m : best
        })

        mKey = closest.meeting_key
        setMeetingKey(mKey)
      }

      // ── Schritt 2: exakte Session per meeting_key + session_type ──────
      const sessionRes = await fetch(
        `${OPENF1_BASE}?endpoint=/sessions` +
        `&meeting_key=${mKey}` +
        `&session_type=${encodeURIComponent(sessionType)}`
      )
      const sessions = await sessionRes.json()

      if (!sessions?.length) {
        setError(`Session "${sessionType}" für dieses Rennen nicht in OpenF1 gefunden.`)
        setLoading(false)
        return
      }

      const openf1Key = sessions[0].session_key

      // ── Schritt 3: Positionen + Fahrerinfos parallel ──────────────────
      const [posRes, drvRes] = await Promise.all([
        fetch(`${OPENF1_BASE}?endpoint=/position&session_key=${openf1Key}`),
        fetch(`${OPENF1_BASE}?endpoint=/drivers&session_key=${openf1Key}`),
      ])
      const [allPositions, drivers] = await Promise.all([
        posRes.json(),
        drvRes.json(),
      ])

      if (!allPositions?.length) {
        setError('Keine Positionsdaten für diese Session verfügbar.')
        setLoading(false)
        return
      }

      // ── Schritt 4: Letzte bekannte Position pro Fahrer ────────────────
      const latestByNum = {}
      for (const pos of allPositions) {
        const num = pos.driver_number
        if (
          !latestByNum[num] ||
          new Date(pos.date) > new Date(latestByNum[num].date)
        ) {
          latestByNum[num] = pos
        }
      }

      // ── Schritt 5: Fahrerinfo-Map ──────────────────────────────────────
      const driverMap = {}
      for (const d of (drivers ?? [])) {
        driverMap[d.driver_number] = d
      }

      // ── Schritt 6: Liste zusammensetzen + sortieren ───────────────────
      const list = Object.values(latestByNum)
        .map(pos => {
          const d = driverMap[pos.driver_number] ?? {}
          return {
            driver_number:  pos.driver_number,
            position:       pos.position,
            broadcast_name: d.broadcast_name ?? `#${pos.driver_number}`,
            full_name:      d.full_name ?? '',
            abbreviation:   d.name_acronym ?? '',
            team_name:      d.team_name ?? '',
            team_colour:    d.team_colour ? `#${d.team_colour}` : '#888',
            headshot_url:   d.headshot_url ?? null,
          }
        })
        .sort((a, b) => a.position - b.position)

      setResults(list)
    } catch (err) {
      console.warn('useSessionResults error:', err)
      setError('Netzwerkfehler beim Laden der Session-Daten.')
    } finally {
      setLoading(false)
    }
  }, [activeKey, weekend, meetingKey])

  // meeting_key zurücksetzen wenn sich das Weekend ändert
  const reset = useCallback(() => {
    setMeetingKey(null)
    setActiveKey(null)
    setResults([])
    setError(null)
  }, [])

  return { fetchSession, results, loading, error, activeKey, reset }
}
