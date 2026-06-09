// ============================================================
// F1 Live Timing API – https://livetiming.formula1.com
// Kostenlos, direkt aus dem Browser fetchbar, kein Auth nötig
// Datenquelle: offizielle F1 Timing-Infrastruktur
// ============================================================

const BASE = 'https://livetiming.formula1.com/static'

async function f1Fetch(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`F1 Timing Fehler: ${res.status} – ${url}`)
  return res.json()
}

// ─── Aktuelle Session (immer das neueste Meeting) ────────────
// Gibt SessionStatus zurück: "Started" | "Finalised" | "Inactive" etc.
export async function getTimingSession() {
  return f1Fetch(`${BASE}/SessionInfo.json`)
}

// ─── Timing Data: Positionen, Rundenzeiten, Gaps, Sektoren ──
export async function getTimingData(path) {
  return f1Fetch(`${BASE}/${path}TimingData.json`)
}

// ─── Fahrerliste mit Team, Farbe, Kürzel ────────────────────
export async function getDriverList(path) {
  return f1Fetch(`${BASE}/${path}DriverList.json`)
}

// ─── Wetterdaten ─────────────────────────────────────────────
export async function getWeatherData(path) {
  return f1Fetch(`${BASE}/${path}WeatherData.json`)
}

// ─── Race Control Messages (SC, VSC, Flaggen...) ─────────────
export async function getRaceControlMessages(path) {
  return f1Fetch(`${BASE}/${path}RaceControlMessages.json`)
}

// ─── Streckenstatus ──────────────────────────────────────────
// Status: "1"=Clear, "2"=Yellow, "4"=SC, "5"=Red, "6"=VSC
export async function getTrackStatus(path) {
  return f1Fetch(`${BASE}/${path}TrackStatus.json`)
}

// ─── Aktueller Rundenstand ───────────────────────────────────
export async function getLapCount(path) {
  return f1Fetch(`${BASE}/${path}LapCount.json`)
}

// ─── Reifendaten (Stints pro Fahrer) ─────────────────────────
export async function getTimingAppData(path) {
  return f1Fetch(`${BASE}/${path}TimingAppData.json`)
}
