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

// ── Diagnostics recorder ─────────────────────────────────────────────────────
//
// Captures every per-page classification (including the raw Claude response
// text), the index OCR result, the post-reconcile state, the groups, and
// the matchResult — streaming to localStorage as each piece arrives. The
// modal exposes a "Download diagnostics" button that exports the full
// snapshot as JSON for offline analysis.
//
// Storage key: bulk_upload_diag_<bulkUploadId>. ~130 pages with the new
// simplified prompt fit comfortably under localStorage's per-origin
// quota (~5 MB).
//
// Callers that don't want diagnostics can pass `null` for the recorder
// — every method is a no-op in that case via the optional-chaining
// guard in the consumers.

const DIAG_KEY_PREFIX = 'bulk_upload_diag_'

export function createDiagnosticsRecorder(bulkUploadId) {
  if (!bulkUploadId) return null
  const key = DIAG_KEY_PREFIX + bulkUploadId
  const state = {
    schemaVersion: 1,
    bulkUploadId,
    startedAt: new Date().toISOString(),
    packageFilename: null,
    pageCount: null,
    index: null,           // { detected, raw_response, parsed: { entries, ... }, meta }
    pages: [],             // [{ pageNumber, classification (with raw_response) }]
    postReconcile: [],     // pages after reconcileWithIndex mutates them
    groups: null,          // groupPagesIntoDocuments output
    matchResult: null,     // matchLemsToTickets output
    completedAt: null
  }
  const flush = () => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch (err) {
      // Quota exceeded or storage disabled — log and keep going. The
      // recorder is best-effort; the rest of the pipeline must still
      // function.
      console.warn('[bulk-upload diag] localStorage write failed:', err.message)
    }
  }
  flush() // create the key immediately so the modal's download button
          // has something to read even mid-run
  return {
    key,
    setPackageMeta: ({ filename, pageCount }) => {
      if (filename) state.packageFilename = filename
      if (Number.isFinite(pageCount)) state.pageCount = pageCount
      flush()
    },
    setIndex: (indexEntry) => {
      // indexEntry is the full result returned by extractIndexFromPage1
      state.index = indexEntry
      flush()
    },
    addPage: (pageWithClassification) => {
      // Strip the imageBase64 to keep the JSON light — we only need
      // the classification and page number.
      const { imageBase64, ...rest } = pageWithClassification
      state.pages.push(rest)
      flush()
    },
    setPostReconcile: (classifiedPages) => {
      state.postReconcile = classifiedPages.map(p => ({
        pageNumber: p.pageNumber,
        classification: p.classification
      }))
      flush()
    },
    setGroups: (groups) => {
      // Drop imageBase64 from every page reference inside the groups
      // so the JSON is grep-friendly.
      state.groups = groups.map(g => ({
        ...g,
        pages: g.pages.map(p => ({
          pageNumber: p.pageNumber,
          classification: p.classification
        }))
      }))
      flush()
    },
    setMatchResult: (mr) => {
      // matchResult contains group references — flatten the same way
      const stripGroup = (g) => g && ({
        ...g,
        pages: g.pages.map(p => ({
          pageNumber: p.pageNumber,
          classification: p.classification
        }))
      })
      state.matchResult = {
        matches: (mr.matches || []).map(m => ({
          method: m.method, confidence: m.confidence, match_key: m.match_key,
          lem: stripGroup(m.lem), ticket: stripGroup(m.ticket)
        })),
        unmatchedLems: (mr.unmatchedLems || []).map(stripGroup),
        unmatchedTickets: (mr.unmatchedTickets || []).map(stripGroup),
        needsReview: (mr.needsReview || []).map(stripGroup),
        specials: (mr.specials || []).map(stripGroup)
      }
      flush()
    },
    finalize: () => {
      state.completedAt = new Date().toISOString()
      flush()
      // Echo a useful summary to the console so DevTools shows the
      // headline numbers without needing to download the JSON.
      try {
        console.groupCollapsed(`[bulk-upload diag] ${bulkUploadId} — ${state.packageFilename || '(unknown file)'}`)
        console.log('Index entries:', state.index?.parsed?.entries?.length || 0,
                    'detected:', state.index?.detected)
        console.log('Pages classified:', state.pages.length)
        console.table(state.pages.map(p => ({
          page: p.pageNumber,
          doc_type: p.classification?.doc_type,
          foreman: p.classification?.foreman_name,
          crew: p.classification?.crew_or_activity || p.classification?.crew_or_spread,
          field_log_id: p.classification?.field_log_id,
          is_continuation: p.classification?.is_continuation,
          error: p.classification?.error || ''
        })))
        if (state.matchResult) {
          console.log('Matches:', state.matchResult.matches?.length || 0,
                      'Unmatched LEMs:', state.matchResult.unmatchedLems?.length || 0,
                      'Unmatched Tickets:', state.matchResult.unmatchedTickets?.length || 0,
                      'Specials:', state.matchResult.specials?.length || 0,
                      'Needs review:', state.matchResult.needsReview?.length || 0)
        }
        console.log('Full snapshot: JSON.parse(localStorage.getItem("' + key + '"))')
        console.groupEnd()
      } catch (_) { /* ignore */ }
    },
    snapshot: () => ({ ...state }),
    getKey: () => key
  }
}

