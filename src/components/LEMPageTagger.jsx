import React, { useState, useRef, useEffect } from 'react'

const TAG_TYPES = [
  { key: 'lem', label: 'LEM', color: '#2563eb', bg: '#dbeafe' },
  { key: 'daily_ticket', label: 'Daily Ticket', color: '#059669', bg: '#d1fae5' },
  { key: 'cover_sheet', label: 'Cover/Ignore', color: '#6b7280', bg: '#f3f4f6' }
]

/**
 * LEMPageTagger — thumbnail grid with tagging buttons for contractor profile training.
 *
 * Props:
 *   pageImages: string[]      — base64 JPEG images of each page
 *   tags: object              — { [pageIndex]: 'lem' | 'daily_ticket' | 'cover_sheet' }
 *   onTagChange: (idx, tag) => void
 *   onTagAll: (tag) => void   — optional bulk tag
 *   loading: boolean
 */
export default function LEMPageTagger({ pageImages = [], tags = {}, onTagChange, onTagAll, loading }) {
  const [selectedPage, setSelectedPage] = useState(null)
  const [activeBrush, setActiveBrush] = useState(null) // brush mode for rapid tagging
  const thumbnailsRef = useRef(null)

  const taggedCount = Object.keys(tags).length
  const totalPages = pageImages.length
  const tagCounts = TAG_TYPES.reduce((acc, t) => {
    acc[t.key] = Object.values(tags).filter(v => v === t.key).length
    return acc
  }, {})

  function handleThumbnailClick(idx) {
    if (activeBrush) {
      // In brush mode, clicking tags the page
      onTagChange?.(idx, activeBrush)
    } else {
      setSelectedPage(selectedPage === idx ? null : idx)
    }
  }

  function handleTagButton(idx, tag) {
    // Toggle: if already this tag, remove it
    if (tags[idx] === tag) {
      onTagChange?.(idx, null)
    } else {
      onTagChange?.(idx, tag)
    }
  }

  // Keyboard shortcuts: 1=LEM, 2=Ticket, 3=Cover when a page is selected
  useEffect(() => {
    function handleKey(e) {
      if (selectedPage === null) return
      if (e.key === '1') handleTagButton(selectedPage, 'lem')
      else if (e.key === '2') handleTagButton(selectedPage, 'daily_ticket')
      else if (e.key === '3') handleTagButton(selectedPage, 'cover_sheet')
      else if (e.key === 'ArrowRight' && selectedPage < totalPages - 1) setSelectedPage(selectedPage + 1)
      else if (e.key === 'ArrowLeft' && selectedPage > 0) setSelectedPage(selectedPage - 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedPage, tags])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
        <div style={{ width: '24px', height: '24px', border: '3px solid #2563eb', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
        <p>Rendering page thumbnails...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (totalPages === 0) return null

  return (
    <div>
      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600' }}>
          Tagged: {taggedCount} of {totalPages} pages
          <span style={{ marginLeft: '16px', fontSize: '12px', color: '#6b7280', fontWeight: '400' }}>
            {TAG_TYPES.map(t => `${t.label}: ${tagCounts[t.key] || 0}`).join(' | ')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>Brush:</span>
          {TAG_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveBrush(activeBrush === t.key ? null : t.key)}
              style={{
                padding: '4px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer',
                border: activeBrush === t.key ? `2px solid ${t.color}` : '1px solid #d1d5db',
                backgroundColor: activeBrush === t.key ? t.bg : 'white',
                color: t.color, fontWeight: activeBrush === t.key ? '700' : '500'
              }}
            >
              {t.label}
            </button>
          ))}
          {activeBrush && (
            <button onClick={() => setActiveBrush(null)} style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#fef2f2', color: '#dc2626' }}>
              Clear Brush
            </button>
          )}
        </div>
      </div>

      {/* Progress bar visual */}
      <div style={{ height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', marginBottom: '16px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(taggedCount / totalPages) * 100}%`, backgroundColor: taggedCount === totalPages ? '#059669' : '#2563eb', borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>

      {/* Keyboard shortcuts hint */}
      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px' }}>
        Click a thumbnail to select it. Keys: 1=LEM, 2=Ticket, 3=Cover, Arrow keys to navigate.
        {activeBrush && <span style={{ color: '#2563eb', fontWeight: '600' }}> Brush mode active — click thumbnails to tag them as {TAG_TYPES.find(t => t.key === activeBrush)?.label}.</span>}
      </div>

      {/* Thumbnail grid */}
      <div
        ref={thumbnailsRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '8px',
          maxHeight: '500px',
          overflowY: 'auto',
          padding: '4px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          backgroundColor: '#fafafa'
        }}
      >
        {pageImages.map((img, idx) => {
          const tag = tags[idx]
          const tagType = TAG_TYPES.find(t => t.key === tag)
          const isSelected = selectedPage === idx

          return (
            <div
              key={idx}
              onClick={() => handleThumbnailClick(idx)}
              style={{
                position: 'relative',
                border: isSelected ? '3px solid #2563eb' : tag ? `2px solid ${tagType.color}` : '1px solid #d1d5db',
                borderRadius: '6px',
                overflow: 'hidden',
                cursor: activeBrush ? 'crosshair' : 'pointer',
                backgroundColor: tag ? tagType.bg : 'white',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                boxShadow: isSelected ? '0 0 0 2px rgba(37,99,235,0.3)' : 'none'
              }}
            >
              {/* Page number badge */}
              <div style={{
                position: 'absolute', top: '4px', left: '4px', backgroundColor: 'rgba(0,0,0,0.7)',
                color: 'white', fontSize: '10px', padding: '1px 5px', borderRadius: '3px', zIndex: 1
              }}>
                {idx + 1}
              </div>

              {/* Tag badge */}
              {tag && (
                <div style={{
                  position: 'absolute', top: '4px', right: '4px', backgroundColor: tagType.color,
                  color: 'white', fontSize: '9px', padding: '1px 5px', borderRadius: '3px', zIndex: 1, fontWeight: '600'
                }}>
                  {tagType.label}
                </div>
              )}

              {/* Thumbnail image */}
              <img
                src={`data:image/jpeg;base64,${img}`}
                alt={`Page ${idx + 1}`}
                style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }}
                loading="lazy"
              />

              {/* Tag buttons (shown when selected, not in brush mode) */}
              {isSelected && !activeBrush && (
                <div style={{ display: 'flex', gap: '2px', padding: '4px', backgroundColor: 'rgba(255,255,255,0.95)' }}>
                  {TAG_TYPES.map(t => (
                    <button
                      key={t.key}
                      onClick={(e) => { e.stopPropagation(); handleTagButton(idx, t.key) }}
                      style={{
                        flex: 1, padding: '4px 2px', fontSize: '10px', border: 'none', borderRadius: '3px',
                        cursor: 'pointer', fontWeight: tag === t.key ? '700' : '500',
                        backgroundColor: tag === t.key ? t.color : t.bg,
                        color: tag === t.key ? 'white' : t.color
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Enlarged preview of selected page */}
      {selectedPage !== null && !activeBrush && (
        <div style={{
          marginTop: '16px', padding: '16px', backgroundColor: 'white',
          border: '1px solid #e5e7eb', borderRadius: '8px',
          display: 'flex', gap: '16px', alignItems: 'flex-start'
        }}>
          <img
            src={`data:image/jpeg;base64,${pageImages[selectedPage]}`}
            alt={`Page ${selectedPage + 1} enlarged`}
            style={{ maxWidth: '400px', maxHeight: '500px', objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: '4px' }}
          />
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>Page {selectedPage + 1} of {totalPages}</h4>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
              What type of document is this page?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {TAG_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => handleTagButton(selectedPage, t.key)}
                  style={{
                    padding: '10px 16px', fontSize: '14px', borderRadius: '6px', cursor: 'pointer',
                    border: tags[selectedPage] === t.key ? `2px solid ${t.color}` : '1px solid #d1d5db',
                    backgroundColor: tags[selectedPage] === t.key ? t.bg : 'white',
                    color: t.color, fontWeight: tags[selectedPage] === t.key ? '700' : '500',
                    textAlign: 'left'
                  }}
                >
                  {t.key === 'lem' && 'LEM — billing summary with rates, hours, totals'}
                  {t.key === 'daily_ticket' && 'Daily Ticket — single day, crew names, signatures'}
                  {t.key === 'cover_sheet' && 'Cover Sheet / Admin — tracking logs, ignore'}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setSelectedPage(Math.max(0, selectedPage - 1))}
                disabled={selectedPage === 0}
                style={{ padding: '6px 14px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '4px', cursor: selectedPage === 0 ? 'not-allowed' : 'pointer', backgroundColor: 'white' }}
              >
                Previous
              </button>
              <button
                onClick={() => setSelectedPage(Math.min(totalPages - 1, selectedPage + 1))}
                disabled={selectedPage === totalPages - 1}
                style={{ padding: '6px 14px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '4px', cursor: selectedPage === totalPages - 1 ? 'not-allowed' : 'pointer', backgroundColor: 'white' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
