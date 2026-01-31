-- Multi-Tenant Architecture: RLS Policies for Tenant Isolation
-- This adds Row Level Security policies to enforce organization boundaries
-- Part 5 of multi-tenant migration series
-- NOTE: Run this AFTER backfill is verified and columns are NOT NULL

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
-- RLS POLICY TEMPLATE FOR DATA TABLES
-- Each policy allows access if:
-- 1. User is super_admin (bypasses org check), OR
-- 2. Record's organization_id matches one of user's memberships
-- =====================================================

-- daily_tickets
ALTER TABLE daily_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for daily_tickets" ON daily_tickets;
CREATE POLICY "Tenant isolation for daily_tickets"
ON daily_tickets FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- daily_reports
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for daily_reports" ON daily_reports;
CREATE POLICY "Tenant isolation for daily_reports"
ON daily_reports FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- inspection_reports
ALTER TABLE inspection_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for inspection_reports" ON inspection_reports;
CREATE POLICY "Tenant isolation for inspection_reports"
ON inspection_reports FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- report_status
ALTER TABLE report_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for report_status" ON report_status;
CREATE POLICY "Tenant isolation for report_status"
ON report_status FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- report_audit_log
ALTER TABLE report_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for report_audit_log" ON report_audit_log;
CREATE POLICY "Tenant isolation for report_audit_log"
ON report_audit_log FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- clearing_inspections
ALTER TABLE clearing_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for clearing_inspections" ON clearing_inspections;
CREATE POLICY "Tenant isolation for clearing_inspections"
ON clearing_inspections FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- ndt_inspections
ALTER TABLE ndt_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for ndt_inspections" ON ndt_inspections;
CREATE POLICY "Tenant isolation for ndt_inspections"
ON ndt_inspections FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- trench_logs
ALTER TABLE trench_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for trench_logs" ON trench_logs;
CREATE POLICY "Tenant isolation for trench_logs"
ON trench_logs FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- tie_ins
ALTER TABLE tie_ins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for tie_ins" ON tie_ins;
CREATE POLICY "Tenant isolation for tie_ins"
ON tie_ins FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- inspector_timesheets
ALTER TABLE inspector_timesheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for inspector_timesheets" ON inspector_timesheets;
CREATE POLICY "Tenant isolation for inspector_timesheets"
ON inspector_timesheets FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- trackable_items
ALTER TABLE trackable_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for trackable_items" ON trackable_items;
CREATE POLICY "Tenant isolation for trackable_items"
ON trackable_items FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- contractor_lems
ALTER TABLE contractor_lems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for contractor_lems" ON contractor_lems;
CREATE POLICY "Tenant isolation for contractor_lems"
ON contractor_lems FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- project_baselines
ALTER TABLE project_baselines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for project_baselines" ON project_baselines;
CREATE POLICY "Tenant isolation for project_baselines"
ON project_baselines FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- mat_transactions
ALTER TABLE mat_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for mat_transactions" ON mat_transactions;
CREATE POLICY "Tenant isolation for mat_transactions"
ON mat_transactions FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- change_orders
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for change_orders" ON change_orders;
CREATE POLICY "Tenant isolation for change_orders"
ON change_orders FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON FUNCTION is_super_admin() IS 'Check if current user has super_admin role';
COMMENT ON FUNCTION user_organization_ids() IS 'Get all organization IDs the current user is a member of';
