// MentorSidebar.jsx - Non-intrusive slide-in panel for mentor alerts
// Matches AgentAuditFindingsPanel styling conventions

import React, { useState } from 'react'

const SEVERITY_BORDER_COLORS = {
  critical: '#dc2626',
  warning: '#ca8a04',
  info: '#0284c7'
}

const SEVERITY_BG_COLORS = {
  critical: '#fef2f2',
  warning: '#fffbeb',
  info: '#f0f9ff'
}

const SEVERITY_ICONS = {
  critical: '\u{1F6A8}',
  warning: '\u{26A0}\u{FE0F}',
  info: '\u{1F4A1}'
}

const SEVERITY_LABELS = {
  critical: 'CRITICAL',
  warning: 'WARNING',
  info: 'INFO'
}

function MentorSidebar({ isOpen, onClose, alerts, onAcknowledge, onOverride, onDismiss }) {
  const [overrideAlertId, setOverrideAlertId] = useState(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [hoveredButton, setHoveredButton] = useState(null)

  // Sort alerts: critical first, then warning, then info; active first
  const sortedAlerts = [...(alerts || [])].sort((a, b) => {
    const statusOrder = { active: 0, acknowledged: 1, overridden: 2 }
    const severityOrder = { critical: 0, warning: 1, info: 2 }
    const statusDiff = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0)
    if (statusDiff !== 0) return statusDiff
    return (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2)
  })

  const activeCount = alerts?.filter(a => a.status === 'active').length || 0
  const criticalCount = alerts?.filter(a => a.status === 'active' && a.severity === 'critical').length || 0

  function handleOverrideSubmit(alertId) {
    if (!overrideReason.trim()) return
    onOverride(alertId, overrideReason.trim())
    setOverrideAlertId(null)
    setOverrideReason('')
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            zIndex: 10000,
            transition: 'opacity 0.3s ease'
          }}
        />
      )}

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '360px',
        height: '100vh',
        backgroundColor: '#ffffff',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        zIndex: 10001,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          backgroundColor: '#1e3a5f',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700' }}>Mentor Alerts</div>
            <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
              {activeCount > 0
                ? `${activeCount} active alert${activeCount !== 1 ? 's' : ''}${criticalCount > 0 ? ` (${criticalCount} critical)` : ''}`
                : 'No active alerts'
              }
            </div>
          </div>
          <button
            onClick={onClose}
            onMouseEnter={() => setHoveredButton('close')}
            onMouseLeave={() => setHoveredButton(null)}
            style={{
              background: hoveredButton === 'close' ? 'rgba(255,255,255,0.2)' : 'none',
              border: 'none',
              color: 'white',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              transition: 'background 0.2s'
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px'
        }}>
          {sortedAlerts.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>&#x2705;</div>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>All Clear</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                No threshold alerts detected. Continue with inspection.
              </div>
            </div>
          ) : (
            sortedAlerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  marginBottom: '10px',
                  borderRadius: '8px',
                  border: `1px solid ${alert.status === 'overridden' ? '#d1d5db' : (SEVERITY_BORDER_COLORS[alert.severity] || '#d1d5db')}`,
                  borderLeft: `4px solid ${alert.status === 'overridden' ? '#9ca3af' : (SEVERITY_BORDER_COLORS[alert.severity] || '#d1d5db')}`,
                  backgroundColor: alert.status === 'overridden' ? '#f9fafb' : (SEVERITY_BG_COLORS[alert.severity] || '#f9fafb'),
                  overflow: 'hidden',
                  opacity: alert.status === 'overridden' ? 0.7 : 1,
                  transition: 'opacity 0.2s'
                }}
              >
                {/* Alert header */}
                <div style={{ padding: '12px 14px 8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px' }}>{SEVERITY_ICONS[alert.severity]}</span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: alert.status === 'overridden' ? '#9ca3af' : (SEVERITY_BORDER_COLORS[alert.severity] || '#6b7280'),
                        backgroundColor: alert.status === 'overridden' ? '#e5e7eb' : undefined,
                        padding: alert.status === 'overridden' ? '1px 6px' : undefined,
                        borderRadius: alert.status === 'overridden' ? '3px' : undefined
                      }}>
                        {alert.status === 'overridden' ? 'OVERRIDDEN' : SEVERITY_LABELS[alert.severity]}
                      </span>
                    </div>
                    {alert.status === 'active' && (
                      <button
                        onClick={() => onDismiss(alert.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#9ca3af',
                          fontSize: '14px',
                          cursor: 'pointer',
                          padding: '0',
                          lineHeight: '1'
                        }}
                        title="Dismiss"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#1f2937',
                    marginTop: '6px',
                    textDecoration: alert.status === 'overridden' ? 'line-through' : 'none'
                  }}>
                    {alert.title}
                  </div>

                  <div style={{
                    fontSize: '12px',
                    color: '#4b5563',
                    marginTop: '4px',
                    lineHeight: '1.4'
                  }}>
                    {alert.message}
                  </div>
                </div>

                {/* Recommended action */}
                {alert.recommendedAction && alert.status === 'active' && (
                  <div style={{
                    padding: '8px 14px',
                    backgroundColor: 'rgba(255,255,255,0.5)',
                    borderTop: '1px solid rgba(0,0,0,0.05)'
                  }}>
                    <div style={{
                      fontSize: '10px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: '#6b7280',
                      marginBottom: '3px'
                    }}>
                      Recommended Action
                    </div>
                    <div style={{ fontSize: '12px', color: '#374151', lineHeight: '1.4' }}>
                      {alert.recommendedAction}
                    </div>
                  </div>
                )}

                {/* Reference document */}
                {alert.referenceDocument && alert.status === 'active' && (
                  <div style={{
                    padding: '6px 14px',
                    fontSize: '11px',
                    color: '#6b7280',
                    borderTop: '1px solid rgba(0,0,0,0.05)'
                  }}>
                    Ref: {alert.referenceDocument}
                  </div>
                )}

                {/* Override reason display */}
                {alert.status === 'overridden' && alert.overrideReason && (
                  <div style={{
                    padding: '8px 14px',
                    backgroundColor: '#f3f4f6',
                    borderTop: '1px solid #e5e7eb',
                    fontSize: '11px',
                    color: '#6b7280'
                  }}>
                    <strong>Override reason:</strong> {alert.overrideReason}
                  </div>
                )}

                {/* Acknowledged badge */}
                {alert.status === 'acknowledged' && (
                  <div style={{
                    padding: '6px 14px',
                    backgroundColor: 'rgba(22,163,74,0.08)',
                    borderTop: '1px solid rgba(22,163,74,0.15)',
                    fontSize: '11px',
                    color: '#16a34a',
                    fontWeight: '600'
                  }}>
                    Acknowledged
                  </div>
                )}

                {/* Action buttons for active alerts */}
                {alert.status === 'active' && (
                  <div style={{
                    padding: '8px 14px',
                    borderTop: '1px solid rgba(0,0,0,0.06)',
                    display: 'flex',
                    gap: '8px'
                  }}>
                    <button
                      onClick={() => onAcknowledge(alert.id)}
                      onMouseEnter={() => setHoveredButton(`ack_${alert.id}`)}
                      onMouseLeave={() => setHoveredButton(null)}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        fontSize: '11px',
                        fontWeight: '600',
                        border: '1px solid #16a34a',
                        borderRadius: '4px',
                        backgroundColor: hoveredButton === `ack_${alert.id}` ? '#16a34a' : 'transparent',
                        color: hoveredButton === `ack_${alert.id}` ? 'white' : '#16a34a',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() => setOverrideAlertId(overrideAlertId === alert.id ? null : alert.id)}
                      onMouseEnter={() => setHoveredButton(`ovr_${alert.id}`)}
                      onMouseLeave={() => setHoveredButton(null)}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        fontSize: '11px',
                        fontWeight: '600',
                        border: '1px solid #dc2626',
                        borderRadius: '4px',
                        backgroundColor: hoveredButton === `ovr_${alert.id}` ? '#dc2626' : 'transparent',
                        color: hoveredButton === `ovr_${alert.id}` ? 'white' : '#dc2626',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      Override
                    </button>
                  </div>
                )}

                {/* Override reason input */}
                {overrideAlertId === alert.id && (
                  <div style={{
                    padding: '8px 14px 12px',
                    borderTop: '1px solid rgba(0,0,0,0.06)',
                    backgroundColor: '#fef2f2'
                  }}>
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Enter reason for overriding this alert..."
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '8px',
                        fontSize: '12px',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        resize: 'vertical',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                      <button
                        onClick={() => handleOverrideSubmit(alert.id)}
                        disabled={!overrideReason.trim()}
                        style={{
                          flex: 1,
                          padding: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: overrideReason.trim() ? '#dc2626' : '#e5e7eb',
                          color: overrideReason.trim() ? 'white' : '#9ca3af',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: overrideReason.trim() ? 'pointer' : 'not-allowed'
                        }}
                      >
                        Confirm Override
                      </button>
                      <button
                        onClick={() => { setOverrideAlertId(null); setOverrideReason('') }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '11px',
                          backgroundColor: 'transparent',
                          color: '#6b7280',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '2px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          flexShrink: 0
        }}>
          <button
            onClick={onClose}
            onMouseEnter={() => setHoveredButton('footer_close')}
            onMouseLeave={() => setHoveredButton(null)}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              fontWeight: '600',
              backgroundColor: hoveredButton === 'footer_close' ? '#1e3a5f' : '#2d4a6f',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            Close Panel
          </button>
        </div>
      </div>
    </>
  )
}

export default MentorSidebar
