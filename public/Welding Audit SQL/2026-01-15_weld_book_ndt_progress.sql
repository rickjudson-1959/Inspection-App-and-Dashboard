-- ============================================================================
-- PIPE-UP DATABASE MIGRATION: Weld Book, NDT, Progress Tracking, Site Conditions
-- Date: January 15, 2026
-- Purpose: Support real-world Construction Summary and Weld Audit report structures
-- ============================================================================

-- ============================================================================
-- 1. POLYMORPHIC AUDIT LOG REFINEMENT (Option A)
-- Already exists with entity_type, entity_id, field_name, old_value, new_value
-- Adding indexes and ensuring action_type consistency
-- ============================================================================

-- Add index for faster entity-based queries
CREATE INDEX IF NOT EXISTS idx_audit_log_entity 
ON report_audit_log(entity_type, entity_id);

-- Add index for date-range queries
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at 
ON report_audit_log(changed_at DESC);

-- Add composite index for weld-specific audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_weld 
ON report_audit_log(weld_number, entity_type) 
WHERE weld_number IS NOT NULL;

-- ============================================================================
-- 2. PROGRESS TRACKING TABLE
-- Planned vs Actual progress by KP segments and Activity Type
-- ============================================================================

CREATE TABLE IF NOT EXISTS progress_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- KP Segment (e.g., KP 10+000 to KP 10+500)
  kp_start NUMERIC(8,3) NOT NULL,           -- e.g., 10.000
  kp_end NUMERIC(8,3) NOT NULL,             -- e.g., 10.500
  segment_length_m NUMERIC(8,1) GENERATED ALWAYS AS (
    (kp_end - kp_start) * 1000
  ) STORED,
  
  -- Activity Classification
  activity_category TEXT NOT NULL CHECK (activity_category IN (
    'civil', 'mechanical'
  )),
  activity_type TEXT NOT NULL,              -- 'clearing', 'grading', 'ditching', 'stringing', 'welding', 'coating', 'lowering', 'backfill', 'cleanup'
  
  -- Planned Progress
  planned_start_date DATE,
  planned_end_date DATE,
  planned_lm NUMERIC(10,1),                 -- Planned linear meters
  
  -- Actual Progress
  actual_start_date DATE,
  actual_end_date DATE,
  actual_lm NUMERIC(10,1) DEFAULT 0,        -- Actual linear meters completed
  
  -- Calculated Fields
  variance_lm NUMERIC(10,1) GENERATED ALWAYS AS (
    actual_lm - COALESCE(planned_lm, 0)
  ) STORED,
  percent_complete NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN planned_lm > 0 THEN (actual_lm / planned_lm * 100) ELSE 0 END
  ) STORED,
  
  -- Status
  status TEXT DEFAULT 'not_started' CHECK (status IN (
    'not_started', 'in_progress', 'completed', 'on_hold'
  )),
  
  -- Metadata
  notes TEXT,
  updated_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for progress tracking
CREATE INDEX idx_progress_project ON progress_tracking(project_id);
CREATE INDEX idx_progress_kp ON progress_tracking(kp_start, kp_end);
CREATE INDEX idx_progress_activity ON progress_tracking(activity_category, activity_type);
CREATE INDEX idx_progress_status ON progress_tracking(status);

-- Daily progress entries (aggregated from inspector reports)
CREATE TABLE IF NOT EXISTS daily_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  report_id UUID REFERENCES daily_tickets(id) ON DELETE SET NULL,
  progress_date DATE NOT NULL,
  
  -- Location
  kp_start NUMERIC(8,3),
  kp_end NUMERIC(8,3),
  
  -- Activity
  activity_category TEXT NOT NULL CHECK (activity_category IN ('civil', 'mechanical')),
  activity_type TEXT NOT NULL,
  
  -- Progress
  lm_completed NUMERIC(10,1) NOT NULL DEFAULT 0,
  
  -- Crew info
  crew_size INTEGER,
  equipment_hours NUMERIC(6,1),
  
  -- Metadata
  inspector_id UUID REFERENCES user_profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_daily_progress_date ON daily_progress(progress_date DESC);
CREATE INDEX idx_daily_progress_activity ON daily_progress(activity_type);

-- ============================================================================
-- 3. MASTER WELD BOOK
-- Central weld tracking with survey comparison
-- ============================================================================

CREATE TABLE IF NOT EXISTS weld_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Weld Identification
  weld_number TEXT NOT NULL,                -- MG-123, T-45, SP-12, F-1
  weld_type TEXT NOT NULL CHECK (weld_type IN (
    'MG/PB',           -- Mainline/Production Butt (was MG)
    'tie_in',          -- Tie-in welds
    'section',         -- Section welds (SP)
    'fabrication',     -- Fabrication welds (F)
    'test_head',       -- Test head welds
    'repair'           -- Repair welds
  )),
  weld_method TEXT CHECK (weld_method IN (
    'stove_piping',    -- Sequential welding along ROW
    'poorboy',         -- Single spread welding
    'tie_in',          -- Connecting pipe strings
    'double_joint',    -- Factory double joints
    'station'          -- Station/facility welds
  )),
  
  -- Pipe Specifications
  pipe_diameter TEXT NOT NULL,              -- '16"', '12"', '10"'
  wall_thickness NUMERIC(5,2),              -- mm (e.g., 7.1, 10.3)
  pipe_grade TEXT,                          -- e.g., 'X70', 'X52'
  
  -- Location - Field Recorded
  field_station TEXT,                       -- Station as recorded by inspector (e.g., '10+520')
  field_kp NUMERIC(8,3),                    -- KP converted from station
  
  -- Location - Survey As-Built
  survey_station TEXT,                      -- Station from survey data
  survey_kp NUMERIC(8,3),                   -- KP from survey
  survey_latitude NUMERIC(10,7),
  survey_longitude NUMERIC(11,7),
  
  -- Variance Tracking
  kp_variance_m NUMERIC(6,2) GENERATED ALWAYS AS (
    ABS(COALESCE(field_kp, 0) - COALESCE(survey_kp, 0)) * 1000
  ) STORED,
  
  -- Dates
  weld_date DATE,
  inspection_date DATE,
  repair_date DATE,
  cutout_date DATE,
  
  -- Welder Info
  welder_id TEXT,                           -- Welder stencil/ID
  welder_name TEXT,
  
  -- Acceptance Status
  acceptance_status TEXT DEFAULT 'pending' CHECK (acceptance_status IN (
    'pending',         -- Awaiting NDE
    'accepted',        -- Passed NDE (ACC)
    'repair',          -- Requires repair (R)
    'cutout',          -- Cut out and replaced (C/O)
    'acceptable_to_code'  -- Acceptable per code deviation
  )),
  
  -- Defect Tracking
  defect_description TEXT,
  defect_location TEXT,                     -- Clock position, etc.
  
  -- Repair Tracking
  repair_welder_id TEXT,
  repair_accepted BOOLEAN,
  repair_nde_date DATE,
  
  -- Links to daily reports
  original_report_id UUID REFERENCES daily_tickets(id),
  repair_report_id UUID REFERENCES daily_tickets(id),
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES user_profiles(id),
  updated_by UUID REFERENCES user_profiles(id),
  
  UNIQUE(project_id, weld_number)
);

-- Indexes for weld book
CREATE INDEX idx_weld_book_project ON weld_book(project_id);
CREATE INDEX idx_weld_book_number ON weld_book(weld_number);
CREATE INDEX idx_weld_book_type ON weld_book(weld_type);
CREATE INDEX idx_weld_book_status ON weld_book(acceptance_status);
CREATE INDEX idx_weld_book_kp ON weld_book(field_kp);
CREATE INDEX idx_weld_book_date ON weld_book(weld_date DESC);

-- ============================================================================
-- 4. NDT INSPECTIONS TABLE
-- Unified table for RT, AUT, Manual UT with JSONB technical metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS ndt_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  weld_id UUID REFERENCES weld_book(id) ON DELETE CASCADE,
  
  -- Inspection Identification
  inspection_number TEXT,                   -- NDT report number
  spread_number TEXT,                       -- Construction spread reference
  
  -- Method
  method TEXT NOT NULL CHECK (method IN (
    'RT',              -- Radiographic Testing (X-Ray/Gamma)
    'AUT',             -- Automated Ultrasonic Testing
    'manual_UT',       -- Manual Ultrasonic Testing
    'MT',              -- Magnetic Particle Testing
    'PT',              -- Penetrant Testing
    'VT'               -- Visual Testing
  )),
  
  -- RT-Specific: Technique
  rt_technique TEXT CHECK (rt_technique IN (
    'SWX',             -- Single Wall X-Ray
    'DWX',             -- Double Wall X-Ray (panoramic)
    'DWG',             -- Double Wall Gamma
    'DWSI',            -- Double Wall Single Image
    'DWDI'             -- Double Wall Double Image
  )),
  rt_source TEXT,                           -- 'X-Ray', 'Ir-192', 'Co-60', 'Se-75'
  
  -- Technical Metadata (method-specific fields stored as JSONB)
  -- RT: { film_density_weld, film_density_pipe, sensitivity, iqi_type, iqi_visibility }
  -- AUT: { gating_channels, wall_thickness_readings, calibration_block }
  -- UT: { probe_type, frequency_mhz, couplant, calibration_id }
  technical_metadata JSONB DEFAULT '{}',
  
  -- Quality Criteria (especially for RT Film Audit)
  coverage_acceptable BOOLEAN,
  density_weld_acceptable BOOLEAN,
  density_pipe_acceptable BOOLEAN,
  film_id_acceptable BOOLEAN,
  sensitivity_acceptable BOOLEAN,
  reporting_acceptable BOOLEAN,
  
  -- Interpretation
  interpretation_result TEXT CHECK (interpretation_result IN (
    'accept',
    'reject',
    'repair',
    'rescan',
    'acceptable_to_code'
  )),
  interpretation_agree BOOLEAN,             -- Level III agrees with initial interpretation
  
  -- Defect Recording
  defects_found JSONB DEFAULT '[]',         -- Array of { type, location, size, disposition }
  
  -- Personnel
  technician_name TEXT,
  technician_cert_level TEXT,               -- 'RT-II', 'UT-II', 'RT-III'
  technician_cert_number TEXT,
  reviewer_name TEXT,                       -- Level III reviewer
  reviewer_cert_number TEXT,
  
  -- Dates
  inspection_date DATE NOT NULL,
  review_date DATE,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',
    'reviewed',
    'approved',
    'rejected'
  )),
  
  -- Comments
  comments TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES user_profiles(id)
);

-- Indexes for NDT inspections
CREATE INDEX idx_ndt_project ON ndt_inspections(project_id);
CREATE INDEX idx_ndt_weld ON ndt_inspections(weld_id);
CREATE INDEX idx_ndt_method ON ndt_inspections(method);
CREATE INDEX idx_ndt_date ON ndt_inspections(inspection_date DESC);
CREATE INDEX idx_ndt_status ON ndt_inspections(status);
CREATE INDEX idx_ndt_spread ON ndt_inspections(spread_number);

-- GIN index for JSONB queries
CREATE INDEX idx_ndt_technical_metadata ON ndt_inspections USING GIN (technical_metadata);
CREATE INDEX idx_ndt_defects ON ndt_inspections USING GIN (defects_found);

-- ============================================================================
-- 5. WELDING METRICS & REPAIR RATE TRACKING
-- Aggregated welding statistics per spread/project
-- ============================================================================

