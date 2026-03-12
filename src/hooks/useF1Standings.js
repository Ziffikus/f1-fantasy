import { useState, useEffect } from 'react'

// Ergast API – kostenlos, keine Auth nötig
const ERGAST = 'https://api.jolpi.ca/ergast/f1'

export function useF1Standings() {
  const [standings, setStandings] = useState([]) // [{ position, points, wins, Driver: {code, ...} }]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${ERGAST}/2026/driverStandings.json?limit=25`)
      .then(r => r.json())
      .then(data => {
        const list = data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? []
        setStandings(list)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Lookup by abbreviation (code)
  function getStanding(abbreviation) {
    return standings.find(s => s.Driver?.code === abbreviation) ?? null
  }

  return { standings, loading, error, getStanding }
}
