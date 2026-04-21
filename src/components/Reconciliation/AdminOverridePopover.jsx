import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'

/**
 * AdminOverridePopover — inline override form for any cell value.
 * Admin/super_admin only. Requires reason (min 10 chars).
 *
 * Props:
 *   open (bool)
 *   onClose ()
 *   anchorRect ({ top, left, width, bottom })
 *   fieldLabel (string) — e.g., "Classification", "Total Hours"
 *   currentValue (string|number)
 *   onSave ({ value, reason }) — called with new value + reason
 *   onRemoveOverride () — called to revert. Only shown if cell has existing override.
 *   hasExistingOverride (bool)
 *   existingOverrideInfo ({ by, at, reason }) — for display
 *   inputType ('text' | 'number') — defaults to 'text'
 */
export default function AdminOverridePopover({ open, onClose, anchorRect, fieldLabel, currentValue, onSave, onRemoveOverride, hasExistingOverride, existingOverrideInfo, inputType = 'text' }) {
  const [value, setValue] = useState(String(currentValue || ''))
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const popRef = useRef(null)

  useEffect(() => {
    if (open) {
      setValue(String(currentValue || ''))
      setReason('')
      setError('')
    }
  }, [open, currentValue])

  useEffect(() => {
    if (!open) return
    function handleClick(e) { if (popRef.current && !popRef.current.contains(e.target)) onClose() }
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open || !anchorRect) return null

  function handleSave() {
    if (!reason || reason.trim().length < 10) {
      setError('Reason must be at least 10 characters')
      return
    }
    if (onSave) onSave({ value: inputType === 'number' ? parseFloat(value) || 0 : value.trim(), reason: reason.trim() })
    onClose()
  }

  const content = (
    <div ref={popRef} style={{
      position: 'fixed',
      top: Math.min(anchorRect.bottom + 4, window.innerHeight - 280),
      left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - 320)),
      width: 300, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 16000, fontSize: 13,
    }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: '#1e3a5f' }}>Override {fieldLabel}</span>
        <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 14, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
      </div>

      <div style={{ padding: '10px 14px' }}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 3, color: '#6b7280' }}>Current: {String(currentValue || '—')}</label>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>Override to:</label>
          <input
            type={inputType}
            value={value}
            onChange={e => setValue(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>Reason (required, min 10 chars):</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        {error && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 6 }}>{error}</div>}

        {hasExistingOverride && existingOverrideInfo && (
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, padding: '4px 6px', backgroundColor: '#f9fafb', borderRadius: 3 }}>
            Previously overridden by {existingOverrideInfo.by || 'admin'} on {existingOverrideInfo.at ? new Date(existingOverrideInfo.at).toLocaleDateString() : '—'}
            {existingOverrideInfo.reason && <div style={{ marginTop: 2 }}>Reason: {existingOverrideInfo.reason}</div>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleSave} style={{
            padding: '6px 12px', backgroundColor: '#1e3a5f', color: 'white',
            border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>Save override</button>
          {hasExistingOverride && onRemoveOverride && (
            <button onClick={() => { onRemoveOverride(); onClose() }} style={{
              padding: '6px 12px', backgroundColor: '#dc2626', color: 'white',
              border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
            }}>Remove override</button>
          )}
          <button onClick={onClose} style={{
            padding: '6px 12px', backgroundColor: '#e5e7eb', color: '#374151',
            border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
          }}>Cancel</button>
        </div>
      </div>
    </div>
  )

  return ReactDOM.createPortal(content, document.body)
}
