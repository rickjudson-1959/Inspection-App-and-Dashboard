-- =====================================================
-- RESET INSPECTOR INVOICING TABLES
-- =====================================================
-- WARNING: This will DELETE ALL DATA in these tables!
-- Use this script to reset the tables when the schema needs to change

-- Drop all policies first
DROP POLICY IF EXISTS "Admins can view all profiles" ON inspector_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON inspector_profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON inspector_profiles;
DROP POLICY IF EXISTS "Admins can view all documents" ON inspector_documents;
DROP POLICY IF EXISTS "Admins can insert documents" ON inspector_documents;
DROP POLICY IF EXISTS "Admins can view rate cards" ON inspector_rate_cards;
DROP POLICY IF EXISTS "Admins can manage rate cards" ON inspector_rate_cards;
DROP POLICY IF EXISTS "Admins can view all timesheets" ON inspector_timesheets;
DROP POLICY IF EXISTS "Admins can insert timesheets" ON inspector_timesheets;
DROP POLICY IF EXISTS "Admins can update timesheets" ON inspector_timesheets;
DROP POLICY IF EXISTS "Admins can view timesheet lines" ON inspector_timesheet_lines;
DROP POLICY IF EXISTS "Admins can insert timesheet lines" ON inspector_timesheet_lines;
DROP POLICY IF EXISTS "Admins can update timesheet lines" ON inspector_timesheet_lines;

-- Drop existing tables (cascades will handle foreign keys)
DROP TABLE IF EXISTS inspector_timesheet_lines CASCADE;
DROP TABLE IF EXISTS inspector_timesheets CASCADE;
DROP TABLE IF EXISTS inspector_rate_cards CASCADE;
DROP TABLE IF EXISTS inspector_documents CASCADE;
DROP TABLE IF EXISTS inspector_profiles CASCADE;

-- =====================================================
-- INSPECTOR PROFILES
-- =====================================================
CREATE TABLE inspector_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Company Information
  company_name TEXT,
  company_address TEXT,
  company_city TEXT,
  company_province TEXT,
  company_postal_code TEXT,
  company_phone TEXT,
  company_email TEXT,
  
  -- Banking Information (encrypted)
  bank_name TEXT,
  bank_transit TEXT,
  bank_institution TEXT,
  bank_account TEXT,
  
  -- Contact Information
  primary_contact_name TEXT,
  primary_contact_phone TEXT,
  primary_contact_email TEXT,
  
  -- Status
  profile_complete BOOLEAN DEFAULT FALSE,
  cleared_to_work BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE inspector_profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view all profiles" ON inspector_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

CREATE POLICY "Admins can insert profiles" ON inspector_profiles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

CREATE POLICY "Admins can update profiles" ON inspector_profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

-- =====================================================
-- INSPECTOR DOCUMENTS
-- =====================================================
CREATE TABLE inspector_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspector_profile_id UUID REFERENCES inspector_profiles(id) ON DELETE CASCADE,
  
  -- Document Information
  document_type TEXT NOT NULL,
  document_name TEXT,
  document_url TEXT,
  document_number TEXT,
  
  -- Dates
  issue_date DATE,
  expiry_date DATE,
  
  -- Status
  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE inspector_documents ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view all documents" ON inspector_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

CREATE POLICY "Admins can insert documents" ON inspector_documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

-- =====================================================
-- INSPECTOR RATE CARDS
-- =====================================================
CREATE TABLE inspector_rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspector_profile_id UUID REFERENCES inspector_profiles(id) ON DELETE CASCADE,
  
  -- Rate Information (all in CAD)
  daily_field_rate DECIMAL(10, 2),
  per_diem_rate DECIMAL(10, 2),
  meal_allowance DECIMAL(10, 2),
  truck_rate DECIMAL(10, 2),
  km_rate DECIMAL(10, 4),
  km_threshold INTEGER DEFAULT 150,
  electronics_rate DECIMAL(10, 2),
  mob_demob_km_max INTEGER DEFAULT 500,
  
  -- Effective Dates
  effective_from DATE NOT NULL,
  effective_to DATE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE inspector_rate_cards ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view rate cards" ON inspector_rate_cards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

