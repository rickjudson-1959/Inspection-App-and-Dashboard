// ============================================================================
// DOCUMENT EMBEDDING GENERATOR
// February 2, 2026
//
// Generates vector embeddings from project documents for RAG-based analysis.
// Supports PDF and text files.
//
// Usage:
//   node scripts/generate-embeddings.cjs --dir ./documents --org-id <uuid>
//
// Required environment variables:
//   VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
// ============================================================================

const fs = require('fs')
const path = require('path')

// Read .env file
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1].trim()] = match[2].trim()
    }
  })
}

// Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

const CHUNK_SIZE = 1500        // Characters per chunk
const CHUNK_OVERLAP = 200      // Overlap between chunks
const EMBEDDING_MODEL = 'text-embedding-ada-002'

// Document category mapping based on filename patterns
const CATEGORY_PATTERNS = {
  'api.?1169': 'api_1169',
  'csa.?z662': 'csa_z662',
  'project.?spec': 'project_specs',
  'coating': 'coating_specs',
  'weld|wps': 'weld_procedures',
  'itp|inspection.?test': 'itp',
  'ndt|radiograph': 'ndt_procedures',
  'safety': 'safety_procedures',
  'backfill': 'backfill_specs',
  'trench': 'trenching_specs'
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function detectCategory(filename) {
  const lower = filename.toLowerCase()
  for (const [pattern, category] of Object.entries(CATEGORY_PATTERNS)) {
    if (new RegExp(pattern, 'i').test(lower)) {
      return category
    }
  }
  return 'project_document'
}

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = []
  let start = 0

  // Clean up the text
  text = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()

  while (start < text.length) {
    let end = start + chunkSize

    // Try to break at a sentence or paragraph boundary
    if (end < text.length) {
      const searchStart = Math.max(end - 100, start)
      const searchText = text.slice(searchStart, end + 100)

      // Look for sentence endings
      const sentenceMatch = searchText.match(/[.!?]\s+(?=[A-Z])/g)
      if (sentenceMatch) {
        const lastSentence = searchText.lastIndexOf(sentenceMatch[sentenceMatch.length - 1])
        if (lastSentence > 0) {
          end = searchStart + lastSentence + sentenceMatch[sentenceMatch.length - 1].length
        }
      }
    }

    const chunk = text.slice(start, end).trim()
    if (chunk.length > 50) {  // Only include substantial chunks
      chunks.push(chunk)
    }

    start = end - overlap
    if (start >= text.length - 50) break  // Avoid tiny final chunks
  }

  return chunks
}

async function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

async function readPdfFile(filePath) {
  // Try to use pdf-parse if available, otherwise fall back to basic extraction
  try {
    const pdfParse = require('pdf-parse')
    const dataBuffer = fs.readFileSync(filePath)
    const data = await pdfParse(dataBuffer)
    return data.text
  } catch (err) {
    console.log(`   Note: pdf-parse not installed. Run: npm install pdf-parse`)
    console.log(`   Skipping PDF: ${path.basename(filePath)}`)
    return null
  }
}

async function generateEmbedding(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000)  // OpenAI limit
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

async function insertEmbedding(supabaseUrl, serviceKey, record) {
  const response = await fetch(`${supabaseUrl}/rest/v1/document_embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(record)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Supabase insert error: ${response.status} - ${error}`)
  }
}

async function getOrganizations(supabaseUrl, serviceKey) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/organizations?select=id,name,slug&limit=50`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to fetch organizations: ${error}`)
  }

  return response.json()
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processDocument(filePath, organizationId) {
  const filename = path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()

  console.log(`\n   Processing: ${filename}`)

  // Read document content
  let content = null
  if (ext === '.pdf') {
    content = await readPdfFile(filePath)
  } else if (['.txt', '.md', '.text'].includes(ext)) {
    content = await readTextFile(filePath)
  } else {
    console.log(`   Skipping unsupported format: ${ext}`)
    return { chunks: 0, errors: 0 }
  }

  if (!content || content.trim().length < 100) {
    console.log(`   Skipping: No readable content`)
    return { chunks: 0, errors: 0 }
  }

  // Detect document category
  const category = detectCategory(filename)
  console.log(`   Category: ${category}`)

  // Chunk the document
  const chunks = chunkText(content)
  console.log(`   Chunks: ${chunks.length}`)

  // Generate embeddings and insert
  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    try {
      // Generate embedding
      const embedding = await generateEmbedding(chunk)

      // Insert into database
      await insertEmbedding(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        organization_id: organizationId,
        source_type: 'project_document',
        document_name: filename,
        document_category: category,
        chunk_index: i,
        chunk_text: chunk,
        embedding: embedding,
        metadata: {
          total_chunks: chunks.length,
          chunk_size: chunk.length,
          source_path: filePath
        }
      })

      successCount++
      process.stdout.write(`\r   Progress: ${i + 1}/${chunks.length} chunks`)

      // Rate limiting - OpenAI allows ~3000 RPM for ada-002
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (err) {
      errorCount++
      console.log(`\n   Error on chunk ${i}: ${err.message}`)
    }
  }

  console.log(`\n   Completed: ${successCount} chunks inserted, ${errorCount} errors`)
  return { chunks: successCount, errors: errorCount }
}

