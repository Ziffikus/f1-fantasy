import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useStandings() {
  const [standings, setStandings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('overall_standings')
        .select('*')
        .order('total_points', { ascending: true })
      setStandings(data ?? [])
      setLoading(false)
    }
    fetch()
  }, [])

  return { standings, loading }
}
