import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

export default function InspectorInvoicingDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('timesheets')
  const [dateRange, setDateRange] = useState('30')
  
  // Data states
  const [timesheets, setTimesheets] = useState([])
  const [inspectorProfiles, setInspectorProfiles] = useState([])
  const [expiringDocuments, setExpiringDocuments] = useState([])
  
  // Stats
  const [stats, setStats] = useState({
    pendingReview: { count: 0, amount: 0 },
    chiefReview: { count: 0, amount: 0 },
    approved: { count: 0, amount: 0 },
    paidThisMonth: { count: 0, amount: 0 }
  })

  useEffect(() => {
    loadData()
  }, [dateRange])

  async function loadData() {
    setLoading(true)
    try {
      // Load timesheets
      const { data: timesheetData } = await supabase
        .from('inspector_timesheets')
        .select(`
          *,
          inspector_profiles (
            id,
            user_id,
            company_name
          )
        `)
        .order('created_at', { ascending: false })
      
      setTimesheets(timesheetData || [])
      
      // Calculate stats with actual amounts
      const pending = (timesheetData || []).filter(t => t.status === 'submitted' || t.status === 'admin_review')
      const chief = (timesheetData || []).filter(t => t.status === 'chief_review')
      const approved = (timesheetData || []).filter(t => t.status === 'approved')
      const paid = (timesheetData || []).filter(t => t.status === 'paid')
      
      setStats({
        pendingReview: { 
          count: pending.length, 
          amount: pending.reduce((sum, t) => sum + (t.invoice_total || 0), 0) 
        },
        chiefReview: { 
          count: chief.length, 
          amount: chief.reduce((sum, t) => sum + (t.invoice_total || 0), 0) 
        },
        approved: { 
          count: approved.length, 
          amount: approved.reduce((sum, t) => sum + (t.invoice_total || 0), 0) 
        },
        paidThisMonth: { 
          count: paid.length, 
          amount: paid.reduce((sum, t) => sum + (t.invoice_total || 0), 0) 
        }
      })
      
      // Load inspector profiles
      const { data: profileData } = await supabase
        .from('inspector_profiles')
        .select('*')
        .order('created_at', { ascending: false })
      
      setInspectorProfiles(profileData || [])
      
      // Load expiring documents (within 30 days)
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
      
      const { data: expiringDocs } = await supabase
        .from('inspector_documents')
        .select(`
          *,
          inspector_profiles (
            id,
            company_name,
            user_id
          )
        `)
        .lte('expiry_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .order('expiry_date', { ascending: true })
      
      setExpiringDocuments(expiringDocs || [])
      
    } catch (err) {
      console.error('Error loading data:', err)
    }
    setLoading(false)
  }

  // Get user name from profile
  function getInspectorName(timesheet) {
    if (timesheet.inspector_profiles?.company_name) {
      return timesheet.inspector_profiles.company_name
    }
    return 'Unknown Inspector'
  }

  // Format currency
  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-CA', { 
      style: 'currency', 
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0)
  }

  // Format date
  function formatDate(dateStr) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-CA', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  // Get status badge
  function getStatusBadge(status) {
    const statusConfig = {
      draft: { color: '#6b7280', bg: '#f3f4f6', label: '📝 Draft' },
      submitted: { color: '#d97706', bg: '#fef3c7', label: '📤 Submitted' },
      admin_review: { color: '#2563eb', bg: '#dbeafe', label: '👁 Admin Review' },
      chief_review: { color: '#7c3aed', bg: '#ede9fe', label: '✍️ Chief Review' },
      approved: { color: '#059669', bg: '#d1fae5', label: '✅ Approved' },
      paid: { color: '#16a34a', bg: '#bbf7d0', label: '💰 Paid' },
      returned: { color: '#dc2626', bg: '#fee2e2', label: '↩️ Returned' }
    }
    const config = statusConfig[status] || statusConfig.draft
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

  // Get document expiry status
  function getExpiryStatus(expiryDate) {
    if (!expiryDate) return { color: '#6b7280', label: 'No Expiry' }
    const today = new Date()
    const expiry = new Date(expiryDate)
    const daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
    
    if (daysUntil < 0) return { color: '#dc2626', bg: '#fee2e2', label: '🔴 EXPIRED' }
    if (daysUntil <= 7) return { color: '#ea580c', bg: '#ffedd5', label: `🟠 ${daysUntil}d` }
    if (daysUntil <= 30) return { color: '#ca8a04', bg: '#fef9c3', label: `🟡 ${daysUntil}d` }
    return { color: '#16a34a', bg: '#dcfce7', label: `✅ ${daysUntil}d` }
  }

  // Count expiring documents by severity
  const expiredCount = expiringDocuments.filter(d => {
    const expiry = new Date(d.expiry_date)
    return expiry < new Date()
  }).length

  const expiringIn7Days = expiringDocuments.filter(d => {
    const expiry = new Date(d.expiry_date)
    const today = new Date()
    const daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
    return daysUntil >= 0 && daysUntil <= 7
  }).length

  const expiringIn30Days = expiringDocuments.filter(d => {
    const expiry = new Date(d.expiry_date)
    const today = new Date()
    const daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
    return daysUntil > 7 && daysUntil <= 30
  }).length

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <button 
            onClick={() => navigate('/inspector')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}
          >
            ← Back to Daily Inspector Report
          </button>
          <h1 style={{ margin: 0, fontSize: '28px', color: '#111827' }}>📋 Inspector Invoicing</h1>
          <p style={{ margin: '4px 0 0 0', color: '#6b7280' }}>Manage inspector timesheets, invoices, and hire-on packages</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            value={dateRange} 
            onChange={(e) => setDateRange(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="365">All Time</option>
          </select>
          <button
            onClick={() => navigate('/timesheet')}
            style={{
              padding: '10px 16px',
              backgroundColor: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            + New Timesheet
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#fef3c7', padding: '20px', borderRadius: '12px', border: '1px solid #fcd34d' }}>
          <div style={{ fontSize: '14px', color: '#92400e', fontWeight: '500' }}>📋 Pending Review</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#92400e' }}>{stats.pendingReview.count}</div>
          <div style={{ fontSize: '14px', color: '#b45309' }}>{formatCurrency(stats.pendingReview.amount)}</div>
        </div>
        <div style={{ backgroundColor: '#ede9fe', padding: '20px', borderRadius: '12px', border: '1px solid #c4b5fd' }}>
          <div style={{ fontSize: '14px', color: '#5b21b6', fontWeight: '500' }}>✍️ Chief Review</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#5b21b6' }}>{stats.chiefReview.count}</div>
          <div style={{ fontSize: '14px', color: '#6d28d9' }}>{formatCurrency(stats.chiefReview.amount)}</div>
        </div>
        <div style={{ backgroundColor: '#d1fae5', padding: '20px', borderRadius: '12px', border: '1px solid #6ee7b7' }}>
          <div style={{ fontSize: '14px', color: '#065f46', fontWeight: '500' }}>✅ Approved (Unpaid)</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#065f46' }}>{stats.approved.count}</div>
          <div style={{ fontSize: '14px', color: '#047857' }}>{formatCurrency(stats.approved.amount)}</div>
        </div>
        <div style={{ backgroundColor: '#dbeafe', padding: '20px', borderRadius: '12px', border: '1px solid #93c5fd' }}>
          <div style={{ fontSize: '14px', color: '#1e40af', fontWeight: '500' }}>💰 Paid This Month</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e40af' }}>{stats.paidThisMonth.count}</div>
          <div style={{ fontSize: '14px', color: '#1d4ed8' }}>{formatCurrency(stats.paidThisMonth.amount)}</div>
        </div>
      </div>

      {/* Document Alerts Banner */}
      {expiringDocuments.length > 0 && (
        <div style={{ 
          backgroundColor: '#fef2f2', 
          border: '1px solid #fecaca', 
          borderRadius: '8px', 
          padding: '12px 16px', 
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <span style={{ fontWeight: '500', color: '#991b1b' }}>DOCUMENT ALERTS</span>
            {expiredCount > 0 && (
              <span style={{ padding: '2px 8px', backgroundColor: '#dc2626', color: 'white', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                🔴 {expiredCount} Expired
              </span>
            )}
            {expiringIn7Days > 0 && (
              <span style={{ padding: '2px 8px', backgroundColor: '#ea580c', color: 'white', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                🟠 {expiringIn7Days} in 7 days
              </span>
            )}
            {expiringIn30Days > 0 && (
              <span style={{ padding: '2px 8px', backgroundColor: '#ca8a04', color: 'white', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                🟡 {expiringIn30Days} in 30 days
              </span>
            )}
          </div>
          <button
            onClick={() => setActiveTab('documents')}
            style={{
              padding: '6px 12px',
              backgroundColor: 'white',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              color: '#991b1b'
            }}
          >
            View All →
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
        <button 
          onClick={() => setActiveTab('timesheets')}
          style={{ 
            padding: '10px 20px', 
            borderRadius: '6px', 
            border: 'none', 
            cursor: 'pointer', 
            backgroundColor: activeTab === 'timesheets' ? '#059669' : '#f3f4f6', 
            color: activeTab === 'timesheets' ? 'white' : '#374151', 
            fontWeight: '500' 
          }}
        >
          📋 Timesheets & Invoices
        </button>
        <button 
          onClick={() => setActiveTab('inspectors')}
          style={{ 
            padding: '10px 20px', 
            borderRadius: '6px', 
            border: 'none', 
            cursor: 'pointer', 
            backgroundColor: activeTab === 'inspectors' ? '#2563eb' : '#f3f4f6', 
            color: activeTab === 'inspectors' ? 'white' : '#374151', 
            fontWeight: '500' 
          }}
        >
          👷 Inspectors ({inspectorProfiles.length})
        </button>
        <button 
          onClick={() => setActiveTab('documents')}
          style={{ 
            padding: '10px 20px', 
            borderRadius: '6px', 
            border: 'none', 
            cursor: 'pointer', 
            backgroundColor: activeTab === 'documents' ? '#dc2626' : '#f3f4f6', 
            color: activeTab === 'documents' ? 'white' : '#374151', 
            fontWeight: '500' 
          }}
        >
          📄 Documents {expiringDocuments.length > 0 && `(${expiringDocuments.length} ⚠️)`}
        </button>
        <button 
          onClick={() => setActiveTab('rates')}
          style={{ 
            padding: '10px 20px', 
            borderRadius: '6px', 
            border: 'none', 
            cursor: 'pointer', 
            backgroundColor: activeTab === 'rates' ? '#7c3aed' : '#f3f4f6', 
            color: activeTab === 'rates' ? 'white' : '#374151', 
            fontWeight: '500' 
          }}
        >
          💰 Rate Cards
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          Loading...
        </div>
      )}

      {/* TIMESHEETS TAB */}
      {!loading && activeTab === 'timesheets' && (
        <div>
          {timesheets.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px', 
              backgroundColor: '#f9fafb', 
              borderRadius: '12px',
              border: '2px dashed #d1d5db'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
              <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>No Timesheets Yet</h3>
              <p style={{ margin: '0 0 16px 0', color: '#6b7280' }}>
                Timesheets will appear here once inspectors submit them, or you can create one manually.
              </p>
              <button
                onClick={() => navigate('/timesheet')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                + Create First Timesheet
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Inspector</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Period</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Project</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Days</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Amount</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map(ts => (
                  <tr key={ts.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontWeight: '500' }}>{getInspectorName(ts)}</td>
                    <td style={{ padding: '12px', color: '#6b7280' }}>
                      {formatDate(ts.period_start)} - {formatDate(ts.period_end)}
                    </td>
                    <td style={{ padding: '12px', color: '#6b7280' }}>{ts.project_name || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{ts.total_field_days || 0}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: '600' }}>
                      {formatCurrency(ts.invoice_total || 0)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{getStatusBadge(ts.status)}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button
                        onClick={() => {
                          // Draft timesheets go to editor, others go to review
                          if (ts.status === 'draft') {
                            navigate(`/timesheet?id=${ts.id}`)
                          } else {
                            navigate(`/timesheet-review?id=${ts.id}`)
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: ts.status === 'submitted' || ts.status === 'chief_review' ? '#dbeafe' : '#f3f4f6',
                          border: ts.status === 'submitted' || ts.status === 'chief_review' ? '1px solid #3b82f6' : '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: ts.status === 'submitted' || ts.status === 'chief_review' ? '#1e40af' : '#374151',
                          fontWeight: ts.status === 'submitted' || ts.status === 'chief_review' ? '600' : '400'
                        }}
                      >
                        {ts.status === 'submitted' || ts.status === 'chief_review' ? '👀 Review' : ts.status === 'draft' ? 'Edit' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* INSPECTORS TAB */}
      {!loading && activeTab === 'inspectors' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Inspector Profiles</h3>
            <button
              onClick={() => navigate('/hire-on')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              + Test Hire-On Form
            </button>
          </div>
          
          {inspectorProfiles.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px', 
              backgroundColor: '#f9fafb', 
              borderRadius: '12px',
              border: '2px dashed #d1d5db'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>👷</div>
              <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>No Inspectors Yet</h3>
              <p style={{ margin: '0 0 16px 0', color: '#6b7280' }}>
                Invite inspectors to complete their hire-on packages and start submitting timesheets.
              </p>
              <button
                onClick={() => navigate('/hire-on')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                + Test Hire-On Form
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Inspector / Company</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Profile</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Documents</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Rate Card</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inspectorProfiles.map(profile => (
                  <tr key={profile.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: '500' }}>{profile.company_name || 'Incomplete'}</div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>{profile.company_city}, {profile.company_province}</div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {profile.profile_complete ? (
                        <span style={{ color: '#059669' }}>✅</span>
                      ) : (
                        <span style={{ color: '#dc2626' }}>❌</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ color: '#6b7280' }}>-</span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ color: '#6b7280' }}>-</span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {profile.cleared_to_work ? (
                        <span style={{ padding: '4px 8px', backgroundColor: '#d1fae5', color: '#065f46', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }}>
                          ✅ Cleared
                        </span>
                      ) : (
                        <span style={{ padding: '4px 8px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }}>
                          ⏳ Pending
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button
                        onClick={() => navigate(`/inspector-invoicing/profile/${profile.id}`)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* DOCUMENTS TAB */}
      {!loading && activeTab === 'documents' && (
        <div>
          <h3 style={{ margin: '0 0 16px 0' }}>Expiring Documents</h3>
          
          {expiringDocuments.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px', 
              backgroundColor: '#f0fdf4', 
              borderRadius: '12px',
              border: '1px solid #bbf7d0'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
              <h3 style={{ margin: '0 0 8px 0', color: '#166534' }}>All Documents Current</h3>
              <p style={{ margin: 0, color: '#15803d' }}>
                No documents expiring in the next 30 days.
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#fef2f2' }}>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #fecaca', fontWeight: '600', color: '#991b1b' }}>Inspector</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #fecaca', fontWeight: '600', color: '#991b1b' }}>Document</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #fecaca', fontWeight: '600', color: '#991b1b' }}>Expiry Date</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #fecaca', fontWeight: '600', color: '#991b1b' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #fecaca', fontWeight: '600', color: '#991b1b' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expiringDocuments.map(doc => {
                  const expiryStatus = getExpiryStatus(doc.expiry_date)
                  return (
                    <tr key={doc.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px', fontWeight: '500' }}>
                        {doc.inspector_profiles?.company_name || 'Unknown'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div>{doc.document_name || doc.document_type}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{doc.document_type}</div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{formatDate(doc.expiry_date)}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ 
                          padding: '4px 8px', 
                          backgroundColor: expiryStatus.bg, 
                          color: expiryStatus.color, 
                          borderRadius: '12px', 
                          fontSize: '12px', 
                          fontWeight: '600' 
                        }}>
                          {expiryStatus.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button
                          onClick={() => {/* Send reminder */}}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#fef3c7',
                            border: '1px solid #fcd34d',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: '#92400e'
                          }}
                        >
                          📧 Remind
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* RATE CARDS TAB */}
      {!loading && activeTab === 'rates' && (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px', 
          backgroundColor: '#f9fafb', 
          borderRadius: '12px',
          border: '2px dashed #d1d5db'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>💰</div>
          <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>Rate Cards</h3>
          <p style={{ margin: '0 0 16px 0', color: '#6b7280' }}>
            Rate cards are set per inspector based on their contract. View an inspector's profile to set or edit their rates.
          </p>
          <button
            onClick={() => setActiveTab('inspectors')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            View Inspectors →
          </button>
        </div>
      )}

    </div>
  )
}
