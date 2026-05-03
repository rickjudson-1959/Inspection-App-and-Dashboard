-- =============================================================================
-- 20260503_trackable_items_stockpiling.sql
-- Adds the columns required by the new "Stockpiling" trackable item category.
-- Pipe and fittings inventory tracking on per-report basis.
-- All ADD COLUMN IF NOT EXISTS — safe to re-run.
-- =============================================================================

ALTER TABLE trackable_items ADD COLUMN IF NOT EXISTS sub_type           TEXT;
ALTER TABLE trackable_items ADD COLUMN IF NOT EXISTS description        TEXT;
ALTER TABLE trackable_items ADD COLUMN IF NOT EXISTS joint_numbers      TEXT;
ALTER TABLE trackable_items ADD COLUMN IF NOT EXISTS heat_number        TEXT;
ALTER TABLE trackable_items ADD COLUMN IF NOT EXISTS stockpile_location TEXT;
ALTER TABLE trackable_items ADD COLUMN IF NOT EXISTS issued_to_spread   TEXT;

-- Helpful index for the Reconciliation tab's stockpile inventory rollup
-- (filters by item_type='stockpiling' then groups by stockpile_location).
CREATE INDEX IF NOT EXISTS idx_trackable_items_stockpile
  ON trackable_items (item_type, stockpile_location)
  WHERE item_type = 'stockpiling';
