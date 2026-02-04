// useMentorAuditor.js - React hook for blur-triggered field auditing
// Loads thresholds once per mount, evaluates fields on ShieldedInput blur

import { useState, useEffect, useCallback, useRef } from 'react'
import { evaluateField, fetchThresholds, persistAlertEvent, acknowledgeAlert as ackAlert } from '../agents/InspectorMentorAgent'
import { logOverride } from '../agents/OverrideLogger.js'

/**
 * Hook for real-time field auditing via InspectorMentorAgent.
 *
 * @param {Object} config
 * @param {string} config.activityType - Current activity type
 * @param {string} config.blockId - Block identifier
 * @param {string} config.reportId - Report UUID
 * @param {string} config.organizationId - Organization UUID
 * @param {string} config.userId - Current user UUID (for acknowledgments)
 * @returns {Object} { alerts, auditField, dismissAlert, acknowledgeAlert, overrideAlert, alertCount }
 */
export function useMentorAuditor({ activityType, blockId, reportId, organizationId, userId }) {
  const [alerts, setAlerts] = useState([])
  const [thresholdsLoaded, setThresholdsLoaded] = useState(false)
  const mountedRef = useRef(true)

  // Load thresholds once on mount
  useEffect(() => {
    mountedRef.current = true

    if (organizationId) {
      fetchThresholds(organizationId).then(() => {
        if (mountedRef.current) {
          setThresholdsLoaded(true)
        }
      })
    }

    return () => {
      mountedRef.current = false
    }
  }, [organizationId])

  /**
   * Audit a single field value. Called on ShieldedInput blur (post-sync moment).
   * Replaces alerts for this field while keeping other fields' alerts.
   *
   * @param {string} fieldKey - The quality data field key
   * @param {*} value - The committed value
   */
  const auditField = useCallback(async (fieldKey, value) => {
    if (!thresholdsLoaded || !organizationId || !activityType) return

    const result = await evaluateField({
      activityType,
      fieldKey,
      value,
      blockId,
      reportId,
      orgId: organizationId
    })

    if (!mountedRef.current) return

    // Replace alerts for this field, keep other fields' alerts
    setAlerts(prev => {
      const otherFieldAlerts = prev.filter(a => a.fieldKey !== fieldKey)
      return [...otherFieldAlerts, ...result.alerts]
    })

    // Persist new alerts to database (fire-and-forget)
    for (const alert of result.alerts) {
      persistAlertEvent(alert, organizationId)
    }
  }, [thresholdsLoaded, organizationId, activityType, blockId, reportId])

  /**
   * Dismiss an alert (removes from local state only, does not persist).
   * @param {string} alertId - Alert identifier
   */
  const dismissAlert = useCallback((alertId) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId))
  }, [])

  /**
   * Acknowledge an alert (inspector agrees). Persists status change.
   * @param {string} alertId - Alert identifier
   */
  const acknowledgeAlert = useCallback(async (alertId) => {
    // Find the alert's database ID if it has one
    const alert = alerts.find(a => a.id === alertId)
    if (alert?.dbId) {
      await ackAlert(alert.dbId, userId)
    }

    setAlerts(prev =>
      prev.map(a =>
        a.id === alertId ? { ...a, status: 'acknowledged' } : a
      )
    )
  }, [alerts, userId])

  /**
   * Override an alert (inspector disagrees). Logs to both audit systems.
   * @param {string} alertId - Alert identifier
   * @param {string} reason - Override reason text
   */
  const overrideAlert = useCallback(async (alertId, reason) => {
    const alert = alerts.find(a => a.id === alertId)

    // Update local state immediately
    setAlerts(prev =>
      prev.map(a =>
        a.id === alertId
          ? { ...a, status: 'overridden', overrideReason: reason }
          : a
      )
    )

    // Log override to both audit systems (fire-and-forget)
    if (alert) {
      logOverride({
        reportId,
        blockId,
        alertId: alert.dbId || alertId,
        alertType: alert.alertType,
        alertSeverity: alert.severity,
        alertMessage: alert.message,
        overrideReason: reason,
        fieldKey: alert.fieldKey,
        fieldValue: alert.fieldValue,
        thresholdExpected: alert.thresholdId ? `${alert.min || ''}-${alert.max || ''}` : null,
        organizationId
      })
    }
  }, [alerts, reportId, blockId, organizationId])

  // Count only active alerts (not acknowledged/overridden)
  const activeAlerts = alerts.filter(a => a.status === 'active')
  const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length
  const warningCount = activeAlerts.filter(a => a.severity === 'warning').length

  return {
    alerts,
    activeAlerts,
    auditField,
    dismissAlert,
    acknowledgeAlert,
    overrideAlert,
    alertCount: activeAlerts.length,
    criticalCount,
    warningCount,
    thresholdsLoaded
  }
}

export default useMentorAuditor
