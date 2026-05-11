/**
 * bulkUploadProcessor.js
 *
 * Bulk Upload pipeline for a single PDF containing all contractor LEMs and
 * daily tickets for a day (or longer period). The flow is:
 *
 *   1. splitPdfToPages(file)          — pdf.js render each page → base64 JPEG
 *   2. classifyPage(imageBase64)      — Claude Vision: doc_type, ticket #,
 *                                       date, foreman, crew, continuation?
 *   3. groupPagesIntoDocuments(rows)  — collate pages into multi-page docs
 *   4. matchLemsToTickets(groups)     — pair LEM ↔ daily ticket
 *   5. confirmAndSave(orgId, ...)     — upload split per-group PDFs, write
 *                                       reconciliation_documents +
 *                                       document_matches, kick off LEM OCR.
 *
 * The processor is deliberately stateless — the BulkUploadModal component
 * owns the UI and the running array of results. This file just does the
 * heavy lifting so it can also be unit-tested or reused (e.g. by an
 * admin-only re-process action).
 *
 * Ticket numbers on daily tickets are HANDWRITTEN (4–6 digits, often in
 * pen, anywhere on the page). The OCR prompt is tuned for that and we
 * surface a confidence indicator (high/medium/low) so the admin can
 * verify before confirming.
 */

import { supabase } from '../supabase.js'
import { pdfToImages, extractLEMFromUrl } from './lemParser.js'
import { normalizeName } from './nameMatchingUtils.js'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
const MAX_OCR_RETRIES = 3

// ── Step 1: split PDF into per-page base64 JPEGs ─────────────────────────────

export async function splitPdfToPages(file, onProgress) {
  if (!file) throw new Error('splitPdfToPages: file is required')
  const images = await pdfToImages(file, 500, onProgress)
  return images.map((base64, idx) => ({
    pageNumber: idx + 1,
    imageBase64: base64
  }))
}

// ── Step 2: per-page classification ──────────────────────────────────────────

/**
 * Send one page to Claude Vision and ask it to classify the doc type,
 * extract handwritten ticket number, date, foreman, crew, and judge
 * whether this is the first page of a new document or a continuation.
 *
 * Returns:
 *   {
 *     ticket_number: string | null,
 *     ticket_number_confidence: 'high' | 'medium' | 'low' | null,
 *     date: 'YYYY-MM-DD' | null,
 *     foreman_name: string | null,
 *     crew_or_spread: string | null,
 *     doc_type: 'lem' | 'daily_ticket' | 'unknown',
 *     has_rates_or_costs: boolean,
 *     page_appears_to_be: 'first_page' | 'continuation' | 'unknown',
 *     raw_response: string,
 *     error: string | null
 *   }
 */
