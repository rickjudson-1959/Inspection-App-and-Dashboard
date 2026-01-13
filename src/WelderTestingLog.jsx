import React, { useRef } from 'react'
import { useActivityAudit } from './useActivityAudit'

function WelderTestingLog({ data, onChange, spread, weather, tempHigh, tempLow, contractor, foreman, logId, reportId }) {
  // Audit trail hook
  const { 
    initializeOriginalValues,
    initializeEntryValues,
    logFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'WelderTestingLog')
  
  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure
  const defaultData = {
    reportDate: '',
    testLocation: '',
    startTime: '',
    stopTime: '',
    
    // Welder test entries (repeatable)
    welderTests: []
  }

  // Merge incoming data with defaults
  const testingData = {
    ...defaultData,
    ...data,
    welderTests: data?.welderTests || []
  }

  const updateField = (field, value) => {
    onChange({ ...testingData, [field]: value })
  }

  // Audit-aware field handlers
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

  const addWelderTest = () => {
    const newTest = {
      id: Date.now(),
      welderName: '',
      welderProjectId: '',
      testDate: '',
      testMaterial: '',
      passFail: '',
      repairTestDate: '',
      repairsPassFail: '',
      wallThicknessDiameter: '',
      welderAbsaNo: '',
      weldProcedure: ''
    }
    onChange({ ...testingData, welderTests: [...testingData.welderTests, newTest] })
    logEntryAdd('Welder Test', `Entry #${testingData.welderTests.length + 1}`)
  }

  const updateWelderTest = (id, field, value) => {
    const updated = testingData.welderTests.map(test => {
      if (test.id === id) {
        return { ...test, [field]: value }
      }
      return test
    })
    onChange({ ...testingData, welderTests: updated })
  }

  const removeWelderTest = (id) => {
    const testToRemove = testingData.welderTests.find(t => t.id === id)
    const testIndex = testingData.welderTests.findIndex(t => t.id === id)
    const testLabel = testToRemove?.welderName || `Entry #${testIndex + 1}`
    
    onChange({ ...testingData, welderTests: testingData.welderTests.filter(t => t.id !== id) })
    logEntryDelete('Welder Test', testLabel)
  }

  // Get entry label for audit trail
  const getEntryLabel = (test, index) => {
    return test.welderName || `Welder #${index + 1}`
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

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px'
  }

  const thStyle = {
    padding: '8px 4px',
    backgroundColor: '#6f42c1',
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '11px',
    border: '1px solid #5a32a3'
  }

  const tdStyle = {
    padding: '6px 4px',
    border: '1px solid #dee2e6',
    textAlign: 'center',
    verticalAlign: 'middle'
  }

  const tableInputStyle = {
    width: '100%',
    padding: '5px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '12px',
    textAlign: 'center',
    boxSizing: 'border-box'
  }

  const selectStyle = {
    ...tableInputStyle,
    cursor: 'pointer'
  }

  const passStyle = {
    ...selectStyle,
    backgroundColor: '#d4edda',
    color: '#155724',
    fontWeight: 'bold'
  }

  const failStyle = {
    ...selectStyle,
    backgroundColor: '#f8d7da',
    color: '#721c24',
    fontWeight: 'bold'
  }

  const getPassFailStyle = (value) => {
    if (value === 'Pass') return passStyle
    if (value === 'Fail') return failStyle
    return selectStyle
  }

  return (
    <div style={{ marginTop: '15px' }}>
      {/* HEADER INFO - Shows inherited values + test-specific fields */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🔧 WELDER TESTING LOG</div>
        
        {/* Inherited values display */}
        <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e7f3ff', borderRadius: '4px', fontSize: '13px' }}>
          <strong>From Daily Report:</strong>{' '}
          Spread: <strong>{spread || '-'}</strong> |{' '}
          Weather: <strong>{weather || '-'}</strong> |{' '}
          Temp: <strong>{tempHigh || '-'}°C / {tempLow || '-'}°C</strong> |{' '}
          Contractor: <strong>{contractor || '-'}</strong> |{' '}
          Foreman: <strong>{foreman || '-'}</strong>
        </div>

        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Test Date</label>
            <input
              type="date"
              value={testingData.reportDate}
              onFocus={() => handleFieldFocus('reportDate', testingData.reportDate)}
              onChange={(e) => updateField('reportDate', e.target.value)}
              onBlur={(e) => handleFieldBlur('reportDate', e.target.value, 'Test Date')}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Test Location</label>
            <input
              type="text"
              value={testingData.testLocation}
              onFocus={() => handleFieldFocus('testLocation', testingData.testLocation)}
              onChange={(e) => updateField('testLocation', e.target.value)}
              onBlur={(e) => handleFieldBlur('testLocation', e.target.value, 'Test Location')}
              placeholder="Location"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Start Time</label>
            <input
              type="time"
              value={testingData.startTime}
              onFocus={() => handleFieldFocus('startTime', testingData.startTime)}
              onChange={(e) => updateField('startTime', e.target.value)}
              onBlur={(e) => handleFieldBlur('startTime', e.target.value, 'Start Time')}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Stop Time</label>
            <input
              type="time"
              value={testingData.stopTime}
              onFocus={() => handleFieldFocus('stopTime', testingData.stopTime)}
              onChange={(e) => updateField('stopTime', e.target.value)}
              onBlur={(e) => handleFieldBlur('stopTime', e.target.value, 'Stop Time')}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* WELDER TESTS TABLE */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>👷 WELDER TESTS</div>
          <button
            onClick={addWelderTest}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6f42c1',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            + Add Welder
          </button>
        </div>

        {testingData.welderTests.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            No welder tests logged. Click "Add Welder" to record test results.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Welder Name</th>
                  <th style={thStyle}>Project I.D. No.</th>
                  <th style={{ ...thStyle, width: '90px' }}>Test Date</th>
                  <th style={thStyle}>Test Material</th>
                  <th style={{ ...thStyle, width: '70px' }}>Pass/Fail</th>
                  <th style={{ ...thStyle, width: '90px' }}>Repair Test Date</th>
                  <th style={{ ...thStyle, width: '70px' }}>Repairs Pass/Fail</th>
                  <th style={thStyle}>Wall Thickness & Diameter</th>
                  <th style={thStyle}>ABSA No.</th>
                  <th style={thStyle}>Weld Procedure</th>
                  <th style={{ ...thStyle, width: '45px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {testingData.welderTests.map((test, index) => (
                  <tr key={test.id}>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={test.welderName}
                        onFocus={() => handleEntryFieldFocus(test.id, 'welderName', test.welderName)}
                        onChange={(e) => updateWelderTest(test.id, 'welderName', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(test.id, 'welderName', e.target.value, 'Welder Name', getEntryLabel(test, index))}
                        style={tableInputStyle}
                        placeholder="Name"
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={test.welderProjectId}
                        onFocus={() => handleEntryFieldFocus(test.id, 'welderProjectId', test.welderProjectId)}
                        onChange={(e) => updateWelderTest(test.id, 'welderProjectId', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(test.id, 'welderProjectId', e.target.value, 'Project ID', getEntryLabel(test, index))}
                        style={tableInputStyle}
                        placeholder="ID No."
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="date"
                        value={test.testDate}
                        onFocus={() => handleEntryFieldFocus(test.id, 'testDate', test.testDate)}
                        onChange={(e) => updateWelderTest(test.id, 'testDate', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(test.id, 'testDate', e.target.value, 'Test Date', getEntryLabel(test, index))}
                        style={tableInputStyle}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={test.testMaterial}
                        onFocus={() => handleEntryFieldFocus(test.id, 'testMaterial', test.testMaterial)}
                        onChange={(e) => updateWelderTest(test.id, 'testMaterial', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(test.id, 'testMaterial', e.target.value, 'Test Material', getEntryLabel(test, index))}
                        style={tableInputStyle}
                        placeholder="Material"
                      />
                    </td>
                    <td style={tdStyle}>
                      <select
                        value={test.passFail}
                        onFocus={() => handleEntryFieldFocus(test.id, 'passFail', test.passFail)}
                        onChange={(e) => {
                          updateWelderTest(test.id, 'passFail', e.target.value)
                          handleEntryFieldBlur(test.id, 'passFail', e.target.value, 'Pass/Fail', getEntryLabel(test, index))
                        }}
                        style={getPassFailStyle(test.passFail)}
                      >
                        <option value="">-</option>
                        <option value="Pass">Pass</option>
                        <option value="Fail">Fail</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="date"
                        value={test.repairTestDate}
                        onFocus={() => handleEntryFieldFocus(test.id, 'repairTestDate', test.repairTestDate)}
                        onChange={(e) => updateWelderTest(test.id, 'repairTestDate', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(test.id, 'repairTestDate', e.target.value, 'Repair Test Date', getEntryLabel(test, index))}
                        style={tableInputStyle}
                      />
                    </td>
                    <td style={tdStyle}>
                      <select
                        value={test.repairsPassFail}
                        onFocus={() => handleEntryFieldFocus(test.id, 'repairsPassFail', test.repairsPassFail)}
                        onChange={(e) => {
                          updateWelderTest(test.id, 'repairsPassFail', e.target.value)
                          handleEntryFieldBlur(test.id, 'repairsPassFail', e.target.value, 'Repairs Pass/Fail', getEntryLabel(test, index))
                        }}
                        style={getPassFailStyle(test.repairsPassFail)}
                      >
                        <option value="">-</option>
                        <option value="Pass">Pass</option>
                        <option value="Fail">Fail</option>
                        <option value="N/A">N/A</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={test.wallThicknessDiameter}
                        onFocus={() => handleEntryFieldFocus(test.id, 'wallThicknessDiameter', test.wallThicknessDiameter)}
                        onChange={(e) => updateWelderTest(test.id, 'wallThicknessDiameter', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(test.id, 'wallThicknessDiameter', e.target.value, 'Wall Thickness & Diameter', getEntryLabel(test, index))}
                        style={tableInputStyle}
                        placeholder="e.g. 12.7mm x 24in"
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={test.welderAbsaNo}
                        onFocus={() => handleEntryFieldFocus(test.id, 'welderAbsaNo', test.welderAbsaNo)}
                        onChange={(e) => updateWelderTest(test.id, 'welderAbsaNo', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(test.id, 'welderAbsaNo', e.target.value, 'ABSA No.', getEntryLabel(test, index))}
                        style={tableInputStyle}
                        placeholder="ABSA No."
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={test.weldProcedure}
                        onFocus={() => handleEntryFieldFocus(test.id, 'weldProcedure', test.weldProcedure)}
                        onChange={(e) => updateWelderTest(test.id, 'weldProcedure', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(test.id, 'weldProcedure', e.target.value, 'Weld Procedure', getEntryLabel(test, index))}
                        style={tableInputStyle}
                        placeholder="Procedure"
                      />
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => removeWelderTest(test.id)}
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
        {testingData.welderTests.length > 0 && (
          <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px', fontSize: '13px' }}>
            <strong>Summary:</strong>{' '}
            <span style={{ color: '#155724' }}>✓ Passed: {testingData.welderTests.filter(t => t.passFail === 'Pass').length}</span>{' | '}
            <span style={{ color: '#721c24' }}>✗ Failed: {testingData.welderTests.filter(t => t.passFail === 'Fail').length}</span>{' | '}
            <span>Pending: {testingData.welderTests.filter(t => !t.passFail).length}</span>{' | '}
            <strong>Total Welders Tested: {testingData.welderTests.length}</strong>
          </div>
        )}
      </div>
    </div>
  )
}

export default WelderTestingLog
