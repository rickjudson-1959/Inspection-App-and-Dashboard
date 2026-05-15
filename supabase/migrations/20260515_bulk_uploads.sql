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

create table if not exists public.bulk_uploads (
  id                  uuid primary key default gen_random_uuid(),
  bulk_upload_id      uuid unique not null,
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  project_id          uuid references public.projects(id) on delete set null,
  source_pdf_url      text not null,
  source_pdf_filename text,
  page_count          integer,
  uploaded_by         uuid references auth.users(id),
  created_at          timestamptz not null default now()
);

create index if not exists idx_bulk_uploads_org      on public.bulk_uploads (organization_id);
create index if not exists idx_bulk_uploads_project  on public.bulk_uploads (project_id);

alter table public.bulk_uploads enable row level security;

drop policy if exists bulk_uploads_select on public.bulk_uploads;
create policy bulk_uploads_select on public.bulk_uploads
  for select using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

drop policy if exists bulk_uploads_insert on public.bulk_uploads;
create policy bulk_uploads_insert on public.bulk_uploads
  for insert with check (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

drop policy if exists bulk_uploads_update on public.bulk_uploads;
create policy bulk_uploads_update on public.bulk_uploads
  for update using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

drop policy if exists bulk_uploads_delete on public.bulk_uploads;
create policy bulk_uploads_delete on public.bulk_uploads
  for delete using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

-- Denormalised source-PDF URL on every per-page row so re-OCR doesn't
-- need a join. Already present in the codebase as a nullable string;
-- existing rows from before this migration stay null and surface via
-- the "needs source PDF re-upload" path in the re-OCR flow.
alter table public.reconciliation_documents
  add column if not exists source_pdf_url text;
