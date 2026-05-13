/**
 * bulkUploadProcessor.js — Semi-automated bulk upload pipeline
 *
 * The previous fully-automatic per-page OCR approach was 0% accurate on
 * scanned 2014 documents (handwritten ticket numbers, faded scans,
 * inconsistent layouts). This rewrite is human-in-the-loop:
 *
 *   1. splitPdfToPages(file)          - pdf.js renders each page to JPEG
 *   2. classifyIndexPage(img)         - one-shot: "is page 1 an index?"
 *                                       (only call for the first page)
 *   3. suggestPageMetadata(img)       - minimal background OCR: doc_type,
 *                                       PRINTED field_log_id, PRINTED
 *                                       foreman, date. No handwriting.
 *   4. (admin sorts pages via drag/drop in the UI)
 *   5. saveBulkUploadGroups(...)      - persists confirmed groups:
 *                                       reconciliation_documents row per
 *                                       group, document_matches for
 *                                       LEM<->ticket pairs, runs the
 *                                       existing extractLEMFromUrl on
 *                                       LEM groups to populate
 *                                       contractor_lems.
 *
 * Plus a DiagnosticsRecorder that streams every raw OCR response to
 * localStorage for offline analysis, and a Workspace helper that
 * persists in-progress grouping state so the admin can close the
 * browser and resume.
 */

import { supabase } from '../supabase.js'
import { pdfToImages, extractLEMFromUrl, extractLEMLineItemsFromBase64 } from './lemParser.js'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
const MAX_OCR_RETRIES = 3

// ── PDF -> page images ──────────────────────────────────────────────────────

/**
 * Render each page of the PDF to a base64 JPEG via pdf.js.
 *
 * onPage(pageObj) — optional progress callback fired AS each page
 * finishes rendering, so the modal can stream thumbnails into the grid
 * without waiting for the whole PDF.
 */
export async function splitPdfToPages(file, onPage) {
  if (!file) throw new Error('splitPdfToPages: file required')
  // pdfToImages renders all pages at once and returns the array. We
  // still surface progress via the underlying onProgress callback.
  // For true streaming we'd need a lower-level pdf.js loop — this is
  // a fast-follow improvement; for now we render all then fire onPage
  // synchronously per page so the UI can populate.
  const images = await pdfToImages(file, 500, (msg) => onPage?.({ progress: msg }))
  const pages = images.map((base64, idx) => ({
    pageNumber: idx + 1,
    imageBase64: base64
  }))
  for (const p of pages) onPage?.({ page: p })
  return pages
}

// ── Index page detection ────────────────────────────────────────────────────

const INDEX_PROMPT = `Look at this page. Is it an index / cover page that
lists multiple foremen or supervisors with their ticket / Field Log
numbers for a single day?

Answer with JSON only:

If YES, extract every row of the table:
{
  "is_index": true,
  "date": "YYYY-MM-DD" or null,
  "entries": [
    { "last_name": "Babchishin", "first_name": "Gerald", "role": "General Foreman", "ticket_number": "18260" }
  ]
}

If NO, just return:
{ "is_index": false }

Rules for YES case:
- Only include rows that name a real person (first + last name).
- Do NOT include equipment rows (LIGHTTOWR, POTTY PORTA, BULL BIG,
  GENERATOR, TANK, TRUCK, etc.).
- Do NOT invent rows that aren't on the page.
- ticket_number is digits only.

Return JSON only. No markdown.`

export async function classifyIndexPage(imageBase64) {
  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: INDEX_PROMPT }
      ]
    }]
  }
  const text = await callAnthropic(body)
  const parsed = parseJsonish(text)
  if (!parsed || !parsed.is_index) {
    return { is_index: false, raw_response: text }
  }
  const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : []
  const entries = rawEntries
    .map(e => ({
      first_name: (e.first_name || '').trim(),
      last_name: (e.last_name || '').trim(),
      role: (e.role || '').trim(),
      ticket_number: cleanTicketNumber(e.ticket_number)
    }))
    .filter(e => e.ticket_number && (e.first_name || e.last_name))
    .filter(e => !looksLikeEquipmentEntry(e))

  return {
    is_index: true,
    date: cleanDate(parsed.date),
    entries,
    raw_response: text
  }
}

// ── Per-page suggestion (minimal prompt, printed labels only) ───────────────

