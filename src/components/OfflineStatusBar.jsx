import React from 'react'
import { useOnlineStatus, useSyncStatus, usePWAInstall } from '../offline/hooks'
import { syncManager } from '../offline/syncManager'

export default function OfflineStatusBar() {
  const isOnline = useOnlineStatus()
  const { pendingCount, syncStatus, refreshPendingCount } = useSyncStatus()
  const { isInstallable, installApp } = usePWAInstall()

  const handleSyncNow = async () => {
    if (isOnline && pendingCount > 0) {
      await syncManager.syncAllPending()
      refreshPendingCount()
    }
  }

  const handleInstall = async () => {
    const installed = await installApp()
    if (installed) {
      alert('App installed successfully!')
    }
  }

  // Don't show bar if online with no pending items and not installable
  if (isOnline && pendingCount === 0 && !isInstallable && syncStatus !== 'syncing') {
    return null
  }

  const barStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10000,
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: isOnline
      ? (syncStatus === 'syncing' ? '#4caf50' : '#2196f3')
      : '#ff9800',
    color: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
  }

  const leftSection = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  }

  const rightSection = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }

  const buttonStyle = {
    padding: '4px 12px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    transition: 'background-color 0.2s'
  }

  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '24px',
    height: '24px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.3)',
    padding: '0 6px',
    fontSize: '13px',
    fontWeight: 600
  }

  const iconStyle = {
    width: '18px',
    height: '18px',
    marginRight: '4px'
  }

  const getStatusText = () => {
    if (!isOnline) {
      return 'Offline Mode'
    }
    if (syncStatus === 'syncing') {
      return 'Syncing...'
    }
    if (pendingCount > 0) {
      return 'Reports Pending'
    }
    return 'Online'
  }

  const getStatusIcon = () => {
    if (!isOnline) {
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 8.98C20.93 5.9 16.69 4 12 4C7.31 4 3.07 5.9 0 8.98L12 21L24 8.98zM2.92 9.07C5.51 7.08 8.67 6 12 6s6.49 1.08 9.08 3.07l-1.43 1.43C17.5 8.94 14.86 8 12 8s-5.5.94-7.65 2.5L2.92 9.07zM12 10c2.14 0 4.09.71 5.65 1.91l-1.42 1.42C15.15 12.5 13.63 12 12 12s-3.15.5-4.23 1.33l-1.42-1.42C7.91 10.71 9.86 10 12 10zm0 4c1.36 0 2.59.5 3.54 1.33l-1.41 1.41C13.54 16.27 12.79 16 12 16s-1.54.27-2.13.74l-1.41-1.41C9.41 14.5 10.64 14 12 14z"/>
        </svg>
      )
    }
    if (syncStatus === 'syncing') {
      return (
        <svg style={{ ...iconStyle, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
      )
    }
    return (
      <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21z"/>
      </svg>
    )
  }

  return (
    <>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={barStyle}>
        <div style={leftSection}>
          {getStatusIcon()}
          <span>{getStatusText()}</span>
          {pendingCount > 0 && (
            <span style={badgeStyle}>{pendingCount}</span>
          )}
        </div>

        <div style={rightSection}>
          {isInstallable && (
            <button
              style={buttonStyle}
              onClick={handleInstall}
              onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.3)'}
              onMouseOut={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
            >
              Install App
            </button>
          )}

          {isOnline && pendingCount > 0 && syncStatus !== 'syncing' && (
            <button
              style={buttonStyle}
              onClick={handleSyncNow}
              onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.3)'}
              onMouseOut={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'}
            >
              Sync Now
            </button>
          )}
        </div>
      </div>
      {/* Spacer to push content down when bar is visible */}
      <div style={{ height: '44px' }} />
    </>
  )
}
