import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { useStandings } from '../hooks/useStandings'
import Countdown from '../components/race/Countdown'
import { Trophy, Calendar, Shuffle, ChevronRight, Flag } from 'lucide-react'
import './DashboardPage.css'

export default function DashboardPage() {
  const { profile } = useAuthStore()
  const { activeWeekend, weekends, loading: racesLoading } = useRaceWeekends()
  const { standings, loading: standingsLoading } = useStandings()

  const completedRaces = weekends.filter(w => new Date(w.race_start) < new Date()).length
  const totalRaces = weekends.length

  return (
    <div className="dashboard page-enter">
      <div className="dashboard-hero">
        <div>
          <h1 className="dashboard-hello">
            Hey, <span className="text-accent">{profile?.display_name ?? '...'}</span>
          </h1>
          <p className="text-secondary" style={{ marginTop: '0.25rem' }}>
            Saison 2026 · {completedRaces} von {totalRaces} Rennen absolviert
          </p>
        </div>
        <div className="dashboard-progress-bar">
          <div
            className="dashboard-progress-fill"
            style={{ width: totalRaces ? `${(completedRaces / totalRaces) * 100}%` : '0%' }}
          />
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-col-main">
          {racesLoading ? (
            <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <div className="spinner" />
            </div>
          ) : activeWeekend ? (
            <Countdown weekend={activeWeekend} />
          ) : (
            <div className="card"><p className="text-secondary">Saison beendet!</p></div>
          )}

          {!racesLoading && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="dashboard-section-header">
                <Calendar size={16} />
                <span>Nächste Rennen</span>
                <Link to="/kalender" className="dashboard-more-link">
                  Alle <ChevronRight size={14} />
                </Link>
              </div>
              <div className="dashboard-race-list">
                {weekends
                  .filter(w => new Date(w.race_start) > new Date())
                  .slice(0, 4)
                  .map(w => (
                    <Link to={`/rennen/${w.id}`} key={w.id} className="dashboard-race-item">
                      <span className="dashboard-race-flag">{w.flag_emoji}</span>
                      <div className="dashboard-race-info">
                        <span className="dashboard-race-name">{w.city}</span>
                        <span className="dashboard-race-date">
                          {new Date(w.race_start).toLocaleDateString('de-AT', {
                            day: '2-digit', month: 'short'
                          })}
                        </span>
                      </div>
                      <div className="dashboard-race-meta">
                        {w.is_sprint_weekend && <span className="badge badge-sprint">S</span>}
                        <span className="dashboard-race-round">R{w.round}</span>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="dashboard-col-side">
          <div className="card">
            <div className="dashboard-section-header">
              <Trophy size={16} />
              <span>Gesamtwertung</span>
              <Link to="/wertung" className="dashboard-more-link">
                Details <ChevronRight size={14} />
              </Link>
            </div>
            {standingsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                <div className="spinner" />
              </div>
            ) : standings.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Noch keine Rennen gewertet.
              </p>
            ) : (
              <div className="dashboard-standings">
                {standings.map((player, i) => (
                  <div key={player.profile_id}
                    className={`dashboard-standing-row ${player.profile_id === profile?.id ? 'dashboard-standing-row--me' : ''}`}>
                    <span className={`pos-badge ${i < 3 ? `pos-${i + 1}` : ''}`}
                      style={i >= 3 ? { background: 'var(--bg-elevated)', color: 'var(--text-muted)' } : {}}>
                      {i + 1}
                    </span>
                    <div className="dashboard-standing-avatar">
                      {player.avatar_url
                        ? <img src={player.avatar_url} alt={player.display_name} />
                        : <span>{player.display_name?.[0]?.toUpperCase()}</span>}
                    </div>
                    <span className="dashboard-standing-name">
                      {player.display_name}
                      {player.profile_id === profile?.id && <span className="dashboard-you"> (du)</span>}
                    </span>
                    <span className="dashboard-standing-pts">
                      {player.total_points} <span className="text-muted" style={{ fontSize: '0.7rem' }}>Pkt</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dashboard-quick-links">
            <Link to="/draft" className="dashboard-quick-link"><Shuffle size={20} /><span>Draft</span></Link>
            <Link to="/kalender" className="dashboard-quick-link"><Calendar size={20} /><span>Kalender</span></Link>
            <Link to="/wertung" className="dashboard-quick-link"><Trophy size={20} /><span>Wertung</span></Link>
            <Link to="/profil" className="dashboard-quick-link"><Flag size={20} /><span>Profil</span></Link>
          </div>
        </div>
      </div>
    </div>
  )
}
