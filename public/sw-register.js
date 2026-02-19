// sw-register.js - Service worker registration (non-module, runs before React)
// Handles SW registration and periodic update checks.
// UpdatePrompt.jsx handles the update UI and cache clearing via useRegisterSW.
// index.html self-healing script handles fatal load failures.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      console.log('[SW] Registering service worker...')

      const registration = await navigator.serviceWorker.register('/sw-custom.js', {
        scope: '/',
        updateViaCache: 'none'  // Always fetch SW from network
      })

      console.log('[SW] Registration successful')

      // Check for updates immediately
      registration.update()

      // Check for updates every 60 seconds
      setInterval(() => {
        registration.update()
      }, 60 * 1000)

      // Log update lifecycle events (no forced reloads — UpdatePrompt handles that)
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        console.log('[SW] New service worker installing...')

        newWorker.addEventListener('statechange', () => {
          console.log('[SW] Service worker state:', newWorker.state)
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] New version installed and waiting to activate')
            // UpdatePrompt.jsx will detect this via useRegisterSW and handle the update
          }
        })
      })

      if (navigator.serviceWorker.controller) {
        console.log('[SW] Page is controlled by service worker')
      } else {
        console.log('[SW] Waiting for service worker to take control...')
        await navigator.serviceWorker.ready
        console.log('[SW] Service worker is ready')
      }

    } catch (error) {
      console.error('[SW] Registration failed:', error)
    }
  })
}
