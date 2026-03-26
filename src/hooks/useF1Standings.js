import { useState, useEffect } from 'react'

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
    const s = standings.find(s => s.Driver?.code === abbreviation)
    if (!s) return null
    return {
      position: Number(s.position),
      points: Number(s.points),
      wins: Number(s.wins),
    }
  }

  const ALIASES = {
    'racing bulls': ['rb', 'rb f1', 'visa cash app rb', 'scuderia alphatauri'],
    'red bull racing': ['red bull'],
    'audi': ['kick sauber', 'sauber'],
  }

  function getConstructorStanding(teamName) {
    const lower = teamName.toLowerCase()

    // Cadillac noch nicht in Ergast – kein Match
    if (lower.includes('cadillac')) return null

    const found = constructorStandings.find(s => {
      const name = (s.Constructor?.name ?? '').toLowerCase()
      if (name.includes(lower) || lower.includes(name)) return true
      for (const [key, aliases] of Object.entries(ALIASES)) {
        if (lower.includes(key) || key.includes(lower)) {
          if (aliases.some(a => name.includes(a) || a.includes(name))) return true
        }
      }
      return false
    })

    if (!found) return null
    return {
      position: Number(found.position),
      points: Number(found.points),
    }
  }

  return { standings, constructorStandings, loading, error, getStanding, getConstructorStanding }
}
