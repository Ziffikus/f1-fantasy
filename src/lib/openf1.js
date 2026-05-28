// ============================================================
// OpenF1 API – via Supabase Edge Function Proxy (CORS-Fix)
// ============================================================

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openf1-proxy`

// Generischer Fetch mit Error Handling
async function openF1Fetch(endpoint, params = {}) {
  const url = new URL(BASE_URL)
  url.searchParams.set('endpoint', endpoint)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  })

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`OpenF1 API Fehler: ${res.status}`)
  return res.json()
}

// ─── Sessions für ein Meeting abrufen ───────────────────────
export async function getSessions(meetingKey) {
  return openF1Fetch('/sessions', { meeting_key: meetingKey })
}

// ─── Aktuelle Session Key ermitteln ─────────────────────────
// FIX: Sucht explizit nach der gerade laufenden Session,
//      statt blind das letzte Element zu nehmen.
export async function getLatestSession() {
  const sessions = await openF1Fetch('/sessions', { meeting_key: 'latest' })
  if (!sessions?.length) return null

  const now = new Date()

  // 1. Läuft gerade eine Session? → diese nehmen
  const live = sessions.find(s => {
    if (!s.date_start) return false
    const start = new Date(s.date_start)
    // date_end fehlt oft während der Session → 4h-Fenster als Fallback
    const end = s.date_end
      ? new Date(s.date_end)
      : new Date(start.getTime() + 4 * 60 * 60 * 1000)
    return now >= start && now <= end
  })
  if (live) return live

  // 2. Letzte bereits gestartete Session (z.B. kurz nach dem Ende)
  const started = sessions
    .filter(s => s.date_start && new Date(s.date_start) <= now)
    .sort((a, b) => new Date(b.date_start) - new Date(a.date_start))
  if (started.length) return started[0]

  // 3. Nächste zukünftige Session (z.B. vor dem Wochenende)
  return sessions.sort((a, b) => new Date(a.date_start) - new Date(b.date_start))[0]
}

// ─── Fahrerpositionen (live während Session) ────────────────
export async function getPositions(sessionKey) {
  const data = await openF1Fetch('/position', { session_key: sessionKey })

  const latest = {}
  for (const entry of data) {
    if (
      !latest[entry.driver_number] ||
      entry.date > latest[entry.driver_number].date
    ) {
      latest[entry.driver_number] = entry
    }
  }
  return Object.values(latest).sort((a, b) => a.position - b.position)
}

// ─── Finale Ergebnisse einer Session ────────────────────────
export async function getFinalResults(sessionKey) {
  return openF1Fetch('/position', { session_key: sessionKey })
}

// ─── Fahrerliste für ein Meeting ────────────────────────────
export async function getDrivers(sessionKey) {
  return openF1Fetch('/drivers', { session_key: sessionKey })
}

// ─── Meeting-Info ────────────────────────────────────────────
export async function getMeeting(meetingKey) {
  const data = await openF1Fetch('/meetings', { meeting_key: meetingKey })
  return data[0] ?? null
}

// ─── Prüfen ob Session gerade live ist ──────────────────────
// FIX: date_end fehlt oft während der Session → 4h-Fenster als Fallback
export function isSessionLive(sessionStart, sessionEnd) {
  const now = new Date()
  const start = new Date(sessionStart)
  const end = sessionEnd
    ? new Date(sessionEnd)
    : new Date(start.getTime() + 4 * 60 * 60 * 1000)
  return now >= start && now <= end
}

// ─── Nächste relevante Session für Countdown ─────────────────
export function getNextSession(raceWeekend) {
  const now = new Date()
  const sessions = []

  if (raceWeekend.is_sprint_weekend) {
    if (raceWeekend.fp1_start) sessions.push({ label: 'FP1', start: raceWeekend.fp1_start })
    if (raceWeekend.sprint_quali_start) sessions.push({ label: 'Sprint Qualifying', start: raceWeekend.sprint_quali_start })
    if (raceWeekend.sprint_start) sessions.push({ label: 'Sprint', start: raceWeekend.sprint_start })
  } else {
    if (raceWeekend.fp1_start) sessions.push({ label: 'FP1', start: raceWeekend.fp1_start })
    if (raceWeekend.fp2_start) sessions.push({ label: 'FP2', start: raceWeekend.fp2_start })
    if (raceWeekend.fp3_start) sessions.push({ label: 'FP3', start: raceWeekend.fp3_start })
  }

  if (raceWeekend.qualifying_start) sessions.push({ label: 'Qualifying', start: raceWeekend.qualifying_start })
  if (raceWeekend.race_start) sessions.push({ label: 'Rennen', start: raceWeekend.race_start })

  return sessions.find(s => new Date(s.start) > now) ?? null
}

// ─── Wetterdaten ─────────────────────────────────────────────
export async function getWeather(sessionKey) {
  const data = await openF1Fetch('/weather', { session_key: sessionKey })
  return data[data.length - 1] ?? null
}

// ─── Rundenzeiten / aktuelle Runde ───────────────────────────
export async function getLaps(sessionKey) {
  return openF1Fetch('/laps', { session_key: sessionKey })
}

export async function getLatestLapNumber(sessionKey) {
  const laps = await openF1Fetch('/laps', { session_key: sessionKey })
  if (!laps.length) return 0
  return Math.max(...laps.map(l => l.lap_number ?? 0))
}

// ─── Rennkontrolle (Safety Car, Flaggen, etc.) ───────────────
export async function getRaceControl(sessionKey) {
  return openF1Fetch('/race_control', { session_key: sessionKey })
}

// ─── Zeitabstände / Intervalle ───────────────────────────────
export async function getIntervals(sessionKey) {
  const data = await openF1Fetch('/intervals', { session_key: sessionKey })
  const latest = {}
  for (const entry of data) {
    if (!latest[entry.driver_number] || entry.date > latest[entry.driver_number].date) {
      latest[entry.driver_number] = entry
    }
  }
  return Object.values(latest)
}

// ─── Stints (Reifendaten) ────────────────────────────────────
export async function getStints(sessionKey) {
  return openF1Fetch('/stints', { session_key: sessionKey })
}

// ─── Sessions für aktuelles Meeting ──────────────────────────
export async function getSessionsForMeeting(meetingKey) {
  return openF1Fetch('/sessions', { meeting_key: meetingKey })
}
