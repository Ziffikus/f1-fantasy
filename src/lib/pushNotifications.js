import { supabase } from './supabase'

/**
 * Service Worker registrieren
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/f1-fantasy/sw.js', { scope: '/f1-fantasy/' })
    return reg
  } catch (e) {
    console.warn('SW Registration failed:', e)
    return null
  }
}

/**
 * Push-Berechtigung anfragen + Subscription in Supabase speichern
 */
export async function subscribeToPush(profileId) {
  if (!('PushManager' in window)) {
    return { error: 'Push nicht unterstützt auf diesem Gerät.' }
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) {
    return { error: 'VAPID Key fehlt – bitte in .env.local setzen.' }
  }

  // Berechtigung anfragen
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { error: 'Berechtigung verweigert.' }
  }

  const reg = await navigator.serviceWorker.ready

  // Vorhandene Subscription prüfen
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }

  // In Supabase speichern
  const { error } = await supabase.from('push_subscriptions').upsert({
    profile_id: profileId,
    endpoint:   sub.endpoint,
    p256dh:     arrayBufferToBase64(sub.getKey('p256dh')),
    auth:       arrayBufferToBase64(sub.getKey('auth')),
    user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: 'profile_id,endpoint' })

  if (error) return { error: error.message }
  return { success: true }
}

/**
 * Subscription entfernen
 */
export async function unsubscribeFromPush(profileId) {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await sub.unsubscribe()
    await supabase.from('push_subscriptions')
      .delete()
      .eq('profile_id', profileId)
      .eq('endpoint', sub.endpoint)
  }
  return { success: true }
}

/**
 * Aktuellen Push-Status prüfen
 */
export async function getPushStatus() {
  if (!('PushManager' in window) || !('serviceWorker' in navigator)) {
    return { supported: false }
  }
  const permission = Notification.permission
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return {
    supported: true,
    permission,
    subscribed: !!sub,
  }
}

// ── Helpers ──────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}
