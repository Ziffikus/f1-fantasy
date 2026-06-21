/**
 * F1Tire — drehender F1-Reifen als Ersatz für den generischen .spinner
 * Nutzung: <F1Tire /> oder <F1Tire size={48} />
 */
export default function F1Tire({ size = 24, className = '' }) {
  return (
    <svg
      className={`f1-tire ${className}`}
      width={size}
      height={size}
      viewBox="0 0 72 72"
      role="img"
      aria-label="Lädt"
    >
      <g className="f1-tire-rotor">
        <circle cx="36" cy="36" r="35" fill="#0a0a0f" />
        <circle
          cx="36" cy="36" r="29"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeDasharray="53 38.2"
          strokeLinecap="round"
        />
        <circle cx="36" cy="36" r="25" fill="#0a0a0f" />
        <g stroke="#9a9aa8" strokeWidth="2.2" strokeLinecap="round">
          <line x1="36" y1="36" x2="36" y2="15" />
          <line x1="36" y1="36" x2="55.2" y2="28.4" />
          <line x1="36" y1="36" x2="48.9" y2="50.7" />
          <line x1="36" y1="36" x2="23.1" y2="50.7" />
          <line x1="36" y1="36" x2="16.8" y2="28.4" />
        </g>
        <circle cx="36" cy="36" r="6.5" fill="#c8c8d2" />
        <circle cx="36" cy="36" r="2.4" fill="#0a0a0f" />
      </g>
    </svg>
  )
}
