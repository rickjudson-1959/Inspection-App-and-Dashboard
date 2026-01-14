// ReportViewer.jsx - Read-only view of inspector reports
import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './AuthContext.jsx'

function ReportViewer() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const reportId = searchParams.get('id')
  
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reportStatus, setReportStatus] = useState(null)

  useEffect(() => {
    if (reportId) {
      loadReport()
    }
  }, [reportId])

  const loadReport = async () => {
    setLoading(true)
    setError(null)
    try {
      console.log('Loading report with ID:', reportId)
      
      // Load main report - handle both integer and UUID
      const { data: reportData, error: reportError } = await supabase
        .from('daily_tickets')
        .select('*')
        .eq('id', reportId)
        .single()
      
      if (reportError) {
        console.error('Report fetch error:', reportError)
        throw reportError
      }
      
      console.log('Loaded report:', reportData)
      setReport(reportData)

      // Load report status
      const { data: statusData } = await supabase
        .from('report_status')
        .select('*')
        .eq('report_id', reportId)
        .single()
      
      setReportStatus(statusData)

    } catch (err) {
      console.error('Error loading report:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Navigate back based on user role
  const goBack = () => {
    const role = userProfile?.role
    if (role === 'chief_inspector') {
      navigate('/chief')
    } else if (role === 'admin' || role === 'super_admin') {
      navigate('/admin')
    } else if (role === 'inspector') {
      navigate('/inspector')
    } else {
      navigate('/dashboard')
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      draft: { bg: '#6c757d', text: 'Draft' },
      submitted: { bg: '#ffc107', text: 'Submitted' },
      approved: { bg: '#28a745', text: 'Approved' },
      revision_requested: { bg: '#dc3545', text: 'Revision Requested' }
    }
    const s = styles[status] || styles.draft
    return (
      <span style={{ 
        backgroundColor: s.bg, 
        color: status === 'submitted' ? '#000' : '#fff',
        padding: '4px 12px', 
        borderRadius: '12px', 
        fontSize: '12px',
        fontWeight: 'bold'
      }}>
        {s.text}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <h2>Loading Report...</h2>
        <p style={{ color: '#666' }}>Report ID: {reportId}</p>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <h2>Error Loading Report</h2>
        <p style={{ color: '#dc3545' }}>{error || 'Report not found'}</p>
        <p style={{ color: '#666', fontSize: '14px' }}>Report ID: {reportId}</p>
        <button 
          onClick={goBack} 
          style={{ padding: '10px 20px', marginTop: '20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Go Back
        </button>
      </div>
    )
  }

  const activityBlocks = report.activity_blocks || []

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#1a5f2a', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>Daily Inspection Report</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>
            {report.date} | {report.inspector_name} | Spread: {report.spread || 'N/A'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {reportStatus && getStatusBadge(reportStatus.status)}
          <button 
            onClick={goBack}
            style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            ← Back
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        {/* Report Info */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#333', borderBottom: '2px solid #1a5f2a', paddingBottom: '10px' }}>
            Report Information
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666', display: 'block' }}>Date</label>
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{report.date}</span>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666', display: 'block' }}>Inspector</label>
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{report.inspector_name}</span>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666', display: 'block' }}>Spread</label>
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{report.spread || 'N/A'}</span>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666', display: 'block' }}>Pipeline</label>
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{report.pipeline || 'N/A'}</span>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666', display: 'block' }}>Contractor</label>
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{report.contractor || 'N/A'}</span>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666', display: 'block' }}>Start/Stop Time</label>
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{report.start_time || 'N/A'} - {report.stop_time || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Weather */}
        {report.weather && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#333', borderBottom: '2px solid #17a2b8', paddingBottom: '10px' }}>
              🌤️ Weather Conditions
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#666', display: 'block' }}>Conditions</label>
                <span style={{ fontSize: '14px' }}>{report.weather}</span>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666', display: 'block' }}>Temperature</label>
                <span style={{ fontSize: '14px' }}>{report.temp_high || 'N/A'}°C / {report.temp_low || 'N/A'}°C</span>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666', display: 'block' }}>Precipitation</label>
                <span style={{ fontSize: '14px' }}>{report.precipitation || '0'} mm</span>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666', display: 'block' }}>Wind</label>
                <span style={{ fontSize: '14px' }}>{report.wind_speed || 'N/A'} km/h</span>
              </div>
            </div>
          </div>
        )}

        {/* Activity Blocks */}
        {activityBlocks.length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#333', borderBottom: '2px solid #28a745', paddingBottom: '10px' }}>
              📋 Activities ({activityBlocks.length})
            </h2>
            {activityBlocks.map((block, idx) => (
              <div key={idx} style={{ border: '1px solid #dee2e6', borderRadius: '8px', marginBottom: '15px', overflow: 'hidden' }}>
                {/* Activity Header */}
                <div style={{ backgroundColor: '#e9ecef', padding: '12px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#1a5f2a' }}>{block.activityType || 'Activity'}</span>
                    <span style={{ marginLeft: '15px', color: '#666', fontSize: '14px' }}>{block.contractor || ''}</span>
                  </div>
                  {block.metres && (
                    <span style={{ backgroundColor: '#28a745', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '12px' }}>
                      {block.metres} m
                    </span>
                  )}
                </div>
                
                {/* Activity Details */}
                <div style={{ padding: '15px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                    {block.startKP && (
                      <div>
                        <label style={{ fontSize: '11px', color: '#666' }}>Start KP</label>
                        <div style={{ fontFamily: 'monospace', color: '#28a745' }}>{block.startKP}</div>
                      </div>
                    )}
                    {block.endKP && (
                      <div>
                        <label style={{ fontSize: '11px', color: '#666' }}>End KP</label>
                        <div style={{ fontFamily: 'monospace', color: '#28a745' }}>{block.endKP}</div>
                      </div>
                    )}
                    {block.foreman && (
                      <div>
                        <label style={{ fontSize: '11px', color: '#666' }}>Foreman</label>
                        <div>{block.foreman}</div>
                      </div>
                    )}
                  </div>

                  {/* Labour */}
                  {block.labour && block.labour.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <h4 style={{ fontSize: '13px', color: '#666', margin: '0 0 8px 0' }}>Labour ({block.labour.length})</h4>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Name</th>
                            <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Classification</th>
                            <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>RT</th>
                            <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>OT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {block.labour.map((l, i) => (
                            <tr key={i}>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>{l.name || l.count + ' workers'}</td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>{l.classification}</td>
                              <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{l.rt || 0}</td>
                              <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{l.ot || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Equipment */}
                  {block.equipment && block.equipment.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <h4 style={{ fontSize: '13px', color: '#666', margin: '0 0 8px 0' }}>Equipment ({block.equipment.length})</h4>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Unit ID</th>
                            <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Type</th>
                            <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {block.equipment.map((e, i) => (
                            <tr key={i}>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>{e.unitId || e.unit_id}</td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>{e.type || e.equipment_type}</td>
                              <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{e.hours || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Quality Checks */}
                  {block.qualityChecks && Object.keys(block.qualityChecks).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '4px' }}>
                      <h4 style={{ fontSize: '13px', color: '#666', margin: '0 0 8px 0' }}>Quality Checks</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', fontSize: '12px' }}>
                        {Object.entries(block.qualityChecks).map(([key, value]) => (
                          <div key={key}>
                            <span style={{ color: '#666' }}>{key.replace(/_/g, ' ')}: </span>
                            <span style={{ fontWeight: value === 'Pass' || value === 'Yes' || value === true ? 'bold' : 'normal', color: value === 'Pass' || value === 'Yes' || value === true ? '#28a745' : '#333' }}>
                              {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value || 'N/A'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* General Comments */}
        {report.general_comments && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#333', borderBottom: '2px solid #6c757d', paddingBottom: '10px' }}>
              💬 General Comments
            </h2>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{report.general_comments}</p>
          </div>
        )}

        {/* Safety Notes */}
        {report.safety_notes && (
          <div style={{ backgroundColor: '#fff3cd', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #ffc107' }}>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#856404', borderBottom: '2px solid #ffc107', paddingBottom: '10px' }}>
              ⚠️ Safety Notes
            </h2>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#856404' }}>{report.safety_notes}</p>
          </div>
        )}

        {/* Review Notes (if rejected) */}
        {reportStatus?.revision_notes && (
          <div style={{ backgroundColor: '#f8d7da', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #dc3545' }}>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#721c24', borderBottom: '2px solid #dc3545', paddingBottom: '10px' }}>
              📝 Revision Notes from Chief Inspector
            </h2>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#721c24' }}>{reportStatus.revision_notes}</p>
            <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#721c24' }}>
              Reviewed by: {reportStatus.reviewed_by_name} on {new Date(reportStatus.reviewed_at).toLocaleString()}
            </p>
          </div>
        )}

        {/* Photos */}
        {report.work_photos && report.work_photos.length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#333', borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>
              📷 Photos ({report.work_photos.length})
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
              {report.work_photos.map((photo, idx) => (
                <div key={idx} style={{ border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden' }}>
                  <img 
                    src={photo.url || photo} 
                    alt={`Photo ${idx + 1}`} 
                    style={{ width: '100%', height: '150px', objectFit: 'cover' }}
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  {photo.caption && (
                    <p style={{ padding: '8px', margin: 0, fontSize: '12px', color: '#666' }}>{photo.caption}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReportViewer
