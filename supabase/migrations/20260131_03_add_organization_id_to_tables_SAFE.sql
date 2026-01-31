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
