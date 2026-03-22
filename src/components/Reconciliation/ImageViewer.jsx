import React, { useState, useCallback, useRef, useEffect } from 'react'

export default function ImageViewer({ url, zoom = 1, rotation = 0, onZoomChange, onRotationChange }) {
  // State for internal zoom/rotation if not controlled
  const [internalZoom, setInternalZoom] = useState(zoom)
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef(null)
  const currentZoom = onZoomChange ? zoom : internalZoom

  // Mouse wheel zoom (ctrl/cmd + scroll)
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const newZoom = Math.max(0.5, Math.min(5, currentZoom + (e.deltaY > 0 ? -0.2 : 0.2)))
      if (onZoomChange) onZoomChange(newZoom)
      else setInternalZoom(newZoom)
    }
  }, [currentZoom, onZoomChange])

  useEffect(() => {
    const el = containerRef.current
    if (el) el.addEventListener('wheel', handleWheel, { passive: false })
    return () => { if (el) el.removeEventListener('wheel', handleWheel) }
  }, [handleWheel])

  return (
    <>
      <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab' }}>
        <img
          src={url}
          alt="Document"
          style={{
            maxWidth: `${currentZoom * 100}%`,
            height: 'auto',
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 0.2s, max-width 0.15s',
            cursor: 'pointer'
          }}
          onClick={() => setFullscreen(true)}
        />
      </div>
      {fullscreen && (
        <div onClick={() => setFullscreen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={url} alt="Fullscreen" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', transform: `rotate(${rotation}deg)` }} />
          <div style={{ position: 'absolute', top: 20, right: 20, color: 'white', fontSize: '14px', opacity: 0.7 }}>Click anywhere to close</div>
        </div>
      )}
    </>
  )
}
