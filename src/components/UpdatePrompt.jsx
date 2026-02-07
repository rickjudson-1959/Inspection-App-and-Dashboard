// UpdatePrompt.jsx - Shows a subtle notification when app has been updated
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useState, useEffect } from 'react'

function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false)
  const [autoDismissed, setAutoDismissed] = useState(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Check for updates every 10 minutes (less frequent to reduce server load)
      if (r) {
        setInterval(() => {
          r.update()
        }, 10 * 60 * 1000)
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  // Auto-dismiss the banner after 15 seconds if user doesn't interact
  useEffect(() => {
    if (needRefresh && !dismissed) {
      const timer = setTimeout(() => {
        setAutoDismissed(true)
      }, 15000)

      return () => clearTimeout(timer)
    }
  }, [needRefresh, dismissed])

  const handleUpdate = async () => {
    try {
      await updateServiceWorker(true)
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (error) {
      console.error('Error updating service worker:', error)
      window.location.reload()
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  if (!needRefresh || dismissed || autoDismissed) {
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
