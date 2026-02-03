import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline"
const AFE_NUMBER = "CWP-2025-001"

const CREW_TYPES = ['Section Crew', 'Poor Boy', 'Main Gang']
const CREW_PREFIXES = { 'Section Crew': 'SC', 'Poor Boy': 'PB', 'Main Gang': 'ML' }

const PASS_TYPES = ['Root', 'Hot Pass', 'Fill 1', 'Fill 2', 'Fill 3', 'Cap']
const WELD_METHODS = ['Manual', 'Mechanized']

const DOWN_TIME_REASONS = [
  'Weather',
  'Equipment Failure',
  'Waiting on Pipe',
  'Waiting on NDE',
  'ROW Conditions',
  'Trench Conditions',
  'Other'
]

const DEFECT_CODES = [
  { code: 'CRK', name: 'Crack', criticality: 'Reject (Repair)' },
  { code: 'IF', name: 'Incomplete Fusion', criticality: 'High' },
  { code: 'IP', name: 'Incomplete Penetration', criticality: 'High' },
  { code: 'POR', name: 'Porosity', criticality: 'Medium' },
  { code: 'ISI', name: 'Slag Inclusion', criticality: 'Medium' },
  { code: 'UC', name: 'Undercut', criticality: 'Medium' },
  { code: 'HI-LO', name: 'Misalignment', criticality: 'Low' },
  { code: 'ARC', name: 'Arc Strike', criticality: 'High' }
]

const CLOCK_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

// Parameter validation ranges
const PARAM_RANGES = {
  preheat: { default: 100, warnMin: 50, warnMax: 200, errorMin: 0, errorMax: 400 },
  voltage: { default: 24, warnMin: 18, warnMax: 34, errorMin: 10, errorMax: 50 },
  amperage: {
    Manual: { default: 125, warnMin: 60, warnMax: 250, errorMin: 0, errorMax: 600 },
    Mechanized: { default: 200, warnMin: 100, warnMax: 400, errorMin: 0, errorMax: 600 }
  },
  travelSpeed: {
    Manual: { default: 250, warnMin: 50, warnMax: 400, errorMin: 0, errorMax: 2000 },
    Mechanized: { default: 600, warnMin: 200, warnMax: 1200, errorMin: 0, errorMax: 2000 }
  }
}

