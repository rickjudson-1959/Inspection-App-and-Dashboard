import React, { useState } from 'react'

function TieInCompletionLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, metersToday }) {
  const [showCrossings, setShowCrossings] = useState(data?.crossingsEnabled || false)
  const [showAnodes, setShowAnodes] = useState(data?.anodesEnabled || false)

  // Default structure
  const defaultData = {
    // Basic info
    tieInLocation: '',
    fromKP: '',
    toKP: '',
    
    // Backfill details
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
    
    // Cathodic Protection
    cathodicProtection: {
      installed: '',
      installedBy: '', // 'contractor' or 'thirdParty'
      thirdPartyName: '',
      cpType: '',
      testStationInstalled: '',
      testStationLocation: '',
      wireColor: '',
      connectionMethod: ''
    },
    
    // Road/Pipe Crossings
    crossingsEnabled: false,
    crossings: [],
    
    // Third Party Crossings
    thirdPartyCrossings: [],
    
    // Anodes
    anodesEnabled: false,
    anodes: [],
    
    // Pipe Support
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
  const addThirdPartyCrossing = () => {
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
    onChange({ ...tieInData, thirdPartyCrossings: tieInData.thirdPartyCrossings.filter(c => c.id !== id) })
  }

  // Anodes
  const toggleAnodes = () => {
    const newEnabled = !showAnodes
    setShowAnodes(newEnabled)
    onChange({ ...tieInData, anodesEnabled: newEnabled })
  }

  const addAnode = () => {
    const newAnode = {
      id: Date.now(),
      anodeType: '', // 'single' or 'bed'
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
    onChange({ ...tieInData, anodes: tieInData.anodes.filter(a => a.id !== id) })
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
    borderBottom: '2px solid #fd7e14'
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

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  }

  const thStyle = {
    padding: '8px',
    backgroundColor: '#fd7e14',
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '11px',
    border: '1px solid #e8590c'
  }

  const tdStyle = {
    padding: '6px',
    border: '1px solid #dee2e6',
    textAlign: 'center'
  }

  const tableInputStyle = {
    width: '100%',
    padding: '6px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '12px',
    boxSizing: 'border-box'
  }

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
              onChange={(e) => updateField('tieInLocation', e.target.value)}
              placeholder="e.g. Road Crossing #3, Valve Station, Foreign Line Crossing"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* BACKFILL SECTION */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🚜 BACKFILL DETAILS</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Backfill Method</label>
            <select
              value={tieInData.backfill.method}
              onChange={(e) => updateBackfill('method', e.target.value)}
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
              onChange={(e) => updateBackfill('paddingMaterial', e.target.value)}
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
              onChange={(e) => updateBackfill('paddingDepth', e.target.value)}
              placeholder="e.g. 150"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Lift Thickness (mm)</label>
            <input
              type="number"
              value={tieInData.backfill.liftThickness}
              onChange={(e) => updateBackfill('liftThickness', e.target.value)}
              placeholder="e.g. 300"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Number of Lifts</label>
            <input
              type="number"
              value={tieInData.backfill.numberOfLifts}
              onChange={(e) => updateBackfill('numberOfLifts', e.target.value)}
              placeholder="e.g. 3"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Compaction Method</label>
            <select
              value={tieInData.backfill.compactionMethod}
              onChange={(e) => updateBackfill('compactionMethod', e.target.value)}
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
              onChange={(e) => updateBackfill('compactionTestRequired', e.target.value)}
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
                onChange={(e) => updateBackfill('compactionTestPassed', e.target.value)}
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

      {/* CATHODIC PROTECTION SECTION */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>⚡ CATHODIC PROTECTION</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>CP Installed</label>
            <select
              value={tieInData.cathodicProtection.installed}
              onChange={(e) => updateCP('installed', e.target.value)}
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
                  onChange={(e) => updateCP('installedBy', e.target.value)}
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
                    onChange={(e) => updateCP('thirdPartyName', e.target.value)}
                    placeholder="Company name"
                    style={inputStyle}
                  />
                </div>
              )}
              <div>
                <label style={labelStyle}>CP Type</label>
                <select
                  value={tieInData.cathodicProtection.cpType}
                  onChange={(e) => updateCP('cpType', e.target.value)}
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
                  onChange={(e) => updateCP('connectionMethod', e.target.value)}
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
                  onChange={(e) => updateCP('wireColor', e.target.value)}
                  placeholder="e.g. Red, Blue"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Test Station Installed</label>
                <select
                  value={tieInData.cathodicProtection.testStationInstalled}
                  onChange={(e) => updateCP('testStationInstalled', e.target.value)}
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
                    onChange={(e) => updateCP('testStationLocation', e.target.value)}
                    placeholder="e.g. KP 5+250, 3m N of CL"
                    style={inputStyle}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* THIRD PARTY CROSSINGS */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>🚧 THIRD PARTY CROSSINGS</div>
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
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'crossingType', e.target.value)}
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
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'facilityOwner', e.target.value)}
                      placeholder="e.g. ATCO, Telus"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Facility Type/Size</label>
                    <input
                      type="text"
                      value={crossing.facilityType}
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'facilityType', e.target.value)}
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
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'ourPipeDepth', e.target.value)}
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
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'thirdPartyDepth', e.target.value)}
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
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'separationDistance', e.target.value)}
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
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'minimumRequired', e.target.value)}
                      placeholder="Per regulation"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Compliant</label>
                    <select
                      value={crossing.compliant}
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'compliant', e.target.value)}
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
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'surveyedBy', e.target.value)}
                      placeholder="Surveyor name"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={labelStyle}>Comments</label>
                    <input
                      type="text"
                      value={crossing.comments}
                      onChange={(e) => updateThirdPartyCrossing(crossing.id, 'comments', e.target.value)}
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

      {/* PIPE SUPPORT */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🏗️ PIPE SUPPORT</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Pipe Support Required</label>
            <select
              value={tieInData.pipeSupport.required}
              onChange={(e) => updatePipeSupport('required', e.target.value)}
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
                  onChange={(e) => updatePipeSupport('type', e.target.value)}
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
                  onChange={(e) => updatePipeSupport('location', e.target.value)}
                  placeholder="e.g. Road Crossing KP 5+250"
                  style={inputStyle}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Details</label>
                <input
                  type="text"
                  value={tieInData.pipeSupport.details}
                  onChange={(e) => updatePipeSupport('details', e.target.value)}
                  placeholder="Support specifications, dimensions..."
                  style={inputStyle}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ANODES / ANODE BEDS */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>🔋 ANODES / ANODE BEDS</div>
          <button
            onClick={toggleAnodes}
            style={{
              padding: '8px 16px',
              backgroundColor: showAnodes ? '#dc3545' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {showAnodes ? '− Hide Anodes' : '+ Add Anodes'}
          </button>
        </div>

        {showAnodes && (
          <div>
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
                marginBottom: '15px'
              }}
            >
              + Add Anode Entry
            </button>

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
                        onChange={(e) => updateAnode(anode.id, 'anodeType', e.target.value)}
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
                        onChange={(e) => updateAnode(anode.id, 'material', e.target.value)}
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
                        onChange={(e) => updateAnode(anode.id, 'kp', e.target.value)}
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
                        onChange={(e) => updateAnode(anode.id, 'depth', e.target.value)}
                        placeholder="e.g. 2.0"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Weight (kg)</label>
                      <input
                        type="number"
                        value={anode.weight}
                        onChange={(e) => updateAnode(anode.id, 'weight', e.target.value)}
                        placeholder="e.g. 17"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Quantity</label>
                      <input
                        type="number"
                        value={anode.quantity}
                        onChange={(e) => updateAnode(anode.id, 'quantity', e.target.value)}
                        placeholder="e.g. 1"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Installed By</label>
                      <input
                        type="text"
                        value={anode.installedBy}
                        onChange={(e) => updateAnode(anode.id, 'installedBy', e.target.value)}
                        placeholder="Contractor name"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Test Lead Installed</label>
                      <select
                        value={anode.testLeadInstalled}
                        onChange={(e) => updateAnode(anode.id, 'testLeadInstalled', e.target.value)}
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
                        onChange={(e) => updateAnode(anode.id, 'comments', e.target.value)}
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
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📝 COMMENTS</div>
        <textarea
          value={tieInData.comments}
          onChange={(e) => updateField('comments', e.target.value)}
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
