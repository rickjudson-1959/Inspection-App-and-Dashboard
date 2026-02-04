// ============================================================================
// HDDSteeringLog.jsx
// Real-time guidance tracking for HDD pilot hole steering
// Tracks bore path to ensure it follows engineered tangents
// Date: January 2026
// ============================================================================

import React, { useState, useRef, useEffect } from 'react'
import { useActivityAudit } from './useActivityAudit'
import { extractGPSFromImage } from './exifUtils'
import BufferedInput from './components/BufferedInput'

// Guidance system types
const GUIDANCE_TYPES = [
  { value: 'walk_over_sonde', label: 'Walk-over Sonde' },
  { value: 'wireline_magnetic', label: 'Wireline/Magnetic' },
  { value: 'gyro', label: 'Gyro (Inertial)' }
]

// Minimum bend radius by pipe diameter (industry standards)
const MIN_BEND_RADIUS = {
  6: 150,    // 6" pipe = 150m min radius
  8: 200,    // 8" pipe = 200m min radius
  10: 250,   // 10" pipe = 250m min radius
  12: 300,   // 12" pipe = 300m min radius
  16: 350,   // 16" pipe = 350m min radius
  20: 400,   // 20" pipe = 400m min radius
  24: 450,   // 24" pipe = 450m min radius
  30: 500,   // 30" pipe = 500m min radius
  36: 600,   // 36" pipe = 600m min radius
  42: 700,   // 42" pipe = 700m min radius
  48: 800    // 48" pipe = 800m min radius
}

