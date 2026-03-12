import { useEffect, useRef, useState } from 'react'

export function useDraftNotifications({ isMyTurn, isDraftComplete, myName }) {
  const wasMyTurn = useRef(false)

  useEffect(() => {
    if (!('Notification' in window)) return
    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (isDraftComplete) { wasMyTurn.current = false; return }

    const justBecameMyTurn = isMyTurn && !wasMyTurn.current
    wasMyTurn.current = isMyTurn
    if (!justBecameMyTurn) return

    playPing()

    if (Notification.permission === 'granted') {
      try {
        const n = new Notification('🏎️ Du bist dran!', {
          body: `${myName ?? 'Du'}, mach deinen Pick im F1 Fantasy Draft.`,
          icon: '/f1-fantasy/favicon.ico',
          tag: 'draft-turn',
          requireInteraction: false,
        })
        setTimeout(() => n.close(), 8000)
      } catch (_) {}
    }
  }, [isMyTurn, isDraftComplete])
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
