import React, { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'

/**
 * SignaturePad Component
 *
 * A touch-screen signature capture component for ITP approvals.
 * Uses react-signature-canvas for drawing and generates verification hashes.
 *
 * @param {function} onSave - Callback with signature data: { imageData, hash }
 * @param {function} onCancel - Callback when user cancels
 * @param {string} signerName - Name of the person signing
 * @param {string} signerRole - Role label (e.g., "Chief Inspector")
 */
function SignaturePad({ onSave, onCancel, signerName, signerRole }) {
  const sigCanvas = useRef(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [saving, setSaving] = useState(false)

  // Check if canvas has content
  const handleEnd = () => {
    if (sigCanvas.current) {
      setIsEmpty(sigCanvas.current.isEmpty())
    }
  }

  // Clear the signature
  const handleClear = () => {
    if (sigCanvas.current) {
      sigCanvas.current.clear()
      setIsEmpty(true)
    }
  }

  // Generate SHA-256 hash of content for verification
  async function generateHash(content) {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Save the signature
  const handleSave = async () => {
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
      alert('Please provide a signature before saving.')
      return
    }

    setSaving(true)

    try {
      // Get signature as PNG data URL
      const signatureDataUrl = sigCanvas.current.toDataURL('image/png')

      // Generate verification hash including signer info and timestamp
      const timestamp = new Date().toISOString()
      const hashContent = `${signerName}|${signerRole}|${timestamp}|${signatureDataUrl}`
      const verificationHash = await generateHash(hashContent)

      // Convert data URL to blob for upload
      const response = await fetch(signatureDataUrl)
      const blob = await response.blob()

      onSave({
        imageData: signatureDataUrl,
        blob: blob,
        hash: verificationHash,
        timestamp: timestamp
      })
    } catch (err) {
      console.error('Error saving signature:', err)
      alert('Error saving signature. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 8px 0', color: '#1f2937' }}>
            Digital Signature
          </h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
            Sign as <strong>{signerName}</strong> ({signerRole})
          </p>
        </div>

        {/* Signature Canvas */}
        <div style={{
          border: '2px solid #e5e7eb',
          borderRadius: '8px',
          backgroundColor: '#fafafa',
          marginBottom: '16px',
          overflow: 'hidden'
        }}>
          <SignatureCanvas
            ref={sigCanvas}
            canvasProps={{
              width: 450,
              height: 200,
              style: {
                width: '100%',
                height: '200px',
                cursor: 'crosshair'
              }
            }}
            backgroundColor="rgb(250, 250, 250)"
            penColor="black"
            onEnd={handleEnd}
          />
        </div>

        {/* Instructions */}
        <p style={{
          margin: '0 0 16px 0',
          fontSize: '12px',
          color: '#9ca3af',
          textAlign: 'center'
        }}>
          Use your mouse or finger to sign above. Your signature will be cryptographically verified.
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleClear}
            disabled={saving}
            style={{
              padding: '12px 24px',
              backgroundColor: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Clear
          </button>
          <button
            onClick={handleSave}
            disabled={isEmpty || saving}
            style={{
              padding: '12px 24px',
              backgroundColor: isEmpty || saving ? '#9ca3af' : '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isEmpty || saving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {saving ? 'Saving...' : 'Sign & Confirm'}
          </button>
        </div>

        {/* Legal Notice */}
        <p style={{
          margin: '16px 0 0 0',
          fontSize: '11px',
          color: '#9ca3af',
          textAlign: 'center',
          lineHeight: '1.4'
        }}>
          By signing, you confirm you have reviewed and approve this document.
          This signature is legally binding and will be recorded with a verification hash.
        </p>
      </div>
    </div>
  )
}

export default SignaturePad
