-- Phase 3: Report Health Score
-- Add health_score and health_score_details to daily_reports

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS health_score DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS health_score_details JSONB;

-- Index for filtering by health score
CREATE INDEX IF NOT EXISTS idx_daily_reports_health_score
  ON daily_reports(health_score) WHERE health_score IS NOT NULL;
