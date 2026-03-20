import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { useAuth } from '../AuthContext.jsx'
import { useOrgPath } from '../contexts/OrgContext.jsx'
import FeedEstimateSetup from './FeedEstimateSetup.jsx'
import FeedWBSTable from './FeedWBSTable.jsx'
import FeedRiskRegister from './FeedRiskRegister.jsx'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'

const formatCurrency = (val) => {
  if (val == null || val === '') return '$0'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(val)
}

const GRADE_COLORS = { A: '#2e7d32', B: '#558b2f', C: '#e65100', D: '#c62828' }

const STATUS_BADGES = {
  draft: { label: 'Draft', bg: '#e0e0e0', color: '#555' },
  approved_for_FID: { label: 'Approved for FID', bg: '#c8e6c9', color: '#2e7d32' },
  superseded: { label: 'Superseded', bg: '#ffcdd2', color: '#c62828' }
}

export default function FeedDashboard() {
  const { addOrgFilter, getOrgId, organizationId } = useOrgQuery()
  const { userProfile } = useAuth()

  const [activeTab, setActiveTab] = useState('overview')
  const [estimate, setEstimate] = useState(null)       // raw feed_estimates row
  const [summary, setSummary] = useState(null)          // feed_estimate_summary view
  const [wbsData, setWbsData] = useState([])
  const [riskStats, setRiskStats] = useState({ open: 0, closed: 0, escalated: 0, openAllowance: 0, closedImpact: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (organizationId) loadDashboardData()
  }, [organizationId])

  async function loadDashboardData() {
    setLoading(true)
    try {
      // Load from summary view (has rolled-up metrics)
      let sumQuery = supabase.from('feed_estimate_summary').select('*')
      sumQuery = addOrgFilter(sumQuery)
      const { data: sumData } = await sumQuery.maybeSingle()
      setSummary(sumData)

      if (sumData) {
        // Also load raw estimate for the setup form
        const { data: estData } = await supabase
          .from('feed_estimates')
          .select('*')
          .eq('id', sumData.feed_estimate_id)
          .single()
        setEstimate(estData)

        // Load WBS variance data for chart
        let wbsQuery = supabase
          .from('feed_wbs_variance')
          .select('*')
          .eq('feed_estimate_id', sumData.feed_estimate_id)
          .order('sort_order', { ascending: true })
        wbsQuery = addOrgFilter(wbsQuery)
        const { data: wbs } = await wbsQuery
        setWbsData(wbs || [])

        // Load risk stats with cost data
        let riskQuery = supabase
          .from('feed_risks')
          .select('status, cost_allowance')
          .eq('feed_estimate_id', sumData.feed_estimate_id)
        riskQuery = addOrgFilter(riskQuery)
        const { data: risksData } = await riskQuery

        const stats = { open: 0, closed: 0, escalated: 0, openAllowance: 0, closedImpact: 0 }
        ;(risksData || []).forEach(r => {
          if (r.status === 'open') {
            stats.open++
            stats.openAllowance += parseFloat(r.cost_allowance) || 0
          } else if (r.status === 'closed' || r.status === 'not_encountered') {
            stats.closed++
          } else if (r.status === 'escalated') {
            stats.escalated++
          }
        })

        // Load closeout cost impacts
        let closeoutQuery = supabase
          .from('feed_risk_closeouts')
          .select('actual_cost_impact')
        closeoutQuery = addOrgFilter(closeoutQuery)
        const { data: closeouts } = await closeoutQuery
        stats.closedImpact = (closeouts || []).reduce((sum, c) => sum + (parseFloat(c.actual_cost_impact) || 0), 0)

        setRiskStats(stats)
      } else {
        setEstimate(null)
      }
    } catch (err) {
      console.error('Error loading FEED dashboard:', err)
    }
    setLoading(false)
  }

  const tabButtonStyle = (isActive) => ({
    padding: '12px 20px',
    backgroundColor: isActive ? '#fff' : '#f8f9fa',
    border: 'none',
    borderBottom: isActive ? '3px solid #1a5f2a' : '3px solid transparent',
    cursor: 'pointer',
    fontWeight: isActive ? 'bold' : 'normal',
    fontSize: '14px',
    whiteSpace: 'nowrap'
  })

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading FEED Intelligence...</div>
  }

  // No estimate yet — show setup prompt
  if (!estimate) {
    const userRole = userProfile?.role || ''
    const canSetup = ['pm', 'cm', 'admin', 'super_admin', 'exec', 'chief_inspector'].includes(userRole)

    if (!canSetup) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ maxWidth: '500px', margin: '0 auto', padding: '40px', backgroundColor: '#f8f9fa', borderRadius: '12px' }}>
            <h2 style={{ color: '#333', margin: '0 0 8px' }}>No FEED Estimate Linked</h2>
            <p style={{ color: '#666' }}>A project manager or admin needs to set up the FEED estimate before this module can be used.</p>
          </div>
        </div>
      )
    }

    return (
      <div style={{ padding: '40px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h2 style={{ color: '#1a5f2a', margin: '0 0 8px' }}>FEED Intelligence Module</h2>
            <p style={{ color: '#666', marginBottom: '24px' }}>Connect your FEED estimate to actual field spend to hold EPCM firms accountable for estimating accuracy.</p>
          </div>
          <FeedEstimateSetup
            projectId={null}
            onSaved={(result) => {
              setEstimate(result)
              setActiveTab('wbs')
              loadDashboardData()
            }}
          />
        </div>
      </div>
    )
  }

  // Use summary view data for metrics
  const totalEstimated = summary?.total_estimate || 0
  const totalActual = summary?.total_actual || 0
  const totalVariance = summary?.total_variance_amount || (totalActual - totalEstimated)
  const variancePct = summary?.total_variance_pct
  const accuracyGrade = summary?.epcm_accuracy_grade || '—'
  const gradeColor = GRADE_COLORS[accuracyGrade] || '#999'
  const wbsItemCount = summary?.wbs_item_count || 0
  const wbsWithActuals = summary?.wbs_items_with_actuals || 0
  const statusBadge = STATUS_BADGES[estimate.approval_status] || STATUS_BADGES.draft

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #ddd', padding: '16px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: '0 0 4px', color: '#1a5f2a' }}>FEED Intelligence</h2>
            {/* Metadata row */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', fontSize: '13px', color: '#666', marginTop: '6px' }}>
              {estimate.epcm_firm && (
                <span><strong>EPCM:</strong> {estimate.epcm_firm}</span>
              )}
              <span style={{ padding: '2px 8px', backgroundColor: statusBadge.bg, color: statusBadge.color, borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                {statusBadge.label}
              </span>
              <span>{estimate.estimate_class} {estimate.estimate_version && `· ${estimate.estimate_version}`}</span>
              {estimate.estimate_basis_year && (
                <span>Basis: {estimate.estimate_basis_year}</span>
              )}
              {estimate.contingency_pct != null && (
                <span>Contingency: {estimate.contingency_pct}%</span>
              )}
              {estimate.escalation_pct != null && (
                <span>Escalation: {estimate.escalation_pct}%</span>
              )}
              {estimate.estimate_date && (
                <span>{estimate.estimate_date}</span>
              )}
              {estimate.source_document_url && (
                <a href={estimate.source_document_url} target="_blank" rel="noopener noreferrer" style={{ color: '#1565c0', textDecoration: 'none' }}>
                  View FEED report &rarr;
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', backgroundColor: '#f8f9fa', overflowX: 'auto' }}>
        <button onClick={() => setActiveTab('overview')} style={tabButtonStyle(activeTab === 'overview')}>Overview</button>
        <button onClick={() => setActiveTab('setup')} style={tabButtonStyle(activeTab === 'setup')}>Estimate Setup</button>
        <button onClick={() => setActiveTab('wbs')} style={tabButtonStyle(activeTab === 'wbs')}>
          WBS & Costs
          {wbsItemCount > 0 && <span style={{ marginLeft: '6px', backgroundColor: '#1a5f2a', color: '#fff', padding: '2px 6px', borderRadius: '10px', fontSize: '11px' }}>{wbsItemCount}</span>}
        </button>
        <button onClick={() => setActiveTab('risks')} style={tabButtonStyle(activeTab === 'risks')}>
          Risk Register
          {riskStats.open > 0 && <span style={{ marginLeft: '6px', backgroundColor: '#f44336', color: '#fff', padding: '2px 6px', borderRadius: '10px', fontSize: '11px' }}>{riskStats.open}</span>}
        </button>
      </div>

      {/* Tab content */}
      <div>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div style={{ padding: '24px' }}>
            {/* Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <MetricCard
                label="FEED Estimate"
                value={formatCurrency(totalEstimated)}
                sub={`${estimate.estimate_class} · ${estimate.estimate_version || 'V1'}`}
                color="#1a5f2a"
              />
              <MetricCard
                label="Actual LEM Spend"
                value={formatCurrency(totalActual)}
                sub={`${wbsWithActuals} of ${wbsItemCount} items tagged`}
                color="#1565c0"
              />
              <MetricCard
                label="Total Variance"
                value={formatCurrency(totalVariance)}
                sub={variancePct != null ? `${variancePct > 0 ? '+' : ''}${variancePct}%` : 'No actuals yet'}
                color={variancePct != null ? (Math.abs(variancePct) <= 10 ? '#2e7d32' : '#c62828') : '#666'}
              />
              <div style={{
                backgroundColor: '#fff', borderRadius: '8px', padding: '20px',
                border: '1px solid #eee', borderLeft: `4px solid ${gradeColor}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600' }}>
                  EPCM Accuracy Grade
                </div>
                <div style={{ fontSize: '42px', fontWeight: 'bold', color: gradeColor, lineHeight: 1 }}>
                  {accuracyGrade}
                </div>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  {variancePct != null ? `Based on ${variancePct > 0 ? '+' : ''}${variancePct}% overall variance` : 'Awaiting actuals'}
                </div>
              </div>
            </div>

            {/* Horizontal bar chart */}
            {wbsData.length > 0 ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #eee', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 16px', color: '#333' }}>Estimated vs Actual by Scope</h4>
                <ResponsiveContainer width="100%" height={Math.max(250, wbsData.length * 50)}>
                  <BarChart
                    layout="vertical"
                    data={wbsData.map(w => ({
                      name: w.scope_name || w.wbs_code || '—',
                      estimated: parseFloat(w.estimated_amount) || 0,
                      actual: parseFloat(w.actual_amount) || 0
                    }))}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(val) => formatCurrency(val)} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(val) => formatCurrency(val)} />
                    <Legend />
                    <Bar dataKey="estimated" name="FEED Estimated" fill="#1a5f2a" opacity={0.6} />
                    <Bar dataKey="actual" name="Actual LEM Spend">
                      {wbsData.map((w, idx) => {
                        const pct = w.variance_pct != null ? Math.abs(parseFloat(w.variance_pct)) : 0
                        const color = pct <= 5 ? '#4caf50' : pct <= 15 ? '#ff9800' : '#f44336'
                        return <Cell key={idx} fill={color} />
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '12px', color: '#666' }}>
                  <span><span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', backgroundColor: '#4caf50', marginRight: '4px', verticalAlign: 'middle' }}></span> Within 5%</span>
                  <span><span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', backgroundColor: '#ff9800', marginRight: '4px', verticalAlign: 'middle' }}></span> 5–15%</span>
                  <span><span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', backgroundColor: '#f44336', marginRight: '4px', verticalAlign: 'middle' }}></span> &gt;15%</span>
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '40px', border: '1px solid #eee', textAlign: 'center', color: '#666', marginBottom: '24px' }}>
                No WBS line items yet. Go to the "WBS & Costs" tab to add scope items.
              </div>
            )}

            {/* Risk Register Summary Strip */}
            <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #eee' }}>
              <h4 style={{ margin: '0 0 12px', color: '#333' }}>Risk Register</h4>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                <RiskStat label="Open Risks" count={riskStats.open} color="#1565c0" sub={riskStats.openAllowance > 0 ? `${formatCurrency(riskStats.openAllowance)} allowance` : null} />
                <RiskStat label="Closed" count={riskStats.closed} color="#4caf50" sub={riskStats.closedImpact > 0 ? `${formatCurrency(riskStats.closedImpact)} actual impact` : null} />
                <RiskStat label="Escalated" count={riskStats.escalated} color="#f44336" />
                <button
                  onClick={() => setActiveTab('risks')}
                  style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: '13px', border: '1px solid #1565c0', borderRadius: '6px', backgroundColor: '#fff', color: '#1565c0', cursor: 'pointer' }}
                >
                  View full risk register &rarr;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Setup Tab */}
        {activeTab === 'setup' && (
          <FeedEstimateSetup
            projectId={estimate.project_id}
            onSaved={(result) => {
              setEstimate(result)
              loadDashboardData()
            }}
          />
        )}

        {/* WBS Tab */}
        {activeTab === 'wbs' && (
          <FeedWBSTable feedEstimateId={estimate.id} projectId={estimate.project_id} />
        )}

        {/* Risks Tab */}
        {activeTab === 'risks' && (
          <FeedRiskRegister feedEstimateId={estimate.id} projectId={estimate.project_id} />
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{
      backgroundColor: '#fff', borderRadius: '8px', padding: '20px',
      border: '1px solid #eee', borderLeft: `4px solid ${color}`
    }}>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 'bold', color }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

function RiskStat({ label, count, color, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{
        width: '32px', height: '32px', borderRadius: '50%',
        backgroundColor: color + '20', color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 'bold', fontSize: '14px'
      }}>
        {count}
      </span>
      <div>
        <div style={{ fontSize: '13px', color: '#555' }}>{label}</div>
        {sub && <div style={{ fontSize: '11px', color: '#999' }}>{sub}</div>}
      </div>
    </div>
  )
}