CREATE TABLE IF NOT EXISTS welding_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Period
  metrics_date DATE NOT NULL,
  spread_number TEXT,
  
  -- Weld Counts by Type
  mg_pb_count INTEGER DEFAULT 0,            -- Mainline/Production Butt
  tie_in_count INTEGER DEFAULT 0,
  section_count INTEGER DEFAULT 0,
  fabrication_count INTEGER DEFAULT 0,
  
  -- Weld Counts by Method
  stove_piping_count INTEGER DEFAULT 0,
  poorboy_count INTEGER DEFAULT 0,
  
  -- Acceptance Metrics
  total_welds INTEGER DEFAULT 0,
  accepted_count INTEGER DEFAULT 0,
  repair_count INTEGER DEFAULT 0,
  cutout_count INTEGER DEFAULT 0,
  pending_count INTEGER DEFAULT 0,
  
  -- Calculated Repair Rate (%)
  repair_rate NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_welds > 0 
    THEN (repair_count::NUMERIC / total_welds * 100) 
    ELSE 0 END
  ) STORED,
  
  -- Cutout Rate (%)
  cutout_rate NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_welds > 0 
    THEN (cutout_count::NUMERIC / total_welds * 100) 
    ELSE 0 END
  ) STORED,
  
  -- First-Time Accept Rate (%)
  first_time_accept_rate NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_welds > 0 
    THEN (accepted_count::NUMERIC / total_welds * 100) 
    ELSE 0 END
  ) STORED,
  
  -- Linear Progress
  linear_meters_welded NUMERIC(10,1),
  welds_per_day NUMERIC(5,1),
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, metrics_date, spread_number)
);

CREATE INDEX idx_welding_metrics_project ON welding_metrics(project_id);
CREATE INDEX idx_welding_metrics_date ON welding_metrics(metrics_date DESC);

-- ============================================================================
-- 6. SITE CONDITIONS / DAILY WEATHER TRACKING
-- Critical for BC atmospheric river reporting and environmental compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  report_id UUID REFERENCES daily_tickets(id) ON DELETE SET NULL,
  
  -- Date & Location
  condition_date DATE NOT NULL,
  spread_number TEXT,
  location_description TEXT,
  kp_reference NUMERIC(8,3),
  
  -- Temperature (Celsius)
  temp_high NUMERIC(4,1),                   -- Daily high
  temp_low NUMERIC(4,1),                    -- Daily low
  temp_at_start NUMERIC(4,1),               -- Temperature at work start
  temp_at_end NUMERIC(4,1),                 -- Temperature at work end
  
  -- Precipitation
  precipitation_mm NUMERIC(6,1) DEFAULT 0,  -- Daily precipitation in mm
  precipitation_type TEXT CHECK (precipitation_type IN (
    'none', 'rain', 'snow', 'mixed', 'freezing_rain', 'hail'
  )),
  
  -- Atmospheric River Tracking (BC-specific)
  atmospheric_river_event BOOLEAN DEFAULT FALSE,
  ar_intensity TEXT CHECK (ar_intensity IN (
    'AR1', 'AR2', 'AR3', 'AR4', 'AR5'       -- AR scale 1-5
  )),
  cumulative_precip_event_mm NUMERIC(8,1),  -- Total for multi-day event
  
  -- Wind
  wind_speed_kmh NUMERIC(5,1),
  wind_gusts_kmh NUMERIC(5,1),
  wind_direction TEXT,                      -- 'N', 'NE', 'E', etc.
  
  -- Ground Conditions
  ground_condition TEXT CHECK (ground_condition IN (
    'dry', 'damp', 'wet', 'saturated', 'frozen', 'snow_covered', 'muddy'
  )),
  frost_depth_cm NUMERIC(5,1),
  water_table_depth_m NUMERIC(4,2),
  
  -- Work Impact
  work_impact TEXT CHECK (work_impact IN (
    'none',            -- No impact to work
    'modified',        -- Modified work activities
    'delayed',         -- Work delayed
    'suspended'        -- Work suspended
  )),
  work_impact_notes TEXT,
  
  -- Visibility
  visibility TEXT CHECK (visibility IN (
    'good', 'moderate', 'poor', 'very_poor'
  )),
  
  -- Environmental Alerts
  environmental_alerts JSONB DEFAULT '[]',  -- Array of active alerts
  
  -- Source
  weather_source TEXT,                      -- 'field_observation', 'weather_station', 'environment_canada'
  weather_station_id TEXT,
  
  -- Inspector
  recorded_by UUID REFERENCES user_profiles(id),
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, condition_date, spread_number)
);