/**
 * Convenience: list every diagnostic snapshot currently in localStorage
 * so the admin can pick a past run to download.
 */
export function listDiagnosticsSnapshots() {
  const out = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(DIAG_KEY_PREFIX)) {
      try {
        const s = JSON.parse(localStorage.getItem(k))
        out.push({
          key: k,
          bulkUploadId: s.bulkUploadId,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          packageFilename: s.packageFilename,
          pageCount: s.pageCount
        })
      } catch (_) { /* skip corrupt entry */ }
    }
  }
  return out.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
}

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
  const prompt = `You are reading ONE PAGE that contains ONE TABLE
listing foremen and their assigned ticket numbers for one day.

BEFORE extracting anything, COUNT the visible rows in the table on
this page. Most index pages have 15 to 35 rows. If you would
extract more than 50 rows from a single page, STOP — something is
wrong with your read. Re-examine the page; the table is finite and
has clear top + bottom boundaries.

Each row has these four columns (in order):
  - Last name        (one word, "Babchishin", "Whitworth")
  - First name       (one word, "Gerald", "Brad")
  - Role / title     ("General Foreman", "Journeyman/Fitter Auto",
                      "Pipefitter", etc.)
  - Field Log #      (4-6 digit ticket number, often handwritten,
                      e.g. "18260")

These rows are PEOPLE. They have a real first name AND a real last
name (or in rare cases a hyphenated last name).

DO NOT INCLUDE any of these — they are NOT foreman entries:
  - Equipment names or unit IDs: "LIGHTTOWR", "POTTY PORTA",
    "BULL BIG", "FULDETECT", "GENERATOR", "TANK", "TRUCK",
    "TRAILER", "PUMP", "COMPRESSOR", "PICKUP", "WELDER",
    "TORCH", "CAT", "GRINDER", "EXCAVATOR", "BACKHOE",
    "BULLDOZER", "SIDEBOOM"
  - Anything where the "name" cell contains digits
  - Anything where the "name" cell is a single all-caps word with
    no vowel pattern of a real name (real names usually contain
    multiple vowels; "LIGHTTOWR" does not)
  - Header rows (the row containing the column labels themselves)
  - Total / subtotal rows at the bottom of the table
  - Empty rows or strikethrough rows
  - ANY content from anywhere else on the page that isn't in the
    main foreman table

Be CONSERVATIVE. If you are unsure whether a row is a real person
or equipment, OMIT it. The admin will review the table and add any
missing rows manually.

The date is somewhere on the page (often top, e.g. "21-Jan-14",
"January 21, 2014", "21/01/2014"). Convert to YYYY-MM-DD.

Return ONLY this JSON. No markdown, no commentary, no extra text:

{
  "date": "2014-01-21" or null,
  "row_count_visible": 32,
  "entries": [
    { "last_name": "Babchishin", "first_name": "Gerald", "role": "General Foreman", "ticket_number": "18260" }
  ]
}

row_count_visible is YOUR HONEST COUNT of visible rows that look
like people in the table. entries.length must equal
row_count_visible. If you can't tell how many rows are visible,
return row_count_visible: null.`

  const requestBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
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
      const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : []
      const rowCountVisible = Number.isFinite(parsed.row_count_visible) ? parsed.row_count_visible : null

      // Normalize entries
      const normalized = rawEntries.map(e => ({
        last_name: (e.last_name || '').trim(),
        first_name: (e.first_name || '').trim(),
        role: (e.role || '').trim(),
        ticket_number: cleanTicketNumber(e.ticket_number)
      }))

      // Drop entries with no ticket number or no name parts
      const hasMinimum = normalized.filter(e =>
        e.ticket_number && (e.first_name || e.last_name)
      )

      // Drop entries that look like equipment rather than people
      const peopleOnly = hasMinimum.filter(e => !looksLikeEquipmentEntry(e))

      // Hard cap per page: a single index page has at most ~50 rows.
      // Anything beyond that is a hallucination. Truncate and flag.
      const HARD_CAP = 50
      const excessive = peopleOnly.length > HARD_CAP
      const capped = peopleOnly.slice(0, HARD_CAP)

      // Drop equipment that slipped past the keyword filter via the
      // ticket-number sanity check: real foreman tickets cluster in
      // a narrow numeric range, so dedup by ticket_number.
      const seen = new Set()
      const finalEntries = []
      for (const e of capped) {
        if (seen.has(e.ticket_number)) continue
        seen.add(e.ticket_number)
        finalEntries.push(e)
      }

      return {
        date: cleanDate(parsed.date),
        entries: finalEntries,
        raw_count: rawEntries.length,
        people_count: hasMinimum.length - peopleOnly.length, // rows we filtered as equipment
        row_count_visible: rowCountVisible,
        excessive,
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
  return {
    date: null, entries: [],
    raw_count: 0, people_count: 0, row_count_visible: null, excessive: false,
    raw_response: '', error: lastError?.message || 'Index OCR failed'
  }
}

