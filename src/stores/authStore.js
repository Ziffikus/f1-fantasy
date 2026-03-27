import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// Hilfsfunktion: Promise mit Timeout
function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ])
}

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  init: async () => {
    try {
      const { data: { session } } = await withTimeout(supabase.auth.getSession(), 5000)
      if (session?.user) {
        await withTimeout(get().loadProfile(session.user), 5000)
      }
    } catch (e) {
      console.warn('Auth init timeout oder Fehler:', e.message)
      // loading trotzdem auf false – App ist benutzbar, ggf. nicht eingeloggt
    } finally {
      set({ loading: false })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        try {
          await get().loadProfile(session.user)
        } catch (e) {
          console.warn('Profil laden fehlgeschlagen:', e.message)
        }
      } else {
        set({ user: null, profile: null })
      }
    })
  },

  loadProfile: async (user) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    set({ user, profile })
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },

  updateProfile: async (updates) => {
    const { user } = get()
    if (!user) return
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single()
    if (error) throw error
    set({ profile: data })
    return data
  },
}))