export async function classifyPage(imageBase64) {
  const prompt = `Examine this scanned construction document page carefully.

Most pages will be one of two Somerville Aecon document formats, both
with a "SOMERVILLE AECON" logo at the top right:

FORMAT 1 - LEM (Labour & Equipment Manifest, billing sheet)
- Printed form with structured columns
- Header area (right side) has these labelled fields:
    "Field Log ID:"   -> ticket/LEM number (e.g. 18260) PRINTED
    "Foreman:"        -> foreman name (e.g. Gerald Babchishin)
    "Date:"           -> MM/DD/YYYY
    "Account #:"      -> project code (e.g. CLX2200)
    "Customer:"       -> client name
- Body: labour table with columns Employee | Labour Type | RT Hours |
  RT Rate | OT Hours | OT Rate | DT Hours | DT Rate | Total
- Continuation page (page 2 of a LEM): equipment table with Equipment
  ID, Equipment Type, Hours, Rate, Total, plus grand totals.
- HAS rate columns and dollar amounts.

FORMAT 2 - Daily Ticket (foreman's daily time report)
- Says "foreman's daily time report" near the top
- Right-side header fields:
    "branch:"   -> project location (e.g. Foster Creek)
    "job:"      -> job number
    "foreman:"  -> foreman name (e.g. GERALD BABCHISHIN)
    "crew:"     -> crew type (e.g. WELDING)
    "date:"     -> human date (e.g. Tue, Jan 21, 2014)
- Has a HANDWRITTEN ticket number somewhere on the page (often near
  the top or in the margin). 4-6 digits, in pen. This is the SAME
  number that appears as "Field Log ID" on the matching LEM.
- Body: labour names and types with HANDWRITTEN checkmarks/hours;
  equipment unit numbers with hours.
- Continuation page (page 2 of a ticket): handwritten activity
  description, signatures.
- NO rate columns, NO dollar amounts.

STEP 1 - Determine the document type:
  - Rate columns / dollar amounts / "RT Rate" / "OT Rate" /
    "Total Labour" / "Field Log Total" -> "lem"
  - Equipment table with unit IDs and rates -> "lem" (continuation)
  - "foreman's daily time report" or handwritten hours with
    checkmarks but no rate/dollar columns -> "daily_ticket"
  - Handwritten activity description + signatures, no rate cols ->
    "daily_ticket" (continuation)
  - If you genuinely cannot tell -> "unknown"

STEP 2 - Extract the header fields. Look in the HEADER AREA of the
page (top portion, usually right-aligned).

For LEMs:
  ticket_number    = the "Field Log ID:" value (printed, e.g. 18260)
  ticket_number_confidence = "high" (it's printed, you should be sure)
  date             = the "Date:" value, converted to YYYY-MM-DD
  foreman_name     = the "Foreman:" value
  crew_or_spread   = the "Account #:" value (or any crew/spread label
                     if more specific text exists like "WELDING CREW")

For Daily Tickets:
  ticket_number    = the HANDWRITTEN number. Search the entire page
                     (top, margins, corners). Usually 4-6 digits in
                     pen. Also check the "job:" field if you don't
                     see a clearer handwritten number.
  ticket_number_confidence:
    "high"   = clearly readable, every digit certain
    "medium" = partially legible, one or two digits uncertain
    "low"    = barely readable
    null     = no handwritten ticket number found
  date             = the "date:" value from the header (YYYY-MM-DD)
  foreman_name     = the "foreman:" value from the header
  crew_or_spread   = the "crew:" value from the header

For continuation pages (page 2 or later):
  - If the header fields are repeated, extract them.
  - If there is no header on this page, return all header fields as
    null. The system will inherit them from the previous page.
  - Look for "Page X of Y" text and set page_indicator.
  - Set is_continuation = true.

Distinguish HANDWRITTEN from PRINTED numbers. Pre-printed numbers
(page numbers, form revision numbers, pre-printed serials) are NOT
the ticket number. The handwritten ticket number is added in pen by
the foreman or inspector and on a daily ticket it usually matches
the "Field Log ID" on the corresponding LEM.

Return ONLY this JSON. No explanation, no markdown:

{
  "doc_type": "lem" | "daily_ticket" | "unknown",
  "ticket_number": "18260" or null,
  "ticket_number_confidence": "high" | "medium" | "low" | null,
  "date": "2014-01-21" or null,
  "foreman_name": "Gerald Babchishin" or null,
  "crew_or_spread": "WELDING" or null,
  "page_indicator": "Page 1 of 2" or null,
  "is_continuation": false | true,
  "has_rates_or_costs": true | false
}`

  const requestBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: prompt }
      ]
    }]
  }

  let lastError = null
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
        body: JSON.stringify(requestBody)
      })

      if (response.status === 429) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 5000))
        continue
      }

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        if (errBody.includes('credit balance')) {
          // Surface a recognizable error so the modal can stop processing
          // and the admin can top up credit without losing progress.
          throw new Error('CREDIT_BALANCE_TOO_LOW')
        }
        if (attempt < MAX_OCR_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        throw new Error(`API error ${response.status}: ${errBody.slice(0, 200)}`)
      }

      const result = await response.json()
      const text = result.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON in OCR response')
      }
      const parsed = JSON.parse(jsonMatch[0])

      // The new prompt returns is_continuation (boolean) + page_indicator
      // ("Page 1 of 2"). The grouping code still keys off the older
      // page_appears_to_be string, so derive it from the boolean. We also
      // accept the older field name if the model returns it.
      let page_appears_to_be = 'unknown'
      if (typeof parsed.is_continuation === 'boolean') {
        page_appears_to_be = parsed.is_continuation ? 'continuation' : 'first_page'
      } else if (['first_page', 'continuation', 'unknown'].includes(parsed.page_appears_to_be)) {
        page_appears_to_be = parsed.page_appears_to_be
      }

      return {
        ticket_number: cleanTicketNumber(parsed.ticket_number),
        ticket_number_confidence: parsed.ticket_number_confidence || null,
        date: cleanDate(parsed.date),
        foreman_name: (parsed.foreman_name || '').trim() || null,
        crew_or_spread: (parsed.crew_or_spread || '').trim() || null,
        doc_type: ['lem', 'daily_ticket', 'unknown'].includes(parsed.doc_type) ? parsed.doc_type : 'unknown',
        has_rates_or_costs: !!parsed.has_rates_or_costs,
        is_continuation: page_appears_to_be === 'continuation',
        page_indicator: (parsed.page_indicator || '').trim() || null,
        page_appears_to_be,
        raw_response: text,
        error: null
      }
    } catch (err) {
      lastError = err
      // CREDIT_BALANCE_TOO_LOW must bubble up so the caller can stop the
      // whole batch — don't keep retrying.
      if (err.message === 'CREDIT_BALANCE_TOO_LOW') throw err
      if (attempt < MAX_OCR_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
    }
  }

  return {
    ticket_number: null,
    ticket_number_confidence: null,
    date: null,
    foreman_name: null,
    crew_or_spread: null,
    doc_type: 'unknown',
    has_rates_or_costs: false,
    is_continuation: false,
    page_indicator: null,
    page_appears_to_be: 'unknown',
    raw_response: '',
    error: lastError?.message || 'OCR failed'
  }
}

