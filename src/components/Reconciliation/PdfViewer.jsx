import React, { useState, useEffect, useRef, useCallback } from 'react'

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

/**
 * PdfViewer
 *   url       — public URL of the PDF
 *   zoom      — scale multiplier
 *   rotation  — degrees, must be 0|90|180|270. Passed to pdf.js
 *               getViewport so the canvas comes out pre-rotated;
 *               the dimensions auto-swap when rotation is 90 or 270.
 *   pageList  — OPTIONAL. When provided, navigation is constrained to
 *               just these page numbers. Used by the bulk-upload flow
 *               where many reconciliation_documents rows share one
 *               source PDF but each row only "owns" a specific page
 *               slice (source_pages on reconciliation_documents). The
 *               default (null) walks every page of the PDF.
 */
export default function PdfViewer({ url, zoom = 1, rotation = 0, pageList = null }) {
  const [allPagesTotal, setAllPagesTotal] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)  // index into effectivePageList
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const canvasRef = useRef(null)
  const pdfRef = useRef(null)

  // Sanitise pageList: drop falsy / non-numeric / duplicates / out-of-range
  // (out-of-range needs allPagesTotal so we recompute after load).
  const effectivePageList = (pageList && pageList.length > 0)
    ? Array.from(new Set(pageList.map(n => parseInt(n, 10)).filter(Number.isFinite)))
        .sort((a, b) => a - b)
    : null
  const visibleTotal = effectivePageList ? effectivePageList.length : allPagesTotal
  const currentPdfPage = effectivePageList
    ? effectivePageList[Math.max(0, Math.min(pageIndex, effectivePageList.length - 1))]
    : (pageIndex + 1)

  const renderPage = useCallback(async (pageNum) => {
    if (!pdfRef.current || !canvasRef.current || !pageNum) return
    try {
      const page = await pdfRef.current.getPage(pageNum)
      // Normalise rotation to one of 0/90/180/270; pdf.js silently
      // ignores invalid values but we'd rather not surprise it.
      const safeRotation = ((rotation % 360) + 360) % 360
      const viewport = page.getViewport({ scale: 1.5 * zoom, rotation: safeRotation })
      const canvas = canvasRef.current
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport }).promise
    } catch (err) {
      console.error('PDF render error:', err)
    }
  }, [zoom, rotation])

  // Load PDF when URL changes. Reset pageIndex so the viewer starts
  // on the first page of the constrained list (or page 1 if no
  // constraint).
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        await ensurePdfJs()
        const pdf = await window.pdfjsLib.getDocument(url).promise
        if (cancelled) return
        pdfRef.current = pdf
        setAllPagesTotal(pdf.numPages)
        setPageIndex(0)
      } catch (err) {
        if (!cancelled) setError('Failed to load PDF: ' + err.message)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [url])

  // Also reset when pageList changes (different row, same source PDF)
  // so the viewer doesn't get stuck on a stale index.
  useEffect(() => { setPageIndex(0) }, [pageList])

  // Render whenever the effective page, zoom, or rotation changes.
  useEffect(() => {
    if (!loading && pdfRef.current && currentPdfPage > 0) {
      renderPage(currentPdfPage)
    }
  }, [currentPdfPage, zoom, rotation, loading, renderPage])

  if (error) return <div style={{ padding: 20, color: '#dc2626', fontSize: 13 }}>{error}</div>
  if (loading) return <div style={{ padding: 20, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>Loading PDF...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 4 }}>
        <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto' }} />
      </div>
      {visibleTotal > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #e5e7eb', fontSize: 12 }}>
          <button onClick={() => setPageIndex(p => Math.max(0, p - 1))} disabled={pageIndex <= 0}
            style={{ padding: '2px 8px', border: '1px solid #d1d5db', borderRadius: 3, cursor: pageIndex > 0 ? 'pointer' : 'not-allowed', backgroundColor: 'white' }}>&#9664;</button>
          <span style={{ color: '#6b7280' }}>
            Page {pageIndex + 1} of {visibleTotal}
            {effectivePageList && (
              <span style={{ marginLeft: 6, color: '#9ca3af' }}>
                (source #{currentPdfPage} of {allPagesTotal})
              </span>
            )}
          </span>
          <button onClick={() => setPageIndex(p => Math.min(visibleTotal - 1, p + 1))} disabled={pageIndex >= visibleTotal - 1}
            style={{ padding: '2px 8px', border: '1px solid #d1d5db', borderRadius: 3, cursor: pageIndex < visibleTotal - 1 ? 'pointer' : 'not-allowed', backgroundColor: 'white' }}>&#9654;</button>
        </div>
      )}
    </div>
  )
}
