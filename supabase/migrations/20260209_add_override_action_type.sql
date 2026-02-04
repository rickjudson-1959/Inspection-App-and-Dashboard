-- Phase 5: Override Logging
-- Add index for inspector_override action type queries

CREATE INDEX IF NOT EXISTS idx_report_audit_log_override
  ON report_audit_log(action_type) WHERE action_type = 'inspector_override';
