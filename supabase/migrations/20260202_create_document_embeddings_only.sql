-- ============================================================================
-- DOCUMENT EMBEDDINGS TABLE ONLY
-- February 2, 2026
-- Creates only the document_embeddings table and match_documents function
-- ============================================================================

-- Enable pgvector extension (required for vector type)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document_embeddings table
CREATE TABLE IF NOT EXISTS document_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'project_document',
  source_id UUID,
  source_url TEXT,
  document_name TEXT NOT NULL,
  document_category TEXT,
  chunk_index INTEGER DEFAULT 0,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_embeddings_org ON document_embeddings(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_category ON document_embeddings(document_category);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_source ON document_embeddings(source_id);

-- RLS
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org embeddings" ON document_embeddings;
CREATE POLICY "Users can view their org embeddings" ON document_embeddings FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "Service role can manage embeddings" ON document_embeddings;
CREATE POLICY "Service role can manage embeddings" ON document_embeddings FOR ALL
  USING (auth.role() = 'service_role');

-- Vector search function
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

-- Done
SELECT 'document_embeddings table and match_documents function created successfully' AS status;
