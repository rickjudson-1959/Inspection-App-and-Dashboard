// UpdatePrompt.jsx - Automatically clears caches and reloads on version change
// This component MUST be mounted in App.jsx to show on all pages including login
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useState, useEffect } from 'react'
import { APP_VERSION, BUILD_DATE } from '../version.js'

const VERSION_STORAGE_KEY = 'pipe_up_app_version'

// Keys to preserve during cache clear (Supabase auth tokens)
const PRESERVE_KEYS = [
  'sb-gkwbvwsuoazmarsqsjhs-auth-token'
]

// Clear all caches and legacy data
async function clearAllCaches() {
  console.log('[UpdatePrompt] Clearing all caches...')

  // 1. Clear Service Worker caches
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys()
      console.log('[UpdatePrompt] Found caches:', cacheNames)
      await Promise.all(
        cacheNames.map(cacheName => {
          console.log(`[UpdatePrompt] Deleting cache: ${cacheName}`)
          return caches.delete(cacheName)
        })
      )
      console.log('[UpdatePrompt] All service worker caches cleared')
    } catch (error) {
      console.error('[UpdatePrompt] Error clearing caches:', error)
    }
  }

  // 2. Unregister service workers
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const registration of registrations) {
        console.log('[UpdatePrompt] Unregistering service worker')
        await registration.unregister()
      }
      console.log('[UpdatePrompt] Service workers unregistered')
    } catch (error) {
      console.error('[UpdatePrompt] Error unregistering service workers:', error)
    }
  }

  // 3. Clear localStorage except preserved keys
  try {
    const preserved = {}
    PRESERVE_KEYS.forEach(key => {
      const value = localStorage.getItem(key)
      if (value) preserved[key] = value
    })

    localStorage.clear()
    console.log('[UpdatePrompt] localStorage cleared')

    // Restore preserved items
    Object.entries(preserved).forEach(([key, value]) => {
      localStorage.setItem(key, value)
    })
    console.log('[UpdatePrompt] Preserved auth tokens restored')
  } catch (error) {
    console.error('[UpdatePrompt] Error clearing localStorage:', error)
  }

  // 4. Clear sessionStorage
  try {
    sessionStorage.clear()
    console.log('[UpdatePrompt] sessionStorage cleared')
  } catch (error) {
    console.error('[UpdatePrompt] Error clearing sessionStorage:', error)
  }

  // 5. Clear IndexedDB databases (common PWA cache DBs)
  if ('indexedDB' in window) {
    try {
      const databases = await indexedDB.databases?.() || []
      for (const db of databases) {
        if (db.name && !db.name.includes('supabase')) {
          console.log(`[UpdatePrompt] Deleting IndexedDB: ${db.name}`)
          indexedDB.deleteDatabase(db.name)
        }
      }
      console.log('[UpdatePrompt] IndexedDB cleared')
    } catch (error) {
      console.error('[UpdatePrompt] Error clearing IndexedDB:', error)
    }
  }
}

function UpdatePrompt() {
  const [isClearing, setIsClearing] = useState(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.log('[PWA] Service worker registered:', swUrl)
      if (r) {
        // Check for updates immediately on registration
        r.update()

        // Then check every 5 minutes for updates
        setInterval(() => {
          console.log('[PWA] Checking for updates...')
          r.update()
        }, 5 * 60 * 1000)
      }
    },
    onRegisterError(error) {
      console.log('[PWA] SW registration error:', error)
    },
    onNeedRefresh() {
      console.log('[PWA] New version available!')
    }
  })

  // Check for version mismatch on mount - AUTO CLEAR AND RELOAD
  useEffect(() => {
    const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY)
    console.log(`[UpdatePrompt] Current version: ${APP_VERSION}, Stored version: ${storedVersion}`)

    if (storedVersion && storedVersion !== APP_VERSION) {
      console.log('[UpdatePrompt] Version mismatch detected - AUTO CLEARING CACHES')
      setIsClearing(true)

      // Clear caches and reload
      clearAllCaches().then(() => {
        // Store new version
        localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION)
        console.log('[UpdatePrompt] Version updated, reloading...')

        // Small delay to ensure everything is flushed
        setTimeout(() => {
          window.location.reload()
        }, 500)
      })
    } else if (!storedVersion) {
      // First time user - store the version
      localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION)
      console.log('[UpdatePrompt] First visit - version stored')
    }
  }, [])

  // Handle service worker refresh prompt (manual refresh still available)
  const handleUpdate = async () => {
    try {
      setIsClearing(true)
      await clearAllCaches()
      localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION)

      if (needRefresh) {
        await updateServiceWorker(true)
      }

      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (error) {
      console.error('Error updating:', error)
      window.location.reload()
    }
  }

  // Show clearing indicator when auto-clearing
  if (isClearing) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        color: 'white'
      }}>
        <div style={{
          fontSize: '24px',
          marginBottom: '16px',
          animation: 'spin 1s linear infinite'
        }}>
          ⟳
        </div>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>Updating App...</div>
        <div style={{ fontSize: '14px', marginTop: '8px', opacity: 0.8 }}>
          Clearing cache and loading new version
        </div>
      </div>
    )
  }

  // Show prompt only for service worker updates (version mismatch auto-handles)
  if (!needRefresh) {
    return null
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#1976d2',
      color: 'white',
      padding: '10px 18px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      maxWidth: '90vw',
      fontSize: '14px',
      animation: 'slideUp 0.3s ease-out'
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(100px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>

      <span style={{ fontSize: '18px' }}>✨</span>

      <div style={{ flex: 1 }}>
        <span style={{ opacity: 0.95 }}>New version available!</span>
      </div>

      <button
        onClick={handleUpdate}
        style={{
          padding: '6px 14px',
          backgroundColor: '#4caf50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: '500',
          fontSize: '13px'
        }}
      >
        Update Now
      </button>
    </div>
  )
}

export default UpdatePrompt
