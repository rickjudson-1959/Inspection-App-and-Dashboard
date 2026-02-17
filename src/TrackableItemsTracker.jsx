// TrackableItemsTracker.jsx
// Unified tracking for mats, fencing, ramps, goal posts, access roads, hydrovac, erosion control, signage
// Each category is collapsible with add/remove/save functionality

import React, { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { useOrgQuery } from './utils/queryHelpers.js'

// Define all trackable item types with their fields
const ITEM_TYPES = [
  { 
    id: 'mats', 
    label: '🛤️ Mats', 
    color: '#007bff',
    fields: [
      { name: 'mat_type', label: 'Mat Type', type: 'select', options: ['Rig Mat', 'Swamp Mat', 'Access Mat', 'Crane Mat', 'Other'] },
      { name: 'mat_size', label: 'Size', type: 'select', options: ['8x14', '8x16', '4x8', '8x40', 'Other'] },
      { name: 'action', label: 'Action', type: 'select', options: ['Deploy', 'Retrieve', 'Relocate', 'Inspect'] },
      { name: 'quantity', label: 'Quantity', type: 'number' },
      { name: 'from_kp', label: 'From KP', type: 'text', placeholder: '0+000' },
      { name: 'to_kp', label: 'To KP', type: 'text', placeholder: '0+500' },
      { name: 'crossing_reason', label: 'Crossing/Reason', type: 'text', placeholder: 'e.g., FL-001, wet area' },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Additional details...' }
    ]
  },
  { 
    id: 'rock_trench', 
    label: '🪨 Rock Trench', 
    color: '#6c757d',
    fields: [
      { name: 'from_kp', label: 'From KP', type: 'text', placeholder: '0+000' },
      { name: 'to_kp', label: 'To KP', type: 'text', placeholder: '0+500' },
      { name: 'length', label: 'Length (m)', type: 'number', placeholder: 'Auto or manual' },
      { name: 'rock_type', label: 'Rock Type', type: 'select', options: ['Solid Rock', 'Fractured Rock', 'Boulders', 'Bedrock', 'Shale', 'Other'] },
      { name: 'equipment', label: 'Equipment Used', type: 'select', options: ['Rock Trencher', 'Hydraulic Breaker', 'Blasting', 'Excavator w/ Ripper', 'Other'] },
      { name: 'depth_achieved', label: 'Depth Achieved (m)', type: 'number', placeholder: 'Actual depth' },
      { name: 'spec_depth', label: 'Spec Depth (m)', type: 'number', placeholder: 'Required depth' },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Production rate, challenges, etc.' }
    ]
  },
  {
    id: 'extra_depth',
    label: '📐 Extra Depth Ditch',
    color: '#856404',
    fields: [
      { name: 'from_kp', label: 'From KP', type: 'text', placeholder: '0+000' },
      { name: 'to_kp', label: 'To KP', type: 'text', placeholder: '0+500' },
      { name: 'length', label: 'Length (m)', type: 'number', placeholder: 'Auto or manual' },
      { name: 'extra_depth_amount', label: 'Extra Depth (m)', type: 'number', placeholder: 'Additional depth beyond spec' },
      { name: 'total_depth', label: 'Total Depth (m)', type: 'number', placeholder: 'Total achieved depth' },
      { name: 'reason', label: 'Reason', type: 'select', options: ['Crossing Requirements', 'Utility Clearance', 'Engineering Request', 'Soil Conditions', 'Other'] },
      { name: 'in_drawings', label: 'In Drawings?', type: 'select', options: ['Yes - Per Drawings', 'No - Field Decision'] },
      { name: 'approved_by', label: 'Approved By', type: 'text', placeholder: 'Name/Role if field decision' },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Additional details...' }
    ]
  },
  {
    id: 'bedding_padding',
    label: '🛏️ Bedding & Padding',
    color: '#8B4513',
    fields: [
      { name: 'protection_type', label: 'Protection Type', type: 'select', options: ['Bedding', 'Padding', 'Bedding and Padding', 'Pipe Protection', 'Rockshield', 'Lagging', 'Rockshield and Lagging'] },
      { name: 'from_kp', label: 'From KP', type: 'text', placeholder: '0+000' },
      { name: 'to_kp', label: 'To KP', type: 'text', placeholder: '0+500' },
      { name: 'length', label: 'Length (m)', type: 'number', placeholder: 'Auto or manual' },
      { name: 'material', label: 'Material', type: 'select', options: ['Sand', 'Screened Material', 'Imported Fill', 'Native Screened', 'Foam', 'Geotextile', 'Other'] },
      { name: 'depth', label: 'Depth/Thickness (mm)', type: 'number', placeholder: 'e.g., 150' },
      { name: 'action', label: 'Action', type: 'select', options: ['Install', 'Inspect', 'Repair'] },
      { name: 'equipment', label: 'Equipment Used', type: 'text', placeholder: 'e.g., Padding machine, excavator' },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Additional details...' }
    ]
  },
  { 
    id: 'fencing', 
    label: '🚧 Temporary Fencing', 
    color: '#28a745',
    fields: [
      { name: 'fence_type', label: 'Fence Type', type: 'select', options: ['Construction Fence', 'Wildlife Fence', 'Cross Fencing', 'Silt Fence', 'Snow Fence', 'Other'] },
      { name: 'action', label: 'Action', type: 'select', options: ['Install', 'Remove', 'Relocate', 'Repair'] },
      { name: 'length', label: 'Length (m)', type: 'number' },
      { name: 'gates_qty', label: 'Gates', type: 'number', placeholder: '0' },
      { name: 'from_kp', label: 'From KP', type: 'text', placeholder: '0+000' },
      { name: 'to_kp', label: 'To KP', type: 'text', placeholder: '0+500' },
      { name: 'landowner', label: 'Landowner', type: 'text', placeholder: 'If applicable' },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Additional details...' }
    ]
  },
  { 
    id: 'ramps', 
    label: '🛤️ Ramps', 
    color: '#fd7e14',
    fields: [
      { name: 'ramp_type', label: 'Ramp Type', type: 'select', options: ['Foreign Line Ramp', 'Road Crossing Ramp', 'Access Ramp', 'Equipment Ramp', 'Other'] },
      { name: 'ramp_material', label: 'Material', type: 'select', options: ['Timber', 'Steel Plate', 'Matted', 'Earth', 'Combination'] },
      { name: 'action', label: 'Action', type: 'select', options: ['Install', 'Remove', 'Relocate'] },
      { name: 'quantity', label: 'Quantity', type: 'number' },
      { name: 'kp_location', label: 'KP Location', type: 'text', placeholder: '0+500' },
      { name: 'foreign_owner', label: 'Foreign Line Owner', type: 'text', placeholder: 'e.g., ATCO, CNRL' },
      { name: 'crossing_id', label: 'Crossing ID', type: 'text', placeholder: 'e.g., FL-001' },
      { name: 'mats_used', label: 'Mats Used?', type: 'select', options: ['Yes - Log in Mats section', 'No'] },
      { name: 'mat_count', label: 'Mat Count (if used)', type: 'number', placeholder: '0' },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Additional details...' }
    ]
  },
  { 
    id: 'goalposts', 
    label: '⚡ Goal Posts (Power Lines)', 
    color: '#dc3545',
    fields: [
      { name: 'action', label: 'Action', type: 'select', options: ['Install', 'Remove', 'Inspect', 'Relocate'] },
      { name: 'quantity', label: 'Quantity (sets)', type: 'number' },
      { name: 'kp_location', label: 'KP Location', type: 'text', placeholder: '2+450' },
      { name: 'utility_owner', label: 'Utility Owner', type: 'text', placeholder: 'e.g., BC Hydro, FortisBC' },
      { name: 'post_material', label: 'Post Material', type: 'select', options: ['GRP/Fiberglass (Non-Conductive)', 'Wood (Non-Conductive)', 'Steel/Metal (CONDUCTIVE - FLAG)'] },
      { name: 'material_compliant', label: '⚡ Non-Conductive?', type: 'select', options: ['Pass', 'Fail - CONDUCTIVE'] },
      { name: 'authorized_clearance', label: 'Utility Auth. Clearance (m)', type: 'number', placeholder: 'e.g., 7.5' },
      { name: 'posted_height', label: 'Posted Height (m)', type: 'number', placeholder: 'e.g., 8.0' },
      { name: 'danger_sign', label: 'Danger Sign Posted?', type: 'select', options: ['Yes', 'No'] },
      { name: 'reflective_signage', label: 'Reflective Signage?', type: 'select', options: ['Yes', 'No'] },
      { name: 'grounding_required', label: 'Grounding Required?', type: 'select', options: ['Yes', 'No', 'N/A'] },
      { name: 'grounding_installed', label: 'Grounding Installed?', type: 'select', options: ['Yes', 'No', 'N/A'] },
      { name: 'offset_distance', label: 'Offset from CL (m)', type: 'number', placeholder: '≥6m required' },
      { name: 'offset_compliant', label: '≥6m Offset?', type: 'select', options: ['Pass', 'Fail - TOO CLOSE'] },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Additional details...' }
    ]
  },
  { 
    id: 'access', 
    label: '🚜 Access Roads', 
    color: '#6f42c1',
    fields: [
      { name: 'access_type', label: 'Access Type', type: 'select', options: ['Temporary Access', 'Permanent Access', 'Existing Access', 'Field Access'] },
      { name: 'action', label: 'Action', type: 'select', options: ['Build', 'Improve', 'Maintain', 'Reclaim'] },
      { name: 'length', label: 'Length (m)', type: 'number' },
      { name: 'width', label: 'Width (m)', type: 'number' },
      { name: 'from_kp', label: 'From KP', type: 'text', placeholder: '0+000' },
      { name: 'to_kp', label: 'To KP', type: 'text', placeholder: '0+500' },
      { name: 'surface', label: 'Surface', type: 'select', options: ['Gravel', 'Earth', 'Matted', 'Paved'] },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Additional details...' }
    ]
  },
  { 
    id: 'hydrovac', 
    label: '🚿 Hydrovac Holes', 
    color: '#17a2b8',
    fields: [
      { name: 'hole_type', label: 'Hole Type', type: 'select', options: ['Pothole', 'Slot Trench', 'Utility Locate', 'Tie-in Excavation', 'Other'] },
      { name: 'action', label: 'Action', type: 'select', options: ['Dig', 'Backfill', 'Inspect'] },
      { name: 'quantity', label: 'Quantity', type: 'number' },
      { name: 'kp_location', label: 'KP Location', type: 'text', placeholder: '0+500' },
      { name: 'depth', label: 'Depth (m)', type: 'number', placeholder: 'e.g., 2.5' },
      { name: 'foreign_owner', label: 'Foreign Line Owner', type: 'text', placeholder: 'If exposing foreign line' },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Additional details...' }
    ]
  },
  { 
    id: 'erosion', 
    label: '🌊 Erosion Control', 
    color: '#20c997',
    fields: [
      { name: 'control_type', label: 'Control Type', type: 'select', options: ['Silt Fence', 'Straw Bales', 'Sediment Pond', 'Check Dam', 'Erosion Blanket', 'Rip Rap', 'Other'] },
      { name: 'action', label: 'Action', type: 'select', options: ['Install', 'Remove', 'Maintain', 'Inspect'] },
      { name: 'quantity', label: 'Quantity/Length', type: 'number' },
      { name: 'unit', label: 'Unit', type: 'select', options: ['metres', 'each', 'sq metres'] },
      { name: 'from_kp', label: 'From KP', type: 'text', placeholder: '0+000' },
      { name: 'to_kp', label: 'To KP', type: 'text', placeholder: '0+500' },
      { name: 'watercourse', label: 'Watercourse Name', type: 'text', placeholder: 'If applicable' },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Additional details...' }
    ]
  },
  { 
    id: 'signage', 
    label: '🚧 Signage & Flagging', 
    color: '#e83e8c',
    fields: [
      { name: 'sign_type', label: 'Type', type: 'select', options: ['Pipeline Marker', 'Warning Sign', 'Speed Limit', 'Boundary Flag', 'Hazard Flag', 'Environmental Flag', 'Other'] },
      { name: 'action', label: 'Action', type: 'select', options: ['Install', 'Remove', 'Replace'] },
      { name: 'quantity', label: 'Quantity', type: 'number' },
      { name: 'kp_location', label: 'KP Location', type: 'text', placeholder: '0+500' },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Additional details...' }
    ]
  },
  { 
    id: 'equipment_cleaning', 
    label: '🧹 Equipment Cleaning', 
    color: '#6c757d',
    fields: [
      { name: 'equipment_type', label: 'Equipment Type', type: 'text', placeholder: 'e.g., Excavator, Sideboom' },
      { name: 'equipment_id', label: 'Equipment ID/Unit #', type: 'text', placeholder: 'e.g., EX-101' },
      { name: 'contractor', label: 'Contractor', type: 'text', placeholder: 'e.g., Spiecapag' },
      { name: 'action', label: 'Action', type: 'select', options: ['Arrived to ROW Cleaned', 'Clean - Enter ROW', 'Clean - Exit ROW', 'Inspect Only'] },
      { name: 'quantity', label: 'Quantity', type: 'number' },
      { name: 'cleaning_type', label: 'Cleaning Type', type: 'select', options: ['Full Wash (Vac Truck Dispose)', 'Air Cleaning Station', 'Mechanical Cleaning Station', 'Pressure Wash', 'Steam Clean', 'Arrived Clean - Inspection Only'] },
      { name: 'cleaning_location', label: 'Cleaning Location', type: 'select', options: ['Laydown Yard', 'ROW Cleaning Station', 'Off-Site (Arrived Clean)', 'Mobile Unit on ROW'] },
      { name: 'kp_location', label: 'Cleaning Station KP', type: 'text', placeholder: 'If on ROW, e.g., 5+200' },
      { name: 'inspection_pass', label: 'Inspection Status', type: 'select', options: ['Pass - Approved for Work', 'Fail - Re-clean Required', 'Fail - Rejected from Site', 'Pending Inspection'] },
      { name: 'inspector_name', label: 'Inspected By', type: 'text', placeholder: 'Environmental Inspector name' },
      { name: 'biosecurity_concerns', label: 'Biosecurity Concerns', type: 'select', options: ['None', 'Soil/Mud Present', 'Vegetation/Seeds Present', 'Invasive Species Risk', 'Multiple Concerns'] },
      { name: 'weed_wash_cert', label: 'Weed Wash Certificate', type: 'select', options: ['Yes - On File', 'Yes - Issued Today', 'No - Not Required', 'No - Required but Missing'] },
      { name: 'photo_taken', label: 'Photo Taken', type: 'select', options: ['Yes - Before', 'Yes - After', 'Yes - Both', 'No'] },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Additional details...' }
    ]
  },
  {
    id: 'weld_upi',
    label: '⚙️ Weld UPI Items',
    color: '#ff6b35',
    fields: [
      { name: 'upi_type', label: 'UPI Type', type: 'select', options: ['Cut Out', 'Repair', 'Rework', 'NDT Fail Repair', 'Other'] },
      { name: 'weld_number', label: 'Weld Number(s)', type: 'text', placeholder: 'e.g., W-001' },
      { name: 'from_kp', label: 'From KP', type: 'text', placeholder: '0+000' },
      { name: 'to_kp', label: 'To KP', type: 'text', placeholder: '0+500' },
      { name: 'quantity', label: 'Quantity', type: 'number' },
      { name: 'reason', label: 'Reason', type: 'select', options: ['N/A', 'NDT Failure', 'CAP Failure', 'Visual Defect', 'Inspector Request', 'Other'] },
      { name: 'status', label: 'Status', type: 'select', options: ['Completed - Passed', 'In Progress', 'Pending Re-test'] },
      { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Details...' }
    ]
  }
]

function TrackableItemsTracker({ projectId, reportDate, reportId, inspector, onDataChange }) {
  const [items, setItems] = useState([])
  const itemsRef = useRef(items)
  const [expandedTypes, setExpandedTypes] = useState({})
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({})

  // Keep ref in sync so saveItem always has latest data
  useEffect(() => { itemsRef.current = items }, [items])

  // Multi-tenant support
  const { addOrgFilter, getOrgId } = useOrgQuery()

  // Load existing items for this report
  useEffect(() => {
    loadItems()
  }, [reportId, reportDate])

  const loadItems = async () => {
    setLoading(true)
    try {
      if (reportId) {
        let query = supabase
          .from('trackable_items')
          .select('*')
          .eq('report_id', reportId)
          .order('created_at', { ascending: true })
        query = addOrgFilter(query)
        const { data } = await query

        if (data) {
          setItems(data)
          if (onDataChange) onDataChange(data)
        }
      }

      // Calculate summary totals for each type
      let summaryQuery = supabase
        .from('trackable_items')
        .select('item_type, action, quantity')
        .eq('project_id', projectId || 'default')
      summaryQuery = addOrgFilter(summaryQuery)
      const { data: allItems } = await summaryQuery

      if (allItems) {
        const calc = {}
        ITEM_TYPES.forEach(type => {
          calc[type.id] = { deployed: 0, retrieved: 0, net: 0 }
        })
        allItems.forEach(item => {
          if (calc[item.item_type]) {
            const qty = parseFloat(item.quantity) || 0
            if (['Deploy', 'Install', 'Build', 'Dig'].includes(item.action)) {
              calc[item.item_type].deployed += qty
            } else if (['Retrieve', 'Remove', 'Backfill', 'Reclaim'].includes(item.action)) {
              calc[item.item_type].retrieved += qty
            }
            calc[item.item_type].net = calc[item.item_type].deployed - calc[item.item_type].retrieved
          }
        })
        setSummary(calc)
      }
    } catch (err) {
      console.error('Error loading trackable items:', err)
    }
    setLoading(false)
  }

  const toggleType = (typeId) => {
    setExpandedTypes(prev => ({ ...prev, [typeId]: !prev[typeId] }))
  }

  const addItem = (typeId) => {
    const type = ITEM_TYPES.find(t => t.id === typeId)
    const newItem = {
      id: `temp-${Date.now()}`,
      item_type: typeId,
      isNew: true
    }
    // Initialize fields with empty values
    type.fields.forEach(f => {
      newItem[f.name] = ''
    })
    setItems([...items, newItem])
    // Auto-expand when adding
    setExpandedTypes(prev => ({ ...prev, [typeId]: true }))
  }

  const updateItem = (itemId, field, value) => {
    const updated = items.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    )
    setItems(updated)
    if (onDataChange) onDataChange(updated)
  }

  const removeItem = async (itemId) => {
    const item = items.find(i => i.id === itemId)
    if (item && !item.id.toString().startsWith('temp-')) {
      try {
        await supabase.from('trackable_items').delete().eq('id', itemId)
      } catch (err) {
        console.error('Error deleting item:', err)
      }
    }
    setItems(items.filter(i => i.id !== itemId))
  }

  const saveItem = async (itemId) => {
    const item = itemsRef.current.find(i => i.id === itemId)
    if (!item) return

    const record = {
      project_id: projectId || 'default',
      report_id: reportId,
      report_date: reportDate,
      inspector: inspector,
      item_type: item.item_type,
      action: item.action,
      quantity: item.quantity,
      from_kp: item.from_kp,
      to_kp: item.to_kp,
      kp_location: item.kp_location,
      mat_type: item.mat_type,
      mat_size: item.mat_size,
      fence_type: item.fence_type,
      ramp_type: item.ramp_type,
      gates_qty: item.gates_qty,
      landowner: item.landowner,
      notes: item.notes,
      organization_id: getOrgId()
    }

    try {
      if (item.id.toString().startsWith('temp-')) {
        const { data } = await supabase.from('trackable_items').insert(record).select()
        if (data && data[0]) {
          const updated = items.map(i => 
            i.id === itemId ? { ...data[0], isNew: false } : i
          )
          setItems(updated)
        }
      } else {
        await supabase.from('trackable_items').update(record).eq('id', item.id)
      }
      loadItems() // Refresh summary
    } catch (err) {
      console.error('Error saving item:', err)
      alert('Error saving item')
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
    marginBottom: '3px', 
    color: '#555' 
  }

  // Get items for a specific type
  const getItemsForType = (typeId) => items.filter(i => i.item_type === typeId)

  // Count today's items for a type
  const getTodayCount = (typeId) => {
    return items.filter(i => i.item_type === typeId).length
  }

  return (
    <div>
      {loading && <p style={{ textAlign: 'center', color: '#666' }}>Loading trackable items...</p>}
      
      {ITEM_TYPES.map(type => {
        const typeItems = getItemsForType(type.id)
        const isExpanded = expandedTypes[type.id]
        const typeSummary = summary[type.id] || { net: 0, deployed: 0, retrieved: 0 }
        const todayCount = getTodayCount(type.id)

        return (
          <div 
            key={type.id}
            style={{ 
              marginBottom: '10px', 
              border: `2px solid ${type.color}`, 
              borderRadius: '8px', 
              overflow: 'hidden' 
            }}
          >
            {/* Type Header - Collapsible */}
            <div
              onClick={() => toggleType(type.id)}
              style={{
                padding: '12px 15px',
                backgroundColor: isExpanded ? type.color : '#f8f9fa',
                color: isExpanded ? 'white' : type.color,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 'bold'
              }}
            >
              <span>
                {type.label}
                {todayCount > 0 && (
                  <span style={{ 
                    marginLeft: '10px', 
                    backgroundColor: isExpanded ? 'rgba(255,255,255,0.3)' : type.color,
                    color: isExpanded ? 'white' : 'white',
                    padding: '2px 8px', 
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}>
                    {todayCount} today
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontSize: '12px', opacity: 0.9 }}>
                  Net: {typeSummary.net || 0}
                </span>
                <span>{isExpanded ? '▼' : '▶'}</span>
              </span>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div style={{ padding: '15px', backgroundColor: '#fafafa' }}>
                {/* Add Button */}
                <button
                  onClick={(e) => { e.stopPropagation(); addItem(type.id); }}
                  style={{
                    padding: '8px 15px',
                    backgroundColor: type.color,
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginBottom: '15px',
                    fontSize: '13px'
                  }}
                >
                  + Add {type.label.replace(/[^\w\s]/g, '').trim()}
                </button>

                {/* Items List */}
                {typeItems.length === 0 ? (
                  <p style={{ color: '#999', fontStyle: 'italic', margin: '10px 0' }}>
                    No {type.label.replace(/[^\w\s]/g, '').trim().toLowerCase()} logged today
                  </p>
                ) : (
                  typeItems.map((item, idx) => (
                    <div 
                      key={item.id}
                      style={{
                        backgroundColor: 'white',
                        border: '1px solid #dee2e6',
                        borderRadius: '6px',
                        padding: '15px',
                        marginBottom: '10px'
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '10px',
                        borderBottom: '1px solid #eee',
                        paddingBottom: '8px'
                      }}>
                        <span style={{ fontWeight: 'bold', color: type.color }}>
                          Entry #{idx + 1}
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => removeItem(item.id)}
                            style={{
                              padding: '4px 12px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            🗑️ Remove
                          </button>
                        </div>
                      </div>

                      {/* Fields Grid */}
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
                        gap: '12px' 
                      }}>
                        {type.fields.map(field => (
                          <div key={field.name}>
                            <label style={labelStyle}>{field.label}</label>
                            {field.type === 'select' ? (
                              <select
                                value={item[field.name] || ''}
                                onChange={(e) => updateItem(item.id, field.name, e.target.value)}
                                onBlur={() => saveItem(item.id)}
                                style={inputStyle}
                              >
                                <option value="">Select...</option>
                                {field.options.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={field.type}
                                value={item[field.name] || ''}
                                onChange={(e) => updateItem(item.id, field.name, e.target.value)}
                                onBlur={() => saveItem(item.id)}
                                placeholder={field.placeholder || ''}
                                style={inputStyle}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}

                {/* Summary Footer */}
                {typeSummary && (typeSummary.deployed > 0 || typeSummary.retrieved > 0) && (
                  <div style={{
                    marginTop: '10px',
                    padding: '10px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '4px',
                    fontSize: '12px',
                    display: 'flex',
                    justifyContent: 'space-around'
                  }}>
                    <span>📤 Deployed: <strong>{typeSummary.deployed}</strong></span>
                    <span>📥 Retrieved: <strong>{typeSummary.retrieved}</strong></span>
                    <span>📊 Net: <strong style={{ color: typeSummary.net > 0 ? '#28a745' : '#dc3545' }}>{typeSummary.net}</strong></span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default TrackableItemsTracker
