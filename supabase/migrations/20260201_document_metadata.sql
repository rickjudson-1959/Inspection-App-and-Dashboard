-- ============================================================================
-- DOCUMENT METADATA FOR OWNER DC COMPATIBILITY
-- February 1, 2026
-- ============================================================================

-- Add metadata JSONB column to project_documents for custom fields
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add custom_fields definition to contract_config for org-specific field definitions
-- This stores the schema of custom fields like: [{"key": "owner_doc_num", "label": "Owner Doc Number", "required": true}, ...]
ALTER TABLE contract_config ADD COLUMN IF NOT EXISTS custom_document_fields JSONB DEFAULT '[]';

-- Add transmittal tracking table
CREATE TABLE IF NOT EXISTS transmittals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transmittal_number TEXT NOT NULL,
  date_sent TIMESTAMPTZ DEFAULT NOW(),
  from_name TEXT NOT NULL,
  from_title TEXT,
  to_name TEXT NOT NULL,
  to_company TEXT,
  subject TEXT,
  notes TEXT,
  document_ids UUID[] DEFAULT '{}',
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index for transmittal lookups
CREATE INDEX IF NOT EXISTS idx_transmittals_org ON transmittals(organization_id);
CREATE INDEX IF NOT EXISTS idx_transmittals_number ON transmittals(organization_id, transmittal_number);

-- RLS for transmittals
ALTER TABLE transmittals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org transmittals"
ON transmittals FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "Admins can manage transmittals"
ON transmittals FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
