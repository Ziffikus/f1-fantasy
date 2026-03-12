import { useState, useEffect, useRef } from 'react'
import { useRaceWeekends } from '../hooks/useRaceWeekends'
import { useDraft } from '../hooks/useDraft'
import { useAuthStore } from '../stores/authStore'
import { Car, Users, Check, X, ChevronRight } from 'lucide-react'
import './DraftPage.css'

// ── Drag & Drop Pick Item ────────────────────────────────────
function DraggablePickItem({ item, type, isPicked, canPick, onSelect, selected, onDragStart }) {
  const isSelected = selected?.id === item.id && selected?.type === type

  return (
    <div
      className={`pick-item ${isPicked ? 'pick-item--taken' : ''} ${isSelected ? 'pick-item--selected' : ''} ${!canPick || isPicked ? 'pick-item--disabled' : ''}`}
      draggable={canPick && !isPicked}
      onDragStart={() => onDragStart({ item, type })}
      onClick={() => !isPicked && canPick && onSelect({ item, type })}
    >
      {type === 'driver' ? (
        <>
          <span className="pick-item-num">#{item.number}</span>
          <div className="pick-item-info">
            <span className="pick-item-name">{item.first_name} {item.last_name}</span>
            <span className="pick-item-team" style={{ color: item.constructors?.color }}>
              {item.constructors?.short_name}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="pick-item-team-color" style={{ background: item.color }} />
          <div className="pick-item-info">
            <span className="pick-item-name">{item.name}</span>
          </div>
        </>
      )}
      {isPicked && <X size={13} className="pick-item-taken-icon" />}
      {isSelected && !isPicked && <Check size={13} className="pick-item-check-sel" />}
    </div>
  )
}

