-- ============================================================================
-- Drilling Waste Logs Migration
-- Date: January 21, 2026
-- Purpose: Store HDD drilling waste management data per Directive 050 requirements
-- Supports AER Pipeline Drilling Waste Disposal Form export requirements
-- ============================================================================

-- ============================================================================
-- TABLE: drilling_waste_logs
-- Main table for drilling waste management records
-- ============================================================================
CREATE TABLE IF NOT EXISTS drilling_waste_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Linkage
  report_id BIGINT REFERENCES daily_tickets(id) ON DELETE CASCADE,
  activity_block_id TEXT,
  hdd_log_id UUID,  -- Link to HDD activity

  -- Crossing/Bore Reference
  crossing_id TEXT,           -- Road/Rail Crossing ID
  bore_weld_id TEXT,          -- Bore Weld ID link
  bore_id TEXT,               -- HDD Bore ID (e.g., HDD-001)

  -- Metadata
  date DATE NOT NULL,
  inspector_id UUID,
  inspector_name TEXT,
  contractor TEXT,
  subcontractor TEXT,

  -- Mud Pit Locations (6 decimal precision)
  entry_pit_kp VARCHAR(20),
  entry_pit_latitude DECIMAL(10,6),
  entry_pit_longitude DECIMAL(10,6),
  exit_pit_kp VARCHAR(20),
  exit_pit_latitude DECIMAL(10,6),
  exit_pit_longitude DECIMAL(10,6),

  -- Volume Tracking (2 decimal precision)
  total_volume_mixed_m3 DECIMAL(10,2) DEFAULT 0,
  volume_in_storage_m3 DECIMAL(10,2) DEFAULT 0,
  volume_hauled_m3 DECIMAL(10,2) DEFAULT 0,

  -- Disposal & Manifesting
  disposal_method TEXT,       -- 'mix_bury_cover', 'landfill', 'landspray', 'pump_off'
  manifest_number TEXT,
  disposal_facility_name TEXT,
  disposal_date DATE,

  -- Vacuum Truck Tracking
  vac_truck_hours DECIMAL(6,2) DEFAULT 0,
  vac_truck_equipment_id TEXT,
  vac_truck_operator TEXT,

  -- Testing & Compliance
  salinity_test_passed BOOLEAN,
  toxicity_test_passed BOOLEAN,
  metals_test_passed BOOLEAN,
  lined_pit_storage_confirmed BOOLEAN,

  -- Test Results (for AER reporting)
  salinity_test_result TEXT,
  toxicity_test_result TEXT,
  metals_test_result TEXT,
  test_lab_name TEXT,
  test_date DATE,

  -- Storage
  storage_type TEXT,          -- 'lined_pit', 'steel_tank', 'frac_tank', 'other'
  storage_capacity_m3 DECIMAL(10,2),

  comments TEXT
);

-- ============================================================================
-- TABLE: drilling_waste_additives
-- Track bags/pails of bentonite, soda ash, polymers used
-- ============================================================================
CREATE TABLE IF NOT EXISTS drilling_waste_additives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  drilling_waste_log_id UUID REFERENCES drilling_waste_logs(id) ON DELETE CASCADE,

  additive_type TEXT NOT NULL,  -- 'bentonite', 'soda_ash', 'polymer', 'other'
  product_name TEXT,
  quantity DECIMAL(10,2) NOT NULL,
  unit TEXT NOT NULL,           -- 'bags', 'pails', 'kg', 'liters'
  batch_number TEXT,
  supplier TEXT,
  notes TEXT
);

-- ============================================================================
-- TABLE: drilling_waste_photos
-- Geotagged photo evidence for manifests and disposal
-- ============================================================================
CREATE TABLE IF NOT EXISTS drilling_waste_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  drilling_waste_log_id UUID REFERENCES drilling_waste_logs(id) ON DELETE CASCADE,

  -- File Info
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  original_name TEXT,

  -- GPS Data (6 decimal precision)
  latitude DECIMAL(10,6),
  longitude DECIMAL(10,6),
  gps_accuracy DECIMAL(8,2),
  gps_direction DECIMAL(5,1),
  gps_altitude DECIMAL(8,2),

  -- Metadata
  photo_type TEXT NOT NULL,     -- 'manifest', 'landfill_ticket', 'disposal_site', 'storage', 'mud_pit', 'general'
  kp_location VARCHAR(20),
  description TEXT,
  is_mandatory BOOLEAN DEFAULT FALSE,  -- TRUE for manifest photos
  exif_extracted BOOLEAN DEFAULT FALSE,
  uploaded_by UUID
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drilling_waste_report ON drilling_waste_logs(report_id);
CREATE INDEX IF NOT EXISTS idx_drilling_waste_date ON drilling_waste_logs(date);
CREATE INDEX IF NOT EXISTS idx_drilling_waste_bore ON drilling_waste_logs(bore_id);
CREATE INDEX IF NOT EXISTS idx_drilling_waste_crossing ON drilling_waste_logs(crossing_id);
CREATE INDEX IF NOT EXISTS idx_drilling_waste_additives_log ON drilling_waste_additives(drilling_waste_log_id);
CREATE INDEX IF NOT EXISTS idx_drilling_waste_photos_log ON drilling_waste_photos(drilling_waste_log_id);
CREATE INDEX IF NOT EXISTS idx_drilling_waste_photos_type ON drilling_waste_photos(photo_type);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_drilling_waste_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS drilling_waste_logs_updated_at ON drilling_waste_logs;
CREATE TRIGGER drilling_waste_logs_updated_at
  BEFORE UPDATE ON drilling_waste_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_drilling_waste_logs_updated_at();

-- RLS Policies
ALTER TABLE drilling_waste_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE drilling_waste_additives ENABLE ROW LEVEL SECURITY;
ALTER TABLE drilling_waste_photos ENABLE ROW LEVEL SECURITY;

-- drilling_waste_logs policies
CREATE POLICY "Users can view drilling waste logs" ON drilling_waste_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert drilling waste logs" ON drilling_waste_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update drilling waste logs" ON drilling_waste_logs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete drilling waste logs" ON drilling_waste_logs FOR DELETE TO authenticated USING (true);

-- drilling_waste_additives policies
CREATE POLICY "Users can view drilling waste additives" ON drilling_waste_additives FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert drilling waste additives" ON drilling_waste_additives FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update drilling waste additives" ON drilling_waste_additives FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete drilling waste additives" ON drilling_waste_additives FOR DELETE TO authenticated USING (true);

-- drilling_waste_photos policies
CREATE POLICY "Users can view drilling waste photos" ON drilling_waste_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert drilling waste photos" ON drilling_waste_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update drilling waste photos" ON drilling_waste_photos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete drilling waste photos" ON drilling_waste_photos FOR DELETE TO authenticated USING (true);

-- Grants
GRANT ALL ON drilling_waste_logs TO authenticated;
GRANT ALL ON drilling_waste_additives TO authenticated;
GRANT ALL ON drilling_waste_photos TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Drilling waste logs tables created successfully'; END $$;
