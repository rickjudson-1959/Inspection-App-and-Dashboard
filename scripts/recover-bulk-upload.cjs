#!/usr/bin/env node
/**
 * Recover a bulk-upload whose page JPEGs are in storage but whose
 * reconciliation_documents rows never got written.
 *
 * Diagnosed scenario (Jan 21 2014 bulk): `0cf99a72-...` has 34 LEM
 * groups, 33 ticket groups, and the source PDF preserved in storage,
 * but zero `reconciliation_documents` rows. The user sees 33 tickets
 * in the inspector-report list as "Partial" with LEM ✗ TK ✗.
 *
 * Pipeline:
 *   1. List the bulk's storage subdirs to enumerate the groups.
 *   2. For each group, pull its page numbers from the JPEG filenames
 *      (`page-117.jpg` → 117).
 *   3. Render the first page from the local source PDF at scale 4
 *      + rotation 270 and OCR it for the printed Field Log ID +
 *      foreman name. That's the ticket→group mapping the workspace
 *      had in localStorage and which got lost.
 *   4. Insert the reconciliation_documents row pointing at the
 *      EXISTING storage URLs — no re-upload of JPEGs, no
 *      re-rasterization of pages.
 *   5. For LEM groups: render every page at scale 4 + 270, run the
 *      labour+equipment OCR with roster + fleet cross-check, save
 *      to contractor_lems. Same logic the bulk processor uses for
 *      a fresh upload — just driven from Node against the live API.
 *
 * Run:
 *   node scripts/recover-bulk-upload.cjs
 *
 * Reads .env.local for SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL,
 * VITE_ANTHROPIC_API_KEY.
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

// CLI: node scripts/recover-bulk-upload.cjs [BULK_ID] [LOCAL_PDF]
// Defaults match the Jan 21 2014 incident that prompted this tool.
const BULK_ID = process.argv[2] || '0cf99a72-4c15-4401-ba49-38329c63f507'
const LOCAL_PDF = process.argv[3] || path.join(__dirname, '..', "LEM's", '2014-01-21 Tickets & LEM\'s', 'CLX2-FC Jan 21.pdf')
const ORG = process.env.RECOVER_ORG_ID || '00000000-0000-0000-0000-000000000001'
const DPI = 288       // ≈ pdf.js scale 4 — the OCR-grade rendering
const ROTATE = 270    // Aecon landscape-stored-as-portrait scans
const MAX_EQUIPMENT_PER_LEM = 30  // ticket 18277 showed Vision returning 115 equipment entries —
                                   // aggregating across pages and likely double-counting. No real
                                   // daily LEM has 30+ pieces of equipment, so cap + flag.

const SUGGEST_PROMPT = `Look at this scanned construction document page (a contractor LEM or daily ticket).

Return JSON only — no markdown:
{
  "doc_type": "lem"|"daily_ticket"|"signature"|"summary"|"unknown",
  "field_log_id": "18288" or null,
  "foreman_name": "Brett Whitworth" or null,
  "date": "2014-01-21" or null
}

Rules:
- doc_type = "lem" if the page has rate columns, dollar amounts, "RT Rate", "OT Rate", "Total Labour", "Field Log Total", or an equipment table with unit IDs.
- doc_type = "daily_ticket" if the page has crew names + hours WITHOUT rate columns, OR "foreman's daily time report" header.
- field_log_id: only if printed (e.g., "Field Log ID: 18288"). digits only.
- foreman_name: only if printed (e.g., "Foreman: Brett Whitworth").
- date: only if printed (YYYY-MM-DD).
Return null for any field that isn't clearly PRINTED.`

const LEM_PROMPT = `You are extracting billing data from a contractor's Labour & Equipment Manifest (LEM) page used in pipeline construction.

Extract ALL line items. Return ONLY valid JSON (no markdown):
{
  "labour": [{
    "employee_id": "ID from Employee ID column or empty",
    "employee_name": "full name",
    "classification": "job title exactly as printed",
    "rt_hours": number or 0, "ot_hours": number or 0, "dt_hours": number or 0,
    "rt_rate": number or 0, "ot_rate": number or 0, "dt_rate": number or 0,
    "subsistence": number or 0, "line_total": number or 0
  }],
  "equipment": [{
    "equipment_type": "type exactly as printed",
    "unit_number": "unit/fleet ID or empty",
    "hours": number or 0, "rate": number or 0, "line_total": number or 0
  }],
  "totals": {}
}

Rules:
- Read names EXACTLY as printed — do NOT invent.
- If a name is illegible, return "ILLEGIBLE" rather than guessing.
- Keep classifications EXACTLY as printed.`

function normName(s) { return (s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim() }
function tokenize(s) { return normName(s).split(' ').filter(t => t.length >= 3) }
function lastToken(s) { const t = normName(s).split(' ').filter(Boolean); return t.length ? t[t.length - 1] : '' }
function normUnit(s) { return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }

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
    throw new Error(`${init.method || 'GET'} ${pathSeg} → ${res.status} ${body.slice(0, 400)}`)
  }
  // PATCH/DELETE with Prefer:return=minimal returns 204 OR 200 with
  // an empty body — res.json() throws "Unexpected end of JSON input"
  // on the empty body. Read as text first and only parse when there
  // are actually bytes.
  if (res.status === 204) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function listStorage(prefix) {
  const res = await fetch(`${URL}/storage/v1/object/list/reconciliation-docs`, {
    method: 'POST',
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 1000, prefix })
  })
  if (!res.ok) throw new Error(`storage list ${prefix} → ${res.status}`)
  return res.json()
}

function publicUrlFor(p) {
  return `${URL}/storage/v1/object/public/reconciliation-docs/${p}`
}

function renderPageUpright(pageNumber) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recover-'))
  const prefix = path.join(tmpDir, 'p')
  execFileSync('pdftoppm', [
    '-f', String(pageNumber), '-l', String(pageNumber),
    '-jpeg', '-jpegopt', 'quality=92', '-r', String(DPI),
    LOCAL_PDF, prefix
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
  const padded = pageNumber.toString().padStart(3, '0')
  const raw = [`${prefix}-${padded}.jpg`, `${prefix}-${pageNumber}.jpg`].find(p => fs.existsSync(p))
  if (!raw) throw new Error(`pdftoppm output missing for page ${pageNumber}`)
  const upright = path.join(tmpDir, `p-${pageNumber}-upright.jpg`)
  execFileSync('sips', ['-r', String(ROTATE), raw, '--out', upright], { stdio: ['ignore', 'ignore', 'inherit'] })
  return upright
}

async function callAnthropic(prompt, b64, maxTokens = 4000) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: prompt }
        ] }]
      })
    })
    if (res.status === 429) { await new Promise(r => setTimeout(r, (attempt + 1) * 5000)); continue }
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { return JSON.parse(m[0]) } catch (_) { return null }
  }
  throw new Error('Anthropic max retries exceeded')
}

async function main() {
  console.log(`=== bulk-upload recovery: ${BULK_ID} ===\n`)

  if (!fs.existsSync(LOCAL_PDF)) {
    console.error(`source PDF missing: ${LOCAL_PDF}`); process.exit(1)
  }

  console.log('[1/6] Loading roster + fleet…')
  const rosterNames = []
  for (let from = 0; ; from += 1000) {
    const batch = await rest(`/rest/v1/personnel_roster?organization_id=eq.${ORG}&select=employee_name&order=employee_name&offset=${from}&limit=1000`)
    for (const r of (batch || [])) { const n = (r.employee_name || '').trim(); if (n) rosterNames.push(n) }
    if (!batch || batch.length < 1000) break
  }
  const rosterFull = new Set(rosterNames.map(normName).filter(Boolean))
  const rosterLast = new Set(rosterNames.map(lastToken).filter(n => n.length >= 3))
  const rosterTokenSets = rosterNames.map(tokenize).filter(a => a.length > 0)
  const fleetUnits = []
  for (let from = 0; ; from += 1000) {
    const batch = await rest(`/rest/v1/equipment_fleet?organization_id=eq.${ORG}&select=unit_number&order=unit_number&offset=${from}&limit=1000`)
    for (const r of (batch || [])) { const u = (r.unit_number || '').trim(); if (u) fleetUnits.push(u) }
    if (!batch || batch.length < 1000) break
  }
  const fleetSet = new Set(fleetUnits.map(normUnit).filter(Boolean))
  console.log(`       ✓ ${rosterNames.length} roster names, ${fleetUnits.length} fleet units\n`)

  console.log('[2/6] Locating source PDF in storage…')
  const sourceList = await listStorage(`${ORG}/bulk/${BULK_ID}/source/`)
  const sourcePdfUrl = sourceList.length > 0
    ? publicUrlFor(`${ORG}/bulk/${BULK_ID}/source/${sourceList[0].name}`)
    : null
  console.log(`       ${sourcePdfUrl ? '✓ ' + sourceList[0].name : '(no source PDF in storage — rows will have null source_pdf_url)'}\n`)

  console.log('[3/6] Enumerating LEM + ticket groups in storage…')
  const lemGroups = (await listStorage(`${ORG}/bulk/${BULK_ID}/lem/`)).map(r => r.name).filter(n => n.startsWith('g-'))
  const ticketGroups = (await listStorage(`${ORG}/bulk/${BULK_ID}/ticket/`)).map(r => r.name).filter(n => n.startsWith('g-'))
  console.log(`       ✓ ${lemGroups.length} LEM groups, ${ticketGroups.length} ticket groups\n`)

  // Common: resolve a group's page numbers + JPEG URLs from storage.
  async function groupPages(kind, groupId) {
    const items = await listStorage(`${ORG}/bulk/${BULK_ID}/${kind}/${groupId}/`)
    const pages = items
      .map(it => {
        const m = it.name.match(/^page-(\d+)\.jpg$/)
        return m ? { name: it.name, pageNumber: parseInt(m[1], 10) } : null
      })
      .filter(Boolean)
      .sort((a, b) => a.pageNumber - b.pageNumber)
    return pages.map(p => ({
      pageNumber: p.pageNumber,
      url: publicUrlFor(`${ORG}/bulk/${BULK_ID}/${kind}/${groupId}/${p.name}`)
    }))
  }

  // Step 4: rebuild reconciliation_documents using existing storage URLs.
  console.log('[4/6] OCRing first page of each group for ticket_number + foreman, then inserting reconciliation_documents…')
  const lemGroupMeta = new Map()  // groupId -> { ticketNumber, foreman, date, pages, rowId }
  const ticketGroupMeta = new Map()

  // Idempotent: if a reconciliation_documents row already exists for
  // this bulk + group (looked up via the storage URL embedded in
  // file_urls — file_urls[0] contains the group_id as a path
  // component), reuse it and populate the metadata map. Only OCR +
  // insert when the row is genuinely missing. Lets the script be
  // safely re-run to fill gaps after partial failures or accidental
  // deletes.
  //
  // `inherited`: when a ticket group's same-group-id LEM has already
  // been processed, the ticket inherits the LEM's ticket_number,
  // foreman, and date — no redundant OCR on the daily ticket page
  // (which rarely prints the Field Log ID anyway, so the prior code
  // generated unique AUTO ticket_numbers per ticket group, splitting
  // a single foreman's package across two ticket_numbers in the
  // reconciliation list).
  async function classifyAndInsert(kind, groupId, inherited = null) {
    const pages = await groupPages(kind, groupId)
    if (pages.length === 0) return null

    // Look for an existing row by matching the group_id substring in
    // file_urls. Cheaper than a full content match and works even
    // when the AUTO synthetic ticket_number changed between runs.
    const existing = await rest(
      `/rest/v1/reconciliation_documents?bulk_upload_id=eq.${BULK_ID}` +
      `&doc_type=eq.${kind === 'lem' ? 'contractor_lem' : 'contractor_ticket'}` +
      `&file_urls=cs.{${encodeURIComponent(pages[0].url)}}` +
      `&select=id,ticket_number,foreman,date&limit=1`
    )
    if (existing && existing.length > 0) {
      const e = existing[0]
      const kindLabel = kind.padStart(6)
      console.log(`       ${kindLabel} ${groupId} ⏭ already in DB → ticket=${e.ticket_number}  foreman=${e.foreman || '?'}`)
      return { ticketNumber: e.ticket_number, foreman: e.foreman, date: e.date, pages, rowId: e.id }
    }

    let ticketNumber, foreman, date
    if (inherited) {
      // No OCR — reuse the LEM's metadata. Keeps the LEM panel and
      // Daily Ticket panel under the same ticket_number in the
      // four-panel viewer.
      ticketNumber = inherited.ticketNumber
      foreman = inherited.foreman
      date = inherited.date
    } else {
      const firstUpright = renderPageUpright(pages[0].pageNumber)
      const b64 = fs.readFileSync(firstUpright).toString('base64')
      const meta = await callAnthropic(SUGGEST_PROMPT, b64, 800)
      ticketNumber = (meta?.field_log_id && /^\d+$/.test(String(meta.field_log_id)))
        ? String(meta.field_log_id)
        : `AUTO-${BULK_ID.slice(0, 8)}-${groupId}`
      foreman = (meta?.foreman_name || '').trim() || null
      date = (meta?.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date)) ? meta.date : null
    }
    const row = {
      organization_id: ORG,
      ticket_number: ticketNumber,
      doc_type: kind === 'lem' ? 'contractor_lem' : 'contractor_ticket',
      file_urls: pages.map(p => p.url),
      page_count: pages.length,
      status: 'ready',
      date,
      foreman,
      bulk_upload_id: BULK_ID,
      source_pages: pages.map(p => p.pageNumber),
      source_pdf_url: sourcePdfUrl,
      ocr_confidence: 'high'
    }
    const inserted = await rest(`/rest/v1/reconciliation_documents`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row)
    })
    if (!inserted || inserted.length === 0) {
      throw new Error('insert returned no rows')
    }
    const rowId = inserted[0].id
    const kindLabel = kind.padStart(6)
    const inheritedTag = inherited ? ' (inherited from LEM)' : ''
    console.log(`       ${kindLabel} ${groupId} → ticket=${ticketNumber}  pages=${pages.map(p => p.pageNumber).join(',')}  foreman=${foreman || '?'}${inheritedTag}`)
    return { ticketNumber, foreman, date, pages, rowId }
  }

  // LEM groups first — their OCR'd ticket_number becomes the
  // canonical key for the foreman's package. Each ticket group is
  // then matched by the SAME storage group_id and inherits the
  // LEM's ticket_number + foreman + date, so the four-panel viewer
  // shows LEM and Daily Ticket under one ticket_number instead of
  // two unrelated rows in the reconciliation list.
  for (const g of lemGroups) {
    try {
      const m = await classifyAndInsert('lem', g)
      if (m) lemGroupMeta.set(g, m)
    } catch (err) { console.warn(`       ✗ LEM ${g}:`, err.message) }
  }
  for (const g of ticketGroups) {
    try {
      const lemMeta = lemGroupMeta.get(g)
      const m = await classifyAndInsert('ticket', g, lemMeta || null)
      if (m) ticketGroupMeta.set(g, m)
    } catch (err) { console.warn(`       ✗ ticket ${g}:`, err.message) }
  }
  console.log(`       ✓ inserted ${lemGroupMeta.size} LEM rows, ${ticketGroupMeta.size} ticket rows\n`)

  // Step 5: run full LEM extraction for each LEM group, write contractor_lems.
  console.log('[5/6] Running LEM extraction on every LEM group (scale-4 upright)…')
  let savedLem = 0, flaggedLem = 0
  for (const [groupId, meta] of lemGroupMeta) {
    // Skip if contractor_lems already populated for this ticket.
    // Lets a re-run of the script focus on the unprocessed groups
    // without re-OCRing the 30+ already-extracted ones (each group
    // is ~30s of OCR work, so this matters).
    const existingLem = await rest(`/rest/v1/contractor_lems?organization_id=eq.${ORG}&field_log_id=eq.${encodeURIComponent(meta.ticketNumber)}&select=id,labour_entries&limit=1`)
    if (existingLem && existingLem.length > 0 && Array.isArray(existingLem[0].labour_entries) && existingLem[0].labour_entries.length > 0) {
      console.log(`       #${meta.ticketNumber} ⏭ contractor_lems already populated (${existingLem[0].labour_entries.length} entries) — skipping`)
      continue
    }

    const allLabour = []
    let allEquipment = []
    const allSuspicious = []
    let allSuspiciousEquipment = []
    let totalLabourCost = 0, totalEquipCost = 0
    for (const { pageNumber } of meta.pages) {
      const upright = renderPageUpright(pageNumber)
      const b64 = fs.readFileSync(upright).toString('base64')
      const parsed = await callAnthropic(LEM_PROMPT, b64)
      if (!parsed) continue
      const labour = parsed.labour || []
      for (const e of labour) {
        const name = e?.employee_name || ''
        if (!name || /^illegible$/i.test(name.trim())) { allSuspicious.push({ ...e, _reason: 'illegible' }); continue }
        const n = normName(name)
        if (rosterFull.has(n)) { allLabour.push(e); totalLabourCost += e.line_total || 0; continue }
        const last = lastToken(name)
        if (last && rosterLast.has(last)) { allLabour.push(e); totalLabourCost += e.line_total || 0; continue }
        const toks = tokenize(name)
        if (toks.length > 0 && rosterTokenSets.some(rt => fuzzyTokenSetMatch(toks, rt))) {
          allLabour.push(e); totalLabourCost += e.line_total || 0; continue
        }
        allSuspicious.push({ ...e, _reason: 'no roster match' })
      }
      for (const e of (parsed.equipment || [])) {
        const u = normUnit(e.unit_number || '')
        if (u && !fleetSet.has(u)) { allSuspiciousEquipment.push(e); continue }
        allEquipment.push(e)
        totalEquipCost += e.line_total || 0
      }
    }
    // Equipment cap. Ticket 18277 came back from OCR with 115
    // equipment entries on May 16 2026 — Vision had aggregated /
    // duplicated rows across multiple LEM pages. No real daily LEM
    // has 30+ pieces of equipment, so truncate to 30 and flag the
    // row for manual review. Recompute the cost from the truncated
    // list so the saved total matches what's actually persisted.
    let equipmentTruncated = 0
    if (allEquipment.length > MAX_EQUIPMENT_PER_LEM) {
      equipmentTruncated = allEquipment.length - MAX_EQUIPMENT_PER_LEM
      allEquipment = allEquipment.slice(0, MAX_EQUIPMENT_PER_LEM)
      totalEquipCost = allEquipment.reduce((s, e) => s + (e.line_total || 0), 0)
    }
    if (allSuspiciousEquipment.length + allEquipment.length > MAX_EQUIPMENT_PER_LEM) {
      const remainingSlots = Math.max(0, MAX_EQUIPMENT_PER_LEM - allEquipment.length)
      allSuspiciousEquipment = allSuspiciousEquipment.slice(0, remainingSlots)
    }

    const totalReturned = allLabour.length + allSuspicious.length
    const suspiciousRatio = totalReturned > 0 ? allSuspicious.length / totalReturned : 0
    const tooMany = totalReturned > 0 && suspiciousRatio >= 0.5

    const labourRows = tooMany ? [] : [
      ...allLabour.map(l => ({
        name: l.employee_name || '', type: l.classification || '',
        employee_id: l.employee_id || '',
        rt_hours: l.rt_hours || 0, ot_hours: l.ot_hours || 0, dt_hours: l.dt_hours || 0,
        rt_rate: l.rt_rate || 0, ot_rate: l.ot_rate || 0, dt_rate: l.dt_rate || 0,
        sub: l.subsistence || 0, total: l.line_total || 0
      })),
      ...allSuspicious.map(s => ({
        name: s.employee_name || '', type: s.classification || '',
        employee_id: s.employee_id || '',
        rt_hours: s.rt_hours || 0, ot_hours: s.ot_hours || 0, dt_hours: s.dt_hours || 0,
        rt_rate: s.rt_rate || 0, ot_rate: s.ot_rate || 0, dt_rate: s.dt_rate || 0,
        sub: s.subsistence || 0, total: s.line_total || 0,
        _suspicious: true, _suspicious_reason: s._reason || 'no roster match'
      }))
    ]
    const equipRows = tooMany ? [] : [
      ...allEquipment.map(e => ({
        type: e.equipment_type || '', equipment_id: e.unit_number || '',
        hours: e.hours || 0, rate: e.rate || 0, total: e.line_total || 0
      })),
      ...allSuspiciousEquipment.map(s => ({
        type: s.equipment_type || '', equipment_id: s.unit_number || '',
        hours: s.hours || 0, rate: s.rate || 0, total: s.line_total || 0,
        _suspicious: true, _suspicious_reason: 'unit not in equipment_fleet'
      }))
    ]
    // discrepancy_note combines the two manual-review signals when
    // either fires: name-hallucination (≥50% roster misses) and
    // equipment-overflow (>30 entries returned). Both can fire at
    // once on a really bad scan; the note enumerates both.
    const noteParts = []
    if (tooMany) {
      noteParts.push(`Manual entry required: ${allSuspicious.length} of ${totalReturned} OCR'd names failed roster cross-check (${Math.round(suspiciousRatio * 100)}%).`)
    }
    if (equipmentTruncated > 0) {
      noteParts.push(`Manual review required: OCR returned ${MAX_EQUIPMENT_PER_LEM + equipmentTruncated} equipment entries (cap is ${MAX_EQUIPMENT_PER_LEM}); ${equipmentTruncated} truncated. Verify against the LEM PDF.`)
    }
    const lemRow = {
      organization_id: ORG,
      field_log_id: meta.ticketNumber,
      foreman: meta.foreman,
      date: meta.date || '2014-01-21',
      labour_entries: labourRows,
      equipment_entries: equipRows,
      total_labour_cost: tooMany ? 0 : totalLabourCost,
      total_equipment_cost: tooMany ? 0 : totalEquipCost,
      discrepancy_note: noteParts.length > 0 ? noteParts.join(' ') : null
    }
    const existing = await rest(`/rest/v1/contractor_lems?organization_id=eq.${ORG}&field_log_id=eq.${encodeURIComponent(meta.ticketNumber)}&select=id&limit=1`)
    if (existing && existing.length > 0) {
      await rest(`/rest/v1/contractor_lems?id=eq.${existing[0].id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(lemRow)
      })
    } else {
      await rest(`/rest/v1/contractor_lems`, {
        method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(lemRow)
      })
    }
    savedLem++
    if (tooMany || equipmentTruncated > 0) flaggedLem++
    const truncTag = equipmentTruncated > 0 ? `  ⚠ TRUNCATED ${equipmentTruncated} equip` : ''
    console.log(`       #${meta.ticketNumber}  kept=${allLabour.length}  susp=${allSuspicious.length}  equip=${allEquipment.length}/${allSuspiciousEquipment.length}  $${totalLabourCost.toFixed(0)}${tooMany ? '  ⚠ FLAGGED' : ''}${truncTag}`)
  }
  console.log(`       ✓ wrote ${savedLem} contractor_lems rows (${flaggedLem} flagged for manual entry)\n`)

  // Step 6: document_matches between each LEM and its same-foreman ticket row.
  console.log('[6/6] Wiring document_matches between LEM and ticket rows by foreman+date…')
  const tktByForeman = new Map()
  for (const [g, m] of ticketGroupMeta) {
    const key = `${(m.foreman || '').toUpperCase().trim()}|${m.date || ''}`
    if (m.foreman && m.date) tktByForeman.set(key, m)
  }
  let matched = 0
  for (const [g, m] of lemGroupMeta) {
    if (!m.foreman || !m.date) continue
    const tkt = tktByForeman.get(`${m.foreman.toUpperCase().trim()}|${m.date}`)
    if (!tkt) continue
    try {
      await rest(`/rest/v1/document_matches`, {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          organization_id: ORG,
          lem_document_id: m.rowId,
          ticket_document_id: tkt.rowId,
          match_key: `${m.date}|${m.foreman.toUpperCase()}|recovered`,
          match_method: 'recovered',
          match_confidence: 1.0,
          status: 'confirmed'
        })
      })
      matched++
    } catch (_) { /* tolerate dupes / schema differences */ }
  }
  console.log(`       ✓ ${matched} document_matches written\n`)

  console.log('=== done ===')
}

main().catch(err => { console.error(err); process.exit(1) })
