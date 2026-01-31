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
-- Multi-Tenant Architecture: Default Organization and User Backfill
-- This creates the default organization and migrates existing users to memberships
-- Part 2 of multi-tenant migration series

-- =====================================================
-- CREATE DEFAULT ORGANIZATION
-- =====================================================
INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- MIGRATE EXISTING USERS TO MEMBERSHIPS
-- =====================================================
-- This takes existing user_profiles.organization_id relationships
-- and creates corresponding membership records

INSERT INTO memberships (user_id, organization_id, role, is_default)
SELECT
  id as user_id,
  COALESCE(organization_id, '00000000-0000-0000-0000-000000000001') as organization_id,
  COALESCE(role, 'member') as role,
  true as is_default
FROM user_profiles
WHERE id IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- =====================================================
-- VERIFY MIGRATION
-- =====================================================
-- This block logs the migration results for verification
DO $$
DECLARE
  user_count INTEGER;
  membership_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM user_profiles;
  SELECT COUNT(*) INTO membership_count FROM memberships;

  RAISE NOTICE 'Migration complete: % users, % memberships created', user_count, membership_count;
END $$;
-- Multi-Tenant Architecture: Add organization_id to Data Tables (SAFE VERSION)
-- This adds nullable organization_id columns only to tables that exist
-- Part 3 of multi-tenant migration series

-- =====================================================
-- SAFE ALTER: Only add column if table exists
-- =====================================================

