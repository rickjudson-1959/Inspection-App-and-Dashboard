/**
 * LEM PDF Parser
 *
 * Converts contractor LEM PDFs to structured line items using:
 *   1. pdf.js to render pages as images
 *   2. Claude Vision API for classification + structured extraction
 *   3. State-machine grouping: consecutive same-type pages are grouped
 *   4. Multi-page support: LEMs and tickets can span multiple pages
 *
 * Processing pipeline:
 *   Phase 1 — Classify every page as "lem_summary" or "daily_ticket"
 *   Phase 2 — Group consecutive same-type pages via state machine
 *   Phase 3 — Send each group's pages together for full extraction
 */

import { supabase } from '../supabase'

const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

/**
 * Load pdf.js from CDN if not already loaded
 */
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

/**
 * Convert a PDF file to an array of base64 JPEG page images.
 * Landscape pages are auto-rotated 90 deg clockwise.
 */
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

// ---------------------------------------------------------------------------
// PHASE 1 — Classification prompt (classify only, no extraction)
// ---------------------------------------------------------------------------

const CLASSIFY_PROMPT = `You are classifying pages from a contractor LEM (Labour and Equipment Manifest) PDF bundle for a pipeline construction project.

For EACH page image provided, determine whether it is:
A) "lem_summary" — A LEM billing page. Key indicators:
   - Billing/tabular format with columns like Description, Hours, Rate, Amount
   - Subtotals, totals, or summary rows
   - Contractor letterhead or LEM reference number
   - May cover a date range
   - Lists multiple workers/equipment in a billing format

B) "daily_ticket" — A daily field ticket page. Key indicators:
   - A single date prominently displayed
   - Individual worker names with hours worked
   - Equipment listed with hours
   - Foreman signature line and/or inspector signature line
   - A field ticket number (e.g., "Ticket #1234" or "Daily Ticket")

Return ONLY a valid JSON object:
{
  "classifications": [
    {
      "page_type": "lem_summary" or "daily_ticket",
      "confidence": "high" or "medium" or "low",
      "ticket_number": "string or null (extract if visible on daily_ticket pages)",
      "lem_number": "string or null (extract if visible on lem_summary pages)",
      "notes": "brief reason for classification"
    }
  ]
}

CRITICAL:
- Return exactly one classification per page image, in order
- If you are unsure, set confidence to "low"
- Extract ticket_number from daily tickets and lem_number from LEM pages when visible
- Return ONLY the JSON object, no other text`

// ---------------------------------------------------------------------------
// PHASE 3 — Extraction prompts (sent with grouped multi-page images)
// ---------------------------------------------------------------------------

const LEM_EXTRACT_PROMPT = `You are extracting data from LEM (Labour and Equipment Manifest) billing pages from a pipeline construction project. These pages may span multiple pages — all images shown belong to the SAME LEM document. Combine data across all pages.

Return ONLY a valid JSON object:
{
  "document_info": {
    "contractor_name": "the contractor/company name",
    "lem_number": "LEM reference number if shown",
    "period_start": "YYYY-MM-DD earliest date",
    "period_end": "YYYY-MM-DD latest date"
  },
  "line_items": [
    {
      "ticket_number": "string",
      "work_date": "YYYY-MM-DD",
      "crew_name": "string",
      "foreman": "string or null",
      "activity_description": "string",
      "labour_entries": [{ "employee_name": "", "classification": "", "rt_hours": 0, "ot_hours": 0, "jh_hours": 0, "count": 1, "rate": 0, "line_total": 0 }],
      "equipment_entries": [{ "equipment_type": "", "unit_number": "", "hours": 0, "count": 1, "rate": 0, "line_total": 0 }]
    }
  ]
}

CRITICAL RULES:
- These pages are ALL part of the SAME LEM — combine data across pages
- List EVERY person as a SEPARATE labour entry with their full name
- List EVERY piece of equipment as a SEPARATE equipment entry
- Each different ticket number, date, or foreman is a SEPARATE line item
- Extract rates and line totals when shown
- If a page is a cover page, header, or subtotal page with no new line items, that's OK — just extract what's there
- Return ONLY the JSON object, no other text`

