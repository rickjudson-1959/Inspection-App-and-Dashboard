-- ============================================================================
-- ADD SIGN-OFFS COLUMN TO PROJECT_DOCUMENTS
-- February 1, 2026
-- ============================================================================

-- Add sign_offs JSONB column for ITP approval workflow
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS sign_offs JSONB DEFAULT '{}';

-- Update valid categories to include ITP
ALTER TABLE project_documents DROP CONSTRAINT IF EXISTS valid_category;
ALTER TABLE project_documents ADD CONSTRAINT valid_category CHECK (category IN (
  'prime_contract', 'scope_of_work', 'ifc_drawings', 'typical_drawings',
  'project_specs', 'weld_procedures', 'erp', 'emp', 'itp'
));

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
