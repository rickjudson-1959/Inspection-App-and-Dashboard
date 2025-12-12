import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'

// ============================================================================
// PROJECT CONFIGURATION COMPONENT
// Stores project-level settings for EVM calculations and dashboard metrics
// ============================================================================

function ProjectConfig({ onBack, onSave }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  
  // Project Basic Info
  const [projectName, setProjectName] = useState('Eagle Mountain - Woodfibre Gas Pipeline')
  const [projectNumber, setProjectNumber] = useState('EMW-2024-001')
  const [clientName, setClientName] = useState('FortisBC')
  const [primeContractor, setPrimeContractor] = useState('')
  
  // Pipeline Details
  const [pipelineStartKP, setPipelineStartKP] = useState('0+000')
  const [pipelineEndKP, setPipelineEndKP] = useState('52+000')
  const [pipeDiameter, setPipeDiameter] = useState('24"')
  const [pipeGrade, setPipeGrade] = useState('X70')
  
  // Budget & Schedule (for EVM)
  const [totalBudget, setTotalBudget] = useState('125000000')
  const [baselineStartDate, setBaselineStartDate] = useState('2024-06-01')
  const [baselineEndDate, setBaselineEndDate] = useState('2025-12-31')
  const [contingencyPercent, setContingencyPercent] = useState('10')
  
  // Spreads Configuration
  const [spreads, setSpreads] = useState([
    { id: 1, name: 'Spread 1', startKP: '0+000', endKP: '17+000', contractor: '' },
    { id: 2, name: 'Spread 2', startKP: '17+000', endKP: '35+000', contractor: '' },
    { id: 3, name: 'Spread 3', startKP: '35+000', endKP: '52+000', contractor: '' }
  ])
  
  // Contractors List
  const [contractors, setContractors] = useState([
    { id: 1, name: '', contact: '', phone: '' }
  ])

  // Load saved configuration on mount
  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    // Try to load from localStorage first (for quick access)
    const savedConfig = localStorage.getItem('projectConfig')
    if (savedConfig) {
      const config = JSON.parse(savedConfig)
      applyConfig(config)
    }
    
    // Also try to load from Supabase if table exists
    try {
      const { data, error } = await supabase
        .from('project_config')
        .select('*')
        .limit(1)
        .single()
      
      if (data && !error) {
        applyConfig(data.config)
      }
    } catch (e) {
      // Table might not exist yet, that's okay
      console.log('No project_config table found, using localStorage')
    }
  }

  function applyConfig(config) {
    if (config.projectName) setProjectName(config.projectName)
    if (config.projectNumber) setProjectNumber(config.projectNumber)
    if (config.clientName) setClientName(config.clientName)
    if (config.primeContractor) setPrimeContractor(config.primeContractor)
    if (config.pipelineStartKP) setPipelineStartKP(config.pipelineStartKP)
    if (config.pipelineEndKP) setPipelineEndKP(config.pipelineEndKP)
    if (config.pipeDiameter) setPipeDiameter(config.pipeDiameter)
    if (config.pipeGrade) setPipeGrade(config.pipeGrade)
    if (config.totalBudget) setTotalBudget(config.totalBudget)
    if (config.baselineStartDate) setBaselineStartDate(config.baselineStartDate)
    if (config.baselineEndDate) setBaselineEndDate(config.baselineEndDate)
    if (config.contingencyPercent) setContingencyPercent(config.contingencyPercent)
    if (config.spreads) setSpreads(config.spreads)
    if (config.contractors) setContractors(config.contractors)
  }

  async function saveConfig() {
    setSaving(true)
    
    const config = {
      projectName,
      projectNumber,
      clientName,
      primeContractor,
      pipelineStartKP,
      pipelineEndKP,
      pipeDiameter,
      pipeGrade,
      totalBudget,
      baselineStartDate,
      baselineEndDate,
      contingencyPercent,
      spreads,
      contractors,
      updatedAt: new Date().toISOString()
    }
    
    // Save to localStorage for quick access
    localStorage.setItem('projectConfig', JSON.stringify(config))
    
    // Try to save to Supabase as well
    try {
      await supabase
        .from('project_config')
        .upsert({ id: 1, config, updated_at: new Date().toISOString() })
    } catch (e) {
      console.log('Could not save to Supabase, saved to localStorage only')
    }
    
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    
    if (onSave) onSave(config)
  }

  function addSpread() {
    const newId = Math.max(...spreads.map(s => s.id), 0) + 1
    setSpreads([...spreads, { id: newId, name: `Spread ${newId}`, startKP: '', endKP: '', contractor: '' }])
  }

  function updateSpread(id, field, value) {
    setSpreads(spreads.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  function removeSpread(id) {
    if (spreads.length > 1) {
      setSpreads(spreads.filter(s => s.id !== id))
    }
  }

  function addContractor() {
    const newId = Math.max(...contractors.map(c => c.id), 0) + 1
    setContractors([...contractors, { id: newId, name: '', contact: '', phone: '' }])
  }

  function updateContractor(id, field, value) {
    setContractors(contractors.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  function removeContractor(id) {
    if (contractors.length > 1) {
      setContractors(contractors.filter(c => c.id !== id))
    }
  }

  // Calculate derived values
  const pipelineLength = (() => {
    const parseKP = (kp) => {
      const match = kp.match(/(\d+)\+(\d+)/)
      return match ? parseInt(match[1]) * 1000 + parseInt(match[2]) : 0
    }
    return (parseKP(pipelineEndKP) - parseKP(pipelineStartKP)) / 1000
  })()

  const projectDuration = (() => {
    const start = new Date(baselineStartDate)
    const end = new Date(baselineEndDate)
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24))
    const months = Math.floor(days / 30)
    return `${months} months (${days} days)`
  })()

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={onBack}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#007bff', 
            cursor: 'pointer', 
            fontSize: '14px',
            marginBottom: '10px'
          }}
        >
          ← Back to Daily Report
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: '0 0 5px 0', fontSize: '24px' }}>Project Configuration</h1>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
              Set up project parameters for dashboards and EVM calculations
            </p>
          </div>
          <button
            onClick={saveConfig}
            disabled={saving}
            style={{
              padding: '12px 30px',
              backgroundColor: saved ? '#28a745' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: saving ? 'wait' : 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* SECTION 1: PROJECT INFO */}
      <div style={{ backgroundColor: '#1565c0', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        PROJECT INFORMATION
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Project Number</label>
            <input
              type="text"
              value={projectNumber}
              onChange={(e) => setProjectNumber(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Client / Owner</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Prime Contractor</label>
            <input
              type="text"
              value={primeContractor}
              onChange={(e) => setPrimeContractor(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: PIPELINE DETAILS */}
      <div style={{ backgroundColor: '#2e7d32', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        PIPELINE DETAILS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Start KP</label>
            <input
              type="text"
              value={pipelineStartKP}
              onChange={(e) => setPipelineStartKP(e.target.value)}
              placeholder="0+000"
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>End KP</label>
            <input
              type="text"
              value={pipelineEndKP}
              onChange={(e) => setPipelineEndKP(e.target.value)}
              placeholder="52+000"
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Pipe Diameter</label>
            <select
              value={pipeDiameter}
              onChange={(e) => setPipeDiameter(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
            >
              <option value="4&quot;">4"</option>
              <option value="6&quot;">6"</option>
              <option value="8&quot;">8"</option>
              <option value="10&quot;">10"</option>
              <option value="12&quot;">12"</option>
              <option value="16&quot;">16"</option>
              <option value="20&quot;">20"</option>
              <option value="24&quot;">24"</option>
              <option value="30&quot;">30"</option>
              <option value="36&quot;">36"</option>
              <option value="42&quot;">42"</option>
              <option value="48&quot;">48"</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Pipe Grade</label>
            <select
              value={pipeGrade}
              onChange={(e) => setPipeGrade(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
            >
              <option value="B">Grade B</option>
              <option value="X42">X42</option>
              <option value="X52">X52</option>
              <option value="X60">X60</option>
              <option value="X65">X65</option>
              <option value="X70">X70</option>
              <option value="X80">X80</option>
            </select>
          </div>
        </div>
        
        {/* Calculated Summary */}
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '8px', border: '1px solid #c8e6c9' }}>
          <div style={{ fontSize: '14px', color: '#2e7d32' }}>
            <strong>Total Pipeline Length:</strong> {pipelineLength.toFixed(1)} km ({(pipelineLength * 1000).toLocaleString()} metres)
          </div>
        </div>
      </div>

      {/* SECTION 3: BUDGET & SCHEDULE (EVM) */}
      <div style={{ backgroundColor: '#c62828', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        BUDGET & SCHEDULE (EVM Configuration)
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Total Budget (BAC)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666' }}>$</span>
              <input
                type="text"
                value={parseInt(totalBudget).toLocaleString()}
                onChange={(e) => setTotalBudget(e.target.value.replace(/[^0-9]/g, ''))}
                style={{ width: '100%', padding: '10px', paddingLeft: '25px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Contingency %</label>
            <input
              type="number"
              value={contingencyPercent}
              onChange={(e) => setContingencyPercent(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Baseline Start Date</label>
            <input
              type="date"
              value={baselineStartDate}
              onChange={(e) => setBaselineStartDate(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Baseline End Date</label>
            <input
              type="date"
              value={baselineEndDate}
              onChange={(e) => setBaselineEndDate(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }}
            />
          </div>
        </div>
        
        {/* Budget Summary */}
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#ffebee', borderRadius: '8px', border: '1px solid #ffcdd2' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', fontSize: '14px' }}>
            <div>
              <strong>Base Budget:</strong><br/>
              ${parseInt(totalBudget).toLocaleString()}
            </div>
            <div>
              <strong>With Contingency:</strong><br/>
              ${(parseInt(totalBudget) * (1 + parseInt(contingencyPercent) / 100)).toLocaleString()}
            </div>
            <div>
              <strong>Project Duration:</strong><br/>
              {projectDuration}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 4: SPREADS */}
      <div style={{ backgroundColor: '#6a1b9a', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>SPREADS CONFIGURATION</span>
        <button
          onClick={addSpread}
          style={{ padding: '5px 15px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid white', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
        >
          + Add Spread
        </button>
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '25%' }}>Spread Name</th>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '15%' }}>Start KP</th>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '15%' }}>End KP</th>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '35%' }}>Contractor</th>
              <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '10%' }}></th>
            </tr>
          </thead>
          <tbody>
            {spreads.map((spread, idx) => (
              <tr key={spread.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                  <input
                    type="text"
                    value={spread.name}
                    onChange={(e) => updateSpread(spread.id, 'name', e.target.value)}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                  <input
                    type="text"
                    value={spread.startKP}
                    onChange={(e) => updateSpread(spread.id, 'startKP', e.target.value)}
                    placeholder="0+000"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                  <input
                    type="text"
                    value={spread.endKP}
                    onChange={(e) => updateSpread(spread.id, 'endKP', e.target.value)}
                    placeholder="17+000"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                  <input
                    type="text"
                    value={spread.contractor}
                    onChange={(e) => updateSpread(spread.id, 'contractor', e.target.value)}
                    placeholder="Contractor name"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', textAlign: 'center' }}>
                  <button
                    onClick={() => removeSpread(spread.id)}
                    disabled={spreads.length <= 1}
                    style={{ padding: '5px 10px', backgroundColor: spreads.length <= 1 ? '#ccc' : '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: spreads.length <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SECTION 5: CONTRACTORS */}
      <div style={{ backgroundColor: '#ef6c00', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>CONTRACTORS</span>
        <button
          onClick={addContractor}
          style={{ padding: '5px 15px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid white', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
        >
          + Add Contractor
        </button>
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '40%' }}>Company Name</th>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '25%' }}>Contact Person</th>
              <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '25%' }}>Phone</th>
              <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6', width: '10%' }}></th>
            </tr>
          </thead>
          <tbody>
            {contractors.map((contractor, idx) => (
              <tr key={contractor.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                  <input
                    type="text"
                    value={contractor.name}
                    onChange={(e) => updateContractor(contractor.id, 'name', e.target.value)}
                    placeholder="Company name"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                  <input
                    type="text"
                    value={contractor.contact}
                    onChange={(e) => updateContractor(contractor.id, 'contact', e.target.value)}
                    placeholder="Contact name"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                  <input
                    type="text"
                    value={contractor.phone}
                    onChange={(e) => updateContractor(contractor.id, 'phone', e.target.value)}
                    placeholder="(555) 123-4567"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', textAlign: 'center' }}>
                  <button
                    onClick={() => removeContractor(contractor.id)}
                    disabled={contractors.length <= 1}
                    style={{ padding: '5px 10px', backgroundColor: contractors.length <= 1 ? '#ccc' : '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: contractors.length <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Save Button */}
      <div style={{ textAlign: 'center', marginTop: '30px', marginBottom: '30px' }}>
        <button
          onClick={saveConfig}
          disabled={saving}
          style={{
            padding: '15px 50px',
            backgroundColor: saved ? '#28a745' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: saving ? 'wait' : 'pointer',
            fontWeight: 'bold',
            fontSize: '16px'
          }}
        >
          {saving ? 'Saving...' : saved ? '✓ Configuration Saved!' : 'Save Configuration'}
        </button>
      </div>
    </div>
  )
}

export default ProjectConfig
