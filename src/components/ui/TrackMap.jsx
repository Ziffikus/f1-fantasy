import './TrackMap.css'

// ── Streckenname → Dateiname in public/tracks/ ─────────────────
// WICHTIG: NICHT mehr über die Rundennummer mappen! Die Reihenfolge/Anzahl
// der Rennen ändert sich jede Saison (z.B. Bahrain/Saudi-Arabien 2026 raus,
// dadurch Verschiebung aller folgenden Runden) – das hat genau zu falsch
// zugeordneten Bildern geführt. Stattdessen über Schlüsselwörter aus dem
// Streckennamen (circuit-Spalte), die saisonübergreifend stabil sind.
const TRACK_KEYWORDS = [
  { keys: ['albert park'],                            file: 'australia' },
  { keys: ['shanghai'],                                file: 'china' },
  { keys: ['suzuka'],                                  file: 'japan' },
  { keys: ['bahrain international'],                   file: 'bahrain' },
  { keys: ['jeddah'],                                  file: 'saudi' },
  { keys: ['miami'],                                   file: 'miami' },
  { keys: ['gilles villeneuve'],                       file: 'canada' },
  { keys: ['monaco'],                                  file: 'monaco' },
  { keys: ['barcelona', 'catalunya'],                  file: 'barcelona' },
  { keys: ['red bull ring', 'spielberg'],              file: 'austria' },
  { keys: ['silverstone'],                             file: 'britain' },
  { keys: ['spa-francorchamps', 'spa francorchamps'],  file: 'belgium' },
  { keys: ['hungaroring'],                             file: 'hungary' },
  { keys: ['zandvoort'],                               file: 'netherlands' },
  { keys: ['monza'],                                   file: 'italy' },
  { keys: ['madrid'],                                  file: 'madrid' },
  { keys: ['baku'],                                    file: 'azerbaijan' },
  { keys: ['marina bay'],                              file: 'singapore' },
  { keys: ['americas', 'cota'],                        file: 'usa' },
  { keys: ['hermanos rodriguez', 'hermanos rodríguez'],file: 'mexico' },
  { keys: ['carlos pace', 'interlagos'],                file: 'brazil' },
  { keys: ['las vegas'],                               file: 'lasvegas' },
  { keys: ['lusail'],                                  file: 'qatar' },
  { keys: ['yas marina'],                              file: 'abudhabi' },
]

// Fallback über Land – nur für Länder mit genau EINEM Rennen pro Saison.
// Spanien (Barcelona + Madrid) und USA (Miami + COTA + Las Vegas) bewusst
// ausgeschlossen, da dort der Streckenname zur Unterscheidung nötig ist.
const COUNTRY_FALLBACK = {
  australia: 'australia',
  china: 'china',
  japan: 'japan',
  bahrain: 'bahrain',
  canada: 'canada',
  monaco: 'monaco',
  austria: 'austria',
  'united kingdom': 'britain',
  belgium: 'belgium',
  hungary: 'hungary',
  netherlands: 'netherlands',
  italy: 'italy',
  azerbaijan: 'azerbaijan',
  singapore: 'singapore',
  mexico: 'mexico',
  brazil: 'brazil',
  qatar: 'qatar',
  uae: 'abudhabi',
  'united arab emirates': 'abudhabi',
  'saudi arabia': 'saudi',
}

// Letzter Notfall-Fallback, falls weder circuit noch country übergeben werden
// (z.B. alter Aufrufer-Code) – Stand Kalender 2026, 22 Runden.
const ROUND_FALLBACK_2026 = {
  1: 'australia', 2: 'china',     3: 'japan',     4: 'miami',      5: 'canada',
  6: 'monaco',    7: 'barcelona', 8: 'austria',   9: 'britain',    10: 'belgium',
  11: 'hungary',  12: 'netherlands', 13: 'italy', 14: 'madrid',    15: 'azerbaijan',
  16: 'singapore', 17: 'usa',     18: 'mexico',   19: 'brazil',    20: 'lasvegas',
  21: 'qatar',    22: 'abudhabi',
}

function resolveFilename({ circuit, country, round }) {
  if (circuit) {
    const c = circuit.toLowerCase()
    const hit = TRACK_KEYWORDS.find(({ keys }) => keys.some(k => c.includes(k)))
    if (hit) return hit.file
  }
  if (country) {
    const hit = COUNTRY_FALLBACK[country.toLowerCase()]
    if (hit) return hit
  }
  if (round != null) return ROUND_FALLBACK_2026[round] ?? null
  return null
}

export default function TrackMap({ round, circuit, country, size = 'md', className = '' }) {
  const filename = resolveFilename({ circuit, country, round })
  if (!filename) return null

  const src = `${import.meta.env.BASE_URL}tracks/${filename}.svg`

  return (
    <div className={`track-map track-map--${size} ${className}`}>
      <img
        src={src}
        alt={`Streckenkarte ${circuit ?? country ?? `Runde ${round}`}`}
        className="track-map-img"
        loading="lazy"
        onError={e => { e.currentTarget.style.display = 'none' }}
      />
    </div>
  )
}
