/**
 * One-off: dump everything we know about a ticket's equipment data.
 * Used to diagnose "equipment shows on the inspector report but not
 * on the reconciliation panel" — finds the field name + count on
 * both the inspector side (daily_reports.activity_blocks[].equipmentEntries)
 * and the contractor side (contractor_lems.equipment_entries).
 *
 * Usage: node scripts/inspect-ticket-equipment.cjs [ticketNumber]
 *   (defaults to 18263 if no arg)
 */
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://aatvckalnvojlykfgnmz.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdHZja2FsbnZvamx5a2Znbm16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI4MzczOSwiZXhwIjoyMDc5ODU5NzM5fQ.RvL9s8UpoKIof6D8AA2e81QL7ENVQi6LELhDj3n1Ryw'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const TARGET = process.argv[2] || '18263'

;(async () => {
  console.log(`\n=== Inspector side — daily_reports activity blocks with ticketNumber = "${TARGET}" ===`)
  const { data: reports } = await supabase.from('daily_reports')
    .select('id, date, inspector_name, activity_blocks')
    .order('date', { ascending: false })
  let hits = 0
  for (const rep of (reports || [])) {
    for (const block of (rep.activity_blocks || [])) {
      const tn = String(block.ticketNumber || '').trim()
      if (tn !== String(TARGET).trim()) continue
      hits++
      const blockKeys = Object.keys(block).sort()
      const equipKeys = blockKeys.filter(k => /equip/i.test(k))
      console.log({
        report_id: rep.id,
        date: rep.date,
        inspector: rep.inspector_name,
        activity: block.activityType,
        ticketNumber: block.ticketNumber,
        equipment_related_keys_on_block: equipKeys,
        equipmentEntries_count: (block.equipmentEntries || []).length,
        equipment_legacy_count: (block.equipment || []).length,
      })
      const ee = block.equipmentEntries || []
      if (ee.length > 0) {
        console.log(`  First equipmentEntries row keys:`, Object.keys(ee[0]).sort())
        console.log(`  Sample equipmentEntries[0]:`, ee[0])
      }
    }
  }
  if (hits === 0) console.log(`  (no activity block referenced ticketNumber "${TARGET}")`)

  console.log(`\n=== Contractor side — contractor_lems where field_log_id = "${TARGET}" ===`)
  const { data: lems } = await supabase.from('contractor_lems')
    .select('id, field_log_id, date, foreman, labour_entries, equipment_entries')
    .eq('field_log_id', TARGET)
  console.log(`  ${(lems || []).length} row(s)`)
  for (const l of (lems || [])) {
    const ee = l.equipment_entries || []
    console.log({
      id: l.id,
      field_log_id: l.field_log_id,
      date: l.date,
      foreman: l.foreman,
      equipment_entries_count: ee.length,
    })
    if (ee.length > 0) {
      console.log(`  First equipment_entries row keys:`, Object.keys(ee[0]).sort())
      console.log(`  Sample equipment_entries[0]:`, ee[0])
    }
  }

  console.log(`\n=== reconciliation_documents rows for "${TARGET}" (for completeness) ===`)
  const { data: docs } = await supabase.from('reconciliation_documents')
    .select('id, ticket_number, doc_type, date, foreman, status, extracted_ticket_number, ocr_confidence')
    .eq('ticket_number', TARGET)
  console.log(`  ${(docs || []).length} row(s)`)
  for (const d of (docs || [])) console.log(d)
})()
