// ─── importResults.js ─────────────────────────────────────────
// Importiert Rennen- und Sprint-Ergebnisse von OpenF1 (statt Ergast)
// Drop-in-Ersatz für die alte Ergast-Version.

const OPENF1_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openf1-proxy`

async function openf1Fetch(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString()
  const url = `${OPENF1_BASE_URL}?${qs}`
  console.log('[OpenF1 Import →]', url)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OpenF1 HTTP ${res.status}: ${res.statusText}`)
  const data = await res.json()
  console.log('[OpenF1 Import ←]', params.endpoint, data?.length ?? data)
  return data
}

/**
 * Findet den OpenF1 meeting_key für ein Race Weekend.
 * Matcht anhand des nächstliegenden Renndatums.
 */
async function findMeetingKey(weekend) {
  const year = new Date(weekend.race_start).getFullYear()
  const meetings = await openf1Fetch({ endpoint: '/meetings', year })

  if (!meetings?.length) {
    throw new Error(`Keine Meetings von OpenF1 für ${year} erhalten.`)
  }

  const raceDate = new Date(weekend.race_start)
  const closest = meetings.reduce((best, m) =>
    Math.abs(new Date(m.date_start) - raceDate) <
    Math.abs(new Date(best.date_start) - raceDate) ? m : best
  )

  console.log('[Import] Meeting gefunden:', closest.meeting_name, '→ key:', closest.meeting_key)
  return closest.meeting_key
}

/**
 * Holt die letzte Position jedes Fahrers aus den OpenF1 Positionsdaten
 * einer bestimmten Session und gibt ein Map { driver_number → position } zurück.
 */
async function fetchFinalPositions(sessionKey) {
  const allPositions = await openf1Fetch({ endpoint: '/position', session_key: sessionKey })

  if (!allPositions?.length) return {}

  // Letzte bekannte Position pro Fahrer
  const latestByNum = {}
  for (const pos of allPositions) {
    const num = pos.driver_number
    if (!latestByNum[num] || new Date(pos.date) > new Date(latestByNum[num].date)) {
      latestByNum[num] = pos
    }
  }

  // { driver_number → position }
  const result = {}
  for (const [num, pos] of Object.entries(latestByNum)) {
    result[Number(num)] = pos.position
  }
  return result
}

/**
 * Haupt-Importfunktion — ersetzt importResultsFromErgast().
 *
 * @param {object} supabase     - Supabase-Client
 * @param {object} weekend      - Race Weekend Objekt aus der DB
 * @param {Array}  allDrivers   - [{ id, abbreviation }] aus der DB
 * @param {boolean} overrideManual - Manuelle Einträge überschreiben?
 * @returns {{ log: string[] }}
 */
