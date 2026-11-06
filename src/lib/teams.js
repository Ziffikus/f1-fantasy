// ============================================================
// Team-Zuordnung pro Rennwochenende
// overrides = [{ driver_id, constructor_id }] für EIN Wochenende
//   constructor_id = null  → Fahrer fährt nicht (ersetzter Stammfahrer)
// Quellen: Team-Wechsel (driver_team_overrides) + Ersatzfahrer mit draftable=true
//   (Ersatz fährt für das Team des Ersetzten, Ersetzter fällt aus dem Team)
// Ohne Eintrag gilt das Standardteam (drivers.constructor_id).
// ============================================================
import { supabase } from './supabase'

/** Team-ID, für das der Fahrer in diesem Wochenende fährt (null = fährt nicht) */
export function getEffectiveConstructorId(driver, overrides = []) {
  const o = overrides.find(x => Number(x.driver_id) === Number(driver.id))
  if (!o) return driver.constructor_id
  return o.constructor_id == null ? null : Number(o.constructor_id)
}

/** Alle Fahrer, die in diesem Wochenende für das Team fahren */
export function getTeamDrivers(allDrivers, constructorId, overrides = []) {
  return (allDrivers ?? []).filter(
    d => getEffectiveConstructorId(d, overrides) === Number(constructorId)
  )
}

/** Fahrerliste mit wochenendspezifischem constructor_id (bestehender Code bleibt unverändert nutzbar) */
export function applyTeamOverrides(drivers, overrides = []) {
  if (!overrides?.length) return drivers ?? []
  return (drivers ?? []).map(d => ({ ...d, constructor_id: getEffectiveConstructorId(d, overrides) }))
}

// Ersatzfahrer (draftable) → Overrides: Ersatz übernimmt das Team des Ersetzten, Ersetzter fällt raus
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
    { race_weekend_id: s.race_weekend_id, driver_id: s.substitute_driver_id, constructor_id: team[s.original_driver_id] ?? null },
    { race_weekend_id: s.race_weekend_id, driver_id: s.original_driver_id,   constructor_id: null },
  ])
}

/** Overrides EINES Wochenendes → [{ driver_id, constructor_id }] */
export async function fetchTeamOverrides(raceWeekendId) {
  const { data, error } = await supabase
    .from('driver_team_overrides').select('driver_id, constructor_id')
    .eq('race_weekend_id', raceWeekendId)
  if (error) console.warn('Team-Wechsel nicht ladbar:', error.message)
  return [...(data ?? []), ...(await substitutionOverrides(raceWeekendId))]
}

/** Overrides ALLER Wochenenden → { [race_weekend_id]: [{ driver_id, constructor_id }] } */
export async function fetchTeamOverridesByWeekend() {
  const { data, error } = await supabase
    .from('driver_team_overrides').select('race_weekend_id, driver_id, constructor_id')
  if (error) console.warn('Team-Wechsel nicht ladbar:', error.message)
  const map = {}
  for (const o of [...(data ?? []), ...(await substitutionOverrides(null))]) (map[o.race_weekend_id] ??= []).push(o)
  return map
}
