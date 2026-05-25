import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
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

// ── Monaco-Ideallinie – je Punkt: [x, y] (x=rechts, y=unten) ────────────────
const RAW = [
  /* 00 */ [899.23, 233.05],
  /* 01 */ [935.50, 190.39],
  /* 02 */ [953.50, 190.89],
  /* 03 */ [966.50, 209.39],
  /* 04 */ [944.92, 239.81],
  /* 05 */ [931.41, 252.59],
  /* 06 */ [910.83, 269.89],
  /* 07 */ [887.13, 287.25],
  /* 08 */ [856.78, 304.21],
  /* 09 */ [826.07, 319.53],
  /* 10 */ [802.25, 329.22],
  /* 11 */ [777.23, 336.67],
  /* 12 */ [751.15, 340.58],
  /* 13 */ [724.14, 341.11],
  /* 14 */ [696.48, 338.49],
  /* 15 */ [670.10, 333.30],
  /* 16 */ [644.49, 325.78],
  /* 17 */ [619.31, 316.03],
  /* 18 */ [603.19, 307.75],
  /* 19 */ [577.94, 292.74],
  /* 20 */ [551.14, 276.15],
  /* 21 */ [527.35, 261.41],
  /* 22 */ [496.63, 243.57],
  /* 23 */ [481.69, 255.20],
  /* 24 */ [458.03, 258.37],
  /* 25 */ [438.20, 243.27],
  /* 26 */ [430.73, 218.51],
  /* 27 */ [413.45, 204.46],
  /* 28 */ [390.02, 186.25],
  /* 29 */ [365.51, 167.20],
  /* 30 */ [343.94, 151.17],
  /* 31 */ [322.24, 135.26],
  /* 32 */ [299.03, 128.11],
  /* 33 */ [274.71, 140.68],
  /* 34 */ [250.64, 162.68],
  /* 35 */ [236.19, 180.26],
  /* 36 */ [236.15, 204.48],
  /* 37 */ [226.28, 228.38],
  /* 38 */ [206.65, 252.37],
  /* 39 */ [191.64, 270.55],
  /* 40 */ [169.83, 279.06],
  /* 41 */ [148.97, 281.76],
  /* 42 */ [142.45, 305.57],
  /* 43 */ [139.68, 334.95],
  /* 44 */ [139.64, 362.53],
  /* 45 */ [145.00, 387.07],
  /* 46 */ [156.41, 414.06],
  /* 47 */ [150.79, 437.67],
  /* 48 */ [128.35, 441.39],
  /* 49 */ [107.45, 428.87],
  /* 50 */ [82.31, 410.04],
  /* 51 */ [60.81, 393.60],
  /* 52 */ [50.00, 369.84],
  /* 53 */ [66.32, 351.31],
  /* 54 */ [73.50, 325.90],
  /* 55 */ [78.73, 300.46],
  /* 56 */ [87.92, 275.13],
  /* 57 */ [98.34, 251.53],
  /* 58 */ [109.62, 231.07],
  /* 59 */ [125.29, 208.73],
  /* 60 */ [144.56, 185.24], // ← START / ZIEL
  /* 61 */ [161.82, 166.15],
  /* 62 */ [181.01, 146.41],
  /* 63 */ [200.08, 127.79],
  /* 64 */ [219.48, 109.58],
  /* 65 */ [239.78, 91.20],
  /* 66 */ [259.88, 73.59],
  /* 67 */ [281.03, 54.65],
  /* 68 */ [304.02, 50.00],
  /* 69 */ [323.50, 68.93],
  /* 70 */ [333.35, 75.96],
  /* 71 */ [349.37, 86.10],
  /* 72 */ [371.22, 99.92],
  /* 73 */ [397.06, 116.25],
  /* 74 */ [425.05, 133.93],
  /* 75 */ [453.36, 151.78],
  /* 76 */ [480.15, 168.64],
  /* 77 */ [503.78, 183.22],
  /* 78 */ [526.59, 194.41],
  /* 79 */ [551.93, 206.46],
  /* 80 */ [574.87, 218.43],
  /* 81 */ [597.24, 234.51],
  /* 82 */ [620.69, 251.86],
  /* 83 */ [644.73, 262.92],
  /* 84 */ [670.97, 263.06],
  /* 85 */ [689.41, 248.47],
  /* 86 */ [699.20, 225.46],
  /* 87 */ [701.66, 196.96],
  /* 88 */ [706.97, 171.02],
  /* 89 */ [725.16, 154.16],
  /* 90 */ [757.63, 145.79],
  /* 91 */ [793.73, 139.67],
  /* 92 */ [824.11, 134.50],
  /* 93 */ [848.79, 130.29],
  /* 94 */ [873.00, 125.39],
  /* 95 */ [898.00, 127.39],
  /* 96 */ [916.00, 139.39],
  /* 97 */ [911.50, 161.39],
  /* 98 */ [900.00, 176.39],
  /* 99 */ [874.50, 191.39],
  /* 100 */ [871.00, 219.39],
]

