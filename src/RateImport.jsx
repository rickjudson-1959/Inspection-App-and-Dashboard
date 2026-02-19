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
      const tableName = activeTab === 'labour' ? 'labour_rates' : 'equipment_rates'
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
      ? `You are extracting labour/personnel rate data from a contractor's rate sheet. The data below is from their file — column names and format will vary by contractor.

Extract every labour classification and its rates. Return ONLY a JSON array.
Each object must have: classification (string), rate_st (number — straight time hourly rate), rate_ot (number — overtime rate), rate_dt (number — double time rate).
If overtime is not shown, calculate as 1.5x straight time. If double time is not shown, calculate as 2x straight time.
If the rates appear to be daily rates (e.g., $700+), divide by 8 to get hourly.
Skip any header rows, subtotal rows, or blank rows. Only include actual worker classifications with rates.

Example: [{"classification": "Foreman", "rate_st": 95.00, "rate_ot": 142.50, "rate_dt": 190.00}]

Return ONLY the JSON array, no explanation.

DATA:
${textContent}`
      : `You are extracting equipment rate data from a contractor's rate sheet. The data below is from their file — column names and format will vary by contractor.

Extract every equipment type and its rates. Return ONLY a JSON array.
Each object must have: equipment_type (string), rate_hourly (number), rate_daily (number).
If daily rate is not shown, calculate as hourly * 8. If only daily is shown, calculate hourly as daily / 8.
Skip any header rows, subtotal rows, or blank rows. Only include actual equipment with rates.

Example: [{"equipment_type": "Excavator 200", "rate_hourly": 185.00, "rate_daily": 1480.00}]

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
      ? `Extract ALL labour/personnel rates from this rate sheet. Column names and format will vary by contractor.
Return ONLY a JSON array. Each object: classification (string), rate_st (number — straight time hourly), rate_ot (number — overtime, 1.5x if not shown), rate_dt (number — double time, 2x if not shown).
If rates appear to be daily ($700+), divide by 8 for hourly. Skip headers/subtotals/blanks.
Example: [{"classification": "Foreman", "rate_st": 95.00, "rate_ot": 142.50, "rate_dt": 190.00}]
Return ONLY the JSON array.`
      : `Extract ALL equipment rates from this rate sheet. Column names and format will vary by contractor.
