import React, { useState, useRef } from 'react'
import { useActivityAudit } from './useActivityAudit'

function GradingLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, metersToday, logId, reportId }) {
  const [showSoftSpots, setShowSoftSpots] = useState(data?.softSpots?.enabled || false)
  const [showCrossings, setShowCrossings] = useState(data?.crossings?.enabled || false)
  
  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState({
    rowConditions: false,
    pileSeparation: false,
    topsoilStatus: false,
    drainage: false,
    environmental: false
  })
  
  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }
  
  // Collapsible section wrapper component
  const CollapsibleSection = ({ id, title, color = '#495057', bgColor = '#e9ecef', borderColor = '#dee2e6', contentBgColor = '#f8f9fa', children }) => (
    <div style={{ marginBottom: '10px' }}>
      <div 
        style={{ 
          fontSize: '14px', 
          fontWeight: 'bold', 
          color: color, 
          padding: '12px 15px',
          backgroundColor: bgColor,
          borderRadius: expandedSections[id] ? '6px 6px 0 0' : '6px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
          border: `1px solid ${borderColor}`
        }}
        onClick={() => toggleSection(id)}
      >
        <span>{title}</span>
        <span style={{ fontSize: '18px' }}>{expandedSections[id] ? '−' : '+'}</span>
      </div>
      {expandedSections[id] && (
        <div style={{ 
          padding: '15px', 
          backgroundColor: contentBgColor, 
          borderRadius: '0 0 6px 6px', 
          border: `1px solid ${borderColor}`,
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
  } = useActivityAudit(logId || reportId, 'GradingLog')
  
  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure
  const defaultData = {
    rowWidth: '',
    rowWidthSpec: '',
    rowCondition: '',
    topsoilPileSeparation: '',
    topsoilPileLocation: '',
    subsoilPileLocation: '',
    pileSeparationMaintained: '',
    pileSeparationIssues: '',
    drainageCondition: '',
    crownMaintained: '',
    pondingObserved: '',
    pondingLocation: '',
    drainageControlsInstalled: '',
    drainageControlsType: '',
    siltFenceInstalled: '',
    siltFenceCondition: '',
    strawBales: '',
    erosionBlankets: '',
    sedimentTraps: '',
    environmentalIssues: '',
    softSpots: { enabled: false, entries: [] },
    accessMaintained: '',
    crossings: { enabled: false, entries: [] },
    gradingEquipment: '',
    equipmentOther: '',
    topsoilStripped: '',
    topsoilDepth: '',
    topsoilStockpiled: '',
    comments: ''
  }

  const gradingData = {
    ...defaultData,
    ...data,
    softSpots: { ...defaultData.softSpots, ...(data?.softSpots || {}), entries: data?.softSpots?.entries || [] },
    crossings: { ...defaultData.crossings, ...(data?.crossings || {}), entries: data?.crossings?.entries || [] }
  }

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
    onChange({ ...gradingData, [field]: value })
  }

  // Soft Spots management
  const toggleSoftSpots = () => {
    const newEnabled = !showSoftSpots
    setShowSoftSpots(newEnabled)
    onChange({ ...gradingData, softSpots: { ...gradingData.softSpots, enabled: newEnabled } })
  }

  const addSoftSpot = () => {
    const newSpot = { id: Date.now(), location: '', kp: '', length: '', width: '', cause: '', actionTaken: '', resolved: '', comments: '' }
    onChange({ ...gradingData, softSpots: { ...gradingData.softSpots, entries: [...gradingData.softSpots.entries, newSpot] } })
    logEntryAdd('Soft Spot', `Soft Spot #${gradingData.softSpots.entries.length + 1}`)
  }

  const updateSoftSpot = (id, field, value) => {
    const updated = gradingData.softSpots.entries.map(spot => spot.id === id ? { ...spot, [field]: value } : spot)
    onChange({ ...gradingData, softSpots: { ...gradingData.softSpots, entries: updated } })
  }

  const removeSoftSpot = (id) => {
    const spot = gradingData.softSpots.entries.find(s => s.id === id)
    const idx = gradingData.softSpots.entries.findIndex(s => s.id === id)
    onChange({ ...gradingData, softSpots: { ...gradingData.softSpots, entries: gradingData.softSpots.entries.filter(s => s.id !== id) } })
    logEntryDelete('Soft Spot', spot?.kp || `Soft Spot #${idx + 1}`)
  }

  // Crossings management
  const toggleCrossings = () => {
    const newEnabled = !showCrossings
    setShowCrossings(newEnabled)
    onChange({ ...gradingData, crossings: { ...gradingData.crossings, enabled: newEnabled } })
  }

  const addCrossing = () => {
    const newCrossing = { id: Date.now(), crossingType: '', kp: '', accessMaintained: '', signageInPlace: '', trafficControl: '', condition: '', comments: '' }
    onChange({ ...gradingData, crossings: { ...gradingData.crossings, entries: [...gradingData.crossings.entries, newCrossing] } })
    logEntryAdd('Crossing', `Crossing #${gradingData.crossings.entries.length + 1}`)
  }

  const updateCrossing = (id, field, value) => {
    const updated = gradingData.crossings.entries.map(crossing => crossing.id === id ? { ...crossing, [field]: value } : crossing)
    onChange({ ...gradingData, crossings: { ...gradingData.crossings, entries: updated } })
  }

  const removeCrossing = (id) => {
    const crossing = gradingData.crossings.entries.find(c => c.id === id)
    const idx = gradingData.crossings.entries.findIndex(c => c.id === id)
    onChange({ ...gradingData, crossings: { ...gradingData.crossings, entries: gradingData.crossings.entries.filter(c => c.id !== id) } })
    logEntryDelete('Crossing', crossing?.kp || `Crossing #${idx + 1}`)
  }

  const getSoftSpotLabel = (spot, index) => spot.kp || `Soft Spot #${index + 1}`
  const getCrossingLabel = (crossing, index) => crossing.kp || `Crossing #${index + 1}`

  // Styles
  const sectionStyle = { marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }
  const sectionHeaderStyle = { fontSize: '14px', fontWeight: 'bold', color: '#495057', marginBottom: '15px', paddingBottom: '8px', borderBottom: '2px solid #6c757d' }
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }
  const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }

  return (
    <div style={{ marginTop: '15px' }}>
      {/* INHERITED INFO BAR */}
      {(contractor || foreman || reportDate || startKP || endKP) && (
        <div style={{ padding: '12px 15px', backgroundColor: '#e2e3e5', borderRadius: '6px', marginBottom: '15px', border: '1px solid #6c757d' }}>
          <span style={{ fontSize: '13px', color: '#495057' }}>
            <strong>📋 From Activity:</strong>{' '}
            {reportDate && <>Date: <strong>{reportDate}</strong></>}
            {reportDate && contractor && ' | '}
            {contractor && <>Contractor: <strong>{contractor}</strong></>}
            {(reportDate || contractor) && foreman && ' | '}
            {foreman && <>Foreman: <strong>{foreman}</strong></>}
          </span>
          {(startKP || endKP) && (
            <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#d6d8db', borderRadius: '4px' }}>
              <span style={{ fontSize: '13px', color: '#495057' }}>
                <strong>📏 Chainage:</strong>{' '}
                {startKP && <>From: <strong>{startKP}</strong></>}
                {startKP && endKP && ' → '}
                {endKP && <>To: <strong>{endKP}</strong></>}
                {metersToday && <> | <strong style={{ color: '#155724' }}>{metersToday}m Today</strong></>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ROW CONDITIONS - Collapsible */}
      <CollapsibleSection id="rowConditions" title="🛤️ RIGHT OF WAY CONDITIONS">
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>ROW Width (m)</label>
            <input type="number" step="0.1" value={gradingData.rowWidth}
              onFocus={() => handleFieldFocus('rowWidth', gradingData.rowWidth)}
              onChange={(e) => updateField('rowWidth', e.target.value)}
              onBlur={(e) => handleFieldBlur('rowWidth', e.target.value, 'ROW Width')}
              placeholder="Actual width" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Specified Width (m)</label>
            <input type="number" step="0.1" value={gradingData.rowWidthSpec}
              onFocus={() => handleFieldFocus('rowWidthSpec', gradingData.rowWidthSpec)}
              onChange={(e) => updateField('rowWidthSpec', e.target.value)}
              onBlur={(e) => handleFieldBlur('rowWidthSpec', e.target.value, 'Specified Width')}
              placeholder="Per drawings" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ROW Condition</label>
            <select value={gradingData.rowCondition}
              onFocus={() => handleFieldFocus('rowCondition', gradingData.rowCondition)}
              onChange={(e) => { updateField('rowCondition', e.target.value); handleFieldBlur('rowCondition', e.target.value, 'ROW Condition') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Poor">Poor - Requires Attention</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Grading Equipment</label>
            <select value={gradingData.gradingEquipment}
              onFocus={() => handleFieldFocus('gradingEquipment', gradingData.gradingEquipment)}
              onChange={(e) => { updateField('gradingEquipment', e.target.value); handleFieldBlur('gradingEquipment', e.target.value, 'Grading Equipment') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Dozer">Dozer</option>
              <option value="Grader">Grader</option>
              <option value="Excavator">Excavator</option>
              <option value="Skid Steer">Skid Steer</option>
              <option value="Multiple">Multiple Equipment</option>
              <option value="Other">Other</option>
            </select>
          </div>
          {gradingData.gradingEquipment === 'Other' && (
            <div>
              <label style={labelStyle}>Other Equipment</label>
              <input type="text" value={gradingData.equipmentOther}
                onFocus={() => handleFieldFocus('equipmentOther', gradingData.equipmentOther)}
                onChange={(e) => updateField('equipmentOther', e.target.value)}
                onBlur={(e) => handleFieldBlur('equipmentOther', e.target.value, 'Other Equipment')}
                placeholder="Specify equipment" style={inputStyle} />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* PILE SEPARATION - Collapsible */}
      <CollapsibleSection 
        id="pileSeparation" 
        title="⚠️ PILE SEPARATION (Critical for Reclamation)"
        color="#856404"
        bgColor="#fff3cd"
        borderColor="#ffc107"
        contentBgColor="#fffef5"
      >
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Pile Separation Maintained?</label>
            <select value={gradingData.pileSeparationMaintained}
              onFocus={() => handleFieldFocus('pileSeparationMaintained', gradingData.pileSeparationMaintained)}
              onChange={(e) => { updateField('pileSeparationMaintained', e.target.value); handleFieldBlur('pileSeparationMaintained', e.target.value, 'Pile Separation Maintained') }}
              style={{ ...selectStyle, backgroundColor: gradingData.pileSeparationMaintained === 'Yes' ? '#d4edda' : gradingData.pileSeparationMaintained === 'No' ? '#f8d7da' : 'white', fontWeight: 'bold' }}>
              <option value="">Select...</option>
              <option value="Yes">✓ Yes - Compliant</option>
              <option value="No">✗ No - NCR Required</option>
              <option value="N/A">N/A - No Topsoil</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Separation Distance (m)</label>
            <input type="number" step="0.1" value={gradingData.topsoilPileSeparation}
              onFocus={() => handleFieldFocus('topsoilPileSeparation', gradingData.topsoilPileSeparation)}
              onChange={(e) => updateField('topsoilPileSeparation', e.target.value)}
              onBlur={(e) => handleFieldBlur('topsoilPileSeparation', e.target.value, 'Pile Separation Distance')}
              placeholder="Distance between piles" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Topsoil Pile Location</label>
            <select value={gradingData.topsoilPileLocation}
              onFocus={() => handleFieldFocus('topsoilPileLocation', gradingData.topsoilPileLocation)}
              onChange={(e) => { updateField('topsoilPileLocation', e.target.value); handleFieldBlur('topsoilPileLocation', e.target.value, 'Topsoil Pile Location') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Work Side">Work Side</option>
              <option value="Spoil Side">Spoil Side</option>
              <option value="Varies">Varies</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Subsoil/Spoil Pile Location</label>
            <select value={gradingData.subsoilPileLocation}
              onFocus={() => handleFieldFocus('subsoilPileLocation', gradingData.subsoilPileLocation)}
              onChange={(e) => { updateField('subsoilPileLocation', e.target.value); handleFieldBlur('subsoilPileLocation', e.target.value, 'Subsoil Pile Location') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Work Side">Work Side</option>
              <option value="Spoil Side">Spoil Side</option>
              <option value="Varies">Varies</option>
            </select>
          </div>
          {gradingData.pileSeparationMaintained === 'No' && (
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ ...labelStyle, color: '#721c24' }}>Issues / NCR Details *</label>
              <textarea value={gradingData.pileSeparationIssues}
                onFocus={() => handleFieldFocus('pileSeparationIssues', gradingData.pileSeparationIssues)}
                onChange={(e) => updateField('pileSeparationIssues', e.target.value)}
                onBlur={(e) => handleFieldBlur('pileSeparationIssues', e.target.value, 'Pile Separation Issues')}
                placeholder="Describe pile separation issues..." style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', backgroundColor: '#fff5f5' }} />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* TOPSOIL STATUS - Collapsible */}
      <CollapsibleSection id="topsoilStatus" title="🌱 TOPSOIL STATUS">
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Topsoil Stripped?</label>
            <select value={gradingData.topsoilStripped}
              onFocus={() => handleFieldFocus('topsoilStripped', gradingData.topsoilStripped)}
              onChange={(e) => { updateField('topsoilStripped', e.target.value); handleFieldBlur('topsoilStripped', e.target.value, 'Topsoil Stripped') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="Partial">Partial</option>
              <option value="N/A">N/A - No Topsoil Present</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Topsoil Depth (cm)</label>
            <input type="number" value={gradingData.topsoilDepth}
              onFocus={() => handleFieldFocus('topsoilDepth', gradingData.topsoilDepth)}
              onChange={(e) => updateField('topsoilDepth', e.target.value)}
              onBlur={(e) => handleFieldBlur('topsoilDepth', e.target.value, 'Topsoil Depth')}
              placeholder="Average depth" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Topsoil Stockpiled Properly?</label>
            <select value={gradingData.topsoilStockpiled}
              onFocus={() => handleFieldFocus('topsoilStockpiled', gradingData.topsoilStockpiled)}
              onChange={(e) => { updateField('topsoilStockpiled', e.target.value); handleFieldBlur('topsoilStockpiled', e.target.value, 'Topsoil Stockpiled') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No - Requires Attention</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
        </div>
      </CollapsibleSection>

      {/* DRAINAGE - Collapsible */}
      <CollapsibleSection id="drainage" title="💧 DRAINAGE">
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Drainage Condition</label>
            <select value={gradingData.drainageCondition}
              onFocus={() => handleFieldFocus('drainageCondition', gradingData.drainageCondition)}
              onChange={(e) => { updateField('drainageCondition', e.target.value); handleFieldBlur('drainageCondition', e.target.value, 'Drainage Condition') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Good">Good - Draining Well</option>
              <option value="Fair">Fair - Some Issues</option>
              <option value="Poor">Poor - Standing Water</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Crown Maintained?</label>
            <select value={gradingData.crownMaintained}
              onFocus={() => handleFieldFocus('crownMaintained', gradingData.crownMaintained)}
              onChange={(e) => { updateField('crownMaintained', e.target.value); handleFieldBlur('crownMaintained', e.target.value, 'Crown Maintained') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Ponding Observed?</label>
            <select value={gradingData.pondingObserved}
              onFocus={() => handleFieldFocus('pondingObserved', gradingData.pondingObserved)}
              onChange={(e) => { updateField('pondingObserved', e.target.value); handleFieldBlur('pondingObserved', e.target.value, 'Ponding Observed') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
          {gradingData.pondingObserved === 'Yes' && (
            <div>
              <label style={labelStyle}>Ponding Location (KP)</label>
              <input type="text" value={gradingData.pondingLocation}
                onFocus={() => handleFieldFocus('pondingLocation', gradingData.pondingLocation)}
                onChange={(e) => updateField('pondingLocation', e.target.value)}
                onBlur={(e) => handleFieldBlur('pondingLocation', e.target.value, 'Ponding Location')}
                placeholder="e.g. 5+350" style={inputStyle} />
            </div>
          )}
          <div>
            <label style={labelStyle}>Drainage Controls Installed?</label>
            <select value={gradingData.drainageControlsInstalled}
              onFocus={() => handleFieldFocus('drainageControlsInstalled', gradingData.drainageControlsInstalled)}
              onChange={(e) => { updateField('drainageControlsInstalled', e.target.value); handleFieldBlur('drainageControlsInstalled', e.target.value, 'Drainage Controls Installed') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
          {gradingData.drainageControlsInstalled === 'Yes' && (
            <div>
              <label style={labelStyle}>Control Type</label>
              <input type="text" value={gradingData.drainageControlsType}
                onFocus={() => handleFieldFocus('drainageControlsType', gradingData.drainageControlsType)}
                onChange={(e) => updateField('drainageControlsType', e.target.value)}
                onBlur={(e) => handleFieldBlur('drainageControlsType', e.target.value, 'Drainage Control Type')}
                placeholder="e.g. Culverts, berms, swales" style={inputStyle} />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ENVIRONMENTAL CONTROLS - Collapsible */}
      <CollapsibleSection 
        id="environmental" 
        title="🌿 ENVIRONMENTAL CONTROLS"
        color="#155724"
        bgColor="#d4edda"
        borderColor="#28a745"
        contentBgColor="#f0fff4"
      >
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Silt Fence Installed?</label>
            <select value={gradingData.siltFenceInstalled}
              onFocus={() => handleFieldFocus('siltFenceInstalled', gradingData.siltFenceInstalled)}
              onChange={(e) => { updateField('siltFenceInstalled', e.target.value); handleFieldBlur('siltFenceInstalled', e.target.value, 'Silt Fence Installed') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
          {gradingData.siltFenceInstalled === 'Yes' && (
            <div>
              <label style={labelStyle}>Silt Fence Condition</label>
              <select value={gradingData.siltFenceCondition}
                onFocus={() => handleFieldFocus('siltFenceCondition', gradingData.siltFenceCondition)}
                onChange={(e) => { updateField('siltFenceCondition', e.target.value); handleFieldBlur('siltFenceCondition', e.target.value, 'Silt Fence Condition') }}
                style={selectStyle}>
                <option value="">Select...</option>
                <option value="Good">Good</option>
                <option value="Damaged">Damaged - Needs Repair</option>
                <option value="Full">Full - Needs Cleaning</option>
              </select>
            </div>
          )}
          <div>
            <label style={labelStyle}>Straw Bales</label>
            <select value={gradingData.strawBales}
              onFocus={() => handleFieldFocus('strawBales', gradingData.strawBales)}
              onChange={(e) => { updateField('strawBales', e.target.value); handleFieldBlur('strawBales', e.target.value, 'Straw Bales') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Installed">Installed</option>
              <option value="Not Required">Not Required</option>
              <option value="Needed">Needed</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Erosion Blankets</label>
            <select value={gradingData.erosionBlankets}
              onFocus={() => handleFieldFocus('erosionBlankets', gradingData.erosionBlankets)}
              onChange={(e) => { updateField('erosionBlankets', e.target.value); handleFieldBlur('erosionBlankets', e.target.value, 'Erosion Blankets') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Installed">Installed</option>
              <option value="Not Required">Not Required</option>
              <option value="Needed">Needed</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sediment Traps</label>
            <select value={gradingData.sedimentTraps}
              onFocus={() => handleFieldFocus('sedimentTraps', gradingData.sedimentTraps)}
              onChange={(e) => { updateField('sedimentTraps', e.target.value); handleFieldBlur('sedimentTraps', e.target.value, 'Sediment Traps') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Installed">Installed</option>
              <option value="Not Required">Not Required</option>
              <option value="Needed">Needed</option>
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Environmental Issues / Notes</label>
            <input type="text" value={gradingData.environmentalIssues}
              onFocus={() => handleFieldFocus('environmentalIssues', gradingData.environmentalIssues)}
              onChange={(e) => updateField('environmentalIssues', e.target.value)}
              onBlur={(e) => handleFieldBlur('environmentalIssues', e.target.value, 'Environmental Issues')}
              placeholder="Any environmental concerns, wildlife, watercourse issues..." style={inputStyle} />
          </div>
        </div>
      </CollapsibleSection>

      {/* SOFT SPOTS */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>🚧 SOFT SPOTS / PROBLEM AREAS</div>
          <button onClick={toggleSoftSpots} style={{ padding: '8px 16px', backgroundColor: showSoftSpots ? '#dc3545' : '#ffc107', color: showSoftSpots ? 'white' : '#212529', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
            {showSoftSpots ? '− Hide Soft Spots' : '+ Add Soft Spots'}
          </button>
        </div>
        {showSoftSpots && (
          <div>
            <button onClick={addSoftSpot} style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', marginBottom: '15px' }}>+ Add Soft Spot Entry</button>
            {gradingData.softSpots.entries.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>No soft spots recorded.</p>
            ) : (
              gradingData.softSpots.entries.map((spot, idx) => (
                <div key={spot.id} style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#856404' }}>⚠️ Soft Spot #{idx + 1}</strong>
                    <button onClick={() => removeSoftSpot(spot.id)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                  </div>
                  <div style={gridStyle}>
                    <div>
                      <label style={labelStyle}>Location (KP)</label>
                      <input type="text" value={spot.kp} onFocus={() => handleEntryFieldFocus(spot.id, 'kp', spot.kp)} onChange={(e) => updateSoftSpot(spot.id, 'kp', e.target.value)} onBlur={(e) => handleEntryFieldBlur(spot.id, 'kp', e.target.value, 'Location KP', getSoftSpotLabel(spot, idx))} placeholder="e.g. 5+350" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Length (m)</label>
                      <input type="number" value={spot.length} onFocus={() => handleEntryFieldFocus(spot.id, 'length', spot.length)} onChange={(e) => updateSoftSpot(spot.id, 'length', e.target.value)} onBlur={(e) => handleEntryFieldBlur(spot.id, 'length', e.target.value, 'Length', getSoftSpotLabel(spot, idx))} placeholder="Approx length" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Width (m)</label>
                      <input type="number" value={spot.width} onFocus={() => handleEntryFieldFocus(spot.id, 'width', spot.width)} onChange={(e) => updateSoftSpot(spot.id, 'width', e.target.value)} onBlur={(e) => handleEntryFieldBlur(spot.id, 'width', e.target.value, 'Width', getSoftSpotLabel(spot, idx))} placeholder="Approx width" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Cause</label>
                      <select value={spot.cause} onFocus={() => handleEntryFieldFocus(spot.id, 'cause', spot.cause)} onChange={(e) => { updateSoftSpot(spot.id, 'cause', e.target.value); handleEntryFieldBlur(spot.id, 'cause', e.target.value, 'Cause', getSoftSpotLabel(spot, idx)) }} style={selectStyle}>
                        <option value="">Select...</option>
                        <option value="High Water Table">High Water Table</option>
                        <option value="Spring">Spring/Seepage</option>
                        <option value="Muskeg">Muskeg/Organic</option>
                        <option value="Clay">Clay</option>
                        <option value="Previous Disturbance">Previous Disturbance</option>
                        <option value="Unknown">Unknown</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Action Taken</label>
                      <select value={spot.actionTaken} onFocus={() => handleEntryFieldFocus(spot.id, 'actionTaken', spot.actionTaken)} onChange={(e) => { updateSoftSpot(spot.id, 'actionTaken', e.target.value); handleEntryFieldBlur(spot.id, 'actionTaken', e.target.value, 'Action Taken', getSoftSpotLabel(spot, idx)) }} style={selectStyle}>
                        <option value="">Select...</option>
                        <option value="Matted">Matted</option>
                        <option value="Corduroy">Corduroy</option>
                        <option value="Geotextile">Geotextile Installed</option>
                        <option value="Excavated">Excavated & Replaced</option>
                        <option value="Dewatered">Dewatered</option>
                        <option value="Flagged">Flagged for Later</option>
                        <option value="None">None - Monitoring</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Resolved?</label>
                      <select value={spot.resolved} onFocus={() => handleEntryFieldFocus(spot.id, 'resolved', spot.resolved)} onChange={(e) => { updateSoftSpot(spot.id, 'resolved', e.target.value); handleEntryFieldBlur(spot.id, 'resolved', e.target.value, 'Resolved', getSoftSpotLabel(spot, idx)) }} style={selectStyle}>
                        <option value="">Select...</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No - Ongoing</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Comments</label>
                      <input type="text" value={spot.comments} onFocus={() => handleEntryFieldFocus(spot.id, 'comments', spot.comments)} onChange={(e) => updateSoftSpot(spot.id, 'comments', e.target.value)} onBlur={(e) => handleEntryFieldBlur(spot.id, 'comments', e.target.value, 'Comments', getSoftSpotLabel(spot, idx))} placeholder="Additional details..." style={inputStyle} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ACCESS & CROSSINGS */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>🚗 ACCESS & CROSSINGS</div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: '12px', marginRight: '8px' }}>Access Maintained?</label>
              <select value={gradingData.accessMaintained}
                onFocus={() => handleFieldFocus('accessMaintained', gradingData.accessMaintained)}
                onChange={(e) => { updateField('accessMaintained', e.target.value); handleFieldBlur('accessMaintained', e.target.value, 'Access Maintained') }}
                style={{ ...selectStyle, width: 'auto', padding: '6px 12px' }}>
                <option value="">Select...</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
            <button onClick={toggleCrossings} style={{ padding: '8px 16px', backgroundColor: showCrossings ? '#dc3545' : '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
              {showCrossings ? '− Hide Crossings' : '+ Add Crossings'}
            </button>
          </div>
        </div>
        {showCrossings && (
          <div>
            <button onClick={addCrossing} style={{ padding: '8px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', marginBottom: '15px' }}>+ Add Crossing Entry</button>
            {gradingData.crossings.entries.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>No crossings recorded.</p>
            ) : (
              gradingData.crossings.entries.map((crossing, idx) => (
                <div key={crossing.id} style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#d1ecf1', borderRadius: '8px', border: '1px solid #17a2b8' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#0c5460' }}>🚗 Crossing #{idx + 1}</strong>
                    <button onClick={() => removeCrossing(crossing.id)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                  </div>
                  <div style={gridStyle}>
                    <div>
                      <label style={labelStyle}>Crossing Type</label>
                      <select value={crossing.crossingType} onFocus={() => handleEntryFieldFocus(crossing.id, 'crossingType', crossing.crossingType)} onChange={(e) => { updateCrossing(crossing.id, 'crossingType', e.target.value); handleEntryFieldBlur(crossing.id, 'crossingType', e.target.value, 'Crossing Type', getCrossingLabel(crossing, idx)) }} style={selectStyle}>
                        <option value="">Select...</option>
                        <option value="Public Road">Public Road</option>
                        <option value="Private Road">Private Road</option>
                        <option value="Farm Access">Farm Access</option>
                        <option value="Trail">Trail</option>
                        <option value="Railway">Railway</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Location (KP)</label>
                      <input type="text" value={crossing.kp} onFocus={() => handleEntryFieldFocus(crossing.id, 'kp', crossing.kp)} onChange={(e) => updateCrossing(crossing.id, 'kp', e.target.value)} onBlur={(e) => handleEntryFieldBlur(crossing.id, 'kp', e.target.value, 'Location KP', getCrossingLabel(crossing, idx))} placeholder="e.g. 5+500" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Access Maintained?</label>
                      <select value={crossing.accessMaintained} onFocus={() => handleEntryFieldFocus(crossing.id, 'accessMaintained', crossing.accessMaintained)} onChange={(e) => { updateCrossing(crossing.id, 'accessMaintained', e.target.value); handleEntryFieldBlur(crossing.id, 'accessMaintained', e.target.value, 'Access Maintained', getCrossingLabel(crossing, idx)) }} style={selectStyle}>
                        <option value="">Select...</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No - Closed</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Signage in Place?</label>
                      <select value={crossing.signageInPlace} onFocus={() => handleEntryFieldFocus(crossing.id, 'signageInPlace', crossing.signageInPlace)} onChange={(e) => { updateCrossing(crossing.id, 'signageInPlace', e.target.value); handleEntryFieldBlur(crossing.id, 'signageInPlace', e.target.value, 'Signage In Place', getCrossingLabel(crossing, idx)) }} style={selectStyle}>
                        <option value="">Select...</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No - Needed</option>
                        <option value="N/A">N/A</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Traffic Control</label>
                      <select value={crossing.trafficControl} onFocus={() => handleEntryFieldFocus(crossing.id, 'trafficControl', crossing.trafficControl)} onChange={(e) => { updateCrossing(crossing.id, 'trafficControl', e.target.value); handleEntryFieldBlur(crossing.id, 'trafficControl', e.target.value, 'Traffic Control', getCrossingLabel(crossing, idx)) }} style={selectStyle}>
                        <option value="">Select...</option>
                        <option value="Flaggers">Flaggers</option>
                        <option value="Signs Only">Signs Only</option>
                        <option value="Pilot Car">Pilot Car</option>
                        <option value="None Required">None Required</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Condition</label>
                      <select value={crossing.condition} onFocus={() => handleEntryFieldFocus(crossing.id, 'condition', crossing.condition)} onChange={(e) => { updateCrossing(crossing.id, 'condition', e.target.value); handleEntryFieldBlur(crossing.id, 'condition', e.target.value, 'Condition', getCrossingLabel(crossing, idx)) }} style={selectStyle}>
                        <option value="">Select...</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                        <option value="Poor">Poor - Needs Work</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Comments</label>
                      <input type="text" value={crossing.comments} onFocus={() => handleEntryFieldFocus(crossing.id, 'comments', crossing.comments)} onChange={(e) => updateCrossing(crossing.id, 'comments', e.target.value)} onBlur={(e) => handleEntryFieldBlur(crossing.id, 'comments', e.target.value, 'Comments', getCrossingLabel(crossing, idx))} placeholder="Additional details..." style={inputStyle} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* COMMENTS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📝 COMMENTS</div>
        <textarea value={gradingData.comments}
          onFocus={() => handleFieldFocus('comments', gradingData.comments)}
          onChange={(e) => updateField('comments', e.target.value)}
          onBlur={(e) => handleFieldBlur('comments', e.target.value, 'Comments')}
          placeholder="Additional comments, observations, production notes..."
          style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>
    </div>
  )
}

export default GradingLog
