import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import DriverModal from '../components/ui/DriverModal'
import './DriversPage.css'

export default function DriversPage() {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

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

      {Object.entries(byTeam).sort(([a], [b]) => a.localeCompare(b)).map(([teamName, { constructor: c, drivers: tDrivers }]) => (
        <div key={teamName} className="drivers-team-group">
          <div className="drivers-team-header">
            <div className="drivers-team-color" style={{ background: c?.color ?? '#888' }} />
            <span className="drivers-team-name" style={{ color: c?.color }}>{teamName}</span>
          </div>
          <div className="drivers-team-grid">
            {tDrivers.map(d => (
              <button
                key={d.id}
                className="driver-card"
                onClick={() => setSelected(d)}
                style={{ '--team-color': c?.color ?? '#888' }}
              >
                <div className="driver-card-number" style={{ color: c?.color }}>#{d.number}</div>
                <div className="driver-card-avatar" style={{ background: `${c?.color}22`, border: `1.5px solid ${c?.color}` }}>
                  {d.photo_url
                    ? <img src={d.photo_url} alt={d.last_name} />
                    : <span style={{ color: c?.color }}>{d.first_name[0]}{d.last_name[0]}</span>
                  }
                </div>
                <div className="driver-card-info">
                  <span className="driver-card-firstname">{d.first_name}</span>
                  <span className="driver-card-lastname">{d.last_name}</span>
                  <span className="driver-card-abbr">{d.abbreviation}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {selected && <DriverModal driver={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
