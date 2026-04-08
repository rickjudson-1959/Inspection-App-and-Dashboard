-- Add rate_type column to labour_rates and equipment_rates
-- Values: 'weekly' (salaried/office/foremen), 'hourly' (Red Book field workers), 'daily' (equipment)

ALTER TABLE labour_rates ADD COLUMN IF NOT EXISTS rate_type TEXT DEFAULT 'hourly';
ALTER TABLE equipment_rates ADD COLUMN IF NOT EXISTS rate_type TEXT DEFAULT 'daily';

-- Backfill existing labour rates: anything with ST rate >= 100 is weekly (salaried)
UPDATE labour_rates SET rate_type = 'weekly' WHERE rate_st >= 100;
UPDATE labour_rates SET rate_type = 'hourly' WHERE rate_st < 100;

-- All equipment is daily
UPDATE equipment_rates SET rate_type = 'daily';
