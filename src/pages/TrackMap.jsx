import './TrackMap.css'

// Mapping: race_weekend slug → Dateiname in public/tracks/
const TRACK_MAP = {
  // Round → filename
  1:  'australia',
  2:  'china',
  3:  'japan',
  4:  'bahrain',
  5:  'saudi',
  6:  'miami',
  7:  'canada',
  8:  'monaco',
  9:  'barcelona',
  10: 'austria',
  11: 'britain',
  12: 'belgium',
  13: 'hungary',
  14: 'netherlands',
  15: 'italy',
  16: 'madrid',
  17: 'azerbaijan',
  18: 'singapore',
  19: 'usa',
  20: 'mexico',
  21: 'brazil',
  22: 'lasvegas',
  23: 'qatar',
  24: 'abudhabi',
}

export default function TrackMap({ round, size = 'md', className = '' }) {
  const filename = TRACK_MAP[round]
  if (!filename) return null

  const src = `${import.meta.env.BASE_URL}tracks/${filename}.svg`

  return (
    <div className={`track-map track-map--${size} ${className}`}>
      <img
        src={src}
        alt={`Streckenkarte Runde ${round}`}
        className="track-map-img"
        loading="lazy"
        onError={e => { e.currentTarget.style.display = 'none' }}
      />
    </div>
  )
}
