/**
 * LEM PDF Parser
 *
 * Converts contractor LEM PDFs to structured line items using:
 *   1. pdf.js to render pages as images
 *   2. Claude Vision API for OCR + structured extraction
 *   3. Batch processing (5 pages per API call)
 */

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

const LEM_EXTRACTION_PROMPT = `You are parsing a contractor Labour and Equipment Manifest (LEM) for a pipeline construction project.

Extract every line item from these LEM pages. Each line item represents one daily ticket.

For each line item, extract:
- ticket_number: The contractor's daily ticket number/reference (CRITICAL - look for field log #, ticket #, daily ticket number)
- work_date: The date of work (YYYY-MM-DD)
- crew_name: Crew or discipline name
- foreman: Foreman name if listed
- activity_description: What work was performed

For labour entries on each line item:
- employee_name (if listed)
- classification (job title/trade)
- rt_hours (regular time hours)
- ot_hours (overtime hours, 0 if none)
- jh_hours (jump hours/bonus hours, 0 if none)
- count (number of workers if grouped, 1 if individual)
- rate (hourly rate if shown, 0 if not)
- line_total (dollar amount if shown, 0 if not)

For equipment entries on each line item:
- equipment_type (machine name/description)
- unit_number (fleet/asset number)
- hours (hours of use)
- count (number of units if grouped, 1 if individual)
- rate (hourly rate if shown, 0 if not)
- line_total (dollar amount if shown, 0 if not)

Return ONLY a valid JSON array. Each element is one daily ticket/line item:
[
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

CRITICAL RULES:
- Extract a LEM from EVERY page. Do NOT stop after the first page.
- List EVERY person as a SEPARATE labour entry with their full name.
- List EVERY piece of equipment as a SEPARATE equipment entry.
- Each page with a different ticket number, date, or foreman is a SEPARATE line item.
- The ticket_number is the most important field — look carefully for it.
- If a page contains only headers, subtotals, or summaries (no individual ticket data), return an empty array [].
- Return ONLY the JSON array, no other text.`

/**
 * Parse a LEM PDF file into structured line items.
 * @param {File} file - The PDF or image file
 * @param {function} onProgress - Optional callback: (message) => void
 * @returns {{ lineItems: Array, errors: string[] }}
 */
export async function parseLEMFile(file, onProgress) {
  if (!anthropicApiKey) {
    return { lineItems: [], errors: ['Claude API key not configured. Add VITE_ANTHROPIC_API_KEY to your .env file.'] }
  }
  if (file.size > 30 * 1024 * 1024) {
    return { lineItems: [], errors: [`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum 30MB.`] }
  }

  const isPDF = file.type === 'application/pdf'
  const errors = []
  const allLineItems = []

  let imageBlocks = []
  if (isPDF) {
    onProgress?.('Converting PDF pages to images...')
    const pageImages = await pdfToImages(file)
    imageBlocks = pageImages.map(base64 => ({
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
    imageBlocks = [{
      type: 'image',
      source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 }
    }]
  }

  // Process in batches of 5 pages
  const PAGES_PER_BATCH = 5
  const batches = []
  for (let b = 0; b < imageBlocks.length; b += PAGES_PER_BATCH) {
    batches.push(imageBlocks.slice(b, b + PAGES_PER_BATCH))
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    const pageStart = batchIdx * PAGES_PER_BATCH + 1
    const pageEnd = pageStart + batch.length - 1
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
                text: `There are ${batch.length} pages (pages ${pageStart}-${pageEnd}). ${LEM_EXTRACTION_PROMPT}`
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
      const items = Array.isArray(extracted) ? extracted : [extracted]

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
    } catch (err) {
      errors.push(`Pages ${pageStart}-${pageEnd}: ${err.message}`)
    }
  }

  return { lineItems: allLineItems, errors }
}
