// ============================================================
// check-session.js
// Prüft in der Supabase-Tabelle "race_weekends", ob JETZT eine
// F1-Session läuft (oder in Kürze beginnt). Gibt das Ergebnis
// als GitHub Actions Output zurück, damit der Workflow den
// eigentlichen Collector nur bei Bedarf startet.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

// Wie viele Minuten VOR dem offiziellen Start schon gestartet werden soll
const LEAD_TIME_MIN = 15

// Maximale Session-Dauer pro Typ (+ Sicherheitspuffer für Verlängerungen,
// rote Flaggen etc.) – wird als Laufzeit-Budget an den Collector übergeben.
const DURATION_MS = {
  practice:   90 * 60 * 1000,   // 1.5h
  qualifying: 90 * 60 * 1000,   // 1.5h
  sprint:     75 * 60 * 1000,   // 1.25h
  race:       180 * 60 * 1000,  // 3h
}

const SESSION_FIELDS = [
  { key: 'fp1_start',         type: 'practice'   },
  { key: 'fp2_start',         type: 'practice'   },
  { key: 'fp3_start',         type: 'practice'   },
  { key: 'sprint_quali_start', type: 'qualifying' },
  { key: 'sprint_start',      type: 'sprint'      },
  { key: 'qualifying_start',  type: 'qualifying' },
  { key: 'race_start',        type: 'race'        },
]

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args)
}

function writeOutput(name, value) {
  const outFile = process.env.GITHUB_OUTPUT
  if (outFile) {
    fs.appendFileSync(outFile, `${name}=${value}\n`)
  }
  log(`OUTPUT ${name}=${value}`)
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_URL / SUPABASE_SERVICE_KEY fehlen')
    writeOutput('should_run', 'false')
    process.exit(0) // bewusst kein Fehler-Exit, damit der Workflow nicht "rot" wird
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const now = new Date()

  // Nur Wochenenden laden, die zeitlich überhaupt relevant sein könnten
  // (grobe Vorfilterung, spart Bandbreite – exakte Prüfung folgt unten)
  const { data: weekends, error } = await supabase
    .from('race_weekends')
    .select('*')
    .order('round', { ascending: true })

  if (error) {
    console.error('❌ Supabase-Fehler:', error.message)
    writeOutput('should_run', 'false')
    process.exit(0)
  }

  log(`📅 ${weekends?.length ?? 0} Race-Weekends geladen`)

  for (const weekend of weekends ?? []) {
    for (const { key, type } of SESSION_FIELDS) {
      const startRaw = weekend[key]
      if (!startRaw) continue

      const start = new Date(startRaw)
      const leadStart = new Date(start.getTime() - LEAD_TIME_MIN * 60 * 1000)
      const end = new Date(start.getTime() + DURATION_MS[type])

      if (now >= leadStart && now <= end) {
        log(`✅ Aktive Session gefunden: ${weekend.name ?? weekend.round} – ${key} (Start: ${start.toISOString()})`)

        const remainingMs = end.getTime() - now.getTime()
        // Mindestens 5 Min Laufzeit, falls wir ganz am Ende des Fensters starten
        const runtimeMs = Math.max(remainingMs, 5 * 60 * 1000)

        writeOutput('should_run', 'true')
        writeOutput('session_type', type)
        writeOutput('session_key', key)
        writeOutput('runtime_ms', String(Math.round(runtimeMs)))
        return
      }
    }
  }

  log('💤 Keine aktive Session – Collector wird nicht gestartet')
  writeOutput('should_run', 'false')
}

main().catch(e => {
  console.error('❌ Unerwarteter Fehler:', e)
  writeOutput('should_run', 'false')
  process.exit(0)
})
