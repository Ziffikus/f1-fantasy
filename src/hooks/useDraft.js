import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

/**
 * Sendet einen Push nur wenn draft_push_paused != true.
 * Zentraler Ersatz für alle direkten supabase.functions.invoke('send-push') Aufrufe.
 */
async function sendPushIfEnabled(body) {
  try {
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'draft_push_paused')
      .maybeSingle()
    if (setting?.value === true) {
      console.log('[Push] Pausiert – kein Push gesendet.')
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    supabase.functions.invoke('send-push', {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      body,
    }).catch(e => console.warn('Push failed:', e))
  } catch (e) {
    console.warn('Push error:', e)
  }
}

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

    let reloadTimer = null
    let channel = null
    let reconnectTimer = null
    let heartbeatTimer = null

    function subscribe() {
      if (channel) supabase.removeChannel(channel)

      channel = supabase
        .channel(`draft-${raceWeekendId}-${Date.now()}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'picks',
          filter: `race_weekend_id=eq.${raceWeekendId}`
        }, async () => {
          console.log('📦 Realtime: Pick erkannt')
          clearTimeout(reloadTimer)
          reloadTimer = setTimeout(async () => {
            await loadPicks()
            console.log('📦 Lade Picks, sende Push...')

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
                    await sendPushIfEnabled({
                      profile_id: nextPlayer.profiles.id,
                      title: '🏎️ Du bist dran!',
                      body: `${nextPlayer.profiles.display_name}, mach deinen Pick im F1 Fantasy Draft!`,
                      url: '/f1-fantasy/draft',
                      tag: 'draft-turn',
                    })
                  }
                }
              }
            } catch (_) {}
          }, 300)
        })
        .subscribe((status) => {
          console.log(`[useDraft] Channel-Status: ${status}`)
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[useDraft] Channel verloren – Reconnect in 3s')
            clearTimeout(reconnectTimer)
            reconnectTimer = setTimeout(subscribe, 3000)
          }
        })
    }

    subscribe()

    // Heartbeat: alle 25s einen leichten DB-Ping machen damit der
    // WebSocket nicht vom Browser/NAT als idle markiert wird
    heartbeatTimer = setInterval(async () => {
      try {
        await supabase.from('picks').select('id').eq('race_weekend_id', raceWeekendId).limit(1)
        console.log('[useDraft] Heartbeat OK')
      } catch (_) {
        console.warn('[useDraft] Heartbeat fehlgeschlagen')
      }
    }, 25_000)

    // Reconnect wenn Tab wieder sichtbar wird
    function handleVisibilityChange() {
      if (!document.hidden) {
        console.log('[useDraft] Tab aktiv – Picks neu laden')
        loadPicks()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (channel) supabase.removeChannel(channel)
      clearTimeout(reloadTimer)
      clearTimeout(reconnectTimer)
      clearInterval(heartbeatTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
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
      .select('*, ai_comment, drivers(id, first_name, last_name, number, abbreviation, constructor_id, constructors(short_name, color)), constructors(id, name, short_name, color)')
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
  const totalExpected = numPlayers * 6
  const isDraftComplete = numPlayers > 0 && picks.length >= totalExpected

  function getCurrentTurn() {
    if (isDraftComplete || numPlayers === 0) return null
    const idx = picks.length % numPlayers
    return draftOrder[idx] ?? null
  }

  const currentTurn = getCurrentTurn()
  const isMyTurn = currentTurn?.profile_id === profile?.id

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
    const { data: freshPicks, error: fetchError } = await supabase
      .from('picks')
      .select('profile_id, pick_type, driver_id, constructor_id')
      .eq('race_weekend_id', raceWeekendId)

    if (fetchError || freshPicks === null) {
      console.error('[useDraft] makePick: Picks konnten nicht geladen werden', fetchError)
      return { error: { message: 'Verbindungsfehler – bitte nochmal versuchen.' } }
    }

    const fresh = freshPicks
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

    if (!error) {
      await loadPicks()

      try {
        const { data: afterPicks } = await supabase
          .from('picks').select('profile_id').eq('race_weekend_id', raceWeekendId)
        const numPlayers = draftOrder.length
        const totalExpected = numPlayers * 6
        if ((afterPicks?.length ?? 0) < totalExpected) {
          const idx = (afterPicks?.length ?? 0) % numPlayers
          const nextPlayer = draftOrder[idx]
          if (nextPlayer?.profile_id && nextPlayer?.profiles?.display_name) {
            await sendPushIfEnabled({
              profile_id: nextPlayer.profile_id,
              title: '🏎️ Du bist dran!',
              body: `${nextPlayer.profiles.display_name}, mach deinen Pick im F1 Fantasy Draft!`,
              url: '/f1-fantasy/draft',
              tag: 'draft-turn',
            })
          }
        }
      } catch (e) { console.warn('Push error:', e) }
    }

    return { error: error ? { message: error.message } : null }
  }

  async function adminMakePick(profileId, type, entityId) {
    const playerPicks = getPlayerPicks(profileId)
    const typePicks = playerPicks.filter(p => p.pick_type === type)

    if (type === 'driver' && typePicks.length >= 4) return { error: 'Bereits 4 Fahrer.' }
    if (type === 'constructor' && typePicks.length >= 2) return { error: 'Bereits 2 Teams.' }

    // FIX: niedrigste freie Slot-Nummer (Gap-Filling) statt count + 1
    // Verhindert Duplicate-Key-Fehler UND stellt sicher dass der Pick in F1-F4 / T1-T2 angezeigt wird
    const usedNumbers = typePicks.map(p => p.pick_number)
    const maxSlots = type === 'driver' ? 4 : 2
    let pickNumber = maxSlots + 1 // Fallback (sollte nie vorkommen wegen Check oben)
    for (let n = 1; n <= maxSlots; n++) {
      if (!usedNumbers.includes(n)) { pickNumber = n; break }
    }

    const { error } = await supabase.from('picks').insert({
      race_weekend_id: raceWeekendId,
      profile_id: profileId,
      pick_type: type,
      [type === 'driver' ? 'driver_id' : 'constructor_id']: entityId,
      pick_number: pickNumber,
    })

    if (!error) {
      await loadPicks()
      try {
        const { data: afterPicks } = await supabase
          .from('picks').select('profile_id').eq('race_weekend_id', raceWeekendId)
        const numPlayers = draftOrder.length
        const totalExpected = numPlayers * 6
        if ((afterPicks?.length ?? 0) < totalExpected) {
          const idx = (afterPicks?.length ?? 0) % numPlayers
          const nextPlayer = draftOrder[idx]
          if (nextPlayer?.profile_id && nextPlayer?.profiles?.display_name) {
            await sendPushIfEnabled({
              profile_id: nextPlayer.profile_id,
              title: '🏎️ Du bist dran!',
              body: `${nextPlayer.profiles.display_name}, mach deinen Pick im F1 Fantasy Draft!`,
              url: '/f1-fantasy/draft',
              tag: 'draft-turn',
            })
          }
        }
      } catch (e) { console.warn('Push error:', e) }
    }

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

    const { data: seasonPoints } = await supabase
      .from('player_race_points')
      .select('profile_id, total_points')
      .eq('season_id', currentRace.season_id)

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
      if (pb.total_points !== pa.total_points) return pb.total_points - pa.total_points
      const sa = seasonTotals[a.id] ?? 0
      const sb = seasonTotals[b.id] ?? 0
      if (sa !== sb) return sb - sa
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
