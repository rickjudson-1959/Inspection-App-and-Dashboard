-- ============================================================================
-- CONTRACT CONFIG TABLE - Multi-Tenant Project Configuration
-- January 31, 2026
-- ============================================================================

-- Create contract_config table for organization-specific project settings
CREATE TABLE IF NOT EXISTS contract_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_number TEXT,
  standard_workday NUMERIC DEFAULT 10,
  ap_email TEXT,
  start_kp TEXT,
  end_kp TEXT,
  default_diameter TEXT,
  per_diem_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One config per organization
  UNIQUE(organization_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_contract_config_org ON contract_config(organization_id);

-- Enable RLS
ALTER TABLE contract_config ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view config for their organization
CREATE POLICY "Users can view own org config"
ON contract_config FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM memberships WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Policy: Admins and super_admins can insert/update config
CREATE POLICY "Admins can manage org config"
ON contract_config FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "Admins can update org config"
ON contract_config FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contract_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS contract_config_updated_at ON contract_config;
CREATE TRIGGER contract_config_updated_at
  BEFORE UPDATE ON contract_config
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_config_timestamp();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
