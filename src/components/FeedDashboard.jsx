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

function getAccuracyGrade(variancePct) {
  if (variancePct == null) return { grade: '—', color: '#999' }
  const abs = Math.abs(variancePct)
  if (abs <= 5) return { grade: 'A', color: '#2e7d32' }
  if (abs <= 10) return { grade: 'B', color: '#558b2f' }
  if (abs <= 20) return { grade: 'C', color: '#e65100' }
  return { grade: 'D', color: '#c62828' }
}

export default function FeedDashboard() {
  const { addOrgFilter, getOrgId, organizationId } = useOrgQuery()
  const { userProfile } = useAuth()

  const [activeTab, setActiveTab] = useState('overview')
  const [estimate, setEstimate] = useState(null)
  const [wbsData, setWbsData] = useState([])
  const [riskCounts, setRiskCounts] = useState({ open: 0, closed: 0, escalated: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (organizationId) loadDashboardData()
  }, [organizationId])

  async function loadDashboardData() {
    setLoading(true)
    try {
      // Load feed estimate
      let estQuery = supabase
        .from('feed_estimates')
        .select('*')
      estQuery = addOrgFilter(estQuery)
      const { data: estData } = await estQuery.maybeSingle()
      setEstimate(estData)

      if (estData) {
        // Load WBS variance data
        let wbsQuery = supabase
          .from('feed_wbs_variance')
          .select('*')
          .eq('feed_estimate_id', estData.id)
          .order('sort_order', { ascending: true })
        wbsQuery = addOrgFilter(wbsQuery)
        const { data: wbs } = await wbsQuery
        setWbsData(wbs || [])

        // Load risk counts
        let riskQuery = supabase
          .from('feed_risks')
          .select('status')
          .eq('feed_estimate_id', estData.id)
        riskQuery = addOrgFilter(riskQuery)
        const { data: risksData } = await riskQuery
        const counts = { open: 0, closed: 0, escalated: 0 }
        ;(risksData || []).forEach(r => {
          if (r.status === 'open') counts.open++
          else if (r.status === 'closed' || r.status === 'not_encountered') counts.closed++
          else if (r.status === 'escalated') counts.escalated++
        })
        setRiskCounts(counts)
      }
    } catch (err) {
      console.error('Error loading FEED dashboard:', err)
    }
    setLoading(false)
  }

  // Computed metrics
  const totalEstimated = estimate?.total_estimate || wbsData.reduce((sum, w) => sum + (parseFloat(w.estimated_amount) || 0), 0)
  const totalActual = wbsData.reduce((sum, w) => sum + (parseFloat(w.actual_amount) || 0), 0)
  const totalVariance = totalActual - totalEstimated
  const variancePct = totalEstimated > 0 ? ((totalActual - totalEstimated) / totalEstimated) * 100 : null
  const { grade, color: gradeColor } = getAccuracyGrade(variancePct)

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
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading FEED Intelligence...</p>
      </div>
    )
  }

  // No estimate yet — show setup prompt
  if (!estimate) {
    const userRole = userProfile?.role || ''
    const canSetup = ['pm', 'cm', 'admin', 'super_admin', 'exec'].includes(userRole)

    if (!canSetup) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ maxWidth: '500px', margin: '0 auto', padding: '40px', backgroundColor: '#f8f9fa', borderRadius: '12px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#128202;</div>
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
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#128202;</div>
            <h2 style={{ color: '#1a5f2a', margin: '0 0 8px' }}>FEED Intelligence Module</h2>
            <p style={{ color: '#666', marginBottom: '24px' }}>Connect your FEED (Front End Engineering Design) estimate to actual field spend to hold EPCM firms accountable for estimating accuracy.</p>
          </div>
          <FeedEstimateSetup
            projectId={null}
            onSaved={(result) => {
              setEstimate(result)
              setActiveTab('wbs')
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #ddd', padding: '16px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: '0 0 4px', color: '#1a5f2a' }}>FEED Intelligence</h2>
            <div style={{ fontSize: '13px', color: '#666' }}>
              {estimate.epcm_firm && <span><strong>EPCM:</strong> {estimate.epcm_firm} &nbsp;|&nbsp; </span>}
              <strong>{estimate.estimate_class}</strong>
              {estimate.estimate_date && <span> &nbsp;|&nbsp; {estimate.estimate_date}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', backgroundColor: '#f8f9fa', overflowX: 'auto' }}>
        <button onClick={() => setActiveTab('overview')} style={tabButtonStyle(activeTab === 'overview')}>
          Overview
        </button>
        <button onClick={() => setActiveTab('setup')} style={tabButtonStyle(activeTab === 'setup')}>
          Estimate Setup
        </button>
        <button onClick={() => setActiveTab('wbs')} style={tabButtonStyle(activeTab === 'wbs')}>
          WBS Breakdown
          {wbsData.length > 0 && <span style={{ marginLeft: '6px', backgroundColor: '#1a5f2a', color: '#fff', padding: '2px 6px', borderRadius: '10px', fontSize: '11px' }}>{wbsData.length}</span>}
        </button>
        <button onClick={() => setActiveTab('risks')} style={tabButtonStyle(activeTab === 'risks')}>
          Risk Register
          {riskCounts.open > 0 && <span style={{ marginLeft: '6px', backgroundColor: '#f44336', color: '#fff', padding: '2px 6px', borderRadius: '10px', fontSize: '11px' }}>{riskCounts.open}</span>}
        </button>
      </div>

      {/* Tab content */}
      <div style={{ padding: '0' }}>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div style={{ padding: '24px' }}>
            {/* Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <MetricCard
                label="FEED Estimate Total"
                value={formatCurrency(totalEstimated)}
                color="#1a5f2a"
              />
              <MetricCard
                label="Actual LEM Spend"
                value={formatCurrency(totalActual)}
                color="#1565c0"
              />
              <MetricCard
                label="Total Variance"
                value={`${formatCurrency(totalVariance)} (${variancePct != null ? `${variancePct > 0 ? '+' : ''}${variancePct.toFixed(1)}%` : '—'})`}
                color={variancePct != null ? (Math.abs(variancePct) <= 10 ? '#2e7d32' : '#c62828') : '#666'}
              />
              <MetricCard
                label="EPCM Accuracy Grade"
                value={grade}
                color={gradeColor}
                large
              />
            </div>

            {/* Horizontal bar chart */}
            {wbsData.length > 0 ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #eee', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 16px', color: '#333' }}>Estimated vs Actual by WBS Scope</h4>
                <ResponsiveContainer width="100%" height={Math.max(250, wbsData.length * 50)}>
                  <BarChart
                    layout="vertical"
                    data={wbsData.map(w => ({
                      name: w.scope_name || w.wbs_code || '—',
                      estimated: parseFloat(w.estimated_amount) || 0,
                      actual: parseFloat(w.actual_amount) || 0,
                      variancePct: w.variance_pct != null ? Math.abs(parseFloat(w.variance_pct)) : 0
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
                  <span><span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', backgroundColor: '#ff9800', marginRight: '4px', verticalAlign: 'middle' }}></span> 5-15%</span>
                  <span><span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', backgroundColor: '#f44336', marginRight: '4px', verticalAlign: 'middle' }}></span> &gt;15%</span>
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '40px', border: '1px solid #eee', textAlign: 'center', color: '#666', marginBottom: '24px' }}>
                No WBS line items yet. Go to the WBS Breakdown tab to add scope items.
              </div>
            )}

            {/* Risk Register Summary */}
            <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #eee' }}>
              <h4 style={{ margin: '0 0 12px', color: '#333' }}>Risk Register Summary</h4>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <RiskBadge label="Open" count={riskCounts.open} color="#1565c0" />
                <RiskBadge label="Closed" count={riskCounts.closed} color="#4caf50" />
                <RiskBadge label="Escalated" count={riskCounts.escalated} color="#f44336" />
              </div>
              {(riskCounts.open > 0 || riskCounts.escalated > 0) && (
                <button
                  onClick={() => setActiveTab('risks')}
                  style={{ marginTop: '12px', padding: '6px 14px', fontSize: '13px', border: '1px solid #1565c0', borderRadius: '6px', backgroundColor: '#fff', color: '#1565c0', cursor: 'pointer' }}
                >
                  View Risk Register &rarr;
                </button>
              )}
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
          <FeedWBSTable
            feedEstimateId={estimate.id}
            projectId={estimate.project_id}
          />
        )}

        {/* Risks Tab */}
        {activeTab === 'risks' && (
          <FeedRiskRegister
            feedEstimateId={estimate.id}
            projectId={estimate.project_id}
          />
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, color, large }) {
  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '8px',
      padding: '20px',
      border: '1px solid #eee',
      borderLeft: `4px solid ${color}`
    }}>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600' }}>
        {label}
      </div>
      <div style={{ fontSize: large ? '36px' : '20px', fontWeight: 'bold', color }}>
        {value}
      </div>
    </div>
  )
}

function RiskBadge({ label, count, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        backgroundColor: color + '20',
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: '14px'
      }}>
        {count}
      </span>
      <span style={{ fontSize: '13px', color: '#555' }}>{label}</span>
    </div>
  )
}
