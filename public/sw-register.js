// sw-register.js - Simple SW registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      console.log('[SW] Registering service worker...')

      const registration = await navigator.serviceWorker.register('/sw-custom.js', {
        scope: '/',
        updateViaCache: 'none'
      })

      console.log('[SW] Registration successful')

      // If we already have a controller, we're good
      if (navigator.serviceWorker.controller) {
        console.log('[SW] Page is controlled by service worker')
        return
      }

      console.log('[SW] Waiting for service worker to take control...')

      // Wait for the service worker to be ready and controlling
      await navigator.serviceWorker.ready
      console.log('[SW] Service worker is ready')

    } catch (error) {
      console.error('[SW] Registration failed:', error)
    }
  })
}
