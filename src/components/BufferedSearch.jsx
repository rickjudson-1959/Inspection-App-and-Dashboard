// BufferedSearch.jsx - Search input with local state buffer + debounced search
// Updates display value instantly for snappy typing.
// Waits 300ms of silence before firing the onSearch callback.
// Focus shield prevents parent re-renders from overwriting typed text.

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

const BufferedSearch = memo(function BufferedSearch({
  value,            // External value (used to reset on selection/close)
  onSearch,         // Debounced callback: (searchText) => void
  onKeyDown,        // Keyboard handler for arrow/enter/escape navigation
  placeholder = 'Type to search...',
  autoFocus = false,
  style = {},
  debounceMs = 300,
}) {
  const [displayValue, setDisplayValue] = useState(value ?? '')
  const focusedRef = useRef(false)
  const inputRef = useRef(null)
  const debounceTimerRef = useRef(null)

  // Sync from external value ONLY when not focused (e.g. parent reset after selection)
  useEffect(() => {
    if (!focusedRef.current) {
      setDisplayValue(value ?? '')
    }
  }, [value])

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  const handleFocus = useCallback(() => {
    focusedRef.current = true
  }, [])

  const handleBlur = useCallback(() => {
    focusedRef.current = false
    // Sync to external value on blur
    setDisplayValue(value ?? '')
  }, [value])

  const handleChange = useCallback((e) => {
    const val = e.target.value
    setDisplayValue(val)

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Debounce the search callback
    debounceTimerRef.current = setTimeout(() => {
      console.log('[Search] Triggering filter for:', val)
      if (onSearch) onSearch(val)
    }, debounceMs)
  }, [onSearch, debounceMs])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  // Expose imperative methods via ref forwarding isn't needed here
  // because selection handling resets value prop which syncs on blur/unfocus

  return (
    <input
      ref={inputRef}
      type="text"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      style={style}
      {...PM_DEFENSE}
    />
  )
})

export default BufferedSearch