// ── Equipment-vs-person heuristic ───────────────────────────────────────────

const EQUIPMENT_KEYWORDS = [
  'TOWR', 'TOWER', 'PORTA', 'POTTY', 'BULL', 'FULDETECT',
  'TANK', 'PUMP', 'GENERATOR', 'COMPRESSOR', 'WELDER',
  'TORCH', 'GRINDER', 'TRUCK', 'TRAILER', 'PICKUP',
  'EXCAVATOR', 'BACKHOE', 'BULLDOZER', 'SIDEBOOM',
  'GENSET', 'LIGHT', 'HEATER', 'BOILER', 'BOOM',
  'FORKLIFT', 'ZOOM', 'TELEHANDLER', 'SKIDSTEER',
  'SKID', 'STEER', 'BOBCAT', 'LOADER', 'GRADER',
  'DOZER', 'PADFOOT', 'PACKER', 'CRUSHER', 'SCREEN'
]

/**
 * Heuristics to reject entries that are equipment rather than people:
 *   - Either name field contains digits (unit/asset IDs)
 *   - The combined name matches a known equipment keyword
 *   - The "name" has a vowel ratio below what real names exhibit
 *     (catches "LIGHTTOWR", "FULDETECT" without a fixed dictionary).
 *   - Real foreman entries usually have BOTH first and last name; an
 *     equipment row often has both columns merged into one — so if
 *     last_name is empty AND first_name looks like a code, reject.
 */
