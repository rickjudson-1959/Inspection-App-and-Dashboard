-- ============================================================================
-- ADD CONTRACTOR SCHEDULE CATEGORY
-- February 10, 2026
-- ============================================================================

-- Update valid categories to include contractor_schedule
ALTER TABLE project_documents DROP CONSTRAINT IF EXISTS valid_category;
ALTER TABLE project_documents ADD CONSTRAINT valid_category CHECK (category IN (
  'prime_contract', 'scope_of_work', 'ifc_drawings', 'typical_drawings',
  'project_specs', 'weld_procedures', 'erp', 'emp', 'itp',
  'api_1169', 'csa_z662', 'pipeline_authority_ref', 'inspector_playbook', 'rules_of_thumb',
  'contractor_schedule'
));

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
