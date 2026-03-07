/**
 * LEM PDF Parser
 *
 * Converts contractor LEM PDFs to structured line items using:
 *   1. pdf.js to render pages as images
 *   2. Claude Vision API for OCR + structured extraction
 *   3. Batch processing (5 pages per API call)
 *   4. Page classification: LEM summary vs daily ticket copy
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
export async function pdfToImages(file, maxPages = 20) {
  await ensurePdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images = []
  const limit = Math.min(pdf.numPages, maxPages)

  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i)
    const scale = 2.0
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
      images.push(rot.toDataURL('image/jpeg', 0.9).split(',')[1])
    } else {
      images.push(canvas.toDataURL('image/jpeg', 0.9).split(',')[1])
    }
  }
  return images
}

const PAGE_CLASSIFY_AND_EXTRACT_PROMPT = `You are parsing pages from a contractor LEM (Labour and Equipment Manifest) PDF bundle for a pipeline construction project. The bundle may contain BOTH types of pages:

A) LEM SUMMARY PAGES — billing tables listing multiple tickets with labour/equipment totals
B) DAILY TICKET PAGES — individual daily ticket or timesheet copies for a single day/crew

For EACH page, classify it and extract data accordingly.

Return ONLY a valid JSON array with one entry per page:
[
  {
    "page_type": "lem_summary" or "daily_ticket",
    "ticket_number": "extracted ticket number (for daily_ticket pages, this is critical)",

    // ONLY for lem_summary pages — extract line items:
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
    ],

    // ONLY for daily_ticket pages — just the ticket number:
    "line_items": []
  }
]

CRITICAL RULES:
- Classify EVERY page as either "lem_summary" or "daily_ticket"
- For lem_summary pages: extract ALL line items with full labour and equipment detail
- For daily_ticket pages: extract the ticket number from the page. The ticket number is THE most important field.
- List EVERY person as a SEPARATE labour entry with their full name
- List EVERY piece of equipment as a SEPARATE equipment entry
- Each page with a different ticket number, date, or foreman is a SEPARATE line item
- If a page contains only headers, subtotals, or cover pages, classify as "lem_summary" with empty line_items
- Return ONLY the JSON array, no other text`

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
 * Parse a LEM PDF file into structured line items + ticket page images.
 * @param {File} file - The PDF or image file
 * @param {function} onProgress - Optional callback: (message) => void
 * @param {string} lemId - Optional: if provided, ticket page images are uploaded and linked
 * @returns {{ lineItems: Array, ticketPages: Array<{ticket_number, pageIndex, base64}>, errors: string[] }}
 */
export async function parseLEMFile(file, onProgress, lemId) {
  if (!anthropicApiKey) {
    return { lineItems: [], ticketPages: [], errors: ['Claude API key not configured. Add VITE_ANTHROPIC_API_KEY to your .env file.'] }
  }
  if (file.size > 30 * 1024 * 1024) {
    return { lineItems: [], ticketPages: [], errors: [`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum 30MB.`] }
  }

  const isPDF = file.type === 'application/pdf'
  const errors = []
  const allLineItems = []
  const ticketPages = []

  let allPageImages = [] // Keep raw base64 for ticket page storage
  let imageBlocks = []
  if (isPDF) {
    onProgress?.('Converting PDF pages to images...')
    allPageImages = await pdfToImages(file)
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

  // Process in batches of 5 pages
  const PAGES_PER_BATCH = 5
  const batches = []
  for (let b = 0; b < imageBlocks.length; b += PAGES_PER_BATCH) {
    batches.push({
      blocks: imageBlocks.slice(b, b + PAGES_PER_BATCH),
      startIdx: b
    })
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const { blocks: batch, startIdx } = batches[batchIdx]
    const pageStart = startIdx + 1
    const pageEnd = startIdx + batch.length
    onProgress?.(`Processing pages ${pageStart}-${pageEnd} of ${imageBlocks.length}...`)

    try {
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
          max_tokens: 16000,
          messages: [{
            role: 'user',
            content: [
              ...batch,
              {
                type: 'text',
                text: `There are ${batch.length} pages (pages ${pageStart}-${pageEnd}). ${PAGE_CLASSIFY_AND_EXTRACT_PROMPT}`
              }
            ]
          }]
        })
      })

      if (!response.ok) {
        const errText = await response.text()
        errors.push(`Pages ${pageStart}-${pageEnd}: API error ${response.status} - ${errText.substring(0, 200)}`)
        continue
      }

      const data = await response.json()
      const content = data.content[0]?.text || ''
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        errors.push(`Pages ${pageStart}-${pageEnd}: Could not extract structured data.`)
        continue
      }

      const extracted = JSON.parse(jsonMatch[0])
      const pages = Array.isArray(extracted) ? extracted : [extracted]

      pages.forEach((page, pageOffset) => {
        const globalPageIdx = startIdx + pageOffset

        if (page.page_type === 'daily_ticket') {
          // Store ticket page image for four-way comparison
          ticketPages.push({
            ticket_number: page.ticket_number || null,
            pageIndex: globalPageIdx,
            base64: allPageImages[globalPageIdx] || null
          })
        }

        // Extract line items (from summary pages, or single-item from ticket pages that also have data)
        const items = page.line_items || []
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
      })
    } catch (err) {
      errors.push(`Pages ${pageStart}-${pageEnd}: ${err.message}`)
    }
  }

  // If lemId provided, upload ticket page images to storage and return URLs
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

  return { lineItems: allLineItems, ticketPages, errors }
}
