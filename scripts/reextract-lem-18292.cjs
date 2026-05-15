#!/usr/bin/env node
/**
 * One-shot re-extract for ticket 18292.
 *
 * The original bulk-upload OCR produced obvious hallucinations on
 * this LEM (Kris Bryant, Addison Russell, Wilson Contreras, etc. —
 * Chicago Cubs roster, not actual workers). This script:
 *
 *   1. NULLs contractor_lems.labour_entries + equipment_entries for
 *      ticket 18292 (per Rick's explicit instruction).
 *   2. Pulls the per-page JPEGs from reconciliation_documents
 *      (file_urls). Note: the source PDF wasn't preserved, so the
 *      "scale 3+ re-render" safeguard from lemParser.js can only
 *      apply to FUTURE bulk uploads. This one-shot re-extract has
 *      to use the stored scale-2.0 JPEGs.
 *   3. Loads personnel_roster names for the org.
 *   4. Calls Claude Vision with the same LEM prompt the bulk
 *      processor uses, then runs the roster cross-check from
 *      lemParser.js inline (case-insensitive full match + fuzzy
 *      last-name match — same logic).
 *   5. Suspicious names (no roster match) are EXCLUDED. If after
 *      filtering the labour list is empty AND the model returned
 *      suspicious names, the contractor_lems row is updated with
 *      discrepancy_note flagging "Manual entry required" — that
 *      surfaces in billing review instead of producing silent $0
 *      totals.
 *
 * Run:   node scripts/reextract-lem-18292.cjs
 * Reads: SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, VITE_ANTHROPIC_API_KEY
 *        from .env.local
 */

const fs = require('fs')
const path = require('path')

const envText = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const SRK = envText.match(/^SUPABASE_SERVICE_ROLE_KEY="(.+)"$/m)[1]
const URL = envText.match(/^VITE_SUPABASE_URL="(.+)"$/m)[1]
const ANTHROPIC_KEY = envText.match(/^VITE_ANTHROPIC_API_KEY="(.+)"$/m)[1]

const TICKET = '18292'
const ORG = '00000000-0000-0000-0000-000000000001'

const LEM_PROMPT = `You are extracting billing data from a contractor's Labour & Equipment Manifest (LEM) page used in pipeline construction.

Extract ALL line items from this LEM page. Return ONLY valid JSON (no markdown, no code fences):

{
  "labour": [
    {
      "employee_name": "full name",
      "classification": "job title/classification exactly as printed",
      "rt_hours": number or 0,
      "ot_hours": number or 0,
      "rt_rate": number or 0,
      "ot_rate": number or 0,
      "line_total": number or 0,
      "count": 1
    }
  ],
  "equipment": [
    {
      "equipment_type": "type exactly as printed",
      "unit_number": "unit/fleet ID or empty string",
      "hours": number or 0,
      "rate": number or 0,
      "line_total": number or 0,
      "count": 1
    }
  ],
  "totals": {
    "total_labour_hours": number or 0,
    "total_labour_cost": number or 0,
    "total_equipment_hours": number or 0,
    "total_equipment_cost": number or 0,
    "grand_total": number or 0
  }
}

Rules:
- Extract every person and piece of equipment listed, even if hours are 0
- RT = regular time (first 8 hours), OT = overtime (beyond 8)
- If only total hours are shown (no RT/OT split): put all in rt_hours
- Rates: extract the hourly rate if visible, otherwise 0
- line_total: the dollar amount for that line if shown, otherwise 0
- Keep classification names EXACTLY as printed
- If the page has subtotals or grand totals, capture them in the totals object
- If you genuinely cannot read a name with confidence, return it as "ILLEGIBLE" rather than guessing — do NOT invent names`

// Normalisation matches lemParser.js splitLabourByRoster.
function normName(s) { return (s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim() }
function lastToken(s) {
  const t = normName(s).split(' ').filter(Boolean)
  return t.length ? t[t.length - 1] : ''
}

async function rest(pathSeg, init = {}) {
  const res = await fetch(URL + pathSeg, {
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
    throw new Error(`${init.method || 'GET'} ${pathSeg} → ${res.status} ${body.slice(0, 300)}`)
  }
  return res.status === 204 ? null : res.json()
}

async function downloadAsBase64(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download ${url} → ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return buf.toString('base64')
}

async function ocrPage(b64) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: LEM_PROMPT }
        ]
      }]
    })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return { labour: [], equipment: [], totals: {} }
  return JSON.parse(m[0])
}

