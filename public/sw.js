// F1 Fantasy TBE – Service Worker
// Strategie: Network First – immer frische Daten, Push Notifications

const CACHE_NAME = 'f1-fantasy-v2'

// Installation – sofort aktivieren
self.addEventListener('install', event => {
  self.skipWaiting()
})

// Aktivierung – alte Caches löschen
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Fetch – Network First Strategie
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Supabase, Edge Functions und externe APIs nie cachen
  if (url.hostname.includes('supabase') || url.hostname.includes('jolpi') || url.hostname.includes('openf1')) {
    return // SW komplett ignorieren, Browser übernimmt
  }

  // HTML Navigation – immer Netzwerk
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/f1-fantasy/'))
    )
    return
  }

  // JS/CSS – Network First, Cache als Fallback
  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // Bilder – Cache First
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // Alles andere – direkt vom Netzwerk
  event.respondWith(fetch(request))
})

// ── Push Notifications ───────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return
  let data = {}
  try { data = event.data.json() } catch { data = { title: 'F1 Fantasy', body: event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(data.title ?? '🏎️ F1 Fantasy TBE', {
      body:    data.body    ?? 'Du hast eine neue Benachrichtigung.',
      icon:    data.icon    ?? '/f1-fantasy/icons/icon-192.svg',
      badge:   data.badge   ?? '/f1-fantasy/icons/icon-192.svg',
      tag:     data.tag     ?? 'f1-fantasy',
      data:    data.url ? { url: data.url } : {},
      vibrate: [200, 100, 200],
      requireInteraction: data.requireInteraction ?? false,
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/f1-fantasy/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.includes('/f1-fantasy') && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
