-- Add subsistence (SUBS) column to labour_rates — Column Y from rate sheet
ALTER TABLE labour_rates ADD COLUMN IF NOT EXISTS rate_subs NUMERIC(10,2) DEFAULT 0;
