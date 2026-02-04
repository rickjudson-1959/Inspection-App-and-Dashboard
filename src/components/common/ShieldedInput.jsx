// ShieldedInput.jsx - Shielded input with local state buffer
// Ref-Shield pattern: localValue is the sole display source while focused.
// Prop updates are BLOCKED while the user is typing (focused).
// Syncs from props only on blur or when not focused.
// Wrapped in React.memo to skip re-renders when props haven't changed.

import React, { useState, useRef, useEffect, useCallback, memo } from 'react'

// Password manager defense attributes
const PM_DEFENSE = {
  autoComplete: 'off',
  'data-bwignore': 'true',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  spellCheck: false,
  'data-form-type': 'other',
}

const ShieldedInput = memo(function ShieldedInput({
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

  // Sync from props ONLY when not focused
  useEffect(() => {
    if (!focusedRef.current) {
      setLocalValue(value ?? '')
    } else {
      console.log('[ShieldedSystem] Prop Sync Blocked - User is Typing')
    }
  }, [value])

  const handleFocus = useCallback((e) => {
    focusedRef.current = true
    if (onFocus) onFocus(e)
  }, [onFocus])

  const handleChange = useCallback((e) => {
    const val = e.target.value
    setLocalValue(val)
    if (onChange) onChange(val)
  }, [onChange])

  const handleBlur = useCallback((e) => {
    focusedRef.current = false
    // Sync local state to the authoritative prop value on blur
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

export default ShieldedInput
