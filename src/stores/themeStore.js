import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// ============================================================
// Preset Themes
// ============================================================
export const PRESET_THEMES = [
  {
    id: 'classic-dark',
    name: 'Classic Dark',
    preview: ['#0a0a0f', '#E8002D', '#f0f0f5'],
    vars: {
      '--bg-primary':    '#0a0a0f',
      '--bg-secondary':  '#111118',
      '--bg-card':       '#16161f',
      '--bg-elevated':   '#1e1e2a',
      '--border':        'rgba(255,255,255,0.08)',
      '--border-accent': 'rgba(232,0,45,0.4)',
      '--text-primary':  '#f0f0f5',
      '--text-secondary':'#8888a0',
      '--text-muted':    '#55556a',
      '--accent':        '#E8002D',
      '--accent-hover':  '#ff1a42',
      '--accent-dim':    'rgba(232,0,45,0.15)',
    }
  },
  {
    id: 'sky-sports',
    name: 'Sky Sports',
    preview: ['#0d0f14', '#0066ff', '#e8eaf0'],
    vars: {
      '--bg-primary':    '#0d0f14',
      '--bg-secondary':  '#111318',
      '--bg-card':       '#1a1e28',
      '--bg-elevated':   '#1e2433',
      '--border':        'rgba(255,255,255,0.08)',
      '--border-accent': 'rgba(0,102,255,0.4)',
      '--text-primary':  '#e8eaf0',
      '--text-secondary':'#6688aa',
      '--text-muted':    '#3a4a5a',
      '--accent':        '#0066ff',
      '--accent-hover':  '#3385ff',
      '--accent-dim':    'rgba(0,102,255,0.15)',
    }
  },
  {
    id: 'midnight-navy',
    name: 'Midnight Navy',
    preview: ['#090d14', '#00aaff', '#ddeeff'],
    vars: {
      '--bg-primary':    '#090d14',
      '--bg-secondary':  '#0e1420',
      '--bg-card':       '#151c2e',
      '--bg-elevated':   '#1a2238',
      '--border':        'rgba(0,170,255,0.1)',
      '--border-accent': 'rgba(0,170,255,0.4)',
      '--text-primary':  '#ddeeff',
      '--text-secondary':'#4d88aa',
      '--text-muted':    '#2a4466',
      '--accent':        '#00aaff',
      '--accent-hover':  '#33bbff',
      '--accent-dim':    'rgba(0,170,255,0.15)',
    }
  },
  {
    id: 'carbon',
    name: 'Carbon',
    preview: ['#0f0f0f', '#f0f0f0', '#888888'],
    vars: {
      '--bg-primary':    '#0f0f0f',
      '--bg-secondary':  '#141414',
      '--bg-card':       '#1a1a1a',
      '--bg-elevated':   '#222222',
      '--border':        'rgba(255,255,255,0.07)',
      '--border-accent': 'rgba(240,240,240,0.3)',
      '--text-primary':  '#f0f0f0',
      '--text-secondary':'#888888',
      '--text-muted':    '#444444',
      '--accent':        '#f0f0f0',
      '--accent-hover':  '#ffffff',
      '--accent-dim':    'rgba(240,240,240,0.1)',
    }
  },
]

export const DEFAULT_DARK_THEME_ID  = 'classic-dark'
export const DEFAULT_LIGHT_THEME_ID = 'sky-sports'

// ============================================================
// Helpers
// ============================================================
function applyVars(vars) {
  const root = document.documentElement
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
}

function getPreset(id) {
  return PRESET_THEMES.find(p => p.id === id) ?? PRESET_THEMES[0]
}

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem('f1_theme_config') ?? 'null')
  } catch { return null }
}

function saveLocal(config) {
  localStorage.setItem('f1_theme_config', JSON.stringify(config))
}