const TRACK_SCALE = 11
const TRACK_WIDTH = 175
const BUFFER      = 80
const INNER_LIMIT = TRACK_WIDTH / 2
const OUTER_LIMIT = TRACK_WIDTH / 2 + BUFFER
const GAME_W = 720
const GAME_H = 500
const CAR_SCREEN_X = GAME_W / 2
const CAR_SCREEN_Y = GAME_H - 35
const ZOOM = 0.63

const GHOST_KEY   = 'monacoTraining_clean_ghost'
const PENDING_KEY = 'monacoTraining_clean_pendingScore'

// RAW-Punkt → Subdivision-Segment = RAW-Index * 4
const ENTRY_POINTS = [
  { label: 'Abschnitt 1', rawIdx: 60, emoji: '①' },
  { label: 'Abschnitt 2', rawIdx: 74, emoji: '②' },
  { label: 'Abschnitt 3', rawIdx: 89, emoji: '③' },
  { label: 'Abschnitt 4', rawIdx: 2,  emoji: '④' },
  { label: 'Abschnitt 5', rawIdx: 17, emoji: '⑤' },
  { label: 'Abschnitt 6', rawIdx: 31, emoji: '⑥' },
  { label: 'Abschnitt 7', rawIdx: 46, emoji: '⑦' },
]

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

const N_SECTORS = 3

function getSectorForSeg(seg, totalSegs) {
  return Math.floor(seg / totalSegs * N_SECTORS)
}

