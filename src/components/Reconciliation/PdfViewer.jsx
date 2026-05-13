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
 * PdfViewer — fit-to-width PDF page rendering with CSS-only zoom.
 *
 * Architecture:
 *   - Canvas is rasterised ONCE per page (or rotation, or major
 *     container size change) at a high fixed scale that has 4×
 *     headroom over fit-to-width.
 *   - Zoom is implemented as `transform: scale(zoom)` on the canvas,
 *     with a wrapping placeholder div sized to (canvasWidth × zoom)
 *     so the scroll container knows to scroll.
 *   - ResizeObserver only re-rasterises if the container width
 *     changes by >= 20 px in either direction. Tiny changes
 *     (scrollbar appearance / disappearance — typically 15 px) are
 *     IGNORED. Otherwise the previous design entered a feedback
 *     loop: zoom > 1 → scrollbar → smaller container → re-render →
 *     buffer cleared mid-display → image disappears.
 *
 * Props:
 *   url       — public URL of the PDF
 *   zoom      — multiplier on the display size (CSS transform)
 *   rotation  — degrees, 0|90|180|270
 *   pageList  — optional 1-based page numbers to restrict navigation
 */
export default function PdfViewer({ url, zoom = 1, rotation = 0, pageList = null }) {
  const [allPagesTotal, setAllPagesTotal] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [canvasDims, setCanvasDims] = useState({ cssWidth: 0, cssHeight: 0 })
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const pdfRef = useRef(null)
  // Track the in-flight pdf.js render so we can cancel it before
  // starting a new one. Without this, rapid state changes (panel
  // resize, page nav, rotation toggle) cause overlapping
  // page.render() calls on the same canvas — pdf.js throws
  // "Cannot use the same canvas during multiple render() operations"
  // and the canvas ends up blank.
  const currentRenderTask = useRef(null)

  const effectivePageList = (pageList && pageList.length > 0)
    ? Array.from(new Set(pageList.map(n => parseInt(n, 10)).filter(Number.isFinite)))
        .sort((a, b) => a - b)
    : null
  const visibleTotal = effectivePageList ? effectivePageList.length : allPagesTotal
  const currentPdfPage = effectivePageList
    ? effectivePageList[Math.max(0, Math.min(pageIndex, effectivePageList.length - 1))]
    : (pageIndex + 1)

  // Track container width. THRESHOLD: ignore changes < 20 px so
  // scrollbar appearance / disappearance (~15 px) does not trigger
  // a re-rasterisation feedback loop. Larger changes (real layout
  // resizes) DO trigger a re-rasterisation.
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const RESIZE_THRESHOLD = 20
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width
      if (!Number.isFinite(w) || w <= 0) return
      setContainerWidth(prev => Math.abs(w - prev) >= RESIZE_THRESHOLD ? w : prev)
    })
    ro.observe(el)
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) setContainerWidth(rect.width)
    return () => ro.disconnect()
  }, [])

  const renderPage = useCallback(async (pageNum) => {
    if (!pdfRef.current || !canvasRef.current || !pageNum || !containerWidth) return

    // CANCEL any in-flight render before starting a new one. Without
    // this, rapid prop / state churn (panel resize, currentPage
    // change, rotation toggle) overlaps render() calls on the same
    // canvas — pdf.js throws "Cannot use the same canvas during
    // multiple render() operations" and the canvas goes blank.
    if (currentRenderTask.current) {
      try { currentRenderTask.current.cancel() } catch (_) { /* idempotent */ }
      currentRenderTask.current = null
    }

    try {
      const page = await pdfRef.current.getPage(pageNum)
      const safeRotation = ((rotation % 360) + 360) % 360
      const naturalViewport = page.getViewport({ scale: 1, rotation: safeRotation })

      // Fixed high-resolution raster — 4× headroom over fit-to-width
      // so CSS-zoom up to 4× stays sharp without re-rasterising.
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const fitScale = containerWidth / naturalViewport.width
      const RASTER_HEADROOM = 4
      const renderScale = fitScale * pixelRatio * RASTER_HEADROOM

      const viewport = page.getViewport({ scale: renderScale, rotation: safeRotation })
      const canvas = canvasRef.current
      canvas.width = viewport.width
      canvas.height = viewport.height

      const cssWidth = containerWidth
      const cssHeight = cssWidth * (viewport.height / viewport.width)
      canvas.style.width = cssWidth + 'px'
      canvas.style.height = cssHeight + 'px'
      canvas.style.transformOrigin = 'top left'
      canvas.style.transform = `scale(${zoom})`
      setCanvasDims({ cssWidth, cssHeight })

      const ctx = canvas.getContext('2d')
      const task = page.render({ canvasContext: ctx, viewport })
      currentRenderTask.current = task
      try {
        await task.promise
      } finally {
        // Clear the ref only if this task is still the current one
        // (another render may have started while we awaited).
        if (currentRenderTask.current === task) currentRenderTask.current = null
      }
    } catch (err) {
      // pdf.js raises a RenderingCancelledException when we cancel
      // an in-flight task; that's not an error condition, swallow.
      if (err?.name !== 'RenderingCancelledException') {
        console.error('PDF render error:', err)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotation, containerWidth])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true); setError(null)
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

  useEffect(() => { setPageIndex(0) }, [pageList])

  // Heavy: re-rasterise on URL / page / rotation / container size
  // changes. Zoom is NOT here.
  useEffect(() => {
    if (!loading && pdfRef.current && currentPdfPage > 0 && containerWidth > 0) {
      renderPage(currentPdfPage)
    }
  }, [currentPdfPage, rotation, loading, containerWidth, renderPage])

  // Cancel any in-flight render on unmount so we don't leak a
  // pdf.js task or write to a stale canvas after React removes it.
  useEffect(() => {
    return () => {
      if (currentRenderTask.current) {
        try { currentRenderTask.current.cancel() } catch (_) { /* ignore */ }
        currentRenderTask.current = null
      }
    }
  }, [])

  // Cheap: zoom is a CSS transform on the already-rasterised canvas.
  // No pdf.js call, no buffer reallocation, can't clear the canvas.
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.style.transform = `scale(${zoom})`
    }
  }, [zoom])

  if (error) return <div style={{ padding: 20, color: '#dc2626', fontSize: 13 }}>{error}</div>

  // Placeholder wrapper takes the SCALED layout size so the scroll
  // container knows how big the content is. Canvas sits inside at
  // unscaled CSS size with a CSS transform applying the zoom.
  const placeholderWidth = canvasDims.cssWidth * zoom
  const placeholderHeight = canvasDims.cssHeight * zoom

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={containerRef}
        style={{ flex: 1, overflow: 'auto', padding: 4, backgroundColor: '#f3f4f6' }}>
        {loading
          ? <div style={{ padding: 20, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>Loading PDF...</div>
          : (
            <div style={{
              width: placeholderWidth ? placeholderWidth + 'px' : '100%',
              height: placeholderHeight ? placeholderHeight + 'px' : 'auto',
              position: 'relative',
              margin: '0 auto'
            }}>
              <canvas ref={canvasRef} style={{ display: 'block', position: 'absolute', top: 0, left: 0 }} />
            </div>
          )
        }
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
