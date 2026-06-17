import { useState, useEffect } from 'react'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { useSessionResults } from '../hooks/useSessionResults'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import TrackMap from '../components/ui/TrackMap'
import { MapPin, Clock, Trophy, Zap, Flag, ChevronDown, ChevronRight } from 'lucide-react'
import './CalendarPage.css'

// ── AT-TV Sender pro Rennen 2026 (Quelle: ServusTV / ORF) ─────
const SERVUS = { name: 'ServusTV', url: 'https://www.servustv.com/sport/b/fia-formula-one-world-championship/aa-25hkbv8c52111/' }
const ORF_TV = { name: 'ORF',      url: 'https://on.orf.at/sendereihe/7028409/formel-1' }

const TV_BROADCASTER = {
  1:  SERVUS,  // Australien
  2:  ORF_TV,  // China
  3:  ORF_TV,  // Bahrain
  4:  ORF_TV,  // Miami
  5:  ORF_TV,  // Monaco
  6:  ORF_TV,  // Barcelona-Catalunya
  7:  SERVUS,  // Kanada
  8:  SERVUS,  // Österreich
  9:  ORF_TV,  // Großbritannien
  10: ORF_TV,  // Ungarn
  11: SERVUS,  // Belgien
  12: SERVUS,  // Niederlande
  13: SERVUS,  // Italien
  14: ORF_TV,  // Madrid/Spanien
  15: SERVUS,  // Aserbaidschan
  16: ORF_TV,  // Singapur
  17: SERVUS,  // USA (Austin)
  18: ORF_TV,  // Mexiko
  19: SERVUS,  // Brasilien
  20: ORF_TV,  // Las Vegas
  21: SERVUS,  // Katar
  22: SERVUS,  // Japan (Suzuka)
  23: SERVUS,  // Saudi-Arabien
  24: ORF_TV,  // Abu Dhabi
}

function formatDate(dateStr) {
  if (!dateStr) return '–'
  return new Date(dateStr).toLocaleString('de-AT', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })
}

function CalSessionRow({ label, dateStr }) {
  if (!dateStr) return null
  return (
    <div className="cal-session-row">
      <span className="cal-session-label">{label}</span>
      <span className="cal-session-time">{formatDate(dateStr)}</span>
    </div>
  )
}

// ── Countdown-Timer — exportiert damit GamingPage ihn mitnutzen kann ──────────
export function RaceCountdown({ targetDate, raceName, flag }) {
  const [diff, setDiff] = useState(targetDate - Date.now())

  useEffect(() => {
    const id = setInterval(() => setDiff(targetDate - Date.now()), 1000)
    return () => clearInterval(id)
  }, [targetDate])

  if (diff <= 0) return null

  const days    = Math.floor(diff / 86400000)
  const hours   = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000)  / 60000)
  const seconds = Math.floor((diff % 60000)    / 1000)

  const pad = (n) => String(n).padStart(2, '0')

  return (
    <div className="cal-countdown">
      <div className="cal-countdown-label">
        {flag} Nächstes Rennen: <strong>{raceName}</strong>
      </div>
      <div className="cal-countdown-timer">
        <div className="cal-countdown-unit">
          <span className="cal-countdown-value">{days}</span>
          <span className="cal-countdown-unit-label">Tage</span>
        </div>
        <span className="cal-countdown-sep">:</span>
        <div className="cal-countdown-unit">
          <span className="cal-countdown-value">{pad(hours)}</span>
          <span className="cal-countdown-unit-label">Std</span>
        </div>
        <span className="cal-countdown-sep">:</span>
        <div className="cal-countdown-unit">
          <span className="cal-countdown-value">{pad(minutes)}</span>
          <span className="cal-countdown-unit-label">Min</span>
        </div>
        <span className="cal-countdown-sep">:</span>
        <div className="cal-countdown-unit">
          <span className="cal-countdown-value">{pad(seconds)}</span>
          <span className="cal-countdown-unit-label">Sek</span>
        </div>
      </div>
    </div>
  )
}

// ── Positions-Badge (identisch zu RacePage) ───────────────────
function PositionBadge({ pos }) {
  if (pos === undefined || pos === null || pos === '') return <span className="race-pos-unknown">–</span>
  const p = Number(pos)
  if (!p) return <span className="race-pos-unknown">–</span>
  return (
    <span className={`race-pos ${p === 1 ? 'race-pos--1' : p === 2 ? 'race-pos--2' : p === 3 ? 'race-pos--3' : ''}`}>
      P{p}
    </span>
  )
}

