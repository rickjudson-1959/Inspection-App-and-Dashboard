-- ============================================================================
-- HANDOVERS STORAGE BUCKET - Permanent legal record of project handover packages
-- February 1, 2026
-- ============================================================================

-- Create handovers bucket (private for legal compliance)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('handovers', 'handovers', false, 524288000)  -- 500MB limit for large ZIP files
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for handovers bucket

-- Only super_admin can upload handover packages
CREATE POLICY "Allow super_admin handover uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'handovers'
  AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Only super_admin and admin can view handover packages
CREATE POLICY "Allow admin handover reads"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'handovers'
  AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
  )
);

-- Only super_admin can delete handover packages (legal protection)
CREATE POLICY "Allow super_admin handover deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'handovers'
  AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  )
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
