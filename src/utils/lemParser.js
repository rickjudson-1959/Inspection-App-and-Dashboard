/**
 * LEM PDF Parser — Profile-Based Visual Reconciliation
 *
 * Splits contractor LEM PDFs into LEM/ticket pairs for side-by-side visual comparison.
 *
 * Two classification modes:
 *   1. Profile mode — Uses Claude Vision + stored contractor profile for scanned PDFs
 *   2. Text mode (fallback) — Word count threshold for digital PDFs with extractable text
 *
 * Pipeline:
 *   Phase 1 — Classify each page (Vision API or text extraction)
 *   Phase 2 — Group pages using profile's grouping strategy, build pairs
 *   Phase 3 — Render page images, upload to storage, create pair records
 */

import { supabase } from '../supabase'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

// ── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function base64ToBlob(base64, mimeType = 'image/jpeg') {
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mimeType })
}

// ── PDF.js setup ─────────────────────────────────────────────────────────────

async function ensurePdfJs() {
  if (window.pdfjsLib) return
  await new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = resolve
    script.onerror = () => reject(new Error('Failed to load PDF.js'))
    document.head.appendChild(script)
  })
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
}

// ── PDF to images (exported for InvoiceUpload) ──────────────────────────────

export async function pdfToImages(file, maxPages = 500, onProgress) {
  await ensurePdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images = []
  const limit = Math.min(pdf.numPages, maxPages)
  const scale = limit > 50 ? 1.5 : 2.0
  const jpegQuality = limit > 50 ? 0.8 : 0.9

  for (let i = 1; i <= limit; i++) {
    if (onProgress && i % 10 === 0) onProgress(`Rendering page ${i} of ${limit}...`)
    const page = await pdf.getPage(i)
    images.push(await renderPageToImage(page, scale, jpegQuality))
  }
  return images
}

// ── Page rendering ──────────────────────────────────────────────────────────

async function renderPageToImage(page, scale, jpegQuality) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/jpeg', jpegQuality).split(',')[1]
}

// ── Text extraction ─────────────────────────────────────────────────────────

async function extractPageText(page) {
  const textContent = await page.getTextContent()
  return textContent.items.map(item => item.str).join(' ')
}

// ── Classification: Text-based fallback ─────────────────────────────────────

const TEXT_WORD_THRESHOLD = 20

function classifyPageText(text) {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0)
  const wordCount = words.length
  const lower = text.toLowerCase()

  // Content-based classification: look for definitive markers
  const lemMarkers = ['labour & equipment', 'labour and equipment', 'manifest', 'billing', 'rate/hr', 'line total', 'grand total', 'rt rate', 'ot rate', 'rt hrs', 'ot hrs']
  const ticketMarkers = ['daily field ticket', 'daily ticket', 'field ticket', 'foreman:', 'inspector:', 'signature', 'print name']

  const lemScore = lemMarkers.reduce((s, m) => s + (lower.includes(m) ? 1 : 0), 0)
  const ticketScore = ticketMarkers.reduce((s, m) => s + (lower.includes(m) ? 1 : 0), 0)

  let page_type
  let confidence
  if (lemScore > ticketScore) {
    page_type = 'lem'
    confidence = Math.min(0.95, 0.7 + lemScore * 0.08)
  } else if (ticketScore > lemScore) {
    page_type = 'daily_ticket'
    confidence = Math.min(0.95, 0.7 + ticketScore * 0.08)
  } else {
    // Fallback to word count heuristic
    page_type = wordCount >= TEXT_WORD_THRESHOLD ? 'lem' : 'daily_ticket'
    confidence = 0.5
  }

  return {
    page_type,
    confidence,
    date: extractDateFromText(text),
    crew: extractCrewFromText(text),
    page_number: null,
    word_count: wordCount,
    lem_score: lemScore,
    ticket_score: ticketScore
  }
}

function extractDateFromText(text) {
  const MONTH_MAP = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
  let m = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2}),?\s*(\d{4})/i)
  if (m) return `${m[3]}-${MONTH_MAP[m[1].toLowerCase().slice(0,3)]}-${m[2].padStart(2,'0')}`
  m = text.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*,?\s*(\d{4})/i)
  if (m) return `${m[3]}-${MONTH_MAP[m[2].toLowerCase().slice(0,3)]}-${m[1].padStart(2,'0')}`
  m = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m) {
    const a = parseInt(m[1])
    if (a > 12) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
  }
  return null
}

function extractCrewFromText(text) {
  // Match contractor/crew name but stop at Date:, digits-dash-digits, or triple-space runs
  let m = text.match(/(?:crew|contractor|company)\s*[:]\s*([^\n,;]{3,40})/i)
  if (m) {
    // Trim at common boundary patterns: "Date:", "2026-", large whitespace gaps
    let name = m[1].replace(/\s{2,}.*$/, '').replace(/\s*date\s*:.*/i, '').replace(/\s*\d{4}[\-\/].*/i, '').trim()
    if (name.length >= 3) return name
  }
  m = text.match(/foreman\s*[:]\s*([^\n,;]{3,30})/i)
  if (m) return m[1].replace(/\s{2,}.*$/, '').trim()
  return null
}

// ── Classification: Profile-based Vision API ────────────────────────────────

const CLASSIFY_DELAY_MS = 4000 // 1 page every 4 seconds = 15/min, stays under 30k tokens/min
const MAX_RETRIES = 4