CREATE POLICY "Admins can manage rate cards" ON inspector_rate_cards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

-- =====================================================
-- INSPECTOR TIMESHEETS
-- =====================================================
CREATE TABLE inspector_timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspector_profile_id UUID REFERENCES inspector_profiles(id) ON DELETE CASCADE,
  rate_card_id UUID REFERENCES inspector_rate_cards(id),
  
  -- Period Information
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type TEXT DEFAULT 'biweekly',
  project_name TEXT,
  client_name TEXT,
  spread_name TEXT,
  
  -- Summary Totals (calculated from line items)
  total_field_days INTEGER DEFAULT 0,
  total_per_diem_days INTEGER DEFAULT 0,
  total_meals_only_days INTEGER DEFAULT 0,
  total_truck_days INTEGER DEFAULT 0,
  total_kms INTEGER DEFAULT 0,
  total_excess_kms INTEGER DEFAULT 0,
  total_electronics_days INTEGER DEFAULT 0,
  has_mobilization BOOLEAN DEFAULT FALSE,
  has_demobilization BOOLEAN DEFAULT FALSE,
  total_amount DECIMAL(10, 2) DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'draft',
  
  -- Workflow
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id),
  
  -- Notes
  notes TEXT,
  admin_notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE inspector_timesheets ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view all timesheets" ON inspector_timesheets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

CREATE POLICY "Admins can insert timesheets" ON inspector_timesheets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

CREATE POLICY "Admins can update timesheets" ON inspector_timesheets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

-- =====================================================
-- INSPECTOR TIMESHEET LINES
-- =====================================================
CREATE TABLE inspector_timesheet_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id UUID REFERENCES inspector_timesheets(id) ON DELETE CASCADE,
  daily_ticket_id BIGINT REFERENCES daily_tickets(id),
  
  -- Line Information
  work_date DATE NOT NULL,
  work_description TEXT,
  
  -- Day type flags
  is_field_day BOOLEAN DEFAULT FALSE,
  is_per_diem BOOLEAN DEFAULT FALSE,
  is_meals_only BOOLEAN DEFAULT FALSE,
  is_truck_day BOOLEAN DEFAULT FALSE,
  is_electronics BOOLEAN DEFAULT FALSE,
  is_mobilization BOOLEAN DEFAULT FALSE,
  is_demobilization BOOLEAN DEFAULT FALSE,
  
  -- Kilometers
  total_kms INTEGER DEFAULT 0,
  excess_kms INTEGER DEFAULT 0,
  
  -- Tracking
  auto_populated BOOLEAN DEFAULT FALSE,
  manually_adjusted BOOLEAN DEFAULT FALSE,
  line_order INTEGER,
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE inspector_timesheet_lines ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view timesheet lines" ON inspector_timesheet_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

CREATE POLICY "Admins can insert timesheet lines" ON inspector_timesheet_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

CREATE POLICY "Admins can update timesheet lines" ON inspector_timesheet_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'admin', 'chief_inspector')
    )
  );

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX idx_inspector_profiles_user_id ON inspector_profiles(user_id);
CREATE INDEX idx_inspector_documents_profile_id ON inspector_documents(inspector_profile_id);
CREATE INDEX idx_inspector_documents_expiry ON inspector_documents(expiry_date);
CREATE INDEX idx_inspector_timesheets_profile_id ON inspector_timesheets(inspector_profile_id);
CREATE INDEX idx_inspector_timesheets_status ON inspector_timesheets(status);
CREATE INDEX idx_inspector_timesheets_period ON inspector_timesheets(period_start, period_end);
CREATE INDEX idx_inspector_timesheet_lines_timesheet_id ON inspector_timesheet_lines(timesheet_id);
CREATE INDEX idx_inspector_timesheet_lines_date ON inspector_timesheet_lines(work_date);
CREATE INDEX idx_inspector_rate_cards_profile_id ON inspector_rate_cards(inspector_profile_id);
