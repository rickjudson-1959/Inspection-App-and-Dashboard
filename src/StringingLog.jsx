import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline"
const AFE_NUMBER = "CWP-2025-001"

const SIDE_OPTIONS = ['W/S', 'S/S']
const CONDITION_OPTIONS = ['Good', 'Damaged Bevel', 'Needs Re-bevel']
const LOCATION_TYPE_OPTIONS = ['Ditch', 'Pup Bank', 'Inventory']

export default function StringingLog({ blockId, reportId, onDataChange, existingData, contractor: propContractor, foreman: propForeman }) {
  const [contractor, setContractor] = useState(existingData?.contractor || '')
  const [foreman, setForeman] = useState(existingData?.foreman || '')
  
  // Joint counts
  const [jointsToday, setJointsToday] = useState(existingData?.jointsToday || 0)
  const [jointsPrevious, setJointsPrevious] = useState(existingData?.jointsPrevious || 0)
  const [totalLengthM, setTotalLengthM] = useState(existingData?.totalLengthM || 0)
  
  // Joint entries
  const [jointEntries, setJointEntries] = useState(existingData?.jointEntries || [])
  
  // Cut modal state
  const [showCutModal, setShowCutModal] = useState(false)
  const [cuttingJoint, setCuttingJoint] = useState(null)
  const [cutLength, setCutLength] = useState('')
  const [pupDisposition, setPupDisposition] = useState('Ditch')
  const [stencilConfirmed, setStencilConfirmed] = useState(false)
  
  // Pup Bank view
  const [showPupBank, setShowPupBank] = useState(false)
  
  // Reference data
  const [pipeSpecs, setPipeSpecs] = useState([])
  const [coatingTypes, setCoatingTypes] = useState([])
  const [designSpecs, setDesignSpecs] = useState([])
  const [pupConfig, setPupConfig] = useState([])
  const [wallThicknessOptions, setWallThicknessOptions] = useState([])
  
  // Loading/error state
  const [loading, setLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState({})

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (propContractor) setContractor(propContractor)
    if (propForeman) setForeman(propForeman)
  }, [propContractor, propForeman])

  useEffect(() => {
    loadPreviousJointCount()
  }, [])

  useEffect(() => {
    // Calculate total length
    const total = jointEntries
      .filter(j => j.status === 'Strung')
      .reduce((sum, j) => sum + (parseFloat(j.lengthM) || 0), 0)
    setTotalLengthM(total)
    
    // Push data changes up to parent
    const data = {
      contractor,
      foreman,
      jointsToday,
      jointsPrevious,
      totalJoints: jointsToday + jointsPrevious,
      totalLengthM: total,
      jointEntries
    }
    onDataChange(data)
  }, [contractor, foreman, jointsToday, jointsPrevious, jointEntries])

  async function loadInitialData() {
    // Load pipe specifications
    const { data: specs } = await supabase
      .from('pipe_specifications')
      .select('*')
      .order('nominal_od_mm')
    if (specs) setPipeSpecs(specs)

    // Load coating types
    const { data: coatings } = await supabase
      .from('coating_types')
      .select('*')
      .order('coating_code')
    if (coatings) setCoatingTypes(coatings)

    // Load design specifications (wall thickness map)
    const { data: design } = await supabase
      .from('project_design_spec')
      .select('*')
      .eq('project_name', PROJECT_NAME)
      .order('station_start')
    if (design) setDesignSpecs(design)

    // Load pup configuration
    const { data: pup } = await supabase
      .from('pup_config')
      .select('*')
      .eq('project_name', PROJECT_NAME)
      .order('pipe_dia_min_inch')
    if (pup) setPupConfig(pup)

    // Load wall thickness options
    const { data: wt } = await supabase
      .from('wall_thickness_options')
      .select('*')
      .order('pipe_size, wall_thickness_mm')
    if (wt) setWallThicknessOptions(wt)

    setLoading(false)
  }

  async function loadPreviousJointCount() {
    const { data } = await supabase
      .from('stringing_daily_summary')
      .select('total_joints')
      .order('created_at', { ascending: false })
      .limit(1)
    
    if (data && data.length > 0) {
      setJointsPrevious(data[0].total_joints || 0)
    }
  }

  function parseStationToMeters(station) {
    // Convert "5+250" format to meters (5250)
    if (!station) return null
    const match = station.match(/(\d+)\+(\d+)/)
    if (match) {
      return parseInt(match[1]) * 1000 + parseInt(match[2])
    }
    return parseFloat(station) || null
  }

  function getRequiredWallThickness(stationMeters) {
    if (!stationMeters) return null
    const spec = designSpecs.find(s => 
      stationMeters >= s.station_start && stationMeters <= s.station_end
    )
    return spec
  }

  function getMinUsableLength(pipeSize) {
    if (!pipeSize) return 1.5 // default
    const sizeNum = parseFloat(pipeSize.replace('"', ''))
    const config = pupConfig.find(p => 
      sizeNum >= p.pipe_dia_min_inch && sizeNum <= p.pipe_dia_max_inch
    )
    return config ? config.min_usable_length_m : 1.5
  }

  function validateJoint(entry) {
    const errors = {}
    
    // Check for duplicate joint number
    const duplicate = jointEntries.find(j => 
      j.id !== entry.id && 
      j.jointNumber === entry.jointNumber && 
      j.status === 'Strung'
    )
    if (duplicate) {
      errors.jointNumber = `Joint ${entry.jointNumber} is already listed at Station ${duplicate.stationKP}`
    }
    
    // Check wall thickness against design spec
    if (entry.stationKP && entry.wallThickness) {
      const stationMeters = parseStationToMeters(entry.stationKP)
      const requiredSpec = getRequiredWallThickness(stationMeters)
      
      if (requiredSpec && parseFloat(entry.wallThickness) < requiredSpec.min_wall_thickness_mm) {
        errors.wallThickness = `WRONG PIPE. Station ${entry.stationKP} is ${requiredSpec.reason}. Requires ${requiredSpec.min_wall_thickness_mm}mm wall (${requiredSpec.min_grade})`
      }
    }
    
    return errors
  }

  function addJointEntry() {
    const newEntry = {
      id: Date.now(),
      jointNumber: '',
      heatNumber: '',
      stationKP: '',
      sideOfRow: '',
      pipeSize: '',
      lengthM: '',
      wallThickness: '',
      coatingType: '',
      visualCheck: false,
      status: 'Strung',
      parentJointId: null,
      isPup: false,
      pupDesignation: '',
      condition: 'Good',
      locationType: 'Ditch',
      gpsLat: null,
      gpsLon: null
    }
    setJointEntries([...jointEntries, newEntry])
    setJointsToday(jointsToday + 1)
  }

  function updateJointEntry(id, field, value) {
    setJointEntries(jointEntries.map(entry => {
      if (entry.id !== id) return entry
      
      const updated = { ...entry, [field]: value }
      
      // Validate on change
      const errors = validateJoint(updated)
      setValidationErrors(prev => ({ ...prev, [id]: errors }))
      
      return updated
    }))
  }

  function removeJointEntry(id) {
    const entry = jointEntries.find(e => e.id === id)
    if (entry && entry.status === 'Strung' && !entry.isPup) {
      setJointsToday(Math.max(0, jointsToday - 1))
    }
    setJointEntries(jointEntries.filter(e => e.id !== id))
    setValidationErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors[id]
      return newErrors
    })
  }

  async function captureGPS(id) {
    if (!navigator.geolocation) {
      alert('GPS not supported by this browser')
      return
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setJointEntries(jointEntries.map(entry => {
          if (entry.id !== id) return entry
          return {
            ...entry,
            gpsLat: position.coords.latitude,
            gpsLon: position.coords.longitude
          }
        }))
      },
      (error) => {
        alert('Error capturing GPS: ' + error.message)
      },
      { enableHighAccuracy: true }
    )
  }

  function openCutModal(joint) {
    setCuttingJoint(joint)
    setCutLength('')
    setPupDisposition('Ditch')
    setStencilConfirmed(false)
    setShowCutModal(true)
  }

  function executeCut() {
    if (!cuttingJoint || !cutLength || !stencilConfirmed) return
    
    const originalLength = parseFloat(cuttingJoint.lengthM)
    const cutLengthNum = parseFloat(cutLength)
    const remainderLength = originalLength - cutLengthNum
    const minUsable = getMinUsableLength(cuttingJoint.pipeSize)
    
    // Create Pup A (the cut piece going into ditch)
    const pupA = {
      id: Date.now(),
      jointNumber: `${cuttingJoint.jointNumber}-A`,
      heatNumber: cuttingJoint.heatNumber,
      stationKP: cuttingJoint.stationKP,
      sideOfRow: cuttingJoint.sideOfRow,
      pipeSize: cuttingJoint.pipeSize,
      lengthM: cutLengthNum.toFixed(3),
      wallThickness: cuttingJoint.wallThickness,
      coatingType: cuttingJoint.coatingType,
      visualCheck: cuttingJoint.visualCheck,
      status: 'Strung',
      parentJointId: cuttingJoint.id,
      isPup: true,
      pupDesignation: 'A',
      condition: 'Good',
      locationType: pupDisposition,
      gpsLat: cuttingJoint.gpsLat,
      gpsLon: cuttingJoint.gpsLon
    }
    
    // Create Pup B (the remainder)
    const pupBStatus = remainderLength < minUsable ? 'Scrap' : 'Inventory'
    const pupB = {
      id: Date.now() + 1,
      jointNumber: `${cuttingJoint.jointNumber}-B`,
      heatNumber: cuttingJoint.heatNumber,
      stationKP: '',
      sideOfRow: '',
      pipeSize: cuttingJoint.pipeSize,
      lengthM: remainderLength.toFixed(3),
      wallThickness: cuttingJoint.wallThickness,
      coatingType: cuttingJoint.coatingType,
      visualCheck: false,
      status: pupBStatus,
      parentJointId: cuttingJoint.id,
      isPup: true,
      pupDesignation: 'B',
      condition: 'Good',
      locationType: pupBStatus === 'Scrap' ? 'Scrap' : 'Pup Bank',
      gpsLat: null,
      gpsLon: null
    }
    
    // Update entries: mark original as Consumed, add pups
    setJointEntries(jointEntries.map(entry => {
      if (entry.id === cuttingJoint.id) {
        return { ...entry, status: 'Consumed' }
      }
      return entry
    }).concat([pupA, pupB]))
    
    setShowCutModal(false)
    setCuttingJoint(null)
    
    if (remainderLength < minUsable) {
      alert(`⚠️ Remainder (${remainderLength.toFixed(2)}m) is below minimum usable length (${minUsable}m). Marked as SCRAP.`)
    }
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

  const getErrorStyle = (entryId, field) => {
    const errors = validationErrors[entryId]
    if (errors && errors[field]) {
      return { border: '2px solid #dc3545', backgroundColor: '#fff5f5' }
    }
    return {}
  }

  const strungJoints = jointEntries.filter(j => j.status === 'Strung')
  const pupBankJoints = jointEntries.filter(j => j.locationType === 'Pup Bank' && j.status === 'Inventory')
  const scrapJoints = jointEntries.filter(j => j.status === 'Scrap')

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading stringing configuration...</div>
  }

  return (
    <div style={{ marginTop: '16px' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#0277bd', color: 'white', padding: '12px 16px', borderRadius: '6px 6px 0 0', marginBottom: '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>STRINGING LOG</h3>
          <div style={{ fontSize: '12px' }}>
            <span style={{ marginRight: '20px' }}>Project: {PROJECT_NAME}</span>
            <span>AFE: {AFE_NUMBER}</span>
          </div>
        </div>
      </div>

      {/* Header Info */}
      <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
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
          <div style={{ backgroundColor: '#e3f2fd', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#0277bd', marginBottom: '4px' }}>Total Length Strung</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#01579b' }}>{totalLengthM.toFixed(1)} m</div>
          </div>
          <div>
            <button
              onClick={() => setShowPupBank(!showPupBank)}
              style={{ 
                backgroundColor: showPupBank ? '#ff9800' : '#fff3e0', 
                color: showPupBank ? 'white' : '#e65100',
                border: '2px solid #ff9800',
                padding: '12px 16px', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontSize: '13px',
                width: '100%',
                height: '100%',
                fontWeight: 'bold'
              }}
            >
              📦 Pup Bank ({pupBankJoints.length})
            </button>
          </div>
        </div>
      </div>

      {/* Joint Count Summary */}
      <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#0277bd' }}>Joint Count Summary</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Joints Today</label>
            <input
              type="number"
              value={jointsToday}
              onChange={(e) => setJointsToday(parseInt(e.target.value) || 0)}
              style={{ ...inputStyle, backgroundColor: '#e3f2fd', fontWeight: 'bold' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Joints Previous</label>
            <input
              type="number"
              value={jointsPrevious}
              readOnly
              style={{ ...inputStyle, backgroundColor: '#f5f5f5' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Total Joints</label>
            <input
              type="number"
              value={jointsToday + jointsPrevious}
              readOnly
              style={{ ...inputStyle, backgroundColor: '#bbdefb', fontWeight: 'bold', fontSize: '16px' }}
            />
          </div>
        </div>
      </div>

      {/* Pup Bank View */}
      {showPupBank && (
        <div style={{ ...sectionStyle, borderRadius: '0', marginBottom: '0', borderTop: 'none', backgroundColor: '#fff3e0' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#e65100' }}>📦 Virtual Pup Bank - Available Pups</h4>
          {pupBankJoints.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
              No pups in inventory
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#ff9800', color: 'white' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Pup ID</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Heat #</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Size</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Length (m)</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>W.T. (mm)</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Condition</th>
                </tr>
              </thead>
              <tbody>
                {pupBankJoints.map((pup, idx) => (
                  <tr key={pup.id} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#fff8e1' }}>
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>{pup.jointNumber}</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{pup.heatNumber}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{pup.pipeSize}</td>
                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{pup.lengthM}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{pup.wallThickness}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{pup.condition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Stringing Table */}
      <div style={{ ...sectionStyle, borderRadius: '0 0 6px 6px', borderTop: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', color: '#0277bd' }}>Joints Strung</h4>
          <button
            onClick={addJointEntry}
            style={{ backgroundColor: '#28a745', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
          >
            + Add Joint
          </button>
        </div>
        
        {strungJoints.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            Click "+ Add Joint" to start logging strung pipe
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: '#0277bd', color: 'white' }}>
                  <th style={{ padding: '6px 4px', textAlign: 'left' }}>Joint #</th>
                  <th style={{ padding: '6px 4px', textAlign: 'left' }}>Heat #</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center' }}>Station</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center' }}>Side</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center' }}>Size</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center' }}>Length (m)</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center' }}>W.T. (mm)</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center' }}>Coating</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center' }}>Visual ✓</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center' }}>GPS</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {strungJoints.map((entry, idx) => (
                  <>
                    <tr key={entry.id} style={{ backgroundColor: entry.isPup ? '#e3f2fd' : (idx % 2 === 0 ? 'white' : '#f8f9fa') }}>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="text"
                          value={entry.jointNumber}
                          onChange={(e) => updateJointEntry(entry.id, 'jointNumber', e.target.value)}
                          placeholder="J-1042"
                          style={{ ...inputStyle, width: '80px', fontFamily: 'monospace', fontWeight: 'bold', ...getErrorStyle(entry.id, 'jointNumber') }}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="text"
                          value={entry.heatNumber}
                          onChange={(e) => updateJointEntry(entry.id, 'heatNumber', e.target.value)}
                          placeholder="84552"
                          style={{ ...inputStyle, width: '70px', fontFamily: 'monospace', backgroundColor: entry.isPup ? '#e8f5e9' : 'white' }}
                          readOnly={entry.isPup}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="text"
                          value={entry.stationKP}
                          onChange={(e) => updateJointEntry(entry.id, 'stationKP', e.target.value)}
                          placeholder="5+250"
                          style={{ ...inputStyle, width: '70px', textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <select
                          value={entry.sideOfRow}
                          onChange={(e) => updateJointEntry(entry.id, 'sideOfRow', e.target.value)}
                          style={{ ...inputStyle, width: '55px' }}
                        >
                          <option value="">-</option>
                          {SIDE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px' }}>
                        <select
                          value={entry.pipeSize}
                          onChange={(e) => updateJointEntry(entry.id, 'pipeSize', e.target.value)}
                          style={{ ...inputStyle, width: '65px' }}
                        >
                          <option value="">-</option>
                          {pipeSpecs.map(s => <option key={s.pipe_size} value={s.pipe_size}>{s.pipe_size}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="number"
                          step="0.001"
                          value={entry.lengthM}
                          onChange={(e) => updateJointEntry(entry.id, 'lengthM', e.target.value)}
                          placeholder="12.19"
                          style={{ ...inputStyle, width: '65px', textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="number"
                          step="0.01"
                          value={entry.wallThickness}
                          onChange={(e) => updateJointEntry(entry.id, 'wallThickness', e.target.value)}
                          placeholder="6.35"
                          style={{ ...inputStyle, width: '60px', textAlign: 'center', ...getErrorStyle(entry.id, 'wallThickness') }}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <select
                          value={entry.coatingType}
                          onChange={(e) => updateJointEntry(entry.id, 'coatingType', e.target.value)}
                          style={{ ...inputStyle, width: '60px' }}
                        >
                          <option value="">-</option>
                          {coatingTypes.map(c => <option key={c.coating_code} value={c.coating_code}>{c.coating_code}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={entry.visualCheck}
                          onChange={(e) => updateJointEntry(entry.id, 'visualCheck', e.target.checked)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        {entry.gpsLat ? (
                          <span style={{ color: '#28a745', fontSize: '14px' }}>📍</span>
                        ) : (
                          <button
                            onClick={() => captureGPS(entry.id)}
                            style={{ backgroundColor: '#17a2b8', color: 'white', border: 'none', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
                          >
                            GPS
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          {!entry.isPup && (
                            <button
                              onClick={() => openCutModal(entry)}
                              style={{ backgroundColor: '#ff9800', color: 'white', border: 'none', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
                              title="Cut Pipe"
                            >
                              ✂️
                            </button>
                          )}
                          <button
                            onClick={() => removeJointEntry(entry.id)}
                            style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Validation Error Row */}
                    {validationErrors[entry.id] && Object.keys(validationErrors[entry.id]).length > 0 && (
                      <tr key={`${entry.id}-error`}>
                        <td colSpan="11" style={{ backgroundColor: '#ffebee', padding: '6px 12px', borderBottom: '2px solid #dc3545' }}>
                          {Object.values(validationErrors[entry.id]).map((err, i) => (
                            <div key={i} style={{ color: '#c62828', fontSize: '11px', fontWeight: 'bold' }}>
                              🛑 {err}
                            </div>
                          ))}
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
        {jointEntries.length > 0 && (
          <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div style={{ backgroundColor: '#e3f2fd', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#0277bd' }}>Strung</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#01579b' }}>{strungJoints.length}</div>
            </div>
            <div style={{ backgroundColor: '#fff3e0', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#e65100' }}>In Pup Bank</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e65100' }}>{pupBankJoints.length}</div>
            </div>
            <div style={{ backgroundColor: '#fce4ec', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#c62828' }}>Scrap</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#c62828' }}>{scrapJoints.length}</div>
            </div>
            <div style={{ backgroundColor: '#e8f5e9', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#2e7d32' }}>Visual ✓</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1b5e20' }}>
                {strungJoints.filter(j => j.visualCheck).length}/{strungJoints.length}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cut Modal */}
      {showCutModal && cuttingJoint && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '450px', maxWidth: '95%' }}>
            <div style={{ backgroundColor: '#ff9800', color: 'white', padding: '16px', borderRadius: '12px 12px 0 0' }}>
              <h3 style={{ margin: 0 }}>✂️ Cut Pipe - {cuttingJoint.jointNumber}</h3>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ backgroundColor: '#fff3e0', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>Original Joint</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                  <div><strong>Heat #:</strong> {cuttingJoint.heatNumber}</div>
                  <div><strong>Length:</strong> {cuttingJoint.lengthM} m</div>
                  <div><strong>Size:</strong> {cuttingJoint.pipeSize}</div>
                  <div><strong>W.T.:</strong> {cuttingJoint.wallThickness} mm</div>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Cut Length (m) - Goes into ditch</label>
                <input
                  type="number"
                  step="0.001"
                  value={cutLength}
                  onChange={(e) => setCutLength(e.target.value)}
                  placeholder="e.g., 8.000"
                  style={inputStyle}
                />
                {cutLength && (
                  <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#e3f2fd', borderRadius: '4px', fontSize: '12px' }}>
                    <strong>Remainder:</strong> {(parseFloat(cuttingJoint.lengthM) - parseFloat(cutLength)).toFixed(3)} m
                    {(parseFloat(cuttingJoint.lengthM) - parseFloat(cutLength)) < getMinUsableLength(cuttingJoint.pipeSize) && (
                      <span style={{ color: '#dc3545', marginLeft: '8px' }}>
                        ⚠️ Below min ({getMinUsableLength(cuttingJoint.pipeSize)}m) - will be SCRAP
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Pup A Disposition (Cut Piece)</label>
                <select
                  value={pupDisposition}
                  onChange={(e) => setPupDisposition(e.target.value)}
                  style={inputStyle}
                >
                  {LOCATION_TYPE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div style={{ backgroundColor: '#ffebee', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={stencilConfirmed}
                    onChange={(e) => setStencilConfirmed(e.target.checked)}
                    style={{ width: '20px', height: '20px' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#c62828' }}>
                    ⚠️ CONFIRM: Heat Number [{cuttingJoint.heatNumber}] has been transferred to the remaining pup
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={executeCut}
                  disabled={!cutLength || !stencilConfirmed}
                  style={{ 
                    flex: 1, 
                    backgroundColor: (!cutLength || !stencilConfirmed) ? '#ccc' : '#ff9800', 
                    color: 'white', 
                    border: 'none', 
                    padding: '12px', 
                    borderRadius: '6px', 
                    cursor: (!cutLength || !stencilConfirmed) ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  ✂️ Execute Cut
                </button>
                <button
                  onClick={() => setShowCutModal(false)}
                  style={{ padding: '12px 24px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
