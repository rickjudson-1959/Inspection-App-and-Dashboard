/* eslint-disable no-undef */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { setCacheNameDetails, cacheNames } from 'workbox-core'

// Configure Workbox cache names BEFORE any other Workbox calls
setCacheNameDetails({
  prefix: 'egp-inspector-v2',
  suffix: ''
})

console.log('[SW] Initializing service worker')

// Precache all assets (injected by vite-plugin-pwa)
const manifest = self.__WB_MANIFEST || []
precacheAndRoute(manifest)
console.log('[SW] Precached', manifest.length, 'assets')

// Clean up old caches
cleanupOutdatedCaches()

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Install event - calling skipWaiting')
  self.skipWaiting()
})

// Activate event - claim clients immediately
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event - claiming clients')
  event.waitUntil(
    self.clients.claim().then(() => {
      console.log('[SW] Clients claimed successfully')
    })
  )
})

// API requests - network first with cache fallback
registerRoute(
  /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
  new NetworkFirst({
    cacheName: 'egp-inspector-v2-api',
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 24 * 60 * 60,
      }),
    ],
  }),
  'GET'
)

// Static assets - cache first
registerRoute(
  ({ request }) =>
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image',
  new CacheFirst({
    cacheName: 'egp-inspector-v2-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
)

// Handle ALL fetch events for offline support
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip cross-origin and chrome-extension requests
  if (url.origin !== self.location.origin || url.protocol === 'chrome-extension:') {
    return
  }

  // Handle navigation requests (HTML pages) - serve index.html from precache
  if (event.request.mode === 'navigate') {
    console.log('[SW] Navigation:', url.pathname)
    event.respondWith(
      caches.open(cacheNames.precache).then(cache => {
        return cache.keys().then(keys => {
          // Find index.html in the precache (it has a revision query param)
          const indexKey = keys.find(k => k.url.includes('/index.html'))
          if (indexKey) {
            console.log('[SW] Serving cached index.html')
            return cache.match(indexKey)
          }
          // Fallback to network
          console.log('[SW] index.html not in cache, fetching from network')
          return fetch(event.request)
        })
      }).catch(err => {
        console.error('[SW] Navigation error:', err)
        return new Response('Offline - page not available', {
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        })
      })
    )
    return
  }

  // For other same-origin requests, try cache first
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(response => {
      if (response) {
        return response
      }
      return fetch(event.request).catch(() => {
        return new Response('Offline', { status: 503 })
      })
    })
  )
})

console.log('[SW] Service worker ready')