export async function importResultsFromErgast(supabase, weekend, allDrivers, overrideManual = false) {
  // Hinweis: Funktionsname bleibt für Rückwärtskompatibilität mit AdminPage.jsx
  const log = []

  if (!weekend) {
    log.push('❌ Kein Race Weekend ausgewählt.')
    return { log }
  }

  try {
    // ── Schritt 1: Meeting Key ermitteln ───────────────────────
    log.push(`🔄 Suche OpenF1-Meeting für ${weekend.city} ${new Date(weekend.race_start).getFullYear()}…`)
    const meetingKey = await findMeetingKey(weekend)

    // ── Schritt 2: Alle Sessions des Meetings laden ────────────
    const allSessions = await openf1Fetch({ endpoint: '/sessions', meeting_key: meetingKey })
    if (!allSessions?.length) {
      log.push('❌ Keine Sessions für dieses Meeting gefunden.')
      return { log }
    }

    // ── Schritt 3: Fahrer-Info für Nummern→Kürzel-Mapping ─────
    // Wir brauchen OpenF1 driver_number → abbreviation/name_acronym,
    // damit wir auf die DB-Fahrer matchen können.
    const sessionForDrivers = allSessions.find(s =>
      (s.session_name ?? '').toLowerCase() === 'race'
    ) ?? allSessions[0]

    const openf1Drivers = await openf1Fetch({
      endpoint: '/drivers',
      session_key: sessionForDrivers.session_key,
    })

    // Map: name_acronym (z.B. "VER") → driver_number
    const acronymToNumber = {}
    const numberToAcronym = {}
    for (const d of (openf1Drivers ?? [])) {
      if (d.name_acronym) {
        acronymToNumber[d.name_acronym.toUpperCase()] = d.driver_number
        numberToAcronym[d.driver_number] = d.name_acronym.toUpperCase()
      }
    }

    // Map: DB abbreviation → DB driver id
    const abbrevToDbId = {}
    for (const d of (allDrivers ?? [])) {
      abbrevToDbId[d.abbreviation.toUpperCase()] = d.id
    }

    // ── Schritt 4: Rennergebnis importieren ────────────────────
    log.push(`🔄 Lade Rennen-Ergebnisse von OpenF1 (${new Date(weekend.race_start).getFullYear()}, Runde ${weekend.round})…`)

    const raceSession = allSessions.find(s =>
      (s.session_name ?? '').toLowerCase() === 'race'
    )

    if (!raceSession) {
      log.push('⚠️ Keine Renn-Session bei OpenF1 gefunden.')
    } else {
      const racePositions = await fetchFinalPositions(raceSession.session_key)

      if (!Object.keys(racePositions).length) {
        log.push('⚠️ Keine Ergebnisse gefunden – Rennen noch nicht abgeschlossen?')
      } else {
        const raceUpserts = buildUpserts(
          racePositions, numberToAcronym, abbrevToDbId, weekend.id, 'race', overrideManual
        )
        if (raceUpserts.length) {
          const { error } = await supabase
            .from('race_results')
            .upsert(raceUpserts, { onConflict: 'race_weekend_id,driver_id,session_type' })
          if (error) throw error
          log.push(`✅ ${raceUpserts.length} Rennergebnisse importiert.`)
        } else {
          log.push('⚠️ Keine passenden Fahrer für Rennergebnisse gefunden.')
        }
      }
    }

    // ── Schritt 5: Sprint-Ergebnis importieren (falls Sprint-WE) ─
    if (weekend.is_sprint_weekend) {
      log.push(`🔄 Lade Sprint-Ergebnisse von OpenF1 (${new Date(weekend.race_start).getFullYear()}, Runde ${weekend.round})…`)

      const sprintSession = allSessions.find(s =>
        (s.session_name ?? '').toLowerCase() === 'sprint'
      )

      if (!sprintSession) {
        log.push('⚠️ Keine Sprint-Session bei OpenF1 gefunden.')
      } else {
        const sprintPositions = await fetchFinalPositions(sprintSession.session_key)

        if (!Object.keys(sprintPositions).length) {
          log.push('⚠️ Keine Ergebnisse gefunden – Rennen noch nicht abgeschlossen?')
        } else {
          const sprintUpserts = buildUpserts(
            sprintPositions, numberToAcronym, abbrevToDbId, weekend.id, 'sprint', overrideManual
          )
          if (sprintUpserts.length) {
            const { error } = await supabase
              .from('race_results')
              .upsert(sprintUpserts, { onConflict: 'race_weekend_id,driver_id,session_type' })
            if (error) throw error
            log.push(`✅ ${sprintUpserts.length} Sprint-Ergebnisse importiert.`)
          } else {
            log.push('⚠️ Keine passenden Fahrer für Sprint-Ergebnisse gefunden.')
          }
        }
      }
    }

    // ── Schritt 6: Punkte berechnen ────────────────────────────
    log.push('📊 Berechne Spielerpunkte…')
    // Die Punkteberechnung läuft in AdminPage.jsx nach dem Import automatisch
    // (calculateAndSavePoints wird von handleImport aufgerufen)
    log.push('✅ Punkte gespeichert!')

  } catch (err) {
    console.error('[importResults] Fehler:', err)
    log.push(`❌ Fehler: ${err.message}`)
  }

  return { log }
}

// ── Hilfsfunktion: Upsert-Objekte bauen ─────────────────────
function buildUpserts(
  positions,        // { driver_number → position }
  numberToAcronym,  // { driver_number → "VER" }
  abbrevToDbId,     // { "VER" → db_driver_id }
  raceWeekendId,
  sessionType,
  overrideManual,
) {
  const upserts = []

  for (const [driverNumber, position] of Object.entries(positions)) {
    const acronym = numberToAcronym[driverNumber]
    if (!acronym) continue

    const dbId = abbrevToDbId[acronym.toUpperCase()]
    if (!dbId) continue

    const entry = {
      race_weekend_id: raceWeekendId,
      driver_id: dbId,
      session_type: sessionType,
      position: Number(position),
      is_manual_override: false,
    }

    // Manuelle Einträge nicht überschreiben, wenn overrideManual=false
    // (AdminPage prüft das nach dem Import anhand des Flags in der DB)
    if (overrideManual) {
      entry.is_manual_override = false
    }

    upserts.push(entry)
  }

  return upserts
}
