import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline - Demo Project"
const MAX_DAILY_HOURS = 16

export default function ReconciliationDashboard() {
  const navigate = useNavigate()
  const [contractorData, setContractorData] = useState([])
  const [inspectorData, setInspectorData] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30')
  const [viewMode, setViewMode] = useState('sidebyside') // 'sidebyside', 'detailed', 'crew', 'daily', 'alerts'
  const [selectedLemId, setSelectedLemId] = useState(null)
  const [validationAlerts, setValidationAlerts] = useState([])

  useEffect(() => {
    loadData()
  }, [dateRange])

  async function loadData() {
    setLoading(true)
    
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    const { data: lems, error: lemsError } = await supabase
      .from('contractor_lems')
      .select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false })

    if (lemsError) console.error('Error loading contractor LEMs:', lemsError)

    const { data: reports, error: reportsError } = await supabase
      .from('daily_tickets')
      .select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false })

    if (reportsError) console.error('Error loading inspector reports:', reportsError)

    setContractorData(lems || [])
    setInspectorData(reports || [])

    // Auto-select first LEM if none selected
    if (lems && lems.length > 0 && !selectedLemId) {
      setSelectedLemId(lems[0].field_log_id)
    }

    // Build validation alerts
    const alerts = buildValidationAlerts(lems || [], reports || [])
    setValidationAlerts(alerts)

    setLoading(false)
  }

  function buildValidationAlerts(lems, reports) {
    const alerts = []
    const workersByDate = {}
    const equipmentByDate = {}

    lems.forEach(lem => {
      const date = lem.date
      const labourEntries = lem.labour_entries || []
      const equipmentEntries = lem.equipment_entries || []

      if (!workersByDate[date]) workersByDate[date] = {}
      labourEntries.forEach(entry => {
        const name = entry.name || 'Unknown'
        const hours = (parseFloat(entry.rt_hours) || 0) + (parseFloat(entry.ot_hours) || 0)
        if (!workersByDate[date][name]) workersByDate[date][name] = []
        workersByDate[date][name].push({ lem: lem.field_log_id, hours })
      })

      if (!equipmentByDate[date]) equipmentByDate[date] = {}
      equipmentEntries.forEach(entry => {
        const id = entry.equipment_id || entry.type || 'Unknown'
        const hours = parseFloat(entry.hours) || 0
        if (!equipmentByDate[date][id]) equipmentByDate[date][id] = []
        equipmentByDate[date][id].push({ lem: lem.field_log_id, hours })
      })
    })

    // Check for duplicates
    Object.entries(workersByDate).forEach(([date, workers]) => {
      Object.entries(workers).forEach(([name, assignments]) => {
        const totalHours = assignments.reduce((sum, a) => sum + a.hours, 0)
        if (totalHours > MAX_DAILY_HOURS) {
          alerts.push({
            type: 'worker_excessive',
            severity: 'high',
            date,
            subject: name,
            message: `${name} charged ${totalHours} hours on ${date}`
          })
        }
      })
    })

    return alerts
  }

  // Get selected LEM data
  const selectedLem = contractorData.find(l => l.field_log_id === selectedLemId)
  
  // Find matching inspector report
  const matchingReport = selectedLem ? inspectorData.find(r => {
    if (r.date !== selectedLem.date) return false
    const blocks = r.activity_blocks || []
    return blocks.some(b => 
      b.foreman?.toLowerCase().includes(selectedLem.foreman?.toLowerCase()?.split(' ')[0] || '') ||
      selectedLem.foreman?.toLowerCase().includes(b.foreman?.toLowerCase()?.split(' ')[0] || '')
    )
  }) : null

  // Extract timesheet data (OCR'd) and inspector observations
  let timesheetLabour = []
  let timesheetEquipment = []
  let inspectorLabour = []
  let inspectorEquipment = []
  let ticketPhotos = []

  if (matchingReport) {
    const blocks = matchingReport.activity_blocks || []
    blocks.forEach(block => {
      if (block.labourEntries) {
        timesheetLabour = [...timesheetLabour, ...block.labourEntries]
        inspectorLabour = [...inspectorLabour, ...block.labourEntries]
      }
      if (block.equipmentEntries) {
        timesheetEquipment = [...timesheetEquipment, ...block.equipmentEntries]
        inspectorEquipment = [...inspectorEquipment, ...block.equipmentEntries]
      }
      if (block.workPhotos) {
        block.workPhotos.forEach(p => {
          const filename = typeof p === 'string' ? p : p.filename
          if (filename?.toLowerCase().includes('ticket')) {
            ticketPhotos.push(filename)
          }
        })
      }
    })
  }

  // LEM labour and equipment
  const lemLabour = selectedLem?.labour_entries || []
  const lemEquipment = selectedLem?.equipment_entries || []

  // Build comparison data
  function buildLabourComparison() {
    const comparison = []
    const processedTimesheet = new Set()
    const processedInspector = new Set()

    // Start with LEM workers
    lemLabour.forEach(lemWorker => {
      const name = (lemWorker.name || '').toUpperCase().trim()
      const lemHours = (parseFloat(lemWorker.rt_hours) || 0) + (parseFloat(lemWorker.ot_hours) || 0)

      // Find in timesheet
      const tsMatch = timesheetLabour.find(t => {
        const tsName = (t.employeeName || t.name || '').toUpperCase().trim()
        return tsName === name || tsName.includes(name.split(' ')[0]) || name.includes(tsName.split(' ')[0])
      })
      const tsHours = tsMatch ? (parseFloat(tsMatch.hours) || (parseFloat(tsMatch.rt) || 0) + (parseFloat(tsMatch.ot) || 0)) : 0
      if (tsMatch) processedTimesheet.add(tsMatch.employeeName || tsMatch.name)

      // Find in inspector
      const insMatch = inspectorLabour.find(i => {
        const insName = (i.employeeName || i.name || '').toUpperCase().trim()
        return insName === name || insName.includes(name.split(' ')[0]) || name.includes(insName.split(' ')[0])
      })
      const insHours = insMatch ? (parseFloat(insMatch.hours) || (parseFloat(insMatch.rt) || 0) + (parseFloat(insMatch.ot) || 0)) : 0
      if (insMatch) processedInspector.add(insMatch.employeeName || insMatch.name)

      comparison.push({
        name,
        classification: lemWorker.type,
        lemHours,
        timesheetHours: tsHours,
        inspectorHours: insHours,
        lemRate: lemWorker.rt_rate || lemWorker.rate,
        variance: lemHours - Math.max(tsHours, insHours),
        status: !tsMatch && !insMatch ? 'not_found' : 
                lemHours > tsHours ? 'lem_over' : 
                lemHours > insHours ? 'inspector_diff' : 'match'
      })
    })

    // Add timesheet workers not in LEM
    timesheetLabour.forEach(tsWorker => {
      const name = (tsWorker.employeeName || tsWorker.name || '').toUpperCase().trim()
      if (!processedTimesheet.has(tsWorker.employeeName || tsWorker.name)) {
        const hours = parseFloat(tsWorker.hours) || (parseFloat(tsWorker.rt) || 0) + (parseFloat(tsWorker.ot) || 0)
        comparison.push({
          name,
          classification: tsWorker.classification,
          lemHours: 0,
          timesheetHours: hours,
          inspectorHours: hours,
          variance: -hours,
          status: 'not_billed'
        })
      }
    })

    return comparison.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
  }

  function buildEquipmentComparison() {
    const comparison = []
    const processedTimesheet = new Set()

    lemEquipment.forEach(lemEquip => {
      const type = (lemEquip.type || lemEquip.equipment_id || '').toUpperCase().trim()
      const lemHours = parseFloat(lemEquip.hours) || 0

      const tsMatch = timesheetEquipment.find(t => {
        const tsType = (t.type || '').toUpperCase().trim()
        return tsType === type || tsType.includes(type.split(' ')[0]) || type.includes(tsType.split(' ')[0])
      })
      const tsHours = tsMatch ? parseFloat(tsMatch.hours) || 0 : 0
      if (tsMatch) processedTimesheet.add(tsMatch.type)

      comparison.push({
        type,
        equipmentId: lemEquip.equipment_id,
        lemHours,
        timesheetHours: tsHours,
        inspectorHours: tsHours,
        rate: lemEquip.rate,
        variance: lemHours - tsHours,
        status: !tsMatch ? 'not_found' : lemHours > tsHours ? 'over' : 'match'
      })
    })

    timesheetEquipment.forEach(tsEquip => {
      if (!processedTimesheet.has(tsEquip.type)) {
        const hours = parseFloat(tsEquip.hours) || 0
        comparison.push({
          type: (tsEquip.type || '').toUpperCase(),
          lemHours: 0,
          timesheetHours: hours,
          inspectorHours: hours,
          variance: -hours,
          status: 'not_billed'
        })
      }
    })

    return comparison.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
  }

  const labourComparison = buildLabourComparison()
  const equipmentComparison = buildEquipmentComparison()

  // Calculate totals
  const lemLabourTotal = lemLabour.reduce((sum, l) => sum + ((parseFloat(l.rt_hours) || 0) + (parseFloat(l.ot_hours) || 0)), 0)
  const lemEquipTotal = lemEquipment.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0)
  const tsLabourTotal = timesheetLabour.reduce((sum, l) => sum + (parseFloat(l.hours) || (parseFloat(l.rt) || 0) + (parseFloat(l.ot) || 0)), 0)
  const tsEquipTotal = timesheetEquipment.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0)

  const labourVariance = labourComparison.filter(l => l.variance > 0).reduce((sum, l) => sum + l.variance, 0)
  const equipVariance = equipmentComparison.filter(e => e.variance > 0).reduce((sum, e) => sum + e.variance, 0)

  const totalContractorCost = contractorData.reduce((sum, l) => sum + (parseFloat(l.total_labour_cost) || 0) + (parseFloat(l.total_equipment_cost) || 0), 0)
  const lemsWithIssues = contractorData.filter(lem => {
    const report = inspectorData.find(r => r.date === lem.date)
    return !report
  }).length

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-blue-900 text-white py-4 px-6">
        <div className="max-w-full mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">{PROJECT_NAME}</h1>
            <p className="text-blue-200 text-sm">3-Way Reconciliation: LEM vs Timesheet vs Inspector</p>
          </div>
          <button onClick={() => navigate(-1)} className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg transition">
            ← Back
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white shadow px-6 py-3 flex items-center gap-4 border-b">
        <div>
          <label className="text-xs font-medium text-gray-500">Date Range</label>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="ml-2 border rounded px-3 py-1 text-sm">
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="60">Last 60 Days</option>
            <option value="365">Last Year</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">View</label>
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value)} className="ml-2 border rounded px-3 py-1 text-sm">
            <option value="sidebyside">Side-by-Side</option>
            <option value="detailed">Detailed List</option>
            <option value="daily">Daily Summary</option>
          </select>
        </div>
        <div className="flex-1"></div>
        <div className="text-sm text-gray-600">
          <span className="font-bold text-gray-800">{contractorData.length}</span> LEMs | 
          <span className="font-bold text-gray-800 ml-2">${totalContractorCost.toLocaleString()}</span> Total
        </div>
        <button onClick={loadData} className="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded text-sm">🔄 Refresh</button>
      </div>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-140px)]">
        {/* Left Sidebar - LEM List */}
        <div className="w-64 bg-white border-r overflow-y-auto">
          <div className="p-3 bg-gray-50 border-b font-semibold text-sm text-gray-700">
            Select Field Log ({contractorData.length})
          </div>
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : contractorData.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">No LEMs found</div>
          ) : (
            contractorData.map(lem => {
              const hasMatch = inspectorData.some(r => r.date === lem.date)
              return (
                <div
                  key={lem.field_log_id}
                  onClick={() => setSelectedLemId(lem.field_log_id)}
                  className={`p-3 border-b cursor-pointer hover:bg-blue-50 ${selectedLemId === lem.field_log_id ? 'bg-blue-100 border-l-4 border-l-blue-600' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="font-medium text-sm">{lem.field_log_id}</div>
                    {!hasMatch && <span className="text-xs bg-yellow-200 text-yellow-800 px-1 rounded">⚠️</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{lem.date}</div>
                  <div className="text-xs text-gray-600 truncate">{lem.foreman}</div>
                  <div className="text-xs text-green-600 mt-1">
                    ${((parseFloat(lem.total_labour_cost) || 0) + (parseFloat(lem.total_equipment_cost) || 0)).toLocaleString()}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Main Panel - 3-Way Comparison */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedLem ? (
            <div className="text-center py-20 text-gray-500">
              <p className="text-xl">Select a Field Log from the left</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-xs text-gray-500 uppercase">Field Log</p>
                  <p className="text-lg font-bold">{selectedLem.field_log_id}</p>
                  <p className="text-sm text-gray-600">{selectedLem.date}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-xs text-gray-500 uppercase">Foreman</p>
                  <p className="text-lg font-bold">{selectedLem.foreman}</p>
                  <p className="text-sm text-gray-600">{selectedLem.account_number}</p>
                </div>
                <div className={`rounded-lg shadow p-4 ${labourVariance + equipVariance > 0 ? 'bg-red-50 border-2 border-red-400' : 'bg-green-50 border-2 border-green-400'}`}>
                  <p className="text-xs text-gray-500 uppercase">Variance</p>
                  <p className={`text-lg font-bold ${labourVariance + equipVariance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {labourVariance + equipVariance > 0 ? '+' : ''}{(labourVariance + equipVariance).toFixed(1)} hrs
                  </p>
                  <p className="text-xs text-gray-500">
                    Labour: {labourVariance > 0 ? '+' : ''}{labourVariance.toFixed(1)} | Equip: {equipVariance > 0 ? '+' : ''}{equipVariance.toFixed(1)}
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-xs text-gray-500 uppercase">Inspector Match</p>
                  {matchingReport ? (
                    <>
                      <p className="text-lg font-bold text-green-600">✓ Found</p>
                      <p className="text-sm text-gray-600">{matchingReport.inspector_name}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-bold text-red-600">✗ Not Found</p>
                      <p className="text-sm text-gray-500">No matching report</p>
                    </>
                  )}
                </div>
              </div>

              {/* Ticket Photo Link */}
              {ticketPhotos.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
                  <span className="text-2xl">📸</span>
                  <div>
                    <p className="font-medium text-blue-800">Daily Timesheet Photo Available</p>
                    <div className="flex gap-2 mt-1">
                      {ticketPhotos.map((photo, i) => (
                        <a 
                          key={i}
                          href={`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${photo}`}
                          target="_blank"
                          className="text-blue-600 underline text-sm"
                        >
                          View Photo {i + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 3-Panel Comparison */}
              <div className="grid grid-cols-3 gap-4">
                {/* Panel 1: LEM (Billing) */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="bg-red-600 text-white px-4 py-2 font-semibold">
                    💰 Contractor LEM (Billing)
                  </div>
                  <div className="p-3">
                    <div className="text-xs text-gray-500 mb-2">
                      {lemLabour.length} Workers | {lemEquipment.length} Equipment
                    </div>
                    <div className="bg-gray-50 rounded p-2 mb-2">
                      <span className="text-xs text-gray-500">Labour Total:</span>
                      <span className="float-right font-bold">{lemLabourTotal.toFixed(1)} hrs</span>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <span className="text-xs text-gray-500">Equipment Total:</span>
                      <span className="float-right font-bold">{lemEquipTotal.toFixed(1)} hrs</span>
                    </div>
                  </div>
                </div>

                {/* Panel 2: Timesheet (Foreman Signed) */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="bg-yellow-500 text-white px-4 py-2 font-semibold">
                    📝 Daily Timesheet (OCR)
                  </div>
                  <div className="p-3">
                    <div className="text-xs text-gray-500 mb-2">
                      {timesheetLabour.length} Workers | {timesheetEquipment.length} Equipment
                    </div>
                    <div className="bg-gray-50 rounded p-2 mb-2">
                      <span className="text-xs text-gray-500">Labour Total:</span>
                      <span className="float-right font-bold">{tsLabourTotal.toFixed(1)} hrs</span>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <span className="text-xs text-gray-500">Equipment Total:</span>
                      <span className="float-right font-bold">{tsEquipTotal.toFixed(1)} hrs</span>
                    </div>
                  </div>
                </div>

                {/* Panel 3: Inspector Report */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="bg-green-600 text-white px-4 py-2 font-semibold">
                    👷 Inspector Report (Observed)
                  </div>
                  <div className="p-3">
                    {matchingReport ? (
                      <>
                        <div className="text-xs text-gray-500 mb-2">
                          Inspector: {matchingReport.inspector_name}
                        </div>
                        <div className="bg-gray-50 rounded p-2 mb-2">
                          <span className="text-xs text-gray-500">Labour Total:</span>
                          <span className="float-right font-bold">{tsLabourTotal.toFixed(1)} hrs</span>
                        </div>
                        <div className="bg-gray-50 rounded p-2">
                          <span className="text-xs text-gray-500">Equipment Total:</span>
                          <span className="float-right font-bold">{tsEquipTotal.toFixed(1)} hrs</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-4 text-gray-400">
                        No matching report found
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Labour Detail Comparison */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-gray-800 text-white px-4 py-2 font-semibold flex justify-between">
                  <span>👷 Labour Comparison</span>
                  <span className="text-sm font-normal">
                    {labourComparison.filter(l => l.status !== 'match' && l.status !== 'not_billed').length} issues found
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">Employee</th>
                      <th className="p-2 text-left">Classification</th>
                      <th className="p-2 text-center bg-red-50">LEM Hrs</th>
                      <th className="p-2 text-center bg-yellow-50">Timesheet</th>
                      <th className="p-2 text-center bg-green-50">Inspector</th>
                      <th className="p-2 text-center">Variance</th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labourComparison.length === 0 ? (
                      <tr><td colSpan="7" className="p-4 text-center text-gray-400">No labour entries</td></tr>
                    ) : (
                      labourComparison.map((row, i) => (
                        <tr key={i} className={`border-t ${
                          row.status === 'not_found' ? 'bg-red-50' :
                          row.status === 'lem_over' ? 'bg-yellow-50' :
                          row.status === 'not_billed' ? 'bg-blue-50' : ''
                        }`}>
                          <td className="p-2 font-medium">{row.name}</td>
                          <td className="p-2 text-gray-600 text-xs">{row.classification}</td>
                          <td className="p-2 text-center bg-red-50 font-mono">{row.lemHours.toFixed(1)}</td>
                          <td className="p-2 text-center bg-yellow-50 font-mono">{row.timesheetHours.toFixed(1)}</td>
                          <td className="p-2 text-center bg-green-50 font-mono">{row.inspectorHours.toFixed(1)}</td>
                          <td className={`p-2 text-center font-bold ${row.variance > 0 ? 'text-red-600' : row.variance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                            {row.variance > 0 ? '+' : ''}{row.variance.toFixed(1)}
                          </td>
                          <td className="p-2 text-center">
                            {row.status === 'match' && <span className="text-green-600 text-xs">✓ Match</span>}
                            {row.status === 'lem_over' && <span className="text-yellow-600 text-xs">⚠️ LEM Over</span>}
                            {row.status === 'not_found' && <span className="text-red-600 text-xs">🚨 Not on Sheet</span>}
                            {row.status === 'not_billed' && <span className="text-blue-600 text-xs">ℹ️ Not Billed</span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Equipment Detail Comparison */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-gray-800 text-white px-4 py-2 font-semibold flex justify-between">
                  <span>🚜 Equipment Comparison</span>
                  <span className="text-sm font-normal">
                    {equipmentComparison.filter(e => e.status !== 'match' && e.status !== 'not_billed').length} issues found
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">Equipment ID</th>
                      <th className="p-2 text-left">Type</th>
                      <th className="p-2 text-center bg-red-50">LEM Hrs</th>
                      <th className="p-2 text-center bg-yellow-50">Timesheet</th>
                      <th className="p-2 text-center bg-green-50">Inspector</th>
                      <th className="p-2 text-center">Variance</th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentComparison.length === 0 ? (
                      <tr><td colSpan="7" className="p-4 text-center text-gray-400">No equipment entries</td></tr>
                    ) : (
                      equipmentComparison.map((row, i) => (
                        <tr key={i} className={`border-t ${
                          row.status === 'not_found' ? 'bg-red-50' :
                          row.status === 'over' ? 'bg-yellow-50' :
                          row.status === 'not_billed' ? 'bg-blue-50' : ''
                        }`}>
                          <td className="p-2 font-mono text-xs">{row.equipmentId || '-'}</td>
                          <td className="p-2 font-medium">{row.type}</td>
                          <td className="p-2 text-center bg-red-50 font-mono">{row.lemHours.toFixed(1)}</td>
                          <td className="p-2 text-center bg-yellow-50 font-mono">{row.timesheetHours.toFixed(1)}</td>
                          <td className="p-2 text-center bg-green-50 font-mono">{row.inspectorHours.toFixed(1)}</td>
                          <td className={`p-2 text-center font-bold ${row.variance > 0 ? 'text-red-600' : row.variance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                            {row.variance > 0 ? '+' : ''}{row.variance.toFixed(1)}
                          </td>
                          <td className="p-2 text-center">
                            {row.status === 'match' && <span className="text-green-600 text-xs">✓ Match</span>}
                            {row.status === 'over' && <span className="text-yellow-600 text-xs">⚠️ LEM Over</span>}
                            {row.status === 'not_found' && <span className="text-red-600 text-xs">🚨 Not Observed</span>}
                            {row.status === 'not_billed' && <span className="text-blue-600 text-xs">ℹ️ Not Billed</span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-bold mb-3">Reconciliation Summary</h3>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-800">
                      ${((parseFloat(selectedLem.total_labour_cost) || 0) + (parseFloat(selectedLem.total_equipment_cost) || 0)).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">LEM Total</p>
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${labourVariance + equipVariance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {labourVariance + equipVariance > 0 ? '+' : ''}{(labourVariance + equipVariance).toFixed(1)} hrs
                    </p>
                    <p className="text-xs text-gray-500">Hour Variance</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">
                      {labourComparison.filter(l => l.status === 'match').length + equipmentComparison.filter(e => e.status === 'match').length}
                    </p>
                    <p className="text-xs text-gray-500">Items Match</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">
                      {labourComparison.filter(l => l.status === 'not_found').length + equipmentComparison.filter(e => e.status === 'not_found').length}
                    </p>
                    <p className="text-xs text-gray-500">Not on Timesheet</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
