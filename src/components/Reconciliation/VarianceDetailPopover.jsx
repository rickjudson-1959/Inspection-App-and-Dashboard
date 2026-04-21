import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'

/**
 * VarianceDetailPopover — shows three-line variance detail when a red row is clicked.
 * Anchored below the clicked row. One open at a time.
 *
 * Props:
 *   open (bool)
 *   onClose ()
 *   anchorRect ({ top, left, width, bottom }) — from getBoundingClientRect of the clicked row
 *   variance ({ category, lemSplit, contractSplit, inspectorSplit, ruleDescription, dollarImpact, lemCost, contractCost, lemName })
 *   workerName (string)
 *   classification (string)
 *   onAccept () — accept LEM as-is
 *   onDispute () — dispute, request correction
 */
export default function VarianceDetailPopover({ open, onClose, anchorRect, variance, workerName, classification, onAccept, onDispute }) {
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) onClose()
    }
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open || !variance || !anchorRect) return null

  function fmt(n) { return (n || 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }) }

  function formatSplit(split) {
    if (!split) return '—'
    return `${split.rt_hours || 0} RT  ${split.ot_hours || 0} OT  ${split.dt_hours || 0} DT`
  }

  const categoryLabels = {
    contract_violation: 'Contract violation — LEM split doesn\'t match rules for this date',
    hours_dispute: 'Hours dispute — LEM and inspector disagree on total hours',
    missing_on_lem: 'Missing on LEM — inspector has this entry, LEM doesn\'t',
    ghost_on_lem: 'Ghost on LEM — on LEM but not on inspector report',
  }

  const varianceText = variance.dollarImpact > 0
    ? `LEM overbilled by ${fmt(variance.dollarImpact)}`
    : variance.dollarImpact < 0
      ? `LEM underbilled by ${fmt(Math.abs(variance.dollarImpact))}`
      : 'No dollar variance'

  const popoverContent = (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: Math.min(anchorRect.bottom + 4, window.innerHeight - 320),
        left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - 420)),
        width: 400,
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        zIndex: 15000,
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 14 }}>{workerName || variance.lemName || '—'}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{classification || '—'}</div>
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 16, cursor: 'pointer', color: '#9ca3af', padding: '4px' }}>✕</button>
      </div>

      {/* Three-line comparison */}
      <div style={{ padding: '12px 16px' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '4px 0', color: '#6b7280', width: 110 }}>LEM claimed:</td>
              <td style={{ padding: '4px 0', fontFamily: 'monospace' }}>{formatSplit(variance.lemSplit)}</td>
              <td style={{ padding: '4px 0', textAlign: 'right', color: '#374151' }}>→ {fmt(variance.lemCost)}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 0', color: '#6b7280' }}>Contract rules:</td>
              <td style={{ padding: '4px 0', fontFamily: 'monospace' }}>{formatSplit(variance.contractSplit)}</td>
              <td style={{ padding: '4px 0', textAlign: 'right', color: '#374151' }}>→ {fmt(variance.contractCost)}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 0', color: '#6b7280' }}>Inspector:</td>
              <td style={{ padding: '4px 0', fontFamily: 'monospace' }}>{formatSplit(variance.inspectorSplit)}</td>
              <td style={{ padding: '4px 0', textAlign: 'right', color: '#059669' }}>
                {variance.category !== 'missing_on_lem' && variance.contractSplit &&
                  variance.inspectorSplit?.rt_hours === variance.contractSplit.rt_hours &&
                  variance.inspectorSplit?.ot_hours === variance.contractSplit.ot_hours &&
                  variance.inspectorSplit?.dt_hours === variance.contractSplit.dt_hours
                    ? '✓ matches contract'
                    : `→ ${fmt(variance.contractCost)}`}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Rule description */}
        {variance.ruleDescription && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
            Rule: {variance.ruleDescription}
          </div>
        )}

        {/* Category explanation */}
        <div style={{ marginTop: 8, fontSize: 12, color: '#92400e', fontWeight: 600 }}>
          {categoryLabels[variance.category] || variance.category}
        </div>

        {/* Dollar variance */}
        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: variance.dollarImpact > 0 ? '#dc2626' : variance.dollarImpact < 0 ? '#2563eb' : '#374151' }}>
          Variance: {varianceText}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
        {variance.category !== 'missing_on_lem' && (
          <button
            onClick={() => { if (onAccept) onAccept(); onClose() }}
            style={{ padding: '7px 14px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            Accept LEM as-is
          </button>
        )}
        <button
          onClick={() => { if (onDispute) onDispute(); onClose() }}
          style={{ padding: '7px 14px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          {variance.category === 'missing_on_lem' ? 'Dispute — not on LEM' : 'Dispute — request correction'}
        </button>
      </div>
    </div>
  )

  return ReactDOM.createPortal(popoverContent, document.body)
}
