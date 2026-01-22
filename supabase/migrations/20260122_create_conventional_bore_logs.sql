-- ============================================================================
-- Conventional Bore Logs Migration
-- Date: January 22, 2026
-- Purpose: Store Track Bore, Sling/Cradle Bore, and Auger Bore data
-- Includes stability checks, alignment verification, and annular grouting
-- ============================================================================

-- ============================================================================
-- TABLE: conventional_bore_logs
-- Main table for conventional bore records
-- ============================================================================
CREATE TABLE IF NOT EXISTS conventional_bore_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Linkage
  report_id BIGINT REFERENCES daily_tickets(id) ON DELETE CASCADE,
  activity_block_id TEXT,

  -- Bore Identification
  bore_id TEXT,
  bore_method TEXT CHECK (bore_method IN ('track_bore', 'sling_cradle', 'auger_machine', 'directional_drill')),
  crossing_type TEXT,
  crossing_description TEXT,

  -- Metadata
  date DATE NOT NULL,
  inspector_id UUID,
  inspector_name TEXT,
  subcontractor TEXT,
  machine_id TEXT,

  -- KP/Chainage
  design_entry_kp VARCHAR(20),
  design_exit_kp VARCHAR(20),
  actual_exit_kp VARCHAR(20),
  bore_length DECIMAL(10,2),

  -- Pipe Specifications
  casing_diameter_inches DECIMAL(5,2),
  casing_wall_thickness DECIMAL(5,3),
  carrier_diameter_inches DECIMAL(5,2),
  carrier_wall_thickness DECIMAL(5,3),

  -- Method-Specific (Sling/Cradle)
  winch_tension DECIMAL(10,2),
  boom_positioning_verified BOOLEAN,

  -- Method-Specific (Track Bore)
  backstop_deadman_confirmed BOOLEAN,

  -- Alignment & Grade
  start_pitch_percent DECIMAL(5,2),
  exit_pitch_percent DECIMAL(5,2),
  steering_head_used BOOLEAN,
  steering_head_type TEXT CHECK (steering_head_type IN ('mechanical', 'hydraulic', 'combo') OR steering_head_type IS NULL),

  -- Fluid & Mud Loop
  lubrication_required BOOLEAN,
  total_water_used_m3 DECIMAL(10,2),
  mud_type TEXT CHECK (mud_type IN ('bentonite', 'polymer', 'bentonite_polymer', 'water_only', 'none') OR mud_type IS NULL),
  mud_volume_m3 DECIMAL(10,2),

  -- Annular Space Grouting
  calculated_annulus_volume DECIMAL(10,4),
  actual_grout_pumped_m3 DECIMAL(10,4),
  grout_variance_percent DECIMAL(6,2),
  grout_variance_alert BOOLEAN DEFAULT FALSE,

  -- Asset Link
  weld_id TEXT,

  -- Waste Management Link
  waste_management_enabled BOOLEAN DEFAULT FALSE,
  drilling_waste_log_id UUID,

  comments TEXT
);

-- ============================================================================
-- TABLE: conventional_bore_photos
-- Exit pit photos and other evidence
-- ============================================================================
CREATE TABLE IF NOT EXISTS conventional_bore_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  bore_log_id UUID REFERENCES conventional_bore_logs(id) ON DELETE CASCADE,

  -- File Info
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  original_name TEXT,
  file_type TEXT,
  file_size_bytes INTEGER,

  -- Photo Type
  photo_type TEXT NOT NULL CHECK (photo_type IN ('exit_pit', 'entry_pit', 'alignment', 'general')),

  -- GPS Data (6 decimal precision)
  latitude DECIMAL(10,6),
  longitude DECIMAL(10,6),
  gps_accuracy DECIMAL(8,2),
  gps_altitude DECIMAL(8,2),

  -- Metadata
  kp_location VARCHAR(20),
  description TEXT,
  exif_extracted BOOLEAN DEFAULT FALSE,
  uploaded_by UUID
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conventional_bore_logs_report ON conventional_bore_logs(report_id);
CREATE INDEX IF NOT EXISTS idx_conventional_bore_logs_date ON conventional_bore_logs(date);
CREATE INDEX IF NOT EXISTS idx_conventional_bore_logs_bore_id ON conventional_bore_logs(bore_id);
CREATE INDEX IF NOT EXISTS idx_conventional_bore_logs_weld ON conventional_bore_logs(weld_id);
CREATE INDEX IF NOT EXISTS idx_conventional_bore_logs_method ON conventional_bore_logs(bore_method);
CREATE INDEX IF NOT EXISTS idx_conventional_bore_photos_log ON conventional_bore_photos(bore_log_id);
CREATE INDEX IF NOT EXISTS idx_conventional_bore_photos_type ON conventional_bore_photos(photo_type);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_conventional_bore_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conventional_bore_logs_updated_at ON conventional_bore_logs;
CREATE TRIGGER conventional_bore_logs_updated_at
  BEFORE UPDATE ON conventional_bore_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_conventional_bore_logs_updated_at();

-- RLS Policies
ALTER TABLE conventional_bore_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conventional_bore_photos ENABLE ROW LEVEL SECURITY;

-- conventional_bore_logs policies
CREATE POLICY "Users can view conventional bore logs" ON conventional_bore_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert conventional bore logs" ON conventional_bore_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update conventional bore logs" ON conventional_bore_logs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete conventional bore logs" ON conventional_bore_logs FOR DELETE TO authenticated USING (true);

-- conventional_bore_photos policies
CREATE POLICY "Users can view conventional bore photos" ON conventional_bore_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert conventional bore photos" ON conventional_bore_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update conventional bore photos" ON conventional_bore_photos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete conventional bore photos" ON conventional_bore_photos FOR DELETE TO authenticated USING (true);

-- Grants
GRANT ALL ON conventional_bore_logs TO authenticated;
GRANT ALL ON conventional_bore_photos TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Conventional bore logs tables created successfully'; END $$;
