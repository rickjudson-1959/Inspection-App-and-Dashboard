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
