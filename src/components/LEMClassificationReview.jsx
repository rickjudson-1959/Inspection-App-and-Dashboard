import React, { useState } from 'react'

const TAG_TYPES = [
  { key: 'lem', label: 'LEM', color: '#2563eb', bg: '#dbeafe' },
  { key: 'daily_ticket', label: 'Ticket', color: '#059669', bg: '#d1fae5' },
  { key: 'cover_sheet', label: 'Cover', color: '#6b7280', bg: '#f3f4f6' }
]

/**
 * LEMClassificationReview — shows flagged low-confidence pages for admin correction.
 *
 * Props:
 *   flaggedPages: Array<{ pageIndex, page_type, confidence, date, crew }>
 *   pageImages: string[] (base64) — only need images for flagged page indices
 *   onCorrect: (pageIndex, newType) => void
 *   onConfirm: () => void
 *   totalPages: number
 *   classifications: Array — full classification array for summary
 */
export default function LEMClassificationReview({ flaggedPages = [], pageImages = [], onCorrect, onConfirm, totalPages, classifications = [] }) {
  const [corrections, setCorrections] = useState({}) // { [pageIndex]: newType }

  if (flaggedPages.length === 0) return null

  const lemCount = classifications.filter(c => c.page_type === 'lem').length
  const ticketCount = classifications.filter(c => c.page_type === 'daily_ticket').length
  const coverCount = classifications.filter(c => c.page_type === 'cover_sheet').length
  const reviewedCount = Object.keys(corrections).length

  function handleCorrection(pageIndex, newType) {
    setCorrections(prev => ({ ...prev, [pageIndex]: newType }))
    onCorrect?.(pageIndex, newType)
  }

  return (
    <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', color: '#92400e' }}>
            {flaggedPages.length} page{flaggedPages.length !== 1 ? 's' : ''} need review
          </h4>
          <p style={{ margin: 0, fontSize: '12px', color: '#78716c' }}>
            {totalPages} total: {lemCount} LEM, {ticketCount} ticket{coverCount > 0 ? `, ${coverCount} cover` : ''}
            {reviewedCount > 0 && ` | ${reviewedCount} corrected`}
          </p>
        </div>
        <button
          onClick={onConfirm}
          style={{
            padding: '8px 20px', fontSize: '13px', fontWeight: '600', border: 'none',
            borderRadius: '6px', cursor: 'pointer',
            backgroundColor: '#059669', color: 'white'
          }}
        >
          Confirm Classifications
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
        {flaggedPages.map(fp => {
          const corrected = corrections[fp.pageIndex]
          const currentType = corrected || fp.page_type
          const img = pageImages[fp.pageIndex]

          return (
            <div key={fp.pageIndex} style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px',
              backgroundColor: corrected ? '#f0fdf4' : 'white', borderRadius: '6px',
              border: corrected ? '1px solid #86efac' : '1px solid #e5e7eb'
            }}>
              {/* Thumbnail */}
              {img && (
                <img
                  src={`data:image/jpeg;base64,${img}`}
                  alt={`Page ${fp.pageIndex + 1}`}
                  style={{ width: '60px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #d1d5db', flexShrink: 0 }}
                />
              )}

              {/* Page info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '600' }}>
                  Page {fp.pageIndex + 1}
                  <span style={{ fontWeight: '400', color: '#6b7280', marginLeft: '8px' }}>
                    classified as "{fp.page_type}" ({((fp.confidence || 0) * 100).toFixed(0)}% confidence)
                  </span>
                </div>
                {fp.date && <span style={{ fontSize: '11px', color: '#6b7280' }}>Date: {fp.date}</span>}
                {fp.error && <span style={{ fontSize: '11px', color: '#dc2626', marginLeft: '8px' }}>{fp.error}</span>}
              </div>

              {/* Correction buttons */}
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                {TAG_TYPES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => handleCorrection(fp.pageIndex, t.key)}
                    style={{
                      padding: '4px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer',
                      border: currentType === t.key ? `2px solid ${t.color}` : '1px solid #d1d5db',
                      backgroundColor: currentType === t.key ? t.bg : 'white',
                      color: t.color, fontWeight: currentType === t.key ? '700' : '400'
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