async function classifyPageWithVision(pageImageBase64, classificationGuide, contractorName) {
  const prompt = classificationGuide
    ? `You are classifying pages from ${contractorName}'s LEM billing package.

This contractor's documents have these characteristics:
${JSON.stringify(classificationGuide, null, 2)}

Look at this page and classify it. Return ONLY JSON (no markdown, no code fences):
{
  "page_type": "lem" or "daily_ticket" or "cover_sheet",
  "confidence": 0.0 to 1.0,
  "date": "YYYY-MM-DD or null",
  "crew": "crew name or null",
  "page_number": "X of Y or null"
}`
    : `You are classifying a page from a contractor's LEM (Labour & Equipment Manifest) billing package used in pipeline construction.

Page types:
- "lem": A billing summary sheet showing labour hours, equipment hours, rates, and costs. Usually has columns for RT/OT hours, rate/hr, line totals. May say "Labour & Equipment Manifest" or similar.
- "daily_ticket": A daily field ticket signed by the foreman and/or inspector. Usually has a ticket number, date, crew members, equipment list, and signature lines. May say "Daily Field Ticket" or "Daily Report".
- "cover_sheet": A cover page, table of contents, summary page, or transmittal letter. Not a billing document or field ticket.

Extract the foreman/superintendent name (the person in charge of the crew on that page), NOT the contractor company name.

Return ONLY valid JSON (no markdown, no code fences):
{
  "page_type": "lem" or "daily_ticket" or "cover_sheet",
  "confidence": 0.0 to 1.0,
  "date": "YYYY-MM-DD or null (the work date shown on this page)",
  "crew": "foreman or superintendent name, or null",
  "page_number": "X of Y or null"
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: pageImageBase64 } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  })

  if (response.status === 429) {
    const err = new Error('Rate limited')
    err.status = 429
    throw err
  }

  if (!response.ok) {
    const err = new Error(`API error: ${response.status}`)
    err.status = response.status
    throw err
  }

  const data = await response.json()
  const text = data?.content?.[0]?.text || ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    console.warn('Failed to parse Vision response:', text)
    return { page_type: 'unknown', confidence: 0, date: null, crew: null, page_number: null }
  }
}

/**
 * Classify all pages using Claude Vision with the contractor's stored profile.
 * Rate-limited with exponential backoff. Saves progress for resume support.
 */
async function classifyWithProfile(pdf, profile, onProgress, lemId, existingProgress) {
  const numPages = pdf.numPages
  const classifications = existingProgress?.classifications
    ? [...existingProgress.classifications]
    : new Array(numPages).fill(null)
  const completedSet = new Set(existingProgress?.completed_pages || [])
  let consecutiveErrors = 0
  let flaggedCount = 0

  for (let i = 0; i < numPages; i++) {
    if (completedSet.has(i)) {
      if (classifications[i]?.confidence < 0.7) flaggedCount++
      continue
    }

    // Render page at lower quality for classification (saves bandwidth)
    const page = await pdf.getPage(i + 1)
    const image = await renderPageToImage(page, 1.5, 0.85)

    // Rate limit delay (skip for first page)
    if (completedSet.size > 0) await sleep(CLASSIFY_DELAY_MS)

    let retries = 0
    while (retries < MAX_RETRIES) {
      try {
        const result = await classifyPageWithVision(
          image, profile?.classification_guide || null, profile?.contractor_name || 'Unknown'
        )
        classifications[i] = result
        completedSet.add(i)
        consecutiveErrors = 0

        if (result.confidence < 0.7) flaggedCount++

        const remaining = numPages - completedSet.size
        const estMinutes = (remaining * CLASSIFY_DELAY_MS / 60000).toFixed(1)
        onProgress?.(`Classifying page ${completedSet.size} of ${numPages}... (~${estMinutes} min remaining) ${flaggedCount > 0 ? `| ${flaggedCount} flagged` : ''}`)

        // Save progress to DB every 5 pages (for resume support)
        if (lemId && completedSet.size % 5 === 0) {
          await supabase.from('contractor_lem_uploads')
            .update({ classification_progress: { completed_pages: [...completedSet], total_pages: numPages, classifications } })
            .eq('id', lemId)
        }

        break // success
      } catch (err) {
        if (err.status === 429) {
          retries++
          consecutiveErrors++
          const backoffMs = Math.min(30000 * Math.pow(2, consecutiveErrors - 1), 120000)
          onProgress?.(`Rate limited — waiting ${(backoffMs / 1000).toFixed(0)}s before retrying...`)
          await sleep(backoffMs)
        } else {
          // Non-rate-limit error — mark as unknown, continue
          console.error(`Classification failed for page ${i + 1}:`, err.message)
          classifications[i] = { page_type: 'unknown', confidence: 0, date: null, crew: null, page_number: null, error: err.message }
          completedSet.add(i)
          flaggedCount++
          break
        }
      }
    }

    if (retries >= MAX_RETRIES) {
      classifications[i] = { page_type: 'unknown', confidence: 0, date: null, crew: null, page_number: null, error: 'Max retries exceeded' }
      completedSet.add(i)
      flaggedCount++
    }
  }

  // Clear progress from DB on completion
  if (lemId) {
    await supabase.from('contractor_lem_uploads')
      .update({ classification_progress: null })
      .eq('id', lemId)
  }

  return { classifications, flaggedCount }
}

// ── Grouping: Profile-aware ─────────────────────────────────────────────────

/**
 * Group classified pages into document groups, excluding cover sheets.
 * Uses page_number data if available, otherwise falls back to sequential grouping.
 */
export function groupPagesWithProfile(classifications) {
  // Filter to only LEM and ticket pages (exclude cover sheets and unknowns)
  const pageEntries = classifications
    .map((cls, idx) => ({ ...cls, originalIndex: idx }))
    .filter(c => c.page_type === 'lem' || c.page_type === 'daily_ticket')

  if (pageEntries.length === 0) return []

  // Strategy 1: Try page_number grouping ("Page X of Y")
  const hasPageNumbers = pageEntries.some(c => c.page_number && /\d+\s*of\s*\d+/i.test(c.page_number))

  if (hasPageNumbers) {
    return groupByPageNumbers(pageEntries)
  }

  // Strategy 2: Sequential grouping (same type = same group)
  return groupSequential(pageEntries)
}

function groupByPageNumbers(entries) {
  const groups = []
  let currentGroup = null

  for (const entry of entries) {
    const match = entry.page_number?.match(/(\d+)\s*of\s*(\d+)/i)

    if (match) {
      const pageNum = parseInt(match[1])
      const totalPages = parseInt(match[2])

      if (pageNum === 1 || !currentGroup || currentGroup.type !== entry.page_type || currentGroup.totalPages !== totalPages) {
        // Start new group
        if (currentGroup) groups.push(currentGroup)
        currentGroup = {
          type: entry.page_type,
          pageIndices: [entry.originalIndex],
          classifications: [entry],
          totalPages
        }
      } else {
        // Continue current group
        currentGroup.pageIndices.push(entry.originalIndex)
        currentGroup.classifications.push(entry)
      }
    } else {
      // No page number — treat as new single-page group
      if (currentGroup) groups.push(currentGroup)
      currentGroup = {
        type: entry.page_type,
        pageIndices: [entry.originalIndex],
        classifications: [entry],
        totalPages: 1
      }
    }
  }

  if (currentGroup) groups.push(currentGroup)
  return groups
}

export function groupSequential(entries) {
  if (entries.length === 0) return []
  const groups = []
  let cur = {
    type: entries[0].page_type,
    pageIndices: [entries[0].originalIndex],
    classifications: [entries[0]]
  }

  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.page_type === cur.type) {
      cur.pageIndices.push(entry.originalIndex)
      cur.classifications.push(entry)
    } else {
      groups.push(cur)
      cur = {
        type: entry.page_type,
        pageIndices: [entry.originalIndex],
        classifications: [entry]
      }
    }
  }
  groups.push(cur)
  return groups
}

/**
 * Build LEM/ticket pairs from groups.
 * Strategy:
 *   1. If groups alternate LEM→ticket cleanly, use adjacency pairing (most reliable).
 *   2. If there are blocks of same-type groups, try date-based matching.
 *   3. Fallback: sequential adjacency with orphans.
 */
export function buildPairsFromGroups(groups) {
  const pairs = []

  // Check if groups alternate: lem, ticket, lem, ticket...
  // This is the common case for LEM packages where pages interleave.
  const alternatesCleanly = groups.length >= 2 && groups.every((g, i) => {
    if (i % 2 === 0) return g.type === 'lem'
    return g.type === 'daily_ticket'
  })

  if (alternatesCleanly) {
    console.log(`[LEM Pair] Using adjacency pairing (groups alternate LEM/ticket cleanly)`)
    for (let i = 0; i < groups.length; i += 2) {
      pairs.push({
        lem: groups[i],
        ticket: i + 1 < groups.length ? groups[i + 1] : null
      })
    }
    return pairs
  }

  // Not alternating — try date-based pairing if we have dates on both sides
  const lemGroups = groups.filter(g => g.type === 'lem')
  const ticketGroups = groups.filter(g => g.type === 'daily_ticket')
  const lemDates = lemGroups.map(g => g.classifications.find(c => c.date)?.date).filter(Boolean)
  const ticketDates = ticketGroups.map(g => g.classifications.find(c => c.date)?.date).filter(Boolean)

  if (lemDates.length > 0 && ticketDates.length > 0) {
    console.log(`[LEM Pair] Using date-based pairing (${lemDates.length} LEM dates, ${ticketDates.length} ticket dates)`)
    const usedTickets = new Set()

    for (const lg of lemGroups) {
      const lemDate = lg.classifications.find(c => c.date)?.date
      let matchedTicket = null

      if (lemDate) {
        const ticketIdx = ticketGroups.findIndex((tg, idx) => {
          if (usedTickets.has(idx)) return false
          return tg.classifications.some(c => c.date === lemDate)
        })
        if (ticketIdx >= 0) {
          matchedTicket = ticketGroups[ticketIdx]
          usedTickets.add(ticketIdx)
        }
      }

      pairs.push({ lem: lg, ticket: matchedTicket })
    }

    ticketGroups.forEach((tg, idx) => {
      if (!usedTickets.has(idx)) {
        pairs.push({ lem: null, ticket: tg })
      }
    })

    return pairs
  }

  // Fallback: sequential adjacency pairing
  console.log(`[LEM Pair] Using sequential adjacency pairing (fallback)`)
  let i = 0
  while (i < groups.length) {
    const g = groups[i]
    if (g.type === 'lem') {
      if (i + 1 < groups.length && groups[i + 1].type === 'daily_ticket') {
        pairs.push({ lem: g, ticket: groups[i + 1] })
        i += 2
      } else {
        pairs.push({ lem: g, ticket: null })
        i += 1
      }
    } else {
      pairs.push({ lem: null, ticket: g })
      i += 1
    }
  }
  return pairs
}

// ── Image upload ─────────────────────────────────────────────────────────────

async function uploadPageImages(lemId, groupType, pairIndex, pageIndices, allPageImages, errors) {
  const urls = []
  for (const idx of pageIndices) {
    const base64 = allPageImages[idx]
    if (!base64) {
      console.warn(`[LEM Upload] No image data for page ${idx + 1} — skipping`)
      continue
    }
    try {
      const blob = base64ToBlob(base64)
      const folder = groupType === 'lem' ? 'lem_pages' : 'ticket_pages'
      const filePath = `${lemId}/${folder}/pair${pairIndex}_p${idx + 1}.jpg`
      const { error: upErr } = await supabase.storage
        .from('lem-uploads')
        .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) {
        console.error(`[LEM Upload] Storage upload failed for ${filePath}:`, upErr.message)
        errors.push(`Upload ${groupType} page ${idx + 1}: ${upErr.message}`)
      } else {
        const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(filePath)
        if (urlData?.publicUrl) {
          urls.push(urlData.publicUrl)
        }
      }
    } catch (e) {
      console.error(`[LEM Upload] Exception uploading pair ${pairIndex} ${groupType} page ${idx + 1}:`, e)
      errors.push(`Upload pair ${pairIndex} ${groupType} page ${idx + 1}: ${e.message}`)
    }
  }
  return urls.filter(Boolean)
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Parse a LEM PDF into visual reconciliation pairs.
 *
 * @param {File} file - PDF file
 * @param {function} onProgress - (message) => void
 * @param {string} lemId - LEM upload ID for storage paths (omit for preview)
 * @param {string} orgId - Organization ID for pair records
 * @param {object} profile - Contractor LEM profile (from contractor_lem_profiles table)
 * @returns {{ pairs, classifications, documentInfo, errors, flaggedPages }}
 */
export async function parseLEMFile(file, onProgress, lemId, orgId, profile = null) {
  if (file.size > 100 * 1024 * 1024) {
    return { pairs: [], classifications: [], documentInfo: {}, errors: [`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 100MB.`], flaggedPages: [] }
  }

  const errors = []
  const isPDF = file.type === 'application/pdf'

  if (!isPDF) {
    const pairs = [{ pair_index: 0, work_date: null, crew_name: null, lem_pages: 0, ticket_pages: 1 }]
    return { pairs, classifications: [], documentInfo: {}, errors, flaggedPages: [] }
  }

  await ensurePdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages
  onProgress?.(`PDF loaded: ${numPages} pages.`)

  // ── Phase 1: Classification ──
  let classifications = []
  let flaggedCount = 0

  if (ANTHROPIC_API_KEY) {
    // Vision API classification (with or without profile)
    const mode = profile ? `${profile.contractor_name} profile` : 'Vision API (no profile)'
    onProgress?.(`Classifying ${numPages} pages using ${mode}...`)

    // Check for existing progress (resume support)
    let existingProgress = null
    if (lemId) {
      const { data } = await supabase
        .from('contractor_lem_uploads')
        .select('classification_progress')
        .eq('id', lemId)
        .single()
      if (data?.classification_progress?.completed_pages?.length > 0) {
        existingProgress = data.classification_progress
        onProgress?.(`Resuming from page ${existingProgress.completed_pages.length + 1}...`)
      }
    }

    const result = await classifyWithProfile(pdf, profile, onProgress, lemId, existingProgress)
    classifications = result.classifications
    flaggedCount = result.flaggedCount
  } else {
    // Text-based fallback (no API key)
    onProgress?.('Classifying pages (text analysis — no API key)...')
    for (let i = 1; i <= numPages; i++) {
      if (i % 50 === 0 || i === 1) onProgress?.(`Classifying page ${i} of ${numPages}...`)
      const page = await pdf.getPage(i)
      const text = await extractPageText(page)
      classifications.push(classifyPageText(text))
    }
  }

  // Post-processing: inherit type for ambiguous continuation pages
  // If a page has equal lem/ticket scores (or confidence <= 0.5), it's likely a
  // continuation of the previous page (equipment overflow, extra rows, etc.)
  for (let i = 1; i < classifications.length; i++) {
    const c = classifications[i]
    const prev = classifications[i - 1]
    const isAmbiguous = c.confidence <= 0.5 || (c.lem_score != null && c.lem_score === c.ticket_score)
    if (isAmbiguous && prev && (prev.page_type === 'lem' || prev.page_type === 'daily_ticket')) {
      console.log(`[LEM Classify] Page ${i + 1}: ambiguous (conf=${c.confidence.toFixed(2)}) → inheriting '${prev.page_type}' from page ${i}`)
      c.page_type = prev.page_type
      c.confidence = 0.6 // mark as inherited
      c._inherited = true
      // Also inherit date if missing
      if (!c.date && prev.date) c.date = prev.date
    }
  }

  // Summary
  const lemCount = classifications.filter(c => c.page_type === 'lem').length
  const ticketCount = classifications.filter(c => c.page_type === 'daily_ticket').length
  const coverCount = classifications.filter(c => c.page_type === 'cover_sheet').length
  const unknownCount = classifications.filter(c => c.page_type === 'unknown').length
  onProgress?.(`Classification done: ${lemCount} LEM, ${ticketCount} ticket${coverCount ? `, ${coverCount} cover` : ''}${unknownCount ? `, ${unknownCount} unknown` : ''}. ${flaggedCount} flagged for review.`)

  // ── Classification dump for debugging ──
  console.log(`[LEM Classify] ===== PAGE CLASSIFICATION RESULTS =====`)
  console.log(`[LEM Classify] ${numPages} pages: ${lemCount} LEM, ${ticketCount} ticket, ${coverCount} cover, ${unknownCount} unknown`)
  classifications.forEach((c, i) => {
    const extra = c.word_count != null ? ` | words=${c.word_count}` : ''
    const scores = c.lem_score != null ? ` | lem_score=${c.lem_score} ticket_score=${c.ticket_score}` : ''
    console.log(`[LEM Classify] Page ${i + 1}: ${c.page_type.padEnd(14)} conf=${c.confidence.toFixed(2)} date=${c.date || '-'}${extra}${scores}`)
  })
  console.log(`[LEM Classify] ========================================`)

  // Build flagged pages list
  const flaggedPages = classifications
    .map((cls, idx) => ({ ...cls, pageIndex: idx }))
    .filter(c => c.confidence < 0.7 || c.page_type === 'unknown')

  // Extract document info
  const firstLem = classifications.find(c => c.page_type === 'lem')
  const documentInfo = {
    contractor_name: profile?.contractor_name || firstLem?.crew || classifications.find(c => c.crew)?.crew || null,
    lem_number: null,
    period_start: null,
    period_end: null
  }
  const dates = classifications.map(c => c.date).filter(Boolean).sort()
  if (dates.length > 0) {
    documentInfo.period_start = dates[0]
    documentInfo.period_end = dates[dates.length - 1]
  }

  // ── Phase 2: Group + pair ──
  const groups = profile
    ? groupPagesWithProfile(classifications)
    : groupSequential(classifications.map((c, i) => ({ ...c, originalIndex: i })).filter(c => c.page_type === 'lem' || c.page_type === 'daily_ticket'))

  // Debug: show groups
  console.log(`[LEM Group] ===== GROUPING RESULTS =====`)
  groups.forEach((g, i) => {
    const pages = g.pageIndices.map(p => p + 1).join(', ')
    const date = g.classifications.find(c => c.date)?.date || '-'
    console.log(`[LEM Group] Group ${i + 1}: ${g.type.padEnd(14)} pages=[${pages}] (${g.pageIndices.length} pg) date=${date}`)
  })

  const pairs = buildPairsFromGroups(groups)

  // Debug: show pairs
  console.log(`[LEM Pair] ===== PAIRING RESULTS: ${pairs.length} pairs =====`)
  pairs.forEach((p, i) => {
    const lemPages = p.lem ? p.lem.pageIndices.map(x => x + 1).join(',') : 'none'
    const ticketPages = p.ticket ? p.ticket.pageIndices.map(x => x + 1).join(',') : 'none'
    const date = [...(p.lem?.classifications || []), ...(p.ticket?.classifications || [])].find(c => c.date)?.date || '-'
    console.log(`[LEM Pair] Pair ${i + 1}: LEM=[${lemPages}] Ticket=[${ticketPages}] date=${date}`)
  })
  console.log(`[LEM Pair] ========================================`)

  onProgress?.(`${pairs.length} LEM/ticket pairs found.`)

  if (flaggedCount > 0) {
    errors.push(`${flaggedCount} page(s) classified with low confidence — review recommended.`)
  }

  // ── Phase 3: Render images + upload ──
  if (lemId) {
    onProgress?.('Rendering page images...')
    const scale = numPages > 50 ? 1.5 : 2.0
    const jpegQuality = numPages > 50 ? 0.8 : 0.9

    const neededIndices = new Set()
    for (const pair of pairs) {
      if (pair.lem) pair.lem.pageIndices.forEach(i => neededIndices.add(i))
      if (pair.ticket) pair.ticket.pageIndices.forEach(i => neededIndices.add(i))
    }

    const allPageImages = new Array(numPages).fill(null)
    let rendered = 0
    for (const idx of neededIndices) {
      rendered++
      if (rendered % 20 === 0) onProgress?.(`Rendering page ${rendered} of ${neededIndices.size}...`)
      const page = await pdf.getPage(idx + 1)
      allPageImages[idx] = await renderPageToImage(page, scale, jpegQuality)
    }
    onProgress?.(`${rendered} pages rendered.`)

    const pairRecords = []
    for (let p = 0; p < pairs.length; p++) {
      const pair = pairs[p]
      onProgress?.(`Uploading pair ${p + 1} of ${pairs.length}...`)

      let lemUrls = [], lemIndices = []
      if (pair.lem) {
        lemIndices = pair.lem.pageIndices
        lemUrls = await uploadPageImages(lemId, 'lem', p, lemIndices, allPageImages, errors)
      }

      let ticketUrls = [], ticketIndices = []
      if (pair.ticket) {
        ticketIndices = pair.ticket.pageIndices
        ticketUrls = await uploadPageImages(lemId, 'ticket', p, ticketIndices, allPageImages, errors)
      }

      const allCls = [...(pair.lem?.classifications || []), ...(pair.ticket?.classifications || [])]
      pairRecords.push({
        lem_upload_id: lemId,
        organization_id: orgId,
        pair_index: p,
        work_date: allCls.find(c => c.date)?.date || null,
        crew_name: allCls.find(c => c.crew)?.crew || null,
        lem_page_urls: lemUrls,
        lem_page_indices: lemIndices,
        contractor_ticket_urls: ticketUrls,
        contractor_ticket_indices: ticketIndices,
        page_classifications: allCls,
        status: 'pending'
      })
    }

    if (pairRecords.length > 0) {
      onProgress?.(`Saving ${pairRecords.length} pair records...`)
      const { error: insertErr } = await supabase
        .from('lem_reconciliation_pairs')
        .insert(pairRecords)
      if (insertErr) errors.push(`Failed to save pairs: ${insertErr.message}`)
    }

    onProgress?.(`Done: ${pairRecords.length} pairs saved.`)
    return { pairs: pairRecords, classifications, documentInfo, errors, flaggedPages }
  }

  // Preview mode — return full pair structures so save can use them without re-classifying
  const pairSummaries = pairs.map((pair, p) => {
    const allCls = [...(pair.lem?.classifications || []), ...(pair.ticket?.classifications || [])]
    return {
      pair_index: p,
      work_date: allCls.find(c => c.date)?.date || null,
      crew_name: allCls.find(c => c.crew)?.crew || null,
      lem_pages: pair.lem?.pageIndices?.length || 0,
      ticket_pages: pair.ticket?.pageIndices?.length || 0
    }
  })

  return { pairs: pairSummaries, rawPairs: pairs, classifications, documentInfo, errors, flaggedPages }
}

/**
 * Save pre-classified pairs: render page images, upload to storage, create DB records.
 * Skips classification entirely — uses the rawPairs from a previous parseLEMFile() call.
 *
 * @param {File} file - PDF file
 * @param {function} onProgress
 * @param {string} lemId - LEM upload ID
 * @param {string} orgId - Organization ID
 * @param {Array} rawPairs - pair objects from parseLEMFile().rawPairs
 * @param {string} poNumber - PO number for pair records
 * @returns {{ pairs: Array, errors: string[] }}
 */
export async function saveParsedPairs(file, onProgress, lemId, orgId, rawPairs, poNumber) {
  const errors = []

  console.log(`[LEM Save] Starting saveParsedPairs: ${rawPairs?.length || 0} pairs, lemId=${lemId}`)

  if (!rawPairs || rawPairs.length === 0) {
    console.error('[LEM Save] No rawPairs provided — nothing to save')
    errors.push('No classified pairs to save. Please re-parse the file.')
    return { pairs: [], errors }
  }

  // Step 1: Build pair records WITHOUT images (fast — just metadata)
  const pairRecords = []
  for (let p = 0; p < rawPairs.length; p++) {
    const pair = rawPairs[p]
    const lemIndices = pair.lem ? pair.lem.pageIndices : []
    const ticketIndices = pair.ticket ? pair.ticket.pageIndices : []
    const allCls = [...(pair.lem?.classifications || []), ...(pair.ticket?.classifications || [])]

    pairRecords.push({
      lem_upload_id: lemId,
      organization_id: orgId,
      pair_index: p,
      work_date: allCls.find(c => c.date)?.date || null,
      crew_name: allCls.find(c => c.crew)?.crew || null,
      lem_page_urls: [],
      lem_page_indices: lemIndices,
      contractor_ticket_urls: [],
      contractor_ticket_indices: ticketIndices,
      po_number: poNumber || null,
      page_classifications: allCls,
      status: 'pending'
    })
  }

  // Step 2: Insert pair records to DB immediately
  console.log(`[LEM Save] Inserting ${pairRecords.length} pair records (no images yet)...`)
  onProgress?.(`Saving ${pairRecords.length} pairs...`)
  const { data: insertedPairs, error: insertErr } = await supabase
    .from('lem_reconciliation_pairs')
    .insert(pairRecords)
    .select('id, pair_index')

  if (insertErr) {
    console.error('[LEM Save] DB insert failed:', insertErr)
    errors.push(`Failed to save pairs: ${insertErr.message}`)
    return { pairs: [], errors }
  }

  console.log(`[LEM Save] Saved ${insertedPairs?.length || 0} pairs to DB. Errors: ${errors.length}`)
  onProgress?.(`${pairRecords.length} pairs saved. Images uploading in background...`)

  // Step 3: Kick off background image upload (non-blocking)
  uploadPairImagesInBackground(file, lemId, rawPairs, insertedPairs || [])

  return { pairs: pairRecords, errors }
}

/**
 * Background image upload — renders PDF pages to JPEG and uploads to storage,
 * then patches each pair record with the image URLs.
 * Runs after the user has already navigated to the four-panel view.
 */
async function uploadPairImagesInBackground(file, lemId, rawPairs, insertedPairs) {
  try {
    console.log(`[LEM BG Upload] Starting background image upload for ${rawPairs.length} pairs`)

    await ensurePdfJs()
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const numPages = pdf.numPages
    const scale = numPages > 50 ? 1.5 : 2.0
    const jpegQuality = numPages > 50 ? 0.8 : 0.9

    // Collect all page indices that need images
    const neededIndices = new Set()
    for (const pair of rawPairs) {
      if (pair.lem) pair.lem.pageIndices.forEach(i => neededIndices.add(i))
      if (pair.ticket) pair.ticket.pageIndices.forEach(i => neededIndices.add(i))
    }

    console.log(`[LEM BG Upload] Rendering ${neededIndices.size} pages...`)
    const allPageImages = new Array(numPages).fill(null)
    let rendered = 0
    for (const idx of neededIndices) {
      rendered++
      try {
        const page = await pdf.getPage(idx + 1)
        allPageImages[idx] = await renderPageToImage(page, scale, jpegQuality)
      } catch (renderErr) {
        console.error(`[LEM BG Upload] Failed to render page ${idx + 1}:`, renderErr)
      }
      if (rendered % 20 === 0) console.log(`[LEM BG Upload] Rendered ${rendered}/${neededIndices.size}`)
    }
    console.log(`[LEM BG Upload] Rendered ${allPageImages.filter(Boolean).length} pages`)

    // Upload images and update each pair record
    const errors = []
    for (let p = 0; p < rawPairs.length; p++) {
      const pair = rawPairs[p]
      const dbPair = insertedPairs.find(r => r.pair_index === p)
      if (!dbPair) continue

      let lemUrls = []
      if (pair.lem) {
        lemUrls = await uploadPageImages(lemId, 'lem', p, pair.lem.pageIndices, allPageImages, errors)
      }

      let ticketUrls = []
      if (pair.ticket) {
        ticketUrls = await uploadPageImages(lemId, 'ticket', p, pair.ticket.pageIndices, allPageImages, errors)
      }

      // Patch the pair record with image URLs
      if (lemUrls.length > 0 || ticketUrls.length > 0) {
        const update = {}
        if (lemUrls.length > 0) update.lem_page_urls = lemUrls
        if (ticketUrls.length > 0) update.contractor_ticket_urls = ticketUrls
        await supabase.from('lem_reconciliation_pairs').update(update).eq('id', dbPair.id)
      }

      if (p === 0) console.log(`[LEM BG Upload] Pair 0: ${lemUrls.length} LEM urls, ${ticketUrls.length} ticket urls`)
      if ((p + 1) % 20 === 0) console.log(`[LEM BG Upload] Progress: ${p + 1}/${rawPairs.length} pairs`)
    }

    console.log(`[LEM BG Upload] Done. ${errors.length} errors.`)
    if (errors.length > 0) console.warn('[LEM BG Upload] Errors:', errors)
  } catch (err) {
    console.error('[LEM BG Upload] Fatal error:', err)
  }
}

// ── LEM Line Item OCR Extraction ─────────────────────────────────────────────
//
// Uses Claude Vision to extract the contractor's claimed billing data from
// LEM summary page images. Returns structured labour/equipment line items
// with names, classifications, hours, rates, and totals.

/**
 * Extract billing line items from a LEM summary page image using Claude Vision.
 *
 * @param {string} imageUrl - Public URL of the LEM summary page image
 * @returns {Promise<{labour: Array, equipment: Array, totals: object, raw_text: string}>}
 */
/**
 * Extract billing data from a LEM document URL — handles both PDFs and images.
 * For PDFs: renders each page to an image via pdf.js, then OCRs each page.
 * For images: OCRs directly.
 */
export async function extractLEMFromUrl(docUrl) {
  if (!docUrl) { console.error('[LEM OCR] No URL provided'); return { labour: [], equipment: [], totals: {}, raw_text: '' } }

  console.log(`[LEM OCR] extractLEMFromUrl called with: ${docUrl.substring(0, 100)}...`)
  console.log(`[LEM OCR] ANTHROPIC_API_KEY present: ${!!ANTHROPIC_API_KEY} (length: ${ANTHROPIC_API_KEY?.length || 0})`)

  const isPdf = docUrl.split('?')[0].toLowerCase().endsWith('.pdf')
  console.log(`[LEM OCR] isPdf: ${isPdf}`)

  if (isPdf) {
    // Render PDF pages to images, then OCR each
    try {
      await ensurePdfJs()
      console.log('[LEM OCR] pdf.js loaded')
    } catch (e) {
      console.error('[LEM OCR] Failed to load pdf.js:', e)
      return { labour: [], equipment: [], totals: {}, raw_text: '' }
    }

    let resp
    try {
      resp = await fetch(docUrl)
      console.log(`[LEM OCR] PDF fetch status: ${resp.status} ${resp.statusText}`)
      if (!resp.ok) {
        console.error(`[LEM OCR] PDF fetch failed: ${resp.status}`)
        return { labour: [], equipment: [], totals: {}, raw_text: '' }
      }
    } catch (e) {
      console.error('[LEM OCR] PDF fetch error (likely CORS):', e)
      return { labour: [], equipment: [], totals: {}, raw_text: '' }
    }

    let pdf
    try {
      const arrayBuffer = await resp.arrayBuffer()
      console.log(`[LEM OCR] PDF arrayBuffer size: ${arrayBuffer.byteLength}`)
      pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
    } catch (e) {
      console.error('[LEM OCR] pdf.js getDocument failed:', e)
      return { labour: [], equipment: [], totals: {}, raw_text: '' }
    }

    const numPages = pdf.numPages
    console.log(`[LEM OCR] PDF has ${numPages} pages — rendering and extracting...`)

    const allLabour = []
    const allEquipment = []
    let grandTotal = 0
    let totalLabourCost = 0
    let totalEquipCost = 0

    for (let i = 1; i <= numPages; i++) {
      console.log(`[LEM OCR] Processing page ${i} of ${numPages}...`)
      let b64
      try {
        const page = await pdf.getPage(i)
        b64 = await renderPageToImage(page, 2.0, 0.9)
        console.log(`[LEM OCR] Page ${i} rendered to image: ${b64?.length || 0} chars base64`)
      } catch (e) {
        console.error(`[LEM OCR] Page ${i} render failed:`, e)
        continue
      }

      // OCR this page image
      let pageResult
      try {
        pageResult = await extractLEMLineItemsFromBase64(b64)
        console.log(`[LEM OCR] Page ${i} OCR result: ${pageResult.labour?.length || 0} labour, ${pageResult.equipment?.length || 0} equipment`)
      } catch (e) {
        console.error(`[LEM OCR] Page ${i} OCR failed:`, e)
        continue
      }
      allLabour.push(...(pageResult.labour || []))
      allEquipment.push(...(pageResult.equipment || []))
      if (pageResult.totals) {
        totalLabourCost += pageResult.totals.total_labour_cost || 0
        totalEquipCost += pageResult.totals.total_equipment_cost || 0
        grandTotal += pageResult.totals.grand_total || 0
      }

      // Rate limit between pages
      if (i < numPages) await sleep(CLASSIFY_DELAY_MS)
    }

    console.log(`[LEM OCR] FINAL: ${allLabour.length} labour, ${allEquipment.length} equipment, total=$${grandTotal}`)
    return {
      labour: allLabour,
      equipment: allEquipment,
      totals: { total_labour_cost: totalLabourCost, total_equipment_cost: totalEquipCost, grand_total: grandTotal },
      raw_text: ''
    }
  } else {
    // Image URL — OCR directly
    return await extractLEMLineItems(docUrl)
  }
}

/**
 * Extract billing data from a base64-encoded page image.
 */
async function extractLEMLineItemsFromBase64(imgBase64) {
  if (!ANTHROPIC_API_KEY) return { labour: [], equipment: [], totals: {}, raw_text: '' }

  const prompt = `You are extracting billing data from a contractor's Labour & Equipment Manifest (LEM) page used in pipeline construction.

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
- If this page appears to be a continuation (equipment section of a multi-page LEM), still extract all items`

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgBase64 } },
              { type: 'text', text: prompt }
            ]
          }]
        })
      })

      if (response.status === 429) {
        const delay = Math.pow(2, attempt + 1) * 1000
        console.log(`[LEM OCR] Rate limited — retrying in ${delay / 1000}s`)
        await sleep(delay)
        continue
      }

      if (!response.ok) {
        console.error(`[LEM OCR] API error: ${response.status}`)
        return { labour: [], equipment: [], totals: {}, raw_text: '' }
      }

      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return { labour: [], equipment: [], totals: {}, raw_text: text }

      const parsed = JSON.parse(jsonMatch[0])
      return {
        labour: parsed.labour || [],
        equipment: parsed.equipment || [],
        totals: parsed.totals || {},
        raw_text: text
      }
    } catch (err) {
      console.error(`[LEM OCR] Attempt ${attempt + 1} failed:`, err)
      if (attempt === MAX_RETRIES - 1) return { labour: [], equipment: [], totals: {}, raw_text: '' }
      await sleep(2000)
    }
  }
  return { labour: [], equipment: [], totals: {}, raw_text: '' }
}

/**
 * Legacy function — extracts from an image URL (not PDF).
 */
export async function extractLEMLineItems(imageUrl) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[LEM OCR] No API key — cannot extract line items')
    return { labour: [], equipment: [], totals: {}, raw_text: '' }
  }

  const prompt = `You are extracting billing data from a contractor's Labour & Equipment Manifest (LEM) page used in pipeline construction.

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
- Keep classification names EXACTLY as printed (e.g., "Gen. Labourer", "Oper 1", "Backhoe Cat 330")
- If the page has subtotals or grand totals, capture them in the totals object
- If this page appears to be a continuation (equipment section of a multi-page LEM), still extract all items`

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Fetch image as base64
      const imgResp = await fetch(imageUrl)
      const imgBlob = await imgResp.blob()
      const imgBase64 = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(imgBlob)
      })

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgBase64 } },
              { type: 'text', text: prompt }
            ]
          }]
        })
      })

      if (response.status === 429) {
        const delay = Math.pow(2, attempt + 1) * 1000
        console.log(`[LEM OCR] Rate limited — retrying in ${delay / 1000}s`)
        await sleep(delay)
        continue
      }

      if (!response.ok) {
        console.error(`[LEM OCR] API error: ${response.status}`)
        return { labour: [], equipment: [], totals: {}, raw_text: '' }
      }

      const data = await response.json()
      const text = data.content?.[0]?.text || ''

      // Parse JSON from response (handle markdown fences)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn('[LEM OCR] No JSON in response')
        return { labour: [], equipment: [], totals: {}, raw_text: text }
      }

      const parsed = JSON.parse(jsonMatch[0])
      console.log(`[LEM OCR] Extracted: ${parsed.labour?.length || 0} labour, ${parsed.equipment?.length || 0} equipment`)
      return {
        labour: parsed.labour || [],
        equipment: parsed.equipment || [],
        totals: parsed.totals || {},
        raw_text: text
      }
    } catch (err) {
      console.error(`[LEM OCR] Attempt ${attempt + 1} failed:`, err)
      if (attempt === MAX_RETRIES - 1) {
        return { labour: [], equipment: [], totals: {}, raw_text: '' }
      }
      await sleep(2000)
    }
  }

  return { labour: [], equipment: [], totals: {}, raw_text: '' }
}

/**
 * Extract billing data from all LEM summary pages in a set of reconciliation pairs.
 * Stores the extracted data on each pair record in the `lem_claimed_data` JSONB column.
 *
 * @param {Array} pairs - Reconciliation pair records with lem_page_urls
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} - Updated pairs with lem_claimed_data populated
 */
export async function extractAllLEMLineItems(pairs, onProgress) {
  const results = []

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    const lemUrls = (pair.lem_page_urls || []).filter(Boolean)

    if (lemUrls.length === 0) {
      results.push({ pairId: pair.id, data: null })
      continue
    }

    onProgress?.(`Extracting billing data from pair ${i + 1} of ${pairs.length}...`)

    // Extract from each LEM page (a pair may have multiple LEM pages)
    const allLabour = []
    const allEquipment = []
    let totalLabourCost = 0
    let totalEquipCost = 0
    let grandTotal = 0

    for (const url of lemUrls) {
      const extracted = await extractLEMLineItems(url)
      allLabour.push(...(extracted.labour || []))
      allEquipment.push(...(extracted.equipment || []))
      if (extracted.totals) {
        totalLabourCost += extracted.totals.total_labour_cost || 0
        totalEquipCost += extracted.totals.total_equipment_cost || 0
        grandTotal += extracted.totals.grand_total || 0
      }
      // Rate limit: wait between pages
      if (lemUrls.length > 1) await sleep(CLASSIFY_DELAY_MS)
    }

    const claimedData = {
      labour: allLabour,
      equipment: allEquipment,
      totals: {
        total_labour_cost: totalLabourCost,
        total_equipment_cost: totalEquipCost,
        grand_total: grandTotal
      },
      extracted_at: new Date().toISOString()
    }

    // Save to pair record
    await supabase.from('lem_reconciliation_pairs')
      .update({ lem_claimed_data: claimedData })
      .eq('id', pair.id)

    results.push({ pairId: pair.id, data: claimedData })
    console.log(`[LEM OCR] Pair ${i + 1}: ${allLabour.length} labour, ${allEquipment.length} equipment, total=$${grandTotal}`)
  }

  onProgress?.(`Extraction complete — ${results.filter(r => r.data).length} pairs processed`)
  return results
}