export default function MonacoTraining({ onClose }) {
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
  const [sectorTimes,    setSectorTimes]    = useState([null, null, null])
  const [ghostDelta,     setGhostDelta]     = useState(null)
  const [finishedSectors, setFinishedSectors] = useState([null, null, null])
  const [showGhost,       setShowGhost]       = useState(true)
  const showGhostRef = useRef(true)
  const [selectedEntry,   setSelectedEntry]   = useState(0)
  const selectedEntryRef  = useRef(0)
  const [trainMode,       setTrainMode]       = useState('qualifying')

  const resetStateRef = useRef(null)

  useEffect(() => {
    loadLeaderboard()
    trySyncPendingScore()
    try {
      const g = localStorage.getItem(GHOST_KEY)
      if (g) setHasGhost(true)
    } catch {}
  }, [])

  async function loadLeaderboard() {
    const { data } = await supabase
      .from('game_highscores')
      .select('lap_time_ms, profiles(display_name, avatar_url)')
      .eq('game', 'monaco_training')
      .eq('track', 'monaco')
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
      .eq('track', 'monaco')
      .single()
    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr
    if (!existing || lapTimeMs < existing.lap_time_ms) {
      const { error } = await supabase
        .from('game_highscores')
        .upsert({ profile_id: profile.id, game: 'monaco_training', track: 'monaco', lap_time_ms: lapTimeMs },
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
    setSectorTimes([null, null, null])
    setFinishedSectors([null, null, null])
    setGhostDelta(null)
    gameRef.current?.resetCar?.()

    let c = 3
    const timer = setInterval(() => {
      c--; setCountdown(c)
      if (c <= 0) { clearInterval(timer); setGameState('racing') }
    }, 1000)
  }, [])

  const resetGame = useCallback(() => {
    setGameState('racing')
    setCurrentLapTime(null)
    setSaved(false)
    setSaveError(false)
    setSectorTimes([null, null, null])
    setFinishedSectors([null, null, null])
    setGhostDelta(null)
    gameRef.current?.resetCar?.()
  }, [])

  useEffect(() => { resetStateRef.current = resetGame }, [resetGame])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const SMOOTH_RAW = subdivideTrack(RAW, 4); 
    const TRK = SMOOTH_RAW.map(([x, y]) => [x * TRACK_SCALE, y * TRACK_SCALE])
    const N = TRK.length
    
    // Starte bei RAW-Punkt 60 (nach Subdivision = Segment 240)
    const START_SEG   = 240
    const START_SPEED = 0

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
    let ghostSectorMs = [null, null, null]

    function loadGhost() {
      try {
        const raw = localStorage.getItem(GHOST_KEY)
        if (!raw) return
        const data = JSON.parse(raw)
        ghostFrames    = data.frames    ?? []
        ghostSectorMs  = data.sectorMs  ?? [null, null, null]
        ghostIdx = 0
        ghostCar = ghostFrames.length > 0 ? { ...ghostFrames[0] } : null
      } catch {}
    }

    function saveGhost(frames, sectorMs) {
      try {
        localStorage.setItem(GHOST_KEY, JSON.stringify({ frames, sectorMs }))
      } catch {}
    }

    loadGhost()

    let lapTime = 0, bestLapMs = Infinity
    let lapStarted = true, prevSeg = START_SEG, lastTS = null
    let inBuffer = false, racing = false, finishedRef = false
    let startTimeMs = null, bestLapSaved = null
    let sectorStartMs = [null, null, null]
    let currentSectorMs = [null, null, null]
    let lastSector = 0

    function resetCar() {
      const entrySeg = ENTRY_POINTS[selectedEntryRef.current].rawIdx * 4
      car.x = TRK[entrySeg][0]; car.y = TRK[entrySeg][1]
      car.angle = segAngle(entrySeg); car.speed = START_SPEED
      camX = car.x; camY = car.y
      lapStarted = true; lapTime = 0; prevSeg = entrySeg
      startTimeMs = null; inBuffer = false; finishedRef = false
      currentRecording = []; ghostIdx = 0; lastSector = 0
      sectorStartMs = [null, null, null]
      currentSectorMs = [null, null, null]
      if (ghostFrames.length > 0) ghostCar = { ...ghostFrames[0] }
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

      const sa=TRK[240],sb=TRK[241]
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
      camX = car.x; camY = car.y

      // RADIKALE VEREINFACHUNG: Wenn racing aktiv ist, läuft die Uhr bedingungslos ab sofort mit!
      if (racing && startTimeMs === null) {
        startTimeMs = ts;
      }

      // Die Fahrphysik wird jetzt komplett eigenständig ausgeführt, unabhängig davon ob startTimeMs geladen ist!
      if (racing && !finishedRef) {
        const left  = keys['ArrowLeft']  || keys['a'] || gameRef.current?.touches.left
        const right = keys['ArrowRight'] || keys['d'] || gameRef.current?.touches.right
        const maxSpd=855, acc=665, steer=2.6
        
        car.speed = Math.min(car.speed + acc*dt, maxSpd)
        const sf = Math.min(1, Math.abs(car.speed)/400)
        if (left)  car.angle -= steer*sf*dt
        if (right) car.angle += steer*sf*dt
        car.x += Math.cos(car.angle)*car.speed*dt
        car.y += Math.sin(car.angle)*car.speed*dt

        const recT = startTimeMs !== null ? ts - startTimeMs : 0
        currentRecording.push({ x: car.x, y: car.y, angle: car.angle, t: recT })

        if (ghostFrames.length > 0 && ghostCar && startTimeMs !== null) {
          const elapsed = ts - startTimeMs
          // zeitbasiertes Replay: suche den Frame der am nächsten an elapsed liegt
          while (ghostIdx < ghostFrames.length - 1 && (ghostFrames[ghostIdx + 1].t ?? (ghostIdx + 1) * 16) <= elapsed) {
            ghostIdx++
          }
          ghostCar = { ...ghostFrames[ghostIdx] }
        }

        const {seg,dist,cx,cy} = nearestPoint(car.x,car.y)
        if (dist>INNER_LIMIT && dist<=OUTER_LIMIT) {
          inBuffer=true
          const bufCap=maxSpd*0.5
          if (car.speed>bufCap) car.speed=Math.max(bufCap,car.speed-1800*dt)
        } else if (dist>OUTER_LIMIT) {
          inBuffer=false
          const push=(dist-OUTER_LIMIT)/dist
          car.x+=(cx-car.x)*push; car.y+=(cy-car.y)*push; car.speed*=Math.pow(0.72, dt*60)
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

        const atStart  = seg >= 238 && seg <= 242
        const wasStart = prevSeg >= 238 && prevSeg <= 242

        if (!wasStart && atStart) {
          if (!lapStarted) {
            lapStarted = true; startTimeMs = ts; lastSector = 0
          } else if (startTimeMs && lapTime > 2) {
            const lapMs = Math.round(ts - startTimeMs)
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
              bestLapSaved = bestLapMs; saveHighscore(bestLapMs)
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
      rafRef.current=requestAnimationFrame(loop)
    }

    rafRef.current=requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', resetAllKeys)
    }
  }, [])

  useEffect(() => {
    if (gameRef.current) gameRef.current.racing = gameState==='racing'
  }, [gameState])

  useEffect(() => { showGhostRef.current = showGhost }, [showGhost])
  useEffect(() => { selectedEntryRef.current = selectedEntry }, [selectedEntry])

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
                {['S1','S2','S3'].map((label, i) => (
                  <div key={label} className="monaco-sector-item">
                    <span className="monaco-sector-label">{label}</span>
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
              <div className="arcade-start-title">🎓 Monaco Training</div>
              {hasGhost && <p className="monaco-ghost-hint">👻 Ghost geladen – schlag deine Bestzeit!</p>}
              {!hasGhost && <p className="monaco-ghost-hint">Erste Runde wird als Ghost gespeichert.</p>}
              <div className="arcade-controls-hint">← → Lenken &nbsp;·&nbsp; Leertaste / ↺ Reset</div>

              <div style={{width:'100%',marginTop:'0.5rem'}}>
                <div style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:'0.3rem'}}>Modus</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.25rem'}}>
                  {[['qualifying','🏆 Qualifying'],['section','🔧 Abschnitt']].map(([mode, label]) => (
                    <button key={mode} className="btn"
                      style={{
                        fontSize:'0.75rem', padding:'0.3rem 0.4rem',
                        background: trainMode===mode ? 'rgba(100,181,246,0.25)' : 'transparent',
                        border: trainMode===mode ? '1px solid rgba(100,181,246,0.7)' : '1px solid var(--border)',
                        color: trainMode===mode ? '#64b5f6' : 'var(--text-secondary)',
                      }}
                      onClick={()=>{ setTrainMode(mode); if(mode==='qualifying') setSelectedEntry(0) }}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {trainMode==='qualifying' && (
                <p style={{fontSize:'0.72rem',color:'var(--text-muted)',margin:'0.35rem 0 0'}}>
                  Start/Ziel bei Abschnitt ⑤ · vollständige Runde
                </p>
              )}

              {trainMode==='section' && (
                <div style={{width:'100%',marginTop:'0.4rem'}}>
                  <div style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:'0.3rem'}}>Einstiegspunkt</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.25rem'}}>
                    {ENTRY_POINTS.map((ep, i) => (
                      <button key={i} className="btn"
                        style={{
                          fontSize:'0.7rem', padding:'0.25rem 0.4rem', textAlign:'left',
                          background: selectedEntry===i ? 'rgba(232,196,64,0.2)' : 'transparent',
                          border: selectedEntry===i ? '1px solid rgba(232,196,64,0.6)' : '1px solid var(--border)',
                          color: selectedEntry===i ? '#e8c440' : 'var(--text-secondary)',
                        }}
                        onClick={()=>setSelectedEntry(i)}
                      >{ep.emoji} {ep.label}</button>
                    ))}
                  </div>
                </div>
              )}

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
              className="arcade-btn"
              style={{fontSize:'0.7rem', padding:'0.2rem 0.5rem', opacity: showGhost ? 1 : 0.45, touchAction:'none'}}
              onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId); setShowGhost(v=>!v)}}
            >{showGhost ? '👻 AN' : '👻 AUS'}</button>
          )}
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
        <div className="arcade-lb-title">🏆 Bestzeiten Monaco Training</div>
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
    </div>
  )
}