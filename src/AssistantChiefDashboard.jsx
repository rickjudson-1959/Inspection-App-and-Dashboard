import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'

// ============================================================================
// ASSISTANT CHIEF INSPECTOR DASHBOARD
// January 2026 - Pipe-Up Pipeline Inspector SaaS
// 
// Roles & Responsibilities:
// - Review inspector reports (optional review - Chief can approve independently)
// - Assist with staff assignments and logistics
// - Track contractor deficiencies and rectification
// - Support inspectors with daily report preparation
// - Monitor contractor compliance
// - Interface with contractor supervisory staff
// ============================================================================

function AssistantChiefDashboard() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  
  // Tab state
  const [activeTab, setActiveTab] = useState('review')
  
  // =============================================
  // REPORT REVIEW STATE
  // =============================================
  const [pendingReports, setPendingReports] = useState([])
  const [reviewedByMe, setReviewedByMe] = useState([])
  const [reviewLoading, setReviewLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewStatus, setReviewStatus] = useState('reviewed') // reviewed, needs_revision, recommended
  
  // =============================================
  // STAFF ASSIGNMENTS STATE
  // =============================================
  const [inspectors, setInspectors] = useState([])
  const [assignments, setAssignments] = useState([])
  const [assignmentDate, setAssignmentDate] = useState(new Date().toISOString().split('T')[0])
  const [showAssignmentModal, setShowAssignmentModal] = useState(false)
  const [newAssignment, setNewAssignment] = useState({
    inspector_id: '',
    activity: '',
    kp_start: '',
    kp_end: '',
    notes: ''
  })
  
  // =============================================
  // DEFICIENCY TRACKING STATE
  // =============================================
  const [deficiencies, setDeficiencies] = useState([])
  const [deficiencyFilter, setDeficiencyFilter] = useState('open') // open, in_progress, resolved, all
  const [showDeficiencyModal, setShowDeficiencyModal] = useState(false)
  const [newDeficiency, setNewDeficiency] = useState({
    category: 'technical',
    description: '',
    location_kp: '',
    severity: 'minor',
    contractor_notified: false,
    due_date: ''
  })
  
  // =============================================
  // COMPLIANCE STATE
  // =============================================
  const [complianceIssues, setComplianceIssues] = useState([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  
  // =============================================
  // STATS
  // =============================================
  const [stats, setStats] = useState({
    pendingReview: 0,
    reviewedToday: 0,
    openDeficiencies: 0,
    activeInspectors: 0,
    complianceIssues: 0
  })

  // =============================================
  // LIFECYCLE
  // =============================================
  useEffect(() => {
    fetchAllData()
  }, [])
  
  useEffect(() => {
    if (activeTab === 'review') fetchPendingReports()
    if (activeTab === 'assignments') fetchAssignments()
    if (activeTab === 'deficiencies') fetchDeficiencies()
    if (activeTab === 'compliance') fetchComplianceIssues()
  }, [activeTab, deficiencyFilter, assignmentDate])

  async function fetchAllData() {
    await Promise.all([
      fetchPendingReports(),
      fetchInspectors(),
      fetchStats()
    ])
  }

  // =============================================
  // REPORT REVIEW FUNCTIONS
  // =============================================
  async function fetchPendingReports() {
    setReviewLoading(true)
    try {
      // Fetch reports pending review (submitted but not yet approved by Chief)
      const { data: pending } = await supabase
        .from('inspection_reports')
        .select(`
          *,
          inspector:profiles!inspection_reports_inspector_id_fkey(full_name, email)
        `)
        .eq('status', 'submitted')
        .order('report_date', { ascending: false })
      
      setPendingReports(pending || [])
      
      // Fetch reports I've reviewed today
      const today = new Date().toISOString().split('T')[0]
      const { data: reviewed } = await supabase
        .from('assistant_chief_reviews')
        .select(`
          *,
          report:inspection_reports(id, report_date, inspector_id, kp_start, kp_end)
        `)
        .eq('reviewer_id', userProfile?.id)
        .gte('reviewed_at', today)
      
      setReviewedByMe(reviewed || [])
    } catch (err) {
      console.error('Error fetching reports:', err)
    }
    setReviewLoading(false)
  }

  async function submitReview() {
    if (!selectedReport) return
    
    try {
      // Save review to assistant_chief_reviews table
      const { error } = await supabase
        .from('assistant_chief_reviews')
        .insert({
          report_id: selectedReport.id,
          reviewer_id: userProfile?.id,
          reviewer_name: userProfile?.full_name,
          status: reviewStatus,
          notes: reviewNotes,
          reviewed_at: new Date().toISOString()
        })
      
      if (error) throw error
      
      // If needs revision, update report status
      if (reviewStatus === 'needs_revision') {
        await supabase
          .from('inspection_reports')
          .update({ 
            assistant_review_status: 'needs_revision',
            assistant_review_notes: reviewNotes
          })
          .eq('id', selectedReport.id)
      }
      
      alert('Review submitted successfully!')
      setSelectedReport(null)
      setReviewNotes('')
      setReviewStatus('reviewed')
      fetchPendingReports()
      fetchStats()
    } catch (err) {
      console.error('Error submitting review:', err)
      alert('Error: ' + err.message)
    }
  }

  // =============================================
  // STAFF ASSIGNMENT FUNCTIONS
  // =============================================
  async function fetchInspectors() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('role', 'inspector')
        .order('full_name')
      
      setInspectors(data || [])
    } catch (err) {
      console.error('Error fetching inspectors:', err)
    }
  }

  async function fetchAssignments() {
    try {
      const { data } = await supabase
        .from('inspector_assignments')
        .select(`
          *,
          inspector:profiles(full_name, email)
        `)
        .eq('assignment_date', assignmentDate)
        .order('created_at', { ascending: false })
      
      setAssignments(data || [])
    } catch (err) {
      console.error('Error fetching assignments:', err)
    }
  }

  async function saveAssignment() {
    if (!newAssignment.inspector_id || !newAssignment.activity) {
      alert('Please select an inspector and activity')
      return
    }
    
    try {
      const { error } = await supabase
        .from('inspector_assignments')
        .insert({
          inspector_id: newAssignment.inspector_id,
          activity: newAssignment.activity,
          kp_start: newAssignment.kp_start ? parseFloat(newAssignment.kp_start) : null,
          kp_end: newAssignment.kp_end ? parseFloat(newAssignment.kp_end) : null,
          notes: newAssignment.notes,
          assignment_date: assignmentDate,
          assigned_by: userProfile?.id,
          created_at: new Date().toISOString()
        })
      
      if (error) throw error
      
      alert('Assignment saved!')
      setShowAssignmentModal(false)
      setNewAssignment({ inspector_id: '', activity: '', kp_start: '', kp_end: '', notes: '' })
      fetchAssignments()
    } catch (err) {
      console.error('Error saving assignment:', err)
      alert('Error: ' + err.message)
    }
  }

  // =============================================
  // DEFICIENCY TRACKING FUNCTIONS
  // =============================================
  async function fetchDeficiencies() {
    try {
      let query = supabase
        .from('contractor_deficiencies')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (deficiencyFilter !== 'all') {
        query = query.eq('status', deficiencyFilter)
      }
      
      const { data } = await query.limit(50)
      setDeficiencies(data || [])
    } catch (err) {
      console.error('Error fetching deficiencies:', err)
    }
  }

  async function saveDeficiency() {
    if (!newDeficiency.description) {
      alert('Please enter a description')
      return
    }
    
    try {
      const { error } = await supabase
        .from('contractor_deficiencies')
        .insert({
          category: newDeficiency.category,
          description: newDeficiency.description,
          location_kp: newDeficiency.location_kp ? parseFloat(newDeficiency.location_kp) : null,
          severity: newDeficiency.severity,
          contractor_notified: newDeficiency.contractor_notified,
          due_date: newDeficiency.due_date || null,
          status: 'open',
          reported_by: userProfile?.id,
          reported_by_name: userProfile?.full_name,
          created_at: new Date().toISOString()
        })
      
      if (error) throw error
      
      alert('Deficiency logged!')
      setShowDeficiencyModal(false)
      setNewDeficiency({ category: 'technical', description: '', location_kp: '', severity: 'minor', contractor_notified: false, due_date: '' })
      fetchDeficiencies()
      fetchStats()
    } catch (err) {
      console.error('Error saving deficiency:', err)
      alert('Error: ' + err.message)
    }
  }

  async function updateDeficiencyStatus(id, newStatus) {
    try {
      const updates = { status: newStatus }
      if (newStatus === 'resolved') {
        updates.resolved_at = new Date().toISOString()
        updates.resolved_by = userProfile?.id
      }
      
      const { error } = await supabase
        .from('contractor_deficiencies')
        .update(updates)
        .eq('id', id)
      
      if (error) throw error
      fetchDeficiencies()
      fetchStats()
    } catch (err) {
      console.error('Error updating deficiency:', err)
    }
  }

  // =============================================
  // COMPLIANCE FUNCTIONS
  // =============================================
  async function fetchComplianceIssues() {
    setComplianceLoading(true)
    try {
      // Aggregate compliance issues from various sources
      const { data: deficiencyData } = await supabase
        .from('contractor_deficiencies')
        .select('*')
        .in('category', ['safety', 'environmental', 'regulatory'])
        .eq('status', 'open')
      
      setComplianceIssues(deficiencyData || [])
    } catch (err) {
      console.error('Error fetching compliance:', err)
    }
    setComplianceLoading(false)
  }

  // =============================================
  // STATS
  // =============================================
  async function fetchStats() {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      // Pending reports
      const { count: pendingCount } = await supabase
        .from('inspection_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'submitted')
      
      // My reviews today
      const { count: reviewedCount } = await supabase
        .from('assistant_chief_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('reviewer_id', userProfile?.id)
        .gte('reviewed_at', today)
      
      // Open deficiencies
      const { count: deficiencyCount } = await supabase
        .from('contractor_deficiencies')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')
      
      // Active inspectors (with assignments today)
      const { count: inspectorCount } = await supabase
        .from('inspector_assignments')
        .select('inspector_id', { count: 'exact', head: true })
        .eq('assignment_date', today)
      
      setStats({
        pendingReview: pendingCount || 0,
        reviewedToday: reviewedCount || 0,
        openDeficiencies: deficiencyCount || 0,
        activeInspectors: inspectorCount || 0,
        complianceIssues: 0
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }

  // =============================================
  // STYLES
  // =============================================
  const tabStyle = (isActive) => ({
    padding: '15px 25px',
    backgroundColor: isActive ? '#2c5282' : 'transparent',
    color: isActive ? 'white' : '#2c5282',
    border: isActive ? 'none' : '1px solid #2c5282',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: isActive ? 'bold' : 'normal',
    fontSize: '14px'
  })
  
  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginBottom: '20px',
    overflow: 'hidden'
  }
  
  const cardHeaderStyle = (color) => ({
    backgroundColor: color,
    padding: '15px 20px',
    color: 'white'
  })
  
  const tableStyle = { width: '100%', borderCollapse: 'collapse' }
  const thStyle = { padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid #ddd', backgroundColor: '#f8f9fa', fontSize: '12px', fontWeight: 'bold' }
  const tdStyle = { padding: '12px 15px', borderBottom: '1px solid #eee', fontSize: '14px' }
  const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', color: '#495057' }
  const badgeStyle = (color) => ({ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', backgroundColor: color, color: 'white' })

  // =============================================
  // ACTIVITY OPTIONS
  // =============================================
  const activityOptions = [
    'Clearing', 'Grading', 'Stringing', 'Bending', 'Welding - Mainline',
    'Welding - Tie-ins', 'NDT', 'Coating', 'Lowering-In', 'Backfill',
    'Hydrostatic Testing', 'Cleanup', 'Restoration', 'HDD', 'Bore',
    'Road Crossing', 'Environmental Monitoring', 'Safety', 'General'
  ]

  // =============================================
  // RENDER
  // =============================================
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#2c5282', color: 'white', padding: '20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px' }}>👷 Assistant Chief Inspector Dashboard</h1>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>
              {userProfile?.full_name || userProfile?.email} • Support & Oversight
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => navigate('/chief')} style={{ padding: '10px 20px', backgroundColor: '#1a5f2a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Chief Dashboard
            </button>
            <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 20px', backgroundColor: '#4a5568', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Main Dashboard
            </button>
            <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #ddd', padding: '15px 20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '40px', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ffc107' }}>{stats.pendingReview}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Pending Review</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>{stats.reviewedToday}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Reviewed Today</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#17a2b8' }}>{stats.activeInspectors}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Inspectors Assigned</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: stats.openDeficiencies > 0 ? '#dc3545' : '#28a745' }}>{stats.openDeficiencies}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Open Deficiencies</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #ddd', padding: '15px 20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '10px' }}>
          <button style={tabStyle(activeTab === 'review')} onClick={() => setActiveTab('review')}>
            📋 Report Review {stats.pendingReview > 0 && <span style={{ marginLeft: '8px', backgroundColor: '#ffc107', color: '#000', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{stats.pendingReview}</span>}
          </button>
          <button style={tabStyle(activeTab === 'assignments')} onClick={() => setActiveTab('assignments')}>
            👥 Staff Assignments
          </button>
          <button style={tabStyle(activeTab === 'deficiencies')} onClick={() => setActiveTab('deficiencies')}>
            ⚠️ Deficiency Tracking {stats.openDeficiencies > 0 && <span style={{ marginLeft: '8px', backgroundColor: '#dc3545', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{stats.openDeficiencies}</span>}
          </button>
          <button style={tabStyle(activeTab === 'compliance')} onClick={() => setActiveTab('compliance')}>
            ✅ Compliance Monitor
          </button>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* ============================================= */}
        {/* REPORT REVIEW TAB */}
        {/* ============================================= */}
        {activeTab === 'review' && (
          <div style={{ display: 'grid', gridTemplateColumns: selectedReport ? '1fr 1fr' : '1fr', gap: '20px' }}>
            {/* Report List */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle('#ffc107')}>
                <h2 style={{ margin: 0, fontSize: '18px', color: '#000' }}>📋 Reports Pending Review</h2>
                <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#333' }}>
                  Review reports to assist inspectors • Chief can approve independently
                </p>
              </div>
              {reviewLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>
              ) : pendingReports.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  <p style={{ fontSize: '16px' }}>✅ All reports have been reviewed!</p>
                </div>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Inspector</th>
                      <th style={thStyle}>KP Range</th>
                      <th style={thStyle}>Status</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingReports.map(report => (
                      <tr key={report.id} style={{ backgroundColor: selectedReport?.id === report.id ? '#e7f3ff' : 'transparent' }}>
                        <td style={tdStyle}>{report.report_date}</td>
                        <td style={tdStyle}>{report.inspector?.full_name || 'Unknown'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                          {report.kp_start?.toFixed(3)} - {report.kp_end?.toFixed(3)}
                        </td>
                        <td style={tdStyle}>
                          <span style={badgeStyle('#ffc107')}>SUBMITTED</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button
                            onClick={() => setSelectedReport(report)}
                            style={{ padding: '6px 12px', backgroundColor: '#2c5282', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Review Panel */}
            {selectedReport && (
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#2c5282')}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>✍️ Review Report</h2>
                  <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                    {selectedReport.report_date} • {selectedReport.inspector?.full_name}
                  </p>
                </div>
                <div style={{ padding: '20px' }}>
                  {/* Report Summary */}
                  <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h4 style={{ margin: '0 0 10px 0' }}>Report Details</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
                      <div><strong>KP Range:</strong> {selectedReport.kp_start?.toFixed(3)} - {selectedReport.kp_end?.toFixed(3)}</div>
                      <div><strong>Weather:</strong> {selectedReport.weather_conditions || '-'}</div>
                      <div><strong>Submitted:</strong> {new Date(selectedReport.submitted_at || selectedReport.created_at).toLocaleString()}</div>
                    </div>
                    <button
                      onClick={() => navigate(`/report?id=${selectedReport.id}`)}
                      style={{ marginTop: '15px', padding: '8px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      View Full Report →
                    </button>
                  </div>

                  {/* Review Status */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>Review Status</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {[
                        { value: 'reviewed', label: '✓ Reviewed', color: '#28a745' },
                        { value: 'recommended', label: '⭐ Recommended for Approval', color: '#17a2b8' },
                        { value: 'needs_revision', label: '⚠️ Needs Revision', color: '#dc3545' }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setReviewStatus(opt.value)}
                          style={{
                            flex: 1,
                            padding: '12px',
                            backgroundColor: reviewStatus === opt.value ? opt.color : '#f8f9fa',
                            color: reviewStatus === opt.value ? 'white' : '#333',
                            border: `2px solid ${opt.color}`,
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: reviewStatus === opt.value ? 'bold' : 'normal'
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Review Notes */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>
                      Review Notes {reviewStatus === 'needs_revision' && <span style={{ color: '#dc3545' }}>* Required</span>}
                    </label>
                    <textarea
                      value={reviewNotes}
                      onChange={e => setReviewNotes(e.target.value)}
                      placeholder={reviewStatus === 'needs_revision' 
                        ? 'Describe what needs to be revised...' 
                        : 'Optional notes for the Chief Inspector or inspector...'}
                      style={{ ...inputStyle, height: '120px', resize: 'vertical' }}
                    />
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setSelectedReport(null); setReviewNotes(''); setReviewStatus('reviewed'); }}
                      style={{ padding: '12px 24px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitReview}
                      disabled={reviewStatus === 'needs_revision' && !reviewNotes.trim()}
                      style={{
                        padding: '12px 24px',
                        backgroundColor: reviewStatus === 'needs_revision' && !reviewNotes.trim() ? '#ccc' : '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: reviewStatus === 'needs_revision' && !reviewNotes.trim() ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Submit Review
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================= */}
        {/* STAFF ASSIGNMENTS TAB */}
        {/* ============================================= */}
        {activeTab === 'assignments' && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#17a2b8')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>👥 Inspector Assignments</h2>
                  <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                    Manage daily inspector work assignments
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={assignmentDate}
                    onChange={e => setAssignmentDate(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '4px', border: 'none' }}
                  />
                  <button
                    onClick={() => setShowAssignmentModal(true)}
                    style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    + Add Assignment
                  </button>
                </div>
              </div>
            </div>
            {assignments.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p>No assignments for {assignmentDate}</p>
                <button
                  onClick={() => setShowAssignmentModal(true)}
                  style={{ marginTop: '10px', padding: '10px 20px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Create First Assignment
                </button>
              </div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Inspector</th>
                    <th style={thStyle}>Activity</th>
                    <th style={thStyle}>KP Range</th>
                    <th style={thStyle}>Notes</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(a => (
                    <tr key={a.id}>
                      <td style={tdStyle}><strong>{a.inspector?.full_name}</strong></td>
                      <td style={tdStyle}>{a.activity}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                        {a.kp_start ? `${a.kp_start.toFixed(3)} - ${a.kp_end?.toFixed(3)}` : '-'}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '12px', maxWidth: '200px' }}>{a.notes || '-'}</td>
                      <td style={tdStyle}>
                        <span style={badgeStyle('#28a745')}>ASSIGNED</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ============================================= */}
        {/* DEFICIENCY TRACKING TAB */}
        {/* ============================================= */}
        {activeTab === 'deficiencies' && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#dc3545')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>⚠️ Contractor Deficiency Tracking</h2>
                  <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                    Track and monitor contractor deficiencies and rectification
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <select
                    value={deficiencyFilter}
                    onChange={e => setDeficiencyFilter(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '4px', border: 'none' }}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="all">All</option>
                  </select>
                  <button
                    onClick={() => setShowDeficiencyModal(true)}
                    style={{ padding: '10px 20px', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    + Log Deficiency
                  </button>
                </div>
              </div>
            </div>
            {deficiencies.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p>No {deficiencyFilter === 'all' ? '' : deficiencyFilter} deficiencies found</p>
              </div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Location</th>
                    <th style={thStyle}>Severity</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deficiencies.map(d => (
                    <tr key={d.id}>
                      <td style={tdStyle}>{new Date(d.created_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>
                        <span style={badgeStyle(
                          d.category === 'safety' ? '#dc3545' :
                          d.category === 'environmental' ? '#28a745' :
                          d.category === 'technical' ? '#17a2b8' : '#6c757d'
                        )}>
                          {d.category?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: '250px' }}>{d.description}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{d.location_kp ? `KP ${d.location_kp.toFixed(3)}` : '-'}</td>
                      <td style={tdStyle}>
                        <span style={badgeStyle(
                          d.severity === 'critical' ? '#dc3545' :
                          d.severity === 'major' ? '#ffc107' : '#28a745'
                        )}>
                          {d.severity?.toUpperCase()}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={badgeStyle(
                          d.status === 'open' ? '#dc3545' :
                          d.status === 'in_progress' ? '#ffc107' : '#28a745'
                        )}>
                          {d.status?.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {d.status === 'open' && (
                          <button onClick={() => updateDeficiencyStatus(d.id, 'in_progress')} style={{ padding: '4px 8px', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '5px', fontSize: '11px' }}>
                            Start
                          </button>
                        )}
                        {d.status === 'in_progress' && (
                          <button onClick={() => updateDeficiencyStatus(d.id, 'resolved')} style={{ padding: '4px 8px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ============================================= */}
        {/* COMPLIANCE TAB */}
        {/* ============================================= */}
        {activeTab === 'compliance' && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#28a745')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>✅ Contractor Compliance Monitor</h2>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                Monitor contractor compliance with contract requirements
              </p>
            </div>
            <div style={{ padding: '20px' }}>
              {complianceLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
              ) : complianceIssues.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#28a745' }}>
                  <p style={{ fontSize: '18px', margin: 0 }}>✅ No open compliance issues</p>
                  <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
                    All safety, environmental, and regulatory items are in compliance
                  </p>
                </div>
              ) : (
                <div>
                  <h4 style={{ marginTop: 0 }}>⚠️ Open Compliance Issues ({complianceIssues.length})</h4>
                  {complianceIssues.map(issue => (
                    <div key={issue.id} style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', marginBottom: '10px', borderLeft: '4px solid #ffc107' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                          <span style={badgeStyle(
                            issue.category === 'safety' ? '#dc3545' :
                            issue.category === 'environmental' ? '#28a745' : '#17a2b8'
                          )}>
                            {issue.category?.toUpperCase()}
                          </span>
                          <p style={{ margin: '10px 0 5px 0', fontWeight: 'bold' }}>{issue.description}</p>
                          <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                            {issue.location_kp ? `KP ${issue.location_kp.toFixed(3)} • ` : ''}
                            Reported {new Date(issue.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => updateDeficiencyStatus(issue.id, 'in_progress')}
                          style={{ padding: '8px 16px', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Address Issue
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ============================================= */}
      {/* ASSIGNMENT MODAL */}
      {/* ============================================= */}
      {showAssignmentModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '500px', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ backgroundColor: '#17a2b8', padding: '20px', color: 'white' }}>
              <h2 style={{ margin: 0 }}>Add Inspector Assignment</h2>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={labelStyle}>Inspector *</label>
                <select value={newAssignment.inspector_id} onChange={e => setNewAssignment({ ...newAssignment, inspector_id: e.target.value })} style={inputStyle}>
                  <option value="">-- Select Inspector --</option>
                  {inspectors.map(i => (
                    <option key={i.id} value={i.id}>{i.full_name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={labelStyle}>Activity *</label>
                <select value={newAssignment.activity} onChange={e => setNewAssignment({ ...newAssignment, activity: e.target.value })} style={inputStyle}>
                  <option value="">-- Select Activity --</option>
                  {activityOptions.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={labelStyle}>KP Start</label>
                  <input type="number" step="0.001" value={newAssignment.kp_start} onChange={e => setNewAssignment({ ...newAssignment, kp_start: e.target.value })} style={inputStyle} placeholder="0.000" />
                </div>
                <div>
                  <label style={labelStyle}>KP End</label>
                  <input type="number" step="0.001" value={newAssignment.kp_end} onChange={e => setNewAssignment({ ...newAssignment, kp_end: e.target.value })} style={inputStyle} placeholder="0.000" />
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={newAssignment.notes} onChange={e => setNewAssignment({ ...newAssignment, notes: e.target.value })} style={{ ...inputStyle, height: '80px' }} placeholder="Special instructions..." />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAssignmentModal(false)} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveAssignment} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Save Assignment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================= */}
      {/* DEFICIENCY MODAL */}
      {/* ============================================= */}
      {showDeficiencyModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '500px', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ backgroundColor: '#dc3545', padding: '20px', color: 'white' }}>
              <h2 style={{ margin: 0 }}>Log Contractor Deficiency</h2>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={labelStyle}>Category *</label>
                  <select value={newDeficiency.category} onChange={e => setNewDeficiency({ ...newDeficiency, category: e.target.value })} style={inputStyle}>
                    <option value="technical">Technical</option>
                    <option value="safety">Safety</option>
                    <option value="environmental">Environmental</option>
                    <option value="regulatory">Regulatory</option>
                    <option value="quality">Quality</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Severity *</label>
                  <select value={newDeficiency.severity} onChange={e => setNewDeficiency({ ...newDeficiency, severity: e.target.value })} style={inputStyle}>
                    <option value="minor">Minor</option>
                    <option value="major">Major</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={labelStyle}>Description *</label>
                <textarea value={newDeficiency.description} onChange={e => setNewDeficiency({ ...newDeficiency, description: e.target.value })} style={{ ...inputStyle, height: '100px' }} placeholder="Describe the deficiency..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={labelStyle}>Location (KP)</label>
                  <input type="number" step="0.001" value={newDeficiency.location_kp} onChange={e => setNewDeficiency({ ...newDeficiency, location_kp: e.target.value })} style={inputStyle} placeholder="0.000" />
                </div>
                <div>
                  <label style={labelStyle}>Due Date</label>
                  <input type="date" value={newDeficiency.due_date} onChange={e => setNewDeficiency({ ...newDeficiency, due_date: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={newDeficiency.contractor_notified} onChange={e => setNewDeficiency({ ...newDeficiency, contractor_notified: e.target.checked })} />
                  Contractor has been notified
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowDeficiencyModal(false)} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveDeficiency} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Log Deficiency</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AssistantChiefDashboard
