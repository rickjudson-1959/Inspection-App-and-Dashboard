#!/usr/bin/env node
/**
 * One-shot re-extract for ticket 18292 — corrected pipeline.
 *
 * Earlier attempts using the storage-cached scale-1.5/2.0 JPEGs
 * returned hallucinations because the rasterizations were too
 * low-resolution for the dense table text (~825-1100 px wide).
 * Rick verified the source PDF is perfectly readable; this script
 * uses the local source + scale 4 (≈288 DPI, 2464 × 3160 px per
 * letter page) + a 270° rotation so Vision sees the table upright.
 *
 * Pipeline:
 *   1. NULL contractor_lems.labour_entries + equipment_entries.
 *   2. Look up reconciliation_documents.source_pages to know which
 *      PDF pages belong to this LEM (pages 117 + 118 for 18292).
 *   3. Render each page from the local source PDF with pdftoppm at
 *      -r 288, then sips -r 270 to upright the landscape scans.
 *   4. Load personnel_roster (paginated past the 1000-row cap).
 *   5. Send each upright JPEG to Claude Vision with the LEM prompt.
 *   6. Roster cross-check: exact normalised name or fuzzy last-name
 *      match. Misses go to suspicious_labour and are excluded.
 *   7. Same ≥50%-suspicious threshold as the bulk processor: if
 *      that many failed, discard everything and flag for manual
 *      entry. Otherwise save the clean entries.
 *
 * Run:   node scripts/reextract-lem-18292.cjs
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const envText = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const SRK = envText.match(/^SUPABASE_SERVICE_ROLE_KEY="(.+)"$/m)[1]
const URL = envText.match(/^VITE_SUPABASE_URL="(.+)"$/m)[1]
const ANTHROPIC_KEY = envText.match(/^VITE_ANTHROPIC_API_KEY="(.+)"$/m)[1]
// Anthropic model — ANTHROPIC_MODEL env var overrides; default kept
// in sync with frontend src/constants.js ANTHROPIC_MODEL.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

const TICKET = '18292'
const ORG = '00000000-0000-0000-0000-000000000001'
const SOURCE_PDF = path.join(__dirname, '..', "LEM's", '2014-01-21 Tickets & LEM\'s', 'CLX2-FC Jan 21.pdf')
const RENDER_DPI = 288    // ≈ pdf.js scale 4
const ROTATE_DEG = 270    // landscape-stored-as-portrait → upright

const LEM_PROMPT = `You are extracting billing data from a contractor's Labour & Equipment Manifest (LEM) page used in pipeline construction.

Extract ALL line items from this LEM page. Return ONLY valid JSON (no markdown, no code fences):

{
  "labour": [
    {
      "employee_id": "ID number from the Employee ID column if shown, else empty string",
      "employee_name": "full name",
      "classification": "job title/classification exactly as printed",
      "rt_hours": number or 0,
      "ot_hours": number or 0,
      "dt_hours": number or 0,
      "rt_rate": number or 0,
      "ot_rate": number or 0,
      "dt_rate": number or 0,
      "subsistence": number or 0,
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
- RT = regular time (first 8 hours), OT = overtime, DT = double-time
- Read names EXACTLY as printed — do NOT invent or substitute names
- If you cannot read a name with confidence, return "ILLEGIBLE" for that row rather than guessing
- Keep classification names EXACTLY as printed`

function normName(s) { return (s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim() }
function tokenize(s) { return normName(s).split(' ').filter(t => t.length >= 3) }
function lastToken(s) { const t = normName(s).split(' ').filter(Boolean); return t.length ? t[t.length - 1] : '' }

// Levenshtein edit distance — mirrors src/utils/lemParser.js.
function editDistance(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Uint16Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = a.charCodeAt(i - 1) === b.charCodeAt(j - 1)
        ? prevDiag
        : Math.min(prev[j - 1], prev[j], prevDiag) + 1
      prevDiag = tmp
    }
  }
  return prev[b.length]
}

// Every OCR token (length ≥ 3) must have an ED≤1 match in the same
// roster row's token set. Direction-agnostic — recovers word-order
// swaps ("AAR Ali" ↔ "Ali ARR") and single-char misreads
// ("Aradi" → "Abadi").
function fuzzyTokenSetMatch(ocrTokens, rosterTokens) {
  for (const ot of ocrTokens) {
    let found = false
    for (const rt of rosterTokens) {
      if (Math.abs(rt.length - ot.length) > 1) continue
      if (editDistance(ot, rt) <= 1) { found = true; break }
    }
    if (!found) return false
  }
  return true
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

function renderPageScale4Upright(pdfPath, pageNumber) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reextract-'))
  const prefix = path.join(tmpDir, 'p')
  execFileSync('pdftoppm', [
    '-f', String(pageNumber), '-l', String(pageNumber),
    '-jpeg', '-jpegopt', 'quality=92',
    '-r', String(RENDER_DPI),
    pdfPath, prefix
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
  // pdftoppm zero-pads page number when total pages need it.
  const padded = pageNumber.toString().padStart(3, '0')
  const candidates = [`${prefix}-${padded}.jpg`, `${prefix}-${pageNumber}.jpg`]
  const raw = candidates.find(p => fs.existsSync(p))
  if (!raw) throw new Error(`pdftoppm output not found for page ${pageNumber}: tried ${candidates}`)
  const upright = path.join(tmpDir, `p-${pageNumber}-upright.jpg`)
  execFileSync('sips', ['-r', String(ROTATE_DEG), raw, '--out', upright], { stdio: ['ignore', 'ignore', 'inherit'] })
  return upright
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
      model: ANTHROPIC_MODEL,
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
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return { labour: [], equipment: [], totals: {} }
  return JSON.parse(m[0])
}

async function main() {
  console.log('=== ticket 18292 LEM re-extract (scale 4, upright) ===\n')

  console.log('[1/6] Nulling contractor_lems for ticket 18292…')
  await rest(`/rest/v1/contractor_lems?field_log_id=eq.${TICKET}&organization_id=eq.${ORG}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ labour_entries: null, equipment_entries: null, total_labour_cost: 0, total_equipment_cost: 0, discrepancy_note: null })
  })
  console.log('       ✓ data cleared\n')

  console.log('[2/6] Looking up source_pages from reconciliation_documents…')
  const docs = await rest(`/rest/v1/reconciliation_documents?ticket_number=eq.${TICKET}&doc_type=eq.contractor_lem&select=source_pages&order=created_at.desc&limit=1`)
  if (!docs.length || !docs[0].source_pages?.length) {
    console.error('       ✗ no LEM reconciliation_documents row with source_pages')
    process.exit(1)
  }
  const sourcePages = docs[0].source_pages
  console.log(`       ✓ pages ${sourcePages.join(', ')} in ${path.basename(SOURCE_PDF)}\n`)

  if (!fs.existsSync(SOURCE_PDF)) {
    console.error(`       ✗ source PDF missing: ${SOURCE_PDF}`)
    process.exit(1)
  }

  console.log('[3/6] Loading personnel_roster + equipment_fleet (paginated)…')
  const rosterNames = []
  for (let from = 0; ; from += 1000) {
    const batch = await rest(`/rest/v1/personnel_roster?organization_id=eq.${ORG}&select=employee_name&order=employee_name&offset=${from}&limit=1000`)
    for (const r of (batch || [])) {
      const n = (r.employee_name || '').trim()
      if (n) rosterNames.push(n)
    }
    if (!batch || batch.length < 1000) break
  }
  const rosterFull = new Set(rosterNames.map(normName).filter(Boolean))
  const rosterLast = new Set(rosterNames.map(lastToken).filter(n => n.length >= 3))
  const rosterTokenSets = rosterNames.map(tokenize).filter(arr => arr.length > 0)
  const fleetUnits = []
  for (let from = 0; ; from += 1000) {
    const batch = await rest(`/rest/v1/equipment_fleet?organization_id=eq.${ORG}&select=unit_number&order=unit_number&offset=${from}&limit=1000`)
    for (const r of (batch || [])) {
      const u = (r.unit_number || '').trim()
      if (u) fleetUnits.push(u)
    }
    if (!batch || batch.length < 1000) break
  }
  const normUnit = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const fleetSet = new Set(fleetUnits.map(normUnit).filter(Boolean))
  console.log(`       ✓ ${rosterNames.length} roster names, ${fleetUnits.length} fleet units\n`)

  console.log(`[4/6] Rendering pages at scale 4 (${RENDER_DPI} dpi) + rotating ${ROTATE_DEG}° for upright OCR input…`)
  const upright = {}
  for (const pn of sourcePages) {
    upright[pn] = renderPageScale4Upright(SOURCE_PDF, pn)
    const sz = fs.statSync(upright[pn]).size
    console.log(`       page ${pn}: ${upright[pn]} (${(sz / 1024).toFixed(0)} KB)`)
  }
  console.log()

  console.log('[5/6] OCR + roster + fleet cross-check…')
  const allLabour = []
  const allEquipment = []
  const allSuspicious = []
  const allSuspiciousEquipment = []
  let totalLabourCost = 0
  let totalEquipCost = 0

  for (const pn of sourcePages) {
    const b64 = fs.readFileSync(upright[pn]).toString('base64')
    const parsed = await ocrPage(b64)
    const labour = parsed.labour || []
    const matched = []
    const suspicious = []
    for (const entry of labour) {
      const name = entry?.employee_name || entry?.name || ''
      if (!name || /^illegible$/i.test(name.trim())) { suspicious.push({ ...entry, _reason: 'illegible' }); continue }
      const n = normName(name)
      if (rosterFull.has(n)) { matched.push(entry); continue }
      const last = lastToken(name)
      if (last && rosterLast.has(last)) { matched.push(entry); continue }
      const ocrTokens = tokenize(name)
      if (ocrTokens.length > 0 && rosterTokenSets.some(rt => fuzzyTokenSetMatch(ocrTokens, rt))) {
        matched.push(entry); continue
      }
      suspicious.push({ ...entry, _reason: 'no roster match' })
    }
    console.log(`       page ${pn}: ${labour.length} returned, ${matched.length} kept, ${suspicious.length} suspicious`)
    if (matched.length) {
      console.log(`              keep: ${matched.map(m => m.employee_name).slice(0, 12).join(', ')}${matched.length > 12 ? '…' : ''}`)
    }
    if (suspicious.length) {
      console.log(`              drop: ${suspicious.map(s => s.employee_name || s.name || '?').slice(0, 8).join(', ')}${suspicious.length > 8 ? '…' : ''}`)
    }
    for (const l of matched) {
      allLabour.push({
        name: l.employee_name || '',
        type: l.classification || '',
        employee_id: l.employee_id || '',
        rt_hours: l.rt_hours || 0,
        ot_hours: l.ot_hours || 0,
        dt_hours: l.dt_hours || 0,
        rt_rate: l.rt_rate || 0,
        ot_rate: l.ot_rate || 0,
        dt_rate: l.dt_rate || 0,
        sub: l.subsistence || 0,
        total: l.line_total || 0
      })
      totalLabourCost += l.line_total || 0
    }
    for (const e of (parsed.equipment || [])) {
      const u = normUnit(e.unit_number || '')
      // No unit → keep (we can't validate). Unit present but not in
      // fleet → suspicious (mirrors lemParser splitEquipmentByFleet).
      if (u && !fleetSet.has(u)) {
        allSuspiciousEquipment.push(e)
        continue
      }
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

  console.log('[6/6] Saving…')
  const totalReturned = allLabour.length + allSuspicious.length
  const suspiciousRatio = totalReturned > 0 ? allSuspicious.length / totalReturned : 0
  const tooManyHallucinations = totalReturned > 0 && suspiciousRatio >= 0.5

  // Suspicious entries get persisted inline alongside the kept ones
  // with `_suspicious: true` so the inspector panel can surface them
  // as "Likely OCR misread: 'Brad Kerlau'" hints when a real worker
  // appears missing from the LEM. They are NOT included in cost
  // totals or in the variance comparison's "real LEM rows" set.
  const labourWithSuspicious = tooManyHallucinations ? [] : [
    ...allLabour,
    ...allSuspicious.map(s => ({
      name: s.employee_name || s.name || '',
      type: s.classification || '',
      employee_id: s.employee_id || '',
      rt_hours: s.rt_hours || 0,
      ot_hours: s.ot_hours || 0,
      dt_hours: s.dt_hours || 0,
      rt_rate: s.rt_rate || 0,
      ot_rate: s.ot_rate || 0,
      dt_rate: s.dt_rate || 0,
      sub: s.subsistence || 0,
      total: s.line_total || 0,
      _suspicious: true,
      _suspicious_reason: s._reason || 'no roster match'
    }))
  ]

  // Same inline-suspicious treatment for equipment.
  const equipmentWithSuspicious = tooManyHallucinations ? [] : [
    ...allEquipment,
    ...allSuspiciousEquipment.map(s => ({
      type: s.equipment_type || '',
      equipment_id: s.unit_number || '',
      hours: s.hours || 0,
      rate: s.rate || 0,
      total: s.line_total || 0,
      _suspicious: true,
      _suspicious_reason: 'unit not in equipment_fleet'
    }))
  ]

  const update = {
    labour_entries: labourWithSuspicious,
    equipment_entries: equipmentWithSuspicious,
    total_labour_cost: tooManyHallucinations ? 0 : totalLabourCost,
    total_equipment_cost: tooManyHallucinations ? 0 : totalEquipCost,
    discrepancy_note: tooManyHallucinations
      ? `Manual entry required: ${allSuspicious.length} of ${totalReturned} OCR'd names failed roster cross-check (${Math.round(suspiciousRatio * 100)}%).`
      : null
  }
  await rest(`/rest/v1/contractor_lems?field_log_id=eq.${TICKET}&organization_id=eq.${ORG}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(update)
  })

  console.log('\n=== summary ===')
  console.log(`labour kept            : ${allLabour.length}`)
  console.log(`labour suspicious      : ${allSuspicious.length}`)
  console.log(`equipment kept         : ${allEquipment.length}`)
  console.log(`equipment suspicious   : ${allSuspiciousEquipment.length}`)
  console.log(`labour cost            : $${totalLabourCost.toFixed(2)}`)
  console.log(`equip cost             : $${totalEquipCost.toFixed(2)}`)
  console.log(tooManyHallucinations ? '\n⚠ flagged for MANUAL ENTRY' : '\n✓ clean labour saved')
}

main().catch(err => { console.error(err); process.exit(1) })
