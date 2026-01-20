-- Weather API Logging Table (OPTIONAL)
-- This table logs all weather API requests for debugging and monitoring
-- Run this in Supabase SQL Editor if you want request logging

-- Create the logging table
CREATE TABLE IF NOT EXISTS weather_api_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lat DECIMAL(10, 6) NOT NULL,
  lon DECIMAL(10, 6) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  cached BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying recent logs
CREATE INDEX IF NOT EXISTS idx_weather_logs_created_at 
ON weather_api_logs (created_at DESC);

-- Index for finding errors
CREATE INDEX IF NOT EXISTS idx_weather_logs_errors 
ON weather_api_logs (success, created_at DESC) 
WHERE success = false;

-- RLS Policy - Only service role can insert (Edge Function uses service role)
ALTER TABLE weather_api_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert
CREATE POLICY "Service role can insert weather logs"
ON weather_api_logs FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow authenticated users to read (for admin dashboard)
CREATE POLICY "Authenticated users can read weather logs"
ON weather_api_logs FOR SELECT
TO authenticated
USING (true);

-- Auto-cleanup: Delete logs older than 30 days (run periodically or via cron)
-- You can set up a Supabase cron job to run this daily:
-- SELECT cron.schedule('cleanup-weather-logs', '0 3 * * *', 
--   $$DELETE FROM weather_api_logs WHERE created_at < NOW() - INTERVAL '30 days'$$
-- );

-- View for monitoring (shows recent errors and success rate)
CREATE OR REPLACE VIEW weather_api_stats AS
SELECT 
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS total_requests,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successful,
  SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN cached THEN 1 ELSE 0 END) AS cache_hits,
  ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*), 2) AS success_rate
FROM weather_api_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- Grant access to the view
GRANT SELECT ON weather_api_stats TO authenticated;

COMMENT ON TABLE weather_api_logs IS 'Logs weather API requests for monitoring and debugging';
COMMENT ON VIEW weather_api_stats IS 'Hourly statistics for weather API usage';
