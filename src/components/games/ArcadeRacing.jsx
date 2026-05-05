import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import './ArcadeRacing.css'

// ── Canada Track ──────────────────────────────────────────────────────────────
const RAW = [[420.16,368.0],[427.57,365.31],[440.97,360.0],[460.22,352.13],[485.16,341.78],[515.64,329.02],[530.98,322.56],[552.69,313.42],[579.68,302.07],[604.94,291.48],[621.43,284.58],[635.76,276.11],[639.19,257.52],[651.13,252.16],[666.89,245.63],[687.67,236.74],[711.3,226.42],[735.66,215.63],[758.58,205.33],[777.92,196.47],[793.87,188.69],[811.38,177.57],[828.64,163.9],[844.41,149.84],[860.44,139.52],[877.73,141.81],[903.8,152.74],[927.55,155.85],[944.25,148.04],[950.0,129.03],[942.79,111.37],[926.02,97.75],[907.23,87.72],[887.5,78.1],[867.83,69.77],[849.18,62.53],[827.88,54.46],[806.65,50.0],[787.82,54.62],[768.03,62.59],[749.64,61.7],[727.29,54.57],[707.39,50.53],[687.25,50.2],[667.12,53.35],[647.26,59.71],[627.92,69.05],[609.37,81.12],[591.86,95.68],[572.62,106.56],[563.33,89.54],[551.03,70.72],[534.63,65.14],[513.19,73.26],[503.6,78.29],[485.62,88.53],[459.9,103.61],[440.0,115.42],[421.53,126.48],[402.93,137.63],[387.9,148.37],[367.62,165.17],[353.0,177.39],[334.32,192.75],[319.0,204.92],[302.14,222.37],[300.03,239.46],[298.87,262.34],[288.99,276.74],[283.52,282.03],[271.12,293.63],[253.8,309.72],[233.54,328.47],[212.32,348.06],[192.12,366.66],[174.94,382.44],[162.77,393.58],[148.72,402.1],[126.49,411.25],[106.92,419.21],[86.35,427.42],[67.91,435.26],[50.0,447.5],[52.79,466.55],[68.97,473.47],[90.62,467.54],[113.35,459.73],[133.79,452.36],[156.2,445.07],[168.6,442.44],[185.28,439.04],[211.37,433.39],[235.32,428.11],[257.5,423.23],[271.56,420.17],[283.26,416.56],[302.66,410.15],[326.98,401.87],[353.45,392.7],[379.31,383.57],[401.79,375.44],[418.12,369.26]]

const TRACK_SCALE = 15
const TRACK_WIDTH = 280
const BUFFER = 80
const INNER_LIMIT = TRACK_WIDTH / 2
const OUTER_LIMIT = TRACK_WIDTH / 2 + BUFFER
const LAPS_TOTAL = 3
const GAME_W = 680
const GAME_H = 460
const CAR_SCREEN_X = GAME_W / 2
const CAR_SCREEN_Y = GAME_H - 30

