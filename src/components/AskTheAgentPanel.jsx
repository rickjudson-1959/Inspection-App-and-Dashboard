// AskTheAgentPanel.jsx - Inline expandable panel for NLQ queries
// Single-turn Q&A with predictive typeahead from technical terms

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { askAgent, saveToHistory, getHistory } from '../agents/NLQueryService.js'
import technicalTerms from '../agents/technicalTerms.js'

function AskTheAgentPanel({ activityType, organizationId, blockId, reportContext }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1)
  const [feedback, setFeedback] = useState(null)
  const [recentQuestions, setRecentQuestions] = useState([])
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // Load recent questions on open
  useEffect(() => {
    if (isOpen) {
      setRecentQuestions(getHistory())
    }
  }, [isOpen])

  // Prefix-match suggestions with debounce
  const handleInputChange = useCallback((value) => {
    setQuery(value)
    setSelectedSuggestion(-1)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.length < 2) {
      setSuggestions([])
      return
    }

    debounceRef.current = setTimeout(() => {
      const lower = value.toLowerCase()
      const matches = technicalTerms
        .filter(term => term.toLowerCase().includes(lower))
        .slice(0, 6)
      setSuggestions(matches)
    }, 200)
  }, [])

  const handleKeyDown = (e) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestion(prev =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestion(prev =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        )
      } else if (e.key === 'Enter' && selectedSuggestion >= 0) {
        e.preventDefault()
        setQuery(suggestions[selectedSuggestion])
        setSuggestions([])
        setSelectedSuggestion(-1)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && query.trim()) {
      e.preventDefault()
      handleAsk()
    }

    if (e.key === 'Escape') {
      setSuggestions([])
    }
  }

  const handleAsk = async () => {
    if (!query.trim() || loading) return

    setLoading(true)
    setError(null)
    setResult(null)
    setFeedback(null)
    setSuggestions([])

    const response = await askAgent(
      query.trim(),
      { activityType, blockId, reportContext },
      organizationId
    )

    setLoading(false)

    if (response.error) {
      setError(response.error)
    } else {
      setResult(response)
      saveToHistory(query.trim(), response.answer)
    }
  }

  const selectSuggestion = (term) => {
    setQuery(term)
    setSuggestions([])
    setSelectedSuggestion(-1)
    inputRef.current?.focus()
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          fontSize: '12px',
          fontWeight: '600',
          color: '#4f46e5',
          backgroundColor: '#eef2ff',
          border: '1px solid #c7d2fe',
          borderRadius: '6px',
          cursor: 'pointer',
          marginBottom: '12px',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#e0e7ff'
          e.currentTarget.style.borderColor = '#a5b4fc'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#eef2ff'
          e.currentTarget.style.borderColor = '#c7d2fe'
        }}
      >
        <span style={{ fontSize: '14px' }}>&#x1F916;</span>
        Ask the Agent
      </button>
    )
  }

  return (
    <div style={{
      marginBottom: '16px',
      borderRadius: '8px',
      border: '1px solid #c7d2fe',
      backgroundColor: '#fafafe',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        backgroundColor: '#eef2ff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #e0e7ff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px' }}>&#x1F916;</span>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#3730a3' }}>
            Ask the Agent
          </span>
          {activityType && (
            <span style={{
              fontSize: '10px',
              padding: '1px 6px',
              backgroundColor: '#e0e7ff',
              color: '#4f46e5',
              borderRadius: '8px'
            }}>
              {activityType}
            </span>
          )}
        </div>
        <button
          onClick={() => { setIsOpen(false); setResult(null); setError(null); setQuery('') }}
          style={{
            background: 'none',
            border: 'none',
            color: '#6b7280',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '0 4px'
          }}
        >
          ×
        </button>
      </div>

      {/* Input area */}
      <div style={{ padding: '12px 14px', position: 'relative' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your report, specs, or procedures..."
              disabled={loading}
              autoFocus
              autoComplete="off"
              data-1p-ignore
              data-bwignore
              data-lpignore
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '13px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                boxSizing: 'border-box',
                backgroundColor: loading ? '#f3f4f6' : 'white'
              }}
            />

            {/* Suggestion dropdown */}
            {suggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: 'white',
                border: '1px solid #d1d5db',
                borderTop: 'none',
                borderRadius: '0 0 6px 6px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                zIndex: 100,
                maxHeight: '160px',
                overflowY: 'auto'
              }}>
                {suggestions.map((term, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectSuggestion(term)}
                    style={{
                      padding: '6px 10px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      backgroundColor: idx === selectedSuggestion ? '#eef2ff' : 'white',
                      borderBottom: idx < suggestions.length - 1 ? '1px solid #f3f4f6' : 'none'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eef2ff'}
                    onMouseLeave={(e) => {
                      if (idx !== selectedSuggestion) e.currentTarget.style.backgroundColor = 'white'
                    }}
                  >
                    {term}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleAsk}
            disabled={loading || !query.trim()}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: '600',
              backgroundColor: loading || !query.trim() ? '#d1d5db' : '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {loading ? 'Thinking...' : 'Ask'}
          </button>
        </div>

        {/* Recent questions */}
        {!result && !loading && recentQuestions.length > 0 && !query && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '4px' }}>Recent questions:</div>
            {recentQuestions.slice(0, 3).map((item, idx) => (
              <button
                key={idx}
                onClick={() => { setQuery(item.question); handleInputChange(item.question) }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '4px 8px',
                  fontSize: '11px',
                  color: '#4b5563',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '3px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {item.question}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{
          padding: '16px',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '13px'
        }}>
          <div style={{ marginBottom: '4px' }}>&#x1F50D; Searching knowledge base...</div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
            Checking your report data and project knowledge base
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{
          padding: '12px 14px',
          backgroundColor: '#fef2f2',
          borderTop: '1px solid #fecaca',
          fontSize: '12px',
          color: '#dc2626'
        }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          borderTop: '1px solid #e0e7ff'
        }}>
          {/* Answer */}
          <div style={{
            padding: '12px 14px',
            fontSize: '13px',
            color: '#1f2937',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap'
          }}>
            {result.answer}
          </div>

          {/* Sources */}
          {result.sources?.length > 0 && (
            <div style={{
              padding: '8px 14px',
              backgroundColor: '#f0f9ff',
              borderTop: '1px solid #e0f2fe'
            }}>
              <div style={{
                fontSize: '10px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: '#6b7280',
                marginBottom: '4px'
              }}>
                Sources ({result.documentsSearched} documents searched)
              </div>
              {result.sources.slice(0, 4).map((source, idx) => (
                <div key={idx} style={{
                  fontSize: '11px',
                  color: '#475569',
                  padding: '2px 0'
                }}>
                  {source.document}
                  {source.section && ` - ${source.section}`}
                  <span style={{ color: '#94a3b8', marginLeft: '6px' }}>
                    ({source.similarity}% match)
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Feedback */}
          <div style={{
            padding: '8px 14px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            {feedback === null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#9ca3af' }}>Was this helpful?</span>
                <button
                  onClick={() => setFeedback('yes')}
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    color: '#6b7280'
                  }}
                >
                  Yes
                </button>
                <button
                  onClick={() => setFeedback('no')}
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    color: '#6b7280'
                  }}
                >
                  No
                </button>
              </div>
            ) : (
              <span style={{ fontSize: '11px', color: '#16a34a' }}>
                Thanks for the feedback
              </span>
            )}

            <button
              onClick={() => { setResult(null); setQuery(''); setError(null); setFeedback(null) }}
              style={{
                padding: '2px 10px',
                fontSize: '11px',
                fontWeight: '600',
                color: '#4f46e5',
                backgroundColor: 'transparent',
                border: '1px solid #c7d2fe',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Ask another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AskTheAgentPanel
