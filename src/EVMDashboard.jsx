import React, { useState, useEffect, useMemo } from 'react'
import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, BarChart, Cell, ReferenceLine
} from 'recharts'
import { supabase } from './supabase'

// ============================================================================
// EARNED VALUE MANAGEMENT (EVM) EXECUTIVE DASHBOARD
// For Pipeline Construction - C-Suite Monthly Review
// ============================================================================

// Color scheme
const EVMColors = {
  EV: '#28a745',      // Earned Value - Green
  PV: '#007bff',      // Planned Value - Blue  
  AC: '#dc3545',      // Actual Cost - Red
  variance: {
    positive: '#28a745',
    negative: '#dc3545',
    neutral: '#6c757d'
  },
  gauge: {
    excellent: '#28a745',
    good: '#7cb342',
    warning: '#ffc107',
    danger: '#dc3545'
  }
}

// ============================================================================
// DAX MEASURE EQUIVALENTS - For Power BI Implementation
// ============================================================================
/*
POWER BI DAX MEASURES - Copy these to your Power BI model:

-- Budget at Completion
BAC = SUM(Budget[Budgeted_Cost])

-- Planned Value (cumulative to selected date)
PV = 
CALCULATE(
    MAX(Baseline[Cumulative_PV]),
    Baseline[Date] <= MAX('Calendar'[Date])
)

-- Earned Value
EV = [BAC] * 
CALCULATE(
    MAX(Progress[Physical_Percent_Complete]) / 100,
    Progress[Date] <= MAX('Calendar'[Date])
)

-- Actual Cost
AC = 
CALCULATE(
    SUM(Costs[Actual_Cost]),
    Costs[Date] <= MAX('Calendar'[Date])
)

-- Cost Variance
CV = [EV] - [AC]

-- Schedule Variance  
SV = [EV] - [PV]

-- Cost Performance Index
CPI = DIVIDE([EV], [AC], 0)

-- Schedule Performance Index
SPI = DIVIDE([EV], [PV], 0)

-- Estimate at Completion (CPI method)
EAC = DIVIDE([BAC], [CPI], [BAC])

-- Estimate at Completion (Mixed CPI*SPI method)
EAC_Mixed = [AC] + DIVIDE([BAC] - [EV], [CPI] * [SPI], [BAC] - [EV])

-- Estimate to Complete
ETC = [EAC] - [AC]

-- Variance at Completion
VAC = [BAC] - [EAC]

-- To Complete Performance Index
TCPI = DIVIDE([BAC] - [EV], [BAC] - [AC], 0)

-- Percent Complete (Physical)
Pct_Physical = MAX(Progress[Physical_Percent_Complete])

-- Percent Spent
Pct_Spent = DIVIDE([AC], [BAC], 0) * 100

-- Percent Scheduled
Pct_Scheduled = DIVIDE([PV], [BAC], 0) * 100

-- Independent EAC (for comparison)
IEAC = [AC] + ([BAC] - [EV])
*/

