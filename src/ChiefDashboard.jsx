import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'

function ChiefDashboard() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  
  const [pendingReports, setPendingReports] = useState([])
  const [approvedReports, setApprovedReports] = useState([])
  const [rejectedReports, setRejectedReports] = useState([])
  const [loading, setLoading] = useState(true)
  
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingReport, setRejectingReport] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  
  const [stats, setStats] = useState({ reviewedThisWeek: 0, approvedThisWeek: 0, rejectedThisWeek: 0 })

  useEffect(() => { fetchAllData() }, [])

  async function fetchAllData() {
    setLoading(true)
    await Promise.all([fetchPendingReports(), fetchApprovedReports(), fetchRejectedReports(), fetchStats()])
    setLoading(false)
  }

  async function fetchPendingReports() {
    try {
      const { data: statusData } = await supabase.from('report_status').select('*').eq('status', 'submitted').order('submitted_at', { ascending: true })
      const reportsWithData = []
      for (const status of (statusData || [])) {
        const { data: ticket } = await supabase.from('daily_tickets').select('*').eq('id', status.report_id).single()
        if (ticket) reportsWithData.push({ ...status, ticket })
      }
      setPendingReports(reportsWithData)
    } catch (err) { console.error('Error:', err) }
  }

  async function fetchApprovedReports() {
    try {
      const { data: statusData } = await supabase.from('report_status').select('*').eq('status', 'approved').order('reviewed_at', { ascending: false }).limit(10)
      const reportsWithData = []
      for (const status of (statusData || [])) {
        const { data: ticket } = await supabase.from('daily_tickets').select('*').eq('id', status.report_id).single()
        if (ticket) reportsWithData.push({ ...status, ticket })
      }
      setApprovedReports(reportsWithData)
    } catch (err) { console.error('Error:', err) }
  }

  async function fetchRejectedReports() {
    try {
      const { data: statusData } = await supabase.from('report_status').select('*').eq('status', 'revision_requested').order('reviewed_at', { ascending: false })
      const reportsWithData = []
      for (const status of (statusData || [])) {
        const { data: ticket } = await supabase.from('daily_tickets').select('*').eq('id', status.report_id).single()
        if (ticket) reportsWithData.push({ ...status, ticket })
      }
      setRejectedReports(reportsWithData)
    } catch (err) { console.error('Error:', err) }
  }

  async function fetchStats() {
    try {
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      const { data: auditData } = await supabase.from('report_audit_log').select('change_type').gte('changed_at', oneWeekAgo.toISOString()).in('change_type', ['approve', 'revision_request'])
      const approved = (auditData || []).filter(a => a.change_type === 'approve').length
      const rejected = (auditData || []).filter(a => a.change_type === 'revision_request').length
      setStats({ reviewedThisWeek: approved + rejected, approvedThisWeek: approved, rejectedThisWeek: rejected })
    } catch (err) { console.error('Error:', err) }
  }

  async function acceptReport(reportId) {
    if (!confirm('Accept this report?')) return
    try {
      const now = new Date().toISOString()
      await supabase.from('report_status').update({ status: 'approved', reviewed_at: now, reviewed_by: userProfile?.id, reviewed_by_name: userProfile?.full_name || userProfile?.email, review_decision: 'approved', updated_at: now }).eq('report_id', reportId)
      await supabase.from('report_audit_log').insert({ report_id: reportId, changed_by: userProfile?.id, changed_by_name: userProfile?.full_name || userProfile?.email, changed_by_role: userProfile?.role, change_type: 'approve' })
      fetchAllData()
    } catch (err) { console.error('Error:', err); alert('Error accepting report') }
  }

  function openRejectModal(report) {
    setRejectingReport(report)
    setRejectionReason('')
    setShowRejectModal(true)
  }

  async function submitRejection() {
    if (!rejectionReason.trim()) { alert('Please enter a reason'); return }
    try {
      const now = new Date().toISOString()
      await supabase.from('report_status').update({ status: 'revision_requested', reviewed_at: now, reviewed_by: userProfile?.id, reviewed_by_name: userProfile?.full_name || userProfile?.email, review_decision: 'revision_requested', revision_notes: rejectionReason, updated_at: now }).eq('report_id', rejectingReport.report_id)
      await supabase.from('report_audit_log').insert({ report_id: rejectingReport.report_id, changed_by: userProfile?.id, changed_by_name: userProfile?.full_name || userProfile?.email, changed_by_role: userProfile?.role, change_type: 'revision_request', change_reason: rejectionReason })
      setShowRejectModal(false)
      setRejectingReport(null)
      setRejectionReason('')
      fetchAllData()
    } catch (err) { console.error('Error:', err); alert('Error rejecting report') }
  }

  const formatDateTime = (dateStr) => dateStr ? new Date(dateStr).toLocaleString() : ''
  const getKPRange = (activities) => {
    if (!activities || activities.length === 0) return '-'
    const starts = activities.map(a => a.startKP).filter(Boolean)
    const ends = activities.map(a => a.endKP).filter(Boolean)
    if (starts.length === 0 && ends.length === 0) return '-'
    return starts[0] + ' - ' + ends[ends.length - 1]
  }

  if (loading) return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ backgroundColor: '#1a5f2a', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>Chief Inspector Dashboard</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>{userProfile?.full_name || userProfile?.email}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => navigate('/inspector')} style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>New Report</button>
          <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div style={{ backgroundColor: '#fff3cd', padding: '25px', borderRadius: '8px', textAlign: 'center', border: '1px solid #ffc107' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#856404', fontSize: '14px' }}>PENDING REVIEW</h3>
            <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#856404' }}>{pendingReports.length}</p>
          </div>
          <div style={{ backgroundColor: '#d4edda', padding: '25px', borderRadius: '8px', textAlign: 'center', border: '1px solid #28a745' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#155724', fontSize: '14px' }}>APPROVED THIS WEEK</h3>
            <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#155724' }}>{stats.approvedThisWeek}</p>
          </div>
          <div style={{ backgroundColor: '#f8d7da', padding: '25px', borderRadius: '8px', textAlign: 'center', border: '1px solid #dc3545' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#721c24', fontSize: '14px' }}>RETURNED FOR REVISION</h3>
            <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#721c24' }}>{stats.rejectedThisWeek}</p>
          </div>
          <div style={{ backgroundColor: '#e7f3ff', padding: '25px', borderRadius: '8px', textAlign: 'center', border: '1px solid #007bff' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#004085', fontSize: '14px' }}>TOTAL REVIEWED</h3>
            <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#004085' }}>{stats.reviewedThisWeek}</p>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
          <div style={{ backgroundColor: '#ffc107', padding: '15px 20px', borderRadius: '8px 8px 0 0' }}>
            <h2 style={{ margin: 0, color: '#000', fontSize: '18px' }}>Reports Awaiting Your Review</h2>
          </div>
          {pendingReports.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              <p style={{ fontSize: '18px', margin: 0 }}>All caught up! No reports pending.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date</th>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Inspector</th>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Spread</th>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Activities</th>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>KP Range</th>
                  <th style={{ padding: '15px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingReports.map(report => (
                  <tr key={report.report_id}>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>{report.ticket?.date}</td>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.submitted_by_name || report.ticket?.inspector_name}</td>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.ticket?.spread || '-'}</td>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{(report.ticket?.activity_blocks || []).map(b => b.activityType).filter(Boolean).join(', ') || '-'}</td>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontFamily: 'monospace', color: '#28a745' }}>{getKPRange(report.ticket?.activity_blocks)}</td>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                      <button onClick={() => acceptReport(report.report_id)} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px', fontWeight: 'bold' }}>Accept</button>
                      <button onClick={() => openRejectModal(report)} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {rejectedReports.length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
            <div style={{ backgroundColor: '#dc3545', padding: '15px 20px', borderRadius: '8px 8px 0 0' }}>
              <h2 style={{ margin: 0, color: 'white', fontSize: '18px' }}>Returned for Revision</h2>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date</th>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Inspector</th>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rejectedReports.map(report => (
                  <tr key={report.report_id}>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.ticket?.date}</td>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.submitted_by_name || report.ticket?.inspector_name}</td>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee', color: '#dc3545', fontStyle: 'italic' }}>"{report.revision_notes}"</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {approvedReports.length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <div style={{ backgroundColor: '#28a745', padding: '15px 20px', borderRadius: '8px 8px 0 0' }}>
              <h2 style={{ margin: 0, color: 'white', fontSize: '18px' }}>Recently Approved</h2>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date</th>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Inspector</th>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Activities</th>
                  <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Approved On</th>
                </tr>
              </thead>
              <tbody>
                {approvedReports.map(report => (
                  <tr key={report.report_id}>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.ticket?.date}</td>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.submitted_by_name || report.ticket?.inspector_name}</td>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{(report.ticket?.activity_blocks || []).map(b => b.activityType).filter(Boolean).join(', ') || '-'}</td>
                    <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontSize: '12px', color: '#666' }}>{formatDateTime(report.reviewed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRejectModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '30px', maxWidth: '500px', width: '90%' }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#dc3545' }}>Reject Report</h2>
            <p style={{ color: '#666', marginBottom: '15px' }}>Report from <strong>{rejectingReport?.ticket?.inspector_name}</strong> on <strong>{rejectingReport?.ticket?.date}</strong></p>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>Reason for rejection:</label>
            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain what needs to be corrected..." style={{ width: '100%', height: '120px', padding: '12px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRejectModal(false)} style={{ padding: '12px 24px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitRejection} style={{ padding: '12px 24px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Send Back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChiefDashboard
