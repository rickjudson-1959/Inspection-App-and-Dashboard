/**
 * ThumbnailGrid — scrolling grid of page thumbnails.
 *
 * Each thumbnail is:
 *  - draggable (HTML5 native; carries selected page numbers OR just
 *    its own page number)
 *  - clickable (opens the lightbox)
 *  - shift-clickable for multi-select
 *  - decorated with the OCR-suggested doc_type badge + foreman/field_log_id
 *    text when available
 *  - dimmed when assigned to a group, with the group's ticket number
 *    shown as an overlay so it's obvious which pages are unsorted
 */
import React from 'react'

const DOC_TYPE_BADGE = {
  lem:           { bg: '#dbeafe', fg: '#1e40af', label: 'LEM' },
  daily_ticket:  { bg: '#dcfce7', fg: '#166534', label: 'TKT' },
  signature:     { bg: '#e5e7eb', fg: '#374151', label: 'SIG' },
  summary:       { bg: '#fef3c7', fg: '#92400e', label: 'SUM' },
  index:         { bg: '#ede9fe', fg: '#5b21b6', label: 'IDX' },
  unknown:       { bg: '#fee2e2', fg: '#991b1b', label: '?'   }
}

export default function ThumbnailGrid({
  pages,                  // [{ pageNumber, imageBase64 }]
  pageMetadata,           // Map<pageNumber, { doc_type, foreman_name, field_log_id, ocrStatus }>
  pageGroupMap,           // Map<pageNumber, { groupId, ticketNumber, foremanName, slot }>
  selectedPageNumbers,    // Set<number>
  onTogglePage,           // (pageNumber, shiftKey) => void
  onOpenLightbox,         // (page) => void
  onDragStartPages        // (pageNumbers) => DataTransfer payload
}) {
  if (!pages || pages.length === 0) return null

  const handleDragStart = (e, pageNumber) => {
    // If the page is part of the current selection, drag all of them.
    // Otherwise drag just this page.
    const inSelection = selectedPageNumbers.has(pageNumber)
    const payload = inSelection ? Array.from(selectedPageNumbers).sort((a, b) => a - b) : [pageNumber]
    onDragStartPages?.(payload, e)
    e.dataTransfer.setData('application/json', JSON.stringify({ pageNumbers: payload }))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
      gap: 10,
      padding: 12,
      backgroundColor: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: 6
    }}>
      {pages.map(p => {
        const meta = pageMetadata?.get(p.pageNumber)
        const docType = meta?.doc_type || 'unknown'
        const badge = DOC_TYPE_BADGE[docType] || DOC_TYPE_BADGE.unknown
        const inSel = selectedPageNumbers.has(p.pageNumber)
        const groupInfo = pageGroupMap?.get(p.pageNumber)

        return (
          <div key={p.pageNumber}
            id={`page-thumb-${p.pageNumber}`}
            draggable
            onDragStart={(e) => handleDragStart(e, p.pageNumber)}
            onClick={(e) => {
              if (e.shiftKey || e.metaKey || e.ctrlKey) onTogglePage(p.pageNumber, true)
              else onOpenLightbox(p)
            }}
            onContextMenu={(e) => { e.preventDefault(); onTogglePage(p.pageNumber, true) }}
            style={{
              position: 'relative',
              backgroundColor: 'white',
              border: `2px solid ${inSel ? '#2563eb' : '#d1d5db'}`,
              borderRadius: 6,
              padding: 4,
              cursor: 'grab',
              userSelect: 'none',
              opacity: groupInfo ? 0.55 : 1,
              boxShadow: inSel ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none'
            }}>
            <img src={`data:image/jpeg;base64,${p.imageBase64}`}
              alt={`Page ${p.pageNumber}`}
              style={{ width: '100%', display: 'block', borderRadius: 3, pointerEvents: 'none' }} />

            {/* Page number badge */}
            <div style={{
              position: 'absolute', top: 6, left: 6,
              padding: '1px 6px', borderRadius: 4,
              backgroundColor: 'rgba(17,24,39,0.78)', color: 'white',
              fontSize: 11, fontWeight: 600
            }}>{p.pageNumber}</div>

            {/* OCR suggestion badge */}
            {meta?.ocrStatus === 'done' && (
              <div title={`Suggested doc type: ${docType}`}
                style={{
                  position: 'absolute', top: 6, right: 6,
                  padding: '1px 6px', borderRadius: 4,
                  backgroundColor: badge.bg, color: badge.fg,
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.4
                }}>{badge.label}</div>
            )}
            {meta?.ocrStatus === 'running' && (
              <div style={{
                position: 'absolute', top: 6, right: 6,
                padding: '1px 6px', borderRadius: 4,
                backgroundColor: '#fef3c7', color: '#92400e',
                fontSize: 10, fontWeight: 700
              }}>OCR…</div>
            )}

            {/* Suggestion text (foreman / field_log_id) */}
            {meta?.ocrStatus === 'done' && (meta.foreman_name || meta.field_log_id) && (
              <div style={{
                fontSize: 10, color: '#4b5563',
                padding: '4px 4px 0',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }} title={`${meta.foreman_name || ''} ${meta.field_log_id ? '#' + meta.field_log_id : ''}`}>
                {meta.foreman_name && <span style={{ fontWeight: 600 }}>{meta.foreman_name}</span>}
                {meta.field_log_id && <span style={{ marginLeft: 4, color: '#6b21a8' }}>#{meta.field_log_id}</span>}
              </div>
            )}

            {/* Group assignment overlay */}
            {groupInfo && (
              <div style={{
                position: 'absolute', bottom: 4, left: 4, right: 4,
                padding: '2px 4px', borderRadius: 3,
                backgroundColor: 'rgba(22,163,74,0.92)', color: 'white',
                fontSize: 10, fontWeight: 600,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                ✓ #{groupInfo.ticketNumber || '?'} ({groupInfo.slot})
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
