import React from 'react'

function PilingLog({ data, onChange }) {
  // Default structure
  const defaultData = {
    reportDate: '',
    contractor: '',
    foreman: '',
    pilingContractor: '',
    pileDriverNumber: '',
    
    // Location entries (repeatable)
    locations: [],
    
    // Pile details
    pileNo: '',
    pileTypeSize: '',
    noOfSplices: '',
    finalLength: '',
    hammerType: '',
    hammerWeightKg: '',
    dropDistanceM: '',
    energyPerBlow: '', // Auto-calculated
    refusalCriteria: '',
    gradeElevation: '',
    cutOffElevation: '',
    
    // Verification activities
    verifications: {
      materialTraceability: '',
      locationPerDrawings: '',
      clearOfFacilities: '',
      plumbAndVertical: '',
      spliceWelding: '',
      qcDocumentation: ''
    },
    
    comments: ''
  }

  // Merge incoming data with defaults
  const pilingData = {
    ...defaultData,
    ...data,
    verifications: {
      ...defaultData.verifications,
      ...(data?.verifications || {})
    },
    locations: data?.locations || []
  }

  const updateField = (field, value) => {
    const updated = { ...pilingData, [field]: value }
    
    // Auto-calculate Energy/Blow when weight or distance changes
    if (field === 'hammerWeightKg' || field === 'dropDistanceM') {
      const weight = parseFloat(field === 'hammerWeightKg' ? value : pilingData.hammerWeightKg) || 0
      const distance = parseFloat(field === 'dropDistanceM' ? value : pilingData.dropDistanceM) || 0
      if (weight > 0 && distance > 0) {
        updated.energyPerBlow = (weight * distance * 9.81).toFixed(2)
      } else {
        updated.energyPerBlow = ''
      }
    }
    
    onChange(updated)
  }

  const updateVerification = (field, value) => {
    onChange({
      ...pilingData,
      verifications: {
        ...pilingData.verifications,
        [field]: value
      }
    })
  }

  const addLocation = () => {
    const newLocation = {
      id: Date.now(),
      location: '',
      drawingNumber: '',
      pilesRequired: '',
      pilesToday: '',
      pilesPrevious: '',
      pilesToDate: ''
    }
    onChange({ ...pilingData, locations: [...pilingData.locations, newLocation] })
  }

  const updateLocation = (id, field, value) => {
    const updated = pilingData.locations.map(loc => {
      if (loc.id === id) {
        const newLoc = { ...loc, [field]: value }
        // Auto-calculate Piles To Date
        if (field === 'pilesToday' || field === 'pilesPrevious') {
          const today = parseFloat(field === 'pilesToday' ? value : loc.pilesToday) || 0
          const previous = parseFloat(field === 'pilesPrevious' ? value : loc.pilesPrevious) || 0
          newLoc.pilesToDate = (today + previous).toString()
        }
        return newLoc
      }
      return loc
    })
    onChange({ ...pilingData, locations: updated })
  }

  const removeLocation = (id) => {
    onChange({ ...pilingData, locations: pilingData.locations.filter(l => l.id !== id) })
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
    borderBottom: '2px solid #8B4513'
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  }

  const thStyle = {
    padding: '10px 8px',
    backgroundColor: '#8B4513',
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '12px',
    border: '1px solid #6B3000'
  }

  const tdStyle = {
    padding: '8px',
    border: '1px solid #dee2e6',
    textAlign: 'center'
  }

  const tableInputStyle = {
    width: '100%',
    padding: '6px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '13px',
    textAlign: 'center',
    boxSizing: 'border-box'
  }

  const calculatedStyle = {
    ...tableInputStyle,
    backgroundColor: '#e9ecef',
    color: '#495057',
    fontWeight: 'bold'
  }

  const radioGroupStyle = {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center'
  }

  const radioLabelStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '13px',
    cursor: 'pointer'
  }

  const verificationItems = [
    { key: 'materialTraceability', label: 'Pile material traceability has been properly recorded and filed' },
    { key: 'locationPerDrawings', label: 'Pile location in accordance with IFC drawings' },
    { key: 'clearOfFacilities', label: 'Pile location confirmed clear of under facilities prior to starting operations' },
    { key: 'plumbAndVertical', label: 'Pile is plumb and vertical axis meets specifications / IFC drawings' },
    { key: 'spliceWelding', label: 'Welding of splices has been satisfactorily completed and visually inspected' },
    { key: 'qcDocumentation', label: 'QC Documentation is complete, acceptable and properly filed' }
  ]

  return (
    <div style={{ marginTop: '15px' }}>
      {/* HEADER INFO */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🔩 PILING INFORMATION</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Report Date</label>
            <input
              type="date"
              value={pilingData.reportDate}
              onChange={(e) => updateField('reportDate', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Contractor</label>
            <input
              type="text"
              value={pilingData.contractor}
              onChange={(e) => updateField('contractor', e.target.value)}
              placeholder="Main contractor"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Foreman</label>
            <input
              type="text"
              value={pilingData.foreman}
              onChange={(e) => updateField('foreman', e.target.value)}
              placeholder="Foreman name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Piling Contractor</label>
            <input
              type="text"
              value={pilingData.pilingContractor}
              onChange={(e) => updateField('pilingContractor', e.target.value)}
              placeholder="Piling contractor"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Pile Driver Number</label>
            <input
              type="text"
              value={pilingData.pileDriverNumber}
              onChange={(e) => updateField('pileDriverNumber', e.target.value)}
              placeholder="Driver number"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* LOCATIONS TABLE */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>📍 PILING LOCATIONS</div>
          <button
            onClick={addLocation}
            style={{
              padding: '8px 16px',
              backgroundColor: '#8B4513',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            + Add Location
          </button>
        </div>

        {pilingData.locations.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            No locations added. Click "Add Location" to track piling progress.
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>Drawing No.</th>
                <th style={thStyle}>Piles Required</th>
                <th style={thStyle}>Piles Today</th>
                <th style={thStyle}>Piles Previous</th>
                <th style={thStyle}>Piles To Date</th>
                <th style={{ ...thStyle, width: '60px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {pilingData.locations.map(loc => (
                <tr key={loc.id}>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={loc.location}
                      onChange={(e) => updateLocation(loc.id, 'location', e.target.value)}
                      style={tableInputStyle}
                      placeholder="Location"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={loc.drawingNumber}
                      onChange={(e) => updateLocation(loc.id, 'drawingNumber', e.target.value)}
                      style={tableInputStyle}
                      placeholder="Drawing #"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={loc.pilesRequired}
                      onChange={(e) => updateLocation(loc.id, 'pilesRequired', e.target.value)}
                      style={tableInputStyle}
                      placeholder="0"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={loc.pilesToday}
                      onChange={(e) => updateLocation(loc.id, 'pilesToday', e.target.value)}
                      style={tableInputStyle}
                      placeholder="0"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={loc.pilesPrevious}
                      onChange={(e) => updateLocation(loc.id, 'pilesPrevious', e.target.value)}
                      style={tableInputStyle}
                      placeholder="0"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={loc.pilesToDate}
                      readOnly
                      style={calculatedStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => removeLocation(loc.id)}
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
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals */}
        {pilingData.locations.length > 0 && (
          <div style={{ marginTop: '10px', textAlign: 'right', fontSize: '13px', color: '#495057' }}>
            <strong>Totals:</strong>{' '}
            Required: {pilingData.locations.reduce((sum, l) => sum + (parseFloat(l.pilesRequired) || 0), 0)} |{' '}
            Today: {pilingData.locations.reduce((sum, l) => sum + (parseFloat(l.pilesToday) || 0), 0)} |{' '}
            To Date: {pilingData.locations.reduce((sum, l) => sum + (parseFloat(l.pilesToDate) || 0), 0)}
          </div>
        )}
      </div>

      {/* PILE DETAILS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📋 PILE DETAILS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Pile No.</label>
            <input
              type="text"
              value={pilingData.pileNo}
              onChange={(e) => updateField('pileNo', e.target.value)}
              placeholder="Pile number"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Pile Type/Size</label>
            <input
              type="text"
              value={pilingData.pileTypeSize}
              onChange={(e) => updateField('pileTypeSize', e.target.value)}
              placeholder="Type and size"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>No. of Splices</label>
            <input
              type="number"
              value={pilingData.noOfSplices}
              onChange={(e) => updateField('noOfSplices', e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Final Length (m)</label>
            <input
              type="number"
              value={pilingData.finalLength}
              onChange={(e) => updateField('finalLength', e.target.value)}
              placeholder="Length"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Hammer Type</label>
            <input
              type="text"
              value={pilingData.hammerType}
              onChange={(e) => updateField('hammerType', e.target.value)}
              placeholder="Hammer type"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Hammer Weight (kg)</label>
            <input
              type="number"
              value={pilingData.hammerWeightKg}
              onChange={(e) => updateField('hammerWeightKg', e.target.value)}
              placeholder="kg"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Drop Distance (m)</label>
            <input
              type="number"
              step="0.01"
              value={pilingData.dropDistanceM}
              onChange={(e) => updateField('dropDistanceM', e.target.value)}
              placeholder="m"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Energy/Blow (J)</label>
            <input
              type="text"
              value={pilingData.energyPerBlow ? `${pilingData.energyPerBlow} J` : ''}
              readOnly
              placeholder="Auto-calculated"
              style={{ ...inputStyle, backgroundColor: '#e9ecef', fontWeight: 'bold' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Refusal Criteria</label>
            <input
              type="text"
              value={pilingData.refusalCriteria}
              onChange={(e) => updateField('refusalCriteria', e.target.value)}
              placeholder="Criteria"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Grade Elevation</label>
            <input
              type="text"
              value={pilingData.gradeElevation}
              onChange={(e) => updateField('gradeElevation', e.target.value)}
              placeholder="Elevation"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Cut Off Elevation</label>
            <input
              type="text"
              value={pilingData.cutOffElevation}
              onChange={(e) => updateField('cutOffElevation', e.target.value)}
              placeholder="Elevation"
              style={inputStyle}
            />
          </div>
        </div>
        <p style={{ fontSize: '11px', color: '#666', marginTop: '10px', fontStyle: 'italic' }}>
          Energy/Blow (J) = Hammer Weight (kg) × Drop Distance (m) × 9.81 m/s²
        </p>
      </div>

      {/* VERIFICATION ACTIVITIES */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>✅ VERIFICATION ACTIVITIES</div>
        <table style={{ ...tableStyle, marginTop: '10px' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', width: '60%' }}>Activity</th>
              <th style={thStyle}>Yes</th>
              <th style={thStyle}>No</th>
              <th style={thStyle}>N/A</th>
            </tr>
          </thead>
          <tbody>
            {verificationItems.map(item => (
              <tr key={item.key}>
                <td style={{ ...tdStyle, textAlign: 'left', fontSize: '13px' }}>{item.label}</td>
                <td style={tdStyle}>
                  <input
                    type="radio"
                    name={item.key}
                    checked={pilingData.verifications[item.key] === 'yes'}
                    onChange={() => updateVerification(item.key, 'yes')}
                    style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="radio"
                    name={item.key}
                    checked={pilingData.verifications[item.key] === 'no'}
                    onChange={() => updateVerification(item.key, 'no')}
                    style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="radio"
                    name={item.key}
                    checked={pilingData.verifications[item.key] === 'na'}
                    onChange={() => updateVerification(item.key, 'na')}
                    style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* COMMENTS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📝 COMMENTS</div>
        <textarea
          value={pilingData.comments}
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

export default PilingLog
