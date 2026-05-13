/**
 * OriginalPagesLightbox — full-quality viewer for a specific page
 * slice within a (possibly large) source PDF.
 *
 * Used by the four-panel reconciliation view's "↗ Open" button.
 * The bulk-upload flow writes one reconciliation_documents row per
 * group, all sharing a single source PDF, with `source_pages = [n,
 * n, ...]` identifying which pages belong to the row. This modal
 * loads the PDF and renders ONLY those pages at print resolution
 * (~288 DPI). The admin never sees the other 128 pages of the
 * shared source.
 *
 * Props:
 *   url          — the source PDF URL
 *   pageNumbers  — 1-based page numbers to render (e.g. [98, 99])
 *   title        — header text, e.g. "Contractor LEM — Ticket #18284"
 *   onClose      — dismiss handler
 */
import React, { useEffect, useState, useRef } from 'react'

async function ensurePdfJs() {
  if (window.pdfjsLib) return
  await new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = resolve
    script.onerror = () => reject(new Error('Failed to load PDF.js'))
    document.head.appendChild(script)
  })
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
}

export default function OriginalPagesLightbox({ url, pageNumbers, title, onClose, defaultRotation = 0 }) {
  const [renderedPages, setRenderedPages] = useState([]) // [{ pageNumber, dataUrl }]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rotation, setRotation] = useState(defaultRotation)
  const pdfRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null); setRenderedPages([])
      try {
        await ensurePdfJs()
        if (cancelled) return
        const pdf = await window.pdfjsLib.getDocument(url).promise
        if (cancelled) return
        pdfRef.current = pdf

        // De-dup + sort the requested page numbers; filter out
        // anything outside the PDF's valid range.
        const wanted = Array.from(new Set(
          (pageNumbers || []).map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n >= 1 && n <= pdf.numPages)
        )).sort((a, b) => a - b)

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        const safeRotation = ((rotation % 360) + 360) % 360
        const scale = 4 * pixelRatio  // print-resolution

        const out = []
        for (const pageNumber of wanted) {
          if (cancelled) return
          const pdfPage = await pdf.getPage(pageNumber)
          const viewport = pdfPage.getViewport({ scale, rotation: safeRotation })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')
          await pdfPage.render({ canvasContext: ctx, viewport }).promise
          if (cancelled) return
          out.push({ pageNumber, dataUrl: canvas.toDataURL('image/jpeg', 0.95) })
          // Update incrementally so the first page appears while the
          // rest of the slice is still rendering.
          setRenderedPages([...out])
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load PDF')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // rotation deliberately not in deps — toggled via the in-modal
    // button which only re-renders the page images (cheap re-rendering
    // would need a separate effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, JSON.stringify(pageNumbers)])

  const handleRotate = async () => {
    if (!pdfRef.current) return
    const nextRotation = (rotation + 90) % 360
    setRotation(nextRotation)
    setLoading(true); setRenderedPages([])
    try {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const scale = 4 * pixelRatio
      const wanted = Array.from(new Set((pageNumbers || []).map(n => parseInt(n, 10))
        .filter(n => Number.isFinite(n) && n >= 1 && n <= pdfRef.current.numPages))).sort((a, b) => a - b)
      const out = []
      for (const pageNumber of wanted) {
        const pdfPage = await pdfRef.current.getPage(pageNumber)
        const viewport = pdfPage.getViewport({ scale, rotation: nextRotation })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        await pdfPage.render({ canvasContext: ctx, viewport }).promise
        out.push({ pageNumber, dataUrl: canvas.toDataURL('image/jpeg', 0.95) })
        setRenderedPages([...out])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = (page) => {
    const a = document.createElement('a')
    a.href = page.dataUrl
    a.download = `page-${page.pageNumber}.jpg`
    a.click()
  }

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 10200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: 'white', borderRadius: 8, padding: 14,
          maxWidth: '95vw', maxHeight: '92vh', minWidth: 320,
          display: 'flex', flexDirection: 'column'
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: '#111827' }}>
            {title || 'Document'}
            {pageNumbers?.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280', fontWeight: 400 }}>
                · {pageNumbers.length} page{pageNumbers.length === 1 ? '' : 's'}
                {' '}({pageNumbers.join(', ')})
              </span>
            )}
            {loading && (
              <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                rendering at print resolution… ({renderedPages.length}/{pageNumbers?.length || '?'})
              </span>
            )}
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleRotate} disabled={loading}
              title="Rotate 90°"
              style={{ padding: '4px 10px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: loading ? 'wait' : 'pointer', fontSize: 13 }}>
              ↻ Rotate
            </button>
            <button onClick={onClose}
              style={{ padding: '6px 14px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>
              ✕ Close
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: 14, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14, padding: '6px 0' }}>
          {renderedPages.map((p) => (
            <div key={p.pageNumber}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                <span>Source page #{p.pageNumber}</span>
                <button onClick={() => handleDownload(p)}
                  title="Download this page as image"
                  style={{ padding: '2px 8px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
                  ↓ Save image
                </button>
              </div>
              <img src={p.dataUrl} alt={`Page ${p.pageNumber}`}
                style={{ maxWidth: '100%', display: 'block', border: '1px solid #e5e7eb', borderRadius: 4 }} />
            </div>
          ))}
          {loading && renderedPages.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
              Loading PDF…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
