/**
 * FEED Intelligence Module — Audit Logger
 * Lightweight wrapper around report_audit_log for FEED operations.
 * FEED is project-level (not report-level), so report_id is null.
 */
import { supabase } from '../supabase'

export async function logFeedAction({
  action,
  entityType,
  entityId,
  section = 'FEED',
  oldValue = null,
  newValue = null,
  metadata = {},
  organizationId = null
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    const auditEntry = {
      report_id: null,
      entity_type: entityType,
      entity_id: entityId,
      section,
      field_name: action,
      old_value: oldValue != null ? String(oldValue) : null,
      new_value: newValue != null ? String(newValue) : null,
      action_type: action,
      change_type: action.includes('delete') ? 'delete' : action.includes('create') || action.includes('upsert') ? 'create' : 'edit',
      regulatory_category: 'financial',
      is_critical: true,
      metadata: {
        ...metadata,
        module: 'feed_intelligence',
        user_id: user?.id
      },
      changed_by: user?.id,
      organization_id: organizationId
    }

    const { error } = await supabase
      .from('report_audit_log')
      .insert(auditEntry)

    if (error) {
      console.error('FEED audit log error:', error)
    }
  } catch (err) {
    console.error('FEED audit log exception:', err)
  }
}
