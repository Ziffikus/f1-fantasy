import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useRaceWeekends } from '../../hooks/useRaceWeekends'
import { ALL_TRACKS, getTrackUnlockStatus, getCurrentTrackId } from './tracks'
import './ArcadeRace.css'

// ── Mathematische Kurvenglättung (Catmull-Rom-Spline) ────────────────────────

function interpolateCatmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  const x = 0.5 * (
    (2 * p1[0]) +
    (-p0[0] + p2[0]) * t +
    (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
    (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
  );

  const y = 0.5 * (
    (2 * p1[1]) +
    (-p0[1] + p2[1]) * t +
    (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
    (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
  );

  return [x, y];
}

function subdivideTrack(rawPoints, subdivisions = 4) {
  const N = rawPoints.length;
  const smoothPoints = [];

  for (let i = 0; i < N; i++) {
    const p0 = rawPoints[(i - 1 + N) % N];
    const p1 = rawPoints[i];
    const p2 = rawPoints[(i + 1) % N];
    const p3 = rawPoints[(i + 2) % N];

    for (let j = 0; j < subdivisions; j++) {
      const t = j / subdivisions;
      smoothPoints.push(interpolateCatmullRom(p0, p1, p2, p3, t));
    }
  }
  return smoothPoints;
}

// ── Spielkonstanten (layout-bezogen, track-unabhängig) ────────────────────────
const GAME_W       = 720
const GAME_H       = 500
const CAR_SCREEN_X = GAME_W / 2
const CAR_SCREEN_Y = GAME_H - 35
const ZOOM         = 0.63

function formatTime(ms) {
  if (ms === null || ms === undefined) return '--:--.---'
  const mins   = Math.floor(ms / 60000)
  const secs   = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${mins}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function formatDelta(ms) {
  const rounded = Math.round(ms)
  const abs = Math.abs(rounded)
  if (abs < 1000) return (rounded >= 0 ? '+' : '') + rounded + 'ms'
  const secs = (rounded / 1000).toFixed(1)
  return (rounded >= 0 ? '+' : '') + secs + 's'
}

function formatSectorTime(ms) {
  if (ms == null) return '--'
  const secs   = Math.floor(ms / 1000)
  const millis = String(Math.floor(ms % 1000)).padStart(3, '0')
  return `${secs}.${millis}`
}

async function withRetry(fn, retries = 3, delayMs = 800) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try { return { ok: true, result: await fn() } } catch {
      if (attempt < retries) await new Promise(r => setTimeout(r, delayMs * attempt))
    }
  }
  return { ok: false }
}

export default function ArcadeRace({ onClose }) {
  // ── Saisonkalender (für automatische Track-Freischaltung) ───────────────────
  const { weekends, loading: weekendsLoading } = useRaceWeekends()
  const trackUnlockStatus = useMemo(() => getTrackUnlockStatus(weekends), [weekends])
  const currentTrackId    = useMemo(() => getCurrentTrackId(weekends), [weekends])

  // ── Track-Auswahl ──────────────────────────────────────────────────────────
  const [selectedTrackId, setSelectedTrackId] = useState(ALL_TRACKS[0]?.id)
  const [autoSelected, setAutoSelected] = useState(false)

  // Sobald die Wochenenden geladen sind, einmalig auf den aktuell freigeschalteten
  // Track springen (außer der Spieler hat zwischenzeitlich schon manuell gewählt).
  useEffect(() => {
    if (weekendsLoading || autoSelected || !currentTrackId) return
    setSelectedTrackId(currentTrackId)
    setAutoSelected(true)
  }, [weekendsLoading, autoSelected, currentTrackId])

  const track = ALL_TRACKS.find(t => t.id === selectedTrackId) ?? ALL_TRACKS[0]

  function selectTrack(id) {
    const status = trackUnlockStatus[id]
    if (status && !status.unlocked) return // gesperrt – Klick ignorieren
    setSelectedTrackId(id)
  }

  // Aus dem Track-Objekt abgeleitete Konstanten
  const RAW         = track.points
  const TRACK_SCALE = track.scale
  const TRACK_WIDTH = track.trackWidth
  const BUFFER      = track.buffer
  const INNER_LIMIT = TRACK_WIDTH / 2
  const OUTER_LIMIT = TRACK_WIDTH / 2 + BUFFER
  const N_SECTORS   = track.sectorCount ?? 3
  const ENTRY_POINTS = track.entryPoints ?? []
  const START_RAW   = track.startIndex ?? 0

  const GHOST_KEY   = `arcadeRace_ghost_${track.id}`
  const PENDING_KEY = `arcadeRace_pending_${track.id}`
  const canvasRef  = useRef(null)
  const gameRef    = useRef(null)
  const rafRef     = useRef(null)
  const { profile } = useAuthStore()
  const profileRef  = useRef(profile)   // immer aktueller Wert in rAF-Closures
  const ghostDataRef = useRef(null)     // In-Memory-Fallback falls localStorage gesperrt

  useEffect(() => { profileRef.current = profile }, [profile])

  const [gameState,      setGameState]      = useState('idle')
  const [countdown,      setCountdown]      = useState(3)
  const [currentLapTime, setCurrentLapTime] = useState(null)
  const [bestLap,        setBestLap]        = useState(null)
  const [totalTime,      setTotalTime]      = useState(0)
  const [saved,          setSaved]          = useState(false)
  const [saveError,      setSaveError]      = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [leaderboard,    setLeaderboard]    = useState([])
  const [hasGhost,       setHasGhost]       = useState(false)
  const [sectorTimes,    setSectorTimes]    = useState(() => Array(N_SECTORS).fill(null))
  const [ghostDelta,     setGhostDelta]     = useState(null)
  const [finishedSectors, setFinishedSectors] = useState(() => Array(N_SECTORS).fill(null))
  const [showGhost,       setShowGhost]       = useState(true)
  const [showFps,         setShowFps]         = useState(false)
  const [ghostSectors,    setGhostSectors]    = useState([])
  const [ghostLapMs,      setGhostLapMs]      = useState(null)
  const fpsRef            = useRef(0)      // aktueller FPS-Wert (kein Re-render nötig)
  const fpsFramesRef      = useRef([])     // Ring-Buffer der letzten Frame-Timestamps
  const showGhostRef = useRef(true)
  const showFpsRef   = useRef(false)
  const [selectedEntry,   setSelectedEntry]   = useState(0)
  const selectedEntryRef  = useRef(0)
  const [trainMode,       setTrainMode]       = useState('qualifying')
  const trainModeRef      = useRef('qualifying')

  const resetStateRef = useRef(null)

  useEffect(() => {
    loadLeaderboard()
    trySyncPendingScore()
    loadGhostFromSupabase()
    maybeFinalizeRanking()
    // Reset game state on track change
    setGameState('idle')
    setBestLap(null)
    setCurrentLapTime(null)
    setSectorTimes(Array(N_SECTORS).fill(null))
    setFinishedSectors(Array(N_SECTORS).fill(null))
    setGhostDelta(null)
    setSelectedEntry(0)
    setGhostSectors([])
    setGhostLapMs(null)
  }, [track.id])

  // Prüft ob der Countdown für den aktuellen Track abgelaufen ist und
  // triggert einmalig die Edge Function zum Berechnen der finalen Rangliste.
  async function maybeFinalizeRanking() {
    const status = trackUnlockStatus[track.id]
    // Nur wenn der Track ein Wochenende hat und der Countdown abgelaufen ist
    if (!status?.weekend || !status?.unlockAt) return
    if (new Date() < new Date(status.unlockAt)) return

    try {
      // Prüfen ob bereits finalisiert (track_rankings_log)
      const { data: log } = await supabase
        .from('track_rankings_log')
        .select('finalized_at')
        .eq('track_id', track.id)
        .maybeSingle()
      if (log) return // bereits finalisiert, nichts tun

      // Edge Function triggern
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) return // nicht eingeloggt, kein Trigger

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finalize-track-ranking`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
          },
          body: JSON.stringify({ track_id: track.id }),
        }
      )
      if (!res.ok) {
        console.warn('[Ranking] Edge Function Fehler:', res.status)
        return
      }
      const result = await res.json()
      if (result.success || result.already_finalized) {
        // Rangliste neu laden damit Ränge direkt sichtbar sind
        loadLeaderboard()
      }
    } catch (err) {
      console.warn('[Ranking] maybeFinalizeRanking Fehler:', err)
    }
  }

  // Lädt Ghost aus Supabase (eingeloggt) oder localStorage (Fallback)
  async function loadGhostFromSupabase() {
    if (profile?.id) {
      const maxRetries = 3
      const baseDelay  = 600
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { data, error } = await supabase
            .from('ghost_laps')
            .select('frames, sector_ms, lap_time_ms')
            .eq('profile_id', profile.id)
            .eq('track_id', track.id)
            .maybeSingle()
          if (error) throw error  // explizit werfen → retry
          if (!data) break        // kein Eintrag → kein Retry, zu localStorage
          if (!data.frames?.length) {
            console.warn('[Ghost] Supabase-Eintrag hat keine Frames – übersprungen')
            break
          }
          const payload = { frames: data.frames, sectorMs: data.sector_ms ?? [], lapTimeMs: data.lap_time_ms ?? null }
          ghostDataRef.current = payload
          try {
            localStorage.setItem(GHOST_KEY, JSON.stringify(payload))
          } catch {}
          setHasGhost(true)
          if (data.lap_time_ms) {
            setBestLap(prev => (!prev || data.lap_time_ms < prev) ? data.lap_time_ms : prev)
            setGhostLapMs(data.lap_time_ms)
          }
          setGhostSectors(data.sector_ms ?? [])
          gameRef.current?.reloadGhost?.()  // Game-Loop über neue Ghost-Daten informieren
          return
        } catch (err) {
          console.warn(`[Ghost] Supabase Versuch ${attempt}/${maxRetries} fehlgeschlagen:`, err?.message ?? err)
        }
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, baseDelay * attempt))
      }
    }
    // Fallback: nur localStorage prüfen
    try {
      const raw = localStorage.getItem(GHOST_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setHasGhost(true)
        if (parsed.lapTimeMs) {
          setBestLap(prev => (!prev || parsed.lapTimeMs < prev) ? parsed.lapTimeMs : prev)
          setGhostLapMs(parsed.lapTimeMs)
        }
        setGhostSectors(parsed.sectorMs ?? [])
      } else {
        setHasGhost(false)
      }
    } catch { setHasGhost(false) }
  }

  async function loadLeaderboard() {
    const maxRetries = 4
    const baseDelay  = 600
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase
          .from('game_highscores')
          .select('lap_time_ms, profiles(display_name, avatar_url)')
          .eq('game', 'monaco_training')
          .eq('track', track.id)
          .order('lap_time_ms', { ascending: true })
          .limit(10)
        if (!error && data) {
          setLeaderboard(data)
          return
        }
      } catch {}
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, baseDelay * attempt))
    }
  }

  function savePendingScore(lapTimeMs) {
    try {
      const existing = getPendingScore()
      if (!existing || lapTimeMs < existing) localStorage.setItem(PENDING_KEY, String(lapTimeMs))
    } catch {}
  }
  function getPendingScore() {
    try { const v = localStorage.getItem(PENDING_KEY); return v ? parseInt(v, 10) : null } catch { return null }
  }
  function clearPendingScore() { try { localStorage.removeItem(PENDING_KEY) } catch {} }

  async function trySyncPendingScore() {
    const pending = getPendingScore()
    if (!pending || !profile?.id) return
    const { ok } = await withRetry(() => upsertScore(pending))
    if (ok) { clearPendingScore(); loadLeaderboard() }
  }

  async function upsertScore(lapTimeMs) {
    const { data: existing, error: fetchErr } = await supabase
      .from('game_highscores')
      .select('lap_time_ms')
      .eq('profile_id', profile.id)
      .eq('game', 'monaco_training')
      .eq('track', track.id)
      .single()
    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr
    if (!existing || lapTimeMs < existing.lap_time_ms) {
      const { error } = await supabase
        .from('game_highscores')
        .upsert({ profile_id: profile.id, game: 'monaco_training', track: track.id, lap_time_ms: lapTimeMs },
          { onConflict: 'profile_id,game,track' })
      if (error) throw error
      return true
    }
    return false
  }

  async function saveHighscore(lapTimeMs) {
    if (!profile?.id) return
    savePendingScore(lapTimeMs)
    setSaving(true); setSaveError(false); setSaved(false)
    const { ok, result } = await withRetry(() => upsertScore(lapTimeMs))
    setSaving(false)
    if (ok) { if (result) setSaved(true); clearPendingScore(); loadLeaderboard() }
    else setSaveError(true)
  }

  async function retrySave() {
    const pending = getPendingScore()
    if (!pending) return
    setSaveError(false); setSaving(true)
    const { ok, result } = await withRetry(() => upsertScore(pending), 3, 1000)
    setSaving(false)
    if (ok) { if (result) setSaved(true); clearPendingScore(); loadLeaderboard() }
    else setSaveError(true)
  }

  const startGame = useCallback(() => {
    setGameState('countdown')
    setCountdown(3)
    setTotalTime(0)
    setSaved(false)
    setSaveError(false)
    setSaving(false)
    setCurrentLapTime(null)
    setSectorTimes(Array(N_SECTORS).fill(null))
    setFinishedSectors(Array(N_SECTORS).fill(null))
    setGhostDelta(null)
    gameRef.current?.resetCar?.()

    let c = 3
    const timer = setInterval(() => {
      c--; setCountdown(c)
      if (c <= 0) { clearInterval(timer); setGameState('racing') }
    }, 1000)
  }, [N_SECTORS])

  const resetGame = useCallback(() => {
    setGameState('racing')
    setCurrentLapTime(null)
    setSaved(false)
    setSaveError(false)
    setSectorTimes(Array(N_SECTORS).fill(null))
    setFinishedSectors(Array(N_SECTORS).fill(null))
    setGhostDelta(null)
    gameRef.current?.resetCar?.()
  }, [N_SECTORS])

  useEffect(() => { resetStateRef.current = resetGame }, [resetGame])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const SMOOTH_RAW = subdivideTrack(RAW, 4); 
    const TRK = SMOOTH_RAW.map(([x, y]) => [x * TRACK_SCALE, y * TRACK_SCALE])
    const N = TRK.length
    
    const START_SEG   = START_RAW * 4
    const START_SPEED = 0

    function getSectorForSeg(seg, totalSegs) {
      return Math.floor(seg / totalSegs * N_SECTORS)
    }

    // ── Spatial grid for O(1) nearestPoint lookups ──────────────────────────
    // Precompute a cell→segment index so each frame only checks ~10 candidates
    // instead of all N segments. Critical for mobile performance.
    const GRID_CELL = Math.max(...TRK.map(p => Math.abs(p[0])), ...TRK.map(p => Math.abs(p[1]))) / 30 || 200
    const spatialGrid = new Map()
    function gridKey(gx, gy) { return `${gx},${gy}` }
    for (let i = 0; i < N; i++) {
      const a = TRK[i], b = TRK[(i + 1) % N]
      const x0 = Math.floor(Math.min(a[0], b[0]) / GRID_CELL) - 1
      const x1 = Math.floor(Math.max(a[0], b[0]) / GRID_CELL) + 1
      const y0 = Math.floor(Math.min(a[1], b[1]) / GRID_CELL) - 1
      const y1 = Math.floor(Math.max(a[1], b[1]) / GRID_CELL) + 1
      for (let gx = x0; gx <= x1; gx++) {
        for (let gy = y0; gy <= y1; gy++) {
          const k = gridKey(gx, gy)
          if (!spatialGrid.has(k)) spatialGrid.set(k, [])
          spatialGrid.get(k).push(i)
        }
      }
    }

    function nearestPoint(x, y) {
      const gx = Math.floor(x / GRID_CELL), gy = Math.floor(y / GRID_CELL)
      // Check the car's cell + immediate neighbors (3×3)
      const candidates = new Set()
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const segs = spatialGrid.get(gridKey(gx + dx, gy + dy))
          if (segs) for (const s of segs) candidates.add(s)
        }
      }
      // Fallback: full scan only when no candidates found (edge case: car way off track)
      let toCheck = candidates
      if (candidates.size === 0) { for (let i = 0; i < N; i++) candidates.add(i); toCheck = candidates }
      let best = 1e9, bi = 0, px = x, py = y
      for (const i of toCheck) {
        const a = TRK[i], b = TRK[(i + 1) % N]
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
        let t = l2 > 0 ? ((x - a[0]) * dx + (y - a[1]) * dy) / l2 : 0
        t = Math.max(0, Math.min(1, t))
        const qx = a[0] + t * dx, qy = a[1] + t * dy
        const d = (x - qx) ** 2 + (y - qy) ** 2
        if (d < best) { best = d; bi = i; px = qx; py = qy }
      }
      return { seg: bi, dist: Math.sqrt(best), cx: px, cy: py }
    }
    
    function segAngle(i) {
      const a = TRK[i], b = TRK[(i + 1) % N]
      return Math.atan2(b[1] - a[1], b[0] - a[0])
    }

    const car = {
      x: TRK[START_SEG][0], y: TRK[START_SEG][1],
      angle: segAngle(START_SEG), speed: START_SPEED
    }
    let camX = car.x, camY = car.y

    let ghostFrames = []
    let ghostIdx    = 0
    let ghostCar    = null
    let currentRecording = []
    let ghostSectorMs = Array(N_SECTORS).fill(null)

    function loadGhost() {
      function processFrames(data) {
        let frames = (data.frames ?? []).map(f => ({
          x: f.x, y: f.y, angle: f.angle ?? f.a, t: f.t
        }))
        // Deduplizieren: Frames mit identischem t entfernen
        frames = frames.filter((f, i) => i === 0 || f.t !== frames[i - 1].t)

        // Alten Ghosts haben einen t=0-Frame mit der stehenden Startposition
        // (aufgenommen bevor der erste Physik-Step lief). Den wegwerfen —
        // er verfälscht das Re-timestamping und macht den Ghost einen Step zu spät.
        if (frames.length > 1 && frames[0].t === 0 && frames[1].t > 0) {
          frames = frames.slice(1)
        }

        // Re-timestampen: alle Ghosts (alt und neu) auf gleichmäßige physicsElapsedMs-
        // Schritte normalisieren. Erster Frame = step, letzter Frame = lapTimeMs.
        // Damit ist Playback (physicsElapsedMs im Sub-Step-Loop) immer synchron.
        const totalMs = data.lapTimeMs
        if (frames.length > 1 && totalMs > 0) {
          const step = totalMs / frames.length
          frames = frames.map((f, i) => ({ ...f, t: Math.round((i + 1) * step) }))
        }
        return frames
      }

      try {
        const raw = localStorage.getItem(GHOST_KEY)
        if (raw) {
          const data = JSON.parse(raw)
          ghostDataRef.current = data
          ghostFrames    = processFrames(data)
          ghostSectorMs  = data.sectorMs ?? Array(N_SECTORS).fill(null)
          ghostIdx = 0
          ghostCar = ghostFrames.length > 0 ? { ...ghostFrames[0] } : null
          return data.lapTimeMs ?? Infinity
        }
      } catch (e) {
        console.warn('[Ghost] localStorage lesen fehlgeschlagen:', e)
      }
      // In-Memory-Fallback (z.B. Chrome privat oder localStorage gesperrt)
      if (ghostDataRef.current) {
        const data = ghostDataRef.current
        ghostFrames   = processFrames(data)
        ghostSectorMs = data.sectorMs ?? Array(N_SECTORS).fill(null)
        ghostIdx = 0
        ghostCar = ghostFrames.length > 0 ? { ...ghostFrames[0] } : null
        return data.lapTimeMs ?? Infinity
      }
      return Infinity
    }

    function saveGhost(frames, sectorMs) {
      // Frames komprimieren: Koordinaten auf 2 Dezimalstellen, angle auf 4
      const compact = frames.map(f => ({
        x: Math.round(f.x * 100) / 100,
        y: Math.round(f.y * 100) / 100,
        a: Math.round(f.angle * 10000) / 10000,
        t: Math.round(f.t),
      }))
      const lapTimeMs = sectorMs[sectorMs.length - 1] ?? null
      const payload = { frames: compact, sectorMs, lapTimeMs }

      // 1. In-Memory (immer, kein Fehler möglich)
      ghostDataRef.current = payload

      // 2. localStorage (kann auf Chrome privat/iOS gesperrt sein)
      try {
        localStorage.setItem(GHOST_KEY, JSON.stringify(payload))
      } catch (e) {
        console.warn('[Ghost] localStorage schreiben fehlgeschlagen (privater Modus?):', e)
      }

      // 3. Supabase (async, geräteübergreifend) – profileRef statt profile-Closure
      const pid = profileRef.current?.id
      if (pid) {
        supabase.from('ghost_laps').upsert({
          profile_id:  pid,
          track_id:    track.id,
          lap_time_ms: lapTimeMs ?? 0,
          sector_ms:   sectorMs,
          frames:      compact,
        }, { onConflict: 'profile_id,track_id' }).then(({ error }) => {
          if (error) console.warn('[Ghost] Supabase save failed:', error.message)
        })
      }
    }

    let lapTime = 0, bestLapMs = loadGhost()   // Ghost-Zeit als initiale Bestzeit
    let ghostStartOffset = 0
    let lapStarted = true, prevSeg = START_SEG, lastTS = null
    let inBuffer = false, racing = false, finishedRef = false
    let accumulator = 0   // fixer Physik-Accumulator für deterministischen Zeitschritt
    let startTimeMs = null, bestLapSaved = null
    let sectorStartMs = Array(N_SECTORS).fill(null)
    let currentSectorMs = Array(N_SECTORS).fill(null)
    let lastSector = 0
    let physicsElapsedMs = 0  // Physik-Zeit in ms (deterministisch, unabhängig von Framerate)

    function findNearestGhostFrame(x, y) {
      // Suche den Ghost-Frame der der Startposition am nächsten ist
      let best = Infinity, bestIdx = 0
      for (let i = 0; i < ghostFrames.length; i++) {
        const f = ghostFrames[i]
        const d = (f.x - x) ** 2 + (f.y - y) ** 2
        if (d < best) { best = d; bestIdx = i }
      }
      return bestIdx
    }

    function resetCar() {
      const entrySeg = trainModeRef.current === 'qualifying'
        ? START_SEG
        : (ENTRY_POINTS[selectedEntryRef.current]?.rawIdx * 4 ?? START_SEG)
      car.x = TRK[entrySeg][0]; car.y = TRK[entrySeg][1]
      car.angle = segAngle(entrySeg); car.speed = START_SPEED
      camX = car.x; camY = car.y
      lapStarted = true; lapTime = 0; prevSeg = entrySeg
      startTimeMs = null; inBuffer = false; finishedRef = false; accumulator = 0
      currentRecording = []; lastSector = 0; physicsElapsedMs = 0
      sectorStartMs = Array(N_SECTORS).fill(null)
      currentSectorMs = Array(N_SECTORS).fill(null)
      if (ghostFrames.length > 0) {
        if (trainModeRef.current === 'qualifying') {
          // Qualifying: Ghost immer von Anfang, kein Offset
          ghostIdx = 0
          ghostStartOffset = 0
          ghostCar = { ...ghostFrames[0], angle: ghostFrames[0].angle ?? ghostFrames[0].a }
        } else {
          ghostIdx = findNearestGhostFrame(car.x, car.y)
          ghostCar = { ...ghostFrames[ghostIdx], angle: ghostFrames[ghostIdx].angle ?? ghostFrames[ghostIdx].a }
          ghostStartOffset = ghostFrames[ghostIdx].t ?? ghostIdx * 16
        }
      }
      // Loop neu starten falls sie durch finishedRef gestoppt wurde
      cancelAnimationFrame(rafRef.current)
      lastTS = null
      rafRef.current = requestAnimationFrame(loop)
    }

    gameRef.current = {
      resetCar,
      reloadGhost: () => {
        // Wird von loadGhostFromSupabase aufgerufen nachdem Daten async ankommen
        const ms = loadGhost()
        if (ms < bestLapMs) bestLapMs = ms
      },
      get racing() { return racing },
      set racing(v) { racing = v },
      touches: { left: false, right: false },
    }

    const keys = {}
    const onKeyDown = (e) => {
      if (e.key === ' ') { e.preventDefault(); resetStateRef.current?.(); return }
      if (['ArrowLeft','ArrowRight','a','d'].includes(e.key)) {
        e.preventDefault(); keys[e.key] = true
      }
    }
    const onKeyUp = (e) => {
      if (['ArrowLeft','ArrowRight','a','d'].includes(e.key)) {
        e.preventDefault(); keys[e.key] = false
      }
    }
    const resetAllKeys = () => {
      keys['ArrowLeft'] = false; keys['ArrowRight'] = false
      keys['a'] = false; keys['d'] = false
      if (gameRef.current) { gameRef.current.touches.left = false; gameRef.current.touches.right = false }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', resetAllKeys)

    // ── Offscreen-Canvas: Strecke einmal in Weltkoordinaten vorrendern ──────────
    // Die Strecke selbst ändert sich nie. Wir zeichnen sie einmalig auf einen
    // großen Offscreen-Canvas in Weltkoordinaten (kein Kamera-Transform).
    // drawWorld() wendet dann nur noch den Kamera-Transform an und blitet den
    // Offscreen-Canvas per drawImage – das spart alle Path-Berechnungen pro Frame.
    //
    // Größe: Bounding-Box aller Track-Punkte + großzügiger Rand für Randlinien/Puffer.
    const trk_xs = TRK.map(p => p[0])
    const trk_ys = TRK.map(p => p[1])
    const trk_minX = Math.min(...trk_xs)
    const trk_maxX = Math.max(...trk_xs)
    const trk_minY = Math.min(...trk_ys)
    const trk_maxY = Math.max(...trk_ys)
    const OFF_PAD  = TRACK_WIDTH + BUFFER * 2 + 60   // Rand groß genug für dickste Linie
    const OFF_OX   = -trk_minX + OFF_PAD             // Weltkoordinaten-Offset ins Canvas
    const OFF_OY   = -trk_minY + OFF_PAD
    const OFF_W    = Math.ceil(trk_maxX - trk_minX + OFF_PAD * 2)
    const OFF_H    = Math.ceil(trk_maxY - trk_minY + OFF_PAD * 2)

    const offCanvas = document.createElement('canvas')
    offCanvas.width  = OFF_W
    offCanvas.height = OFF_H
    const offCtx = offCanvas.getContext('2d')

    // Einmalig die gesamte Strecke in Weltkoordinaten auf offCanvas zeichnen.
    ;(function buildTrackCache() {
      // Hilfsfunktion: Offset auf Weltkoordinaten anwenden
      const wx = x => x + OFF_OX
      const wy = y => y + OFF_OY

      const stroke = (style, width, dash) => {
        offCtx.strokeStyle = style; offCtx.lineWidth = width
        offCtx.lineJoin = 'round'; offCtx.lineCap = 'round'
        if (dash) offCtx.setLineDash(dash); else offCtx.setLineDash([])
        offCtx.beginPath()
        offCtx.moveTo(wx(TRK[0][0]), wy(TRK[0][1]))
        for (let i = 1; i < N; i++) offCtx.lineTo(wx(TRK[i][0]), wy(TRK[i][1]))
        offCtx.closePath(); offCtx.stroke()
      }

      stroke('#1a1a2e', TRACK_WIDTH + BUFFER * 2 + 40)
      stroke('#c8611a', TRACK_WIDTH + BUFFER * 2)
      stroke('#2e2e3e', TRACK_WIDTH + 20)
      stroke('#484858', TRACK_WIDTH)

      // Sektor-Einfärbung
      const sectorColors = ['rgba(100,200,255,0.12)', 'rgba(200,100,255,0.12)', 'rgba(255,200,60,0.12)']
      const segPerSector = Math.floor(N / N_SECTORS)
      for (let s = 0; s < N_SECTORS; s++) {
        const start = s * segPerSector
        const end   = s < N_SECTORS - 1 ? (s + 1) * segPerSector : N
        offCtx.strokeStyle = sectorColors[s]; offCtx.lineWidth = TRACK_WIDTH - 20
        offCtx.lineJoin = 'round'; offCtx.setLineDash([])
        offCtx.beginPath(); offCtx.moveTo(wx(TRK[start][0]), wy(TRK[start][1]))
        for (let i = start + 1; i < end; i++) offCtx.lineTo(wx(TRK[i][0]), wy(TRK[i][1]))
        offCtx.stroke()
      }

      // Randlinien (gestrichelt, beide Seiten)
      for (const side of [-1, 1]) {
        offCtx.strokeStyle = 'rgba(230,150,30,0.7)'; offCtx.lineWidth = BUFFER - 10
        offCtx.setLineDash([25, 20])
        offCtx.beginPath()
        for (let i = 0; i < N; i++) {
          const a = TRK[i], b = TRK[(i+1)%N]
          const dx = b[0]-a[0], dy = b[1]-a[1], len = Math.sqrt(dx*dx+dy*dy)||1
          const nx = -dy/len*(TRACK_WIDTH/2+BUFFER/2)*side
          const ny =  dx/len*(TRACK_WIDTH/2+BUFFER/2)*side
          i===0 ? offCtx.moveTo(wx(a[0]+nx), wy(a[1]+ny))
                : offCtx.lineTo(wx(a[0]+nx), wy(a[1]+ny))
        }
        offCtx.closePath(); offCtx.stroke()
      }
      offCtx.setLineDash([])

      // Weiße Randmarkierungen (beide Seiten)
      for (const side of [-1, 1]) {
        offCtx.strokeStyle = 'rgba(255,255,255,0.75)'; offCtx.lineWidth = 6
        offCtx.setLineDash([])
        offCtx.beginPath()
        for (let i = 0; i < N; i++) {
          const a = TRK[i], b = TRK[(i+1)%N]
          const dx = b[0]-a[0], dy = b[1]-a[1], len = Math.sqrt(dx*dx+dy*dy)||1
          const nx = -dy/len*side*(TRACK_WIDTH/2)
          const ny =  dx/len*side*(TRACK_WIDTH/2)
          i===0 ? offCtx.moveTo(wx(a[0]+nx), wy(a[1]+ny))
                : offCtx.lineTo(wx(a[0]+nx), wy(a[1]+ny))
        }
        offCtx.closePath(); offCtx.stroke()
      }

      // Mittellinie (gestrichelt)
      stroke('rgba(255,255,255,0.15)', 4, [30, 40])
      offCtx.setLineDash([])

      // Ziellinie (kariert)
      const sa=TRK[START_SEG], sb=TRK[(START_SEG+1)%N]
      const ddx=sb[0]-sa[0], ddy=sb[1]-sa[1], fl=Math.sqrt(ddx*ddx+ddy*ddy)||1
      const hw=TRACK_WIDTH/2+4, cw=hw*2/8
      offCtx.save()
      offCtx.translate(wx(sa[0]), wy(sa[1]))
      offCtx.rotate(Math.atan2(ddx/fl, -ddy/fl))
      for (let i=0; i<8; i++) {
        offCtx.fillStyle = i%2===0 ? '#fff' : '#4af'
        offCtx.fillRect(-hw+i*cw, -8, cw, 16)
      }
      offCtx.restore()

      // Sektor-Trennlinien
      for (let s = 1; s < N_SECTORS; s++) {
        const idx = s * Math.floor(N / N_SECTORS)
        const a = TRK[idx], b = TRK[(idx+1)%N]
        const dx = b[0]-a[0], dy = b[1]-a[1], len = Math.sqrt(dx*dx+dy*dy)||1
        const nx = -dy/len * (TRACK_WIDTH/2), ny = dx/len * (TRACK_WIDTH/2)
        offCtx.strokeStyle = 'rgba(100,180,255,0.7)'; offCtx.lineWidth = 5
        offCtx.setLineDash([10, 6])
        offCtx.beginPath()
        offCtx.moveTo(wx(a[0]-nx), wy(a[1]-ny))
        offCtx.lineTo(wx(a[0]+nx), wy(a[1]+ny))
        offCtx.stroke()
      }
      offCtx.setLineDash([])
    })()

    // ── Path2D-Version (PC-Pfad): Strecke direkt in den Haupt-Canvas zeichnen ──
    // Vorberechneter mainPath wird mehrfach gestroked – kein alloc pro Frame.
    const mainPath = new Path2D()
    mainPath.moveTo(TRK[0][0], TRK[0][1])
    for (let i = 1; i < N; i++) mainPath.lineTo(TRK[i][0], TRK[i][1])
    mainPath.closePath()

    function drawWorldPath2D() {
      ctx.save()
      ctx.translate(CAR_SCREEN_X, CAR_SCREEN_Y)
      ctx.rotate(-car.angle - Math.PI / 2)
      ctx.scale(ZOOM, ZOOM)
      ctx.translate(-camX, -camY)

      const strokePath = (style, width) => {
        ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
        ctx.stroke(mainPath)
      }
      strokePath('#1a1a2e', TRACK_WIDTH + BUFFER * 2 + 40)
      strokePath('#c8611a', TRACK_WIDTH + BUFFER * 2)
      strokePath('#2e2e3e', TRACK_WIDTH + 20)
      strokePath('#484858', TRACK_WIDTH)

      const sectorColors = ['rgba(100,200,255,0.12)', 'rgba(200,100,255,0.12)', 'rgba(255,200,60,0.12)']
      const segPerSector = Math.floor(N / N_SECTORS)
      for (let s = 0; s < N_SECTORS; s++) {
        const start = s * segPerSector
        const end   = s < N_SECTORS - 1 ? (s + 1) * segPerSector : N
        ctx.strokeStyle = sectorColors[s]; ctx.lineWidth = TRACK_WIDTH - 20; ctx.lineJoin = 'round'
        ctx.beginPath(); ctx.moveTo(TRK[start][0], TRK[start][1])
        for (let i = start + 1; i < end; i++) ctx.lineTo(TRK[i][0], TRK[i][1])
        ctx.stroke()
      }
      for (const side of [-1, 1]) {
        ctx.strokeStyle = 'rgba(230,150,30,0.7)'; ctx.lineWidth = BUFFER - 10; ctx.setLineDash([25, 20])
        ctx.beginPath()
        for (let i = 0; i < N; i++) {
          const a = TRK[i], b = TRK[(i+1)%N]
          const dx = b[0]-a[0], dy = b[1]-a[1], len = Math.sqrt(dx*dx+dy*dy)||1
          const nx = -dy/len*(TRACK_WIDTH/2+BUFFER/2)*side, ny = dx/len*(TRACK_WIDTH/2+BUFFER/2)*side
          i===0 ? ctx.moveTo(a[0]+nx,a[1]+ny) : ctx.lineTo(a[0]+nx,a[1]+ny)
        }
        ctx.closePath(); ctx.stroke(); ctx.setLineDash([])
      }
      for (const side of [-1, 1]) {
        ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=6
        ctx.beginPath()
        for (let i=0;i<N;i++) {
          const a=TRK[i],b=TRK[(i+1)%N]
          const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.sqrt(dx*dx+dy*dy)||1
          const nx=-dy/len*side*(TRACK_WIDTH/2),ny=dx/len*side*(TRACK_WIDTH/2)
          i===0?ctx.moveTo(a[0]+nx,a[1]+ny):ctx.lineTo(a[0]+nx,a[1]+ny)
        }
        ctx.closePath(); ctx.stroke()
      }
      ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=4; ctx.setLineDash([30,40])
      ctx.stroke(mainPath); ctx.setLineDash([])

      const sa=TRK[START_SEG],sb=TRK[(START_SEG+1)%N]
      const ddx=sb[0]-sa[0],ddy=sb[1]-sa[1],fl=Math.sqrt(ddx*ddx+ddy*ddy)||1
      const hw=TRACK_WIDTH/2+4, cw=hw*2/8
      ctx.save(); ctx.translate(sa[0],sa[1]); ctx.rotate(Math.atan2(ddx/fl,-ddy/fl))
      for (let i=0;i<8;i++) { ctx.fillStyle=i%2===0?'#fff':'#4af'; ctx.fillRect(-hw+i*cw,-8,cw,16) }
      ctx.restore()

      for (let s = 1; s < N_SECTORS; s++) {
        const idx = s * Math.floor(N / N_SECTORS)
        const a = TRK[idx], b = TRK[(idx+1)%N]
        const dx = b[0]-a[0], dy = b[1]-a[1], len = Math.sqrt(dx*dx+dy*dy)||1
        const nx = -dy/len * (TRACK_WIDTH/2), ny = dx/len * (TRACK_WIDTH/2)
        ctx.strokeStyle = 'rgba(100,180,255,0.7)'; ctx.lineWidth = 5; ctx.setLineDash([10,6])
        ctx.beginPath(); ctx.moveTo(a[0]-nx, a[1]-ny); ctx.lineTo(a[0]+nx, a[1]+ny); ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.restore()
    }

    // ── Blit-Version (Mobile-Pfad): Offscreen-Canvas per drawImage einbliten ──
    function drawWorldBlit() {
      ctx.save()
      ctx.translate(CAR_SCREEN_X, CAR_SCREEN_Y)
      ctx.rotate(-car.angle - Math.PI / 2)
      ctx.scale(ZOOM, ZOOM)
      ctx.translate(-camX, -camY)
      ctx.drawImage(offCanvas, -OFF_OX, -OFF_OY)
      ctx.restore()
    }

    // ── Performance-Test: einmal beim Setup beide Methoden messen ───────────────
    // Testet auf einem unsichtbaren Canvas mit echter Kameratransformation.
    // Median aus 5 Runs pro Methode – robuster als Einzelmessung.
    let drawWorld = drawWorldBlit  // Standardwert bis Test abgeschlossen
    ;(function benchmarkDrawMethods() {
      const RUNS = 5
      const testCanvas = document.createElement('canvas')
      testCanvas.width = GAME_W; testCanvas.height = GAME_H
      const tCtx = testCanvas.getContext('2d')

      function measureMethod(fn) {
        const times = []
        // Gleiche Kamerasituation wie im echten Spiel simulieren
        const savedCtx = ctx
        // Wir tauschen ctx temporär gegen tCtx aus
        // (Closure-Trick: fn nutzt ctx aus dem äußeren Scope)
        // → Einfacher: fn direkt auf tCtx ausführen indem wir ctx-Calls umleiten.
        // Da ctx eine let-Variable im äußeren Scope ist, können wir sie kurz ersetzen:
        // ABER: ctx ist const. Stattdessen messen wir auf dem echten ctx,
        // der ist sowieso unsichtbar bis zum ersten paint.
        for (let r = 0; r < RUNS; r++) {
          const t0 = performance.now()
          fn()
          // Wichtig: getImageData() erzwingt GPU-Flush damit die Zeit real ist
          ctx.getImageData(0, 0, 1, 1)
          times.push(performance.now() - t0)
        }
        times.sort((a, b) => a - b)
        return times[Math.floor(RUNS / 2)]  // Median
      }

      const medianBlit   = measureMethod(drawWorldBlit)
      const medianPath2D = measureMethod(drawWorldPath2D)

      drawWorld = medianBlit <= medianPath2D ? drawWorldBlit : drawWorldPath2D
      console.log(`[ArcadeRace] drawWorld: blit=${medianBlit.toFixed(2)}ms  path2d=${medianPath2D.toFixed(2)}ms  → ${drawWorld === drawWorldBlit ? 'BLIT' : 'PATH2D'}`)
    })()

    function drawGhost() {
      if (!ghostCar) return
      ctx.save()
      ctx.translate(CAR_SCREEN_X, CAR_SCREEN_Y)
      ctx.rotate(-car.angle - Math.PI / 2)
      ctx.scale(ZOOM, ZOOM)
      ctx.translate(-camX, -camY)
      ctx.translate(ghostCar.x, ghostCar.y)
      ctx.rotate(ghostCar.angle + Math.PI)  // Weltwinkel + PI damit Ghost gleich wie Auto nach oben zeigt
      ctx.scale(1/ZOOM, 1/ZOOM)  // ZOOM-Skalierung aufheben damit Ghost gleich groß wie Auto
      ctx.globalAlpha = 0.45
      // Schatten
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(3,6,17,8,0,0,Math.PI*2); ctx.fill()
      // Karosserie
      ctx.fillStyle = '#64b5f6'
      ctx.beginPath(); ctx.ellipse(0,0,16,7,0,0,Math.PI*2); ctx.fill()
      ctx.fillStyle = '#1a1a2e'
      ctx.beginPath(); ctx.ellipse(2,0,6,4,0,0,Math.PI*2); ctx.fill()
      ctx.fillStyle = '#2288cc'
      ctx.fillRect(13,-9,5,18); ctx.fillRect(-18,-9,4,18)
      ctx.fillStyle = '#111'
      for (const [wx,wy] of [[9,-9],[9,9],[-10,-9],[-10,9]]) {
        ctx.beginPath(); ctx.ellipse(wx,wy,5,3,0,0,Math.PI*2); ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.restore()
    }

    function drawCar() {
      ctx.save(); ctx.translate(CAR_SCREEN_X,CAR_SCREEN_Y); ctx.rotate(Math.PI/2)
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(3,6,14,7,0,0,Math.PI*2); ctx.fill()
      ctx.fillStyle='#e8c440'; ctx.beginPath(); ctx.ellipse(0,0,16,7,0,0,Math.PI*2); ctx.fill()
      ctx.fillStyle='#1a1a2e'; ctx.beginPath(); ctx.ellipse(2,0,6,4,0,0,Math.PI*2); ctx.fill()
      ctx.fillStyle='#cc0000'; ctx.fillRect(13,-9,5,18); ctx.fillRect(-18,-9,4,18)
      ctx.fillStyle='#111'
      for (const [wx,wy] of [[9,-9],[9,9],[-10,-9],[-10,9]]) { ctx.beginPath(); ctx.ellipse(wx,wy,5,3,0,0,Math.PI*2); ctx.fill() }
      ctx.restore()
    }

    // ── Minimap: Konstanten einmal vorberechnen ──────────────────────────────
    const MM_MX=12, MM_MY=12, MM_MW=110, MM_MH=78, MM_PAD=8
    const mm_xs = RAW.map(p=>p[0]), mm_ys = RAW.map(p=>p[1])
    const mm_mnx = Math.min(...mm_xs), mm_mxx = Math.max(...mm_xs)
    const mm_mny = Math.min(...mm_ys), mm_mxy = Math.max(...mm_ys)
    const mm_sc  = Math.min((MM_MW-MM_PAD*2)/(mm_mxx-mm_mnx), (MM_MH-MM_PAD*2)/(mm_mxy-mm_mny))
    const mm_ox  = MM_MX+MM_PAD+(MM_MW-MM_PAD*2-(mm_mxx-mm_mnx)*mm_sc)/2
    const mm_oy  = MM_MY+MM_PAD+(MM_MH-MM_PAD*2-(mm_mxy-mm_mny)*mm_sc)/2
    const mmPt   = (wx, wy) => [mm_ox+(wx-mm_mnx)*mm_sc, mm_oy+(wy-mm_mny)*mm_sc]
    // Minimap-Streckenpfad als Path2D einmal vorberechnen
    const mmPath = new Path2D()
    const _mp0 = mmPt(RAW[0][0], RAW[0][1]); mmPath.moveTo(_mp0[0], _mp0[1])
    for (let i=1; i<RAW.length; i++) { const p=mmPt(RAW[i][0],RAW[i][1]); mmPath.lineTo(p[0],p[1]) }
    mmPath.closePath()

    function drawMinimap() {
      ctx.save(); ctx.globalAlpha=0.88
      ctx.fillStyle='rgba(10,10,20,0.85)'; ctx.beginPath(); ctx.roundRect(MM_MX,MM_MY,MM_MW,MM_MH,6); ctx.fill()
      ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect(MM_MX,MM_MY,MM_MW,MM_MH,6); ctx.stroke()
      ctx.strokeStyle='#4a4a5e'; ctx.lineWidth=4; ctx.stroke(mmPath)
      ctx.strokeStyle='#aaa'; ctx.lineWidth=1.5; ctx.stroke(mmPath)
      const cp=mmPt(car.x/TRACK_SCALE, car.y/TRACK_SCALE)
      ctx.fillStyle='#e8c440'; ctx.beginPath(); ctx.arc(cp[0],cp[1],3,0,Math.PI*2); ctx.fill()
      if (ghostCar) {
        const gp=mmPt(ghostCar.x/TRACK_SCALE, ghostCar.y/TRACK_SCALE)
        ctx.fillStyle='rgba(100,181,246,0.65)'; ctx.beginPath(); ctx.arc(gp[0],gp[1],2.5,0,Math.PI*2); ctx.fill()
      }
      ctx.globalAlpha=1; ctx.restore()
    }

    function drawBufferWarning() {
      if (!inBuffer) return
      ctx.save(); ctx.globalAlpha=0.7+0.3*Math.sin(Date.now()/120)
      ctx.fillStyle='rgba(255,100,20,0.18)'; ctx.fillRect(0,0,GAME_W,GAME_H)
      ctx.fillStyle='rgba(255,120,30,0.9)'; ctx.font='bold 15px monospace'; ctx.textAlign='center'
      ctx.fillText('⚠ MAUER / RASEN – 50% Speed',GAME_W/2,28)
      ctx.globalAlpha=1; ctx.restore()
    }

    function loop(ts) {
      if (!lastTS) lastTS = ts
      // Echtes elapsed seit letztem Frame — kein Cap mehr nötig dank Sub-Steps
      const frameDt = Math.min((ts - lastTS) / 1000, 0.25) // max 250ms (Tab-Wechsel-Schutz)
      lastTS = ts

      // ── FPS-Messung (gleitender Schnitt über 30 Frames) ──────────────────
      const frames = fpsFramesRef.current
      frames.push(ts)
      if (frames.length > 30) frames.shift()
      if (frames.length >= 2) {
        fpsRef.current = Math.round((frames.length - 1) / ((frames[frames.length - 1] - frames[0]) / 1000))
      }
      camX = car.x; camY = car.y

      // Uhr starten: exakt im ersten Frame wo racing=true wird
      if (racing && startTimeMs === null) {
        startTimeMs = ts
        // Ghost-Startzeit auf denselben Moment synchronisieren
        ghostStartOffset = 0
      }

      // Die Fahrphysik wird jetzt komplett eigenständig ausgeführt, unabhängig davon ob startTimeMs geladen ist!
      if (racing && !finishedRef) {
        const left  = keys['ArrowLeft']  || keys['a'] || gameRef.current?.touches.left
        const right = keys['ArrowRight'] || keys['d'] || gameRef.current?.touches.right
        const maxSpd=855, acc=665, steer=2.6
        const STEP = 1/60  // fixer Physik-Zeitschritt (16.67 ms)

        // Accumulator-Pattern: übrige Zeit bleibt erhalten und wird zum nächsten Frame addiert.
        // dt ist immer exakt STEP → vollständig deterministisch auf allen Geräten/Framerates.
        accumulator += frameDt
        let stepsRan = 0
        while (accumulator >= STEP) {
          accumulator -= STEP
          stepsRan++
          const dt = STEP

        // Position VOR der Physik merken (für präzise Ziellinien-Interpolation)
        const prevCar = { x: car.x, y: car.y }

        const speedPrev = car.speed
        car.speed = Math.min(car.speed + acc*dt, maxSpd)
        const sf = Math.min(1, Math.abs(car.speed)/400)
        if (left)  car.angle -= steer*sf*dt
        if (right) car.angle += steer*sf*dt
        // Trapez-Integration: Durchschnitt aus speed vor und nach Beschleunigung
        // eliminiert den Euler-Forward-Fehler bei unterschiedlichen Framerates
        const speedAvg = (speedPrev + car.speed) / 2
        car.x += Math.cos(car.angle)*speedAvg*dt
        car.y += Math.sin(car.angle)*speedAvg*dt

        const {seg,dist,cx,cy} = nearestPoint(car.x,car.y)
        if (dist>INNER_LIMIT && dist<=OUTER_LIMIT) {
          inBuffer=true
          const bufCap=maxSpd*0.5
          if (car.speed>bufCap) car.speed=Math.max(bufCap,car.speed-1800*dt)
        } else if (dist>OUTER_LIMIT) {
          inBuffer=false
          const pushStrength = Math.min(1, (dist-OUTER_LIMIT)/dist * 60 * dt)
          car.x+=(cx-car.x)*pushStrength; car.y+=(cy-car.y)*pushStrength
          car.speed *= Math.exp(Math.log(0.72) * 60 * dt)
        } else { inBuffer=false }

        // Ziellinie + Sektor — läuft bei jedem Step (kein remaining-Guard nötig)
        const atStart  = seg >= START_SEG - 2 && seg <= START_SEG + 2
        const wasStart = prevSeg >= START_SEG - 2 && prevSeg <= START_SEG + 2

        const curSector = getSectorForSeg(seg, N)
        if (lapStarted && startTimeMs !== null) {
          if (curSector !== lastSector && curSector > lastSector && curSector > 0 && curSector <= N_SECTORS - 1) {
            const elapsed = ts - startTimeMs
            const ghostElapsed = ghostSectorMs[curSector - 1]
            currentSectorMs[curSector - 1] = elapsed
            if (ghostElapsed !== null) setGhostDelta(elapsed - ghostElapsed)
            setSectorTimes(prev => { const n = [...prev]; n[curSector - 1] = elapsed; return n })
          }
          lastSector = curSector
        }

        if (!wasStart && atStart) {
          if (!lapStarted) {
            lapStarted = true; startTimeMs = ts; lastSector = 0
          } else if (startTimeMs && lapTime > 2) {
            let preciseMs = Math.round(ts - startTimeMs)
            try {
              const sa = TRK[START_SEG], sb = TRK[(START_SEG + 1) % N]
              const lx = sb[0] - sa[0], ly = sb[1] - sa[1]
              const len = Math.sqrt(lx * lx + ly * ly)
              if (len > 0) {
                const nx = -ly / len, ny = lx / len
                const prevDist = (prevCar.x - sa[0]) * nx + (prevCar.y - sa[1]) * ny
                const currDist = (car.x     - sa[0]) * nx + (car.y     - sa[1]) * ny
                if (prevDist !== currDist) {
                  const frac = Math.max(0, Math.min(1, prevDist / (prevDist - currDist)))
                  preciseMs = Math.round(ts - startTimeMs - dt * 1000 * (1 - frac))
                }
              }
            } catch (_) {}

            const lapMs = preciseMs
            if (lapMs < bestLapMs) {
              bestLapMs = lapMs
              saveGhost(currentRecording, [...currentSectorMs, lapMs])
              setHasGhost(true)
            }
            setBestLap(prev => (!prev || lapMs < prev) ? lapMs : prev)
            setTotalTime(lapMs)
            finishedRef = true
            setGameState('finished')
            setFinishedSectors([...currentSectorMs])
            if (bestLapMs !== Infinity && bestLapMs !== bestLapSaved) {
              bestLapSaved = bestLapMs
              if (trainModeRef.current === 'qualifying') saveHighscore(bestLapMs)
            }
          }
        }
        prevSeg = seg

        // ── Ghost-Aufnahme & Playback: beide im Sub-Step-Loop mit physicsElapsedMs ──
        // physicsElapsedMs wächst exakt um STEP*1000 pro Sub-Step — deterministisch,
        // framerate-unabhängig. Aufnahme und Wiedergabe laufen auf derselben Zeitachse.
        if (lapStarted && startTimeMs !== null) {
          physicsElapsedMs += STEP * 1000
          currentRecording.push({ x: car.x, y: car.y, angle: car.angle, t: physicsElapsedMs })

          // Ghost-Playback im selben Sub-Step: Ghost-Position für physicsElapsedMs berechnen
          if (ghostFrames.length > 0) {
            const elapsed = ghostStartOffset + physicsElapsedMs
            while (ghostIdx < ghostFrames.length - 1 && ghostFrames[ghostIdx + 1].t <= elapsed) {
              ghostIdx++
            }
            const f0 = ghostFrames[ghostIdx]
            const f1 = ghostFrames[ghostIdx + 1]
            if (f1) {
              const span = f1.t - f0.t
              const frac = span > 0 ? Math.max(0, Math.min(1, (elapsed - f0.t) / span)) : 0
              let da = (f1.angle - f0.angle)
              if (da >  Math.PI) da -= Math.PI * 2
              if (da < -Math.PI) da += Math.PI * 2
              ghostCar = {
                x:     f0.x + (f1.x - f0.x) * frac,
                y:     f0.y + (f1.y - f0.y) * frac,
                angle: f0.angle + da * frac,
              }
            } else {
              ghostCar = { x: f0.x, y: f0.y, angle: f0.angle }
            }
          }
        }

        } // end sub-step while loop

        if (startTimeMs) {
          lapTime = (ts - startTimeMs) / 1000
          const lapMs = Math.round(lapTime * 1000)
          // Nur alle ~100ms React-State aktualisieren – spart Re-renders auf Mobil
          if (!drawWorld._lastLapUpdate || lapMs - drawWorld._lastLapUpdate >= 100) {
            drawWorld._lastLapUpdate = lapMs
            setCurrentLapTime(lapMs)
          }
        }
      }

      ctx.fillStyle='#1a1a2e'; ctx.fillRect(0,0,GAME_W,GAME_H)
      drawWorld(); if (showGhostRef.current) drawGhost(); drawCar(); drawBufferWarning(); drawMinimap()

      // ── FPS-Overlay (nur wenn aktiviert) ───────────────────────────────
      if (showFpsRef.current) {
        const fps = fpsRef.current
        const color = fps >= 55 ? '#4ade80' : fps >= 30 ? '#facc15' : '#f87171'
        ctx.save()
        ctx.font = 'bold 13px monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(8, 8, 68, 22)
        ctx.fillStyle = color
        ctx.fillText(`${fps} FPS`, 14, 12)
        ctx.restore()
      }

      // Nach dem Zieldurchfahrt: Loop stoppen – Canvas bleibt eingefroren,
      // das Finish-Overlay (React) liegt darüber.
      // resetCar() startet die Loop über rafRef neu.
      if (finishedRef) return

      rafRef.current=requestAnimationFrame(loop)
    }

    rafRef.current=requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', resetAllKeys)
    }
  }, [track.id])

  useEffect(() => {
    if (gameRef.current) gameRef.current.racing = gameState==='racing'
  }, [gameState])

  useEffect(() => { showGhostRef.current = showGhost }, [showGhost])
  useEffect(() => { showFpsRef.current   = showFps   }, [showFps])
  useEffect(() => { selectedEntryRef.current = selectedEntry }, [selectedEntry])
  useEffect(() => { trainModeRef.current = trainMode }, [trainMode])

  function touchStart(action) { if (gameRef.current) gameRef.current.touches[action]=true }
  function touchEnd(action)   { if (gameRef.current) gameRef.current.touches[action]=false }

  const deltaColor = ghostDelta === null ? '#fff' : ghostDelta < 0 ? '#4ade80' : '#f87171'
  const deltaText  = ghostDelta === null ? '' : formatDelta(ghostDelta)

  return (
    <div className="arcade-root">
      <div className="arcade-game-wrap">
        <canvas ref={canvasRef} width={GAME_W} height={GAME_H} className="arcade-canvas" />

        

        {gameState==='countdown' && (
          <div className="arcade-overlay">
            <div className="arcade-countdown">{countdown>0?countdown:'GO!'}</div>
          </div>
        )}

        {gameState==='finished' && (
          <div className="arcade-overlay arcade-overlay--finish">
            <div className="arcade-finish-card">
              <div className="arcade-finish-times">
                <div className="arcade-finish-time-col">
                  <span className="arcade-hud-bar-label">🏁 RUNDENZEIT</span>
                  <span className="arcade-finish-time-value">{formatTime(totalTime)}</span>
                </div>
                {bestLap && (
                  <div className="arcade-finish-time-col">
                    <span className="arcade-hud-bar-label">BESTZEIT</span>
                    <span className="arcade-finish-time-value">{formatTime(bestLap)}</span>
                  </div>
                )}
              </div>

              {(() => {
                const rows = Array.from({length: N_SECTORS}, (_, i) => {
                  let duration = null
                  if (i === 0) {
                    duration = finishedSectors[0] ?? null
                  } else if (i < N_SECTORS - 1) {
                    const cur = finishedSectors[i], prev = finishedSectors[i - 1]
                    if (cur != null && prev != null) duration = cur - prev
                  } else {
                    const prev = finishedSectors[i - 1]
                    if (totalTime && prev != null) duration = totalTime - prev
                  }
                  let ghostDur = null
                  if (ghostSectors.length > 0) {
                    if (i === 0) {
                      ghostDur = ghostSectors[0] ?? null
                    } else if (i < N_SECTORS - 1) {
                      const cur = ghostSectors[i], prev = ghostSectors[i - 1]
                      if (cur != null && prev != null) ghostDur = cur - prev
                    } else {
                      const prev = ghostSectors[N_SECTORS - 2]
                      if (ghostLapMs != null && prev != null) ghostDur = ghostLapMs - prev
                    }
                  }
                  const delta = (duration != null && ghostDur != null) ? duration - ghostDur : null
                  return { label: `S${i+1}`, duration, ghostDur, delta }
                })
                const hasGhost = ghostSectors.length > 0 && ghostLapMs != null
                const totalDelta = hasGhost ? totalTime - ghostLapMs : null
                const cols = hasGhost ? '2.2rem 1fr 1fr 3.2rem' : '2.2rem 1fr'
                const dstyle = (d) => ({color:d==null?'transparent':d<0?'#4ade80':'#f87171'})
                return (
                  <div className="arcade-finish-sectors" style={{gridTemplateColumns:cols}}>
                    {hasGhost && <><span/><span className="arcade-sector-th">Du</span><span className="arcade-sector-th arcade-sector-th--ghost">👻</span><span/></>}
                    {rows.map(({label,duration,ghostDur,delta}) => (
                      <React.Fragment key={label}>
                        <span className="arcade-sector-lbl">{label}</span>
                        <span className="arcade-sector-num">{duration!=null?formatSectorTime(duration):'--'}</span>
                        {hasGhost && <span className="arcade-sector-ghost">{ghostDur!=null?formatSectorTime(ghostDur):'--'}</span>}
                        {hasGhost && <span className="arcade-sector-delta" style={dstyle(delta)}>{delta!=null?formatDelta(delta):''}</span>}
                      </React.Fragment>
                    ))}
                    {hasGhost && <div className="arcade-sector-divider"/>}
                    {hasGhost && (
                      <React.Fragment>
                        <span className="arcade-sector-lbl">Ges.</span>
                        <span className="arcade-sector-num arcade-sector-num--total">{formatSectorTime(totalTime)}</span>
                        <span className="arcade-sector-ghost">{formatSectorTime(ghostLapMs)}</span>
                        <span className="arcade-sector-delta" style={dstyle(totalDelta)}>{totalDelta!=null?formatDelta(totalDelta):''}</span>
                      </React.Fragment>
                    )}
                  </div>
                )
              })()}

              {/* Speicher-Status + Nochmal-Button: kompakt unten */}
              <div className="arcade-finish-footer">
                {saving && <div className="arcade-finish-saved arcade-finish-saved--muted">⏳ Speichern…</div>}
                {!saving && saved && <div className="arcade-finish-saved">✅ Neuer Rekord gespeichert!</div>}
                {!saving && saveError && (
                  <div className="arcade-finish-error">
                    <div className="arcade-finish-saved arcade-finish-saved--error">❌ Speichern fehlgeschlagen</div>
                    <button className="btn" onClick={retrySave}>🔄 Nochmal</button>
                  </div>
                )}
                <button className="btn btn-primary arcade-finish-replay-btn" onClick={startGame}>Nochmal</button>
              </div>
            </div>
          </div>
        )}

        {gameState==='idle' && (
          <div className="arcade-overlay">
            <div className="arcade-start-card">
              <div className="arcade-start-title">🏎️ {track.name}</div>
              {hasGhost && <p className="arcade-ghost-hint">👻 Ghost geladen – schlag deine Bestzeit!</p>}
              {!hasGhost && <p className="arcade-ghost-hint">Erste Runde wird als Ghost gespeichert.</p>}
              <div className="arcade-controls-hint">← → Lenken &nbsp;·&nbsp; Leertaste / ↺ Reset</div>

              <button className="btn btn-primary" onClick={startGame} style={{marginTop:'0.5rem'}}>START</button>
            </div>
          </div>
        )}
      </div>

      {(gameState==='racing' || gameState==='finished' || gameState==='countdown') && (
        <div className="arcade-hud-bar">
          <div className="arcade-hud-col">
            <span className="arcade-hud-bar-label">ZEIT</span>
            <span className="arcade-hud-bar-value">
              {gameState === 'finished' ? formatTime(totalTime) : currentLapTime !== null ? formatTime(currentLapTime) : '--:--.---'}
            </span>
            {ghostDelta !== null && showGhost && (
              <span className="arcade-hud-delta-inline" style={{color:deltaColor}}>{deltaText}</span>
            )}
          </div>
          <div className="arcade-hud-col">
            <span className="arcade-hud-bar-label">BEST</span>
            <span className="arcade-hud-bar-value arcade-hud-bar-value--green">
              {bestLap ? formatTime(bestLap) : '--:--.---'}
            </span>
          </div>
          <div className="arcade-hud-buttons">
            {hasGhost && (
              <button className="arcade-hud-ghost-toggle" style={{opacity:showGhost?1:0.45}} onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId);setShowGhost(v=>!v)}}>{showGhost?'👻 AN':'👻 AUS'}</button>
            )}
            <button className="arcade-hud-ghost-toggle" style={{opacity:showFps?1:0.35}} onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId);setShowFps(v=>!v)}}>FPS</button>
          </div>
        </div>
      )}

      {gameState==='idle' && hasGhost && (
        <div className="arcade-hud-bar">
          <div style={{flex:1}}/>
          <div className="arcade-hud-buttons">
            <button className="arcade-hud-ghost-toggle" style={{opacity:showGhost?1:0.45}} onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId);setShowGhost(v=>!v)}}>{showGhost?'👻 AN':'👻 AUS'}</button>
          </div>
        </div>
      )}

      <div className="arcade-touch-controls">
        <div className="arcade-touch-left">
          <button className="arcade-btn arcade-btn--turn"
            style={{touchAction:'none'}}
            onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId);touchStart('left')}}
            onPointerUp={()=>touchEnd('left')}
            onPointerCancel={()=>touchEnd('left')}>◀</button>
        </div>
        <button
          className="arcade-btn arcade-btn--reset"
          style={{touchAction:'none'}}
          onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId); resetGame()}}
        >↺</button>
        <div className="arcade-touch-right">
          <button className="arcade-btn arcade-btn--turn"
            style={{touchAction:'none'}}
            onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId);touchStart('right')}}
            onPointerUp={()=>touchEnd('right')}
            onPointerCancel={()=>touchEnd('right')}>▶</button>
        </div>
      </div>

      <div className="arcade-leaderboard card">
        <div className="arcade-lb-title">🏆 Bestzeiten {track.name}</div>
        {leaderboard.length===0 ? (
          <p className="text-muted" style={{fontSize:'0.8rem'}}>Noch keine Zeiten. Sei der Erste!</p>
        ) : leaderboard.map((entry,i)=>(
          <div key={i} className={`arcade-lb-row ${i===0?'arcade-lb-row--gold':''}`}>
            <span className="arcade-lb-rank">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</span>
            <span className="arcade-lb-name">{entry.profiles?.display_name??'–'}</span>
            <span className="arcade-lb-time">{formatTime(entry.lap_time_ms)}</span>
          </div>
        ))}
      </div>

      {/* ── Persistente Strecken- & Modus-Auswahl ── */}
      <div className="arcade-settings-wrap">
        {ALL_TRACKS.length > 1 && (
          <div className="arcade-settings-section">
            <div className="arcade-settings-label">Strecke</div>
            <div className="arcade-settings-grid" style={{gridTemplateColumns: ALL_TRACKS.length <= 4 ? `repeat(${ALL_TRACKS.length}, 1fr)` : 'repeat(3, 1fr)'}}>
              {ALL_TRACKS.map(t => {
                const status = trackUnlockStatus[t.id]
                const isLocked = status && !status.unlocked
                return (
                  <button key={t.id}
                    className={`arcade-settings-btn${selectedTrackId === t.id ? ' arcade-settings-btn--active-yellow' : ''}`}
                    onClick={() => selectTrack(t.id)}
                    disabled={isLocked}
                    title={isLocked ? `Freigeschaltet ab ${new Date(status.unlockAt).toLocaleDateString('de-AT', { day:'2-digit', month:'2-digit', year:'numeric' })}` : undefined}
                  >
                    <span>{isLocked ? '🔒' : (t.emoji ?? '🏎️')} {t.name}</span>
                    {isLocked && status?.unlockAt && (
                      <span className="arcade-settings-btn-sub">
                        ab {new Date(status.unlockAt).toLocaleDateString('de-AT', { day:'2-digit', month:'2-digit' })}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="arcade-settings-section">
          <div className="arcade-settings-label">Modus</div>
          <div className="arcade-settings-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
            {[['qualifying','🏆 Qualifying'],['section','🔧 Abschnitt']].map(([mode, label]) => (
              <button key={mode}
                className={`arcade-settings-btn${trainMode === mode ? ' arcade-settings-btn--active-red' : ''}`}
                onClick={() => { setTrainMode(mode); if(mode==='qualifying') setSelectedEntry(0) }}
              >{label}</button>
            ))}
          </div>
        </div>

        {trainMode==='section' && ENTRY_POINTS.length > 0 && (
          <div className="arcade-settings-section">
            <div className="arcade-settings-label">Einstiegspunkt</div>
            <div className="arcade-settings-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
              {ENTRY_POINTS.map((ep, i) => (
                <button key={i}
                  className={`arcade-settings-btn${selectedEntry === i ? ' arcade-settings-btn--active-yellow' : ''}`}
                  onClick={() => setSelectedEntry(i)}
                >{ep.emoji} {ep.label}</button>
              ))}
            </div>
          </div>
        )}

        {trainMode==='qualifying' && (
          <p className="arcade-settings-hint">
            Start/Ziel bei {ENTRY_POINTS[0]?.emoji ?? '①'} · vollständige Runde
          </p>
        )}
      </div>
    </div>
  )
}