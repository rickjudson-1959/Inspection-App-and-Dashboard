CREATE TABLE IF NOT EXISTS kmz_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  description TEXT,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

ALTER TABLE kmz_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read kmz_uploads" ON kmz_uploads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert kmz_uploads" ON kmz_uploads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update kmz_uploads" ON kmz_uploads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete kmz_uploads" ON kmz_uploads FOR DELETE TO authenticated USING (true);
