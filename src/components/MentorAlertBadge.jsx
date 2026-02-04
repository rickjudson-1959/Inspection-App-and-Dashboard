// MentorAlertBadge.jsx - Collapsed floating badge for mentor alerts
// Pulse animation matches AIAgentStatusIcon pattern

import React, { useState } from 'react'

const PULSE_STYLES = `
@keyframes mentorPulseRed {
  0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5); }
  70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
  100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
}
@keyframes mentorPulseAmber {
  0% { box-shadow: 0 0 0 0 rgba(202, 138, 4, 0.5); }
  70% { box-shadow: 0 0 0 10px rgba(202, 138, 4, 0); }
  100% { box-shadow: 0 0 0 0 rgba(202, 138, 4, 0); }
}
.mentor-badge-pulse-critical { animation: mentorPulseRed 1.5s infinite; }
.mentor-badge-pulse-warning { animation: mentorPulseAmber 2s infinite; }
`

function MentorAlertBadge({ alertCount, criticalCount, warningCount, onClick }) {
  const [hovered, setHovered] = useState(false)

  if (alertCount === 0) return null

  const hasCritical = criticalCount > 0
  const badgeColor = hasCritical ? '#dc2626' : '#ca8a04'
  const pulseClass = hasCritical ? 'mentor-badge-pulse-critical' : 'mentor-badge-pulse-warning'

  return (
    <>
      <style>{PULSE_STYLES}</style>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={pulseClass}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: badgeColor,
          color: 'white',
          border: '2px solid white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
          fontWeight: '700',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          transform: hovered ? 'scale(1.1)' : 'scale(1)',
          transition: 'transform 0.2s ease'
        }}
        title={`${alertCount} mentor alert${alertCount !== 1 ? 's' : ''} (${criticalCount} critical, ${warningCount} warning)`}
      >
        {alertCount}
      </button>

      {/* Tooltip on hover */}
      {hovered && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          right: '16px',
          backgroundColor: '#1f2937',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '500',
          zIndex: 9999,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '2px' }}>Mentor Alerts</div>
          {criticalCount > 0 && (
            <div style={{ color: '#fca5a5' }}>{criticalCount} critical</div>
          )}
          {warningCount > 0 && (
            <div style={{ color: '#fde68a' }}>{warningCount} warning</div>
          )}
        </div>
      )}
    </>
  )
}

export default MentorAlertBadge
