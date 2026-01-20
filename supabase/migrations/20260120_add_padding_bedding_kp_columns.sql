-- Add From KP and To KP columns to Padding/Bedding section
-- Also remove Rock Ditch and Extra Depth columns as they are now tracked in trackable_items
-- Run this after the initial create_trench_logs.sql migration

-- Add Padding/Bedding KP columns
ALTER TABLE trench_logs
ADD COLUMN IF NOT EXISTS padding_bedding_from_kp VARCHAR(20),
ADD COLUMN IF NOT EXISTS padding_bedding_to_kp VARCHAR(20);

-- Note: Rock Ditch and Extra Depth columns are kept for historical data
-- but are no longer populated from the UI (now tracked in trackable_items table)

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Added padding_bedding_from_kp and padding_bedding_to_kp columns to trench_logs';
END $$;
