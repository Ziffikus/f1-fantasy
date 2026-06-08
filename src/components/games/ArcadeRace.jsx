import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import './ArcadeRace.css'

// ── Track-Registry ────────────────────────────────────────────────────────────
// Neue Tracks nur in tracks/index.js eintragen – sie erscheinen automatisch hier.
import { ALL_TRACKS } from './tracks'

// ── Mathematische Kurvenglättung (Catmull-Rom-Spline) ────────────────────────
function interpolateCatmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t
  return [
    0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
    0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3),
  ]
}

function subdivideTrack(rawPoints, subdivisions = 4) {
  const N = rawPoints.length
  const out = []
  for (let i = 0; i < N; i++) {
    const p0 = rawPoints[(i - 1 + N) % N]
    const p1 = rawPoints[i]
    const p2 = rawPoints[(i + 1) % N]
    const p3 = rawPoints[(i + 2) % N]
    for (let j = 0; j < subdivisions; j++) out.push(interpolateCatmullRom(p0, p1, p2, p3, j / subdivisions))
  }
  return out
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
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

// ── Spielkonstanten (layout-bezogen, track-unabhängig) ────────────────────────
const GAME_W       = 720
const GAME_H       = 500
const CAR_SCREEN_X = GAME_W / 2
const CAR_SCREEN_Y = GAME_H - 35
const ZOOM         = 0.63

// ── Hauptkomponente ───────────────────────────────────────────────────────────
/**
 * @param {object} props
 * @param {object} [props.track]   – Track-Definition (aus .track.js). Fallback: MONACO_TRACK
 * @param {function} [props.onClose]
 */
export default function ArcadeRace({ track: trackProp, onClose }) {
  // Track-Auswahl – prop überschreibt den internen State (Rückwärtskompatibilität)
  const [selectedTrackId, setSelectedTrackId] = useState(
    trackProp?.id ?? ALL_TRACKS[0]?.id
  )
  const track = trackProp ?? ALL_TRACKS.find(t => t.id === selectedTrackId) ?? ALL_TRACKS[0]

  // Aus dem Track-Objekt abgeleitete Konstanten
  const TRACK_SCALE  = track.scale
  const TRACK_WIDTH  = track.trackWidth
  const BUFFER       = track.buffer
  const INNER_LIMIT  = TRACK_WIDTH / 2
  const OUTER_LIMIT  = TRACK_WIDTH / 2 + BUFFER
  const N_SECTORS    = track.sectorCount ?? 3
  const START_RAW    = track.startIndex
  const ENTRY_POINTS = track.entryPoints ?? []

  // Ghost / Pending Keys sind pro Track eindeutig
  const GHOST_KEY   = `arcadeRace_ghost_${track.id}`
  const PENDING_KEY = `arcadeRace_pending_${track.id}`

  // ── React State ─────────────────────────────────────────────────────────────
  const canvasRef  = useRef(null)
  const gameRef    = useRef(null)
  const rafRef     = useRef(null)
  const { profile } = useAuthStore()

  const [gameState,        setGameState]        = useState('idle')
  const [countdown,        setCountdown]        = useState(3)
  const [currentLapTime,   setCurrentLapTime]   = useState(null)
  const [bestLap,          setBestLap]          = useState(null)
  const [totalTime,        setTotalTime]        = useState(0)
  const [saved,            setSaved]            = useState(false)
  const [saveError,        setSaveError]        = useState(false)
  const [saving,           setSaving]           = useState(false)
  const [leaderboard,      setLeaderboard]      = useState([])
  const [hasGhost,         setHasGhost]         = useState(false)
  const [sectorTimes,      setSectorTimes]      = useState(Array(N_SECTORS).fill(null))
  const [ghostDelta,       setGhostDelta]       = useState(null)
  const [finishedSectors,  setFinishedSectors]  = useState(Array(N_SECTORS).fill(null))
  const [showGhost,        setShowGhost]        = useState(true)
  const showGhostRef = useRef(true)
  const [selectedEntry,    setSelectedEntry]    = useState(0)
  const selectedEntryRef   = useRef(0)
  const [trainMode,        setTrainMode]        = useState('qualifying')
  const trainModeRef       = useRef('qualifying')

  const resetStateRef = useRef(null)

  useEffect(() => {
    loadLeaderboard()
    trySyncPendingScore()
    try { if (localStorage.getItem(GHOST_KEY)) setHasGhost(true) } catch {}
  }, [track.id])  // Neu laden wenn Track wechselt

  // ── Datenbank ────────────────────────────────────────────────────────────────
  // Tabellenname: <track.id>_highscores  (z.B. "monaco_highscores")
  const TABLE = `${track.id}_highscores`

  async function loadLeaderboard() {
    const { data } = await supabase
      .from(TABLE)
      .select('lap_time_ms, profiles(display_name, avatar_url)')
      .order('lap_time_ms', { ascending: true })
      .limit(10)
    setLeaderboard(data ?? [])
  }

  // Pending-Score: lokal zwischenspeichern wenn offline / nicht eingeloggt
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

  // Nutzt die DB-Funktion upsert_track_highscore() → speichert nur wenn besser
  async function upsertScore(lapTimeMs) {
    const { data, error } = await supabase.rpc('upsert_track_highscore', {
      p_table: TABLE,
      p_time:  lapTimeMs,
    })
    if (error) throw error
    return data?.saved ?? false   // true = neuer Rekord
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

  // ── Spielsteuerung ────────────────────────────────────────────────────────────
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

  // ── Game-Loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    // Track aus Track-Objekt aufbauen
    const SMOOTH_RAW = subdivideTrack(track.points, 4)
    const TRK = SMOOTH_RAW.map(([x, y]) => [x * TRACK_SCALE, y * TRACK_SCALE])
    const N   = TRK.length

    // Start-Segment aus RAW-Index × Subdivision
    const START_SEG   = START_RAW * 4
    const START_SPEED = 0

    function getSectorForSeg(seg) {
      return Math.floor(seg / N * N_SECTORS)
    }

    function nearestPoint(x, y) {
      let best = 1e9, bi = 0, px = x, py = y
      for (let i = 0; i < N; i++) {
        const a = TRK[i], b = TRK[(i + 1) % N]
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx*dx + dy*dy
        let t = l2 > 0 ? ((x-a[0])*dx + (y-a[1])*dy) / l2 : 0
        t = Math.max(0, Math.min(1, t))
        const qx = a[0]+t*dx, qy = a[1]+t*dy
        const d = (x-qx)**2 + (y-qy)**2
        if (d < best) { best = d; bi = i; px = qx; py = qy }
      }
      return { seg: bi, dist: Math.sqrt(best), cx: px, cy: py }
    }

    function segAngle(i) {
      const a = TRK[i], b = TRK[(i+1) % N]
      return Math.atan2(b[1]-a[1], b[0]-a[0])
    }

    const car = {
      x: TRK[START_SEG][0], y: TRK[START_SEG][1],
      angle: segAngle(START_SEG), speed: START_SPEED,
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
        ghostFrames   = data.frames   ?? []
        ghostSectorMs = data.sectorMs ?? Array(N_SECTORS).fill(null)
        ghostIdx = 0
        ghostCar = ghostFrames.length > 0 ? { ...ghostFrames[0] } : null
      } catch {}
    }

    function saveGhost(frames, sectorMs) {
      try { localStorage.setItem(GHOST_KEY, JSON.stringify({ frames, sectorMs })) } catch {}
    }

    loadGhost()

    // Einstiegspunkt ermitteln (Abschnittstraining)
    function resolveStartSeg() {
      const mode  = trainModeRef.current
      const entry = selectedEntryRef.current
      if (mode === 'qualifying' || !ENTRY_POINTS[entry]) return START_SEG
      return ENTRY_POINTS[entry].rawIdx * 4
    }

    gameRef.current = {
      racing: false,
      touches: { left: false, right: false },
      resetCar() {
        const seg = resolveStartSeg()
        car.x = TRK[seg][0]; car.y = TRK[seg][1]
        car.angle = segAngle(seg); car.speed = START_SPEED
        camX = car.x; camY = car.y
        currentRecording = []
        ghostIdx = 0
        if (ghostCar && ghostFrames.length > 0) ghostCar = { ...ghostFrames[0] }
      }
    }

    const keys = { ArrowLeft:false, ArrowRight:false }
    function onKeyDown(e) { if (e.code in keys) { keys[e.code]=true; e.preventDefault() }
      if (e.code==='Space') { e.preventDefault(); resetStateRef.current?.() } }
    function onKeyUp(e)   { if (e.code in keys) keys[e.code]=false }
    function resetAllKeys() { keys.ArrowLeft=false; keys.ArrowRight=false }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)
    window.addEventListener('blur',    resetAllKeys)

    // Rennzustand
    let racing   = false
    let lapStart = null
    let prevSeg  = START_SEG
    let lapTime  = 0
    let sectorStart = 0
    let sectorMs    = Array(N_SECTORS).fill(null)

    // ── Zeichen-Hilfsfunktionen ────────────────────────────────────────────────
    function worldToScreen(wx, wy) {
      const dx=(wx-camX)*ZOOM, dy=(wy-camY)*ZOOM
      return [ CAR_SCREEN_X + dx*Math.cos(-car.angle+Math.PI/2) - dy*Math.sin(-car.angle+Math.PI/2),
               CAR_SCREEN_Y + dx*Math.sin(-car.angle+Math.PI/2) + dy*Math.cos(-car.angle+Math.PI/2) ]
    }

    function drawWorld() {
      // Strecke
      ctx.lineWidth = TRACK_WIDTH * ZOOM
      ctx.strokeStyle = '#2a2a4a'
      ctx.beginPath()
      const p0 = worldToScreen(TRK[0][0], TRK[0][1])
      ctx.moveTo(p0[0], p0[1])
      for (let i = 1; i <= N; i++) {
        const p = TRK[i % N]
        const s = worldToScreen(p[0], p[1])
        ctx.lineTo(s[0], s[1])
      }
      ctx.closePath(); ctx.stroke()

      // Mittellinie
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.setLineDash([8,16])
      ctx.beginPath()
      const m0 = worldToScreen(TRK[0][0], TRK[0][1])
      ctx.moveTo(m0[0], m0[1])
      for (let i = 1; i <= N; i++) {
        const p = TRK[i % N]; const s = worldToScreen(p[0], p[1]); ctx.lineTo(s[0], s[1])
      }
      ctx.closePath(); ctx.stroke()
      ctx.setLineDash([])

      // Sektor-Farblinien
      const sectorColors = ['rgba(100,200,255,0.5)','rgba(200,100,255,0.5)','rgba(255,200,60,0.5)']
      for (let s = 0; s < N_SECTORS; s++) {
        const segIdx = Math.floor((s / N_SECTORS) * N)
        const a = TRK[segIdx], b = TRK[(segIdx + 1) % N]
        const dx = b[0]-a[0], dy = b[1]-a[1], len = Math.sqrt(dx*dx+dy*dy)||1
        const nx = -dy/len * 20, ny = dx/len * 20
        const [sx, sy] = worldToScreen(a[0], a[1])
        ctx.strokeStyle = sectorColors[s % sectorColors.length]; ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(sx - nx*ZOOM, sy - ny*ZOOM); ctx.lineTo(sx + nx*ZOOM, sy + ny*ZOOM)
        ctx.stroke()
      }

      // Start/Ziel
      const sa = TRK[START_SEG], sb = TRK[(START_SEG+1) % N]
      const dx2=sb[0]-sa[0], dy2=sb[1]-sa[1], len2=Math.sqrt(dx2*dx2+dy2*dy2)||1
      const nx2=-dy2/len2*22, ny2=dx2/len2*22
      const [ssx, ssy] = worldToScreen(sa[0], sa[1])
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(ssx - nx2*ZOOM, ssy - ny2*ZOOM); ctx.lineTo(ssx + nx2*ZOOM, ssy + ny2*ZOOM); ctx.stroke()
    }

    function drawCar() {
      const [cx, cy] = [CAR_SCREEN_X, CAR_SCREEN_Y]
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(0)
      ctx.fillStyle = '#f59e0b'; ctx.beginPath()
      ctx.roundRect(-5, -10, 10, 20, 3); ctx.fill()
      ctx.fillStyle = '#1e293b'; ctx.beginPath()
      ctx.rect(-4, -8, 8, 5); ctx.fill()
      ctx.restore()
    }

    function drawGhost() {
      if (!ghostCar || !ghostFrames.length) return
      const [gx, gy] = worldToScreen(ghostCar.x, ghostCar.y)
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(ghostCar.angle - car.angle + Math.PI/2)
      ctx.globalAlpha = 0.45
      ctx.fillStyle = '#64b5f6'; ctx.beginPath()
      ctx.roundRect(-5, -10, 10, 20, 3); ctx.fill()
      ctx.restore()
    }

    function drawBufferWarning() {
      const { dist } = nearestPoint(car.x, car.y)
      if (dist > INNER_LIMIT) {
        const ratio = Math.min((dist - INNER_LIMIT) / BUFFER, 1)
        ctx.fillStyle = `rgba(239,68,68,${ratio * 0.18})`
        ctx.fillRect(0, 0, GAME_W, GAME_H)
      }
    }

    function drawMinimap() {
      const xs = TRK.map(p=>p[0]), ys = TRK.map(p=>p[1])
      const mnx=Math.min(...xs), mxx=Math.max(...xs), mny=Math.min(...ys), mxy=Math.max(...ys)
      const mw=90, mh=65, mx0=GAME_W-mw-8, my0=8
      const sc = Math.min(mw/(mxx-mnx||1), mh/(mxy-mny||1))
      ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(mx0,my0,mw,mh)
      ctx.strokeStyle='#4a5568'; ctx.lineWidth=3
      ctx.beginPath()
      TRK.forEach((p,i) => {
        const sx=mx0+(p[0]-mnx)*sc, sy=my0+(p[1]-mny)*sc
        i===0 ? ctx.moveTo(sx,sy) : ctx.lineTo(sx,sy)
      }); ctx.closePath(); ctx.stroke()
      const [cpx, cpy] = [mx0+(car.x-mnx)*sc, my0+(car.y-mny)*sc]
      ctx.fillStyle='#f59e0b'; ctx.beginPath(); ctx.arc(cpx,cpy,2.5,0,Math.PI*2); ctx.fill()
    }

    // ── Game Loop ──────────────────────────────────────────────────────────────
    function loop(ts) {
      const gr = gameRef.current
      if (!gr) return

      if (gr.racing) {
        const turnLeft  = keys.ArrowLeft  || gr.touches.left
        const turnRight = keys.ArrowRight || gr.touches.right
        const TURN_SPEED = 0.032
        const MAX_SPEED  = 6.5
        const ACCEL      = 0.18
        const FRICTION   = 0.94

        if (turnLeft)  car.angle -= TURN_SPEED * (car.speed / MAX_SPEED + 0.3)
        if (turnRight) car.angle += TURN_SPEED * (car.speed / MAX_SPEED + 0.3)

        car.speed = Math.min(car.speed + ACCEL, MAX_SPEED)
        car.speed *= FRICTION

        const { dist } = nearestPoint(car.x, car.y)
        if (dist > OUTER_LIMIT) car.speed *= 0.6

        car.x += Math.cos(car.angle) * car.speed
        car.y += Math.sin(car.angle) * car.speed

        camX += (car.x - camX) * 0.12
        camY += (car.y - camY) * 0.12

        // Lap timing
        if (!lapStart) { lapStart = ts; sectorStart = ts }
        lapTime = ts - lapStart
        setCurrentLapTime(Math.floor(lapTime))

        // Ghost recording
        currentRecording.push({ x: car.x, y: car.y, angle: car.angle })

        // Ghost playback
        if (showGhostRef.current && ghostFrames.length > 0 && ghostCar) {
          if (ghostIdx < ghostFrames.length - 1) {
            ghostIdx++
            Object.assign(ghostCar, ghostFrames[ghostIdx])
          }
          setGhostDelta(Math.floor(lapTime) - (ghostSectorMs[N_SECTORS-1] ?? Math.floor(lapTime)))
        }

        const { seg } = nearestPoint(car.x, car.y)

        // Sektor-Tracking
        const curSector = getSectorForSeg(seg)
        const prevSector = getSectorForSeg(prevSeg)
        if (curSector !== prevSector && curSector > prevSector) {
          const elapsed = ts - sectorStart
          setSectorTimes(prev => { const next=[...prev]; next[prevSector]=Math.floor(elapsed); return next })
          sectorMs[prevSector] = Math.floor(elapsed)
          sectorStart = ts
        }

        // Ziellinie
        const atStart  = seg >= START_SEG - 2 && seg <= START_SEG + 2
        const wasStart = prevSeg >= START_SEG - 2 && prevSeg <= START_SEG + 2
        const crossed  = atStart && !wasStart && lapTime > 5000

        if (crossed) {
          const finalTime = Math.floor(lapTime)
          sectorMs[N_SECTORS - 1] = Math.floor(ts - sectorStart)
          setFinishedSectors([...sectorMs])
          setTotalTime(finalTime)
          setBestLap(prev => prev === null || finalTime < prev ? finalTime : prev)
          saveHighscore(finalTime)

          // Ghost speichern wenn besser
          const prevBest = (() => { try { const g=JSON.parse(localStorage.getItem(GHOST_KEY)||'{}'); return g?.frames?.length ?? 0 } catch {return 0} })()
          if (prevBest === 0) saveGhost(currentRecording, sectorMs)
          else {
            try {
              const g = JSON.parse(localStorage.getItem(GHOST_KEY)||'{}')
              const ghostTotal = g?.sectorMs?.reduce((a,b)=>(a??0)+(b??0), 0) ?? Infinity
              if (finalTime < ghostTotal) { saveGhost(currentRecording, sectorMs); setHasGhost(true) }
            } catch {}
          }
          setHasGhost(true)
          setGameState('finished')
          gr.racing = false
        }

        prevSeg = seg
      }

      ctx.fillStyle='#1a1a2e'; ctx.fillRect(0,0,GAME_W,GAME_H)
      drawWorld()
      if (showGhostRef.current) drawGhost()
      drawCar()
      drawBufferWarning()
      drawMinimap()
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
      window.removeEventListener('blur',    resetAllKeys)
    }
  }, [track])  // Neu initialisieren wenn Track wechselt

  useEffect(() => { if (gameRef.current) gameRef.current.racing = gameState === 'racing' }, [gameState])
  useEffect(() => { showGhostRef.current = showGhost },         [showGhost])
  useEffect(() => { selectedEntryRef.current = selectedEntry }, [selectedEntry])
  useEffect(() => { trainModeRef.current = trainMode },         [trainMode])

  function touchStart(action) { if (gameRef.current) gameRef.current.touches[action] = true }
  function touchEnd(action)   { if (gameRef.current) gameRef.current.touches[action] = false }

  const deltaColor = ghostDelta === null ? '#fff' : ghostDelta < 0 ? '#4ade80' : '#f87171'
  const deltaText  = ghostDelta === null ? '' : (ghostDelta < 0 ? '-' : '+') + formatTime(Math.abs(ghostDelta))

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="arcade-root monaco-root">
      <div className="arcade-game-wrap">
        <canvas ref={canvasRef} width={GAME_W} height={GAME_H} className="arcade-canvas" />

        {gameState === 'countdown' && (
          <div className="arcade-overlay">
            <div className="arcade-countdown">{countdown > 0 ? countdown : 'GO!'}</div>
          </div>
        )}

        {gameState === 'finished' && (
          <div className="arcade-overlay">
            <div className="arcade-finish-card monaco-finish-card">
              <div className="arcade-finish-title">🏁 Ziel!</div>
              <div className="arcade-finish-row">
                <span>Rundenzeit</span>
                <span style={{ color: '#4ade80' }}>{formatTime(totalTime)}</span>
              </div>
              {bestLap && (
                <div className="arcade-finish-row">
                  <span>Bestzeit</span>
                  <span style={{ color: '#4ade80' }}>{formatTime(bestLap)}</span>
                </div>
              )}

              <div className="monaco-sector-breakdown">
                {Array.from({ length: N_SECTORS }, (_, i) => (
                  <div key={i} className="monaco-sector-item">
                    <span className="monaco-sector-label">S{i + 1}</span>
                    <span className="monaco-sector-value">
                      {finishedSectors[i] != null ? formatTime(finishedSectors[i]) : '--'}
                    </span>
                  </div>
                ))}
              </div>

              {saving    && <div className="arcade-finish-saved" style={{ color: '#94a3b8' }}>⏳ Speichern…</div>}
              {!saving && saved    && <div className="arcade-finish-saved">✅ Neuer Rekord gespeichert!</div>}
              {!saving && saveError && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.3rem' }}>
                  <div className="arcade-finish-saved" style={{ color: '#f87171' }}>❌ Speichern fehlgeschlagen</div>
                  <button className="btn" style={{ fontSize:'0.75rem', padding:'0.25rem 0.75rem' }} onClick={retrySave}>🔄 Nochmal</button>
                </div>
              )}
              <button className="btn btn-primary" onClick={startGame} style={{ marginTop: '0.75rem' }}>Nochmal</button>
            </div>
          </div>
        )}

        {gameState === 'idle' && (
          <div className="arcade-overlay">
            <div className="arcade-start-card monaco-start-card">
              <div className="arcade-start-title">🎓 {track.name} Training</div>
              {hasGhost  && <p className="monaco-ghost-hint">👻 Ghost geladen – schlag deine Bestzeit!</p>}
              {!hasGhost && <p className="monaco-ghost-hint">Erste Runde wird als Ghost gespeichert.</p>}
              <div className="arcade-controls-hint">← → Lenken &nbsp;·&nbsp; Leertaste / ↺ Reset</div>

              {/* ── Track-Auswahl (nur sichtbar wenn kein track-Prop) ── */}
              {!trackProp && ALL_TRACKS.length > 1 && (
                <div style={{ width: '100%', marginTop: '0.5rem' }}>
                  <div style={{ fontSize:'0.65rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'0.3rem' }}>Strecke</div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: ALL_TRACKS.length <= 4 ? `repeat(${ALL_TRACKS.length}, 1fr)` : 'repeat(3, 1fr)',
                    gap: '0.25rem',
                    maxHeight: '6rem',
                    overflowY: 'auto',
                  }}>
                    {ALL_TRACKS.map(t => (
                      <button key={t.id} className="btn"
                        style={{
                          fontSize: '0.7rem', padding: '0.3rem 0.3rem', textAlign: 'center',
                          background: selectedTrackId === t.id ? 'rgba(232,196,64,0.2)' : 'transparent',
                          border:     selectedTrackId === t.id ? '1px solid rgba(232,196,64,0.6)' : '1px solid var(--border)',
                          color:      selectedTrackId === t.id ? '#e8c440' : 'var(--text-secondary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                        onClick={() => {
                          if (selectedTrackId !== t.id) {
                            setSelectedTrackId(t.id)
                            setBestLap(null)
                            setHasGhost(false)
                            try { if (localStorage.getItem(`arcadeRace_ghost_${t.id}`)) setHasGhost(true) } catch {}
                          }
                        }}
                      >{t.emoji ?? '🏎️'} {t.name}</button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ width: '100%', marginTop: '0.5rem' }}>
                <div style={{ fontSize:'0.65rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'0.3rem' }}>Modus</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.25rem' }}>
                  {[['qualifying','🏆 Qualifying'],['section','🔧 Abschnitt']].map(([mode, label]) => (
                    <button key={mode} className="btn"
                      style={{
                        fontSize:'0.75rem', padding:'0.3rem 0.4rem',
                        background: trainMode === mode ? 'rgba(100,181,246,0.25)' : 'transparent',
                        border:     trainMode === mode ? '1px solid rgba(100,181,246,0.7)' : '1px solid var(--border)',
                        color:      trainMode === mode ? '#64b5f6' : 'var(--text-secondary)',
                      }}
                      onClick={() => { setTrainMode(mode); if (mode === 'qualifying') setSelectedEntry(0) }}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {trainMode === 'qualifying' && ENTRY_POINTS.length > 0 && (
                <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', margin:'0.35rem 0 0' }}>
                  Start/Ziel bei Punkt {ENTRY_POINTS[0]?.emoji} · vollständige Runde
                </p>
              )}

              {trainMode === 'section' && ENTRY_POINTS.length > 0 && (
                <div style={{ width: '100%', marginTop: '0.4rem' }}>
                  <div style={{ fontSize:'0.65rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'0.3rem' }}>Einstiegspunkt</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.25rem' }}>
                    {ENTRY_POINTS.map((ep, i) => (
                      <button key={i} className="btn"
                        style={{
                          fontSize:'0.7rem', padding:'0.25rem 0.4rem', textAlign:'left',
                          background: selectedEntry === i ? 'rgba(232,196,64,0.2)' : 'transparent',
                          border:     selectedEntry === i ? '1px solid rgba(232,196,64,0.6)' : '1px solid var(--border)',
                          color:      selectedEntry === i ? '#e8c440' : 'var(--text-secondary)',
                        }}
                        onClick={() => setSelectedEntry(i)}
                      >{ep.emoji} {ep.label}</button>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn-primary" onClick={startGame} style={{ marginTop: '0.5rem' }}>START</button>
            </div>
          </div>
        )}
      </div>

      {(gameState === 'racing' || gameState === 'finished') && (
        <div className="arcade-hud-bar monaco-hud-bar">
          <div className="arcade-hud-bar-time">
            <span className="arcade-hud-bar-label">Zeit</span>
            <span className="arcade-hud-bar-value">{currentLapTime !== null ? formatTime(currentLapTime) : '--:--.---'}</span>
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
              <span className="arcade-hud-bar-value" style={{ color: deltaColor, fontSize: '1rem' }}>{deltaText}</span>
            </div>
          )}
          {hasGhost && (
            <button className="arcade-btn"
              style={{ fontSize:'0.7rem', padding:'0.2rem 0.5rem', opacity: showGhost ? 1 : 0.45, touchAction:'none' }}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setShowGhost(v => !v) }}
            >{showGhost ? '👻 AN' : '👻 AUS'}</button>
          )}
        </div>
      )}

      <div className="arcade-touch-controls">
        <div className="arcade-touch-left">
          <button className="arcade-btn arcade-btn--turn" style={{ touchAction:'none' }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); touchStart('left') }}
            onPointerUp={() => touchEnd('left')} onPointerCancel={() => touchEnd('left')}>◀</button>
        </div>
        <button className="arcade-btn arcade-btn--reset" style={{ touchAction:'none' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); resetGame() }}>↺</button>
        <div className="arcade-touch-right">
          <button className="arcade-btn arcade-btn--turn" style={{ touchAction:'none' }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); touchStart('right') }}
            onPointerUp={() => touchEnd('right')} onPointerCancel={() => touchEnd('right')}>▶</button>
        </div>
      </div>

      <div className="arcade-leaderboard card">
        <div className="arcade-lb-title">🏆 Bestzeiten {track.name}</div>
        {leaderboard.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>Noch keine Zeiten. Sei der Erste!</p>
        ) : leaderboard.map((entry, i) => (
          <div key={i} className={`arcade-lb-row ${i === 0 ? 'arcade-lb-row--gold' : ''}`}>
            <span className="arcade-lb-rank">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</span>
            <span className="arcade-lb-name">{entry.profiles?.display_name ?? '–'}</span>
            <span className="arcade-lb-time">{formatTime(entry.lap_time_ms)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
