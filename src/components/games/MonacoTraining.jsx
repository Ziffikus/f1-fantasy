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

// ── Exakte Monaco-Ideallinie (Punkte 0 bis 101 aus der JSON) ────────────────
const RAW = [
  [887.23, 286.84], [908.66, 299.65], [927.31, 290.55], [950.0, 268.97],
  [940.92, 248.58], [926.91, 238.8],  [907.83, 226.0],  [883.63, 210.14],
  [854.28, 191.18], [826.07, 173.36], [802.25, 162.17], [777.23, 154.72],
  [751.15, 150.81], [724.14, 150.28], [696.48, 152.9],  [670.1, 158.09],
  [644.49, 165.61], [619.31, 175.36], [603.19, 183.64], [577.94, 198.65],
  [551.14, 215.24], [527.35, 229.98], [502.13, 244.82], [481.69, 236.19],
  [458.03, 233.02], [438.2, 248.12],  [430.73, 272.88], [413.45, 286.93],
  [390.02, 305.14], [365.51, 324.19], [343.94, 340.22], [322.24, 356.13],
  [299.03, 363.28], [274.71, 346.21], [252.14, 326.21], [236.19, 311.13],
  [236.15, 286.91], [226.28, 263.01], [206.65, 239.02], [191.64, 220.84],
  [169.83, 212.33], [148.97, 209.63], [142.45, 185.82], [139.68, 156.44],
  [139.64, 128.86], [145.0, 104.32],  [156.41, 77.33],  [150.79, 53.72],
  [128.35, 50.0],  [107.45, 62.52],  [82.31, 81.35],   [60.81, 97.79],
  [50.0, 121.55],   [66.32, 140.08],  [73.5, 165.49],   [78.73, 190.93],
  [87.92, 216.26],  [98.34, 239.86],  [109.62, 260.32], [125.29, 282.66],
  [144.56, 306.15], [161.82, 325.24], [181.01, 344.98], [200.08, 363.6],
  [219.48, 381.81], [239.78, 400.19], [259.88, 417.8],  [281.03, 436.74],
  [304.02, 441.39], [323.5, 422.46],  [333.35, 415.43], [349.37, 405.29],
  [371.22, 391.47], [397.06, 375.14], [425.05, 357.46], [453.36, 339.61],
  [480.15, 322.75], [503.78, 308.17], [526.59, 296.98], [551.93, 284.93],
  [574.87, 272.96], [597.24, 256.88], [620.69, 239.53], [644.73, 228.47],
  [670.97, 228.33], [689.41, 242.92], [699.2, 265.93],  [701.66, 294.43],
  [706.97, 320.37], [725.16, 337.23], [757.63, 345.6],  [793.73, 351.72],
  [824.11, 356.89], [848.79, 361.1],  [867.75, 364.35], [886.35, 366.13],
  [905.44, 354.25], [896.2, 328.55],  [879.06, 309.11], [850.86, 286.83],
  [840.51, 260.06], [877.41, 270.83]
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
    
    // Starte bei Index 4, damit es garantiert ein paar Meter Abstand zur Ziellinie (0) hat
    const START_SEG   = 4
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
      car.x = TRK[START_SEG][0]; car.y = TRK[START_SEG][1]
      car.angle = segAngle(START_SEG); car.speed = START_SPEED
      camX = car.x; camY = car.y
      lapStarted = true; lapTime = 0; prevSeg = START_SEG
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
    const onKey = (e) => {
      if (e.key === ' ') { e.preventDefault(); resetStateRef.current?.(); return }
      if (['ArrowLeft','ArrowRight','a','d'].includes(e.key)) {
        e.preventDefault(); keys[e.key] = e.type === 'keydown'
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

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

      const sa=TRK[0],sb=TRK[1]
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
      ctx.rotate(ghostCar.angle + Math.PI / 2)
      ctx.globalAlpha = 0.38
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

        currentRecording.push({ x: car.x, y: car.y, angle: car.angle })

        if (ghostFrames.length > 0 && ghostCar) {
          ghostIdx = Math.min(ghostIdx + 1, ghostFrames.length - 1)
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
          car.x+=(cx-car.x)*push; car.y+=(cy-car.y)*push; car.speed*=0.72
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

        const atStart  = seg <= 2 || seg >= N-4
        const wasStart = prevSeg <= 2 || prevSeg >= N-4

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
      drawWorld(); drawGhost(); drawCar(); drawBufferWarning(); drawMinimap()
      rafRef.current=requestAnimationFrame(loop)
    }

    rafRef.current=requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown',onKey)
      window.removeEventListener('keyup',onKey)
    }
  }, [])

  useEffect(() => {
    if (gameRef.current) gameRef.current.racing = gameState==='racing'
  }, [gameState])

  function touchStart(action) { if (gameRef.current) gameRef.current.touches[action]=true }
  function touchEnd(action)   { if (gameRef.current) gameRef.current.touches[action]=false }

  const deltaColor = ghostDelta === null ? '#fff' : ghostDelta < 0 ? '#4ade80' : '#f87171'
  const deltaText  = ghostDelta === null ? '' : (ghostDelta < 0 ? '-' : '+') + formatTime(Math.abs(ghostDelta))

  return (
    <div className="arcade-root monaco-root">
      <div className="arcade-game-wrap">
        <canvas ref={canvasRef} width={GAME_W} height={GAME_H} className="arcade-canvas" />

        <div className="monaco-beta-badge">LIVE</div>

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
              <p className="arcade-start-sub">1 Runde · Fahre gegen deinen Ghost</p>
              {hasGhost && <p className="monaco-ghost-hint">👻 Ghost geladen – schlag deine Bestzeit!</p>}
              {!hasGhost && <p className="monaco-ghost-hint">Erste Runde wird als Ghost gespeichert.</p>}
              <div className="arcade-controls-hint">← → Lenken &nbsp;·&nbsp; Leertaste / ↺ Reset</div>
              <div className="monaco-sector-info">
                <span className="monaco-s1-dot">●</span> S1
                <span className="monaco-s2-dot">●</span> S2
                <span className="monaco-s3-dot">●</span> S3
              </div>
              <button className="btn btn-primary" onClick={startGame}>START</button>
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
          {ghostDelta !== null && (
            <div className="monaco-ghost-delta">
              <span className="arcade-hud-bar-label">vs Ghost</span>
              <span className="arcade-hud-bar-value" style={{color: deltaColor, fontSize:'1rem'}}>{deltaText}</span>
            </div>
          )}
        </div>
      )}

      <div className="arcade-touch-controls">
        <div className="arcade-touch-left">
          <button className="arcade-btn arcade-btn--turn"
            onTouchStart={()=>touchStart('left')} onTouchEnd={()=>touchEnd('left')}
            onMouseDown={()=>touchStart('left')} onMouseUp={()=>touchEnd('left')}>◀</button>
        </div>
        <button
          className="arcade-btn arcade-btn--reset"
          onClick={resetGame}
          onTouchStart={(e)=>{ e.preventDefault(); resetGame() }}
        >↺</button>
        <div className="arcade-touch-right">
          <button className="arcade-btn arcade-btn--turn"
            onTouchStart={()=>touchStart('right')} onTouchEnd={()=>touchEnd('right')}
            onMouseDown={()=>touchStart('right')} onMouseUp={()=>touchEnd('right')}>▶</button>
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