export default function MainlineWeldData({ blockId, reportId, onDataChange, existingData, contractor: propContractor, foreman: propForeman }) {
  const [crewType, setCrewType] = useState(existingData?.crewType || '')
  const [contractor, setContractor] = useState(existingData?.contractor || '')
  const [foreman, setForeman] = useState(existingData?.foreman || '')
  const [weldMethod, setWeldMethod] = useState(existingData?.weldMethod || 'Manual')
  
  // Weld counts
  const [weldsToday, setWeldsToday] = useState(existingData?.weldsToday || 0)
  const [weldsPrevious, setWeldsPrevious] = useState(existingData?.weldsPrevious || 0)
  
  // Weld parameters (array of weld entries)
  const [weldEntries, setWeldEntries] = useState(existingData?.weldEntries || [])
  
  // Visuals
  const [visualsFrom, setVisualsFrom] = useState(existingData?.visualsFrom || '')
  const [visualsTo, setVisualsTo] = useState(existingData?.visualsTo || '')
  
  // Repairs
  const [repairs, setRepairs] = useState(existingData?.repairs || [])
  
  // Time tracking
  const [startTime, setStartTime] = useState(existingData?.startTime || '')
  const [endTime, setEndTime] = useState(existingData?.endTime || '')
  const [downTimeHours, setDownTimeHours] = useState(existingData?.downTimeHours || '')
  const [downTimeReason, setDownTimeReason] = useState(existingData?.downTimeReason || '')
  
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
    if (crewType) {
      loadPreviousWeldCount()
    }
  }, [crewType])

  useEffect(() => {
    // Push data changes up to parent
    const data = {
      crewType,
      contractor,
      foreman,
      weldMethod,
      weldsToday,
      weldsPrevious,
      totalWelds: weldsToday + weldsPrevious,
      weldEntries,
      visualsFrom,
      visualsTo,
      repairs,
      startTime,
      endTime,
      downTimeHours: parseFloat(downTimeHours) || 0,
      downTimeReason,
      totalWeldTime: calculateTotalWeldTime()
    }
    onDataChange(data)
  }, [crewType, contractor, foreman, weldMethod, weldsToday, weldsPrevious, weldEntries, visualsFrom, visualsTo, repairs, startTime, endTime, downTimeHours, downTimeReason])

  async function loadInitialData() {
    // Load WPS configurations
    const { data: wpsData } = await supabase
      .from('wps_configurations')
      .select('*')
      .order('wps_id')
    
    if (wpsData) {
      setWpsOptions(wpsData)
      const lookup = {}
      wpsData.forEach(w => { lookup[w.wps_id] = w })
      setWpsLookup(lookup)
    }
    
    setLoading(false)
  }

  async function loadPreviousWeldCount() {
    // Get the last weld count for this crew type
    const { data } = await supabase
      .from('weld_daily_summary')
      .select('total_welds')
      .eq('crew_type', crewType)
      .order('created_at', { ascending: false })
      .limit(1)
    
    if (data && data.length > 0) {
      setWeldsPrevious(data[0].total_welds || 0)
    } else {
      setWeldsPrevious(0)
    }
  }

  async function getNextWeldNumber() {
    if (!crewType) return ''
    
    const prefix = CREW_PREFIXES[crewType]
    
    // Get and increment sequence
    const { data, error } = await supabase
      .from('weld_sequences')
      .select('last_sequence')
      .eq('project_name', PROJECT_NAME)
      .eq('crew_type', crewType)
      .single()
    
    if (data) {
      const nextSeq = (data.last_sequence || 0) + 1
      
      // Update the sequence
      await supabase
        .from('weld_sequences')
        .update({ last_sequence: nextSeq })
        .eq('project_name', PROJECT_NAME)
        .eq('crew_type', crewType)
      
      return `${prefix}-${String(nextSeq).padStart(4, '0')}`
    }
    
    return `${prefix}-0001`
  }

  function calculateHeatInput(voltage, amperage, travelSpeed) {
    if (!voltage || !amperage || !travelSpeed || travelSpeed === 0) return null
    // Formula: (Volts × Amps × 60) / (Travel Speed × 1000) = kJ/mm
    return ((voltage * amperage * 60) / (travelSpeed * 1000)).toFixed(2)
  }

  function checkMeetsWPS(heatInput, wpsId) {
    if (!heatInput || !wpsId || !wpsLookup[wpsId]) return null
    const maxHeatInput = wpsLookup[wpsId].max_heat_input
    if (!maxHeatInput) return null
    return parseFloat(heatInput) <= maxHeatInput
  }

  function getParamStatus(value, paramType, method = 'Manual') {
    if (!value && value !== 0) return 'normal'
    const v = parseFloat(value)
    
    let ranges
    if (paramType === 'amperage' || paramType === 'travelSpeed') {
      ranges = PARAM_RANGES[paramType][method]
    } else {
      ranges = PARAM_RANGES[paramType]
    }
    
    if (!ranges) return 'normal'
    
    if (v < ranges.errorMin || v > ranges.errorMax) return 'error'
    if (v < ranges.warnMin || v > ranges.warnMax) return 'warning'
    return 'normal'
  }

  function calculateTotalWeldTime() {
    if (!startTime || !endTime) return 0
    const start = new Date(`2000-01-01T${startTime}`)
    const end = new Date(`2000-01-01T${endTime}`)
    let diff = (end - start) / (1000 * 60 * 60) // hours
    if (diff < 0) diff += 24 // handle overnight
    const downTime = parseFloat(downTimeHours) || 0
    return Math.max(0, diff - downTime).toFixed(1)
  }

  async function addWeldEntry() {
    const weldNumber = await getNextWeldNumber()
    const newEntry = {
      id: Date.now(),
      weldNumber,
      preheat: PARAM_RANGES.preheat.default,
      pass: '',
      side: '',
      voltage: PARAM_RANGES.voltage.default,
      amperage: PARAM_RANGES.amperage[weldMethod].default,
      distance: '',
      time: '',
      travelSpeed: PARAM_RANGES.travelSpeed[weldMethod].default,
      heatInput: null,
      wpsId: '',
      meetsWPS: null
    }
    setWeldEntries([...weldEntries, newEntry])
    setWeldsToday(weldsToday + 1)
  }

  function updateWeldEntry(id, field, value) {
    setWeldEntries(weldEntries.map(entry => {
      if (entry.id !== id) return entry
      
      const updated = { ...entry, [field]: value }
      
      // Auto-calculate heat input when parameters change
      if (['voltage', 'amperage', 'travelSpeed'].includes(field)) {
        updated.heatInput = calculateHeatInput(
          field === 'voltage' ? value : entry.voltage,
          field === 'amperage' ? value : entry.amperage,
          field === 'travelSpeed' ? value : entry.travelSpeed
        )
        updated.meetsWPS = checkMeetsWPS(updated.heatInput, entry.wpsId)
      }
      
      // Re-check WPS compliance when WPS changes
      if (field === 'wpsId') {
        updated.meetsWPS = checkMeetsWPS(entry.heatInput, value)
      }
      
      return updated
    }))
  }

  function removeWeldEntry(id) {
    setWeldEntries(weldEntries.filter(e => e.id !== id))
    setWeldsToday(Math.max(0, weldsToday - 1))
  }

  function addRepair() {
    setRepairs([...repairs, {
      id: Date.now(),
      weldNumber: '',
      defectCode: '',
      defectName: '',
      clockPosition: ''
    }])
  }

  function updateRepair(id, field, value) {
    setRepairs(repairs.map(r => {
      if (r.id !== id) return r
      const updated = { ...r, [field]: value }
      
      // Auto-fill defect name when code is selected
      if (field === 'defectCode') {
        const defect = DEFECT_CODES.find(d => d.code === value)
        updated.defectName = defect?.name || ''
      }
      
      return updated
    }))
  }

  function removeRepair(id) {
    setRepairs(repairs.filter(r => r.id !== id))
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

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading weld data configuration...</div>
  }

  return (
    <div style={{ marginTop: '16px' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '12px 16px', borderRadius: '6px 6px 0 0', marginBottom: '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>MAINLINE WELD DATA</h3>
          <div style={{ fontSize: '12px' }}>
            <span style={{ marginRight: '20px' }}>Project: {PROJECT_NAME}</span>
            <span>AFE: {AFE_NUMBER}</span>
          </div>
        </div>
      </div>

      {/* Contractor Info */}
      <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
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
            <label style={labelStyle}>Crew Type *</label>
            <select
              value={crewType}
              onChange={(e) => setCrewType(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select crew...</option>
              {CREW_TYPES.map(ct => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Weld Method</label>
            <select
              value={weldMethod}
              onChange={(e) => setWeldMethod(e.target.value)}
              style={inputStyle}
            >
              {WELD_METHODS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Weld Count Summary */}
      <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#1e3a5f' }}>Weld Count Summary</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Welds Today</label>
            <input
              type="text"
              inputMode="numeric"
              value={weldsToday}
              onChange={(e) => setWeldsToday(parseInt(e.target.value) || 0)}
              style={{ ...inputStyle, backgroundColor: '#e8f5e9', fontWeight: 'bold' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Welds Previous</label>
            <input
              type="text"
              inputMode="numeric"
              value={weldsPrevious}
              readOnly
              style={{ ...inputStyle, backgroundColor: '#f5f5f5' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Total Welds</label>
            <input
              type="text"
              inputMode="numeric"
              value={weldsToday + weldsPrevious}
              readOnly
              style={{ ...inputStyle, backgroundColor: '#e3f2fd', fontWeight: 'bold', fontSize: '16px' }}
            />
          </div>
        </div>
      </div>

      {/* Weld Parameters Table */}
      <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', color: '#1e3a5f' }}>Weld Parameters</h4>
          <button
            onClick={addWeldEntry}
            disabled={!crewType}
            style={{
              backgroundColor: crewType ? '#28a745' : '#ccc',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: crewType ? 'pointer' : 'not-allowed',
              fontSize: '13px'
            }}
          >
            + Add Weld
          </button>
        </div>
        
        {weldEntries.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            {crewType ? 'Click "+ Add Weld" to start tracking welds' : 'Select a crew type first'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#1e3a5f', color: 'white' }}>
                  <th style={{ padding: '8px 4px', textAlign: 'left' }}>Weld No.</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Preheat °C</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Pass</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Side</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Volts</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Amps</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Dist (mm)</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Time (s)</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Speed (mm/min)</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Heat Input</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>WPS</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Meets WPS</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {weldEntries.map((entry, idx) => (
                  <tr key={entry.id} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#f8f9fa' }}>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        value={entry.weldNumber}
                        onChange={(e) => updateWeldEntry(entry.id, 'weldNumber', e.target.value)}
                        style={{ ...inputStyle, width: '90px', fontFamily: 'monospace', fontWeight: 'bold' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={entry.preheat}
                        onChange={(e) => updateWeldEntry(entry.id, 'preheat', e.target.value)}
                        style={{ ...getInputStyle(getParamStatus(entry.preheat, 'preheat')), width: '70px', textAlign: 'center' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <select
                        value={entry.pass}
                        onChange={(e) => updateWeldEntry(entry.id, 'pass', e.target.value)}
                        style={{ ...inputStyle, width: '90px' }}
                      >
                        <option value="">Select...</option>
                        {PASS_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px' }}>
                      <select
                        value={entry.side}
                        onChange={(e) => updateWeldEntry(entry.id, 'side', e.target.value)}
                        style={{ ...inputStyle, width: '70px' }}
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
                        value={entry.voltage}
                        onChange={(e) => updateWeldEntry(entry.id, 'voltage', e.target.value)}
                        style={{ ...getInputStyle(getParamStatus(entry.voltage, 'voltage')), width: '65px', textAlign: 'center' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={entry.amperage}
                        onChange={(e) => updateWeldEntry(entry.id, 'amperage', e.target.value)}
                        style={{ ...getInputStyle(getParamStatus(entry.amperage, 'amperage', weldMethod)), width: '65px', textAlign: 'center' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={entry.distance}
                        onChange={(e) => updateWeldEntry(entry.id, 'distance', e.target.value)}
                        style={{ ...inputStyle, width: '65px', textAlign: 'center' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={entry.time}
                        onChange={(e) => updateWeldEntry(entry.id, 'time', e.target.value)}
                        style={{ ...inputStyle, width: '60px', textAlign: 'center' }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={entry.travelSpeed}
                        onChange={(e) => updateWeldEntry(entry.id, 'travelSpeed', e.target.value)}
                        style={{ ...getInputStyle(getParamStatus(entry.travelSpeed, 'travelSpeed', weldMethod)), width: '75px', textAlign: 'center' }}
                      />
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <span style={{ 
                        fontFamily: 'monospace', 
                        fontWeight: 'bold',
                        color: entry.meetsWPS === false ? '#dc3545' : '#333'
                      }}>
                        {entry.heatInput || '-'}
                      </span>
                    </td>
                    <td style={{ padding: '4px' }}>
                      <select
                        value={entry.wpsId}
                        onChange={(e) => updateWeldEntry(entry.id, 'wpsId', e.target.value)}
                        style={{ ...inputStyle, width: '120px' }}
                      >
                        <option value="">Select WPS...</option>
                        {wpsOptions.map(w => (
                          <option key={w.wps_id} value={w.wps_id}>{w.wps_id}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      {entry.meetsWPS === null ? (
                        <span style={{ color: '#999' }}>-</span>
                      ) : entry.meetsWPS ? (
                        <span style={{ color: '#28a745', fontWeight: 'bold' }}>✓ Yes</span>
                      ) : (
                        <span style={{ color: '#dc3545', fontWeight: 'bold' }}>✗ No</span>
                      )}
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <button
                        onClick={() => removeWeldEntry(entry.id)}
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

      {/* Visuals Completed */}
      <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#1e3a5f' }}>Visuals Completed</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <div>
            <label style={labelStyle}>From Weld No.</label>
            <input
              type="text"
              value={visualsFrom}
              onChange={(e) => setVisualsFrom(e.target.value)}
              placeholder="e.g., SC-0001"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>To Weld No.</label>
            <input
              type="text"
              value={visualsTo}
              onChange={(e) => setVisualsTo(e.target.value)}
              placeholder="e.g., SC-0015"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Visual Repairs Identified */}
      <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', color: '#1e3a5f' }}>Visual Repairs Identified</h4>
          <button
            onClick={addRepair}
            style={{ backgroundColor: '#ffc107', color: '#333', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
          >
            + Add Repair
          </button>
        </div>
        
        {repairs.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>No repairs identified</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#ffc107' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Weld Number</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Defect Type</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Defect Name</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>Location (Clock)</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {repairs.map((repair, idx) => (
                <tr key={repair.id} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#fffbeb' }}>
                  <td style={{ padding: '6px' }}>
                    <input
                      type="text"
                      value={repair.weldNumber}
                      onChange={(e) => updateRepair(repair.id, 'weldNumber', e.target.value)}
                      placeholder="e.g., SC-0005"
                      style={{ ...inputStyle, width: '120px' }}
                    />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <select
                      value={repair.defectCode}
                      onChange={(e) => updateRepair(repair.id, 'defectCode', e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Select defect...</option>
                      {DEFECT_CODES.map(d => (
                        <option key={d.code} value={d.code}>{d.code} - {d.name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '6px', color: '#666' }}>
                    {repair.defectName || '-'}
                  </td>
                  <td style={{ padding: '6px' }}>
                    <select
                      value={repair.clockPosition}
                      onChange={(e) => updateRepair(repair.id, 'clockPosition', e.target.value)}
                      style={{ ...inputStyle, width: '100px' }}
                    >
                      <option value="">Select...</option>
                      {CLOCK_POSITIONS.map(p => (
                        <option key={p} value={p}>{p} o'clock</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <button
                      onClick={() => removeRepair(repair.id)}
                      style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
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

      {/* Time Tracking */}
      <div style={{ ...sectionStyle, borderRadius: '0 0 6px 6px', borderTop: 'none' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#1e3a5f' }}>Time Tracking</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>End Time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Down Time (hrs)</label>
            <input
              type="text"
              inputMode="decimal"
              value={downTimeHours}
              onChange={(e) => setDownTimeHours(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Down Time Reason</label>
            <select
              value={downTimeReason}
              onChange={(e) => setDownTimeReason(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select reason...</option>
              {DOWN_TIME_REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Total Weld Time (hrs)</label>
            <input
              type="text"
              value={calculateTotalWeldTime()}
              readOnly
              style={{ ...inputStyle, backgroundColor: '#e3f2fd', fontWeight: 'bold' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
