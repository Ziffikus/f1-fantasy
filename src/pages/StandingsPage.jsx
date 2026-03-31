import { useState, useEffect, useRef } from 'react'
import { useStandings } from '../hooks/useStandings'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'
import { useLiveStandings } from '../hooks/useLiveStandings'
import { supabase } from '../lib/supabase'
import { Trophy, Medal, Flag, ChevronDown, ChevronUp, Radio } from 'lucide-react'
import './StandingsPage.css'

function useRaceResults() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('player_race_points')
        .select('*, race_weekends(round, name, flag_emoji, city), profiles(display_name, avatar_url)')
        .order('race_weekends(round)', { ascending: true })
      setResults(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  return { results, loading }
}

function fmtPts(val) {
  const n = Number(val)
  return n % 1 === 0 ? n : n.toFixed(1)
}

// ── Palette for chart lines ───────────────────────────────────
const CHART_COLORS = [
  '#FFD700', '#60a5fa', '#f472b6', '#34d399', '#fb923c',
  '#a78bfa', '#22d3ee', '#f87171', '#86efac', '#fbbf24',
]

// ── Position History Chart ────────────────────────────────────
function PositionChart({ completedWeekends, matrix, standings, myId }) {
  const svgRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  if (completedWeekends.length < 2) return null

  const PAD = { top: 20, right: 16, bottom: 48, left: 36 }
  const W = 760
  const H = 220

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const n = standings.length

  // Compute cumulative points per player per round
  const sortedRounds = completedWeekends.slice().sort((a, b) => a.round - b.round)

  // positionData[profileId] = array of { round, position, pts }
  const positionData = {}
  for (const p of standings) {
    positionData[p.profile_id] = []
  }

  for (let ri = 0; ri < sortedRounds.length; ri++) {
    const upToRound = sortedRounds.slice(0, ri + 1)
    // Cumulative points for each player
    const cumulative = standings.map(p => {
      let total = 0
      for (const w of upToRound) {
        const rp = matrix[p.profile_id]?.[w.round]
        if (rp) total += Number(rp.total_points ?? 0)
      }
      return { profile_id: p.profile_id, total }
    })
    // Sort ascending (lower = better), assign positions
    const sorted = [...cumulative].sort((a, b) => a.total - b.total)
    sorted.forEach((entry, idx) => {
      positionData[entry.profile_id].push({
        roundIndex: ri,
        round: sortedRounds[ri].round,
        position: idx + 1,
        pts: entry.total,
      })
    })
  }

  // X scale: rounds equally spaced
  const xScale = ri => PAD.left + (ri / (sortedRounds.length - 1)) * innerW
  // Y scale: position 1 at top, n at bottom
  const yScale = pos => PAD.top + ((pos - 1) / (n - 1)) * innerH

  // Build path for each player
  const buildPath = (profileId) => {
    const pts = positionData[profileId]
    if (!pts?.length) return ''
    return pts.map((d, i) => {
      const x = xScale(d.roundIndex)
      const y = yScale(d.position)
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
    }).join(' ')
  }

  // Smooth catmull-rom path
  const buildSmoothPath = (profileId) => {
    const pts = positionData[profileId]
    if (!pts?.length) return ''
    if (pts.length === 1) {
      const x = xScale(pts[0].roundIndex)
      const y = yScale(pts[0].position)
      return `M ${x} ${y}`
    }
    const coords = pts.map(d => [xScale(d.roundIndex), yScale(d.position)])
    let d = `M ${coords[0][0]} ${coords[0][1]}`
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1]
      const curr = coords[i]
      const cpX = (prev[0] + curr[0]) / 2
      d += ` C ${cpX} ${prev[1]}, ${cpX} ${curr[1]}, ${curr[0]} ${curr[1]}`
    }
    return d
  }

  // Y-axis tick positions
  const yTicks = n <= 8 ? Array.from({ length: n }, (_, i) => i + 1)
    : [1, Math.round(n / 2), n]

  const handleMouseMove = (e) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = W / rect.width
    const mx = (e.clientX - rect.left) * scaleX
    // Find nearest round index
    const ri = Math.round((mx - PAD.left) / innerW * (sortedRounds.length - 1))
    const clamped = Math.max(0, Math.min(sortedRounds.length - 1, ri))
    const w = sortedRounds[clamped]

    const entries = standings.map((p, pi) => {
      const d = positionData[p.profile_id]?.[clamped]
      return { ...p, position: d?.position, pts: d?.pts, color: CHART_COLORS[pi % CHART_COLORS.length] }
    }).filter(e => e.position != null).sort((a, b) => a.position - b.position)

    setTooltip({
      x: xScale(clamped),
      y: 0,
      round: w,
      entries,
    })
  }

  const handleMouseLeave = () => setTooltip(null)

  return (
    <div className="chart-wrap card">
      <div className="chart-header">
        <span className="chart-title">Positionsverlauf</span>
        <span className="chart-subtitle">Saisonverlauf · ↑ wenigste Punkte = besser</span>
      </div>
      <div className="chart-svg-container" style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="chart-svg"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Grid lines */}
          {yTicks.map(pos => (
            <line
              key={pos}
              x1={PAD.left} y1={yScale(pos)}
              x2={W - PAD.right} y2={yScale(pos)}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray={pos === 1 ? '0' : '3,4'}
              opacity={pos === 1 ? 0.6 : 0.35}
            />
          ))}

          {/* Vertical round lines (subtle) */}
          {sortedRounds.map((w, ri) => (
            <line
              key={w.id}
              x1={xScale(ri)} y1={PAD.top}
              x2={xScale(ri)} y2={H - PAD.bottom}
              stroke="var(--border)"
              strokeWidth="1"
              opacity="0.2"
            />
          ))}

          {/* Y-axis labels */}
          {yTicks.map(pos => (
            <text
              key={pos}
              x={PAD.left - 8}
              y={yScale(pos)}
              textAnchor="end"
              dominantBaseline="middle"
              className="chart-axis-label"
            >
              {pos === 1 ? '1.' : pos + '.'}
            </text>
          ))}

          {/* direction hint */}
          <text x={PAD.left - 8} y={PAD.top - 6} textAnchor="end" className="chart-axis-hint">↑ weniger</text>

          {/* X-axis flags */}
          {sortedRounds.map((w, ri) => (
            <text
              key={w.id}
              x={xScale(ri)}
              y={H - PAD.bottom + 14}
              textAnchor="middle"
              className="chart-flag-label"
            >
              {w.flag_emoji}
            </text>
          ))}
          {sortedRounds.map((w, ri) => (
            <text
              key={`city-${w.id}`}
              x={xScale(ri)}
              y={H - PAD.bottom + 28}
              textAnchor="middle"
              className="chart-city-label"
            >
              {w.city?.slice(0, 3).toUpperCase()}
            </text>
          ))}

          {/* Lines (non-me first, me on top) */}
          {standings.map((p, pi) => {
            const isMe = p.profile_id === myId
            if (isMe) return null
            return (
              <path
                key={p.profile_id}
                d={buildSmoothPath(p.profile_id)}
                fill="none"
                stroke={CHART_COLORS[pi % CHART_COLORS.length]}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.45"
              />
            )
          })}
          {/* My line always on top */}
          {standings.map((p, pi) => {
            const isMe = p.profile_id === myId
            if (!isMe) return null
            return (
              <path
                key={p.profile_id}
                d={buildSmoothPath(p.profile_id)}
                fill="none"
                stroke={CHART_COLORS[pi % CHART_COLORS.length]}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="1"
                style={{ filter: `drop-shadow(0 0 4px ${CHART_COLORS[pi % CHART_COLORS.length]}88)` }}
              />
            )
          })}

          {/* Dots at last round */}
          {standings.map((p, pi) => {
            const last = positionData[p.profile_id]?.at(-1)
            if (!last) return null
            const isMe = p.profile_id === myId
            const x = xScale(last.roundIndex)
            const y = yScale(last.position)
            return (
              <circle
                key={p.profile_id}
                cx={x} cy={y}
                r={isMe ? 4.5 : 3}
                fill={CHART_COLORS[pi % CHART_COLORS.length]}
                opacity={isMe ? 1 : 0.65}
              />
            )
          })}

          {/* Tooltip vertical line */}
          {tooltip && (
            <line
              x1={tooltip.x} y1={PAD.top - 4}
              x2={tooltip.x} y2={H - PAD.bottom}
              stroke="var(--text-muted)"
              strokeWidth="1"
              strokeDasharray="3,3"
              opacity="0.5"
            />
          )}

          {/* Tooltip dots on hover */}
          {tooltip && standings.map((p, pi) => {
            const entry = tooltip.entries.find(e => e.profile_id === p.profile_id)
            if (!entry) return null
            return (
              <circle
                key={p.profile_id}
                cx={tooltip.x}
                cy={yScale(entry.position)}
                r="4"
                fill={CHART_COLORS[pi % CHART_COLORS.length]}
                stroke="var(--bg-base, #0f0f11)"
                strokeWidth="1.5"
              />
            )
          })}
        </svg>

        {/* Floating tooltip box */}
        {tooltip && (
          <div
            className="chart-tooltip"
            style={{
              left: tooltip.x > W * 0.6 ? 'auto' : `calc(${(tooltip.x / W) * 100}% + 10px)`,
              right: tooltip.x > W * 0.6 ? `calc(${100 - (tooltip.x / W) * 100}% + 10px)` : 'auto',
              top: '12px',
            }}
          >
            <div className="chart-tooltip-header">
              {tooltip.round.flag_emoji} {tooltip.round.city} · R{tooltip.round.round}
            </div>
            <div className="chart-tooltip-rule">kumulierte Pkt (weniger = besser)</div>
            {tooltip.entries.map((e, i) => (
              <div key={e.profile_id} className="chart-tooltip-row">
                <span className="chart-tooltip-dot" style={{ background: e.color }} />
                <span className="chart-tooltip-pos">{e.position}.</span>
                <span className="chart-tooltip-name">{e.display_name}</span>
                <span className="chart-tooltip-pts">{fmtPts(e.pts)} Pkt</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="chart-legend">
        {standings.map((p, pi) => {
          const isMe = p.profile_id === myId
          return (
            <div key={p.profile_id} className={`chart-legend-item ${isMe ? 'chart-legend-item--me' : ''}`}>
              <span className="chart-legend-dot" style={{ background: CHART_COLORS[pi % CHART_COLORS.length] }} />
              <span className="chart-legend-name">{p.display_name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function StandingsPage() {
  const { standings, loading } = useStandings()
  const { weekends } = useRaceWeekends()
  const { results, loading: resultsLoading } = useRaceResults()
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [gamingChamp, setGamingChamp] = useState(null)

  useEffect(() => {
    supabase
      .from('game_rewards')
      .select('profile_id')
      .gte('valid_until', new Date().toISOString())
      .eq('game', 'arcade_racing')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setGamingChamp(data?.profile_id ?? null))
  }, [])
  const [expanded, setExpanded] = useState(null)

  const { isLive, sessionType, lastUpdate, liveWeekend, getLiveTotal, getLiveRoundPoints } =
    useLiveStandings(weekends, standings)

  const completedWeekends = weekends.filter(w => new Date(w.race_start) < new Date())

  // Matrix: profile_id → round → points
  const matrix = {}
  for (const r of results) {
    if (!matrix[r.profile_id]) matrix[r.profile_id] = {}
    const round = r.race_weekends?.round
    if (round) matrix[r.profile_id][round] = r
  }

  // Live-Wertung: Standings mit Live-Gesamtpunkten, neu sortiert
  const liveStandings = isLive
    ? [...standings]
        .map(p => ({ ...p, live_total: getLiveTotal(p.profile_id, p.total_points) }))
        .sort((a, b) => a.live_total - b.live_total)
    : standings.map(p => ({ ...p, live_total: p.total_points }))

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="standings-page page-enter">
      <h1>Wertung</h1>
      <p className="text-secondary" style={{ marginTop: '0.3rem', marginBottom: isLive ? '0.75rem' : '1.5rem' }}>
        Saison 2026 · {completedWeekends.length} Rennen gewertet · Weniger Punkte = besser
      </p>

      {/* Live-Banner */}
      {isLive && (
        <div className="standings-live-banner">
          <span className="standings-live-dot" />
          <Radio size={13} />
          <span>
            LIVE – {liveWeekend?.name} ({sessionType === 'sprint' ? 'Sprint' : 'Rennen'})
          </span>
          {lastUpdate && (
            <span className="standings-live-time">
              · aktualisiert {lastUpdate.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      )}

      {/* Podium (top 3) */}
      {liveStandings.length >= 3 && (
        <div className="standings-podium">
          {/* 2. Platz */}
          <div className="podium-item podium-2">
            <div className="podium-avatar">
              {liveStandings[1].avatar_url
                ? <img src={liveStandings[1].avatar_url} alt={liveStandings[1].display_name} />
                : <span>{liveStandings[1].display_name?.[0]?.toUpperCase()}</span>}
            </div>
            <div className="podium-name podium-name--link" onClick={() => navigate(`/spieler/${liveStandings[1].profile_id}`)}>{liveStandings[1].display_name}</div>
            <div className="podium-pts">
              {fmtPts(liveStandings[1].live_total)}
              {isLive && <span className="podium-pts-live"> ●</span>}
            </div>
            <div className="podium-block podium-block-2">2</div>
          </div>
          {/* 1. Platz */}
          <div className="podium-item podium-1">
            <div className="podium-crown">👑</div>
            <div className="podium-avatar podium-avatar-1">
              {liveStandings[0].avatar_url
                ? <img src={liveStandings[0].avatar_url} alt={liveStandings[0].display_name} />
                : <span>{liveStandings[0].display_name?.[0]?.toUpperCase()}</span>}
            </div>
            <div className="podium-name podium-name--link" onClick={() => navigate(`/spieler/${liveStandings[0].profile_id}`)}>{liveStandings[0].display_name}</div>
            <div className="podium-pts">
              {fmtPts(liveStandings[0].live_total)}
              {isLive && <span className="podium-pts-live"> ●</span>}
            </div>
            <div className="podium-block podium-block-1">1</div>
          </div>
          {/* 3. Platz */}
          <div className="podium-item podium-3">
            <div className="podium-avatar">
              {liveStandings[2].avatar_url
                ? <img src={liveStandings[2].avatar_url} alt={liveStandings[2].display_name} />
                : <span>{liveStandings[2].display_name?.[0]?.toUpperCase()}</span>}
            </div>
            <div className="podium-name podium-name--link" onClick={() => navigate(`/spieler/${liveStandings[2].profile_id}`)}>{liveStandings[2].display_name}</div>
            <div className="podium-pts">
              {fmtPts(liveStandings[2].live_total)}
              {isLive && <span className="podium-pts-live"> ●</span>}
            </div>
            <div className="podium-block podium-block-3">3</div>
          </div>
        </div>
      )}

      {/* Vollständige Tabelle */}
      <div className="card standings-table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Spieler</th>
              <th title="Gesamtpunkte">Pkt</th>
              {isLive && <th title="Aktuelle Runde" className="standings-live-col">Runde</th>}
              <th title="Siege"><Trophy size={13} /></th>
              <th title="2. Plätze"><Medal size={13} /></th>
              <th title="3. Plätze"><Flag size={13} /></th>
              <th>Rennen</th>
            </tr>
          </thead>
          <tbody>
            {liveStandings.map((player, i) => (
              <>
                <tr
                  key={player.profile_id}
                  className={`standings-row ${player.profile_id === profile?.id ? 'standings-row--me' : ''} ${expanded === player.profile_id ? 'standings-row--expanded' : ''}`}
                  onClick={() => setExpanded(expanded === player.profile_id ? null : player.profile_id)}
                >
                  <td>
                    <span className={`pos-badge ${i < 3 ? `pos-${i+1}` : ''}`}
                      style={i >= 3 ? { background: 'var(--bg-elevated)', color: 'var(--text-muted)', width: '2rem', height: '2rem' } : {}}>
                      {i + 1}
                    </span>
                  </td>
                  <td>
                    <div className="standings-player">
                      <div className="standings-avatar">
                        {player.avatar_url
                          ? <img src={player.avatar_url} alt={player.display_name} />
                          : <span>{player.display_name?.[0]?.toUpperCase()}</span>}
                      </div>
                      <span className="standings-name standings-name--link" onClick={() => navigate(`/spieler/${player.profile_id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        {player.display_name}
                        {gamingChamp === player.profile_id && <span title="Gaming Champion">🎮</span>}
                        {player.profile_id === profile?.id && <span className="dashboard-you"> (du)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="standings-pts-cell">
                    {fmtPts(player.live_total)}
                    {isLive && player.live_total !== player.total_points && (
                      <span className="standings-pts-diff" style={{
                        color: player.live_total < player.total_points ? 'var(--color-success, #4ade80)' : 'var(--color-danger, #f87171)',
                        fontSize: '0.7rem', marginLeft: '0.3rem'
                      }}>
                        {player.live_total < player.total_points ? '▼' : '▲'}
                        {fmtPts(Math.abs(player.live_total - player.total_points))}
                      </span>
                    )}
                  </td>
                  {isLive && (
                    <td className="standings-live-col standings-live-pts">
                      {getLiveRoundPoints(player.profile_id) ?? '…'}
                    </td>
                  )}
                  <td>{player.wins}</td>
                  <td>{player.second_places}</td>
                  <td>{player.third_places}</td>
                  <td>
                    <span className="standings-expand-btn">
                      {expanded === player.profile_id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </td>
                </tr>

                {/* Aufgeklappte Renn-Details */}
                {expanded === player.profile_id && (
                  <tr key={`${player.profile_id}-detail`} className="standings-detail-row">
                    <td colSpan={isLive ? 8 : 7}>
                      <div className="standings-race-grid">
                        {completedWeekends.map(w => {
                          const rp = matrix[player.profile_id]?.[w.round]
                          const isLiveRound = isLive && liveWeekend?.id === w.id
                          const livePts = isLiveRound ? getLiveRoundPoints(player.profile_id) : null
                          return (
                            <div key={w.id} className={`standings-race-cell ${rp?.weekend_rank === 1 ? 'standings-race-win' : ''} ${isLiveRound ? 'standings-race-cell--live' : ''}`}>
                              <span className="standings-race-flag">{w.flag_emoji}</span>
                              <span className="standings-race-city">{w.city}</span>
                              <span className="standings-race-pts">
                                {isLiveRound && livePts !== null
                                  ? <><span className="standings-live-dot" style={{ width: 6, height: 6, display: 'inline-block', borderRadius: '50%', background: '#ef4444', marginRight: 3 }} />{livePts}</>
                                  : rp ? fmtPts(rp.total_points) : '–'
                                }
                              </span>
                              {rp?.weekend_rank === 1 && !isLiveRound && <span className="standings-race-trophy">🏆</span>}
                            </div>
                          )
                        })}
                        {completedWeekends.length === 0 && (
                          <p className="text-muted" style={{ fontSize: '0.8rem', padding: '0.5rem' }}>
                            Noch keine Rennen gewertet.
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Position History Chart */}
      {!resultsLoading && (
        <PositionChart
          completedWeekends={completedWeekends}
          matrix={matrix}
          standings={standings}
          myId={profile?.id}
        />
      )}

      <p className="standings-tiebreaker">
        Tiebreaker: Gleiche Punkte → Mehr Siege → Mehr 2. Plätze → Mehr 3. Plätze
      </p>
    </div>
  )
}
