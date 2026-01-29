import React, { useState } from 'react'
import { supabase } from './supabase'
import { ROLE_CONFIG, getLandingPage } from './ProtectedRoute.jsx'

// ============================================================================
// CHUNK 5: INVITE USER COMPONENT
// Add to AdminPortal - sends invitation emails with role assignment
// ============================================================================

const INVITABLE_ROLES = [
  { value: 'inspector', label: 'Field Inspector' },
  { value: 'ndt_auditor', label: 'NDT Auditor' },
  { value: 'asst_chief', label: 'Assistant Chief Inspector' },
  { value: 'chief', label: 'Chief Inspector' },
  { value: 'pm', label: 'Project Manager' },
  { value: 'cm', label: 'Construction Manager' },
  { value: 'exec', label: 'Executive' },
  { value: 'admin', label: 'Administrator' }
]

function InviteUser({ onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    user_role: 'inspector'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  
  const handleInvite = async () => {
    if (!formData.email || !formData.full_name) {
      setError('Email and name are required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const landingPage = getLandingPage(formData.user_role)

      console.log('📨 Sending invitation to:', formData.email)
      console.log('👤 Name:', formData.full_name, '| Role:', formData.user_role)

      // Always use edge function for invitations (uses Resend for email delivery)
      const { data: fnData, error: fnError } = await supabase.functions.invoke('invite-user', {
        body: { ...formData, redirect_to: landingPage }
      })

      console.log('📬 Edge function response:', fnData)

      if (fnError) {
        console.error('❌ Edge function error:', fnError)
        throw fnError
      }

      // Check if the response contains an error
      if (fnData?.error) {
        console.error('❌ Invitation error:', fnData.error)
        throw new Error(fnData.error)
      }

      // Log email send status for debugging
      if (fnData) {
        console.log('📧 Invite response:', {
          email_sent: fnData.email_sent,
          email_message_id: fnData.email_message_id,
          email_error: fnData.email_error,
          invitation_link: fnData.invitation_link ? 'Generated' : 'Not generated'
        })

        // Always show invitation link in console for easy copying
        if (fnData.invitation_link) {
          console.log('🔗 Invitation Link (copy this to send manually):')
          console.log(fnData.invitation_link)
        }

        // Check if email was sent successfully
        if (!fnData.email_sent) {
          const errorMsg = fnData.email_error || 'Email sending failed. The user account was created, but the invitation email was not sent.'
          console.error('❌ Email not sent:', fnData.email_error)

          // Show warning to user with invitation link
          if (fnData.invitation_link) {
            setError(`Warning: ${errorMsg} The invitation link is available in the browser console.`)
          } else {
            setError(`Warning: ${errorMsg}`)
          }

          // Still show partial success since user was created
          setSuccess(`User account created for ${formData.email}. Email not sent - copy link from console.`)
          setFormData({ email: '', full_name: '', user_role: 'inspector' })
          if (onSuccess) onSuccess()
          setLoading(false)
          return
        }
      }
      
      setSuccess(`Invitation sent to ${formData.email}!`)
      setFormData({ email: '', full_name: '', user_role: 'inspector' })
      if (onSuccess) onSuccess()
      
    } catch (err) {
      setError(err.message || 'Failed to send invitation')
    }
    
    setLoading(false)
  }
  
  return (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', maxWidth: '450px', width: '100%' }}>
      <div style={{ padding: '20px', backgroundColor: '#007bff', borderRadius: '8px 8px 0 0' }}>
        <h2 style={{ margin: 0, color: 'white', fontSize: '18px' }}>📧 Invite New User</h2>
      </div>
      
      <div style={{ padding: '25px' }}>
        {error && (
          <div style={{ padding: '10px', backgroundColor: '#f8d7da', borderRadius: '4px', color: '#721c24', marginBottom: '15px' }}>
            ⚠️ {error}
          </div>
        )}
        
        {success && (
          <div style={{ padding: '10px', backgroundColor: '#d4edda', borderRadius: '4px', color: '#155724', marginBottom: '15px' }}>
            ✅ {success}
          </div>
        )}
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Email *</label>
          <input
            type="email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
            placeholder="user@company.com"
          />
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Full Name *</label>
          <input
            type="text"
            value={formData.full_name}
            onChange={e => setFormData({ ...formData, full_name: e.target.value })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
            placeholder="John Smith"
          />
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Role *</label>
          <select
            value={formData.user_role}
            onChange={e => setFormData({ ...formData, user_role: e.target.value })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
          >
            {INVITABLE_ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#666' }}>
            Landing page: <code>{getLandingPage(formData.user_role)}</code>
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          {onCancel && (
            <button onClick={onCancel} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Cancel
            </button>
          )}
          <button onClick={handleInvite} disabled={loading} style={{ padding: '10px 20px', backgroundColor: loading ? '#6c757d' : '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            {loading ? 'Sending...' : '📧 Send Invite'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default InviteUser
