-- =============================================
-- CHIEFS REPORT MIGRATION
-- Daily Construction Summary Report (EGP Format)
-- Run in Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. DAILY CONSTRUCTION SUMMARY TABLE
-- Main table for Chief's daily reports
-- =============================================
CREATE TABLE IF NOT EXISTS daily_construction_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Report Header
  report_date DATE NOT NULL UNIQUE,
  report_number TEXT,  -- e.g., '20260107DPR'
  project_name TEXT DEFAULT 'Eagle Mountain Pipeline Project',
  contractor TEXT DEFAULT 'SMJV',
  reported_by TEXT,
  reported_by_id UUID REFERENCES auth.users(id),
  
  -- Weather (pulled from inspector reports or manual)
  weather_description TEXT,
  temp_high_f NUMERIC,
  temp_low_f NUMERIC,
  precipitation_mm NUMERIC,
  humidity_pct NUMERIC,
  wind_speed_kmh NUMERIC,
  uv_index TEXT,
  
  -- Key Focus of the Day (AI-generated narrative)
  key_focus_narrative TEXT,
  key_focus_bullets JSONB DEFAULT '[]'::jsonb,  -- Array of bullet points
  
  -- Safety Status
  safety_status TEXT,
  safety_bullets JSONB DEFAULT '[]'::jsonb,
  swa_events INTEGER DEFAULT 0,  -- Stop Work Authority count
  chain_up_required BOOLEAN DEFAULT FALSE,
  avalanche_risk_level TEXT,  -- 'OPEN', 'RESTRICTED', 'CLOSED'
  
  -- Personnel Onsite (breakdown)
  personnel_onsite JSONB DEFAULT '{
    "prime_resources": 0,
    "fei_subcontractors": 0,
    "total_site_exposure": 0,
    "decca_inspector": 0,
    "env_qp": 0,
    "fei_compliance": 0,
    "meridian_survey": 0,
    "fei_employee": 0,
    "fei_ops": 0,
    "ndt": 0,
    "engineering": 0,
    "env_inspector": 0,
    "safety": 0,
    "other": 0
  }'::jsonb,
  
  -- Status
  status TEXT DEFAULT 'draft',  -- 'draft', 'published', 'archived'
  published_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick date lookups
CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON daily_construction_summary(report_date DESC);


-- =============================================
-- 2. SECTION PROGRESS TABLE
-- Tracks Civil/Mechanical progress by pipeline section
-- =============================================
CREATE TABLE IF NOT EXISTS section_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  summary_id UUID REFERENCES daily_construction_summary(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  
  -- Section Info
  section_name TEXT NOT NULL,  -- e.g., 'Hixon FSR', 'KP 5.0 - 6.3 Conventional'
  start_date DATE,
  kp_start TEXT,
  kp_end TEXT,
  
  -- Activity Type
  activity_type TEXT NOT NULL,  -- 'Civil' or 'Mechanical'
  
  -- Daily Progress
  daily_planned_lm NUMERIC DEFAULT 0,
  daily_actual_lm NUMERIC DEFAULT 0,
  daily_delta_lm NUMERIC GENERATED ALWAYS AS (daily_actual_lm - daily_planned_lm) STORED,
  
  -- Weekly Progress (for weekly rollup)
  weekly_planned_lm NUMERIC DEFAULT 0,
  weekly_actual_lm NUMERIC DEFAULT 0,
  weekly_delta_lm NUMERIC GENERATED ALWAYS AS (weekly_actual_lm - weekly_planned_lm) STORED,
  
  -- Cumulative Progress
  cumulative_planned_lm NUMERIC DEFAULT 0,
  cumulative_actual_lm NUMERIC DEFAULT 0,
  pct_complete NUMERIC GENERATED ALWAYS AS (
    CASE WHEN cumulative_planned_lm > 0 
    THEN ROUND((cumulative_actual_lm / cumulative_planned_lm) * 100, 1)
    ELSE 0 END
  ) STORED,
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(report_date, section_name, activity_type)
);

