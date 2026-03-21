-- ============================================================================
-- LEM Categories & Standalone Ticket Entry
-- March 21, 2026
--
-- Adds lem_category to contractor_lem_uploads (direct/indirect/third_party)
-- and creates standalone_tickets table for admin-entered tickets without
-- inspector reports. Enables three-lane LEM reconciliation.
-- ============================================================================

-- 1. Add lem_category to contractor_lem_uploads
ALTER TABLE contractor_lem_uploads
  ADD COLUMN IF NOT EXISTS lem_category text DEFAULT 'direct'
    CHECK (lem_category IN ('direct', 'indirect', 'third_party'));

COMMENT ON COLUMN contractor_lem_uploads.lem_category IS
  'direct = field crew with inspector, indirect = overhead/office, third_party = subcontractor';

-- 2. Create standalone_tickets table
-- For tickets entered by admin/cost control without an inspector report.
-- These serve as the source of truth for indirect and third-party work.
CREATE TABLE IF NOT EXISTS standalone_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  ticket_number   text,
  work_date       date NOT NULL,
  contractor_name text NOT NULL,
  po_number       text,
  lem_category    text NOT NULL DEFAULT 'third_party'
                  CHECK (lem_category IN ('direct', 'indirect', 'third_party')),
  description     text,

  -- Photo/scan of the signed ticket
  ticket_photo_urls jsonb DEFAULT '[]'::jsonb,

  -- Labour and equipment entries (same structure as activity block)
  labour_entries  jsonb DEFAULT '[]'::jsonb,
  equipment_entries jsonb DEFAULT '[]'::jsonb,

  -- Calculated costs (populated from rate cards on save)
  total_labour_cost   numeric(14,2) DEFAULT 0,
  total_equipment_cost numeric(14,2) DEFAULT 0,
  total_cost          numeric(14,2) DEFAULT 0,

  -- Who signed the ticket in the field
  signed_by       text,
  signed_role     text,  -- chief_inspector, cm, pm

  -- Entry tracking
  entered_by      uuid REFERENCES auth.users(id),
  notes           text,

  -- Matching
  matched_lem_upload_id uuid REFERENCES contractor_lem_uploads(id) ON DELETE SET NULL,
  matched_pair_id       uuid REFERENCES lem_reconciliation_pairs(id) ON DELETE SET NULL,
  status          text DEFAULT 'entered'
                  CHECK (status IN ('entered', 'matched', 'reconciled', 'approved')),

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 3. RLS
ALTER TABLE standalone_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for standalone_tickets"
  ON standalone_tickets FOR ALL
  USING (
    is_super_admin() OR
    organization_id IN (SELECT user_organization_ids())
  );

-- 4. Indexes
CREATE INDEX idx_standalone_tickets_org ON standalone_tickets (organization_id);
CREATE INDEX idx_standalone_tickets_contractor ON standalone_tickets (contractor_name);
CREATE INDEX idx_standalone_tickets_date ON standalone_tickets (work_date);
CREATE INDEX idx_standalone_tickets_po ON standalone_tickets (po_number) WHERE po_number IS NOT NULL;
CREATE INDEX idx_standalone_tickets_lem ON standalone_tickets (matched_lem_upload_id) WHERE matched_lem_upload_id IS NOT NULL;
CREATE INDEX idx_standalone_tickets_status ON standalone_tickets (status);
CREATE INDEX idx_lem_uploads_category ON contractor_lem_uploads (lem_category);

-- 5. Add ticket_source to lem_reconciliation_pairs to track where Panel 3 comes from
ALTER TABLE lem_reconciliation_pairs
  ADD COLUMN IF NOT EXISTS ticket_source text DEFAULT 'inspector_report'
    CHECK (ticket_source IN ('inspector_report', 'standalone_ticket'));
ALTER TABLE lem_reconciliation_pairs
  ADD COLUMN IF NOT EXISTS standalone_ticket_id uuid REFERENCES standalone_tickets(id) ON DELETE SET NULL;

-- 6. Add lem_claimed_data column for OCR-extracted billing data from LEM pages
ALTER TABLE lem_reconciliation_pairs
  ADD COLUMN IF NOT EXISTS lem_claimed_data jsonb;

COMMENT ON COLUMN lem_reconciliation_pairs.lem_claimed_data IS
  'Claude Vision OCR-extracted billing data from LEM summary pages: {labour:[], equipment:[], totals:{}, extracted_at}';
