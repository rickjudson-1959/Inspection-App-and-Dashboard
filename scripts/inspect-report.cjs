/**
 * One-off: fetch a daily_reports row by id and dump its activity_blocks
 * so we can confirm the exact field names (metres, KP, activity type).
 *
 * Usage: node scripts/inspect-report.cjs [reportId]   (default 2058)
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://aatvckalnvojlykfgnmz.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdHZja2FsbnZvamx5a2Znbm16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI4MzczOSwiZXhwIjoyMDc5ODU5NzM5fQ.RvL9s8UpoKIof6D8AA2e81QL7ENVQi6LELhDj3n1Ryw'

const reportId = process.argv[2] || '2058'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

;(async () => {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('id, date, inspector_name, spread, activity_blocks')
    .eq('id', reportId)
    .maybeSingle()

  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }

  if (!data) {
    console.error(`No daily_reports row with id=${reportId}`)
    process.exit(2)
  }

  console.log('=== Report meta ===')
  console.log({ id: data.id, date: data.date, inspector: data.inspector_name, spread: data.spread })
  console.log()

  const blocks = data.activity_blocks || []
  console.log(`=== activity_blocks: ${blocks.length} block(s) ===`)
  console.log(JSON.stringify(blocks, null, 2))

  if (blocks.length > 0) {
    console.log()
    console.log('=== First block — top-level keys ===')
    console.log(Object.keys(blocks[0]).sort())
  }
})()
