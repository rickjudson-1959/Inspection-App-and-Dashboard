-- Phase 1: InspectorMentorAgent - Core tables for threshold-based field auditing
-- Creates mentor_threshold_config and mentor_alert_events tables

-- Table: mentor_threshold_config
-- Configurable thresholds for field validation (NOT hardcoded)
CREATE TABLE IF NOT EXISTS mentor_threshold_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  field_key TEXT NOT NULL,
  min_value DECIMAL,
  max_value DECIMAL,
  unit TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')) DEFAULT 'warning',
  alert_title TEXT NOT NULL,
  alert_message TEXT NOT NULL,
  recommended_action TEXT,
  reference_document TEXT,
  source_bucket TEXT,
  source_id UUID,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, activity_type, field_key)
);

-- Table: mentor_alert_events
-- Tracks every alert surfaced to an inspector
CREATE TABLE IF NOT EXISTS mentor_alert_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_id UUID,
  block_id TEXT,
  activity_type TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_value TEXT,
  threshold_id UUID REFERENCES mentor_threshold_config(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('threshold_breach', 'spec_mismatch', 'completeness', 'mentor_tip')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  recommended_action TEXT,
  reference_document TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'acknowledged', 'overridden', 'resolved')) DEFAULT 'active',
  override_reason TEXT,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_mentor_threshold_config_org_active
  ON mentor_threshold_config(organization_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_mentor_threshold_config_lookup
  ON mentor_threshold_config(organization_id, activity_type, field_key) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_mentor_alert_events_report
  ON mentor_alert_events(report_id, block_id);

CREATE INDEX IF NOT EXISTS idx_mentor_alert_events_org
  ON mentor_alert_events(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mentor_alert_events_status
  ON mentor_alert_events(status) WHERE status = 'active';

-- RLS policies
ALTER TABLE mentor_threshold_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_alert_events ENABLE ROW LEVEL SECURITY;

-- Threshold config: read access for org members
CREATE POLICY "Users can view threshold config for their org"
  ON mentor_threshold_config FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Threshold config: insert/update for admins
CREATE POLICY "Admins can manage threshold config"
  ON mentor_threshold_config FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Alert events: read/write for org members
CREATE POLICY "Users can view alerts for their org"
  ON mentor_alert_events FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create alerts for their org"
  ON mentor_alert_events FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update alerts for their org"
  ON mentor_alert_events FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Updated_at trigger for threshold config
CREATE OR REPLACE FUNCTION update_mentor_threshold_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mentor_threshold_config_updated_at
  BEFORE UPDATE ON mentor_threshold_config
  FOR EACH ROW
  EXECUTE FUNCTION update_mentor_threshold_updated_at();
