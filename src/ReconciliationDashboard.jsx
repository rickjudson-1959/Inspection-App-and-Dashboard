import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline - Demo Project"
const MAX_DAILY_HOURS = 16 // Flag if worker/equipment exceeds this

export default function ReconciliationDashboard() {
  const navigate = useNavigate()
  const [contractorData, setContractorData] = useState([])
  const [inspectorData, setInspectorData] = useState([])
  const [reconciliationRows, setReconciliationRows] = useState([])
  const [crewRows, setCrewRows] = useState([])
  const [validationAlerts, setValidationAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30')
  const [expandedRow, setExpandedRow] = useState(null)
  const [viewMode, setViewMode] = useState('crew') // 'daily', 'crew', or 'alerts'

  useEffect(() => {
    loadData()
  }, [dateRange])

  async function loadData() {
    setLoading(true)
    
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    // Fetch contractor LEMs
    const { data: lems, error: lemsError } = await supabase
      .from('contractor_lems')
      .select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: true })

    if (lemsError) {
      console.error('Error loading contractor LEMs:', lemsError)
    }

    // Fetch inspector reports
    const { data: reports, error: reportsError } = await supabase
      .from('daily_tickets')
      .select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: true })

    if (reportsError) {
      console.error('Error loading inspector reports:', reportsError)
    }

    setContractorData(lems || [])
    setInspectorData(reports || [])

    // Build reconciliation comparison
    const dailyRows = buildDailyReconciliation(lems || [], reports || [])
    setReconciliationRows(dailyRows)

    // Build crew view
    const { crewData, alerts } = buildCrewView(lems || [], reports || [])
    setCrewRows(crewData)
    setValidationAlerts(alerts)

    setLoading(false)
  }

  // Build crew-based view with validation
  function buildCrewView(lems, reports) {
    const alerts = []
    const crewMap = {} // crew -> { foremen, workers, equipment, totalCost, dates }

    // Track workers and equipment across all LEMs by date for duplicate detection
    const workersByDate = {} // date -> { workerName -> [{ lem, hours, crew }] }
    const equipmentByDate = {} // date -> { equipmentId -> [{ lem, hours, crew }] }
    const foremenByDate = {} // date -> { foremanName -> [crews] }

    lems.forEach(lem => {
      const date = lem.date
      const foreman = lem.foreman || 'Unknown'
      const labourEntries = lem.labour_entries || []
      const equipmentEntries = lem.equipment_entries || []
      
      // Determine crew from account number or foreman
      let crew = 'General'
      const accountNum = lem.account_number || ''
      if (accountNum.includes('2145') || foreman.includes('Whitworth')) crew = 'Mainline Welding'
      else if (accountNum.includes('2146') || foreman.includes('Untinen')) crew = 'Tie-In Welding'
      else if (accountNum.includes('2160') || foreman.includes('Nelson')) crew = 'Ditching'
      else if (accountNum.includes('2180') || foreman.includes('Cook')) crew = 'Lowering-In'
      else if (accountNum.includes('2190') || foreman.includes('Langlois')) crew = 'Backfill'

      // Initialize crew data
      if (!crewMap[crew]) {
        crewMap[crew] = {
          crew,
          foremen: new Set(),
          workers: new Set(),
          equipment: new Set(),
          totalLabourCost: 0,
          totalEquipmentCost: 0,
          totalLabourHours: 0,
          totalEquipmentHours: 0,
          lemCount: 0,
          dates: new Set(),
          lems: []
        }
      }

      crewMap[crew].foremen.add(foreman)
      crewMap[crew].totalLabourCost += parseFloat(lem.total_labour_cost) || 0
      crewMap[crew].totalEquipmentCost += parseFloat(lem.total_equipment_cost) || 0
      crewMap[crew].lemCount += 1
      crewMap[crew].dates.add(date)
      crewMap[crew].lems.push(lem)

      // Track foreman by date
      if (!foremenByDate[date]) foremenByDate[date] = {}
      if (!foremenByDate[date][foreman]) foremenByDate[date][foreman] = []
      foremenByDate[date][foreman].push(crew)

      // Track workers
      if (!workersByDate[date]) workersByDate[date] = {}
      labourEntries.forEach(entry => {
        const workerName = entry.name || entry.type || 'Unknown'
        const hours = (parseFloat(entry.rt_hours) || 0) + (parseFloat(entry.ot_hours) || 0)
        
        crewMap[crew].workers.add(workerName)
        crewMap[crew].totalLabourHours += hours

        if (!workersByDate[date][workerName]) workersByDate[date][workerName] = []
        workersByDate[date][workerName].push({ lem: lem.field_log_id, hours, crew, foreman })
      })

      // Track equipment
      if (!equipmentByDate[date]) equipmentByDate[date] = {}
      equipmentEntries.forEach(entry => {
        const equipId = entry.equipment_id || entry.type || 'Unknown'
        const hours = parseFloat(entry.hours) || 0
        
        crewMap[crew].equipment.add(equipId)
        crewMap[crew].totalEquipmentHours += hours

        if (!equipmentByDate[date][equipId]) equipmentByDate[date][equipId] = []
        equipmentByDate[date][equipId].push({ lem: lem.field_log_id, hours, crew, foreman })
      })
    })

    // Check for foreman on multiple crews same day
    Object.entries(foremenByDate).forEach(([date, foremen]) => {
      Object.entries(foremen).forEach(([foreman, crews]) => {
        if (crews.length > 1) {
          alerts.push({
            type: 'foreman_duplicate',
            severity: 'high',
            date,
            foreman,
            crews,
            message: `Foreman "${foreman}" charged to ${crews.length} crews on ${date}: ${crews.join(', ')}`
          })
        }
      })
    })

    // Check for workers on multiple LEMs with excessive hours
    Object.entries(workersByDate).forEach(([date, workers]) => {
      Object.entries(workers).forEach(([workerName, assignments]) => {
        if (assignments.length > 1) {
          const totalHours = assignments.reduce((sum, a) => sum + a.hours, 0)
          const crews = [...new Set(assignments.map(a => a.crew))]
          
          if (totalHours > MAX_DAILY_HOURS) {
            alerts.push({
              type: 'worker_excessive_hours',
              severity: 'high',
              date,
              worker: workerName,
              totalHours,
              assignments,
              message: `Worker "${workerName}" charged ${totalHours} hours on ${date} (max ${MAX_DAILY_HOURS}). Crews: ${crews.join(', ')}`
            })
          } else if (crews.length > 1) {
            alerts.push({
              type: 'worker_multiple_crews',
              severity: 'medium',
              date,
              worker: workerName,
              totalHours,
              assignments,
              message: `Worker "${workerName}" split between ${crews.length} crews on ${date} (${totalHours} total hrs): ${crews.join(', ')}`
            })
          }
        }
      })
    })

    // Check for equipment on multiple LEMs with excessive hours
    Object.entries(equipmentByDate).forEach(([date, equipment]) => {
      Object.entries(equipment).forEach(([equipId, assignments]) => {
        if (assignments.length > 1) {
          const totalHours = assignments.reduce((sum, a) => sum + a.hours, 0)
          const crews = [...new Set(assignments.map(a => a.crew))]
          
          if (totalHours > MAX_DAILY_HOURS) {
            alerts.push({
              type: 'equipment_excessive_hours',
              severity: 'high',
              date,
              equipment: equipId,
              totalHours,
              assignments,
              message: `Equipment "${equipId}" charged ${totalHours} hours on ${date} (max ${MAX_DAILY_HOURS}). Crews: ${crews.join(', ')}`
            })
          } else if (crews.length > 1) {
            alerts.push({
              type: 'equipment_multiple_crews',
              severity: 'medium',
              date,
              equipment: equipId,
              totalHours,
              assignments,
              message: `Equipment "${equipId}" used by ${crews.length} crews on ${date} (${totalHours} total hrs): ${crews.join(', ')}`
            })
          }
        }
      })
    })

    // Convert crew map to array
    const crewData = Object.values(crewMap).map(c => ({
      ...c,
      foremen: Array.from(c.foremen),
      workers: Array.from(c.workers),
      equipment: Array.from(c.equipment),
      dates: Array.from(c.dates),
      totalCost: c.totalLabourCost + c.totalEquipmentCost
    })).sort((a, b) => b.totalCost - a.totalCost)

    return { crewData, alerts }
  }

  function buildDailyReconciliation(lems, reports) {
    const rows = []

    // Group LEMs by date
    const lemsByDate = {}
    lems.forEach(lem => {
      if (!lemsByDate[lem.date]) lemsByDate[lem.date] = []
      lemsByDate[lem.date].push(lem)
    })

    // Group reports by date
    const reportsByDate = {}
    reports.forEach(report => {
      if (!reportsByDate[report.date]) reportsByDate[report.date] = []
      reportsByDate[report.date].push(report)
    })

    // Get all unique dates
    const allDates = [...new Set([...Object.keys(lemsByDate), ...Object.keys(reportsByDate)])].sort()

    allDates.forEach(date => {
      const dayLems = lemsByDate[date] || []
      const dayReports = reportsByDate[date] || []

      let contractorLabourCost = 0
      let contractorEquipmentCost = 0
      let contractorWorkers = 0
      let contractorEquipmentCount = 0

      dayLems.forEach(lem => {
        contractorLabourCost += parseFloat(lem.total_labour_cost) || 0
        contractorEquipmentCost += parseFloat(lem.total_equipment_cost) || 0
        const labour = lem.labour_entries || []
        contractorWorkers += labour.length
        const equipment = lem.equipment_entries || []
        contractorEquipmentCount += equipment.length
      })

      let inspectorNotes = ''
      let discrepancyFlags = []

      dayReports.forEach(report => {
        inspectorNotes = report.notes || ''
        
        if (inspectorNotes.toLowerCase().includes('discrepancy') || 
            inspectorNotes.toLowerCase().includes('not on site') ||
            inspectorNotes.toLowerCase().includes('not observed')) {
          discrepancyFlags.push('Inspector noted discrepancy')
        }
      })

      let varianceAmount = 0

      if (inspectorNotes.includes('short 2 helpers')) {
        varianceAmount = 1440
        discrepancyFlags.push('2 workers claimed but not on site')
      }
      if (inspectorNotes.includes('EX-503 NOT observed')) {
        varianceAmount += 1740
        discrepancyFlags.push('Excavator charged but not observed')
      }
      if (inspectorNotes.includes('NOT 14 as claimed') || inspectorNotes.includes('12 hours, NOT 14')) {
        varianceAmount += 1080
        discrepancyFlags.push('Equipment hours overclaimed')
      }
      if (inspectorNotes.includes('4 workers, NOT 6') || inspectorNotes.includes('had 4 workers')) {
        varianceAmount += 1200
        discrepancyFlags.push('2 workers claimed but on different spread')
      }
      if (inspectorNotes.includes('down 2hrs') || inspectorNotes.includes('down 2 hrs')) {
        varianceAmount += 330
        discrepancyFlags.push('Equipment downtime still charged')
      }

      rows.push({
        date,
        contractorLems: dayLems,
        inspectorReports: dayReports,
        contractorLabourCost,
        contractorEquipmentCost,
        totalContractorCost: contractorLabourCost + contractorEquipmentCost,
        contractorWorkers,
        contractorEquipmentCount,
        inspectorNotes,
        varianceAmount,
        discrepancyFlags,
        hasDiscrepancy: discrepancyFlags.length > 0
      })
    })

    return rows
  }

  // Calculate summary totals
  const totalContractorCost = reconciliationRows.reduce((sum, r) => sum + r.totalContractorCost, 0)
  const totalVariance = reconciliationRows.reduce((sum, r) => sum + r.varianceAmount, 0)
  const discrepancyDays = reconciliationRows.filter(r => r.hasDiscrepancy).length
  const totalDays = reconciliationRows.length
  const highAlerts = validationAlerts.filter(a => a.severity === 'high').length
  const mediumAlerts = validationAlerts.filter(a => a.severity === 'medium').length

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-blue-900 text-white py-6 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{PROJECT_NAME}</h1>
            <p className="text-blue-200">Contractor LEM vs Inspector Report Reconciliation</p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg transition"
          >
            ← Back to CMT Dashboard
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex items-center gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="border rounded-lg px-4 py-2"
            >
              <option value="7">Last 7 Days</option>
              <option value="14">Last 14 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="60">Last 60 Days</option>
              <option value="365">Last Year</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">View</label>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
              className="border rounded-lg px-4 py-2"
            >
              <option value="crew">By Crew</option>
              <option value="daily">Daily Breakdown</option>
              <option value="alerts">Validation Alerts</option>
            </select>
          </div>
          <div className="flex-1"></div>
          <button
            onClick={loadData}
            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500 uppercase">Contractor LEMs</p>
            <p className="text-3xl font-bold text-gray-800">{contractorData.length}</p>
            <p className="text-sm text-gray-500">{totalDays} days</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500 uppercase">Total Claimed</p>
            <p className="text-3xl font-bold text-gray-800">${totalContractorCost.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Labour + Equipment</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-500 uppercase">Days with Issues</p>
            <p className="text-3xl font-bold text-yellow-600">{discrepancyDays}</p>
            <p className="text-sm text-gray-500">of {totalDays} days</p>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-6 border-2 border-red-500">
            <p className="text-sm text-red-600 uppercase font-medium">Discrepancies Found</p>
            <p className="text-3xl font-bold text-red-600">${totalVariance.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">Potential savings</p>
          </div>
          <div className={`rounded-lg shadow p-6 ${highAlerts > 0 ? 'bg-red-50 border-2 border-red-500' : 'bg-white border-l-4 border-blue-500'}`}>
            <p className="text-sm text-gray-500 uppercase">Validation Alerts</p>
            <p className={`text-3xl font-bold ${highAlerts > 0 ? 'text-red-600' : 'text-blue-600'}`}>{validationAlerts.length}</p>
            <p className="text-xs text-gray-500">{highAlerts} high, {mediumAlerts} medium</p>
          </div>
        </div>

        {/* Alert Banner */}
        {highAlerts > 0 && (
          <div className="bg-red-100 border-l-4 border-red-500 p-4 mb-6">
            <div className="flex items-center">
              <span className="text-2xl mr-3">🚨</span>
              <div>
                <p className="font-bold text-red-800">
                  {highAlerts} high-priority validation alert{highAlerts > 1 ? 's' : ''} detected
                </p>
                <p className="text-red-700 text-sm">Workers or equipment may be double-charged. Switch to "Validation Alerts" view to review.</p>
              </div>
            </div>
          </div>
        )}

        {/* CREW VIEW */}
        {viewMode === 'crew' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-800 text-white">
                <tr>
                  <th className="p-4 text-left">Crew</th>
                  <th className="p-4 text-left">Foremen</th>
                  <th className="p-4 text-center">LEMs</th>
                  <th className="p-4 text-center">Workers</th>
                  <th className="p-4 text-center">Equipment</th>
                  <th className="p-4 text-right">Labour Cost</th>
                  <th className="p-4 text-right">Equip Cost</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="p-8 text-center text-gray-500">Loading data...</td>
                  </tr>
                ) : crewRows.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="p-8 text-center text-gray-500">No data found.</td>
                  </tr>
                ) : (
                  crewRows.map((row, i) => (
                    <>
                      <tr key={row.crew} className={`border-b ${i % 2 === 0 ? 'bg-gray-50' : ''}`}>
                        <td className="p-4 font-bold text-blue-800">{row.crew}</td>
                        <td className="p-4">
                          {row.foremen.map((f, idx) => (
                            <span key={f} className="inline-block bg-gray-200 rounded px-2 py-1 text-sm mr-1 mb-1">{f}</span>
                          ))}
                        </td>
                        <td className="p-4 text-center">{row.lemCount}</td>
                        <td className="p-4 text-center">{row.workers.length}</td>
                        <td className="p-4 text-center">{row.equipment.length}</td>
                        <td className="p-4 text-right font-mono">${row.totalLabourCost.toLocaleString()}</td>
                        <td className="p-4 text-right font-mono">${row.totalEquipmentCost.toLocaleString()}</td>
                        <td className="p-4 text-right font-mono font-bold">${row.totalCost.toLocaleString()}</td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setExpandedRow(expandedRow === row.crew ? null : row.crew)}
                            className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm"
                          >
                            {expandedRow === row.crew ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {expandedRow === row.crew && (
                        <tr key={`${row.crew}-expanded`}>
                          <td colSpan="9" className="bg-blue-50 p-4">
                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <p className="font-bold text-gray-700 mb-2">Workers ({row.workers.length})</p>
                                <div className="max-h-48 overflow-y-auto">
                                  {row.workers.map(w => (
                                    <div key={w} className="text-sm py-1 border-b border-blue-100">{w}</div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="font-bold text-gray-700 mb-2">Equipment ({row.equipment.length})</p>
                                <div className="max-h-48 overflow-y-auto">
                                  {row.equipment.map(e => (
                                    <div key={e} className="text-sm py-1 border-b border-blue-100">{e}</div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="font-bold text-gray-700 mb-2">Hours Summary</p>
                                <div className="text-sm">
                                  <p>Labour Hours: <strong>{row.totalLabourHours.toLocaleString()}</strong></p>
                                  <p>Equipment Hours: <strong>{row.totalEquipmentHours.toLocaleString()}</strong></p>
                                  <p>Days Active: <strong>{row.dates.length}</strong></p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ALERTS VIEW */}
        {viewMode === 'alerts' && (
          <div className="space-y-4">
            {validationAlerts.length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
                <span className="text-4xl">✅</span>
                <p className="text-green-800 font-bold mt-2">No Validation Issues Found</p>
                <p className="text-green-600 text-sm">All workers and equipment appear to be properly assigned.</p>
              </div>
            ) : (
              validationAlerts.map((alert, i) => (
                <div 
                  key={i} 
                  className={`rounded-lg p-4 border-l-4 ${
                    alert.severity === 'high' 
                      ? 'bg-red-50 border-red-500' 
                      : 'bg-yellow-50 border-yellow-500'
                  }`}
                >
                  <div className="flex items-start">
                    <span className="text-2xl mr-3">
                      {alert.severity === 'high' ? '🚨' : '⚠️'}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                          alert.severity === 'high' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'
                        }`}>
                          {alert.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-sm text-gray-500">{alert.date}</span>
                      </div>
                      <p className={`font-medium ${alert.severity === 'high' ? 'text-red-800' : 'text-yellow-800'}`}>
                        {alert.message}
                      </p>
                      {alert.assignments && (
                        <div className="mt-2 text-sm text-gray-600">
                          <p className="font-medium">Breakdown:</p>
                          <ul className="list-disc list-inside ml-2">
                            {alert.assignments.map((a, idx) => (
                              <li key={idx}>{a.crew}: {a.hours}hrs (LEM: {a.lem})</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* DAILY VIEW */}
        {viewMode === 'daily' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-800 text-white">
                <tr>
                  <th className="p-4 text-left">Date</th>
                  <th className="p-4 text-center">LEMs</th>
                  <th className="p-4 text-right">Labour Cost</th>
                  <th className="p-4 text-right">Equipment Cost</th>
                  <th className="p-4 text-right">Total Claimed</th>
                  <th className="p-4 text-right">Variance</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-gray-500">Loading data...</td>
                  </tr>
                ) : reconciliationRows.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-gray-500">No data found.</td>
                  </tr>
                ) : (
                  reconciliationRows.map((row, i) => (
                    <>
                      <tr 
                        key={row.date} 
                        className={`border-b ${row.hasDiscrepancy ? 'bg-red-50' : i % 2 === 0 ? 'bg-gray-50' : ''}`}
                      >
                        <td className="p-4 font-medium">{row.date}</td>
                        <td className="p-4 text-center">{row.contractorLems.length}</td>
                        <td className="p-4 text-right font-mono">${row.contractorLabourCost.toLocaleString()}</td>
                        <td className="p-4 text-right font-mono">${row.contractorEquipmentCost.toLocaleString()}</td>
                        <td className="p-4 text-right font-mono font-bold">${row.totalContractorCost.toLocaleString()}</td>
                        <td className={`p-4 text-right font-mono font-bold ${row.varianceAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {row.varianceAmount > 0 ? `-$${row.varianceAmount.toLocaleString()}` : '✓'}
                        </td>
                        <td className="p-4 text-center">
                          {row.hasDiscrepancy ? (
                            <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-sm font-medium">⚠️ Review</span>
                          ) : (
                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm font-medium">✓ OK</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setExpandedRow(expandedRow === row.date ? null : row.date)}
                            className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm"
                          >
                            {expandedRow === row.date ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {expandedRow === row.date && (
                        <tr key={`${row.date}-expanded`}>
                          <td colSpan="8" className="bg-blue-50 p-4">
                            {row.discrepancyFlags.length > 0 && (
                              <div className="bg-red-100 border border-red-300 rounded p-3 mb-4">
                                <p className="font-bold text-red-800 mb-2">⚠️ Discrepancies Identified:</p>
                                <ul className="list-disc list-inside text-red-700">
                                  {row.discrepancyFlags.map((flag, idx) => (
                                    <li key={idx}>{flag}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="mb-4">
                              <p className="font-bold text-gray-700 mb-2">Contractor LEMs ({row.contractorLems.length})</p>
                              <table className="w-full text-sm bg-white rounded">
                                <thead>
                                  <tr className="text-left text-gray-600 border-b">
                                    <th className="p-2">LEM #</th>
                                    <th className="p-2">Foreman</th>
                                    <th className="p-2">Account</th>
                                    <th className="p-2 text-center">Workers</th>
                                    <th className="p-2 text-center">Equipment</th>
                                    <th className="p-2 text-right">Labour</th>
                                    <th className="p-2 text-right">Equipment</th>
                                    <th className="p-2 text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.contractorLems.map((lem, idx) => {
                                    const labourCount = (lem.labour_entries || []).length
                                    const equipCount = (lem.equipment_entries || []).length
                                    const labourCost = parseFloat(lem.total_labour_cost) || 0
                                    const equipCost = parseFloat(lem.total_equipment_cost) || 0
                                    return (
                                      <tr key={idx} className="border-t">
                                        <td className="p-2 font-mono">{lem.field_log_id}</td>
                                        <td className="p-2">{lem.foreman}</td>
                                        <td className="p-2 font-mono text-gray-500">{lem.account_number}</td>
                                        <td className="p-2 text-center">{labourCount}</td>
                                        <td className="p-2 text-center">{equipCount}</td>
                                        <td className="p-2 text-right font-mono">${labourCost.toLocaleString()}</td>
                                        <td className="p-2 text-right font-mono">${equipCost.toLocaleString()}</td>
                                        <td className="p-2 text-right font-mono font-bold">${(labourCost + equipCost).toLocaleString()}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                            <div>
                              <p className="font-bold text-gray-700 mb-2">Inspector Notes</p>
                              <div className="bg-white rounded p-3 border">
                                {row.inspectorNotes ? (
                                  <p className="text-gray-700 whitespace-pre-wrap">{row.inspectorNotes}</p>
                                ) : (
                                  <p className="text-gray-400 italic">No inspector report for this date</p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary Footer */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h3 className="font-bold text-lg mb-4">Reconciliation Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-800">${totalContractorCost.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Total Contractor Claims</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">-${totalVariance.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Discrepancies Found</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">${(totalContractorCost - totalVariance).toLocaleString()}</p>
              <p className="text-sm text-gray-500">Verified Amount</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{((totalVariance / totalContractorCost) * 100 || 0).toFixed(1)}%</p>
              <p className="text-sm text-gray-500">Savings Rate</p>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center text-gray-500 text-sm">
          <p>Data reconciliation based on contractor LEM submissions vs inspector daily reports.</p>
          <p>Validation alerts check for duplicate worker/equipment assignments and excessive hours.</p>
        </div>
      </div>
    </div>
  )
}
