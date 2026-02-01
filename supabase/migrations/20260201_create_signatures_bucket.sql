-- ============================================================================
-- SIGNATURES STORAGE BUCKET - Private bucket for digital signatures
-- February 1, 2026
-- ============================================================================

-- Create private signatures bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('signatures', 'signatures', false, 5242880)  -- 5MB limit, private
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for signatures bucket

-- Allow authenticated users to upload signatures
CREATE POLICY "Allow authenticated signature uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'signatures');

-- Allow authenticated users to view signatures (for verification)
CREATE POLICY "Allow authenticated signature reads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'signatures');

-- Only allow admins to delete signatures (audit trail protection)
CREATE POLICY "Allow admin signature deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'signatures'
  AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

-- Add verification_hash column to project_documents for document integrity
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS document_hash TEXT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
