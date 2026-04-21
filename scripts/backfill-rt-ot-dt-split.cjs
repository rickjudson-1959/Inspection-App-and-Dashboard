/**
 * Backfill: Auto-split RT/OT/DT from total hours
 *
 * For existing daily_reports where labour entries have total hours
 * but no RT/OT/DT split, applies the contract compliance engine
 * to populate the breakdown based on the report date.
 *
 * Rules (Canadian pipeline contract):
 *   - Statutory holiday → all DT
 *   - Sunday → all DT
 *   - Saturday → all OT
 *   - Weekday → first 8 RT, remainder OT
 *
 * Scoped to the default organization (CLX-2).
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://aatvckalnvojlykfgnmz.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdHZja2FsbnZvamx5a2Znbm16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI4MzczOSwiZXhwIjoyMDc5ODU5NzM5fQ.RvL9s8UpoKIof6D8AA2e81QL7ENVQi6LELhDj3n1Ryw'
const ORG_ID = '00000000-0000-0000-0000-000000000001'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Contract rules (CLX-2: Alberta, 8 base hours)
const PROJECT_RULES = { base_hours_per_day: 8, ot_multiplier: 1.5, dt_multiplier: 2.0, province: 'AB' }

// ── Paginated fetch ───────────────────────────────────────────────────
async function fetchAll(table, select, filters = {}) {
  const PAGE = 1000
  let all = []
  let from = 0
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1)
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
    const { data, error } = await q
    if (error) throw new Error(`Fetch ${table}: ${error.message}`)
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return all
}

// ── Holiday cache ─────────────────────────────────────────────────────
const holidayCache = {}
async function getHoliday(dateStr) {
  if (holidayCache[dateStr] !== undefined) return holidayCache[dateStr]
  const { data } = await supabase
    .from('statutory_holidays')
    .select('id, name, jurisdiction, province')
    .eq('holiday_date', dateStr)
    .or(`jurisdiction.eq.federal,and(jurisdiction.eq.provincial,province.eq.${PROJECT_RULES.province})`)
    .limit(1)
    .maybeSingle()
  holidayCache[dateStr] = data || null
  return holidayCache[dateStr]
}

// ── Pure split calculation (mirrors contractCompliance.js) ────────────
function calculateSplit(totalHours, reportDate, rules, holiday) {
  const { base_hours_per_day } = rules
  const date = new Date(reportDate + 'T12:00:00')
  const dayOfWeek = date.getUTCDay()

  if (holiday) return { rt_hours: 0, ot_hours: 0, dt_hours: totalHours, rule: `holiday(${holiday.name})` }
  if (dayOfWeek === 0) return { rt_hours: 0, ot_hours: 0, dt_hours: totalHours, rule: 'sunday_dt' }
  if (dayOfWeek === 6) return { rt_hours: 0, ot_hours: totalHours, dt_hours: 0, rule: 'saturday_ot' }

  const rt = Math.min(totalHours, base_hours_per_day)
  const ot = Math.max(0, totalHours - base_hours_per_day)
  return { rt_hours: rt, ot_hours: ot, dt_hours: 0, rule: 'weekday' }
}

// ══════════════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║  RT/OT/DT Auto-Split Backfill — CLX-2           ║')
  console.log('╚══════════════════════════════════════════════════╝\n')

  console.log('Loading daily_reports...')
  const reports = await fetchAll('daily_reports', 'id, date, activity_blocks, organization_id', { organization_id: ORG_ID })
  console.log(`  → ${reports.length} reports\n`)

  let entriesChecked = 0
  let entriesSplit = 0
  let entriesAlreadySplit = 0
  let reportsUpdated = 0
  const splitsByRule = {}

  for (const report of reports) {
    const blocks = report.activity_blocks
    if (!blocks || !Array.isArray(blocks)) continue
    const reportDate = report.date
    if (!reportDate) continue

    const holiday = await getHoliday(reportDate)
    let dirty = false

    for (const block of blocks) {
      const labourEntries = block.labourEntries || []
      for (const entry of labourEntries) {
        entriesChecked++

        // Calculate total hours from whatever we have
        const rt = parseFloat(entry.rt || 0)
        const ot = parseFloat(entry.ot || 0)
        const dt = parseFloat(entry.dt || 0)
        const totalFromFields = rt + ot + dt
        const totalHours = parseFloat(entry.total_hours || 0) || parseFloat(entry.hours || 0) || totalFromFields

        if (totalHours <= 0) continue

        // Check if RT/OT/DT already look like a proper split
        // (not just all hours dumped in RT with 0 OT 0 DT)
        const hasProperSplit = (
          // Has dt > 0 (holiday/sunday)
          dt > 0 ||
          // Has ot > 0 (saturday or weekday overtime)
          ot > 0 ||
          // RT ≤ base hours and total = RT (short weekday, no overtime — already correct)
          (rt <= PROJECT_RULES.base_hours_per_day && rt === totalHours && totalHours <= PROJECT_RULES.base_hours_per_day)
        )

        if (hasProperSplit) {
          entriesAlreadySplit++
          continue
        }

        // Need to split: hours are all in RT (or hours field) with no OT/DT
        const split = calculateSplit(totalHours, reportDate, PROJECT_RULES, holiday)

        // Only update if the split is different from current values
        if (Math.abs(rt - split.rt_hours) > 0.01 ||
            Math.abs(ot - split.ot_hours) > 0.01 ||
            Math.abs(dt - split.dt_hours) > 0.01) {
          entry.rt = split.rt_hours
          entry.ot = split.ot_hours
          entry.dt = split.dt_hours
          entry.hours = totalHours
          entry.total_hours = totalHours
          entry.rule_applied = split.rule
          entriesSplit++
          splitsByRule[split.rule] = (splitsByRule[split.rule] || 0) + 1
          dirty = true
        } else {
          entriesAlreadySplit++
        }
      }
    }

    if (dirty) {
      const { error } = await supabase
        .from('daily_reports')
        .update({ activity_blocks: blocks })
        .eq('id', report.id)
      if (error) {
        console.error(`  ✗ Failed to update report ${report.id}: ${error.message}`)
      } else {
        reportsUpdated++
      }
    }
  }

  // ── Report ─────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════')
  console.log('  BACKFILL RESULTS')
  console.log('═══════════════════════════════════════════════════\n')

  console.log(`  Labour entries checked: ${entriesChecked}`)
  console.log(`  Already properly split: ${entriesAlreadySplit}`)
  console.log(`  ✓ Newly split: ${entriesSplit}`)
  console.log(`  Reports updated: ${reportsUpdated} / ${reports.length}`)

  if (Object.keys(splitsByRule).length > 0) {
    console.log('\n  Splits by rule:')
    for (const [rule, count] of Object.entries(splitsByRule).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${rule}: ${count}`)
    }
  }

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  BACKFILL COMPLETE')
  console.log('═══════════════════════════════════════════════════')
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
