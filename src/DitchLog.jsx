import React, { useState } from 'react'

function DitchLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, metersToday }) {
  const [showRockTrench, setShowRockTrench] = useState(data?.rockTrench?.enabled || false)

  // Default structure
  const defaultData = {
    // Basic info
    fromKP: '',
    toKP: '',
    ditchLength: '',
    
    // Trench Specifications
    specifiedDepth: '',
    specifiedWidth: '',
    actualDepth: '',
    actualWidth: '',
    
    // Minimum Depth Check
    minimumDepthMet: '',
    depthNotMetReason: '',
    depthNotMetSignoff: '',
    depthNotMetSignoffRole: '',
    depthNotMetDate: '',
    
    // Rock Trench
    rockTrench: {
      enabled: false,
      entries: []
    },
    
    // Extra Depth
    extraDepthRequired: '',
    extraDepthInDrawings: '',
    extraDepthReason: '',
    extraDepthAmount: '',
    
    // Equipment
    ditchingEquipment: '',
    equipmentOther: '',
    
    // Soil Conditions
    soilConditions: '',
    groundwaterEncountered: '',
    groundwaterDepth: '',
    dewateringRequired: '',
    
    comments: ''
  }

  // Merge incoming data with defaults
  const ditchData = {
    ...defaultData,
    ...data,
    rockTrench: {
      ...defaultData.rockTrench,
      ...(data?.rockTrench || {}),
      entries: data?.rockTrench?.entries || []
    }
  }

  const updateField = (field, value) => {
    onChange({ ...ditchData, [field]: value })
  }

  // Rock Trench entries
  const toggleRockTrench = () => {
    const newEnabled = !showRockTrench
    setShowRockTrench(newEnabled)
    onChange({ 
      ...ditchData, 
      rockTrench: { ...ditchData.rockTrench, enabled: newEnabled } 
    })
  }

  const addRockTrenchEntry = () => {
    const newEntry = {
      id: Date.now(),
      startKP: '',
      endKP: '',
      length: '',
      equipment: '',
      equipmentOther: '',
      rockType: '',
      depthAchieved: '',
      comments: ''
    }
    onChange({ 
      ...ditchData, 
      rockTrench: { 
        ...ditchData.rockTrench, 
        entries: [...ditchData.rockTrench.entries, newEntry] 
      } 
    })
  }

  const updateRockTrenchEntry = (id, field, value) => {
    const updated = ditchData.rockTrench.entries.map(entry => {
      if (entry.id === id) {
        // Auto-calculate length if start and end KP are entered
        if (field === 'startKP' || field === 'endKP') {
          const updatedEntry = { ...entry, [field]: value }
          const start = parseFloat(updatedEntry.startKP?.replace('+', '.')) || 0
          const end = parseFloat(updatedEntry.endKP?.replace('+', '.')) || 0
          if (start && end) {
            updatedEntry.length = ((end - start) * 1000).toFixed(0) // Convert km to m
          }
          return updatedEntry
        }
        return { ...entry, [field]: value }
      }
      return entry
    })
    onChange({ 
      ...ditchData, 
      rockTrench: { ...ditchData.rockTrench, entries: updated } 
    })
  }

  const removeRockTrenchEntry = (id) => {
    onChange({ 
      ...ditchData, 
      rockTrench: { 
        ...ditchData.rockTrench, 
        entries: ditchData.rockTrench.entries.filter(e => e.id !== id) 
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
    borderBottom: '2px solid #6f42c1'
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

  const readOnlyStyle = {
    ...inputStyle,
    backgroundColor: '#e9ecef',
    cursor: 'not-allowed'
  }

  return (
    <div style={{ marginTop: '15px' }}>
      {/* INHERITED INFO BAR */}
      {(contractor || foreman || reportDate || startKP || endKP) && (
        <div style={{
          padding: '12px 15px',
          backgroundColor: '#e2d5f1',
          borderRadius: '6px',
          marginBottom: '15px',
          border: '1px solid #6f42c1'
        }}>
          <span style={{ fontSize: '13px', color: '#4a235a' }}>
            <strong>📋 From Activity:</strong>{' '}
            {reportDate && <>Date: <strong>{reportDate}</strong></>}
            {reportDate && contractor && ' | '}
            {contractor && <>Contractor: <strong>{contractor}</strong></>}
            {(reportDate || contractor) && foreman && ' | '}
            {foreman && <>Foreman: <strong>{foreman}</strong></>}
          </span>
          {(startKP || endKP) && (
            <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#d4c4e8', borderRadius: '4px' }}>
              <span style={{ fontSize: '13px', color: '#4a235a' }}>
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
        <div style={sectionHeaderStyle}>🚜 DITCH LOG INFORMATION</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Ditching Equipment</label>
            <select
              value={ditchData.ditchingEquipment}
              onChange={(e) => updateField('ditchingEquipment', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Wheel Ditcher">Wheel Ditcher</option>
              <option value="Chain Ditcher">Chain Ditcher</option>
              <option value="Excavator">Excavator</option>
              <option value="Track Hoe">Track Hoe</option>
              <option value="Other">Other</option>
            </select>
          </div>
          {ditchData.ditchingEquipment === 'Other' && (
            <div>
              <label style={labelStyle}>Other Equipment</label>
              <input
                type="text"
                value={ditchData.equipmentOther}
                onChange={(e) => updateField('equipmentOther', e.target.value)}
                placeholder="Specify equipment"
                style={inputStyle}
              />
            </div>
          )}
        </div>
      </div>

      {/* TRENCH SPECIFICATIONS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📏 TRENCH SPECIFICATIONS</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Specified Depth (m)</label>
            <input
              type="number"
              step="0.01"
              value={ditchData.specifiedDepth}
              onChange={(e) => updateField('specifiedDepth', e.target.value)}
              placeholder="Per drawings"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Actual Depth (m)</label>
            <input
              type="number"
              step="0.01"
              value={ditchData.actualDepth}
              onChange={(e) => updateField('actualDepth', e.target.value)}
              placeholder="As measured"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Specified Width (m)</label>
            <input
              type="number"
              step="0.01"
              value={ditchData.specifiedWidth}
              onChange={(e) => updateField('specifiedWidth', e.target.value)}
              placeholder="Per drawings"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Actual Width (m)</label>
            <input
              type="number"
              step="0.01"
              value={ditchData.actualWidth}
              onChange={(e) => updateField('actualWidth', e.target.value)}
              placeholder="As measured"
              style={inputStyle}
            />
          </div>
        </div>

        {/* MINIMUM DEPTH CHECK */}
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#856404', marginBottom: '12px' }}>
            ⚠️ Minimum Depth Verification
          </div>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Minimum Depth Met?</label>
              <select
                value={ditchData.minimumDepthMet}
                onChange={(e) => updateField('minimumDepthMet', e.target.value)}
                style={{
                  ...selectStyle,
                  backgroundColor: ditchData.minimumDepthMet === 'Yes' ? '#d4edda' : 
                                  ditchData.minimumDepthMet === 'No' ? '#f8d7da' : 'white',
                  fontWeight: 'bold'
                }}
              >
                <option value="">Select...</option>
                <option value="Yes">✓ Yes - Spec Met</option>
                <option value="No">✗ No - Signoff Required</option>
              </select>
            </div>
          </div>
          
          {/* Depth Not Met Section */}
          {ditchData.minimumDepthMet === 'No' && (
            <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#f8d7da', borderRadius: '6px', border: '2px solid #dc3545' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#721c24', marginBottom: '10px' }}>
                🚨 MINIMUM DEPTH NOT MET - SIGNOFF REQUIRED
              </div>
              <div style={gridStyle}>
                <div style={{ gridColumn: 'span 3' }}>
                  <label style={labelStyle}>Reason Minimum Depth Not Met *</label>
                  <textarea
                    value={ditchData.depthNotMetReason}
                    onChange={(e) => updateField('depthNotMetReason', e.target.value)}
                    placeholder="Explain why minimum depth could not be achieved (e.g. rock encountered, high water table, existing utilities, permit restrictions)..."
                    style={{
                      ...inputStyle,
                      minHeight: '80px',
                      resize: 'vertical'
                    }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Signoff Name *</label>
                  <input
                    type="text"
                    value={ditchData.depthNotMetSignoff}
                    onChange={(e) => updateField('depthNotMetSignoff', e.target.value)}
                    placeholder="Chief Inspector / CM"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Role *</label>
                  <select
                    value={ditchData.depthNotMetSignoffRole}
                    onChange={(e) => updateField('depthNotMetSignoffRole', e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">Select...</option>
                    <option value="Chief Inspector">Chief Inspector</option>
                    <option value="Construction Manager">Construction Manager</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Engineer">Engineer</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date of Signoff</label>
                  <input
                    type="date"
                    value={ditchData.depthNotMetDate}
                    onChange={(e) => updateField('depthNotMetDate', e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ROCK TRENCH SECTION */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>🪨 ROCK TRENCH</div>
          <button
            onClick={toggleRockTrench}
            style={{
              padding: '8px 16px',
              backgroundColor: showRockTrench ? '#dc3545' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {showRockTrench ? '− Hide Rock Trench' : '+ Add Rock Trench'}
          </button>
        </div>

        {showRockTrench && (
          <div>
            <button
              onClick={addRockTrenchEntry}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6f42c1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                marginBottom: '15px'
              }}
            >
              + Add Rock Trench Section
            </button>

            {ditchData.rockTrench.entries.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
                No rock trench sections recorded. Click "Add Rock Trench Section" to document rock encountered.
              </p>
            ) : (
              ditchData.rockTrench.entries.map((entry, idx) => (
                <div key={entry.id} style={{ 
                  marginBottom: '15px', 
                  padding: '15px', 
                  backgroundColor: '#e2e3e5', 
                  borderRadius: '8px',
                  border: '2px solid #6c757d'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#495057' }}>🪨 Rock Section #{idx + 1}</strong>
                    <button
                      onClick={() => removeRockTrenchEntry(entry.id)}
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
                      <label style={labelStyle}>Start (KP)</label>
                      <input
                        type="text"
                        value={entry.startKP}
                        onChange={(e) => updateRockTrenchEntry(entry.id, 'startKP', e.target.value)}
                        placeholder="e.g. 5+200"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>End (KP)</label>
                      <input
                        type="text"
                        value={entry.endKP}
                        onChange={(e) => updateRockTrenchEntry(entry.id, 'endKP', e.target.value)}
                        placeholder="e.g. 5+350"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Length (m)</label>
                      <input
                        type="text"
                        value={entry.length}
                        onChange={(e) => updateRockTrenchEntry(entry.id, 'length', e.target.value)}
                        placeholder="Auto-calculated"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Rock Type</label>
                      <select
                        value={entry.rockType}
                        onChange={(e) => updateRockTrenchEntry(entry.id, 'rockType', e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Select...</option>
                        <option value="Shale">Shale</option>
                        <option value="Sandstone">Sandstone</option>
                        <option value="Limestone">Limestone</option>
                        <option value="Granite">Granite</option>
                        <option value="Bedrock">Bedrock</option>
                        <option value="Cobble/Boulder">Cobble/Boulder</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Equipment Used</label>
                      <select
                        value={entry.equipment}
                        onChange={(e) => updateRockTrenchEntry(entry.id, 'equipment', e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Select...</option>
                        <option value="Hoe with Ripper Tooth">Hoe with Ripper Tooth</option>
                        <option value="Rock Hammer">Rock Hammer (Hydraulic Breaker)</option>
                        <option value="Eccentric Ripper">Eccentric Ripper</option>
                        <option value="Rock Saw">Rock Saw</option>
                        <option value="Rock Wheel">Rock Wheel</option>
                        <option value="Blasting">Blasting</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    {entry.equipment === 'Other' && (
                      <div>
                        <label style={labelStyle}>Other Equipment</label>
                        <input
                          type="text"
                          value={entry.equipmentOther}
                          onChange={(e) => updateRockTrenchEntry(entry.id, 'equipmentOther', e.target.value)}
                          placeholder="Specify equipment"
                          style={inputStyle}
                        />
                      </div>
                    )}
                    <div>
                      <label style={labelStyle}>Depth Achieved (m)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={entry.depthAchieved}
                        onChange={(e) => updateRockTrenchEntry(entry.id, 'depthAchieved', e.target.value)}
                        placeholder="Actual depth"
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Comments</label>
                      <input
                        type="text"
                        value={entry.comments}
                        onChange={(e) => updateRockTrenchEntry(entry.id, 'comments', e.target.value)}
                        placeholder="Production rate, challenges, etc."
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Rock Trench Summary */}
            {ditchData.rockTrench.entries.length > 0 && (
              <div style={{ padding: '10px', backgroundColor: '#e2e3e5', borderRadius: '4px', fontSize: '13px', marginTop: '10px' }}>
                <strong>Rock Trench Summary:</strong>{' '}
                {ditchData.rockTrench.entries.length} section(s) |{' '}
                Total: {ditchData.rockTrench.entries.reduce((sum, e) => sum + (parseFloat(e.length) || 0), 0).toFixed(0)}m
              </div>
            )}
          </div>
        )}
      </div>

      {/* EXTRA DEPTH SECTION */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📐 EXTRA DEPTH</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Extra Depth Required?</label>
            <select
              value={ditchData.extraDepthRequired}
              onChange={(e) => updateField('extraDepthRequired', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
          {ditchData.extraDepthRequired === 'Yes' && (
            <>
              <div>
                <label style={labelStyle}>Extra Depth Amount (m)</label>
                <input
                  type="number"
                  step="0.01"
                  value={ditchData.extraDepthAmount}
                  onChange={(e) => updateField('extraDepthAmount', e.target.value)}
                  placeholder="Additional depth"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>In Drawings?</label>
                <select
                  value={ditchData.extraDepthInDrawings}
                  onChange={(e) => updateField('extraDepthInDrawings', e.target.value)}
                  style={{
                    ...selectStyle,
                    backgroundColor: ditchData.extraDepthInDrawings === 'Yes' ? '#d4edda' : 
                                    ditchData.extraDepthInDrawings === 'No' ? '#fff3cd' : 'white'
                  }}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes - Per Drawings</option>
                  <option value="No">No - Field Decision</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label style={labelStyle}>Reason for Extra Depth *</label>
                <textarea
                  value={ditchData.extraDepthReason}
                  onChange={(e) => updateField('extraDepthReason', e.target.value)}
                  placeholder="Explain why extra depth was required (e.g. crossing clearance, future development, client request, foreign line clearance, regulatory requirement)..."
                  style={{
                    ...inputStyle,
                    minHeight: '60px',
                    resize: 'vertical'
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* SOIL CONDITIONS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🌍 SOIL CONDITIONS</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Soil Conditions</label>
            <select
              value={ditchData.soilConditions}
              onChange={(e) => updateField('soilConditions', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Sand">Sand</option>
              <option value="Clay">Clay</option>
              <option value="Gravel">Gravel</option>
              <option value="Loam">Loam</option>
              <option value="Muskeg">Muskeg/Organic</option>
              <option value="Mixed">Mixed</option>
              <option value="Rock">Rock</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Groundwater Encountered?</label>
            <select
              value={ditchData.groundwaterEncountered}
              onChange={(e) => updateField('groundwaterEncountered', e.target.value)}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
          {ditchData.groundwaterEncountered === 'Yes' && (
            <>
              <div>
                <label style={labelStyle}>Groundwater Depth (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={ditchData.groundwaterDepth}
                  onChange={(e) => updateField('groundwaterDepth', e.target.value)}
                  placeholder="Depth to water"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Dewatering Required?</label>
                <select
                  value={ditchData.dewateringRequired}
                  onChange={(e) => updateField('dewateringRequired', e.target.value)}
                  style={selectStyle}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* COMMENTS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📝 COMMENTS</div>
        <textarea
          value={ditchData.comments}
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

export default DitchLog
