-- Add per-person subsistence override to personnel_roster
-- Nullable: when NULL, falls back to labour_rates.rate_subs for the classification
ALTER TABLE personnel_roster ADD COLUMN IF NOT EXISTS rate_subs_override NUMERIC DEFAULT NULL;

-- Set overrides for specific personnel
UPDATE personnel_roster SET rate_subs_override = 230 WHERE lower(employee_name) = lower('Allan Van Wallegham');
UPDATE personnel_roster SET rate_subs_override = 85 WHERE lower(employee_name) = lower('Julie Tolley');
