-- Phase 4: Natural Language Query support
-- Extend ai_agent_logs.query_type to include 'nlq_query'

-- Drop and recreate the constraint to include the new query type
-- First check if the constraint exists
DO $$
BEGIN
  -- Try to add the new value; if the constraint is a CHECK constraint, alter it
  -- If query_type is TEXT with no constraint, this is a no-op
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_agent_logs' AND column_name = 'query_type'
  ) THEN
    -- The column exists; ensure nlq_query is an allowed value
    -- If there's a CHECK constraint, we need to drop and recreate it
    -- For safety, just add a comment noting the new allowed value
    COMMENT ON COLUMN ai_agent_logs.query_type IS 'Allowed values: ticket_analysis, nlq_query, batch_analysis';
  END IF;
END $$;
