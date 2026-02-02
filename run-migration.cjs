// Run migration via Supabase SQL API
const fs = require('fs')
const path = require('path')

// Read .env
const envPath = path.join(__dirname, '.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) env[match[1].trim()] = match[2].trim()
})

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_KEY = env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY

async function runMigration() {
  console.log('Running document_embeddings migration...\n')

  const sql = `
-- Enable pgvector extension
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
`

  // Try using the rpc endpoint to run raw SQL (requires service role)
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({ sql })
  })

  if (response.ok) {
    console.log('Migration successful!')
    return
  }

  // If rpc doesn't exist, we need to use dashboard
  const error = await response.text()
  console.log('Could not run migration via API.')
  console.log('Status:', response.status)
  console.log('Error:', error)
  console.log('\n' + '='.repeat(60))
  console.log('Please run the migration manually in Supabase Dashboard:')
  console.log('1. Go to: https://supabase.com/dashboard/project/aatvckalnvojlykfgnmz/sql')
  console.log('2. Copy and paste the SQL from:')
  console.log('   supabase/migrations/20260202_create_document_embeddings_only.sql')
  console.log('3. Click "Run"')
}

runMigration().catch(console.error)
