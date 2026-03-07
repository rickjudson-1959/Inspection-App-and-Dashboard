-- LEM Four-Way Comparison & Invoice Verification
-- 1. Add contractor_ticket_url to lem_line_items
-- 2. Update resolution constraint to include 'ticket_altered'
-- 3. Create contractor_invoices table

-- Add contractor ticket image column
ALTER TABLE lem_line_items ADD COLUMN IF NOT EXISTS contractor_ticket_url TEXT;

-- Update match_status constraint to allow 'ticket_altered' as a resolution value
-- (resolution is a free text field, no constraint change needed)

-- =====================================================
-- TABLE: contractor_invoices
-- =====================================================
CREATE TABLE IF NOT EXISTS contractor_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  lem_id UUID REFERENCES contractor_lem_uploads(id),
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  contractor_name TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE,
  invoice_period_start DATE,
  invoice_period_end DATE,
  source_filename TEXT NOT NULL,
  source_file_url TEXT,

  -- Invoice totals (parsed from PDF)
  invoice_labour_hours NUMERIC(10,2) DEFAULT 0,
  invoice_equipment_hours NUMERIC(10,2) DEFAULT 0,
  invoice_labour_cost NUMERIC(12,2) DEFAULT 0,
  invoice_equipment_cost NUMERIC(12,2) DEFAULT 0,
  invoice_subtotal NUMERIC(12,2) DEFAULT 0,
  invoice_tax NUMERIC(12,2) DEFAULT 0,
  invoice_total NUMERIC(12,2) DEFAULT 0,

  -- Reconciliation comparison
  reconciled_labour_cost NUMERIC(12,2),
  reconciled_equipment_cost NUMERIC(12,2),
  reconciled_total NUMERIC(12,2),
  variance_amount NUMERIC(12,2),
  variance_percentage NUMERIC(5,2),

  -- Status
  status TEXT DEFAULT 'uploaded',
  rejection_reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  payment_date DATE,
  payment_reference TEXT,
  notes TEXT,

  CONSTRAINT valid_invoice_status CHECK (status IN ('uploaded', 'parsed', 'matched', 'approved', 'rejected', 'paid'))
);

-- RLS
ALTER TABLE contractor_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for contractor_invoices" ON contractor_invoices;
CREATE POLICY "Tenant isolation for contractor_invoices"
ON contractor_invoices FOR ALL
USING (
  organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON contractor_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_lem ON contractor_invoices(lem_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON contractor_invoices(status);
