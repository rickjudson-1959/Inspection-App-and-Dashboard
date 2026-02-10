// MeetingAgendaGenerator.jsx - AI-powered management meeting agenda generator
// Uses Goodhart's Law efficiency metrics from ShadowAuditDashboard to create data-driven agendas

import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import {
  aggregateReliabilityScore,
  aggregateEfficiencyVerification,
  aggregateValueLostByParty,
  calculateTotalBilledHours,
  calculateTotalShadowHours,
  calculateValueLost
} from '../shadowAuditUtils.js'

function MeetingAgendaGenerator() {
  const { addOrgFilter, organizationId, isReady } = useOrgQuery()

  // Date range state
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })
  const [meetingDate, setMeetingDate] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [customFocus, setCustomFocus] = useState('')

  // Data state
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState([])
  const [spreads, setSpreads] = useState([])
  const [selectedSpread, setSelectedSpread] = useState('all')

  // Agenda state
  const [generating, setGenerating] = useState(false)
  const [agenda, setAgenda] = useState(null)
  const [error, setError] = useState(null)
  const [savedAgendas, setSavedAgendas] = useState([])

  useEffect(() => {
    if (isReady()) {
      fetchReports()
      fetchSavedAgendas()
    }
  }, [dateRange, selectedSpread, organizationId])

  async function fetchReports() {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('daily_reports')
      .select('id, date, spread, inspector_name, activity_blocks')
      .gte('date', dateRange.start)
      .lte('date', dateRange.end)
      .order('date', { ascending: false })

    if (selectedSpread !== 'all') {
      query = query.eq('spread', selectedSpread)
    }
    query = addOrgFilter(query)

    const { data, error: fetchError } = await query

    if (fetchError) {
      console.error('Error fetching reports:', fetchError)
      setError('Failed to load reports')
      setLoading(false)
      return
    }

    setReports(data || [])

    // Extract unique spreads
    const uniqueSpreads = [...new Set((data || []).map(r => r.spread).filter(Boolean))]
    setSpreads(uniqueSpreads)
    setLoading(false)
  }

  async function fetchSavedAgendas() {
    if (!organizationId) return

    const { data } = await supabase
      .from('ai_agent_logs')
      .select('id, created_at, result_summary, metadata')
      .eq('organization_id', organizationId)
      .eq('query_type', 'meeting_agenda')
      .order('created_at', { ascending: false })
      .limit(5)

    setSavedAgendas(data || [])
  }

  // Calculate metrics from reports
  const metrics = useMemo(() => {
    if (!reports || reports.length === 0) {
      return null
    }

    const allBlocks = reports.flatMap(r => r.activity_blocks || [])
    const reliability = aggregateEfficiencyVerification(allBlocks)
    const partyBreakdown = aggregateValueLostByParty(allBlocks, {}, {})

    let totalBilledHours = 0
    let totalShadowHours = 0
    let totalValueLost = 0
    let systemicDelayCount = 0
    let assetDelayCount = 0
    const delayReasonBreakdown = {}
    const spreadData = {}

    for (const report of reports) {
      const blocks = report.activity_blocks || []

      for (const block of blocks) {
        const summary = block.shadowAuditSummary

        if (summary) {
          totalBilledHours += summary.totalBilledHours || 0
          totalShadowHours += summary.totalShadowHours || 0
          totalValueLost += summary.totalValueLost || 0

          if (summary.delayType === 'SYSTEMIC') {
            systemicDelayCount++
            const reason = summary.systemicDelay?.reason || 'unspecified'
            delayReasonBreakdown[reason] = (delayReasonBreakdown[reason] || 0) + (summary.totalValueLost || 0)
          } else if (summary.delayType === 'ASSET_SPECIFIC') {
            assetDelayCount++
          }
        } else {
          totalBilledHours += calculateTotalBilledHours(block)
          totalShadowHours += calculateTotalShadowHours(block)
          totalValueLost += calculateValueLost(block, {}, {})
        }

        // Spread comparison
        const spread = report.spread || 'Unknown'
        if (!spreadData[spread]) {
          spreadData[spread] = { billed: 0, shadow: 0, valueLost: 0, systemicCount: 0, assetCount: 0 }
        }
        spreadData[spread].billed += summary?.totalBilledHours || calculateTotalBilledHours(block)
        spreadData[spread].shadow += summary?.totalShadowHours || calculateTotalShadowHours(block)
        spreadData[spread].valueLost += summary?.totalValueLost || 0
        if (summary?.delayType === 'SYSTEMIC') spreadData[spread].systemicCount++
        if (summary?.delayType === 'ASSET_SPECIFIC') spreadData[spread].assetCount++
      }
    }

    const spreadComparison = Object.entries(spreadData).map(([spread, data]) => ({
      spread,
      ...data,
      inertiaRatio: data.billed > 0 ? (data.shadow / data.billed) * 100 : 100
    })).sort((a, b) => a.inertiaRatio - b.inertiaRatio)

    const overallInertiaRatio = totalBilledHours > 0
      ? (totalShadowHours / totalBilledHours) * 100
      : 100

    return {
      totalBilledHours,
      totalShadowHours,
      totalValueLost,
      overallInertiaRatio,
      systemicDelayCount,
      assetDelayCount,
      delayReasonBreakdown,
      partyBreakdown,
      spreadComparison,
      reliability: {
        ...reliability,
        trueCostOfCompletion: totalValueLost + (reliability.totalReworkCost || 0)
      },
      reportCount: reports.length,
      dateRange
    }
  }, [reports, dateRange])

  async function generateAgenda() {
    if (!metrics || !organizationId) {
      setError('No data available to generate agenda')
      return
    }

    setGenerating(true)
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-meeting-agenda', {
        body: {
          organization_id: organizationId,
          metrics,
          meeting_date: meetingDate,
          custom_focus: customFocus || null
        }
      })

      if (fnError) throw fnError

      setAgenda(data)
      fetchSavedAgendas() // Refresh saved agendas list
    } catch (err) {
      console.error('Error generating agenda:', err)
      setError('Failed to generate agenda. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function copyToClipboard() {
    if (!agenda?.agenda) return
    navigator.clipboard.writeText(agenda.agenda)
    alert('Agenda copied to clipboard!')
  }

  function downloadAgenda() {
    if (!agenda?.agenda) return

    const blob = new Blob([agenda.agenda], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meeting-agenda-${meetingDate}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading efficiency data...</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: '0 0 5px 0' }}>AI Meeting Agenda Generator</h2>
          <p style={{ color: '#666', margin: 0 }}>
            Generate data-driven management meeting agendas based on efficiency metrics
          </p>
        </div>
      </div>

      {/* Configuration Panel */}
      <div style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: '0 0 15px 0' }}>Agenda Configuration</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          {/* Data Range */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
              Data Range (Source)
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', flex: 1 }}
              />
              <span>to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', flex: 1 }}
              />
            </div>
          </div>

          {/* Meeting Date */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
              Meeting Date
            </label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', width: '100%' }}
            />
          </div>

          {/* Spread Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
              Filter by Spread (Optional)
            </label>
            <select
              value={selectedSpread}
              onChange={(e) => setSelectedSpread(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '100%' }}
            >
              <option value="all">All Spreads</option>
              {spreads.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Focus */}
        <div style={{ marginTop: '15px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
            Additional Focus Area (Optional)
          </label>
          <input
            type="text"
            value={customFocus}
            onChange={(e) => setCustomFocus(e.target.value)}
            placeholder="e.g., Safety incident follow-up, Schedule recovery plan, Contractor performance review..."
            style={{ padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', width: '100%' }}
          />
        </div>
      </div>

      {/* Metrics Preview */}
      {metrics && (
        <div style={{
          backgroundColor: '#fff',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          marginBottom: '20px'
        }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Data Preview ({metrics.reportCount} reports)</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
            <div style={{
              padding: '15px',
              backgroundColor: metrics.overallInertiaRatio >= 90 ? '#d4edda' : metrics.overallInertiaRatio >= 70 ? '#fff3cd' : '#f8d7da',
              borderRadius: '6px'
            }}>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Inertia Ratio</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{metrics.overallInertiaRatio.toFixed(1)}%</div>
            </div>

            <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Value Lost</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc3545' }}>
                ${metrics.totalValueLost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>

            <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Systemic Delays</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: metrics.systemicDelayCount > 0 ? '#dc3545' : '#28a745' }}>
                {metrics.systemicDelayCount}
              </div>
            </div>

            <div style={{
              padding: '15px',
              backgroundColor: metrics.reliability.overallReliability === 'RELIABLE' ? '#d4edda' :
                             metrics.reliability.overallReliability === 'QUESTIONABLE' ? '#fff3cd' : '#f8d7da',
              borderRadius: '6px'
            }}>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Data Reliability</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                {metrics.reliability.overallReliability}
              </div>
            </div>

            {metrics.partyBreakdown.contractor > 0 && (
              <div style={{ padding: '15px', backgroundColor: '#fef3c7', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Back-Charge Potential</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ca8a04' }}>
                  ${metrics.partyBreakdown.contractor.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button
              onClick={generateAgenda}
              disabled={generating || !metrics}
              style={{
                padding: '15px 40px',
                fontSize: '16px',
                fontWeight: 'bold',
                backgroundColor: generating ? '#6c757d' : '#003366',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: generating ? 'not-allowed' : 'pointer'
              }}
            >
              {generating ? 'Generating Agenda...' : 'Generate Meeting Agenda'}
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {/* Generated Agenda */}
      {agenda && (
        <div style={{
          backgroundColor: '#fff',
          padding: '25px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Generated Agenda - {agenda.organization}</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={copyToClipboard}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Copy to Clipboard
              </button>
              <button
                onClick={downloadAgenda}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Download as Markdown
              </button>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
            Generated at {new Date(agenda.generatedAt).toLocaleString()}
            {' | '}
            Based on {agenda.metricsUsed?.reportCount} reports
            {' | '}
            Inertia: {agenda.metricsUsed?.inertiaRatio?.toFixed(1)}%
            {' | '}
            Reliability: {agenda.metricsUsed?.reliability}
          </div>

          <div style={{
            padding: '20px',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: '1.6',
            maxHeight: '600px',
            overflowY: 'auto'
          }}>
            {agenda.agenda}
          </div>
        </div>
      )}

      {/* Recent Agendas */}
      {savedAgendas.length > 0 && (
        <div style={{
          backgroundColor: '#fff',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Recent Agendas</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Date Generated</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Meeting Date</th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Inertia</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Value Lost</th>
              </tr>
            </thead>
            <tbody>
              {savedAgendas.map(item => (
                <tr key={item.id}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>
                    {item.metadata?.meeting_date || '-'}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      backgroundColor: (item.metadata?.metrics_summary?.inertiaRatio || 0) >= 90 ? '#d4edda' :
                                       (item.metadata?.metrics_summary?.inertiaRatio || 0) >= 70 ? '#fff3cd' : '#f8d7da'
                    }}>
                      {item.metadata?.metrics_summary?.inertiaRatio?.toFixed(1) || '-'}%
                    </span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #dee2e6', color: '#dc3545', fontWeight: 'bold' }}>
                    ${(item.metadata?.metrics_summary?.valueLost || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No Data State */}
      {!metrics && !loading && (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ color: '#666' }}>No Data Available</h3>
          <p style={{ color: '#999' }}>
            Adjust the date range to include reports with efficiency data.
          </p>
        </div>
      )}
    </div>
  )
}

export default MeetingAgendaGenerator
