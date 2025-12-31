import React, { useState } from 'react'
import { supabase } from './supabase'

/**
 * RequestRevision - Component for admin/chief to request changes to a report
 * 
 * Features:
 * - Add notes about what needs to change
 * - Generate direct edit link for inspector
 * - Copy link to clipboard
 * - Optional: Send email notification to inspector
 * 
 * Props:
 * - reportId: UUID of the report
 * - reportDate: Date of the report (for display)
 * - inspectorName: Name of the inspector
 * - inspectorEmail: Email of the inspector
 * - onClose: Function to close the modal
 * - onSuccess: Function called after successful request
 */
function RequestRevision({ 
  reportId, 
  reportDate, 
  inspectorName, 
  inspectorEmail,
  onClose, 
  onSuccess 
}) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const editLink = `${window.location.origin}/report/edit/${reportId}`

  async function handleSubmit(e) {
    e.preventDefault()
    
    if (!notes.trim()) {
      setError('Please provide notes about what changes are needed')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      // Call the request_report_revision function
      const { error: rpcError } = await supabase.rpc('request_report_revision', {
        p_report_id: reportId,
        p_notes: notes.trim(),
        p_requested_by: user.id
      })

      if (rpcError) throw rpcError

      setSuccess(true)
      
      if (onSuccess) {
        onSuccess(reportId)
      }
    } catch (err) {
      console.error('Error requesting revision:', err)
      setError(err.message || 'Failed to request revision')
    } finally {
      setLoading(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(editLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  function copyEmailTemplate() {
    const template = `Hi ${inspectorName},

Please review and update your daily report for ${reportDate}.

Changes needed:
${notes}

Click here to edit your report:
${editLink}

Thank you.`

    navigator.clipboard.writeText(template).then(() => {
      alert('Email template copied to clipboard!')
    })
  }

  // Styles
  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  }

  const modalStyle = {
    background: 'white',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
  }

  const headerStyle = {
    background: '#dc3545',
    color: 'white',
    padding: '16px 20px',
    borderRadius: '8px 8px 0 0'
  }

  const bodyStyle = {
    padding: '20px'
  }

  const inputStyle = {
    width: '100%',
    padding: '12px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px',
    resize: 'vertical',
    minHeight: '100px',
    boxSizing: 'border-box'
  }

  const buttonStyle = {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px'
  }

  const linkBoxStyle = {
    background: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: '4px',
    padding: '12px',
    marginTop: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }

  // Success state
  if (success) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <div style={{ ...headerStyle, background: '#28a745' }}>
            <h3 style={{ margin: 0 }}>✅ Revision Requested</h3>
          </div>
          <div style={bodyStyle}>
            <p>The report has been flagged for revision. The inspector will see this when they log in.</p>
            
            <div style={linkBoxStyle}>
              <input
                type="text"
                value={editLink}
                readOnly
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  color: '#007bff'
                }}
              />
              <button
                onClick={copyLink}
                style={{
                  ...buttonStyle,
                  background: linkCopied ? '#28a745' : '#007bff',
                  color: 'white'
                }}
              >
                {linkCopied ? '✓ Copied!' : '📋 Copy Link'}
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#666', marginTop: '12px' }}>
              Send this link to the inspector so they can go directly to the report.
            </p>

            <button
              onClick={copyEmailTemplate}
              style={{
                ...buttonStyle,
                background: '#6c757d',
                color: 'white',
                width: '100%',
                marginTop: '12px'
              }}
            >
              📧 Copy Email Template
            </button>

            <div style={{ 
              marginTop: '20px', 
              paddingTop: '16px', 
              borderTop: '1px solid #dee2e6',
              textAlign: 'right'
            }}>
              <button
                onClick={onClose}
                style={{
                  ...buttonStyle,
                  background: '#1E3A5F',
                  color: 'white'
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <h3 style={{ margin: 0 }}>⚠️ Request Revision</h3>
          <p style={{ margin: '8px 0 0 0', opacity: 0.9, fontSize: '14px' }}>
            Report: {reportDate} - {inspectorName}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={bodyStyle}>
            {error && (
              <div style={{
                background: '#f8d7da',
                color: '#721c24',
                padding: '12px',
                borderRadius: '4px',
                marginBottom: '16px'
              }}>
                {error}
              </div>
            )}

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              What changes are needed?
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe what the inspector needs to fix or update..."
              style={inputStyle}
              autoFocus
            />

            <p style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
              These notes will be visible to the inspector when they view their reports.
            </p>

            <div style={{ 
              marginTop: '20px', 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '12px' 
            }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  ...buttonStyle,
                  background: '#f8f9fa',
                  color: '#333',
                  border: '1px solid #ccc'
                }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  ...buttonStyle,
                  background: '#dc3545',
                  color: 'white'
                }}
                disabled={loading}
              >
                {loading ? 'Submitting...' : 'Request Revision'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RequestRevision


/**
 * USAGE EXAMPLE in Admin Dashboard:
 * 
 * import RequestRevision from './RequestRevision'
 * 
 * // In your component state:
 * const [showRevisionModal, setShowRevisionModal] = useState(false)
 * const [selectedReport, setSelectedReport] = useState(null)
 * 
 * // To open the modal:
 * function handleRequestRevision(report) {
 *   setSelectedReport(report)
 *   setShowRevisionModal(true)
 * }
 * 
 * // In your JSX:
 * {showRevisionModal && selectedReport && (
 *   <RequestRevision
 *     reportId={selectedReport.id}
 *     reportDate={selectedReport.report_date}
 *     inspectorName={selectedReport.inspector_name}
 *     inspectorEmail={selectedReport.inspector_email}
 *     onClose={() => setShowRevisionModal(false)}
 *     onSuccess={() => {
 *       // Refresh your reports list
 *       fetchReports()
 *     }}
 *   />
 * )}
 * 
 * // Add a button to your report row:
 * <button onClick={() => handleRequestRevision(report)}>
 *   Request Revision
 * </button>
 */
