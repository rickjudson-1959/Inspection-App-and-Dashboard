import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { reconcileLEM } from '../utils/lemMatcher.js'
import LEMUpload from './LEMUpload.jsx'
import InvoiceUpload from './InvoiceUpload.jsx'
import InvoiceComparison from './InvoiceComparison.jsx'

export default function LEMReconciliation() {
  const { addOrgFilter, getOrgId } = useOrgQuery()
  const [lemUploads, setLemUploads] = useState([])
  const [selectedLem, setSelectedLem] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [reviewItem, setReviewItem] = useState(null)
  const [resolution, setResolution] = useState('accept_inspector')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingReview, setLoadingReview] = useState(false)

  // Inspector reports + rate cards
  const [subView, setSubView] = useState('inspectorReports') // 'inspectorReports' or 'contractorLems'
  const [reports, setReports] = useState([])
  const [labourRates, setLabourRates] = useState([])
  const [equipmentRates, setEquipmentRates] = useState([])
  const [dateRange, setDateRange] = useState('60')

  useEffect(() => { loadLemUploads(); loadReportsAndRates() }, [])
  useEffect(() => { loadReportsAndRates() }, [dateRange])

  async function loadReportsAndRates() {
    const orgId = getOrgId()
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    let rq = supabase.from('daily_reports').select('id, date, inspector_name, activity_blocks')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false })
    rq = addOrgFilter(rq)
    const { data: reportData } = await rq
    setReports(reportData || [])

    // Load rate cards via server-side API (RLS blocks direct reads)
    try {
      const lr = await fetch(`/api/rates?table=labour_rates&organization_id=${orgId}`)
      if (lr.ok) { const d = await lr.json(); if (Array.isArray(d)) setLabourRates(d) }
      const er = await fetch(`/api/rates?table=equipment_rates&organization_id=${orgId}`)
      if (er.ok) { const d = await er.json(); if (Array.isArray(d)) setEquipmentRates(d) }
    } catch (e) { /* rate cards optional */ }
  }

  // Cache for fuzzy match results to avoid recomputing during render
  const matchCache = useMemo(() => new Map(), [labourRates, equipmentRates])

  // Fuzzy match: find best matching rate card entry for a classification string
  function findBestMatch(search, candidates, keyFn) {
    const cacheKey = (search || '') + '|' + candidates.length
    if (matchCache.has(cacheKey)) return matchCache.get(cacheKey)

    function cache(result) { matchCache.set(cacheKey, result); return result }

    if (!search || !candidates || candidates.length === 0) return cache(null)
    const s = (typeof search === 'string' ? search : String(search)).toLowerCase().trim()
    if (!s) return cache(null)
    // 1. Exact match
    let match = candidates.find(c => { try { return (keyFn(c) || '').toLowerCase().trim() === s } catch { return false } })
    if (match) return cache(match)
    // 2. One contains the other
    match = candidates.find(c => {
      try {
        const k = (keyFn(c) || '').toLowerCase().trim()
        return k && (k.includes(s) || s.includes(k))
      } catch { return false }
    })
    if (match) return cache(match)
    // 3. Word overlap scoring — pick candidate with most shared words
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
        if (score > bestScore && score >= 0.5) {
          bestScore = score
          bestCandidate = c
        }
      } catch { continue }
    }
    return cache(bestCandidate)
  }

  // Calculate cost for a labour entry using rate cards
  function calcLabourCost(entry) {
    try {
      if (!entry || !entry.classification || labourRates.length === 0) return 0
      const rate = findBestMatch(entry.classification, labourRates, r => r.classification || '')
      if (!rate) return 0
      const rt = parseFloat(entry.rt || entry.hours || 0) || 0
      const ot = parseFloat(entry.ot || 0) || 0
      return (rt * (parseFloat(rate.rate_st) || 0)) + (ot * (parseFloat(rate.rate_ot) || 0))
    } catch { return 0 }
  }

  // Calculate cost for an equipment entry using rate cards
  function calcEquipCost(entry) {
    try {
      if (!entry || equipmentRates.length === 0) return 0
      const eqType = entry.type || entry.equipmentType || ''
      if (!eqType) return 0
      const rate = findBestMatch(eqType, equipmentRates, r => r.equipment_type || '')
      if (!rate) return 0
      const hrs = parseFloat(entry.hours || 0) || 0
      return hrs * (parseFloat(rate.rate_hourly) || 0)
    } catch { return 0 }
  }

  // Build ticket-level summary from all reports — only blocks with ticket numbers
  function getTicketSummaries() {
    try {
    const tickets = []
    for (const report of reports) {
      const blocks = report.activity_blocks || []
      blocks.forEach((block, blockIdx) => {
        // Only include blocks that have a ticket number
        if (!block.ticketNumber || !block.ticketNumber.trim()) return

        const labour = block.labourEntries || []
        const equip = block.equipmentEntries || []
        const totalLabourHrs = labour.reduce((s, e) => s + (parseFloat(e.rt || e.hours || 0)) + (parseFloat(e.ot || 0)), 0)
        const totalEquipHrs = equip.reduce((s, e) => s + (parseFloat(e.hours || 0)) * (parseInt(e.count || 1)), 0)
        const totalLabourCost = labour.reduce((s, e) => s + calcLabourCost(e) * (parseInt(e.count || 1)), 0)
        const totalEquipCost = equip.reduce((s, e) => s + calcEquipCost(e) * (parseInt(e.count || 1)), 0)
        const unmatchedLabour = labour.filter(e => calcLabourCost(e) === 0).length
        const unmatchedEquip = equip.filter(e => calcEquipCost(e) === 0).length

        // Get ticket photo URL(s)
        const photoEntries = block.ticketPhotos?.length > 0 ? block.ticketPhotos : block.ticketPhoto ? [block.ticketPhoto] : []
        const photoUrls = photoEntries.filter(Boolean).map(p => {
          if (typeof p === 'string' && p.startsWith('http')) return p
          if (typeof p === 'string') return supabase.storage.from('ticket-photos').getPublicUrl(p).data?.publicUrl
          return null
        }).filter(Boolean)

        tickets.push({
          reportId: report.id,
          date: report.date,
          inspector: report.inspector_name,
          ticketNumber: block.ticketNumber,
          activityType: block.activityType || '-',
          contractor: block.contractor || '-',
          foreman: block.foreman || '-',
          labourCount: labour.length,
          equipCount: equip.length,
          totalLabourHrs: Math.round(totalLabourHrs * 10) / 10,
          totalEquipHrs: Math.round(totalEquipHrs * 10) / 10,
          totalLabourCost: Math.round(totalLabourCost * 100) / 100,
          totalEquipCost: Math.round(totalEquipCost * 100) / 100,
          totalCost: Math.round((totalLabourCost + totalEquipCost) * 100) / 100,
          unmatchedRates: unmatchedLabour + unmatchedEquip,
          blockIdx,
          photoUrls
        })
      })
    }
    return tickets
    } catch (err) { console.error('getTicketSummaries error:', err); return [] }
  }

  async function loadLemUploads() {
    setLoading(true)
    let q = supabase.from('contractor_lem_uploads').select('*').order('uploaded_at', { ascending: false })
    q = addOrgFilter(q)
    const { data } = await q

    // Load invoices
    let iq = supabase.from('contractor_invoices').select('*').order('uploaded_at', { ascending: false })
    iq = addOrgFilter(iq)
    const { data: invData } = await iq

    setLemUploads(data || [])
    setInvoices(invData || [])
    setLoading(false)
  }

  async function loadLineItems(lemId) {
    const { data } = await supabase.from('lem_line_items').select('*').eq('lem_id', lemId).order('work_date')
    setLineItems(data || [])
  }

  async function selectLem(lem) {
    setSelectedLem(lem)
    setReviewItem(null)
    setSelectedInvoice(null)
    await loadLineItems(lem.id)
  }

  async function runReconciliation() {
    if (!selectedLem) return
    setSaving(true)

    let q = supabase.from('daily_reports').select('id, date, selected_date, inspector_name, activity_blocks')
    q = addOrgFilter(q)
    const { data: reports } = await q
    if (!reports) { setSaving(false); return }

    const reconciled = reconcileLEM(lineItems, reports, { labourRates, equipmentRates })

    for (const item of reconciled) {
      await supabase.from('lem_line_items').update({
        matched_report_id: item.matched_report_id,
        matched_block_index: item.matched_block_index,
        match_confidence: item.match_confidence,
        match_status: item.match_status,
        variance_data: item.variance_data
      }).eq('id', item.id)
    }

    await supabase.from('contractor_lem_uploads').update({ status: 'reconciled' }).eq('id', selectedLem.id)
    setLineItems(reconciled)
    setSelectedLem({ ...selectedLem, status: 'reconciled' })
    setSaving(false)
  }

  async function approveReconciliation() {
    if (!selectedLem) return
    setSaving(true)
    await supabase.from('contractor_lem_uploads').update({ status: 'approved' }).eq('id', selectedLem.id)
    setSelectedLem({ ...selectedLem, status: 'approved' })
    setLemUploads(prev => prev.map(l => l.id === selectedLem.id ? { ...l, status: 'approved' } : l))
    setSaving(false)
  }

  async function openReview(item) {
    setResolution('accept_inspector')
    setResolutionNotes('')
    if (item.matched_report_id != null) {
      setLoadingReview(true)
      const { data: report } = await supabase.from('daily_reports').select('activity_blocks').eq('id', item.matched_report_id).single()
      const blocks = report?.activity_blocks || []
      const block = item.matched_block_index != null ? blocks[item.matched_block_index] : blocks[0]
      setReviewItem({ ...item, _matched_block: block || {} })
      setLoadingReview(false)
    } else {
      setReviewItem({ ...item, _matched_block: {} })
    }
  }

  async function saveResolution() {
    if (!reviewItem) return
    setSaving(true)
    const newStatus = (resolution === 'dispute' || resolution === 'ticket_altered') ? 'disputed' : 'resolved'
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

  // Summary stats
  const matched = lineItems.filter(i => i.match_status === 'clean')
  const variance = lineItems.filter(i => i.match_status === 'variance')
  const unmatched = lineItems.filter(i => i.match_status === 'unmatched')
  const disputed = lineItems.filter(i => i.match_status === 'disputed')
  const resolved = lineItems.filter(i => i.match_status === 'resolved')

  const totalLemLabour = lineItems.reduce((s, i) => s + (parseFloat(i.total_labour_hours) || 0), 0)
  const totalLemEquip = lineItems.reduce((s, i) => s + (parseFloat(i.total_equipment_hours) || 0), 0)
  const totalLemLabourCost = lineItems.reduce((s, i) => s + (parseFloat(i.total_labour_cost) || 0), 0)
  const totalLemEquipCost = lineItems.reduce((s, i) => s + (parseFloat(i.total_equipment_cost) || 0), 0)

  const approvedLems = lemUploads.filter(l => l.status === 'approved')

  // Invoice status for a LEM
  function getInvoiceStatus(lemId, lemStatus) {
    const inv = invoices.find(i => i.lem_id === lemId)
    if (inv) return { label: inv.status, color: inv.status === 'paid' ? '#2563eb' : inv.status === 'approved' ? '#059669' : inv.status === 'rejected' ? '#dc2626' : '#d97706', emoji: inv.status === 'paid' ? '💰' : inv.status === 'approved' ? '✅' : inv.status === 'rejected' ? '❌' : '📄' }
    if (lemStatus === 'approved') return { label: 'Awaiting', color: '#d97706', emoji: '⏳' }
    return { label: 'Blocked', color: '#6b7280', emoji: '🚫' }
  }

  const statusColor = (status) => {
    switch (status) {
      case 'clean': return '#059669'
      case 'variance': return '#d97706'
      case 'unmatched': return '#dc2626'
      case 'disputed': return '#7c3aed'
      case 'resolved': return '#2563eb'
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

  // --- FOUR-PANEL REVIEW VIEW ---
  if (reviewItem) {
    const vd = reviewItem.variance_data || {}
    const lemLabour = reviewItem.labour_entries || []
    const lemEquip = reviewItem.equipment_entries || []
    const inspBlock = reviewItem._matched_block || {}
    const inspLabour = inspBlock.labourEntries || []
    const inspEquip = inspBlock.equipmentEntries || []

    return (
      <div style={{ padding: '20px', maxWidth: '1800px', margin: '0 auto' }}>
        <button onClick={() => setReviewItem(null)} style={{ marginBottom: '16px', padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          &larr; Back to Line Items
        </button>

        <h2 style={{ margin: '0 0 4px 0' }}>Review: Ticket #{reviewItem.ticket_number || 'Unknown'}</h2>
        <p style={{ color: '#6b7280', margin: '0 0 16px 0' }}>{reviewItem.work_date} | {reviewItem.crew_name || reviewItem.foreman || '-'}</p>

        {/* Four-panel comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
          {/* Panel 1: Our Photo */}
          <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '14px', border: '2px solid #374151' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#374151', fontSize: '13px' }}>OUR PHOTO (Field Original)</h4>
            {inspBlock.ticketPhotos?.length > 0 || inspBlock.ticketPhoto ? (
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {(inspBlock.ticketPhotos || [inspBlock.ticketPhoto]).filter(Boolean).map((photo, idx) => {
                  const url = typeof photo === 'string' && photo.startsWith('http')
                    ? photo
                    : supabase.storage.from('ticket-photos').getPublicUrl(photo).data?.publicUrl
                  return url ? <img key={idx} src={url} alt={`Our ticket p${idx + 1}`} style={{ width: '100%', borderRadius: '4px', marginBottom: '6px', cursor: 'zoom-in' }} onClick={() => window.open(url, '_blank')} /> : null
                })}
              </div>
            ) : (
              <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '12px' }}>No ticket photo available</p>
            )}
          </div>

          {/* Panel 2: Inspector Data */}
          <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '14px', border: '2px solid #059669' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#166534', fontSize: '13px' }}>INSPECTOR DATA (Verified)</h4>
            {reviewItem.matched_report_id ? (
              <>
                <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 6px 0' }}>Report: {String(reviewItem.matched_report_id).slice(0, 8)}... | {reviewItem.match_confidence}</p>
                <h5 style={{ margin: '10px 0 4px 0', fontSize: '11px', textTransform: 'uppercase', color: '#166534' }}>Labour ({inspLabour.length})</h5>
                {inspLabour.length > 0 ? (
                  <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: '1px solid #d1d5db' }}>
                      <th style={{ textAlign: 'left', padding: '3px' }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '3px' }}>Class</th>
                      <th style={{ textAlign: 'center', padding: '3px' }}>RT</th>
                      <th style={{ textAlign: 'center', padding: '3px' }}>OT</th>
                      <th style={{ textAlign: 'right', padding: '3px' }}>Cost</th>
                    </tr></thead>
                    <tbody>
                      {inspLabour.map((e, i) => {
                        const cost = calcLabourCost(e)
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '2px 3px' }}>{e.name || e.employeeName || '-'}</td>
                            <td style={{ padding: '2px 3px' }}>{e.classification || e.trade || '-'}</td>
                            <td style={{ padding: '2px 3px', textAlign: 'center' }}>{e.rt || e.hours || 0}</td>
                            <td style={{ padding: '2px 3px', textAlign: 'center' }}>{e.ot || 0}</td>
                            <td style={{ padding: '2px 3px', textAlign: 'right', color: cost > 0 ? '#059669' : '#9ca3af' }}>{cost > 0 ? `$${cost.toLocaleString()}` : '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : <p style={{ fontSize: '11px', color: '#9ca3af' }}>No labour</p>}
                <h5 style={{ margin: '10px 0 4px 0', fontSize: '11px', textTransform: 'uppercase', color: '#166534' }}>Equipment ({inspEquip.length})</h5>
                {inspEquip.length > 0 ? (
                  <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: '1px solid #d1d5db' }}>
                      <th style={{ textAlign: 'left', padding: '3px' }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '3px' }}>Unit</th>
                      <th style={{ textAlign: 'center', padding: '3px' }}>Hrs</th>
                      <th style={{ textAlign: 'right', padding: '3px' }}>Cost</th>
                    </tr></thead>
                    <tbody>
                      {inspEquip.map((e, i) => {
                        const cost = calcEquipCost(e)
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '2px 3px' }}>{e.type || e.equipmentType || '-'}</td>
                            <td style={{ padding: '2px 3px' }}>{e.unitNumber || e.unit_number || '-'}</td>
                            <td style={{ padding: '2px 3px', textAlign: 'center' }}>{e.hours || 0}</td>
                            <td style={{ padding: '2px 3px', textAlign: 'right', color: cost > 0 ? '#059669' : '#9ca3af' }}>{cost > 0 ? `$${cost.toLocaleString()}` : '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : <p style={{ fontSize: '11px', color: '#9ca3af' }}>No equipment</p>}
              </>
            ) : <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '12px' }}>No matching inspector report</p>}
          </div>

          {/* Panel 3: Their Copy */}
          <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '14px', border: '2px solid #dc2626' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#991b1b', fontSize: '13px' }}>THEIR COPY (Submitted)</h4>
            {reviewItem.contractor_ticket_url ? (
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <img src={reviewItem.contractor_ticket_url} alt="Contractor ticket copy" style={{ width: '100%', borderRadius: '4px', cursor: 'zoom-in' }} onClick={() => window.open(reviewItem.contractor_ticket_url, '_blank')} />
              </div>
            ) : (
              <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '12px' }}>No contractor ticket copy found in LEM PDF</p>
            )}
          </div>

          {/* Panel 4: LEM Claim */}
          <div style={{ backgroundColor: '#fefce8', borderRadius: '8px', padding: '14px', border: '2px solid #d97706' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#854d0e', fontSize: '13px' }}>LEM CLAIM (Billing)</h4>
            <h5 style={{ margin: '10px 0 4px 0', fontSize: '11px', textTransform: 'uppercase', color: '#854d0e' }}>Labour ({lemLabour.length})</h5>
            {lemLabour.length > 0 ? (
              <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid #d1d5db' }}>
                  <th style={{ textAlign: 'left', padding: '3px' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '3px' }}>Class</th>
                  <th style={{ textAlign: 'center', padding: '3px' }}>RT</th>
                  <th style={{ textAlign: 'center', padding: '3px' }}>OT</th>
                  <th style={{ textAlign: 'right', padding: '3px' }}>Rate</th>
                  <th style={{ textAlign: 'right', padding: '3px' }}>Cost</th>
                </tr></thead>
                <tbody>
                  {lemLabour.map((e, i) => {
                    const notInInsp = reviewItem.matched_report_id && !inspLabour.some(il =>
                      (il.name || il.employeeName || '').toLowerCase() === (e.employee_name || '').toLowerCase()
                    )
                    const rateIssue = vd.labour_rate_issues?.find(ri => ri.classification?.toLowerCase() === (e.classification || '').toLowerCase())
                    const lineCost = parseFloat(e.line_total) || ((parseFloat(e.rt_hours) || 0) + (parseFloat(e.ot_hours) || 0) * 1.5) * (parseFloat(e.rate) || 0)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: notInInsp ? '#fef2f2' : rateIssue ? '#faf5ff' : 'transparent' }}>
                        <td style={{ padding: '2px 3px' }}>{e.employee_name || '-'} {notInInsp && <span style={{ color: '#dc2626', fontSize: '9px', fontWeight: '700' }}>NOT IN INSPECTOR</span>}</td>
                        <td style={{ padding: '2px 3px' }}>{e.classification || '-'}</td>
                        <td style={{ padding: '2px 3px', textAlign: 'center' }}>{e.rt_hours || 0}</td>
                        <td style={{ padding: '2px 3px', textAlign: 'center' }}>{e.ot_hours || 0}</td>
                        <td style={{ padding: '2px 3px', textAlign: 'right', color: rateIssue ? '#7c3aed' : '#6b7280' }}>
                          {e.rate ? `$${e.rate}` : '-'}
                          {rateIssue && <span style={{ color: '#dc2626', fontSize: '8px', display: 'block' }}>Agreed: ${rateIssue.agreed_rate}</span>}
                        </td>
                        <td style={{ padding: '2px 3px', textAlign: 'right' }}>{lineCost > 0 ? `$${Math.round(lineCost).toLocaleString()}` : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : <p style={{ fontSize: '11px', color: '#9ca3af' }}>No labour</p>}
            <h5 style={{ margin: '10px 0 4px 0', fontSize: '11px', textTransform: 'uppercase', color: '#854d0e' }}>Equipment ({lemEquip.length})</h5>
            {lemEquip.length > 0 ? (
              <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid #d1d5db' }}>
                  <th style={{ textAlign: 'left', padding: '3px' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '3px' }}>Unit</th>
                  <th style={{ textAlign: 'center', padding: '3px' }}>Hrs</th>
                  <th style={{ textAlign: 'right', padding: '3px' }}>Rate</th>
                  <th style={{ textAlign: 'right', padding: '3px' }}>Cost</th>
                </tr></thead>
                <tbody>
                  {lemEquip.map((e, i) => {
                    const rateIssue = vd.equipment_rate_issues?.find(ri => ri.equipment_type?.toLowerCase() === (e.equipment_type || '').toLowerCase())
                    const lineCost = parseFloat(e.line_total) || (parseFloat(e.hours) || 0) * (parseFloat(e.rate) || 0) * (parseInt(e.count) || 1)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: rateIssue ? '#faf5ff' : 'transparent' }}>
                        <td style={{ padding: '2px 3px' }}>{e.equipment_type || '-'}</td>
                        <td style={{ padding: '2px 3px' }}>{e.unit_number || '-'}</td>
                        <td style={{ padding: '2px 3px', textAlign: 'center' }}>{e.hours || 0}</td>
                        <td style={{ padding: '2px 3px', textAlign: 'right', color: rateIssue ? '#7c3aed' : '#6b7280' }}>
                          {e.rate ? `$${e.rate}` : '-'}
                          {rateIssue && <span style={{ color: '#dc2626', fontSize: '8px', display: 'block' }}>Agreed: ${rateIssue.agreed_rate}</span>}
                        </td>
                        <td style={{ padding: '2px 3px', textAlign: 'right' }}>{lineCost > 0 ? `$${Math.round(lineCost).toLocaleString()}` : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : <p style={{ fontSize: '11px', color: '#9ca3af' }}>No equipment</p>}
          </div>
        </div>

        {/* Cost Comparison — Three Numbers */}
        {(vd.independent_total_cost > 0 || vd.contractor_total_cost > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '14px', border: '2px solid #059669', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#166534', textTransform: 'uppercase', fontWeight: '600', marginBottom: '4px' }}>Should Cost (Inspector Hrs × Rate Card)</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#059669' }}>${(vd.independent_total_cost || 0).toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Labour: ${(vd.independent_labour_cost || 0).toLocaleString()} | Equip: ${(vd.independent_equipment_cost || 0).toLocaleString()}</div>
            </div>
            <div style={{ backgroundColor: '#fefce8', borderRadius: '8px', padding: '14px', border: '2px solid #d97706', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#854d0e', textTransform: 'uppercase', fontWeight: '600', marginBottom: '4px' }}>Contractor Claims</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#d97706' }}>${(vd.contractor_total_cost || 0).toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Labour: ${(vd.contractor_labour_cost || 0).toLocaleString()} | Equip: ${(vd.contractor_equipment_cost || 0).toLocaleString()}</div>
            </div>
            <div style={{ backgroundColor: Math.abs(vd.cost_variance || 0) > 1 ? '#fef2f2' : '#f0fdf4', borderRadius: '8px', padding: '14px', border: `2px solid ${Math.abs(vd.cost_variance || 0) > 1 ? '#dc2626' : '#059669'}`, textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: Math.abs(vd.cost_variance || 0) > 1 ? '#991b1b' : '#166534', textTransform: 'uppercase', fontWeight: '600', marginBottom: '4px' }}>Variance</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: (vd.cost_variance || 0) > 1 ? '#dc2626' : (vd.cost_variance || 0) < -1 ? '#059669' : '#374151' }}>
                {(vd.cost_variance || 0) > 0 ? '+' : ''}${(vd.cost_variance || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                {(vd.cost_variance || 0) > 1 ? 'Contractor overbilling' : (vd.cost_variance || 0) < -1 ? 'Contractor underbilling' : 'Within tolerance'}
              </div>
            </div>
          </div>
        )}

        {/* Variance Details — Hour Variances and Rate Variances */}
        {vd.has_variance && (
          <div style={{ marginBottom: '16px' }}>
            {/* Hour Variances */}
            {vd.details?.filter(d => d.category === 'hours').length > 0 && (
              <div style={{ backgroundColor: '#fffbeb', borderRadius: '8px', padding: '14px', border: '1px solid #fde68a', marginBottom: '8px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#854d0e' }}>Hour Variances (Padded Hours?)</h4>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {vd.details.filter(d => d.category === 'hours').map((d, i) => (
                    <div key={i} style={{ padding: '6px 10px', backgroundColor: d.severity === 'high' ? '#fee2e2' : '#fef3c7', borderRadius: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>{d.field.replace(/_/g, ' ')}</span>
                      <div style={{ fontWeight: '600', fontSize: '13px' }}>
                        LEM: {d.lem_value} | Insp: {d.inspector_value} | <span style={{ color: d.difference > 0 ? '#dc2626' : '#059669' }}>{d.difference > 0 ? '+' : ''}{d.difference}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost Variances */}
            {vd.details?.filter(d => d.category === 'cost').length > 0 && (
              <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '14px', border: '1px solid #fca5a5', marginBottom: '8px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#991b1b' }}>Cost Variances</h4>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {vd.details.filter(d => d.category === 'cost').map((d, i) => (
                    <div key={i} style={{ padding: '6px 10px', backgroundColor: '#fee2e2', borderRadius: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>{d.field.replace(/_/g, ' ')}</span>
                      <div style={{ fontWeight: '600', fontSize: '13px' }}>
                        {d.lem_value != null && d.inspector_value != null
                          ? <>Claimed: ${d.lem_value.toLocaleString()} | Should be: ${d.inspector_value.toLocaleString()} | </>
                          : null}
                        <span style={{ color: d.difference > 0 ? '#dc2626' : '#059669' }}>{d.difference > 0 ? '+' : ''}${d.difference.toLocaleString()}</span>
                        {d.description && <span style={{ fontSize: '10px', color: '#6b7280', marginLeft: '6px' }}>({d.description})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rate Card Mismatches */}
            {vd.details?.filter(d => d.category === 'rates').length > 0 && (
              <div style={{ backgroundColor: '#faf5ff', borderRadius: '8px', padding: '14px', border: '1px solid #d8b4fe', marginBottom: '8px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#6b21a8' }}>Rate Card Mismatches (Inflated Rates?)</h4>
                {vd.details.filter(d => d.category === 'rates').map((d, i) => (
                  <div key={i}>
                    {d.rate_issues?.map((ri, j) => (
                      <div key={j} style={{ padding: '4px 10px', backgroundColor: '#f5f3ff', borderRadius: '4px', marginBottom: '4px', fontSize: '12px' }}>
                        <strong>{ri.classification || ri.equipment_type}</strong>: Agreed ${ri.agreed_rate}/hr → Claiming ${ri.claimed_rate}/hr
                        <span style={{ color: '#dc2626', fontWeight: '600', marginLeft: '8px' }}>+${ri.difference}/hr</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
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
              ['dispute', 'Dispute — Variance (numbers don\'t match)'],
              ['ticket_altered', 'Dispute — Ticket Altered (contractor\'s copy differs from our original)']
            ].map(([val, label]) => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: val === 'ticket_altered' ? '#dc2626' : 'inherit', fontWeight: val === 'ticket_altered' ? '600' : '400' }}>
                <input type="radio" name="resolution" value={val} checked={resolution === val} onChange={e => setResolution(e.target.value)} />
                {label}
              </label>
            ))}
          </div>
          {resolution !== 'accept_inspector' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                Resolution Notes {resolution === 'ticket_altered' ? '(required — describe what was altered)' : '(required)'}
              </label>
              <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} rows={3} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }}
                placeholder={resolution === 'ticket_altered' ? 'Describe the differences between our original photo and the contractor\'s submitted copy...' : 'Explain the resolution...'} />
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={saveResolution} disabled={saving || (resolution !== 'accept_inspector' && !resolutionNotes.trim())}
              style={{ padding: '8px 20px', backgroundColor: (resolution === 'dispute' || resolution === 'ticket_altered') ? '#dc2626' : '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
              {resolution === 'ticket_altered' ? 'Flag Ticket Altered' : resolution === 'dispute' ? 'Dispute' : 'Approve'}
            </button>
            <button onClick={() => setReviewItem(null)} style={{ padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

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

  const ticketSummaries = useMemo(() => subView === 'inspectorReports' ? getTicketSummaries() : [], [subView, reports, labourRates, equipmentRates])
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
          {subView === 'contractorLems' && !showUpload && !showInvoiceUpload && (
            <>
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
          <LEMUpload onUploadComplete={() => { setShowUpload(false); loadLemUploads() }} />
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
                </tr>
              </thead>
              <tbody>
                {ticketSummaries.length === 0 ? (
                  <tr><td colSpan="13" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No inspector reports found for this date range.</td></tr>
                ) : ticketSummaries.map((t, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: t.unmatchedRates > 0 ? '#fffbeb' : 'transparent' }}>
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
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {t.photoUrls.length > 0 ? (
                        <button onClick={() => window.open(t.photoUrls[0], '_blank')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px' }}
                          title="View ticket photo">
                          📷{t.photoUrls.length > 1 ? ` (${t.photoUrls.length})` : ''}
                        </button>
                      ) : '-'}
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

      {/* LEM detail or list view */}
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
            <div style={{ display: 'flex', gap: '12px' }}>
              {selectedLem.status === 'parsed' && (
                <button onClick={runReconciliation} disabled={saving}
                  style={{ padding: '10px 24px', backgroundColor: saving ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600' }}>
                  {saving ? 'Reconciling...' : 'Run Reconciliation'}
                </button>
              )}
              {selectedLem.status === 'reconciled' && unmatched.length === 0 && (
                <button onClick={approveReconciliation} disabled={saving}
                  style={{ padding: '10px 24px', backgroundColor: saving ? '#9ca3af' : '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600' }}>
                  Approve Reconciliation
                </button>
              )}
              {selectedLem.status === 'approved' && (
                <span style={{ padding: '10px 24px', backgroundColor: '#f0fdf4', color: '#059669', borderRadius: '6px', fontWeight: '600', border: '1px solid #bbf7d0' }}>
                  ✅ Approved — Invoice upload unlocked
                </span>
              )}
            </div>
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
                  <th style={{ textAlign: 'right', padding: '8px' }}>Variance</th>
                </tr></thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px', fontWeight: '500' }}>Labour Hours</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{totalLemLabour.toFixed(1)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>-</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px', fontWeight: '500' }}>Equipment Hours</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{totalLemEquip.toFixed(1)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>-</td>
                  </tr>
                  <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: '700' }}>
                    <td style={{ padding: '8px' }}>Total Claimed</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>${(totalLemLabourCost + totalLemEquipCost).toLocaleString()}</td>
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
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>LEM Equip</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Their Copy</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Status</th>
                  <th style={{ color: 'white', padding: '10px 8px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: item.match_status === 'variance' ? '#fffbeb' : item.match_status === 'unmatched' ? '#fef2f2' : item.match_status === 'disputed' ? '#faf5ff' : 'transparent' }}>
                    <td style={{ padding: '8px', fontWeight: '500' }}>{item.ticket_number || '-'}</td>
                    <td style={{ padding: '8px' }}>{item.work_date || '-'}</td>
                    <td style={{ padding: '8px' }}>{item.crew_name || item.foreman || '-'}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{item.total_labour_hours || 0} hrs</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{item.total_equipment_hours || 0} hrs</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{item.contractor_ticket_url ? <span style={{ color: '#059669' }}>✅</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{statusBadge(item.match_status)}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {item.match_status !== 'resolved' && (
                        <button onClick={() => openReview(item)} disabled={loadingReview}
                          style={{ padding: '4px 10px', backgroundColor: item.match_status === 'unmatched' ? '#d97706' : '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                          {loadingReview ? '...' : 'Review'}
                        </button>
                      )}
                      {item.match_status === 'resolved' && <span style={{ fontSize: '11px', color: '#059669' }}>✓ Resolved</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* LEM uploads list with invoice status */
        <>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '24px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#1e3a5f' }}>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>Contractor</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>LEM #</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}>Period</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'right' }}>Total Claimed</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Recon Status</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Invoice Status</th>
                  <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {lemUploads.length === 0 ? (
                  <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No LEM uploads yet. Click "Upload Contractor LEM" to get started.</td></tr>
                ) : lemUploads.map(lem => {
                  const invStatus = getInvoiceStatus(lem.id, lem.status)
                  return (
                    <tr key={lem.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 12px', fontWeight: '500' }}>{lem.contractor_name}</td>
                      <td style={{ padding: '10px 12px' }}>{lem.lem_number || lem.source_filename}</td>
                      <td style={{ padding: '10px 12px' }}>{lem.lem_period_start || '-'} to {lem.lem_period_end || '-'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>${(parseFloat(lem.total_claimed) || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{statusBadge(lem.status)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', color: 'white', backgroundColor: invStatus.color }}>
                          {invStatus.emoji} {invStatus.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button onClick={() => selectLem(lem)} style={{ padding: '4px 12px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                          View
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
        </>
      )}
        </div>
      )}
    </div>
  )
}
