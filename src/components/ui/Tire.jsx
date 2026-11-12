/**
 * F1Tire — drehender F1-Reifen als Ersatz für den generischen .spinner
 * Nutzung: <F1Tire /> oder <F1Tire size={48} />
 * Aufbau: weißer Außenrand · Profilblöcke · farbiges Reifenband (Akzentfarbe) · Felge mit 5 Doppelspeichen · Radmutter
 * Animation (index.css): Rotor beschleunigt/bremst pro Umdrehung, helle Bogen-Linie läuft außen um den Reifen, Glow pulsiert.
 */
export default function F1Tire({ size = 24, className = '' }) {
  const spokes = [0, 72, 144, 216, 288]
  return (
    <svg
      className={`f1-tire ${className}`}
      width={size}
      height={size}
      viewBox="0 0 72 72"
      role="img"
      aria-label="Lädt"
    >
      {/* Reifen + dünner weißer Rand */}
      <circle cx="36" cy="36" r="34.4" fill="#0a0a0f" stroke="#ffffff" strokeWidth="1.3" />

      {/* Lichtreflex, der außen um den Reifen läuft */}
      <g className="f1-tire-sweep">
        <circle
          cx="36" cy="36" r="34.4"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="38 178.2"
        />
      </g>

      <g className="f1-tire-rotor">
        {/* Profilblöcke */}
        <circle cx="36" cy="36" r="31" fill="none" stroke="#1d1d28" strokeWidth="4.2" strokeDasharray="2.6 2.1" />
        {/* farbiges Reifenband (wie die Compound-Markierung) */}
        <circle
          cx="36" cy="36" r="26.8"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3.4"
          strokeDasharray="46 22.4"
          strokeLinecap="round"
        />
        {/* Felgenrand */}
        <circle cx="36" cy="36" r="23" fill="#101018" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="0.8" />
        <circle cx="36" cy="36" r="20.5" fill="none" stroke="#2a2a38" strokeWidth="1" />

        {/* Doppelspeichen */}
        <g stroke="#a9a9b8" strokeWidth="2" strokeLinecap="round">
          {spokes.map(a => (
            <g key={a} transform={`rotate(${a} 36 36)`}>
              <line x1="34" y1="29" x2="33" y2="16.5" />
              <line x1="38" y1="29" x2="39" y2="16.5" />
            </g>
          ))}
        </g>

        {/* Nabe + Zentralmutter */}
        <circle cx="36" cy="36" r="7.2" fill="#c8c8d2" stroke="#ffffff" strokeWidth="0.6" />
        <polygon points="36,31.6 39.8,33.8 39.8,38.2 36,40.4 32.2,38.2 32.2,33.8" fill="#0a0a0f" />
        <circle cx="36" cy="36" r="1.6" fill="var(--accent)" />
      </g>
    </svg>
  )
}
