/* eslint-disable no-undef */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// Set cache name with version
self.__WB_CACHE_NAME = 'egp-inspector-v2-precache'

// Take control immediately
self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
  console.log('[SW Custom] Service worker activated and claimed clients')
})

// Clean up old caches
cleanupOutdatedCaches()

// Precache all assets (injected by vite-plugin-pwa)
// This self.__WB_MANIFEST will be replaced by vite-plugin-pwa with the actual file list
const manifest = self.__WB_MANIFEST || []
precacheAndRoute(manifest)

console.log('[SW Custom] Precached', manifest.length, 'assets')

// Navigation requests (HTML pages) - serve from cache, fallback to network
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'egp-inspector-v2-pages',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
)

console.log('[SW Custom] Registered navigation route')

// API requests - network first with cache fallback
registerRoute(
  /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
  new NetworkFirst({
    cacheName: 'egp-inspector-v2-api',
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 24 * 60 * 60, // 24 hours
      }),
    ],
  }),
  'GET'
)

console.log('[SW Custom] Registered API route')

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
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
)

console.log('[SW Custom] Registered static assets route')

// Log fetch events for debugging
self.addEventListener('fetch', (event) => {
  console.log('[SW Custom] Fetch:', event.request.url)
})

console.log('[SW Custom] Service worker setup complete')
