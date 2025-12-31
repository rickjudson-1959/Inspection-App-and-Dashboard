-- =====================================================
-- PROJECT BASELINES TABLE
-- Powers EVM Dashboard and Weekly Executive Summary
-- Run this in Supabase SQL Editor
-- =====================================================

-- Create the project_baselines table
CREATE TABLE IF NOT EXISTS project_baselines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Project identification
  project_id UUID REFERENCES projects(id),
  spread VARCHAR(50),
  
  -- Activity details
  activity_type VARCHAR(100) NOT NULL,
  
  -- Distance planning
  planned_metres DECIMAL(12,2) NOT NULL DEFAULT 0,
  start_kp VARCHAR(20),  -- e.g., '0+000'
  end_kp VARCHAR(20),    -- e.g., '50+000'
  
  -- Cost planning
  budgeted_unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,  -- $/metre
  budgeted_total DECIMAL(14,2) GENERATED ALWAYS AS (planned_metres * budgeted_unit_cost) STORED,
  
  -- Schedule planning
  planned_start_date DATE NOT NULL,
  planned_end_date DATE NOT NULL,
  planned_daily_rate DECIMAL(10,2) GENERATED ALWAYS AS (
    CASE 
      WHEN planned_end_date > planned_start_date 
      THEN planned_metres / NULLIF((planned_end_date - planned_start_date)::DECIMAL, 0)
      ELSE planned_metres 
    END
  ) STORED,
  
  -- Labour rate assumptions (for AC calculation)
  labour_rate_per_hour DECIMAL(8,2) DEFAULT 85.00,
  equipment_rate_per_hour DECIMAL(8,2) DEFAULT 150.00,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT
);

-- Create index for faster queries
CREATE INDEX idx_baselines_project ON project_baselines(project_id);
CREATE INDEX idx_baselines_activity ON project_baselines(activity_type);
CREATE INDEX idx_baselines_spread ON project_baselines(spread);
CREATE INDEX idx_baselines_dates ON project_baselines(planned_start_date, planned_end_date);

-- Enable Row Level Security
ALTER TABLE project_baselines ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read
CREATE POLICY "Allow read access for authenticated users" ON project_baselines
  FOR SELECT TO authenticated USING (true);

-- Policy: Allow admins to insert/update/delete
CREATE POLICY "Allow full access for admins" ON project_baselines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'super_admin', 'pm', 'cm')
    )
  );

-- =====================================================
-- INSERT DEMO BASELINE DATA
-- Adjust these values for your actual project
-- =====================================================

INSERT INTO project_baselines (
  spread,
  activity_type,
  planned_metres,
  start_kp,
  end_kp,
  budgeted_unit_cost,
  planned_start_date,
  planned_end_date,
  labour_rate_per_hour,
  equipment_rate_per_hour,
  notes
) VALUES
  -- Clearing
  ('Spread 1', 'Clearing', 50000, '0+000', '50+000', 25.00, '2024-01-15', '2024-03-15', 75.00, 125.00, 'Initial clearing phase'),
  ('Spread 2', 'Clearing', 45000, '50+000', '95+000', 28.00, '2024-02-01', '2024-04-01', 75.00, 125.00, 'Clearing - mountainous terrain'),
  
  -- Grading
  ('Spread 1', 'Grading', 50000, '0+000', '50+000', 45.00, '2024-02-15', '2024-04-30', 80.00, 175.00, 'ROW grading'),
  ('Spread 2', 'Grading', 45000, '50+000', '95+000', 52.00, '2024-03-01', '2024-05-15', 80.00, 175.00, 'Grading - rock sections'),
  
  -- Stringing
  ('Spread 1', 'Stringing', 50000, '0+000', '50+000', 18.00, '2024-03-15', '2024-05-01', 85.00, 140.00, 'Pipe stringing'),
  ('Spread 2', 'Stringing', 45000, '50+000', '95+000', 20.00, '2024-04-01', '2024-05-20', 85.00, 140.00, 'Stringing with sidebooms'),
  
  -- Bending
  ('Spread 1', 'Bending', 50000, '0+000', '50+000', 12.00, '2024-03-20', '2024-05-10', 90.00, 160.00, 'Field bending'),
  ('Spread 2', 'Bending', 45000, '50+000', '95+000', 14.00, '2024-04-05', '2024-05-25', 90.00, 160.00, 'Bending - tight curves'),
  
  -- Welding - Mainline
  ('Spread 1', 'Welding - Mainline', 50000, '0+000', '50+000', 185.00, '2024-04-01', '2024-07-15', 95.00, 200.00, 'Mainline welding - 24" pipe'),
  ('Spread 2', 'Welding - Mainline', 45000, '50+000', '95+000', 195.00, '2024-04-20', '2024-08-01', 95.00, 200.00, 'Mainline welding - challenging terrain'),
  
  -- Welding - Tie-in
  ('Spread 1', 'Welding - Tie-in', 2000, '0+000', '50+000', 450.00, '2024-06-01', '2024-08-15', 100.00, 180.00, 'Tie-in welds'),
  ('Spread 2', 'Welding - Tie-in', 1800, '50+000', '95+000', 475.00, '2024-06-15', '2024-09-01', 100.00, 180.00, 'Tie-in welds - HDD exits'),
  
  -- Coating
  ('Spread 1', 'Coating', 50000, '0+000', '50+000', 35.00, '2024-04-15', '2024-07-30', 70.00, 120.00, 'Field joint coating'),
  ('Spread 2', 'Coating', 45000, '50+000', '95+000', 38.00, '2024-05-01', '2024-08-15', 70.00, 120.00, 'Coating - FBE repair'),
  
  -- Lowering-In
  ('Spread 1', 'Lowering-In', 50000, '0+000', '50+000', 55.00, '2024-05-15', '2024-08-15', 85.00, 250.00, 'Lowering with sidebooms'),
  ('Spread 2', 'Lowering-In', 45000, '50+000', '95+000', 62.00, '2024-06-01', '2024-09-01', 85.00, 250.00, 'Lowering - rocky ditch'),
  
  -- Backfill
  ('Spread 1', 'Backfill', 50000, '0+000', '50+000', 28.00, '2024-05-20', '2024-08-30', 75.00, 200.00, 'Backfill operations'),
  ('Spread 2', 'Backfill', 45000, '50+000', '95+000', 32.00, '2024-06-10', '2024-09-15', 75.00, 200.00, 'Backfill - padding required'),
  
  -- Cleanup & Restoration
  ('Spread 1', 'Cleanup', 50000, '0+000', '50+000', 22.00, '2024-07-01', '2024-09-30', 70.00, 150.00, 'Final cleanup'),
  ('Spread 2', 'Cleanup', 45000, '50+000', '95+000', 25.00, '2024-07-15', '2024-10-15', 70.00, 150.00, 'Cleanup & reclamation'),
  
  -- HDD
  ('Spread 1', 'HDD', 2500, '12+500', '15+000', 850.00, '2024-03-01', '2024-05-15', 110.00, 350.00, 'HDD - River Crossing'),
  ('Spread 2', 'HDD', 1800, '72+000', '73+800', 920.00, '2024-04-01', '2024-06-01', 110.00, 350.00, 'HDD - Highway Crossing'),
  
  -- Hydrotesting
  ('Spread 1', 'Hydrotest', 50000, '0+000', '50+000', 8.00, '2024-08-01', '2024-09-15', 90.00, 180.00, 'Hydrostatic testing'),
  ('Spread 2', 'Hydrotest', 45000, '50+000', '95+000', 9.00, '2024-08-15', '2024-10-01', 90.00, 180.00, 'Hydrotest - multiple sections');

