-- Classification Aliases — Learning alias system for rate card matching
-- Admin corrections are saved here so the system learns over time

CREATE TABLE IF NOT EXISTS classification_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  alias_type TEXT NOT NULL CHECK (alias_type IN ('labour', 'equipment')),
  original_value TEXT NOT NULL,
  mapped_value TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- One mapping per original value per org per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_classification_aliases_unique
  ON classification_aliases (organization_id, alias_type, lower(original_value));

-- RLS
ALTER TABLE classification_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read aliases"
  ON classification_aliases FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert aliases"
  ON classification_aliases FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update aliases"
  ON classification_aliases FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
