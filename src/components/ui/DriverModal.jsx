import { useEffect, useState } from 'react'
import { X, Star, Flag, Calendar } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DRIVER_BIO, getAge } from '../../lib/driverBio'
import { useF1Standings } from '../../hooks/useF1Standings'
import './DriverModal.css'

export default function DriverModal({ driver, onClose }) {
  const [fantasyStats, setFantasyStats] = useState(null)
  const { getStanding, loading: standingsLoading } = useF1Standings()

  useEffect(() => {
    if (!driver) return
    document.body.style.overflow = 'hidden'
    loadFantasyStats()
    return () => { document.body.style.overflow = '' }
  }, [driver?.id])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function loadFantasyStats() {
    if (!driver?.id) return
    // Alle Ergebnisse für diesen Fahrer laden
    const { data: results } = await supabase
      .from('race_results')
      .select('position, session_type')
      .eq('driver_id', driver.id)
      .eq('session_type', 'race')

    if (!results) return

    const wins = results.filter(r => r.position === 1).length
    const podiums = results.filter(r => r.position <= 3).length
    const races = results.length
    const avgPos = races > 0
      ? (results.reduce((s, r) => s + r.position, 0) / races).toFixed(1)
      : '–'

    // Wie oft gepickt (über alle Picks)
    const { count: pickCount } = await supabase
      .from('picks')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', driver.id)
      .eq('pick_type', 'driver')

    setFantasyStats({ wins, podiums, races, avgPos, pickCount: pickCount ?? 0 })
  }

  if (!driver) return null

  const bio = DRIVER_BIO[driver.abbreviation] ?? {}
  const wm = getStanding(driver.abbreviation)
  const color = driver.constructors?.color ?? '#888'
  const initials = `${driver.first_name[0]}${driver.last_name[0]}`

  return (
    <div className="driver-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="driver-modal">
        {/* Header */}
        <div className="driver-modal-header" style={{ borderColor: color }}>
          <div className="driver-modal-avatar" style={{ background: `${color}22`, border: `2px solid ${color}` }}>
            <span style={{ color }}>{initials}</span>
            {/* Foto-Platzhalter – später mit echtem Foto ersetzen */}
            {driver.photo_url && <img src={driver.photo_url} alt={driver.last_name} className="driver-modal-photo" onError={e => { e.target.style.display="none" }} />}
          </div>
          <div className="driver-modal-title">
            <div className="driver-modal-number" style={{ color }}>#{driver.number}</div>
            <h2>{driver.first_name} <strong>{driver.last_name}</strong></h2>
            <div className="driver-modal-team" style={{ color }}>{driver.constructors?.name}</div>
          </div>
          <button className="driver-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="driver-modal-body">
          {/* Biografie */}
          <div className="driver-modal-section">
            <div className="driver-modal-section-title">Biografie</div>
            <div className="driver-modal-bio-grid">
              {bio.nationality && (
                <div className="driver-bio-item">
                  <Flag size={13} />
                  <span>{bio.nationality}</span>
                </div>
              )}
              {bio.born && (
                <div className="driver-bio-item">
                  <Calendar size={13} />
                  <span>{getAge(bio.born)} Jahre · {new Date(bio.born).toLocaleDateString('de-AT', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                </div>
              )}
              {bio.championships > 0 && (
                <div className="driver-bio-item driver-bio-item--champion">
                  <Star size={13} />
                  <span>{bio.championships}× Weltmeister</span>
                </div>
              )}
              {bio.hometown && (
                <div className="driver-bio-item">
                  <span style={{ fontSize: '0.75rem' }}>📍</span>
                  <span>{bio.hometown}</span>
                </div>
              )}
            </div>
          </div>

          {/* WM-Standings 2026 */}
          <div className="driver-modal-section">
            <div className="driver-modal-section-title">WM-Stand 2026</div>
            {standingsLoading ? (
              <div className="driver-modal-loading"><div className="spinner" style={{ width: 20, height: 20 }} /></div>
            ) : wm ? (
              <div className="driver-wm-grid">
                <div className="driver-wm-item">
                  <span className="driver-wm-value" style={{ color }}>P{wm.position}</span>
                  <span className="driver-wm-label">Position</span>
                </div>
                <div className="driver-wm-item">
                  <span className="driver-wm-value">{wm.points}</span>
                  <span className="driver-wm-label">Punkte</span>
                </div>
                <div className="driver-wm-item">
                  <span className="driver-wm-value">{wm.wins}</span>
                  <span className="driver-wm-label">Siege</span>
                </div>
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: '0.82rem' }}>Noch keine Daten verfügbar.</p>
            )}
          </div>

          {/* Fantasy Statistiken */}
          <div className="driver-modal-section">
            <div className="driver-modal-section-title">Fantasy-Statistiken</div>
            {!fantasyStats ? (
              <div className="driver-modal-loading"><div className="spinner" style={{ width: 20, height: 20 }} /></div>
            ) : (
              <div className="driver-wm-grid">
                <div className="driver-wm-item">
                  <span className="driver-wm-value" style={{ color }}>{fantasyStats.wins}</span>
                  <span className="driver-wm-label">Siege</span>
                </div>
                <div className="driver-wm-item">
                  <span className="driver-wm-value">{fantasyStats.podiums}</span>
                  <span className="driver-wm-label">Podien</span>
                </div>
                <div className="driver-wm-item">
                  <span className="driver-wm-value">{fantasyStats.avgPos}</span>
                  <span className="driver-wm-label">Ø Position</span>
                </div>
                <div className="driver-wm-item">
                  <span className="driver-wm-value">{fantasyStats.pickCount}×</span>
                  <span className="driver-wm-label">Gepickt</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
