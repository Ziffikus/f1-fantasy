// ─── useSessionResults.js ────────────────────────────────────
import { useState, useCallback } from 'react'

const OPENF1_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openf1-proxy`

// Matcht gegen session_name von OpenF1 (nicht session_type!)
// OpenF1: session_type="Practice", session_name="Practice 1"
const SESSION_NAME_MAP = {
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

async function proxyFetch(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString()
  const url = `${OPENF1_BASE}?${qs}`
  console.log('[OpenF1 →]', url)
  const res  = await fetch(url)
  const data = await res.json()
  console.log('[OpenF1 ←]', params.endpoint, data?.length ?? data)
  return data
}

export function useSessionResults(weekend) {
  const [results, setResults]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [activeKey, setActiveKey]   = useState(null)
  const [meetingKey, setMeetingKey] = useState(null)

  const fetchSession = useCallback(async (sessionKey) => {
    // Toggle
    if (sessionKey === activeKey) {
      setActiveKey(null); setResults([]); setError(null)
      return
    }

    const sessionName = SESSION_NAME_MAP[sessionKey]
    if (!sessionName || !weekend) return

    const sessionDate = weekend[DATE_FIELD_MAP[sessionKey]]
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
      // ── Schritt 1: meeting_key ermitteln (gecacht pro Weekend) ────────
      let mKey = meetingKey
      if (!mKey) {
        const year     = new Date(weekend.race_start).getFullYear()
        const meetings = await proxyFetch({ endpoint: '/meetings', year })

        if (!meetings?.length) {
          setError('Keine Meetings von OpenF1 erhalten.')
          setLoading(false)
          return
        }

        const raceDate = new Date(weekend.race_start)
        const closest  = meetings.reduce((best, m) =>
          Math.abs(new Date(m.date_start) - raceDate) <
          Math.abs(new Date(best.date_start) - raceDate) ? m : best
        )
        mKey = closest.meeting_key
        setMeetingKey(mKey)
        console.log('[useSessionResults] meeting_key:', mKey, closest.meeting_name)
      }

      // ── Schritt 2: alle Sessions des Meetings holen, lokal filtern ────
      const allSessions = await proxyFetch({ endpoint: '/sessions', meeting_key: mKey })

      if (!allSessions?.length) {
        setError('Keine Sessions für dieses Meeting gefunden.')
        setLoading(false)
        return
      }

      // Match auf session_name (z.B. "Practice 1"), case-insensitive
      const target = sessionName.toLowerCase()
      const sess   = allSessions.find(s =>
        (s.session_name ?? '').toLowerCase() === target
      )

      if (!sess) {
        const available = allSessions.map(s => s.session_name).join(', ')
        setError(`"${sessionName}" nicht gefunden. Verfügbar: ${available}`)
        setLoading(false)
        return
      }

      console.log('[useSessionResults] session:', sess.session_name, sess.session_key)

      // ── Schritt 3: Positionen + Fahrerinfos ───────────────────────────
      const [allPositions, drivers] = await Promise.all([
        proxyFetch({ endpoint: '/position', session_key: sess.session_key }),
        proxyFetch({ endpoint: '/drivers',  session_key: sess.session_key }),
      ])

      if (!allPositions?.length) {
        setError('Keine Positionsdaten für diese Session verfügbar.')
        setLoading(false)
        return
      }

      // ── Schritt 4: letzte Position pro Fahrer ─────────────────────────
      const latestByNum = {}
      for (const pos of allPositions) {
        const num = pos.driver_number
        if (!latestByNum[num] || new Date(pos.date) > new Date(latestByNum[num].date)) {
          latestByNum[num] = pos
        }
      }

      // ── Schritt 5: Fahrerinfo-Map ─────────────────────────────────────
      const driverMap = {}
      for (const d of (drivers ?? [])) driverMap[d.driver_number] = d

      // ── Schritt 6: Sortierte Liste ────────────────────────────────────
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
      setError('Netzwerkfehler: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [activeKey, weekend, meetingKey])

  const reset = useCallback(() => {
    setMeetingKey(null); setActiveKey(null); setResults([]); setError(null)
  }, [])

  return { fetchSession, results, loading, error, activeKey, reset }
}
