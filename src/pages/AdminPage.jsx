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
      // Upsert statt delete+insert – sicherer und schneller
      const upserts = []
      for (const [driverId, pos] of Object.entries(results)) {
        if (pos) upserts.push({
          race_weekend_id: raceWeekendId,
          driver_id: Number(driverId),
          session_type: 'race',
          position: Number(pos),
          is_manual_override: true,
        })
      }
      if (weekend?.is_sprint_weekend) {
        for (const [driverId, pos] of Object.entries(sprintResults)) {
          if (pos) upserts.push({
            race_weekend_id: raceWeekendId,
            driver_id: Number(driverId),
            session_type: 'sprint',
            position: Number(pos),
            is_manual_override: true,
          })
        }
      }

      if (upserts.length > 0) {
        const { error } = await supabase
          .from('race_results')
          .upsert(upserts, { onConflict: 'race_weekend_id,driver_id,session_type' })
        if (error) throw error
      }

      // Punkte aus DB berechnen (nicht aus lokalem State)
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
  const [overrideManual, setOverrideManual] = useState(false)

  async function handleImport() {
    setImporting(true)
    setImportLog([])
    try {
      const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
      const { data: allDrivers } = await supabase.from('drivers').select('id, abbreviation').eq('season_id', season.id)
      const result = await importResultsFromErgast(supabase, weekend, allDrivers ?? [], overrideManual)
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
          <span>Ergebnisse automatisch von der F1-API importieren (Ergast).</span>
        </div>
        <label className="admin-import-override">
          <input
            type="checkbox"
            checked={overrideManual}
            onChange={e => setOverrideManual(e.target.checked)}
          />
          Manuelle Einträge überschreiben
        </label>
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

// ── Ersatzfahrer ─────────────────────────────────────────────
function SubstitutionPanel({ raceWeekendId }) {
  const [drivers, setDrivers] = useState([])
  const [subs, setSubs] = useState([]) // [{ original_driver_id, substitute_driver_id, session_type }]
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
      const { data: d } = await supabase
        .from('drivers').select('*, constructors(short_name, color)')
        .eq('season_id', season.id).eq('is_active', true).order('last_name')
      setDrivers(d ?? [])

      const { data: existing } = await supabase
        .from('driver_substitutions').select('*').eq('race_weekend_id', raceWeekendId)
      setSubs(existing ?? [])
    }
    if (raceWeekendId) load()
  }, [raceWeekendId])

  function addSub() {
    setSubs(prev => [...prev, { original_driver_id: '', substitute_driver_id: '', session_type: 'both', _new: true }])
  }

  function updateSub(i, field, val) {
    setSubs(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s))
  }

  function removeSub(i) {
    setSubs(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await supabase.from('driver_substitutions').delete().eq('race_weekend_id', raceWeekendId)
      const valid = subs.filter(s => s.original_driver_id && s.substitute_driver_id)
      if (valid.length) {
        const { error } = await supabase.from('driver_substitutions').insert(
          valid.map(s => ({
            race_weekend_id: raceWeekendId,
            original_driver_id: Number(s.original_driver_id),
            substitute_driver_id: Number(s.substitute_driver_id),
            session_type: s.session_type,
          }))
        )
        if (error) throw error
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert('Fehler: ' + err.message)
    }
    setSaving(false)
  }

  const SESSION_LABELS = { both: 'Sprint + Rennen', race: 'Nur Rennen', sprint: 'Nur Sprint' }

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h3>Ersatzfahrer</h3>
        <span className="text-muted" style={{ fontSize: '0.78rem' }}>
          Punkte des Ersatzfahrers zählen für den Stammfahrer (Option A)
        </span>
      </div>

      {subs.length === 0 && (
        <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '0.75rem' }}>
          Keine Ersatzfahrer für dieses Wochenende.
        </p>
      )}

      <div className="admin-subs-list">
        {subs.map((sub, i) => (
          <div key={i} className="admin-sub-row">
            <div className="admin-sub-field">
              <label className="admin-sub-label">Stammfahrer (fehlt)</label>
              <select className="input" value={sub.original_driver_id} onChange={e => updateSub(i, 'original_driver_id', e.target.value)}>
                <option value="">– Fahrer wählen –</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.abbreviation} – {d.last_name}</option>)}
              </select>
            </div>
            <div className="admin-sub-arrow">→</div>
            <div className="admin-sub-field">
              <label className="admin-sub-label">Ersatzfahrer</label>
              <select className="input" value={sub.substitute_driver_id} onChange={e => updateSub(i, 'substitute_driver_id', e.target.value)}>
                <option value="">– Fahrer wählen –</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.abbreviation} – {d.last_name}</option>)}
              </select>
            </div>
            <div className="admin-sub-field">
              <label className="admin-sub-label">Gilt für</label>
              <select className="input" value={sub.session_type} onChange={e => updateSub(i, 'session_type', e.target.value)}>
                {Object.entries(SESSION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button className="btn btn-secondary admin-sub-remove" onClick={() => removeSub(i)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        <button className="btn btn-secondary" onClick={addSub}>
          <Plus size={14} /> Ersatz hinzufügen
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Speichern…</> : saved ? '✅ Gespeichert!' : <><Save size={14} /> Speichern</>}
        </button>
      </div>
    </div>
  )
}

