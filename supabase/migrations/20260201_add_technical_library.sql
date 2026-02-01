-- ============================================================================
-- TECHNICAL RESOURCE LIBRARY - Global Resources Support
-- February 1, 2026
-- ============================================================================

-- Add is_global column to project_documents
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;

-- Update valid categories to include technical library resources
ALTER TABLE project_documents DROP CONSTRAINT IF EXISTS valid_category;
ALTER TABLE project_documents ADD CONSTRAINT valid_category CHECK (category IN (
  'prime_contract', 'scope_of_work', 'ifc_drawings', 'typical_drawings',
  'project_specs', 'weld_procedures', 'erp', 'emp', 'itp',
  'api_1169', 'csa_z662', 'pipeline_authority_ref', 'inspector_playbook', 'rules_of_thumb'
));

-- Create index for global documents lookup
CREATE INDEX IF NOT EXISTS idx_project_documents_global ON project_documents(is_global) WHERE is_global = true;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
