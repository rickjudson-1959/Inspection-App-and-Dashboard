import React, { useState, useRef } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { useAuth } from '../AuthContext.jsx'
import { parseLEMFile } from '../utils/lemParser.js'
import { normalizeTicketNumber } from '../utils/ticketNormalizer.js'

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
  const [preview, setPreview] = useState(null)
  const [ticketPages, setTicketPages] = useState([])

  async function handleParse() {
    if (!file) return
    setUploading(true)
    setErrors([])
    setPreview(null)
    setTicketPages([])

    try {
      const files = Array.isArray(file) ? file : [file]
      let allLineItems = []
      let allTicketPages = []
      let allErrors = []
      let firstDocInfo = null

      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        if (files.length > 1) setProgress(`Processing file ${i + 1} of ${files.length}: ${f.name}...`)
        const { lineItems, ticketPages: tp, documentInfo, errors: parseErrors } = await parseLEMFile(f, setProgress)
        allLineItems = allLineItems.concat(lineItems)
        allTicketPages = allTicketPages.concat(tp || [])
        allErrors = allErrors.concat(parseErrors.map(e => files.length > 1 ? `${f.name}: ${e}` : e))
        if (!firstDocInfo && documentInfo?.contractor_name) firstDocInfo = documentInfo
      }

      setErrors(allErrors)
      if (allLineItems.length > 0) {
        setPreview(allLineItems)
      } else if (allErrors.length === 0) {
        setErrors(['No line items extracted. The file(s) may not contain recognizable LEM data.'])
      }
      setTicketPages(allTicketPages)
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
    if (!preview || preview.length === 0) return
    if (!contractorName.trim()) {
      setErrors(['Contractor name is required before saving. Edit the field above.'])
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
        const { error: storageErr } = await supabase.storage
          .from('lem-uploads')
          .upload(filePath, f)
        if (!storageErr && !sourceFileUrl) {
          const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(filePath)
          sourceFileUrl = urlData?.publicUrl || null
        }
      }

      // Calculate totals
      const totalLabourHours = preview.reduce((s, i) => s + (i.total_labour_hours || 0), 0)
      const totalEquipHours = preview.reduce((s, i) => s + (i.total_equipment_hours || 0), 0)
      const totalLabourCost = preview.reduce((s, i) => s + (i.total_labour_cost || 0), 0)
      const totalEquipCost = preview.reduce((s, i) => s + (i.total_equipment_cost || 0), 0)

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
          total_labour_hours: totalLabourHours,
          total_equipment_hours: totalEquipHours,
          total_labour_cost: totalLabourCost,
          total_equipment_cost: totalEquipCost,
          total_claimed: totalLabourCost + totalEquipCost,
          status: 'parsed'
        })
        .select()
        .single()

      if (lemErr) throw lemErr

      // Upload ticket page images to storage and build URL map
      const ticketUrlMap = {} // normalized ticket# -> url
      if (ticketPages.length > 0) {
        setProgress(`Uploading ${ticketPages.length} ticket page images...`)
        for (const tp of ticketPages) {
          if (!tp.base64 || !tp.ticket_number) continue
          try {
            const bytes = atob(tp.base64)
            const arr = new Uint8Array(bytes.length)
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
            const blob = new Blob([arr], { type: 'image/jpeg' })
            const safeName = tp.ticket_number.replace(/[^a-zA-Z0-9-_]/g, '_')
            const path = `lem-uploads/${lemRecord.id}/tickets/${safeName}_p${tp.pageIndex + 1}.jpg`
            const { error: upErr } = await supabase.storage.from('lem-uploads').upload(path, blob, { contentType: 'image/jpeg' })
            if (!upErr) {
              const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(path)
              if (urlData?.publicUrl) {
                const norm = normalizeTicketNumber(tp.ticket_number)
                if (norm) ticketUrlMap[norm] = urlData.publicUrl
              }
            }
          } catch (e) {
            // Non-fatal
          }
        }
      }

      // Insert line items with contractor_ticket_url where available
      const lineItemRows = preview.map(item => {
        const norm = normalizeTicketNumber(item.ticket_number)
        return {
          lem_id: lemRecord.id,
          organization_id: orgId,
          ticket_number: item.ticket_number,
          work_date: item.work_date,
          crew_name: item.crew_name,
          foreman: item.foreman,
          activity_description: item.activity_description,
          labour_entries: item.labour_entries,
          total_labour_hours: item.total_labour_hours,
          total_labour_cost: item.total_labour_cost,
          equipment_entries: item.equipment_entries,
          total_equipment_hours: item.total_equipment_hours,
          total_equipment_cost: item.total_equipment_cost,
          line_total: item.line_total,
          match_status: 'unmatched',
          match_confidence: 'none',
          contractor_ticket_url: (norm && ticketUrlMap[norm]) || null
        }
      })

      const { error: itemErr } = await supabase.from('lem_line_items').insert(lineItemRows)
      if (itemErr) throw itemErr

      const ticketCount = Object.keys(ticketUrlMap).length
      const msg = ticketCount > 0
        ? `Saved LEM with ${preview.length} line items and ${ticketCount} ticket page images.`
        : `Saved LEM with ${preview.length} line items.`
      alert(msg)
      setFile(null)
      setPreview(null)
      setTicketPages([])
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
            setPreview(null); setTicketPages([]); setErrors([])
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

      {/* Progress bar for large files */}
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
            Extracted {preview.length} Line Items
            {ticketPages.length > 0 && <span style={{ color: '#059669', fontWeight: '400', fontSize: '13px' }}> + {ticketPages.length} ticket page images</span>}
          </h4>

          {/* Auto-filled document info — editable before save */}
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
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Ticket #</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Crew</th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Workers</th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Labour Hrs</th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Equip</th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Equip Hrs</th>
                  <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 8px', fontWeight: '500' }}>{item.ticket_number || '-'}</td>
                    <td style={{ padding: '6px 8px' }}>{item.work_date || '-'}</td>
                    <td style={{ padding: '6px 8px' }}>{item.crew_name || item.foreman || '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{item.labour_entries?.length || 0}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{item.total_labour_hours}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{item.equipment_entries?.length || 0}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{item.total_equipment_hours}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>${(item.line_total || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button onClick={() => { setPreview(null); setTicketPages([]); setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
              style={{ padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={uploading}
              style={{ padding: '8px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
              Save to Database
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
