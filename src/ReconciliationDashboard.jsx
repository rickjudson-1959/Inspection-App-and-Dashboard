import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { logFieldChange, logStatusChange } from './auditLoggerV3'

const PROJECT_NAME = "Clearwater Pipeline - Demo Project"

export default function ReconciliationDashboard() {
  const navigate = useNavigate()
  const [contractorData, setContractorData] = useState([])
  const [inspectorData, setInspectorData] = useState([])
  const [disputes, setDisputes] = useState([])
  const [corrections, setCorrections] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30')
  const [selectedLemId, setSelectedLemId] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [correctedValue, setCorrectedValue] = useState('')
  const [viewMode, setViewMode] = useState('reconciliation')
  const [disputeFilter, setDisputeFilter] = useState('all')
  const [adminName, setAdminName] = useState('Admin') // Could come from auth
  
  // Billing state
  const [billingFilter, setBillingFilter] = useState('all')
  const [selectedForBilling, setSelectedForBilling] = useState([])
  const [billingBatches, setBillingBatches] = useState([])
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  
  // Invoicing workflow state
  const [hideInvoiced, setHideInvoiced] = useState(true) // Default: hide invoiced tickets
  const [thirdPartyOnly, setThirdPartyOnly] = useState(false) // Filter for third-party tickets
  const [showArchived, setShowArchived] = useState(false) // Show archived/invoiced view
  const [pendingInvoiceLems, setPendingInvoiceLems] = useState([]) // LEMs ready to be invoiced
  const [showInvoiceAssignModal, setShowInvoiceAssignModal] = useState(false) // New invoice assignment modal
  const [invoiceSearch, setInvoiceSearch] = useState('') // Search by invoice number in archived view
  
  // Verification modal state (No Talk - side by side view)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyingLem, setVerifyingLem] = useState(null)
  const [discrepancyNote, setDiscrepancyNote] = useState('')
  const [verifiedLabourCost, setVerifiedLabourCost] = useState('')
  const [verifiedEquipmentCost, setVerifiedEquipmentCost] = useState('')
  
  // Rate tables for cost calculations
  const [labourRates, setLabourRates] = useState([])
  const [equipmentRates, setEquipmentRates] = useState([])

  // Trench/Ditch pay items data
  const [trenchLogs, setTrenchLogs] = useState([])
  
  // Variance highlighting - which rows are mismatched
  const [highlightMismatches, setHighlightMismatches] = useState(false)
  const [mismatchedLabour, setMismatchedLabour] = useState([]) // Array of employee names with mismatches
  const [mismatchedEquipment, setMismatchedEquipment] = useState([]) // Array of equipment IDs with mismatches

  useEffect(() => { loadData() }, [dateRange, hideInvoiced, thirdPartyOnly, showArchived])

  async function loadData() {
    setLoading(true)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    // Build query with filters
    let lemsQuery = supabase.from('contractor_lems').select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
    
    // Apply "swipe clean" filter - hide invoiced by default
    if (hideInvoiced && !showArchived) {
      lemsQuery = lemsQuery.neq('billing_status', 'invoiced')
    }
    
    // If showing archived only, filter to invoiced only
    if (showArchived) {
      lemsQuery = lemsQuery.eq('billing_status', 'invoiced')
    }
    
    // Third-party filter
    if (thirdPartyOnly) {
      lemsQuery = lemsQuery.eq('is_third_party', true)
    }
    
    const { data: lems } = await lemsQuery.order('date', { ascending: false })

    const { data: reports } = await supabase.from('daily_tickets').select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false })

    const { data: disputeData } = await supabase.from('disputes').select('*')
      .order('created_at', { ascending: false })

    const { data: correctionData } = await supabase.from('reconciliation_corrections').select('*')
      .order('created_at', { ascending: false })

    const { data: batchData } = await supabase.from('billing_batches').select('*')
      .order('created_at', { ascending: false })

    // Load rate tables for cost calculations
    const { data: labourRateData } = await supabase.from('labour_rates').select('*')
      .order('effective_date', { ascending: false })

    const { data: equipRateData } = await supabase.from('equipment_rates').select('*')
      .order('effective_date', { ascending: false })

    // Load trench logs for ditching pay items
    const { data: trenchLogData } = await supabase.from('trench_logs').select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false })

    setContractorData(lems || [])
    setTrenchLogs(trenchLogData || [])
    setInspectorData(reports || [])
    setDisputes(disputeData || [])
    setCorrections(correctionData || [])
    setBillingBatches(batchData || [])
    setLabourRates(labourRateData || [])
    setEquipmentRates(equipRateData || [])
    if (lems?.length > 0 && !selectedLemId) setSelectedLemId(lems[0].field_log_id)
    setLoading(false)
  }

  const selectedLem = contractorData.find(l => l.field_log_id === selectedLemId)
  
  const matchingReport = selectedLem ? inspectorData.find(r => {
    if (r.date !== selectedLem.date) return false
    const blocks = r.activity_blocks || []
    return blocks.some(b => 
      b.foreman?.toLowerCase().includes(selectedLem.foreman?.toLowerCase()?.split(' ')[0] || '') ||
      selectedLem.foreman?.toLowerCase().includes(b.foreman?.toLowerCase()?.split(' ')[0] || '')
    )
  }) : null

  let timesheetLabour = [], timesheetEquipment = [], ticketPhotos = []
  if (matchingReport) {
    (matchingReport.activity_blocks || []).forEach(block => {
      if (block.labourEntries) timesheetLabour = [...timesheetLabour, ...block.labourEntries]
      if (block.equipmentEntries) timesheetEquipment = [...timesheetEquipment, ...block.equipmentEntries]
      if (block.workPhotos) block.workPhotos.forEach(p => {
        const fn = typeof p === 'string' ? p : p.filename
        if (fn?.toLowerCase().includes('ticket')) ticketPhotos.push(fn)
      })
    })
  }

  const lemLabour = selectedLem?.labour_entries || []
  const lemEquipment = selectedLem?.equipment_entries || []

  // Check status
  function getItemStatus(lemId, itemName, type) {
    const dispute = disputes.find(d => d.lem_id === lemId && d.item_name === itemName && d.dispute_type === type)
    const correction = corrections.find(c => c.lem_id === lemId && c.item_name === itemName && c.correction_type === type)
    if (dispute) return { type: 'disputed', status: dispute.status, data: dispute }
    if (correction) return { type: 'corrected', data: correction }
    return null
  }

  function buildLabourComparison() {
    const comp = [], matched = new Set()
    lemLabour.forEach(lw => {
      const name = (lw.name || '').toUpperCase().trim()
      const lemHrs = (parseFloat(lw.rt_hours) || 0) + (parseFloat(lw.ot_hours) || 0)
      const rate = parseFloat(lw.rt_rate) || 50
      const tsMatch = timesheetLabour.find(t => {
        const tn = (t.employeeName || t.name || '').toUpperCase().trim()
        return tn === name || tn.includes(name.split(' ')[0]) || name.includes(tn.split(' ')[0])
      })
      const tsHrs = tsMatch ? (parseFloat(tsMatch.hours) || (parseFloat(tsMatch.rt)||0) + (parseFloat(tsMatch.ot)||0)) : 0
      if (tsMatch) matched.add(tsMatch.employeeName || tsMatch.name)
      const variance = lemHrs - tsHrs
      const itemStatus = getItemStatus(selectedLem?.field_log_id, name, 'labour')
      comp.push({ 
        name, 
        classification: lw.type, 
        lemHours: lemHrs, 
        timesheetHours: tsHrs, 
        variance,
        varianceCost: variance > 0 ? variance * rate : 0,
        rate,
        status: !tsMatch ? 'not_found' : lemHrs > tsHrs ? 'over' : 'match',
        itemStatus,
        tsMatch
      })
    })
    timesheetLabour.forEach(ts => {
      if (!matched.has(ts.employeeName || ts.name)) {
        const hrs = parseFloat(ts.hours) || (parseFloat(ts.rt)||0) + (parseFloat(ts.ot)||0)
        const name = (ts.employeeName || ts.name || '').toUpperCase()
        const itemStatus = getItemStatus(selectedLem?.field_log_id, name, 'labour')
        comp.push({ 
          name, 
          classification: ts.classification, 
          lemHours: 0, 
          timesheetHours: hrs, 
          variance: -hrs,
          varianceCost: 0,
          status: 'not_billed',
          itemStatus,
          tsMatch: ts
        })
      }
    })
    return comp.sort((a,b) => Math.abs(b.variance) - Math.abs(a.variance))
  }

  function buildEquipmentComparison() {
    const comp = [], matched = new Set()
    lemEquipment.forEach(le => {
      const type = (le.type || le.equipment_id || '').toUpperCase().trim()
      const lemHrs = parseFloat(le.hours) || 0
      const rate = parseFloat(le.rate) || 100
      const tsMatch = timesheetEquipment.find(t => {
        const tt = (t.type || '').toUpperCase().trim()
        return tt === type || tt.includes(type.split(' ')[0]) || type.includes(tt.split(' ')[0])
      })
      const tsHrs = tsMatch ? parseFloat(tsMatch.hours) || 0 : 0
      if (tsMatch) matched.add(tsMatch.type)
      const variance = lemHrs - tsHrs
      const itemStatus = getItemStatus(selectedLem?.field_log_id, type, 'equipment')
      comp.push({ 
        type, 
        equipmentId: le.equipment_id, 
        lemHours: lemHrs, 
        timesheetHours: tsHrs, 
        variance,
        varianceCost: variance > 0 ? variance * rate : 0,
        rate,
        status: !tsMatch ? 'not_found' : lemHrs > tsHrs ? 'over' : 'match',
        itemStatus,
        tsMatch
      })
    })
    timesheetEquipment.forEach(ts => {
      if (!matched.has(ts.type)) {
        const type = (ts.type||'').toUpperCase()
        const itemStatus = getItemStatus(selectedLem?.field_log_id, type, 'equipment')
        comp.push({ 
          type, 
          lemHours: 0, 
          timesheetHours: parseFloat(ts.hours)||0, 
          variance: -(parseFloat(ts.hours)||0),
          varianceCost: 0,
          status: 'not_billed',
          itemStatus,
          tsMatch: ts
        })
      }
    })
    return comp.sort((a,b) => Math.abs(b.variance) - Math.abs(a.variance))
  }

  const labourComp = buildLabourComparison()
  const equipComp = buildEquipmentComparison()
  const lemLabourTotal = lemLabour.reduce((s,l) => s + (parseFloat(l.rt_hours)||0) + (parseFloat(l.ot_hours)||0), 0)
  const lemEquipTotal = lemEquipment.reduce((s,e) => s + (parseFloat(e.hours)||0), 0)
  const tsLabourTotal = timesheetLabour.reduce((s,l) => s + (parseFloat(l.hours)||(parseFloat(l.rt)||0)+(parseFloat(l.ot)||0)), 0)
  const tsEquipTotal = timesheetEquipment.reduce((s,e) => s + (parseFloat(e.hours)||0), 0)
  const labourVar = labourComp.filter(l => l.variance > 0).reduce((s,l) => s + l.variance, 0)
  const equipVar = equipComp.filter(e => e.variance > 0).reduce((s,e) => s + e.variance, 0)
  const totalCost = contractorData.reduce((s,l) => s + (parseFloat(l.total_labour_cost)||0) + (parseFloat(l.total_equipment_cost)||0), 0)

  // Open review modal
  function openReviewModal(item, itemType) {
    setSelectedItem({ 
      ...item, 
      itemType, 
      lemId: selectedLem.field_log_id, 
      lemDate: selectedLem.date, 
      foreman: selectedLem.foreman, 
      contractor: selectedLem.contractor,
      ticketNumber: matchingReport?.id || 'N/A'
    })
    setReviewNotes('')
    setCorrectedValue(item.timesheetHours?.toString() || '')
    setShowReviewModal(true)
  }

  // Admin fixes the issue
  async function adminFix() {
    if (!selectedItem) return
    
    const correctionData = {
      lem_id: selectedItem.lemId,
      lem_date: selectedItem.lemDate,
      correction_type: selectedItem.itemType,
      item_name: selectedItem.itemType === 'labour' ? selectedItem.name : selectedItem.type,
      original_value: selectedItem.lemHours.toString(),
      corrected_value: correctedValue,
      corrected_by_name: adminName,
      correction_source: 'admin_fix',
      notes: reviewNotes
    }

    const { error } = await supabase.from('reconciliation_corrections').insert([correctionData])
    
    if (error) {
      alert('Error saving correction: ' + error.message)
    } else {
      // Also log to audit trail for Compliance Audit Trail visibility
      const itemName = selectedItem.itemType === 'labour' ? selectedItem.name : selectedItem.type
      const variance = selectedItem.lemHours - parseFloat(correctedValue)
      
      await supabase.from('report_audit_log').insert({
        report_id: selectedItem.ticketNumber !== 'N/A' ? selectedItem.ticketNumber : null,
        report_date: selectedItem.lemDate,
        changed_by_name: adminName,
        changed_by_role: 'admin',
        change_type: 'reconciliation',
        section: 'Reconciliation',
        field_name: `${itemName} - Hours`,
        old_value: selectedItem.lemHours.toString(),
        new_value: correctedValue,
        change_reason: reviewNotes || `Corrected based on Inspector Report. Variance: ${variance.toFixed(1)} hrs`
      })
      
      setShowReviewModal(false)
      loadData()
    }
  }

  // Flag for contractor
  async function flagForContractor() {
    if (!selectedItem) return

    const disputeData = {
      lem_id: selectedItem.lemId,
      lem_date: selectedItem.lemDate,
      foreman: selectedItem.foreman,
      contractor: selectedItem.contractor,
      dispute_type: selectedItem.itemType,
      item_name: selectedItem.itemType === 'labour' ? selectedItem.name : selectedItem.type,
      lem_hours: selectedItem.lemHours,
      timesheet_hours: selectedItem.timesheetHours,
      variance_hours: selectedItem.variance,
      variance_cost: selectedItem.varianceCost || 0,
      status: 'open',
      notes: reviewNotes,
      evidence_photo: ticketPhotos[0] || null
    }

    const { error } = await supabase.from('disputes').insert([disputeData])
    
    if (error) {
      alert('Error creating dispute: ' + error.message)
    } else {
      // Also log to audit trail for Compliance Audit Trail visibility
      const itemName = selectedItem.itemType === 'labour' ? selectedItem.name : selectedItem.type
      
      await supabase.from('report_audit_log').insert({
        report_id: selectedItem.ticketNumber !== 'N/A' ? selectedItem.ticketNumber : null,
        report_date: selectedItem.lemDate,
        changed_by_name: adminName,
        changed_by_role: 'admin',
        change_type: 'dispute',
        section: 'Reconciliation',
        field_name: `${itemName} - Dispute`,
        old_value: `LEM: ${selectedItem.lemHours} hrs`,
        new_value: `Inspector: ${selectedItem.timesheetHours} hrs`,
        change_reason: reviewNotes || `Flagged for contractor review. Variance: ${selectedItem.variance} hrs ($${selectedItem.varianceCost?.toFixed(0) || 0})`
      })
      
      setShowReviewModal(false)
      loadData()
    }
  }

  // Flag all issues
  async function flagAllIssues() {
    const allDisputes = []
    
    labourComp.forEach(l => {
      if ((l.status === 'over' || l.status === 'not_found') && !l.itemStatus) {
        allDisputes.push({
          lem_id: selectedLem.field_log_id,
          lem_date: selectedLem.date,
          foreman: selectedLem.foreman,
          contractor: selectedLem.contractor,
          dispute_type: 'labour',
          item_name: l.name,
          lem_hours: l.lemHours,
          timesheet_hours: l.timesheetHours,
          variance_hours: l.variance,
          variance_cost: l.varianceCost || 0,
          status: 'open',
          notes: l.status === 'not_found' ? 'Worker not found on daily timesheet' : 'LEM hours exceed timesheet hours',
          evidence_photo: ticketPhotos[0] || null
        })
      }
    })

    equipComp.forEach(e => {
      if ((e.status === 'over' || e.status === 'not_found') && !e.itemStatus) {
        allDisputes.push({
          lem_id: selectedLem.field_log_id,
          lem_date: selectedLem.date,
          foreman: selectedLem.foreman,
          contractor: selectedLem.contractor,
          dispute_type: 'equipment',
          item_name: e.type,
          lem_hours: e.lemHours,
          timesheet_hours: e.timesheetHours,
          variance_hours: e.variance,
          variance_cost: e.varianceCost || 0,
          status: 'open',
          notes: e.status === 'not_found' ? 'Equipment not observed by inspector' : 'LEM hours exceed timesheet hours',
          evidence_photo: ticketPhotos[0] || null
        })
      }
    })

    if (allDisputes.length === 0) {
      alert('No issues to flag')
      return
    }

    const { error } = await supabase.from('disputes').insert(allDisputes)
    
    if (error) {
      alert('Error creating disputes: ' + error.message)
    } else {
      alert(`Successfully flagged ${allDisputes.length} issues for contractor review`)
      loadData()
    }
  }

  // Update dispute status
  async function updateDisputeStatus(disputeId, newStatus) {
    const updateData = { status: newStatus, updated_at: new Date().toISOString() }
    if (newStatus === 'resolved') updateData.resolved_at = new Date().toISOString()
    const { error } = await supabase.from('disputes').update(updateData).eq('id', disputeId)
    if (!error) {
      // Log status change to audit trail
      const dispute = disputes.find(d => d.id === disputeId)
      if (dispute) {
        await supabase.from('report_audit_log').insert({
          report_date: dispute.lem_date,
          changed_by_name: adminName,
          changed_by_role: 'admin',
          change_type: 'dispute_status',
          section: 'Reconciliation',
          field_name: `${dispute.item_name} - Status`,
          old_value: dispute.status,
          new_value: newStatus,
          change_reason: `Dispute status updated to ${newStatus}`
        })
      }
      loadData()
    }
  }

  // Email dispute to contractor
  async function emailDisputeToContractor(dispute) {
    const projectName = PROJECT_NAME
    const varianceCost = (dispute.variance_hours * 125).toFixed(2)
    
    const subject = encodeURIComponent(`LEM Dispute Notice - ${dispute.lem_id} - ${dispute.item_name}`)
    
    const body = encodeURIComponent(`
DISPUTE NOTIFICATION
════════════════════════════════════════════════════════

Project: ${projectName}
Field Log ID: ${dispute.lem_id}
Date: ${dispute.lem_date}
Foreman: ${dispute.foreman || 'N/A'}

────────────────────────────────────────────────────────
DISPUTED ITEM
────────────────────────────────────────────────────────

Type: ${dispute.dispute_type === 'labour' ? 'Labour' : 'Equipment'}
Item: ${dispute.item_name}

LEM Claimed Hours: ${dispute.lem_hours}
Inspector Verified Hours: ${dispute.timesheet_hours}
Variance: +${dispute.variance_hours} hours
Estimated Cost Impact: $${varianceCost}

────────────────────────────────────────────────────────
NOTES
────────────────────────────────────────────────────────

${dispute.notes || 'No additional notes provided.'}

────────────────────────────────────────────────────────
ACTION REQUIRED
────────────────────────────────────────────────────────

Please review this discrepancy and provide supporting documentation or acknowledgment of the variance.

Respond to this email with:
1. Supporting documentation (timesheets, daily logs)
2. Explanation of variance
3. Acceptance or dispute of findings

This notice was generated by Pipe-Up Inspector Platform.

────────────────────────────────────────────────────────
`)

    // Open email client
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank')
    
    // Update dispute status to show it was sent
    await supabase.from('disputes').update({ 
      status: 'disputed',
      emailed_at: new Date().toISOString()
    }).eq('id', dispute.id)
    
    // Log to audit trail
    await supabase.from('report_audit_log').insert({
      report_date: dispute.lem_date,
      changed_by_name: adminName,
      changed_by_role: 'admin',
      change_type: 'dispute_email',
      section: 'Reconciliation',
      field_name: `${dispute.item_name} - Email Sent`,
      old_value: 'Not Sent',
      new_value: 'Emailed to Contractor',
      change_reason: `Dispute notice emailed. Variance: ${dispute.variance_hours} hrs ($${varianceCost})`
    })
    
    loadData()
  }

  // Email all open disputes to contractor
  async function emailAllDisputesToContractor() {
    const openDisputes = disputes.filter(d => d.status === 'open' || d.status === 'disputed')
    
    if (openDisputes.length === 0) {
      alert('No open disputes to email')
      return
    }
    
    const projectName = PROJECT_NAME
    let totalVarianceHours = 0
    let totalVarianceCost = 0
    
    let disputeList = ''
    openDisputes.forEach(d => {
      const cost = d.variance_hours * 125
      totalVarianceHours += d.variance_hours
      totalVarianceCost += cost
      disputeList += `
• ${d.lem_id} | ${d.lem_date} | ${d.item_name}
  LEM: ${d.lem_hours} hrs → Inspector: ${d.timesheet_hours} hrs
  Variance: +${d.variance_hours} hrs ($${cost.toFixed(2)})
  ${d.notes ? `Notes: ${d.notes}` : ''}
`
    })
    
    const subject = encodeURIComponent(`LEM Dispute Summary - ${projectName} - ${openDisputes.length} Items`)
    
    const body = encodeURIComponent(`
DISPUTE SUMMARY NOTIFICATION
════════════════════════════════════════════════════════

Project: ${projectName}
Generated: ${new Date().toLocaleDateString()}
Total Disputed Items: ${openDisputes.length}

────────────────────────────────────────────────────────
FINANCIAL SUMMARY
────────────────────────────────────────────────────────

Total Variance Hours: +${totalVarianceHours.toFixed(1)} hours
Total Estimated Cost Impact: $${totalVarianceCost.toFixed(2)}

────────────────────────────────────────────────────────
DISPUTED ITEMS
────────────────────────────────────────────────────────
${disputeList}

────────────────────────────────────────────────────────
ACTION REQUIRED
────────────────────────────────────────────────────────

Please review all disputed items and provide supporting documentation.

This notice was generated by Pipe-Up Inspector Platform.

────────────────────────────────────────────────────────
`)

    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank')
    
    // Update all open disputes to "disputed" (sent to contractor)
    for (const dispute of openDisputes) {
      await supabase.from('disputes').update({ 
        status: 'disputed',
        emailed_at: new Date().toISOString()
      }).eq('id', dispute.id)
    }
    
    // Log to audit trail
    await supabase.from('report_audit_log').insert({
      changed_by_name: adminName,
      changed_by_role: 'admin',
      change_type: 'dispute_email_batch',
      section: 'Reconciliation',
      field_name: 'Batch Dispute Email',
      old_value: `${openDisputes.length} disputes`,
      new_value: 'Emailed to Contractor',
      change_reason: `Batch dispute notice sent. Total variance: ${totalVarianceHours.toFixed(1)} hrs ($${totalVarianceCost.toFixed(2)})`
    })
    
    // Reload data to show updated statuses
    loadData()
  }

  // Export dispute report
  function exportDisputeReport() {
    const openDisputes = disputes.filter(d => disputeFilter === 'all' || d.status === disputeFilter)
    
    let report = `DISPUTE REPORT\n`
    report += `Generated: ${new Date().toLocaleDateString()}\n`
    report += `Project: ${PROJECT_NAME}\n`
    report += `═══════════════════════════════════════════════════\n\n`

    const grouped = {}
    openDisputes.forEach(d => {
      if (!grouped[d.lem_id]) grouped[d.lem_id] = []
      grouped[d.lem_id].push(d)
    })

    Object.entries(grouped).forEach(([lemId, items]) => {
      report += `FIELD LOG: ${lemId}\n`
      report += `Date: ${items[0].lem_date}\n`
      report += `Foreman: ${items[0].foreman || 'N/A'}\n`
      report += `───────────────────────────────────────────────────\n`
      
      items.forEach(d => {
        report += `\n  ${d.dispute_type.toUpperCase()}: ${d.item_name}\n`
        report += `  LEM Hours: ${d.lem_hours} | Timesheet Hours: ${d.timesheet_hours}\n`
        report += `  Variance: ${d.variance_hours} hours ($${d.variance_cost?.toFixed(2) || '0.00'})\n`
        report += `  Status: ${d.status.toUpperCase()}\n`
        report += `  Notes: ${d.notes || 'None'}\n`
      })
      report += `\n═══════════════════════════════════════════════════\n\n`
    })

    const totalVariance = openDisputes.reduce((s, d) => s + (d.variance_cost || 0), 0)
    report += `SUMMARY\n`
    report += `Total Disputed Items: ${openDisputes.length}\n`
    report += `Total Variance Amount: $${totalVariance.toFixed(2)}\n`

    const blob = new Blob([report], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Dispute_Report_${new Date().toISOString().split('T')[0]}.txt`
    a.click()
  }

  const filteredDisputes = disputes.filter(d => disputeFilter === 'all' || d.status === disputeFilter)

  const statusColors = {
    open: { bg: '#fef3c7', text: '#92400e', label: 'Open' },
    disputed: { bg: '#fee2e2', text: '#991b1b', label: 'Sent to Contractor' },
    under_review: { bg: '#dbeafe', text: '#1e40af', label: 'Under Review' },
    resolved: { bg: '#d1fae5', text: '#065f46', label: 'Resolved' },
    rejected: { bg: '#f3f4f6', text: '#374151', label: 'Rejected' }
  }

  // Billing status colors
  const billingStatusColors = {
    open: { bg: '#fef3c7', text: '#92400e', label: 'Open' },
    matched: { bg: '#dbeafe', text: '#1e40af', label: 'Matched' },
    disputed: { bg: '#fee2e2', text: '#991b1b', label: 'Disputed' },
    ready_for_billing: { bg: '#d1fae5', text: '#065f46', label: 'Ready for Billing' },
    invoiced: { bg: '#c7d2fe', text: '#3730a3', label: 'Invoiced' }
  }

  // Filter LEMs by billing status and invoice search
  const filteredBillingLems = contractorData.filter(lem => {
    const status = lem.billing_status || 'open'
    const matchesFilter = billingFilter === 'all' || status === billingFilter
    
    // If searching by invoice number in archived view
    if (showArchived && invoiceSearch.trim()) {
      const searchLower = invoiceSearch.toLowerCase().trim()
      const matchesInvoice = (lem.invoice_number || '').toLowerCase().includes(searchLower)
      return matchesFilter && matchesInvoice
    }
    
    return matchesFilter
  })

  // Calculate billing totals by status
  const billingTotals = {
    open: contractorData.filter(l => !l.billing_status || l.billing_status === 'open'),
    matched: contractorData.filter(l => l.billing_status === 'matched'),
    disputed: contractorData.filter(l => l.billing_status === 'disputed'),
    ready_for_billing: contractorData.filter(l => l.billing_status === 'ready_for_billing'),
    invoiced: contractorData.filter(l => l.billing_status === 'invoiced')
  }

  const calcTotal = (lems) => lems.reduce((sum, l) => sum + (parseFloat(l.total_labour_cost) || 0) + (parseFloat(l.total_equipment_cost) || 0), 0)

  // Open verification modal for a LEM (No Talk - side by side view)
  function openVerifyModal(lem) {
    setVerifyingLem(lem)
    setVerifiedLabourCost(lem.total_labour_cost?.toString() || '0')
    setVerifiedEquipmentCost(lem.total_equipment_cost?.toString() || '0')
    setDiscrepancyNote(lem.discrepancy_note || '')
    setHighlightMismatches(false)
    setMismatchedLabour([])
    setMismatchedEquipment([])
    setShowVerifyModal(true)
  }

  // Get rate for a classification from rate table
  function getLabourRate(classification) {
    if (!classification || labourRates.length === 0) return { rt: 0, ot: 0 }
    // Try exact match first, then partial match
    const exactMatch = labourRates.find(r => 
      r.classification?.toLowerCase() === classification.toLowerCase()
    )
    if (exactMatch) return { rt: parseFloat(exactMatch.rate_st) || 0, ot: parseFloat(exactMatch.rate_ot) || 0 }
    
    // Partial match
    const partialMatch = labourRates.find(r => 
      r.classification?.toLowerCase().includes(classification.toLowerCase()) ||
      classification.toLowerCase().includes(r.classification?.toLowerCase() || '')
    )
    if (partialMatch) return { rt: parseFloat(partialMatch.rate_st) || 0, ot: parseFloat(partialMatch.rate_ot) || 0 }
    
    return { rt: 0, ot: 0 }
  }

  // Get rate for equipment type from rate table
  function getEquipmentRate(equipType) {
    if (!equipType || equipmentRates.length === 0) return 0
    // Try exact match first, then partial match
    const exactMatch = equipmentRates.find(r => 
      r.equipment_type?.toLowerCase() === equipType.toLowerCase()
    )
    if (exactMatch) return parseFloat(exactMatch.rate_hourly) || 0
    
    // Partial match
    const partialMatch = equipmentRates.find(r => 
      r.equipment_type?.toLowerCase().includes(equipType.toLowerCase()) ||
      equipType.toLowerCase().includes(r.equipment_type?.toLowerCase() || '')
    )
    if (partialMatch) return parseFloat(partialMatch.rate_hourly) || 0
    
    return 0
  }

  // Calculate mismatches between LEM and Inspector data
  function calculateMismatches(lem, inspData) {
    const labourMismatches = []
    const equipMismatches = []
    
    if (!inspData) return { labourMismatches, equipMismatches }
    
    const lemLabour = lem.labour_entries || []
    const inspLabour = inspData.labour || []
    const lemEquip = lem.equipment_entries || []
    const inspEquip = inspData.equipment || []
    
    // Check labour mismatches
    lemLabour.forEach(lemEntry => {
      const name = (lemEntry.name || lemEntry.employee_name || '').toLowerCase()
      const lemHrs = (parseFloat(lemEntry.rt_hours || lemEntry.rt || 0)) + (parseFloat(lemEntry.ot_hours || lemEntry.ot || 0))
      
      // Find matching inspector entry
      const inspEntry = inspLabour.find(i => {
        const inspName = (i.employeeName || i.name || '').toLowerCase()
        return inspName.includes(name.split(' ')[0]) || name.includes(inspName.split(' ')[0])
      })
      
      if (!inspEntry) {
        labourMismatches.push(name) // Not found in inspector
      } else {
        const inspHrs = parseFloat(inspEntry.hours) || ((parseFloat(inspEntry.rt) || 0) + (parseFloat(inspEntry.ot) || 0))
        if (Math.abs(lemHrs - inspHrs) > 0.1) {
          labourMismatches.push(name) // Hours don't match
        }
      }
    })
    
    // Check for inspector entries not in LEM
    inspLabour.forEach(inspEntry => {
      const inspName = (inspEntry.employeeName || inspEntry.name || '').toLowerCase()
      const found = lemLabour.find(l => {
        const lemName = (l.name || l.employee_name || '').toLowerCase()
        return lemName.includes(inspName.split(' ')[0]) || inspName.includes(lemName.split(' ')[0])
      })
      if (!found && !labourMismatches.includes(inspName)) {
        labourMismatches.push(inspName)
      }
    })
    
    // Check equipment mismatches
    lemEquip.forEach(lemEntry => {
      const equipId = (lemEntry.equipment_id || lemEntry.unit_number || lemEntry.type || '').toLowerCase()
      const lemHrs = parseFloat(lemEntry.hours || 0)
      
      const inspEntry = inspEquip.find(i => {
        const inspType = (i.type || i.equipment_type || i.unit_number || '').toLowerCase()
        return inspType.includes(equipId) || equipId.includes(inspType)
      })
      
      if (!inspEntry) {
        equipMismatches.push(equipId)
      } else {
        const inspHrs = parseFloat(inspEntry.hours || 0)
        if (Math.abs(lemHrs - inspHrs) > 0.1) {
          equipMismatches.push(equipId)
        }
      }
    })
    
    return { labourMismatches, equipMismatches }
  }

  // Toggle mismatch highlighting
  function toggleMismatchHighlight(lem, inspData) {
    if (highlightMismatches) {
      setHighlightMismatches(false)
      setMismatchedLabour([])
      setMismatchedEquipment([])
    } else {
      const { labourMismatches, equipMismatches } = calculateMismatches(lem, inspData)
      setMismatchedLabour(labourMismatches)
      setMismatchedEquipment(equipMismatches)
      setHighlightMismatches(true)
    }
  }

  // Check if a labour row is mismatched
  function isLabourMismatched(name) {
    if (!highlightMismatches) return false
    const lowerName = (name || '').toLowerCase()
    return mismatchedLabour.some(m => lowerName.includes(m) || m.includes(lowerName.split(' ')[0]))
  }

  // Check if an equipment row is mismatched
  function isEquipmentMismatched(id) {
    if (!highlightMismatches) return false
    const lowerId = (id || '').toLowerCase()
    return mismatchedEquipment.some(m => lowerId.includes(m) || m.includes(lowerId))
  }

  // Find matching inspector report for verification modal
  function getMatchingInspectorData(lem) {
    if (!lem) return null
    const match = inspectorData.find(r => {
      if (r.date !== lem.date) return false
      const blocks = r.activity_blocks || []
      return blocks.some(b => 
        b.foreman?.toLowerCase().includes(lem.foreman?.toLowerCase()?.split(' ')[0] || '') ||
        lem.foreman?.toLowerCase().includes(b.foreman?.toLowerCase()?.split(' ')[0] || '')
      )
    })
    if (!match) return null
    
    let labour = [], equipment = [], welds = [], photos = []
    ;(match.activity_blocks || []).forEach(block => {
      if (block.labourEntries) labour = [...labour, ...block.labourEntries]
      if (block.equipmentEntries) equipment = [...equipment, ...block.equipmentEntries]
      if (block.weldEntries) welds = [...welds, ...block.weldEntries]
      if (block.workPhotos) photos = [...photos, ...block.workPhotos]
    })
    return { report: match, labour, equipment, welds, photos }
  }

  // Calculate hours totals for a LEM
  function calcLemHours(lem) {
    const labour = (lem.labour_entries || []).reduce((sum, e) => 
      sum + (parseFloat(e.rt_hours) || 0) + (parseFloat(e.ot_hours) || 0), 0)
    const equipment = (lem.equipment_entries || []).reduce((sum, e) => 
      sum + (parseFloat(e.hours) || 0), 0)
    return { labour, equipment, total: labour + equipment }
  }

  // Calculate hours from inspector data
  function calcInspectorHours(inspData) {
    if (!inspData) return { labour: 0, equipment: 0, total: 0 }
    const labour = inspData.labour.reduce((sum, e) => 
      sum + (parseFloat(e.hours) || (parseFloat(e.rt) || 0) + (parseFloat(e.ot) || 0)), 0)
    const equipment = inspData.equipment.reduce((sum, e) => 
      sum + (parseFloat(e.hours) || 0), 0)
    return { labour, equipment, total: labour + equipment }
  }

  // Verify and mark as matched - THE MONEY must match
  async function verifyAsMatched() {
    if (!verifyingLem) return

    const originalLabour = parseFloat(verifyingLem.total_labour_cost) || 0
    const originalEquip = parseFloat(verifyingLem.total_equipment_cost) || 0
    const newLabour = parseFloat(verifiedLabourCost) || 0
    const newEquip = parseFloat(verifiedEquipmentCost) || 0

    try {
      // Update the LEM
      const { error } = await supabase
        .from('contractor_lems')
        .update({
          billing_status: 'matched',
          total_labour_cost: newLabour,
          total_equipment_cost: newEquip,
          verified_at: new Date().toISOString(),
          discrepancy_note: null // Clear any discrepancy note on match
        })
        .eq('id', verifyingLem.id)

      if (error) throw error

      // Log with auditLoggerV3 - Labour cost change
      if (originalLabour !== newLabour) {
        await logFieldChange({
          reportId: verifyingLem.field_log_id,
          entityType: 'contractor_lems',
          entityId: verifyingLem.id,
          section: 'Billing',
          fieldName: 'Labour Cost',
          oldValue: originalLabour,
          newValue: newLabour,
          metadata: { 
            action: 'verified_matched',
            verified_by: adminName,
            lem_date: verifyingLem.date
          }
        })
      }

      // Log with auditLoggerV3 - Equipment cost change
      if (originalEquip !== newEquip) {
        await logFieldChange({
          reportId: verifyingLem.field_log_id,
          entityType: 'contractor_lems',
          entityId: verifyingLem.id,
          section: 'Billing',
          fieldName: 'Equipment Cost',
          oldValue: originalEquip,
          newValue: newEquip,
          metadata: { 
            action: 'verified_matched',
            verified_by: adminName,
            lem_date: verifyingLem.date
          }
        })
      }

      // Log status change
      await logStatusChange({
        reportId: verifyingLem.field_log_id,
        entityType: 'contractor_lems',
        entityId: verifyingLem.id,
        oldStatus: verifyingLem.billing_status || 'open',
        newStatus: 'matched',
        reason: `Verified by ${adminName}. Total: $${(newLabour + newEquip).toLocaleString()}`,
        metadata: {
          labour_cost: newLabour,
          equipment_cost: newEquip,
          total: newLabour + newEquip
        }
      })

      setShowVerifyModal(false)
      setVerifyingLem(null)
      loadData()
      alert(`✓ ${verifyingLem.field_log_id} verified as MATCHED - $${(newLabour + newEquip).toLocaleString()}`)

    } catch (err) {
      alert('Error verifying: ' + err.message)
    }
  }

  // Keep as Open with mandatory discrepancy note
  async function keepAsOpen() {
    if (!verifyingLem) return

    if (!discrepancyNote.trim()) {
      alert('⚠️ A Discrepancy Note is REQUIRED to keep this ticket Open.\n\nPlease explain why it doesn\'t match (e.g., "Missing 2 hours sideboom time" or "Labour rate incorrect").')
      return
    }

    const newLabour = parseFloat(verifiedLabourCost) || 0
    const newEquip = parseFloat(verifiedEquipmentCost) || 0

    try {
      const { error } = await supabase
        .from('contractor_lems')
        .update({
          billing_status: 'open',
          discrepancy_note: discrepancyNote.trim(),
          total_labour_cost: newLabour,
          total_equipment_cost: newEquip,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', verifyingLem.id)

      if (error) throw error

      // Log the discrepancy with auditLoggerV3
      await logFieldChange({
        reportId: verifyingLem.field_log_id,
        entityType: 'contractor_lems',
        entityId: verifyingLem.id,
        section: 'Billing',
        fieldName: 'Discrepancy Note',
        oldValue: verifyingLem.discrepancy_note || null,
        newValue: discrepancyNote.trim(),
        metadata: {
          action: 'kept_open',
          reason: discrepancyNote.trim(),
          reviewed_by: adminName,
          lem_date: verifyingLem.date,
          labour_cost: newLabour,
          equipment_cost: newEquip
        }
      })

      setShowVerifyModal(false)
      setVerifyingLem(null)
      loadData()
      alert(`⚠️ ${verifyingLem.field_log_id} kept OPEN for troubleshooting.\n\nNote: ${discrepancyNote}`)

    } catch (err) {
      alert('Error updating: ' + err.message)
    }
  }

  // Toggle LEM selection for billing
  function toggleBillingSelection(lemId) {
    setSelectedForBilling(prev => 
      prev.includes(lemId) ? prev.filter(id => id !== lemId) : [...prev, lemId]
    )
  }

  // Select all visible LEMs
  function selectAllVisible() {
    const visibleIds = filteredBillingLems.map(l => l.id)
    const allSelected = visibleIds.every(id => selectedForBilling.includes(id))
    if (allSelected) {
      setSelectedForBilling(prev => prev.filter(id => !visibleIds.includes(id)))
    } else {
      setSelectedForBilling(prev => [...new Set([...prev, ...visibleIds])])
    }
  }

  // Update billing status for selected LEMs
  async function updateBillingStatus(newStatus) {
    if (selectedForBilling.length === 0) {
      alert('No items selected')
      return
    }

    const statusLabel = billingStatusColors[newStatus]?.label || newStatus
    if (!confirm(`Mark ${selectedForBilling.length} items as "${statusLabel}"?`)) return

    try {
      const updateData = { 
        billing_status: newStatus,
        ...(newStatus === 'ready_for_billing' && {
          ready_for_billing_at: new Date().toISOString()
        })
      }

      const { error } = await supabase
        .from('contractor_lems')
        .update(updateData)
        .in('id', selectedForBilling)

      if (error) throw error

      // Log to audit trail
      for (const lemId of selectedForBilling) {
        const lem = contractorData.find(l => l.id === lemId)
        await supabase.from('report_audit_log').insert({
          report_date: lem?.date,
          changed_by_name: adminName,
          changed_by_role: 'admin',
          change_type: 'billing_status',
          section: 'Billing',
          field_name: `${lem?.field_log_id} - Status`,
          old_value: lem?.billing_status || 'open',
          new_value: newStatus,
          change_reason: `Billing status updated to ${statusLabel}`
        })
      }

      setSelectedForBilling([])
      loadData()
      alert(`${selectedForBilling.length} items marked as "${statusLabel}"`)
    } catch (err) {
      alert('Error updating status: ' + err.message)
    }
  }

  // Finalize batch - opens invoice assignment modal directly
  async function finalizeBatch() {
    if (selectedForBilling.length === 0) {
      alert('No items selected for billing')
      return
    }

    const selectedLems = contractorData.filter(l => selectedForBilling.includes(l.id))
    
    // Store the LEMs pending invoice assignment
    setPendingInvoiceLems(selectedLems)
    
    // Open the Invoice Assignment Modal directly
    setShowInvoiceAssignModal(true)
  }

  // Assign invoice number and complete the invoicing (Swipe Clean)
  // This is the main transaction that:
  // 1. Creates invoice record
  // 2. Updates all tickets to 'invoiced' with invoice_id
  // 3. Logs audit trail for each ticket
  // 4. Refreshes UI to swipe clean
  async function assignInvoiceAndComplete() {
    if (!invoiceNumber.trim()) {
      alert('Please enter the Contractor Invoice Number')
      return
    }

    if (pendingInvoiceLems.length === 0) {
      alert('No LEMs pending invoice assignment')
      return
    }

    try {
      const totalLabour = pendingInvoiceLems.reduce((sum, l) => sum + (parseFloat(l.total_labour_cost) || 0), 0)
      const totalEquip = pendingInvoiceLems.reduce((sum, l) => sum + (parseFloat(l.total_equipment_cost) || 0), 0)
      const grandTotal = totalLabour + totalEquip
      const contractor = pendingInvoiceLems[0]?.contractor || 'Unknown'
      const lemIds = pendingInvoiceLems.map(l => l.id)
      const invoiceNum = invoiceNumber.trim()

      // STEP 1: Create invoice record in the invoices table FIRST
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNum,
          vendor_name: contractor,
          total_amount: grandTotal,
          status: 'pending',
          notes: invoiceNotes,
          is_third_party: thirdPartyOnly
        })
        .select()
        .single()

      if (invoiceError) throw invoiceError

      // STEP 2: Batch update all selected tickets with invoice_id, reconciliation_status, and billing_status
      const { error: updateError } = await supabase
        .from('contractor_lems')
        .update({
          billing_status: 'invoiced',
          reconciliation_status: 'invoiced',
          invoice_id: invoice.id,
          invoice_number: invoiceNum,
          reconciled_at: new Date().toISOString(),
          invoiced_at: new Date().toISOString()
        })
        .in('id', lemIds)

      if (updateError) throw updateError

      // STEP 3: Log audit trail for EACH ticket - "Ticket swiped clean; assigned to Invoice #[Number]"
      const auditLogs = pendingInvoiceLems.map(lem => ({
        changed_by_name: adminName,
        changed_by_role: 'admin',
        change_type: 'invoice_assigned',
        section: 'Reconciliation',
        field_name: 'Invoice Assignment',
        old_value: lem.billing_status || 'open',
        new_value: 'invoiced',
        change_reason: `Ticket swiped clean; assigned to Invoice #${invoiceNum}`,
        report_date: lem.date,
        changed_at: new Date().toISOString()
      }))

      // Batch insert all audit logs
      const { error: auditError } = await supabase
        .from('report_audit_log')
        .insert(auditLogs)

      if (auditError) {
        console.warn('Audit log error (non-fatal):', auditError)
      }

      // Also log the invoice creation event
      await supabase.from('report_audit_log').insert({
        changed_by_name: adminName,
        changed_by_role: 'admin',
        change_type: 'invoice_created',
        section: 'Billing',
        field_name: 'Invoice Created',
        old_value: `${pendingInvoiceLems.length} tickets`,
        new_value: `Invoice #${invoiceNum}`,
        change_reason: `Invoice created with ${pendingInvoiceLems.length} tickets. Total: $${grandTotal.toLocaleString()}`
      })

      // STEP 4: Clear state and refresh UI - this achieves the 'swipe clean' effect
      setShowInvoiceAssignModal(false)
      setShowInvoiceModal(false)
      setInvoiceNumber('')
      setInvoiceNotes('')
      setSelectedForBilling([])
      setPendingInvoiceLems([])
      
      // Reload data - invoiced items will be hidden by default (swipe clean)
      await loadData()
      
      alert(`✅ Invoice #${invoiceNum} created!\n\n${pendingInvoiceLems.length} tickets totaling $${grandTotal.toLocaleString()} have been swiped clean from the active view.\n\nTo view these tickets later, use the "View Archived/Invoiced" filter and search by invoice number.`)
      
    } catch (err) {
      console.error('Error assigning invoice:', err)
      alert('Error assigning invoice: ' + err.message)
    }
  }

  // Create invoice batch from selected LEMs (legacy - kept for backwards compatibility)
  async function createInvoiceBatch() {
    if (selectedForBilling.length === 0) {
      alert('No items selected')
      return
    }

    if (!invoiceNumber.trim()) {
      alert('Please enter an invoice number')
      return
    }

    try {
      const selectedLems = contractorData.filter(l => selectedForBilling.includes(l.id))
      const totalLabour = selectedLems.reduce((sum, l) => sum + (parseFloat(l.total_labour_cost) || 0), 0)
      const totalEquip = selectedLems.reduce((sum, l) => sum + (parseFloat(l.total_equipment_cost) || 0), 0)
      const contractor = selectedLems[0]?.contractor || 'Unknown'

      // Create the batch record
      const { data: batch, error: batchError } = await supabase
        .from('billing_batches')
        .insert({
          batch_number: `BATCH-${Date.now()}`,
          invoice_number: invoiceNumber.trim(),
          contractor: contractor,
          total_labour_cost: totalLabour,
          total_equipment_cost: totalEquip,
          total_amount: totalLabour + totalEquip,
          lem_count: selectedLems.length,
          status: 'invoiced',
          notes: invoiceNotes,
          invoiced_at: new Date().toISOString()
        })
        .select()
        .single()

      if (batchError) throw batchError

      // Update all selected LEMs
      const { error: updateError } = await supabase
        .from('contractor_lems')
        .update({
          billing_status: 'invoiced',
          billing_batch_id: batch.id,
          invoice_number: invoiceNumber.trim(),
          invoiced_at: new Date().toISOString()
        })
        .in('id', selectedForBilling)

      if (updateError) throw updateError

      // Log to audit trail
      await supabase.from('report_audit_log').insert({
        changed_by_name: adminName,
        changed_by_role: 'admin',
        change_type: 'invoice_created',
        section: 'Billing',
        field_name: 'Invoice Batch',
        old_value: `${selectedLems.length} LEMs`,
        new_value: `Invoice #${invoiceNumber}`,
        change_reason: `Invoice batch created. Total: $${(totalLabour + totalEquip).toLocaleString()}`
      })

      setShowInvoiceModal(false)
      setInvoiceNumber('')
      setInvoiceNotes('')
      setSelectedForBilling([])
      loadData()
      alert(`Invoice #${invoiceNumber} created with ${selectedLems.length} items totaling $${(totalLabour + totalEquip).toLocaleString()}`)
    } catch (err) {
      alert('Error creating invoice: ' + err.message)
    }
  }

  // Get selected items total
  const selectedTotal = contractorData
    .filter(l => selectedForBilling.includes(l.id))
    .reduce((sum, l) => sum + (parseFloat(l.total_labour_cost) || 0) + (parseFloat(l.total_equipment_cost) || 0), 0)

  const getStatusBadge = (itemStatus) => {
    if (!itemStatus) return null
    if (itemStatus.type === 'corrected') {
      return <span style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>✓ Corrected</span>
    }
    const colors = statusColors[itemStatus.status] || statusColors.open
    return <span style={{ backgroundColor: colors.bg, color: colors.text, padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>{colors.label}</span>
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>{PROJECT_NAME}</h1>
          <p style={{ fontSize: '14px', color: '#93c5fd', margin: '4px 0 0 0' }}>3-Way Reconciliation & Dispute Management</p>
        </div>
        <button onClick={() => navigate(-1)} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>← Back</button>
      </div>

      {/* Controls */}
      <div style={{ backgroundColor: 'white', padding: '12px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setViewMode('reconciliation')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: viewMode === 'reconciliation' ? '#2563eb' : '#e5e7eb', color: viewMode === 'reconciliation' ? 'white' : '#374151', fontWeight: '500' }}>
            📊 Reconciliation
          </button>
          <button onClick={() => setViewMode('billing')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: viewMode === 'billing' ? '#059669' : '#e5e7eb', color: viewMode === 'billing' ? 'white' : '#374151', fontWeight: '500' }}>
            💰 Billing ({billingTotals.ready_for_billing.length} ready)
          </button>
          <button onClick={() => setViewMode('disputes')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: viewMode === 'disputes' ? '#dc2626' : '#e5e7eb', color: viewMode === 'disputes' ? 'white' : '#374151', fontWeight: '500' }}>
            ⚠️ Disputes ({disputes.filter(d => d.status !== 'resolved').length})
          </button>
          <button onClick={() => setViewMode('corrections')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: viewMode === 'corrections' ? '#6366f1' : '#e5e7eb', color: viewMode === 'corrections' ? 'white' : '#374151', fontWeight: '500' }}>
            ✓ Corrections ({corrections.length})
          </button>
          <button onClick={() => setViewMode('invoices')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: viewMode === 'invoices' ? '#7c3aed' : '#e5e7eb', color: viewMode === 'invoices' ? 'white' : '#374151', fontWeight: '500' }}>
            📄 Invoices ({billingBatches.length})
          </button>
        </div>
        <div style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: '20px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>Date Range:</span>
          <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ border: '1px solid #d1d5db', borderRadius: '4px', padding: '6px 12px', marginLeft: '8px' }}>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="60">Last 60 Days</option>
            <option value="365">Last Year</option>
          </select>
        </div>
        <div style={{ flex: 1 }}></div>
        <button onClick={loadData} style={{ backgroundColor: '#6b7280', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>🔄 Refresh</button>
      </div>

      {/* CORRECTIONS VIEW */}
      {viewMode === 'corrections' && (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
          <h2 style={{ marginBottom: '20px' }}>Admin Corrections</h2>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#059669' }}>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Field Log</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Date</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Type</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Item</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Original</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Corrected</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Notes</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Corrected By</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {corrections.length === 0 ? (
                  <tr><td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No corrections made yet</td></tr>
                ) : (
                  corrections.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px', fontWeight: '600' }}>{c.lem_id}</td>
                      <td style={{ padding: '12px' }}>{c.lem_date}</td>
                      <td style={{ padding: '12px' }}><span style={{ backgroundColor: '#dbeafe', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{c.correction_type}</span></td>
                      <td style={{ padding: '12px', fontWeight: '500' }}>{c.item_name}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'monospace', color: '#dc2626' }}>{c.original_value}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'monospace', color: '#059669', fontWeight: 'bold' }}>{c.corrected_value}</td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>{c.notes || '-'}</td>
                      <td style={{ padding: '12px' }}>{c.corrected_by}</td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BILLING VIEW */}
      {viewMode === 'billing' && (
        <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto' }}>
          
          {/* Filter Toggles Bar */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Hide Invoiced Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', backgroundColor: hideInvoiced ? '#dcfce7' : '#f3f4f6', padding: '8px 16px', borderRadius: '20px', border: hideInvoiced ? '2px solid #16a34a' : '2px solid #d1d5db' }}>
              <input 
                type="checkbox" 
                checked={hideInvoiced} 
                onChange={(e) => { setHideInvoiced(e.target.checked); setShowArchived(false); }}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '13px', fontWeight: '500', color: hideInvoiced ? '#166534' : '#6b7280' }}>
                🧹 Hide Invoiced (Swipe Clean)
              </span>
            </label>
            
            {/* Third-Party Only Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', backgroundColor: thirdPartyOnly ? '#fef3c7' : '#f3f4f6', padding: '8px 16px', borderRadius: '20px', border: thirdPartyOnly ? '2px solid #f59e0b' : '2px solid #d1d5db' }}>
              <input 
                type="checkbox" 
                checked={thirdPartyOnly} 
                onChange={(e) => setThirdPartyOnly(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '13px', fontWeight: '500', color: thirdPartyOnly ? '#92400e' : '#6b7280' }}>
                🔗 Third-Party Only
              </span>
            </label>
            
            {/* Archived/Invoiced View Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', backgroundColor: showArchived ? '#e0e7ff' : '#f3f4f6', padding: '8px 16px', borderRadius: '20px', border: showArchived ? '2px solid #6366f1' : '2px solid #d1d5db' }}>
              <input 
                type="checkbox" 
                checked={showArchived} 
                onChange={(e) => { setShowArchived(e.target.checked); if(e.target.checked) setHideInvoiced(false); }}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '13px', fontWeight: '500', color: showArchived ? '#4338ca' : '#6b7280' }}>
                📁 View Archived/Invoiced
              </span>
            </label>
            
            {/* Invoice Search - Only visible in Archived view */}
            {showArchived && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>🔍</span>
                <input
                  type="text"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Search by Invoice #..."
                  style={{ 
                    padding: '8px 12px', 
                    borderRadius: '20px', 
                    border: '2px solid #6366f1', 
                    fontSize: '13px', 
                    width: '200px',
                    backgroundColor: '#eef2ff'
                  }}
                />
                {invoiceSearch && (
                  <button 
                    onClick={() => setInvoiceSearch('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#6b7280' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
            
            {/* Count indicator */}
            <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280' }}>
              Showing: <strong>{filteredBillingLems.length}</strong> tickets
              {showArchived && <span style={{ marginLeft: '8px', color: '#6366f1' }}>(Archived View)</span>}
              {thirdPartyOnly && <span style={{ marginLeft: '8px', color: '#f59e0b' }}>(Third-Party)</span>}
              {invoiceSearch && <span style={{ marginLeft: '8px', color: '#6366f1' }}>(Invoice: "{invoiceSearch}")</span>}
            </div>
          </div>
          
          {/* Status Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '20px' }}>
            {['all', 'open', 'matched', 'ready_for_billing', 'invoiced'].map(status => {
              const lems = status === 'all' ? contractorData : billingTotals[status] || []
              const total = calcTotal(lems)
              const isActive = billingFilter === status
              const colors = billingStatusColors[status] || { bg: '#f3f4f6', text: '#374151' }
              return (
                <div key={status} onClick={() => setBillingFilter(status)} style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px', cursor: 'pointer', border: isActive ? '3px solid #059669' : '2px solid transparent' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{status === 'all' ? 'All LEMs' : status.replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: colors.text }}>{lems.length}</div>
                  <div style={{ fontSize: '14px', color: '#059669', fontWeight: '600' }}>${total.toLocaleString()}</div>
                </div>
              )
            })}
          </div>

          {/* Action Bar */}
          {selectedForBilling.length > 0 && (
            <div style={{ backgroundColor: '#059669', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
              <div>
                <strong>{selectedForBilling.length} items selected</strong>
                <span style={{ marginLeft: '20px', fontSize: '18px', fontWeight: 'bold' }}>${selectedTotal.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => updateBillingStatus('matched')} style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
                  ✓ Mark Matched
                </button>
                <button onClick={finalizeBatch} style={{ padding: '10px 20px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', boxShadow: '0 2px 8px rgba(124,58,237,0.4)' }}>
                  🧾 Finalize Batch →
                </button>
                <button onClick={() => setSelectedForBilling([])} style={{ padding: '10px 20px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* LEMs Table */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#1e3a5f' }}>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center', width: '50px' }}>
                    <input 
                      type="checkbox" 
                      checked={filteredBillingLems.length > 0 && filteredBillingLems.every(l => selectedForBilling.includes(l.id))}
                      onChange={selectAllVisible}
                      style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                    />
                  </th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Field Log</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Date</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Foreman</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'right', backgroundColor: '#059669' }}>💰 TOTAL $</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Labour $</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Equipment $</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Status</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Verify</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Notes / Invoice</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="10" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                ) : filteredBillingLems.length === 0 ? (
                  <tr><td colSpan="10" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No LEMs found</td></tr>
                ) : (
                  filteredBillingLems.map(lem => {
                    const labour = parseFloat(lem.total_labour_cost) || 0
                    const equip = parseFloat(lem.total_equipment_cost) || 0
                    const total = labour + equip
                    const status = lem.billing_status || 'open'
                    const colors = billingStatusColors[status] || billingStatusColors.open
                    const isSelected = selectedForBilling.includes(lem.id)
                    const hasDiscrepancy = lem.discrepancy_note && lem.discrepancy_note.trim()
                    return (
                      <tr key={lem.id} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: isSelected ? '#f0fdf4' : hasDiscrepancy ? '#fef2f2' : 'white' }}>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleBillingSelection(lem.id)}
                            style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                          />
                        </td>
                        <td style={{ padding: '12px', fontWeight: '600' }}>{lem.field_log_id}</td>
                        <td style={{ padding: '12px' }}>{lem.date}</td>
                        <td style={{ padding: '12px' }}>{lem.foreman || '-'}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '16px', color: '#059669', backgroundColor: '#f0fdf4' }}>
                          ${total.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '12px', color: '#6b7280' }}>${labour.toLocaleString()}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '12px', color: '#6b7280' }}>${equip.toLocaleString()}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{ backgroundColor: colors.bg, color: colors.text, padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '500' }}>
                            {colors.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {status !== 'invoiced' && (
                            <button 
                              onClick={() => openVerifyModal(lem)}
                              style={{ 
                                padding: '6px 12px', 
                                backgroundColor: '#2563eb', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '4px', 
                                cursor: 'pointer', 
                                fontSize: '11px',
                                fontWeight: '500'
                              }}
                            >
                              🔍 Verify
                            </button>
                          )}
                        </td>
                        <td style={{ padding: '12px', fontSize: '11px' }}>
                          {hasDiscrepancy ? (
                            <span style={{ color: '#dc2626', fontWeight: '500' }}>⚠️ {lem.discrepancy_note}</span>
                          ) : lem.invoice_number ? (
                            <span style={{ color: '#7c3aed', fontFamily: 'monospace' }}>📄 {lem.invoice_number}</span>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {filteredBillingLems.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: '#1e3a5f', color: 'white', fontWeight: 'bold' }}>
                    <td colSpan="4" style={{ padding: '16px', textAlign: 'right', fontSize: '14px' }}>TOTALS:</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontFamily: 'monospace', fontSize: '20px', backgroundColor: '#059669' }}>
                      ${calcTotal(filteredBillingLems).toLocaleString()}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right', fontFamily: 'monospace' }}>
                      ${filteredBillingLems.reduce((s, l) => s + (parseFloat(l.total_labour_cost) || 0), 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right', fontFamily: 'monospace' }}>
                      ${filteredBillingLems.reduce((s, l) => s + (parseFloat(l.total_equipment_cost) || 0), 0).toLocaleString()}
                    </td>
                    <td colSpan="3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* INVOICES VIEW */}
      {viewMode === 'invoices' && (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
          <h2 style={{ marginBottom: '20px' }}>Invoice Batches</h2>
          
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Total Invoices</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#7c3aed' }}>{billingBatches.length}</div>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Total LEMs Invoiced</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2563eb' }}>{billingBatches.reduce((s, b) => s + (b.lem_count || 0), 0)}</div>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Total Amount Invoiced</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#059669' }}>${billingBatches.reduce((s, b) => s + (parseFloat(b.total_amount) || 0), 0).toLocaleString()}</div>
            </div>
          </div>

          {/* Invoices Table */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#7c3aed' }}>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Invoice #</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Contractor</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>LEMs</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Labour $</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Equipment $</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Total $</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Created</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Created By</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {billingBatches.length === 0 ? (
                  <tr><td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No invoices created yet</td></tr>
                ) : (
                  billingBatches.map(batch => (
                    <tr key={batch.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px', fontWeight: '600', color: '#7c3aed' }}>{batch.invoice_number}</td>
                      <td style={{ padding: '12px' }}>{batch.contractor || '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: '500' }}>{batch.lem_count}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>${(parseFloat(batch.total_labour_cost) || 0).toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>${(parseFloat(batch.total_equipment_cost) || 0).toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold', color: '#059669' }}>${(parseFloat(batch.total_amount) || 0).toLocaleString()}</td>
                      <td style={{ padding: '12px', fontSize: '12px' }}>{batch.invoiced_at ? new Date(batch.invoiced_at).toLocaleDateString() : '-'}</td>
                      <td style={{ padding: '12px' }}>{batch.created_by || '-'}</td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280', maxWidth: '200px' }}>{batch.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DISPUTES VIEW */}
      {viewMode === 'disputes' && (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '20px' }}>
            {['all', 'open', 'disputed', 'under_review', 'resolved'].map(status => {
              const count = status === 'all' ? disputes.length : disputes.filter(d => d.status === status).length
              const isActive = disputeFilter === status
              return (
                <div key={status} onClick={() => setDisputeFilter(status)} style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px', cursor: 'pointer', border: isActive ? '2px solid #2563eb' : '2px solid transparent' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{status === 'all' ? 'All' : status.replace('_', ' ')}</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: status === 'open' ? '#f59e0b' : status === 'disputed' ? '#dc2626' : '#1f2937' }}>{count}</div>
                </div>
              )
            })}
          </div>

          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button onClick={emailAllDisputesToContractor} style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
              📧 Email Dispute Log to Contractor
            </button>
            <button onClick={exportDisputeReport} style={{ backgroundColor: '#059669', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
              📄 Export Dispute Report
            </button>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#1f2937' }}>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Field Log</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Date</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Type</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Item</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>LEM</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Timesheet</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Variance</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Notes</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Status</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDisputes.length === 0 ? (
                  <tr><td colSpan="10" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No disputes found</td></tr>
                ) : (
                  filteredDisputes.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px', fontWeight: '600' }}>{d.lem_id}</td>
                      <td style={{ padding: '12px' }}>{d.lem_date}</td>
                      <td style={{ padding: '12px' }}><span style={{ backgroundColor: d.dispute_type === 'labour' ? '#dbeafe' : '#fef3c7', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{d.dispute_type}</span></td>
                      <td style={{ padding: '12px', fontWeight: '500' }}>{d.item_name}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'monospace' }}>{d.lem_hours}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'monospace' }}>{d.timesheet_hours}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#dc2626' }}>+{d.variance_hours}</td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280', maxWidth: '200px' }}>{d.notes || '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ backgroundColor: statusColors[d.status]?.bg, color: statusColors[d.status]?.text, padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '500' }}>
                          {statusColors[d.status]?.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <select value={d.status} onChange={e => updateDisputeStatus(d.id, e.target.value)} style={{ border: '1px solid #d1d5db', borderRadius: '4px', padding: '4px 8px', fontSize: '12px' }}>
                          <option value="open">Open</option>
                          <option value="disputed">Sent to Contractor</option>
                          <option value="under_review">Under Review</option>
                          <option value="resolved">Resolved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RECONCILIATION VIEW */}
      {viewMode === 'reconciliation' && (
        <div style={{ display: 'flex', height: 'calc(100vh - 120px)' }}>
          {/* Sidebar */}
          <div style={{ width: '280px', backgroundColor: 'white', borderRight: '1px solid #e5e7eb', overflowY: 'auto' }}>
            <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>Field Logs ({contractorData.length})</div>
            {loading ? <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Loading...</div> :
             contractorData.length === 0 ? <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No LEMs found</div> :
             contractorData.map(lem => {
               const lemDisputes = disputes.filter(d => d.lem_id === lem.field_log_id && d.status !== 'resolved')
               const lemCorrections = corrections.filter(c => c.lem_id === lem.field_log_id)
               return (
                <div key={lem.field_log_id} onClick={() => setSelectedLemId(lem.field_log_id)}
                  style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', backgroundColor: selectedLemId === lem.field_log_id ? '#dbeafe' : 'white', borderLeft: selectedLemId === lem.field_log_id ? '4px solid #2563eb' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>{lem.field_log_id}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {lemCorrections.length > 0 && <span style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>✓{lemCorrections.length}</span>}
                      {lemDisputes.length > 0 && <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>⚠️{lemDisputes.length}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>{lem.date}</div>
                  <div style={{ fontSize: '12px', color: '#4b5563' }}>{lem.foreman}</div>
                  <div style={{ fontSize: '13px', color: '#059669', fontWeight: '500' }}>${((parseFloat(lem.total_labour_cost)||0) + (parseFloat(lem.total_equipment_cost)||0)).toLocaleString()}</div>
                </div>
              )}
            )}
          </div>

          {/* Main Panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {!selectedLem ? <div style={{ textAlign: 'center', paddingTop: '100px', color: '#9ca3af', fontSize: '18px' }}>Select a Field Log from the left panel</div> : (
              <>
                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Field Log / Ticket #</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{selectedLem.field_log_id}</div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>{selectedLem.date}</div>
                  </div>
                  <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Foreman</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{selectedLem.foreman}</div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>{selectedLem.account_number}</div>
                  </div>
                  <div style={{ backgroundColor: labourVar + equipVar > 0 ? '#fef2f2' : '#f0fdf4', border: `2px solid ${labourVar + equipVar > 0 ? '#fca5a5' : '#86efac'}`, borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Variance</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: labourVar + equipVar > 0 ? '#dc2626' : '#16a34a' }}>{labourVar + equipVar > 0 ? '+' : ''}{(labourVar + equipVar).toFixed(1)} hrs</div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>Labour: {labourVar.toFixed(1)} | Equip: {equipVar.toFixed(1)}</div>
                  </div>
                  <div style={{ backgroundColor: matchingReport ? '#f0fdf4' : '#fef2f2', border: `2px solid ${matchingReport ? '#86efac' : '#fca5a5'}`, borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Inspector Match</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: matchingReport ? '#16a34a' : '#dc2626' }}>{matchingReport ? '✓ Found' : '✗ Not Found'}</div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>{matchingReport?.inspector_name || 'No matching report'}</div>
                  </div>
                </div>

                {/* Flag All Button */}
                {(labourComp.some(l => (l.status === 'over' || l.status === 'not_found') && !l.itemStatus) || 
                  equipComp.some(e => (e.status === 'over' || e.status === 'not_found') && !e.itemStatus)) && (
                  <div style={{ backgroundColor: '#fef2f2', border: '2px solid #fca5a5', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ color: '#991b1b' }}>
                        {labourComp.filter(l => (l.status === 'over' || l.status === 'not_found') && !l.itemStatus).length + 
                         equipComp.filter(e => (e.status === 'over' || e.status === 'not_found') && !e.itemStatus).length} items with discrepancies
                      </strong>
                      <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#6b7280' }}>Review individually or flag all for contractor</p>
                    </div>
                    <button onClick={flagAllIssues} style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                      🚨 Flag All for Contractor
                    </button>
                  </div>
                )}

                {/* 3-Panel Detailed View */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  {/* LEFT: Contractor LEM */}
                  <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', border: '2px solid #dc2626' }}>
                    <div style={{ backgroundColor: '#dc2626', color: 'white', padding: '12px 16px', fontWeight: '600', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>💰 Contractor LEM</span>
                      <span style={{ fontSize: '12px', opacity: 0.9 }}>${((parseFloat(selectedLem.total_labour_cost)||0) + (parseFloat(selectedLem.total_equipment_cost)||0)).toLocaleString()}</span>
                    </div>
                    <div style={{ padding: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                        <strong>Field Log:</strong> {selectedLem.field_log_id} | <strong>Date:</strong> {selectedLem.date}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                        <strong>Foreman:</strong> {selectedLem.foreman} | <strong>Account:</strong> {selectedLem.account_number}
                      </div>
                      
                      {/* Labour Summary */}
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#dc2626', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Labour Entries ({lemLabour.length})
                      </div>
                      <div style={{ maxHeight: '120px', overflowY: 'auto', marginBottom: '12px', border: '1px solid #eee', borderRadius: '4px' }}>
                        {lemLabour.length === 0 ? (
                          <div style={{ padding: '10px', color: '#9ca3af', fontSize: '12px', textAlign: 'center' }}>No labour entries</div>
                        ) : lemLabour.slice(0, 5).map((worker, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: '12px' }}>
                            <span style={{ fontWeight: '500' }}>{worker.name || worker.employee_name}</span>
                            <span style={{ fontFamily: 'monospace' }}>{((worker.rt_hours || worker.rt || 0) + (worker.ot_hours || worker.ot || 0)).toFixed(1)} hrs</span>
                          </div>
                        ))}
                        {lemLabour.length > 5 && <div style={{ padding: '6px 10px', fontSize: '11px', color: '#6b7280', textAlign: 'center' }}>+{lemLabour.length - 5} more...</div>}
                      </div>
                      
                      {/* Equipment Summary */}
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#dc2626', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Equipment ({lemEquipment.length})
                      </div>
                      <div style={{ maxHeight: '80px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px' }}>
                        {lemEquipment.length === 0 ? (
                          <div style={{ padding: '10px', color: '#9ca3af', fontSize: '12px', textAlign: 'center' }}>No equipment</div>
                        ) : lemEquipment.slice(0, 3).map((equip, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: '12px' }}>
                            <span>{equip.equipment_id || equip.unit_number} - {equip.type || equip.equipment_type}</span>
                            <span style={{ fontFamily: 'monospace' }}>{equip.hours || 0} hrs</span>
                          </div>
                        ))}
                      </div>
                      
                      {/* Totals */}
                      <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#fef2f2', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                          <span>Labour Total:</span>
                          <strong>{lemLabourTotal.toFixed(1)} hrs</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>Equipment Total:</span>
                          <strong>{lemEquipTotal.toFixed(1)} hrs</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* MIDDLE: Daily Timesheet Photo */}
                  <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', border: '2px solid #f59e0b' }}>
                    <div style={{ backgroundColor: '#f59e0b', color: 'white', padding: '12px 16px', fontWeight: '600' }}>
                      📝 Daily Timesheet
                    </div>
                    <div style={{ padding: '12px' }}>
                      {selectedLem.timesheet_photo_url ? (
                        <div>
                          <div style={{ position: 'relative', backgroundColor: '#f8f8f8', borderRadius: '6px', overflow: 'hidden', marginBottom: '10px' }}>
                            <img
                              src={selectedLem.timesheet_photo_url}
                              alt="Foreman Timesheet"
                              style={{ width: '100%', height: '200px', objectFit: 'cover', cursor: 'pointer' }}
                              onClick={() => window.open(selectedLem.timesheet_photo_url, '_blank')}
                            />
                            <button
                              onClick={() => window.open(selectedLem.timesheet_photo_url, '_blank')}
                              style={{
                                position: 'absolute',
                                bottom: '8px',
                                right: '8px',
                                padding: '6px 12px',
                                backgroundColor: '#1f2937',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer'
                              }}
                            >
                              🔍 Full Screen
                            </button>
                          </div>
                          <div style={{ fontSize: '11px', color: '#6b7280', textAlign: 'center' }}>
                            Click image to view full size
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '220px',
                          backgroundColor: '#fffbeb',
                          borderRadius: '6px',
                          border: '2px dashed #f59e0b',
                          color: '#92400e'
                        }}>
                          <div style={{ fontSize: '48px', marginBottom: '10px' }}>📷</div>
                          <div style={{ fontSize: '14px', fontWeight: '600' }}>No timesheet photo available</div>
                          <div style={{ fontSize: '12px', marginTop: '5px', textAlign: 'center', padding: '0 20px' }}>
                            Add timesheet_photo_url to contractor_lems table
                          </div>
                        </div>
                      )}
                      
                      {/* OCR Data Summary */}
                      <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#fefce8', borderRadius: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: '#92400e', marginBottom: '6px' }}>TIMESHEET DATA (OCR)</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                          <span>Workers:</span>
                          <strong>{timesheetLabour.length}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                          <span>Labour Hours:</span>
                          <strong>{tsLabourTotal.toFixed(1)} hrs</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span>Equipment Hours:</span>
                          <strong>{tsEquipTotal.toFixed(1)} hrs</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* RIGHT: Inspector Report */}
                  <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', border: '2px solid #16a34a' }}>
                    <div style={{ backgroundColor: '#16a34a', color: 'white', padding: '12px 16px', fontWeight: '600', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>👷 Inspector Report</span>
                      {matchingReport && <span style={{ fontSize: '12px', opacity: 0.9 }}>#{String(matchingReport.id || '').slice(0,8)}</span>}
                    </div>
                    <div style={{ padding: '12px' }}>
                      {matchingReport ? (
                        <>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                            <strong>Date:</strong> {matchingReport.date || matchingReport.selected_date} | <strong>Inspector:</strong> {matchingReport.inspector_name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                            <strong>Spread:</strong> {matchingReport.spread || '-'} | <strong>Crew:</strong> {matchingReport.crew || '-'}
                          </div>
                          
                          {/* Labour Summary */}
                          <div style={{ fontSize: '11px', fontWeight: '600', color: '#16a34a', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Labour Entries ({timesheetLabour.length})
                          </div>
                          <div style={{ maxHeight: '120px', overflowY: 'auto', marginBottom: '12px', border: '1px solid #eee', borderRadius: '4px' }}>
                            {timesheetLabour.length === 0 ? (
                              <div style={{ padding: '10px', color: '#9ca3af', fontSize: '12px', textAlign: 'center' }}>No labour entries</div>
                            ) : timesheetLabour.slice(0, 5).map((worker, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: '12px' }}>
                                <span style={{ fontWeight: '500' }}>{worker.employeeName || worker.name || worker.trade || 'Worker'}</span>
                                <span style={{ fontFamily: 'monospace' }}>{((parseFloat(worker.hours) || 0) || ((parseFloat(worker.rt) || 0) + (parseFloat(worker.ot) || 0))).toFixed(1)} hrs</span>
                              </div>
                            ))}
                            {timesheetLabour.length > 5 && <div style={{ padding: '6px 10px', fontSize: '11px', color: '#6b7280', textAlign: 'center' }}>+{timesheetLabour.length - 5} more...</div>}
                          </div>
                          
                          {/* Equipment Summary */}
                          <div style={{ fontSize: '11px', fontWeight: '600', color: '#16a34a', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Equipment ({timesheetEquipment.length})
                          </div>
                          <div style={{ maxHeight: '80px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px' }}>
                            {timesheetEquipment.length === 0 ? (
                              <div style={{ padding: '10px', color: '#9ca3af', fontSize: '12px', textAlign: 'center' }}>No equipment</div>
                            ) : timesheetEquipment.slice(0, 3).map((equip, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: '12px' }}>
                                <span>{equip.type || equip.equipment_type || 'Equipment'}</span>
                                <span style={{ fontFamily: 'monospace' }}>{equip.hours || 0} hrs</span>
                              </div>
                            ))}
                          </div>
                          
                          {/* Totals */}
                          <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#f0fdf4', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                              <span>Labour Total:</span>
                              <strong>{tsLabourTotal.toFixed(1)} hrs</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                              <span>Equipment Total:</span>
                              <strong>{tsEquipTotal.toFixed(1)} hrs</strong>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '280px',
                          backgroundColor: '#fef2f2',
                          borderRadius: '6px',
                          border: '2px dashed #fca5a5',
                          color: '#991b1b'
                        }}>
                          <div style={{ fontSize: '48px', marginBottom: '10px' }}>❌</div>
                          <div style={{ fontSize: '14px', fontWeight: '600' }}>No Matching Report</div>
                          <div style={{ fontSize: '12px', marginTop: '5px', textAlign: 'center', padding: '0 20px' }}>
                            No inspector report found for {selectedLem.date}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Variance Summary Bar */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '12px 20px', 
                  marginBottom: '20px',
                  backgroundColor: labourVar + equipVar > 0 ? '#fef2f2' : '#f0fdf4', 
                  borderRadius: '8px',
                  border: `2px solid ${labourVar + equipVar > 0 ? '#fca5a5' : '#86efac'}`
                }}>
                  <div style={{ display: 'flex', gap: '30px' }}>
                    <div>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>Labour Variance: </span>
                      <strong style={{ color: labourVar > 0 ? '#dc2626' : '#16a34a', fontSize: '16px' }}>
                        {labourVar > 0 ? '+' : ''}{labourVar.toFixed(1)} hrs
                      </strong>
                      <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '8px' }}>
                        (${(labourVar * 125).toFixed(0)})
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>Equipment Variance: </span>
                      <strong style={{ color: equipVar > 0 ? '#dc2626' : '#16a34a', fontSize: '16px' }}>
                        {equipVar > 0 ? '+' : ''}{equipVar.toFixed(1)} hrs
                      </strong>
                      <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '8px' }}>
                        (${(equipVar * 250).toFixed(0)})
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Financial Impact</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: labourVar + equipVar > 0 ? '#dc2626' : '#16a34a' }}>
                      ${((labourVar * 125) + (equipVar * 250)).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Labour Table */}
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#1f2937', color: 'white', padding: '10px 16px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
                    <span>👷 Labour Comparison</span>
                    <span style={{ fontWeight: 'normal', fontSize: '13px' }}>{labourComp.filter(l => l.status !== 'match' && l.status !== 'not_billed').length} issues</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead><tr>
                      <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'left' }}>Employee</th>
                      <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'left' }}>Classification</th>
                      <th style={{ backgroundColor: '#dc2626', color: 'white', padding: '10px 12px', textAlign: 'center' }}>LEM</th>
                      <th style={{ backgroundColor: '#f59e0b', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Timesheet</th>
                      <th style={{ backgroundColor: '#16a34a', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Inspector</th>
                      <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Variance</th>
                      <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Status</th>
                      <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Action</th>
                    </tr></thead>
                    <tbody>
                      {labourComp.length === 0 ? <tr><td colSpan="8" style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No labour entries</td></tr> :
                      labourComp.map((r,i) => (
                        <tr key={i} style={{ backgroundColor: r.itemStatus ? '#f9fafb' : r.status === 'not_found' ? '#fef2f2' : r.status === 'over' ? '#fefce8' : r.status === 'not_billed' ? '#eff6ff' : 'white' }}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>{r.name}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '12px' }}>{r.classification}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fef2f2' }}>{r.lemHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fefce8' }}>{r.timesheetHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#f0fdf4' }}>{r.timesheetHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 'bold', color: r.variance > 0 ? '#dc2626' : r.variance < 0 ? '#2563eb' : '#16a34a' }}>{r.variance > 0 ? '+' : ''}{r.variance.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontSize: '12px' }}>
                            {r.itemStatus ? getStatusBadge(r.itemStatus) : (
                              <>
                                {r.status === 'match' && <span style={{ color: '#16a34a' }}>✓ Match</span>}
                                {r.status === 'over' && <span style={{ color: '#f59e0b' }}>⚠️ Over</span>}
                                {r.status === 'not_found' && <span style={{ color: '#dc2626' }}>🚨 Not on Sheet</span>}
                                {r.status === 'not_billed' && <span style={{ color: '#2563eb' }}>ℹ️ Not Billed</span>}
                              </>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                            {(r.status === 'over' || r.status === 'not_found') && !r.itemStatus && (
                              <button onClick={() => openReviewModal(r, 'labour')} style={{ backgroundColor: '#f59e0b', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                Flag
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Equipment Table */}
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#1f2937', color: 'white', padding: '10px 16px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
                    <span>🚜 Equipment Comparison</span>
                    <span style={{ fontWeight: 'normal', fontSize: '13px' }}>{equipComp.filter(e => e.status !== 'match' && e.status !== 'not_billed').length} issues</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead><tr>
                      <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'left' }}>Equipment ID</th>
                      <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'left' }}>Type</th>
                      <th style={{ backgroundColor: '#dc2626', color: 'white', padding: '10px 12px', textAlign: 'center' }}>LEM</th>
                      <th style={{ backgroundColor: '#f59e0b', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Timesheet</th>
                      <th style={{ backgroundColor: '#16a34a', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Inspector</th>
                      <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Variance</th>
                      <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Status</th>
                      <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Action</th>
                    </tr></thead>
                    <tbody>
                      {equipComp.length === 0 ? <tr><td colSpan="8" style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No equipment entries</td></tr> :
                      equipComp.map((r,i) => (
                        <tr key={i} style={{ backgroundColor: r.itemStatus ? '#f9fafb' : r.status === 'not_found' ? '#fef2f2' : r.status === 'over' ? '#fefce8' : r.status === 'not_billed' ? '#eff6ff' : 'white' }}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontFamily: 'monospace', fontSize: '12px' }}>{r.equipmentId || '-'}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>{r.type}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fef2f2' }}>{r.lemHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fefce8' }}>{r.timesheetHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#f0fdf4' }}>{r.timesheetHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 'bold', color: r.variance > 0 ? '#dc2626' : r.variance < 0 ? '#2563eb' : '#16a34a' }}>{r.variance > 0 ? '+' : ''}{r.variance.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontSize: '12px' }}>
                            {r.itemStatus ? getStatusBadge(r.itemStatus) : (
                              <>
                                {r.status === 'match' && <span style={{ color: '#16a34a' }}>✓ Match</span>}
                                {r.status === 'over' && <span style={{ color: '#f59e0b' }}>⚠️ Over</span>}
                                {r.status === 'not_found' && <span style={{ color: '#dc2626' }}>🚨 Not Observed</span>}
                                {r.status === 'not_billed' && <span style={{ color: '#2563eb' }}>ℹ️ Not Billed</span>}
                              </>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                            {(r.status === 'over' || r.status === 'not_found') && !r.itemStatus && (
                              <button onClick={() => openReviewModal(r, 'equipment')} style={{ backgroundColor: '#f59e0b', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                Flag
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Ditching Pay Items Section */}
                {(() => {
                  // Filter trench logs for the selected date range and calculate pay item summaries
                  const dateTrenchLogs = trenchLogs.filter(t =>
                    selectedLem && t.date === selectedLem.date &&
                    (t.foreman?.toLowerCase().includes(selectedLem.foreman?.toLowerCase()?.split(' ')[0] || '') ||
                     selectedLem.foreman?.toLowerCase().includes(t.foreman?.toLowerCase()?.split(' ')[0] || ''))
                  )

                  const ditchPayItems = []

                  // Rock Ditch totals
                  const rockDitchClaimed = dateTrenchLogs.filter(t => t.rock_ditch).reduce((s, t) => s + (parseFloat(t.rock_ditch_meters) || 0), 0)
                  const rockDitchVerified = dateTrenchLogs.filter(t => t.rock_ditch && t.rock_ditch_verified).reduce((s, t) => s + (parseFloat(t.rock_ditch_meters) || 0), 0)
                  if (rockDitchClaimed > 0 || rockDitchVerified > 0) {
                    ditchPayItems.push({
                      item: 'Rock Ditch',
                      contractorClaimed: rockDitchClaimed,
                      inspectorVerified: rockDitchVerified,
                      variance: rockDitchClaimed - rockDitchVerified,
                      unit: 'LM',
                      rate: 125 // Example rate
                    })
                  }

                  // Extra Depth totals
                  const extraDepthClaimed = dateTrenchLogs.filter(t => t.extra_depth).reduce((s, t) => s + (parseFloat(t.extra_depth_meters) || 0), 0)
                  const extraDepthVerified = dateTrenchLogs.filter(t => t.extra_depth && t.extra_depth_verified).reduce((s, t) => s + (parseFloat(t.extra_depth_meters) || 0), 0)
                  if (extraDepthClaimed > 0 || extraDepthVerified > 0) {
                    ditchPayItems.push({
                      item: 'Extra Depth',
                      contractorClaimed: extraDepthClaimed,
                      inspectorVerified: extraDepthVerified,
                      variance: extraDepthClaimed - extraDepthVerified,
                      unit: 'LM',
                      rate: 85
                    })
                  }

                  // Padding/Bedding totals
                  const paddingClaimed = dateTrenchLogs.filter(t => t.padding_bedding).reduce((s, t) => s + (parseFloat(t.padding_bedding_meters) || 0), 0)
                  const paddingVerified = dateTrenchLogs.filter(t => t.padding_bedding && t.padding_bedding_verified).reduce((s, t) => s + (parseFloat(t.padding_bedding_meters) || 0), 0)
                  if (paddingClaimed > 0 || paddingVerified > 0) {
                    ditchPayItems.push({
                      item: 'Padding/Bedding',
                      contractorClaimed: paddingClaimed,
                      inspectorVerified: paddingVerified,
                      variance: paddingClaimed - paddingVerified,
                      unit: 'LM',
                      rate: 45
                    })
                  }

                  if (ditchPayItems.length === 0) return null

                  const totalVarianceCost = ditchPayItems.reduce((s, d) => s + (d.variance * d.rate), 0)

                  return (
                    <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px', overflow: 'hidden' }}>
                      <div style={{ backgroundColor: '#6f42c1', color: 'white', padding: '10px 16px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Ditching Pay Items (UPIs)</span>
                        <span style={{ fontWeight: 'normal', fontSize: '13px' }}>
                          {ditchPayItems.filter(d => d.variance > 0).length} items with variance
                          {totalVarianceCost > 0 && <span style={{ marginLeft: '8px', color: '#fca5a5' }}>+${totalVarianceCost.toLocaleString()}</span>}
                        </span>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead><tr>
                          <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'left' }}>Pay Item</th>
                          <th style={{ backgroundColor: '#dc2626', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Contractor Claimed</th>
                          <th style={{ backgroundColor: '#16a34a', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Inspector Verified</th>
                          <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Variance</th>
                          <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Rate</th>
                          <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Impact</th>
                        </tr></thead>
                        <tbody>
                          {ditchPayItems.map((d, i) => (
                            <tr key={i} style={{ backgroundColor: d.variance > 0 ? '#fef2f2' : d.variance < 0 ? '#f0fdf4' : 'white' }}>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>{d.item}</td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fef2f2' }}>{d.contractorClaimed.toFixed(1)} {d.unit}</td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#f0fdf4' }}>{d.inspectorVerified.toFixed(1)} {d.unit}</td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 'bold', color: d.variance > 0 ? '#dc2626' : d.variance < 0 ? '#16a34a' : '#6b7280' }}>
                                {d.variance > 0 ? '+' : ''}{d.variance.toFixed(1)} {d.unit}
                              </td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace' }}>${d.rate}/{d.unit}</td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 'bold', color: d.variance > 0 ? '#dc2626' : d.variance < 0 ? '#16a34a' : '#6b7280' }}>
                                {d.variance !== 0 ? (d.variance > 0 ? '+' : '') + '$' + (d.variance * d.rate).toLocaleString() : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {ditchPayItems.length > 0 && (
                          <tfoot>
                            <tr style={{ backgroundColor: '#f3f4f6' }}>
                              <td colSpan="5" style={{ padding: '10px 12px', fontWeight: '600', textAlign: 'right' }}>Total Financial Impact:</td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', fontSize: '14px', color: totalVarianceCost > 0 ? '#dc2626' : totalVarianceCost < 0 ? '#16a34a' : '#6b7280' }}>
                                {totalVarianceCost > 0 ? '+' : ''}{totalVarianceCost !== 0 ? '$' + totalVarianceCost.toLocaleString() : '-'}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                      <div style={{ padding: '10px 16px', backgroundColor: '#f9fafb', fontSize: '11px', color: '#6b7280' }}>
                        Based on {dateTrenchLogs.length} trench inspection record(s) for this date and foreman
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {/* REVIEW MODAL - Full Documents Side by Side */}
      {showReviewModal && selectedItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#f3f4f6', borderRadius: '12px', width: '98%', maxWidth: '1800px', height: '95vh', display: 'flex', flexDirection: 'column' }}>
            {/* Modal Header */}
            <div style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '16px 24px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px' }}>Review Discrepancy - {selectedItem.itemType === 'labour' ? selectedItem.name : selectedItem.type}</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#93c5fd' }}>Field Log: {selectedItem.lemId} | Date: {selectedItem.lemDate} | Foreman: {selectedItem.foreman}</p>
              </div>
              <button onClick={() => setShowReviewModal(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '28px', cursor: 'pointer', padding: '0 8px' }}>×</button>
            </div>

            {/* Variance Banner */}
            <div style={{ backgroundColor: '#fef2f2', borderBottom: '2px solid #fca5a5', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
                <div><span style={{ color: '#991b1b', fontWeight: '500' }}>Item:</span> <strong>{selectedItem.itemType === 'labour' ? selectedItem.name : selectedItem.type}</strong></div>
                <div><span style={{ color: '#991b1b', fontWeight: '500' }}>LEM Hours:</span> <strong style={{ color: '#dc2626' }}>{selectedItem.lemHours}</strong></div>
                <div><span style={{ color: '#991b1b', fontWeight: '500' }}>Timesheet Hours:</span> <strong style={{ color: '#f59e0b' }}>{selectedItem.timesheetHours}</strong></div>
                <div><span style={{ color: '#991b1b', fontWeight: '500' }}>Variance:</span> <strong style={{ color: '#dc2626', fontSize: '18px' }}>+{selectedItem.variance} hrs (${(selectedItem.varianceCost || 0).toFixed(2)})</strong></div>
              </div>
            </div>

            {/* Three Panel View */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', padding: '16px', overflow: 'hidden' }}>
              
              {/* Panel 1: LEM */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '2px solid #dc2626', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#dc2626', color: 'white', padding: '12px 16px', fontWeight: '600', fontSize: '16px' }}>💰 Contractor LEM</div>
                <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
                  <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                      <div><strong>Field Log:</strong> {selectedLem?.field_log_id}</div>
                      <div><strong>Date:</strong> {selectedLem?.date}</div>
                      <div><strong>Foreman:</strong> {selectedLem?.foreman}</div>
                      <div><strong>Account:</strong> {selectedLem?.account_number}</div>
                    </div>
                  </div>

                  <h4 style={{ margin: '0 0 10px 0', color: '#dc2626', borderBottom: '1px solid #fee2e2', paddingBottom: '8px' }}>Labour Entries</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '20px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#fee2e2' }}>
                        <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #fecaca' }}>Name</th>
                        <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #fecaca' }}>Type</th>
                        <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #fecaca' }}>RT</th>
                        <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #fecaca' }}>OT</th>
                        <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #fecaca' }}>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedLem?.labour_entries || []).map((entry, i) => (
                        <tr key={i} style={{ backgroundColor: entry.name?.toUpperCase() === selectedItem.name?.toUpperCase() ? '#fef2f2' : 'white' }}>
                          <td style={{ padding: '8px', border: '1px solid #fecaca', fontWeight: entry.name?.toUpperCase() === selectedItem.name?.toUpperCase() ? 'bold' : 'normal' }}>{entry.name}</td>
                          <td style={{ padding: '8px', border: '1px solid #fecaca' }}>{entry.type}</td>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #fecaca' }}>{entry.rt_hours || 0}</td>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #fecaca' }}>{entry.ot_hours || 0}</td>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #fecaca' }}>${entry.rt_rate || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <h4 style={{ margin: '0 0 10px 0', color: '#dc2626', borderBottom: '1px solid #fee2e2', paddingBottom: '8px' }}>Equipment Entries</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#fee2e2' }}>
                        <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #fecaca' }}>Equipment ID</th>
                        <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #fecaca' }}>Type</th>
                        <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #fecaca' }}>Hours</th>
                        <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #fecaca' }}>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedLem?.equipment_entries || []).map((entry, i) => (
                        <tr key={i} style={{ backgroundColor: entry.type?.toUpperCase().includes(selectedItem.type?.toUpperCase()?.split(' ')[0] || 'XXX') ? '#fef2f2' : 'white' }}>
                          <td style={{ padding: '8px', border: '1px solid #fecaca' }}>{entry.equipment_id || '-'}</td>
                          <td style={{ padding: '8px', border: '1px solid #fecaca', fontWeight: entry.type?.toUpperCase().includes(selectedItem.type?.toUpperCase()?.split(' ')[0] || 'XXX') ? 'bold' : 'normal' }}>{entry.type}</td>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #fecaca' }}>{entry.hours || 0}</td>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #fecaca' }}>${entry.rate || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fee2e2', borderRadius: '6px', textAlign: 'right' }}>
                    <strong>LEM Total: ${((parseFloat(selectedLem?.total_labour_cost) || 0) + (parseFloat(selectedLem?.total_equipment_cost) || 0)).toLocaleString()}</strong>
                  </div>
                </div>
              </div>

              {/* Panel 2: Daily Timesheet Photo */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '2px solid #f59e0b', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#f59e0b', color: 'white', padding: '12px 16px', fontWeight: '600', fontSize: '16px' }}>📝 Daily Timesheet</div>
                <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                  {ticketPhotos.length > 0 ? (
                    <>
                      <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: '#fef3c7', borderRadius: '6px', fontSize: '12px', textAlign: 'center' }}>
                        Foreman-signed timesheet from {selectedItem.lemDate}
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img 
                          src={`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${ticketPhotos[0]}`}
                          alt="Daily Timesheet"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                        />
                      </div>
                      <div style={{ marginTop: '12px', textAlign: 'center' }}>
                        <a href={`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${ticketPhotos[0]}`} target="_blank" rel="noreferrer" style={{ color: '#92400e', fontSize: '12px' }}>
                          Open in new tab ↗
                        </a>
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📷</div>
                        <p>No timesheet photo available</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Panel 3: Inspector Report */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '2px solid #16a34a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#16a34a', color: 'white', padding: '12px 16px', fontWeight: '600', fontSize: '16px' }}>👷 Inspector Report</div>
                <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
                  {matchingReport ? (
                    <>
                      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '6px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                          <div><strong>Date:</strong> {matchingReport.date}</div>
                          <div><strong>Inspector:</strong> {matchingReport.inspector_name}</div>
                          <div><strong>Spread:</strong> {matchingReport.spread || '-'}</div>
                          <div><strong>Crew:</strong> {matchingReport.crew || '-'}</div>
                          <div style={{ gridColumn: 'span 2' }}><strong>Change Order:</strong> {matchingReport.change_order || 'Base Contract'}</div>
                        </div>
                      </div>

                      {matchingReport.notes && (
                        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                          <strong>Notes:</strong>
                          <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>{matchingReport.notes}</p>
                        </div>
                      )}

                      {matchingReport.activity_blocks && matchingReport.activity_blocks.map((block, idx) => (
                        <div key={idx} style={{ backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '6px', marginBottom: '12px' }}>
                          <h4 style={{ margin: '0 0 10px 0', color: '#16a34a' }}>{block.activityType || 'Activity ' + (idx + 1)}</h4>
                          
                          {block.chainageStart && (
                            <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                              <strong>Chainage:</strong> {block.chainageStart} to {block.chainageEnd}
                            </div>
                          )}

                          {block.foreman && (
                            <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                              <strong>Foreman:</strong> {block.foreman}
                            </div>
                          )}

                          {block.labourEntries && block.labourEntries.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                              <strong style={{ fontSize: '12px' }}>Labour:</strong>
                              <table style={{ width: '100%', marginTop: '5px', borderCollapse: 'collapse', fontSize: '11px' }}>
                                <thead>
                                  <tr style={{ backgroundColor: '#dcfce7' }}>
                                    <th style={{ padding: '6px', textAlign: 'left', border: '1px solid #bbf7d0' }}>Name</th>
                                    <th style={{ padding: '6px', textAlign: 'left', border: '1px solid #bbf7d0' }}>Classification</th>
                                    <th style={{ padding: '6px', textAlign: 'center', border: '1px solid #bbf7d0' }}>RT</th>
                                    <th style={{ padding: '6px', textAlign: 'center', border: '1px solid #bbf7d0' }}>OT</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {block.labourEntries.map((entry, i) => (
                                    <tr key={i} style={{ backgroundColor: (entry.employeeName || entry.name)?.toUpperCase().includes(selectedItem.name?.split(' ')[0]?.toUpperCase() || 'XXX') ? '#dcfce7' : 'white' }}>
                                      <td style={{ padding: '6px', border: '1px solid #bbf7d0', fontWeight: (entry.employeeName || entry.name)?.toUpperCase().includes(selectedItem.name?.split(' ')[0]?.toUpperCase() || 'XXX') ? 'bold' : 'normal' }}>{entry.employeeName || entry.name || '-'}</td>
                                      <td style={{ padding: '6px', border: '1px solid #bbf7d0' }}>{entry.classification || '-'}</td>
                                      <td style={{ padding: '6px', textAlign: 'center', border: '1px solid #bbf7d0' }}>{entry.rt || 0}</td>
                                      <td style={{ padding: '6px', textAlign: 'center', border: '1px solid #bbf7d0' }}>{entry.ot || 0}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {block.equipmentEntries && block.equipmentEntries.length > 0 && (
                            <div>
                              <strong style={{ fontSize: '12px' }}>Equipment:</strong>
                              <table style={{ width: '100%', marginTop: '5px', borderCollapse: 'collapse', fontSize: '11px' }}>
                                <thead>
                                  <tr style={{ backgroundColor: '#dcfce7' }}>
                                    <th style={{ padding: '6px', textAlign: 'left', border: '1px solid #bbf7d0' }}>Type</th>
                                    <th style={{ padding: '6px', textAlign: 'center', border: '1px solid #bbf7d0' }}>Count</th>
                                    <th style={{ padding: '6px', textAlign: 'center', border: '1px solid #bbf7d0' }}>Hours</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {block.equipmentEntries.map((entry, i) => (
                                    <tr key={i} style={{ backgroundColor: entry.type?.toUpperCase().includes(selectedItem.type?.split(' ')[0]?.toUpperCase() || 'XXX') ? '#dcfce7' : 'white' }}>
                                      <td style={{ padding: '6px', border: '1px solid #bbf7d0', fontWeight: entry.type?.toUpperCase().includes(selectedItem.type?.split(' ')[0]?.toUpperCase() || 'XXX') ? 'bold' : 'normal' }}>{entry.type || '-'}</td>
                                      <td style={{ padding: '6px', textAlign: 'center', border: '1px solid #bbf7d0' }}>{entry.count || 1}</td>
                                      <td style={{ padding: '6px', textAlign: 'center', border: '1px solid #bbf7d0' }}>{entry.hours || 0}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}

                      {matchingReport.weather && (
                        <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                          <strong>Weather:</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '8px', fontSize: '12px' }}>
                            <div>Conditions: {matchingReport.weather.conditions || '-'}</div>
                            <div>Temp: {matchingReport.weather.temperature || '-'}°C</div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                        <p>No matching inspector report found</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Action Bar */}
            <div style={{ backgroundColor: 'white', borderTop: '1px solid #e5e7eb', padding: '16px 24px', borderRadius: '0 0 12px 12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '13px' }}>Notes / Concerns (rate issues, discrepancies, etc.)</label>
                  <input 
                    type="text"
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                    placeholder="Add any notes about this discrepancy..."
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '13px' }}>Corrected Hours</label>
                  <input 
                    type="number" 
                    value={correctedValue}
                    onChange={e => setCorrectedValue(e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', width: '100px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px', paddingTop: '20px' }}>
                  <button onClick={() => setShowReviewModal(false)} style={{ padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: 'white', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={adminFix} style={{ padding: '10px 20px', border: 'none', borderRadius: '6px', backgroundColor: '#059669', color: 'white', cursor: 'pointer', fontWeight: '500' }}>
                    ✓ Fix & Save
                  </button>
                  <button onClick={flagForContractor} style={{ padding: '10px 20px', border: 'none', borderRadius: '6px', backgroundColor: '#dc2626', color: 'white', cursor: 'pointer', fontWeight: '500' }}>
                    🚨 Flag for Contractor
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VERIFICATION MODAL - No Talk Side-by-Side Transparency View */}
      {showVerifyModal && verifyingLem && (() => {
        const inspData = getMatchingInspectorData(verifyingLem)
        const lemHours = calcLemHours(verifyingLem)
        const inspHours = calcInspectorHours(inspData)
        const hoursVariance = lemHours.total - inspHours.total
        const lemTotal = (parseFloat(verifyingLem.total_labour_cost) || 0) + (parseFloat(verifyingLem.total_equipment_cost) || 0)
        
        // Get matching ticket photos from inspector data
        let verifyTicketPhotos = []
        if (inspData?.photos) {
          inspData.photos.forEach(p => {
            const fn = typeof p === 'string' ? p : p.filename
            if (fn?.toLowerCase().includes('ticket')) verifyTicketPhotos.push(fn)
          })
        }
        
        return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#f3f4f6', borderRadius: '12px', width: '99%', maxWidth: '2000px', height: '96vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '10px 24px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                {/* Back Button */}
                <button 
                  onClick={() => { setShowVerifyModal(false); setVerifyingLem(null); }}
                  style={{ 
                    backgroundColor: 'rgba(255,255,255,0.1)', 
                    border: '2px solid rgba(255,255,255,0.3)', 
                    color: 'white', 
                    padding: '8px 16px', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    fontSize: '14px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  ← Back to Billing
                </button>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px' }}>🔍 NO TALK VERIFICATION - {verifyingLem.field_log_id}</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#93c5fd' }}>Date: {verifyingLem.date} | Foreman: {verifyingLem.foreman} | Contractor: {verifyingLem.contractor || 'N/A'}</p>
                </div>
                {inspData ? (
                  <div style={{ backgroundColor: '#059669', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                    ✓ INSPECTOR TICKET FOUND
                  </div>
                ) : (
                  <div style={{ backgroundColor: '#dc2626', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                    ⚠️ NO MATCHING INSPECTOR TICKET
                  </div>
                )}
              </div>
              <button onClick={() => { setShowVerifyModal(false); setVerifyingLem(null); }} style={{ background: 'none', border: 'none', color: 'white', fontSize: '28px', cursor: 'pointer', padding: '0 8px' }}>×</button>
            </div>

            {/* 💰 THE MONEY BANNER - Yellow/Gold */}
            <div style={{ background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)', color: '#1e3a5f', padding: '12px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '30px', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px' }}>Labour Cost</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', fontFamily: 'monospace' }}>${(parseFloat(verifyingLem.total_labour_cost) || 0).toLocaleString()}</div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '300', opacity: 0.6 }}>+</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px' }}>Equipment Cost</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', fontFamily: 'monospace' }}>${(parseFloat(verifyingLem.total_equipment_cost) || 0).toLocaleString()}</div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '300', opacity: 0.6 }}>=</div>
              <div style={{ textAlign: 'center', backgroundColor: 'rgba(30,58,95,0.15)', padding: '8px 30px', borderRadius: '10px', border: '3px solid rgba(30,58,95,0.3)' }}>
                <div style={{ fontSize: '10px', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '1px' }}>💰 TOTAL CONTRACTOR BILLED</div>
                <div style={{ fontSize: '36px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  ${lemTotal.toLocaleString()}
                </div>
              </div>
              <div style={{ borderLeft: '2px solid rgba(30,58,95,0.3)', height: '50px', margin: '0 10px' }}></div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px' }}>LEM Hours</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'monospace' }}>{lemHours.total.toFixed(1)}</div>
              </div>
              {inspData && (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px' }}>Inspector Hours</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'monospace' }}>{inspHours.total.toFixed(1)}</div>
                  </div>
                  <div 
                    onClick={() => toggleMismatchHighlight(verifyingLem, inspData)}
                    style={{ 
                      textAlign: 'center', 
                      backgroundColor: hoursVariance !== 0 ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.3)', 
                      padding: '6px 14px', 
                      borderRadius: '8px',
                      border: hoursVariance !== 0 ? '3px solid #fca5a5' : '2px solid #86efac',
                      animation: hoursVariance !== 0 ? 'pulse 1.5s infinite' : 'none',
                      cursor: 'pointer',
                      transition: 'transform 0.1s'
                    }}
                    title="Click to highlight mismatched rows in all panels"
                  >
                    <div style={{ fontSize: '10px', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: hoursVariance !== 0 ? '700' : '400' }}>
                      {highlightMismatches ? '🔴 SHOWING MISMATCHES' : (hoursVariance !== 0 ? '⚠️ VARIANCE (CLICK)' : '✓ VARIANCE')}
                    </div>
                    <div style={{ 
                      fontSize: hoursVariance !== 0 ? '24px' : '20px', 
                      fontWeight: 'bold', 
                      fontFamily: 'monospace', 
                      color: hoursVariance !== 0 ? '#fef2f2' : '#bbf7d0',
                      textShadow: hoursVariance !== 0 ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none'
                    }}>
                      {hoursVariance > 0 ? '+' : ''}{hoursVariance.toFixed(1)} hrs
                    </div>
                    {hoursVariance !== 0 && !highlightMismatches && (
                      <div style={{ fontSize: '9px', marginTop: '2px', color: '#fecaca', fontWeight: '600' }}>
                        👆 CLICK TO SHOW WHERE
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 4-PANEL SIDE BY SIDE LAYOUT */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', padding: '10px', overflow: 'hidden' }}>
              
              {/* PANEL 1: Contractor LEM (Digital Data) - DARK BLUE */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '3px solid #1e3a5f', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '8px 12px', fontWeight: '600', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>💰 CONTRACTOR LEM</span>
                  <span style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px', fontSize: '9px' }}>
                    {(verifyingLem.labour_entries || []).length}L | {(verifyingLem.equipment_entries || []).length}E
                  </span>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: '8px', fontSize: '10px' }}>
                  {/* Summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                    <div style={{ backgroundColor: '#dbeafe', padding: '6px', borderRadius: '4px' }}>
                      <div style={{ fontSize: '8px', color: '#1e40af', textTransform: 'uppercase' }}>Field Log</div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#1e3a5f' }}>{verifyingLem.field_log_id}</div>
                    </div>
                    <div style={{ backgroundColor: '#dbeafe', padding: '6px', borderRadius: '4px' }}>
                      <div style={{ fontSize: '8px', color: '#1e40af', textTransform: 'uppercase' }}>Account #</div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#1e3a5f' }}>{verifyingLem.account_number || '-'}</div>
                    </div>
                  </div>

                  {/* Labour Table */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '3px 6px', borderRadius: '4px 4px 0 0', fontSize: '9px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
                      <span>LABOUR</span>
                      <span>${(parseFloat(verifyingLem.total_labour_cost) || 0).toLocaleString()}</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#dbeafe' }}>
                          <th style={{ padding: '2px', textAlign: 'left', border: '1px solid #93c5fd' }}>Name</th>
                          <th style={{ padding: '2px', textAlign: 'left', border: '1px solid #93c5fd', backgroundColor: '#fcd34d' }}>Class</th>
                          <th style={{ padding: '2px', textAlign: 'center', border: '1px solid #93c5fd' }}>RT</th>
                          <th style={{ padding: '2px', textAlign: 'center', border: '1px solid #93c5fd' }}>OT</th>
                          <th style={{ padding: '2px', textAlign: 'right', border: '1px solid #93c5fd', backgroundColor: '#fcd34d' }}>RT$</th>
                          <th style={{ padding: '2px', textAlign: 'right', border: '1px solid #93c5fd', backgroundColor: '#fcd34d' }}>OT$</th>
                          <th style={{ padding: '2px', textAlign: 'right', border: '1px solid #93c5fd', fontWeight: '700' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(verifyingLem.labour_entries || []).length === 0 ? (
                          <tr><td colSpan="7" style={{ padding: '6px', textAlign: 'center', color: '#9ca3af' }}>No entries</td></tr>
                        ) : (verifyingLem.labour_entries || []).map((e, i) => {
                          const rtHrs = parseFloat(e.rt_hours || e.rt || 0)
                          const otHrs = parseFloat(e.ot_hours || e.ot || 0)
                          const rtRate = parseFloat(e.rt_rate || e.rate || 0)
                          const otRate = parseFloat(e.ot_rate || (rtRate * 1.5) || 0)
                          const lineTotal = (rtHrs * rtRate) + (otHrs * otRate)
                          const isMismatched = isLabourMismatched(e.name || e.employee_name)
                          return (
                          <tr key={i} style={{ backgroundColor: isMismatched ? '#fecaca' : (i % 2 ? '#eff6ff' : 'white') }}>
                            <td style={{ padding: '2px', border: '1px solid #93c5fd', fontWeight: '500', maxWidth: '50px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name || e.employee_name || '-'}</td>
                            <td style={{ padding: '2px', border: '1px solid #93c5fd', backgroundColor: isMismatched ? '#fca5a5' : '#fef9c3', fontWeight: '600', fontSize: '7px' }}>{e.type || e.classification || '-'}</td>
                            <td style={{ padding: '2px', textAlign: 'center', border: '1px solid #93c5fd', fontFamily: 'monospace' }}>{rtHrs}</td>
                            <td style={{ padding: '2px', textAlign: 'center', border: '1px solid #93c5fd', fontFamily: 'monospace' }}>{otHrs}</td>
                            <td style={{ padding: '2px', textAlign: 'right', border: '1px solid #93c5fd', fontFamily: 'monospace', backgroundColor: isMismatched ? '#fca5a5' : '#fef9c3', fontWeight: '600' }}>${rtRate}</td>
                            <td style={{ padding: '2px', textAlign: 'right', border: '1px solid #93c5fd', fontFamily: 'monospace', backgroundColor: isMismatched ? '#fca5a5' : '#fef9c3' }}>${otRate}</td>
                            <td style={{ padding: '2px', textAlign: 'right', border: '1px solid #93c5fd', fontFamily: 'monospace', fontWeight: '700', backgroundColor: isMismatched ? '#f87171' : '#dbeafe' }}>${lineTotal.toLocaleString()}</td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>

                  {/* Equipment Table */}
                  <div>
                    <div style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '3px 6px', borderRadius: '4px 4px 0 0', fontSize: '9px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
                      <span>EQUIPMENT</span>
                      <span>${(parseFloat(verifyingLem.total_equipment_cost) || 0).toLocaleString()}</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#dbeafe' }}>
                          <th style={{ padding: '2px', textAlign: 'left', border: '1px solid #93c5fd' }}>Unit</th>
                          <th style={{ padding: '2px', textAlign: 'left', border: '1px solid #93c5fd' }}>Type</th>
                          <th style={{ padding: '2px', textAlign: 'center', border: '1px solid #93c5fd' }}>Hrs</th>
                          <th style={{ padding: '2px', textAlign: 'right', border: '1px solid #93c5fd', backgroundColor: '#fcd34d' }}>Rate</th>
                          <th style={{ padding: '2px', textAlign: 'right', border: '1px solid #93c5fd', fontWeight: '700' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(verifyingLem.equipment_entries || []).length === 0 ? (
                          <tr><td colSpan="5" style={{ padding: '6px', textAlign: 'center', color: '#9ca3af' }}>No entries</td></tr>
                        ) : (verifyingLem.equipment_entries || []).map((e, i) => {
                          const hrs = parseFloat(e.hours || 0)
                          const rate = parseFloat(e.rate || 0)
                          const lineTotal = hrs * rate
                          const isMismatched = isEquipmentMismatched(e.equipment_id || e.unit_number || e.type)
                          return (
                          <tr key={i} style={{ backgroundColor: isMismatched ? '#fecaca' : (i % 2 ? '#eff6ff' : 'white') }}>
                            <td style={{ padding: '2px', border: '1px solid #93c5fd', fontFamily: 'monospace', fontSize: '7px' }}>{e.equipment_id || e.unit_number || '-'}</td>
                            <td style={{ padding: '2px', border: '1px solid #93c5fd', fontWeight: '500' }}>{e.type || e.equipment_type || '-'}</td>
                            <td style={{ padding: '2px', textAlign: 'center', border: '1px solid #93c5fd', fontFamily: 'monospace' }}>{hrs}</td>
                            <td style={{ padding: '2px', textAlign: 'right', border: '1px solid #93c5fd', fontFamily: 'monospace', backgroundColor: isMismatched ? '#fca5a5' : '#fef9c3', fontWeight: '600' }}>${rate}</td>
                            <td style={{ padding: '2px', textAlign: 'right', border: '1px solid #93c5fd', fontFamily: 'monospace', fontWeight: '700', backgroundColor: isMismatched ? '#f87171' : '#dbeafe' }}>${lineTotal.toLocaleString()}</td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>

                  {/* Total */}
                  <div style={{ marginTop: '8px', padding: '6px', backgroundColor: '#1e3a5f', borderRadius: '4px', textAlign: 'right' }}>
                    <strong style={{ color: 'white', fontSize: '11px' }}>TOTAL: ${lemTotal.toLocaleString()}</strong>
                  </div>
                </div>
              </div>

              {/* PANEL 2: Physical LEM Image - LIGHT BLUE */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '3px solid #3b82f6', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#3b82f6', color: 'white', padding: '8px 12px', fontWeight: '600', fontSize: '12px' }}>📷 PHYSICAL LEM</div>
                <div style={{ flex: 1, overflow: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  {verifyingLem.timesheet_photo_url ? (
                    <>
                      <img 
                        src={verifyingLem.timesheet_photo_url}
                        alt="LEM / Timesheet"
                        style={{ maxWidth: '100%', maxHeight: 'calc(100% - 25px)', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', cursor: 'pointer' }}
                        onClick={() => window.open(verifyingLem.timesheet_photo_url, '_blank')}
                      />
                      <a href={verifyingLem.timesheet_photo_url} target="_blank" rel="noreferrer" style={{ marginTop: '6px', color: '#1e40af', fontSize: '9px' }}>
                        🔗 Open full size
                      </a>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', backgroundColor: '#fef2f2', padding: '20px', borderRadius: '8px', border: '2px dashed #fca5a5' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>🚨</div>
                      <p style={{ fontSize: '11px', margin: 0, color: '#991b1b', fontWeight: '600' }}>MISSING LEM IMAGE</p>
                      <p style={{ fontSize: '9px', margin: '4px 0 0 0', color: '#b91c1c' }}>Contractor did not upload</p>
                    </div>
                  )}
                </div>
              </div>

              {/* PANEL 3: Inspector Report - LIGHTER ORANGE */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '3px solid #ea580c', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#ea580c', color: 'white', padding: '8px 12px', fontWeight: '600', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>👷 INSPECTOR REPORT</span>
                  {inspData && <span style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px', fontSize: '9px' }}>#{inspData.report.id || 'N/A'}</span>}
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: '8px', fontSize: '10px' }}>
                  {inspData ? (() => {
                    let inspLabourTotal = 0
                    let inspEquipTotal = 0
                    
                    return (
                    <>
                      {/* Summary */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                        <div style={{ backgroundColor: '#ffedd5', padding: '6px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '8px', color: '#c2410c', textTransform: 'uppercase' }}>Date</div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#9a3412' }}>{inspData.report.date}</div>
                        </div>
                        <div style={{ backgroundColor: '#ffedd5', padding: '6px', borderRadius: '4px' }}>
                          <div style={{ fontSize: '8px', color: '#c2410c', textTransform: 'uppercase' }}>Inspector</div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#9a3412' }}>{inspData.report.inspector_name || 'N/A'}</div>
                        </div>
                      </div>

                      {/* Labour Table */}
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ backgroundColor: '#ea580c', color: 'white', padding: '3px 6px', borderRadius: '4px 4px 0 0', fontSize: '9px', fontWeight: '600' }}>
                          LABOUR ({inspData.labour.length})
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#fed7aa' }}>
                              <th style={{ padding: '2px', textAlign: 'left', border: '1px solid #fdba74' }}>Name</th>
                              <th style={{ padding: '2px', textAlign: 'left', border: '1px solid #fdba74', backgroundColor: '#fcd34d' }}>Class</th>
                              <th style={{ padding: '2px', textAlign: 'center', border: '1px solid #fdba74' }}>RT</th>
                              <th style={{ padding: '2px', textAlign: 'center', border: '1px solid #fdba74' }}>OT</th>
                              <th style={{ padding: '2px', textAlign: 'right', border: '1px solid #fdba74', backgroundColor: '#fcd34d' }}>RT$</th>
                              <th style={{ padding: '2px', textAlign: 'right', border: '1px solid #fdba74', backgroundColor: '#fcd34d' }}>OT$</th>
                              <th style={{ padding: '2px', textAlign: 'right', border: '1px solid #fdba74', fontWeight: '700' }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inspData.labour.length === 0 ? (
                              <tr><td colSpan="7" style={{ padding: '6px', textAlign: 'center', color: '#9ca3af' }}>No entries</td></tr>
                            ) : inspData.labour.map((e, i) => {
                              const rtHrs = parseFloat(e.rt || 0)
                              const otHrs = parseFloat(e.ot || 0)
                              const totalHrs = e.hours || (rtHrs + otHrs) || 0
                              const classification = e.classification || e.type || ''
                              const rates = getLabourRate(classification)
                              const rtCost = (rtHrs || totalHrs) * rates.rt
                              const otCost = otHrs * rates.ot
                              const lineTotal = rtCost + otCost
                              inspLabourTotal += lineTotal
                              const isMismatched = isLabourMismatched(e.employeeName || e.name)
                              return (
                              <tr key={i} style={{ backgroundColor: isMismatched ? '#bbf7d0' : (i % 2 ? '#fff7ed' : 'white') }}>
                                <td style={{ padding: '2px', border: '1px solid #fdba74', fontWeight: '500', maxWidth: '50px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.employeeName || e.name || '-'}</td>
                                <td style={{ padding: '2px', border: '1px solid #fdba74', backgroundColor: isMismatched ? '#86efac' : '#fef9c3', fontWeight: '600', fontSize: '7px' }}>{classification || '-'}</td>
                                <td style={{ padding: '2px', textAlign: 'center', border: '1px solid #fdba74', fontFamily: 'monospace' }}>{rtHrs || totalHrs || '-'}</td>
                                <td style={{ padding: '2px', textAlign: 'center', border: '1px solid #fdba74', fontFamily: 'monospace' }}>{otHrs || '-'}</td>
                                <td style={{ padding: '2px', textAlign: 'right', border: '1px solid #fdba74', fontFamily: 'monospace', backgroundColor: isMismatched ? '#86efac' : '#fef9c3', fontWeight: '600' }}>${rates.rt || '?'}</td>
                                <td style={{ padding: '2px', textAlign: 'right', border: '1px solid #fdba74', fontFamily: 'monospace', backgroundColor: isMismatched ? '#86efac' : '#fef9c3' }}>${rates.ot || '?'}</td>
                                <td style={{ padding: '2px', textAlign: 'right', border: '1px solid #fdba74', fontFamily: 'monospace', fontWeight: '700', backgroundColor: isMismatched ? '#4ade80' : '#fed7aa' }}>${lineTotal.toLocaleString()}</td>
                              </tr>
                            )})}
                          </tbody>
                        </table>
                      </div>

                      {/* Equipment Table */}
                      <div>
                        <div style={{ backgroundColor: '#ea580c', color: 'white', padding: '3px 6px', borderRadius: '4px 4px 0 0', fontSize: '9px', fontWeight: '600' }}>
                          EQUIPMENT ({inspData.equipment.length})
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#ffedd5' }}>
                              <th style={{ padding: '2px', textAlign: 'left', border: '1px solid #fdba74' }}>Unit</th>
                              <th style={{ padding: '2px', textAlign: 'left', border: '1px solid #fdba74' }}>Type</th>
                              <th style={{ padding: '2px', textAlign: 'center', border: '1px solid #fdba74' }}>Hrs</th>
                              <th style={{ padding: '2px', textAlign: 'right', border: '1px solid #fdba74', backgroundColor: '#fcd34d' }}>Rate</th>
                              <th style={{ padding: '2px', textAlign: 'right', border: '1px solid #fdba74', fontWeight: '700' }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inspData.equipment.length === 0 ? (
                              <tr><td colSpan="5" style={{ padding: '6px', textAlign: 'center', color: '#9ca3af' }}>No entries</td></tr>
                            ) : inspData.equipment.map((e, i) => {
                              const hrs = parseFloat(e.hours || 0)
                              const equipType = e.type || e.equipment_type || ''
                              const rate = getEquipmentRate(equipType)
                              const lineTotal = hrs * rate
                              inspEquipTotal += lineTotal
                              const isMismatched = isEquipmentMismatched(e.unit_number || e.equipment_id || e.type)
                              return (
                              <tr key={i} style={{ backgroundColor: isMismatched ? '#bbf7d0' : (i % 2 ? '#fff7ed' : 'white') }}>
                                <td style={{ padding: '2px', border: '1px solid #fdba74', fontFamily: 'monospace', fontSize: '7px' }}>{e.unit_number || e.equipment_id || '-'}</td>
                                <td style={{ padding: '2px', border: '1px solid #fdba74', fontWeight: '500' }}>{equipType || '-'}</td>
                                <td style={{ padding: '2px', textAlign: 'center', border: '1px solid #fdba74', fontFamily: 'monospace' }}>{hrs}</td>
                                <td style={{ padding: '2px', textAlign: 'right', border: '1px solid #fdba74', fontFamily: 'monospace', backgroundColor: isMismatched ? '#86efac' : '#fef9c3', fontWeight: '600' }}>${rate || '?'}</td>
                                <td style={{ padding: '2px', textAlign: 'right', border: '1px solid #fdba74', fontFamily: 'monospace', fontWeight: '700', backgroundColor: isMismatched ? '#4ade80' : '#ffedd5' }}>${lineTotal.toLocaleString()}</td>
                              </tr>
                            )})}
                          </tbody>
                        </table>
                      </div>

                      {/* Totals */}
                      <div style={{ marginTop: '8px', padding: '6px', backgroundColor: '#ea580c', borderRadius: '4px', color: 'white' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                          <span>Labour:</span><strong>${inspLabourTotal.toLocaleString()}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                          <span>Equip:</span><strong>${inspEquipTotal.toLocaleString()}</strong>
                        </div>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', marginTop: '4px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                          <strong>TOTAL:</strong>
                          <strong>${(inspLabourTotal + inspEquipTotal).toLocaleString()}</strong>
                        </div>
                      </div>
                      {Math.abs(lemTotal - (inspLabourTotal + inspEquipTotal)) > 1 && (
                        <div style={{ marginTop: '6px', padding: '4px', backgroundColor: '#fecaca', borderRadius: '4px', textAlign: 'center', color: '#dc2626', fontWeight: '600', fontSize: '9px' }}>
                          ⚠️ VARIANCE: ${Math.abs(lemTotal - (inspLabourTotal + inspEquipTotal)).toLocaleString()}
                        </div>
                      )}
                    </>
                    )
                  })() : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                        <p style={{ fontSize: '11px', margin: 0 }}>No inspector report</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* PANEL 4: OCR'd Daily Ticket - LIGHT ORANGE */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '3px solid #f97316', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#f97316', color: 'white', padding: '8px 12px', fontWeight: '600', fontSize: '12px' }}>📝 OCR'd DAILY TICKET</div>
                <div style={{ flex: 1, overflow: 'auto', padding: '8px', display: 'flex', flexDirection: 'column' }}>
                  {verifyTicketPhotos.length > 0 ? (
                    <>
                      <div style={{ marginBottom: '6px', padding: '4px', backgroundColor: '#ffedd5', borderRadius: '4px', fontSize: '9px', textAlign: 'center' }}>
                        Foreman-signed timesheet
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img 
                          src={`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${verifyTicketPhotos[0]}`}
                          alt="Daily Ticket"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', cursor: 'pointer' }}
                          onClick={() => window.open(`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${verifyTicketPhotos[0]}`, '_blank')}
                        />
                      </div>
                      <div style={{ marginTop: '6px', textAlign: 'center' }}>
                        <a href={`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${verifyTicketPhotos[0]}`} target="_blank" rel="noreferrer" style={{ color: '#c2410c', fontSize: '9px' }}>
                          Open full size ↗
                        </a>
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ textAlign: 'center', backgroundColor: '#fef2f2', padding: '20px', borderRadius: '8px', border: '2px dashed #fca5a5' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
                        <p style={{ fontSize: '11px', margin: 0, color: '#991b1b', fontWeight: '600' }}>MISSING TICKET</p>
                        <p style={{ fontSize: '9px', margin: '4px 0 0 0', color: '#b91c1c' }}>Inspector did not upload</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Action Bar - Verification Controls */}
            <div style={{ backgroundColor: 'white', borderTop: '3px solid #1e3a5f', padding: '12px 24px', borderRadius: '0 0 12px 12px', flexShrink: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: '16px', alignItems: 'end' }}>
                {/* Verified Amounts - Editable */}
                <div>
                  <div style={{ fontSize: '10px', color: '#374151', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' }}>✏️ Verified Amounts (edit if different)</div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '2px', fontWeight: '500', fontSize: '10px', color: '#6b7280' }}>Labour $</label>
                      <input 
                        type="number" 
                        value={verifiedLabourCost}
                        onChange={e => setVerifiedLabourCost(e.target.value)}
                        style={{ padding: '8px 10px', border: '2px solid #2563eb', borderRadius: '4px', width: '100px', fontFamily: 'monospace', fontSize: '14px', fontWeight: '600' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '2px', fontWeight: '500', fontSize: '10px', color: '#6b7280' }}>Equipment $</label>
                      <input 
                        type="number" 
                        value={verifiedEquipmentCost}
                        onChange={e => setVerifiedEquipmentCost(e.target.value)}
                        style={{ padding: '8px 10px', border: '2px solid #2563eb', borderRadius: '4px', width: '100px', fontFamily: 'monospace', fontSize: '14px', fontWeight: '600' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'end' }}>
                      <div style={{ padding: '8px 16px', backgroundColor: '#059669', color: 'white', borderRadius: '4px', fontFamily: 'monospace', fontSize: '16px', fontWeight: 'bold' }}>
                        = ${((parseFloat(verifiedLabourCost) || 0) + (parseFloat(verifiedEquipmentCost) || 0)).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Discrepancy Note */}
                <div>
                  <label style={{ display: 'block', marginBottom: '2px', fontWeight: '600', fontSize: '10px', color: '#dc2626', textTransform: 'uppercase' }}>
                    ⚠️ Discrepancy Note (REQUIRED to keep Open)
                  </label>
                  <input 
                    type="text"
                    value={discrepancyNote}
                    onChange={e => setDiscrepancyNote(e.target.value)}
                    placeholder="e.g., Missing 2 hours sideboom time, Labour rate incorrect, Can't read timesheet..."
                    style={{ width: '100%', padding: '8px 10px', border: '2px solid #fca5a5', borderRadius: '4px', boxSizing: 'border-box', fontSize: '12px' }}
                  />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => { setShowVerifyModal(false); setVerifyingLem(null); }} 
                    style={{ padding: '10px 16px', border: '2px solid #d1d5db', borderRadius: '4px', backgroundColor: 'white', cursor: 'pointer', fontWeight: '500', fontSize: '12px' }}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={keepAsOpen}
                    style={{ padding: '10px 16px', border: 'none', borderRadius: '4px', backgroundColor: '#f59e0b', color: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                  >
                    ⚠️ Keep OPEN
                  </button>
                  <button 
                    onClick={verifyAsMatched}
                    style={{ padding: '10px 24px', border: 'none', borderRadius: '4px', backgroundColor: '#059669', color: 'white', cursor: 'pointer', fontWeight: '700', fontSize: '14px', boxShadow: '0 2px 8px rgba(5,150,105,0.4)' }}
                  >
                    ✓ VERIFY MATCHED
                  </button>
                </div>
              </div>
              
              {/* Audit Trail Notice */}
              <div style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: '#fef3c7', borderRadius: '4px', fontSize: '10px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🔒</span>
                <span><strong>AUDIT TRAIL:</strong> All verification actions are logged with timestamp, user, and dollar amounts. Changes cannot be hidden.</span>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* INVOICE MODAL - With Grand Total Validation */}
      {showInvoiceModal && (() => {
        const selectedLems = contractorData.filter(l => selectedForBilling.includes(l.id))
        const totalLabourCost = selectedLems.reduce((sum, l) => sum + (parseFloat(l.total_labour_cost) || 0), 0)
        const totalEquipCost = selectedLems.reduce((sum, l) => sum + (parseFloat(l.total_equipment_cost) || 0), 0)
        const grandTotal = totalLabourCost + totalEquipCost
        
        return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '600px', maxWidth: '95%' }}>
            <div style={{ backgroundColor: '#7c3aed', color: 'white', padding: '20px', borderRadius: '12px 12px 0 0' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>📄 Create Invoice Batch</h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.8 }}>Verify totals against physical invoice before finalizing</p>
            </div>
            <div style={{ padding: '24px' }}>
              {/* Grand Total Validation Box */}
              <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '20px', marginBottom: '20px', border: '2px solid #86efac' }}>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', color: '#166534', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>
                    ✓ VERIFY THIS MATCHES YOUR PHYSICAL INVOICE
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', textAlign: 'center' }}>
                  <div style={{ backgroundColor: 'white', padding: '12px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Labour Total</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563eb', fontFamily: 'monospace' }}>${totalLabourCost.toLocaleString()}</div>
                  </div>
                  <div style={{ backgroundColor: 'white', padding: '12px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Equipment Total</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f59e0b', fontFamily: 'monospace' }}>${totalEquipCost.toLocaleString()}</div>
                  </div>
                  <div style={{ backgroundColor: '#059669', padding: '12px', borderRadius: '6px', color: 'white' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.9 }}>💰 Grand Total</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>${grandTotal.toLocaleString()}</div>
                  </div>
                </div>
                <div style={{ marginTop: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#166534', fontWeight: '500' }}>
                    {selectedForBilling.length} LEMs selected
                  </span>
                </div>
              </div>

              {/* Selected LEMs Summary Table */}
              <div style={{ marginBottom: '20px', maxHeight: '150px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Field Log</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Labour</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Equip</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: '700' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLems.map((lem, i) => {
                      const labour = parseFloat(lem.total_labour_cost) || 0
                      const equip = parseFloat(lem.total_equipment_cost) || 0
                      return (
                        <tr key={lem.id} style={{ backgroundColor: i % 2 ? '#f9fafb' : 'white' }}>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: '500' }}>{lem.field_log_id}</td>
                          <td style={{ padding: '6px 8px' }}>{lem.date}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>${labour.toLocaleString()}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>${equip.toLocaleString()}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: '600' }}>${(labour + equip).toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Invoice Number *</label>
                <input 
                  type="text" 
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="e.g., INV-2026-001"
                  style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '16px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Notes (optional)</label>
                <textarea 
                  value={invoiceNotes}
                  onChange={e => setInvoiceNotes(e.target.value)}
                  placeholder="Any notes about this invoice..."
                  rows={2}
                  style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>

              {/* Warning Banner */}
              <div style={{ marginBottom: '16px', padding: '10px', backgroundColor: '#fef3c7', borderRadius: '6px', border: '1px solid #fcd34d' }}>
                <div style={{ fontSize: '11px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚠️</span>
                  <span><strong>VERIFY:</strong> Does the Grand Total above match your physical contractor invoice?</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowInvoiceModal(false); setInvoiceNumber(''); setInvoiceNotes(''); }} style={{ padding: '12px 24px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: 'white', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={createInvoiceBatch} style={{ padding: '12px 24px', border: 'none', borderRadius: '6px', backgroundColor: '#7c3aed', color: 'white', cursor: 'pointer', fontWeight: '600' }}>
                  ✓ Finalize Invoice - ${grandTotal.toLocaleString()}
                </button>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* INVOICE ASSIGNMENT MODAL - After Finalize Batch */}
      {showInvoiceAssignModal && pendingInvoiceLems.length > 0 && (() => {
        const totalLabour = pendingInvoiceLems.reduce((sum, l) => sum + (parseFloat(l.total_labour_cost) || 0), 0)
        const totalEquip = pendingInvoiceLems.reduce((sum, l) => sum + (parseFloat(l.total_equipment_cost) || 0), 0)
        const grandTotal = totalLabour + totalEquip
        const contractor = pendingInvoiceLems[0]?.contractor || 'Unknown Contractor'
        
        return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '700px', maxWidth: '95%', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', color: 'white', padding: '24px', borderRadius: '16px 16px 0 0' }}>
              <h2 style={{ margin: 0, fontSize: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                🧾 Assign Contractor Invoice Number
              </h2>
              <p style={{ margin: '8px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
                {pendingInvoiceLems.length} tickets ready for invoicing from <strong>{contractor}</strong>
              </p>
            </div>
            
            <div style={{ padding: '24px' }}>
              {/* Grand Total Verification Box */}
              <div style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', borderRadius: '12px', padding: '24px', marginBottom: '24px', border: '3px solid #f59e0b', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#92400e', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700', marginBottom: '8px' }}>
                  ⚠️ VERIFY THIS TOTAL MATCHES YOUR PHYSICAL INVOICE
                </div>
                <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#1e3a5f', fontFamily: 'monospace' }}>
                  ${grandTotal.toLocaleString()}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginTop: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Labour</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: '#2563eb', fontFamily: 'monospace' }}>${totalLabour.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Equipment</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: '#f59e0b', fontFamily: 'monospace' }}>${totalEquip.toLocaleString()}</div>
                  </div>
                </div>
              </div>

              {/* Invoice Number Input */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#1e3a5f' }}>
                  Contractor Invoice Number <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input 
                  type="text" 
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="Enter the invoice number from the contractor's document..."
                  style={{ width: '100%', padding: '16px', border: '2px solid #d1d5db', borderRadius: '8px', fontSize: '18px', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  autoFocus
                />
                <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                  This is the invoice number printed on the contractor's physical invoice document.
                </p>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#1e3a5f' }}>
                  Notes (optional)
                </label>
                <textarea 
                  value={invoiceNotes}
                  onChange={e => setInvoiceNotes(e.target.value)}
                  placeholder="Any notes about this invoice batch..."
                  rows={2}
                  style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>

              {/* Selected LEMs Summary */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Tickets Included ({pendingInvoiceLems.length})
                </div>
                <div style={{ maxHeight: '120px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead style={{ position: 'sticky', top: 0 }}>
                      <tr style={{ backgroundColor: '#f3f4f6' }}>
                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Field Log</th>
                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Foreman</th>
                        <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: '700' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingInvoiceLems.map((lem, i) => (
                        <tr key={lem.id} style={{ backgroundColor: i % 2 ? '#f9fafb' : 'white' }}>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: '500' }}>{lem.field_log_id}</td>
                          <td style={{ padding: '6px 8px' }}>{lem.date}</td>
                          <td style={{ padding: '6px 8px' }}>{lem.foreman || '-'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: '600' }}>
                            ${((parseFloat(lem.total_labour_cost) || 0) + (parseFloat(lem.total_equipment_cost) || 0)).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Swipe Clean Notice */}
              <div style={{ marginBottom: '24px', padding: '12px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '12px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🧹</span>
                  <span><strong>Swipe Clean:</strong> These tickets will be removed from the active view once invoiced. You can view them later using the "Archived/Invoiced" filter.</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => { 
                    setShowInvoiceAssignModal(false); 
                    setInvoiceNumber(''); 
                    setInvoiceNotes(''); 
                    setPendingInvoiceLems([]);
                    setSelectedForBilling([]);
                  }} 
                  style={{ padding: '14px 28px', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', fontSize: '14px' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={assignInvoiceAndComplete} 
                  disabled={!invoiceNumber.trim()}
                  style={{ 
                    padding: '14px 32px', 
                    border: 'none', 
                    borderRadius: '8px', 
                    backgroundColor: invoiceNumber.trim() ? '#059669' : '#d1d5db', 
                    color: 'white', 
                    cursor: invoiceNumber.trim() ? 'pointer' : 'not-allowed', 
                    fontWeight: '700',
                    fontSize: '14px',
                    boxShadow: invoiceNumber.trim() ? '0 4px 12px rgba(5,150,105,0.4)' : 'none'
                  }}
                >
                  ✓ Confirm Invoice & Swipe Clean - ${grandTotal.toLocaleString()}
                </button>
              </div>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
