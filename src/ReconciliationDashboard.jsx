import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const PROJECT_NAME = "Clearwater Pipeline - Demo Project"

export default function ReconciliationDashboard() {
  const navigate = useNavigate()
  const [contractorData, setContractorData] = useState([])
  const [inspectorData, setInspectorData] = useState([])
  const [reconciliationRows, setReconciliationRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30')
  const [expandedRow, setExpandedRow] = useState(null)
  const [viewMode, setViewMode] = useState('daily') // 'daily' or 'summary'

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
    const rows = buildReconciliation(lems || [], reports || [])
    setReconciliationRows(rows)
    setLoading(false)
  }

  function buildReconciliation(lems, reports) {
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

      // Calculate contractor totals for the day
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

      // Parse inspector observations from notes and data
      let inspectorWorkers = 0
      let inspectorNotes = ''
      let discrepancyFlags = []

      dayReports.forEach(report => {
        inspectorNotes = report.notes || ''
        
        // Check for discrepancy keywords in notes
        if (inspectorNotes.toLowerCase().includes('discrepancy') || 
            inspectorNotes.toLowerCase().includes('not on site') ||
            inspectorNotes.toLowerCase().includes('not observed')) {
          discrepancyFlags.push('Inspector noted discrepancy')
        }

        // Try to extract worker counts from notes
        const workerMatch = inspectorNotes.match(/(\d+)\s*workers?/gi)
        if (workerMatch) {
          workerMatch.forEach(match => {
            const num = parseInt(match)
            if (!isNaN(num)) inspectorWorkers += num
          })
        }
      })

      // Calculate variance
      const totalContractorCost = contractorLabourCost + contractorEquipmentCost
      
      // Estimate inspector cost (if we had structured data, this would be precise)
      // For now, flag based on worker count differences noted in reports
      let varianceAmount = 0
      let varianceType = 'none'

      // Check for specific discrepancies mentioned in notes
      if (inspectorNotes.includes('short 2 helpers')) {
        varianceAmount = 1440 // 2 workers x 12 hrs x ~$60/hr
        varianceType = 'manpower'
        discrepancyFlags.push('2 workers claimed but not on site')
      }
      if (inspectorNotes.includes('EX-503 NOT observed')) {
        varianceAmount += 1740 // 12 hrs x $145/hr
        varianceType = 'equipment'
        discrepancyFlags.push('Excavator charged but not observed')
      }
      if (inspectorNotes.includes('NOT 14 as claimed') || inspectorNotes.includes('12 hours, NOT 14')) {
        varianceAmount += 1080 // 2 hrs x 5 pieces x ~$108/hr avg
        varianceType = 'hours'
        discrepancyFlags.push('Equipment hours overclaimed')
      }
      if (inspectorNotes.includes('4 workers, NOT 6') || inspectorNotes.includes('had 4 workers')) {
        varianceAmount += 1200 // 2 workers x 12 hrs x ~$50/hr
        varianceType = 'manpower'
        discrepancyFlags.push('2 workers claimed but on different spread')
      }
      if (inspectorNotes.includes('down 2hrs') || inspectorNotes.includes('down 2 hrs')) {
        varianceAmount += 330 // 2 hrs x $165/hr
        discrepancyFlags.push('Equipment downtime still charged')
      }

      rows.push({
        date,
        contractorLems: dayLems,
        inspectorReports: dayReports,
        contractorLabourCost,
        contractorEquipmentCost,
        totalContractorCost,
        contractorWorkers,
        contractorEquipmentCount,
        inspectorNotes,
        varianceAmount,
        varianceType,
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
            onClick={() => navigate('/')}
            className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg transition"
          >
            ← Back to Dashboard
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
              <option value="daily">Daily Breakdown</option>
              <option value="summary">Summary by Foreman</option>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
            <p className="text-sm text-red-600 uppercase font-medium">Identified Discrepancies</p>
            <p className="text-3xl font-bold text-red-600">${totalVariance.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">Potential savings</p>
          </div>
        </div>

        {/* Alert Banner */}
        {discrepancyDays > 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex items-center">
              <span className="text-2xl mr-3">⚠️</span>
              <div>
                <p className="font-bold text-yellow-800">
                  {discrepancyDays} day{discrepancyDays > 1 ? 's' : ''} with billing discrepancies identified
                </p>
                <p className="text-yellow-700 text-sm">
                  Inspector reports flagged ${totalVariance.toLocaleString()} in potential overbilling
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Data Table */}
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
                  <td colSpan="8" className="p-8 text-center text-gray-500">
                    Loading data...
                  </td>
                </tr>
              ) : reconciliationRows.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-500">
                    No data found. Import contractor LEMs and inspector reports first.
                  </td>
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
                          <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-sm font-medium">
                            ⚠️ Review
                          </span>
                        ) : (
                          <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm font-medium">
                            ✓ OK
                          </span>
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
                          {/* Discrepancy Flags */}
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

                          {/* Contractor LEMs */}
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

                          {/* Inspector Notes */}
                          <div>
                            <p className="font-bold text-gray-700 mb-2">Inspector Report Notes</p>
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
          <p>Discrepancies are flagged based on inspector notes and observations.</p>
        </div>
      </div>
    </div>
  )
}
