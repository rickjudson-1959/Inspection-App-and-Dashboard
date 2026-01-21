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

function FinalCleanupLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, metersToday, logId, reportId }) {
  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState({
    topsoilReplacement: false,
    revegetation: false,
    permanentESC: false,
    assetRestoration: false,
    trackableItems: false,
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
  } = useActivityAudit(logId || reportId, 'FinalCleanupLog')

  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const nestedValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure following API 1169 and BCER standards
  const defaultData = {
    // 1. Topsoil Replacement
    topsoilReplacement: {
      targetDepthCm: '',
      actualReplacedDepthCm: '',
      depthVarianceCm: '',
      depthCompliance: '',
      replacedInDryConditions: false,
      gradeMatchesSurrounding: false,
      finalRockPickComplete: false,
      stoninessMatchesAdjacent: false,
      admixingObserved: false,
      admixingNotes: '',
      notes: ''
    },
    // 2. Revegetation & Seeding
    revegetation: {
      seedMixId: '',
      seedMixDescription: '',
      applicationRateKgHa: '',
      seedingMethod: '',
      seedingDate: '',
      areaSeededHa: '',
      totalSeedUsedKg: '',
      fertilizerType: '',
      fertilizerRateKgHa: '',
      fertilizerBagsUsed: '',
      mulchType: '',
      mulchLinearMeters: '',
      tackifierUsed: false,
      tackifierType: '',
      seedTagPhotoRequired: true,
      seedTagPhotoUploaded: false,
      notes: ''
    },
    // 3. Permanent Erosion & Sediment Control
    permanentESC: {
      permanentSiltFencesInstalled: false,
      permanentSiltFenceMeters: '',
      finalWaterBarsInstalled: false,
      finalWaterBarsCount: '',
      erosionControlBlanketsInstalled: false,
      erosionControlBlanketM2: '',
      ripRapInstalled: false,
      ripRapM3: '',
      checkDamsInstalled: false,
      checkDamsCount: '',
      allPermanentESCComplete: false,
      notes: ''
    },
    // 4. Asset Restoration
    assetRestoration: {
      permanentFencesReinstalled: false,
      fenceType: '',
      fenceLinearMeters: '',
      gatesFunctional: false,
      gatesCount: '',
      pipelineMarkersInstalled: false,
      markersAtRoadCrossings: false,
      markersAtWaterCrossings: false,
      markersCount: '',
      signageInstalled: false,
      cattleGuardsRestored: false,
      culvertsCleared: false,
      accessRoadsRestored: false,
      landownerWalkthroughCompleted: false,
      landownerWalkthroughDate: '',
      landownerName: '',
      landownerConcerns: '',
      notes: ''
    },
    // 5. Data Context & Trackable Items
    preConstructionLandUse: '',
    seedMixMatchesLandType: false,
    trackableItems: {
      seedMixKg: '',
      fertilizerBags: '',
      erosionBlanketM2: '',
      siltFenceMeters: '',
      fenceMeters: ''
    },
    // 6. Photos with GPS
    photos: [],
    seedTagPhotos: [],
    // General
    finalInspectionComplete: false,
    readyForLandownerRelease: false,
    comments: ''
  }

  // Merge incoming data with defaults - memoized to prevent re-computation
  const cleanupData = useMemo(() => ({
    ...defaultData,
    ...data,
    topsoilReplacement: { ...defaultData.topsoilReplacement, ...(data?.topsoilReplacement || {}) },
    revegetation: { ...defaultData.revegetation, ...(data?.revegetation || {}) },
    permanentESC: { ...defaultData.permanentESC, ...(data?.permanentESC || {}) },
    assetRestoration: { ...defaultData.assetRestoration, ...(data?.assetRestoration || {}) },
    trackableItems: { ...defaultData.trackableItems, ...(data?.trackableItems || {}) },
    photos: data?.photos || [],
    seedTagPhotos: data?.seedTagPhotos || []
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

  const updateTopsoilReplacement = (field, value) => {
    const updated = { ...cleanupData.topsoilReplacement, [field]: value }
    // Auto-calculate variance
    if (field === 'actualReplacedDepthCm' || field === 'targetDepthCm') {
      const target = parseFloat(field === 'targetDepthCm' ? value : updated.targetDepthCm) || 0
      const actual = parseFloat(field === 'actualReplacedDepthCm' ? value : updated.actualReplacedDepthCm) || 0
      if (target > 0 && actual > 0) {
        updated.depthVarianceCm = (actual - target).toFixed(1)
        updated.depthCompliance = actual >= target ? 'Pass' : 'Fail'
      }
    }
    onChange({ ...cleanupData, topsoilReplacement: updated })
  }

  const updateRevegetation = (field, value) => {
    const updated = { ...cleanupData.revegetation, [field]: value }
    // Auto-calculate total seed used
    if (field === 'applicationRateKgHa' || field === 'areaSeededHa') {
      const rate = parseFloat(field === 'applicationRateKgHa' ? value : updated.applicationRateKgHa) || 0
      const area = parseFloat(field === 'areaSeededHa' ? value : updated.areaSeededHa) || 0
      if (rate > 0 && area > 0) {
        updated.totalSeedUsedKg = (rate * area).toFixed(1)
      }
    }
    onChange({ ...cleanupData, revegetation: updated })
  }

  const updatePermanentESC = (field, value) => {
    onChange({
      ...cleanupData,
      permanentESC: { ...cleanupData.permanentESC, [field]: value }
    })
  }

  const updateAssetRestoration = (field, value) => {
    onChange({
      ...cleanupData,
      assetRestoration: { ...cleanupData.assetRestoration, [field]: value }
    })
  }

  const updateTrackableItems = (field, value) => {
    onChange({
      ...cleanupData,
      trackableItems: { ...cleanupData.trackableItems, [field]: value }
    })
  }

  // Photo handling with GPS extraction
  const handlePhotoUpload = async (e, photoType, isSeedTag = false) => {
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

        if (isSeedTag) {
          onChange({
            ...cleanupData,
            seedTagPhotos: [...cleanupData.seedTagPhotos, newPhoto],
            revegetation: { ...cleanupData.revegetation, seedTagPhotoUploaded: true }
          })
          logEntryAdd('Seed Tag Photo', photoType)
        } else {
          onChange({
            ...cleanupData,
            photos: [...cleanupData.photos, newPhoto]
          })
          logEntryAdd('Photo', photoType)
        }
        setProcessingPhoto(false)
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error processing photo:', error)
      setProcessingPhoto(false)
    }
  }

  const removePhoto = (id, isSeedTag = false) => {
    if (isSeedTag) {
      const photo = cleanupData.seedTagPhotos.find(p => p.id === id)
      logEntryDelete('Seed Tag Photo', photo?.type || 'Photo')
      const updatedPhotos = cleanupData.seedTagPhotos.filter(p => p.id !== id)
      onChange({
        ...cleanupData,
        seedTagPhotos: updatedPhotos,
        revegetation: { ...cleanupData.revegetation, seedTagPhotoUploaded: updatedPhotos.length > 0 }
      })
    } else {
      const photo = cleanupData.photos.find(p => p.id === id)
      logEntryDelete('Photo', photo?.type || 'Photo')
      onChange({
        ...cleanupData,
        photos: cleanupData.photos.filter(p => p.id !== id)
      })
    }
  }

  // Check for data presence indicators
  const hasTopsoilData = cleanupData.topsoilReplacement.actualReplacedDepthCm ||
    cleanupData.topsoilReplacement.finalRockPickComplete
  const hasRevegetationData = cleanupData.revegetation.seedMixId ||
    cleanupData.revegetation.seedingMethod
  const hasPermanentESCData = cleanupData.permanentESC.permanentSiltFencesInstalled ||
    cleanupData.permanentESC.finalWaterBarsInstalled ||
    cleanupData.permanentESC.erosionControlBlanketsInstalled
  const hasAssetData = cleanupData.assetRestoration.permanentFencesReinstalled ||
    cleanupData.assetRestoration.pipelineMarkersInstalled ||
    cleanupData.assetRestoration.landownerWalkthroughCompleted
  const hasTrackableData = cleanupData.trackableItems.seedMixKg ||
    cleanupData.trackableItems.fertilizerBags
  const hasPhotoData = cleanupData.photos.length > 0 || cleanupData.seedTagPhotos.length > 0

  // Styles
  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '13px',
    boxSizing: 'border-box'
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
    <div style={{ padding: '10px 0', overflow: 'hidden' }}>
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

      {/* 1. Topsoil Replacement */}
      <CollapsibleSection
        id="topsoilReplacement"
        title="1. Topsoil Replacement"
        color="#795548"
        bgColor="#efebe9"
        borderColor="#bcaaa4"
        hasData={hasTopsoilData}
        expanded={expandedSections.topsoilReplacement}
        onToggle={toggleSection}
      >
        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#795548', margin: '0 0 10px 0' }}>Depth Verification</h5>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Target Depth (cm)</label>
              <input
                type="number"
                style={inputStyle}
                value={cleanupData.topsoilReplacement.targetDepthCm}
                onFocus={() => handleNestedFieldFocus('topsoilReplacement', 'targetDepthCm', cleanupData.topsoilReplacement.targetDepthCm)}
                onChange={(e) => updateTopsoilReplacement('targetDepthCm', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('topsoilReplacement', 'targetDepthCm', e.target.value, 'Target Topsoil Depth')}
                placeholder="From pre-construction"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Actual Replaced Depth (cm)</label>
              <input
                type="number"
                style={inputStyle}
                value={cleanupData.topsoilReplacement.actualReplacedDepthCm}
                onFocus={() => handleNestedFieldFocus('topsoilReplacement', 'actualReplacedDepthCm', cleanupData.topsoilReplacement.actualReplacedDepthCm)}
                onChange={(e) => updateTopsoilReplacement('actualReplacedDepthCm', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('topsoilReplacement', 'actualReplacedDepthCm', e.target.value, 'Actual Replaced Depth')}
                placeholder="Measured"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Variance (cm)</label>
              <div style={{
                ...inputStyle,
                backgroundColor: '#f8f9fa',
                color: cleanupData.topsoilReplacement.depthCompliance === 'Pass' ? '#28a745' :
                       cleanupData.topsoilReplacement.depthCompliance === 'Fail' ? '#dc3545' : '#666'
              }}>
                {cleanupData.topsoilReplacement.depthVarianceCm || '-'}
                {cleanupData.topsoilReplacement.depthCompliance && ` (${cleanupData.topsoilReplacement.depthCompliance})`}
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#795548', margin: '0 0 10px 0' }}>Moisture & Texture</h5>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.topsoilReplacement.replacedInDryConditions}
              onChange={(e) => {
                updateTopsoilReplacement('replacedInDryConditions', e.target.checked)
                handleNestedFieldBlur('topsoilReplacement', 'replacedInDryConditions', e.target.checked, 'Replaced in Dry Conditions')
              }}
            />
            <span style={labelStyle}>Topsoil replaced in dry conditions (prevents ad-mixing)</span>
          </div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.topsoilReplacement.gradeMatchesSurrounding}
              onChange={(e) => {
                updateTopsoilReplacement('gradeMatchesSurrounding', e.target.checked)
                handleNestedFieldBlur('topsoilReplacement', 'gradeMatchesSurrounding', e.target.checked, 'Grade Matches Surrounding')
              }}
            />
            <span style={labelStyle}>Grade matches surrounding undisturbed land</span>
          </div>
          <div style={{ ...checkboxRowStyle, backgroundColor: cleanupData.topsoilReplacement.admixingObserved ? '#fff3cd' : 'transparent' }}>
            <input
              type="checkbox"
              checked={cleanupData.topsoilReplacement.admixingObserved}
              onChange={(e) => {
                updateTopsoilReplacement('admixingObserved', e.target.checked)
                handleNestedFieldBlur('topsoilReplacement', 'admixingObserved', e.target.checked, 'Ad-mixing Observed')
              }}
            />
            <span style={{ ...labelStyle, color: cleanupData.topsoilReplacement.admixingObserved ? '#856404' : '#495057' }}>
              Ad-mixing observed (ISSUE - document details)
            </span>
          </div>
          {cleanupData.topsoilReplacement.admixingObserved && (
            <div style={{ marginLeft: '20px', marginTop: '10px' }}>
              <label style={{ fontSize: '12px', color: '#856404' }}>Ad-mixing Details (Required)</label>
              <textarea
                style={{ ...inputStyle, minHeight: '60px', borderColor: '#ffc107' }}
                value={cleanupData.topsoilReplacement.admixingNotes}
                onFocus={() => handleNestedFieldFocus('topsoilReplacement', 'admixingNotes', cleanupData.topsoilReplacement.admixingNotes)}
                onChange={(e) => updateTopsoilReplacement('admixingNotes', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('topsoilReplacement', 'admixingNotes', e.target.value, 'Ad-mixing Notes')}
                placeholder="Document extent, location, and corrective action..."
              />
            </div>
          )}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#795548', margin: '0 0 10px 0' }}>Final Rock Pick</h5>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.topsoilReplacement.finalRockPickComplete}
              onChange={(e) => {
                updateTopsoilReplacement('finalRockPickComplete', e.target.checked)
                handleNestedFieldBlur('topsoilReplacement', 'finalRockPickComplete', e.target.checked, 'Final Rock Pick Complete')
              }}
            />
            <span style={labelStyle}>Final rock pick complete</span>
          </div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.topsoilReplacement.stoninessMatchesAdjacent}
              onChange={(e) => {
                updateTopsoilReplacement('stoninessMatchesAdjacent', e.target.checked)
                handleNestedFieldBlur('topsoilReplacement', 'stoninessMatchesAdjacent', e.target.checked, 'Stoniness Matches Adjacent')
              }}
            />
            <span style={labelStyle}>Topsoil stoniness matches adjacent undisturbed land</span>
          </div>
        </div>

        <div>
          <label style={{ fontSize: '12px', color: '#666' }}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: '60px' }}
            value={cleanupData.topsoilReplacement.notes}
            onFocus={() => handleNestedFieldFocus('topsoilReplacement', 'notes', cleanupData.topsoilReplacement.notes)}
            onChange={(e) => updateTopsoilReplacement('notes', e.target.value)}
            onBlur={(e) => handleNestedFieldBlur('topsoilReplacement', 'notes', e.target.value, 'Topsoil Notes')}
            placeholder="Additional notes on topsoil replacement..."
          />
        </div>
      </CollapsibleSection>

      {/* 2. Revegetation & Seeding */}
      <CollapsibleSection
        id="revegetation"
        title="2. Revegetation & Seeding"
        color="#388e3c"
        bgColor="#e8f5e9"
        borderColor="#a5d6a7"
        hasData={hasRevegetationData}
        expanded={expandedSections.revegetation}
        onToggle={toggleSection}
      >
        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#388e3c', margin: '0 0 10px 0' }}>Seed Mix Data</h5>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Seed Mix ID</label>
              <input
                type="text"
                style={inputStyle}
                value={cleanupData.revegetation.seedMixId}
                onFocus={() => handleNestedFieldFocus('revegetation', 'seedMixId', cleanupData.revegetation.seedMixId)}
                onChange={(e) => updateRevegetation('seedMixId', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'seedMixId', e.target.value, 'Seed Mix ID')}
                placeholder="e.g., MIX-AG-001"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Seed Mix Description</label>
              <input
                type="text"
                style={inputStyle}
                value={cleanupData.revegetation.seedMixDescription}
                onFocus={() => handleNestedFieldFocus('revegetation', 'seedMixDescription', cleanupData.revegetation.seedMixDescription)}
                onChange={(e) => updateRevegetation('seedMixDescription', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'seedMixDescription', e.target.value, 'Seed Mix Description')}
                placeholder="e.g., Agricultural Pasture Mix"
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Application Rate (kg/ha)</label>
              <input
                type="number"
                step="0.1"
                style={inputStyle}
                value={cleanupData.revegetation.applicationRateKgHa}
                onFocus={() => handleNestedFieldFocus('revegetation', 'applicationRateKgHa', cleanupData.revegetation.applicationRateKgHa)}
                onChange={(e) => updateRevegetation('applicationRateKgHa', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'applicationRateKgHa', e.target.value, 'Seed Application Rate')}
                placeholder="e.g., 25"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Area Seeded (ha)</label>
              <input
                type="number"
                step="0.01"
                style={inputStyle}
                value={cleanupData.revegetation.areaSeededHa}
                onFocus={() => handleNestedFieldFocus('revegetation', 'areaSeededHa', cleanupData.revegetation.areaSeededHa)}
                onChange={(e) => updateRevegetation('areaSeededHa', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'areaSeededHa', e.target.value, 'Area Seeded')}
                placeholder="e.g., 0.5"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Total Seed Used (kg)</label>
              <div style={{ ...inputStyle, backgroundColor: '#f8f9fa', color: '#28a745' }}>
                {cleanupData.revegetation.totalSeedUsedKg || 'Auto-calculated'}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Seeding Method</label>
              <select
                style={inputStyle}
                value={cleanupData.revegetation.seedingMethod}
                onFocus={() => handleNestedFieldFocus('revegetation', 'seedingMethod', cleanupData.revegetation.seedingMethod)}
                onChange={(e) => updateRevegetation('seedingMethod', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'seedingMethod', e.target.value, 'Seeding Method')}
              >
                <option value="">Select...</option>
                <option value="Broadcast">Broadcast</option>
                <option value="Hydroseed">Hydroseed</option>
                <option value="Drill Seed">Drill Seed</option>
                <option value="Hand Broadcast">Hand Broadcast</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Seeding Date</label>
              <input
                type="date"
                style={inputStyle}
                value={cleanupData.revegetation.seedingDate}
                onFocus={() => handleNestedFieldFocus('revegetation', 'seedingDate', cleanupData.revegetation.seedingDate)}
                onChange={(e) => updateRevegetation('seedingDate', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'seedingDate', e.target.value, 'Seeding Date')}
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#388e3c', margin: '0 0 10px 0' }}>Fertilizer & Mulch</h5>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Fertilizer Type</label>
              <input
                type="text"
                style={inputStyle}
                value={cleanupData.revegetation.fertilizerType}
                onFocus={() => handleNestedFieldFocus('revegetation', 'fertilizerType', cleanupData.revegetation.fertilizerType)}
                onChange={(e) => updateRevegetation('fertilizerType', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'fertilizerType', e.target.value, 'Fertilizer Type')}
                placeholder="e.g., 10-10-10"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Rate (kg/ha)</label>
              <input
                type="number"
                step="0.1"
                style={inputStyle}
                value={cleanupData.revegetation.fertilizerRateKgHa}
                onFocus={() => handleNestedFieldFocus('revegetation', 'fertilizerRateKgHa', cleanupData.revegetation.fertilizerRateKgHa)}
                onChange={(e) => updateRevegetation('fertilizerRateKgHa', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'fertilizerRateKgHa', e.target.value, 'Fertilizer Rate')}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Bags Used</label>
              <input
                type="number"
                style={inputStyle}
                value={cleanupData.revegetation.fertilizerBagsUsed}
                onFocus={() => handleNestedFieldFocus('revegetation', 'fertilizerBagsUsed', cleanupData.revegetation.fertilizerBagsUsed)}
                onChange={(e) => updateRevegetation('fertilizerBagsUsed', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'fertilizerBagsUsed', e.target.value, 'Fertilizer Bags Used')}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Mulch Type</label>
              <select
                style={inputStyle}
                value={cleanupData.revegetation.mulchType}
                onFocus={() => handleNestedFieldFocus('revegetation', 'mulchType', cleanupData.revegetation.mulchType)}
                onChange={(e) => updateRevegetation('mulchType', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'mulchType', e.target.value, 'Mulch Type')}
              >
                <option value="">Select...</option>
                <option value="Straw">Straw</option>
                <option value="Straw with Tackifier">Straw with Tackifier</option>
                <option value="Hydromulch">Hydromulch</option>
                <option value="Wood Fiber">Wood Fiber</option>
                <option value="None">None</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Linear Meters</label>
              <input
                type="number"
                style={inputStyle}
                value={cleanupData.revegetation.mulchLinearMeters}
                onFocus={() => handleNestedFieldFocus('revegetation', 'mulchLinearMeters', cleanupData.revegetation.mulchLinearMeters)}
                onChange={(e) => updateRevegetation('mulchLinearMeters', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'mulchLinearMeters', e.target.value, 'Mulch Linear Meters')}
              />
            </div>
          </div>
          <div style={{ ...checkboxRowStyle, marginTop: '10px' }}>
            <input
              type="checkbox"
              checked={cleanupData.revegetation.tackifierUsed}
              onChange={(e) => {
                updateRevegetation('tackifierUsed', e.target.checked)
                handleNestedFieldBlur('revegetation', 'tackifierUsed', e.target.checked, 'Tackifier Used')
              }}
            />
            <span style={labelStyle}>Tackifier used</span>
          </div>
          {cleanupData.revegetation.tackifierUsed && (
            <div style={{ marginLeft: '20px', marginTop: '5px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Tackifier Type</label>
              <input
                type="text"
                style={{ ...inputStyle, width: '200px' }}
                value={cleanupData.revegetation.tackifierType}
                onFocus={() => handleNestedFieldFocus('revegetation', 'tackifierType', cleanupData.revegetation.tackifierType)}
                onChange={(e) => updateRevegetation('tackifierType', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('revegetation', 'tackifierType', e.target.value, 'Tackifier Type')}
              />
            </div>
          )}
        </div>

        <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '6px', border: '1px solid #ffc107' }}>
          <h5 style={{ fontSize: '13px', color: '#856404', margin: '0 0 10px 0' }}>
            SEED TAG VERIFICATION (MANDATORY)
          </h5>
          <p style={{ fontSize: '12px', color: '#856404', margin: '0 0 10px 0' }}>
            Upload photo of Seed Tag(s) to prove correct mix was used. This is required for BCER compliance.
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handlePhotoUpload(e, 'Seed Tag', true)}
            disabled={processingPhoto}
            style={{ fontSize: '12px' }}
          />
          {cleanupData.seedTagPhotos.length > 0 && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {cleanupData.seedTagPhotos.map((photo) => (
                <div key={photo.id} style={{
                  border: '2px solid #28a745',
                  borderRadius: '4px',
                  padding: '5px',
                  backgroundColor: '#fff'
                }}>
                  <img
                    src={photo.dataUrl}
                    alt="Seed Tag"
                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px' }}
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id, true)}
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: '5px',
                      padding: '2px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '10px'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: '10px', fontSize: '12px', color: cleanupData.revegetation.seedTagPhotoUploaded ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
            Status: {cleanupData.revegetation.seedTagPhotoUploaded ? '✓ Seed Tag Photo Uploaded' : '✗ Seed Tag Photo Required'}
          </div>
        </div>

        <div>
          <label style={{ fontSize: '12px', color: '#666' }}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: '60px' }}
            value={cleanupData.revegetation.notes}
            onFocus={() => handleNestedFieldFocus('revegetation', 'notes', cleanupData.revegetation.notes)}
            onChange={(e) => updateRevegetation('notes', e.target.value)}
            onBlur={(e) => handleNestedFieldBlur('revegetation', 'notes', e.target.value, 'Revegetation Notes')}
            placeholder="Additional notes on revegetation..."
          />
        </div>
      </CollapsibleSection>

      {/* 3. Permanent Erosion & Sediment Control */}
      <CollapsibleSection
        id="permanentESC"
        title="3. Permanent Erosion & Sediment Control"
        color="#0277bd"
        bgColor="#e1f5fe"
        borderColor="#81d4fa"
        hasData={hasPermanentESCData}
        expanded={expandedSections.permanentESC}
        onToggle={toggleSection}
      >
        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#0277bd', margin: '0 0 10px 0' }}>Permanent DESC Structures (As-Built)</h5>

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.permanentESC.permanentSiltFencesInstalled}
              onChange={(e) => {
                updatePermanentESC('permanentSiltFencesInstalled', e.target.checked)
                handleNestedFieldBlur('permanentESC', 'permanentSiltFencesInstalled', e.target.checked, 'Permanent Silt Fences Installed')
              }}
            />
            <span style={labelStyle}>Permanent silt fences installed</span>
          </div>
          {cleanupData.permanentESC.permanentSiltFencesInstalled && (
            <div style={{ marginLeft: '20px', marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Linear Meters</label>
              <input
                type="number"
                style={{ ...inputStyle, width: '120px' }}
                value={cleanupData.permanentESC.permanentSiltFenceMeters}
                onFocus={() => handleNestedFieldFocus('permanentESC', 'permanentSiltFenceMeters', cleanupData.permanentESC.permanentSiltFenceMeters)}
                onChange={(e) => updatePermanentESC('permanentSiltFenceMeters', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('permanentESC', 'permanentSiltFenceMeters', e.target.value, 'Permanent Silt Fence Meters')}
              />
            </div>
          )}

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.permanentESC.finalWaterBarsInstalled}
              onChange={(e) => {
                updatePermanentESC('finalWaterBarsInstalled', e.target.checked)
                handleNestedFieldBlur('permanentESC', 'finalWaterBarsInstalled', e.target.checked, 'Final Water Bars Installed')
              }}
            />
            <span style={labelStyle}>Final water bars installed</span>
          </div>
          {cleanupData.permanentESC.finalWaterBarsInstalled && (
            <div style={{ marginLeft: '20px', marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Count</label>
              <input
                type="number"
                style={{ ...inputStyle, width: '80px' }}
                value={cleanupData.permanentESC.finalWaterBarsCount}
                onFocus={() => handleNestedFieldFocus('permanentESC', 'finalWaterBarsCount', cleanupData.permanentESC.finalWaterBarsCount)}
                onChange={(e) => updatePermanentESC('finalWaterBarsCount', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('permanentESC', 'finalWaterBarsCount', e.target.value, 'Final Water Bars Count')}
              />
            </div>
          )}

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.permanentESC.erosionControlBlanketsInstalled}
              onChange={(e) => {
                updatePermanentESC('erosionControlBlanketsInstalled', e.target.checked)
                handleNestedFieldBlur('permanentESC', 'erosionControlBlanketsInstalled', e.target.checked, 'Erosion Control Blankets Installed')
              }}
            />
            <span style={labelStyle}>Erosion control blankets installed</span>
          </div>
          {cleanupData.permanentESC.erosionControlBlanketsInstalled && (
            <div style={{ marginLeft: '20px', marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Area (m²)</label>
              <input
                type="number"
                style={{ ...inputStyle, width: '120px' }}
                value={cleanupData.permanentESC.erosionControlBlanketM2}
                onFocus={() => handleNestedFieldFocus('permanentESC', 'erosionControlBlanketM2', cleanupData.permanentESC.erosionControlBlanketM2)}
                onChange={(e) => updatePermanentESC('erosionControlBlanketM2', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('permanentESC', 'erosionControlBlanketM2', e.target.value, 'Erosion Control Blanket Area')}
              />
            </div>
          )}

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.permanentESC.ripRapInstalled}
              onChange={(e) => {
                updatePermanentESC('ripRapInstalled', e.target.checked)
                handleNestedFieldBlur('permanentESC', 'ripRapInstalled', e.target.checked, 'Rip Rap Installed')
              }}
            />
            <span style={labelStyle}>Rip rap installed</span>
          </div>
          {cleanupData.permanentESC.ripRapInstalled && (
            <div style={{ marginLeft: '20px', marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Volume (m³)</label>
              <input
                type="number"
                step="0.1"
                style={{ ...inputStyle, width: '120px' }}
                value={cleanupData.permanentESC.ripRapM3}
                onFocus={() => handleNestedFieldFocus('permanentESC', 'ripRapM3', cleanupData.permanentESC.ripRapM3)}
                onChange={(e) => updatePermanentESC('ripRapM3', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('permanentESC', 'ripRapM3', e.target.value, 'Rip Rap Volume')}
              />
            </div>
          )}

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.permanentESC.checkDamsInstalled}
              onChange={(e) => {
                updatePermanentESC('checkDamsInstalled', e.target.checked)
                handleNestedFieldBlur('permanentESC', 'checkDamsInstalled', e.target.checked, 'Check Dams Installed')
              }}
            />
            <span style={labelStyle}>Check dams installed</span>
          </div>
          {cleanupData.permanentESC.checkDamsInstalled && (
            <div style={{ marginLeft: '20px', marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Count</label>
              <input
                type="number"
                style={{ ...inputStyle, width: '80px' }}
                value={cleanupData.permanentESC.checkDamsCount}
                onFocus={() => handleNestedFieldFocus('permanentESC', 'checkDamsCount', cleanupData.permanentESC.checkDamsCount)}
                onChange={(e) => updatePermanentESC('checkDamsCount', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('permanentESC', 'checkDamsCount', e.target.value, 'Check Dams Count')}
              />
            </div>
          )}
        </div>

        <div style={{ ...checkboxRowStyle, backgroundColor: '#e8f5e9', padding: '10px', borderRadius: '4px' }}>
          <input
            type="checkbox"
            checked={cleanupData.permanentESC.allPermanentESCComplete}
            onChange={(e) => {
              updatePermanentESC('allPermanentESCComplete', e.target.checked)
              handleNestedFieldBlur('permanentESC', 'allPermanentESCComplete', e.target.checked, 'All Permanent ESC Complete')
            }}
          />
          <span style={{ ...labelStyle, fontWeight: 'bold', color: '#2e7d32' }}>
            ALL PERMANENT ESC STRUCTURES COMPLETE
          </span>
        </div>

        <div style={{ marginTop: '15px' }}>
          <label style={{ fontSize: '12px', color: '#666' }}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: '60px' }}
            value={cleanupData.permanentESC.notes}
            onFocus={() => handleNestedFieldFocus('permanentESC', 'notes', cleanupData.permanentESC.notes)}
            onChange={(e) => updatePermanentESC('notes', e.target.value)}
            onBlur={(e) => handleNestedFieldBlur('permanentESC', 'notes', e.target.value, 'Permanent ESC Notes')}
            placeholder="Notes on permanent erosion control structures..."
          />
        </div>
      </CollapsibleSection>

      {/* 4. Asset Restoration */}
      <CollapsibleSection
        id="assetRestoration"
        title="4. Asset Restoration & Landowner Sign-off"
        color="#6a1b9a"
        bgColor="#f3e5f5"
        borderColor="#ce93d8"
        hasData={hasAssetData}
        expanded={expandedSections.assetRestoration}
        onToggle={toggleSection}
      >
        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#6a1b9a', margin: '0 0 10px 0' }}>Infrastructure Restoration</h5>

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.assetRestoration.permanentFencesReinstalled}
              onChange={(e) => {
                updateAssetRestoration('permanentFencesReinstalled', e.target.checked)
                handleNestedFieldBlur('assetRestoration', 'permanentFencesReinstalled', e.target.checked, 'Permanent Fences Reinstalled')
              }}
            />
            <span style={labelStyle}>Permanent fences re-installed</span>
          </div>
          {cleanupData.assetRestoration.permanentFencesReinstalled && (
            <div style={{ marginLeft: '20px', marginBottom: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#666' }}>Fence Type</label>
                <select
                  style={inputStyle}
                  value={cleanupData.assetRestoration.fenceType}
                  onChange={(e) => updateAssetRestoration('fenceType', e.target.value)}
                >
                  <option value="">Select...</option>
                  <option value="Page Wire">Page Wire</option>
                  <option value="Barbed Wire">Barbed Wire</option>
                  <option value="Electric">Electric</option>
                  <option value="Board">Board</option>
                  <option value="Chain Link">Chain Link</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666' }}>Linear Meters</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={cleanupData.assetRestoration.fenceLinearMeters}
                  onFocus={() => handleNestedFieldFocus('assetRestoration', 'fenceLinearMeters', cleanupData.assetRestoration.fenceLinearMeters)}
                  onChange={(e) => updateAssetRestoration('fenceLinearMeters', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('assetRestoration', 'fenceLinearMeters', e.target.value, 'Fence Linear Meters')}
                />
              </div>
            </div>
          )}

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.assetRestoration.gatesFunctional}
              onChange={(e) => {
                updateAssetRestoration('gatesFunctional', e.target.checked)
                handleNestedFieldBlur('assetRestoration', 'gatesFunctional', e.target.checked, 'Gates Functional')
              }}
            />
            <span style={labelStyle}>Gates functional</span>
          </div>
          {cleanupData.assetRestoration.gatesFunctional && (
            <div style={{ marginLeft: '20px', marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Number of Gates</label>
              <input
                type="number"
                style={{ ...inputStyle, width: '80px' }}
                value={cleanupData.assetRestoration.gatesCount}
                onFocus={() => handleNestedFieldFocus('assetRestoration', 'gatesCount', cleanupData.assetRestoration.gatesCount)}
                onChange={(e) => updateAssetRestoration('gatesCount', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('assetRestoration', 'gatesCount', e.target.value, 'Gates Count')}
              />
            </div>
          )}

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.assetRestoration.cattleGuardsRestored}
              onChange={(e) => {
                updateAssetRestoration('cattleGuardsRestored', e.target.checked)
                handleNestedFieldBlur('assetRestoration', 'cattleGuardsRestored', e.target.checked, 'Cattle Guards Restored')
              }}
            />
            <span style={labelStyle}>Cattle guards restored</span>
          </div>

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.assetRestoration.culvertsCleared}
              onChange={(e) => {
                updateAssetRestoration('culvertsCleared', e.target.checked)
                handleNestedFieldBlur('assetRestoration', 'culvertsCleared', e.target.checked, 'Culverts Cleared')
              }}
            />
            <span style={labelStyle}>Culverts cleared and functional</span>
          </div>

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.assetRestoration.accessRoadsRestored}
              onChange={(e) => {
                updateAssetRestoration('accessRoadsRestored', e.target.checked)
                handleNestedFieldBlur('assetRestoration', 'accessRoadsRestored', e.target.checked, 'Access Roads Restored')
              }}
            />
            <span style={labelStyle}>Access roads restored to pre-construction condition</span>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#6a1b9a', margin: '0 0 10px 0' }}>Pipeline Markers</h5>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.assetRestoration.pipelineMarkersInstalled}
              onChange={(e) => {
                updateAssetRestoration('pipelineMarkersInstalled', e.target.checked)
                handleNestedFieldBlur('assetRestoration', 'pipelineMarkersInstalled', e.target.checked, 'Pipeline Markers Installed')
              }}
            />
            <span style={labelStyle}>Pipeline markers installed</span>
          </div>
          {cleanupData.assetRestoration.pipelineMarkersInstalled && (
            <div style={{ marginLeft: '20px', marginBottom: '10px' }}>
              <div style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={cleanupData.assetRestoration.markersAtRoadCrossings}
                  onChange={(e) => updateAssetRestoration('markersAtRoadCrossings', e.target.checked)}
                />
                <span style={labelStyle}>Markers at road crossings</span>
              </div>
              <div style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={cleanupData.assetRestoration.markersAtWaterCrossings}
                  onChange={(e) => updateAssetRestoration('markersAtWaterCrossings', e.target.checked)}
                />
                <span style={labelStyle}>Markers at water crossings</span>
              </div>
              <div style={{ marginTop: '5px' }}>
                <label style={{ fontSize: '12px', color: '#666' }}>Total Markers Installed</label>
                <input
                  type="number"
                  style={{ ...inputStyle, width: '80px' }}
                  value={cleanupData.assetRestoration.markersCount}
                  onFocus={() => handleNestedFieldFocus('assetRestoration', 'markersCount', cleanupData.assetRestoration.markersCount)}
                  onChange={(e) => updateAssetRestoration('markersCount', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('assetRestoration', 'markersCount', e.target.value, 'Markers Count')}
                />
              </div>
            </div>
          )}

          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.assetRestoration.signageInstalled}
              onChange={(e) => {
                updateAssetRestoration('signageInstalled', e.target.checked)
                handleNestedFieldBlur('assetRestoration', 'signageInstalled', e.target.checked, 'Signage Installed')
              }}
            />
            <span style={labelStyle}>Warning signage installed</span>
          </div>
        </div>

        <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '6px', border: '1px solid #4caf50' }}>
          <h5 style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 10px 0' }}>Landowner Sign-off</h5>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={cleanupData.assetRestoration.landownerWalkthroughCompleted}
              onChange={(e) => {
                updateAssetRestoration('landownerWalkthroughCompleted', e.target.checked)
                handleNestedFieldBlur('assetRestoration', 'landownerWalkthroughCompleted', e.target.checked, 'Landowner Walkthrough Completed')
              }}
            />
            <span style={{ ...labelStyle, fontWeight: 'bold' }}>Preliminary landowner walkthrough completed</span>
          </div>
          {cleanupData.assetRestoration.landownerWalkthroughCompleted && (
            <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#666' }}>Date</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={cleanupData.assetRestoration.landownerWalkthroughDate}
                  onChange={(e) => updateAssetRestoration('landownerWalkthroughDate', e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#666' }}>Landowner Name</label>
                <input
                  type="text"
                  style={inputStyle}
                  value={cleanupData.assetRestoration.landownerName}
                  onFocus={() => handleNestedFieldFocus('assetRestoration', 'landownerName', cleanupData.assetRestoration.landownerName)}
                  onChange={(e) => updateAssetRestoration('landownerName', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('assetRestoration', 'landownerName', e.target.value, 'Landowner Name')}
                />
              </div>
            </div>
          )}
          {cleanupData.assetRestoration.landownerWalkthroughCompleted && (
            <div style={{ marginTop: '10px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>Landowner Concerns (if any)</label>
              <textarea
                style={{ ...inputStyle, minHeight: '60px' }}
                value={cleanupData.assetRestoration.landownerConcerns}
                onFocus={() => handleNestedFieldFocus('assetRestoration', 'landownerConcerns', cleanupData.assetRestoration.landownerConcerns)}
                onChange={(e) => updateAssetRestoration('landownerConcerns', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('assetRestoration', 'landownerConcerns', e.target.value, 'Landowner Concerns')}
                placeholder="Document any concerns raised during walkthrough..."
              />
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: '12px', color: '#666' }}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: '60px' }}
            value={cleanupData.assetRestoration.notes}
            onFocus={() => handleNestedFieldFocus('assetRestoration', 'notes', cleanupData.assetRestoration.notes)}
            onChange={(e) => updateAssetRestoration('notes', e.target.value)}
            onBlur={(e) => handleNestedFieldBlur('assetRestoration', 'notes', e.target.value, 'Asset Restoration Notes')}
            placeholder="Notes on asset restoration..."
          />
        </div>
      </CollapsibleSection>

      {/* 5. Data Context & Trackable Items */}
      <CollapsibleSection
        id="trackableItems"
        title="5. Data Context & Trackable Items"
        color="#f57c00"
        bgColor="#fff3e0"
        borderColor="#ffcc80"
        hasData={hasTrackableData}
        expanded={expandedSections.trackableItems}
        onToggle={toggleSection}
      >
        <div style={{ marginBottom: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#f57c00', margin: '0 0 10px 0' }}>Historical Context</h5>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Pre-Construction Land Use</label>
              <select
                style={inputStyle}
                value={cleanupData.preConstructionLandUse}
                onFocus={() => handleFieldFocus('preConstructionLandUse', cleanupData.preConstructionLandUse)}
                onChange={(e) => updateField('preConstructionLandUse', e.target.value)}
                onBlur={(e) => handleFieldBlur('preConstructionLandUse', e.target.value, 'Pre-Construction Land Use')}
              >
                <option value="">Select...</option>
                <option value="Agricultural - Cultivated">Agricultural - Cultivated</option>
                <option value="Agricultural - Pasture">Agricultural - Pasture</option>
                <option value="Forested - Coniferous">Forested - Coniferous</option>
                <option value="Forested - Deciduous">Forested - Deciduous</option>
                <option value="Forested - Mixed">Forested - Mixed</option>
                <option value="Wetland">Wetland</option>
                <option value="Grassland">Grassland</option>
                <option value="Residential">Residential</option>
                <option value="Industrial">Industrial</option>
                <option value="Crown Land">Crown Land</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={cleanupData.seedMixMatchesLandType}
                  onChange={(e) => {
                    updateField('seedMixMatchesLandType', e.target.checked)
                    handleFieldBlur('seedMixMatchesLandType', e.target.checked, 'Seed Mix Matches Land Type')
                  }}
                />
                <span style={labelStyle}>Seed mix matches land type</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #ffcc80', paddingTop: '15px' }}>
          <h5 style={{ fontSize: '13px', color: '#f57c00', margin: '0 0 10px 0' }}>Billable Quantities (Auto-logged to Trackable Items)</h5>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Seed Mix (kg)</label>
              <input
                type="number"
                step="0.1"
                style={inputStyle}
                value={cleanupData.trackableItems.seedMixKg}
                onFocus={() => handleNestedFieldFocus('trackableItems', 'seedMixKg', cleanupData.trackableItems.seedMixKg)}
                onChange={(e) => updateTrackableItems('seedMixKg', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('trackableItems', 'seedMixKg', e.target.value, 'Seed Mix Quantity')}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Fertilizer (bags)</label>
              <input
                type="number"
                style={inputStyle}
                value={cleanupData.trackableItems.fertilizerBags}
                onFocus={() => handleNestedFieldFocus('trackableItems', 'fertilizerBags', cleanupData.trackableItems.fertilizerBags)}
                onChange={(e) => updateTrackableItems('fertilizerBags', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('trackableItems', 'fertilizerBags', e.target.value, 'Fertilizer Bags')}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Erosion Blanket (m²)</label>
              <input
                type="number"
                style={inputStyle}
                value={cleanupData.trackableItems.erosionBlanketM2}
                onFocus={() => handleNestedFieldFocus('trackableItems', 'erosionBlanketM2', cleanupData.trackableItems.erosionBlanketM2)}
                onChange={(e) => updateTrackableItems('erosionBlanketM2', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('trackableItems', 'erosionBlanketM2', e.target.value, 'Erosion Blanket Area')}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Silt Fence (m)</label>
              <input
                type="number"
                style={inputStyle}
                value={cleanupData.trackableItems.siltFenceMeters}
                onFocus={() => handleNestedFieldFocus('trackableItems', 'siltFenceMeters', cleanupData.trackableItems.siltFenceMeters)}
                onChange={(e) => updateTrackableItems('siltFenceMeters', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('trackableItems', 'siltFenceMeters', e.target.value, 'Silt Fence Meters')}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Fence (m)</label>
              <input
                type="number"
                style={inputStyle}
                value={cleanupData.trackableItems.fenceMeters}
                onFocus={() => handleNestedFieldFocus('trackableItems', 'fenceMeters', cleanupData.trackableItems.fenceMeters)}
                onChange={(e) => updateTrackableItems('fenceMeters', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('trackableItems', 'fenceMeters', e.target.value, 'Fence Meters')}
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 6. Photo Evidence */}
      <CollapsibleSection
        id="photos"
        title="6. Photo Evidence (GPS Required)"
        color="#c62828"
        bgColor="#ffebee"
        borderColor="#ef9a9a"
        hasData={hasPhotoData}
        expanded={expandedSections.photos}
        onToggle={toggleSection}
      >
        <div style={{ marginBottom: '15px' }}>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>
            Upload geotagged photos. GPS coordinates (6-decimal precision) and KP location extracted automatically.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#c62828', fontWeight: 'bold' }}>Final Green-Line Panorama (Required)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, 'Final Green-Line Panorama')}
                disabled={processingPhoto}
                style={{ fontSize: '12px', marginTop: '5px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Topsoil Replacement</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, 'Topsoil Replacement')}
                disabled={processingPhoto}
                style={{ fontSize: '12px', marginTop: '5px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Seeding/Revegetation</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, 'Seeding/Revegetation')}
                disabled={processingPhoto}
                style={{ fontSize: '12px', marginTop: '5px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Permanent ESC</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, 'Permanent ESC')}
                disabled={processingPhoto}
                style={{ fontSize: '12px', marginTop: '5px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666' }}>Fence/Asset Restoration</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, 'Asset Restoration')}
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

      {/* Final Status */}
      <div style={{
        backgroundColor: '#e8f5e9',
        padding: '15px',
        borderRadius: '6px',
        marginTop: '15px',
        border: '1px solid #4caf50'
      }}>
        <h5 style={{ fontSize: '14px', color: '#2e7d32', margin: '0 0 10px 0' }}>Final Inspection Status</h5>
        <div style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={cleanupData.finalInspectionComplete}
            onChange={(e) => {
              updateField('finalInspectionComplete', e.target.checked)
              handleFieldBlur('finalInspectionComplete', e.target.checked, 'Final Inspection Complete')
            }}
          />
          <span style={{ ...labelStyle, fontWeight: 'bold' }}>Final inspection complete</span>
        </div>
        <div style={{ ...checkboxRowStyle, backgroundColor: cleanupData.readyForLandownerRelease ? '#c8e6c9' : 'transparent', padding: '10px', borderRadius: '4px' }}>
          <input
            type="checkbox"
            checked={cleanupData.readyForLandownerRelease}
            onChange={(e) => {
              updateField('readyForLandownerRelease', e.target.checked)
              handleFieldBlur('readyForLandownerRelease', e.target.checked, 'Ready for Landowner Release')
            }}
          />
          <span style={{ ...labelStyle, fontWeight: 'bold', color: '#2e7d32' }}>
            READY FOR LANDOWNER RELEASE
          </span>
        </div>
      </div>

      {/* General Comments */}
      <div style={{ marginTop: '15px' }}>
        <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>General Comments</label>
        <textarea
          style={{ ...inputStyle, minHeight: '80px', marginTop: '5px' }}
          value={cleanupData.comments}
          onFocus={() => handleFieldFocus('comments', cleanupData.comments)}
          onChange={(e) => updateField('comments', e.target.value)}
          onBlur={(e) => handleFieldBlur('comments', e.target.value, 'General Comments')}
          placeholder="Additional comments on final cleanup operations..."
        />
      </div>
    </div>
  )
}

export default FinalCleanupLog
