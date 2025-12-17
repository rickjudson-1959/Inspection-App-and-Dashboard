import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline - Demo Project"

export default function ReconciliationDashboard() {
  const navigate = useNavigate()
  const [contractorData, setContractorData] = useState([])
  const [inspectorData, setInspectorData] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30')
  const [selectedLemId, setSelectedLemId] = useState(null)

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

    setContractorData(lems || [])
    setInspectorData(reports || [])
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

  function buildLabourComparison() {
    const comp = [], matched = new Set()
    lemLabour.forEach(lw => {
      const name = (lw.name || '').toUpperCase().trim()
      const lemHrs = (parseFloat(lw.rt_hours) || 0) + (parseFloat(lw.ot_hours) || 0)
      const tsMatch = timesheetLabour.find(t => {
        const tn = (t.employeeName || t.name || '').toUpperCase().trim()
        return tn === name || tn.includes(name.split(' ')[0]) || name.includes(tn.split(' ')[0])
      })
      const tsHrs = tsMatch ? (parseFloat(tsMatch.hours) || (parseFloat(tsMatch.rt)||0) + (parseFloat(tsMatch.ot)||0)) : 0
      if (tsMatch) matched.add(tsMatch.employeeName || tsMatch.name)
      comp.push({ name, classification: lw.type, lemHours: lemHrs, timesheetHours: tsHrs, variance: lemHrs - tsHrs, status: !tsMatch ? 'not_found' : lemHrs > tsHrs ? 'over' : 'match' })
    })
    timesheetLabour.forEach(ts => {
      if (!matched.has(ts.employeeName || ts.name)) {
        const hrs = parseFloat(ts.hours) || (parseFloat(ts.rt)||0) + (parseFloat(ts.ot)||0)
        comp.push({ name: (ts.employeeName || ts.name || '').toUpperCase(), classification: ts.classification, lemHours: 0, timesheetHours: hrs, variance: -hrs, status: 'not_billed' })
      }
    })
    return comp.sort((a,b) => Math.abs(b.variance) - Math.abs(a.variance))
  }

  function buildEquipmentComparison() {
    const comp = [], matched = new Set()
    lemEquipment.forEach(le => {
      const type = (le.type || le.equipment_id || '').toUpperCase().trim()
      const lemHrs = parseFloat(le.hours) || 0
      const tsMatch = timesheetEquipment.find(t => {
        const tt = (t.type || '').toUpperCase().trim()
        return tt === type || tt.includes(type.split(' ')[0]) || type.includes(tt.split(' ')[0])
      })
      const tsHrs = tsMatch ? parseFloat(tsMatch.hours) || 0 : 0
      if (tsMatch) matched.add(tsMatch.type)
      comp.push({ type, equipmentId: le.equipment_id, lemHours: lemHrs, timesheetHours: tsHrs, variance: lemHrs - tsHrs, status: !tsMatch ? 'not_found' : lemHrs > tsHrs ? 'over' : 'match' })
    })
    timesheetEquipment.forEach(ts => {
      if (!matched.has(ts.type)) comp.push({ type: (ts.type||'').toUpperCase(), lemHours: 0, timesheetHours: parseFloat(ts.hours)||0, variance: -(parseFloat(ts.hours)||0), status: 'not_billed' })
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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>{PROJECT_NAME}</h1>
          <p style={{ fontSize: '14px', color: '#93c5fd', margin: '4px 0 0 0' }}>3-Way Reconciliation: LEM vs Timesheet vs Inspector</p>
        </div>
        <button onClick={() => navigate(-1)} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>← Back</button>
      </div>

      <div style={{ backgroundColor: 'white', padding: '12px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '20px' }}>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>Date Range:</span>
        <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ border: '1px solid #d1d5db', borderRadius: '4px', padding: '6px 12px' }}>
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="60">Last 60 Days</option>
          <option value="365">Last Year</option>
        </select>
        <div style={{ flex: 1 }}></div>
        <span><strong>{contractorData.length}</strong> LEMs | <strong>${totalCost.toLocaleString()}</strong> Total</span>
        <button onClick={loadData} style={{ backgroundColor: '#6b7280', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>🔄 Refresh</button>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 120px)' }}>
        <div style={{ width: '280px', backgroundColor: 'white', borderRight: '1px solid #e5e7eb', overflowY: 'auto' }}>
          <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>Select Field Log ({contractorData.length})</div>
          {loading ? <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Loading...</div> :
           contractorData.length === 0 ? <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No LEMs found</div> :
           contractorData.map(lem => (
            <div key={lem.field_log_id} onClick={() => setSelectedLemId(lem.field_log_id)}
              style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', backgroundColor: selectedLemId === lem.field_log_id ? '#dbeafe' : 'white', borderLeft: selectedLemId === lem.field_log_id ? '4px solid #2563eb' : 'none' }}>
              <div style={{ fontWeight: '600', fontSize: '14px' }}>{lem.field_log_id}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{lem.date}</div>
              <div style={{ fontSize: '12px', color: '#4b5563' }}>{lem.foreman}</div>
              <div style={{ fontSize: '13px', color: '#059669', fontWeight: '500' }}>${((parseFloat(lem.total_labour_cost)||0) + (parseFloat(lem.total_equipment_cost)||0)).toLocaleString()}</div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {!selectedLem ? <div style={{ textAlign: 'center', paddingTop: '100px', color: '#9ca3af', fontSize: '18px' }}>Select a Field Log from the left panel</div> : (
            <>
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

              {ticketPhotos.length > 0 && (
                <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <span style={{ fontSize: '24px' }}>📸</span>
                  <div>
                    <strong style={{ color: '#1e40af' }}>Daily Timesheet Photo Available</strong>
                    <div>{ticketPhotos.map((p,i) => <a key={i} href={`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${p}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', marginRight: '12px' }}>View Photo {i+1}</a>)}</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#dc2626', color: 'white', padding: '10px 16px', fontWeight: '600' }}>💰 Contractor LEM (Billing)</div>
                  <div style={{ padding: '16px' }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>{lemLabour.length} Workers | {lemEquipment.length} Equipment</div>
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}><span>Labour Total:</span><strong>{lemLabourTotal.toFixed(1)} hrs</strong></div>
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}><span>Equipment Total:</span><strong>{lemEquipTotal.toFixed(1)} hrs</strong></div>
                  </div>
                </div>
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f59e0b', color: 'white', padding: '10px 16px', fontWeight: '600' }}>📝 Daily Timesheet (OCR)</div>
                  <div style={{ padding: '16px' }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>{timesheetLabour.length} Workers | {timesheetEquipment.length} Equipment</div>
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}><span>Labour Total:</span><strong>{tsLabourTotal.toFixed(1)} hrs</strong></div>
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}><span>Equipment Total:</span><strong>{tsEquipTotal.toFixed(1)} hrs</strong></div>
                  </div>
                </div>
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#16a34a', color: 'white', padding: '10px 16px', fontWeight: '600' }}>👷 Inspector Report (Observed)</div>
                  <div style={{ padding: '16px' }}>
                    {matchingReport ? (<>
                      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>Inspector: {matchingReport.inspector_name}</div>
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}><span>Labour Total:</span><strong>{tsLabourTotal.toFixed(1)} hrs</strong></div>
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: '4px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}><span>Equipment Total:</span><strong>{tsEquipTotal.toFixed(1)} hrs</strong></div>
                    </>) : <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>No matching report</div>}
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#1f2937', color: 'white', padding: '10px 16px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}><span>👷 Labour Comparison</span><span style={{ fontWeight: 'normal', fontSize: '13px' }}>{labourComp.filter(l => l.status !== 'match' && l.status !== 'not_billed').length} issues</span></div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead><tr>
                    <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'left' }}>Employee</th>
                    <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'left' }}>Classification</th>
                    <th style={{ backgroundColor: '#dc2626', color: 'white', padding: '10px 12px', textAlign: 'center' }}>LEM Hrs</th>
                    <th style={{ backgroundColor: '#f59e0b', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Timesheet</th>
                    <th style={{ backgroundColor: '#16a34a', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Inspector</th>
                    <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Variance</th>
                    <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Status</th>
                  </tr></thead>
                  <tbody>
                    {labourComp.length === 0 ? <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No labour entries</td></tr> :
                    labourComp.map((r,i) => (
                      <tr key={i} style={{ backgroundColor: r.status === 'not_found' ? '#fef2f2' : r.status === 'over' ? '#fefce8' : r.status === 'not_billed' ? '#eff6ff' : 'white' }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>{r.name}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '12px' }}>{r.classification}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fef2f2' }}>{r.lemHours.toFixed(1)}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fefce8' }}>{r.timesheetHours.toFixed(1)}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#f0fdf4' }}>{r.timesheetHours.toFixed(1)}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 'bold', color: r.variance > 0 ? '#dc2626' : r.variance < 0 ? '#2563eb' : '#16a34a' }}>{r.variance > 0 ? '+' : ''}{r.variance.toFixed(1)}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontSize: '12px' }}>
                          {r.status === 'match' && <span style={{ color: '#16a34a' }}>✓ Match</span>}
                          {r.status === 'over' && <span style={{ color: '#f59e0b' }}>⚠️ Over</span>}
                          {r.status === 'not_found' && <span style={{ color: '#dc2626' }}>🚨 Not on Sheet</span>}
                          {r.status === 'not_billed' && <span style={{ color: '#2563eb' }}>ℹ️ Not Billed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#1f2937', color: 'white', padding: '10px 16px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}><span>🚜 Equipment Comparison</span><span style={{ fontWeight: 'normal', fontSize: '13px' }}>{equipComp.filter(e => e.status !== 'match' && e.status !== 'not_billed').length} issues</span></div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead><tr>
                    <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'left' }}>Equipment ID</th>
                    <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'left' }}>Type</th>
                    <th style={{ backgroundColor: '#dc2626', color: 'white', padding: '10px 12px', textAlign: 'center' }}>LEM Hrs</th>
                    <th style={{ backgroundColor: '#f59e0b', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Timesheet</th>
                    <th style={{ backgroundColor: '#16a34a', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Inspector</th>
                    <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Variance</th>
                    <th style={{ backgroundColor: '#374151', color: 'white', padding: '10px 12px', textAlign: 'center' }}>Status</th>
                  </tr></thead>
                  <tbody>
                    {equipComp.length === 0 ? <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No equipment entries</td></tr> :
                    equipComp.map((r,i) => (
                      <tr key={i} style={{ backgroundColor: r.status === 'not_found' ? '#fef2f2' : r.status === 'over' ? '#fefce8' : r.status === 'not_billed' ? '#eff6ff' : 'white' }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontFamily: 'monospace', fontSize: '12px' }}>{r.equipmentId || '-'}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>{r.type}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fef2f2' }}>{r.lemHours.toFixed(1)}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#fefce8' }}>{r.timesheetHours.toFixed(1)}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', backgroundColor: '#f0fdf4' }}>{r.timesheetHours.toFixed(1)}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 'bold', color: r.variance > 0 ? '#dc2626' : r.variance < 0 ? '#2563eb' : '#16a34a' }}>{r.variance > 0 ? '+' : ''}{r.variance.toFixed(1)}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontSize: '12px' }}>
                          {r.status === 'match' && <span style={{ color: '#16a34a' }}>✓ Match</span>}
                          {r.status === 'over' && <span style={{ color: '#f59e0b' }}>⚠️ Over</span>}
                          {r.status === 'not_found' && <span style={{ color: '#dc2626' }}>🚨 Not Observed</span>}
                          {r.status === 'not_billed' && <span style={{ color: '#2563eb' }}>ℹ️ Not Billed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
    </div>
  )
}
