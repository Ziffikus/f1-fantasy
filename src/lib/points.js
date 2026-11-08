// ============================================================
// Einzige Quelle für die Punkteberechnung (Dashboard, Rennen,
// Kalender, Wertung, Admin-Speicherung).
//
// Regeln:
//   • Rennen: Punkte = Endposition. Kein Ergebnis → 0 (zählt nicht).
//   • Sprint: Punkte = Position / 2 (halbe Punkte erlaubt).
//   • DNS / DNF / DSQ stehen in den Ergebnissen als Position 22.
//   • Konstrukteur: Summe der Teamfahrer; Fahrer, die in der
//     Session nicht fahren (out_race / out_sprint), zählen nicht.
//   • Ein Team darf pro Session nie mehr als 2 gewertete Fahrer haben,
//     sonst wird ein TeamLimitError geworfen (calcPlayerPoints) bzw. als
//     `error` zurückgegeben (calcPlayerPointsSafe, für Anzeige-Seiten).
//     "Gewertet" = der Fahrer hat in dieser Session ein Ergebnis und fährt
//     laut Overrides mit. Fahrer ohne Ergebnis (z. B. ein Ersatzfahrer vor
//     seinem ersten Einsatz) zählen für das Limit nicht mit.
//
// allDrivers:
//   • Mit `overrides` (rohe Fahrerliste) → Team-Zuordnung und out-Flags
//     werden hier über getTeamDrivers berechnet.
//   • Ohne `overrides` (Liste wurde bereits mit applyTeamOverrides
//     aufbereitet) → vorhandene constructor_id / out-Flags werden genutzt.
// ============================================================
import { getTeamDrivers } from './teams'

export const MAX_DRIVERS_PER_TEAM = 2

export class TeamLimitError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TeamLimitError'
  }
}

export function calcPlayerPoints(
  playerPicks,
  raceResultMap,
  sprintResultMap,
  isSprint,
  allDrivers,
  overrides = null,
) {
  let racePoints = 0
  let sprintPoints = 0

  const sprintOf = (driverId) => {
    const spos = sprintResultMap?.[driverId]
    return spos ? spos / 2 : 0
  }

  for (const pick of playerPicks ?? []) {
    if (pick.pick_type === 'driver') {
      racePoints += raceResultMap?.[pick.driver_id] ?? 0
      if (isSprint) sprintPoints += sprintOf(pick.driver_id)
    } else if (pick.pick_type === 'constructor') {
      const teamDrivers = overrides
        ? getTeamDrivers(allDrivers, pick.constructor_id, overrides)
        : (allDrivers ?? []).filter(d => d.constructor_id === pick.constructor_id)

      assertTeamLimit(pick, teamDrivers, isSprint, raceResultMap, sprintResultMap)

      for (const td of teamDrivers) {
        if (!td.out_race) racePoints += raceResultMap?.[td.id] ?? 0
        if (isSprint && !td.out_sprint) sprintPoints += sprintOf(td.id)
      }
    }
  }

  return { racePoints, sprintPoints, total: racePoints + sprintPoints }
}

function assertTeamLimit(pick, teamDrivers, isSprint, raceResultMap, sprintResultMap) {
  const sessions = [['Rennen', d => !d.out_race && raceResultMap?.[d.id] != null]]
  if (isSprint) sessions.push(['Sprint', d => !d.out_sprint && sprintResultMap?.[d.id] != null])

  for (const [label, counts] of sessions) {
    const counted = teamDrivers.filter(counts)
    if (counted.length > MAX_DRIVERS_PER_TEAM) {
      const team = pick.constructors?.name ?? `ID ${pick.constructor_id}`
      throw new TeamLimitError(
        `Team ${team} hat ${counted.length} gewertete Fahrer im ${label} ` +
        `(Fahrer-IDs: ${counted.map(d => d.id).join(', ')}). Erlaubt sind maximal ${MAX_DRIVERS_PER_TEAM}.`
      )
    }
  }
}

/** Wie calcPlayerPoints, wirft aber nicht: bei Team-Limit-Verstoß kommt 0 + `error` zurück (für Anzeige-Seiten). */
export function calcPlayerPointsSafe(...args) {
  try {
    return { ...calcPlayerPoints(...args), error: null }
  } catch (err) {
    if (err instanceof TeamLimitError) return { racePoints: 0, sprintPoints: 0, total: 0, error: err.message }
    throw err
  }
}
