import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Cell, ReferenceLine, PieChart, Pie
} from 'recharts'
import { supabase } from './supabase'
import { useOrgQuery } from './utils/queryHelpers.js'
import { calculateVAAC, aggregateValueLostByParty } from './shadowAuditUtils.js'
import { MetricInfoIcon, MetricIntegrityModal, useMetricIntegrityModal } from './components/MetricIntegrityInfo.jsx'

// ============================================================================
// EARNED VALUE MANAGEMENT (EVM) EXECUTIVE DASHBOARD
// Eagle Mountain - Woodfibre Gas Pipeline (EGP) Project
// FortisBC | NPS 24 | 47km Mainline + 9km TBM Tunnel
// ============================================================================

const EVMColors = {
  EV: '#28a745',
  PV: '#007bff',
  AC: '#dc3545',
  VAAC: '#6f42c1',  // Value-Adjusted Actual Cost (purple - shadow line)
  variance: { positive: '#28a745', negative: '#dc3545', neutral: '#6c757d' },
  gauge: { excellent: '#28a745', good: '#7cb342', warning: '#ffc107', danger: '#dc3545' },
  phases: {
    'Clearing': '#8B4513',
    'Grading': '#D2691E',
    'Stringing': '#4169E1',
    'Welding': '#FF6347',
    'Coating': '#32CD32',
    'Lowering': '#9932CC',
    'Backfill': '#FFD700',
    'Cleanup': '#20B2AA',
    'HDD': '#FF8C00',
    'Tunnel': '#4B0082'
  }
}

function getIndexColor(value) {
  if (value >= 1.0) return EVMColors.gauge.excellent
  if (value >= 0.90) return EVMColors.gauge.warning
  return EVMColors.gauge.danger
}

function getIndexStatus(value) {
  if (value >= 1.0) return 'On Track'
  if (value >= 0.90) return 'Monitor'
  return 'At Risk'
}

// ============================================================================
// EGP PROJECT CONFIGURATION - Real Project Data
// ============================================================================
const EGP_PROJECT = {
  name: 'FortisBC EGP Project',
  fullName: 'Eagle Mountain - Woodfibre Gas Pipeline',
  client: 'FortisBC Energy Inc.',
  contractor: 'SA Energy Group (Somerville Aecon JV)',
  totalBudget: 400000000, // $400M total project
  mainlineBudget: 280000000, // $280M mainline
  tunnelBudget: 95000000, // $95M tunnel
  facilitiesBudget: 25000000, // $25M facilities
  baselineStart: '2025-07-01',
  baselineFinish: '2026-06-30',
  totalLength: 56000, // 56km total
  mainlineLength: 47000, // 47km mainline
  tunnelLength: 9000, // 9km tunnel
  pipeSpec: 'NPS 24 x 0.500" WT, Grade X70',
  peakWorkforce: 650,
  
  // Key Locations
  keyPoints: [
    { kp: '0+000', name: 'Coquitlam Station', type: 'Start' },
    { kp: '9+250', name: 'CN Rail Crossing (HDD)', type: 'Crossing' },
    { kp: '12+100', name: 'Highway 99 Crossing', type: 'Crossing' },
    { kp: '19+400', name: 'Indian River HDD', type: 'Crossing' },
    { kp: '24+000', name: 'MLV-1 Block Valve', type: 'Facility' },
    { kp: '35+200', name: 'Mamquam River HDD', type: 'Crossing' },
    { kp: '47+000', name: 'Tunnel Portal South', type: 'Facility' },
    { kp: '56+000', name: 'Woodfibre LNG Terminal', type: 'End' }
  ],
  
  // Environmental Constraints
  envConstraints: [
    { name: 'Coastal Tailed Frog Habitat', kpFrom: '15+000', kpTo: '25+000', restriction: 'Limited clearing Oct-Apr' },
    { name: 'Salmon Fish Window', kpFrom: '19+000', kpTo: '20+500', restriction: 'No in-stream work Aug 15 - Nov 15' },
    { name: 'Indian River Watershed', kpFrom: '18+000', kpTo: '22+000', restriction: 'Enhanced erosion controls' }
  ]
}

