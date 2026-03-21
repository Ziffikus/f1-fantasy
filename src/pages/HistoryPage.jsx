import { useState, useEffect } from 'react'
import { Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './HistoryPage.css'

// Vergangene Saisons – manuell gepflegt
const PAST_SEASONS = [
  {
    year: 2024,
    results: [
      { rank: 1, name: 'Alex',  points: null },
      { rank: 2, name: 'Ferk',  points: null },
      { rank: 3, name: 'Mandi',  points: null },
      { rank: 4, name: 'Andi', points: null },
    ]
  },
  {
    year: 2025,
    results: [
      { rank: 1, name: 'Ferk',  points: null },
      { rank: 2, name: 'Alex',  points: null },
      { rank: 3, name: 'Andi',  points: null },
      { rank: 4, name: 'Mandi', points: null },
    ]
  },
]

const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

function SeasonCard({ year, results, live = false }) {
  return (
    <div className="history-season card">
      <div className="history-season-header">
        <span className="history-year">{year}</span>
        {live && <span className="badge badge-live"><span className="live-dot" /> Laufend</span>}
      </div>
      <div className="history-results">
        {results.map((r, i) => (
          <div key={i} className={`history-result-row ${r.rank === 1 ? 'history-result-row--gold' : ''}`}>
            <span className="history-rank">
              {RANK_MEDAL[r.rank] ?? `#${r.rank}`}
            </span>
            <div className="history-result-avatar">
              {r.avatar_url
                ? <img src={r.avatar_url} alt={r.name} />
                : <span>{r.name?.[0]?.toUpperCase()}</span>}
            </div>
            <span className="history-name">{r.name}</span>
            {r.points !== null && (
              <span className="history-points">{typeof r.points === 'number' && r.points % 1 !== 0 ? r.points.toFixed(1) : r.points} Pkt</span>
            )}
            {r.wins > 0 && (
              <span className="history-wins">{r.wins}× 🏆</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const [liveSeason, setLiveSeason] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: season } = await supabase
        .from('seasons').select('id, year').eq('is_active', true).single()
      if (!season) { setLoading(false); return }

      const { data: standings } = await supabase
        .from('overall_standings')
        .select('profile_id, display_name, avatar_url, total_points, wins, second_places, third_places, races_played')
        .order('total_points', { ascending: true })

      if (standings?.length) {
        setLiveSeason({
          year: season.year,
          results: standings.map((s, i) => ({
            rank: i + 1,
            name: s.display_name,
            avatar_url: s.avatar_url,
            points: Number(s.total_points),
            wins: s.wins,
          }))
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="history-root">
      <h1 className="history-title">Saisonhistorie</h1>
      <p className="history-subtitle">TBE Fantasy Liga · Alle Saisons</p>

      <div className="history-list">
        {/* Aktuelle Saison oben */}
        {loading ? (
          <div className="history-season card" style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <div className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : liveSeason ? (
          <SeasonCard year={liveSeason.year} results={liveSeason.results} live />
        ) : null}

        {/* Vergangene Saisons – neueste zuerst */}
        {[...PAST_SEASONS].reverse().map(s => (
          <SeasonCard key={s.year} year={s.year} results={s.results} />
        ))}
      </div>
    </div>
  )
}
