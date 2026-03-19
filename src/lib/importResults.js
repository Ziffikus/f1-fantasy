/**
 * Ergebnisse von der Ergast/Jolpi API importieren und in Supabase speichern.
 * Funktioniert für Rennen und Sprint.
 */

const ERGAST = 'https://api.jolpi.ca/ergast/f1'

/**
 * Holt Rennergebnisse von Ergast für eine bestimmte Runde.
 * @param {number} year  z.B. 2026
 * @param {number} round z.B. 1
 * @param {'race'|'sprint'} type
 * @returns {Array} [{ code, position }] oder []
 */
async function fetchErgastResults(year, round, type = 'race') {
  const endpoint = type === 'sprint'
    ? `${ERGAST}/${year}/${round}/sprint.json`
    : `${ERGAST}/${year}/${round}/results.json`

  const res = await fetch(endpoint)
  if (!res.ok) throw new Error(`Ergast API Fehler: ${res.status}`)
  const data = await res.json()

  const race = type === 'sprint'
    ? data?.MRData?.SprintTable?.Races?.[0]
    : data?.MRData?.RaceTable?.Races?.[0]

  if (!race) return []

  const results = type === 'sprint' ? race.SprintResults : race.Results
  return (results ?? []).map(r => ({
    code:     r.Driver?.code?.toUpperCase(),       // z.B. "VER"
    position: parseInt(r.position),
    status:   r.status,                            // "Finished", "DNF", etc.
  }))
}

/**
 * Punkte für alle Spieler berechnen und in player_race_points speichern.
 */
async function recalcPlayerPoints(supabase, raceWeekendId, weekend) {
  // Picks + Fahrer laden
  const { data: picks } = await supabase
    .from('picks')
    .select('profile_id, pick_type, driver_id, constructor_id')
    .eq('race_weekend_id', raceWeekendId)

  // Alle Ergebnisse für dieses Wochenende
  const { data: results } = await supabase
    .from('race_results')
    .select('driver_id, session_type, position')
    .eq('race_weekend_id', raceWeekendId)

  // Saison-Fahrer für Team-Auflösung
  const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
  const { data: allDrivers } = await supabase
    .from('drivers').select('id, constructor_id').eq('season_id', season.id)

  const raceMap   = {}
  const sprintMap = {}
  for (const r of (results ?? [])) {
    if (r.session_type === 'race')   raceMap[r.driver_id]   = r.position
    if (r.session_type === 'sprint') sprintMap[r.driver_id] = r.position
  }

  const profileIds = [...new Set((picks ?? []).map(p => p.profile_id))]
  const playerPoints = []

  for (const pid of profileIds) {
    const myPicks = (picks ?? []).filter(p => p.profile_id === pid)
    let racePts = 0, sprintPts = 0

    for (const pick of myPicks) {
      if (pick.pick_type === 'driver') {
        racePts   += raceMap[pick.driver_id]   ?? 22
        if (weekend.is_sprint_weekend) {
          const sp = sprintMap[pick.driver_id]
          sprintPts += sp ? (sp  / 2) : 11
        }
      } else {
        const teamDrivers = (allDrivers ?? []).filter(d => d.constructor_id === pick.constructor_id)
        for (const td of teamDrivers) {
          racePts   += raceMap[td.id]   ?? 22
          if (weekend.is_sprint_weekend) {
            const sp = sprintMap[td.id]
            sprintPts += sp ? (sp  / 2) : 11
          }
        }
      }
    }

    playerPoints.push({
      profile_id: pid,
      race_points: racePts,
      sprint_points: sprintPts,
      total_points: racePts + sprintPts,
    })
  }

  // Rang berechnen (niedrigste Punkte = Rang 1)
  playerPoints.sort((a, b) => a.total_points - b.total_points)
  playerPoints.forEach((p, i) => { p.weekend_rank = i + 1; p.race_weekend_id = raceWeekendId })

  // Upsert
  const { error } = await supabase
    .from('player_race_points')
    .upsert(playerPoints, { onConflict: 'race_weekend_id,profile_id' })

  return { error }
}

