import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline - Demo Project"

const CHANGE_TYPES = [
  'Scope Addition',
  'Scope Deletion', 
  'Quantity Variance',
  'Unforeseen Condition',
  'Design Revision',
  'Owner Request',
  'Regulatory Requirement',
  'Force Majeure'
]

const STATUS_OPTIONS = [
  { value: 'identified', label: 'Identified', color: '#92400e', bg: '#fef3c7' },
  { value: 'pending', label: 'Pending Approval', color: '#1e40af', bg: '#dbeafe' },
  { value: 'approved', label: 'Approved', color: '#065f46', bg: '#d1fae5' },
  { value: 'rejected', label: 'Rejected', color: '#991b1b', bg: '#fee2e2' },
  { value: 'implemented', label: 'Implemented', color: '#374151', bg: '#f3f4f6' }
]

export default function ChangeManagement() {
  const navigate = useNavigate()
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingChange, setEditingChange] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [expandedChange, setExpandedChange] = useState(null)

  const [formData, setFormData] = useState({
    change_type: '',
    activity: '',
    spread: '',
    station_from: '',
    station_to: '',
    description: '',
    reason: '',
    estimated_cost_impact: '',
    estimated_schedule_days: '',
    status: 'identified',
    supporting_docs: '',
    linked_report_date: '',
    linked_report_inspector: ''
  })

  useEffect(() => { loadChanges() }, [])

  async function loadChanges() {
    setLoading(true)
    const { data, error } = await supabase
      .from('change_orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading changes:', error)
      setChanges([])
    } else {
      setChanges(data || [])
    }
    setLoading(false)
  }

  async function saveChange() {
    const changeData = {
      ...formData,
      estimated_cost_impact: parseFloat(formData.estimated_cost_impact) || 0,
      estimated_schedule_days: parseInt(formData.estimated_schedule_days) || 0,
      updated_at: new Date().toISOString()
    }

    if (editingChange) {
      const { error } = await supabase
        .from('change_orders')
        .update(changeData)
        .eq('id', editingChange.id)

      if (error) {
        alert('Error updating change: ' + error.message)
        return
      }
    } else {
      changeData.change_id = `CO-${Date.now().toString().slice(-6)}`
      changeData.created_at = new Date().toISOString()

      const { error } = await supabase
        .from('change_orders')
        .insert([changeData])

      if (error) {
        alert('Error saving change: ' + error.message)
        return
      }
    }

    resetForm()
    loadChanges()
  }

  function resetForm() {
    setFormData({
      change_type: '',
      activity: '',
      spread: '',
      station_from: '',
      station_to: '',
      description: '',
      reason: '',
      estimated_cost_impact: '',
      estimated_schedule_days: '',
      status: 'identified',
      supporting_docs: '',
      linked_report_date: '',
      linked_report_inspector: ''
    })
    setShowForm(false)
    setEditingChange(null)
  }

  function editChange(change) {
    setFormData({
      change_type: change.change_type || '',
      activity: change.activity || '',
      spread: change.spread || '',
      station_from: change.station_from || '',
      station_to: change.station_to || '',
      description: change.description || '',
      reason: change.reason || '',
      estimated_cost_impact: change.estimated_cost_impact?.toString() || '',
      estimated_schedule_days: change.estimated_schedule_days?.toString() || '',
      status: change.status || 'identified',
      supporting_docs: change.supporting_docs || '',
      linked_report_date: change.linked_report_date || '',
      linked_report_inspector: change.linked_report_inspector || ''
    })
    setEditingChange(change)
    setShowForm(true)
  }

  async function updateStatus(change, newStatus) {
    const updateData = { 
      status: newStatus,
      updated_at: new Date().toISOString()
    }

    if (newStatus === 'approved') {
      updateData.approved_at = new Date().toISOString()
      updateData.approved_by = 'Current User'
    }

    const { error } = await supabase
      .from('change_orders')
      .update(updateData)
      .eq('id', change.id)

    if (error) {
      alert('Error updating status: ' + error.message)
      return
    }

    loadChanges()
  }

  const filteredChanges = filterStatus === 'all' 
    ? changes 
    : changes.filter(c => c.status === filterStatus)

  const stats = {
    total: changes.length,
    pending: changes.filter(c => c.status === 'pending').length,
    approved: changes.filter(c => c.status === 'approved').length,
    totalCostImpact: changes
      .filter(c => c.status === 'approved')
      .reduce((sum, c) => sum + (c.estimated_cost_impact || 0), 0),
    pendingCostExposure: changes
      .filter(c => ['identified', 'pending'].includes(c.status))
      .reduce((sum, c) => sum + (c.estimated_cost_impact || 0), 0),
    totalScheduleImpact: changes
      .filter(c => c.status === 'approved')
      .reduce((sum, c) => sum + (c.estimated_schedule_days || 0), 0)
  }

  const getStatusColor = (status) => {
    const found = STATUS_OPTIONS.find(s => s.value === status)
    return found ? found.color : '#374151'
  }

  const getStatusBg = (status) => {
    const found = STATUS_OPTIONS.find(s => s.value === status)
    return found ? found.bg : '#f3f4f6'
  }

  const getStatusLabel = (status) => {
    const found = STATUS_OPTIONS.find(s => s.value === status)
    return found ? found.label : status
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '6px'
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#6f42c1', color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>{PROJECT_NAME}</h1>
          <p style={{ fontSize: '14px', color: '#d8b4fe', margin: '4px 0 0 0' }}>Change Order Management</p>
        </div>
        <button onClick={() => navigate(-1)} style={{ backgroundColor: '#7c3aed', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
          ← Back
        </button>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px' }}>
            <p style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', margin: 0 }}>Total Changes</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#1f2937', margin: '8px 0 0 0' }}>{stats.total}</p>
          </div>
          <div style={{ backgroundColor: '#fef3c7', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px', borderLeft: '4px solid #f59e0b' }}>
            <p style={{ fontSize: '11px', color: '#92400e', textTransform: 'uppercase', margin: 0 }}>Pending Review</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#b45309', margin: '8px 0 0 0' }}>{stats.pending}</p>
          </div>
          <div style={{ backgroundColor: '#d1fae5', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px', borderLeft: '4px solid #10b981' }}>
            <p style={{ fontSize: '11px', color: '#065f46', textTransform: 'uppercase', margin: 0 }}>Approved</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#047857', margin: '8px 0 0 0' }}>{stats.approved}</p>
          </div>
          <div style={{ backgroundColor: '#fee2e2', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px', borderLeft: '4px solid #ef4444' }}>
            <p style={{ fontSize: '11px', color: '#991b1b', textTransform: 'uppercase', margin: 0 }}>Cost Exposure</p>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626', margin: '8px 0 0 0' }}>${(stats.pendingCostExposure / 1000).toFixed(0)}k</p>
            <p style={{ fontSize: '11px', color: '#6b7280', margin: '4px 0 0 0' }}>pending approval</p>
          </div>
          <div style={{ backgroundColor: '#dbeafe', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px', borderLeft: '4px solid #3b82f6' }}>
            <p style={{ fontSize: '11px', color: '#1e40af', textTransform: 'uppercase', margin: 0 }}>Approved Impact</p>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563eb', margin: '8px 0 0 0' }}>${(stats.totalCostImpact / 1000).toFixed(0)}k</p>
            <p style={{ fontSize: '11px', color: '#6b7280', margin: '4px 0 0 0' }}>+{stats.totalScheduleImpact} days</p>
          </div>
        </div>

        {/* Controls */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowForm(true)} style={{ backgroundColor: '#6f42c1', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>
            + New Change Order
          </button>
          <div style={{ flex: 1 }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>Filter:</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 12px', fontSize: '14px' }}>
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <button onClick={loadChanges} style={{ backgroundColor: '#e5e7eb', color: '#374151', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer' }}>
            🔄 Refresh
          </button>
        </div>

        {/* Change Order Form Modal */}
        {showForm && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '700px', maxWidth: '100%', maxHeight: '90vh', overflow: 'auto' }}>
              <div style={{ backgroundColor: '#6f42c1', color: 'white', padding: '16px 24px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>
                  {editingChange ? `Edit Change: ${editingChange.change_id}` : 'New Change Order'}
                </h2>
                <button onClick={resetForm} style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}>×</button>
              </div>
              
              <div style={{ padding: '24px' }}>
                {/* Row 1 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Change Type *</label>
                    <select value={formData.change_type} onChange={(e) => setFormData({...formData, change_type: e.target.value})} style={inputStyle}>
                      <option value="">Select type...</option>
                      {CHANGE_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Activity</label>
                    <input type="text" value={formData.activity} onChange={(e) => setFormData({...formData, activity: e.target.value})} placeholder="e.g., Welding - Mainline" style={inputStyle} />
                  </div>
                </div>

                {/* Row 2 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Spread</label>
                    <input type="text" value={formData.spread} onChange={(e) => setFormData({...formData, spread: e.target.value})} placeholder="e.g., Spread 1" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Station From (KP)</label>
                    <input type="text" value={formData.station_from} onChange={(e) => setFormData({...formData, station_from: e.target.value})} placeholder="e.g., 5+250" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Station To (KP)</label>
                    <input type="text" value={formData.station_to} onChange={(e) => setFormData({...formData, station_to: e.target.value})} placeholder="e.g., 5+500" style={inputStyle} />
                  </div>
                </div>

                {/* Row 3 */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Description *</label>
                  <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} rows={3} placeholder="Describe the change..." style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                {/* Row 4 */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Reason/Justification</label>
                  <textarea value={formData.reason} onChange={(e) => setFormData({...formData, reason: e.target.value})} rows={2} placeholder="Why is this change needed?" style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                {/* Row 5 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Est. Cost Impact ($)</label>
                    <input type="number" value={formData.estimated_cost_impact} onChange={(e) => setFormData({...formData, estimated_cost_impact: e.target.value})} placeholder="0" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Est. Schedule Impact (days)</label>
                    <input type="number" value={formData.estimated_schedule_days} onChange={(e) => setFormData({...formData, estimated_schedule_days: e.target.value})} placeholder="0" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} style={inputStyle}>
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 6 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Linked Report Date</label>
                    <input type="date" value={formData.linked_report_date} onChange={(e) => setFormData({...formData, linked_report_date: e.target.value})} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Reported By (Inspector)</label>
                    <input type="text" value={formData.linked_report_inspector} onChange={(e) => setFormData({...formData, linked_report_inspector: e.target.value})} placeholder="Inspector name" style={inputStyle} />
                  </div>
                </div>

                {/* Row 7 */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={labelStyle}>Supporting Documentation</label>
                  <input type="text" value={formData.supporting_docs} onChange={(e) => setFormData({...formData, supporting_docs: e.target.value})} placeholder="RFI #, Photo refs, Engineer directives..." style={inputStyle} />
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '20px' }}>
                  <button onClick={saveChange} style={{ flex: 1, backgroundColor: '#6f42c1', color: 'white', border: 'none', padding: '14px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '15px' }}>
                    {editingChange ? 'Update Change Order' : 'Create Change Order'}
                  </button>
                  <button onClick={resetForm} style={{ padding: '14px 24px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Changes Table */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#1f2937' }}>
                <th style={{ color: 'white', padding: '14px 12px', textAlign: 'left', fontWeight: '600' }}>Change ID</th>
                <th style={{ color: 'white', padding: '14px 12px', textAlign: 'left', fontWeight: '600' }}>Type</th>
                <th style={{ color: 'white', padding: '14px 12px', textAlign: 'left', fontWeight: '600' }}>Activity / Location</th>
                <th style={{ color: 'white', padding: '14px 12px', textAlign: 'left', fontWeight: '600' }}>Description</th>
                <th style={{ color: 'white', padding: '14px 12px', textAlign: 'right', fontWeight: '600' }}>Cost Impact</th>
                <th style={{ color: 'white', padding: '14px 12px', textAlign: 'center', fontWeight: '600' }}>Schedule</th>
                <th style={{ color: 'white', padding: '14px 12px', textAlign: 'center', fontWeight: '600' }}>Status</th>
                <th style={{ color: 'white', padding: '14px 12px', textAlign: 'center', fontWeight: '600' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading...</td>
                </tr>
              ) : filteredChanges.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                    {changes.length === 0 
                      ? 'No change orders yet. Click "+ New Change Order" to create one.'
                      : 'No changes match the selected filter.'}
                  </td>
                </tr>
              ) : (
                filteredChanges.map((change, i) => (
                  <>
                    <tr key={change.id} style={{ backgroundColor: i % 2 === 0 ? '#f9fafb' : 'white', borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '14px 12px', fontFamily: 'monospace', fontWeight: '600', color: '#6f42c1' }}>{change.change_id}</td>
                      <td style={{ padding: '14px 12px' }}>{change.change_type}</td>
                      <td style={{ padding: '14px 12px' }}>
                        <div style={{ fontWeight: '500' }}>{change.activity || '-'}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {change.spread} {change.station_from && `KP ${change.station_from}`}
                          {change.station_to && ` - ${change.station_to}`}
                        </div>
                      </td>
                      <td style={{ padding: '14px 12px', maxWidth: '200px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{change.description}</div>
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {change.estimated_cost_impact 
                          ? `$${change.estimated_cost_impact.toLocaleString()}`
                          : '-'}
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                        {change.estimated_schedule_days 
                          ? `+${change.estimated_schedule_days}d`
                          : '-'}
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                        <span style={{ backgroundColor: getStatusBg(change.status), color: getStatusColor(change.status), padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>
                          {getStatusLabel(change.status)}
                        </span>
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button onClick={() => setExpandedChange(expandedChange === change.id ? null : change.id)} style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>
                            {expandedChange === change.id ? 'Hide' : 'View'}
                          </button>
                          <button onClick={() => editChange(change)} style={{ color: '#6f42c1', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedChange === change.id && (
                      <tr key={`${change.id}-expanded`}>
                        <td colSpan="8" style={{ backgroundColor: '#f5f3ff', padding: '24px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div>
                              <h4 style={{ fontWeight: 'bold', color: '#374151', marginBottom: '8px', marginTop: 0 }}>Details</h4>
                              <p style={{ color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' }}>{change.description}</p>
                              
                              {change.reason && (
                                <>
                                  <h4 style={{ fontWeight: 'bold', color: '#374151', marginBottom: '8px' }}>Reason/Justification</h4>
                                  <p style={{ color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' }}>{change.reason}</p>
                                </>
                              )}

                              {change.supporting_docs && (
                                <>
                                  <h4 style={{ fontWeight: 'bold', color: '#374151', marginBottom: '8px' }}>Supporting Docs</h4>
                                  <p style={{ color: '#6b7280' }}>{change.supporting_docs}</p>
                                </>
                              )}
                            </div>
                            <div>
                              <h4 style={{ fontWeight: 'bold', color: '#374151', marginBottom: '8px', marginTop: 0 }}>Workflow</h4>
                              <div style={{ fontSize: '13px' }}>
                                <p style={{ margin: '4px 0' }}><span style={{ color: '#6b7280' }}>Created:</span> {new Date(change.created_at).toLocaleString()}</p>
                                {change.linked_report_date && (
                                  <p style={{ margin: '4px 0' }}><span style={{ color: '#6b7280' }}>From Report:</span> {change.linked_report_date} ({change.linked_report_inspector})</p>
                                )}
                                {change.approved_at && (
                                  <p style={{ margin: '4px 0' }}><span style={{ color: '#6b7280' }}>Approved:</span> {new Date(change.approved_at).toLocaleString()} by {change.approved_by}</p>
                                )}
                              </div>

                              {change.status !== 'implemented' && (
                                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                                  <h4 style={{ fontWeight: 'bold', color: '#374151', marginBottom: '12px' }}>Update Status</h4>
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {change.status === 'identified' && (
                                      <button onClick={() => updateStatus(change, 'pending')} style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                                        Submit for Approval
                                      </button>
                                    )}
                                    {change.status === 'pending' && (
                                      <>
                                        <button onClick={() => updateStatus(change, 'approved')} style={{ backgroundColor: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                                          ✓ Approve
                                        </button>
                                        <button onClick={() => updateStatus(change, 'rejected')} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                                          ✗ Reject
                                        </button>
                                      </>
                                    )}
                                    {change.status === 'approved' && (
                                      <button onClick={() => updateStatus(change, 'implemented')} style={{ backgroundColor: '#6b7280', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                                        Mark Implemented
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '24px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
          <p style={{ margin: '4px 0' }}>Change orders are tracked from identification through implementation.</p>
          <p style={{ margin: '4px 0' }}>Approved changes update the project budget and schedule baseline.</p>
        </div>
      </div>
    </div>
  )
}
