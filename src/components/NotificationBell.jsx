import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications.js'
import { useOrgPath } from '../contexts/OrgContext.jsx'

/**
 * NotificationBell Component
 *
 * Header notification icon with dropdown showing recent notifications.
 * Used by inspectors to see revision requests and other alerts.
 */
function NotificationBell() {
  const navigate = useNavigate()
  const { orgPath } = useOrgPath()
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useNotifications()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Format time ago
  function formatTimeAgo(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  // Handle notification click
  function handleNotificationClick(notification) {
    // Mark as read
    if (!notification.is_read) {
      markAsRead(notification.id)
    }

    // Navigate based on reference type
    if (notification.reference_type === 'daily_report' && notification.reference_id) {
      navigate(orgPath(`/field-entry?edit=${notification.reference_id}`))
    }

    setIsOpen(false)
  }

  // Get notification icon based on type
  function getNotificationIcon(type) {
    switch (type) {
      case 'revision_requested':
        return '⚠️'
      case 'report_approved':
        return '✅'
      case 'mention':
        return '@'
      default:
        return '🔔'
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'relative',
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '18px',
          color: 'white'
        }}
        title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      >
        🔔
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              backgroundColor: '#dc3545',
              color: 'white',
              borderRadius: '50%',
              minWidth: '18px',
              height: '18px',
              fontSize: '11px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px'
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '48px',
            right: 0,
            width: '320px',
            maxHeight: '400px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            zIndex: 10000,
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e9ecef',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#f8f9fa'
            }}
          >
            <span style={{ fontWeight: 'bold', color: '#333', fontSize: '14px' }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  markAllAsRead()
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#007bff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: '4px 8px'
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '10px' }}>🔔</span>
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 10).map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #f0f0f0',
                    cursor: 'pointer',
                    backgroundColor: notification.is_read ? 'white' : '#fff8e6',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = notification.is_read ? '#f8f9fa' : '#fff3cd'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = notification.is_read ? 'white' : '#fff8e6'
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {/* Icon */}
                    <span style={{ fontSize: '18px' }}>
                      {getNotificationIcon(notification.type)}
                    </span>

                    {/* Content */}
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: notification.is_read ? 'normal' : 'bold',
                          color: '#333',
                          marginBottom: '4px'
                        }}
                      >
                        {notification.title}
                      </div>
                      {notification.message && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#666',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: '1.4'
                          }}
                        >
                          {notification.message}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                        {formatTimeAgo(notification.created_at)}
                      </div>
                    </div>

                    {/* Unread Indicator */}
                    {!notification.is_read && (
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: '#007bff',
                          flexShrink: 0,
                          marginTop: '4px'
                        }}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
