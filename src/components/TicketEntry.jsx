import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { useAuth } from '../AuthContext.jsx'

/**
 * TicketEntry — Standalone ticket entry form for admin/cost control.
 * Used to enter signed contractor tickets that have no matching inspector report.
 * Saves to the `standalone_tickets` table.
 */
export default function TicketEntry({ onSave, onCancel, editTicket }) {
  const { userProfile } = useAuth()
  const { getOrgId, organizationId } = useOrgQuery()

  // ── Form state ──────────────────────────────────────────────────────
  const [ticketNumber, setTicketNumber] = useState('')
  const [workDate, setWorkDate] = useState('')
  const [contractorName, setContractorName] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [lemCategory, setLemCategory] = useState('third_party')
  const [description, setDescription] = useState('')
  const [signedBy, setSignedBy] = useState('')
  const [signedRole, setSignedRole] = useState('')
  const [notes, setNotes] = useState('')

  // ── Photo uploads ───────────────────────────────────────────────────
  const [photoFiles, setPhotoFiles] = useState([])        // File objects for new uploads
  const [existingPhotos, setExistingPhotos] = useState([]) // URLs from existing ticket

  // ── Labour entries ──────────────────────────────────────────────────
  const emptyLabourRow = () => ({ employee_name: '', classification: '', rt: '', ot: '', count: '1' })
  const [labourEntries, setLabourEntries] = useState([emptyLabourRow()])

  // ── Equipment entries ───────────────────────────────────────────────
  const emptyEquipRow = () => ({ equipment_type: '', unit_number: '', hours: '', count: '1' })
  const [equipmentEntries, setEquipmentEntries] = useState([emptyEquipRow()])

  // ── Rate cards (for cost calculation) ───────────────────────────────
  const [labourRates, setLabourRates] = useState([])
  const [equipmentRates, setEquipmentRates] = useState([])

  // ── UI state ────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // ── Load rate cards on mount ────────────────────────────────────────
  useEffect(() => {
    loadRates()
  }, [organizationId])

  // ── Populate form when editing an existing ticket ───────────────────
  useEffect(() => {
    if (!editTicket) return
    setTicketNumber(editTicket.ticket_number || '')
    setWorkDate(editTicket.work_date || '')
    setContractorName(editTicket.contractor_name || '')
    setPoNumber(editTicket.po_number || '')
    setLemCategory(editTicket.lem_category || 'third_party')
    setDescription(editTicket.description || '')
    setSignedBy(editTicket.signed_by || '')
    setSignedRole(editTicket.signed_role || '')
    setNotes(editTicket.notes || '')
    setExistingPhotos(editTicket.photo_urls || [])
    if (editTicket.labour_entries?.length > 0) {
      setLabourEntries(editTicket.labour_entries)
    }
    if (editTicket.equipment_entries?.length > 0) {
      setEquipmentEntries(editTicket.equipment_entries)
    }
  }, [editTicket])

  async function loadRates() {
    const orgId = getOrgId()
    if (!orgId) return
    try {
      const lr = await fetch(`/api/rates?table=labour_rates&organization_id=${orgId}`)
      if (lr.ok) {
        const d = await lr.json()
        if (Array.isArray(d)) setLabourRates(d)
      }
      const er = await fetch(`/api/rates?table=equipment_rates&organization_id=${orgId}`)
      if (er.ok) {
        const d = await er.json()
        if (Array.isArray(d)) setEquipmentRates(d)
      }
    } catch (e) {
      console.warn('Rate cards not available:', e)
    }
  }

  // ── Fuzzy rate matching (same pattern as LEMReconciliation) ─────────
  function findBestMatch(search, candidates, keyFn) {
    if (!search || !candidates || candidates.length === 0) return null
    const s = String(search).toLowerCase().trim()
    if (!s) return null
    // Exact match
    let match = candidates.find(c => {
      try { return (keyFn(c) || '').toLowerCase().trim() === s } catch { return false }
    })
    if (match) return match
    // Substring match
    match = candidates.find(c => {
      try {
        const k = (keyFn(c) || '').toLowerCase().trim()
        return k && (k.includes(s) || s.includes(k))
      } catch { return false }
    })
    if (match) return match
    // Word overlap scoring
    const sWords = s.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean)
    if (sWords.length === 0) return null
    let bestScore = 0, bestCandidate = null
    for (const c of candidates) {
      try {
        const k = (keyFn(c) || '').toLowerCase().trim()
        if (!k) continue
        const kWords = k.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean)
        const shared = sWords.filter(w => kWords.some(kw => kw.includes(w) || w.includes(kw))).length
        const score = shared / Math.max(sWords.length, kWords.length, 1)
        if (score > bestScore && score >= 0.5) { bestScore = score; bestCandidate = c }
      } catch { continue }
    }
    return bestCandidate
  }

  function getRatesForPo(rates, poField) {
    if (!poNumber) return rates
    const poRates = rates.filter(r => r.po_number === poNumber)
    return poRates.length > 0 ? poRates : rates.filter(r => !r.po_number)
  }

  function calcLabourCost(entry) {
    if (!entry?.classification || labourRates.length === 0) return 0
    const rates = getRatesForPo(labourRates)
    const rate = findBestMatch(entry.classification, rates, r => r.classification || '')
    if (!rate) return 0
    const rt = parseFloat(entry.rt || 0) || 0
    const ot = parseFloat(entry.ot || 0) || 0
    const count = parseInt(entry.count || 1) || 1
    return ((rt * (parseFloat(rate.rate_st) || 0)) + (ot * (parseFloat(rate.rate_ot) || 0))) * count
  }

  function calcEquipCost(entry) {
    if (!entry?.equipment_type || equipmentRates.length === 0) return 0
    const rates = getRatesForPo(equipmentRates)
    const rate = findBestMatch(entry.equipment_type, rates, r => r.equipment_type || '')
    if (!rate) return 0
    const hrs = parseFloat(entry.hours || 0) || 0
    const count = parseInt(entry.count || 1) || 1
    return hrs * (parseFloat(rate.rate_hourly) || 0) * count
  }

  // ── Labour table handlers ──────────────────────────────────────────
  function updateLabour(index, field, value) {
    setLabourEntries(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }
  function addLabourRow() {
    setLabourEntries(prev => [...prev, emptyLabourRow()])
  }
  function removeLabourRow(index) {
    setLabourEntries(prev => prev.length <= 1 ? [emptyLabourRow()] : prev.filter((_, i) => i !== index))
  }

  // ── Equipment table handlers ───────────────────────────────────────
  function updateEquipment(index, field, value) {
    setEquipmentEntries(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }
  function addEquipRow() {
    setEquipmentEntries(prev => [...prev, emptyEquipRow()])
  }
  function removeEquipRow(index) {
    setEquipmentEntries(prev => prev.length <= 1 ? [emptyEquipRow()] : prev.filter((_, i) => i !== index))
  }

  // ── Photo handlers ─────────────────────────────────────────────────
  function handlePhotoSelect(e) {
    const files = Array.from(e.target.files || [])
    setPhotoFiles(prev => [...prev, ...files])
  }
  function removeNewPhoto(index) {
    setPhotoFiles(prev => prev.filter((_, i) => i !== index))
  }
  function removeExistingPhoto(index) {
    setExistingPhotos(prev => prev.filter((_, i) => i !== index))
  }

  // ── Upload photos to storage ───────────────────────────────────────
  async function uploadPhotos() {
    const orgId = getOrgId()
    if (!orgId || photoFiles.length === 0) return []

    const uploaded = []
    for (const file of photoFiles) {
      const ext = file.name.split('.').pop()
      const path = `${orgId}/standalone-tickets/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('lem-uploads')
        .upload(path, file, { contentType: file.type })
      if (uploadError) {
        console.error('Photo upload failed:', uploadError)
        continue
      }
      const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(path)
      if (urlData?.publicUrl) {
        uploaded.push(urlData.publicUrl)
      }
    }
    return uploaded
  }

  // ── Audit logging ──────────────────────────────────────────────────
  async function logAudit(action, entityId, oldValue, newValue, metadata = {}) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('report_audit_log').insert({
        report_id: null,
        entity_type: 'standalone_ticket',
        entity_id: entityId,
        section: 'Standalone Tickets',
        field_name: action,
        old_value: oldValue != null ? String(oldValue) : null,
        new_value: newValue != null ? String(newValue) : null,
        action_type: action,
        change_type: editTicket ? 'edit' : 'create',
        regulatory_category: 'financial',
        is_critical: true,
        metadata: { ...metadata, module: 'standalone_tickets', user_id: user?.id },
        changed_by: user?.id,
        organization_id: getOrgId()
      })
    } catch (err) {
      console.error('Audit log error:', err)
    }
  }

  // ── Save handler ───────────────────────────────────────────────────
  async function handleSave() {
    // Validation
    if (!workDate) { setError('Work date is required.'); return }
    if (!contractorName.trim()) { setError('Contractor name is required.'); return }

    setSaving(true)
    setError(null)

    try {
      // Upload new photos
      const newPhotoUrls = await uploadPhotos()
      const allPhotoUrls = [...existingPhotos, ...newPhotoUrls]

      // Filter out empty rows
      const validLabour = labourEntries.filter(e => e.employee_name?.trim() || e.classification?.trim())
      const validEquip = equipmentEntries.filter(e => e.equipment_type?.trim())

      // Calculate costs
      const totalLabourCost = validLabour.reduce((sum, e) => sum + calcLabourCost(e), 0)
      const totalEquipCost = validEquip.reduce((sum, e) => sum + calcEquipCost(e), 0)
      const totalCost = totalLabourCost + totalEquipCost

      const record = {
        ticket_number: ticketNumber.trim() || null,
        work_date: workDate,
        contractor_name: contractorName.trim(),
        po_number: poNumber.trim() || null,
        lem_category: lemCategory,
        description: description.trim() || null,
        signed_by: signedBy.trim() || null,
        signed_role: signedRole || null,
        notes: notes.trim() || null,
        photo_urls: allPhotoUrls,
        labour_entries: validLabour,
        equipment_entries: validEquip,
        total_labour_cost: Math.round(totalLabourCost * 100) / 100,
        total_equipment_cost: Math.round(totalEquipCost * 100) / 100,
        total_cost: Math.round(totalCost * 100) / 100,
        organization_id: getOrgId()
      }

      let result
      if (editTicket?.id) {
        // Update existing
        const { data, error: updateError } = await supabase
          .from('standalone_tickets')
          .update(record)
          .eq('id', editTicket.id)
          .select()
          .single()
        if (updateError) throw updateError
        result = data
        await logAudit('ticket_update', editTicket.id, editTicket.ticket_number, ticketNumber, {
          contractor_name: contractorName,
          work_date: workDate,
          total_cost: totalCost
        })
      } else {
        // Insert new
        const { data, error: insertError } = await supabase
          .from('standalone_tickets')
          .insert(record)
          .select()
          .single()
        if (insertError) throw insertError
        result = data
        await logAudit('ticket_create', result.id, null, ticketNumber || contractorName, {
          contractor_name: contractorName,
          work_date: workDate,
          total_cost: totalCost
        })
      }

      if (onSave) onSave(result)
    } catch (err) {
      console.error('Save failed:', err)
      setError(err.message || 'Failed to save ticket.')
    } finally {
      setSaving(false)
    }
  }

  // ── Cost preview ───────────────────────────────────────────────────
  const previewLabourCost = labourEntries.reduce((s, e) => s + calcLabourCost(e), 0)
  const previewEquipCost = equipmentEntries.reduce((s, e) => s + calcEquipCost(e), 0)
  const previewTotal = previewLabourCost + previewEquipCost

  // ── Styles ─────────────────────────────────────────────────────────
  const card = {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '20px',
    marginBottom: '16px'
  }
  const sectionHeader = {
    fontSize: '14px',
    fontWeight: '700',
    color: '#1e3a5f',
    marginBottom: '12px',
    paddingBottom: '6px',
    borderBottom: '2px solid #e5e7eb'
  }
  const label = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '4px'
  }
  const input = {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    boxSizing: 'border-box'
  }
  const select = {
    ...input,
    backgroundColor: 'white'
  }
  const textarea = {
    ...input,
    minHeight: '60px',
    resize: 'vertical',
    fontFamily: 'inherit'
  }
  const fieldGroup = {
    marginBottom: '12px'
  }
  const row = {
    display: 'grid',
    gap: '12px',
    marginBottom: '12px'
  }
  const btnPrimary = {
    padding: '8px 16px',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600'
  }
  const btnSave = {
    ...btnPrimary,
    backgroundColor: saving ? '#9ca3af' : '#059669',
    cursor: saving ? 'not-allowed' : 'pointer',
    padding: '10px 24px'
  }
  const btnSecondary = {
    padding: '8px 16px',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600'
  }
  const btnDanger = {
    padding: '4px 8px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px'
  }
  const btnAdd = {
    padding: '6px 12px',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600'
  }
  const th = {
    padding: '8px 6px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#1e3a5f',
    textAlign: 'left',
    borderBottom: '2px solid #e5e7eb',
    whiteSpace: 'nowrap'
  }
  const td = {
    padding: '4px 4px',
    verticalAlign: 'middle'
  }
  const cellInput = {
    width: '100%',
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    boxSizing: 'border-box'
  }
  const cellInputNarrow = {
    ...cellInput,
    width: '70px',
    textAlign: 'right'
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#1e3a5f' }}>
          {editTicket ? 'Edit Standalone Ticket' : 'New Standalone Ticket'}
        </h2>
        {onCancel && (
          <button onClick={onCancel} style={btnSecondary}>Cancel</button>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* ── Ticket Details ─────────────────────────────────────────── */}
      <div style={card}>
        <div style={sectionHeader}>Ticket Details</div>

        <div style={{ ...row, gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div style={fieldGroup}>
            <label style={label}>Ticket Number</label>
            <input type="text" value={ticketNumber} onChange={e => setTicketNumber(e.target.value)}
              placeholder="e.g. T-0042" style={input} />
          </div>
          <div style={fieldGroup}>
            <label style={label}>Work Date *</label>
            <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)}
              required style={input} />
          </div>
          <div style={fieldGroup}>
            <label style={label}>Contractor Name *</label>
            <input type="text" value={contractorName} onChange={e => setContractorName(e.target.value)}
              placeholder="Contractor name" required style={input} />
          </div>
        </div>

        <div style={{ ...row, gridTemplateColumns: '1fr 1fr' }}>
          <div style={fieldGroup}>
            <label style={label}>PO Number</label>
            <input type="text" value={poNumber} onChange={e => setPoNumber(e.target.value)}
              placeholder="Purchase order" style={input} />
          </div>
          <div style={fieldGroup}>
            <label style={label}>LEM Category</label>
            <select value={lemCategory} onChange={e => setLemCategory(e.target.value)} style={select}>
              <option value="third_party">Third Party</option>
              <option value="direct">Direct</option>
              <option value="indirect">Indirect</option>
            </select>
          </div>
        </div>

        <div style={fieldGroup}>
          <label style={label}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Work description" style={textarea} />
        </div>

        <div style={{ ...row, gridTemplateColumns: '1fr 1fr' }}>
          <div style={fieldGroup}>
            <label style={label}>Signed By</label>
            <input type="text" value={signedBy} onChange={e => setSignedBy(e.target.value)}
              placeholder="Name of signatory" style={input} />
          </div>
          <div style={fieldGroup}>
            <label style={label}>Signed Role</label>
            <select value={signedRole} onChange={e => setSignedRole(e.target.value)} style={select}>
              <option value="">-- Select --</option>
              <option value="chief_inspector">Chief Inspector</option>
              <option value="cm">Construction Manager</option>
              <option value="pm">Project Manager</option>
            </select>
          </div>
        </div>

        <div style={fieldGroup}>
          <label style={label}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Additional notes" style={textarea} />
        </div>
      </div>

      {/* ── Ticket Photos ──────────────────────────────────────────── */}
      <div style={card}>
        <div style={sectionHeader}>Ticket Photos</div>

        {existingPhotos.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {existingPhotos.map((url, i) => (
              <div key={`existing-${i}`} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #d1d5db' }}>
                <img src={url} alt={`Ticket photo ${i + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => removeExistingPhoto(i)}
                  style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', fontSize: '10px', lineHeight: '18px', textAlign: 'center', padding: 0 }}>
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        {photoFiles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {photoFiles.map((file, i) => (
              <div key={`new-${i}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', backgroundColor: '#f0f9ff', borderRadius: '4px', border: '1px solid #bfdbfe', fontSize: '12px' }}>
                <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                <button onClick={() => removeNewPhoto(i)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', fontWeight: '700', padding: '0 2px' }}>
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        <input type="file" accept="image/*" multiple onChange={handlePhotoSelect}
          style={{ fontSize: '13px' }} />
      </div>

      {/* ── Labour Entries ─────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ ...sectionHeader, marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>Labour Entries</div>
          <button onClick={addLabourRow} style={btnAdd}>+ Add Row</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={th}>Employee Name</th>
                <th style={th}>Classification</th>
                <th style={{ ...th, textAlign: 'right' }}>RT Hrs</th>
                <th style={{ ...th, textAlign: 'right' }}>OT Hrs</th>
                <th style={{ ...th, textAlign: 'right' }}>Count</th>
                {labourRates.length > 0 && <th style={{ ...th, textAlign: 'right' }}>Est. Cost</th>}
                <th style={{ ...th, width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {labourEntries.map((entry, i) => {
                const cost = calcLabourCost(entry)
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={td}>
                      <input type="text" value={entry.employee_name} onChange={e => updateLabour(i, 'employee_name', e.target.value)}
                        placeholder="Name" style={cellInput} />
                    </td>
                    <td style={td}>
                      <input type="text" value={entry.classification} onChange={e => updateLabour(i, 'classification', e.target.value)}
                        placeholder="Classification" style={cellInput} />
                    </td>
                    <td style={td}>
                      <input type="number" step="0.5" min="0" value={entry.rt} onChange={e => updateLabour(i, 'rt', e.target.value)}
                        placeholder="0" style={cellInputNarrow} />
                    </td>
                    <td style={td}>
                      <input type="number" step="0.5" min="0" value={entry.ot} onChange={e => updateLabour(i, 'ot', e.target.value)}
                        placeholder="0" style={cellInputNarrow} />
                    </td>
                    <td style={td}>
                      <input type="number" step="1" min="1" value={entry.count} onChange={e => updateLabour(i, 'count', e.target.value)}
                        placeholder="1" style={cellInputNarrow} />
                    </td>
                    {labourRates.length > 0 && (
                      <td style={{ ...td, textAlign: 'right', fontSize: '12px', color: cost > 0 ? '#059669' : '#9ca3af', fontWeight: '600', whiteSpace: 'nowrap' }}>
                        {cost > 0 ? `$${cost.toFixed(2)}` : '--'}
                      </td>
                    )}
                    <td style={td}>
                      <button onClick={() => removeLabourRow(i)} style={btnDanger} title="Remove row">x</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Equipment Entries ──────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ ...sectionHeader, marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>Equipment Entries</div>
          <button onClick={addEquipRow} style={btnAdd}>+ Add Row</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={th}>Equipment Type</th>
                <th style={th}>Unit Number</th>
                <th style={{ ...th, textAlign: 'right' }}>Hours</th>
                <th style={{ ...th, textAlign: 'right' }}>Count</th>
                {equipmentRates.length > 0 && <th style={{ ...th, textAlign: 'right' }}>Est. Cost</th>}
                <th style={{ ...th, width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {equipmentEntries.map((entry, i) => {
                const cost = calcEquipCost(entry)
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={td}>
                      <input type="text" value={entry.equipment_type} onChange={e => updateEquipment(i, 'equipment_type', e.target.value)}
                        placeholder="Equipment type" style={cellInput} />
                    </td>
                    <td style={td}>
                      <input type="text" value={entry.unit_number} onChange={e => updateEquipment(i, 'unit_number', e.target.value)}
                        placeholder="Unit #" style={{ ...cellInput, width: '100px' }} />
                    </td>
                    <td style={td}>
                      <input type="number" step="0.5" min="0" value={entry.hours} onChange={e => updateEquipment(i, 'hours', e.target.value)}
                        placeholder="0" style={cellInputNarrow} />
                    </td>
                    <td style={td}>
                      <input type="number" step="1" min="1" value={entry.count} onChange={e => updateEquipment(i, 'count', e.target.value)}
                        placeholder="1" style={cellInputNarrow} />
                    </td>
                    {equipmentRates.length > 0 && (
                      <td style={{ ...td, textAlign: 'right', fontSize: '12px', color: cost > 0 ? '#059669' : '#9ca3af', fontWeight: '600', whiteSpace: 'nowrap' }}>
                        {cost > 0 ? `$${cost.toFixed(2)}` : '--'}
                      </td>
                    )}
                    <td style={td}>
                      <button onClick={() => removeEquipRow(i)} style={btnDanger} title="Remove row">x</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Cost Summary & Actions ─────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          {/* Cost preview */}
          <div style={{ display: 'flex', gap: '24px', fontSize: '13px' }}>
            <div>
              <span style={{ color: '#6b7280' }}>Labour: </span>
              <span style={{ fontWeight: '700', color: previewLabourCost > 0 ? '#1e3a5f' : '#9ca3af' }}>
                ${previewLabourCost.toFixed(2)}
              </span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Equipment: </span>
              <span style={{ fontWeight: '700', color: previewEquipCost > 0 ? '#1e3a5f' : '#9ca3af' }}>
                ${previewEquipCost.toFixed(2)}
              </span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Total: </span>
              <span style={{ fontWeight: '700', color: previewTotal > 0 ? '#059669' : '#9ca3af', fontSize: '14px' }}>
                ${previewTotal.toFixed(2)}
              </span>
            </div>
            {labourRates.length === 0 && equipmentRates.length === 0 && (
              <span style={{ color: '#d97706', fontSize: '11px', fontStyle: 'italic' }}>
                No rate cards loaded — costs will be $0
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {onCancel && (
              <button onClick={onCancel} style={btnSecondary}>Cancel</button>
            )}
            <button onClick={handleSave} disabled={saving} style={btnSave}>
              {saving ? 'Saving...' : editTicket ? 'Update Ticket' : 'Save Ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
