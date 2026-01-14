import React, { useState, useRef } from 'react'
import { supabase } from './supabase'
import { useActivityAudit } from './useActivityAudit'

function HydrotestLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, metersToday, logId, reportId }) {
  const [showPigging, setShowPigging] = useState(data?.pigging?.enabled || false)
  const [showSummary, setShowSummary] = useState(data?.summary?.enabled || false)
  const [showChecklist, setShowChecklist] = useState(data?.checklistEnabled || false)
  const [loadingFromDb, setLoadingFromDb] = useState(false)
  const [loadMessage, setLoadMessage] = useState('')

  // Audit trail hook
  const { 
    initializeOriginalValues,
    initializeEntryValues,
    logFieldChange,
    logNestedFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'HydrotestLog')
  
  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const nestedValuesRef = useRef({})
  const entryValuesRef = useRef({})
  
  // Default structure
  const defaultData = {
    sectionNo: '',
    fromKP: '',
    toKP: '',
    length: '',
    nps: '',
    wallThickness: '',
    grade: '',
    deadWeightRecorder: '',
    minTestPressure: '',
    maxTestPressure: '',
    readings: [],
    checklist: {
      permitsInPlace: '',
      waterSamplesRequired: '',
      aerNotified: '',
      testHeadsCertified: '',
      calCertDeadweight: '',
      calCertPressureRecorders: '',
      calCertTempRecorder: '',
      calCertFlowMeter: '',
      valvePositionsVerified: '',
      testHeadWeldsRadiographed: '',
      testHeadUpstream: '',
      testHeadDownstream: '',
      other1Label: '',
      other1Value: '',
      other2Label: '',
      other2Value: '',
      other3Label: '',
      other3Value: '',
      other4Label: '',
      other4Value: ''
    },
    pigging: {
      enabled: false,
      pigType: '',
      runs: [],
      stoppages: []
    },
    summary: {
      enabled: false,
      testHead1No: '',
      testHead1Location: '',
      testHead2No: '',
      testHead2Location: '',
      activities: {
        constructionPig: { date: '', startKpa: '', completionKpa: '', kpFrom: '', kpTo: '' },
        lineFill: { date: '', startKpa: '', completionKpa: '', kpFrom: '', kpTo: '' },
        sectionFull: { date: '', startKpa: '', completionKpa: '', kpFrom: '', kpTo: '' },
        startPressurize: { date: '', startKpa: '', completionKpa: '', kpFrom: '', kpTo: '' },
        fourHrStrength: { date: '', startKpa: '', completionKpa: '', kpFrom: '', kpTo: '' },
        leakTest: { date: '', startKpa: '', completionKpa: '', kpFrom: '', kpTo: '' },
        depressurize: { date: '', startKpa: '', completionKpa: '', kpFrom: '', kpTo: '' },
        dewater: { date: '', startKpa: '', completionKpa: '', kpFrom: '', kpTo: '' },
        dryRun: { date: '', startKpa: '', completionKpa: '', kpFrom: '', kpTo: '' },
        caliperRun: { date: '', startKpa: '', completionKpa: '', kpFrom: '', kpTo: '' }
      },
      methanolWash: {
        litresIn: '',
        atPercentIn: '',
        litresReturn: '',
        atPercentReturn: ''
      },
      summaryComments: ''
    },
    comments: ''
  }

  // Merge incoming data with defaults
  const hydrotestData = {
    ...defaultData,
    ...data,
    checklist: { ...defaultData.checklist, ...(data?.checklist || {}) },
    pigging: { ...defaultData.pigging, ...(data?.pigging || {}), runs: data?.pigging?.runs || [], stoppages: data?.pigging?.stoppages || [] },
    summary: {
      ...defaultData.summary,
      ...(data?.summary || {}),
      activities: { ...defaultData.summary.activities, ...(data?.summary?.activities || {}) },
      methanolWash: { ...defaultData.summary.methanolWash, ...(data?.summary?.methanolWash || {}) }
    },
    readings: data?.readings || []
  }

  // Audit handlers
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
    onChange({ ...hydrotestData, [field]: value })
  }

  const updateChecklist = (field, value) => {
    onChange({ ...hydrotestData, checklist: { ...hydrotestData.checklist, [field]: value } })
  }

  const toggleChecklist = () => {
    const newEnabled = !showChecklist
    setShowChecklist(newEnabled)
    onChange({ ...hydrotestData, checklistEnabled: newEnabled })
  }

  // Pigging functions
  const togglePigging = () => {
    const newEnabled = !showPigging
    setShowPigging(newEnabled)
    onChange({ ...hydrotestData, pigging: { ...hydrotestData.pigging, enabled: newEnabled } })
  }

  const updatePiggingField = (field, value) => {
    onChange({ ...hydrotestData, pigging: { ...hydrotestData.pigging, [field]: value } })
  }

  const addPigRun = () => {
    const runNumber = hydrotestData.pigging.runs.length + 1
    const newRun = { id: Date.now(), runNumber, startStation: '', endStation: '', sectionLength: '', startTime: '', endTime: '', avgKpa: '', maxKpa: '' }
    onChange({ ...hydrotestData, pigging: { ...hydrotestData.pigging, runs: [...hydrotestData.pigging.runs, newRun] } })
    logEntryAdd('Pig Run', `Run #${runNumber}`)
  }

  const updatePigRun = (id, field, value) => {
    const updated = hydrotestData.pigging.runs.map(run => run.id === id ? { ...run, [field]: value } : run)
    onChange({ ...hydrotestData, pigging: { ...hydrotestData.pigging, runs: updated } })
  }

  const removePigRun = (id) => {
    const run = hydrotestData.pigging.runs.find(r => r.id === id)
    const filtered = hydrotestData.pigging.runs.filter(r => r.id !== id)
    const renumbered = filtered.map((r, idx) => ({ ...r, runNumber: idx + 1 }))
    onChange({ ...hydrotestData, pigging: { ...hydrotestData.pigging, runs: renumbered } })
    logEntryDelete('Pig Run', `Run #${run?.runNumber || '?'}`)
  }

  const addStoppage = () => {
    const newStoppage = { id: Date.now(), runNumber: '', duration: '', pressureToDislodge: '' }
    onChange({ ...hydrotestData, pigging: { ...hydrotestData.pigging, stoppages: [...hydrotestData.pigging.stoppages, newStoppage] } })
    logEntryAdd('Stoppage', `Stoppage #${hydrotestData.pigging.stoppages.length + 1}`)
  }

  const updateStoppage = (id, field, value) => {
    const updated = hydrotestData.pigging.stoppages.map(stop => stop.id === id ? { ...stop, [field]: value } : stop)
    onChange({ ...hydrotestData, pigging: { ...hydrotestData.pigging, stoppages: updated } })
  }

  const removeStoppage = (id) => {
    const idx = hydrotestData.pigging.stoppages.findIndex(s => s.id === id)
    onChange({ ...hydrotestData, pigging: { ...hydrotestData.pigging, stoppages: hydrotestData.pigging.stoppages.filter(s => s.id !== id) } })
    logEntryDelete('Stoppage', `Stoppage #${idx + 1}`)
  }

  // Summary functions
  const toggleSummary = () => {
    const newEnabled = !showSummary
    setShowSummary(newEnabled)
    onChange({ ...hydrotestData, summary: { ...hydrotestData.summary, enabled: newEnabled } })
  }

  const updateSummaryField = (field, value) => {
    onChange({ ...hydrotestData, summary: { ...hydrotestData.summary, [field]: value } })
  }

  const updateSummaryActivity = (activityKey, field, value) => {
    onChange({
      ...hydrotestData,
      summary: {
        ...hydrotestData.summary,
        activities: {
          ...hydrotestData.summary.activities,
          [activityKey]: { ...hydrotestData.summary.activities[activityKey], [field]: value }
        }
      }
    })
  }

  const updateMethanolWash = (field, value) => {
    onChange({
      ...hydrotestData,
      summary: { ...hydrotestData.summary, methanolWash: { ...hydrotestData.summary.methanolWash, [field]: value } }
    })
  }

  // Load historical data from database by Section No.
  const loadFromDatabase = async () => {
    if (!hydrotestData.sectionNo) {
      setLoadMessage('Please enter a Section No. first')
      setTimeout(() => setLoadMessage(''), 3000)
      return
    }

    setLoadingFromDb(true)
    setLoadMessage('')

    try {
      const { data: reports, error } = await supabase
        .from('inspector_reports')
        .select('*')
        .contains('activities', [{ activityType: 'Hydrostatic Testing' }])
        .order('report_date', { ascending: true })

      if (error) throw error

      const matchingReports = reports?.filter(report => {
        const activities = report.activities || []
        return activities.some(act => 
          act.activityType === 'Hydrostatic Testing' && 
          act.hydrotestData?.sectionNo === hydrotestData.sectionNo
        )
      }) || []

      if (matchingReports.length === 0) {
        setLoadMessage(`No existing records found for Section ${hydrotestData.sectionNo}`)
        setTimeout(() => setLoadMessage(''), 3000)
        setLoadingFromDb(false)
        return
      }

      let allPiggingRuns = []
      let allPressureReadings = []
      let latestTestHeads = {}
      let latestMethanolWash = {}

      matchingReports.forEach(report => {
        const activities = report.activities || []
        activities.forEach(act => {
          if (act.activityType === 'Hydrostatic Testing' && act.hydrotestData?.sectionNo === hydrotestData.sectionNo) {
            const htData = act.hydrotestData
            if (htData.pigging?.runs) allPiggingRuns = [...allPiggingRuns, ...htData.pigging.runs]
            if (htData.readings) allPressureReadings = [...allPressureReadings, ...htData.readings]
            if (htData.summary?.testHead1No) {
              latestTestHeads.testHead1No = htData.summary.testHead1No
              latestTestHeads.testHead1Location = htData.summary.testHead1Location
            }
            if (htData.summary?.testHead2No) {
              latestTestHeads.testHead2No = htData.summary.testHead2No
              latestTestHeads.testHead2Location = htData.summary.testHead2Location
            }
            if (htData.summary?.methanolWash) latestMethanolWash = { ...latestMethanolWash, ...htData.summary.methanolWash }
          }
        })
      })

      const summaryActivities = { ...hydrotestData.summary.activities }
      const constructionPigRun = allPiggingRuns.find(r => hydrotestData.pigging?.pigType === 'construction' || r.runNumber === 1)
      if (constructionPigRun) {
        summaryActivities.constructionPig = {
          ...summaryActivities.constructionPig,
          kpFrom: constructionPigRun.startStation || summaryActivities.constructionPig?.kpFrom,
          kpTo: constructionPigRun.endStation || summaryActivities.constructionPig?.kpTo,
          startKpa: constructionPigRun.avgKpa || summaryActivities.constructionPig?.startKpa,
          completionKpa: constructionPigRun.maxKpa || summaryActivities.constructionPig?.completionKpa
        }
      }

      const caliperRun = allPiggingRuns.find(r => hydrotestData.pigging?.pigType === 'caliper') || allPiggingRuns[allPiggingRuns.length - 1]
      if (caliperRun && allPiggingRuns.length > 1) {
        summaryActivities.caliperRun = {
          ...summaryActivities.caliperRun,
          kpFrom: caliperRun.startStation || summaryActivities.caliperRun?.kpFrom,
          kpTo: caliperRun.endStation || summaryActivities.caliperRun?.kpTo,
          startKpa: caliperRun.avgKpa || summaryActivities.caliperRun?.startKpa,
          completionKpa: caliperRun.maxKpa || summaryActivities.caliperRun?.completionKpa
        }
      }

      if (allPressureReadings.length > 0) {
        const sortedReadings = [...allPressureReadings].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
        const firstReading = sortedReadings[0]
        const lastReading = sortedReadings[sortedReadings.length - 1]
        if (firstReading?.pressure) summaryActivities.startPressurize = { ...summaryActivities.startPressurize, startKpa: firstReading.pressure }
        if (lastReading?.pressure) summaryActivities.leakTest = { ...summaryActivities.leakTest, completionKpa: lastReading.pressure }
      }

      onChange({
        ...hydrotestData,
        summary: {
          ...hydrotestData.summary,
          enabled: true,
          testHead1No: latestTestHeads.testHead1No || hydrotestData.summary.testHead1No,
          testHead1Location: latestTestHeads.testHead1Location || hydrotestData.summary.testHead1Location,
          testHead2No: latestTestHeads.testHead2No || hydrotestData.summary.testHead2No,
          testHead2Location: latestTestHeads.testHead2Location || hydrotestData.summary.testHead2Location,
          activities: summaryActivities,
          methanolWash: { ...hydrotestData.summary.methanolWash, ...latestMethanolWash }
        }
      })

      setShowSummary(true)
      setLoadMessage(`Loaded data from ${matchingReports.length} record(s) for Section ${hydrotestData.sectionNo}`)
      setTimeout(() => setLoadMessage(''), 5000)

    } catch (err) {
      console.error('Error loading from database:', err)
      setLoadMessage('Error loading data: ' + err.message)
      setTimeout(() => setLoadMessage(''), 5000)
    }

    setLoadingFromDb(false)
  }

  const addReading = () => {
    const newReading = { id: Date.now(), time: '', pressure: '', temp: '', tempType: 'Pipe', initial: '', comments: '' }
    onChange({ ...hydrotestData, readings: [...hydrotestData.readings, newReading] })
    logEntryAdd('Pressure Reading', `Reading #${hydrotestData.readings.length + 1}`)
  }

  const updateReading = (id, field, value) => {
    const updated = hydrotestData.readings.map(reading => reading.id === id ? { ...reading, [field]: value } : reading)
    onChange({ ...hydrotestData, readings: updated })
  }

  const removeReading = (id) => {
    const idx = hydrotestData.readings.findIndex(r => r.id === id)
    const reading = hydrotestData.readings.find(r => r.id === id)
    onChange({ ...hydrotestData, readings: hydrotestData.readings.filter(r => r.id !== id) })
    logEntryDelete('Pressure Reading', reading?.time || `Reading #${idx + 1}`)
  }

  // Entry label helpers
  const getReadingLabel = (reading, idx) => reading.time || `Reading #${idx + 1}`
  const getPigRunLabel = (run) => `Run #${run.runNumber}`
  const getStoppageLabel = (stoppage, idx) => stoppage.runNumber ? `Run #${stoppage.runNumber} Stoppage` : `Stoppage #${idx + 1}`

  // Styles
  const sectionStyle = { marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }
  const sectionHeaderStyle = { fontSize: '14px', fontWeight: 'bold', color: '#495057', marginBottom: '15px', paddingBottom: '8px', borderBottom: '2px solid #0dcaf0' }
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }
  const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }
  const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '13px' }
  const thStyle = { padding: '10px 8px', backgroundColor: '#0dcaf0', color: '#000', textAlign: 'center', fontWeight: 'bold', fontSize: '12px', border: '1px solid #0bb5d4' }
  const tdStyle = { padding: '8px', border: '1px solid #dee2e6', textAlign: 'center' }
  const tableInputStyle = { width: '100%', padding: '6px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', textAlign: 'center', boxSizing: 'border-box' }
  const selectStyle = { ...tableInputStyle, cursor: 'pointer' }

  const checklistItems = [
    { key: 'permitsInPlace', label: 'Permits in Place', type: 'yesNoNa' },
    { key: 'waterSamplesRequired', label: 'Water Samples Required', type: 'yesNoNa' },
    { key: 'aerNotified', label: 'AER Notified', type: 'yesNoNa' },
    { key: 'testHeadsCertified', label: 'Test Heads Certified', type: 'yesNoNa' }
  ]

  const calibrationItems = [
    { key: 'calCertDeadweight', label: 'Deadweight' },
    { key: 'calCertPressureRecorders', label: 'Pressure Recorders' },
    { key: 'calCertTempRecorder', label: 'Temperature Recorder' },
    { key: 'calCertFlowMeter', label: 'Flow Meter' }
  ]

  const additionalItems = [
    { key: 'valvePositionsVerified', label: 'Mainline Valve Positions Verified' },
    { key: 'testHeadWeldsRadiographed', label: 'Test Head Welds Radiographed' }
  ]

  return (
    <div style={{ marginTop: '15px' }}>
      {/* INHERITED CHAINAGE INFO */}
      {(startKP || endKP) && (
        <div style={{ padding: '12px 15px', backgroundColor: '#cce5ff', borderRadius: '6px', marginBottom: '15px', border: '1px solid #007bff' }}>
          <span style={{ fontSize: '13px', color: '#004085' }}>
            <strong>📋 Activity Chainage:</strong>{' '}
            {startKP && <>From: <strong>{startKP}</strong></>}
            {startKP && endKP && ' → '}
            {endKP && <>To: <strong>{endKP}</strong></>}
            {metersToday && <> | <strong style={{ color: '#155724' }}>{metersToday}m Today</strong></>}
          </span>
        </div>
      )}

      {/* HEADER INFO */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>💧 HYDROTEST LOG INFORMATION</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="text" value={reportDate || ''} readOnly style={{ ...inputStyle, backgroundColor: '#e9ecef', cursor: 'not-allowed' }} />
          </div>
          <div>
            <label style={labelStyle}>Contractor</label>
            <input type="text" value={contractor || ''} readOnly style={{ ...inputStyle, backgroundColor: '#e9ecef', cursor: 'not-allowed' }} />
          </div>
          <div>
            <label style={labelStyle}>Foreman</label>
            <input type="text" value={foreman || ''} readOnly style={{ ...inputStyle, backgroundColor: '#e9ecef', cursor: 'not-allowed' }} />
          </div>
          <div>
            <label style={labelStyle}>Section No.</label>
            <input type="text" value={hydrotestData.sectionNo}
              onFocus={() => handleFieldFocus('sectionNo', hydrotestData.sectionNo)}
              onChange={(e) => updateField('sectionNo', e.target.value)}
              onBlur={(e) => handleFieldBlur('sectionNo', e.target.value, 'Section No')}
              placeholder="Section number" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>From (KP)</label>
            <input type="text" value={hydrotestData.fromKP}
              onFocus={() => handleFieldFocus('fromKP', hydrotestData.fromKP)}
              onChange={(e) => updateField('fromKP', e.target.value)}
              onBlur={(e) => handleFieldBlur('fromKP', e.target.value, 'From KP')}
              placeholder="e.g. 5+250" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>To (KP)</label>
            <input type="text" value={hydrotestData.toKP}
              onFocus={() => handleFieldFocus('toKP', hydrotestData.toKP)}
              onChange={(e) => updateField('toKP', e.target.value)}
              onBlur={(e) => handleFieldBlur('toKP', e.target.value, 'To KP')}
              placeholder="e.g. 6+100" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Length (m)</label>
            <input type="number" value={hydrotestData.length}
              onFocus={() => handleFieldFocus('length', hydrotestData.length)}
              onChange={(e) => updateField('length', e.target.value)}
              onBlur={(e) => handleFieldBlur('length', e.target.value, 'Length')}
              placeholder="Length" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>NPS</label>
            <input type="text" value={hydrotestData.nps}
              onFocus={() => handleFieldFocus('nps', hydrotestData.nps)}
              onChange={(e) => updateField('nps', e.target.value)}
              onBlur={(e) => handleFieldBlur('nps', e.target.value, 'NPS')}
              placeholder="Nominal pipe size" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Wall Thickness</label>
            <input type="text" value={hydrotestData.wallThickness}
              onFocus={() => handleFieldFocus('wallThickness', hydrotestData.wallThickness)}
              onChange={(e) => updateField('wallThickness', e.target.value)}
              onBlur={(e) => handleFieldBlur('wallThickness', e.target.value, 'Wall Thickness')}
              placeholder="WT" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Grade</label>
            <input type="text" value={hydrotestData.grade}
              onFocus={() => handleFieldFocus('grade', hydrotestData.grade)}
              onChange={(e) => updateField('grade', e.target.value)}
              onBlur={(e) => handleFieldBlur('grade', e.target.value, 'Grade')}
              placeholder="Grade" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Dead Weight Recorder</label>
            <input type="text" value={hydrotestData.deadWeightRecorder}
              onFocus={() => handleFieldFocus('deadWeightRecorder', hydrotestData.deadWeightRecorder)}
              onChange={(e) => updateField('deadWeightRecorder', e.target.value)}
              onBlur={(e) => handleFieldBlur('deadWeightRecorder', e.target.value, 'Dead Weight Recorder')}
              placeholder="Recorder ID" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Min Test Pressure (kPa)</label>
            <input type="number" value={hydrotestData.minTestPressure}
              onFocus={() => handleFieldFocus('minTestPressure', hydrotestData.minTestPressure)}
              onChange={(e) => updateField('minTestPressure', e.target.value)}
              onBlur={(e) => handleFieldBlur('minTestPressure', e.target.value, 'Min Test Pressure')}
              placeholder="Min" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Max Test Pressure (kPa)</label>
            <input type="number" value={hydrotestData.maxTestPressure}
              onFocus={() => handleFieldFocus('maxTestPressure', hydrotestData.maxTestPressure)}
              onChange={(e) => updateField('maxTestPressure', e.target.value)}
              onBlur={(e) => handleFieldBlur('maxTestPressure', e.target.value, 'Max Test Pressure')}
              placeholder="Max" style={inputStyle} />
          </div>
        </div>
      </div>

      {/* PRESSURE READINGS TABLE */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>📊 PRESSURE READINGS</div>
          <button onClick={addReading} style={{ padding: '8px 16px', backgroundColor: '#0dcaf0', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>+ Add Reading</button>
        </div>

        {hydrotestData.readings.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>No readings recorded. Click "Add Reading" to log pressure/temperature readings.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: '100px' }}>Time</th>
                  <th style={thStyle}>Pressure (kPa)</th>
                  <th style={thStyle}>Temp (°C)</th>
                  <th style={{ ...thStyle, width: '100px' }}>Temp Type</th>
                  <th style={{ ...thStyle, width: '80px' }}>Initial</th>
                  <th style={thStyle}>Comments</th>
                  <th style={{ ...thStyle, width: '50px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {hydrotestData.readings.map((reading, idx) => (
                  <tr key={reading.id}>
                    <td style={tdStyle}>
                      <input type="time" value={reading.time}
                        onFocus={() => handleEntryFieldFocus(reading.id, 'time', reading.time)}
                        onChange={(e) => updateReading(reading.id, 'time', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(reading.id, 'time', e.target.value, 'Time', getReadingLabel(reading, idx))}
                        style={tableInputStyle} />
                    </td>
                    <td style={tdStyle}>
                      <input type="number" value={reading.pressure}
                        onFocus={() => handleEntryFieldFocus(reading.id, 'pressure', reading.pressure)}
                        onChange={(e) => updateReading(reading.id, 'pressure', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(reading.id, 'pressure', e.target.value, 'Pressure', getReadingLabel(reading, idx))}
                        style={tableInputStyle} placeholder="kPa" />
                    </td>
                    <td style={tdStyle}>
                      <input type="number" step="0.1" value={reading.temp}
                        onFocus={() => handleEntryFieldFocus(reading.id, 'temp', reading.temp)}
                        onChange={(e) => updateReading(reading.id, 'temp', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(reading.id, 'temp', e.target.value, 'Temperature', getReadingLabel(reading, idx))}
                        style={tableInputStyle} placeholder="°C" />
                    </td>
                    <td style={tdStyle}>
                      <select value={reading.tempType}
                        onFocus={() => handleEntryFieldFocus(reading.id, 'tempType', reading.tempType)}
                        onChange={(e) => { updateReading(reading.id, 'tempType', e.target.value); handleEntryFieldBlur(reading.id, 'tempType', e.target.value, 'Temp Type', getReadingLabel(reading, idx)) }}
                        style={selectStyle}>
                        <option value="Pipe">Pipe</option>
                        <option value="Air">Air</option>
                        <option value="Ground">Ground</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input type="text" value={reading.initial}
                        onFocus={() => handleEntryFieldFocus(reading.id, 'initial', reading.initial)}
                        onChange={(e) => updateReading(reading.id, 'initial', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(reading.id, 'initial', e.target.value, 'Initial', getReadingLabel(reading, idx))}
                        style={tableInputStyle} placeholder="Init" maxLength={3} />
                    </td>
                    <td style={tdStyle}>
                      <input type="text" value={reading.comments}
                        onFocus={() => handleEntryFieldFocus(reading.id, 'comments', reading.comments)}
                        onChange={(e) => updateReading(reading.id, 'comments', e.target.value)}
                        onBlur={(e) => handleEntryFieldBlur(reading.id, 'comments', e.target.value, 'Comments', getReadingLabel(reading, idx))}
                        style={tableInputStyle} placeholder="Comments" />
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => removeReading(reading.id)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hydrotestData.readings.length > 0 && (
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#495057' }}><strong>Total Readings:</strong> {hydrotestData.readings.length}</div>
        )}
      </div>

      {/* HYDROTEST CHECKLIST */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>✅ HYDROTEST CHECKLIST</div>
          <button onClick={toggleChecklist} style={{ padding: '8px 16px', backgroundColor: showChecklist ? '#dc3545' : '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
            {showChecklist ? '− Hide Checklist' : '+ Add Checklist'}
          </button>
        </div>
        
        {showChecklist && (
          <div>
            <table style={{ ...tableStyle, marginBottom: '20px' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left', width: '50%' }}>Item</th>
                  <th style={thStyle}>Yes</th>
                  <th style={thStyle}>No</th>
                  <th style={thStyle}>N/A</th>
                </tr>
              </thead>
              <tbody>
                {checklistItems.map(item => (
                  <tr key={item.key}>
                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: '500' }}>{item.label}</td>
                    <td style={tdStyle}>
                      <input type="radio" name={item.key} checked={hydrotestData.checklist[item.key] === 'yes'}
                        onFocus={() => handleNestedFieldFocus('checklist', item.key, hydrotestData.checklist[item.key])}
                        onChange={() => { updateChecklist(item.key, 'yes'); handleNestedFieldBlur('checklist', item.key, 'yes', item.label) }}
                        style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                    </td>
                    <td style={tdStyle}>
                      <input type="radio" name={item.key} checked={hydrotestData.checklist[item.key] === 'no'}
                        onFocus={() => handleNestedFieldFocus('checklist', item.key, hydrotestData.checklist[item.key])}
                        onChange={() => { updateChecklist(item.key, 'no'); handleNestedFieldBlur('checklist', item.key, 'no', item.label) }}
                        style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                    </td>
                    <td style={tdStyle}>
                      <input type="radio" name={item.key} checked={hydrotestData.checklist[item.key] === 'na'}
                        onFocus={() => handleNestedFieldFocus('checklist', item.key, hydrotestData.checklist[item.key])}
                        onChange={() => { updateChecklist(item.key, 'na'); handleNestedFieldBlur('checklist', item.key, 'na', item.label) }}
                        style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Calibration Certificates */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#495057' }}>CALIBRATION CERTIFICATES FOR:</h4>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left', width: '50%' }}>Certificate</th>
                    <th style={thStyle}>Yes</th>
                    <th style={thStyle}>No</th>
                    <th style={thStyle}>N/A</th>
                  </tr>
                </thead>
                <tbody>
                  {calibrationItems.map(item => (
                    <tr key={item.key}>
                      <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: '20px' }}>{item.label}</td>
                      <td style={tdStyle}>
                        <input type="radio" name={item.key} checked={hydrotestData.checklist[item.key] === 'yes'}
                          onFocus={() => handleNestedFieldFocus('checklist', item.key, hydrotestData.checklist[item.key])}
                          onChange={() => { updateChecklist(item.key, 'yes'); handleNestedFieldBlur('checklist', item.key, 'yes', `Cal Cert - ${item.label}`) }}
                          style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                      </td>
                      <td style={tdStyle}>
                        <input type="radio" name={item.key} checked={hydrotestData.checklist[item.key] === 'no'}
                          onFocus={() => handleNestedFieldFocus('checklist', item.key, hydrotestData.checklist[item.key])}
                          onChange={() => { updateChecklist(item.key, 'no'); handleNestedFieldBlur('checklist', item.key, 'no', `Cal Cert - ${item.label}`) }}
                          style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                      </td>
                      <td style={tdStyle}>
                        <input type="radio" name={item.key} checked={hydrotestData.checklist[item.key] === 'na'}
                          onFocus={() => handleNestedFieldFocus('checklist', item.key, hydrotestData.checklist[item.key])}
                          onChange={() => { updateChecklist(item.key, 'na'); handleNestedFieldBlur('checklist', item.key, 'na', `Cal Cert - ${item.label}`) }}
                          style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Additional Items */}
            <table style={{ ...tableStyle, marginBottom: '20px' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left', width: '50%' }}>Item</th>
                  <th style={thStyle}>Yes</th>
                  <th style={thStyle}>No</th>
                  <th style={thStyle}>N/A</th>
                </tr>
              </thead>
              <tbody>
                {additionalItems.map(item => (
                  <tr key={item.key}>
                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: '500' }}>{item.label}</td>
                    <td style={tdStyle}>
                      <input type="radio" name={item.key} checked={hydrotestData.checklist[item.key] === 'yes'}
                        onFocus={() => handleNestedFieldFocus('checklist', item.key, hydrotestData.checklist[item.key])}
                        onChange={() => { updateChecklist(item.key, 'yes'); handleNestedFieldBlur('checklist', item.key, 'yes', item.label) }}
                        style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                    </td>
                    <td style={tdStyle}>
                      <input type="radio" name={item.key} checked={hydrotestData.checklist[item.key] === 'no'}
                        onFocus={() => handleNestedFieldFocus('checklist', item.key, hydrotestData.checklist[item.key])}
                        onChange={() => { updateChecklist(item.key, 'no'); handleNestedFieldBlur('checklist', item.key, 'no', item.label) }}
                        style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                    </td>
                    <td style={tdStyle}>
                      <input type="radio" name={item.key} checked={hydrotestData.checklist[item.key] === 'na'}
                        onFocus={() => handleNestedFieldFocus('checklist', item.key, hydrotestData.checklist[item.key])}
                        onChange={() => { updateChecklist(item.key, 'na'); handleNestedFieldBlur('checklist', item.key, 'na', item.label) }}
                        style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Test Head Numbers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
              <div>
                <label style={labelStyle}>Test Head Number Upstream</label>
                <input type="text" value={hydrotestData.checklist.testHeadUpstream}
                  onFocus={() => handleNestedFieldFocus('checklist', 'testHeadUpstream', hydrotestData.checklist.testHeadUpstream)}
                  onChange={(e) => updateChecklist('testHeadUpstream', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('checklist', 'testHeadUpstream', e.target.value, 'Test Head Upstream')}
                  placeholder="Upstream head number" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Test Head Number Downstream</label>
                <input type="text" value={hydrotestData.checklist.testHeadDownstream}
                  onFocus={() => handleNestedFieldFocus('checklist', 'testHeadDownstream', hydrotestData.checklist.testHeadDownstream)}
                  onChange={(e) => updateChecklist('testHeadDownstream', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('checklist', 'testHeadDownstream', e.target.value, 'Test Head Downstream')}
                  placeholder="Downstream head number" style={inputStyle} />
              </div>
            </div>

            {/* Other Items */}
            <div style={{ marginTop: '15px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#495057' }}>OTHER:</h4>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left', width: '40%' }}>Description</th>
                    <th style={thStyle}>Yes</th>
                    <th style={thStyle}>No</th>
                    <th style={thStyle}>N/A</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map(num => (
                    <tr key={num}>
                      <td style={tdStyle}>
                        <input type="text" value={hydrotestData.checklist[`other${num}Label`]}
                          onFocus={() => handleNestedFieldFocus('checklist', `other${num}Label`, hydrotestData.checklist[`other${num}Label`])}
                          onChange={(e) => updateChecklist(`other${num}Label`, e.target.value)}
                          onBlur={(e) => handleNestedFieldBlur('checklist', `other${num}Label`, e.target.value, `Other ${num} Label`)}
                          placeholder={`Other item ${num}`} style={{ ...tableInputStyle, textAlign: 'left' }} />
                      </td>
                      <td style={tdStyle}>
                        <input type="radio" name={`other${num}`} checked={hydrotestData.checklist[`other${num}Value`] === 'yes'}
                          onFocus={() => handleNestedFieldFocus('checklist', `other${num}Value`, hydrotestData.checklist[`other${num}Value`])}
                          onChange={() => { updateChecklist(`other${num}Value`, 'yes'); handleNestedFieldBlur('checklist', `other${num}Value`, 'yes', `Other ${num}`) }}
                          style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                      </td>
                      <td style={tdStyle}>
                        <input type="radio" name={`other${num}`} checked={hydrotestData.checklist[`other${num}Value`] === 'no'}
                          onFocus={() => handleNestedFieldFocus('checklist', `other${num}Value`, hydrotestData.checklist[`other${num}Value`])}
                          onChange={() => { updateChecklist(`other${num}Value`, 'no'); handleNestedFieldBlur('checklist', `other${num}Value`, 'no', `Other ${num}`) }}
                          style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                      </td>
                      <td style={tdStyle}>
                        <input type="radio" name={`other${num}`} checked={hydrotestData.checklist[`other${num}Value`] === 'na'}
                          onFocus={() => handleNestedFieldFocus('checklist', `other${num}Value`, hydrotestData.checklist[`other${num}Value`])}
                          onChange={() => { updateChecklist(`other${num}Value`, 'na'); handleNestedFieldBlur('checklist', `other${num}Value`, 'na', `Other ${num}`) }}
                          style={{ cursor: 'pointer', width: '18px', height: '18px' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* PIGGING LOG SECTION */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none', borderBottomColor: '#6c757d' }}>🐷 PIGGING LOG</div>
          <button onClick={togglePigging} style={{ padding: '8px 16px', backgroundColor: showPigging ? '#dc3545' : '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
            {showPigging ? '− Hide Pigging Log' : '+ Add Pigging Log'}
          </button>
        </div>

        {showPigging && (
          <div>
            {/* Pig Type Selection */}
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
              <label style={{ fontWeight: 'bold', marginRight: '20px' }}>Pig Type:</label>
              <label style={{ marginRight: '20px', cursor: 'pointer' }}>
                <input type="radio" name="pigType" value="construction" checked={hydrotestData.pigging.pigType === 'construction'}
                  onFocus={() => handleNestedFieldFocus('pigging', 'pigType', hydrotestData.pigging.pigType)}
                  onChange={() => { updatePiggingField('pigType', 'construction'); handleNestedFieldBlur('pigging', 'pigType', 'construction', 'Pig Type') }}
                  style={{ marginRight: '5px' }} />
                Construction Pig
              </label>
              <label style={{ cursor: 'pointer' }}>
                <input type="radio" name="pigType" value="caliper" checked={hydrotestData.pigging.pigType === 'caliper'}
                  onFocus={() => handleNestedFieldFocus('pigging', 'pigType', hydrotestData.pigging.pigType)}
                  onChange={() => { updatePiggingField('pigType', 'caliper'); handleNestedFieldBlur('pigging', 'pigType', 'caliper', 'Pig Type') }}
                  style={{ marginRight: '5px' }} />
                Caliper Pig
              </label>
            </div>

            {/* Pig Runs Table */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '13px', color: '#495057' }}>PIG RUNS</h4>
                <button onClick={addPigRun} style={{ padding: '6px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Add Run</button>
              </div>

              {hydrotestData.pigging.runs.length === 0 ? (
                <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>No pig runs recorded. Click "Add Run" to log a pig run.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: '50px', backgroundColor: '#6c757d', borderColor: '#5a6268' }}>Run #</th>
                        <th style={{ ...thStyle, backgroundColor: '#6c757d', borderColor: '#5a6268' }}>Start Station</th>
                        <th style={{ ...thStyle, backgroundColor: '#6c757d', borderColor: '#5a6268' }}>End Station</th>
                        <th style={{ ...thStyle, backgroundColor: '#6c757d', borderColor: '#5a6268' }}>Section Length</th>
                        <th style={{ ...thStyle, backgroundColor: '#6c757d', borderColor: '#5a6268' }}>Start Time</th>
                        <th style={{ ...thStyle, backgroundColor: '#6c757d', borderColor: '#5a6268' }}>End Time</th>
                        <th style={{ ...thStyle, backgroundColor: '#6c757d', borderColor: '#5a6268' }}>Avg kPa</th>
                        <th style={{ ...thStyle, backgroundColor: '#6c757d', borderColor: '#5a6268' }}>Max kPa</th>
                        <th style={{ ...thStyle, width: '50px', backgroundColor: '#6c757d', borderColor: '#5a6268' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hydrotestData.pigging.runs.map(run => (
                        <tr key={run.id}>
                          <td style={{ ...tdStyle, fontWeight: 'bold' }}>{run.runNumber}</td>
                          <td style={tdStyle}>
                            <input type="text" value={run.startStation}
                              onFocus={() => handleEntryFieldFocus(run.id, 'startStation', run.startStation)}
                              onChange={(e) => updatePigRun(run.id, 'startStation', e.target.value)}
                              onBlur={(e) => handleEntryFieldBlur(run.id, 'startStation', e.target.value, 'Start Station', getPigRunLabel(run))}
                              style={tableInputStyle} placeholder="Start" />
                          </td>
                          <td style={tdStyle}>
                            <input type="text" value={run.endStation}
                              onFocus={() => handleEntryFieldFocus(run.id, 'endStation', run.endStation)}
                              onChange={(e) => updatePigRun(run.id, 'endStation', e.target.value)}
                              onBlur={(e) => handleEntryFieldBlur(run.id, 'endStation', e.target.value, 'End Station', getPigRunLabel(run))}
                              style={tableInputStyle} placeholder="End" />
                          </td>
                          <td style={tdStyle}>
                            <input type="text" value={run.sectionLength}
                              onFocus={() => handleEntryFieldFocus(run.id, 'sectionLength', run.sectionLength)}
                              onChange={(e) => updatePigRun(run.id, 'sectionLength', e.target.value)}
                              onBlur={(e) => handleEntryFieldBlur(run.id, 'sectionLength', e.target.value, 'Section Length', getPigRunLabel(run))}
                              style={tableInputStyle} placeholder="Length" />
                          </td>
                          <td style={tdStyle}>
                            <input type="time" value={run.startTime}
                              onFocus={() => handleEntryFieldFocus(run.id, 'startTime', run.startTime)}
                              onChange={(e) => updatePigRun(run.id, 'startTime', e.target.value)}
                              onBlur={(e) => handleEntryFieldBlur(run.id, 'startTime', e.target.value, 'Start Time', getPigRunLabel(run))}
                              style={tableInputStyle} />
                          </td>
                          <td style={tdStyle}>
                            <input type="time" value={run.endTime}
                              onFocus={() => handleEntryFieldFocus(run.id, 'endTime', run.endTime)}
                              onChange={(e) => updatePigRun(run.id, 'endTime', e.target.value)}
                              onBlur={(e) => handleEntryFieldBlur(run.id, 'endTime', e.target.value, 'End Time', getPigRunLabel(run))}
                              style={tableInputStyle} />
                          </td>
                          <td style={tdStyle}>
                            <input type="number" value={run.avgKpa}
                              onFocus={() => handleEntryFieldFocus(run.id, 'avgKpa', run.avgKpa)}
                              onChange={(e) => updatePigRun(run.id, 'avgKpa', e.target.value)}
                              onBlur={(e) => handleEntryFieldBlur(run.id, 'avgKpa', e.target.value, 'Avg kPa', getPigRunLabel(run))}
                              style={tableInputStyle} placeholder="Avg" />
                          </td>
                          <td style={tdStyle}>
                            <input type="number" value={run.maxKpa}
                              onFocus={() => handleEntryFieldFocus(run.id, 'maxKpa', run.maxKpa)}
                              onChange={(e) => updatePigRun(run.id, 'maxKpa', e.target.value)}
                              onBlur={(e) => handleEntryFieldBlur(run.id, 'maxKpa', e.target.value, 'Max kPa', getPigRunLabel(run))}
                              style={tableInputStyle} placeholder="Max" />
                          </td>
                          <td style={tdStyle}>
                            <button onClick={() => removePigRun(run.id)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Stoppages Table */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '13px', color: '#495057' }}>STOPPAGES</h4>
                <button onClick={addStoppage} style={{ padding: '6px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Add Stoppage</button>
              </div>

              {hydrotestData.pigging.stoppages.length === 0 ? (
                <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>No stoppages recorded.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, backgroundColor: '#6c757d', borderColor: '#5a6268' }}>Run #</th>
                        <th style={{ ...thStyle, backgroundColor: '#6c757d', borderColor: '#5a6268' }}>Duration</th>
                        <th style={{ ...thStyle, backgroundColor: '#6c757d', borderColor: '#5a6268' }}>Pressure To Dislodge Pig (kPa)</th>
                        <th style={{ ...thStyle, width: '50px', backgroundColor: '#6c757d', borderColor: '#5a6268' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hydrotestData.pigging.stoppages.map((stop, idx) => (
                        <tr key={stop.id}>
                          <td style={tdStyle}>
                            <input type="text" value={stop.runNumber}
                              onFocus={() => handleEntryFieldFocus(stop.id, 'runNumber', stop.runNumber)}
                              onChange={(e) => updateStoppage(stop.id, 'runNumber', e.target.value)}
                              onBlur={(e) => handleEntryFieldBlur(stop.id, 'runNumber', e.target.value, 'Run #', getStoppageLabel(stop, idx))}
                              style={tableInputStyle} placeholder="Run #" />
                          </td>
                          <td style={tdStyle}>
                            <input type="text" value={stop.duration}
                              onFocus={() => handleEntryFieldFocus(stop.id, 'duration', stop.duration)}
                              onChange={(e) => updateStoppage(stop.id, 'duration', e.target.value)}
                              onBlur={(e) => handleEntryFieldBlur(stop.id, 'duration', e.target.value, 'Duration', getStoppageLabel(stop, idx))}
                              style={tableInputStyle} placeholder="Duration" />
                          </td>
                          <td style={tdStyle}>
                            <input type="number" value={stop.pressureToDislodge}
                              onFocus={() => handleEntryFieldFocus(stop.id, 'pressureToDislodge', stop.pressureToDislodge)}
                              onChange={(e) => updateStoppage(stop.id, 'pressureToDislodge', e.target.value)}
                              onBlur={(e) => handleEntryFieldBlur(stop.id, 'pressureToDislodge', e.target.value, 'Pressure to Dislodge', getStoppageLabel(stop, idx))}
                              style={tableInputStyle} placeholder="kPa" />
                          </td>
                          <td style={tdStyle}>
                            <button onClick={() => removeStoppage(stop.id)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* TEST & PIG SUMMARY */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>📋 TEST & PIG SUMMARY</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={loadFromDatabase} disabled={loadingFromDb} style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: loadingFromDb ? 'not-allowed' : 'pointer', fontSize: '13px', opacity: loadingFromDb ? 0.7 : 1 }}>
              {loadingFromDb ? 'Loading...' : '📥 Load from DB'}
            </button>
            <button onClick={toggleSummary} style={{ padding: '8px 16px', backgroundColor: showSummary ? '#dc3545' : '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
              {showSummary ? '− Hide Summary' : '+ Add Summary'}
            </button>
          </div>
        </div>

        {loadMessage && (
          <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: loadMessage.includes('Error') ? '#f8d7da' : '#d4edda', color: loadMessage.includes('Error') ? '#721c24' : '#155724', borderRadius: '4px', fontSize: '13px' }}>
            {loadMessage}
          </div>
        )}

        {showSummary && (
          <div>
            {/* Test Heads */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={labelStyle}>Test Head No. 1</label>
                <input type="text" value={hydrotestData.summary.testHead1No}
                  onFocus={() => handleNestedFieldFocus('summary', 'testHead1No', hydrotestData.summary.testHead1No)}
                  onChange={(e) => updateSummaryField('testHead1No', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('summary', 'testHead1No', e.target.value, 'Test Head 1 No')}
                  placeholder="TH No. 1" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Location (KP)</label>
                <input type="text" value={hydrotestData.summary.testHead1Location}
                  onFocus={() => handleNestedFieldFocus('summary', 'testHead1Location', hydrotestData.summary.testHead1Location)}
                  onChange={(e) => updateSummaryField('testHead1Location', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('summary', 'testHead1Location', e.target.value, 'Test Head 1 Location')}
                  placeholder="Location 1" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Test Head No. 2</label>
                <input type="text" value={hydrotestData.summary.testHead2No}
                  onFocus={() => handleNestedFieldFocus('summary', 'testHead2No', hydrotestData.summary.testHead2No)}
                  onChange={(e) => updateSummaryField('testHead2No', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('summary', 'testHead2No', e.target.value, 'Test Head 2 No')}
                  placeholder="TH No. 2" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Location (KP)</label>
                <input type="text" value={hydrotestData.summary.testHead2Location}
                  onFocus={() => handleNestedFieldFocus('summary', 'testHead2Location', hydrotestData.summary.testHead2Location)}
                  onChange={(e) => updateSummaryField('testHead2Location', e.target.value)}
                  onBlur={(e) => handleNestedFieldBlur('summary', 'testHead2Location', e.target.value, 'Test Head 2 Location')}
                  placeholder="Location 2" style={inputStyle} />
              </div>
            </div>

            {/* Activity Summary Table */}
            <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left', width: '150px', backgroundColor: '#17a2b8', borderColor: '#138496' }}>Activity</th>
                    <th style={{ ...thStyle, backgroundColor: '#17a2b8', borderColor: '#138496' }}>Date</th>
                    <th style={{ ...thStyle, backgroundColor: '#17a2b8', borderColor: '#138496' }}>Start kPa</th>
                    <th style={{ ...thStyle, backgroundColor: '#17a2b8', borderColor: '#138496' }}>Completion kPa</th>
                    <th style={{ ...thStyle, backgroundColor: '#17a2b8', borderColor: '#138496' }}>KP From</th>
                    <th style={{ ...thStyle, backgroundColor: '#17a2b8', borderColor: '#138496' }}>KP To</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'constructionPig', label: 'Construction Pig' },
                    { key: 'lineFill', label: 'Line Fill' },
                    { key: 'sectionFull', label: 'Section Full' },
                    { key: 'startPressurize', label: 'Start Pressurize' },
                    { key: 'fourHrStrength', label: '4 Hr. Strength' },
                    { key: 'leakTest', label: 'Leak Test' },
                    { key: 'depressurize', label: 'Depressurize' },
                    { key: 'dewater', label: 'Dewater' },
                    { key: 'dryRun', label: 'Dry Run' },
                    { key: 'caliperRun', label: 'Caliper Run' }
                  ].map((activity, idx) => (
                    <tr key={activity.key} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#f8f9fa' }}>
                      <td style={{ ...tdStyle, textAlign: 'left', fontWeight: '500' }}>{activity.label}</td>
                      <td style={tdStyle}>
                        <input type="date" value={hydrotestData.summary.activities[activity.key]?.date || ''}
                          onFocus={() => handleNestedFieldFocus(`summary.activities.${activity.key}`, 'date', hydrotestData.summary.activities[activity.key]?.date)}
                          onChange={(e) => updateSummaryActivity(activity.key, 'date', e.target.value)}
                          onBlur={(e) => handleNestedFieldBlur(`summary.activities.${activity.key}`, 'date', e.target.value, `${activity.label} Date`)}
                          style={tableInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input type="number" value={hydrotestData.summary.activities[activity.key]?.startKpa || ''}
                          onFocus={() => handleNestedFieldFocus(`summary.activities.${activity.key}`, 'startKpa', hydrotestData.summary.activities[activity.key]?.startKpa)}
                          onChange={(e) => updateSummaryActivity(activity.key, 'startKpa', e.target.value)}
                          onBlur={(e) => handleNestedFieldBlur(`summary.activities.${activity.key}`, 'startKpa', e.target.value, `${activity.label} Start kPa`)}
                          style={tableInputStyle} placeholder="kPa" />
                      </td>
                      <td style={tdStyle}>
                        <input type="number" value={hydrotestData.summary.activities[activity.key]?.completionKpa || ''}
                          onFocus={() => handleNestedFieldFocus(`summary.activities.${activity.key}`, 'completionKpa', hydrotestData.summary.activities[activity.key]?.completionKpa)}
                          onChange={(e) => updateSummaryActivity(activity.key, 'completionKpa', e.target.value)}
                          onBlur={(e) => handleNestedFieldBlur(`summary.activities.${activity.key}`, 'completionKpa', e.target.value, `${activity.label} Completion kPa`)}
                          style={tableInputStyle} placeholder="kPa" />
                      </td>
                      <td style={tdStyle}>
                        <input type="text" value={hydrotestData.summary.activities[activity.key]?.kpFrom || ''}
                          onFocus={() => handleNestedFieldFocus(`summary.activities.${activity.key}`, 'kpFrom', hydrotestData.summary.activities[activity.key]?.kpFrom)}
                          onChange={(e) => updateSummaryActivity(activity.key, 'kpFrom', e.target.value)}
                          onBlur={(e) => handleNestedFieldBlur(`summary.activities.${activity.key}`, 'kpFrom', e.target.value, `${activity.label} KP From`)}
                          style={tableInputStyle} placeholder="From" />
                      </td>
                      <td style={tdStyle}>
                        <input type="text" value={hydrotestData.summary.activities[activity.key]?.kpTo || ''}
                          onFocus={() => handleNestedFieldFocus(`summary.activities.${activity.key}`, 'kpTo', hydrotestData.summary.activities[activity.key]?.kpTo)}
                          onChange={(e) => updateSummaryActivity(activity.key, 'kpTo', e.target.value)}
                          onBlur={(e) => handleNestedFieldBlur(`summary.activities.${activity.key}`, 'kpTo', e.target.value, `${activity.label} KP To`)}
                          style={tableInputStyle} placeholder="To" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Methanol Wash */}
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
              <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#856404' }}>🧪 METHANOL WASH</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>No. Litres (In)</label>
                  <input type="number" value={hydrotestData.summary.methanolWash.litresIn}
                    onFocus={() => handleNestedFieldFocus('summary.methanolWash', 'litresIn', hydrotestData.summary.methanolWash.litresIn)}
                    onChange={(e) => updateMethanolWash('litresIn', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur('summary.methanolWash', 'litresIn', e.target.value, 'Methanol Litres In')}
                    placeholder="Litres" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>At %</label>
                  <input type="number" step="0.1" value={hydrotestData.summary.methanolWash.atPercentIn}
                    onFocus={() => handleNestedFieldFocus('summary.methanolWash', 'atPercentIn', hydrotestData.summary.methanolWash.atPercentIn)}
                    onChange={(e) => updateMethanolWash('atPercentIn', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur('summary.methanolWash', 'atPercentIn', e.target.value, 'Methanol % In')}
                    placeholder="%" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>No. Litres (Return)</label>
                  <input type="number" value={hydrotestData.summary.methanolWash.litresReturn}
                    onFocus={() => handleNestedFieldFocus('summary.methanolWash', 'litresReturn', hydrotestData.summary.methanolWash.litresReturn)}
                    onChange={(e) => updateMethanolWash('litresReturn', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur('summary.methanolWash', 'litresReturn', e.target.value, 'Methanol Litres Return')}
                    placeholder="Litres" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Return %</label>
                  <input type="number" step="0.1" value={hydrotestData.summary.methanolWash.atPercentReturn}
                    onFocus={() => handleNestedFieldFocus('summary.methanolWash', 'atPercentReturn', hydrotestData.summary.methanolWash.atPercentReturn)}
                    onChange={(e) => updateMethanolWash('atPercentReturn', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur('summary.methanolWash', 'atPercentReturn', e.target.value, 'Methanol % Return')}
                    placeholder="%" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* Summary Comments */}
            <div>
              <label style={labelStyle}>Summary Comments</label>
              <textarea value={hydrotestData.summary.summaryComments}
                onFocus={() => handleNestedFieldFocus('summary', 'summaryComments', hydrotestData.summary.summaryComments)}
                onChange={(e) => updateSummaryField('summaryComments', e.target.value)}
                onBlur={(e) => handleNestedFieldBlur('summary', 'summaryComments', e.target.value, 'Summary Comments')}
                placeholder="Summary notes..."
                style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          </div>
        )}
      </div>

      {/* COMMENTS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📝 COMMENTS</div>
        <textarea value={hydrotestData.comments}
          onFocus={() => handleFieldFocus('comments', hydrotestData.comments)}
          onChange={(e) => updateField('comments', e.target.value)}
          onBlur={(e) => handleFieldBlur('comments', e.target.value, 'Comments')}
          placeholder="Additional comments, observations, or notes..."
          style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', minHeight: '100px', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>
    </div>
  )
}

export default HydrotestLog
