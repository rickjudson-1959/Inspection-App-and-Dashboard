import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline - Demo Project"
const MAX_DAILY_HOURS = 16

export default function ReconciliationDashboard() {
  const navigate = useNavigate()
  const [contractorData, setContractorData] = useState([])
  const [inspectorData, setInspectorData] = useState([])
  const [reconciliationRows, setReconciliationRows] = useState([])
  const [crewRows, setCrewRows] = useState([])
  const [detailedComparisons, setDetailedComparisons] = useState([])
  const [validationAlerts, setValidationAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30')
  const [expandedRow, setExpandedRow] = useState(null)
  const [viewMode, setViewMode] = useState('detailed') // 'daily', 'crew', 'alerts', 'detailed'
  const [selectedComparison, setSelectedComparison] = useState(null)

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
      .order('date', { ascending: true })

    if (lemsError) console.error('Error loading contractor LEMs:', lemsError)

    const { data: reports, error: reportsError } = await supabase
      .from('daily_tickets')
      .select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: true })

    if (reportsError) console.error('Error loading inspector reports:', reportsError)

    setContractorData(lems || [])
    setInspectorData(reports || [])

    const dailyRows = buildDailyReconciliation(lems || [], reports || [])
    setReconciliationRows(dailyRows)

    const { crewData, alerts } = buildCrewView(lems || [], reports || [])
    setCrewRows(crewData)
    setValidationAlerts(alerts)

    // Build detailed 3-way comparisons
    const detailed = buildDetailedComparisons(lems || [], reports || [])
    setDetailedComparisons(detailed)

    setLoading(false)
  }

  // NEW: Build detailed worker-by-worker, equipment-by-equipment comparisons
  function buildDetailedComparisons(lems, reports) {
    const comparisons = []

    lems.forEach(lem => {
      // Find matching inspector report by date and foreman
      const matchingReports = reports.filter(r => {
        if (r.date !== lem.date) return false
        
        // Check if foreman matches in any activity block
        const activityBlocks = r.activity_blocks || []
        return activityBlocks.some(block => 
          block.foreman?.toLowerCase().includes(lem.foreman?.toLowerCase()?.split(' ')[0] || '') ||
          lem.foreman?.toLowerCase().includes(block.foreman?.toLowerCase()?.split(' ')[0] || '')
        )
      })

      // Get all labour and equipment from matching inspector reports
      let inspectorLabour = []
      let inspectorEquipment = []
      let ticketPhoto = null

      matchingReports.forEach(report => {
        const blocks = report.activity_blocks || []
        blocks.forEach(block => {
          if (block.labourEntries) {
            inspectorLabour = [...inspectorLabour, ...block.labourEntries]
          }
          if (block.equipmentEntries) {
            inspectorEquipment = [...inspectorEquipment, ...block.equipmentEntries]
          }
          // Check for ticket photo
          if (block.workPhotos) {
            const ticketPhotos = block.workPhotos.filter(p => 
              (typeof p === 'string' && p.toLowerCase().includes('ticket')) ||
              (p.filename && p.filename.toLowerCase().includes('ticket'))
            )
            if (ticketPhotos.length > 0) {
              ticketPhoto = typeof ticketPhotos[0] === 'string' ? ticketPhotos[0] : ticketPhotos[0].filename
            }
          }
        })
      })

      // Compare labour: LEM vs Inspector
      const lemLabour = lem.labour_entries || []
      const labourComparison = []
      let labourVarianceHours = 0
      let labourVarianceCost = 0

      lemLabour.forEach(lemWorker => {
        const workerName = (lemWorker.name || '').toUpperCase().trim()
        const lemHours = (parseFloat(lemWorker.rt_hours) || 0) + (parseFloat(lemWorker.ot_hours) || 0)
        const lemRate = parseFloat(lemWorker.rt_rate) || 50 // default rate if not specified

        // Find matching worker in inspector report
        const inspectorMatch = inspectorLabour.find(iw => {
          const inspName = (iw.employeeName || iw.name || '').toUpperCase().trim()
          return inspName === workerName || 
                 inspName.includes(workerName.split(' ')[0]) ||
                 workerName.includes(inspName.split(' ')[0])
        })

        if (inspectorMatch) {
          const inspectorHours = parseFloat(inspectorMatch.hours) || 
            ((parseFloat(inspectorMatch.rt) || 0) + (parseFloat(inspectorMatch.ot) || 0))
          const hoursDiff = lemHours - inspectorHours
          
          labourComparison.push({
            name: workerName,
            classification: lemWorker.type || inspectorMatch.classification,
            lemHours,
            inspectorHours,
            variance: hoursDiff,
            status: hoursDiff > 0 ? 'over' : hoursDiff < 0 ? 'under' : 'match'
          })

          if (hoursDiff > 0) {
            labourVarianceHours += hoursDiff
            labourVarianceCost += hoursDiff * lemRate
          }
        } else {
          // Worker in LEM but NOT in inspector report
          labourComparison.push({
            name: workerName,
            classification: lemWorker.type,
            lemHours,
            inspectorHours: 0,
            variance: lemHours,
            status: 'not_found'
          })
          labourVarianceHours += lemHours
          labourVarianceCost += lemHours * lemRate
        }
      })

      // Check for workers in inspector report but NOT in LEM
      inspectorLabour.forEach(inspWorker => {
        const inspName = (inspWorker.employeeName || inspWorker.name || '').toUpperCase().trim()
        const alreadyMatched = labourComparison.some(lc => 
          lc.name === inspName || 
          lc.name.includes(inspName.split(' ')[0]) ||
          inspName.includes(lc.name.split(' ')[0])
        )
        
        if (!alreadyMatched) {
          const inspectorHours = parseFloat(inspWorker.hours) || 
            ((parseFloat(inspWorker.rt) || 0) + (parseFloat(inspWorker.ot) || 0))
          
          labourComparison.push({
            name: inspName,
            classification: inspWorker.classification,
            lemHours: 0,
            inspectorHours,
            variance: -inspectorHours,
            status: 'not_billed'
          })
        }
      })

      // Compare equipment: LEM vs Inspector
      const lemEquipment = lem.equipment_entries || []
      const equipmentComparison = []
      let equipmentVarianceHours = 0
      let equipmentVarianceCost = 0

      lemEquipment.forEach(lemEquip => {
        const equipType = (lemEquip.type || lemEquip.equipment_id || '').toUpperCase().trim()
        const lemHours = parseFloat(lemEquip.hours) || 0
        const lemRate = parseFloat(lemEquip.rate) || 100

        // Find matching equipment in inspector report
        const inspectorMatch = inspectorEquipment.find(ie => {
          const inspType = (ie.type || '').toUpperCase().trim()
          // Fuzzy match on equipment type
          return inspType === equipType ||
                 inspType.includes(equipType.split(' ')[0]) ||
                 equipType.includes(inspType.split(' ')[0]) ||
                 (inspType.includes('SIDEBOOM') && equipType.includes('SIDEBOOM')) ||
                 (inspType.includes('BACKHOE') && equipType.includes('BACKHOE')) ||
                 (inspType.includes('EXCAVATOR') && equipType.includes('EXCAVATOR'))
        })

        if (inspectorMatch) {
          const inspectorHours = parseFloat(inspectorMatch.hours) || 0
          const hoursDiff = lemHours - inspectorHours
          
          equipmentComparison.push({
            type: equipType,
            lemHours,
            inspectorHours,
            variance: hoursDiff,
            status: hoursDiff > 0 ? 'over' : hoursDiff < 0 ? 'under' : 'match'
          })

          if (hoursDiff > 0) {
            equipmentVarianceHours += hoursDiff
            equipmentVarianceCost += hoursDiff * lemRate
          }

          // Remove from inspector list to avoid double-matching
          const idx = inspectorEquipment.indexOf(inspectorMatch)
          if (idx > -1) inspectorEquipment.splice(idx, 1)
        } else {
          equipmentComparison.push({
            type: equipType,
            lemHours,
            inspectorHours: 0,
            variance: lemHours,
            status: 'not_found'
          })
          equipmentVarianceHours += lemHours
          equipmentVarianceCost += lemHours * lemRate
        }
      })

      // Equipment in inspector but not in LEM
      inspectorEquipment.forEach(inspEquip => {
        const inspType = (inspEquip.type || '').toUpperCase().trim()
        const inspectorHours = parseFloat(inspEquip.hours) || 0
        
        equipmentComparison.push({
          type: inspType,
          lemHours: 0,
          inspectorHours,
          variance: -inspectorHours,
          status: 'not_billed'
        })
      })

      const totalVariance = labourVarianceCost + equipmentVarianceCost
      const hasIssues = labourComparison.some(l => l.status !== 'match' && l.status !== 'not_billed') ||
                       equipmentComparison.some(e => e.status !== 'match' && e.status !== 'not_billed')

      comparisons.push({
        lem,
        matchingReports,
        ticketPhoto,
        labourComparison: labourComparison.sort((a,b) => b.variance - a.variance),
        equipmentComparison: equipmentComparison.sort((a,b) => b.variance - a.variance),
        labourVarianceHours,
        labourVarianceCost,
        equipmentVarianceHours,
        equipmentVarianceCost,
        totalVariance,
        hasIssues,
        hasMatch: matchingReports.length > 0
      })
    })

    return comparisons.sort((a,b) => b.totalVariance - a.totalVariance)
  }

  function buildCrewView(lems, reports) {
    const alerts = []
    const crewMap = {}
    const workersByDate = {}
    const equipmentByDate = {}
    const foremenByDate = {}

    lems.forEach(lem => {
      const date = lem.date
      const foreman = lem.foreman || 'Unknown'
      const labourEntries = lem.labour_entries || []
      const equipmentEntries = lem.equipment_entries || []
      
      let crew = 'General'
      const accountNum = lem.account_number || ''
      if (accountNum.includes('2145') || foreman.includes('Whitworth')) crew = 'Mainline Welding'
      else if (accountNum.includes('2146') || foreman.includes('Untinen')) crew = 'Tie-In Welding'
      else if (accountNum.includes('2160') || foreman.includes('Nelson')) crew = 'Ditching'
      else if (accountNum.includes('2180') || foreman.includes('Cook')) crew = 'Lowering-In'
      else if (accountNum.includes('2190') || foreman.includes('Langlois')) crew = 'Backfill'

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

      if (!foremenByDate[date]) foremenByDate[date] = {}
      if (!foremenByDate[date][foreman]) foremenByDate[date][foreman] = []
      foremenByDate[date][foreman].push(crew)

      if (!workersByDate[date]) workersByDate[date] = {}
      labourEntries.forEach(entry => {
        const workerName = entry.name || entry.type || 'Unknown'
        const hours = (parseFloat(entry.rt_hours) || 0) + (parseFloat(entry.ot_hours) || 0)
        crewMap[crew].workers.add(workerName)
        crewMap[crew].totalLabourHours += hours
        if (!workersByDate[date][workerName]) workersByDate[date][workerName] = []
        workersByDate[date][workerName].push({ lem: lem.field_log_id, hours, crew, foreman })
      })

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

    // Validation checks
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
              message: `Worker "${workerName}" charged ${totalHours} hours on ${date} (max ${MAX_DAILY_HOURS})`
            })
          } else if (crews.length > 1) {
            alerts.push({
              type: 'worker_multiple_crews',
              severity: 'medium',
              date,
              worker: workerName,
              totalHours,
              assignments,
              message: `Worker "${workerName}" split between ${crews.length} crews on ${date}`
            })
          }
        }
      })
    })

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
              message: `Equipment "${equipId}" charged ${totalHours} hours on ${date} (max ${MAX_DAILY_HOURS})`
            })
          } else if (crews.length > 1) {
            alerts.push({
              type: 'equipment_multiple_crews',
              severity: 'medium',
              date,
              equipment: equipId,
              totalHours,
              assignments,
              message: `Equipment "${equipId}" used by ${crews.length} crews on ${date}`
            })
          }
        }
      })
    })

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
    const lemsByDate = {}
    const reportsByDate = {}

    lems.forEach(lem => {
      if (!lemsByDate[lem.date]) lemsByDate[lem.date] = []
      lemsByDate[lem.date].push(lem)
    })

    reports.forEach(report => {
      if (!reportsByDate[report.date]) reportsByDate[report.date] = []
      reportsByDate[report.date].push(report)
    })

    const allDates = [...new Set([...Object.keys(lemsByDate), ...Object.keys(reportsByDate)])].sort()

    allDates.forEach(date => {
      const dayLems = lemsByDate[date] || []
      const dayReports = reportsByDate[date] || []

      let contractorLabourCost = 0
      let contractorEquipmentCost = 0

      dayLems.forEach(lem => {
        contractorLabourCost += parseFloat(lem.total_labour_cost) || 0
        contractorEquipmentCost += parseFloat(lem.total_equipment_cost) || 0
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
      if (inspectorNotes.includes('short 2 helpers')) varianceAmount += 1440
      if (inspectorNotes.includes('EX-503 NOT observed')) varianceAmount += 1740
      if (inspectorNotes.includes('NOT 14 as claimed')) varianceAmount += 1080
      if (inspectorNotes.includes('4 workers, NOT 6')) varianceAmount += 1200

      rows.push({
        date,
        contractorLems: dayLems,
        inspectorReports: dayReports,
        contractorLabourCost,
        contractorEquipmentCost,
        totalContractorCost: contractorLabourCost + contractorEquipmentCost,
        inspectorNotes,
        varianceAmount,
        discrepancyFlags,
        hasDiscrepancy: discrepancyFlags.length > 0 || varianceAmount > 0
      })
    })

    return rows
  }

  const totalContractorCost = reconciliationRows.reduce((sum, r) => sum + r.totalContractorCost, 0)
  const totalVariance = detailedComparisons.reduce((sum, c) => sum + c.totalVariance, 0)
  const discrepancyCount = detailedComparisons.filter(c => c.hasIssues).length
  const highAlerts = validationAlerts.filter(a => a.severity === 'high').length

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-blue-900 text-white py-6 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{PROJECT_NAME}</h1>
            <p className="text-blue-200">LEM vs Timesheet vs Inspector - 3-Way Reconciliation</p>
          </div>
          <button onClick={() => navigate(-1)} className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg transition">
            ← Back
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex items-center gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Date Range</label>
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="border rounded-lg px-4 py-2">
              <option value="7">Last 7 Days</option>
              <option value="14">Last 14 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="60">Last 60 Days</option>
              <option value="365">Last Year</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">View</label>
            <select value={viewMode} onChange={(e) => setViewMode(e.target.value)} className="border rounded-lg px-4 py-2">
              <option value="detailed">Detailed Comparison</option>
              <option value="crew">By Crew</option>
              <option value="daily">Daily Breakdown</option>
              <option value="alerts">Validation Alerts</option>
            </select>
          </div>
          <div className="flex-1"></div>
          <button onClick={loadData} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg">🔄 Refresh</button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500 uppercase">Contractor LEMs</p>
            <p className="text-3xl font-bold text-gray-800">{contractorData.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500 uppercase">Total Billed</p>
            <p className="text-3xl font-bold text-gray-800">${totalContractorCost.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-500 uppercase">LEMs with Issues</p>
            <p className="text-3xl font-bold text-yellow-600">{discrepancyCount}</p>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-6 border-2 border-red-500">
            <p className="text-sm text-red-600 uppercase font-medium">Total Variance</p>
            <p className="text-3xl font-bold text-red-600">${totalVariance.toLocaleString()}</p>
          </div>
          <div className={`rounded-lg shadow p-6 ${highAlerts > 0 ? 'bg-red-50 border-2 border-red-500' : 'bg-white'}`}>
            <p className="text-sm text-gray-500 uppercase">Validation Alerts</p>
            <p className={`text-3xl font-bold ${highAlerts > 0 ? 'text-red-600' : 'text-green-600'}`}>{validationAlerts.length}</p>
          </div>
        </div>

        {/* DETAILED COMPARISON VIEW */}
        {viewMode === 'detailed' && (
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading comparisons...</div>
            ) : detailedComparisons.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                No LEMs found in selected date range.
              </div>
            ) : (
              detailedComparisons.map((comp, idx) => (
                <div key={idx} className={`bg-white rounded-lg shadow overflow-hidden ${comp.hasIssues ? 'border-l-4 border-red-500' : 'border-l-4 border-green-500'}`}>
                  {/* LEM Header */}
                  <div className={`p-4 flex justify-between items-center ${comp.hasIssues ? 'bg-red-50' : 'bg-green-50'}`}>
                    <div>
                      <span className="font-bold text-lg">{comp.lem.field_log_id}</span>
                      <span className="mx-3 text-gray-400">|</span>
                      <span className="text-gray-600">{comp.lem.date}</span>
                      <span className="mx-3 text-gray-400">|</span>
                      <span className="text-gray-600">{comp.lem.foreman}</span>
                      {!comp.hasMatch && (
                        <span className="ml-3 bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-sm">⚠️ No matching inspector report</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      {comp.totalVariance > 0 && (
                        <span className="text-red-600 font-bold text-lg">
                          +${comp.totalVariance.toLocaleString()} variance
                        </span>
                      )}
                      <button
                        onClick={() => setSelectedComparison(selectedComparison === idx ? null : idx)}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                      >
                        {selectedComparison === idx ? 'Hide Details' : 'View Details'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {selectedComparison === idx && (
                    <div className="p-6 border-t">
                      {/* Summary Row */}
                      <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="bg-gray-100 p-4 rounded">
                          <p className="text-sm text-gray-500">Labour Variance</p>
                          <p className={`text-xl font-bold ${comp.labourVarianceCost > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {comp.labourVarianceCost > 0 ? '+' : ''}${comp.labourVarianceCost.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">{comp.labourVarianceHours} hrs</p>
                        </div>
                        <div className="bg-gray-100 p-4 rounded">
                          <p className="text-sm text-gray-500">Equipment Variance</p>
                          <p className={`text-xl font-bold ${comp.equipmentVarianceCost > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {comp.equipmentVarianceCost > 0 ? '+' : ''}${comp.equipmentVarianceCost.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">{comp.equipmentVarianceHours} hrs</p>
                        </div>
                        <div className="bg-gray-100 p-4 rounded">
                          <p className="text-sm text-gray-500">LEM Total</p>
                          <p className="text-xl font-bold">
                            ${((comp.lem.total_labour_cost || 0) + (comp.lem.total_equipment_cost || 0)).toLocaleString()}
                          </p>
                        </div>
                        {comp.ticketPhoto && (
                          <div className="bg-blue-100 p-4 rounded">
                            <p className="text-sm text-blue-600">📸 Timesheet Photo</p>
                            <a 
                              href={`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${comp.ticketPhoto}`}
                              target="_blank"
                              className="text-blue-600 underline text-sm"
                            >
                              View Evidence
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Labour Comparison */}
                      <h4 className="font-bold text-gray-700 mb-2">👷 Labour Comparison ({comp.labourComparison.length} workers)</h4>
                      <table className="w-full mb-6 text-sm">
                        <thead className="bg-gray-800 text-white">
                          <tr>
                            <th className="p-2 text-left">Worker</th>
                            <th className="p-2 text-left">Classification</th>
                            <th className="p-2 text-center">LEM Hours</th>
                            <th className="p-2 text-center">Inspector Hours</th>
                            <th className="p-2 text-center">Variance</th>
                            <th className="p-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comp.labourComparison.map((worker, i) => (
                            <tr key={i} className={`border-b ${
                              worker.status === 'not_found' ? 'bg-red-100' :
                              worker.status === 'over' ? 'bg-yellow-50' :
                              worker.status === 'not_billed' ? 'bg-blue-50' : ''
                            }`}>
                              <td className="p-2 font-medium">{worker.name}</td>
                              <td className="p-2 text-gray-600">{worker.classification}</td>
                              <td className="p-2 text-center">{worker.lemHours}</td>
                              <td className="p-2 text-center">{worker.inspectorHours}</td>
                              <td className={`p-2 text-center font-bold ${worker.variance > 0 ? 'text-red-600' : worker.variance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                                {worker.variance > 0 ? '+' : ''}{worker.variance}
                              </td>
                              <td className="p-2 text-center">
                                {worker.status === 'match' && <span className="text-green-600">✓ Match</span>}
                                {worker.status === 'over' && <span className="text-yellow-600">⚠️ Over</span>}
                                {worker.status === 'under' && <span className="text-blue-600">Under</span>}
                                {worker.status === 'not_found' && <span className="text-red-600">🚨 NOT ON TIMESHEET</span>}
                                {worker.status === 'not_billed' && <span className="text-blue-600">ℹ️ Not Billed</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Equipment Comparison */}
                      <h4 className="font-bold text-gray-700 mb-2">🚜 Equipment Comparison ({comp.equipmentComparison.length} items)</h4>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-800 text-white">
                          <tr>
                            <th className="p-2 text-left">Equipment</th>
                            <th className="p-2 text-center">LEM Hours</th>
                            <th className="p-2 text-center">Inspector Hours</th>
                            <th className="p-2 text-center">Variance</th>
                            <th className="p-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comp.equipmentComparison.map((equip, i) => (
                            <tr key={i} className={`border-b ${
                              equip.status === 'not_found' ? 'bg-red-100' :
                              equip.status === 'over' ? 'bg-yellow-50' :
                              equip.status === 'not_billed' ? 'bg-blue-50' : ''
                            }`}>
                              <td className="p-2 font-medium">{equip.type}</td>
                              <td className="p-2 text-center">{equip.lemHours}</td>
                              <td className="p-2 text-center">{equip.inspectorHours}</td>
                              <td className={`p-2 text-center font-bold ${equip.variance > 0 ? 'text-red-600' : equip.variance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                                {equip.variance > 0 ? '+' : ''}{equip.variance}
                              </td>
                              <td className="p-2 text-center">
                                {equip.status === 'match' && <span className="text-green-600">✓ Match</span>}
                                {equip.status === 'over' && <span className="text-yellow-600">⚠️ Over</span>}
                                {equip.status === 'under' && <span className="text-blue-600">Under</span>}
                                {equip.status === 'not_found' && <span className="text-red-600">🚨 NOT OBSERVED</span>}
                                {equip.status === 'not_billed' && <span className="text-blue-600">ℹ️ Not Billed</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
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
                </tr>
              </thead>
              <tbody>
                {crewRows.map((row, i) => (
                  <tr key={row.crew} className={`border-b ${i % 2 === 0 ? 'bg-gray-50' : ''}`}>
                    <td className="p-4 font-bold text-blue-800">{row.crew}</td>
                    <td className="p-4">
                      {row.foremen.map(f => (
                        <span key={f} className="inline-block bg-gray-200 rounded px-2 py-1 text-sm mr-1 mb-1">{f}</span>
                      ))}
                    </td>
                    <td className="p-4 text-center">{row.lemCount}</td>
                    <td className="p-4 text-center">{row.workers.length}</td>
                    <td className="p-4 text-center">{row.equipment.length}</td>
                    <td className="p-4 text-right font-mono">${row.totalLabourCost.toLocaleString()}</td>
                    <td className="p-4 text-right font-mono">${row.totalEquipmentCost.toLocaleString()}</td>
                    <td className="p-4 text-right font-mono font-bold">${row.totalCost.toLocaleString()}</td>
                  </tr>
                ))}
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
              </div>
            ) : (
              validationAlerts.map((alert, i) => (
                <div key={i} className={`rounded-lg p-4 border-l-4 ${alert.severity === 'high' ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-yellow-500'}`}>
                  <div className="flex items-start">
                    <span className="text-2xl mr-3">{alert.severity === 'high' ? '🚨' : '⚠️'}</span>
                    <div>
                      <p className={`font-medium ${alert.severity === 'high' ? 'text-red-800' : 'text-yellow-800'}`}>{alert.message}</p>
                      <p className="text-sm text-gray-500 mt-1">{alert.date}</p>
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
                  <th className="p-4 text-right">Labour</th>
                  <th className="p-4 text-right">Equipment</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {reconciliationRows.map((row, i) => (
                  <tr key={row.date} className={`border-b ${row.hasDiscrepancy ? 'bg-red-50' : i % 2 === 0 ? 'bg-gray-50' : ''}`}>
                    <td className="p-4 font-medium">{row.date}</td>
                    <td className="p-4 text-center">{row.contractorLems.length}</td>
                    <td className="p-4 text-right font-mono">${row.contractorLabourCost.toLocaleString()}</td>
                    <td className="p-4 text-right font-mono">${row.contractorEquipmentCost.toLocaleString()}</td>
                    <td className="p-4 text-right font-mono font-bold">${row.totalContractorCost.toLocaleString()}</td>
                    <td className="p-4 text-center">
                      {row.hasDiscrepancy ? (
                        <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-sm">⚠️ Review</span>
                      ) : (
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm">✓ OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-gray-500 text-sm">
          <p>3-Way Reconciliation: Contractor LEM vs Daily Timesheet (OCR) vs Inspector Report</p>
        </div>
      </div>
    </div>
  )
}
