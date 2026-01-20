// ReportWorkflow.jsx - Report submission and approval workflow
// UPDATED: Removed confusing "Not Saved Yet" status bar message

import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'

function ReportWorkflow({ 
  reportId, 
  reportDate, 
  currentUser, 
  onStatusChange 
}) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [revisionNotes, setRevisionNotes] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [statusHistory, setStatusHistory] = useState([])

  // Load current status
  useEffect(() => {
    loadStatus()
  }, [reportId])

  const loadStatus = async () => {
    if (!reportId) {
      // No report ID means new unsaved report - don't show workflow yet
      setStatus(null)
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('report_status')
        .select('*')
        .eq('report_id', reportId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading status:', error)
      }

      if (data) {
        setStatus(data)
      } else {
        // Report exists but no status yet - it's a draft
        setStatus({ status: 'draft', report_id: reportId })
      }
    } catch (err) {
      console.error('Error:', err)
    }
    setLoading(false)
  }

  // Load status history
  const loadHistory = async () => {
    if (!reportId) return

    try {
      const { data, error } = await supabase
        .from('report_status_history')
        .select('*')
        .eq('report_id', reportId)
        .order('changed_at', { ascending: false })

      if (error) {
        console.error('Error loading history:', error)
        return
      }

      setStatusHistory(data || [])
    } catch (err) {
      console.error('Error:', err)
    }
  }

  // Submit for approval
  const handleSubmit = async () => {
    if (!reportId) {
      alert('Please save the report first before submitting.')
      return
    }

    setSubmitting(true)
    try {
      // Check if status record exists
      const { data: existing } = await supabase
        .from('report_status')
        .select('id')
        .eq('report_id', reportId)
        .single()

      const statusUpdate = {
        report_id: reportId,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submitted_by: currentUser?.userId,
        submitted_by_name: currentUser?.userName || 'Unknown',
        revision_notes: null
      }

      if (existing) {
        await supabase
          .from('report_status')
          .update(statusUpdate)
          .eq('report_id', reportId)
      } else {
        await supabase
          .from('report_status')
          .insert(statusUpdate)
      }

      // Log to history
      await supabase.from('report_status_history').insert({
        report_id: reportId,
        status: 'submitted',
        changed_by: currentUser?.userId,
        changed_by_name: currentUser?.userName || 'Unknown',
        notes: 'Submitted for approval'
      })

      setStatus({ ...status, ...statusUpdate })
      if (onStatusChange) onStatusChange('submitted')
      alert('Report submitted for approval!')
    } catch (err) {
      console.error('Error submitting:', err)
      alert('Error submitting report')
    }
    setSubmitting(false)
  }

  // Approve (Chief/Admin only)
  const handleApprove = async () => {
    if (!window.confirm('Approve this report?')) return

    setSubmitting(true)
    try {
      const statusUpdate = {
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUser?.userId,
        reviewed_by_name: currentUser?.userName || 'Unknown',
        revision_notes: null
      }

      await supabase
        .from('report_status')
        .update(statusUpdate)
        .eq('report_id', reportId)

      // Log to history
      await supabase.from('report_status_history').insert({
        report_id: reportId,
        status: 'approved',
        changed_by: currentUser?.userId,
        changed_by_name: currentUser?.userName || 'Unknown',
        notes: 'Report approved'
      })

      setStatus({ ...status, ...statusUpdate })
      if (onStatusChange) onStatusChange('approved')
      alert('Report approved!')
    } catch (err) {
      console.error('Error approving:', err)
      alert('Error approving report')
    }
    setSubmitting(false)
  }

  // Request revision
  const handleRequestRevision = async () => {
    if (!revisionNotes.trim()) {
      alert('Please enter revision notes')
      return
    }

    setSubmitting(true)
    try {
      const statusUpdate = {
        status: 'revision_requested',
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUser?.userId,
        reviewed_by_name: currentUser?.userName || 'Unknown',
        revision_notes: revisionNotes
      }

      await supabase
        .from('report_status')
        .update(statusUpdate)
        .eq('report_id', reportId)

      // Log to history
      await supabase.from('report_status_history').insert({
        report_id: reportId,
        status: 'revision_requested',
        changed_by: currentUser?.userId,
        changed_by_name: currentUser?.userName || 'Unknown',
        notes: revisionNotes
      })

      setStatus({ ...status, ...statusUpdate })
      setShowRevisionModal(false)
      setRevisionNotes('')
      if (onStatusChange) onStatusChange('revision_requested')
      alert('Revision requested. The inspector will be notified.')
    } catch (err) {
      console.error('Error requesting revision:', err)
      alert('Error requesting revision')
    }
    setSubmitting(false)
  }

  // Status badge colors
  const getStatusBadge = () => {
    const badges = {
      draft: { bg: '#6c757d', text: 'DRAFT' },
      submitted: { bg: '#ffc107', text: 'SUBMITTED - AWAITING APPROVAL', textColor: '#000' },
      approved: { bg: '#28a745', text: 'APPROVED ✓' },
      revision_requested: { bg: '#dc3545', text: 'REVISION REQUESTED' }
    }
    const badge = badges[status?.status] || badges.draft
    return (
      <span style={{
        display: 'inline-block',
        padding: '6px 12px',
        backgroundColor: badge.bg,
        color: badge.textColor || 'white',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold'
      }}>
        {badge.text}
      </span>
    )
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleString()
  }

  // Don't show workflow for unsaved reports
  if (!reportId) {
    return null
  }

  if (loading) return <div style={{ padding: '10px', color: '#666' }}>Loading status...</div>

  // Determine permissions based on role
  const canApprove = ['chief_inspector', 'asst_chief', 'admin', 'super_admin'].includes(currentUser?.role)
  const canSubmit = reportId && (status?.status === 'draft' || status?.status === 'revision_requested')

  return (
    <div style={{ marginBottom: '20px' }}>
      {/* Status Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '15px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px',
        border: '1px solid #dee2e6',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
          {getStatusBadge()}
          
          {status?.status === 'submitted' && status?.submitted_at && (
            <span style={{ fontSize: '12px', color: '#666' }}>
              Submitted by {status.submitted_by_name} on {formatDate(status.submitted_at)}
            </span>
          )}
          
          {status?.status === 'approved' && status?.reviewed_at && (
            <span style={{ fontSize: '12px', color: '#666' }}>
              Approved by {status.reviewed_by_name} on {formatDate(status.reviewed_at)}
            </span>
          )}
          
          {status?.status === 'revision_requested' && (
            <span style={{ fontSize: '12px', color: '#dc3545' }}>
              ⚠️ {status.revision_notes}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {/* Submit Button - for inspectors with draft/revision reports */}
          {canSubmit && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '13px',
                opacity: submitting ? 0.7 : 1
              }}
            >
              📤 Submit for Approval
            </button>
          )}

          {/* Approve/Reject - for Chief/Asst Chief */}
          {canApprove && status?.status === 'submitted' && (
            <>
              <button
                onClick={handleApprove}
                disabled={submitting}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px'
                }}
              >
                ✓ Approve
              </button>
              <button
                onClick={() => setShowRevisionModal(true)}
                disabled={submitting}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px'
                }}
              >
                ↩ Request Revision
              </button>
            </>
          )}

          {/* History Button */}
          <button
            onClick={() => {
              setShowHistory(!showHistory)
              if (!showHistory) loadHistory()
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            📋 {showHistory ? 'Hide' : 'Show'} History
          </button>
        </div>
      </div>

      {/* Status History */}
      {showHistory && (
        <div style={{ 
          marginTop: '10px', 
          padding: '15px', 
          backgroundColor: '#fff', 
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Status History</h4>
          {statusHistory.length === 0 ? (
            <p style={{ color: '#666', fontSize: '13px' }}>No history available</p>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {statusHistory.map((entry, idx) => (
                <div key={idx} style={{ 
                  padding: '8px', 
                  borderBottom: idx < statusHistory.length - 1 ? '1px solid #eee' : 'none',
                  fontSize: '12px'
                }}>
                  <span style={{ 
                    display: 'inline-block',
                    padding: '2px 8px',
                    backgroundColor: entry.status === 'approved' ? '#28a745' : 
                                    entry.status === 'submitted' ? '#ffc107' :
                                    entry.status === 'revision_requested' ? '#dc3545' : '#6c757d',
                    color: entry.status === 'submitted' ? '#000' : '#fff',
                    borderRadius: '3px',
                    marginRight: '10px',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}>
                    {entry.status?.toUpperCase().replace('_', ' ')}
                  </span>
                  <span style={{ color: '#666' }}>
                    by {entry.changed_by_name} • {formatDate(entry.changed_at)}
                  </span>
                  {entry.notes && (
                    <div style={{ marginTop: '4px', color: '#333', fontStyle: 'italic' }}>
                      "{entry.notes}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Revision Modal */}
      {showRevisionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginTop: 0 }}>Request Revision</h3>
            <p style={{ color: '#666', fontSize: '14px' }}>
              Please explain what needs to be corrected:
            </p>
            <textarea
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder="Enter revision notes..."
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '10px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRevisionModal(false)
                  setRevisionNotes('')
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRequestRevision}
                disabled={submitting || !revisionNotes.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting || !revisionNotes.trim() ? 0.7 : 1
                }}
              >
                {submitting ? 'Sending...' : 'Send Revision Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportWorkflow
