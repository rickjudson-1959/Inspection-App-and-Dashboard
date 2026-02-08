-- Update valid_role constraint to include all roles
-- Drop the existing constraint and recreate with all valid roles

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS valid_role;

ALTER TABLE user_profiles ADD CONSTRAINT valid_role CHECK (
  role IN (
    'inspector',
    'asst_chief',
    'assistant_chief',
    'assistant_chief_inspector',
    'chief_inspector',
    'chief',
    'welding_chief',
    'ndt_auditor',
    'cm',
    'pm',
    'executive',
    'admin',
    'super_admin'
  )
);

COMMENT ON CONSTRAINT valid_role ON user_profiles IS 'Restricts role column to valid role values';
