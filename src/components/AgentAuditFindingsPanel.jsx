// ============================================================================
// AGENT AUDIT FINDINGS PANEL
// February 2, 2026
// Slide-out side panel displaying detailed AI agent findings
// Shows violation details, references, and risk assessment
// ============================================================================

import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getFlagTypeConfig, interpolateTemplate, SEVERITY_COLORS } from '../utils/flagTypeConfig'

export default function AgentAuditFindingsPanel({ isOpen, onClose, ticket, flag }) {
  const [wpsDetails, setWpsDetails] = useState(null)
  const [loadingWps, setLoadingWps] = useState(false)

  // Fetch WPS details for WPS-related flags
  useEffect(() => {
    if (!isOpen || !flag) return

    const fetchWpsDetails = async () => {
      // Only fetch WPS details for WPS/filler material flags
      if (flag.type !== 'WPS_MATERIAL_MISMATCH' && flag.type !== 'FILLER_MATERIAL_MISMATCH') {
        setWpsDetails(null)
        return
      }

      // Extract WPS number from flag details or message
      const wpsNumber = flag.details?.wps_number ||
                        flag.message?.match(/WPS[- ]?(\d+)/i)?.[1] ||
                        flag.details?.wps

      if (!wpsNumber) {
        setWpsDetails(null)
        return
      }

      setLoadingWps(true)
      try {
        const { data, error } = await supabase
          .from('wps_material_specs')
          .select('*')
          .ilike('wps_number', `%${wpsNumber}%`)
          .limit(1)
          .maybeSingle()

        if (!error && data) {
          setWpsDetails(data)
        }
      } catch (err) {
        console.error('Error fetching WPS details:', err)
      } finally {
        setLoadingWps(false)
      }
    }

    fetchWpsDetails()
  }, [isOpen, flag])

  if (!isOpen || !flag) return null

  const config = getFlagTypeConfig(flag.type)
  const colors = SEVERITY_COLORS[flag.severity || config.severity] || SEVERITY_COLORS.info

  // Build template values from flag details and ticket
  const templateValues = {
    standardWorkday: flag.details?.max_allowed || ticket?.standard_workday || 10,
    actualHours: flag.details?.actual_hours || flag.details?.billed_hours,
    percentage: flag.details?.percentage ||
      (flag.details?.actual_hours && flag.details?.max_allowed
        ? Math.round((flag.details.actual_hours / flag.details.max_allowed - 1) * 100)
        : null),
    startKp: flag.details?.contract_start_kp || ticket?.contract_start_kp,
    endKp: flag.details?.contract_end_kp || ticket?.contract_end_kp,
    actualKp: flag.details?.actual_kp || flag.details?.kp,
    efficiency: flag.details?.efficiency_score,
    wpsNumber: flag.details?.wps_number || wpsDetails?.wps_number,
    allowedFillers: flag.details?.allowed_fillers || wpsDetails?.filler_materials?.join(', '),
    actualFiller: flag.details?.actual_filler || flag.details?.filler_used,
    gapDistance: flag.details?.gap_distance,
    workerCount: flag.details?.worker_count,
    expectedCount: flag.details?.expected_count || 20
  }

  // Format date nicely
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          zIndex: 10000,
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 0.3s ease'
        }}
      />

      {/* Slide-out Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '480px',
          maxWidth: '100vw',
          backgroundColor: 'white',
          boxShadow: '-4px 0 25px rgba(0, 0, 0, 0.15)',
          zIndex: 10001,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>🤖</span>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
              Agent Audit Findings
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0',
              lineHeight: '1',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            ×
          </button>
        </div>

        {/* Ticket Info Bar */}
        <div style={{
          padding: '16px 24px',
          backgroundColor: colors.bg,
          borderBottom: `2px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '20px' }}>🎫</span>
          <div>
            <div style={{ fontWeight: '600', color: '#111827', fontSize: '15px' }}>
              Ticket #{ticket?.id?.toString().slice(-4) || flag.ticket_id} - {formatDate(ticket?.date || flag.ticket_date)}
            </div>
            {ticket?.spread && (
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                Spread: {ticket.spread} {ticket.contractor && `• ${ticket.contractor}`}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0'
        }}>
          {/* THE VIOLATION Section */}
          <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>{config.icon}</span>
              <h3 style={{
                margin: 0,
                fontSize: '12px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: colors.text
              }}>
                The Violation
              </h3>
              <span style={{
                padding: '3px 10px',
                backgroundColor: colors.badge,
                color: 'white',
                fontSize: '10px',
                fontWeight: '700',
                borderRadius: '4px',
                textTransform: 'uppercase'
              }}>
                {flag.severity || config.severity}
              </span>
            </div>

            <h4 style={{
              margin: '0 0 12px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#111827'
            }}>
              {config.violationTitle}
            </h4>

            <div style={{
              padding: '14px 16px',
              backgroundColor: colors.bg,
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              fontSize: '14px',
              color: '#374151',
              lineHeight: '1.6'
            }}>
              {flag.message}
            </div>

            {/* WPS Details (if available) */}
            {wpsDetails && (
              <div style={{
                marginTop: '16px',
                padding: '14px 16px',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  marginBottom: '10px'
                }}>
                  WPS Details - {wpsDetails.wps_number}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  {wpsDetails.base_materials && (
                    <div>
                      <span style={{ color: '#6b7280' }}>Base Materials:</span>
                      <div style={{ color: '#111827', fontWeight: '500' }}>
                        {Array.isArray(wpsDetails.base_materials)
                          ? wpsDetails.base_materials.join(', ')
                          : wpsDetails.base_materials}
                      </div>
                    </div>
                  )}
                  {wpsDetails.filler_materials && (
                    <div>
                      <span style={{ color: '#6b7280' }}>Filler Materials:</span>
                      <div style={{ color: '#111827', fontWeight: '500' }}>
                        {Array.isArray(wpsDetails.filler_materials)
                          ? wpsDetails.filler_materials.join(', ')
                          : wpsDetails.filler_materials}
                      </div>
                    </div>
                  )}
                  {wpsDetails.diameter_range && (
                    <div>
                      <span style={{ color: '#6b7280' }}>Diameter Range:</span>
                      <div style={{ color: '#111827', fontWeight: '500' }}>{wpsDetails.diameter_range}</div>
                    </div>
                  )}
                  {wpsDetails.wall_thickness_range && (
                    <div>
                      <span style={{ color: '#6b7280' }}>Wall Thickness:</span>
                      <div style={{ color: '#111827', fontWeight: '500' }}>{wpsDetails.wall_thickness_range}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {loadingWps && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                Loading WPS details...
              </div>
            )}
          </div>

          {/* THE REFERENCE Section */}
          <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>📚</span>
              <h3 style={{
                margin: 0,
                fontSize: '12px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: '#3b82f6'
              }}>
                The Reference
              </h3>
            </div>

            <div style={{
              padding: '14px 16px',
              backgroundColor: '#f0f9ff',
              borderRadius: '8px',
              border: '1px solid #bae6fd',
              fontSize: '14px',
              color: '#0c4a6e',
              lineHeight: '1.6'
            }}>
              {interpolateTemplate(config.referenceTemplate, templateValues)}
            </div>

            {/* Additional reference codes if present in flag details */}
            {flag.details?.reference_codes && (
              <div style={{
                marginTop: '12px',
                padding: '12px 14px',
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                fontSize: '12px'
              }}>
                <span style={{ color: '#6b7280', fontWeight: '500' }}>Related Standards: </span>
                <span style={{ color: '#111827' }}>{flag.details.reference_codes}</span>
              </div>
            )}
          </div>

          {/* THE RISK Section */}
          <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>⚡</span>
              <h3 style={{
                margin: 0,
                fontSize: '12px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: '#dc2626'
              }}>
                The Risk
              </h3>
            </div>

            <div style={{
              padding: '14px 16px',
              backgroundColor: '#fef2f2',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              fontSize: '14px',
              color: '#7f1d1d',
              lineHeight: '1.6'
            }}>
              {interpolateTemplate(config.riskTemplate, templateValues)}
            </div>
          </div>

          {/* Flag Details (numeric metrics) */}
          {flag.details && Object.keys(flag.details).some(k =>
            ['efficiency_score', 'billed_hours', 'shadow_hours', 'actual_hours'].includes(k)
          ) && (
            <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <span style={{ fontSize: '20px' }}>📊</span>
                <h3 style={{
                  margin: 0,
                  fontSize: '12px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: '#6b7280'
                }}>
                  Metrics
                </h3>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px'
              }}>
                {flag.details.efficiency_score !== undefined && (
                  <div style={{
                    padding: '14px',
                    backgroundColor: '#fef2f2',
                    borderRadius: '8px',
                    border: '1px solid #fecaca',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#dc2626' }}>
                      {flag.details.efficiency_score}%
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      Efficiency Score
                    </div>
                  </div>
                )}
                {flag.details.billed_hours !== undefined && (
                  <div style={{
                    padding: '14px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>
                      {flag.details.billed_hours}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      Billed Hours
                    </div>
                  </div>
                )}
                {flag.details.shadow_hours !== undefined && (
                  <div style={{
                    padding: '14px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>
                      {flag.details.shadow_hours}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      Shadow Hours
                    </div>
                  </div>
                )}
                {flag.details.actual_hours !== undefined && (
                  <div style={{
                    padding: '14px',
                    backgroundColor: '#fef2f2',
                    borderRadius: '8px',
                    border: '1px solid #fecaca',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#dc2626' }}>
                      {flag.details.actual_hours}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      Actual Hours {flag.details.max_allowed && `(Max: ${flag.details.max_allowed})`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Activity Blocks (if present) */}
          {ticket?.activity_blocks && ticket.activity_blocks.length > 0 && (
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <span style={{ fontSize: '20px' }}>📋</span>
                <h3 style={{
                  margin: 0,
                  fontSize: '12px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: '#6b7280'
                }}>
                  Activity Blocks ({ticket.activity_blocks.length})
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {ticket.activity_blocks.map((block, idx) => {
                  const isFlagged = idx === flag.activity_block_index
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '14px',
                        backgroundColor: isFlagged ? '#fef2f2' : '#f9fafb',
                        borderRadius: '8px',
                        border: isFlagged ? '2px solid #dc2626' : '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>
                            {block.activityType || 'Activity'}
                          </span>
                          {block.contractor && (
                            <span style={{ color: '#6b7280', marginLeft: '8px', fontSize: '13px' }}>
                              • {block.contractor}
                            </span>
                          )}
                        </div>
                        {isFlagged && (
                          <span style={{
                            padding: '3px 10px',
                            backgroundColor: '#dc2626',
                            color: 'white',
                            fontSize: '10px',
                            borderRadius: '4px',
                            fontWeight: '700'
                          }}>
                            FLAGGED
                          </span>
                        )}
                      </div>
                      {(block.startKp || block.endKp) && (
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                          KP: {block.startKp || '—'} → {block.endKp || '—'}
                        </div>
                      )}
                      {block.hours && (
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                          Hours: {block.hours}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            🤖 Flagged by AI Agent • {formatDate(flag.ticket_date || ticket?.date)}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              backgroundColor: '#003366',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#002244'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#003366'}
          >
            Close
          </button>
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideInFromRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
