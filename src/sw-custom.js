/* eslint-disable no-undef */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
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

// Activate event - claim clients and clear stale runtime caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event - claiming clients')
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clear the old runtime asset cache that may contain stale JS/CSS files
      // This prevents serving old JS chunks that no longer exist on the server
      caches.delete('egp-inspector-v2-assets')
    ]).then(() => {
      console.log('[SW] Clients claimed, stale caches cleared')
    })
  )
})

// API requests - network first with cache fallback (for offline support)
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

// NOTE: Static assets (scripts, styles, images) are handled by precacheAndRoute above.
// We intentionally do NOT add a separate CacheFirst route for these, because:
// - Precached assets already serve from cache with proper versioning
// - A CacheFirst runtime cache can serve stale JS chunks after deployments,
//   causing "MIME type text/html" errors when old chunk URLs return 404 HTML pages

// Handle navigation requests only - serve precached index.html for SPA offline support
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Only handle same-origin navigation requests
  if (url.origin !== self.location.origin) return
  if (event.request.mode !== 'navigate') return

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
      // Try network before giving up
      return fetch(event.request).catch(() =>
        new Response('Offline - page not available', {
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        })
      )
    })
  )
})

console.log('[SW] Service worker ready')
