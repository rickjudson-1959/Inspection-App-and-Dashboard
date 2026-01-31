-- Multi-Tenant Architecture: Default Organization and User Backfill
-- This creates the default organization and migrates existing users to memberships
-- Part 2 of multi-tenant migration series

-- =====================================================
-- CREATE DEFAULT ORGANIZATION
-- =====================================================
INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- MIGRATE EXISTING USERS TO MEMBERSHIPS
-- =====================================================
-- This takes existing user_profiles.organization_id relationships
-- and creates corresponding membership records

INSERT INTO memberships (user_id, organization_id, role, is_default)
SELECT
  id as user_id,
  COALESCE(organization_id, '00000000-0000-0000-0000-000000000001') as organization_id,
  COALESCE(role, 'member') as role,
  true as is_default
FROM user_profiles
WHERE id IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- =====================================================
-- VERIFY MIGRATION
-- =====================================================
-- This block logs the migration results for verification
DO $$
DECLARE
  user_count INTEGER;
  membership_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM user_profiles;
  SELECT COUNT(*) INTO membership_count FROM memberships;

  RAISE NOTICE 'Migration complete: % users, % memberships created', user_count, membership_count;
END $$;
