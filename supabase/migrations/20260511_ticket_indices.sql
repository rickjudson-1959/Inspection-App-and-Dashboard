-- ticket_indices: per-date foreman -> ticket-number lookup table
-- used by the Bulk Upload feature.
--
-- The contractor's daily package usually starts with an "index" page
-- that lists every foreman, their role, and the Field Log Number
-- assigned to them for the day. The Bulk Upload flow uses this index
-- as ground truth so it can:
--   1. derive a missing ticket number on a daily ticket from the
--      foreman name alone, and
--   2. validate that the foreman name printed on each LEM matches the
--      one the index assigned to that ticket number.
--
-- Keyed by (organization_id, project_id, index_date) — UPSERT-friendly
-- so the same date can be re-OCR'd if the index is reuploaded.
-- ASCII-only. Safe to re-run.

CREATE TABLE IF NOT EXISTS ticket_indices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  index_date DATE NOT NULL,
  -- JSON shape:
  --   [{ "last_name": "...", "first_name": "...", "role": "...",
  --      "ticket_number": "18260" }, ...]
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_file_url TEXT,
  source_filename TEXT,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ticket_indices_org_date_uniq UNIQUE (organization_id, index_date)
);

CREATE INDEX IF NOT EXISTS idx_ticket_indices_org_date
  ON ticket_indices (organization_id, index_date);

-- Auto-touch updated_at on every row mutation
CREATE OR REPLACE FUNCTION ticket_indices_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_indices_set_updated_at ON ticket_indices;
CREATE TRIGGER ticket_indices_set_updated_at
  BEFORE UPDATE ON ticket_indices
  FOR EACH ROW
  EXECUTE FUNCTION ticket_indices_touch_updated_at();

-- RLS: same pattern as document_matches and the other tenant tables
ALTER TABLE ticket_indices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for ticket_indices" ON ticket_indices;
CREATE POLICY "Tenant isolation for ticket_indices"
ON ticket_indices FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

COMMENT ON TABLE ticket_indices IS
  'Per-date foreman to ticket-number lookup. Built by Bulk Upload from the package index page. Used to group package pages and to derive missing ticket numbers from foreman names.';
COMMENT ON COLUMN ticket_indices.entries IS
  'JSON array of { last_name, first_name, role, ticket_number } objects, one per foreman on the date.';