/**
 * Hauptfunktion: Ergebnisse importieren + Punkte berechnen.
 * Überschreibt nur Einträge ohne is_manual_override = true.
 *
 * @param {object} supabase  Supabase-Client
 * @param {object} weekend   Race weekend Objekt (id, round, season_id, is_sprint_weekend, ...)
 * @param {Array}  drivers   Alle Fahrer der Saison [{ id, abbreviation }]
 * @returns {{ imported, skipped, errors, log }}
 */
export async function importResultsFromErgast(supabase, weekend, drivers, overrideManual = false) {
  const log = []
  let imported = 0, skipped = 0, errors = 0

  // Jahr aus race_start ableiten
  const year = new Date(weekend.race_start).getFullYear()
  const types = weekend.is_sprint_weekend ? ['race', 'sprint'] : ['race']

  for (const type of types) {
    log.push(`🔄 Lade ${type === 'sprint' ? 'Sprint' : 'Rennen'}-Ergebnisse von Ergast (${year}, Runde ${weekend.round})…`)

    let ergastResults
    try {
      ergastResults = await fetchErgastResults(year, weekend.round, type)
    } catch (e) {
      log.push(`❌ Fetch-Fehler: ${e.message}`)
      errors++
      continue
    }

    if (!ergastResults.length) {
      log.push(`⚠️ Keine Ergebnisse gefunden – Rennen noch nicht abgeschlossen?`)
      continue
    }

    log.push(`✅ ${ergastResults.length} Fahrer gefunden`)

    // Bestehende manuelle Overrides laden
    const { data: existing } = await supabase
      .from('race_results')
      .select('driver_id, is_manual_override')
      .eq('race_weekend_id', weekend.id)
      .eq('session_type', type)

    const manualOverrides = overrideManual
      ? new Set()
      : new Set((existing ?? []).filter(e => e.is_manual_override).map(e => e.driver_id))

    // Ergebnisse mappen und einfügen
    const inserts = []
    for (const r of ergastResults) {
      const driver = drivers.find(d => d.abbreviation === r.code)
      if (!driver) {
        log.push(`⚠️ Fahrer nicht gefunden: ${r.code}`)
        skipped++
        continue
      }
      if (manualOverrides.has(driver.id)) {
        log.push(`🔒 ${r.code} – manueller Override bleibt erhalten`)
        skipped++
        continue
      }
      inserts.push({
        race_weekend_id:   weekend.id,
        driver_id:         driver.id,
        session_type:      type,
        position:          r.position,
        is_manual_override: false,
      })
    }

    if (inserts.length) {
      const { error } = await supabase
        .from('race_results')
        .upsert(inserts, { onConflict: 'race_weekend_id,driver_id,session_type' })

      if (error) {
        log.push(`❌ DB-Fehler: ${error.message}`)
        errors++
      } else {
        log.push(`💾 ${inserts.length} Ergebnisse gespeichert`)
        imported += inserts.length
      }
    }

    // Fahrerstatus nach Import aktualisieren (DNF/DNS → "questionable" für nächste Runde)
    const unavailable = ergastResults
      .filter(r => r.status && !r.status.toLowerCase().includes('finished') && !r.status.match(/^\+/))
      .map(r => r.code)
    if (unavailable.length) {
      log.push(`⚠️ DNF/DNS: ${unavailable.join(', ')} – als "fragwürdig" markiert`)
    }
  }

  // Punkte neu berechnen
  log.push('🧮 Berechne Spielerpunkte…')
  const { error: ptsError } = await recalcPlayerPoints(supabase, weekend.id, weekend)
  if (ptsError) {
    log.push(`❌ Punktefehler: ${ptsError.message}`)
    errors++
  } else {
    log.push('✅ Punkte gespeichert!')
  }

  return { imported, skipped, errors, log }
}
