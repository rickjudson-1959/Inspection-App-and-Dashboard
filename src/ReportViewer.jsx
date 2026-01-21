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

                  {/* Specialized Data - Ditch Inspection */}
                  {block.ditchData && Object.keys(block.ditchData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#e7f3ff', padding: '12px', borderRadius: '6px', border: '1px solid #b8daff' }}>
                      <h4 style={{ fontSize: '14px', color: '#004085', margin: '0 0 12px 0', borderBottom: '2px solid #6f42c1', paddingBottom: '8px' }}>Ditch Inspection Data</h4>

                      {/* Trench Specifications */}
                      <div style={{ marginBottom: '12px' }}>
                        <h5 style={{ fontSize: '12px', color: '#495057', margin: '0 0 8px 0' }}>Trench Specifications</h5>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '12px' }}>
                          {block.ditchData.trenchWidth && <div><span style={{ color: '#666' }}>Trench Width: </span><strong>{block.ditchData.trenchWidth}m</strong></div>}
                          {block.ditchData.trenchDepth && <div><span style={{ color: '#666' }}>Trench Depth: </span><strong>{block.ditchData.trenchDepth}m</strong></div>}
                          {block.ditchData.depthOfCoverRequired && <div><span style={{ color: '#666' }}>Cover Required: </span><strong>{block.ditchData.depthOfCoverRequired}m</strong></div>}
                          {block.ditchData.depthOfCoverActual && <div><span style={{ color: '#666' }}>Cover Actual: </span><strong>{block.ditchData.depthOfCoverActual}m</strong></div>}
                          {/* Legacy fields for older reports */}
                          {block.ditchData.specifiedDepth && <div><span style={{ color: '#666' }}>Spec Depth: </span><strong>{block.ditchData.specifiedDepth}m</strong></div>}
                          {block.ditchData.actualDepth && <div><span style={{ color: '#666' }}>Actual Depth: </span><strong>{block.ditchData.actualDepth}m</strong></div>}
                          {block.ditchData.specifiedWidth && <div><span style={{ color: '#666' }}>Spec Width: </span><strong>{block.ditchData.specifiedWidth}m</strong></div>}
                          {block.ditchData.actualWidth && <div><span style={{ color: '#666' }}>Actual Width: </span><strong>{block.ditchData.actualWidth}m</strong></div>}
                        </div>
                      </div>

                      {/* Pay Items (UPIs) */}
                      {block.ditchData.paddingBedding && (
                        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
                          <h5 style={{ fontSize: '12px', color: '#856404', margin: '0 0 8px 0' }}>Pay Items (UPIs)</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12px' }}>
                            <div style={{ padding: '8px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                              <strong>Padding/Bedding:</strong>
                              {(block.ditchData.paddingBeddingFromKP || block.ditchData.paddingBeddingToKP) && (
                                <span style={{ color: '#666' }}> {block.ditchData.paddingBeddingFromKP || '?'} to {block.ditchData.paddingBeddingToKP || '?'}</span>
                              )}
                              <span style={{ marginLeft: '8px' }}>{block.ditchData.paddingBeddingMeters || 0}m</span>
                              {block.ditchData.paddingMaterial && <span style={{ color: '#666' }}> ({block.ditchData.paddingMaterial})</span>}
                              <span style={{ marginLeft: '8px', color: block.ditchData.paddingBeddingVerified ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
                                {block.ditchData.paddingBeddingVerified ? 'VERIFIED' : 'Not Verified'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* BOT Checklist */}
                      {block.ditchData.botChecklist && (
                        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#e7f3ff', borderRadius: '4px' }}>
                          <h5 style={{ fontSize: '12px', color: '#004085', margin: '0 0 8px 0' }}>BOT (Bottom of Trench) Checklist</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px', fontSize: '12px' }}>
                            {block.ditchData.botChecklist.freeOfRocks !== null && block.ditchData.botChecklist.freeOfRocks !== undefined && (
                              <div><span style={{ color: '#666' }}>Free of Rocks: </span><strong style={{ color: block.ditchData.botChecklist.freeOfRocks ? '#28a745' : '#dc3545' }}>{block.ditchData.botChecklist.freeOfRocks ? 'Yes' : 'No'}</strong></div>
                            )}
                            {block.ditchData.botChecklist.freeOfDebris !== null && block.ditchData.botChecklist.freeOfDebris !== undefined && (
                              <div><span style={{ color: '#666' }}>Free of Debris: </span><strong style={{ color: block.ditchData.botChecklist.freeOfDebris ? '#28a745' : '#dc3545' }}>{block.ditchData.botChecklist.freeOfDebris ? 'Yes' : 'No'}</strong></div>
                            )}
                            {block.ditchData.botChecklist.siltFencesIntact !== null && block.ditchData.botChecklist.siltFencesIntact !== undefined && (
                              <div><span style={{ color: '#666' }}>Silt Fences Intact: </span><strong style={{ color: block.ditchData.botChecklist.siltFencesIntact ? '#28a745' : '#dc3545' }}>{block.ditchData.botChecklist.siltFencesIntact ? 'Yes' : 'No'}</strong></div>
                            )}
                            {block.ditchData.botChecklist.wildlifeRamps !== null && block.ditchData.botChecklist.wildlifeRamps !== undefined && (
                              <div><span style={{ color: '#666' }}>Wildlife Ramps: </span><strong style={{ color: block.ditchData.botChecklist.wildlifeRamps ? '#28a745' : '#dc3545' }}>{block.ditchData.botChecklist.wildlifeRamps ? 'Yes' : 'No'}</strong></div>
                            )}
                            {block.ditchData.botChecklist.wildlifeGaps !== null && block.ditchData.botChecklist.wildlifeGaps !== undefined && (
                              <div><span style={{ color: '#666' }}>Wildlife Gaps: </span><strong style={{ color: block.ditchData.botChecklist.wildlifeGaps ? '#28a745' : '#dc3545' }}>{block.ditchData.botChecklist.wildlifeGaps ? 'Yes' : 'No'}</strong></div>
                            )}
                            {block.ditchData.botChecklist.gradeAcceptable !== null && block.ditchData.botChecklist.gradeAcceptable !== undefined && (
                              <div><span style={{ color: '#666' }}>Grade Acceptable: </span><strong style={{ color: block.ditchData.botChecklist.gradeAcceptable ? '#28a745' : '#dc3545' }}>{block.ditchData.botChecklist.gradeAcceptable ? 'Yes' : 'No'}</strong></div>
                            )}
                          </div>
                          {block.ditchData.botChecklist.issues && (
                            <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f8d7da', borderRadius: '4px' }}>
                              <strong style={{ color: '#721c24' }}>BOT Issues:</strong> <span style={{ color: '#721c24' }}>{block.ditchData.botChecklist.issues}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Water Management */}
                      {block.ditchData.waterManagement && (block.ditchData.waterManagement.pumpingActivity || block.ditchData.waterManagement.filterBagUsage) && (
                        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#d4edda', borderRadius: '4px' }}>
                          <h5 style={{ fontSize: '12px', color: '#155724', margin: '0 0 8px 0' }}>Water Management</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', fontSize: '12px' }}>
                            {block.ditchData.waterManagement.pumpingActivity && (
                              <>
                                <div><span style={{ color: '#666' }}>Pumping: </span><strong>Yes</strong></div>
                                {block.ditchData.waterManagement.pumpingEquipment && <div><span style={{ color: '#666' }}>Equipment: </span><strong>{block.ditchData.waterManagement.pumpingEquipment}</strong></div>}
                                {block.ditchData.waterManagement.pumpingHours && <div><span style={{ color: '#666' }}>Hours: </span><strong>{block.ditchData.waterManagement.pumpingHours}</strong></div>}
                              </>
                            )}
                            {block.ditchData.waterManagement.filterBagUsage && (
                              <>
                                <div><span style={{ color: '#666' }}>Filter Bags: </span><strong>Yes</strong></div>
                                {block.ditchData.waterManagement.filterBagCount && <div><span style={{ color: '#666' }}>Count: </span><strong>{block.ditchData.waterManagement.filterBagCount}</strong></div>}
                                {block.ditchData.waterManagement.dischargeLocation && <div><span style={{ color: '#666' }}>Discharge: </span><strong>{block.ditchData.waterManagement.dischargeLocation}</strong></div>}
                                {block.ditchData.waterManagement.dischargePermitNumber && <div><span style={{ color: '#666' }}>Permit #: </span><strong>{block.ditchData.waterManagement.dischargePermitNumber}</strong></div>}
                              </>
                            )}
                          </div>
                          {block.ditchData.waterManagement.notes && <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#155724' }}><em>{block.ditchData.waterManagement.notes}</em></p>}
                        </div>
                      )}

                      {/* Soil Conditions */}
                      <div style={{ marginBottom: '12px' }}>
                        <h5 style={{ fontSize: '12px', color: '#495057', margin: '0 0 8px 0' }}>Soil Conditions</h5>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', fontSize: '12px' }}>
                          {block.ditchData.soilConditions && <div><span style={{ color: '#666' }}>Soil: </span><strong>{block.ditchData.soilConditions}</strong></div>}
                          {block.ditchData.groundwaterEncountered && <div><span style={{ color: '#666' }}>Groundwater: </span><strong>{block.ditchData.groundwaterEncountered}</strong></div>}
                          {block.ditchData.groundwaterDepth && <div><span style={{ color: '#666' }}>GW Depth: </span><strong>{block.ditchData.groundwaterDepth}m</strong></div>}
                          {block.ditchData.dewateringRequired && <div><span style={{ color: '#666' }}>Dewatering: </span><strong>{block.ditchData.dewateringRequired}</strong></div>}
                        </div>
                      </div>

                      {/* Depth Compliance */}
                      {block.ditchData.minimumDepthMet && (
                        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: block.ditchData.minimumDepthMet === 'Yes' ? '#d4edda' : '#f8d7da', borderRadius: '4px', border: `2px solid ${block.ditchData.minimumDepthMet === 'Yes' ? '#28a745' : '#dc3545'}` }}>
                          <h5 style={{ fontSize: '12px', color: block.ditchData.minimumDepthMet === 'Yes' ? '#155724' : '#721c24', margin: '0 0 8px 0' }}>Depth Compliance</h5>
                          <div><span style={{ color: '#666' }}>Minimum Depth Met: </span><strong style={{ color: block.ditchData.minimumDepthMet === 'Yes' ? '#28a745' : '#dc3545' }}>{block.ditchData.minimumDepthMet}</strong></div>
                          {block.ditchData.minimumDepthMet === 'No' && (
                            <div style={{ marginTop: '8px', fontSize: '12px' }}>
                              {block.ditchData.depthNotMetReason && <div><span style={{ color: '#666' }}>Reason: </span><strong>{block.ditchData.depthNotMetReason}</strong></div>}
                              {block.ditchData.depthNotMetSignoff && <div><span style={{ color: '#666' }}>Signoff: </span><strong>{block.ditchData.depthNotMetSignoff}</strong> ({block.ditchData.depthNotMetSignoffRole || 'N/A'})</div>}
                              {block.ditchData.depthNotMetDate && <div><span style={{ color: '#666' }}>Date: </span><strong>{block.ditchData.depthNotMetDate}</strong></div>}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Comments */}
                      {block.ditchData.comments && (
                        <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                          <h5 style={{ fontSize: '12px', color: '#495057', margin: '0 0 6px 0' }}>Comments</h5>
                          <p style={{ margin: 0, fontSize: '12px' }}>{block.ditchData.comments}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Specialized Data - Welding */}
                  {block.weldData && (
                    <div style={{ marginTop: '10px', backgroundColor: '#fce4ec', padding: '12px', borderRadius: '6px', border: '1px solid #e91e63' }}>
                      <h4 style={{ fontSize: '14px', color: '#880e4f', margin: '0 0 12px 0', borderBottom: '2px solid #880e4f', paddingBottom: '8px' }}>🔥 Weld Data</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '12px', marginBottom: '12px' }}>
                        {block.weldData.crewType && <div><span style={{ color: '#666' }}>Crew Type: </span><strong>{block.weldData.crewType}</strong></div>}
                        {block.weldData.weldMethod && <div><span style={{ color: '#666' }}>Weld Method: </span><strong>{block.weldData.weldMethod}</strong></div>}
                        {block.weldData.weldsToday !== undefined && <div><span style={{ color: '#666' }}>Welds Today: </span><strong>{block.weldData.weldsToday}</strong></div>}
                        {block.weldData.totalWelds !== undefined && <div><span style={{ color: '#666' }}>Total Welds: </span><strong>{block.weldData.totalWelds}</strong></div>}
                        {block.weldData.visualsFrom && <div><span style={{ color: '#666' }}>Visuals From: </span><strong>{block.weldData.visualsFrom}</strong></div>}
                        {block.weldData.visualsTo && <div><span style={{ color: '#666' }}>Visuals To: </span><strong>{block.weldData.visualsTo}</strong></div>}
                        {block.weldData.startTime && <div><span style={{ color: '#666' }}>Start Time: </span><strong>{block.weldData.startTime}</strong></div>}
                        {block.weldData.endTime && <div><span style={{ color: '#666' }}>End Time: </span><strong>{block.weldData.endTime}</strong></div>}
                      </div>
                      {block.weldData.weldEntries && block.weldData.weldEntries.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <h5 style={{ fontSize: '12px', color: '#880e4f', margin: '0 0 8px 0' }}>Weld Entries ({block.weldData.weldEntries.length})</h5>
                          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                            <thead><tr style={{ backgroundColor: '#e91e63', color: 'white' }}>
                              <th style={{ padding: '6px', textAlign: 'left' }}>Weld #</th>
                              <th style={{ padding: '6px' }}>Preheat</th>
                              <th style={{ padding: '6px' }}>Pass</th>
                              <th style={{ padding: '6px' }}>Volts</th>
                              <th style={{ padding: '6px' }}>Amps</th>
                              <th style={{ padding: '6px' }}>WPS OK</th>
                            </tr></thead>
                            <tbody>
                              {block.weldData.weldEntries.slice(0, 10).map((w, i) => (
                                <tr key={i} style={{ backgroundColor: i % 2 ? '#fff' : '#fce4ec' }}>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>{w.weldNumber || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{w.preheat || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{w.pass || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{w.voltage || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{w.amperage || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd', color: w.meetsWPS ? '#28a745' : w.meetsWPS === false ? '#dc3545' : '#666' }}>{w.meetsWPS ? '✓' : w.meetsWPS === false ? '✗' : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {block.weldData.weldEntries.length > 10 && <p style={{ fontSize: '10px', color: '#666', margin: '4px 0 0 0' }}>+ {block.weldData.weldEntries.length - 10} more</p>}
                        </div>
                      )}
                      {block.weldData.repairs && block.weldData.repairs.length > 0 && (
                        <div style={{ padding: '8px', backgroundColor: '#ffebee', borderRadius: '4px' }}>
                          <h5 style={{ fontSize: '11px', color: '#c62828', margin: '0 0 4px 0' }}>⚠️ Repairs ({block.weldData.repairs.length})</h5>
                          {block.weldData.repairs.map((r, i) => <div key={i} style={{ fontSize: '10px' }}><strong>{r.weldNumber}</strong>: {r.defectCode} - {r.defectName}</div>)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Specialized Data - Coating */}
                  {block.coatingData && Object.keys(block.coatingData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#e8f5e9', padding: '12px', borderRadius: '6px', border: '1px solid #4caf50' }}>
                      <h4 style={{ fontSize: '14px', color: '#2e7d32', margin: '0 0 12px 0', borderBottom: '2px solid #2e7d32', paddingBottom: '8px' }}>🎨 Coating Data</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '12px' }}>
                        {block.coatingData.coatingType && <div><span style={{ color: '#666' }}>Coating Type: </span><strong>{block.coatingData.coatingType}</strong></div>}
                        {block.coatingData.applicator && <div><span style={{ color: '#666' }}>Applicator: </span><strong>{block.coatingData.applicator}</strong></div>}
                        {block.coatingData.temperature && <div><span style={{ color: '#666' }}>Temperature: </span><strong>{block.coatingData.temperature}°C</strong></div>}
                        {block.coatingData.humidity && <div><span style={{ color: '#666' }}>Humidity: </span><strong>{block.coatingData.humidity}%</strong></div>}
                      </div>
                      {block.coatingData.welds && block.coatingData.welds.length > 0 && (
                        <div style={{ marginTop: '10px' }}>
                          <h5 style={{ fontSize: '12px', color: '#2e7d32', margin: '0 0 8px 0' }}>Welds Coated ({block.coatingData.welds.length})</h5>
                          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                            <thead><tr style={{ backgroundColor: '#4caf50', color: 'white' }}>
                              <th style={{ padding: '6px', textAlign: 'left' }}>Weld #</th>
                              <th style={{ padding: '6px' }}>KP</th>
                              <th style={{ padding: '6px' }}>Diameter</th>
                              <th style={{ padding: '6px' }}>Wall</th>
                            </tr></thead>
                            <tbody>
                              {block.coatingData.welds.slice(0, 10).map((w, i) => (
                                <tr key={i} style={{ backgroundColor: i % 2 ? '#fff' : '#e8f5e9' }}>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>{w.weldNumber || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{w.kp || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{w.diameter || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{w.wallThickness || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Specialized Data - Bending */}
                  {block.bendingData && Object.keys(block.bendingData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#fff8e1', padding: '12px', borderRadius: '6px', border: '1px solid #ffc107' }}>
                      <h4 style={{ fontSize: '14px', color: '#f57f17', margin: '0 0 12px 0', borderBottom: '2px solid #f57f17', paddingBottom: '8px' }}>↩️ Bending Data</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '12px', marginBottom: '12px' }}>
                        {block.bendingData.bendsToday !== undefined && <div><span style={{ color: '#666' }}>Bends Today: </span><strong>{block.bendingData.bendsToday}</strong></div>}
                        {block.bendingData.bendsPrevious !== undefined && <div><span style={{ color: '#666' }}>Previous: </span><strong>{block.bendingData.bendsPrevious}</strong></div>}
                        {block.bendingData.totalBends !== undefined && <div><span style={{ color: '#666' }}>Total: </span><strong>{block.bendingData.totalBends}</strong></div>}
                      </div>
                      {block.bendingData.bendEntries && block.bendingData.bendEntries.length > 0 && (
                        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                          <thead><tr style={{ backgroundColor: '#ffc107', color: '#333' }}>
                            <th style={{ padding: '6px', textAlign: 'left' }}>Station</th>
                            <th style={{ padding: '6px' }}>Angle</th>
                            <th style={{ padding: '6px' }}>Type</th>
                            <th style={{ padding: '6px' }}>Ovality %</th>
                            <th style={{ padding: '6px' }}>Pass</th>
                          </tr></thead>
                          <tbody>
                            {block.bendingData.bendEntries.slice(0, 10).map((b, i) => (
                              <tr key={i} style={{ backgroundColor: i % 2 ? '#fff' : '#fff8e1' }}>
                                <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>{b.stationKP || '-'}</td>
                                <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{b.bendAngle || '-'}°</td>
                                <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{b.bendType || '-'}</td>
                                <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{b.ovalityPercent ? `${parseFloat(b.ovalityPercent).toFixed(2)}%` : '-'}</td>
                                <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd', color: b.ovalityPass ? '#28a745' : b.ovalityPass === false ? '#dc3545' : '#666' }}>{b.ovalityPass ? '✓' : b.ovalityPass === false ? '✗' : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* Specialized Data - Stringing */}
                  {block.stringingData && Object.keys(block.stringingData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#e3f2fd', padding: '12px', borderRadius: '6px', border: '1px solid #2196f3' }}>
                      <h4 style={{ fontSize: '14px', color: '#1565c0', margin: '0 0 12px 0', borderBottom: '2px solid #1565c0', paddingBottom: '8px' }}>📏 Stringing Data</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '12px', marginBottom: '12px' }}>
                        {block.stringingData.jointsToday !== undefined && <div><span style={{ color: '#666' }}>Joints Today: </span><strong>{block.stringingData.jointsToday}</strong></div>}
                        {block.stringingData.jointsPrevious !== undefined && <div><span style={{ color: '#666' }}>Previous: </span><strong>{block.stringingData.jointsPrevious}</strong></div>}
                        {block.stringingData.totalLengthM !== undefined && <div><span style={{ color: '#666' }}>Total Length: </span><strong>{block.stringingData.totalLengthM}m</strong></div>}
                      </div>
                      {block.stringingData.jointEntries && block.stringingData.jointEntries.length > 0 && (
                        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                          <thead><tr style={{ backgroundColor: '#2196f3', color: 'white' }}>
                            <th style={{ padding: '6px', textAlign: 'left' }}>Joint #</th>
                            <th style={{ padding: '6px' }}>Heat #</th>
                            <th style={{ padding: '6px' }}>KP</th>
                            <th style={{ padding: '6px' }}>Length</th>
                            <th style={{ padding: '6px' }}>Wall</th>
                            <th style={{ padding: '6px' }}>Visual</th>
                          </tr></thead>
                          <tbody>
                            {block.stringingData.jointEntries.filter(j => j.status === 'Strung').slice(0, 10).map((j, i) => (
                              <tr key={i} style={{ backgroundColor: i % 2 ? '#fff' : '#e3f2fd' }}>
                                <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>{j.jointNumber || '-'}</td>
                                <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{j.heatNumber || '-'}</td>
                                <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{j.stationKP || '-'}</td>
                                <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{j.lengthM || '-'}m</td>
                                <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{j.wallThickness || '-'}</td>
                                <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd', color: j.visualCheck ? '#28a745' : '#dc3545' }}>{j.visualCheck ? '✓' : '✗'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* Specialized Data - Clearing */}
                  {block.clearingData && Object.keys(block.clearingData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#f1f8e9', padding: '12px', borderRadius: '6px', border: '1px solid #8bc34a' }}>
                      <h4 style={{ fontSize: '14px', color: '#558b2f', margin: '0 0 12px 0', borderBottom: '2px solid #558b2f', paddingBottom: '8px' }}>🌲 Clearing Data</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '12px' }}>
                        {block.clearingData.clearingMethod && <div><span style={{ color: '#666' }}>Method: </span><strong>{block.clearingData.clearingMethod}</strong></div>}
                        {block.clearingData.vegetationType && <div><span style={{ color: '#666' }}>Vegetation: </span><strong>{block.clearingData.vegetationType}</strong></div>}
                        {block.clearingData.debrisDisposal && <div><span style={{ color: '#666' }}>Debris Disposal: </span><strong>{block.clearingData.debrisDisposal}</strong></div>}
                      </div>
                      {block.clearingData.timberDecks && block.clearingData.timberDecks.length > 0 && (
                        <div style={{ marginTop: '10px' }}>
                          <h5 style={{ fontSize: '12px', color: '#558b2f', margin: '0 0 8px 0' }}>Timber Decks ({block.clearingData.timberDecks.length})</h5>
                          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                            <thead><tr style={{ backgroundColor: '#8bc34a', color: 'white' }}>
                              <th style={{ padding: '6px', textAlign: 'left' }}>Deck ID</th>
                              <th style={{ padding: '6px' }}>Start KP</th>
                              <th style={{ padding: '6px' }}>End KP</th>
                              <th style={{ padding: '6px' }}>Species</th>
                              <th style={{ padding: '6px' }}>Volume</th>
                            </tr></thead>
                            <tbody>
                              {block.clearingData.timberDecks.map((d, i) => (
                                <tr key={i} style={{ backgroundColor: i % 2 ? '#fff' : '#f1f8e9' }}>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>{d.deckId || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{d.startKp || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{d.endKp || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{d.speciesSort || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{d.volumeEstimate || '-'} m³</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Specialized Data - HDD */}
                  {block.hddData && Object.keys(block.hddData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#ede7f6', padding: '12px', borderRadius: '6px', border: '1px solid #673ab7' }}>
                      <h4 style={{ fontSize: '14px', color: '#512da8', margin: '0 0 12px 0', borderBottom: '2px solid #512da8', paddingBottom: '8px' }}>🔄 HDD Data</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '12px' }}>
                        {block.hddData.drillingContractor && <div><span style={{ color: '#666' }}>Contractor: </span><strong>{block.hddData.drillingContractor}</strong></div>}
                        {block.hddData.boreLength && <div><span style={{ color: '#666' }}>Bore Length: </span><strong>{block.hddData.boreLength}m</strong></div>}
                        {block.hddData.entryAngle && <div><span style={{ color: '#666' }}>Entry Angle: </span><strong>{block.hddData.entryAngle}°</strong></div>}
                        {block.hddData.exitAngle && <div><span style={{ color: '#666' }}>Exit Angle: </span><strong>{block.hddData.exitAngle}°</strong></div>}
                        {block.hddData.drillingFluid && <div><span style={{ color: '#666' }}>Drilling Fluid: </span><strong>{block.hddData.drillingFluid}</strong></div>}
                        {block.hddData.pilotHoleComplete && <div><span style={{ color: '#666' }}>Pilot Hole: </span><strong style={{ color: block.hddData.pilotHoleComplete === 'Yes' ? '#28a745' : '#666' }}>{block.hddData.pilotHoleComplete}</strong></div>}
                        {block.hddData.reamerSize && <div><span style={{ color: '#666' }}>Reamer Size: </span><strong>{block.hddData.reamerSize}"</strong></div>}
                        {block.hddData.pullbackComplete && <div><span style={{ color: '#666' }}>Pullback: </span><strong style={{ color: block.hddData.pullbackComplete === 'Yes' ? '#28a745' : '#666' }}>{block.hddData.pullbackComplete}</strong></div>}
                      </div>
                    </div>
                  )}

                  {/* Specialized Data - Hydrotest */}
                  {block.hydrotestData && Object.keys(block.hydrotestData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#e0f7fa', padding: '12px', borderRadius: '6px', border: '1px solid #00bcd4' }}>
                      <h4 style={{ fontSize: '14px', color: '#00838f', margin: '0 0 12px 0', borderBottom: '2px solid #00838f', paddingBottom: '8px' }}>💧 Hydrotest Data</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '12px' }}>
                        {block.hydrotestData.testSection && <div><span style={{ color: '#666' }}>Test Section: </span><strong>{block.hydrotestData.testSection}</strong></div>}
                        {block.hydrotestData.testPressure && <div><span style={{ color: '#666' }}>Test Pressure: </span><strong>{block.hydrotestData.testPressure} kPa</strong></div>}
                        {block.hydrotestData.holdTime && <div><span style={{ color: '#666' }}>Hold Time: </span><strong>{block.hydrotestData.holdTime} hrs</strong></div>}
                        {block.hydrotestData.waterSource && <div><span style={{ color: '#666' }}>Water Source: </span><strong>{block.hydrotestData.waterSource}</strong></div>}
                        {block.hydrotestData.testResult && <div><span style={{ color: '#666' }}>Result: </span><strong style={{ color: block.hydrotestData.testResult === 'Pass' ? '#28a745' : '#dc3545' }}>{block.hydrotestData.testResult}</strong></div>}
                        {block.hydrotestData.pressureDropPSI && <div><span style={{ color: '#666' }}>Pressure Drop: </span><strong>{block.hydrotestData.pressureDropPSI} PSI</strong></div>}
                      </div>
                    </div>
                  )}

                  {/* Specialized Data - Grading */}
                  {block.gradingData && Object.keys(block.gradingData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#efebe9', padding: '12px', borderRadius: '6px', border: '1px solid #795548' }}>
                      <h4 style={{ fontSize: '14px', color: '#5d4037', margin: '0 0 12px 0', borderBottom: '2px solid #5d4037', paddingBottom: '8px' }}>🚧 Grading Data</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '12px' }}>
                        {block.gradingData.gradingMethod && <div><span style={{ color: '#666' }}>Method: </span><strong>{block.gradingData.gradingMethod}</strong></div>}
                        {block.gradingData.materialSource && <div><span style={{ color: '#666' }}>Material Source: </span><strong>{block.gradingData.materialSource}</strong></div>}
                        {block.gradingData.compactionRequired && <div><span style={{ color: '#666' }}>Compaction Required: </span><strong>{block.gradingData.compactionRequired}</strong></div>}
                        {block.gradingData.compactionMethod && <div><span style={{ color: '#666' }}>Compaction Method: </span><strong>{block.gradingData.compactionMethod}</strong></div>}
                        {block.gradingData.slopeCompliance && <div><span style={{ color: '#666' }}>Slope Compliance: </span><strong style={{ color: block.gradingData.slopeCompliance === 'Yes' ? '#28a745' : '#dc3545' }}>{block.gradingData.slopeCompliance}</strong></div>}
                        {block.gradingData.drainageVerified && <div><span style={{ color: '#666' }}>Drainage Verified: </span><strong style={{ color: block.gradingData.drainageVerified === 'Yes' ? '#28a745' : '#dc3545' }}>{block.gradingData.drainageVerified}</strong></div>}
                      </div>
                    </div>
                  )}

                  {/* Tie-In Completion Data */}
                  {block.tieInCompletionData && Object.keys(block.tieInCompletionData).length > 0 && (
                    <div style={{ marginTop: '10px', backgroundColor: '#e8f4f8', padding: '12px', borderRadius: '6px', border: '1px solid #17a2b8' }}>
                      <h4 style={{ fontSize: '14px', color: '#17a2b8', margin: '0 0 12px 0', borderBottom: '2px solid #17a2b8', paddingBottom: '8px' }}>🔧 Tie-In Completion Data</h4>

                      {/* Backfill Details */}
                      {block.tieInCompletionData.backfill && (block.tieInCompletionData.backfill.method || block.tieInCompletionData.backfill.liftThickness || block.tieInCompletionData.backfill.compactionMethod) && (
                        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#d4edda', borderRadius: '4px' }}>
                          <h5 style={{ fontSize: '12px', color: '#155724', margin: '0 0 8px 0' }}>Backfill Details</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', fontSize: '12px' }}>
                            {block.tieInCompletionData.backfill.method && <div><span style={{ color: '#666' }}>Method: </span><strong>{block.tieInCompletionData.backfill.method}</strong></div>}
                            {block.tieInCompletionData.backfill.liftThickness && <div><span style={{ color: '#666' }}>Lift Thickness: </span><strong>{block.tieInCompletionData.backfill.liftThickness}</strong></div>}
                            {block.tieInCompletionData.backfill.numberOfLifts && <div><span style={{ color: '#666' }}>Number of Lifts: </span><strong>{block.tieInCompletionData.backfill.numberOfLifts}</strong></div>}
                            {block.tieInCompletionData.backfill.compactionMethod && <div><span style={{ color: '#666' }}>Compaction Method: </span><strong>{block.tieInCompletionData.backfill.compactionMethod}</strong></div>}
                            {block.tieInCompletionData.backfill.compactionTestRequired && <div><span style={{ color: '#666' }}>Compaction Test Req: </span><strong>{block.tieInCompletionData.backfill.compactionTestRequired}</strong></div>}
                            {block.tieInCompletionData.backfill.compactionTestPassed && <div><span style={{ color: '#666' }}>Compaction Test: </span><strong style={{ color: block.tieInCompletionData.backfill.compactionTestPassed === 'Yes' ? '#28a745' : '#dc3545' }}>{block.tieInCompletionData.backfill.compactionTestPassed}</strong></div>}
                            {block.tieInCompletionData.backfill.paddingMaterial && <div><span style={{ color: '#666' }}>Padding Material: </span><strong>{block.tieInCompletionData.backfill.paddingMaterial}</strong></div>}
                            {block.tieInCompletionData.backfill.paddingDepth && <div><span style={{ color: '#666' }}>Padding Depth: </span><strong>{block.tieInCompletionData.backfill.paddingDepth}</strong></div>}
                          </div>
                        </div>
                      )}

                      {/* Cathodic Protection */}
                      {block.tieInCompletionData.cathodicProtection && block.tieInCompletionData.cathodicProtection.installed === 'Yes' && (
                        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#e3f2fd', borderRadius: '4px', border: '1px solid #2196f3' }}>
                          <h5 style={{ fontSize: '12px', color: '#1565c0', margin: '0 0 8px 0' }}>⚡ Cathodic Protection (Test Leads)</h5>

                          {/* Configuration */}
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#1565c0', marginBottom: '4px' }}>Configuration & Leads</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px', fontSize: '11px' }}>
                              {block.tieInCompletionData.cathodicProtection.stationType && <div><span style={{ color: '#666' }}>Station: </span><strong>{block.tieInCompletionData.cathodicProtection.stationType}</strong></div>}
                              {block.tieInCompletionData.cathodicProtection.wireGauge && <div><span style={{ color: '#666' }}>Wire: </span><strong>{block.tieInCompletionData.cathodicProtection.wireGauge}</strong></div>}
                              {block.tieInCompletionData.cathodicProtection.insulationType && <div><span style={{ color: '#666' }}>Insulation: </span><strong>{block.tieInCompletionData.cathodicProtection.insulationType}</strong></div>}
                              {block.tieInCompletionData.cathodicProtection.wireColor && <div><span style={{ color: '#666' }}>Color: </span><strong>{block.tieInCompletionData.cathodicProtection.wireColor}</strong></div>}
                            </div>
                          </div>

                          {/* Connection */}
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#1565c0', marginBottom: '4px' }}>Connection (Exothermic Weld)</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px', fontSize: '11px' }}>
                              {block.tieInCompletionData.cathodicProtection.weldMethod && <div><span style={{ color: '#666' }}>Weld Method: </span><strong>{block.tieInCompletionData.cathodicProtection.weldMethod}</strong></div>}
                              <div><span style={{ color: '#666' }}>Surface Prep (White Metal): </span><strong style={{ color: block.tieInCompletionData.cathodicProtection.surfacePrepWhiteMetal ? '#28a745' : '#dc3545' }}>{block.tieInCompletionData.cathodicProtection.surfacePrepWhiteMetal ? 'Yes' : 'No'}</strong></div>
                              <div><span style={{ color: '#666' }}>Slag Test: </span><strong style={{ color: block.tieInCompletionData.cathodicProtection.slagTestPassed ? '#28a745' : '#dc3545' }}>{block.tieInCompletionData.cathodicProtection.slagTestPassed ? 'PASS' : 'N/A'}</strong></div>
                              <div><span style={{ color: '#666' }}>Slack/U-Loop: </span><strong style={{ color: block.tieInCompletionData.cathodicProtection.slackULoopConfirmed ? '#28a745' : '#dc3545' }}>{block.tieInCompletionData.cathodicProtection.slackULoopConfirmed ? 'Confirmed' : 'N/A'}</strong></div>
                              {block.tieInCompletionData.cathodicProtection.encapsulationType && <div><span style={{ color: '#666' }}>Encapsulation: </span><strong>{block.tieInCompletionData.cathodicProtection.encapsulationType}</strong></div>}
                            </div>
                          </div>

                          {/* Termination */}
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#1565c0', marginBottom: '4px' }}>Termination</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px', fontSize: '11px' }}>
                              {block.tieInCompletionData.cathodicProtection.terminalBoardPosition && <div><span style={{ color: '#666' }}>Terminal Position: </span><strong>{block.tieInCompletionData.cathodicProtection.terminalBoardPosition}</strong></div>}
                              {block.tieInCompletionData.cathodicProtection.conduitType && <div><span style={{ color: '#666' }}>Conduit: </span><strong>{block.tieInCompletionData.cathodicProtection.conduitType}</strong></div>}
                              {block.tieInCompletionData.cathodicProtection.testStationInstalled && <div><span style={{ color: '#666' }}>Test Station: </span><strong>{block.tieInCompletionData.cathodicProtection.testStationInstalled}</strong></div>}
                            </div>
                          </div>

                          {/* Installed By & Status */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #bbdefb' }}>
                            <span><span style={{ color: '#666' }}>Installed By: </span><strong>{block.tieInCompletionData.cathodicProtection.installedBy || 'N/A'}</strong> {block.tieInCompletionData.cathodicProtection.thirdPartyName && `(${block.tieInCompletionData.cathodicProtection.thirdPartyName})`}</span>
                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', backgroundColor: block.tieInCompletionData.cathodicProtection.recordStatus === 'Verified' ? '#d4edda' : '#fff3cd', color: block.tieInCompletionData.cathodicProtection.recordStatus === 'Verified' ? '#155724' : '#856404' }}>
                              {block.tieInCompletionData.cathodicProtection.recordStatus || 'Pending Review'}
                            </span>
                          </div>

                          {/* Photos */}
                          {block.tieInCompletionData.cathodicProtection.photos && block.tieInCompletionData.cathodicProtection.photos.length > 0 && (
                            <div style={{ marginTop: '8px', fontSize: '11px', color: '#1565c0' }}>
                              📷 {block.tieInCompletionData.cathodicProtection.photos.length} photo(s) attached
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pipe Support / Crossing Support */}
                      {block.tieInCompletionData.pipeSupport && block.tieInCompletionData.pipeSupport.required === 'Yes' && (
                        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#fff7ed', borderRadius: '4px', border: '1px solid #fd7e14' }}>
                          <h5 style={{ fontSize: '12px', color: '#fd7e14', margin: '0 0 8px 0' }}>🏗️ Pipe Support (Crossing Support)</h5>

                          {block.tieInCompletionData.pipeSupport.supports && block.tieInCompletionData.pipeSupport.supports.length > 0 ? (
                            <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#fd7e14', color: 'white' }}>
                                  <th style={{ padding: '6px', textAlign: 'left' }}>Type</th>
                                  <th style={{ padding: '6px', textAlign: 'center' }}>KP</th>
                                  <th style={{ padding: '6px', textAlign: 'center' }}>Qty</th>
                                  <th style={{ padding: '6px', textAlign: 'center' }}>UOM</th>
                                  <th style={{ padding: '6px', textAlign: 'center' }}>Elevation</th>
                                  <th style={{ padding: '6px', textAlign: 'center' }}>Parent Weld</th>
                                  <th style={{ padding: '6px', textAlign: 'center' }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {block.tieInCompletionData.pipeSupport.supports.map((support, i) => {
                                  let qty = 0
                                  if (support.type === 'sandbag_piers') qty = support.numberOfPiers || 0
                                  else if (support.type === 'polyurethane_foam') qty = support.volumeM3 || support.numberOfKits || 0
                                  else if (support.type === 'native_subsoil') qty = support.linearMeters || 0
                                  else if (support.type === 'concrete_sleepers') qty = support.quantity || 0

                                  return (
                                    <tr key={i} style={{ backgroundColor: i % 2 ? '#fff' : '#fff7ed' }}>
                                      <td style={{ padding: '6px', borderBottom: '1px solid #dee2e6' }}>{support.typeName}</td>
                                      <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #dee2e6', fontFamily: 'monospace' }}>{support.kpLocation || '-'}</td>
                                      <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #dee2e6', fontWeight: 'bold' }}>{qty}</td>
                                      <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{support.uom}</td>
                                      <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                                        <span style={{ color: support.elevationVerified ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
                                          {support.elevationVerified ? '✓ Verified' : '⚠️ Not Verified'}
                                        </span>
                                      </td>
                                      <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #dee2e6', fontFamily: 'monospace', fontSize: '10px' }}>{support.parentWeldId || '-'}</td>
                                      <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                                        <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: 'bold', backgroundColor: support.elevationVerified ? '#d4edda' : '#fff3cd', color: support.elevationVerified ? '#155724' : '#856404' }}>
                                          {support.recordStatus || 'Pending'}
                                        </span>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          ) : (
                            <p style={{ margin: 0, fontSize: '11px', color: '#666', fontStyle: 'italic' }}>Pipe support required but no entries recorded</p>
                          )}
                        </div>
                      )}

                      {/* Third Party Crossings */}
                      {block.tieInCompletionData.thirdPartyCrossings && block.tieInCompletionData.thirdPartyCrossings.length > 0 && (
                        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#fce4ec', borderRadius: '4px', border: '1px solid #e91e63' }}>
                          <h5 style={{ fontSize: '12px', color: '#880e4f', margin: '0 0 8px 0' }}>🔀 Third Party Crossings ({block.tieInCompletionData.thirdPartyCrossings.length})</h5>
                          {block.tieInCompletionData.thirdPartyCrossings.map((crossing, i) => (
                            <div key={i} style={{ padding: '8px', backgroundColor: '#fff', borderRadius: '4px', marginBottom: '6px', fontSize: '11px' }}>
                              <strong>{i + 1}. {crossing.utilityType || 'Unknown'}</strong>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px', marginTop: '4px' }}>
                                {crossing.owner && <div><span style={{ color: '#666' }}>Owner: </span>{crossing.owner}</div>}
                                {crossing.clearance && <div><span style={{ color: '#666' }}>Clearance: </span>{crossing.clearance}m</div>}
                                {crossing.protectionMethod && <div><span style={{ color: '#666' }}>Protection: </span>{crossing.protectionMethod}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Anodes */}
                      {block.tieInCompletionData.anodes && Array.isArray(block.tieInCompletionData.anodes) && block.tieInCompletionData.anodes.length > 0 && (
                        <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                          <h5 style={{ fontSize: '12px', color: '#1565c0', margin: '0 0 8px 0' }}>🔌 Anodes ({block.tieInCompletionData.anodes.length})</h5>
                          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#2196f3', color: 'white' }}>
                                <th style={{ padding: '6px', textAlign: 'left' }}>Type</th>
                                <th style={{ padding: '6px' }}>Manufacturer</th>
                                <th style={{ padding: '6px' }}>Size</th>
                                <th style={{ padding: '6px' }}>Serial #</th>
                                <th style={{ padding: '6px' }}>Location</th>
                              </tr>
                            </thead>
                            <tbody>
                              {block.tieInCompletionData.anodes.map((anode, i) => (
                                <tr key={i} style={{ backgroundColor: i % 2 ? '#fff' : '#e3f2fd' }}>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #ddd' }}>{anode.type || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{anode.manufacturer || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{anode.size || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{anode.serialNumber || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{anode.location || anode.kp || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Machine Cleanup Data */}
                  {block.machineCleanupData && Object.keys(block.machineCleanupData).length > 0 && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '6px', border: '1px solid #4caf50' }}>
                      <h5 style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 10px 0' }}>🌿 Machine Cleanup Data</h5>

                      {/* Subsoil Restoration */}
                      {block.machineCleanupData.subsoilRestoration && (block.machineCleanupData.subsoilRestoration.rippingDepthCm || block.machineCleanupData.subsoilRestoration.decompactionConfirmed || block.machineCleanupData.subsoilRestoration.rockPickRequired) && (
                        <div style={{ marginBottom: '8px' }}>
                          <strong style={{ fontSize: '11px', color: '#2e7d32' }}>Subsoil Restoration & De-compaction</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px', marginTop: '4px', fontSize: '11px' }}>
                            {block.machineCleanupData.subsoilRestoration.rippingDepthCm && <div><span style={{ color: '#666' }}>Ripping Depth: </span><strong>{block.machineCleanupData.subsoilRestoration.rippingDepthCm} cm</strong></div>}
                            {block.machineCleanupData.subsoilRestoration.numberOfPasses && <div><span style={{ color: '#666' }}>Passes: </span><strong>{block.machineCleanupData.subsoilRestoration.numberOfPasses}</strong></div>}
                            <div><span style={{ color: '#666' }}>Decompaction: </span><strong style={{ color: block.machineCleanupData.subsoilRestoration.decompactionConfirmed ? '#28a745' : '#dc3545' }}>{block.machineCleanupData.subsoilRestoration.decompactionConfirmed ? 'YES' : 'NO'}</strong></div>
                            {block.machineCleanupData.subsoilRestoration.rockPickRequired && <div><span style={{ color: '#666' }}>Rock Pick: </span><strong style={{ color: '#28a745' }}>YES</strong></div>}
                            {block.machineCleanupData.subsoilRestoration.rockVolumeRemovedM3 && <div><span style={{ color: '#666' }}>Rock Removed: </span><strong>{block.machineCleanupData.subsoilRestoration.rockVolumeRemovedM3} m³</strong></div>}
                            <div><span style={{ color: '#666' }}>Contour: </span><strong style={{ color: block.machineCleanupData.subsoilRestoration.contourMatchingRestored ? '#28a745' : '#dc3545' }}>{block.machineCleanupData.subsoilRestoration.contourMatchingRestored ? 'Restored' : 'Pending'}</strong></div>
                            <div><span style={{ color: '#666' }}>Drainage: </span><strong style={{ color: block.machineCleanupData.subsoilRestoration.drainagePatternsRestored ? '#28a745' : '#dc3545' }}>{block.machineCleanupData.subsoilRestoration.drainagePatternsRestored ? 'Restored' : 'Pending'}</strong></div>
                          </div>
                        </div>
                      )}

                      {/* Trench Crown */}
                      {block.machineCleanupData.trenchCrown && (block.machineCleanupData.trenchCrown.settlementCrownHeightCm || block.machineCleanupData.trenchCrown.mechanicalCompaction) && (
                        <div style={{ marginBottom: '8px', paddingTop: '8px', borderTop: '1px solid #a5d6a7' }}>
                          <strong style={{ fontSize: '11px', color: '#1565c0' }}>Trench & Crown Management</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px', marginTop: '4px', fontSize: '11px' }}>
                            {block.machineCleanupData.trenchCrown.settlementCrownHeightCm && <div><span style={{ color: '#666' }}>Crown Height: </span><strong>{block.machineCleanupData.trenchCrown.settlementCrownHeightCm} cm</strong></div>}
                            <div><span style={{ color: '#666' }}>Relief Gaps: </span><strong style={{ color: block.machineCleanupData.trenchCrown.crownReliefGapsInstalled ? '#28a745' : '#6c757d' }}>{block.machineCleanupData.trenchCrown.crownReliefGapsInstalled ? 'YES' : 'NO'}</strong></div>
                            <div><span style={{ color: '#666' }}>Mech Compaction: </span><strong style={{ color: block.machineCleanupData.trenchCrown.mechanicalCompaction ? '#28a745' : '#6c757d' }}>{block.machineCleanupData.trenchCrown.mechanicalCompaction ? 'YES' : 'NO'}</strong></div>
                            {block.machineCleanupData.trenchCrown.compactionEquipmentType && <div><span style={{ color: '#666' }}>Equipment: </span><strong>{block.machineCleanupData.trenchCrown.compactionEquipmentType}</strong></div>}
                            {block.machineCleanupData.trenchCrown.compactionNumberOfLifts && <div><span style={{ color: '#666' }}>Lifts: </span><strong>{block.machineCleanupData.trenchCrown.compactionNumberOfLifts}</strong></div>}
                          </div>
                        </div>
                      )}

                      {/* Debris Recovery */}
                      {block.machineCleanupData.debrisRecovery && block.machineCleanupData.debrisRecovery.allDebrisCleared && (
                        <div style={{ marginBottom: '8px', paddingTop: '8px', borderTop: '1px solid #a5d6a7' }}>
                          <strong style={{ fontSize: '11px', color: '#e65100' }}>Debris & Asset Recovery</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px', marginTop: '4px', fontSize: '11px' }}>
                            <div><span style={{ color: '#666' }}>Skids/Lath: </span><strong style={{ color: block.machineCleanupData.debrisRecovery.skidsLathRemoved ? '#28a745' : '#dc3545' }}>{block.machineCleanupData.debrisRecovery.skidsLathRemoved ? 'Removed' : 'Pending'}</strong></div>
                            <div><span style={{ color: '#666' }}>Welding Rods: </span><strong style={{ color: block.machineCleanupData.debrisRecovery.weldingRodsCleared ? '#28a745' : '#dc3545' }}>{block.machineCleanupData.debrisRecovery.weldingRodsCleared ? 'Cleared' : 'Pending'}</strong></div>
                            <div><span style={{ color: '#666' }}>Trash: </span><strong style={{ color: block.machineCleanupData.debrisRecovery.trashCleared ? '#28a745' : '#dc3545' }}>{block.machineCleanupData.debrisRecovery.trashCleared ? 'Cleared' : 'Pending'}</strong></div>
                            <div><span style={{ color: '#666' }}>Temp Bridges: </span><strong style={{ color: block.machineCleanupData.debrisRecovery.temporaryBridgesRemoved ? '#28a745' : '#6c757d' }}>{block.machineCleanupData.debrisRecovery.temporaryBridgesRemoved ? 'Removed' : 'N/A'}</strong></div>
                            <div><span style={{ color: '#666' }}>Ramps: </span><strong style={{ color: block.machineCleanupData.debrisRecovery.rampsRemoved ? '#28a745' : '#6c757d' }}>{block.machineCleanupData.debrisRecovery.rampsRemoved ? 'Removed' : 'N/A'}</strong></div>
                            <div style={{ fontWeight: 'bold', color: block.machineCleanupData.debrisRecovery.allDebrisCleared ? '#28a745' : '#dc3545' }}>
                              ALL DEBRIS: {block.machineCleanupData.debrisRecovery.allDebrisCleared ? '✓ CLEARED' : '✗ PENDING'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Drain Tile Repairs */}
                      {block.machineCleanupData.drainTileRepair?.applicable && block.machineCleanupData.drainTileRepair.tiles?.length > 0 && (
                        <div style={{ marginBottom: '8px', paddingTop: '8px', borderTop: '1px solid #a5d6a7' }}>
                          <strong style={{ fontSize: '11px', color: '#0277bd' }}>Drain Tile Repairs ({block.machineCleanupData.drainTileRepair.tiles.length})</strong>
                          <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', marginTop: '4px' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#b3e5fc' }}>
                                <th style={{ padding: '4px', textAlign: 'left', borderBottom: '1px solid #4fc3f7' }}>KP</th>
                                <th style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #4fc3f7' }}>Diameter</th>
                                <th style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #4fc3f7' }}>Material</th>
                                <th style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #4fc3f7' }}>Repair</th>
                                <th style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #4fc3f7' }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {block.machineCleanupData.drainTileRepair.tiles.map((tile, i) => (
                                <tr key={i} style={{ backgroundColor: i % 2 ? '#fff' : '#e1f5fe' }}>
                                  <td style={{ padding: '4px', borderBottom: '1px solid #ddd' }}>{tile.kp || '-'}</td>
                                  <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{tile.diameter || '-'}"</td>
                                  <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{tile.material || '-'}</td>
                                  <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>{tile.repairType || '-'}</td>
                                  <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>
                                    <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '9px', backgroundColor: tile.status === 'Complete' ? '#d4edda' : '#fff3cd', color: tile.status === 'Complete' ? '#155724' : '#856404' }}>
                                      {tile.status || 'Pending'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Erosion Control */}
                      {block.machineCleanupData.erosionControl && (block.machineCleanupData.erosionControl.waterBarsInstalled || block.machineCleanupData.erosionControl.diversionBermsInstalled || block.machineCleanupData.erosionControl.siltFenceStatus) && (
                        <div style={{ marginBottom: '8px', paddingTop: '8px', borderTop: '1px solid #a5d6a7' }}>
                          <strong style={{ fontSize: '11px', color: '#880e4f' }}>Erosion & Sediment Control</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px', marginTop: '4px', fontSize: '11px' }}>
                            {block.machineCleanupData.erosionControl.waterBarsInstalled && <div><span style={{ color: '#666' }}>Water Bars: </span><strong style={{ color: '#28a745' }}>{block.machineCleanupData.erosionControl.waterBarsLinearMeters || 0}m</strong></div>}
                            <div><span style={{ color: '#666' }}>Diversion Berms: </span><strong style={{ color: block.machineCleanupData.erosionControl.diversionBermsInstalled ? '#28a745' : '#6c757d' }}>{block.machineCleanupData.erosionControl.diversionBermsInstalled ? 'YES' : 'NO'}</strong></div>
                            {block.machineCleanupData.erosionControl.siltFenceStatus && <div><span style={{ color: '#666' }}>Silt Fence: </span><strong>{block.machineCleanupData.erosionControl.siltFenceStatus}</strong></div>}
                            {block.machineCleanupData.erosionControl.strawWattlesStatus && <div><span style={{ color: '#666' }}>Straw Wattles: </span><strong>{block.machineCleanupData.erosionControl.strawWattlesStatus}</strong></div>}
                          </div>
                        </div>
                      )}

                      {/* Additional Info */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px', fontSize: '11px', paddingTop: '8px', borderTop: '1px solid #a5d6a7' }}>
                        {block.machineCleanupData.soilType && <div><span style={{ color: '#666' }}>Soil Type: </span><strong>{block.machineCleanupData.soilType}</strong></div>}
                        {block.machineCleanupData.landUseCategory && <div><span style={{ color: '#666' }}>Land Use: </span><strong>{block.machineCleanupData.landUseCategory}</strong></div>}
                        {block.machineCleanupData.specializedRockPicking && <div><span style={{ color: '#666' }}>Specialized Rock Pick: </span><strong style={{ color: '#28a745' }}>YES</strong></div>}
                        {block.machineCleanupData.importedFillUsed && <div><span style={{ color: '#666' }}>Imported Fill: </span><strong>{block.machineCleanupData.importedFillVolume || 0} m³</strong></div>}
                      </div>

                      {/* Photos */}
                      {block.machineCleanupData.photos && block.machineCleanupData.photos.length > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '11px', color: '#2e7d32' }}>
                          📷 {block.machineCleanupData.photos.length} photo(s) attached
                        </div>
                      )}

                      {/* Comments */}
                      {block.machineCleanupData.comments && (
                        <div style={{ marginTop: '8px', padding: '6px', backgroundColor: '#f1f8e9', borderRadius: '4px', fontSize: '11px' }}>
                          <span style={{ color: '#666' }}>Comments: </span>{block.machineCleanupData.comments}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Final Cleanup Data */}
                  {block.finalCleanupData && Object.keys(block.finalCleanupData).length > 0 && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#efebe9', borderRadius: '6px', border: '1px solid #bcaaa4' }}>
                      <h5 style={{ fontSize: '13px', color: '#5d4037', margin: '0 0 10px 0' }}>🌱 Final Cleanup Data</h5>

                      {/* Topsoil Replacement */}
                      {block.finalCleanupData.topsoilReplacement && (block.finalCleanupData.topsoilReplacement.actualReplacedDepthCm || block.finalCleanupData.topsoilReplacement.finalRockPickComplete) && (
                        <div style={{ marginBottom: '8px' }}>
                          <strong style={{ fontSize: '11px', color: '#795548' }}>Topsoil Replacement</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px', marginTop: '4px', fontSize: '11px' }}>
                            {block.finalCleanupData.topsoilReplacement.targetDepthCm && <div><span style={{ color: '#666' }}>Target: </span><strong>{block.finalCleanupData.topsoilReplacement.targetDepthCm} cm</strong></div>}
                            {block.finalCleanupData.topsoilReplacement.actualReplacedDepthCm && <div><span style={{ color: '#666' }}>Actual: </span><strong>{block.finalCleanupData.topsoilReplacement.actualReplacedDepthCm} cm</strong></div>}
                            {block.finalCleanupData.topsoilReplacement.depthCompliance && <div><span style={{ color: '#666' }}>Compliance: </span><strong style={{ color: block.finalCleanupData.topsoilReplacement.depthCompliance === 'Pass' ? '#28a745' : '#dc3545' }}>{block.finalCleanupData.topsoilReplacement.depthCompliance}</strong></div>}
                            <div><span style={{ color: '#666' }}>Dry Conditions: </span><strong style={{ color: block.finalCleanupData.topsoilReplacement.replacedInDryConditions ? '#28a745' : '#6c757d' }}>{block.finalCleanupData.topsoilReplacement.replacedInDryConditions ? 'YES' : 'NO'}</strong></div>
                            <div><span style={{ color: '#666' }}>Grade Match: </span><strong style={{ color: block.finalCleanupData.topsoilReplacement.gradeMatchesSurrounding ? '#28a745' : '#6c757d' }}>{block.finalCleanupData.topsoilReplacement.gradeMatchesSurrounding ? 'YES' : 'NO'}</strong></div>
                            <div><span style={{ color: '#666' }}>Rock Pick: </span><strong style={{ color: block.finalCleanupData.topsoilReplacement.finalRockPickComplete ? '#28a745' : '#6c757d' }}>{block.finalCleanupData.topsoilReplacement.finalRockPickComplete ? 'Complete' : 'Pending'}</strong></div>
                          </div>
                          {block.finalCleanupData.topsoilReplacement.admixingObserved && (
                            <div style={{ marginTop: '4px', padding: '4px 8px', backgroundColor: '#fff3cd', borderRadius: '4px', fontSize: '10px', color: '#856404' }}>
                              <strong>[!] AD-MIXING OBSERVED:</strong> {block.finalCleanupData.topsoilReplacement.admixingNotes || 'See notes'}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Revegetation */}
                      {block.finalCleanupData.revegetation && (block.finalCleanupData.revegetation.seedMixId || block.finalCleanupData.revegetation.seedingMethod) && (
                        <div style={{ marginBottom: '8px', paddingTop: '8px', borderTop: '1px solid #d7ccc8' }}>
                          <strong style={{ fontSize: '11px', color: '#388e3c' }}>Revegetation & Seeding</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px', marginTop: '4px', fontSize: '11px' }}>
                            {block.finalCleanupData.revegetation.seedMixId && <div><span style={{ color: '#666' }}>Mix ID: </span><strong>{block.finalCleanupData.revegetation.seedMixId}</strong></div>}
                            {block.finalCleanupData.revegetation.seedingMethod && <div><span style={{ color: '#666' }}>Method: </span><strong>{block.finalCleanupData.revegetation.seedingMethod}</strong></div>}
                            {block.finalCleanupData.revegetation.applicationRateKgHa && <div><span style={{ color: '#666' }}>Rate: </span><strong>{block.finalCleanupData.revegetation.applicationRateKgHa} kg/ha</strong></div>}
                            {block.finalCleanupData.revegetation.totalSeedUsedKg && <div><span style={{ color: '#666' }}>Total: </span><strong>{block.finalCleanupData.revegetation.totalSeedUsedKg} kg</strong></div>}
                            {block.finalCleanupData.revegetation.fertilizerType && <div><span style={{ color: '#666' }}>Fertilizer: </span><strong>{block.finalCleanupData.revegetation.fertilizerType}</strong></div>}
                            {block.finalCleanupData.revegetation.fertilizerBagsUsed && <div><span style={{ color: '#666' }}>Bags: </span><strong>{block.finalCleanupData.revegetation.fertilizerBagsUsed}</strong></div>}
                          </div>
                          <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: 'bold', color: block.finalCleanupData.revegetation.seedTagPhotoUploaded ? '#28a745' : '#dc3545' }}>
                            Seed Tag: {block.finalCleanupData.revegetation.seedTagPhotoUploaded ? '✓ VERIFIED' : '✗ REQUIRED'}
                          </div>
                        </div>
                      )}

                      {/* Permanent ESC */}
                      {block.finalCleanupData.permanentESC && (block.finalCleanupData.permanentESC.permanentSiltFencesInstalled || block.finalCleanupData.permanentESC.finalWaterBarsInstalled || block.finalCleanupData.permanentESC.erosionControlBlanketsInstalled) && (
                        <div style={{ marginBottom: '8px', paddingTop: '8px', borderTop: '1px solid #d7ccc8' }}>
                          <strong style={{ fontSize: '11px', color: '#0277bd' }}>Permanent Erosion Control (As-Built)</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px', marginTop: '4px', fontSize: '11px' }}>
                            {block.finalCleanupData.permanentESC.permanentSiltFencesInstalled && <div><span style={{ color: '#666' }}>Silt Fence: </span><strong>{block.finalCleanupData.permanentESC.permanentSiltFenceMeters || 0}m</strong></div>}
                            {block.finalCleanupData.permanentESC.finalWaterBarsInstalled && <div><span style={{ color: '#666' }}>Water Bars: </span><strong>{block.finalCleanupData.permanentESC.finalWaterBarsCount || 0}</strong></div>}
                            {block.finalCleanupData.permanentESC.erosionControlBlanketsInstalled && <div><span style={{ color: '#666' }}>Blankets: </span><strong>{block.finalCleanupData.permanentESC.erosionControlBlanketM2 || 0} m²</strong></div>}
                            {block.finalCleanupData.permanentESC.ripRapInstalled && <div><span style={{ color: '#666' }}>Rip Rap: </span><strong>{block.finalCleanupData.permanentESC.ripRapM3 || 0} m³</strong></div>}
                          </div>
                        </div>
                      )}

                      {/* Asset Restoration */}
                      {block.finalCleanupData.assetRestoration && (block.finalCleanupData.assetRestoration.permanentFencesReinstalled || block.finalCleanupData.assetRestoration.pipelineMarkersInstalled || block.finalCleanupData.assetRestoration.landownerWalkthroughCompleted) && (
                        <div style={{ marginBottom: '8px', paddingTop: '8px', borderTop: '1px solid #d7ccc8' }}>
                          <strong style={{ fontSize: '11px', color: '#6a1b9a' }}>Asset Restoration</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px', marginTop: '4px', fontSize: '11px' }}>
                            {block.finalCleanupData.assetRestoration.permanentFencesReinstalled && <div><span style={{ color: '#666' }}>Fence: </span><strong>{block.finalCleanupData.assetRestoration.fenceLinearMeters || 0}m ({block.finalCleanupData.assetRestoration.fenceType || 'N/A'})</strong></div>}
                            {block.finalCleanupData.assetRestoration.gatesFunctional && <div><span style={{ color: '#666' }}>Gates: </span><strong>{block.finalCleanupData.assetRestoration.gatesCount || 0}</strong></div>}
                            {block.finalCleanupData.assetRestoration.pipelineMarkersInstalled && <div><span style={{ color: '#666' }}>Markers: </span><strong>{block.finalCleanupData.assetRestoration.markersCount || 0}</strong></div>}
                          </div>
                          {block.finalCleanupData.assetRestoration.landownerWalkthroughCompleted && (
                            <div style={{ marginTop: '4px', padding: '4px 8px', backgroundColor: '#e8f5e9', borderRadius: '4px', fontSize: '10px' }}>
                              <strong style={{ color: '#2e7d32' }}>Landowner Walkthrough:</strong> {block.finalCleanupData.assetRestoration.landownerWalkthroughDate || 'Date N/A'} - {block.finalCleanupData.assetRestoration.landownerName || 'Name N/A'}
                              {block.finalCleanupData.assetRestoration.landownerConcerns && <div style={{ marginTop: '2px', color: '#856404' }}>Concerns: {block.finalCleanupData.assetRestoration.landownerConcerns}</div>}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Final Status */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '4px', fontSize: '11px', paddingTop: '8px', borderTop: '1px solid #d7ccc8' }}>
                        {block.finalCleanupData.preConstructionLandUse && <div><span style={{ color: '#666' }}>Land Use: </span><strong>{block.finalCleanupData.preConstructionLandUse}</strong></div>}
                        {block.finalCleanupData.seedMixMatchesLandType && <div><span style={{ color: '#666' }}>Seed Mix Match: </span><strong style={{ color: '#28a745' }}>YES</strong></div>}
                        {block.finalCleanupData.finalInspectionComplete && <div style={{ fontWeight: 'bold', color: '#28a745' }}>Final Inspection: COMPLETE</div>}
                        {block.finalCleanupData.readyForLandownerRelease && <div style={{ fontWeight: 'bold', color: '#28a745', backgroundColor: '#c8e6c9', padding: '2px 6px', borderRadius: '4px' }}>READY FOR RELEASE</div>}
                      </div>

                      {/* Photos */}
                      {((block.finalCleanupData.photos && block.finalCleanupData.photos.length > 0) || (block.finalCleanupData.seedTagPhotos && block.finalCleanupData.seedTagPhotos.length > 0)) && (
                        <div style={{ marginTop: '8px', fontSize: '11px', color: '#5d4037' }}>
                          📷 {(block.finalCleanupData.photos?.length || 0) + (block.finalCleanupData.seedTagPhotos?.length || 0)} photo(s) attached
                        </div>
                      )}

                      {/* Comments */}
                      {block.finalCleanupData.comments && (
                        <div style={{ marginTop: '8px', padding: '6px', backgroundColor: '#fafafa', borderRadius: '4px', fontSize: '11px' }}>
                          <span style={{ color: '#666' }}>Comments: </span>{block.finalCleanupData.comments}
                        </div>
                      )}
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
