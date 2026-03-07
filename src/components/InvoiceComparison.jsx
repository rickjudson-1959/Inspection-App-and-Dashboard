import React, { useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext.jsx'

export default function InvoiceComparison({ invoice, onUpdate }) {
  const { userProfile } = useAuth()
  const [rejectionReason, setRejectionReason] = useState('')
  const [approveNotes, setApproveNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentRef, setPaymentRef] = useState('')

  const varianceAmt = parseFloat(invoice.variance_amount) || 0
  const variancePct = parseFloat(invoice.variance_percentage) || 0
  const isMatch = Math.abs(varianceAmt) < 1
  const reconTotal = parseFloat(invoice.reconciled_total) || 0
  const invSubtotal = parseFloat(invoice.invoice_subtotal) || 0

  async function handleApprove() {
    setSaving(true)
    const update = {
      status: 'approved',
      approved_by: userProfile?.id || null,
      approved_at: new Date().toISOString(),
      notes: approveNotes || null
    }
    await supabase.from('contractor_invoices').update(update).eq('id', invoice.id)
    onUpdate?.({ ...invoice, ...update })
    setSaving(false)
  }

  async function handleReject() {
    if (!rejectionReason.trim()) return
    setSaving(true)
    const update = { status: 'rejected', rejection_reason: rejectionReason }
    await supabase.from('contractor_invoices').update(update).eq('id', invoice.id)
    onUpdate?.({ ...invoice, ...update })
    setSaving(false)
  }

  async function handleMarkPaid() {
    if (!paymentRef.trim()) return
    setSaving(true)
    const update = { status: 'paid', payment_date: paymentDate || new Date().toISOString().split('T')[0], payment_reference: paymentRef }
    await supabase.from('contractor_invoices').update(update).eq('id', invoice.id)
    onUpdate?.({ ...invoice, ...update })
    setSaving(false)
  }

  const rows = [
    ['Labour Hours', invoice.reconciled_labour_cost ? '-' : '-', parseFloat(invoice.invoice_labour_hours) || 0],
    ['Labour Cost', parseFloat(invoice.reconciled_labour_cost) || 0, parseFloat(invoice.invoice_labour_cost) || 0],
    ['Equipment Hours', invoice.reconciled_equipment_cost ? '-' : '-', parseFloat(invoice.invoice_equipment_hours) || 0],
    ['Equipment Cost', parseFloat(invoice.reconciled_equipment_cost) || 0, parseFloat(invoice.invoice_equipment_cost) || 0],
    ['Subtotal', reconTotal, invSubtotal],
  ]

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0 }}>Invoice #{invoice.invoice_number}</h3>
          <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '13px' }}>
            {invoice.contractor_name} | {invoice.invoice_date || '-'} | {invoice.invoice_period_start} to {invoice.invoice_period_end}
          </p>
        </div>
        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: 'white',
          backgroundColor: invoice.status === 'approved' ? '#059669' : invoice.status === 'paid' ? '#2563eb' : invoice.status === 'rejected' ? '#dc2626' : isMatch ? '#059669' : '#d97706' }}>
          {invoice.status.toUpperCase()}
        </span>
      </div>

      {invoice.source_file_url && (
        <p style={{ fontSize: '12px', marginBottom: '12px' }}><a href={invoice.source_file_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>View Original PDF</a></p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
        <thead><tr style={{ borderBottom: '2px solid #e5e7eb' }}>
          <th style={{ textAlign: 'left', padding: '8px' }}></th>
          <th style={{ textAlign: 'right', padding: '8px' }}>Reconciled (Approved)</th>
          <th style={{ textAlign: 'right', padding: '8px' }}>Invoice Claims</th>
          <th style={{ textAlign: 'center', padding: '8px' }}>Match</th>
        </tr></thead>
        <tbody>
          {rows.map(([label, recon, inv]) => {
            const isNum = typeof recon === 'number' && typeof inv === 'number'
            const diff = isNum ? inv - recon : 0
            const match = !isNum || Math.abs(diff) < 1
            return (
              <tr key={label} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px', fontWeight: '500' }}>{label}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{typeof recon === 'number' ? `$${recon.toLocaleString()}` : recon}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{typeof inv === 'number' ? (label.includes('Hours') ? inv : `$${inv.toLocaleString()}`) : inv}</td>
                <td style={{ padding: '8px', textAlign: 'center' }}>
                  {match ? <span style={{ color: '#059669' }}>✅</span> : <span style={{ color: '#dc2626', fontWeight: '600' }}>⚠ {diff > 0 ? '+' : ''}${diff.toLocaleString()}</span>}
                </td>
              </tr>
            )
          })}
          <tr style={{ borderTop: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
            <td style={{ padding: '8px', fontWeight: '500' }}>Tax</td>
            <td style={{ padding: '8px', textAlign: 'right' }}>—</td>
            <td style={{ padding: '8px', textAlign: 'right' }}>${(parseFloat(invoice.invoice_tax) || 0).toLocaleString()}</td>
            <td style={{ padding: '8px' }}></td>
          </tr>
          <tr style={{ fontWeight: '700', backgroundColor: '#f9fafb' }}>
            <td style={{ padding: '8px' }}>TOTAL</td>
            <td style={{ padding: '8px', textAlign: 'right' }}>${reconTotal.toLocaleString()}</td>
            <td style={{ padding: '8px', textAlign: 'right' }}>${(parseFloat(invoice.invoice_total) || 0).toLocaleString()}</td>
            <td style={{ padding: '8px' }}></td>
          </tr>
        </tbody>
      </table>

      {/* Status bar */}
      <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
        backgroundColor: isMatch ? '#f0fdf4' : '#fffbeb',
        border: `1px solid ${isMatch ? '#bbf7d0' : '#fde68a'}` }}>
        <strong style={{ color: isMatch ? '#166534' : '#854d0e' }}>
          {isMatch ? 'MATCH ✅' : `VARIANCE ⚠ (${varianceAmt > 0 ? '+' : ''}$${varianceAmt.toLocaleString()} / ${variancePct > 0 ? '+' : ''}${variancePct}%)`}
        </strong>
        {!isMatch && (
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#6b7280' }}>
            The invoice claims ${Math.abs(varianceAmt).toLocaleString()} {varianceAmt > 0 ? 'more' : 'less'} than the approved reconciliation. This must be resolved before payment.
          </p>
        )}
      </div>

      {/* Actions based on status */}
      {invoice.status === 'parsed' || invoice.status === 'matched' ? (
        <div>
          {!isMatch && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Notes (required if approving with variance)</label>
              <textarea value={approveNotes} onChange={e => setApproveNotes(e.target.value)} rows={2} placeholder="e.g. Approved change order CO-047 accounts for difference"
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
          )}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Rejection Reason (required if rejecting)</label>
            <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={2} placeholder="Explain why the invoice is being returned..."
              style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={handleApprove} disabled={saving || (!isMatch && !approveNotes.trim())}
              style={{ padding: '8px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
              {isMatch ? 'Approve for Payment' : 'Approve Anyway'}
            </button>
            <button onClick={handleReject} disabled={saving || !rejectionReason.trim()}
              style={{ padding: '8px 20px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
              Reject — Return to Contractor
            </button>
          </div>
        </div>
      ) : invoice.status === 'approved' ? (
        <div>
          <h4 style={{ margin: '0 0 8px 0' }}>Mark as Paid</h4>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Payment Date</label>
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Payment Reference *</label>
              <input value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="e.g. CHQ-12345 or EFT-67890" style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <button onClick={handleMarkPaid} disabled={saving || !paymentRef.trim()}
              style={{ padding: '8px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
              Mark Paid
            </button>
          </div>
        </div>
      ) : invoice.status === 'rejected' ? (
        <div style={{ padding: '12px', backgroundColor: '#fef2f2', borderRadius: '4px' }}>
          <strong style={{ color: '#dc2626' }}>Rejected:</strong> {invoice.rejection_reason}
        </div>
      ) : invoice.status === 'paid' ? (
        <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '4px' }}>
          <strong style={{ color: '#059669' }}>Paid:</strong> {invoice.payment_reference} on {invoice.payment_date}
        </div>
      ) : null}
    </div>
  )
}
