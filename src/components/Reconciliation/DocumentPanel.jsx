import React, { useState, useMemo } from 'react'
import ImageViewer from './ImageViewer'
import PdfViewer from './PdfViewer'

/**
 * DocumentPanel — Reusable panel for the 4-panel reconciliation view.
 * Renders PDF or image documents with zoom, rotate, page nav, and empty state.
 *
 * Props:
 *   title       — Panel header text (e.g. "Contractor LEM")
 *   subtitle    — Optional secondary text below title
 *   document    — reconciliation_documents row { file_urls, original_filename, ... } or null
 *   emptyMessage— Text shown when document is null
 *   onUpload    — Callback for the Upload button in empty state
 *   color       — Accent color for border/header (e.g. '#2563eb')
 */

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const btnBase = {
  background: 'none',
  border: '1px solid #d1d5db',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '12px',
  padding: '1px 5px',
  lineHeight: '18px',
  color: '#374151'
}

export default function DocumentPanel({
  title,
  subtitle,
  document,
  emptyMessage = 'No document uploaded',
  onUpload,
  color = '#2563eb'
}) {
  const [currentPage, setCurrentPage] = useState(0) // 0-indexed for image file_urls
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  const fileUrls = useMemo(() => (document?.file_urls || []).filter(Boolean), [document])
  const totalPages = fileUrls.length

  // Determine if the document is a PDF based on the first URL extension
  const isPdf = useMemo(() => {
    if (totalPages === 0) return false
    const firstUrl = fileUrls[0]
    // Strip query params before checking extension
    const pathPart = firstUrl.split('?')[0]
    return pathPart.toLowerCase().endsWith('.pdf')
  }, [fileUrls, totalPages])

  const bgColor = hexToRgba(color, 0.04)
  const currentUrl = totalPages > 0 ? fileUrls[currentPage] : null

  // Download original file (first URL or current page)
  const handleDownload = () => {
    if (!currentUrl) return
    const a = window.document.createElement('a')
    a.href = currentUrl
    a.download = document?.original_filename || 'document'
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  return (
    <div style={{
      backgroundColor: bgColor,
      borderRadius: '8px',
      border: `2px solid ${color}`,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px 6px',
        borderBottom: `1px solid ${color}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '8px'
      }}>
        <div style={{ minWidth: 0 }}>
          <h4 style={{
            margin: 0,
            color: color,
            fontSize: '13px',
            fontWeight: '700',
            textTransform: 'uppercase'
          }}>{title}</h4>
          {subtitle && (
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{subtitle}</div>
          )}
        </div>

        {/* Controls */}
        {totalPages > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {totalPages > 1 && (
              <span style={{ fontSize: '10px', color: '#6b7280' }}>
                {totalPages} page{totalPages !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={() => setZoom(z => Math.min(5, z + 0.3))}
              title="Zoom in"
              style={btnBase}
            >+</button>
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.3))}
              title="Zoom out"
              style={btnBase}
            >-</button>
            <button
              onClick={() => setZoom(1)}
              title="Reset zoom"
              style={{ ...btnBase, fontSize: '10px' }}
            >1:1</button>
            {!isPdf && (
              <button
                onClick={() => setRotation(r => (r + 90) % 360)}
                title="Rotate 90 degrees"
                style={btnBase}
              >&#x21BB;</button>
            )}
            <button
              onClick={handleDownload}
              title="Download original"
              style={btnBase}
            >&#x2913;</button>
          </div>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px', minHeight: '200px', maxHeight: '70vh' }}>
        {totalPages === 0 ? (
          /* Empty state */
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '180px',
            gap: '12px'
          }}>
            <p style={{
              color: '#9ca3af',
              fontStyle: 'italic',
              fontSize: '12px',
              textAlign: 'center',
              margin: 0
            }}>{emptyMessage}</p>
            {onUpload && (
              <button
                onClick={onUpload}
                style={{
                  padding: '6px 16px',
                  backgroundColor: color,
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600'
                }}
              >Upload</button>
            )}
          </div>
        ) : isPdf ? (
          /* PDF document */
          <PdfViewer url={currentUrl} zoom={zoom} />
        ) : (
          /* Image document */
          <div style={{ textAlign: 'center' }}>
            <ImageViewer
              url={currentUrl}
              zoom={zoom}
              rotation={rotation}
              onZoomChange={setZoom}
            />
          </div>
        )}
      </div>

      {/* Page navigation footer for multi-page image documents (PDF has its own nav) */}
      {!isPdf && totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '6px 0',
          borderTop: `1px solid ${color}`,
          fontSize: 12
        }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage <= 0}
            style={{
              padding: '2px 8px',
              border: '1px solid #d1d5db',
              borderRadius: 3,
              cursor: currentPage > 0 ? 'pointer' : 'not-allowed',
              backgroundColor: 'white'
            }}
          >&#9664;</button>
          <span style={{ color: '#6b7280' }}>
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            style={{
              padding: '2px 8px',
              border: '1px solid #d1d5db',
              borderRadius: 3,
              cursor: currentPage < totalPages - 1 ? 'pointer' : 'not-allowed',
              backgroundColor: 'white'
            }}
          >&#9654;</button>
        </div>
      )}
    </div>
  )
}
