import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export function useStandings() {
  const { user } = useAuthStore()
  const [standings, setStandings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return // warten bis User eingeloggt

    async function load() {
      const { data } = await supabase
        .from('overall_standings')
        .select('*')
        .order('total_points', { ascending: true })
      setStandings(data ?? [])
      setLoading(false)
    }
    load()
  }, [user]) // neu laden wenn User sich ändert

  return { standings, loading }
}
