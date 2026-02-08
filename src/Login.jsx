import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { APP_VERSION, BUILD_DATE } from './version'

function Login({ onLogin }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [mode, setMode] = useState('login') // 'login', 'signup', 'forgot'

  async function handleForgotPassword(e) {
    e.preventDefault()
    if (!email) {
      setError('Please enter your email address')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      if (error) throw error
      setSuccess('Password reset email sent! Check your inbox.')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        if (error) throw error
        // AuthContext will detect the session change
        if (onLogin) onLogin(data.user)
        // Navigate to root which will redirect to user's landing page
        navigate('/')
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        })
        if (error) throw error
        if (data.session) {
          // AuthContext will detect the session change
          if (onLogin) onLogin(data.user)
          navigate('/')
        } else if (data.user) {
          setError('Check your email for the confirmation link!')
        }
      }
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
            {mode === 'forgot' ? 'Reset Your Password' : 'Pipeline Inspector Portal'}
          </p>
        </div>

        <form onSubmit={mode === 'forgot' ? handleForgotPassword : handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontWeight: '600', 
              fontSize: '18px',
              color: '#3D3D3D'
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
              placeholder="you@company.com"
            />
          </div>

          {mode !== 'forgot' && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                fontSize: '18px',
                color: '#3D3D3D'
              }}>
                Password
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
                  placeholder="••••••••"
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
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: '14px',
              backgroundColor: error.includes('Check your email') ? '#d4edda' : '#fff5f5',
              color: error.includes('Check your email') ? '#155724' : '#c53030',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '18px',
              border: error.includes('Check your email') ? '1px solid #c3e6cb' : '1px solid #feb2b2'
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              padding: '14px',
              backgroundColor: '#d4edda',
              color: '#155724',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '18px',
              border: '1px solid #c3e6cb'
            }}>
              {success}
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
            {loading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          {mode === 'forgot' ? (
            <button
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              style={{
                background: 'none',
                border: 'none',
                color: '#1E3A5F',
                cursor: 'pointer',
                fontSize: '18px',
                fontWeight: '500'
              }}
              onMouseOver={(e) => e.target.style.color = '#D35F28'}
              onMouseOut={(e) => e.target.style.color = '#1E3A5F'}
            >
              ← Back to Sign In
            </button>
          ) : (
            <>
              <button
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1E3A5F',
                  cursor: 'pointer',
                  fontSize: '18px',
                  fontWeight: '500',
                  display: 'block',
                  margin: '0 auto 12px auto'
                }}
                onMouseOver={(e) => e.target.style.color = '#D35F28'}
                onMouseOut={(e) => e.target.style.color = '#1E3A5F'}
              >
                {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
              {mode === 'login' && (
                <button
                  onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '400'
                  }}
                  onMouseOver={(e) => e.target.style.color = '#D35F28'}
                  onMouseOut={(e) => e.target.style.color = '#888'}
                >
                  Forgot your password?
                </button>
              )}
            </>
          )}
        </div>

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
          <p style={{
            margin: '8px 0 0 0',
            color: '#ccc',
            fontSize: '10px'
          }}>
            v{APP_VERSION} ({BUILD_DATE})
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login
