// sw-register.js - Custom registration handling first install and updates
if ('serviceWorker' in navigator) {
  // 1. Handle FIRST-TIME INSTALL (controllerchange from clients.claim())
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    console.log('[SW] Controller changed - reloading to let SW control requests')
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw-custom.js', {
      scope: '/',
      updateViaCache: 'none'
    }).then((reg) => {
      console.log('[SW] Registration successful')

      // 2. Handle UPDATES (for returning users with existing SW)
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        console.log('[SW] Update found, installing new worker...')

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available, tell it to skip waiting
            console.log('[SW] New version installed, activating...')
            newWorker.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })
    }).catch(error => {
      console.error('[SW] Registration failed:', error)
    })
  })
}