const SUGGEST_PROMPT = `Look at this scanned construction document page.

Classify the page by its DATA CONTENT, not by the presence of a
signature. A signature on a page does NOT change its document type:
- A LEM page with labour rows + equipment rows + a signature at the
  bottom is STILL a LEM (its content is billing data).
- A daily ticket page with crew hours + a signature at the bottom
  is STILL a daily_ticket (its content is crew hours).
- Only classify as "signature" when the page has NOTHING but
  signatures, stamps, or verification marks — no labour rows, no
  equipment rows, no rate columns, no crew hours, no activity
  description.

Then extract metadata ONLY from clearly PRINTED labels.

1. doc_type:
   - "lem" if the page has rate columns, dollar amounts, "RT Rate",
     "OT Rate", "Total Labour", "Field Log Total", or an equipment
     table with unit IDs and rates. (Signatures may also be present
     — irrelevant; the rate columns make it a LEM.)
   - "daily_ticket" if the page has crew names + hours WITHOUT rate
     columns, or "foreman's daily time report" header, or a
     handwritten activity description belonging to a daily ticket.
     (Signatures may also be present — irrelevant; the data
     content makes it a daily_ticket.)
   - "signature" ONLY if the page contains NOTHING but signatures,
     stamps, approval marks. No data rows of any kind.
   - "summary" if it's a weekly summary with date ranges.
   - "index" if it lists multiple foremen with ticket numbers.
   - "unknown" otherwise.

2. has_signature: true if any signature, stamp, or approval mark is
   visible ANYWHERE on the page. false otherwise. This is a separate
   flag — it does NOT change doc_type.

3. field_log_id: ONLY if you see a PRINTED label "Field Log ID:"
   followed by a number. Ignore any handwritten numbers. null if no
   printed label.

4. foreman_name: ONLY if you see a PRINTED label "Foreman:" or
   "foreman:" followed by a name. null otherwise.

5. date: ONLY if clearly printed in a header field. null otherwise.

If a field isn't clearly PRINTED and LABELED, return null. Do NOT
guess. Do NOT read handwriting.

Return JSON only:
{
  "doc_type": "lem"|"daily_ticket"|"signature"|"summary"|"index"|"unknown",
  "has_signature": true|false,
  "field_log_id": "18260" or null,
  "foreman_name": "Gerald Babchishin" or null,
  "date": "2014-01-21" or null
}`

export async function suggestPageMetadata(imageBase64) {
  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: SUGGEST_PROMPT }
      ]
    }]
  }
  const text = await callAnthropic(body)
  const parsed = parseJsonish(text)
  const validDocTypes = ['lem', 'daily_ticket', 'signature', 'summary', 'index', 'unknown']
  return {
    doc_type: validDocTypes.includes(parsed?.doc_type) ? parsed.doc_type : 'unknown',
    has_signature: !!parsed?.has_signature,
    field_log_id: cleanTicketNumber(parsed?.field_log_id),
    foreman_name: (parsed?.foreman_name || '').trim() || null,
    date: cleanDate(parsed?.date),
    raw_response: text
  }
}

// ── Save: confirmed groups -> reconciliation_documents + LEM extraction ────

/**
 * Persist the confirmed grouping to the database.
 *
 * Inputs:
 *   sourceFile        — the original package PDF (uploaded once, shared
 *                       across every group via source_pages[])
 *   groups            — [{ id, ticket_number, foreman_name, role, date,
 *                          lemPages: [n,n,...], ticketPages: [...],
 *                          otherPages: [...] }]
 *   orgId, uploadedBy, bulkUploadId
 *   onProgress(message, current, total)
 *
 * Behaviour:
 *   1. Upload source PDF once to reconciliation-docs storage.
 *   2. For each group with LEM pages: insert one reconciliation_documents
 *      row (doc_type=contractor_lem), source_pages = lemPages.
 *   3. For each group with ticket pages: insert another row
 *      (doc_type=contractor_ticket), source_pages = ticketPages.
 *   4. For each group with BOTH: insert a document_matches row.
 *   5. For each LEM group: run extractLEMFromUrl + upsert contractor_lems
 *      (mirrors the single-doc upload behaviour).
 *
 * Returns:
 *   { uploadedCount, matchCount, lemExtractedCount }
 */
