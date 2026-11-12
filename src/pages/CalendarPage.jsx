import { useState, useEffect } from 'react'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { useSessionResults } from '../hooks/useSessionResults'
import { supabase } from '../lib/supabase'
import { calcPlayerPointsSafe } from '../lib/points'
import PointsError from '../components/ui/PointsError'
import PlayerPicksCard, { PlayerPicksGrid } from '../components/race/PlayerPicksCard'
import { applyTeamOverrides, applyDriverSubs, fetchTeamOverrides, fetchConstructorsById, applyPickTeams } from '../lib/teams'
import { useAuthStore } from '../stores/authStore'
import TrackMap from '../components/ui/TrackMap'
import { MapPin, Clock, Trophy, Zap, Flag, ChevronDown, ChevronRight } from 'lucide-react'
import './CalendarPage.css'

// ── AT-TV Sender (ServusTV / ORF) ──────────────────────────────
// Der eigentliche Sender pro Rennen kommt jetzt aus Supabase
// (race_weekends.tv_broadcaster, Werte 'ServusTV' oder 'ORF').
// Diese Map liefert nur noch URL + Styling-Key zum jeweiligen Namen.
const SERVUS = { name: 'ServusTV', url: 'https://www.servustv.com/sport/b/fia-formula-one-world-championship/aa-25hkbv8c52111/' }
const ORF_TV = { name: 'ORF',      url: 'https://on.orf.at/sendereihe/7028409/formel-1' }

const TV_BROADCASTER_BY_NAME = {
  ServusTV: SERVUS,
  ORF: ORF_TV,
}

function getBroadcaster(w) {
  return TV_BROADCASTER_BY_NAME[w.tv_broadcaster] ?? null
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
  const [teamOverrides, setTeamOverrides] = useState([])
  const [constructorsById, setConstructorsById] = useState({})
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
        const ov = await fetchTeamOverrides(w.id)
        setAllDrivers(applyTeamOverrides(drivers ?? [], ov))
        setTeamOverrides(ov)
        setConstructorsById(await fetchConstructorsById())
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
  Object.assign(raceResultMap, applyDriverSubs(raceResultMap, allDrivers, 'race'))
  Object.assign(sprintResultMap, applyDriverSubs(sprintResultMap, allDrivers, 'sprint'))
  const hasResults = results.length > 0

  const orderedProfiles = draftOrder.length > 0
    ? draftOrder.map(d => profiles.find(p => p.id === d.profile_id)).filter(Boolean)
    : profiles

  const playerPoints = orderedProfiles.map(player => {
    const playerPicks = applyPickTeams(picks, teamOverrides, constructorsById).filter(p => p.profile_id === player.id)
    const pts = calcPlayerPointsSafe(playerPicks, raceResultMap, sprintResultMap, w.is_sprint_weekend, allDrivers)
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
            <PlayerPicksGrid>
              <PointsError errors={playerPoints.map(p => p.error && `${p.player.display_name}: ${p.error}`)} />
              {playerPoints.map(({ player, playerPicks, racePoints, sprintPoints, total }, rank) => (
                <PlayerPicksCard
                  key={player.id}
                  player={player}
                  playerPicks={playerPicks}
                  rank={rank}
                  hasResults={hasResults}
                  isMe={player.id === profile?.id}
                  isSprintWeekend={w.is_sprint_weekend}
                  racePoints={racePoints}
                  sprintPoints={sprintPoints}
                  total={total}
                  raceResultMap={raceResultMap}
                  sprintResultMap={sprintResultMap}
                  allDrivers={allDrivers}
                />
              ))}
            </PlayerPicksGrid>
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
        <TrackMap round={w.round} circuit={w.circuit} country={w.country} size="full" />
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
    const broadcaster = getBroadcaster(w)

    return (
      <div className={`cal-card ${isPast ? 'cal-card--past' : ''} ${isNext ? 'cal-card--next' : ''}`}>
        <button className="cal-card-header" onClick={() => setExpanded(isExpanded ? null : w.id)}>
          <span className="cal-title-group">
            <span className="cal-round">R{w.round}</span>
            <span className="cal-flag">{w.flag_emoji}</span>
            <span className="cal-race-name">{w.name}</span>
          </span>
          <span className="cal-date-chevron">
            <span className="cal-race-date">
              {new Date(w.race_start).toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })}
            </span>
            <span className="cal-chevron">{isExpanded ? '▲' : '▼'}</span>
          </span>
          <span className="cal-location">
            <MapPin size={11} /> {w.city}, {w.country}
          </span>
          <span className="cal-badges-right">
            <span className="cal-tv-slot">
              {broadcaster && (
                <span className={`cal-tv-badge cal-tv-badge--${broadcaster.name.toLowerCase().replace(' ', '')}`}>
                  {broadcaster.name}
                </span>
              )}
            </span>
            <span className="cal-sprint-slot">
              {w.is_sprint_weekend && <span className="badge badge-sprint cal-badge-norm">Sprint</span>}
            </span>
          </span>
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
                <TrackMap round={w.round} circuit={w.circuit} country={w.country} size="full" />
              </div>
              <div className="cal-sessions-footer">
                <span className="cal-circuit">
                  <Clock size={11} /> {w.circuit}
                </span>
                {broadcaster && (
                  <a
                    href={broadcaster.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`cal-stream-link cal-stream-link--${broadcaster.name.toLowerCase().replace(' ', '')}`}
                    onClick={e => e.stopPropagation()}
                  >
                    ▶ {broadcaster.name} live
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
