import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import './LoginPage.css'

export default function LoginPage() {
  const { user, login, loading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
    } catch (err) {
      setError('E-Mail oder Passwort falsch.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-root">
      {/* Animierter Hintergrund */}
      <div className="login-bg">
        <div className="login-bg-stripe" />
        <div className="login-bg-grid" />
        <div className="login-bg-glow" />
      </div>

      <div className="login-card">
        {/* Logo / Header */}
        <div className="login-header">
          <div className="login-logo">
            <span className="login-logo-f1">F1</span>
            <span className="login-logo-sep" />
            <span className="login-logo-tbe">TBE</span>
          </div>
          <div className="login-season">FANTASY LIGA · SAISON 2026</div>
        </div>

        {/* Formular */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label className="login-label">E-Mail</label>
            <input
              className="input login-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="deine@email.com"
              required
              autoFocus
            />
          </div>

          <div className="login-field">
            <label className="login-label">Passwort</label>
            <input
              className="input login-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="login-error">
              <span>⚠</span> {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={submitting}
          >
            {submitting ? (
              <><span className="spinner" style={{ width: '1rem', height: '1rem' }} /> Einloggen…</>
            ) : (
              <>Einloggen</>
            )}
          </button>
        </form>


      </div>

      {/* Decorative lap counter */}
      <div className="login-deco">
        <span>RUNDE</span>
        <span className="login-deco-num">01</span>
        <span>VON 24</span>
      </div>
    </div>
  )
}
