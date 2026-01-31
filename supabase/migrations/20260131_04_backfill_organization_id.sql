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
