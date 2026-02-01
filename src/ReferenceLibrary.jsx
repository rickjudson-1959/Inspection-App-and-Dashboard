import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'
import { useOrgPath } from './contexts/OrgContext.jsx'

function ReferenceLibrary() {
  const { signOut, userProfile } = useAuth()
  const navigate = useNavigate()
  const { orgPath } = useOrgPath()

  const [loading, setLoading] = useState(true)
  const [libraryDocs, setLibraryDocs] = useState([])

  // Technical Library categories
  const technicalLibraryCategories = [
    { key: 'api_1169', label: 'API 1169 - Pipeline Construction Inspection', icon: '📘', description: 'Standard practice for pipeline construction inspection covering welding, coating, and testing requirements.' },
    { key: 'csa_z662', label: 'CSA Z662 - Oil & Gas Pipeline Systems', icon: '📗', description: 'Canadian standards for design, construction, operation, and maintenance of oil and gas pipeline systems.' },
    { key: 'pipeline_authority_ref', label: 'Practical Guide for Pipeline Construction Inspectors', icon: '📕', description: 'Comprehensive field guide for pipeline construction inspection best practices.' },
    { key: 'inspector_playbook', label: "Pipeline Inspector's Playbook", icon: '📙', description: 'Essential playbook for pipeline inspection procedures and techniques.' },
    { key: 'rules_of_thumb', label: 'Pipeline Rules of Thumb', icon: '📓', description: 'Quick reference guide with practical rules and calculations for pipeline work.' }
  ]

  useEffect(() => {
    fetchLibraryDocs()
  }, [])

  async function fetchLibraryDocs() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('project_documents')
        .select('*')
        .eq('is_global', true)
        .in('category', ['api_1169', 'csa_z662', 'pipeline_authority_ref', 'inspector_playbook', 'rules_of_thumb'])
        .order('created_at', { ascending: false })

      if (error) throw error
      setLibraryDocs(data || [])
    } catch (err) {
      console.error('Error fetching library docs:', err)
    }
    setLoading(false)
  }

  function getDocument(category) {
    return libraryDocs.find(d => d.category === category)
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px',
        paddingBottom: '20px',
        borderBottom: '2px solid #e5e7eb'
      }}>
        <div>
          <h1 style={{ margin: 0, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '10px' }}>
            📚 Technical Reference Library
          </h1>
          <p style={{ margin: '5px 0 0', color: '#6b7280', fontSize: '14px' }}>
            Industry standards and reference materials for pipeline inspection
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => navigate(orgPath('/field-entry'))}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            ← Back to Field Entry
          </button>
          <button
            onClick={signOut}
            style={{
              padding: '10px 20px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Welcome message */}
      <div style={{
        padding: '20px',
        backgroundColor: '#eff6ff',
        borderRadius: '8px',
        marginBottom: '30px',
        border: '1px solid #bfdbfe'
      }}>
        <p style={{ margin: 0, color: '#1e40af', fontSize: '14px' }}>
          <strong>Welcome, {userProfile?.full_name || 'Inspector'}!</strong> These reference documents are available for your review during field inspections.
          Click on any document to view it in a new tab.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <p style={{ color: '#666', fontSize: '18px' }}>Loading reference library...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
          {technicalLibraryCategories.map(cat => {
            const doc = getDocument(cat.key)
            const hasDoc = !!doc
            return (
              <div
                key={cat.key}
                style={{
                  padding: '25px',
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  border: hasDoc ? '2px solid #22c55e' : '2px solid #e5e7eb',
                  opacity: hasDoc ? 1 : 0.7
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px', marginBottom: '15px' }}>
                  <span style={{ fontSize: '40px' }}>{cat.icon}</span>
                  <div>
                    <h3 style={{ margin: '0 0 5px 0', color: '#1f2937', fontSize: '16px' }}>
                      {cat.label}
                    </h3>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '13px', lineHeight: '1.5' }}>
                      {cat.description}
                    </p>
                  </div>
                </div>

                {hasDoc ? (
                  <div>
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 20px',
                        backgroundColor: '#6366f1',
                        color: 'white',
                        borderRadius: '6px',
                        fontSize: '14px',
                        textDecoration: 'none',
                        fontWeight: '500',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => e.target.style.backgroundColor = '#4f46e5'}
                      onMouseOut={(e) => e.target.style.backgroundColor = '#6366f1'}
                    >
                      📄 Open Document
                    </a>
                    <div style={{ marginTop: '12px', fontSize: '11px', color: '#9ca3af' }}>
                      <div>File: {doc.file_name}</div>
                      <div>Version: {doc.version_number || 1} • Updated: {new Date(doc.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '15px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '6px',
                    textAlign: 'center'
                  }}>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '13px' }}>
                      📭 Document not yet uploaded
                    </p>
                    <p style={{ margin: '5px 0 0', color: '#9ca3af', fontSize: '11px' }}>
                      Contact your administrator
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Footer info */}
      <div style={{
        marginTop: '40px',
        padding: '20px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '12px' }}>
          These documents are provided as reference materials only. Always verify requirements with your Chief Inspector or Project Manager.
        </p>
      </div>
    </div>
  )
}

export default ReferenceLibrary
