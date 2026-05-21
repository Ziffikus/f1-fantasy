import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import './MonacoTraining.css'

// ── Gespiegelte Monaco-Strecke (Start bei Punkt 60) ─────────────────────────
const RAW = [
  [144.56, 693.85], [161.82, 674.76], [181.01, 655.02], [200.08, 636.4],
  [219.48, 618.19], [239.78, 599.81], [259.88, 582.2],  [281.03, 563.26],
  [304.02, 558.61], [323.5, 577.54],  [333.35, 584.57], [349.37, 594.71],
  [371.22, 608.53], [397.06, 624.86], [425.05, 634.95], [453.36, 660.39],
  [480.15, 677.25], [503.78, 691.83], [526.59, 703.02], [551.93, 715.07],
  [574.87, 727.04], [597.24, 743.12], [620.69, 760.47], [644.73, 771.53],
  [670.97, 771.67], [689.41, 757.08], [699.2, 734.07],  [701.66, 705.57],
  [706.97, 679.63], [725.16, 662.77], [757.63, 654.4],  [793.73, 648.28],
  [824.11, 643.11], [848.79, 638.9],  [867.75, 635.65], [886.35, 633.87],
  [905.44, 645.75], [896.2, 671.45],  [879.06, 690.89], [867.86, 713.17],
  [857.51, 739.94], [877.41, 729.17], [339.39, 637.57], [361.37, 653.19],
  [382.4, 669.18],  [409.1, 689.97],  [426.25, 703.21], [445.49, 720.86],
  [452.72, 746.16], [474.56, 749.2],  [497.97, 737.5],  [519.8, 746.96],
  [544.26, 762.04], [567.8, 776.67],  [597.46, 794.79], [617.99, 806.57],
  [636.73, 814.86], [662.91, 823.69], [688.95, 829.83], [716.4, 833.46],
  [743.76, 833.88], [770.06, 830.68], [795.16, 823.68], [818.9, 812.66],
  [847.62, 794.5],  [876.81, 775.66], [900.63, 760.07], [919.07, 747.73],
  [932.13, 738.63], [914.22, 719.45], [898.86, 724.81], [883.78, 746.05],
  [859.08, 758.14], [842.23, 743.7],  [848.5, 716.48],  [861.01, 692.58],
  [874.98, 671.72], [889.95, 650.17], [871.82, 650.85], [853.42, 653.98],
  [829.35, 658.06], [799.6, 663.1],  [764.19, 669.1],  [730.33, 677.61],
  [717.35, 697.27], [716.63, 725.76], [710.02, 751.76], [696.93, 772.68],
  [676.46, 786.3],  [650.98, 788.6],  [623.4, 779.8],   [602.29, 766.57],
  [577.63, 747.55], [556.52, 734.62], [532.63, 723.01], [508.16, 711.25],
  [484.13, 697.84], [455.87, 680.07], [425.0, 660.62],  [393.95, 641.01],
  [365.14, 622.8],  [341.0, 607.53],  [323.94, 596.73], [316.4, 591.96],
  [307.75, 582.49], [288.35, 578.03], [267.25, 596.88], [247.19, 614.52],
  [227.0, 632.84],  [207.71, 651.0],  [188.46, 670.01], [169.69, 689.63],
  [152.14, 709.4],  [133.23, 733.27], [119.0, 754.93],  [108.57, 776.37],
  [98.21, 800.73],  [91.0, 825.65],   [87.07, 852.38],  [73.63, 874.28],
  [74.78, 893.06],  [98.11, 910.88],  [120.51, 927.34], [140.84, 934.59],
  [133.67, 908.52], [126.04, 883.95], [123.85, 858.28], [125.19, 830.43],
  [129.41, 800.97], [137.85, 778.63], [158.62, 766.24], [181.81, 766.9],
  [197.19, 748.22], [215.77, 725.36], [218.0, 698.59],  [226.14, 676.73],
  [241.8, 662.11],  [264.44, 642.07], [288.98, 623.6],  [312.82, 621.44],
  [887.23, 713.16], [908.66, 700.35], [927.31, 709.45], [950.0, 731.03],
  [940.92, 751.42], [926.91, 761.2],  [907.83, 774.0],  [883.63, 789.86],
  [854.28, 808.82], [826.07, 826.64], [802.25, 837.83], [777.23, 845.28],
  [751.15, 849.19], [724.14, 849.72], [696.48, 847.1],  [670.1, 841.91],
  [644.49, 834.39], [619.31, 824.64], [603.19, 816.36], [577.94, 801.35],
  [551.14, 784.76], [527.35, 770.02], [502.13, 755.18], [481.69, 763.81],
  [458.03, 766.98], [438.2, 751.88],  [430.73, 727.12], [413.45, 713.07],
  [390.02, 694.86], [365.51, 675.81], [343.94, 659.78], [322.24, 643.87],
  [299.03, 636.72], [274.71, 653.79], [252.14, 673.79], [236.19, 688.87],
  [236.15, 713.09], [226.28, 736.99], [206.65, 760.98], [191.64, 779.16],
  [169.83, 787.67], [148.97, 790.37], [142.45, 814.18], [139.68, 843.56],
  [139.64, 871.14], [145.0, 895.68],  [156.41, 922.67], [150.79, 946.28],
  [128.35, 950.0],  [107.45, 937.48],  [82.31, 918.65],  [60.81, 902.21],
  [50.0, 878.45],   [66.32, 861.92],  [73.5, 834.51],   [78.73, 809.07],
  [87.92, 783.74],  [98.34, 760.14],  [109.62, 739.68], [125.29, 717.34]
]