const TICKET_EXTRACT_PROMPT = `You are extracting data from daily field ticket pages from a pipeline construction project. These pages may span multiple pages — all images shown belong to the SAME daily ticket. Combine data across all pages.

Return ONLY a valid JSON object:
{
  "ticket_number": "the field ticket number (CRITICAL — extract this)",
  "work_date": "YYYY-MM-DD",
  "crew_name": "string or null",
  "foreman": "string or null",
  "activity_description": "string",
  "labour_entries": [{ "employee_name": "", "classification": "", "rt_hours": 0, "ot_hours": 0, "jh_hours": 0, "count": 1, "rate": 0, "line_total": 0 }],
  "equipment_entries": [{ "equipment_type": "", "unit_number": "", "hours": 0, "count": 1, "rate": 0, "line_total": 0 }]
}

CRITICAL RULES:
- These pages are ALL part of the SAME ticket — combine data across pages
- The ticket number is THE most important field
- List EVERY person as a SEPARATE labour entry with their full name
- List EVERY piece of equipment as a SEPARATE equipment entry
- Return ONLY the JSON object, no other text`

/**
 * Convert base64 image data to a Blob for storage upload
 */
function base64ToBlob(base64, mimeType = 'image/jpeg') {
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mimeType })
}

/**
 * Call Claude Vision API with image blocks + text prompt
 */
async function callClaude(imageBlocks, textPrompt, maxTokens = 16000) {
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
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: textPrompt }
        ]
      }]
    })
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`API error ${response.status}: ${errText.substring(0, 200)}`)
  }

  const data = await response.json()
  const content = data.content[0]?.text || ''
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in response')
  return JSON.parse(jsonMatch[0])
}

/**
 * Phase 1: Classify all pages in batches
 * Returns array of { page_type, confidence, ticket_number, lem_number } per page
 */
async function classifyPages(allPageImages, imageBlocks, onProgress, errors) {
  const BATCH_SIZE = 10 // classify more per batch since no extraction
  const classifications = []

  for (let b = 0; b < imageBlocks.length; b += BATCH_SIZE) {
    const batch = imageBlocks.slice(b, b + BATCH_SIZE)
    const pageStart = b + 1
    const pageEnd = b + batch.length
    onProgress?.(`Classifying pages ${pageStart}-${pageEnd} of ${imageBlocks.length}...`)

    try {
      const result = await callClaude(
        batch,
        `There are ${batch.length} page images (pages ${pageStart}-${pageEnd}). ${CLASSIFY_PROMPT}`,
        4000
      )
      const classList = result.classifications || []
      for (let i = 0; i < batch.length; i++) {
        classifications.push(classList[i] || { page_type: 'lem_summary', confidence: 'low', notes: 'Missing classification' })
      }
    } catch (err) {
      errors.push(`Classification pages ${pageStart}-${pageEnd}: ${err.message}`)
      // Default to lem_summary for failed batches
      for (let i = 0; i < batch.length; i++) {
        classifications.push({ page_type: 'lem_summary', confidence: 'low', notes: 'Classification failed' })
      }
    }
  }

  return classifications
}

/**
 * Phase 2: Group consecutive same-type pages using state machine
 *
 * State: READING_LEM
 *   → Next page is LEM?    → Append to current LEM group (multi-page)
 *   → Next page is ticket? → LEM complete, switch to READING_TICKET
 *
 * State: READING_TICKET
 *   → Next page is ticket? → Append to current ticket group (multi-page)
 *   → Next page is LEM?    → Ticket complete, save pair, start new LEM, switch to READING_LEM
 *
 * Returns array of groups: { type: 'lem_summary'|'daily_ticket', pageIndices: number[], classifications: object[] }
 */
function groupPages(classifications) {
  if (classifications.length === 0) return []

  const groups = []
  let currentGroup = {
    type: classifications[0].page_type,
    pageIndices: [0],
    classifications: [classifications[0]]
  }

  for (let i = 1; i < classifications.length; i++) {
    const cls = classifications[i]
    if (cls.page_type === currentGroup.type) {
      // Same type — append to current group (multi-page document)
      currentGroup.pageIndices.push(i)
      currentGroup.classifications.push(cls)
    } else {
      // Type changed — finalize current group, start new one
      groups.push(currentGroup)
      currentGroup = {
        type: cls.page_type,
        pageIndices: [i],
        classifications: [cls]
      }
    }
  }
  // Push final group
  groups.push(currentGroup)

  return groups
}

/**
 * Phase 3: Extract data from each group by sending all its pages together
 */