function HDDSteeringLog({
  data,
  onChange,
  contractor,
  foreman,
  reportDate,
  boreId,
  crossingId,
  startKP,
  endKP,
  logId,
  reportId
}) {
  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState({
    guidanceSetup: false,
    designParameters: false,
    steeringData: false,
    bendingRadius: false,
    evidence: false,
    comments: false
  })

  const [showStations, setShowStations] = useState(data?.stations?.length > 0)
  const [processingFile, setProcessingFile] = useState(false)

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Collapsible section wrapper
  const CollapsibleSection = ({ id, title, color = '#495057', bgColor = '#e9ecef', borderColor = '#dee2e6', contentBgColor = '#f8f9fa', alert = false, children }) => (
    <div style={{ marginBottom: '10px' }}>
      <div
        style={{
          fontSize: '14px',
          fontWeight: 'bold',
          color: alert ? '#721c24' : color,
          padding: '12px 15px',
          backgroundColor: alert ? '#f8d7da' : bgColor,
          borderRadius: expandedSections[id] ? '6px 6px 0 0' : '6px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
          border: `1px solid ${alert ? '#dc3545' : borderColor}`
        }}
        onClick={() => toggleSection(id)}
      >
        <span>{alert && '⚠️ '}{title}</span>
        <span style={{ fontSize: '18px' }}>{expandedSections[id] ? '−' : '+'}</span>
      </div>
      {expandedSections[id] && (
        <div style={{
          padding: '15px',
          backgroundColor: alert ? '#fff5f5' : contentBgColor,
          borderRadius: '0 0 6px 6px',
          border: `1px solid ${alert ? '#dc3545' : borderColor}`,
          borderTop: 'none'
        }}>
          {children}
        </div>
      )}
    </div>
  )

  // Audit trail hook
  const {
    initializeOriginalValues,
    initializeEntryValues,
    logFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'HDDSteeringLog')

  const originalValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure
  const defaultData = {
    // Bore Reference
    boreId: boreId || '',
    crossingId: crossingId || '',
    weldId: '',

    // Guidance System Setup
    guidanceType: '',
    frequencyChannel: '',
    guidanceSystemModel: '',
    calibrationDate: '',
    calibrationVerified: null,

    // Design Parameters
    designEntryAngle: '',
    designExitAngle: '',
    designMaxDepth: '',
    designBoreLength: '',

    // Actual Entry/Exit
    actualEntryAngle: '',
    actualExitAngle: '',

    // Pipe Specifications
    pipeDiameterInches: '',
    pipeWallThickness: '',
    minimumBendRadiusM: '',

    // Stations (per joint/station entries)
    stations: [],

    // Status
    withinDesignTolerance: null,
    boreComplete: false,
    pathAdjustedMidBore: false,
    adjustmentReason: '',

    // Documents
    documents: [],

    comments: ''
  }

  const steeringData = {
    ...defaultData,
    ...data,
    stations: data?.stations || [],
    documents: data?.documents || []
  }

  // Calculate entry/exit variances
  const entryVariance = (parseFloat(steeringData.actualEntryAngle) || 0) - (parseFloat(steeringData.designEntryAngle) || 0)
  const exitVariance = (parseFloat(steeringData.actualExitAngle) || 0) - (parseFloat(steeringData.designExitAngle) || 0)

  // Get minimum bend radius for pipe size
  const getMinBendRadius = (diameter) => {
    const d = parseFloat(diameter) || 0
    // Find closest match
    const sizes = Object.keys(MIN_BEND_RADIUS).map(Number).sort((a, b) => a - b)
    for (const size of sizes) {
      if (d <= size) return MIN_BEND_RADIUS[size]
    }
    return MIN_BEND_RADIUS[48] // Default to largest
  }

  // Check for bending radius alerts in stations
  const hasBendingAlert = steeringData.stations.some(s => s.bendRadiusAlert)
  const alertCount = steeringData.stations.filter(s => s.bendRadiusAlert).length

  // Audit handlers
  const handleFieldFocus = (fieldName, currentValue) => {
    initializeOriginalValues(originalValuesRef, fieldName, currentValue)
  }

  const handleFieldBlur = (fieldName, newValue, displayName) => {
    logFieldChange(originalValuesRef, fieldName, newValue, displayName)
  }

  const handleEntryFieldFocus = (entryId, fieldName, currentValue) => {
    initializeEntryValues(entryValuesRef, entryId, fieldName, currentValue)
  }

  const handleEntryFieldBlur = (entryId, fieldName, newValue, displayName, entryLabel) => {
    logEntryFieldChange(entryValuesRef, entryId, fieldName, newValue, displayName, entryLabel)
  }

  const updateField = (field, value) => {
    const updated = { ...steeringData, [field]: value }

    // Auto-calculate minimum bend radius when pipe diameter changes
    if (field === 'pipeDiameterInches' && value) {
      updated.minimumBendRadiusM = getMinBendRadius(value).toString()
    }

    onChange(updated)
  }

  // Station management
  const addStation = () => {
    const stationNumber = steeringData.stations.length + 1
    const newStation = {
      id: Date.now(),
      stationNumber: stationNumber,
      drillPipeJointNumber: stationNumber,
      measuredDepthM: '',
      pitchPercent: '',
      azimuthDegrees: '',
      calculatedKP: '',
      trueVerticalDepthM: '',
      horizontalOffsetM: '',
      verticalOffsetM: '',
      withinDesignTangent: null,
      tangentVariancePercent: '',
      calculatedBendRadiusM: '',
      bendRadiusAlert: false,
      readingTimestamp: new Date().toISOString().slice(0, 16),
      notes: ''
    }
    onChange({ ...steeringData, stations: [...steeringData.stations, newStation] })
    logEntryAdd('Station', `Joint #${stationNumber}`)
  }

  const updateStation = (id, field, value) => {
    const updated = steeringData.stations.map(station => {
      if (station.id !== id) return station

      const updatedStation = { ...station, [field]: value }

      // Calculate bending radius alert
      if (field === 'calculatedBendRadiusM' || field === 'pitchPercent') {
        const minRadius = parseFloat(steeringData.minimumBendRadiusM) || getMinBendRadius(steeringData.pipeDiameterInches)
        const currentRadius = parseFloat(field === 'calculatedBendRadiusM' ? value : updatedStation.calculatedBendRadiusM) || Infinity

        updatedStation.bendRadiusAlert = currentRadius > 0 && currentRadius < minRadius
      }

      return updatedStation
    })
    onChange({ ...steeringData, stations: updated })
  }

  const removeStation = (id) => {
    const station = steeringData.stations.find(s => s.id === id)
    onChange({ ...steeringData, stations: steeringData.stations.filter(s => s.id !== id) })
    logEntryDelete('Station', `Joint #${station?.drillPipeJointNumber || station?.stationNumber}`)
  }

  // Document upload
  const handleDocumentUpload = async (event, documentType) => {
    const files = Array.from(event.target.files)
    if (files.length === 0) return

    setProcessingFile(true)

    try {
      const newDocs = await Promise.all(files.map(async (file) => {
        const isImage = file.type.startsWith('image/')
        let gpsData = { latitude: null, longitude: null, hasGPS: false }

        if (isImage) {
          gpsData = await extractGPSFromImage(file)
        }

        return {
          id: Date.now() + Math.random(),
          file: file,
          filename: file.name,
          originalName: file.name,
          fileType: isImage ? 'image' : 'pdf',
          fileSizeBytes: file.size,
          documentType: documentType,
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          hasGPS: gpsData.hasGPS,
          kpLocation: startKP || '',
          description: '',
          reportDate: reportDate || '',
          preview: isImage ? URL.createObjectURL(file) : null
        }
      }))

      onChange({ ...steeringData, documents: [...steeringData.documents, ...newDocs] })
      logEntryAdd('Document', `${documentType} upload`)
    } catch (err) {
      console.error('Document upload error:', err)
    } finally {
      setProcessingFile(false)
    }
  }

  const removeDocument = (docId) => {
    const doc = steeringData.documents.find(d => d.id === docId)
    if (doc?.preview) {
      URL.revokeObjectURL(doc.preview)
    }
    onChange({ ...steeringData, documents: steeringData.documents.filter(d => d.id !== docId) })
    logEntryDelete('Document', doc?.documentType || 'Document')
  }

  // Styles
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }
  const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }
  const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' }
  const thStyle = { padding: '8px', backgroundColor: '#17a2b8', color: 'white', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', border: '1px solid #138496' }
  const tdStyle = { padding: '6px', border: '1px solid #dee2e6', textAlign: 'center' }
  const tableInputStyle = { width: '100%', padding: '4px', border: '1px solid #ced4da', borderRadius: '3px', fontSize: '12px', textAlign: 'center', boxSizing: 'border-box' }

  return (
    <div style={{ marginTop: '15px' }}>
      {/* HEADER BAR */}
      <div style={{ padding: '12px 15px', backgroundColor: '#6f42c1', borderRadius: '6px', marginBottom: '15px', border: '1px solid #5a32a3' }}>
        <span style={{ fontSize: '14px', color: 'white', fontWeight: 'bold' }}>
          HDD STEERING LOG - Pilot Hole Guidance
        </span>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#e9ecef' }}>
          {boreId && <>Bore ID: <strong>{boreId}</strong> | </>}
          {crossingId && <>Crossing: <strong>{crossingId}</strong> | </>}
          {reportDate && <>Date: <strong>{reportDate}</strong></>}
        </div>
        {hasBendingAlert && (
          <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#dc3545', borderRadius: '4px', color: 'white', fontWeight: 'bold' }}>
            ⚠️ BENDING RADIUS ALERT: {alertCount} station(s) below minimum allowable radius
          </div>
        )}
      </div>

      {/* 1. GUIDANCE SYSTEM SETUP */}
      <CollapsibleSection
        id="guidanceSetup"
        title="GUIDANCE SYSTEM SETUP"
        color="#6f42c1"
        bgColor="#e2d9f3"
        borderColor="#6f42c1"
        contentBgColor="#f8f5fc"
      >
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Guidance Type</label>
            <select value={steeringData.guidanceType}
              onFocus={() => handleFieldFocus('guidanceType', steeringData.guidanceType)}
              onChange={(e) => { updateField('guidanceType', e.target.value); handleFieldBlur('guidanceType', e.target.value, 'Guidance Type') }}
              style={selectStyle}>
              <option value="">Select...</option>
              {GUIDANCE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Frequency/Channel</label>
            <BufferedInput type="text" value={steeringData.frequencyChannel}
              onFocus={() => handleFieldFocus('frequencyChannel', steeringData.frequencyChannel)}
              onChange={(val) => updateField('frequencyChannel', val)}
              onBlur={(e) => handleFieldBlur('frequencyChannel', e.target.value, 'Frequency/Channel')}
              placeholder="e.g., 12 kHz / Ch 3" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>System Model</label>
            <BufferedInput type="text" value={steeringData.guidanceSystemModel}
              onFocus={() => handleFieldFocus('guidanceSystemModel', steeringData.guidanceSystemModel)}
              onChange={(val) => updateField('guidanceSystemModel', val)}
              onBlur={(e) => handleFieldBlur('guidanceSystemModel', e.target.value, 'System Model')}
              placeholder="e.g., DigiTrak F5" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Calibration Date</label>
            <input type="date" value={steeringData.calibrationDate}
              onFocus={() => handleFieldFocus('calibrationDate', steeringData.calibrationDate)}
              onChange={(e) => updateField('calibrationDate', e.target.value)}
              onBlur={(e) => handleFieldBlur('calibrationDate', e.target.value, 'Calibration Date')}
              style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Calibration Verified?</label>
            <select value={steeringData.calibrationVerified === null ? '' : steeringData.calibrationVerified ? 'yes' : 'no'}
              onFocus={() => handleFieldFocus('calibrationVerified', steeringData.calibrationVerified)}
              onChange={(e) => {
                const val = e.target.value === '' ? null : e.target.value === 'yes'
                updateField('calibrationVerified', val)
                handleFieldBlur('calibrationVerified', val, 'Calibration Verified')
              }}
              style={{ ...selectStyle, backgroundColor: steeringData.calibrationVerified === true ? '#d4edda' : steeringData.calibrationVerified === false ? '#f8d7da' : 'white' }}>
              <option value="">Select...</option>
              <option value="yes">Yes - Verified</option>
              <option value="no">No - Not Verified</option>
            </select>
          </div>
        </div>

        {/* Weld ID Link */}
        <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #6f42c1' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#6f42c1', marginBottom: '10px' }}>Pipe String Link</div>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Weld ID (Pipe String)</label>
              <BufferedInput type="text" value={steeringData.weldId}
                onFocus={() => handleFieldFocus('weldId', steeringData.weldId)}
                onChange={(val) => updateField('weldId', val)}
                onBlur={(e) => handleFieldBlur('weldId', e.target.value, 'Weld ID')}
                placeholder="Weld ID of pipe to be pulled" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Bore ID</label>
              <BufferedInput type="text" value={steeringData.boreId}
                onFocus={() => handleFieldFocus('boreId', steeringData.boreId)}
                onChange={(val) => updateField('boreId', val)}
                onBlur={(e) => handleFieldBlur('boreId', e.target.value, 'Bore ID')}
                placeholder="e.g., HDD-001" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Crossing ID</label>
              <BufferedInput type="text" value={steeringData.crossingId}
                onFocus={() => handleFieldFocus('crossingId', steeringData.crossingId)}
                onChange={(val) => updateField('crossingId', val)}
                onBlur={(e) => handleFieldBlur('crossingId', e.target.value, 'Crossing ID')}
                placeholder="e.g., RX-015" style={inputStyle} />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. DESIGN PARAMETERS & ENTRY/EXIT */}
      <CollapsibleSection
        id="designParameters"
        title="DESIGN vs ACTUAL (Entry/Exit Angles)"
        color="#0c5460"
        bgColor="#d1ecf1"
        borderColor="#17a2b8"
        contentBgColor="#e8f7fc"
      >
        {/* Pipe Specifications */}
        <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #17a2b8' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0c5460', marginBottom: '10px' }}>Pipe Specifications</div>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Pipe Diameter (inches)</label>
              <BufferedInput type="text" inputMode="decimal" value={steeringData.pipeDiameterInches}
                onFocus={() => handleFieldFocus('pipeDiameterInches', steeringData.pipeDiameterInches)}
                onChange={(val) => updateField('pipeDiameterInches', val)}
                onBlur={(e) => handleFieldBlur('pipeDiameterInches', e.target.value, 'Pipe Diameter')}
                placeholder="e.g., 24" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Wall Thickness (inches)</label>
              <BufferedInput type="text" inputMode="decimal" value={steeringData.pipeWallThickness}
                onFocus={() => handleFieldFocus('pipeWallThickness', steeringData.pipeWallThickness)}
                onChange={(val) => updateField('pipeWallThickness', val)}
                onBlur={(e) => handleFieldBlur('pipeWallThickness', e.target.value, 'Wall Thickness')}
                placeholder="e.g., 0.500" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Min Bend Radius (m)</label>
              <BufferedInput type="text" inputMode="numeric" value={steeringData.minimumBendRadiusM}
                onFocus={() => handleFieldFocus('minimumBendRadiusM', steeringData.minimumBendRadiusM)}
                onChange={(val) => updateField('minimumBendRadiusM', val)}
                onBlur={(e) => handleFieldBlur('minimumBendRadiusM', e.target.value, 'Min Bend Radius')}
                placeholder="Auto-calculated" style={{ ...inputStyle, backgroundColor: '#e9ecef' }} />
            </div>
          </div>
        </div>

        {/* Design vs Actual */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          {/* Design */}
          <div style={{ padding: '12px', backgroundColor: '#d1ecf1', borderRadius: '6px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0c5460', marginBottom: '10px' }}>DESIGN</div>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Entry Angle (°)</label>
                <BufferedInput type="text" inputMode="decimal" value={steeringData.designEntryAngle}
                  onFocus={() => handleFieldFocus('designEntryAngle', steeringData.designEntryAngle)}
                  onChange={(val) => updateField('designEntryAngle', val)}
                  onBlur={(e) => handleFieldBlur('designEntryAngle', e.target.value, 'Design Entry Angle')}
                  placeholder="e.g., 12.0" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Exit Angle (°)</label>
                <BufferedInput type="text" inputMode="decimal" value={steeringData.designExitAngle}
                  onFocus={() => handleFieldFocus('designExitAngle', steeringData.designExitAngle)}
                  onChange={(val) => updateField('designExitAngle', val)}
                  onBlur={(e) => handleFieldBlur('designExitAngle', e.target.value, 'Design Exit Angle')}
                  placeholder="e.g., 10.0" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Max Depth (m)</label>
                <BufferedInput type="text" inputMode="decimal" value={steeringData.designMaxDepth}
                  onFocus={() => handleFieldFocus('designMaxDepth', steeringData.designMaxDepth)}
                  onChange={(val) => updateField('designMaxDepth', val)}
                  onBlur={(e) => handleFieldBlur('designMaxDepth', e.target.value, 'Design Max Depth')}
                  placeholder="e.g., 15.0" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Bore Length (m)</label>
                <BufferedInput type="text" inputMode="decimal" value={steeringData.designBoreLength}
                  onFocus={() => handleFieldFocus('designBoreLength', steeringData.designBoreLength)}
                  onChange={(val) => updateField('designBoreLength', val)}
                  onBlur={(e) => handleFieldBlur('designBoreLength', e.target.value, 'Design Bore Length')}
                  placeholder="e.g., 250.0" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Actual */}
          <div style={{ padding: '12px', backgroundColor: '#fff3cd', borderRadius: '6px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#856404', marginBottom: '10px' }}>ACTUAL</div>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Entry Angle (°)</label>
                <BufferedInput type="text" inputMode="decimal" value={steeringData.actualEntryAngle}
                  onFocus={() => handleFieldFocus('actualEntryAngle', steeringData.actualEntryAngle)}
                  onChange={(val) => updateField('actualEntryAngle', val)}
                  onBlur={(e) => handleFieldBlur('actualEntryAngle', e.target.value, 'Actual Entry Angle')}
                  placeholder="e.g., 11.8" style={inputStyle} />
                {steeringData.actualEntryAngle && steeringData.designEntryAngle && (
                  <div style={{ fontSize: '10px', marginTop: '4px', color: Math.abs(entryVariance) > 2 ? '#dc3545' : '#28a745', fontWeight: 'bold' }}>
                    Variance: {entryVariance >= 0 ? '+' : ''}{entryVariance.toFixed(1)}°
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Exit Angle (°)</label>
                <BufferedInput type="text" inputMode="decimal" value={steeringData.actualExitAngle}
                  onFocus={() => handleFieldFocus('actualExitAngle', steeringData.actualExitAngle)}
                  onChange={(val) => updateField('actualExitAngle', val)}
                  onBlur={(e) => handleFieldBlur('actualExitAngle', e.target.value, 'Actual Exit Angle')}
                  placeholder="e.g., 9.5" style={inputStyle} />
                {steeringData.actualExitAngle && steeringData.designExitAngle && (
                  <div style={{ fontSize: '10px', marginTop: '4px', color: Math.abs(exitVariance) > 2 ? '#dc3545' : '#28a745', fontWeight: 'bold' }}>
                    Variance: {exitVariance >= 0 ? '+' : ''}{exitVariance.toFixed(1)}°
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Within Design Tolerance?</label>
                <select value={steeringData.withinDesignTolerance === null ? '' : steeringData.withinDesignTolerance ? 'yes' : 'no'}
                  onFocus={() => handleFieldFocus('withinDesignTolerance', steeringData.withinDesignTolerance)}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : e.target.value === 'yes'
                    updateField('withinDesignTolerance', val)
                    handleFieldBlur('withinDesignTolerance', val, 'Within Design Tolerance')
                  }}
                  style={{ ...selectStyle, backgroundColor: steeringData.withinDesignTolerance === true ? '#d4edda' : steeringData.withinDesignTolerance === false ? '#f8d7da' : 'white', fontWeight: 'bold' }}>
                  <option value="">Select...</option>
                  <option value="yes">Yes - Within Tolerance</option>
                  <option value="no">No - Outside Tolerance</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Bore Complete?</label>
                <select value={steeringData.boreComplete ? 'yes' : 'no'}
                  onChange={(e) => {
                    updateField('boreComplete', e.target.value === 'yes')
                    handleFieldBlur('boreComplete', e.target.value === 'yes', 'Bore Complete')
                  }}
                  style={{ ...selectStyle, backgroundColor: steeringData.boreComplete ? '#d4edda' : 'white' }}>
                  <option value="no">No - In Progress</option>
                  <option value="yes">Yes - Complete</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Path Adjustment */}
        <div style={{ marginTop: '15px', padding: '12px', backgroundColor: steeringData.pathAdjustedMidBore ? '#f8d7da' : '#f8f9fa', borderRadius: '6px', border: `1px solid ${steeringData.pathAdjustedMidBore ? '#dc3545' : '#dee2e6'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: steeringData.pathAdjustedMidBore ? '10px' : '0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox"
                checked={steeringData.pathAdjustedMidBore}
                onChange={(e) => {
                  updateField('pathAdjustedMidBore', e.target.checked)
                  handleFieldBlur('pathAdjustedMidBore', e.target.checked, 'Path Adjusted Mid-Bore')
                }}
                style={{ width: '18px', height: '18px' }}
              />
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: steeringData.pathAdjustedMidBore ? '#721c24' : '#495057' }}>
                Path Adjusted Mid-Bore (Obstacle Avoidance)
              </span>
            </label>
          </div>
          {steeringData.pathAdjustedMidBore && (
            <div>
              <label style={labelStyle}>Adjustment Reason *</label>
              <BufferedInput as="textarea" value={steeringData.adjustmentReason}
                onFocus={() => handleFieldFocus('adjustmentReason', steeringData.adjustmentReason)}
                onChange={(val) => updateField('adjustmentReason', val)}
                onBlur={(e) => handleFieldBlur('adjustmentReason', e.target.value, 'Adjustment Reason')}
                placeholder="Describe why the drill path was adjusted (e.g., utility conflict, rock formation, etc.)..."
                style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* 3. STEERING DATA (Per Joint/Station) */}
      <CollapsibleSection
        id="steeringData"
        title="STEERING DATA (Per Joint/Station)"
        color="#155724"
        bgColor="#d4edda"
        borderColor="#28a745"
        contentBgColor="#f0fff4"
      >
        <div style={{ marginBottom: '15px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowStations(!showStations) }}
            style={{
              padding: '8px 16px',
              backgroundColor: showStations ? '#dc3545' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              marginRight: '10px'
            }}
          >
            {showStations ? '− Hide Station Table' : '+ Show Station Table'}
          </button>
          {showStations && (
            <button
              onClick={(e) => { e.stopPropagation(); addStation() }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              + Add Station Reading
            </button>
          )}
        </div>

        {showStations && (
          <>
            {steeringData.stations.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                No station readings. Click "+ Add Station Reading" to log drill pipe joint data.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Joint #</th>
                      <th style={thStyle}>Depth (m)</th>
                      <th style={thStyle}>Pitch (%)</th>
                      <th style={thStyle}>Azimuth (°)</th>
                      <th style={thStyle}>KP</th>
                      <th style={thStyle}>TVD (m)</th>
                      <th style={thStyle}>H Offset (m)</th>
                      <th style={thStyle}>V Offset (m)</th>
                      <th style={thStyle}>Bend Radius (m)</th>
                      <th style={thStyle}>In Tangent?</th>
                      <th style={{ ...thStyle, width: '50px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steeringData.stations.map((station, idx) => (
                      <tr key={station.id} style={{ backgroundColor: station.bendRadiusAlert ? '#f8d7da' : (idx % 2 === 0 ? '#fff' : '#f8f9fa') }}>
                        <td style={tdStyle}>
                          <BufferedInput type="text" inputMode="numeric" value={station.drillPipeJointNumber}
                            onFocus={() => handleEntryFieldFocus(station.id, 'drillPipeJointNumber', station.drillPipeJointNumber)}
                            onChange={(val) => updateStation(station.id, 'drillPipeJointNumber', val)}
                            onBlur={(e) => handleEntryFieldBlur(station.id, 'drillPipeJointNumber', e.target.value, 'Joint #', `Joint #${station.drillPipeJointNumber}`)}
                            style={tableInputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <BufferedInput type="text" inputMode="decimal" value={station.measuredDepthM}
                            onFocus={() => handleEntryFieldFocus(station.id, 'measuredDepthM', station.measuredDepthM)}
                            onChange={(val) => updateStation(station.id, 'measuredDepthM', val)}
                            onBlur={(e) => handleEntryFieldBlur(station.id, 'measuredDepthM', e.target.value, 'Measured Depth', `Joint #${station.drillPipeJointNumber}`)}
                            style={tableInputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <BufferedInput type="text" inputMode="decimal" value={station.pitchPercent}
                            onFocus={() => handleEntryFieldFocus(station.id, 'pitchPercent', station.pitchPercent)}
                            onChange={(val) => updateStation(station.id, 'pitchPercent', val)}
                            onBlur={(e) => handleEntryFieldBlur(station.id, 'pitchPercent', e.target.value, 'Pitch %', `Joint #${station.drillPipeJointNumber}`)}
                            style={tableInputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <BufferedInput type="text" inputMode="decimal" value={station.azimuthDegrees}
                            onFocus={() => handleEntryFieldFocus(station.id, 'azimuthDegrees', station.azimuthDegrees)}
                            onChange={(val) => updateStation(station.id, 'azimuthDegrees', val)}
                            onBlur={(e) => handleEntryFieldBlur(station.id, 'azimuthDegrees', e.target.value, 'Azimuth', `Joint #${station.drillPipeJointNumber}`)}
                            style={tableInputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <BufferedInput type="text" value={station.calculatedKP}
                            onFocus={() => handleEntryFieldFocus(station.id, 'calculatedKP', station.calculatedKP)}
                            onChange={(val) => updateStation(station.id, 'calculatedKP', val)}
                            onBlur={(e) => handleEntryFieldBlur(station.id, 'calculatedKP', e.target.value, 'KP', `Joint #${station.drillPipeJointNumber}`)}
                            placeholder="5+250" style={tableInputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <BufferedInput type="text" inputMode="decimal" value={station.trueVerticalDepthM}
                            onFocus={() => handleEntryFieldFocus(station.id, 'trueVerticalDepthM', station.trueVerticalDepthM)}
                            onChange={(val) => updateStation(station.id, 'trueVerticalDepthM', val)}
                            onBlur={(e) => handleEntryFieldBlur(station.id, 'trueVerticalDepthM', e.target.value, 'TVD', `Joint #${station.drillPipeJointNumber}`)}
                            style={tableInputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <BufferedInput type="text" inputMode="decimal" value={station.horizontalOffsetM}
                            onFocus={() => handleEntryFieldFocus(station.id, 'horizontalOffsetM', station.horizontalOffsetM)}
                            onChange={(val) => updateStation(station.id, 'horizontalOffsetM', val)}
                            onBlur={(e) => handleEntryFieldBlur(station.id, 'horizontalOffsetM', e.target.value, 'H Offset', `Joint #${station.drillPipeJointNumber}`)}
                            style={tableInputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <BufferedInput type="text" inputMode="decimal" value={station.verticalOffsetM}
                            onFocus={() => handleEntryFieldFocus(station.id, 'verticalOffsetM', station.verticalOffsetM)}
                            onChange={(val) => updateStation(station.id, 'verticalOffsetM', val)}
                            onBlur={(e) => handleEntryFieldBlur(station.id, 'verticalOffsetM', e.target.value, 'V Offset', `Joint #${station.drillPipeJointNumber}`)}
                            style={tableInputStyle} />
                        </td>
                        <td style={{ ...tdStyle, backgroundColor: station.bendRadiusAlert ? '#f8d7da' : 'inherit' }}>
                          <BufferedInput type="text" inputMode="numeric" value={station.calculatedBendRadiusM}
                            onFocus={() => handleEntryFieldFocus(station.id, 'calculatedBendRadiusM', station.calculatedBendRadiusM)}
                            onChange={(val) => updateStation(station.id, 'calculatedBendRadiusM', val)}
                            onBlur={(e) => handleEntryFieldBlur(station.id, 'calculatedBendRadiusM', e.target.value, 'Bend Radius', `Joint #${station.drillPipeJointNumber}`)}
                            style={{ ...tableInputStyle, backgroundColor: station.bendRadiusAlert ? '#f8d7da' : 'white', fontWeight: station.bendRadiusAlert ? 'bold' : 'normal', color: station.bendRadiusAlert ? '#721c24' : 'inherit' }} />
                          {station.bendRadiusAlert && <div style={{ fontSize: '9px', color: '#dc3545', fontWeight: 'bold' }}>⚠️ ALERT</div>}
                        </td>
                        <td style={tdStyle}>
                          <select value={station.withinDesignTangent === null ? '' : station.withinDesignTangent ? 'yes' : 'no'}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : e.target.value === 'yes'
                              updateStation(station.id, 'withinDesignTangent', val)
                              handleEntryFieldBlur(station.id, 'withinDesignTangent', val, 'In Tangent', `Joint #${station.drillPipeJointNumber}`)
                            }}
                            style={{ ...tableInputStyle, backgroundColor: station.withinDesignTangent === true ? '#d4edda' : station.withinDesignTangent === false ? '#f8d7da' : 'white' }}>
                            <option value="">-</option>
                            <option value="yes">✓</option>
                            <option value="no">✗</option>
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <button onClick={(e) => { e.stopPropagation(); removeStation(station.id) }}
                            style={{ padding: '2px 6px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Station Summary */}
            {steeringData.stations.length > 0 && (
              <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px', fontSize: '12px' }}>
                <strong>Summary:</strong> {steeringData.stations.length} stations |
                {steeringData.stations.filter(s => s.withinDesignTangent === true).length} in tangent |
                {steeringData.stations.filter(s => s.withinDesignTangent === false).length} out of tangent |
                <span style={{ color: hasBendingAlert ? '#dc3545' : '#28a745', fontWeight: 'bold' }}>
                  {alertCount} bend radius alerts
                </span>
              </div>
            )}
          </>
        )}
      </CollapsibleSection>

      {/* 4. BENDING RADIUS ALERT */}
      <CollapsibleSection
        id="bendingRadius"
        title={`BENDING RADIUS CHECK${hasBendingAlert ? ` (${alertCount} ALERTS)` : ''}`}
        alert={hasBendingAlert}
      >
        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
            <div style={{ padding: '15px', backgroundColor: '#e9ecef', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '5px' }}>Pipe Diameter</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#495057' }}>
                {steeringData.pipeDiameterInches || '-'}"
              </div>
            </div>
            <div style={{ padding: '15px', backgroundColor: '#d4edda', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#155724', marginBottom: '5px' }}>Min Allowable Radius</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#155724' }}>
                {steeringData.minimumBendRadiusM || getMinBendRadius(steeringData.pipeDiameterInches) || '-'}m
              </div>
            </div>
            <div style={{ padding: '15px', backgroundColor: hasBendingAlert ? '#f8d7da' : '#d4edda', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: hasBendingAlert ? '#721c24' : '#155724', marginBottom: '5px' }}>Status</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: hasBendingAlert ? '#721c24' : '#155724' }}>
                {hasBendingAlert ? `⚠️ ${alertCount} ALERT(S)` : '✓ OK'}
              </div>
            </div>
          </div>
        </div>

        {hasBendingAlert && (
          <div style={{ padding: '12px', backgroundColor: '#f8d7da', borderRadius: '6px', border: '1px solid #dc3545' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#721c24', marginBottom: '8px' }}>
              ⚠️ SAFETY FLAG: Curve sharper than minimum allowable bending radius detected
            </div>
            <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '12px', color: '#721c24' }}>
              {steeringData.stations.filter(s => s.bendRadiusAlert).map(s => (
                <li key={s.id}>
                  Joint #{s.drillPipeJointNumber}: Calculated radius {s.calculatedBendRadiusM}m &lt; Minimum {steeringData.minimumBendRadiusM || getMinBendRadius(steeringData.pipeDiameterInches)}m
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: '15px', fontSize: '11px', color: '#666' }}>
          <strong>Reference - Minimum Bend Radius by Pipe Size:</strong>
          <div style={{ marginTop: '5px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '5px' }}>
            {Object.entries(MIN_BEND_RADIUS).map(([size, radius]) => (
              <div key={size} style={{ padding: '4px 8px', backgroundColor: '#f8f9fa', borderRadius: '3px', textAlign: 'center' }}>
                {size}" = {radius}m
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* 5. EVIDENCE (Guidance Report Upload) */}
      <CollapsibleSection
        id="evidence"
        title="EVIDENCE (Bore Log / Steering Report)"
        color="#495057"
        bgColor="#e9ecef"
        borderColor="#6c757d"
        contentBgColor="#f8f9fa"
      >
        <div style={{ marginBottom: '15px' }}>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
            Upload photos or PDFs of daily bore logs, steering reports, or guidance system outputs.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{
              padding: '10px 20px',
              backgroundColor: '#17a2b8',
              color: 'white',
              borderRadius: '4px',
              cursor: processingFile ? 'wait' : 'pointer',
              fontSize: '13px',
              fontWeight: 'bold'
            }}>
              {processingFile ? 'Processing...' : 'Upload Bore Log'}
              <input type="file" accept="image/*,.pdf"
                onChange={(e) => handleDocumentUpload(e, 'bore_log')}
                style={{ display: 'none' }}
                disabled={processingFile} />
            </label>
            <label style={{
              padding: '10px 20px',
              backgroundColor: '#6f42c1',
              color: 'white',
              borderRadius: '4px',
              cursor: processingFile ? 'wait' : 'pointer',
              fontSize: '13px',
              fontWeight: 'bold'
            }}>
              {processingFile ? 'Processing...' : 'Upload Steering Report'}
              <input type="file" accept="image/*,.pdf"
                onChange={(e) => handleDocumentUpload(e, 'steering_report')}
                style={{ display: 'none' }}
                disabled={processingFile} />
            </label>
            <label style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}>
              Upload As-Built
              <input type="file" accept="image/*,.pdf"
                onChange={(e) => handleDocumentUpload(e, 'as_built')}
                style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Document Gallery */}
        {steeringData.documents.length > 0 && (
          <div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#495057', marginBottom: '10px' }}>
              Uploaded Documents ({steeringData.documents.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
              {steeringData.documents.map(doc => (
                <div key={doc.id} style={{
                  backgroundColor: '#fff',
                  borderRadius: '6px',
                  border: '1px solid #dee2e6',
                  overflow: 'hidden'
                }}>
                  {doc.preview ? (
                    <img src={doc.preview} alt={doc.filename}
                      style={{ width: '100%', height: '100px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100px', backgroundColor: '#e9ecef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '24px' }}>📄</span>
                    </div>
                  )}
                  <div style={{ padding: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#6f42c1', marginBottom: '2px' }}>
                      {doc.documentType.replace('_', ' ').toUpperCase()}
                    </div>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.filename}
                    </div>
                    {doc.hasGPS && (
                      <div style={{ fontSize: '9px', color: '#28a745' }}>
                        GPS: {doc.latitude?.toFixed(6)}, {doc.longitude?.toFixed(6)}
                      </div>
                    )}
                    <button onClick={() => removeDocument(doc.id)}
                      style={{ marginTop: '5px', padding: '2px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 6. COMMENTS */}
      <CollapsibleSection id="comments" title="COMMENTS">
        <BufferedInput as="textarea" value={steeringData.comments}
          onFocus={() => handleFieldFocus('comments', steeringData.comments)}
          onChange={(val) => updateField('comments', val)}
          onBlur={(e) => handleFieldBlur('comments', e.target.value, 'Comments')}
          placeholder="Additional comments, observations, or notes regarding steering and guidance..."
          style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }} />
      </CollapsibleSection>
    </div>
  )
}

export default HDDSteeringLog
