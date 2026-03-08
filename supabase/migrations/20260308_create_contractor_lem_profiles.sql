-- Contractor LEM Profiles — stores learned classification patterns per contractor
CREATE TABLE IF NOT EXISTS contractor_lem_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  contractor_name TEXT NOT NULL,
  classification_guide JSONB NOT NULL DEFAULT '{}',
  sample_page_urls JSONB DEFAULT '[]',
  sample_tags JSONB DEFAULT '[]',
  corrections JSONB DEFAULT '[]',
  corrections_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,

  UNIQUE(organization_id, contractor_name)
);

ALTER TABLE contractor_lem_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for contractor_lem_profiles"
ON contractor_lem_profiles FOR ALL
USING (
  organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
);

CREATE INDEX idx_contractor_lem_profiles_org ON contractor_lem_profiles(organization_id);
CREATE INDEX idx_contractor_lem_profiles_name ON contractor_lem_profiles(organization_id, contractor_name);
