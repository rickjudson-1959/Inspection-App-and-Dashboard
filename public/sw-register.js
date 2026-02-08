// sw-register.js - SW registration with auto-update
if ('serviceWorker' in navigator) {
  // Prevent reload loops
  let refreshing = false

  window.addEventListener('load', async () => {
    try {
      console.log('[SW] Registering service worker...')

      const registration = await navigator.serviceWorker.register('/sw-custom.js', {
        scope: '/',
        updateViaCache: 'none'
      })

      console.log('[SW] Registration successful')

      // Check for updates immediately
      registration.update()

      // Check for updates every 60 seconds
      setInterval(() => {
        registration.update()
      }, 60 * 1000)

      // Handle updates - when a new SW is waiting
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        console.log('[SW] New service worker installing...')

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW is ready, reload to get the new version
            console.log('[SW] New version available, reloading...')
            if (!refreshing) {
              refreshing = true
              window.location.reload()
            }
          }
        })
      })

      // If the controller changes (new SW took over), reload
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] Controller changed, reloading...')
        if (!refreshing) {
          refreshing = true
          window.location.reload()
        }
      })

      // If we already have a controller, we're good
      if (navigator.serviceWorker.controller) {
        console.log('[SW] Page is controlled by service worker')
        return
      }

      console.log('[SW] Waiting for service worker to take control...')
      await navigator.serviceWorker.ready
      console.log('[SW] Service worker is ready')

    } catch (error) {
      console.error('[SW] Registration failed:', error)
    }
  })
}
