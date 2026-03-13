import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import DriverModal from '../components/ui/DriverModal'
import { useF1Standings } from '../hooks/useF1Standings'
import './DriversPage.css'

export default function DriversPage() {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const { getStanding, getConstructorStanding, loading: standingsLoading } = useF1Standings()

  useEffect(() => {
    async function load() {
      const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
      if (!season) return
      const { data } = await supabase
        .from('drivers')
        .select('*, constructors(id, name, short_name, color)')
        .eq('season_id', season.id)
        .eq('is_active', true)
        .order('last_name')
      setDrivers(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // Fahrer nach Team gruppieren
  const byTeam = {}
  for (const d of drivers) {
    const team = d.constructors?.name ?? 'Unbekannt'
    if (!byTeam[team]) byTeam[team] = { constructor: d.constructors, drivers: [] }
    byTeam[team].drivers.push(d)
  }

  // Teams nach WM-Position sortieren (wenn Daten da, sonst alphabetisch)
  const sortedTeams = Object.entries(byTeam).sort(([nameA, { constructor: cA }], [nameB, { constructor: cB }]) => {
    const sA = getConstructorStanding(nameA)
    const sB = getConstructorStanding(nameB)
    if (sA && sB) return parseInt(sA.position) - parseInt(sB.position)
    return nameA.localeCompare(nameB)
  })

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="drivers-page page-enter">
      <h1 className="drivers-title">Fahrer 2026</h1>
      <p className="text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.85rem' }}>
        {drivers.length} Fahrer · {Object.keys(byTeam).length} Teams · Klicken für Details
      </p>

      {sortedTeams.map(([teamName, { constructor: c, drivers: tDrivers }]) => {
        const conStanding = getConstructorStanding(teamName)

        return (
          <div key={teamName} className="drivers-team-group">
            <div className="drivers-team-header">
              <div className="drivers-team-color" style={{ background: c?.color ?? '#888' }} />
              <span className="drivers-team-name" style={{ color: c?.color }}>{teamName}</span>

              {/* WM-Infos rechts */}
              {conStanding && (
                <div className="drivers-team-wm">
                  {/* Fahrerpositionen */}
                  <div className="drivers-team-driver-pos">
                    {tDrivers.map(d => {
                      const s = getStanding(d.abbreviation)
                      return s ? (
                        <span key={d.id} className="drivers-team-driver-badge" style={{ color: c?.color }}>
                          <span className="drivers-team-driver-abbr">{d.abbreviation}</span>
                          <span className="drivers-team-driver-rank">P{s.position}</span>
                        </span>
                      ) : null
                    })}
                  </div>
                  {/* Konstrukteurspunkte */}
                  <div className="drivers-team-pts">
                    <span className="drivers-team-pts-pos">P{conStanding.position}</span>
                    <span className="drivers-team-pts-val">{conStanding.points} Pkt</span>
                  </div>
                </div>
              )}

              {standingsLoading && !conStanding && (
                <div style={{ marginLeft: 'auto' }}>
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                </div>
              )}
            </div>

            <div className="drivers-team-grid">
              {tDrivers.map(d => {
                const s = getStanding(d.abbreviation)
                return (
                  <button
                    key={d.id}
                    className="driver-card"
                    onClick={() => setSelected(d)}
                    style={{ '--team-color': c?.color ?? '#888' }}
                  >
                    <div className="driver-card-number" style={{ color: c?.color }}>#{d.number}</div>
                    <div className="driver-card-avatar" style={{ background: `${c?.color}22`, border: `1.5px solid ${c?.color}` }}>
                      {d.photo_url
                        ? <img src={d.photo_url} alt={d.last_name} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
                        : <span style={{ color: c?.color }}>{d.first_name[0]}{d.last_name[0]}</span>
                      }
                    </div>
                    <div className="driver-card-info">
                      <span className="driver-card-firstname">{d.first_name}</span>
                      <span className="driver-card-lastname">{d.last_name}</span>
                      {s
                        ? <span className="driver-card-wm" style={{ color: c?.color }}>P{s.position} · {s.points} Pkt</span>
                        : <span className="driver-card-abbr">{d.abbreviation}</span>
                      }
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {selected && <DriverModal driver={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