function looksLikeEquipmentEntry(entry) {
  const first = (entry.first_name || '').toUpperCase().trim()
  const last = (entry.last_name || '').toUpperCase().trim()
  const combined = `${first} ${last}`.trim()

  if (!combined) return true
  if (/\d/.test(combined)) return true
  for (const kw of EQUIPMENT_KEYWORDS) {
    if (combined.includes(kw)) return true
  }

  // Vowel-ratio check — real names usually contain >= 1 vowel per 4
  // letters. Equipment codes like "LIGHTTOWR" have very few.
  const letters = combined.replace(/[^A-Z]/g, '')
  const vowels = (combined.match(/[AEIOU]/g) || []).length
  if (letters.length >= 5 && vowels === 0) return true
  if (letters.length >= 8 && vowels < 2) return true

  // "Last name only" rows that look like code/abbreviation
  if (!first && last && last.length <= 4 && (last.match(/[AEIOU]/g) || []).length === 0) return true

  return false
}

/**
 * Convenience: OCR every page of an index PDF and merge entries. Index
 * pages might span 2+ pages if the foreman list is long. The date is
 * taken from the first page that returns one.
 */
export async function classifyIndexFile(file, onProgress) {
  const pages = await splitPdfToPages(file, onProgress)
  const merged = {
    date: null,
    entries: [],
    pageCount: pages.length,
    errors: [],
    excessive: false,             // any single page exceeded 50 entries
    rawCount: 0,                  // total entries Claude returned (pre-filter)
    filteredEquipmentCount: 0,    // entries the equipment filter dropped
    perPageRowCount: []           // Claude's self-reported row counts
  }
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(`Reading index page ${i + 1} of ${pages.length}...`, i + 1, pages.length)
    const result = await classifyIndexPage(pages[i].imageBase64)
    if (result.error) merged.errors.push({ page: i + 1, message: result.error })
    if (!merged.date && result.date) merged.date = result.date
    if (result.excessive) merged.excessive = true
    merged.rawCount += result.raw_count || 0
    merged.filteredEquipmentCount += result.people_count || 0
    merged.perPageRowCount.push(result.row_count_visible)
    for (const e of result.entries) {
      // Dedup by ticket_number across pages
      if (!merged.entries.some(x => x.ticket_number === e.ticket_number)) {
        merged.entries.push(e)
      }
    }
  }

  // Cross-page sanity: 50 entries total across the whole index PDF is
  // already on the high side; >50 flag for admin review.
  const TOTAL_THRESHOLD = 50
  if (merged.entries.length > TOTAL_THRESHOLD) {
    merged.excessive = true
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
 * Build TWO lookup structures from the index:
 *   byName    Map<normalizedName, IndexEntry[]>   — one normalized name
 *             can map to MANY entries when a foreman holds multiple
 *             tickets (e.g. Kevin Labelle has 18272 for Tie-In Coating
 *             AND 18273 for Mainline Coating). The pickIndexEntry
 *             helper disambiguates using the page's crew/activity.
 *   byTicket  Map<ticketNumber, IndexEntry>       — for cross-checking
 *             a LEM's printed Field Log ID against the index.
 */
function buildForemanLookup(index) {
  const byName = new Map()
  const byTicket = new Map()
  if (!index?.entries) return { byName, byTicket }
  const push = (key, entry) => {
    if (!key) return
    const arr = byName.get(key) || []
    arr.push(entry)
    byName.set(key, arr)
  }
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
      for (const v of variants) push(v, e)
    }
  }
  return { byName, byTicket }
}

/**
 * Given a foreman_name string and the page's crew_or_activity hint,
 * find the best matching index entry. When multiple entries share the
 * name, score each by token overlap between the page's crew text and
 * the index entry's role.
 *
 * Returns: { entry, confidence: 'high' | 'low', ambiguous: boolean }
 *   - confidence "high"  -> single unique match, OR multiple matches
 *                           and one role clearly scored higher
 *   - confidence "low"   -> multiple matches with no role winner
 *                           (caller should set mismatch_with_index)
 */
