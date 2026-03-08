-- Add PO (Purchase Order) number as leading financial identifier across LEM reconciliation
-- Each contractor can have multiple POs with different rate cards on the same project.

ALTER TABLE contractor_lem_profiles ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE contractor_lem_uploads ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE lem_reconciliation_pairs ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE labour_rates ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE equipment_rates ADD COLUMN IF NOT EXISTS po_number TEXT;

-- One profile per PO, not just per contractor
ALTER TABLE contractor_lem_profiles
  DROP CONSTRAINT IF EXISTS contractor_lem_profiles_organization_id_contractor_name_key;
ALTER TABLE contractor_lem_profiles
  ADD CONSTRAINT unique_profile_per_po
  UNIQUE(organization_id, contractor_name, po_number);

CREATE INDEX IF NOT EXISTS idx_labour_rates_po ON labour_rates(organization_id, po_number);
CREATE INDEX IF NOT EXISTS idx_equipment_rates_po ON equipment_rates(organization_id, po_number);
CREATE INDEX IF NOT EXISTS idx_lem_uploads_po ON contractor_lem_uploads(organization_id, po_number);
