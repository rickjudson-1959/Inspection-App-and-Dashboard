// Register service worker with auto-reload on control
if ('serviceWorker' in navigator) {
  // Set up controllerchange listener FIRST, before registration
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[SW Reg] Controller changed - SW has taken control')

    // Check if we've already reloaded for this session
    const hasReloaded = sessionStorage.getItem('sw-reloaded')

    if (!hasReloaded) {
      console.log('[SW Reg] Reloading once to let SW control all requests...')
      sessionStorage.setItem('sw-reloaded', 'true')
      window.location.reload()
    } else {
      console.log('[SW Reg] Already reloaded, not reloading again')
    }
  })

  window.addEventListener('load', async () => {
    try {
      console.log('[SW Reg] Starting registration...')

      const registration = await navigator.serviceWorker.register('/sw-custom.js', {
        scope: '/',
        updateViaCache: 'none'
      })

      console.log('[SW Reg] Registration successful')

      // Wait a bit for clients.claim() to complete
      await new Promise(resolve => setTimeout(resolve, 100))

      // Check current control status
      if (navigator.serviceWorker.controller) {
        console.log('[SW Reg] Page is now controlled by SW')

        // If we just got controlled and haven't reloaded yet, reload now
        const hasReloaded = sessionStorage.getItem('sw-reloaded')
        if (!hasReloaded) {
          console.log('[SW Reg] Reloading to ensure SW controls all requests...')
          sessionStorage.setItem('sw-reloaded', 'true')
          window.location.reload()
        }
      } else {
        console.log('[SW Reg] Page is not controlled yet, waiting for SW to activate...')
      }

    } catch (error) {
      console.error('[SW Reg] Registration failed:', error)
    }
  })
}

