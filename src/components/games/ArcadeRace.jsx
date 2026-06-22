import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useRaceWeekends } from '../../hooks/useRaceWeekends'
import { ALL_TRACKS, getTrackUnlockStatus, getCurrentTrackId } from './tracks'
import './MonacoTraining.css'

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
    // Reset game state on track change
    setGameState('idle')
    setBestLap(null)
    setCurrentLapTime(null)
    setSectorTimes(Array(N_SECTORS).fill(null))
    setFinishedSectors(Array(N_SECTORS).fill(null))
    setGhostDelta(null)
    setSelectedEntry(0)
  }, [track.id])

  // Lädt Ghost aus Supabase (eingeloggt) oder localStorage (Fallback)
  async function loadGhostFromSupabase() {
    if (profile?.id) {
      try {
        const { data } = await supabase
          .from('ghost_laps')
          .select('frames, sector_ms, lap_time_ms')
          .eq('profile_id', profile.id)
          .eq('track_id', track.id)
          .maybeSingle()
        if (data?.frames?.length) {
          // Supabase-Ghost in localStorage spiegeln, damit der rAF-Loop
          // synchron darauf zugreifen kann (loadGhost() läuft synchron im Loop)
          try {
            localStorage.setItem(GHOST_KEY, JSON.stringify({
              frames: data.frames,
              sectorMs: data.sector_ms ?? [],
            }))
          } catch {}
          setHasGhost(true)
          return
        }
      } catch {}
    }
    // Fallback: nur localStorage prüfen
    try {
      setHasGhost(!!localStorage.getItem(GHOST_KEY))
    } catch { setHasGhost(false) }
  }

  async function loadLeaderboard() {
    const { data } = await supabase
      .from('game_highscores')
      .select('lap_time_ms, profiles(display_name, avatar_url)')
      .eq('game', 'monaco_training')
      .eq('track', track.id)
      .order('lap_time_ms', { ascending: true })
      .limit(10)
    setLeaderboard(data ?? [])
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
    setBestLap(null)
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

    function nearestPoint(x, y) {
      let best = 1e9, bi = 0, px = x, py = y
      for (let i = 0; i < N; i++) {
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
      try {
        const raw = localStorage.getItem(GHOST_KEY)
        if (!raw) return
        const data = JSON.parse(raw)
        // Unterstützt beide Formate: {x,y,angle,t} (alt) und {x,y,a,t} (komprimiert)
        ghostFrames = (data.frames ?? []).map(f => ({
          x: f.x, y: f.y, angle: f.angle ?? f.a, t: f.t
        }))
        ghostSectorMs  = data.sectorMs  ?? Array(N_SECTORS).fill(null)
        ghostIdx = 0
        ghostCar = ghostFrames.length > 0 ? { ...ghostFrames[0] } : null
      } catch {}
    }

    function saveGhost(frames, sectorMs) {
      // Frames komprimieren: Koordinaten auf 2 Dezimalstellen, angle auf 4
      const compact = frames.map(f => ({
        x: Math.round(f.x * 100) / 100,
        y: Math.round(f.y * 100) / 100,
        a: Math.round(f.angle * 10000) / 10000,
        t: Math.round(f.t),
      }))
      // 1. Immer localStorage (synchron, sofort verfügbar beim nächsten Start)
      try {
        localStorage.setItem(GHOST_KEY, JSON.stringify({ frames: compact, sectorMs }))
      } catch {}
      // 2. Supabase (async, geräteübergreifend) – nur wenn eingeloggt
      if (profile?.id) {
        supabase.from('ghost_laps').upsert({
          profile_id:  profile.id,
          track_id:    track.id,
          lap_time_ms: sectorMs[sectorMs.length - 1] ?? 0,
          sector_ms:   sectorMs,
          frames:      compact,
        }, { onConflict: 'profile_id,track_id' }).then(({ error }) => {
          if (error) console.warn('[Ghost] Supabase save failed:', error.message)
        })
      }
    }

    loadGhost()

    let lapTime = 0, bestLapMs = Infinity
    let ghostStartOffset = 0
    let lapStarted = true, prevSeg = START_SEG, lastTS = null
    let inBuffer = false, racing = false, finishedRef = false
    let startTimeMs = null, bestLapSaved = null
    let sectorStartMs = Array(N_SECTORS).fill(null)
    let currentSectorMs = Array(N_SECTORS).fill(null)
    let lastSector = 0

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
      startTimeMs = null; inBuffer = false; finishedRef = false
      currentRecording = []; lastSector = 0
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
    }

    gameRef.current = {
      resetCar,
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

    function drawWorld() {
      ctx.save()
      ctx.translate(CAR_SCREEN_X, CAR_SCREEN_Y)
      ctx.rotate(-car.angle - Math.PI / 2)
      ctx.scale(ZOOM, ZOOM)
      ctx.translate(-camX, -camY)

      const stroke = (style, width) => {
        ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(TRK[0][0], TRK[0][1])
        for (let i = 1; i < N; i++) ctx.lineTo(TRK[i][0], TRK[i][1])
        ctx.closePath(); ctx.stroke()
      }

      stroke('#1a1a2e', TRACK_WIDTH + BUFFER * 2 + 40)
      stroke('#c8611a', TRACK_WIDTH + BUFFER * 2)
      stroke('#2e2e3e', TRACK_WIDTH + 20)
      stroke('#484858', TRACK_WIDTH)

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
      stroke('rgba(255,255,255,0.15)', 4)
      ctx.setLineDash([])

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

    function drawMinimap() {
      const mx=12,my=12,mw=110,mh=78
      ctx.save(); ctx.globalAlpha=0.88
      ctx.fillStyle='rgba(10,10,20,0.85)'; ctx.beginPath(); ctx.roundRect(mx,my,mw,mh,6); ctx.fill()
      ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect(mx,my,mw,mh,6); ctx.stroke()
      const pad=8
      const xs=RAW.map(p=>p[0]),ys=RAW.map(p=>p[1])
      const mnx=Math.min(...xs),mxx=Math.max(...xs),mny=Math.min(...ys),mxy=Math.max(...ys)
      const sc2=Math.min((mw-pad*2)/(mxx-mnx),(mh-pad*2)/(mxy-mny))
      const ox2=mx+pad+(mw-pad*2-(mxx-mnx)*sc2)/2, oy2=my+pad+(mh-pad*2-(mxy-mny)*sc2)/2
      const mm=(p)=>[ox2+(p[0]-mnx)*sc2,oy2+(p[1]-mny)*sc2]
      ctx.strokeStyle='#4a4a5e'; ctx.lineWidth=4
      ctx.beginPath(); const p0=mm(RAW[0]); ctx.moveTo(p0[0],p0[1])
      for (let i=1; i<RAW.length; i++) { const p=mm(RAW[i]); ctx.lineTo(p[0],p[1]) }
      ctx.closePath(); ctx.stroke()
      ctx.strokeStyle='#aaa'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(p0[0],p0[1])
      for (let i=1; i<RAW.length; i++) { const p=mm(RAW[i]); ctx.lineTo(p[0],p[1]) }
      ctx.closePath(); ctx.stroke()
      const cp=mm([car.x/TRACK_SCALE,car.y/TRACK_SCALE])
      ctx.fillStyle='#e8c440'; ctx.beginPath(); ctx.arc(cp[0],cp[1],3,0,Math.PI*2); ctx.fill()
      if (ghostCar) {
        const gp=mm([ghostCar.x/TRACK_SCALE,ghostCar.y/TRACK_SCALE])
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
      // Absolut sicheres 'dt': Unabhängig von Rundenstopps läuft das Spiel stabil weiter
      const dt = Math.min((ts-lastTS)/1000, 0.05)
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

        // Position VOR der Physik merken (für präzise Ziellinien-Interpolation)
        const prevCar = { x: car.x, y: car.y }

        car.speed = Math.min(car.speed + acc*dt, maxSpd)
        const sf = Math.min(1, Math.abs(car.speed)/400)
        if (left)  car.angle -= steer*sf*dt
        if (right) car.angle += steer*sf*dt
        car.x += Math.cos(car.angle)*car.speed*dt
        car.y += Math.sin(car.angle)*car.speed*dt

        const recT = startTimeMs !== null ? ts - startTimeMs : 0
        currentRecording.push({ x: car.x, y: car.y, angle: car.angle, t: recT })

        if (ghostFrames.length > 0 && ghostCar && startTimeMs !== null) {
          const elapsed = ghostStartOffset + (ts - startTimeMs)
          while (ghostIdx < ghostFrames.length - 1 && (ghostFrames[ghostIdx + 1].t ?? (ghostIdx + 1) * 16) <= elapsed) {
            ghostIdx++
          }
          // Interpolation zwischen aktuellem und nächstem Ghost-Frame
          const f0 = ghostFrames[ghostIdx]
          const f1 = ghostFrames[ghostIdx + 1]
          if (f1) {
            const t0 = f0.t ?? ghostIdx * 16
            const t1 = f1.t ?? (ghostIdx + 1) * 16
            const span = t1 - t0
            const frac = span > 0 ? Math.max(0, Math.min(1, (elapsed - t0) / span)) : 0
            // Winkel-Interpolation über kürzesten Weg (vermeidet 359°→1° Sprung)
            let da = ((f1.angle ?? f1.a) - (f0.angle ?? f0.a))
            if (da >  Math.PI) da -= Math.PI * 2
            if (da < -Math.PI) da += Math.PI * 2
            ghostCar = {
              x:     f0.x + (f1.x - f0.x) * frac,
              y:     f0.y + (f1.y - f0.y) * frac,
              angle: (f0.angle ?? f0.a) + da * frac,
            }
          } else {
            ghostCar = { ...f0, angle: f0.angle ?? f0.a }
          }
        }

        const {seg,dist,cx,cy} = nearestPoint(car.x,car.y)
        if (dist>INNER_LIMIT && dist<=OUTER_LIMIT) {
          inBuffer=true
          const bufCap=maxSpd*0.5
          if (car.speed>bufCap) car.speed=Math.max(bufCap,car.speed-1800*dt)
        } else if (dist>OUTER_LIMIT) {
          inBuffer=false
          // Push: dt-skaliert damit Kraft framerate-unabhängig ist
          const pushStrength = Math.min(1, (dist-OUTER_LIMIT)/dist * 60 * dt)
          car.x+=(cx-car.x)*pushStrength; car.y+=(cy-car.y)*pushStrength
          // Abbremsen: exakte Exponentialformel statt pow(0.72, dt*60)
          car.speed *= Math.exp(Math.log(0.72) * 60 * dt)
        } else { inBuffer=false }

        const curSector = getSectorForSeg(seg, N)
        if (lapStarted && startTimeMs !== null) {
          if (curSector !== lastSector && curSector > lastSector && curSector > 0 && curSector <= N_SECTORS - 1) {
            const elapsed = ts - startTimeMs
            const ghostElapsed = ghostSectorMs[curSector - 1]
            currentSectorMs[curSector - 1] = elapsed
            if (ghostElapsed !== null) {
              const delta = elapsed - ghostElapsed
              setGhostDelta(delta)
            }
            setSectorTimes(prev => {
              const n = [...prev]; n[curSector - 1] = elapsed; return n
            })
          }
          lastSector = curSector
        }

        const atStart  = seg >= START_SEG - 2 && seg <= START_SEG + 2
        const wasStart = prevSeg >= START_SEG - 2 && prevSeg <= START_SEG + 2

        if (!wasStart && atStart) {
          if (!lapStarted) {
            lapStarted = true; startTimeMs = ts; lastSector = 0
          } else if (startTimeMs && lapTime > 2) {
            // ── Präzise Ziellinie-Interpolation ───────────────────────────
            // Statt einfach 'ts' zu nehmen (= Frame NACH der Überquerung),
            // berechnen wir den exakten Bruchteil innerhalb des letzten dt,
            // zu dem das Auto die Startlinie tatsächlich überquert hat.
            // Dazu projizieren wir vorherige und aktuelle Auto-Position auf
            // den Normalvektor der Startlinie und interpolieren linear.
            let preciseMs = Math.round(ts - startTimeMs)
            try {
              const sa = TRK[START_SEG], sb = TRK[(START_SEG + 1) % N]
              // Normalvektor der Startlinie (senkrecht zur Fahrtrichtung)
              const lx = sb[0] - sa[0], ly = sb[1] - sa[1]
              const len = Math.sqrt(lx * lx + ly * ly)
              if (len > 0) {
                const nx = -ly / len, ny = lx / len // Normalvektor
                // Signed-Distanz: positiv = vor der Linie, negativ = dahinter
                const prevDist = (prevCar.x - sa[0]) * nx + (prevCar.y - sa[1]) * ny
                const currDist = (car.x     - sa[0]) * nx + (car.y     - sa[1]) * ny
                if (prevDist !== currDist) {
                  // Anteil des dt, bei dem Distanz = 0 (= Linienüberquerung)
                  const frac = Math.max(0, Math.min(1, prevDist / (prevDist - currDist)))
                  const dtMs = dt * 1000
                  preciseMs = Math.round(ts - startTimeMs - dtMs * (1 - frac))
                }
              }
            } catch (_) { /* Fallback auf ts bei unerwarteten Fehlern */ }

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
              bestLapSaved = bestLapMs; if (trainModeRef.current === 'qualifying') saveHighscore(bestLapMs)
            }
          }
        }

        if (startTimeMs) {
          lapTime = (ts - startTimeMs) / 1000
          setCurrentLapTime(Math.round(lapTime * 1000))
          if (ghostFrames.length > 0 && ghostIdx < ghostFrames.length) {
            const ghostElapsedRatio = ghostIdx / ghostFrames.length
            const ghostTotalMs = ghostSectorMs[3] ?? null
            if (ghostTotalMs) {
              const ghostCurrentMs = ghostElapsedRatio * ghostTotalMs
              setGhostDelta(Math.round(lapTime * 1000 - ghostCurrentMs))
            }
          }
        }

        prevSeg = seg
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
  const deltaText  = ghostDelta === null ? '' : (ghostDelta < 0 ? '-' : '+') + formatTime(Math.abs(ghostDelta))

  return (
    <div className="arcade-root monaco-root">
      <div className="arcade-game-wrap">
        <canvas ref={canvasRef} width={GAME_W} height={GAME_H} className="arcade-canvas" />

        

        {gameState==='countdown' && (
          <div className="arcade-overlay">
            <div className="arcade-countdown">{countdown>0?countdown:'GO!'}</div>
          </div>
        )}

        {gameState==='finished' && (
          <div className="arcade-overlay">
            <div className="arcade-finish-card monaco-finish-card">
              <div className="arcade-finish-title">🏁 Ziel!</div>
              <div className="arcade-finish-row">
                <span>Rundenzeit</span>
                <span style={{color:'#4ade80'}}>{formatTime(totalTime)}</span>
              </div>
              {bestLap && (
                <div className="arcade-finish-row">
                  <span>Bestzeit</span>
                  <span style={{color:'#4ade80'}}>{formatTime(bestLap)}</span>
                </div>
              )}

              <div className="monaco-sector-breakdown">
                {Array.from({length: N_SECTORS}, (_, i) => (
                  <div key={i} className="monaco-sector-item">
                    <span className="monaco-sector-label">S{i+1}</span>
                    <span className="monaco-sector-value">
                      {finishedSectors[i] != null ? formatTime(finishedSectors[i]) : '--'}
                    </span>
                  </div>
                ))}
              </div>

              {saving && <div className="arcade-finish-saved" style={{color:'#94a3b8'}}>⏳ Speichern…</div>}
              {!saving && saved && <div className="arcade-finish-saved">✅ Neuer Rekord gespeichert!</div>}
              {!saving && saveError && (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'0.3rem'}}>
                  <div className="arcade-finish-saved" style={{color:'#f87171'}}>❌ Speichern fehlgeschlagen</div>
                  <button className="btn" style={{fontSize:'0.75rem',padding:'0.25rem 0.75rem'}} onClick={retrySave}>🔄 Nochmal</button>
                </div>
              )}
              <button className="btn btn-primary" onClick={startGame} style={{marginTop:'0.75rem'}}>Nochmal</button>
            </div>
          </div>
        )}

        {gameState==='idle' && (
          <div className="arcade-overlay">
            <div className="arcade-start-card monaco-start-card">
              <div className="arcade-start-title">🏎️ {track.name}</div>
              {hasGhost && <p className="monaco-ghost-hint">👻 Ghost geladen – schlag deine Bestzeit!</p>}
              {!hasGhost && <p className="monaco-ghost-hint">Erste Runde wird als Ghost gespeichert.</p>}
              <div className="arcade-controls-hint">← → Lenken &nbsp;·&nbsp; Leertaste / ↺ Reset</div>

              <button className="btn btn-primary" onClick={startGame} style={{marginTop:'0.5rem'}}>START</button>
            </div>
          </div>
        )}
      </div>

      {(gameState==='racing' || gameState==='finished') && (
        <div className="arcade-hud-bar monaco-hud-bar">
          <div className="arcade-hud-bar-time">
            <span className="arcade-hud-bar-label">Zeit</span>
            <span className="arcade-hud-bar-value">
              {currentLapTime !== null ? formatTime(currentLapTime) : '--:--.---'}
            </span>
          </div>
          {bestLap && (
            <div className="arcade-hud-bar-best">
              <span className="arcade-hud-bar-label">Best</span>
              <span className="arcade-hud-bar-value arcade-hud-bar-value--green">{formatTime(bestLap)}</span>
            </div>
          )}
          {ghostDelta !== null && showGhost && (
            <div className="monaco-ghost-delta">
              <span className="arcade-hud-bar-label">vs Ghost</span>
              <span className="arcade-hud-bar-value" style={{color: deltaColor, fontSize:'1rem'}}>{deltaText}</span>
            </div>
          )}
          {hasGhost && (
            <button
              className="arcade-hud-ghost-toggle"
              style={{opacity: showGhost ? 1 : 0.45, touchAction:'none'}}
              onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId); setShowGhost(v=>!v)}}
            >{showGhost ? '👻 AN' : '👻 AUS'}</button>
          )}
          <button
            className="arcade-hud-ghost-toggle"
            style={{opacity: showFps ? 1 : 0.35, touchAction:'none'}}
            onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId); setShowFps(v=>!v)}}
          >FPS</button>
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
      <div style={{
        width:'100%', maxWidth:'720px',
        background:'#16161f', border:'1px solid rgba(255,255,255,0.08)',
        borderRadius:'8px', padding:'1.25rem',
        display:'flex', flexDirection:'column', gap:'1.25rem',
      }}>
        {ALL_TRACKS.length > 1 && (
          <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
            <div style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#55556a'}}>Strecke</div>
            <div style={{display:'grid', gridTemplateColumns: ALL_TRACKS.length <= 4 ? `repeat(${ALL_TRACKS.length}, 1fr)` : 'repeat(3, 1fr)', gap:'0.5rem'}}>
              {ALL_TRACKS.map(t => {
                const status = trackUnlockStatus[t.id]
                const isLocked = status && !status.unlocked
                return (
                  <button key={t.id}
                    onClick={() => selectTrack(t.id)}
                    disabled={isLocked}
                    title={isLocked ? `Freigeschaltet ab ${new Date(status.unlockAt).toLocaleDateString('de-AT', { day:'2-digit', month:'2-digit', year:'numeric' })}` : undefined}
                    style={{
                      all:'unset', boxSizing:'border-box',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:'0.15rem',
                      width:'100%',
                      padding:'0.85rem 0.5rem',
                      fontSize:'0.9rem', fontWeight:800,
                      fontFamily:"'Barlow Condensed', sans-serif",
                      letterSpacing:'0.05em', textTransform:'uppercase',
                      textAlign:'center', cursor: isLocked ? 'not-allowed' : 'pointer',
                      borderRadius:'8px',
                      border: selectedTrackId === t.id ? '2px solid #e8c440' : '1px solid rgba(255,255,255,0.08)',
                      background: isLocked ? '#17171f' : (selectedTrackId === t.id ? 'rgba(232,196,64,0.15)' : '#1e1e2a'),
                      color: isLocked ? '#45455a' : (selectedTrackId === t.id ? '#e8c440' : '#8888a0'),
                      opacity: isLocked ? 0.6 : 1,
                      transition:'all 0.15s',
                    }}
                  >
                    <span>{isLocked ? '🔒' : (t.emoji ?? '🏎️')} {t.name}</span>
                    {isLocked && status?.unlockAt && (
                      <span style={{fontSize:'0.6rem', fontWeight:600, letterSpacing:'0.03em', color:'#55556a'}}>
                        ab {new Date(status.unlockAt).toLocaleDateString('de-AT', { day:'2-digit', month:'2-digit' })}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
          <div style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#55556a'}}>Modus</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
            {[['qualifying','🏆 Qualifying'],['section','🔧 Abschnitt']].map(([mode, label]) => (
              <button key={mode}
                onClick={() => { setTrainMode(mode); if(mode==='qualifying') setSelectedEntry(0) }}
                style={{
                  all:'unset', boxSizing:'border-box',
                  display:'block', width:'100%',
                  padding:'0.85rem 0.5rem',
                  fontSize:'0.9rem', fontWeight:800,
                  fontFamily:"'Barlow Condensed', sans-serif",
                  letterSpacing:'0.05em', textTransform:'uppercase',
                  textAlign:'center', cursor:'pointer',
                  borderRadius:'8px',
                  border: trainMode === mode ? '2px solid #E8002D' : '1px solid rgba(255,255,255,0.08)',
                  background: trainMode === mode ? 'rgba(232,0,45,0.15)' : '#1e1e2a',
                  color: trainMode === mode ? '#E8002D' : '#8888a0',
                  transition:'all 0.15s',
                }}
              >{label}</button>
            ))}
          </div>
        </div>

        {trainMode==='section' && ENTRY_POINTS.length > 0 && (
          <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
            <div style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#55556a'}}>Einstiegspunkt</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
              {ENTRY_POINTS.map((ep, i) => (
                <button key={i}
                  onClick={() => setSelectedEntry(i)}
                  style={{
                    all:'unset', boxSizing:'border-box',
                    display:'block', width:'100%',
                    padding:'0.85rem 0.5rem',
                    fontSize:'0.9rem', fontWeight:800,
                    fontFamily:"'Barlow Condensed', sans-serif",
                    letterSpacing:'0.05em', textTransform:'uppercase',
                    textAlign:'center', cursor:'pointer',
                    borderRadius:'8px',
                    border: selectedEntry === i ? '2px solid #e8c440' : '1px solid rgba(255,255,255,0.08)',
                    background: selectedEntry === i ? 'rgba(232,196,64,0.15)' : '#1e1e2a',
                    color: selectedEntry === i ? '#e8c440' : '#8888a0',
                    transition:'all 0.15s',
                  }}
                >{ep.emoji} {ep.label}</button>
              ))}
            </div>
          </div>
        )}

        {trainMode==='qualifying' && (
          <p style={{fontSize:'0.72rem',color:'#55556a',margin:0}}>
            Start/Ziel bei {ENTRY_POINTS[0]?.emoji ?? '①'} · vollständige Runde
          </p>
        )}
      </div>
    </div>
  )
}