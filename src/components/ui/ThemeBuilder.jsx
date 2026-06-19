import { useState } from 'react'
import { Check, Plus, Trash2, Sun, Moon, Save, X } from 'lucide-react'
import { useThemeStore, PRESET_THEMES } from '../../stores/themeStore'
import { useAuthStore } from '../../stores/authStore'
import './ThemeBuilder.css'

// ── Farb-Felder die der User bearbeiten kann ──────────────────
const COLOR_FIELDS = [
  { key: '--bg-primary',    label: 'Hintergrund' },
  { key: '--bg-secondary',  label: 'BG Sekundär' },
  { key: '--bg-card',       label: 'Card' },
  { key: '--bg-elevated',   label: 'Elevated' },
  { key: '--accent',        label: 'Akzent' },
  { key: '--accent-hover',  label: 'Akzent Hover' },
  { key: '--text-primary',  label: 'Text' },
  { key: '--text-secondary',label: 'Text Sek.' },
  { key: '--text-muted',    label: 'Text Muted' },
  { key: '--theme-color',   label: 'Statusleiste' },
]

function makeId() {
  return 'custom-' + Math.random().toString(36).slice(2, 8)
}

function Preview({ vars }) {
  const bg      = vars['--bg-card']       ?? '#16161f'
  const bgEl    = vars['--bg-elevated']   ?? '#1e1e2a'
  const accent  = vars['--accent']        ?? '#E8002D'
  const textP   = vars['--text-primary']  ?? '#f0f0f5'
  const textS   = vars['--text-secondary']?? '#8888a0'
  const border  = vars['--border']        ?? 'rgba(255,255,255,0.08)'

  return (
    <div className="tb-preview" style={{ background: bg }}>
      <div className="tb-preview-bar" style={{ background: accent }} />
      <div className="tb-preview-body">
        <div className="tb-preview-header" style={{ color: textP }}>
          Hey, <span style={{ color: accent }}>Alex</span>
        </div>
        <div className="tb-preview-cards">
          {[['Punkte','142'],['Platz','#3'],['Live','R22']].map(([l,v],i) => (
            <div key={l} className="tb-preview-card"
              style={{ background: bgEl, borderColor: i===2 ? accent : border }}>
              <div className="tb-preview-card-label"
                style={{ color: i===2 ? accent : textS }}>{l}</div>
              <div className="tb-preview-card-value" style={{ color: textP }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="tb-preview-btn" style={{ background: accent, color: '#fff' }}>
          Einloggen
        </div>
      </div>
    </div>
  )
}

function ThemeCard({ theme, isActive, onSelect, onDelete, editingMode }) {
  const [bg, accent, text] = theme.preview ?? ['#111', '#E8002D', '#fff']
  return (
    <div
      className={`tb-theme-card ${isActive ? 'tb-theme-card--active' : ''}`}
      onClick={() => onSelect(theme.id)}
    >
      <div className="tb-theme-card-preview">
        <div className="tb-theme-card-preview-top" style={{ background: bg }} />
        <div className="tb-theme-card-preview-bottom" style={{ background: accent }} />
      </div>
      <div className="tb-theme-card-info" style={{ color: text }}>{theme.name}</div>
      {isActive && (
        <div className="tb-theme-card-check"><Check size={11} /></div>
      )}
      {onDelete && (
        <button className="tb-theme-card-delete"
          onClick={e => { e.stopPropagation(); onDelete(theme.id) }}>
          <Trash2 size={10} />
        </button>
      )}
    </div>
  )
}

export default function ThemeBuilder() {
  const { user } = useAuthStore()
  const {
    mode, darkThemeId, lightThemeId, customThemes,
    toggleTheme, setDarkTheme, setLightTheme,
    saveCustomTheme, deleteCustomTheme,
  } = useThemeStore()

  // Welchen Modus konfigurieren wir gerade?
  const [editMode, setEditMode] = useState('dark') // 'dark' | 'light'

  // Custom-Editor State
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTheme, setEditingTheme] = useState(null)
  const [saved, setSaved] = useState(false)

  const activeId = editMode === 'dark' ? darkThemeId : lightThemeId
  const allThemes = [...PRESET_THEMES, ...customThemes]

  // ── Theme auswählen ───────────────────────────────────────
  function handleSelect(themeId) {
    if (editMode === 'dark') setDarkTheme(themeId, user?.id)
    else setLightTheme(themeId, user?.id)
  }

  // ── Neues Custom Theme ────────────────────────────────────
  function handleNewTheme() {
    const base = allThemes.find(t => t.id === activeId) ?? PRESET_THEMES[0]
    setEditingTheme({
      id:      makeId(),
      name:    'Mein Theme',
      preview: [...base.preview],
      vars:    { ...base.vars },
      isNew:   true,
    })
    setEditorOpen(true)
  }

  // ── Bestehendes Custom Theme bearbeiten ───────────────────
  function handleEditTheme(theme) {
    setEditingTheme({ ...theme, vars: { ...theme.vars } })
    setEditorOpen(true)
  }

  // ── Farbe ändern ──────────────────────────────────────────
  function handleColorChange(key, value) {
    setEditingTheme(prev => ({
      ...prev,
      vars: { ...prev.vars, [key]: value },
      preview: key === '--bg-primary'
        ? [value, prev.preview[1], prev.preview[2]]
        : key === '--accent'
        ? [prev.preview[0], value, prev.preview[2]]
        : key === '--text-primary'
        ? [prev.preview[0], prev.preview[1], value]
        : prev.preview,
    }))
  }

  // ── Custom Theme speichern ────────────────────────────────
  async function handleSave() {
    const theme = { ...editingTheme }
    delete theme.isNew
    await saveCustomTheme(theme, user?.id)
    handleSelect(theme.id)
    setEditorOpen(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // ── Custom Theme löschen ──────────────────────────────────
  async function handleDelete(themeId) {
    await deleteCustomTheme(themeId, user?.id)
    if (activeId === themeId) handleSelect(PRESET_THEMES[0].id)
  }

  return (
    <div className="tb">

      {/* ── Aktueller Modus ── */}
      <div>
        <div className="tb-section-title">Aktiver Modus</div>
        <div className="tb-mode-row">
          <button
            className={`tb-mode-btn ${mode === 'dark' ? 'tb-mode-btn--active' : ''}`}
            onClick={() => mode !== 'dark' && toggleTheme()}
          >
            <Moon size={14} /> Dark
          </button>
          <button
            className={`tb-mode-btn ${mode === 'light' ? 'tb-mode-btn--active' : ''}`}
            onClick={() => mode !== 'light' && toggleTheme()}
          >
            <Sun size={14} /> Light
          </button>
        </div>
      </div>

      {/* ── Theme für Dark / Light wählen ── */}
      <div>
        <div className="tb-section-title">
          Theme konfigurieren
        </div>
        <div className="tb-mode-row">
          <button
            className={`tb-mode-btn ${editMode === 'dark' ? 'tb-mode-btn--active' : ''}`}
            onClick={() => setEditMode('dark')}
          >
            <Moon size={14} /> Dark Theme
          </button>
          <button
            className={`tb-mode-btn ${editMode === 'light' ? 'tb-mode-btn--active' : ''}`}
            onClick={() => setEditMode('light')}
          >
            <Sun size={14} /> Light Theme
          </button>
        </div>

        <div className="tb-theme-grid">
          {/* Preset Themes */}
          {PRESET_THEMES.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={activeId === theme.id}
              onSelect={handleSelect}
            />
          ))}

          {/* Custom Themes */}
          {customThemes.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={activeId === theme.id}
              onSelect={() => editorOpen ? handleEditTheme(theme) : handleSelect(theme.id)}
              onDelete={handleDelete}
            />
          ))}

          {/* Neu erstellen */}
          <div className="tb-theme-card tb-theme-card--new" onClick={handleNewTheme}>
            <Plus size={18} />
            <span>Eigenes</span>
          </div>
        </div>
      </div>

      {/* ── Custom Theme Editor ── */}
      {editorOpen && editingTheme && (
        <div className="tb-editor">
          <div className="tb-section-title">
            {editingTheme.isNew ? 'Neues Theme' : 'Theme bearbeiten'}
          </div>

          {/* Name */}
          <div className="tb-editor-name-row">
            <input
              className="input tb-editor-name"
              value={editingTheme.name}
              onChange={e => setEditingTheme(p => ({ ...p, name: e.target.value }))}
              placeholder="Theme-Name"
            />
          </div>

          {/* Vorschau */}
          <Preview vars={editingTheme.vars} />

          {/* Farben */}
          <div className="tb-color-grid">
            {COLOR_FIELDS.map(({ key, label }) => {
              const raw = editingTheme.vars[key] ?? '#000000'
              // Nur echte Hex-Farben als color input
              const isHex = /^#[0-9a-f]{3,8}$/i.test(raw)
              return (
                <div key={key} className="tb-color-item">
                  <div className="tb-color-label">{label}</div>
                  <div className="tb-color-input-row">
                    {isHex && (
                      <div className="tb-color-swatch" style={{ background: raw }}>
                        <input
                          type="color"
                          value={raw.slice(0,7)}
                          onChange={e => handleColorChange(key, e.target.value)}
                        />
                      </div>
                    )}
                    <input
                      className="tb-color-hex"
                      value={raw}
                      onChange={e => handleColorChange(key, e.target.value)}
                      spellCheck={false}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Actions */}
          <div className="tb-editor-actions">
            <button className="btn btn-ghost btn-sm"
              onClick={() => setEditorOpen(false)}>
              <X size={14} /> Abbrechen
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              <Save size={14} /> Speichern
            </button>
          </div>
        </div>
      )}

      {/* ── Saved Indicator ── */}
      {saved && (
        <div className="tb-saved">
          <Check size={14} /> Theme gespeichert
        </div>
      )}

    </div>
  )
}
