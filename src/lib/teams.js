// ============================================================
// Team-Zuordnung pro Rennwochenende
// overrides (eine Liste, für EIN Wochenende):
//   Team-Wechsel : { driver_id, constructor_id: <id> }
//   Fährt nicht  : { driver_id, constructor_id: null, session_type: 'race' | 'sprint' | 'both' }
//   Ergebnis-Ersatz (altes Modell): { kind: 'sub', driver_id: <Stammfahrer>, substitute_driver_id, session_type }
//     → Ergebnis des Ersatzes zählt für Picks auf den Stammfahrer
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
    if (o.kind === 'sub' || o.constructor_id != null || !sameDriver(o, driver)) continue
    const s = o.session_type ?? 'both'
    if (s === 'both' || s === 'race')   out_race = true
    if (s === 'both' || s === 'sprint') out_sprint = true
  }
  return { out_race, out_sprint }
}

/** Team-ID, für das der Fahrer in diesem Wochenende fährt (Team-Wechsel oder Standardteam) */
export function getEffectiveConstructorId(driver, overrides = []) {
  const o = overrides.find(x => x.kind !== 'sub' && x.constructor_id != null && sameDriver(x, driver))
  return o ? Number(o.constructor_id) : driver.constructor_id
}

/** Fahrer des Teams in diesem Wochenende; mit Flags out_race / out_sprint (fehlt nur in einer Session) */
export function getTeamDrivers(allDrivers, constructorId, overrides = []) {
  return (allDrivers ?? [])
    .filter(d => getEffectiveConstructorId(d, overrides) === Number(constructorId))
    .map(d => ({ ...d, ...getOutFlags(d, overrides) }))
    .filter(d => !(d.out_race && d.out_sprint))
}

/** Fahrerliste mit wochenendspezifischem constructor_id + Flags (null = fährt gar nicht) + Ergebnis-Ersatz */
export function applyTeamOverrides(drivers, overrides = []) {
  if (!overrides?.length) return drivers ?? []
  return (drivers ?? []).map(d => {
    const f = getOutFlags(d, overrides)
    const out = { ...d, ...f, constructor_id: f.out_race && f.out_sprint ? null : getEffectiveConstructorId(d, overrides) }
    for (const o of overrides) {
      if (o.kind !== 'sub' || !sameDriver(o, d)) continue
      const s = o.session_type ?? 'both'
      if (s === 'both' || s === 'race')   out.sub_from_race   = o.substitute_driver_id
      if (s === 'both' || s === 'sprint') out.sub_from_sprint = o.substitute_driver_id
    }
    return out
  })
}

/** Altes Ersatzmodell: Ergebnis des Ersatzes zählt für den Stammfahrer (Quelle = Overrides-Liste) */
export function applySubstituteResults(resultMap, overrides = [], session = 'race') {
  const subs = overrides.filter(o => o.kind === 'sub' && ['both', session].includes(o.session_type ?? 'both'))
  if (!subs.length) return resultMap
  const out = { ...resultMap }
  for (const s of subs) if (resultMap[s.substitute_driver_id] !== undefined) out[s.driver_id] = resultMap[s.substitute_driver_id]
  return out
}

/** Dasselbe, wenn nur die Fahrerliste mit sub_from_race / sub_from_sprint vorliegt */
export function applyDriverSubs(resultMap, drivers, session = 'race') {
  const key = session === 'sprint' ? 'sub_from_sprint' : 'sub_from_race'
  let out = resultMap
  for (const d of drivers ?? []) {
    const src = d[key]
    if (src != null && resultMap[src] !== undefined) { if (out === resultMap) out = { ...resultMap }; out[d.id] = resultMap[src] }
  }
  return out
}

