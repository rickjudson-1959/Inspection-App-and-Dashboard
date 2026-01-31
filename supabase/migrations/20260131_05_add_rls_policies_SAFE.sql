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
