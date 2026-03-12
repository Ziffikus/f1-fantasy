import { useState, useRef } from 'react'
import { Camera, User, Mail, Lock, Check, AlertCircle, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import './ProfilePage.css'

function StatusMsg({ type, text }) {
  if (!text) return null
  return (
    <div className={`profile-status ${type === 'error' ? 'profile-status--error' : 'profile-status--success'}`}>
      {type === 'error' ? <AlertCircle size={14} /> : <Check size={14} />}
      {text}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="profile-section card">
      <h3 className="profile-section-title">{title}</h3>
      {children}
    </div>
  )
}

export default function ProfilePage() {
  const { user, profile, updateProfile } = useAuthStore()

  const fileInputRef = useRef()
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarMsg, setAvatarMsg] = useState(null)

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameMsg, setNameMsg] = useState(null)

  const [email, setEmail] = useState(user?.email ?? '')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailMsg, setEmailMsg] = useState(null)

  const [pw, setPw] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setAvatarMsg({ type: 'error', text: 'Datei zu groß (max. 2 MB)' })
      return
    }
    setAvatarLoading(true)
    setAvatarMsg(null)
    try {
      const ext = file.name.split('.').pop()
      const path = `avatars/${user.id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      await updateProfile({ avatar_url: `${publicUrl}?t=${Date.now()}` })
      setAvatarMsg({ type: 'success', text: 'Profilbild gespeichert!' })
    } catch (err) {
      setAvatarMsg({ type: 'error', text: err.message })
    }
    setAvatarLoading(false)
  }

  async function handleNameSave() {
    if (!displayName.trim()) return
    setNameLoading(true)
    setNameMsg(null)
    try {
      await updateProfile({ display_name: displayName.trim() })
      setNameMsg({ type: 'success', text: 'Name gespeichert!' })
    } catch (err) {
      setNameMsg({ type: 'error', text: err.message })
    }
    setNameLoading(false)
  }

  async function handleEmailSave() {
    if (!email.trim() || email === user?.email) return
    setEmailLoading(true)
    setEmailMsg(null)
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim() })
      if (error) throw error
      setEmailMsg({ type: 'success', text: 'Bestätigungsmail an neue Adresse gesendet.' })
    } catch (err) {
      setEmailMsg({ type: 'error', text: err.message })
    }
    setEmailLoading(false)
  }

  async function handlePasswordSave() {
    if (!pw || pw.length < 6) { setPwMsg({ type: 'error', text: 'Mindestens 6 Zeichen.' }); return }
    if (pw !== pwConfirm) { setPwMsg({ type: 'error', text: 'Passwörter stimmen nicht überein.' }); return }
    setPwLoading(true)
    setPwMsg(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      setPw(''); setPwConfirm('')
      setPwMsg({ type: 'success', text: 'Passwort erfolgreich geändert!' })
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message })
    }
    setPwLoading(false)
  }

  const avatarSrc = profile?.avatar_url
  const initials = (profile?.display_name ?? profile?.username ?? '?')[0].toUpperCase()

  return (
    <div className="profile-page page-enter">
      <h1 className="profile-title">Mein Profil</h1>

      <Section title="Profilbild">
        <div className="profile-avatar-section">
          <div className="profile-avatar-wrap">
            {avatarSrc
              ? <img src={avatarSrc} alt="Avatar" className="profile-avatar-img" />
              : <div className="profile-avatar-placeholder">{initials}</div>}
            {avatarLoading && <div className="profile-avatar-overlay"><Loader size={20} className="spinning" /></div>}
          </div>
          <div className="profile-avatar-info">
            <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '0.6rem' }}>JPG, PNG oder GIF · max. 2 MB</p>
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={avatarLoading}>
              <Camera size={14} /> Bild auswählen
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>
        </div>
        <StatusMsg {...(avatarMsg ?? {})} />
      </Section>

      <Section title="Anzeigename">
        <div className="profile-field">
          <label className="profile-label">Name</label>
          <div className="profile-input-row">
            <div className="profile-input-wrap">
              <User size={15} className="profile-input-icon" />
              <input className="profile-input" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Dein Anzeigename" onKeyDown={e => e.key === 'Enter' && handleNameSave()} />
            </div>
            <button className="btn btn-primary" onClick={handleNameSave} disabled={nameLoading || !displayName.trim()}>
              {nameLoading ? <Loader size={14} className="spinning" /> : <Check size={14} />} Speichern
            </button>
          </div>
        </div>
        <StatusMsg {...(nameMsg ?? {})} />
      </Section>

      <Section title="E-Mail-Adresse">
        <div className="profile-field">
          <label className="profile-label">E-Mail</label>
          <div className="profile-input-row">
            <div className="profile-input-wrap">
              <Mail size={15} className="profile-input-icon" />
              <input className="profile-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="deine@email.com" />
            </div>
            <button className="btn btn-primary" onClick={handleEmailSave} disabled={emailLoading || email === user?.email || !email.trim()}>
              {emailLoading ? <Loader size={14} className="spinning" /> : <Check size={14} />} Speichern
            </button>
          </div>
          <p className="profile-hint">Nach der Änderung erhältst du eine Bestätigungsmail.</p>
        </div>
        <StatusMsg {...(emailMsg ?? {})} />
      </Section>

      <Section title="Passwort ändern">
        <div className="profile-field">
          <label className="profile-label">Neues Passwort</label>
          <div className="profile-input-wrap" style={{ marginBottom: '0.6rem' }}>
            <Lock size={15} className="profile-input-icon" />
            <input className="profile-input" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Mindestens 6 Zeichen" />
          </div>
          <label className="profile-label">Passwort bestätigen</label>
          <div className="profile-input-row">
            <div className="profile-input-wrap">
              <Lock size={15} className="profile-input-icon" />
              <input className="profile-input" type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)}
                placeholder="Passwort wiederholen" onKeyDown={e => e.key === 'Enter' && handlePasswordSave()} />
            </div>
            <button className="btn btn-primary" onClick={handlePasswordSave} disabled={pwLoading || !pw || !pwConfirm}>
              {pwLoading ? <Loader size={14} className="spinning" /> : <Check size={14} />} Speichern
            </button>
          </div>
        </div>
        <StatusMsg {...(pwMsg ?? {})} />
      </Section>
    </div>
  )
}
