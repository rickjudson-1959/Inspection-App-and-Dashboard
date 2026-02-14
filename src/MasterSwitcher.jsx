import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { useOrgPath } from './contexts/OrgContext.jsx'

// ============================================================================
// CHUNK 3: MASTER SWITCHER - Admin "God Mode"
// Visible to admin and super_admin users
// Add to any dashboard header: <MasterSwitcher compact />
// ============================================================================

const DASHBOARDS = [
  { path: '/field-entry', label: '📝 Field Entry', color: '#28a745' },
  { path: '/auditor-dashboard', label: '🔬 NDT Auditor', color: '#17a2b8' },
  { path: '/assistant-chief', label: '👷 Asst Chief', color: '#fd7e14' },
  { path: '/chief-dashboard', label: '👔 Chief', color: '#dc3545' },
  { path: '/welding-chief', label: '🔧 Weld Chief', color: '#6f42c1' },
  { path: '/dashboard', label: '📊 CMT', color: '#007bff' },
  { path: '/evm-dashboard', label: '💰 EVM', color: '#20c997' },
  { path: '/admin', label: '⚙️ Admin', color: '#343a40' }
]

function MasterSwitcher({ compact = true }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { userProfile } = useAuth()
  const { orgPath } = useOrgPath()
  const [isOpen, setIsOpen] = useState(false)
  
  // Show for super_admin and admin users (God Mode)
  const userRole = userProfile?.user_role || userProfile?.role
  if (userRole !== 'super_admin' && userRole !== 'admin') {
    return null
  }
  
  const currentPath = location.pathname
  
  if (compact) {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: '6px 12px',
            backgroundColor: '#343a40',
            color: '#ffc107',
            border: '2px solid #ffc107',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold'
          }}
        >
          🔑 GOD MODE ▼
        </button>
        
        {isOpen && (
          <>
            <div onClick={() => setIsOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} />
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '5px',
              backgroundColor: '#1a1a1a',
              border: '2px solid #ffc107',
              borderRadius: '8px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              zIndex: 1000,
              minWidth: '200px'
            }}>
              <div style={{ padding: '10px 15px', borderBottom: '1px solid #333', color: '#ffc107', fontSize: '12px', fontWeight: 'bold' }}>
                Jump to Dashboard
              </div>
              {DASHBOARDS.map(d => (
                <button
                  key={d.path}
                  onClick={() => { setIsOpen(false); navigate(orgPath(d.path)) }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 15px',
                    border: 'none',
                    borderBottom: '1px solid #333',
                    backgroundColor: currentPath === d.path ? '#333' : 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '13px'
                  }}
                >
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: d.color, marginRight: '10px' }} />
                  {d.label}
                  {currentPath === d.path && <span style={{ marginLeft: '10px', color: '#ffc107' }}>←</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }
  
  // Full bar mode
  return (
    <div style={{ backgroundColor: '#1a1a1a', borderBottom: '3px solid #ffc107', padding: '8px 20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
      <span style={{ color: '#ffc107', fontWeight: 'bold', fontSize: '12px' }}>🔑 ADMIN</span>
      {DASHBOARDS.map(d => (
        <button
          key={d.path}
          onClick={() => navigate(orgPath(d.path))}
          style={{
            padding: '5px 12px',
            backgroundColor: currentPath === d.path ? d.color : 'transparent',
            color: currentPath === d.path ? '#fff' : '#ccc',
            border: `1px solid ${d.color}`,
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          {d.label.split(' ')[1]}
        </button>
      ))}
    </div>
  )
}

export default MasterSwitcher
