// ============================================================
// Team-Zuordnung pro Rennwochenende
// overrides = Zeilen aus driver_team_overrides für EIN Wochenende:
//   [{ driver_id, constructor_id }]
// Ohne Override gilt das Standardteam (drivers.constructor_id).
// ============================================================

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
