-- LEM Reconciliation Tables
-- Adds contractor_lem_uploads (parent) and lem_line_items (per-ticket) tables
-- for three-way reconciliation: Original Ticket <-> Inspector Report <-> Contractor LEM

-- =====================================================
-- TABLE 1: contractor_lem_uploads (parent LEM documents)
-- =====================================================
CREATE TABLE IF NOT EXISTS contractor_lem_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  contractor_name TEXT NOT NULL,
  lem_period_start DATE,
  lem_period_end DATE,
  lem_number TEXT,
  source_filename TEXT NOT NULL,
  source_file_url TEXT,
  total_labour_hours NUMERIC(10,2) DEFAULT 0,
  total_equipment_hours NUMERIC(10,2) DEFAULT 0,
  total_labour_cost NUMERIC(12,2) DEFAULT 0,
  total_equipment_cost NUMERIC(12,2) DEFAULT 0,
  total_claimed NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'uploaded',
  parse_errors JSONB DEFAULT '[]',
  notes TEXT,
  CONSTRAINT valid_lem_upload_status CHECK (status IN ('uploaded', 'parsing', 'parsed', 'reconciling', 'reconciled', 'disputed', 'approved'))
);

-- RLS
ALTER TABLE contractor_lem_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for contractor_lem_uploads" ON contractor_lem_uploads;
CREATE POLICY "Tenant isolation for contractor_lem_uploads"
ON contractor_lem_uploads FOR ALL
USING (
  organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_lem_uploads_org ON contractor_lem_uploads(organization_id);
CREATE INDEX IF NOT EXISTS idx_lem_uploads_status ON contractor_lem_uploads(status);

-- =====================================================
-- TABLE 2: lem_line_items (per-ticket line items)
-- =====================================================
CREATE TABLE IF NOT EXISTS lem_line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lem_id UUID REFERENCES contractor_lem_uploads(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  ticket_number TEXT,
  work_date DATE,
  crew_name TEXT,
  foreman TEXT,
  activity_description TEXT,

  -- Labour claimed
  labour_entries JSONB DEFAULT '[]',
  total_labour_hours NUMERIC(10,2) DEFAULT 0,
  total_labour_cost NUMERIC(12,2) DEFAULT 0,

  -- Equipment claimed
  equipment_entries JSONB DEFAULT '[]',
  total_equipment_hours NUMERIC(10,2) DEFAULT 0,
  total_equipment_cost NUMERIC(12,2) DEFAULT 0,

  -- Line total
  line_total NUMERIC(12,2) DEFAULT 0,

  -- Matching
  matched_report_id UUID,
  matched_block_index INTEGER,
  match_confidence TEXT DEFAULT 'none',
  match_status TEXT DEFAULT 'unmatched',

  -- Variance data (populated after matching)
  variance_data JSONB,

  -- Resolution
  resolution TEXT,
  resolution_notes TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,

  CONSTRAINT valid_line_match_status CHECK (match_status IN ('unmatched', 'matched', 'clean', 'variance', 'disputed', 'resolved')),
  CONSTRAINT valid_match_confidence CHECK (match_confidence IN ('none', 'exact', 'normalized', 'date_crew', 'manual'))
);

-- RLS
ALTER TABLE lem_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for lem_line_items" ON lem_line_items;
CREATE POLICY "Tenant isolation for lem_line_items"
ON lem_line_items FOR ALL
USING (
  organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_lem_line_items_lem ON lem_line_items(lem_id);
CREATE INDEX IF NOT EXISTS idx_lem_line_items_ticket ON lem_line_items(ticket_number, organization_id);
CREATE INDEX IF NOT EXISTS idx_lem_line_items_date ON lem_line_items(work_date, organization_id);
CREATE INDEX IF NOT EXISTS idx_lem_line_items_status ON lem_line_items(match_status);
