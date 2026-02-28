import React from 'react'
import { useOnlineStatus, useSyncStatus } from '../offline/hooks'
import { syncManager } from '../offline/syncManager'

export default function OfflineStatusBar() {
  const isOnline = useOnlineStatus()
  const { pendingCount, syncStatus, refreshPendingCount } = useSyncStatus()

  const handleSyncNow = async () => {
    if (isOnline && pendingCount > 0) {
      await syncManager.syncAllPending()
      refreshPendingCount()
    }
  }

  // Only show when offline or there are pending items to sync
  const showBar = !isOnline || pendingCount > 0

  if (!showBar) return null

  return (
    <>
      {/* CSS for safe area and animations */}
      <style>
        {`
          #offline-status-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 9999;
            padding: 12px 16px;
            padding-top: max(12px, env(safe-area-inset-top, 12px));
            background-color: ${isOnline ? '#4caf50' : '#ff9800'};
            color: #fff;
            font-size: 16px;
            font-weight: bold;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
            -webkit-font-smoothing: antialiased;
          }

          #offline-status-bar .sync-btn {
            padding: 10px 20px;
            min-height: 44px;
            background-color: rgba(255,255,255,0.25);
            color: #fff;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
          }

          #offline-status-bar .sync-btn:active {
            background-color: rgba(255,255,255,0.4);
          }

          #offline-status-spacer {
            height: max(52px, calc(52px + env(safe-area-inset-top, 0px)));
          }

          @media (max-width: 400px) {
            #offline-status-bar {
              font-size: 14px;
              padding: 10px 12px;
              padding-top: max(10px, env(safe-area-inset-top, 10px));
            }
            #offline-status-bar .sync-btn {
              padding: 8px 16px;
              font-size: 13px;
            }
          }
        `}
      </style>

      {/* Status bar */}
      <div id="offline-status-bar">
        <span>
          {isOnline ? '🟢 Online' : '🟠 Offline'}
          {pendingCount > 0 && ` • ${pendingCount} pending`}
          {syncStatus === 'syncing' && ' (syncing...)'}
        </span>
        {isOnline && pendingCount > 0 && syncStatus !== 'syncing' && (
          <button className="sync-btn" onClick={handleSyncNow}>
            Sync Now
          </button>
        )}
      </div>

      {/* Spacer to push content below the fixed bar */}
      <div id="offline-status-spacer" />
    </>
  )
}
