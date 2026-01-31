import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './AuthContext.jsx'
import { useOrgQuery } from './utils/queryHelpers.js'
import { useOrgPath } from './contexts/OrgContext.jsx'
import SignaturePad, { PinEntry } from './SignaturePad.jsx'
import { generateInvoicePDF, downloadInvoicePDF } from './InvoicePDF.jsx'

export default function TimesheetReview() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, userProfile } = useAuth()
  const { getOrgId } = useOrgQuery()
  const { orgPath } = useOrgPath()

  const timesheetId = searchParams.get('id')
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [timesheet, setTimesheet] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [inspectorProfile, setInspectorProfile] = useState(null)
  const [rateCard, setRateCard] = useState(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  
  // Signature states
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [showPinEntry, setShowPinEntry] = useState(false)
  const [existingSignature, setExistingSignature] = useState(null)
  const [signatures, setSignatures] = useState([]) // Applied signatures on this timesheet

  useEffect(() => {
    if (timesheetId) {
      loadTimesheet()
    } else {
      navigate(orgPath('/inspector-invoicing'))
    }
  }, [timesheetId])

  async function loadTimesheet() {
    setLoading(true)
    try {
      // Load timesheet
      const { data: ts, error } = await supabase
        .from('inspector_timesheets')
        .select('*')
        .eq('id', timesheetId)
        .single()
      
      if (error) throw error
      
      setTimesheet(ts)
      setAdminNotes(ts.admin_notes || '')
      
      // Load inspector profile
      const { data: profile } = await supabase
        .from('inspector_profiles')
        .select('*')
        .eq('id', ts.inspector_profile_id)
        .single()
      
      if (profile) setInspectorProfile(profile)
      
      // Load rate card
      if (ts.rate_card_id) {
        const { data: rc } = await supabase
          .from('inspector_rate_cards')
          .select('*')
          .eq('id', ts.rate_card_id)
          .single()
        if (rc) setRateCard(rc)
      } else {
        // Use default rates
        setRateCard({
          daily_field_rate: 900,
          per_diem_rate: 180,
          meal_allowance: 70,
          truck_rate: 160,
          km_rate: 1.10,
          km_threshold: 150,
          electronics_rate: 15
        })
      }
      
      // Load line items
      const { data: lines } = await supabase
        .from('inspector_timesheet_lines')
        .select('*')
        .eq('timesheet_id', timesheetId)
        .order('work_date')
      
      setLineItems(lines || [])
      
      // Load existing user signature
      const { data: sig } = await supabase
        .from('electronic_signatures')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      
      if (sig) setExistingSignature(sig)
      
      // Load signatures applied to this timesheet
      const { data: appliedSigs } = await supabase
        .from('signature_applications')
        .select('*')
        .eq('timesheet_id', timesheetId)
        .order('signed_at')
      
      setSignatures(appliedSigs || [])
      
    } catch (err) {
      console.error('Error loading timesheet:', err)
      alert('Error loading timesheet: ' + err.message)
    }
    setLoading(false)
  }

  function calculateInvoiceTotal() {
    if (!rateCard || !timesheet) return 0
    
    let total = 0
    total += (timesheet.total_field_days || 0) * (rateCard.daily_field_rate || 0)
    total += (timesheet.total_per_diem_days || 0) * (rateCard.per_diem_rate || 0)
    total += (timesheet.total_meals_only_days || 0) * (rateCard.meal_allowance || 0)
    total += (timesheet.total_truck_days || 0) * (rateCard.truck_rate || 0)
    total += (timesheet.total_excess_kms || 0) * (rateCard.km_rate || 0)
    total += (timesheet.total_electronics_days || 0) * (rateCard.electronics_rate || 0)
    
    return total
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-CA', { 
      style: 'currency', 
      currency: 'CAD',
      minimumFractionDigits: 2
    }).format(amount || 0)
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  function getStatusBadge(status) {
    const styles = {
      draft: { bg: '#f3f4f6', color: '#374151', label: '📝 Draft' },
      submitted: { bg: '#fef3c7', color: '#92400e', label: '📤 Submitted' },
      admin_review: { bg: '#dbeafe', color: '#1e40af', label: '👀 Admin Review' },
      chief_review: { bg: '#e0e7ff', color: '#3730a3', label: '✍️ Chief Review' },
      approved: { bg: '#d1fae5', color: '#065f46', label: '✅ Approved' },
      rejected: { bg: '#fee2e2', color: '#991b1b', label: '❌ Rejected' },
      paid: { bg: '#d1fae5', color: '#065f46', label: '💰 Paid' }
    }
    const s = styles[status] || styles.draft
    return (
      <span style={{
        padding: '4px 12px',
        borderRadius: '12px',
        backgroundColor: s.bg,
        color: s.color,
        fontSize: '13px',
        fontWeight: '600'
      }}>
        {s.label}
      </span>
    )
  }

  // Hash PIN for storage (simple hash - in production use bcrypt)
  function hashPin(pin) {
    let hash = 0
    for (let i = 0; i < pin.length; i++) {
      const char = pin.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return hash.toString(16)
  }

  async function handleSaveSignature(signatureData) {
    setSaving(true)
    try {
      const pinHash = hashPin(signatureData.pin)
      
      // Save or update signature
      if (existingSignature) {
        const { error } = await supabase
          .from('electronic_signatures')
          .update({
            signature_image: signatureData.signatureImage,
            pin_hash: pinHash,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSignature.id)
        
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('electronic_signatures')
          .insert({
            user_id: user.id,
            signer_name: signatureData.signerName,
            signer_title: signatureData.signerTitle,
            signature_image: signatureData.signatureImage,
            pin_hash: pinHash,
            organization_id: getOrgId()
          })
          .select()
          .single()
        
        if (error) throw error
        setExistingSignature(data)
      }
      
      setShowSignaturePad(false)
      // Now apply the signature
      setShowPinEntry(true)
      
    } catch (err) {
      console.error('Error saving signature:', err)
      alert('Error saving signature: ' + err.message)
    }
    setSaving(false)
  }

  async function handleVerifyAndSign(pin) {
    const pinHash = hashPin(pin)
    
    // Verify PIN
    if (!existingSignature || existingSignature.pin_hash !== pinHash) {
      return { success: false, error: 'Invalid PIN' }
    }
    
    setSaving(true)
    try {
      // Apply signature to timesheet
      const { error: sigError } = await supabase
        .from('signature_applications')
        .insert({
          timesheet_id: timesheetId,
          signature_id: existingSignature.id,
          user_id: user.id,
          signer_name: existingSignature.signer_name,
          signer_title: existingSignature.signer_title,
          signature_type: userProfile?.role === 'chief_inspector' ? 'chief_approval' : 'admin_review',
          signed_at: new Date().toISOString(),
          organization_id: getOrgId()
        })
      
      if (sigError) throw sigError
      
      // Update timesheet status
      let newStatus = timesheet.status
      let updateData = {
        admin_notes: adminNotes,
        updated_at: new Date().toISOString()
      }
      
      if (userProfile?.role === 'chief_inspector') {
        newStatus = 'approved'
        updateData.approved_at = new Date().toISOString()
        updateData.approved_by = user.id
      } else {
        newStatus = 'chief_review'
        updateData.reviewed_at = new Date().toISOString()
        updateData.reviewed_by = user.id
      }
      
      updateData.status = newStatus
      
      const { error: tsError } = await supabase
        .from('inspector_timesheets')
        .update(updateData)
        .eq('id', timesheetId)
      
      if (tsError) throw tsError
      
      setShowPinEntry(false)
      alert(newStatus === 'approved' ? 'Timesheet signed and approved!' : 'Timesheet signed and sent to Chief for approval!')
      navigate(orgPath('/inspector-invoicing'))
      
      return { success: true }
      
    } catch (err) {
      console.error('Error applying signature:', err)
      return { success: false, error: err.message }
    } finally {
      setSaving(false)
    }
  }

  function handleSignClick() {
    if (existingSignature) {
      setShowPinEntry(true)
    } else {
      setShowSignaturePad(true)
    }
  }

  async function handleResetSignature() {
    if (!confirm('Are you sure you want to reset your signature? You will need to draw a new signature and create a new PIN.')) {
      return
    }
    
    setSaving(true)
    try {
      // Delete existing signature
      const { error } = await supabase
        .from('electronic_signatures')
        .delete()
        .eq('user_id', user.id)
      
      if (error) throw error
      
      setExistingSignature(null)
      setShowPinEntry(false)
      setShowSignaturePad(true)
      
    } catch (err) {
      console.error('Error resetting signature:', err)
      alert('Error resetting signature: ' + err.message)
    }
    setSaving(false)
  }

  async function handleDownloadPDF() {
    try {
      const pdf = await generateInvoicePDF(timesheet, inspectorProfile, rateCard, lineItems, signatures)
      downloadInvoicePDF(pdf, timesheet, inspectorProfile)
    } catch (err) {
      console.error('Error generating PDF:', err)
      alert('Error generating PDF: ' + err.message)
    }
  }

  async function handleApprove() {
    const isChief = userProfile?.role === 'chief_inspector'
    const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin'
    
    setSaving(true)
    try {
      let newStatus = timesheet.status
      let updateData = {
        admin_notes: adminNotes,
        updated_at: new Date().toISOString()
      }
      
      // Determine next status based on current status and role
      if (timesheet.status === 'submitted' && isAdmin) {
        // Admin approves -> goes to chief review
        newStatus = 'chief_review'
        updateData.reviewed_at = new Date().toISOString()
        updateData.reviewed_by = user.id
      } else if (timesheet.status === 'submitted' && isChief) {
        // Chief can approve directly from submitted
        newStatus = 'approved'
        updateData.approved_at = new Date().toISOString()
        updateData.approved_by = user.id
      } else if (timesheet.status === 'chief_review' && isChief) {
        // Chief approves from chief_review
        newStatus = 'approved'
        updateData.approved_at = new Date().toISOString()
        updateData.approved_by = user.id
      } else if (timesheet.status === 'chief_review' && isAdmin) {
        // Admin can also final approve if needed
        newStatus = 'approved'
        updateData.approved_at = new Date().toISOString()
        updateData.approved_by = user.id
      }
      
      updateData.status = newStatus
      
      const { error } = await supabase
        .from('inspector_timesheets')
        .update(updateData)
        .eq('id', timesheetId)
      
      if (error) throw error
      
      alert(newStatus === 'approved' ? 'Timesheet approved!' : 'Timesheet sent to Chief for review!')
      navigate(orgPath('/inspector-invoicing'))
      
    } catch (err) {
      console.error('Error approving:', err)
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  async function handleReject() {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection')
      return
    }
    
    setSaving(true)
    try {
      const { error } = await supabase
        .from('inspector_timesheets')
        .update({
          status: 'rejected',
          admin_notes: `REJECTED: ${rejectionReason}\n\n${adminNotes}`,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', timesheetId)
      
      if (error) throw error
      
      alert('Timesheet rejected and sent back to inspector')
      setShowRejectModal(false)
      navigate(orgPath('/inspector-invoicing'))
      
    } catch (err) {
      console.error('Error rejecting:', err)
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  async function handleMarkPaid() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('inspector_timesheets')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          paid_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', timesheetId)
      
      if (error) throw error
      
      alert('Timesheet marked as paid!')
      navigate(orgPath('/inspector-invoicing'))
      
    } catch (err) {
      console.error('Error:', err)
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading timesheet...</p>
      </div>
    )
  }

  if (!timesheet) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Timesheet not found</p>
        <button onClick={() => navigate(orgPath('/inspector-invoicing'))}>Back to Dashboard</button>
      </div>
    )
  }

  const invoiceTotal = calculateInvoiceTotal()
  const isChief = userProfile?.role === 'chief_inspector'
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin'
  const canApprove = (timesheet.status === 'submitted' || timesheet.status === 'chief_review') && (isAdmin || isChief)
  const canMarkPaid = timesheet.status === 'approved' && isAdmin

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#003366', color: 'white', padding: '20px 40px' }}>
        <button 
          onClick={() => navigate(orgPath('/inspector-invoicing'))}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '14px', marginBottom: '8px', opacity: 0.8 }}
        >
          ← Back to Inspector Invoicing
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px' }}>📋 Review Timesheet</h1>
            <p style={{ margin: '8px 0 0 0', opacity: 0.8 }}>
              {inspectorProfile?.company_name} • {timesheet.period_start} to {timesheet.period_end}
            </p>
          </div>
          <div>
            {getStatusBadge(timesheet.status)}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Inspector</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>{inspectorProfile?.company_name}</div>
          </div>
          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Period</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>{timesheet.period_type}</div>
          </div>
          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Field Days</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e40af' }}>{timesheet.total_field_days}</div>
          </div>
          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Per Diem Days</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#059669' }}>{timesheet.total_per_diem_days}</div>
          </div>
          <div style={{ backgroundColor: '#ede9fe', padding: '16px', borderRadius: '8px', border: '2px solid #8b5cf6' }}>
            <div style={{ fontSize: '13px', color: '#5b21b6', marginBottom: '4px' }}>Invoice Total</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#5b21b6' }}>{formatCurrency(invoiceTotal * 1.05)}</div>
            <div style={{ fontSize: '11px', color: '#7c3aed' }}>incl. GST</div>
          </div>
        </div>

        {/* Project Info */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#111827', fontSize: '16px' }}>Project Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Project</div>
              <div style={{ fontWeight: '500' }}>{timesheet.project_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Client</div>
              <div style={{ fontWeight: '500' }}>{timesheet.client_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Spread</div>
              <div style={{ fontWeight: '500' }}>{timesheet.spread_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Submitted</div>
              <div style={{ fontWeight: '500' }}>{timesheet.submitted_at ? new Date(timesheet.submitted_at).toLocaleDateString() : '—'}</div>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#111827' }}>
            Timesheet Lines ({lineItems.length} days)
          </h3>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>Date</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>Work Description</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>Field</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>Per Diem</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>Truck</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>KMs</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>Excess</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>Electronics</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((line, index) => (
                  <tr 
                    key={index} 
                    style={{ 
                      backgroundColor: line.is_mobilization ? '#dbeafe' : line.is_demobilization ? '#fef3c7' : 'white',
                      borderBottom: '1px solid #e5e7eb'
                    }}
                  >
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontWeight: '500' }}>{formatDate(line.work_date)}</div>
                      {line.is_mobilization && <span style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: '600' }}>📦 MOB</span>}
                      {line.is_demobilization && <span style={{ fontSize: '11px', color: '#d97706', fontWeight: '600' }}>📦 DEMOB</span>}
                    </td>
                    <td style={{ padding: '10px 8px', color: '#374151' }}>{line.work_description || '—'}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>{line.is_field_day ? '✓' : ''}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>{line.is_per_diem ? '✓' : ''}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>{line.is_truck_day ? '✓' : ''}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{line.total_kms || 0}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace', color: line.excess_kms > 0 ? '#dc2626' : '#6b7280' }}>{line.excess_kms || 0}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>{line.is_electronics ? '✓' : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f3f4f6', fontWeight: '600' }}>
                  <td style={{ padding: '12px 8px' }}>TOTALS</td>
                  <td style={{ padding: '12px 8px' }}></td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{timesheet.total_field_days}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{timesheet.total_per_diem_days}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{timesheet.total_truck_days}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{timesheet.total_kms}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{timesheet.total_excess_kms}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{timesheet.total_electronics_days}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Invoice Summary */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#111827' }}>Invoice Summary</h3>
          
          <table style={{ width: '100%', maxWidth: '500px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '10px 0', color: '#6b7280' }}>Daily field rate ({timesheet.total_field_days} days × {formatCurrency(rateCard?.daily_field_rate || 0)})</td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency((timesheet.total_field_days || 0) * (rateCard?.daily_field_rate || 0))}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '10px 0', color: '#6b7280' }}>Per diem ({timesheet.total_per_diem_days} days × {formatCurrency(rateCard?.per_diem_rate || 0)})</td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency((timesheet.total_per_diem_days || 0) * (rateCard?.per_diem_rate || 0))}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '10px 0', color: '#6b7280' }}>4x4 Truck ({timesheet.total_truck_days} days × {formatCurrency(rateCard?.truck_rate || 0)})</td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency((timesheet.total_truck_days || 0) * (rateCard?.truck_rate || 0))}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '10px 0', color: '#6b7280' }}>Excess KMs ({timesheet.total_excess_kms} km × {formatCurrency(rateCard?.km_rate || 0)})</td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency((timesheet.total_excess_kms || 0) * (rateCard?.km_rate || 0))}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '10px 0', color: '#6b7280' }}>Electronics ({timesheet.total_electronics_days} days × {formatCurrency(rateCard?.electronics_rate || 0)})</td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency((timesheet.total_electronics_days || 0) * (rateCard?.electronics_rate || 0))}</td>
              </tr>
              <tr style={{ borderBottom: '2px solid #111827' }}>
                <td style={{ padding: '12px 0', fontWeight: '600', fontSize: '16px' }}>Subtotal</td>
                <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: '700', fontSize: '16px' }}>{formatCurrency(invoiceTotal)}</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 0', color: '#6b7280' }}>GST (5%)</td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency(invoiceTotal * 0.05)}</td>
              </tr>
              <tr style={{ backgroundColor: '#f0fdf4' }}>
                <td style={{ padding: '16px 8px', fontWeight: '700', fontSize: '18px', color: '#065f46' }}>INVOICE TOTAL</td>
                <td style={{ padding: '16px 8px', textAlign: 'right', fontWeight: '700', fontSize: '18px', color: '#065f46' }}>{formatCurrency(invoiceTotal * 1.05)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Admin Notes */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#111827' }}>Review Notes</h3>
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            placeholder="Add any notes about this timesheet review..."
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Signatures Section */}
        {signatures.length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#111827' }}>✍️ Signatures</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
              {signatures.map((sig, index) => (
                <div key={index} style={{ 
                  border: '1px solid #d1fae5', 
                  borderRadius: '8px', 
                  padding: '16px',
                  backgroundColor: '#f0fdf4',
                  minWidth: '200px'
                }}>
                  <div style={{ fontSize: '12px', color: '#059669', fontWeight: '600', marginBottom: '8px' }}>
                    {sig.signature_type === 'chief_approval' ? '✅ Chief Approval' : '👀 Admin Review'}
                  </div>
                  <div style={{ fontWeight: '600', color: '#111827' }}>{sig.signer_name}</div>
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>{sig.signer_title}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                    {new Date(sig.signed_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => navigate(orgPath('/inspector-invoicing'))}
            style={{
              padding: '12px 24px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '15px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            ← Back
          </button>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            {canApprove && (
              <>
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={saving}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '15px',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.5 : 1
                  }}
                >
                  ❌ Reject
                </button>
                <button
                  onClick={handleSignClick}
                  disabled={saving}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '15px',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.5 : 1
                  }}
                >
                  {saving ? 'Processing...' : '✍️ Sign & Approve'}
                </button>
              </>
            )}
            
            {canMarkPaid && (
              <button
                onClick={handleMarkPaid}
                disabled={saving}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.5 : 1
                }}
              >
                💰 Mark as Paid
              </button>
            )}
            
            {timesheet.status === 'paid' && (
              <span style={{ padding: '12px 24px', color: '#059669', fontWeight: '600' }}>
                ✅ This timesheet has been paid
              </span>
            )}
            
            {(timesheet.status === 'approved' || timesheet.status === 'paid') && (
              <button
                onClick={handleDownloadPDF}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                📄 Download PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#dc2626' }}>❌ Reject Timesheet</h3>
            <p style={{ color: '#6b7280', marginBottom: '16px' }}>
              Please provide a reason for rejecting this timesheet. The inspector will be notified.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason for rejection..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                resize: 'vertical',
                marginBottom: '20px',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRejectModal(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={saving || !rejectionReason.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (saving || !rejectionReason.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (saving || !rejectionReason.trim()) ? 0.5 : 1
                }}
              >
                {saving ? 'Rejecting...' : 'Reject Timesheet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <SignaturePad
          onSave={handleSaveSignature}
          onCancel={() => setShowSignaturePad(false)}
          signerName={userProfile?.full_name || user?.email}
          signerTitle={userProfile?.role === 'chief_inspector' ? 'Chief Inspector' : 'Administrator'}
        />
      )}

      {/* PIN Entry Modal */}
      {showPinEntry && (
        <PinEntry
          onVerify={handleVerifyAndSign}
          onCancel={() => setShowPinEntry(false)}
          onReset={handleResetSignature}
          signerName={existingSignature?.signer_name || userProfile?.full_name}
        />
      )}
    </div>
  )
}