// ============================================================================
// DEMO DATA - 6 Month Project Simulation
// ============================================================================
function generateEGPDemoData(asOfDate) {
  const projectStart = new Date(EGP_PROJECT.baselineStart)
  const projectEnd = new Date(EGP_PROJECT.baselineFinish)
  const currentDate = new Date(asOfDate)
  
  const totalDays = Math.floor((projectEnd - projectStart) / (1000 * 60 * 60 * 24))
  const daysElapsed = Math.max(0, Math.floor((currentDate - projectStart) / (1000 * 60 * 60 * 24)))
  const percentElapsed = Math.min((daysElapsed / totalDays) * 100, 100)
  
  // S-Curve progression factor
  const sCurveFactor = 1 / (1 + Math.exp(-0.02 * (daysElapsed - totalDays * 0.45)))
  
  // Simulate realistic scenario: Started strong, hit weather delays month 3, recovering
  let performanceFactor = 0.94 // Slightly behind overall
  let costFactor = 0.97 // Slightly under budget
  
  // Monthly adjustments based on typical construction patterns
  const monthNumber = Math.floor(daysElapsed / 30)
  const monthlyFactors = [
    { spi: 1.05, cpi: 1.02 },  // Month 1: Strong start, mobilization complete
    { spi: 1.02, cpi: 1.01 },  // Month 2: Good progress
    { spi: 0.88, cpi: 0.96 },  // Month 3: Rock encountered, weather delays
    { spi: 0.92, cpi: 0.98 },  // Month 4: Recovery begins
    { spi: 0.96, cpi: 1.00 },  // Month 5: Added crews, catching up
    { spi: 0.94, cpi: 0.99 }   // Month 6: Final push
  ]
  
  const currentMonth = monthlyFactors[Math.min(monthNumber, 5)]
  
  // Phase-by-phase data
  const phases = [
    { 
      name: 'Clearing', 
      budgetPercent: 4, 
      plannedPercent: Math.min(percentElapsed * 1.3, 100),
      actualPercent: Math.min(percentElapsed * 1.3 * 0.98, 100),
      rate: '800-1,200 m/day',
      unitCost: '$45/m'
    },
    { 
      name: 'Grading', 
      budgetPercent: 8, 
      plannedPercent: Math.min(percentElapsed * 1.2, 100),
      actualPercent: Math.min(percentElapsed * 1.2 * 0.95, 100),
      rate: '600-900 m/day',
      unitCost: '$85/m'
    },
    { 
      name: 'Stringing', 
      budgetPercent: 6, 
      plannedPercent: Math.min(percentElapsed * 1.1, 95),
      actualPercent: Math.min(percentElapsed * 1.1 * 0.92, 92),
      rate: '2,000-3,000 m/day',
      unitCost: '$35/m'
    },
    { 
      name: 'Welding', 
      budgetPercent: 22, 
      plannedPercent: Math.min(percentElapsed * 1.0, 85),
      actualPercent: Math.min(percentElapsed * 1.0 * 0.91, 78),
      rate: '400-600 m/day',
      unitCost: '$285/m'
    },
    { 
      name: 'Coating', 
      budgetPercent: 8, 
      plannedPercent: Math.min(percentElapsed * 0.95, 75),
      actualPercent: Math.min(percentElapsed * 0.95 * 0.93, 70),
      rate: '500-800 m/day',
      unitCost: '$95/m'
    },
    { 
      name: 'Lowering', 
      budgetPercent: 12, 
      plannedPercent: Math.min(percentElapsed * 0.85, 65),
      actualPercent: Math.min(percentElapsed * 0.85 * 0.90, 58),
      rate: '800-1,200 m/day',
      unitCost: '$145/m'
    },
    { 
      name: 'Backfill', 
      budgetPercent: 10, 
      plannedPercent: Math.min(percentElapsed * 0.75, 55),
      actualPercent: Math.min(percentElapsed * 0.75 * 0.92, 50),
      rate: '1,000-1,500 m/day',
      unitCost: '$75/m'
    },
    { 
      name: 'HDD Crossings', 
      budgetPercent: 12, 
      plannedPercent: Math.min(percentElapsed * 0.9, 70),
      actualPercent: Math.min(percentElapsed * 0.9 * 0.88, 62),
      rate: '50-150 m/day',
      unitCost: '$1,250/m'
    },
    { 
      name: 'Tunnel (TBM)', 
      budgetPercent: 15, 
      plannedPercent: Math.min(percentElapsed * 0.7, 50),
      actualPercent: Math.min(percentElapsed * 0.7 * 0.85, 42),
      rate: '15-25 m/day',
      unitCost: '$2,850/m'
    },
    { 
      name: 'Cleanup/Reclamation', 
      budgetPercent: 3, 
      plannedPercent: Math.min(percentElapsed * 0.5, 30),
      actualPercent: Math.min(percentElapsed * 0.5 * 0.95, 28),
      rate: '500-800 m/day',
      unitCost: '$25/m'
    }
  ]
  
  // Crew/Spread data
  const spreads = [
    {
      name: 'Spread 1 - Mainline North',
      foreman: 'Brad Whitworth',
      kpRange: '0+000 to 20+000',
      metresComplete: Math.floor(18500 * (daysElapsed / totalDays) * 0.92),
      metresTarget: Math.floor(20000 * (daysElapsed / totalDays)),
      spi: 0.93,
      cpi: 0.98,
      labourCount: 145,
      equipmentUnits: 42,
      welders: 24,
      status: 'On Track'
    },
    {
      name: 'Spread 2 - Mainline South',
      foreman: 'Gary Nelson',
      kpRange: '20+000 to 40+000',
      metresComplete: Math.floor(17200 * (daysElapsed / totalDays) * 0.89),
      metresTarget: Math.floor(20000 * (daysElapsed / totalDays)),
      spi: 0.88,
      cpi: 0.95,
      labourCount: 158,
      equipmentUnits: 48,
      welders: 28,
      status: 'Monitor - Rock delays'
    },
    {
      name: 'Spread 3 - Portal & Crossings',
      foreman: 'Mike Thompson',
      kpRange: '40+000 to 47+000 + HDDs',
      metresComplete: Math.floor(5800 * (daysElapsed / totalDays) * 0.95),
      metresTarget: Math.floor(7000 * (daysElapsed / totalDays)),
      spi: 0.96,
      cpi: 1.02,
      labourCount: 92,
      equipmentUnits: 28,
      welders: 12,
      status: 'On Track'
    },
    {
      name: 'TBM Tunnel Crew',
      foreman: 'James Wilson (Herrenknecht)',
      kpRange: 'Tunnel KP 47 to 56',
      metresComplete: Math.floor(3200 * (daysElapsed / totalDays) * 0.85),
      metresTarget: Math.floor(4000 * (daysElapsed / totalDays)),
      spi: 0.82,
      cpi: 0.94,
      labourCount: 85,
      equipmentUnits: 15,
      welders: 0,
      status: 'At Risk - Ground conditions'
    }
  ]
  
  // Calculate overall metrics
  const BAC = EGP_PROJECT.totalBudget
  const plannedPhysical = percentElapsed * sCurveFactor
  const actualPhysical = plannedPhysical * currentMonth.spi
  
  const PV = BAC * (plannedPhysical / 100)
  const EV = BAC * (actualPhysical / 100)
  const AC = EV / currentMonth.cpi
  
  const CV = EV - AC
  const SV = EV - PV
  const CPI = currentMonth.cpi
  const SPI = currentMonth.spi
  const EAC = CPI > 0 ? BAC / CPI : BAC
  const ETC = EAC - AC
  const VAC = BAC - EAC
  const TCPI = (BAC - AC) > 0 ? (BAC - EV) / (BAC - AC) : 1
  
  const dailyPV = daysElapsed > 0 ? PV / daysElapsed : BAC / totalDays
  const daysBehind = SV < 0 ? Math.round(Math.abs(SV) / dailyPV) : -Math.round(Math.abs(SV) / dailyPV)
  
  // Monthly trends
  const monthlyTrends = []
  for (let m = 0; m <= monthNumber && m < 6; m++) {
    const mf = monthlyFactors[m]
    monthlyTrends.push({
      month: ['Jul 2025', 'Aug 2025', 'Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025'][m],
      SPI: mf.spi,
      CPI: mf.cpi,
      labourHours: 85000 + (m * 12000) + (Math.random() * 5000),
      equipmentHours: 42000 + (m * 8000) + (Math.random() * 3000),
      metresInstalled: 4500 + (m * 2200) + (Math.random() * 800),
      status: mf.spi >= 1.0 ? 'green' : mf.spi >= 0.9 ? 'amber' : 'red'
    })
  }
  
  return {
    metrics: {
      BAC, PV, EV, AC, CV, SV, CPI, SPI, EAC, ETC, VAC, TCPI,
      percentPhysical: actualPhysical,
      percentSpent: (AC / BAC) * 100,
      percentScheduled: percentElapsed,
      dailyPV,
      daysBehind,
      daysElapsed,
      totalDays
    },
    phases,
    spreads,
    monthlyTrends,
    monthNumber
  }
}

