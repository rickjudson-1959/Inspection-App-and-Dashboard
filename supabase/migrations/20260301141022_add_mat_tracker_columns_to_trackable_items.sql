-- Add columns from MatTracker to trackable_items for mat consolidation
ALTER TABLE trackable_items ADD COLUMN IF NOT EXISTS mat_material TEXT;
ALTER TABLE trackable_items ADD COLUMN IF NOT EXISTS from_location TEXT;
ALTER TABLE trackable_items ADD COLUMN IF NOT EXISTS to_location TEXT;
ALTER TABLE trackable_items ADD COLUMN IF NOT EXISTS crew TEXT;
