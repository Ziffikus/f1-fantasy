import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Draft-Benachrichtigungen:
 * - Browser Notification (App offen)
 * - Web Push via Edge Function (App geschlossen)
 * - Ton
 * - App Icon Badge (neu)
 */
export function useDraftNotifications({ isMyTurn, isDraftComplete, myName, profileId, raceWeekendId }) {
  const wasMyTurn = useRef(false)

  // ✅ NEU: Badge-Hilfsfunktionen
  const setBadge = (count = 1) => {
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(count).catch(() => {})
    }
  }

  const clearBadge = () => {
    // Variante 1: direkt über navigator (App ist offen)
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {})
    }
    // Variante 2: über Service Worker (sicherer, funktioniert auch im Hintergrund)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_BADGE' })
    }
  }

  useEffect(() => {
    // ✅ NEU: Draft fertig → Badge immer löschen
    if (isDraftComplete) {
      wasMyTurn.current = false
      clearBadge()
      return
    }

    const justBecameMyTurn = isMyTurn && !wasMyTurn.current
    wasMyTurn.current = isMyTurn

    // ✅ NEU: Nicht mehr mein Turn (ich habe gepickt) → Badge löschen
    if (!isMyTurn) {
      clearBadge()
      return
    }

    if (!justBecameMyTurn) return

    playPing()

    // ✅ NEU: Badge setzen wenn ich dran bin und App offen ist
    setBadge(1)

    // Browser Notification (App offen)
    if (Notification.permission === 'granted') {
      try {
        const n = new Notification('🏎️ Du bist dran!', {
          body: `${myName ?? 'Du'}, mach deinen Pick im F1 Fantasy Draft.`,
          icon: '/f1-fantasy/icons/icon-192.svg',
          tag: 'draft-turn',
          requireInteraction: false,
        })
        setTimeout(() => n.close(), 8000)
      } catch (_) {}
    }

    // Web Push über Edge Function (für andere Geräte / App geschlossen)
    // Wird serverseitig getriggert wenn Picks sich ändern
  }, [isMyTurn, isDraftComplete])

  // ✅ NEU: Badge löschen wenn App in den Vordergrund kommt und ich nicht dran bin
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isMyTurn) {
        clearBadge()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isMyTurn])
}

/**
 * Push-Notification an einen Spieler senden (wird vom Draft-Realtime-Update aufgerufen)
 * Sendet nur wenn der Spieler NICHT gerade die App offen hat
 */
export async function sendDraftPushToPlayer(profileId, playerName) {
  try {
    // Pause-Status prüfen – wenn pausiert, kein Push senden
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'draft_push_paused')
      .maybeSingle()
    if (setting?.value === true) {
      console.log('[Push] Automatische Push-Benachrichtigungen sind pausiert, kein Push gesendet.')
      return
    }

    await supabase.functions.invoke('send-push', {
      body: {
        profile_id: profileId,
        title: '🏎️ Du bist dran!',
        body: `${playerName}, mach deinen Pick im F1 Fantasy Draft!`,
        url: '/f1-fantasy/draft',
        tag: 'draft-turn',
        badgeCount: 1, // ✅ NEU: Badge-Zahl mitschicken
      }
    })
  } catch (e) {
    console.warn('Push send failed:', e)
  }
}

function playPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
    setTimeout(() => ctx.close(), 600)
  } catch (_) {}
}