// ── Drop Zone (Spieler-Slot) ─────────────────────────────────
function PlayerDropZone({ player, picks, isCurrentTurn, isMe, onDrop, onConfirm, pendingPick, onClearPending, canPick }) {
  const [dragOver, setDragOver] = useState(false)
  const driverPicks = picks.filter(p => p.pick_type === 'driver')
  const teamPicks = picks.filter(p => p.pick_type === 'constructor')
  const totalPicks = picks.length

  function handleDragOver(e) {
    if (!isCurrentTurn) return
    e.preventDefault()
    setDragOver(true)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (!isCurrentTurn) return
    onDrop()
  }

  return (
    <div
      className={`draft-zone ${isCurrentTurn ? 'draft-zone--active' : ''} ${isMe ? 'draft-zone--me' : ''} ${dragOver ? 'draft-zone--dragover' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="draft-zone-header">
        <div className="draft-player-avatar">
          {player?.avatar_url
            ? <img src={player.avatar_url} alt={player.display_name} />
            : <span>{player?.display_name?.[0]?.toUpperCase()}</span>}
        </div>
        <span className="draft-player-name">{player?.display_name}</span>
        {isCurrentTurn && <span className="badge badge-live">Dran</span>}
        <span className="draft-pick-count">{totalPicks}/6</span>
      </div>

      {/* Picks */}
      <div className="draft-zone-picks">
        {[1,2,3,4].map(n => {
          const pick = driverPicks.find(p => p.pick_number === n)
          return (
            <div key={`d${n}`} className={`draft-slot ${pick ? 'draft-slot--filled' : ''}`}>
              <span className="draft-slot-label">F{n}</span>
              {pick ? (
                <span className="draft-slot-value">
                  <span style={{ color: pick.drivers?.constructors?.color }}>■</span>{' '}
                  {pick.drivers?.abbreviation}
                </span>
              ) : (
                <span className="draft-slot-empty">–</span>
              )}
            </div>
          )
        })}
        {[1,2].map(n => {
          const pick = teamPicks.find(p => p.pick_number === n)
          return (
            <div key={`t${n}`} className={`draft-slot draft-slot--team ${pick ? 'draft-slot--filled' : ''}`}
              style={pick ? { borderLeftColor: pick.constructors?.color } : {}}>
              <span className="draft-slot-label">T{n}</span>
              {pick ? (
                <span className="draft-slot-value">{pick.constructors?.short_name}</span>
              ) : (
                <span className="draft-slot-empty">–</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Pending Pick + Bestätigen */}
      {isCurrentTurn && pendingPick && (
        <div className="draft-pending">
          <div className="draft-pending-item">
            {pendingPick.type === 'driver' ? (
              <span>
                <span style={{ color: pendingPick.item.constructors?.color }}>■</span>{' '}
                <strong>{pendingPick.item.first_name} {pendingPick.item.last_name}</strong>
                {' '}#{pendingPick.item.number}
              </span>
            ) : (
              <span>
                <span style={{ color: pendingPick.item.color }}>■</span>{' '}
                <strong>{pendingPick.item.name}</strong>
              </span>
            )}
          </div>
          <div className="draft-pending-actions">
            <button className="btn btn-primary btn-sm" onClick={onConfirm}>
              <Check size={13} /> Bestätigen
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClearPending}>
              <X size={13} /> Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Drop Hint */}
      {isCurrentTurn && !pendingPick && (
        <div className="draft-drop-hint">
          Ziehe einen Fahrer oder ein Team hierher{isMe ? '' : ' (warte…)'}
        </div>
      )}
    </div>
  )
}

// ── Main Draft Page ──────────────────────────────────────────
export default function DraftPage() {
  const { weekends, loading: weekendsLoading } = useRaceWeekends()
  const { profile } = useAuthStore()
  const [selectedWeekendId, setSelectedWeekendId] = useState(null)
  const [tab, setTab] = useState('driver')
  const [search, setSearch] = useState('')
  const [pendingPick, setPendingPick] = useState(null)
  const dragItem = useRef(null)

  useEffect(() => {
    if (weekends.length && !selectedWeekendId) {
      const next = weekends.find(w => new Date(w.race_start) > new Date())
      setSelectedWeekendId(next?.id ?? weekends[weekends.length - 1]?.id)
    }
  }, [weekends])

  const {
    draftOrder, picks, drivers, constructors,
    pickedDriverIds, pickedConstructorIds, loading,
    getPlayerPicks, getPlayerPickCount,
    currentTurn, isMyTurn, isDraftComplete,
    makePick,
  } = useDraft(selectedWeekendId)

  const selectedWeekend = weekends.find(w => w.id === selectedWeekendId)
  const isPastRace = selectedWeekend && new Date(selectedWeekend.race_start) < new Date()

  // Aktueller Spieler-Zug: round-robin durch alle bis alle 6 haben
  const myPickCount = profile ? getPlayerPickCount(profile.id) : { drivers: 0, constructors: 0 }
  const canPickDriver = myPickCount.drivers < 4
  const canPickTeam = myPickCount.constructors < 2

  function handleDragStart(data) {
    dragItem.current = data
  }

  function handleDrop() {
    if (!dragItem.current || !isMyTurn) return
    const { item, type } = dragItem.current
    if (type === 'driver' && pickedDriverIds.includes(item.id)) return
    if (type === 'driver' && !canPickDriver) return
    if (type === 'constructor' && pickedConstructorIds.includes(item.id)) return
    if (type === 'constructor' && !canPickTeam) return
    setPendingPick(dragItem.current)
    dragItem.current = null
  }

  function handleSelect(data) {
    if (!isMyTurn) return
    const { item, type } = data
    if (type === 'driver' && pickedDriverIds.includes(item.id)) return
    if (type === 'driver' && !canPickDriver) return
    if (type === 'constructor' && pickedConstructorIds.includes(item.id)) return
    if (type === 'constructor' && !canPickTeam) return
    setPendingPick(prev => prev?.item.id === item.id && prev?.type === type ? null : data)
  }

  async function handleConfirm() {
    if (!pendingPick) return
    const { item, type } = pendingPick
    const { error } = await makePick(type, item.id)
    if (error) alert('Fehler: ' + error.message)
    else setPendingPick(null)
  }

  const filteredDrivers = drivers.filter(d =>
    `${d.first_name} ${d.last_name} ${d.abbreviation}`.toLowerCase().includes(search.toLowerCase())
  )

  if (weekendsLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="draft-page page-enter">
      {/* Header */}
      <div className="draft-header">
        <div>
          <h1>Draft</h1>
          <p className="text-secondary" style={{ marginTop: '0.25rem' }}>
            Jeder Spieler wählt reihum 1 Fahrer oder Team – 6 Picks gesamt
          </p>
        </div>
        <select
          className="input draft-weekend-select"
          value={selectedWeekendId ?? ''}
          onChange={e => setSelectedWeekendId(Number(e.target.value))}
        >
          {weekends.map(w => (
            <option key={w.id} value={w.id}>
              R{w.round} · {w.flag_emoji} {w.city} {w.is_sprint_weekend ? '⚡' : ''}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" />
        </div>
      ) : draftOrder.length === 0 ? (
        <div className="card draft-no-order">
          <p>⚠️ Noch keine Draft-Reihenfolge für dieses Rennen festgelegt.</p>
          {profile?.is_admin && (
            <p className="text-secondary" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Admin → Draft-Reihenfolge festlegen.
            </p>
          )}
        </div>
      ) : (
        <div className="draft-layout">

          {/* Status Banner */}
          <div className={`draft-status ${isDraftComplete ? 'draft-status--done' : isMyTurn ? 'draft-status--myturn' : 'draft-status--waiting'}`}>
            {isDraftComplete
              ? '✅ Draft abgeschlossen – alle Picks sind gemacht!'
              : isMyTurn
                ? `⚡ Du bist dran! Wähle einen Fahrer oder ein Team (${myPickCount.drivers}/4 Fahrer, ${myPickCount.constructors}/2 Teams)`
                : `⏳ ${currentTurn?.profiles?.display_name ?? '…'} ist am Zug`
            }
          </div>

          <div className="draft-main">
            {/* Spieler Drop Zones */}
            <div className="draft-zones">
              {draftOrder.map(order => (
                <PlayerDropZone
                  key={order.profile_id}
                  player={order.profiles}
                  picks={getPlayerPicks(order.profile_id)}
                  isCurrentTurn={currentTurn?.profile_id === order.profile_id}
                  isMe={order.profile_id === profile?.id}
                  canPick={isMyTurn && order.profile_id === profile?.id}
                  onDrop={handleDrop}
                  onConfirm={handleConfirm}
                  pendingPick={order.profile_id === profile?.id ? pendingPick : null}
                  onClearPending={() => setPendingPick(null)}
                />
              ))}
            </div>

            {/* Pick Panel – nur wenn man dran ist */}
            {isMyTurn && !isDraftComplete && !isPastRace && (
              <div className="pick-panel">
                <div className="pick-panel-tabs">
                  <button
                    className={`pick-tab ${tab === 'driver' ? 'pick-tab--active' : ''} ${!canPickDriver ? 'pick-tab--disabled' : ''}`}
                    onClick={() => setTab('driver')}
                  >
                    <Car size={14} /> Fahrer ({myPickCount.drivers}/4)
                  </button>
                  <button
                    className={`pick-tab ${tab === 'constructor' ? 'pick-tab--active' : ''} ${!canPickTeam ? 'pick-tab--disabled' : ''}`}
                    onClick={() => setTab('constructor')}
                  >
                    <Users size={14} /> Teams ({myPickCount.constructors}/2)
                  </button>
                </div>

                {tab === 'driver' && (
                  <input
                    className="input pick-search"
                    placeholder="Fahrer suchen…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                )}

                <div className="pick-list">
                  {tab === 'driver' && filteredDrivers.map(d => (
                    <DraggablePickItem
                      key={d.id}
                      item={d}
                      type="driver"
                      isPicked={pickedDriverIds.includes(d.id)}
                      canPick={canPickDriver}
                      selected={pendingPick}
                      onSelect={handleSelect}
                      onDragStart={handleDragStart}
                    />
                  ))}
                  {tab === 'constructor' && constructors.map(c => (
                    <DraggablePickItem
                      key={c.id}
                      item={c}
                      type="constructor"
                      isPicked={pickedConstructorIds.includes(c.id)}
                      canPick={canPickTeam}
                      selected={pendingPick}
                      onSelect={handleSelect}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </div>

                {pendingPick && (
                  <div className="pick-panel-confirm">
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleConfirm}>
                      <Check size={15} />
                      {pendingPick.type === 'driver'
                        ? `${pendingPick.item.first_name} ${pendingPick.item.last_name} picken`
                        : `${pendingPick.item.name} picken`
                      }
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Runden-Übersicht */}
          <div className="draft-rounds">
            <div className="draft-rounds-title">Reihenfolge</div>
            <div className="draft-rounds-list">
              {Array.from({ length: 6 }, (_, round) =>
                draftOrder.map((order, pi) => {
                  const globalPick = round * draftOrder.length + pi
                  const playerTotal = getPlayerPicks(order.profile_id).length
                  const isDone = playerTotal > round
                  const isCurrent = currentTurn?.profile_id === order.profile_id &&
                    getPlayerPicks(order.profile_id).length === round

                  return (
                    <div
                      key={`${round}-${order.profile_id}`}
                      className={`draft-round-item ${isDone ? 'draft-round-item--done' : ''} ${isCurrent ? 'draft-round-item--current' : ''}`}
                    >
                      <span className="draft-round-num">{globalPick + 1}</span>
                      <span className="draft-round-name">{order.profiles?.display_name}</span>
                      {isDone && <Check size={11} />}
                      {isCurrent && <span className="draft-round-arrow"><ChevronRight size={11} /></span>}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
