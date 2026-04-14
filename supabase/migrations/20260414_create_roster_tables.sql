-- Personnel roster: employee name → classification
CREATE TABLE IF NOT EXISTS personnel_roster (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  employee_name TEXT NOT NULL,
  classification TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_roster_unique
  ON personnel_roster (organization_id, lower(employee_name));

ALTER TABLE personnel_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read personnel roster" ON personnel_roster FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert personnel roster" ON personnel_roster FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update personnel roster" ON personnel_roster FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete personnel roster" ON personnel_roster FOR DELETE TO authenticated USING (true);

-- Equipment fleet: unit number → equipment type/description
CREATE TABLE IF NOT EXISTS equipment_fleet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  unit_number TEXT NOT NULL,
  equipment_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_fleet_unique
  ON equipment_fleet (organization_id, lower(unit_number));

ALTER TABLE equipment_fleet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read equipment fleet" ON equipment_fleet FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert equipment fleet" ON equipment_fleet FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update equipment fleet" ON equipment_fleet FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete equipment fleet" ON equipment_fleet FOR DELETE TO authenticated USING (true);
