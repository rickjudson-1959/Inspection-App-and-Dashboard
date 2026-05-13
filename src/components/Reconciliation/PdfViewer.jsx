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
 * PdfViewer — renders ONE PDF page at a time, sized to fit its
 * container's width exactly.
 *
 * Crispness strategy (May 2026): native PDF viewers (Adobe, Chrome,
 * Safari) render at the display's actual pixel size every time —
 * not at a fixed scale that gets CSS-downsampled. This component
 * does the same:
 *
 *   1. ResizeObserver measures the container's CSS-pixel width.
 *   2. canvas.width buffer = containerWidth × devicePixelRatio × zoom.
 *   3. canvas.style.width = containerWidth × zoom (CSS px).
 *
 * At zoom=1 the canvas fills the container width with NO CSS
 * downsampling — every device pixel comes from a fresh pdf.js
 * raster, identical to opening the PDF in Adobe Reader. Zoom > 1
 * grows the canvas beyond the container; container scrolls.
 *
 *   url       — public URL of the PDF
 *   zoom      — multiplier on the display size; 1 = fit-to-width
 *   rotation  — degrees, 0|90|180|270; passed to pdf.js getViewport
 *   pageList  — optional 1-based page numbers to restrict navigation
 *               (used by the bulk-upload flow where many
 *               reconciliation_documents rows share one source PDF)
 */
export default function PdfViewer({ url, zoom = 1, rotation = 0, pageList = null }) {
  const [allPagesTotal, setAllPagesTotal] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const pdfRef = useRef(null)

  const effectivePageList = (pageList && pageList.length > 0)
    ? Array.from(new Set(pageList.map(n => parseInt(n, 10)).filter(Number.isFinite)))
        .sort((a, b) => a - b)
    : null
  const visibleTotal = effectivePageList ? effectivePageList.length : allPagesTotal
  const currentPdfPage = effectivePageList
    ? effectivePageList[Math.max(0, Math.min(pageIndex, effectivePageList.length - 1))]
    : (pageIndex + 1)

  // Measure the container so we can size the canvas to fit exactly
  // (no CSS downsampling = no blur).
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width
      if (Number.isFinite(w) && w > 0) setContainerWidth(w)
    })
    ro.observe(el)
    // Seed the initial value synchronously — ResizeObserver waits
    // a frame and we don't want the first render to be empty.
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) setContainerWidth(rect.width)
    return () => ro.disconnect()
  }, [])

  const renderPage = useCallback(async (pageNum) => {
    if (!pdfRef.current || !canvasRef.current || !pageNum || !containerWidth) return
    try {
      const page = await pdfRef.current.getPage(pageNum)
      const safeRotation = ((rotation % 360) + 360) % 360

      // Page's natural dimensions at scale=1 — used to compute the
      // fit-to-width factor.
      const naturalViewport = page.getViewport({ scale: 1, rotation: safeRotation })

      // FIXED high-resolution raster — decoupled from `zoom`. The
      // buffer always has enough pixels for ~4× CSS zoom without
      // going blurry. Re-rasterising on every zoom click was the
      // previous bug: at zoom=4 the canvas buffer needed
      // containerWidth × DPR × 4 ≈ 5000+ px which produces a
      // ~140 MB allocation that some browsers silently refuse,
      // leaving an empty canvas (= image vanishes on the + click).
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const fitScale = containerWidth / naturalViewport.width
      const RASTER_HEADROOM = 4   // canvas-pixel headroom for zoom up to 4×
      const renderScale = fitScale * pixelRatio * RASTER_HEADROOM

      const viewport = page.getViewport({ scale: renderScale, rotation: safeRotation })
      const canvas = canvasRef.current
      // Buffer (intrinsic) — high resolution, INDEPENDENT of zoom.
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.maxWidth = 'none'

      // Initial CSS size matches current zoom. The dedicated zoom
      // effect below also sets these on zoom changes without
      // re-rasterising.
      const cssWidth = containerWidth * zoom
      const ar = viewport.height / viewport.width
      canvas.style.width = cssWidth + 'px'
      canvas.style.height = (cssWidth * ar) + 'px'

      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport }).promise
    } catch (err) {
      console.error('PDF render error:', err)
    }
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

  // Heavy: re-rasterise the page on URL / page / rotation / container
  // size changes. Zoom is NOT in this dep list — see the cheap CSS-
  // only zoom effect below.
  useEffect(() => {
    if (!loading && pdfRef.current && currentPdfPage > 0 && containerWidth > 0) {
      renderPage(currentPdfPage)
    }
  }, [currentPdfPage, rotation, loading, containerWidth, renderPage])

  // Cheap: zoom is a CSS-only resize on the already-rasterised
  // canvas. No pdf.js work, no canvas-buffer reallocation. Browser
  // bilinearly stretches the canvas-buffer pixels into the new CSS
  // size; the RASTER_HEADROOM in renderPage guarantees the buffer
  // has enough pixels for sharp output up to ~4× zoom.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !containerWidth || !canvas.width) return
    const cssWidth = containerWidth * zoom
    const ar = canvas.height / canvas.width
    canvas.style.width = cssWidth + 'px'
    canvas.style.height = (cssWidth * ar) + 'px'
  }, [zoom, containerWidth])

  if (error) return <div style={{ padding: 20, color: '#dc2626', fontSize: 13 }}>{error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={containerRef}
        style={{ flex: 1, overflow: 'auto', padding: 4, backgroundColor: '#f3f4f6' }}>
        {loading
          ? <div style={{ padding: 20, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>Loading PDF...</div>
          : <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto' }} />
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
