import React, { useState, useMemo } from 'react'
import ImageViewer from './ImageViewer'
import PdfViewer from './PdfViewer'
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
}) {
  const [currentPage, setCurrentPage] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
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
            <button onClick={() => setZoom(z => Math.min(5, z + 0.3))} title="Zoom in" style={btnBase}>+</button>
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.3))} title="Zoom out" style={btnBase}>-</button>
            <button onClick={() => setZoom(1)} title="Reset zoom" style={{ ...btnBase, fontSize: '10px' }}>1:1</button>
            {!isPdf && (
              <button onClick={() => setRotation(r => (r + 90) % 360)} title="Rotate 90°" style={btnBase}>&#x21BB;</button>
            )}
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

    if (isPdf) {
      return <PdfViewer url={currentUrl} zoom={zoom} />
    }

    return (
      <div style={{ textAlign: 'center' }}>
        <ImageViewer url={currentUrl} zoom={zoom} rotation={rotation} onZoomChange={setZoom} />
      </div>
    )
  }

  // --- Page navigation footer ---
  function renderPageNav(borderColor) {
    if (isPdf || totalPages <= 1) return null
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '6px 0', borderTop: `1px solid ${borderColor}`, fontSize: 12 }}>
        <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage <= 0}
          style={{ padding: '2px 8px', border: '1px solid #d1d5db', borderRadius: 3, cursor: currentPage > 0 ? 'pointer' : 'not-allowed', backgroundColor: 'white' }}>&#9664;</button>
        <span style={{ color: '#6b7280' }}>Page {currentPage + 1} of {totalPages}</span>
        <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}
          style={{ padding: '2px 8px', border: '1px solid #d1d5db', borderRadius: 3, cursor: currentPage < totalPages - 1 ? 'pointer' : 'not-allowed', backgroundColor: 'white' }}>&#9654;</button>
      </div>
    )
  }

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
    </div>
  )
}
