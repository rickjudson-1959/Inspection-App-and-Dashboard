-- Preserve the original bulk-upload package PDF.
--
-- Before this migration the source PDF was passed to saveBulkUploadGroups
-- in memory and dropped on the floor. The per-page scale-1.5/2.0 JPEGs
-- and the per-row reconciliation_documents rows were the only artifacts,
-- which meant re-OCR was impossible without the user re-uploading the
-- same PDF — and on ticket 18292's incident the rasterizations were too
-- low-resolution for Vision to read the dense table text, so the only
-- recovery path was to ask the user to re-upload.
--
-- The bulk_uploads table now records the source PDF URL + filename +
-- page count per bulk_upload_id. reconciliation_documents.source_pdf_url
-- denormalises the URL onto each row so the re-OCR path doesn't need a
-- join.
--
-- RLS pattern matches the rest of the project (document_matches, etc.):
-- the `is_super_admin()` + `user_organization_ids()` helpers defined in
-- 20260131_05_add_rls_policies.sql. `user_organization_ids()` reads
-- from the `memberships` table; do not invent an `organization_members`
-- table — it doesn't exist in this schema.

CREATE TABLE IF NOT EXISTS bulk_uploads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_upload_id      UUID UNIQUE NOT NULL,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id          UUID REFERENCES projects(id) ON DELETE SET NULL,
  source_pdf_url      TEXT NOT NULL,
  source_pdf_filename TEXT,
  page_count          INTEGER,
  uploaded_by         UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_uploads_org      ON bulk_uploads (organization_id);
CREATE INDEX IF NOT EXISTS idx_bulk_uploads_project  ON bulk_uploads (project_id);

ALTER TABLE bulk_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for bulk_uploads" ON bulk_uploads;
CREATE POLICY "Tenant isolation for bulk_uploads"
ON bulk_uploads FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- Denormalised source-PDF URL on every per-page row so re-OCR doesn't
-- need a join. Nullable: rows uploaded before this migration stay null
-- and surface via the "needs source PDF re-upload" path in the re-OCR
-- flow.
ALTER TABLE reconciliation_documents
  ADD COLUMN IF NOT EXISTS source_pdf_url TEXT;