// Generate S-Curve data with VAAC (Value-Adjusted Actual Cost)
// VAAC shows what the project SHOULD have cost with 100% management efficiency
function generateSCurveData(asOfDate) {
  const data = []
  const start = new Date(EGP_PROJECT.baselineStart)
  const end = new Date(asOfDate)
  const BAC = EGP_PROJECT.totalBudget
  const totalDays = 365

  let current = new Date(start)
  let weekNum = 0
  let cumulativeValueLost = 0

  while (current <= end && weekNum < 52) {
    const daysElapsed = Math.floor((current - start) / (1000 * 60 * 60 * 24))
    const sCurveFactor = 1 / (1 + Math.exp(-0.02 * (daysElapsed - totalDays * 0.45)))

    // Add some realistic variance
    const spiVariance = 0.88 + (Math.random() * 0.16) // 0.88 to 1.04
    const cpiVariance = 0.94 + (Math.random() * 0.10) // 0.94 to 1.04

    const AC = BAC * sCurveFactor * spiVariance / cpiVariance

    // Simulate cumulative value lost (inefficiency gap)
    // Realistic: 3-8% of weekly spend is lost to management drag
    const weeklySpend = weekNum > 0 ? AC - (data[weekNum - 1]?.AC || 0) : AC
    const inefficiencyRate = 0.03 + (Math.random() * 0.05) // 3-8%
    cumulativeValueLost += weeklySpend * inefficiencyRate

    // VAAC = Actual Cost - Value Lost (what it SHOULD have cost)
    const VAAC = calculateVAAC(AC, cumulativeValueLost)

    data.push({
      date: current.toISOString().split('T')[0],
      displayDate: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      week: `W${weekNum + 1}`,
      PV: BAC * sCurveFactor,
      EV: BAC * sCurveFactor * spiVariance,
      AC,
      VAAC,
      valueLost: cumulativeValueLost,
      efficiencyGap: AC - VAAC  // Visual gap between AC and VAAC
    })

    current.setDate(current.getDate() + 7)
    weekNum++
  }

  return data
}

// Health Assessment
function generateHealthAssessment(metrics) {
  const { SPI, CPI, VAC, SV, daysBehind } = metrics
  
  const issues = []
  const recommendations = []
  let status = 'GREEN'
  let title = 'Project Performing Well'

  if (SPI < 0.90) {
    status = 'RED'
    title = 'Immediate Attention Required'
    issues.push('Critical schedule slippage - TBM tunnel and Spread 2 behind plan')
    recommendations.push('Evaluate TBM ground support requirements and advance rates')
    recommendations.push('Add second welding crew to Spread 2 to recover mainline schedule')
    recommendations.push('Review rock excavation methods - consider controlled blasting')
  } else if (SPI < 1.0) {
    if (status !== 'RED') {
      status = 'AMBER'
      title = 'Requires Monitoring'
    }
    issues.push('Schedule variance detected in Spread 2 and Tunnel operations')
    recommendations.push('Monitor TBM advance rates - current 18m/day vs planned 22m/day')
    recommendations.push('Spread 2 rock delays impacting welding schedule - evaluate added resources')
    recommendations.push('Review fish window restrictions for Indian River HDD timing')
  }

  if (CPI < 0.90) {
    status = 'RED'
    title = 'Immediate Attention Required'
    issues.push('Significant cost overrun detected')
    recommendations.push('Conduct variance analysis on TBM operations')
    recommendations.push('Review subcontractor productivity vs contracted rates')
  } else if (CPI < 1.0) {
    if (status === 'GREEN') {
      status = 'AMBER'
      title = 'Requires Monitoring'
    }
    recommendations.push('Monitor equipment utilization on Spread 2 - idle time increasing')
    recommendations.push('Ensure accurate cost coding for rock excavation extras')
  }

  if (SPI >= 1.0 && CPI >= 1.0) {
    recommendations.push('Maintain current production rates and crew configurations')
    recommendations.push('Continue proactive risk management for environmental windows')
    recommendations.push('Document lessons learned for tunnel operations')
  }

  return { status, title, issues, recommendations,
    summary: issues.length > 0 ? issues.join('. ') + '.' : 'Project metrics within acceptable parameters. Continue monitoring TBM advance rates.'
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
function EVMDashboard() {
  const navigate = useNavigate()
  const { addOrgFilter } = useOrgQuery()
  const [loading, setLoading] = useState(true)
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
  const [activeTab, setActiveTab] = useState('overview')
  const [dragMetrics, setDragMetrics] = useState(null)

  // Metric Integrity Info modal
  const metricInfoModal = useMetricIntegrityModal()

  useEffect(() => {
    // Simulate loading
    setTimeout(() => setLoading(false), 500)
  }, [])

  // Fetch Efficiency Audit data for drag cost analysis
  useEffect(() => {
    async function fetchDragMetrics() {
      try {
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        const { data: reports, error } = await addOrgFilter(
          supabase
            .from('daily_reports')
            .select('date, spread, activity_blocks')
            .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        ).lte('date', asOfDate)

        if (error) {
          console.error('Error fetching drag metrics:', error)
          return
        }

        // Aggregate shadow audit data
        let totalBilledHours = 0
        let totalShadowHours = 0
        let totalValueLost = 0
        let systemicCount = 0
        let assetCount = 0
        const reasonBreakdown = {}
        const allBlocks = []

        for (const report of reports || []) {
          const blocks = report.activity_blocks || []
          for (const block of blocks) {
            allBlocks.push(block)
            const summary = block.shadowAuditSummary
            if (summary) {
              totalBilledHours += summary.totalBilledHours || 0
              totalShadowHours += summary.totalShadowHours || 0
              totalValueLost += summary.totalValueLost || 0

              if (summary.delayType === 'SYSTEMIC') {
                systemicCount++
                const reason = summary.systemicDelay?.reason || 'unspecified'
                reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + (summary.totalValueLost || 0)
              } else if (summary.delayType === 'ASSET_SPECIFIC') {
                assetCount++
              }
            }
          }
        }

        // Calculate value lost by responsible party (Owner vs Contractor vs Neutral)
        const partyBreakdown = aggregateValueLostByParty(allBlocks, {}, {})

        const inertiaRatio = totalBilledHours > 0 ? (totalShadowHours / totalBilledHours) * 100 : 100
        const dragRate = totalBilledHours > 0 ? ((totalBilledHours - totalShadowHours) / totalBilledHours) * 100 : 0

        setDragMetrics({
          totalBilledHours,
          totalShadowHours,
          totalValueLost,
          inertiaRatio,
          dragRate,
          systemicCount,
          assetCount,
          reasonBreakdown,
          partyBreakdown,
          reportCount: reports?.length || 0
        })
      } catch (err) {
        console.error('Error in fetchDragMetrics:', err)
      }
    }

    fetchDragMetrics()
  }, [asOfDate])

  const demoData = useMemo(() => generateEGPDemoData(asOfDate), [asOfDate])
  const sCurveData = useMemo(() => generateSCurveData(asOfDate), [asOfDate])
  const healthAssessment = useMemo(() => generateHealthAssessment(demoData.metrics), [demoData.metrics])

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Loading EVM Dashboard...</h2>
        <p>Eagle Mountain - Woodfibre Gas Pipeline</p>
      </div>
    )
  }

  const { metrics, phases, spreads, monthlyTrends } = demoData

  return (
    <div style={{ padding: '20px', maxWidth: '1800px', margin: '0 auto', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', fontSize: '14px', marginBottom: '10px' }}>
          ← Back to Dashboard
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h1 style={{ margin: '0 0 5px 0', fontSize: '26px', color: '#1a237e' }}>
              📊 Earned Value Management Dashboard
            </h1>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
              <strong>{EGP_PROJECT.name}</strong> | {EGP_PROJECT.fullName}
            </p>
            <p style={{ margin: '5px 0 0', color: '#888', fontSize: '12px' }}>
              {EGP_PROJECT.client} | {EGP_PROJECT.contractor} | {EGP_PROJECT.pipeSpec}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#666' }}>Project Length</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{(EGP_PROJECT.totalLength / 1000).toFixed(0)} km</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#666' }}>Budget (BAC)</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>${(EGP_PROJECT.totalBudget / 1000000).toFixed(0)}M</div>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block' }}>Data as of:</label>
              <input 
                type="date" 
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                min={EGP_PROJECT.baselineStart}
                max={EGP_PROJECT.baselineFinish}
                style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ marginBottom: '20px', borderBottom: '2px solid #ddd' }}>
        <div style={{ display: 'flex', gap: '5px' }}>
          {[
            { id: 'overview', label: '📈 Overview', icon: '' },
            { id: 'phases', label: '🔧 Phases', icon: '' },
            { id: 'crews', label: '👷 Crews/Spreads', icon: '' },
            { id: 'trends', label: '📊 Trends', icon: '' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderBottom: activeTab === tab.id ? '3px solid #1a237e' : '3px solid transparent',
                backgroundColor: activeTab === tab.id ? 'white' : 'transparent',
                color: activeTab === tab.id ? '#1a237e' : '#666',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                cursor: 'pointer',
                fontSize: '14px',
                borderRadius: '4px 4px 0 0',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab metrics={metrics} sCurveData={sCurveData} healthAssessment={healthAssessment} dragMetrics={dragMetrics} metricInfoModal={metricInfoModal} />
      )}
      {activeTab === 'phases' && (
        <PhasesTab phases={phases} />
      )}
      {activeTab === 'crews' && (
        <CrewsTab spreads={spreads} />
      )}
      {activeTab === 'trends' && (
        <TrendsTab monthlyTrends={monthlyTrends} />
      )}

      {/* Footer */}
      <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '11px', color: '#999', padding: '15px', borderTop: '1px solid #ddd' }}>
        <p style={{ margin: 0 }}>Generated by <strong>Pipe-Up</strong> | Data as of {asOfDate} | {EGP_PROJECT.name}</p>
        <p style={{ margin: '5px 0 0' }}>Demo Data - For Demonstration Purposes</p>
      </div>

      {/* Metric Integrity Info Modal */}
      <MetricIntegrityModal isOpen={metricInfoModal.isOpen} onClose={metricInfoModal.close} />
    </div>
  )
}

