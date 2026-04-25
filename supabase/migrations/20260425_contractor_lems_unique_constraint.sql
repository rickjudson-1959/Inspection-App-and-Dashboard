-- Add unique constraint on contractor_lems(field_log_id, organization_id)
-- This was missing and caused upsert with onConflict to fail silently
CREATE UNIQUE INDEX IF NOT EXISTS idx_contractor_lems_field_log_org
  ON contractor_lems (field_log_id, organization_id);
