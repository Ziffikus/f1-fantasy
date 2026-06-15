// ============================================================
// F1 Live Timing – via Supabase Proxy (CORS-Workaround)
// Quelle: livetiming.formula1.com
// ============================================================

const PROXY   = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openf1-proxy`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function f1Fetch(path) {
  const url = new URL(PROXY)
  url.searchParams.set('source', 'f1timing')
  url.searchParams.set('path', path)

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey': ANON_KEY,
    },
  })
  if (!res.ok) throw new Error(`F1 Timing Fehler: ${res.status} – ${path}`)
  return res.json()
}

// ─── Aktuelle Session ─────────────────────────────────────────
// Gibt z.B. { Path: "2026/2026-06-14_Barcelona_Grand_Prix/2026-06-13_Practice_1/", ... }
export async function getTimingSession() {
  return f1Fetch('SessionInfo.json')
}

// ─── Timing Data ──────────────────────────────────────────────
export async function getTimingData(path) {
  return f1Fetch(`${path}TimingData.json`)
}

// ─── Fahrerliste ──────────────────────────────────────────────
export async function getDriverList(path) {
  return f1Fetch(`${path}DriverList.json`)
}

// ─── Wetter ───────────────────────────────────────────────────
export async function getWeatherData(path) {
  return f1Fetch(`${path}WeatherData.json`)
}

// ─── Race Control ─────────────────────────────────────────────
export async function getRaceControlMessages(path) {
  return f1Fetch(`${path}RaceControlMessages.json`)
}

// ─── Track Status ─────────────────────────────────────────────
export async function getTrackStatus(path) {
  return f1Fetch(`${path}TrackStatus.json`)
}

// ─── Rundenzähler ─────────────────────────────────────────────
export async function getLapCount(path) {
  return f1Fetch(`${path}LapCount.json`)
}

// ─── Reifendaten ──────────────────────────────────────────────
export async function getTimingAppData(path) {
  return f1Fetch(`${path}TimingAppData.json`)
}

// ─── Session Status (live/finalisiert) ─────────────────────────
export async function getSessionStatus(path) {
  return f1Fetch(`${path}SessionStatus.json`)
}
