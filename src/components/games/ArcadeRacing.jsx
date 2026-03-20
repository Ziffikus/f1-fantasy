import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import './ArcadeRacing.css'

// ── Monaco Track Waypoints (normalisiert 0-1) ─────────────────
const TRACK_WAYPOINTS = [
  [0.72, 0.85], [0.62, 0.88], [0.50, 0.88], [0.40, 0.85],
  [0.30, 0.78], [0.22, 0.68], [0.18, 0.58], [0.18, 0.48],
  [0.20, 0.38], [0.25, 0.28], [0.32, 0.20], [0.40, 0.15],
  [0.48, 0.12], [0.55, 0.12], [0.60, 0.15], [0.65, 0.20],
  [0.68, 0.28], [0.72, 0.35], [0.78, 0.38], [0.82, 0.35],
  [0.84, 0.28], [0.82, 0.20], [0.78, 0.15], [0.75, 0.18],
  [0.73, 0.25], [0.75, 0.32], [0.80, 0.42], [0.82, 0.52],
  [0.82, 0.62], [0.80, 0.72], [0.76, 0.80], [0.72, 0.85],
]

const TRACK_WIDTH = 28
const START_WAYPOINT = 0
const LAPS_TOTAL = 3

const TYRE_COLORS = ['#E8002D', '#FF8000', '#27F4D2', '#3671C6', '#229971']

function formatTime(ms) {
  if (!ms) return '--:--.---'
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${mins}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function getTrackPoints(w, h) {
  return TRACK_WAYPOINTS.map(([x, y]) => [x * w, y * h])
}

function getPointOnTrack(points, t) {
  const i = Math.floor(t * (points.length - 1))
  return points[Math.min(i, points.length - 1)]
}

function dist(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
}

function findClosestWaypoint(pos, points) {
  let minD = Infinity, idx = 0
  points.forEach((p, i) => {
    const d = dist(pos, p)
    if (d < minD) { minD = d; idx = i }
  })
  return { idx, d: minD }
}

// Simple AI car
class AICar {
  constructor(color, startOffset, speed) {
    this.color = color
    this.waypointIdx = startOffset % TRACK_WAYPOINTS.length
    this.speed = speed
    this.x = 0; this.y = 0; this.angle = 0
    this.lap = 0
  }

  update(points) {
    const target = points[this.waypointIdx]
    if (!target) return
    const dx = target[0] - this.x
    const dy = target[1] - this.y
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < 15) {
      const next = (this.waypointIdx + 1) % points.length
      if (this.waypointIdx === points.length - 1 && next === 0) this.lap++
      this.waypointIdx = next
    } else {
      this.angle = Math.atan2(dy, dx)
      this.x += Math.cos(this.angle) * this.speed
      this.y += Math.sin(this.angle) * this.speed
    }
  }

  draw(ctx) {
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.angle + Math.PI / 2)
    ctx.fillStyle = this.color
    ctx.beginPath()
    ctx.roundRect(-5, -9, 10, 18, 3)
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(-4, -7, 8, 5)
    ctx.restore()
  }
}

