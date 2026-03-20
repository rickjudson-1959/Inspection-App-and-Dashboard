import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { logFeedAction } from '../utils/feedAuditLogger.js'
import FeedRiskCloseout from './FeedRiskCloseout.jsx'

const CATEGORIES = ['geotechnical', 'constructability', 'regulatory', 'schedule', 'environmental']
const SEVERITIES = ['low', 'medium', 'high', 'critical']
const STATUSES = ['open', 'closed', 'escalated', 'not_encountered']

const severityColor = {
  low: '#4caf50',
  medium: '#ff9800',
  high: '#f44336',
  critical: '#9c27b0'
}

const statusColor = {
  open: '#1565c0',
  closed: '#4caf50',
  escalated: '#f44336',
  not_encountered: '#9e9e9e'
}

const formatCurrency = (val) => {
  if (val == null || val === '') return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(val)
}

export default function FeedRiskRegister({ feedEstimateId, projectId }) {
  const { addOrgFilter, getOrgId } = useOrgQuery()

  const [risks, setRisks] = useState([])
  const [closeouts, setCloseouts] = useState({})
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [addingNew, setAddingNew] = useState(false)
  const [closeoutRisk, setCloseoutRisk] = useState(null)
  const [saving, setSaving] = useState(false)
  const [selectedForBulk, setSelectedForBulk] = useState([])
  const [bulkStatus, setBulkStatus] = useState('')

  useEffect(() => {
    if (feedEstimateId) loadRisks()
  }, [feedEstimateId])

  async function loadRisks() {
    setLoading(true)
    try {
      let query = supabase
        .from('feed_risks')
        .select('*')
        .eq('feed_estimate_id', feedEstimateId)
        .order('sort_order', { ascending: true })
      query = addOrgFilter(query)
      const { data, error } = await query
      if (error) throw error
      setRisks(data || [])

      // Load closeouts for all risks
      const riskIds = (data || []).map(r => r.id)
      if (riskIds.length > 0) {
        let coQuery = supabase
          .from('feed_risk_closeouts')
          .select('*')
          .in('risk_id', riskIds)
        coQuery = addOrgFilter(coQuery)
        const { data: coData } = await coQuery
        const coMap = {}
        ;(coData || []).forEach(co => { coMap[co.risk_id] = co })
        setCloseouts(coMap)
      }
    } catch (err) {
      console.error('Error loading risks:', err)
    }
    setLoading(false)
  }

  function startAdd() {
    setAddingNew(true)
    setEditForm({
      risk_description: '',
      category: 'constructability',
      severity: 'medium',
      cost_allowance: '',
      status: 'open'
    })
  }

  function startEdit(risk) {
    setEditingId(risk.id)
    setEditForm({
      risk_description: risk.risk_description || '',
      category: risk.category || 'constructability',
      severity: risk.severity || 'medium',
      cost_allowance: risk.cost_allowance != null ? String(risk.cost_allowance) : '',
      status: risk.status || 'open'
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setAddingNew(false)
    setEditForm({})
  }

  async function saveRisk(riskId) {
    setSaving(true)
    const orgId = getOrgId()
    try {
      const record = {
        risk_description: editForm.risk_description,
        category: editForm.category,
        severity: editForm.severity,
        cost_allowance: editForm.cost_allowance ? parseFloat(editForm.cost_allowance) : null,
        status: editForm.status
      }

      if (riskId) {
        const { error } = await supabase
          .from('feed_risks')
          .update(record)
          .eq('id', riskId)
        if (error) throw error

        await logFeedAction({
          action: 'feed_risk_update',
          entityType: 'feed_risk',
          entityId: riskId,
          newValue: JSON.stringify(record),
          organizationId: orgId
        })
      } else {
        const maxSort = risks.reduce((max, r) => Math.max(max, r.sort_order || 0), 0)
        const { data, error } = await supabase
          .from('feed_risks')
          .insert({
            ...record,
            organization_id: orgId,
            feed_estimate_id: feedEstimateId,
            sort_order: maxSort + 10
          })
          .select()
          .single()
        if (error) throw error

        await logFeedAction({
          action: 'feed_risk_create',
          entityType: 'feed_risk',
          entityId: data.id,
          newValue: record.risk_description,
          organizationId: orgId
        })
      }

      cancelEdit()
      await loadRisks()
    } catch (err) {
      console.error('Error saving risk:', err)
    }
    setSaving(false)
  }

  async function deleteRisk(riskId, desc) {
    if (!window.confirm(`Delete risk: "${desc}"?`)) return
    const orgId = getOrgId()
    try {
      const { error } = await supabase
        .from('feed_risks')
        .delete()
        .eq('id', riskId)
      if (error) throw error

      await logFeedAction({
        action: 'feed_risk_delete',
        entityType: 'feed_risk',
        entityId: riskId,
        oldValue: desc,
        organizationId: orgId
      })

      await loadRisks()
    } catch (err) {
      console.error('Error deleting risk:', err)
    }
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selectedForBulk.length === 0) return
    const orgId = getOrgId()
    try {
      const { error } = await supabase
        .from('feed_risks')
        .update({ status: bulkStatus })
        .in('id', selectedForBulk)
      if (error) throw error

      await logFeedAction({
        action: 'feed_risk_bulk_status',
        entityType: 'feed_risk',
        entityId: selectedForBulk.join(','),
        newValue: bulkStatus,
        metadata: { count: selectedForBulk.length },
        organizationId: orgId
      })

      setSelectedForBulk([])
      setBulkStatus('')
      await loadRisks()
    } catch (err) {
      console.error('Error updating bulk status:', err)
    }
  }

  function toggleBulkSelect(riskId) {
    setSelectedForBulk(prev =>
      prev.includes(riskId) ? prev.filter(id => id !== riskId) : [...prev, riskId]
    )
  }

  const statusCounts = {
    open: risks.filter(r => r.status === 'open').length,
    closed: risks.filter(r => r.status === 'closed').length,
    escalated: risks.filter(r => r.status === 'escalated').length,
    not_encountered: risks.filter(r => r.status === 'not_encountered').length
  }

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading risk register...</div>
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: '#1a5f2a' }}>FEED Risk Register</h3>
        <button onClick={startAdd} style={addBtnStyle}>+ Add Risk</button>
      </div>

      {/* Status summary badges */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {Object.entries(statusCounts).map(([status, count]) => (
          <span key={status} style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: statusColor[status] + '20', color: statusColor[status] }}>
            {status.replace('_', ' ')}: {count}
          </span>
        ))}
      </div>

      {/* Bulk actions */}
      {selectedForBulk.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', padding: '8px 12px', backgroundColor: '#e3f2fd', borderRadius: '6px', fontSize: '13px' }}>
          <span>{selectedForBulk.length} selected</span>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="">Set status...</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <button onClick={applyBulkStatus} disabled={!bulkStatus} style={{ ...actionBtn, backgroundColor: bulkStatus ? '#1565c0' : '#ccc', color: '#fff' }}>Apply</button>
        </div>
      )}

      {/* Add new row */}
      {addingNew && (
        <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: '#f0f4f0', borderRadius: '8px', border: '1px solid #c8e6c9' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <textarea
              value={editForm.risk_description}
              onChange={e => setEditForm(f => ({ ...f, risk_description: e.target.value }))}
              placeholder="Describe the risk..."
              rows={2}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={cellSelect}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={editForm.severity} onChange={e => setEditForm(f => ({ ...f, severity: e.target.value }))} style={cellSelect}>
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                type="number"
                value={editForm.cost_allowance}
                onChange={e => setEditForm(f => ({ ...f, cost_allowance: e.target.value }))}
                placeholder="Cost allowance"
                step="0.01"
                style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', width: '140px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => saveRisk(null)} disabled={saving || !editForm.risk_description} style={{ ...actionBtn, backgroundColor: '#1a5f2a', color: '#fff' }}>
                {saving ? 'Saving...' : 'Save Risk'}
              </button>
              <button onClick={cancelEdit} style={actionBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {risks.length === 0 && !addingNew ? (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', color: '#666' }}>
          No risks registered yet. Click "+ Add Risk" to begin building the risk register.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
                <th style={thStyle}></th>
                <th style={thStyle}>Risk Description</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Severity</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Cost Allowance</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actual Impact</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Variance</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {risks.map(risk => {
                const isEditing = editingId === risk.id
                const co = closeouts[risk.id]

                return (
                  <tr key={risk.id} style={{ borderBottom: '1px solid #eee' }}>
                    {/* Checkbox */}
                    <td style={tdStyle}>
                      <input type="checkbox" checked={selectedForBulk.includes(risk.id)} onChange={() => toggleBulkSelect(risk.id)} />
                    </td>

                    {/* Description */}
                    <td style={{ ...tdStyle, maxWidth: '300px' }}>
                      {isEditing ? (
                        <textarea
                          value={editForm.risk_description}
                          onChange={e => setEditForm(f => ({ ...f, risk_description: e.target.value }))}
                          rows={2}
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', resize: 'vertical' }}
                        />
                      ) : (
                        <span>{risk.risk_description}</span>
                      )}
                    </td>

                    {/* Category */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={cellSelect}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span style={{ ...badgeStyle, backgroundColor: '#e3f2fd', color: '#1565c0' }}>{risk.category}</span>
                      )}
                    </td>

                    {/* Severity */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select value={editForm.severity} onChange={e => setEditForm(f => ({ ...f, severity: e.target.value }))} style={cellSelect}>
                          {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span style={{ ...badgeStyle, backgroundColor: (severityColor[risk.severity] || '#999') + '20', color: severityColor[risk.severity] || '#999' }}>
                          {risk.severity}
                        </span>
                      )}
                    </td>

                    {/* Cost Allowance */}
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForm.cost_allowance}
                          onChange={e => setEditForm(f => ({ ...f, cost_allowance: e.target.value }))}
                          step="0.01"
                          style={{ width: '120px', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', textAlign: 'right' }}
                        />
                      ) : (
                        formatCurrency(risk.cost_allowance)
                      )}
                    </td>

                    {/* Status */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} style={cellSelect}>
                          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                        </select>
                      ) : (
                        <span style={{ ...badgeStyle, backgroundColor: (statusColor[risk.status] || '#999') + '20', color: statusColor[risk.status] || '#999' }}>
                          {(risk.status || '').replace('_', ' ')}
                        </span>
                      )}
                    </td>

                    {/* Actual Impact */}
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {co ? formatCurrency(co.actual_cost_impact) : '—'}
                    </td>

                    {/* Variance to Allowance */}
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {co && risk.cost_allowance != null ? (() => {
                        const variance = (parseFloat(co.actual_cost_impact) || 0) - (parseFloat(risk.cost_allowance) || 0)
                        const isOver = variance > 0
                        return (
                          <span style={{ color: isOver ? '#c62828' : '#2e7d32', fontWeight: '600', fontSize: '12px' }}>
                            {isOver ? '+' : ''}{formatCurrency(variance)}
                          </span>
                        )
                      })() : '—'}
                    </td>

                    {/* Actions */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button onClick={() => saveRisk(risk.id)} disabled={saving} style={{ ...actionBtn, backgroundColor: '#1a5f2a', color: '#fff' }}>
                            {saving ? '...' : 'Save'}
                          </button>
                          <button onClick={cancelEdit} style={actionBtn}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button onClick={() => startEdit(risk)} style={actionBtn}>Edit</button>
                          <button onClick={() => setCloseoutRisk(risk)} style={{ ...actionBtn, backgroundColor: '#1565c0', color: '#fff' }}>
                            {co ? 'View' : 'Closeout'}
                          </button>
                          <button onClick={() => deleteRisk(risk.id, risk.risk_description)} style={{ ...actionBtn, color: '#c62828' }}>Del</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Risk Closeout Modal */}
      {closeoutRisk && (
        <FeedRiskCloseout
          risk={closeoutRisk}
          existingCloseout={closeouts[closeoutRisk.id]}
          projectId={projectId}
          onClose={() => { setCloseoutRisk(null); loadRisks() }}
        />
      )}
    </div>
  )
}

const thStyle = { padding: '10px 8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#555' }
const tdStyle = { padding: '8px', verticalAlign: 'middle' }
const cellSelect = { padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }
const actionBtn = { padding: '4px 10px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#fff' }
const badgeStyle = { padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', display: 'inline-block' }
const addBtnStyle = {
  padding: '8px 16px',
  backgroundColor: '#1a5f2a',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '13px'
}