function pickIndexEntry(byName, foremanName, crewOrActivity) {
  if (!foremanName) return null
  const normalized = normalizeName(foremanName)
  let entries = byName.get(normalized) || []
  if (entries.length === 0) {
    // Fall back to fuzzy match on the surname only (handles OCR
    // mis-spellings like missing accents, dropped final letter).
    const tokens = normalized.split(/\s+/).filter(Boolean)
    if (tokens.length) {
      const last = tokens[tokens.length - 1]
      entries = byName.get(last) || []
    }
  }
  if (entries.length === 0) return null
  if (entries.length === 1) {
    return { entry: entries[0], confidence: 'high', ambiguous: false }
  }
  // Multiple — disambiguate by crew_or_activity vs role
  const crew = (crewOrActivity || '').toLowerCase()
  if (!crew) {
    return { entry: entries[0], confidence: 'low', ambiguous: true }
  }
  let bestEntry = entries[0]
  let bestScore = -1
  let secondScore = -1
  for (const cand of entries) {
    const role = (cand.role || '').toLowerCase()
    if (!role) continue
    // Score: number of meaningful (>2 char) role tokens that appear in crew
    const roleTokens = role.split(/[\s\/_-]+/).filter(t => t.length > 2)
    let score = 0
    for (const t of roleTokens) if (crew.includes(t)) score++
    if (score > bestScore) {
      secondScore = bestScore
      bestScore = score
      bestEntry = cand
    } else if (score > secondScore) {
      secondScore = score
    }
  }
  // Confidence is "high" only if the winner clearly beat the runner-up.
  const confident = bestScore > 0 && bestScore > secondScore
  return { entry: bestEntry, confidence: confident ? 'high' : 'low', ambiguous: !confident }
}

/**
 * Reconcile each classified page against the index. PRIMARY key is the
 * foreman name -> index lookup; the LEM's printed Field Log ID is used
 * as a cross-check, NOT the source of truth.
 *
 * For each page:
 *   - If the page has a foreman_name, look it up in the index. Use
 *     crew_or_activity to disambiguate when a foreman holds multiple
 *     tickets. Assign ticket_number from the matched entry.
 *   - If the page is a LEM and also exposes a printed Field Log ID,
 *     cross-check it against the index assignment. Mismatch sets
 *     mismatch_with_index = true.
 *   - If the page has no foreman_name (continuation page), leave the
 *     ticket_number empty — the grouping step appends the page to the
 *     preceding group.
 *   - Pages whose foreman_name doesn't appear in the index get
 *     index_validated = false, no ticket_number, and will be flagged
 *     in the review UI.
 *
 * Mutates the classification objects in place.
 */