// Ersatzfahrer (draftable) → Ersatz fährt für das Team des Ersetzten, Ersetzter fährt nicht
async function substitutionOverrides(weekendId) {
  let q = supabase.from('driver_substitutions')
    .select('race_weekend_id, original_driver_id, substitute_driver_id, session_type, draftable')
  if (weekendId != null) q = q.eq('race_weekend_id', weekendId)
  const { data: subs, error } = await q
  if (error || !subs?.length) return []
  const origIds = [...new Set(subs.map(s => s.original_driver_id))]
  const { data: origs } = await supabase.from('drivers').select('id, constructor_id').in('id', origIds)
  const team = Object.fromEntries((origs ?? []).map(d => [d.id, d.constructor_id]))
  return subs.flatMap(s => {
    const wk = s.race_weekend_id
    if (s.draftable) return [
      // neues Modell: Ersatz fährt für das Team des Ersetzten, Ersetzter fährt nicht
      { race_weekend_id: wk, driver_id: s.substitute_driver_id, constructor_id: team[s.original_driver_id] ?? null },
      { race_weekend_id: wk, driver_id: s.original_driver_id, constructor_id: null, session_type: 'both' },
    ]
    return [
      // altes Modell: Ersetzter fährt in dieser Session nicht, Picks auf ihn bekommen das Ergebnis des Ersatzes
      { race_weekend_id: wk, driver_id: s.original_driver_id, constructor_id: null, session_type: s.session_type ?? 'both' },
      { race_weekend_id: wk, kind: 'sub', driver_id: s.original_driver_id, substitute_driver_id: s.substitute_driver_id, constructor_id: null, session_type: s.session_type ?? 'both' },
    ]
  })
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

// ============================================================
// Teamfarben je Wochenende
// Die Farbe um einen Fahrer (Draft, Dashboard, Kalender, Rennseite) kommt vom Team,
// für das er AM WOCHENENDE fährt – nicht vom Standardteam in drivers.constructor_id.
// ============================================================
let _constructorsPromise = null

/** Alle Teams als { [id]: team } (einmal geladen und gecacht) */
export function fetchConstructorsById() {
  _constructorsPromise ??= supabase.from('constructors').select('*').then(({ data, error }) => {
    if (error) { console.warn('Teams nicht ladbar:', error.message); _constructorsPromise = null; return {} }
    return Object.fromEntries((data ?? []).map(c => [c.id, c]))
  })
  return _constructorsPromise
}

/**
 * Team-ID für die FARBE eines Fahrers am Wochenende:
 *  1. Ergebnis-Ersatz („Ergebnis übertragen"): der Fahrer zählt wie sein Ersatz → Team des Ersatzes
 *  2. sonst Team-Wechsel / Standardteam
 */
export function getColorConstructorId(driver, overrides = [], allDrivers = []) {
  const sub = overrides.find(o => o.kind === 'sub' && sameDriver(o, driver))
  if (sub) {
    const subDriver = (allDrivers ?? []).find(d => Number(d.id) === Number(sub.substitute_driver_id))
    const cid = getEffectiveConstructorId({ id: sub.substitute_driver_id, constructor_id: subDriver?.constructor_id ?? null }, overrides)
    if (cid != null) return Number(cid)
  }
  return getEffectiveConstructorId(driver, overrides)
}

/** Fahrer-Objekt mit wochenendspezifischem Team (constructor_id + constructors{ name, short_name, color, … }) */
export function withEffectiveTeam(driver, overrides = [], constructorsById = {}, allDrivers = []) {
  if (!driver) return driver
  const cid = getColorConstructorId(driver, overrides, allDrivers)
  const team = cid != null ? constructorsById[cid] : null
  if (!team || (Number(cid) === Number(driver.constructor_id) && driver.constructors)) return driver
  return { ...driver, constructor_id: team.id, constructors: { ...(driver.constructors ?? {}), ...team } }
}

/** Fahrer-Picks: pick.drivers bekommt das Team (und damit die Farbe) des Wochenendes */
export function applyPickTeams(picks, overrides = [], constructorsById = {}, allDrivers = []) {
  if (!overrides?.length) return picks ?? []
  return (picks ?? []).map(p =>
    p.pick_type === 'driver' && p.drivers
      ? { ...p, drivers: withEffectiveTeam(p.drivers, overrides, constructorsById, allDrivers) }
      : p)
}

/** Fahrerliste (z. B. Draft-Pool) mit wochenendspezifischem Team */
export function applyDriverTeams(drivers, overrides = [], constructorsById = {}, allDrivers = drivers) {
  if (!overrides?.length) return drivers ?? []
  return (drivers ?? []).map(d => withEffectiveTeam(d, overrides, constructorsById, allDrivers))
}
