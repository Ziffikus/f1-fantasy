import { useState, useEffect } from 'react'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { useDraft, useDraftOrder } from '../hooks/useDraft'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { GripVertical, Save, Trash2, Plus, ShieldCheck, Download, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { importResultsFromErgast } from '../lib/importResults'
import './AdminPage.css'

// ── Draft Reihenfolge ────────────────────────────────────────
function DraftOrderPanel({ raceWeekendId }) {
  const { profiles, saveDraftOrder, calcAutoOrder } = useDraftOrder(raceWeekendId)
  const { draftOrder, reload } = useDraft(raceWeekendId)
  const [order, setOrder] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [autoLoading, setAutoLoading] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  useEffect(() => {
    if (draftOrder.length > 0) {
      setOrder(draftOrder.map(d => d.profiles))
    } else if (profiles.length > 0) {
      setOrder(profiles)
    }
  }, [draftOrder, profiles])

  function handleDragStart(i) { setDragIdx(i) }

  function handleDragOver(e, i) {
    e.preventDefault()
    setDragOverIdx(i)
  }

  function handleDrop(i) {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return }
    const next = [...order]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(i, 0, moved)
    setOrder(next)
    setDragIdx(null)
    setDragOverIdx(null)
  }

  async function handleAutoCalc() {
    setAutoLoading(true)
    const sorted = await calcAutoOrder()
    setOrder(sorted)
    setAutoLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await saveDraftOrder(order.map(p => p.id), true)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await reload()
    } else {
      alert('Fehler: ' + error.message)
    }
    setSaving(false)
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h3>Draft-Reihenfolge</h3>
        <span className="text-secondary" style={{ fontSize: '0.8rem' }}>
          Position 1 = darf zuerst picken (= meiste Punkte Vorwoche)
        </span>
      </div>

      <div className="admin-auto-bar">
        <button className="btn btn-secondary btn-sm" onClick={handleAutoCalc} disabled={autoLoading}>
          {autoLoading
            ? <><span className="spinner" style={{ width: '0.8rem', height: '0.8rem' }} /> Berechne…</>
            : '🔄 Automatisch aus Vorwoche berechnen'
          }
        </button>
        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
          Danach per Drag & Drop anpassen
        </span>
      </div>

      <div className="admin-order-list">
        {order.map((player, i) => (
          <div
            key={player?.id}
            className={`admin-order-item ${dragOverIdx === i && dragIdx !== i ? 'admin-order-item--dragover' : ''} ${dragIdx === i ? 'admin-order-item--dragging' : ''}`}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
          >
            <span className="admin-drag-handle">⠿</span>
            <span className="admin-order-pos">{i + 1}</span>
            <div className="admin-order-avatar">
              {player?.avatar_url
                ? <img src={player.avatar_url} alt={player.display_name} />
                : <span>{player?.display_name?.[0]?.toUpperCase()}</span>}
            </div>
            <span className="admin-order-name">{player?.display_name}</span>
          </div>
        ))}
      </div>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? <><span className="spinner" style={{ width: '1rem', height: '1rem' }} /> Speichern…</> : saved ? '✅ Gespeichert!' : <><Save size={14} /> Reihenfolge speichern</>}
      </button>
    </div>
  )
}

