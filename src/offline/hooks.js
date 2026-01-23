import { useState, useEffect, useCallback } from 'react'
import { getPendingReports, getPendingReportCount } from './db'

// Hook to track online/offline status
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

// Hook to track sync status and pending report count
export function useSyncStatus() {
  const [pendingCount, setPendingCount] = useState(0)
  const [syncStatus, setSyncStatus] = useState('idle') // 'idle', 'syncing', 'error'
  const [lastSyncTime, setLastSyncTime] = useState(null)
  const [pendingReports, setPendingReports] = useState([])

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingReportCount()
      setPendingCount(count)
      const reports = await getPendingReports()
      setPendingReports(reports)
    } catch (error) {
      console.error('Error fetching pending count:', error)
    }
  }, [])

  useEffect(() => {
    refreshPendingCount()

    // Refresh count every 30 seconds
    const interval = setInterval(refreshPendingCount, 30000)

    // Listen for custom sync events
    function handleSyncStart() {
      setSyncStatus('syncing')
    }

    function handleSyncComplete(event) {
      setSyncStatus('idle')
      setLastSyncTime(Date.now())
      refreshPendingCount()
    }

    function handleSyncError() {
      setSyncStatus('error')
      refreshPendingCount()
    }

    function handleReportSaved() {
      refreshPendingCount()
    }

    window.addEventListener('sync-start', handleSyncStart)
    window.addEventListener('sync-complete', handleSyncComplete)
    window.addEventListener('sync-error', handleSyncError)
    window.addEventListener('offline-report-saved', handleReportSaved)

    return () => {
      clearInterval(interval)
      window.removeEventListener('sync-start', handleSyncStart)
      window.removeEventListener('sync-complete', handleSyncComplete)
      window.removeEventListener('sync-error', handleSyncError)
      window.removeEventListener('offline-report-saved', handleReportSaved)
    }
  }, [refreshPendingCount])

  return {
    pendingCount,
    syncStatus,
    lastSyncTime,
    pendingReports,
    refreshPendingCount,
    setSyncStatus
  }
}

// Hook to detect and prompt for PWA installation
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    function handleBeforeInstallPrompt(e) {
      e.preventDefault()
      setDeferredPrompt(e)
      setIsInstallable(true)
    }

    function handleAppInstalled() {
      setIsInstalled(true)
      setIsInstallable(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const installApp = useCallback(async () => {
    if (!deferredPrompt) return false

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    setDeferredPrompt(null)
    setIsInstallable(false)

    return outcome === 'accepted'
  }, [deferredPrompt])

  return {
    isInstallable,
    isInstalled,
    installApp
  }
}

// Hook to register service worker and handle updates
export function useServiceWorker() {
  const [needsUpdate, setNeedsUpdate] = useState(false)
  const [registration, setRegistration] = useState(null)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Vite PWA will register the service worker, but we can listen for updates
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg)
      })

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // New service worker activated
        window.location.reload()
      })
    }
  }, [])

  const updateServiceWorker = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
  }, [registration])

  return {
    needsUpdate,
    updateServiceWorker
  }
}
