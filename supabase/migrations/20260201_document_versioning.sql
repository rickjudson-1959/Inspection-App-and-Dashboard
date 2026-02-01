-- ============================================================================
-- DOCUMENT VERSIONING AND ADDENDUM SUPPORT
-- February 1, 2026
-- ============================================================================

-- Add is_current flag to track active version
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true;

-- Add parent_document_id for addendum/supporting documents
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS parent_document_id UUID REFERENCES project_documents(id);

-- Add is_addendum flag
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS is_addendum BOOLEAN DEFAULT false;

-- Add revision_notes for tracking what changed
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS revision_notes TEXT;

-- Create index for faster queries on current documents
CREATE INDEX IF NOT EXISTS idx_project_documents_current
ON project_documents(organization_id, category, is_current)
WHERE is_current = true;

-- Create index for addendum lookups
CREATE INDEX IF NOT EXISTS idx_project_documents_parent
ON project_documents(parent_document_id)
WHERE parent_document_id IS NOT NULL;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
