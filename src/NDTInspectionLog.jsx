import React, { useState, useRef, useEffect } from 'react'
import { supabase } from './supabase'

// ============================================================================
// PRECISION MAP FOR SMART DIFFING
// ============================================================================
const PRECISION_MAP = {
  // GPS coordinates - 6 decimal places (~0.1m accuracy)
  latitude: 6,
  longitude: 6,
  gps: 6,
  
  // Lengths and depths - 2 decimal places
  length: 2,
  depth: 2,
  distance: 2,
  kp: 3,
  station: 2,
  crawler_speed: 2,
  
  // Wall thickness - 3 decimal places
  wall_thickness: 3,
  wt: 3,
  thickness: 3,
  
  // Film density - 2 decimal places
  density: 2,
  film_density: 2,
  
  // Geometric unsharpness - 4 decimal places
  geometric_unsharpness: 4,
  ug: 4,
  
  // Angles - 1 decimal place
  angle: 1,
  probe_angle: 1,
  
  // Percentages - 1 decimal place
  percent: 1,
  sensitivity: 1,
  
  // Default - 2 decimal places
  default: 2
}

// ============================================================================
// SMART DIFFING HELPER - Precision-based value comparison
// ============================================================================
function getPrecision(fieldName) {
  const lowerField = fieldName.toLowerCase()
  
  for (const [key, precision] of Object.entries(PRECISION_MAP)) {
    if (lowerField.includes(key)) {
      return precision
    }
  }
  return PRECISION_MAP.default
}

function roundToPrecision(value, fieldName) {
  if (value === null || value === undefined || value === '') return value
  
  const numValue = parseFloat(value)
  if (isNaN(numValue)) return value
  
  const precision = getPrecision(fieldName)
  return Number(numValue.toFixed(precision))
}

function valuesAreDifferent(oldVal, newVal, fieldName) {
  // Handle null/undefined/empty
  const oldEmpty = oldVal === null || oldVal === undefined || oldVal === ''
  const newEmpty = newVal === null || newVal === undefined || newVal === ''
  
  if (oldEmpty && newEmpty) return false
  if (oldEmpty !== newEmpty) return true
  
  // For numeric fields, apply precision rounding
  const oldNum = parseFloat(oldVal)
  const newNum = parseFloat(newVal)
  
  if (!isNaN(oldNum) && !isNaN(newNum)) {
    const roundedOld = roundToPrecision(oldNum, fieldName)
    const roundedNew = roundToPrecision(newNum, fieldName)
    return roundedOld !== roundedNew
  }
  
  // String comparison
  return String(oldVal).trim() !== String(newVal).trim()
}

// ============================================================================
// RT-SPECIFIC MATH: Geometric Unsharpness Calculator
// Ug = Fd/D where:
//   F = focal spot size (mm)
//   d = object-to-film distance (mm)  
//   D = source-to-object distance (mm)
// ============================================================================
function calculateGeometricUnsharpness(focalSpot, objectToFilm, sourceToObject) {
  const F = parseFloat(focalSpot)
  const d = parseFloat(objectToFilm)
  const D = parseFloat(sourceToObject)
  
  if (isNaN(F) || isNaN(d) || isNaN(D) || D === 0) {
    return null
  }
  
  const Ug = (F * d) / D
  return roundToPrecision(Ug, 'geometric_unsharpness')
}

// Maximum allowable Ug per code (typically 0.5mm for pipeline work)
const MAX_ALLOWABLE_UG = 0.5

// ============================================================================
// TECHNIQUE APPROVAL VALIDATION
// ============================================================================
async function checkTechniqueApproval(projectId, pipeDiameter, wallThickness) {
  try {
    const { data, error } = await supabase
      .from('ndt_inspections')
      .select('id, inspection_date, technician_name')
      .eq('project_id', projectId)
      .eq('method', 'RT')
      .eq('technical_metadata->>technique_approved', 'true')
      .eq('technical_metadata->>pipe_diameter', pipeDiameter)
      .eq('technical_metadata->>wall_thickness', String(wallThickness))
      .limit(1)
    
    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  } catch (err) {
    console.error('Error checking technique approval:', err)
    return null
  }
}

