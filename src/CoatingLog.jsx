import React, { useState, useEffect } from 'react'

// CoatingLog component for field joint coating inspection
// All inputs are inline - no nested components

function CoatingLog({ contractor, foreman, blockId, reportId, existingData, onDataChange }) {
  const [coatingData, setCoatingData] = useState(() => {
    const defaultData = {
      welds: [],
      surfacePrepEntries: [],
      ambientReadings: [{ time: '', wetBulb: '', dryBulb: '', dewPoint: '', humidity: '', steelTemp: '' }],
      surfacePrep: {},
      coatingMaterial: {},
      application: {},
      inspection: {},
      repairs: {},
      cureTests: [],
      signOff: {}
    }
    if (existingData && Object.keys(existingData).length > 0) {
      return { ...defaultData, ...existingData, welds: existingData.welds || [], surfacePrepEntries: existingData.surfacePrepEntries || [], ambientReadings: existingData.ambientReadings || defaultData.ambientReadings, cureTests: existingData.cureTests || [] }
    }
    return defaultData
  })

  const [expandedSections, setExpandedSections] = useState({
    'Weld Identification': true,
    'Ambient Conditions': false,
    'Surface Prep': false,
    'Coating Material': false,
    'Application': false,
    'Inspection': false,
    'Repairs': false,
    'Cure Tests': false,
    'Sign-Off': false
  })

  useEffect(() => {
    if (onDataChange) onDataChange(coatingData)
  }, [coatingData])

  const toggleSection = (name) => setExpandedSections(prev => ({ ...prev, [name]: !prev[name] }))

  const updateField = (section, field, value) => {
    setCoatingData(prev => ({ ...prev, [section]: { ...(prev[section] || {}), [field]: value } }))
  }

  const addWeld = () => setCoatingData(prev => ({ ...prev, welds: [...(prev.welds || []), { weldNumber: '', kp: '', diameter: '', wallThickness: '', grade: '', coatingCompany: contractor || '' }] }))
  const updateWeld = (idx, field, val) => setCoatingData(prev => ({ ...prev, welds: (prev.welds || []).map((w, i) => i === idx ? { ...w, [field]: val } : w) }))
  const removeWeld = (idx) => setCoatingData(prev => ({ ...prev, welds: (prev.welds || []).filter((_, i) => i !== idx) }))

  const addAmbientReading = () => {
    if ((coatingData.ambientReadings || []).length >= 3) { alert('Max 3 readings'); return }
    setCoatingData(prev => ({ ...prev, ambientReadings: [...(prev.ambientReadings || []), { time: '', wetBulb: '', dryBulb: '', dewPoint: '', humidity: '', steelTemp: '' }] }))
  }
  const updateAmbientReading = (idx, field, val) => setCoatingData(prev => ({ ...prev, ambientReadings: (prev.ambientReadings || []).map((r, i) => i === idx ? { ...r, [field]: val } : r) }))
  const removeAmbientReading = (idx) => {
    if ((coatingData.ambientReadings || []).length <= 1) { alert('Need at least one reading'); return }
    setCoatingData(prev => ({ ...prev, ambientReadings: (prev.ambientReadings || []).filter((_, i) => i !== idx) }))
  }

  const addCureTest = () => setCoatingData(prev => ({ ...prev, cureTests: [...(prev.cureTests || []), { weldNumber: '', vCutRating: '', shoreDHardness: '', pass: '' }] }))
  const updateCureTest = (idx, field, val) => setCoatingData(prev => ({ ...prev, cureTests: (prev.cureTests || []).map((t, i) => i === idx ? { ...t, [field]: val } : t) }))
  const removeCureTest = (idx) => setCoatingData(prev => ({ ...prev, cureTests: (prev.cureTests || []).filter((_, i) => i !== idx) }))

  // Surface Prep management (repeatable per weld)
  const addSurfacePrep = () => setCoatingData(prev => ({ ...prev, surfacePrepEntries: [...(prev.surfacePrepEntries || []), { weldNumber: '', contaminants: '', steelCondition: '', abrasiveType: '', conductivity: '', sweepBlast: '', surfaceCleaned: '', blastFinish: '', profileDepth1: '', profileDepth2: '', profileDepth3: '', tapeTest: '', timeBeforeCoating: '' }] }))
  const updateSurfacePrep = (idx, field, val) => setCoatingData(prev => ({ ...prev, surfacePrepEntries: (prev.surfacePrepEntries || []).map((s, i) => i === idx ? { ...s, [field]: val } : s) }))
  const removeSurfacePrep = (idx) => setCoatingData(prev => ({ ...prev, surfacePrepEntries: (prev.surfacePrepEntries || []).filter((_, i) => i !== idx) }))

  // Styles as objects (not functions)
  const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', color: '#555' }
  const sectionStyle = { marginBottom: '10px', border: '1px solid #dee2e6', borderRadius: '6px', overflow: 'hidden' }
  const contentStyle = { padding: '15px', backgroundColor: '#fff' }
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }

  return (
    <div style={{ marginTop: '15px' }}>
      
      {/* WELD IDENTIFICATION */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Weld Identification')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Weld Identification'] ? '#17a2b8' : '#e9ecef', color: expandedSections['Weld Identification'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Weld Identification ({(coatingData.welds || []).length})</span>
          <span>{expandedSections['Weld Identification'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Weld Identification'] && (
          <div style={contentStyle}>
            {(coatingData.welds || []).length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', margin: '0 0 15px 0' }}>No welds added. Click "Add Weld" to start.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '15px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '8px', border: '1px solid #dee2e6' }}>Weld #</th>
                    <th style={{ padding: '8px', border: '1px solid #dee2e6' }}>KP</th>
                    <th style={{ padding: '8px', border: '1px solid #dee2e6' }}>Dia</th>
                    <th style={{ padding: '8px', border: '1px solid #dee2e6' }}>Wall</th>
                    <th style={{ padding: '8px', border: '1px solid #dee2e6' }}>Grade</th>
                    <th style={{ padding: '8px', border: '1px solid #dee2e6' }}>Co.</th>
                    <th style={{ padding: '8px', border: '1px solid #dee2e6', width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(coatingData.welds || []).map((weld, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><input type="text" value={weld.weldNumber || ''} onChange={(e) => updateWeld(idx, 'weldNumber', e.target.value)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><input type="number" step="0.001" value={weld.kp || ''} onChange={(e) => updateWeld(idx, 'kp', e.target.value)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><input type="number" value={weld.diameter || ''} onChange={(e) => updateWeld(idx, 'diameter', e.target.value)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><input type="number" step="0.1" value={weld.wallThickness || ''} onChange={(e) => updateWeld(idx, 'wallThickness', e.target.value)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><input type="text" value={weld.grade || ''} onChange={(e) => updateWeld(idx, 'grade', e.target.value)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><input type="text" value={weld.coatingCompany || ''} onChange={(e) => updateWeld(idx, 'coatingCompany', e.target.value)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6', textAlign: 'center' }}><button type="button" onClick={() => removeWeld(idx)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button type="button" onClick={addWeld} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Weld</button>
          </div>
        )}
      </div>

      {/* AMBIENT CONDITIONS */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Ambient Conditions')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Ambient Conditions'] ? '#17a2b8' : '#e9ecef', color: expandedSections['Ambient Conditions'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🌡️ Ambient Conditions ({(coatingData.ambientReadings || []).length}/3)</span>
          <span>{expandedSections['Ambient Conditions'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Ambient Conditions'] && (
          <div style={contentStyle}>
            {(coatingData.ambientReadings || []).map((reading, idx) => (
              <div key={idx} style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <strong style={{ color: '#17a2b8' }}>Reading {idx + 1} {idx === 0 ? '(Morning)' : idx === 1 ? '(Midday)' : '(Afternoon)'}</strong>
                  {(coatingData.ambientReadings || []).length > 1 && <button type="button" onClick={() => removeAmbientReading(idx)} style={{ padding: '4px 10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
                  <div><label style={labelStyle}>Time</label><input type="time" value={reading.time || ''} onChange={(e) => updateAmbientReading(idx, 'time', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Wet Bulb (°C)</label><input type="number" step="0.1" value={reading.wetBulb || ''} onChange={(e) => updateAmbientReading(idx, 'wetBulb', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Dry Bulb (°C)</label><input type="number" step="0.1" value={reading.dryBulb || ''} onChange={(e) => updateAmbientReading(idx, 'dryBulb', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Dew Point (°C)</label><input type="number" step="0.1" value={reading.dewPoint || ''} onChange={(e) => updateAmbientReading(idx, 'dewPoint', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>RH (%)</label><input type="number" value={reading.humidity || ''} onChange={(e) => updateAmbientReading(idx, 'humidity', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Steel Temp (°C)</label><input type="number" step="0.1" value={reading.steelTemp || ''} onChange={(e) => updateAmbientReading(idx, 'steelTemp', e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
            ))}
            {(coatingData.ambientReadings || []).length < 3 && <button type="button" onClick={addAmbientReading} style={{ padding: '10px 20px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Reading</button>}
            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e7f3ff', borderRadius: '4px' }}>
              <label style={labelStyle}>Steel Temp ≥3°C Above Dew Point?</label>
              <select value={coatingData.surfacePrep?.steelAboveDewPoint || ''} onChange={(e) => updateField('surfacePrep', 'steelAboveDewPoint', e.target.value)} style={inputStyle}>
                <option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* SURFACE PREP - REPEATABLE PER WELD */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Surface Prep')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Surface Prep'] ? '#17a2b8' : '#e9ecef', color: expandedSections['Surface Prep'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Surface Prep & Blasting ({(coatingData.surfacePrepEntries || []).length})</span>
          <span>{expandedSections['Surface Prep'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Surface Prep'] && (
          <div style={contentStyle}>
            {(coatingData.surfacePrepEntries || []).length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', margin: '0 0 15px 0' }}>No surface prep entries. Click "Add Surface Prep" to start.</p>
            ) : (
              (coatingData.surfacePrepEntries || []).map((prep, idx) => (
                <div key={idx} style={{ marginBottom: '15px', padding: '15px', backgroundColor: idx % 2 === 0 ? '#f8f9fa' : '#fff', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#17a2b8' }}>Weld #{idx + 1}</strong>
                    <button type="button" onClick={() => removeSurfacePrep(idx)} style={{ padding: '4px 10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                  </div>
                  <div style={gridStyle}>
                    <div><label style={labelStyle}>Weld Number</label><input type="text" value={prep.weldNumber || ''} onChange={(e) => updateSurfacePrep(idx, 'weldNumber', e.target.value)} placeholder="W-1234" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Contaminants?</label><select value={prep.contaminants || ''} onChange={(e) => updateSurfacePrep(idx, 'contaminants', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="None">None</option><option value="Oil/Grease">Oil/Grease</option><option value="Rust">Rust</option><option value="Mill Scale">Mill Scale</option><option value="Other">Other</option></select></div>
                    <div><label style={labelStyle}>Steel Condition</label><select value={prep.steelCondition || ''} onChange={(e) => updateSurfacePrep(idx, 'steelCondition', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Clean">Clean</option><option value="Light Rust">Light Rust</option><option value="Heavy Rust">Heavy Rust</option><option value="Mill Scale">Mill Scale</option></select></div>
                    <div><label style={labelStyle}>Abrasive Type</label><input type="text" value={prep.abrasiveType || ''} onChange={(e) => updateSurfacePrep(idx, 'abrasiveType', e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Conductivity (µs)</label><input type="number" value={prep.conductivity || ''} onChange={(e) => updateSurfacePrep(idx, 'conductivity', e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Sweep Blast (mm)</label><input type="number" value={prep.sweepBlast || ''} onChange={(e) => updateSurfacePrep(idx, 'sweepBlast', e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Surface Cleaned?</label><select value={prep.surfaceCleaned || ''} onChange={(e) => updateSurfacePrep(idx, 'surfaceCleaned', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
                    <div><label style={labelStyle}>Blast Finish</label><select value={prep.blastFinish || ''} onChange={(e) => updateSurfacePrep(idx, 'blastFinish', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Near White">Near White</option><option value="White Metal">White Metal</option><option value="Commercial">Commercial</option><option value="Other">Other</option></select></div>
                  </div>
                  <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
                    <label style={{ ...labelStyle, marginBottom: '8px' }}>Profile Depth (mils)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      <div><label style={labelStyle}>#1</label><input type="number" value={prep.profileDepth1 || ''} onChange={(e) => updateSurfacePrep(idx, 'profileDepth1', e.target.value)} style={inputStyle} /></div>
                      <div><label style={labelStyle}>#2</label><input type="number" value={prep.profileDepth2 || ''} onChange={(e) => updateSurfacePrep(idx, 'profileDepth2', e.target.value)} style={inputStyle} /></div>
                      <div><label style={labelStyle}>#3</label><input type="number" value={prep.profileDepth3 || ''} onChange={(e) => updateSurfacePrep(idx, 'profileDepth3', e.target.value)} style={inputStyle} /></div>
                    </div>
                  </div>
                  <div style={{ ...gridStyle, marginTop: '10px' }}>
                    <div><label style={labelStyle}>Tape Test (%)</label><input type="number" value={prep.tapeTest || ''} onChange={(e) => updateSurfacePrep(idx, 'tapeTest', e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Time Before Coating (mins)</label><input type="number" value={prep.timeBeforeCoating || ''} onChange={(e) => updateSurfacePrep(idx, 'timeBeforeCoating', e.target.value)} style={inputStyle} /></div>
                  </div>
                </div>
              ))
            )}
            <button type="button" onClick={addSurfacePrep} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Surface Prep</button>
          </div>
        )}
      </div>

      {/* COATING MATERIAL */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Coating Material')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Coating Material'] ? '#17a2b8' : '#e9ecef', color: expandedSections['Coating Material'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Coating Material</span>
          <span>{expandedSections['Coating Material'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Coating Material'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>Coating System</label><select value={coatingData.coatingMaterial?.coatingType || ''} onChange={(e) => updateField('coatingMaterial', 'coatingType', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Shrink Sleeve">Shrink Sleeve</option><option value="FBE">FBE</option><option value="3LPE">3LPE</option><option value="3LPP">3LPP</option><option value="Tape Wrap">Tape Wrap</option><option value="Liquid Epoxy">Liquid Epoxy</option><option value="Other">Other</option></select></div>
              <div><label style={labelStyle}>Shrink Sleeve Type</label><input type="text" value={coatingData.coatingMaterial?.sleeveType || ''} onChange={(e) => updateField('coatingMaterial', 'sleeveType', e.target.value)} placeholder="e.g., Canusa GTS-65" style={inputStyle} /></div>
              <div><label style={labelStyle}>Base Batch No.</label><input type="text" value={coatingData.coatingMaterial?.baseBatch || ''} onChange={(e) => updateField('coatingMaterial', 'baseBatch', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Hardener Batch No.</label><input type="text" value={coatingData.coatingMaterial?.hardenerBatch || ''} onChange={(e) => updateField('coatingMaterial', 'hardenerBatch', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Hardener Expiry</label><input type="date" value={coatingData.coatingMaterial?.hardenerExpiry || ''} onChange={(e) => updateField('coatingMaterial', 'hardenerExpiry', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Storage Temp (°C)</label><input type="number" value={coatingData.coatingMaterial?.storageTemp || ''} onChange={(e) => updateField('coatingMaterial', 'storageTemp', e.target.value)} style={inputStyle} /></div>
            </div>
          </div>
        )}
      </div>

      {/* PREHEAT & APPLICATION */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Application')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Application'] ? '#17a2b8' : '#e9ecef', color: expandedSections['Application'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Preheat & Application</span>
          <span>{expandedSections['Application'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Application'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>Surface Still Near White?</label><select value={coatingData.application?.stillNearWhite || ''} onChange={(e) => updateField('application', 'stillNearWhite', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
              <div><label style={labelStyle}>Preheat Method</label><select value={coatingData.application?.preheatMethod || ''} onChange={(e) => updateField('application', 'preheatMethod', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Propane Torch">Propane Torch</option><option value="Induction">Induction</option><option value="Electric Blanket">Electric Blanket</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Preheat Temp (°C)</label><input type="number" value={coatingData.application?.preheatTemp || ''} onChange={(e) => updateField('application', 'preheatTemp', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Time to Preheat (mins)</label><input type="number" value={coatingData.application?.timeToPreheat || ''} onChange={(e) => updateField('application', 'timeToPreheat', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Application Method</label><select value={coatingData.application?.appMethod || ''} onChange={(e) => updateField('application', 'appMethod', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Spray">Spray</option><option value="Brush">Brush</option><option value="Automatic">Automatic</option></select></div>
              <div><label style={labelStyle}>Mix to Coat Time (mins)</label><input type="number" value={coatingData.application?.mixToCoatTime || ''} onChange={(e) => updateField('application', 'mixToCoatTime', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Temp When Applied (°C)</label><input type="number" value={coatingData.application?.tempWhenApplied || ''} onChange={(e) => updateField('application', 'tempWhenApplied', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Time to Coat (mins)</label><input type="number" value={coatingData.application?.timeToCoat || ''} onChange={(e) => updateField('application', 'timeToCoat', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Visual Appearance</label><select value={coatingData.application?.visualAppearance || ''} onChange={(e) => updateField('application', 'visualAppearance', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Acceptable">Acceptable</option><option value="Minor Defects">Minor Defects</option><option value="Requires Repair">Requires Repair</option></select></div>
            </div>
          </div>
        )}
      </div>

      {/* INSPECTION & HOLIDAY DETECTION */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Inspection')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Inspection'] ? '#17a2b8' : '#e9ecef', color: expandedSections['Inspection'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Inspection & Holiday Detection</span>
          <span>{expandedSections['Inspection'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Inspection'] && (
          <div style={contentStyle}>
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              <label style={{ ...labelStyle, marginBottom: '10px' }}>DFT Thickness (mils)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                {[1,2,3,4,5,6].map(n => (<div key={n}><label style={{ display: 'block', fontSize: '10px', color: '#666' }}>#{n}</label><input type="number" value={coatingData.inspection?.[`dft${n}`] || ''} onChange={(e) => updateField('inspection', `dft${n}`, e.target.value)} style={inputStyle} /></div>))}
              </div>
            </div>
            <div style={gridStyle}>
              <div><label style={labelStyle}>DFT Min Spec (mils)</label><input type="number" value={coatingData.inspection?.dftMinSpec || ''} onChange={(e) => updateField('inspection', 'dftMinSpec', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>DFT Compliant?</label><select value={coatingData.inspection?.dftCompliant || ''} onChange={(e) => updateField('inspection', 'dftCompliant', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No - Low Mils">No - Low Mils</option></select></div>
              <div><label style={labelStyle}>Holiday Voltage (V)</label><input type="number" value={coatingData.inspection?.holidayVoltage || ''} onChange={(e) => updateField('inspection', 'holidayVoltage', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Detector ID</label><input type="text" value={coatingData.inspection?.detectorId || ''} onChange={(e) => updateField('inspection', 'detectorId', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Calibration Date</label><input type="date" value={coatingData.inspection?.calibrationDate || ''} onChange={(e) => updateField('inspection', 'calibrationDate', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Jeeps &lt;25mm</label><input type="number" value={coatingData.inspection?.jeepsUnder25 || ''} onChange={(e) => updateField('inspection', 'jeepsUnder25', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Jeeps &gt;25mm</label><input type="number" value={coatingData.inspection?.jeepsOver25 || ''} onChange={(e) => updateField('inspection', 'jeepsOver25', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Total Jeeps Today</label><input type="number" value={coatingData.inspection?.totalJeeps || ''} onChange={(e) => updateField('inspection', 'totalJeeps', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Low Mils Today</label><input type="number" value={coatingData.inspection?.lowMilsToday || ''} onChange={(e) => updateField('inspection', 'lowMilsToday', e.target.value)} style={inputStyle} /></div>
            </div>
          </div>
        )}
      </div>

      {/* REPAIRS */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Repairs')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Repairs'] ? '#17a2b8' : '#e9ecef', color: expandedSections['Repairs'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🔧 Repairs</span>
          <span>{expandedSections['Repairs'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Repairs'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>Repairs Required?</label><select value={coatingData.repairs?.required || ''} onChange={(e) => updateField('repairs', 'required', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
              <div><label style={labelStyle}>Patch Stick Type</label><input type="text" value={coatingData.repairs?.patchStickType || ''} onChange={(e) => updateField('repairs', 'patchStickType', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Liquid Repair Type</label><input type="text" value={coatingData.repairs?.liquidRepairType || ''} onChange={(e) => updateField('repairs', 'liquidRepairType', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Spec Followed?</label><select value={coatingData.repairs?.specFollowed || ''} onChange={(e) => updateField('repairs', 'specFollowed', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Repair Tested?</label><select value={coatingData.repairs?.repairTested || ''} onChange={(e) => updateField('repairs', 'repairTested', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Pass">Pass</option><option value="Fail">Fail</option><option value="N/A">N/A</option></select></div>
            </div>
            {coatingData.repairs?.required === 'Yes' && (
              <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                <label style={{ ...labelStyle, marginBottom: '10px', color: '#856404' }}>Repair Thickness (mils)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div><label style={labelStyle}>#1</label><input type="number" value={coatingData.repairs?.thickness1 || ''} onChange={(e) => updateField('repairs', 'thickness1', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>#2</label><input type="number" value={coatingData.repairs?.thickness2 || ''} onChange={(e) => updateField('repairs', 'thickness2', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>#3</label><input type="number" value={coatingData.repairs?.thickness3 || ''} onChange={(e) => updateField('repairs', 'thickness3', e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CURE TESTS */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Cure Tests')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Cure Tests'] ? '#17a2b8' : '#e9ecef', color: expandedSections['Cure Tests'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🧪 Cure Tests ({(coatingData.cureTests || []).length})</span>
          <span>{expandedSections['Cure Tests'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Cure Tests'] && (
          <div style={contentStyle}>
            {(coatingData.cureTests || []).length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', margin: '0 0 15px 0' }}>No cure tests added.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '15px' }}>
                <thead><tr style={{ backgroundColor: '#f8f9fa' }}><th style={{ padding: '8px', border: '1px solid #dee2e6' }}>Weld #</th><th style={{ padding: '8px', border: '1px solid #dee2e6' }}>V-Cut</th><th style={{ padding: '8px', border: '1px solid #dee2e6' }}>Shore-D</th><th style={{ padding: '8px', border: '1px solid #dee2e6' }}>Pass?</th><th style={{ padding: '8px', border: '1px solid #dee2e6', width: '40px' }}></th></tr></thead>
                <tbody>
                  {(coatingData.cureTests || []).map((test, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><input type="text" value={test.weldNumber || ''} onChange={(e) => updateCureTest(idx, 'weldNumber', e.target.value)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><select value={test.vCutRating || ''} onChange={(e) => updateCureTest(idx, 'vCutRating', e.target.value)} style={{ ...inputStyle, padding: '6px' }}><option value="">-</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><input type="number" value={test.shoreDHardness || ''} onChange={(e) => updateCureTest(idx, 'shoreDHardness', e.target.value)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><select value={test.pass || ''} onChange={(e) => updateCureTest(idx, 'pass', e.target.value)} style={{ ...inputStyle, padding: '6px' }}><option value="">-</option><option value="Yes">Yes</option><option value="No">No</option></select></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6', textAlign: 'center' }}><button type="button" onClick={() => removeCureTest(idx)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button type="button" onClick={addCureTest} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Cure Test</button>
          </div>
        )}
      </div>

      {/* SIGN-OFF */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Sign-Off')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Sign-Off'] ? '#17a2b8' : '#e9ecef', color: expandedSections['Sign-Off'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Sign-Off</span>
          <span>{expandedSections['Sign-Off'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Sign-Off'] && (
          <div style={contentStyle}>
            <div style={{ marginBottom: '15px' }}><label style={labelStyle}>NCR Required?</label><select value={coatingData.signOff?.ncrRequired || ''} onChange={(e) => updateField('signOff', 'ncrRequired', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="No">No</option><option value="Yes - Issued">Yes - Issued</option><option value="Yes - Pending">Yes - Pending</option></select></div>
            <div><label style={labelStyle}>Inspector Notes</label><textarea value={coatingData.signOff?.notes || ''} onChange={(e) => updateField('signOff', 'notes', e.target.value)} placeholder="Additional observations..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} /></div>
          </div>
        )}
      </div>

    </div>
  )
}

export default CoatingLog
