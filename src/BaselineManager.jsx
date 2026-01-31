// BaselineManager.jsx - Manage Project Baselines
// Admin interface for viewing and editing EVM baselines

import React, { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'
import { useOrgQuery } from './utils/queryHelpers.js'

const BRAND = {
  navy: '#003366',
  orange: '#ff6600',
  green: '#28a745',
  red: '#dc3545',
  gray: '#6c757d'
}

// Activity types matching your pipeline phases
const ACTIVITY_TYPES = [
  'Clearing',
  'Grading',
  'Stringing',
  'Bending',
  'Welding - Mainline',
  'Welding - Tie-in',
  'Coating',
  'Lowering-In',
  'Backfill',
  'Cleanup',
  'HDD',
  'Hydrotest'
]

export default function BaselineManager() {
  const { addOrgFilter, getOrgId, organizationId, isReady } = useOrgQuery()
  const [baselines, setBaselines] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const fileInputRef = useRef(null)
  const [formData, setFormData] = useState({
    spread: 'EGP Mainline',
    activity_type: 'Welding - Mainline',
    planned_metres: 0,
    start_kp: '',
    end_kp: '',
    budgeted_unit_cost: 0,
    planned_start_date: '',
    planned_end_date: '',
    labour_rate_per_hour: 85,
    equipment_rate_per_hour: 150,
    notes: ''
  })

  useEffect(() => {
    if (isReady()) {
      fetchBaselines()
    }
  }, [organizationId])

  const fetchBaselines = async () => {
    setLoading(true)
    let query = supabase
      .from('project_baselines')
      .select('*')
      .order('activity_type')
      .order('spread')
    query = addOrgFilter(query)
    const { data, error } = await query

    if (error) {
      console.error('Error fetching baselines:', error)
      if (error.code === '42P01') {
        alert('The project_baselines table does not exist. Please run the SQL script first.')
      }
    } else {
      setBaselines(data || [])
    }
    setLoading(false)
  }

  // =====================================================
  // TEMPLATE DOWNLOAD
  // =====================================================
  const downloadTemplate = () => {
    const template = [
      {
        spread: 'EGP Mainline',
        activity_type: 'Welding - Mainline',
        planned_metres: 50000,
        start_kp: '0+000',
        end_kp: '50+000',
        budgeted_unit_cost: 185,
        planned_start_date: '2024-04-01',
        planned_end_date: '2024-07-15',
        labour_rate_per_hour: 95,
        equipment_rate_per_hour: 200,
        notes: 'Mainline welding - 24" pipe'
      },
      {
        spread: 'EGP Mainline',
        activity_type: 'Coating',
        planned_metres: 50000,
        start_kp: '0+000',
        end_kp: '50+000',
        budgeted_unit_cost: 35,
        planned_start_date: '2024-04-15',
        planned_end_date: '2024-07-30',
        labour_rate_per_hour: 70,
        equipment_rate_per_hour: 120,
        notes: 'Field joint coating'
      },
      {
        spread: 'EGP Tunnel',
        activity_type: 'HDD',
        planned_metres: 9000,
        start_kp: '47+000',
        end_kp: '56+000',
        budgeted_unit_cost: 2850,
        planned_start_date: '2024-03-01',
        planned_end_date: '2025-06-30',
        labour_rate_per_hour: 135,
        equipment_rate_per_hour: 450,
        notes: 'Tunnel boring through Coast Mountains'
      }
    ]

    const ws = XLSX.utils.json_to_sheet(template)
    
    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // spread
      { wch: 20 }, // activity_type
      { wch: 15 }, // planned_metres
      { wch: 10 }, // start_kp
      { wch: 10 }, // end_kp
      { wch: 18 }, // budgeted_unit_cost
      { wch: 18 }, // planned_start_date
      { wch: 16 }, // planned_end_date
      { wch: 20 }, // labour_rate_per_hour
      { wch: 22 }, // equipment_rate_per_hour
      { wch: 30 }, // notes
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Baselines')
    
    // Add instructions sheet
    const instructions = [
      ['PROJECT BASELINES IMPORT TEMPLATE'],
      [''],
      ['INSTRUCTIONS:'],
      ['1. Fill in your baseline data in the "Baselines" sheet'],
      ['2. Do not change the column headers'],
      ['3. Dates should be in YYYY-MM-DD format (e.g., 2024-04-01)'],
      ['4. KP format should be like "50+000" (kilometres + metres)'],
      ['5. Save the file and upload it using "Import from Excel"'],
      [''],
      ['COLUMN DESCRIPTIONS:'],
      ['spread', 'Project spread/section (e.g., Spread 1, Spread 2)'],
      ['activity_type', 'Must match: Clearing, Grading, Stringing, Bending, Welding - Mainline, Welding - Tie-in, Coating, Lowering-In, Backfill, Cleanup, HDD, Hydrotest'],
      ['planned_metres', 'Total metres planned for this activity'],
      ['start_kp', 'Starting kilometre post (e.g., 0+000)'],
      ['end_kp', 'Ending kilometre post (e.g., 50+000)'],
      ['budgeted_unit_cost', 'Cost per metre in dollars (e.g., 185)'],
      ['planned_start_date', 'Activity start date (YYYY-MM-DD)'],
      ['planned_end_date', 'Activity end date (YYYY-MM-DD)'],
      ['labour_rate_per_hour', 'Average labour rate for this activity (default: 85)'],
      ['equipment_rate_per_hour', 'Average equipment rate for this activity (default: 150)'],
      ['notes', 'Optional notes or description'],
    ]
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions)
    wsInstructions['!cols'] = [{ wch: 25 }, { wch: 80 }]
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions')

    XLSX.writeFile(wb, 'baseline_template.xlsx')
  }

  // =====================================================
  // IMPORT FROM EXCEL
  // =====================================================
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      if (jsonData.length === 0) {
        alert('No data found in spreadsheet')
        setImporting(false)
        return
      }

      // Validate and transform data
      const validatedData = jsonData.map((row, idx) => {
        const errors = []
        
        // Required fields
        if (!row.activity_type) errors.push('activity_type required')
        if (!row.planned_metres && row.planned_metres !== 0) errors.push('planned_metres required')
        if (!row.budgeted_unit_cost && row.budgeted_unit_cost !== 0) errors.push('budgeted_unit_cost required')
        if (!row.planned_start_date) errors.push('planned_start_date required')
        if (!row.planned_end_date) errors.push('planned_end_date required')

        // Parse dates (handle Excel serial numbers)
        let startDate = row.planned_start_date
        let endDate = row.planned_end_date
        
        if (typeof startDate === 'number') {
          startDate = excelDateToISO(startDate)
        }
        if (typeof endDate === 'number') {
          endDate = excelDateToISO(endDate)
        }

        return {
          spread: row.spread || 'Spread 1',
          activity_type: row.activity_type,
          planned_metres: parseFloat(row.planned_metres) || 0,
          start_kp: row.start_kp || '',
          end_kp: row.end_kp || '',
          budgeted_unit_cost: parseFloat(row.budgeted_unit_cost) || 0,
          planned_start_date: startDate,
          planned_end_date: endDate,
          labour_rate_per_hour: parseFloat(row.labour_rate_per_hour) || 85,
          equipment_rate_per_hour: parseFloat(row.equipment_rate_per_hour) || 150,
          notes: row.notes || '',
          _rowNum: idx + 2,
          _errors: errors,
          _isValid: errors.length === 0
        }
      })

      setImportPreview(validatedData)
    } catch (err) {
      console.error('Error parsing file:', err)
      alert('Error reading file: ' + err.message)
    }
    
    setImporting(false)
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Convert Excel serial date to ISO string
  const excelDateToISO = (serial) => {
    const utc_days = Math.floor(serial - 25569)
    const date = new Date(utc_days * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }

  // Confirm and import data
  const confirmImport = async (replaceExisting = false) => {
    if (!importPreview) return

    const validRows = importPreview.filter(r => r._isValid)
    if (validRows.length === 0) {
      alert('No valid rows to import')
      return
    }

    try {
      // Optionally delete existing baselines (with org filter)
      if (replaceExisting) {
        let deleteQuery = supabase
          .from('project_baselines')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
        deleteQuery = addOrgFilter(deleteQuery)
        const { error: deleteError } = await deleteQuery

        if (deleteError) throw deleteError
      }

      // Prepare data for insert (remove validation fields, add org_id)
      const insertData = validRows.map(row => ({
        spread: row.spread,
        activity_type: row.activity_type,
        planned_metres: row.planned_metres,
        start_kp: row.start_kp,
        end_kp: row.end_kp,
        budgeted_unit_cost: row.budgeted_unit_cost,
        planned_start_date: row.planned_start_date,
        planned_end_date: row.planned_end_date,
        labour_rate_per_hour: row.labour_rate_per_hour,
        equipment_rate_per_hour: row.equipment_rate_per_hour,
        notes: row.notes,
        is_active: true,
        organization_id: getOrgId()
      }))

      const { error: insertError } = await supabase
        .from('project_baselines')
        .insert(insertData)

      if (insertError) throw insertError

      alert(`Successfully imported ${validRows.length} baselines!`)
      setImportPreview(null)
      fetchBaselines()
    } catch (err) {
      console.error('Import error:', err)
      alert('Error importing data: ' + err.message)
    }
  }

  // =====================================================
  // EXPORT CURRENT BASELINES
  // =====================================================
  const exportBaselines = () => {
    if (baselines.length === 0) {
      alert('No baselines to export')
      return
    }

    const exportData = baselines.map(b => ({
      spread: b.spread,
      activity_type: b.activity_type,
      planned_metres: b.planned_metres,
      start_kp: b.start_kp,
      end_kp: b.end_kp,
      budgeted_unit_cost: b.budgeted_unit_cost,
      budgeted_total: b.budgeted_total,
      planned_start_date: b.planned_start_date,
      planned_end_date: b.planned_end_date,
      labour_rate_per_hour: b.labour_rate_per_hour,
      equipment_rate_per_hour: b.equipment_rate_per_hour,
      notes: b.notes
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Baselines')
    
    const today = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `project_baselines_${today}.xlsx`)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      if (editing) {
        // Update existing (with org filter)
        let updateQuery = supabase
          .from('project_baselines')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editing)
        updateQuery = addOrgFilter(updateQuery)
        const { error } = await updateQuery

        if (error) throw error
      } else {
        // Insert new (with org_id)
        const { error } = await supabase
          .from('project_baselines')
          .insert({ ...formData, organization_id: getOrgId() })

        if (error) throw error
      }

      setShowForm(false)
      setEditing(null)
      resetForm()
      fetchBaselines()
    } catch (err) {
      console.error('Error saving baseline:', err)
      alert('Error saving baseline: ' + err.message)
    }
  }

  const handleEdit = (baseline) => {
    setFormData({
      spread: baseline.spread,
      activity_type: baseline.activity_type,
      planned_metres: baseline.planned_metres,
      start_kp: baseline.start_kp || '',
      end_kp: baseline.end_kp || '',
      budgeted_unit_cost: baseline.budgeted_unit_cost,
      planned_start_date: baseline.planned_start_date,
      planned_end_date: baseline.planned_end_date,
      labour_rate_per_hour: baseline.labour_rate_per_hour,
      equipment_rate_per_hour: baseline.equipment_rate_per_hour,
      notes: baseline.notes || ''
    })
    setEditing(baseline.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this baseline?')) return

    let deleteQuery = supabase
      .from('project_baselines')
      .delete()
      .eq('id', id)
    deleteQuery = addOrgFilter(deleteQuery)
    const { error } = await deleteQuery

    if (error) {
      alert('Error deleting: ' + error.message)
    } else {
      fetchBaselines()
    }
  }

  const resetForm = () => {
    setFormData({
      spread: 'EGP Mainline',
      activity_type: 'Welding - Mainline',
      planned_metres: 0,
      start_kp: '',
      end_kp: '',
      budgeted_unit_cost: 0,
      planned_start_date: '',
      planned_end_date: '',
      labour_rate_per_hour: 85,
      equipment_rate_per_hour: 150,
      notes: ''
    })
  }

  const formatCurrency = (val) => 
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(val || 0)

  const inputStyle = {
    width: '100%',
    padding: '10px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 'bold',
    marginBottom: '5px',
    color: '#333'
  }

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '25px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `2px solid ${BRAND.orange}`, paddingBottom: '15px' }}>
        <div>
          <h2 style={{ margin: 0, color: BRAND.navy }}>📊 Project Baselines</h2>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
            Configure planned metres, costs, and schedules for EVM calculations
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={downloadTemplate}
            style={{
              padding: '10px 16px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            📥 Download Template
          </button>
          <label style={{
            padding: '10px 16px',
            backgroundColor: BRAND.orange,
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 'bold'
          }}>
            📤 Import from Excel
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </label>
          <button
            onClick={exportBaselines}
            style={{
              padding: '10px 16px',
              backgroundColor: BRAND.gray,
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            📋 Export Current
          </button>
          <button
            onClick={() => { setShowForm(true); setEditing(null); resetForm(); }}
            style={{
              padding: '10px 16px',
              backgroundColor: BRAND.green,
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px'
            }}
          >
            + Add Single
          </button>
        </div>
      </div>

      {/* Import Preview Modal */}
      {importPreview && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '8px',
            width: '900px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: BRAND.navy }}>
              📋 Import Preview - {importPreview.length} rows
            </h3>
            
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e7f3ff', borderRadius: '6px' }}>
              <strong>Valid rows:</strong> {importPreview.filter(r => r._isValid).length} | 
              <strong style={{ color: BRAND.red, marginLeft: '10px' }}>Errors:</strong> {importPreview.filter(r => !r._isValid).length}
            </div>

            <div style={{ maxHeight: '400px', overflow: 'auto', marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Row</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Status</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Activity</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Spread</th>
                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Metres</th>
                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Unit Cost</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Dates</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((row, idx) => (
                    <tr key={idx} style={{ backgroundColor: row._isValid ? 'white' : '#fff5f5', borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px' }}>{row._rowNum}</td>
                      <td style={{ padding: '8px' }}>
                        {row._isValid ? (
                          <span style={{ color: BRAND.green }}>✓</span>
                        ) : (
                          <span style={{ color: BRAND.red }} title={row._errors.join(', ')}>✗ {row._errors[0]}</span>
                        )}
                      </td>
                      <td style={{ padding: '8px' }}>{row.activity_type}</td>
                      <td style={{ padding: '8px' }}>{row.spread}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{row.planned_metres?.toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>${row.budgeted_unit_cost}</td>
                      <td style={{ padding: '8px', fontSize: '11px' }}>{row.planned_start_date} → {row.planned_end_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setImportPreview(null)}
                style={{ padding: '10px 20px', backgroundColor: BRAND.gray, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmImport(false)}
                style={{ padding: '10px 20px', backgroundColor: BRAND.green, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Add to Existing ({importPreview.filter(r => r._isValid).length} rows)
              </button>
              <button
                onClick={() => {
                  if (confirm('This will DELETE all existing baselines and replace with imported data. Continue?')) {
                    confirmImport(true)
                  }
                }}
                style={{ padding: '10px 20px', backgroundColor: BRAND.red, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Replace All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '8px',
            width: '600px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h3 style={{ margin: '0 0 20px 0', color: BRAND.navy }}>
              {editing ? 'Edit Baseline' : 'Add New Baseline'}
            </h3>
            
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={labelStyle}>Spread</label>
                  <select
                    value={formData.spread}
                    onChange={(e) => setFormData({ ...formData, spread: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="EGP Mainline">EGP Mainline (KP 0-47)</option>
                    <option value="EGP Tunnel">EGP Tunnel (KP 47-56)</option>
                    <option value="EGP Crossings">EGP Special Crossings</option>
                    <option value="EGP Facilities">EGP Facilities</option>
                    <option value="Spread 1">Spread 1</option>
                    <option value="Spread 2">Spread 2</option>
                    <option value="Spread 3">Spread 3</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Activity Type</label>
                  <select
                    value={formData.activity_type}
                    onChange={(e) => setFormData({ ...formData, activity_type: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Planned Metres</label>
                  <input
                    type="number"
                    value={formData.planned_metres}
                    onChange={(e) => setFormData({ ...formData, planned_metres: parseFloat(e.target.value) || 0 })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Budgeted Unit Cost ($/m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.budgeted_unit_cost}
                    onChange={(e) => setFormData({ ...formData, budgeted_unit_cost: parseFloat(e.target.value) || 0 })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Start KP</label>
                  <input
                    type="text"
                    value={formData.start_kp}
                    onChange={(e) => setFormData({ ...formData, start_kp: e.target.value })}
                    placeholder="e.g., 0+000"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>End KP</label>
                  <input
                    type="text"
                    value={formData.end_kp}
                    onChange={(e) => setFormData({ ...formData, end_kp: e.target.value })}
                    placeholder="e.g., 50+000"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Planned Start Date</label>
                  <input
                    type="date"
                    value={formData.planned_start_date}
                    onChange={(e) => setFormData({ ...formData, planned_start_date: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Planned End Date</label>
                  <input
                    type="date"
                    value={formData.planned_end_date}
                    onChange={(e) => setFormData({ ...formData, planned_end_date: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Labour Rate ($/hr)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.labour_rate_per_hour}
                    onChange={(e) => setFormData({ ...formData, labour_rate_per_hour: parseFloat(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Equipment Rate ($/hr)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.equipment_rate_per_hour}
                    onChange={(e) => setFormData({ ...formData, equipment_rate_per_hour: parseFloat(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ marginTop: '15px' }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  style={{ ...inputStyle, height: '80px', resize: 'vertical' }}
                  placeholder="Optional notes..."
                />
              </div>

              {/* Calculated Total */}
              <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '6px' }}>
                <strong>Budgeted Total: </strong>
                {formatCurrency(formData.planned_metres * formData.budgeted_unit_cost)}
              </div>

              <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditing(null); }}
                  style={{ padding: '10px 20px', backgroundColor: BRAND.gray, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 20px', backgroundColor: BRAND.navy, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  {editing ? 'Update' : 'Create'} Baseline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Baselines Table */}
      {loading ? (
        <p style={{ color: '#666' }}>Loading baselines...</p>
      ) : baselines.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <p style={{ color: '#666', margin: 0, fontSize: '16px' }}>No baselines configured yet.</p>
          <p style={{ color: '#999', fontSize: '13px', marginTop: '10px' }}>
            Download the template, fill it with your project plan, then import.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Activity</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Spread</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Planned (m)</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Unit Cost</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Total Budget</th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Schedule</th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {baselines.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>{b.activity_type}</td>
                  <td style={{ padding: '12px' }}>{b.spread}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{b.planned_metres?.toLocaleString()}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>${b.budgeted_unit_cost}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '500', color: BRAND.navy }}>
                    {formatCurrency(b.budgeted_total)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '12px' }}>
                    {b.planned_start_date} → {b.planned_end_date}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <button onClick={() => handleEdit(b)} style={{ padding: '5px 10px', marginRight: '5px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(b.id)} style={{ padding: '5px 10px', backgroundColor: BRAND.red, color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary */}
          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px', display: 'flex', gap: '30px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Total Baselines</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: BRAND.navy }}>{baselines.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Total Planned Metres</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: BRAND.navy }}>
                {baselines.reduce((sum, b) => sum + (b.planned_metres || 0), 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Total Budget</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: BRAND.green }}>
                {formatCurrency(baselines.reduce((sum, b) => sum + (b.budgeted_total || 0), 0))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
