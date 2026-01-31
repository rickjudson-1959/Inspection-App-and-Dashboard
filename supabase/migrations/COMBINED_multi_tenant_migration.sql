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
-- Multi-Tenant Architecture: Add organization_id to Data Tables
-- This adds nullable organization_id columns to all data tables
-- Part 3 of multi-tenant migration series

-- =====================================================
-- PRIORITY 1: CORE REPORTING TABLES
-- =====================================================
ALTER TABLE daily_tickets ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE report_status ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE report_audit_log ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE report_status_history ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- =====================================================
-- PRIORITY 2: ACTIVITY/INSPECTION TABLES
-- =====================================================
ALTER TABLE clearing_inspections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE clearing_ncr_tracking ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE ndt_inspections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE trench_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE conventional_bore_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE bore_path_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE drilling_waste_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- =====================================================
-- PRIORITY 3: WELD/CRAFT TABLES
-- =====================================================
ALTER TABLE tie_ins ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE tie_in_welds ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE weld_sequences ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE weld_book ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- =====================================================
-- PRIORITY 4: INVOICING TABLES
-- =====================================================
ALTER TABLE inspector_timesheets ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE inspector_timesheet_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE inspector_timesheet_lines ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE inspector_profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE inspector_rate_cards ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE inspector_documents ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE billing_audit_log ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE billing_batches ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE electronic_signatures ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE signature_applications ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- =====================================================
-- PRIORITY 5: OTHER OPERATIONAL TABLES
-- =====================================================
ALTER TABLE trackable_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE labour_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE equipment_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE mat_transactions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE daily_construction_summary ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE project_baselines ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- =====================================================
-- PRIORITY 6: ASSISTANT CHIEF TABLES
-- =====================================================
ALTER TABLE assistant_chief_reviews ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE assistant_chief_observations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE assistant_chief_safety_cards ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE assistant_chief_wildlife ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE assistant_chief_daily_reports ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- =====================================================
-- PRIORITY 7: FIELD SAFETY/COMPLIANCE TABLES
-- =====================================================
ALTER TABLE contractor_deficiencies ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE inspector_assignments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE field_hazard_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE field_recognition_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE field_wildlife_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE compliance_issues ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE observation_photos ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- =====================================================
-- PRIORITY 8: RECONCILIATION TABLES
-- =====================================================
ALTER TABLE contractor_lems ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE reconciliation_corrections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE labour_rates ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE equipment_rates ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- =====================================================
-- CREATE INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_daily_tickets_org ON daily_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_org ON daily_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_inspection_reports_org ON inspection_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_report_status_org ON report_status(organization_id);
CREATE INDEX IF NOT EXISTS idx_clearing_inspections_org ON clearing_inspections(organization_id);
CREATE INDEX IF NOT EXISTS idx_ndt_inspections_org ON ndt_inspections(organization_id);
CREATE INDEX IF NOT EXISTS idx_trench_logs_org ON trench_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_tie_ins_org ON tie_ins(organization_id);
CREATE INDEX IF NOT EXISTS idx_inspector_timesheets_org ON inspector_timesheets(organization_id);
CREATE INDEX IF NOT EXISTS idx_trackable_items_org ON trackable_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_contractor_lems_org ON contractor_lems(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_baselines_org ON project_baselines(organization_id);
-- Multi-Tenant Architecture: Backfill organization_id and Add RLS
-- This backfills existing data to the Default organization
-- Part 4 of multi-tenant migration series

-- =====================================================
-- BACKFILL ALL TABLES TO DEFAULT ORGANIZATION
-- =====================================================
DO $$
DECLARE
  default_org_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Priority 1: Core reporting tables
  UPDATE daily_tickets SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE daily_reports SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE inspection_reports SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE report_status SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE report_audit_log SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE report_status_history SET organization_id = default_org_id WHERE organization_id IS NULL;

  -- Priority 2: Activity/inspection tables
  UPDATE clearing_inspections SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE clearing_ncr_tracking SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE ndt_inspections SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE trench_logs SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE conventional_bore_logs SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE bore_path_logs SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE drilling_waste_logs SET organization_id = default_org_id WHERE organization_id IS NULL;

  -- Priority 3: Weld/craft tables
  UPDATE tie_ins SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE tie_in_welds SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE weld_sequences SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE weld_book SET organization_id = default_org_id WHERE organization_id IS NULL;

  -- Priority 4: Invoicing tables
  UPDATE inspector_timesheets SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE inspector_timesheet_items SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE inspector_timesheet_lines SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE inspector_profiles SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE inspector_rate_cards SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE inspector_documents SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE billing_audit_log SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE billing_batches SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE invoices SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE electronic_signatures SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE signature_applications SET organization_id = default_org_id WHERE organization_id IS NULL;

  -- Priority 5: Other operational tables
  UPDATE trackable_items SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE labour_entries SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE equipment_entries SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE mat_transactions SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE daily_construction_summary SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE change_orders SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE project_baselines SET organization_id = default_org_id WHERE organization_id IS NULL;

  -- Priority 6: Assistant chief tables
  UPDATE assistant_chief_reviews SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE assistant_chief_observations SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE assistant_chief_safety_cards SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE assistant_chief_wildlife SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE assistant_chief_daily_reports SET organization_id = default_org_id WHERE organization_id IS NULL;

  -- Priority 7: Field safety/compliance tables
  UPDATE contractor_deficiencies SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE inspector_assignments SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE field_hazard_entries SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE field_recognition_entries SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE field_wildlife_entries SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE compliance_issues SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE observation_photos SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE photos SET organization_id = default_org_id WHERE organization_id IS NULL;

  -- Priority 8: Reconciliation tables
  UPDATE contractor_lems SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE disputes SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE reconciliation_corrections SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE labour_rates SET organization_id = default_org_id WHERE organization_id IS NULL;
  UPDATE equipment_rates SET organization_id = default_org_id WHERE organization_id IS NULL;

  RAISE NOTICE 'Backfill complete: All existing data assigned to Default organization';
END $$;

-- =====================================================
-- NOTE: Making columns NOT NULL and adding RLS
-- Run this section ONLY after verifying backfill is complete
-- For safety, this is commented out - uncomment when ready
-- =====================================================

/*
-- Make organization_id NOT NULL on core tables
ALTER TABLE daily_tickets ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE daily_reports ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE inspection_reports ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE report_status ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE report_audit_log ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE clearing_inspections ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE ndt_inspections ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE trench_logs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE tie_ins ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE inspector_timesheets ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE trackable_items ALTER COLUMN organization_id SET NOT NULL;
*/
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
