-- ============================================================================
-- USER FEEDBACK
-- February 2026 - In-app feedback collection
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  user_email TEXT,
  user_role TEXT,
  page TEXT NOT NULL,
  feedback_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_org ON user_feedback(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON user_feedback(user_id);

ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert feedback
CREATE POLICY "Authenticated users can insert feedback" ON user_feedback
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Admins can view all feedback in their org
CREATE POLICY "Admins can view feedback" ON user_feedback
  FOR SELECT USING (
    organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

COMMENT ON TABLE user_feedback IS 'In-app user feedback submitted from report pages and dashboards';
