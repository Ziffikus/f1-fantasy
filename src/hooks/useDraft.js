import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export function useDraft(raceWeekendId) {
  const { profile } = useAuthStore()
  const [draftOrder, setDraftOrder] = useState([])
  const [picks, setPicks] = useState([])
  const [drivers, setDrivers] = useState([])
  const [constructors, setConstructors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!raceWeekendId) return
    loadAll()

    // Debounce verhindert doppeltes Laden (Realtime + manuell gleichzeitig)
    let reloadTimer = null
    const channel = supabase
      .channel(`draft-${raceWeekendId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'picks',
        filter: `race_weekend_id=eq.${raceWeekendId}`
      }, async () => {
        console.log('📦 Realtime: Pick erkannt')
        clearTimeout(reloadTimer)
        reloadTimer = setTimeout(async () => {
          await loadPicks()
          console.log('📦 Lade Picks, sende Push...')

          // Push an den nächsten Spieler senden
          try {
            const { data: freshPicks } = await supabase
              .from('picks').select('profile_id').eq('race_weekend_id', raceWeekendId)
            const { data: order } = await supabase
              .from('draft_orders')
              .select('*, profiles(id, display_name)')
              .eq('race_weekend_id', raceWeekendId)
              .order('pick_order')

            if (order?.length) {
              const numPlayers = order.length
              const totalExpected = numPlayers * 6
              if (freshPicks.length < totalExpected) {
                const idx = freshPicks.length % numPlayers
                const nextPlayer = order[idx]
                if (nextPlayer?.profiles?.id) {
                  const { data: { session } } = await supabase.auth.getSession()
                  supabase.functions.invoke('send-push', {
                    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
                    body: {
                      profile_id: nextPlayer.profiles.id,
                      title: '🏎️ Du bist dran!',
                      body: `${nextPlayer.profiles.display_name}, mach deinen Pick im F1 Fantasy Draft!`,
                      url: '/f1-fantasy/draft',
                      tag: 'draft-turn',
                    }
                  }).catch(() => {}) // Edge Function optional
                }
              }
            }
          } catch (_) {}
        }, 300)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [raceWeekendId])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadDraftOrder(), loadPicks(), loadDriversAndTeams()])
    setLoading(false)
  }

  async function loadDraftOrder() {
    const { data } = await supabase
      .from('draft_orders')
      .select('*, profiles(id, display_name, avatar_url)')
      .eq('race_weekend_id', raceWeekendId)
      .order('pick_order')
    setDraftOrder(data ?? [])
  }

  async function loadPicks() {
    const { data } = await supabase
      .from('picks')
      .select('*, drivers(id, first_name, last_name, number, abbreviation, constructor_id, constructors(short_name, color)), constructors(id, name, short_name, color)')
      .eq('race_weekend_id', raceWeekendId)
      .order('created_at', { ascending: true })
    setPicks(data ?? [])
  }

  async function loadDriversAndTeams() {
    const { data: season } = await supabase
      .from('seasons').select('id').eq('is_active', true).single()
    if (!season) return
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('drivers').select('*, constructors(name, short_name, color)').eq('season_id', season.id).eq('is_active', true).order('last_name'),
      supabase.from('constructors').select('*').eq('season_id', season.id).order('name'),
    ])
    setDrivers(d ?? [])
    setConstructors(c ?? [])
  }

  const numPlayers = draftOrder.length
  const totalExpected = numPlayers * 6 // 4 Fahrer + 2 Teams pro Spieler
  const isDraftComplete = numPlayers > 0 && picks.length >= totalExpected

  // Round-Robin: wer ist Pick Nummer X dran?
  // picks.length = Index des nächsten Picks (0-basiert)
  function getCurrentTurn() {
    if (isDraftComplete || numPlayers === 0) return null
    const idx = picks.length % numPlayers
    return draftOrder[idx] ?? null
  }

  const currentTurn = getCurrentTurn()
  const isMyTurn = currentTurn?.profile_id === profile?.id

  // Picks pro Spieler
  function getPlayerPicks(profileId) {
    return picks.filter(p => p.profile_id === profileId)
  }

  function getPlayerPickCount(profileId) {
    const pp = getPlayerPicks(profileId)
    return {
      drivers: pp.filter(p => p.pick_type === 'driver').length,
      constructors: pp.filter(p => p.pick_type === 'constructor').length,
      total: pp.length,
    }
  }

  const pickedDriverIds = picks.filter(p => p.pick_type === 'driver').map(p => p.driver_id)
  const pickedConstructorIds = picks.filter(p => p.pick_type === 'constructor').map(p => p.constructor_id)

  async function makePick(type, entityId) {
    // Frischen Stand holen – verhindert Probleme mit veraltetem State
    const { data: freshPicks } = await supabase
      .from('picks')
      .select('profile_id, pick_type, driver_id, constructor_id')
      .eq('race_weekend_id', raceWeekendId)

    const fresh = freshPicks ?? []
    const freshTotal = fresh.length
    const freshIdx = freshTotal % (draftOrder.length || 1)
    const freshTurn = draftOrder[freshIdx]

    if (freshTurn?.profile_id !== profile?.id) {
      return { error: { message: 'Du bist gerade nicht dran – bitte kurz warten.' } }
    }

    const myPicks = fresh.filter(p => p.profile_id === profile.id)
    const myDrivers = myPicks.filter(p => p.pick_type === 'driver').length
    const myTeams = myPicks.filter(p => p.pick_type === 'constructor').length

    if (type === 'driver' && myDrivers >= 4) return { error: { message: 'Du hast bereits 4 Fahrer.' } }
    if (type === 'constructor' && myTeams >= 2) return { error: { message: 'Du hast bereits 2 Teams.' } }

    // Doppel-Pick verhindern
    if (type === 'driver' && fresh.some(p => p.driver_id === entityId)) {
      return { error: { message: 'Dieser Fahrer wurde bereits gepickt.' } }
    }
    if (type === 'constructor' && fresh.some(p => p.constructor_id === entityId)) {
      return { error: { message: 'Dieses Team wurde bereits gepickt.' } }
    }

    const pickNumber = type === 'driver' ? myDrivers + 1 : myTeams + 1
    const { error } = await supabase.from('picks').insert({
      race_weekend_id: raceWeekendId,
      profile_id: profile.id,
      pick_type: type,
      [type === 'driver' ? 'driver_id' : 'constructor_id']: entityId,
      pick_number: pickNumber,
    })
    if (!error) await loadPicks()
    return { error: error ? { message: error.message } : null }
  }

  async function adminMakePick(profileId, type, entityId) {
    const count = getPlayerPickCount(profileId)
    if (type === 'driver' && count.drivers >= 4) return { error: 'Bereits 4 Fahrer.' }
    if (type === 'constructor' && count.constructors >= 2) return { error: 'Bereits 2 Teams.' }
    const pickNumber = type === 'driver' ? count.drivers + 1 : count.constructors + 1
    const { error } = await supabase.from('picks').insert({
      race_weekend_id: raceWeekendId,
      profile_id: profileId,
      pick_type: type,
      [type === 'driver' ? 'driver_id' : 'constructor_id']: entityId,
      pick_number: pickNumber,
    })
    if (!error) await loadPicks()
    return { error }
  }

  async function adminDeletePick(pickId) {
    const { error } = await supabase.from('picks').delete().eq('id', pickId)
    if (!error) await loadPicks()
    return { error }
  }

  return {
    draftOrder, picks, drivers, constructors,
    pickedDriverIds, pickedConstructorIds, loading,
    getPlayerPicks, getPlayerPickCount,
    currentTurn, isMyTurn, isDraftComplete,
    makePick, adminMakePick, adminDeletePick,
    reload: loadAll,
  }
}

export function useDraftOrder(raceWeekendId) {
  const [profiles, setProfiles] = useState([])

  useEffect(() => {
    supabase.from('profiles').select('*').then(({ data }) => setProfiles(data ?? []))
  }, [])

  async function calcAutoOrder() {
    const { data: currentRace } = await supabase
      .from('race_weekends').select('round, season_id')
      .eq('id', raceWeekendId).single()
    if (!currentRace || currentRace.round <= 1) return profiles

    const { data: prevRace } = await supabase
      .from('race_weekends').select('id')
      .eq('season_id', currentRace.season_id)
      .eq('round', currentRace.round - 1)
      .single()
    if (!prevRace) return profiles

    const { data: prevPoints } = await supabase
      .from('player_race_points').select('profile_id, total_points, weekend_rank')
      .eq('race_weekend_id', prevRace.id)
    if (!prevPoints || prevPoints.length === 0) return profiles

    // Gesamtwertung der Saison für Tiebreaker laden
    const { data: seasonPoints } = await supabase
      .from('player_race_points')
      .select('profile_id, total_points')
      .eq('season_id', currentRace.season_id)

    // Saison-Gesamtpunkte pro Spieler summieren
    const seasonTotals = {}
    for (const sp of (seasonPoints ?? [])) {
      seasonTotals[sp.profile_id] = (seasonTotals[sp.profile_id] ?? 0) + sp.total_points
    }

    return [...profiles].sort((a, b) => {
      const pa = prevPoints.find(p => p.profile_id === a.id)
      const pb = prevPoints.find(p => p.profile_id === b.id)
      if (!pa && !pb) return 0
      if (!pa) return 1
      if (!pb) return -1
      // 1. Rennergebnis letztes Rennen (mehr Punkte = schlechter = zuerst drann)
      if (pb.total_points !== pa.total_points) return pb.total_points - pa.total_points
      // 2. Tiebreaker: wer hat weniger Gesamtpunkte → zuerst dran
      const sa = seasonTotals[a.id] ?? 0
      const sb = seasonTotals[b.id] ?? 0
      if (sa !== sb) return sb - sa  // mehr Gesamtpunkte = schlechter = zuerst dran
      // 3. Tiebreaker: weekend_rank
      return pb.weekend_rank - pa.weekend_rank
    })
  }

  async function saveDraftOrder(orderedProfileIds, isManual = false) {
    await supabase.from('draft_orders').delete().eq('race_weekend_id', raceWeekendId)
    const inserts = orderedProfileIds.map((pid, i) => ({
      race_weekend_id: raceWeekendId,
      profile_id: pid,
      pick_order: i + 1,
      is_manual_override: isManual,
    }))
    const { error } = await supabase.from('draft_orders').insert(inserts)
    return { error }
  }

  return { profiles, saveDraftOrder, calcAutoOrder }
}
