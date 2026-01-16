-- Fix existing user's role if they were invited before the role mapping fix
-- Replace 'user@example.com' with the actual email address

UPDATE user_profiles
SET role = 'chief_inspector', user_role = 'chief_inspector'
WHERE email = 'user@example.com' 
  AND (role = 'chief' OR role = 'inspector');

-- Verify the change
SELECT email, full_name, role, user_role
FROM user_profiles
WHERE email = 'user@example.com';
