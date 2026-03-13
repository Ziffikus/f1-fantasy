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

  function getConstructorStanding(teamName) {
    return constructorStandings.find(s =>
      s.Constructor?.name?.toLowerCase().includes(teamName.toLowerCase()) ||
      teamName.toLowerCase().includes(s.Constructor?.name?.toLowerCase())
    ) ?? null
  }

  return { standings, constructorStandings, loading, error, getStanding, getConstructorStanding }
}
