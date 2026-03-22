import React, { useState, useEffect, useRef } from 'react'

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

export default function PdfViewer({ url, zoom = 1 }) {
  const [totalPages, setTotalPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const canvasRef = useRef(null)
  const pdfRef = useRef(null)

  useEffect(() => {
    loadPdf()
  }, [url])

  useEffect(() => {
    if (pdfRef.current && currentPage > 0) renderPage(currentPage)
  }, [currentPage, zoom])

  async function loadPdf() {
    try {
      setLoading(true)
      setError(null)
      await ensurePdfJs()
      const pdf = await window.pdfjsLib.getDocument(url).promise
      pdfRef.current = pdf
      setTotalPages(pdf.numPages)
      setCurrentPage(1)
      await renderPage(1)
    } catch (err) {
      setError('Failed to load PDF: ' + err.message)
    }
    setLoading(false)
  }

  async function renderPage(pageNum) {
    if (!pdfRef.current || !canvasRef.current) return
    try {
      const page = await pdfRef.current.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.5 * zoom })
      const canvas = canvasRef.current
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport }).promise
    } catch (err) {
      console.error('PDF render error:', err)
    }
  }

  if (error) return <div style={{ padding: 20, color: '#dc2626', fontSize: 13 }}>{error}</div>
  if (loading) return <div style={{ padding: 20, color: '#6b7280', fontSize: 13, textAlign: 'center' }}>Loading PDF...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 4 }}>
        <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto' }} />
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #e5e7eb', fontSize: 12 }}>
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
            style={{ padding: '2px 8px', border: '1px solid #d1d5db', borderRadius: 3, cursor: currentPage > 1 ? 'pointer' : 'not-allowed', backgroundColor: 'white' }}>&#9664;</button>
          <span style={{ color: '#6b7280' }}>Page {currentPage} of {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
            style={{ padding: '2px 8px', border: '1px solid #d1d5db', borderRadius: 3, cursor: currentPage < totalPages ? 'pointer' : 'not-allowed', backgroundColor: 'white' }}>&#9654;</button>
        </div>
      )}
    </div>
  )
}
