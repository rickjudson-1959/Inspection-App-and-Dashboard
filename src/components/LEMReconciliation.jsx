import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { useOrgPath } from '../contexts/OrgContext.jsx'
import LEMUpload from './LEMUpload.jsx'
import LEMFourPanelView from './LEMFourPanelView.jsx'
import InvoiceUpload from './InvoiceUpload.jsx'
import InvoiceComparison from './InvoiceComparison.jsx'

export default function LEMReconciliation({ refreshTrigger } = {}) {
  const { addOrgFilter, getOrgId, organizationId } = useOrgQuery()
  const navigate = useNavigate()
  const { orgPath } = useOrgPath()
  const [lemUploads, setLemUploads] = useState([])
  const [selectedLem, setSelectedLem] = useState(null)
  const [pairs, setPairs] = useState([])
  const [selectedPairIndex, setSelectedPairIndex] = useState(0)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [poFilter, setPoFilter] = useState('') // PO number filter

  // Inspector reports + rate cards
  const [subView, setSubView] = useState('inspectorReports')
  const [reports, setReports] = useState([])
  const [labourRates, setLabourRates] = useState([])
  const [equipmentRates, setEquipmentRates] = useState([])
  const [dateRange, setDateRange] = useState('60')
  const [standaloneTickets, setStandaloneTickets] = useState([])

  useEffect(() => { loadLemUploads(); loadReportsAndRates(); loadStandaloneTickets() }, [organizationId])
  useEffect(() => { loadReportsAndRates() }, [dateRange])
  // Allow parent to trigger a refresh via prop change
  useEffect(() => { if (refreshTrigger) { loadLemUploads(); loadReportsAndRates() } }, [refreshTrigger])
  // When a LEM is selected, also load reports matching its date range
  useEffect(() => { if (selectedLem) loadReportsForLem(selectedLem) }, [selectedLem])

  // Poll for background image uploads: if any pair has empty image URLs, re-fetch every 3s
  const pairsNeedingImages = pairs.filter(p =>
    (p.lem_page_indices?.length > 0 && (!p.lem_page_urls || p.lem_page_urls.length === 0)) ||
    (p.contractor_ticket_indices?.length > 0 && (!p.contractor_ticket_urls || p.contractor_ticket_urls.length === 0))
  ).length
  useEffect(() => {
    if (!selectedLem || pairsNeedingImages === 0) return
    console.log(`[LEM Recon] ${pairsNeedingImages} pair(s) awaiting images — polling...`)
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('lem_reconciliation_pairs')
        .select('*')
        .eq('lem_upload_id', selectedLem.id)
        .order('pair_index')
      if (data) setPairs(data)
    }, 3000)
    return () => clearInterval(interval)
  }, [selectedLem?.id, pairsNeedingImages])

  async function loadReportsAndRates() {
    const orgId = getOrgId()
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    let rq = supabase.from('daily_reports').select('id, date, inspector_name, activity_blocks, pdf_storage_url')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false })
    rq = addOrgFilter(rq, true)
    const { data: reportData } = await rq
    setReports(reportData || [])

    if (orgId) {
      try {
        const lr = await fetch(`/api/rates?table=labour_rates&organization_id=${orgId}`)
        if (lr.ok) { const d = await lr.json(); if (Array.isArray(d)) setLabourRates(d) }
        const er = await fetch(`/api/rates?table=equipment_rates&organization_id=${orgId}`)
        if (er.ok) { const d = await er.json(); if (Array.isArray(d)) setEquipmentRates(d) }
      } catch (e) { /* rate cards optional */ }
    }
  }

  // Load reports that match the selected LEM's date range (for older LEMs outside the default window)
  async function loadReportsForLem(lem) {
    console.log(`[LEM Reports] loadReportsForLem: lem_period_start=${lem?.lem_period_start}, lem_period_end=${lem?.lem_period_end}`)
    if (!lem?.lem_period_start && !lem?.lem_period_end) {
      // No date range on LEM — try loading reports matching pair dates instead
      const { data: pairData } = await supabase
        .from('lem_reconciliation_pairs')
        .select('work_date')
        .eq('lem_upload_id', lem.id)
        .not('work_date', 'is', null)
      if (!pairData || pairData.length === 0) {
        console.log(`[LEM Reports] No pair dates found for lem ${lem.id}`)
        return
      }
      const dates = [...new Set(pairData.map(p => p.work_date))].sort()
      if (dates.length === 0) return
      const minDate = dates[0]
      const maxDate = dates[dates.length - 1]
      console.log(`[LEM Reports] Pair date range: ${minDate} to ${maxDate}`)
      // Skip if dates are within the current range
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - parseInt(dateRange))
      if (new Date(minDate) >= cutoff) {
        console.log(`[LEM Reports] Dates within current range (cutoff=${cutoff.toISOString().split('T')[0]}), skipping extra load`)
        return
      }
      console.log(`[LEM Reports] Dates BEFORE cutoff — loading extra reports ${minDate} to ${maxDate}`)
      let rq = supabase.from('daily_reports').select('id, date, inspector_name, activity_blocks, pdf_storage_url')
        .gte('date', minDate)
        .lte('date', maxDate)
        .order('date', { ascending: false })
      rq = addOrgFilter(rq, true)
      const { data: extraReports } = await rq
      console.log(`[LEM Reports] Found ${extraReports?.length || 0} extra reports`)
      if (extraReports && extraReports.length > 0) {
        setReports(prev => {
          const existingIds = new Set(prev.map(r => r.id))
          const newReports = extraReports.filter(r => !existingIds.has(r.id))
          console.log(`[LEM Reports] Adding ${newReports.length} new reports (${existingIds.size} already loaded)`)
          return newReports.length > 0 ? [...prev, ...newReports] : prev
        })
      }
      return
    }
    // Use the LEM's period dates
    const start = lem.lem_period_start
    const end = lem.lem_period_end || start
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - parseInt(dateRange))
    if (new Date(start) >= cutoff) return // already covered
    let rq = supabase.from('daily_reports').select('id, date, inspector_name, activity_blocks, pdf_storage_url')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
    rq = addOrgFilter(rq, true)
    const { data: extraReports } = await rq
    if (extraReports && extraReports.length > 0) {
      setReports(prev => {
        const existingIds = new Set(prev.map(r => r.id))
        const newReports = extraReports.filter(r => !existingIds.has(r.id))
        return newReports.length > 0 ? [...prev, ...newReports] : prev
      })
    }
  }

  // Cache for fuzzy match results
  const matchCacheRef = useRef(new Map())
  const rateKeyRef = useRef('')
  const rateKey = `${labourRates.length}-${equipmentRates.length}`
  if (rateKey !== rateKeyRef.current) { matchCacheRef.current = new Map(); rateKeyRef.current = rateKey }
  const matchCache = matchCacheRef.current

  function findBestMatch(search, candidates, keyFn) {
    const cacheKey = (search || '') + '|' + candidates.length
    if (matchCache.has(cacheKey)) return matchCache.get(cacheKey)
    function cache(result) { matchCache.set(cacheKey, result); return result }
    if (!search || !candidates || candidates.length === 0) return cache(null)
    const s = (typeof search === 'string' ? search : String(search)).toLowerCase().trim()
    if (!s) return cache(null)
    let match = candidates.find(c => { try { return (keyFn(c) || '').toLowerCase().trim() === s } catch { return false } })
    if (match) return cache(match)
    match = candidates.find(c => {
      try { const k = (keyFn(c) || '').toLowerCase().trim(); return k && (k.includes(s) || s.includes(k)) } catch { return false }
    })
    if (match) return cache(match)
    const sWords = s.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean)
    if (sWords.length === 0) return cache(null)
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
    return cache(bestCandidate)
  }

  // Get rates filtered by PO — prefer PO-specific rates, fall back to rates with no PO
  function getLabourRatesForPo(po) {
    if (!po) return labourRates
    const poRates = labourRates.filter(r => r.po_number === po)
    return poRates.length > 0 ? poRates : labourRates.filter(r => !r.po_number)
  }
  function getEquipRatesForPo(po) {
    if (!po) return equipmentRates
    const poRates = equipmentRates.filter(r => r.po_number === po)
    return poRates.length > 0 ? poRates : equipmentRates.filter(r => !r.po_number)
  }

  function calcLabourCost(entry, po) {
    try {
      if (!entry || !entry.classification || labourRates.length === 0) return 0
      const rates = getLabourRatesForPo(po)
      const rate = findBestMatch(entry.classification, rates, r => r.classification || '')
      if (!rate) return 0
      const rt = parseFloat(entry.rt || entry.hours || 0) || 0
      const ot = parseFloat(entry.ot || 0) || 0
      return (rt * (parseFloat(rate.rate_st) || 0)) + (ot * (parseFloat(rate.rate_ot) || 0))
    } catch { return 0 }
  }

  function calcEquipCost(entry, po) {
    try {
      if (!entry || equipmentRates.length === 0) return 0
      const eqType = entry.type || entry.equipmentType || ''
      if (!eqType) return 0
      const rates = getEquipRatesForPo(po)
      const rate = findBestMatch(eqType, rates, r => r.equipment_type || '')
      if (!rate) return 0
      const hrs = parseFloat(entry.hours || 0) || 0
      return hrs * (parseFloat(rate.rate_hourly) || 0)
    } catch { return 0 }
  }

  // Build ticket-level summary from all reports
  function getTicketSummaries() {
    try {
      const tickets = []
      for (const report of reports) {
        const blocks = report.activity_blocks || []
        blocks.forEach((block, blockIdx) => {
          const labour = block.labourEntries || []
          const equip = block.equipmentEntries || []
          // Skip blocks with no activity data at all
          if (!block.activityType && labour.length === 0 && equip.length === 0) return
          const totalLabourHrs = labour.reduce((s, e) => s + (parseFloat(e.rt || e.hours || 0)) + (parseFloat(e.ot || 0)), 0)
          const totalEquipHrs = equip.reduce((s, e) => s + (parseFloat(e.hours || 0)) * (parseInt(e.count || 1)), 0)
          const totalLabourCost = labour.reduce((s, e) => s + calcLabourCost(e) * (parseInt(e.count || 1)), 0)
          const totalEquipCost = equip.reduce((s, e) => s + calcEquipCost(e) * (parseInt(e.count || 1)), 0)
          const unmatchedLabour = labour.filter(e => calcLabourCost(e) === 0).length
          const unmatchedEquip = equip.filter(e => calcEquipCost(e) === 0).length

          const photoEntries = block.ticketPhotos?.length > 0 ? block.ticketPhotos : block.ticketPhoto ? [block.ticketPhoto] : []
          const photoUrls = photoEntries.filter(Boolean).map(p => {
            if (typeof p === 'string' && p.startsWith('http')) return p
            if (typeof p === 'string') return supabase.storage.from('ticket-photos').getPublicUrl(p).data?.publicUrl
            return null
          }).filter(Boolean)

          tickets.push({
            reportId: report.id, date: report.date, inspector: report.inspector_name,
            ticketNumber: block.ticketNumber || '', activityType: block.activityType || '-',
            contractor: block.contractor || '-', foreman: block.foreman || '-',
            labourCount: labour.length, equipCount: equip.length,
            totalLabourHrs: Math.round(totalLabourHrs * 10) / 10,
            totalEquipHrs: Math.round(totalEquipHrs * 10) / 10,
            totalLabourCost: Math.round(totalLabourCost * 100) / 100,
            totalEquipCost: Math.round(totalEquipCost * 100) / 100,
            totalCost: Math.round((totalLabourCost + totalEquipCost) * 100) / 100,
            unmatchedRates: unmatchedLabour + unmatchedEquip,
            blockIdx, photoUrls
          })
        })
      }
      return tickets
    } catch (err) { console.error('getTicketSummaries error:', err); return [] }
  }

  async function openReportForEdit(ticket) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('report_audit_log').insert({
        report_id: ticket.reportId, report_date: ticket.date,
        changed_by_name: user?.email || 'Admin', changed_by_role: 'admin',
        change_type: 'reconciliation_edit', section: 'Reconciliation',
        field_name: `Ticket #${ticket.ticketNumber}`, old_value: null,
        new_value: 'Opened for editing from Reconciliation tab',
        change_reason: `Admin opened report for editing via reconciliation review (Ticket #${ticket.ticketNumber}, ${ticket.activityType})`,
        organization_id: getOrgId()
      })
    } catch (e) { /* audit log is non-blocking */ }
    navigate(orgPath(`/field-entry?edit=${ticket.reportId}`))
  }

  async function loadLemUploads() {
    setLoading(true)
    let q = supabase.from('contractor_lem_uploads').select('*').order('uploaded_at', { ascending: false })
    q = addOrgFilter(q, true)
    const { data } = await q

    let iq = supabase.from('contractor_invoices').select('*').order('uploaded_at', { ascending: false })
    iq = addOrgFilter(iq, true)
    const { data: invData } = await iq

    setLemUploads(data || [])
    setInvoices(invData || [])
    setLoading(false)
  }

  async function loadStandaloneTickets() {
    let sq = supabase.from('standalone_tickets').select('*').order('work_date', { ascending: false })
    sq = addOrgFilter(sq, true)
    const { data } = await sq
    setStandaloneTickets(data || [])
  }

  async function handlePanel4DataChange(changeData) {
    const { data: { user } } = await supabase.auth.getUser()
    if (changeData.type === 'inspector_report') {
      // Update the activity block's labour/equipment in the report
      const report = reports.find(r => r.id === changeData.reportId)
      if (!report) return
      const blocks = [...(report.activity_blocks || [])]
      // Find the matched block and update its entries
      const blockIdx = blocks.findIndex(b =>
        JSON.stringify(b.labourEntries) !== JSON.stringify(changeData.labourEntries) ||
        JSON.stringify(b.equipmentEntries) !== JSON.stringify(changeData.equipmentEntries)
      )
      if (blockIdx >= 0) {
        blocks[blockIdx] = { ...blocks[blockIdx], labourEntries: changeData.labourEntries, equipmentEntries: changeData.equipmentEntries }
      }
      await supabase.from('daily_reports').update({ activity_blocks: blocks }).eq('id', changeData.reportId)
      // Audit log
      await supabase.from('report_audit_log').insert({
        report_id: changeData.reportId, changed_by_name: user?.email || 'Cost Control',
        changed_by_role: 'admin', change_type: 'reconciliation_edit', section: 'Reconciliation Panel 4',
        field_name: 'labour_equipment_entries', new_value: 'Edited from reconciliation four-panel view',
        organization_id: getOrgId()
      })
      // Update local state
      setReports(prev => prev.map(r => r.id === changeData.reportId ? { ...r, activity_blocks: blocks } : r))
    } else if (changeData.type === 'standalone_ticket') {
      await supabase.from('standalone_tickets').update({
        labour_entries: changeData.labourEntries,
        equipment_entries: changeData.equipmentEntries,
        updated_at: new Date().toISOString()
      }).eq('id', changeData.ticketId)
      // Audit log
      await supabase.from('report_audit_log').insert({
        report_id: null, changed_by_name: user?.email || 'Cost Control',
        changed_by_role: 'admin', change_type: 'reconciliation_edit', section: 'Reconciliation Panel 4',
        field_name: 'standalone_ticket_entries', new_value: `Edited standalone ticket ${changeData.ticketId}`,
        organization_id: getOrgId()
      })
      setStandaloneTickets(prev => prev.map(t => t.id === changeData.ticketId
        ? { ...t, labour_entries: changeData.labourEntries, equipment_entries: changeData.equipmentEntries }
        : t))
    }
  }

  async function loadPairs(lemId) {
    const { data } = await supabase
      .from('lem_reconciliation_pairs')
      .select('*')
      .eq('lem_upload_id', lemId)
      .order('pair_index')
    setPairs(data || [])
    setSelectedPairIndex(0)
  }

  async function selectLem(lem) {
    setSelectedLem(lem)
    setSelectedInvoice(null)
    await loadPairs(lem.id)
  }

  async function handleResolve(pairId, resolution, notes) {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const isDispute = resolution === 'disputed_variance' || resolution === 'disputed_ticket_altered'
    const isPending = resolution === 'pending'
    const update = {
      status: resolution === 'accepted' ? 'accepted' : isPending ? 'pending' : resolution === 'skipped' ? 'skipped' : 'disputed',
      resolution: isPending ? null : resolution,
      resolution_notes: notes || null,
      resolved_by: isPending ? null : user?.id || null,
      resolved_at: isPending ? null : new Date().toISOString(),
      dispute_type: isDispute ? (resolution === 'disputed_ticket_altered' ? 'ticket_altered' : 'variance') : null
    }
    const { error } = await supabase.from('lem_reconciliation_pairs').update(update).eq('id', pairId)
    if (error) {
      console.error('Failed to save resolution:', error)
      setSaving(false)
      return
    }
    setPairs(prev => prev.map(p => p.id === pairId ? { ...p, ...update } : p))
    setSaving(false)
  }

  async function approveReconciliation() {
    if (!selectedLem) return
    const pending = pairs.filter(p => p.status === 'pending')
    if (pending.length > 0) {
      alert(`Cannot approve — ${pending.length} pair(s) still pending review.`)
      return
    }
    setSaving(true)
    await supabase.from('contractor_lem_uploads').update({ status: 'approved' }).eq('id', selectedLem.id)
    setSelectedLem({ ...selectedLem, status: 'approved' })
    setLemUploads(prev => prev.map(l => l.id === selectedLem.id ? { ...l, status: 'approved' } : l))
    setSaving(false)
  }

  const approvedLems = lemUploads.filter(l => l.status === 'approved')

  function getInvoiceStatus(lemId, lemStatus) {
    const inv = invoices.find(i => i.lem_id === lemId)
    if (inv) return { label: inv.status, color: inv.status === 'paid' ? '#2563eb' : inv.status === 'approved' ? '#059669' : inv.status === 'rejected' ? '#dc2626' : '#d97706', emoji: inv.status === 'paid' ? '💰' : inv.status === 'approved' ? '✅' : inv.status === 'rejected' ? '❌' : '📄' }
    if (lemStatus === 'approved') return { label: 'Awaiting', color: '#d97706', emoji: '⏳' }
    return { label: 'Blocked', color: '#6b7280', emoji: '🚫' }
  }

  const statusColor = (status) => {
    switch (status) {
      case 'parsed': return '#2563eb'
      case 'reconciled': return '#d97706'
      case 'approved': return '#059669'
      default: return '#6b7280'
    }
  }

  const statusBadge = (status) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', color: 'white', backgroundColor: statusColor(status) }}>
      {status}
    </span>
  )

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading LEM uploads...</div>

  // --- INVOICE DETAIL VIEW ---
  if (selectedInvoice) {
    return (
      <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
        <button onClick={() => setSelectedInvoice(null)} style={{ marginBottom: '16px', padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>&larr; Back</button>
        <InvoiceComparison invoice={selectedInvoice} onUpdate={(updated) => {
          setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i))
          setSelectedInvoice(updated)
        }} />
      </div>
    )
  }

  // --- FOUR-PANEL VISUAL RECONCILIATION VIEW ---
  if (selectedLem) {
    const accepted = pairs.filter(p => p.status === 'accepted').length
    const disputed = pairs.filter(p => p.status === 'disputed').length
    const pending = pairs.filter(p => p.status === 'pending').length
    const allReviewed = pending === 0 && pairs.length > 0

    return (
      <div style={{ padding: '20px', maxWidth: '1800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <button onClick={() => { setSelectedLem(null); setPairs([]) }} style={{ padding: '6px 12px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '8px' }}>&larr; Back to LEMs</button>
            <h3 style={{ margin: 0 }}>
              {selectedLem.po_number && <span style={{ color: '#2563eb' }}>{selectedLem.po_number} — </span>}
              {selectedLem.contractor_name} — {selectedLem.lem_number || selectedLem.source_filename}
            </h3>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '13px' }}>
              {selectedLem.lem_period_start} to {selectedLem.lem_period_end} | {pairs.length} pairs | {accepted} accepted, {disputed} disputed, {pending} pending | Status: {statusBadge(selectedLem.status)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {allReviewed && selectedLem.status !== 'approved' && (
              <button onClick={approveReconciliation} disabled={saving}
                style={{ padding: '10px 24px', backgroundColor: saving ? '#9ca3af' : '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600' }}>
                Approve Reconciliation
              </button>
            )}
            {selectedLem.status === 'approved' && (
              <span style={{ padding: '10px 24px', backgroundColor: '#f0fdf4', color: '#059669', borderRadius: '6px', fontWeight: '600', border: '1px solid #bbf7d0' }}>
                Approved — Invoice upload unlocked
              </span>
            )}
          </div>
        </div>

        {pairs.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af', backgroundColor: 'white', borderRadius: '8px' }}>
            No reconciliation pairs found for this LEM. The PDF may still be processing.
          </div>
        ) : (
          <LEMFourPanelView
            pairs={pairs}
            selectedPairIndex={selectedPairIndex}
            onSelectPair={setSelectedPairIndex}
            onResolve={handleResolve}
            reports={reports}
            saving={saving}
            poNumber={selectedLem?.po_number}
            contractorName={selectedLem?.contractor_name}
            labourRates={labourRates}
            equipmentRates={equipmentRates}
            standaloneTickets={standaloneTickets}
            onPanel4DataChange={handlePanel4DataChange}
          />
        )}
      </div>
    )
  }

  // --- MAIN LIST VIEW ---
  const ticketSummaries = subView === 'inspectorReports' ? getTicketSummaries() : []
  const grandLabourCost = ticketSummaries.reduce((s, t) => s + t.totalLabourCost, 0)
  const grandEquipCost = ticketSummaries.reduce((s, t) => s + t.totalEquipCost, 0)
  const grandTotal = grandLabourCost + grandEquipCost
  const rateWarnings = ticketSummaries.filter(t => t.unmatchedRates > 0).length

  return (
    <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Sub-view toggle + actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setSubView('inspectorReports')}
            style={{ padding: '10px 20px', backgroundColor: subView === 'inspectorReports' ? '#2563eb' : '#e5e7eb', color: subView === 'inspectorReports' ? 'white' : '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
            Inspector Reports ({reports.length})
          </button>
          <button onClick={() => setSubView('contractorLems')}
            style={{ padding: '10px 20px', backgroundColor: subView === 'contractorLems' ? '#b45309' : '#e5e7eb', color: subView === 'contractorLems' ? 'white' : '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
            Contractor LEMs ({lemUploads.length})
          </button>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '6px' }}>Date Range:</span>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px' }}>
              <option value="30">Last 30 days</option>
              <option value="60">Last 60 days</option>
              <option value="90">Last 90 days</option>
              <option value="180">Last 180 days</option>
              <option value="365">Last year</option>
            </select>
          </div>
          <button onClick={() => { loadLemUploads(); loadReportsAndRates() }} style={{ padding: '8px 16px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>
            Refresh
          </button>
          {subView === 'contractorLems' && !showUpload && !showInvoiceUpload && (
            <>
              {/* PO Filter */}
              {(() => {
                const pos = [...new Set(lemUploads.map(l => l.po_number).filter(Boolean))]
                return pos.length > 0 ? (
                  <div>
                    <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '6px' }}>PO:</span>
                    <select value={poFilter} onChange={e => setPoFilter(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px' }}>
                      <option value="">All POs</option>
                      {pos.sort().map(po => <option key={po} value={po}>{po}</option>)}
                    </select>
                  </div>
                ) : null
              })()}
              <button onClick={() => setShowUpload(true)} style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
                Upload LEM
              </button>
              <button onClick={() => setShowInvoiceUpload(true)} disabled={approvedLems.length === 0}
                style={{ padding: '8px 16px', backgroundColor: approvedLems.length > 0 ? '#059669' : '#9ca3af', color: 'white', border: 'none', borderRadius: '6px', cursor: approvedLems.length > 0 ? 'pointer' : 'not-allowed', fontWeight: '500' }}>
                Upload Invoice
              </button>
            </>
          )}
        </div>
      </div>

      {/* Upload forms */}
      {showUpload && (
        <div style={{ marginBottom: '16px' }}>
          <LEMUpload onUploadComplete={async (lemRecord) => {
            setShowUpload(false)
            await loadLemUploads()
            if (lemRecord) selectLem(lemRecord)
          }} />
          <button onClick={() => setShowUpload(false)} style={{ marginTop: '8px', padding: '6px 12px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel Upload</button>
        </div>
      )}
      {showInvoiceUpload && (
        <div style={{ marginBottom: '16px' }}>
          <InvoiceUpload approvedLems={approvedLems} onUploadComplete={() => { setShowInvoiceUpload(false); loadLemUploads() }} />
          <button onClick={() => setShowInvoiceUpload(false)} style={{ marginTop: '8px', padding: '6px 12px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
        </div>
      )}

      {/* INSPECTOR REPORTS VIEW */}
      {subView === 'inspectorReports' && (
        <div>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '3px solid #2563eb' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>{ticketSummaries.length}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Tickets</div>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '3px solid #059669' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#059669' }}>${grandLabourCost.toLocaleString()}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Labour Cost</div>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '3px solid #d97706' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#d97706' }}>${grandEquipCost.toLocaleString()}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Equipment Cost</div>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '3px solid #374151' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#374151' }}>${grandTotal.toLocaleString()}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Cost</div>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: `3px solid ${rateWarnings > 0 ? '#dc2626' : '#059669'}` }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: rateWarnings > 0 ? '#dc2626' : '#059669' }}>{rateWarnings}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Missing Rates</div>
            </div>
          </div>

          {labourRates.length === 0 && equipmentRates.length === 0 && (
            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#854d0e' }}>
              No rate cards loaded. Import labour and equipment rate sheets in Admin Portal to see calculated costs.
            </div>
          )}

          {/* Tickets table */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#1e3a5f' }}>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'left' }}>Date</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'left' }}>Ticket #</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'left' }}>Activity</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'left' }}>Contractor</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'left' }}>Foreman</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Workers</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Labour Hrs</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'right' }}>Labour $</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Equip</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Equip Hrs</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'right' }}>Equip $</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'right' }}>Total</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Photo</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Edit</th>
                </tr>
              </thead>
              <tbody>
                {ticketSummaries.length === 0 ? (
                  <tr><td colSpan="14" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No inspector reports found for this date range.</td></tr>
                ) : ticketSummaries.map((t, idx) => (
                  <tr key={idx} onClick={() => openReportForEdit(t)} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: t.unmatchedRates > 0 ? '#fffbeb' : 'transparent', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = t.unmatchedRates > 0 ? '#fffbeb' : 'transparent'}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{t.date}</td>
                    <td style={{ padding: '8px', fontWeight: '600' }}>{t.ticketNumber}</td>
                    <td style={{ padding: '8px' }}>{t.activityType}</td>
                    <td style={{ padding: '8px' }}>{t.contractor}</td>
                    <td style={{ padding: '8px' }}>{t.foreman}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{t.labourCount}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{t.totalLabourHrs}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: t.totalLabourCost > 0 ? '#059669' : '#9ca3af' }}>{t.totalLabourCost > 0 ? `$${t.totalLabourCost.toLocaleString()}` : '-'}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{t.equipCount}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{t.totalEquipHrs}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: t.totalEquipCost > 0 ? '#d97706' : '#9ca3af' }}>{t.totalEquipCost > 0 ? `$${t.totalEquipCost.toLocaleString()}` : '-'}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>{t.totalCost > 0 ? `$${t.totalCost.toLocaleString()}` : '-'}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      {t.photoUrls.length > 0 ? (
                        <button onClick={() => window.open(t.photoUrls[0], '_blank')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px' }}
                          title="View ticket photo">
                          📷{t.photoUrls.length > 1 ? ` (${t.photoUrls.length})` : ''}
                        </button>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button onClick={(e) => { e.stopPropagation(); openReportForEdit(t) }}
                        style={{ padding: '4px 10px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}
                        title="Edit this inspector report">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTRACTOR LEMS VIEW */}
      {subView === 'contractorLems' && !showUpload && !showInvoiceUpload && (
        <div>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '24px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#1e3a5f' }}>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>PO</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>Contractor</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>LEM #</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>Period</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Pairs</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Recon Status</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Invoice Status</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {lemUploads.length === 0 ? (
                  <tr><td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No LEM uploads yet. Click "Upload LEM" to get started.</td></tr>
                ) : lemUploads.filter(lem => !poFilter || lem.po_number === poFilter).map(lem => {
                  const invStatus = getInvoiceStatus(lem.id, lem.status)
                  return (
                    <tr key={lem.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                      onClick={() => selectLem(lem)}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <td style={{ padding: '10px 12px', fontWeight: '600', color: '#2563eb' }}>{lem.po_number || '-'}</td>
                      <td style={{ padding: '10px 12px', fontWeight: '500' }}>{lem.contractor_name}</td>
                      <td style={{ padding: '10px 12px' }}>{lem.lem_number || lem.source_filename}</td>
                      <td style={{ padding: '10px 12px' }}>{lem.lem_period_start || '-'} to {lem.lem_period_end || '-'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{lem.total_claimed || 0}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{statusBadge(lem.status)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', color: 'white', backgroundColor: invStatus.color }}>
                          {invStatus.emoji} {invStatus.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button onClick={(e) => { e.stopPropagation(); selectLem(lem) }} style={{ padding: '4px 12px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                          Review
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Invoices section */}
          {invoices.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 12px 0' }}>Invoices</h3>
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#059669' }}>
                      <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>Invoice #</th>
                      <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>Contractor</th>
                      <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>Date</th>
                      <th style={{ color: 'white', padding: '10px 12px', textAlign: 'right' }}>Total</th>
                      <th style={{ color: 'white', padding: '10px 12px', textAlign: 'right' }}>Variance</th>
                      <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Status</th>
                      <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 12px', fontWeight: '500' }}>{inv.invoice_number}</td>
                        <td style={{ padding: '10px 12px' }}>{inv.contractor_name}</td>
                        <td style={{ padding: '10px 12px' }}>{inv.invoice_date || '-'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>${(parseFloat(inv.invoice_total) || 0).toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: parseFloat(inv.variance_amount) > 0 ? '#dc2626' : '#059669', fontWeight: '600' }}>
                          {parseFloat(inv.variance_amount) > 0 ? '+' : ''}${(parseFloat(inv.variance_amount) || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{statusBadge(inv.status)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button onClick={() => setSelectedInvoice(inv)} style={{ padding: '4px 12px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
