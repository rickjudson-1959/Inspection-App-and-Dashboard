-- ============================================================================
-- ADD FIELD GUIDE CATEGORY TO TECHNICAL LIBRARY
-- February 14, 2026
-- ============================================================================

-- Update valid categories to include field_guide
ALTER TABLE project_documents DROP CONSTRAINT IF EXISTS valid_category;
ALTER TABLE project_documents ADD CONSTRAINT valid_category CHECK (category IN (
  'prime_contract', 'scope_of_work', 'ifc_drawings', 'typical_drawings',
  'project_specs', 'weld_procedures', 'erp', 'emp', 'itp',
  'api_1169', 'csa_z662', 'pipeline_authority_ref', 'inspector_playbook', 'rules_of_thumb',
  'field_guide', 'contractor_schedule'
));

-- Update existing field guide record to use the new category
UPDATE project_documents
SET category = 'field_guide'
WHERE id = 'f0ad8ace-4b02-49ed-8bd1-72c94876bd18';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
