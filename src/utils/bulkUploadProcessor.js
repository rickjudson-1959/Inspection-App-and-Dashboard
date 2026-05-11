/**
 * bulkUploadProcessor.js
 *
 * Bulk Upload pipeline for a single PDF containing all contractor LEMs and
 * daily tickets for a day. Two-step flow:
 *
 *   Step A — INDEX PAGE (one-time per date):
 *     classifyIndexPage(file) -> { date, entries:[{first, last, role,
 *                                                  ticket_number}, ...] }
 *     saveTicketIndex(orgId, date, entries, sourceUrl)
 *     loadTicketIndex(orgId, date)
 *
 *   Step B — PACKAGE PDF (the 130-page bulk file):
 *     splitPdfToPages(file)              -> per-page base64 JPEGs
 *     classifyPage(imageBase64)          -> Claude Vision: doc_type, ticket
 *                                           number, foreman, crew,
 *                                           continuation, etc.
 *     reconcileWithIndex(pages, index)   -> use the index to fill in
 *                                           missing ticket numbers based on
 *                                           foreman name, cross-validate
 *                                           when both sides are present
 *     groupPagesIntoDocuments(pages)     -> collate by ticket number;
 *                                           max 5 pages/group; signature
 *                                           pages append to preceding LEM
 *     matchLemsToTicketsByIndex(groups)  -> within each ticket-number
 *                                           group, separate LEM pages
 *                                           from daily-ticket pages
 *     confirmAndSave(...)                -> upload + extract + write
 *                                           reconciliation_documents +
 *                                           document_matches rows.
 *
 * The processor is deliberately stateless — the BulkUploadModal owns the
 * UI and progressive state. This file just does the heavy lifting so it
 * can also be unit-tested or reused (e.g. by an admin re-process action).
 *
 * Daily-ticket ticket numbers are HANDWRITTEN (4-6 digits, in pen,
 * anywhere on the page). The OCR prompt is tuned for that and we surface
 * a confidence indicator (high/medium/low) so the admin can verify
 * before confirming. The index reconciliation step gives us a second
 * source of truth so a missed handwritten read can still produce a
 * correct group.
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

// ── Step A: INDEX PAGE OCR + persistence ─────────────────────────────────────

/**
 * OCR the per-date index page. Returns:
 *   {
 *     date: 'YYYY-MM-DD' | null,
 *     entries: [{ first_name, last_name, role, ticket_number }, ...],
 *     raw_response: string,
 *     error: string | null
 *   }
 */
export async function classifyIndexPage(imageBase64) {
  const prompt = `This is an index page from a construction contractor's
daily package. It lists foremen / supervisors, their roles, and their
assigned ticket / Field Log numbers for the day.

The format is a table with columns:
  - Last name (leftmost)
  - First name
  - Role / title (e.g. "General Foreman", "Journeyman/Fitter Auto")
  - Field Log # / Ticket number (rightmost — handwritten 5-digit
    numbers in the 18xxx range)

The date is shown at the top (often in the form "21-Jan-14" or
"January 21, 2014").

Extract EVERY row in the table. Convert the date to YYYY-MM-DD.

Return ONLY this JSON. No markdown, no commentary:

{
  "date": "2014-01-21" or null,
  "entries": [
    { "last_name": "Babchishin", "first_name": "Gerald", "role": "General Foreman", "ticket_number": "18260" },
    { "last_name": "Baran", "first_name": "Chuck", "role": "General Foreman", "ticket_number": "18261" }
  ]
}

Rules:
  - Skip header rows.
  - Skip rows where the ticket_number is illegible — include only
    entries you can read with reasonable confidence.
  - ticket_number is digits only. Strip any "#" or "No." prefix.
  - If you cannot find ANY rows, return an empty entries array.`

  const requestBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2500,
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
        if (errBody.includes('credit balance')) throw new Error('CREDIT_BALANCE_TOO_LOW')
        if (attempt < MAX_OCR_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        throw new Error(`Index OCR API ${response.status}: ${errBody.slice(0, 200)}`)
      }
      const result = await response.json()
      const text = result.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON in index OCR response')
      const parsed = JSON.parse(jsonMatch[0])
      const entries = Array.isArray(parsed.entries) ? parsed.entries : []
      return {
        date: cleanDate(parsed.date),
        entries: entries.map(e => ({
          last_name: (e.last_name || '').trim(),
          first_name: (e.first_name || '').trim(),
          role: (e.role || '').trim(),
          ticket_number: cleanTicketNumber(e.ticket_number)
        })).filter(e => e.ticket_number && (e.first_name || e.last_name)),
        raw_response: text,
        error: null
      }
    } catch (err) {
      lastError = err
      if (err.message === 'CREDIT_BALANCE_TOO_LOW') throw err
      if (attempt < MAX_OCR_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
    }
  }
  return { date: null, entries: [], raw_response: '', error: lastError?.message || 'Index OCR failed' }
}

