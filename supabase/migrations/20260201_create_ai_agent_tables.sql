-- ============================================================================
-- AI AGENT INFRASTRUCTURE
-- February 1, 2026
-- Phase 1: Database tables for AI analysis logging and RAG embeddings
-- ============================================================================

-- ============================================================================
-- 1. AI AGENT LOGS TABLE
-- Tracks all AI analysis queries, flags raised, and results
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_agent_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Query metadata
  query_type TEXT NOT NULL DEFAULT 'ticket_analysis',
  trigger_source TEXT NOT NULL DEFAULT 'manual',

  -- Input references
  ticket_ids UUID[] DEFAULT '{}',
  date_range_start DATE,
  date_range_end DATE,

  -- AI interaction
  model_used TEXT DEFAULT 'claude-sonnet-4-20250514',
  tokens_input INTEGER,
  tokens_output INTEGER,

  -- Response - stores flags and analysis results
  analysis_result JSONB NOT NULL DEFAULT '{}',
  /*
    analysis_result structure:
    {
      "flags": [
        {
          "type": "HOURS_EXCEEDED" | "KP_OUT_OF_BOUNDS" | "LOW_EFFICIENCY" | "CHAINAGE_GAP" | "LABOUR_ANOMALY",
          "severity": "critical" | "warning" | "info",
          "ticket_id": "uuid",
          "activity_block_index": 0,
          "message": "...",
          "details": {...}
        }
      ],
      "summary": "AI-generated narrative summary",
      "metrics": {
        "tickets_analyzed": 5,
        "flags_raised": 3,
        "efficiency_score": 87.5
      }
    }
  */

  flags_raised INTEGER DEFAULT 0,
  flags_by_severity JSONB DEFAULT '{"critical": 0, "warning": 0, "info": 0}',

  -- Status tracking
  status TEXT DEFAULT 'completed',
  error_message TEXT,
  processing_duration_ms INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Add check constraints
DO $$ BEGIN
  ALTER TABLE ai_agent_logs ADD CONSTRAINT chk_query_type
    CHECK (query_type IN ('ticket_analysis', 'rag_query', 'compliance_check', 'efficiency_audit'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ai_agent_logs ADD CONSTRAINT chk_trigger_source
    CHECK (trigger_source IN ('webhook', 'cron', 'manual', 'realtime'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ai_agent_logs ADD CONSTRAINT chk_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_org_status
  ON ai_agent_logs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_created
  ON ai_agent_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_query_type
  ON ai_agent_logs(query_type);
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_org_created
  ON ai_agent_logs(organization_id, created_at DESC);

-- RLS Policies
ALTER TABLE ai_agent_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org AI logs" ON ai_agent_logs;
CREATE POLICY "Users can view their org AI logs"
  ON ai_agent_logs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Service role can manage AI logs" ON ai_agent_logs;
CREATE POLICY "Service role can manage AI logs"
  ON ai_agent_logs FOR ALL
  USING (auth.role() = 'service_role');

-- Allow admins to insert logs (for manual triggers from frontend)
DROP POLICY IF EXISTS "Admins can insert AI logs" ON ai_agent_logs;
CREATE POLICY "Admins can insert AI logs"
  ON ai_agent_logs FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'cm', 'pm')
    )
  );


-- ============================================================================
-- 2. ENABLE PGVECTOR EXTENSION
-- Required for vector similarity search (RAG)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================================
-- 3. DOCUMENT EMBEDDINGS TABLE
-- Stores vectorized chunks of project documents for RAG queries
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Source document reference
  source_type TEXT NOT NULL DEFAULT 'project_document',
  source_id UUID,  -- References project_documents.id or other source tables
  source_url TEXT,

  -- Content metadata
  document_name TEXT NOT NULL,
  document_category TEXT,  -- 'itp', 'weld_procedures', 'project_specs', 'api_1169', etc.
  chunk_index INTEGER DEFAULT 0,
  chunk_text TEXT NOT NULL,

  -- Vector embedding (1536 dimensions for OpenAI ada-002 compatibility)
  embedding vector(1536),

  -- Metadata for filtering and context
  metadata JSONB DEFAULT '{}',
  /*
    metadata structure:
    {
      "section": "Section 5.2",
      "page_number": 45,
      "tags": ["welding", "quality", "repair"],
      "version": "Rev 2"
    }
  */

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add check constraint for source_type
DO $$ BEGIN
  ALTER TABLE document_embeddings ADD CONSTRAINT chk_source_type
    CHECK (source_type IN ('project_document', 'contract_config', 'spec_sheet', 'procedure', 'reference_book'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Unique constraint per chunk
DO $$ BEGIN
  ALTER TABLE document_embeddings ADD CONSTRAINT unique_source_chunk
    UNIQUE (source_id, chunk_index);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Vector similarity search index (IVFFlat for performance)
-- Note: This index is best created after initial data load
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector
  ON document_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Standard indexes
CREATE INDEX IF NOT EXISTS idx_document_embeddings_org
  ON document_embeddings(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_category
  ON document_embeddings(document_category);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_source
  ON document_embeddings(source_id);

-- RLS Policies
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org embeddings" ON document_embeddings;
CREATE POLICY "Users can view their org embeddings"
  ON document_embeddings FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Service role can manage embeddings" ON document_embeddings;
CREATE POLICY "Service role can manage embeddings"
  ON document_embeddings FOR ALL
  USING (auth.role() = 'service_role');


-- ============================================================================
-- 4. HELPER FUNCTION FOR VECTOR SIMILARITY SEARCH
-- ============================================================================

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_org_id uuid DEFAULT NULL,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_name text,
  document_category text,
  chunk_text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.document_name,
    de.document_category,
    de.chunk_text,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM document_embeddings de
  WHERE
    (filter_org_id IS NULL OR de.organization_id = filter_org_id)
    AND (filter_category IS NULL OR de.document_category = filter_category)
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
