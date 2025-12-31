import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

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

  useEffect(() => { loadData() }, [dateRange])

  async function loadData() {
    setLoading(true)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    const { data: lems } = await supabase.from('contractor_lems').select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false })

    const { data: reports } = await supabase.from('daily_tickets').select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false })

    const { data: disputeData } = await supabase.from('disputes').select('*')
      .order('created_at', { ascending: false })

    const { data: correctionData } = await supabase.from('reconciliation_corrections').select('*')
      .order('created_at', { ascending: false })

    setContractorData(lems || [])
    setInspectorData(reports || [])
    setDisputes(disputeData || [])
    setCorrections(correctionData || [])
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
      corrected_by: adminName,
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
      emailed_at: new Date().toISOString(),
      emailed_by: adminName
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
        emailed_at: new Date().toISOString(),
        emailed_by: adminName
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
          <button onClick={() => setViewMode('disputes')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: viewMode === 'disputes' ? '#dc2626' : '#e5e7eb', color: viewMode === 'disputes' ? 'white' : '#374151', fontWeight: '500' }}>
            ⚠️ Disputes ({disputes.filter(d => d.status !== 'resolved').length})
          </button>
          <button onClick={() => setViewMode('corrections')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: viewMode === 'corrections' ? '#059669' : '#e5e7eb', color: viewMode === 'corrections' ? 'white' : '#374151', fontWeight: '500' }}>
            ✓ Corrections ({corrections.length})
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
    </div>
  )
}
