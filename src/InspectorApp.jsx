import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import InspectorReport from './InspectorReport'
import MyReports from './MyReports'
import { supabase } from './supabase'
import { useOrgPath } from './contexts/OrgContext.jsx'
import { useOrgQuery } from './utils/queryHelpers.js'

/**
 * InspectorApp - Main wrapper for the inspector interface
 *
 * Handles:
 * - Navigation between "New Report" and "My Reports"
 * - Loading existing reports for editing
 * - Direct link support (e.g., app.pipe-up.ca/report/edit/12345)
 *
 * Props:
 * - user: The logged-in user object
 * - onSignOut: Function to handle sign out
 */
function InspectorApp({ user, onSignOut }) {
  const navigate = useNavigate()
  const { orgPath } = useOrgPath()
  const { addOrgFilter } = useOrgQuery()
  const [view, setView] = useState('new') // 'new', 'myreports', 'edit'
  const [editReportId, setEditReportId] = useState(null)
  const [editReportData, setEditReportData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Check URL for direct edit link on mount
  useEffect(() => {
    checkUrlForEditLink()
    
    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', checkUrlForEditLink)
    return () => window.removeEventListener('popstate', checkUrlForEditLink)
  }, [])

  function checkUrlForEditLink() {
    // Check URL query params for edit=reportId
    const urlParams = new URLSearchParams(window.location.search)
    const editId = urlParams.get('edit')

    if (editId) {
      loadReportForEdit(editId)
    }
  }

  async function loadReportForEdit(reportId) {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch the full report with all related data (org-scoped)
      const { data: report, error: fetchError } = await addOrgFilter(
        supabase
          .from('daily_reports')
          .select('*')
          .eq('id', reportId)
      ).single()

      if (fetchError) throw fetchError
      
      if (!report) {
        throw new Error('Report not found')
      }

      // RLS policies already ensure users can only see reports in their org
      // Just log who is editing for debugging
      console.log('[InspectorApp] Loading report for edit:', {
        reportId,
        reportInspectorName: report.inspector_name,
        reportCreatedBy: report.created_by,
        userId: user?.id
      })

      // Fetch related labour entries
      const { data: labourData } = await supabase
        .from('labour_entries')
        .select('*')
        .eq('report_id', reportId)

      // Fetch related equipment entries
      const { data: equipmentData } = await supabase
        .from('equipment_entries')
        .select('*')
        .eq('report_id', reportId)

      // Fetch related photos
      const { data: photosData } = await supabase
        .from('report_photos')
        .select('*')
        .eq('report_id', reportId)

      // Combine into full report object
      const fullReport = {
        ...report,
        labourEntries: labourData || [],
        equipmentEntries: equipmentData || [],
        photos: photosData || []
      }

      setEditReportId(reportId)
      setEditReportData(fullReport)
      setView('edit')

      // Navigate with query param so InspectorReport detects edit mode
      navigate(`${orgPath('/inspector')}?edit=${reportId}`, { replace: true })
      
    } catch (err) {
      console.error('Error loading report:', err)
      setError(err.message || 'Failed to load report')
      setView('new')
    } finally {
      setLoading(false)
    }
  }

  function handleEditReport(reportId) {
    loadReportForEdit(reportId)
  }

  function handleBackToNew() {
    setView('new')
    setEditReportId(null)
    setEditReportData(null)
    navigate(orgPath('/inspector'), { replace: true })
  }

  function handleViewMyReports() {
    setView('myreports')
    setEditReportId(null)
    setEditReportData(null)
    navigate(orgPath('/my-reports'), { replace: true })
  }

  function handleSaveComplete(savedReportId) {
    // After saving, could go back to my reports or stay on form
    // For now, show a success and stay on form
    console.log('Report saved:', savedReportId)
  }

  // Loading state
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #1E3A5F',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ color: '#666' }}>Loading report...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          background: '#f8d7da',
          color: '#721c24',
          padding: '20px 40px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 10px 0' }}>Error</h3>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
        <button
          onClick={handleBackToNew}
          style={{
            background: '#1E3A5F',
            color: 'white',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Go to New Report
        </button>
      </div>
    )
  }

  // My Reports view
  if (view === 'myreports') {
    return (
      <MyReports
        user={user}
        onEditReport={handleEditReport}
        onBack={handleBackToNew}
      />
    )
  }

  // New or Edit Report view
  return (
    <div>
      {/* Navigation Bar */}
      <div style={{
        background: '#1E3A5F',
        padding: '8px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleBackToNew}
            style={{
              background: view === 'new' || view === 'edit' ? '#D35F28' : 'transparent',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: view === 'new' ? 'bold' : 'normal'
            }}
          >
            {view === 'edit' ? '✏️ Editing Report' : '📝 New Report'}
          </button>
          <button
            onClick={() => navigate(orgPath('/inspector-invoicing'))}
            style={{
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            💰 My Invoices
          </button>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>
            {user?.email}
          </span>
        </div>
      </div>

      {/* Edit Mode Banner */}
      {view === 'edit' && editReportData && (
        <div style={{
          background: '#fff3cd',
          borderBottom: '1px solid #ffc107',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>✏️ Editing Report:</strong>{' '}
            {editReportData.report_date} - {editReportData.inspector_name}
            {editReportData.revision_requested && (
              <span style={{
                background: '#dc3545',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '12px',
                marginLeft: '12px'
              }}>
                ⚠️ Revision Requested
              </span>
            )}
          </div>
          <button
            onClick={handleBackToNew}
            style={{
              background: '#6c757d',
              color: 'white',
              border: 'none',
              padding: '6px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Cancel Edit
          </button>
        </div>
      )}

      {/* Revision Notes Banner */}
      {view === 'edit' && editReportData?.revision_requested && editReportData?.revision_notes && (
        <div style={{
          background: '#f8d7da',
          borderBottom: '1px solid #dc3545',
          padding: '12px 20px'
        }}>
          <strong>📝 Revision Notes from Admin:</strong>
          <p style={{ margin: '8px 0 0 0' }}>{editReportData.revision_notes}</p>
        </div>
      )}

      {/* Inspector Report Form */}
      <InspectorReport
        user={user}
        editMode={view === 'edit'}
        editReportId={editReportId}
        editReportData={editReportData}
        onSaveComplete={handleSaveComplete}
      />
    </div>
  )
}

export default InspectorApp