export async function saveBulkUploadGroups({
  sourceFile,
  groups,
  allPages = [],          // [{ pageNumber, imageBase64 }] — already-rendered
                          // cache from the workspace. Used for in-memory LEM
                          // OCR so we don't re-fetch + re-render the source
                          // PDF and don't accidentally OCR every page of
                          // the bulk upload as one foreman's LEM.
  orgId,
  projectId = null,
  uploadedBy = null,
  bulkUploadId,
  onProgress
}) {
  if (!sourceFile) throw new Error('saveBulkUploadGroups: sourceFile required')
  if (!orgId) throw new Error('saveBulkUploadGroups: orgId required')
  if (!bulkUploadId) throw new Error('saveBulkUploadGroups: bulkUploadId required')

  // Lookup: pageNumber -> imageBase64. Used by the LEM extraction step.
  const pageImageByNumber = new Map()
  for (const p of allPages) {
    if (p?.pageNumber != null) pageImageByNumber.set(p.pageNumber, p.imageBase64)
  }

  onProgress?.('Uploading source PDF...', 0, 1)
  const sourceUrl = await uploadSourcePdf(sourceFile, orgId, bulkUploadId)

  const inserted = { lems: new Map(), tickets: new Map() } // groupId -> row id

  const total = groups.length
  for (let i = 0; i < total; i++) {
    const g = groups[i]
    const ticketLabel = g.ticket_number || g.id
    onProgress?.(`Saving group ${i + 1} of ${total} — ${g.foreman_name || 'unknown'} #${ticketLabel}...`, i + 1, total)

    const lemAllPages = [...(g.lemPages || []), ...(g.otherPages || [])]
      .filter((v, idx, arr) => arr.indexOf(v) === idx)
      .sort((a, b) => a - b)
    const ticketPages = (g.ticketPages || []).slice().sort((a, b) => a - b)

    if (lemAllPages.length > 0) {
      const lemId = await insertGroupRow({
        orgId, uploadedBy, bulkUploadId,
        docType: 'contractor_lem',
        group: g,
        pages: lemAllPages,
        sourceUrl
      })
      inserted.lems.set(g.id, { id: lemId, ticket_number: ticketNumberForRow(g), foreman: g.foreman_name })
    }
    if (ticketPages.length > 0) {
      const tktId = await insertGroupRow({
        orgId, uploadedBy, bulkUploadId,
        docType: 'contractor_ticket',
        group: g,
        pages: ticketPages,
        sourceUrl
      })
      inserted.tickets.set(g.id, { id: tktId, ticket_number: ticketNumberForRow(g), foreman: g.foreman_name })
    }
  }

  // LEM extraction on every LEM group — populates contractor_lems.
  // The OCR runs DIRECTLY on the in-memory page images for this
  // group only (NOT the whole source PDF) so the extracted billing
  // data is scoped to this foreman's LEM pages.
  let lemExtractedCount = 0
  const lemEntries = [...inserted.lems.entries()]
  for (let i = 0; i < lemEntries.length; i++) {
    const [groupId, row] = lemEntries[i]
    const group = groups.find(g => g.id === groupId)
    onProgress?.(`Extracting LEM data ${i + 1} of ${lemEntries.length} (30-60s each)...`, i + 1, lemEntries.length)
    try {
      const ok = await runLemExtractionForGroup({
        row, group, orgId, pageImageByNumber
      })
      if (ok) lemExtractedCount++
    } catch (err) {
      console.warn('[bulkUpload] LEM extraction failed for', row.id, err.message)
    }
  }

  // document_matches rows for groups that have both LEM + ticket
  let matchCount = 0
  const matchRows = []
  for (const g of groups) {
    const lem = inserted.lems.get(g.id)
    const tkt = inserted.tickets.get(g.id)
    if (!lem || !tkt) continue
    matchRows.push({
      organization_id: orgId,
      project_id: projectId,
      lem_document_id: lem.id,
      ticket_document_id: tkt.id,
      match_key: buildMatchKey(g),
      match_method: 'manual',
      match_confidence: 1.0,
      status: 'confirmed',
      confirmed_by: uploadedBy,
      confirmed_at: new Date().toISOString()
    })
  }
  if (matchRows.length > 0) {
    onProgress?.(`Writing ${matchRows.length} match record${matchRows.length === 1 ? '' : 's'}...`, matchRows.length, matchRows.length)
    const { error } = await supabase.from('document_matches').insert(matchRows)
    if (error) console.warn('[bulkUpload] document_matches insert error:', error)
    else matchCount = matchRows.length
  }

  return {
    uploadedCount: inserted.lems.size + inserted.tickets.size,
    matchCount,
    lemExtractedCount
  }
}

