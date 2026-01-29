// UpdatePrompt.jsx - Shows a banner when a new app version is available
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useState } from 'react'

function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Check for updates every 5 minutes
      if (r) {
        setInterval(() => {
          r.update()
        }, 5 * 60 * 1000)
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  const handleUpdate = async () => {
    try {
      // Update the service worker and wait for it to complete
      await updateServiceWorker(true)
      // If the page doesn't reload automatically, force it after a short delay
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error) {
      console.error('Error updating service worker:', error)
      // Force reload as fallback
      window.location.reload()
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    // Reset after 30 minutes so they see it again if still on old version
    setTimeout(() => setDismissed(false), 30 * 60 * 1000)
  }

  if (!needRefresh || dismissed) {
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
      padding: '12px 20px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      maxWidth: '90vw',
      animation: 'slideUp 0.3s ease-out'
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(100px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>

      <span style={{ fontSize: '20px' }}>🔄</span>

      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', marginBottom: '2px' }}>New Version Available</strong>
        <span style={{ fontSize: '13px', opacity: 0.9 }}>Click update to get the latest features</span>
      </div>

      <button
        onClick={handleUpdate}
        style={{
          padding: '8px 16px',
          backgroundColor: '#4caf50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '14px'
        }}
      >
        Update Now
      </button>

      <button
        onClick={handleDismiss}
        style={{
          padding: '6px 10px',
          backgroundColor: 'transparent',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.5)',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px'
        }}
      >
        Later
      </button>
    </div>
  )
}

export default UpdatePrompt
