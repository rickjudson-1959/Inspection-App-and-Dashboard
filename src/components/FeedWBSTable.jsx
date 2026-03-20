import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { logFeedAction } from '../utils/feedAuditLogger.js'
import FeedTagLEM from './FeedTagLEM.jsx'

const SCOPE_CATEGORIES = [
  { value: '', label: '— Select —' },
  { value: 'mainline_install', label: 'Mainline Install' },
  { value: 'hdd_crossings', label: 'HDD Crossings' },
  { value: 'road_water_crossings', label: 'Road / Water Crossings' },
  { value: 'station_tieins', label: 'Station Tie-ins' },
  { value: 'hydro_test_commissioning', label: 'Hydro Test & Commissioning' },
  { value: 'mob_demob', label: 'Mob / Demob' },
  { value: 'environmental_regulatory', label: 'Environmental & Regulatory' },
  { value: 'pm_inspection', label: 'PM & Inspection' },
  { value: 'materials', label: 'Materials' },
  { value: 'other', label: 'Other' }
]

const WBS_TEMPLATES = [
  { wbs_code: '1.1', scope_name: 'Mainline pipe installation', scope_category: 'mainline_install' },
  { wbs_code: '1.2', scope_name: 'HDD crossings', scope_category: 'hdd_crossings' },
  { wbs_code: '1.3', scope_name: 'Road / watercourse crossings', scope_category: 'road_water_crossings' },
  { wbs_code: '1.4', scope_name: 'Compressor / station tie-ins', scope_category: 'station_tieins' },
  { wbs_code: '1.5', scope_name: 'Hydrostatic test & commissioning', scope_category: 'hydro_test_commissioning' },
  { wbs_code: '1.6', scope_name: 'Spread mob / demob', scope_category: 'mob_demob' },
  { wbs_code: '1.7', scope_name: 'Environmental & regulatory', scope_category: 'environmental_regulatory' },
  { wbs_code: '1.8', scope_name: 'PM, field inspection & QC', scope_category: 'pm_inspection' }
]

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

