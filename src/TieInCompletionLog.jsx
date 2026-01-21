import React, { useState, useRef } from 'react'
import { useActivityAudit } from './useActivityAudit'

function TieInCompletionLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, metersToday, logId, reportId }) {
  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState({
    backfill: false,
    cathodicProtection: false,
    thirdPartyCrossings: false,
    pipeSupport: false,
    anodes: false
  })

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Audit trail hook
  const { 
    initializeOriginalValues,
    initializeEntryValues,
    logFieldChange,
    logNestedFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'TieInCompletionLog')
  
  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const nestedValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure
  const defaultData = {
    tieInLocation: '',
    fromKP: '',
    toKP: '',
    backfill: {
      method: '',
      liftThickness: '',
      numberOfLifts: '',
      compactionMethod: '',
      compactionTestRequired: '',
      compactionTestPassed: '',
      paddingMaterial: '',
      paddingDepth: ''
    },
    cathodicProtection: {
      installed: '',
      installedBy: '',
      thirdPartyName: '',
      cpType: '',
      testStationInstalled: '',
      testStationLocation: '',
      wireColor: '',
      connectionMethod: ''
    },
    crossingsEnabled: false,
    crossings: [],
    thirdPartyCrossings: [],
    anodesEnabled: false,
    anodes: [],
    pipeSupport: {
      required: '',
      type: '',
      location: '',
      details: ''
    },
    comments: ''
  }

  // Merge incoming data with defaults
  const tieInData = {
    ...defaultData,
    ...data,
    backfill: { ...defaultData.backfill, ...(data?.backfill || {}) },
    cathodicProtection: { ...defaultData.cathodicProtection, ...(data?.cathodicProtection || {}) },
    pipeSupport: { ...defaultData.pipeSupport, ...(data?.pipeSupport || {}) },
    crossings: data?.crossings || [],
    thirdPartyCrossings: data?.thirdPartyCrossings || [],
    anodes: data?.anodes || []
  }

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

  const handleEntryFieldFocus = (entryId, fieldName, currentValue) => {
    initializeEntryValues(entryValuesRef, entryId, fieldName, currentValue)
  }

  const handleEntryFieldBlur = (entryId, fieldName, newValue, displayName, entryLabel) => {
    logEntryFieldChange(entryValuesRef, entryId, fieldName, newValue, displayName, entryLabel)
  }

  const updateField = (field, value) => {
    onChange({ ...tieInData, [field]: value })
  }

  const updateBackfill = (field, value) => {
    onChange({
      ...tieInData,
      backfill: { ...tieInData.backfill, [field]: value }
    })
  }

  const updateCP = (field, value) => {
    onChange({
      ...tieInData,
      cathodicProtection: { ...tieInData.cathodicProtection, [field]: value }
    })
  }

  const updatePipeSupport = (field, value) => {
    onChange({
      ...tieInData,
      pipeSupport: { ...tieInData.pipeSupport, [field]: value }
    })
  }

  // Third Party Crossings
  const addThirdPartyCrossing = (e) => {
    e?.stopPropagation() // Prevent collapsible from toggling
    const newCrossing = {
      id: Date.now(),
      crossingType: '',
      facilityOwner: '',
      facilityType: '',
      ourPipeDepth: '',
      thirdPartyDepth: '',
      separationDistance: '',
      minimumRequired: '',
      compliant: '',
      surveyedBy: '',
      comments: ''
    }
    onChange({ ...tieInData, thirdPartyCrossings: [...tieInData.thirdPartyCrossings, newCrossing] })
    logEntryAdd('Third Party Crossing', `Crossing #${tieInData.thirdPartyCrossings.length + 1}`)
  }

  const updateThirdPartyCrossing = (id, field, value) => {
    const updated = tieInData.thirdPartyCrossings.map(crossing => {
      if (crossing.id === id) {
        return { ...crossing, [field]: value }
      }
      return crossing
    })
    onChange({ ...tieInData, thirdPartyCrossings: updated })
  }

  const removeThirdPartyCrossing = (id) => {
    const crossingToRemove = tieInData.thirdPartyCrossings.find(c => c.id === id)
    const crossingIndex = tieInData.thirdPartyCrossings.findIndex(c => c.id === id)
    const crossingLabel = crossingToRemove?.facilityOwner || `Crossing #${crossingIndex + 1}`
    
    onChange({ ...tieInData, thirdPartyCrossings: tieInData.thirdPartyCrossings.filter(c => c.id !== id) })
    logEntryDelete('Third Party Crossing', crossingLabel)
  }

  // Anodes
  const addAnode = (e) => {
    e?.stopPropagation() // Prevent collapsible from toggling
    const newAnode = {
      id: Date.now(),
      anodeType: '',
      location: '',
      kp: '',
      depth: '',
      weight: '',
      material: '',
      quantity: '',
      installedBy: '',
      testLeadInstalled: '',
      comments: ''
    }
    onChange({ ...tieInData, anodes: [...tieInData.anodes, newAnode] })
    logEntryAdd('Anode', `Anode #${tieInData.anodes.length + 1}`)
  }

  const updateAnode = (id, field, value) => {
    const updated = tieInData.anodes.map(anode => {
      if (anode.id === id) {
        return { ...anode, [field]: value }
      }
      return anode
    })
    onChange({ ...tieInData, anodes: updated })
  }

  const removeAnode = (id) => {
    const anodeToRemove = tieInData.anodes.find(a => a.id === id)
    const anodeIndex = tieInData.anodes.findIndex(a => a.id === id)
    const anodeLabel = anodeToRemove?.kp || `Anode #${anodeIndex + 1}`
    
    onChange({ ...tieInData, anodes: tieInData.anodes.filter(a => a.id !== id) })
    logEntryDelete('Anode', anodeLabel)
  }

  // Get entry labels
  const getCrossingLabel = (crossing, index) => crossing.facilityOwner || `Crossing #${index + 1}`
  const getAnodeLabel = (anode, index) => anode.kp || `Anode #${index + 1}`

  // Styles
  const sectionStyle = {
    marginBottom: '15px',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    overflow: 'hidden'
  }

  const collapsibleHeaderStyle = {
    padding: '12px 15px',
    backgroundColor: '#f8f9fa',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #dee2e6',
    userSelect: 'none'
  }

  const sectionHeaderStyle = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: '15px',
    paddingBottom: '8px',
    borderBottom: '2px solid #fd7e14'
  }

  const sectionContentStyle = {
    padding: '15px',
    backgroundColor: '#fff'
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px'
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
    cursor: 'pointer'
  }

  // Check if section has data (for indicator)
  const hasBackfillData = tieInData.backfill.method || tieInData.backfill.paddingMaterial || tieInData.backfill.paddingDepth
  const hasCPData = tieInData.cathodicProtection.installed
  const hasCrossingsData = tieInData.thirdPartyCrossings.length > 0
  const hasPipeSupportData = tieInData.pipeSupport.required
  const hasAnodesData = tieInData.anodes.length > 0

  return (
    <div style={{ marginTop: '15px' }}>
      {/* INHERITED INFO BAR */}
      {(contractor || foreman || reportDate) && (
        <div style={{
          padding: '12px 15px',
          backgroundColor: '#fff3e0',
          borderRadius: '6px',
          marginBottom: '15px',
          border: '1px solid #fd7e14'
        }}>
          <span style={{ fontSize: '13px', color: '#e65100' }}>
            <strong>📋 From Activity:</strong>{' '}
            {reportDate && <>Date: <strong>{reportDate}</strong></>}
            {reportDate && contractor && ' | '}
            {contractor && <>Contractor: <strong>{contractor}</strong></>}
            {(reportDate || contractor) && foreman && ' | '}
            {foreman && <>Foreman: <strong>{foreman}</strong></>}
          </span>
          {(startKP || endKP) && (
            <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#ffe0b3', borderRadius: '4px' }}>
              <span style={{ fontSize: '13px', color: '#e65100' }}>
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

      {/* HEADER INFO */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🔧 TIE-IN COMPLETION INFORMATION</div>
        <div style={gridStyle}>
          <div style={{ gridColumn: 'span 3' }}>
            <label style={labelStyle}>Tie-in Location/Description</label>
            <input
              type="text"
              value={tieInData.tieInLocation}
              onFocus={() => handleFieldFocus('tieInLocation', tieInData.tieInLocation)}
              onChange={(e) => updateField('tieInLocation', e.target.value)}
              onBlur={(e) => handleFieldBlur('tieInLocation', e.target.value, 'Tie-in Location')}
              placeholder="e.g. Road Crossing #3, Valve Station, Foreign Line Crossing"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* BACKFILL SECTION - Collapsible */}
      <div style={sectionStyle}>
        <div
          style={collapsibleHeaderStyle}
          onClick={() => toggleSection('backfill')}
        >
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
            🚜 BACKFILL DETAILS
            {hasBackfillData && <span style={{ color: '#28a745', marginLeft: '8px' }}>●</span>}
          </span>
          <span style={{ fontSize: '12px', color: '#6c757d' }}>
            {expandedSections.backfill ? '▼ Collapse' : '▶ Expand'}
          </span>
        </div>
        {expandedSections.backfill && (
        <div style={sectionContentStyle}>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Backfill Method</label>
            <select
              value={tieInData.backfill.method}
              onFocus={() => handleNestedFieldFocus('backfill', 'method', tieInData.backfill.method)}
              onChange={(e) => {
                updateBackfill('method', e.target.value)
                handleNestedFieldBlur('backfill', 'method', e.target.value, 'Backfill Method')
              }}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Machine">Machine</option>
              <option value="Hand">Hand</option>
              <option value="Combination">Combination</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Padding Material</label>
            <select
              value={tieInData.backfill.paddingMaterial}
              onFocus={() => handleNestedFieldFocus('backfill', 'paddingMaterial', tieInData.backfill.paddingMaterial)}
              onChange={(e) => {
                updateBackfill('paddingMaterial', e.target.value)
                handleNestedFieldBlur('backfill', 'paddingMaterial', e.target.value, 'Padding Material')
              }}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Sand">Sand</option>
              <option value="Native">Native (screened)</option>
              <option value="Foam">Foam</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Padding Depth (mm)</label>
            <input
              type="number"
              value={tieInData.backfill.paddingDepth}
              onFocus={() => handleNestedFieldFocus('backfill', 'paddingDepth', tieInData.backfill.paddingDepth)}
              onChange={(e) => updateBackfill('paddingDepth', e.target.value)}
              onBlur={(e) => handleNestedFieldBlur('backfill', 'paddingDepth', e.target.value, 'Padding Depth')}
              placeholder="e.g. 150"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Lift Thickness (mm)</label>
            <input
              type="number"
              value={tieInData.backfill.liftThickness}
              onFocus={() => handleNestedFieldFocus('backfill', 'liftThickness', tieInData.backfill.liftThickness)}
              onChange={(e) => updateBackfill('liftThickness', e.target.value)}
              onBlur={(e) => handleNestedFieldBlur('backfill', 'liftThickness', e.target.value, 'Lift Thickness')}
              placeholder="e.g. 300"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Number of Lifts</label>
            <input
              type="number"
              value={tieInData.backfill.numberOfLifts}
              onFocus={() => handleNestedFieldFocus('backfill', 'numberOfLifts', tieInData.backfill.numberOfLifts)}
              onChange={(e) => updateBackfill('numberOfLifts', e.target.value)}
              onBlur={(e) => handleNestedFieldBlur('backfill', 'numberOfLifts', e.target.value, 'Number of Lifts')}
              placeholder="e.g. 3"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Compaction Method</label>
            <select
              value={tieInData.backfill.compactionMethod}
              onFocus={() => handleNestedFieldFocus('backfill', 'compactionMethod', tieInData.backfill.compactionMethod)}
              onChange={(e) => {
                updateBackfill('compactionMethod', e.target.value)
                handleNestedFieldBlur('backfill', 'compactionMethod', e.target.value, 'Compaction Method')
              }}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Vibratory Plate">Vibratory Plate</option>
              <option value="Jumping Jack">Jumping Jack</option>
              <option value="Roller">Roller</option>
              <option value="Track Walking">Track Walking</option>
              <option value="None Required">None Required</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Compaction Test Required</label>
            <select
              value={tieInData.backfill.compactionTestRequired}
              onFocus={() => handleNestedFieldFocus('backfill', 'compactionTestRequired', tieInData.backfill.compactionTestRequired)}
              onChange={(e) => {
                updateBackfill('compactionTestRequired', e.target.value)
                handleNestedFieldBlur('backfill', 'compactionTestRequired', e.target.value, 'Compaction Test Required')
              }}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
          {tieInData.backfill.compactionTestRequired === 'Yes' && (
            <div>
              <label style={labelStyle}>Compaction Test Passed</label>
              <select
                value={tieInData.backfill.compactionTestPassed}
                onFocus={() => handleNestedFieldFocus('backfill', 'compactionTestPassed', tieInData.backfill.compactionTestPassed)}
                onChange={(e) => {
                  updateBackfill('compactionTestPassed', e.target.value)
                  handleNestedFieldBlur('backfill', 'compactionTestPassed', e.target.value, 'Compaction Test Passed')
                }}
                style={selectStyle}
              >
                <option value="">Select...</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
          )}
        </div>
        </div>
        )}
      </div>

      {/* CATHODIC PROTECTION SECTION - Collapsible */}
      <div style={sectionStyle}>
        <div
          style={collapsibleHeaderStyle}
          onClick={() => toggleSection('cathodicProtection')}
        >
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
            ⚡ CATHODIC PROTECTION (Test Leads)
            {hasCPData && <span style={{ color: '#28a745', marginLeft: '8px' }}>●</span>}
          </span>
          <span style={{ fontSize: '12px', color: '#6c757d' }}>
            {expandedSections.cathodicProtection ? '▼ Collapse' : '▶ Expand'}
          </span>
        </div>
        {expandedSections.cathodicProtection && (
        <div style={sectionContentStyle}>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>CP Installed</label>
            <select
              value={tieInData.cathodicProtection.installed}
              onFocus={() => handleNestedFieldFocus('cathodicProtection', 'installed', tieInData.cathodicProtection.installed)}
              onChange={(e) => {
                updateCP('installed', e.target.value)
                handleNestedFieldBlur('cathodicProtection', 'installed', e.target.value, 'CP Installed')
              }}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
          {tieInData.cathodicProtection.installed === 'Yes' && (
            <>
              <div>
                <label style={labelStyle}>Installed By</label>
                <select
                  value={tieInData.cathodicProtection.installedBy}
                  onFocus={() => handleNestedFieldFocus('cathodicProtection', 'installedBy', tieInData.cathodicProtection.installedBy)}
                  onChange={(e) => {
                    updateCP('installedBy', e.target.value)
                    handleNestedFieldBlur('cathodicProtection', 'installedBy', e.target.value, 'CP Installed By')
                  }}
                  style={selectStyle}
                >
                  <option value="">Select...</option>
                  <option value="Contractor">Contractor</option>
                  <option value="Third Party">Third Party</option>
                </select>
              </div>
              {tieInData.cathodicProtection.installedBy === 'Third Party' && (
                <div>
                  <label style={labelStyle}>Third Party Name</label>
                  <input
                    type="text"
                    value={tieInData.cathodicProtection.thirdPartyName}
                    onFocus={() => handleNestedFieldFocus('cathodicProtection', 'thirdPartyName', tieInData.cathodicProtection.thirdPartyName)}
                    onChange={(e) => updateCP('thirdPartyName', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur('cathodicProtection', 'thirdPartyName', e.target.value, 'CP Third Party Name')}
                    placeholder="Company name"
                    style={inputStyle}
                  />
                </div>
              )}
              <div>
                <label style={labelStyle}>CP Type</label>
                <select
                  value={tieInData.cathodicProtection.cpType}
                  onFocus={() => handleNestedFieldFocus('cathodicProtection', 'cpType', tieInData.cathodicProtection.cpType)}
                  onChange={(e) => {
                    updateCP('cpType', e.target.value)
                    handleNestedFieldBlur('cathodicProtection', 'cpType', e.target.value, 'CP Type')
                  }}
                  style={selectStyle}
                >
                  <option value="">Select...</option>
                  <option value="Sacrificial Anode">Sacrificial Anode</option>
                  <option value="Impressed Current">Impressed Current</option>
                  <option value="Bond Wire">Bond Wire</option>
                  <option value="Test Lead">Test Lead Only</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Connection Method</label>
                <select
                  value={tieInData.cathodicProtection.connectionMethod}
                  onFocus={() => handleNestedFieldFocus('cathodicProtection', 'connectionMethod', tieInData.cathodicProtection.connectionMethod)}
                  onChange={(e) => {
                    updateCP('connectionMethod', e.target.value)
                    handleNestedFieldBlur('cathodicProtection', 'connectionMethod', e.target.value, 'CP Connection Method')
                  }}
                  style={selectStyle}
                >
                  <option value="">Select...</option>
                  <option value="Thermite Weld">Thermite Weld (Cadweld)</option>
                  <option value="Exothermic">Exothermic</option>
                  <option value="Mechanical">Mechanical</option>
                  <option value="Brazed">Brazed</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Wire Color</label>
                <input
                  type="text"
                  value={tieInData.cathodicProtection.wireColor}
                  onFocus={() => handleNestedFieldFocus('cathodicProtection', 'wireColor', tieInData.cathodicProtection.wireColor)}
                  onChange={(e) => updateCP('wireColor', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('cathodicProtection', 'wireColor', e.target.value, 'Wire Color')}
                  placeholder="e.g. Red, Blue"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Test Station Installed</label>
                <select
                  value={tieInData.cathodicProtection.testStationInstalled}
                  onFocus={() => handleNestedFieldFocus('cathodicProtection', 'testStationInstalled', tieInData.cathodicProtection.testStationInstalled)}
                  onChange={(e) => {
                    updateCP('testStationInstalled', e.target.value)
                    handleNestedFieldBlur('cathodicProtection', 'testStationInstalled', e.target.value, 'Test Station Installed')
                  }}
                  style={selectStyle}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              {tieInData.cathodicProtection.testStationInstalled === 'Yes' && (
                <div>
                  <label style={labelStyle}>Test Station Location</label>
                  <input
                    type="text"
                    value={tieInData.cathodicProtection.testStationLocation}
                    onFocus={() => handleNestedFieldFocus('cathodicProtection', 'testStationLocation', tieInData.cathodicProtection.testStationLocation)}
                    onChange={(e) => updateCP('testStationLocation', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur('cathodicProtection', 'testStationLocation', e.target.value, 'Test Station Location')}
                    placeholder="e.g. KP 5+250, 3m N of CL"
                    style={inputStyle}
                  />
                </div>
              )}
            </>
          )}
        </div>
        </div>
        )}
      </div>

      {/* THIRD PARTY CROSSINGS - Collapsible */}
      <div style={sectionStyle}>
        <div
          style={collapsibleHeaderStyle}
          onClick={() => toggleSection('thirdPartyCrossings')}
        >
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
            🚧 THIRD PARTY CROSSINGS
            {hasCrossingsData && <span style={{ color: '#28a745', marginLeft: '8px' }}>● ({tieInData.thirdPartyCrossings.length})</span>}
          </span>
          <span style={{ fontSize: '12px', color: '#6c757d' }}>
            {expandedSections.thirdPartyCrossings ? '▼ Collapse' : '▶ Expand'}
          </span>
        </div>
        {expandedSections.thirdPartyCrossings && (
        <div style={sectionContentStyle}>
          <div style={{ marginBottom: '15px' }}>
            <button
              onClick={addThirdPartyCrossing}
              style={{
                padding: '8px 16px',
                backgroundColor: '#fd7e14',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold'
              }}
            >
              + Add Crossing
            </button>
          </div>

        {tieInData.thirdPartyCrossings.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
            No third party crossings recorded. Click "Add Crossing" to document facility crossings.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {tieInData.thirdPartyCrossings.map((crossing, idx) => (
              <div key={crossing.id} style={{ 
                marginBottom: '15px', 
                padding: '15px', 
                backgroundColor: '#fff', 
                borderRadius: '8px',
                border: '1px solid #fd7e14'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <strong style={{ color: '#e65100' }}>Crossing #{idx + 1}</strong>
                  <button
                    onClick={() => removeThirdPartyCrossing(crossing.id)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Remove
                  </button>
                </div>
                <div style={gridStyle}>
                  <div>
                    <label style={labelStyle}>Crossing Type</label>
                    <select
                      value={crossing.crossingType}
                      onFocus={() => handleEntryFieldFocus(crossing.id, 'crossingType', crossing.crossingType)}
                      onChange={(e) => {
                        updateThirdPartyCrossing(crossing.id, 'crossingType', e.target.value)
                        handleEntryFieldBlur(crossing.id, 'crossingType', e.target.value, 'Crossing Type', getCrossingLabel(crossing, idx))
                      }}
                      style={selectStyle}
                    >
                      <option value="">Select...</option>
                      <option value="Pipeline">Pipeline</option>
                      <option value="Cable">Cable/Telecom</option>
                      <option value="Power">Power Line</option>
                      <option value="Water">Water Line</option>
                      <option value="Sewer">Sewer</option>
                      <option value="Gas">Gas Line</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Facility Owner</label>
                    <input
                      type="text"
                      value={crossing.facilityOwner}
                      onFocus={() => handleEntryFieldFocus(crossing.id, 'facilityOwner', crossing.facilityOwner)}
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'facilityOwner', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(crossing.id, 'facilityOwner', e.target.value, 'Facility Owner', getCrossingLabel(crossing, idx))}
                      placeholder="e.g. ATCO, Telus"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Facility Type/Size</label>
                    <input
                      type="text"
                      value={crossing.facilityType}
                      onFocus={() => handleEntryFieldFocus(crossing.id, 'facilityType', crossing.facilityType)}
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'facilityType', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(crossing.id, 'facilityType', e.target.value, 'Facility Type', getCrossingLabel(crossing, idx))}
                      placeholder='e.g. 6" Gas, 48" fiber'
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Our Pipe Depth (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={crossing.ourPipeDepth}
                      onFocus={() => handleEntryFieldFocus(crossing.id, 'ourPipeDepth', crossing.ourPipeDepth)}
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'ourPipeDepth', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(crossing.id, 'ourPipeDepth', e.target.value, 'Our Pipe Depth', getCrossingLabel(crossing, idx))}
                      placeholder="e.g. 1.2"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>3rd Party Depth (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={crossing.thirdPartyDepth}
                      onFocus={() => handleEntryFieldFocus(crossing.id, 'thirdPartyDepth', crossing.thirdPartyDepth)}
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'thirdPartyDepth', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(crossing.id, 'thirdPartyDepth', e.target.value, '3rd Party Depth', getCrossingLabel(crossing, idx))}
                      placeholder="e.g. 0.8"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Separation Distance (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={crossing.separationDistance}
                      onFocus={() => handleEntryFieldFocus(crossing.id, 'separationDistance', crossing.separationDistance)}
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'separationDistance', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(crossing.id, 'separationDistance', e.target.value, 'Separation Distance', getCrossingLabel(crossing, idx))}
                      placeholder="Measured"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Minimum Required (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={crossing.minimumRequired}
                      onFocus={() => handleEntryFieldFocus(crossing.id, 'minimumRequired', crossing.minimumRequired)}
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'minimumRequired', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(crossing.id, 'minimumRequired', e.target.value, 'Minimum Required', getCrossingLabel(crossing, idx))}
                      placeholder="Per regulation"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Compliant</label>
                    <select
                      value={crossing.compliant}
                      onFocus={() => handleEntryFieldFocus(crossing.id, 'compliant', crossing.compliant)}
                      onChange={(e) => {
                        updateThirdPartyCrossing(crossing.id, 'compliant', e.target.value)
                        handleEntryFieldBlur(crossing.id, 'compliant', e.target.value, 'Compliant', getCrossingLabel(crossing, idx))
                      }}
                      style={{
                        ...selectStyle,
                        backgroundColor: crossing.compliant === 'Yes' ? '#d4edda' : 
                                        crossing.compliant === 'No' ? '#f8d7da' : 'white'
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No - NCR Required</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Surveyed By</label>
                    <input
                      type="text"
                      value={crossing.surveyedBy}
                      onFocus={() => handleEntryFieldFocus(crossing.id, 'surveyedBy', crossing.surveyedBy)}
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'surveyedBy', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(crossing.id, 'surveyedBy', e.target.value, 'Surveyed By', getCrossingLabel(crossing, idx))}
                      placeholder="Surveyor name"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={labelStyle}>Comments</label>
                    <input
                      type="text"
                      value={crossing.comments}
                      onFocus={() => handleEntryFieldFocus(crossing.id, 'comments', crossing.comments)}
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'comments', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(crossing.id, 'comments', e.target.value, 'Comments', getCrossingLabel(crossing, idx))}
                      placeholder="Additional notes..."
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
        )}
      </div>

      {/* PIPE SUPPORT - Collapsible */}
      <div style={sectionStyle}>
        <div
          style={collapsibleHeaderStyle}
          onClick={() => toggleSection('pipeSupport')}
        >
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
            🏗️ PIPE SUPPORT
            {hasPipeSupportData && <span style={{ color: '#28a745', marginLeft: '8px' }}>●</span>}
          </span>
          <span style={{ fontSize: '12px', color: '#6c757d' }}>
            {expandedSections.pipeSupport ? '▼ Collapse' : '▶ Expand'}
          </span>
        </div>
        {expandedSections.pipeSupport && (
        <div style={sectionContentStyle}>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Pipe Support Required</label>
            <select
              value={tieInData.pipeSupport.required}
              onFocus={() => handleNestedFieldFocus('pipeSupport', 'required', tieInData.pipeSupport.required)}
              onChange={(e) => {
                updatePipeSupport('required', e.target.value)
                handleNestedFieldBlur('pipeSupport', 'required', e.target.value, 'Pipe Support Required')
              }}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
          {tieInData.pipeSupport.required === 'Yes' && (
            <>
              <div>
                <label style={labelStyle}>Support Type</label>
                <select
                  value={tieInData.pipeSupport.type}
                  onFocus={() => handleNestedFieldFocus('pipeSupport', 'type', tieInData.pipeSupport.type)}
                  onChange={(e) => {
                    updatePipeSupport('type', e.target.value)
                    handleNestedFieldBlur('pipeSupport', 'type', e.target.value, 'Support Type')
                  }}
                  style={selectStyle}
                >
                  <option value="">Select...</option>
                  <option value="Concrete">Concrete Support</option>
                  <option value="Sand Bags">Sand Bags</option>
                  <option value="Foam">Foam Cradle</option>
                  <option value="Timber">Timber Cribbing</option>
                  <option value="Steel">Steel Support</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <input
                  type="text"
                  value={tieInData.pipeSupport.location}
                  onFocus={() => handleNestedFieldFocus('pipeSupport', 'location', tieInData.pipeSupport.location)}
                  onChange={(e) => updatePipeSupport('location', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('pipeSupport', 'location', e.target.value, 'Support Location')}
                  placeholder="e.g. Road Crossing KP 5+250"
                  style={inputStyle}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Details</label>
                <input
                  type="text"
                  value={tieInData.pipeSupport.details}
                  onFocus={() => handleNestedFieldFocus('pipeSupport', 'details', tieInData.pipeSupport.details)}
                  onChange={(e) => updatePipeSupport('details', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('pipeSupport', 'details', e.target.value, 'Support Details')}
                  placeholder="Support specifications, dimensions..."
                  style={inputStyle}
                />
              </div>
            </>
          )}
        </div>
        </div>
        )}
      </div>

      {/* ANODES / ANODE BEDS - Collapsible */}
      <div style={sectionStyle}>
        <div
          style={collapsibleHeaderStyle}
          onClick={() => toggleSection('anodes')}
        >
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
            🔋 ANODES / ANODE BEDS
            {hasAnodesData && <span style={{ color: '#28a745', marginLeft: '8px' }}>● ({tieInData.anodes.length})</span>}
          </span>
          <span style={{ fontSize: '12px', color: '#6c757d' }}>
            {expandedSections.anodes ? '▼ Collapse' : '▶ Expand'}
          </span>
        </div>
        {expandedSections.anodes && (
        <div style={sectionContentStyle}>
          <div style={{ marginBottom: '15px' }}>
            <button
              onClick={addAnode}
              style={{
                padding: '8px 16px',
                backgroundColor: '#fd7e14',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold'
              }}
            >
              + Add Anode Entry
            </button>
          </div>

            {tieInData.anodes.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
                No anodes recorded. Click "Add Anode Entry" to document anode installations.
              </p>
            ) : (
              tieInData.anodes.map((anode, idx) => (
                <div key={anode.id} style={{ 
                  marginBottom: '15px', 
                  padding: '15px', 
                  backgroundColor: '#fff', 
                  borderRadius: '8px',
                  border: '1px solid #28a745'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#155724' }}>Anode #{idx + 1}</strong>
                    <button
                      onClick={() => removeAnode(anode.id)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <div style={gridStyle}>
                    <div>
                      <label style={labelStyle}>Type</label>
                      <select
                        value={anode.anodeType}
                        onFocus={() => handleEntryFieldFocus(anode.id, 'anodeType', anode.anodeType)}
                        onChange={(e) => {
                          updateAnode(anode.id, 'anodeType', e.target.value)
                          handleEntryFieldBlur(anode.id, 'anodeType', e.target.value, 'Anode Type', getAnodeLabel(anode, idx))
                        }}
                        style={selectStyle}
                      >
                        <option value="">Select...</option>
                        <option value="Single Anode">Single Anode</option>
                        <option value="Anode Bed">Anode Bed</option>
                        <option value="Bracelet">Bracelet Anode</option>
                        <option value="Ribbon">Ribbon Anode</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Material</label>
                      <select
                        value={anode.material}
                        onFocus={() => handleEntryFieldFocus(anode.id, 'material', anode.material)}
                        onChange={(e) => {
                          updateAnode(anode.id, 'material', e.target.value)
                          handleEntryFieldBlur(anode.id, 'material', e.target.value, 'Material', getAnodeLabel(anode, idx))
                        }}
                        style={selectStyle}
                      >
                        <option value="">Select...</option>
                        <option value="Magnesium">Magnesium</option>
                        <option value="Zinc">Zinc</option>
                        <option value="Aluminum">Aluminum</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Location (KP)</label>
                      <input
                        type="text"
                        value={anode.kp}
                        onFocus={() => handleEntryFieldFocus(anode.id, 'kp', anode.kp)}
                        onChange={(e) => updateAnode(anode.id, 'kp', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(anode.id, 'kp', e.target.value, 'Location KP', getAnodeLabel(anode, idx))}
                        placeholder="e.g. 5+250"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Depth (m)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={anode.depth}
                        onFocus={() => handleEntryFieldFocus(anode.id, 'depth', anode.depth)}
                        onChange={(e) => updateAnode(anode.id, 'depth', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(anode.id, 'depth', e.target.value, 'Depth', getAnodeLabel(anode, idx))}
                        placeholder="e.g. 2.0"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Weight (kg)</label>
                      <input
                        type="number"
                        value={anode.weight}
                        onFocus={() => handleEntryFieldFocus(anode.id, 'weight', anode.weight)}
                        onChange={(e) => updateAnode(anode.id, 'weight', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(anode.id, 'weight', e.target.value, 'Weight', getAnodeLabel(anode, idx))}
                        placeholder="e.g. 17"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Quantity</label>
                      <input
                        type="number"
                        value={anode.quantity}
                        onFocus={() => handleEntryFieldFocus(anode.id, 'quantity', anode.quantity)}
                        onChange={(e) => updateAnode(anode.id, 'quantity', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(anode.id, 'quantity', e.target.value, 'Quantity', getAnodeLabel(anode, idx))}
                        placeholder="e.g. 1"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Installed By</label>
                      <input
                        type="text"
                        value={anode.installedBy}
                        onFocus={() => handleEntryFieldFocus(anode.id, 'installedBy', anode.installedBy)}
                        onChange={(e) => updateAnode(anode.id, 'installedBy', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(anode.id, 'installedBy', e.target.value, 'Installed By', getAnodeLabel(anode, idx))}
                        placeholder="Contractor name"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Test Lead Installed</label>
                      <select
                        value={anode.testLeadInstalled}
                        onFocus={() => handleEntryFieldFocus(anode.id, 'testLeadInstalled', anode.testLeadInstalled)}
                        onChange={(e) => {
                          updateAnode(anode.id, 'testLeadInstalled', e.target.value)
                          handleEntryFieldBlur(anode.id, 'testLeadInstalled', e.target.value, 'Test Lead Installed', getAnodeLabel(anode, idx))
                        }}
                        style={selectStyle}
                      >
                        <option value="">Select...</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Comments</label>
                      <input
                        type="text"
                        value={anode.comments}
                        onFocus={() => handleEntryFieldFocus(anode.id, 'comments', anode.comments)}
                        onChange={(e) => updateAnode(anode.id, 'comments', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(anode.id, 'comments', e.target.value, 'Comments', getAnodeLabel(anode, idx))}
                        placeholder="Additional notes..."
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
        </div>
        )}
      </div>

      {/* COMMENTS */}
      <div style={{ ...sectionStyle, padding: '15px', backgroundColor: '#f8f9fa' }}>
        <div style={sectionHeaderStyle}>📝 COMMENTS</div>
        <textarea
          value={tieInData.comments}
          onFocus={() => handleFieldFocus('comments', tieInData.comments)}
          onChange={(e) => updateField('comments', e.target.value)}
          onBlur={(e) => handleFieldBlur('comments', e.target.value, 'Comments')}
          placeholder="Additional comments, observations, or notes..."
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '14px',
            minHeight: '80px',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
        />
      </div>
    </div>
  )
}

export default TieInCompletionLog