// ── DB / Storage helpers ───────────────────────────────────────────────────

async function uploadSourcePdf(file, orgId, bulkUploadId) {
  const path = `${orgId}/bulk/${bulkUploadId}/source-${Date.now()}.pdf`
  const { error } = await supabase.storage.from('reconciliation-docs')
    .upload(path, file, { upsert: false, contentType: 'application/pdf' })
  if (error) throw new Error(`Source upload failed: ${error.message}`)
  const { data } = supabase.storage.from('reconciliation-docs').getPublicUrl(path)
  if (!data?.publicUrl) throw new Error(`No public URL for ${path}`)
  return data.publicUrl
}

async function insertGroupRow({ orgId, uploadedBy, bulkUploadId, docType, group, pages, sourceUrl }) {
  const effectiveTicket = ticketNumberForRow(group)
  const row = {
    organization_id: orgId,
    ticket_number: effectiveTicket,
    doc_type: docType,
    file_urls: [sourceUrl],
    page_count: pages.length,
    status: 'ready',
    date: group.date || null,
    foreman: group.foreman_name || null,
    crew_or_spread: group.role || null,
    bulk_upload_id: bulkUploadId,
    source_pages: pages,
    ocr_confidence: 'high', // human-confirmed
    uploaded_by: uploadedBy
  }
  const { data, error } = await supabase.from('reconciliation_documents')
    .insert(row).select('id').single()
  if (error) throw new Error(`Insert failed for group ${group.id}: ${error.message}`)
  return data.id
}

function ticketNumberForRow(g) {
  if (g.ticket_number) return String(g.ticket_number).trim()
  // Synthesise a deterministic key so the existing schema's NOT NULL
  // ticket_number constraint stays satisfied. The label format keeps
  // these rows visually distinguishable in the reconciliation list.
  const dt = (g.date || 'NODATE').replace(/-/g, '')
  const fm = (g.foreman_name || 'NOFM').replace(/\s+/g, '').slice(0, 10).toUpperCase()
  return `AUTO-${dt}-${fm}-${g.id}`
}

function buildMatchKey(g) {
  const date = (g.date || 'unknown-date')
  const fm = (g.foreman_name || 'unknown-foreman').toUpperCase().trim()
  const role = (g.role || '').toLowerCase().trim()
  return `${date}|${fm}|${role}`
}

/**
 * Run the existing LEM OCR (`extractLEMLineItemsFromBase64`) on every
 * page of THIS group's LEM slot and upsert the aggregated labour +
 * equipment data into contractor_lems.
 *
 * Previously this called `extractLEMFromUrl(row.file_url)` — which
 * (a) was broken because `row` never had `file_url` set, and
 * (b) would have re-fetched and re-rendered the entire bulk-upload
 * source PDF, so a single foreman's LEM would have been "extracted"
 * from all 130 pages of the package. Both bugs go away now that we
 * pass the per-page image cache straight in.
 *
 * Returns true if anything was written to contractor_lems.
 */
