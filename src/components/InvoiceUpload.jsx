import React, { useState, useRef } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { useAuth } from '../AuthContext.jsx'
import { pdfToImages } from '../utils/lemParser.js'

const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

const INVOICE_PARSE_PROMPT = `You are parsing a contractor invoice for a pipeline construction project.

Extract the following totals from this invoice:
- invoice_number: The invoice number/reference
- invoice_date: Invoice date (YYYY-MM-DD)
- contractor_name: Contractor/vendor name
- labour_hours: Total labour hours if shown (0 if not)
- equipment_hours: Total equipment hours if shown (0 if not)
- labour_cost: Total labour cost/amount
- equipment_cost: Total equipment cost/amount
- subtotal: Subtotal before tax
- tax: Tax amount (GST, HST, etc.)
- total: Grand total including tax

Return ONLY valid JSON (no other text):
{
  "invoice_number": "",
  "invoice_date": "YYYY-MM-DD",
  "contractor_name": "",
  "labour_hours": 0,
  "equipment_hours": 0,
  "labour_cost": 0,
  "equipment_cost": 0,
  "subtotal": 0,
  "tax": 0,
  "total": 0
}`

export default function InvoiceUpload({ approvedLems, onUploadComplete }) {
  const { userProfile } = useAuth()
  const { getOrgId } = useOrgQuery()
  const fileInputRef = useRef(null)

  const [selectedLemId, setSelectedLemId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [errors, setErrors] = useState([])
  const [parsed, setParsed] = useState(null)

  const selectedLem = approvedLems.find(l => l.id === selectedLemId)

  async function handleParse() {
    if (!file || !selectedLemId) return
    setUploading(true)
    setErrors([])
    setParsed(null)
    setProgress('Processing invoice...')

    try {
      const isPDF = file.type === 'application/pdf'
      let imageBlocks = []

      if (isPDF) {
        const pageImages = await pdfToImages(file, 5)
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
        imageBlocks = [{ type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } }]
      }

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
          max_tokens: 4000,
          messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: INVOICE_PARSE_PROMPT }] }]
        })
      })

      if (!response.ok) {
        const errText = await response.text()
        setErrors([`API error ${response.status}: ${errText.substring(0, 200)}`])
        setUploading(false)
        setProgress('')
        return
      }

      const data = await response.json()
      const content = data.content[0]?.text || ''
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        setErrors(['Could not extract invoice data.'])
        setUploading(false)
        setProgress('')
        return
      }

      const inv = JSON.parse(jsonMatch[0])
      if (inv.invoice_number && !invoiceNumber) setInvoiceNumber(inv.invoice_number)
      if (inv.invoice_date && !invoiceDate) setInvoiceDate(inv.invoice_date)
      setParsed(inv)
    } catch (err) {
      setErrors([err.message])
    }
    setProgress('')
    setUploading(false)
  }

  async function handleSave() {
    if (!parsed || !selectedLemId) return
    if (!invoiceNumber.trim()) { setErrors(['Invoice number is required.']); return }
    setUploading(true)

    try {
      const orgId = getOrgId()

      // Upload PDF to storage
      let sourceFileUrl = null
      if (file) {
        const filePath = `contractor-invoices/${orgId}/${Date.now()}-${file.name}`
        const { error: storageErr } = await supabase.storage.from('contractor-invoices').upload(filePath, file)
        if (!storageErr) {
          const { data: urlData } = supabase.storage.from('contractor-invoices').getPublicUrl(filePath)
          sourceFileUrl = urlData?.publicUrl || null
        }
      }

      // Calculate variance against reconciled LEM
      const reconTotal = parseFloat(selectedLem.total_claimed) || 0
      const reconLabour = parseFloat(selectedLem.total_labour_cost) || 0
      const reconEquip = parseFloat(selectedLem.total_equipment_cost) || 0
      const invSubtotal = parseFloat(parsed.subtotal) || 0
      const varianceAmt = invSubtotal - reconTotal
      const variancePct = reconTotal > 0 ? Math.round((varianceAmt / reconTotal) * 10000) / 100 : 0

      const { error } = await supabase.from('contractor_invoices').insert({
        organization_id: orgId,
        lem_id: selectedLemId,
        uploaded_by: userProfile?.id || null,
        contractor_name: selectedLem.contractor_name,
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate || null,
        invoice_period_start: selectedLem.lem_period_start,
        invoice_period_end: selectedLem.lem_period_end,
        source_filename: file.name,
        source_file_url: sourceFileUrl,
        invoice_labour_hours: parseFloat(parsed.labour_hours) || 0,
        invoice_equipment_hours: parseFloat(parsed.equipment_hours) || 0,
        invoice_labour_cost: parseFloat(parsed.labour_cost) || 0,
        invoice_equipment_cost: parseFloat(parsed.equipment_cost) || 0,
        invoice_subtotal: invSubtotal,
        invoice_tax: parseFloat(parsed.tax) || 0,
        invoice_total: parseFloat(parsed.total) || 0,
        reconciled_labour_cost: reconLabour,
        reconciled_equipment_cost: reconEquip,
        reconciled_total: reconTotal,
        variance_amount: varianceAmt,
        variance_percentage: variancePct,
        status: Math.abs(varianceAmt) < 1 ? 'matched' : 'parsed'
      })

      if (error) throw error
      alert(`Invoice ${invoiceNumber} saved.`)
      setFile(null)
      setParsed(null)
      setInvoiceNumber('')
      setInvoiceDate('')
      setSelectedLemId('')
      setErrors([])
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
      <h3 style={{ margin: '0 0 16px 0' }}>Upload Contractor Invoice</h3>

      {approvedLems.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '16px', fontWeight: '500', margin: '0 0 8px 0' }}>No approved reconciliations available</p>
          <p style={{ fontSize: '13px', margin: 0 }}>Complete LEM reconciliation and approve it before uploading invoices.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Linked LEM (Approved) *</label>
              <select value={selectedLemId} onChange={e => setSelectedLemId(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }}>
                <option value="">Select approved LEM...</option>
                {approvedLems.map(lem => (
                  <option key={lem.id} value={lem.id}>
                    {lem.contractor_name} — {lem.lem_number || lem.source_filename} ({lem.lem_period_start} to {lem.lem_period_end})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Invoice Number *</label>
              <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2026-0247" style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Invoice Date</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <input ref={fileInputRef} type="file" accept=".pdf,image/*" onChange={e => { setFile(e.target.files[0] || null); setParsed(null); setErrors([]) }} style={{ flex: 1 }} />
            <button onClick={handleParse} disabled={!file || !selectedLemId || uploading}
              style={{ padding: '8px 20px', backgroundColor: uploading ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: '500', whiteSpace: 'nowrap' }}>
              {uploading ? 'Processing...' : 'Parse Invoice'}
            </button>
          </div>

          {progress && <p style={{ color: '#2563eb', fontSize: '13px', margin: '8px 0' }}>{progress}</p>}
          {errors.length > 0 && (
            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '8px 12px', marginBottom: '12px' }}>
              {errors.map((e, i) => <p key={i} style={{ margin: '4px 0', fontSize: '13px', color: '#b91c1c' }}>{e}</p>)}
            </div>
          )}

          {parsed && selectedLem && (
            <div>
              <h4 style={{ margin: '16px 0 8px 0' }}>Invoice vs Approved Reconciliation</h4>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead><tr style={{ backgroundColor: '#1e3a5f' }}>
                    <th style={{ color: 'white', padding: '10px 12px', textAlign: 'left' }}></th>
                    <th style={{ color: 'white', padding: '10px 12px', textAlign: 'right' }}>Reconciled (Approved)</th>
                    <th style={{ color: 'white', padding: '10px 12px', textAlign: 'right' }}>Invoice Claims</th>
                    <th style={{ color: 'white', padding: '10px 12px', textAlign: 'center' }}>Match</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['Labour Cost', parseFloat(selectedLem.total_labour_cost) || 0, parseFloat(parsed.labour_cost) || 0],
                      ['Equipment Cost', parseFloat(selectedLem.total_equipment_cost) || 0, parseFloat(parsed.equipment_cost) || 0],
                      ['Subtotal', parseFloat(selectedLem.total_claimed) || 0, parseFloat(parsed.subtotal) || 0],
                    ].map(([label, recon, inv]) => {
                      const diff = inv - recon
                      const match = Math.abs(diff) < 1
                      return (
                        <tr key={label} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '10px 12px', fontWeight: '500' }}>{label}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>${recon.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>${inv.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {match ? <span style={{ color: '#059669' }}>✅</span> : <span style={{ color: '#dc2626', fontWeight: '600' }}>⚠ {diff > 0 ? '+' : ''}${diff.toLocaleString()}</span>}
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                      <td style={{ padding: '10px 12px', fontWeight: '500' }}>Tax</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>—</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>${(parseFloat(parsed.tax) || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}></td>
                    </tr>
                    <tr style={{ fontWeight: '700', backgroundColor: '#f9fafb' }}>
                      <td style={{ padding: '10px 12px' }}>TOTAL</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>${((parseFloat(selectedLem.total_claimed) || 0)).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>${(parseFloat(parsed.total) || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button onClick={() => { setParsed(null); setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  style={{ padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSave} disabled={uploading}
                  style={{ padding: '8px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>Save Invoice</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