async function processDirectory(dirPath, organizationId) {
  console.log(`\nScanning directory: ${dirPath}`)

  const files = fs.readdirSync(dirPath)
  const supportedFiles = files.filter(f => {
    const ext = path.extname(f).toLowerCase()
    return ['.pdf', '.txt', '.md', '.text'].includes(ext)
  })

  console.log(`Found ${supportedFiles.length} supported files`)

  let totalChunks = 0
  let totalErrors = 0

  for (const file of supportedFiles) {
    const filePath = path.join(dirPath, file)
    const result = await processDocument(filePath, organizationId)
    totalChunks += result.chunks
    totalErrors += result.errors
  }

  return { totalChunks, totalErrors }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('DOCUMENT EMBEDDING GENERATOR')
  console.log('='.repeat(60))

  // Validate environment
  if (!SUPABASE_URL) {
    console.error('\nError: VITE_SUPABASE_URL not set in .env')
    process.exit(1)
  }
  if (!SUPABASE_SERVICE_KEY) {
    console.error('\nError: VITE_SUPABASE_SERVICE_ROLE_KEY not set in .env')
    console.error('You need the service role key (not anon key) to insert embeddings')
    process.exit(1)
  }
  if (!OPENAI_API_KEY) {
    console.error('\nError: OPENAI_API_KEY not set in .env')
    process.exit(1)
  }

  // Parse arguments
  const args = process.argv.slice(2)
  let dirPath = null
  let orgId = null
  let filePath = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      dirPath = args[++i]
    } else if (args[i] === '--file' && args[i + 1]) {
      filePath = args[++i]
    } else if (args[i] === '--org-id' && args[i + 1]) {
      orgId = args[++i]
    } else if (args[i] === '--help') {
      console.log(`
Usage:
  node scripts/generate-embeddings.cjs --dir <directory> --org-id <uuid>
  node scripts/generate-embeddings.cjs --file <file> --org-id <uuid>

Options:
  --dir <path>      Directory containing documents to process
  --file <path>     Single file to process
  --org-id <uuid>   Organization ID (required)
  --help            Show this help

Supported formats: .pdf, .txt, .md

Environment variables (in .env):
  VITE_SUPABASE_URL
  VITE_SUPABASE_SERVICE_ROLE_KEY
  OPENAI_API_KEY
`)
      process.exit(0)
    }
  }

  // If no org-id provided, list available organizations
  if (!orgId) {
    console.log('\nFetching available organizations...')
    try {
      const orgs = await getOrganizations(SUPABASE_URL, SUPABASE_SERVICE_KEY)
      if (orgs.length === 0) {
        console.log('No organizations found.')
      } else {
        console.log('\nAvailable organizations:')
        orgs.forEach(org => {
          console.log(`  ${org.id}  ${org.name} (${org.slug})`)
        })
        console.log('\nRe-run with --org-id <uuid> to specify the organization.')
      }
    } catch (err) {
      console.error('Error fetching organizations:', err.message)
    }
    process.exit(1)
  }

  if (!dirPath && !filePath) {
    console.error('\nError: Specify --dir <directory> or --file <file>')
    console.log('Run with --help for usage information')
    process.exit(1)
  }

  console.log(`\nConfiguration:`)
  console.log(`  Supabase URL: ${SUPABASE_URL}`)
  console.log(`  Organization: ${orgId}`)
  console.log(`  Chunk size: ${CHUNK_SIZE} chars`)
  console.log(`  Overlap: ${CHUNK_OVERLAP} chars`)
  console.log(`  Embedding model: ${EMBEDDING_MODEL}`)

  // Process
  const startTime = Date.now()

  if (filePath) {
    if (!fs.existsSync(filePath)) {
      console.error(`\nError: File not found: ${filePath}`)
      process.exit(1)
    }
    const result = await processDocument(filePath, orgId)
    console.log(`\n${'='.repeat(60)}`)
    console.log(`COMPLETE: ${result.chunks} chunks, ${result.errors} errors`)
  } else {
    if (!fs.existsSync(dirPath)) {
      console.error(`\nError: Directory not found: ${dirPath}`)
      process.exit(1)
    }
    const result = await processDirectory(dirPath, orgId)
    console.log(`\n${'='.repeat(60)}`)
    console.log(`COMPLETE: ${result.totalChunks} total chunks, ${result.totalErrors} errors`)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`Time: ${elapsed}s`)
}

main().catch(err => {
  console.error('\nFatal error:', err.message)
  process.exit(1)
})
