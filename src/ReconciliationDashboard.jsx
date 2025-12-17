import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline - Demo Project"

export default function ReconciliationDashboard() {
  const navigate = useNavigate()
  const [contractorData, setContractorData] = useState([])
  const [inspectorData, setInspectorData] = useState([])
  const [disputes, setDisputes] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30')
  const [selectedLemId, setSelectedLemId] = useState(null)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [disputeNotes, setDisputeNotes] = useState('')
  const [viewMode, setViewMode] = useState('reconciliation') // 'reconciliation' or 'disputes'
  const [disputeFilter, setDisputeFilter] = useState('all')

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

    setContractorData(lems || [])
    setInspectorData(reports || [])
    setDisputes(disputeData || [])
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

  // Check if item is already disputed
  function isDisputed(lemId, itemName, type) {
    return disputes.some(d => d.lem_id === lemId && d.item_name === itemName && d.dispute_type === type)
  }

  function getDisputeStatus(lemId, itemName, type) {
    const dispute = disputes.find(d => d.lem_id === lemId && d.item_name === itemName && d.dispute_type === type)
    return dispute?.status || null
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
      comp.push({ 
        name, 
        classification: lw.type, 
        lemHours: lemHrs, 
        timesheetHours: tsHrs, 
        variance,
        varianceCost: variance > 0 ? variance * rate : 0,
        rate,
        status: !tsMatch ? 'not_found' : lemHrs > tsHrs ? 'over' : 'match',
        disputeStatus: getDisputeStatus(selectedLem?.field_log_id, name, 'labour')
      })
    })
    timesheetLabour.forEach(ts => {
      if (!matched.has(ts.employeeName || ts.name)) {
        const hrs = parseFloat(ts.hours) || (parseFloat(ts.rt)||0) + (parseFloat(ts.ot)||0)
        const name = (ts.employeeName || ts.name || '').toUpperCase()
        comp.push({ 
          name, 
          classification: ts.classification, 
          lemHours: 0, 
          timesheetHours: hrs, 
          variance: -hrs,
          varianceCost: 0,
          status: 'not_billed',
          disputeStatus: getDisputeStatus(selectedLem?.field_log_id, name, 'labour')
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
      comp.push({ 
        type, 
        equipmentId: le.equipment_id, 
        lemHours: lemHrs, 
        timesheetHours: tsHrs, 
        variance,
        varianceCost: variance > 0 ? variance * rate : 0,
        rate,
        status: !tsMatch ? 'not_found' : lemHrs > tsHrs ? 'over' : 'match',
        disputeStatus: getDisputeStatus(selectedLem?.field_log_id, type, 'equipment')
      })
    })
    timesheetEquipment.forEach(ts => {
      if (!matched.has(ts.type)) {
        const type = (ts.type||'').toUpperCase()
        comp.push({ 
          type, 
          lemHours: 0, 
          timesheetHours: parseFloat(ts.hours)||0, 
          variance: -(parseFloat(ts.hours)||0),
          varianceCost: 0,
          status: 'not_billed',
          disputeStatus: getDisputeStatus(selectedLem?.field_log_id, type, 'equipment')
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

  // Open dispute modal
  function openDisputeModal(item, type) {
    setSelectedItem({ ...item, type, lemId: selectedLem.field_log_id, lemDate: selectedLem.date, foreman: selectedLem.foreman, contractor: selectedLem.contractor })
    setDisputeNotes('')
    setShowDisputeModal(true)
  }

  // Submit dispute
  async function submitDispute() {
    if (!selectedItem) return

    const disputeData = {
      lem_id: selectedItem.lemId,
      lem_date: selectedItem.lemDate,
      foreman: selectedItem.foreman,
      contractor: selectedItem.contractor,
      dispute_type: selectedItem.type,
      item_name: selectedItem.type === 'labour' ? selectedItem.name : selectedItem.type,
      lem_hours: selectedItem.lemHours,
      timesheet_hours: selectedItem.timesheetHours,
      variance_hours: selectedItem.variance,
      variance_cost: selectedItem.varianceCost || 0,
      status: 'open',
      notes: disputeNotes,
      evidence_photo: ticketPhotos[0] || null,
      inspector_report_id: matchingReport?.id || null
    }

    const { error } = await supabase.from('disputes').insert([disputeData])
    
    if (error) {
      alert('Error creating dispute: ' + error.message)
    } else {
      setShowDisputeModal(false)
      loadData()
    }
  }

  // Update dispute status
  async function updateDisputeStatus(disputeId, newStatus, resolutionNotes = '', creditAmount = 0) {
    const updateData = { 
      status: newStatus, 
      updated_at: new Date().toISOString()
    }
    
    if (newStatus === 'resolved') {
      updateData.resolved_at = new Date().toISOString()
      updateData.resolution_notes = resolutionNotes
      updateData.credit_amount = creditAmount
    }

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
        if (d.evidence_photo) report += `  Evidence: Timesheet photo on file\n`
      })
      report += `\n═══════════════════════════════════════════════════\n\n`
    })

    const totalVariance = openDisputes.reduce((s, d) => s + (d.variance_cost || 0), 0)
    report += `SUMMARY\n`
    report += `Total Disputed Items: ${openDisputes.length}\n`
    report += `Total Variance Amount: $${totalVariance.toFixed(2)}\n`

    // Download as text file
    const blob = new Blob([report], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Dispute_Report_${new Date().toISOString().split('T')[0]}.txt`
    a.click()
  }

  // Filter disputes
  const filteredDisputes = disputes.filter(d => disputeFilter === 'all' || d.status === disputeFilter)

  const statusColors = {
    open: { bg: '#fef3c7', text: '#92400e', label: 'Open' },
    disputed: { bg: '#fee2e2', text: '#991b1b', label: 'Disputed' },
    under_review: { bg: '#dbeafe', text: '#1e40af', label: 'Under Review' },
    resolved: { bg: '#d1fae5', text: '#065f46', label: 'Resolved' },
    rejected: { bg: '#f3f4f6', text: '#374151', label: 'Rejected' }
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

      {/* DISPUTES VIEW */}
      {viewMode === 'disputes' && (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
          {/* Dispute Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '20px' }}>
            {['all', 'open', 'disputed', 'under_review', 'resolved'].map(status => {
              const count = status === 'all' ? disputes.length : disputes.filter(d => d.status === status).length
              const isActive = disputeFilter === status
              return (
                <div key={status} onClick={() => setDisputeFilter(status)} style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px', cursor: 'pointer', border: isActive ? '2px solid #2563eb' : '2px solid transparent' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{status === 'all' ? 'All Disputes' : status.replace('_', ' ')}</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: status === 'open' ? '#f59e0b' : status === 'disputed' ? '#dc2626' : '#1f2937' }}>{count}</div>
                </div>
              )
            })}
          </div>

          {/* Export Button */}
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={exportDisputeReport} style={{ backgroundColor: '#059669', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>
              📄 Export Dispute Report
            </button>
          </div>

          {/* Disputes Table */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#1f2937' }}>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Field Log</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Date</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Type</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Item</th>
                  <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>LEM Hrs</th>
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
                      <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.notes || '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ backgroundColor: statusColors[d.status]?.bg, color: statusColors[d.status]?.text, padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '500' }}>
                          {statusColors[d.status]?.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <select 
                          value={d.status} 
                          onChange={e => updateDisputeStatus(d.id, e.target.value)}
                          style={{ border: '1px solid #d1d5db', borderRadius: '4px', padding: '4px 8px', fontSize: '12px' }}
                        >
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

          {/* Dispute Summary */}
          {filteredDisputes.length > 0 && (
            <div style={{ marginTop: '20px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontWeight: '600' }}>Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{filteredDisputes.length}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Disputes</div>
                </div>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc2626' }}>
                    {filteredDisputes.reduce((s, d) => s + (parseFloat(d.variance_hours) || 0), 0).toFixed(1)} hrs
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Variance</div>
                </div>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc2626' }}>
                    ${filteredDisputes.reduce((s, d) => s + (parseFloat(d.variance_cost) || 0), 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Estimated Value</div>
                </div>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#059669' }}>
                    ${disputes.filter(d => d.status === 'resolved').reduce((s, d) => s + (parseFloat(d.credit_amount) || 0), 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Credits Received</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RECONCILIATION VIEW */}
      {viewMode === 'reconciliation' && (
        <div style={{ display: 'flex', height: 'calc(100vh - 120px)' }}>
          {/* Sidebar */}
          <div style={{ width: '280px', backgroundColor: 'white', borderRight: '1px solid #e5e7eb', overflowY: 'auto' }}>
            <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>Select Field Log ({contractorData.length})</div>
            {loading ? <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Loading...</div> :
             contractorData.length === 0 ? <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No LEMs found</div> :
             contractorData.map(lem => {
               const lemDisputes = disputes.filter(d => d.lem_id === lem.field_log_id && d.status !== 'resolved')
               return (
                <div key={lem.field_log_id} onClick={() => setSelectedLemId(lem.field_log_id)}
                  style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', backgroundColor: selectedLemId === lem.field_log_id ? '#dbeafe' : 'white', borderLeft: selectedLemId === lem.field_log_id ? '4px solid #2563eb' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>{lem.field_log_id}</span>
                    {lemDisputes.length > 0 && <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>⚠️ {lemDisputes.length}</span>}
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
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Field Log</div>
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

                {/* Ticket Photo */}
                {ticketPhotos.length > 0 && (
                  <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <span style={{ fontSize: '24px' }}>📸</span>
                    <div>
                      <strong style={{ color: '#1e40af' }}>Daily Timesheet Photo Available</strong>
                      <div>{ticketPhotos.map((p,i) => <a key={i} href={`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${p}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', marginRight: '12px' }}>View Photo {i+1}</a>)}</div>
                    </div>
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
                        <tr key={i} style={{ backgroundColor: r.status === 'not_found' ? '#fef2f2' : r.status === 'over' ? '#fefce8' : r.status === 'not_billed' ? '#eff6ff' : 'white' }}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>{r.name}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '12px' }}>{r.classification}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fef2f2' }}>{r.lemHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fefce8' }}>{r.timesheetHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#f0fdf4' }}>{r.timesheetHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 'bold', color: r.variance > 0 ? '#dc2626' : r.variance < 0 ? '#2563eb' : '#16a34a' }}>{r.variance > 0 ? '+' : ''}{r.variance.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontSize: '12px' }}>
                            {r.disputeStatus ? (
                              <span style={{ backgroundColor: statusColors[r.disputeStatus]?.bg, color: statusColors[r.disputeStatus]?.text, padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>{statusColors[r.disputeStatus]?.label}</span>
                            ) : (
                              <>
                                {r.status === 'match' && <span style={{ color: '#16a34a' }}>✓ Match</span>}
                                {r.status === 'over' && <span style={{ color: '#f59e0b' }}>⚠️ Over</span>}
                                {r.status === 'not_found' && <span style={{ color: '#dc2626' }}>🚨 Not on Sheet</span>}
                                {r.status === 'not_billed' && <span style={{ color: '#2563eb' }}>ℹ️ Not Billed</span>}
                              </>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                            {(r.status === 'over' || r.status === 'not_found') && !r.disputeStatus && (
                              <button onClick={() => openDisputeModal(r, 'labour')} style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                Flag Dispute
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
                        <tr key={i} style={{ backgroundColor: r.status === 'not_found' ? '#fef2f2' : r.status === 'over' ? '#fefce8' : r.status === 'not_billed' ? '#eff6ff' : 'white' }}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontFamily: 'monospace', fontSize: '12px' }}>{r.equipmentId || '-'}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>{r.type}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fef2f2' }}>{r.lemHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fefce8' }}>{r.timesheetHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#f0fdf4' }}>{r.timesheetHours.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 'bold', color: r.variance > 0 ? '#dc2626' : r.variance < 0 ? '#2563eb' : '#16a34a' }}>{r.variance > 0 ? '+' : ''}{r.variance.toFixed(1)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontSize: '12px' }}>
                            {r.disputeStatus ? (
                              <span style={{ backgroundColor: statusColors[r.disputeStatus]?.bg, color: statusColors[r.disputeStatus]?.text, padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>{statusColors[r.disputeStatus]?.label}</span>
                            ) : (
                              <>
                                {r.status === 'match' && <span style={{ color: '#16a34a' }}>✓ Match</span>}
                                {r.status === 'over' && <span style={{ color: '#f59e0b' }}>⚠️ Over</span>}
                                {r.status === 'not_found' && <span style={{ color: '#dc2626' }}>🚨 Not Observed</span>}
                                {r.status === 'not_billed' && <span style={{ color: '#2563eb' }}>ℹ️ Not Billed</span>}
                              </>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                            {(r.status === 'over' || r.status === 'not_found') && !r.disputeStatus && (
                              <button onClick={() => openDisputeModal(r, 'equipment')} style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                Flag Dispute
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '20px' }}>
                  <h3 style={{ fontWeight: '600', marginBottom: '16px', marginTop: 0 }}>Reconciliation Summary</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', textAlign: 'center' }}>
                    <div><div style={{ fontSize: '28px', fontWeight: 'bold' }}>${((parseFloat(selectedLem.total_labour_cost)||0) + (parseFloat(selectedLem.total_equipment_cost)||0)).toLocaleString()}</div><div style={{ fontSize: '12px', color: '#6b7280' }}>LEM Total</div></div>
                    <div><div style={{ fontSize: '28px', fontWeight: 'bold', color: labourVar + equipVar > 0 ? '#dc2626' : '#16a34a' }}>{labourVar + equipVar > 0 ? '+' : ''}{(labourVar + equipVar).toFixed(1)} hrs</div><div style={{ fontSize: '12px', color: '#6b7280' }}>Hour Variance</div></div>
                    <div><div style={{ fontSize: '28px', fontWeight: 'bold', color: '#16a34a' }}>{labourComp.filter(l => l.status === 'match').length + equipComp.filter(e => e.status === 'match').length}</div><div style={{ fontSize: '12px', color: '#6b7280' }}>Items Match</div></div>
                    <div><div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc2626' }}>{labourComp.filter(l => l.status === 'not_found').length + equipComp.filter(e => e.status === 'not_found').length}</div><div style={{ fontSize: '12px', color: '#6b7280' }}>Not on Timesheet</div></div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {showDisputeModal && selectedItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '500px', maxWidth: '90%' }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '20px' }}>Flag Dispute</h2>
            
            <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                <div><strong>Field Log:</strong> {selectedItem.lemId}</div>
                <div><strong>Date:</strong> {selectedItem.lemDate}</div>
                <div><strong>Type:</strong> {selectedItem.type}</div>
                <div><strong>Item:</strong> {selectedItem.type === 'labour' ? selectedItem.name : selectedItem.type}</div>
                <div><strong>LEM Hours:</strong> {selectedItem.lemHours}</div>
                <div><strong>Timesheet Hours:</strong> {selectedItem.timesheetHours}</div>
                <div style={{ gridColumn: 'span 2' }}><strong style={{ color: '#dc2626' }}>Variance: +{selectedItem.variance} hours (${selectedItem.varianceCost?.toFixed(2) || '0.00'})</strong></div>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Notes / Reason for Dispute</label>
              <textarea 
                value={disputeNotes}
                onChange={e => setDisputeNotes(e.target.value)}
                placeholder="Describe the discrepancy and reason for dispute..."
                style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', minHeight: '100px', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            {ticketPhotos.length > 0 && (
              <div style={{ backgroundColor: '#eff6ff', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}>
                📸 Timesheet photo will be attached as evidence
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDisputeModal(false)} style={{ padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: 'white', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={submitDispute} style={{ padding: '10px 20px', border: 'none', borderRadius: '6px', backgroundColor: '#dc2626', color: 'white', cursor: 'pointer', fontWeight: '500' }}>
                Submit Dispute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
