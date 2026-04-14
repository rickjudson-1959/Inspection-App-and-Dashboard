import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [invitation, setInvitation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('No invitation token provided.')
      setLoading(false)
      return
    }
    verifyToken()
  }, [token])

  async function verifyToken() {
    try {
      // Hash the token client-side to look it up
      const encoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token))
      const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

      const { data, error: lookupError } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('token_hash', tokenHash)
        .is('accepted_at', null)
        .single()

      if (lookupError || !data) {
        setError('This invitation link is invalid or has already been used.')
        setLoading(false)
        return
      }

      if (new Date(data.expires_at) < new Date()) {
        setError('This invitation has expired. Please ask your administrator to send a new one.')
        setLoading(false)
        return
      }

      setInvitation(data)
    } catch (err) {
      setError('Failed to verify invitation. Please try again.')
    }
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('accept-invitation', {
        body: { token, password }
      })

      if (fnError) throw fnError
      if (data?.error) throw new Error(data.error)

      // If we got a session back, set it
      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        })
      }

      setSuccess(true)

      // Redirect after a moment
      setTimeout(() => {
        if (data?.session) {
          navigate(data.redirect_to || '/')
        } else {
          navigate('/login')
        }
      }, 2000)

    } catch (err) {
      setError(err.message || 'Failed to activate account. Please try again.')
    }
    setSubmitting(false)
  }

  const containerStyle = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f4f8',
    fontFamily: 'Arial, sans-serif',
  }

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
    padding: '40px',
    maxWidth: '440px',
    width: '100%',
    margin: '20px',
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', color: '#6b7280' }}>
            <p style={{ fontSize: '16px' }}>Verifying invitation...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>!</div>
            <h2 style={{ color: '#dc2626', marginBottom: '12px' }}>Invitation Problem</h2>
            <p style={{ color: '#6b7280', marginBottom: '24px' }}>{error}</p>
            <button
              onClick={() => navigate('/login')}
              style={{ padding: '10px 24px', backgroundColor: '#1e3a5f', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', color: '#059669' }}>&#10003;</div>
            <h2 style={{ color: '#059669', marginBottom: '12px' }}>Account Activated</h2>
            <p style={{ color: '#6b7280' }}>Redirecting you now...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ color: '#1e3a5f', fontSize: '24px', marginBottom: '8px' }}>Welcome to Pipe-Up</h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            Hello <strong>{invitation?.full_name}</strong>, set your password to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              Email
            </label>
            <input
              type="email"
              value={invitation?.email || ''}
              disabled
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', backgroundColor: '#f9fafb', color: '#6b7280', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              minLength={8}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%', padding: '12px', backgroundColor: submitting ? '#9ca3af' : '#059669',
              color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '600',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Activating...' : 'Set Password & Activate Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <p style={{ fontSize: '12px', color: '#9ca3af' }}>
            Invitation expires: {invitation?.expires_at ? new Date(invitation.expires_at).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}
