-- Fix P0: LEM → Invoice Approval Gate + CASCADE DELETE
-- 1. Replace contractor_invoices.lem_id FK with ON DELETE CASCADE
-- 2. Add BEFORE INSERT trigger enforcing parent LEM must be 'approved'
-- Paste directly into Supabase SQL Editor

-- =====================================================
-- 1. ADD CASCADE DELETE TO contractor_invoices.lem_id FK
-- =====================================================
-- Drop the existing FK (no cascade) and re-add with CASCADE
ALTER TABLE contractor_invoices
  DROP CONSTRAINT IF EXISTS contractor_invoices_lem_id_fkey;

ALTER TABLE contractor_invoices
  ADD CONSTRAINT contractor_invoices_lem_id_fkey
  FOREIGN KEY (lem_id) REFERENCES contractor_lem_uploads(id)
  ON DELETE CASCADE;

-- =====================================================
-- 2. BEFORE INSERT TRIGGER: LEM APPROVAL GATE
-- =====================================================
-- Prevents invoice creation unless the parent LEM is approved.
-- This enforces the hard gate at the database level, not just UI.

CREATE OR REPLACE FUNCTION check_lem_invoice_gate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lem_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM contractor_lem_uploads
      WHERE id = NEW.lem_id AND status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Cannot create invoice: parent LEM (%) must be in approved status', NEW.lem_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_invoice_lem_gate ON contractor_invoices;
CREATE TRIGGER enforce_invoice_lem_gate
  BEFORE INSERT ON contractor_invoices
  FOR EACH ROW
  EXECUTE FUNCTION check_lem_invoice_gate();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON FUNCTION check_lem_invoice_gate() IS 'Hard gate: invoices can only be created for approved LEMs';
COMMENT ON TRIGGER enforce_invoice_lem_gate ON contractor_invoices IS 'Enforces LEM approval before invoice creation';