async function runLemExtractionForGroup({ row, group, orgId, pageImageByNumber }) {
  const lemPages = [...(group.lemPages || []), ...(group.otherPages || [])]
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .sort((a, b) => a - b)
  if (lemPages.length === 0) return false

  const allLabour = []
  const allEquipment = []
  let totalLabourCost = 0
  let totalEquipCost = 0
  let totalLabourHours = 0
  let totalEquipHours = 0

  for (const pageNumber of lemPages) {
    const b64 = pageImageByNumber?.get(pageNumber)
    if (!b64) {
      console.warn(`[bulkUpload] no rendered image for page ${pageNumber} (group ${group.id})`)
      continue
    }
    let pageResult
    try {
      pageResult = await extractLEMLineItemsFromBase64(b64)
    } catch (err) {
      console.warn(`[bulkUpload] LEM OCR failed on page ${pageNumber}:`, err.message)
      continue
    }
    for (const l of (pageResult?.labour || [])) {
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
      totalLabourHours += (l.rt_hours || 0) + (l.ot_hours || 0)
    }
    for (const e of (pageResult?.equipment || [])) {
      allEquipment.push({
        type: e.equipment_type || '',
        equipment_id: e.unit_number || '',
        hours: e.hours || 0,
        rate: e.rate || 0,
        total: e.line_total || 0
      })
      totalEquipCost += e.line_total || 0
      totalEquipHours += e.hours || 0
    }
  }

  if (allLabour.length === 0 && allEquipment.length === 0) {
    console.warn(`[bulkUpload] group ${group.id} (#${row.ticket_number}) produced no LEM rows from ${lemPages.length} page(s)`)
    return false
  }

  const lemRow = {
    organization_id: orgId,
    field_log_id: row.ticket_number,
    foreman: group.foreman_name || null,
    date: group.date || new Date().toISOString().split('T')[0],
    labour_entries: allLabour,
    equipment_entries: allEquipment,
    total_labour_cost: totalLabourCost,
    total_equipment_cost: totalEquipCost
  }
  const { data: existing } = await supabase.from('contractor_lems')
    .select('id').eq('organization_id', orgId).eq('field_log_id', row.ticket_number).limit(1)
  if (existing && existing.length > 0) {
    const { error } = await supabase.from('contractor_lems').update(lemRow).eq('id', existing[0].id)
    if (error) { console.error('[bulkUpload] contractor_lems update error:', error); return false }
  } else {
    const { error } = await supabase.from('contractor_lems').insert(lemRow)
    if (error) { console.error('[bulkUpload] contractor_lems insert error:', error); return false }
  }
  console.log(`[bulkUpload] contractor_lems written for #${row.ticket_number}: ${allLabour.length} labour, ${allEquipment.length} equipment`)
  return true
}

// ── Workspace persistence (localStorage) ───────────────────────────────────

const WORKSPACE_PREFIX = 'bulk_upload_workspace_'

/**
 * Persist a workspace snapshot. We don't store imageBase64 (too large
 * for localStorage); on reload the admin re-uploads the file and the
 * grouping state is restored by filename + file size signature.
 */
export function saveWorkspace(workspaceId, state) {
  if (!workspaceId) return
  const key = WORKSPACE_PREFIX + workspaceId
  // Strip page images before persist
  const stripped = {
    ...state,
    pages: undefined,           // never persist the rendered images
    pageMetadata: state.pageMetadata
      ? Array.from(state.pageMetadata.entries())   // Map -> serializable
      : []
  }
  try {
    localStorage.setItem(key, JSON.stringify(stripped))
  } catch (err) {
    console.warn('[bulkUpload] workspace save failed:', err.message)
  }
}

export function loadWorkspace(workspaceId) {
  const key = WORKSPACE_PREFIX + workspaceId
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.pageMetadata)) {
      parsed.pageMetadata = new Map(parsed.pageMetadata)
    }
    return parsed
  } catch (_) { return null }
}

export function listWorkspaces() {
  const out = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(WORKSPACE_PREFIX)) continue
    try {
      const v = JSON.parse(localStorage.getItem(k))
      out.push({
        workspaceId: k.slice(WORKSPACE_PREFIX.length),
        fileName: v.fileName,
        fileSize: v.fileSize,
        savedAt: v.savedAt,
        groupCount: (v.groups || []).length,
        pageCount: v.pageCount
      })
    } catch (_) { /* skip */ }
  }
  return out.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
}

export function deleteWorkspace(workspaceId) {
  localStorage.removeItem(WORKSPACE_PREFIX + workspaceId)
}

