// ============================================================
// Team-Zuordnung pro Rennwochenende
// overrides = Zeilen aus driver_team_overrides für EIN Wochenende:
//   [{ driver_id, constructor_id }]
// Ohne Override gilt das Standardteam (drivers.constructor_id).
// ============================================================
import { supabase } from './supabase'

/** Team-ID, für das der Fahrer in diesem Wochenende fährt */
export function getEffectiveConstructorId(driver, overrides = []) {
  const o = overrides.find(x => Number(x.driver_id) === Number(driver.id))
  return o ? Number(o.constructor_id) : driver.constructor_id
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

/** Lädt die Team-Wechsel EINES Wochenendes → [{ driver_id, constructor_id }] */
export async function fetchTeamOverrides(raceWeekendId) {
  const { data, error } = await supabase
    .from('driver_team_overrides').select('driver_id, constructor_id')
    .eq('race_weekend_id', raceWeekendId)
  if (error) { console.warn('Team-Wechsel nicht ladbar:', error.message); return [] }
  return data ?? []
}

/** Lädt die Team-Wechsel ALLER Wochenenden → { [race_weekend_id]: [{ driver_id, constructor_id }] } */
export async function fetchTeamOverridesByWeekend() {
  const { data, error } = await supabase
    .from('driver_team_overrides').select('race_weekend_id, driver_id, constructor_id')
  if (error) { console.warn('Team-Wechsel nicht ladbar:', error.message); return {} }
  const map = {}
  for (const o of (data ?? [])) (map[o.race_weekend_id] ??= []).push(o)
  return map
}
