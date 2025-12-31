import React from 'react'

function HDDLog({ data, onChange }) {
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
  }

  const updateMudEntry = (id, field, value) => {
    const updated = hddData.mudTracking.map(entry =>
      entry.id === id ? { ...entry, [field]: value } : entry
    )
    onChange({ ...hddData, mudTracking: updated })
  }

  const removeMudEntry = (id) => {
    onChange({ ...hddData, mudTracking: hddData.mudTracking.filter(e => e.id !== id) })
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

  const smallInputStyle = {
    ...inputStyle,
    padding: '6px',
    fontSize: '13px'
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
              onChange={(e) => updateField('hddDate', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Drill Contractor</label>
            <input
              type="text"
              value={hddData.drillContractor}
              onChange={(e) => updateField('drillContractor', e.target.value)}
              placeholder="HDD Contractor name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Mainline Contractor</label>
            <input
              type="text"
              value={hddData.mainlineContractor}
              onChange={(e) => updateField('mainlineContractor', e.target.value)}
              placeholder="Mainline Contractor"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Foreman</label>
            <input
              type="text"
              value={hddData.foreman}
              onChange={(e) => updateField('foreman', e.target.value)}
              placeholder="Foreman name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Drill Location (KP)</label>
            <input
              type="text"
              value={hddData.drillLocationKP}
              onChange={(e) => updateField('drillLocationKP', e.target.value)}
              placeholder="e.g. 5+250"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Drill Length (m)</label>
            <input
              type="number"
              value={hddData.drillLengthM}
              onChange={(e) => updateField('drillLengthM', e.target.value)}
              placeholder="Total length"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Drills To Date (m)</label>
            <input
              type="number"
              value={hddData.drillsToDateM}
              onChange={(e) => updateField('drillsToDateM', e.target.value)}
              placeholder="Cumulative"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Pipe Size</label>
            <input
              type="text"
              value={hddData.pipeSize}
              onChange={(e) => updateField('pipeSize', e.target.value)}
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
            <tr>
              <td style={tdLabelStyle}>Site Preparation</td>
              <td style={tdStyle}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={hddData.activities.sitePreparation.today}
                  onChange={(e) => updateActivity('sitePreparation', 'today', e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={hddData.activities.sitePreparation.previous}
                  onChange={(e) => updateActivity('sitePreparation', 'previous', e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  value={hddData.activities.sitePreparation.toDate}
                  readOnly
                  style={calculatedStyle}
                />
              </td>
            </tr>
            <tr>
              <td style={tdLabelStyle}>Rig Set Up</td>
              <td style={tdStyle}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={hddData.activities.rigSetUp.today}
                  onChange={(e) => updateActivity('rigSetUp', 'today', e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={hddData.activities.rigSetUp.previous}
                  onChange={(e) => updateActivity('rigSetUp', 'previous', e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  value={hddData.activities.rigSetUp.toDate}
                  readOnly
                  style={calculatedStyle}
                />
              </td>
            </tr>
            <tr>
              <td style={tdLabelStyle}>
                Set Casing (If Applicable)
                <div style={{ marginTop: '5px' }}>
                  <span style={{ fontSize: '11px', color: '#666' }}>Length (m): </span>
                  <input
                    type="number"
                    value={hddData.activities.setCasing.lengthM}
                    onChange={(e) => updateActivity('setCasing', 'lengthM', e.target.value)}
                    style={{ ...tableInputStyle, width: '80px', display: 'inline-block' }}
                    placeholder="m"
                  />
                </div>
              </td>
              <td style={tdStyle}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={hddData.activities.setCasing.today}
                  onChange={(e) => updateActivity('setCasing', 'today', e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={hddData.activities.setCasing.previous}
                  onChange={(e) => updateActivity('setCasing', 'previous', e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  value={hddData.activities.setCasing.toDate}
                  readOnly
                  style={calculatedStyle}
                />
              </td>
            </tr>
            <tr>
              <td style={tdLabelStyle}>Remove Casing</td>
              <td style={tdStyle}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={hddData.activities.removeCasing.today}
                  onChange={(e) => updateActivity('removeCasing', 'today', e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={hddData.activities.removeCasing.previous}
                  onChange={(e) => updateActivity('removeCasing', 'previous', e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  value={hddData.activities.removeCasing.toDate}
                  readOnly
                  style={calculatedStyle}
                />
              </td>
            </tr>
            <tr>
              <td style={tdLabelStyle}>Site Demobilization</td>
              <td style={tdStyle}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={hddData.activities.siteDemobilization.today}
                  onChange={(e) => updateActivity('siteDemobilization', 'today', e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={hddData.activities.siteDemobilization.previous}
                  onChange={(e) => updateActivity('siteDemobilization', 'previous', e.target.value)}
                  style={tableInputStyle}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  value={hddData.activities.siteDemobilization.toDate}
                  readOnly
                  style={calculatedStyle}
                />
              </td>
            </tr>
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
            {[
              { key: 'pilotHole', label: 'Pilot Hole' },
              { key: 'ream1', label: '#1 Ream' },
              { key: 'ream2', label: '#2 Ream' },
              { key: 'ream3', label: '#3 Ream' },
              { key: 'ream4', label: '#4 Ream' },
              { key: 'swabPass', label: 'Swab Pass' },
              { key: 'pipePull', label: 'Pipe Pull' }
            ].map(item => (
              <tr key={item.key}>
                <td style={tdLabelStyle}>{item.label}</td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={hddData.drillingProgress[item.key].sizeInches}
                    onChange={(e) => updateDrilling(item.key, 'sizeInches', e.target.value)}
                    style={tableInputStyle}
                    placeholder="in"
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={hddData.drillingProgress[item.key].todayM}
                    onChange={(e) => updateDrilling(item.key, 'todayM', e.target.value)}
                    style={tableInputStyle}
                    placeholder="m"
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    value={hddData.drillingProgress[item.key].previousM}
                    onChange={(e) => updateDrilling(item.key, 'previousM', e.target.value)}
                    style={tableInputStyle}
                    placeholder="m"
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="text"
                    value={hddData.drillingProgress[item.key].toDateM}
                    readOnly
                    style={calculatedStyle}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="text"
                    value={hddData.drillingProgress[item.key].percentComplete ? `${hddData.drillingProgress[item.key].percentComplete}%` : ''}
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
              {hddData.mudTracking.map(entry => (
                <tr key={entry.id}>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={entry.company}
                      onChange={(e) => updateMudEntry(entry.id, 'company', e.target.value)}
                      style={tableInputStyle}
                      placeholder="Company"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={entry.ticketNo}
                      onChange={(e) => updateMudEntry(entry.id, 'ticketNo', e.target.value)}
                      style={tableInputStyle}
                      placeholder="Ticket #"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={entry.noOfLoads}
                      onChange={(e) => updateMudEntry(entry.id, 'noOfLoads', e.target.value)}
                      style={tableInputStyle}
                      placeholder="0"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={entry.noOfCubes}
                      onChange={(e) => updateMudEntry(entry.id, 'noOfCubes', e.target.value)}
                      style={tableInputStyle}
                      placeholder="0"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={entry.comments}
                      onChange={(e) => updateMudEntry(entry.id, 'comments', e.target.value)}
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
          onChange={(e) => updateField('comments', e.target.value)}
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
