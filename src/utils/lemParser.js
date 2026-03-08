/**
 * LEM PDF Parser — Visual Reconciliation
 *
 * Splits contractor LEM PDFs into LEM/ticket pairs for side-by-side visual comparison.
 * The admin compares the documents — the app just organizes and presents.
 *
 * Pipeline:
 *   Phase 1 — Classify every page as "lem" or "daily_ticket" (+ extract date/crew)
 *   Phase 2 — Group consecutive same-type pages via state machine into pairs
 *   Phase 3 — Store page images in Supabase storage, create reconciliation pairs
 *
 * NO detailed field extraction — classification only.
 */

import { supabase } from '../supabase'

const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

// ── PDF to images ──────────────────────────────────────────────────────────

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
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise

    if (viewport.width > viewport.height * 1.2) {
      const rot = document.createElement('canvas')
      rot.width = viewport.height
      rot.height = viewport.width
      const rCtx = rot.getContext('2d')
      rCtx.translate(rot.width, 0)
      rCtx.rotate(Math.PI / 2)
      rCtx.drawImage(canvas, 0, 0)
      images.push(rot.toDataURL('image/jpeg', jpegQuality).split(',')[1])
    } else {
      images.push(canvas.toDataURL('image/jpeg', jpegQuality).split(',')[1])
    }
  }
  return images
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function base64ToBlob(base64, mimeType = 'image/jpeg') {
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mimeType })
}

async function callClaude(imageBlocks, textPrompt, maxTokens = 4000) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: textPrompt }] }]
    })
  })
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`API ${response.status}: ${errText.substring(0, 200)}`)
  }
  const data = await response.json()
  const content = data.content[0]?.text || ''
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in response')
  return JSON.parse(jsonMatch[0])
}

// ── Phase 1: Classify pages ────────────────────────────────────────────────

const CLASSIFY_PROMPT = `Classify each page image from a contractor LEM (Labour and Equipment Manifest) PDF bundle.

For EACH page, determine:
- "lem" — A LEM billing page. Indicators: billing/tabular format, columns like Hours/Rate/Amount, subtotals, contractor letterhead, LEM reference number, may cover a date range.
- "daily_ticket" — A daily field ticket. Indicators: single date, individual worker names with hours, equipment list, foreman/inspector signature lines, field ticket number.

Return ONLY valid JSON:
{
  "classifications": [
    {
      "page_type": "lem" or "daily_ticket",
      "confidence": "high" or "medium" or "low",
      "date": "YYYY-MM-DD or null — date visible on page",
      "crew": "crew name, discipline, or contractor name visible, or null",
      "ticket_number": "field ticket number if visible, or null",
      "lem_number": "LEM reference number if visible, or null"
    }
  ]
}

Return exactly one entry per page image, in order. If unsure, set confidence to "low".`

async function classifyPages(imageBlocks, onProgress, errors) {
  const BATCH_SIZE = 10
  const classifications = []

  for (let b = 0; b < imageBlocks.length; b += BATCH_SIZE) {
    const batch = imageBlocks.slice(b, b + BATCH_SIZE)
    const pageStart = b + 1
    const pageEnd = b + batch.length
    onProgress?.(`Classifying pages ${pageStart}-${pageEnd} of ${imageBlocks.length}...`)

    try {
      const result = await callClaude(
        batch,
        `There are ${batch.length} page images (pages ${pageStart}-${pageEnd}). ${CLASSIFY_PROMPT}`
      )
      const classList = result.classifications || []
      for (let i = 0; i < batch.length; i++) {
        classifications.push(classList[i] || { page_type: 'lem', confidence: 'low', notes: 'Missing' })
      }
    } catch (err) {
      errors.push(`Classification pages ${pageStart}-${pageEnd}: ${err.message}`)
      for (let i = 0; i < batch.length; i++) {
        classifications.push({ page_type: 'lem', confidence: 'low', notes: 'Classification failed' })
      }
    }
  }
  return classifications
}

// ── Phase 2: Group pages via state machine ─────────────────────────────────

/**
 * Groups consecutive same-type pages. Each type-switch creates a new group.
 * Returns: [{ type: 'lem'|'daily_ticket', pageIndices: number[], classifications: object[] }]
 */
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

/**
 * Pair consecutive LEM + ticket groups.
 * Pattern: LEM group followed by ticket group = one pair.
 * A LEM without a following ticket = pair with empty ticket.
 * A ticket without a preceding LEM = standalone ticket pair.
 */
function buildPairs(groups) {
  const pairs = []
  let i = 0
  while (i < groups.length) {
    const g = groups[i]
    if (g.type === 'lem') {
      // Check if next group is a ticket
      if (i + 1 < groups.length && groups[i + 1].type === 'daily_ticket') {
        pairs.push({ lem: g, ticket: groups[i + 1] })
        i += 2
      } else {
        // LEM without ticket
        pairs.push({ lem: g, ticket: null })
        i += 1
      }
    } else {
      // Ticket without preceding LEM (shouldn't happen normally but handle gracefully)
      pairs.push({ lem: null, ticket: g })
      i += 1
    }
  }
  return pairs
}