const TRACK_SCALE = 15
const TRACK_WIDTH = 280
const BUFFER      = 80
const INNER_LIMIT = TRACK_WIDTH / 2
const OUTER_LIMIT = TRACK_WIDTH / 2 + BUFFER
const GAME_W = 720
const GAME_H = 500
const CAR_SCREEN_X = GAME_W / 2
const CAR_SCREEN_Y = GAME_H - 35
const ZOOM = 0.62

const GHOST_KEY   = 'monacoTraining_mirrored_ghost'
const PENDING_KEY = 'monacoTraining_mirrored_pendingScore'

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
      .eq('track', 'monaco_mirrored')
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
      .eq('track', 'monaco_mirrored')
      .single()
    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr
    if (!existing || lapTimeMs < existing.lap_time_ms) {
      const { error } = await supabase
        .from('game_highscores')
        .upsert({ profile_id: profile.id, game: 'monaco_training', track: 'monaco_mirrored', lap_time_ms: lapTimeMs },
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

    const TRK = RAW.map(([x, y]) => [x * TRACK_SCALE, y * TRACK_SCALE])
    const N = TRK.length
    const START_SEG   = N - 8
    const START_SPEED = 200

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
    let lapStarted = false, prevSeg = START_SEG, lastTS = null
    let inBuffer = false, racing = false, finishedRef = false
    let startTimeMs = null, bestLapSaved = null
    let sectorStartMs = [null, null, null]
    let currentSectorMs = [null, null, null]
    let lastSector = -1

    function resetCar() {
      car.x = TRK[START_SEG][0]; car.y = TRK[START_SEG][1]
      car.angle = segAngle(START_SEG); car.speed = START_SPEED
      camX = car.x; camY = car.y
      lapStarted = false; lapTime = 0; prevSeg = START_SEG
      startTimeMs = null; inBuffer = false; finishedRef = false
      currentRecording = []; ghostIdx = 0; lastSector = -1
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
      const pad=8,xs=RAW.map(p=>p[0]),ys=RAW.map(p=>p[1])
      const mnx=Math.min(...xs),mxx=Math.max(...xs),mny=Math.min(...ys),mxy=Math.max(...ys)
      const sc2=Math.min((mw-pad*2)/(mxx-mnx),(mh-pad*2)/(mxy-mny))
      const ox2=mx+pad+(mw-pad*2-(mxx-mnx)*sc2)/2, oy2=my+pad+(mh-pad*2-(mxy-mny)*sc2)/2
      const mm=(p)=>[ox2+(p[0]-mnx)*sc2,oy2+(p[1]-mny)*sc2]
      ctx.strokeStyle='#4a4a5e'; ctx.lineWidth=4
      ctx.beginPath(); const p0=mm(RAW[0]); ctx.moveTo(p0[0],p0[1])
      for (let i=1;i<N;i++) { const p=mm(RAW[i]); ctx.lineTo(p[0],p[1]) }
      ctx.closePath(); ctx.stroke()
      ctx.strokeStyle='#aaa'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(p0[0],p0[1])
      for (let i=1;i<N;i++) { const p=mm(RAW[i]); ctx.lineTo(p[0],p[1]) }
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
      ctx.fillText('⚠ BUFFERZONE – 50% Speed',GAME_W/2,28)
      ctx.globalAlpha=1; ctx.restore()
    }

    function loop(ts) {
      if (!lastTS) lastTS = ts
      const dt = Math.min((ts-lastTS)/1000, 0.05)
      lastTS = ts
      camX = car.x; camY = car.y

      if (racing && !finishedRef) {
        const left  = keys['ArrowLeft']  || keys['a'] || gameRef.current?.touches.left
        const right = keys['ArrowRight'] || keys['d'] || gameRef.current?.touches.right
        const maxSpd=855, acc=665, steer=1.8
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

        const atStart  = seg <= 1 || seg >= N-2
        const wasStart = prevSeg <= 1 || prevSeg >= N-2

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

        <div className="monaco-beta-badge">MIRRORED</div>

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
              <div className="monaco-beta-inline">MIRRORED</div>
              <div className="arcade-start-title">🎓 Monaco Training</div>
              <p className="arcade-start-sub">1 Runde · Fahre gegen deinen Ghost (Gespiegelt)</p>
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
        <div className="arcade-lb-title">🏆 Bestzeiten Monaco (Gespiegelt)</div>
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