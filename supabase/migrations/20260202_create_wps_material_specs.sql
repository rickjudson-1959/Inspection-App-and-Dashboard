-- ============================================================================
-- WPS MATERIAL SPECIFICATIONS TABLE
-- February 2, 2026
-- Stores Weld Procedure Specifications with allowed materials for AI validation
-- ============================================================================

-- Create wps_material_specs table
CREATE TABLE IF NOT EXISTS wps_material_specs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- WPS identification
  wps_number TEXT NOT NULL,                    -- e.g., 'WPS-01', 'WPS-02'
  wps_name TEXT,                               -- e.g., 'Mainline Butt Weld'
  revision TEXT DEFAULT 'A',                   -- Revision letter

  -- Material specifications
  allowed_base_materials TEXT[] NOT NULL DEFAULT '{}',  -- e.g., ['X52', 'X60', 'X65', 'X70']
  allowed_filler_materials TEXT[] DEFAULT '{}',         -- e.g., ['E6010', 'E7018', 'E8018']

  -- Pipe specifications
  min_wall_thickness DECIMAL(6,3),             -- Minimum wall thickness (mm)
  max_wall_thickness DECIMAL(6,3),             -- Maximum wall thickness (mm)
  min_diameter DECIMAL(8,2),                   -- Minimum pipe diameter (inches)
  max_diameter DECIMAL(8,2),                   -- Maximum pipe diameter (inches)

  -- Welding parameters
  weld_process TEXT,                           -- e.g., 'SMAW', 'GMAW', 'FCAW'
  position_qualified TEXT[],                   -- e.g., ['1G', '2G', '5G', '6G']
  preheat_required BOOLEAN DEFAULT false,
  min_preheat_temp INTEGER,                    -- Celsius
  pwht_required BOOLEAN DEFAULT false,         -- Post-weld heat treatment

  -- Status
  is_active BOOLEAN DEFAULT true,
  effective_date DATE,
  expiry_date DATE,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint per org
  CONSTRAINT unique_wps_per_org UNIQUE (organization_id, wps_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_wps_specs_org ON wps_material_specs(organization_id);
CREATE INDEX IF NOT EXISTS idx_wps_specs_number ON wps_material_specs(wps_number);
CREATE INDEX IF NOT EXISTS idx_wps_specs_active ON wps_material_specs(organization_id, is_active);

-- Enable RLS
ALTER TABLE wps_material_specs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their org's WPS specs" ON wps_material_specs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Admins can manage WPS specs" ON wps_material_specs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND (role IN ('super_admin', 'admin', 'chief_inspector'))
    )
  );

-- Grant service role full access (for Edge Functions)
GRANT ALL ON wps_material_specs TO service_role;

-- ============================================================================
-- SEED DEFAULT WPS SPECIFICATIONS
-- Common pipeline welding procedures with typical material allowances
-- ============================================================================

-- Insert sample WPS specs for Default Organization
INSERT INTO wps_material_specs (
  organization_id,
  wps_number,
  wps_name,
  allowed_base_materials,
  allowed_filler_materials,
  min_wall_thickness,
  max_wall_thickness,
  min_diameter,
  max_diameter,
  weld_process,
  position_qualified,
  preheat_required,
  min_preheat_temp,
  notes
)
SELECT
  o.id,
  v.wps_number,
  v.wps_name,
  v.allowed_base_materials,
  v.allowed_filler_materials,
  v.min_wall_thickness,
  v.max_wall_thickness,
  v.min_diameter,
  v.max_diameter,
  v.weld_process,
  v.position_qualified,
  v.preheat_required,
  v.min_preheat_temp,
  v.notes
FROM organizations o
CROSS JOIN (
  VALUES
    (
      'WPS-01',
      'Mainline Butt Weld - Standard',
      ARRAY['X52', 'X60', 'X65', 'X70'],
      ARRAY['E6010', 'E7010', 'E8010'],
      6.35,   -- 0.250"
      19.05,  -- 0.750"
      4.0,    -- 4" NPS
      48.0,   -- 48" NPS
      'SMAW',
      ARRAY['1G', '2G', '5G', '6G'],
      true,
      50,
      'Standard mainline butt weld procedure for X52-X70 grade pipe'
    ),
    (
      'WPS-02',
      'Mainline Butt Weld - High Strength',
      ARRAY['X70', 'X80'],
      ARRAY['E8010', 'E8018', 'E9010'],
      9.53,   -- 0.375"
      25.4,   -- 1.000"
      12.0,   -- 12" NPS
      48.0,   -- 48" NPS
      'SMAW',
      ARRAY['1G', '2G', '5G', '6G'],
      true,
      100,
      'High strength mainline procedure for X70-X80 grade pipe. X52/X60/X65 NOT ALLOWED.'
    ),
    (
      'WPS-03',
      'Tie-In Weld - Field',
      ARRAY['X52', 'X60', 'X65', 'X70', 'X80'],
      ARRAY['E6010', 'E7010', 'E8010', 'E8018'],
      6.35,
      25.4,
      4.0,
      48.0,
      'SMAW',
      ARRAY['5G', '6G'],
      true,
      75,
      'Field tie-in weld procedure - all common grades allowed'
    ),
    (
      'WPS-04',
      'Repair Weld - Grinding',
      ARRAY['X52', 'X60', 'X65'],
      ARRAY['E7018', 'E8018'],
      6.35,
      15.88,
      4.0,
      36.0,
      'SMAW',
      ARRAY['All Positions'],
      false,
      NULL,
      'Repair weld procedure for grinding repairs - low/medium grades only'
    ),
    (
      'WPS-05',
      'Branch Connection Weld',
      ARRAY['X52', 'X60', 'X65', 'X70'],
      ARRAY['E7018', 'E8018'],
      4.78,
      12.7,
      2.0,
      12.0,
      'SMAW',
      ARRAY['2G', '5G', '6G'],
      true,
      50,
      'Branch and fitting weld procedure'
    )
) AS v(
  wps_number,
  wps_name,
  allowed_base_materials,
  allowed_filler_materials,
  min_wall_thickness,
  max_wall_thickness,
  min_diameter,
  max_diameter,
  weld_process,
  position_qualified,
  preheat_required,
  min_preheat_temp,
  notes
)
WHERE o.slug = 'default'
ON CONFLICT (organization_id, wps_number) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE wps_material_specs IS 'Weld Procedure Specifications with material compatibility for AI agent validation';
COMMENT ON COLUMN wps_material_specs.allowed_base_materials IS 'Array of allowed pipe material grades (e.g., X52, X60, X70, X80)';
COMMENT ON COLUMN wps_material_specs.allowed_filler_materials IS 'Array of allowed filler/electrode types (e.g., E6010, E7018)';
