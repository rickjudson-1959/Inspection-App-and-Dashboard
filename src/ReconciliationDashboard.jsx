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
    if (!error) loadData()
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
    disputed: { bg: '#fee2e2', text: '#991b1b', label: 'Disputed' },
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

          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end' }}>
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
                          <option value="disputed">Disputed</option>
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

                {/* 3-Panel Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <div style={{ backgroundColor: '#dc2626', color: 'white', padding: '10px 16px', fontWeight: '600' }}>💰 Contractor LEM</div>
                    <div style={{ padding: '16px' }}>
                      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>{lemLabour.length} Workers | {lemEquipment.length} Equipment</div>
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}><span>Labour:</span><strong>{lemLabourTotal.toFixed(1)} hrs</strong></div>
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}><span>Equipment:</span><strong>{lemEquipTotal.toFixed(1)} hrs</strong></div>
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <div style={{ backgroundColor: '#f59e0b', color: 'white', padding: '10px 16px', fontWeight: '600' }}>📝 Timesheet (OCR)</div>
                    <div style={{ padding: '16px' }}>
                      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>{timesheetLabour.length} Workers | {timesheetEquipment.length} Equipment</div>
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}><span>Labour:</span><strong>{tsLabourTotal.toFixed(1)} hrs</strong></div>
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}><span>Equipment:</span><strong>{tsEquipTotal.toFixed(1)} hrs</strong></div>
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <div style={{ backgroundColor: '#16a34a', color: 'white', padding: '10px 16px', fontWeight: '600' }}>👷 Inspector Report</div>
                    <div style={{ padding: '16px' }}>
                      {matchingReport ? (<>
                        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>Inspector: {matchingReport.inspector_name}</div>
                        <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}><span>Labour:</span><strong>{tsLabourTotal.toFixed(1)} hrs</strong></div>
                        <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}><span>Equipment:</span><strong>{tsEquipTotal.toFixed(1)} hrs</strong></div>
                      </>) : <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>No matching report</div>}
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

      {/* REVIEW MODAL - Side by Side */}
      {showReviewModal && selectedItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '900px', maxWidth: '95%', maxHeight: '90vh', overflow: 'auto' }}>
            {/* Modal Header */}
            <div style={{ backgroundColor: '#1f2937', color: 'white', padding: '16px 24px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Review Discrepancy</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#9ca3af' }}>Field Log: {selectedItem.lemId} | Date: {selectedItem.lemDate}</p>
              </div>
              <button onClick={() => setShowReviewModal(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            {/* Side by Side Comparison */}
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {/* LEM Panel */}
                <div style={{ border: '2px solid #dc2626', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#dc2626', color: 'white', padding: '10px 16px', fontWeight: '600' }}>💰 Contractor LEM</div>
                  <div style={{ padding: '16px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{selectedItem.itemType === 'labour' ? 'Employee' : 'Equipment'}</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{selectedItem.itemType === 'labour' ? selectedItem.name : selectedItem.type}</div>
                    </div>
                    {selectedItem.classification && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Classification</div>
                        <div style={{ fontSize: '14px' }}>{selectedItem.classification}</div>
                      </div>
                    )}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Hours Claimed</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626' }}>{selectedItem.lemHours}</div>
                    </div>
                    {selectedItem.rate && (
                      <div>
                        <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Rate</div>
                        <div style={{ fontSize: '14px' }}>${selectedItem.rate}/hr</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Timesheet Panel */}
                <div style={{ border: '2px solid #f59e0b', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f59e0b', color: 'white', padding: '10px 16px', fontWeight: '600' }}>📝 Daily Timesheet</div>
                  <div style={{ padding: '16px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{selectedItem.itemType === 'labour' ? 'Employee' : 'Equipment'}</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{selectedItem.tsMatch ? (selectedItem.tsMatch.employeeName || selectedItem.tsMatch.name || selectedItem.tsMatch.type) : 'NOT FOUND'}</div>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Hours Recorded</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{selectedItem.timesheetHours}</div>
                    </div>
                    {ticketPhotos.length > 0 && (
                      <a href={`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${ticketPhotos[0]}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', backgroundColor: '#fef3c7', color: '#92400e', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', textDecoration: 'none' }}>
                        📸 View Timesheet Photo
                      </a>
                    )}
                  </div>
                </div>

                {/* Inspector Panel */}
                <div style={{ border: '2px solid #16a34a', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#16a34a', color: 'white', padding: '10px 16px', fontWeight: '600' }}>👷 Inspector Report</div>
                  <div style={{ padding: '16px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Inspector</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{matchingReport?.inspector_name || 'N/A'}</div>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Hours Observed</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a' }}>{selectedItem.timesheetHours}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Ticket #</div>
                      <div style={{ fontSize: '14px' }}>{selectedItem.ticketNumber}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Variance Summary */}
              <div style={{ backgroundColor: '#fef2f2', border: '2px solid #fca5a5', borderRadius: '8px', padding: '16px', marginBottom: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#991b1b', textTransform: 'uppercase', marginBottom: '4px' }}>Variance</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc2626' }}>+{selectedItem.variance} hours</div>
                <div style={{ fontSize: '14px', color: '#991b1b' }}>Estimated cost: ${(selectedItem.varianceCost || 0).toFixed(2)}</div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Notes / Concerns</label>
                <textarea 
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="Add any notes about this discrepancy (rate issues, concerns, etc.)"
                  style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {/* Admin Correction */}
              <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Admin Correction (if you can fix it)</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ color: '#6b7280' }}>Corrected hours:</span>
                  <input 
                    type="number" 
                    value={correctedValue}
                    onChange={e => setCorrectedValue(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', width: '100px' }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowReviewModal(false)} style={{ padding: '12px 24px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: 'white', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={adminFix} style={{ padding: '12px 24px', border: 'none', borderRadius: '6px', backgroundColor: '#059669', color: 'white', cursor: 'pointer', fontWeight: '500' }}>
                  ✓ Fix & Save Correction
                </button>
                <button onClick={flagForContractor} style={{ padding: '12px 24px', border: 'none', borderRadius: '6px', backgroundColor: '#dc2626', color: 'white', cursor: 'pointer', fontWeight: '500' }}>
                  🚨 Flag for Contractor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
