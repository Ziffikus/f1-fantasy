import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  init: async () => {
    // Listener ZUERST registrieren
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        try {
          await get().loadProfile(session.user)
        } catch (e) {
          console.warn('Profil laden fehlgeschlagen:', e.message)
          set({ loading: false })
        }
      } else {
        set({ user: null, profile: null, loading: false })
      }
    })

    // Initiale Session prüfen – loading: false immer am Ende
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await get().loadProfile(session.user)
      } else {
        set({ loading: false })
      }
    } catch (e) {
      console.warn('Auth init Fehler:', e.message)
      set({ loading: false })
    }
  },

  loadProfile: async (user) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    set({ user, profile, loading: false })
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