async function extractGroups(groups, allPageImages, imageBlocks, onProgress, errors) {
  let documentInfo = {}
  const allLineItems = []
  const ticketPages = []

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]
    const pageNums = group.pageIndices.map(i => i + 1).join(', ')
    const pageCount = group.pageIndices.length
    onProgress?.(`Extracting ${group.type} (${pageCount} page${pageCount > 1 ? 's' : ''}: p${pageNums}) [${g + 1}/${groups.length}]...`)

    // Build image blocks for this group
    const groupImageBlocks = group.pageIndices.map(idx => imageBlocks[idx])

    // Check for low-confidence classifications
    const lowConfidence = group.classifications.filter(c => c.confidence === 'low')
    if (lowConfidence.length > 0) {
      const warning = `Pages ${pageNums}: ${lowConfidence.length} page(s) with low classification confidence — review may be needed`
      errors.push(warning)
    }

    try {
      if (group.type === 'lem_summary') {
        // Extract LEM data — all pages sent together
        const prompt = `These ${pageCount} page(s) are ALL part of the same LEM billing document. ${LEM_EXTRACT_PROMPT}`
        const result = await callClaude(groupImageBlocks, prompt)

        // Capture document info from first LEM
        if (result.document_info) {
          if (!documentInfo.contractor_name && result.document_info.contractor_name) {
            documentInfo = { ...documentInfo, ...result.document_info }
          }
        }

        // Extract line items
        const items = result.line_items || []
        items.forEach(item => {
          const labourEntries = item.labour_entries || []
          const equipEntries = item.equipment_entries || []

          const totalLabourHours = labourEntries.reduce((sum, e) =>
            sum + (parseFloat(e.rt_hours) || 0) + (parseFloat(e.ot_hours) || 0) + (parseFloat(e.jh_hours) || 0), 0)
          const totalLabourCost = labourEntries.reduce((sum, e) =>
            sum + ((parseFloat(e.rt_hours) || 0) * (parseFloat(e.rate) || 0)) +
                  ((parseFloat(e.ot_hours) || 0) * (parseFloat(e.rate) || 0) * 1.5) +
                  ((parseFloat(e.jh_hours) || 0) * (parseFloat(e.rate) || 0)), 0)
          const totalEquipHours = equipEntries.reduce((sum, e) =>
            sum + (parseFloat(e.hours) || 0) * (parseInt(e.count) || 1), 0)
          const totalEquipCost = equipEntries.reduce((sum, e) =>
            sum + (parseFloat(e.hours) || 0) * (parseFloat(e.rate) || 0) * (parseInt(e.count) || 1), 0)

          allLineItems.push({
            ticket_number: item.ticket_number || null,
            work_date: item.work_date || null,
            crew_name: item.crew_name || null,
            foreman: item.foreman || null,
            activity_description: item.activity_description || '',
            labour_entries: labourEntries,
            equipment_entries: equipEntries,
            total_labour_hours: Math.round(totalLabourHours * 10) / 10,
            total_labour_cost: Math.round(totalLabourCost * 100) / 100,
            total_equipment_hours: Math.round(totalEquipHours * 10) / 10,
            total_equipment_cost: Math.round(totalEquipCost * 100) / 100,
            line_total: Math.round((totalLabourCost + totalEquipCost) * 100) / 100
          })
        })

      } else {
        // Extract ticket data — all pages sent together
        const prompt = `These ${pageCount} page(s) are ALL part of the same daily field ticket. ${TICKET_EXTRACT_PROMPT}`
        const result = await callClaude(groupImageBlocks, prompt)

        const ticketNumber = result.ticket_number || group.classifications[0]?.ticket_number || null

        // Store ALL pages of this ticket for four-way comparison
        group.pageIndices.forEach(idx => {
          ticketPages.push({
            ticket_number: ticketNumber,
            pageIndex: idx,
            base64: allPageImages[idx] || null
          })
        })

        // If the ticket extraction returned labour/equipment data, create a line item
        const labourEntries = result.labour_entries || []
        const equipEntries = result.equipment_entries || []
        if (labourEntries.length > 0 || equipEntries.length > 0) {
          const totalLabourHours = labourEntries.reduce((sum, e) =>
            sum + (parseFloat(e.rt_hours) || 0) + (parseFloat(e.ot_hours) || 0) + (parseFloat(e.jh_hours) || 0), 0)
          const totalLabourCost = labourEntries.reduce((sum, e) =>
            sum + ((parseFloat(e.rt_hours) || 0) * (parseFloat(e.rate) || 0)) +
                  ((parseFloat(e.ot_hours) || 0) * (parseFloat(e.rate) || 0) * 1.5) +
                  ((parseFloat(e.jh_hours) || 0) * (parseFloat(e.rate) || 0)), 0)
          const totalEquipHours = equipEntries.reduce((sum, e) =>
            sum + (parseFloat(e.hours) || 0) * (parseInt(e.count) || 1), 0)
          const totalEquipCost = equipEntries.reduce((sum, e) =>
            sum + (parseFloat(e.hours) || 0) * (parseFloat(e.rate) || 0) * (parseInt(e.count) || 1), 0)

          allLineItems.push({
            ticket_number: ticketNumber,
            work_date: result.work_date || null,
            crew_name: result.crew_name || null,
            foreman: result.foreman || null,
            activity_description: result.activity_description || '',
            labour_entries: labourEntries,
            equipment_entries: equipEntries,
            total_labour_hours: Math.round(totalLabourHours * 10) / 10,
            total_labour_cost: Math.round(totalLabourCost * 100) / 100,
            total_equipment_hours: Math.round(totalEquipHours * 10) / 10,
            total_equipment_cost: Math.round(totalEquipCost * 100) / 100,
            line_total: Math.round((totalLabourCost + totalEquipCost) * 100) / 100,
            source: 'daily_ticket'
          })
        }
      }
    } catch (err) {
      errors.push(`Group ${g + 1} (${group.type}, pages ${pageNums}): ${err.message}`)
    }
  }

  return { documentInfo, allLineItems, ticketPages }
}

