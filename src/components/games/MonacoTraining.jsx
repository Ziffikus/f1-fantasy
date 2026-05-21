import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import './MonacoTraining.css'

// ── Canada Track (same as ArcadeRacing) ──────────────────────────────────────
const RAW = [[420.16,368.0],[427.57,365.31],[440.97,360.0],[460.22,352.13],[485.16,341.78],[515.64,329.02],[530.98,322.56],[552.69,313.42],[579.68,302.07],[604.94,291.48],[621.43,284.58],[635.76,276.11],[639.19,257.52],[651.13,252.16],[666.89,245.63],[687.67,236.74],[711.3,226.42],[735.66,215.63],[758.58,205.33],[777.92,196.47],[793.87,188.69],[811.38,177.57],[828.64,163.9],[844.41,149.84],[860.44,139.52],[877.73,141.81],[903.8,152.74],[927.55,155.85],[944.25,148.04],[950.0,129.03],[942.79,111.37],[926.02,97.75],[907.23,87.72],[887.5,78.1],[867.83,69.77],[849.18,62.53],[827.88,54.46],[806.65,50.0],[787.82,54.62],[768.03,62.59],[749.64,61.7],[727.29,54.57],[707.39,50.53],[687.25,50.2],[667.12,53.35],[647.26,59.71],[627.92,69.05],[609.37,81.12],[591.86,95.68],[572.62,106.56],[563.33,89.54],[551.03,70.72],[534.63,65.14],[513.19,73.26],[503.6,78.29],[485.62,88.53],[459.9,103.61],[440.0,115.42],[421.53,126.48],[402.93,137.63],[387.9,148.37],[367.62,165.17],[353.0,177.39],[334.32,192.75],[319.0,204.92],[302.14,222.37],[300.03,239.46],[298.87,262.34],[288.99,276.74],[283.52,282.03],[271.12,293.63],[253.8,309.72],[233.54,328.47],[212.32,348.06],[192.12,366.66],[174.94,382.44],[162.77,393.58],[148.72,402.1],[126.49,411.25],[106.92,419.21],[86.35,427.42],[67.91,435.26],[50.0,447.5],[52.79,466.55],[68.97,473.47],[90.62,467.54],[113.35,459.73],[133.79,452.36],[156.2,445.07],[168.6,442.44],[185.28,439.04],[211.37,433.39],[235.32,428.11],[257.5,423.23],[271.56,420.17],[283.26,416.56],[302.66,410.15],[326.98,401.87],[353.45,392.7],[379.31,383.57],[401.79,375.44],[418.12,369.26]]

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

const GHOST_KEY   = 'monacoTraining_canada_ghost'
const PENDING_KEY = 'monacoTraining_canada_pendingScore'

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

// ── Sector calculation helpers ────────────────────────────────────────────────
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
  const [ghostDelta,     setGhostDelta]     = useState(null)  // ms: negative = faster than ghost
  const [finishedSectors, setFinishedSectors] = useState([null, null, null])

  const resetStateRef = useRef(null)

  useEffect(() => {
    loadLeaderboard()
    trySyncPendingScore()
    // Check if ghost exists
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
      .eq('track', 'canada')
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
      .eq('track', 'canada')
      .single()
    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr
    if (!existing || lapTimeMs < existing.lap_time_ms) {
      const { error } = await supabase
        .from('game_highscores')
        .upsert({ profile_id: profile.id, game: 'monaco_training', track: 'canada', lap_time_ms: lapTimeMs },
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

    // ── Ghost system ──────────────────────────────────────────────────────────
    // Ghost frames: [{x,y,angle,speed}, ...] recorded at ~60fps
    let ghostFrames = []
    let ghostIdx    = 0
    let ghostCar    = null  // {x,y,angle} displayed ghost
    let recordFrames = []   // current run recording
    let ghostSectorMs = [null, null, null]  // ghost sector timestamps

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
    let currentRecording = []
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

      // Sector color stripes on track
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

      // Buffer zones
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

      // White lines
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

      // Center dash
      ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=4; ctx.setLineDash([30,40])
      stroke('rgba(255,255,255,0.15)', 4)
      ctx.setLineDash([])

      // Start/finish line
      const sa=TRK[0],sb=TRK[1]
      const ddx=sb[0]-sa[0],ddy=sb[1]-sa[1],fl=Math.sqrt(ddx*ddx+ddy*ddy)||1
      const hw=TRACK_WIDTH/2+4, cw=hw*2/8
      ctx.save(); ctx.translate(sa[0],sa[1]); ctx.rotate(Math.atan2(ddx/fl,-ddy/fl))
      for (let i=0;i<8;i++) { ctx.fillStyle=i%2===0?'#fff':'#4af'; ctx.fillRect(-hw+i*cw,-8,cw,16) }
      ctx.restore()

      // Sector markers
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

        // Record frame
        currentRecording.push({ x: car.x, y: car.y, angle: car.angle })

        // Advance ghost
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

        // Sector detection
        const curSector = getSectorForSeg(seg, N)
        if (lapStarted && startTimeMs !== null) {
          if (curSector !== lastSector && curSector > lastSector && curSector > 0 && curSector <= N_SECTORS - 1) {
            // Sector just crossed
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
              // Save ghost for this run
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
          // Live ghost delta
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

        {/* BETA badge */}
        <div className="monaco-beta-badge">BETA</div>

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

              {/* Sector breakdown */}
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
              <div className="monaco-beta-inline">BETA</div>
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

      {/* HUD */}
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

      {/* Touch controls */}
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

      {/* Leaderboard */}
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
