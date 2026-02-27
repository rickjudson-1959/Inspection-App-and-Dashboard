import React, { useRef } from 'react'
import ShieldedInput from './components/common/ShieldedInput.jsx'
import { useActivityAudit } from './useActivityAudit'

function HydrotestLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, metersToday, logId, reportId }) {
  // Audit trail hook
  const {
    initializeOriginalValues,
    initializeEntryValues,
    logFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'HydrotestLog')

  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure
  const defaultData = {
    // Test Identification
    testSection: '',
    testMedium: '',
    testType: '',

    // Pressure Parameters
    designPressure: '',
    testPressure: '',
    startPressure: '',
    finalPressure: '',
    pressureDropPSI: '',
    maxAllowableDrop: '',

    // Duration & Timeline
    holdTime: '',
    fillStartTime: '',
    fillEndTime: '',
    testStartTime: '',
    testEndTime: '',

    // Water Management
    waterSource: '',
    waterVolume: '',
    waterDischargeLocation: '',
    waterDischargePermit: '',
    waterTemperature: '',

    // Instrumentation
    gaugeId: '',
    recorderType: '',
    calibrationDate: '',
    calibrationCertificate: '',

    // Pressure Readings (repeatable)
    pressureReadings: [],

    // Personnel
    testEngineer: '',
    testWitness: '',
    witnessCompany: '',

    // Test Result
    testResult: '',
    failureReason: '',
    leaksFound: '',
    leakLocation: '',
    leakRepairMethod: '',

    // Sign-Off
    ncrRequired: '',
    comments: ''
  }

  // Merge incoming data with defaults
  const hydrotestData = {
    ...defaultData,
    ...data,
    pressureReadings: data?.pressureReadings || []
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

  const updateField = (field, value) => {
    const updated = { ...hydrotestData, [field]: value }

    // Auto-calculate pressureDropPSI when start/final pressures change
    if (field === 'startPressure' || field === 'finalPressure') {
      const start = parseFloat(field === 'startPressure' ? value : hydrotestData.startPressure) || 0
      const final_ = parseFloat(field === 'finalPressure' ? value : hydrotestData.finalPressure) || 0
      if (start > 0 && final_ > 0) {
        updated.pressureDropPSI = ((start - final_) * 0.145038).toFixed(2)
      } else {
        updated.pressureDropPSI = ''
      }
    }

    onChange(updated)
  }

  // Pressure Readings table handlers
  const addReading = () => {
    const newReading = {
      id: Date.now(),
      time: '',
      pressure: '',
      temperature: '',
      notes: ''
    }
    onChange({ ...hydrotestData, pressureReadings: [...hydrotestData.pressureReadings, newReading] })
    logEntryAdd('Pressure Reading', `Reading #${hydrotestData.pressureReadings.length + 1}`)
  }

  const updateReading = (id, field, value) => {
    const updated = hydrotestData.pressureReadings.map(r =>
      r.id === id ? { ...r, [field]: value } : r
    )
    onChange({ ...hydrotestData, pressureReadings: updated })
  }

  const removeReading = (id) => {
    const readingIndex = hydrotestData.pressureReadings.findIndex(r => r.id === id)
    const reading = hydrotestData.pressureReadings[readingIndex]
    const label = reading?.time || `Reading #${readingIndex + 1}`
    onChange({ ...hydrotestData, pressureReadings: hydrotestData.pressureReadings.filter(r => r.id !== id) })
    logEntryDelete('Pressure Reading', label)
  }

  const getReadingLabel = (reading, index) => {
    return reading.time || `Reading #${index + 1}`
  }

  // Theme color: indigo
  const themeColor = '#3f51b5'

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
    borderBottom: `2px solid ${themeColor}`
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px'
  }

  const grid2Style = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
    backgroundColor: 'white'
  }

  const readOnlyStyle = {
    ...inputStyle,
    backgroundColor: '#e9ecef',
    fontWeight: 'bold'
  }

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  }

  const thStyle = {
    padding: '10px 8px',
    backgroundColor: themeColor,
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '12px',
    border: `1px solid ${themeColor}`
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

  // Result banner colors
  const getResultBanner = () => {
    if (!hydrotestData.testResult) return null
    const colors = {
      Pass: { bg: '#d4edda', border: '#28a745', text: '#155724' },
      Fail: { bg: '#f8d7da', border: '#dc3545', text: '#721c24' },
      Pending: { bg: '#fff3cd', border: '#ffc107', text: '#856404' }
    }
    return colors[hydrotestData.testResult] || null
  }

  return (
    <div style={{ marginTop: '15px' }}>
      {/* 1. TEST IDENTIFICATION */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🔬 TEST IDENTIFICATION</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Test Section</label>
            <ShieldedInput
              value={hydrotestData.testSection}
              onFocus={() => handleFieldFocus('testSection', hydrotestData.testSection)}
              onChange={(val) => updateField('testSection', val)}
              onBlur={(e) => handleFieldBlur('testSection', e.target.value, 'Test Section')}
              placeholder="Pipeline section description"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Test Medium</label>
            <select
              value={hydrotestData.testMedium}
              onFocus={() => handleFieldFocus('testMedium', hydrotestData.testMedium)}
              onChange={(e) => updateField('testMedium', e.target.value)}
              onBlur={(e) => handleFieldBlur('testMedium', e.target.value, 'Test Medium')}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Water">Water</option>
              <option value="Air">Air</option>
              <option value="Nitrogen">Nitrogen</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Test Type</label>
            <select
              value={hydrotestData.testType}
              onFocus={() => handleFieldFocus('testType', hydrotestData.testType)}
              onChange={(e) => updateField('testType', e.target.value)}
              onBlur={(e) => handleFieldBlur('testType', e.target.value, 'Test Type')}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Strength">Strength</option>
              <option value="Leak">Leak</option>
              <option value="Combined">Combined</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. PRESSURE PARAMETERS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📊 PRESSURE PARAMETERS</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Design Pressure (kPa)</label>
            <ShieldedInput
              type="number"
              inputMode="decimal"
              value={hydrotestData.designPressure}
              onFocus={() => handleFieldFocus('designPressure', hydrotestData.designPressure)}
              onChange={(val) => updateField('designPressure', val)}
              onBlur={(e) => handleFieldBlur('designPressure', e.target.value, 'Design Pressure')}
              placeholder="kPa"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Test Pressure (kPa)</label>
            <ShieldedInput
              type="number"
              inputMode="decimal"
              value={hydrotestData.testPressure}
              onFocus={() => handleFieldFocus('testPressure', hydrotestData.testPressure)}
              onChange={(val) => updateField('testPressure', val)}
              onBlur={(e) => handleFieldBlur('testPressure', e.target.value, 'Test Pressure')}
              placeholder="kPa"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Start Pressure (kPa)</label>
            <ShieldedInput
              type="number"
              inputMode="decimal"
              value={hydrotestData.startPressure}
              onFocus={() => handleFieldFocus('startPressure', hydrotestData.startPressure)}
              onChange={(val) => updateField('startPressure', val)}
              onBlur={(e) => handleFieldBlur('startPressure', e.target.value, 'Start Pressure')}
              placeholder="kPa"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Final Pressure (kPa)</label>
            <ShieldedInput
              type="number"
              inputMode="decimal"
              value={hydrotestData.finalPressure}
              onFocus={() => handleFieldFocus('finalPressure', hydrotestData.finalPressure)}
              onChange={(val) => updateField('finalPressure', val)}
              onBlur={(e) => handleFieldBlur('finalPressure', e.target.value, 'Final Pressure')}
              placeholder="kPa"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Pressure Drop (PSI)</label>
            <input
              type="text"
              value={hydrotestData.pressureDropPSI ? `${hydrotestData.pressureDropPSI} PSI` : ''}
              readOnly
              placeholder="Auto-calculated"
              style={readOnlyStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Max Allowable Drop (PSI)</label>
            <ShieldedInput
              type="number"
              inputMode="decimal"
              value={hydrotestData.maxAllowableDrop}
              onFocus={() => handleFieldFocus('maxAllowableDrop', hydrotestData.maxAllowableDrop)}
              onChange={(val) => updateField('maxAllowableDrop', val)}
              onBlur={(e) => handleFieldBlur('maxAllowableDrop', e.target.value, 'Max Allowable Drop')}
              placeholder="PSI"
              style={inputStyle}
            />
          </div>
        </div>
        <p style={{ fontSize: '11px', color: '#666', marginTop: '10px', fontStyle: 'italic' }}>
          Pressure Drop (PSI) = (Start Pressure - Final Pressure) x 0.145038 (kPa to PSI)
        </p>
      </div>

      {/* 3. DURATION & TIMELINE */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>⏱ DURATION & TIMELINE</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Hold Time (hours)</label>
            <ShieldedInput
              type="number"
              inputMode="decimal"
              value={hydrotestData.holdTime}
              onFocus={() => handleFieldFocus('holdTime', hydrotestData.holdTime)}
              onChange={(val) => updateField('holdTime', val)}
              onBlur={(e) => handleFieldBlur('holdTime', e.target.value, 'Hold Time')}
              placeholder="Hours"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Fill Start Time</label>
            <input
              type="time"
              value={hydrotestData.fillStartTime}
              onFocus={() => handleFieldFocus('fillStartTime', hydrotestData.fillStartTime)}
              onChange={(e) => updateField('fillStartTime', e.target.value)}
              onBlur={(e) => handleFieldBlur('fillStartTime', e.target.value, 'Fill Start Time')}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Fill End Time</label>
            <input
              type="time"
              value={hydrotestData.fillEndTime}
              onFocus={() => handleFieldFocus('fillEndTime', hydrotestData.fillEndTime)}
              onChange={(e) => updateField('fillEndTime', e.target.value)}
              onBlur={(e) => handleFieldBlur('fillEndTime', e.target.value, 'Fill End Time')}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Test Start Time</label>
            <input
              type="time"
              value={hydrotestData.testStartTime}
              onFocus={() => handleFieldFocus('testStartTime', hydrotestData.testStartTime)}
              onChange={(e) => updateField('testStartTime', e.target.value)}
              onBlur={(e) => handleFieldBlur('testStartTime', e.target.value, 'Test Start Time')}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Test End Time</label>
            <input
              type="time"
              value={hydrotestData.testEndTime}
              onFocus={() => handleFieldFocus('testEndTime', hydrotestData.testEndTime)}
              onChange={(e) => updateField('testEndTime', e.target.value)}
              onBlur={(e) => handleFieldBlur('testEndTime', e.target.value, 'Test End Time')}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* 4. WATER MANAGEMENT */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>💧 WATER MANAGEMENT</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Water Source</label>
            <ShieldedInput
              value={hydrotestData.waterSource}
              onFocus={() => handleFieldFocus('waterSource', hydrotestData.waterSource)}
              onChange={(val) => updateField('waterSource', val)}
              onBlur={(e) => handleFieldBlur('waterSource', e.target.value, 'Water Source')}
              placeholder="Source location"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Water Volume (m3)</label>
            <ShieldedInput
              type="number"
              inputMode="decimal"
              value={hydrotestData.waterVolume}
              onFocus={() => handleFieldFocus('waterVolume', hydrotestData.waterVolume)}
              onChange={(val) => updateField('waterVolume', val)}
              onBlur={(e) => handleFieldBlur('waterVolume', e.target.value, 'Water Volume')}
              placeholder="m3"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Discharge Location</label>
            <ShieldedInput
              value={hydrotestData.waterDischargeLocation}
              onFocus={() => handleFieldFocus('waterDischargeLocation', hydrotestData.waterDischargeLocation)}
              onChange={(val) => updateField('waterDischargeLocation', val)}
              onBlur={(e) => handleFieldBlur('waterDischargeLocation', e.target.value, 'Discharge Location')}
              placeholder="Discharge point"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Discharge Permit</label>
            <ShieldedInput
              value={hydrotestData.waterDischargePermit}
              onFocus={() => handleFieldFocus('waterDischargePermit', hydrotestData.waterDischargePermit)}
              onChange={(val) => updateField('waterDischargePermit', val)}
              onBlur={(e) => handleFieldBlur('waterDischargePermit', e.target.value, 'Discharge Permit')}
              placeholder="Permit number"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Water Temperature (C)</label>
            <ShieldedInput
              type="number"
              inputMode="decimal"
              value={hydrotestData.waterTemperature}
              onFocus={() => handleFieldFocus('waterTemperature', hydrotestData.waterTemperature)}
              onChange={(val) => updateField('waterTemperature', val)}
              onBlur={(e) => handleFieldBlur('waterTemperature', e.target.value, 'Water Temperature')}
              placeholder="C"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* 5. INSTRUMENTATION */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🔧 INSTRUMENTATION</div>
        <div style={grid2Style}>
          <div>
            <label style={labelStyle}>Gauge ID</label>
            <ShieldedInput
              value={hydrotestData.gaugeId}
              onFocus={() => handleFieldFocus('gaugeId', hydrotestData.gaugeId)}
              onChange={(val) => updateField('gaugeId', val)}
              onBlur={(e) => handleFieldBlur('gaugeId', e.target.value, 'Gauge ID')}
              placeholder="Gauge identifier"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Recorder Type</label>
            <select
              value={hydrotestData.recorderType}
              onFocus={() => handleFieldFocus('recorderType', hydrotestData.recorderType)}
              onChange={(e) => updateField('recorderType', e.target.value)}
              onBlur={(e) => handleFieldBlur('recorderType', e.target.value, 'Recorder Type')}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Chart Recorder">Chart Recorder</option>
              <option value="Digital Logger">Digital Logger</option>
              <option value="Manual">Manual</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Calibration Date</label>
            <input
              type="date"
              value={hydrotestData.calibrationDate}
              onFocus={() => handleFieldFocus('calibrationDate', hydrotestData.calibrationDate)}
              onChange={(e) => updateField('calibrationDate', e.target.value)}
              onBlur={(e) => handleFieldBlur('calibrationDate', e.target.value, 'Calibration Date')}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Calibration Certificate</label>
            <ShieldedInput
              value={hydrotestData.calibrationCertificate}
              onFocus={() => handleFieldFocus('calibrationCertificate', hydrotestData.calibrationCertificate)}
              onChange={(val) => updateField('calibrationCertificate', val)}
              onBlur={(e) => handleFieldBlur('calibrationCertificate', e.target.value, 'Calibration Certificate')}
              placeholder="Certificate number"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* 6. PRESSURE READINGS TABLE */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>📈 PRESSURE READINGS</div>
          <button
            onClick={addReading}
            style={{
              padding: '8px 16px',
              backgroundColor: themeColor,
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            + Add Reading
          </button>
        </div>

        {hydrotestData.pressureReadings.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            No pressure readings recorded. Click "Add Reading" to log pressure data over time.
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Pressure (kPa)</th>
                <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>Temp (°C)</th>
                <th style={thStyle}>Notes</th>
                <th style={{ ...thStyle, width: '60px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {hydrotestData.pressureReadings.map((reading, index) => (
                <tr key={reading.id}>
                  <td style={tdStyle}>
                    <input
                      type="time"
                      value={reading.time}
                      onFocus={() => handleEntryFieldFocus(reading.id, 'time', reading.time)}
                      onChange={(e) => updateReading(reading.id, 'time', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(reading.id, 'time', e.target.value, 'Time', getReadingLabel(reading, index))}
                      style={tableInputStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={reading.pressure}
                      onFocus={() => handleEntryFieldFocus(reading.id, 'pressure', reading.pressure)}
                      onChange={(e) => updateReading(reading.id, 'pressure', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(reading.id, 'pressure', e.target.value, 'Pressure', getReadingLabel(reading, index))}
                      style={tableInputStyle}
                      placeholder="kPa"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={reading.temperature}
                      onFocus={() => handleEntryFieldFocus(reading.id, 'temperature', reading.temperature)}
                      onChange={(e) => updateReading(reading.id, 'temperature', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(reading.id, 'temperature', e.target.value, 'Temperature', getReadingLabel(reading, index))}
                      style={tableInputStyle}
                      placeholder="°C"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={reading.notes}
                      onFocus={() => handleEntryFieldFocus(reading.id, 'notes', reading.notes)}
                      onChange={(e) => updateReading(reading.id, 'notes', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(reading.id, 'notes', e.target.value, 'Notes', getReadingLabel(reading, index))}
                      style={tableInputStyle}
                      placeholder="Notes"
                    />
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => removeReading(reading.id)}
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
      </div>

      {/* 7. PERSONNEL */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>👷 PERSONNEL</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Test Engineer</label>
            <ShieldedInput
              value={hydrotestData.testEngineer}
              onFocus={() => handleFieldFocus('testEngineer', hydrotestData.testEngineer)}
              onChange={(val) => updateField('testEngineer', val)}
              onBlur={(e) => handleFieldBlur('testEngineer', e.target.value, 'Test Engineer')}
              placeholder="Engineer name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Test Witness</label>
            <ShieldedInput
              value={hydrotestData.testWitness}
              onFocus={() => handleFieldFocus('testWitness', hydrotestData.testWitness)}
              onChange={(val) => updateField('testWitness', val)}
              onBlur={(e) => handleFieldBlur('testWitness', e.target.value, 'Test Witness')}
              placeholder="Witness name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Witness Company</label>
            <ShieldedInput
              value={hydrotestData.witnessCompany}
              onFocus={() => handleFieldFocus('witnessCompany', hydrotestData.witnessCompany)}
              onChange={(val) => updateField('witnessCompany', val)}
              onBlur={(e) => handleFieldBlur('witnessCompany', e.target.value, 'Witness Company')}
              placeholder="Company name"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* 8. TEST RESULT */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🏁 TEST RESULT</div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Test Result</label>
          <select
            value={hydrotestData.testResult}
            onFocus={() => handleFieldFocus('testResult', hydrotestData.testResult)}
            onChange={(e) => updateField('testResult', e.target.value)}
            onBlur={(e) => handleFieldBlur('testResult', e.target.value, 'Test Result')}
            style={{ ...selectStyle, maxWidth: '250px' }}
          >
            <option value="">Select...</option>
            <option value="Pass">Pass</option>
            <option value="Fail">Fail</option>
            <option value="Pending">Pending</option>
          </select>
        </div>

        {/* Color-coded result banner */}
        {hydrotestData.testResult && (() => {
          const banner = getResultBanner()
          if (!banner) return null
          return (
            <div style={{
              padding: '12px 16px',
              backgroundColor: banner.bg,
              border: `2px solid ${banner.border}`,
              borderRadius: '6px',
              marginBottom: '12px',
              fontSize: '16px',
              fontWeight: 'bold',
              color: banner.text,
              textAlign: 'center'
            }}>
              {hydrotestData.testResult === 'Pass' && '✅ '}
              {hydrotestData.testResult === 'Fail' && '❌ '}
              {hydrotestData.testResult === 'Pending' && '⏳ '}
              TEST {hydrotestData.testResult.toUpperCase()}
              {hydrotestData.pressureDropPSI && ` — Pressure Drop: ${hydrotestData.pressureDropPSI} PSI`}
            </div>
          )
        })()}

        {/* Conditional failure fields */}
        {hydrotestData.testResult === 'Fail' && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fff5f5',
            borderRadius: '6px',
            border: '1px solid #fed7d7'
          }}>
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Failure Reason</label>
                <ShieldedInput
                  value={hydrotestData.failureReason}
                  onFocus={() => handleFieldFocus('failureReason', hydrotestData.failureReason)}
                  onChange={(val) => updateField('failureReason', val)}
                  onBlur={(e) => handleFieldBlur('failureReason', e.target.value, 'Failure Reason')}
                  placeholder="Describe failure"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Leaks Found</label>
                <select
                  value={hydrotestData.leaksFound}
                  onFocus={() => handleFieldFocus('leaksFound', hydrotestData.leaksFound)}
                  onChange={(e) => updateField('leaksFound', e.target.value)}
                  onBlur={(e) => handleFieldBlur('leaksFound', e.target.value, 'Leaks Found')}
                  style={selectStyle}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>

            {hydrotestData.leaksFound === 'Yes' && (
              <div style={{ ...gridStyle, marginTop: '12px' }}>
                <div>
                  <label style={labelStyle}>Leak Location</label>
                  <ShieldedInput
                    value={hydrotestData.leakLocation}
                    onFocus={() => handleFieldFocus('leakLocation', hydrotestData.leakLocation)}
                    onChange={(val) => updateField('leakLocation', val)}
                    onBlur={(e) => handleFieldBlur('leakLocation', e.target.value, 'Leak Location')}
                    placeholder="Where was leak found"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Leak Repair Method</label>
                  <ShieldedInput
                    value={hydrotestData.leakRepairMethod}
                    onFocus={() => handleFieldFocus('leakRepairMethod', hydrotestData.leakRepairMethod)}
                    onChange={(val) => updateField('leakRepairMethod', val)}
                    onBlur={(e) => handleFieldBlur('leakRepairMethod', e.target.value, 'Leak Repair Method')}
                    placeholder="Repair method used"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 9. SIGN-OFF & COMMENTS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📝 SIGN-OFF & COMMENTS</div>
        <div style={{ marginBottom: '12px', maxWidth: '250px' }}>
          <label style={labelStyle}>NCR Required</label>
          <select
            value={hydrotestData.ncrRequired}
            onFocus={() => handleFieldFocus('ncrRequired', hydrotestData.ncrRequired)}
            onChange={(e) => updateField('ncrRequired', e.target.value)}
            onBlur={(e) => handleFieldBlur('ncrRequired', e.target.value, 'NCR Required')}
            style={selectStyle}
          >
            <option value="">Select...</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
            <option value="N/A">N/A</option>
          </select>
        </div>
        <ShieldedInput
          as="textarea"
          value={hydrotestData.comments}
          onFocus={() => handleFieldFocus('comments', hydrotestData.comments)}
          onChange={(val) => updateField('comments', val)}
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

export default HydrotestLog
