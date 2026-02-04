-- Phase 2: Proactive Mentor Tips
-- Activity-type-specific guidance pulled from knowledge buckets

CREATE TABLE IF NOT EXISTS mentor_tips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  tip_category TEXT NOT NULL CHECK (tip_category IN ('quality', 'safety', 'environmental', 'documentation')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_document TEXT,
  source_bucket TEXT,
  priority INTEGER DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by activity type
CREATE INDEX IF NOT EXISTS idx_mentor_tips_activity
  ON mentor_tips(activity_type, organization_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_mentor_tips_org
  ON mentor_tips(organization_id) WHERE is_active = TRUE;

-- RLS policies
ALTER TABLE mentor_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tips for their org or global tips"
  ON mentor_tips FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage tips"
  ON mentor_tips FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Updated_at trigger
CREATE TRIGGER mentor_tips_updated_at
  BEFORE UPDATE ON mentor_tips
  FOR EACH ROW
  EXECUTE FUNCTION update_mentor_threshold_updated_at();
