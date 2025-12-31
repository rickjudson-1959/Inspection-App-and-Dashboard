import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'

// MatTracker component for tracking mat movements
// Logs transactions that feed into project-wide mat inventory

function MatTracker({ projectId, reportDate, reportId, inspector, onDataChange }) {
  const [transactions, setTransactions] = useState([])
  const [matSummary, setMatSummary] = useState({ rigMats: { deployed: 0, inYard: 0 }, swampMats: { deployed: 0, inYard: 0 } })
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)

  // Load existing transactions for this report and summary
  useEffect(() => {
    loadData()
  }, [reportId])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load transactions for this report
      if (reportId) {
        const { data: txns } = await supabase
          .from('mat_transactions')
          .select('*')
          .eq('report_id', reportId)
          .order('created_at', { ascending: true })
        
        if (txns) setTransactions(txns)
      }

      // Load current mat summary (project-wide)
      const { data: summary } = await supabase
        .from('mat_transactions')
        .select('mat_type, action, quantity')
        .eq('project_id', projectId || 'default')

      if (summary) {
        const calc = { rigMats: { deployed: 0 }, swampMats: { deployed: 0 } }
        summary.forEach(tx => {
          const key = tx.mat_type === 'Rig Mat' ? 'rigMats' : 'swampMats'
          if (tx.action === 'Deploy' || tx.action === 'Relocate To') {
            calc[key].deployed += tx.quantity || 0
          } else if (tx.action === 'Retrieve' || tx.action === 'Relocate From') {
            calc[key].deployed -= tx.quantity || 0
          } else if (tx.action === 'Damaged') {
            calc[key].deployed -= tx.quantity || 0
          }
        })
        setMatSummary(calc)
      }
    } catch (err) {
      console.error('Error loading mat data:', err)
    }
    setLoading(false)
  }

  // Add a new transaction
  const addTransaction = () => {
    const newTx = {
      id: `temp-${Date.now()}`,
      mat_type: 'Rig Mat',
      mat_size: '8x40',
      mat_material: 'Wood',
      action: 'Deploy',
      quantity: 1,
      from_location: '',
      to_location: '',
      kp: '',
      crossing_id: '',
      crew: '',
      notes: '',
      isNew: true
    }
    setTransactions([...transactions, newTx])
  }

  // Update a transaction field
  const updateTransaction = (idx, field, value) => {
    const updated = transactions.map((tx, i) => i === idx ? { ...tx, [field]: value } : tx)
    setTransactions(updated)
    if (onDataChange) onDataChange(updated)
  }

  // Remove a transaction
  const removeTransaction = async (idx) => {
    const tx = transactions[idx]
    if (tx.id && !tx.id.startsWith('temp-')) {
      // Delete from database
      await supabase.from('mat_transactions').delete().eq('id', tx.id)
    }
    setTransactions(transactions.filter((_, i) => i !== idx))
  }

  // Save transaction to database
  const saveTransaction = async (idx) => {
    const tx = transactions[idx]
    const record = {
      project_id: projectId || 'default',
      report_id: reportId,
      report_date: reportDate,
      inspector: inspector,
      mat_type: tx.mat_type,
      mat_size: tx.mat_size,
      mat_material: tx.mat_material,
      action: tx.action,
      quantity: parseInt(tx.quantity) || 0,
      from_location: tx.from_location,
      to_location: tx.to_location,
      kp: tx.kp ? parseFloat(tx.kp) : null,
      crossing_id: tx.crossing_id,
      crew: tx.crew,
      notes: tx.notes
    }

    try {
      if (tx.id && !tx.id.startsWith('temp-')) {
        // Update existing
        await supabase.from('mat_transactions').update(record).eq('id', tx.id)
      } else {
        // Insert new
        const { data } = await supabase.from('mat_transactions').insert(record).select()
        if (data && data[0]) {
          const updated = [...transactions]
          updated[idx] = { ...updated[idx], id: data[0].id, isNew: false }
          setTransactions(updated)
        }
      }
      loadData() // Refresh summary
    } catch (err) {
      console.error('Error saving transaction:', err)
      alert('Error saving transaction')
    }
  }

  // Styles
  const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', color: '#555' }
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }

  return (
    <div style={{ marginBottom: '15px', border: '2px solid #6f42c1', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '12px 15px',
          backgroundColor: expanded ? '#6f42c1' : '#e9ecef',
          color: expanded ? 'white' : '#333',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span>🛤️ Mat Tracker ({transactions.length} movements today)</span>
        <span>{expanded ? '▼' : '▶'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '15px', backgroundColor: '#fff' }}>
          {/* Current Inventory Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
            <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#e7f3ff', borderRadius: '6px', border: '1px solid #b8daff' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#004085', marginBottom: '5px' }}>RIG MATS</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#004085' }}>{matSummary.rigMats?.deployed || 0}</div>
              <div style={{ fontSize: '11px', color: '#666' }}>Currently Deployed</div>
            </div>
            <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#d4edda', borderRadius: '6px', border: '1px solid #c3e6cb' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#155724', marginBottom: '5px' }}>SWAMP MATS</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#155724' }}>{matSummary.swampMats?.deployed || 0}</div>
              <div style={{ fontSize: '11px', color: '#666' }}>Currently Deployed</div>
            </div>
          </div>

          {/* Transactions List */}
          {loading ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Loading...</p>
          ) : transactions.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic', margin: '0 0 15px 0' }}>No mat movements logged today. Click "Log Mat Movement" to start.</p>
          ) : (
            transactions.map((tx, idx) => (
              <div key={tx.id || idx} style={{ marginBottom: '15px', padding: '15px', backgroundColor: idx % 2 === 0 ? '#f8f9fa' : '#fff', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <strong style={{ color: '#6f42c1' }}>Movement #{idx + 1}</strong>
                  <div>
                    {tx.isNew && (
                      <button type="button" onClick={() => saveTransaction(idx)} style={{ padding: '4px 10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', marginRight: '5px' }}>Save</button>
                    )}
                    <button type="button" onClick={() => removeTransaction(idx)} style={{ padding: '4px 10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                  </div>
                </div>
                <div style={gridStyle}>
                  <div>
                    <label style={labelStyle}>Mat Type</label>
                    <select value={tx.mat_type || ''} onChange={(e) => updateTransaction(idx, 'mat_type', e.target.value)} style={inputStyle}>
                      <option value="Rig Mat">Rig Mat</option>
                      <option value="Swamp Mat">Swamp Mat</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Size</label>
                    <select value={tx.mat_size || ''} onChange={(e) => updateTransaction(idx, 'mat_size', e.target.value)} style={inputStyle}>
                      <option value="">Select...</option>
                      <option value="8x14">8x14</option>
                      <option value="8x20">8x20</option>
                      <option value="8x40">8x40</option>
                      <option value="4x8">4x8 (Swamp)</option>
                      <option value="4x12">4x12 (Swamp)</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Material</label>
                    <select value={tx.mat_material || ''} onChange={(e) => updateTransaction(idx, 'mat_material', e.target.value)} style={inputStyle}>
                      <option value="">Select...</option>
                      <option value="Wood">Wood</option>
                      <option value="CLT">CLT (Cross-Laminated)</option>
                      <option value="Composite">Composite</option>
                      <option value="HDPE">HDPE</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Action</label>
                    <select value={tx.action || ''} onChange={(e) => updateTransaction(idx, 'action', e.target.value)} style={inputStyle}>
                      <option value="Deploy">Deploy (from yard)</option>
                      <option value="Relocate">Relocate (move)</option>
                      <option value="Retrieve">Retrieve (to yard)</option>
                      <option value="Damaged">Damaged/Lost</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Quantity</label>
                    <input type="number" value={tx.quantity || ''} onChange={(e) => updateTransaction(idx, 'quantity', e.target.value)} min="1" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>KP Location</label>
                    <input type="number" step="0.001" value={tx.kp || ''} onChange={(e) => updateTransaction(idx, 'kp', e.target.value)} placeholder="e.g., 5.250" style={inputStyle} />
                  </div>
                </div>
                <div style={{ ...gridStyle, marginTop: '10px' }}>
                  <div>
                    <label style={labelStyle}>From Location</label>
                    <input type="text" value={tx.from_location || ''} onChange={(e) => updateTransaction(idx, 'from_location', e.target.value)} placeholder="Yard, KP, Site name" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>To Location</label>
                    <input type="text" value={tx.to_location || ''} onChange={(e) => updateTransaction(idx, 'to_location', e.target.value)} placeholder="Crossing ID, KP, Site" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Crossing ID</label>
                    <input type="text" value={tx.crossing_id || ''} onChange={(e) => updateTransaction(idx, 'crossing_id', e.target.value)} placeholder="e.g., WX-001" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Crew</label>
                    <input type="text" value={tx.crew || ''} onChange={(e) => updateTransaction(idx, 'crew', e.target.value)} placeholder="Contractor/Crew" style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginTop: '10px' }}>
                  <label style={labelStyle}>Notes</label>
                  <input type="text" value={tx.notes || ''} onChange={(e) => updateTransaction(idx, 'notes', e.target.value)} placeholder="Condition, reason for move, etc." style={inputStyle} />
                </div>
              </div>
            ))
          )}

          {/* Add Button */}
          <button type="button" onClick={addTransaction} style={{ padding: '10px 20px', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            + Log Mat Movement
          </button>
        </div>
      )}
    </div>
  )
}

export default MatTracker