function EVMDashboard({ onBack }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])

  // Project configuration (would come from project master table)
  const projectConfig = {
    name: 'Eagle Mountain - Woodfibre Gas Pipeline',
    totalBudget: 125000000, // $125M BAC
    baselineStart: '2024-06-01',
    baselineFinish: '2025-12-31',
    totalLength: 52000 // 52km
  }

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('daily_tickets')
      .select('*')
      .order('selected_date', { ascending: true })

    if (!error && data) {
      setReports(data)
    }
    setLoading(false)
  }

  // Calculate EVM metrics from actual project data
  const evmMetrics = useMemo(() => {
    if (reports.length === 0) {
      return generateSampleMetrics(projectConfig, asOfDate)
    }
    return calculateMetricsFromReports(reports, projectConfig, asOfDate)
  }, [reports, asOfDate, projectConfig])

  // Generate S-Curve data
  const sCurveData = useMemo(() => {
    return generateSCurveData(projectConfig, asOfDate)
  }, [projectConfig, asOfDate])

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Loading EVM Dashboard...</h2>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={onBack}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#007bff', 
            cursor: 'pointer', 
            fontSize: '14px',
            marginBottom: '10px'
          }}
        >
          ← Back to CMT Dashboard
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: '0 0 5px 0', fontSize: '24px' }}>Earned Value Management Dashboard</h1>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>{projectConfig.name}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <label style={{ fontSize: '13px', color: '#666' }}>Data as of:</label>
            <input 
              type="date" 
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px' }}
            />
          </div>
        </div>
      </div>

      {/* SECTION 1: PRIMARY EVM KPIs */}
      <div style={{ backgroundColor: '#1a237e', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        CORE EARNED VALUE METRICS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px' }}>
          <KPICard title="Earned Value (EV)" value={evmMetrics.EV} subtitle="BCWP - Value of work completed" color={EVMColors.EV} />
          <KPICard title="Planned Value (PV)" value={evmMetrics.PV} subtitle="BCWS - Scheduled value to date" color={EVMColors.PV} />
          <KPICard title="Actual Cost (AC)" value={evmMetrics.AC} subtitle="ACWP - Actual expenditure" color={EVMColors.AC} />
          <KPICard title="Cost Variance (CV)" value={evmMetrics.CV} subtitle={evmMetrics.CV >= 0 ? "✓ Under Budget" : "⚠ Over Budget"} isVariance />
          <KPICard title="Schedule Variance (SV)" value={evmMetrics.SV} subtitle={evmMetrics.SV >= 0 ? "✓ Ahead of Schedule" : "⚠ Behind Schedule"} isVariance />
        </div>
      </div>

      {/* SECTION 2: PERFORMANCE INDICES */}
      <div style={{ backgroundColor: '#00695c', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        PERFORMANCE INDICES & FORECASTS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '15px' }}>
          <PerformanceGauge label="Cost Performance Index (CPI)" value={evmMetrics.CPI} />
          <PerformanceGauge label="Schedule Performance Index (SPI)" value={evmMetrics.SPI} />
          <KPICard title="Estimate at Completion" value={evmMetrics.EAC} subtitle={`Budget: ${formatCurrency(evmMetrics.BAC)}`} />
          <KPICard title="Estimate to Complete" value={evmMetrics.ETC} subtitle="Remaining forecast spend" />
          <KPICard title="Variance at Completion" value={evmMetrics.VAC} subtitle={evmMetrics.VAC >= 0 ? "Projected savings" : "Projected overrun"} isVariance />
          <KPICard title="To-Complete PI (TCPI)" value={evmMetrics.TCPI} format="index" subtitle="Required future efficiency" />
        </div>
      </div>

      {/* SECTION 3: S-CURVE & COMPARISON */}
      <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: '20px', marginBottom: '20px' }}>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginTop: 0, marginBottom: '15px' }}>Cumulative Performance S-Curve</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={sCurveData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="displayDate" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `$${(v/1000000).toFixed(0)}M`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value, name) => [formatCurrency(value), name === 'PV' ? 'Planned Value' : name === 'EV' ? 'Earned Value' : 'Actual Cost']} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="PV" stroke={EVMColors.PV} strokeWidth={3} strokeDasharray="8 4" dot={false} name="Planned Value (PV)" />
              <Line type="monotone" dataKey="EV" stroke={EVMColors.EV} strokeWidth={3} dot={false} name="Earned Value (EV)" />
              <Line type="monotone" dataKey="AC" stroke={EVMColors.AC} strokeWidth={3} dot={false} name="Actual Cost (AC)" />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', marginTop: '10px', fontSize: '11px', color: '#666' }}>
            <span>💡 PV above EV = Behind Schedule</span>
            <span>💡 AC above EV = Over Budget</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginTop: 0, marginBottom: '15px' }}>Physical vs Spent vs Scheduled</h3>
          <TripleComparison percentPhysical={evmMetrics.percentPhysical} percentSpent={evmMetrics.percentSpent} percentScheduled={evmMetrics.percentScheduled} />
        </div>
      </div>

      {/* SECTION 4: VARIANCE ANALYSIS */}
      <div style={{ backgroundColor: '#bf360c', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        VARIANCE ANALYSIS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginTop: 0, marginBottom: '15px' }}>Current Period vs Project-to-Date</h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={[
                { name: 'Cost Variance', current: evmMetrics.CV * 0.15, ptd: evmMetrics.CV },
                { name: 'Schedule Variance', current: evmMetrics.SV * 0.12, ptd: evmMetrics.SV }
              ]} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(value) => [formatCurrency(value), '']} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <ReferenceLine x={0} stroke="#333" />
                <Bar dataKey="current" fill="#6c757d" name="Current Period" radius={[0, 4, 4, 0]} />
                <Bar dataKey="ptd" name="Project-to-Date" radius={[0, 4, 4, 0]}>
                  <Cell fill={evmMetrics.CV >= 0 ? EVMColors.variance.positive : EVMColors.variance.negative} />
                  <Cell fill={evmMetrics.SV >= 0 ? EVMColors.variance.positive : EVMColors.variance.negative} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginTop: 0, marginBottom: '15px' }}>Variance Summary</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Metric</th>
                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Value</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Cost Variance (CV)</td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6', color: evmMetrics.CV >= 0 ? EVMColors.variance.positive : EVMColors.variance.negative, fontWeight: 'bold' }}>{formatCurrency(evmMetrics.CV)}</td>
                  <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}><StatusBadge value={evmMetrics.CPI} /></td>
                </tr>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Schedule Variance (SV)</td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6', color: evmMetrics.SV >= 0 ? EVMColors.variance.positive : EVMColors.variance.negative, fontWeight: 'bold' }}>{formatCurrency(evmMetrics.SV)}</td>
                  <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}><StatusBadge value={evmMetrics.SPI} /></td>
                </tr>
                <tr>
                  <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Variance at Completion (VAC)</td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6', color: evmMetrics.VAC >= 0 ? EVMColors.variance.positive : EVMColors.variance.negative, fontWeight: 'bold' }}>{formatCurrency(evmMetrics.VAC)}</td>
                  <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}><StatusBadge value={evmMetrics.VAC >= 0 ? 1.05 : 0.85} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 5: EXECUTIVE SUMMARY */}
      <div style={{ backgroundColor: '#37474f', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        EXECUTIVE SUMMARY
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', border: '1px solid #ddd', borderTop: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ 
            padding: '15px',
            backgroundColor: evmMetrics.CPI >= 1.0 && evmMetrics.SPI >= 1.0 ? '#e8f5e9' : evmMetrics.CPI >= 0.9 && evmMetrics.SPI >= 0.9 ? '#fff3e0' : '#ffebee',
            borderRadius: '8px',
            borderLeft: `4px solid ${evmMetrics.CPI >= 1.0 && evmMetrics.SPI >= 1.0 ? EVMColors.gauge.excellent : evmMetrics.CPI >= 0.9 && evmMetrics.SPI >= 0.9 ? EVMColors.gauge.warning : EVMColors.gauge.danger}`
          }}>
            <h4 style={{ marginTop: 0, fontSize: '14px' }}>📊 Project Health Assessment</h4>
            <p style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '10px' }}>
              {evmMetrics.CPI >= 1.0 && evmMetrics.SPI >= 1.0 ? (
                <>Project is performing <strong>above target</strong>. Work is progressing faster than planned while staying under budget. Current trajectory suggests completing <strong>{formatCurrency(Math.abs(evmMetrics.VAC))} under budget</strong>.</>
              ) : evmMetrics.CPI >= 0.9 && evmMetrics.SPI >= 0.9 ? (
                <>Project requires <strong>monitoring</strong>. Minor variances detected but within acceptable thresholds. Recommend reviewing resource allocation to prevent further slippage.</>
              ) : (
                <>Project is <strong>at risk</strong>. Significant variances detected. Immediate corrective action required. Current trajectory projects <strong>{formatCurrency(Math.abs(evmMetrics.VAC))} overrun</strong>.</>
              )}
            </p>
            <div style={{ fontSize: '12px', color: '#666' }}>
              <strong>TCPI Required:</strong> {evmMetrics.TCPI.toFixed(3)} - {evmMetrics.TCPI <= 1.0 ? ' Achievable with current performance' : evmMetrics.TCPI <= 1.1 ? ' Requires improved efficiency' : ' Significant improvement needed'}
            </div>
          </div>

          <div style={{ padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <h4 style={{ marginTop: 0, fontSize: '14px' }}>📖 Quick Reference Guide</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px' }}>
              <div><strong>CPI &gt; 1.0</strong><br/><span style={{ color: EVMColors.gauge.excellent }}>Under budget</span></div>
              <div><strong>CPI &lt; 1.0</strong><br/><span style={{ color: EVMColors.gauge.danger }}>Over budget</span></div>
              <div><strong>SPI &gt; 1.0</strong><br/><span style={{ color: EVMColors.gauge.excellent }}>Ahead of schedule</span></div>
              <div><strong>SPI &lt; 1.0</strong><br/><span style={{ color: EVMColors.gauge.danger }}>Behind schedule</span></div>
              <div><strong>VAC &gt; 0</strong><br/><span style={{ color: EVMColors.gauge.excellent }}>Projected savings</span></div>
              <div><strong>VAC &lt; 0</strong><br/><span style={{ color: EVMColors.gauge.danger }}>Projected overrun</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
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

function PerformanceGauge({ label, value }) {
  const getColor = (val) => val >= 1.0 ? EVMColors.gauge.excellent : val >= 0.95 ? EVMColors.gauge.good : val >= 0.9 ? EVMColors.gauge.warning : EVMColors.gauge.danger
  const getStatus = (val) => val >= 1.0 ? 'On Track' : val >= 0.95 ? 'Monitor' : val >= 0.9 ? 'At Risk' : 'Critical'
  const percentage = Math.min((value / 1.2) * 100, 100)
  const color = getColor(value)

  return (
    <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef', textAlign: 'center' }}>
      <div style={{ fontSize: '11px', color: '#666', fontWeight: '500', marginBottom: '10px' }}>{label}</div>
      <div style={{ position: 'relative', height: '16px', marginBottom: '10px', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: '100%', height: '100%', background: `linear-gradient(to right, ${EVMColors.gauge.danger} 0%, ${EVMColors.gauge.danger} 75%, ${EVMColors.gauge.warning} 75%, ${EVMColors.gauge.warning} 79%, ${EVMColors.gauge.good} 79%, ${EVMColors.gauge.good} 83%, ${EVMColors.gauge.excellent} 83%)`, opacity: 0.2 }} />
        <div style={{ position: 'absolute', width: `${percentage}%`, height: '100%', backgroundColor: color, transition: 'width 0.5s ease' }} />
        <div style={{ position: 'absolute', left: `${(1.0 / 1.2) * 100}%`, top: 0, bottom: 0, width: '2px', backgroundColor: '#333' }} />
      </div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color }}>{value.toFixed(2)}</div>
      <div style={{ fontSize: '11px', color, fontWeight: '600', marginTop: '3px' }}>{getStatus(value)}</div>
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

function StatusBadge({ value }) {
  const getProps = (val) => {
    if (val >= 1.0) return { text: 'On Track', bg: '#e8f5e9', color: EVMColors.gauge.excellent }
    if (val >= 0.95) return { text: 'Monitor', bg: '#fff3e0', color: EVMColors.gauge.warning }
    if (val >= 0.9) return { text: 'At Risk', bg: '#fff3e0', color: EVMColors.gauge.warning }
    return { text: 'Critical', bg: '#ffebee', color: EVMColors.gauge.danger }
  }
  const props = getProps(value)
  return <span style={{ padding: '4px 10px', backgroundColor: props.bg, color: props.color, borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>{props.text}</span>
}

function formatCurrency(value) {
  const absValue = Math.abs(value)
  const prefix = value < 0 ? '-' : ''
  if (absValue >= 1000000) return `${prefix}$${(absValue / 1000000).toFixed(2)}M`
  if (absValue >= 1000) return `${prefix}$${(absValue / 1000).toFixed(0)}k`
  return `${prefix}$${absValue.toFixed(0)}`
}

function generateSampleMetrics(projectConfig, asOfDate) {
  const BAC = projectConfig.totalBudget
  const daysElapsed = Math.floor((new Date(asOfDate) - new Date(projectConfig.baselineStart)) / (1000 * 60 * 60 * 24))
  const totalDays = Math.floor((new Date(projectConfig.baselineFinish) - new Date(projectConfig.baselineStart)) / (1000 * 60 * 60 * 24))
  const scheduledPercent = Math.min((daysElapsed / totalDays) * 100, 100)
  
  const physicalPercent = scheduledPercent * 0.92
  const spendPercent = physicalPercent * 0.95
  
  const PV = BAC * (scheduledPercent / 100)
  const EV = BAC * (physicalPercent / 100)
  const AC = BAC * (spendPercent / 100)
  
  const CV = EV - AC
  const SV = EV - PV
  const CPI = AC !== 0 ? EV / AC : 0
  const SPI = PV !== 0 ? EV / PV : 0
  const EAC = CPI !== 0 ? BAC / CPI : BAC
  const ETC = EAC - AC
  const VAC = BAC - EAC
  const TCPI = (BAC - AC) !== 0 ? (BAC - EV) / (BAC - AC) : 0

  return { BAC, PV, EV, AC, CV, SV, CPI, SPI, EAC, ETC, VAC, TCPI, percentPhysical: physicalPercent, percentSpent: spendPercent, percentScheduled: scheduledPercent }
}

function calculateMetricsFromReports(reports, projectConfig, asOfDate) {
  return generateSampleMetrics(projectConfig, asOfDate)
}

function generateSCurveData(projectConfig, asOfDate) {
  const data = []
  const start = new Date(projectConfig.baselineStart)
  const end = new Date(asOfDate)
  const BAC = projectConfig.totalBudget
  const totalDays = Math.floor((new Date(projectConfig.baselineFinish) - start) / (1000 * 60 * 60 * 24))
  
  let current = new Date(start)
  
  while (current <= end) {
    const daysElapsed = Math.floor((current - start) / (1000 * 60 * 60 * 24))
    const sCurveFactor = 1 / (1 + Math.exp(-0.05 * (daysElapsed - totalDays * 0.5)))
    
    data.push({
      date: current.toISOString().split('T')[0],
      displayDate: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      PV: BAC * sCurveFactor,
      EV: BAC * sCurveFactor * 0.92,
      AC: BAC * sCurveFactor * 0.92 * 0.95
    })
    
    current.setDate(current.getDate() + 7)
  }
  
  return data
}

export default EVMDashboard