// Punkte berechnen helper
async function calculateAndSavePoints(raceWeekendId, _raceResults, _sprintResults, weekend) {
  // Ergebnisse immer frisch aus der DB lesen
  const [
    { data: picks },
    { data: season },
    { data: profiles },
    { data: dbResults },
    { data: dbSubs },
  ] = await Promise.all([
    supabase.from('picks').select('*').eq('race_weekend_id', raceWeekendId),
    supabase.from('seasons').select('id').eq('is_active', true).single(),
    supabase.from('profiles').select('id'),
    supabase.from('race_results').select('driver_id, session_type, position').eq('race_weekend_id', raceWeekendId),
    supabase.from('driver_substitutions').select('*').eq('race_weekend_id', raceWeekendId),
  ])

  if (!season) throw new Error('Keine aktive Saison gefunden')

  const { data: allDrivers } = await supabase
    .from('drivers').select('id, constructor_id').eq('season_id', season.id)

  // Abbrechen wenn noch keine Ergebnisse vorhanden
  if (!dbResults?.length) return

  // DB-Ergebnisse in Maps umwandeln
  const raceResults = {}, sprintResults = {}
  for (const r of (dbResults ?? [])) {
    if (r.session_type === 'race')   raceResults[r.driver_id]   = r.position
    if (r.session_type === 'sprint') sprintResults[r.driver_id] = r.position
  }

  // Nur Rennergebnisse vorhanden prüfen
  const hasRaceResults = Object.keys(raceResults).length > 0
  if (!hasRaceResults) return

  // Ersatzfahrer anwenden: Stammfahrer bekommt Ergebnis des Ersatzfahrers
  for (const sub of (dbSubs ?? [])) {
    const { original_driver_id: orig, substitute_driver_id: repl, session_type: stype } = sub
    if ((stype === 'race' || stype === 'both') && raceResults[repl] !== undefined)
      raceResults[orig] = raceResults[repl]
    if ((stype === 'sprint' || stype === 'both') && sprintResults[repl] !== undefined)
      sprintResults[orig] = sprintResults[repl]
  }

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
          sprintPoints += ((spos > 0 ? spos : 22) / 2)
        }
      } else if (pick.pick_type === 'constructor') {
        const teamDrivers = (allDrivers ?? []).filter(d => d.constructor_id === pick.constructor_id)
        for (const td of teamDrivers) {
          const pos = Number(raceResults[td.id])
          racePoints += pos > 0 ? pos : 22
          if (weekend?.is_sprint_weekend) {
            const spos = Number(sprintResults[td.id])
            sprintPoints += ((spos > 0 ? spos : 22) / 2)
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

// ── Draft Ping ───────────────────────────────────────────────
function DraftPingPanel({ raceWeekendId }) {
  const { draftOrder, picks } = useDraft(raceWeekendId)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const currentPlayer = draftOrder.length > 0
    ? draftOrder[picks.length % draftOrder.length]
    : null

  async function sendPing(message) {
    if (!currentPlayer?.profile_id) return
    setSending(true)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('send-push', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: {
          profile_id: currentPlayer.profile_id,
          title: '🏎️ F1 Fantasy Draft',
          body: message,
          url: '/f1-fantasy/draft',
          tag: 'draft-ping',
        }
      })
      if (error) throw error
      setResult(data?.sent > 0 ? '✅ Push gesendet!' : '⚠️ Keine aktive Subscription.')
    } catch (e) {
      setResult('❌ Fehler: ' + e.message)
    }
    setSending(false)
  }

  const playerName = currentPlayer?.profiles?.display_name ?? '–'

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h3>📲 Draft Ping</h3>
        <span className="text-muted" style={{ fontSize: '0.78rem' }}>
          Aktuell dran: <strong>{playerName}</strong>
        </span>
      </div>
      {!currentPlayer ? (
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>Kein aktiver Draft oder Draft abgeschlossen.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <button
            className="btn btn-primary"
            onClick={() => sendPing(`${playerName}, du bist beim F1 Fantasy Draft dran!`)}
            disabled={sending}
          >
            {sending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Sende…</> : `📲 ${playerName} anpingen`}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => sendPing('Du bist dran, also tua weiter!!! Danke!')}
            disabled={sending}
          >
            😅 "Du bist dran, also tua weiter!!! Danke!"
          </button>
          {result && <p style={{ fontSize: '0.82rem' }}>{result}</p>}
        </div>
      )}
    </div>
  )
}

