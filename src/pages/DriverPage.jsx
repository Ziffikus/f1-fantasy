import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Flag, Calendar, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DRIVER_BIO, getAge } from '../lib/driverBio'
import { useF1Standings } from '../hooks/useF1Standings'
import './DriverPage.css'

export default function DriverPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [driver, setDriver] = useState(null)
  const [fantasyStats, setFantasyStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const { getStanding, loading: standingsLoading } = useF1Standings()

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('drivers')
        .select('*, constructors(id, name, short_name, color, car_url, logo_url)')
        .eq('id', id)
        .single()
      if (!data) { setLoading(false); return }
      setDriver(data)

      // Fantasy Statistiken
      const { data: results } = await supabase
        .from('race_results')
        .select('position, session_type')
        .eq('driver_id', data.id)
        .eq('session_type', 'race')

      const { count: pickCount } = await supabase
        .from('picks')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', data.id)

      if (results) {
        const positions = results.map(r => r.position).filter(Boolean)
        setFantasyStats({
          wins: positions.filter(p => p === 1).length,
          podiums: positions.filter(p => p <= 3).length,
          avgPos: positions.length ? Math.round(positions.reduce((a, b) => a + b, 0) / positions.length) : '–',
          pickCount: pickCount ?? 0,
        })
      }
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  if (!driver) return (
    <div className="driver-page-root">
      <p className="text-muted">Fahrer nicht gefunden.</p>
    </div>
  )

  const bio = DRIVER_BIO[driver.abbreviation] ?? {}
  const wm = getStanding(driver.abbreviation)
  const color = driver.constructors?.color ?? '#888'
  const initials = `${driver.first_name[0]}${driver.last_name[0]}`

  return (
    <div className="driver-page-root">
      <button className="driver-page-back btn btn-secondary" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Zurück
      </button>

      {/* Header */}
      <div className="driver-page-header card" style={{ borderTop: `3px solid ${color}` }}>
        <div className="driver-page-avatar" style={{ background: `${color}22`, border: `2px solid ${color}` }}>
          <span style={{ color }}>{initials}</span>
          {driver.photo_url && (
            <img src={driver.photo_url} alt={driver.last_name} onError={e => e.target.style.display='none'} />
          )}
        </div>
        <div className="driver-page-title">
          <div className="driver-page-number" style={{ color }}>#{driver.number}</div>
          <h1>{driver.first_name} <strong>{driver.last_name}</strong></h1>
          <div className="driver-page-team" style={{ color }}>
            {driver.constructors?.logo_url && (
              <img src={driver.constructors.logo_url} alt={driver.constructors.name} className="driver-page-team-logo" onError={e => e.target.style.display='none'} />
            )}
            {driver.constructors?.name}
          </div>
        </div>
      </div>

      {/* Auto */}
      {driver.constructors?.car_url && (
        <div className="driver-page-car card">
          <img src={driver.constructors.car_url} alt={driver.constructors.name} onError={e => e.target.parentElement.style.display='none'} />
        </div>
      )}

      {/* Biografie */}
      {(bio.nationality || bio.born || bio.championships || bio.hometown) && (
        <div className="driver-page-section card">
          <h2 className="driver-page-section-title">Biografie</h2>
          <div className="driver-page-bio-grid">
            {bio.nationality && (
              <div className="driver-page-bio-item">
                <Flag size={14} />
                <span>{bio.nationality}</span>
              </div>
            )}
            {bio.born && (
              <div className="driver-page-bio-item">
                <Calendar size={14} />
                <span>{getAge(bio.born)} Jahre · {new Date(bio.born).toLocaleDateString('de-AT', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              </div>
            )}
            {bio.championships > 0 && (
              <div className="driver-page-bio-item driver-page-bio-item--champion">
                <Star size={14} />
                <span>{bio.championships}× Weltmeister</span>
              </div>
            )}
            {bio.hometown && (
              <div className="driver-page-bio-item">
                <span>📍</span>
                <span>{bio.hometown}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WM-Stand */}
      <div className="driver-page-section card">
        <h2 className="driver-page-section-title">WM-Stand 2026</h2>
        {standingsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
            <div className="spinner" style={{ width: 20, height: 20 }} />
          </div>
        ) : wm ? (
          <div className="driver-page-stats-grid">
            <div className="driver-page-stat">
              <span className="driver-page-stat-val" style={{ color }}>P{wm.position}</span>
              <span className="driver-page-stat-label">Position</span>
            </div>
            <div className="driver-page-stat">
              <span className="driver-page-stat-val">{wm.points}</span>
              <span className="driver-page-stat-label">Punkte</span>
            </div>
            <div className="driver-page-stat">
              <span className="driver-page-stat-val">{wm.wins}</span>
              <span className="driver-page-stat-label">Siege</span>
            </div>
          </div>
        ) : (
          <p className="text-muted" style={{ fontSize: '0.82rem' }}>Noch keine Daten.</p>
        )}
      </div>

      {/* Fantasy Stats */}
      <div className="driver-page-section card">
        <h2 className="driver-page-section-title">Fantasy-Statistiken</h2>
        {!fantasyStats ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
            <div className="spinner" style={{ width: 20, height: 20 }} />
          </div>
        ) : (
          <div className="driver-page-stats-grid">
            <div className="driver-page-stat">
              <span className="driver-page-stat-val" style={{ color }}>{fantasyStats.wins}</span>
              <span className="driver-page-stat-label">Siege</span>
            </div>
            <div className="driver-page-stat">
              <span className="driver-page-stat-val">{fantasyStats.podiums}</span>
              <span className="driver-page-stat-label">Podien</span>
            </div>
            <div className="driver-page-stat">
              <span className="driver-page-stat-val">{fantasyStats.avgPos}</span>
              <span className="driver-page-stat-label">Ø Position</span>
            </div>
            <div className="driver-page-stat">
              <span className="driver-page-stat-val">{fantasyStats.pickCount}×</span>
              <span className="driver-page-stat-label">Gepickt</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
