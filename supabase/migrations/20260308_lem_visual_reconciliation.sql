CREATE TABLE IF NOT EXISTS lem_reconciliation_pairs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lem_upload_id UUID REFERENCES contractor_lem_uploads(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),

  -- Classification data (minimal — just enough to match)
  pair_index INTEGER,  -- order within the upload
  work_date DATE,
  crew_name TEXT,

  -- Document images (stored in Supabase storage)
  lem_page_urls JSONB DEFAULT '[]',           -- URLs to LEM page images
  lem_page_indices JSONB DEFAULT '[]',        -- page numbers in original PDF
  contractor_ticket_urls JSONB DEFAULT '[]',  -- URLs to contractor's ticket page images
  contractor_ticket_indices JSONB DEFAULT '[]',

  -- Matched inspector report
  matched_report_id UUID,
  matched_block_index INTEGER,
  match_method TEXT DEFAULT 'unmatched',  -- 'date_crew', 'ticket_number', 'manual', 'unmatched'

  -- Resolution
  status TEXT DEFAULT 'pending',
  resolution TEXT,        -- 'accepted', 'disputed_variance', 'disputed_ticket_altered'
  resolution_notes TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_pair_status CHECK (status IN ('pending', 'accepted', 'disputed', 'skipped'))
);

ALTER TABLE lem_reconciliation_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation for lem_reconciliation_pairs"
ON lem_reconciliation_pairs FOR ALL
USING (
  organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
);

CREATE INDEX idx_lem_pairs_upload ON lem_reconciliation_pairs(lem_upload_id);
CREATE INDEX idx_lem_pairs_date ON lem_reconciliation_pairs(work_date, organization_id);
CREATE INDEX idx_lem_pairs_status ON lem_reconciliation_pairs(status);
