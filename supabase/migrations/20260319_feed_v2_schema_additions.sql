-- =====================================================
-- FEED INTELLIGENCE v2 — Schema Additions
-- Date: 2026-03-19
-- Segment 1: ALTER existing tables + CREATE epcm_firms
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. ALTER feed_estimates — add lifecycle & benchmark columns
-- =====================================================
ALTER TABLE feed_estimates
  ADD COLUMN IF NOT EXISTS estimate_version     TEXT DEFAULT 'V1',
  ADD COLUMN IF NOT EXISTS estimate_basis_year  INTEGER,
  ADD COLUMN IF NOT EXISTS contingency_pct      NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS escalation_pct       NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS approval_status      TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS source_document_url  TEXT;

-- Partial unique index: only one non-superseded estimate per project
CREATE UNIQUE INDEX IF NOT EXISTS feed_estimates_one_active_per_project
  ON feed_estimates (project_id)
  WHERE approval_status != 'superseded';

-- =====================================================
-- 2. ALTER feed_wbs_items — add category & basis notes
-- =====================================================
ALTER TABLE feed_wbs_items
  ADD COLUMN IF NOT EXISTS scope_category  TEXT,
  ADD COLUMN IF NOT EXISTS basis_notes     TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- Index for cross-project benchmarking by category
CREATE INDEX IF NOT EXISTS idx_feed_wbs_items_category
  ON feed_wbs_items (organization_id, scope_category);

-- =====================================================
-- 3. ALTER feed_risks — add updated_at
-- =====================================================
ALTER TABLE feed_risks
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

-- =====================================================
-- 4. CREATE epcm_firms — Phase 2 foundation
-- The UI for managing firms is Phase 2, but the table
-- and FK need to exist now so estimates can be linked.
-- =====================================================
CREATE TABLE IF NOT EXISTS epcm_firms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  short_name      TEXT,
  country         TEXT DEFAULT 'CA',
  website         TEXT,
  contact_name    TEXT,
  contact_email   TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE epcm_firms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for epcm_firms" ON epcm_firms;
CREATE POLICY "Tenant isolation for epcm_firms"
ON epcm_firms FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

CREATE INDEX IF NOT EXISTS idx_epcm_firms_org
  ON epcm_firms (organization_id);

-- =====================================================
-- 5. Add epcm_firm_id FK on feed_estimates
-- (must come after epcm_firms table is created)
-- =====================================================
ALTER TABLE feed_estimates
  ADD COLUMN IF NOT EXISTS epcm_firm_id UUID;

ALTER TABLE feed_estimates
  ADD CONSTRAINT feed_estimates_epcm_firm_id_fkey
  FOREIGN KEY (epcm_firm_id) REFERENCES epcm_firms(id);

CREATE INDEX IF NOT EXISTS idx_feed_estimates_epcm_firm
  ON feed_estimates (epcm_firm_id);

-- =====================================================
-- 6. updated_at triggers for new/amended tables
-- =====================================================
CREATE OR REPLACE FUNCTION update_feed_wbs_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feed_wbs_items_updated_at ON feed_wbs_items;
CREATE TRIGGER trg_feed_wbs_items_updated_at
  BEFORE UPDATE ON feed_wbs_items
  FOR EACH ROW
  EXECUTE FUNCTION update_feed_wbs_items_updated_at();

CREATE OR REPLACE FUNCTION update_feed_risks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feed_risks_updated_at ON feed_risks;
CREATE TRIGGER trg_feed_risks_updated_at
  BEFORE UPDATE ON feed_risks
  FOR EACH ROW
  EXECUTE FUNCTION update_feed_risks_updated_at();

CREATE OR REPLACE FUNCTION update_epcm_firms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_epcm_firms_updated_at ON epcm_firms;
CREATE TRIGGER trg_epcm_firms_updated_at
  BEFORE UPDATE ON epcm_firms
  FOR EACH ROW
  EXECUTE FUNCTION update_epcm_firms_updated_at();
