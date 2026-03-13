import { useState, useEffect } from 'react'
import { useStandings } from '../hooks/useStandings'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { useAuthStore } from '../stores/authStore'
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

export default function StandingsPage() {
  const { standings, loading } = useStandings()
  const { weekends } = useRaceWeekends()
  const { results, loading: resultsLoading } = useRaceResults()
  const { profile } = useAuthStore()
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
            <div className="podium-name">{liveStandings[1].display_name}</div>
            <div className="podium-pts">
              {liveStandings[1].live_total}
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
            <div className="podium-name">{liveStandings[0].display_name}</div>
            <div className="podium-pts">
              {liveStandings[0].live_total}
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
            <div className="podium-name">{liveStandings[2].display_name}</div>
            <div className="podium-pts">
              {liveStandings[2].live_total}
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
                      <span className="standings-name">
                        {player.display_name}
                        {player.profile_id === profile?.id && <span className="dashboard-you"> (du)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="standings-pts-cell">
                    {player.live_total}
                    {isLive && player.live_total !== player.total_points && (
                      <span className="standings-pts-diff" style={{
                        color: player.live_total < player.total_points ? 'var(--color-success, #4ade80)' : 'var(--color-danger, #f87171)',
                        fontSize: '0.7rem', marginLeft: '0.3rem'
                      }}>
                        {player.live_total < player.total_points ? '▼' : '▲'}
                        {Math.abs(player.live_total - player.total_points)}
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
                                  : rp ? rp.total_points : '–'
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

      <p className="standings-tiebreaker">
        Tiebreaker: Gleiche Punkte → Mehr Siege → Mehr 2. Plätze → Mehr 3. Plätze
      </p>
    </div>
  )
}
