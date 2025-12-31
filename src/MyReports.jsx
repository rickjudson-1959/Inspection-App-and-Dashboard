import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'

function MyReports({ user, onEditReport, onBack }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState({
    startDate: '',
    endDate: '',
    activityType: '',
    status: ''
  })
  const [sortField, setSortField] = useState('report_date')
  const [sortDirection, setSortDirection] = useState('desc')

  useEffect(() => {
    fetchReports()
  }, [user])

  async function fetchReports() {
    if (!user?.email) return
    
    setLoading(true)
    setError(null)
    
    try {
      let query = supabase
        .from('daily_reports')
        .select(`
          id,
          report_date,
          inspector_name,
          spread,
          pipeline,
          status,
          created_at,
          updated_at,
          revision_requested,
          revision_notes,
          activity_blocks
        `)
        .eq('inspector_email', user.email)
        .order('report_date', { ascending: false })

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError
      
      setReports(data || [])
    } catch (err) {
      console.error('Error fetching reports:', err)
      setError('Failed to load reports. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function getFilteredReports() {
    let filtered = [...reports]

    if (filter.startDate) {
      filtered = filtered.filter(r => r.report_date >= filter.startDate)
    }
    if (filter.endDate) {
      filtered = filtered.filter(r => r.report_date <= filter.endDate)
    }
    if (filter.activityType) {
      filtered = filtered.filter(r => {
        const blocks = r.activity_blocks || []
        return blocks.some(b => b.activityType?.toLowerCase().includes(filter.activityType.toLowerCase()))
      })
    }
    if (filter.status) {
      if (filter.status === 'revision_requested') {
        filtered = filtered.filter(r => r.revision_requested)
      } else {
        filtered = filtered.filter(r => r.status === filter.status)
      }
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]
      
      if (sortField === 'report_date' || sortField === 'created_at' || sortField === 'updated_at') {
        aVal = new Date(aVal)
        bVal = new Date(bVal)
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })

    return filtered
  }

  function getActivitySummary(report) {
    const blocks = report.activity_blocks || []
    if (blocks.length === 0) return 'No activities'
    
    const types = [...new Set(blocks.map(b => b.activityType).filter(Boolean))]
    return types.join(', ') || 'No activities'
  }

  function getKPRange(report) {
    const blocks = report.activity_blocks || []
    if (blocks.length === 0) return '-'
    
    const kps = blocks
      .flatMap(b => [b.startKP, b.endKP])
      .filter(Boolean)
    
    if (kps.length === 0) return '-'
    
    // Simple sort for KP format "12+500"
    kps.sort((a, b) => {
      const parseKP = (kp) => {
        const parts = kp.split('+')
        return parseFloat(parts[0]) + (parseFloat(parts[1] || 0) / 1000)
      }
      return parseKP(a) - parseKP(b)
    })
    
    return `${kps[0]} - ${kps[kps.length - 1]}`
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-CA') // YYYY-MM-DD format
  }

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  function getSortIcon(field) {
    if (sortField !== field) return '↕️'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  function getStatusBadge(report) {
    if (report.revision_requested) {
      return (
        <span style={{
          background: '#dc3545',
          color: 'white',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 'bold'
        }}>
          ⚠️ REVISION REQUESTED
        </span>
      )
    }
    
    const statusColors = {
      'draft': { bg: '#6c757d', text: 'Draft' },
      'submitted': { bg: '#28a745', text: 'Submitted' },
      'approved': { bg: '#007bff', text: 'Approved' },
      'rejected': { bg: '#dc3545', text: 'Rejected' }
    }
    
    const status = statusColors[report.status] || statusColors['submitted']
    
    return (
      <span style={{
        background: status.bg,
        color: 'white',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '12px'
      }}>
        {status.text}
      </span>
    )
  }

  const filteredReports = getFilteredReports()
  const revisionRequestedCount = reports.filter(r => r.revision_requested).length

  // Styles
  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif'
  }

  const headerStyle = {
    background: 'linear-gradient(135deg, #1E3A5F 0%, #2d5a8b 100%)',
    color: 'white',
    padding: '20px',
    borderRadius: '8px 8px 0 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px'
  }

  const backButtonStyle = {
    background: 'rgba(255,255,255,0.2)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.3)',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  }

  const alertStyle = {
    background: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '4px',
    padding: '12px 16px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  }

  const filterBarStyle = {
    background: '#f8f9fa',
    padding: '16px',
    borderLeft: '1px solid #ddd',
    borderRight: '1px solid #ddd',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center'
  }

  const inputStyle = {
    padding: '8px 12px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px'
  }

  const tableContainerStyle = {
    overflowX: 'auto',
    border: '1px solid #ddd',
    borderTop: 'none',
    borderRadius: '0 0 8px 8px'
  }

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px'
  }

  const thStyle = {
    background: '#e9ecef',
    padding: '12px 8px',
    textAlign: 'left',
    borderBottom: '2px solid #dee2e6',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    userSelect: 'none'
  }

  const tdStyle = {
    padding: '12px 8px',
    borderBottom: '1px solid #dee2e6',
    verticalAlign: 'middle'
  }

  const editButtonStyle = {
    background: '#D35F28',
    color: 'white',
    border: 'none',
    padding: '6px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold'
  }

  const viewButtonStyle = {
    background: '#6c757d',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    marginRight: '8px'
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>📋 My Reports</h1>
          <p style={{ margin: '4px 0 0 0', opacity: 0.9, fontSize: '14px' }}>
            {user?.email} • {reports.length} total reports
          </p>
        </div>
        <button style={backButtonStyle} onClick={onBack}>
          ← Back to New Report
        </button>
      </div>

      {/* Revision Requested Alert */}
      {revisionRequestedCount > 0 && (
        <div style={alertStyle}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div>
            <strong>{revisionRequestedCount} report{revisionRequestedCount > 1 ? 's' : ''} require revision</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
              An administrator has requested changes. Please review and update the flagged reports.
            </p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div style={filterBarStyle}>
        <span style={{ fontWeight: 'bold', color: '#666' }}>Filter:</span>
        
        <input
          type="date"
          placeholder="Start Date"
          value={filter.startDate}
          onChange={(e) => setFilter(prev => ({ ...prev, startDate: e.target.value }))}
          style={inputStyle}
        />
        
        <span style={{ color: '#666' }}>to</span>
        
        <input
          type="date"
          placeholder="End Date"
          value={filter.endDate}
          onChange={(e) => setFilter(prev => ({ ...prev, endDate: e.target.value }))}
          style={inputStyle}
        />
        
        <input
          type="text"
          placeholder="Activity Type..."
          value={filter.activityType}
          onChange={(e) => setFilter(prev => ({ ...prev, activityType: e.target.value }))}
          style={{ ...inputStyle, width: '140px' }}
        />
        
        <select
          value={filter.status}
          onChange={(e) => setFilter(prev => ({ ...prev, status: e.target.value }))}
          style={inputStyle}
        >
          <option value="">All Status</option>
          <option value="revision_requested">⚠️ Revision Requested</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="draft">Draft</option>
        </select>
        
        <button
          onClick={() => setFilter({ startDate: '', endDate: '', activityType: '', status: '' })}
          style={{
            ...inputStyle,
            background: '#6c757d',
            color: 'white',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          Clear
        </button>
        
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: '13px' }}>
          Showing {filteredReports.length} of {reports.length}
        </span>
      </div>

      {/* Table */}
      <div style={tableContainerStyle}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            Loading reports...
          </div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#dc3545' }}>
            {error}
            <br />
            <button onClick={fetchReports} style={{ marginTop: '10px', ...editButtonStyle }}>
              Retry
            </button>
          </div>
        ) : filteredReports.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            {reports.length === 0 
              ? "You haven't submitted any reports yet."
              : "No reports match your filter criteria."}
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => handleSort('report_date')}>
                  Date {getSortIcon('report_date')}
                </th>
                <th style={thStyle}>Activity</th>
                <th style={thStyle}>KP Range</th>
                <th style={thStyle}>Spread</th>
                <th style={thStyle}>Pipeline</th>
                <th style={thStyle} onClick={() => handleSort('updated_at')}>
                  Last Updated {getSortIcon('updated_at')}
                </th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report, index) => (
                <tr 
                  key={report.id}
                  style={{
                    background: report.revision_requested 
                      ? '#fff8f8' 
                      : index % 2 === 0 ? 'white' : '#f8f9fa'
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: 'bold' }}>
                    {formatDate(report.report_date)}
                  </td>
                  <td style={tdStyle}>
                    {getActivitySummary(report)}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                    {getKPRange(report)}
                  </td>
                  <td style={tdStyle}>
                    {report.spread || '-'}
                  </td>
                  <td style={tdStyle}>
                    {report.pipeline || '-'}
                  </td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: '#666' }}>
                    {formatDate(report.updated_at)}
                  </td>
                  <td style={tdStyle}>
                    {getStatusBadge(report)}
                    {report.revision_requested && report.revision_notes && (
                      <div style={{ 
                        fontSize: '11px', 
                        color: '#dc3545', 
                        marginTop: '4px',
                        maxWidth: '150px'
                      }}>
                        "{report.revision_notes}"
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button
                      style={editButtonStyle}
                      onClick={() => onEditReport(report.id)}
                      title="Edit this report"
                    >
                      ✏️ Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Info */}
      <div style={{ 
        marginTop: '16px', 
        padding: '12px', 
        background: '#e8f4fd', 
        borderRadius: '4px',
        fontSize: '13px',
        color: '#1E3A5F'
      }}>
        <strong>💡 Tip:</strong> All changes you make are tracked in the audit log. 
        Click "Edit" to modify any report - your original submission is preserved in the revision history.
      </div>
    </div>
  )
}

export default MyReports
