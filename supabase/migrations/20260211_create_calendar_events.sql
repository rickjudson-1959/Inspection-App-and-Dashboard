-- ============================================================================
-- CALENDAR EVENTS TABLE
-- February 11, 2026
-- Supports meeting scheduling with Zoom/Teams integration for project portals
-- ============================================================================

-- Create calendar_events table
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT,

  -- Event details
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'meeting'
    CHECK (event_type IN ('meeting', 'milestone', 'inspection', 'audit', 'training', 'safety', 'other')),

  -- Date/Time
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'America/Vancouver',

  -- Location
  location_type TEXT NOT NULL DEFAULT 'virtual'
    CHECK (location_type IN ('in_person', 'virtual', 'hybrid')),
  location_address TEXT,  -- Physical address if in-person

  -- Virtual meeting
  meeting_platform TEXT
    CHECK (meeting_platform IN ('zoom', 'teams', 'other', NULL)),
  meeting_link TEXT,
  meeting_id TEXT,  -- Zoom/Teams meeting ID
  meeting_passcode TEXT,

  -- Attendees (array of user IDs and emails)
  attendees JSONB DEFAULT '[]',
  -- Format: [{ "user_id": "uuid", "email": "email", "name": "name", "rsvp": "pending|accepted|declined" }]

  -- Notifications
  send_invitations BOOLEAN DEFAULT TRUE,
  reminder_minutes INTEGER[] DEFAULT ARRAY[1440, 60],  -- 24hr and 1hr before

  -- Recurrence (for future use)
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,  -- iCal RRULE format
  parent_event_id UUID REFERENCES calendar_events(id),

  -- Status
  status TEXT DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'cancelled', 'completed')),

  -- Metadata
  color TEXT DEFAULT '#3b82f6',  -- Event color for calendar display
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_calendar_events_org ON calendar_events(organization_id);
CREATE INDEX idx_calendar_events_start ON calendar_events(start_time);
CREATE INDEX idx_calendar_events_created_by ON calendar_events(created_by);
CREATE INDEX idx_calendar_events_org_date ON calendar_events(organization_id, start_time);

-- Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view events in their organization"
  ON calendar_events FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
    OR
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Users can create events in their organization"
  ON calendar_events FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
    OR
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Users can update their own events or if admin/chief"
  ON calendar_events FOR UPDATE
  USING (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin', 'chief_inspector', 'pm', 'cm')
    )
  );

CREATE POLICY "Users can delete their own events or if admin"
  ON calendar_events FOR DELETE
  USING (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_events_updated_at();

-- Comments
COMMENT ON TABLE calendar_events IS 'Project calendar events including meetings, milestones, and inspections';
COMMENT ON COLUMN calendar_events.meeting_platform IS 'Virtual meeting platform: zoom, teams, or other';
COMMENT ON COLUMN calendar_events.attendees IS 'JSON array of attendee objects with user_id, email, name, and rsvp status';
