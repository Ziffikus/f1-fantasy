import { useState, useRef } from 'react'
import './TriggerRally.css'

const TRIGGER_RALLY_URL = 'https://codeartemis.github.io/TriggerRally/server/public/'

export default function TriggerRally({ onClose }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const iframeRef = useRef(null)

  return (
    <div className="tr-root">
      {/* Loading-Overlay */}
      {!loaded && !error && (
        <div className="tr-loading">
          <div className="tr-loading-spinner" />
          <p className="tr-loading-text">Trigger Rally wird geladen…</p>
          <p className="tr-loading-sub">WebGL · Three.js</p>
        </div>
      )}

      {/* Error-Overlay */}
      {error && (
        <div className="tr-error">
          <div className="tr-error-icon">⚠️</div>
          <p className="tr-error-title">Spiel konnte nicht geladen werden</p>
          <p className="tr-error-sub">triggerrally.com ist möglicherweise nicht erreichbar.</p>
          <a
            href={TRIGGER_RALLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary tr-error-btn"
          >
            Im neuen Tab öffnen ↗
          </a>
        </div>
      )}

      {/* Game iframe */}
      <iframe
        ref={iframeRef}
        src={TRIGGER_RALLY_URL}
        title="Trigger Rally"
        className={`tr-iframe ${loaded ? 'tr-iframe--visible' : ''}`}
        allow="autoplay; fullscreen"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />

      {/* Fullscreen-Hint (nur wenn geladen) */}
      {loaded && (
        <div className="tr-hint-bar">
          <span className="tr-hint">🖱️ Klick ins Spiel · <kbd>↑↓←→</kbd> Lenken · <kbd>Z</kbd> Gas · <kbd>X</kbd> Bremse</span>
          <button
            className="tr-fullscreen-btn"
            onClick={() => iframeRef.current?.requestFullscreen?.()}
            title="Vollbild"
          >
            ⛶ Vollbild
          </button>
        </div>
      )}
    </div>
  )
}