async function main() {
  console.log('=== ticket 18292 LEM re-extract ===\n')

  // Step 1: NULL the bad data
  console.log('[1/5] Nulling contractor_lems.labour_entries + equipment_entries for ticket 18292…')
  await rest(`/rest/v1/contractor_lems?field_log_id=eq.${TICKET}&organization_id=eq.${ORG}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      labour_entries: null,
      equipment_entries: null,
      total_labour_cost: 0,
      total_equipment_cost: 0
    })
  })
  console.log('       ✓ data cleared\n')

  // Step 2: Pull the LEM JPEGs
  console.log('[2/5] Fetching reconciliation_documents row…')
  const docs = await rest(`/rest/v1/reconciliation_documents?ticket_number=eq.${TICKET}&doc_type=eq.contractor_lem&select=id,file_urls,source_pages&order=created_at.desc&limit=1`)
  if (!docs.length || !docs[0].file_urls?.length) {
    console.error('       ✗ no LEM reconciliation_documents row with file_urls')
    process.exit(1)
  }
  const fileUrls = docs[0].file_urls
  console.log(`       ✓ ${fileUrls.length} LEM page JPEG(s) (scale-2.0 — source PDF not preserved)\n`)

  // Step 3: Load roster names for cross-check (paginated — PostgREST
  // default cap is 1000, our org has 1224 rows).
  console.log('[3/5] Loading personnel_roster…')
  const rosterNames = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const batch = await rest(`/rest/v1/personnel_roster?organization_id=eq.${ORG}&select=employee_name&order=employee_name&offset=${from}&limit=${PAGE}`)
    for (const r of (batch || [])) {
      const n = (r.employee_name || '').trim()
      if (n) rosterNames.push(n)
    }
    if (!batch || batch.length < PAGE) break
  }
  const rosterFull = new Set(rosterNames.map(normName).filter(Boolean))
  const rosterLast = new Set(rosterNames.map(lastToken).filter(n => n.length >= 3))
  console.log(`       ✓ ${rosterNames.length} roster names loaded\n`)

  // Step 4: OCR each page, cross-check against roster
  console.log(`[4/5] OCR + roster cross-check on ${fileUrls.length} page(s)…`)
  const allLabour = []
  const allEquipment = []
  const allSuspicious = []
  let totalLabourCost = 0
  let totalEquipCost = 0

  for (let i = 0; i < fileUrls.length; i++) {
    const url = fileUrls[i]
    console.log(`       page ${i + 1}/${fileUrls.length}: ${url.split('/').slice(-2).join('/')}`)
    const b64 = await downloadAsBase64(url)
    const parsed = await ocrPage(b64)
    const labour = parsed.labour || []
    const matched = []
    const suspicious = []
    for (const entry of labour) {
      const name = entry?.employee_name || entry?.name || ''
      if (!name) { matched.push(entry); continue }
      const n = normName(name)
      if (rosterFull.has(n)) { matched.push(entry); continue }
      const last = lastToken(name)
      if (last && rosterLast.has(last)) { matched.push(entry); continue }
      suspicious.push(entry)
    }
    console.log(`         → ${labour.length} returned, ${matched.length} kept, ${suspicious.length} suspicious`)
    for (const l of matched) {
      allLabour.push({
        name: l.employee_name || '',
        type: l.classification || '',
        employee_id: '',
        rt_hours: l.rt_hours || 0,
        ot_hours: l.ot_hours || 0,
        dt_hours: 0,
        rt_rate: l.rt_rate || 0,
        ot_rate: l.ot_rate || 0,
        dt_rate: 0,
        sub: 0,
        total: l.line_total || 0
      })
      totalLabourCost += l.line_total || 0
    }
    for (const e of (parsed.equipment || [])) {
      allEquipment.push({
        type: e.equipment_type || '',
        equipment_id: e.unit_number || '',
        hours: e.hours || 0,
        rate: e.rate || 0,
        total: e.line_total || 0
      })
      totalEquipCost += e.line_total || 0
    }
    allSuspicious.push(...suspicious)
  }
  console.log()

  // Step 5: Save or flag
  //
  // Threshold: if 50%+ of returned names fail roster cross-check the
  // page is too garbled to trust ANY of the matches — surname-only
  // collisions on a 1224-name roster are easy. Discard everything
  // (including the coincidental "matches") and flag for manual entry.
  console.log('[5/5] Saving result…')
  const totalReturned = allLabour.length + allSuspicious.length
  const suspiciousRatio = totalReturned > 0 ? allSuspicious.length / totalReturned : 0
  const tooManyHallucinations = totalReturned > 0 && suspiciousRatio >= 0.5
  const update = {
    labour_entries: tooManyHallucinations ? [] : allLabour,
    equipment_entries: tooManyHallucinations ? [] : allEquipment,
    total_labour_cost: tooManyHallucinations ? 0 : totalLabourCost,
    total_equipment_cost: tooManyHallucinations ? 0 : totalEquipCost,
    discrepancy_note: tooManyHallucinations
      ? `Manual entry required: ${allSuspicious.length} of ${totalReturned} name(s) returned by OCR failed personnel_roster cross-check (${Math.round(suspiciousRatio * 100)}% suspicious). The few coincidental matches were discarded too — at this signal level they're likely just common surnames colliding. Suspicious: ${allSuspicious.slice(0, 8).map(s => s.employee_name || s.name).join(', ')}${allSuspicious.length > 8 ? '…' : ''}`
      : null
  }
  await rest(`/rest/v1/contractor_lems?field_log_id=eq.${TICKET}&organization_id=eq.${ORG}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(update)
  })

  console.log('\n=== summary ===')
  console.log(`labour kept       : ${allLabour.length}`)
  console.log(`labour suspicious : ${allSuspicious.length}`)
  console.log(`equipment kept    : ${allEquipment.length}`)
  console.log(`labour cost       : $${totalLabourCost.toFixed(2)}`)
  console.log(`equip cost        : $${totalEquipCost.toFixed(2)}`)
  if (tooManyHallucinations) {
    console.log(`\n⚠ Flagged for MANUAL ENTRY — the LEM is too poor quality to OCR.`)
    console.log(`  ${Math.round(suspiciousRatio * 100)}% of returned names failed roster cross-check.`)
    console.log(`  discrepancy_note set on contractor_lems for ticket ${TICKET}.`)
  } else if (allLabour.length > 0) {
    console.log(`\n✓ Clean labour entries saved.`)
  }
  if (allSuspicious.length > 0) {
    console.log(`\nFirst few suspicious names (excluded):`)
    for (const s of allSuspicious.slice(0, 10)) {
      const nm = (s.employee_name || s.name || '?').padEnd(30)
      console.log(`  ${nm}  ${s.classification || ''}`)
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
