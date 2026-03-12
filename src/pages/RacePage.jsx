import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { ArrowLeft, Trophy, Zap, Flag, Clock } from 'lucide-react'
import './RacePage.css'

function formatDate(dateStr) {
  if (!dateStr) return '–'
  return new Date(dateStr).toLocaleString('de-AT', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })
}

function SessionRow({ label, dateStr }) {
  if (!dateStr) return null
  const now = new Date()
  const sessionDate = new Date(dateStr)
  const isPast = sessionDate < now
  return (
    <div className={`race-session-row ${isPast ? 'race-session-row--past' : ''}`}>
      <span className="race-session-label">{label}</span>
      <span className="race-session-time">{formatDate(dateStr)}</span>
      {isPast && <span className="race-session-done">✓</span>}
    </div>
  )
}

function PositionBadge({ pos }) {
  if (!pos) return <span className="race-pos-unknown">–</span>
  return (
    <span className={`race-pos ${pos === 1 ? 'race-pos--1' : pos === 2 ? 'race-pos--2' : pos === 3 ? 'race-pos--3' : ''}`}>
      P{pos}
    </span>
  )
}

export default function RacePage() {
  const { id } = useParams()
  const { profile } = useAuthStore()
  const [weekend, setWeekend] = useState(null)
  const [picks, setPicks] = useState([])
  const [results, setResults] = useState([])
  const [profiles, setProfiles] = useState([])
  const [draftOrder, setDraftOrder] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('picks')

  useEffect(() => {
    loadAll()
  }, [id])

  async function loadAll() {
    setLoading(true)
    const [
      { data: rw },
      { data: p },
      { data: res },
      { data: prof },
      { data: dOrder },
    ] = await Promise.all([
      supabase.from('race_weekends').select('*').eq('id', id).single(),
      supabase.from('picks').select('*, drivers(id, first_name, last_name, number, abbreviation, constructor_id, constructors(short_name, color)), constructors(id, name, short_name, color)').eq('race_weekend_id', id),
      supabase.from('race_results').select('*').eq('race_weekend_id', id),
      supabase.from('profiles').select('*'),
      supabase.from('draft_orders').select('*, profiles(display_name)').eq('race_weekend_id', id).order('pick_order'),
    ])

    setWeekend(rw)
    setPicks(p ?? [])
    setResults(res ?? [])
    setProfiles(prof ?? [])
    setDraftOrder(dOrder ?? [])
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  )

  if (!weekend) return <div className="card">Rennen nicht gefunden.</div>

  const isPast = new Date(weekend.race_start) < new Date()
  const raceResultMap = {}
  const sprintResultMap = {}
  for (const r of results) {
    if (r.session_type === 'race') raceResultMap[r.driver_id] = r.position
    if (r.session_type === 'sprint') sprintResultMap[r.driver_id] = r.position
  }

  // Punkte pro Spieler berechnen für Anzeige
  function calcPlayerPoints(profileId) {
    const playerPicks = picks.filter(p => p.profile_id === profileId)
    if (playerPicks.length === 0) return null

    let racePoints = 0, sprintPoints = 0
    const details = []

    for (const pick of playerPicks) {
      if (pick.pick_type === 'driver') {
        const pos = raceResultMap[pick.driver_id]
        const spos = sprintResultMap[pick.driver_id]
        const rp = pos ?? null
        const sp = spos ? Math.ceil(spos / 2) : null
        racePoints += pos ?? 0
        if (spos) sprintPoints += Math.ceil(spos / 2)
        details.push({ type: 'driver', pick, racePos: pos, sprintPos: spos, racePoints: rp, sprintPoints: sp })
      } else {
        const teamDrivers = [] // wird unten befüllt
        details.push({ type: 'constructor', pick, teamDrivers })
      }
    }

    return { racePoints, sprintPoints, total: racePoints + sprintPoints, details }
  }

  return (
    <div className="race-page page-enter">
      {/* Back */}
      <Link to="/kalender" className="race-back">
        <ArrowLeft size={16} /> Zurück zum Kalender
      </Link>

      {/* Header */}
      <div className="race-hero">
        <div className="race-hero-flag">{weekend.flag_emoji}</div>
        <div className="race-hero-info">
          <div className="race-hero-round">Runde {weekend.round} · 2026</div>
          <h1 className="race-hero-title">{weekend.name}</h1>
          <div className="race-hero-meta">
            <span>{weekend.city}, {weekend.country}</span>
            <span>·</span>
            <span>{weekend.circuit}</span>
            {weekend.is_sprint_weekend && <span className="badge badge-sprint">Sprint</span>}
          </div>
        </div>
        {isPast && (
          <div className="race-hero-status race-hero-status--done">
            <Flag size={14} /> Abgeschlossen
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="race-tabs">
        {[
          { id: 'picks', label: 'Picks & Punkte', icon: Trophy },
          { id: 'sessions', label: 'Sessions', icon: Clock },
        ].map(t => (
          <button
            key={t.id}
            className={`race-tab ${activeTab === t.id ? 'race-tab--active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Picks Tab */}
      {activeTab === 'picks' && (
        <div className="race-picks-grid">
          {(draftOrder.length > 0 ? draftOrder.map(d => profiles.find(p => p.id === d.profile_id)).filter(Boolean) : profiles).map(player => {
            const playerPicks = picks.filter(p => p.profile_id === player.id)
            const driverPicks = playerPicks.filter(p => p.pick_type === 'driver')
            const teamPicks = playerPicks.filter(p => p.pick_type === 'constructor')
            const hasResults = results.length > 0

            // Punkte berechnen
            let totalRace = 0, totalSprint = 0
            for (const pick of driverPicks) {
              totalRace += raceResultMap[pick.driver_id] ?? 0
              if (weekend.is_sprint_weekend) totalSprint += Math.ceil((sprintResultMap[pick.driver_id] ?? 22) / 2)
            }
            for (const pick of teamPicks) {
              // Team: alle Fahrer des Teams
              // (wir haben die driver.constructor_id in den picks)
            }

            return (
              <div
                key={player.id}
                className={`race-player-card ${player.id === profile?.id ? 'race-player-card--me' : ''}`}
              >
                <div className="race-player-header">
                  <div className="race-player-avatar">
                    {player.avatar_url
                      ? <img src={player.avatar_url} alt={player.display_name} />
                      : <span>{player.display_name?.[0]?.toUpperCase()}</span>}
                  </div>
                  <span className="race-player-name">{player.display_name}</span>
                  {hasResults && totalRace > 0 && (
                    <span className="race-player-total">
                      {totalRace + totalSprint} <span className="text-muted" style={{ fontSize: '0.7rem' }}>Pkt</span>
                    </span>
                  )}
                </div>

                {playerPicks.length === 0 ? (
                  <p className="text-muted" style={{ fontSize: '0.8rem', padding: '0.5rem 0' }}>
                    Keine Picks eingetragen.
                  </p>
                ) : (
                  <div className="race-picks-list">
                    {/* Fahrer */}
                    {driverPicks.map(pick => {
                      const pos = raceResultMap[pick.driver_id]
                      const spos = sprintResultMap[pick.driver_id]
                      return (
                        <div key={pick.id} className="race-pick-row">
                          <div className="race-pick-label">F{pick.pick_number}</div>
                          <div
                            className="race-pick-color"
                            style={{ background: pick.drivers?.constructors?.color ?? '#888' }}
                          />
                          <div className="race-pick-info">
                            <span className="race-pick-name">
                              {pick.drivers?.first_name} {pick.drivers?.last_name}
                            </span>
                            <span className="race-pick-team" style={{ color: pick.drivers?.constructors?.color }}>
                              {pick.drivers?.constructors?.short_name} · #{pick.drivers?.number}
                            </span>
                          </div>
                          {hasResults && (
                            <div className="race-pick-results">
                              <PositionBadge pos={pos} />
                              {weekend.is_sprint_weekend && spos && (
                                <span className="race-sprint-pts">
                                  <Zap size={10} /> {Math.ceil(spos / 2)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Teams */}
                    {teamPicks.map(pick => (
                      <div key={pick.id} className="race-pick-row race-pick-row--team">
                        <div className="race-pick-label">T{pick.pick_number}</div>
                        <div
                          className="race-pick-color"
                          style={{ background: pick.constructors?.color ?? '#888' }}
                        />
                        <div className="race-pick-info">
                          <span className="race-pick-name">{pick.constructors?.name}</span>
                          <span className="race-pick-team" style={{ color: pick.constructors?.color }}>
                            Team
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="card race-sessions-card">
          {weekend.is_sprint_weekend ? (
            <>
              <SessionRow label="FP1" dateStr={weekend.fp1_start} />
              <SessionRow label="Sprint Qualifying" dateStr={weekend.sprint_quali_start} />
              <SessionRow label="Sprint ⚡" dateStr={weekend.sprint_start} />
            </>
          ) : (
            <>
              <SessionRow label="FP1" dateStr={weekend.fp1_start} />
              <SessionRow label="FP2" dateStr={weekend.fp2_start} />
              <SessionRow label="FP3" dateStr={weekend.fp3_start} />
            </>
          )}
          <SessionRow label="Qualifying" dateStr={weekend.qualifying_start} />
          <SessionRow label="Rennen 🏁" dateStr={weekend.race_start} />
        </div>
      )}
    </div>
  )
}
