-- ============================================================================
-- Bore Path Data Migration
-- Date: January 21, 2026
-- Purpose: Store HDD steering/guidance data for pilot hole tracking
-- Tracks real-time guidance to ensure bore follows engineered tangents
-- ============================================================================

-- ============================================================================
-- TABLE: bore_path_logs
-- Main table for steering log records
-- ============================================================================
CREATE TABLE IF NOT EXISTS bore_path_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Linkage
  report_id BIGINT REFERENCES daily_tickets(id) ON DELETE CASCADE,
  activity_block_id TEXT,
  hdd_log_id UUID,
  drilling_waste_log_id UUID,

  -- Bore Reference
  bore_id TEXT,
  crossing_id TEXT,
  weld_id TEXT,              -- Link to pipe string weld ID

  -- Metadata
  date DATE NOT NULL,
  inspector_id UUID,
  inspector_name TEXT,
  contractor TEXT,
  subcontractor TEXT,

  -- Guidance System Setup
  guidance_type TEXT,        -- 'walk_over_sonde', 'wireline_magnetic', 'gyro'
  frequency_channel TEXT,    -- Frequency/channel to avoid utility interference
  guidance_system_model TEXT,
  calibration_date DATE,
  calibration_verified BOOLEAN,

  -- Design Parameters
  design_entry_angle DECIMAL(5,2),
  design_exit_angle DECIMAL(5,2),
  design_max_depth DECIMAL(8,2),
  design_bore_length DECIMAL(10,2),

  -- Actual Entry/Exit
  actual_entry_angle DECIMAL(5,2),
  actual_exit_angle DECIMAL(5,2),
  entry_angle_variance DECIMAL(5,2),
  exit_angle_variance DECIMAL(5,2),

  -- Pipe Specifications (for bending radius calculation)
  pipe_diameter_inches DECIMAL(5,2),
  pipe_wall_thickness DECIMAL(5,3),
  minimum_bend_radius_m DECIMAL(8,2),

  -- Summary Status
  within_design_tolerance BOOLEAN,
  bore_complete BOOLEAN DEFAULT FALSE,
  path_adjusted_mid_bore BOOLEAN DEFAULT FALSE,
  adjustment_reason TEXT,

  comments TEXT
);

-- ============================================================================
-- TABLE: bore_path_stations
-- Per-joint/station steering data entries
-- ============================================================================
CREATE TABLE IF NOT EXISTS bore_path_stations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  bore_path_log_id UUID REFERENCES bore_path_logs(id) ON DELETE CASCADE,

  -- Station Identification
  station_number INTEGER NOT NULL,
  drill_pipe_joint_number INTEGER,

  -- Position Data
  measured_depth_m DECIMAL(10,2),
  pitch_percent DECIMAL(6,2),
  azimuth_degrees DECIMAL(6,2),
  calculated_kp VARCHAR(20),

  -- Depth/Elevation
  true_vertical_depth_m DECIMAL(10,2),
  elevation_m DECIMAL(10,2),

  -- Offset from Design
  horizontal_offset_m DECIMAL(8,2),
  vertical_offset_m DECIMAL(8,2),

  -- Tangent Verification
  within_design_tangent BOOLEAN,
  tangent_variance_percent DECIMAL(5,2),

  -- Bending Radius Check
  calculated_bend_radius_m DECIMAL(10,2),
  bend_radius_alert BOOLEAN DEFAULT FALSE,  -- TRUE if below minimum

  -- Timestamps
  reading_timestamp TIMESTAMPTZ,

  notes TEXT
);

-- ============================================================================
-- TABLE: bore_path_documents
-- Uploaded bore logs, steering reports, guidance system outputs
-- ============================================================================
CREATE TABLE IF NOT EXISTS bore_path_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  bore_path_log_id UUID REFERENCES bore_path_logs(id) ON DELETE CASCADE,

  -- File Info
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  original_name TEXT,
  file_type TEXT,            -- 'image', 'pdf'
  file_size_bytes INTEGER,

  -- Document Type
  document_type TEXT NOT NULL,  -- 'bore_log', 'steering_report', 'guidance_output', 'as_built', 'general'

  -- GPS Data (if photo with EXIF)
  latitude DECIMAL(10,6),
  longitude DECIMAL(10,6),
  gps_accuracy DECIMAL(8,2),

  -- Metadata
  kp_location VARCHAR(20),
  description TEXT,
  report_date DATE,
  exif_extracted BOOLEAN DEFAULT FALSE,
  uploaded_by UUID
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bore_path_logs_report ON bore_path_logs(report_id);
CREATE INDEX IF NOT EXISTS idx_bore_path_logs_date ON bore_path_logs(date);
CREATE INDEX IF NOT EXISTS idx_bore_path_logs_bore ON bore_path_logs(bore_id);
CREATE INDEX IF NOT EXISTS idx_bore_path_logs_weld ON bore_path_logs(weld_id);
CREATE INDEX IF NOT EXISTS idx_bore_path_stations_log ON bore_path_stations(bore_path_log_id);
CREATE INDEX IF NOT EXISTS idx_bore_path_stations_joint ON bore_path_stations(drill_pipe_joint_number);
CREATE INDEX IF NOT EXISTS idx_bore_path_documents_log ON bore_path_documents(bore_path_log_id);
CREATE INDEX IF NOT EXISTS idx_bore_path_documents_type ON bore_path_documents(document_type);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_bore_path_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bore_path_logs_updated_at ON bore_path_logs;
CREATE TRIGGER bore_path_logs_updated_at
  BEFORE UPDATE ON bore_path_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_bore_path_logs_updated_at();

-- RLS Policies
ALTER TABLE bore_path_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bore_path_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bore_path_documents ENABLE ROW LEVEL SECURITY;

-- bore_path_logs policies
CREATE POLICY "Users can view bore path logs" ON bore_path_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert bore path logs" ON bore_path_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update bore path logs" ON bore_path_logs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete bore path logs" ON bore_path_logs FOR DELETE TO authenticated USING (true);

-- bore_path_stations policies
CREATE POLICY "Users can view bore path stations" ON bore_path_stations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert bore path stations" ON bore_path_stations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update bore path stations" ON bore_path_stations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete bore path stations" ON bore_path_stations FOR DELETE TO authenticated USING (true);

-- bore_path_documents policies
CREATE POLICY "Users can view bore path documents" ON bore_path_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert bore path documents" ON bore_path_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update bore path documents" ON bore_path_documents FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete bore path documents" ON bore_path_documents FOR DELETE TO authenticated USING (true);

-- Grants
GRANT ALL ON bore_path_logs TO authenticated;
GRANT ALL ON bore_path_stations TO authenticated;
GRANT ALL ON bore_path_documents TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Bore path data tables created successfully'; END $$;