// ── Gaming Belohnung ─────────────────────────────────────────
function GamingRewardPanel() {
  const [profiles, setProfiles] = useState([])
  const [selectedProfile, setSelectedProfile] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [current, setCurrent] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from('profiles').select('id, display_name').order('display_name')
      setProfiles(p ?? [])
      const { data: reward } = await supabase
        .from('game_rewards')
        .select('*, profiles(display_name)')
        .gte('valid_until', new Date().toISOString())
        .eq('game', 'arcade_racing')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (reward) setCurrent(reward)
    }
    load()
  }, [])

  async function handleSave() {
    if (!selectedProfile || !validUntil) return
    setSaving(true)
    try {
      await supabase.from('game_rewards').insert({
        profile_id: selectedProfile,
        game: 'arcade_racing',
        track: 'monaco',
        reward_type: 'fastest_lap',
        valid_until: new Date(validUntil).toISOString(),
      })
      const { data: reward } = await supabase
        .from('game_rewards')
        .select('*, profiles(display_name)')
        .gte('valid_until', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      setCurrent(reward)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) { alert('Fehler: ' + err.message) }
    setSaving(false)
  }

  async function handleClear() {
    if (!current) return
    await supabase.from('game_rewards').delete().eq('id', current.id)
    setCurrent(null)
  }

  function setNextRace() {
    const next = new Date()
    next.setDate(next.getDate() + 7)
    next.setHours(14, 0, 0, 0)
    setValidUntil(next.toISOString().slice(0, 16))
  }

  const [testTarget, setTestTarget] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState(null)

  async function handleTestPush() {
    if (!testTarget) return
    setTestSending(true)
    setTestResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: {
          profile_id: testTarget,
          title: '🏎️ Test Push',
          body: 'Push-Benachrichtigungen funktionieren!',
          url: '/f1-fantasy/',
          tag: 'test',
        }
      })
      if (error) throw error
      setTestResult(data?.sent > 0 ? '✅ Push gesendet!' : '⚠️ Keine aktive Subscription gefunden.')
    } catch (e) {
      setTestResult('❌ Fehler: ' + e.message)
    }
    setTestSending(false)
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h3>🎮 Gaming-Krone</h3>
        <span className="text-muted" style={{ fontSize: '0.78rem' }}>Wird in der Wertung angezeigt</span>
      </div>
      {current ? (
        <div className="admin-reward-current">
          <div>
            <div className="admin-reward-label">Aktuelle Krone</div>
            <div className="admin-reward-name">🎮 {current.profiles?.display_name}</div>
            <div className="text-muted" style={{ fontSize: '0.72rem' }}>
              Bis: {new Date(current.valid_until).toLocaleDateString('de-AT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <button className="btn btn-secondary" onClick={handleClear} style={{ fontSize: '0.78rem' }}>
            <Trash2 size={13} /> Entfernen
          </button>
        </div>
      ) : (
        <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '0.75rem' }}>Aktuell hat niemand die Gaming-Krone.</p>
      )}
      <div className="admin-panel-header" style={{ marginTop: '1.5rem' }}>
        <h3>📲 Push testen</h3>
      </div>
      <div className="admin-reward-form" style={{ marginBottom: '1.5rem' }}>
        <div className="admin-sub-field">
          <label className="admin-sub-label">Spieler</label>
          <select className="input" value={testTarget} onChange={e => setTestTarget(e.target.value)}>
            <option value="">– Spieler wählen –</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary" onClick={handleTestPush} disabled={testSending || !testTarget}>
          {testSending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Sende…</> : '📲 Test-Push senden'}
        </button>
        {testResult && <p style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>{testResult}</p>}
      </div>

      <div className="admin-reward-form">
        <div className="admin-sub-field">
          <label className="admin-sub-label">Spieler</label>
          <select className="input" value={selectedProfile} onChange={e => setSelectedProfile(e.target.value)}>
            <option value="">– Spieler wählen –</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </div>
        <div className="admin-sub-field">
          <label className="admin-sub-label">Gültig bis</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input type="datetime-local" className="input" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={setNextRace} style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>+7 Tage</button>
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !selectedProfile || !validUntil}>
          {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Speichern…</> : saved ? '✅ Gespeichert!' : <><Save size={14} /> Krone vergeben</>}
        </button>
      </div>
    </div>
  )
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
          { id: 'substitutions', label: 'Ersatzfahrer' },
          { id: 'ping', label: '📲 Ping' },
          { id: 'gaming', label: '🎮 Gaming' },
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
          {tab === 'substitutions' && <SubstitutionPanel raceWeekendId={selectedId} />}
          {tab === 'ping' && <DraftPingPanel raceWeekendId={selectedId} />}
          {tab === 'gaming' && <GamingRewardPanel />}
        </div>
      )}
    </div>
  )
}
