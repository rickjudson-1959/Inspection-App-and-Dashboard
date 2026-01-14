// useActivityAudit.js - Standalone audit hook for activity Log components
// No external dependencies - everything is self-contained

import { useCallback, useRef } from 'react'
import { supabase } from './supabase'

/**
 * Format a value for audit trail display
 */
function formatAuditValue(value) {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Custom hook for activity-level audit logging
 * Used by all Log components (HydrotestLog, DitchLog, etc.)
 * 
 * @param {string} logId - The activity block ID or report ID
 * @param {string} entityType - The type of log (e.g., 'HydrotestLog', 'DitchLog')
 */
export function useActivityAudit(logId, entityType) {
  const loggingRef = useRef(false)

  /**
   * Get current user from Supabase auth
   */
  const getCurrentUser = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Try to get profile for name and role
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .single()
        
        return {
          id: user.id,
          email: user.email,
          name: profile?.full_name || user.email?.split('@')[0] || 'Unknown',
          role: profile?.role || 'inspector'
        }
      }
    } catch (err) {
      console.warn('Could not get current user:', err)
    }
    return null
  }, [])

  /**
   * Log a field change to the audit trail
   */
  const logChange = useCallback(async (fieldName, oldValue, newValue, section = null, additionalData = {}) => {
    // Skip if no actual change
    if (formatAuditValue(oldValue) === formatAuditValue(newValue)) return
    
    // Skip if no logId
    if (!logId) {
      console.warn('Audit: No logId provided, skipping audit log')
      return
    }

    // Prevent duplicate logging
    if (loggingRef.current) return
    loggingRef.current = true

    try {
      const user = await getCurrentUser()
      
      const auditEntry = {
        report_id: typeof logId === 'number' ? logId : null,
        entity_type: entityType,
        entity_id: String(logId),
        section: section || entityType,
        field_name: fieldName,
        old_value: formatAuditValue(oldValue),
        new_value: formatAuditValue(newValue),
        change_type: 'edit',
        action_type: 'field_change',
        changed_by: user?.id || null,
        changed_by_name: user?.name || null,
        changed_by_email: user?.email || null,
        changed_by_role: user?.role || null,
        changed_at: new Date().toISOString(),
        ...additionalData
      }

      const { error } = await supabase
        .from('report_audit_log')
        .insert(auditEntry)

      if (error) {
        console.error('Audit log error:', error)
      }
    } catch (err) {
      console.error('Audit logging failed:', err)
    } finally {
      loggingRef.current = false
    }
  }, [logId, entityType, getCurrentUser])

  /**
   * Initialize original values ref for a field
   */
  const initializeOriginalValues = useCallback((ref, fieldName, currentValue) => {
    if (ref.current[fieldName] === undefined) {
      ref.current[fieldName] = currentValue
    }
  }, [])

  /**
   * Initialize entry-level values ref
   */
  const initializeEntryValues = useCallback((ref, entryId, fieldName, currentValue) => {
    const key = `${entryId}-${fieldName}`
    if (ref.current[key] === undefined) {
      ref.current[key] = currentValue
    }
  }, [])

  /**
   * Log a simple field change (for top-level fields)
   */
  const logFieldChange = useCallback((originalRef, fieldName, newValue, displayName = null) => {
    const oldValue = originalRef.current[fieldName]
    if (oldValue !== undefined && formatAuditValue(oldValue) !== formatAuditValue(newValue)) {
      logChange(displayName || fieldName, oldValue, newValue)
    }
    // Clear the stored value
    delete originalRef.current[fieldName]
  }, [logChange])

  /**
   * Log a nested field change (for fields inside objects like checklist.permitsInPlace)
   */
  const logNestedFieldChange = useCallback((nestedRef, parentField, fieldName, newValue, displayName = null) => {
    const key = `${parentField}.${fieldName}`
    const oldValue = nestedRef.current[key]
    if (oldValue !== undefined && formatAuditValue(oldValue) !== formatAuditValue(newValue)) {
      logChange(displayName || fieldName, oldValue, newValue, parentField)
    }
    // Clear the stored value
    delete nestedRef.current[key]
  }, [logChange])

  /**
   * Log a field change within an entry (for repeatable entries like readings, runs, etc.)
   */
  const logEntryFieldChange = useCallback((entryRef, entryId, fieldName, newValue, displayName = null, entryLabel = null) => {
    const key = `${entryId}-${fieldName}`
    const oldValue = entryRef.current[key]
    if (oldValue !== undefined && formatAuditValue(oldValue) !== formatAuditValue(newValue)) {
      const section = entryLabel ? `${entityType} - ${entryLabel}` : entityType
      logChange(displayName || fieldName, oldValue, newValue, section)
    }
    // Clear the stored value
    delete entryRef.current[key]
  }, [logChange, entityType])

  /**
   * Log when an entry is added
   */
  const logEntryAdd = useCallback(async (entryType, entryLabel = null) => {
    if (!logId) return
    
    try {
      const user = await getCurrentUser()
      
      const auditEntry = {
        report_id: typeof logId === 'number' ? logId : null,
        entity_type: entityType,
        entity_id: String(logId),
        section: entityType,
        field_name: entryType,
        old_value: null,
        new_value: entryLabel || `New ${entryType}`,
        change_type: 'create',
        action_type: 'entry_add',
        changed_by: user?.id || null,
        changed_by_name: user?.name || null,
        changed_by_email: user?.email || null,
        changed_by_role: user?.role || null,
        changed_at: new Date().toISOString()
      }

      await supabase.from('report_audit_log').insert(auditEntry)
    } catch (err) {
      console.error('Audit entry add logging failed:', err)
    }
  }, [logId, entityType, getCurrentUser])

  /**
   * Log when an entry is deleted
   */
  const logEntryDelete = useCallback(async (entryType, entryLabel = null) => {
    if (!logId) return
    
    try {
      const user = await getCurrentUser()
      
      const auditEntry = {
        report_id: typeof logId === 'number' ? logId : null,
        entity_type: entityType,
        entity_id: String(logId),
        section: entityType,
        field_name: entryType,
        old_value: entryLabel || entryType,
        new_value: null,
        change_type: 'delete',
        action_type: 'entry_delete',
        changed_by: user?.id || null,
        changed_by_name: user?.name || null,
        changed_by_email: user?.email || null,
        changed_by_role: user?.role || null,
        changed_at: new Date().toISOString()
      }

      await supabase.from('report_audit_log').insert(auditEntry)
    } catch (err) {
      console.error('Audit entry delete logging failed:', err)
    }
  }, [logId, entityType, getCurrentUser])

  return {
    logChange,
    logFieldChange,
    logNestedFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete,
    initializeOriginalValues,
    initializeEntryValues,
    formatAuditValue
  }
}

export default useActivityAudit
