// AdminExecutivePanel.jsx - Admin Panel with Executive Summary Generator
// Add this to your Dashboard or Admin page

import React, { useState } from 'react'
import WeeklyExecutiveSummary from './WeeklyExecutiveSummary.jsx'

export default function AdminExecutivePanel() {
  const [showSummary, setShowSummary] = useState(false)

  return (
    <div style={{ marginBottom: '25px' }}>
      {/* Trigger Button */}
      {!showSummary && (
        <button
          onClick={() => setShowSummary(true)}
          style={{
            padding: '14px 24px',
            background: 'linear-gradient(135deg, #003366 0%, #004488 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 4px 12px rgba(0,51,102,0.3)',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,51,102,0.4)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,51,102,0.3)'
          }}
        >
          <span style={{ fontSize: '20px' }}>🚀</span>
          Generate & Send Executive Summary
        </button>
      )}

      {/* Summary Generator Panel */}
      {showSummary && (
        <div>
          <button
            onClick={() => setShowSummary(false)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              marginBottom: '15px'
            }}
          >
            ← Back to Dashboard
          </button>
          <WeeklyExecutiveSummary projectName="FortisBC EGP Project" />
        </div>
      )}
    </div>
  )
}
