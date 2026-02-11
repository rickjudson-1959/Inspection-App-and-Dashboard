import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { useOrgPath, useOrg } from './contexts/OrgContext.jsx'
import AIAgentStatusIcon from './components/AIAgentStatusIcon.jsx'
import { supabase } from './supabase'
import {
  PRECISION_MAP,
  roundToPrecision,
  valuesAreDifferent,
  logFieldChange,
  logStatusChange,
  getPrecision
} from './auditLoggerV3.js'

// ============================================================================
// NDT AUDITOR DASHBOARD - Technical Weld Review Workspace
// January 2026 - Pipe-Up Pipeline Inspector SaaS
// 
// Purpose: Specialized workspace for NDT Level II/III technicians to:
// - Review welds pending NDT inspection
// - Enter RT/UT technical parameters with precision controls
// - Track interpretation agreements/disagreements
// - View geotagged weld photos with metadata overlays
// ============================================================================

function NDTAuditorDashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { signOut, userProfile } = useAuth()
  const { orgPath } = useOrgPath()
  const { currentOrg } = useOrg()
  const organizationId = currentOrg?.id
  
  // Read-only mode for Chief Inspector or Welding Chief cross-linking
  const userRole = userProfile?.role || userProfile?.user_role
  const isWeldingChief = userRole === 'welding_chief'
  const isReadOnly = searchParams.get('readonly') === 'true' || isWeldingChief
  const highlightWeldId = searchParams.get('weld')
  const fromPage = searchParams.get('from') // Track where user came from
  
  // ============================================================================
  // STATE
  // ============================================================================
  
  // Review Queue
  const [reviewQueue, setReviewQueue] = useState([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [selectedWeld, setSelectedWeld] = useState(null)
  const [filterMethod, setFilterMethod] = useState('all') // all, RT, UT, AUT
  
  // Technical Inspection Data
  const [contractorData, setContractorData] = useState(null)
  const [auditorData, setAuditorData] = useState({
    // RT Parameters
    density_base: '',
    density_weld: '',
    sensitivity: '',
    technique: 'SWSI', // SWSI, DWSI, DWE
    source_type: 'Ir-192',
    source_size: '',
    sfd: '',
    ofd: '',
    film_type: '',
    screens: 'Lead',
    iqi_type: '',
    iqi_essential_hole: '',
    // UT Parameters (AUT/Manual)
    strip_chart_id: '',
    crawler_speed: '',
    probe_frequency: '',
    probe_angle: '',
    calibration_block: '',
    ref_level_db: '',
    tcg_applied: false,
    gate_a_start: '',
    gate_a_width: '',
    gate_a_threshold: '',
    gate_b_start: '',
    gate_b_width: '',
    gate_b_threshold: '',
    couplant: 'Glycerin',
    scan_coverage: '',
    // Geometric Unsharpness Calculator
    focal_spot_size: '',
    source_object_distance: '',
    calculated_ug: null,
    // Results
    interpretation_result: '',
    defect_type: '',
    defect_location: '',
    defect_length: '',
    defect_height: '',
    // Agreement
    interpretation_agree: true,
    disagreement_reason: '',
    level3_reviewer: '',
    // Metadata
    inspection_date: new Date().toISOString().split('T')[0],
    technician_name: '',
    technician_level: 'II'
  })
  
  // Original values ref for audit tracking
  const originalValuesRef = useRef({})
  
  // Weld Photos
  const [weldPhotos, setWeldPhotos] = useState([])
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  
  // UI State
  const [saving, setSaving] = useState(false)
  const [showUgCalculator, setShowUgCalculator] = useState(false)
  const [activeTab, setActiveTab] = useState('inspection') // inspection, photos, history
  
  // Stats
  const [stats, setStats] = useState({
    pendingRT: 0,
    pendingUT: 0,
    pendingAUT: 0,
    completedToday: 0,
    disagreements: 0
  })

  // ============================================================================
  // LIFECYCLE
  // ============================================================================
  
  useEffect(() => {
    fetchReviewQueue()
    fetchStats()
  }, [filterMethod])
  
  useEffect(() => {
    if (highlightWeldId) {
      loadWeldForReview(highlightWeldId)
    }
  }, [highlightWeldId, reviewQueue])
  
  useEffect(() => {
    if (selectedWeld) {
      fetchWeldPhotos(selectedWeld.id)
      loadContractorSubmission(selectedWeld.id)
    }
  }, [selectedWeld])

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  
  async function fetchReviewQueue() {
    setQueueLoading(true)
    try {
      let query = supabase
        .from('ndt_inspections')
        .select(`
          *,
          weld:weld_book(
            id, weld_number, weld_type, kp, welder_name, welder_id,
            pipe_diameter, wall_thickness, pipe_grade, weld_date,
            nde_status, repair_count
          )
        `)
        .or('status.eq.pending_review,status.is.null')
        .order('created_at', { ascending: false })
      
      if (filterMethod !== 'all') {
        query = query.eq('method', filterMethod)
      }
      
      const { data, error } = await query.limit(50)
      
      if (error) {
        // If ndt_inspections doesn't have status column, try alternate query
        const { data: altData } = await supabase
          .from('weld_book')
          .select('*')
          .in('nde_status', ['pending', 'repair'])
          .order('weld_date', { ascending: false })
          .limit(50)
        
        setReviewQueue((altData || []).map(w => ({
          id: `temp-${w.id}`,
          weld_id: w.id,
          weld: w,
          method: 'RT', // Default
          status: 'pending_review'
        })))
      } else {
        setReviewQueue(data || [])
      }
    } catch (err) {
      console.error('Error fetching review queue:', err)
    }
    setQueueLoading(false)
  }
  
  async function fetchStats() {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      // Count by method
      const { data: methodCounts } = await supabase
        .from('weld_book')
        .select('id')
        .in('nde_status', ['pending', 'repair'])
      
      // For now, estimate distribution
      const total = methodCounts?.length || 0
      setStats({
        pendingRT: Math.floor(total * 0.6),
        pendingUT: Math.floor(total * 0.2),
        pendingAUT: Math.floor(total * 0.2),
        completedToday: 0,
        disagreements: 0
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }
  
  async function loadWeldForReview(weldId) {
    const found = reviewQueue.find(r => r.weld?.id === weldId || r.weld_id === weldId)
    if (found) {
      setSelectedWeld(found.weld || found)
      // Scroll to weld in sidebar
      setTimeout(() => {
        const el = document.getElementById(`queue-item-${weldId}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }
  
  async function loadContractorSubmission(weldId) {
    try {
      // Load any existing contractor-submitted NDT data
      const { data } = await supabase
        .from('ndt_inspections')
        .select('*')
        .eq('weld_id', weldId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (data) {
        setContractorData(data)
        // Pre-fill auditor form with contractor data for comparison
        setAuditorData(prev => ({
          ...prev,
          method: data.method || 'RT',
          density_base: data.density_base || '',
          density_weld: data.film_density || data.density_weld || '',
          sensitivity: data.sensitivity || '',
          technique: data.technique || 'SWSI',
          interpretation_result: '', // Auditor must make own call
          technician_name: userProfile?.full_name || ''
        }))
        // Store original values for audit
        originalValuesRef.current = { ...data }
      }
    } catch (err) {
      // No existing submission, that's okay
      setContractorData(null)
    }
  }
  
  async function fetchWeldPhotos(weldId) {
    try {
      const { data } = await supabase
        .from('inspection_photos')
        .select('*')
        .or(`weld_id.eq.${weldId},metadata->weld_id.eq.${weldId}`)
        .order('taken_at', { ascending: false })
      
      setWeldPhotos(data || [])
    } catch (err) {
      console.error('Error fetching photos:', err)
      setWeldPhotos([])
    }
  }

  // ============================================================================
  // GEOMETRIC UNSHARPNESS CALCULATOR
  // Ug = Fd / D where:
  // F = focal spot size (mm)
  // d = object-to-film distance (mm)  
  // D = source-to-object distance (mm)
  // ============================================================================
  
  const calculateGeometricUnsharpness = useCallback(() => {
    const F = parseFloat(auditorData.focal_spot_size)
    const D = parseFloat(auditorData.source_object_distance)
    const d = parseFloat(auditorData.ofd) // Object-to-film distance
    
    if (F > 0 && D > 0 && d >= 0) {
      const Ug = (F * d) / D
      const roundedUg = roundToPrecision(Ug, 'geometric_unsharpness')
      setAuditorData(prev => ({ ...prev, calculated_ug: roundedUg }))
      return roundedUg
    }
    return null
  }, [auditorData.focal_spot_size, auditorData.source_object_distance, auditorData.ofd])
  
  useEffect(() => {
    if (auditorData.focal_spot_size && auditorData.source_object_distance) {
      calculateGeometricUnsharpness()
    }
  }, [auditorData.focal_spot_size, auditorData.source_object_distance, auditorData.ofd])

  // ============================================================================
  // PRECISION-AWARE FIELD UPDATE
  // ============================================================================
  
  function updateField(field, value) {
    // Apply precision rounding for numeric fields
    let processedValue = value
    const precision = getPrecision(field)
    
    if (precision !== undefined && !isNaN(parseFloat(value)) && value !== '') {
      processedValue = roundToPrecision(parseFloat(value), field)
    }
    
    setAuditorData(prev => ({ ...prev, [field]: processedValue }))
  }
  
  async function handleFieldBlur(field, value, displayName) {
    if (isReadOnly) return
    
    const originalValue = originalValuesRef.current[field]
    
    if (valuesAreDifferent(originalValue, value, field)) {
      await logFieldChange({
        reportId: selectedWeld?.id,
        entityType: 'ndt_inspection',
        entityId: selectedWeld?.id,
        section: 'NDT Technical Review',
        fieldName: displayName || field,
        oldValue: originalValue,
        newValue: value,
        weldNumber: selectedWeld?.weld_number,
        metadata: {
          method: auditorData.method,
          precision: getPrecision(field)
        }
      })
      
      // Update original value
      originalValuesRef.current[field] = value
    }
  }

  // ============================================================================
  // INTERPRETATION AGREEMENT HANDLER
  // ============================================================================
  
  async function handleInterpretationToggle(agrees) {
    if (isReadOnly) return
    
    const previousAgree = auditorData.interpretation_agree
    
    setAuditorData(prev => ({
      ...prev,
      interpretation_agree: agrees,
      disagreement_reason: agrees ? '' : prev.disagreement_reason
    }))
    
    // Log this as a critical status change
    if (previousAgree !== agrees) {
      await logStatusChange({
        reportId: selectedWeld?.id,
        entityType: 'ndt_interpretation',
        entityId: selectedWeld?.id,
        oldStatus: previousAgree ? 'Agree' : 'Disagree',
        newStatus: agrees ? 'Agree' : 'Disagree',
        reason: agrees ? 'Interpretation verified' : 'Pending disagreement reason',
        metadata: {
          weld_number: selectedWeld?.weld_number,
          is_critical: true,
          method: auditorData.method
        }
      })
    }
  }

  // ============================================================================
  // SAVE INSPECTION
  // ============================================================================
  
  async function saveInspection() {
    if (isReadOnly) return
    
    // Validation
    if (!auditorData.interpretation_result) {
      alert('Please select an interpretation result')
      return
    }
    
    if (!auditorData.interpretation_agree && !auditorData.disagreement_reason.trim()) {
      alert('Disagreement reason is required when interpretation does not agree')
      return
    }
    
    setSaving(true)
    try {
      const inspectionRecord = {
        weld_id: selectedWeld?.id,
        method: auditorData.method || 'RT',
        inspection_date: auditorData.inspection_date,
        technician_name: auditorData.technician_name,
        technician_level: auditorData.technician_level,
        // RT fields
        film_density: auditorData.density_weld ? parseFloat(auditorData.density_weld) : null,
        density_base: auditorData.density_base ? parseFloat(auditorData.density_base) : null,
        sensitivity: auditorData.sensitivity,
        technique: auditorData.technique,
        source_type: auditorData.source_type,
        // UT fields
        strip_chart_id: auditorData.strip_chart_id,
        crawler_speed: auditorData.crawler_speed ? parseFloat(auditorData.crawler_speed) : null,
        gate_settings: JSON.stringify({
          gate_a: { start: auditorData.gate_a_start, width: auditorData.gate_a_width, threshold: auditorData.gate_a_threshold },
          gate_b: { start: auditorData.gate_b_start, width: auditorData.gate_b_width, threshold: auditorData.gate_b_threshold }
        }),
        // Results
        interpretation_result: auditorData.interpretation_result,
        interpretation_agree: auditorData.interpretation_agree,
        level3_reviewer: auditorData.level3_reviewer,
        defect_type: auditorData.defect_type,
        defect_location: auditorData.defect_location,
        comments: auditorData.interpretation_agree ? '' : auditorData.disagreement_reason,
        // Calculated
        geometric_unsharpness: auditorData.calculated_ug,
        // Audit
        status: 'reviewed',
        reviewed_by: userProfile?.id,
        reviewed_at: new Date().toISOString()
      }
      
      // Upsert inspection
      const { error: inspError } = await supabase
        .from('ndt_inspections')
        .upsert(inspectionRecord, { onConflict: 'weld_id,method' })
      
      if (inspError) throw inspError
      
      // Update weld status
      const newStatus = auditorData.interpretation_result === 'accept' ? 'accept' :
                        auditorData.interpretation_result === 'repair' ? 'repair' : 'pending'
      
      const { error: weldError } = await supabase
        .from('weld_book')
        .update({
          nde_status: newStatus,
          last_ndt_date: auditorData.inspection_date,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedWeld?.id)
      
      if (weldError) throw weldError
      
      // Log the final status change
      await logStatusChange({
        reportId: selectedWeld?.id,
        entityType: 'weld_ndt',
        entityId: selectedWeld?.id,
        oldStatus: selectedWeld?.nde_status,
        newStatus: newStatus,
        reason: auditorData.interpretation_agree 
          ? `NDT ${auditorData.method} review completed - ${auditorData.interpretation_result}`
          : `NDT ${auditorData.method} DISAGREEMENT: ${auditorData.disagreement_reason}`,
        metadata: {
          weld_number: selectedWeld?.weld_number,
          is_critical: !auditorData.interpretation_agree,
          method: auditorData.method,
          geometric_unsharpness: auditorData.calculated_ug
        }
      })
      
      alert('Inspection saved successfully!')
      
      // Refresh queue
      fetchReviewQueue()
      setSelectedWeld(null)
      resetForm()
      
    } catch (err) {
      console.error('Error saving inspection:', err)
      alert('Error saving: ' + err.message)
    }
    setSaving(false)
  }
  
  function resetForm() {
    setAuditorData({
      density_base: '',
      density_weld: '',
      sensitivity: '',
      technique: 'SWSI',
      source_type: 'Ir-192',
      source_size: '',
      sfd: '',
      ofd: '',
      film_type: '',
      screens: 'Lead',
      iqi_type: '',
      iqi_essential_hole: '',
      strip_chart_id: '',
      crawler_speed: '',
      probe_frequency: '',
      probe_angle: '',
      calibration_block: '',
      ref_level_db: '',
      tcg_applied: false,
      gate_a_start: '',
      gate_a_width: '',
      gate_a_threshold: '',
      gate_b_start: '',
      gate_b_width: '',
      gate_b_threshold: '',
      couplant: 'Glycerin',
      scan_coverage: '',
      focal_spot_size: '',
      source_object_distance: '',
      calculated_ug: null,
      interpretation_result: '',
      defect_type: '',
      defect_location: '',
      defect_length: '',
      defect_height: '',
      interpretation_agree: true,
      disagreement_reason: '',
      level3_reviewer: '',
      inspection_date: new Date().toISOString().split('T')[0],
      technician_name: userProfile?.full_name || '',
      technician_level: 'II'
    })
    setContractorData(null)
    setWeldPhotos([])
    originalValuesRef.current = {}
  }

  // ============================================================================
  // STYLES
  // ============================================================================
  
  const sidebarStyle = {
    width: '320px',
    backgroundColor: '#1a1a2e',
    color: 'white',
    height: '100vh',
    overflowY: 'auto',
    position: 'fixed',
    left: 0,
    top: 0
  }
  
  const mainStyle = {
    marginLeft: '320px',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5'
  }
  
  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginBottom: '20px',
    overflow: 'hidden'
  }
  
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box'
  }
  
  const labelStyle = {
    display: 'block',
    marginBottom: '5px',
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#495057'
  }
  
  const precisionBadge = (field) => {
    const p = getPrecision(field)
    return (
      <span style={{ fontSize: '10px', color: '#6c757d', marginLeft: '5px' }}>
        ({p} dp)
      </span>
    )
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* SIDEBAR - Review Queue */}
      <div style={sidebarStyle}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid #333', backgroundColor: '#16213e' }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>
            🔬 NDT Review Queue
          </h2>
          <p style={{ margin: 0, fontSize: '12px', opacity: 0.7 }}>
            {isReadOnly ? 'Read-Only View' : 'Technical Workspace'}
          </p>
        </div>
        
        {/* Filter */}
        <div style={{ padding: '15px', borderBottom: '1px solid #333' }}>
          <select
            value={filterMethod}
            onChange={e => setFilterMethod(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '4px', backgroundColor: '#0f3460', color: 'white', border: 'none' }}
          >
            <option value="all">All Methods ({stats.pendingRT + stats.pendingUT + stats.pendingAUT})</option>
            <option value="RT">RT - Radiographic ({stats.pendingRT})</option>
            <option value="UT">UT - Manual Ultrasonic ({stats.pendingUT})</option>
            <option value="AUT">AUT - Automated UT ({stats.pendingAUT})</option>
          </select>
        </div>
        
        {/* Queue List */}
        <div style={{ padding: '10px' }}>
          {queueLoading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#888' }}>Loading...</div>
          ) : reviewQueue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#888' }}>
              <p>✅ No welds pending review</p>
            </div>
          ) : (
            reviewQueue.map(item => {
              const weld = item.weld || item
              const isSelected = selectedWeld?.id === weld.id
              const isHighlighted = highlightWeldId === weld.id
              
              return (
                <div
                  key={item.id}
                  id={`queue-item-${weld.id}`}
                  onClick={() => setSelectedWeld(weld)}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#6f42c1' : isHighlighted ? '#ffc107' : '#0f3460',
                    border: isSelected ? '2px solid #9d6eff' : '1px solid transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ fontWeight: 'bold', fontFamily: 'monospace', color: isHighlighted && !isSelected ? '#000' : 'white' }}>
                      {weld.weld_number}
                    </span>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      backgroundColor: item.method === 'RT' ? '#e74c3c' : item.method === 'AUT' ? '#3498db' : '#27ae60',
                      color: 'white'
                    }}>
                      {item.method || 'RT'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: isHighlighted && !isSelected ? '#333' : '#aaa' }}>
                    KP {weld.kp?.toFixed(3)} • {weld.welder_name || weld.welder_id}
                  </div>
                  <div style={{ fontSize: '11px', color: isHighlighted && !isSelected ? '#333' : '#aaa', marginTop: '3px' }}>
                    {weld.pipe_diameter}" × {weld.wall_thickness}mm • {weld.weld_date}
                  </div>
                  {weld.repair_count > 0 && (
                    <div style={{ marginTop: '5px' }}>
                      <span style={{ fontSize: '10px', backgroundColor: '#dc3545', color: 'white', padding: '2px 6px', borderRadius: '3px' }}>
                        Repair #{weld.repair_count}
                      </span>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
        
        {/* Navigation */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '15px', borderTop: '1px solid #333', backgroundColor: '#16213e' }}>
          {/* Only show back button for super_admin/chiefs/welding_chief accessing via god mode */}
          {(userRole === 'super_admin' || userRole === 'chief_inspector' || userRole === 'chief' || userRole === 'welding_chief') && (
            <button
              onClick={() => {
                // Navigate based on where user came from or their role
                if (fromPage === 'welding-chief') {
                  navigate(orgPath('/welding-chief'))
                } else if (userRole === 'super_admin') {
                  navigate(orgPath('/admin'))
                } else if (userRole === 'welding_chief') {
                  navigate(orgPath('/welding-chief'))
                } else {
                  navigate(orgPath('/chief-dashboard'))
                }
              }}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: fromPage === 'welding-chief' || userRole === 'welding_chief' ? '#6f42c1' : '#1a5f2a',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginBottom: '8px'
              }}
            >
              {fromPage === 'welding-chief' || userRole === 'welding_chief'
                ? '← Welding Chief Dashboard'
                : userRole === 'super_admin'
                  ? '← Admin Dashboard'
                  : '← Chief Dashboard'}
            </button>
          )}
          <div style={{ marginBottom: '8px' }}>
            <AIAgentStatusIcon organizationId={organizationId} />
          </div>
          <button
            onClick={signOut}
            style={{ width: '100%', padding: '12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={mainStyle}>
        {/* Header */}
        <div style={{ backgroundColor: '#6f42c1', color: 'white', padding: '20px 30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px' }}>
                {isReadOnly ? '🔒 NDT Technical Review (Read-Only)' : '🔬 NDT Technical Review'}
              </h1>
              <p style={{ margin: '5px 0 0 0', opacity: 0.8 }}>
                {userProfile?.full_name || userProfile?.email} • Level {auditorData.technician_level} Technician
              </p>
            </div>
            {selectedWeld && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  {selectedWeld.weld_number}
                </div>
                <div style={{ fontSize: '14px', opacity: 0.8 }}>
                  KP {selectedWeld.kp?.toFixed(3)} • {selectedWeld.weld_type}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div style={{ padding: '30px' }}>
          {!selectedWeld ? (
            <div style={{ ...cardStyle, padding: '60px', textAlign: 'center' }}>
              <h2 style={{ color: '#6c757d', marginBottom: '10px' }}>Select a Weld from the Queue</h2>
              <p style={{ color: '#999' }}>Choose a weld from the sidebar to begin technical review</p>
            </div>
          ) : (
            <>
              {/* Tab Navigation */}
              <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
                {['inspection', 'photos', 'history'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: activeTab === tab ? '#6f42c1' : 'white',
                      color: activeTab === tab ? 'white' : '#333',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: activeTab === tab ? 'bold' : 'normal',
                      textTransform: 'capitalize'
                    }}
                  >
                    {tab === 'inspection' ? '📋 Technical Inspection' : 
                     tab === 'photos' ? `📷 Photos (${weldPhotos.length})` : '📜 History'}
                  </button>
                ))}
              </div>

              {/* INSPECTION TAB */}
              {activeTab === 'inspection' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {/* LEFT: Contractor Submission */}
                  <div style={cardStyle}>
                    <div style={{ backgroundColor: '#17a2b8', padding: '15px 20px', color: 'white' }}>
                      <h3 style={{ margin: 0, fontSize: '16px' }}>📤 Contractor Submission</h3>
                    </div>
                    <div style={{ padding: '20px' }}>
                      {contractorData ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                              <label style={labelStyle}>Method</label>
                              <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                                {contractorData.method || 'RT'}
                              </div>
                            </div>
                            <div>
                              <label style={labelStyle}>Date</label>
                              <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                                {contractorData.inspection_date}
                              </div>
                            </div>
                            <div>
                              <label style={labelStyle}>Film Density (Weld)</label>
                              <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px', fontFamily: 'monospace' }}>
                                {contractorData.film_density || '-'}
                              </div>
                            </div>
                            <div>
                              <label style={labelStyle}>Sensitivity</label>
                              <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                                {contractorData.sensitivity || '-'}
                              </div>
                            </div>
                            <div>
                              <label style={labelStyle}>Technique</label>
                              <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                                {contractorData.technique || '-'}
                              </div>
                            </div>
                            <div>
                              <label style={labelStyle}>Technician</label>
                              <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                                {contractorData.technician_name} ({contractorData.technician_level})
                              </div>
                            </div>
                          </div>
                          <div style={{ marginTop: '15px' }}>
                            <label style={labelStyle}>Contractor Interpretation</label>
                            <div style={{
                              padding: '15px',
                              borderRadius: '4px',
                              fontWeight: 'bold',
                              textAlign: 'center',
                              backgroundColor: contractorData.interpretation_result === 'accept' ? '#d4edda' : '#f8d7da',
                              color: contractorData.interpretation_result === 'accept' ? '#155724' : '#721c24'
                            }}>
                              {contractorData.interpretation_result?.toUpperCase() || 'PENDING'}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '30px', color: '#999' }}>
                          No contractor submission on file
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Auditor Verification */}
                  <div style={cardStyle}>
                    <div style={{ backgroundColor: '#6f42c1', padding: '15px 20px', color: 'white' }}>
                      <h3 style={{ margin: 0, fontSize: '16px' }}>✅ Auditor Verification</h3>
                    </div>
                    <div style={{ padding: '20px' }}>
                      {/* Method Selection */}
                      <div style={{ marginBottom: '20px' }}>
                        <label style={labelStyle}>Inspection Method</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          {['RT', 'UT', 'AUT'].map(m => (
                            <button
                              key={m}
                              onClick={() => !isReadOnly && updateField('method', m)}
                              disabled={isReadOnly}
                              style={{
                                flex: 1,
                                padding: '10px',
                                backgroundColor: (auditorData.method || 'RT') === m ? '#6f42c1' : '#f8f9fa',
                                color: (auditorData.method || 'RT') === m ? 'white' : '#333',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                cursor: isReadOnly ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* RT-Specific Fields */}
                      {(auditorData.method || 'RT') === 'RT' && (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                            <div>
                              <label style={labelStyle}>Density (Base) {precisionBadge('density')}</label>
                              <input
                                type="number"
                                step="0.01"
                                value={auditorData.density_base}
                                onChange={e => updateField('density_base', e.target.value)}
                                onBlur={() => handleFieldBlur('density_base', auditorData.density_base, 'Film Density (Base)')}
                                disabled={isReadOnly}
                                style={inputStyle}
                                placeholder="1.8 - 4.0"
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Density (Weld) {precisionBadge('density')}</label>
                              <input
                                type="number"
                                step="0.01"
                                value={auditorData.density_weld}
                                onChange={e => updateField('density_weld', e.target.value)}
                                onBlur={() => handleFieldBlur('density_weld', auditorData.density_weld, 'Film Density (Weld)')}
                                disabled={isReadOnly}
                                style={inputStyle}
                                placeholder="1.8 - 4.0"
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Sensitivity (%)</label>
                              <input
                                type="text"
                                value={auditorData.sensitivity}
                                onChange={e => updateField('sensitivity', e.target.value)}
                                onBlur={() => handleFieldBlur('sensitivity', auditorData.sensitivity, 'Sensitivity')}
                                disabled={isReadOnly}
                                style={inputStyle}
                                placeholder="e.g., 2-2T"
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Technique</label>
                              <select
                                value={auditorData.technique}
                                onChange={e => updateField('technique', e.target.value)}
                                disabled={isReadOnly}
                                style={inputStyle}
                              >
                                <option value="SWSI">SWSI - Single Wall Single Image</option>
                                <option value="DWSI">DWSI - Double Wall Single Image</option>
                                <option value="DWE">DWE - Double Wall Elliptical</option>
                              </select>
                            </div>
                          </div>

                          {/* Ug Calculator */}
                          <div style={{ backgroundColor: '#e7f3ff', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <label style={{ ...labelStyle, margin: 0 }}>
                                Geometric Unsharpness (Ug) Calculator
                              </label>
                              <span style={{ fontSize: '11px', color: '#004085' }}>
                                Ug = Fd/D
                              </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                              <div>
                                <label style={{ fontSize: '10px', color: '#666' }}>F - Focal Spot (mm)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={auditorData.focal_spot_size}
                                  onChange={e => updateField('focal_spot_size', e.target.value)}
                                  disabled={isReadOnly}
                                  style={{ ...inputStyle, padding: '8px' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '10px', color: '#666' }}>d - OFD (mm)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={auditorData.ofd}
                                  onChange={e => updateField('ofd', e.target.value)}
                                  disabled={isReadOnly}
                                  style={{ ...inputStyle, padding: '8px' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '10px', color: '#666' }}>D - SFD (mm)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={auditorData.source_object_distance}
                                  onChange={e => updateField('source_object_distance', e.target.value)}
                                  disabled={isReadOnly}
                                  style={{ ...inputStyle, padding: '8px' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '10px', color: '#666' }}>Ug Result {precisionBadge('ug')}</label>
                                <div style={{
                                  padding: '8px',
                                  backgroundColor: auditorData.calculated_ug !== null ? (auditorData.calculated_ug <= 0.5 ? '#d4edda' : '#f8d7da') : '#f8f9fa',
                                  borderRadius: '4px',
                                  fontWeight: 'bold',
                                  textAlign: 'center',
                                  fontFamily: 'monospace'
                                }}>
                                  {auditorData.calculated_ug !== null ? auditorData.calculated_ug.toFixed(4) : '-'}
                                </div>
                              </div>
                            </div>
                            {auditorData.calculated_ug !== null && auditorData.calculated_ug > 0.5 && (
                              <div style={{ marginTop: '8px', fontSize: '11px', color: '#dc3545' }}>
                                ⚠️ Ug exceeds 0.5mm - verify SFD compliance
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* UT/AUT-Specific Fields */}
                      {((auditorData.method || 'RT') === 'UT' || (auditorData.method || 'RT') === 'AUT') && (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                            <div>
                              <label style={labelStyle}>Strip Chart ID</label>
                              <input
                                type="text"
                                value={auditorData.strip_chart_id}
                                onChange={e => updateField('strip_chart_id', e.target.value)}
                                disabled={isReadOnly}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Crawler Speed (mm/s) {precisionBadge('speed')}</label>
                              <input
                                type="number"
                                step="0.01"
                                value={auditorData.crawler_speed}
                                onChange={e => updateField('crawler_speed', e.target.value)}
                                onBlur={() => handleFieldBlur('crawler_speed', auditorData.crawler_speed, 'Crawler Speed')}
                                disabled={isReadOnly}
                                style={inputStyle}
                              />
                            </div>
                          </div>
                          
                          {/* Gating Channels */}
                          <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                            <label style={{ ...labelStyle, marginBottom: '10px' }}>Gating Channels</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                              <div>
                                <label style={{ fontSize: '10px', color: '#666' }}>Gate A Start (mm)</label>
                                <input type="number" value={auditorData.gate_a_start} onChange={e => updateField('gate_a_start', e.target.value)} disabled={isReadOnly} style={{ ...inputStyle, padding: '8px' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: '10px', color: '#666' }}>Gate A Width (mm)</label>
                                <input type="number" value={auditorData.gate_a_width} onChange={e => updateField('gate_a_width', e.target.value)} disabled={isReadOnly} style={{ ...inputStyle, padding: '8px' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: '10px', color: '#666' }}>Gate A Threshold (%)</label>
                                <input type="number" value={auditorData.gate_a_threshold} onChange={e => updateField('gate_a_threshold', e.target.value)} disabled={isReadOnly} style={{ ...inputStyle, padding: '8px' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: '10px', color: '#666' }}>Gate B Start (mm)</label>
                                <input type="number" value={auditorData.gate_b_start} onChange={e => updateField('gate_b_start', e.target.value)} disabled={isReadOnly} style={{ ...inputStyle, padding: '8px' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: '10px', color: '#666' }}>Gate B Width (mm)</label>
                                <input type="number" value={auditorData.gate_b_width} onChange={e => updateField('gate_b_width', e.target.value)} disabled={isReadOnly} style={{ ...inputStyle, padding: '8px' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: '10px', color: '#666' }}>Gate B Threshold (%)</label>
                                <input type="number" value={auditorData.gate_b_threshold} onChange={e => updateField('gate_b_threshold', e.target.value)} disabled={isReadOnly} style={{ ...inputStyle, padding: '8px' }} />
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* INTERPRETATION AGREEMENT - Full Width */}
                  <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
                    <div style={{
                      backgroundColor: auditorData.interpretation_agree ? '#28a745' : '#dc3545',
                      padding: '15px 20px',
                      color: 'white'
                    }}>
                      <h3 style={{ margin: 0, fontSize: '16px' }}>
                        {auditorData.interpretation_agree ? '✅ Interpretation Agreement' : '⚠️ Interpretation DISAGREEMENT'}
                      </h3>
                    </div>
                    <div style={{ padding: '20px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                        {/* Auditor Interpretation */}
                        <div>
                          <label style={labelStyle}>Your Interpretation *</label>
                          <select
                            value={auditorData.interpretation_result}
                            onChange={e => updateField('interpretation_result', e.target.value)}
                            disabled={isReadOnly}
                            style={{ ...inputStyle, borderColor: !auditorData.interpretation_result ? '#dc3545' : '#ced4da' }}
                          >
                            <option value="">-- Select --</option>
                            <option value="accept">ACCEPT</option>
                            <option value="reject">REJECT</option>
                            <option value="repair">REPAIR REQUIRED</option>
                          </select>
                        </div>

                        {/* Defect Info */}
                        <div>
                          <label style={labelStyle}>Defect Type (if any)</label>
                          <select
                            value={auditorData.defect_type}
                            onChange={e => updateField('defect_type', e.target.value)}
                            disabled={isReadOnly}
                            style={inputStyle}
                          >
                            <option value="">None</option>
                            <option value="Porosity">Porosity (P)</option>
                            <option value="Slag">Slag Inclusion (SI)</option>
                            <option value="LOF">Lack of Fusion (LOF)</option>
                            <option value="LOP">Lack of Penetration (LOP)</option>
                            <option value="Crack">Crack (C)</option>
                            <option value="Undercut">Undercut (UC)</option>
                            <option value="Burn Through">Burn Through (BT)</option>
                            <option value="HiLo">Hi-Lo / Mismatch</option>
                          </select>
                        </div>

                        <div>
                          <label style={labelStyle}>Defect Location</label>
                          <input
                            type="text"
                            value={auditorData.defect_location}
                            onChange={e => updateField('defect_location', e.target.value)}
                            disabled={isReadOnly}
                            style={inputStyle}
                            placeholder="e.g., 3:00-4:00, root pass"
                          />
                        </div>
                      </div>

                      {/* Agree/Disagree Toggle */}
                      <div style={{ marginBottom: '20px' }}>
                        <label style={labelStyle}>Do you agree with contractor's interpretation?</label>
                        <div style={{ display: 'flex', gap: '15px' }}>
                          <button
                            onClick={() => handleInterpretationToggle(true)}
                            disabled={isReadOnly}
                            style={{
                              flex: 1,
                              padding: '15px',
                              backgroundColor: auditorData.interpretation_agree ? '#28a745' : '#f8f9fa',
                              color: auditorData.interpretation_agree ? 'white' : '#333',
                              border: '2px solid ' + (auditorData.interpretation_agree ? '#28a745' : '#ddd'),
                              borderRadius: '8px',
                              cursor: isReadOnly ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold',
                              fontSize: '16px'
                            }}
                          >
                            ✓ YES - Agree
                          </button>
                          <button
                            onClick={() => handleInterpretationToggle(false)}
                            disabled={isReadOnly}
                            style={{
                              flex: 1,
                              padding: '15px',
                              backgroundColor: !auditorData.interpretation_agree ? '#dc3545' : '#f8f9fa',
                              color: !auditorData.interpretation_agree ? 'white' : '#333',
                              border: '2px solid ' + (!auditorData.interpretation_agree ? '#dc3545' : '#ddd'),
                              borderRadius: '8px',
                              cursor: isReadOnly ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold',
                              fontSize: '16px'
                            }}
                          >
                            ✗ NO - Disagree
                          </button>
                        </div>
                      </div>

                      {/* Disagreement Reason (Required when disagree) */}
                      {!auditorData.interpretation_agree && (
                        <div style={{ backgroundColor: '#f8d7da', padding: '20px', borderRadius: '8px' }}>
                          <label style={{ ...labelStyle, color: '#721c24' }}>
                            ⚠️ Reason for Disagreement * (Required)
                          </label>
                          <textarea
                            value={auditorData.disagreement_reason}
                            onChange={e => updateField('disagreement_reason', e.target.value)}
                            disabled={isReadOnly}
                            style={{
                              ...inputStyle,
                              height: '100px',
                              resize: 'vertical',
                              borderColor: !auditorData.disagreement_reason.trim() ? '#dc3545' : '#ced4da'
                            }}
                            placeholder="Provide detailed reason for disagreement with contractor interpretation..."
                          />
                          <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                              <label style={{ fontSize: '11px', color: '#721c24' }}>Level III Reviewer</label>
                              <input
                                type="text"
                                value={auditorData.level3_reviewer}
                                onChange={e => updateField('level3_reviewer', e.target.value)}
                                disabled={isReadOnly}
                                style={inputStyle}
                                placeholder="Level III name for sign-off"
                              />
                            </div>
                          </div>
                          <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#721c24' }}>
                            This disagreement will be flagged as a Critical Field change in the audit log
                          </p>
                        </div>
                      )}

                      {/* Save Button */}
                      {!isReadOnly && (
                        <div style={{ marginTop: '20px', textAlign: 'right' }}>
                          <button
                            onClick={saveInspection}
                            disabled={saving || !auditorData.interpretation_result || (!auditorData.interpretation_agree && !auditorData.disagreement_reason.trim())}
                            style={{
                              padding: '15px 40px',
                              backgroundColor: saving ? '#6c757d' : '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: saving ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold',
                              fontSize: '16px'
                            }}
                          >
                            {saving ? 'Saving...' : '💾 Save Inspection & Update Weld Status'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* PHOTOS TAB */}
              {activeTab === 'photos' && (
                <div style={cardStyle}>
                  <div style={{ backgroundColor: '#17a2b8', padding: '15px 20px', color: 'white' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>📷 Geotagged Weld Photos</h3>
                  </div>
                  <div style={{ padding: '20px' }}>
                    {weldPhotos.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                        <p>No photos associated with this weld</p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
                        {weldPhotos.map((photo, idx) => (
                          <div
                            key={photo.id || idx}
                            style={{
                              backgroundColor: '#f8f9fa',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              cursor: 'pointer'
                            }}
                            onClick={() => setSelectedPhoto(photo)}
                          >
                            <div style={{ height: '180px', backgroundColor: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {photo.photo_url ? (
                                <img src={photo.photo_url} alt={`Weld photo ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <span style={{ color: '#999' }}>No Preview</span>
                              )}
                            </div>
                            {/* Metadata Overlay */}
                            <div style={{ padding: '12px', fontSize: '11px', fontFamily: 'monospace' }}>
                              <div style={{ marginBottom: '5px' }}>
                                <strong>📍</strong> {photo.latitude?.toFixed(6)}, {photo.longitude?.toFixed(6)}
                              </div>
                              <div style={{ marginBottom: '5px' }}>
                                <strong>🧭</strong> Direction: {photo.direction_deg?.toFixed(1)}°
                              </div>
                              <div style={{ marginBottom: '5px' }}>
                                <strong>📏</strong> Accuracy: {photo.accuracy_m?.toFixed(1)}m
                              </div>
                              <div style={{ color: '#666' }}>
                                {photo.taken_at ? new Date(photo.taken_at).toLocaleString() : photo.caption || 'No timestamp'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* HISTORY TAB */}
              {activeTab === 'history' && (
                <div style={cardStyle}>
                  <div style={{ backgroundColor: '#6c757d', padding: '15px 20px', color: 'white' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>📜 Inspection History</h3>
                  </div>
                  <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                    <p>Inspection history for weld {selectedWeld?.weld_number} will be displayed here</p>
                    <p style={{ fontSize: '12px' }}>Including all previous RT/UT inspections and any repairs</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            cursor: 'pointer'
          }}
        >
          <div style={{ maxWidth: '90%', maxHeight: '90%', position: 'relative' }} onClick={e => e.stopPropagation()}>
            {selectedPhoto.photo_url && (
              <img src={selectedPhoto.photo_url} alt="Full size" style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '8px' }} />
            )}
            <div style={{
              position: 'absolute',
              bottom: '-60px',
              left: 0,
              right: 0,
              backgroundColor: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '15px',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}>
              <div style={{ display: 'flex', gap: '30px', justifyContent: 'center' }}>
                <span>📍 {selectedPhoto.latitude?.toFixed(6)}, {selectedPhoto.longitude?.toFixed(6)}</span>
                <span>🧭 {selectedPhoto.direction_deg?.toFixed(1)}°</span>
                <span>📏 ±{selectedPhoto.accuracy_m?.toFixed(1)}m</span>
              </div>
            </div>
            <button
              onClick={() => setSelectedPhoto(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: 0,
                backgroundColor: 'transparent',
                color: 'white',
                border: 'none',
                fontSize: '30px',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default NDTAuditorDashboard