// ============================================================================
// NDT INSPECTION LOG COMPONENT
// ============================================================================
function NDTInspectionLog({ 
  data, 
  onChange, 
  projectId, 
  reportId, 
  logId,
  weldNumber,
  pipeDiameter,
  wallThickness,
  onTechniqueValidation 
}) {
  // State
  const [techniqueApproved, setTechniqueApproved] = useState(null)
  const [checkingTechnique, setCheckingTechnique] = useState(false)
  const [ugResult, setUgResult] = useState(null)
  
  // Refs for audit tracking
  const originalValuesRef = useRef({})
  
  // Default data structure
  const defaultData = {
    method: '',                    // 'RT', 'AUT', 'manual_UT'
    ut_subtype: '',               // For UT: 'AUT' or 'Manual'
    inspection_number: '',
    spread_number: '',
    inspection_date: new Date().toISOString().split('T')[0],
    
    // Common fields
    technician_name: '',
    technician_cert_level: '',
    technician_cert_number: '',
    
    // RT-specific
    rt_technique: '',             // 'SWX', 'DWX', 'DWG'
    rt_source: '',                // 'X-Ray', 'Ir-192', 'Co-60'
    film_density_weld: '',
    film_density_pipe: '',
    sensitivity: '',
    iqi_type: '',
    iqi_visibility: '',
    focal_spot_size: '',          // mm - for Ug calculation
    source_to_object: '',         // D - mm
    object_to_film: '',           // d - mm
    technique_shot_approved: false,
    
    // AUT-specific
    strip_chart_id: '',
    crawler_speed: '',            // mm/s
    gating_channels: '',
    calibration_block: '',
    
    // Manual UT-specific
    probe_angle: '',              // degrees
    probe_type: '',
    frequency_mhz: '',
    dac_curve: '',
    couplant: '',
    
    // Quality criteria
    coverage_acceptable: null,
    density_weld_acceptable: null,
    density_pipe_acceptable: null,
    film_id_acceptable: null,
    sensitivity_acceptable: null,
    reporting_acceptable: null,
    
    // Result
    interpretation_result: '',    // 'accept', 'reject', 'repair'
    interpretation_agree: null,
    
    // Defects
    defects: [],
    
    // Comments
    comments: '',
    
    // Status
    status: 'pending'
  }
  
  const ndtData = { ...defaultData, ...data }
  
  // Check technique approval when pipe specs change
  useEffect(() => {
    if (projectId && pipeDiameter && wallThickness && ndtData.method === 'RT') {
      checkTechniqueApprovalStatus()
    }
  }, [projectId, pipeDiameter, wallThickness, ndtData.method])
  
  // Calculate Ug when RT parameters change
  useEffect(() => {
    if (ndtData.method === 'RT' && 
        ndtData.focal_spot_size && 
        ndtData.object_to_film && 
        ndtData.source_to_object) {
      const ug = calculateGeometricUnsharpness(
        ndtData.focal_spot_size,
        ndtData.object_to_film,
        ndtData.source_to_object
      )
      setUgResult(ug)
    } else {
      setUgResult(null)
    }
  }, [ndtData.focal_spot_size, ndtData.object_to_film, ndtData.source_to_object, ndtData.method])
  
  async function checkTechniqueApprovalStatus() {
    setCheckingTechnique(true)
    const approval = await checkTechniqueApproval(projectId, pipeDiameter, wallThickness)
    setTechniqueApproved(approval)
    setCheckingTechnique(false)
    
    if (onTechniqueValidation) {
      onTechniqueValidation(!!approval)
    }
  }
  
  // Update field with smart diffing
  function updateField(field, value) {
    const newData = { ...ndtData, [field]: value }
    
    // Log audit if value changed (using precision-based comparison)
    if (reportId && valuesAreDifferent(originalValuesRef.current[field], value, field)) {
      logAuditChange(field, originalValuesRef.current[field], value)
    }
    
    onChange(newData)
  }
  
  // Capture original value on focus
  function handleFocus(field, currentValue) {
    originalValuesRef.current[field] = currentValue
  }
  
  // Log audit change
  async function logAuditChange(fieldName, oldValue, newValue) {
    if (!reportId) return
    
    try {
      await supabase.from('report_audit_log').insert({
        report_id: reportId,
        entity_type: 'NDTInspectionLog',
        entity_id: logId || ndtData.inspection_number,
        field_name: fieldName,
        old_value: oldValue !== undefined ? String(oldValue) : null,
        new_value: newValue !== undefined ? String(newValue) : null,
        action_type: 'field_change',
        change_type: 'edit',
        section: `NDT - ${ndtData.method || 'Unknown'}`,
        weld_number: weldNumber,
        regulatory_category: 'integrity',
        is_critical: ['interpretation_result', 'technique_shot_approved', 'defects'].includes(fieldName),
        changed_at: new Date().toISOString()
      })
    } catch (err) {
      console.error('Audit log error:', err)
    }
  }
  
  // Add defect entry
  function addDefect() {
    const newDefect = {
      id: Date.now(),
      type: '',
      location: '',
      size: '',
      disposition: ''
    }
    updateField('defects', [...(ndtData.defects || []), newDefect])
  }
  
  function updateDefect(id, field, value) {
    const updated = ndtData.defects.map(d => 
      d.id === id ? { ...d, [field]: value } : d
    )
    updateField('defects', updated)
  }
  
  function removeDefect(id) {
    updateField('defects', ndtData.defects.filter(d => d.id !== id))
  }

  // ============================================================================
  // STYLES
  // ============================================================================
  const sectionStyle = {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #dee2e6'
  }

  const sectionHeaderStyle = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: '15px',
    paddingBottom: '8px',
    borderBottom: '2px solid #17a2b8'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#666',
    marginBottom: '4px'
  }

  const inputStyle = {
    width: '100%',
    padding: '8px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box'
  }

  const selectStyle = {
    ...inputStyle,
    backgroundColor: 'white'
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px'
  }

  const checkboxLabelStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    cursor: 'pointer'
  }

  const warningStyle = {
    padding: '10px 15px',
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '4px',
    color: '#856404',
    marginBottom: '15px'
  }

  const errorStyle = {
    ...warningStyle,
    backgroundColor: '#f8d7da',
    borderColor: '#f5c6cb',
    color: '#721c24'
  }

  const successStyle = {
    ...warningStyle,
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
    color: '#155724'
  }

  const calcResultStyle = {
    padding: '10px 15px',
    backgroundColor: ugResult && ugResult > MAX_ALLOWABLE_UG ? '#f8d7da' : '#d4edda',
    border: `1px solid ${ugResult && ugResult > MAX_ALLOWABLE_UG ? '#f5c6cb' : '#c3e6cb'}`,
    borderRadius: '4px',
    marginTop: '10px'
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Technique Approval Warning */}
      {ndtData.method === 'RT' && !ndtData.technique_shot_approved && (
        <div style={techniqueApproved ? successStyle : warningStyle}>
          {checkingTechnique ? (
            <span>🔄 Checking technique approval status...</span>
          ) : techniqueApproved ? (
            <span>
              ✅ Technique shot approved on {techniqueApproved.inspection_date} by {techniqueApproved.technician_name}
            </span>
          ) : (
            <span>
              ⚠️ <strong>No approved technique shot found</strong> for {pipeDiameter} x {wallThickness}mm. 
              Production welding entries are blocked until a technique is logged and approved.
            </span>
          )}
        </div>
      )}

      {/* Method Selection */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🔬 NDT Method Selection</div>
        
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Inspection Method *</label>
            <select
              style={selectStyle}
              value={ndtData.method}
              onChange={(e) => updateField('method', e.target.value)}
              onFocus={() => handleFocus('method', ndtData.method)}
            >
              <option value="">-- Select Method --</option>
              <option value="RT">RT - Radiographic Testing</option>
              <option value="UT">UT - Ultrasonic Testing</option>
              <option value="MT">MT - Magnetic Particle</option>
              <option value="PT">PT - Penetrant Testing</option>
              <option value="VT">VT - Visual Testing</option>
            </select>
          </div>

          {/* UT Sub-toggle */}
          {ndtData.method === 'UT' && (
            <div>
              <label style={labelStyle}>UT Type *</label>
              <select
                style={selectStyle}
                value={ndtData.ut_subtype}
                onChange={(e) => updateField('ut_subtype', e.target.value)}
                onFocus={() => handleFocus('ut_subtype', ndtData.ut_subtype)}
              >
                <option value="">-- Select UT Type --</option>
                <option value="AUT">AUT - Automated UT</option>
                <option value="Manual">Manual UT</option>
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Inspection Number</label>
            <input
              type="text"
              style={inputStyle}
              value={ndtData.inspection_number}
              onChange={(e) => updateField('inspection_number', e.target.value)}
              onFocus={() => handleFocus('inspection_number', ndtData.inspection_number)}
              placeholder="e.g., NDT-2026-001"
            />
          </div>

          <div>
            <label style={labelStyle}>Spread Number</label>
            <input
              type="text"
              style={inputStyle}
              value={ndtData.spread_number}
              onChange={(e) => updateField('spread_number', e.target.value)}
              onFocus={() => handleFocus('spread_number', ndtData.spread_number)}
              placeholder="e.g., Spread #1"
            />
          </div>

          <div>
            <label style={labelStyle}>Inspection Date *</label>
            <input
              type="date"
              style={inputStyle}
              value={ndtData.inspection_date}
              onChange={(e) => updateField('inspection_date', e.target.value)}
              onFocus={() => handleFocus('inspection_date', ndtData.inspection_date)}
            />
          </div>
        </div>
      </div>

      {/* Technician Info */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>👤 Technician Information</div>
        
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Technician Name *</label>
            <input
              type="text"
              style={inputStyle}
              value={ndtData.technician_name}
              onChange={(e) => updateField('technician_name', e.target.value)}
              onFocus={() => handleFocus('technician_name', ndtData.technician_name)}
            />
          </div>

          <div>
            <label style={labelStyle}>Certification Level</label>
            <select
              style={selectStyle}
              value={ndtData.technician_cert_level}
              onChange={(e) => updateField('technician_cert_level', e.target.value)}
              onFocus={() => handleFocus('technician_cert_level', ndtData.technician_cert_level)}
            >
              <option value="">-- Select --</option>
              <option value="RT-I">RT Level I</option>
              <option value="RT-II">RT Level II</option>
              <option value="RT-III">RT Level III</option>
              <option value="UT-I">UT Level I</option>
              <option value="UT-II">UT Level II</option>
              <option value="UT-III">UT Level III</option>
              <option value="MT-II">MT Level II</option>
              <option value="PT-II">PT Level II</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Certification Number</label>
            <input
              type="text"
              style={inputStyle}
              value={ndtData.technician_cert_number}
              onChange={(e) => updateField('technician_cert_number', e.target.value)}
              onFocus={() => handleFocus('technician_cert_number', ndtData.technician_cert_number)}
            />
          </div>
        </div>
      </div>

      {/* ========== RT-SPECIFIC FIELDS ========== */}
      {ndtData.method === 'RT' && (
        <>
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>☢️ Radiographic Testing Parameters</div>
            
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>RT Technique *</label>
                <select
                  style={selectStyle}
                  value={ndtData.rt_technique}
                  onChange={(e) => updateField('rt_technique', e.target.value)}
                  onFocus={() => handleFocus('rt_technique', ndtData.rt_technique)}
                >
                  <option value="">-- Select --</option>
                  <option value="SWX">SWX - Single Wall X-Ray</option>
                  <option value="DWX">DWX - Double Wall X-Ray</option>
                  <option value="DWG">DWG - Double Wall Gamma</option>
                  <option value="DWSI">DWSI - Double Wall Single Image</option>
                  <option value="DWDI">DWDI - Double Wall Double Image</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Radiation Source</label>
                <select
                  style={selectStyle}
                  value={ndtData.rt_source}
                  onChange={(e) => updateField('rt_source', e.target.value)}
                  onFocus={() => handleFocus('rt_source', ndtData.rt_source)}
                >
                  <option value="">-- Select --</option>
                  <option value="X-Ray">X-Ray</option>
                  <option value="Ir-192">Ir-192 (Iridium)</option>
                  <option value="Co-60">Co-60 (Cobalt)</option>
                  <option value="Se-75">Se-75 (Selenium)</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>IQI Type</label>
                <select
                  style={selectStyle}
                  value={ndtData.iqi_type}
                  onChange={(e) => updateField('iqi_type', e.target.value)}
                  onFocus={() => handleFocus('iqi_type', ndtData.iqi_type)}
                >
                  <option value="">-- Select --</option>
                  <option value="Wire">Wire Type (ASTM E747)</option>
                  <option value="Hole">Hole Type (ASTM E1025)</option>
                  <option value="Step-Hole">Step-Hole</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>IQI Visibility</label>
                <input
                  type="text"
                  style={inputStyle}
                  value={ndtData.iqi_visibility}
                  onChange={(e) => updateField('iqi_visibility', e.target.value)}
                  onFocus={() => handleFocus('iqi_visibility', ndtData.iqi_visibility)}
                  placeholder="e.g., 2-2T"
                />
              </div>
            </div>

            {/* Density & Sensitivity */}
            <div style={{ ...gridStyle, marginTop: '15px' }}>
              <div>
                <label style={labelStyle}>Film Density - Weld Area *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  style={inputStyle}
                  value={ndtData.film_density_weld}
                  onChange={(e) => updateField('film_density_weld', e.target.value)}
                  onFocus={() => handleFocus('film_density_weld', ndtData.film_density_weld)}
                  placeholder="1.8 - 4.0"
                />
              </div>

              <div>
                <label style={labelStyle}>Film Density - Pipe Area *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  style={inputStyle}
                  value={ndtData.film_density_pipe}
                  onChange={(e) => updateField('film_density_pipe', e.target.value)}
                  onFocus={() => handleFocus('film_density_pipe', ndtData.film_density_pipe)}
                  placeholder="1.8 - 4.0"
                />
              </div>

              <div>
                <label style={labelStyle}>Sensitivity (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  style={inputStyle}
                  value={ndtData.sensitivity}
                  onChange={(e) => updateField('sensitivity', e.target.value)}
                  onFocus={() => handleFocus('sensitivity', ndtData.sensitivity)}
                  placeholder="e.g., 2.0"
                />
              </div>
            </div>

            {/* Geometric Unsharpness Calculator */}
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
                📐 Geometric Unsharpness Calculator (Ug = Fd/D)
              </div>
              
              <div style={gridStyle}>
                <div>
                  <label style={labelStyle}>Focal Spot Size (F) mm</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    style={inputStyle}
                    value={ndtData.focal_spot_size}
                    onChange={(e) => updateField('focal_spot_size', e.target.value)}
                    onFocus={() => handleFocus('focal_spot_size', ndtData.focal_spot_size)}
                    placeholder="e.g., 3.0"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Source-to-Object (D) mm</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    style={inputStyle}
                    value={ndtData.source_to_object}
                    onChange={(e) => updateField('source_to_object', e.target.value)}
                    onFocus={() => handleFocus('source_to_object', ndtData.source_to_object)}
                    placeholder="e.g., 600"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Object-to-Film (d) mm</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    style={inputStyle}
                    value={ndtData.object_to_film}
                    onChange={(e) => updateField('object_to_film', e.target.value)}
                    onFocus={() => handleFocus('object_to_film', ndtData.object_to_film)}
                    placeholder="e.g., 10"
                  />
                </div>
              </div>

              {ugResult !== null && (
                <div style={calcResultStyle}>
                  <strong>Calculated Ug: {ugResult} mm</strong>
                  {ugResult > MAX_ALLOWABLE_UG ? (
                    <span style={{ color: '#721c24', marginLeft: '10px' }}>
                      ❌ EXCEEDS max allowable ({MAX_ALLOWABLE_UG} mm)
                    </span>
                  ) : (
                    <span style={{ color: '#155724', marginLeft: '10px' }}>
                      ✅ Within allowable limit ({MAX_ALLOWABLE_UG} mm)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Technique Shot Approval Checkbox */}
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={ndtData.technique_shot_approved}
                  onChange={(e) => updateField('technique_shot_approved', e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontWeight: 'bold' }}>
                  ✓ TECHNIQUE SHOT APPROVED
                </span>
                <span style={{ fontSize: '12px', color: '#666' }}>
                  (Required before production welding can proceed for this pipe spec)
                </span>
              </label>
            </div>
          </div>
        </>
      )}

      {/* ========== AUT-SPECIFIC FIELDS ========== */}
      {ndtData.method === 'UT' && ndtData.ut_subtype === 'AUT' && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>🤖 Automated Ultrasonic Testing (AUT) Parameters</div>
          
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Strip Chart ID *</label>
              <input
                type="text"
                style={inputStyle}
                value={ndtData.strip_chart_id}
                onChange={(e) => updateField('strip_chart_id', e.target.value)}
                onFocus={() => handleFocus('strip_chart_id', ndtData.strip_chart_id)}
                placeholder="e.g., SC-2026-001"
              />
            </div>

            <div>
              <label style={labelStyle}>Crawler Speed (mm/s) *</label>
              <input
                type="text"
                inputMode="decimal"
                style={inputStyle}
                value={ndtData.crawler_speed}
                onChange={(e) => updateField('crawler_speed', e.target.value)}
                onFocus={() => handleFocus('crawler_speed', ndtData.crawler_speed)}
                placeholder="e.g., 50.0"
              />
            </div>

            <div>
              <label style={labelStyle}>Gating Channels *</label>
              <input
                type="text"
                style={inputStyle}
                value={ndtData.gating_channels}
                onChange={(e) => updateField('gating_channels', e.target.value)}
                onFocus={() => handleFocus('gating_channels', ndtData.gating_channels)}
                placeholder="e.g., A, B, C, D"
              />
            </div>

            <div>
              <label style={labelStyle}>Calibration Block</label>
              <input
                type="text"
                style={inputStyle}
                value={ndtData.calibration_block}
                onChange={(e) => updateField('calibration_block', e.target.value)}
                onFocus={() => handleFocus('calibration_block', ndtData.calibration_block)}
                placeholder="Block ID"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========== MANUAL UT-SPECIFIC FIELDS ========== */}
      {ndtData.method === 'UT' && ndtData.ut_subtype === 'Manual' && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>🔊 Manual Ultrasonic Testing Parameters</div>
          
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Probe Angle (degrees) *</label>
              <input
                type="text"
                inputMode="decimal"
                style={inputStyle}
                value={ndtData.probe_angle}
                onChange={(e) => updateField('probe_angle', e.target.value)}
                onFocus={() => handleFocus('probe_angle', ndtData.probe_angle)}
                placeholder="e.g., 45, 60, 70"
              />
            </div>

            <div>
              <label style={labelStyle}>Probe Type</label>
              <select
                style={selectStyle}
                value={ndtData.probe_type}
                onChange={(e) => updateField('probe_type', e.target.value)}
                onFocus={() => handleFocus('probe_type', ndtData.probe_type)}
              >
                <option value="">-- Select --</option>
                <option value="Normal">Normal (0°)</option>
                <option value="Angle">Angle Beam</option>
                <option value="Dual">Dual Element</option>
                <option value="Phased Array">Phased Array</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Frequency (MHz)</label>
              <input
                type="text"
                inputMode="decimal"
                style={inputStyle}
                value={ndtData.frequency_mhz}
                onChange={(e) => updateField('frequency_mhz', e.target.value)}
                onFocus={() => handleFocus('frequency_mhz', ndtData.frequency_mhz)}
                placeholder="e.g., 2.25, 5.0"
              />
            </div>

            <div>
              <label style={labelStyle}>DAC Curve *</label>
              <input
                type="text"
                style={inputStyle}
                value={ndtData.dac_curve}
                onChange={(e) => updateField('dac_curve', e.target.value)}
                onFocus={() => handleFocus('dac_curve', ndtData.dac_curve)}
                placeholder="Reference curve ID"
              />
            </div>

            <div>
              <label style={labelStyle}>Couplant</label>
              <select
                style={selectStyle}
                value={ndtData.couplant}
                onChange={(e) => updateField('couplant', e.target.value)}
                onFocus={() => handleFocus('couplant', ndtData.couplant)}
              >
                <option value="">-- Select --</option>
                <option value="Glycerin">Glycerin</option>
                <option value="Water">Water</option>
                <option value="Oil">Oil</option>
                <option value="Gel">Ultrasonic Gel</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Quality Criteria (for RT primarily) */}
      {ndtData.method === 'RT' && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>✅ Quality Criteria Assessment</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
            {[
              { key: 'coverage_acceptable', label: 'Coverage' },
              { key: 'density_weld_acceptable', label: 'Density - Weld' },
              { key: 'density_pipe_acceptable', label: 'Density - Pipe' },
              { key: 'film_id_acceptable', label: 'Film ID' },
              { key: 'sensitivity_acceptable', label: 'Sensitivity' },
              { key: 'reporting_acceptable', label: 'Reporting' }
            ].map(({ key, label }) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <select
                  style={selectStyle}
                  value={ndtData[key] === null ? '' : ndtData[key] ? 'Acc' : 'Rej'}
                  onChange={(e) => updateField(key, e.target.value === '' ? null : e.target.value === 'Acc')}
                  onFocus={() => handleFocus(key, ndtData[key])}
                >
                  <option value="">-- Select --</option>
                  <option value="Acc">Acc - Acceptable</option>
                  <option value="Rej">Rej - Reject</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interpretation Result */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📋 Interpretation & Result</div>
        
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Interpretation Result *</label>
            <select
              style={selectStyle}
              value={ndtData.interpretation_result}
              onChange={(e) => updateField('interpretation_result', e.target.value)}
              onFocus={() => handleFocus('interpretation_result', ndtData.interpretation_result)}
            >
              <option value="">-- Select --</option>
              <option value="accept">✅ Accept</option>
              <option value="reject">❌ Reject</option>
              <option value="repair">🔧 Repair Required</option>
              <option value="rescan">🔄 Rescan Required</option>
              <option value="acceptable_to_code">📝 Acceptable to Code</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Level III Agrees?</label>
            <select
              style={selectStyle}
              value={ndtData.interpretation_agree === null ? '' : ndtData.interpretation_agree ? 'Yes' : 'No'}
              onChange={(e) => updateField('interpretation_agree', e.target.value === '' ? null : e.target.value === 'Yes')}
              onFocus={() => handleFocus('interpretation_agree', ndtData.interpretation_agree)}
            >
              <option value="">-- Select --</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <select
              style={selectStyle}
              value={ndtData.status}
              onChange={(e) => updateField('status', e.target.value)}
              onFocus={() => handleFocus('status', ndtData.status)}
            >
              <option value="pending">Pending Review</option>
              <option value="reviewed">Reviewed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Defects Section */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={sectionHeaderStyle}>🔍 Defects Found</div>
          <button
            type="button"
            onClick={addDefect}
            style={{
              padding: '6px 12px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            + Add Defect
          </button>
        </div>

        {ndtData.defects && ndtData.defects.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#e9ecef' }}>
                <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px' }}>Type</th>
                <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px' }}>Location</th>
                <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px' }}>Size</th>
                <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px' }}>Disposition</th>
                <th style={{ padding: '8px', width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {ndtData.defects.map((defect) => (
                <tr key={defect.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '8px' }}>
                    <select
                      style={{ ...selectStyle, fontSize: '12px' }}
                      value={defect.type}
                      onChange={(e) => updateDefect(defect.id, 'type', e.target.value)}
                    >
                      <option value="">--</option>
                      <option value="IP">IP - Incomplete Penetration</option>
                      <option value="IF">IF - Incomplete Fusion</option>
                      <option value="P">P - Porosity</option>
                      <option value="CP">CP - Cluster Porosity</option>
                      <option value="SI">SI - Slag Inclusion</option>
                      <option value="TC">TC - Transverse Crack</option>
                      <option value="LC">LC - Longitudinal Crack</option>
                      <option value="UC">UC - Undercut</option>
                      <option value="BT">BT - Burn Through</option>
                      <option value="HB">HB - Hollow Bead</option>
                    </select>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="text"
                      style={{ ...inputStyle, fontSize: '12px' }}
                      value={defect.location}
                      onChange={(e) => updateDefect(defect.id, 'location', e.target.value)}
                      placeholder="e.g., 3 o'clock"
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="text"
                      style={{ ...inputStyle, fontSize: '12px' }}
                      value={defect.size}
                      onChange={(e) => updateDefect(defect.id, 'size', e.target.value)}
                      placeholder="e.g., 5mm"
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <select
                      style={{ ...selectStyle, fontSize: '12px' }}
                      value={defect.disposition}
                      onChange={(e) => updateDefect(defect.id, 'disposition', e.target.value)}
                    >
                      <option value="">--</option>
                      <option value="Accept">Accept</option>
                      <option value="Repair">Repair</option>
                      <option value="Cut-out">Cut-out</option>
                    </select>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => removeDefect(defect.id)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px'
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: '#6c757d', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            No defects recorded
          </div>
        )}
      </div>

      {/* Comments */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>💬 Comments</div>
        <textarea
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
          value={ndtData.comments}
          onChange={(e) => updateField('comments', e.target.value)}
          onFocus={() => handleFocus('comments', ndtData.comments)}
          placeholder="Additional notes or observations..."
        />
      </div>
    </div>
  )
}

// ============================================================================
// EXPORTS
// ============================================================================
export default NDTInspectionLog

export {
  PRECISION_MAP,
  getPrecision,
  roundToPrecision,
  valuesAreDifferent,
  calculateGeometricUnsharpness,
  checkTechniqueApproval,
  MAX_ALLOWABLE_UG
}