-- Indexes for site conditions
CREATE INDEX idx_site_conditions_project ON site_conditions(project_id);
CREATE INDEX idx_site_conditions_date ON site_conditions(condition_date DESC);
CREATE INDEX idx_site_conditions_precip ON site_conditions(precipitation_mm) 
  WHERE precipitation_mm > 0;
CREATE INDEX idx_site_conditions_ar ON site_conditions(atmospheric_river_event) 
  WHERE atmospheric_river_event = TRUE;

-- ============================================================================
-- 7. RT FILM AUDIT (Level III Review)
-- Per-spread audit of radiographic film quality
-- ============================================================================

CREATE TABLE IF NOT EXISTS rt_film_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Audit Identification
  audit_number TEXT,
  spread_number TEXT NOT NULL,
  audit_date DATE NOT NULL,
  
  -- NDT Contractor Info
  ndt_contractor TEXT,
  ndt_site_supervisor TEXT,
  
  -- Spec Requirements Checklist
  spec_requirements JSONB DEFAULT '{
    "ndt_supervisor_audits": null,
    "audits_recorded_documented": null,
    "rt_certification": null,
    "qualified_operator": null,
    "radiographic_testing_procedure": null,
    "radiographic_testing_techniques": null,
    "radiographic_film": null,
    "radiographic_quality": null,
    "marking_identification": null,
    "packaging_of_radiographs": null,
    "evaluation_of_indications": null,
    "weld_repair_lists": null,
    "reporting_procedures": null,
    "safety": null
  }',
  
  -- Summary Statistics
  total_welds_audited INTEGER DEFAULT 0,
  mainline_welds INTEGER DEFAULT 0,
  tie_in_welds INTEGER DEFAULT 0,
  fabrication_welds INTEGER DEFAULT 0,
  
  -- Repair Statistics
  total_repairs INTEGER DEFAULT 0,
  repair_rate_percent NUMERIC(5,2),
  
  -- Overall Assessment
  film_quality_acceptable BOOLEAN,
  documentation_complete BOOLEAN,
  
  -- Comments
  comments TEXT,
  findings TEXT,
  
  -- Signatures
  auditor_name TEXT,
  auditor_cert_number TEXT,
  auditor_signature_date DATE,
  
  client_rep_name TEXT,
  client_rep_signature_date DATE,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'approved', 'revision_required'
  )),
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES user_profiles(id)
);

CREATE INDEX idx_rt_audit_project ON rt_film_audit(project_id);
CREATE INDEX idx_rt_audit_spread ON rt_film_audit(spread_number);
CREATE INDEX idx_rt_audit_date ON rt_film_audit(audit_date DESC);

-- ============================================================================
-- 8. SURVEY WELDS REFERENCE TABLE
-- Import as-built survey weld data for comparison
-- ============================================================================

CREATE TABLE IF NOT EXISTS survey_welds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Identification
  weld_number TEXT NOT NULL,
  survey_id TEXT,                           -- ID from survey data
  
  -- Location
  station TEXT,
  kp NUMERIC(8,3),
  latitude NUMERIC(10,7),
  longitude NUMERIC(11,7),
  elevation_m NUMERIC(7,2),
  
  -- Pipe Info
  pipe_diameter TEXT,
  wall_thickness NUMERIC(5,2),
  
  -- Classification
  weld_type TEXT,                           -- From survey description
  description TEXT,
  
  -- Source
  survey_date DATE,
  survey_source TEXT,                       -- 'KMZ', 'CSV', 'Manual'
  
  -- Audit
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID REFERENCES user_profiles(id),
  
  UNIQUE(project_id, weld_number)
);

CREATE INDEX idx_survey_welds_project ON survey_welds(project_id);
CREATE INDEX idx_survey_welds_kp ON survey_welds(kp);

-- ============================================================================
-- 9. ROW-LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE progress_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE weld_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE ndt_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE welding_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rt_film_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_welds ENABLE ROW LEVEL SECURITY;

