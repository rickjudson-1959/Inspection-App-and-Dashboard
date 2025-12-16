import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline - Demo Project"

// Change types based on pipeline construction
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
  { value: 'identified', label: 'Identified', color: '#ffc107' },
  { value: 'pending', label: 'Pending Approval', color: '#17a2b8' },
  { value: 'approved', label: 'Approved', color: '#28a745' },
  { value: 'rejected', label: 'Rejected', color: '#dc3545' },
  { value: 'implemented', label: 'Implemented', color: '#6c757d' }
]

export default function ChangeManagement() {
  const navigate = useNavigate()
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingChange, setEditingChange] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [expandedChange, setExpandedChange] = useState(null)

  // Form state
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

  useEffect(() => {
    loadChanges()
  }, [])

  async function loadChanges() {
    setLoading(true)
    
    const { data, error } = await supabase
      .from('change_orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading changes:', error)
      // If table doesn't exist, show empty state
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
      // Update existing
      const { error } = await supabase
        .from('change_orders')
        .update(changeData)
        .eq('id', editingChange.id)

      if (error) {
        alert('Error updating change: ' + error.message)
        return
      }
    } else {
      // Create new
      changeData.change_id = `CO-${Date.now().toString().slice(-6)}`
      changeData.created_at = new Date().toISOString()

      const { error } = await supabase
        .from('change_orders')
        .insert([changeData])

      if (error) {
        if (error.message.includes('does not exist')) {
          alert('Change Orders table not found. Please create it in Supabase first. See console for schema.')
          console.log(`
CREATE TABLE change_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  change_id TEXT UNIQUE,
  change_type TEXT,
  activity TEXT,
  spread TEXT,
  station_from TEXT,
  station_to TEXT,
  description TEXT,
  reason TEXT,
  estimated_cost_impact DECIMAL,
  estimated_schedule_days INTEGER,
  status TEXT DEFAULT 'identified',
  supporting_docs TEXT,
  linked_report_date DATE,
  linked_report_inspector TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT
);
          `)
        } else {
          alert('Error saving change: ' + error.message)
        }
        return
      }
    }

    // Reset form and reload
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
      updateData.approved_by = 'Current User' // Replace with actual user
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

  // Filter changes
  const filteredChanges = filterStatus === 'all' 
    ? changes 
    : changes.filter(c => c.status === filterStatus)

  // Calculate summary stats
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
    return found ? found.color : '#6c757d'
  }

  const getStatusLabel = (status) => {
    const found = STATUS_OPTIONS.find(s => s.value === status)
    return found ? found.label : status
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-purple-900 text-white py-6 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{PROJECT_NAME}</h1>
            <p className="text-purple-200">Change Management</p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="bg-purple-700 hover:bg-purple-600 px-4 py-2 rounded-lg transition"
          >
            ← Back
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-5">
            <p className="text-sm text-gray-500 uppercase">Total Changes</p>
            <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow p-5 border-l-4 border-yellow-500">
            <p className="text-sm text-yellow-700 uppercase">Pending Review</p>
            <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-5 border-l-4 border-green-500">
            <p className="text-sm text-green-700 uppercase">Approved</p>
            <p className="text-3xl font-bold text-green-600">{stats.approved}</p>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-5 border-l-4 border-red-500">
            <p className="text-sm text-red-700 uppercase">Cost Exposure</p>
            <p className="text-2xl font-bold text-red-600">${(stats.pendingCostExposure / 1000).toFixed(0)}k</p>
            <p className="text-xs text-gray-500">pending approval</p>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-5 border-l-4 border-blue-500">
            <p className="text-sm text-blue-700 uppercase">Approved Impact</p>
            <p className="text-2xl font-bold text-blue-600">${(stats.totalCostImpact / 1000).toFixed(0)}k</p>
            <p className="text-xs text-gray-500">+{stats.totalScheduleImpact} days</p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex items-center gap-4 flex-wrap">
          <button
            onClick={() => setShowForm(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium"
          >
            + New Change Order
          </button>
          
          <div className="flex-1"></div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Filter:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border rounded-lg px-3 py-2"
            >
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={loadChanges}
            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Change Order Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="bg-purple-900 text-white p-4 rounded-t-lg flex justify-between items-center">
                <h2 className="text-xl font-bold">
                  {editingChange ? `Edit Change: ${editingChange.change_id}` : 'New Change Order'}
                </h2>
                <button onClick={resetForm} className="text-2xl hover:text-purple-200">&times;</button>
              </div>
              
              <div className="p-6 space-y-4">
                {/* Row 1: Type and Activity */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Change Type *</label>
                    <select
                      value={formData.change_type}
                      onChange={(e) => setFormData({...formData, change_type: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      <option value="">Select type...</option>
                      {CHANGE_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Activity</label>
                    <input
                      type="text"
                      value={formData.activity}
                      onChange={(e) => setFormData({...formData, activity: e.target.value})}
                      placeholder="e.g., Welding - Mainline"
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                </div>

                {/* Row 2: Location */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Spread</label>
                    <input
                      type="text"
                      value={formData.spread}
                      onChange={(e) => setFormData({...formData, spread: e.target.value})}
                      placeholder="e.g., Spread 1"
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Station From (KP)</label>
                    <input
                      type="text"
                      value={formData.station_from}
                      onChange={(e) => setFormData({...formData, station_from: e.target.value})}
                      placeholder="e.g., 5+250"
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Station To (KP)</label>
                    <input
                      type="text"
                      value={formData.station_to}
                      onChange={(e) => setFormData({...formData, station_to: e.target.value})}
                      placeholder="e.g., 5+500"
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                </div>

                {/* Row 3: Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    rows={3}
                    placeholder="Describe the change..."
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                {/* Row 4: Reason */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason/Justification</label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                    rows={2}
                    placeholder="Why is this change needed?"
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                {/* Row 5: Impacts */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Est. Cost Impact ($)</label>
                    <input
                      type="number"
                      value={formData.estimated_cost_impact}
                      onChange={(e) => setFormData({...formData, estimated_cost_impact: e.target.value})}
                      placeholder="0"
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Est. Schedule Impact (days)</label>
                    <input
                      type="number"
                      value={formData.estimated_schedule_days}
                      onChange={(e) => setFormData({...formData, estimated_schedule_days: e.target.value})}
                      placeholder="0"
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 6: Linked Report */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Linked Report Date</label>
                    <input
                      type="date"
                      value={formData.linked_report_date}
                      onChange={(e) => setFormData({...formData, linked_report_date: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reported By (Inspector)</label>
                    <input
                      type="text"
                      value={formData.linked_report_inspector}
                      onChange={(e) => setFormData({...formData, linked_report_inspector: e.target.value})}
                      placeholder="Inspector name"
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                </div>

                {/* Row 7: Supporting Docs */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supporting Documentation</label>
                  <input
                    type="text"
                    value={formData.supporting_docs}
                    onChange={(e) => setFormData({...formData, supporting_docs: e.target.value})}
                    placeholder="RFI #, Photo refs, Engineer directives..."
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-4 pt-4 border-t">
                  <button
                    onClick={saveChange}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-medium"
                  >
                    {editingChange ? 'Update Change Order' : 'Create Change Order'}
                  </button>
                  <button
                    onClick={resetForm}
                    className="px-6 bg-gray-200 hover:bg-gray-300 py-3 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Changes Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="p-4 text-left">Change ID</th>
                <th className="p-4 text-left">Type</th>
                <th className="p-4 text-left">Activity / Location</th>
                <th className="p-4 text-left">Description</th>
                <th className="p-4 text-right">Cost Impact</th>
                <th className="p-4 text-center">Schedule</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : filteredChanges.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-500">
                    {changes.length === 0 
                      ? 'No change orders yet. Click "+ New Change Order" to create one.'
                      : 'No changes match the selected filter.'}
                  </td>
                </tr>
              ) : (
                filteredChanges.map((change, i) => (
                  <>
                    <tr 
                      key={change.id} 
                      className={`border-b hover:bg-gray-50 ${i % 2 === 0 ? 'bg-gray-50' : ''}`}
                    >
                      <td className="p-4 font-mono font-medium text-purple-700">{change.change_id}</td>
                      <td className="p-4">{change.change_type}</td>
                      <td className="p-4">
                        <div className="font-medium">{change.activity || '-'}</div>
                        <div className="text-sm text-gray-500">
                          {change.spread} {change.station_from && `KP ${change.station_from}`}
                          {change.station_to && ` - ${change.station_to}`}
                        </div>
                      </td>
                      <td className="p-4 max-w-xs">
                        <div className="truncate">{change.description}</div>
                      </td>
                      <td className="p-4 text-right font-mono">
                        {change.estimated_cost_impact 
                          ? `$${change.estimated_cost_impact.toLocaleString()}`
                          : '-'}
                      </td>
                      <td className="p-4 text-center">
                        {change.estimated_schedule_days 
                          ? `+${change.estimated_schedule_days}d`
                          : '-'}
                      </td>
                      <td className="p-4 text-center">
                        <span 
                          className="px-3 py-1 rounded-full text-white text-sm font-medium"
                          style={{ backgroundColor: getStatusColor(change.status) }}
                        >
                          {getStatusLabel(change.status)}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => setExpandedChange(expandedChange === change.id ? null : change.id)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            {expandedChange === change.id ? 'Hide' : 'View'}
                          </button>
                          <button
                            onClick={() => editChange(change)}
                            className="text-purple-600 hover:text-purple-800 text-sm"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedChange === change.id && (
                      <tr key={`${change.id}-expanded`}>
                        <td colSpan="8" className="bg-purple-50 p-6">
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <h4 className="font-bold text-gray-700 mb-2">Details</h4>
                              <p className="text-gray-600 mb-4">{change.description}</p>
                              
                              {change.reason && (
                                <>
                                  <h4 className="font-bold text-gray-700 mb-2">Reason/Justification</h4>
                                  <p className="text-gray-600 mb-4">{change.reason}</p>
                                </>
                              )}

                              {change.supporting_docs && (
                                <>
                                  <h4 className="font-bold text-gray-700 mb-2">Supporting Docs</h4>
                                  <p className="text-gray-600">{change.supporting_docs}</p>
                                </>
                              )}
                            </div>
                            <div>
                              <h4 className="font-bold text-gray-700 mb-2">Workflow</h4>
                              <div className="space-y-2 text-sm">
                                <p><span className="text-gray-500">Created:</span> {new Date(change.created_at).toLocaleString()}</p>
                                {change.linked_report_date && (
                                  <p><span className="text-gray-500">From Report:</span> {change.linked_report_date} ({change.linked_report_inspector})</p>
                                )}
                                {change.approved_at && (
                                  <p><span className="text-gray-500">Approved:</span> {new Date(change.approved_at).toLocaleString()} by {change.approved_by}</p>
                                )}
                              </div>

                              {/* Quick Status Update Buttons */}
                              {change.status !== 'implemented' && (
                                <div className="mt-4 pt-4 border-t">
                                  <h4 className="font-bold text-gray-700 mb-2">Update Status</h4>
                                  <div className="flex gap-2 flex-wrap">
                                    {change.status === 'identified' && (
                                      <button
                                        onClick={() => updateStatus(change, 'pending')}
                                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                                      >
                                        Submit for Approval
                                      </button>
                                    )}
                                    {change.status === 'pending' && (
                                      <>
                                        <button
                                          onClick={() => updateStatus(change, 'approved')}
                                          className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm"
                                        >
                                          ✓ Approve
                                        </button>
                                        <button
                                          onClick={() => updateStatus(change, 'rejected')}
                                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                                        >
                                          ✗ Reject
                                        </button>
                                      </>
                                    )}
                                    {change.status === 'approved' && (
                                      <button
                                        onClick={() => updateStatus(change, 'implemented')}
                                        className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                                      >
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
        <div className="mt-6 text-center text-gray-500 text-sm">
          <p>Change orders are tracked from identification through implementation.</p>
          <p>Approved changes update the project budget and schedule baseline.</p>
        </div>
      </div>
    </div>
  )
}
