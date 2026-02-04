// InspectorMentorAgent.js - Core singleton for real-time field auditing
// Phase 1: Threshold-based validation with knowledge bucket registry

import { supabase } from '../supabase'

// ─────────────────────────────────────────────────────────────
// KNOWLEDGE BUCKET REGISTRY
// Single source of truth for all knowledge sources.
// Adding a future bucket = adding one entry here.
// ─────────────────────────────────────────────────────────────
const KNOWLEDGE_BUCKET_REGISTRY = [
  {
    table: 'project_documents',
    filter: (query, orgId) => query
      .or(`is_global.eq.true,organization_id.eq.${orgId}`)
      .eq('is_active', true),
    label: 'Project Documents'
  },
  {
    table: 'wps_material_specs',
    filter: (query, orgId) => query
      .eq('organization_id', orgId)
      .eq('is_active', true),
    label: 'WPS & Material Specs'
  },
  {
    table: 'contract_config',
    filter: (query, orgId) => query
      .eq('organization_id', orgId),
    label: 'Contract Configuration'
  },
  {
    table: 'document_embeddings',
    filter: (query, orgId) => query
      .eq('organization_id', orgId),
    label: 'Document Embeddings (RAG)'
  }
]

// ─────────────────────────────────────────────────────────────
// IN-MEMORY THRESHOLD CACHE
// ─────────────────────────────────────────────────────────────
let thresholdCache = {
  orgId: null,
  thresholds: [],
  fetchedAt: null
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function isCacheValid(orgId) {
  return (
    thresholdCache.orgId === orgId &&
    thresholdCache.fetchedAt &&
    Date.now() - thresholdCache.fetchedAt < CACHE_TTL_MS
  )
}

// ─────────────────────────────────────────────────────────────
// CORE FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Fetches active thresholds for an organization, with in-memory caching.
 * @param {string} orgId - Organization UUID
 * @returns {Promise<Array>} Array of threshold config objects
 */
async function fetchThresholds(orgId) {
  if (!orgId) return []

  if (isCacheValid(orgId)) {
    return thresholdCache.thresholds
  }

  try {
    const { data, error } = await supabase
      .from('mentor_threshold_config')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)

    if (error) {
      console.error('[MentorAgent] Failed to fetch thresholds:', error.message)
      return thresholdCache.thresholds || []
    }

    thresholdCache = {
      orgId,
      thresholds: data || [],
      fetchedAt: Date.now()
    }

    return thresholdCache.thresholds
  } catch (err) {
    console.error('[MentorAgent] Threshold fetch error:', err)
    return thresholdCache.thresholds || []
  }
}

/**
 * Invalidates the threshold cache, forcing a refresh on next fetch.
 */
function invalidateCache() {
  thresholdCache = { orgId: null, thresholds: [], fetchedAt: null }
}

/**
 * Interpolates template strings with value placeholders.
 * Supports {value}, {min}, {max}, {field_key}, {unit}
 */
function interpolateMessage(template, context) {
  if (!template) return ''
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return context[key] !== undefined ? String(context[key]) : match
  })
}

/**
 * Evaluates a single field value against matching thresholds.
 * @param {Object} params
 * @param {string} params.activityType - Activity type string
 * @param {string} params.fieldKey - Quality data field key
 * @param {*} params.value - The committed field value
 * @param {string} params.blockId - Block identifier
 * @param {string} params.reportId - Report UUID
 * @param {string} params.orgId - Organization UUID
 * @returns {Promise<{alerts: Array, passed: boolean}>}
 */
async function evaluateField({ activityType, fieldKey, value, blockId, reportId, orgId }) {
  const thresholds = await fetchThresholds(orgId)
  const alerts = []

  // Find matching thresholds for this activity + field
  const matching = thresholds.filter(
    t => t.activity_type === activityType && t.field_key === fieldKey
  )

  if (matching.length === 0) {
    return { alerts: [], passed: true }
  }

  const numericValue = parseFloat(value)
  if (isNaN(numericValue)) {
    return { alerts: [], passed: true }
  }

  for (const threshold of matching) {
    let breached = false

    if (threshold.min_value !== null && numericValue < parseFloat(threshold.min_value)) {
      breached = true
    }
    if (threshold.max_value !== null && numericValue > parseFloat(threshold.max_value)) {
      breached = true
    }

    if (breached) {
      const context = {
        value: numericValue,
        min: threshold.min_value,
        max: threshold.max_value,
        field_key: fieldKey,
        unit: threshold.unit || ''
      }

      const alert = {
        id: `${blockId}_${fieldKey}_${threshold.id}`,
        thresholdId: threshold.id,
        blockId,
        reportId,
        activityType,
        fieldKey,
        fieldValue: numericValue,
        alertType: 'threshold_breach',
        severity: threshold.severity,
        title: interpolateMessage(threshold.alert_title, context),
        message: interpolateMessage(threshold.alert_message, context),
        recommendedAction: interpolateMessage(threshold.recommended_action, context),
        referenceDocument: threshold.reference_document,
        sourceBucket: threshold.source_bucket,
        sourceId: threshold.source_id,
        status: 'active',
        createdAt: new Date().toISOString()
      }

      alerts.push(alert)
    }
  }

  return { alerts, passed: alerts.length === 0 }
}

