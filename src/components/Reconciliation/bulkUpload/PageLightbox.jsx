/**
 * PageLightbox — full-size viewer for a single PDF page.
 *
 * The thumbnail-grid imageBase64 is intentionally low-res (~1.5×
 * scale, 0.8 JPEG quality) for performance with 130-page packages.
 * For the lightbox we re-render the requested page from the source
 * PDF at 3× scale so the admin can actually read it. The low-res
 * thumbnail is shown for the instant between modal-open and the
 * high-res render completing, so there's no blank state.
 *
 * Click outside, ✕, or press Escape to dismiss.
 */
import React, { useEffect, useState } from 'react'

export default function PageLightbox({ page, sourceFile, onClose }) {
  const [hiResUrl, setHiResUrl] = useState(null)
  const [rendering, setRendering] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    async function renderHiRes() {
      // pdf.js was already loaded by the workspace's splitPdfToPages
      // call. Defensive guard in case the user opened a Lightbox in
      // some path that bypassed the splitter.
      if (!sourceFile || !page || !window.pdfjsLib) return
      setRendering(true)
      try {
        const arrayBuffer = await sourceFile.arrayBuffer()
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
        if (cancelled) return
        const pdfPage = await pdf.getPage(page.pageNumber)
        if (cancelled) return
        // 3× base scale with a HiDPI bump (capped at 2). Same logic
        // as the reconciliation PdfViewer so behaviour matches.
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        const scale = 3 * pixelRatio
        const viewport = pdfPage.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        await pdfPage.render({ canvasContext: ctx, viewport }).promise
        if (cancelled) return
        setHiResUrl(canvas.toDataURL('image/jpeg', 0.92))
      } catch (err) {
        console.warn('[PageLightbox] hi-res render failed; falling back to thumbnail:', err.message)
      } finally {
        if (!cancelled) setRendering(false)
      }
    }
    renderHiRes()
    return () => { cancelled = true }
  }, [sourceFile, page?.pageNumber])

  if (!page) return null
  const fallbackSrc = `data:image/jpeg;base64,${page.imageBase64}`
  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: 'white', borderRadius: 8, padding: 14,
          maxWidth: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column'
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>
            Page {page.pageNumber}
            {rendering && !hiResUrl && (
              <span style={{ marginLeft: 8, fontSize: 11, color: '#6b7280', fontWeight: 400 }}>
                · rendering full resolution…
              </span>
            )}
          </h3>
          <button onClick={onClose}
            style={{ padding: '6px 14px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
            ✕ Close
          </button>
        </div>
        <div style={{ overflow: 'auto' }}>
          <img src={hiResUrl || fallbackSrc} alt={`Page ${page.pageNumber}`}
            style={{ maxWidth: '100%', display: 'block' }} />
        </div>
      </div>
    </div>
  )
}
