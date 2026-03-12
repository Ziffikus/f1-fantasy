import { useEffect } from 'react'
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

// Layout
import Layout from './components/ui/Layout'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><div className="spinner" /></div>
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
