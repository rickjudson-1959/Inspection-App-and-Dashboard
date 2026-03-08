/**
 * LEM PDF Parser — Visual Reconciliation (Zero API Calls)
 *
 * Splits contractor LEM PDFs into LEM/ticket pairs for side-by-side visual comparison.
 *
 * Pipeline:
 *   Phase 1 — Extract text from each page via pdf.js, classify using regex/keyword matching
 *   Phase 2 — Group consecutive same-type pages via state machine into pairs
 *   Phase 3 — Convert pages to images, store in Supabase storage, create pair records
 *
 * NO API calls for classification. Text pattern matching only.
 */

import { supabase } from '../supabase'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

// ── PDF.js setup ────────────────────────────────────────────────────────────

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

// ── PDF to images (exported for InvoiceUpload) ─────────────────────────────

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

// ── Extract text from a single PDF page ─────────────────────────────────────

async function extractPageText(page) {
  const textContent = await page.getTextContent()
  return textContent.items.map(item => item.str).join(' ')
}

// ── Phase 1: Text-based page classification ─────────────────────────────────
//
// LEMs are typed/digital PDFs → pdf.js extracts full text (20+ words).
// Daily tickets are scanned images → pdf.js gets little or no text (<20 words).
// The presence or absence of extractable text IS the classifier. Zero API calls.
//

const TEXT_WORD_THRESHOLD = 20  // pages with fewer words than this = scanned ticket

// Date patterns (for extracting dates from LEM text)

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
}

function extractDate(text) {
  // Try YYYY-MM-DD first
  let m = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  // Try Month DD, YYYY
  m = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2}),?\s*(\d{4})/i)
  if (m) {
    const month = MONTH_MAP[m[1].toLowerCase().slice(0, 3)]
    return `${m[3]}-${month}-${m[2].padStart(2, '0')}`
  }

  // Try DD Month YYYY
  m = text.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*,?\s*(\d{4})/i)
  if (m) {
    const month = MONTH_MAP[m[2].toLowerCase().slice(0, 3)]
    return `${m[3]}-${month}-${m[1].padStart(2, '0')}`
  }

  // Try MM/DD/YYYY or DD/MM/YYYY (assume MM/DD for North American context)
  m = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m) {
    const a = parseInt(m[1]), b = parseInt(m[2])
    // If first number > 12, it's DD/MM/YYYY
    if (a > 12) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }

  return null
}

function extractCrewName(text) {
  // Look for patterns like "Crew: ..." or "Contractor: ..."
  let m = text.match(/(?:crew|contractor|company)\s*[:]\s*([^\n,;]{3,40})/i)
  if (m) return m[1].trim()

  // Look for "Foreman: Name"
  m = text.match(/foreman\s*[:]\s*([^\n,;]{3,30})/i)
  if (m) return m[1].trim()

  return null
}

