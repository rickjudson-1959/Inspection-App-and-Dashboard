// MentorTipOverlay.jsx - Dismissible overlay showing quality tips for selected activity
// Positioned top-right of quality data area, light blue gradient background

import React, { useState, useEffect, useRef } from 'react'

const CATEGORY_ICONS = {
  quality: '\u2699\uFE0F',
  safety: '\u{1F6E1}\uFE0F',
  environmental: '\u{1F33F}',
  documentation: '\u{1F4CB}'
}

const AUTO_DISMISS_MS = 30000 // 30 seconds

function MentorTipOverlay({ tips, activityType, onDismiss, onDontShowAgain }) {
  const [visible, setVisible] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const timerRef = useRef(null)

  // Fade in on mount
  useEffect(() => {
    const fadeIn = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(fadeIn)
  }, [])

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      handleDismiss()
    }, AUTO_DISMISS_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss() {
    setFadingOut(true)
    setTimeout(() => {
      onDismiss()
    }, 300)
  }

  function handleDontShowAgain() {
    onDontShowAgain(activityType)
    handleDismiss()
  }

  if (!tips || tips.length === 0) return null

  return (
    <div style={{
      position: 'relative',
      width: '320px',
      maxWidth: '100%',
      float: 'right',
      marginBottom: '12px',
      borderRadius: '10px',
      background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
      border: '1px solid #bae6fd',
      boxShadow: '0 4px 12px rgba(14, 165, 233, 0.12)',
      overflow: 'hidden',
      opacity: fadingOut ? 0 : (visible ? 1 : 0),
      transform: fadingOut ? 'translateY(-8px)' : (visible ? 'translateY(0)' : 'translateY(-8px)'),
      transition: 'opacity 0.3s ease, transform 0.3s ease'
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #bae6fd'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span style={{ fontSize: '16px' }}>&#x1F4A1;</span>
          <span style={{
            fontSize: '13px',
            fontWeight: '700',
            color: '#0369a1'
          }}>
            Mentor Tips
          </span>
          <span style={{
            fontSize: '10px',
            color: '#0284c7',
            backgroundColor: '#e0f2fe',
            padding: '1px 6px',
            borderRadius: '8px',
            fontWeight: '500'
          }}>
            {activityType}
          </span>
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '0 2px',
            lineHeight: '1'
          }}
          title="Dismiss"
        >
          ×
        </button>
      </div>

      {/* Tip cards */}
      <div style={{ padding: '8px 12px', maxHeight: '280px', overflowY: 'auto' }}>
        {tips.map((tip, idx) => (
          <div key={tip.id || idx} style={{
            padding: '8px 10px',
            marginBottom: idx < tips.length - 1 ? '6px' : 0,
            backgroundColor: 'rgba(255,255,255,0.6)',
            borderRadius: '6px',
            border: '1px solid rgba(186,230,253,0.5)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '4px'
            }}>
              <span style={{ fontSize: '12px' }}>{CATEGORY_ICONS[tip.category] || '\u2699\uFE0F'}</span>
              <span style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#1e3a5f'
              }}>
                {tip.title}
              </span>
            </div>
            <div style={{
              fontSize: '11px',
              color: '#475569',
              lineHeight: '1.5'
            }}>
              {tip.content}
            </div>
            {tip.source && (
              <div style={{
                fontSize: '10px',
                color: '#94a3b8',
                marginTop: '3px',
                fontStyle: 'italic'
              }}>
                Source: {tip.source}
                {tip.fromRAG && ' (AI-retrieved)'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid #bae6fd',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <button
          onClick={handleDismiss}
          style={{
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: '600',
            backgroundColor: '#0284c7',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Got it
        </button>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '10px',
          color: '#64748b',
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            onChange={handleDontShowAgain}
            style={{ width: '12px', height: '12px', cursor: 'pointer' }}
          />
          Don't show again
        </label>
      </div>
    </div>
  )
}

export default MentorTipOverlay
