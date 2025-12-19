import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline"
const AFE_NUMBER = "CWP-2025-001"

const BEND_TYPES = [
  'Sag (Down)',
  'Overbend (Up)',
  'Sidebend Left',
  'Sidebend Right',
  'Combination'
]

export default function BendingLog({ blockId, reportId, onDataChange, existingData, contractor: propContractor, foreman: propForeman }) {
  const [contractor, setContractor] = useState(existingData?.contractor || '')
  const [foreman, setForeman] = useState(existingData?.foreman || '')
  
  // Bend counts
  const [bendsToday, setBendsToday] = useState(existingData?.bendsToday || 0)
  const [bendsPrevious, setBendsPrevious] = useState(existingData?.bendsPrevious || 0)
  
  // Bend entries
  const [bendEntries, setBendEntries] = useState(existingData?.bendEntries || [])
  
  // Reference data from database
  const [pipeSpecs, setPipeSpecs] = useState([])
  const [wallThicknessOptions, setWallThicknessOptions] = useState([])
  const [coatingTypes, setCoatingTypes] = useState([])
  const [projectSettings, setProjectSettings] = useState({ max_ovality_percent: 3.0, max_bend_angle_per_diameter: 1.5 })
  
  // Loading state
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (propContractor) setContractor(propContractor)
    if (propForeman) setForeman(propForeman)
  }, [propContractor, propForeman])

  useEffect(() => {
    loadPreviousBendCount()
  }, [])

  useEffect(() => {
    // Push data changes up to parent
    const data = {
      contractor,
      foreman,
      bendsToday,
      bendsPrevious,
      totalBends: bendsToday + bendsPrevious,
      bendEntries
    }
    onDataChange(data)
  }, [contractor, foreman, bendsToday, bendsPrevious, bendEntries])

  async function loadInitialData() {
    // Load pipe specifications
    const { data: specs } = await supabase
      .from('pipe_specifications')
      .select('*')
      .order('nominal_od_mm')
    
    if (specs) setPipeSpecs(specs)

    // Load wall thickness options
    const { data: wt } = await supabase
      .from('wall_thickness_options')
      .select('*')
      .order('pipe_size, wall_thickness_mm')
    
    if (wt) setWallThicknessOptions(wt)

    // Load coating types
    const { data: coatings } = await supabase
      .from('coating_types')
      .select('*')
      .order('coating_code')
    
    if (coatings) setCoatingTypes(coatings)

    // Load project settings
    const { data: settings } = await supabase
      .from('project_bend_settings')
      .select('*')
      .eq('project_name', PROJECT_NAME)
      .single()
    
    if (settings) setProjectSettings(settings)

    setLoading(false)
  }

  async function loadPreviousBendCount() {
    const { data } = await supabase
      .from('bend_daily_summary')
      .select('total_bends')
      .order('created_at', { ascending: false })
      .limit(1)
    
    if (data && data.length > 0) {
      setBendsPrevious(data[0].total_bends || 0)
    }
  }

  function getWallThicknessForPipe(pipeSize) {
    return wallThicknessOptions.filter(wt => wt.pipe_size === pipeSize)
  }

  function getNominalOD(pipeSize) {
    const spec = pipeSpecs.find(s => s.pipe_size === pipeSize)
    return spec ? spec.nominal_od_mm : null
  }

  function calculateOvality(dmax, dmin, nominalOD) {
    if (!dmax || !dmin || !nominalOD || nominalOD === 0) return null
    const outOfRoundness = dmax - dmin
    const ovality = (outOfRoundness / nominalOD) * 100
    return ovality.toFixed(2)
  }

  function checkOvalityPass(ovality) {
    if (ovality === null) return null
    return parseFloat(ovality) <= projectSettings.max_ovality_percent
  }

  function getCoatingInfo(coatingCode) {
    return coatingTypes.find(c => c.coating_code === coatingCode)
  }

  function addBendEntry() {
    const newEntry = {
      id: Date.now(),
      stationKP: '',
      pipeSize: '',
      nominalOD: null,
      wallThickness: '',
      coatingType: '',
      bendAngle: '',
      bendType: '',
      dmax: '',
      dmin: '',
      outOfRoundness: null,
      ovalityPercent: null,
      ovalityPass: null,
      engineerApproval: false,
      engineerNote: '',
      coatingWarning: false
    }
    setBendEntries([...bendEntries, newEntry])
    setBendsToday(bendsToday + 1)
  }

  function updateBendEntry(id, field, value) {
    setBendEntries(bendEntries.map(entry => {
      if (entry.id !== id) return entry
      
      const updated = { ...entry, [field]: value }
      
      // When pipe size changes, update nominal OD and clear wall thickness
      if (field === 'pipeSize') {
        updated.nominalOD = getNominalOD(value)
        updated.wallThickness = ''
        // Recalculate ovality with new OD
        if (entry.dmax && entry.dmin && updated.nominalOD) {
          updated.outOfRoundness = (parseFloat(entry.dmax) - parseFloat(entry.dmin)).toFixed(3)
          updated.ovalityPercent = calculateOvality(parseFloat(entry.dmax), parseFloat(entry.dmin), updated.nominalOD)
          updated.ovalityPass = checkOvalityPass(updated.ovalityPercent)
        }
      }
      
      // When Dmax or Dmin changes, recalculate ovality
      if (field === 'dmax' || field === 'dmin') {
        const dmax = field === 'dmax' ? parseFloat(value) : parseFloat(entry.dmax)
        const dmin = field === 'dmin' ? parseFloat(value) : parseFloat(entry.dmin)
        
        if (dmax && dmin && entry.nominalOD) {
          updated.outOfRoundness = (dmax - dmin).toFixed(3)
          updated.ovalityPercent = calculateOvality(dmax, dmin, entry.nominalOD)
          updated.ovalityPass = checkOvalityPass(updated.ovalityPercent)
        }
      }
      
      // Check coating restrictions
      if (field === 'coatingType') {
        const coating = getCoatingInfo(value)
        updated.coatingWarning = coating?.requires_bend_approval || false
        if (!coating?.requires_bend_approval) {
          updated.engineerApproval = false
          updated.engineerNote = ''
        }
      }
      
      return updated
    }))
  }

  function removeBendEntry(id) {
    setBendEntries(bendEntries.filter(e => e.id !== id))
    setBendsToday(Math.max(0, bendsToday - 1))
  }

  const inputStyle = {
    width: '100%',
    padding: '8px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '13px',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 'bold',
    marginBottom: '4px',
    color: '#333'
  }

  const sectionStyle = {
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    padding: '16px',
    marginBottom: '16px'
  }

  const getOvalityStyle = (pass) => {
    if (pass === null) return { color: '#666' }
    return pass 
      ? { color: '#28a745', fontWeight: 'bold' }
      : { color: '#dc3545', fontWeight: 'bold', backgroundColor: '#fff5f5' }
  }

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading bending configuration...</div>
  }

  return (
    <div style={{ marginTop: '16px' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#2e7d32', color: 'white', padding: '12px 16px', borderRadius: '6px 6px 0 0', marginBottom: '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>BENDING LOG</h3>
          <div style={{ fontSize: '12px' }}>
            <span style={{ marginRight: '20px' }}>Project: {PROJECT_NAME}</span>
            <span>AFE: {AFE_NUMBER}</span>
          </div>
        </div>
      </div>

      {/* Header Info */}
      <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Contractor</label>
            <input
              type="text"
              value={contractor}
              onChange={(e) => setContractor(e.target.value)}
              placeholder="Contractor name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Foreman</label>
            <input
              type="text"
              value={foreman}
              onChange={(e) => setForeman(e.target.value)}
              placeholder="Foreman name"
              style={inputStyle}
            />
          </div>
          <div style={{ backgroundColor: '#e8f5e9', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#2e7d32', marginBottom: '4px' }}>Max Ovality Limit</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1b5e20' }}>{projectSettings.max_ovality_percent}%</div>
          </div>
        </div>
      </div>

      {/* Bend Count Summary */}
      <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#2e7d32' }}>Bend Count Summary</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Bends Today</label>
            <input
              type="number"
              value={bendsToday}
              onChange={(e) => setBendsToday(parseInt(e.target.value) || 0)}
              style={{ ...inputStyle, backgroundColor: '#e8f5e9', fontWeight: 'bold' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Bends Previous</label>
            <input
              type="number"
              value={bendsPrevious}
              readOnly
              style={{ ...inputStyle, backgroundColor: '#f5f5f5' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Total Bends</label>
            <input
              type="number"
              value={bendsToday + bendsPrevious}
              readOnly
              style={{ ...inputStyle, backgroundColor: '#c8e6c9', fontWeight: 'bold', fontSize: '16px' }}
            />
          </div>
        </div>
      </div>

      {/* Bends Checked Table */}
      <div style={{ ...sectionStyle, borderRadius: '0 0 6px 6px', borderTop: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', color: '#2e7d32' }}>Bends Checked</h4>
          <button
            onClick={addBendEntry}
            style={{ backgroundColor: '#28a745', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
          >
            + Add Bend
          </button>
        </div>
        
        {bendEntries.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            Click "+ Add Bend" to start logging bends
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#2e7d32', color: 'white' }}>
                  <th style={{ padding: '8px 4px', textAlign: 'left' }}>Station (KP)</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Pipe Size</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>W.T. (mm)</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Coating</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Angle (°)</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Type</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Dmax (mm)</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Dmin (mm)</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>D-D (mm)</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Ovality %</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Pass</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bendEntries.map((entry, idx) => (
                  <>
                    <tr key={entry.id} style={{ backgroundColor: entry.coatingWarning ? '#fff3e0' : (idx % 2 === 0 ? 'white' : '#f8f9fa') }}>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="text"
                          value={entry.stationKP}
                          onChange={(e) => updateBendEntry(entry.id, 'stationKP', e.target.value)}
                          placeholder="e.g., 5+250"
                          style={{ ...inputStyle, width: '90px' }}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <select
                          value={entry.pipeSize}
                          onChange={(e) => updateBendEntry(entry.id, 'pipeSize', e.target.value)}
                          style={{ ...inputStyle, width: '80px' }}
                        >
                          <option value="">Select...</option>
                          {pipeSpecs.map(s => (
                            <option key={s.pipe_size} value={s.pipe_size}>{s.pipe_size}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '4px' }}>
                        <select
                          value={entry.wallThickness}
                          onChange={(e) => updateBendEntry(entry.id, 'wallThickness', e.target.value)}
                          style={{ ...inputStyle, width: '100px' }}
                          disabled={!entry.pipeSize}
                        >
                          <option value="">Select...</option>
                          {getWallThicknessForPipe(entry.pipeSize).map(wt => (
                            <option key={wt.id} value={wt.wall_thickness_mm}>
                              {wt.schedule} ({wt.wall_thickness_mm})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '4px' }}>
                        <select
                          value={entry.coatingType}
                          onChange={(e) => updateBendEntry(entry.id, 'coatingType', e.target.value)}
                          style={{ ...inputStyle, width: '80px', backgroundColor: entry.coatingWarning ? '#ffecb3' : 'white' }}
                        >
                          <option value="">Select...</option>
                          {coatingTypes.map(c => (
                            <option key={c.coating_code} value={c.coating_code}>{c.coating_code}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="number"
                          step="0.1"
                          value={entry.bendAngle}
                          onChange={(e) => updateBendEntry(entry.id, 'bendAngle', e.target.value)}
                          placeholder="0.0"
                          style={{ ...inputStyle, width: '65px', textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <select
                          value={entry.bendType}
                          onChange={(e) => updateBendEntry(entry.id, 'bendType', e.target.value)}
                          style={{ ...inputStyle, width: '110px' }}
                        >
                          <option value="">Select...</option>
                          {BEND_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="number"
                          step="0.001"
                          value={entry.dmax}
                          onChange={(e) => updateBendEntry(entry.id, 'dmax', e.target.value)}
                          placeholder="0.000"
                          style={{ ...inputStyle, width: '75px', textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="number"
                          step="0.001"
                          value={entry.dmin}
                          onChange={(e) => updateBendEntry(entry.id, 'dmin', e.target.value)}
                          placeholder="0.000"
                          style={{ ...inputStyle, width: '75px', textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        <span style={{ fontFamily: 'monospace' }}>
                          {entry.outOfRoundness || '-'}
                        </span>
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        <span style={{ ...getOvalityStyle(entry.ovalityPass), fontFamily: 'monospace', padding: '2px 6px', borderRadius: '4px' }}>
                          {entry.ovalityPercent ? `${entry.ovalityPercent}%` : '-'}
                        </span>
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        {entry.ovalityPass === null ? (
                          <span style={{ color: '#999' }}>-</span>
                        ) : entry.ovalityPass ? (
                          <span style={{ color: '#28a745', fontWeight: 'bold' }}>✓ PASS</span>
                        ) : (
                          <span style={{ color: '#dc3545', fontWeight: 'bold' }}>✗ FAIL</span>
                        )}
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        <button
                          onClick={() => removeBendEntry(entry.id)}
                          style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    {/* Coating Warning Row */}
                    {entry.coatingWarning && (
                      <tr key={`${entry.id}-warning`}>
                        <td colSpan="12" style={{ backgroundColor: '#fff3e0', padding: '8px 12px', borderBottom: '2px solid #ff9800' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span style={{ color: '#e65100', fontWeight: 'bold', fontSize: '13px' }}>
                              ⚠️ {getCoatingInfo(entry.coatingType)?.coating_name} - Engineering Approval Required
                            </span>
                            <span style={{ color: '#666', fontSize: '12px' }}>
                              {getCoatingInfo(entry.coatingType)?.notes}
                            </span>
                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="checkbox"
                                  checked={entry.engineerApproval}
                                  onChange={(e) => updateBendEntry(entry.id, 'engineerApproval', e.target.checked)}
                                />
                                Engineer Signed Off
                              </label>
                              <input
                                type="text"
                                value={entry.engineerNote}
                                onChange={(e) => updateBendEntry(entry.id, 'engineerNote', e.target.value)}
                                placeholder="Approval reference..."
                                style={{ ...inputStyle, width: '150px', fontSize: '11px', padding: '4px 8px' }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary Stats */}
        {bendEntries.length > 0 && (
          <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div style={{ backgroundColor: '#e8f5e9', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#2e7d32' }}>Total Entries</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1b5e20' }}>{bendEntries.length}</div>
            </div>
            <div style={{ backgroundColor: '#e8f5e9', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#2e7d32' }}>Passed</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1b5e20' }}>
                {bendEntries.filter(e => e.ovalityPass === true).length}
              </div>
            </div>
            <div style={{ backgroundColor: '#ffebee', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#c62828' }}>Failed</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#c62828' }}>
                {bendEntries.filter(e => e.ovalityPass === false).length}
              </div>
            </div>
            <div style={{ backgroundColor: '#fff3e0', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#e65100' }}>Pending Approval</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e65100' }}>
                {bendEntries.filter(e => e.coatingWarning && !e.engineerApproval).length}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
