// Fehlerbanner für die Punkteberechnung (z. B. Team mit mehr als 2 gewerteten Fahrern)
export default function PointsError({ errors = [] }) {
  const messages = [...new Set(errors.filter(Boolean))]
  if (!messages.length) return null
  return (
    <div
      role="alert"
      style={{
        gridColumn: '1 / -1',
        padding: '0.75rem 1rem',
        borderRadius: 8,
        border: '1px solid var(--danger, #e10600)',
        color: 'var(--danger, #e10600)',
        background: 'color-mix(in srgb, var(--danger, #e10600) 10%, transparent)',
        fontSize: '0.875rem',
      }}
    >
      <strong>⚠️ Punkteberechnung fehlerhaft – Wertung unvollständig</strong>
      {messages.map((m, i) => <div key={i}>{m}</div>)}
    </div>
  )
}
