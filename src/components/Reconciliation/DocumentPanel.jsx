import React, { useState, useMemo } from 'react'
import OriginalPagesLightbox from './OriginalPagesLightbox'
import InspectorReportPanel from './InspectorReportPanel'

/**
 * DocumentPanel — Reusable panel for the 4-panel reconciliation view.
 * Supports fullscreen expand mode for detailed document review.
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
  panelType = 'uploaded',
  document,
  reportData,
  emptyMessage = 'No document uploaded',
  onUpload,
  color = '#2563eb',
  labourRates,
  equipmentRates,
  aliases,
  organizationId,
  onBlockChange,
  onAliasCreated,
  sameDayEntries,
  employeeRoster,
  equipmentRoster,
  lemData,
  reportDate,
  hasLemPdf,
  lemPdfUrls,
  onLemExtracted,
  defaultRotation = 0,         // 0|90|180|270 — initial PDF / image
                               // rotation. Used by the four-panel
                               // viewer to display LEM + Ticket
                               // scans landscape by default.
}) {
  const [currentPage, setCurrentPage] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(defaultRotation)
  const [originalLightboxOpen, setOriginalLightboxOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const fileUrls = useMemo(() => (document?.file_urls || []).filter(Boolean), [document])
  const totalPages = fileUrls.length

  const isPdf = useMemo(() => {
    if (totalPages === 0) return false
    const pathPart = fileUrls[0].split('?')[0]
    return pathPart.toLowerCase().endsWith('.pdf')
  }, [fileUrls, totalPages])

  const bgColor = hexToRgba(color, 0.04)
  const currentUrl = totalPages > 0 ? fileUrls[currentPage] : null

  const handleDownload = () => {
    if (!currentUrl) return
    const a = window.document.createElement('a')
    a.href = currentUrl
    a.download = document?.original_filename || 'document'
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  // Open in a new tab at full quality. For bulk-uploaded docs each
  // page is its own JPEG; open them ALL in one tab as a stacked
  // page (one tab per page would be a usability mess for 2-3 page
  // LEMs, so we stay in-app). For legacy single-doc PDF uploads
  // that still have source_pages metadata, open the lightbox so
  // the admin doesn't see unrelated pages from a shared source PDF.
  // For other PDFs, open file_urls[0] natively.
  const hasPageSlice = Array.isArray(document?.source_pages)
                       && document.source_pages.length > 0
                       && isPdf
  const handleOpenOriginal = () => {
    if (!currentUrl) return
    if (hasPageSlice) {
      setOriginalLightboxOpen(true)
    } else if (isPdf) {
      window.open(currentUrl, '_blank', 'noopener,noreferrer')
    } else {
      // Image-based row: open every page in a new blank tab as a
      // simple html stack. The native image viewer doesn't handle
      // multi-image grouping itself.
      const html = `<!doctype html><html><head><title>${(title || 'Document').replace(/</g, '&lt;')}</title>
        <style>body{margin:0;background:#222;text-align:center}img{display:block;margin:0 auto 12px;max-width:100%}</style></head>
        <body>${fileUrls.map((u, i) => `<img src="${u}" alt="Page ${i + 1}" />`).join('')}</body></html>`
      const w = window.open('', '_blank', 'noopener,noreferrer')
      if (w) { w.document.write(html); w.document.close() }
    }
  }

  const hasContent = panelType === 'report' ? !!reportData : totalPages > 0

  // --- Controls bar (shared between normal and expanded) ---
  function renderControls() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {totalPages > 1 && (
          <span style={{ fontSize: '10px', color: '#6b7280' }}>
            {totalPages} page{totalPages !== 1 ? 's' : ''}
          </span>
        )}
        {hasContent && panelType !== 'report' && (
          <>
            <button onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} title="Zoom in (+0.25)" style={btnBase}>+</button>
            <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} title="Zoom out (-0.25)" style={btnBase}>-</button>
            <button onClick={() => setZoom(1)} title="Reset zoom (1×)" style={{ ...btnBase, fontSize: '10px' }}>1:1</button>
            <button onClick={() => setRotation(r => (r + 90) % 360)} title="Rotate 90°" style={btnBase}>&#x21BB;</button>
            <button onClick={handleOpenOriginal}
              title="Open original PDF in new tab (full quality)"
              style={{ ...btnBase, backgroundColor: color, color: 'white', borderColor: color, fontWeight: 700, padding: '0 8px' }}>
              ↗ Open
            </button>
            <button onClick={handleDownload} title="Download original" style={btnBase}>&#x2913;</button>
          </>
        )}
        {hasContent && (
          <button
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Exit fullscreen' : 'Expand fullscreen'}
            style={{ ...btnBase, fontWeight: '700', fontSize: '14px', padding: '0 6px' }}
          >
            {expanded ? '✕' : '⛶'}
          </button>
        )}
      </div>
    )
  }

  // --- Content renderer (shared between normal and expanded) ---
  function renderContent(contentMaxHeight) {
    if (panelType === 'report') {
      return reportData ? (
        <InspectorReportPanel
          report={reportData.report}
          block={reportData.block}
          labourRates={labourRates || []}
          equipmentRates={equipmentRates || []}
          aliases={aliases || []}
          organizationId={organizationId}
          onBlockChange={onBlockChange}
          onAliasCreated={onAliasCreated}
          sameDayEntries={sameDayEntries || { labour: [], equipment: [] }}
          employeeRoster={employeeRoster || []}
          equipmentRoster={equipmentRoster || []}
          lemData={lemData || null}
          reportDate={reportDate || null}
          hasLemPdf={hasLemPdf || false}
          lemPdfUrls={lemPdfUrls || []}
          onLemExtracted={onLemExtracted}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '180px', gap: '8px' }}>
          <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '12px', textAlign: 'center', margin: 0 }}>{emptyMessage}</p>
          <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>The inspector must submit a daily report referencing this ticket</p>
        </div>
      )
    }

    if (totalPages === 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '180px', gap: '12px' }}>
          <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '12px', textAlign: 'center', margin: 0 }}>{emptyMessage}</p>
          {panelType === 'photo' ? (
            <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>The inspector must photograph the daily ticket when submitting their report</p>
          ) : onUpload ? (
            <button onClick={onUpload} style={{ padding: '6px 16px', backgroundColor: color, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Upload</button>
          ) : null}
        </div>
      )
    }

    // VIEWER:
    //   • PDF rows (legacy pre-JPEG bulk uploads, or single-doc
    //     PDF uploads) — browser-native <iframe> viewer. No pdf.js,
    //     no canvas. Chrome, Firefox, Safari, Edge all render PDFs
    //     inline natively.
    //   • Image rows (new bulk uploads after May 13) — stacked
    //     <img> tags inside a wrapper that's CSS-scaled by zoom.
    //
    // Rotation is applied via a CSS transform on the wrapper for
    // both paths. The four-panel view defaults to rotation=90 for
    // landscape Aecon scans.

    const safeRotation = ((rotation % 360) + 360) % 360

    if (isPdf) {
      // Browser-native PDF viewer. #page=N jumps to the first page
      // belonging to this row (matters for legacy bulk uploads
      // where file_urls[0] points at the shared 130-page source
      // PDF and source_pages identifies the slice). FitH scales
      // the page to the iframe width.
      const pageJump = Array.isArray(document?.source_pages) && document.source_pages.length > 0
        ? `#page=${document.source_pages[0]}&view=FitH`
        : '#view=FitH'
      return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
          <iframe
            src={`${currentUrl}${pageJump}`}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              transform: safeRotation ? `rotate(${safeRotation}deg)` : 'none',
              transformOrigin: 'center center'
            }}
            title="Document"
          />
        </div>
      )
    }

    // Image stack — one <img> per file_url. No PdfViewer.
    //
    // transformOrigin is conditional on rotation:
    //   • No rotation → 'top left' so zoom expands toward the
    //     bottom-right and the scrollbar behaves intuitively.
    //   • Rotated → 'center center' (matches the iframe path above)
    //     so the rotated content stays within the viewport instead
    //     of swinging off into negative coordinates. Top-left origin
    //     + rotate(90deg) on a width:100% wrapper paints every pixel
    //     into x<0, which is why LEM + Ticket panels (defaultRotation
    //     =90) rendered as visually empty after pdf.js was removed in
    //     2acc902.
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'auto', backgroundColor: '#f3f4f6' }}>
        <div style={{
          width: '100%',
          transform: `scale(${zoom})${safeRotation ? ` rotate(${safeRotation}deg)` : ''}`,
          transformOrigin: safeRotation ? 'center center' : 'top left',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 4
        }}>
          {fileUrls.map((u, i) => (
            <img key={i} src={u} alt={`Page ${i + 1}`}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block'
              }} />
          ))}
        </div>
      </div>
    )
  }

  // Page navigation footer is no longer needed for image-based docs
  // — all pages are stacked vertically in one scrollable panel. Kept
  // as a no-op so existing renderPageNav() call sites don't break.
  function renderPageNav() { return null }

  // --- Fullscreen overlay ---
  if (expanded) {
    return (
      <>
        {/* Placeholder in the grid so layout doesn't collapse */}
        <div style={{ backgroundColor: bgColor, borderRadius: '8px', border: `2px solid ${color}`, minHeight: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic' }}>{title} — expanded</span>
        </div>

        {/* Fullscreen overlay */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000,
          display: 'flex', flexDirection: 'column'
        }}>
          {/* Fullscreen header */}
          <div style={{
            padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: color, color: 'white', flexShrink: 0
          }}>
            <div>
              <span style={{ fontSize: '16px', fontWeight: '700', textTransform: 'uppercase' }}>{title}</span>
              {subtitle && <span style={{ marginLeft: 12, fontSize: '13px', opacity: 0.8 }}>{subtitle}</span>}
            </div>
            {renderControls()}
          </div>

          {/* Fullscreen content */}
          <div style={{ flex: 1, overflow: 'auto', padding: panelType === 'report' ? 0 : '16px', backgroundColor: panelType === 'report' ? 'white' : '#111' }}>
            {renderContent(null)}
          </div>

          {/* Fullscreen page nav */}
          {renderPageNav('#555')}
        </div>
      </>
    )
  }

  // --- Normal panel (in 2x2 grid) ---
  return (
    <div style={{
      backgroundColor: bgColor,
      borderRadius: '8px',
      border: `2px solid ${color}`,
      display: 'flex',
      flexDirection: 'column',
      minHeight: '500px'
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
          <h4 style={{ margin: 0, color, fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>{title}</h4>
          {subtitle && <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{subtitle}</div>}
        </div>
        {renderControls()}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: panelType === 'report' ? '0' : '8px', minHeight: '400px' }}>
        {renderContent('70vh')}
      </div>

      {/* Page navigation */}
      {renderPageNav(color)}

      {/* "Open at print resolution" lightbox — renders ONLY this
          row's source_pages from the bulk PDF, not the whole 130
          pages. */}
      {originalLightboxOpen && hasPageSlice && (
        <OriginalPagesLightbox
          url={currentUrl}
          pageNumbers={document.source_pages}
          title={`${title}${document?.ticket_number ? ' — Ticket #' + document.ticket_number : ''}`}
          defaultRotation={defaultRotation}
          onClose={() => setOriginalLightboxOpen(false)}
        />
      )}
    </div>
  )
}
