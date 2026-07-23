// ── Track-Registry (vollautomatisch) ──────────────────────────────────────────
// Neuen Track hinzufügen:
//   1. Datei anlegen:  ./meintrack.track.js  (gleiche Struktur wie monaco.track.js,
//      d.h. ein benannter Export, dessen Wert ein Objekt mit { id, name, points, ... } ist)
//   2. Fertig. Diese Datei wird automatisch erkannt (import.meta.glob), in
//      ALL_TRACKS aufgenommen, alphabetisch nach Dateiname sortiert, und per
//      Namens-Ähnlichkeit automatisch mit dem passenden race_weekends-Eintrag
//      aus Supabase verknüpft (id "austria" matcht z.B. "Austrian GP").
//
//   → Diese index.js muss dafür nie wieder angefasst werden.

// Liest synchron alle *.track.js Dateien im selben Ordner ein (Vite-Feature).
// eager:true -> Module werden zur Build-Zeit direkt eingebunden, kein await nötig.
const trackModules = import.meta.glob('./*.track.js', { eager: true })

/**
 * Reihenfolge: alphabetisch nach Dateiname (stabil, nachvollziehbar).
 * Jedes Track-Modul muss genau einen benannten Export mit den Feldern
 *   id, name, points, scale, trackWidth, buffer, startIndex
 * enthalten (Variablenname des Exports ist egal).
 */
export const ALL_TRACKS = Object.keys(trackModules)
  .sort()
  .map(path => {
    const mod = trackModules[path]
    // Ersten benannten Export aus dem Modul nehmen (z. B. MONACO_TRACK)
    const exported = Object.values(mod).find(v => v && typeof v === 'object' && v.id)
    if (!exported) {
      console.warn(`[tracks] ${path} hat keinen gültigen Track-Export – wird ignoriert.`)
    }
    return exported
  })
  .filter(Boolean)

/** Gibt den Track mit der passenden id zurück, Fallback: erster Track */
export function getTrackById(id) {
  return ALL_TRACKS.find(t => t.id === id) ?? ALL_TRACKS[0]
}

// ── Track ↔ Rennwochenende (automatisches Fuzzy-Matching) ────────────────────
// Statt einer manuell gepflegten Liste wird jede Track-id automatisch gegen
// die race_weekends-Zeilen aus Supabase gematcht: verglichen werden
// name, circuit und country (alles kleingeschrieben, Sonderzeichen entfernt).
// Track-id "austria" matcht z.B. "Austrian GP" (circuit: "Red Bull Ring",
// country: "Austria") über den country-Vergleich.
function normalize(str) {
  return (str ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Akzente entfernen
    .replace(/[^a-z0-9]/g, '')
}

function findWeekendForTrack(trackId, weekends) {
  const needle = normalize(trackId)
  if (!needle) return null

  const matches = (field) => {
    const f = normalize(field)
    return f && (f.includes(needle) || needle.includes(f))
  }

  // 1. Gastgeberstadt (zuverlässigster Indikator für Tracks, deren id der
  //    Name der Host-Stadt ist, z.B. "budapest" in city "Budapest",
  //    "zandvoort" in city "Zandvoort" – deckt automatisch auch Fälle ab,
  //    in denen die Stadt in country/name/circuit gar nicht vorkommt,
  //    wie z.B. "Budapest" vs. country "Hungary"/circuit "Hungaroring")
  let match = weekends.find(w => matches(w.city))
  if (match) return match

  // 2. country (zuverlässiger Indikator, z.B. "austria" in country "Austria")
  match = weekends.find(w => matches(w.country))
  if (match) return match

  // 3. name (z.B. "barcelona" in "Barcelona-Catalunya GP")
  match = weekends.find(w => matches(w.name))
  if (match) return match

  // 4. circuit (z.B. "monaco" in "Circuit de Monaco")
  match = weekends.find(w => matches(w.circuit))
  return match ?? null
}

/**
 * Liefert für jeden Track in ALL_TRACKS den Freischalt-Status zurück.
 *
 * Regel: Tracks werden in der Reihenfolge ihrer gematchten race_weekends.round
 * freigeschaltet. Ein Track ist spielbar, sobald das race_start des
 * VORHERIGEN Tracks (in dieser Kette) erreicht ist. Der erste Track in der
 * Kette ist immer sofort spielbar.
 * Tracks ohne erkennbares Wochenende (kein Fuzzy-Match) sind immer spielbar
 * (z. B. reine Trainings-/Beta-Strecken ohne Saisonbezug).
 *
 * @param {Array} weekends - race_weekends Zeilen aus Supabase (beliebige Reihenfolge)
 * @returns {Object} map: trackId -> { unlocked, unlockAt, weekend }
 */
export function getTrackUnlockStatus(weekends = []) {
  // Jeden Track einmal gegen die Wochenenden matchen
  const trackWeekend = {} // trackId -> weekend row | null
  for (const t of ALL_TRACKS) {
    trackWeekend[t.id] = findWeekendForTrack(t.id, weekends)
  }

  // Gematchte Tracks nach round der Wochenenden sortieren -> Freischalt-Kette
  const chain = ALL_TRACKS
    .filter(t => trackWeekend[t.id])
    .sort((a, b) => trackWeekend[a.id].round - trackWeekend[b.id].round)

  const now = new Date()
  const status = {}

  for (const t of ALL_TRACKS) {
    const weekend = trackWeekend[t.id]
    if (!weekend) {
      status[t.id] = { unlocked: true, unlockAt: null, weekend: null }
      continue
    }

    const idx = chain.findIndex(c => c.id === t.id)
    if (idx <= 0) {
      status[t.id] = { unlocked: true, unlockAt: null, weekend }
      continue
    }

    const prevWeekend = trackWeekend[chain[idx - 1].id]
    const unlockAt    = prevWeekend.race_start
    status[t.id] = { unlocked: now >= new Date(unlockAt), unlockAt, weekend }
  }

  return status
}

/**
 * Gibt die id des Tracks zurück, der gerade "aktuell" ist – also der
 * spielbare mit dem zuletzt zurückliegenden Freischalt-Zeitpunkt
 * (bzw. der allererste in der Kette, falls noch kein Wochenende vorbei ist).
 * Fällt auf ALL_TRACKS[0] zurück, falls kein Matching möglich ist.
 */
export function getCurrentTrackId(weekends = []) {
  const status = getTrackUnlockStatus(weekends)
  const mapped = ALL_TRACKS.filter(t => status[t.id]?.weekend)

  const unlockedMapped = mapped
    .filter(t => status[t.id].unlocked)
    .sort((a, b) => {
      const aAt = status[a.id].unlockAt ? new Date(status[a.id].unlockAt).getTime() : -Infinity
      const bAt = status[b.id].unlockAt ? new Date(status[b.id].unlockAt).getTime() : -Infinity
      return bAt - aAt
    })

  if (unlockedMapped.length > 0) return unlockedMapped[0].id
  return ALL_TRACKS[0]?.id
}
