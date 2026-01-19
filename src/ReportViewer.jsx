// ReportViewer.jsx - Comprehensive read-only view of inspector reports
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
  const [trackableItems, setTrackableItems] = useState([])
  
  // Chief Inspector review functionality
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [processing, setProcessing] = useState(false)

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
      
      // Load main report
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

      // Load trackable items for this report date
      if (reportData?.date) {
        const { data: trackables } = await supabase
          .from('trackable_items')
          .select('*')
          .eq('report_date', reportData.date)
          .order('created_at', { ascending: true })
        
        setTrackableItems(trackables || [])
      }

    } catch (err) {
      console.error('Error loading report:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

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

  // Approve report (Chief Inspector only)
  const approveReport = async () => {
    if (!confirm('Approve this report?')) return
    
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('report_status')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: userProfile?.id,
          reviewed_by_name: userProfile?.full_name || 'Chief Inspector',
          revision_notes: null
        })
        .eq('report_id', reportId)

      if (error) throw error
      
      alert('✅ Report approved successfully!')
      // Reload status
      const { data: statusData } = await supabase
        .from('report_status')
        .select('*')
        .eq('report_id', reportId)
        .single()
      setReportStatus(statusData)
    } catch (err) {
      console.error('Error approving report:', err)
      alert('Error approving report: ' + err.message)
    }
    setProcessing(false)
  }

  // Reject report (Chief Inspector only)
  const rejectReport = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection')
      return
    }
    
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('report_status')
        .update({
          status: 'revision_requested',
          reviewed_at: new Date().toISOString(),
          reviewed_by: userProfile?.id,
          reviewed_by_name: userProfile?.full_name || 'Chief Inspector',
          revision_notes: rejectionReason
        })
        .eq('report_id', reportId)

      if (error) throw error
      
      setShowRejectModal(false)
      setRejectionReason('')
      alert('📝 Revision requested. The inspector will be notified.')
      // Reload status
      const { data: statusData } = await supabase
        .from('report_status')
        .select('*')
        .eq('report_id', reportId)
        .single()
      setReportStatus(statusData)
    } catch (err) {
      console.error('Error rejecting report:', err)
      alert('Error rejecting report: ' + err.message)
    }
    setProcessing(false)
  }

  // Check if user can review (Chief Inspector or Admin)
  const canReview = userProfile?.role === 'chief_inspector' || userProfile?.role === 'admin' || userProfile?.role === 'super_admin'
  const isPending = reportStatus?.status === 'submitted'

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

  // Section card style
  const sectionStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  }

  const sectionHeaderStyle = (color = '#333') => ({
    margin: '0 0 15px 0',
    fontSize: '18px',
    color: '#333',
    borderBottom: `2px solid ${color}`,
    paddingBottom: '10px'
  })

  const labelStyle = { fontSize: '12px', color: '#666', display: 'block' }
  const valueStyle = { fontSize: '14px', fontWeight: 'bold' }

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
        <button onClick={goBack} style={{ padding: '10px 20px', marginTop: '20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
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
          
          {/* Chief Inspector Review Buttons */}
          {canReview && isPending && (
            <>
              <button 
                onClick={approveReport}
                disabled={processing}
                style={{ 
                  padding: '10px 20px', 
                  backgroundColor: '#28a745', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ✅ Approve
              </button>
              <button 
                onClick={() => setShowRejectModal(true)}
                disabled={processing}
                style={{ 
                  padding: '10px 20px', 
                  backgroundColor: '#dc3545', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ↩️ Request Revision
              </button>
            </>
          )}
          
          <button onClick={goBack} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            ← Back
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        
        {/* REPORT INFORMATION */}
        <div style={sectionStyle}>
          <h2 style={sectionHeaderStyle('#1a5f2a')}>📋 Report Information</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            <div><label style={labelStyle}>Date</label><span style={valueStyle}>{report.date}</span></div>
            <div><label style={labelStyle}>Inspector</label><span style={valueStyle}>{report.inspector_name}</span></div>
            <div><label style={labelStyle}>Spread</label><span style={valueStyle}>{report.spread || 'N/A'}</span></div>
            <div><label style={labelStyle}>Pipeline</label><span style={valueStyle}>{report.pipeline || 'N/A'}</span></div>
            <div><label style={labelStyle}>AFE #</label><span style={valueStyle}>{report.afe || 'N/A'}</span></div>
            <div><label style={labelStyle}>Start/Stop Time</label><span style={valueStyle}>{report.start_time || 'N/A'} - {report.stop_time || 'N/A'}</span></div>
            <div><label style={labelStyle}>ROW Condition</label><span style={valueStyle}>{report.row_condition || 'N/A'}</span></div>
            <div><label style={labelStyle}>Inspector Mileage</label><span style={valueStyle}>{report.inspector_mileage || 'N/A'} km</span></div>
          </div>
        </div>

        {/* WEATHER CONDITIONS */}
        {(report.weather || report.temp_high || report.temp_low) && (
          <div style={sectionStyle}>
            <h2 style={sectionHeaderStyle('#17a2b8')}>🌤️ Weather Conditions</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
              <div><label style={labelStyle}>Conditions</label><span style={valueStyle}>{report.weather || 'N/A'}</span></div>
              <div><label style={labelStyle}>High Temp</label><span style={valueStyle}>{report.temp_high || 'N/A'}°C</span></div>
              <div><label style={labelStyle}>Low Temp</label><span style={valueStyle}>{report.temp_low || 'N/A'}°C</span></div>
              <div><label style={labelStyle}>Precipitation</label><span style={valueStyle}>{report.precipitation || '0'} mm</span></div>
              <div><label style={labelStyle}>Wind Speed</label><span style={valueStyle}>{report.wind_speed || 'N/A'} km/h</span></div>
            </div>
          </div>
        )}

        {/* ACTIVITIES */}
        {activityBlocks.length > 0 && (
          <div style={sectionStyle}>
            <h2 style={sectionHeaderStyle('#28a745')}>📋 Activities ({activityBlocks.length})</h2>
            {activityBlocks.map((block, idx) => (
              <div key={idx} style={{ border: '1px solid #dee2e6', borderRadius: '8px', marginBottom: '15px', overflow: 'hidden' }}>
                {/* Activity Header */}
                <div style={{ backgroundColor: '#e9ecef', padding: '12px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#1a5f2a' }}>Activity {idx + 1}: {block.activityType || 'N/A'}</span>
                    <span style={{ marginLeft: '15px', color: '#666', fontSize: '14px' }}>{block.contractor || ''} {block.foreman ? `/ ${block.foreman}` : ''}</span>
                  </div>
                  {(block.metersToday || block.metersPrevious) && (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ backgroundColor: '#28a745', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', marginRight: '8px' }}>
                        {block.metersToday || 0}m Today
                      </span>
                      {block.metersPrevious && (
                        <span style={{ backgroundColor: '#6c757d', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '12px' }}>
                          {block.metersPrevious}m Previous
                        </span>
                      )}
                    </div>
                  )}
                </div>
                
                <div style={{ padding: '15px' }}>
                  {/* Chainage */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                    {block.startKP && <div><label style={labelStyle}>Start KP</label><div style={{ fontFamily: 'monospace', color: '#28a745', fontWeight: 'bold' }}>{block.startKP}</div></div>}
                    {block.endKP && <div><label style={labelStyle}>End KP</label><div style={{ fontFamily: 'monospace', color: '#28a745', fontWeight: 'bold' }}>{block.endKP}</div></div>}
                    {block.ticketNumber && <div><label style={labelStyle}>Ticket #</label><div style={{ fontWeight: 'bold' }}>{block.ticketNumber}</div></div>}
                  </div>

                  {/* Work Description */}
                  {block.workDescription && (
                    <div style={{ backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '4px', marginBottom: '10px' }}>
                      <label style={{ ...labelStyle, marginBottom: '5px' }}>Work Description</label>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{block.workDescription}</p>
                    </div>
                  )}

                  {/* Chainage Overlap/Gap Reasons */}
                  {block.chainageOverlapReason && (
                    <div style={{ backgroundColor: '#fff3cd', padding: '10px', borderRadius: '4px', marginBottom: '10px', border: '1px solid #ffc107' }}>
                      <label style={{ ...labelStyle, color: '#856404' }}>⚠️ Chainage Overlap Reason</label>
                      <p style={{ margin: '5px 0 0 0', color: '#856404' }}>{block.chainageOverlapReason}</p>
                    </div>
                  )}
                  {block.chainageGapReason && (
                    <div style={{ backgroundColor: '#d4edda', padding: '10px', borderRadius: '4px', marginBottom: '10px', border: '1px solid #28a745' }}>
                      <label style={{ ...labelStyle, color: '#155724' }}>📍 Chainage Gap Reason</label>
                      <p style={{ margin: '5px 0 0 0', color: '#155724' }}>{block.chainageGapReason}</p>
                    </div>
                  )}

                  {/* Time Lost */}
                  {block.timeLostReason && block.timeLostReason !== 'None' && (
                    <div style={{ backgroundColor: '#f8d7da', padding: '10px', borderRadius: '4px', marginBottom: '10px', border: '1px solid #dc3545' }}>
                      <label style={{ ...labelStyle, color: '#721c24' }}>⏱️ Time Lost</label>
                      <p style={{ margin: '5px 0 0 0', color: '#721c24' }}>
                        <strong>{block.timeLostReason}</strong> - {block.timeLostHours || 0} hours
                        {block.timeLostDetails && <><br/>{block.timeLostDetails}</>}
                      </p>
                    </div>
                  )}

                  {/* Labour Entries */}
                  {block.labourEntries && block.labourEntries.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <h4 style={{ fontSize: '13px', color: '#666', margin: '0 0 8px 0' }}>👷 Manpower ({block.labourEntries.length})</h4>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Name</th>
                            <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Classification</th>
                            <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Count</th>
                            <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>RT</th>
                            <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>OT</th>
                            <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>JH</th>
                          </tr>
                        </thead>
                        <tbody>
                          {block.labourEntries.map((l, i) => (
                            <tr key={i}>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>{l.employeeName || l.name || '-'}</td>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>{l.classification}</td>
                              <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{l.count || 1}</td>
                              <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{l.rt || 0}</td>
                              <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{l.ot || 0}</td>
                              <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{l.jh || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Equipment Entries */}
                  {block.equipmentEntries && block.equipmentEntries.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <h4 style={{ fontSize: '13px', color: '#666', margin: '0 0 8px 0' }}>🚜 Equipment ({block.equipmentEntries.length})</h4>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Type</th>
                            <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Count</th>
                            <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {block.equipmentEntries.map((e, i) => (
                            <tr key={i}>
                              <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>{e.type}</td>
                              <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{e.count || 1}</td>
                              <td style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{e.hours || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Quality Data */}
                  {block.qualityData && Object.keys(block.qualityData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#fff3cd', padding: '10px', borderRadius: '4px' }}>
                      <h4 style={{ fontSize: '13px', color: '#856404', margin: '0 0 8px 0' }}>⚙️ Quality Checks</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', fontSize: '12px' }}>
                        {Object.entries(block.qualityData).map(([key, value]) => (
                          value && (
                            <div key={key}>
                              <span style={{ color: '#666' }}>{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}: </span>
                              <span style={{ fontWeight: 'bold' }}>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Specialized Data - Ditch */}
                  {block.ditchData && Object.keys(block.ditchData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#e7f3ff', padding: '10px', borderRadius: '4px' }}>
                      <h4 style={{ fontSize: '13px', color: '#004085', margin: '0 0 8px 0' }}>🚜 Ditch Log Data</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', fontSize: '12px' }}>
                        {block.ditchData.specifiedDepth && <div><span style={{ color: '#666' }}>Spec Depth: </span><strong>{block.ditchData.specifiedDepth}m</strong></div>}
                        {block.ditchData.actualDepth && <div><span style={{ color: '#666' }}>Actual Depth: </span><strong>{block.ditchData.actualDepth}m</strong></div>}
                        {block.ditchData.specifiedWidth && <div><span style={{ color: '#666' }}>Spec Width: </span><strong>{block.ditchData.specifiedWidth}m</strong></div>}
                        {block.ditchData.actualWidth && <div><span style={{ color: '#666' }}>Actual Width: </span><strong>{block.ditchData.actualWidth}m</strong></div>}
                        {block.ditchData.minimumDepthMet && <div><span style={{ color: '#666' }}>Min Depth Met: </span><strong style={{ color: block.ditchData.minimumDepthMet === 'Yes' ? '#28a745' : '#dc3545' }}>{block.ditchData.minimumDepthMet}</strong></div>}
                        {block.ditchData.soilConditions && <div><span style={{ color: '#666' }}>Soil: </span><strong>{block.ditchData.soilConditions}</strong></div>}
                        {block.ditchData.groundwaterEncountered && <div><span style={{ color: '#666' }}>Groundwater: </span><strong>{block.ditchData.groundwaterEncountered}</strong></div>}
                      </div>
                      {block.ditchData.comments && <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}><em>{block.ditchData.comments}</em></p>}
                    </div>
                  )}

                  {/* Specialized Data - Welding */}
                  {block.weldData && (
                    <div style={{ marginTop: '10px', backgroundColor: '#fce4ec', padding: '10px', borderRadius: '4px' }}>
                      <h4 style={{ fontSize: '13px', color: '#880e4f', margin: '0 0 8px 0' }}>🔥 Weld Data</h4>
                      <pre style={{ margin: 0, fontSize: '11px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(block.weldData, null, 2)}</pre>
                    </div>
                  )}

                  {/* Specialized Data - Coating */}
                  {block.coatingData && Object.keys(block.coatingData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#e8f5e9', padding: '10px', borderRadius: '4px' }}>
                      <h4 style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 8px 0' }}>🎨 Coating Data</h4>
                      <pre style={{ margin: 0, fontSize: '11px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(block.coatingData, null, 2)}</pre>
                    </div>
                  )}

                  {/* Specialized Data - Bending */}
                  {block.bendingData && Object.keys(block.bendingData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#fff8e1', padding: '10px', borderRadius: '4px' }}>
                      <h4 style={{ fontSize: '13px', color: '#f57f17', margin: '0 0 8px 0' }}>↩️ Bending Data</h4>
                      <pre style={{ margin: 0, fontSize: '11px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(block.bendingData, null, 2)}</pre>
                    </div>
                  )}

                  {/* Specialized Data - Stringing */}
                  {block.stringingData && Object.keys(block.stringingData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#e3f2fd', padding: '10px', borderRadius: '4px' }}>
                      <h4 style={{ fontSize: '13px', color: '#1565c0', margin: '0 0 8px 0' }}>📏 Stringing Data</h4>
                      <pre style={{ margin: 0, fontSize: '11px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(block.stringingData, null, 2)}</pre>
                    </div>
                  )}

                  {/* Specialized Data - Clearing */}
                  {block.clearingData && Object.keys(block.clearingData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#f1f8e9', padding: '10px', borderRadius: '4px' }}>
                      <h4 style={{ fontSize: '13px', color: '#558b2f', margin: '0 0 8px 0' }}>🌲 Clearing Data</h4>
                      <pre style={{ margin: 0, fontSize: '11px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(block.clearingData, null, 2)}</pre>
                    </div>
                  )}

                  {/* Other Specialized Data */}
                  {block.hddData && Object.keys(block.hddData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#ede7f6', padding: '10px', borderRadius: '4px' }}>
                      <h4 style={{ fontSize: '13px', color: '#512da8', margin: '0 0 8px 0' }}>🔄 HDD Data</h4>
                      <pre style={{ margin: 0, fontSize: '11px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(block.hddData, null, 2)}</pre>
                    </div>
                  )}

                  {block.hydrotestData && Object.keys(block.hydrotestData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#e0f7fa', padding: '10px', borderRadius: '4px' }}>
                      <h4 style={{ fontSize: '13px', color: '#00838f', margin: '0 0 8px 0' }}>💧 Hydrotest Data</h4>
                      <pre style={{ margin: 0, fontSize: '11px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(block.hydrotestData, null, 2)}</pre>
                    </div>
                  )}

                  {block.gradingData && Object.keys(block.gradingData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#efebe9', padding: '10px', borderRadius: '4px' }}>
                      <h4 style={{ fontSize: '13px', color: '#5d4037', margin: '0 0 8px 0' }}>🚧 Grading Data</h4>
                      <pre style={{ margin: 0, fontSize: '11px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(block.gradingData, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TRACKABLE ITEMS */}
        {trackableItems.length > 0 && (
          <div style={sectionStyle}>
            <h2 style={sectionHeaderStyle('#6f42c1')}>📦 Trackable Items ({trackableItems.length})</h2>
            <div style={{ display: 'grid', gap: '10px' }}>
              {trackableItems.map((item, idx) => (
                <div key={idx} style={{ backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 'bold', color: '#6f42c1' }}>{item.item_type}</span>
                    <span style={{ fontSize: '12px', color: '#666' }}>{item.action}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '12px' }}>
                    {item.quantity && <div><span style={{ color: '#666' }}>Qty: </span><strong>{item.quantity}</strong></div>}
                    {item.from_kp && <div><span style={{ color: '#666' }}>From: </span><strong>{item.from_kp}</strong></div>}
                    {item.to_kp && <div><span style={{ color: '#666' }}>To: </span><strong>{item.to_kp}</strong></div>}
                    {item.kp_location && <div><span style={{ color: '#666' }}>KP: </span><strong>{item.kp_location}</strong></div>}
                  </div>
                  {item.notes && <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>{item.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SAFETY NOTES */}
        {report.safety_notes && (
          <div style={{ ...sectionStyle, backgroundColor: '#fff3cd', border: '1px solid #ffc107' }}>
            <h2 style={sectionHeaderStyle('#ffc107')}>⚠️ Safety Notes</h2>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#856404' }}>{report.safety_notes}</p>
          </div>
        )}

        {/* SAFETY RECOGNITION */}
        {report.safety_recognition_data?.enabled && report.safety_recognition_data?.cards?.length > 0 && (
          <div style={{ ...sectionStyle, backgroundColor: '#d4edda', border: '1px solid #28a745' }}>
            <h2 style={sectionHeaderStyle('#28a745')}>🏆 Safety Recognition</h2>
            {report.safety_recognition_data.cards.map((card, idx) => (
              <div key={idx} style={{ backgroundColor: 'white', padding: '12px', borderRadius: '4px', marginBottom: '10px' }}>
                <strong>{card.employeeName}</strong> ({card.company}) - {card.category}
                <p style={{ margin: '5px 0 0 0', fontSize: '13px' }}>{card.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* WILDLIFE SIGHTINGS */}
        {report.wildlife_sighting_data?.enabled && report.wildlife_sighting_data?.sightings?.length > 0 && (
          <div style={{ ...sectionStyle, backgroundColor: '#e8f5e9', border: '1px solid #4caf50' }}>
            <h2 style={sectionHeaderStyle('#4caf50')}>🦌 Wildlife Sightings</h2>
            {report.wildlife_sighting_data.sightings.map((sighting, idx) => (
              <div key={idx} style={{ backgroundColor: 'white', padding: '12px', borderRadius: '4px', marginBottom: '10px' }}>
                <strong>{sighting.species}</strong> - {sighting.count} observed at KP {sighting.kp}
                {sighting.notes && <p style={{ margin: '5px 0 0 0', fontSize: '13px' }}>{sighting.notes}</p>}
              </div>
            ))}
          </div>
        )}

        {/* LAND & ENVIRONMENT */}
        {report.land_environment && (
          <div style={sectionStyle}>
            <h2 style={sectionHeaderStyle('#795548')}>🌍 Land & Environment</h2>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{report.land_environment}</p>
          </div>
        )}

        {/* VISITORS */}
        {report.visitors && report.visitors.length > 0 && (
          <div style={sectionStyle}>
            <h2 style={sectionHeaderStyle('#9c27b0')}>👥 Visitors ({report.visitors.length})</h2>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Name</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Company</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Position</th>
                </tr>
              </thead>
              <tbody>
                {report.visitors.map((v, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{v.name}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{v.company || '-'}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{v.position || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* UNIT PRICE ITEMS */}
        {report.unit_price_items_enabled && report.unit_price_data?.items?.length > 0 && (
          <div style={sectionStyle}>
            <h2 style={sectionHeaderStyle('#ff9800')}>💰 Unit Price Items</h2>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Item</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Description</th>
                  <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Quantity</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Unit</th>
                </tr>
              </thead>
              <tbody>
                {report.unit_price_data.items.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{item.itemCode || item.item}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{item.description}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>{item.quantity}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.unit_price_data.comments && (
              <p style={{ margin: '10px 0 0 0', fontSize: '13px', color: '#666' }}>
                <strong>Comments:</strong> {report.unit_price_data.comments}
              </p>
            )}
          </div>
        )}

        {/* GENERAL COMMENTS */}
        {report.general_comments && (
          <div style={sectionStyle}>
            <h2 style={sectionHeaderStyle('#6c757d')}>💬 General Comments</h2>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{report.general_comments}</p>
          </div>
        )}

        {/* REVISION NOTES */}
        {reportStatus?.revision_notes && (
          <div style={{ ...sectionStyle, backgroundColor: '#f8d7da', border: '1px solid #dc3545' }}>
            <h2 style={sectionHeaderStyle('#dc3545')}>📝 Revision Notes from Chief Inspector</h2>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#721c24' }}>{reportStatus.revision_notes}</p>
            <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#721c24' }}>
              Reviewed by: {reportStatus.reviewed_by_name} on {new Date(reportStatus.reviewed_at).toLocaleString()}
            </p>
          </div>
        )}

        {/* PHOTOS */}
        {report.work_photos && report.work_photos.length > 0 && (
          <div style={sectionStyle}>
            <h2 style={sectionHeaderStyle('#007bff')}>📷 Photos ({report.work_photos.length})</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
              {report.work_photos.map((photo, idx) => (
                <div key={idx} style={{ border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden' }}>
                  <img 
                    src={photo.url || photo} 
                    alt={`Photo ${idx + 1}`} 
                    style={{ width: '100%', height: '150px', objectFit: 'cover' }}
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  {photo.caption && <p style={{ padding: '8px', margin: 0, fontSize: '12px', color: '#666' }}>{photo.caption}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '20px', color: '#666', fontSize: '12px' }}>
          Report ID: {reportId} | Generated: {new Date().toLocaleString()}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
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
          zIndex: 1000 
        }}>
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '8px', 
            padding: '30px', 
            maxWidth: '500px', 
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#dc3545' }}>↩️ Request Revision</h2>
            <p style={{ color: '#666', marginBottom: '15px' }}>
              Report from <strong>{report?.inspector_name}</strong> on <strong>{report?.date}</strong>
            </p>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
              Reason for revision request:
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain what needs to be corrected..."
              style={{ 
                width: '100%', 
                height: '120px', 
                padding: '12px', 
                border: '1px solid #ced4da', 
                borderRadius: '4px', 
                fontSize: '14px', 
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectionReason('')
                }}
                style={{ 
                  padding: '12px 24px', 
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
                onClick={rejectReport}
                disabled={processing || !rejectionReason.trim()}
                style={{ 
                  padding: '12px 24px', 
                  backgroundColor: '#dc3545', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: processing || !rejectionReason.trim() ? 'not-allowed' : 'pointer', 
                  fontWeight: 'bold',
                  opacity: processing || !rejectionReason.trim() ? 0.6 : 1
                }}
              >
                {processing ? 'Sending...' : 'Send Back for Revision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportViewer
