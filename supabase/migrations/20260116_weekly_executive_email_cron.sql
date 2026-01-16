-- Enable pg_cron extension for scheduled jobs
-- Note: This requires pg_cron to be enabled in Supabase dashboard
-- Go to: Database → Extensions → Enable "pg_cron"

-- Create a function to call the edge function via HTTP
CREATE OR REPLACE FUNCTION invoke_weekly_executive_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response text;
  supabase_url text := current_setting('app.settings.supabase_url', true);
  anon_key text := current_setting('app.settings.supabase_anon_key', true);
BEGIN
  -- Get the Supabase project URL from environment
  -- You'll need to replace this with your actual Supabase project URL
  IF supabase_url IS NULL THEN
    supabase_url := 'https://aatvckalnvojlykfgnmz.supabase.co';
  END IF;
  
  -- Call the edge function via HTTP
  SELECT content INTO response
  FROM http((
    'POST',
    supabase_url || '/functions/v1/send-weekly-executive-summary',
    ARRAY[
      http_header('Authorization', 'Bearer ' || COALESCE(anon_key, 'your-anon-key')),
      http_header('Content-Type', 'application/json')
    ],
    'application/json',
    '{}'
  )::http_request);
  
  RAISE NOTICE 'Weekly executive summary email triggered: %', response;
END;
$$;

-- Schedule the weekly email (every Monday at 9:00 AM UTC)
-- You can adjust the schedule as needed using cron syntax
SELECT cron.schedule(
  'weekly-executive-summary-email',
  '0 9 * * 1', -- Every Monday at 9:00 AM UTC
  $$SELECT invoke_weekly_executive_summary();$$
);

-- To unschedule later, run:
-- SELECT cron.unschedule('weekly-executive-summary-email');

-- To view scheduled jobs:
-- SELECT * FROM cron.job;
