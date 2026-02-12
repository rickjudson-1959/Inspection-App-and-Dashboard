// UpdatePrompt.jsx - Shows a notification when app has been updated
// This component MUST be mounted in App.jsx to show on all pages including login
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useState, useEffect } from 'react'
import { APP_VERSION, BUILD_DATE } from '../version.js'

const VERSION_STORAGE_KEY = 'pipe_up_app_version'

function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false)
  const [versionMismatch, setVersionMismatch] = useState(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
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

  // Check for version mismatch on mount
  useEffect(() => {
    const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY)
    console.log(`[UpdatePrompt] Current version: ${APP_VERSION}, Stored version: ${storedVersion}`)

    if (storedVersion && storedVersion !== APP_VERSION) {
      console.log('[UpdatePrompt] Version mismatch detected - showing update prompt')
      setVersionMismatch(true)
    } else if (!storedVersion) {
      // First time user - store the version
      localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION)
      console.log('[UpdatePrompt] First visit - version stored')
    }
  }, [])

  // Log when needRefresh changes
  useEffect(() => {
    if (needRefresh) {
      console.log('[PWA] Update prompt should be visible now')
    }
  }, [needRefresh])

  // Show prompt if either service worker detects update OR version mismatch
  const shouldShow = needRefresh || versionMismatch

  const handleUpdate = async () => {
    try {
      // Update stored version before reload
      localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION)

      if (needRefresh) {
        await updateServiceWorker(true)
      }

      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (error) {
      console.error('Error updating service worker:', error)
      localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION)
      window.location.reload()
    }
  }

  const handleDismiss = () => {
    // Store current version so prompt doesn't show again until next update
    localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION)
    setDismissed(true)
    setVersionMismatch(false)
  }

  if (!shouldShow || dismissed) {
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
        <span style={{ opacity: 0.95 }}>App updated. Refresh to see new features.</span>
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
        Refresh
      </button>

      <button
        onClick={handleDismiss}
        style={{
          padding: '4px 8px',
          backgroundColor: 'transparent',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: '1',
          opacity: 0.8
        }}
        title="Dismiss (will update on next visit)"
      >
        ×
      </button>
    </div>
  )
}

export default UpdatePrompt
