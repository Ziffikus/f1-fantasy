import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Berechnet Punkte eines Spielers für ein Wochenende
// Identische Logik wie CalendarPage.jsx → calcPlayerPoints
function calcPlayerPoints(playerPicks, raceResultMap, sprintResultMap, isSprint, allDrivers) {
  let racePoints = 0, sprintPoints = 0

  for (const pick of playerPicks) {
    if (pick.pick_type === 'driver') {
      const pos = raceResultMap[pick.driver_id]
      racePoints += pos ?? 22
      if (isSprint) {
        const spos = sprintResultMap[pick.driver_id]
        sprintPoints += spos ? (spos / 2) : 11  // kein Sprint-Ergebnis = 22/2 = 11
      }
    } else if (pick.pick_type === 'constructor') {
      const teamDrivers = (allDrivers ?? []).filter(d => d.constructor_id === pick.constructor_id)
      for (const td of teamDrivers) {
        const pos = raceResultMap[td.id]
        racePoints += pos ?? 22
        if (isSprint) {
          const spos = sprintResultMap[td.id]
          sprintPoints += spos ? (spos / 2) : 11
        }
      }
    }
  }

  return { racePoints, sprintPoints, total: racePoints + sprintPoints }
}

export function useStandings() {
  const [standings, setStandings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Alle benötigten Daten parallel laden
      const [
        { data: profiles },
        { data: weekends },
        { data: allPicks },
        { data: allResults },
        { data: season },
      ] = await Promise.all([
        supabase.from('profiles').select('id, display_name, avatar_url'),
        supabase.from('race_weekends').select('id, round, is_sprint_weekend, race_start'),
        supabase.from('picks').select('id, profile_id, race_weekend_id, pick_type, driver_id, constructor_id'),
        supabase.from('race_results').select('race_weekend_id, driver_id, session_type, position'),
        supabase.from('seasons').select('id').eq('is_active', true).single(),
      ])

      // Fahrer der aktiven Saison laden
      let allDrivers = []
      if (season) {
        const { data: drivers } = await supabase
          .from('drivers')
          .select('id, constructor_id')
          .eq('season_id', season.id)
        allDrivers = drivers ?? []
      }

      // Nur vergangene Wochenenden berücksichtigen
      const now = new Date()
      const completedWeekends = (weekends ?? []).filter(w => new Date(w.race_start) < now)

      // Ergebnisse pro Wochenende indexieren
      // resultsByWeekend[race_weekend_id] = { race: {driver_id: pos}, sprint: {driver_id: pos} }
      const resultsByWeekend = {}
      for (const r of (allResults ?? [])) {
        if (!resultsByWeekend[r.race_weekend_id]) {
          resultsByWeekend[r.race_weekend_id] = { race: {}, sprint: {} }
        }
        if (r.session_type === 'race')   resultsByWeekend[r.race_weekend_id].race[r.driver_id]   = r.position
        if (r.session_type === 'sprint') resultsByWeekend[r.race_weekend_id].sprint[r.driver_id] = r.position
      }

      // Picks pro Spieler + Wochenende indexieren
      const picksByPlayerWeekend = {}
      for (const pick of (allPicks ?? [])) {
        const key = `${pick.profile_id}__${pick.race_weekend_id}`
        if (!picksByPlayerWeekend[key]) picksByPlayerWeekend[key] = []
        picksByPlayerWeekend[key].push(pick)
      }

      // Gesamtpunkte pro Spieler berechnen
      const playerTotals = (profiles ?? []).map(profile => {
        let total = 0
        let wins = 0, seconds = 0, thirds = 0

        // Punkte pro Wochenende sammeln für Tiebreaker (weekend_rank)
        const weekendResults = completedWeekends.map(w => {
          const hasResults = !!resultsByWeekend[w.id]
          if (!hasResults) return null

          const raceMap   = resultsByWeekend[w.id]?.race   ?? {}
          const sprintMap = resultsByWeekend[w.id]?.sprint ?? {}
          const picks     = picksByPlayerWeekend[`${profile.id}__${w.id}`] ?? []

          const { total: pts } = calcPlayerPoints(picks, raceMap, sprintMap, w.is_sprint_weekend, allDrivers)
          return { weekendId: w.id, pts }
        }).filter(Boolean)

        // Gesamtpunkte summieren
        total = weekendResults.reduce((sum, r) => sum + r.pts, 0)

        // weekend_rank pro Wochenende berechnen (für Siege/Podien)
        // Dazu alle Spieler pro Wochenende vergleichen — wird unten nach dem map gemacht
        return {
          profile_id: profile.id,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          total_points: total,
          weekendResults, // temporär für Rang-Berechnung
          wins: 0,
          second_places: 0,
          third_places: 0,
        }
      })

      // Weekend-Ränge berechnen: pro Wochenende alle Spieler sortieren
      completedWeekends.forEach(w => {
        const entries = playerTotals
          .map(p => ({ profile_id: p.profile_id, pts: p.weekendResults.find(r => r.weekendId === w.id)?.pts ?? null }))
          .filter(e => e.pts !== null)
          .sort((a, b) => a.pts - b.pts) // weniger = besser

        entries.forEach((entry, idx) => {
          const player = playerTotals.find(p => p.profile_id === entry.profile_id)
          if (!player) return
          if (idx === 0) player.wins++
          if (idx === 1) player.second_places++
          if (idx === 2) player.third_places++
        })
      })

      // weekendResults entfernen (nur intern gebraucht) und sortieren
      const result = playerTotals
        .map(({ weekendResults: _, ...p }) => p)
        .sort((a, b) => {
          if (a.total_points !== b.total_points) return a.total_points - b.total_points
          if (a.wins !== b.wins) return b.wins - a.wins
          if (a.second_places !== b.second_places) return b.second_places - a.second_places
          return b.third_places - a.third_places
        })

      setStandings(result)
      setLoading(false)
    }

    load()
  }, [])

  return { standings, loading }
}
