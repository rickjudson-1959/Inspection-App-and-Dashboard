import React, { useState, useRef } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { useAuth } from '../AuthContext.jsx'
import { parseLEMFile } from '../utils/lemParser.js'

export default function LEMUpload({ onUploadComplete }) {
  const { userProfile } = useAuth()
  const { getOrgId } = useOrgQuery()
  const fileInputRef = useRef(null)

  const [contractorName, setContractorName] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [lemNumber, setLemNumber] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [errors, setErrors] = useState([])
  const [preview, setPreview] = useState(null) // { pairs, documentInfo }

  async function handleParse() {
    if (!file) return
    setUploading(true)
    setErrors([])
    setPreview(null)

    try {
      const files = Array.isArray(file) ? file : [file]
      let allPairs = []
      let allErrors = []
      let firstDocInfo = null

      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        if (files.length > 1) setProgress(`Processing file ${i + 1} of ${files.length}: ${f.name}...`)
        // Parse without lemId — just classify and group, no upload yet
        const { pairs, documentInfo, errors: parseErrors } = await parseLEMFile(f, setProgress)
        allPairs = allPairs.concat(pairs)
        allErrors = allErrors.concat(parseErrors.map(e => files.length > 1 ? `${f.name}: ${e}` : e))
        if (!firstDocInfo && documentInfo?.contractor_name) firstDocInfo = documentInfo
      }

      setErrors(allErrors)
      if (allPairs.length > 0) {
        setPreview({ pairs: allPairs, documentInfo: firstDocInfo })
      } else if (allErrors.length === 0) {
        setErrors(['No LEM/ticket pairs found. The file(s) may not contain recognizable LEM data.'])
      }
      // Auto-fill fields from parsed document info
      if (firstDocInfo) {
        if (firstDocInfo.contractor_name && !contractorName.trim()) setContractorName(firstDocInfo.contractor_name)
        if (firstDocInfo.period_start && !periodStart) setPeriodStart(firstDocInfo.period_start)
        if (firstDocInfo.period_end && !periodEnd) setPeriodEnd(firstDocInfo.period_end)
        if (firstDocInfo.lem_number && !lemNumber.trim()) setLemNumber(firstDocInfo.lem_number)
      }
    } catch (err) {
      setErrors([`Parse failed: ${err.message}`])
    }
    setProgress('')
    setUploading(false)
  }

  async function handleSave() {
    if (!preview || preview.pairs.length === 0) return
    if (!contractorName.trim()) {
      setErrors(['Contractor name is required before saving.'])
      return
    }
    setUploading(true)

    try {
      const orgId = getOrgId()

      // Upload original PDF(s) to storage
      let sourceFileUrl = null
      const files = Array.isArray(file) ? file : file ? [file] : []
      const sourceFilename = files.map(f => f.name).join(', ')
      for (const f of files) {
        const filePath = `lem-uploads/${orgId}/${Date.now()}-${f.name}`
        const { error: storageErr } = await supabase.storage.from('lem-uploads').upload(filePath, f)
        if (!storageErr && !sourceFileUrl) {
          const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(filePath)
          sourceFileUrl = urlData?.publicUrl || null
        }
      }

      // Create parent LEM record
      const { data: lemRecord, error: lemErr } = await supabase
        .from('contractor_lem_uploads')
        .insert({
          organization_id: orgId,
          uploaded_by: userProfile?.id || null,
          contractor_name: contractorName.trim(),
          lem_period_start: periodStart || null,
          lem_period_end: periodEnd || null,
          lem_number: lemNumber.trim() || null,
          source_filename: sourceFilename,
          source_file_url: sourceFileUrl,
          total_claimed: 0,
          status: 'pending'
        })
        .select()
        .single()

      if (lemErr) throw lemErr

      // Re-parse with lemId to upload images and create pair records
      setProgress('Uploading page images and creating pairs...')
      let totalPairs = 0
      for (const f of files) {
        const { pairs, errors: uploadErrors } = await parseLEMFile(f, setProgress, lemRecord.id, orgId)
        totalPairs += pairs.length
        if (uploadErrors.length > 0) {
          setErrors(prev => [...prev, ...uploadErrors])
        }
      }

      // Update the LEM record status
      await supabase.from('contractor_lem_uploads')
        .update({ status: 'parsed', total_claimed: totalPairs })
        .eq('id', lemRecord.id)

      alert(`Saved: ${totalPairs} LEM/ticket pairs ready for visual reconciliation.`)
      setFile(null)
      setPreview(null)
      setContractorName('')
      setPeriodStart('')
      setPeriodEnd('')
      setLemNumber('')
      setErrors([])
      setProgress('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      onUploadComplete?.()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h3 style={{ margin: '0 0 16px 0' }}>Upload Contractor LEM</h3>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/*"
          multiple
          onChange={e => {
            const files = Array.from(e.target.files || [])
            setFile(files.length === 1 ? files[0] : files.length > 1 ? files : null)
            setPreview(null); setErrors([])
          }}
          style={{ flex: 1 }}
        />
        <button
          onClick={handleParse}
          disabled={!file || uploading}
          style={{ padding: '8px 20px', backgroundColor: uploading ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: '500', whiteSpace: 'nowrap' }}
        >
          {uploading ? 'Processing...' : Array.isArray(file) ? `Parse ${file.length} LEMs` : 'Parse LEM'}
        </button>
      </div>

      {uploading && (
        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '20px', height: '20px', border: '3px solid #2563eb', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div>
              <p style={{ margin: 0, fontWeight: '600', color: '#1e40af', fontSize: '14px' }}>{progress || 'Starting...'}</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>Large files may take several minutes. Do not close this tab.</p>
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '8px 12px', marginBottom: '12px' }}>
          {errors.map((e, i) => <p key={i} style={{ margin: '4px 0', fontSize: '13px', color: '#b91c1c' }}>{e}</p>)}
        </div>
      )}

      {preview && (
        <div>
          <h4 style={{ margin: '16px 0 8px 0' }}>
            {preview.pairs.length} LEM/Ticket Pairs Found
          </h4>

          {/* Document info — editable before save */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Contractor Name *</label>
              <input value={contractorName} onChange={e => setContractorName(e.target.value)} placeholder="Auto-filled from LEM" style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Period Start</label>
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Period End</label>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>LEM Reference #</label>
              <input value={lemNumber} onChange={e => setLemNumber(e.target.value)} placeholder="Auto-filled from LEM" style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Pair summary table */}
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Pair #</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Crew</th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>LEM Pages</th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Ticket Pages</th>
                </tr>
              </thead>
              <tbody>
                {preview.pairs.map((pair, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '500' }}>{idx + 1}</td>
                    <td style={{ padding: '6px 8px' }}>{pair.work_date || '-'}</td>
                    <td style={{ padding: '6px 8px' }}>{pair.crew_name || '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{pair.lem_pages || 0}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: (pair.ticket_pages || 0) === 0 ? '#dc2626' : 'inherit' }}>
                      {pair.ticket_pages || 0}{(pair.ticket_pages || 0) === 0 ? ' (missing)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button onClick={() => { setPreview(null); setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
              style={{ padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={uploading}
              style={{ padding: '8px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
              Save & Upload Images
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