function cleanTicketNumber(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s || s.toLowerCase() === 'null') return null
  // Strip any non-alphanumeric (sometimes Claude returns "#18301" or "18301-A")
  const stripped = s.replace(/[^A-Za-z0-9-]/g, '').trim()
  return stripped || null
}

function cleanDate(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s || s.toLowerCase() === 'null') return null
  // Allow YYYY-MM-DD; otherwise return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

// ── Step 3: group pages into documents ───────────────────────────────────────

/**
 * Group classified pages into multi-page documents.
 *
 * Rules per spec:
 *   - Pages with a ticket_number group together by that ticket number.
 *   - Pages without a ticket_number are continuations of the PREVIOUS
 *     group UNLESS the date, foreman, or crew changed (then a new group).
 *   - A group's doc_type is the consensus of its pages — if any page is
 *     classified 'lem', the group is 'lem' (LEMs are usually the doc
 *     type with the strongest classification signal because of rates).
 *
 * Returns groups in order, each:
 *   {
 *     id: 'g-<seq>',
 *     doc_type: 'lem' | 'daily_ticket' | 'unknown',
 *     ticket_number: string | null,
 *     ticket_number_confidence: 'high' | 'medium' | 'low' | null,
 *     date: 'YYYY-MM-DD' | null,
 *     foreman_name: string | null,
 *     crew_or_spread: string | null,
 *     pages: [{ pageNumber, classification }],
 *     match_key: 'date|foreman|crew' (normalized),
 *     needs_review: bool — set when doc_type === 'unknown' or page-level
 *                          OCR failed
 *   }
 */
