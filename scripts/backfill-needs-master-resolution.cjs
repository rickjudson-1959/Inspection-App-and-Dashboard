#!/usr/bin/env node
/**
 * Backfill: clear stale needs_master_resolution flags.
 *
 * `needs_master_resolution` is set at entry-creation time as
 * !masterPersonnelId / !masterEquipmentId in InspectorReport.jsx.
 * When the manpower / equipment-fleet CSV is uploaded later, the
 * bulk-resolve flow backfills master_personnel_id / master_equipment_id
 * onto existing entries but doesn't always clear the flag — leaving
 * rows that have a master_id AND the stale `true` flag.
 *
 * This script walks every daily_reports row, walks every
 * activity_block, walks every labourEntries / equipmentEntries entry,
 * and flips `needs_master_resolution: false` wherever a master_*_id
 * is populated. Untouched otherwise.
 *
 * The cost-display code (InspectorReportPanel.jsx) was patched in
 * 6124a8b to gate on master_id presence, so the cost view is already
 * correct. This script is the data-side canonicalisation so the
 * MasterGaps page and any future consumers see clean state.
 *
 * Run:   node scripts/backfill-needs-master-resolution.cjs
 * Reads: SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL from .env.local
 */

const fs = require('fs')
const path = require('path')

const envText = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const SRK = envText.match(/^SUPABASE_SERVICE_ROLE_KEY="(.+)"$/m)[1]
const URL = envText.match(/^VITE_SUPABASE_URL="(.+)"$/m)[1]

async function req(pathSegment, init = {}) {
  const res = await fetch(URL + pathSegment, {
    ...init,
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${init.method || 'GET'} ${pathSegment} → ${res.status} ${body.slice(0, 300)}`)
  }
  return res.status === 204 ? null : res.json()
}

function patchEntry(entry, idKey) {
  if (!entry || typeof entry !== 'object') return { entry, changed: false }
  const hasMasterId = !!(entry[idKey] && String(entry[idKey]).trim())
  if (hasMasterId && entry.needs_master_resolution === true) {
    return { entry: { ...entry, needs_master_resolution: false }, changed: true }
  }
  return { entry, changed: false }
}

function patchBlocks(blocks) {
  if (!Array.isArray(blocks)) return { blocks, labourFixed: 0, equipFixed: 0 }
  let labourFixed = 0
  let equipFixed = 0
  const out = blocks.map(block => {
    if (!block || typeof block !== 'object') return block
    let blockChanged = false
    let newLabour = block.labourEntries
    let newEquip = block.equipmentEntries
    if (Array.isArray(block.labourEntries)) {
      const mapped = block.labourEntries.map(e => patchEntry(e, 'master_personnel_id'))
      const anyChanged = mapped.some(x => x.changed)
      if (anyChanged) {
        newLabour = mapped.map(x => x.entry)
        labourFixed += mapped.filter(x => x.changed).length
        blockChanged = true
      }
    }
    if (Array.isArray(block.equipmentEntries)) {
      const mapped = block.equipmentEntries.map(e => patchEntry(e, 'master_equipment_id'))
      const anyChanged = mapped.some(x => x.changed)
      if (anyChanged) {
        newEquip = mapped.map(x => x.entry)
        equipFixed += mapped.filter(x => x.changed).length
        blockChanged = true
      }
    }
    return blockChanged ? { ...block, labourEntries: newLabour, equipmentEntries: newEquip } : block
  })
  return { blocks: out, labourFixed, equipFixed }
}

async function main() {
  const PAGE = 500
  let offset = 0
  let totalReports = 0
  let touchedReports = 0
  let labourFixed = 0
  let equipFixed = 0

  while (true) {
    const rows = await req(`/rest/v1/daily_reports?select=id,activity_blocks&order=id&limit=${PAGE}&offset=${offset}`)
    if (!rows.length) break
    totalReports += rows.length
    for (const r of rows) {
      const { blocks, labourFixed: lf, equipFixed: ef } = patchBlocks(r.activity_blocks)
      if (lf > 0 || ef > 0) {
        await req(`/rest/v1/daily_reports?id=eq.${r.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ activity_blocks: blocks })
        })
        touchedReports++
        labourFixed += lf
        equipFixed += ef
        process.stdout.write(`  report ${r.id}: cleared ${lf} labour, ${ef} equipment flag(s)\n`)
      }
    }
    offset += PAGE
    if (rows.length < PAGE) break
  }

  console.log('\n=== backfill summary ===')
  console.log(`reports scanned       : ${totalReports}`)
  console.log(`reports touched       : ${touchedReports}`)
  console.log(`labour flags cleared  : ${labourFixed}`)
  console.log(`equipment flags cleared: ${equipFixed}`)
}

main().catch(err => { console.error(err); process.exit(1) })