export default function ArcadeRacing({ onClose }) {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const { profile } = useAuthStore()

  const [gameState, setGameState] = useState('idle') // idle | countdown | racing | finished
  const [countdown, setCountdown] = useState(3)
  const [lap, setLap] = useState(0)
  const [currentLapTime, setCurrentLapTime] = useState(0)
  const [bestLap, setBestLap] = useState(null)
  const [lastLap, setLastLap] = useState(null)
  const [totalTime, setTotalTime] = useState(0)
  const [position, setPosition] = useState(1)
  const [finished, setFinished] = useState(false)
  const [saved, setSaved] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])

  // Load leaderboard
  useEffect(() => {
    loadLeaderboard()
  }, [])

  async function loadLeaderboard() {
    const { data } = await supabase
      .from('game_highscores')
      .select('lap_time_ms, profiles(display_name, avatar_url)')
      .eq('game', 'arcade_racing')
      .eq('track', 'monaco')
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
      .eq('track', 'monaco')
      .single()

    if (!existing || lapTimeMs < existing.lap_time_ms) {
      await supabase.from('game_highscores').upsert({
        profile_id: profile.id,
        game: 'arcade_racing',
        track: 'monaco',
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
    setFinished(false)
    setSaved(false)

    let c = 3
    const timer = setInterval(() => {
      c--
      setCountdown(c)
      if (c <= 0) {
        clearInterval(timer)
        setGameState('racing')
      }
    }, 1000)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const W = canvas.width
    const H = canvas.height
    const points = getTrackPoints(W, H)

    // Player car
    const player = {
      x: points[START_WAYPOINT][0],
      y: points[START_WAYPOINT][1],
      angle: 0,
      speed: 0,
      maxSpeed: 4.5,
      accel: 0.15,
      brake: 0.3,
      friction: 0.06,
      turnSpeed: 0.045,
      lap: 0,
      lastWaypointIdx: START_WAYPOINT,
      lapStart: 0,
      lapTimes: [],
    }

    // AI cars
    const aiCars = [
      new AICar('#FF8000', 2, 3.2),
      new AICar('#27F4D2', 5, 3.0),
      new AICar('#3671C6', 8, 3.4),
    ]
    aiCars.forEach((car, i) => {
      car.x = points[(START_WAYPOINT + i + 1) % points.length][0]
      car.y = points[(START_WAYPOINT + i + 1) % points.length][1]
    })

    const keys = {}
    const touches = { left: false, right: false, up: false, brake: false }

    function onKey(e) {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)) {
        e.preventDefault()
        keys[e.key] = e.type === 'keydown'
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    gameRef.current = { touches }

    let animId
    let startTime = null
    let lastLapTimeRef = null
    let bestLapRef = null
    let racing = false
    let finishedRef = false

    function drawTrack() {
      // Background
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, W, H)

      // Track shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'
      ctx.lineWidth = TRACK_WIDTH + 8
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
      ctx.closePath()
      ctx.stroke()

      // Track surface
      ctx.strokeStyle = '#2d2d3a'
      ctx.lineWidth = TRACK_WIDTH
      ctx.beginPath()
      points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
      ctx.closePath()
      ctx.stroke()

      // Track border outer
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
      ctx.closePath()
      ctx.stroke()

      // Kerbs every few waypoints
      points.forEach(([x, y], i) => {
        if (i % 3 === 0) {
          ctx.fillStyle = i % 6 === 0 ? '#E8002D' : '#fff'
          ctx.beginPath()
          ctx.arc(x, y, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      // Start/Finish line
      const sp = points[START_WAYPOINT]
      const sp2 = points[(START_WAYPOINT + 1) % points.length]
      const angle = Math.atan2(sp2[1] - sp[1], sp2[0] - sp[0])
      ctx.save()
      ctx.translate(sp[0], sp[1])
      ctx.rotate(angle + Math.PI / 2)
      for (let i = -2; i <= 2; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#fff' : '#000'
        ctx.fillRect(i * 4, -TRACK_WIDTH / 2, 4, TRACK_WIDTH)
      }
      ctx.restore()
    }

    function drawCar(x, y, angle, color, isPlayer) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle + Math.PI / 2)

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.ellipse(2, 2, 6, 10, 0, 0, Math.PI * 2)
      ctx.fill()

      // Body
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(-5, -10, 10, 20, 3)
      ctx.fill()

      // Cockpit
      ctx.fillStyle = isPlayer ? '#fff' : 'rgba(255,255,255,0.6)'
      ctx.beginPath()
      ctx.roundRect(-3, -7, 6, 7, 2)
      ctx.fill()

      // Front wing
      ctx.fillStyle = color
      ctx.fillRect(-7, -12, 14, 3)

      // Rear wing
      ctx.fillRect(-6, 9, 12, 2)

      // Wheels
      ctx.fillStyle = '#111'
      ;[[-7, -6], [5, -6], [-7, 5], [5, 5]].forEach(([wx, wy]) => {
        ctx.beginPath()
        ctx.roundRect(wx, wy, 3, 5, 1)
        ctx.fill()
      })

      if (isPlayer) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.strokeRect(-5, -10, 10, 20)
      }
      ctx.restore()
    }

    function checkLap(nowMs) {
      const { idx } = findClosestWaypoint([player.x, player.y], points)

      if (player.lastWaypointIdx >= points.length - 3 && idx <= 2) {
        // Crossed finish line
        if (racing && !finishedRef) {
          const lapTime = nowMs - (lastLapTimeRef ?? startTime)
          lastLapTimeRef = nowMs
          player.lapTimes.push(lapTime)

          const newBest = !bestLapRef || lapTime < bestLapRef ? lapTime : bestLapRef
          bestLapRef = newBest

          setLastLap(lapTime)
          setBestLap(newBest)
          player.lap++
          setLap(player.lap)

          if (player.lap >= LAPS_TOTAL) {
            finishedRef = true
            setGameState('finished')
            setFinished(true)
            const total = nowMs - startTime
            setTotalTime(total)
            if (newBest) saveHighscore(newBest)
          }
        }
      }
      player.lastWaypointIdx = idx
    }

    function calcPosition() {
      const allProgress = [
        player.lap * points.length + findClosestWaypoint([player.x, player.y], points).idx,
        ...aiCars.map(ai => ai.lap * points.length + ai.waypointIdx)
      ]
      const myProgress = allProgress[0]
      return allProgress.filter(p => p > myProgress).length + 1
    }

    function loop(ts) {
      if (!startTime) startTime = ts
      const now = ts - startTime

      ctx.clearRect(0, 0, W, H)
      drawTrack()

      if (racing) {
        // Input
        const left  = keys['ArrowLeft']  || keys['a'] || touches.left
        const right = keys['ArrowRight'] || keys['d'] || touches.right
        const up    = keys['ArrowUp']    || keys['w'] || touches.up
        const brake = keys['ArrowDown']  || keys['s'] || touches.brake

        if (up)    player.speed = Math.min(player.speed + player.accel, player.maxSpeed)
        if (brake) player.speed = Math.max(player.speed - player.brake, -1.5)
        player.speed *= (1 - player.friction)

        if (left)  player.angle -= player.turnSpeed * Math.min(Math.abs(player.speed) / 2, 1)
        if (right) player.angle += player.turnSpeed * Math.min(Math.abs(player.speed) / 2, 1)

        player.x += Math.cos(player.angle) * player.speed
        player.y += Math.sin(player.angle) * player.speed

        // Keep in bounds
        player.x = Math.max(10, Math.min(W - 10, player.x))
        player.y = Math.max(10, Math.min(H - 10, player.y))

        checkLap(now)
        setCurrentLapTime(now - (lastLapTimeRef ?? 0))
        setPosition(calcPosition())

        // AI
        aiCars.forEach(ai => ai.update(points))
      }

      // Draw AI
      aiCars.forEach(ai => {
        if (ai.x && ai.y) {
          ai.draw(ctx)
        }
      })

      // Draw player
      drawCar(player.x, player.y, player.angle, '#E8002D', true)

      animId = requestAnimationFrame(loop)
    }

    // Start when gameState becomes 'racing'
    const checkRacing = setInterval(() => {
      if (gameRef.current?.racing) {
        racing = true
        clearInterval(checkRacing)
      }
    }, 100)

    animId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animId)
      clearInterval(checkRacing)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  // Sync racing state to ref
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.racing = gameState === 'racing'
    }
  }, [gameState])

  // Touch controls
  function touchStart(action) {
    if (gameRef.current) gameRef.current.touches[action] = true
  }
  function touchEnd(action) {
    if (gameRef.current) gameRef.current.touches[action] = false
  }

  const posLabel = position === 1 ? 'P1 🥇' : position === 2 ? 'P2 🥈' : position === 3 ? 'P3 🥉' : `P${position}`

  return (
    <div className="arcade-root">
      <div className="arcade-game-wrap">
        {/* Canvas */}
        <canvas ref={canvasRef} width={480} height={360} className="arcade-canvas" />

        {/* HUD */}
        {gameState === 'racing' && (
          <div className="arcade-hud">
            <div className="arcade-hud-left">
              <div className="arcade-hud-lap">Runde {Math.min(lap + 1, LAPS_TOTAL)} / {LAPS_TOTAL}</div>
              <div className="arcade-hud-time">{formatTime(currentLapTime)}</div>
              {bestLap && <div className="arcade-hud-best">Best: {formatTime(bestLap)}</div>}
              {lastLap && <div className="arcade-hud-last">Letzte: {formatTime(lastLap)}</div>}
            </div>
            <div className="arcade-hud-pos">{posLabel}</div>
          </div>
        )}

        {/* Countdown */}
        {gameState === 'countdown' && (
          <div className="arcade-overlay">
            <div className="arcade-countdown">{countdown > 0 ? countdown : 'GO!'}</div>
          </div>
        )}

        {/* Finished */}
        {gameState === 'finished' && (
          <div className="arcade-overlay arcade-overlay--finish">
            <div className="arcade-finish-card">
              <div className="arcade-finish-title">🏁 Ziel!</div>
              <div className="arcade-finish-pos">{posLabel}</div>
              <div className="arcade-finish-row">
                <span>Gesamtzeit</span>
                <span>{formatTime(totalTime)}</span>
              </div>
              <div className="arcade-finish-row">
                <span>Beste Runde</span>
                <span style={{ color: '#4ade80' }}>{formatTime(bestLap)}</span>
              </div>
              {saved && <div className="arcade-finish-saved">✅ Neuer Rekord gespeichert!</div>}
              <button className="btn btn-primary" onClick={startGame} style={{ marginTop: '0.75rem' }}>
                Nochmal
              </button>
            </div>
          </div>
        )}

        {/* Start screen */}
        {gameState === 'idle' && (
          <div className="arcade-overlay">
            <div className="arcade-start-card">
              <div className="arcade-start-title">🏎️ Monaco</div>
              <p className="arcade-start-sub">{LAPS_TOTAL} Runden · 3 KI-Gegner</p>
              <div className="arcade-controls-hint">
                <span>↑↓←→ / WASD</span>
              </div>
              <button className="btn btn-primary" onClick={startGame}>
                START
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Touch Controls */}
      <div className="arcade-touch-controls">
        <div className="arcade-touch-left">
          <button
            className="arcade-btn arcade-btn--turn"
            onTouchStart={() => touchStart('left')}
            onTouchEnd={() => touchEnd('left')}
            onMouseDown={() => touchStart('left')}
            onMouseUp={() => touchEnd('left')}
          >◀</button>
          <button
            className="arcade-btn arcade-btn--turn"
            onTouchStart={() => touchStart('right')}
            onTouchEnd={() => touchEnd('right')}
            onMouseDown={() => touchStart('right')}
            onMouseUp={() => touchEnd('right')}
          >▶</button>
        </div>
        <div className="arcade-touch-right">
          <button
            className="arcade-btn arcade-btn--gas"
            onTouchStart={() => touchStart('up')}
            onTouchEnd={() => touchEnd('up')}
            onMouseDown={() => touchStart('up')}
            onMouseUp={() => touchEnd('up')}
          >GAS</button>
          <button
            className="arcade-btn arcade-btn--brake"
            onTouchStart={() => touchStart('brake')}
            onTouchEnd={() => touchEnd('brake')}
            onMouseDown={() => touchStart('brake')}
            onMouseUp={() => touchEnd('brake')}
          >BREMSE</button>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="arcade-leaderboard card">
        <div className="arcade-lb-title">🏆 Bestzeiten Monaco</div>
        {leaderboard.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>Noch keine Zeiten. Sei der Erste!</p>
        ) : (
          leaderboard.map((entry, i) => (
            <div key={i} className={`arcade-lb-row ${i === 0 ? 'arcade-lb-row--gold' : ''}`}>
              <span className="arcade-lb-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
              <span className="arcade-lb-name">{entry.profiles?.display_name ?? '–'}</span>
              <span className="arcade-lb-time">{formatTime(entry.lap_time_ms)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
