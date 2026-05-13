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

      // Page's natural dimensions (at scale=1) — we need the width
      // to compute what scale puts the page at exactly the
      // container's CSS-pixel width.
      const naturalViewport = page.getViewport({ scale: 1, rotation: safeRotation })

      // Fit-to-width: scale so naturalViewport.width × scale =
      // containerWidth × pixelRatio × zoom. That gives us a canvas
      // BUFFER sized for the display's actual pixels, with zoom
      // physically growing the canvas (scroll-to-pan when zoom > 1).
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const fitScale = containerWidth / naturalViewport.width
      // Floor renderScale at 3× the fit scale even at zoom=1, so the
      // raster has headroom for any CSS transform / browser zoom the
      // admin might layer on top without going blurry.
      const renderScale = Math.max(fitScale * 3, fitScale * pixelRatio * zoom)

      const viewport = page.getViewport({ scale: renderScale, rotation: safeRotation })
      const canvas = canvasRef.current
      // Buffer (intrinsic) — high resolution
      canvas.width = viewport.width
      canvas.height = viewport.height
      // CSS — display size. At zoom=1 this is exactly the container
      // width (with aspect-preserving height). Above zoom=1 the
      // canvas overflows horizontally and the container scrolls.
      const cssWidth = containerWidth * zoom
      const cssHeight = cssWidth * (viewport.height / viewport.width)
      canvas.style.width = cssWidth + 'px'
      canvas.style.height = cssHeight + 'px'
      canvas.style.maxWidth = 'none'  // override any stylesheet defaults

      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport }).promise
    } catch (err) {
      console.error('PDF render error:', err)
    }
  }, [zoom, rotation, containerWidth])

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

  useEffect(() => {
    if (!loading && pdfRef.current && currentPdfPage > 0 && containerWidth > 0) {
      renderPage(currentPdfPage)
    }
  }, [currentPdfPage, zoom, rotation, loading, containerWidth, renderPage])

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