-- =====================================================
-- VIEW: EVM Summary by Activity
-- =====================================================

CREATE OR REPLACE VIEW evm_baseline_summary AS
SELECT 
  activity_type,
  COUNT(*) as spread_count,
  SUM(planned_metres) as total_planned_metres,
  AVG(budgeted_unit_cost) as avg_unit_cost,
  SUM(budgeted_total) as total_budget,
  MIN(planned_start_date) as earliest_start,
  MAX(planned_end_date) as latest_end,
  AVG(labour_rate_per_hour) as avg_labour_rate,
  AVG(equipment_rate_per_hour) as avg_equipment_rate
FROM project_baselines
WHERE is_active = true
GROUP BY activity_type
ORDER BY earliest_start;

-- =====================================================
-- FUNCTION: Calculate Planned Value for a given date
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_planned_value(
  p_activity_type VARCHAR DEFAULT NULL,
  p_spread VARCHAR DEFAULT NULL,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  activity_type VARCHAR,
  spread VARCHAR,
  planned_metres_to_date DECIMAL,
  planned_value DECIMAL,
  total_planned_metres DECIMAL,
  percent_planned DECIMAL
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.activity_type,
    b.spread,
    -- Calculate metres that should be complete by this date
    CASE 
      WHEN p_as_of_date >= b.planned_end_date THEN b.planned_metres
      WHEN p_as_of_date < b.planned_start_date THEN 0::DECIMAL
      ELSE b.planned_metres * (
        (p_as_of_date - b.planned_start_date)::DECIMAL / 
        NULLIF((b.planned_end_date - b.planned_start_date)::DECIMAL, 0)
      )
    END as planned_metres_to_date,
    -- Planned Value = Planned Metres × Unit Cost
    CASE 
      WHEN p_as_of_date >= b.planned_end_date THEN b.budgeted_total
      WHEN p_as_of_date < b.planned_start_date THEN 0::DECIMAL
      ELSE b.planned_metres * b.budgeted_unit_cost * (
        (p_as_of_date - b.planned_start_date)::DECIMAL / 
        NULLIF((b.planned_end_date - b.planned_start_date)::DECIMAL, 0)
      )
    END as planned_value,
    b.planned_metres as total_planned_metres,
    -- Percent of plan that should be complete
    CASE 
      WHEN p_as_of_date >= b.planned_end_date THEN 100::DECIMAL
      WHEN p_as_of_date < b.planned_start_date THEN 0::DECIMAL
      ELSE 100 * (
        (p_as_of_date - b.planned_start_date)::DECIMAL / 
        NULLIF((b.planned_end_date - b.planned_start_date)::DECIMAL, 0)
      )
    END as percent_planned
  FROM project_baselines b
  WHERE b.is_active = true
    AND (p_activity_type IS NULL OR b.activity_type = p_activity_type)
    AND (p_spread IS NULL OR b.spread = p_spread);
END;
$$;
