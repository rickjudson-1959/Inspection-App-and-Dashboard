-- ============================================================================
-- DOCUMENT SYNC STATUS AND OWNER TRACKING
-- February 1, 2026
-- ============================================================================

-- Add sync_status column (internal, transmitted, acknowledged, rejected)
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'internal';

-- Add owner tracking fields
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS owner_transmittal_id TEXT;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS owner_comments TEXT;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS transmitted_at TIMESTAMPTZ;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

-- Add check constraint for valid sync_status values
DO $$ BEGIN
  ALTER TABLE project_documents ADD CONSTRAINT chk_sync_status
    CHECK (sync_status IN ('internal', 'transmitted', 'acknowledged', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for sync status queries
CREATE INDEX IF NOT EXISTS idx_project_documents_sync_status
ON project_documents(organization_id, sync_status);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
