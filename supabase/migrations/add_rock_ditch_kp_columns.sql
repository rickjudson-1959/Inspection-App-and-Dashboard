-- Add From KP and To KP columns to Rock Ditch section
-- Run this after the initial create_trench_logs.sql migration

ALTER TABLE trench_logs
ADD COLUMN IF NOT EXISTS rock_ditch_from_kp VARCHAR(20),
ADD COLUMN IF NOT EXISTS rock_ditch_to_kp VARCHAR(20);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Added rock_ditch_from_kp and rock_ditch_to_kp columns to trench_logs';
END $$;
