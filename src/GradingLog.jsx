import React, { useState } from 'react'

function GradingLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, metersToday }) {
  const [showSoftSpots, setShowSoftSpots] = useState(data?.softSpots?.enabled || false)
  const [showCrossings, setShowCrossings] = useState(data?.crossings?.enabled || false)

  // Default structure
  const defaultData = {
    // ROW Conditions
    rowWidth: '',
    rowWidthSpec: '',
    rowCondition: '',
    
    // Pile Separation (critical for reclamation)
    topsoilPileSeparation: '',
    topsoilPileLocation: '',
    subsoilPileLocation: '',
    pileSeparationMaintained: '',
    pileSeparationIssues: '',
    
    // Drainage
    drainageCondition: '',
    crownMaintained: '',
    pondingObserved: '',
    pondingLocation: '',
    drainageControlsInstalled: '',
    drainageControlsType: '',
    
    // Environmental Controls
    siltFenceInstalled: '',
    siltFenceCondition: '',
    strawBales: '',
    erosionBlankets: '',
    sedimentTraps: '',
    environmentalIssues: '',
    
    // Soft Spots / Problem Areas
    softSpots: {
      enabled: false,
      entries: []
    },
    
    // Access & Crossings
    accessMaintained: '',
    crossings: {
      enabled: false,
      entries: []
    },
    
    // Equipment
    gradingEquipment: '',
    equipmentOther: '',
    
    // Topsoil Status
    topsoilStripped: '',
    topsoilDepth: '',
    topsoilStockpiled: '',
    
    comments: ''
  }

  // Merge incoming data with defaults
  const gradingData = {
    ...defaultData,
    ...data,
    softSpots: {
      ...defaultData.softSpots,
      ...(data?.softSpots || {}),
      entries: data?.softSpots?.entries || []
    },
    crossings: {
      ...defaultData.crossings,
      ...(data?.crossings || {}),
      entries: data?.crossings?.entries || []
    }
  }

  const updateField = (field, value) => {
    onChange({ ...gradingData, [field]: value })
  }

  // Soft Spots management
  const toggleSoftSpots = () => {
    const newEnabled = !showSoftSpots
    setShowSoftSpots(newEnabled)
    onChange({ 
      ...gradingData, 
      softSpots: { ...gradingData.softSpots, enabled: newEnabled } 
    })
  }

  const addSoftSpot = () => {
    const newSpot = {
      id: Date.now(),
      location: '',
      kp: '',
      length: '',
      width: '',
      cause: '',
      actionTaken: '',
      resolved: '',
      comments: ''
    }
    onChange({ 
      ...gradingData, 
      softSpots: { 
        ...gradingData.softSpots, 
        entries: [...gradingData.softSpots.entries, newSpot] 
      } 
    })
  }

  const updateSoftSpot = (id, field, value) => {
    const updated = gradingData.softSpots.entries.map(spot => {
      if (spot.id === id) {
        return { ...spot, [field]: value }
      }
      return spot
    })
    onChange({ 
      ...gradingData, 
      softSpots: { ...gradingData.softSpots, entries: updated } 
    })
  }

  const removeSoftSpot = (id) => {
    onChange({ 
      ...gradingData, 
      softSpots: { 
        ...gradingData.softSpots, 
        entries: gradingData.softSpots.entries.filter(s => s.id !== id) 
      } 
    })
  }

  // Crossings management
  const toggleCrossings = () => {
    const newEnabled = !showCrossings
    setShowCrossings(newEnabled)
    onChange({ 
      ...gradingData, 
      crossings: { ...gradingData.crossings, enabled: newEnabled } 
    })
  }

  const addCrossing = () => {
    const newCrossing = {
      id: Date.now(),
      crossingType: '',
      kp: '',
      accessMaintained: '',
      signageInPlace: '',
      trafficControl: '',
      condition: '',
      comments: ''
    }
    onChange({ 
      ...gradingData, 
      crossings: { 
        ...gradingData.crossings, 
        entries: [...gradingData.crossings.entries, newCrossing] 
      } 
    })
  }

  const updateCrossing = (id, field, value) => {
    const updated = gradingData.crossings.entries.map(crossing => {
      if (crossing.id === id) {
        return { ...crossing, [field]: value }
      }
      return crossing
    })
    onChange({ 
      ...gradingData, 
      crossings: { ...gradingData.crossings, entries: updated } 
    })
  }

  const removeCrossing = (id) => {
    onChange({ 
      ...gradingData, 
      crossings: { 
        ...gradingData.crossings, 
        entries: gradingData.crossings.entries.filter(c => c.id !== id) 
      } 
    })
  }

  // Styles
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
    borderBottom: '2px solid #6c757d'
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

  return (
    <div style={{ marginTop: '15px' }}>
      {/* INHERITED INFO BAR */}
      {(contractor || foreman || reportDate || startKP || endKP) && (
        <div style={{
          padding: '12px 15px',
          backgroundColor: '#e2e3e5',
          borderRadius: '6px',
          marginBottom: '15px',
          border: '1px solid #6c757d'
        }}>
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

      {/* ROW CONDITIONS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🛤️ RIGHT OF WAY CONDITIONS</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>ROW Width (m)</label>
            <input
              type="number"
              step="0.1"
              value={gradingData.rowWidth}
              onChange={(e) => updateField('rowWidth', e.target.value)}
              placeholder="Actual width"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Specified Width (m)</label>
            <input
              type="number"
              step="0.1"
              value={gradingData.rowWidthSpec}
              onChange={(e) => updateField('rowWidthSpec', e.target.value)}
              placeholder="Per drawings"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>ROW Condition</label>
            <select
              value={gradingData.rowCondition}
              onChange={(e) => updateField('rowCondition', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Poor">Poor - Requires Attention</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Grading Equipment</label>
            <select
              value={gradingData.gradingEquipment}
              onChange={(e) => updateField('gradingEquipment', e.target.value)}
              style={selectStyle}
            >
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
              <input
                type="text"
                value={gradingData.equipmentOther}
                onChange={(e) => updateField('equipmentOther', e.target.value)}
                placeholder="Specify equipment"
                style={inputStyle}
              />
            </div>
          )}
        </div>
      </div>

      {/* PILE SEPARATION - Critical for reclamation */}
      <div style={{ ...sectionStyle, backgroundColor: '#fff3cd', border: '2px solid #ffc107' }}>
        <div style={{ ...sectionHeaderStyle, borderBottom: '2px solid #856404', color: '#856404' }}>
          ⚠️ PILE SEPARATION (Critical for Reclamation)
        </div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Pile Separation Maintained?</label>
            <select
              value={gradingData.pileSeparationMaintained}
              onChange={(e) => updateField('pileSeparationMaintained', e.target.value)}
              style={{
                ...selectStyle,
                backgroundColor: gradingData.pileSeparationMaintained === 'Yes' ? '#d4edda' : 
                                gradingData.pileSeparationMaintained === 'No' ? '#f8d7da' : 'white',
                fontWeight: 'bold'
              }}
            >
              <option value="">Select...</option>
              <option value="Yes">✓ Yes - Compliant</option>
              <option value="No">✗ No - NCR Required</option>
              <option value="N/A">N/A - No Topsoil</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Separation Distance (m)</label>
            <input
              type="number"
              step="0.1"
              value={gradingData.topsoilPileSeparation}
              onChange={(e) => updateField('topsoilPileSeparation', e.target.value)}
              placeholder="Distance between piles"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Topsoil Pile Location</label>
            <select
              value={gradingData.topsoilPileLocation}
              onChange={(e) => updateField('topsoilPileLocation', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Work Side">Work Side</option>
              <option value="Spoil Side">Spoil Side</option>
              <option value="Varies">Varies</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Subsoil/Spoil Pile Location</label>
            <select
              value={gradingData.subsoilPileLocation}
              onChange={(e) => updateField('subsoilPileLocation', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Work Side">Work Side</option>
              <option value="Spoil Side">Spoil Side</option>
              <option value="Varies">Varies</option>
            </select>
          </div>
          {gradingData.pileSeparationMaintained === 'No' && (
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ ...labelStyle, color: '#721c24' }}>Issues / NCR Details *</label>
              <textarea
                value={gradingData.pileSeparationIssues}
                onChange={(e) => updateField('pileSeparationIssues', e.target.value)}
                placeholder="Describe pile separation issues, contamination, corrective actions..."
                style={{
                  ...inputStyle,
                  minHeight: '60px',
                  resize: 'vertical',
                  backgroundColor: '#fff5f5'
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* TOPSOIL STATUS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🌱 TOPSOIL STATUS</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Topsoil Stripped?</label>
            <select
              value={gradingData.topsoilStripped}
              onChange={(e) => updateField('topsoilStripped', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="Partial">Partial</option>
              <option value="N/A">N/A - No Topsoil Present</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Topsoil Depth (cm)</label>
            <input
              type="number"
              value={gradingData.topsoilDepth}
              onChange={(e) => updateField('topsoilDepth', e.target.value)}
              placeholder="Average depth"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Topsoil Stockpiled Properly?</label>
            <select
              value={gradingData.topsoilStockpiled}
              onChange={(e) => updateField('topsoilStockpiled', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No - Requires Attention</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
        </div>
      </div>

      {/* DRAINAGE */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>💧 DRAINAGE</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Drainage Condition</label>
            <select
              value={gradingData.drainageCondition}
              onChange={(e) => updateField('drainageCondition', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Good">Good - Draining Well</option>
              <option value="Fair">Fair - Some Issues</option>
              <option value="Poor">Poor - Standing Water</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Crown Maintained?</label>
            <select
              value={gradingData.crownMaintained}
              onChange={(e) => updateField('crownMaintained', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Ponding Observed?</label>
            <select
              value={gradingData.pondingObserved}
              onChange={(e) => updateField('pondingObserved', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
          {gradingData.pondingObserved === 'Yes' && (
            <div>
              <label style={labelStyle}>Ponding Location (KP)</label>
              <input
                type="text"
                value={gradingData.pondingLocation}
                onChange={(e) => updateField('pondingLocation', e.target.value)}
                placeholder="e.g. 5+350"
                style={inputStyle}
              />
            </div>
          )}
          <div>
            <label style={labelStyle}>Drainage Controls Installed?</label>
            <select
              value={gradingData.drainageControlsInstalled}
              onChange={(e) => updateField('drainageControlsInstalled', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
          {gradingData.drainageControlsInstalled === 'Yes' && (
            <div>
              <label style={labelStyle}>Control Type</label>
              <input
                type="text"
                value={gradingData.drainageControlsType}
                onChange={(e) => updateField('drainageControlsType', e.target.value)}
                placeholder="e.g. Culverts, berms, swales"
                style={inputStyle}
              />
            </div>
          )}
        </div>
      </div>

      {/* ENVIRONMENTAL CONTROLS */}
      <div style={{ ...sectionStyle, backgroundColor: '#d4edda', border: '1px solid #28a745' }}>
        <div style={{ ...sectionHeaderStyle, borderBottom: '2px solid #28a745', color: '#155724' }}>
          🌿 ENVIRONMENTAL CONTROLS
        </div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Silt Fence Installed?</label>
            <select
              value={gradingData.siltFenceInstalled}
              onChange={(e) => updateField('siltFenceInstalled', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="N/A">N/A</option>
            </select>
          </div>
          {gradingData.siltFenceInstalled === 'Yes' && (
            <div>
              <label style={labelStyle}>Silt Fence Condition</label>
              <select
                value={gradingData.siltFenceCondition}
                onChange={(e) => updateField('siltFenceCondition', e.target.value)}
                style={selectStyle}
              >
                <option value="">Select...</option>
                <option value="Good">Good</option>
                <option value="Damaged">Damaged - Needs Repair</option>
                <option value="Full">Full - Needs Cleaning</option>
              </select>
            </div>
          )}
          <div>
            <label style={labelStyle}>Straw Bales</label>
            <select
              value={gradingData.strawBales}
              onChange={(e) => updateField('strawBales', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Installed">Installed</option>
              <option value="Not Required">Not Required</option>
              <option value="Needed">Needed</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Erosion Blankets</label>
            <select
              value={gradingData.erosionBlankets}
              onChange={(e) => updateField('erosionBlankets', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Installed">Installed</option>
              <option value="Not Required">Not Required</option>
              <option value="Needed">Needed</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sediment Traps</label>
            <select
              value={gradingData.sedimentTraps}
              onChange={(e) => updateField('sedimentTraps', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Installed">Installed</option>
              <option value="Not Required">Not Required</option>
              <option value="Needed">Needed</option>
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Environmental Issues / Notes</label>
            <input
              type="text"
              value={gradingData.environmentalIssues}
              onChange={(e) => updateField('environmentalIssues', e.target.value)}
              placeholder="Any environmental concerns, wildlife, watercourse issues..."
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* SOFT SPOTS / PROBLEM AREAS */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>🚧 SOFT SPOTS / PROBLEM AREAS</div>
          <button
            onClick={toggleSoftSpots}
            style={{
              padding: '8px 16px',
              backgroundColor: showSoftSpots ? '#dc3545' : '#ffc107',
              color: showSoftSpots ? 'white' : '#212529',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {showSoftSpots ? '− Hide Soft Spots' : '+ Add Soft Spots'}
          </button>
        </div>

        {showSoftSpots && (
          <div>
            <button
              onClick={addSoftSpot}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                marginBottom: '15px'
              }}
            >
              + Add Soft Spot Entry
            </button>

            {gradingData.softSpots.entries.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
                No soft spots recorded. Click "Add Soft Spot Entry" to document problem areas.
              </p>
            ) : (
              gradingData.softSpots.entries.map((spot, idx) => (
                <div key={spot.id} style={{ 
                  marginBottom: '15px', 
                  padding: '15px', 
                  backgroundColor: '#fff3cd', 
                  borderRadius: '8px',
                  border: '1px solid #ffc107'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#856404' }}>⚠️ Soft Spot #{idx + 1}</strong>
                    <button
                      onClick={() => removeSoftSpot(spot.id)}
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
                      <label style={labelStyle}>Location (KP)</label>
                      <input
                        type="text"
                        value={spot.kp}
                        onChange={(e) => updateSoftSpot(spot.id, 'kp', e.target.value)}
                        placeholder="e.g. 5+350"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Length (m)</label>
                      <input
                        type="number"
                        value={spot.length}
                        onChange={(e) => updateSoftSpot(spot.id, 'length', e.target.value)}
                        placeholder="Approx length"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Width (m)</label>
                      <input
                        type="number"
                        value={spot.width}
                        onChange={(e) => updateSoftSpot(spot.id, 'width', e.target.value)}
                        placeholder="Approx width"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Cause</label>
                      <select
                        value={spot.cause}
                        onChange={(e) => updateSoftSpot(spot.id, 'cause', e.target.value)}
                        style={selectStyle}
                      >
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
                      <select
                        value={spot.actionTaken}
                        onChange={(e) => updateSoftSpot(spot.id, 'actionTaken', e.target.value)}
                        style={selectStyle}
                      >
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
                      <select
                        value={spot.resolved}
                        onChange={(e) => updateSoftSpot(spot.id, 'resolved', e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Select...</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No - Ongoing</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Comments</label>
                      <input
                        type="text"
                        value={spot.comments}
                        onChange={(e) => updateSoftSpot(spot.id, 'comments', e.target.value)}
                        placeholder="Additional details..."
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

      {/* ACCESS & CROSSINGS */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>🚗 ACCESS & CROSSINGS</div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: '12px', marginRight: '8px' }}>Access Maintained?</label>
              <select
                value={gradingData.accessMaintained}
                onChange={(e) => updateField('accessMaintained', e.target.value)}
                style={{ ...selectStyle, width: 'auto', padding: '6px 12px' }}
              >
                <option value="">Select...</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
            <button
              onClick={toggleCrossings}
              style={{
                padding: '8px 16px',
                backgroundColor: showCrossings ? '#dc3545' : '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              {showCrossings ? '− Hide Crossings' : '+ Add Crossings'}
            </button>
          </div>
        </div>

        {showCrossings && (
          <div>
            <button
              onClick={addCrossing}
              style={{
                padding: '8px 16px',
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                marginBottom: '15px'
              }}
            >
              + Add Crossing Entry
            </button>

            {gradingData.crossings.entries.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
                No crossings recorded. Click "Add Crossing Entry" to document road/access crossings.
              </p>
            ) : (
              gradingData.crossings.entries.map((crossing, idx) => (
                <div key={crossing.id} style={{ 
                  marginBottom: '15px', 
                  padding: '15px', 
                  backgroundColor: '#d1ecf1', 
                  borderRadius: '8px',
                  border: '1px solid #17a2b8'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#0c5460' }}>🚗 Crossing #{idx + 1}</strong>
                    <button
                      onClick={() => removeCrossing(crossing.id)}
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
                        onChange={(e) => updateCrossing(crossing.id, 'crossingType', e.target.value)}
                        style={selectStyle}
                      >
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
                      <input
                        type="text"
                        value={crossing.kp}
                        onChange={(e) => updateCrossing(crossing.id, 'kp', e.target.value)}
                        placeholder="e.g. 5+500"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Access Maintained?</label>
                      <select
                        value={crossing.accessMaintained}
                        onChange={(e) => updateCrossing(crossing.id, 'accessMaintained', e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Select...</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No - Closed</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Signage in Place?</label>
                      <select
                        value={crossing.signageInPlace}
                        onChange={(e) => updateCrossing(crossing.id, 'signageInPlace', e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Select...</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No - Needed</option>
                        <option value="N/A">N/A</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Traffic Control</label>
                      <select
                        value={crossing.trafficControl}
                        onChange={(e) => updateCrossing(crossing.id, 'trafficControl', e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Select...</option>
                        <option value="Flaggers">Flaggers</option>
                        <option value="Signs Only">Signs Only</option>
                        <option value="Pilot Car">Pilot Car</option>
                        <option value="None Required">None Required</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Condition</label>
                      <select
                        value={crossing.condition}
                        onChange={(e) => updateCrossing(crossing.id, 'condition', e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Select...</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                        <option value="Poor">Poor - Needs Work</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Comments</label>
                      <input
                        type="text"
                        value={crossing.comments}
                        onChange={(e) => updateCrossing(crossing.id, 'comments', e.target.value)}
                        placeholder="Additional details..."
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
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📝 COMMENTS</div>
        <textarea
          value={gradingData.comments}
          onChange={(e) => updateField('comments', e.target.value)}
          placeholder="Additional comments, observations, production notes..."
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

export default GradingLog
