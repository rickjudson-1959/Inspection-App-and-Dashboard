import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline"
const AFE_NUMBER = "CWP-2025-001"

const PIPE_SIZES = ['6"', '8"', '10"', '12"', '16"', '20"', '24"', '30"', '36"', '42"', '48"']
const PASS_TYPES = ['Root', 'Hot Pass', 'Fill 1', 'Fill 2', 'Fill 3', 'Cap']
const NDE_TYPES = ['RT', 'UT']
const RESULTS = ['Accept', 'Reject']
const DIRECTIONS = ['US', 'DS']

// Tie-In specific parameter ranges (more restrictive due to high restraint)
const PARAM_RANGES = {
  preheat: { default: 120, warnMin: 80, warnMax: 200, errorMin: 0, errorMax: 400 },
  voltage: { default: 24, warnMin: 18, warnMax: 32, errorMin: 10, errorMax: 50 },
  amperage: { default: 120, warnMin: 60, warnMax: 220, errorMin: 0, errorMax: 400 },
  travelSpeed: { default: 200, warnMin: 50, warnMax: 350, errorMin: 0, errorMax: 1500 }
}

export default function TieInWeldData({ blockId, reportId, onDataChange, existingData, contractor: propContractor, foreman: propForeman }) {
  const [contractor, setContractor] = useState(existingData?.contractor || '')
  const [foreman, setForeman] = useState(existingData?.foreman || '')
  const [pipeSize, setPipeSize] = useState(existingData?.pipeSize || '')
  
  // Tie-In entries
  const [tieIns, setTieIns] = useState(existingData?.tieIns || [])
  
  // Currently selected tie-in for detail editing
  const [selectedTieIn, setSelectedTieIn] = useState(null)
  
  // WPS configurations from database
  const [wpsOptions, setWpsOptions] = useState([])
  const [wpsLookup, setWpsLookup] = useState({})
  
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
    // Push data changes up to parent
    const data = {
      contractor,
      foreman,
      pipeSize,
      tieIns,
      totalTieIns: tieIns.length
    }
    onDataChange(data)
  }, [contractor, foreman, pipeSize, tieIns])

  async function loadInitialData() {
    // Load WPS configurations (tie-in specific)
    const { data: wpsData } = await supabase
      .from('wps_configurations')
      .select('*')
      .like('wps_id', '%TI%')
      .order('wps_id')
    
    if (wpsData && wpsData.length > 0) {
      setWpsOptions(wpsData)
      const lookup = {}
      wpsData.forEach(w => { lookup[w.wps_id] = w })
      setWpsLookup(lookup)
    } else {
      // Fallback to all WPS if no tie-in specific ones
      const { data: allWps } = await supabase
        .from('wps_configurations')
        .select('*')
        .order('wps_id')
      if (allWps) {
        setWpsOptions(allWps)
        const lookup = {}
        allWps.forEach(w => { lookup[w.wps_id] = w })
        setWpsLookup(lookup)
      }
    }
    
    setLoading(false)
  }

  async function getNextTieInNumber() {
    // Get and increment sequence
    const { data, error } = await supabase
      .from('weld_sequences')
      .select('last_sequence')
      .eq('project_name', PROJECT_NAME)
      .eq('crew_type', 'Tie-In')
      .single()
    
    if (data) {
      const nextSeq = (data.last_sequence || 0) + 1
      
      // Update the sequence
      await supabase
        .from('weld_sequences')
        .update({ last_sequence: nextSeq })
        .eq('project_name', PROJECT_NAME)
        .eq('crew_type', 'Tie-In')
      
      return `TI-${String(nextSeq).padStart(4, '0')}`
    }
    
    return `TI-0001`
  }

  function calculateHeatInput(voltage, amperage, travelSpeed) {
    if (!voltage || !amperage || !travelSpeed || travelSpeed === 0) return null
    return ((voltage * amperage * 60) / (travelSpeed * 1000)).toFixed(2)
  }

  function checkMeetsWPS(heatInput, wpsId) {
    if (!heatInput || !wpsId || !wpsLookup[wpsId]) return null
    const maxHeatInput = wpsLookup[wpsId].max_heat_input
    if (!maxHeatInput) return null
    return parseFloat(heatInput) <= maxHeatInput
  }

  function getParamStatus(value, paramType) {
    if (!value && value !== 0) return 'normal'
    const v = parseFloat(value)
    const ranges = PARAM_RANGES[paramType]
    if (!ranges) return 'normal'
    
    if (v < ranges.errorMin || v > ranges.errorMax) return 'error'
    if (v < ranges.warnMin || v > ranges.warnMax) return 'warning'
    return 'normal'
  }

  async function addTieIn() {
    const tieInNumber = await getNextTieInNumber()
    const newTieIn = {
      id: Date.now(),
      tieInNumber,
      station: '',
      visualResult: '',
      ndeType: '',
      ndeResult: '',
      constructionDirection: '',
      weldParams: [],
      pup: {
        cutLength: '', cutPipeNumber: '', cutHeatNumber: '', cutWallThickness: '', cutManufacturer: '',
        addedLength: '', addedPipeNumber: '', addedHeatNumber: '', addedWallThickness: '', addedManufacturer: '',
        leftPipeNo: '', leftHeatNo: '', leftShawNo: '', leftWt: '', leftMftr: '', leftLength: '',
        rightPipeNo: '', rightHeatNo: '', rightShawNo: '', rightWt: '', rightMftr: '', rightLength: '',
        chainage: ''
      }
    }
    setTieIns([...tieIns, newTieIn])
    setSelectedTieIn(newTieIn.id)
  }

  function updateTieIn(id, field, value) {
    setTieIns(tieIns.map(ti => {
      if (ti.id !== id) return ti
      return { ...ti, [field]: value }
    }))
  }

  function updateTieInPup(id, field, value) {
    setTieIns(tieIns.map(ti => {
      if (ti.id !== id) return ti
      return { ...ti, pup: { ...ti.pup, [field]: value } }
    }))
  }

  function addWeldParam(tieInId) {
    setTieIns(tieIns.map(ti => {
      if (ti.id !== tieInId) return ti
      const newParam = {
        id: Date.now(),
        weldNumber: `${ti.tieInNumber}-W${ti.weldParams.length + 1}`,
        preheat: PARAM_RANGES.preheat.default,
        pass: '',
        side: '',
        voltage: PARAM_RANGES.voltage.default,
        amperage: PARAM_RANGES.amperage.default,
        distance: '',
        time: '',
        travelSpeed: PARAM_RANGES.travelSpeed.default,
        heatInput: null,
        wpsId: '',
        meetsWPS: null
      }
      return { ...ti, weldParams: [...ti.weldParams, newParam] }
    }))
  }

  function updateWeldParam(tieInId, paramId, field, value) {
    setTieIns(tieIns.map(ti => {
      if (ti.id !== tieInId) return ti
      return {
        ...ti,
        weldParams: ti.weldParams.map(param => {
          if (param.id !== paramId) return param
          
          const updated = { ...param, [field]: value }
          
          // Auto-calculate heat input
          if (['voltage', 'amperage', 'travelSpeed'].includes(field)) {
            updated.heatInput = calculateHeatInput(
              field === 'voltage' ? value : param.voltage,
              field === 'amperage' ? value : param.amperage,
              field === 'travelSpeed' ? value : param.travelSpeed
            )
            updated.meetsWPS = checkMeetsWPS(updated.heatInput, param.wpsId)
          }
          
          if (field === 'wpsId') {
            updated.meetsWPS = checkMeetsWPS(param.heatInput, value)
          }
          
          return updated
        })
      }
    }))
  }

  function removeWeldParam(tieInId, paramId) {
    setTieIns(tieIns.map(ti => {
      if (ti.id !== tieInId) return ti
      return { ...ti, weldParams: ti.weldParams.filter(p => p.id !== paramId) }
    }))
  }

  function removeTieIn(id) {
    setTieIns(tieIns.filter(ti => ti.id !== id))
    if (selectedTieIn === id) setSelectedTieIn(null)
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

  const getInputStyle = (status) => {
    const base = { ...inputStyle }
    if (status === 'error') {
      base.border = '2px solid #dc3545'
      base.backgroundColor = '#fff5f5'
    } else if (status === 'warning') {
      base.border = '2px solid #ffc107'
      base.backgroundColor = '#fffbeb'
    }
    return base
  }

  const selectedTieInData = tieIns.find(ti => ti.id === selectedTieIn)

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading tie-in configuration...</div>
  }

  return (
    <div style={{ marginTop: '16px' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#8b4513', color: 'white', padding: '12px 16px', borderRadius: '6px 6px 0 0', marginBottom: '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>TIE-IN WELD DATA</h3>
          <div style={{ fontSize: '12px' }}>
            <span style={{ marginRight: '20px' }}>Project: {PROJECT_NAME}</span>
            <span>AFE: {AFE_NUMBER}</span>
          </div>
        </div>
      </div>

      {/* Header Info */}
      <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
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
          <div>
            <label style={labelStyle}>Pipe Size</label>
            <select
              value={pipeSize}
              onChange={(e) => setPipeSize(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select size...</option>
              {PIPE_SIZES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tie-In Summary Table */}
      <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', color: '#8b4513' }}>Tie-In Summary</h4>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#666' }}>Total: <strong>{tieIns.length}</strong></span>
            <button
              onClick={addTieIn}
              style={{ backgroundColor: '#28a745', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
            >
              + Add Tie-In
            </button>
          </div>
        </div>
        
        {tieIns.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            Click "+ Add Tie-In" to start tracking tie-ins
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#8b4513', color: 'white' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Tie-In No.</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Station (KP)</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Visual</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>NDE Type</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>NDE Result</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Direction</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Welds</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tieIns.map((ti, idx) => (
                  <tr 
                    key={ti.id} 
                    style={{ 
                      backgroundColor: selectedTieIn === ti.id ? '#fff3e0' : (idx % 2 === 0 ? 'white' : '#f8f9fa'),
                      cursor: 'pointer'
                    }}
                    onClick={() => setSelectedTieIn(ti.id)}
                  >
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 'bold', color: '#8b4513' }}>{ti.tieInNumber}</td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="text"
                        value={ti.station}
                        onChange={(e) => updateTieIn(ti.id, 'station', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="e.g., 5+250"
                        style={{ ...inputStyle, width: '100px' }}
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <select
                        value={ti.visualResult}
                        onChange={(e) => updateTieIn(ti.id, 'visualResult', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...inputStyle, width: '90px' }}
                      >
                        <option value="">-</option>
                        {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <select
                        value={ti.ndeType}
                        onChange={(e) => updateTieIn(ti.id, 'ndeType', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...inputStyle, width: '70px' }}
                      >
                        <option value="">-</option>
                        {NDE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <select
                        value={ti.ndeResult}
                        onChange={(e) => updateTieIn(ti.id, 'ndeResult', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...inputStyle, width: '90px' }}
                      >
                        <option value="">-</option>
                        {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <select
                        value={ti.constructionDirection}
                        onChange={(e) => updateTieIn(ti.id, 'constructionDirection', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...inputStyle, width: '60px' }}
                      >
                        <option value="">-</option>
                        {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span style={{ backgroundColor: '#e3f2fd', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>
                        {ti.weldParams.length}
                      </span>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeTieIn(ti.id); }}
                        style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
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
      </div>

      {/* Selected Tie-In Details */}
      {selectedTieInData && (
        <>
          {/* Weld Parameters */}
          <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#8b4513' }}>
                Parameters for {selectedTieInData.tieInNumber}
              </h4>
              <button
                onClick={() => addWeldParam(selectedTieIn)}
                style={{ backgroundColor: '#17a2b8', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
              >
                + Add Weld Pass
              </button>
            </div>
            
            {selectedTieInData.weldParams.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
                Click "+ Add Weld Pass" to track weld parameters
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#17a2b8', color: 'white' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Weld No.</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Preheat °C</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Pass</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Side</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Volts</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Amps</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Dist (mm)</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Time (s)</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Speed</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Heat Input</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>WPS</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Meets WPS</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTieInData.weldParams.map((param, idx) => (
                      <tr key={param.id} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#f8f9fa' }}>
                        <td style={{ padding: '4px' }}>
                          <input
                            type="text"
                            value={param.weldNumber}
                            onChange={(e) => updateWeldParam(selectedTieIn, param.id, 'weldNumber', e.target.value)}
                            style={{ ...inputStyle, width: '100px', fontFamily: 'monospace' }}
                          />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={param.preheat}
                            onChange={(e) => updateWeldParam(selectedTieIn, param.id, 'preheat', e.target.value)}
                            style={{ ...getInputStyle(getParamStatus(param.preheat, 'preheat')), width: '70px', textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <select
                            value={param.pass}
                            onChange={(e) => updateWeldParam(selectedTieIn, param.id, 'pass', e.target.value)}
                            style={{ ...inputStyle, width: '90px' }}
                          >
                            <option value="">Select...</option>
                            {PASS_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '4px' }}>
                          <select
                            value={param.side}
                            onChange={(e) => updateWeldParam(selectedTieIn, param.id, 'side', e.target.value)}
                            style={{ ...inputStyle, width: '65px' }}
                          >
                            <option value="">-</option>
                            <option value="W/S">W/S</option>
                            <option value="D/S">D/S</option>
                          </select>
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={param.voltage}
                            onChange={(e) => updateWeldParam(selectedTieIn, param.id, 'voltage', e.target.value)}
                            style={{ ...getInputStyle(getParamStatus(param.voltage, 'voltage')), width: '60px', textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={param.amperage}
                            onChange={(e) => updateWeldParam(selectedTieIn, param.id, 'amperage', e.target.value)}
                            style={{ ...getInputStyle(getParamStatus(param.amperage, 'amperage')), width: '60px', textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={param.distance}
                            onChange={(e) => updateWeldParam(selectedTieIn, param.id, 'distance', e.target.value)}
                            style={{ ...inputStyle, width: '60px', textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={param.time}
                            onChange={(e) => updateWeldParam(selectedTieIn, param.id, 'time', e.target.value)}
                            style={{ ...inputStyle, width: '55px', textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={param.travelSpeed}
                            onChange={(e) => updateWeldParam(selectedTieIn, param.id, 'travelSpeed', e.target.value)}
                            style={{ ...getInputStyle(getParamStatus(param.travelSpeed, 'travelSpeed')), width: '70px', textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: param.meetsWPS === false ? '#dc3545' : '#333' }}>
                            {param.heatInput || '-'}
                          </span>
                        </td>
                        <td style={{ padding: '4px' }}>
                          <select
                            value={param.wpsId}
                            onChange={(e) => updateWeldParam(selectedTieIn, param.id, 'wpsId', e.target.value)}
                            style={{ ...inputStyle, width: '110px' }}
                          >
                            <option value="">Select...</option>
                            {wpsOptions.map(w => (
                              <option key={w.wps_id} value={w.wps_id}>{w.wps_id}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center' }}>
                          {param.meetsWPS === null ? (
                            <span style={{ color: '#999' }}>-</span>
                          ) : param.meetsWPS ? (
                            <span style={{ color: '#28a745', fontWeight: 'bold' }}>✓</span>
                          ) : (
                            <span style={{ color: '#dc3545', fontWeight: 'bold' }}>✗</span>
                          )}
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center' }}>
                          <button
                            onClick={() => removeWeldParam(selectedTieIn, param.id)}
                            style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
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
          </div>

          {/* PUP Section */}
          <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#8b4513' }}>
              PUP Details for {selectedTieInData.tieInNumber}
            </h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '24px' }}>
              {/* PUP CUT */}
              <div style={{ backgroundColor: '#ffebee', padding: '12px', borderRadius: '6px' }}>
                <h5 style={{ margin: '0 0 10px 0', color: '#c62828', fontSize: '13px' }}>PUP CUT (Removed)</h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Length Cut</label>
                    <input
                      type="text"
                      value={selectedTieInData.pup.cutLength}
                      onChange={(e) => updateTieInPup(selectedTieIn, 'cutLength', e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Pipe Number</label>
                    <input
                      type="text"
                      value={selectedTieInData.pup.cutPipeNumber}
                      onChange={(e) => updateTieInPup(selectedTieIn, 'cutPipeNumber', e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Heat Number</label>
                    <input
                      type="text"
                      value={selectedTieInData.pup.cutHeatNumber}
                      onChange={(e) => updateTieInPup(selectedTieIn, 'cutHeatNumber', e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>W.T.</label>
                    <input
                      type="text"
                      value={selectedTieInData.pup.cutWallThickness}
                      onChange={(e) => updateTieInPup(selectedTieIn, 'cutWallThickness', e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '6px' }}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Manufacturer</label>
                    <input
                      type="text"
                      value={selectedTieInData.pup.cutManufacturer}
                      onChange={(e) => updateTieInPup(selectedTieIn, 'cutManufacturer', e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '6px' }}
                    />
                  </div>
                </div>
              </div>

              {/* PUP ADDED */}
              <div style={{ backgroundColor: '#e8f5e9', padding: '12px', borderRadius: '6px' }}>
                <h5 style={{ margin: '0 0 10px 0', color: '#2e7d32', fontSize: '13px' }}>PUP ADDED (Installed)</h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Length Added</label>
                    <input
                      type="text"
                      value={selectedTieInData.pup.addedLength}
                      onChange={(e) => updateTieInPup(selectedTieIn, 'addedLength', e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Pipe Number</label>
                    <input
                      type="text"
                      value={selectedTieInData.pup.addedPipeNumber}
                      onChange={(e) => updateTieInPup(selectedTieIn, 'addedPipeNumber', e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Heat Number</label>
                    <input
                      type="text"
                      value={selectedTieInData.pup.addedHeatNumber}
                      onChange={(e) => updateTieInPup(selectedTieIn, 'addedHeatNumber', e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>W.T.</label>
                    <input
                      type="text"
                      value={selectedTieInData.pup.addedWallThickness}
                      onChange={(e) => updateTieInPup(selectedTieIn, 'addedWallThickness', e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '6px' }}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ ...labelStyle, fontSize: '10px' }}>Manufacturer</label>
                    <input
                      type="text"
                      value={selectedTieInData.pup.addedManufacturer}
                      onChange={(e) => updateTieInPup(selectedTieIn, 'addedManufacturer', e.target.value)}
                      style={{ ...inputStyle, fontSize: '12px', padding: '6px' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Pipe Diagram */}
            <div style={{ marginTop: '16px', backgroundColor: '#fff8e1', padding: '16px', borderRadius: '6px' }}>
              <h5 style={{ margin: '0 0 12px 0', color: '#f57c00', fontSize: '13px', textAlign: 'center' }}>
                Pipe Joint Details - Construction Direction: {selectedTieInData.constructionDirection || '---'}
              </h5>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {/* Left Pipe */}
                <div style={{ flex: 1, backgroundColor: 'white', padding: '12px', borderRadius: '6px', border: '2px solid #ff9800' }}>
                  <h6 style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#e65100', textAlign: 'center' }}>U/S PIPE</h6>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px', fontSize: '11px' }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>Pipe No.</label>
                      <input type="text" value={selectedTieInData.pup.leftPipeNo} onChange={(e) => updateTieInPup(selectedTieIn, 'leftPipeNo', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>Heat No.</label>
                      <input type="text" value={selectedTieInData.pup.leftHeatNo} onChange={(e) => updateTieInPup(selectedTieIn, 'leftHeatNo', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>Shaw No.</label>
                      <input type="text" value={selectedTieInData.pup.leftShawNo} onChange={(e) => updateTieInPup(selectedTieIn, 'leftShawNo', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>W.T.</label>
                      <input type="text" value={selectedTieInData.pup.leftWt} onChange={(e) => updateTieInPup(selectedTieIn, 'leftWt', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>Mftr.</label>
                      <input type="text" value={selectedTieInData.pup.leftMftr} onChange={(e) => updateTieInPup(selectedTieIn, 'leftMftr', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>Length</label>
                      <input type="text" value={selectedTieInData.pup.leftLength} onChange={(e) => updateTieInPup(selectedTieIn, 'leftLength', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                  </div>
                </div>

                {/* Tie-In Center */}
                <div style={{ width: '120px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>⟵ ⬤ ⟶</div>
                  <div style={{ backgroundColor: '#ff9800', color: 'white', padding: '8px', borderRadius: '6px', fontSize: '11px' }}>
                    <div style={{ fontWeight: 'bold' }}>Tie-In #</div>
                    <div>{selectedTieInData.tieInNumber}</div>
                    <div style={{ marginTop: '4px', fontSize: '10px' }}>Chainage</div>
                    <input
                      type="text"
                      value={selectedTieInData.pup.chainage}
                      onChange={(e) => updateTieInPup(selectedTieIn, 'chainage', e.target.value)}
                      placeholder="KP"
                      style={{ ...inputStyle, fontSize: '10px', padding: '3px', textAlign: 'center', marginTop: '2px' }}
                    />
                  </div>
                </div>

                {/* Right Pipe */}
                <div style={{ flex: 1, backgroundColor: 'white', padding: '12px', borderRadius: '6px', border: '2px solid #ff9800' }}>
                  <h6 style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#e65100', textAlign: 'center' }}>D/S PIPE</h6>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px', fontSize: '11px' }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>Pipe No.</label>
                      <input type="text" value={selectedTieInData.pup.rightPipeNo} onChange={(e) => updateTieInPup(selectedTieIn, 'rightPipeNo', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>Heat No.</label>
                      <input type="text" value={selectedTieInData.pup.rightHeatNo} onChange={(e) => updateTieInPup(selectedTieIn, 'rightHeatNo', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>Shaw No.</label>
                      <input type="text" value={selectedTieInData.pup.rightShawNo} onChange={(e) => updateTieInPup(selectedTieIn, 'rightShawNo', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>W.T.</label>
                      <input type="text" value={selectedTieInData.pup.rightWt} onChange={(e) => updateTieInPup(selectedTieIn, 'rightWt', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>Mftr.</label>
                      <input type="text" value={selectedTieInData.pup.rightMftr} onChange={(e) => updateTieInPup(selectedTieIn, 'rightMftr', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '9px' }}>Length</label>
                      <input type="text" value={selectedTieInData.pup.rightLength} onChange={(e) => updateTieInPup(selectedTieIn, 'rightLength', e.target.value)} style={{ ...inputStyle, fontSize: '11px', padding: '4px' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
