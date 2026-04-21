import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'

/**
 * VarianceDetailPopover — lightweight single-line tooltip explaining why a row is red.
 * Appears on click, closes on click-outside or Escape.
 *
 * Props:
 *   open (bool)
 *   onClose ()
 *   anchorRect ({ top, left, width, bottom })
 *   variance ({ category, lemSplit, contractSplit, inspectorSplit })
 */
export default function VarianceDetailPopover({ open, onClose, anchorRect, variance }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open || !variance || !anchorRect) return null

  function reasonText(v) {
    if (v.category === 'missing_on_lem') return 'This person is on the inspector report but not on the LEM'
    if (v.category === 'ghost_on_lem') return 'This person is on the LEM but not on the inspector report'
    if (v.category === 'unmatched') return 'Name not matched to master'

    const lemTotal = (v.lemSplit?.rt_hours || 0) + (v.lemSplit?.ot_hours || 0) + (v.lemSplit?.dt_hours || 0)
    const inspTotal = (v.inspectorSplit?.rt_hours || 0) + (v.inspectorSplit?.ot_hours || 0) + (v.inspectorSplit?.dt_hours || 0)

    if (v.category === 'hours_dispute') {
      return `LEM shows ${lemTotal} hrs, inspector recorded ${inspTotal} hrs`
    }

    if (v.category === 'contract_violation' && v.contractSplit) {
      const lemRT = v.lemSplit?.rt_hours || 0
      const lemOT = v.lemSplit?.ot_hours || 0
      const cRT = v.contractSplit.rt_hours || 0
      const cOT = v.contractSplit.ot_hours || 0
      return `LEM shows ${lemRT} RT / ${lemOT} OT — should be ${cRT} RT / ${cOT} OT`
    }

    return 'Variance detected between LEM and inspector data'
  }

  const content = (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: Math.min(anchorRect.bottom + 4, window.innerHeight - 40),
        left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - 420)),
        maxWidth: 410,
        padding: '6px 10px',
        backgroundColor: '#1e293b',
        color: '#f1f5f9',
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        zIndex: 15000,
        whiteSpace: 'nowrap',
      }}
    >
      {reasonText(variance)}
    </div>
  )

  return ReactDOM.createPortal(content, document.body)
}
