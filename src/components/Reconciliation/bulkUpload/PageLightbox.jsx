/**
 * PageLightbox — full-size viewer for a single rendered PDF page.
 * Click outside the image (or the close button) to dismiss.
 */
import React, { useEffect } from 'react'

export default function PageLightbox({ page, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!page) return null
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
          <h3 style={{ margin: 0, fontSize: 14 }}>Page {page.pageNumber}</h3>
          <button onClick={onClose}
            style={{ padding: '6px 14px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
            ✕ Close
          </button>
        </div>
        <div style={{ overflow: 'auto' }}>
          <img src={`data:image/jpeg;base64,${page.imageBase64}`} alt={`Page ${page.pageNumber}`}
            style={{ maxWidth: '100%', display: 'block' }} />
        </div>
      </div>
    </div>
  )
}
