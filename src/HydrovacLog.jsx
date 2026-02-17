import React, { useRef } from 'react'
import { useActivityAudit } from './useActivityAudit'

function HydrovacLog({ data, onChange, logId, reportId }) {
  // Audit trail hook
  const { 
    initializeOriginalValues,
    initializeEntryValues,
    logFieldChange,
    logNestedFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'HydrovacLog')
  
  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const nestedValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure
  const defaultData = {
    reportDate: '',
    contractor: '',
    foreman: '',
    
    // Holes summary
    holes: {
      parallelToday: '',
      parallelPrevious: '',
      parallelToDate: '',
      crossingToday: '',
      crossingPrevious: '',
      crossingToDate: '',
      totalToday: '',
      totalPrevious: '',
      totalToDate: ''
    },
    
    // Facility entries (repeatable)
    facilities: []
  }

  // Merge incoming data with defaults
  const hydrovacData = {
    ...defaultData,
    ...data,
    holes: {
      ...defaultData.holes,
      ...(data?.holes || {})
    },
    facilities: data?.facilities || []
  }

  const updateField = (field, value) => {
    onChange({ ...hydrovacData, [field]: value })
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

  const updateHoles = (field, value) => {
    const updated = {
      ...hydrovacData,
      holes: {
        ...hydrovacData.holes,
        [field]: value
      }
    }
    
    // Auto-calculate To Date values
    const holes = updated.holes
    
    // Parallel To Date
    if (field === 'parallelToday' || field === 'parallelPrevious') {
      const today = parseFloat(field === 'parallelToday' ? value : holes.parallelToday) || 0
      const previous = parseFloat(field === 'parallelPrevious' ? value : holes.parallelPrevious) || 0
      updated.holes.parallelToDate = (today + previous).toString()
    }
    
    // Crossing To Date
    if (field === 'crossingToday' || field === 'crossingPrevious') {
      const today = parseFloat(field === 'crossingToday' ? value : holes.crossingToday) || 0
      const previous = parseFloat(field === 'crossingPrevious' ? value : holes.crossingPrevious) || 0
      updated.holes.crossingToDate = (today + previous).toString()
    }
    
    // Recalculate totals
    const pToday = parseFloat(updated.holes.parallelToday) || 0
    const pPrevious = parseFloat(updated.holes.parallelPrevious) || 0
    const cToday = parseFloat(updated.holes.crossingToday) || 0
    const cPrevious = parseFloat(updated.holes.crossingPrevious) || 0
    
    updated.holes.totalToday = (pToday + cToday).toString()
    updated.holes.totalPrevious = (pPrevious + cPrevious).toString()
    updated.holes.totalToDate = (pToday + pPrevious + cToday + cPrevious).toString()
    
    onChange(updated)
  }

  const addFacility = () => {
    const newFacility = {
      id: Date.now(),
      station: '',
      owner: '',
      px: '',
      facilityType: '',
      depthM: '',
      boundary: '',
      gpsCoordinates: '',
      comments: ''
    }
    onChange({ ...hydrovacData, facilities: [...hydrovacData.facilities, newFacility] })
    logEntryAdd('Facility', `Entry #${hydrovacData.facilities.length + 1}`)
  }

  const updateFacility = (id, field, value) => {
    const updated = hydrovacData.facilities.map(fac => {
      if (fac.id === id) {
        return { ...fac, [field]: value }
      }
      return fac
    })
    onChange({ ...hydrovacData, facilities: updated })
  }

  const removeFacility = (id) => {
    const facilityToRemove = hydrovacData.facilities.find(f => f.id === id)
    const facilityIndex = hydrovacData.facilities.findIndex(f => f.id === id)
    const facilityLabel = facilityToRemove?.station || `Entry #${facilityIndex + 1}`
    
    onChange({ ...hydrovacData, facilities: hydrovacData.facilities.filter(f => f.id !== id) })
    logEntryDelete('Facility', facilityLabel)
  }

  // Get entry label for audit trail
  const getEntryLabel = (facility, index) => {
    return facility.station || `Facility #${index + 1}`
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
    backgroundColor: '#fd7e14',
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '12px',
    border: '1px solid #e56b0a'
  }

  const tdStyle = {
    padding: '8px',
    border: '1px solid #dee2e6',
    textAlign: 'center'
  }

  const tdLabelStyle = {
    ...tdStyle,
    textAlign: 'left',
    fontWeight: 'bold',
    backgroundColor: '#f8f9fa'
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

  const selectStyle = {
    ...tableInputStyle,
    cursor: 'pointer'
  }

  return (
    <div style={{ marginTop: '15px' }}>
      {/* HEADER INFO */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', marginBottom: '15px', paddingBottom: '8px', borderBottom: '2px solid #fd7e14' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#495057', whiteSpace: 'nowrap' }}>🚜 HYDROVAC INFORMATION</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '180px' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#666', whiteSpace: 'nowrap' }}>Hydrovac Contractor:</label>
            <input
              type="text"
              value={hydrovacData.contractor}
              onFocus={() => handleFieldFocus('contractor', hydrovacData.contractor)}
              onChange={(e) => updateField('contractor', e.target.value)}
              onBlur={(e) => handleFieldBlur('contractor', e.target.value, 'Hydrovac Contractor')}
              placeholder="Contractor name"
              style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: '13px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '180px' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#666', whiteSpace: 'nowrap' }}>Hydrovac Foreman:</label>
            <input
              type="text"
              value={hydrovacData.foreman}
              onFocus={() => handleFieldFocus('foreman', hydrovacData.foreman)}
              onChange={(e) => updateField('foreman', e.target.value)}
              onBlur={(e) => handleFieldBlur('foreman', e.target.value, 'Hydrovac Foreman')}
              placeholder="Foreman name"
              style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: '13px' }}
            />
          </div>
        </div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={hydrovacData.reportDate}
              onFocus={() => handleFieldFocus('reportDate', hydrovacData.reportDate)}
              onChange={(e) => updateField('reportDate', e.target.value)}
              onBlur={(e) => handleFieldBlur('reportDate', e.target.value, 'Report Date')}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* HOLES SUMMARY TABLE */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📊 HOLES SUMMARY</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '25%' }}>Holes</th>
              <th style={thStyle}>Today</th>
              <th style={thStyle}>Previous</th>
              <th style={thStyle}>To Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdLabelStyle}>Parallel</td>
              <td style={tdStyle}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={hydrovacData.holes.parallelToday}
                  onFocus={() => handleNestedFieldFocus('holes', 'parallelToday', hydrovacData.holes.parallelToday)}
                  onChange={(e) => updateHoles('parallelToday', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('holes', 'parallelToday', e.target.value, 'Parallel Today')}
                  style={tableInputStyle}
                  placeholder="0"
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={hydrovacData.holes.parallelPrevious}
                  onFocus={() => handleNestedFieldFocus('holes', 'parallelPrevious', hydrovacData.holes.parallelPrevious)}
                  onChange={(e) => updateHoles('parallelPrevious', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('holes', 'parallelPrevious', e.target.value, 'Parallel Previous')}
                  style={tableInputStyle}
                  placeholder="0"
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  value={hydrovacData.holes.parallelToDate}
                  readOnly
                  style={calculatedStyle}
                />
              </td>
            </tr>
            <tr>
              <td style={tdLabelStyle}>Crossing</td>
              <td style={tdStyle}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={hydrovacData.holes.crossingToday}
                  onFocus={() => handleNestedFieldFocus('holes', 'crossingToday', hydrovacData.holes.crossingToday)}
                  onChange={(e) => updateHoles('crossingToday', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('holes', 'crossingToday', e.target.value, 'Crossing Today')}
                  style={tableInputStyle}
                  placeholder="0"
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={hydrovacData.holes.crossingPrevious}
                  onFocus={() => handleNestedFieldFocus('holes', 'crossingPrevious', hydrovacData.holes.crossingPrevious)}
                  onChange={(e) => updateHoles('crossingPrevious', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('holes', 'crossingPrevious', e.target.value, 'Crossing Previous')}
                  style={tableInputStyle}
                  placeholder="0"
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  value={hydrovacData.holes.crossingToDate}
                  readOnly
                  style={calculatedStyle}
                />
              </td>
            </tr>
            <tr style={{ backgroundColor: '#fff3cd' }}>
              <td style={{ ...tdLabelStyle, fontWeight: 'bold', backgroundColor: '#fff3cd' }}>Total</td>
              <td style={tdStyle}>
                <input
                  type="text"
                  value={hydrovacData.holes.totalToday}
                  readOnly
                  style={{ ...calculatedStyle, backgroundColor: '#fff3cd' }}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  value={hydrovacData.holes.totalPrevious}
                  readOnly
                  style={{ ...calculatedStyle, backgroundColor: '#fff3cd' }}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  value={hydrovacData.holes.totalToDate}
                  readOnly
                  style={{ ...calculatedStyle, backgroundColor: '#fff3cd', fontWeight: 'bold' }}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* REFERENCE LEGEND */}
      <div style={{ ...sectionStyle, backgroundColor: '#e7f3ff', borderColor: '#007bff' }}>
        <div style={{ ...sectionHeaderStyle, borderBottomColor: '#007bff' }}>ℹ️ REFERENCE LEGEND</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', fontSize: '13px' }}>
          <div>
            <strong style={{ color: '#004085' }}>Parallel/Crossing:</strong>
            <div style={{ marginTop: '5px', paddingLeft: '10px' }}>
              <div><strong>P</strong> = Parallel</div>
              <div><strong>X</strong> = Crossing</div>
            </div>
          </div>
          <div>
            <strong style={{ color: '#004085' }}>Boundary:</strong>
            <div style={{ marginTop: '5px', paddingLeft: '10px' }}>
              <div><strong>N</strong> = North</div>
              <div><strong>S</strong> = South</div>
              <div><strong>E</strong> = East</div>
              <div><strong>W</strong> = West</div>
            </div>
          </div>
          <div>
            <strong style={{ color: '#004085' }}>Type:</strong>
            <div style={{ marginTop: '5px', paddingLeft: '10px' }}>
              <div><strong>PP</strong> = Plastic Pipe</div>
              <div><strong>SP</strong> = Steel Pipe</div>
              <div><strong>C</strong> = Cable</div>
            </div>
          </div>
        </div>
      </div>

      {/* FACILITY DETAILS TABLE */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>📍 FACILITY DETAILS</div>
          <button
            onClick={addFacility}
            style={{
              padding: '8px 16px',
              backgroundColor: '#fd7e14',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            + Add Facility
          </button>
        </div>

        {hydrovacData.facilities.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            No facilities logged. Click "Add Facility" to record excavation details.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Station</th>
                  <th style={thStyle}>Owner</th>
                  <th style={{ ...thStyle, width: '70px' }}>P/X</th>
                  <th style={thStyle}>Facility Type</th>
                  <th style={{ ...thStyle, width: '80px' }}>Depth (m)</th>
                  <th style={{ ...thStyle, width: '80px' }}>Boundary</th>
                  <th style={thStyle}>GPS Coordinates</th>
                  <th style={thStyle}>Comments</th>
                  <th style={{ ...thStyle, width: '50px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {hydrovacData.facilities.map((fac, index) => (
                  <tr key={fac.id}>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={fac.station}
                        onFocus={() => handleEntryFieldFocus(fac.id, 'station', fac.station)}
                        onChange={(e) => updateFacility(fac.id, 'station', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(fac.id, 'station', e.target.value, 'Station', getEntryLabel(fac, index))}
                        style={tableInputStyle}
                        placeholder="Station"
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={fac.owner}
                        onFocus={() => handleEntryFieldFocus(fac.id, 'owner', fac.owner)}
                        onChange={(e) => updateFacility(fac.id, 'owner', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(fac.id, 'owner', e.target.value, 'Owner', getEntryLabel(fac, index))}
                        style={tableInputStyle}
                        placeholder="Owner"
                      />
                    </td>
                    <td style={tdStyle}>
                      <select
                        value={fac.px}
                        onFocus={() => handleEntryFieldFocus(fac.id, 'px', fac.px)}
                        onChange={(e) => {
                          updateFacility(fac.id, 'px', e.target.value)
                          handleEntryFieldBlur(fac.id, 'px', e.target.value, 'P/X', getEntryLabel(fac, index))
                        }}
                        style={selectStyle}
                      >
                        <option value="">-</option>
                        <option value="P">P</option>
                        <option value="X">X</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <select
                        value={fac.facilityType}
                        onFocus={() => handleEntryFieldFocus(fac.id, 'facilityType', fac.facilityType)}
                        onChange={(e) => {
                          updateFacility(fac.id, 'facilityType', e.target.value)
                          handleEntryFieldBlur(fac.id, 'facilityType', e.target.value, 'Facility Type', getEntryLabel(fac, index))
                        }}
                        style={selectStyle}
                      >
                        <option value="">Select...</option>
                        <option value="PP">PP - Plastic Pipe</option>
                        <option value="SP">SP - Steel Pipe</option>
                        <option value="C">C - Cable</option>
                        <option value="Other">Other</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fac.depthM}
                        onFocus={() => handleEntryFieldFocus(fac.id, 'depthM', fac.depthM)}
                        onChange={(e) => updateFacility(fac.id, 'depthM', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(fac.id, 'depthM', e.target.value, 'Depth (m)', getEntryLabel(fac, index))}
                        style={tableInputStyle}
                        placeholder="m"
                      />
                    </td>
                    <td style={tdStyle}>
                      <select
                        value={fac.boundary}
                        onFocus={() => handleEntryFieldFocus(fac.id, 'boundary', fac.boundary)}
                        onChange={(e) => {
                          updateFacility(fac.id, 'boundary', e.target.value)
                          handleEntryFieldBlur(fac.id, 'boundary', e.target.value, 'Boundary', getEntryLabel(fac, index))
                        }}
                        style={selectStyle}
                      >
                        <option value="">-</option>
                        <option value="N">N</option>
                        <option value="S">S</option>
                        <option value="E">E</option>
                        <option value="W">W</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={fac.gpsCoordinates}
                        onFocus={() => handleEntryFieldFocus(fac.id, 'gpsCoordinates', fac.gpsCoordinates)}
                        onChange={(e) => updateFacility(fac.id, 'gpsCoordinates', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(fac.id, 'gpsCoordinates', e.target.value, 'GPS Coordinates', getEntryLabel(fac, index))}
                        style={tableInputStyle}
                        placeholder="GPS coords"
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={fac.comments}
                        onFocus={() => handleEntryFieldFocus(fac.id, 'comments', fac.comments)}
                        onChange={(e) => updateFacility(fac.id, 'comments', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(fac.id, 'comments', e.target.value, 'Comments', getEntryLabel(fac, index))}
                        style={tableInputStyle}
                        placeholder="Comments"
                      />
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => removeFacility(fac.id)}
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
          </div>
        )}

        {/* Summary */}
        {hydrovacData.facilities.length > 0 && (
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#495057' }}>
            <strong>Summary:</strong>{' '}
            Parallel: {hydrovacData.facilities.filter(f => f.px === 'P').length} |{' '}
            Crossing: {hydrovacData.facilities.filter(f => f.px === 'X').length} |{' '}
            <strong>Total Facilities: {hydrovacData.facilities.length}</strong>
          </div>
        )}
      </div>
    </div>
  )
}

export default HydrovacLog
