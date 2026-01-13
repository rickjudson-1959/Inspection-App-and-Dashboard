import React, { useRef } from 'react'
import { useActivityAudit } from './useActivityAudit'

function HDDLog({ data, onChange, logId, reportId }) {
  // Audit trail hook
  const { 
    initializeOriginalValues,
    initializeEntryValues,
    logFieldChange,
    logNestedFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'HDDLog')
  
  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const nestedValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure
  const defaultData = {
    hddDate: '',
    drillContractor: '',
    mainlineContractor: '',
    foreman: '',
    drillLocationKP: '',
    drillLengthM: '',
    drillsToDateM: '',
    pipeSize: '',
    activities: {
      sitePreparation: { today: '', previous: '', toDate: '' },
      rigSetUp: { today: '', previous: '', toDate: '' },
      setCasing: { today: '', previous: '', toDate: '', lengthM: '' },
      removeCasing: { today: '', previous: '', toDate: '' },
      siteDemobilization: { today: '', previous: '', toDate: '' }
    },
    drillingProgress: {
      pilotHole: { sizeInches: '', todayM: '', previousM: '', toDateM: '', percentComplete: '' },
      ream1: { sizeInches: '', todayM: '', previousM: '', toDateM: '', percentComplete: '' },
      ream2: { sizeInches: '', todayM: '', previousM: '', toDateM: '', percentComplete: '' },
      ream3: { sizeInches: '', todayM: '', previousM: '', toDateM: '', percentComplete: '' },
      ream4: { sizeInches: '', todayM: '', previousM: '', toDateM: '', percentComplete: '' },
      swabPass: { sizeInches: '', todayM: '', previousM: '', toDateM: '', percentComplete: '' },
      pipePull: { sizeInches: '', todayM: '', previousM: '', toDateM: '', percentComplete: '' }
    },
    mudTracking: [],
    comments: ''
  }

  // Merge incoming data with defaults
  const hddData = {
    ...defaultData,
    ...data,
    activities: {
      ...defaultData.activities,
      ...(data?.activities || {})
    },
    drillingProgress: {
      ...defaultData.drillingProgress,
      ...(data?.drillingProgress || {})
    }
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
    onChange({ ...hddData, [field]: value })
  }

  const updateActivity = (activity, field, value) => {
    const updated = {
      ...hddData,
      activities: {
        ...hddData.activities,
        [activity]: {
          ...hddData.activities[activity],
          [field]: value
        }
      }
    }
    // Auto-calculate To Date
    if (field === 'today' || field === 'previous') {
      const today = parseFloat(field === 'today' ? value : hddData.activities[activity].today) || 0
      const previous = parseFloat(field === 'previous' ? value : hddData.activities[activity].previous) || 0
      updated.activities[activity].toDate = (today + previous).toString()
    }
    onChange(updated)
  }

  const updateDrilling = (item, field, value) => {
    const updated = {
      ...hddData,
      drillingProgress: {
        ...hddData.drillingProgress,
        [item]: {
          ...hddData.drillingProgress[item],
          [field]: value
        }
      }
    }
    // Auto-calculate To Date for meters
    if (field === 'todayM' || field === 'previousM') {
      const today = parseFloat(field === 'todayM' ? value : hddData.drillingProgress[item].todayM) || 0
      const previous = parseFloat(field === 'previousM' ? value : hddData.drillingProgress[item].previousM) || 0
      updated.drillingProgress[item].toDateM = (today + previous).toString()
      
      // Auto-calculate % complete if drill length is set
      const drillLength = parseFloat(hddData.drillLengthM) || 0
      if (drillLength > 0) {
        const toDate = today + previous
        updated.drillingProgress[item].percentComplete = ((toDate / drillLength) * 100).toFixed(1)
      }
    }
    onChange(updated)
  }

  const addMudEntry = () => {
    const newEntry = {
      id: Date.now(),
      company: '',
      ticketNo: '',
      noOfLoads: '',
      noOfCubes: '',
      comments: ''
    }
    onChange({ ...hddData, mudTracking: [...hddData.mudTracking, newEntry] })
    logEntryAdd('Mud Entry', `Entry #${hddData.mudTracking.length + 1}`)
  }

  const updateMudEntry = (id, field, value) => {
    const updated = hddData.mudTracking.map(entry =>
      entry.id === id ? { ...entry, [field]: value } : entry
    )
    onChange({ ...hddData, mudTracking: updated })
  }

  const removeMudEntry = (id) => {
    const entryToRemove = hddData.mudTracking.find(e => e.id === id)
    const entryIndex = hddData.mudTracking.findIndex(e => e.id === id)
    const entryLabel = entryToRemove?.company || entryToRemove?.ticketNo || `Entry #${entryIndex + 1}`
    
    onChange({ ...hddData, mudTracking: hddData.mudTracking.filter(e => e.id !== id) })
    logEntryDelete('Mud Entry', entryLabel)
  }

  // Get entry label for audit trail
  const getEntryLabel = (entry, index) => {
    return entry.company || entry.ticketNo || `Entry #${index + 1}`
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
    borderBottom: '2px solid #17a2b8'
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
    backgroundColor: '#17a2b8',
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '12px',
    border: '1px solid #138496'
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

  // Activity display names for audit
  const activityNames = {
    sitePreparation: 'Site Preparation',
    rigSetUp: 'Rig Set Up',
    setCasing: 'Set Casing',
    removeCasing: 'Remove Casing',
    siteDemobilization: 'Site Demobilization'
  }

  // Drilling stage display names
  const drillingNames = {
    pilotHole: 'Pilot Hole',
    ream1: '#1 Ream',
    ream2: '#2 Ream',
    ream3: '#3 Ream',
    ream4: '#4 Ream',
    swabPass: 'Swab Pass',
    pipePull: 'Pipe Pull'
  }

  return (
    <div style={{ marginTop: '15px' }}>
      {/* HEADER INFO */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📍 HDD DRILL INFORMATION</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>HDD Date</label>
            <input
              type="date"
              value={hddData.hddDate}
              onFocus={() => handleFieldFocus('hddDate', hddData.hddDate)}
              onChange={(e) => updateField('hddDate', e.target.value)}
              onBlur={(e) => handleFieldBlur('hddDate', e.target.value, 'HDD Date')}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Drill Contractor</label>
            <input
              type="text"
              value={hddData.drillContractor}
              onFocus={() => handleFieldFocus('drillContractor', hddData.drillContractor)}
              onChange={(e) => updateField('drillContractor', e.target.value)}
              onBlur={(e) => handleFieldBlur('drillContractor', e.target.value, 'Drill Contractor')}
              placeholder="HDD Contractor name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Mainline Contractor</label>
            <input
              type="text"
              value={hddData.mainlineContractor}
              onFocus={() => handleFieldFocus('mainlineContractor', hddData.mainlineContractor)}
              onChange={(e) => updateField('mainlineContractor', e.target.value)}
              onBlur={(e) => handleFieldBlur('mainlineContractor', e.target.value, 'Mainline Contractor')}
              placeholder="Mainline Contractor"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Foreman</label>
            <input
              type="text"
              value={hddData.foreman}
              onFocus={() => handleFieldFocus('foreman', hddData.foreman)}
              onChange={(e) => updateField('foreman', e.target.value)}
              onBlur={(e) => handleFieldBlur('foreman', e.target.value, 'Foreman')}
              placeholder="Foreman name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Drill Location (KP)</label>
            <input
              type="text"
              value={hddData.drillLocationKP}
              onFocus={() => handleFieldFocus('drillLocationKP', hddData.drillLocationKP)}
              onChange={(e) => updateField('drillLocationKP', e.target.value)}
              onBlur={(e) => handleFieldBlur('drillLocationKP', e.target.value, 'Drill Location')}
              placeholder="e.g. 5+250"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Drill Length (m)</label>
            <input
              type="number"
              value={hddData.drillLengthM}
              onFocus={() => handleFieldFocus('drillLengthM', hddData.drillLengthM)}
              onChange={(e) => updateField('drillLengthM', e.target.value)}
              onBlur={(e) => handleFieldBlur('drillLengthM', e.target.value, 'Drill Length')}
              placeholder="Total length"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Drills To Date (m)</label>
            <input
              type="number"
              value={hddData.drillsToDateM}
              onFocus={() => handleFieldFocus('drillsToDateM', hddData.drillsToDateM)}
              onChange={(e) => updateField('drillsToDateM', e.target.value)}
              onBlur={(e) => handleFieldBlur('drillsToDateM', e.target.value, 'Drills To Date')}
              placeholder="Cumulative"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Pipe Size</label>
            <input
              type="text"
              value={hddData.pipeSize}
              onFocus={() => handleFieldFocus('pipeSize', hddData.pipeSize)}
              onChange={(e) => updateField('pipeSize', e.target.value)}
              onBlur={(e) => handleFieldBlur('pipeSize', e.target.value, 'Pipe Size')}
              placeholder="e.g. 12 inch"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* ACTIVITIES PROGRESS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📊 ACTIVITIES PROGRESS (%)</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '30%' }}>Activity</th>
              <th style={thStyle}>Today (%)</th>
              <th style={thStyle}>Previous (%)</th>
              <th style={thStyle}>To Date (%)</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(hddData.activities).map(actKey => (
              <tr key={actKey}>
                <td style={tdLabelStyle}>
                  {activityNames[actKey]}
                  {actKey === 'setCasing' && (
                    <div style={{ marginTop: '5px' }}>
                      <span style={{ fontSize: '11px', color: '#666' }}>Length (m): </span>
                      <input
                        type="number"
                        value={hddData.activities.setCasing.lengthM}
                        onFocus={() => handleNestedFieldFocus('activities.setCasing', 'lengthM', hddData.activities.setCasing.lengthM)}
                        onChange={(e) => updateActivity('setCasing', 'lengthM', e.target.value)}
                        onBlur={(e) => handleNestedFieldBlur('activities.setCasing', 'lengthM', e.target.value, 'Set Casing Length')}
                        style={{ ...tableInputStyle, width: '80px', display: 'inline-block' }}
                        placeholder="m"
                      />
                    </div>
                  )}
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={hddData.activities[actKey].today}
                    onFocus={() => handleNestedFieldFocus(`activities.${actKey}`, 'today', hddData.activities[actKey].today)}
                    onChange={(e) => updateActivity(actKey, 'today', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur(`activities.${actKey}`, 'today', e.target.value, `${activityNames[actKey]} Today`)}
                    style={tableInputStyle}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={hddData.activities[actKey].previous}
                    onFocus={() => handleNestedFieldFocus(`activities.${actKey}`, 'previous', hddData.activities[actKey].previous)}
                    onChange={(e) => updateActivity(actKey, 'previous', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur(`activities.${actKey}`, 'previous', e.target.value, `${activityNames[actKey]} Previous`)}
                    style={tableInputStyle}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="text"
                    value={hddData.activities[actKey].toDate}
                    readOnly
                    style={calculatedStyle}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DRILLING PROGRESS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🔧 DRILLING PROGRESS</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '20%' }}>Stage</th>
              <th style={thStyle}>Size (in)</th>
              <th style={thStyle}>Today (m)</th>
              <th style={thStyle}>Previous (m)</th>
              <th style={thStyle}>To Date (m)</th>
              <th style={thStyle}>% Complete</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(hddData.drillingProgress).map(itemKey => (
              <tr key={itemKey}>
                <td style={tdLabelStyle}>{drillingNames[itemKey]}</td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={hddData.drillingProgress[itemKey].sizeInches}
                    onFocus={() => handleNestedFieldFocus(`drillingProgress.${itemKey}`, 'sizeInches', hddData.drillingProgress[itemKey].sizeInches)}
                    onChange={(e) => updateDrilling(itemKey, 'sizeInches', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur(`drillingProgress.${itemKey}`, 'sizeInches', e.target.value, `${drillingNames[itemKey]} Size`)}
                    style={tableInputStyle}
                    placeholder="in"
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={hddData.drillingProgress[itemKey].todayM}
                    onFocus={() => handleNestedFieldFocus(`drillingProgress.${itemKey}`, 'todayM', hddData.drillingProgress[itemKey].todayM)}
                    onChange={(e) => updateDrilling(itemKey, 'todayM', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur(`drillingProgress.${itemKey}`, 'todayM', e.target.value, `${drillingNames[itemKey]} Today`)}
                    style={tableInputStyle}
                    placeholder="m"
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={hddData.drillingProgress[itemKey].previousM}
                    onFocus={() => handleNestedFieldFocus(`drillingProgress.${itemKey}`, 'previousM', hddData.drillingProgress[itemKey].previousM)}
                    onChange={(e) => updateDrilling(itemKey, 'previousM', e.target.value)}
                    onBlur={(e) => handleNestedFieldBlur(`drillingProgress.${itemKey}`, 'previousM', e.target.value, `${drillingNames[itemKey]} Previous`)}
                    style={tableInputStyle}
                    placeholder="m"
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="text"
                    value={hddData.drillingProgress[itemKey].toDateM}
                    readOnly
                    style={calculatedStyle}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="text"
                    value={hddData.drillingProgress[itemKey].percentComplete ? `${hddData.drillingProgress[itemKey].percentComplete}%` : ''}
                    readOnly
                    style={calculatedStyle}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MUD/MATERIAL TRACKING */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>🚛 MUD / MATERIAL TRACKING</div>
          <button
            onClick={addMudEntry}
            style={{
              padding: '8px 16px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            + Add Entry
          </button>
        </div>
        
        {hddData.mudTracking.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            No mud/material entries. Click "Add Entry" to track deliveries.
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Ticket No.</th>
                <th style={thStyle}>No. of Loads</th>
                <th style={thStyle}>No. of Cubes</th>
                <th style={{ ...thStyle, width: '25%' }}>Comments</th>
                <th style={{ ...thStyle, width: '60px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {hddData.mudTracking.map((entry, index) => (
                <tr key={entry.id}>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={entry.company}
                      onFocus={() => handleEntryFieldFocus(entry.id, 'company', entry.company)}
                      onChange={(e) => updateMudEntry(entry.id, 'company', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(entry.id, 'company', e.target.value, 'Company', getEntryLabel(entry, index))}
                      style={tableInputStyle}
                      placeholder="Company"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={entry.ticketNo}
                      onFocus={() => handleEntryFieldFocus(entry.id, 'ticketNo', entry.ticketNo)}
                      onChange={(e) => updateMudEntry(entry.id, 'ticketNo', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(entry.id, 'ticketNo', e.target.value, 'Ticket No.', getEntryLabel(entry, index))}
                      style={tableInputStyle}
                      placeholder="Ticket #"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={entry.noOfLoads}
                      onFocus={() => handleEntryFieldFocus(entry.id, 'noOfLoads', entry.noOfLoads)}
                      onChange={(e) => updateMudEntry(entry.id, 'noOfLoads', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(entry.id, 'noOfLoads', e.target.value, 'No. of Loads', getEntryLabel(entry, index))}
                      style={tableInputStyle}
                      placeholder="0"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={entry.noOfCubes}
                      onFocus={() => handleEntryFieldFocus(entry.id, 'noOfCubes', entry.noOfCubes)}
                      onChange={(e) => updateMudEntry(entry.id, 'noOfCubes', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(entry.id, 'noOfCubes', e.target.value, 'No. of Cubes', getEntryLabel(entry, index))}
                      style={tableInputStyle}
                      placeholder="0"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={entry.comments}
                      onFocus={() => handleEntryFieldFocus(entry.id, 'comments', entry.comments)}
                      onChange={(e) => updateMudEntry(entry.id, 'comments', e.target.value)}
                      onBlur={(e) => handleEntryFieldBlur(entry.id, 'comments', e.target.value, 'Comments', getEntryLabel(entry, index))}
                      style={tableInputStyle}
                      placeholder="Mud or water"
                    />
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => removeMudEntry(entry.id)}
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
        {hddData.mudTracking.length > 0 && (
          <div style={{ marginTop: '10px', textAlign: 'right', fontSize: '13px', color: '#495057' }}>
            <strong>Totals:</strong>{' '}
            Loads: {hddData.mudTracking.reduce((sum, e) => sum + (parseFloat(e.noOfLoads) || 0), 0)} | {' '}
            Cubes: {hddData.mudTracking.reduce((sum, e) => sum + (parseFloat(e.noOfCubes) || 0), 0)}
          </div>
        )}
      </div>

      {/* COMMENTS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📝 COMMENTS</div>
        <textarea
          value={hddData.comments}
          onFocus={() => handleFieldFocus('comments', hddData.comments)}
          onChange={(e) => updateField('comments', e.target.value)}
          onBlur={(e) => handleFieldBlur('comments', e.target.value, 'Comments')}
          placeholder="Additional comments, issues, or notes..."
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

export default HDDLog
