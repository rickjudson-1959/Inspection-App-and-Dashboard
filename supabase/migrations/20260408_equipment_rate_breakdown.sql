-- Add base rate and parts allowance breakdown columns to equipment_rates
ALTER TABLE equipment_rates ADD COLUMN IF NOT EXISTS rate_base NUMERIC(10,2) DEFAULT 0;
ALTER TABLE equipment_rates ADD COLUMN IF NOT EXISTS rate_parts NUMERIC(10,2) DEFAULT 0;
