import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Supabase-Umgebungsvariablen fehlen!\n' +
    'Bitte ".env.local" anlegen (siehe .env.example)'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'f1-fantasy-auth',
  },
  global: {
    fetch: async (url, options = {}) => {
      // Bei 401 Session erneuern und nochmal versuchen
      const res = await fetch(url, options)
      if (res.status === 401) {
        const { data } = await supabase.auth.refreshSession()
        if (data?.session) {
          const newOptions = {
            ...options,
            headers: {
              ...options.headers,
              Authorization: `Bearer ${data.session.access_token}`,
            },
          }
          return fetch(url, newOptions)
        }
      }
      return res
    },
  },
})

// Token alle 10 Minuten aktiv erneuern (verhindert Ablauf bei langen Sessions)
setInterval(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    await supabase.auth.refreshSession()
  }
}, 10 * 60 * 1000)
