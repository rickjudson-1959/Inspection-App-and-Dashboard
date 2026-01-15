import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'

// ============================================================================
// AUDITOR DASHBOARD - NDT Technical Review Workspace
// January 2026 - Pipe-Up Pipeline Inspector SaaS
// 
// Features:
// - Review Queue of welds pending NDT
// - Technical RT/UT data entry (density, sensitivity, gating, etc.)
// - Interpretation disagreement tracking
// - Welder performance monitoring
// - Read-only mode for Chief Inspector cross-linking
// ============================================================================

function AuditorDashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { signOut, userProfile } = useAuth()
  
  // Check if read-only mode (Chief Inspector viewing)
  const isReadOnly = searchParams.get('readonly') === 'true'
  const highlightWeldId = searchParams.get('weld')
  
  // Tab state
  const [activeTab, setActiveTab] = useState('queue')
  
  // Review Queue state
  const [pendingWelds, setPendingWelds] = useState([])
  const [completedInspections, setCompletedInspections] = useState([])
  const [queueLoading, setQueueLoading] = useState(true)
  
  // Selected weld for inspection
  const [selectedWeld, setSelectedWeld] = useState(null)
  const [showInspectionForm, setShowInspectionForm] = useState(false)
  
  // Inspection form state
  const [inspectionData, setInspectionData] = useState({
    method: 'RT',
    inspection_number: '',
    technician_name: '',
    technician_level: 'II',
    inspection_date: new Date().toISOString().split('T')[0],
    // RT specific
    film_density: '',
    source_type: 'Ir-192',
    source_size: '',
    sfd: '',
    exposure_time: '',
    film_type: '',
    screens: 'Lead',
    sensitivity: '',
    iqi_placement: 'Source Side',
    // UT specific
    instrument_model: '',
    probe_type: '',
    probe_frequency: '',
    couplant: 'Glycerin',
    calibration_block: '',
    tcg_applied: false,
    gate_start: '',
    gate_width: '',
    ref_level_db: '',
    // Results
    interpretation_result: '',
    defect_type: '',
    defect_location: '',
    defect_size: '',
    comments: '',
    // Level III review
    interpretation_agree: true,
    level3_reviewer: '',
    level3_comments: ''
  })
  const [saving, setSaving] = useState(false)
  
  // Disagreements state
  const [disagreements, setDisagreements] = useState([])
  const [disagreementsLoading, setDisagreementsLoading] = useState(false)
  
  // Stats
  const [stats, setStats] = useState({
    pendingCount: 0,
    completedToday: 0,
    completedWeek: 0,
    disagreementCount: 0
  })

  // ============================================================================
  // LIFECYCLE
  // ============================================================================
  useEffect(() => {
    fetchReviewQueue()
    fetchStats()
    
    // If weld ID in URL, scroll to and highlight it
    if (highlightWeldId) {
      setActiveTab('queue')
      // Will highlight after data loads
    }
  }, [])
  
  useEffect(() => {
    if (activeTab === 'disagreements') fetchDisagreements()
  }, [activeTab])
  
  useEffect(() => {
    // Highlight weld if specified in URL
    if (highlightWeldId && pendingWelds.length > 0) {
      const weld = pendingWelds.find(w => w.id === highlightWeldId)
      if (weld) {
        setSelectedWeld(weld)
        // Scroll to element
        setTimeout(() => {
          const element = document.getElementById(`weld-${highlightWeldId}`)
          if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
    }
  }, [highlightWeldId, pendingWelds])

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  async function fetchReviewQueue() {
    setQueueLoading(true)
    try {
      // Fetch welds pending NDT
      const { data: pending } = await supabase
        .from('weld_book')
        .select('*')
        .in('nde_status', ['pending', 'repair'])
        .order('weld_date', { ascending: false })
      
      setPendingWelds(pending || [])
      
      // Fetch completed inspections (last 7 days)
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      
      const { data: completed } = await supabase
        .from('ndt_inspections')
        .select(`
          *,
          weld:weld_book(weld_number, welder_name, kp, pipe_diameter)
        `)
        .gte('inspection_date', weekAgo.toISOString().split('T')[0])
        .order('inspection_date', { ascending: false })
        .limit(50)
      
      setCompletedInspections(completed || [])
    } catch (err) {
      console.error('Error fetching review queue:', err)
    }
    setQueueLoading(false)
  }

  async function fetchStats() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      
      // Pending count
      const { count: pendingCount } = await supabase
        .from('weld_book')
        .select('*', { count: 'exact', head: true })
        .in('nde_status', ['pending', 'repair'])
      
      // Completed today
      const { count: completedToday } = await supabase
        .from('ndt_inspections')
        .select('*', { count: 'exact', head: true })
        .eq('inspection_date', today)
      
      // Completed this week
      const { count: completedWeek } = await supabase
        .from('ndt_inspections')
        .select('*', { count: 'exact', head: true })
        .gte('inspection_date', weekAgo.toISOString().split('T')[0])
      
      // Disagreements
      const { count: disagreementCount } = await supabase
        .from('ndt_inspections')
        .select('*', { count: 'exact', head: true })
        .eq('interpretation_agree', false)
      
      setStats({
        pendingCount: pendingCount || 0,
        completedToday: completedToday || 0,
        completedWeek: completedWeek || 0,
        disagreementCount: disagreementCount || 0
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }

  async function fetchDisagreements() {
    setDisagreementsLoading(true)
    try {
      const { data } = await supabase
        .from('ndt_inspections')
        .select(`
          *,
          weld:weld_book(weld_number, welder_name, kp, pipe_diameter, wall_thickness)
        `)
        .eq('interpretation_agree', false)
        .order('inspection_date', { ascending: false })
      
      setDisagreements(data || [])
    } catch (err) {
      console.error('Error fetching disagreements:', err)
    }
    setDisagreementsLoading(false)
  }

  // ============================================================================
  // INSPECTION FORM HANDLERS
  // ============================================================================
  function openInspectionForm(weld) {
    if (isReadOnly) return
    
    setSelectedWeld(weld)
    setInspectionData({
      ...inspectionData,
      inspection_number: generateInspectionNumber(weld),
      inspection_date: new Date().toISOString().split('T')[0]
    })
    setShowInspectionForm(true)
  }

  function generateInspectionNumber(weld) {
    const prefix = inspectionData.method || 'RT'
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
    const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `${prefix}-${date}-${seq}`
  }

  function updateInspectionField(field, value) {
    setInspectionData(prev => ({ ...prev, [field]: value }))
    
    // Regenerate inspection number if method changes
    if (field === 'method' && selectedWeld) {
      const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
      setInspectionData(prev => ({
        ...prev,
        [field]: value,
        inspection_number: `${value}-${date}-${seq}`
      }))
    }
  }

  async function submitInspection() {
    if (!selectedWeld || !inspectionData.interpretation_result) {
      alert('Please complete all required fields')
      return
    }
    
    setSaving(true)
    try {
      // Insert inspection record
      const { error: inspectionError } = await supabase
        .from('ndt_inspections')
        .insert({
          weld_id: selectedWeld.id,
          inspection_number: inspectionData.inspection_number,
          method: inspectionData.method,
          inspection_date: inspectionData.inspection_date,
          technician_name: inspectionData.technician_name,
          technician_level: inspectionData.technician_level,
          film_density: inspectionData.film_density ? parseFloat(inspectionData.film_density) : null,
          source_type: inspectionData.source_type,
          exposure_time: inspectionData.exposure_time,
          interpretation_result: inspectionData.interpretation_result,
          interpretation_agree: inspectionData.interpretation_agree,
          level3_reviewer: inspectionData.level3_reviewer,
          defect_type: inspectionData.defect_type,
          defect_location: inspectionData.defect_location,
          defect_size: inspectionData.defect_size,
          comments: inspectionData.comments + (inspectionData.level3_comments ? `\n\nLevel III Notes: ${inspectionData.level3_comments}` : ''),
          created_by: userProfile?.id
        })
      
      if (inspectionError) throw inspectionError
      
      // Update weld status
      const newStatus = inspectionData.interpretation_result === 'accept' ? 'accept' : 
                        inspectionData.interpretation_result === 'repair' ? 'repair' : 'pending'
      const repairIncrement = inspectionData.interpretation_result === 'repair' ? 1 : 0
      
      const { error: weldError } = await supabase
        .from('weld_book')
        .update({
          nde_status: newStatus,
          repair_count: (selectedWeld.repair_count || 0) + repairIncrement,
          last_ndt_date: inspectionData.inspection_date,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedWeld.id)
      
      if (weldError) throw weldError
      
      alert('Inspection saved successfully!')
      setShowInspectionForm(false)
      setSelectedWeld(null)
      resetInspectionForm()
      fetchReviewQueue()
      fetchStats()
    } catch (err) {
      console.error('Error saving inspection:', err)
      alert('Error saving inspection: ' + err.message)
    }
    setSaving(false)
  }

  function resetInspectionForm() {
    setInspectionData({
      method: 'RT',
      inspection_number: '',
      technician_name: '',
      technician_level: 'II',
      inspection_date: new Date().toISOString().split('T')[0],
      film_density: '',
      source_type: 'Ir-192',
      source_size: '',
      sfd: '',
      exposure_time: '',
      film_type: '',
      screens: 'Lead',
      sensitivity: '',
      iqi_placement: 'Source Side',
      instrument_model: '',
      probe_type: '',
      probe_frequency: '',
      couplant: 'Glycerin',
      calibration_block: '',
      tcg_applied: false,
      gate_start: '',
      gate_width: '',
      ref_level_db: '',
      interpretation_result: '',
      defect_type: '',
      defect_location: '',
      defect_size: '',
      comments: '',
      interpretation_agree: true,
      level3_reviewer: '',
      level3_comments: ''
    })
  }

  // ============================================================================
  // STYLES
  // ============================================================================
  const tabStyle = (isActive) => ({
    padding: '12px 24px',
    backgroundColor: isActive ? '#6f42c1' : 'transparent',
    color: isActive ? 'white' : '#6f42c1',
    border: isActive ? 'none' : '1px solid #6f42c1',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: isActive ? 'bold' : 'normal',
    fontSize: '14px'
  })

  const cardStyle = { backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '20px', overflow: 'hidden' }
  const cardHeaderStyle = (color) => ({ backgroundColor: color, padding: '15px 20px', color: 'white' })
  const tableStyle = { width: '100%', borderCollapse: 'collapse' }
  const thStyle = { padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid #ddd', backgroundColor: '#f8f9fa', fontSize: '12px', fontWeight: 'bold' }
  const tdStyle = { padding: '12px 15px', borderBottom: '1px solid #eee', fontSize: '14px' }
  const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', color: '#495057' }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#6f42c1', color: 'white', padding: '20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px' }}>
              {isReadOnly ? '🔒 NDT Auditor Dashboard (Read-Only)' : '🔬 NDT Auditor Dashboard'}
            </h1>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>
              {userProfile?.full_name || userProfile?.email} • Technical Review Workspace
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {isReadOnly && (
              <span style={{ padding: '10px 20px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '4px', fontSize: '14px' }}>
                Viewing as Chief Inspector
              </span>
            )}
            <button onClick={() => navigate('/chief')} style={{ padding: '10px 20px', backgroundColor: '#1a5f2a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              ← Chief Dashboard
            </button>
            <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #ddd', padding: '15px 20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '30px', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ffc107' }}>{stats.pendingCount}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Pending Review</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>{stats.completedToday}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Completed Today</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#17a2b8' }}>{stats.completedWeek}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>This Week</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: stats.disagreementCount > 0 ? '#dc3545' : '#28a745' }}>{stats.disagreementCount}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Disagreements</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #ddd', padding: '15px 20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '10px' }}>
          <button style={tabStyle(activeTab === 'queue')} onClick={() => setActiveTab('queue')}>
            📋 Review Queue {stats.pendingCount > 0 && <span style={{ marginLeft: '8px', backgroundColor: '#ffc107', color: '#000', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{stats.pendingCount}</span>}
          </button>
          <button style={tabStyle(activeTab === 'completed')} onClick={() => setActiveTab('completed')}>✅ Completed</button>
          <button style={tabStyle(activeTab === 'disagreements')} onClick={() => setActiveTab('disagreements')}>
            ⚠️ Disagreements {stats.disagreementCount > 0 && <span style={{ marginLeft: '8px', backgroundColor: '#dc3545', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{stats.disagreementCount}</span>}
          </button>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* REVIEW QUEUE TAB */}
        {activeTab === 'queue' && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#ffc107')}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#000' }}>Welds Pending NDT Review</h2>
            </div>
            {queueLoading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>
            ) : pendingWelds.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p style={{ fontSize: '18px', margin: 0 }}>✅ All welds have been reviewed!</p>
              </div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Weld #</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>KP</th>
                    <th style={thStyle}>Welder</th>
                    <th style={thStyle}>Pipe</th>
                    <th style={thStyle}>Weld Date</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Repairs</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingWelds.map(weld => (
                    <tr 
                      key={weld.id} 
                      id={`weld-${weld.id}`}
                      style={{ 
                        backgroundColor: highlightWeldId === weld.id ? '#fff3cd' : 
                                        weld.nde_status === 'repair' ? '#f8d7da' : 'transparent'
                      }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 'bold', fontFamily: 'monospace' }}>{weld.weld_number}</td>
                      <td style={tdStyle}>{weld.weld_type}</td>
                      <td style={{ ...tdStyle, color: '#28a745', fontFamily: 'monospace' }}>{weld.kp?.toFixed(3)}</td>
                      <td style={tdStyle}>{weld.welder_name || weld.welder_id}</td>
                      <td style={{ ...tdStyle, fontSize: '12px' }}>{weld.pipe_diameter}" x {weld.wall_thickness}mm</td>
                      <td style={tdStyle}>{weld.weld_date}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          backgroundColor: weld.nde_status === 'repair' ? '#dc3545' : '#ffc107',
                          color: weld.nde_status === 'repair' ? 'white' : '#000'
                        }}>
                          {weld.nde_status?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: weld.repair_count > 0 ? '#dc3545' : '#666' }}>
                        {weld.repair_count || 0}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {isReadOnly ? (
                          <span style={{ color: '#666', fontSize: '12px' }}>View Only</span>
                        ) : (
                          <button
                            onClick={() => openInspectionForm(weld)}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#6f42c1',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 'bold'
                            }}
                          >
                            Enter NDT
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

        {/* COMPLETED TAB */}
        {activeTab === 'completed' && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#28a745')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Completed Inspections (Last 7 Days)</h2>
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Inspection #</th>
                  <th style={thStyle}>Weld #</th>
                  <th style={thStyle}>Method</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Technician</th>
                  <th style={thStyle}>Result</th>
                  <th style={thStyle}>Level III Agree</th>
                </tr>
              </thead>
              <tbody>
                {completedInspections.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#666' }}>No inspections completed recently</td></tr>
                ) : (
                  completedInspections.map(insp => (
                    <tr key={insp.id}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{insp.inspection_number}</td>
                      <td style={{ ...tdStyle, fontWeight: 'bold' }}>{insp.weld?.weld_number || '-'}</td>
                      <td style={tdStyle}>{insp.method}</td>
                      <td style={tdStyle}>{insp.inspection_date}</td>
                      <td style={tdStyle}>{insp.technician_name} ({insp.technician_level})</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          backgroundColor: insp.interpretation_result === 'accept' ? '#28a745' : '#dc3545',
                          color: 'white'
                        }}>
                          {insp.interpretation_result?.toUpperCase()}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {insp.interpretation_agree ? (
                          <span style={{ color: '#28a745' }}>✓ Yes</span>
                        ) : (
                          <span style={{ color: '#dc3545', fontWeight: 'bold' }}>✗ DISAGREE</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* DISAGREEMENTS TAB */}
        {activeTab === 'disagreements' && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#dc3545')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>⚠️ Interpretation Disagreements</h2>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>Cases where Level III reviewer disagreed with operator interpretation</p>
            </div>
            {disagreementsLoading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>
            ) : disagreements.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p style={{ fontSize: '18px', margin: 0 }}>✅ No interpretation disagreements</p>
              </div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Inspection #</th>
                    <th style={thStyle}>Weld</th>
                    <th style={thStyle}>Method</th>
                    <th style={thStyle}>Technician</th>
                    <th style={thStyle}>Operator Call</th>
                    <th style={thStyle}>Level III Reviewer</th>
                    <th style={thStyle}>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {disagreements.map(item => (
                    <tr key={item.id} style={{ backgroundColor: '#fff3cd' }}>
                      <td style={tdStyle}>{item.inspection_date}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{item.inspection_number}</td>
                      <td style={tdStyle}>
                        <strong>{item.weld?.weld_number}</strong>
                        <br />
                        <span style={{ fontSize: '11px', color: '#666' }}>KP {item.weld?.kp?.toFixed(3)}</span>
                      </td>
                      <td style={tdStyle}>{item.method}</td>
                      <td style={tdStyle}>{item.technician_name}</td>
                      <td style={{
                        ...tdStyle,
                        fontWeight: 'bold',
                        color: item.interpretation_result === 'accept' ? '#28a745' : '#dc3545'
                      }}>
                        {item.interpretation_result?.toUpperCase()}
                      </td>
                      <td style={tdStyle}>{item.level3_reviewer || '-'}</td>
                      <td style={{ ...tdStyle, fontSize: '12px', maxWidth: '250px' }}>{item.comments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ padding: '15px 20px', backgroundColor: '#f8f9fa', borderTop: '1px solid #dee2e6', fontSize: '12px', color: '#666' }}>
              🔒 This data is tracked for regulatory compliance and audit purposes.
            </div>
          </div>
        )}
      </div>

      {/* INSPECTION FORM MODAL */}
      {showInspectionForm && selectedWeld && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, overflow: 'auto', padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            {/* Form Header */}
            <div style={{ backgroundColor: '#6f42c1', padding: '20px', color: 'white' }}>
              <h2 style={{ margin: 0 }}>NDT Inspection Entry</h2>
              <p style={{ margin: '5px 0 0 0', opacity: 0.8 }}>
                Weld: <strong>{selectedWeld.weld_number}</strong> | KP: {selectedWeld.kp?.toFixed(3)} | Welder: {selectedWeld.welder_name}
              </p>
            </div>

            <div style={{ padding: '20px' }}>
              {/* Method Selection */}
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Inspection Method *</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {['RT', 'UT', 'MT', 'PT', 'VT', 'AUT'].map(method => (
                    <button
                      key={method}
                      onClick={() => updateInspectionField('method', method)}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: inspectionData.method === method ? '#6f42c1' : '#f8f9fa',
                        color: inspectionData.method === method ? 'white' : '#333',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: inspectionData.method === method ? 'bold' : 'normal'
                      }}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Basic Info Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Inspection Number</label>
                  <input type="text" value={inspectionData.inspection_number} onChange={e => updateInspectionField('inspection_number', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Date *</label>
                  <input type="date" value={inspectionData.inspection_date} onChange={e => updateInspectionField('inspection_date', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Technician Name *</label>
                  <input type="text" value={inspectionData.technician_name} onChange={e => updateInspectionField('technician_name', e.target.value)} style={inputStyle} placeholder="Enter name" />
                </div>
                <div>
                  <label style={labelStyle}>Level</label>
                  <select value={inspectionData.technician_level} onChange={e => updateInspectionField('technician_level', e.target.value)} style={inputStyle}>
                    <option value="I">Level I</option>
                    <option value="II">Level II</option>
                    <option value="III">Level III</option>
                  </select>
                </div>
              </div>

              {/* RT-Specific Fields */}
              {inspectionData.method === 'RT' && (
                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 15px 0', color: '#6f42c1' }}>Radiographic Testing Parameters</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                    <div>
                      <label style={labelStyle}>Film Density</label>
                      <input type="number" step="0.01" min="1.8" max="4.0" value={inspectionData.film_density} onChange={e => updateInspectionField('film_density', e.target.value)} style={inputStyle} placeholder="1.8 - 4.0" />
                    </div>
                    <div>
                      <label style={labelStyle}>Source Type</label>
                      <select value={inspectionData.source_type} onChange={e => updateInspectionField('source_type', e.target.value)} style={inputStyle}>
                        <option value="Ir-192">Ir-192</option>
                        <option value="Co-60">Co-60</option>
                        <option value="Se-75">Se-75</option>
                        <option value="X-Ray">X-Ray</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Source Size (Ci)</label>
                      <input type="text" value={inspectionData.source_size} onChange={e => updateInspectionField('source_size', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>SFD (mm)</label>
                      <input type="text" value={inspectionData.sfd} onChange={e => updateInspectionField('sfd', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Exposure Time</label>
                      <input type="text" value={inspectionData.exposure_time} onChange={e => updateInspectionField('exposure_time', e.target.value)} style={inputStyle} placeholder="e.g., 2m 30s" />
                    </div>
                    <div>
                      <label style={labelStyle}>Film Type</label>
                      <input type="text" value={inspectionData.film_type} onChange={e => updateInspectionField('film_type', e.target.value)} style={inputStyle} placeholder="e.g., D7" />
                    </div>
                    <div>
                      <label style={labelStyle}>Screens</label>
                      <select value={inspectionData.screens} onChange={e => updateInspectionField('screens', e.target.value)} style={inputStyle}>
                        <option value="Lead">Lead</option>
                        <option value="None">None</option>
                        <option value="Fluorescent">Fluorescent</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Sensitivity (%)</label>
                      <input type="text" value={inspectionData.sensitivity} onChange={e => updateInspectionField('sensitivity', e.target.value)} style={inputStyle} placeholder="e.g., 2%" />
                    </div>
                    <div>
                      <label style={labelStyle}>IQI Placement</label>
                      <select value={inspectionData.iqi_placement} onChange={e => updateInspectionField('iqi_placement', e.target.value)} style={inputStyle}>
                        <option value="Source Side">Source Side</option>
                        <option value="Film Side">Film Side</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* UT-Specific Fields */}
              {inspectionData.method === 'UT' && (
                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 15px 0', color: '#6f42c1' }}>Ultrasonic Testing Parameters</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                    <div>
                      <label style={labelStyle}>Instrument Model</label>
                      <input type="text" value={inspectionData.instrument_model} onChange={e => updateInspectionField('instrument_model', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Probe Type</label>
                      <input type="text" value={inspectionData.probe_type} onChange={e => updateInspectionField('probe_type', e.target.value)} style={inputStyle} placeholder="e.g., 45° / 60° / 70°" />
                    </div>
                    <div>
                      <label style={labelStyle}>Frequency (MHz)</label>
                      <input type="text" value={inspectionData.probe_frequency} onChange={e => updateInspectionField('probe_frequency', e.target.value)} style={inputStyle} placeholder="e.g., 2.25, 5.0" />
                    </div>
                    <div>
                      <label style={labelStyle}>Couplant</label>
                      <select value={inspectionData.couplant} onChange={e => updateInspectionField('couplant', e.target.value)} style={inputStyle}>
                        <option value="Glycerin">Glycerin</option>
                        <option value="Oil">Oil</option>
                        <option value="Water">Water</option>
                        <option value="Gel">Gel</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Calibration Block</label>
                      <input type="text" value={inspectionData.calibration_block} onChange={e => updateInspectionField('calibration_block', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Reference Level (dB)</label>
                      <input type="text" value={inspectionData.ref_level_db} onChange={e => updateInspectionField('ref_level_db', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Gate Start (mm)</label>
                      <input type="text" value={inspectionData.gate_start} onChange={e => updateInspectionField('gate_start', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Gate Width (mm)</label>
                      <input type="text" value={inspectionData.gate_width} onChange={e => updateInspectionField('gate_width', e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input type="checkbox" checked={inspectionData.tcg_applied} onChange={e => updateInspectionField('tcg_applied', e.target.checked)} id="tcg" />
                      <label htmlFor="tcg" style={{ fontSize: '14px' }}>TCG Applied</label>
                    </div>
                  </div>
                </div>
              )}

              {/* Interpretation Result */}
              <div style={{ backgroundColor: '#e7f3ff', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 15px 0', color: '#004085' }}>Interpretation & Results *</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '15px' }}>
                  <div>
                    <label style={labelStyle}>Interpretation Result *</label>
                    <select value={inspectionData.interpretation_result} onChange={e => updateInspectionField('interpretation_result', e.target.value)} style={{ ...inputStyle, borderColor: !inspectionData.interpretation_result ? '#dc3545' : '#ced4da' }}>
                      <option value="">-- Select --</option>
                      <option value="accept">ACCEPT</option>
                      <option value="reject">REJECT</option>
                      <option value="repair">REPAIR REQUIRED</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Defect Type (if any)</label>
                    <select value={inspectionData.defect_type} onChange={e => updateInspectionField('defect_type', e.target.value)} style={inputStyle}>
                      <option value="">None</option>
                      <option value="Porosity">Porosity</option>
                      <option value="Slag Inclusion">Slag Inclusion</option>
                      <option value="Lack of Fusion">Lack of Fusion</option>
                      <option value="Incomplete Penetration">Incomplete Penetration</option>
                      <option value="Crack">Crack</option>
                      <option value="Undercut">Undercut</option>
                      <option value="Burn Through">Burn Through</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Defect Location</label>
                    <input type="text" value={inspectionData.defect_location} onChange={e => updateInspectionField('defect_location', e.target.value)} style={inputStyle} placeholder="e.g., 3 o'clock, root" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Comments / Notes</label>
                  <textarea value={inspectionData.comments} onChange={e => updateInspectionField('comments', e.target.value)} style={{ ...inputStyle, height: '80px', resize: 'vertical' }} placeholder="Additional observations..." />
                </div>
              </div>

              {/* Level III Review Section */}
              <div style={{ backgroundColor: inspectionData.interpretation_agree ? '#d4edda' : '#f8d7da', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 15px 0', color: inspectionData.interpretation_agree ? '#155724' : '#721c24' }}>Level III Review</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={inspectionData.interpretation_agree} onChange={e => updateInspectionField('interpretation_agree', e.target.checked)} />
                    <span style={{ fontWeight: 'bold' }}>Level III agrees with interpretation</span>
                  </label>
                </div>
                {!inspectionData.interpretation_agree && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '15px' }}>
                    <div>
                      <label style={labelStyle}>Level III Reviewer Name *</label>
                      <input type="text" value={inspectionData.level3_reviewer} onChange={e => updateInspectionField('level3_reviewer', e.target.value)} style={inputStyle} placeholder="Enter reviewer name" />
                    </div>
                    <div>
                      <label style={labelStyle}>Level III Comments *</label>
                      <input type="text" value={inspectionData.level3_comments} onChange={e => updateInspectionField('level3_comments', e.target.value)} style={inputStyle} placeholder="Reason for disagreement" />
                    </div>
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowInspectionForm(false); resetInspectionForm() }} style={{ padding: '12px 24px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={submitInspection} disabled={saving || !inspectionData.interpretation_result} style={{ padding: '12px 24px', backgroundColor: saving ? '#6c757d' : '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                  {saving ? 'Saving...' : '💾 Save Inspection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AuditorDashboard
