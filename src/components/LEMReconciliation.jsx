import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { reconcileLEM } from '../utils/lemMatcher.js'
import LEMUpload from './LEMUpload.jsx'

export default function LEMReconciliation() {
  const { addOrgFilter, getOrgId } = useOrgQuery()
  const [lemUploads, setLemUploads] = useState([])
  const [selectedLem, setSelectedLem] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [reviewItem, setReviewItem] = useState(null)
  const [resolution, setResolution] = useState('accept_inspector')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadLemUploads() }, [])

  async function loadLemUploads() {
    setLoading(true)
    let q = supabase.from('contractor_lem_uploads').select('*').order('uploaded_at', { ascending: false })
    q = addOrgFilter(q)
    const { data } = await q
    setLemUploads(data || [])
    setLoading(false)
  }

  async function loadLineItems(lemId) {
    const { data } = await supabase.from('lem_line_items').select('*').eq('lem_id', lemId).order('work_date')
    setLineItems(data || [])
  }

  async function selectLem(lem) {
    setSelectedLem(lem)
    setReviewItem(null)
    await loadLineItems(lem.id)
  }

  async function runReconciliation() {
    if (!selectedLem) return
    setSaving(true)

    // Load all inspector reports for this org
    let q = supabase.from('daily_reports').select('id, date, selected_date, inspector_name, activity_blocks')
    q = addOrgFilter(q)
    const { data: reports } = await q
    if (!reports) { setSaving(false); return }

    // Run the matching engine
    const reconciled = reconcileLEM(lineItems, reports)

    // Update each line item in the database
    for (const item of reconciled) {
      await supabase.from('lem_line_items').update({
        matched_report_id: item.matched_report_id,
        matched_block_index: item.matched_block_index,
        match_confidence: item.match_confidence,
        match_status: item.match_status,
        variance_data: item.variance_data
      }).eq('id', item.id)
    }

    // Update parent LEM status
    await supabase.from('contractor_lem_uploads').update({ status: 'reconciled' }).eq('id', selectedLem.id)

    setLineItems(reconciled)
    setSelectedLem({ ...selectedLem, status: 'reconciled' })
    setSaving(false)
  }

  async function saveResolution() {
    if (!reviewItem) return
    setSaving(true)
    const newStatus = resolution === 'dispute' ? 'disputed' : 'resolved'
    await supabase.from('lem_line_items').update({
      match_status: newStatus,
      resolution: resolution,
      resolution_notes: resolutionNotes,
      resolved_at: new Date().toISOString()
    }).eq('id', reviewItem.id)

    setLineItems(prev => prev.map(i => i.id === reviewItem.id ? { ...i, match_status: newStatus, resolution, resolution_notes: resolutionNotes } : i))
    setReviewItem(null)
    setResolutionNotes('')
    setSaving(false)
  }

  // Summary stats for selected LEM
  const matched = lineItems.filter(i => i.match_status === 'clean')
  const variance = lineItems.filter(i => i.match_status === 'variance')
  const unmatched = lineItems.filter(i => i.match_status === 'unmatched')
  const disputed = lineItems.filter(i => i.match_status === 'disputed')
  const resolved = lineItems.filter(i => i.match_status === 'resolved')

  const totalLemLabour = lineItems.reduce((s, i) => s + (parseFloat(i.total_labour_hours) || 0), 0)
  const totalLemEquip = lineItems.reduce((s, i) => s + (parseFloat(i.total_equipment_hours) || 0), 0)
  const totalLemLabourCost = lineItems.reduce((s, i) => s + (parseFloat(i.total_labour_cost) || 0), 0)
  const totalLemEquipCost = lineItems.reduce((s, i) => s + (parseFloat(i.total_equipment_cost) || 0), 0)

  const totalInspLabour = lineItems.reduce((s, i) => {
    const v = i.variance_data
    return s + (v ? (totalLemLabour - (v.labour_hour_variance || 0)) : 0)
  }, 0)
  const totalInspEquip = lineItems.reduce((s, i) => {
    const v = i.variance_data
    return s + (v ? (totalLemEquip - (v.equipment_hour_variance || 0)) : 0)
  }, 0)

  const statusColor = (status) => {
    switch (status) {
      case 'clean': return '#059669'
      case 'variance': return '#d97706'
      case 'unmatched': return '#dc2626'
      case 'disputed': return '#7c3aed'
      case 'resolved': return '#2563eb'
      default: return '#6b7280'
    }
  }

  const statusBadge = (status) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', color: 'white', backgroundColor: statusColor(status) }}>
      {status}
    </span>
  )

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading LEM uploads...</div>

  // --- THREE-PANEL REVIEW VIEW ---
  if (reviewItem) {
    const vd = reviewItem.variance_data || {}
    const lemLabour = reviewItem.labour_entries || []
    const lemEquip = reviewItem.equipment_entries || []
    const inspBlock = reviewItem._matched_block || {}
    const inspLabour = inspBlock.labourEntries || []
    const inspEquip = inspBlock.equipmentEntries || []

    return (
      <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto' }}>
        <button onClick={() => setReviewItem(null)} style={{ marginBottom: '16px', padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          &larr; Back to Line Items
        </button>

        <h2 style={{ margin: '0 0 4px 0' }}>Review: Ticket #{reviewItem.ticket_number || 'Unknown'}</h2>
        <p style={{ color: '#6b7280', margin: '0 0 16px 0' }}>{reviewItem.work_date} | {reviewItem.crew_name || reviewItem.foreman || '-'}</p>

        {/* Three-panel comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {/* Left: Ticket Photo */}
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>Original Ticket (Source of Truth)</h4>
            {inspBlock.ticketPhotos?.length > 0 || inspBlock.ticketPhoto ? (
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {(inspBlock.ticketPhotos || [inspBlock.ticketPhoto]).filter(Boolean).map((photo, idx) => {
                  const url = typeof photo === 'string' && photo.startsWith('http')
                    ? photo
                    : supabase.storage.from('ticket-photos').getPublicUrl(photo).data?.publicUrl
                  return url ? <img key={idx} src={url} alt={`Ticket page ${idx + 1}`} style={{ width: '100%', borderRadius: '4px', marginBottom: '8px' }} /> : null
                })}
              </div>
            ) : (
              <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>No ticket photo available</p>
            )}
          </div>

          {/* Middle: Inspector Report */}
          <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '16px', border: '1px solid #bbf7d0' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#166534' }}>Inspector Report (Verified)</h4>
            {reviewItem.matched_report_id ? (
              <>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 8px 0' }}>Report: {String(reviewItem.matched_report_id).slice(0, 8)}... | Match: {reviewItem.match_confidence}</p>
                <h5 style={{ margin: '12px 0 6px 0' }}>Labour ({inspLabour.length} entries)</h5>
                {inspLabour.length > 0 ? (
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: '1px solid #d1d5db' }}>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Class</th>
                      <th style={{ textAlign: 'center', padding: '4px' }}>RT</th>
                      <th style={{ textAlign: 'center', padding: '4px' }}>OT</th>
                    </tr></thead>
                    <tbody>
                      {inspLabour.map((e, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '3px 4px' }}>{e.name || e.employeeName || '-'}</td>
                          <td style={{ padding: '3px 4px' }}>{e.classification || e.trade || '-'}</td>
                          <td style={{ padding: '3px 4px', textAlign: 'center' }}>{e.rt || e.hours || 0}</td>
                          <td style={{ padding: '3px 4px', textAlign: 'center' }}>{e.ot || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p style={{ fontSize: '12px', color: '#9ca3af' }}>No labour entries</p>}

                <h5 style={{ margin: '12px 0 6px 0' }}>Equipment ({inspEquip.length} entries)</h5>
                {inspEquip.length > 0 ? (
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: '1px solid #d1d5db' }}>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Unit #</th>
                      <th style={{ textAlign: 'center', padding: '4px' }}>Hours</th>
                    </tr></thead>
                    <tbody>
                      {inspEquip.map((e, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '3px 4px' }}>{e.type || e.equipmentType || '-'}</td>
                          <td style={{ padding: '3px 4px' }}>{e.unitNumber || e.unit_number || '-'}</td>
                          <td style={{ padding: '3px 4px', textAlign: 'center' }}>{e.hours || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p style={{ fontSize: '12px', color: '#9ca3af' }}>No equipment entries</p>}
              </>
            ) : <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>No matching inspector report found</p>}
          </div>

          {/* Right: Contractor LEM */}
          <div style={{ backgroundColor: '#fefce8', borderRadius: '8px', padding: '16px', border: '1px solid #fde68a' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#854d0e' }}>Contractor LEM (Billing Claim)</h4>
            <h5 style={{ margin: '12px 0 6px 0' }}>Labour ({lemLabour.length} entries)</h5>
            {lemLabour.length > 0 ? (
              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid #d1d5db' }}>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Class</th>
                  <th style={{ textAlign: 'center', padding: '4px' }}>RT</th>
                  <th style={{ textAlign: 'center', padding: '4px' }}>OT</th>
                </tr></thead>
                <tbody>
                  {lemLabour.map((e, i) => {
                    const hasVar = reviewItem.matched_report_id && !inspLabour.some(il =>
                      (il.name || il.employeeName || '').toLowerCase() === (e.employee_name || '').toLowerCase()
                    )
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: hasVar ? '#fef2f2' : 'transparent' }}>
                        <td style={{ padding: '3px 4px' }}>{e.employee_name || '-'} {hasVar && <span style={{ color: '#dc2626', fontSize: '10px' }}>NOT IN INSPECTOR</span>}</td>
                        <td style={{ padding: '3px 4px' }}>{e.classification || '-'}</td>
                        <td style={{ padding: '3px 4px', textAlign: 'center' }}>{e.rt_hours || 0}</td>
                        <td style={{ padding: '3px 4px', textAlign: 'center' }}>{e.ot_hours || 0}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : <p style={{ fontSize: '12px', color: '#9ca3af' }}>No labour entries</p>}

            <h5 style={{ margin: '12px 0 6px 0' }}>Equipment ({lemEquip.length} entries)</h5>
            {lemEquip.length > 0 ? (
              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid #d1d5db' }}>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Unit #</th>
                  <th style={{ textAlign: 'center', padding: '4px' }}>Hours</th>
                </tr></thead>
                <tbody>
                  {lemEquip.map((e, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '3px 4px' }}>{e.equipment_type || '-'}</td>
                      <td style={{ padding: '3px 4px' }}>{e.unit_number || '-'}</td>
                      <td style={{ padding: '3px 4px', textAlign: 'center' }}>{e.hours || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p style={{ fontSize: '12px', color: '#9ca3af' }}>No equipment entries</p>}
          </div>
        </div>

        {/* Variance Summary */}
        {vd.has_variance && (
          <div style={{ backgroundColor: vd.details?.some(d => d.severity === 'high') ? '#fef2f2' : '#fffbeb', borderRadius: '8px', padding: '16px', border: `1px solid ${vd.details?.some(d => d.severity === 'high') ? '#fca5a5' : '#fde68a'}`, marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Variance Summary</h4>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              {vd.details?.map((d, i) => (
                <div key={i} style={{ padding: '8px 12px', backgroundColor: d.severity === 'high' ? '#fee2e2' : '#fef3c7', borderRadius: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{d.field.replace(/_/g, ' ')}</span>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>
                    LEM: {d.lem_value} | Inspector: {d.inspector_value} | <span style={{ color: d.difference > 0 ? '#dc2626' : '#059669' }}>{d.difference > 0 ? '+' : ''}{d.difference}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resolution */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
          <h4 style={{ margin: '0 0 12px 0' }}>Resolution</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            {[
              ['accept_lem', 'Accept LEM (approve contractor numbers)'],
              ['accept_inspector', 'Accept Inspector (approve field-verified numbers)'],
              ['split', 'Split / Custom (manually adjust)'],
              ['dispute', 'Dispute (flag and return to contractor)']
            ].map(([val, label]) => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="radio" name="resolution" value={val} checked={resolution === val} onChange={e => setResolution(e.target.value)} />
                {label}
              </label>
            ))}
          </div>
          {resolution !== 'accept_inspector' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Resolution Notes (required)</label>
              <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} rows={3} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} placeholder="Explain the resolution..." />
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={saveResolution} disabled={saving || (resolution !== 'accept_inspector' && !resolutionNotes.trim())}
              style={{ padding: '8px 20px', backgroundColor: resolution === 'dispute' ? '#7c3aed' : '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
              {resolution === 'dispute' ? 'Dispute' : 'Approve'}
            </button>
            <button onClick={() => setReviewItem(null)} style={{ padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Upload section */}
      {showUpload ? (
        <div style={{ marginBottom: '24px' }}>
          <LEMUpload onUploadComplete={() => { setShowUpload(false); loadLemUploads() }} />
          <button onClick={() => setShowUpload(false)} style={{ marginTop: '8px', padding: '6px 12px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel Upload</button>
        </div>
      ) : (
        <button onClick={() => setShowUpload(true)} style={{ marginBottom: '16px', padding: '10px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
          Upload Contractor LEM
        </button>
      )}

      {/* LEM list or detail view */}
      {selectedLem ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <button onClick={() => { setSelectedLem(null); setLineItems([]) }} style={{ padding: '6px 12px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '8px' }}>&larr; Back to LEMs</button>
              <h3 style={{ margin: 0 }}>{selectedLem.contractor_name} - {selectedLem.lem_number || selectedLem.source_filename}</h3>
              <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '13px' }}>
                {selectedLem.lem_period_start} to {selectedLem.lem_period_end} | Status: {statusBadge(selectedLem.status)}
              </p>
            </div>
            {selectedLem.status === 'parsed' && (
              <button onClick={runReconciliation} disabled={saving}
                style={{ padding: '10px 24px', backgroundColor: saving ? '#9ca3af' : '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600' }}>
                {saving ? 'Reconciling...' : 'Run Reconciliation'}
              </button>
            )}
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Total', count: lineItems.length, color: '#374151' },
              { label: 'Clean', count: matched.length, color: '#059669' },
              { label: 'Variance', count: variance.length, color: '#d97706' },
              { label: 'Unmatched', count: unmatched.length, color: '#dc2626' },
              { label: 'Disputed', count: disputed.length, color: '#7c3aed' }
            ].map(c => (
              <div key={c.label} style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: `3px solid ${c.color}` }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: c.color }}>{c.count}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Financial summary */}
          {lineItems.length > 0 && (
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '8px' }}></th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>LEM Claims</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Inspector Verified</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Variance</th>
                </tr></thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px', fontWeight: '500' }}>Labour Hours</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{totalLemLabour.toFixed(1)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{totalInspLabour.toFixed(1)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: (totalLemLabour - totalInspLabour) > 0 ? '#dc2626' : '#059669', fontWeight: '600' }}>
                      {(totalLemLabour - totalInspLabour) > 0 ? '+' : ''}{(totalLemLabour - totalInspLabour).toFixed(1)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px', fontWeight: '500' }}>Equipment Hours</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{totalLemEquip.toFixed(1)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{totalInspEquip.toFixed(1)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: (totalLemEquip - totalInspEquip) > 0 ? '#dc2626' : '#059669', fontWeight: '600' }}>
                      {(totalLemEquip - totalInspEquip) > 0 ? '+' : ''}{(totalLemEquip - totalInspEquip).toFixed(1)}
                    </td>
                  </tr>
                  <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: '700' }}>
                    <td style={{ padding: '8px' }}>Total Cost</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>${(totalLemLabourCost + totalLemEquipCost).toLocaleString()}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>-</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Line items table */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#1e3a5f' }}>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'left' }}>Ticket #</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'left' }}>Date</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'left' }}>Crew</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>LEM Labour</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Insp Labour</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Var</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>LEM Equip</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Insp Equip</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Var</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Status</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map(item => {
                  const vd = item.variance_data || {}
                  const labVar = vd.labour_hour_variance || 0
                  const eqVar = vd.equipment_hour_variance || 0
                  const inspLHrs = (parseFloat(item.total_labour_hours) || 0) - labVar
                  const inspEHrs = (parseFloat(item.total_equipment_hours) || 0) - eqVar
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: item.match_status === 'variance' ? '#fffbeb' : item.match_status === 'unmatched' ? '#fef2f2' : 'transparent' }}>
                      <td style={{ padding: '8px', fontWeight: '500' }}>{item.ticket_number || '-'}</td>
                      <td style={{ padding: '8px' }}>{item.work_date || '-'}</td>
                      <td style={{ padding: '8px' }}>{item.crew_name || item.foreman || '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{item.total_labour_hours || 0}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{item.matched_report_id ? inspLHrs.toFixed(1) : '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: labVar !== 0 ? '700' : '400', color: labVar > 0 ? '#dc2626' : labVar < 0 ? '#059669' : '#374151' }}>
                        {item.matched_report_id ? (labVar > 0 ? '+' : '') + labVar : '-'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{item.total_equipment_hours || 0}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{item.matched_report_id ? inspEHrs.toFixed(1) : '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: eqVar !== 0 ? '700' : '400', color: eqVar > 0 ? '#dc2626' : eqVar < 0 ? '#059669' : '#374151' }}>
                        {item.matched_report_id ? (eqVar > 0 ? '+' : '') + eqVar : '-'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{statusBadge(item.match_status)}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        {(item.match_status === 'variance' || item.match_status === 'clean') && (
                          <button onClick={() => { setReviewItem(item); setResolution('accept_inspector'); setResolutionNotes('') }}
                            style={{ padding: '4px 10px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                            Review
                          </button>
                        )}
                        {item.match_status === 'unmatched' && (
                          <span style={{ fontSize: '11px', color: '#dc2626' }}>No match</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* LEM uploads list */
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#1e3a5f' }}>
                <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>Contractor</th>
                <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>LEM #</th>
                <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>Period</th>
                <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>File</th>
                <th style={{ color: 'white', padding: '10px 12px', textAlign: 'right' }}>Labour Hrs</th>
                <th style={{ color: 'white', padding: '10px 12px', textAlign: 'right' }}>Equip Hrs</th>
                <th style={{ color: 'white', padding: '10px 12px', textAlign: 'right' }}>Total Claimed</th>
                <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Status</th>
                <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {lemUploads.length === 0 ? (
                <tr><td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No LEM uploads yet. Click "Upload Contractor LEM" to get started.</td></tr>
              ) : lemUploads.map(lem => (
                <tr key={lem.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 12px', fontWeight: '500' }}>{lem.contractor_name}</td>
                  <td style={{ padding: '10px 12px' }}>{lem.lem_number || '-'}</td>
                  <td style={{ padding: '10px 12px' }}>{lem.lem_period_start || '-'} to {lem.lem_period_end || '-'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {lem.source_file_url ? <a href={lem.source_file_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{lem.source_filename}</a> : lem.source_filename}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{lem.total_labour_hours || 0}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{lem.total_equipment_hours || 0}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>${(parseFloat(lem.total_claimed) || 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{statusBadge(lem.status)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <button onClick={() => selectLem(lem)} style={{ padding: '4px 12px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
