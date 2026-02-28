// ============================================================================
// AI AGENT STATUS ICON
// February 1, 2026
// Shows real-time AI analysis status with green pulse when clear
// ============================================================================

import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function AIAgentStatusIcon({ organizationId, onFlagClick, inspectorUserId }) {
  const [status, setStatus] = useState('idle') // 'idle' | 'analyzing' | 'clear' | 'warning' | 'flagged'
  const [lastAnalysis, setLastAnalysis] = useState(null)
  const [showTooltip, setShowTooltip] = useState(false)
  const [flagCount, setFlagCount] = useState(0)
  const [criticalCount, setCriticalCount] = useState(0)
  const [inspectorReportDates, setInspectorReportDates] = useState(null)

  // When filtering for a specific inspector, fetch their report dates first
  useEffect(() => {
    if (!inspectorUserId || !organizationId) {
      setInspectorReportDates(null)
      return
    }

    async function fetchInspectorDates() {
      try {
        const { data, error } = await supabase
          .from('daily_reports')
          .select('report_date')
          .eq('created_by', inspectorUserId)
          .eq('organization_id', organizationId)

        if (!error && data) {
          setInspectorReportDates(new Set(data.map(r => r.report_date).filter(Boolean)))
        }
      } catch (err) {
        console.error('Error fetching inspector dates:', err)
      }
    }

    fetchInspectorDates()
  }, [inspectorUserId, organizationId])

  useEffect(() => {
    if (!organizationId) return
    // If inspector filtering is requested but dates haven't loaded yet, wait
    if (inspectorUserId && inspectorReportDates === null) return

    // Fetch latest analysis status
    async function fetchStatus() {
      try {
        const { data, error } = await supabase
          .from('ai_agent_logs')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching AI status:', error)
          return
        }

        if (data) {
          // If filtering for a specific inspector, only count their flags
          if (inspectorReportDates && inspectorReportDates.size > 0) {
            const allFlags = data.analysis_result?.flags || []
            const myFlags = allFlags.filter(f => f.ticket_date && inspectorReportDates.has(f.ticket_date))
            const myCritical = myFlags.filter(f => f.severity === 'critical').length
            const myWarning = myFlags.filter(f => f.severity === 'warning').length

            // Build filtered analysis data
            const filteredData = {
              ...data,
              flags_raised: myFlags.length,
              flags_by_severity: { critical: myCritical, warning: myWarning, info: myFlags.length - myCritical - myWarning },
              analysis_result: { ...data.analysis_result, flags: myFlags }
            }

            setLastAnalysis(filteredData)
            setFlagCount(myFlags.length)
            setCriticalCount(myCritical)

            if (data.status === 'processing' || data.status === 'pending') {
              setStatus('analyzing')
            } else if (myCritical > 0) {
              setStatus('flagged')
            } else if (myFlags.length > 0) {
              setStatus('warning')
            } else if (data.status === 'completed') {
              setStatus('clear')
            } else {
              setStatus('idle')
            }
          } else if (inspectorReportDates && inspectorReportDates.size === 0) {
            // Inspector has no reports — show idle
            setLastAnalysis(null)
            setFlagCount(0)
            setCriticalCount(0)
            setStatus('idle')
          } else {
            // No inspector filter — show all org flags (admin/chief view)
            setLastAnalysis(data)
            setFlagCount(data.flags_raised || 0)
            setCriticalCount(data.flags_by_severity?.critical || 0)

            if (data.status === 'processing' || data.status === 'pending') {
              setStatus('analyzing')
            } else if (data.flags_by_severity?.critical > 0) {
              setStatus('flagged')
            } else if (data.flags_raised > 0) {
              setStatus('warning')
            } else if (data.status === 'completed') {
              setStatus('clear')
            } else {
              setStatus('idle')
            }
          }
        }
      } catch (err) {
        console.error('Error in fetchStatus:', err)
      }
    }

    fetchStatus()

    // Subscribe to real-time updates
    const channel = supabase
      .channel('ai_agent_status_' + organizationId + (inspectorUserId || ''))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ai_agent_logs',
        filter: `organization_id=eq.${organizationId}`
      }, (payload) => {
        console.log('[AI Agent] Real-time update:', payload)
        fetchStatus()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [organizationId, inspectorReportDates])

  // Status configurations matching AdminPortal color scheme
  const statusConfig = {
    idle: {
      color: '#6b7280',      // Gray
      bgColor: '#f3f4f6',
      borderColor: '#d1d5db',
      icon: '🤖',
      label: 'AI Agent Idle',
      description: 'No recent analysis',
      pulse: false
    },
    analyzing: {
      color: '#3b82f6',      // Blue
      bgColor: '#dbeafe',
      borderColor: '#93c5fd',
      icon: '⚡',
      label: 'Analyzing...',
      description: 'Processing tickets',
      pulse: true
    },
    clear: {
      color: '#16a34a',      // Green
      bgColor: '#dcfce7',
      borderColor: '#86efac',
      icon: '✅',
      label: 'All Clear',
      description: 'No issues detected',
      pulse: true            // Green pulse when clear
    },
    warning: {
      color: '#ca8a04',      // Yellow/Amber
      bgColor: '#fef9c3',
      borderColor: '#fde047',
      icon: '⚠️',
      label: `${flagCount} Warning${flagCount !== 1 ? 's' : ''}`,
      description: 'Review recommended',
      pulse: false
    },
    flagged: {
      color: '#dc2626',      // Red
      bgColor: '#fee2e2',
      borderColor: '#fca5a5',
      icon: '🚨',
      label: `${criticalCount} Critical`,
      description: 'Immediate attention required',
      pulse: true            // Red pulse for critical
    }
  }

  const config = statusConfig[status]

  // Format relative time
  function formatRelativeTime(dateString) {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (!organizationId) return null

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
    >
      {/* Status Icon Container */}
      <div
        onClick={() => setShowTooltip(!showTooltip)}
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          backgroundColor: config.bgColor,
          border: `2px solid ${config.borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.2s ease'
        }}
        className={config.pulse ? `ai-agent-pulse-${status}` : ''}
      >
        <span style={{ fontSize: '18px' }}>{config.icon}</span>

        {/* Flag count badge */}
        {flagCount > 0 && status !== 'clear' && status !== 'idle' && (
          <span style={{
            position: 'absolute',
            top: '-6px',
            right: '-6px',
            backgroundColor: config.color,
            color: 'white',
            fontSize: '10px',
            fontWeight: 'bold',
            borderRadius: '10px',
            padding: '2px 6px',
            minWidth: '18px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
          }}>
            {flagCount > 99 ? '99+' : flagCount}
          </span>
        )}
      </div>

      {/* Tooltip Backdrop - click to close */}
      {showTooltip && (
        <div
          onClick={() => setShowTooltip(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999
          }}
        />
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '10px',
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '14px 18px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
          zIndex: 1000,
          minWidth: '280px',
          maxWidth: '340px'
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            paddingBottom: '10px',
            borderBottom: '1px solid #f3f4f6'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>{config.icon}</span>
              <div>
                <div style={{
                  fontWeight: 'bold',
                  fontSize: '14px',
                  color: config.color
                }}>
                  {config.label}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {config.description}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowTooltip(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#9ca3af',
                padding: '0',
                lineHeight: '1'
              }}
            >
              ×
            </button>
          </div>

          {/* Last Analysis Details */}
          {lastAnalysis ? (
            <div style={{ fontSize: '12px', color: '#374151' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '10px'
              }}>
                <div>
                  <span style={{ color: '#6b7280' }}>Last Run:</span>
                  <div style={{ fontWeight: '500' }}>
                    {formatRelativeTime(lastAnalysis.completed_at || lastAnalysis.created_at)}
                  </div>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>Tickets:</span>
                  <div style={{ fontWeight: '500' }}>
                    {lastAnalysis.analysis_result?.metrics?.tickets_analyzed || 0}
                  </div>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>Efficiency:</span>
                  <div style={{ fontWeight: '500' }}>
                    {lastAnalysis.analysis_result?.metrics?.efficiency_score?.toFixed(1) || '—'}%
                  </div>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>Processing:</span>
                  <div style={{ fontWeight: '500' }}>
                    {lastAnalysis.processing_duration_ms ? `${lastAnalysis.processing_duration_ms}ms` : '—'}
                  </div>
                </div>
              </div>

              {/* Flags Breakdown Summary */}
              {lastAnalysis.flags_raised > 0 && (
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '10px'
                }}>
                  {lastAnalysis.flags_by_severity?.critical > 0 && (
                    <span style={{
                      padding: '3px 8px',
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      {lastAnalysis.flags_by_severity.critical} Critical
                    </span>
                  )}
                  {lastAnalysis.flags_by_severity?.warning > 0 && (
                    <span style={{
                      padding: '3px 8px',
                      backgroundColor: '#fef9c3',
                      color: '#ca8a04',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      {lastAnalysis.flags_by_severity.warning} Warning
                    </span>
                  )}
                  {lastAnalysis.flags_by_severity?.info > 0 && (
                    <span style={{
                      padding: '3px 8px',
                      backgroundColor: '#f3f4f6',
                      color: '#6b7280',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      {lastAnalysis.flags_by_severity.info} Info
                    </span>
                  )}
                </div>
              )}

              {/* Individual Flag Details - Clickable */}
              {lastAnalysis.analysis_result?.flags?.length > 0 && (
                <div style={{
                  marginBottom: '10px',
                  maxHeight: '150px',
                  overflowY: 'auto'
                }}>
                  {lastAnalysis.analysis_result.flags.map((flag, idx) => {
                    const severityColors = {
                      critical: { bg: '#fee2e2', border: '#fca5a5', text: '#dc2626' },
                      warning: { bg: '#fef9c3', border: '#fde047', text: '#ca8a04' },
                      info: { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' }
                    }
                    const colors = severityColors[flag.severity] || severityColors.info

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (onFlagClick) {
                            setShowTooltip(false)
                            onFlagClick(flag.ticket_id, flag)
                          }
                        }}
                        style={{
                          padding: '8px 10px',
                          marginBottom: '6px',
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '6px',
                          cursor: onFlagClick ? 'pointer' : 'default',
                          transition: 'transform 0.1s ease'
                        }}
                        onMouseEnter={(e) => onFlagClick && (e.currentTarget.style.transform = 'scale(1.02)')}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '4px'
                        }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            color: colors.text,
                            textTransform: 'uppercase'
                          }}>
                            {flag.type.replace(/_/g, ' ')}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            color: '#6b7280',
                            backgroundColor: 'white',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            Ticket #{flag.ticket_id}
                          </span>
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#374151',
                          lineHeight: '1.4'
                        }}>
                          {flag.message}
                        </div>
                        {flag.ticket_date && (
                          <div style={{
                            fontSize: '10px',
                            color: '#9ca3af',
                            marginTop: '4px'
                          }}>
                            {flag.ticket_date} • {flag.activity_type || 'Activity'} • {flag.contractor || 'Unknown'}
                          </div>
                        )}
                        {onFlagClick && (
                          <div style={{
                            fontSize: '10px',
                            color: colors.text,
                            marginTop: '4px',
                            fontWeight: '500'
                          }}>
                            Click to view ticket →
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* AI Summary */}
              {lastAnalysis.analysis_result?.summary && (
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '6px',
                  fontSize: '11px',
                  lineHeight: '1.5',
                  color: '#374151',
                  borderLeft: `3px solid ${config.color}`
                }}>
                  {lastAnalysis.analysis_result.summary.length > 200
                    ? lastAnalysis.analysis_result.summary.substring(0, 200) + '...'
                    : lastAnalysis.analysis_result.summary
                  }
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
              No analysis runs yet. The AI Agent will analyze daily tickets and flag anomalies.
            </div>
          )}

          {/* Trigger Source */}
          {lastAnalysis?.trigger_source && (
            <div style={{
              marginTop: '10px',
              paddingTop: '10px',
              borderTop: '1px solid #f3f4f6',
              fontSize: '10px',
              color: '#9ca3af',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Triggered by: {lastAnalysis.trigger_source}
            </div>
          )}
        </div>
      )}

      {/* Pulse Animation Styles */}
      <style>{`
        @keyframes aiAgentPulseGreen {
          0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.5); }
          70% { box-shadow: 0 0 0 12px rgba(22, 163, 74, 0); }
          100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
        }
        @keyframes aiAgentPulseRed {
          0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5); }
          70% { box-shadow: 0 0 0 12px rgba(220, 38, 38, 0); }
          100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
        }
        @keyframes aiAgentPulseBlue {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
          70% { box-shadow: 0 0 0 12px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
        .ai-agent-pulse-clear {
          animation: aiAgentPulseGreen 2s infinite;
        }
        .ai-agent-pulse-flagged {
          animation: aiAgentPulseRed 1.5s infinite;
        }
        .ai-agent-pulse-analyzing {
          animation: aiAgentPulseBlue 1s infinite;
        }
      `}</style>
    </div>
  )
}
