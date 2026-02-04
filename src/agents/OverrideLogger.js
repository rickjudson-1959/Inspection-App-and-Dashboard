// OverrideLogger.js - Dual-write override events to both audit systems
// Phase 5: Logs Inspector_Override_Event when inspector overrides a mentor alert

import { supabase } from '../supabase'
import { getRegulatoryCategory, isCriticalField } from '../auditLoggerV3.js'

/**
 * Log an inspector override event to both:
 * 1. report_audit_log (with action_type='inspector_override')
 * 2. mentor_alert_events (status update to 'overridden')
 *
 * @param {Object} params
 * @param {string} params.reportId - Report UUID
 * @param {string} params.blockId - Block identifier
 * @param {string} params.alertId - Alert event UUID (from mentor_alert_events)
 * @param {string} params.alertType - Alert type (threshold_breach, spec_mismatch, etc.)
 * @param {string} params.alertSeverity - critical/warning/info
 * @param {string} params.alertMessage - The alert message text
 * @param {string} params.overrideReason - Inspector's reason for override
 * @param {string} params.fieldKey - The field key that triggered the alert
 * @param {*} params.fieldValue - The field value that triggered the alert
 * @param {string} params.thresholdExpected - Description of expected range
 * @param {string} params.organizationId - Organization UUID
 * @returns {Promise<{auditLogEntry: Object|null, alertUpdate: boolean}>}
 */
async function logOverride({
  reportId,
  blockId,
  alertId,
  alertType,
  alertSeverity,
  alertMessage,
  overrideReason,
  fieldKey,
  fieldValue,
  thresholdExpected,
  organizationId
}) {
  const results = { auditLogEntry: null, alertUpdate: false }

  // 1. Write to report_audit_log
  try {
    const auditEntry = {
      report_id: reportId || null,
      entity_type: 'mentor_alert',
      entity_id: alertId,
      section: 'mentor_agent',
      field_name: fieldKey,
      old_value: thresholdExpected || null,
      new_value: String(fieldValue),
      action_type: 'inspector_override',
      change_type: 'override',
      regulatory_category: getRegulatoryCategory(fieldKey, 'mentor_agent'),
      is_critical: alertSeverity === 'critical' || isCriticalField(fieldKey),
      metadata: {
        alert_type: alertType,
        alert_severity: alertSeverity,
        alert_message: alertMessage,
        override_reason: overrideReason,
        block_id: blockId,
        override_timestamp: new Date().toISOString()
      },
      changed_at: new Date().toISOString(),
      organization_id: organizationId
    }

    const { data, error } = await supabase
      .from('report_audit_log')
      .insert(auditEntry)
      .select()
      .single()

    if (error) {
      console.error('[OverrideLogger] Audit log insert failed:', error.message)
    } else {
      results.auditLogEntry = data
    }
  } catch (err) {
    console.error('[OverrideLogger] Audit log error:', err)
  }

  // 2. Update mentor_alert_events status to 'overridden'
  if (alertId) {
    try {
      const { error } = await supabase
        .from('mentor_alert_events')
        .update({
          status: 'overridden',
          override_reason: overrideReason,
          acknowledged_at: new Date().toISOString()
        })
        .eq('id', alertId)

      if (error) {
        console.error('[OverrideLogger] Alert update failed:', error.message)
      } else {
        results.alertUpdate = true
      }
    } catch (err) {
      console.error('[OverrideLogger] Alert update error:', err)
    }
  }

  return results
}

export { logOverride }

export default { logOverride }
