import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Draft-Benachrichtigungen:
 * - Browser Notification (App offen)
 * - Web Push via Edge Function (App geschlossen)
 * - Ton
 */
export function useDraftNotifications({ isMyTurn, isDraftComplete, myName, profileId, raceWeekendId }) {
  const wasMyTurn = useRef(false)

  useEffect(() => {
    if (isDraftComplete) { wasMyTurn.current = false; return }

    const justBecameMyTurn = isMyTurn && !wasMyTurn.current
    wasMyTurn.current = isMyTurn
    if (!justBecameMyTurn) return

    playPing()

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
}

/**
 * Push-Notification an einen Spieler senden (wird vom Draft-Realtime-Update aufgerufen)
 * Sendet nur wenn der Spieler NICHT gerade die App offen hat
 */
export async function sendDraftPushToPlayer(profileId, playerName) {
  try {
    await supabase.functions.invoke('send-push', {
      body: {
        profile_id: profileId,
        title: '🏎️ Du bist dran!',
        body: `${playerName}, mach deinen Pick im F1 Fantasy Draft!`,
        url: '/f1-fantasy/draft',
        tag: 'draft-turn',
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
