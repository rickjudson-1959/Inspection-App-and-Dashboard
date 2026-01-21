import React, { useState, useRef, useMemo } from 'react'
import { useActivityAudit } from './useActivityAudit'
import { extractGPSFromImage, formatGPSCoordinates } from './exifUtils'

// Collapsible section component - defined outside to prevent re-mounting on parent re-render
function CollapsibleSection({ id, title, color, bgColor, borderColor, children, hasData, expanded, onToggle }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div
        style={{
          fontSize: '14px',
          fontWeight: 'bold',
          color: color,
          padding: '12px 15px',
          backgroundColor: bgColor,
          borderRadius: expanded ? '6px 6px 0 0' : '6px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
          border: `1px solid ${borderColor}`
        }}
        onClick={() => onToggle(id)}
      >
        <span>
          {title}
          {hasData && <span style={{ color: '#28a745', marginLeft: '8px' }}>●</span>}
        </span>
        <span style={{ fontSize: '12px', color: '#6c757d' }}>
          {expanded ? '▼ Collapse' : '▶ Expand'}
        </span>
      </div>
      {expanded && (
        <div style={{
          padding: '15px',
          backgroundColor: '#fff',
          borderRadius: '0 0 6px 6px',
          border: `1px solid ${borderColor}`,
          borderTop: 'none'
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

function MachineCleanupLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, metersToday, logId, reportId }) {
  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState({
    subsoilRestoration: false,
    trenchCrown: false,
    debrisRecovery: false,
    erosionControl: false,
    drainTile: false,
    photos: false
  })

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Photo processing state
  const [processingPhoto, setProcessingPhoto] = useState(false)

  // Audit trail hook
  const {
    initializeOriginalValues,
    initializeEntryValues,
    logFieldChange,
    logNestedFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'MachineCleanupLog')

  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const nestedValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure following API 1169 and CEPA Foundation standards
  const defaultData = {
    // Subsoil Restoration & De-compaction
    subsoilRestoration: {
      rippingDepthCm: '',
      numberOfPasses: '',
      decompactionConfirmed: false,
      decompactionFullRowWidth: false,
      rockPickRequired: false,
      rockVolumeRemovedM3: '',
      rockSizeMeetsSpec: false,
      maxRockSizeCm: '10',
      contourMatchingRestored: false,
      drainagePatternsRestored: false,
      notes: ''
    },
    // Trench & Crown Management
    trenchCrown: {
      settlementCrownHeightCm: '',
      crownReliefGapsInstalled: false,
      crownReliefGapCount: '',
      mechanicalCompaction: false,
      compactionEquipmentType: '',
      compactionNumberOfLifts: '',
      trenchSettlementObserved: false,
      notes: ''
    },
    // Debris & Asset Recovery - Clean Site Checklist
    debrisRecovery: {
      skidsLathRemoved: false,
      weldingRodsCleared: false,
      trashCleared: false,
      temporaryBridgesRemoved: false,
      rampsRemoved: false,
      allDebrisCleared: false,
      notes: ''
    },
    // Drain Tile Repair
    drainTileRepair: {
      applicable: false,
      tiles: []
    },
    // Erosion & Sediment Control (DESC)
    erosionControl: {
      waterBarsInstalled: false,
      waterBarsLinearMeters: '',
      diversionBermsInstalled: false,
      diversionBermsLinearMeters: '',
      siltFenceStatus: '',
      strawWattlesStatus: '',
      slopeStabilityVerified: false,
      notes: ''
    },
    // Data Inheritance & Context
    soilType: '',
    landUseCategory: '',
    // Trackable Items Integration
    specializedRockPicking: false,
    importedFillUsed: false,
    importedFillVolume: '',
    // Photos with GPS
    photos: [],
    // General
    comments: ''
  }

  // Merge incoming data with defaults - memoized to prevent re-computation
  const cleanupData = useMemo(() => ({
    ...defaultData,
    ...data,
    subsoilRestoration: { ...defaultData.subsoilRestoration, ...(data?.subsoilRestoration || {}) },
    trenchCrown: { ...defaultData.trenchCrown, ...(data?.trenchCrown || {}) },
    debrisRecovery: { ...defaultData.debrisRecovery, ...(data?.debrisRecovery || {}) },
    drainTileRepair: { ...defaultData.drainTileRepair, ...(data?.drainTileRepair || {}) },
    erosionControl: { ...defaultData.erosionControl, ...(data?.erosionControl || {}) },
    photos: data?.photos || []
  }), [data])

  // Audit-aware field handlers
  const handleFieldFocus = (fieldName, currentValue) => {
    initializeOriginalValues(originalValuesRef, fieldName, currentValue)
  }

  const handleFieldBlur = (fieldName, newValue, displayName) => {
    logFieldChange(originalValuesRef, fieldName, newValue, displayName)
  }

  const handleNestedFieldFocus = (parentField, fieldName, currentValue) => {
    const key = `${parentField}.${fieldName}`
    if (!nestedValuesRef.current[key]) {
      nestedValuesRef.current[key] = currentValue
    }
  }

  const handleNestedFieldBlur = (parentField, fieldName, newValue, displayName) => {
    logNestedFieldChange(nestedValuesRef, parentField, fieldName, newValue, displayName)
  }

  const updateField = (field, value) => {
    onChange({ ...cleanupData, [field]: value })
  }

  const updateSubsoilRestoration = (field, value) => {
    onChange({
      ...cleanupData,
      subsoilRestoration: { ...cleanupData.subsoilRestoration, [field]: value }
    })
  }

  const updateTrenchCrown = (field, value) => {
    onChange({
      ...cleanupData,
      trenchCrown: { ...cleanupData.trenchCrown, [field]: value }
    })
  }

  const updateDebrisRecovery = (field, value) => {
    onChange({
      ...cleanupData,
      debrisRecovery: { ...cleanupData.debrisRecovery, [field]: value }
    })
  }

  const updateDrainTileRepair = (field, value) => {
    onChange({
      ...cleanupData,
      drainTileRepair: { ...cleanupData.drainTileRepair, [field]: value }
    })
  }

  const updateErosionControl = (field, value) => {
    onChange({
      ...cleanupData,
      erosionControl: { ...cleanupData.erosionControl, [field]: value }
    })
  }

  // Drain Tile Entry Management
  const addDrainTileEntry = () => {
    const newTile = {
      id: Date.now(),
      type: '',
      slope: '',
      support: '',
      diameter: '',
      depth: '',
      repairMethod: '',
      asBuiltNotes: ''
    }
    onChange({
      ...cleanupData,
      drainTileRepair: {
        ...cleanupData.drainTileRepair,
        tiles: [...cleanupData.drainTileRepair.tiles, newTile]
      }
    })
    logEntryAdd('Drain Tile', `Tile #${cleanupData.drainTileRepair.tiles.length + 1}`)
  }

  const updateDrainTileEntry = (id, field, value) => {
    const updated = cleanupData.drainTileRepair.tiles.map(tile => {
      if (tile.id === id) {
        return { ...tile, [field]: value }
      }
      return tile
    })
    onChange({
      ...cleanupData,
      drainTileRepair: { ...cleanupData.drainTileRepair, tiles: updated }
    })
  }

  const removeDrainTileEntry = (id) => {
    const tileIndex = cleanupData.drainTileRepair.tiles.findIndex(t => t.id === id)
    logEntryDelete('Drain Tile', `Tile #${tileIndex + 1}`)
    onChange({
      ...cleanupData,
      drainTileRepair: {
        ...cleanupData.drainTileRepair,
        tiles: cleanupData.drainTileRepair.tiles.filter(t => t.id !== id)
      }
    })
  }

  // Photo handling with GPS extraction
  const handlePhotoUpload = async (e, photoType) => {
    const file = e.target.files[0]
    if (!file) return

    setProcessingPhoto(true)
    try {
      const gpsData = await extractGPSFromImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        const newPhoto = {
          id: Date.now(),
          type: photoType,
          dataUrl: reader.result,
          filename: file.name,
          timestamp: new Date().toISOString(),
          latitude: gpsData?.latitude || null,
          longitude: gpsData?.longitude || null,
          gpsAccuracy: gpsData?.accuracy || null,
          kpLocation: startKP || ''
        }
        onChange({
          ...cleanupData,
          photos: [...cleanupData.photos, newPhoto]
        })
        logEntryAdd('Photo', `${photoType} photo`)
        setProcessingPhoto(false)
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error processing photo:', error)
      setProcessingPhoto(false)
    }
  }

  const removePhoto = (id) => {
    const photo = cleanupData.photos.find(p => p.id === id)
    logEntryDelete('Photo', photo?.type || 'Photo')
    onChange({
      ...cleanupData,
      photos: cleanupData.photos.filter(p => p.id !== id)
    })
  }

  // Check for data presence indicators
  const hasSubsoilData = cleanupData.subsoilRestoration.rippingDepthCm ||
    cleanupData.subsoilRestoration.decompactionConfirmed ||
    cleanupData.subsoilRestoration.rockPickRequired
  const hasTrenchData = cleanupData.trenchCrown.settlementCrownHeightCm ||
    cleanupData.trenchCrown.mechanicalCompaction
  const hasDebrisData = cleanupData.debrisRecovery.skidsLathRemoved ||
    cleanupData.debrisRecovery.allDebrisCleared
  const hasErosionData = cleanupData.erosionControl.waterBarsInstalled ||
    cleanupData.erosionControl.siltFenceStatus
  const hasDrainTileData = cleanupData.drainTileRepair.tiles.length > 0

  // Styles
  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '13px'
  }

  const checkboxRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0'
  }

  const labelStyle = {
    fontSize: '13px',
    color: '#495057',
    flex: 1
  }

  return (
    <div style={{ padding: '10px 0' }}>
      {/* Inherited Info Bar */}
      <div style={{
        backgroundColor: '#e9ecef',
        padding: '10px 15px',
        borderRadius: '6px',
        marginBottom: '15px',
        fontSize: '12px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '10px'
      }}>
        <div><strong>Contractor:</strong> {contractor || 'N/A'}</div>
        <div><strong>Foreman:</strong> {foreman || 'N/A'}</div>
        <div><strong>Date:</strong> {reportDate || 'N/A'}</div>
        <div><strong>KP Range:</strong> {startKP || '?'} - {endKP || '?'}</div>
        <div><strong>Meters:</strong> {metersToday || '0'}</div>
      </div>

      {/* 1. Subsoil Restoration & De-compaction */}
      <CollapsibleSection
        id="subsoilRestoration"
        title="1. Subsoil Restoration & De-compaction"
        color="#2e7d32"
        bgColor="#e8f5e9"
        borderColor="#a5d6a7"
        hasData={hasSubsoilData}
        expanded={expandedSections.subsoilRestoration}
        onToggle={toggleSection}
      >
        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 10px 0' }}>Ripping/Disking</h5>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Ripping Depth (cm)</label>
              <input
                type="number"
                style={inputStyle}
                value={cleanupData.subsoilRestoration.rippingDepthCm}
                onFocus={() => handleNestedFieldFocus('subsoilRestoration', 'rippingDepthCm', cleanupData.subsoilRestoration.rippingDepthCm)}
                onChange={(e) => updateSubsoilRestoration('rippingDepthCm', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('subsoilRestoration', 'rippingDepthCm', e.target.value, 'Ripping Depth')}
                placeholder="e.g., 30"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Number of Passes</label>
              <input
                type="number"
                style={inputStyle}
                value={cleanupData.subsoilRestoration.numberOfPasses}
                onFocus={() => handleNestedFieldFocus('subsoilRestoration', 'numberOfPasses', cleanupData.subsoilRestoration.numberOfPasses)}
                onChange={(e) => updateSubsoilRestoration('numberOfPasses', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('subsoilRestoration', 'numberOfPasses', e.target.value, 'Number of Passes')}
                placeholder="e.g., 2"
              />
            </div>
          </div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.subsoilRestoration.decompactionConfirmed}
              onChange={(e) => {
                updateSubsoilRestoration('decompactionConfirmed', e.target.checked)
                handleNestedFieldBlur('subsoilRestoration', 'decompactionConfirmed', e.target.checked, 'De-compaction Confirmed')
              }}
            />
            <span style={labelStyle}>De-compaction confirmed across full ROW width</span>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 10px 0' }}>Rock Pick/Removal</h5>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.subsoilRestoration.rockPickRequired}
              onChange={(e) => {
                updateSubsoilRestoration('rockPickRequired', e.target.checked)
                handleNestedFieldBlur('subsoilRestoration', 'rockPickRequired', e.target.checked, 'Rock Pick Required')
              }}
            />
            <span style={labelStyle}>Rock Picking Required</span>
          </div>
          {cleanupData.subsoilRestoration.rockPickRequired && (
            <div style={{ marginLeft: '20px', marginTop: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#666' }}>Volume Removed (m³)</label>
                  <input
                    type="number"
                    step="0.1"
                    style={inputStyle}
                    value={cleanupData.subsoilRestoration.rockVolumeRemovedM3}
                    onFocus={() => handleNestedFieldFocus('subsoilRestoration', 'rockVolumeRemovedM3', cleanupData.subsoilRestoration.rockVolumeRemovedM3)}
                    onChange={(e) => updateSubsoilRestoration('rockVolumeRemovedM3', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur('subsoilRestoration', 'rockVolumeRemovedM3', e.target.value, 'Rock Volume Removed')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666' }}>Max Rock Size Spec (cm)</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={cleanupData.subsoilRestoration.maxRockSizeCm}
                    onFocus={() => handleNestedFieldFocus('subsoilRestoration', 'maxRockSizeCm', cleanupData.subsoilRestoration.maxRockSizeCm)}
                    onChange={(e) => updateSubsoilRestoration('maxRockSizeCm', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur('subsoilRestoration', 'maxRockSizeCm', e.target.value, 'Max Rock Size')}
                  />
                </div>
              </div>
              <div style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={cleanupData.subsoilRestoration.rockSizeMeetsSpec}
                  onChange={(e) => {
                    updateSubsoilRestoration('rockSizeMeetsSpec', e.target.checked)
                    handleNestedFieldBlur('subsoilRestoration', 'rockSizeMeetsSpec', e.target.checked, 'Rock Size Meets Spec')
                  }}
                />
                <span style={labelStyle}>Rock size meets contract specs (nothing &gt; {cleanupData.subsoilRestoration.maxRockSizeCm || 10}cm)</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 10px 0' }}>Contour Matching</h5>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.subsoilRestoration.contourMatchingRestored}
              onChange={(e) => {
                updateSubsoilRestoration('contourMatchingRestored', e.target.checked)
                handleNestedFieldBlur('subsoilRestoration', 'contourMatchingRestored', e.target.checked, 'Contours Restored')
              }}
            />
            <span style={labelStyle}>Pre-construction contours restored</span>
          </div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.subsoilRestoration.drainagePatternsRestored}
              onChange={(e) => {
                updateSubsoilRestoration('drainagePatternsRestored', e.target.checked)
                handleNestedFieldBlur('subsoilRestoration', 'drainagePatternsRestored', e.target.checked, 'Drainage Patterns Restored')
              }}
            />
            <span style={labelStyle}>Drainage patterns restored</span>
          </div>
        </div>

        <div>
          <label style={{ fontSize: '12px', color: '#666' }}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: '60px' }}
            value={cleanupData.subsoilRestoration.notes}
            onFocus={() => handleNestedFieldFocus('subsoilRestoration', 'notes', cleanupData.subsoilRestoration.notes)}
            onChange={(e) => updateSubsoilRestoration('notes', e.target.value)}
            onBlur={(e) => handleNestedFieldBlur('subsoilRestoration', 'notes', e.target.value, 'Subsoil Notes')}
            placeholder="Additional notes on subsoil restoration..."
          />
        </div>
      </CollapsibleSection>

      {/* 2. Trench & Crown Management */}
      <CollapsibleSection
        id="trenchCrown"
        title="2. Trench & Crown Management"
        color="#1565c0"
        bgColor="#e3f2fd"
        borderColor="#90caf9"
        hasData={hasTrenchData}
        expanded={expandedSections.trenchCrown}
        onToggle={toggleSection}
      >
        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#1565c0', margin: '0 0 10px 0' }}>Settlement Crown (Roach)</h5>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '12px', color: '#666' }}>Crown Height (cm)</label>
            <input
              type="number"
              style={inputStyle}
              value={cleanupData.trenchCrown.settlementCrownHeightCm}
              onFocus={() => handleNestedFieldFocus('trenchCrown', 'settlementCrownHeightCm', cleanupData.trenchCrown.settlementCrownHeightCm)}
              onChange={(e) => updateTrenchCrown('settlementCrownHeightCm', e.target.value)}
              onBlur={(e) => handleNestedFieldBlur('trenchCrown', 'settlementCrownHeightCm', e.target.value, 'Crown Height')}
              placeholder="e.g., 15"
            />
          </div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.trenchCrown.trenchSettlementObserved}
              onChange={(e) => {
                updateTrenchCrown('trenchSettlementObserved', e.target.checked)
                handleNestedFieldBlur('trenchCrown', 'trenchSettlementObserved', e.target.checked, 'Trench Settlement Observed')
              }}
            />
            <span style={{ ...labelStyle, color: cleanupData.trenchCrown.trenchSettlementObserved ? '#dc3545' : '#495057' }}>
              Trench settlement observed (issue)
            </span>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#1565c0', margin: '0 0 10px 0' }}>Crown Relief</h5>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.trenchCrown.crownReliefGapsInstalled}
              onChange={(e) => {
                updateTrenchCrown('crownReliefGapsInstalled', e.target.checked)
                handleNestedFieldBlur('trenchCrown', 'crownReliefGapsInstalled', e.target.checked, 'Crown Relief Gaps Installed')
              }}
            />
            <span style={labelStyle}>Gaps left in crown for cross-drainage</span>
          </div>
          {cleanupData.trenchCrown.crownReliefGapsInstalled && (
            <div style={{ marginLeft: '20px', marginTop: '10px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Number of Gaps</label>
              <input
                type="number"
                style={{ ...inputStyle, width: '100px' }}
                value={cleanupData.trenchCrown.crownReliefGapCount}
                onFocus={() => handleNestedFieldFocus('trenchCrown', 'crownReliefGapCount', cleanupData.trenchCrown.crownReliefGapCount)}
                onChange={(e) => updateTrenchCrown('crownReliefGapCount', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('trenchCrown', 'crownReliefGapCount', e.target.value, 'Crown Relief Gap Count')}
              />
            </div>
          )}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#1565c0', margin: '0 0 10px 0' }}>Mechanical Compaction</h5>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.trenchCrown.mechanicalCompaction}
              onChange={(e) => {
                updateTrenchCrown('mechanicalCompaction', e.target.checked)
                handleNestedFieldBlur('trenchCrown', 'mechanicalCompaction', e.target.checked, 'Mechanical Compaction')
              }}
            />
            <span style={labelStyle}>Mechanical compaction performed</span>
          </div>
          {cleanupData.trenchCrown.mechanicalCompaction && (
            <div style={{ marginLeft: '20px', marginTop: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#666' }}>Equipment Type</label>
                  <select
                    style={inputStyle}
                    value={cleanupData.trenchCrown.compactionEquipmentType}
                    onFocus={() => handleNestedFieldFocus('trenchCrown', 'compactionEquipmentType', cleanupData.trenchCrown.compactionEquipmentType)}
                    onChange={(e) => updateTrenchCrown('compactionEquipmentType', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur('trenchCrown', 'compactionEquipmentType', e.target.value, 'Compaction Equipment')}
                  >
                    <option value="">Select...</option>
                    <option value="Sheeps Foot">Sheep's Foot</option>
                    <option value="Hoe-Pack">Hoe-Pack</option>
                    <option value="Vibratory Roller">Vibratory Roller</option>
                    <option value="Plate Compactor">Plate Compactor</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666' }}>Number of Lifts</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={cleanupData.trenchCrown.compactionNumberOfLifts}
                    onFocus={() => handleNestedFieldFocus('trenchCrown', 'compactionNumberOfLifts', cleanupData.trenchCrown.compactionNumberOfLifts)}
                    onChange={(e) => updateTrenchCrown('compactionNumberOfLifts', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur('trenchCrown', 'compactionNumberOfLifts', e.target.value, 'Compaction Lifts')}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: '12px', color: '#666' }}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: '60px' }}
            value={cleanupData.trenchCrown.notes}
            onFocus={() => handleNestedFieldFocus('trenchCrown', 'notes', cleanupData.trenchCrown.notes)}
            onChange={(e) => updateTrenchCrown('notes', e.target.value)}
            onBlur={(e) => handleNestedFieldBlur('trenchCrown', 'notes', e.target.value, 'Trench Crown Notes')}
            placeholder="Additional notes on trench/crown management..."
          />
        </div>
      </CollapsibleSection>

      {/* 3. Debris & Asset Recovery */}
      <CollapsibleSection
        id="debrisRecovery"
        title="3. Debris & Asset Recovery"
        color="#f57c00"
        bgColor="#fff3e0"
        borderColor="#ffcc80"
        hasData={hasDebrisData}
        expanded={expandedSections.debrisRecovery}
        onToggle={toggleSection}
      >
        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#f57c00', margin: '0 0 10px 0' }}>Clean-Site Checklist</h5>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.debrisRecovery.skidsLathRemoved}
              onChange={(e) => {
                updateDebrisRecovery('skidsLathRemoved', e.target.checked)
                handleNestedFieldBlur('debrisRecovery', 'skidsLathRemoved', e.target.checked, 'Skids/Lath Removed')
              }}
            />
            <span style={labelStyle}>All skids/lath removed</span>
          </div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.debrisRecovery.weldingRodsCleared}
              onChange={(e) => {
                updateDebrisRecovery('weldingRodsCleared', e.target.checked)
                handleNestedFieldBlur('debrisRecovery', 'weldingRodsCleared', e.target.checked, 'Welding Rods Cleared')
              }}
            />
            <span style={labelStyle}>Welding rods cleared</span>
          </div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.debrisRecovery.trashCleared}
              onChange={(e) => {
                updateDebrisRecovery('trashCleared', e.target.checked)
                handleNestedFieldBlur('debrisRecovery', 'trashCleared', e.target.checked, 'Trash Cleared')
              }}
            />
            <span style={labelStyle}>All trash cleared</span>
          </div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.debrisRecovery.temporaryBridgesRemoved}
              onChange={(e) => {
                updateDebrisRecovery('temporaryBridgesRemoved', e.target.checked)
                handleNestedFieldBlur('debrisRecovery', 'temporaryBridgesRemoved', e.target.checked, 'Temp Bridges Removed')
              }}
            />
            <span style={labelStyle}>Temporary bridges removed</span>
          </div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.debrisRecovery.rampsRemoved}
              onChange={(e) => {
                updateDebrisRecovery('rampsRemoved', e.target.checked)
                handleNestedFieldBlur('debrisRecovery', 'rampsRemoved', e.target.checked, 'Ramps Removed')
              }}
            />
            <span style={labelStyle}>Ramps removed</span>
          </div>
          <div style={{ ...checkboxRowStyle, backgroundColor: '#e8f5e9', padding: '10px', borderRadius: '4px', marginTop: '10px' }}>
            <input
              type="checkbox"
              checked={cleanupData.debrisRecovery.allDebrisCleared}
              onChange={(e) => {
                updateDebrisRecovery('allDebrisCleared', e.target.checked)
                handleNestedFieldBlur('debrisRecovery', 'allDebrisCleared', e.target.checked, 'All Debris Cleared')
              }}
            />
            <span style={{ ...labelStyle, fontWeight: 'bold', color: '#2e7d32' }}>
              ALL DEBRIS CLEARED - Site ready for topsoil
            </span>
          </div>
        </div>

        <div>
          <label style={{ fontSize: '12px', color: '#666' }}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: '60px' }}
            value={cleanupData.debrisRecovery.notes}
            onFocus={() => handleNestedFieldFocus('debrisRecovery', 'notes', cleanupData.debrisRecovery.notes)}
            onChange={(e) => updateDebrisRecovery('notes', e.target.value)}
            onBlur={(e) => handleNestedFieldBlur('debrisRecovery', 'notes', e.target.value, 'Debris Recovery Notes')}
            placeholder="Notes on debris recovery..."
          />
        </div>
      </CollapsibleSection>

      {/* 4. Drain Tile Repair */}
      <CollapsibleSection
        id="drainTile"
        title="4. Drain Tile Repair (If Applicable)"
        color="#7b1fa2"
        bgColor="#f3e5f5"
        borderColor="#ce93d8"
        hasData={hasDrainTileData}
        expanded={expandedSections.drainTile}
        onToggle={toggleSection}
      >
        <div style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={cleanupData.drainTileRepair.applicable}
            onChange={(e) => {
              updateDrainTileRepair('applicable', e.target.checked)
              handleNestedFieldBlur('drainTileRepair', 'applicable', e.target.checked, 'Drain Tile Applicable')
            }}
          />
          <span style={labelStyle}>Drain tile repair applicable for this section</span>
        </div>

        {cleanupData.drainTileRepair.applicable && (
          <div style={{ marginTop: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h5 style={{ fontSize: '13px', color: '#7b1fa2', margin: 0 }}>
                Tile Repairs ({cleanupData.drainTileRepair.tiles.length})
              </h5>
              <button
                type="button"
                onClick={addDrainTileEntry}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#7b1fa2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                + Add Tile Entry
              </button>
            </div>

            {cleanupData.drainTileRepair.tiles.map((tile, idx) => (
              <div key={tile.id} style={{
                backgroundColor: '#fafafa',
                padding: '12px',
                borderRadius: '6px',
                marginBottom: '10px',
                border: '1px solid #e0e0e0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontWeight: 'bold', color: '#7b1fa2' }}>Tile #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeDrainTileEntry(tile.id)}
                    style={{
                      padding: '2px 8px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#666' }}>Type</label>
                    <select
                      style={{ ...inputStyle, fontSize: '12px' }}
                      value={tile.type}
                      onChange={(e) => updateDrainTileEntry(tile.id, 'type', e.target.value)}
                    >
                      <option value="">Select...</option>
                      <option value="Corrugated Plastic">Corrugated Plastic</option>
                      <option value="Clay">Clay</option>
                      <option value="Concrete">Concrete</option>
                      <option value="PVC">PVC</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#666' }}>Diameter</label>
                    <input
                      type="text"
                      style={{ ...inputStyle, fontSize: '12px' }}
                      value={tile.diameter}
                      onChange={(e) => updateDrainTileEntry(tile.id, 'diameter', e.target.value)}
                      placeholder="e.g., 4 inch"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#666' }}>Depth</label>
                    <input
                      type="text"
                      style={{ ...inputStyle, fontSize: '12px' }}
                      value={tile.depth}
                      onChange={(e) => updateDrainTileEntry(tile.id, 'depth', e.target.value)}
                      placeholder="e.g., 0.9m"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#666' }}>Slope</label>
                    <input
                      type="text"
                      style={{ ...inputStyle, fontSize: '12px' }}
                      value={tile.slope}
                      onChange={(e) => updateDrainTileEntry(tile.id, 'slope', e.target.value)}
                      placeholder="e.g., 0.5%"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#666' }}>Support</label>
                    <input
                      type="text"
                      style={{ ...inputStyle, fontSize: '12px' }}
                      value={tile.support}
                      onChange={(e) => updateDrainTileEntry(tile.id, 'support', e.target.value)}
                      placeholder="e.g., Gravel bed"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#666' }}>Repair Method</label>
                    <input
                      type="text"
                      style={{ ...inputStyle, fontSize: '12px' }}
                      value={tile.repairMethod}
                      onChange={(e) => updateDrainTileEntry(tile.id, 'repairMethod', e.target.value)}
                      placeholder="e.g., Coupling"
                    />
                  </div>
                </div>
                <div style={{ marginTop: '10px' }}>
                  <label style={{ fontSize: '11px', color: '#666' }}>As-Built Notes</label>
                  <textarea
                    style={{ ...inputStyle, fontSize: '12px', minHeight: '40px' }}
                    value={tile.asBuiltNotes}
                    onChange={(e) => updateDrainTileEntry(tile.id, 'asBuiltNotes', e.target.value)}
                    placeholder="As-built details..."
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* 5. Erosion & Sediment Control */}
      <CollapsibleSection
        id="erosionControl"
        title="5. Erosion & Sediment Control (DESC)"
        color="#00695c"
        bgColor="#e0f2f1"
        borderColor="#80cbc4"
        hasData={hasErosionData}
        expanded={expandedSections.erosionControl}
        onToggle={toggleSection}
      >
        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#00695c', margin: '0 0 10px 0' }}>Slope Stability</h5>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.erosionControl.waterBarsInstalled}
              onChange={(e) => {
                updateErosionControl('waterBarsInstalled', e.target.checked)
                handleNestedFieldBlur('erosionControl', 'waterBarsInstalled', e.target.checked, 'Water Bars Installed')
              }}
            />
            <span style={labelStyle}>Water bars installed</span>
          </div>
          {cleanupData.erosionControl.waterBarsInstalled && (
            <div style={{ marginLeft: '20px', marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Linear Meters</label>
              <input
                type="number"
                style={{ ...inputStyle, width: '120px' }}
                value={cleanupData.erosionControl.waterBarsLinearMeters}
                onFocus={() => handleNestedFieldFocus('erosionControl', 'waterBarsLinearMeters', cleanupData.erosionControl.waterBarsLinearMeters)}
                onChange={(e) => updateErosionControl('waterBarsLinearMeters', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('erosionControl', 'waterBarsLinearMeters', e.target.value, 'Water Bars Linear Meters')}
              />
            </div>
          )}

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.erosionControl.diversionBermsInstalled}
              onChange={(e) => {
                updateErosionControl('diversionBermsInstalled', e.target.checked)
                handleNestedFieldBlur('erosionControl', 'diversionBermsInstalled', e.target.checked, 'Diversion Berms Installed')
              }}
            />
            <span style={labelStyle}>Diversion berms installed</span>
          </div>
          {cleanupData.erosionControl.diversionBermsInstalled && (
            <div style={{ marginLeft: '20px', marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Linear Meters</label>
              <input
                type="number"
                style={{ ...inputStyle, width: '120px' }}
                value={cleanupData.erosionControl.diversionBermsLinearMeters}
                onFocus={() => handleNestedFieldFocus('erosionControl', 'diversionBermsLinearMeters', cleanupData.erosionControl.diversionBermsLinearMeters)}
                onChange={(e) => updateErosionControl('diversionBermsLinearMeters', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('erosionControl', 'diversionBermsLinearMeters', e.target.value, 'Diversion Berms Linear Meters')}
              />
            </div>
          )}

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.erosionControl.slopeStabilityVerified}
              onChange={(e) => {
                updateErosionControl('slopeStabilityVerified', e.target.checked)
                handleNestedFieldBlur('erosionControl', 'slopeStabilityVerified', e.target.checked, 'Slope Stability Verified')
              }}
            />
            <span style={labelStyle}>Slope stability verified</span>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#00695c', margin: '0 0 10px 0' }}>Temporary Measures Status</h5>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Silt Fence Status</label>
              <select
                style={inputStyle}
                value={cleanupData.erosionControl.siltFenceStatus}
                onFocus={() => handleNestedFieldFocus('erosionControl', 'siltFenceStatus', cleanupData.erosionControl.siltFenceStatus)}
                onChange={(e) => updateErosionControl('siltFenceStatus', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('erosionControl', 'siltFenceStatus', e.target.value, 'Silt Fence Status')}
              >
                <option value="">Select...</option>
                <option value="In Place - Good">In Place - Good</option>
                <option value="In Place - Needs Repair">In Place - Needs Repair</option>
                <option value="Removed">Removed</option>
                <option value="N/A">N/A</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Straw Wattles Status</label>
              <select
                style={inputStyle}
                value={cleanupData.erosionControl.strawWattlesStatus}
                onFocus={() => handleNestedFieldFocus('erosionControl', 'strawWattlesStatus', cleanupData.erosionControl.strawWattlesStatus)}
                onChange={(e) => updateErosionControl('strawWattlesStatus', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('erosionControl', 'strawWattlesStatus', e.target.value, 'Straw Wattles Status')}
              >
                <option value="">Select...</option>
                <option value="In Place - Good">In Place - Good</option>
                <option value="In Place - Needs Repair">In Place - Needs Repair</option>
                <option value="Removed">Removed</option>
                <option value="N/A">N/A</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <label style={{ fontSize: '12px', color: '#666' }}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: '60px' }}
            value={cleanupData.erosionControl.notes}
            onFocus={() => handleNestedFieldFocus('erosionControl', 'notes', cleanupData.erosionControl.notes)}
            onChange={(e) => updateErosionControl('notes', e.target.value)}
            onBlur={(e) => handleNestedFieldBlur('erosionControl', 'notes', e.target.value, 'Erosion Control Notes')}
            placeholder="Notes on erosion and sediment control..."
          />
        </div>
      </CollapsibleSection>

      {/* 6. Data Inheritance & Trackable Items */}
      <div style={{
        backgroundColor: '#fff8e1',
        padding: '15px',
        borderRadius: '6px',
        marginBottom: '10px',
        border: '1px solid #ffcc80'
      }}>
        <h5 style={{ fontSize: '14px', color: '#f57c00', margin: '0 0 10px 0' }}>Data Context & Trackable Items</h5>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#666' }}>Soil Type</label>
            <input
              type="text"
              style={inputStyle}
              value={cleanupData.soilType}
              onFocus={() => handleFieldFocus('soilType', cleanupData.soilType)}
              onChange={(e) => updateField('soilType', e.target.value)}
              onBlur={(e) => handleFieldBlur('soilType', e.target.value, 'Soil Type')}
              placeholder="e.g., Clay, Sandy Loam"
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#666' }}>Land Use Category</label>
            <select
              style={inputStyle}
              value={cleanupData.landUseCategory}
              onFocus={() => handleFieldFocus('landUseCategory', cleanupData.landUseCategory)}
              onChange={(e) => updateField('landUseCategory', e.target.value)}
              onBlur={(e) => handleFieldBlur('landUseCategory', e.target.value, 'Land Use Category')}
            >
              <option value="">Select...</option>
              <option value="Agricultural - Cultivated">Agricultural - Cultivated</option>
              <option value="Agricultural - Pasture">Agricultural - Pasture</option>
              <option value="Forested">Forested</option>
              <option value="Wetland">Wetland</option>
              <option value="Residential">Residential</option>
              <option value="Industrial">Industrial</option>
              <option value="Crown Land">Crown Land</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #ffcc80', paddingTop: '10px' }}>
          <h6 style={{ fontSize: '13px', color: '#f57c00', margin: '0 0 10px 0' }}>Billable Items (Auto-logged to Trackable Items)</h6>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.specializedRockPicking}
              onChange={(e) => {
                updateField('specializedRockPicking', e.target.checked)
                handleFieldBlur('specializedRockPicking', e.target.checked, 'Specialized Rock Picking')
              }}
            />
            <span style={labelStyle}>Specialized Rock Picking performed (billable)</span>
          </div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.importedFillUsed}
              onChange={(e) => {
                updateField('importedFillUsed', e.target.checked)
                handleFieldBlur('importedFillUsed', e.target.checked, 'Imported Fill Used')
              }}
            />
            <span style={labelStyle}>Imported Fill used (billable)</span>
          </div>
          {cleanupData.importedFillUsed && (
            <div style={{ marginLeft: '20px', marginTop: '5px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Volume (m³)</label>
              <input
                type="number"
                step="0.1"
                style={{ ...inputStyle, width: '120px' }}
                value={cleanupData.importedFillVolume}
                onFocus={() => handleFieldFocus('importedFillVolume', cleanupData.importedFillVolume)}
                onChange={(e) => updateField('importedFillVolume', e.target.value)}
                onBlur={(e) => handleFieldBlur('importedFillVolume', e.target.value, 'Imported Fill Volume')}
              />
            </div>
          )}
        </div>
      </div>

      {/* 7. Photo Evidence */}
      <CollapsibleSection
        id="photos"
        title="7. Photo Evidence (GPS Required)"
        color="#c62828"
        bgColor="#ffebee"
        borderColor="#ef9a9a"
        hasData={cleanupData.photos.length > 0}
        expanded={expandedSections.photos}
        onToggle={toggleSection}
      >
        <div style={{ marginBottom: '15px' }}>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>
            Upload geotagged photos. GPS coordinates (6-decimal precision) and KP location will be extracted automatically.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#c62828', fontWeight: 'bold' }}>Pre-Topsoil Panorama</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, 'Pre-Topsoil Panorama')}
                disabled={processingPhoto}
                style={{ fontSize: '12px', marginTop: '5px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Subsoil Condition</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, 'Subsoil Condition')}
                disabled={processingPhoto}
                style={{ fontSize: '12px', marginTop: '5px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Crown/Trench</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, 'Crown/Trench')}
                disabled={processingPhoto}
                style={{ fontSize: '12px', marginTop: '5px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Erosion Control</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, 'Erosion Control')}
                disabled={processingPhoto}
                style={{ fontSize: '12px', marginTop: '5px' }}
              />
            </div>
          </div>

          {processingPhoto && (
            <p style={{ fontSize: '12px', color: '#1976d2', marginTop: '10px' }}>Processing photo...</p>
          )}
        </div>

        {cleanupData.photos.length > 0 && (
          <div>
            <h6 style={{ fontSize: '13px', color: '#c62828', margin: '0 0 10px 0' }}>
              Uploaded Photos ({cleanupData.photos.length})
            </h6>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
              {cleanupData.photos.map((photo) => (
                <div key={photo.id} style={{
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  padding: '8px',
                  backgroundColor: '#fafafa'
                }}>
                  <img
                    src={photo.dataUrl}
                    alt={photo.type}
                    style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px' }}
                  />
                  <div style={{ fontSize: '10px', marginTop: '5px' }}>
                    <strong>{photo.type}</strong>
                    {photo.latitude && photo.longitude && (
                      <div style={{ color: '#28a745' }}>
                        GPS: {formatGPSCoordinates(photo.latitude, photo.longitude)}
                      </div>
                    )}
                    {photo.kpLocation && <div>KP: {photo.kpLocation}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    style={{
                      marginTop: '5px',
                      padding: '2px 6px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '10px',
                      width: '100%'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* General Comments */}
      <div style={{ marginTop: '15px' }}>
        <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>General Comments</label>
        <textarea
          style={{ ...inputStyle, minHeight: '80px', marginTop: '5px' }}
          value={cleanupData.comments}
          onFocus={() => handleFieldFocus('comments', cleanupData.comments)}
          onChange={(e) => updateField('comments', e.target.value)}
          onBlur={(e) => handleFieldBlur('comments', e.target.value, 'General Comments')}
          placeholder="Additional comments on machine cleanup operations..."
        />
      </div>
    </div>
  )
}

export default MachineCleanupLog
