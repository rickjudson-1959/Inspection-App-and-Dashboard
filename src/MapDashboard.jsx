// MapDashboard.jsx - Pipeline Map Dashboard
// Shows interactive map with pipeline routes, KP markers, and live tracking

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import PipelineMap from './PipelineMap.jsx'

export default function MapDashboard() {
  const { signOut, userProfile } = useAuth()
  const navigate = useNavigate()
  const [selectedKP, setSelectedKP] = useState(null)
  const [recentKPs, setRecentKPs] = useState([])

  // Handle KP selection from map
  const handleKPClick = (kpInfo) => {
    setSelectedKP(kpInfo)
    
    // Add to recent KPs (keep last 5)
    setRecentKPs(prev => {
      const updated = [kpInfo, ...prev.filter(k => k.kp !== kpInfo.kp)]
      return updated.slice(0, 5)
    })
  }

  // Format KP for display
  const formatKP = (kp) => {
    const km = Math.floor(kp)
    const m = Math.round((kp - km) * 1000)
    return `${km}+${m.toString().padStart(3, '0')}`
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ 
        backgroundColor: '#003366', 
        color: 'white', 
        padding: '15px 20px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px' }}>🗺️ Pipeline Map Dashboard</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
            Clearwater Pipeline - Demo Project
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>
            {userProfile?.full_name || 'Inspector'}
          </span>
          <button
            onClick={() => navigate('/inspector')}
            style={{ 
              padding: '8px 15px', 
              backgroundColor: '#28a745', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            📋 New Report
          </button>
          <button
            onClick={() => navigate('/admin')}
            style={{ 
              padding: '8px 15px', 
              backgroundColor: '#17a2b8', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            📊 Dashboard
          </button>
          <button
            onClick={signOut}
            style={{ 
              padding: '8px 15px', 
              backgroundColor: '#dc3545', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Info Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '15px',
          marginBottom: '20px'
        }}>
          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #28a745'
          }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>SOUTHERN ROUTE</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>280 km</div>
            <div style={{ fontSize: '12px', color: '#28a745' }}>Edmonton → Calgary</div>
          </div>
          
          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #17a2b8'
          }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>NORTHERN ROUTE</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>350 km</div>
            <div style={{ fontSize: '12px', color: '#17a2b8' }}>Edmonton → Ft McMurray</div>
          </div>
          
          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #ffc107'
          }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>TOTAL KP MARKERS</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>630</div>
            <div style={{ fontSize: '12px', color: '#856404' }}>Every 1km interval</div>
          </div>
          
          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #6f42c1'
          }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>ROW WIDTH</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>30 m</div>
            <div style={{ fontSize: '12px', color: '#6f42c1' }}>Right-of-Way buffer</div>
          </div>
        </div>

        {/* Map Container */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          marginBottom: '20px'
        }}>
          <div style={{ 
            padding: '15px 20px', 
            borderBottom: '1px solid #e9ecef',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#333' }}>
                🛰️ Interactive Pipeline Map
              </h2>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
                Click anywhere on the map to find the nearest KP. Use satellite view for field verification.
              </p>
            </div>
          </div>
          
          <PipelineMap 
            height="600px"
            showKPMarkers={true}
            kpInterval={20}
            onKPClick={handleKPClick}
            initialZoom={6}
          />
        </div>

        {/* Recent KP Selections */}
        {recentKPs.length > 0 && (
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '20px'
          }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#333' }}>
              📍 Recent KP Selections
            </h3>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {recentKPs.map((kp, idx) => (
                <div 
                  key={idx}
                  style={{
                    padding: '10px 15px',
                    backgroundColor: idx === 0 ? '#e7f3ff' : '#f8f9fa',
                    borderRadius: '6px',
                    border: idx === 0 ? '2px solid #007bff' : '1px solid #dee2e6'
                  }}
                >
                  <div style={{ fontWeight: 'bold', color: '#003366' }}>
                    KP {formatKP(kp.kp)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666' }}>
                    {kp.distance < 1 
                      ? `${(kp.distance * 1000).toFixed(0)}m from ROW`
                      : `${kp.distance.toFixed(1)}km from ROW`
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div style={{ 
          backgroundColor: '#fff3cd', 
          borderRadius: '8px',
          padding: '15px 20px',
          marginTop: '20px',
          border: '1px solid #ffc107'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#856404', fontSize: '14px' }}>
            💡 How to Use This Map
          </h4>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#856404' }}>
            <li><strong>Click anywhere</strong> on the map to find the nearest Kilometre Post (KP)</li>
            <li><strong>Use "My Location"</strong> button to see your GPS position and verify you're on the ROW</li>
            <li><strong>Switch pipelines</strong> between Edmonton-Calgary (south) and Edmonton-Fort McMurray (north)</li>
            <li><strong>Toggle ROW Buffer</strong> to see the 30m right-of-way corridor</li>
            <li><strong>Satellite view</strong> is recommended for field verification</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