-- Basic policies (allow authenticated users)
CREATE POLICY "Authenticated users can view progress_tracking"
  ON progress_tracking FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert progress_tracking"
  ON progress_tracking FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update progress_tracking"
  ON progress_tracking FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view daily_progress"
  ON daily_progress FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert daily_progress"
  ON daily_progress FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can view weld_book"
  ON weld_book FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert weld_book"
  ON weld_book FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update weld_book"
  ON weld_book FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view ndt_inspections"
  ON ndt_inspections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ndt_inspections"
  ON ndt_inspections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update ndt_inspections"
  ON ndt_inspections FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view welding_metrics"
  ON welding_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert welding_metrics"
  ON welding_metrics FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can view site_conditions"
  ON site_conditions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert site_conditions"
  ON site_conditions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update site_conditions"
  ON site_conditions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view rt_film_audit"
  ON rt_film_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert rt_film_audit"
  ON rt_film_audit FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update rt_film_audit"
  ON rt_film_audit FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view survey_welds"
  ON survey_welds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert survey_welds"
  ON survey_welds FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- 10. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_progress_tracking_updated_at
  BEFORE UPDATE ON progress_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_weld_book_updated_at
  BEFORE UPDATE ON weld_book
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ndt_inspections_updated_at
  BEFORE UPDATE ON ndt_inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_welding_metrics_updated_at
  BEFORE UPDATE ON welding_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_site_conditions_updated_at
  BEFORE UPDATE ON site_conditions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rt_film_audit_updated_at
  BEFORE UPDATE ON rt_film_audit
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 11. HELPER VIEWS
-- ============================================================================

-- Weld Book with Survey Comparison
CREATE OR REPLACE VIEW weld_book_with_survey AS
SELECT 
  wb.*,
  sw.station AS survey_station_ref,
  sw.latitude AS survey_lat,
  sw.longitude AS survey_lon,
  sw.description AS survey_description
FROM weld_book wb
LEFT JOIN survey_welds sw ON wb.project_id = sw.project_id 
  AND wb.weld_number = sw.weld_number;

-- Daily Welding Summary
CREATE OR REPLACE VIEW daily_welding_summary AS
SELECT 
  project_id,
  weld_date,
  weld_type,
  COUNT(*) AS weld_count,
  COUNT(*) FILTER (WHERE acceptance_status = 'accepted') AS accepted,
  COUNT(*) FILTER (WHERE acceptance_status = 'repair') AS repairs,
  COUNT(*) FILTER (WHERE acceptance_status = 'cutout') AS cutouts,
  ROUND(
    COUNT(*) FILTER (WHERE acceptance_status = 'repair')::NUMERIC / 
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS repair_rate_pct
FROM weld_book
WHERE weld_date IS NOT NULL
GROUP BY project_id, weld_date, weld_type
ORDER BY weld_date DESC;

-- Progress Summary by Activity
CREATE OR REPLACE VIEW progress_summary AS
SELECT 
  project_id,
  activity_category,
  activity_type,
  SUM(planned_lm) AS total_planned_lm,
  SUM(actual_lm) AS total_actual_lm,
  ROUND(
    SUM(actual_lm) / NULLIF(SUM(planned_lm), 0) * 100, 1
  ) AS overall_percent_complete,
  COUNT(*) FILTER (WHERE status = 'completed') AS segments_completed,
  COUNT(*) AS total_segments
FROM progress_tracking
GROUP BY project_id, activity_category, activity_type;

-- Weather Impact Summary
CREATE OR REPLACE VIEW weather_impact_summary AS
SELECT 
  project_id,
  DATE_TRUNC('month', condition_date) AS month,
  COUNT(*) AS days_recorded,
  SUM(precipitation_mm) AS total_precip_mm,
  AVG(temp_high) AS avg_high_temp,
  AVG(temp_low) AS avg_low_temp,
  COUNT(*) FILTER (WHERE work_impact IN ('delayed', 'suspended')) AS days_impacted,
  COUNT(*) FILTER (WHERE atmospheric_river_event = TRUE) AS ar_event_days
FROM site_conditions
GROUP BY project_id, DATE_TRUNC('month', condition_date)
ORDER BY month DESC;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
