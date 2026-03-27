import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Supabase-Umgebungsvariablen fehlen!\n' +
    'Bitte ".env.local" anlegen (siehe .env.example)'
  )
}

// Fetch mit Timeout und automatischem Token-Refresh bei 401
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)

    // Bei 401: Session erneuern und nochmal versuchen
    if (res.status === 401) {
      const { data } = await supabase.auth.refreshSession()
      if (data?.session) {
        const retryOptions = {
          ...options,
          signal: undefined,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${data.session.access_token}`,
          },
        }
        const controller2 = new AbortController()
        const timer2 = setTimeout(() => controller2.abort(), timeoutMs)
        const res2 = await fetch(url, { ...retryOptions, signal: controller2.signal })
        clearTimeout(timer2)
        return res2
      }
    }
    return res
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      throw new Error('Anfrage-Timeout – bitte Seite neu laden.')
    }
    throw e
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'f1-fantasy-auth',
  },
  global: {
    fetch: fetchWithTimeout,
  },
})

// Token alle 10 Minuten aktiv erneuern
setInterval(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    await supabase.auth.refreshSession()
  }
}, 10 * 60 * 1000)
