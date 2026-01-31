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
