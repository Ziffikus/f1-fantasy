import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Supabase-Umgebungsvariablen fehlen!\n' +
    'Bitte ".env.local" anlegen (siehe .env.example)'
  )
}

// Fetch mit Timeout – kein 401-Retry (autoRefreshToken übernimmt das)
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)
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
