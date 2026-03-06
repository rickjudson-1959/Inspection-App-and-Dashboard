import React, { useState, useEffect, useRef } from 'react'
import ShieldedInput from './components/common/ShieldedInput.jsx'

// Base64 diagram image (extracted to constant to keep JSX readable)
const COUNTERBORE_DIAGRAM_SRC = "data:image/webp;base64,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"

function createDefaultWeld() {
  return {
    id: Date.now() + Math.random(),
    weldNumber: '',
    welderID: '',
    welderName: '',
    wpsNumber: '',
    preheatTemp: '',
    interpassTempMin: '',
    interpassTempMax: '',
    locationType: '',
    locationDescription: '',
    counterboreRequired: '',
    diagramValues: { boreLength: '', taperAngle: '', transitionWT: '', bevelAngle: '' },
    transitions: [],
    ndtType: '',
    ndtResult: '',
    ndtReportNo: '',
    repairRequired: '',
    repairType: '',
    repairWPS: '',
    repairWelder: ''
  }
}

// Migrate old flat format to new welds array format
function migrateData(data) {
  if (!data) return { welds: [createDefaultWeld()], comments: '' }
  if (data.welds) return data // Already migrated

  // Old flat format detected — migrate into welds array
  if (data.weldNumber || data.welderID || data.counterboreRequired || data.ndtType) {
    const weld = {
      id: Date.now(),
      weldNumber: data.weldNumber || '',
      welderID: data.welderID || '',
      welderName: data.welderName || '',
      wpsNumber: data.wpsNumber || '',
      preheatTemp: data.preheatTemp || '',
      interpassTempMin: data.interpassTempMin || '',
      interpassTempMax: data.interpassTempMax || '',
      locationType: data.locationType || '',
      locationDescription: data.locationDescription || '',
      counterboreRequired: data.counterboreRequired || '',
      diagramValues: { ...{ boreLength: '', taperAngle: '', transitionWT: '', bevelAngle: '' }, ...(data.diagramValues || {}) },
      transitions: data.transitions || [],
      ndtType: data.ndtType || '',
      ndtResult: data.ndtResult || '',
      ndtReportNo: data.ndtReportNo || '',
      repairRequired: data.repairRequired || '',
      repairType: data.repairType || '',
      repairWPS: data.repairWPS || '',
      repairWelder: data.repairWelder || ''
    }
    return { welds: [weld], comments: data.comments || '' }
  }

  return { welds: [createDefaultWeld()], comments: data.comments || '' }
}

function CounterboreTransitionLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, spread, afe }) {
  const migrated = useRef(false)
  const [collapsedWelds, setCollapsedWelds] = useState({})

  // Auto-migrate on first render
  useEffect(() => {
    if (!migrated.current) {
      migrated.current = true
      const result = migrateData(data)
      if (!data?.welds) {
        onChange(result)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const currentData = data?.welds ? data : migrateData(data)
  const welds = currentData.welds || [createDefaultWeld()]

  const updateData = (newData) => {
    onChange({ ...currentData, ...newData })
  }

  const updateWeld = (weldId, field, value) => {
    const updated = welds.map(w => w.id === weldId ? { ...w, [field]: value } : w)
    updateData({ welds: updated })
  }

  const updateWeldDiagram = (weldId, field, value) => {
    const updated = welds.map(w => {
      if (w.id !== weldId) return w
      return { ...w, diagramValues: { ...w.diagramValues, [field]: value } }
    })
    updateData({ welds: updated })
  }

  const addWeld = () => {
    updateData({ welds: [...welds, createDefaultWeld()] })
  }

  const removeWeld = (weldId) => {
    if (welds.length <= 1) return
    updateData({ welds: welds.filter(w => w.id !== weldId) })
  }

  const addTransition = (weldId) => {
    const newTransition = {
      id: Date.now() + Math.random(),
      transitionNo: '', heatPipeNo: '',
      ovalityQ1Q3: '', ovalityQ2Q4: '', ovalityAmount: '',
      wallThicknessQ1: '', wallThicknessQ2: '', wallThicknessQ3: '', wallThicknessQ4: '',
      taperAngle: '', counterBoreLength: '', weldBevelAngle: '', transitionWallThickness: '',
      acceptable: ''
    }
    const updated = welds.map(w => {
      if (w.id !== weldId) return w
      return { ...w, transitions: [...(w.transitions || []), newTransition] }
    })
    updateData({ welds: updated })
  }

  const updateTransition = (weldId, transId, field, value) => {
    const updated = welds.map(w => {
      if (w.id !== weldId) return w
      return { ...w, transitions: w.transitions.map(t => t.id === transId ? { ...t, [field]: value } : t) }
    })
    updateData({ welds: updated })
  }

  const removeTransition = (weldId, transId) => {
    const updated = welds.map(w => {
      if (w.id !== weldId) return w
      return { ...w, transitions: w.transitions.filter(t => t.id !== transId) }
    })
    updateData({ welds: updated })
  }

  const toggleCollapse = (weldId) => {
    setCollapsedWelds(prev => ({ ...prev, [weldId]: !prev[weldId] }))
  }

  // Styles
  const sectionStyle = { marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }
  const sectionHeaderStyle = { fontSize: '14px', fontWeight: 'bold', color: '#495057', marginBottom: '15px', paddingBottom: '8px', borderBottom: '2px solid #007bff' }
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }
  const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }
  const tableInputStyle = { width: '100%', padding: '4px', border: '1px solid #ced4da', borderRadius: '3px', fontSize: '12px', boxSizing: 'border-box', textAlign: 'center' }
  const thStyle = { padding: '8px 4px', backgroundColor: '#007bff', color: 'white', fontSize: '10px', fontWeight: 'bold', textAlign: 'center', border: '1px solid #0056b3', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '4px', border: '1px solid #dee2e6', textAlign: 'center', verticalAlign: 'middle' }

  const renderWeldCard = (weld, weldIdx) => {
    const isCollapsed = collapsedWelds[weld.id]
    const showCB = weld.counterboreRequired === 'Yes'

    return (
      <div key={weld.id} style={{ marginBottom: '20px', border: '2px solid #5c6bc0', borderRadius: '10px', overflow: 'hidden' }}>
        {/* Weld Card Header */}
        <div
          onClick={() => toggleCollapse(weld.id)}
          style={{
            padding: '12px 15px',
            backgroundColor: '#5c6bc0',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer'
          }}
        >
          <span style={{ fontWeight: 'bold', fontSize: '15px' }}>
            {isCollapsed ? '>' : 'v'} Weld #{weldIdx + 1}{weld.weldNumber ? ` — ${weld.weldNumber}` : ''}
          </span>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {weld.ndtResult && (
              <span style={{
                padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
                backgroundColor: weld.ndtResult === 'Accept' ? '#d4edda' : weld.ndtResult === 'Reject' ? '#f8d7da' : '#fff3cd',
                color: weld.ndtResult === 'Accept' ? '#155724' : weld.ndtResult === 'Reject' ? '#721c24' : '#856404'
              }}>
                NDT: {weld.ndtResult}
              </span>
            )}
            {welds.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); removeWeld(weld.id) }}
                style={{ padding: '4px 10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {!isCollapsed && (
          <div style={{ padding: '15px' }}>
            {/* TIE-IN WELD INFORMATION */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>Tie-in Weld Information</div>
              <div style={gridStyle}>
                <div>
                  <label style={labelStyle}>Weld Number</label>
                  <input type="text" value={weld.weldNumber} onChange={(e) => updateWeld(weld.id, 'weldNumber', e.target.value)} placeholder="e.g. TI-001" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Welder ID / Stencil</label>
                  <input type="text" value={weld.welderID} onChange={(e) => updateWeld(weld.id, 'welderID', e.target.value)} placeholder="Welder stencil" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Welder Name</label>
                  <input type="text" value={weld.welderName} onChange={(e) => updateWeld(weld.id, 'welderName', e.target.value)} placeholder="Full name" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>WPS Number</label>
                  <input type="text" value={weld.wpsNumber} onChange={(e) => updateWeld(weld.id, 'wpsNumber', e.target.value)} placeholder="WPS #" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Preheat Temp (C)</label>
                  <input type="text" inputMode="numeric" value={weld.preheatTemp} onChange={(e) => updateWeld(weld.id, 'preheatTemp', e.target.value)} placeholder="Min preheat" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Interpass Min (C)</label>
                  <input type="text" inputMode="numeric" value={weld.interpassTempMin} onChange={(e) => updateWeld(weld.id, 'interpassTempMin', e.target.value)} placeholder="Min" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Interpass Max (C)</label>
                  <input type="text" inputMode="numeric" value={weld.interpassTempMax} onChange={(e) => updateWeld(weld.id, 'interpassTempMax', e.target.value)} placeholder="Max" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Location Type</label>
                  <select value={weld.locationType} onChange={(e) => updateWeld(weld.id, 'locationType', e.target.value)} style={selectStyle}>
                    <option value="">Select...</option>
                    <option value="Road Crossing">Road Crossing</option>
                    <option value="Water Crossing">Water Crossing</option>
                    <option value="Foreign Line">Foreign Line Crossing</option>
                    <option value="Valve">Valve Station</option>
                    <option value="Launcher/Receiver">Launcher/Receiver</option>
                    <option value="Mainline">Mainline Tie-in</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>Location Description</label>
                  <input type="text" value={weld.locationDescription} onChange={(e) => updateWeld(weld.id, 'locationDescription', e.target.value)} placeholder="e.g. Road Crossing #3 at KP 5+250" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* COUNTERBORE REQUIRED TOGGLE */}
            <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: '20px' }}>
              <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Counterbore/Transition Required?</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                <input type="radio" name={`cbReq-${weld.id}`} value="Yes" checked={weld.counterboreRequired === 'Yes'} onChange={() => updateWeld(weld.id, 'counterboreRequired', 'Yes')} /> Yes
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                <input type="radio" name={`cbReq-${weld.id}`} value="No" checked={weld.counterboreRequired === 'No'} onChange={() => updateWeld(weld.id, 'counterboreRequired', 'No')} /> No
              </label>
            </div>

            {/* COUNTERBORE/TRANSITION DIAGRAM */}
            {showCB && (
              <>
                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>Counterbore / Transition</div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #dee2e6', maxWidth: '500px', width: '100%' }}>
                      <img src={COUNTERBORE_DIAGRAM_SRC} alt="Counterbore Transition Diagram" style={{ width: '100%', height: 'auto' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', width: '100%', maxWidth: '500px', padding: '15px', backgroundColor: '#e9ecef', borderRadius: '8px' }}>
                      <div>
                        <label style={labelStyle}>Bore Length (mm)</label>
                        <input type="text" inputMode="numeric" value={weld.diagramValues?.boreLength || ''} onChange={(e) => updateWeldDiagram(weld.id, 'boreLength', e.target.value)} placeholder="e.g. 50" style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Taper Angle</label>
                        <input type="text" inputMode="decimal" value={weld.diagramValues?.taperAngle || ''} onChange={(e) => updateWeldDiagram(weld.id, 'taperAngle', e.target.value)} placeholder="e.g. 14" style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Transition WT (mm)</label>
                        <input type="text" inputMode="decimal" value={weld.diagramValues?.transitionWT || ''} onChange={(e) => updateWeldDiagram(weld.id, 'transitionWT', e.target.value)} placeholder="e.g. 6.35" style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Bevel Angle</label>
                        <input type="text" inputMode="decimal" value={weld.diagramValues?.bevelAngle || ''} onChange={(e) => updateWeldDiagram(weld.id, 'bevelAngle', e.target.value)} placeholder="e.g. 30" style={inputStyle} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* TRANSITIONS TABLE */}
                <div style={sectionStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>Transition Records</div>
                    <button onClick={() => addTransition(weld.id)} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                      + Add Transition
                    </button>
                  </div>

                  {(!weld.transitions || weld.transitions.length === 0) ? (
                    <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                      No transitions recorded. Click "Add Transition" to document counterbore transitions.
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr>
                            <th style={thStyle} rowSpan="2">TRANS #</th>
                            <th style={thStyle} rowSpan="2">HEAT &<br/>PIPE #</th>
                            <th style={{ ...thStyle, backgroundColor: '#17a2b8' }} colSpan="3">OVALITY (ID)</th>
                            <th style={{ ...thStyle, backgroundColor: '#28a745' }} colSpan="4">WALL THICKNESS</th>
                            <th style={thStyle} rowSpan="2">TAPER<br/>ANGLE</th>
                            <th style={thStyle} rowSpan="2">BORE<br/>LENGTH<br/>(mm)</th>
                            <th style={thStyle} rowSpan="2">WELD<br/>BEVEL<br/>ANGLE</th>
                            <th style={thStyle} rowSpan="2">TRANS<br/>WT<br/>(mm)</th>
                            <th style={{ ...thStyle, backgroundColor: '#ffc107', color: '#212529' }} rowSpan="2">ACCEPT?</th>
                            <th style={thStyle} rowSpan="2"></th>
                          </tr>
                          <tr>
                            <th style={{ ...thStyle, backgroundColor: '#17a2b8', fontSize: '9px' }}>Q1-Q3</th>
                            <th style={{ ...thStyle, backgroundColor: '#17a2b8', fontSize: '9px' }}>Q2-Q4</th>
                            <th style={{ ...thStyle, backgroundColor: '#17a2b8', fontSize: '9px' }}>AMT</th>
                            <th style={{ ...thStyle, backgroundColor: '#28a745', fontSize: '9px' }}>Q1</th>
                            <th style={{ ...thStyle, backgroundColor: '#28a745', fontSize: '9px' }}>Q2</th>
                            <th style={{ ...thStyle, backgroundColor: '#28a745', fontSize: '9px' }}>Q3</th>
                            <th style={{ ...thStyle, backgroundColor: '#28a745', fontSize: '9px' }}>Q4</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weld.transitions.map((t, idx) => (
                            <tr key={t.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                              <td style={tdStyle}><input type="text" value={t.transitionNo} onChange={(e) => updateTransition(weld.id, t.id, 'transitionNo', e.target.value)} placeholder="#" style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={tdStyle}><input type="text" value={t.heatPipeNo} onChange={(e) => updateTransition(weld.id, t.id, 'heatPipeNo', e.target.value)} placeholder="Heat/Pipe" style={{ ...tableInputStyle, width: '80px' }} /></td>
                              <td style={{ ...tdStyle, backgroundColor: '#e3f2fd' }}><input type="text" inputMode="decimal" value={t.ovalityQ1Q3} onChange={(e) => updateTransition(weld.id, t.id, 'ovalityQ1Q3', e.target.value)} style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={{ ...tdStyle, backgroundColor: '#e3f2fd' }}><input type="text" inputMode="decimal" value={t.ovalityQ2Q4} onChange={(e) => updateTransition(weld.id, t.id, 'ovalityQ2Q4', e.target.value)} style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={{ ...tdStyle, backgroundColor: '#e3f2fd' }}><input type="text" inputMode="decimal" value={t.ovalityAmount} onChange={(e) => updateTransition(weld.id, t.id, 'ovalityAmount', e.target.value)} style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={{ ...tdStyle, backgroundColor: '#e8f5e9' }}><input type="text" inputMode="decimal" value={t.wallThicknessQ1} onChange={(e) => updateTransition(weld.id, t.id, 'wallThicknessQ1', e.target.value)} style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={{ ...tdStyle, backgroundColor: '#e8f5e9' }}><input type="text" inputMode="decimal" value={t.wallThicknessQ2} onChange={(e) => updateTransition(weld.id, t.id, 'wallThicknessQ2', e.target.value)} style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={{ ...tdStyle, backgroundColor: '#e8f5e9' }}><input type="text" inputMode="decimal" value={t.wallThicknessQ3} onChange={(e) => updateTransition(weld.id, t.id, 'wallThicknessQ3', e.target.value)} style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={{ ...tdStyle, backgroundColor: '#e8f5e9' }}><input type="text" inputMode="decimal" value={t.wallThicknessQ4} onChange={(e) => updateTransition(weld.id, t.id, 'wallThicknessQ4', e.target.value)} style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={tdStyle}><input type="text" inputMode="decimal" value={t.taperAngle} onChange={(e) => updateTransition(weld.id, t.id, 'taperAngle', e.target.value)} style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={tdStyle}><input type="text" inputMode="decimal" value={t.counterBoreLength} onChange={(e) => updateTransition(weld.id, t.id, 'counterBoreLength', e.target.value)} style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={tdStyle}><input type="text" inputMode="decimal" value={t.weldBevelAngle} onChange={(e) => updateTransition(weld.id, t.id, 'weldBevelAngle', e.target.value)} style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={tdStyle}><input type="text" inputMode="decimal" value={t.transitionWallThickness} onChange={(e) => updateTransition(weld.id, t.id, 'transitionWallThickness', e.target.value)} style={{ ...tableInputStyle, width: '50px' }} /></td>
                              <td style={tdStyle}>
                                <select value={t.acceptable} onChange={(e) => updateTransition(weld.id, t.id, 'acceptable', e.target.value)} style={{ ...tableInputStyle, width: '60px', backgroundColor: t.acceptable === 'Yes' ? '#d4edda' : t.acceptable === 'No' ? '#f8d7da' : 'white', fontWeight: 'bold' }}>
                                  <option value="">-</option>
                                  <option value="Yes">Yes</option>
                                  <option value="No">No</option>
                                </select>
                              </td>
                              <td style={tdStyle}>
                                <button onClick={() => removeTransition(weld.id, t.id)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>x</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {weld.transitions && weld.transitions.length > 0 && (
                    <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px', fontSize: '13px' }}>
                      <strong>Summary:</strong>{' '}
                      {weld.transitions.length} transition(s) |{' '}
                      Accepted: {weld.transitions.filter(t => t.acceptable === 'Yes').length} |{' '}
                      Rejected: {weld.transitions.filter(t => t.acceptable === 'No').length} |{' '}
                      Pending: {weld.transitions.filter(t => !t.acceptable).length}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* NDT SECTION */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>Non-Destructive Testing (NDT)</div>
              <div style={gridStyle}>
                <div>
                  <label style={labelStyle}>NDT Type</label>
                  <select value={weld.ndtType} onChange={(e) => updateWeld(weld.id, 'ndtType', e.target.value)} style={selectStyle}>
                    <option value="">Select...</option>
                    <option value="RT">RT - Radiographic</option>
                    <option value="UT">UT - Ultrasonic</option>
                    <option value="AUT">AUT - Automated UT</option>
                    <option value="MT">MT - Magnetic Particle</option>
                    <option value="PT">PT - Dye Penetrant</option>
                    <option value="VT">VT - Visual</option>
                    <option value="Combo">Combo (RT + UT)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>NDT Result</label>
                  <select value={weld.ndtResult} onChange={(e) => updateWeld(weld.id, 'ndtResult', e.target.value)} style={{ ...selectStyle, backgroundColor: weld.ndtResult === 'Accept' ? '#d4edda' : weld.ndtResult === 'Reject' ? '#f8d7da' : 'white', fontWeight: weld.ndtResult ? 'bold' : 'normal' }}>
                    <option value="">Select...</option>
                    <option value="Accept">Accept</option>
                    <option value="Reject">Reject</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>NDT Report No.</label>
                  <input type="text" value={weld.ndtReportNo} onChange={(e) => updateWeld(weld.id, 'ndtReportNo', e.target.value)} placeholder="Report number" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* REPAIR SECTION */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>Repair Information</div>
              <div style={gridStyle}>
                <div>
                  <label style={labelStyle}>Repair Required?</label>
                  <select value={weld.repairRequired} onChange={(e) => updateWeld(weld.id, 'repairRequired', e.target.value)} style={{ ...selectStyle, backgroundColor: weld.repairRequired === 'Yes' ? '#fff3cd' : weld.repairRequired === 'No' ? '#d4edda' : 'white' }}>
                    <option value="">Select...</option>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
                {weld.repairRequired === 'Yes' && (
                  <>
                    <div>
                      <label style={labelStyle}>Repair Type</label>
                      <select value={weld.repairType} onChange={(e) => updateWeld(weld.id, 'repairType', e.target.value)} style={selectStyle}>
                        <option value="">Select...</option>
                        <option value="Root">Root Repair</option>
                        <option value="Hot Pass">Hot Pass Repair</option>
                        <option value="Fill">Fill Repair</option>
                        <option value="Cap">Cap Repair</option>
                        <option value="Full Cutout">Full Cutout</option>
                        <option value="Back Weld">Back Weld</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Repair WPS</label>
                      <input type="text" value={weld.repairWPS} onChange={(e) => updateWeld(weld.id, 'repairWPS', e.target.value)} placeholder="WPS for repair" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Repair Welder ID</label>
                      <input type="text" value={weld.repairWelder} onChange={(e) => updateWeld(weld.id, 'repairWelder', e.target.value)} placeholder="Welder stencil" style={inputStyle} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop: '15px' }}>
      {/* INHERITED INFO BAR */}
      {(contractor || foreman || reportDate || spread || afe) && (
        <div style={{ padding: '12px 15px', backgroundColor: '#cce5ff', borderRadius: '6px', marginBottom: '15px', border: '1px solid #007bff' }}>
          <span style={{ fontSize: '13px', color: '#004085' }}>
            <strong>From Report:</strong>{' '}
            {reportDate && <>Date: <strong>{reportDate}</strong></>}
            {reportDate && spread && ' | '}
            {spread && <>Spread: <strong>{spread}</strong></>}
            {(reportDate || spread) && afe && ' | '}
            {afe && <>AFE: <strong>{afe}</strong></>}
          </span>
          <div style={{ marginTop: '6px' }}>
            <span style={{ fontSize: '13px', color: '#004085' }}>
              {contractor && <>Contractor: <strong>{contractor}</strong></>}
              {contractor && foreman && ' | '}
              {foreman && <>Foreman: <strong>{foreman}</strong></>}
            </span>
          </div>
          {(startKP || endKP) && (
            <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#b8daff', borderRadius: '4px' }}>
              <span style={{ fontSize: '13px', color: '#004085' }}>
                <strong>Chainage:</strong>{' '}
                {startKP && <>From: <strong>{startKP}</strong></>}
                {startKP && endKP && ' -> '}
                {endKP && <>To: <strong>{endKP}</strong></>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* + ADD WELD BUTTON */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
        <button
          onClick={addWeld}
          style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
        >
          + Add Weld
        </button>
      </div>

      {/* WELD CARDS */}
      {welds.map((weld, idx) => renderWeldCard(weld, idx))}

      {/* GLOBAL COMMENTS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Comments</div>
        <ShieldedInput
          as="textarea"
          value={currentData.comments || ''}
          onChange={(val) => updateData({ comments: val })}
          placeholder="Additional comments, observations, issues..."
          style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>
    </div>
  )
}

export default CounterboreTransitionLog
