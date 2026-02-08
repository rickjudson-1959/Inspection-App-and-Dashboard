-- ============================================================================
-- WELDING REPORT REVIEWS & USER NOTIFICATIONS
-- February 2026 - Welding Chief Sign-Off Feature
-- ============================================================================

-- ==================================================
-- TABLE: welding_report_reviews
-- Tracks welding report review status and signatures
-- ==================================================
CREATE TABLE IF NOT EXISTS welding_report_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id BIGINT REFERENCES daily_reports(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'revision_requested')),

  -- Review metadata
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Digital signature (for approval)
  signature_image TEXT,  -- Base64 data URL
  signature_hash TEXT,   -- SHA-256 verification hash

  -- Revision feedback (for rejection)
  revision_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(report_id)  -- One review record per report
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_welding_reviews_org_status ON welding_report_reviews(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_welding_reviews_report ON welding_report_reviews(report_id);
CREATE INDEX IF NOT EXISTS idx_welding_reviews_reviewed_by ON welding_report_reviews(reviewed_by);

-- ==================================================
-- TABLE: user_notifications
-- Notification system for inspectors and other users
-- ==================================================
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),

  type TEXT NOT NULL,  -- 'revision_requested', 'report_approved', etc.
  title TEXT NOT NULL,
  message TEXT,

  -- Reference to related entity
  reference_type TEXT,  -- 'daily_report', 'welding_review', etc.
  reference_id UUID,

  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON user_notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON user_notifications(organization_id);

-- ==================================================
-- RLS POLICIES: welding_report_reviews
-- ==================================================
ALTER TABLE welding_report_reviews ENABLE ROW LEVEL SECURITY;

-- Users can view reviews in their organization
CREATE POLICY "Users can view reviews in their org" ON welding_report_reviews
  FOR SELECT USING (
    organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Welding chiefs and admins can insert reviews
CREATE POLICY "Welding chiefs can insert reviews" ON welding_report_reviews
  FOR INSERT WITH CHECK (
    organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Welding chiefs and admins can update reviews
CREATE POLICY "Welding chiefs can update reviews" ON welding_report_reviews
  FOR UPDATE USING (
    organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- ==================================================
-- RLS POLICIES: user_notifications
-- ==================================================
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications" ON user_notifications
  FOR SELECT USING (user_id = auth.uid());

-- System/authenticated users can insert notifications
CREATE POLICY "Authenticated users can insert notifications" ON user_notifications
  FOR INSERT WITH CHECK (
    organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications" ON user_notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ==================================================
-- TRIGGER: Update updated_at on welding_report_reviews
-- ==================================================
CREATE OR REPLACE FUNCTION update_welding_review_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS welding_review_updated_at ON welding_report_reviews;
CREATE TRIGGER welding_review_updated_at
  BEFORE UPDATE ON welding_report_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_welding_review_updated_at();

-- ==================================================
-- COMMENTS
-- ==================================================
COMMENT ON TABLE welding_report_reviews IS 'Tracks welding report review status, approvals, and digital signatures by the Welding Chief';
COMMENT ON TABLE user_notifications IS 'User notification system for revision requests, approvals, and other alerts';
COMMENT ON COLUMN welding_report_reviews.signature_image IS 'Base64-encoded PNG of the digital signature';
COMMENT ON COLUMN welding_report_reviews.signature_hash IS 'SHA-256 hash for signature verification';
