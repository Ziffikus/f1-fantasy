// ============================================================
// OpenF1 API – https://openf1.org
// Kostenlos, ~1 Minute Verzögerung während Rennen
// ============================================================

const BASE_URL = 'https://api.openf1.org/v1'

// Generischer Fetch mit Error Handling
async function openF1Fetch(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}${endpoint}`)
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
export async function getLatestSession() {
  const sessions = await openF1Fetch('/sessions', { meeting_key: 'latest' })
  return sessions[sessions.length - 1] ?? null
}

// ─── Fahrerpositionen (live während Session) ────────────────
export async function getPositions(sessionKey) {
  // Gibt die letzte bekannte Position jedes Fahrers zurück
  const data = await openF1Fetch('/position', { session_key: sessionKey })

  // Nur die neueste Position pro Fahrer
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
  return openF1Fetch('/position', {
    session_key: sessionKey,
    // Nur finales Ergebnis (letzter Eintrag pro Fahrer)
  })
}

// ─── Fahrerliste für ein Meeting ────────────────────────────
export async function getDrivers(sessionKey) {
  return openF1Fetch('/drivers', { session_key: sessionKey })
}

// ─── Meeting-Info (für Streckenbilder etc.) ──────────────────
export async function getMeeting(meetingKey) {
  const data = await openF1Fetch('/meetings', { meeting_key: meetingKey })
  return data[0] ?? null
}

// ─── Prüfen ob Session gerade live ist ──────────────────────
export function isSessionLive(sessionStart, sessionEnd) {
  const now = new Date()
  return now >= new Date(sessionStart) && now <= new Date(sessionEnd)
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
  // Neueste Wetterdaten
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
