import './RulesPage.css'

const RULES = [
  {
    icon: '🏎️',
    title: 'Das Konzept',
    content: `Jede Woche vor dem Rennwochenende wählen alle vier Spieler (Alex, Andi, Mandi, Ferk) Fahrer und Konstrukteure für ihr Fantasy-Team. Wer am Ende der Saison die wenigsten Punkte hat, gewinnt – denn die Punktevergabe orientiert sich an den echten Rennpositionen.`,
  },
  {
    icon: '📋',
    title: 'Der Draft',
    content: `Vor jedem Rennwochenende findet ein neuer Draft statt. Jeder Spieler wählt abwechselnd (Round-Robin) seine Picks:
• 4 Fahrer pro Spieler
• 2 Konstrukteure pro Spieler
Jeder Fahrer und jedes Team kann pro Rennwochenende nur einmal gepickt werden – d.h. jeder Spieler bekommt unterschiedliche Fahrer.`,
  },
  {
    icon: '🔄',
    title: 'Draft-Reihenfolge',
    content: `Die Reihenfolge im Draft richtet sich nach den Ergebnissen des letzten Rennwochenendes:
• Wer im letzten Rennen die wenigsten Punkte hatte, darf zuerst picken.
• Bei Gleichstand entscheidet der Saisongesamtstand – wer weniger Gesamtpunkte hat, ist zuerst dran.
Beim allerersten Rennen der Saison wird die Reihenfolge vom Admin festgelegt.`,
  },
  {
    icon: '🏁',
    title: 'Punktevergabe – Rennen',
    content: `Die Punkte entsprechen direkt der Endposition im Rennen:
• P1 = 1 Punkt
• P2 = 2 Punkte
• P3 = 3 Punkte
• … und so weiter bis P22 = 22 Punkte

Für Konstrukteure werden die Positionen beider Teamfahrer addiert.
Niedrigere Punktzahl ist besser!`,
  },
  {
    icon: '⚡',
    title: 'Punktevergabe – Sprint',
    content: `Bei Sprint-Wochenenden gibt es zusätzliche Punkte für das Sprint-Rennen. Diese werden halbiert und aufgerundet:
• P1 Sprint = 1 Punkt (aufgerundet)
• P2 Sprint = 1 Punkt
• P3 Sprint = 2 Punkte
• … usw.

Sprint-Punkte werden zu den Rennen-Punkten addiert.`,
  },
  {
    icon: '❌',
    title: 'Nicht-Starter & Ausfälle',
    content: `Fahrer, die nicht am Rennen teilnehmen oder nicht klassifiziert werden (DNS, DNF, DSQ), erhalten automatisch 22 Punkte – die schlechtmögliche Wertung.

Das gilt sowohl für das Hauptrennen als auch für Sprint-Rennen (dort entsprechend 11 Punkte, da halbiert).`,
  },
  {
    icon: '📅',
    title: 'Sprint-Wochenenden 2026',
    content: `In der Saison 2026 gibt es 6 Sprint-Wochenenden:
• Runde 2 – China 🇨🇳
• Runde 6 – Miami 🇺🇸
• Runde 7 – Kanada 🇨🇦
• Runde 11 – Großbritannien 🇬🇧
• Runde 14 – Niederlande 🇳🇱
• Runde 18 – Singapur 🇸🇬`,
  },
  {
    icon: '🏆',
    title: 'Saisonwertung & Tiebreaker',
    content: `Am Ende der Saison gewinnt, wer die wenigsten Gesamtpunkte angesammelt hat.

Bei Punktegleichstand entscheidet:
1. Meiste Rennwochenend-Siege (wenigste Punkte in einem Wochenende)
2. Meiste zweite Plätze
3. Meiste dritte Plätze`,
  },
]

export default function RulesPage() {
  return (
    <div className="rules-root">
      <h1 className="rules-title">Regeln</h1>
      <p className="rules-subtitle">F1 Fantasy TBE · Saison 2026</p>

      <div className="rules-list">
        {RULES.map((rule, i) => (
          <div key={i} className="rules-card card">
            <div className="rules-card-header">
              <span className="rules-icon">{rule.icon}</span>
              <h2 className="rules-card-title">{rule.title}</h2>
            </div>
            <div className="rules-card-body">
              {rule.content.split('\n').map((line, j) =>
                line.startsWith('•') ? (
                  <div key={j} className="rules-bullet">
                    <span className="rules-bullet-dot" />
                    <span>{line.slice(1).trim()}</span>
                  </div>
                ) : line.trim() === '' ? (
                  <div key={j} style={{ height: '0.5rem' }} />
                ) : (
                  <p key={j} className="rules-text">{line}</p>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
