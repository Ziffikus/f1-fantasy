import { useState } from 'react'
import { Gamepad2, ArrowLeft } from 'lucide-react'
import ArcadeRace from '../components/games/ArcadeRace'
import { useRaceWeekends, useCountdown } from '../hooks/useRaceWeekends'
import './GamingPage.css'

const GAMES = [
  {
    id: 'arcade_race_new',
    title: 'ARCADE RACE',
    subtitle: '',
    emoji: '🏎️',
    description: '',
    component: ArcadeRace,
    beta: true,
  },
]

function RaceCountdown({ weekend }) {
  const t = useCountdown(weekend.race_start)
  if (!t || t.over) return null
  const pad = n => String(n).padStart(2, '0')
  return (
    <div className="gaming-countdown card">
      <div className="gaming-countdown-label">
        {weekend.flag_emoji} <strong>{weekend.name}</strong>
        {weekend.is_sprint_weekend && <span className="badge badge-sprint" style={{marginLeft:'0.4rem'}}>Sprint</span>}
      </div>
      <div className="gaming-countdown-sub">Rennstart</div>
      <div className="gaming-countdown-timer">
        {[['Tage', t.days], ['Std', pad(t.hours)], ['Min', pad(t.minutes)], ['Sek', pad(t.seconds)]].map(([label, val], i, arr) => (
          <>
            <div key={label} className="gaming-countdown-unit">
              <span className="gaming-countdown-value">{val}</span>
              <span className="gaming-countdown-unit-label">{label}</span>
            </div>
            {i < arr.length - 1 && <span className="gaming-countdown-sep">:</span>}
          </>
        ))}
      </div>
      <div className="gaming-countdown-date">
        {new Date(weekend.race_start).toLocaleString('de-AT', {
          weekday: 'long', day: '2-digit', month: 'long',
          hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
        })}
      </div>
    </div>
  )
}

function GameGrid({ games, onSelect }) {
  return (
    <div className="gaming-grid">
      {games.map(g => (
        <div key={g.id} className="gaming-card card" onClick={() => onSelect(g.id)}>
          <div className="gaming-card-emoji">{g.emoji}</div>
          <div className="gaming-card-info">
            <div className="gaming-card-title">
              {g.title}
              {g.beta && (
                <span style={{
                  marginLeft: '0.4rem',
                  fontSize: '0.55rem',
                  fontWeight: 900,
                  letterSpacing: '0.1em',
                  background: 'rgba(232,0,45,0.85)',
                  color: '#fff',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  verticalAlign: 'middle',
                }}>BETA</span>
              )}
            </div>
            {g.subtitle && <div className="gaming-card-sub">{g.subtitle}</div>}
            {g.description && <p className="gaming-card-desc">{g.description}</p>}
          </div>
          <button className="btn btn-primary gaming-card-btn">Spielen</button>
        </div>
      ))}

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
  )
}

export default function GamingPage() {
  const [activeGame, setActiveGame] = useState(null)
  const { nextWeekend } = useRaceWeekends()

  const game          = GAMES.find(g => g.id === activeGame)
  const GameComponent = game?.component

  // ── Aktives Spiel ──────────────────────────────────────────────────────────
  if (activeGame && GameComponent) {
    return (
      <div className="gaming-root">
        <div className="gaming-game-header">
          <button className="btn btn-secondary gaming-back" onClick={() => setActiveGame(null)}>
            <ArrowLeft size={14} /> Zurück
          </button>
          <h1 className="gaming-title">
            {game.emoji} {game.title}
            {game.beta && (
              <span className="badge badge-beta" style={{marginLeft:'0.5rem',fontSize:'0.55rem',verticalAlign:'middle'}}>BETA</span>
            )}
          </h1>
        </div>
        <GameComponent onClose={() => setActiveGame(null)} />
      </div>
    )
  }

  // ── Übersicht ──────────────────────────────────────────────────────────────
  return (
    <div className="gaming-root">
      <div className="gaming-header">
        <Gamepad2 size={22} className="text-accent" />
        <div>
          <h1 className="gaming-title">Gaming</h1>
          <p className="gaming-subtitle">Spiele & Highscores</p>
        </div>
      </div>

      {nextWeekend && <RaceCountdown weekend={nextWeekend} />}

      <GameGrid games={GAMES} onSelect={setActiveGame} />
    </div>
  )
}
