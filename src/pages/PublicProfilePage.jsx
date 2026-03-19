import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './PublicProfilePage.css'

export default function PublicProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [topDrivers, setTopDrivers] = useState([])
  const [topTeams, setTopTeams] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Profil laden
      const { data: p } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .eq('id', id)
        .single()
      if (!p) { setLoading(false); return }
      setProfile(p)

      // Picks laden für Lieblingsfahrer
      const { data: picks } = await supabase
        .from('picks')
        .select('pick_type, driver_id, constructor_id, drivers(first_name, last_name, constructors(color, short_name)), constructors(id, name, color)')
        .eq('profile_id', id)

      if (picks) {
        const driverCount = {}, driverMeta = {}
        for (const pick of picks.filter(p => p.pick_type === 'driver')) {
          driverCount[pick.driver_id] = (driverCount[pick.driver_id] ?? 0) + 1
          driverMeta[pick.driver_id] = pick.drivers
        }
        setTopDrivers(
          Object.entries(driverCount)
            .sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([id, count]) => ({ ...driverMeta[id], id, count }))
        )

        const teamCount = {}, teamMeta = {}
        for (const pick of picks.filter(p => p.pick_type === 'constructor')) {
          teamCount[pick.constructor_id] = (teamCount[pick.constructor_id] ?? 0) + 1
          teamMeta[pick.constructor_id] = pick.constructors
        }
        setTopTeams(
          Object.entries(teamCount)
            .sort((a, b) => b[1] - a[1]).slice(0, 2)
            .map(([id, count]) => ({ ...teamMeta[id], id, count }))
        )
      }

      // Saisonstatistik laden
      const { data: pts } = await supabase
        .from('player_race_points')
        .select('total_points, weekend_rank')
        .eq('profile_id', id)

      if (pts?.length) {
        const total = pts.reduce((s, r) => s + (r.total_points ?? 0), 0)
        const wins = pts.filter(r => r.weekend_rank === 1).length
        const races = pts.length
        setStats({ total, wins, races, avg: races ? Math.round(total / races) : 0 })
      }

      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return (
    <div className="pub-loading">
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  if (!profile) return (
    <div className="pub-root">
      <p className="text-muted">Spieler nicht gefunden.</p>
    </div>
  )

  const initials = (profile.display_name ?? profile.username ?? '?')[0].toUpperCase()

  return (
    <div className="pub-root">
      <button className="pub-back btn btn-secondary" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Zurück
      </button>

      {/* Header */}
      <div className="pub-header card">
        <div className="pub-avatar">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt={profile.display_name} />
            : <span>{initials}</span>}
        </div>
        <div className="pub-header-info">
          <h1 className="pub-name">{profile.display_name ?? profile.username}</h1>
          {stats && (
            <div className="pub-stats">
              <div className="pub-stat">
                <span className="pub-stat-val">{stats.total}</span>
                <span className="pub-stat-label">Punkte</span>
              </div>
              <div className="pub-stat-divider" />
              <div className="pub-stat">
                <span className="pub-stat-val">{stats.wins}</span>
                <span className="pub-stat-label">Siege</span>
              </div>
              <div className="pub-stat-divider" />
              <div className="pub-stat">
                <span className="pub-stat-val">{stats.races}</span>
                <span className="pub-stat-label">Rennen</span>
              </div>
              <div className="pub-stat-divider" />
              <div className="pub-stat">
                <span className="pub-stat-val">Ø {stats.avg}</span>
                <span className="pub-stat-label">Ø Punkte</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lieblingspicks */}
      <div className="pub-section card">
        <h2 className="pub-section-title">Lieblingsfahrer</h2>
        {topDrivers.length === 0
          ? <p className="text-muted" style={{ fontSize: '0.82rem' }}>Noch keine Picks.</p>
          : topDrivers.map((d, i) => (
            <div key={d.id} className="pub-fav-item">
              <span className="pub-fav-rank">#{i + 1}</span>
              <div className="pub-fav-dot" style={{ background: d.constructors?.color ?? '#888' }} />
              <div className="pub-fav-info">
                <span className="pub-fav-name">{d.first_name} {d.last_name}</span>
                <span className="pub-fav-team" style={{ color: d.constructors?.color }}>{d.constructors?.short_name}</span>
              </div>
              <span className="pub-fav-count">{d.count}×</span>
            </div>
          ))
        }
      </div>

      <div className="pub-section card">
        <h2 className="pub-section-title">Lieblingsteams</h2>
        {topTeams.length === 0
          ? <p className="text-muted" style={{ fontSize: '0.82rem' }}>Noch keine Picks.</p>
          : topTeams.map((t, i) => (
            <div key={t.id} className="pub-fav-item">
              <span className="pub-fav-rank">#{i + 1}</span>
              <div className="pub-fav-dot" style={{ background: t.color ?? '#888' }} />
              <div className="pub-fav-info">
                <span className="pub-fav-name">{t.name}</span>
              </div>
              <span className="pub-fav-count">{t.count}×</span>
            </div>
          ))
        }
      </div>
    </div>
  )
}
