import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { logFeedAction } from '../utils/feedAuditLogger.js'
import FeedTagLEM from './FeedTagLEM.jsx'

const varianceColor = (pct) => {
  if (pct == null) return '#666'
  const abs = Math.abs(pct)
  if (abs <= 5) return '#2e7d32'
  if (abs <= 15) return '#e65100'
  return '#c62828'
}

const varianceBg = (pct) => {
  if (pct == null) return 'transparent'
  const abs = Math.abs(pct)
  if (abs <= 5) return '#e8f5e9'
  if (abs <= 15) return '#fff3e0'
  return '#ffebee'
}

const formatCurrency = (val) => {
  if (val == null || val === '') return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(val)
}

export default function FeedWBSTable({ feedEstimateId, projectId }) {
  const { addOrgFilter, getOrgId } = useOrgQuery()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState({})
  const [editingRow, setEditingRow] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [tagLemItem, setTagLemItem] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (feedEstimateId) loadRows()
  }, [feedEstimateId])

  async function loadRows() {
    setLoading(true)
    try {
      let query = supabase
        .from('feed_wbs_variance')
        .select('*')
        .eq('feed_estimate_id', feedEstimateId)
        .order('sort_order', { ascending: true })
      query = addOrgFilter(query)
      const { data, error } = await query
      if (error) throw error
      setRows(data || [])
    } catch (err) {
      console.error('Error loading WBS items:', err)
    }
    setLoading(false)
  }

  function startEdit(row) {
    setEditingRow(row.id)
    setEditForm({
      wbs_code: row.wbs_code || '',
      scope_name: row.scope_name || '',
      estimated_amount: row.estimated_amount != null ? String(row.estimated_amount) : '',
      unit: row.unit || '',
      unit_rate: row.unit_rate != null ? String(row.unit_rate) : '',
      quantity: row.quantity != null ? String(row.quantity) : ''
    })
  }

  function cancelEdit() {
    setEditingRow(null)
    setEditForm({})
  }

  async function saveEdit(rowId) {
    setSaving(true)
    try {
      const orgId = getOrgId()
      const updates = {
        wbs_code: editForm.wbs_code || null,
        scope_name: editForm.scope_name,
        estimated_amount: editForm.estimated_amount ? parseFloat(editForm.estimated_amount) : null,
        unit: editForm.unit || null,
        unit_rate: editForm.unit_rate ? parseFloat(editForm.unit_rate) : null,
        quantity: editForm.quantity ? parseFloat(editForm.quantity) : null
      }

      const { error } = await supabase
        .from('feed_wbs_items')
        .update(updates)
        .eq('id', rowId)

      if (error) throw error

      await logFeedAction({
        action: 'feed_wbs_item_update',
        entityType: 'feed_wbs_item',
        entityId: rowId,
        newValue: JSON.stringify(updates),
        organizationId: orgId
      })

      setEditingRow(null)
      setEditForm({})
      await loadRows()
    } catch (err) {
      console.error('Error saving WBS item:', err)
    }
    setSaving(false)
  }

  async function addRow() {
    const orgId = getOrgId()
    const maxSort = rows.reduce((max, r) => Math.max(max, r.sort_order || 0), 0)

    try {
      const newItem = {
        organization_id: orgId,
        feed_estimate_id: feedEstimateId,
        wbs_code: '',
        scope_name: 'New Scope Item',
        estimated_amount: 0,
        sort_order: maxSort + 10
      }

      const { data, error } = await supabase
        .from('feed_wbs_items')
        .insert(newItem)
        .select()
        .single()

      if (error) throw error

      await logFeedAction({
        action: 'feed_wbs_item_create',
        entityType: 'feed_wbs_item',
        entityId: data.id,
        newValue: 'New Scope Item',
        organizationId: orgId
      })

      await loadRows()
      startEdit(data)
    } catch (err) {
      console.error('Error adding WBS row:', err)
    }
  }

  async function deleteRow(rowId, scopeName) {
    if (!window.confirm(`Delete WBS item "${scopeName}"? This will also remove all tagged LEM actuals.`)) return
    const orgId = getOrgId()

    try {
      const { error } = await supabase
        .from('feed_wbs_items')
        .delete()
        .eq('id', rowId)

      if (error) throw error

      await logFeedAction({
        action: 'feed_wbs_item_delete',
        entityType: 'feed_wbs_item',
        entityId: rowId,
        oldValue: scopeName,
        organizationId: orgId
      })

      await loadRows()
    } catch (err) {
      console.error('Error deleting WBS row:', err)
    }
  }

  async function moveRow(rowId, direction) {
    const idx = rows.findIndex(r => r.id === rowId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= rows.length) return

    try {
      const currentSort = rows[idx].sort_order
      const swapSort = rows[swapIdx].sort_order

      await Promise.all([
        supabase.from('feed_wbs_items').update({ sort_order: swapSort }).eq('id', rows[idx].id),
        supabase.from('feed_wbs_items').update({ sort_order: currentSort }).eq('id', rows[swapIdx].id)
      ])

      await loadRows()
    } catch (err) {
      console.error('Error reordering:', err)
    }
  }

  function toggleExpand(rowId) {
    setExpandedRows(prev => ({ ...prev, [rowId]: !prev[rowId] }))
  }

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading WBS items...</div>
  }

  const totalEstimated = rows.reduce((sum, r) => sum + (parseFloat(r.estimated_amount) || 0), 0)
  const totalActual = rows.reduce((sum, r) => sum + (parseFloat(r.actual_amount) || 0), 0)

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: '#1a5f2a' }}>WBS Line Items</h3>
        <button onClick={addRow} style={addBtnStyle}>+ Add WBS Item</button>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', color: '#666' }}>
          No WBS items yet. Click "+ Add WBS Item" to start building the scope breakdown.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
                <th style={thStyle}>Order</th>
                <th style={thStyle}>WBS Code</th>
                <th style={thStyle}>Scope Name</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Estimated</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actual LEM</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Variance $</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Variance %</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isEditing = editingRow === row.id
                const isExpanded = expandedRows[row.id]

                return (
                  <React.Fragment key={row.id}>
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      {/* Order buttons */}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '2px' }}>
                          <button onClick={() => moveRow(row.id, 'up')} disabled={idx === 0} style={miniBtn} title="Move up">&#9650;</button>
                          <button onClick={() => moveRow(row.id, 'down')} disabled={idx === rows.length - 1} style={miniBtn} title="Move down">&#9660;</button>
                        </div>
                      </td>

                      {/* WBS Code */}
                      <td style={tdStyle}>
                        {isEditing ? (
                          <input
                            value={editForm.wbs_code}
                            onChange={e => setEditForm(f => ({ ...f, wbs_code: e.target.value }))}
                            style={cellInput}
                            placeholder="1.3.2"
                          />
                        ) : (
                          <span style={{ fontFamily: 'monospace', color: '#555' }}>{row.wbs_code || '—'}</span>
                        )}
                      </td>

                      {/* Scope Name */}
                      <td style={tdStyle}>
                        {isEditing ? (
                          <input
                            value={editForm.scope_name}
                            onChange={e => setEditForm(f => ({ ...f, scope_name: e.target.value }))}
                            style={{ ...cellInput, minWidth: '180px' }}
                          />
                        ) : (
                          <div>
                            <span>{row.scope_name}</span>
                            <button onClick={() => toggleExpand(row.id)} style={{ marginLeft: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#1a5f2a', fontSize: '11px' }}>
                              {isExpanded ? '[-]' : '[+]'}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Estimated */}
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editForm.estimated_amount}
                            onChange={e => setEditForm(f => ({ ...f, estimated_amount: e.target.value }))}
                            style={{ ...cellInput, textAlign: 'right', width: '120px' }}
                            step="0.01"
                          />
                        ) : (
                          formatCurrency(row.estimated_amount)
                        )}
                      </td>

                      {/* Actual LEM */}
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {formatCurrency(row.actual_amount)}
                      </td>

                      {/* Variance $ */}
                      <td style={{
                        ...tdStyle,
                        textAlign: 'right',
                        color: varianceColor(row.variance_pct),
                        backgroundColor: varianceBg(row.variance_pct),
                        fontWeight: '600'
                      }}>
                        {row.variance_amount != null ? formatCurrency(row.variance_amount) : '—'}
                      </td>

                      {/* Variance % */}
                      <td style={{
                        ...tdStyle,
                        textAlign: 'right',
                        color: varianceColor(row.variance_pct),
                        backgroundColor: varianceBg(row.variance_pct),
                        fontWeight: '600'
                      }}>
                        {row.variance_pct != null ? `${row.variance_pct > 0 ? '+' : ''}${row.variance_pct}%` : '—'}
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={() => saveEdit(row.id)} disabled={saving} style={{ ...actionBtn, backgroundColor: '#1a5f2a', color: '#fff' }}>
                              {saving ? '...' : 'Save'}
                            </button>
                            <button onClick={cancelEdit} style={actionBtn}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={() => startEdit(row)} style={actionBtn}>Edit</button>
                            <button onClick={() => setTagLemItem(row)} style={{ ...actionBtn, backgroundColor: '#1565c0', color: '#fff' }}>Tag LEMs</button>
                            <button onClick={() => deleteRow(row.id, row.scope_name)} style={{ ...actionBtn, color: '#c62828' }}>Del</button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Expanded row: unit detail */}
                    {isExpanded && !isEditing && (
                      <tr style={{ backgroundColor: '#fafafa' }}>
                        <td colSpan={8} style={{ padding: '8px 16px', fontSize: '12px', color: '#666' }}>
                          <strong>Unit:</strong> {row.unit || '—'} &nbsp;|&nbsp;
                          <strong>Unit Rate:</strong> {row.unit_rate ? formatCurrency(row.unit_rate) : '—'} &nbsp;|&nbsp;
                          <strong>Quantity:</strong> {row.quantity != null ? row.quantity : '—'}
                        </td>
                      </tr>
                    )}

                    {/* Expanded row for editing: unit fields */}
                    {isEditing && (
                      <tr style={{ backgroundColor: '#f0f4f0' }}>
                        <td colSpan={8} style={{ padding: '8px 16px' }}>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px' }}>
                            <label>
                              Unit:
                              <input
                                value={editForm.unit}
                                onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                                style={{ ...cellInput, width: '100px', marginLeft: '4px' }}
                                placeholder="$/m, lump sum"
                              />
                            </label>
                            <label>
                              Unit Rate:
                              <input
                                type="number"
                                value={editForm.unit_rate}
                                onChange={e => setEditForm(f => ({ ...f, unit_rate: e.target.value }))}
                                style={{ ...cellInput, width: '100px', marginLeft: '4px' }}
                                step="0.01"
                              />
                            </label>
                            <label>
                              Quantity:
                              <input
                                type="number"
                                value={editForm.quantity}
                                onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                                style={{ ...cellInput, width: '100px', marginLeft: '4px' }}
                                step="0.01"
                              />
                            </label>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}

              {/* Totals row */}
              <tr style={{ borderTop: '2px solid #333', fontWeight: 'bold', backgroundColor: '#f8f9fa' }}>
                <td colSpan={3} style={{ ...tdStyle, textAlign: 'right' }}>TOTALS</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(totalEstimated)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(totalActual)}</td>
                <td style={{
                  ...tdStyle,
                  textAlign: 'right',
                  color: varianceColor(totalEstimated > 0 ? ((totalActual - totalEstimated) / totalEstimated) * 100 : null)
                }}>
                  {formatCurrency(totalActual - totalEstimated)}
                </td>
                <td style={{
                  ...tdStyle,
                  textAlign: 'right',
                  color: varianceColor(totalEstimated > 0 ? ((totalActual - totalEstimated) / totalEstimated) * 100 : null)
                }}>
                  {totalEstimated > 0
                    ? `${((totalActual - totalEstimated) / totalEstimated * 100).toFixed(1)}%`
                    : '—'
                  }
                </td>
                <td style={tdStyle}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Tag LEM Slide-over */}
      {tagLemItem && (
        <FeedTagLEM
          wbsItem={tagLemItem}
          projectId={projectId}
          onClose={() => { setTagLemItem(null); loadRows() }}
        />
      )}
    </div>
  )
}

const thStyle = { padding: '10px 8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#555' }
const tdStyle = { padding: '8px', verticalAlign: 'middle' }
const cellInput = { padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }
const miniBtn = { padding: '2px 5px', fontSize: '10px', background: '#eee', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }
const actionBtn = { padding: '4px 10px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#fff' }
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