function calcPlayerPoints(playerPicks, raceResultMap, sprintResultMap, isSprint, allDrivers) {
  let racePoints = 0, sprintPoints = 0
  for (const pick of playerPicks) {
    if (pick.pick_type === 'driver') {
      const pos = raceResultMap[pick.driver_id]
      racePoints += pos ?? 0
      if (isSprint) {
        const spos = sprintResultMap[pick.driver_id]
        sprintPoints += spos ? (spos / 2) : 0
      }
    } else if (pick.pick_type === 'constructor') {
      const teamDrivers = (allDrivers ?? []).filter(d => d.constructor_id === pick.constructor_id)
      for (const td of teamDrivers) {
        const pos = raceResultMap[td.id]
        racePoints += pos ?? 0
        if (isSprint) {
          const spos = sprintResultMap[td.id]
          sprintPoints += spos ? (spos / 2) : 0
        }
      }
    }
  }
  return { racePoints, sprintPoints, total: racePoints + sprintPoints }
}

// ── Session-Ergebnisse Panel (identisch zu RacePage) ──────────
function SessionResultsPanel({ results, loading, error }) {
  if (loading) return (
    <div className="session-results-panel session-results-loading">
      <div className="spinner" style={{ width: '1.2rem', height: '1.2rem', borderWidth: '2px' }} />
      <span>Lade OpenF1-Daten…</span>
    </div>
  )
  if (error) return <div className="session-results-panel session-results-error">⚠️ {error}</div>
  if (!results.length) return null
  return (
    <div className="session-results-panel">
      {results.map(r => (
        <div key={r.driver_number} className="session-result-row">
          <span className={`race-pos ${r.position === 1 ? 'race-pos--1' : r.position === 2 ? 'race-pos--2' : r.position === 3 ? 'race-pos--3' : ''}`}>
            P{r.position}
          </span>
          <span className="session-result-name">{r.broadcast_name || r.full_name}</span>
          <span className="session-result-team" style={{ color: r.team_colour }}>{r.team_name}</span>
        </div>
      ))}
    </div>
  )
}