/**
 * Convenience: OCR every page of an index PDF and merge entries. Index
 * pages might span 2+ pages if the foreman list is long. The date is
 * taken from the first page that returns one.
 */
export async function classifyIndexFile(file, onProgress) {
  const pages = await splitPdfToPages(file, onProgress)
  const merged = { date: null, entries: [], pageCount: pages.length, errors: [] }
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(`Reading index page ${i + 1} of ${pages.length}...`, i + 1, pages.length)
    const result = await classifyIndexPage(pages[i].imageBase64)
    if (result.error) merged.errors.push({ page: i + 1, message: result.error })
    if (!merged.date && result.date) merged.date = result.date
    for (const e of result.entries) {
      // Dedup by ticket_number
      if (!merged.entries.some(x => x.ticket_number === e.ticket_number)) {
        merged.entries.push(e)
      }
    }
  }
  return merged
}

/**
 * Upsert the index into ticket_indices keyed by (org, date). Returns
 * the row id and (if the source PDF was uploaded) its URL.
 */
export async function saveTicketIndex({ orgId, projectId, indexDate, entries, sourceFile, uploadedBy }) {
  if (!orgId) throw new Error('saveTicketIndex: orgId required')
  if (!indexDate) throw new Error('saveTicketIndex: indexDate required')

  let sourceFileUrl = null
  let sourceFilename = null
  if (sourceFile) {
    sourceFilename = sourceFile.name
    const path = `${orgId}/ticket-indices/${indexDate}-${Date.now()}.pdf`
    const { error: upErr } = await supabase.storage
      .from('reconciliation-docs')
      .upload(path, sourceFile, { upsert: true, contentType: 'application/pdf' })
    if (upErr) throw new Error(`Index source upload failed: ${upErr.message}`)
    const { data: urlData } = supabase.storage.from('reconciliation-docs').getPublicUrl(path)
    sourceFileUrl = urlData?.publicUrl || null
  }

  const row = {
    organization_id: orgId,
    project_id: projectId || null,
    index_date: indexDate,
    entries,
    source_file_url: sourceFileUrl,
    source_filename: sourceFilename,
    uploaded_by: uploadedBy || null
  }

  // Upsert on (organization_id, index_date)
  const { data, error } = await supabase
    .from('ticket_indices')
    .upsert(row, { onConflict: 'organization_id,index_date' })
    .select('id, source_file_url')
    .single()
  if (error) throw new Error(`Index save failed: ${error.message}`)
  return data
}

/**
 * Look up the index for a (org, date). Returns null if none.
 */
export async function loadTicketIndex(orgId, date) {
  if (!orgId || !date) return null
  const { data, error } = await supabase
    .from('ticket_indices')
    .select('id, organization_id, project_id, index_date, entries, source_file_url, source_filename, created_at, updated_at')
    .eq('organization_id', orgId)
    .eq('index_date', date)
    .maybeSingle()
  if (error) {
    console.warn('[loadTicketIndex] query error:', error)
    return null
  }
  return data || null
}

// ── Index lookup helpers ─────────────────────────────────────────────────────

/**
 * Build a Map from normalized foreman name -> index entry, with both
 * "last, first" and "first last" forms to forgive the variations
 * the OCR returns.
 */
function buildForemanLookup(index) {
  const byName = new Map()
  const byTicket = new Map()
  if (!index?.entries) return { byName, byTicket }
  for (const e of index.entries) {
    const first = (e.first_name || '').trim()
    const last = (e.last_name || '').trim()
    if (e.ticket_number) byTicket.set(String(e.ticket_number), e)
    if (first || last) {
      const variants = new Set([
        normalizeName(`${first} ${last}`),
        normalizeName(`${last} ${first}`),
        normalizeName(`${last}, ${first}`),
        normalizeName(last),
        normalizeName(first)
      ].filter(Boolean))
      for (const v of variants) {
        if (!byName.has(v)) byName.set(v, e)
      }
    }
  }
  return { byName, byTicket }
}

