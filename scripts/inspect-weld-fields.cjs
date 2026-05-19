/**
 * One-off diagnostic: dump weld-related fields from specific
 * daily_reports rows. Used to map the actual shape of weldData and
 * any other weld-count carrying fields on activity blocks.
 *
 * Usage: node scripts/inspect-weld-fields.cjs [reportId ...]
 *   (defaults to 2088 and 2058 if no args)
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://aatvckalnvojlykfgnmz.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdHZja2FsbnZvamx5a2Znbm16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI4MzczOSwiZXhwIjoyMDc5ODU5NzM5fQ.RvL9s8UpoKIof6D8AA2e81QL7ENVQi6LELhDj3n1Ryw'

const ids = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['2088', '2058']

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

;(async () => {
  for (const id of ids) {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('id, date, inspector_name, activity_blocks')
      .eq('id', id)
      .maybeSingle()

    console.log(`\n========================================`)
    console.log(`Report ${id}`)
    console.log(`========================================`)

    if (error) { console.error('  Query error:', error.message); continue }
    if (!data)  { console.error(`  No row for id=${id}`); continue }

    console.log(`  date=${data.date}  inspector=${data.inspector_name}`)
    const blocks = data.activity_blocks || []
    console.log(`  ${blocks.length} block(s)`)

    blocks.forEach((b, idx) => {
      // Only report welding-flavoured blocks
      const isWeld = String(b.activityType || '').toLowerCase().includes('weld')
      if (!isWeld) return

      console.log(`\n--- block[${idx}] activityType="${b.activityType}" ---`)

      // List any top-level keys that look weld-related.
      const weldyKeys = Object.keys(b).filter(k => /weld|joint|counterbore|repair/i.test(k))
      console.log(`  top-level weld-related keys:`, weldyKeys)

      // Dump the full weldData and counterboreData (aggregateWeldingProgress reads both).
      console.log(`  weldData:`)
      console.log(JSON.stringify(b.weldData, null, 2)?.split('\n').map(l => '    ' + l).join('\n'))
      console.log(`  counterboreData:`)
      console.log(JSON.stringify(b.counterboreData, null, 2)?.split('\n').map(l => '    ' + l).join('\n'))

      // Direct top-level weld-count-ish fields (in case the form stores them at block level)
      const directCandidates = ['weldsToday', 'weldCount', 'weld_count', 'todayWelds', 'totalWelds', 'jointCount', 'jointsToday']
      const present = {}
      for (const k of directCandidates) if (k in b) present[k] = b[k]
      console.log(`  direct block-level candidates present:`, present)
    })
  }
})()
