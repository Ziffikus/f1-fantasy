import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, User, Mail, Lock, Check, AlertCircle, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import './ProfilePage.css'
import { subscribeToPush, unsubscribeFromPush, getPushStatus } from '../lib/pushNotifications'

function useFavourites(profileId) {
  const [drivers, setDrivers] = useState([])
  const [teams, setTeams]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profileId) return
    async function load() {
      const sb = supabase
      // Alle Picks des Spielers laden
      const { data: picks } = await sb
        .from('picks')
        .select('pick_type, driver_id, constructor_id, drivers(first_name, last_name, abbreviation, number, constructors(color, short_name)), constructors(id, name, short_name, color)')
        .eq('profile_id', profileId)

      if (!picks) { setLoading(false); return }

      // Fahrer zählen
      const driverCount = {}
      const driverMeta  = {}
      for (const p of picks.filter(p => p.pick_type === 'driver')) {
        const id = p.driver_id
        driverCount[id] = (driverCount[id] ?? 0) + 1
        driverMeta[id]  = p.drivers
      }
      const topDrivers = Object.entries(driverCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, count]) => ({ ...driverMeta[id], id, count }))

      // Teams zählen
      const teamCount = {}
      const teamMeta  = {}
      for (const p of picks.filter(p => p.pick_type === 'constructor')) {
        const id = p.constructor_id
        teamCount[id] = (teamCount[id] ?? 0) + 1
        teamMeta[id]  = p.constructors
      }
      const topTeams = Object.entries(teamCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([id, count]) => ({ ...teamMeta[id], id, count }))

      setDrivers(topDrivers)
      setTeams(topTeams)
      setLoading(false)
    }
    load()
  }, [profileId])

  return { drivers, teams, loading }
}

function StatusMsg({ type, text }) {
  if (!text) return null
  return (
    <div className={`profile-status ${type === 'error' ? 'profile-status--error' : 'profile-status--success'}`}>
      {type === 'error' ? <AlertCircle size={14} /> : <Check size={14} />}
      {text}
      <Section title="Push-Benachrichtigungen">
        {!pushStatus?.supported ? (
          <p className="text-muted" style={{ fontSize: '0.82rem' }}>
            Dein Browser unterstützt keine Push-Benachrichtigungen.
          </p>
        ) : (
          <div>
            <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '0.75rem' }}>
              Erhalte eine Benachrichtigung wenn du beim Draft dran bist –
              auch wenn die App geschlossen ist.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div className={`push-status-dot ${pushStatus?.subscribed ? 'push-status-dot--on' : ''}`} />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {pushStatus?.subscribed ? 'Aktiv' : 'Inaktiv'}
              </span>
              <button
                className={`btn ${pushStatus?.subscribed ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handlePushToggle}
                disabled={pushLoading || !import.meta.env.VITE_VAPID_PUBLIC_KEY}
              >
                {pushLoading
                  ? <><Loader size={14} className="spinning" /> Bitte warten…</>
                  : pushStatus?.subscribed
                    ? '🔕 Deaktivieren'
                    : '🔔 Aktivieren'
                }
              </button>
            </div>
            {!import.meta.env.VITE_VAPID_PUBLIC_KEY && (
              <p className="profile-hint" style={{ color: '#f59e0b' }}>⚠️ VAPID Key noch nicht konfiguriert – siehe Setup-Anleitung.</p>
            )}
            <StatusMsg {...(pushMsg ?? {})} />
          </div>
        )}
      </Section>

      <Section title="Meine Lieblingspicks">
        {favLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem' }}><div className="spinner" style={{ width: 18, height: 18 }} /></div>
        ) : (
          <div className="profile-favs">
            <div className="profile-favs-group">
              <div className="profile-favs-label">Top 3 Fahrer</div>
              {topDrivers.length === 0
                ? <p className="text-muted" style={{ fontSize: '0.8rem' }}>Noch keine Picks.</p>
                : topDrivers.map((d, i) => (
                  <div key={d.id} className="profile-fav-item">
                    <span className="profile-fav-rank">#{i + 1}</span>
                    <div className="profile-fav-dot" style={{ background: d.constructors?.color ?? '#888' }} />
                    <div className="profile-fav-info">
                      <span className="profile-fav-name">{d.first_name} {d.last_name}</span>
                      <span className="profile-fav-team" style={{ color: d.constructors?.color }}>{d.constructors?.short_name}</span>
                    </div>
                    <span className="profile-fav-count">{d.count}×</span>
                  </div>
                ))
              }
            </div>
            <div className="profile-favs-group">
              <div className="profile-favs-label">Top 2 Teams</div>
              {topTeams.length === 0
                ? <p className="text-muted" style={{ fontSize: '0.8rem' }}>Noch keine Picks.</p>
                : topTeams.map((t, i) => (
                  <div key={t.id} className="profile-fav-item">
                    <span className="profile-fav-rank">#{i + 1}</span>
                    <div className="profile-fav-dot" style={{ background: t.color ?? '#888' }} />
                    <div className="profile-fav-info">
                      <span className="profile-fav-name">{t.name}</span>
                    </div>
                    <span className="profile-fav-count">{t.count}×</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </Section>
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
    const newEmail = email.trim().toLowerCase()
    if (!newEmail || newEmail === user?.email?.toLowerCase()) return
    setEmailLoading(true)
    setEmailMsg(null)
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail })
      // Supabase sendet die Mail auch wenn "invalid"-Fehler kommt (Secure email change Modus)
      if (error && !error.message?.toLowerCase().includes("invalid")) throw error
      setEmailMsg({ type: "success", text: "Bestätigungsmail gesendet – bitte beide Adressen bestätigen." })
    } catch (err) {
      setEmailMsg({ type: "error", text: err.message })
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

  const { drivers: topDrivers, teams: topTeams, loading: favLoading } = useFavourites(profile?.id)

  // Push Notifications
  const [pushStatus, setPushStatus] = useState(null)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushMsg, setPushMsg] = useState(null)

  useEffect(() => {
    getPushStatus().then(setPushStatus)
  }, [])

  async function handlePushToggle() {
    setPushLoading(true)
    setPushMsg(null)
    try {
      if (pushStatus?.subscribed) {
        await unsubscribeFromPush(profile.id)
        setPushMsg({ type: 'success', text: 'Benachrichtigungen deaktiviert.' })
      } else {
        const result = await subscribeToPush(profile.id)
        if (result.error) throw new Error(result.error)
        setPushMsg({ type: 'success', text: 'Benachrichtigungen aktiviert! ✅' })
      }
      getPushStatus().then(setPushStatus)
    } catch (err) {
      setPushMsg({ type: 'error', text: err.message })
    }
    setPushLoading(false)
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
