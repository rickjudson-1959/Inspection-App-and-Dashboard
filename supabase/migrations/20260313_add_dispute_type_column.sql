-- Fix P0: Add dispute_type column to lem_reconciliation_pairs
-- Preserves dispute subtypes ('variance', 'ticket_altered') that were previously
-- collapsed to generic 'disputed' status in the frontend.
-- Paste directly into Supabase SQL Editor

ALTER TABLE lem_reconciliation_pairs
  ADD COLUMN IF NOT EXISTS dispute_type TEXT;

-- Constrain to known dispute subtypes (NULL for non-disputed pairs)
ALTER TABLE lem_reconciliation_pairs
  ADD CONSTRAINT valid_dispute_type
  CHECK (dispute_type IS NULL OR dispute_type IN ('variance', 'ticket_altered'));

-- Backfill existing disputed pairs from the resolution field if possible
UPDATE lem_reconciliation_pairs
SET dispute_type = CASE
  WHEN resolution = 'disputed_variance' THEN 'variance'
  WHEN resolution = 'disputed_ticket_altered' THEN 'ticket_altered'
  ELSE NULL
END
WHERE status = 'disputed' AND dispute_type IS NULL;
