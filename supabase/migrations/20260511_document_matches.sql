-- ============================================================================
-- document_matches — pairs LEM ↔ Daily Ticket reconciliation_documents
-- ============================================================================
-- Purpose: When a bulk PDF is split, classified, and grouped, each LEM
-- group should be paired with the matching daily ticket group from the
-- same date + foreman + crew. This table records those pairings so the
-- four-panel reconciliation UI can pull both sides automatically when
-- an inspector report lands for the same date+foreman+crew.
--
-- Match methods:
--   ticket_number       — both docs share an explicit handwritten
--                         ticket number (highest confidence)
--   date_foreman_crew   — implicit match on date + foreman + crew when
--                         the ticket number is missing on one side
--   manual              — admin reassigned the match in the review UI
--
-- Status lifecycle:
--   pending     — auto-suggested by bulkUploadProcessor, not yet
--                 confirmed by an admin on the results page
--   confirmed   — admin clicked "Confirm and Save" on the results page
--   rejected   — admin rejected the suggested pair (kept for audit;
--                 the docs themselves are not deleted)
--
-- Safe to re-run: all CREATE statements use IF NOT EXISTS.
-- ============================================================================

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
  -- A given LEM/ticket pair should only show up once; subsequent
  -- bulk uploads with the same pair should update, not duplicate.
  CONSTRAINT document_matches_pair_uniq UNIQUE (lem_document_id, ticket_document_id)
);

-- Lookup indexes for the auto-link logic in InspectorReport save and the
-- four-panel viewer's "find related docs" sweep.
CREATE INDEX IF NOT EXISTS idx_document_matches_org_match_key
  ON document_matches (organization_id, match_key);
CREATE INDEX IF NOT EXISTS idx_document_matches_lem_doc
  ON document_matches (lem_document_id);
CREATE INDEX IF NOT EXISTS idx_document_matches_ticket_doc
  ON document_matches (ticket_document_id);
CREATE INDEX IF NOT EXISTS idx_document_matches_status
  ON document_matches (organization_id, status);

-- Touch updated_at on every row mutation
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

-- ── RLS — same pattern as reconciliation_documents ─────────────────────────
ALTER TABLE document_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_matches_org_select ON document_matches;
CREATE POLICY document_matches_org_select ON document_matches
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS document_matches_org_insert ON document_matches;
CREATE POLICY document_matches_org_insert ON document_matches
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS document_matches_org_update ON document_matches;
CREATE POLICY document_matches_org_update ON document_matches
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS document_matches_org_delete ON document_matches;
CREATE POLICY document_matches_org_delete ON document_matches
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    )
  );

-- ── reconciliation_documents — add crew_or_spread + bulk-upload metadata ──
-- These columns let the bulk-upload flow round-trip the per-group OCR
-- metadata (crew/spread, OCR confidence, original page range in the
-- source PDF). All NULL-safe so existing rows are unaffected.
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
  'Pairs LEM ↔ Daily Ticket documents discovered by the Bulk Upload feature. One row per confirmed pair; status=pending until admin confirms on the results page.';
COMMENT ON COLUMN reconciliation_documents.bulk_upload_id IS
  'Groups all reconciliation_documents created from a single bulk PDF upload, for audit / re-process.';
COMMENT ON COLUMN reconciliation_documents.source_pages IS
  'Page numbers from the original bulk-uploaded PDF that this document was split from.';
COMMENT ON COLUMN reconciliation_documents.ocr_confidence IS
  'Confidence in the OCR-extracted ticket number / metadata: high | medium | low.';