/**
 * Evaluates all numeric fields in a block's qualityData.
 * @param {Object} blockData - The activity block object
 * @param {string} orgId - Organization UUID
 * @returns {Promise<{alerts: Array, passed: boolean}>}
 */
async function evaluateBlock(blockData, orgId) {
  if (!blockData?.qualityData || !blockData.activityType) {
    return { alerts: [], passed: true }
  }

  const allAlerts = []

  for (const [fieldKey, value] of Object.entries(blockData.qualityData)) {
    if (value === '' || value === null || value === undefined) continue

    const numericValue = parseFloat(value)
    if (isNaN(numericValue)) continue

    const result = await evaluateField({
      activityType: blockData.activityType,
      fieldKey,
      value: numericValue,
      blockId: blockData.id,
      reportId: blockData.reportId,
      orgId
    })

    allAlerts.push(...result.alerts)
  }

  return { alerts: allAlerts, passed: allAlerts.length === 0 }
}

/**
 * Queries all registered knowledge buckets for an organization.
 * Returns available data from each bucket.
 * @param {string} orgId - Organization UUID
 * @param {string} activityType - Optional activity type filter
 * @returns {Promise<Object>} Map of bucket label -> data
 */
async function queryKnowledgeBuckets(orgId, activityType) {
  const results = {}

  for (const bucket of KNOWLEDGE_BUCKET_REGISTRY) {
    try {
      let query = supabase.from(bucket.table).select('*')
      query = bucket.filter(query, orgId)

      if (activityType && bucket.table !== 'document_embeddings') {
        // Some tables may have activity_type column
        query = query.or(`activity_type.eq.${activityType},activity_type.is.null`)
      }

      const { data, error } = await query.limit(50)

      if (!error && data) {
        results[bucket.label] = data
      }
    } catch (err) {
      console.warn(`[MentorAgent] Failed to query bucket "${bucket.label}":`, err.message)
    }
  }

  return results
}

/**
 * Persists an alert event to the database.
 * @param {Object} alert - Alert object from evaluateField
 * @param {string} orgId - Organization UUID
 * @returns {Promise<Object|null>} Inserted row or null
 */
async function persistAlertEvent(alert, orgId) {
  try {
    const { data, error } = await supabase
      .from('mentor_alert_events')
      .insert({
        organization_id: orgId,
        report_id: alert.reportId || null,
        block_id: alert.blockId,
        activity_type: alert.activityType,
        field_key: alert.fieldKey,
        field_value: String(alert.fieldValue),
        threshold_id: alert.thresholdId,
        alert_type: alert.alertType,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        recommended_action: alert.recommendedAction,
        reference_document: alert.referenceDocument,
        status: 'active'
      })
      .select()
      .single()

    if (error) {
      console.error('[MentorAgent] Failed to persist alert:', error.message)
      return null
    }

    return data
  } catch (err) {
    console.error('[MentorAgent] Alert persistence error:', err)
    return null
  }
}

/**
 * Acknowledges an alert (inspector agrees with the alert).
 * @param {string} alertId - Alert event UUID
 * @param {string} userId - User UUID
 */
async function acknowledgeAlert(alertId, userId) {
  try {
    const { error } = await supabase
      .from('mentor_alert_events')
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: userId
      })
      .eq('id', alertId)

    if (error) {
      console.error('[MentorAgent] Failed to acknowledge alert:', error.message)
    }
  } catch (err) {
    console.error('[MentorAgent] Acknowledge error:', err)
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────
export {
  KNOWLEDGE_BUCKET_REGISTRY,
  fetchThresholds,
  invalidateCache,
  evaluateField,
  evaluateBlock,
  queryKnowledgeBuckets,
  persistAlertEvent,
  acknowledgeAlert,
  interpolateMessage
}

export default {
  KNOWLEDGE_BUCKET_REGISTRY,
  fetchThresholds,
  invalidateCache,
  evaluateField,
  evaluateBlock,
  queryKnowledgeBuckets,
  persistAlertEvent,
  acknowledgeAlert,
  interpolateMessage
}
