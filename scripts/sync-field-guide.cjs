/**
 * sync-field-guide.cjs
 * Uploads the field guide markdown to Supabase storage and triggers
 * the process-document edge function to regenerate vector embeddings.
 *
 * The AI mentor agent reads from embeddings, not the local file.
 * This script bridges local edits → live agent knowledge.
 *
 * Usage: node scripts/sync-field-guide.cjs
 *
 * Reads from .env.local and .env (local takes precedence):
 *   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const FIELD_GUIDE_PATH = path.join(PROJECT_ROOT, 'pipe-up-field-guide-agent-kb.md')
const GLOBAL_ORG_ID = '00000000-0000-0000-0000-000000000001'
const STORAGE_BUCKET = 'documents'
const STORAGE_PATH = 'technical-library/field_guide/pipe-up-field-guide-agent-kb.md'

function loadEnv() {
  const vars = {}
  // Read .env first, then .env.local (local wins)
  for (const file of ['.env', '.env.local']) {
    const envPath = path.join(PROJECT_ROOT, file)
    if (!fs.existsSync(envPath)) continue
    const content = fs.readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/)
      if (match) vars[match[1]] = match[2]
    }
  }
  return vars
}

async function main() {
  const env = loadEnv()
  const supabaseUrl = env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    console.error('❌ Missing VITE_SUPABASE_URL in .env or .env.local')
    process.exit(1)
  }
  if (!serviceRoleKey || serviceRoleKey.length < 100) {
    console.error('❌ Missing or invalid SUPABASE_SERVICE_ROLE_KEY (must be a JWT)')
    process.exit(1)
  }

  if (!fs.existsSync(FIELD_GUIDE_PATH)) {
    console.error(`❌ Field guide not found: ${FIELD_GUIDE_PATH}`)
    process.exit(1)
  }

  const content = fs.readFileSync(FIELD_GUIDE_PATH, 'utf-8')
  console.log(`📄 Field guide: ${content.length} chars, ${content.split('\n').length} lines`)

  // --- Step 1: Upload to Supabase storage (upsert) ---
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${STORAGE_PATH}`
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
      'Content-Type': 'text/markdown',
      'x-upsert': 'true',
    },
    body: content,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    console.error(`❌ Storage upload failed: ${uploadRes.status} — ${err}`)
    process.exit(1)
  }
  console.log('✅ Uploaded to storage')

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${STORAGE_PATH}`

  // --- Step 2: Find or create project_documents record ---
  const restHeaders = {
    'Authorization': `Bearer ${serviceRoleKey}`,
    'apikey': serviceRoleKey,
    'Content-Type': 'application/json',
  }

  const findRes = await fetch(
    `${supabaseUrl}/rest/v1/project_documents?category=eq.field_guide&is_global=eq.true&select=id,version_number`,
    { headers: restHeaders }
  )
  const existing = await findRes.json()

  let documentId

  if (existing.length > 0) {
    documentId = existing[0].id
    const newVersion = (existing[0].version_number || 0) + 1

    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/project_documents?id=eq.${documentId}`,
      {
        method: 'PATCH',
        headers: { ...restHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          file_url: publicUrl,
          file_name: 'pipe-up-field-guide-agent-kb.md',
          version_number: newVersion,
          updated_at: new Date().toISOString(),
        }),
      }
    )
    if (!updateRes.ok) {
      console.error(`❌ Document update failed: ${await updateRes.text()}`)
      process.exit(1)
    }
    console.log(`✅ Updated document record (v${newVersion})`)
  } else {
    const createRes = await fetch(
      `${supabaseUrl}/rest/v1/project_documents`,
      {
        method: 'POST',
        headers: { ...restHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          organization_id: GLOBAL_ORG_ID,
          category: 'field_guide',
          file_name: 'pipe-up-field-guide-agent-kb.md',
          file_url: publicUrl,
          is_global: true,
          is_current: true,
          version_number: 1,
        }),
      }
    )
    if (!createRes.ok) {
      console.error(`❌ Document create failed: ${await createRes.text()}`)
      process.exit(1)
    }
    const created = await createRes.json()
    documentId = created[0].id
    console.log('✅ Created document record (v1)')
  }

  // --- Step 3: Trigger process-document edge function ---
  console.log('⏳ Generating embeddings (this may take 30–60s)...')

  const processRes = await fetch(
    `${supabaseUrl}/functions/v1/process-document`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_id: documentId,
        organization_id: GLOBAL_ORG_ID,
      }),
    }
  )

  if (!processRes.ok) {
    const err = await processRes.text()
    console.error(`❌ process-document failed: ${processRes.status} — ${err}`)
    process.exit(1)
  }

  const result = await processRes.json()
  console.log(`✅ Embeddings: ${result.chunks_processed} chunks from ${result.text_length} chars`)
  console.log('🎉 Field guide synced — AI agent will now reference the updated content')
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
