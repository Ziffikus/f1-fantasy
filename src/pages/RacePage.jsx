import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calcPlayerPointsSafe } from '../lib/points'
import PointsError from '../components/ui/PointsError'
import PlayerPicksCard, { PlayerPicksGrid } from '../components/race/PlayerPicksCard'
import { applyTeamOverrides, applyDriverSubs, fetchTeamOverrides, fetchConstructorsById, applyPickTeams } from '../lib/teams'
import { useAuthStore } from '../stores/authStore'
import { useLiveRace, mapLivePositionsToDriverIds, mapLiveTyresToDriverIds, TYRE_COLORS, TYRE_SHORT } from '../hooks/useLiveRace'
import { useSessionResults } from '../hooks/useSessionResults'
import TrackMap from '../components/ui/TrackMap'
import { ArrowLeft, Trophy, Zap, Flag, Clock, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import './RacePage.css'

function formatDate(dateStr) {
  if (!dateStr) return '–'
  return new Date(dateStr).toLocaleString('de-AT', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })
}

function PositionBadge({ pos, isLive }) {
  if (pos === undefined || pos === null || pos === '') return <span className="race-pos-unknown">–</span>
  const p = Number(pos)
  if (!p) return <span className="race-pos-unknown">–</span>
  return (
    <span className={`race-pos ${p === 1 ? 'race-pos--1' : p === 2 ? 'race-pos--2' : p === 3 ? 'race-pos--3' : ''} ${isLive ? 'race-pos--live' : ''}`}>
      P{p}
    </span>
  )
}

function TyreBadge({ tyre }) {
  if (!tyre) return null
  const color = TYRE_COLORS[tyre.compound] ?? '#888'
  const short = TYRE_SHORT[tyre.compound] ?? '?'
  return (
    <span className="race-tyre-badge" style={{ background: color, color: tyre.compound === 'HARD' || tyre.compound === 'MEDIUM' ? '#000' : '#fff' }}>
      {short}
      {tyre.lap_start && <span className="race-tyre-lap">+{tyre.lap_start}L</span>}
    </span>
  )
}