// ── Session-Zeile mit Klappmechanik (identisch zu RacePage) ───
function RaceSessionRow({ label, dateStr, sessionKey, onToggle, isOpen, results, loading, error }) {
  if (!dateStr) return null
  const isPast = new Date(dateStr) < new Date()
  return (
    <div className={`race-session-row ${isPast ? 'race-session-row--past' : ''}`}>
      <div
        className="race-session-main"
        onClick={isPast ? () => onToggle(sessionKey) : undefined}
        style={isPast ? { cursor: 'pointer' } : {}}
      >
        <span className="race-session-label">{label}</span>
        <span className="race-session-time">{formatDate(dateStr)}</span>
        {isPast && (
          <span className="race-session-done" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </div>
      {isPast && isOpen && (
        <SessionResultsPanel results={results} loading={loading} error={error} />
      )}
    </div>
  )
}

// ── Vergangenes Rennen: Picks & Punkte + Sessions ──────────────
export function PastRaceExpanded({ w }) {
  const { profile } = useAuthStore()
  const [picks, setPicks] = useState([])
  const [results, setResults] = useState([])
  const [draftOrder, setDraftOrder] = useState([])
  const [profiles, setProfiles] = useState([])
  const [allDrivers, setAllDrivers] = useState([])
  const [dataLoading, setDataLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('picks')

  const {
    fetchSession,
    results: sessionResults,
    loading: sessionLoading,
    error: sessionError,
    activeKey: openSessionKey,
  } = useSessionResults(w)

  useEffect(() => {
    async function load() {
      setDataLoading(true)
      const [
        { data: p },
        { data: res },
        { data: prof },
        { data: dOrder },
      ] = await Promise.all([
        supabase.from('picks')
          .select('*, drivers(id, first_name, last_name, number, abbreviation, constructor_id, constructors(short_name, color)), constructors(id, name, short_name, color)')
          .eq('race_weekend_id', w.id),
        supabase.from('race_results').select('*').eq('race_weekend_id', w.id),
        supabase.from('profiles').select('*'),
        supabase.from('draft_orders').select('*, profiles(display_name)').eq('race_weekend_id', w.id).order('pick_order'),
      ])
      setPicks(p ?? [])
      setResults(res ?? [])
      setProfiles(prof ?? [])
      setDraftOrder(dOrder ?? [])

      const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
      if (season) {
        const { data: drivers } = await supabase.from('drivers')
          .select('id, first_name, last_name, number, abbreviation, constructor_id')
          .eq('season_id', season.id)
        setAllDrivers(drivers ?? [])
      }
      setDataLoading(false)
    }
    load()
  }, [w.id])

  const raceResultMap = {}
  const sprintResultMap = {}
  for (const r of results) {
    if (r.session_type === 'race')   raceResultMap[r.driver_id] = r.position
    if (r.session_type === 'sprint') sprintResultMap[r.driver_id] = r.position
  }
  const hasResults = results.length > 0

  const orderedProfiles = draftOrder.length > 0
    ? draftOrder.map(d => profiles.find(p => p.id === d.profile_id)).filter(Boolean)
    : profiles

  const playerPoints = orderedProfiles.map(player => {
    const playerPicks = picks.filter(p => p.profile_id === player.id)
    const pts = calcPlayerPoints(playerPicks, raceResultMap, sprintResultMap, w.is_sprint_weekend, allDrivers)
    return { player, playerPicks, ...pts }
  })
  if (hasResults) playerPoints.sort((a, b) => a.total - b.total)

  const sessionRows = w.is_sprint_weekend
    ? [
        { key: 'fp1',          label: 'FP1',              dateStr: w.fp1_start },
        { key: 'sprint_quali', label: 'Sprint Qualifying', dateStr: w.sprint_quali_start },
        { key: 'sprint',       label: 'Sprint ⚡',         dateStr: w.sprint_start },
        { key: 'qualifying',   label: 'Qualifying',        dateStr: w.qualifying_start },
        { key: 'race',         label: 'Rennen 🏁',         dateStr: w.race_start },
      ]
    : [
        { key: 'fp1',        label: 'FP1',        dateStr: w.fp1_start },
        { key: 'fp2',        label: 'FP2',        dateStr: w.fp2_start },
        { key: 'fp3',        label: 'FP3',        dateStr: w.fp3_start },
        { key: 'qualifying', label: 'Qualifying', dateStr: w.qualifying_start },
        { key: 'race',       label: 'Rennen 🏁',  dateStr: w.race_start },
      ]

  return (
    <div className="cal-sessions">
      {/* Tabs */}
      <div className="race-tabs" style={{ marginBottom: '1rem' }}>
        {[
          { id: 'picks',    label: 'Picks & Punkte', icon: Trophy },
          { id: 'sessions', label: 'Sessions',        icon: Clock },
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

      {/* Picks & Punkte Tab */}
      {activeTab === 'picks' && (
        dataLoading
          ? <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}><div className="spinner" /></div>
          : (
            <div className="race-picks-grid">
              {playerPoints.map(({ player, playerPicks, racePoints, sprintPoints, total }, rank) => {
                const driverPicks = playerPicks.filter(p => p.pick_type === 'driver')
                const teamPicks   = playerPicks.filter(p => p.pick_type === 'constructor')
                return (
                  <div
                    key={player.id}
                    className={`race-player-card ${player.id === profile?.id ? 'race-player-card--me' : ''} ${rank === 0 && hasResults ? 'race-player-card--leading' : ''}`}
                  >
                    <div className="race-player-header">
                      {hasResults && (
                        <span className={`race-rank-badge ${rank === 0 ? 'race-rank-1' : rank === 1 ? 'race-rank-2' : rank === 2 ? 'race-rank-3' : ''}`}>
                          {rank + 1}
                        </span>
                      )}
                      <div className="race-player-avatar">
                        {player.avatar_url
                          ? <img src={player.avatar_url} alt={player.display_name} />
                          : <span>{player.display_name?.[0]?.toUpperCase()}</span>}
                      </div>
                      <span className="race-player-name">{player.display_name}</span>
                      {hasResults && total > 0 && (
                        <div className="race-player-total-wrap">
                          <span className="race-player-total">
                            {total % 1 === 0 ? total : total.toFixed(1)}
                            <span className="text-muted" style={{ fontSize: '0.68rem', marginLeft: '0.2rem' }}>Pkt</span>
                          </span>
                          {w.is_sprint_weekend && sprintPoints > 0 && (
                            <div className="race-player-pts-breakdown">
                              <span>🏁 {racePoints % 1 === 0 ? racePoints : racePoints.toFixed(1)}</span>
                              <span className="race-player-pts-sep">·</span>
                              <span>⚡ {sprintPoints % 1 === 0 ? sprintPoints : sprintPoints.toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {playerPicks.length === 0
                      ? <p className="text-muted" style={{ fontSize: '0.8rem', padding: '0.5rem 0' }}>Keine Picks.</p>
                      : (
                        <div className="race-picks-list">
                          {driverPicks.map(pick => {
                            const pos  = raceResultMap[pick.driver_id]
                            const spos = sprintResultMap[pick.driver_id]
                            return (
                              <div key={pick.id} className="race-pick-row">
                                <div className="race-pick-label">F{pick.pick_number}</div>
                                <div className="race-pick-color" style={{ background: pick.drivers?.constructors?.color ?? '#888' }} />
                                <div className="race-pick-info">
                                  <span className="race-pick-name">{pick.drivers?.first_name} {pick.drivers?.last_name}</span>
                                  <span className="race-pick-team" style={{ color: pick.drivers?.constructors?.color }}>
                                    {pick.drivers?.constructors?.short_name} · #{pick.drivers?.number}
                                  </span>
                                </div>
                                <div className="race-pick-results">
                                  {hasResults && <PositionBadge pos={pos} />}
                                  {hasResults && w.is_sprint_weekend && spos && (
                                    <span className="race-sprint-pts">
                                      <Zap size={10} />{(spos / 2) % 1 === 0 ? (spos / 2) : (spos / 2).toFixed(1)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          {teamPicks.map(pick => {
                            const teamDrivers     = allDrivers.filter(d => d.constructor_id === pick.constructor_id)
                            const color           = pick.constructors?.color ?? '#888'
                            const teamTotal       = teamDrivers.reduce((sum, td) => sum + (raceResultMap[td.id] ?? 0), 0)
                            const teamSprintTotal = teamDrivers.reduce((sum, td) => {
                              const spos = sprintResultMap[td.id]
                              return sum + (spos ? (spos / 2) : 0)
                            }, 0)
                            return (
                              <div key={pick.id} className="race-pick-row race-pick-row--team">
                                <div className="race-pick-label">T{pick.pick_number}</div>
                                <div className="race-pick-color" style={{ background: color }} />
                                <div className="race-pick-info">
                                  <span className="race-pick-name">{pick.constructors?.name}</span>
                                  {hasResults && teamDrivers.length > 0 ? (
                                    <span className="race-pick-team-drivers">
                                      {teamDrivers.map(td => {
                                        const pos  = raceResultMap[td.id]
                                        const spos = sprintResultMap[td.id]
                                        return (
                                          <span key={td.id} className="race-pick-team-driver-pos">
                                            <span className="race-pick-abbr" style={{ color }}>{td.abbreviation}</span>
                                            <PositionBadge pos={pos} />
                                            {w.is_sprint_weekend && spos && (
                                              <span className="race-sprint-pts"><Zap size={10} />{(spos / 2)}</span>
                                            )}
                                          </span>
                                        )
                                      })}
                                    </span>
                                  ) : (
                                    <span className="race-pick-team" style={{ color }}>Team</span>
                                  )}
                                </div>
                                {hasResults && teamTotal > 0 && (
                                  <div className="race-pick-results">
                                    <PositionBadge pos={teamTotal} />
                                    {w.is_sprint_weekend && teamSprintTotal > 0 && (
                                      <span className="race-sprint-pts">
                                        <Zap size={10} />{teamSprintTotal % 1 === 0 ? teamSprintTotal : teamSprintTotal.toFixed(1)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    }
                  </div>
                )
              })}
            </div>
          )
      )}

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="card race-sessions-card">
          <p className="race-sessions-hint">
            Vergangene Sessions anklicken für Ergebnisse (via OpenF1)
          </p>
          {sessionRows.map(s => (
            <RaceSessionRow
              key={s.key}
              label={s.label}
              dateStr={s.dateStr}
              sessionKey={s.key}
              onToggle={fetchSession}
              isOpen={openSessionKey === s.key}
              results={openSessionKey === s.key ? sessionResults : []}
              loading={openSessionKey === s.key && sessionLoading}
              error={openSessionKey === s.key ? sessionError : null}
            />
          ))}
        </div>
      )}

      {/* Track + Circuit */}
      <div className="cal-sessions-track">
        <TrackMap round={w.round} circuit={w.circuit} country={w.country} size="md" />
      </div>
      <div className="cal-sessions-footer">
        <span className="cal-circuit">
          <Clock size={11} /> {w.circuit}
        </span>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const { weekends, loading, error } = useRaceWeekends()
  const [expanded, setExpanded] = useState(null)
  const now = new Date()

  const past     = weekends.filter(w => new Date(w.race_start) < now)
  const upcoming = weekends.filter(w => new Date(w.race_start) >= now)
  const nextRace = upcoming[0] ?? null

  if (error) return (
    <div style={{ padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
      ⚠️ Fehler beim Laden: {error?.message ?? String(error)}
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  )

  function RaceCard({ w }) {
    const isExpanded = expanded === w.id
    const isPast     = new Date(w.race_start) < now
    const isNext     = upcoming[0]?.id === w.id

    return (
      <div className={`cal-card ${isPast ? 'cal-card--past' : ''} ${isNext ? 'cal-card--next' : ''}`}>
        <button className="cal-card-header" onClick={() => setExpanded(isExpanded ? null : w.id)}>
          <span className="cal-round">R{w.round}</span>
          <span className="cal-flag">{w.flag_emoji}</span>
          <div className="cal-info">
            <span className="cal-race-name">{w.name}</span>
            <span className="cal-location">
              <MapPin size={11} /> {w.city}, {w.country}
            </span>
          </div>
          <div className="cal-col-badges">
            {w.is_sprint_weekend && <span className="badge badge-sprint">Sprint</span>}
            {TV_BROADCASTER[w.round] && (
              <span className={`cal-tv-badge cal-tv-badge--${TV_BROADCASTER[w.round].name.toLowerCase().replace(' ', '')}`}>
                {TV_BROADCASTER[w.round].name}
              </span>
            )}
          </div>
          <div className="cal-col-date">
            <span className="cal-race-date">
              {new Date(w.race_start).toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })}
            </span>
            <span className="cal-chevron">{isExpanded ? '▲' : '▼'}</span>
          </div>
        </button>

        {isExpanded && (
          isPast ? (
            <PastRaceExpanded w={w} />
          ) : (
            <div className="cal-sessions">
              <div className="cal-sessions-inner">
                <CalSessionRow label="FP1" dateStr={w.fp1_start} />
                {w.is_sprint_weekend ? (
                  <>
                    <CalSessionRow label="Sprint Qualifying" dateStr={w.sprint_quali_start} />
                    <CalSessionRow label="Sprint"            dateStr={w.sprint_start} />
                  </>
                ) : (
                  <>
                    <CalSessionRow label="FP2" dateStr={w.fp2_start} />
                    <CalSessionRow label="FP3" dateStr={w.fp3_start} />
                  </>
                )}
                <CalSessionRow label="Qualifying" dateStr={w.qualifying_start} />
                <CalSessionRow label="Rennen 🏁"  dateStr={w.race_start} />
              </div>
              <div className="cal-sessions-track">
                <TrackMap round={w.round} circuit={w.circuit} country={w.country} size="md" />
              </div>
              <div className="cal-sessions-footer">
                <span className="cal-circuit">
                  <Clock size={11} /> {w.circuit}
                </span>
                {TV_BROADCASTER[w.round] && (
                  <a
                    href={TV_BROADCASTER[w.round].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`cal-stream-link cal-stream-link--${TV_BROADCASTER[w.round].name.toLowerCase().replace(' ', '')}`}
                    onClick={e => e.stopPropagation()}
                  >
                    ▶ {TV_BROADCASTER[w.round].name} live
                  </a>
                )}
              </div>
            </div>
          )
        )}
      </div>
    )
  }

  return (
    <div className="calendar-page page-enter">
      <h1>Kalender 2026</h1>
      <p className="text-secondary" style={{ marginTop: '0.3rem', marginBottom: '1.5rem' }}>
        {weekends.length} Rennen · {weekends.filter(w => w.is_sprint_weekend).length} Sprint-Wochenenden
        · Alle Zeiten in Ortszeit ({Intl.DateTimeFormat().resolvedOptions().timeZone})
      </p>

      {nextRace && (
        <RaceCountdown
          targetDate={new Date(nextRace.race_start).getTime()}
          raceName={nextRace.name}
          flag={nextRace.flag_emoji}
        />
      )}

      {upcoming.length > 0 && (
        <section className="cal-section">
          <h3 className="cal-section-title">Kommende Rennen</h3>
          <div className="cal-list">
            {upcoming.map(w => <RaceCard key={w.id} w={w} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="cal-section">
          <h3 className="cal-section-title text-muted">Vergangene Rennen</h3>
          <div className="cal-list">
            {[...past].reverse().map(w => <RaceCard key={w.id} w={w} />)}
          </div>
        </section>
      )}
    </div>
  )
}
