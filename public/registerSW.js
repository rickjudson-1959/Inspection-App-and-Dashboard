// Register service worker with auto-reload on control
if ('serviceWorker' in navigator) {
  // Handle controller change (when SW takes control)
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

      // Check current control status
      if (navigator.serviceWorker.controller) {
        console.log('[SW Reg] Page is already controlled by SW')
      } else {
        console.log('[SW Reg] Page is not controlled yet, waiting for SW to activate...')
      }

    } catch (error) {
      console.error('[SW Reg] Registration failed:', error)
    }
  })
}