DO $$
DECLARE
  tables_to_update TEXT[] := ARRAY[
    'daily_tickets',
    'daily_reports',
    'inspection_reports',
    'report_status',
    'report_audit_log',
    'report_status_history',
    'clearing_inspections',
    'clearing_ncr_tracking',
    'ndt_inspections',
    'trench_logs',
    'conventional_bore_logs',
    'bore_path_logs',
    'drilling_waste_logs',
    'tie_ins',
    'tie_in_welds',
    'weld_sequences',
    'weld_book',
    'inspector_timesheets',
    'inspector_timesheet_items',
    'inspector_timesheet_lines',
    'inspector_profiles',
    'inspector_rate_cards',
    'inspector_documents',
    'billing_audit_log',
    'billing_batches',
    'invoices',
    'electronic_signatures',
    'signature_applications',
    'trackable_items',
    'labour_entries',
    'equipment_entries',
    'mat_transactions',
    'daily_construction_summary',
    'change_orders',
    'project_baselines',
    'assistant_chief_reviews',
    'assistant_chief_observations',
    'assistant_chief_safety_cards',
    'assistant_chief_wildlife',
    'assistant_chief_daily_reports',
    'contractor_deficiencies',
    'inspector_assignments',
    'field_hazard_entries',
    'field_recognition_entries',
    'field_wildlife_entries',
    'compliance_issues',
    'observation_photos',
    'photos',
    'contractor_lems',
    'disputes',
    'reconciliation_corrections',
    'labour_rates',
    'equipment_rates'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables_to_update
  LOOP
    -- Check if table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      -- Check if column already exists
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'organization_id'
      ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN organization_id UUID REFERENCES organizations(id)', tbl);
        RAISE NOTICE 'Added organization_id to %', tbl;
      ELSE
        RAISE NOTICE 'Column organization_id already exists in %', tbl;
      END IF;
    ELSE
      RAISE NOTICE 'Table % does not exist, skipping', tbl;
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- CREATE INDEXES (only for tables that exist)
-- =====================================================

DO $$
DECLARE
  tables_to_index TEXT[] := ARRAY[
    'daily_tickets',
    'daily_reports',
    'inspection_reports',
    'report_status',
    'clearing_inspections',
    'ndt_inspections',
    'trench_logs',
    'tie_ins',
    'inspector_timesheets',
    'trackable_items',
    'contractor_lems',
    'project_baselines'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables_to_index
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_org ON %I(organization_id)', tbl, tbl);
      RAISE NOTICE 'Created index on %.organization_id', tbl;
    END IF;
  END LOOP;
END $$;
-- Multi-Tenant Architecture: Backfill organization_id (SAFE VERSION)
-- This backfills existing data to the Default organization
-- Part 4 of multi-tenant migration series

-- =====================================================
-- SAFE BACKFILL: Only update tables that exist and have the column
-- =====================================================
DO $$
DECLARE
  default_org_id UUID := '00000000-0000-0000-0000-000000000001';
  tables_to_backfill TEXT[] := ARRAY[
    'daily_tickets',
    'daily_reports',
    'inspection_reports',
    'report_status',
    'report_audit_log',
    'report_status_history',
    'clearing_inspections',
    'clearing_ncr_tracking',
    'ndt_inspections',
    'trench_logs',
    'conventional_bore_logs',
    'bore_path_logs',
    'drilling_waste_logs',
    'tie_ins',
    'tie_in_welds',
    'weld_sequences',
    'weld_book',
    'inspector_timesheets',
    'inspector_timesheet_items',
    'inspector_timesheet_lines',
    'inspector_profiles',
    'inspector_rate_cards',
    'inspector_documents',
    'billing_audit_log',
    'billing_batches',
    'invoices',
    'electronic_signatures',
    'signature_applications',
    'trackable_items',
    'labour_entries',
    'equipment_entries',
    'mat_transactions',
    'daily_construction_summary',
    'change_orders',
    'project_baselines',
    'assistant_chief_reviews',
    'assistant_chief_observations',
    'assistant_chief_safety_cards',
    'assistant_chief_wildlife',
    'assistant_chief_daily_reports',
    'contractor_deficiencies',
    'inspector_assignments',
    'field_hazard_entries',
    'field_recognition_entries',
    'field_wildlife_entries',
    'compliance_issues',
    'observation_photos',
    'photos',
    'contractor_lems',
    'disputes',
    'reconciliation_corrections',
    'labour_rates',
    'equipment_rates'
  ];
  tbl TEXT;
  rows_updated INTEGER;
BEGIN
  FOREACH tbl IN ARRAY tables_to_backfill
  LOOP
    -- Check if table exists and has organization_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('UPDATE %I SET organization_id = $1 WHERE organization_id IS NULL', tbl)
      USING default_org_id;
      GET DIAGNOSTICS rows_updated = ROW_COUNT;
      RAISE NOTICE 'Backfilled % rows in %', rows_updated, tbl;
    ELSE
      RAISE NOTICE 'Skipping % (table or column does not exist)', tbl;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill complete: All existing data assigned to Default organization';
END $$;
-- Multi-Tenant Architecture: RLS Policies for Tenant Isolation (SAFE VERSION)
-- This adds Row Level Security policies only to tables that exist
-- Part 5 of multi-tenant migration series

-- =====================================================
-- HELPER FUNCTION: Check if user is super_admin
-- =====================================================
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- HELPER FUNCTION: Get user's organization IDs
-- =====================================================
CREATE OR REPLACE FUNCTION user_organization_ids()
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT organization_id FROM memberships WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- SAFE RLS POLICY APPLICATION
-- Only applies to tables that exist and have organization_id
-- =====================================================
DO $$
DECLARE
  tables_for_rls TEXT[] := ARRAY[
    'daily_tickets',
    'daily_reports',
    'inspection_reports',
    'report_status',
    'report_audit_log',
    'clearing_inspections',
    'ndt_inspections',
    'trench_logs',
    'tie_ins',
    'inspector_timesheets',
    'trackable_items',
    'contractor_lems',
    'project_baselines',
    'mat_transactions',
    'change_orders'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables_for_rls
  LOOP
    -- Check if table exists and has organization_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'organization_id'
    ) THEN
      -- Enable RLS
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

      -- Drop existing policy if exists
      EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation for %s" ON %I', tbl, tbl);

      -- Create new policy
      EXECUTE format('
        CREATE POLICY "Tenant isolation for %s"
        ON %I FOR ALL
        USING (
          is_super_admin() OR
          organization_id IN (SELECT user_organization_ids())
        )', tbl, tbl);

      RAISE NOTICE 'Applied RLS policy to %', tbl;
    ELSE
      RAISE NOTICE 'Skipping RLS for % (table or column does not exist)', tbl;
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON FUNCTION is_super_admin() IS 'Check if current user has super_admin role';
COMMENT ON FUNCTION user_organization_ids() IS 'Get all organization IDs the current user is a member of';