CREATE INDEX IF NOT EXISTS idx_section_progress_date ON section_progress(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_section_progress_summary ON section_progress(summary_id);


-- =============================================
-- 3. WELDING PROGRESS TABLE
-- Tracks welding by type (Stove Piping, Poorboy, Tie-ins)
-- =============================================
CREATE TABLE IF NOT EXISTS welding_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  summary_id UUID REFERENCES daily_construction_summary(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  
  -- Weld Type
  weld_type TEXT NOT NULL,  -- 'GMAW/FCAW Tie-Ins', 'GMAW/FCAW Stove Piping', 'GMAW/FCAW Poorboy', 'Section Crews (Crossings)', 'EGP South - Tie-Ins', 'EGP South - Poorboy'
  
  -- Station Range
  from_station TEXT,
  to_station TEXT,
  
  -- Linear Metres Progress
  today_lm NUMERIC DEFAULT 0,
  previous_lm NUMERIC DEFAULT 0,
  total_to_date_lm NUMERIC GENERATED ALWAYS AS (today_lm + previous_lm) STORED,
  
  -- Weld Count Progress
  today_welds INTEGER DEFAULT 0,
  previous_welds INTEGER DEFAULT 0,
  total_welds INTEGER GENERATED ALWAYS AS (today_welds + previous_welds) STORED,
  
  -- Repairs
  repairs_today INTEGER DEFAULT 0,
  repairs_previous INTEGER DEFAULT 0,
  repairs_total INTEGER GENERATED ALWAYS AS (repairs_today + repairs_previous) STORED,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(report_date, weld_type)
);

CREATE INDEX IF NOT EXISTS idx_welding_progress_date ON welding_progress(report_date DESC);


-- =============================================
-- 4. OVERALL PROGRESS TABLE
-- Progress to Date summary (Clearing, Grading, etc.)
-- =============================================
CREATE TABLE IF NOT EXISTS overall_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  summary_id UUID REFERENCES daily_construction_summary(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  
  -- Activity Description
  description TEXT NOT NULL,  -- 'Clearing', 'Grading / ROW Prep', 'Stringing', 'Welding', etc.
  unit_of_measure TEXT DEFAULT 'lm',  -- 'lm', 'ha', 'ea.'
  
  -- Progress Values
  total_planned NUMERIC DEFAULT 0,
  completed_to_date NUMERIC DEFAULT 0,
  remaining NUMERIC GENERATED ALWAYS AS (total_planned - completed_to_date) STORED,
  pct_complete NUMERIC GENERATED ALWAYS AS (
    CASE WHEN total_planned > 0 
    THEN ROUND((completed_to_date / total_planned) * 100, 0)
    ELSE 0 END
  ) STORED,
  pct_remaining NUMERIC GENERATED ALWAYS AS (
    CASE WHEN total_planned > 0 
    THEN ROUND(((total_planned - completed_to_date) / total_planned) * 100, 0)
    ELSE 100 END
  ) STORED,
  
  -- Display Order
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(report_date, description)
);

CREATE INDEX IF NOT EXISTS idx_overall_progress_date ON overall_progress(report_date DESC);


-- =============================================
-- 5. REPORT PHOTOS TABLE
-- Geotagged photos for daily summary
-- =============================================
CREATE TABLE IF NOT EXISTS report_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  summary_id UUID REFERENCES daily_construction_summary(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  source_report_id UUID,  -- Link to original inspector report
  
  -- Location
  kp_location TEXT,
  location_description TEXT,  -- e.g., 'KM 2 on the Hixon', 'KP 28+250'
  
  -- Photo Metadata
  photo_url TEXT,
  photo_storage_path TEXT,
  description TEXT,  -- Caption for the photo
  
  -- Geotag Data
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  direction_deg INTEGER,  -- Compass direction photo was taken
  accuracy_m NUMERIC,  -- GPS accuracy in metres
  altitude_m NUMERIC,
  
  -- Timestamps
  taken_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Sorting
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_report_photos_date ON report_photos(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_report_photos_kp ON report_photos(kp_location);
CREATE INDEX IF NOT EXISTS idx_report_photos_summary ON report_photos(summary_id);


-- =============================================
-- 6. REPAIR RATE VIEW
-- Calculated view for welding repair rates
-- =============================================
CREATE OR REPLACE VIEW welding_repair_rates AS
SELECT 
  report_date,
  weld_type,
  total_welds,
  repairs_total,
  CASE 
    WHEN total_welds > 0 
    THEN ROUND((repairs_total::NUMERIC / total_welds) * 100, 1)
    ELSE 0 
  END AS repair_rate_pct
FROM welding_progress
WHERE total_welds > 0;


-- =============================================
-- 7. HELPER FUNCTION: Generate Report Number
-- =============================================
CREATE OR REPLACE FUNCTION generate_report_number(report_dt DATE)
RETURNS TEXT AS $$
BEGIN
  RETURN TO_CHAR(report_dt, 'YYYYMMDD') || 'DPR';
END;
$$ LANGUAGE plpgsql;


-- =============================================
-- 8. TRIGGER: Auto-generate report number
-- =============================================
CREATE OR REPLACE FUNCTION set_report_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.report_number IS NULL THEN
    NEW.report_number := generate_report_number(NEW.report_date);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_report_number ON daily_construction_summary;
CREATE TRIGGER trigger_set_report_number
  BEFORE INSERT ON daily_construction_summary
  FOR EACH ROW
  EXECUTE FUNCTION set_report_number();


-- =============================================
-- 9. TRIGGER: Update timestamps
-- =============================================
CREATE OR REPLACE FUNCTION update_chiefs_report_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_summary_timestamp ON daily_construction_summary;
CREATE TRIGGER trigger_update_summary_timestamp
  BEFORE UPDATE ON daily_construction_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_chiefs_report_timestamp();


-- =============================================
-- 10. RLS POLICIES
-- =============================================

-- Enable RLS
ALTER TABLE daily_construction_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE welding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE overall_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_photos ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated read daily_construction_summary"
  ON daily_construction_summary FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read section_progress"
  ON section_progress FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read welding_progress"
  ON welding_progress FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read overall_progress"
  ON overall_progress FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read report_photos"
  ON report_photos FOR SELECT TO authenticated USING (true);

-- Allow chiefs/admins to insert/update
CREATE POLICY "Allow chiefs to manage daily_construction_summary"
  ON daily_construction_summary FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow chiefs to manage section_progress"
  ON section_progress FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow chiefs to manage welding_progress"
  ON welding_progress FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow chiefs to manage overall_progress"
  ON overall_progress FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow chiefs to manage report_photos"
  ON report_photos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- =============================================
-- 11. SAMPLE DATA (Optional - for testing)
-- =============================================
-- Uncomment to insert sample data matching Jan 7, 2026 PDF

/*
INSERT INTO daily_construction_summary (
  report_date, report_number, project_name, contractor, reported_by,
  weather_description, temp_high_f, temp_low_f, precipitation_mm, humidity_pct, wind_speed_kmh, uv_index,
  personnel_onsite, safety_status, avalanche_risk_level
) VALUES (
  '2026-01-07',
  '20260107DPR',
  'Eagle Mountain Pipeline Project',
  'SMJV',
  'Kevin Frederiksen',
  'Dry skies implied by zero precipitation',
  38, 30, 0, 89, 7, 'Low (0)',
  '{
    "prime_resources": 365,
    "fei_subcontractors": 34,
    "total_site_exposure": 474,
    "decca_inspector": 14,
    "env_qp": 15,
    "fei_compliance": 4,
    "meridian_survey": 5,
    "fei_employee": 0,
    "fei_ops": 6,
    "ndt": 4,
    "engineering": 9,
    "env_inspector": 4,
    "safety": 2,
    "other": 12
  }'::jsonb,
  'Regular avalanche season runs from November to April.',
  'OPEN'
);
*/


-- =============================================
-- MIGRATION COMPLETE
-- =============================================
-- Tables created:
--   - daily_construction_summary (main report)
--   - section_progress (Civil/Mechanical by section)
--   - welding_progress (by weld type)
--   - overall_progress (Clearing, Grading, etc.)
--   - report_photos (geotagged photos)
-- Views created:
--   - welding_repair_rates
-- =============================================
