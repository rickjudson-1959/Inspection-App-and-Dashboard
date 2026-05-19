/**
 * Bulk resolver: sweeps daily_reports.activity_blocks[*].equipmentEntries
 * for rows flagged needs_master_resolution=true, looks them up in
 * equipment_fleet by normalized unit_number, and stamps the
 * matching fleet row's id on master_equipment_id (flipping
 * needs_master_resolution false).
 *
 * Normalization: UPPERCASE + strip non-alphanumeric. Unit numbers
 * are unambiguous fleet identifiers; this avoids the equipment-type
 * text-mismatch problem entirely.
 *
 * Org-scoped: the lookup map is keyed by (organization_id, normUnit)
 * so a report only ever matches its own org's fleet.
 *
 * Defaults to DRY RUN. Pass --apply to actually write.
 *
 * Skipped (left alone, counted under stillUnresolved):
 *   - entries without a unit_number / unitNumber
 *   - entries whose unitNumber doesn't match any fleet row in the org
 *   - entries with flagged_for_review === true (admin's manual review)
 *   - entries that already have master_equipment_id (stale flag,
 *     no overwrite)
 *
 * Idempotent: re-running matches no rows on the second pass because
 * needs_master_resolution is false after the first.
 *
 * Usage:
 *   node scripts/resolve-equipment-master-ids.cjs            # dry run
 *   node scripts/resolve-equipment-master-ids.cjs --apply    # commit
 */
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://aatvckalnvojlykfgnmz.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdHZja2FsbnZvamx5a2Znbm16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI4MzczOSwiZXhwIjoyMDc5ODU5NzM5fQ.RvL9s8UpoKIof6D8AA2e81QL7ENVQi6LELhDj3n1Ryw'

const APPLY = process.argv.includes('--apply')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const normUnit = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

async function loadAll(table, columns) {
  const rows = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(offset, offset + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
    offset += 1000
  }
  return rows
}

;(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`)
  console.log()

  // 1. Load equipment_fleet
  console.log('Loading equipment_fleet…')
  const fleetRows = await loadAll('equipment_fleet', 'id, organization_id, unit_number, equipment_type')
  console.log(`  ${fleetRows.length} rows`)

  // Build (org_id → Map<normUnit, fleetRow>). First win on duplicates.
  const fleetByOrg = new Map()
  const dupes = []
  for (const r of fleetRows) {
    const nu = normUnit(r.unit_number)
    if (!nu) continue
    if (!fleetByOrg.has(r.organization_id)) fleetByOrg.set(r.organization_id, new Map())
    const m = fleetByOrg.get(r.organization_id)
    if (m.has(nu)) {
      dupes.push({ org: r.organization_id, normUnit: nu, kept: m.get(nu).id, dropped: r.id })
    } else {
      m.set(nu, r)
    }
  }
  if (dupes.length > 0) {
    console.log(`  Warning: ${dupes.length} duplicate normalized unit_numbers in equipment_fleet (first kept):`)
    for (const d of dupes.slice(0, 5)) console.log('   ', d)
    if (dupes.length > 5) console.log(`    … +${dupes.length - 5} more`)
  }
  console.log()

  // 2. Load all daily_reports
  console.log('Loading daily_reports…')
  const reports = await loadAll('daily_reports', 'id, organization_id, date, inspector_name, activity_blocks')
  console.log(`  ${reports.length} rows`)
  console.log()

  // 3. Sweep
  let wouldResolve = 0
  let stillUnresolved = 0
  let skippedFlagged = 0
  let skippedStale = 0
  const matchSamples = []
  const noMatchSamples = []
  const reportsToUpdate = []

  for (const rep of reports) {
    const orgFleet = fleetByOrg.get(rep.organization_id)
    const blocks = rep.activity_blocks || []
    let modified = false
    const newBlocks = blocks.map(block => {
      const ee = block.equipmentEntries || []
      let blockTouched = false
      const newEE = ee.map(entry => {
        if (!entry?.needs_master_resolution) return entry
        if (entry.master_equipment_id) {
          // Stale flag — already linked. Leave alone, don't even flip
          // the flag (out of scope).
          skippedStale++
          return entry
        }
        if (entry.flagged_for_review === true) {
          // Admin's manual review marker — never overwrite.
          skippedFlagged++
          return entry
        }
        const unit = entry.unitNumber || entry.unit_number || ''
        if (!unit) {
          stillUnresolved++
          if (noMatchSamples.length < 8) noMatchSamples.push({ report_id: rep.id, date: rep.date, reason: 'no unit', entry_id: entry.id, type: entry.type })
          return entry
        }
        const nu = normUnit(unit)
        const fleet = orgFleet?.get(nu)
        if (!fleet) {
          stillUnresolved++
          if (noMatchSamples.length < 8) noMatchSamples.push({ report_id: rep.id, date: rep.date, unit, normalized: nu, type: entry.type })
          return entry
        }
        wouldResolve++
        if (matchSamples.length < 8) matchSamples.push({ report_id: rep.id, date: rep.date, unit, fleet_unit: fleet.unit_number, fleet_id: fleet.id, fleet_type: fleet.equipment_type })
        blockTouched = true
        return { ...entry, master_equipment_id: fleet.id, needs_master_resolution: false }
      })
      if (blockTouched) {
        modified = true
        return { ...block, equipmentEntries: newEE }
      }
      return block
    })
    if (modified) reportsToUpdate.push({ id: rep.id, activity_blocks: newBlocks })
  }

  console.log('=== Summary ===')
  console.log(`  Would resolve:          ${wouldResolve}`)
  console.log(`  Still unresolved:       ${stillUnresolved}`)
  console.log(`  Skipped (admin flag):   ${skippedFlagged}`)
  console.log(`  Skipped (stale flag):   ${skippedStale}`)
  console.log(`  Reports affected:       ${reportsToUpdate.length}`)
  console.log()
  console.log('Sample matches (first 8):')
  for (const s of matchSamples) console.log('  ', s)
  console.log()
  console.log('Sample no-matches (first 8):')
  for (const s of noMatchSamples) console.log('  ', s)
  console.log()

  if (!APPLY) {
    console.log('DRY RUN — no writes performed. Re-run with --apply to commit.')
    return
  }

  console.log(`Applying writes to ${reportsToUpdate.length} reports…`)
  let written = 0
  let failed = 0
  for (const { id, activity_blocks } of reportsToUpdate) {
    const { error } = await supabase.from('daily_reports').update({ activity_blocks }).eq('id', id)
    if (error) { console.error('  Failed report', id, ':', error.message); failed++; continue }
    written++
  }
  console.log(`Done. Wrote ${written}/${reportsToUpdate.length}. Failed: ${failed}.`)
})()