// ============================================================
// Store
// ============================================================
export const useThemeStore = create((set, get) => ({
  // 'dark' | 'light'
  mode: 'dark',

  // ID eines Presets oder 'custom:<name>'
  darkThemeId:  DEFAULT_DARK_THEME_ID,
  lightThemeId: DEFAULT_LIGHT_THEME_ID,

  // Vom User gespeicherte eigene Themes [{id, name, preview, vars}]
  customThemes: [],

  // ── init ──────────────────────────────────────────────────
  init: async (userId) => {
    // 1. Systempräferenz / gespeicherter Modus
    const local = loadLocal()
    const savedMode = local?.mode
      ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

    // 2. Supabase laden (falls eingeloggt)
    let darkThemeId  = local?.darkThemeId  ?? DEFAULT_DARK_THEME_ID
    let lightThemeId = local?.lightThemeId ?? DEFAULT_LIGHT_THEME_ID
    let customThemes = local?.customThemes ?? []

    if (userId) {
      const { data } = await supabase
        .from('user_themes')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (data) {
        darkThemeId  = data.dark_theme?.id  ?? darkThemeId
        lightThemeId = data.light_theme?.id ?? lightThemeId
        customThemes = data.custom_themes   ?? []
      }
    }

    set({ mode: savedMode, darkThemeId, lightThemeId, customThemes })
    get()._apply(savedMode, darkThemeId, lightThemeId, customThemes)
  },

  // ── toggle dark/light ─────────────────────────────────────
  toggleTheme: () => {
    const { mode, darkThemeId, lightThemeId, customThemes } = get()
    const next = mode === 'dark' ? 'light' : 'dark'
    set({ mode: next })
    get()._apply(next, darkThemeId, lightThemeId, customThemes)
    get()._saveLocal()
  },

  // ── setze Dark-Theme ──────────────────────────────────────
  setDarkTheme: async (themeId, userId) => {
    set({ darkThemeId: themeId })
    const { mode, lightThemeId, customThemes } = get()
    if (mode === 'dark') get()._apply('dark', themeId, lightThemeId, customThemes)
    get()._saveLocal()
    await get()._saveSupabase(userId)
  },

  // ── setze Light-Theme ─────────────────────────────────────
  setLightTheme: async (themeId, userId) => {
    set({ lightThemeId: themeId })
    const { mode, darkThemeId, customThemes } = get()
    if (mode === 'light') get()._apply('light', darkThemeId, themeId, customThemes)
    get()._saveLocal()
    await get()._saveSupabase(userId)
  },

  // ── Custom Theme speichern ────────────────────────────────
  saveCustomTheme: async (theme, userId) => {
    const { customThemes } = get()
    const existing = customThemes.findIndex(t => t.id === theme.id)
    const next = existing >= 0
      ? customThemes.map((t, i) => i === existing ? theme : t)
      : [...customThemes, theme]
    set({ customThemes: next })
    get()._saveLocal()
    await get()._saveSupabase(userId)
  },

  // ── Custom Theme löschen ──────────────────────────────────
  deleteCustomTheme: async (themeId, userId) => {
    const { customThemes } = get()
    set({ customThemes: customThemes.filter(t => t.id !== themeId) })
    get()._saveLocal()
    await get()._saveSupabase(userId)
  },

  // ── intern: CSS-Variablen anwenden ────────────────────────
  _apply: (mode, darkThemeId, lightThemeId, customThemes) => {
    const activeId = mode === 'dark' ? darkThemeId : lightThemeId
    const all = [...PRESET_THEMES, ...customThemes]
    const theme = all.find(t => t.id === activeId) ?? PRESET_THEMES[0]
    document.documentElement.setAttribute('data-theme', mode)
    applyVars(theme.vars)
  },

  // ── intern: localStorage ──────────────────────────────────
  _saveLocal: () => {
    const { mode, darkThemeId, lightThemeId, customThemes } = get()
    saveLocal({ mode, darkThemeId, lightThemeId, customThemes })
  },

  // ── intern: Supabase upsert ───────────────────────────────
  _saveSupabase: async (userId) => {
    if (!userId) return
    const { darkThemeId, lightThemeId, customThemes } = get()
    const all = [...PRESET_THEMES, ...customThemes]
    const darkTheme  = all.find(t => t.id === darkThemeId)  ?? PRESET_THEMES[0]
    const lightTheme = all.find(t => t.id === lightThemeId) ?? PRESET_THEMES[1]

    await supabase.from('user_themes').upsert({
      user_id:       userId,
      dark_theme:    { id: darkThemeId,  vars: darkTheme.vars  },
      light_theme:   { id: lightThemeId, vars: lightTheme.vars },
      custom_themes: customThemes,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'user_id' })
  },
}))
