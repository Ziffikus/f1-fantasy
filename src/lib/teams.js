// ============================================================
// Team-Zuordnung pro Rennwochenende
// overrides (eine Liste, für EIN Wochenende):
//   Team-Wechsel : { driver_id, constructor_id: <id> }
//   Fährt nicht  : { driver_id, constructor_id: null, session_type: 'race' | 'sprint' | 'both' }
// Quellen: driver_team_overrides + driver_absences + Ersatzfahrer mit draftable=true
//   (Ersatz fährt für das Team des Ersetzten, Ersetzter fährt nicht)
// Ohne Eintrag gilt das Standardteam (drivers.constructor_id).
// ============================================================
import { supabase } from './supabase'

const sameDriver = (o, d) => Number(o.driver_id) === Number(d.id)

/** Fährt der Fahrer in Rennen / Sprint nicht? → { out_race, out_sprint } */
export function getOutFlags(driver, overrides = []) {
  let out_race = false, out_sprint = false
  for (const o of overrides) {
    if (o.constructor_id != null || !sameDriver(o, driver)) continue
    const s = o.session_type ?? 'both'
    if (s === 'both' || s === 'race')   out_race = true
    if (s === 'both' || s === 'sprint') out_sprint = true
  }
  return { out_race, out_sprint }
}

/** Team-ID, für das der Fahrer in diesem Wochenende fährt (Team-Wechsel oder Standardteam) */
export function getEffectiveConstructorId(driver, overrides = []) {
  const o = overrides.find(x => x.constructor_id != null && sameDriver(x, driver))
  return o ? Number(o.constructor_id) : driver.constructor_id
}

/** Fahrer des Teams in diesem Wochenende; mit Flags out_race / out_sprint (fehlt nur in einer Session) */
export function getTeamDrivers(allDrivers, constructorId, overrides = []) {
  return (allDrivers ?? [])
    .filter(d => getEffectiveConstructorId(d, overrides) === Number(constructorId))
    .map(d => ({ ...d, ...getOutFlags(d, overrides) }))
    .filter(d => !(d.out_race && d.out_sprint))
}

/** Fahrerliste mit wochenendspezifischem constructor_id + Flags (null = fährt gar nicht) */
export function applyTeamOverrides(drivers, overrides = []) {
  if (!overrides?.length) return drivers ?? []
  return (drivers ?? []).map(d => {
    const f = getOutFlags(d, overrides)
    return { ...d, ...f, constructor_id: f.out_race && f.out_sprint ? null : getEffectiveConstructorId(d, overrides) }
  })
}

// Ersatzfahrer (draftable) → Ersatz fährt für das Team des Ersetzten, Ersetzter fährt nicht
async function substitutionOverrides(weekendId) {
  let q = supabase.from('driver_substitutions')
    .select('race_weekend_id, original_driver_id, substitute_driver_id').eq('draftable', true)
  if (weekendId != null) q = q.eq('race_weekend_id', weekendId)
  const { data: subs, error } = await q
  if (error || !subs?.length) return []
  const origIds = [...new Set(subs.map(s => s.original_driver_id))]
  const { data: origs } = await supabase.from('drivers').select('id, constructor_id').in('id', origIds)
  const team = Object.fromEntries((origs ?? []).map(d => [d.id, d.constructor_id]))
  return subs.flatMap(s => [
    { race_weekend_id: s.race_weekend_id, driver_id: s.substitute_driver_id, constructor_id: team[s.original_driver_id] ?? null, session_type: 'both' },
    { race_weekend_id: s.race_weekend_id, driver_id: s.original_driver_id,   constructor_id: null, session_type: 'both' },
  ])
}

async function loadRows(weekendId) {
  const cols = 'race_weekend_id, driver_id'
  let t = supabase.from('driver_team_overrides').select(`${cols}, constructor_id`)
  let a = supabase.from('driver_absences').select(`${cols}, session_type`)
  if (weekendId != null) { t = t.eq('race_weekend_id', weekendId); a = a.eq('race_weekend_id', weekendId) }
  const [{ data: team, error: e1 }, { data: abs, error: e2 }] = await Promise.all([t, a])
  if (e1) console.warn('Team-Wechsel nicht ladbar:', e1.message)
  if (e2) console.warn('Abwesenheiten nicht ladbar:', e2.message)
  return [
    ...(team ?? []).filter(r => r.constructor_id != null),
    ...(abs ?? []).map(r => ({ ...r, constructor_id: null })),
    ...(await substitutionOverrides(weekendId)),
  ]
}

/** Overrides EINES Wochenendes → Liste */
export async function fetchTeamOverrides(raceWeekendId) {
  return loadRows(raceWeekendId)
}

/** Overrides ALLER Wochenenden → { [race_weekend_id]: Liste } */
export async function fetchTeamOverridesByWeekend() {
  const map = {}
  for (const o of await loadRows(null)) (map[o.race_weekend_id] ??= []).push(o)
  return map
}