/**
 * Parse a LEM PDF file into structured line items + ticket page images.
 *
 * Pipeline:
 *   1. Convert PDF to page images
 *   2. Classify every page (LEM vs daily ticket) in batches
 *   3. Group consecutive same-type pages (state machine)
 *   4. Extract data from each group (all pages sent together)
 *   5. Upload ticket page images if lemId provided
 *
 * @param {File} file - The PDF or image file
 * @param {function} onProgress - Optional callback: (message) => void
 * @param {string} lemId - Optional: if provided, ticket page images are uploaded and linked
 * @returns {{ lineItems: Array, ticketPages: Array, documentInfo: object, pageGroups: Array, errors: string[] }}
 */
export async function parseLEMFile(file, onProgress, lemId) {
  if (!anthropicApiKey) {
    return { lineItems: [], ticketPages: [], documentInfo: {}, pageGroups: [], errors: ['Claude API key not configured. Add VITE_ANTHROPIC_API_KEY to your .env file.'] }
  }
  if (file.size > 100 * 1024 * 1024) {
    return { lineItems: [], ticketPages: [], documentInfo: {}, pageGroups: [], errors: [`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum 100MB.`] }
  }

  const isPDF = file.type === 'application/pdf'
  const errors = []

  // --- Step 1: Convert to images ---
  let allPageImages = []
  let imageBlocks = []
  if (isPDF) {
    onProgress?.('Converting PDF pages to images (this may take a minute for large files)...')
    allPageImages = await pdfToImages(file, 500, onProgress)
    onProgress?.(`Converted ${allPageImages.length} pages.`)
    imageBlocks = allPageImages.map(base64 => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
    }))
  } else {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    allPageImages = [base64]
    imageBlocks = [{
      type: 'image',
      source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 }
    }]
  }

  // --- Step 2: Classify all pages ---
  onProgress?.('Phase 1: Classifying pages...')
  const classifications = await classifyPages(allPageImages, imageBlocks, onProgress, errors)
  const lemCount = classifications.filter(c => c.page_type === 'lem_summary').length
  const ticketCount = classifications.filter(c => c.page_type === 'daily_ticket').length
  onProgress?.(`Classified ${allPageImages.length} pages: ${lemCount} LEM, ${ticketCount} ticket.`)

  // --- Step 3: Group pages via state machine ---
  const groups = groupPages(classifications)
  onProgress?.(`Phase 2: Grouped into ${groups.length} document groups.`)

  // --- Step 4: Extract data from each group ---
  onProgress?.('Phase 3: Extracting data from each group...')
  const { documentInfo, allLineItems, ticketPages } = await extractGroups(
    groups, allPageImages, imageBlocks, onProgress, errors
  )

  onProgress?.(`Extraction complete: ${allLineItems.length} line items, ${ticketPages.length} ticket pages.`)

  // --- Step 5: Upload ticket page images ---
  if (lemId && ticketPages.length > 0) {
    onProgress?.(`Uploading ${ticketPages.length} ticket page images...`)
    for (const tp of ticketPages) {
      if (!tp.base64 || !tp.ticket_number) continue
      try {
        const blob = base64ToBlob(tp.base64)
        const filePath = `lem-uploads/${lemId}/tickets/${tp.ticket_number.replace(/[^a-zA-Z0-9-_]/g, '_')}_p${tp.pageIndex + 1}.jpg`
        const { error: upErr } = await supabase.storage.from('lem-uploads').upload(filePath, blob, { contentType: 'image/jpeg' })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(filePath)
          tp.url = urlData?.publicUrl || null
        }
      } catch (e) {
        // Non-fatal — continue without image
      }
    }
  }

  return { lineItems: allLineItems, ticketPages, documentInfo, pageGroups: groups, errors }
}