// ── Session-Ergebnisse Komponente ─────────────────────────────
function SessionResultsPanel({ results, loading, error }) {
  if (loading) {
    return (
      <div className="session-results-panel session-results-loading">
        <div className="spinner" style={{ width: '1.2rem', height: '1.2rem', borderWidth: '2px' }} />
        <span>Lade OpenF1-Daten…</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="session-results-panel session-results-error">
        ⚠️ {error}
      </div>
    )
  }
  if (!results.length) return null

  return (
    <div className="session-results-panel">
      {results.map(r => (
        <div key={r.driver_number} className="session-result-row">
          <span className={`race-pos ${r.position === 1 ? 'race-pos--1' : r.position === 2 ? 'race-pos--2' : r.position === 3 ? 'race-pos--3' : ''}`}>
            P{r.position}
          </span>
          <span className="session-result-name">{r.broadcast_name || r.full_name}</span>
          <span className="session-result-team" style={{ color: r.team_colour }}>
            {r.team_name}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Session-Zeile mit Klappmechanik ──────────────────────────
function SessionRow({ label, dateStr, sessionKey, onToggle, isOpen, results, loading, error }) {
  if (!dateStr) return null
  const isPast = new Date(dateStr) < new Date()

  return (
    <div className={`race-session-row ${isPast ? 'race-session-row--past' : ''} ${isOpen ? 'race-session-row--open' : ''}`}>
      <div className="race-session-main" onClick={isPast ? () => onToggle(sessionKey) : undefined} style={isPast ? { cursor: 'pointer' } : {}}>
        <span className="race-session-label">{label}</span>
        <span className="race-session-time">{formatDate(dateStr)}</span>
        {isPast && (
          <span className="race-session-done" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {isOpen
              ? <ChevronDown size={13} />
              : <ChevronRight size={13} />
            }
          </span>
        )}
      </div>
      {isPast && isOpen && (
        <SessionResultsPanel results={results} loading={loading} error={error} />
      )}
    </div>
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
  const [allDrivers, setAllDrivers] = useState([])
  const [teamOverrides, setTeamOverrides] = useState([])
  const [constructorsById, setConstructorsById] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('picks')

  const { livePositions, liveTyres, isLive, sessionType, lastUpdate, loading: liveLoading, refetch } = useLiveRace(weekend)

  const {
    fetchSession,
    results: sessionResults,
    loading: sessionLoading,
    error: sessionError,
    activeKey: openSessionKey,
  } = useSessionResults(weekend)

  useEffect(() => { loadAll() }, [id])

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

    if (rw) {
      const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
      if (season) {
        const { data: drivers } = await supabase.from('drivers').select('id, first_name, last_name, number, abbreviation, constructor_id').eq('season_id', season.id)
        const ov = await fetchTeamOverrides(id)
        setAllDrivers(applyTeamOverrides(drivers ?? [], ov))
        setTeamOverrides(ov)
        setConstructorsById(await fetchConstructorsById())
      }
    }
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
  Object.assign(raceResultMap, applyDriverSubs(raceResultMap, allDrivers, 'race'))
  Object.assign(sprintResultMap, applyDriverSubs(sprintResultMap, allDrivers, 'sprint'))

  const liveByDriverId = applyDriverSubs(mapLivePositionsToDriverIds(livePositions, allDrivers), allDrivers, sessionType === 'sprint' ? 'sprint' : 'race')
  const tyrByDriverId = mapLiveTyresToDriverIds(liveTyres, allDrivers)
  const activeRaceMap = isLive && sessionType === 'race'
    ? { ...raceResultMap, ...liveByDriverId }
    : raceResultMap
  const activeSprintMap = isLive && sessionType === 'sprint'
    ? { ...sprintResultMap, ...liveByDriverId }
    : sprintResultMap

  const hasResults = results.length > 0 || isLive

  const orderedProfiles = draftOrder.length > 0
    ? draftOrder.map(d => profiles.find(p => p.id === d.profile_id)).filter(Boolean)
    : profiles

  const playerPoints = orderedProfiles.map(player => {
    const playerPicks = applyPickTeams(picks, teamOverrides, constructorsById).filter(p => p.profile_id === player.id)
    const pts = calcPlayerPointsSafe(playerPicks, activeRaceMap, activeSprintMap, weekend.is_sprint_weekend, allDrivers)
    return { player, playerPicks, ...pts }
  })

  if (hasResults) {
    playerPoints.sort((a, b) => a.total - b.total)
  }

  // Sessions als Array für den Tab
  const sessionRows = weekend.is_sprint_weekend
    ? [
        { key: 'fp1',          label: 'FP1',               dateStr: weekend.fp1_start },
        { key: 'sprint_quali', label: 'Sprint Qualifying',  dateStr: weekend.sprint_quali_start },
        { key: 'sprint',       label: 'Sprint ⚡',          dateStr: weekend.sprint_start },
        { key: 'qualifying',   label: 'Qualifying',         dateStr: weekend.qualifying_start },
        { key: 'race',         label: 'Rennen 🏁',          dateStr: weekend.race_start },
      ]
    : [
        { key: 'fp1',        label: 'FP1',         dateStr: weekend.fp1_start },
        { key: 'fp2',        label: 'FP2',         dateStr: weekend.fp2_start },
        { key: 'fp3',        label: 'FP3',         dateStr: weekend.fp3_start },
        { key: 'qualifying', label: 'Qualifying',  dateStr: weekend.qualifying_start },
        { key: 'race',       label: 'Rennen 🏁',   dateStr: weekend.race_start },
      ]

  return (
    <div className="race-page page-enter">
      <Link to="/kalender" className="race-back">
        <ArrowLeft size={16} /> Zurück zum Kalender
      </Link>

      {/* Hero */}
      <div className="race-hero">
        <div className="race-hero-flag">{weekend.flag_emoji}</div>
        <div className="race-hero-info">
          <div className="race-hero-round">Runde {weekend.round} · {new Date(weekend.race_start).getFullYear()}</div>
          <h1 className="race-hero-title">{weekend.name}</h1>
          <div className="race-hero-meta">
            <span>{weekend.city}, {weekend.country}</span>
            {weekend.circuit && <><span>·</span><span>{weekend.circuit}</span></>}
          </div>
        </div>
        <div>
          <TrackMap round={weekend.round} size="sm" />
          {isPast && !isLive ? (
            <span className="race-hero-status race-hero-status--done">
              <Flag size={11} /> Abgeschlossen
            </span>
          ) : isLive ? (
            <span className="race-hero-status race-hero-status--live">
              <span className="live-dot" /> Live
            </span>
          ) : null}
        </div>
      </div>

      {/* Live Banner */}
      {isLive && (
        <div className="live-banner">
          <div className="live-banner-left">
            <span className="live-dot" />
            <span>{sessionType === 'sprint' ? 'Sprint' : 'Rennen'} läuft</span>
            {lastUpdate && (
              <span className="live-update-time">
                Aktualisiert {lastUpdate.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
          <button className="live-refresh-btn" onClick={refetch} disabled={liveLoading}>
            <RefreshCw size={13} className={liveLoading ? 'spinning' : ''} />
            {liveLoading ? 'Lade…' : 'Jetzt aktualisieren'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="race-tabs">
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

      {/* Picks Tab */}
      {activeTab === 'picks' && (
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
              isSprintWeekend={weekend.is_sprint_weekend}
              racePoints={racePoints}
              sprintPoints={sprintPoints}
              total={total}
              raceResultMap={activeRaceMap}
              sprintResultMap={activeSprintMap}
              allDrivers={allDrivers}
              isLive={isLive}
              renderDriverExtra={isLive ? pick => <TyreBadge tyre={tyrByDriverId[pick.driver_id]} /> : null}
            />
          ))}
        </PlayerPicksGrid>
      )}

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="card race-sessions-card">
          <p className="race-sessions-hint">
            Vergangene Sessions anklicken für Ergebnisse (via OpenF1)
          </p>
          {sessionRows.map(s => (
            <SessionRow
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
    </div>
  )
}