Return ONLY a JSON array. Each object: equipment_type (string), rate_hourly (number), rate_daily (number — hourly*8 if not shown).
If only daily shown, hourly = daily/8. Skip headers/subtotals/blanks.
Example: [{"equipment_type": "Excavator 200", "rate_hourly": 185.00, "rate_daily": 1480.00}]
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

  // Universal file upload handler — routes to the right extraction method
  async function handleFileUpload(e) {
    const uploadedFile = e.target.files[0]
    if (!uploadedFile) return

    setFile(uploadedFile)
    setError('')
    setLoading(true)
    setLoadingMessage('AI is reading the rate sheet...')

    try {
      const ext = uploadedFile.name.split('.').pop().toLowerCase()

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
    if (['rate_st', 'rate_ot', 'rate_dt', 'rate_hourly', 'rate_daily'].includes(field)) {
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
      setPreviewData([...previewData, { classification: '', rate_st: 0, rate_ot: 0, rate_dt: 0, valid: true }])
    } else {
      setPreviewData([...previewData, { equipment_type: '', rate_hourly: 0, rate_daily: 0, valid: true }])
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
      const tableName = activeTab === 'labour' ? 'labour_rates' : 'equipment_rates'

      const records = previewData.map(row => {
        const record = {
          organization_id: organizationId,
          effective_date: effectiveDate
        }
        if (activeTab === 'labour') {
          record.classification = row.classification
          record.rate_st = row.rate_st || 0
          record.rate_ot = row.rate_ot || 0
          record.rate_dt = row.rate_dt || 0
        } else {
          record.equipment_type = row.equipment_type
          record.rate_hourly = row.rate_hourly || 0
          record.rate_daily = row.rate_daily || 0
        }
        return record
      })

      console.log('[RateImport] POSTing', records.length, 'records via /api/rates')

      const response = await fetch(`/api/rates?table=${tableName}&organization_id=${organizationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(records)
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(`Database error (${response.status}): ${errData.error || JSON.stringify(errData)}`)
      }

      const inserted = await response.json()
      console.log(`[RateImport] SUCCESS: Imported ${inserted.length} ${activeTab} rates`)

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
    if (!confirm(`Delete all ${activeTab} rates for ${organizationName}?`)) return
    try {
      const tableName = activeTab === 'labour' ? 'labour_rates' : 'equipment_rates'
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
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
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
      </div>

      {/* Existing Rates Display */}
      {existingRates.length > 0 && !importSuccess && previewData.length === 0 && (
        <div style={{ marginBottom: '24px', backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '16px', border: '1px solid #dee2e6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#003366' }}>
              Current {activeTab === 'labour' ? 'Labour' : 'Equipment'} Rates ({existingRates.length})
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
                  {activeTab === 'labour' ? (
                    <>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Classification</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>ST Rate</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>OT Rate</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>DT Rate</th>
                    </>
                  ) : (
                    <>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Equipment Type</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Hourly Rate</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Daily Rate</th>
                    </>
                  )}
                  <th style={{ padding: '8px', textAlign: 'right' }}>Effective</th>
                </tr>
              </thead>
              <tbody>
                {existingRates.map((r, idx) => (
                  <tr key={r.id || idx} style={{ borderBottom: '1px solid #dee2e6' }}>
                    {activeTab === 'labour' ? (
                      <>
                        <td style={{ padding: '6px 8px' }}>{r.classification}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_st?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_ot?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_dt?.toFixed(2)}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '6px 8px' }}>{r.equipment_type}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_hourly?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_daily?.toFixed(2)}</td>
                      </>
                    )}
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: '12px', color: '#666' }}>{r.effective_date}</td>
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
                {activeTab === 'labour' ? '\u{1F477}' : '\u{1F6DC}'}
              </div>
              <h3 style={{ margin: '0 0 8px 0', color: '#003366' }}>
                Upload {activeTab === 'labour' ? 'Labour' : 'Equipment'} Rate Sheet
              </h3>
              <p style={{ color: '#666', margin: '0 0 20px 0', fontSize: '14px' }}>
                Drop the contractor's file here — any format works. AI reads it automatically.
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
                  accept=".csv,.txt,.tsv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,.gif,.tiff,.bmp"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
              <p style={{ color: '#999', fontSize: '12px', marginTop: '16px' }}>
                Accepts: CSV, Excel (.xlsx/.xls), PDF, or images (PNG, JPG, etc.)
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
                      accept=".csv,.txt,.tsv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,.gif,.tiff,.bmp"
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
                      {activeTab === 'labour' ? (
                        <>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Classification</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>ST Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>OT Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>DT Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'center', width: '60px' }}></th>
                        </>
                      ) : (
                        <>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Equipment Type</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Hourly Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Daily Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'center', width: '60px' }}></th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                        {activeTab === 'labour' ? (
                          <>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="text"
                                value={row.classification || ''}
                                onChange={(e) => updateRow(idx, 'classification', e.target.value)}
                                style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                              />
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
                          </>
                        ) : (
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
                                value={row.rate_hourly || ''}
                                onChange={(e) => updateRow(idx, 'rate_hourly', e.target.value)}
                                style={{ width: '120px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={row.rate_daily || ''}
                                onChange={(e) => updateRow(idx, 'rate_daily', e.target.value)}
                                style={{ width: '120px', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'right' }}
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
                <div>
                  <label style={{ marginRight: '10px', fontWeight: '600' }}>Effective Date:</label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  />
                </div>
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
                    {loading ? 'Importing...' : `Import ${previewData.length} ${activeTab === 'labour' ? 'Labour' : 'Equipment'} Rates`}
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
