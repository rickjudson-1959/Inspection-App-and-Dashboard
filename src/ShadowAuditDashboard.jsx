// ShadowAuditDashboard.jsx - Efficiency Audit Dashboard for Admin Portal
// Shows value lost, inertia ratios, and delay breakdowns across all reports
// Includes Goodhart's Law protection with triangulation verification

import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { defaultRates } from './constants.js'
import { verifyEfficiency, aggregateEfficiencyVerification, aggregateValueLostByParty } from './shadowAuditUtils.js'
import { useOrgQuery } from './utils/queryHelpers.js'

function ShadowAuditDashboard() {
  const { addOrgFilter, organizationId, isReady } = useOrgQuery()
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState([])
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 30 days
    end: new Date().toISOString().split('T')[0]
  })
  const [selectedSpread, setSelectedSpread] = useState('all')
  const [spreads, setSpreads] = useState([])

  // Aggregated metrics
  const [metrics, setMetrics] = useState({
    totalBilledHours: 0,
    totalShadowHours: 0,
    totalValueLost: 0,
    overallInertiaRatio: 100,
    systemicDelayCount: 0,
    assetDelayCount: 0,
    delayReasonBreakdown: {},
    partyBreakdown: { owner: 0, contractor: 0, neutral: 0, unknown: 0, total: 0 },
    spreadComparison: [],
    dailyTrend: [],
    // Goodhart's Law protection metrics
    reliability: {
      overallReliability: 'RELIABLE',
      totalLinearMetres: 0,
      overallProductionRatio: 100,
      overallQualityRate: 100,
      totalReworkCost: 0,
      avgProductivityDragPenalty: 0,
      criticalAlerts: [],
      unreliableBlocks: 0,
      questionableBlocks: 0,
      trueCostOfCompletion: 0
    }
  })

  useEffect(() => {
    if (isReady()) {
      fetchReports()
    }
  }, [dateRange, selectedSpread, organizationId])

  async function fetchReports() {
    setLoading(true)

    let query = supabase
      .from('daily_tickets')
      .select('id, date, spread, inspector_name, activity_blocks')
      .gte('date', dateRange.start)
      .lte('date', dateRange.end)
      .order('date', { ascending: false })

    if (selectedSpread !== 'all') {
      query = query.eq('spread', selectedSpread)
    }
    query = addOrgFilter(query)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching reports:', error)
      setLoading(false)
      return
    }

    setReports(data || [])

    // Extract unique spreads for filter
    const uniqueSpreads = [...new Set((data || []).map(r => r.spread).filter(Boolean))]
    setSpreads(uniqueSpreads)

    // Calculate aggregated metrics
    calculateMetrics(data || [])
    setLoading(false)
  }

  function calculateMetrics(reportsData) {
    let totalBilledHours = 0
    let totalShadowHours = 0
    let totalValueLost = 0
    let systemicDelayCount = 0
    let assetDelayCount = 0
    const delayReasonBreakdown = {}
    const spreadData = {}
    const dailyData = {}

    for (const report of reportsData) {
      const blocks = report.activity_blocks || []

      for (const block of blocks) {
        const summary = block.shadowAuditSummary

        if (summary) {
          totalBilledHours += summary.totalBilledHours || 0
          totalShadowHours += summary.totalShadowHours || 0
          totalValueLost += summary.totalValueLost || 0

          if (summary.delayType === 'SYSTEMIC') {
            systemicDelayCount++
            // Track systemic delay reason
            const reason = summary.systemicDelay?.reason || 'unspecified'
            delayReasonBreakdown[reason] = (delayReasonBreakdown[reason] || 0) + (summary.totalValueLost || 0)
          } else if (summary.delayType === 'ASSET_SPECIFIC') {
            assetDelayCount++
          }
        } else {
          // Fallback calculation for reports without shadowAuditSummary
          const blockBilled = calculateBlockBilledHours(block)
          const blockShadow = calculateBlockShadowHours(block)
          totalBilledHours += blockBilled
          totalShadowHours += blockShadow

          // Estimate value lost
          const hoursLost = blockBilled - blockShadow
          totalValueLost += hoursLost * ((defaultRates.labour + defaultRates.equipment) / 2)
        }

        // Spread comparison
        const spread = report.spread || 'Unknown'
        if (!spreadData[spread]) {
          spreadData[spread] = { billed: 0, shadow: 0, valueLost: 0, systemicCount: 0, assetCount: 0 }
        }
        spreadData[spread].billed += summary?.totalBilledHours || 0
        spreadData[spread].shadow += summary?.totalShadowHours || 0
        spreadData[spread].valueLost += summary?.totalValueLost || 0
        if (summary?.delayType === 'SYSTEMIC') spreadData[spread].systemicCount++
        if (summary?.delayType === 'ASSET_SPECIFIC') spreadData[spread].assetCount++

        // Daily trend
        const date = report.date
        if (!dailyData[date]) {
          dailyData[date] = { billed: 0, shadow: 0, valueLost: 0 }
        }
        dailyData[date].billed += summary?.totalBilledHours || 0
        dailyData[date].shadow += summary?.totalShadowHours || 0
        dailyData[date].valueLost += summary?.totalValueLost || 0
      }
    }

    // Calculate spread comparison with inertia ratios
    const spreadComparison = Object.entries(spreadData).map(([spread, data]) => ({
      spread,
      ...data,
      inertiaRatio: data.billed > 0 ? (data.shadow / data.billed) * 100 : 100
    })).sort((a, b) => a.inertiaRatio - b.inertiaRatio) // Worst performers first

    // Calculate daily trend
    const dailyTrend = Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        ...data,
        inertiaRatio: data.billed > 0 ? (data.shadow / data.billed) * 100 : 100
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const overallInertiaRatio = totalBilledHours > 0
      ? (totalShadowHours / totalBilledHours) * 100
      : 100

    // Goodhart's Law Protection: Aggregate efficiency verification
    const allBlocks = reportsData.flatMap(r => r.activity_blocks || [])
    const reliability = aggregateEfficiencyVerification(allBlocks)

    // Calculate value lost by responsible party (Owner vs Contractor vs Neutral)
    const partyBreakdown = aggregateValueLostByParty(allBlocks, {}, {})

    // Calculate True Cost of Completion
    const trueCostOfCompletion = totalValueLost + reliability.totalReworkCost

    setMetrics({
      totalBilledHours,
      totalShadowHours,
      totalValueLost,
      overallInertiaRatio,
      systemicDelayCount,
      assetDelayCount,
      delayReasonBreakdown,
      partyBreakdown,
      spreadComparison,
      dailyTrend,
      reliability: {
        ...reliability,
        trueCostOfCompletion
      }
    })
  }

  // Fallback calculations for reports without shadowAuditSummary
  function calculateBlockBilledHours(block) {
    let total = 0
    if (block.labourEntries) {
      for (const entry of block.labourEntries) {
        const rt = parseFloat(entry.rt) || 0
        const ot = parseFloat(entry.ot) || 0
        const count = parseFloat(entry.count) || 1
        total += (rt + ot) * count
      }
    }
    if (block.equipmentEntries) {
      for (const entry of block.equipmentEntries) {
        const hours = parseFloat(entry.hours) || 0
        const count = parseFloat(entry.count) || 1
        total += hours * count
      }
    }
    return total
  }

  function calculateBlockShadowHours(block) {
    let total = 0
    const statusMultipliers = { ACTIVE: 1.0, SYNC_DELAY: 0.7, MANAGEMENT_DRAG: 0.0 }

    if (block.labourEntries) {
      for (const entry of block.labourEntries) {
        const rt = parseFloat(entry.rt) || 0
        const ot = parseFloat(entry.ot) || 0
        const count = parseFloat(entry.count) || 1
        const billed = (rt + ot) * count
        const status = entry.productionStatus || 'ACTIVE'
        const multiplier = statusMultipliers[status] || 1.0
        total += entry.shadowEffectiveHours ?? (billed * multiplier)
      }
    }
    if (block.equipmentEntries) {
      for (const entry of block.equipmentEntries) {
        const hours = parseFloat(entry.hours) || 0
        const count = parseFloat(entry.count) || 1
        const billed = hours * count
        const status = entry.productionStatus || 'ACTIVE'
        const multiplier = statusMultipliers[status] || 1.0
        total += entry.shadowEffectiveHours ?? (billed * multiplier)
      }
    }
    return total
  }

  // Friendly reason labels
  const reasonLabels = {
    waiting_permits: 'Waiting for Permits',
    waiting_instructions: 'Waiting for Instructions',
    waiting_materials: 'Waiting for Materials',
    coordination_delay: 'Coordination Delay',
    weather_hold: 'Weather Hold',
    safety_standdown: 'Safety Stand-down',
    equipment_breakdown: 'Equipment Breakdown',
    first_nations_monitor: 'First Nations Monitor',
    bird_window: 'Bird Nesting Window',
    environmental_window: 'Environmental Window',
    landowner_access: 'Landowner Access Issue',
    regulatory_hold: 'Regulatory Hold',
    other: 'Other',
    unspecified: 'Unspecified'
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading Efficiency Audit data...</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Efficiency Audit</h2>
          <p style={{ color: '#666', margin: '5px 0 0 0' }}>Track value leakage and identify sources of inefficiency</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Date Range</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
              />
              <span>to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Spread</label>
            <select
              value={selectedSpread}
              onChange={(e) => setSelectedSpread(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', minWidth: '150px' }}
            >
              <option value="all">All Spreads</option>
              {spreads.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Data Reliability Indicator - Goodhart's Law Protection */}
      {metrics.reliability.criticalAlerts.length > 0 || metrics.reliability.overallReliability !== 'RELIABLE' ? (
        <div style={{
          backgroundColor: metrics.reliability.overallReliability === 'UNRELIABLE' ? '#f8d7da' :
                          metrics.reliability.overallReliability === 'QUESTIONABLE' ? '#fff3cd' : '#d1ecf1',
          border: `1px solid ${metrics.reliability.overallReliability === 'UNRELIABLE' ? '#f5c6cb' :
                               metrics.reliability.overallReliability === 'QUESTIONABLE' ? '#ffeeba' : '#bee5eb'}`,
          borderRadius: '8px',
          padding: '15px 20px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>
                {metrics.reliability.overallReliability === 'UNRELIABLE' ? '⚠️' :
                 metrics.reliability.overallReliability === 'QUESTIONABLE' ? '🔍' : 'ℹ️'}
              </span>
              <div>
                <strong style={{
                  color: metrics.reliability.overallReliability === 'UNRELIABLE' ? '#721c24' :
                         metrics.reliability.overallReliability === 'QUESTIONABLE' ? '#856404' : '#0c5460'
                }}>
                  Data Reliability: {metrics.reliability.overallReliability.replace('_', ' ')}
                </strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#666' }}>
                  {metrics.reliability.unreliableBlocks} unreliable, {metrics.reliability.questionableBlocks} questionable blocks
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', marginLeft: 'auto' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Production</div>
                <div style={{
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: metrics.reliability.overallProductionRatio >= 80 ? '#28a745' :
                         metrics.reliability.overallProductionRatio >= 60 ? '#ffc107' : '#dc3545'
                }}>
                  {metrics.reliability.overallProductionRatio.toFixed(0)}%
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Quality</div>
                <div style={{
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: metrics.reliability.overallQualityRate >= 90 ? '#28a745' :
                         metrics.reliability.overallQualityRate >= 80 ? '#ffc107' : '#dc3545'
                }}>
                  {metrics.reliability.overallQualityRate.toFixed(0)}%
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Rework Cost</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc3545' }}>
                  ${metrics.reliability.totalReworkCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
          </div>

          {/* Critical Alerts */}
          {metrics.reliability.criticalAlerts.length > 0 && (
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <strong style={{ fontSize: '12px', color: '#721c24' }}>Metric Mismatch Alerts:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                {metrics.reliability.criticalAlerts.slice(0, 5).map((alert, idx) => (
                  <span key={idx} style={{
                    padding: '4px 10px',
                    backgroundColor: alert.severity === 'critical' ? '#dc3545' : '#ffc107',
                    color: alert.severity === 'critical' ? '#fff' : '#333',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 'bold'
                  }}>
                    {alert.type.replace(/_/g, ' ')}: {alert.activityType}
                  </span>
                ))}
                {metrics.reliability.criticalAlerts.length > 5 && (
                  <span style={{ fontSize: '11px', color: '#666' }}>
                    +{metrics.reliability.criticalAlerts.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Key Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        {/* True Cost of Completion - New Primary Metric */}
        <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', borderLeft: '4px solid #6f42c1' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '13px', textTransform: 'uppercase' }}>True Cost of Completion</h3>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#6f42c1' }}>
            ${metrics.reliability.trueCostOfCompletion.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
            Value lost + rework cost
          </p>
        </div>

        <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', borderLeft: '4px solid #dc3545' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '13px', textTransform: 'uppercase' }}>Value Lost (Time)</h3>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#dc3545' }}>
            ${metrics.totalValueLost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
            {(metrics.totalBilledHours - metrics.totalShadowHours).toFixed(1)} hours of drag
          </p>
        </div>

        <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', borderLeft: `4px solid ${metrics.overallInertiaRatio >= 90 ? '#28a745' : metrics.overallInertiaRatio >= 70 ? '#ffc107' : '#dc3545'}` }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '13px', textTransform: 'uppercase' }}>Inertia Ratio</h3>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: metrics.overallInertiaRatio >= 90 ? '#28a745' : metrics.overallInertiaRatio >= 70 ? '#ffc107' : '#dc3545' }}>
            {metrics.overallInertiaRatio.toFixed(1)}%
          </p>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
            {metrics.totalShadowHours.toFixed(1)} / {metrics.totalBilledHours.toFixed(1)} hours productive
          </p>
        </div>

        <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', borderLeft: '4px solid #dc3545' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '13px', textTransform: 'uppercase' }}>Systemic Delays</h3>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#dc3545' }}>
            {metrics.systemicDelayCount}
          </p>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
            Crew-wide stoppages (high impact)
          </p>
        </div>

        <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', borderLeft: '4px solid #ffc107' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '13px', textTransform: 'uppercase' }}>Asset Delays</h3>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#ffc107' }}>
            {metrics.assetDelayCount}
          </p>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
            Individual equipment/labour issues
          </p>
        </div>
      </div>

      {/* Responsibility Breakdown - Owner vs Contractor vs Neutral */}
      {metrics.partyBreakdown && metrics.partyBreakdown.total > 0 && (
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
          <h3 style={{ margin: '0 0 5px 0', color: '#333' }}>🔧 Accountability Breakdown</h3>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>Value lost by responsible party - enables back-charge negotiations and performance tracking</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '20px' }}>
            {/* Owner */}
            <div style={{ padding: '20px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', textAlign: 'center' }}>
              <div style={{
                width: '50px', height: '50px', borderRadius: '50%',
                backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 10px', color: 'white', fontSize: '20px'
              }}>🏢</div>
              <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600', marginBottom: '5px' }}>OWNER ISSUES</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6', marginBottom: '5px' }}>
                ${metrics.partyBreakdown.owner.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {metrics.partyBreakdown.total > 0 ? ((metrics.partyBreakdown.owner / metrics.partyBreakdown.total) * 100).toFixed(0) : 0}% of total
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px' }}>Permits, land access, env. windows</div>
            </div>

            {/* Contractor */}
            <div style={{ padding: '20px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', textAlign: 'center' }}>
              <div style={{
                width: '50px', height: '50px', borderRadius: '50%',
                backgroundColor: '#ef4444', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 10px', color: 'white', fontSize: '20px'
              }}>🔧</div>
              <div style={{ fontSize: '12px', color: '#991b1b', fontWeight: '600', marginBottom: '5px' }}>CONTRACTOR ISSUES</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444', marginBottom: '5px' }}>
                ${metrics.partyBreakdown.contractor.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {metrics.partyBreakdown.total > 0 ? ((metrics.partyBreakdown.contractor / metrics.partyBreakdown.total) * 100).toFixed(0) : 0}% of total
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px' }}>Mech. breakdown, latency, rework</div>
            </div>

            {/* Neutral */}
            <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{
                width: '50px', height: '50px', borderRadius: '50%',
                backgroundColor: '#6b7280', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 10px', color: 'white', fontSize: '20px'
              }}>🌩️</div>
              <div style={{ fontSize: '12px', color: '#374151', fontWeight: '600', marginBottom: '5px' }}>ACT OF GOD</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#6b7280', marginBottom: '5px' }}>
                ${metrics.partyBreakdown.neutral.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {metrics.partyBreakdown.total > 0 ? ((metrics.partyBreakdown.neutral / metrics.partyBreakdown.total) * 100).toFixed(0) : 0}% of total
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px' }}>Extreme weather, force majeure</div>
            </div>

            {/* Contractor Back-Charge Potential */}
            <div style={{ padding: '20px', backgroundColor: '#fefce8', borderRadius: '8px', border: '1px solid #fef08a', textAlign: 'center' }}>
              <div style={{
                width: '50px', height: '50px', borderRadius: '50%',
                backgroundColor: '#eab308', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 10px', color: 'white', fontSize: '20px'
              }}>💰</div>
              <div style={{ fontSize: '12px', color: '#854d0e', fontWeight: '600', marginBottom: '5px' }}>BACK-CHARGE POTENTIAL</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ca8a04', marginBottom: '5px' }}>
                ${metrics.partyBreakdown.contractor.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Recoverable from contractor
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px' }}>Review for invoice adjustment</div>
            </div>
          </div>

          {metrics.partyBreakdown.contractor > 0 && (
            <div style={{ marginTop: '15px', padding: '12px 15px', backgroundColor: '#fef3c7', borderRadius: '6px', border: '1px solid #fde68a', fontSize: '12px', color: '#92400e' }}>
              ⚠️ <strong>${metrics.partyBreakdown.contractor.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong> in contractor-caused delays may be recoverable through back-charges or contract negotiations. Review detailed reports for documentation.
            </div>
          )}
        </div>
      )}

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>

        {/* Spread Comparison */}
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Spread Comparison</h3>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>Sorted by efficiency (worst first)</p>

          {metrics.spreadComparison.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No spread data available</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Spread</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Inertia</th>
                  <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Value Lost</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Systemic</th>
                </tr>
              </thead>
              <tbody>
                {metrics.spreadComparison.map(spread => (
                  <tr key={spread.spread} style={{ backgroundColor: spread.inertiaRatio < 70 ? '#fff5f5' : spread.inertiaRatio < 90 ? '#fffbf0' : '#fff' }}>
                    <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6', fontWeight: 'bold' }}>{spread.spread}</td>
                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        backgroundColor: spread.inertiaRatio >= 90 ? '#d4edda' : spread.inertiaRatio >= 70 ? '#fff3cd' : '#f8d7da',
                        color: spread.inertiaRatio >= 90 ? '#155724' : spread.inertiaRatio >= 70 ? '#856404' : '#721c24'
                      }}>
                        {spread.inertiaRatio.toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6', color: '#dc3545', fontWeight: 'bold' }}>
                      ${spread.valueLost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                      {spread.systemicCount > 0 ? (
                        <span style={{ color: '#dc3545', fontWeight: 'bold' }}>{spread.systemicCount}</span>
                      ) : (
                        <span style={{ color: '#28a745' }}>0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Delay Reason Breakdown */}
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Systemic Delay Sources</h3>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>Value lost by delay reason</p>

          {Object.keys(metrics.delayReasonBreakdown).length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No systemic delays recorded</p>
          ) : (
            <div>
              {Object.entries(metrics.delayReasonBreakdown)
                .sort((a, b) => b[1] - a[1]) // Sort by value lost descending
                .map(([reason, valueLost]) => {
                  const maxValue = Math.max(...Object.values(metrics.delayReasonBreakdown))
                  const percentage = maxValue > 0 ? (valueLost / maxValue) * 100 : 0

                  return (
                    <div key={reason} style={{ marginBottom: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500' }}>{reasonLabels[reason] || reason}</span>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#dc3545' }}>
                          ${valueLost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div style={{ height: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${percentage}%`,
                          height: '100%',
                          backgroundColor: '#dc3545',
                          borderRadius: '4px',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>

      {/* Daily Trend */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Daily Efficiency Trend</h3>

        {metrics.dailyTrend.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>No daily data available</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '150px', minWidth: `${metrics.dailyTrend.length * 40}px` }}>
              {metrics.dailyTrend.map(day => {
                const barHeight = Math.max(10, (day.inertiaRatio / 100) * 120)
                const barColor = day.inertiaRatio >= 90 ? '#28a745' : day.inertiaRatio >= 70 ? '#ffc107' : '#dc3545'

                return (
                  <div key={day.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '35px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', color: barColor }}>
                      {day.inertiaRatio.toFixed(0)}%
                    </div>
                    <div
                      style={{
                        width: '100%',
                        maxWidth: '30px',
                        height: `${barHeight}px`,
                        backgroundColor: barColor,
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease'
                      }}
                      title={`${day.date}: ${day.inertiaRatio.toFixed(1)}% efficiency, $${day.valueLost.toFixed(0)} lost`}
                    />
                    <div style={{ fontSize: '9px', color: '#666', marginTop: '4px', transform: 'rotate(-45deg)', transformOrigin: 'center', whiteSpace: 'nowrap' }}>
                      {day.date.slice(5)} {/* Show MM-DD */}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recent Reports with Shadow Data */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Recent Reports with Efficiency Issues</h3>

        {reports.filter(r => {
          const blocks = r.activity_blocks || []
          return blocks.some(b => b.shadowAuditSummary?.delayType && b.shadowAuditSummary.delayType !== 'NONE')
        }).length === 0 ? (
          <p style={{ color: '#28a745', fontStyle: 'italic' }}>No efficiency issues found in this date range</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Date</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Spread</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Inspector</th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Delay Type</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Value Lost</th>
              </tr>
            </thead>
            <tbody>
              {reports
                .filter(r => {
                  const blocks = r.activity_blocks || []
                  return blocks.some(b => b.shadowAuditSummary?.delayType && b.shadowAuditSummary.delayType !== 'NONE')
                })
                .slice(0, 20) // Limit to 20 most recent
                .map(report => {
                  const blocks = report.activity_blocks || []
                  const totalValueLost = blocks.reduce((sum, b) => sum + (b.shadowAuditSummary?.totalValueLost || 0), 0)
                  const hasSystemic = blocks.some(b => b.shadowAuditSummary?.delayType === 'SYSTEMIC')

                  return (
                    <tr key={report.id}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>{report.date}</td>
                      <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>{report.spread}</td>
                      <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>{report.inspector_name}</td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          backgroundColor: hasSystemic ? '#f8d7da' : '#fff3cd',
                          color: hasSystemic ? '#721c24' : '#856404'
                        }}>
                          {hasSystemic ? 'SYSTEMIC' : 'ASSET'}
                        </span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6', color: '#dc3545', fontWeight: 'bold' }}>
                        ${totalValueLost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default ShadowAuditDashboard
