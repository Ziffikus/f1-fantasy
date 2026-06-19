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
      '--theme-color':   '#E8002D',
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
      '--theme-color':   '#0066ff',
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
      '--theme-color':   '#00aaff',
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
      '--theme-color':   '#0f0f0f',
    }
  },
  {
    id: 'scuderia',
    name: 'Scuderia',
    preview: ['#0d0809', '#DC0000', '#f5f0f0'],
    vars: {
      '--bg-primary':    '#0d0809',
      '--bg-secondary':  '#140b0b',
      '--bg-card':       '#1a0f0f',
      '--bg-elevated':   '#221414',
      '--border':        'rgba(255,255,255,0.07)',
      '--border-accent': 'rgba(220,0,0,0.4)',
      '--text-primary':  '#f5f0f0',
      '--text-secondary':'#997777',
      '--text-muted':    '#553333',
      '--accent':        '#DC0000',
      '--accent-hover':  '#ff1a1a',
      '--accent-dim':    'rgba(220,0,0,0.15)',
      '--theme-color':   '#DC0000',
    }
  },
  {
    id: 'silver-arrow',
    name: 'Silver Arrow',
    preview: ['#080d0d', '#00D2BE', '#e8f5f5'],
    vars: {
      '--bg-primary':    '#080d0d',
      '--bg-secondary':  '#0d1414',
      '--bg-card':       '#121c1c',
      '--bg-elevated':   '#172424',
      '--border':        'rgba(0,210,190,0.1)',
      '--border-accent': 'rgba(0,210,190,0.4)',
      '--text-primary':  '#e8f5f5',
      '--text-secondary':'#4a8888',
      '--text-muted':    '#2a5555',
      '--accent':        '#00D2BE',
      '--accent-hover':  '#00f0d8',
      '--accent-dim':    'rgba(0,210,190,0.15)',
      '--theme-color':   '#00D2BE',
    }
  },
  {
    id: 'papaya',
    name: 'Papaya',
    preview: ['#0d0a07', '#FF8000', '#f5f0e8'],
    vars: {
      '--bg-primary':    '#0d0a07',
      '--bg-secondary':  '#14100a',
      '--bg-card':       '#1c1610',
      '--bg-elevated':   '#241c14',
      '--border':        'rgba(255,255,255,0.07)',
      '--border-accent': 'rgba(255,128,0,0.4)',
      '--text-primary':  '#f5f0e8',
      '--text-secondary':'#997744',
      '--text-muted':    '#554422',
      '--accent':        '#FF8000',
      '--accent-hover':  '#ff9933',
      '--accent-dim':    'rgba(255,128,0,0.15)',
      '--theme-color':   '#FF8000',
    }
  },
  {
    id: 'racing-green',
    name: 'Racing Green',
    preview: ['#060d08', '#00C853', '#e8f5ec'],
    vars: {
      '--bg-primary':    '#060d08',
      '--bg-secondary':  '#0a1410',
      '--bg-card':       '#0f1c14',
      '--bg-elevated':   '#14241a',
      '--border':        'rgba(0,200,83,0.1)',
      '--border-accent': 'rgba(0,200,83,0.4)',
      '--text-primary':  '#e8f5ec',
      '--text-secondary':'#448866',
      '--text-muted':    '#225533',
      '--accent':        '#00C853',
      '--accent-hover':  '#33d970',
      '--accent-dim':    'rgba(0,200,83,0.15)',
      '--theme-color':   '#00C853',
    }
  },
  {
    id: 'ultraviolet',
    name: 'Ultraviolet',
    preview: ['#09080f', '#7c3aed', '#ede8f5'],
    vars: {
      '--bg-primary':    '#09080f',
      '--bg-secondary':  '#100f18',
      '--bg-card':       '#161524',
      '--bg-elevated':   '#1e1c30',
      '--border':        'rgba(124,58,237,0.12)',
      '--border-accent': 'rgba(124,58,237,0.4)',
      '--text-primary':  '#ede8f5',
      '--text-secondary':'#7766aa',
      '--text-muted':    '#443366',
      '--accent':        '#7c3aed',
      '--accent-hover':  '#9d5ff5',
      '--accent-dim':    'rgba(124,58,237,0.15)',
      '--theme-color':   '#7c3aed',
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

// Setzt das <meta name="theme-color"> Tag dynamisch –
// steuert die Statusleisten-/Adressleistenfarbe im Browser
function applyThemeColor(vars) {
  const color = vars['--theme-color']
  if (!color) return
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', color)
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
    applyThemeColor(theme.vars)
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
