import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useOrgQuery } from '../../utils/queryHelpers.js'
import { useOrgPath } from '../../contexts/OrgContext.jsx'
import { useAuth } from '../../AuthContext.jsx'
import DocumentPanel from './DocumentPanel.jsx'

/**
 * ReconFourPanelView — 4-panel document comparison keyed by ticket_number.
 *
 * Fetches from THREE sources:
 *   1. reconciliation_documents — uploaded contractor LEM + contractor ticket
 *   2. daily_reports — inspector report data (activity_blocks with labour/equipment)
 *   3. ticket-photos bucket — inspector's ticket photo (URL resolved from the
 *      filename stored on the matched activity_block's ticketPhotos field)
 *
 * Panels:
 *   P1: Contractor LEM (uploaded)
 *   P2: Contractor Daily Ticket (uploaded)
 *   P3: Inspector Ticket Photo (auto-linked from report — NOT uploaded)
 *   P4: Inspector Report (formatted data view — NOT uploaded)
 */
export default function ReconFourPanelView({ ticketNumber: ticketProp }) {
  const params = useParams()
  const navigate = useNavigate()
  const { orgPath } = useOrgPath()
  const { organizationId, addOrgFilter } = useOrgQuery()
  const { userProfile } = useAuth()
  const isAdmin = ['admin', 'super_admin'].includes(userProfile?.role || '')
  const ticketNumber = ticketProp || params.ticketNumber

  const [uploadedDocs, setUploadedDocs] = useState([])
  const [inspectorReport, setInspectorReport] = useState(null) // daily_reports row
  const [matchedBlock, setMatchedBlock] = useState(null)       // activity block with matching ticket #
  const [ticketPhotoUrls, setTicketPhotoUrls] = useState([])   // inspector's ticket photo URLs
  const [lemData, setLemData] = useState(null)               // contractor_lems row for variance comparison
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState({ date: null, foreman: null })
  const [labourRates, setLabourRates] = useState([])
  const [equipmentRates, setEquipmentRates] = useState([])
  const [aliases, setAliases] = useState([])
  // showVariance toggle removed in 4.4.5 — panel always shows when lemData exists
  const [sameDayEntries, setSameDayEntries] = useState({ labour: [], equipment: [] })
  const [crossReportLabour, setCrossReportLabour] = useState([])
  const [crossReportEquipment, setCrossReportEquipment] = useState([])
  const [employeeRoster, setEmployeeRoster] = useState([])
  const [equipmentRoster, setEquipmentRoster] = useState([])

  useEffect(() => {
    if (ticketNumber && organizationId) loadAllData()
  }, [ticketNumber, organizationId])

  // Diagnostic logging — fires once when loadAllData() settles, so it
  // doesn't spam the console on every re-render the way the prior
  // inline-in-body version did (705435b ripped that out for noise).
  // Tied to [loading, ticketNumber]: one log per ticket load.
  useEffect(() => {
    if (loading) return
    const lemDoc = uploadedDocs.find(d => d.doc_type === 'contractor_lem') || null
    const ticketDoc = uploadedDocs.find(d => d.doc_type === 'contractor_ticket') || null
    console.log(
      `[ReconView] ticket=${ticketNumber} uploadedDocs=${uploadedDocs.length} ` +
      `panels.lem=${!!lemDoc} panels.ticket=${!!ticketDoc} ` +
      `lemData=${!!lemData} matchedBlock=${!!matchedBlock} photoUrls=${ticketPhotoUrls.length}`
    )
    if (uploadedDocs.length > 0) {
      console.log('[ReconView] uploadedDocs:', uploadedDocs.map(d => ({
        doc_type: d.doc_type,
        file_urls_len: (d.file_urls || []).length,
        id: d.id,
        organization_id: d.organization_id
      })))
    } else {
      console.log('[ReconView] uploadedDocs is empty — no reconciliation_documents rows matched ticket+org')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, ticketNumber])

  async function loadAllData() {
    setLoading(true)

    // --- Source 1: Uploaded contractor documents ---
    // ORDER BY created_at DESC so the most recent upload wins when
    // multiple rows exist for the same ticket (re-uploads, old test
    // runs, etc.). Without this, .find() below picks an arbitrary
    // match and the panel can end up showing a stale row.
    let dq = supabase.from('reconciliation_documents')
      .select('*')
      .eq('ticket_number', ticketNumber)
      .order('created_at', { ascending: false })
    dq = addOrgFilter(dq, true)
    const { data: docs } = await dq
    setUploadedDocs(docs || [])

    // --- Source 1b: Contractor LEM structured data (for variance comparison) ---
    let lq = supabase.from('contractor_lems')
      .select('*')
      .eq('field_log_id', ticketNumber)
    lq = addOrgFilter(lq, true)
    const { data: lemRows } = await lq
    setLemData(lemRows?.[0] || null)

    // --- Source 2: Inspector report matching this ticket number ---
    // Search all reports for an activity block with this ticket number
    let rq = supabase.from('daily_reports')
      .select('id, date, inspector_name, spread, activity_blocks, pdf_storage_url')
      .order('date', { ascending: false })
    rq = addOrgFilter(rq, true)
    const { data: reports } = await rq

    let foundReport = null
    let foundBlock = null

    if (reports) {
      for (const report of reports) {
        const blocks = report.activity_blocks || []
        for (const block of blocks) {
          if (block.ticketNumber && String(block.ticketNumber).trim() === String(ticketNumber).trim()) {
            foundReport = report
            foundBlock = block
            break
          }
        }
        if (foundReport) break
      }
    }

    setInspectorReport(foundReport)
    setMatchedBlock(foundBlock)

    // --- Build same-day entries from other tickets for duplicate detection ---
    const newSameDayEntries = { labour: [], equipment: [] }
    if (foundReport && foundBlock) {
      const reportDate = foundReport.date
      for (const report of (reports || [])) {
        if (report.date !== reportDate) continue
        for (const b of (report.activity_blocks || [])) {
          // Skip the current ticket's block
          if (b.ticketNumber && String(b.ticketNumber).trim() === String(ticketNumber).trim()) continue
          const otherTicket = b.ticketNumber || 'unknown'
          for (const l of (b.labourEntries || [])) {
            const name = (l.employeeName || l.employee_name || l.name || '').toLowerCase().trim()
            if (name) newSameDayEntries.labour.push({ name, ticket: otherTicket })
          }
          for (const e of (b.equipmentEntries || [])) {
            const type = (e.type || e.equipment_type || '').toLowerCase().trim()
            const unit = (e.unitNumber || e.unit_number || '').toLowerCase().trim()
            if (type) newSameDayEntries.equipment.push({ type, unit, ticket: otherTicket })
          }
        }
      }
    }
    setSameDayEntries(newSameDayEntries)

    // --- Build cross-report entries (same date, different report) ---
    // Used by InspectorReportPanel to surface "Also reported by X on Y"
    // when the same name / unit appears in another inspector's report
    // for the same date. The org scoping is already enforced by the
    // reports query above, so this is implicitly same-project.
    const newCrossReportLabour = []
    const newCrossReportEquipment = []
    if (foundReport && reports) {
      const reportDate = foundReport.date
      for (const report of reports) {
        if (report.id === foundReport.id) continue
        if (report.date !== reportDate) continue
        const inspector = report.inspector_name || 'unknown'
        for (const b of (report.activity_blocks || [])) {
          const ticket_number = b.ticketNumber ? String(b.ticketNumber).trim() : null
          // Pre-resolve the ticket photo URL so the panel can show a
          // popup without needing supabase access. ticketPhotos[] is
          // the modern array shape; legacy reports stored a single
          // ticketPhoto string. Already-http URLs (e.g. from older
          // direct-uploads) pass through unchanged.
          const photoFile = (b.ticketPhotos?.[0]) || b.ticketPhoto || null
          let ticket_photo_url = null
          if (photoFile) {
            ticket_photo_url = typeof photoFile === 'string' && photoFile.startsWith('http')
              ? photoFile
              : supabase.storage.from('ticket-photos').getPublicUrl(photoFile)?.data?.publicUrl || null
          }
          for (const l of (b.labourEntries || [])) {
            const name = (l.employeeName || l.employee_name || l.name || '').toLowerCase().trim()
            if (name) newCrossReportLabour.push({ name, inspector, date: report.date, ticket_number, ticket_photo_url })
          }
          for (const e of (b.equipmentEntries || [])) {
            const unit = (e.unitNumber || e.unit_number || '').toLowerCase().trim()
            if (unit) newCrossReportEquipment.push({ unit, inspector, date: report.date, ticket_number, ticket_photo_url })
          }
        }
      }
    }
    setCrossReportLabour(newCrossReportLabour)
    setCrossReportEquipment(newCrossReportEquipment)

    // --- Build employee roster from uploaded CSV + daily reports ---
    const rosterMap = {}
    // Load from personnel_roster table first (CSV upload — takes priority)
    try {
      let pq = supabase.from('personnel_roster').select('id, employee_name, classification, rate_subs_override')
      pq = addOrgFilter(pq, true)
      const { data: pData } = await pq
      for (const r of (pData || [])) {
        const name = (r.employee_name || '').trim()
        const cls = (r.classification || '').trim()
        if (name && cls) rosterMap[name.toUpperCase()] = { employeeName: name, classification: cls, masterId: r.id, rateSubsOverride: r.rate_subs_override }
      }
    } catch (e) { console.warn('personnel_roster not available:', e) }
    // Supplement with daily_reports data
    for (const report of (reports || [])) {
      for (const b of (report.activity_blocks || [])) {
        for (const l of (b.labourEntries || [])) {
          const name = (l.employeeName || l.employee_name || l.name || '').trim()
          const cls = (l.classification || '').trim()
          if (name && cls && !rosterMap[name.toUpperCase()]) {
            rosterMap[name.toUpperCase()] = { employeeName: name, classification: cls }
          }
        }
      }
    }
    setEmployeeRoster(Object.values(rosterMap).sort((a, b) => a.employeeName.localeCompare(b.employeeName)))

    // --- Build equipment roster from equipment_fleet table ---
    const equipMap = {}
    try {
      let eq = supabase.from('equipment_fleet').select('id, unit_number, equipment_type')
      eq = addOrgFilter(eq, true)
      const { data: eData } = await eq
      for (const r of (eData || [])) {
        const unit = (r.unit_number || '').trim()
        const type = (r.equipment_type || '').trim()
        if (unit) equipMap[unit.toUpperCase()] = { unitNumber: unit, equipmentType: type, masterId: r.id }
      }
    } catch (e) { console.warn('equipment_fleet not available:', e) }
    setEquipmentRoster(Object.values(equipMap).sort((a, b) => a.unitNumber.localeCompare(b.unitNumber)))

    // --- Source 3: Inspector's ticket photo from the matched block ---
    if (foundBlock) {
      const photos = foundBlock.ticketPhotos?.length > 0
        ? foundBlock.ticketPhotos
        : foundBlock.ticketPhoto ? [foundBlock.ticketPhoto] : []

      const urls = photos.filter(Boolean).map(p => {
        if (typeof p === 'string' && p.startsWith('http')) return p
        if (typeof p === 'string') {
          const { data } = supabase.storage.from('ticket-photos').getPublicUrl(p)
          return data?.publicUrl || null
        }
        return null
      }).filter(Boolean)

      setTicketPhotoUrls(urls)
    } else {
      setTicketPhotoUrls([])
    }

    // Metadata for header
    const docWithDate = (docs || []).find(d => d.date)
    setMeta({
      date: foundReport?.date || docWithDate?.date || null,
      foreman: foundBlock?.foreman || (docs || []).find(d => d.foreman)?.foreman || null
    })

    // --- Load rate cards ---
    try {
      const lr = await fetch(`/api/rates?table=labour_rates&organization_id=${organizationId}`)
      if (lr.ok) { const d = await lr.json(); if (Array.isArray(d)) setLabourRates(d) }
      const er = await fetch(`/api/rates?table=equipment_rates&organization_id=${organizationId}`)
      if (er.ok) { const d = await er.json(); if (Array.isArray(d)) setEquipmentRates(d) }
    } catch (e) { console.error('Failed to load rate cards:', e) }

    // --- Load learned aliases ---
    try {
      let aq = supabase.from('classification_aliases').select('*')
      aq = addOrgFilter(aq, true)
      const { data: aliasRows } = await aq
      setAliases(aliasRows || [])
    } catch (e) { console.error('Failed to load aliases:', e) }

    setLoading(false)
  }

  // Organize uploaded docs by type.
  //
  // PREFERENCE ORDER per slot:
  //   1. New-format bulk uploads — file_urls is a list of per-page
  //      JPEGs (multiple URLs, none ending in .pdf). Each row
  //      contains ONLY the pages assigned to it during bulk-upload
  //      sorting, so the panel shows just this ticket's pages.
  //   2. Legacy single-doc uploads — file_urls is one URL, an image
  //      OR a single-document PDF (the row IS the whole document).
  //   3. Legacy bulk uploads — file_urls is [sourcePdfUrl] (a PDF),
  //      containing every page of the shared bulk upload. The
  //      iframe shows the whole PDF; not great, but kept as a
  //      visible fallback until the admin re-bulk-uploads.
  //
  // Within a preference tier, the query above sorts by created_at
  // DESC so the newest matching row wins.
  const isJpegRow = (d) => Array.isArray(d?.file_urls)
    && d.file_urls.length > 0
    && d.file_urls.every(u => typeof u === 'string' && !u.split('?')[0].toLowerCase().endsWith('.pdf'))
  const pickPanelDoc = (docType) => {
    const matches = uploadedDocs.filter(d => d.doc_type === docType)
    if (matches.length === 0) return null
    return matches.find(isJpegRow) || matches[0]
  }
  const panels = {
    lem: pickPanelDoc('contractor_lem'),
    ticket: pickPanelDoc('contractor_ticket'),
  }

  // Build photo panel data (auto-linked, not uploaded)
  const photoPanel = ticketPhotoUrls.length > 0
    ? { file_urls: ticketPhotoUrls, page_count: ticketPhotoUrls.length }
    : null

  // Build report panel data
  const reportPanel = inspectorReport && matchedBlock
    ? { report: inspectorReport, block: matchedBlock }
    : null

  function handleUpload(docType) {
    navigate(orgPath(`/reconciliation/upload?ticket=${ticketNumber}&type=${docType}`))
  }

  // Count how many panels are populated
  const panelCount = [panels.lem, panels.ticket, photoPanel, reportPanel].filter(Boolean).length

  // Package-level reconciled state — true when every contractor doc
  // for this ticket has reconciled=true. Zero-docs → not reconciled
  // (nothing to reconcile yet).
  const allDocsReconciled = uploadedDocs.length > 0 && uploadedDocs.every(d => d.reconciled)
  const reconciledMeta = uploadedDocs.find(d => d.reconciled)
  const [markingReconciled, setMarkingReconciled] = useState(false)

  // Ticket-number correction (admin-only OCR-misread fix)
  const [editingTicket, setEditingTicket] = useState(false)
  const [ticketEditValue, setTicketEditValue] = useState('')
  const [ticketReasonValue, setTicketReasonValue] = useState('')
  const [savingTicket, setSavingTicket] = useState(false)

  async function saveTicketNumberCorrection() {
    if (savingTicket) return
    const newTicket = (ticketEditValue || '').trim()
    const reason = (ticketReasonValue || '').trim()
    if (!newTicket) { alert('New ticket number is required.'); return }
    if (newTicket === String(ticketNumber).trim()) { alert('New ticket number is the same as the old one.'); return }
    if (!reason) { alert('Please enter a reason for the correction.'); return }

    setSavingTicket(true)
    try {
      const { data: { user } = {} } = await supabase.auth.getUser()
      const actor = user?.email || user?.id || 'admin'
      const at = new Date().toISOString()
      const date = meta.date || inspectorReport?.date || null

      // 1. reconciliation_documents — every doc row for this package.
      // Scoped by (org, ticket_number, date) so a same-numbered ticket
      // from a different day can't be hit by accident.
      let rdQ = supabase.from('reconciliation_documents')
        .update({ ticket_number: newTicket })
        .eq('ticket_number', ticketNumber)
      if (organizationId) rdQ = rdQ.eq('organization_id', organizationId)
      if (date) rdQ = rdQ.eq('date', date)
      const { error: rdErr, count: rdCount } = await rdQ.select('id', { count: 'exact' })
      if (rdErr) { console.error('reconciliation_documents update failed:', rdErr); alert('Update failed (reconciliation_documents): ' + rdErr.message); return }

      // 2. contractor_lems — keyed by field_log_id, not ticket_number.
      let clQ = supabase.from('contractor_lems')
        .update({ field_log_id: newTicket })
        .eq('field_log_id', ticketNumber)
      if (organizationId) clQ = clQ.eq('organization_id', organizationId)
      if (date) clQ = clQ.eq('date', date)
      const { error: clErr, count: clCount } = await clQ.select('id', { count: 'exact' })
      if (clErr) { console.error('contractor_lems update failed:', clErr); alert('Partial save — contractor_lems failed: ' + clErr.message); return }

      // 3. document_matches — only when an auto-match was recorded for
      // this ticket. No date filter; match_method='ticket_number'
      // identifies the right rows.
      let dmQ = supabase.from('document_matches')
        .update({ match_key: newTicket })
        .eq('match_method', 'ticket_number')
        .eq('match_key', ticketNumber)
      if (organizationId) dmQ = dmQ.eq('organization_id', organizationId)
      const { error: dmErr, count: dmCount } = await dmQ.select('id', { count: 'exact' })
      if (dmErr) { console.error('document_matches update failed:', dmErr); /* not fatal */ }

      // 4. Audit row — tied to the inspector report when one exists.
      if (inspectorReport?.id) {
        const { error: auErr } = await supabase.from('report_audit_log').insert({
          report_id: inspectorReport.id,
          report_date: inspectorReport.date,
          changed_by_name: 'Cost Control',
          changed_by_role: 'admin',
          change_type: 'ticket_number_correction',
          change_reason: reason,
          section: 'Reconciliation Panel',
          field_name: 'ticket_number',
          old_value: String(ticketNumber),
          new_value: newTicket,
          organization_id: organizationId,
        })
        if (auErr) console.warn('Audit insert failed (non-fatal):', auErr)
      }

      console.log(`[ticket correction] ${ticketNumber} → ${newTicket} by ${actor} @ ${at} | rd=${rdCount} cl=${clCount} dm=${dmCount}`)

      // 5. Navigate to the new URL — the panel route is keyed by
      // ticket number so a refresh on the old path would show empty.
      setEditingTicket(false)
      setTicketEditValue('')
      setTicketReasonValue('')
      navigate(orgPath(`/reconciliation/${encodeURIComponent(newTicket)}`))
    } finally {
      setSavingTicket(false)
    }
  }

  async function markAsReconciled() {
    if (markingReconciled) return
    if (uploadedDocs.length === 0) {
      alert('No contractor docs uploaded for this ticket — nothing to reconcile yet.')
      return
    }
    setMarkingReconciled(true)
    try {
      const { data: { user } = {} } = await supabase.auth.getUser()
      const reconciledBy = user?.email || user?.id || 'admin'
      const reconciledAt = new Date().toISOString()

      // Update every reconciliation_documents row for this ticket so
      // the package toggles as a whole. Org-scoped to be safe.
      let updateQ = supabase.from('reconciliation_documents')
        .update({ reconciled: true, reconciled_at: reconciledAt, reconciled_by: reconciledBy })
        .eq('ticket_number', ticketNumber)
      if (organizationId) updateQ = updateQ.eq('organization_id', organizationId)
      const { error: updErr } = await updateQ
      if (updErr) { console.error('Mark reconciled failed:', updErr); alert('Failed to mark reconciled: ' + updErr.message); return }

      // Audit log — only write when we have an inspector report id
      // to associate the event with.
      if (inspectorReport?.id) {
        await supabase.from('report_audit_log').insert({
          report_id: inspectorReport.id,
          report_date: inspectorReport.date,
          changed_by_name: 'Cost Control',
          changed_by_role: 'admin',
          change_type: 'mark_reconciled',
          section: 'Reconciliation Panel',
          field_name: `ticket:${ticketNumber}.reconciled`,
          old_value: 'false',
          new_value: `true (by ${reconciledBy} at ${reconciledAt})`,
          organization_id: organizationId,
        })
      }

      // Reload so the badge flips and reconciledMeta carries the new row.
      await loadAllData()
    } finally {
      setMarkingReconciled(false)
    }
  }

  // Reverse of markAsReconciled. Flips reconciled back to false on
  // every doc row for the ticket, clears the audit columns, and logs
  // change_type='unmark_reconciled' so the reversal is traceable.
  // Same route gating as the rest of the panel — no extra role check
  // here; App.jsx routing already restricts who can see this view.
  async function unmarkReconciled() {
    if (markingReconciled) return
    if (!confirm('Unmark this package as reconciled? It will go back to red on the package list.')) return
    setMarkingReconciled(true)
    try {
      const { data: { user } = {} } = await supabase.auth.getUser()
      const actor = user?.email || user?.id || 'admin'
      const at = new Date().toISOString()

      let updateQ = supabase.from('reconciliation_documents')
        .update({ reconciled: false, reconciled_at: null, reconciled_by: null })
        .eq('ticket_number', ticketNumber)
      if (organizationId) updateQ = updateQ.eq('organization_id', organizationId)
      const { error: updErr } = await updateQ
      if (updErr) { console.error('Unmark reconciled failed:', updErr); alert('Failed to unmark: ' + updErr.message); return }

      if (inspectorReport?.id) {
        const prevBy = reconciledMeta?.reconciled_by || 'unknown'
        const prevAt = reconciledMeta?.reconciled_at || 'unknown'
        await supabase.from('report_audit_log').insert({
          report_id: inspectorReport.id,
          report_date: inspectorReport.date,
          changed_by_name: 'Cost Control',
          changed_by_role: 'admin',
          change_type: 'unmark_reconciled',
          section: 'Reconciliation Panel',
          field_name: `ticket:${ticketNumber}.reconciled`,
          old_value: `true (was by ${prevBy} at ${prevAt})`,
          new_value: `false (reverted by ${actor} at ${at})`,
          organization_id: organizationId,
        })
      }

      await loadAllData()
    } finally {
      setMarkingReconciled(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading documents for ticket #{ticketNumber}...</div>
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate(orgPath('/reconciliation'))}
            style={{ padding: '6px 12px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
          >
            &larr; Back
          </button>
          <div>
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#1e3a5f' }}>Ticket #{ticketNumber}</span>
            {isAdmin && !editingTicket && (
              <button
                onClick={() => { setEditingTicket(true); setTicketEditValue(String(ticketNumber)); setTicketReasonValue('') }}
                title="Correct an OCR-misread ticket number (admin only)"
                style={{ marginLeft: 6, padding: '2px 6px', fontSize: 12, color: '#6b7280', background: 'transparent', border: '1px solid transparent', borderRadius: 3, cursor: 'pointer' }}
              >&#9998;</button>
            )}
            {inspectorReport?.id && <span style={{ marginLeft: '10px', fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>Report #{inspectorReport.id}</span>}
            {meta.foreman && <span style={{ marginLeft: '12px', fontSize: '14px', color: '#6b7280' }}>{meta.foreman}</span>}
            {meta.date && <span style={{ marginLeft: '12px', fontSize: '14px', color: '#6b7280' }}>{meta.date}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {allDocsReconciled ? (
            <>
              <span
                title={reconciledMeta?.reconciled_at
                  ? `Reconciled by ${reconciledMeta.reconciled_by || 'admin'} on ${new Date(reconciledMeta.reconciled_at).toLocaleString()}`
                  : 'Reconciled'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 4,
                  backgroundColor: '#047857', color: 'white',
                  fontSize: 13, fontWeight: 600, cursor: 'default',
                }}
              >
                &#10003; Reconciled
                {reconciledMeta?.reconciled_by && (
                  <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.9 }}>
                    · {reconciledMeta.reconciled_by}
                    {reconciledMeta.reconciled_at && ` · ${new Date(reconciledMeta.reconciled_at).toLocaleDateString()}`}
                  </span>
                )}
              </span>
              <button
                onClick={unmarkReconciled}
                disabled={markingReconciled}
                title="Undo — flip this package back to unreconciled"
                style={{
                  padding: '6px 10px', borderRadius: 4,
                  backgroundColor: 'white', color: '#047857',
                  border: '1px solid #047857',
                  cursor: markingReconciled ? 'not-allowed' : 'pointer',
                  fontSize: 12, fontWeight: 600,
                }}
              >
                {markingReconciled ? '…' : '↶ Undo'}
              </button>
            </>
          ) : (
            <button
              onClick={markAsReconciled}
              disabled={markingReconciled || uploadedDocs.length === 0}
              title={uploadedDocs.length === 0
                ? 'Upload at least one contractor doc (LEM or daily ticket) before marking reconciled'
                : 'Mark this reconciliation package as complete'}
              style={{
                padding: '6px 12px', borderRadius: 4,
                backgroundColor: uploadedDocs.length === 0 ? '#9ca3af' : '#059669',
                color: 'white', border: 'none',
                cursor: (markingReconciled || uploadedDocs.length === 0) ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >
              {markingReconciled ? 'Marking…' : 'Mark as Reconciled'}
            </button>
          )}
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            {panelCount} of 4 panels populated
          </span>
        </div>
      </div>

      {/* Ticket-number correction (admin) — inline form, only shows
          when the pencil has been clicked. Updates reconciliation_documents
          + contractor_lems + document_matches in sequence, writes an
          audit row, then navigates to the new ticket URL so the panel
          reloads against the corrected key. */}
      {editingTicket && (
        <div style={{
          padding: '12px 14px', backgroundColor: '#fffbeb',
          border: '1px solid #fde68a', borderRadius: 6,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>
            Correct ticket number — OCR misread fix
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: '#374151', minWidth: 90 }}>New ticket #:</label>
            <input
              autoFocus
              type="text"
              value={ticketEditValue}
              onChange={ev => setTicketEditValue(ev.target.value)}
              placeholder="e.g. 18295"
              disabled={savingTicket}
              style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 4, minWidth: 140 }}
            />
            <span style={{ fontSize: 11, color: '#6b7280' }}>(was: <strong>{ticketNumber}</strong>)</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: '#374151', minWidth: 90 }}>Reason:</label>
            <input
              type="text"
              value={ticketReasonValue}
              onChange={ev => setTicketReasonValue(ev.target.value)}
              onKeyDown={ev => {
                if (ev.key === 'Enter') { ev.preventDefault(); saveTicketNumberCorrection() }
                if (ev.key === 'Escape') { setEditingTicket(false); setTicketEditValue(''); setTicketReasonValue('') }
              }}
              placeholder="e.g. OCR misread — original document shows 18295"
              disabled={savingTicket}
              style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 4, flex: 1, minWidth: 320 }}
            />
            <button
              onClick={saveTicketNumberCorrection}
              disabled={savingTicket}
              style={{
                padding: '6px 14px', backgroundColor: savingTicket ? '#9ca3af' : '#b45309', color: 'white',
                border: 'none', borderRadius: 4, cursor: savingTicket ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >{savingTicket ? 'Saving…' : 'Save'}</button>
            <button
              onClick={() => { setEditingTicket(false); setTicketEditValue(''); setTicketReasonValue('') }}
              disabled={savingTicket}
              style={{
                padding: '6px 12px', backgroundColor: 'white', color: '#6b7280',
                border: '1px solid #6b7280', borderRadius: 4, cursor: savingTicket ? 'not-allowed' : 'pointer',
                fontSize: 13,
              }}
            >Cancel</button>
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            Will update reconciliation_documents, contractor_lems, and document_matches.
            An audit row is written to report_audit_log with the reason above.
          </div>
        </div>
      )}

      {/* 4-panel grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {/* Panel 1: Contractor LEM (uploaded) */}
        <DocumentPanel
          title="Contractor LEM"
          subtitle="What they're billing"
          panelType="uploaded"
          document={panels.lem}
          emptyMessage="No LEM uploaded for this ticket"
          onUpload={() => handleUpload('contractor_lem')}
          color="#d97706"
          defaultRotation={270}
        />

        {/* Panel 2: Inspector Report (formatted data view — NOT uploaded) */}
        <DocumentPanel
          title="Inspector Report"
          subtitle="Manpower & equipment costs"
          panelType="report"
          reportData={reportPanel}
          emptyMessage="No inspector report found for this ticket number"
          color="#059669"
          labourRates={labourRates}
          equipmentRates={equipmentRates}
          aliases={aliases}
          organizationId={organizationId}
          sameDayEntries={sameDayEntries}
          crossReportLabour={crossReportLabour}
          crossReportEquipment={crossReportEquipment}
          employeeRoster={employeeRoster}
          equipmentRoster={equipmentRoster}
          lemData={lemData}
          reportDate={inspectorReport?.date}
          hasLemPdf={!!panels.lem}
          lemPdfUrls={panels.lem?.file_urls || []}
          onLemExtracted={() => loadAllData()}
          onBlockChange={async (updatedBlock, auditEntries) => {
            if (!inspectorReport) return
            const blocks = [...(inspectorReport.activity_blocks || [])]
            const blockIdx = blocks.findIndex(b =>
              b.ticketNumber && String(b.ticketNumber).trim() === String(ticketNumber).trim()
            )
            if (blockIdx >= 0) {
              blocks[blockIdx] = updatedBlock
              // Update UI immediately — don't wait for DB save
              setMatchedBlock(updatedBlock)
              setInspectorReport(prev => ({ ...prev, activity_blocks: blocks }))
              // Save to DB and audit log in background
              supabase.from('daily_reports')
                .update({ activity_blocks: blocks })
                .eq('id', inspectorReport.id)
                .then(() => {
                  for (const entry of (auditEntries || [])) {
                    supabase.from('report_audit_log').insert({
                      report_id: inspectorReport.id,
                      report_date: inspectorReport.date,
                      changed_by_name: 'Cost Control',
                      changed_by_role: 'admin',
                      // Honor entry.change_type when the child set one
                      // (e.g. 'manual_match_confirm' from confirmMatch).
                      // Fall back to the generic reconciliation_edit tag.
                      change_type: entry.change_type || 'reconciliation_edit',
                      section: 'Inspector Report Panel',
                      field_name: entry.field,
                      old_value: String(entry.oldValue),
                      new_value: String(entry.newValue),
                      organization_id: organizationId
                    })
                  }
                })
                .catch(err => console.error('Failed to save edit:', err))
            }
          }}
          onAliasCreated={(alias) => setAliases(prev => [...prev, alias])}
        />

        {/* Panel 3: Contractor Daily Ticket (uploaded) */}
        <DocumentPanel
          title="Contractor Daily Ticket"
          subtitle="Foreman-signed timesheet"
          panelType="uploaded"
          document={panels.ticket}
          emptyMessage="No daily ticket uploaded for this ticket"
          onUpload={() => handleUpload('contractor_ticket')}
          color="#dc2626"
          defaultRotation={270}
        />

        {/* Panel 4: Inspector Ticket Photo (auto-linked from report — NOT uploaded) */}
        <DocumentPanel
          title="Inspector Ticket Photo"
          subtitle="Photo from inspector app"
          panelType="photo"
          document={photoPanel}
          emptyMessage="No ticket photo found in inspector reports for this ticket number"
          color="#374151"
        />
      </div>

      {/* Variance panel removed in M.1 — variance info now lives in Panel 2 (InspectorReportPanel) */}
    </div>
  )
}