export function groupPagesIntoDocuments(classifiedPages) {
  const groups = []
  let current = null
  let seq = 0

  const newGroup = (firstPage) => {
    seq++
    current = {
      id: `g-${seq}`,
      doc_type: firstPage.classification.doc_type,
      ticket_number: firstPage.classification.ticket_number,
      ticket_number_confidence: firstPage.classification.ticket_number_confidence,
      date: firstPage.classification.date,
      foreman_name: firstPage.classification.foreman_name,
      crew_or_spread: firstPage.classification.crew_or_spread,
      pages: [firstPage],
      needs_review: firstPage.classification.doc_type === 'unknown' || !!firstPage.classification.error
    }
    groups.push(current)
  }

  const headerChanged = (group, page) => {
    const c = page.classification
    // If any of the new page's fields are populated AND differ from the
    // group's known values, treat as a new document.
    if (c.date && group.date && c.date !== group.date) return true
    if (c.foreman_name && group.foreman_name &&
        normalizeName(c.foreman_name) !== normalizeName(group.foreman_name)) return true
    if (c.crew_or_spread && group.crew_or_spread &&
        c.crew_or_spread.trim().toLowerCase() !== group.crew_or_spread.trim().toLowerCase()) return true
    return false
  }

  for (const page of classifiedPages) {
    const c = page.classification

    // Ticket number is the primary grouping key when available
    if (c.ticket_number) {
      const existing = groups.find(g => g.ticket_number && g.ticket_number === c.ticket_number)
      if (existing) {
        existing.pages.push(page)
        // Fill any missing metadata from this page
        if (!existing.date && c.date) existing.date = c.date
        if (!existing.foreman_name && c.foreman_name) existing.foreman_name = c.foreman_name
        if (!existing.crew_or_spread && c.crew_or_spread) existing.crew_or_spread = c.crew_or_spread
        // Upgrade doc_type if we now have a clearer signal
        if (existing.doc_type === 'unknown' && c.doc_type !== 'unknown') existing.doc_type = c.doc_type
        // Upgrade ticket_number_confidence to the highest seen
        if (confidenceRank(c.ticket_number_confidence) > confidenceRank(existing.ticket_number_confidence)) {
          existing.ticket_number_confidence = c.ticket_number_confidence
        }
        current = existing
        continue
      }
      // New ticket number → new group
      newGroup(page)
      continue
    }

    // No ticket number on this page — continuation candidate
    if (current && !headerChanged(current, page) && c.page_appears_to_be !== 'first_page') {
      current.pages.push(page)
      // Fill any missing metadata
      if (!current.date && c.date) current.date = c.date
      if (!current.foreman_name && c.foreman_name) current.foreman_name = c.foreman_name
      if (!current.crew_or_spread && c.crew_or_spread) current.crew_or_spread = c.crew_or_spread
      if (current.doc_type === 'unknown' && c.doc_type !== 'unknown') current.doc_type = c.doc_type
      continue
    }

    // Otherwise: start a new group
    newGroup(page)
  }

  // After-pass: roll the doc_type consensus. If ANY page in the group
  // was classified 'lem' AND any has_rates_or_costs flag is true, lock
  // doc_type to 'lem' even if other pages were 'unknown'.
  for (const g of groups) {
    const anyLem = g.pages.some(p => p.classification.doc_type === 'lem')
    const anyHasRates = g.pages.some(p => p.classification.has_rates_or_costs)
    const anyTicket = g.pages.some(p => p.classification.doc_type === 'daily_ticket')
    if (anyLem || anyHasRates) {
      g.doc_type = 'lem'
    } else if (anyTicket) {
      g.doc_type = 'daily_ticket'
    }
    g.match_key = buildMatchKey(g)
    g.needs_review = g.doc_type === 'unknown'
      || g.pages.some(p => !!p.classification.error)
      || (g.ticket_number_confidence === 'low')
  }

  return groups
}

function confidenceRank(c) {
  if (c === 'high') return 3
  if (c === 'medium') return 2
  if (c === 'low') return 1
  return 0
}

export function buildMatchKey(group) {
  const date = group.date || 'unknown-date'
  const foreman = normalizeName(group.foreman_name || '') || 'unknown-foreman'
  const crew = (group.crew_or_spread || '').trim().toLowerCase() || 'unknown-crew'
  return `${date}|${foreman}|${crew}`
}

// ── Step 4: match LEMs to daily tickets ──────────────────────────────────────

