// useActivityAudit.js - Reusable audit hook for activity log components
// This hook provides standardized audit logging for all activity types
import { useRef, useCallback } from 'react'
import { logAuditChanges, formatAuditValue } from './auditHelpers'

/**
 * Custom hook for activity audit logging
 * @param {Object} options - Configuration options
 * @param {string} options.reportId - The report ID (required for logging)
 * @param {string} options.reportDate - The report date
 * @param {string} options.entityType - The entity type (e.g., 'ditching', 'grading', 'hdd')
 * @param {Object} options.currentUser - The current user object { id, name, email, role }
 * @param {string} options.defaultKP - Default KP location for audit entries
 */
export function useActivityAudit({ 
  reportId, 
  reportDate, 
  entityType, 
  currentUser,
  defaultKP = null
}) {
  // Track original values for fields
  const originalValuesRef = useRef({})
  // Track original values for repeatable entries
  const originalEntriesRef = useRef({})
  // Track if initialized
  const initializedRef = useRef(false)

  /**
   * Initialize original values from data object
   * Call this in useEffect when data loads
   */
  const initializeOriginalValues = useCallback((data) => {
    if (!initializedRef.current && data) {
      originalValuesRef.current = JSON.parse(JSON.stringify(data))
      initializedRef.current = true
    }
  }, [])

  /**
   * Initialize original entry values for repeatable items
   * Call this in useEffect when entries change
   */
  const initializeEntryValues = useCallback((entries, idField = 'id') => {
    if (!entries) return
    entries.forEach(entry => {
      const entryId = entry[idField]
      if (entryId && !originalEntriesRef.current[entryId]) {
        originalEntriesRef.current[entryId] = { ...entry }
      }
    })
  }, [])

  /**
   * Log a field change on blur
   * @param {string} field - Field name
   * @param {*} currentValue - Current value of the field
   * @param {string} section - Section name for categorization
   * @param {Object} options - Additional options { kpStart, kpEnd }
   */
  const logFieldChange = useCallback(async (field, currentValue, section, options = {}) => {
    if (!reportId) return

    const oldValue = originalValuesRef.current[field]
    const newValue = currentValue

    // Only log if value actually changed
    if (formatAuditValue(oldValue) === formatAuditValue(newValue)) return

    try {
      await logAuditChanges({
        reportId,
        reportDate,
        entityType,
        entityId: `${entityType}:${reportId}`,
        changeType: 'edit',
        changes: [{
          section: section || entityType,
          field_name: field,
          old_value: formatAuditValue(oldValue),
          new_value: formatAuditValue(newValue),
          kp_start: options.kpStart || defaultKP,
          kp_end: options.kpEnd || null
        }],
        user: currentUser
      })

      // Update original value after logging
      originalValuesRef.current[field] = newValue
    } catch (err) {
      console.error('Audit log error:', err)
    }
  }, [reportId, reportDate, entityType, currentUser, defaultKP])

  /**
   * Log a nested field change (e.g., activities.sitePreparation.today)
   * @param {Array} path - Path to the field ['activities', 'sitePreparation', 'today']
   * @param {*} currentValue - Current value
   * @param {string} section - Section name
   * @param {Object} options - Additional options
   */
  const logNestedFieldChange = useCallback(async (path, currentValue, section, options = {}) => {
    if (!reportId) return

    // Navigate to the old value using path
    let oldValue = originalValuesRef.current
    for (const key of path) {
      if (oldValue && typeof oldValue === 'object') {
        oldValue = oldValue[key]
      } else {
        oldValue = undefined
        break
      }
    }

    // Only log if value actually changed
    if (formatAuditValue(oldValue) === formatAuditValue(currentValue)) return

    try {
      await logAuditChanges({
        reportId,
        reportDate,
        entityType,
        entityId: `${entityType}:${reportId}`,
        changeType: 'edit',
        changes: [{
          section: section || path.join(' - '),
          field_name: path[path.length - 1],
          old_value: formatAuditValue(oldValue),
          new_value: formatAuditValue(currentValue),
          kp_start: options.kpStart || defaultKP,
          kp_end: options.kpEnd || null
        }],
        user: currentUser
      })

      // Update original value after logging
      let target = originalValuesRef.current
      for (let i = 0; i < path.length - 1; i++) {
        if (!target[path[i]]) target[path[i]] = {}
        target = target[path[i]]
      }
      target[path[path.length - 1]] = currentValue
    } catch (err) {
      console.error('Audit log error:', err)
    }
  }, [reportId, reportDate, entityType, currentUser, defaultKP])

  /**
   * Log an entry field change for repeatable items
   * @param {string|number} entryId - The entry ID
   * @param {string} field - Field name
   * @param {*} currentValue - Current value
   * @param {string} section - Section name
   * @param {Object} options - Additional options { kpStart, kpEnd }
   */
  const logEntryFieldChange = useCallback(async (entryId, field, currentValue, section, options = {}) => {
    if (!reportId) return

    const original = originalEntriesRef.current[entryId]
    if (!original) return

    const oldValue = original[field]

    // Only log if value actually changed
    if (formatAuditValue(oldValue) === formatAuditValue(currentValue)) return

    try {
      await logAuditChanges({
        reportId,
        reportDate,
        entityType,
        entityId: `${entityType}_entry:${entryId}`,
        changeType: 'edit',
        changes: [{
          section: section || entityType,
          field_name: field,
          old_value: formatAuditValue(oldValue),
          new_value: formatAuditValue(currentValue),
          kp_start: options.kpStart || defaultKP,
          kp_end: options.kpEnd || null
        }],
        user: currentUser
      })

      // Update original value after logging
      originalEntriesRef.current[entryId] = { 
        ...originalEntriesRef.current[entryId], 
        [field]: currentValue 
      }
    } catch (err) {
      console.error('Audit log error:', err)
    }
  }, [reportId, reportDate, entityType, currentUser, defaultKP])

  /**
   * Log entry addition
   * @param {Object} entry - The new entry
   * @param {string} section - Section name
   * @param {string} description - Description of what was added
   */
  const logEntryAdd = useCallback(async (entry, section, description = 'New entry added') => {
    if (!reportId) return

    try {
      await logAuditChanges({
        reportId,
        reportDate,
        entityType,
        entityId: `${entityType}_entry:${entry.id}`,
        changeType: 'create',
        changes: [{
          section: section || entityType,
          field_name: 'entry_added',
          old_value: null,
          new_value: description,
          kp_start: entry.kp || entry.startKP || entry.kpStart || defaultKP
        }],
        user: currentUser
      })
    } catch (err) {
      console.error('Audit log error:', err)
    }
  }, [reportId, reportDate, entityType, currentUser, defaultKP])

  /**
   * Log entry deletion
   * @param {Object} entry - The entry being deleted
   * @param {string} section - Section name
   * @param {string} summary - Summary of what was deleted
   */
  const logEntryDelete = useCallback(async (entry, section, summary) => {
    if (!reportId) return

    try {
      await logAuditChanges({
        reportId,
        reportDate,
        entityType,
        entityId: `${entityType}_entry:${entry.id}`,
        changeType: 'delete',
        changes: [{
          section: section || entityType,
          field_name: 'entry_deleted',
          old_value: summary || `Entry ${entry.id} deleted`,
          new_value: null,
          kp_start: entry.kp || entry.startKP || entry.kpStart || defaultKP
        }],
        user: currentUser
      })

      // Clean up ref
      delete originalEntriesRef.current[entry.id]
    } catch (err) {
      console.error('Audit log error:', err)
    }
  }, [reportId, reportDate, entityType, currentUser, defaultKP])

  /**
   * Create an onBlur handler for a field
   * @param {string} field - Field name
   * @param {function} getValue - Function to get current value
   * @param {string} section - Section name
   * @param {Object} options - Additional options
   */
  const createBlurHandler = useCallback((field, getValue, section, options = {}) => {
    return () => logFieldChange(field, getValue(), section, options)
  }, [logFieldChange])

  /**
   * Create an onBlur handler for an entry field
   * @param {string|number} entryId - Entry ID
   * @param {string} field - Field name
   * @param {function} getValue - Function to get current value
   * @param {string} section - Section name
   * @param {Object} options - Additional options
   */
  const createEntryBlurHandler = useCallback((entryId, field, getValue, section, options = {}) => {
    return () => logEntryFieldChange(entryId, field, getValue(), section, options)
  }, [logEntryFieldChange])

  return {
    // Initialization
    initializeOriginalValues,
    initializeEntryValues,
    // Logging functions
    logFieldChange,
    logNestedFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete,
    // Handler creators
    createBlurHandler,
    createEntryBlurHandler,
    // Refs (for advanced usage)
    originalValuesRef,
    originalEntriesRef
  }
}

export default useActivityAudit
