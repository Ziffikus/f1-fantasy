import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'

// Pages (lazy loaded für bessere Performance)
import { lazy, Suspense } from 'react'
const LoginPage       = lazy(() => import('./pages/LoginPage'))
const DashboardPage   = lazy(() => import('./pages/DashboardPage'))
const DraftPage       = lazy(() => import('./pages/DraftPage'))
const StandingsPage   = lazy(() => import('./pages/StandingsPage'))
const RacePage        = lazy(() => import('./pages/RacePage'))
const ProfilePage     = lazy(() => import('./pages/ProfilePage'))
const AdminPage       = lazy(() => import('./pages/AdminPage'))
const CalendarPage    = lazy(() => import('./pages/CalendarPage'))
const DriversPage     = lazy(() => import('./pages/DriversPage'))
const RulesPage         = lazy(() => import('./pages/RulesPage'))
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage'))
const HistoryPage       = lazy(() => import('./pages/HistoryPage'))
const DriverPage        = lazy(() => import('./pages/DriverPage'))
const LivePage          = lazy(() => import('./pages/LivePage'))
const GamingPage        = lazy(() => import('./pages/GamingPage'))

// Layout
import Layout from './components/ui/Layout'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore()
  const [showReload, setShowReload] = useState(false)

  useEffect(() => {
    if (!loading) { setShowReload(false); return }
    const t = setTimeout(() => setShowReload(true), 6000)
    return () => clearTimeout(t)
  }, [loading])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '1rem' }}>
      <div className="spinner" />
      {showReload && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Dauert länger als erwartet…</p>
          <button className="btn btn-secondary" style={{ fontSize: '0.82rem' }} onClick={() => window.location.reload()}>
            Seite neu laden
          </button>
        </div>
      )}
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { profile, loading } = useAuthStore()
  if (loading) return null
  if (!profile?.is_admin) return <Navigate to="/" replace />
  return children
}

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div className="spinner" />
    </div>
  )
}

export default function App() {
  const { init: initAuth } = useAuthStore()
  const { init: initTheme } = useThemeStore()

  useEffect(() => {
    initTheme()
    initAuth()
  }, [])

  return (
    <BrowserRouter basename="/f1-fantasy">
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<DashboardPage />} />
            <Route path="wertung" element={<StandingsPage />} />
            <Route path="draft" element={<DraftPage />} />
            <Route path="kalender" element={<CalendarPage />} />
            <Route path="rennen/:id" element={<RacePage />} />
            <Route path="fahrer" element={<DriversPage />} />
            <Route path="fahrer/:id" element={<DriverPage />} />
            <Route path="live" element={<LivePage />} />
            <Route path="gaming" element={<GamingPage />} />
            <Route path="regeln" element={<RulesPage />} />
            <Route path="spieler/:id" element={<PublicProfilePage />} />
            <Route path="historie" element={<HistoryPage />} />
            <Route path="profil" element={<ProfilePage />} />
            <Route path="admin" element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
