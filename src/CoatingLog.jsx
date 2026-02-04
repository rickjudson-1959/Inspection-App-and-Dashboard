import React, { useState, useEffect } from 'react'
import ShieldedInput from './components/common/ShieldedInput.jsx'

// CoatingLog component for field joint coating inspection
// All inputs use ShieldedInput - no raw DOM inputs

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
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><ShieldedInput type="text" value={weld.weldNumber || ''} onChange={(val) => updateWeld(idx, 'weldNumber', val)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><ShieldedInput type="text" inputMode="decimal" value={weld.kp || ''} onChange={(val) => updateWeld(idx, 'kp', val)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><ShieldedInput type="text" inputMode="decimal" value={weld.diameter || ''} onChange={(val) => updateWeld(idx, 'diameter', val)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><ShieldedInput type="text" inputMode="decimal" value={weld.wallThickness || ''} onChange={(val) => updateWeld(idx, 'wallThickness', val)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><ShieldedInput type="text" value={weld.grade || ''} onChange={(val) => updateWeld(idx, 'grade', val)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><ShieldedInput type="text" value={weld.coatingCompany || ''} onChange={(val) => updateWeld(idx, 'coatingCompany', val)} style={{ ...inputStyle, padding: '6px' }} /></td>
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
                  <div><label style={labelStyle}>Time</label><ShieldedInput type="time" value={reading.time || ''} onChange={(val) => updateAmbientReading(idx, 'time', val)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Wet Bulb (°C)</label><ShieldedInput type="text" inputMode="decimal" value={reading.wetBulb || ''} onChange={(val) => updateAmbientReading(idx, 'wetBulb', val)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Dry Bulb (°C)</label><ShieldedInput type="text" inputMode="decimal" value={reading.dryBulb || ''} onChange={(val) => updateAmbientReading(idx, 'dryBulb', val)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Dew Point (°C)</label><ShieldedInput type="text" inputMode="decimal" value={reading.dewPoint || ''} onChange={(val) => updateAmbientReading(idx, 'dewPoint', val)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>RH (%)</label><ShieldedInput type="text" inputMode="decimal" value={reading.humidity || ''} onChange={(val) => updateAmbientReading(idx, 'humidity', val)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Steel Temp (°C)</label><ShieldedInput type="text" inputMode="decimal" value={reading.steelTemp || ''} onChange={(val) => updateAmbientReading(idx, 'steelTemp', val)} style={inputStyle} /></div>
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
                    <div><label style={labelStyle}>Weld Number</label><ShieldedInput type="text" value={prep.weldNumber || ''} onChange={(val) => updateSurfacePrep(idx, 'weldNumber', val)} placeholder="W-1234" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Contaminants?</label><select value={prep.contaminants || ''} onChange={(e) => updateSurfacePrep(idx, 'contaminants', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="None">None</option><option value="Oil/Grease">Oil/Grease</option><option value="Rust">Rust</option><option value="Mill Scale">Mill Scale</option><option value="Other">Other</option></select></div>
                    <div><label style={labelStyle}>Steel Condition</label><select value={prep.steelCondition || ''} onChange={(e) => updateSurfacePrep(idx, 'steelCondition', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Clean">Clean</option><option value="Light Rust">Light Rust</option><option value="Heavy Rust">Heavy Rust</option><option value="Mill Scale">Mill Scale</option></select></div>
                    <div><label style={labelStyle}>Abrasive Type</label><ShieldedInput type="text" value={prep.abrasiveType || ''} onChange={(val) => updateSurfacePrep(idx, 'abrasiveType', val)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Conductivity (µs)</label><ShieldedInput type="text" inputMode="decimal" value={prep.conductivity || ''} onChange={(val) => updateSurfacePrep(idx, 'conductivity', val)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Sweep Blast (mm)</label><ShieldedInput type="text" inputMode="decimal" value={prep.sweepBlast || ''} onChange={(val) => updateSurfacePrep(idx, 'sweepBlast', val)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Surface Cleaned?</label><select value={prep.surfaceCleaned || ''} onChange={(e) => updateSurfacePrep(idx, 'surfaceCleaned', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
                    <div><label style={labelStyle}>Blast Finish</label><select value={prep.blastFinish || ''} onChange={(e) => updateSurfacePrep(idx, 'blastFinish', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Near White">Near White</option><option value="White Metal">White Metal</option><option value="Commercial">Commercial</option><option value="Other">Other</option></select></div>
                  </div>
                  <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
                    <label style={{ ...labelStyle, marginBottom: '8px' }}>Profile Depth (mils)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      <div><label style={labelStyle}>#1</label><ShieldedInput type="text" inputMode="decimal" value={prep.profileDepth1 || ''} onChange={(val) => updateSurfacePrep(idx, 'profileDepth1', val)} style={inputStyle} /></div>
                      <div><label style={labelStyle}>#2</label><ShieldedInput type="text" inputMode="decimal" value={prep.profileDepth2 || ''} onChange={(val) => updateSurfacePrep(idx, 'profileDepth2', val)} style={inputStyle} /></div>
                      <div><label style={labelStyle}>#3</label><ShieldedInput type="text" inputMode="decimal" value={prep.profileDepth3 || ''} onChange={(val) => updateSurfacePrep(idx, 'profileDepth3', val)} style={inputStyle} /></div>
                    </div>
                  </div>
                  <div style={{ ...gridStyle, marginTop: '10px' }}>
                    <div><label style={labelStyle}>Tape Test (%)</label><ShieldedInput type="text" inputMode="decimal" value={prep.tapeTest || ''} onChange={(val) => updateSurfacePrep(idx, 'tapeTest', val)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Time Before Coating (mins)</label><ShieldedInput type="text" inputMode="decimal" value={prep.timeBeforeCoating || ''} onChange={(val) => updateSurfacePrep(idx, 'timeBeforeCoating', val)} style={inputStyle} /></div>
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
              <div><label style={labelStyle}>Shrink Sleeve Type</label><ShieldedInput type="text" value={coatingData.coatingMaterial?.sleeveType || ''} onChange={(val) => updateField('coatingMaterial', 'sleeveType', val)} placeholder="e.g., Canusa GTS-65" style={inputStyle} /></div>
              <div><label style={labelStyle}>Base Batch No.</label><ShieldedInput type="text" value={coatingData.coatingMaterial?.baseBatch || ''} onChange={(val) => updateField('coatingMaterial', 'baseBatch', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Hardener Batch No.</label><ShieldedInput type="text" value={coatingData.coatingMaterial?.hardenerBatch || ''} onChange={(val) => updateField('coatingMaterial', 'hardenerBatch', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Hardener Expiry</label><ShieldedInput type="date" value={coatingData.coatingMaterial?.hardenerExpiry || ''} onChange={(val) => updateField('coatingMaterial', 'hardenerExpiry', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Storage Temp (°C)</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.coatingMaterial?.storageTemp || ''} onChange={(val) => updateField('coatingMaterial', 'storageTemp', val)} style={inputStyle} /></div>
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
              <div><label style={labelStyle}>Preheat Temp (°C)</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.application?.preheatTemp || ''} onChange={(val) => updateField('application', 'preheatTemp', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Time to Preheat (mins)</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.application?.timeToPreheat || ''} onChange={(val) => updateField('application', 'timeToPreheat', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Application Method</label><select value={coatingData.application?.appMethod || ''} onChange={(e) => updateField('application', 'appMethod', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Spray">Spray</option><option value="Brush">Brush</option><option value="Automatic">Automatic</option></select></div>
              <div><label style={labelStyle}>Mix to Coat Time (mins)</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.application?.mixToCoatTime || ''} onChange={(val) => updateField('application', 'mixToCoatTime', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Temp When Applied (°C)</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.application?.tempWhenApplied || ''} onChange={(val) => updateField('application', 'tempWhenApplied', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Time to Coat (mins)</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.application?.timeToCoat || ''} onChange={(val) => updateField('application', 'timeToCoat', val)} style={inputStyle} /></div>
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
                {[1,2,3,4,5,6].map(n => (<div key={n}><label style={{ display: 'block', fontSize: '10px', color: '#666' }}>#{n}</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.inspection?.[`dft${n}`] || ''} onChange={(val) => updateField('inspection', `dft${n}`, val)} style={inputStyle} /></div>))}
              </div>
            </div>
            <div style={gridStyle}>
              <div><label style={labelStyle}>DFT Min Spec (mils)</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.inspection?.dftMinSpec || ''} onChange={(val) => updateField('inspection', 'dftMinSpec', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>DFT Compliant?</label><select value={coatingData.inspection?.dftCompliant || ''} onChange={(e) => updateField('inspection', 'dftCompliant', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No - Low Mils">No - Low Mils</option></select></div>
              <div><label style={labelStyle}>Holiday Voltage (V)</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.inspection?.holidayVoltage || ''} onChange={(val) => updateField('inspection', 'holidayVoltage', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Detector ID</label><ShieldedInput type="text" value={coatingData.inspection?.detectorId || ''} onChange={(val) => updateField('inspection', 'detectorId', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Calibration Date</label><ShieldedInput type="date" value={coatingData.inspection?.calibrationDate || ''} onChange={(val) => updateField('inspection', 'calibrationDate', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Jeeps &lt;25mm</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.inspection?.jeepsUnder25 || ''} onChange={(val) => updateField('inspection', 'jeepsUnder25', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Jeeps &gt;25mm</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.inspection?.jeepsOver25 || ''} onChange={(val) => updateField('inspection', 'jeepsOver25', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Total Jeeps Today</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.inspection?.totalJeeps || ''} onChange={(val) => updateField('inspection', 'totalJeeps', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Low Mils Today</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.inspection?.lowMilsToday || ''} onChange={(val) => updateField('inspection', 'lowMilsToday', val)} style={inputStyle} /></div>
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
              <div><label style={labelStyle}>Patch Stick Type</label><ShieldedInput type="text" value={coatingData.repairs?.patchStickType || ''} onChange={(val) => updateField('repairs', 'patchStickType', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Liquid Repair Type</label><ShieldedInput type="text" value={coatingData.repairs?.liquidRepairType || ''} onChange={(val) => updateField('repairs', 'liquidRepairType', val)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Spec Followed?</label><select value={coatingData.repairs?.specFollowed || ''} onChange={(e) => updateField('repairs', 'specFollowed', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Repair Tested?</label><select value={coatingData.repairs?.repairTested || ''} onChange={(e) => updateField('repairs', 'repairTested', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Pass">Pass</option><option value="Fail">Fail</option><option value="N/A">N/A</option></select></div>
            </div>
            {coatingData.repairs?.required === 'Yes' && (
              <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                <label style={{ ...labelStyle, marginBottom: '10px', color: '#856404' }}>Repair Thickness (mils)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div><label style={labelStyle}>#1</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.repairs?.thickness1 || ''} onChange={(val) => updateField('repairs', 'thickness1', val)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>#2</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.repairs?.thickness2 || ''} onChange={(val) => updateField('repairs', 'thickness2', val)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>#3</label><ShieldedInput type="text" inputMode="decimal" value={coatingData.repairs?.thickness3 || ''} onChange={(val) => updateField('repairs', 'thickness3', val)} style={inputStyle} /></div>
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
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><ShieldedInput type="text" value={test.weldNumber || ''} onChange={(val) => updateCureTest(idx, 'weldNumber', val)} style={{ ...inputStyle, padding: '6px' }} /></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><select value={test.vCutRating || ''} onChange={(e) => updateCureTest(idx, 'vCutRating', e.target.value)} style={{ ...inputStyle, padding: '6px' }}><option value="">-</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></td>
                      <td style={{ padding: '4px', border: '1px solid #dee2e6' }}><ShieldedInput type="text" inputMode="decimal" value={test.shoreDHardness || ''} onChange={(val) => updateCureTest(idx, 'shoreDHardness', val)} style={{ ...inputStyle, padding: '6px' }} /></td>
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
            <div><label style={labelStyle}>Inspector Notes</label><ShieldedInput as="textarea" value={coatingData.signOff?.notes || ''} onChange={(val) => updateField('signOff', 'notes', val)} placeholder="Additional observations..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} /></div>
          </div>
        )}
      </div>

    </div>
  )
}

export default CoatingLog
