// ============================================================================
// ConventionalBoreLog.jsx
// Comprehensive logging for Track Bores, Sling/Cradle Bores, and Auger Bores
// Handles machine instabilities, mud management, and annular space calculations
// Date: January 2026
// ============================================================================

import React, { useState, useRef, useEffect } from 'react'
import { useActivityAudit } from './useActivityAudit'
import { extractGPSFromImage } from './exifUtils'
import DrillingWasteManagement from './DrillingWasteManagement'
import ShieldedInput from './components/common/ShieldedInput.jsx'

// Bore method options
const BORE_METHODS = [
  { value: 'track_bore', label: 'Track Bore' },
  { value: 'sling_cradle', label: 'Sling/Cradle Bore' },
  { value: 'auger_machine', label: 'Auger Bore Machine' },
  { value: 'directional_drill', label: 'Directional Drill (HD Bore)' }
]

// Steering head types
const STEERING_HEAD_TYPES = [
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'hydraulic', label: 'Hydraulic' },
  { value: 'combo', label: 'Combination' }
]

// Mud types for lubricated bores
const MUD_TYPES = [
  { value: 'bentonite', label: 'Bentonite' },
  { value: 'polymer', label: 'Polymer' },
  { value: 'bentonite_polymer', label: 'Bentonite/Polymer Mix' },
  { value: 'water_only', label: 'Water Only' },
  { value: 'none', label: 'None (Dry Bore)' }
]

// Collapsible section wrapper - MUST be defined outside component to prevent remounting
const CollapsibleSection = ({ id, title, expanded, onToggle, color = '#495057', bgColor = '#e9ecef', borderColor = '#dee2e6', contentBgColor = '#f8f9fa', alert = false, children }) => (
  <div style={{ marginBottom: '10px' }}>
    <div
      style={{
        fontSize: '14px',
        fontWeight: 'bold',
        color: alert ? '#721c24' : color,
        padding: '12px 15px',
        backgroundColor: alert ? '#f8d7da' : bgColor,
        borderRadius: expanded ? '6px 6px 0 0' : '6px',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        userSelect: 'none',
        border: `1px solid ${alert ? '#dc3545' : borderColor}`
      }}
      onClick={() => onToggle(id)}
    >
      <span>{alert && '!! '}{title}</span>
      <span style={{ fontSize: '18px' }}>{expanded ? '−' : '+'}</span>
    </div>
    {expanded && (
      <div
        style={{
          padding: '15px',
          backgroundColor: alert ? '#fff5f5' : contentBgColor,
          borderRadius: '0 0 6px 6px',
          border: `1px solid ${alert ? '#dc3545' : borderColor}`,
          borderTop: 'none'
        }}
      >
        {children}
      </div>
    )}
  </div>
)