// Build a stable id from file name + size so reuploading the same
// file resumes the same workspace.
export function workspaceIdFor(file) {
  if (!file) return null
  const safeName = (file.name || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
  return `${safeName}__${file.size}`
}

// ── Diagnostics recorder (kept from previous iteration, simplified) ────────

const DIAG_KEY_PREFIX = 'bulk_upload_diag_'

export function createDiagnosticsRecorder(bulkUploadId) {
  if (!bulkUploadId) return null
  const key = DIAG_KEY_PREFIX + bulkUploadId
  const state = {
    schemaVersion: 2,
    bulkUploadId,
    startedAt: new Date().toISOString(),
    packageFilename: null,
    pageCount: null,
    index: null,
    suggestions: [],     // [{ pageNumber, suggestion, raw_response, error }]
    groups: null,        // confirmed groups at save time
    saveSummary: null,
    completedAt: null
  }
  const flush = () => {
    try { localStorage.setItem(key, JSON.stringify(state)) } catch (e) { console.warn(e.message) }
  }
  flush()
  return {
    key,
    setPackageMeta: (m) => { Object.assign(state, m); flush() },
    setIndex: (idx) => { state.index = idx; flush() },
    addSuggestion: (s) => { state.suggestions.push(s); flush() },
    setGroups: (g) => { state.groups = g; flush() },
    setSaveSummary: (s) => { state.saveSummary = s; flush() },
    finalize: () => {
      state.completedAt = new Date().toISOString()
      flush()
      try {
        console.groupCollapsed(`[bulk-upload diag] ${bulkUploadId}`)
        console.log('Package:', state.packageFilename, '|', state.pageCount, 'pages')
        console.log('Index entries:', state.index?.entries?.length || 0, 'detected:', !!state.index?.is_index)
        console.table(state.suggestions.map(s => ({
          page: s.pageNumber,
          doc_type: s.suggestion?.doc_type,
          field_log_id: s.suggestion?.field_log_id,
          foreman: s.suggestion?.foreman_name,
          error: s.error || ''
        })))
        if (state.groups) console.log('Groups confirmed:', state.groups.length)
        if (state.saveSummary) console.log('Save:', state.saveSummary)
        console.log('Snapshot: JSON.parse(localStorage.getItem("' + key + '"))')
        console.groupEnd()
      } catch (_) { /* ignore */ }
    },
    snapshot: () => ({ ...state })
  }
}

// ── Anthropic API call helper (shared) ──────────────────────────────────────

async function callAnthropic(body) {
  let lastErr = null
  for (let attempt = 0; attempt < MAX_OCR_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body)
      })
      if (response.status === 429) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 5000))
        continue
      }
      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        if (errBody.includes('credit balance')) throw new Error('CREDIT_BALANCE_TOO_LOW')
        if (attempt < MAX_OCR_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        throw new Error(`Anthropic API ${response.status}: ${errBody.slice(0, 200)}`)
      }
      const json = await response.json()
      return json.content?.[0]?.text || ''
    } catch (err) {
      lastErr = err
      if (err.message === 'CREDIT_BALANCE_TOO_LOW') throw err
      if (attempt < MAX_OCR_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
    }
  }
  throw lastErr || new Error('OCR failed')
}

function parseJsonish(text) {
  if (!text) return null
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch (_) { return null }
}

function cleanTicketNumber(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s || s.toLowerCase() === 'null') return null
  const stripped = s.replace(/[^A-Za-z0-9-]/g, '').trim()
  return stripped || null
}

function cleanDate(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s || s.toLowerCase() === 'null') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

// Equipment-vs-person filter for index entries (keep equipment OUT of
// the foreman dropdown).
const EQUIPMENT_KEYWORDS = [
  'TOWR', 'TOWER', 'PORTA', 'POTTY', 'BULL', 'FULDETECT', 'TANK',
  'PUMP', 'GENERATOR', 'COMPRESSOR', 'WELDER', 'TORCH', 'GRINDER',
  'TRUCK', 'TRAILER', 'PICKUP', 'EXCAVATOR', 'BACKHOE', 'BULLDOZER',
  'SIDEBOOM', 'GENSET', 'LIGHT', 'HEATER', 'BOILER', 'BOOM',
  'FORKLIFT', 'BOBCAT', 'LOADER', 'GRADER', 'DOZER', 'PACKER'
]
function looksLikeEquipmentEntry(entry) {
  const first = (entry.first_name || '').toUpperCase()
  const last = (entry.last_name || '').toUpperCase()
  const combined = `${first} ${last}`.trim()
  if (!combined) return true
  if (/\d/.test(combined)) return true
  for (const kw of EQUIPMENT_KEYWORDS) if (combined.includes(kw)) return true
  const letters = combined.replace(/[^A-Z]/g, '')
  const vowels = (combined.match(/[AEIOU]/g) || []).length
  if (letters.length >= 5 && vowels === 0) return true
  if (letters.length >= 8 && vowels < 2) return true
  return false
}