/**
 * Reconcile each classified page against the index:
 *   - If page has ticket_number, validate it exists in the index. If
 *     the index has a different foreman for that ticket number, mark
 *     mismatch_with_index = true.
 *   - If page has no ticket_number but has foreman_name, look it up in
 *     the index and assign the ticket number.
 *   - If page has neither, leave it alone — it'll fall back to the
 *     existing "continuation of previous group" rule in grouping.
 *
 * Mutates classification.ticket_number / index_validated / mismatch_with_index.
 */
export function reconcileWithIndex(classifiedPages, index) {
  if (!index?.entries?.length) return classifiedPages
  const { byName, byTicket } = buildForemanLookup(index)
  for (const page of classifiedPages) {
    const c = page.classification
    // ticket present: validate
    if (c.ticket_number) {
      const idxEntry = byTicket.get(String(c.ticket_number))
      if (idxEntry) {
        c.index_validated = true
        // Fill missing foreman name from index
        if (!c.foreman_name && (idxEntry.first_name || idxEntry.last_name)) {
          c.foreman_name = [idxEntry.first_name, idxEntry.last_name].filter(Boolean).join(' ')
        }
        // Cross-validate foreman name when both present
        if (c.foreman_name && (idxEntry.first_name || idxEntry.last_name)) {
          const a = normalizeName(c.foreman_name)
          const candidates = [
            normalizeName(`${idxEntry.first_name} ${idxEntry.last_name}`),
            normalizeName(`${idxEntry.last_name} ${idxEntry.first_name}`),
            normalizeName(`${idxEntry.last_name}, ${idxEntry.first_name}`)
          ]
          if (!candidates.some(cand => cand && a.includes(cand.split(' ')[0]) && a.includes(cand.split(' ').pop()))) {
            c.mismatch_with_index = true
          }
        }
      } else {
        // Ticket number not in index — could be a typo or a non-foreman
        // page (weekly summary, missed time). Leave it; grouping will
        // still group by ticket_number.
        c.index_validated = false
      }
      continue
    }
    // No ticket: try to derive from foreman name
    if (c.foreman_name) {
      const idxEntry = byName.get(normalizeName(c.foreman_name))
      if (idxEntry?.ticket_number) {
        c.ticket_number = idxEntry.ticket_number
        c.ticket_number_confidence = c.ticket_number_confidence || 'high' // from index
        c.ticket_derived_from_index = true
        c.index_validated = true
      }
    }
  }
  return classifiedPages
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

STEP 1 - Determine the document type. Use the FIRST rule that fits:
  - "index_page"     -> a table of foremen / supervisors with their
                        names, roles, and assigned Field Log numbers.
                        Often titled "Foreman List", "Ticket Index",
                        or just shows columns Last/First/Role/Field Log.
                        This page should NOT be processed as a LEM or
                        ticket — it's the reference document.
  - "signature_page" -> a page that is mostly signature blocks,
                        approvals, sign-offs, with no labour or
                        equipment hours and no rate columns. Usually
                        appears as the trailing page of a LEM.
  - "missed_time"    -> a page titled or labelled "Missed Time" /
                        "Lost Time" / similar, listing crew members
                        and missed/lost hours.
  - "weekly_summary" -> a rollup page covering an entire week of
                        labour or equipment totals. Often titled
                        "Weekly Summary" or shows date ranges across
                        multiple days.
  - "lem"            -> rate columns / dollar amounts / "RT Rate" /
                        "OT Rate" / "Total Labour" / "Field Log Total";
                        OR an equipment table with unit IDs and rates
                        (a LEM continuation page).
  - "daily_ticket"   -> "foreman's daily time report" or handwritten
                        hours with checkmarks but NO rate / dollar
                        columns. Continuation page: handwritten
                        activity description + signatures, no rate
                        columns.
  - "unknown"        -> only if you genuinely cannot tell.

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
  "doc_type": "lem" | "daily_ticket" | "signature_page" | "missed_time" | "weekly_summary" | "index_page" | "unknown",
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

      const validDocTypes = ['lem', 'daily_ticket', 'signature_page', 'missed_time', 'weekly_summary', 'index_page', 'unknown']
      return {
        ticket_number: cleanTicketNumber(parsed.ticket_number),
        ticket_number_confidence: parsed.ticket_number_confidence || null,
        date: cleanDate(parsed.date),
        foreman_name: (parsed.foreman_name || '').trim() || null,
        crew_or_spread: (parsed.crew_or_spread || '').trim() || null,
        doc_type: validDocTypes.includes(parsed.doc_type) ? parsed.doc_type : 'unknown',
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

// ── Step 3: group pages into documents (index-driven) ────────────────────────

const MAX_PAGES_PER_GROUP = 5
const SPECIAL_DOC_TYPES = new Set(['missed_time', 'weekly_summary', 'index_page'])

/**
 * Group classified pages into multi-page documents.
 *
 * Index-driven rules (revised May 2026):
 *
 *   - Primary grouping key is the TICKET NUMBER. Once index reconciliation
 *     has run (`reconcileWithIndex`), every LEM and daily-ticket page
 *     should have a ticket_number (either OCR-extracted or derived from
 *     foreman -> index lookup). Pages with the same ticket_number group
 *     together regardless of order.
 *
 *   - Signature pages (no ticket_number, no header) APPEND to the PRECEDING
 *     group's pages — typically the trailing page of a LEM.
 *
 *   - Pages classified missed_time / weekly_summary / index_page each
 *     become their own group with doc_type set accordingly. They live
 *     in the "needsReview" bucket so the admin can decide what to do
 *     with them. The index_page itself is detected here so it's not
 *     processed as a LEM or ticket.
 *
 *   - Maximum 5 pages per ticket-number group (1-2 LEM + 0-1 signature
 *     + 1-2 daily ticket). If a group would exceed 5 pages, it's split
 *     into separate groups suffixed with "-overflow-N" and flagged
 *     needs_review = true.
 *
 * Each returned group:
 *   {
 *     id: 'g-<seq>',
 *     doc_type: 'lem' | 'daily_ticket' | 'signature_page' |
 *               'missed_time' | 'weekly_summary' | 'index_page' | 'unknown',
 *     ticket_number: string | null,
 *     ticket_number_confidence: 'high' | 'medium' | 'low' | null,
 *     date, foreman_name, crew_or_spread,
 *     pages: [{ pageNumber, classification }],
 *     match_key: 'date|foreman|crew' (normalized),
 *     needs_review: bool
 *   }
 */
export function groupPagesIntoDocuments(classifiedPages) {
  const groups = []
  let seq = 0
  const groupByTicket = new Map()
  let lastGroup = null   // tracks where signature pages should append

  const newGroup = (firstPage, opts = {}) => {
    seq++
    const g = {
      id: `g-${seq}`,
      doc_type: firstPage.classification.doc_type,
      ticket_number: firstPage.classification.ticket_number,
      ticket_number_confidence: firstPage.classification.ticket_number_confidence,
      date: firstPage.classification.date,
      foreman_name: firstPage.classification.foreman_name,
      crew_or_spread: firstPage.classification.crew_or_spread,
      pages: [firstPage],
      needs_review: firstPage.classification.doc_type === 'unknown' || !!firstPage.classification.error,
      ...opts
    }
    groups.push(g)
    return g
  }

  for (const page of classifiedPages) {
    const c = page.classification

    // Special doc types each get their own dedicated group (they're not
    // part of a ticket pair). The index_page itself is filtered here.
    if (SPECIAL_DOC_TYPES.has(c.doc_type)) {
      const g = newGroup(page)
      g.needs_review = true
      lastGroup = g
      continue
    }

    // Signature pages with no ticket number append to the preceding
    // group (most likely the trailing page of a LEM).
    if (c.doc_type === 'signature_page' && !c.ticket_number && lastGroup) {
      lastGroup.pages.push(page)
      continue
    }

    // Primary grouping: by ticket number
    if (c.ticket_number) {
      const existing = groupByTicket.get(c.ticket_number)
      if (existing) {
        existing.pages.push(page)
        // Fill missing metadata
        if (!existing.date && c.date) existing.date = c.date
        if (!existing.foreman_name && c.foreman_name) existing.foreman_name = c.foreman_name
        if (!existing.crew_or_spread && c.crew_or_spread) existing.crew_or_spread = c.crew_or_spread
        // Upgrade doc_type: prefer concrete over unknown
        if (existing.doc_type === 'unknown' && c.doc_type !== 'unknown') existing.doc_type = c.doc_type
        if (confidenceRank(c.ticket_number_confidence) > confidenceRank(existing.ticket_number_confidence)) {
          existing.ticket_number_confidence = c.ticket_number_confidence
        }
        lastGroup = existing
      } else {
        const g = newGroup(page)
        groupByTicket.set(c.ticket_number, g)
        lastGroup = g
      }
      continue
    }

    // No ticket number AND not a signature page — append to lastGroup
    // if there is one (continuation), otherwise start an unknown group.
    if (lastGroup) {
      lastGroup.pages.push(page)
      if (!lastGroup.date && c.date) lastGroup.date = c.date
      if (!lastGroup.foreman_name && c.foreman_name) lastGroup.foreman_name = c.foreman_name
      if (!lastGroup.crew_or_spread && c.crew_or_spread) lastGroup.crew_or_spread = c.crew_or_spread
    } else {
      lastGroup = newGroup(page)
    }
  }

  // Doc_type consensus pass — once all pages are placed, derive the
  // group-level doc_type from the strongest signal across its pages.
  // Special types stay as-is; ticket-number groups become 'lem' if any
  // page has rates, else 'daily_ticket' if any page is daily, else
  // 'unknown'.
  for (const g of groups) {
    if (SPECIAL_DOC_TYPES.has(g.doc_type)) {
      g.match_key = buildMatchKey(g)
      continue
    }
    const anyLem = g.pages.some(p => p.classification.doc_type === 'lem' || p.classification.has_rates_or_costs)
    const anyTicket = g.pages.some(p => p.classification.doc_type === 'daily_ticket')
    if (anyLem) g.doc_type = 'lem'
    else if (anyTicket) g.doc_type = 'daily_ticket'
    g.match_key = buildMatchKey(g)
    g.needs_review = g.doc_type === 'unknown'
      || g.pages.some(p => !!p.classification.error)
      || (g.ticket_number_confidence === 'low')
      || g.pages.some(p => !!p.classification.mismatch_with_index)
  }

  // Max-5-pages safety net. If a ticket-number group has 6+ pages,
  // split into chunks of 5 and flag each chunk for review. This
  // catches situations like a misclassified continuation that's
  // sweeping unrelated pages into one group.
  const finalGroups = []
  for (const g of groups) {
    if (g.pages.length <= MAX_PAGES_PER_GROUP) {
      finalGroups.push(g)
      continue
    }
    seq++
    let chunkIdx = 0
    for (let i = 0; i < g.pages.length; i += MAX_PAGES_PER_GROUP) {
      chunkIdx++
      const slice = g.pages.slice(i, i + MAX_PAGES_PER_GROUP)
      finalGroups.push({
        ...g,
        id: `${g.id}-overflow-${chunkIdx}`,
        pages: slice,
        needs_review: true,
        overflow_warning: `Original group had ${g.pages.length} pages (limit ${MAX_PAGES_PER_GROUP}); split into chunks.`
      })
    }
  }

  return finalGroups
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
 * Index-driven strategy (preferred when an index is provided): every
 * page already has its ticket_number filled in by reconcileWithIndex,
 * so we split each ticket-number group into a LEM half and a daily
 * ticket half and pair them up. If the group only has one half (LEM
 * but no ticket, or vice versa), it falls into unmatched.
 *
 * Without an index, fall back to the legacy two-pass matcher:
 *   1. exact ticket_number across groups (confidence 0.95)
 *   2. date + foreman + crew (confidence 0.75)
 *
 * Returns:
 *   {
 *     matches: [{ lem, ticket, method, confidence, match_key }],
 *     unmatchedLems, unmatchedTickets, needsReview,
 *     specials: [...]   // missed_time / weekly_summary / index_page
 *   }
 */
export function matchLemsToTickets(groups, { hasIndex = false } = {}) {
  // Pull out the special-doc-type groups — they're reported separately
  // and never participate in matching.
  const specials = groups.filter(g => SPECIAL_DOC_TYPES.has(g.doc_type))
  const ordinary = groups.filter(g => !SPECIAL_DOC_TYPES.has(g.doc_type))
  const lems = ordinary.filter(g => g.doc_type === 'lem')
  const tickets = ordinary.filter(g => g.doc_type === 'daily_ticket')
  const needsReview = ordinary.filter(g => g.doc_type === 'unknown')

  const matches = []
  const usedLems = new Set()
  const usedTickets = new Set()

  // INDEX-DRIVEN PATH: every page already shares the ticket_number with
  // its peer (the index re-derived it for missing pages). Bucket by
  // ticket_number, then pair within the bucket.
  if (hasIndex) {
    const byTicket = new Map()
    for (const g of [...lems, ...tickets]) {
      if (!g.ticket_number) continue
      if (!byTicket.has(g.ticket_number)) byTicket.set(g.ticket_number, { lems: [], tickets: [] })
      const bucket = byTicket.get(g.ticket_number)
      if (g.doc_type === 'lem') bucket.lems.push(g)
      else bucket.tickets.push(g)
    }
    for (const [, bucket] of byTicket) {
      if (bucket.lems.length && bucket.tickets.length) {
        // One LEM + one ticket per bucket is the typical case. If a
        // bucket has more than one of either, pair the first of each
        // and leave the rest as needs_review.
        const lem = bucket.lems[0]
        const ticket = bucket.tickets[0]
        matches.push({
          lem, ticket,
          method: 'ticket_number',
          confidence: 0.98,
          match_key: lem.match_key
        })
        usedLems.add(lem.id)
        usedTickets.add(ticket.id)
        for (const extra of bucket.lems.slice(1)) extra.needs_review = true
        for (const extra of bucket.tickets.slice(1)) extra.needs_review = true
      }
    }
  } else {
    // Legacy path — no index available.
    for (const lem of lems) {
      if (!lem.ticket_number) continue
      const candidate = tickets.find(t =>
        !usedTickets.has(t.id) && t.ticket_number && t.ticket_number === lem.ticket_number
      )
      if (candidate) {
        matches.push({
          lem, ticket: candidate,
          method: 'ticket_number',
          confidence: 0.95,
          match_key: lem.match_key
        })
        usedLems.add(lem.id)
        usedTickets.add(candidate.id)
      }
    }
    for (const lem of lems) {
      if (usedLems.has(lem.id)) continue
      const candidate = tickets.find(t =>
        !usedTickets.has(t.id) && t.match_key === lem.match_key &&
        !lem.match_key.startsWith('unknown-date') &&
        !lem.match_key.includes('|unknown-foreman|')
      )
      if (candidate) {
        matches.push({
          lem, ticket: candidate,
          method: 'date_foreman_crew',
          confidence: 0.75,
          match_key: lem.match_key
        })
        usedLems.add(lem.id)
        usedTickets.add(candidate.id)
      }
    }
  }

  const unmatchedLems = lems.filter(l => !usedLems.has(l.id))
  const unmatchedTickets = tickets.filter(t => !usedTickets.has(t.id))

  return { matches, unmatchedLems, unmatchedTickets, needsReview, specials }
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
 *
 * Pass a `ticketIndex` (the row returned from loadTicketIndex /
 * classifyIndexFile) and the processor will:
 *   - filter out any page Claude classifies as the index_page itself,
 *   - run reconcileWithIndex to fill in missing ticket numbers from
 *     foreman name and cross-validate the ones the OCR did read,
 *   - tell the matcher it can use the simplified within-group pairing.
 */
export async function processPdfForReview(file, onProgress, { onCreditError, ticketIndex } = {}) {
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

  // Reconcile against the per-date index, if provided. Fills in missing
  // ticket numbers from foreman -> index lookup, cross-validates when
  // both sides are present.
  if (ticketIndex?.entries?.length) {
    onProgress?.('Reconciling pages against index...', pages.length, pages.length)
    reconcileWithIndex(classifiedPages, ticketIndex)
  }

  onProgress?.('Grouping pages into documents...', pages.length, pages.length)
  const groups = groupPagesIntoDocuments(classifiedPages)

  onProgress?.('Matching LEMs to daily tickets...', pages.length, pages.length)
  const matchResult = matchLemsToTickets(groups, { hasIndex: !!ticketIndex?.entries?.length })

  return { pages: classifiedPages, groups, matchResult }
}