function extractTicketNumber(text) {
  // "Ticket #1234" or "Ticket No. 1234" or "Field Ticket 1234"
  let m = text.match(/(?:ticket|field\s*ticket)\s*(?:#|no\.?|number)?\s*[:.]?\s*(\S{3,20})/i)
  if (m) return m[1].replace(/[,;.]$/, '')
  return null
}

function extractLemNumber(text) {
  let m = text.match(/(?:L\.?E\.?M\.?|manifest)\s*(?:#|no\.?|number|ref)?\s*[:.]?\s*(\S{3,20})/i)
  if (m) return m[1].replace(/[,;.]$/, '')
  return null
}

/**
 * Classify a single page based on extractable text word count.
 *
 * LEMs are typed/digital → 20+ words of extractable text.
 * Daily tickets are scanned images → <20 words (little or no text layer).
 *
 * Returns: { page_type, confidence, date, crew, ticket_number, lem_number, word_count }
 */
function classifyPageText(text) {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0)
  const wordCount = words.length

  const page_type = wordCount >= TEXT_WORD_THRESHOLD ? 'lem' : 'daily_ticket'
  const confidence = 'high' // text presence/absence is a reliable signal

  return {
    page_type,
    confidence,
    date: extractDate(text),
    crew: extractCrewName(text),
    ticket_number: page_type === 'daily_ticket' ? extractTicketNumber(text) : null,
    lem_number: page_type === 'lem' ? extractLemNumber(text) : null,
    word_count: wordCount
  }
}

// ── Phase 2: Group pages via state machine ─────────────────────────────────

function groupPages(classifications) {
  if (classifications.length === 0) return []
  const groups = []
  let cur = { type: classifications[0].page_type, pageIndices: [0], classifications: [classifications[0]] }

  for (let i = 1; i < classifications.length; i++) {
    const cls = classifications[i]
    if (cls.page_type === cur.type) {
      cur.pageIndices.push(i)
      cur.classifications.push(cls)
    } else {
      groups.push(cur)
      cur = { type: cls.page_type, pageIndices: [i], classifications: [cls] }
    }
  }
  groups.push(cur)
  return groups
}

function buildPairs(groups) {
  const pairs = []
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

// ── Phase 3: Convert to images + upload ─────────────────────────────────────

function base64ToBlob(base64, mimeType = 'image/jpeg') {
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mimeType })
}

async function renderPageToImage(page, scale, jpegQuality) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise

  // Rotate landscape pages to portrait
  if (viewport.width > viewport.height * 1.2) {
    const rot = document.createElement('canvas')
    rot.width = viewport.height
    rot.height = viewport.width
    const rCtx = rot.getContext('2d')
    rCtx.translate(rot.width, 0)
    rCtx.rotate(Math.PI / 2)
    rCtx.drawImage(canvas, 0, 0)
    return rot.toDataURL('image/jpeg', jpegQuality).split(',')[1]
  }
  return canvas.toDataURL('image/jpeg', jpegQuality).split(',')[1]
}

async function uploadPageImages(lemId, groupType, pairIndex, pageIndices, allPageImages, errors) {
  const urls = []
  for (const idx of pageIndices) {
    const base64 = allPageImages[idx]
    if (!base64) continue
    try {
      const blob = base64ToBlob(base64)
      const folder = groupType === 'lem' ? 'lem_pages' : 'ticket_pages'
      const filePath = `lem-uploads/${lemId}/${folder}/pair${pairIndex}_p${idx + 1}.jpg`
      const { error: upErr } = await supabase.storage
        .from('lem-uploads')
        .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true })
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(filePath)
        urls.push(urlData?.publicUrl || null)
      }
    } catch (e) {
      errors.push(`Upload pair ${pairIndex} ${groupType} page ${idx + 1}: ${e.message}`)
    }
  }
  return urls.filter(Boolean)
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Parse a LEM PDF into visual reconciliation pairs.
 * Uses text extraction + regex for classification — ZERO API calls.
 *
 * @param {File} file - PDF file
 * @param {function} onProgress - (message) => void
 * @param {string} lemId - LEM upload ID for storage paths (omit for preview)
 * @param {string} orgId - Organization ID for pair records
 * @returns {{ pairs: Array, documentInfo: object, errors: string[] }}
 */
