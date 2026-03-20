import { useState } from 'react'
import { Gamepad2, ArrowLeft } from 'lucide-react'
import ArcadeRacing from '../components/games/ArcadeRacing'
import './GamingPage.css'

const GAMES = [
  {
    id: 'arcade_racing',
    title: 'Arcade Racing',
    subtitle: 'Monaco · 3 Runden',
    emoji: '🏎️',
    description: 'Steuere einen F1-Boliden durch Monaco. Schnellste Runde gewinnt die Krone!',
    component: ArcadeRacing,
  },
  // Zukünftige Spiele hier eintragen
]

export default function GamingPage() {
  const [activeGame, setActiveGame] = useState(null)

  const game = GAMES.find(g => g.id === activeGame)
  const GameComponent = game?.component

  if (activeGame && GameComponent) {
    return (
      <div className="gaming-root">
        <div className="gaming-game-header">
          <button className="btn btn-secondary gaming-back" onClick={() => setActiveGame(null)}>
            <ArrowLeft size={14} /> Zurück
          </button>
          <h1 className="gaming-title">{game.emoji} {game.title}</h1>
        </div>
        <GameComponent onClose={() => setActiveGame(null)} />
      </div>
    )
  }

  return (
    <div className="gaming-root">
      <div className="gaming-header">
        <Gamepad2 size={22} className="text-accent" />
        <div>
          <h1 className="gaming-title">Gaming</h1>
          <p className="gaming-subtitle">Spiele & Highscores</p>
        </div>
      </div>

      <div className="gaming-grid">
        {GAMES.map(g => (
          <div key={g.id} className="gaming-card card" onClick={() => setActiveGame(g.id)}>
            <div className="gaming-card-emoji">{g.emoji}</div>
            <div className="gaming-card-info">
              <div className="gaming-card-title">{g.title}</div>
              <div className="gaming-card-sub">{g.subtitle}</div>
              <p className="gaming-card-desc">{g.description}</p>
            </div>
            <button className="btn btn-primary gaming-card-btn">Spielen</button>
          </div>
        ))}

        {/* Coming soon placeholder */}
        <div className="gaming-card gaming-card--soon card">
          <div className="gaming-card-emoji">🎯</div>
          <div className="gaming-card-info">
            <div className="gaming-card-title">Fahrer Quiz</div>
            <div className="gaming-card-sub">Demnächst</div>
            <p className="gaming-card-desc">Wie gut kennst du die F1-Fahrer? Rate Zeiten, Strecken und Stats.</p>
          </div>
          <button className="btn btn-secondary gaming-card-btn" disabled>Bald</button>
        </div>
      </div>
    </div>
  )
}
