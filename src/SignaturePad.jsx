import { useState, useRef, useEffect } from 'react'

export default function SignaturePad({ onSave, onCancel, signerName, signerTitle }) {
  const canvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [signatureData, setSignatureData] = useState(null) // Store signature image data
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [step, setStep] = useState('draw') // 'draw' | 'pin' | 'confirm'
  const [error, setError] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#003366'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPosition(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  function startDrawing(e) {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPosition(e)
    
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setIsDrawing(true)
  }

  function draw(e) {
    if (!isDrawing) return
    e.preventDefault()
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPosition(e)
    
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setHasSignature(true)
  }

  function stopDrawing() {
    setIsDrawing(false)
  }

  function clearSignature() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  function proceedToPin() {
    if (!hasSignature) {
      setError('Please draw your signature first')
      return
    }
    // Save the signature image data BEFORE changing steps
    const canvas = canvasRef.current
    if (canvas) {
      setSignatureData(canvas.toDataURL('image/png'))
    }
    setError('')
    setStep('pin')
  }

  function validatePin() {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits')
      return
    }
    if (!/^\d+$/.test(pin)) {
      setError('PIN must contain only numbers')
      return
    }
    setError('')
    setStep('confirm')
  }

  function confirmAndSave() {
    if (pin !== confirmPin) {
      setError('PINs do not match')
      return
    }
    
    onSave({
      signatureImage: signatureData,
      pin: pin,
      signerName: signerName,
      signerTitle: signerTitle,
      signedAt: new Date().toISOString()
    })
  }

  return (
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
        width: '95%',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
      }}>
        {step === 'draw' && (
          <>
            <h3 style={{ margin: '0 0 8px 0', color: '#003366' }}>✍️ Electronic Signature</h3>
            <p style={{ margin: '0 0 20px 0', color: '#6b7280', fontSize: '14px' }}>
              Draw your signature below using your mouse or finger
            </p>
            
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                <strong>Signer:</strong> {signerName}
              </div>
              <div style={{ fontSize: '13px', color: '#374151' }}>
                <strong>Title:</strong> {signerTitle}
              </div>
            </div>
            
            <div style={{
              border: '2px solid #d1d5db',
              borderRadius: '8px',
              overflow: 'hidden',
              marginBottom: '16px',
              touchAction: 'none'
            }}>
              <canvas
                ref={canvasRef}
                width={436}
                height={200}
                style={{ width: '100%', height: '200px', cursor: 'crosshair' }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
            
            {error && (
              <p style={{ color: '#dc2626', fontSize: '14px', margin: '0 0 16px 0' }}>{error}</p>
            )}
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
              <button
                onClick={clearSignature}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Clear
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={onCancel}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'white',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={proceedToPin}
                  disabled={!hasSignature}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: hasSignature ? '#059669' : '#d1d5db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: hasSignature ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'pin' && (
          <>
            <h3 style={{ margin: '0 0 8px 0', color: '#003366' }}>🔐 Create Signature PIN</h3>
            <p style={{ margin: '0 0 20px 0', color: '#6b7280', fontSize: '14px' }}>
              Create a 4-6 digit PIN to secure your signature. You'll need this PIN to sign documents.
            </p>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                Enter PIN (4-6 digits)
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••"
                maxLength={6}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '24px',
                  textAlign: 'center',
                  letterSpacing: '8px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            {error && (
              <p style={{ color: '#dc2626', fontSize: '14px', margin: '0 0 16px 0' }}>{error}</p>
            )}
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setStep('draw'); setError('') }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ← Back
              </button>
              <button
                onClick={validatePin}
                disabled={pin.length < 4}
                style={{
                  padding: '10px 20px',
                  backgroundColor: pin.length >= 4 ? '#059669' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: pin.length >= 4 ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <h3 style={{ margin: '0 0 8px 0', color: '#003366' }}>🔐 Confirm PIN</h3>
            <p style={{ margin: '0 0 20px 0', color: '#6b7280', fontSize: '14px' }}>
              Re-enter your PIN to confirm
            </p>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                Confirm PIN
              </label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••"
                maxLength={6}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '24px',
                  textAlign: 'center',
                  letterSpacing: '8px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            {error && (
              <p style={{ color: '#dc2626', fontSize: '14px', margin: '0 0 16px 0' }}>{error}</p>
            )}
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setStep('pin'); setConfirmPin(''); setError('') }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ← Back
              </button>
              <button
                onClick={confirmAndSave}
                disabled={confirmPin.length < 4}
                style={{
                  padding: '10px 20px',
                  backgroundColor: confirmPin.length >= 4 ? '#059669' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: confirmPin.length >= 4 ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                ✓ Save Signature
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}


// PIN Entry Component for applying existing signature
export function PinEntry({ onVerify, onCancel, onReset, signerName }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleVerify() {
    if (pin.length < 4) {
      setError('Please enter your PIN')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const result = await onVerify(pin)
      if (!result.success) {
        setError(result.error || 'Invalid PIN')
      }
    } catch (err) {
      setError('Verification failed')
    }
    
    setLoading(false)
  }

  return (
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
        maxWidth: '400px',
        width: '95%',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#003366' }}>🔐 Enter PIN to Sign</h3>
        <p style={{ margin: '0 0 20px 0', color: '#6b7280', fontSize: '14px' }}>
          Signing as: <strong>{signerName}</strong>
        </p>
        
        <div style={{ marginBottom: '20px' }}>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter PIN"
            maxLength={6}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '24px',
              textAlign: 'center',
              letterSpacing: '8px',
              boxSizing: 'border-box'
            }}
          />
        </div>
        
        {error && (
          <p style={{ color: '#dc2626', fontSize: '14px', margin: '0 0 16px 0' }}>{error}</p>
        )}
        
        {onReset && (
          <p style={{ margin: '0 0 16px 0', textAlign: 'center' }}>
            <button
              onClick={onReset}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Forgot PIN? Reset your signature
            </button>
          </p>
        )}
        
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleVerify}
            disabled={loading || pin.length < 4}
            style={{
              padding: '10px 20px',
              backgroundColor: (loading || pin.length < 4) ? '#d1d5db' : '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (loading || pin.length < 4) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {loading ? 'Verifying...' : '✓ Sign'}
          </button>
        </div>
      </div>
    </div>
  )
}