function formatTime(ms) {
  if (!ms && ms !== 0) return '--:--.---'
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${mins}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export default function ArcadeRacing({ onClose }) {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const rafRef = useRef(null)
  const { profile } = useAuthStore()

  const [gameState, setGameState] = useState('idle')
  const [countdown, setCountdown] = useState(3)
  const [lap, setLap] = useState(0)
  const [currentLapTime, setCurrentLapTime] = useState(0)
  const [bestLap, setBestLap] = useState(null)
  const [lastLap, setLastLap] = useState(null)
  const [totalTime, setTotalTime] = useState(0)
  const [saved, setSaved] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])
  const [editMode, setEditMode] = useState(false)
  const editModeRef = useRef(false)

  useEffect(() => { loadLeaderboard() }, [])
  useEffect(() => { editModeRef.current = editMode }, [editMode])

  async function loadLeaderboard() {
    const { data } = await supabase
      .from('game_highscores')
      .select('lap_time_ms, profiles(display_name, avatar_url)')
      .eq('game', 'arcade_racing')
      .eq('track', 'canada')
      .order('lap_time_ms', { ascending: true })
      .limit(10)
    setLeaderboard(data ?? [])
  }

  async function saveHighscore(lapTimeMs) {
    if (!profile?.id) return
    const { data: existing } = await supabase
      .from('game_highscores')
      .select('lap_time_ms')
      .eq('profile_id', profile.id)
      .eq('game', 'arcade_racing')
      .eq('track', 'canada')
      .single()

    if (!existing || lapTimeMs < existing.lap_time_ms) {
      await supabase.from('game_highscores').upsert({
        profile_id: profile.id,
        game: 'arcade_racing',
        track: 'canada',
        lap_time_ms: lapTimeMs,
      }, { onConflict: 'profile_id,game,track' })
      setSaved(true)
      loadLeaderboard()
    }
  }

  const startGame = useCallback(() => {
    setGameState('countdown')
    setCountdown(3)
    setLap(0)
    setBestLap(null)
    setLastLap(null)
    setTotalTime(0)
    setSaved(false)
    gameRef.current?.resetCar?.()

    let c = 3
    const timer = setInterval(() => {
      c--
      setCountdown(c)
      if (c <= 0) { clearInterval(timer); setGameState('racing') }
    }, 1000)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const TRK = RAW.map(([x, y]) => [x * TRACK_SCALE, y * TRACK_SCALE])
    const N = TRK.length

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

    const car = { x: TRK[0][0], y: TRK[0][1], angle: segAngle(0), speed: 0 }
    let camX = car.x, camY = car.y

    let userArrows = [], dragStart = null, dragPreview = null
    let lapCount = 0, lapTime = 0, bestLapMs = Infinity
    let lapStarted = false, prevSeg = 0, lastTS = null
    let inBuffer = false, racing = false, finishedRef = false
    let startTimeMs = null, lastLapMs = null, bestLapSaved = null

    function resetCar() {
      car.x = TRK[0][0]; car.y = TRK[0][1]
      car.angle = segAngle(0); car.speed = 0
      camX = car.x; camY = car.y
      lapStarted = false; lapTime = 0; lapCount = 0; prevSeg = 0
      bestLapMs = Infinity; startTimeMs = null; lastLapMs = null
      inBuffer = false; finishedRef = false
    }

    gameRef.current = {
      resetCar,
      get racing() { return racing },
      set racing(v) { racing = v },
      touches: { left: false, right: false },
      setUserArrows: (a) => { userArrows = a },
    }

    // Input
    const keys = {}
    const onKey = (e) => {
      if (e.key === ' ') { resetCar(); e.preventDefault(); return }
      if (['ArrowLeft','ArrowRight','a','d'].includes(e.key)) {
        e.preventDefault(); keys[e.key] = e.type === 'keydown'
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    // Screen→World
    function screenToWorld(sx, sy) {
      const dx = sx - CAR_SCREEN_X, dy = sy - CAR_SCREEN_Y
      const a = car.angle + Math.PI / 2
      return { wx: camX + dx * Math.cos(a) - dy * Math.sin(a), wy: camY + dx * Math.sin(a) + dy * Math.cos(a) }
    }
    function canvasXY(e) {
      const r = canvas.getBoundingClientRect()
      return [( e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)]
    }
    const onMouseDown = (e) => { if (!editModeRef.current) return; e.preventDefault(); dragStart = screenToWorld(...canvasXY(e)) }
    const onMouseUp = (e) => {
      if (!editModeRef.current || !dragStart) return; e.preventDefault()
      const end = screenToWorld(...canvasXY(e))
      const dx = end.wx - dragStart.wx, dy = end.wy - dragStart.wy
      if (Math.sqrt(dx*dx+dy*dy) > 10) userArrows.push({ wx1: dragStart.wx, wy1: dragStart.wy, wx2: end.wx, wy2: end.wy })
      dragStart = null; dragPreview = null
    }
    const onMouseMove = (e) => { if (!editModeRef.current || !dragStart) return; dragPreview = screenToWorld(...canvasXY(e)) }
    const onContextMenu = (e) => { if (!editModeRef.current) return; e.preventDefault(); userArrows.pop() }
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('contextmenu', onContextMenu)

    // Draw
    function drawWorld() {
      ctx.save()
      ctx.translate(CAR_SCREEN_X, CAR_SCREEN_Y)
      ctx.rotate(-car.angle - Math.PI / 2)
      ctx.translate(-camX, -camY)

      const stroke = (style, width, close = true) => {
        ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(TRK[0][0], TRK[0][1])
        for (let i = 1; i < N; i++) ctx.lineTo(TRK[i][0], TRK[i][1])
        if (close) ctx.closePath(); ctx.stroke()
      }

      stroke('#1a1a2e', TRACK_WIDTH + BUFFER * 2 + 40)
      stroke('#c8611a', TRACK_WIDTH + BUFFER * 2)
      stroke('#2e2e3e', TRACK_WIDTH + 20)
      stroke('#484858', TRACK_WIDTH)

      // Buffer stripes
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

      // User arrows
      const allArrows = [...userArrows]
      if (editModeRef.current && dragStart && dragPreview)
        allArrows.push({ wx1:dragStart.wx, wy1:dragStart.wy, wx2:dragPreview.wx, wy2:dragPreview.wy, preview:true })
      for (const arr of allArrows) {
        const dx=arr.wx2-arr.wx1, dy=arr.wy2-arr.wy1, len=Math.sqrt(dx*dx+dy*dy)||1
        const ux=dx/len, uy=dy/len, qx=-uy, qy=ux, sz=Math.min(len,80)
        ctx.save(); ctx.globalAlpha=arr.preview?0.5:0.9
        ctx.strokeStyle='#e8c440'; ctx.lineWidth=8; ctx.lineCap='round'
        ctx.beginPath(); ctx.moveTo(arr.wx1,arr.wy1); ctx.lineTo(arr.wx2-ux*sz*0.3,arr.wy2-uy*sz*0.3); ctx.stroke()
        ctx.fillStyle='#e8c440'; ctx.beginPath(); ctx.moveTo(arr.wx2,arr.wy2)
        ctx.lineTo(arr.wx2-ux*sz*0.45+qx*sz*0.25,arr.wy2-uy*sz*0.45+qy*sz*0.25)
        ctx.lineTo(arr.wx2-ux*sz*0.45-qx*sz*0.25,arr.wy2-uy*sz*0.45-qy*sz*0.25)
        ctx.closePath(); ctx.fill()
        ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=2; ctx.stroke()
        ctx.restore()
      }

      // White edges
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
      ctx.save(); ctx.translate(sa[0],sa[1]); ctx.rotate(Math.atan2(-ddy/fl,ddx/fl))
      for (let i=0;i<8;i++) { ctx.fillStyle=i%2===0?'#fff':'#e8c440'; ctx.fillRect(-hw+i*cw,-8,cw,16) }
      ctx.restore()

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

    function drawEditOverlay() {
      if (!editModeRef.current) return
      ctx.save(); ctx.fillStyle='rgba(232,196,64,0.07)'; ctx.fillRect(0,0,GAME_W,GAME_H)
      ctx.font='bold 11px monospace'; ctx.textAlign='center'
      ctx.fillStyle='rgba(232,196,64,0.65)'
      ctx.fillText('✏️  PFEIL-MODUS  —  Ziehen = Pfeil · Rechtsklick = löschen',GAME_W/2,GAME_H-10)
      ctx.restore()
    }

    // Main loop
    function loop(ts) {
      if (!lastTS) lastTS = ts
      const dt = Math.min((ts-lastTS)/1000, 0.05)
      lastTS = ts
      camX = car.x; camY = car.y

      if (racing && !finishedRef && !editModeRef.current) {
        const left  = keys['ArrowLeft']  || keys['a'] || gameRef.current?.touches.left
        const right = keys['ArrowRight'] || keys['d'] || gameRef.current?.touches.right
        const maxSpd=855, acc=665, steer=1.8

        car.speed = Math.min(car.speed+acc*dt, maxSpd)
        const sf = Math.min(1,Math.abs(car.speed)/400)
        if (left)  car.angle -= steer*sf*dt
        if (right) car.angle += steer*sf*dt
        car.x += Math.cos(car.angle)*car.speed*dt
        car.y += Math.sin(car.angle)*car.speed*dt

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

        if (!startTimeMs) startTimeMs=ts
        lapTime=(ts-(lastLapMs??startTimeMs))/1000

        const atStart=seg<=1||seg>=N-2
        const wasStart=prevSeg<=1||prevSeg>=N-2
        if (!wasStart&&atStart&&lapStarted&&lapTime>2) {
          const lapMs=Math.round(lapTime*1000)
          const isNewBest=lapMs<bestLapMs
          if (isNewBest) bestLapMs=lapMs
          setBestLap(prev=>(!prev||lapMs<prev)?lapMs:prev)
          setLastLap(lapMs)
          lastLapMs=ts; lapCount++; setLap(lapCount)
          if (lapCount>=LAPS_TOTAL) {
            finishedRef=true
            setTotalTime(Math.round(ts-startTimeMs))
            setGameState('finished')
            if (bestLapMs!==Infinity&&bestLapMs!==bestLapSaved) {
              bestLapSaved=bestLapMs; saveHighscore(bestLapMs)
            }
          }
        }
        if (!lapStarted&&atStart) lapStarted=true
        prevSeg=seg
        setCurrentLapTime(Math.round(lapTime*1000))
      }

      ctx.fillStyle='#1a1a2e'; ctx.fillRect(0,0,GAME_W,GAME_H)
      drawWorld(); drawCar(); drawBufferWarning(); drawMinimap(); drawEditOverlay()
      rafRef.current=requestAnimationFrame(loop)
    }

    rafRef.current=requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown',onKey)
      window.removeEventListener('keyup',onKey)
      canvas.removeEventListener('mousedown',onMouseDown)
      canvas.removeEventListener('mouseup',onMouseUp)
      canvas.removeEventListener('mousemove',onMouseMove)
      canvas.removeEventListener('contextmenu',onContextMenu)
    }
  }, [])

  useEffect(() => {
    if (gameRef.current) gameRef.current.racing = gameState==='racing'
  }, [gameState])

  function touchStart(action) { if (gameRef.current) gameRef.current.touches[action]=true }
  function touchEnd(action)   { if (gameRef.current) gameRef.current.touches[action]=false }

  return (
    <div className="arcade-root">
      <div className="arcade-game-wrap">
        <canvas ref={canvasRef} width={GAME_W} height={GAME_H} className="arcade-canvas" />

        {/* HUD */}
        {gameState==='racing' && (
          <div className="arcade-hud">
            <div className="arcade-hud-left">
              <div className="arcade-hud-lap">Runde {Math.min(lap+1,LAPS_TOTAL)} / {LAPS_TOTAL}</div>
              <div className="arcade-hud-time">{formatTime(currentLapTime)}</div>
              {bestLap && <div className="arcade-hud-best">Best: {formatTime(bestLap)}</div>}
              {lastLap && <div className="arcade-hud-last">Letzte: {formatTime(lastLap)}</div>}
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
              <button onClick={()=>setEditMode(v=>!v)} style={{
                padding:'3px 8px',borderRadius:5,fontSize:11,cursor:'pointer',fontWeight:700,pointerEvents:'all',
                border:'1.5px solid #e8c440',background:editMode?'#e8c440':'rgba(0,0,0,0.6)',color:editMode?'#1a1a2e':'#e8c440',
              }}>{editMode?'🎮':'✏️'}</button>
              {editMode && (
                <button onClick={()=>gameRef.current?.setUserArrows([])} style={{
                  padding:'3px 8px',borderRadius:5,fontSize:11,cursor:'pointer',pointerEvents:'all',
                  border:'1px solid #555',background:'rgba(0,0,0,0.6)',color:'#aaa',
                }}>🗑</button>
              )}
            </div>
          </div>
        )}

        {/* Countdown */}
        {gameState==='countdown' && (
          <div className="arcade-overlay">
            <div className="arcade-countdown">{countdown>0?countdown:'GO!'}</div>
          </div>
        )}

        {/* Finished */}
        {gameState==='finished' && (
          <div className="arcade-overlay">
            <div className="arcade-finish-card">
              <div className="arcade-finish-title">🏁 Ziel!</div>
              <div className="arcade-finish-row"><span>Gesamtzeit</span><span>{formatTime(totalTime)}</span></div>
              <div className="arcade-finish-row"><span>Beste Runde</span><span style={{color:'#4ade80'}}>{formatTime(bestLap)}</span></div>
              {saved && <div className="arcade-finish-saved">✅ Neuer Rekord gespeichert!</div>}
              <button className="btn btn-primary" onClick={startGame} style={{marginTop:'0.75rem'}}>Nochmal</button>
            </div>
          </div>
        )}

        {/* Start */}
        {gameState==='idle' && (
          <div className="arcade-overlay">
            <div className="arcade-start-card">
              <div className="arcade-start-title">🏎️ Canada</div>
              <p className="arcade-start-sub">{LAPS_TOTAL} Runden · Auto gibt automatisch Gas</p>
              <div className="arcade-controls-hint">← → Lenken · Leertaste Reset</div>
              <button className="btn btn-primary" onClick={startGame}>START</button>
            </div>
          </div>
        )}
      </div>

      {/* Touch Controls */}
      <div className="arcade-touch-controls">
        <div className="arcade-touch-left">
          <button className="arcade-btn arcade-btn--turn"
            onTouchStart={()=>touchStart('left')} onTouchEnd={()=>touchEnd('left')}
            onMouseDown={()=>touchStart('left')} onMouseUp={()=>touchEnd('left')}>◀</button>
        </div>
        <div className="arcade-touch-right">
          <button className="arcade-btn arcade-btn--turn"
            onTouchStart={()=>touchStart('right')} onTouchEnd={()=>touchEnd('right')}
            onMouseDown={()=>touchStart('right')} onMouseUp={()=>touchEnd('right')}>▶</button>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="arcade-leaderboard card">
        <div className="arcade-lb-title">🏆 Bestzeiten Canada</div>
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
