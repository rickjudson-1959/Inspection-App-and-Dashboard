import React, { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { useOrgQuery } from '../../utils/queryHelpers.js'
import { useAuth } from '../../AuthContext.jsx'
import { extractLEMLineItems } from '../../utils/lemParser.js'

const DOC_TYPE_OPTIONS = [
  { value: 'contractor_lem', label: 'Contractor LEM' },
  { value: 'contractor_ticket', label: 'Contractor Daily Ticket' }
]

const ACCEPTED_FILE_TYPES = '.pdf,.png,.jpg,.jpeg,.tiff'
const TICKET_PATTERN = /^[a-zA-Z0-9-]+$/

export default function ReconciliationUpload({ onUploadComplete, prefillTicket, prefillDocType }) {
  const { user } = useAuth()
  const { getOrgId, addOrgFilter } = useOrgQuery()
  const fileInputRef = useRef(null)
  const dropZoneRef = useRef(null)

  // Form state
  const [ticketNumber, setTicketNumber] = useState(prefillTicket || '')
  const [docType, setDocType] = useState(prefillDocType || 'contractor_lem')
  const [date, setDate] = useState('')
  const [foreman, setForeman] = useState('')
  const [files, setFiles] = useState([])

  // UI state
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // Sync prefill props when they change
  useEffect(() => {
    if (prefillTicket) setTicketNumber(prefillTicket)
  }, [prefillTicket])

  useEffect(() => {
    if (prefillDocType) setDocType(prefillDocType)
  }, [prefillDocType])

  function validateTicketNumber(value) {
    const trimmed = value.trim()
    if (!trimmed) return 'Ticket number is required'
    if (!TICKET_PATTERN.test(trimmed)) return 'Ticket number must be alphanumeric (dashes allowed)'
    return null
  }

  function handleFileSelect(selectedFiles) {
    const fileList = Array.from(selectedFiles)
    const valid = fileList.filter(f => {
      const ext = f.name.toLowerCase().split('.').pop()
      return ['pdf', 'png', 'jpg', 'jpeg', 'tiff'].includes(ext)
    })
    if (valid.length < fileList.length) {
      setError('Some files were skipped — only PDF, PNG, JPG, JPEG, and TIFF are accepted.')
    } else {
      setError('')
    }
    setFiles(valid)
    setSuccess('')
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  function handleDragLeave(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (e.dataTransfer.files?.length) {
      handleFileSelect(e.dataTransfer.files)
    }
  }

  function getDocTypeLabel(value) {
    return DOC_TYPE_OPTIONS.find(o => o.value === value)?.label || value
  }

  async function handleUpload() {
    setError('')
    setSuccess('')

    // Validate ticket number
    const ticketTrimmed = ticketNumber.trim()
    const ticketError = validateTicketNumber(ticketTrimmed)
    if (ticketError) {
      setError(ticketError)
      return
    }

    if (files.length === 0) {
      setError('Please select at least one file to upload.')
      return
    }

    const orgId = getOrgId()
    if (!orgId) {
      setError('Organization context not available. Please refresh and try again.')
      return
    }

    setUploading(true)
    setProgress('Checking for duplicates...')

    try {
      // Check for existing duplicate
      let dupeQuery = supabase
        .from('reconciliation_documents')
        .select('id, file_urls')
        .eq('ticket_number', ticketTrimmed)
        .eq('doc_type', docType)
      dupeQuery = addOrgFilter(dupeQuery, true)
      const { data: existing, error: dupeErr } = await dupeQuery

      if (dupeErr) throw dupeErr

      if (existing && existing.length > 0) {
        const confirmReplace = window.confirm(
          `A ${getDocTypeLabel(docType)} already exists for ticket ${ticketTrimmed}. Replace it?`
        )
        if (!confirmReplace) {
          setUploading(false)
          setProgress('')
          return
        }

        // Delete old storage files and DB record
        setProgress('Removing previous upload...')
        for (const record of existing) {
          if (record.file_urls && record.file_urls.length > 0) {
            // Extract storage paths from URLs
            const storagePaths = record.file_urls
              .map(url => {
                const match = url.match(/reconciliation-docs\/(.+)$/)
                return match ? match[1] : null
              })
              .filter(Boolean)

            if (storagePaths.length > 0) {
              await supabase.storage.from('reconciliation-docs').remove(storagePaths)
            }
          }

          await supabase.from('reconciliation_documents').delete().eq('id', record.id)
        }
      }

      // Upload files to storage
      const fileUrls = []
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        setProgress(`Uploading file ${i + 1} of ${files.length}: ${f.name}...`)

        const storagePath = `${orgId}/${ticketTrimmed}/${docType}/${f.name}`

        const { error: uploadErr } = await supabase.storage
          .from('reconciliation-docs')
          .upload(storagePath, f, { upsert: true })

        if (uploadErr) throw uploadErr

        const { data: urlData } = supabase.storage
          .from('reconciliation-docs')
          .getPublicUrl(storagePath)

        if (urlData?.publicUrl) {
          fileUrls.push(urlData.publicUrl)
        }
      }

      if (fileUrls.length === 0) {
        throw new Error('No files were uploaded successfully.')
      }

      // Determine page count
      const isPdf = files.length === 1 && files[0].name.toLowerCase().endsWith('.pdf')
      const pageCount = isPdf ? 1 : files.length

      // Insert reconciliation_documents record
      setProgress('Saving document record...')
      const { error: insertErr } = await supabase
        .from('reconciliation_documents')
        .insert({
          organization_id: orgId,
          ticket_number: ticketTrimmed,
          doc_type: docType,
          file_urls: fileUrls,
          page_count: pageCount,
          status: 'ready',
          date: date || null,
          foreman: foreman.trim() || null,
          uploaded_by: user?.id || null
        })

      if (insertErr) throw insertErr

      // If this is a contractor LEM, OCR extract structured data for variance comparison
      if (docType === 'contractor_lem' && fileUrls.length > 0) {
        setProgress('Extracting billing data from LEM (this may take 30-60s)...')
        try {
          // OCR each uploaded page
          const allLabour = []
          const allEquipment = []
          let totalLabourCost = 0
          let totalEquipCost = 0

          for (const url of fileUrls) {
            const extracted = await extractLEMLineItems(url)
            if (extracted.labour) {
              for (const l of extracted.labour) {
                allLabour.push({
                  name: l.employee_name || '',
                  type: l.classification || '',
                  employee_id: '',
                  rt_hours: l.rt_hours || 0,
                  ot_hours: l.ot_hours || 0,
                  dt_hours: 0,
                  rt_rate: l.rt_rate || 0,
                  ot_rate: l.ot_rate || 0,
                  dt_rate: 0,
                  sub: 0,
                  total: l.line_total || 0
                })
                totalLabourCost += l.line_total || 0
              }
            }
            if (extracted.equipment) {
              for (const e of extracted.equipment) {
                allEquipment.push({
                  type: e.equipment_type || '',
                  equipment_id: e.unit_number || '',
                  hours: e.hours || 0,
                  rate: e.rate || 0,
                  total: e.line_total || 0
                })
                totalEquipCost += e.line_total || 0
              }
            }
          }

          // Upsert contractor_lems record with structured data
          if (allLabour.length > 0 || allEquipment.length > 0) {
            const { error: lemErr } = await supabase
              .from('contractor_lems')
              .upsert({
                organization_id: orgId,
                field_log_id: ticketTrimmed,
                foreman: foreman.trim() || null,
                date: date || null,
                labour_entries: allLabour,
                equipment_entries: allEquipment,
                total_labour_cost: totalLabourCost,
                total_equipment_cost: totalEquipCost,
              }, { onConflict: 'organization_id,field_log_id' })

            if (lemErr) {
              console.error('[LEM OCR] Failed to save structured data:', lemErr)
              // Non-blocking — the upload still succeeded
            } else {
              console.log(`[LEM OCR] Saved: ${allLabour.length} labour, ${allEquipment.length} equipment for ticket ${ticketTrimmed}`)
            }
          }
        } catch (ocrErr) {
          console.error('[LEM OCR] Extraction failed:', ocrErr)
          // Non-blocking — the upload still succeeded
        }
      }

      // Success
      setSuccess(`Successfully uploaded ${files.length} file${files.length > 1 ? 's' : ''} for ticket ${ticketTrimmed}.`)
      setProgress('')
      setFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''

      onUploadComplete?.()
    } catch (err) {
      console.error('[ReconciliationUpload] Upload failed:', err)
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      setProgress('')
    }
  }

  const canSubmit = ticketNumber.trim().length > 0 && files.length > 0 && !uploading

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600', color: '#111827' }}>
        Upload Document for Reconciliation
      </h3>

      {/* Ticket Number */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block', fontSize: '13px', fontWeight: '600',
          color: '#374151', marginBottom: '4px'
        }}>
          Ticket Number <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          type="text"
          value={ticketNumber}
          onChange={e => { setTicketNumber(e.target.value); setError('') }}
          placeholder="e.g. DT-2026-0042"
          disabled={uploading}
          style={{
            width: '100%', padding: '8px 12px',
            border: '1px solid #d1d5db', borderRadius: '6px',
            fontSize: '14px', backgroundColor: uploading ? '#f9fafb' : 'white',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Doc Type */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block', fontSize: '13px', fontWeight: '600',
          color: '#374151', marginBottom: '4px'
        }}>
          Document Type
        </label>
        <select
          value={docType}
          onChange={e => setDocType(e.target.value)}
          disabled={uploading}
          style={{
            width: '100%', padding: '8px 12px',
            border: '1px solid #d1d5db', borderRadius: '6px',
            fontSize: '14px', backgroundColor: uploading ? '#f9fafb' : 'white',
            boxSizing: 'border-box'
          }}
        >
          {DOC_TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Date (optional) */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block', fontSize: '13px', fontWeight: '600',
          color: '#374151', marginBottom: '4px'
        }}>
          Date <span style={{ color: '#9ca3af', fontWeight: '400' }}>(optional)</span>
        </label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          disabled={uploading}
          style={{
            width: '100%', padding: '8px 12px',
            border: '1px solid #d1d5db', borderRadius: '6px',
            fontSize: '14px', backgroundColor: uploading ? '#f9fafb' : 'white',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Foreman (optional) */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block', fontSize: '13px', fontWeight: '600',
          color: '#374151', marginBottom: '4px'
        }}>
          Foreman <span style={{ color: '#9ca3af', fontWeight: '400' }}>(optional)</span>
        </label>
        <input
          type="text"
          value={foreman}
          onChange={e => setForeman(e.target.value)}
          placeholder="Foreman name"
          disabled={uploading}
          style={{
            width: '100%', padding: '8px 12px',
            border: '1px solid #d1d5db', borderRadius: '6px',
            fontSize: '14px', backgroundColor: uploading ? '#f9fafb' : 'white',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Drag & Drop Zone */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block', fontSize: '13px', fontWeight: '600',
          color: '#374151', marginBottom: '4px'
        }}>
          Files <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <div
          ref={dropZoneRef}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? '#2563eb' : '#d1d5db'}`,
            borderRadius: '8px',
            padding: '32px 16px',
            textAlign: 'center',
            cursor: uploading ? 'default' : 'pointer',
            backgroundColor: dragOver ? '#eff6ff' : '#f9fafb',
            transition: 'border-color 0.2s, background-color 0.2s'
          }}
        >
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
            {dragOver
              ? 'Drop files here'
              : 'Drag & drop files here, or click to browse'}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
            PDF, PNG, JPG, JPEG, TIFF — multiple files allowed
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            multiple
            onChange={e => handleFileSelect(e.target.files)}
            style={{ display: 'none' }}
          />
        </div>

        {/* Selected files list */}
        {files.length > 0 && (
          <div style={{
            marginTop: '8px', padding: '8px 12px',
            backgroundColor: '#f0fdf4', borderRadius: '6px',
            border: '1px solid #bbf7d0', fontSize: '13px', color: '#166534'
          }}>
            <strong>{files.length} file{files.length > 1 ? 's' : ''} selected:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px' }}>
              {files.map((f, i) => (
                <li key={i} style={{ marginBottom: '2px' }}>{f.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: '16px',
          backgroundColor: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '6px', color: '#991b1b', fontSize: '13px'
        }}>
          {error}
        </div>
      )}

      {/* Success display */}
      {success && (
        <div style={{
          padding: '10px 14px', marginBottom: '16px',
          backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
          borderRadius: '6px', color: '#166534', fontSize: '13px'
        }}>
          {success}
        </div>
      )}

      {/* Progress indicator */}
      {uploading && progress && (
        <div style={{
          padding: '10px 14px', marginBottom: '16px',
          backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: '6px', color: '#1e40af', fontSize: '13px',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <div style={{
            width: '16px', height: '16px',
            border: '2px solid #bfdbfe', borderTopColor: '#2563eb',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          {progress}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={!canSubmit}
        style={{
          width: '100%', padding: '10px 16px',
          backgroundColor: canSubmit ? '#16a34a' : '#d1d5db',
          color: canSubmit ? 'white' : '#9ca3af',
          border: 'none', borderRadius: '6px',
          fontSize: '14px', fontWeight: '600',
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          transition: 'background-color 0.2s'
        }}
      >
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
    </div>
  )
}
