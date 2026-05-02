-- =============================================================================
-- 20260502_clx2_baselines_and_pipeline_column.sql
-- Adds project filtering by `pipeline` column (matches daily_reports.pipeline)
-- and seeds CLX-2 baseline data for EVM calculations.
-- =============================================================================

-- 1. Add columns so baselines can be filtered the same way daily_reports are
ALTER TABLE project_baselines
  ADD COLUMN IF NOT EXISTS pipeline TEXT;

ALTER TABLE project_baselines
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

ALTER TABLE project_baselines
  ADD COLUMN IF NOT EXISTS provisional BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_baselines_pipeline ON project_baselines(pipeline);
CREATE INDEX IF NOT EXISTS idx_baselines_org ON project_baselines(organization_id);

-- 2. RLS policy for org-scoped reads (admins/PM/CM already have full access via existing policy)
DROP POLICY IF EXISTS "project_baselines org read" ON project_baselines;
CREATE POLICY "project_baselines org read" ON project_baselines
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid() AND m.organization_id = project_baselines.organization_id
    )
  );

-- =============================================================================
-- 3. Seed CLX-2 baselines
-- Project: CLX-2 (Foster Creek Mainline Loop / equivalent)
-- Pipeline: NPS 36, length 76,300 m
-- FEED budget: $68.4M     Actual: $74.1M
-- Construction window: Apr 1 2014 – Nov 30 2014
-- Cost per metre (FEED): $68,400,000 / 76,300 = ~$896.46/m
-- Activity allocations are PROVISIONAL — based on standard pipeline construction
-- breakdowns. Replace with project-specific actuals when available.
-- =============================================================================

-- Wipe any prior CLX-2 baseline rows so this migration is idempotent
DELETE FROM project_baselines WHERE pipeline = 'CLX-2';

