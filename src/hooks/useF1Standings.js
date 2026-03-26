import { useState, useEffect } from 'react'

// OpenF1 API – wir nutzen sie bereits für Live-Daten
const OPENF1 = 'https://api.openf1.org/v1'

export function useF1Standings() {
  const [standings, setStandings] = useState([])
  const [constructorStandings, setConstructorStandings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        // Neueste Session mit WM-Standings holen
        const sessRes = await fetch(`${OPENF1}/sessions?year=2026&session_name=Race&order_by=-date_start&limit=1`)
        const sessions = await sessRes.json()
        const sessionKey = sessions?.[0]?.session_key
        if (!sessionKey) throw new Error('Keine Session gefunden')

        const [driverRes, constructorRes] = await Promise.all([
          fetch(`${OPENF1}/championship_standings?session_key=${sessionKey}&position%3C=30`),
          fetch(`${OPENF1}/team_standings?session_key=${sessionKey}`),
        ])

        const drivers = await driverRes.json()
        const constructors = await constructorRes.json()

        setStandings(drivers ?? [])
        setConstructorStandings(constructors ?? [])
      } catch (e) {
        // Fallback auf Jolpi/Ergast
        try {
          const [driverData, constructorData] = await Promise.all([
            fetch('https://api.jolpi.ca/ergast/f1/2026/driverStandings.json?limit=25').then(r => r.json()),
            fetch('https://api.jolpi.ca/ergast/f1/2026/constructorStandings.json?limit=15').then(r => r.json()),
          ])
          setStandings(driverData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [])
          setConstructorStandings(constructorData?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [])
        } catch (e2) {
          setError(e2.message)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function getStanding(abbreviation) {
    // OpenF1 Format
    const openf1 = standings.find(s =>
      s.driver_abbreviation === abbreviation ||
      s.broadcast_name?.includes(abbreviation)
    )
    if (openf1) return {
      position: openf1.position,
      points: openf1.points,
      wins: openf1.wins ?? 0,
    }
    // Ergast Fallback
    const ergast = standings.find(s => s.Driver?.code === abbreviation)
    if (ergast) return {
      position: Number(ergast.position),
      points: Number(ergast.points),
      wins: Number(ergast.wins),
    }
    return null
  }

  function getConstructorStanding(teamName) {
    const lower = teamName.toLowerCase()

    // OpenF1 Format
    const openf1 = constructorStandings.find(s => {
      const name = (s.team_name ?? s.constructor_name ?? '').toLowerCase()
      return name.includes(lower) || lower.includes(name)
    })
    if (openf1) return {
      position: openf1.position,
      points: openf1.points,
    }

    // Ergast Fallback mit Aliases
    const ALIASES = {
      'racing bulls': ['rb', 'rb f1', 'visa cash app rb', 'scuderia alphatauri'],
      'red bull racing': ['red bull'],
      'audi': ['kick sauber', 'sauber'],
    }
    return constructorStandings.find(s => {
      const name = (s.Constructor?.name ?? '').toLowerCase()
      if (name.includes(lower) || lower.includes(name)) return true
      for (const [key, aliases] of Object.entries(ALIASES)) {
        if (lower.includes(key) || key.includes(lower)) {
          if (aliases.some(a => name.includes(a))) return true
        }
      }
      return false
    }) ? {
      position: Number(constructorStandings.find(s => {
        const name = (s.Constructor?.name ?? '').toLowerCase()
        return name.includes(lower) || lower.includes(name)
      })?.position),
      points: Number(constructorStandings.find(s => {
        const name = (s.Constructor?.name ?? '').toLowerCase()
        return name.includes(lower) || lower.includes(name)
      })?.points),
    } : null
  }

  return { standings, constructorStandings, loading, error, getStanding, getConstructorStanding }
}
