import { useState } from 'react'
import { useStandings } from '../hooks/useStandings'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { useState as useS, useEffect } from 'react'
import { Trophy, Medal, Flag, ChevronDown, ChevronUp } from 'lucide-react'
import './StandingsPage.css'

function useRaceResults() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('player_race_points')
        .select('*, race_weekends(round, name, flag_emoji, city), profiles(display_name, avatar_url)')
        .order('race_weekends(round)', { ascending: true })
      setResults(data ?? [])
      setLoading(false)
    }
    fetch()
  }, [])

  return { results, loading }
}

export default function StandingsPage() {
  const { standings, loading } = useStandings()
  const { weekends } = useRaceWeekends()
  const { results, loading: resultsLoading } = useRaceResults()
  const { profile } = useAuthStore()
  const [expanded, setExpanded] = useState(null)

  const completedWeekends = weekends.filter(w => new Date(w.race_start) < new Date())

  // Baue Matrix: profile_id → round → points
  const matrix = {}
  for (const r of results) {
    if (!matrix[r.profile_id]) matrix[r.profile_id] = {}
    const round = r.race_weekends?.round
    if (round) matrix[r.profile_id][round] = r
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="standings-page page-enter">
      <h1>Wertung</h1>
      <p className="text-secondary" style={{ marginTop: '0.3rem', marginBottom: '1.5rem' }}>
        Saison 2026 · {completedWeekends.length} Rennen gewertet · Weniger Punkte = besser
      </p>

      {/* Podium (top 3) */}
      {standings.length >= 3 && (
        <div className="standings-podium">
          {/* 2. Platz */}
          <div className="podium-item podium-2">
            <div className="podium-avatar">
              {standings[1].avatar_url
                ? <img src={standings[1].avatar_url} alt={standings[1].display_name} />
                : <span>{standings[1].display_name?.[0]?.toUpperCase()}</span>}
            </div>
            <div className="podium-name">{standings[1].display_name}</div>
            <div className="podium-pts">{standings[1].total_points}</div>
            <div className="podium-block podium-block-2">2</div>
          </div>
          {/* 1. Platz */}
          <div className="podium-item podium-1">
            <div className="podium-crown">👑</div>
            <div className="podium-avatar podium-avatar-1">
              {standings[0].avatar_url
                ? <img src={standings[0].avatar_url} alt={standings[0].display_name} />
                : <span>{standings[0].display_name?.[0]?.toUpperCase()}</span>}
            </div>
            <div className="podium-name">{standings[0].display_name}</div>
            <div className="podium-pts">{standings[0].total_points}</div>
            <div className="podium-block podium-block-1">1</div>
          </div>
          {/* 3. Platz */}
          <div className="podium-item podium-3">
            <div className="podium-avatar">
              {standings[2].avatar_url
                ? <img src={standings[2].avatar_url} alt={standings[2].display_name} />
                : <span>{standings[2].display_name?.[0]?.toUpperCase()}</span>}
            </div>
            <div className="podium-name">{standings[2].display_name}</div>
            <div className="podium-pts">{standings[2].total_points}</div>
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
              <th title="Siege"><Trophy size={13} /></th>
              <th title="2. Plätze"><Medal size={13} /></th>
              <th title="3. Plätze"><Flag size={13} /></th>
              <th>Rennen</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((player, i) => (
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
                  <td className="standings-pts-cell">{player.total_points}</td>
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
                    <td colSpan={7}>
                      <div className="standings-race-grid">
                        {completedWeekends.map(w => {
                          const rp = matrix[player.profile_id]?.[w.round]
                          return (
                            <div key={w.id} className={`standings-race-cell ${rp?.weekend_rank === 1 ? 'standings-race-win' : ''}`}>
                              <span className="standings-race-flag">{w.flag_emoji}</span>
                              <span className="standings-race-city">{w.city}</span>
                              <span className="standings-race-pts">
                                {rp ? rp.total_points : '–'}
                              </span>
                              {rp?.weekend_rank === 1 && <span className="standings-race-trophy">🏆</span>}
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

      {/* Tiebreaker Info */}
      <p className="standings-tiebreaker">
        Tiebreaker: Gleiche Punkte → Mehr Siege → Mehr 2. Plätze → Mehr 3. Plätze
      </p>
    </div>
  )
}
