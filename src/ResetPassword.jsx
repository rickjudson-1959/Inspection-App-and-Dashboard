import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'

function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Check if we have a valid session from the reset link
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setSessionReady(true)
      } else {
        setError('Invalid or expired reset link. Please request a new password reset.')
      }
    }
    
    // Give Supabase a moment to process the token from the URL
    setTimeout(checkSession, 500)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) throw error

      setSuccess(true)
      
      // Sign out after password change
      await supabase.auth.signOut()
      
    } catch (err) {
      setError(err.message)
    }
    
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 50%, #1E3A5F 100%)',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        width: '100%',
        maxWidth: '420px',
        margin: '20px'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <img 
            src="/logo.png" 
            alt="Pipe-Up Logo" 
            style={{ 
              width: '240px', 
              height: 'auto',
              marginBottom: '10px'
            }} 
          />
          <p style={{ 
            margin: 0, 
            color: '#666', 
            fontSize: '18px',
            letterSpacing: '0.5px'
          }}>
            Set New Password
          </p>
        </div>

        {success ? (
          <div>
            <div style={{
              padding: '20px',
              backgroundColor: '#d4edda',
              color: '#155724',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '16px',
              border: '1px solid #c3e6cb',
              textAlign: 'center'
            }}>
              ✅ Password updated successfully!
            </div>
            <a 
              href="/"
              style={{
                display: 'block',
                width: '100%',
                padding: '16px',
                backgroundColor: '#D35F28',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                textAlign: 'center',
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(211, 95, 40, 0.3)'
              }}
            >
              Go to Login
            </a>
          </div>
        ) : !sessionReady && !error ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ color: '#666' }}>Verifying reset link...</p>
          </div>
        ) : error && !sessionReady ? (
          <div>
            <div style={{
              padding: '20px',
              backgroundColor: '#fff5f5',
              color: '#c53030',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '16px',
              border: '1px solid #feb2b2',
              textAlign: 'center'
            }}>
              {error}
            </div>
            <a 
              href="/"
              style={{
                display: 'block',
                width: '100%',
                padding: '16px',
                backgroundColor: '#D35F28',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                textAlign: 'center',
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(211, 95, 40, 0.3)'
              }}
            >
              Back to Login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                fontSize: '18px',
                color: '#3D3D3D'
              }}>
                New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{
                    width: '100%',
                    padding: '14px',
                    paddingRight: '50px',
                    border: '2px solid #e0e0e0',
                    borderRadius: '8px',
                    fontSize: '16px',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#D35F28'}
                  onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '18px',
                    color: '#888',
                    padding: '4px'
                  }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                fontSize: '18px',
                color: '#3D3D3D'
              }}>
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                style={{
                  width: '100%',
                  padding: '14px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#D35F28'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                placeholder="Confirm new password"
              />
            </div>

            {error && (
              <div style={{
                padding: '14px',
                backgroundColor: '#fff5f5',
                color: '#c53030',
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '16px',
                border: '1px solid #feb2b2'
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '16px',
                backgroundColor: loading ? '#ccc' : '#D35F28',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s, transform 0.1s',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(211, 95, 40, 0.3)'
              }}
              onMouseOver={(e) => !loading && (e.target.style.backgroundColor = '#B94F20')}
              onMouseOut={(e) => !loading && (e.target.style.backgroundColor = '#D35F28')}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}

        <div style={{ 
          textAlign: 'center', 
          marginTop: '30px', 
          paddingTop: '20px', 
          borderTop: '1px solid #eee' 
        }}>
          <p style={{ 
            margin: 0, 
            color: '#999', 
            fontSize: '12px',
            letterSpacing: '1px'
          }}>
            CONNECT. LEARN. LEAD.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ResetPassword
