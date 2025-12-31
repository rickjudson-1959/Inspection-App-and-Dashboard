import React, { useState } from 'react'
import { supabase } from './supabase'

// You'll need to set this in your environment or config
const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY || ''

export default function RateImport({ organizationId, organizationName, onComplete }) {
  const [activeTab, setActiveTab] = useState('labour')
  const [uploadMethod, setUploadMethod] = useState('csv') // 'csv' or 'ocr'
  const [file, setFile] = useState(null)
  const [previewData, setPreviewData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0])
  const [importSuccess, setImportSuccess] = useState(false)

  // CSV Parsing
  function parseCSV(text) {
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
    const data = []
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim())
      if (values.length === headers.length) {
        const row = {}
        headers.forEach((h, idx) => {
          // Convert numeric fields
          if (['rate_st', 'rate_ot', 'rate_dt', 'rate_hourly', 'rate_daily'].includes(h)) {
            row[h] = parseFloat(values[idx].replace(/[$,]/g, '')) || 0
          } else {
            row[h] = values[idx]
          }
        })
        row.valid = true
        data.push(row)
      }
    }
    return data
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
      const data = parseCSV(text)
      
      if (data.length === 0) {
        setError('No valid data found in CSV')
      } else {
        setPreviewData(data)
      }
    } catch (err) {
      setError('Error parsing CSV: ' + err.message)
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

  // Import to Supabase
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
      
      const records = previewData.map(row => ({
        organization_id: organizationId,
        effective_date: effectiveDate,
        ...row,
        valid: undefined // Remove the valid flag before insert
      }))

      // Remove the valid field
      records.forEach(r => delete r.valid)

      const { error: insertError } = await supabase
        .from(tableName)
        .insert(records)

      if (insertError) throw insertError

      setImportSuccess(true)
      setPreviewData([])
      setFile(null)
      
      if (onComplete) onComplete(records.length)
      
    } catch (err) {
      setError('Import failed: ' + err.message)
    }

    setLoading(false)
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
        <h2 style={{ margin: 0, color: '#003366' }}>📊 Import Rate Sheets</h2>
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
          👷 Labour Rates
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
          🚜 Equipment Rates
        </button>
      </div>

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
          ✅ Rates imported successfully!
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
                <h3 style={{ margin: 0 }}>📄 CSV Upload</h3>
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
                    📥 Download {activeTab === 'labour' ? 'Labour' : 'Equipment'} Template
                  </a>
                  <input
                    type="file"
                    accept=".csv"
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
                <h3 style={{ margin: 0 }}>🤖 AI Extract (PDF/Image)</h3>
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
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
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
              ❌ {error}
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
                            ✕
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
        <h4 style={{ margin: '0 0 12px 0', color: '#ff8f00' }}>📋 Instructions</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <strong>CSV Upload:</strong>
            <ol style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '14px', color: '#666' }}>
              <li>Download the template</li>
              <li>Fill in your rates</li>
              <li>Save as CSV</li>
              <li>Upload and review</li>
            </ol>
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