// ── Admin Picks eintragen ────────────────────────────────────
function AdminPicksPanel({ raceWeekendId, profiles }) {
  const {
    draftOrder, drivers, constructors, picks,
    pickedDriverIds, pickedConstructorIds, loading,
    getPlayerPicks, getPlayerPickCount,
    adminMakePick, adminDeletePick,
  } = useDraft(raceWeekendId)

  const [selectedProfile, setSelectedProfile] = useState(null)
  const [tab, setTab] = useState('driver')

  useEffect(() => {
    if (draftOrder.length > 0 && !selectedProfile) {
      setSelectedProfile(draftOrder[0]?.profile_id)
    }
  }, [draftOrder])

  async function handlePick(type, entityId) {
    if (!selectedProfile) return
    const { error } = await adminMakePick(selectedProfile, type, entityId)
    if (error) alert('Fehler: ' + error.message)
  }

  async function handleDelete(pickId) {
    if (!confirm('Pick wirklich löschen?')) return
    const { error } = await adminDeletePick(pickId)
    if (error) alert('Fehler: ' + error.message)
  }

  const playerPicks = selectedProfile ? getPlayerPicks(selectedProfile) : []
  const pickCount = selectedProfile ? getPlayerPickCount(selectedProfile) : { drivers: 0, constructors: 0 }

  if (loading) return <div style={{ padding: '1rem' }}><div className="spinner" /></div>

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h3>Picks eintragen / bearbeiten</h3>
      </div>

      {/* Spieler-Auswahl */}
      <div className="admin-profile-tabs">
        {draftOrder.map(order => (
          <button
            key={order.profile_id}
            className={`admin-profile-tab ${selectedProfile === order.profile_id ? 'admin-profile-tab--active' : ''}`}
            onClick={() => setSelectedProfile(order.profile_id)}
          >
            {order.profiles?.display_name}
          </button>
        ))}
      </div>

      {selectedProfile && (
        <div className="admin-picks-content">
          {/* Aktuelle Picks */}
          <div className="admin-current-picks">
            <div className="admin-sub-header">Aktuelle Picks ({playerPicks.length}/6)</div>
            {playerPicks.length === 0
              ? <p className="text-muted" style={{ fontSize: '0.8rem' }}>Noch keine Picks.</p>
              : playerPicks.map(pick => (
                <div key={pick.id} className="admin-pick-row">
                  <span className="admin-pick-type">{pick.pick_type === 'driver' ? `F${pick.pick_number}` : `T${pick.pick_number}`}</span>
                  <span className="admin-pick-value">
                    {pick.pick_type === 'driver'
                      ? `${pick.drivers?.first_name} ${pick.drivers?.last_name} #${pick.drivers?.number}`
                      : pick.constructors?.name}
                  </span>
                  <button className="admin-delete-btn" onClick={() => handleDelete(pick.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            }
          </div>

          {/* Pick hinzufügen */}
          <div className="admin-add-pick">
            <div className="admin-sub-header">Pick hinzufügen</div>
            <div className="pick-panel-tabs" style={{ margin: '0 0 0.5rem' }}>
              <button className={`pick-tab ${tab === 'driver' ? 'pick-tab--active' : ''}`} onClick={() => setTab('driver')}>
                Fahrer ({pickCount.drivers}/4)
              </button>
              <button className={`pick-tab ${tab === 'constructor' ? 'pick-tab--active' : ''}`} onClick={() => setTab('constructor')}>
                Teams ({pickCount.constructors}/2)
              </button>
            </div>

            <div className="pick-list" style={{ maxHeight: '250px' }}>
              {tab === 'driver' && drivers.map(d => {
                const isPicked = pickedDriverIds.includes(d.id)
                return (
                  <button
                    key={d.id}
                    className={`pick-item ${isPicked ? 'pick-item--taken' : ''}`}
                    disabled={isPicked || pickCount.drivers >= 4}
                    onClick={() => handlePick('driver', d.id)}
                  >
                    <span className="pick-item-num">#{d.number}</span>
                    <div className="pick-item-info">
                      <span className="pick-item-name">{d.first_name} {d.last_name}</span>
                      <span className="pick-item-team" style={{ color: d.constructors?.color }}>{d.constructors?.short_name}</span>
                    </div>
                    {isPicked && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>vergeben</span>}
                  </button>
                )
              })}
              {tab === 'constructor' && constructors.map(c => {
                const isPicked = pickedConstructorIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    className={`pick-item ${isPicked ? 'pick-item--taken' : ''}`}
                    disabled={isPicked || pickCount.constructors >= 2}
                    onClick={() => handlePick('constructor', c.id)}
                  >
                    <div className="pick-item-team-color" style={{ background: c.color }} />
                    <div className="pick-item-info">
                      <span className="pick-item-name">{c.name}</span>
                    </div>
                    {isPicked && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>vergeben</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Ergebnisse eintragen ─────────────────────────────────────
function ResultsPanel({ raceWeekendId }) {
  const [drivers, setDrivers] = useState([])
  const [results, setResults] = useState({}) // driver_id → position
  const [sprintResults, setSprintResults] = useState({})
  const [weekend, setWeekend] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: rw } = await supabase.from('race_weekends').select('*').eq('id', raceWeekendId).single()
      setWeekend(rw)

      const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
      const { data: d } = await supabase.from('drivers').select('*, constructors(short_name, color)').eq('season_id', season.id).eq('is_active', true).order('last_name')
      setDrivers(d ?? [])

      const { data: existing } = await supabase.from('race_results').select('*').eq('race_weekend_id', raceWeekendId)
      const rMap = {}, sMap = {}
      for (const r of (existing ?? [])) {
        if (r.session_type === 'race') rMap[r.driver_id] = r.position
        if (r.session_type === 'sprint') sMap[r.driver_id] = r.position
      }
      setResults(rMap)
      setSprintResults(sMap)
    }
    if (raceWeekendId) load()
  }, [raceWeekendId])

  async function handleSave() {
    setSaving(true)
    try {
      // Lösche alte Ergebnisse
      const { error: delError } = await supabase.from('race_results').delete().eq('race_weekend_id', raceWeekendId)
      if (delError) throw delError

      const inserts = []
      for (const [driverId, pos] of Object.entries(results)) {
        if (pos) inserts.push({ race_weekend_id: raceWeekendId, driver_id: Number(driverId), session_type: 'race', position: Number(pos), is_manual_override: true })
      }
      if (weekend?.is_sprint_weekend) {
        for (const [driverId, pos] of Object.entries(sprintResults)) {
          if (pos) inserts.push({ race_weekend_id: raceWeekendId, driver_id: Number(driverId), session_type: 'sprint', position: Number(pos), is_manual_override: true })
        }
      }
      if (inserts.length > 0) {
        const { error: insError } = await supabase.from('race_results').insert(inserts)
        if (insError) throw insError
      }

      // Punkte berechnen und speichern
      await calculateAndSavePoints(raceWeekendId, results, sprintResults, weekend)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert('Fehler beim Speichern: ' + (err.message ?? JSON.stringify(err)))
    } finally {
      setSaving(false)
    }
  }

  const [importing, setImporting] = useState(false)
  const [importLog, setImportLog] = useState([])

  async function handleImport() {
    setImporting(true)
    setImportLog([])
    try {
      const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
      const { data: allDrivers } = await supabase.from('drivers').select('id, abbreviation').eq('season_id', season.id)
      const result = await importResultsFromErgast(supabase, weekend, allDrivers ?? [])
      setImportLog(result.log)
      // Ergebnisse neu laden
      const { data: existing } = await supabase.from('race_results').select('*').eq('race_weekend_id', raceWeekendId)
      const rMap = {}, sMap = {}
      for (const r of (existing ?? [])) {
        if (r.session_type === 'race')   rMap[r.driver_id] = r.position
        if (r.session_type === 'sprint') sMap[r.driver_id] = r.position
      }
      setResults(rMap)
      setSprintResults(sMap)
    } catch (e) {
      setImportLog([`❌ Fehler: ${e.message}`])
    }
    setImporting(false)
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h3>Ergebnisse eintragen</h3>
        {weekend?.is_sprint_weekend && <span className="badge badge-sprint">Sprint-Wochenende</span>}
      </div>

      {/* Import von Ergast */}
      <div className="admin-import-box">
        <div className="admin-import-info">
          <Download size={14} />
          <span>Ergebnisse automatisch von der F1-API importieren (Ergast). Manuelle Overrides bleiben erhalten.</span>
        </div>
        <button className="btn btn-secondary" onClick={handleImport} disabled={importing || !weekend}>
          {importing ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Importiere…</> : <><Download size={14} /> Jetzt importieren</>}
        </button>
        {importLog.length > 0 && (
          <div className="admin-import-log">
            {importLog.map((line, i) => <div key={i} className="admin-import-log-line">{line}</div>)}
          </div>
        )}
      </div>

      <div className="admin-results-grid">
        <div className="admin-results-col">
          <div className="admin-sub-header">🏁 Rennen – Endposition</div>
          {drivers.map(d => (
            <div key={d.id} className="admin-result-row">
              <span className="admin-result-driver">
                <span style={{ color: d.constructors?.color }}>■</span> {d.abbreviation}
              </span>
              <input
                type="number"
                min="1"
                max="22"
                className="input admin-pos-input"
                value={results[d.id] ?? ''}
                onChange={e => setResults(prev => ({ ...prev, [d.id]: e.target.value }))}
                placeholder="–"
              />
            </div>
          ))}
        </div>

        {weekend?.is_sprint_weekend && (
          <div className="admin-results-col">
            <div className="admin-sub-header">⚡ Sprint – Endposition</div>
            {drivers.map(d => (
              <div key={d.id} className="admin-result-row">
                <span className="admin-result-driver">
                  <span style={{ color: d.constructors?.color }}>■</span> {d.abbreviation}
                </span>
                <input
                  type="number"
                  min="1"
                  max="22"
                  className="input admin-pos-input"
                  value={sprintResults[d.id] ?? ''}
                  onChange={e => setSprintResults(prev => ({ ...prev, [d.id]: e.target.value }))}
                  placeholder="–"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: '1rem' }}>
        {saving ? <><span className="spinner" style={{ width: '1rem', height: '1rem' }} /> Speichern…</> : saved ? '✅ Gespeichert!' : <><Save size={14} /> Ergebnisse & Punkte speichern</>}
      </button>
    </div>
  )
}

// ── Fahrerverfügbarkeit ──────────────────────────────────────
function AvailabilityPanel({ raceWeekendId }) {
  const [drivers, setDrivers] = useState([])
  const [availability, setAvailability] = useState({}) // driver_id → { status, reason }
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
      const { data: d } = await supabase
        .from('drivers').select('*, constructors(short_name, color)')
        .eq('season_id', season.id).eq('is_active', true).order('last_name')
      setDrivers(d ?? [])

      const { data: avail } = await supabase
        .from('driver_availability')
        .select('*')
        .eq('race_weekend_id', raceWeekendId)
      const map = {}
      for (const a of (avail ?? [])) map[a.driver_id] = { status: a.status, reason: a.reason ?? '' }
      setAvailability(map)
    }
    if (raceWeekendId) load()
  }, [raceWeekendId])

  function setStatus(driverId, status) {
    setAvailability(prev => ({ ...prev, [driverId]: { ...prev[driverId], status, reason: prev[driverId]?.reason ?? '' } }))
  }

  function setReason(driverId, reason) {
    setAvailability(prev => ({ ...prev, [driverId]: { ...prev[driverId], reason } }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const upserts = Object.entries(availability)
        .filter(([, v]) => v.status && v.status !== 'available')
        .map(([driverId, v]) => ({
          race_weekend_id: raceWeekendId,
          driver_id: Number(driverId),
          status: v.status,
          reason: v.reason || null,
          is_manual: true,
        }))

      // Erst alle löschen, dann neu einfügen
      await supabase.from('driver_availability').delete().eq('race_weekend_id', raceWeekendId)
      if (upserts.length) {
        const { error } = await supabase.from('driver_availability').insert(upserts)
        if (error) throw error
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert('Fehler: ' + err.message)
    }
    setSaving(false)
  }

  const STATUS_OPTS = [
    { value: 'available',    label: '✅ Verfügbar',   color: 'var(--text-muted)' },
    { value: 'questionable', label: '⚠️ Fraglich',    color: '#f59e0b' },
    { value: 'unavailable',  label: '❌ Nicht dabei', color: '#ef4444' },
  ]

  const flagged = drivers.filter(d => availability[d.id]?.status && availability[d.id].status !== 'available')

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h3>Fahrerverfügbarkeit</h3>
        <span className="text-muted" style={{ fontSize: '0.78rem' }}>
          {flagged.length > 0 ? `${flagged.length} Fahrer markiert` : 'Alle verfügbar'}
        </span>
      </div>

      <div className="admin-availability-list">
        {drivers.map(d => {
          const av = availability[d.id] ?? { status: 'available', reason: '' }
          return (
            <div key={d.id} className={`admin-avail-row ${av.status !== 'available' ? 'admin-avail-row--flagged' : ''}`}>
              <div className="admin-avail-driver">
                <div className="admin-avail-dot" style={{ background: d.constructors?.color }} />
                <span className="admin-avail-name">{d.abbreviation}</span>
                <span className="admin-avail-team" style={{ color: d.constructors?.color }}>{d.constructors?.short_name}</span>
              </div>
              <select
                className="input admin-avail-select"
                value={av.status}
                onChange={e => setStatus(d.id, e.target.value)}
              >
                {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {av.status !== 'available' && (
                <input
                  className="input admin-avail-reason"
                  placeholder="Grund (z.B. Verletzt)"
                  value={av.reason}
                  onChange={e => setReason(d.id, e.target.value)}
                />
              )}
            </div>
          )
        })}
      </div>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: '1rem' }}>
        {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Speichern…</> : saved ? '✅ Gespeichert!' : <><Save size={14} /> Verfügbarkeit speichern</>}
      </button>
    </div>
  )
}

// Punkte berechnen helper
async function calculateAndSavePoints(raceWeekendId, raceResults, sprintResults, weekend) {
  const [
    { data: picks },
    { data: season },
    { data: profiles },
  ] = await Promise.all([
    supabase.from('picks').select('*').eq('race_weekend_id', raceWeekendId),
    supabase.from('seasons').select('id').eq('is_active', true).single(),
    supabase.from('profiles').select('id'),
  ])

  if (!season) throw new Error('Keine aktive Saison gefunden')

  const { data: allDrivers } = await supabase
    .from('drivers').select('id, constructor_id').eq('season_id', season.id)

  const pointsToUpsert = []

  for (const profile of (profiles ?? [])) {
    const playerPicks = (picks ?? []).filter(p => p.profile_id === profile.id)
    let racePoints = 0, sprintPoints = 0

    for (const pick of playerPicks) {
      if (pick.pick_type === 'driver') {
        const pos = Number(raceResults[pick.driver_id])
        racePoints += pos > 0 ? pos : 22
        if (weekend?.is_sprint_weekend) {
          const spos = Number(sprintResults[pick.driver_id])
          sprintPoints += Math.ceil((spos > 0 ? spos : 22) / 2)
        }
      } else if (pick.pick_type === 'constructor') {
        const teamDrivers = (allDrivers ?? []).filter(d => d.constructor_id === pick.constructor_id)
        for (const td of teamDrivers) {
          const pos = Number(raceResults[td.id])
          racePoints += pos > 0 ? pos : 22
          if (weekend?.is_sprint_weekend) {
            const spos = Number(sprintResults[td.id])
            sprintPoints += Math.ceil((spos > 0 ? spos : 22) / 2)
          }
        }
      }
    }

    pointsToUpsert.push({
      race_weekend_id: raceWeekendId,
      profile_id: profile.id,
      race_points: racePoints,
      sprint_points: sprintPoints,
      total_points: racePoints + sprintPoints,
    })
  }

  // Weekend Rang berechnen (wenigste Punkte = Rang 1)
  pointsToUpsert.sort((a, b) => a.total_points - b.total_points)
  pointsToUpsert.forEach((p, i) => { p.weekend_rank = i + 1 })

  const { error } = await supabase
    .from('player_race_points')
    .upsert(pointsToUpsert, { onConflict: 'race_weekend_id,profile_id' })
  if (error) throw error
}

// ── Main Admin Page ──────────────────────────────────────────
export default function AdminPage() {
  const { weekends } = useRaceWeekends()
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('order')

  useEffect(() => {
    if (weekends.length && !selectedId) {
      const next = weekends.find(w => new Date(w.race_start) > new Date())
      setSelectedId(next?.id ?? weekends[weekends.length - 1]?.id)
    }
  }, [weekends])

  return (
    <div className="admin-page page-enter">
      <div className="admin-page-header">
        <ShieldCheck size={22} className="text-accent" />
        <div>
          <h1>Admin</h1>
          <p className="text-secondary" style={{ marginTop: '0.2rem' }}>Verwaltung für Alex</p>
        </div>
      </div>

      {/* Rennen-Auswahl */}
      <div className="admin-top-bar">
        <select
          className="input"
          style={{ maxWidth: '280px' }}
          value={selectedId ?? ''}
          onChange={e => setSelectedId(Number(e.target.value))}
        >
          {weekends.map(w => (
            <option key={w.id} value={w.id}>
              R{w.round} · {w.flag_emoji} {w.city} {w.is_sprint_weekend ? '⚡' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        {[
          { id: 'order', label: 'Draft-Reihenfolge' },
          { id: 'picks', label: 'Picks eintragen' },
          { id: 'results', label: 'Ergebnisse' },
          { id: 'availability', label: 'Fahrerstatus' },
        ].map(t => (
          <button
            key={t.id}
            className={`admin-tab ${tab === t.id ? 'admin-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {selectedId && (
        <div className="admin-tab-content">
          {tab === 'order' && <DraftOrderPanel raceWeekendId={selectedId} />}
          {tab === 'picks' && <AdminPicksPanel raceWeekendId={selectedId} />}
          {tab === 'results' && <ResultsPanel raceWeekendId={selectedId} />}
          {tab === 'availability' && <AvailabilityPanel raceWeekendId={selectedId} />}
        </div>
      )}
    </div>
  )
}