-- Per-activity cost percentages (sum = 100%) and schedule windows
-- All costs derived from FEED total of $68.4M against 76,300m
INSERT INTO project_baselines (
  pipeline, spread, activity_type,
  planned_metres, start_kp, end_kp,
  budgeted_unit_cost,
  planned_start_date, planned_end_date,
  labour_rate_per_hour, equipment_rate_per_hour,
  is_active, provisional, notes
) VALUES
  -- Access roads (3% of $68.4M = $2.052M / 76,300m = $26.89/m)
  ('CLX-2', 'Spread 1', 'Access',
    76300, '0+000', '76+300', 26.89,
    '2014-04-01', '2014-06-30', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 3% of $68.4M FEED budget. Refine with actual contract breakdown.'),

  -- Clearing (5% = $3.420M / 76,300m = $44.82/m)
  ('CLX-2', 'Spread 1', 'Clearing',
    76300, '0+000', '76+300', 44.82,
    '2014-04-01', '2014-07-15', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 5% allocation. Standard clearing scope NPS 36 ROW.'),

  -- Stripping (4% = $2.736M / 76,300m = $35.86/m)
  ('CLX-2', 'Spread 1', 'Stripping',
    76300, '0+000', '76+300', 35.86,
    '2014-05-01', '2014-08-15', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 4% allocation.'),

  -- Grading (8% = $5.472M / 76,300m = $71.72/m)
  ('CLX-2', 'Spread 1', 'Grading',
    76300, '0+000', '76+300', 71.72,
    '2014-05-01', '2014-08-31', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 8% allocation.'),

  -- Stringing (3% = $2.052M / 76,300m = $26.89/m)
  ('CLX-2', 'Spread 1', 'Stringing',
    76300, '0+000', '76+300', 26.89,
    '2014-06-15', '2014-09-15', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 3% allocation.'),

  -- Bending (5% = $3.420M / 76,300m = $44.82/m)
  ('CLX-2', 'Spread 1', 'Bending',
    76300, '0+000', '76+300', 44.82,
    '2014-07-01', '2014-09-30', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 5% allocation.'),

  -- Welding (18% = $12.312M / 76,300m = $161.36/m) — most cost-intensive
  ('CLX-2', 'Spread 1', 'Welding',
    76300, '0+000', '76+300', 161.36,
    '2014-07-01', '2014-10-15', 95.00, 150.00, TRUE, TRUE,
    'Provisional: 18% allocation. Highest cost activity. Higher labour rate ($95) for welder premium.'),

  -- Tie-ins (6% = $4.104M / 76,300m = $53.79/m)
  ('CLX-2', 'Spread 1', 'Tie-ins',
    76300, '0+000', '76+300', 53.79,
    '2014-08-01', '2014-10-31', 95.00, 150.00, TRUE, TRUE,
    'Provisional: 6% allocation.'),

  -- Tie-in Backfill (4% = $2.736M / 76,300m = $35.86/m)
  ('CLX-2', 'Spread 1', 'Tie-in Backfill',
    76300, '0+000', '76+300', 35.86,
    '2014-09-01', '2014-11-15', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 4% allocation.'),

  -- Tie-in Coating (3% = $2.052M / 76,300m = $26.89/m)
  ('CLX-2', 'Spread 1', 'Tie-in Coating',
    76300, '0+000', '76+300', 26.89,
    '2014-08-15', '2014-10-31', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 3% allocation.'),

  -- Coating (7% = $4.788M / 76,300m = $62.75/m)
  ('CLX-2', 'Spread 1', 'Coating',
    76300, '0+000', '76+300', 62.75,
    '2014-08-01', '2014-10-15', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 7% allocation.'),

  -- Ditch (9% = $6.156M / 76,300m = $80.68/m)
  ('CLX-2', 'Spread 1', 'Ditch',
    76300, '0+000', '76+300', 80.68,
    '2014-08-01', '2014-10-15', 85.00, 175.00, TRUE, TRUE,
    'Provisional: 9% allocation. Higher equipment rate ($175) for excavators on rocky ground.'),

  -- Lower-in (8% = $5.472M / 76,300m = $71.72/m)
  ('CLX-2', 'Spread 1', 'Lower-in',
    76300, '0+000', '76+300', 71.72,
    '2014-08-15', '2014-10-31', 85.00, 175.00, TRUE, TRUE,
    'Provisional: 8% allocation.'),

  -- Backfill (6% = $4.104M / 76,300m = $53.79/m)
  ('CLX-2', 'Spread 1', 'Backfill',
    76300, '0+000', '76+300', 53.79,
    '2014-09-01', '2014-11-15', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 6% allocation.'),

  -- Cleanup - Machine (6% = $4.104M / 76,300m = $53.79/m)
  ('CLX-2', 'Spread 1', 'Cleanup - Machine',
    76300, '0+000', '76+300', 53.79,
    '2014-09-15', '2014-11-15', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 6% allocation.'),

  -- Cleanup - Final (5% = $3.420M / 76,300m = $44.82/m)
  ('CLX-2', 'Spread 1', 'Cleanup - Final',
    76300, '0+000', '76+300', 44.82,
    '2014-10-01', '2014-11-30', 85.00, 150.00, TRUE, TRUE,
    'Provisional: 5% allocation. Final reclamation pass.');

-- Verification: total budget should approximate $68.4M
--   SELECT pipeline, SUM(planned_metres * budgeted_unit_cost) AS total_budget
--   FROM project_baselines WHERE pipeline = 'CLX-2' GROUP BY pipeline;
-- Expected ≈ $68.4M (sum of all 16 activities = 100% of FEED)

-- =============================================================================
-- Notes for the team:
--   • All cost allocations marked provisional=TRUE in this migration
--   • Actuals tracked $74.1M against $68.4M FEED — overrun should appear in EVM CPI
--   • Activity windows are estimates based on typical sequencing; refine when
--     historical schedule data is loaded
--   • The `pipeline` column matches daily_reports.pipeline for direct filtering
-- =============================================================================