// ============================================================================
// TAB COMPONENTS
// ============================================================================

function OverviewTab({ metrics, sCurveData, healthAssessment, dragMetrics, metricInfoModal }) {
  return (
    <>
      {/* Core EVM Metrics */}
      <div style={{ backgroundColor: '#1a237e', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        CORE EARNED VALUE METRICS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px' }}>
          <KPICard title="Earned Value (EV)" value={metrics.EV} subtitle="BCWP - Value of work completed" color={EVMColors.EV} />
          <KPICard title="Planned Value (PV)" value={metrics.PV} subtitle="BCWS - Scheduled value to date" color={EVMColors.PV} />
          <KPICard title="Actual Cost (AC)" value={metrics.AC} subtitle="ACWP - Actual expenditure" color={EVMColors.AC} />
          <KPICard title="Cost Variance (CV)" value={metrics.CV} subtitle={metrics.CV >= 0 ? "✓ Under Budget" : "⚠ Over Budget"} isVariance />
          <KPICard title="Schedule Variance (SV)" value={metrics.SV} subtitle={metrics.SV >= 0 ? "✓ Ahead of Schedule" : "⚠ Behind Schedule"} isVariance />
        </div>
      </div>

      {/* Performance Indices */}
      <div style={{ backgroundColor: '#00695c', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        PERFORMANCE INDICES & FORECASTS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '15px' }}>
          <PerformanceGauge label="Cost Performance Index (CPI)" value={metrics.CPI} />
          <PerformanceGauge label="Schedule Performance Index (SPI)" value={metrics.SPI} />
          <DaysBehindCard daysBehind={metrics.daysBehind} sv={metrics.SV} dailyPV={metrics.dailyPV} />
          <EACCard eac={metrics.EAC} bac={metrics.BAC} vac={metrics.VAC} />
          <KPICard title="Estimate to Complete" value={metrics.ETC} subtitle="Remaining forecast spend" />
          <KPICard title="Variance at Completion" value={metrics.VAC} subtitle={metrics.VAC >= 0 ? "Projected savings" : "Projected overrun"} isVariance />
          <KPICard title="To-Complete PI (TCPI)" value={metrics.TCPI} format="index" subtitle="Required future efficiency" />
        </div>
      </div>

      {/* Value Leakage Analysis - Efficiency Audit Integration */}
      <>
        <div style={{ backgroundColor: '#6a1b9a', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
          💸 VALUE LEAKAGE ANALYSIS (Efficiency Audit)
        </div>
        {(!dragMetrics || dragMetrics.totalBilledHours === 0) ? (
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📊</div>
            <h3 style={{ margin: '0 0 10px 0', color: '#666' }}>No Efficiency Audit Data Available</h3>
            <p style={{ color: '#999', fontSize: '14px', margin: 0 }}>
              Shadow audit data will appear here once inspectors submit reports with production status tracking.<br/>
              This section shows value lost to inefficiency, drag rates, and CPI impact analysis.
            </p>
          </div>
        ) : (
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px', marginBottom: '20px' }}>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef', borderLeft: '4px solid #dc3545' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Total Drag Cost</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc3545' }}>
                  {formatCurrency(dragMetrics.totalValueLost)}
                </div>
                <div style={{ fontSize: '11px', color: '#999' }}>Value lost to inefficiency</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef', borderLeft: '4px solid #6a1b9a' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Drag Rate</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: dragMetrics.dragRate > 10 ? '#dc3545' : dragMetrics.dragRate > 5 ? '#ffc107' : '#28a745' }}>
                  {dragMetrics.dragRate.toFixed(1)}%
                </div>
                <div style={{ fontSize: '11px', color: '#999' }}>% of billed hours unproductive</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef', borderLeft: `4px solid ${dragMetrics.inertiaRatio >= 90 ? '#28a745' : dragMetrics.inertiaRatio >= 70 ? '#ffc107' : '#dc3545'}` }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Inertia Ratio</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: dragMetrics.inertiaRatio >= 90 ? '#28a745' : dragMetrics.inertiaRatio >= 70 ? '#ffc107' : '#dc3545' }}>
                  {dragMetrics.inertiaRatio.toFixed(1)}%
                </div>
                <div style={{ fontSize: '11px', color: '#999' }}>Productive efficiency</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef', borderLeft: '4px solid #dc3545' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Systemic Delays</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: dragMetrics.systemicCount > 0 ? '#dc3545' : '#28a745' }}>
                  {dragMetrics.systemicCount}
                </div>
                <div style={{ fontSize: '11px', color: '#999' }}>Crew-wide stoppages</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef', borderLeft: '4px solid #ffc107' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Asset Delays</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ffc107' }}>
                  {dragMetrics.assetCount}
                </div>
                <div style={{ fontSize: '11px', color: '#999' }}>Individual equipment issues</div>
              </div>
            </div>

            {/* CPI Impact Analysis */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div style={{ padding: '15px', backgroundColor: '#fff5f5', borderRadius: '8px', border: '1px solid #f8d7da' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#721c24' }}>CPI Impact from Drag</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Reported CPI</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: getIndexColor(metrics.CPI) }}>{metrics.CPI.toFixed(2)}</div>
                  </div>
                  <div style={{ fontSize: '24px', color: '#666' }}>→</div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#666' }}>True CPI (excl. drag)</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: getIndexColor(metrics.CPI * (100 / dragMetrics.inertiaRatio)) }}>
                      {(metrics.CPI * (100 / dragMetrics.inertiaRatio)).toFixed(2)}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#856404', marginTop: '10px', padding: '8px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                  If drag costs were eliminated, CPI would improve by {((metrics.CPI * (100 / dragMetrics.inertiaRatio)) - metrics.CPI).toFixed(2)} points
                </div>
              </div>

              <div style={{ padding: '15px', backgroundColor: '#f8f5fc', borderRadius: '8px', border: '1px solid #e2d5f1' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#6a1b9a' }}>Top Drag Sources</h4>
                {Object.keys(dragMetrics.reasonBreakdown).length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>No systemic delays recorded</div>
                ) : (
                  Object.entries(dragMetrics.reasonBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([reason, value]) => (
                      <div key={reason} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #eee' }}>
                        <span style={{ fontSize: '12px', textTransform: 'capitalize' }}>{reason.replace(/_/g, ' ')}</span>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#dc3545' }}>{formatCurrency(value)}</span>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Responsibility Breakdown - Owner vs Contractor vs Neutral */}
            {dragMetrics.partyBreakdown && dragMetrics.totalValueLost > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                  <h4 style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#0369a1' }}>🔧 Accountability Breakdown</h4>
                  <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start' }}>
                    {/* Owner */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        width: '60px', height: '60px', borderRadius: '50%',
                        backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', margin: '0 auto 8px', color: 'white', fontSize: '24px'
                      }}>🏢</div>
                      <div style={{ fontSize: '11px', color: '#666', fontWeight: '600' }}>OWNER</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#3b82f6' }}>
                        {formatCurrency(dragMetrics.partyBreakdown.owner)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#666' }}>
                        {dragMetrics.totalValueLost > 0 ? ((dragMetrics.partyBreakdown.owner / dragMetrics.totalValueLost) * 100).toFixed(0) : 0}%
                      </div>
                    </div>
                    {/* Contractor */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        width: '60px', height: '60px', borderRadius: '50%',
                        backgroundColor: '#ef4444', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', margin: '0 auto 8px', color: 'white', fontSize: '24px'
                      }}>🔧</div>
                      <div style={{ fontSize: '11px', color: '#666', fontWeight: '600' }}>CONTRACTOR</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>
                        {formatCurrency(dragMetrics.partyBreakdown.contractor)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#666' }}>
                        {dragMetrics.totalValueLost > 0 ? ((dragMetrics.partyBreakdown.contractor / dragMetrics.totalValueLost) * 100).toFixed(0) : 0}%
                      </div>
                    </div>
                    {/* Neutral */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        width: '60px', height: '60px', borderRadius: '50%',
                        backgroundColor: '#6b7280', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', margin: '0 auto 8px', color: 'white', fontSize: '24px'
                      }}>🌩️</div>
                      <div style={{ fontSize: '11px', color: '#666', fontWeight: '600' }}>ACT OF GOD</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#6b7280' }}>
                        {formatCurrency(dragMetrics.partyBreakdown.neutral)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#666' }}>
                        {dragMetrics.totalValueLost > 0 ? ((dragMetrics.partyBreakdown.neutral / dragMetrics.totalValueLost) * 100).toFixed(0) : 0}%
                      </div>
                    </div>
                    {/* Unattributed */}
                    {(() => {
                      const unattributed = dragMetrics.totalValueLost - (dragMetrics.partyBreakdown.owner + dragMetrics.partyBreakdown.contractor + dragMetrics.partyBreakdown.neutral)
                      if (unattributed <= 0) return null
                      return (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{
                            width: '60px', height: '60px', borderRadius: '50%',
                            backgroundColor: '#9ca3af', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', margin: '0 auto 8px', color: 'white', fontSize: '24px'
                          }}>❓</div>
                          <div style={{ fontSize: '11px', color: '#666', fontWeight: '600' }}>UNATTRIBUTED</div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#9ca3af' }}>
                            {formatCurrency(unattributed)}
                          </div>
                          <div style={{ fontSize: '10px', color: '#666' }}>
                            {dragMetrics.totalValueLost > 0 ? ((unattributed / dragMetrics.totalValueLost) * 100).toFixed(0) : 0}%
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                <div style={{ padding: '15px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#991b1b' }}>💰 Contractor Drag Summary</h4>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ef4444', marginBottom: '8px' }}>
                    {formatCurrency(dragMetrics.partyBreakdown.contractor)}
                  </div>
                  <p style={{ fontSize: '11px', color: '#666', margin: '0 0 10px 0' }}>
                    Value lost to contractor-caused delays (mechanical breakdown, supervisory latency, ROW congestion, etc.)
                  </p>
                  {dragMetrics.partyBreakdown.contractor > 0 ? (
                    <div style={{ padding: '8px', backgroundColor: '#fef3c7', borderRadius: '4px', fontSize: '11px', color: '#92400e' }}>
                      ⚠️ This amount may be recoverable through back-charges or contract negotiations
                    </div>
                  ) : (
                    <div style={{ padding: '8px', backgroundColor: '#e0e7ff', borderRadius: '4px', fontSize: '11px', color: '#3730a3' }}>
                      ℹ️ Assign delay reasons in reports to attribute value lost to parties
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </>

      {/* S-Curve & Comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: '20px', marginBottom: '20px' }}>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>Cumulative Performance S-Curve</h3>
            <button
              onClick={metricInfoModal.open}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                backgroundColor: '#f3e5f5',
                border: '1px solid #6f42c1',
                borderRadius: '15px',
                cursor: 'pointer',
                fontSize: '11px',
                color: '#6f42c1',
                fontWeight: '600'
              }}
            >
              <span style={{ fontSize: '14px' }}>ℹ️</span> Metric Integrity
            </button>
          </div>
          <p style={{ fontSize: '11px', color: '#666', margin: '0 0 10px 0' }}>
            VAAC (purple) shows what the project <strong>should</strong> have cost with 100% efficiency
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={sCurveData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="displayDate" tick={{ fontSize: 10 }} interval={3} />
              <YAxis tickFormatter={(v) => `$${(v/1000000).toFixed(0)}M`} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value, name) => {
                  const labels = {
                    'PV': 'Planned Value',
                    'EV': 'Earned Value',
                    'AC': 'Actual Cost',
                    'VAAC': 'Value-Adjusted Actual Cost'
                  }
                  return [formatCurrency(value), labels[name] || name]
                }}
                labelFormatter={(label) => label}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="PV" stroke={EVMColors.PV} strokeWidth={3} strokeDasharray="8 4" dot={false} name="Planned Value (PV)" />
              <Line type="monotone" dataKey="EV" stroke={EVMColors.EV} strokeWidth={3} dot={false} name="Earned Value (EV)" />
              <Line type="monotone" dataKey="AC" stroke={EVMColors.AC} strokeWidth={2} dot={false} name="Actual Cost (AC)" />
              <Line type="monotone" dataKey="VAAC" stroke={EVMColors.VAAC} strokeWidth={2} strokeDasharray="4 2" dot={false} name="Shadow VAAC" />
              {/* Shaded area showing efficiency gap (difference between AC and VAAC) */}
              <Area type="monotone" dataKey="efficiencyGap" fill="#6f42c1" fillOpacity={0.15} stroke="none" name="Efficiency Gap" />
            </ComposedChart>
          </ResponsiveContainer>
          {/* VAAC Legend explanation */}
          {sCurveData.length > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px',
              backgroundColor: '#f8f5fc',
              borderRadius: '4px',
              marginTop: '10px',
              fontSize: '11px'
            }}>
              <div>
                <span style={{ color: EVMColors.AC, fontWeight: 'bold' }}>●</span> Actual Cost: {formatCurrency(sCurveData[sCurveData.length - 1]?.AC || 0)}
              </div>
              <div>
                <span style={{ color: EVMColors.VAAC, fontWeight: 'bold' }}>●</span> VAAC: {formatCurrency(sCurveData[sCurveData.length - 1]?.VAAC || 0)}
              </div>
              <div style={{ color: '#dc3545', fontWeight: 'bold' }}>
                Efficiency Gap: {formatCurrency(sCurveData[sCurveData.length - 1]?.valueLost || 0)}
              </div>
            </div>
          )}
        </div>

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginTop: 0, marginBottom: '15px' }}>Physical vs Spent vs Scheduled</h3>
          <TripleComparison percentPhysical={metrics.percentPhysical} percentSpent={metrics.percentSpent} percentScheduled={metrics.percentScheduled} />
        </div>
      </div>

      {/* Executive Summary */}
      <div style={{ backgroundColor: '#37474f', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        EXECUTIVE SUMMARY & RECOMMENDED ACTIONS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', border: '1px solid #ddd', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ 
            padding: '15px',
            backgroundColor: healthAssessment.status === 'GREEN' ? '#e8f5e9' : healthAssessment.status === 'AMBER' ? '#fff3e0' : '#ffebee',
            borderRadius: '8px',
            borderLeft: `4px solid ${healthAssessment.status === 'GREEN' ? EVMColors.gauge.excellent : healthAssessment.status === 'AMBER' ? EVMColors.gauge.warning : EVMColors.gauge.danger}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{
                padding: '4px 12px',
                backgroundColor: healthAssessment.status === 'GREEN' ? EVMColors.gauge.excellent : healthAssessment.status === 'AMBER' ? EVMColors.gauge.warning : EVMColors.gauge.danger,
                color: healthAssessment.status === 'AMBER' ? '#000' : '#fff',
                borderRadius: '20px', fontSize: '11px', fontWeight: '700'
              }}>
                {healthAssessment.status}
              </span>
              <h4 style={{ margin: 0, fontSize: '14px' }}>📊 {healthAssessment.title}</h4>
            </div>
            
            <p style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '15px', color: '#333' }}>
              {healthAssessment.summary}
            </p>

            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>📋 Recommended Actions:</div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', lineHeight: '1.8', color: '#444' }}>
                {healthAssessment.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
              </ul>
            </div>
          </div>

          <div style={{ padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <h4 style={{ marginTop: 0, fontSize: '14px' }}>🗺️ Project Key Points</h4>
            <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
              {EGP_PROJECT.keyPoints.slice(0, 6).map((kp, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #ddd' }}>
                  <span style={{ fontFamily: 'monospace' }}>{kp.kp}</span>
                  <span>{kp.name}</span>
                  <span style={{ color: '#888' }}>{kp.type}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #ccc' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', marginBottom: '5px' }}>⚠️ Active Environmental Windows:</div>
              <div style={{ fontSize: '11px', color: '#666' }}>
                • Salmon fish window: Aug 15 - Nov 15 (Indian River)<br/>
                • Tailed Frog habitat: Oct-Apr restrictions
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function PhasesTab({ phases }) {
  return (
    <>
      <div style={{ backgroundColor: '#5d4037', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        PHASE-BY-PHASE PERFORMANCE
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Phase</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Budget %</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Planned %</th>
                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Actual %</th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Variance</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '200px' }}>Progress</th>
                <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((phase, i) => {
                const variance = phase.actualPercent - phase.plannedPercent
                const varColor = variance >= 0 ? EVMColors.gauge.excellent : variance >= -5 ? EVMColors.gauge.warning : EVMColors.gauge.danger
                return (
                  <tr key={i} style={{ backgroundColor: i % 2 ? '#f8f9fa' : 'white' }}>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                      <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: EVMColors.phases[phase.name] || '#666', borderRadius: '2px', marginRight: '8px' }}></span>
                      <strong>{phase.name}</strong>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{phase.budgetPercent}%</td>
                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{phase.plannedPercent.toFixed(1)}%</td>
                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #dee2e6', fontWeight: 'bold' }}>{phase.actualPercent.toFixed(1)}%</td>
                    <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                      <span style={{ color: varColor, fontWeight: 'bold' }}>
                        {variance >= 0 ? '+' : ''}{variance.toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                      <div style={{ position: 'relative', height: '20px', backgroundColor: '#e9ecef', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', height: '100%', width: `${phase.plannedPercent}%`, backgroundColor: EVMColors.PV, opacity: 0.3 }} />
                        <div style={{ position: 'absolute', height: '100%', width: `${phase.actualPercent}%`, backgroundColor: EVMColors.phases[phase.name] || '#666', borderRadius: '10px' }} />
                      </div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6', fontSize: '11px', color: '#666' }}>{phase.rate}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Phase Chart */}
        <div style={{ marginTop: '30px' }}>
          <h4 style={{ fontSize: '14px', marginBottom: '15px' }}>Planned vs Actual by Phase</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={phases} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
              <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
              <Legend />
              <Bar dataKey="plannedPercent" fill={EVMColors.PV} name="Planned %" opacity={0.6} />
              <Bar dataKey="actualPercent" name="Actual %">
                {phases.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={EVMColors.phases[entry.name] || '#666'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}

function CrewsTab({ spreads }) {
  const totals = spreads.reduce((acc, s) => ({
    metresComplete: acc.metresComplete + s.metresComplete,
    metresTarget: acc.metresTarget + s.metresTarget,
    labourCount: acc.labourCount + s.labourCount,
    equipmentUnits: acc.equipmentUnits + s.equipmentUnits,
    welders: acc.welders + s.welders
  }), { metresComplete: 0, metresTarget: 0, labourCount: 0, equipmentUnits: 0, welders: 0 })

  return (
    <>
      <div style={{ backgroundColor: '#1565c0', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        CREW / SPREAD PERFORMANCE
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px', marginBottom: '25px' }}>
          <div style={{ padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#666' }}>Total Workforce</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1565c0' }}>{totals.labourCount}</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#666' }}>Metres Complete</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2e7d32' }}>{(totals.metresComplete / 1000).toFixed(1)}km</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#fff3e0', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#666' }}>Equipment Units</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef6c00' }}>{totals.equipmentUnits}</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#fce4ec', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#666' }}>Welders</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#c2185b' }}>{totals.welders}</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f3e5f5', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#666' }}>Active Spreads</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#7b1fa2' }}>{spreads.length}</div>
          </div>
        </div>

        {/* Spread Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
          {spreads.map((spread, i) => {
            const spiColor = getIndexColor(spread.spi)
            const cpiColor = getIndexColor(spread.cpi)
            const progressPercent = (spread.metresComplete / spread.metresTarget) * 100
            
            return (
              <div key={i} style={{ 
                padding: '20px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '8px',
                borderLeft: `4px solid ${spiColor}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 5px 0', fontSize: '15px' }}>{spread.name}</h4>
                    <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Foreman: {spread.foreman}</p>
                    <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#888' }}>{spread.kpRange}</p>
                  </div>
                  <span style={{ 
                    padding: '4px 10px', 
                    backgroundColor: spread.status === 'On Track' ? '#e8f5e9' : spread.status.includes('Monitor') ? '#fff3e0' : '#ffebee',
                    color: spread.status === 'On Track' ? '#2e7d32' : spread.status.includes('Monitor') ? '#ef6c00' : '#c62828',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}>
                    {spread.status}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '15px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#666' }}>SPI</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: spiColor }}>{spread.spi.toFixed(2)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#666' }}>CPI</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: cpiColor }}>{spread.cpi.toFixed(2)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#666' }}>Labour</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>{spread.labourCount}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#666' }}>Welders</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>{spread.welders}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '5px' }}>
                    <span>Metres Complete: <strong>{(spread.metresComplete / 1000).toFixed(1)}km</strong></span>
                    <span>Target: {(spread.metresTarget / 1000).toFixed(1)}km</span>
                  </div>
                  <div style={{ height: '10px', backgroundColor: '#e0e0e0', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(progressPercent, 100)}%`, backgroundColor: spiColor, transition: 'width 0.3s' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function TrendsTab({ monthlyTrends }) {
  return (
    <>
      <div style={{ backgroundColor: '#6a1b9a', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        MONTHLY PERFORMANCE TRENDS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        
        {/* SPI/CPI Chart */}
        <div style={{ marginBottom: '30px' }}>
          <h4 style={{ fontSize: '14px', marginBottom: '15px' }}>SPI & CPI Trend</h4>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={monthlyTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis domain={[0.8, 1.1]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={1.0} stroke="#333" strokeDasharray="5 5" label={{ value: 'Target', position: 'right', fontSize: 10 }} />
              <Line type="monotone" dataKey="SPI" stroke={EVMColors.PV} strokeWidth={3} dot={{ r: 5 }} name="Schedule Performance (SPI)" />
              <Line type="monotone" dataKey="CPI" stroke={EVMColors.EV} strokeWidth={3} dot={{ r: 5 }} name="Cost Performance (CPI)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <h4 style={{ fontSize: '14px', marginBottom: '15px' }}>Labour & Equipment Hours</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `${v.toLocaleString()} hrs`} />
                <Legend />
                <Bar dataKey="labourHours" fill="#1976d2" name="Labour Hours" />
                <Bar dataKey="equipmentHours" fill="#ff9800" name="Equipment Hours" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h4 style={{ fontSize: '14px', marginBottom: '15px' }}>Metres Installed</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => `${v.toLocaleString()} m`} />
                <Bar dataKey="metresInstalled" fill="#4caf50" name="Metres Installed">
                  {monthlyTrends.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.status === 'green' ? '#4caf50' : entry.status === 'amber' ? '#ff9800' : '#f44336'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Table */}
        <div style={{ marginTop: '25px' }}>
          <h4 style={{ fontSize: '14px', marginBottom: '15px' }}>Monthly Summary</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Month</th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>SPI</th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>CPI</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Labour Hrs</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Equip Hrs</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Metres</th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {monthlyTrends.map((m, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 ? '#f8f9fa' : 'white' }}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6', fontWeight: 'bold' }}>{m.month}</td>
                  <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6', color: getIndexColor(m.SPI), fontWeight: 'bold' }}>{m.SPI.toFixed(2)}</td>
                  <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6', color: getIndexColor(m.CPI), fontWeight: 'bold' }}>{m.CPI.toFixed(2)}</td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{Math.round(m.labourHours).toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{Math.round(m.equipmentHours).toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{Math.round(m.metresInstalled).toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                    <span style={{ 
                      display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%',
                      backgroundColor: m.status === 'green' ? EVMColors.gauge.excellent : m.status === 'amber' ? EVMColors.gauge.warning : EVMColors.gauge.danger
                    }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function KPICard({ title, value, subtitle, format = 'currency', color, isVariance }) {
  const displayValue = format === 'currency' ? formatCurrency(value) : format === 'index' ? value.toFixed(3) : value
  const valueColor = isVariance ? (value >= 0 ? EVMColors.variance.positive : EVMColors.variance.negative) : color || '#333'

  return (
    <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
      <div style={{ fontSize: '11px', color: '#666', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
      <div style={{ fontSize: '26px', fontWeight: 'bold', color: valueColor, marginTop: '5px' }}>{isVariance && value > 0 && '+'}{displayValue}</div>
      {subtitle && <div style={{ fontSize: '11px', color: '#999', marginTop: '3px' }}>{subtitle}</div>}
    </div>
  )
}

function DaysBehindCard({ daysBehind, sv, dailyPV }) {
  const isAhead = daysBehind <= 0
  const color = isAhead ? EVMColors.gauge.excellent : daysBehind <= 10 ? EVMColors.gauge.warning : EVMColors.gauge.danger
  
  return (
    <div style={{ padding: '15px', backgroundColor: isAhead ? '#e8f5e9' : daysBehind <= 10 ? '#fff3e0' : '#ffebee', borderRadius: '8px', border: `2px solid ${color}`, textAlign: 'center' }}>
      <div style={{ fontSize: '11px', color: '#666', fontWeight: '500', textTransform: 'uppercase' }}>{isAhead ? 'Days Ahead' : 'Days Behind'}</div>
      <div style={{ fontSize: '32px', fontWeight: 'bold', color, marginTop: '5px' }}>{Math.abs(daysBehind)}</div>
      <div style={{ fontSize: '11px', color: '#999', marginTop: '3px' }}>SV: {formatCurrency(sv)}</div>
    </div>
  )
}

function EACCard({ eac, bac, vac }) {
  const bufferPercent = bac > 0 ? ((vac / bac) * 100).toFixed(1) : 0
  const isUnder = vac >= 0
  
  return (
    <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
      <div style={{ fontSize: '11px', color: '#666', fontWeight: '500', textTransform: 'uppercase' }}>Estimate at Completion</div>
      <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#333', marginTop: '5px' }}>{formatCurrency(eac)}</div>
      <div style={{ fontSize: '11px', color: '#999', marginTop: '3px' }}>Budget: {formatCurrency(bac)}</div>
      <div style={{ marginTop: '8px', padding: '4px 8px', backgroundColor: isUnder ? '#e8f5e9' : '#ffebee', borderRadius: '4px', display: 'inline-block' }}>
        <span style={{ fontSize: '12px', fontWeight: '600', color: isUnder ? EVMColors.gauge.excellent : EVMColors.gauge.danger }}>
          {isUnder ? '↓' : '↑'} {Math.abs(bufferPercent)}% {isUnder ? 'savings' : 'overrun'}
        </span>
      </div>
    </div>
  )
}

function PerformanceGauge({ label, value }) {
  const color = getIndexColor(value)
  const status = getIndexStatus(value)
  const percentage = Math.min((value / 1.2) * 100, 100)

  return (
    <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef', textAlign: 'center' }}>
      <div style={{ fontSize: '11px', color: '#666', fontWeight: '500', marginBottom: '10px' }}>{label}</div>
      <div style={{ position: 'relative', height: '16px', marginBottom: '10px', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: '100%', height: '100%', background: `linear-gradient(to right, ${EVMColors.gauge.danger} 0%, ${EVMColors.gauge.danger} 75%, ${EVMColors.gauge.warning} 75%, ${EVMColors.gauge.warning} 83.3%, ${EVMColors.gauge.excellent} 83.3%)`, opacity: 0.2 }} />
        <div style={{ position: 'absolute', width: `${percentage}%`, height: '100%', backgroundColor: color, transition: 'width 0.5s ease' }} />
        <div style={{ position: 'absolute', left: `${(1.0 / 1.2) * 100}%`, top: 0, bottom: 0, width: '2px', backgroundColor: '#333' }} />
      </div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color }}>{value.toFixed(2)}</div>
      <div style={{ fontSize: '11px', color, fontWeight: '600', marginTop: '3px' }}>{status}</div>
    </div>
  )
}

function TripleComparison({ percentPhysical, percentSpent, percentScheduled }) {
  const data = [
    { name: '% Physical Complete', value: percentPhysical, fill: EVMColors.EV },
    { name: '% Budget Spent', value: percentSpent, fill: EVMColors.AC },
    { name: '% Schedule Elapsed', value: percentScheduled, fill: EVMColors.PV }
  ]

  const getInsight = () => {
    if (percentPhysical > percentSpent && percentPhysical >= percentScheduled) return { text: 'Excellent: Ahead of schedule & under budget', color: EVMColors.gauge.excellent }
    if (percentPhysical < percentSpent && percentPhysical < percentScheduled) return { text: 'Critical: Behind schedule & over budget', color: EVMColors.gauge.danger }
    if (percentPhysical < percentScheduled) return { text: 'Schedule Risk: Physical progress behind plan', color: EVMColors.gauge.warning }
    if (percentPhysical < percentSpent) return { text: 'Cost Risk: Spending exceeds earned progress', color: EVMColors.gauge.warning }
    return { text: 'On Track: Performance within targets', color: EVMColors.gauge.good }
  }
  const insight = getInsight()

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 40 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
          <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value) => [`${value.toFixed(1)}%`, '']} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ marginTop: '15px', padding: '12px 15px', backgroundColor: `${insight.color}15`, borderLeft: `4px solid ${insight.color}`, borderRadius: '0 4px 4px 0', fontSize: '12px', fontWeight: '600', color: '#333' }}>{insight.text}</div>
    </div>
  )
}

function formatCurrency(value) {
  const absValue = Math.abs(value)
  const prefix = value < 0 ? '-' : ''
  if (absValue >= 1000000) return `${prefix}$${(absValue / 1000000).toFixed(2)}M`
  if (absValue >= 1000) return `${prefix}$${(absValue / 1000).toFixed(0)}k`
  return `${prefix}$${absValue.toFixed(0)}`
}

export default EVMDashboard
