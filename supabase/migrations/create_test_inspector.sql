-- Create a test inspector profile for testing timesheets
-- This gives you an inspector you can select when creating timesheets

-- First, you need to find the user_id of an inspector in your system
-- Replace 'YOUR_INSPECTOR_EMAIL@example.com' with an actual inspector email from your user_profiles table

-- Option 1: Create a standalone test inspector (not linked to a user account)
INSERT INTO inspector_profiles (
  id,
  company_name,
  company_address,
  company_city,
  company_province,
  company_postal_code,
  company_phone,
  company_email,
  profile_complete,
  cleared_to_work,
  created_at
) VALUES (
  gen_random_uuid(),
  'Test Inspector Company Ltd.',
  '123 Main Street',
  'Calgary',
  'Alberta',
  'T2P 1H9',
  '403-555-1234',
  'inspector@test.com',
  true,
  true,  -- This is CRITICAL - must be true to show up in timesheet dropdown
  NOW()
);

-- Option 2: Link to an existing user (if you have an inspector user account)
-- First, find the user_id:
-- SELECT id, email FROM user_profiles WHERE role = 'inspector';
-- Then uncomment and run this (replace the user_id):

/*
INSERT INTO inspector_profiles (
  id,
  user_id,
  company_name,
  company_address,
  company_city,
  company_province,
  company_postal_code,
  company_phone,
  company_email,
  profile_complete,
  cleared_to_work,
  created_at
) VALUES (
  gen_random_uuid(),
  'PASTE_USER_ID_HERE',  -- Replace with actual UUID from user_profiles
  'John Smith Inspection Services',
  '456 Industrial Blvd',
  'Edmonton',
  'Alberta',
  'T5J 2R9',
  '780-555-9876',
  'john.smith@inspections.ca',
  true,
  true,
  NOW()
);
*/

-- Create a default rate card for the test inspector
-- First get the inspector_profile_id we just created
INSERT INTO inspector_rate_cards (
  inspector_profile_id,
  daily_field_rate,
  per_diem_rate,
  meal_allowance,
  truck_rate,
  km_rate,
  km_threshold,
  electronics_rate,
  mob_demob_km_max,
  effective_from,
  is_active
)
SELECT 
  id,
  900.00,   -- Daily field rate
  180.00,   -- Per diem
  70.00,    -- Meal allowance
  160.00,   -- Truck rate
  1.10,     -- KM rate
  150,      -- KM threshold
  15.00,    -- Electronics
  500,      -- Mob/Demob KM max
  CURRENT_DATE,
  true
FROM inspector_profiles 
WHERE company_name = 'Test Inspector Company Ltd.'
LIMIT 1;

-- Verify it was created
SELECT 
  ip.id,
  ip.company_name,
  ip.company_city,
  ip.cleared_to_work,
  rc.daily_field_rate
FROM inspector_profiles ip
LEFT JOIN inspector_rate_cards rc ON rc.inspector_profile_id = ip.id
WHERE ip.company_name = 'Test Inspector Company Ltd.';
