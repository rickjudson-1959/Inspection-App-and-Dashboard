import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext.jsx'
import { useOrgQuery } from '../utils/queryHelpers.js'
import SignaturePad from './SignaturePad.jsx'

/**
 * WeldingReportViewer Component
 *
 * Full report viewer for Welding Chief review with all inspector data displayed.
 * Welding Chief can approve with signature or request revision with notes.
 */
function WeldingReportViewer({ report, onClose, onReviewComplete, readOnly = false }) {
  const { userProfile } = useAuth()
  const { getOrgId } = useOrgQuery()

  // State
  const [expandedBlocks, setExpandedBlocks] = useState(new Set())
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [revisionNotes, setRevisionNotes] = useState('')
  const [processing, setProcessing] = useState(false)

  // Expand all blocks by default
  useEffect(() => {
    const activityBlocks = report?.activity_blocks || []
    const allIds = new Set(activityBlocks.map((b, idx) => b.id || idx))
    setExpandedBlocks(allIds)
  }, [report])

  // Get activity blocks
  const activityBlocks = report?.activity_blocks || []

  // Toggle block expansion
  function toggleBlock(blockId) {
    setExpandedBlocks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(blockId)) {
        newSet.delete(blockId)
      } else {
        newSet.add(blockId)
      }
      return newSet
    })
  }

  // Format date
  function formatDate(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Handle approval with signature
  async function handleApprove(signatureData) {
    setProcessing(true)
    setShowSignaturePad(false)

    try {
      // Check if review record exists
      const { data: existing } = await supabase
        .from('welding_report_reviews')
        .select('id')
        .eq('report_id', report.id)
        .single()

      const reviewData = {
        status: 'approved',
        reviewed_by: userProfile?.id,
        reviewed_by_name: userProfile?.full_name || userProfile?.email || 'Welding Chief',
        reviewed_at: new Date().toISOString(),
        signature_image: signatureData.imageData,
        signature_hash: signatureData.hash,
        revision_notes: null,
        updated_at: new Date().toISOString()
      }

      if (existing) {
        const { error } = await supabase
          .from('welding_report_reviews')
          .update(reviewData)
          .eq('id', existing.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('welding_report_reviews')
          .insert({
            ...reviewData,
            report_id: report.id,
            organization_id: getOrgId()
          })

        if (error) throw error
      }

      // Update daily_reports to clear any revision flags
      await supabase
        .from('daily_reports')
        .update({
          revision_requested: false,
          revision_notes: null
        })
        .eq('id', report.id)

      alert('Report approved and signed successfully!')
      if (onReviewComplete) onReviewComplete()
    } catch (err) {
      console.error('Error approving report:', err)
      alert('Error approving report: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Handle revision request
  async function handleRevisionRequest() {
    if (!revisionNotes.trim()) {
      alert('Please enter feedback notes for the inspector')
      return
    }

    setProcessing(true)

    try {
      // Check if review record exists
      const { data: existing } = await supabase
        .from('welding_report_reviews')
        .select('id')
        .eq('report_id', report.id)
        .single()

      const reviewData = {
        status: 'revision_requested',
        reviewed_by: userProfile?.id,
        reviewed_by_name: userProfile?.full_name || userProfile?.email || 'Welding Chief',
        reviewed_at: new Date().toISOString(),
        revision_notes: revisionNotes,
        signature_image: null,
        signature_hash: null,
        updated_at: new Date().toISOString()
      }

      if (existing) {
        const { error } = await supabase
          .from('welding_report_reviews')
          .update(reviewData)
          .eq('id', existing.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('welding_report_reviews')
          .insert({
            ...reviewData,
            report_id: report.id,
            organization_id: getOrgId()
          })

        if (error) throw error
      }

      // Update daily_reports with revision flag
      await supabase
        .from('daily_reports')
        .update({
          revision_requested: true,
          revision_notes: revisionNotes
        })
        .eq('id', report.id)

      // Create notification for the inspector
      if (report.inspector_email) {
        const { data: inspectorProfile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('email', report.inspector_email)
          .single()

        if (inspectorProfile?.id) {
          await supabase.from('user_notifications').insert({
            user_id: inspectorProfile.id,
            organization_id: getOrgId(),
            type: 'revision_requested',
            title: 'Welding Report Revision Requested',
            message: `Your report for ${formatDate(report.date)} requires revision: "${revisionNotes.substring(0, 100)}${revisionNotes.length > 100 ? '...' : ''}"`,
            reference_type: 'daily_report',
            reference_id: report.id
          })
        }
      }

      setShowRevisionModal(false)
      setRevisionNotes('')
      alert('Revision request sent to inspector')
      if (onReviewComplete) onReviewComplete()
    } catch (err) {
      console.error('Error requesting revision:', err)
      alert('Error requesting revision: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Styles
  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 9999,
    display: 'flex',
    justifyContent: 'flex-end'
  }

  const panelStyle = {
    width: '900px',
    maxWidth: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
    boxShadow: '-10px 0 30px rgba(0,0,0,0.2)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  }

  const headerStyle = {
    backgroundColor: '#6f42c1',
    color: 'white',
    padding: '20px',
    flexShrink: 0
  }

  const contentStyle = {
    flex: 1,
    overflowY: 'auto',
    padding: '20px'
  }

  const footerStyle = {
    padding: '16px 20px',
    borderTop: '1px solid #dee2e6',
    backgroundColor: 'white',
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
    flexShrink: 0
  }

  const sectionStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    marginBottom: '16px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    overflow: 'hidden'
  }

  const sectionHeaderStyle = (color) => ({
    backgroundColor: color,
    color: color === '#ffc107' ? '#000' : 'white',
    padding: '12px 16px',
    fontWeight: 'bold',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  })

  const labelStyle = { fontSize: '11px', color: '#666', display: 'block', marginBottom: '2px' }
  const valueStyle = { fontSize: '14px', fontWeight: 'bold' }

  const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' }
  const thStyle = {
    padding: '8px',
    textAlign: 'left',
    borderBottom: '2px solid #dee2e6',
    backgroundColor: '#f8f9fa',
    fontSize: '11px',
    fontWeight: 'bold'
  }
  const tdStyle = {
    padding: '8px',
    borderBottom: '1px solid #eee'
  }

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Welding Report Review</h2>
              <p style={{ margin: '5px 0 0 0', opacity: 0.9, fontSize: '14px' }}>
                {formatDate(report.date)} | {report.inspector_name} | Spread: {report.spread || 'N/A'}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '5px 10px',
                borderRadius: '4px'
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {/* REPORT INFORMATION */}
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle('#1a5f2a')}>📋 Report Information</div>
            <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
              <div><span style={labelStyle}>Date</span><span style={valueStyle}>{report.date}</span></div>
              <div><span style={labelStyle}>Inspector</span><span style={valueStyle}>{report.inspector_name || '-'}</span></div>
              <div><span style={labelStyle}>Spread</span><span style={valueStyle}>{report.spread || '-'}</span></div>
              <div><span style={labelStyle}>Pipeline</span><span style={valueStyle}>{report.pipeline || '-'}</span></div>
              <div><span style={labelStyle}>AFE #</span><span style={valueStyle}>{report.afe || '-'}</span></div>
              <div><span style={labelStyle}>Start/Stop Time</span><span style={valueStyle}>{report.start_time || '-'} - {report.stop_time || '-'}</span></div>
              <div><span style={labelStyle}>ROW Condition</span><span style={valueStyle}>{report.row_condition || '-'}</span></div>
              <div><span style={labelStyle}>Inspector Mileage</span><span style={valueStyle}>{report.inspector_mileage || '-'} km</span></div>
            </div>
          </div>

          {/* WEATHER CONDITIONS */}
          {(report.weather || report.temp_high || report.temp_low) && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle('#17a2b8')}>🌤️ Weather Conditions</div>
              <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' }}>
                <div><span style={labelStyle}>Conditions</span><span style={valueStyle}>{report.weather || '-'}</span></div>
                <div><span style={labelStyle}>High Temp</span><span style={valueStyle}>{report.temp_high || '-'}°C</span></div>
                <div><span style={labelStyle}>Low Temp</span><span style={valueStyle}>{report.temp_low || '-'}°C</span></div>
                <div><span style={labelStyle}>Precipitation</span><span style={valueStyle}>{report.precipitation || '0'} mm</span></div>
                <div><span style={labelStyle}>Wind Speed</span><span style={valueStyle}>{report.wind_speed || '-'} km/h</span></div>
              </div>
            </div>
          )}

          {/* ACTIVITY BLOCKS */}
          {activityBlocks.map((block, idx) => {
            const blockId = block.id || idx
            const isExpanded = expandedBlocks.has(blockId)
            const isWelding = (block.activityType || '').toLowerCase().includes('weld')

            return (
              <div key={blockId} style={sectionStyle}>
                <div
                  onClick={() => toggleBlock(blockId)}
                  style={{
                    ...sectionHeaderStyle(isWelding ? '#6f42c1' : '#28a745'),
                    cursor: 'pointer',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>{isExpanded ? '▼' : '▶'}</span>
                    <span>Activity {idx + 1}: {block.activityType || 'N/A'}</span>
                    {isWelding && (
                      <span style={{ backgroundColor: 'rgba(255,255,255,0.3)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                        WELDING
                      </span>
                    )}
                    {block.contractor && <span style={{ opacity: 0.8, fontSize: '12px' }}>| {block.contractor}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {block.metersToday && (
                      <span style={{ backgroundColor: 'rgba(255,255,255,0.3)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                        {block.metersToday}m Today
                      </span>
                    )}
                    <span style={{ fontSize: '12px', opacity: 0.9 }}>KP {block.startKP || '?'} - {block.endKP || '?'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '16px' }}>
                    {/* Basic Info Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                      <div><span style={labelStyle}>Contractor</span><span style={valueStyle}>{block.contractor || '-'}</span></div>
                      <div><span style={labelStyle}>Foreman</span><span style={valueStyle}>{block.foreman || '-'}</span></div>
                      <div><span style={labelStyle}>Start KP</span><span style={{ ...valueStyle, fontFamily: 'monospace', color: '#28a745' }}>{block.startKP || '-'}</span></div>
                      <div><span style={labelStyle}>End KP</span><span style={{ ...valueStyle, fontFamily: 'monospace', color: '#28a745' }}>{block.endKP || '-'}</span></div>
                      <div><span style={labelStyle}>Time</span><span style={valueStyle}>{block.startTime || '-'} - {block.endTime || '-'}</span></div>
                      <div><span style={labelStyle}>Ticket #</span><span style={valueStyle}>{block.ticketNumber || '-'}</span></div>
                      {block.metersToday && <div><span style={labelStyle}>Meters Today</span><span style={valueStyle}>{block.metersToday}m</span></div>}
                      {block.metersPrevious && <div><span style={labelStyle}>Meters Previous</span><span style={valueStyle}>{block.metersPrevious}m</span></div>}
                    </div>

                    {/* Work Description */}
                    {block.workDescription && (
                      <div style={{ marginBottom: '16px', backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
                        <span style={labelStyle}>Work Description</span>
                        <p style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>{block.workDescription}</p>
                      </div>
                    )}

                    {/* Chainage Overlap/Gap Reasons */}
                    {block.chainageOverlapReason && (
                      <div style={{ marginBottom: '12px', backgroundColor: '#fff3cd', padding: '10px', borderRadius: '6px', border: '1px solid #ffc107' }}>
                        <span style={{ ...labelStyle, color: '#856404' }}>⚠️ Chainage Overlap Reason</span>
                        <p style={{ margin: '4px 0 0 0', color: '#856404' }}>{block.chainageOverlapReason}</p>
                      </div>
                    )}
                    {block.chainageGapReason && (
                      <div style={{ marginBottom: '12px', backgroundColor: '#d4edda', padding: '10px', borderRadius: '6px', border: '1px solid #28a745' }}>
                        <span style={{ ...labelStyle, color: '#155724' }}>📍 Chainage Gap Reason</span>
                        <p style={{ margin: '4px 0 0 0', color: '#155724' }}>{block.chainageGapReason}</p>
                      </div>
                    )}

                    {/* Time Lost */}
                    {block.timeLostReason && block.timeLostReason !== 'None' && (
                      <div style={{ marginBottom: '12px', backgroundColor: '#f8d7da', padding: '10px', borderRadius: '6px', border: '1px solid #dc3545' }}>
                        <span style={{ ...labelStyle, color: '#721c24' }}>⏱️ Time Lost</span>
                        <p style={{ margin: '4px 0 0 0', color: '#721c24' }}>
                          <strong>{block.timeLostReason}</strong> - {block.timeLostHours || 0} hours
                          {block.timeLostDetails && <><br />{block.timeLostDetails}</>}
                        </p>
                      </div>
                    )}

                    {/* Weld Data */}
                    {block.weldData && (
                      <div style={{ marginBottom: '16px', backgroundColor: '#fce4ec', padding: '12px', borderRadius: '6px', border: '1px solid #e91e63' }}>
                        <h4 style={{ margin: '0 0 12px 0', color: '#880e4f', fontSize: '14px', borderBottom: '2px solid #880e4f', paddingBottom: '8px' }}>🔥 Weld Data</h4>

                        {/* Weld Summary */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '12px', fontSize: '12px' }}>
                          {block.weldData.crewType && <div><span style={{ color: '#666' }}>Crew Type: </span><strong>{block.weldData.crewType}</strong></div>}
                          {block.weldData.weldMethod && <div><span style={{ color: '#666' }}>Weld Method: </span><strong>{block.weldData.weldMethod}</strong></div>}
                          {block.weldData.weldsToday !== undefined && <div><span style={{ color: '#666' }}>Welds Today: </span><strong>{block.weldData.weldsToday}</strong></div>}
                          {block.weldData.totalWelds !== undefined && <div><span style={{ color: '#666' }}>Total Welds: </span><strong>{block.weldData.totalWelds}</strong></div>}
                          {block.weldData.visualsFrom && <div><span style={{ color: '#666' }}>Visuals From: </span><strong>{block.weldData.visualsFrom}</strong></div>}
                          {block.weldData.visualsTo && <div><span style={{ color: '#666' }}>Visuals To: </span><strong>{block.weldData.visualsTo}</strong></div>}
                          {block.weldData.startTime && <div><span style={{ color: '#666' }}>Start Time: </span><strong>{block.weldData.startTime}</strong></div>}
                          {block.weldData.endTime && <div><span style={{ color: '#666' }}>End Time: </span><strong>{block.weldData.endTime}</strong></div>}
                        </div>

                        {/* Weld Entries Table */}
                        {block.weldData.weldEntries?.length > 0 && (
                          <div style={{ marginBottom: '12px' }}>
                            <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#880e4f' }}>Weld Entries ({block.weldData.weldEntries.length})</h5>
                            <div style={{ overflowX: 'auto' }}>
                              <table style={tableStyle}>
                                <thead>
                                  <tr style={{ backgroundColor: '#e91e63', color: 'white' }}>
                                    <th style={{ ...thStyle, backgroundColor: '#e91e63', color: 'white' }}>Weld #</th>
                                    <th style={{ ...thStyle, backgroundColor: '#e91e63', color: 'white' }}>Preheat</th>
                                    <th style={{ ...thStyle, backgroundColor: '#e91e63', color: 'white' }}>Pass</th>
                                    <th style={{ ...thStyle, backgroundColor: '#e91e63', color: 'white' }}>Side</th>
                                    <th style={{ ...thStyle, backgroundColor: '#e91e63', color: 'white' }}>Voltage</th>
                                    <th style={{ ...thStyle, backgroundColor: '#e91e63', color: 'white' }}>Amperage</th>
                                    <th style={{ ...thStyle, backgroundColor: '#e91e63', color: 'white' }}>Speed</th>
                                    <th style={{ ...thStyle, backgroundColor: '#e91e63', color: 'white' }}>Heat Input</th>
                                    <th style={{ ...thStyle, backgroundColor: '#e91e63', color: 'white' }}>WPS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {block.weldData.weldEntries.map((entry, eidx) => (
                                    <tr key={eidx} style={{ backgroundColor: eidx % 2 ? '#fff' : '#fce4ec' }}>
                                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold' }}>{entry.weldNumber || '-'}</td>
                                      <td style={{ ...tdStyle, textAlign: 'center' }}>{entry.preheat || '-'}°C</td>
                                      <td style={tdStyle}>{entry.pass || '-'}</td>
                                      <td style={tdStyle}>{entry.side || '-'}</td>
                                      <td style={{ ...tdStyle, textAlign: 'center' }}>{entry.voltage || '-'}V</td>
                                      <td style={{ ...tdStyle, textAlign: 'center' }}>{entry.amperage || '-'}A</td>
                                      <td style={{ ...tdStyle, textAlign: 'center' }}>{entry.travelSpeed || '-'}</td>
                                      <td style={{ ...tdStyle, textAlign: 'center' }}>{entry.heatInput || '-'}</td>
                                      <td style={tdStyle}>{entry.wpsId || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Repairs */}
                        {block.weldData.repairs?.length > 0 && (
                          <div style={{ backgroundColor: '#ffebee', padding: '10px', borderRadius: '4px' }}>
                            <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#c62828' }}>⚠️ Repairs ({block.weldData.repairs.length})</h5>
                            <table style={tableStyle}>
                              <thead>
                                <tr>
                                  <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Weld #</th>
                                  <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Defect Code</th>
                                  <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Defect Name</th>
                                  <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Clock Position</th>
                                  <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {block.weldData.repairs.map((repair, ridx) => (
                                  <tr key={ridx} style={{ backgroundColor: '#fff5f5' }}>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold' }}>{repair.weldNumber}</td>
                                    <td style={{ ...tdStyle, fontWeight: 'bold', color: '#dc3545' }}>{repair.defectCode}</td>
                                    <td style={tdStyle}>{repair.defectName}</td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>{repair.clockPosition || '-'}</td>
                                    <td style={tdStyle}>
                                      <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        backgroundColor: repair.status === 'completed' ? '#28a745' : '#ffc107',
                                        color: repair.status === 'completed' ? 'white' : '#000'
                                      }}>
                                        {repair.status || 'pending'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Tie-Ins */}
                        {block.weldData.tieIns?.length > 0 && (
                          <div style={{ marginTop: '12px' }}>
                            <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#880e4f' }}>Tie-Ins ({block.weldData.tieIns.length})</h5>
                            {block.weldData.tieIns.map((tieIn, tidx) => (
                              <div key={tidx} style={{ padding: '8px', backgroundColor: '#fff', borderRadius: '4px', marginBottom: '8px', border: '1px solid #ddd' }}>
                                <strong>{tieIn.weldNumber}</strong> - {tieIn.location || 'N/A'}
                                {tieIn.notes && <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#666' }}>{tieIn.notes}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Labour Entries */}
                    {block.labourEntries?.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#333' }}>👷 Manpower ({block.labourEntries.length})</h4>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={tableStyle}>
                            <thead>
                              <tr>
                                <th style={thStyle}>Name</th>
                                <th style={thStyle}>Classification</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>RT</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>OT</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>JH</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {block.labourEntries.map((entry, lidx) => {
                                const statusColors = {
                                  'ACTIVE': { bg: '#d4edda', color: '#155724' },
                                  'SYNC_DELAY': { bg: '#fff3cd', color: '#856404' },
                                  'MANAGEMENT_DRAG': { bg: '#f8d7da', color: '#721c24' }
                                }
                                const status = entry.productionStatus || 'ACTIVE'
                                const statusStyle = statusColors[status] || statusColors['ACTIVE']
                                return (
                                  <tr key={lidx} style={{ backgroundColor: lidx % 2 ? '#fff' : '#f8f9fa' }}>
                                    <td style={tdStyle}>{entry.employeeName || entry.name || '-'}</td>
                                    <td style={tdStyle}>{entry.classification || '-'}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{entry.count || 1}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{entry.rt || 0}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{entry.ot || 0}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{entry.jh || 0}</td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                                        {status === 'ACTIVE' ? 'Active' : status === 'SYNC_DELAY' ? 'Sync Delay' : 'Mgmt Drag'}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Equipment Entries */}
                    {block.equipmentEntries?.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#333' }}>🚜 Equipment ({block.equipmentEntries.length})</h4>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={tableStyle}>
                            <thead>
                              <tr>
                                <th style={thStyle}>Type</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Hours</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {block.equipmentEntries.map((entry, eidx) => {
                                const statusColors = {
                                  'ACTIVE': { bg: '#d4edda', color: '#155724' },
                                  'SYNC_DELAY': { bg: '#fff3cd', color: '#856404' },
                                  'MANAGEMENT_DRAG': { bg: '#f8d7da', color: '#721c24' }
                                }
                                const status = entry.productionStatus || 'ACTIVE'
                                const statusStyle = statusColors[status] || statusColors['ACTIVE']
                                return (
                                  <tr key={eidx} style={{ backgroundColor: eidx % 2 ? '#fff' : '#f8f9fa' }}>
                                    <td style={tdStyle}>{entry.type || '-'}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{entry.count || 1}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{entry.hours || 0}</td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                                        {status === 'ACTIVE' ? 'Active' : status === 'SYNC_DELAY' ? 'Sync Delay' : 'Mgmt Drag'}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Quality Data */}
                    {block.qualityData && Object.keys(block.qualityData).length > 0 && (
                      <div style={{ marginBottom: '16px', backgroundColor: '#fff3cd', padding: '12px', borderRadius: '6px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#856404' }}>⚙️ Quality Checks</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', fontSize: '12px' }}>
                          {Object.entries(block.qualityData).map(([key, value]) => (
                            value && (
                              <div key={key}>
                                <span style={{ color: '#666' }}>{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}: </span>
                                <strong>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}</strong>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Comments */}
                    {(block.comments || block.qualityComments) && (
                      <div style={{ backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
                        <span style={labelStyle}>Comments</span>
                        <p style={{ margin: '4px 0 0 0' }}>{block.comments || block.qualityComments}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* SAFETY NOTES */}
          {report.safety_notes && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle('#28a745')}>🦺 Safety Notes</div>
              <div style={{ padding: '16px' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{report.safety_notes}</p>
              </div>
            </div>
          )}

          {/* SAFETY RECOGNITION */}
          {report.safety_recognition?.enabled && report.safety_recognition?.cards?.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle('#ffc107')}>🏆 Safety Recognition</div>
              <div style={{ padding: '16px' }}>
                {report.safety_recognition.cards.map((card, idx) => (
                  <div key={idx} style={{ padding: '10px', backgroundColor: '#fff3cd', borderRadius: '6px', marginBottom: '8px' }}>
                    <strong>{card.employeeName}</strong> - {card.company || 'N/A'}
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>{card.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* WILDLIFE SIGHTINGS */}
          {report.wildlife_sighting?.enabled && report.wildlife_sighting?.sightings?.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle('#6f42c1')}>🦌 Wildlife Sightings</div>
              <div style={{ padding: '16px' }}>
                {report.wildlife_sighting.sightings.map((sighting, idx) => (
                  <div key={idx} style={{ padding: '10px', backgroundColor: '#f3e5f5', borderRadius: '6px', marginBottom: '8px' }}>
                    <strong>{sighting.species}</strong> - {sighting.count || 1} observed at KP {sighting.kpLocation || 'N/A'}
                    {sighting.notes && <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>{sighting.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LAND/ENVIRONMENT */}
          {report.land_environment && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle('#795548')}>🌲 Land/Environment</div>
              <div style={{ padding: '16px' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{report.land_environment}</p>
              </div>
            </div>
          )}

          {/* GENERAL COMMENTS */}
          {report.general_comments && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle('#607d8b')}>💬 General Comments</div>
              <div style={{ padding: '16px' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{report.general_comments}</p>
              </div>
            </div>
          )}

          {/* VISITORS */}
          {report.visitors?.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle('#00bcd4')}>👥 Visitors ({report.visitors.length})</div>
              <div style={{ padding: '16px' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Company</th>
                      <th style={thStyle}>Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.visitors.map((v, idx) => (
                      <tr key={idx}>
                        <td style={tdStyle}>{v.name}</td>
                        <td style={tdStyle}>{v.company || '-'}</td>
                        <td style={tdStyle}>{v.position || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* INSPECTOR EQUIPMENT */}
          {report.inspector_equipment?.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle('#9e9e9e')}>🔧 Inspector Equipment</div>
              <div style={{ padding: '16px' }}>
                <p style={{ margin: 0 }}>{report.inspector_equipment.join(', ')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!readOnly && (
          <div style={footerStyle}>
            <button
              onClick={onClose}
              disabled={processing}
              style={{
                padding: '12px 24px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => setShowRevisionModal(true)}
              disabled={processing}
              style={{
                padding: '12px 24px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              Request Revision
            </button>
            <button
              onClick={() => setShowSignaturePad(true)}
              disabled={processing}
              style={{
                padding: '12px 24px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              Approve & Sign
            </button>
          </div>
        )}
      </div>

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <SignaturePad
          onSave={handleApprove}
          onCancel={() => setShowSignaturePad(false)}
          signerName={userProfile?.full_name || 'Welding Chief'}
          signerRole="Welding Chief Inspector"
        />
      )}

      {/* Revision Notes Modal */}
      {showRevisionModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
          >
            <h2 style={{ margin: '0 0 8px 0', color: '#dc3545' }}>Request Revision</h2>
            <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: '14px' }}>
              Explain what changes are needed. The inspector will be notified.
            </p>

            <textarea
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder="Enter feedback for the inspector..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '14px',
                resize: 'vertical',
                marginBottom: '16px',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRevisionModal(false)
                  setRevisionNotes('')
                }}
                disabled={processing}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRevisionRequest}
                disabled={processing || !revisionNotes.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: revisionNotes.trim() && !processing ? '#dc3545' : '#adb5bd',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: revisionNotes.trim() && !processing ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                {processing ? 'Sending...' : 'Send Revision Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WeldingReportViewer
