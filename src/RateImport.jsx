import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || import.meta.env.VITE_CLAUDE_API_KEY || ''

export default function RateImport({ organizationId, organizationName, onComplete }) {
  const [activeTab, setActiveTab] = useState('labour')
  const [file, setFile] = useState(null)
  const [previewData, setPreviewData] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0])
  const [poNumber, setPoNumber] = useState('')
  const [importSuccess, setImportSuccess] = useState(false)
  const [existingRates, setExistingRates] = useState([])
  const [loadingRates, setLoadingRates] = useState(false)

  // Load existing rates when org or tab changes
  useEffect(() => {
    if (!organizationId) return
    loadExistingRates()
  }, [organizationId, activeTab])

  async function loadExistingRates() {
    setLoadingRates(true)
    try {
      const tableMap = {
        labour: 'labour_rates',
        equipment: 'equipment_rates',
        personnel: 'personnel_roster',
        fleet: 'equipment_fleet'
      }
      const tableName = tableMap[activeTab] || 'labour_rates'
      const resp = await fetch(`/api/rates?table=${tableName}&organization_id=${organizationId}`)
      if (resp.ok) {
        setExistingRates(await resp.json())
      } else {
        const errData = await resp.json().catch(() => ({}))
        console.error('Error loading rates:', resp.status, errData)
        setExistingRates([])
      }
    } catch (err) {
      console.error('Error loading rates:', err)
    }
    setLoadingRates(false)
  }

  // Convert file to base64
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Read text content from CSV or XLSX
  async function readFileAsText(file) {
    const ext = file.name.split('.').pop().toLowerCase()

    if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
      return await file.text()
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      // Convert first sheet to CSV text
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      return XLSX.utils.sheet_to_csv(firstSheet)
    }

    return null // Not a text-readable format — use Vision
  }

  // Parse JSON array from Claude response, recovering truncated output
  function parseRateJSON(content) {
    // Try direct match first
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[0])
        return { data: data.map(row => ({ ...row, valid: true })), error: null }
      } catch (e) {
        // Fall through to recovery
      }
    }

    // Response was likely truncated (no closing ]). Recover what we can.
    const bracketStart = content.indexOf('[')
    if (bracketStart === -1) {
      return { data: [], error: `AI response did not contain rate data. Response: "${content.substring(0, 300)}"` }
    }

    let jsonStr = content.substring(bracketStart)

    // Remove any trailing incomplete object (e.g., {"classification": "Foo", "rate_st": )
    // Find the last complete object by looking for the last '}' followed by optional whitespace/comma
    const lastCloseBrace = jsonStr.lastIndexOf('}')
    if (lastCloseBrace === -1) {
      return { data: [], error: `AI response was truncated before any complete entries. Try a smaller file or enter rates manually.` }
    }

    jsonStr = jsonStr.substring(0, lastCloseBrace + 1) + ']'

    try {
      const data = JSON.parse(jsonStr)
      return { data: data.map(row => ({ ...row, valid: true })), error: null }
    } catch (parseErr) {
      return { data: [], error: `Failed to parse AI response: ${parseErr.message}. Response start: "${content.substring(0, 300)}"` }
    }
  }

  // Send text data (CSV/XLSX content) to Claude for extraction
  // Returns { data: [], error: string|null } for better diagnostics
  async function extractRatesFromText(textContent, rateType) {
    if (!ANTHROPIC_API_KEY) {
      return { data: [], error: 'API key not configured. VITE_ANTHROPIC_API_KEY is missing from environment.' }
    }

    const prompt = rateType === 'labour'
      ? `You are extracting labour/personnel rate data from a contractor's rate sheet for a pipeline construction project.

Extract rates from these SPECIFIC COLUMNS:
- Column V: "DAILY or ST RATE HR" — this is the weekly rate for salaried staff OR the straight time hourly rate for field workers
- Column W: "OT (1.5) HR" — overtime 1.5x hourly rate
- Column X: "OT (2.0) HR" — overtime 2.0x hourly rate (weekends/holidays)
- Column Y: "SUBS" — subsistence/per diem

The sheet has TWO sections:
1. SALARIED/INDIRECT STAFF (managers, foremen, supervisors, office clerks, coordinators, engineers) — Column V contains WEEKLY rates ($1,000+). Set rate_type to "weekly". Some indirect positions show MIN and MAX rates on separate lines — USE THE MIN RATE ONLY, skip the max line.
2. HOURLY FIELD WORKERS (labourers, operators, welders, drivers, helpers) — Column V contains HOURLY ST rates ($30-$90/hr). Set rate_type to "hourly".

Return ONLY a JSON array. Each object must have: classification (string), rate_type (string — "weekly" or "hourly"), rate_st (number — Column V as-is, do NOT convert), rate_ot (number — Column W), rate_dt (number — Column X), rate_subs (number — Column Y, 0 if blank).
Skip header rows, subtotal rows, blank rows, and MAX rate lines for indirect positions.
IMPORTANT: Some classifications (e.g., STRAW - OPERATOR, STRAW - LABOURER) have empty early columns (scale, weekly hours, earnings) but DO have rates in columns V/W/X/Y. Include these rows — a row is valid if it has a classification name AND at least one rate value in columns V, W, or X. Do NOT skip rows just because early columns are empty.

Example: [{"classification": "General Foreman", "rate_type": "weekly", "rate_st": 5871.00, "rate_ot": 273.63, "rate_dt": 364.84, "rate_subs": 175.00}, {"classification": "General Labourer", "rate_type": "hourly", "rate_st": 48.10, "rate_ot": 72.15, "rate_dt": 96.20, "rate_subs": 175.00}]

Return ONLY the JSON array, no explanation.

DATA:
${textContent}`
      : `You are extracting equipment rate data from a contractor's rate sheet for a pipeline construction project.

The sheet has these key columns:
- Equipment description (column 1)
- Monthly rate (column 3)
- Base hourly rate (column 5)
- Allowance for Parts & Repairs per hour (column 6)
- All-in daily rate (column 10) — this is the final costing number

Extract every equipment type with ALL of these rates. Return ONLY a JSON array.
Each object must have: equipment_type (string), rate_monthly (number — monthly rate), rate_base (number — base hourly rate from col 5), rate_parts (number — parts/repairs allowance from col 6), rate_hourly (number — rate_base + rate_parts), rate_daily (number — the all-in daily rate from col 10, extract as-is).
If only a daily rate is visible, use it for rate_daily and calculate rate_hourly = rate_daily / 10.
Skip any header rows, subtotal rows, or blank rows. Only include actual equipment with rates.

Example: [{"equipment_type": "Excavator 200", "rate_monthly": 4500.00, "rate_base": 15.50, "rate_parts": 3.25, "rate_hourly": 18.75, "rate_daily": 187.50}]

Return ONLY the JSON array, no explanation.

DATA:
${textContent}`

    let response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16384,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      })
    } catch (fetchErr) {
      return { data: [], error: `Network error calling AI: ${fetchErr.message}. This may be a CORS or connectivity issue.` }
    }

    if (!response.ok) {
      const errText = await response.text()
      return { data: [], error: `AI API returned ${response.status}: ${errText.substring(0, 200)}` }
    }

    const result = await response.json()
    const content = result.content?.[0]?.text || ''

    if (!content) {
      return { data: [], error: `AI returned empty response. Full response: ${JSON.stringify(result).substring(0, 300)}` }
    }

    return parseRateJSON(content)
  }

  // Send image/PDF to Claude Vision for extraction
  async function extractRatesFromVision(base64Data, mediaType, rateType) {
    if (!ANTHROPIC_API_KEY) {
      return { data: [], error: 'API key not configured. VITE_ANTHROPIC_API_KEY is missing from environment.' }
    }

    const prompt = rateType === 'labour'
      ? `Extract ALL labour/personnel rates from this pipeline construction rate sheet.
Use these SPECIFIC COLUMNS: V = "DAILY or ST RATE HR" (weekly or hourly rate), W = "OT (1.5) HR", X = "OT (2.0) HR", Y = "SUBS" (subsistence).
TWO sections: (1) SALARIED/INDIRECT with WEEKLY rates ($1,000+) — use MIN rate only if min/max shown, skip max lines; (2) HOURLY field workers ($30-$90/hr).
Return ONLY a JSON array. Each object: classification (string), rate_type ("weekly" or "hourly"), rate_st (number — Col V as-is), rate_ot (number — Col W), rate_dt (number — Col X), rate_subs (number — Col Y, 0 if blank).
Skip headers/subtotals/blanks/max rate lines. IMPORTANT: Include rows where early columns are empty but rate columns (V/W/X) have values (e.g., STRAW classifications). A row is valid if it has a classification name and at least one rate in V/W/X.
Example: [{"classification": "General Foreman", "rate_type": "weekly", "rate_st": 5871.00, "rate_ot": 273.63, "rate_dt": 364.84, "rate_subs": 175.00}]
Return ONLY the JSON array.`
      : `Extract ALL equipment rates from this pipeline construction rate sheet.
Key columns: equipment description (col 1), monthly rate (col 3), base hourly rate (col 5), parts/repairs allowance hourly (col 6), all-in daily rate (col 10).
Return ONLY a JSON array. Each object: equipment_type (string), rate_monthly (number), rate_base (number — col 5), rate_parts (number — col 6), rate_hourly (number — base + parts), rate_daily (number — col 10 as-is).
If only daily visible, rate_hourly = daily/10. Skip headers/subtotals/blanks.
Example: [{"equipment_type": "Excavator 200", "rate_monthly": 4500.00, "rate_base": 15.50, "rate_parts": 3.25, "rate_hourly": 18.75, "rate_daily": 187.50}]
Return ONLY the JSON array.`

    let claudeMediaType = mediaType
    if (!mediaType.startsWith('image/') && mediaType !== 'application/pdf') {
      claudeMediaType = 'image/png'
    }

    let response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16384,
          messages: [{
            role: 'user',
            content: [
              {
                type: mediaType === 'application/pdf' ? 'document' : 'image',
                source: {
                  type: 'base64',
                  media_type: claudeMediaType,
                  data: base64Data
                }
              },
              { type: 'text', text: prompt }
            ]
          }]
        })
      })
    } catch (fetchErr) {
      return { data: [], error: `Network error calling AI: ${fetchErr.message}` }
    }

    if (!response.ok) {
      const errText = await response.text()
      return { data: [], error: `AI API returned ${response.status}: ${errText.substring(0, 200)}` }
    }

    const result = await response.json()
    const content = result.content?.[0]?.text || ''

    if (!content) {
      return { data: [], error: `AI returned empty response. Full response: ${JSON.stringify(result).substring(0, 300)}` }
    }

    return parseRateJSON(content)
  }

  // Parse a simple two-column roster CSV/XLSX and return preview rows
  async function parseRosterCSV(uploadedFile, tab) {
    // Use XLSX library for proper parsing — handles quoted commas, XLSX, CSV, etc.
    let sheetRows = []
    try {
      const buffer = await uploadedFile.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      // Get as array of arrays — each inner array is a row of cell values
      sheetRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' })
    } catch (e) {
      return { data: [], error: `Failed to read file: ${e.message}` }
    }

    if (sheetRows.length === 0) {
      return { data: [], error: 'File appears to be empty.' }
    }

    const rows = []
    for (const row of sheetRows) {
      const colA = String(row[0] || '').trim()
      const colB = String(row[1] || '').trim()

      if (!colA) continue
      const lowerA = colA.toLowerCase()
      // Skip header rows
      if (tab === 'personnel' && (lowerA === 'employee name' || lowerA === 'name' || lowerA === 'employee' || lowerA === 'last name' || lowerA === 'last, first')) continue
      if (tab === 'fleet' && (lowerA === 'unit number' || lowerA === 'unit #' || lowerA === 'unit' || lowerA === 'equipment' || lowerA === 'fleet #')) continue

      if (tab === 'personnel') {
        rows.push({ employee_name: colA, classification: colB, valid: true })
      } else {
        rows.push({ unit_number: colA, equipment_type: colB, valid: true })
      }
    }

    if (rows.length === 0) {
      return { data: [], error: 'No data rows found. Ensure Column A has names/unit numbers and Column B has classifications/types.' }
    }
    return { data: rows, error: null }
  }

  // Universal file upload handler — routes to the right extraction method
  async function handleFileUpload(e) {
    const uploadedFile = e.target.files[0]
    if (!uploadedFile) return

    setFile(uploadedFile)
    setError('')
    setLoading(true)
    setLoadingMessage('Reading file...')

    try {
      const ext = uploadedFile.name.split('.').pop().toLowerCase()

      // Roster tabs — simple direct CSV parsing, no AI needed
      if (activeTab === 'personnel' || activeTab === 'fleet') {
        if (!['csv', 'txt', 'tsv', 'xlsx', 'xls'].includes(ext)) {
          setError(`Unsupported file type: .${ext}. Upload a CSV or Excel file for roster import.`)
          setLoading(false)
          return
        }
        const result = await parseRosterCSV(uploadedFile, activeTab)
        if (result.error) {
          setError(result.error)
          setPreviewData([])
        } else {
          setPreviewData(result.data)
        }
        setLoading(false)
        setLoadingMessage('')
        return
      }

      setLoadingMessage('AI is reading the rate sheet...')

      // For CSV/XLSX/XLS — read as text and send to Claude text API
      if (['csv', 'txt', 'tsv', 'xlsx', 'xls'].includes(ext)) {
        setLoadingMessage('Reading file...')
        const textContent = await readFileAsText(uploadedFile)

        if (!textContent || textContent.trim().length < 10) {
          setError('File appears to be empty or unreadable.')
          setLoading(false)
          return
        }

        setLoadingMessage('AI is extracting rates...')
        const result = await extractRatesFromText(textContent, activeTab)

        if (result.error) {
          setError(`Rate extraction failed: ${result.error}`)
          setPreviewData([])
        } else if (result.data.length === 0) {
          setError('AI returned an empty result. The file may not contain rate data. Try adding rows manually.')
          setPreviewData([])
        } else {
          setPreviewData(result.data)
        }
      }
      // For PDF/images — send to Claude Vision
      else if (['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'bmp'].includes(ext)) {
        setLoadingMessage('Processing image...')
        const base64 = await fileToBase64(uploadedFile)
        const mediaType = uploadedFile.type || 'image/png'

        setLoadingMessage('AI is reading the rate sheet...')
        const result = await extractRatesFromVision(base64, mediaType, activeTab)

        if (result.error) {
          setError(`Rate extraction failed: ${result.error}`)
          setPreviewData([])
        } else if (result.data.length === 0) {
          setError('AI returned an empty result. Try a clearer image or a different format.')
          setPreviewData([])
        } else {
          setPreviewData(result.data)
        }
      } else {
        setError(`Unsupported file type: .${ext}. Upload a CSV, Excel (.xlsx/.xls), PDF, or image file.`)
      }
    } catch (err) {
      setError('Error processing file: ' + err.message)
    }

    setLoading(false)
    setLoadingMessage('')
  }

  // Edit a row in preview
  function updateRow(index, field, value) {
    const updated = [...previewData]
    if (['rate_st', 'rate_ot', 'rate_dt', 'rate_subs', 'rate_monthly', 'rate_base', 'rate_parts', 'rate_hourly', 'rate_daily'].includes(field)) {
      updated[index][field] = parseFloat(value) || 0
    } else {
      updated[index][field] = value
    }
    setPreviewData(updated)
  }

  // Delete a row from preview
  function deleteRow(index) {
    setPreviewData(previewData.filter((_, i) => i !== index))
  }

  // Add empty row
  function addRow() {
    if (activeTab === 'labour') {
      setPreviewData([...previewData, { classification: '', rate_type: 'hourly', rate_st: 0, rate_ot: 0, rate_dt: 0, rate_subs: 0, valid: true }])
    } else if (activeTab === 'equipment') {
      setPreviewData([...previewData, { equipment_type: '', rate_monthly: 0, rate_base: 0, rate_parts: 0, rate_hourly: 0, rate_daily: 0, valid: true }])
    } else if (activeTab === 'personnel') {
      setPreviewData([...previewData, { employee_name: '', classification: '', valid: true }])
    } else if (activeTab === 'fleet') {
      setPreviewData([...previewData, { unit_number: '', equipment_type: '', valid: true }])
    }
  }

  // Import to Supabase via server-side API route
  async function handleImport() {
    if (!organizationId) {
      setError('Please select an organization first')
      return
    }

    if (previewData.length === 0) {
      setError('No data to import')
      return
    }

    setLoading(true)
    setLoadingMessage('Importing rates...')
    setError('')

    try {
      const tableMap = {
        labour: 'labour_rates',
        equipment: 'equipment_rates',
        personnel: 'personnel_roster',
        fleet: 'equipment_fleet'
      }
      const tableName = tableMap[activeTab] || 'labour_rates'

      const records = previewData.map(row => {
        const record = { organization_id: organizationId }

        if (activeTab === 'labour') {
          record.effective_date = effectiveDate
          record.po_number = poNumber.trim() || null
          record.classification = row.classification
          record.rate_type = row.rate_type || 'hourly'
          record.rate_st = row.rate_st || 0
          record.rate_ot = row.rate_ot || 0
          record.rate_dt = row.rate_dt || 0
          record.rate_subs = row.rate_subs || 0
        } else if (activeTab === 'equipment') {
          record.effective_date = effectiveDate
          record.po_number = poNumber.trim() || null
          record.equipment_type = row.equipment_type
          record.rate_type = 'daily'
          record.rate_monthly = row.rate_monthly || 0
          record.rate_base = row.rate_base || 0
          record.rate_parts = row.rate_parts || 0
          record.rate_hourly = row.rate_hourly || (parseFloat(row.rate_base || 0) + parseFloat(row.rate_parts || 0))
          record.rate_daily = row.rate_daily || (record.rate_hourly * 10)
        } else if (activeTab === 'personnel') {
          record.employee_name = row.employee_name
          record.classification = row.classification
        } else if (activeTab === 'fleet') {
          record.unit_number = row.unit_number
          record.equipment_type = row.equipment_type
        }

        return record
      })

      // For roster tabs, deduplicate and clear existing data first
      let finalRecords = records
      if (activeTab === 'personnel') {
        const seen = new Set()
        finalRecords = records.filter(r => {
          const key = (r.employee_name || '').toLowerCase().trim()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        // Clear existing roster before importing
        await fetch(`/api/rates?table=${tableName}&organization_id=${organizationId}`, { method: 'DELETE' })
      } else if (activeTab === 'fleet') {
        const seen = new Set()
        finalRecords = records.filter(r => {
          const key = (r.unit_number || '').toLowerCase().trim()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        await fetch(`/api/rates?table=${tableName}&organization_id=${organizationId}`, { method: 'DELETE' })
      }

      console.log('[RateImport] POSTing', finalRecords.length, 'records via /api/rates')

      const response = await fetch(`/api/rates?table=${tableName}&organization_id=${organizationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalRecords)
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(`Database error (${response.status}): ${errData.error || JSON.stringify(errData)}`)
      }

      const inserted = await response.json()
      const tabLabels = { labour: 'labour', equipment: 'equipment', personnel: 'personnel', fleet: 'fleet' }
      console.log(`[RateImport] SUCCESS: Imported ${inserted.length} ${tabLabels[activeTab] || activeTab} records`)

      setImportSuccess(true)
      setPreviewData([])
      setFile(null)
      loadExistingRates()

      if (onComplete) onComplete(inserted.length)

    } catch (err) {
      console.error('[RateImport] Import error:', err)
      setError('Import failed: ' + err.message)
    }

    setLoading(false)
    setLoadingMessage('')
  }

  // Delete all rates for this org
  async function clearRates() {
    if (!confirm(`Delete all ${activeTab} records for ${organizationName}?`)) return
    try {
      const tableMap = {
        labour: 'labour_rates',
        equipment: 'equipment_rates',
        personnel: 'personnel_roster',
        fleet: 'equipment_fleet'
      }
      const tableName = tableMap[activeTab] || 'labour_rates'
      const response = await fetch(`/api/rates?table=${tableName}&organization_id=${organizationId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setExistingRates([])
      } else {
        const errData = await response.json().catch(() => ({}))
        setError('Delete failed: ' + (errData.error || response.statusText))
      }
    } catch (err) {
      setError('Delete failed: ' + err.message)
    }
  }

  // Reset form
  function reset() {
    setFile(null)
    setPreviewData([])
    setError('')
    setImportSuccess(false)
    setLoadingMessage('')
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: '#003366' }}>Import Rate Sheets</h2>
        <p style={{ color: '#666', marginTop: '8px' }}>
          Upload any rate sheet — AI reads the file and extracts the rates automatically
        </p>
      </div>

      {/* Organization Display */}
      {organizationId && (
        <div style={{
          backgroundColor: '#e8f4fd',
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '20px',
          border: '1px solid #b3d9f7'
        }}>
          <strong>Organization:</strong> {organizationName || organizationId}
        </div>
      )}

      {/* Tab Selection */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={() => { setActiveTab('labour'); reset() }}
          style={{
            padding: '12px 24px',
            backgroundColor: activeTab === 'labour' ? '#003366' : '#f0f0f0',
            color: activeTab === 'labour' ? 'white' : '#333',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Labour Rates
        </button>
        <button
          onClick={() => { setActiveTab('equipment'); reset() }}
          style={{
            padding: '12px 24px',
            backgroundColor: activeTab === 'equipment' ? '#003366' : '#f0f0f0',
            color: activeTab === 'equipment' ? 'white' : '#333',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Equipment Rates
        </button>
        <button
          onClick={() => { setActiveTab('personnel'); reset() }}
          style={{
            padding: '12px 24px',
            backgroundColor: activeTab === 'personnel' ? '#003366' : '#f0f0f0',
            color: activeTab === 'personnel' ? 'white' : '#333',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Personnel Roster
        </button>
        <button
          onClick={() => { setActiveTab('fleet'); reset() }}
          style={{
            padding: '12px 24px',
            backgroundColor: activeTab === 'fleet' ? '#003366' : '#f0f0f0',
            color: activeTab === 'fleet' ? 'white' : '#333',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Equipment Fleet
        </button>
      </div>

      {/* Existing Rates Display */}
      {existingRates.length > 0 && !importSuccess && previewData.length === 0 && (
        <div style={{ marginBottom: '24px', backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '16px', border: '1px solid #dee2e6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#003366' }}>
              {activeTab === 'labour' && `Current Labour Rates (${existingRates.length})`}
              {activeTab === 'equipment' && `Current Equipment Rates (${existingRates.length})`}
              {activeTab === 'personnel' && `Current Personnel Roster (${existingRates.length})`}
              {activeTab === 'fleet' && `Current Equipment Fleet (${existingRates.length})`}
            </h3>
            <button
              onClick={clearRates}
              style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              Clear All
            </button>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: '300px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#e9ecef', position: 'sticky', top: 0 }}>
                  {activeTab === 'labour' && (
                    <>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Classification</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Type</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>ST/Weekly</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>OT 1.5x</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>DT 2.0x</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Subs</th>
                    </>
                  )}
                  {activeTab === 'equipment' && (
                    <>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Equipment Type</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Monthly</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Base</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Parts</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Hourly</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Daily</th>
                    </>
                  )}
                  {activeTab === 'personnel' && (
                    <>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Employee Name</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Classification</th>
                    </>
                  )}
                  {activeTab === 'fleet' && (
                    <>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Unit #</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Equipment Type</th>
                    </>
                  )}
                  {(activeTab === 'labour' || activeTab === 'equipment') && (
                    <>
                      <th style={{ padding: '8px', textAlign: 'left' }}>PO</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Effective</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {existingRates.map((r, idx) => (
                  <tr key={r.id || idx} style={{ borderBottom: '1px solid #dee2e6' }}>
                    {activeTab === 'labour' && (
                      <>
                        <td style={{ padding: '6px 8px' }}>{r.classification}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '10px', backgroundColor: r.rate_type === 'weekly' ? '#dbeafe' : '#dcfce7', color: r.rate_type === 'weekly' ? '#1e40af' : '#166534', fontWeight: '600' }}>
                            {r.rate_type === 'weekly' ? 'Weekly' : 'Hourly'}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_st?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_ot?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_dt?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_subs?.toFixed(2) || '—'}</td>
                      </>
                    )}
                    {activeTab === 'equipment' && (
                      <>
                        <td style={{ padding: '6px 8px' }}>{r.equipment_type}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_monthly?.toFixed(2) || '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_base?.toFixed(2) || '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_parts?.toFixed(2) || '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_hourly?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_daily?.toFixed(2)}</td>
                      </>
                    )}
                    {activeTab === 'personnel' && (
                      <>
                        <td style={{ padding: '6px 8px' }}>{r.employee_name}</td>
                        <td style={{ padding: '6px 8px' }}>{r.classification}</td>
                      </>
                    )}
                    {activeTab === 'fleet' && (
                      <>
                        <td style={{ padding: '6px 8px' }}>{r.unit_number}</td>
                        <td style={{ padding: '6px 8px' }}>{r.equipment_type}</td>
                      </>
                    )}
                    {(activeTab === 'labour' || activeTab === 'equipment') && (
                      <>
                        <td style={{ padding: '6px 8px', fontSize: '12px', color: '#2563eb', fontWeight: '500' }}>{r.po_number || '-'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: '12px', color: '#666' }}>{r.effective_date}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {loadingRates && <p style={{ color: '#666' }}>Loading existing rates...</p>}

      {/* Success Message */}
      {importSuccess && (
        <div style={{
          backgroundColor: '#d4edda',
          border: '1px solid #c3e6cb',
          color: '#155724',
          padding: '16px',
          borderRadius: '6px',
          marginBottom: '20px'
        }}>
          Rates imported successfully!
          <button onClick={reset} style={{ marginLeft: '20px', padding: '4px 12px', cursor: 'pointer' }}>
            Import More
          </button>
        </div>
      )}

      {/* Upload Section */}
      {!importSuccess && (
        <>
          {/* Single Upload Box */}
          {previewData.length === 0 && !loading && (
            <div style={{
              border: '2px dashed #003366',
              borderRadius: '12px',
              padding: '40px 20px',
              textAlign: 'center',
              backgroundColor: '#f8fafc',
              marginBottom: '24px'
            }}>
              <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.6 }}>
                {activeTab === 'labour' ? '\u{1F477}' : activeTab === 'equipment' ? '\u{1F6DC}' : activeTab === 'personnel' ? '\u{1F465}' : '\u{1F697}'}
              </div>
              <h3 style={{ margin: '0 0 8px 0', color: '#003366' }}>
                {activeTab === 'labour' && 'Upload Labour Rate Sheet'}
                {activeTab === 'equipment' && 'Upload Equipment Rate Sheet'}
                {activeTab === 'personnel' && 'Upload Personnel Roster'}
                {activeTab === 'fleet' && 'Upload Equipment Fleet'}
              </h3>
              <p style={{ color: '#666', margin: '0 0 20px 0', fontSize: '14px' }}>
                {(activeTab === 'labour' || activeTab === 'equipment')
                  ? 'Drop the contractor\'s file here — any format works. AI reads it automatically.'
                  : activeTab === 'personnel'
                    ? 'CSV with Column A = employee name (Last, First) and Column B = classification.'
                    : 'CSV with Column A = unit number and Column B = equipment type/description.'
                }
              </p>
              <label style={{
                display: 'inline-block',
                padding: '14px 32px',
                backgroundColor: '#003366',
                color: 'white',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '16px'
              }}>
                Choose File
                <input
                  type="file"
                  accept={
                    (activeTab === 'personnel' || activeTab === 'fleet')
                      ? '.csv,.txt,.tsv,.xlsx,.xls'
                      : '.csv,.txt,.tsv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,.gif,.tiff,.bmp'
                  }
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
              <p style={{ color: '#999', fontSize: '12px', marginTop: '16px' }}>
                {(activeTab === 'personnel' || activeTab === 'fleet')
                  ? 'Accepts: CSV or Excel (.xlsx/.xls)'
                  : 'Accepts: CSV, Excel (.xlsx/.xls), PDF, or images (PNG, JPG, etc.)'
                }
              </p>
              <p style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
                Or <button
                  onClick={addRow}
                  style={{ background: 'none', border: 'none', color: '#003366', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                >
                  enter rates manually
                </button>
              </p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{
              textAlign: 'center',
              padding: '50px',
              backgroundColor: '#f8f9fa',
              borderRadius: '12px',
              marginBottom: '20px',
              border: '1px solid #dee2e6'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                border: '4px solid #dee2e6',
                borderTopColor: '#003366',
                borderRadius: '50%',
                margin: '0 auto 16px',
                animation: 'spin 1s linear infinite'
              }} />
              <p style={{ color: '#003366', fontWeight: '600', margin: 0 }}>{loadingMessage}</p>
              <p style={{ color: '#999', fontSize: '13px', marginTop: '8px' }}>
                {file && `Processing: ${file.name}`}
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              backgroundColor: '#f8d7da',
              border: '1px solid #f5c6cb',
              color: '#721c24',
              padding: '12px 16px',
              borderRadius: '6px',
              marginBottom: '20px'
            }}>
              {error}
            </div>
          )}

          {/* Preview Table */}
          {previewData.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
              }}>
                <h3 style={{ margin: 0 }}>
                  Preview ({previewData.length} rows)
                  {file && <span style={{ fontWeight: 'normal', fontSize: '13px', color: '#666', marginLeft: '12px' }}>from {file.name}</span>}
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={addRow}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    + Add Row
                  </button>
                  <label style={{
                    padding: '8px 16px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'inline-block'
                  }}>
                    Re-upload
                    <input
                      type="file"
                      accept={
                        (activeTab === 'personnel' || activeTab === 'fleet')
                          ? '.csv,.txt,.tsv,.xlsx,.xls'
                          : '.csv,.txt,.tsv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,.gif,.tiff,.bmp'
                      }
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#003366' }}>
                      {activeTab === 'labour' && (
                        <>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Classification</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'center', width: '90px' }}>Type</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>ST/Weekly (V)</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>OT 1.5x (W)</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>DT 2.0x (X)</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Subs (Y)</th>
                        </>
                      )}
                      {activeTab === 'equipment' && (
                        <>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Equipment Type</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Monthly</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Base Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Parts/Repairs</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Hourly</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Daily (10hr)</th>
                        </>
                      )}
                      {activeTab === 'personnel' && (
                        <>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Employee Name</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Classification</th>
                        </>
                      )}
                      {activeTab === 'fleet' && (
                        <>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Unit #</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Equipment Type</th>
                        </>
                      )}
                      <th style={{ color: 'white', padding: '12px', textAlign: 'center', width: '60px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                        {activeTab === 'labour' && (
                          <>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="text"
                                value={row.classification || ''}
                                onChange={(e) => updateRow(idx, 'classification', e.target.value)}
                                style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                              />
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <select
                                value={row.rate_type || 'hourly'}
                                onChange={(e) => updateRow(idx, 'rate_type', e.target.value)}
                                style={{ padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                              >
                                <option value="hourly">Hourly</option>
                                <option value="weekly">Weekly</option>
                              </select>
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={row.rate_st || ''}
                                onChange={(e) => updateRow(idx, 'rate_st', e.target.value)}
                                style={{ width: '100px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={row.rate_ot || ''}
                                onChange={(e) => updateRow(idx, 'rate_ot', e.target.value)}
                                style={{ width: '100px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={row.rate_dt || ''}
                                onChange={(e) => updateRow(idx, 'rate_dt', e.target.value)}
                                style={{ width: '100px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={row.rate_subs || ''}
                                onChange={(e) => updateRow(idx, 'rate_subs', e.target.value)}
                                style={{ width: '100px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
                              />
                            </td>
                          </>
                        )}
                        {activeTab === 'equipment' && (
                          <>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="text"
                                value={row.equipment_type || ''}
                                onChange={(e) => updateRow(idx, 'equipment_type', e.target.value)}
                                style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={row.rate_monthly || ''}
                                onChange={(e) => updateRow(idx, 'rate_monthly', e.target.value)}
                                style={{ width: '90px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={row.rate_base || ''}
                                onChange={(e) => updateRow(idx, 'rate_base', e.target.value)}
                                style={{ width: '90px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={row.rate_parts || ''}
                                onChange={(e) => updateRow(idx, 'rate_parts', e.target.value)}
                                style={{ width: '90px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#166534' }}>
                              ${(parseFloat(row.rate_base || 0) + parseFloat(row.rate_parts || 0)).toFixed(2)}
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={row.rate_daily || ''}
                                onChange={(e) => updateRow(idx, 'rate_daily', e.target.value)}
                                style={{ width: '90px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
                              />
                            </td>
                          </>
                        )}
                        {activeTab === 'personnel' && (
                          <>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="text"
                                value={row.employee_name || ''}
                                onChange={(e) => updateRow(idx, 'employee_name', e.target.value)}
                                style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                                placeholder="Last, First"
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="text"
                                value={row.classification || ''}
                                onChange={(e) => updateRow(idx, 'classification', e.target.value)}
                                style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                                placeholder="e.g. General Labourer"
                              />
                            </td>
                          </>
                        )}
                        {activeTab === 'fleet' && (
                          <>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="text"
                                value={row.unit_number || ''}
                                onChange={(e) => updateRow(idx, 'unit_number', e.target.value)}
                                style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                                placeholder="e.g. EX-01"
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="text"
                                value={row.equipment_type || ''}
                                onChange={(e) => updateRow(idx, 'equipment_type', e.target.value)}
                                style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                                placeholder="e.g. Excavator 320"
                              />
                            </td>
                          </>
                        )}
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <button
                            onClick={() => deleteRow(idx)}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            X
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Import Settings */}
              <div style={{
                marginTop: '20px',
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                {(activeTab === 'labour' || activeTab === 'equipment') && (
                  <>
                    <div>
                      <label style={{ marginRight: '10px', fontWeight: '600' }}>PO Number:</label>
                      <input
                        type="text"
                        value={poNumber}
                        onChange={(e) => setPoNumber(e.target.value)}
                        placeholder="e.g., PO-4410"
                        style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '150px' }}
                      />
                    </div>
                    <div>
                      <label style={{ marginRight: '10px', fontWeight: '600' }}>Effective Date:</label>
                      <input
                        type="date"
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                        style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={reset}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={loading || !organizationId}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#003366',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                      opacity: loading ? 0.7 : 1
                    }}
                  >
                    {loading ? 'Importing...' : (
                      activeTab === 'labour' ? `Import ${previewData.length} Labour Rates` :
                      activeTab === 'equipment' ? `Import ${previewData.length} Equipment Rates` :
                      activeTab === 'personnel' ? `Import ${previewData.length} Personnel` :
                      `Import ${previewData.length} Fleet Items`
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Instructions */}
      <div style={{
        marginTop: '30px',
        padding: '20px',
        backgroundColor: '#fff8e1',
        borderRadius: '8px',
        border: '1px solid #ffe082'
      }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#ff8f00' }}>How it works</h4>
        <ol style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '14px', color: '#666' }}>
          <li>Upload the contractor's rate sheet — any format (CSV, Excel, PDF, or a photo of the document)</li>
          <li>AI reads the file and extracts every classification/equipment type with its rates</li>
          <li>Review the extracted data in the preview table — edit, add, or delete rows as needed</li>
          <li>Set the effective date and click Import</li>
        </ol>
        <p style={{ fontSize: '13px', color: '#888', marginTop: '12px', marginBottom: 0 }}>
          AI auto-calculates overtime (1.5x) and double time (2x) if only straight time is provided.
          Daily equipment rates calculated as hourly x 8 if not shown.
          Every row is editable before import — you have final say on what goes in.
        </p>
      </div>
    </div>
  )
}
