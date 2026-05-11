-- document_matches: pairs LEM and Daily Ticket reconciliation_documents.
-- Created by the Bulk Upload feature. One row per confirmed pair; status
-- stays 'pending' until the admin clicks Confirm and Save on the results
-- page. ASCII-only (the Supabase SQL editor rejected box-drawing chars).
-- Safe to re-run: every CREATE/ALTER uses IF NOT EXISTS / DROP IF EXISTS.
--
-- RLS pattern matches the rest of the codebase via the existing helpers
-- is_super_admin() and user_organization_ids() (defined in
-- 20260131_05_add_rls_policies.sql), not user_organizations directly.

CREATE TABLE IF NOT EXISTS document_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  lem_document_id UUID REFERENCES reconciliation_documents(id) ON DELETE CASCADE,
  ticket_document_id UUID REFERENCES reconciliation_documents(id) ON DELETE CASCADE,
  match_key TEXT NOT NULL,
  match_method TEXT NOT NULL CHECK (match_method IN ('ticket_number', 'date_foreman_crew', 'manual')),
  match_confidence NUMERIC(3,2) CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_matches_pair_uniq UNIQUE (lem_document_id, ticket_document_id)
);

-- Lookup indexes for auto-link logic and four-panel viewer queries
CREATE INDEX IF NOT EXISTS idx_document_matches_org_match_key
  ON document_matches (organization_id, match_key);
CREATE INDEX IF NOT EXISTS idx_document_matches_lem_doc
  ON document_matches (lem_document_id);
CREATE INDEX IF NOT EXISTS idx_document_matches_ticket_doc
  ON document_matches (ticket_document_id);
CREATE INDEX IF NOT EXISTS idx_document_matches_status
  ON document_matches (organization_id, status);

-- Auto-touch updated_at on every row mutation
CREATE OR REPLACE FUNCTION document_matches_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_matches_set_updated_at ON document_matches;
CREATE TRIGGER document_matches_set_updated_at
  BEFORE UPDATE ON document_matches
  FOR EACH ROW
  EXECUTE FUNCTION document_matches_touch_updated_at();

-- RLS: same FOR ALL helper-function pattern as every other data table
-- in this project (see 20260131_05_add_rls_policies.sql).
ALTER TABLE document_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for document_matches" ON document_matches;
CREATE POLICY "Tenant isolation for document_matches"
ON document_matches FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- reconciliation_documents: add bulk-upload metadata columns
ALTER TABLE reconciliation_documents
  ADD COLUMN IF NOT EXISTS crew_or_spread TEXT,
  ADD COLUMN IF NOT EXISTS bulk_upload_id UUID,
  ADD COLUMN IF NOT EXISTS source_pages INT[],
  ADD COLUMN IF NOT EXISTS ocr_confidence TEXT
    CHECK (ocr_confidence IS NULL OR ocr_confidence IN ('high', 'medium', 'low'));

CREATE INDEX IF NOT EXISTS idx_reconciliation_documents_bulk_upload
  ON reconciliation_documents (bulk_upload_id)
  WHERE bulk_upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reconciliation_documents_match_key
  ON reconciliation_documents (organization_id, date, foreman, crew_or_spread)
  WHERE date IS NOT NULL;

COMMENT ON TABLE document_matches IS
  'Pairs LEM and Daily Ticket documents discovered by the Bulk Upload feature. One row per confirmed pair; status=pending until admin confirms on the results page.';
COMMENT ON COLUMN reconciliation_documents.bulk_upload_id IS
  'Groups all reconciliation_documents created from a single bulk PDF upload, for audit / re-process.';
COMMENT ON COLUMN reconciliation_documents.source_pages IS
  'Page numbers from the original bulk-uploaded PDF that this document was split from.';
COMMENT ON COLUMN reconciliation_documents.ocr_confidence IS
  'Confidence in the OCR-extracted ticket number / metadata: high | medium | low.';