export async function parseLEMFile(file, onProgress, lemId, orgId) {
  if (file.size > 100 * 1024 * 1024) {
    return { pairs: [], documentInfo: {}, errors: [`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 100MB.`] }
  }

  const errors = []
  const isPDF = file.type === 'application/pdf'

  if (!isPDF) {
    // Single image file — treat as one ticket page
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const pairs = [{ pair_index: 0, work_date: null, crew_name: null, lem_pages: 0, ticket_pages: 1 }]
    return { pairs, documentInfo: {}, errors }
  }

  await ensurePdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages
  onProgress?.(`PDF loaded: ${numPages} pages.`)

  // ── Phase 1: Extract text + classify (no API calls) ──
  onProgress?.('Classifying pages (text analysis)...')
  const classifications = []

  for (let i = 1; i <= numPages; i++) {
    if (i % 50 === 0 || i === 1) onProgress?.(`Classifying page ${i} of ${numPages}...`)
    const page = await pdf.getPage(i)
    const text = await extractPageText(page)
    const cls = classifyPageText(text)
    classifications.push(cls)
  }

  const lemCount = classifications.filter(c => c.page_type === 'lem').length
  const ticketCount = classifications.filter(c => c.page_type === 'daily_ticket').length
  onProgress?.(`Classification done: ${lemCount} LEM pages, ${ticketCount} ticket pages.`)

  // ── DEBUG: Show first 30 pages classification detail ──
  const debugLimit = Math.min(30, classifications.length)
  console.log(`\n=== PAGE CLASSIFICATION DEBUG (first ${debugLimit} of ${classifications.length} pages) ===`)
  for (let d = 0; d < debugLimit; d++) {
    const c = classifications[d]
    console.log(`  Page ${d + 1}: ${c.page_type.padEnd(12)} | words: ${String(c.word_count).padStart(4)} | date: ${c.date || '-'} | crew: ${c.crew || '-'}`)
  }
  console.log(`=== TOTALS: ${lemCount} LEM, ${ticketCount} ticket out of ${classifications.length} pages ===\n`)

  // ── DIAGNOSTIC: Send page 1 to Claude Vision to see what we're dealing with ──
  if (ANTHROPIC_API_KEY) {
    try {
      onProgress?.('Sending page 1 to Claude Vision for diagnostic...')
      const page1 = await pdf.getPage(1)
      const page1Image = await renderPageToImage(page1, 2.0, 0.9)
      const diagResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: page1Image } },
              { type: 'text', text: 'Describe what you see on this page. Is it a LEM (billing summary with rates, hours, totals in a table format) or a daily ticket (single day, crew names, individual hours, signature lines)? Describe the layout, headers, and any distinguishing features.' }
            ]
          }]
        })
      })
      const diagData = await diagResponse.json()
      const diagText = diagData?.content?.[0]?.text || JSON.stringify(diagData)
      console.log('\n=== CLAUDE VISION DIAGNOSTIC — PAGE 1 ===')
      console.log(diagText)
      console.log('=== END DIAGNOSTIC ===\n')
      onProgress?.('Diagnostic complete — check browser console for Claude Vision response.')
    } catch (diagErr) {
      console.error('Diagnostic Vision call failed:', diagErr.message)
    }
  } else {
    console.warn('No ANTHROPIC_API_KEY — skipping Vision diagnostic')
  }

  // Extract document info from first LEM classification
  const firstLem = classifications.find(c => c.page_type === 'lem')
  const documentInfo = {
    contractor_name: firstLem?.crew || classifications.find(c => c.crew)?.crew || null,
    lem_number: firstLem?.lem_number || null,
    period_start: null,
    period_end: null
  }
  const dates = classifications.map(c => c.date).filter(Boolean).sort()
  if (dates.length > 0) {
    documentInfo.period_start = dates[0]
    documentInfo.period_end = dates[dates.length - 1]
  }

  // ── Phase 2: Group + pair ──
  const groups = groupPages(classifications)
  const pairs = buildPairs(groups)
  onProgress?.(`${pairs.length} LEM/ticket pairs found.`)

  const lowConf = classifications.filter(c => c.confidence === 'low')
  if (lowConf.length > 0) {
    errors.push(`${lowConf.length} page(s) classified with low confidence — review recommended.`)
  }

  // ── Phase 3: Convert to images + upload ──
  if (lemId) {
    onProgress?.('Rendering page images...')
    const scale = numPages > 50 ? 1.5 : 2.0
    const jpegQuality = numPages > 50 ? 0.8 : 0.9

    // Collect all page indices that need images
    const neededIndices = new Set()
    for (const pair of pairs) {
      if (pair.lem) pair.lem.pageIndices.forEach(i => neededIndices.add(i))
      if (pair.ticket) pair.ticket.pageIndices.forEach(i => neededIndices.add(i))
    }

    // Render only needed pages to images
    const allPageImages = new Array(numPages).fill(null)
    let rendered = 0
    for (const idx of neededIndices) {
      rendered++
      if (rendered % 20 === 0) onProgress?.(`Rendering page ${rendered} of ${neededIndices.size}...`)
      const page = await pdf.getPage(idx + 1) // pdf.js is 1-indexed
      allPageImages[idx] = await renderPageToImage(page, scale, jpegQuality)
    }
    onProgress?.(`${rendered} pages rendered.`)

    // Upload images and create pair records
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
    return { pairs: pairRecords, documentInfo, errors }
  }

  // Preview mode — no upload, just return pair structure
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

  return { pairs: pairSummaries, documentInfo, errors }
}
