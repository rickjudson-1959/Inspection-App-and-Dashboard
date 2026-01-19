import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from './supabase'

export default function InspectorProfileView() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [documents, setDocuments] = useState([])

  useEffect(() => {
    console.log('🔍 InspectorProfileView component mounted')
    console.log('🔍 Profile ID from URL params:', id)
    console.log('🔍 Current location:', window.location.pathname)
    if (id) {
      loadProfile()
    } else {
      console.error('❌ No profile ID provided in URL')
      setLoading(false)
    }
  }, [id])

  async function loadProfile() {
    setLoading(true)
    try {
      console.log('Loading profile with ID:', id)
      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('inspector_profiles')
        .select('*')
        .eq('id', id)
        .single()

      if (profileError) {
        console.error('Profile error:', profileError)
        throw profileError
      }
      console.log('Profile loaded:', profileData)
      setProfile(profileData)

      // Load documents
      const { data: docsData, error: docsError } = await supabase
        .from('inspector_documents')
        .select('*')
        .eq('inspector_profile_id', id)
        .order('created_at', { ascending: false })

      if (docsError) throw docsError
      setDocuments(docsData || [])

    } catch (err) {
      console.error('Error loading profile:', err)
      alert('Error loading profile: ' + err.message)
    }
    setLoading(false)
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-CA', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  function getExpiryStatus(expiryDate) {
    if (!expiryDate) return { color: '#6b7280', label: 'No Expiry', bg: '#f3f4f6' }
    const today = new Date()
    const expiry = new Date(expiryDate)
    const daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
    
    if (daysUntil < 0) return { color: '#dc2626', bg: '#fee2e2', label: '🔴 EXPIRED' }
    if (daysUntil <= 7) return { color: '#ea580c', bg: '#ffedd5', label: `🟠 ${daysUntil}d` }
    if (daysUntil <= 30) return { color: '#ca8a04', bg: '#fef9c3', label: `🟡 ${daysUntil}d` }
    return { color: '#16a34a', bg: '#dcfce7', label: `✅ ${daysUntil}d` }
  }

  function getDocumentStatusBadge(status) {
    const statusConfig = {
      pending: { color: '#d97706', bg: '#fef3c7', label: '⏳ Pending' },
      verified: { color: '#059669', bg: '#d1fae5', label: '✅ Verified' },
      rejected: { color: '#dc2626', bg: '#fee2e2', label: '❌ Rejected' },
      expired: { color: '#991b1b', bg: '#fee2e2', label: '🔴 Expired' }
    }
    const config = statusConfig[status] || statusConfig.pending
    return (
      <span style={{
        padding: '4px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500',
        backgroundColor: config.bg,
        color: config.color
      }}>
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading profile...</p>
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>Profile ID: {id}</p>
      </div>
    )
  }

  if (!profile) {
    console.warn('⚠️ Profile not found for ID:', id)
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Profile Not Found</h2>
        <p style={{ color: '#6b7280' }}>Profile ID: {id}</p>
        <button 
          onClick={() => navigate('/inspector-invoicing')}
          style={{
            marginTop: '16px',
            padding: '10px 20px',
            backgroundColor: '#059669',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Back to Inspector Invoicing
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header with Back Button */}
      <div style={{ marginBottom: '24px' }}>
        <Link
          to="/inspector-invoicing"
          style={{ 
            display: 'inline-block',
            background: 'none', 
            border: 'none', 
            color: '#6b7280', 
            cursor: 'pointer', 
            fontSize: '14px', 
            marginBottom: '16px',
            textDecoration: 'none'
          }}
          onMouseEnter={(e) => e.target.style.color = '#374151'}
          onMouseLeave={(e) => e.target.style.color = '#6b7280'}
        >
          ← Back to Inspector Invoicing
        </Link>
        <h1 style={{ margin: 0, fontSize: '28px', color: '#111827' }}>
          Inspector Profile: {profile.company_name || 'Incomplete'}
        </h1>
        <p style={{ margin: '4px 0 0 0', color: '#6b7280' }}>
          View inspector details and documents
        </p>
      </div>

      {/* Profile Status */}
      <div style={{ 
        backgroundColor: profile.profile_complete ? '#d1fae5' : '#fef3c7',
        border: `1px solid ${profile.profile_complete ? '#6ee7b7' : '#fcd34d'}`,
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <strong style={{ color: profile.profile_complete ? '#065f46' : '#92400e' }}>
            Profile Status: {profile.profile_complete ? '✅ Complete' : '⏳ Incomplete'}
          </strong>
          {profile.cleared_to_work && (
            <span style={{ 
              marginLeft: '16px',
              padding: '4px 8px',
              backgroundColor: '#059669',
              color: 'white',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              ✓ Cleared to Work
            </span>
          )}
        </div>
      </div>

      {/* Company Information */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 24px 0', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
          Company Information
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Company Name</label>
            <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>{profile.company_name || '-'}</p>
          </div>
          <div>
            <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>GST Number</label>
            <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>{profile.gst_number || '-'}</p>
          </div>
          <div>
            <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Address</label>
            <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>{profile.company_address || '-'}</p>
          </div>
          <div>
            <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>City, Province</label>
            <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>
              {profile.company_city || '-'}, {profile.company_province || '-'} {profile.company_postal_code || ''}
            </p>
          </div>
        </div>
      </div>

      {/* Contact Information */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 24px 0', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
          Contact Information
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Phone</label>
            <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>{profile.phone || '-'}</p>
          </div>
          <div>
            <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Cell Phone</label>
            <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>{profile.cell_phone || '-'}</p>
          </div>
          <div>
            <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Emergency Contact</label>
            <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>
              {profile.emergency_contact_name || '-'} ({profile.emergency_contact_phone || '-'})
            </p>
          </div>
        </div>
      </div>

      {/* Vehicle Information */}
      {(profile.vehicle_make || profile.vehicle_model) && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ margin: '0 0 24px 0', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
            Vehicle Information
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '20px' }}>
            <div>
              <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Year</label>
              <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>{profile.vehicle_year || '-'}</p>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Make</label>
              <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>{profile.vehicle_make || '-'}</p>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Model</label>
              <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>{profile.vehicle_model || '-'}</p>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Plate #</label>
              <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>{profile.vehicle_plate || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Banking Information */}
      {profile.bank_name && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ margin: '0 0 24px 0', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
            Banking Information
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            <div>
              <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Bank Name</label>
              <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>{profile.bank_name || '-'}</p>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Transit Number</label>
              <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827' }}>{profile.bank_transit || '-'}</p>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Account Number</label>
              <p style={{ margin: '4px 0 0 0', fontSize: '16px', color: '#111827', fontFamily: 'monospace' }}>
                {profile.bank_account ? '••••' + profile.bank_account.slice(-4) : '-'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Documents */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 24px 0', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
          Documents ({documents.length})
        </h2>
        
        {documents.length === 0 ? (
          <p style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>No documents uploaded yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {documents.map(doc => {
              const expiryStatus = getExpiryStatus(doc.expiry_date)
              return (
                <div 
                  key={doc.id}
                  style={{ 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, color: '#111827' }}>{doc.document_name}</h4>
                      {getDocumentStatusBadge(doc.status)}
                    </div>
                    <div style={{ display: 'flex', gap: '24px', fontSize: '14px', color: '#6b7280' }}>
                      {doc.document_number && <span>Number: {doc.document_number}</span>}
                      {doc.expiry_date && (
                        <span>
                          Expiry: {formatDate(doc.expiry_date)} 
                          <span style={{ 
                            marginLeft: '8px',
                            padding: '2px 6px',
                            backgroundColor: expiryStatus.bg,
                            color: expiryStatus.color,
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}>
                            {expiryStatus.label}
                          </span>
                        </span>
                      )}
                      {doc.coverage_amount && <span>Coverage: ${doc.coverage_amount.toLocaleString()}</span>}
                    </div>
                    {doc.file_path && (
                      <a 
                        href={doc.file_path} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ 
                          marginTop: '8px',
                          display: 'inline-block',
                          color: '#2563eb',
                          fontSize: '14px',
                          textDecoration: 'none'
                        }}
                      >
                        📄 View Document →
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
