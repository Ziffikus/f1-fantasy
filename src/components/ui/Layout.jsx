import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import {
  LayoutDashboard,
  Trophy,
  Shuffle,
  Calendar,
  User,
  Users,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  Flag,
  BookOpen,
  History
} from 'lucide-react'
import './Layout.css'

const NAV_ITEMS = [
  { to: '/',          label: 'Dashboard',  icon: LayoutDashboard, exact: true },
  { to: '/wertung',   label: 'Wertung',    icon: Trophy },
  { to: '/draft',     label: 'Draft',      icon: Shuffle },
  { to: '/kalender',  label: 'Kalender',   icon: Calendar },
  { to: '/fahrer',    label: 'Fahrer',     icon: Users },
  { to: '/profil',    label: 'Profil',     icon: User },
  { to: '/regeln',    label: 'Regeln',     icon: BookOpen },
  { to: '/historie',  label: 'Historie',   icon: History },
]

export default function Layout() {
  const { profile, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      {/* ── Sidebar (Desktop) / Drawer (Mobile) ── */}
      <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <Flag size={18} className="sidebar-logo-icon" />
          <span className="sidebar-logo-text">
            <span className="text-accent">F1</span> TBE
          </span>
          <span className="sidebar-logo-year">2026</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`
              }
              onClick={() => setMobileOpen(false)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {profile?.is_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `sidebar-link sidebar-link--admin ${isActive ? 'sidebar-link--active' : ''}`
              }
              onClick={() => setMobileOpen(false)}
            >
              <ShieldCheck size={18} />
              <span>Admin</span>
            </NavLink>
          )}
        </nav>

        {/* Bottom: User + Actions */}
        <div className="sidebar-bottom">
          {/* Avatar + Name */}
          <NavLink to="/profil" className="sidebar-user" onClick={() => setMobileOpen(false)}>
            <div className="sidebar-avatar">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt={profile.display_name} />
                : <span>{profile?.display_name?.[0]?.toUpperCase() ?? '?'}</span>
              }
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{profile?.display_name ?? '–'}</span>
              {profile?.is_admin && <span className="sidebar-user-role">Admin</span>}
            </div>
          </NavLink>

          {/* Theme + Logout */}
          <div className="sidebar-actions">
            <button
              className="sidebar-action-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Hell-Modus' : 'Dunkel-Modus'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="sidebar-action-btn sidebar-action-btn--logout"
              onClick={handleLogout}
              title="Abmelden"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Main Content ── */}
      <div className="layout-main">
        {/* Mobile Header */}
        <header className="layout-mobile-header">
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileOpen(v => !v)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <span className="layout-mobile-logo">
            <span className="text-accent">F1</span> TBE
          </span>
          <button
            className="mobile-theme-btn"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        {/* Page content */}
        <main className="layout-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
