// ============================================================================
// AI AUDIT SIDEBAR
// February 2, 2026
// Slide-out side panel displaying detailed AI agent findings
// Shows anomaly type, source citations, and action buttons
// ============================================================================

import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getFlagTypeConfig, interpolateTemplate, SEVERITY_COLORS } from '../utils/flagTypeConfig'

const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

export default function AgentAuditFindingsPanel({ isOpen, onClose, ticket, flag, onFlagAction }) {
  const [wpsDetails, setWpsDetails] = useState(null)
  const [loadingWps, setLoadingWps] = useState(false)
  const [flagStatus, setFlagStatus] = useState(null) // 'dismissed', 'flagged_for_inspector', null
  const [actionLoading, setActionLoading] = useState(false)
  const [actionNote, setActionNote] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)

  // Clarification request state
  const [showClarificationModal, setShowClarificationModal] = useState(false)
  const [clarificationDraft, setClarificationDraft] = useState('')
  const [generatingClarification, setGeneratingClarification] = useState(false)
  const [inspectorInfo, setInspectorInfo] = useState(null)
  const [clarificationCopied, setClarificationCopied] = useState(false)

  // Reset state when flag changes
  useEffect(() => {
    if (flag) {
      setFlagStatus(flag.status || null)
      setActionNote('')
      setShowNoteInput(false)
      setPendingAction(null)
    }
  }, [flag?.type, flag?.ticket_id])

  // Fetch WPS details for WPS-related flags
  useEffect(() => {
    if (!isOpen || !flag) return

    const fetchWpsDetails = async () => {
      if (flag.type !== 'WPS_MATERIAL_MISMATCH' && flag.type !== 'FILLER_MATERIAL_MISMATCH') {
        setWpsDetails(null)
        return
      }

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

  // Fetch inspector info when panel opens
  useEffect(() => {
    if (!isOpen || !ticket?.user_id) {
      setInspectorInfo(null)
      return
    }

    const fetchInspectorInfo = async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, display_name, email')
          .eq('id', ticket.user_id)
          .single()

        if (!error && data) {
          setInspectorInfo(data)
        }
      } catch (err) {
        console.error('Error fetching inspector info:', err)
      }
    }

    fetchInspectorInfo()
  }, [isOpen, ticket?.user_id])

  // Handle flag action (dismiss or flag for inspector)
  const handleFlagAction = async (action) => {
    if (showNoteInput && pendingAction === action) {
      // Execute the action with note
      setActionLoading(true)
      try {
        // Update the flag status in the analysis_result of ai_agent_logs
        // For now, we'll call the callback and let parent handle persistence
        const actionData = {
          action,
          note: actionNote,
          timestamp: new Date().toISOString(),
          flagType: flag.type,
          ticketId: flag.ticket_id || ticket?.id
        }

        if (onFlagAction) {
          await onFlagAction(actionData)
        }

        setFlagStatus(action)
        setShowNoteInput(false)
        setActionNote('')
        setPendingAction(null)
      } catch (err) {
        console.error('Error saving flag action:', err)
      } finally {
        setActionLoading(false)
      }
    } else {
      // Show note input
      setShowNoteInput(true)
      setPendingAction(action)
    }
  }

  // Generate AI clarification request
  const generateClarificationRequest = async () => {
    setGeneratingClarification(true)
    setClarificationDraft('')
    setShowClarificationModal(true)

    const config = getFlagTypeConfig(flag.type)
    const inspectorName = inspectorInfo?.display_name ||
                          ticket?.inspector_name ||
                          ticket?.user_profiles?.display_name ||
                          'Inspector'
    const ticketDate = ticket?.date || flag.ticket_date || 'the recent ticket'

    const prompt = `You are a senior pipeline construction manager writing a professional, mentor-toned message to an inspector about a discrepancy found in their daily ticket.

CONTEXT:
- Inspector Name: ${inspectorName}
- Ticket Date: ${ticketDate}
- Ticket ID: ${ticket?.id || flag.ticket_id}
- Spread: ${ticket?.spread || 'Not specified'}

DISCREPANCY DETAILS:
- Anomaly Type: ${config.anomalyType}
- Violation: ${config.violationTitle}
- Severity: ${flag.severity || config.severity}
- Description: ${flag.message}
${flag.details ? `- Additional Details: ${JSON.stringify(flag.details)}` : ''}

REFERENCE:
Source: ${config.sourceDocument}
Section: ${config.sourcePage}
${config.referenceTemplate}

Write a brief, professional email/notification that:
1. Opens with a friendly, supportive greeting
2. Clearly identifies the specific ticket and date
3. Explains the discrepancy that was detected (be specific but not accusatory)
4. References the relevant standard or specification
5. Asks them to review and correct the entry before finalization
6. Offers to help if they have questions
7. Closes warmly

Keep the tone mentor-like: supportive, educational, not punitive. The goal is to help them improve and correct the record, not to discipline. Keep it concise (under 200 words).

Output ONLY the email text, no subject line or additional formatting.`

    try {
      if (!anthropicApiKey) {
        setClarificationDraft(`Hi ${inspectorName},

I hope you're doing well. I wanted to reach out regarding your daily ticket from ${ticketDate}.

Our automated review system flagged a potential discrepancy: ${config.anomalyType}

Specifically: ${flag.message}

Reference: ${config.sourceDocument}, ${config.sourcePage}

Could you please take a moment to review this entry? If there's additional context or if a correction is needed, please update the ticket before it's finalized.

I'm happy to discuss if you have any questions or need clarification on the requirements.

Thanks for your attention to detail!

Best regards`)
        return
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      })

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`)
      }

      const data = await response.json()
      const emailText = data.content?.[0]?.text || ''
      setClarificationDraft(emailText.trim())
    } catch (err) {
      console.error('Error generating clarification:', err)
      setClarificationDraft(`Hi ${inspectorName},

I hope you're doing well. I wanted to reach out regarding your daily ticket from ${ticketDate}.

Our automated review system flagged a potential discrepancy: ${config.anomalyType}

Specifically: ${flag.message}

Reference: ${config.sourceDocument}, ${config.sourcePage}

Could you please take a moment to review this entry? If there's additional context or if a correction is needed, please update the ticket before it's finalized.

I'm happy to discuss if you have any questions or need clarification on the requirements.

Thanks for your attention to detail!

Best regards`)
    } finally {
      setGeneratingClarification(false)
    }
  }

  const copyClarification = () => {
    navigator.clipboard.writeText(clarificationDraft).then(() => {
      setClarificationCopied(true)
      setTimeout(() => setClarificationCopied(false), 2000)
    })
  }

  if (!isOpen || !flag) return null

  const config = getFlagTypeConfig(flag.type)
  const colors = SEVERITY_COLORS[flag.severity || config.severity] || SEVERITY_COLORS.info

  // Build template values
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
    expectedCount: flag.details?.expected_count || 20,
    sourceDocument: flag.details?.source_document || config.sourceDocument,
    specRequirement: flag.details?.spec_requirement,
    recordedValue: flag.details?.recorded_value
  }

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
          width: '520px',
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
          backgroundColor: '#1e3a5f',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>🤖</span>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'white' }}>
              AI Audit Sidebar
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'white',
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
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
          >
            ×
          </button>
        </div>

        {/* Status Banner (if dismissed or flagged) */}
        {flagStatus && (
          <div style={{
            padding: '12px 24px',
            backgroundColor: flagStatus === 'dismissed' ? '#f0fdf4' : '#fef3c7',
            borderBottom: `2px solid ${flagStatus === 'dismissed' ? '#86efac' : '#fcd34d'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ fontSize: '18px' }}>
              {flagStatus === 'dismissed' ? '✅' : '🚩'}
            </span>
            <span style={{ fontWeight: '600', color: flagStatus === 'dismissed' ? '#166534' : '#92400e' }}>
              {flagStatus === 'dismissed' ? 'Dismissed as False Positive' : 'Flagged for Inspector Review'}
            </span>
          </div>
        )}

        {/* Ticket Info Bar */}
        <div style={{
          padding: '16px 24px',
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '20px' }}>🎫</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', color: '#111827', fontSize: '15px' }}>
              Ticket #{ticket?.id?.toString().slice(-4) || flag.ticket_id} - {formatDate(ticket?.date || flag.ticket_date)}
            </div>
            {ticket?.spread && (
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                {ticket.spread} {ticket.contractor && `• ${ticket.contractor}`}
              </div>
            )}
          </div>
          <span style={{
            padding: '4px 12px',
            backgroundColor: colors.badge,
            color: 'white',
            fontSize: '11px',
            fontWeight: '700',
            borderRadius: '4px',
            textTransform: 'uppercase'
          }}>
            {flag.severity || config.severity}
          </span>
        </div>

        {/* Scrollable Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0'
        }}>
          {/* ANOMALY FOUND Section */}
          <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb', backgroundColor: colors.bg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '24px' }}>{config.icon}</span>
              <div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: colors.text,
                  marginBottom: '4px'
                }}>
                  Anomaly Detected
                </div>
                <h3 style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '700',
                  color: '#111827'
                }}>
                  {config.anomalyType || config.violationTitle}
                </h3>
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: `2px solid ${colors.border}`,
              fontSize: '14px',
              color: '#374151',
              lineHeight: '1.6'
            }}>
              {flag.message}
            </div>
          </div>

          {/* SOURCE CITATION Section */}
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
                Source Citation
              </h3>
            </div>

            {/* Source Document Card */}
            <div style={{
              padding: '16px',
              backgroundColor: '#f0f9ff',
              borderRadius: '8px',
              border: '1px solid #bae6fd',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>📖</span>
                <div>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#0c4a6e',
                    marginBottom: '4px'
                  }}>
                    {flag.details?.source_document || config.sourceDocument}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: '#0369a1'
                  }}>
                    {flag.details?.source_page || config.sourcePage}
                  </div>
                </div>
              </div>
            </div>

            {/* Reference Text */}
            <div style={{
              padding: '14px 16px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              fontSize: '14px',
              color: '#374151',
              lineHeight: '1.6',
              fontStyle: 'italic'
            }}>
              "{interpolateTemplate(config.referenceTemplate, templateValues)}"
            </div>

            {/* Additional reference codes if present */}
            {flag.details?.reference_codes && (
              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                backgroundColor: '#fef3c7',
                borderRadius: '6px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>📋</span>
                <span style={{ color: '#92400e' }}>
                  <strong>Also see:</strong> {flag.details.reference_codes}
                </span>
              </div>
            )}
          </div>

          {/* TECHNICAL RISK Section */}
          <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <h3 style={{
                margin: 0,
                fontSize: '12px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: '#dc2626'
              }}>
                Technical Risk
              </h3>
            </div>

            <div style={{
              padding: '16px 18px',
              backgroundColor: '#fef2f2',
              borderRadius: '8px',
              border: '2px solid #fecaca'
            }}>
              {/* Parse and render the risk template with proper bullet formatting */}
              {(() => {
                const riskText = interpolateTemplate(config.riskTemplate, templateValues)
                const lines = riskText.split('\n').filter(line => line.trim())

                return lines.map((line, idx) => {
                  const trimmed = line.trim()

                  // Header line (TECHNICAL RISK:)
                  if (trimmed.startsWith('TECHNICAL RISK') || trimmed.startsWith('CRITICAL:')) {
                    return (
                      <div key={idx} style={{
                        fontSize: '13px',
                        fontWeight: '700',
                        color: '#991b1b',
                        marginBottom: '10px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        {trimmed.replace(':', '')}
                      </div>
                    )
                  }

                  // Bullet point line
                  if (trimmed.startsWith('•')) {
                    return (
                      <div key={idx} style={{
                        display: 'flex',
                        gap: '10px',
                        marginBottom: '8px',
                        fontSize: '14px',
                        color: '#7f1d1d',
                        lineHeight: '1.5'
                      }}>
                        <span style={{ color: '#dc2626', fontWeight: '700' }}>•</span>
                        <span>{trimmed.substring(1).trim()}</span>
                      </div>
                    )
                  }

                  // Regular line
                  return (
                    <div key={idx} style={{
                      fontSize: '14px',
                      color: '#7f1d1d',
                      lineHeight: '1.6',
                      marginBottom: '6px'
                    }}>
                      {trimmed}
                    </div>
                  )
                })
              })()}
            </div>
          </div>

          {/* WPS Details (if available) */}
          {wpsDetails && (
            <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <span style={{ fontSize: '20px' }}>🔧</span>
                <h3 style={{
                  margin: 0,
                  fontSize: '12px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: '#6b7280'
                }}>
                  WPS Details - {wpsDetails.wps_number}
                </h3>
              </div>

              <div style={{
                padding: '14px 16px',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                  {wpsDetails.base_materials && (
                    <div>
                      <span style={{ color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Base Materials</span>
                      <div style={{ color: '#111827', fontWeight: '600', marginTop: '2px' }}>
                        {Array.isArray(wpsDetails.base_materials)
                          ? wpsDetails.base_materials.join(', ')
                          : wpsDetails.base_materials}
                      </div>
                    </div>
                  )}
                  {wpsDetails.filler_materials && (
                    <div>
                      <span style={{ color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Filler Materials</span>
                      <div style={{ color: '#111827', fontWeight: '600', marginTop: '2px' }}>
                        {Array.isArray(wpsDetails.filler_materials)
                          ? wpsDetails.filler_materials.join(', ')
                          : wpsDetails.filler_materials}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {loadingWps && (
            <div style={{ padding: '24px', fontSize: '13px', color: '#6b7280', fontStyle: 'italic' }}>
              Loading WPS details...
            </div>
          )}

          {/* Metrics Section (if applicable) */}
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
                  Key Metrics
                </h3>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px'
              }}>
                {flag.details.efficiency_score !== undefined && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: '#fef2f2',
                    borderRadius: '8px',
                    border: '1px solid #fecaca',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#dc2626' }}>
                      {flag.details.efficiency_score}%
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', textTransform: 'uppercase' }}>
                      Efficiency
                    </div>
                  </div>
                )}
                {flag.details.billed_hours !== undefined && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#111827' }}>
                      {flag.details.billed_hours}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', textTransform: 'uppercase' }}>
                      Billed Hours
                    </div>
                  </div>
                )}
                {flag.details.shadow_hours !== undefined && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#111827' }}>
                      {flag.details.shadow_hours}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', textTransform: 'uppercase' }}>
                      Shadow Hours
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div style={{
          padding: '20px 24px',
          borderTop: '2px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          {/* Note Input (when action pending) */}
          {showNoteInput && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px'
              }}>
                {pendingAction === 'dismissed' ? 'Reason for dismissal (optional):' : 'Note for inspector (optional):'}
              </label>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder={pendingAction === 'dismissed'
                  ? 'e.g., Already addressed in follow-up ticket...'
                  : 'e.g., Please review coating readings at KP 12+500...'
                }
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '13px',
                  minHeight: '70px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  onClick={() => handleFlagAction(pendingAction)}
                  disabled={actionLoading}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: pendingAction === 'dismissed' ? '#22c55e' : '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                    opacity: actionLoading ? 0.7 : 1
                  }}
                >
                  {actionLoading ? 'Saving...' : 'Confirm'}
                </button>
                <button
                  onClick={() => {
                    setShowNoteInput(false)
                    setPendingAction(null)
                    setActionNote('')
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#e5e7eb',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '13px'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Main Action Buttons */}
          {!showNoteInput && !flagStatus && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={() => handleFlagAction('dismissed')}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: 'white',
                  color: '#16a34a',
                  border: '2px solid #16a34a',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#16a34a'
                  e.currentTarget.style.color = 'white'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                  e.currentTarget.style.color = '#16a34a'
                }}
              >
                ✓ Dismiss
                <span style={{ fontSize: '11px', opacity: 0.8 }}>(False Positive)</span>
              </button>
              <button
                onClick={() => handleFlagAction('flagged_for_inspector')}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: 'white',
                  color: '#f59e0b',
                  border: '2px solid #f59e0b',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f59e0b'
                  e.currentTarget.style.color = 'white'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                  e.currentTarget.style.color = '#f59e0b'
                }}
              >
                🚩 Flag for Inspector
              </button>
            </div>
          )}

          {/* Secondary Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={generateClarificationRequest}
              disabled={generatingClarification}
              style={{
                flex: 1,
                padding: '12px 18px',
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: generatingClarification ? 'not-allowed' : 'pointer',
                fontWeight: '500',
                fontSize: '13px',
                opacity: generatingClarification ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              ✉️ Request Clarification
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '12px 24px',
                backgroundColor: '#1e3a5f',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Close
            </button>
          </div>

          {/* Footer Info */}
          <div style={{
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid #e5e7eb',
            fontSize: '11px',
            color: '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            🤖 Flagged by AI Agent • {formatDate(flag.ticket_date || ticket?.date)}
          </div>
        </div>
      </div>

      {/* Clarification Request Modal */}
      {showClarificationModal && (
        <div
          onClick={() => !generatingClarification && setShowClarificationModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 10002,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '550px',
              maxHeight: '80vh',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#8b5cf6',
              color: 'white'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>✉️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                    Request Clarification
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
                    AI-generated message for {inspectorInfo?.display_name || ticket?.inspector_name || 'the inspector'}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
              {generatingClarification ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 20px',
                  color: '#6b7280'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    border: '3px solid #e5e7eb',
                    borderTopColor: '#8b5cf6',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '16px'
                  }} />
                  <div style={{ fontSize: '14px', fontWeight: '500' }}>
                    Generating clarification request...
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: '8px'
                    }}>
                      Draft Message (edit as needed)
                    </label>
                    <textarea
                      value={clarificationDraft}
                      onChange={(e) => setClarificationDraft(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '250px',
                        padding: '14px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '14px',
                        lineHeight: '1.6',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {inspectorInfo?.email && (
                    <div style={{
                      padding: '12px 14px',
                      backgroundColor: '#f0f9ff',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#0c4a6e',
                      marginBottom: '16px'
                    }}>
                      <strong>Inspector Email:</strong> {inspectorInfo.email}
                    </div>
                  )}

                  <div style={{
                    padding: '12px 14px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#6b7280'
                  }}>
                    💡 <strong>Tip:</strong> Copy this message and send via email, Teams, or Slack
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            {!generatingClarification && (
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px'
              }}>
                <button
                  onClick={() => setShowClarificationModal(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#e5e7eb',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={copyClarification}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: clarificationCopied ? '#16a34a' : '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {clarificationCopied ? '✓ Copied!' : '📋 Copy Message'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}