/**
 * Pair LEM groups with daily-ticket groups.
 *
 * Strategy:
 *   1. If both sides share the same ticket_number, that's a strong match
 *      (method = ticket_number, confidence 0.95).
 *   2. Otherwise, match by date + normalized foreman + crew
 *      (method = date_foreman_crew, confidence 0.75).
 *   3. Anything left over is reported as unmatched.
 *
 * Returns:
 *   {
 *     matches: [{ lem, ticket, method, confidence, match_key }],
 *     unmatchedLems: [...],
 *     unmatchedTickets: [...],
 *     needsReview: [...]   // groups with doc_type 'unknown' or OCR error
 *   }
 */
export function matchLemsToTickets(groups) {
  const lems = groups.filter(g => g.doc_type === 'lem')
  const tickets = groups.filter(g => g.doc_type === 'daily_ticket')
  const needsReview = groups.filter(g => g.doc_type === 'unknown')

  const matches = []
  const usedLems = new Set()
  const usedTickets = new Set()

  // Pass 1: exact ticket_number match
  for (const lem of lems) {
    if (!lem.ticket_number) continue
    const candidate = tickets.find(t =>
      !usedTickets.has(t.id) && t.ticket_number && t.ticket_number === lem.ticket_number
    )
    if (candidate) {
      matches.push({
        lem,
        ticket: candidate,
        method: 'ticket_number',
        confidence: 0.95,
        match_key: lem.match_key
      })
      usedLems.add(lem.id)
      usedTickets.add(candidate.id)
    }
  }

  // Pass 2: date + foreman + crew match
  for (const lem of lems) {
    if (usedLems.has(lem.id)) continue
    const candidate = tickets.find(t =>
      !usedTickets.has(t.id) && t.match_key === lem.match_key &&
      // Avoid matching against an "unknown-*" placeholder match key
      !lem.match_key.startsWith('unknown-date') &&
      !lem.match_key.includes('|unknown-foreman|')
    )
    if (candidate) {
      matches.push({
        lem,
        ticket: candidate,
        method: 'date_foreman_crew',
        confidence: 0.75,
        match_key: lem.match_key
      })
      usedLems.add(lem.id)
      usedTickets.add(candidate.id)
    }
  }

  const unmatchedLems = lems.filter(l => !usedLems.has(l.id))
  const unmatchedTickets = tickets.filter(t => !usedTickets.has(t.id))

  return { matches, unmatchedLems, unmatchedTickets, needsReview }
}

// ── Step 5: confirm & save ───────────────────────────────────────────────────

/**
 * Upload the source PDF to Storage ONCE per bulk upload. Each group
 * then points at the same URL with its own `source_pages` slice. This
 * avoids pulling in a heavyweight PDF splitter (pdf-lib) and keeps the
 * source document intact for audit. The existing pdf.js-based viewer
 * already supports jumping to a specific page index.
 *
 * Returns the public URL — call once and cache.
 */
async function uploadSourcePdf(sourceFile, ctx) {
  const { orgId, bulkUploadId } = ctx
  const filename = `source-${Date.now()}.pdf`
  const storagePath = `${orgId}/bulk/${bulkUploadId}/${filename}`

  const { error: uploadErr } = await supabase.storage
    .from('reconciliation-docs')
    .upload(storagePath, sourceFile, { upsert: false, contentType: 'application/pdf' })
  if (uploadErr) throw new Error(`Source upload failed: ${uploadErr.message}`)

  const { data: urlData } = supabase.storage
    .from('reconciliation-docs')
    .getPublicUrl(storagePath)
  const publicUrl = urlData?.publicUrl
  if (!publicUrl) throw new Error(`Could not derive public URL for ${storagePath}`)
  return publicUrl
}

/**
 * Insert a reconciliation_documents row for one group. The file_urls
 * point at the shared source PDF; source_pages identifies which pages
 * belong to this group.
 *
 * Returns: { id, file_url, doc_type, ticket_number, group }
 */
