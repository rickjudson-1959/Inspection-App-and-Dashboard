/**
 * Surgical cleanup: removes weld-count rows that an inspector typed
 * into the equipment section, and migrates the count back to its
 * proper home in block.weldData.weldsToday.
 *
 * Targets: rows in daily_reports.activity_blocks[*].equipmentEntries
 * where type ∈ {WELDS, WELD, REPAIRS, REPAIR} (case-insensitive) AND
 * unitNumber is empty. These are workaround entries — actual equipment
 * always carries a unit number.
 *
 * Single block was found in production with this pattern (report_id
 * 2087, ticket 18290). Script is written defensively to handle any
 * additional blocks if they appear later, but only writes to blocks
 * where it actually finds contamination.
 *
 * Migration logic per block:
 *   - Sum `hours` across removed WELDS-typed rows → set
 *     block.weldData.weldsToday to that sum. If weldsToday was
 *     already non-zero, keep the larger value (don't clobber real
 *     data that happens to coexist).
 *   - REPAIRS-typed rows have a `hours` field but the proper home
 *     for repairs is `block.weldData.repairs[]` (a structured array,
 *     not a count). hours=0 on the only known REPAIRS row, so
 *     nothing to migrate today. Logged if non-zero is ever seen.
 *
 * Defaults to DRY RUN; pass --apply to commit.
 *
 * Usage:
 *   node scripts/cleanup-weld-rows-in-equipment.cjs           # dry run
 *   node scripts/cleanup-weld-rows-in-equipment.cjs --apply   # commit
 */
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://aatvckalnvojlykfgnmz.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdHZja2FsbnZvamx5a2Znbm16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI4MzczOSwiZXhwIjoyMDc5ODU5NzM5fQ.RvL9s8UpoKIof6D8AA2e81QL7ENVQi6LELhDj3n1Ryw'

const APPLY = process.argv.includes('--apply')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const isWeldType   = (t) => /^WELDS?$/i.test(String(t || '').trim())
const isRepairType = (t) => /^REPAIRS?$/i.test(String(t || '').trim())

;(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`)
  console.log()

  // Load all reports (small set; full scan is fine).
  const { data: reports, error } = await supabase.from('daily_reports')
    .select('id, organization_id, date, inspector_name, activity_blocks')
  if (error) throw error
  console.log(`Loaded ${reports.length} daily_reports`)
  console.log()

  let removedWeldRows = 0
  let removedRepairRows = 0
  let migratedCount = 0
  let unsalvagedRepairs = 0
  const reportsToUpdate = []

  for (const rep of reports) {
    const blocks = rep.activity_blocks || []
    let reportModified = false
    const newBlocks = blocks.map(block => {
      const ee = block.equipmentEntries || []
      const removed = []
      const kept = []
      for (const entry of ee) {
        const u = String(entry.unitNumber || entry.unit_number || '').trim()
        if (!u && (isWeldType(entry.type) || isRepairType(entry.type))) {
          removed.push(entry)
        } else {
          kept.push(entry)
        }
      }
      if (removed.length === 0) return block

      // Migrate weld count to block.weldData.weldsToday
      const weldHoursSum = removed
        .filter(r => isWeldType(r.type))
        .reduce((s, r) => s + (parseFloat(r.hours) || 0), 0)
      const repairHoursSum = removed
        .filter(r => isRepairType(r.type))
        .reduce((s, r) => s + (parseFloat(r.hours) || 0), 0)

      const oldWD = block.weldData || {}
      const existingWeldsToday = parseFloat(oldWD.weldsToday) || 0
      const newWeldsToday = Math.max(existingWeldsToday, weldHoursSum)

      const newWeldData = {
        // Preserve any existing weldData fields (shape varies); only
        // overwrite weldsToday with the larger of (existing, migrated).
        ...oldWD,
        weldsToday: newWeldsToday,
      }

      removedWeldRows   += removed.filter(r => isWeldType(r.type)).length
      removedRepairRows += removed.filter(r => isRepairType(r.type)).length
      if (newWeldsToday !== existingWeldsToday) migratedCount += (newWeldsToday - existingWeldsToday)
      if (repairHoursSum > 0) unsalvagedRepairs += repairHoursSum

      console.log(`Block: report_id=${rep.id} date=${rep.date} activity="${block.activityType}" ticket=${block.ticketNumber}`)
      console.log(`  Removing ${removed.length} row(s):`)
      for (const r of removed) console.log(`    - type="${r.type}" hours=${r.hours} unitNumber="${r.unitNumber || ''}"`)
      console.log(`  weldData.weldsToday: ${existingWeldsToday} → ${newWeldsToday} (migrated +${weldHoursSum})`)
      if (repairHoursSum > 0) {
        console.log(`  WARNING: ${repairHoursSum} repair-hours not migrated (block.weldData.repairs is a structured array, not a count — needs manual entry)`)
      }
      console.log()

      reportModified = true
      return { ...block, equipmentEntries: kept, weldData: newWeldData }
    })
    if (reportModified) reportsToUpdate.push({ id: rep.id, activity_blocks: newBlocks })
  }

  console.log('=== Summary ===')
  console.log(`  WELDS rows removed:        ${removedWeldRows}`)
  console.log(`  REPAIRS rows removed:      ${removedRepairRows}`)
  console.log(`  Welds migrated to weldsToday: ${migratedCount}`)
  console.log(`  Repair-hours not migrated: ${unsalvagedRepairs} (workaround uses a count; proper field is structured array)`)
  console.log(`  Reports affected:          ${reportsToUpdate.length}`)
  console.log()

  if (!APPLY) {
    console.log('DRY RUN — no writes. Re-run with --apply to commit.')
    return
  }

  console.log(`Applying writes to ${reportsToUpdate.length} report(s)…`)
  let written = 0, failed = 0
  for (const { id, activity_blocks } of reportsToUpdate) {
    const { error: e } = await supabase.from('daily_reports').update({ activity_blocks }).eq('id', id)
    if (e) { console.error('  Failed report', id, ':', e.message); failed++; continue }
    written++
  }
  console.log(`Done. Wrote ${written}/${reportsToUpdate.length}. Failed: ${failed}.`)
})()