function ConventionalBoreLog({
  data,
  onChange,
  contractor,
  foreman,
  reportDate,
  startKP,
  endKP,
  metersToday,
  logId,
  reportId
}) {
  // Collapsible section states - all start expanded for better UX
  const [expandedSections, setExpandedSections] = useState({
    boreInfo: true,
    methodSpecific: true,
    alignment: true,
    fluidMud: true,
    annularGrout: true,
    evidence: true,
    wasteManagement: true,
    comments: true
  })

  const [showWasteManagement, setShowWasteManagement] = useState(data?.wasteManagementEnabled || false)
  const [processingPhoto, setProcessingPhoto] = useState(false)

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Audit trail hook
  const {
    initializeOriginalValues,
    logFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'ConventionalBoreLog')

  const originalValuesRef = useRef({})

  // Default data structure
  const defaultData = {
    // Bore Information
    boreId: '',
    boreMethod: '',
    crossingType: '',
    crossingDescription: '',
    designEntryKP: '',
    designExitKP: '',
    actualExitKP: '',
    boreLength: '',
    subcontractor: '',
    machineId: '',

    // Method-Specific Fields
    // Sling/Cradle
    winchTension: '',
    boomPositioningVerified: null,
    // Track Bore
    backstopDeadmanConfirmed: null,

    // Alignment & Grade
    startPitchPercent: '',
    exitPitchPercent: '',
    steeringHeadUsed: null,
    steeringHeadType: '',

    // Pipe Specifications
    casingDiameterInches: '',
    casingWallThickness: '',
    carrierDiameterInches: '',
    carrierWallThickness: '',

    // Fluid & Mud Loop
    lubricationRequired: null,
    totalWaterUsedM3: '',
    mudType: '',
    mudVolumeM3: '',

    // Annular Space Grouting
    calculatedAnnulusVolume: '',
    actualGroutPumpedM3: '',
    groutVariancePercent: '',
    groutVarianceAlert: false,

    // Asset & Evidence
    weldId: '',
    exitPitPhoto: null,
    exitPitPhotoGPS: null,
    exitPitPhotoKP: '',

    // Waste Management
    wasteManagementEnabled: false,
    wasteManagementData: {},

    comments: ''
  }

  // Merge incoming data with defaults (same pattern as GradingLog)
  const boreData = {
    ...defaultData,
    ...data,
    wasteManagementData: data?.wasteManagementData || {}
  }

  // Audit handlers
  const handleFieldFocus = (fieldName, currentValue) => {
    initializeOriginalValues(originalValuesRef, fieldName, currentValue)
  }

  const handleFieldBlur = (fieldName, newValue, displayName) => {
    logFieldChange(originalValuesRef, fieldName, newValue, displayName)
  }

  // Update field - calls onChange directly (same as GradingLog pattern)
  const updateField = (field, value) => {
    onChange({ ...boreData, [field]: value })
  }

  // Update with auto-calculated fields
  const updateFieldWithCalc = (field, value) => {
    const newData = { ...boreData, [field]: value }

    // Auto-calculate annulus volume if we have the needed values
    const casingOD = parseFloat(field === 'casingDiameterInches' ? value : newData.casingDiameterInches) || 0
    const carrierOD = parseFloat(field === 'carrierDiameterInches' ? value : newData.carrierDiameterInches) || 0
    const length = parseFloat(field === 'boreLength' ? value : newData.boreLength) || 0

    if (casingOD > 0 && carrierOD > 0 && length > 0 && casingOD > carrierOD) {
      const casingOD_m = casingOD * 0.0254
      const carrierOD_m = carrierOD * 0.0254
      const annularArea = (Math.PI / 4) * (Math.pow(casingOD_m, 2) - Math.pow(carrierOD_m, 2))
      const volume = annularArea * length
      newData.calculatedAnnulusVolume = (Math.round(volume * 10000) / 10000).toString()
    }

    // Auto-calculate grout variance if we have the needed values
    const calculated = parseFloat(newData.calculatedAnnulusVolume) || 0
    const actual = parseFloat(field === 'actualGroutPumpedM3' ? value : newData.actualGroutPumpedM3) || 0
    if (calculated > 0 && actual > 0) {
      const variance = ((actual - calculated) / calculated) * 100
      newData.groutVariancePercent = (Math.round(variance * 10) / 10).toString()
      newData.groutVarianceAlert = Math.abs(variance) > 15
    }

    onChange(newData)
  }

  // Photo upload with GPS extraction
  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setProcessingPhoto(true)

    try {
      // Extract GPS from EXIF
      const gpsData = await extractGPSFromImage(file)

      // Create object URL for preview
      const photoUrl = URL.createObjectURL(file)

      const updates = {
        ...boreData,
        exitPitPhoto: {
          url: photoUrl,
          name: file.name,
          size: file.size,
          type: file.type,
          file: file
        }
      }

      if (gpsData.hasGPS) {
        updates.exitPitPhotoGPS = {
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          accuracy: gpsData.accuracy,
          altitude: gpsData.altitude
        }
      }

      onChange(updates)
      logEntryAdd('Exit Pit Photo', file.name)
    } catch (err) {
      console.error('Photo upload error:', err)
    } finally {
      setProcessingPhoto(false)
    }
  }

  const removePhoto = () => {
    if (boreData.exitPitPhoto?.url) {
      URL.revokeObjectURL(boreData.exitPitPhoto.url)
    }
    onChange({
      ...boreData,
      exitPitPhoto: null,
      exitPitPhotoGPS: null,
      exitPitPhotoKP: ''
    })
    logEntryDelete('Exit Pit Photo', boreData.exitPitPhoto?.name || 'Photo')
  }

  // Waste management toggle
  const toggleWasteManagement = (e) => {
    e.stopPropagation()
    const newEnabled = !showWasteManagement
    setShowWasteManagement(newEnabled)
    onChange({ ...boreData, wasteManagementEnabled: newEnabled })
  }

  const updateWasteManagementData = (wasteData) => {
    onChange({ ...boreData, wasteManagementData: wasteData })
  }

  // Check if we need method-specific fields
  const isSlingCradle = boreData.boreMethod === 'sling_cradle'
  const isTrackBore = boreData.boreMethod === 'track_bore'
  const needsFluidManagement = boreData.lubricationRequired === true || boreData.mudType !== 'none'

  // Check for grout variance alert
  const hasGroutAlert = boreData.groutVarianceAlert

  // Styles
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }
  const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }
  const readOnlyStyle = { ...inputStyle, backgroundColor: '#e9ecef', cursor: 'not-allowed' }

  return (
    <div style={{ marginTop: '15px' }}>
      {/* INHERITED INFO BAR */}
      {(contractor || foreman || reportDate || startKP || endKP) && (
        <div style={{ padding: '12px 15px', backgroundColor: '#e2e3e5', borderRadius: '6px', marginBottom: '15px', border: '1px solid #6c757d' }}>
          <span style={{ fontSize: '13px', color: '#495057' }}>
            <strong>From Activity:</strong>{' '}
            {reportDate && <>Date: <strong>{reportDate}</strong></>}
            {reportDate && contractor && ' | '}
            {contractor && <>Contractor: <strong>{contractor}</strong></>}
            {(reportDate || contractor) && foreman && ' | '}
            {foreman && <>Foreman: <strong>{foreman}</strong></>}
          </span>
          {(startKP || endKP) && (
            <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#d6d8db', borderRadius: '4px' }}>
              <span style={{ fontSize: '13px', color: '#495057' }}>
                <strong>Chainage:</strong>{' '}
                {startKP && <>Entry: <strong>{startKP}</strong></>}
                {startKP && endKP && ' → '}
                {endKP && <>Exit: <strong>{endKP}</strong></>}
                {metersToday && <> | <strong style={{ color: '#155724' }}>{metersToday}m Today</strong></>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 1. BORE INFORMATION */}
      <CollapsibleSection id="boreInfo" title="BORE INFORMATION" expanded={expandedSections.boreInfo} onToggle={toggleSection}>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Bore ID</label>
            <ShieldedInput type="text" value={boreData.boreId}
              onFocus={() => handleFieldFocus('boreId', boreData.boreId)}
              onChange={(val) => updateField('boreId', val)}
              onBlur={(e) => handleFieldBlur('boreId', e.target.value, 'Bore ID')}
              placeholder="e.g. CB-001" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Bore Method *</label>
            <select value={boreData.boreMethod}
              onChange={(e) => updateField('boreMethod', e.target.value, 'Bore Method')}
              style={{ ...selectStyle, borderColor: !boreData.boreMethod ? '#ffc107' : '#ced4da' }}>
              <option value="">Select Method...</option>
              {BORE_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Crossing Type</label>
            <select value={boreData.crossingType}
              onChange={(e) => updateField('crossingType', e.target.value, 'Crossing Type')}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="road">Road Crossing</option>
              <option value="railway">Railway Crossing</option>
              <option value="creek">Creek/Drainage</option>
              <option value="utility">Utility Crossing</option>
              <option value="highway">Highway Crossing</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Crossing Description</label>
            <ShieldedInput type="text" value={boreData.crossingDescription}
              onFocus={() => handleFieldFocus('crossingDescription', boreData.crossingDescription)}
              onChange={(val) => updateField('crossingDescription', val)}
              onBlur={(e) => handleFieldBlur('crossingDescription', e.target.value, 'Crossing Description')}
              placeholder="e.g. Township Road 42" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Design Entry KP</label>
            <ShieldedInput type="text" value={boreData.designEntryKP}
              onFocus={() => handleFieldFocus('designEntryKP', boreData.designEntryKP)}
              onChange={(val) => updateField('designEntryKP', val)}
              onBlur={(e) => handleFieldBlur('designEntryKP', e.target.value, 'Design Entry KP')}
              placeholder="e.g. 5+250" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Design Exit KP</label>
            <ShieldedInput type="text" value={boreData.designExitKP}
              onFocus={() => handleFieldFocus('designExitKP', boreData.designExitKP)}
              onChange={(val) => updateField('designExitKP', val)}
              onBlur={(e) => handleFieldBlur('designExitKP', e.target.value, 'Design Exit KP')}
              placeholder="e.g. 5+290" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Bore Length (m)</label>
            <ShieldedInput type="text" inputMode="decimal" value={boreData.boreLength}
              onFocus={() => handleFieldFocus('boreLength', boreData.boreLength)}
              onChange={(val) => updateFieldWithCalc('boreLength', val)}
              onBlur={(e) => handleFieldBlur('boreLength', e.target.value, 'Bore Length')}
              placeholder="Total length" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Subcontractor</label>
            <ShieldedInput type="text" value={boreData.subcontractor}
              onFocus={() => handleFieldFocus('subcontractor', boreData.subcontractor)}
              onChange={(val) => updateField('subcontractor', val)}
              onBlur={(e) => handleFieldBlur('subcontractor', e.target.value, 'Subcontractor')}
              placeholder="Bore subcontractor" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Machine ID</label>
            <ShieldedInput type="text" value={boreData.machineId}
              onFocus={() => handleFieldFocus('machineId', boreData.machineId)}
              onChange={(val) => updateField('machineId', val)}
              onBlur={(e) => handleFieldBlur('machineId', e.target.value, 'Machine ID')}
              placeholder="Equipment ID" style={inputStyle} />
          </div>
        </div>

        {/* Pipe Specifications */}
        <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #dee2e6' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#495057', marginBottom: '10px' }}>Pipe Specifications</div>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Casing Diameter (in)</label>
              <ShieldedInput type="text" inputMode="decimal" value={boreData.casingDiameterInches}
                onFocus={() => handleFieldFocus('casingDiameterInches', boreData.casingDiameterInches)}
                onChange={(val) => updateFieldWithCalc('casingDiameterInches', val)}
                onBlur={(e) => handleFieldBlur('casingDiameterInches', e.target.value, 'Casing Diameter')}
                placeholder="e.g. 30" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Casing Wall (in)</label>
              <ShieldedInput type="text" inputMode="decimal" value={boreData.casingWallThickness}
                onFocus={() => handleFieldFocus('casingWallThickness', boreData.casingWallThickness)}
                onChange={(val) => updateField('casingWallThickness', val)}
                onBlur={(e) => handleFieldBlur('casingWallThickness', e.target.value, 'Casing Wall Thickness')}
                placeholder="e.g. 0.375" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Carrier Pipe Diameter (in)</label>
              <ShieldedInput type="text" inputMode="decimal" value={boreData.carrierDiameterInches}
                onFocus={() => handleFieldFocus('carrierDiameterInches', boreData.carrierDiameterInches)}
                onChange={(val) => updateFieldWithCalc('carrierDiameterInches', val)}
                onBlur={(e) => handleFieldBlur('carrierDiameterInches', e.target.value, 'Carrier Diameter')}
                placeholder="e.g. 24" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Carrier Wall (in)</label>
              <ShieldedInput type="text" inputMode="decimal" value={boreData.carrierWallThickness}
                onFocus={() => handleFieldFocus('carrierWallThickness', boreData.carrierWallThickness)}
                onChange={(val) => updateField('carrierWallThickness', val)}
                onBlur={(e) => handleFieldBlur('carrierWallThickness', e.target.value, 'Carrier Wall Thickness')}
                placeholder="e.g. 0.500" style={inputStyle} />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. METHOD-SPECIFIC STABILITY CHECKS */}
      {boreData.boreMethod && (
        <CollapsibleSection
          id="methodSpecific"
          title={`${boreData.boreMethod === 'sling_cradle' ? 'SLING/CRADLE' : boreData.boreMethod === 'track_bore' ? 'TRACK BORE' : 'AUGER'} STABILITY CHECKS`}
          expanded={expandedSections.methodSpecific}
          onToggle={toggleSection}
          color="#856404"
          bgColor="#fff3cd"
          borderColor="#ffc107"
          contentBgColor="#fffef5"
        >
          {isSlingCradle && (
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Winch Tension (lbs)</label>
                <ShieldedInput type="text" inputMode="numeric" value={boreData.winchTension}
                  onFocus={() => handleFieldFocus('winchTension', boreData.winchTension)}
                  onChange={(val) => updateField('winchTension', val)}
                  onBlur={(e) => handleFieldBlur('winchTension', e.target.value, 'Winch Tension')}
                  placeholder="Measured tension" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Boom Positioning Verified?</label>
                <select value={boreData.boomPositioningVerified === null ? '' : boreData.boomPositioningVerified ? 'yes' : 'no'}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : e.target.value === 'yes'
                    updateField('boomPositioningVerified', val, 'Boom Positioning Verified')
                  }}
                  style={{ ...selectStyle, backgroundColor: boreData.boomPositioningVerified === true ? '#d4edda' : boreData.boomPositioningVerified === false ? '#f8d7da' : 'white' }}>
                  <option value="">Select...</option>
                  <option value="yes">Yes - Machine Level</option>
                  <option value="no">No - Tilt Detected</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: '11px', color: '#856404', margin: 0, padding: '8px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                  <strong>Sling Bore Safety:</strong> Verify boom positioning before start to ensure machine did not tilt. Monitor winch tension throughout bore operation.
                </p>
              </div>
            </div>
          )}

          {isTrackBore && (
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Backstop/Deadman Stability Confirmed?</label>
                <select value={boreData.backstopDeadmanConfirmed === null ? '' : boreData.backstopDeadmanConfirmed ? 'yes' : 'no'}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : e.target.value === 'yes'
                    updateField('backstopDeadmanConfirmed', val, 'Backstop/Deadman Confirmed')
                  }}
                  style={{ ...selectStyle, backgroundColor: boreData.backstopDeadmanConfirmed === true ? '#d4edda' : boreData.backstopDeadmanConfirmed === false ? '#f8d7da' : 'white' }}>
                  <option value="">Select...</option>
                  <option value="yes">Yes - Stable</option>
                  <option value="no">No - Requires Attention</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: '11px', color: '#856404', margin: 0, padding: '8px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                  <strong>Track Bore Safety:</strong> Confirm backstop/deadman is properly set and stable before starting bore. Monitor throughout operation for any movement.
                </p>
              </div>
            </div>
          )}

          {boreData.boreMethod === 'auger_machine' && (
            <div style={{ padding: '10px', backgroundColor: '#d1ecf1', borderRadius: '4px' }}>
              <p style={{ fontSize: '12px', color: '#0c5460', margin: 0 }}>
                <strong>Auger Bore Machine:</strong> Standard auger operation. Ensure proper spoil removal and monitor torque readings.
              </p>
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* 3. ALIGNMENT & GRADE VERIFICATION */}
      <CollapsibleSection
        id="alignment"
        title="ALIGNMENT & GRADE VERIFICATION"
        expanded={expandedSections.alignment}
        onToggle={toggleSection}
        color="#0c5460"
        bgColor="#d1ecf1"
        borderColor="#17a2b8"
        contentBgColor="#e8f7fc"
      >
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Actual Exit KP</label>
            <ShieldedInput type="text" value={boreData.actualExitKP}
              onFocus={() => handleFieldFocus('actualExitKP', boreData.actualExitKP)}
              onChange={(val) => updateField('actualExitKP', val)}
              onBlur={(e) => handleFieldBlur('actualExitKP', e.target.value, 'Actual Exit KP')}
              placeholder="Measured exit KP" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Start Pitch (%)</label>
            <ShieldedInput type="text" inputMode="decimal" value={boreData.startPitchPercent}
              onFocus={() => handleFieldFocus('startPitchPercent', boreData.startPitchPercent)}
              onChange={(val) => updateField('startPitchPercent', val)}
              onBlur={(e) => handleFieldBlur('startPitchPercent', e.target.value, 'Start Pitch')}
              placeholder="e.g. -2.5" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Exit Pitch (%)</label>
            <ShieldedInput type="text" inputMode="decimal" value={boreData.exitPitchPercent}
              onFocus={() => handleFieldFocus('exitPitchPercent', boreData.exitPitchPercent)}
              onChange={(val) => updateField('exitPitchPercent', val)}
              onBlur={(e) => handleFieldBlur('exitPitchPercent', e.target.value, 'Exit Pitch')}
              placeholder="e.g. +1.5" style={inputStyle} />
          </div>
        </div>

        {/* Steering Head */}
        <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #17a2b8' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0c5460', marginBottom: '10px' }}>Steering Head</div>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Steering Head Used?</label>
              <select value={boreData.steeringHeadUsed === null ? '' : boreData.steeringHeadUsed ? 'yes' : 'no'}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : e.target.value === 'yes'
                  updateField('steeringHeadUsed', val, 'Steering Head Used')
                }}
                style={selectStyle}>
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            {boreData.steeringHeadUsed && (
              <div>
                <label style={labelStyle}>Steering Head Type</label>
                <select value={boreData.steeringHeadType}
                  onChange={(e) => updateField('steeringHeadType', e.target.value, 'Steering Head Type')}
                  style={selectStyle}>
                  <option value="">Select Type...</option>
                  {STEERING_HEAD_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* KP Variance Display */}
        {boreData.designExitKP && boreData.actualExitKP && (
          <div style={{ marginTop: '15px', padding: '12px', backgroundColor: boreData.designExitKP !== boreData.actualExitKP ? '#fff3cd' : '#d4edda', borderRadius: '6px', border: '1px solid ' + (boreData.designExitKP !== boreData.actualExitKP ? '#ffc107' : '#28a745') }}>
            <div style={{ fontSize: '12px' }}>
              <strong>Exit KP Comparison:</strong> Design: {boreData.designExitKP} | Actual: {boreData.actualExitKP}
              {boreData.designExitKP !== boreData.actualExitKP && (
                <span style={{ color: '#856404', marginLeft: '10px' }}>(Variance Detected)</span>
              )}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 4. FLUID & MUD LOOP (Directive 050) */}
      <CollapsibleSection
        id="fluidMud"
        title="FLUID & MUD LOOP (Directive 050)"
        expanded={expandedSections.fluidMud}
        onToggle={toggleSection}
        color="#17a2b8"
        bgColor="#d1ecf1"
        borderColor="#17a2b8"
        contentBgColor="#e8f7fc"
      >
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Lubrication Required?</label>
            <select value={boreData.lubricationRequired === null ? '' : boreData.lubricationRequired ? 'yes' : 'no'}
              onChange={(e) => {
                const val = e.target.value === '' ? null : e.target.value === 'yes'
                updateField('lubricationRequired', val, 'Lubrication Required')
              }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="yes">Yes - Lubricated Bore</option>
              <option value="no">No - Dry Bore</option>
            </select>
          </div>
          {boreData.lubricationRequired && (
            <>
              <div>
                <label style={labelStyle}>Total Water Used (m³)</label>
                <ShieldedInput type="text" inputMode="decimal" value={boreData.totalWaterUsedM3}
                  onFocus={() => handleFieldFocus('totalWaterUsedM3', boreData.totalWaterUsedM3)}
                  onChange={(val) => updateField('totalWaterUsedM3', val)}
                  onBlur={(e) => handleFieldBlur('totalWaterUsedM3', e.target.value, 'Total Water Used')}
                  placeholder="Cubic meters" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Mud Type</label>
                <select value={boreData.mudType}
                  onChange={(e) => updateField('mudType', e.target.value, 'Mud Type')}
                  style={selectStyle}>
                  <option value="">Select...</option>
                  {MUD_TYPES.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              {boreData.mudType && boreData.mudType !== 'water_only' && boreData.mudType !== 'none' && (
                <div>
                  <label style={labelStyle}>Mud Volume (m³)</label>
                  <ShieldedInput type="text" inputMode="decimal" value={boreData.mudVolumeM3}
                    onFocus={() => handleFieldFocus('mudVolumeM3', boreData.mudVolumeM3)}
                    onChange={(val) => updateField('mudVolumeM3', val)}
                    onBlur={(e) => handleFieldBlur('mudVolumeM3', e.target.value, 'Mud Volume')}
                    placeholder="Cubic meters" style={inputStyle} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Waste Management Integration */}
        {boreData.lubricationRequired && (
          <div style={{ marginTop: '15px' }}>
            <button
              onClick={toggleWasteManagement}
              style={{
                padding: '10px 20px',
                backgroundColor: showWasteManagement ? '#dc3545' : '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold'
              }}
            >
              {showWasteManagement ? '− Hide Waste Management' : '+ Enable Waste Management Tracking'}
            </button>
            <p style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
              Track mud hauling, disposal manifests, and compliance per AER Directive 050.
            </p>
          </div>
        )}
      </CollapsibleSection>

      {/* 5. ANNULAR SPACE GROUTING */}
      <CollapsibleSection
        id="annularGrout"
        title="ANNULAR SPACE GROUTING"
        expanded={expandedSections.annularGrout}
        onToggle={toggleSection}
        color={hasGroutAlert ? '#721c24' : '#155724'}
        bgColor={hasGroutAlert ? '#f8d7da' : '#d4edda'}
        borderColor={hasGroutAlert ? '#dc3545' : '#28a745'}
        contentBgColor={hasGroutAlert ? '#fff5f5' : '#f0fff4'}
        alert={hasGroutAlert}
      >
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Calculated Annulus Volume (m³)</label>
            <ShieldedInput type="text" value={boreData.calculatedAnnulusVolume}
              readOnly
              style={readOnlyStyle}
              placeholder="Auto-calculated" />
            <span style={{ fontSize: '10px', color: '#666' }}>Based on casing vs carrier size</span>
          </div>
          <div>
            <label style={labelStyle}>Actual Grout Pumped (m³)</label>
            <ShieldedInput type="text" inputMode="decimal" value={boreData.actualGroutPumpedM3}
              onFocus={() => handleFieldFocus('actualGroutPumpedM3', boreData.actualGroutPumpedM3)}
              onChange={(val) => updateFieldWithCalc('actualGroutPumpedM3', val)}
              onBlur={(e) => handleFieldBlur('actualGroutPumpedM3', e.target.value, 'Actual Grout Pumped')}
              placeholder="Measured volume" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Variance (%)</label>
            <ShieldedInput type="text" value={boreData.groutVariancePercent ? `${boreData.groutVariancePercent}%` : ''}
              readOnly
              style={{
                ...readOnlyStyle,
                backgroundColor: hasGroutAlert ? '#f8d7da' : boreData.groutVariancePercent ? '#d4edda' : '#e9ecef',
                color: hasGroutAlert ? '#721c24' : '#155724',
                fontWeight: 'bold'
              }}
              placeholder="Auto-calculated" />
          </div>
        </div>

        {hasGroutAlert && (
          <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#f8d7da', borderRadius: '6px', border: '2px solid #dc3545' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#721c24' }}>
              VARIANCE ALERT: {boreData.groutVariancePercent}% exceeds 15% threshold
            </div>
            <p style={{ fontSize: '12px', color: '#721c24', margin: '8px 0 0 0' }}>
              This may indicate a void in the bore path or a grout leak. Investigate and document the cause.
            </p>
          </div>
        )}

        {!hasGroutAlert && boreData.calculatedAnnulusVolume && boreData.actualGroutPumpedM3 && (
          <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#d4edda', borderRadius: '6px', border: '1px solid #28a745' }}>
            <div style={{ fontSize: '12px', color: '#155724' }}>
              <strong>Grout Volume Acceptable:</strong> Variance within 15% tolerance.
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 6. ASSET & EVIDENCE LINK */}
      <CollapsibleSection
        id="evidence"
        title="ASSET & EVIDENCE LINK"
        expanded={expandedSections.evidence}
        onToggle={toggleSection}
        color="#6f42c1"
        bgColor="#e2d9f3"
        borderColor="#6f42c1"
        contentBgColor="#f5f0ff"
      >
        {/* Weld ID Link */}
        <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #6f42c1' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#6f42c1', marginBottom: '10px' }}>Carrier Pipe Weld Link</div>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Weld ID (Carrier Pipe)</label>
              <ShieldedInput type="text" value={boreData.weldId}
                onFocus={() => handleFieldFocus('weldId', boreData.weldId)}
                onChange={(val) => updateField('weldId', val)}
                onBlur={(e) => handleFieldBlur('weldId', e.target.value, 'Weld ID')}
                placeholder="Link to pipe string weld" style={inputStyle} />
            </div>
          </div>
          <p style={{ fontSize: '10px', color: '#666', margin: '8px 0 0 0' }}>
            This links the bore to the carrier pipe weld record for traceability.
          </p>
        </div>

        {/* Exit Pit Photo */}
        <div style={{ padding: '12px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #6f42c1' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#6f42c1', marginBottom: '10px' }}>
            Exit Pit Photo (Required)
          </div>
          <p style={{ fontSize: '11px', color: '#666', marginBottom: '10px' }}>
            Upload a photo of the exit pit showing the pipe coming through to verify alignment accuracy.
          </p>

          {!boreData.exitPitPhoto ? (
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
                id="exitPitPhotoInput"
              />
              <label
                htmlFor="exitPitPhotoInput"
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  backgroundColor: '#6f42c1',
                  color: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                {processingPhoto ? 'Processing...' : '+ Upload Exit Pit Photo'}
              </label>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                <img
                  src={boreData.exitPitPhoto.url}
                  alt="Exit Pit"
                  style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '4px', border: '1px solid #6f42c1' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', marginBottom: '5px' }}>
                    <strong>{boreData.exitPitPhoto.name}</strong>
                  </div>
                  {boreData.exitPitPhotoGPS?.latitude && (
                    <div style={{ fontSize: '11px', color: '#155724', marginBottom: '10px' }}>
                      GPS: {boreData.exitPitPhotoGPS.latitude}, {boreData.exitPitPhotoGPS.longitude}
                    </div>
                  )}
                  {!boreData.exitPitPhotoGPS?.latitude && (
                    <div style={{ fontSize: '11px', color: '#856404', marginBottom: '10px' }}>
                      No GPS data in photo
                    </div>
                  )}
                  <div style={{ marginBottom: '10px' }}>
                    <label style={labelStyle}>KP Location</label>
                    <ShieldedInput type="text" value={boreData.exitPitPhotoKP}
                      onFocus={() => handleFieldFocus('exitPitPhotoKP', boreData.exitPitPhotoKP)}
                      onChange={(val) => updateField('exitPitPhotoKP', val)}
                      onBlur={(e) => handleFieldBlur('exitPitPhotoKP', e.target.value, 'Photo KP Location')}
                      placeholder="e.g. 5+290" style={{ ...inputStyle, maxWidth: '150px' }} />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removePhoto() }}
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
                    Remove Photo
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* 7. WASTE MANAGEMENT (Conditional) */}
      {showWasteManagement && (
        <CollapsibleSection
          id="wasteManagement"
          title="DRILLING WASTE MANAGEMENT (Directive 050)"
          expanded={expandedSections.wasteManagement}
          onToggle={toggleSection}
          color="#17a2b8"
          bgColor="#d1ecf1"
          borderColor="#17a2b8"
          contentBgColor="#e8f7fc"
        >
          <DrillingWasteManagement
            data={boreData.wasteManagementData}
            onChange={updateWasteManagementData}
            contractor={contractor}
            foreman={foreman}
            reportDate={reportDate}
            boreId={boreData.boreId}
            crossingId={boreData.crossingDescription}
            startKP={startKP}
            endKP={endKP}
            logId={logId}
            reportId={reportId}
          />
        </CollapsibleSection>
      )}

      {/* 8. COMMENTS */}
      <CollapsibleSection id="comments" title="COMMENTS" expanded={expandedSections.comments} onToggle={toggleSection}>
        <ShieldedInput as="textarea" value={boreData.comments}
          onFocus={() => handleFieldFocus('comments', boreData.comments)}
          onChange={(val) => updateField('comments', val)}
          onBlur={(e) => handleFieldBlur('comments', e.target.value, 'Comments')}
          placeholder="Additional comments, issues, observations, or notes..."
          style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }} />
      </CollapsibleSection>
    </div>
  )
}

export default ConventionalBoreLog
