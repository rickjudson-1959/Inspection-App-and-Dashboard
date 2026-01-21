import React, { useState, useRef } from 'react'
import { useActivityAudit } from './useActivityAudit'
import DrillingWasteManagement from './DrillingWasteManagement'
import HDDSteeringLog from './HDDSteeringLog'

function HDDLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, metersToday, logId, reportId }) {
  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState({
    boreInfo: false,
    pilotHole: false,
    reamingPasses: false,
    pipeInstallation: false,
    postInstallation: false,
    wasteManagement: false,
    steeringLog: false,
    comments: false
  })

  const [showReamingPasses, setShowReamingPasses] = useState(data?.reamingPasses?.enabled || false)
  const [showWasteManagement, setShowWasteManagement] = useState(data?.wasteManagementEnabled || false)
  const [showSteeringLog, setShowSteeringLog] = useState(data?.steeringLogEnabled || false)

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
  } = useActivityAudit(logId || reportId, 'HDDLog')

  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure
  const defaultData = {
    // Bore Information
    boreId: '',
    crossingType: '',
    entryKP: '',
    exitKP: '',
    boreLength: '',
    subcontractor: '',
    rigNumber: '',
    rigSize: '',

    // Pilot Hole
    pilotHole: {
      mudWeight: '',
      viscosity: '',
      ph: '',
      fluidLoss: '',
      pitchAngle: '',
      azimuth: '',
      depth: '',
      variance: ''
    },

    // Reaming Passes (repeatable)
    reamingPasses: { enabled: false, entries: [] },

    // Pipe Installation
    pipeInstallation: {
      pullbackForce: '',
      swivelConnectionVerified: '',
      flotationRisk: '',
      pullbackSpeed: '',
      installationComplete: ''
    },

    // Post-Installation
    postInstallation: {
      annularSpaceVerified: '',
      groutRequired: '',
      groutVolume: '',
      groutPressure: ''
    },

    // Drilling Waste Management (Directive 050)
    wasteManagementEnabled: false,
    wasteManagementData: {},

    // Steering Log (Bore Path Data)
    steeringLogEnabled: false,
    steeringLogData: {},

    comments: ''
  }

  const hddData = {
    ...defaultData,
    ...data,
    pilotHole: { ...defaultData.pilotHole, ...(data?.pilotHole || {}) },
    reamingPasses: { ...defaultData.reamingPasses, ...(data?.reamingPasses || {}), entries: data?.reamingPasses?.entries || [] },
    pipeInstallation: { ...defaultData.pipeInstallation, ...(data?.pipeInstallation || {}) },
    postInstallation: { ...defaultData.postInstallation, ...(data?.postInstallation || {}) },
    wasteManagementData: data?.wasteManagementData || {},
    steeringLogData: data?.steeringLogData || {}
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
    onChange({ ...hddData, [field]: value })
  }

  const updatePilotHole = (field, value) => {
    onChange({ ...hddData, pilotHole: { ...hddData.pilotHole, [field]: value } })
  }

  const updatePipeInstallation = (field, value) => {
    onChange({ ...hddData, pipeInstallation: { ...hddData.pipeInstallation, [field]: value } })
  }

  const updatePostInstallation = (field, value) => {
    onChange({ ...hddData, postInstallation: { ...hddData.postInstallation, [field]: value } })
  }

  // Reaming Passes management
  const toggleReamingPasses = () => {
    const newEnabled = !showReamingPasses
    setShowReamingPasses(newEnabled)
    onChange({ ...hddData, reamingPasses: { ...hddData.reamingPasses, enabled: newEnabled } })
  }

  const addReamingPass = () => {
    const passNumber = hddData.reamingPasses.entries.length + 1
    const newPass = {
      id: Date.now(),
      passNumber: passNumber.toString(),
      reamerSize: '',
      pullbackForce: '',
      drillingFluidPressure: '',
      flowRate: '',
      passComplete: ''
    }
    onChange({ ...hddData, reamingPasses: { ...hddData.reamingPasses, entries: [...hddData.reamingPasses.entries, newPass] } })
    logEntryAdd('Reaming Pass', `Pass #${passNumber}`)
  }

  const updateReamingPass = (id, field, value) => {
    const updated = hddData.reamingPasses.entries.map(pass => pass.id === id ? { ...pass, [field]: value } : pass)
    onChange({ ...hddData, reamingPasses: { ...hddData.reamingPasses, entries: updated } })
  }

  const removeReamingPass = (id) => {
    const pass = hddData.reamingPasses.entries.find(p => p.id === id)
    const idx = hddData.reamingPasses.entries.findIndex(p => p.id === id)
    onChange({ ...hddData, reamingPasses: { ...hddData.reamingPasses, entries: hddData.reamingPasses.entries.filter(p => p.id !== id) } })
    logEntryDelete('Reaming Pass', pass?.passNumber ? `Pass #${pass.passNumber}` : `Pass #${idx + 1}`)
  }

  const getReamingPassLabel = (pass, index) => pass.passNumber ? `Pass #${pass.passNumber}` : `Pass #${index + 1}`

  // Waste Management toggle and update
  const toggleWasteManagement = () => {
    const newEnabled = !showWasteManagement
    setShowWasteManagement(newEnabled)
    onChange({ ...hddData, wasteManagementEnabled: newEnabled })
  }

  const updateWasteManagementData = (wasteData) => {
    onChange({ ...hddData, wasteManagementData: wasteData })
  }

  // Steering Log toggle and update
  const toggleSteeringLog = () => {
    const newEnabled = !showSteeringLog
    setShowSteeringLog(newEnabled)
    onChange({ ...hddData, steeringLogEnabled: newEnabled })
  }

  const updateSteeringLogData = (steeringData) => {
    onChange({ ...hddData, steeringLogData: steeringData })
  }

  // Styles
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

      {/* 1. BORE INFORMATION - Collapsible */}
      <CollapsibleSection id="boreInfo" title="BORE INFORMATION">
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Bore ID</label>
            <input type="text" value={hddData.boreId}
              onFocus={() => handleFieldFocus('boreId', hddData.boreId)}
              onChange={(e) => updateField('boreId', e.target.value)}
              onBlur={(e) => handleFieldBlur('boreId', e.target.value, 'Bore ID')}
              placeholder="e.g. HDD-001" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Crossing Type</label>
            <select value={hddData.crossingType}
              onFocus={() => handleFieldFocus('crossingType', hddData.crossingType)}
              onChange={(e) => { updateField('crossingType', e.target.value); handleFieldBlur('crossingType', e.target.value, 'Crossing Type') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Road">Road Crossing</option>
              <option value="Railway">Railway Crossing</option>
              <option value="River">River Crossing</option>
              <option value="Creek">Creek Crossing</option>
              <option value="Wetland">Wetland Crossing</option>
              <option value="Utility">Utility Crossing</option>
              <option value="Highway">Highway Crossing</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Entry KP</label>
            <input type="text" value={hddData.entryKP}
              onFocus={() => handleFieldFocus('entryKP', hddData.entryKP)}
              onChange={(e) => updateField('entryKP', e.target.value)}
              onBlur={(e) => handleFieldBlur('entryKP', e.target.value, 'Entry KP')}
              placeholder="e.g. 5+250" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Exit KP</label>
            <input type="text" value={hddData.exitKP}
              onFocus={() => handleFieldFocus('exitKP', hddData.exitKP)}
              onChange={(e) => updateField('exitKP', e.target.value)}
              onBlur={(e) => handleFieldBlur('exitKP', e.target.value, 'Exit KP')}
              placeholder="e.g. 5+450" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Bore Length (m)</label>
            <input type="number" step="0.1" value={hddData.boreLength}
              onFocus={() => handleFieldFocus('boreLength', hddData.boreLength)}
              onChange={(e) => updateField('boreLength', e.target.value)}
              onBlur={(e) => handleFieldBlur('boreLength', e.target.value, 'Bore Length')}
              placeholder="Total length" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Subcontractor</label>
            <input type="text" value={hddData.subcontractor}
              onFocus={() => handleFieldFocus('subcontractor', hddData.subcontractor)}
              onChange={(e) => updateField('subcontractor', e.target.value)}
              onBlur={(e) => handleFieldBlur('subcontractor', e.target.value, 'Subcontractor')}
              placeholder="HDD subcontractor" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Rig Number</label>
            <input type="text" value={hddData.rigNumber}
              onFocus={() => handleFieldFocus('rigNumber', hddData.rigNumber)}
              onChange={(e) => updateField('rigNumber', e.target.value)}
              onBlur={(e) => handleFieldBlur('rigNumber', e.target.value, 'Rig Number')}
              placeholder="Rig ID" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Rig Size</label>
            <select value={hddData.rigSize}
              onFocus={() => handleFieldFocus('rigSize', hddData.rigSize)}
              onChange={(e) => { updateField('rigSize', e.target.value); handleFieldBlur('rigSize', e.target.value, 'Rig Size') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Small">Small (under 100,000 lbs)</option>
              <option value="Medium">Medium (100,000-300,000 lbs)</option>
              <option value="Large">Large (300,000-600,000 lbs)</option>
              <option value="Mega">Mega (over 600,000 lbs)</option>
            </select>
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. PILOT HOLE - Yellow (Critical) */}
      <CollapsibleSection
        id="pilotHole"
        title="PILOT HOLE (Drilling Fluid Parameters)"
        color="#856404"
        bgColor="#fff3cd"
        borderColor="#ffc107"
        contentBgColor="#fffef5"
      >
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Mud Weight (ppg)</label>
            <input type="number" step="0.1" value={hddData.pilotHole.mudWeight}
              onFocus={() => handleFieldFocus('pilotHole.mudWeight', hddData.pilotHole.mudWeight)}
              onChange={(e) => updatePilotHole('mudWeight', e.target.value)}
              onBlur={(e) => handleFieldBlur('pilotHole.mudWeight', e.target.value, 'Mud Weight')}
              placeholder="Pounds per gallon" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Viscosity (sec/qt)</label>
            <input type="number" step="1" value={hddData.pilotHole.viscosity}
              onFocus={() => handleFieldFocus('pilotHole.viscosity', hddData.pilotHole.viscosity)}
              onChange={(e) => updatePilotHole('viscosity', e.target.value)}
              onBlur={(e) => handleFieldBlur('pilotHole.viscosity', e.target.value, 'Viscosity')}
              placeholder="Marsh funnel" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>pH</label>
            <input type="number" step="0.1" min="0" max="14" value={hddData.pilotHole.ph}
              onFocus={() => handleFieldFocus('pilotHole.ph', hddData.pilotHole.ph)}
              onChange={(e) => updatePilotHole('ph', e.target.value)}
              onBlur={(e) => handleFieldBlur('pilotHole.ph', e.target.value, 'pH')}
              placeholder="0-14" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Fluid Loss (mL/30min)</label>
            <input type="number" step="0.1" value={hddData.pilotHole.fluidLoss}
              onFocus={() => handleFieldFocus('pilotHole.fluidLoss', hddData.pilotHole.fluidLoss)}
              onChange={(e) => updatePilotHole('fluidLoss', e.target.value)}
              onBlur={(e) => handleFieldBlur('pilotHole.fluidLoss', e.target.value, 'Fluid Loss')}
              placeholder="API test" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Pitch Angle (°)</label>
            <input type="number" step="0.1" value={hddData.pilotHole.pitchAngle}
              onFocus={() => handleFieldFocus('pilotHole.pitchAngle', hddData.pilotHole.pitchAngle)}
              onChange={(e) => updatePilotHole('pitchAngle', e.target.value)}
              onBlur={(e) => handleFieldBlur('pilotHole.pitchAngle', e.target.value, 'Pitch Angle')}
              placeholder="Entry angle" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Azimuth (°)</label>
            <input type="number" step="0.1" min="0" max="360" value={hddData.pilotHole.azimuth}
              onFocus={() => handleFieldFocus('pilotHole.azimuth', hddData.pilotHole.azimuth)}
              onChange={(e) => updatePilotHole('azimuth', e.target.value)}
              onBlur={(e) => handleFieldBlur('pilotHole.azimuth', e.target.value, 'Azimuth')}
              placeholder="0-360" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Depth (m)</label>
            <input type="number" step="0.1" value={hddData.pilotHole.depth}
              onFocus={() => handleFieldFocus('pilotHole.depth', hddData.pilotHole.depth)}
              onChange={(e) => updatePilotHole('depth', e.target.value)}
              onBlur={(e) => handleFieldBlur('pilotHole.depth', e.target.value, 'Depth')}
              placeholder="Max depth" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Variance from Plan (m)</label>
            <input type="number" step="0.01" value={hddData.pilotHole.variance}
              onFocus={() => handleFieldFocus('pilotHole.variance', hddData.pilotHole.variance)}
              onChange={(e) => updatePilotHole('variance', e.target.value)}
              onBlur={(e) => handleFieldBlur('pilotHole.variance', e.target.value, 'Variance')}
              placeholder="± deviation" style={inputStyle} />
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. REAMING PASSES - Repeatable */}
      <CollapsibleSection
        id="reamingPasses"
        title="REAMING PASSES"
        color="#0c5460"
        bgColor="#d1ecf1"
        borderColor="#17a2b8"
        contentBgColor="#e8f7fc"
      >
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '15px' }}>
          <button onClick={toggleReamingPasses} style={{ padding: '8px 16px', backgroundColor: showReamingPasses ? '#dc3545' : '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
            {showReamingPasses ? '− Hide Entries' : '+ Add Reaming Passes'}
          </button>
        </div>
        {showReamingPasses && (
          <div>
            <button onClick={addReamingPass} style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', marginBottom: '15px' }}>+ Add Reaming Pass</button>
            {hddData.reamingPasses.entries.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>No reaming passes recorded.</p>
            ) : (
              hddData.reamingPasses.entries.map((pass, idx) => (
                <div key={pass.id} style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#d1ecf1', borderRadius: '8px', border: '1px solid #17a2b8' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#0c5460' }}>Reaming Pass #{pass.passNumber || idx + 1}</strong>
                    <button onClick={() => removeReamingPass(pass.id)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                  </div>
                  <div style={gridStyle}>
                    <div>
                      <label style={labelStyle}>Pass Number</label>
                      <input type="text" value={pass.passNumber} onFocus={() => handleEntryFieldFocus(pass.id, 'passNumber', pass.passNumber)} onChange={(e) => updateReamingPass(pass.id, 'passNumber', e.target.value)} onBlur={(e) => handleEntryFieldBlur(pass.id, 'passNumber', e.target.value, 'Pass Number', getReamingPassLabel(pass, idx))} placeholder="#" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Reamer Size (in)</label>
                      <input type="number" step="0.1" value={pass.reamerSize} onFocus={() => handleEntryFieldFocus(pass.id, 'reamerSize', pass.reamerSize)} onChange={(e) => updateReamingPass(pass.id, 'reamerSize', e.target.value)} onBlur={(e) => handleEntryFieldBlur(pass.id, 'reamerSize', e.target.value, 'Reamer Size', getReamingPassLabel(pass, idx))} placeholder="Diameter" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Pullback Force (lbs)</label>
                      <input type="number" value={pass.pullbackForce} onFocus={() => handleEntryFieldFocus(pass.id, 'pullbackForce', pass.pullbackForce)} onChange={(e) => updateReamingPass(pass.id, 'pullbackForce', e.target.value)} onBlur={(e) => handleEntryFieldBlur(pass.id, 'pullbackForce', e.target.value, 'Pullback Force', getReamingPassLabel(pass, idx))} placeholder="Max force" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Drilling Fluid Pressure (psi)</label>
                      <input type="number" value={pass.drillingFluidPressure} onFocus={() => handleEntryFieldFocus(pass.id, 'drillingFluidPressure', pass.drillingFluidPressure)} onChange={(e) => updateReamingPass(pass.id, 'drillingFluidPressure', e.target.value)} onBlur={(e) => handleEntryFieldBlur(pass.id, 'drillingFluidPressure', e.target.value, 'Drilling Fluid Pressure', getReamingPassLabel(pass, idx))} placeholder="Pressure" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Flow Rate (gpm)</label>
                      <input type="number" value={pass.flowRate} onFocus={() => handleEntryFieldFocus(pass.id, 'flowRate', pass.flowRate)} onChange={(e) => updateReamingPass(pass.id, 'flowRate', e.target.value)} onBlur={(e) => handleEntryFieldBlur(pass.id, 'flowRate', e.target.value, 'Flow Rate', getReamingPassLabel(pass, idx))} placeholder="Gallons/min" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Pass Complete?</label>
                      <select value={pass.passComplete} onFocus={() => handleEntryFieldFocus(pass.id, 'passComplete', pass.passComplete)} onChange={(e) => { updateReamingPass(pass.id, 'passComplete', e.target.value); handleEntryFieldBlur(pass.id, 'passComplete', e.target.value, 'Pass Complete', getReamingPassLabel(pass, idx)) }} style={{ ...selectStyle, backgroundColor: pass.passComplete === 'Yes' ? '#d4edda' : pass.passComplete === 'No' ? '#fff3cd' : 'white' }}>
                        <option value="">Select...</option>
                        <option value="Yes">Yes - Complete</option>
                        <option value="No">No - In Progress</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* 4. PIPE INSTALLATION - Green (Success) */}
      <CollapsibleSection
        id="pipeInstallation"
        title="PIPE INSTALLATION"
        color="#155724"
        bgColor="#d4edda"
        borderColor="#28a745"
        contentBgColor="#f0fff4"
      >
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Pullback Force (lbs)</label>
            <input type="number" value={hddData.pipeInstallation.pullbackForce}
              onFocus={() => handleFieldFocus('pipeInstallation.pullbackForce', hddData.pipeInstallation.pullbackForce)}
              onChange={(e) => updatePipeInstallation('pullbackForce', e.target.value)}
              onBlur={(e) => handleFieldBlur('pipeInstallation.pullbackForce', e.target.value, 'Pullback Force')}
              placeholder="Max during pull" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Swivel Connection Verified?</label>
            <select value={hddData.pipeInstallation.swivelConnectionVerified}
              onFocus={() => handleFieldFocus('pipeInstallation.swivelConnectionVerified', hddData.pipeInstallation.swivelConnectionVerified)}
              onChange={(e) => { updatePipeInstallation('swivelConnectionVerified', e.target.value); handleFieldBlur('pipeInstallation.swivelConnectionVerified', e.target.value, 'Swivel Connection Verified') }}
              style={{ ...selectStyle, backgroundColor: hddData.pipeInstallation.swivelConnectionVerified === 'Yes' ? '#d4edda' : hddData.pipeInstallation.swivelConnectionVerified === 'No' ? '#f8d7da' : 'white', fontWeight: 'bold' }}>
              <option value="">Select...</option>
              <option value="Yes">Yes - Verified</option>
              <option value="No">No - Issue</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Flotation Risk</label>
            <select value={hddData.pipeInstallation.flotationRisk}
              onFocus={() => handleFieldFocus('pipeInstallation.flotationRisk', hddData.pipeInstallation.flotationRisk)}
              onChange={(e) => { updatePipeInstallation('flotationRisk', e.target.value); handleFieldBlur('pipeInstallation.flotationRisk', e.target.value, 'Flotation Risk') }}
              style={{ ...selectStyle, backgroundColor: hddData.pipeInstallation.flotationRisk === 'High' ? '#f8d7da' : hddData.pipeInstallation.flotationRisk === 'Low' ? '#d4edda' : 'white' }}>
              <option value="">Select...</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High - Mitigation Required</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Pullback Speed (ft/min)</label>
            <input type="number" step="0.1" value={hddData.pipeInstallation.pullbackSpeed}
              onFocus={() => handleFieldFocus('pipeInstallation.pullbackSpeed', hddData.pipeInstallation.pullbackSpeed)}
              onChange={(e) => updatePipeInstallation('pullbackSpeed', e.target.value)}
              onBlur={(e) => handleFieldBlur('pipeInstallation.pullbackSpeed', e.target.value, 'Pullback Speed')}
              placeholder="Average speed" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Installation Complete?</label>
            <select value={hddData.pipeInstallation.installationComplete}
              onFocus={() => handleFieldFocus('pipeInstallation.installationComplete', hddData.pipeInstallation.installationComplete)}
              onChange={(e) => { updatePipeInstallation('installationComplete', e.target.value); handleFieldBlur('pipeInstallation.installationComplete', e.target.value, 'Installation Complete') }}
              style={{ ...selectStyle, backgroundColor: hddData.pipeInstallation.installationComplete === 'Yes' ? '#d4edda' : hddData.pipeInstallation.installationComplete === 'No' ? '#fff3cd' : 'white', fontWeight: 'bold' }}>
              <option value="">Select...</option>
              <option value="Yes">Yes - Complete</option>
              <option value="No">No - In Progress</option>
            </select>
          </div>
        </div>
      </CollapsibleSection>

      {/* 5. POST-INSTALLATION */}
      <CollapsibleSection id="postInstallation" title="POST-INSTALLATION">
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Annular Space Verified?</label>
            <select value={hddData.postInstallation.annularSpaceVerified}
              onFocus={() => handleFieldFocus('postInstallation.annularSpaceVerified', hddData.postInstallation.annularSpaceVerified)}
              onChange={(e) => { updatePostInstallation('annularSpaceVerified', e.target.value); handleFieldBlur('postInstallation.annularSpaceVerified', e.target.value, 'Annular Space Verified') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Yes">Yes - Acceptable</option>
              <option value="No">No - Action Required</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Grout Required?</label>
            <select value={hddData.postInstallation.groutRequired}
              onFocus={() => handleFieldFocus('postInstallation.groutRequired', hddData.postInstallation.groutRequired)}
              onChange={(e) => { updatePostInstallation('groutRequired', e.target.value); handleFieldBlur('postInstallation.groutRequired', e.target.value, 'Grout Required') }}
              style={selectStyle}>
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="TBD">To Be Determined</option>
            </select>
          </div>
          {(hddData.postInstallation.groutRequired === 'Yes') && (
            <>
              <div>
                <label style={labelStyle}>Grout Volume (m³)</label>
                <input type="number" step="0.1" value={hddData.postInstallation.groutVolume}
                  onFocus={() => handleFieldFocus('postInstallation.groutVolume', hddData.postInstallation.groutVolume)}
                  onChange={(e) => updatePostInstallation('groutVolume', e.target.value)}
                  onBlur={(e) => handleFieldBlur('postInstallation.groutVolume', e.target.value, 'Grout Volume')}
                  placeholder="Cubic meters" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Grout Pressure (psi)</label>
                <input type="number" value={hddData.postInstallation.groutPressure}
                  onFocus={() => handleFieldFocus('postInstallation.groutPressure', hddData.postInstallation.groutPressure)}
                  onChange={(e) => updatePostInstallation('groutPressure', e.target.value)}
                  onBlur={(e) => handleFieldBlur('postInstallation.groutPressure', e.target.value, 'Grout Pressure')}
                  placeholder="Injection pressure" style={inputStyle} />
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* 6. DRILLING WASTE MANAGEMENT (Directive 050) - Collapsible */}
      <CollapsibleSection
        id="wasteManagement"
        title="DRILLING WASTE MANAGEMENT (Directive 050)"
        color="#17a2b8"
        bgColor="#d1ecf1"
        borderColor="#17a2b8"
        contentBgColor="#e8f7fc"
      >
        <div style={{ marginBottom: '15px' }}>
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
            {showWasteManagement ? '− Hide Waste Management Module' : '+ Enable Waste Management Tracking'}
          </button>
          <p style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
            Track mud volumes, additives, disposal manifests, and compliance testing per AER Directive 050.
          </p>
        </div>

        {showWasteManagement && (
          <DrillingWasteManagement
            data={hddData.wasteManagementData}
            onChange={updateWasteManagementData}
            contractor={contractor}
            foreman={foreman}
            reportDate={reportDate}
            boreId={hddData.boreId}
            crossingId={hddData.crossingType}
            startKP={startKP}
            endKP={endKP}
            logId={logId}
            reportId={reportId}
          />
        )}
      </CollapsibleSection>

      {/* 7. STEERING LOG (Bore Path Data) - Purple */}
      <CollapsibleSection
        id="steeringLog"
        title="STEERING LOG (Bore Path Data)"
        color="#6f42c1"
        bgColor="#e2d9f3"
        borderColor="#6f42c1"
        contentBgColor="#f5f0ff"
      >
        <div style={{ marginBottom: '15px' }}>
          <button
            onClick={toggleSteeringLog}
            style={{
              padding: '10px 20px',
              backgroundColor: showSteeringLog ? '#dc3545' : '#6f42c1',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold'
            }}
          >
            {showSteeringLog ? '− Hide Steering Log Module' : '+ Enable Steering Log Tracking'}
          </button>
          <p style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
            Track pilot hole guidance data, per-joint steering readings, bending radius alerts, and upload bore logs.
          </p>
        </div>

        {showSteeringLog && (
          <HDDSteeringLog
            data={hddData.steeringLogData}
            onChange={updateSteeringLogData}
            contractor={contractor}
            foreman={foreman}
            reportDate={reportDate}
            boreId={hddData.boreId}
            crossingId={hddData.crossingType}
            boreLength={hddData.boreLength}
            startKP={startKP}
            endKP={endKP}
            logId={logId}
            reportId={reportId}
          />
        )}
      </CollapsibleSection>

      {/* 8. COMMENTS - Collapsible */}
      <CollapsibleSection id="comments" title="COMMENTS">
        <textarea value={hddData.comments}
          onFocus={() => handleFieldFocus('comments', hddData.comments)}
          onChange={(e) => updateField('comments', e.target.value)}
          onBlur={(e) => handleFieldBlur('comments', e.target.value, 'Comments')}
          placeholder="Additional comments, issues, observations, or notes..."
          style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }} />
      </CollapsibleSection>
    </div>
  )
}

export default HDDLog
