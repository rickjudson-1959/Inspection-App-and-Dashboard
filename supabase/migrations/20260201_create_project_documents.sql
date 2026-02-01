-- ============================================================================
-- PROJECT DOCUMENTS TABLE - Document Vault for Project Governance
-- February 1, 2026
-- ============================================================================

-- Add default_pipe_specs column to contract_config if it doesn't exist
ALTER TABLE contract_config ADD COLUMN IF NOT EXISTS default_pipe_specs JSONB DEFAULT '{}';

-- Create project_documents table for document vault
CREATE TABLE IF NOT EXISTS project_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  version_number INTEGER DEFAULT 1,
  is_approved BOOLEAN DEFAULT false,
  signed_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Valid categories
  CONSTRAINT valid_category CHECK (category IN (
    'prime_contract',
    'scope_of_work',
    'ifc_drawings',
    'typical_drawings',
    'project_specs',
    'weld_procedures',
    'erp',
    'emp'
  ))
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_project_documents_org ON project_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_category ON project_documents(organization_id, category);

-- Enable RLS
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view documents for their organization
CREATE POLICY "Users can view org documents"
ON project_documents FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM memberships WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Policy: Admins can manage documents
CREATE POLICY "Admins can manage documents"
ON project_documents FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_project_documents_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS project_documents_updated_at ON project_documents;
CREATE TRIGGER project_documents_updated_at
  BEFORE UPDATE ON project_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_project_documents_timestamp();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