// ── Phase 3: Store images and create pairs ─────────────────────────────────

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
 *
 * @param {File} file - PDF file
 * @param {function} onProgress - (message) => void
 * @param {string} lemId - LEM upload ID for storage paths
 * @param {string} orgId - Organization ID for pair records
 * @returns {{ pairs: Array, documentInfo: object, errors: string[] }}
 */
export async function parseLEMFile(file, onProgress, lemId, orgId) {
  if (!anthropicApiKey) {
    return { pairs: [], documentInfo: {}, errors: ['Claude API key not configured.'] }
  }
  if (file.size > 100 * 1024 * 1024) {
    return { pairs: [], documentInfo: {}, errors: [`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 100MB.`] }
  }

  const errors = []
  const isPDF = file.type === 'application/pdf'

  // ── Convert to images ──
  let allPageImages = []
  let imageBlocks = []
  if (isPDF) {
    onProgress?.('Converting PDF pages to images...')
    allPageImages = await pdfToImages(file, 500, onProgress)
    onProgress?.(`${allPageImages.length} pages rendered.`)
    imageBlocks = allPageImages.map(b64 => ({
      type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
    }))
  } else {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    allPageImages = [base64]
    imageBlocks = [{ type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } }]
  }

  // ── Phase 1: Classify ──
  onProgress?.('Phase 1: Classifying pages...')
  const classifications = await classifyPages(imageBlocks, onProgress, errors)
  const lemCount = classifications.filter(c => c.page_type === 'lem').length
  const ticketCount = classifications.filter(c => c.page_type === 'daily_ticket').length
  onProgress?.(`${lemCount} LEM pages, ${ticketCount} ticket pages.`)

  // Extract document info from first LEM classification
  const firstLem = classifications.find(c => c.page_type === 'lem')
  const documentInfo = {
    contractor_name: firstLem?.crew || null,
    lem_number: firstLem?.lem_number || null,
    period_start: null,
    period_end: null
  }
  // Find date range from all classifications
  const dates = classifications.map(c => c.date).filter(Boolean).sort()
  if (dates.length > 0) {
    documentInfo.period_start = dates[0]
    documentInfo.period_end = dates[dates.length - 1]
  }

  // ── Phase 2: Group + pair ──
  const groups = groupPages(classifications)
  const pairs = buildPairs(groups)
  onProgress?.(`${pairs.length} LEM/ticket pairs found.`)

  // Check for low-confidence classifications
  const lowConf = classifications.filter(c => c.confidence === 'low')
  if (lowConf.length > 0) {
    errors.push(`${lowConf.length} page(s) classified with low confidence — review recommended.`)
  }

  // ── Phase 3: Upload images + create pair records ──
  if (lemId) {
    onProgress?.('Uploading page images...')
    const pairRecords = []

    for (let p = 0; p < pairs.length; p++) {
      const pair = pairs[p]
      onProgress?.(`Uploading pair ${p + 1} of ${pairs.length}...`)

      // Upload LEM pages
      let lemUrls = []
      let lemIndices = []
      if (pair.lem) {
        lemIndices = pair.lem.pageIndices
        lemUrls = await uploadPageImages(lemId, 'lem', p, lemIndices, allPageImages, errors)
      }

      // Upload ticket pages
      let ticketUrls = []
      let ticketIndices = []
      if (pair.ticket) {
        ticketIndices = pair.ticket.pageIndices
        ticketUrls = await uploadPageImages(lemId, 'ticket', p, ticketIndices, allPageImages, errors)
      }

      // Determine date and crew from classifications
      const allCls = [...(pair.lem?.classifications || []), ...(pair.ticket?.classifications || [])]
      const pairDate = allCls.find(c => c.date)?.date || null
      const pairCrew = allCls.find(c => c.crew)?.crew || null

      pairRecords.push({
        lem_upload_id: lemId,
        organization_id: orgId,
        pair_index: p,
        work_date: pairDate,
        crew_name: pairCrew,
        lem_page_urls: lemUrls,
        lem_page_indices: lemIndices,
        contractor_ticket_urls: ticketUrls,
        contractor_ticket_indices: ticketIndices,
        status: 'pending'
      })
    }

    // Insert pair records
    if (pairRecords.length > 0) {
      onProgress?.(`Saving ${pairRecords.length} pair records...`)
      const { error: insertErr } = await supabase
        .from('lem_reconciliation_pairs')
        .insert(pairRecords)
      if (insertErr) {
        errors.push(`Failed to save pairs: ${insertErr.message}`)
      }
    }

    onProgress?.(`Done: ${pairRecords.length} pairs saved.`)
    return { pairs: pairRecords, documentInfo, errors }
  }

  // If no lemId, just return the pair structure without uploading
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
