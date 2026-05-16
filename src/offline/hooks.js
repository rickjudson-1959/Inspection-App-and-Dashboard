import { useState, useEffect, useCallback, useRef } from 'react'
import { getPendingReports, getPendingReportCount } from './db'

const REACHABILITY_TIMEOUT_MS = 5000
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// Probe Supabase to confirm actual network reachability. navigator.onLine
// returns true on captive-portal Wi-Fi and flaky cell connections — a
// HEAD round-trip is the only way to know the backend is actually
// reachable. Any HTTP response (200/401/404) proves we hit the server;
// only a network error or timeout means we're truly offline.
async function confirmReachable() {
  if (!SUPABASE_URL) return true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS)
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal,
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// Hook to track online/offline status
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const inFlightRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function checkOnlineStatus() {
      if (cancelled) return
      // Browser says offline → trust it, no fetch.
      if (!navigator.onLine) {
        setIsOnline(prev => prev !== false ? false : prev)
        return
      }
      // Browser says online → confirm with a HEAD before flipping to true.
      // Skip if a probe is already in flight (avoid stacking on the 2s tick).
      if (inFlightRef.current) return
      inFlightRef.current = true
      try {
        const reachable = await confirmReachable()
        if (cancelled) return
        setIsOnline(prev => prev !== reachable ? reachable : prev)
      } finally {
        inFlightRef.current = false
      }
    }

    function handleOnline() {
      // 'online' event: confirm via fetch before flipping to true.
      checkOnlineStatus()
    }

    function handleOffline() {
      // 'offline' event: immediate, no fetch.
      setIsOnline(false)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        checkOnlineStatus()
      }
    }

    function handleFocus() {
      checkOnlineStatus()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    // Periodic check every 2 seconds as fallback
    const interval = setInterval(checkOnlineStatus, 2000)

    // Initial check
    checkOnlineStatus()

    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      clearInterval(interval)
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
      // Only log if it's not a database closing error (common during navigation)
      if (!error?.message?.includes('database connection is closing')) {
        console.error('Error fetching pending count:', error)
      }
      // Reset counts on error to avoid stale data
      setPendingCount(0)
      setPendingReports([])
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