const categoryLabel = (val) => {
  const cat = SCOPE_CATEGORIES.find(c => c.value === val)
  return cat ? cat.label : val || '—'
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
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [loadingTemplate, setLoadingTemplate] = useState(false)

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
      scope_category: row.scope_category || '',
      estimated_amount: row.estimated_amount != null ? String(row.estimated_amount) : '',
      unit: row.unit || '',
      unit_rate: row.unit_rate != null ? String(row.unit_rate) : '',
      quantity: row.quantity != null ? String(row.quantity) : '',
      basis_notes: row.basis_notes || ''
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
        scope_category: editForm.scope_category || null,
        estimated_amount: editForm.estimated_amount ? parseFloat(editForm.estimated_amount) : null,
        unit: editForm.unit || null,
        unit_rate: editForm.unit_rate ? parseFloat(editForm.unit_rate) : null,
        quantity: editForm.quantity ? parseFloat(editForm.quantity) : null,
        basis_notes: editForm.basis_notes || null
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

  async function applyTemplate() {
    setLoadingTemplate(true)
    const orgId = getOrgId()
    const maxSort = rows.reduce((max, r) => Math.max(max, r.sort_order || 0), 0)

    try {
      const newItems = WBS_TEMPLATES.map((t, idx) => ({
        organization_id: orgId,
        feed_estimate_id: feedEstimateId,
        wbs_code: t.wbs_code,
        scope_name: t.scope_name,
        scope_category: t.scope_category,
        estimated_amount: null,
        sort_order: maxSort + ((idx + 1) * 10)
      }))

      const { error } = await supabase
        .from('feed_wbs_items')
        .insert(newItems)

      if (error) throw error

      await logFeedAction({
        action: 'feed_wbs_template_applied',
        entityType: 'feed_wbs_item',
        entityId: feedEstimateId,
        newValue: `Standard pipeline template (${WBS_TEMPLATES.length} items)`,
        organizationId: orgId
      })

      setShowTemplateModal(false)
      await loadRows()
    } catch (err) {
      console.error('Error applying template:', err)
    }
    setLoadingTemplate(false)
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
  const totalTaggedLems = rows.reduce((sum, r) => sum + (r.tagged_lem_count || 0), 0)

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: '#1a5f2a' }}>WBS Line Items</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowTemplateModal(true)} style={{ ...addBtnStyle, backgroundColor: '#1565c0' }}>
            Load Template
          </button>
          <button onClick={addRow} style={addBtnStyle}>+ Add WBS Item</button>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div style={summaryCard}>
          <div style={summaryLabel}>Total Estimated</div>
          <div style={summaryValue}>{formatCurrency(totalEstimated)}</div>
        </div>
        <div style={summaryCard}>
          <div style={summaryLabel}>Total Actual (LEM)</div>
          <div style={summaryValue}>{formatCurrency(totalActual)}</div>
        </div>
        <div style={{ ...summaryCard, borderColor: varianceColor(totalEstimated > 0 ? ((totalActual - totalEstimated) / totalEstimated) * 100 : null) }}>
          <div style={summaryLabel}>Variance</div>
          <div style={{ ...summaryValue, color: varianceColor(totalEstimated > 0 ? ((totalActual - totalEstimated) / totalEstimated) * 100 : null) }}>
            {formatCurrency(totalActual - totalEstimated)}
            {totalEstimated > 0 && (
              <span style={{ fontSize: '12px', marginLeft: '6px' }}>
                ({((totalActual - totalEstimated) / totalEstimated * 100).toFixed(1)}%)
              </span>
            )}
          </div>
        </div>
        <div style={summaryCard}>
          <div style={summaryLabel}>Tagged LEMs</div>
          <div style={summaryValue}>{totalTaggedLems}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', color: '#666' }}>
          <p style={{ margin: '0 0 12px', fontSize: '15px' }}>No WBS items yet.</p>
          <p style={{ margin: 0, fontSize: '13px' }}>Click "Load Template" to start with a standard pipeline WBS, or "+ Add WBS Item" to build from scratch.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
                <th style={thStyle}>Order</th>
                <th style={thStyle}>WBS Code</th>
                <th style={thStyle}>Scope Name</th>
                <th style={thStyle}>Category</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Estimated</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actual LEM</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Variance $</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Var %</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>LEMs</th>
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
                          <input value={editForm.wbs_code} onChange={e => setEditForm(f => ({ ...f, wbs_code: e.target.value }))} style={cellInput} placeholder="1.3.2" />
                        ) : (
                          <span style={{ fontFamily: 'monospace', color: '#555' }}>{row.wbs_code || '—'}</span>
                        )}
                      </td>

                      {/* Scope Name */}
                      <td style={tdStyle}>
                        {isEditing ? (
                          <input value={editForm.scope_name} onChange={e => setEditForm(f => ({ ...f, scope_name: e.target.value }))} style={{ ...cellInput, minWidth: '160px' }} />
                        ) : (
                          <div>
                            <span>{row.scope_name}</span>
                            <button onClick={() => toggleExpand(row.id)} style={{ marginLeft: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#1a5f2a', fontSize: '11px' }}>
                              {isExpanded ? '[-]' : '[+]'}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td style={tdStyle}>
                        {isEditing ? (
                          <select value={editForm.scope_category} onChange={e => setEditForm(f => ({ ...f, scope_category: e.target.value }))} style={{ ...cellInput, width: '140px' }}>
                            {SCOPE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        ) : (
                          row.scope_category ? (
                            <span style={{ fontSize: '11px', padding: '2px 6px', backgroundColor: '#e3f2fd', borderRadius: '3px', color: '#1565c0' }}>
                              {categoryLabel(row.scope_category)}
                            </span>
                          ) : '—'
                        )}
                      </td>

                      {/* Estimated */}
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {isEditing ? (
                          <input type="number" value={editForm.estimated_amount} onChange={e => setEditForm(f => ({ ...f, estimated_amount: e.target.value }))} style={{ ...cellInput, textAlign: 'right', width: '110px' }} step="0.01" />
                        ) : formatCurrency(row.estimated_amount)}
                      </td>

                      {/* Actual LEM */}
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.actual_amount)}</td>

                      {/* Variance $ */}
                      <td style={{ ...tdStyle, textAlign: 'right', color: varianceColor(row.variance_pct), backgroundColor: varianceBg(row.variance_pct), fontWeight: '600' }}>
                        {row.variance_amount != null ? formatCurrency(row.variance_amount) : '—'}
                      </td>

                      {/* Variance % */}
                      <td style={{ ...tdStyle, textAlign: 'right', color: varianceColor(row.variance_pct), backgroundColor: varianceBg(row.variance_pct), fontWeight: '600' }}>
                        {row.variance_pct != null ? `${row.variance_pct > 0 ? '+' : ''}${row.variance_pct}%` : '—'}
                      </td>

                      {/* Tagged LEM count */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {(row.tagged_lem_count || 0) > 0 ? (
                          <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#e8f5e9', borderRadius: '10px', color: '#2e7d32', fontWeight: '600' }}>
                            {row.tagged_lem_count}
                          </span>
                        ) : (
                          <span style={{ color: '#ccc' }}>0</span>
                        )}
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

                    {/* Expanded row: unit detail + basis notes */}
                    {isExpanded && !isEditing && (
                      <tr style={{ backgroundColor: '#fafafa' }}>
                        <td colSpan={10} style={{ padding: '8px 16px', fontSize: '12px', color: '#666' }}>
                          <strong>Unit:</strong> {row.unit || '—'} &nbsp;|&nbsp;
                          <strong>Unit Rate:</strong> {row.unit_rate ? formatCurrency(row.unit_rate) : '—'} &nbsp;|&nbsp;
                          <strong>Quantity:</strong> {row.quantity != null ? row.quantity : '—'}
                          {row.basis_notes && (
                            <div style={{ marginTop: '6px', fontStyle: 'italic', color: '#888' }}>
                              <strong>Basis:</strong> {row.basis_notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}

                    {/* Expanded row for editing: unit fields + basis notes */}
                    {isEditing && (
                      <tr style={{ backgroundColor: '#f0f4f0' }}>
                        <td colSpan={10} style={{ padding: '8px 16px' }}>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px', flexWrap: 'wrap' }}>
                            <label>
                              Unit:
                              <input value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} style={{ ...cellInput, width: '100px', marginLeft: '4px' }} placeholder="$/m, lump sum" />
                            </label>
                            <label>
                              Unit Rate:
                              <input type="number" value={editForm.unit_rate} onChange={e => setEditForm(f => ({ ...f, unit_rate: e.target.value }))} style={{ ...cellInput, width: '100px', marginLeft: '4px' }} step="0.01" />
                            </label>
                            <label>
                              Quantity:
                              <input type="number" value={editForm.quantity} onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))} style={{ ...cellInput, width: '100px', marginLeft: '4px' }} step="0.01" />
                            </label>
                          </div>
                          <div style={{ marginTop: '8px' }}>
                            <label style={{ fontSize: '12px' }}>
                              Basis notes:
                              <input value={editForm.basis_notes} onChange={e => setEditForm(f => ({ ...f, basis_notes: e.target.value }))} style={{ ...cellInput, width: '100%', marginTop: '4px' }} placeholder="EPCM's estimating assumption for this line item" />
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
                <td colSpan={4} style={{ ...tdStyle, textAlign: 'right' }}>TOTALS</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(totalEstimated)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(totalActual)}</td>
                <td style={{
                  ...tdStyle, textAlign: 'right',
                  color: varianceColor(totalEstimated > 0 ? ((totalActual - totalEstimated) / totalEstimated) * 100 : null)
                }}>
                  {formatCurrency(totalActual - totalEstimated)}
                </td>
                <td style={{
                  ...tdStyle, textAlign: 'right',
                  color: varianceColor(totalEstimated > 0 ? ((totalActual - totalEstimated) / totalEstimated) * 100 : null)
                }}>
                  {totalEstimated > 0 ? `${((totalActual - totalEstimated) / totalEstimated * 100).toFixed(1)}%` : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', color: '#666' }}>{totalTaggedLems}</td>
                <td style={tdStyle}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '30px', maxWidth: '500px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#1565c0' }}>Load WBS Template</h3>
            <p style={{ margin: '0 0 16px', color: '#666', fontSize: '14px' }}>
              This will add the standard pipeline WBS structure ({WBS_TEMPLATES.length} items) without overwriting any existing rows. Estimated amounts will be blank for you to fill in.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <th style={{ padding: '6px', textAlign: 'left' }}>WBS</th>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Scope</th>
                  <th style={{ padding: '6px', textAlign: 'left' }}>Category</th>
                </tr>
              </thead>
              <tbody>
                {WBS_TEMPLATES.map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{t.wbs_code}</td>
                    <td style={{ padding: '4px 6px' }}>{t.scope_name}</td>
                    <td style={{ padding: '4px 6px' }}>
                      <span style={{ fontSize: '11px', padding: '1px 5px', backgroundColor: '#e3f2fd', borderRadius: '3px', color: '#1565c0' }}>
                        {categoryLabel(t.scope_category)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowTemplateModal(false)} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button onClick={applyTemplate} disabled={loadingTemplate} style={{ padding: '10px 20px', backgroundColor: '#1565c0', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                {loadingTemplate ? 'Adding...' : 'Add Template Rows'}
              </button>
            </div>
          </div>
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

const thStyle = { padding: '10px 6px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#555', whiteSpace: 'nowrap' }
const tdStyle = { padding: '6px', verticalAlign: 'middle' }
const cellInput = { padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }
const miniBtn = { padding: '2px 5px', fontSize: '10px', background: '#eee', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }
const actionBtn = { padding: '4px 8px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#fff', whiteSpace: 'nowrap' }
const addBtnStyle = { padding: '8px 16px', backgroundColor: '#1a5f2a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }
const summaryCard = { padding: '12px 16px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0' }
const summaryLabel = { fontSize: '11px', color: '#888', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }
const summaryValue = { fontSize: '18px', fontWeight: '700', color: '#333' }
