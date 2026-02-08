import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import WeldingReportViewer from './WeldingReportViewer.jsx'

/**
 * WeldingReportReviewTab Component
 *
 * Tab content for the Welding Chief Dashboard showing reports
 * with welding activities that require review/approval.
 */

// Welding activity types that require Welding Chief review
const WELDING_ACTIVITY_TYPES = [
  'mainline welding',
  'tie-in',
  'tie-ins',
  'welder testing log',
  'welding',
  'welding - tie-in',
  'mainline weld'
]

function WeldingReportReviewTab({ onPendingCountChange }) {
  const { addOrgFilter, getOrgId, isReady } = useOrgQuery()

  // Queue state
  const [activeQueue, setActiveQueue] = useState('pending')
  const [pendingReports, setPendingReports] = useState([])
  const [approvedReports, setApprovedReports] = useState([])
  const [revisionRequests, setRevisionRequests] = useState([])
  const [loading, setLoading] = useState(true)

  // Selected report for viewer
  const [selectedReport, setSelectedReport] = useState(null)

  // Filters
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })
  const [inspectorFilter, setInspectorFilter] = useState('')

  // Load data when ready
  useEffect(() => {
    if (isReady()) {
      loadAllQueues()
    }
  }, [isReady()])

  // Notify parent of pending count changes
  useEffect(() => {
    if (onPendingCountChange) {
      onPendingCountChange(pendingReports.length)
    }
  }, [pendingReports.length, onPendingCountChange])

  async function loadAllQueues() {
    setLoading(true)
    await Promise.all([
      fetchPendingReviews(),
      fetchApprovedReviews(),
      fetchRevisionRequests()
    ])
    setLoading(false)
  }

  // Check if a report has welding activities
  function hasWeldingActivities(report) {
    const blocks = report.activity_blocks || []
    return blocks.some(block => {
      const activityType = (block.activityType || '').toLowerCase()
      return WELDING_ACTIVITY_TYPES.some(type => activityType.includes(type))
    })
  }

  // Fetch reports with welding activities that don't have an approved review
  async function fetchPendingReviews() {
    try {
      // First get all reports with welding activities
      let query = supabase
        .from('daily_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      query = addOrgFilter(query)
      const { data: reports, error } = await query

      if (error) throw error

      // Filter to only welding reports
      const weldingReports = (reports || []).filter(hasWeldingActivities)

      // Get existing reviews
      let reviewQuery = supabase
        .from('welding_report_reviews')
        .select('report_id, status')

      reviewQuery = addOrgFilter(reviewQuery)
      const { data: reviews } = await reviewQuery

      const reviewMap = {}
      ;(reviews || []).forEach(r => {
        reviewMap[r.report_id] = r.status
      })

      // Filter to pending (no review or pending_review status)
      const pending = weldingReports.filter(report => {
        const status = reviewMap[report.id]
        return !status || status === 'pending_review'
      })

      setPendingReports(pending)
    } catch (err) {
      console.error('Error fetching pending reviews:', err)
    }
  }

  // Fetch approved reviews
  async function fetchApprovedReviews() {
    try {
      let query = supabase
        .from('welding_report_reviews')
        .select('*, daily_reports!inner(*)')
        .eq('status', 'approved')
        .order('reviewed_at', { ascending: false })
        .limit(50)

      query = addOrgFilter(query)
      const { data, error } = await query

      if (error) throw error

      // Map to include report data
      const approved = (data || []).map(review => ({
        ...review.daily_reports,
        review: {
          status: review.status,
          reviewed_at: review.reviewed_at,
          reviewed_by_name: review.reviewed_by_name,
          signature_image: review.signature_image
        }
      }))

      setApprovedReports(approved)
    } catch (err) {
      console.error('Error fetching approved reviews:', err)
    }
  }

  // Fetch revision requests
  async function fetchRevisionRequests() {
    try {
      let query = supabase
        .from('welding_report_reviews')
        .select('*, daily_reports!inner(*)')
        .eq('status', 'revision_requested')
        .order('updated_at', { ascending: false })

      query = addOrgFilter(query)
      const { data, error } = await query

      if (error) throw error

      // Map to include report data
      const revisions = (data || []).map(review => ({
        ...review.daily_reports,
        review: {
          status: review.status,
          reviewed_at: review.reviewed_at,
          reviewed_by_name: review.reviewed_by_name,
          revision_notes: review.revision_notes
        }
      }))

      setRevisionRequests(revisions)
    } catch (err) {
      console.error('Error fetching revision requests:', err)
    }
  }

  // Get filtered reports based on current queue
  function getFilteredReports() {
    let reports = []
    switch (activeQueue) {
      case 'pending':
        reports = pendingReports
        break
      case 'approved':
        reports = approvedReports
        break
      case 'revisions':
        reports = revisionRequests
        break
      default:
        reports = pendingReports
    }

    // Apply date filter
    if (dateFilter.start) {
      reports = reports.filter(r => r.date >= dateFilter.start)
    }
    if (dateFilter.end) {
      reports = reports.filter(r => r.date <= dateFilter.end)
    }

    // Apply inspector filter
    if (inspectorFilter) {
      const search = inspectorFilter.toLowerCase()
      reports = reports.filter(r =>
        (r.inspector_name || '').toLowerCase().includes(search)
      )
    }

    return reports
  }

  // Format date for display
  function formatDate(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Format datetime for display
  function formatDateTime(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  // Get activity types from report
  function getActivityTypes(report) {
    const blocks = report.activity_blocks || []
    const types = [...new Set(blocks.map(b => b.activityType).filter(Boolean))]
    return types.join(', ') || 'N/A'
  }

  // Get KP range from report
  function getKPRange(report) {
    const blocks = report.activity_blocks || []
    const kps = blocks
      .flatMap(b => [b.startKP, b.endKP])
      .filter(Boolean)

    if (kps.length === 0) return '-'

    kps.sort((a, b) => {
      const parseKP = (kp) => {
        const parts = String(kp).split('+')
        return parseFloat(parts[0]) + (parseFloat(parts[1] || 0) / 1000)
      }
      return parseKP(a) - parseKP(b)
    })

    return `${kps[0]} - ${kps[kps.length - 1]}`
  }

  // Handle review completion (refresh queues)
  function handleReviewComplete() {
    setSelectedReport(null)
    loadAllQueues()
  }

  // Styles
  const queueButtonStyle = (isActive) => ({
    padding: '10px 20px',
    backgroundColor: isActive ? '#6f42c1' : '#e9ecef',
    color: isActive ? 'white' : '#333',
    border: 'none',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: isActive ? 'bold' : 'normal',
    position: 'relative'
  })

  const badgeStyle = {
    marginLeft: '8px',
    backgroundColor: '#ffc107',
    color: '#000',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 'bold'
  }

  const tableStyle = { width: '100%', borderCollapse: 'collapse' }
  const thStyle = {
    padding: '12px 15px',
    textAlign: 'left',
    borderBottom: '2px solid #dee2e6',
    backgroundColor: '#f8f9fa',
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#495057'
  }
  const tdStyle = {
    padding: '12px 15px',
    borderBottom: '1px solid #eee',
    fontSize: '14px'
  }

  const filteredReports = getFilteredReports()

  return (
    <div style={{ padding: '20px' }}>
      {/* Queue Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '0' }}>
        <button
          onClick={() => setActiveQueue('pending')}
          style={queueButtonStyle(activeQueue === 'pending')}
        >
          Pending Review
          {pendingReports.length > 0 && (
            <span style={badgeStyle}>{pendingReports.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveQueue('approved')}
          style={queueButtonStyle(activeQueue === 'approved')}
        >
          Approved
          {approvedReports.length > 0 && (
            <span style={{ ...badgeStyle, backgroundColor: '#28a745', color: '#fff' }}>
              {approvedReports.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveQueue('revisions')}
          style={queueButtonStyle(activeQueue === 'revisions')}
        >
          Revision Requested
          {revisionRequests.length > 0 && (
            <span style={{ ...badgeStyle, backgroundColor: '#dc3545', color: '#fff' }}>
              {revisionRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          backgroundColor: '#f8f9fa',
          padding: '15px 20px',
          borderRadius: '0 8px 0 0',
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          gap: '15px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <span style={{ fontWeight: 'bold', color: '#666', fontSize: '13px' }}>Filter:</span>

        <input
          type="date"
          placeholder="Start Date"
          value={dateFilter.start}
          onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
          style={{
            padding: '8px 12px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '13px'
          }}
        />
        <span style={{ color: '#666' }}>to</span>
        <input
          type="date"
          placeholder="End Date"
          value={dateFilter.end}
          onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
          style={{
            padding: '8px 12px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '13px'
          }}
        />

        <input
          type="text"
          placeholder="Inspector name..."
          value={inspectorFilter}
          onChange={(e) => setInspectorFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '13px',
            width: '150px'
          }}
        />

        <button
          onClick={() => {
            setDateFilter({ start: '', end: '' })
            setInspectorFilter('')
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
          Clear
        </button>

        <span style={{ marginLeft: 'auto', color: '#666', fontSize: '13px' }}>
          Showing {filteredReports.length} reports
        </span>
      </div>

      {/* Reports Table */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '0 0 8px 8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}
      >
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            Loading reports...
          </div>
        ) : filteredReports.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '10px' }}>
              {activeQueue === 'pending' ? '✅' : '📋'}
            </span>
            {activeQueue === 'pending'
              ? 'No pending welding reports to review'
              : activeQueue === 'approved'
              ? 'No approved reports yet'
              : 'No revision requests'}
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Inspector</th>
                <th style={thStyle}>Activity Types</th>
                <th style={thStyle}>KP Range</th>
                <th style={thStyle}>Spread</th>
                <th style={thStyle}>
                  {activeQueue === 'pending' ? 'Submitted' : 'Reviewed'}
                </th>
                {activeQueue === 'approved' && <th style={thStyle}>Signed By</th>}
                {activeQueue === 'revisions' && <th style={thStyle}>Notes</th>}
                <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report, idx) => (
                <tr
                  key={report.id}
                  style={{
                    backgroundColor: idx % 2 === 0 ? 'white' : '#f8f9fa',
                    cursor: 'pointer'
                  }}
                  onClick={() => setSelectedReport(report)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#e3f2fd'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'white' : '#f8f9fa'
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: 'bold' }}>{formatDate(report.date)}</td>
                  <td style={tdStyle}>{report.inspector_name || '-'}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        backgroundColor: '#e9ecef',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}
                    >
                      {getActivityTypes(report)}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{getKPRange(report)}</td>
                  <td style={tdStyle}>{report.spread || '-'}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: '#666' }}>
                    {formatDateTime(
                      activeQueue === 'pending' ? report.created_at : report.review?.reviewed_at
                    )}
                  </td>
                  {activeQueue === 'approved' && (
                    <td style={tdStyle}>
                      {report.review?.reviewed_by_name || '-'}
                      {report.review?.signature_image && (
                        <span style={{ color: '#28a745', marginLeft: '8px' }}>✓ Signed</span>
                      )}
                    </td>
                  )}
                  {activeQueue === 'revisions' && (
                    <td style={{ ...tdStyle, maxWidth: '200px' }}>
                      <span
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          fontSize: '12px',
                          color: '#dc3545'
                        }}
                      >
                        {report.review?.revision_notes || '-'}
                      </span>
                    </td>
                  )}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedReport(report)
                      }}
                      style={{
                        padding: '6px 16px',
                        backgroundColor: activeQueue === 'pending' ? '#6f42c1' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold'
                      }}
                    >
                      {activeQueue === 'pending' ? 'Review' : 'View'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Report Viewer Modal */}
      {selectedReport && (
        <WeldingReportViewer
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onReviewComplete={handleReviewComplete}
          readOnly={activeQueue !== 'pending'}
        />
      )}
    </div>
  )
}

export default WeldingReportReviewTab