async function insertGroupDocument(group, sourceUrl, ctx) {
  const { orgId, uploadedBy, bulkUploadId } = ctx
  const docTypeForStorage = group.doc_type === 'lem' ? 'contractor_lem' : 'contractor_ticket'

  // Pick the strongest confidence label across the group's pages.
  const confidences = group.pages.map(p => p.classification.ticket_number_confidence).filter(Boolean)
  const ocr_confidence = confidences.includes('high') ? 'high'
    : confidences.includes('medium') ? 'medium'
    : confidences.includes('low') ? 'low' : null

  // Ticket number is required by the existing schema. Synthesize one
  // when missing (e.g. tickets that arrived without a handwritten #)
  // so we don't break the NOT NULL constraint.
  const effectiveTicket = group.ticket_number
    || `AUTO-${(group.date || 'NODATE').replace(/-/g, '')}-${(group.foreman_name || 'NOFM').replace(/\s+/g, '').slice(0, 8).toUpperCase()}-${group.id}`

  const insertRow = {
    organization_id: orgId,
    ticket_number: effectiveTicket,
    doc_type: docTypeForStorage,
    file_urls: [sourceUrl],
    page_count: group.pages.length,
    status: 'ready',
    date: group.date || null,
    foreman: group.foreman_name || null,
    crew_or_spread: group.crew_or_spread || null,
    bulk_upload_id: bulkUploadId,
    source_pages: group.pages.map(p => p.pageNumber),
    ocr_confidence,
    uploaded_by: uploadedBy || null
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('reconciliation_documents')
    .insert(insertRow)
    .select('id')
    .single()
  if (insertErr) throw new Error(`Insert failed for ${group.id}: ${insertErr.message}`)

  return {
    id: inserted.id,
    file_url: sourceUrl,
    doc_type: docTypeForStorage,
    ticket_number: effectiveTicket,
    group
  }
}

/**
 * Run the LEM OCR extraction (existing extractLEMFromUrl) for a freshly
 * uploaded LEM group and upsert into contractor_lems. Mirrors the
 * single-upload behaviour in ReconciliationUpload.handleUpload.
 */
async function runLemExtractionForGroup(uploaded, orgId) {
  const allLabour = []
  const allEquipment = []
  let totalLabourCost = 0
  let totalEquipCost = 0

  try {
    const extracted = await extractLEMFromUrl(uploaded.file_url)
    for (const l of (extracted.labour || [])) {
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
    for (const e of (extracted.equipment || [])) {
      allEquipment.push({
        type: e.equipment_type || '',
        equipment_id: e.unit_number || '',
        hours: e.hours || 0,
        rate: e.rate || 0,
        total: e.line_total || 0
      })
      totalEquipCost += e.line_total || 0
    }
  } catch (err) {
    console.warn('[bulkUpload] LEM OCR extraction failed:', err.message)
    return false
  }

  if (allLabour.length === 0 && allEquipment.length === 0) return false

  const lemRecord = {
    organization_id: orgId,
    field_log_id: uploaded.ticket_number,
    foreman: uploaded.group.foreman_name || null,
    date: uploaded.group.date || new Date().toISOString().split('T')[0],
    labour_entries: allLabour,
    equipment_entries: allEquipment,
    total_labour_cost: totalLabourCost,
    total_equipment_cost: totalEquipCost
  }

  const { data: existing } = await supabase.from('contractor_lems')
    .select('id').eq('organization_id', orgId).eq('field_log_id', uploaded.ticket_number).limit(1)

  if (existing && existing.length > 0) {
    await supabase.from('contractor_lems').update(lemRecord).eq('id', existing[0].id)
  } else {
    await supabase.from('contractor_lems').insert(lemRecord)
  }
  return true
}

/**
 * Final "Confirm and Save" step. Splits the source PDF per group, uploads
 * each to Storage, creates reconciliation_documents rows, kicks off LEM
 * OCR for every LEM group, and writes document_matches rows for every
 * matched pair.
 *
 * onProgress(message, current, total) is called as work proceeds.
 */
export async function confirmAndSave({
  sourceFile,
  groups,
  matchResult,
  orgId,
  projectId,
  uploadedBy,
  bulkUploadId,
  onProgress
}) {
  if (!sourceFile) throw new Error('sourceFile is required')
  if (!orgId) throw new Error('orgId is required')

  // 1a. Upload the source PDF once — every group will reference it.
  onProgress?.('Uploading source PDF...', 0, 1)
  const sourceUrl = await uploadSourcePdf(sourceFile, { orgId, bulkUploadId })

  // 1b. Insert one reconciliation_documents row per group
  const idByGroupId = new Map()
  const all = [...groups]
  for (let i = 0; i < all.length; i++) {
    const g = all[i]
    if (g.doc_type === 'unknown') {
      // Skip — admin should reclassify before saving. We still report
      // it back so the modal can warn.
      continue
    }
    onProgress?.(`Recording document ${i + 1} of ${all.length}...`, i + 1, all.length)
    const uploaded = await insertGroupDocument(g, sourceUrl, { orgId, uploadedBy, bulkUploadId })
    idByGroupId.set(g.id, uploaded)
  }

  // 2. Kick off LEM OCR for each LEM group (non-blocking-ish, but await
  //    so the admin sees progress and the data is ready when the
  //    four-panel view opens). Failures are logged but don't abort.
  const lemUploads = [...idByGroupId.values()].filter(u => u.doc_type === 'contractor_lem')
  for (let i = 0; i < lemUploads.length; i++) {
    onProgress?.(`Extracting LEM data ${i + 1} of ${lemUploads.length} (30–60s each)...`, i + 1, lemUploads.length)
    await runLemExtractionForGroup(lemUploads[i], orgId)
  }

  // 3. Write document_matches rows for every matched pair
  const matchRows = []
  for (const m of matchResult.matches) {
    const lemUploaded = idByGroupId.get(m.lem.id)
    const ticketUploaded = idByGroupId.get(m.ticket.id)
    if (!lemUploaded || !ticketUploaded) continue
    matchRows.push({
      organization_id: orgId,
      project_id: projectId || null,
      lem_document_id: lemUploaded.id,
      ticket_document_id: ticketUploaded.id,
      match_key: m.match_key,
      match_method: m.method,
      match_confidence: m.confidence,
      status: 'confirmed',
      confirmed_by: uploadedBy || null,
      confirmed_at: new Date().toISOString()
    })
  }
  if (matchRows.length > 0) {
    onProgress?.(`Saving ${matchRows.length} match record${matchRows.length === 1 ? '' : 's'}...`, matchRows.length, matchRows.length)
    const { error: matchErr } = await supabase.from('document_matches').insert(matchRows)
    if (matchErr) console.warn('[bulkUpload] document_matches insert error:', matchErr)
  }

  return {
    uploadedCount: idByGroupId.size,
    matchCount: matchRows.length,
    skippedUnknown: all.filter(g => g.doc_type === 'unknown').length
  }
}

// ── Helper: process the whole pipeline up to (but not including) save ────────

/**
 * Run steps 1-4 end to end. The caller (modal) then shows the results
 * for review and finally calls confirmAndSave() when the admin confirms.
 */
export async function processPdfForReview(file, onProgress, { onCreditError } = {}) {
  onProgress?.('Splitting PDF into pages...', 0, 1)
  const pages = await splitPdfToPages(file, (msg) => onProgress?.(msg))

  const classifiedPages = []
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(`Classifying page ${i + 1} of ${pages.length}...`, i + 1, pages.length)
    try {
      const classification = await classifyPage(pages[i].imageBase64)
      classifiedPages.push({ ...pages[i], classification })
    } catch (err) {
      if (err.message === 'CREDIT_BALANCE_TOO_LOW') {
        onCreditError?.(classifiedPages, pages)
        throw err
      }
      classifiedPages.push({
        ...pages[i],
        classification: {
          ticket_number: null, ticket_number_confidence: null,
          date: null, foreman_name: null, crew_or_spread: null,
          doc_type: 'unknown', has_rates_or_costs: false,
          is_continuation: false, page_indicator: null,
          page_appears_to_be: 'unknown',
          raw_response: '', error: err.message
        }
      })
    }
  }

  onProgress?.('Grouping pages into documents...', pages.length, pages.length)
  const groups = groupPagesIntoDocuments(classifiedPages)

  onProgress?.('Matching LEMs to daily tickets...', pages.length, pages.length)
  const matchResult = matchLemsToTickets(groups)

  return { pages: classifiedPages, groups, matchResult }
}
