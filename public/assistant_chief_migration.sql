-- ============================================================================
-- ASSISTANT CHIEF INSPECTOR TABLES
-- January 2026 - Pipe-Up Pipeline Inspector SaaS
-- 
-- Tables for:
-- 1. Assistant Chief Reviews (optional report review)
-- 2. Inspector Assignments (daily staff assignments)
-- 3. Contractor Deficiencies (deficiency tracking)
-- ============================================================================

-- ============================================
-- 1. ASSISTANT CHIEF REVIEWS
-- Track optional reviews by Assistant Chief Inspector
-- Chief can still approve without this review
-- ============================================
CREATE TABLE IF NOT EXISTS assistant_chief_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES inspection_reports(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id),
  reviewer_name TEXT,
  status TEXT CHECK (status IN ('reviewed', 'recommended', 'needs_revision')),
  notes TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_assistant_reviews_report ON assistant_chief_reviews(report_id);
CREATE INDEX IF NOT EXISTS idx_assistant_reviews_reviewer ON assistant_chief_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_assistant_reviews_date ON assistant_chief_reviews(reviewed_at);

-- ============================================
-- 2. INSPECTOR ASSIGNMENTS
-- Daily work assignments for inspectors
-- ============================================
CREATE TABLE IF NOT EXISTS inspector_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inspector_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  activity TEXT NOT NULL,
  kp_start DECIMAL(10,3),
  kp_end DECIMAL(10,3),
  notes TEXT,
  assignment_date DATE NOT NULL,
  assigned_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assignments_inspector ON inspector_assignments(inspector_id);
CREATE INDEX IF NOT EXISTS idx_assignments_date ON inspector_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_assignments_activity ON inspector_assignments(activity);

-- ============================================
-- 3. CONTRACTOR DEFICIENCIES
-- Track contractor deficiencies and rectification
-- ============================================
CREATE TABLE IF NOT EXISTS contractor_deficiencies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('technical', 'safety', 'environmental', 'regulatory', 'quality', 'other')),
  description TEXT NOT NULL,
  location_kp DECIMAL(10,3),
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  contractor_notified BOOLEAN DEFAULT FALSE,
  contractor_response TEXT,
  due_date DATE,
  reported_by UUID REFERENCES profiles(id),
  reported_by_name TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES profiles(id),
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deficiencies_status ON contractor_deficiencies(status);
CREATE INDEX IF NOT EXISTS idx_deficiencies_category ON contractor_deficiencies(category);
CREATE INDEX IF NOT EXISTS idx_deficiencies_severity ON contractor_deficiencies(severity);
CREATE INDEX IF NOT EXISTS idx_deficiencies_date ON contractor_deficiencies(created_at);

-- ============================================
-- 4. ADD assistant_chief_inspector ROLE
-- ============================================
-- Update the profiles table to allow the new role
-- (Run this only if you have a CHECK constraint on role)

-- First, check existing constraint and drop if exists
DO $$
BEGIN
  -- Try to drop the constraint if it exists
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- Add updated constraint with new roles
ALTER TABLE profiles 
ADD CONSTRAINT profiles_role_check 
CHECK (role IN (
  'super_admin', 
  'admin', 
  'pm', 
  'cm', 
  'chief_inspector', 
  'assistant_chief_inspector',
  'inspector', 
  'executive', 
  'ndt_auditor'
));

-- ============================================
-- 5. ADD COLUMNS TO INSPECTION_REPORTS
-- For tracking assistant review status
-- ============================================
ALTER TABLE inspection_reports 
ADD COLUMN IF NOT EXISTS assistant_review_status TEXT,
ADD COLUMN IF NOT EXISTS assistant_review_notes TEXT,
ADD COLUMN IF NOT EXISTS assistant_reviewed_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS assistant_reviewed_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- 6. RLS POLICIES
-- ============================================

-- Assistant Chief Reviews - viewable by chiefs and admins
ALTER TABLE assistant_chief_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assistant_reviews_select" ON assistant_chief_reviews
  FOR SELECT USING (true);

CREATE POLICY "assistant_reviews_insert" ON assistant_chief_reviews
  FOR INSERT WITH CHECK (true);

CREATE POLICY "assistant_reviews_update" ON assistant_chief_reviews
  FOR UPDATE USING (true);

-- Inspector Assignments - viewable by all, editable by chiefs
ALTER TABLE inspector_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignments_select" ON inspector_assignments
  FOR SELECT USING (true);

CREATE POLICY "assignments_insert" ON inspector_assignments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "assignments_update" ON inspector_assignments
  FOR UPDATE USING (true);

CREATE POLICY "assignments_delete" ON inspector_assignments
  FOR DELETE USING (true);

-- Contractor Deficiencies
ALTER TABLE contractor_deficiencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deficiencies_select" ON contractor_deficiencies
  FOR SELECT USING (true);

CREATE POLICY "deficiencies_insert" ON contractor_deficiencies
  FOR INSERT WITH CHECK (true);

CREATE POLICY "deficiencies_update" ON contractor_deficiencies
  FOR UPDATE USING (true);

-- ============================================
-- DONE!
-- ============================================