export function reconcileWithIndex(classifiedPages, index) {
  if (!index?.entries?.length) return classifiedPages
  const { byName, byTicket } = buildForemanLookup(index)

  for (const page of classifiedPages) {
    const c = page.classification

    // Continuation page (no foreman header) — defer to grouping
    if (!c.foreman_name) continue

    const picked = pickIndexEntry(byName, c.foreman_name, c.crew_or_activity)

    if (!picked) {
      c.index_validated = false
      // Keep any printed Field Log ID the OCR pulled off a LEM as a
      // last-resort ticket_number — better than nothing.
      continue
    }

    const idxEntry = picked.entry
    const indexTicket = idxEntry.ticket_number || null

    // Cross-check the printed Field Log ID (LEMs only) against the
    // index. If they disagree, the index wins (we trust the indexed
    // ground-truth more than a possibly-misread LEM header).
    if (c.field_log_id && indexTicket && c.field_log_id !== indexTicket) {
      c.mismatch_with_index = true
      c.lem_field_log_id_from_page = c.field_log_id
    }

    c.ticket_number = indexTicket
    c.ticket_number_confidence = picked.confidence
    c.ticket_derived_from_index = true
    c.index_validated = true
    c.index_role = idxEntry.role || null
    if (picked.ambiguous) c.index_ambiguous = true
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
  // Simplified prompt: we no longer try to read handwritten ticket
  // numbers off daily tickets. The ground truth is the page-1 index
  // table; pages get their ticket number assigned by foreman-name
  // lookup against that index. The only place we WILL read a ticket
  // number off the page itself is the LEM's printed "Field Log ID"
  // header value (also used as a cross-check against the index).
  const prompt = `Look at this construction document page. Most pages
will be a Somerville Aecon LEM (Labour & Equipment Manifest) or a
Somerville Aecon Daily Ticket (foreman's daily time report).

Extract ONLY the following — do NOT try to read any handwritten
numbers. Handwritten reads are unreliable and will be ignored
downstream.

1. foreman_name
   - On a LEM, this is the printed value of "Foreman:" in the
     right-side header.
   - On a daily ticket, this is the value of "foreman:" in the
     header (often capitalised, e.g. "GERALD BABCHISHIN").
   - On a continuation page with no header, return null.

2. doc_type — pick the FIRST rule that fits:
   - "lem"            -> has rate columns / dollar amounts ("RT Rate",
                         "OT Rate", "Total Labour", "Field Log
                         Total") OR is an equipment table with unit
                         IDs and rates (LEM page 2).
   - "daily_ticket"   -> says "foreman's daily time report" OR has
                         crew names + hours but NO rate / dollar
                         columns. Continuation page = handwritten
                         activity description + signatures with no
                         rate columns.
   - "signature_page" -> mostly signature blocks, sign-offs; no
                         labour/equipment hours and no rate columns.
                         Typically the trailing page of a LEM.
   - "missed_time"    -> labelled "Missed Time" / "Lost Time", listing
                         crew members + missed hours.
   - "weekly_summary" -> "Weekly Summary" or rollup of multiple days.
   - "index_page"     -> table of foremen / supervisors with their
                         names, roles, and assigned Field Log
                         numbers.
   - "unknown"        -> only if you genuinely cannot tell.

3. date — the human-readable date from the header, normalised to
   YYYY-MM-DD. Return null if no date is visible.

4. crew_or_activity — a short description of the crew or work type.
   - On a LEM: the "Account #:" value, OR a more specific job/crew
     description if shown (e.g. "Mainline Coating", "Tie-In
     Coating", "WELDING").
   - On a daily ticket: the "crew:" value.
   - Return null if not visible.

5. field_log_id — ONLY when the page is a LEM and shows a PRINTED
   "Field Log ID:" label in the header followed by a number. Return
   the digits only (e.g. "18260"). Do NOT read handwritten numbers
   from daily tickets. Return null on daily tickets, signature
   pages, or any page without a printed Field Log ID label.

6. is_continuation — true if the page has no clear header (it's
   page 2+ of a multi-page document); false otherwise.

Return ONLY this JSON. No explanation, no markdown:

{
  "foreman_name": "Gerald Babchishin" or null,
  "doc_type": "lem" | "daily_ticket" | "signature_page" | "missed_time" | "weekly_summary" | "index_page" | "unknown",
  "date": "2014-01-21" or null,
  "crew_or_activity": "Mainline Coating" or null,
  "field_log_id": "18260" or null,
  "is_continuation": false
}`

  const requestBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
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

      // is_continuation -> the legacy page_appears_to_be field used by
      // the grouping code. The simplified prompt only returns the
      // boolean now; older saved responses might still have the
      // string form.
      let page_appears_to_be = 'unknown'
      if (typeof parsed.is_continuation === 'boolean') {
        page_appears_to_be = parsed.is_continuation ? 'continuation' : 'first_page'
      } else if (['first_page', 'continuation', 'unknown'].includes(parsed.page_appears_to_be)) {
        page_appears_to_be = parsed.page_appears_to_be
      }

      const validDocTypes = ['lem', 'daily_ticket', 'signature_page', 'missed_time', 'weekly_summary', 'index_page', 'unknown']
      const docType = validDocTypes.includes(parsed.doc_type) ? parsed.doc_type : 'unknown'

      // Ticket number sources, in priority order:
      //   1. field_log_id from the new simplified prompt (LEMs only,
      //      printed, reliable)
      //   2. ticket_number from the old prompt (cleanup pre-existing
      //      responses if any are still cached)
      // We never read handwritten ticket numbers now — daily tickets
      // get their ticket_number assigned by foreman-name lookup
      // against the index in reconcileWithIndex.
      const fieldLogId = cleanTicketNumber(parsed.field_log_id || parsed.ticket_number)
      const ticketConfidence = fieldLogId ? 'high' : null   // printed -> high

      // crew_or_activity is the new field name; fall back to the old
      // crew_or_spread name if the model still returns it.
      const crewText = (parsed.crew_or_activity || parsed.crew_or_spread || '').trim() || null

      return {
        ticket_number: fieldLogId,
        ticket_number_confidence: ticketConfidence,
        field_log_id: fieldLogId,
        date: cleanDate(parsed.date),
        foreman_name: (parsed.foreman_name || '').trim() || null,
        crew_or_spread: crewText,         // legacy field name kept for grouping
        crew_or_activity: crewText,       // new field used by index disambig
        doc_type: docType,
        // We no longer ask the model for has_rates_or_costs explicitly —
        // doc_type already captures it. Derive a boolean for any code
        // that still reads this field.
        has_rates_or_costs: docType === 'lem',
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
    field_log_id: null,
    date: null,
    foreman_name: null,
    crew_or_spread: null,
    crew_or_activity: null,
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

// ── Step A1: extract the index from page 1 of the package ───────────────────

/**
 * Render every page of the package PDF, then OCR PAGE 1 with the index
 * prompt. If page 1 looks like an index (>= 5 valid foreman entries),
 * return the index plus the full rendered-pages cache so the caller
 * doesn't have to re-render. If page 1 doesn't look like an index, we
 * return detected:false and the caller processes every page normally.
 *
 * Returns:
 *   {
 *     allPages: [{ pageNumber, imageBase64 }, ...],   // every page
 *     detected: boolean,                              // page 1 is an index
 *     index: { entries: [...], date: 'YYYY-MM-DD' | null } | null,
 *     indexMeta: { raw_count, people_count, row_count_visible, excessive,
 *                  raw_response, error }   // diagnostics for the warning UI
 *   }
 */
export async function extractIndexFromPage1(file, onProgress, { onCreditError, recorder } = {}) {
  if (!file) throw new Error('extractIndexFromPage1: file is required')
  onProgress?.('Splitting PDF into pages...', 0, 1)
  const allPages = await splitPdfToPages(file, (msg) => onProgress?.(msg))
  recorder?.setPackageMeta({ filename: file.name, pageCount: allPages.length })
  if (allPages.length === 0) {
    const out = { allPages: [], detected: false, index: null, indexMeta: null }
    recorder?.setIndex({ ...out, parsed: null })
    return out
  }
  onProgress?.('Reading page 1 (index)...', 1, allPages.length)
  let indexResult
  try {
    indexResult = await classifyIndexPage(allPages[0].imageBase64)
  } catch (err) {
    if (err.message === 'CREDIT_BALANCE_TOO_LOW') {
      onCreditError?.(allPages)
      throw err
    }
    const out = { allPages, detected: false, index: null, indexMeta: { error: err.message } }
    recorder?.setIndex({ detected: false, error: err.message, parsed: null })
    return out
  }

  // Detection threshold: >= 5 entries that survived the equipment
  // filter. A LEM or daily ticket page won't pass this — its prompt
  // matches a different format entirely.
  const detected = (indexResult.entries?.length || 0) >= 5

  const indexOut = {
    allPages,
    detected,
    index: detected ? { entries: indexResult.entries, date: indexResult.date } : null,
    indexMeta: {
      raw_count: indexResult.raw_count,
      people_count: indexResult.people_count,
      row_count_visible: indexResult.row_count_visible,
      excessive: indexResult.excessive,
      raw_response: indexResult.raw_response,
      error: indexResult.error || null
    }
  }

  // Diagnostics: capture the full raw response + the parsed entries
  recorder?.setIndex({
    detected,
    raw_response: indexResult.raw_response,
    parsed: { entries: indexResult.entries, date: indexResult.date },
    meta: indexOut.indexMeta
  })

  return indexOut
}

// ── Step A2: process the package pages (everything after the index) ─────────

/**
 * Classify every page from `startIndex` onwards, reconcile against the
 * provided ticketIndex (if any), group, and match. The caller passes
 * the already-rendered page cache from extractIndexFromPage1 so we
 * don't re-split the PDF.
 *
 * startIndex defaults to 0 (process every page). When page 1 was the
 * index, the caller passes startIndex: 1 so page 1 is skipped.
 *
 * Page numbers in the returned pages array are preserved (1-based,
 * matching their position in the source PDF) so source_pages on
 * reconciliation_documents still refers to the right pages.
 */
export async function processPackagePages({
  allPages,
  startIndex = 0,
  ticketIndex = null,
  onProgress,
  onCreditError,
  recorder
}) {
  if (!Array.isArray(allPages)) throw new Error('processPackagePages: allPages array required')

  const pagesToProcess = allPages.slice(startIndex)
  const classifiedPages = []

  for (let i = 0; i < pagesToProcess.length; i++) {
    const page = pagesToProcess[i]
    onProgress?.(`Classifying page ${page.pageNumber} of ${allPages.length}...`, i + 1, pagesToProcess.length)
    let classifiedEntry
    try {
      const classification = await classifyPage(page.imageBase64)
      classifiedEntry = { ...page, classification }
    } catch (err) {
      if (err.message === 'CREDIT_BALANCE_TOO_LOW') {
        onCreditError?.(classifiedPages, allPages)
        throw err
      }
      classifiedEntry = {
        ...page,
        classification: {
          ticket_number: null, ticket_number_confidence: null, field_log_id: null,
          date: null, foreman_name: null, crew_or_spread: null, crew_or_activity: null,
          doc_type: 'unknown', has_rates_or_costs: false,
          is_continuation: false, page_indicator: null,
          page_appears_to_be: 'unknown',
          raw_response: '', error: err.message
        }
      }
    }
    classifiedPages.push(classifiedEntry)
    // Stream per-page diagnostics so the snapshot is up-to-date even
    // if the user aborts before the run completes.
    recorder?.addPage(classifiedEntry)
  }

  if (ticketIndex?.entries?.length) {
    onProgress?.('Reconciling pages against index...', pagesToProcess.length, pagesToProcess.length)
    reconcileWithIndex(classifiedPages, ticketIndex)
    // Re-snapshot after the mutation so diagnostics shows both the
    // raw-OCR state (state.pages) and the post-reconcile state
    // (state.postReconcile). reconcileWithIndex mutates in place so
    // state.pages now also reflects the index-derived ticket numbers.
    recorder?.setPostReconcile(classifiedPages)
  }

  onProgress?.('Grouping pages into documents...', pagesToProcess.length, pagesToProcess.length)
  const groups = groupPagesIntoDocuments(classifiedPages)
  recorder?.setGroups(groups)

  onProgress?.('Matching LEMs to daily tickets...', pagesToProcess.length, pagesToProcess.length)
  const matchResult = matchLemsToTickets(groups, { hasIndex: !!ticketIndex?.entries?.length })
  recorder?.setMatchResult(matchResult)
  recorder?.finalize()

  return { pages: classifiedPages, allPages, groups, matchResult }
}

// ── Legacy convenience wrapper ──────────────────────────────────────────────

/**
 * One-shot: auto-detect page 1 as index, then process pages 2..N. Used
 * by callers that want the entire pipeline in a single call (no
 * interactive index review step).
 *
 * Pass `autoDetectIndex: false` to skip page-1 detection and process
 * every page normally.
 */
export async function processPdfForReview(file, onProgress, opts = {}) {
  const { onCreditError, ticketIndex: providedIndex, autoDetectIndex = true } = opts

  let workingIndex = providedIndex
  let allPages
  let startIndex = 0

  if (autoDetectIndex && !providedIndex) {
    const detection = await extractIndexFromPage1(file, onProgress, { onCreditError })
    allPages = detection.allPages
    if (detection.detected) {
      workingIndex = detection.index
      startIndex = 1
    }
  } else {
    onProgress?.('Splitting PDF into pages...', 0, 1)
    allPages = await splitPdfToPages(file, (msg) => onProgress?.(msg))
  }

  return processPackagePages({
    allPages,
    startIndex,
    ticketIndex: workingIndex,
    onProgress,
    onCreditError
  })
}
