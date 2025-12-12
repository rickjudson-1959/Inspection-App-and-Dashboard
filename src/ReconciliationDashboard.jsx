import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const PROJECT_NAME = "Eagle Mountain – Woodfibre Gas Pipeline (EGP)"

export default function ReconciliationDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('14') // days
  const [expandedRow, setExpandedRow] = useState(null)
  const [drillDownData, setDrillDownData] = useState({})

  useEffect(() => {
    loadData()
  }, [dateRange])

  async function loadData() {
    setLoading(true)
    
    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    // Fetch inspector reports
    const { data: reports, error } = await supabase
      .from('daily_tickets')
      .select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: true })

    if (error) {
      console.error('Error loading reports:', error)
      setLoading(false)
      return
    }

    // Aggregate inspector data by spread + activity
    const inspectorTotals = {}
    const reportsByKey = {}

    reports?.forEach(report => {
      const blocks = report.activity_blocks || []
      blocks.forEach(block => {
        if (!block.activityType || !block.startKP || !block.endKP) return
        
        const key = `${report.spread || 'Unknown'}-${block.activityType}`
        const startM = parseKP(block.startKP)
        const endM = parseKP(block.endKP)
        const metres = (startM !== null && endM !== null) ? Math.abs(endM - startM) : 0

        if (!inspectorTotals[key]) {
          inspectorTotals[key] = 0
          reportsByKey[key] = []
        }
        inspectorTotals[key] += metres
        reportsByKey[key].push({
          date: report.date,
          inspector: report.inspector_name,
          startKP: block.startKP,
          endKP: block.endKP,
          metres,
          contractor: block.contractor,
          foreman: block.foreman
        })
      })
    })

    // Mock contractor claims - in production, this would come from a contractor_claims table
    // For demo purposes, contractor claims are inflated 10-25% above inspector totals
    const mockContractorClaims = {}
    Object.keys(inspectorTotals).forEach(key => {
      const inflation = 1 + (Math.random() * 0.15 + 0.10) // 10-25% inflation
      mockContractorClaims[key] = Math.round(inspectorTotals[key] * inflation)
    })

    // Build comparison rows
    const rows = Object.keys(inspectorTotals).map(key => {
      const inspector = inspectorTotals[key]
      const contractor = mockContractorClaims[key] || inspector
      const variance = contractor - inspector
      const variancePct = inspector > 0 ? ((variance / inspector) * 100) : 0

      return {
        key,
        spread: key.split('-')[0],
        activity: key.split('-').slice(1).join('-'),
        inspector,
        contractor,
        variance,
        variancePct: variancePct.toFixed(1),
        reports: reportsByKey[key] || []
      }
    }).sort((a, b) => b.variance - a.variance) // Sort by largest variance

    setData(rows)
    setDrillDownData(reportsByKey)
    setLoading(false)
  }

  // Parse KP string to metres
  function parseKP(kpStr) {
    if (!kpStr) return null
    const str = String(kpStr).trim()
    if (str.includes('+')) {
      const [km, m] = str.split('+')
      return (parseFloat(km) || 0) * 1000 + (parseFloat(m) || 0)
    }
    const num = parseFloat(str)
    if (isNaN(num)) return null
    return num < 100 ? num * 1000 : num
  }

  // Calculate totals
  const totalInspector = data.reduce((sum, r) => sum + r.inspector, 0)
  const totalContractor = data.reduce((sum, r) => sum + r.contractor, 0)
  const totalVariance = data.reduce((sum, r) => sum + r.variance, 0)
  const avgCostPerMetre = 800 // Rough estimate - make configurable later
  const potentialSavings = totalVariance * avgCostPerMetre

  // Count high-variance items (>10%)
  const highVarianceCount = data.filter(r => parseFloat(r.variancePct) > 10).length

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-blue-900 text-white py-6 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{PROJECT_NAME}</h1>
            <p className="text-blue-200">Owner vs Contractor Reconciliation</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg transition"
          >
            ← Back to Inspector Report
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
            <p className="text-sm text-gray-500 uppercase">Inspector Total</p>
            <p className="text-3xl font-bold text-gray-800">{totalInspector.toLocaleString()} m</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500 uppercase">Contractor Claims</p>
            <p className="text-3xl font-bold text-gray-800">{totalContractor.toLocaleString()} m</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <p className="text-sm text-gray-500 uppercase">Total Variance</p>
            <p className="text-3xl font-bold text-red-600">+{totalVariance.toLocaleString()} m</p>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-6 border-2 border-red-500">
            <p className="text-sm text-red-600 uppercase font-medium">Potential Over-Billing</p>
            <p className="text-3xl font-bold text-red-600">${(potentialSavings / 1000).toFixed(0)}k</p>
            <p className="text-xs text-gray-500 mt-1">@ ${avgCostPerMetre}/m average</p>
          </div>
        </div>

        {/* Alert Banner */}
        {highVarianceCount > 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex items-center">
              <span className="text-2xl mr-3">⚠️</span>
              <div>
                <p className="font-bold text-yellow-800">
                  {highVarianceCount} item{highVarianceCount > 1 ? 's' : ''} with variance &gt;10%
                </p>
                <p className="text-yellow-700 text-sm">Review highlighted rows below for potential billing discrepancies</p>
              </div>
            </div>
          </div>
        )}

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="p-4 text-left">Spread</th>
                <th className="p-4 text-left">Activity</th>
                <th className="p-4 text-right">Inspector (m)</th>
                <th className="p-4 text-right">Contractor Claim (m)</th>
                <th className="p-4 text-right">Variance (m)</th>
                <th className="p-4 text-right">Variance %</th>
                <th className="p-4 text-center">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">
                    Loading data...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">
                    No data found. Save some inspector reports first.
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                  <>
                    <tr 
                      key={row.key} 
                      className={`border-b ${parseFloat(row.variancePct) > 10 ? 'bg-red-50' : i % 2 === 0 ? 'bg-gray-50' : ''}`}
                    >
                      <td className="p-4 font-medium">{row.spread}</td>
                      <td className="p-4">{row.activity}</td>
                      <td className="p-4 text-right font-mono">{row.inspector.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono">{row.contractor.toLocaleString()}</td>
                      <td className={`p-4 text-right font-mono font-bold ${row.variance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {row.variance > 0 ? '+' : ''}{row.variance.toLocaleString()}
                      </td>
                      <td className={`p-4 text-right font-bold ${parseFloat(row.variancePct) > 10 ? 'text-red-600' : parseFloat(row.variancePct) > 5 ? 'text-yellow-600' : 'text-gray-600'}`}>
                        {row.variancePct}%
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setExpandedRow(expandedRow === row.key ? null : row.key)}
                          className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm"
                        >
                          {expandedRow === row.key ? 'Hide' : 'Drill Down'}
                        </button>
                      </td>
                    </tr>
                    {expandedRow === row.key && (
                      <tr key={`${row.key}-expanded`}>
                        <td colSpan="7" className="bg-blue-50 p-4">
                          <div className="text-sm font-bold text-gray-700 mb-2">
                            Daily Report Breakdown ({row.reports.length} entries)
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-600">
                                <th className="p-2">Date</th>
                                <th className="p-2">Inspector</th>
                                <th className="p-2">Contractor</th>
                                <th className="p-2">Foreman</th>
                                <th className="p-2">From KP</th>
                                <th className="p-2">To KP</th>
                                <th className="p-2 text-right">Metres</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.reports.map((r, idx) => (
                                <tr key={idx} className="border-t border-blue-200">
                                  <td className="p-2">{r.date}</td>
                                  <td className="p-2">{r.inspector}</td>
                                  <td className="p-2">{r.contractor}</td>
                                  <td className="p-2">{r.foreman}</td>
                                  <td className="p-2 font-mono">{r.startKP}</td>
                                  <td className="p-2 font-mono">{r.endKP}</td>
                                  <td className="p-2 text-right font-mono font-bold">{r.metres.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center text-gray-500 text-sm">
          <p>⚠️ Contractor claims shown are simulated for demo purposes.</p>
          <p>In production, connect to contractor billing system or import claim data.</p>
        </div>
      </div>
    </div>
  )
}
