// ============================================================
// PUNKTEBERECHNUNG – F1 Fantasy TBE
// ============================================================

/**
 * Berechnet die Punkte eines Spielers für ein Rennwochenende.
 *
 * Regeln:
 * - Position = Punkte (P1 = 1 Punkt, weniger = besser)
 * - Gleichzeitiges Ausscheiden = gleiche Punkte (höchste gemeinsame Position)
 * - Team = Fahrer 1 + Fahrer 2 addiert
 * - Sprint = halbe Punkte (aufgerundet), wird zum Rennen addiert
 * - Kein Fahrer / kein Ersatz = 22 Punkte
 */

/**
 * @param {Object[]} picks - Picks des Spielers (driver_id oder constructor_id)
 * @param {Object[]} raceResults - Ergebnisse [{driver_id, position}] für 'race'
 * @param {Object[]} sprintResults - Ergebnisse [{driver_id, position}] für 'sprint' (oder [])
 * @param {Object[]} allDrivers - Alle Fahrer mit constructor_id
 * @returns {{ racePoints: number, sprintPoints: number, totalPoints: number }}
 */
export function calculatePlayerPoints(picks, raceResults, sprintResults = [], allDrivers) {
  const raceMap = buildResultMap(raceResults)
  const sprintMap = buildResultMap(sprintResults)

  let racePoints = 0
  let sprintPoints = 0

  for (const pick of picks) {
    if (pick.pick_type === 'driver') {
      racePoints += getDriverPoints(pick.driver_id, raceMap)
      if (sprintResults.length > 0) {
        const raw = getDriverPoints(pick.driver_id, sprintMap)
        sprintPoints += Math.ceil(raw / 2)
      }
    } else if (pick.pick_type === 'constructor') {
      const teamDrivers = allDrivers.filter(d => d.constructor_id === pick.constructor_id)
      for (const driver of teamDrivers) {
        racePoints += getDriverPoints(driver.id, raceMap)
        if (sprintResults.length > 0) {
          const raw = getDriverPoints(driver.id, sprintMap)
          sprintPoints += Math.ceil(raw / 2)
        }
      }
    }
  }

  return {
    racePoints,
    sprintPoints,
    totalPoints: racePoints + sprintPoints,
  }
}

/**
 * Baut eine Map: driver_id → position
 * Bei Gleichstand (mehrere Fahrer ausgeschieden): nehmen alle die höchste (niedrigste) Position
 */
function buildResultMap(results) {
  const map = {}
  for (const r of results) {
    map[r.driver_id] = r.position
  }
  return map
}

/**
 * Gibt die Punkte eines Fahrers zurück.
 * Nicht angetreten / kein Ergebnis = 22 Punkte
 */
function getDriverPoints(driverId, resultMap) {
  return resultMap[driverId] ?? 22
}

/**
 * Berechnet die Draft-Reihenfolge für das nächste Rennen.
 * Wer am meisten Punkte hatte → darf zuerst picken.
 * Bei Gleichstand: Anzahl Siege, dann 2. Plätze usw.
 *
 * @param {Object[]} lastRacePoints - [{profile_id, total_points, weekend_rank}]
 * @param {Object[]} profiles - Alle Spieler-Profile
 * @returns {Object[]} Sortierte Profile (index 0 = darf zuerst picken)
 */
export function calculateDraftOrder(lastRacePoints, profiles) {
  return [...profiles].sort((a, b) => {
    const pa = lastRacePoints.find(p => p.profile_id === a.id)
    const pb = lastRacePoints.find(p => p.profile_id === b.id)

    // Spieler ohne letztes Ergebnis kommen zuletzt
    if (!pa && !pb) return 0
    if (!pa) return 1
    if (!pb) return -1

    // Mehr Punkte = darf zuerst picken (höherer total_points = schlechter = zuerst)
    if (pb.total_points !== pa.total_points) {
      return pb.total_points - pa.total_points // mehr Punkte = schlechter = zuerst
    }

    // Tiebreaker: weekend_rank (1 = Sieger des Wochenendes → kommt zuletzt beim Draft)
    return pb.weekend_rank - pa.weekend_rank
  })
}

/**
 * Berechnet den Gesamtstand der Saison mit Tiebreaker.
 * @param {Object[]} allPoints - Alle player_race_points Einträge
 * @param {Object[]} profiles - Spieler-Profile
 */
export function calculateOverallStandings(allPoints, profiles) {
  return profiles
    .map(profile => {
      const playerPoints = allPoints.filter(p => p.profile_id === profile.id)
      const total = playerPoints.reduce((sum, p) => sum + (p.total_points ?? 0), 0)
      const wins = playerPoints.filter(p => p.weekend_rank === 1).length
      const seconds = playerPoints.filter(p => p.weekend_rank === 2).length
      const thirds = playerPoints.filter(p => p.weekend_rank === 3).length
      return { ...profile, total, wins, seconds, thirds }
    })
    .sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total // weniger = besser
      if (a.wins !== b.wins) return b.wins - a.wins
      if (a.seconds !== b.seconds) return b.seconds - a.seconds
      return b.thirds - a.thirds
    })
}
