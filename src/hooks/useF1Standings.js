import { useState, useEffect } from 'react'

// Ergast API – kostenlos, keine Auth nötig
const ERGAST = 'https://api.jolpi.ca/ergast/f1'

export function useF1Standings() {
  const [standings, setStandings] = useState([])
  const [constructorStandings, setConstructorStandings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch(`${ERGAST}/2026/driverStandings.json?limit=25`).then(r => r.json()),
      fetch(`${ERGAST}/2026/constructorStandings.json?limit=15`).then(r => r.json()),
    ])
      .then(([driverData, constructorData]) => {
        const drivers = driverData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? []
        const constructors = constructorData?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? []
        setStandings(drivers)
        setConstructorStandings(constructors)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function getStanding(abbreviation) {
    return standings.find(s => s.Driver?.code === abbreviation) ?? null
  }

  // Alias-Map für Teamnamen die in Ergast anders heißen
  const TEAM_ALIASES = {
    'racing bulls': ['rb', 'rb f1', 'racing bulls', 'scuderia alphatauri'],
    'red bull racing': ['red bull'],
    'aston martin': ['aston martin'],
    'alpine': ['alpine'],
    'cadillac': ['cadillac', 'haas'],  // falls Cadillac noch nicht in Ergast
  }

  function getConstructorStanding(teamName) {
    const lower = teamName.toLowerCase()
    return constructorStandings.find(s => {
      const ergastName = s.Constructor?.name?.toLowerCase() ?? ''
      if (ergastName.includes(lower) || lower.includes(ergastName)) return true
      // Alias-Check
      for (const [key, aliases] of Object.entries(TEAM_ALIASES)) {
        if (lower.includes(key) || key.includes(lower)) {
          if (aliases.some(a => ergastName.includes(a) || a.includes(ergastName))) return true
        }
      }
      return false
    }) ?? null
  }

  return { standings, constructorStandings, loading, error, getStanding, getConstructorStanding }
}
