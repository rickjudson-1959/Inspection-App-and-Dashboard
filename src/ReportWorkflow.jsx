import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'

// ReportWorkflow component
// Handles report submission, approval, and audit trail

function ReportWorkflow({ 
  reportId, 
  reportDate, 
  currentUser,  // { id, name, email, role }
  onStatusChange 
}) {
  const [status, setStatus] = useState(null)  // report_status record
  const [auditLog, setAuditLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAuditLog, setShowAuditLog] = useState(false)
  const [revisionNotes, setRevisionNotes] = useState('')
  const [showRevisionModal, setShowRevisionModal] = useState(false)

  // Determine permissions based on role
  const canApprove = ['chief', 'asst_chief', 'admin'].includes(currentUser?.role)
  const canEdit = canApprove || (currentUser?.role === 'inspector' && status?.status === 'draft')
  const canSubmit = reportId && (status?.status === 'draft' || status?.status === 'revision_requested')

  useEffect(() => {
    if (reportId) {
      loadStatus()
      loadAuditLog()
    } else {
      // New report - no ID yet
      setStatus({ status: 'new' })
      setLoading(false)
    }
  }, [reportId])

  const loadStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('report_status')
        .select('*')
        .eq('report_id', reportId)
        .single()

      if (error && error.code !== 'PGRST116') {  // PGRST116 = no rows
        console.error('Error loading status:', error)
      }
      
      setStatus(data || { status: 'draft' })
    } catch (err) {
      console.error('Error:', err)
    }
    setLoading(false)
  }

  const loadAuditLog = async () => {
    try {
      const { data } = await supabase
        .from('report_audit_log')
        .select('*')
        .eq('report_id', reportId)
        .order('changed_at', { ascending: false })
        .limit(50)

      if (data) setAuditLog(data)
    } catch (err) {
      console.error('Error loading audit log:', err)
    }
  }

  // Submit report for approval
  const handleSubmit = async () => {
    if (!confirm('Submit this report for approval?')) return

    try {
      const now = new Date().toISOString()
      
      // Upsert status
      const { error: statusError } = await supabase
        .from('report_status')
        .upsert({
          report_id: reportId,
          status: 'submitted',
          submitted_at: now,
          submitted_by: currentUser?.id,
          submitted_by_name: currentUser?.name,
          updated_at: now
        }, { onConflict: 'report_id' })

      if (statusError) throw statusError

      // Log to audit
      await supabase.from('report_audit_log').insert({
        report_id: reportId,
        report_date: reportDate,
        changed_by: currentUser?.id,
        changed_by_name: currentUser?.name,
        changed_by_role: currentUser?.role,
        change_type: 'submit'
      })

      loadStatus()
      loadAuditLog()
      if (onStatusChange) onStatusChange('submitted')
      alert('Report submitted for approval')
    } catch (err) {
      console.error('Error submitting:', err)
      alert('Error submitting report')
    }
  }

  // Approve report
  const handleApprove = async () => {
    if (!confirm('Approve this report?')) return

    try {
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('report_status')
        .upsert({
          report_id: reportId,
          status: 'approved',
          reviewed_at: now,
          reviewed_by: currentUser?.id,
          reviewed_by_name: currentUser?.name,
          review_decision: 'approved',
          updated_at: now
        }, { onConflict: 'report_id' })

      if (error) throw error

      // Log to audit
      await supabase.from('report_audit_log').insert({
        report_id: reportId,
        report_date: reportDate,
        changed_by: currentUser?.id,
        changed_by_name: currentUser?.name,
        changed_by_role: currentUser?.role,
        change_type: 'approve'
      })

      loadStatus()
      loadAuditLog()
      if (onStatusChange) onStatusChange('approved')
      alert('Report approved')
    } catch (err) {
      console.error('Error approving:', err)
      alert('Error approving report')
    }
  }

  // Request revision
  const handleRequestRevision = async () => {
    if (!revisionNotes.trim()) {
      alert('Please enter revision notes explaining what needs to be changed')
      return
    }

    try {
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('report_status')
        .upsert({
          report_id: reportId,
          status: 'revision_requested',
          reviewed_at: now,
          reviewed_by: currentUser?.id,
          reviewed_by_name: currentUser?.name,
          review_decision: 'revision_requested',
          revision_notes: revisionNotes,
          updated_at: now
        }, { onConflict: 'report_id' })

      if (error) throw error

      // Log to audit
      await supabase.from('report_audit_log').insert({
        report_id: reportId,
        report_date: reportDate,
        changed_by: currentUser?.id,
        changed_by_name: currentUser?.name,
        changed_by_role: currentUser?.role,
        change_type: 'revision_request',
        change_reason: revisionNotes
      })

      setShowRevisionModal(false)
      setRevisionNotes('')
      loadStatus()
      loadAuditLog()
      if (onStatusChange) onStatusChange('revision_requested')
      alert('Revision requested')
    } catch (err) {
      console.error('Error requesting revision:', err)
      alert('Error requesting revision')
    }
  }

  // Status badge colors
  const getStatusBadge = () => {
    const badges = {
      new: { bg: '#17a2b8', text: 'NEW - NOT SAVED YET' },
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

  if (loading) return <div style={{ padding: '10px', color: '#666' }}>Loading status...</div>

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
          {/* Message for new reports */}
          {status?.status === 'new' && (
            <span style={{ color: '#17a2b8', fontSize: '13px', alignSelf: 'center' }}>
              💾 Save report first to enable submission
            </span>
          )}

          {/* Submit Button - for inspectors with draft/revision reports */}
          {canSubmit && (
            <button
              onClick={handleSubmit}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px'
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
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px'
                }}
              >
                ✓ Approve
              </button>
              <button
                onClick={() => setShowRevisionModal(true)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px'
                }}
              >
                ↩ Request Revision
              </button>
            </>
          )}

          {/* Audit Log Toggle */}
          <button
            onClick={() => setShowAuditLog(!showAuditLog)}
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
            📋 {showAuditLog ? 'Hide' : 'Show'} History ({auditLog.length})
          </button>
        </div>
      </div>

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
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '500px'
          }}>
            <h3 style={{ margin: '0 0 15px 0' }}>Request Revision</h3>
            <p style={{ color: '#666', fontSize: '14px' }}>
              Explain what changes are needed:
            </p>
            <textarea
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                marginBottom: '15px',
                boxSizing: 'border-box'
              }}
              placeholder="e.g., KP values need correction, missing contractor info..."
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRevisionModal(false)}
                style={{
                  padding: '8px 16px',
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
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Send Revision Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log */}
      {showAuditLog && (
        <div style={{
          marginTop: '15px',
          padding: '15px',
          backgroundColor: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          maxHeight: '300px',
          overflowY: 'auto'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>📋 Change History</h4>
          {auditLog.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No changes logged yet.</p>
          ) : (
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>When</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Who</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Action</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry, idx) => (
                  <tr key={entry.id || idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      {formatDate(entry.changed_at)}
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <strong>{entry.changed_by_name}</strong>
                      <br />
                      <span style={{ color: '#666', fontSize: '11px' }}>{entry.changed_by_role}</span>
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '11px',
                        backgroundColor: 
                          entry.change_type === 'create' ? '#28a745' :
                          entry.change_type === 'edit' ? '#007bff' :
                          entry.change_type === 'submit' ? '#ffc107' :
                          entry.change_type === 'approve' ? '#28a745' :
                          entry.change_type === 'revision_request' ? '#dc3545' : '#6c757d',
                        color: entry.change_type === 'submit' ? '#000' : '#fff'
                      }}>
                        {entry.change_type?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      {entry.field_name && (
                        <div>
                          <strong>{entry.section}</strong> → {entry.field_name}
                          <br />
                          <span style={{ color: '#dc3545' }}>{entry.old_value || '(empty)'}</span>
                          {' → '}
                          <span style={{ color: '#28a745' }}>{entry.new_value || '(empty)'}</span>
                        </div>
                      )}
                      {entry.change_reason && (
                        <div style={{ color: '#666', fontStyle: 'italic', marginTop: '4px' }}>
                          "{entry.change_reason}"
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default ReportWorkflow
