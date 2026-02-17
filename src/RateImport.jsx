import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'

// You'll need to set this in your environment or config
const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY || ''
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''

// Column name aliases for flexible CSV parsing
const LABOUR_ALIASES = {
  classification: ['classification', 'class', 'position', 'title', 'role', 'description', 'labour_classification', 'labor_classification', 'job_title', 'job_class', 'trade', 'category'],
  rate_st: ['rate_st', 'st_rate', 'st', 'straight_time', 'straight', 'rate', 'hourly_rate', 'hourly', 'regular', 'reg_rate', 'regular_rate', 'base_rate'],
  rate_ot: ['rate_ot', 'ot_rate', 'ot', 'overtime', 'overtime_rate', 'ot_hourly'],
  rate_dt: ['rate_dt', 'dt_rate', 'dt', 'double_time', 'double', 'doubletime', 'dt_hourly']
}

const EQUIPMENT_ALIASES = {
  equipment_type: ['equipment_type', 'type', 'equipment', 'description', 'name', 'item', 'unit', 'category'],
  rate_hourly: ['rate_hourly', 'hourly_rate', 'hourly', 'rate', 'hr_rate', 'per_hour'],
  rate_daily: ['rate_daily', 'daily_rate', 'daily', 'day_rate', 'per_day']
}

function matchHeader(header, aliases) {
  const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  for (const [field, alts] of Object.entries(aliases)) {
    if (alts.includes(normalized)) return field
  }
  return null
}

