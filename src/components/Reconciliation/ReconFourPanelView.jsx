import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useOrgQuery } from '../../utils/queryHelpers.js'
import { useOrgPath } from '../../contexts/OrgContext.jsx'
import DocumentPanel from './DocumentPanel.jsx'
import VarianceComparisonPanel from './VarianceComparisonPanel.jsx'

/**
 * ReconFourPanelView — 4-panel document comparison keyed by ticket_number.
 *
 * Fetches from THREE sources:
 *   1. reconciliation_documents — uploaded contractor LEM + contractor ticket
 *   2. daily_reports — inspector report data (activity_blocks with labour/equipment)
 *   3. work-photos bucket — inspector's ticket photo (URL from report data)
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
  const [showVariance, setShowVariance] = useState(false)
  const [sameDayEntries, setSameDayEntries] = useState({ labour: [], equipment: [] })
  const [employeeRoster, setEmployeeRoster] = useState([])

  useEffect(() => {
    if (ticketNumber && organizationId) loadAllData()
  }, [ticketNumber, organizationId])

  async function loadAllData() {
    setLoading(true)

    // --- Source 1: Uploaded contractor documents ---
    let dq = supabase.from('reconciliation_documents')
      .select('*')
      .eq('ticket_number', ticketNumber)
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

    // --- Build employee roster (name → classification) from all reports ---
    const rosterMap = {}
    for (const report of (reports || [])) {
      for (const b of (report.activity_blocks || [])) {
        for (const l of (b.labourEntries || [])) {
          const name = (l.employeeName || l.employee_name || l.name || '').trim()
          const cls = (l.classification || '').trim()
          if (name && cls) {
            rosterMap[name.toUpperCase()] = { employeeName: name, classification: cls }
          }
        }
      }
    }
    setEmployeeRoster(Object.values(rosterMap).sort((a, b) => a.employeeName.localeCompare(b.employeeName)))

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

  // Organize uploaded docs by type
  const panels = {
    lem: uploadedDocs.find(d => d.doc_type === 'contractor_lem') || null,
    ticket: uploadedDocs.find(d => d.doc_type === 'contractor_ticket') || null,
  }
  console.log(`[ReconView] ticket=${ticketNumber} uploadedDocs=${uploadedDocs.length} panels.lem=${!!panels.lem} lemData=${!!lemData} matchedBlock=${!!matchedBlock}`)
  if (panels.lem) console.log('[ReconView] LEM file_urls:', panels.lem.file_urls)
  else console.log('[ReconView] No panels.lem — uploadedDocs:', JSON.stringify(uploadedDocs.map(d => ({ type: d.doc_type, org: d.organization_id }))))

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
            {meta.foreman && <span style={{ marginLeft: '12px', fontSize: '14px', color: '#6b7280' }}>{meta.foreman}</span>}
            {meta.date && <span style={{ marginLeft: '12px', fontSize: '14px', color: '#6b7280' }}>{meta.date}</span>}
          </div>
        </div>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>
          {panelCount} of 4 panels populated
        </span>
      </div>

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
          employeeRoster={employeeRoster}
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
                      change_type: 'reconciliation_edit',
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

      {/* LEM Comparison toggle — only show button when LEM data exists */}
      {lemData && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => setShowVariance(v => !v)}
            style={{
              padding: '6px 16px',
              backgroundColor: showVariance ? '#6b7280' : '#1e3a5f',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
            }}
          >
            {showVariance ? 'Hide LEM Comparison' : 'Show LEM Comparison'}
          </button>
        </div>
      )}

      {showVariance && (
        <VarianceComparisonPanel
          ticketNumber={ticketNumber}
          lemData={lemData}
          inspectorBlock={matchedBlock}
          organizationId={organizationId}
          onInspectorBlockChange={async (updatedBlock) => {
            if (!inspectorReport) return
            const blocks = [...(inspectorReport.activity_blocks || [])]
            const blockIdx = blocks.findIndex(b =>
              b.ticketNumber && String(b.ticketNumber).trim() === String(ticketNumber).trim()
            )
            if (blockIdx >= 0) {
              blocks[blockIdx] = updatedBlock
              await supabase.from('daily_reports')
                .update({ activity_blocks: blocks })
                .eq('id', inspectorReport.id)
              await supabase.from('report_audit_log').insert({
                report_id: inspectorReport.id,
                report_date: inspectorReport.date,
                changed_by_name: 'Cost Control',
                changed_by_role: 'admin',
                change_type: 'reconciliation_edit',
                section: 'Reconciliation Variance',
                field_name: `Ticket #${ticketNumber} inspector data`,
                new_value: 'Edited from variance comparison panel',
                organization_id: organizationId
              })
              setMatchedBlock(updatedBlock)
              setInspectorReport(prev => ({ ...prev, activity_blocks: blocks }))
            }
          }}
          uploadedLemUrls={panels.lem?.file_urls || []}
          uploadedLemDate={panels.lem?.date || meta.date || null}
          uploadedLemForeman={panels.lem?.foreman || meta.foreman || null}
          onLemDataExtracted={() => loadAllData()}
        />
      )}
    </div>
  )
}
