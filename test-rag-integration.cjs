// ============================================================================
// RAG INTEGRATION TEST SCRIPT
// Run with: node test-rag-integration.js
// ============================================================================

const fs = require('fs')
const path = require('path')

// Read .env file manually
const envPath = path.join(__dirname, '.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=')
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join('=').trim()
  }
})

const supabaseUrl = env.VITE_SUPABASE_URL
// Use service role key to bypass RLS for verification
const supabaseKey = env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

console.log(`Using ${env.VITE_SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE ROLE' : 'ANON'} key`)

// Simple fetch-based Supabase queries
async function query(table, options = {}) {
  const { select = '*', limit = 10, order, eq, count } = options

  let url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}`
  if (limit) url += `&limit=${limit}`
  if (order) url += `&order=${order}`
  if (eq) {
    Object.entries(eq).forEach(([k, v]) => {
      url += `&${k}=eq.${v}`
    })
  }

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  }
  if (count) headers['Prefer'] = 'count=exact'

  const response = await fetch(url, { headers })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${response.status}: ${text}`)
  }

  const data = await response.json()
  const totalCount = response.headers.get('content-range')?.split('/')[1]

  return { data, count: totalCount ? parseInt(totalCount) : data.length }
}

async function testRAGIntegration() {
  console.log('\n=== RAG INTEGRATION TEST ===\n')

  // 1. Check document_embeddings table
  console.log('1. Checking document_embeddings table...')
  try {
    const { data: embeddings, count } = await query('document_embeddings', {
      select: 'id,document_name,document_category,chunk_index',
      limit: 20,
      count: true
    })

    console.log(`   Found ${count || embeddings?.length || 0} document embeddings`)
    if (embeddings && embeddings.length > 0) {
      console.log('   Sample documents:')
      const categories = {}
      const docNames = new Set()
      embeddings.forEach(e => {
        categories[e.document_category] = (categories[e.document_category] || 0) + 1
        docNames.add(e.document_name)
      })
      Object.entries(categories).forEach(([cat, cnt]) => {
        console.log(`     - ${cat || 'uncategorized'}: ${cnt} chunks`)
      })
      console.log('   Document names:')
      Array.from(docNames).slice(0, 5).forEach(name => {
        console.log(`     - ${name}`)
      })
    } else {
      console.log('   ⚠️  No embeddings found - RAG will not work without document embeddings!')
    }
  } catch (err) {
    console.error('   ERROR:', err.message)
  }

  // 2. Check for recent daily tickets with coating data
  console.log('\n2. Checking for daily_tickets with measurable data...')
  try {
    const { data: tickets } = await query('daily_tickets', {
      select: 'id,date,spread,activity_blocks',
      order: 'date.desc',
      limit: 10
    })

    console.log(`   Found ${tickets?.length || 0} recent tickets`)
    let ticketsWithCoating = 0
    let ticketsWithWeld = 0

    if (tickets && tickets.length > 0) {
      tickets.forEach(t => {
        const blocks = t.activity_blocks || []
        blocks.forEach(b => {
          if (b.coatingData) ticketsWithCoating++
          if (b.weldData) ticketsWithWeld++
        })
      })
      console.log(`   - Tickets with coating data: ${ticketsWithCoating}`)
      console.log(`   - Tickets with weld data: ${ticketsWithWeld}`)

      // Show a sample
      const sample = tickets[0]
      console.log(`\n   Sample ticket: ${sample.date} | Spread: ${sample.spread || 'N/A'}`)
      if (sample.activity_blocks?.[0]) {
        const block = sample.activity_blocks[0]
        console.log(`     Activity: ${block.activityType || 'Unknown'}`)
        if (block.coatingData) {
          console.log(`     Coating: ${JSON.stringify(block.coatingData).slice(0, 100)}...`)
        }
      }
    }
  } catch (err) {
    console.error('   ERROR:', err.message)
  }

  // 3. Check for ai_agent_logs with RAG flags
  console.log('\n3. Checking ai_agent_logs for analyses...')
  try {
    const { data: logs } = await query('ai_agent_logs', {
      select: 'id,created_at,status,flags_raised,flags_by_severity,analysis_result',
      order: 'created_at.desc',
      limit: 5
    })

    console.log(`   Found ${logs?.length || 0} recent AI agent logs`)
    if (logs && logs.length > 0) {
      logs.forEach(l => {
        const date = new Date(l.created_at).toLocaleString()
        console.log(`     - ${date} | Status: ${l.status} | Flags: ${l.flags_raised}`)

        // Check for RAG-based flags
        const flags = l.analysis_result?.flags || []
        const ragFlags = flags.filter(f =>
          ['SPEC_VIOLATION', 'COATING_VIOLATION', 'PROCEDURE_VIOLATION'].includes(f.type)
        )
        if (ragFlags.length > 0) {
          console.log(`       ✓ Has ${ragFlags.length} RAG-based spec violations!`)
        }
      })
    }
  } catch (err) {
    console.error('   ERROR:', err.message)
  }

  // 4. Check wps_material_specs
  console.log('\n4. Checking wps_material_specs...')
  try {
    const { data: wps } = await query('wps_material_specs', {
      select: 'wps_number,wps_name,is_active',
      eq: { is_active: true },
      limit: 5
    })

    console.log(`   Found ${wps?.length || 0} active WPS specs`)
  } catch (err) {
    console.error('   ERROR:', err.message)
  }

  // Summary
  console.log('\n=== NEXT STEPS ===')
  console.log('1. If document_embeddings is empty:')
  console.log('   → Create an embedding generation script or use Supabase AI')
  console.log('   → Upload your Project Specs, API 1169, etc.')
  console.log('')
  console.log('2. Set OPENAI_API_KEY in Supabase Edge Function secrets:')
  console.log('   supabase secrets set OPENAI_API_KEY=sk-...')
  console.log('')
  console.log('3. Deploy the updated edge function:')
  console.log('   supabase functions deploy process-ticket-ai')
  console.log('')
  console.log('4. Test by triggering analysis from Admin Portal')
}

testRAGIntegration().catch(console.error)
