-- =====================================================
-- FEED INTELLIGENCE MODULE — Tables, RLS, Indexes
-- Date: 2026-03-19
-- Purpose: Connect FEED (Front End Engineering Design)
-- estimates to actual LEM spend for EPCM accountability
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- TABLE: feed_estimates
-- One FEED estimate per project. Links EPCM firm's
-- Class 3 estimate to the project for variance tracking.
-- =====================================================
CREATE TABLE IF NOT EXISTS feed_estimates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id      UUID REFERENCES projects(id),
  epcm_firm       TEXT,
  estimate_class  TEXT DEFAULT 'Class 3',
  total_estimate  NUMERIC(14,2),
  estimate_date   DATE,
  currency        TEXT DEFAULT 'CAD',
  meta            JSONB DEFAULT '{}',
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one FEED estimate per project per org
CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_estimates_project
  ON feed_estimates (organization_id, project_id);

-- =====================================================
-- TABLE: feed_wbs_items
-- WBS (Work Breakdown Structure) line items within a
-- FEED estimate. These are the scope buckets the EPCM
-- firm priced during front-end engineering.
-- =====================================================
CREATE TABLE IF NOT EXISTS feed_wbs_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  feed_estimate_id  UUID NOT NULL REFERENCES feed_estimates(id) ON DELETE CASCADE,
  wbs_code          TEXT,
  scope_name        TEXT NOT NULL,
  estimated_amount  NUMERIC(14,2),
  unit              TEXT,
  unit_rate         NUMERIC(10,2),
  quantity          NUMERIC(10,2),
  sort_order        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABLE: feed_wbs_actuals
-- Bridge table mapping LEM line items to WBS items.
-- This is how field spend gets tagged back to FEED scope.
-- =====================================================
CREATE TABLE IF NOT EXISTS feed_wbs_actuals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  wbs_item_id     UUID NOT NULL REFERENCES feed_wbs_items(id) ON DELETE CASCADE,
  lem_entry_id    UUID NOT NULL REFERENCES lem_line_items(id),
  actual_amount   NUMERIC(14,2),
  variance_note   TEXT,
  tagged_by       UUID REFERENCES auth.users(id),
  tagged_at       TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABLE: feed_risks
-- Risk register produced during FEED. Captures geotech,
-- constructability, regulatory, and schedule risks with
-- cost allowances from the engineering phase.
-- =====================================================
CREATE TABLE IF NOT EXISTS feed_risks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  feed_estimate_id  UUID NOT NULL REFERENCES feed_estimates(id) ON DELETE CASCADE,
  risk_description  TEXT NOT NULL,
  category          TEXT,
  severity          TEXT,
  cost_allowance    NUMERIC(14,2),
  status            TEXT DEFAULT 'open',
  sort_order        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABLE: feed_risk_closeouts
-- Inspector-authored closeout records linking field
-- evidence to a FEED risk item. Connects risk theory
-- to actual field outcomes.
-- =====================================================
CREATE TABLE IF NOT EXISTS feed_risk_closeouts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  risk_id             UUID NOT NULL REFERENCES feed_risks(id) ON DELETE CASCADE,
  inspector_report_id BIGINT REFERENCES daily_reports(id),
  outcome             TEXT,
  actual_cost_impact  NUMERIC(14,2),
  closed_date         DATE,
  field_notes         TEXT,
  closed_by           UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ROW LEVEL SECURITY
-- Pattern: org-scoped with super_admin bypass
-- Uses existing is_super_admin() and user_organization_ids()
-- helper functions from 20260131_05_add_rls_policies.sql
-- =====================================================

ALTER TABLE feed_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_wbs_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_wbs_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_risk_closeouts ENABLE ROW LEVEL SECURITY;

-- feed_estimates
DROP POLICY IF EXISTS "Tenant isolation for feed_estimates" ON feed_estimates;
CREATE POLICY "Tenant isolation for feed_estimates"
ON feed_estimates FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- feed_wbs_items
DROP POLICY IF EXISTS "Tenant isolation for feed_wbs_items" ON feed_wbs_items;
CREATE POLICY "Tenant isolation for feed_wbs_items"
ON feed_wbs_items FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- feed_wbs_actuals
DROP POLICY IF EXISTS "Tenant isolation for feed_wbs_actuals" ON feed_wbs_actuals;
CREATE POLICY "Tenant isolation for feed_wbs_actuals"
ON feed_wbs_actuals FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- feed_risks
DROP POLICY IF EXISTS "Tenant isolation for feed_risks" ON feed_risks;
CREATE POLICY "Tenant isolation for feed_risks"
ON feed_risks FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- feed_risk_closeouts
DROP POLICY IF EXISTS "Tenant isolation for feed_risk_closeouts" ON feed_risk_closeouts;
CREATE POLICY "Tenant isolation for feed_risk_closeouts"
ON feed_risk_closeouts FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_feed_estimates_org_project
  ON feed_estimates (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_feed_wbs_items_estimate
  ON feed_wbs_items (feed_estimate_id);

CREATE INDEX IF NOT EXISTS idx_feed_wbs_actuals_item
  ON feed_wbs_actuals (wbs_item_id);

CREATE INDEX IF NOT EXISTS idx_feed_wbs_actuals_lem
  ON feed_wbs_actuals (lem_entry_id);

CREATE INDEX IF NOT EXISTS idx_feed_risks_estimate
  ON feed_risks (feed_estimate_id);

CREATE INDEX IF NOT EXISTS idx_feed_risk_closeouts_risk
  ON feed_risk_closeouts (risk_id);

-- =====================================================
-- TRIGGER: auto-update updated_at on feed_estimates
-- =====================================================
CREATE OR REPLACE FUNCTION update_feed_estimates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feed_estimates_updated_at ON feed_estimates;
CREATE TRIGGER trg_feed_estimates_updated_at
  BEFORE UPDATE ON feed_estimates
  FOR EACH ROW
  EXECUTE FUNCTION update_feed_estimates_updated_at();
