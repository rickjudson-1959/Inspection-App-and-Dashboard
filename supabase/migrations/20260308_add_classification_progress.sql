-- Add profile reference and classification progress tracking to LEM uploads
ALTER TABLE contractor_lem_uploads
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES contractor_lem_profiles(id),
  ADD COLUMN IF NOT EXISTS classification_progress JSONB DEFAULT NULL;

-- Store per-page classification results on pairs for audit/review
ALTER TABLE lem_reconciliation_pairs
  ADD COLUMN IF NOT EXISTS page_classifications JSONB DEFAULT '[]';
