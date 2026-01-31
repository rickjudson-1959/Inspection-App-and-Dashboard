-- Multi-Tenant Architecture: Memberships Table
-- This creates the memberships table for many-to-many user-organization relationships
-- Part 1 of multi-tenant migration series

-- =====================================================
-- MEMBERSHIPS TABLE (many-to-many: users <-> organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS memberships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, organization_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_memberships_default ON memberships(user_id, is_default) WHERE is_default = true;

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own memberships" ON memberships;
  DROP POLICY IF EXISTS "Admins can manage memberships" ON memberships;
  DROP POLICY IF EXISTS "Super admins can manage all memberships" ON memberships;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Users can view their own memberships
CREATE POLICY "Users can view own memberships"
ON memberships FOR SELECT
USING (user_id = auth.uid());

-- Admins and super_admins can manage memberships
CREATE POLICY "Admins can manage memberships"
ON memberships FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND (role = 'super_admin' OR role = 'admin')
  )
);

-- =====================================================
-- TRIGGER FOR updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_memberships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memberships_updated_at ON memberships;
CREATE TRIGGER memberships_updated_at
  BEFORE UPDATE ON memberships
  FOR EACH ROW
  EXECUTE FUNCTION update_memberships_updated_at();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE memberships IS 'User-organization memberships for multi-tenant support';
COMMENT ON COLUMN memberships.role IS 'User role within the organization (member, admin, etc.)';
COMMENT ON COLUMN memberships.is_default IS 'If true, this is the users default organization for login redirect';
