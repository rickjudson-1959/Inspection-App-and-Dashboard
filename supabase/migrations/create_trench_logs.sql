-- ============================================================================
-- Trench Logs Migration
-- Date: January 2026
-- Purpose: Store ditch inspection data with pay item tracking and geotagged photos
-- Supports "no-talk" transparency model and high-precision audit requirements
-- ============================================================================

-- ============================================================================
-- TABLE: trench_logs
-- Main table for ditch/trench inspection records
-- ============================================================================
CREATE TABLE IF NOT EXISTS trench_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Linkage to daily reports
  report_id BIGINT REFERENCES daily_tickets(id) ON DELETE CASCADE,
  activity_block_id TEXT,

  -- Metadata
  date DATE NOT NULL,
  kp_start VARCHAR(20),
  kp_end VARCHAR(20),
  inspector_id UUID,
  inspector_name TEXT,
  contractor TEXT,
  foreman TEXT,
  spread VARCHAR(50),

  -- Standard Measurements (2 decimal precision)
  trench_width DECIMAL(6,2),
  trench_depth DECIMAL(6,2),
  depth_of_cover_required DECIMAL(6,2),
  depth_of_cover_actual DECIMAL(6,2),

  -- Pay Items: Rock Ditch
  rock_ditch BOOLEAN DEFAULT FALSE,
  rock_ditch_meters DECIMAL(10,2) DEFAULT 0,
  rock_ditch_verified BOOLEAN DEFAULT FALSE,

  -- Pay Items: Extra Depth
  extra_depth BOOLEAN DEFAULT FALSE,
  extra_depth_meters DECIMAL(10,2) DEFAULT 0,
  extra_depth_reason TEXT,  -- 'road_crossing', 'water_crossing', 'other'
  extra_depth_verified BOOLEAN DEFAULT FALSE,

  -- Pay Items: Padding/Bedding
  padding_bedding BOOLEAN DEFAULT FALSE,
  padding_bedding_meters DECIMAL(10,2) DEFAULT 0,
  padding_material TEXT,  -- 'sand', 'screened', 'other'
  padding_bedding_verified BOOLEAN DEFAULT FALSE,

  -- BOT Checklist
  bot_free_of_rocks BOOLEAN,
  bot_free_of_debris BOOLEAN,
  bot_silt_fences_intact BOOLEAN,
  bot_wildlife_ramps BOOLEAN,
  bot_wildlife_gaps BOOLEAN,
  bot_grade_acceptable BOOLEAN,
  bot_issues TEXT,

  -- Water Management
  pumping_activity BOOLEAN DEFAULT FALSE,
  pumping_equipment TEXT,
  pumping_hours DECIMAL(6,2),
  filter_bag_usage BOOLEAN DEFAULT FALSE,
  filter_bag_count INTEGER DEFAULT 0,
  discharge_location TEXT,
  discharge_permit_number TEXT,
  water_management_notes TEXT,

  -- Soil Conditions
  soil_conditions TEXT,
  groundwater_encountered BOOLEAN DEFAULT FALSE,
  groundwater_depth DECIMAL(6,2),
  dewatering_required BOOLEAN DEFAULT FALSE,

  -- Depth Compliance
  minimum_depth_met BOOLEAN,
  depth_not_met_reason TEXT,
  depth_not_met_signoff_name TEXT,
  depth_not_met_signoff_role TEXT,
  depth_not_met_signoff_date DATE,

  comments TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_trench_logs_report ON trench_logs(report_id);
CREATE INDEX IF NOT EXISTS idx_trench_logs_date ON trench_logs(date);
CREATE INDEX IF NOT EXISTS idx_trench_logs_inspector ON trench_logs(inspector_id);
CREATE INDEX IF NOT EXISTS idx_trench_logs_kp ON trench_logs(kp_start, kp_end);

-- ============================================================================
-- TABLE: trench_log_photos
-- Geotagged photo evidence for trench inspections
-- ============================================================================
CREATE TABLE IF NOT EXISTS trench_log_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  trench_log_id UUID REFERENCES trench_logs(id) ON DELETE CASCADE,

  -- File Info
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  original_name TEXT,

  -- GPS Data (6 decimal precision ~0.1m accuracy)
  latitude DECIMAL(10,6),
  longitude DECIMAL(10,6),
  gps_accuracy DECIMAL(8,2),
  gps_direction DECIMAL(5,1),
  gps_altitude DECIMAL(8,2),

  -- Metadata
  photo_type TEXT NOT NULL,  -- 'rock_ditch', 'extra_depth', 'bot_inspection', 'general'
  kp_location VARCHAR(20),
  description TEXT,
  exif_extracted BOOLEAN DEFAULT FALSE,
  uploaded_by UUID
);

-- Indexes for photo queries
CREATE INDEX IF NOT EXISTS idx_trench_photos_log ON trench_log_photos(trench_log_id);
CREATE INDEX IF NOT EXISTS idx_trench_photos_type ON trench_log_photos(photo_type);

-- ============================================================================
-- TRIGGER: auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_trench_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trench_logs_updated_at ON trench_logs;
CREATE TRIGGER trench_logs_updated_at
  BEFORE UPDATE ON trench_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_trench_logs_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) Policies
-- ============================================================================
ALTER TABLE trench_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trench_log_photos ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all trench logs
CREATE POLICY "Users can view trench logs"
  ON trench_logs FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert trench logs
CREATE POLICY "Users can insert trench logs"
  ON trench_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update their own trench logs
CREATE POLICY "Users can update trench logs"
  ON trench_logs FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete their own trench logs
CREATE POLICY "Users can delete trench logs"
  ON trench_logs FOR DELETE
  TO authenticated
  USING (true);

-- Photo policies
CREATE POLICY "Users can view trench photos"
  ON trench_log_photos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert trench photos"
  ON trench_log_photos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update trench photos"
  ON trench_log_photos FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Users can delete trench photos"
  ON trench_log_photos FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- STORAGE BUCKET for trench photos
-- Note: Run this in Supabase dashboard if needed:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('trench-photos', 'trench-photos', false);
-- ============================================================================

-- Grant permissions on new tables
GRANT ALL ON trench_logs TO authenticated;
GRANT ALL ON trench_log_photos TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Trench logs tables created successfully';
END $$;
