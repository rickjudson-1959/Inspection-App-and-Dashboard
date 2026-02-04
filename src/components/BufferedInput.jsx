// BufferedInput.jsx - Reusable input with local state buffer
// Prevents parent re-renders from overwriting user input mid-keystroke.
// Uses local state while focused; syncs from props only when unfocused.
// Wrapped in React.memo to skip re-renders when props haven't changed.

import React, { useState, useRef, useEffect, useCallback, memo } from 'react'

// Hard-coded password manager defense attributes
const PM_DEFENSE = {
  autoComplete: 'off',
  'data-bwignore': 'true',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  spellCheck: false,
  'data-form-type': 'other',
}

const BufferedInput = memo(function BufferedInput({
  value,
  onChange,
  onFocus,
  onBlur,
  as,        // 'textarea' to render a <textarea>
  ...rest    // type, inputMode, placeholder, style, disabled, readOnly, etc.
}) {
  const [localValue, setLocalValue] = useState(value ?? '')
  const focusedRef = useRef(false)
  const inputRef = useRef(null)
  const divergeTimerRef = useRef(null)

  // Sync from props ONLY when not focused
  useEffect(() => {
    if (!focusedRef.current) {
      setLocalValue(value ?? '')
    }
  }, [value])

  // Divergence detector: warn if prop value and local value differ
  // for more than 500ms while the user is focused (stale data fight)
  useEffect(() => {
    if (!focusedRef.current) return

    const propStr = String(value ?? '')
    const localStr = String(localValue ?? '')

    if (propStr !== localStr) {
      divergeTimerRef.current = setTimeout(() => {
        if (focusedRef.current) {
          console.warn(
            `[BufferedInput] Divergence detected while focused — ` +
            `prop: "${propStr}", local: "${localStr}"`
          )
        }
      }, 500)
    }

    return () => {
      if (divergeTimerRef.current) clearTimeout(divergeTimerRef.current)
    }
  }, [value, localValue])

  const handleFocus = useCallback((e) => {
    focusedRef.current = true
    if (onFocus) onFocus(e)
  }, [onFocus])

  const handleChange = useCallback((e) => {
    const val = e.target.value
    setLocalValue(val)
    console.log('[BufferedInput] Emitting value:', val)
    if (onChange) onChange(val)
  }, [onChange])

  const handleBlur = useCallback((e) => {
    focusedRef.current = false
    // Sync local state to the authoritative prop value on blur
    // in case the parent processed the value differently
    setLocalValue(value ?? '')
    if (onBlur) onBlur(e)
  }, [onBlur, value])

  const Tag = as === 'textarea' ? 'textarea' : 'input'

  return (
    <Tag
      ref={inputRef}
      value={localValue}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      {...PM_DEFENSE}
      {...rest}
    />
  )
})

export default BufferedInput
