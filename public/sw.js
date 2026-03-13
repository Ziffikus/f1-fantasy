// F1 Fantasy TBE – Service Worker
// Handles: Push Notifications (auch bei geschlossener App)

const CACHE_NAME = 'f1-fantasy-v1'

// Installation
self.addEventListener('install', event => {
  self.skipWaiting()
})

// Activation
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// ── Push Notifications ──────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: 'F1 Fantasy', body: event.data.text() }
  }

  const options = {
    body:    data.body    ?? 'Du hast eine neue Benachrichtigung.',
    icon:    data.icon    ?? '/f1-fantasy/icons/icon-192.svg',
    badge:   data.badge   ?? '/f1-fantasy/icons/icon-192.svg',
    tag:     data.tag     ?? 'f1-fantasy',
    data:    data.url     ? { url: data.url } : {},
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction ?? false,
    actions: data.actions ?? [],
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? '🏎️ F1 Fantasy TBE', options)
  )
})

// Klick auf Notification → App öffnen / fokussieren
self.addEventListener('notificationclick', event => {
  event.notification.close()

  const url = event.notification.data?.url ?? '/f1-fantasy/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Bereits offenes Fenster fokussieren
      for (const client of clients) {
        if (client.url.includes('/f1-fantasy') && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Neues Fenster öffnen
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})
