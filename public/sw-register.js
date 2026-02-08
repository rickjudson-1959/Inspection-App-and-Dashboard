// sw-register.js - Simplified polling approach
if ('serviceWorker' in navigator) {
  const hasReloaded = sessionStorage.getItem('sw-reload-done')

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
        console.log('[SW] Already controlled by SW')
        return
      }

      // Wait for SW to activate and claim
      console.log('[SW] Waiting for SW to take control...')

      // Poll for control every 100ms for up to 3 seconds
      let attempts = 0
      const checkInterval = setInterval(() => {
        attempts++

        if (navigator.serviceWorker.controller) {
          console.log('[SW] SW now controls page')
          clearInterval(checkInterval)

          // Reload once to ensure SW intercepts all requests
          if (!hasReloaded) {
            console.log('[SW] Reloading page to activate offline mode...')
            sessionStorage.setItem('sw-reload-done', 'true')
            window.location.reload()
          }
        } else if (attempts > 30) {
          // Give up after 3 seconds
          console.log('[SW] SW did not take control, giving up')
          clearInterval(checkInterval)
        }
      }, 100)

    } catch (error) {
      console.error('[SW] Registration failed:', error)
    }
  })

  // Clear the flag when user navigates away
  window.addEventListener('beforeunload', () => {
    sessionStorage.removeItem('sw-reload-done')
  })
}

