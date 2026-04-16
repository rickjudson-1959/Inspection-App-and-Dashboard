-- Add revision tracking to kmz_uploads
ALTER TABLE kmz_uploads ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE kmz_uploads ADD COLUMN IF NOT EXISTS revision INTEGER DEFAULT 0;
ALTER TABLE kmz_uploads ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true;