export default function RateImport({ organizationId, organizationName, onComplete }) {
  const [activeTab, setActiveTab] = useState('labour')
  const [uploadMethod, setUploadMethod] = useState('csv') // 'csv' or 'ocr'
  const [file, setFile] = useState(null)
  const [previewData, setPreviewData] = useState([])
  const [loading, setLoading] = useState(false)
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
      const { data, error: fetchError } = await supabase
        .from(tableName)
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })

      if (fetchError) {
        console.error('Error loading rates:', fetchError)
        // Fallback to service role key
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?organization_id=eq.${organizationId}&order=created_at.desc`, {
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'apikey': SERVICE_ROLE_KEY
          }
        })
        if (resp.ok) {
          setExistingRates(await resp.json())
        }
      } else {
        setExistingRates(data || [])
      }
    } catch (err) {
      console.error('Error loading rates:', err)
    }
    setLoadingRates(false)
  }

  // Smart CSV Parsing — handles quoted fields, flexible headers, tabs/semicolons
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return { data: [], error: 'CSV must have a header row and at least one data row' }

    // Detect delimiter (comma, semicolon, or tab)
    const firstLine = lines[0]
    let delimiter = ','
    if (firstLine.includes('\t') && !firstLine.includes(',')) delimiter = '\t'
    else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';'

    // Parse a CSV line respecting quoted fields
    function parseLine(line) {
      const values = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === delimiter && !inQuotes) {
          values.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      values.push(current.trim())
      return values
    }

    const rawHeaders = parseLine(lines[0])
    const aliases = activeTab === 'labour' ? LABOUR_ALIASES : EQUIPMENT_ALIASES

    // Map CSV headers to our field names
    const headerMap = {}
    const unmapped = []
    rawHeaders.forEach((h, idx) => {
      const field = matchHeader(h, aliases)
      if (field) {
        headerMap[idx] = field
      } else {
        unmapped.push(h)
      }
    })

    // Check required fields
    const mappedFields = Object.values(headerMap)
    const nameField = activeTab === 'labour' ? 'classification' : 'equipment_type'
    const rateField = activeTab === 'labour' ? 'rate_st' : 'rate_hourly'

    if (!mappedFields.includes(nameField)) {
      return {
        data: [],
        error: `Could not find a "${nameField}" column. Found headers: ${rawHeaders.join(', ')}. Expected one of: ${aliases[nameField].join(', ')}`
      }
    }
    if (!mappedFields.includes(rateField)) {
      return {
        data: [],
        error: `Could not find a rate column. Found headers: ${rawHeaders.join(', ')}. Expected one of: ${aliases[rateField].join(', ')}`
      }
    }

    const data = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const values = parseLine(line)
      const row = {}

      Object.entries(headerMap).forEach(([idx, field]) => {
        const val = values[parseInt(idx)] || ''
        if (['rate_st', 'rate_ot', 'rate_dt', 'rate_hourly', 'rate_daily'].includes(field)) {
          row[field] = parseFloat(val.replace(/[$,]/g, '')) || 0
        } else {
          row[field] = val
        }
      })

      // Skip empty rows
      const name = row[nameField]
      if (!name) continue

      // Auto-calculate OT/DT if missing for labour
      if (activeTab === 'labour') {
        if (!row.rate_ot && row.rate_st) row.rate_ot = Math.round(row.rate_st * 1.5 * 100) / 100
        if (!row.rate_dt && row.rate_st) row.rate_dt = Math.round(row.rate_st * 2 * 100) / 100
      }
      // Auto-calculate daily if missing for equipment
      if (activeTab === 'equipment') {
        if (!row.rate_daily && row.rate_hourly) row.rate_daily = Math.round(row.rate_hourly * 8 * 100) / 100
      }

      row.valid = true
      data.push(row)
    }

    if (unmapped.length > 0) {
      console.log('Unmapped CSV columns (ignored):', unmapped)
    }

    return { data, error: null }
  }

  // Handle CSV file upload
  async function handleCSVUpload(e) {
    const uploadedFile = e.target.files[0]
    if (!uploadedFile) return

    setFile(uploadedFile)
    setError('')
    setLoading(true)

    try {
      const text = await uploadedFile.text()
      const result = parseCSV(text)

      if (result.error) {
        setError(result.error)
      } else if (result.data.length === 0) {
        setError('No valid data rows found in CSV. Make sure it has a header row and at least one data row.')
      } else {
        setPreviewData(result.data)
      }
    } catch (err) {
      setError('Error reading CSV file: ' + err.message)
    }

    setLoading(false)
  }

  // Handle PDF/Image upload for OCR
  async function handleOCRUpload(e) {
    const uploadedFile = e.target.files[0]
    if (!uploadedFile) return

    setFile(uploadedFile)
    setError('')
    setLoading(true)

    try {
      // Convert file to base64
      const base64 = await fileToBase64(uploadedFile)
      const mediaType = uploadedFile.type || 'image/png'

      // Call Claude API for OCR
      const extractedData = await extractRatesWithClaude(base64, mediaType, activeTab)

      if (extractedData.length === 0) {
        setError('Could not extract rate data from file. Please check the format.')
      } else {
        setPreviewData(extractedData)
      }
    } catch (err) {
      setError('Error processing file: ' + err.message)
    }

    setLoading(false)
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Call Claude API to extract rates from image/PDF
  async function extractRatesWithClaude(base64Data, mediaType, rateType) {
    const prompt = rateType === 'labour'
      ? `Extract labour/personnel rates from this rate sheet image.
         Return ONLY a JSON array with objects containing: classification, rate_st (straight time hourly rate), rate_ot (overtime rate, usually 1.5x), rate_dt (double time rate, usually 2x).
         If overtime/double time aren't shown, calculate them as 1.5x and 2x of straight time.
         Example format: [{"classification": "Foreman", "rate_st": 95.00, "rate_ot": 142.50, "rate_dt": 190.00}]
         Return ONLY the JSON array, no other text.`
      : `Extract equipment rates from this rate sheet image.
         Return ONLY a JSON array with objects containing: equipment_type, rate_hourly, rate_daily (if shown, otherwise calculate as hourly * 8).
         Example format: [{"equipment_type": "Excavator 200", "rate_hourly": 185.00, "rate_daily": 1480.00}]
         Return ONLY the JSON array, no other text.`

    // Determine the correct media type for Claude
    let claudeMediaType = mediaType
    if (mediaType === 'application/pdf') {
      claudeMediaType = 'application/pdf'
    } else if (mediaType.startsWith('image/')) {
      claudeMediaType = mediaType
    } else {
      claudeMediaType = 'image/png'
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
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
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Claude API error: ${response.status} - ${errText}`)
    }

    const result = await response.json()
    const content = result.content[0]?.text || ''

    // Parse the JSON response
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return data.map(row => ({ ...row, valid: true }))
      }
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, content)
    }

    return []
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

  // Import to Supabase — uses service role key to bypass RLS
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

      // Use service role key to bypass RLS
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'apikey': SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(records)
      })

      if (!response.ok) {
        const errBody = await response.text()
        throw new Error(`Database error: ${errBody}`)
      }

      const inserted = await response.json()
      console.log(`Imported ${inserted.length} ${activeTab} rates`)

      setImportSuccess(true)
      setPreviewData([])
      setFile(null)

      // Reload existing rates
      loadExistingRates()

      if (onComplete) onComplete(inserted.length)

    } catch (err) {
      setError('Import failed: ' + err.message)
    }

    setLoading(false)
  }

  // Delete all rates for this org
  async function clearRates() {
    if (!confirm(`Delete all ${activeTab} rates for ${organizationName}?`)) return
    try {
      const tableName = activeTab === 'labour' ? 'labour_rates' : 'equipment_rates'
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?organization_id=eq.${organizationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'apikey': SERVICE_ROLE_KEY
        }
      })
      if (response.ok) {
        setExistingRates([])
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
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: '#003366' }}>Import Rate Sheets</h2>
        <p style={{ color: '#666', marginTop: '8px' }}>
          Upload rate sheets via CSV or let AI extract rates from PDF/images
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

      {/* Upload Method Selection */}
      {!importSuccess && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginBottom: '24px'
          }}>
            {/* CSV Upload */}
            <div style={{
              border: uploadMethod === 'csv' ? '2px solid #003366' : '2px solid #ddd',
              borderRadius: '8px',
              padding: '20px',
              cursor: 'pointer',
              backgroundColor: uploadMethod === 'csv' ? '#f8fafc' : 'white'
            }} onClick={() => setUploadMethod('csv')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <input
                  type="radio"
                  checked={uploadMethod === 'csv'}
                  onChange={() => setUploadMethod('csv')}
                />
                <h3 style={{ margin: 0 }}>CSV Upload</h3>
              </div>
              <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
                Upload a CSV file with rate data. Download our template for the correct format.
              </p>
              {uploadMethod === 'csv' && (
                <div style={{ marginTop: '16px' }}>
                  <a
                    href={activeTab === 'labour' ? '/labour_rates_template.csv' : '/equipment_rates_template.csv'}
                    download
                    style={{ color: '#003366', fontSize: '14px' }}
                  >
                    Download {activeTab === 'labour' ? 'Labour' : 'Equipment'} Template
                  </a>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCSVUpload}
                    style={{ display: 'block', marginTop: '12px' }}
                  />
                </div>
              )}
            </div>

            {/* OCR Upload */}
            <div style={{
              border: uploadMethod === 'ocr' ? '2px solid #003366' : '2px solid #ddd',
              borderRadius: '8px',
              padding: '20px',
              cursor: 'pointer',
              backgroundColor: uploadMethod === 'ocr' ? '#f8fafc' : 'white'
            }} onClick={() => setUploadMethod('ocr')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <input
                  type="radio"
                  checked={uploadMethod === 'ocr'}
                  onChange={() => setUploadMethod('ocr')}
                />
                <h3 style={{ margin: 0 }}>AI Extract (PDF/Image)</h3>
              </div>
              <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
                Upload a rate sheet image or PDF and AI will extract the rates automatically.
              </p>
              {uploadMethod === 'ocr' && (
                <div style={{ marginTop: '16px' }}>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={handleOCRUpload}
                    style={{ display: 'block' }}
                  />
                  <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                    Accepts: PDF, PNG, JPG, JPEG, WebP
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>...</div>
              <p>{uploadMethod === 'ocr' ? 'AI is extracting rates...' : 'Processing CSV...'}</p>
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
                <h3 style={{ margin: 0 }}>Preview ({previewData.length} rows)</h3>
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
                          <th style={{ color: 'white', padding: '12px', textAlign: 'center', width: '60px' }}>Action</th>
                        </>
                      ) : (
                        <>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Equipment Type</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Hourly Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>Daily Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'center', width: '60px' }}>Action</th>
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
                alignItems: 'center'
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
        <h4 style={{ margin: '0 0 12px 0', color: '#ff8f00' }}>Instructions</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <strong>CSV Upload:</strong>
            <ol style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '14px', color: '#666' }}>
              <li>Download the template for correct format</li>
              <li>Fill in your rates (OT/DT auto-calculated if left blank)</li>
              <li>Save as CSV</li>
              <li>Upload, review the preview, then import</li>
            </ol>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              Accepts flexible column names: "Classification", "Position", "Rate", "Hourly Rate", "ST Rate", etc.
            </p>
          </div>
          <div>
            <strong>AI Extract:</strong>
            <ol style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '14px', color: '#666' }}>
              <li>Upload rate sheet PDF or photo</li>
              <li>AI extracts the rates</li>
              <li>Review and edit if needed</li>
              <li>Import to database</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
