// Custom service worker registration with aggressive update strategy
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      console.log('[SW] Starting registration process...')

      // Get all existing registrations
      const registrations = await navigator.serviceWorker.getRegistrations()
      console.log(`[SW] Found ${registrations.length} existing registration(s)`)

      // Unregister all old service workers
      for (const registration of registrations) {
        console.log('[SW] Unregistering old service worker:', registration.scope)
        await registration.unregister()
      }

      // Clear old caches only (not the new v2 caches)
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        console.log(`[SW] Found ${cacheNames.length} cache(s)`)

        for (const cacheName of cacheNames) {
          // Only delete old caches, preserve egp-inspector-v2 caches
          if (!cacheName.includes('egp-inspector-v2')) {
            console.log('[SW] Deleting old cache:', cacheName)
            await caches.delete(cacheName)
          } else {
            console.log('[SW] Preserving new cache:', cacheName)
          }
        }
      }

      // Small delay to ensure unregistration completes
      await new Promise(resolve => setTimeout(resolve, 100))

      // Register new service worker
      console.log('[SW] Registering new service worker...')
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none' // Never use cached SW file
      })

      console.log('[SW] Registration successful:', registration.scope)

      // Check for updates immediately
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        console.log('[SW] Update found, installing new worker...')

        newWorker.addEventListener('statechange', () => {
          console.log('[SW] New worker state:', newWorker.state)
          if (newWorker.state === 'activated') {
            console.log('[SW] New service worker activated!')
            // Don't reload automatically - let skipWaiting handle it
          }
        })
      })

      // Force check for updates
      await registration.update()
      console.log('[SW] Update check complete')

      // Log current controller status
      if (navigator.serviceWorker.controller) {
        console.log('[SW] Page is controlled by service worker')
      } else {
        console.log('[SW] Page is NOT controlled by service worker yet. Will take control on next load.')
      }

    } catch (error) {
      console.error('[SW] Registration failed:', error)
    }
  })

  // Handle controller change (when new SW takes control)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[SW] Controller changed - new service worker has taken control')

    // Only reload if we haven't already reloaded for this SW version
    const swReloaded = sessionStorage.getItem('sw-reloaded')
    if (!swReloaded) {
      console.log('[SW] Reloading page once to ensure SW controls all requests...')
      sessionStorage.setItem('sw-reloaded', 'true')
      window.location.reload()
    } else {
      console.log('[SW] Already reloaded for this session, skipping reload')
    }
  })

  // Log messages from service worker
  navigator.serviceWorker.addEventListener('message', (event) => {
    console.log('[SW] Message from service worker:', event.data)
  })
}
