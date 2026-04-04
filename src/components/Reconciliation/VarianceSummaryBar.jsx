import React from 'react'

/**
 * VarianceSummaryBar — Top-level summary showing totals.
 *
 * When hasLem is true (or not provided for backward compat), shows three cards:
 *   1. Inspector Recorded (green border)
 *   2. LEM Claimed (navy border)
 *   3. Variance (color-coded)
 *
 * When hasLem is false, shows two cards:
 *   1. Inspector Recorded — total calculated cost
 *   2. LEM Status — "Awaiting LEM" badge (gray)
 *
 * Props:
 *   totals — { lemTotal, inspectorTotal, varianceTotal, matchedCount, unmatchedLemCount, unmatchedInspectorCount }
 *   hasLem — boolean, whether LEM data exists for comparison
 */

function formatCurrency(value) {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
  if (value < 0) return `-${formatted}`
  if (value > 0) return `+${formatted}`
  return formatted
}

function formatCurrencyPlain(value) {
  return Math.abs(value).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

function getVarianceBorderColor(variance) {
  const v = Math.abs(variance)
  if (variance < 0) return '#3b82f6'   // blue — overbilled (inspector saw more)
  if (v === 0) return '#16a34a'         // green — exact match
  if (v < 500) return '#d97706'         // amber — minor variance
  return '#dc2626'                      // red — review needed
}

function getVarianceStatusText(variance) {
  const v = Math.abs(variance)
  if (variance < 0) return 'OVERBILLED'
  if (v === 0) return 'MATCH'
  if (v < 500) return 'MINOR'
  return 'REVIEW'
}

function getVarianceStatusColor(variance) {
  const v = Math.abs(variance)
  if (variance < 0) return '#3b82f6'
  if (v === 0) return '#16a34a'
  if (v < 500) return '#d97706'
  return '#dc2626'
}

const cardStyle = {
  flex: 1,
  backgroundColor: 'white',
  borderRadius: '8px',
  padding: '16px 20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const labelStyle = {
  fontSize: '12px',
  fontWeight: '600',
  color: '#6b7280',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
}

const valueStyle = {
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: 1.2,
}

export default function VarianceSummaryBar({ totals, hasLem }) {
  const {
    lemTotal = 0,
    inspectorTotal = 0,
    varianceTotal = 0,
    matchedCount = 0,
    unmatchedLemCount = 0,
    unmatchedInspectorCount = 0,
  } = totals || {}

  // Default hasLem to true for backward compatibility (if lemTotal > 0, assume LEM exists)
  const lemExists = hasLem !== undefined ? hasLem : lemTotal > 0

  if (!lemExists) {
    // ===================================================================
    // INSPECTOR-ONLY MODE — Two cards
    // ===================================================================
    return (
      <div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {/* Card 1: INSPECTOR RECORDED */}
          <div style={{ ...cardStyle, borderTop: '3px solid #16a34a' }}>
            <span style={labelStyle}>Inspector Recorded</span>
            <span style={{ ...valueStyle, color: '#16a34a' }}>
              {formatCurrencyPlain(inspectorTotal)}
            </span>
          </div>

          {/* Card 2: LEM STATUS — awaiting */}
          <div style={{ ...cardStyle, borderTop: '3px solid #9ca3af' }}>
            <span style={labelStyle}>LEM Status</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{
                fontSize: '13px',
                fontWeight: '700',
                color: 'white',
                backgroundColor: '#9ca3af',
                padding: '4px 12px',
                borderRadius: '12px',
                letterSpacing: '0.5px',
              }}>
                AWAITING LEM
              </span>
            </div>
          </div>
        </div>

        {/* Summary text */}
        <div style={{
          marginTop: '8px',
          fontSize: '12px',
          color: '#6b7280',
          textAlign: 'center',
        }}>
          {unmatchedInspectorCount} inspector {unmatchedInspectorCount === 1 ? 'entry' : 'entries'} recorded
        </div>
      </div>
    )
  }

  // ===================================================================
  // COMPARISON MODE — Three cards
  // ===================================================================
  const varianceBorder = getVarianceBorderColor(varianceTotal)
  const varianceStatus = getVarianceStatusText(varianceTotal)
  const varianceStatusColor = getVarianceStatusColor(varianceTotal)

  return (
    <div>
      {/* Three summary cards */}
      <div style={{ display: 'flex', gap: '12px' }}>
        {/* Card 1: INSPECTOR RECORDED */}
        <div style={{ ...cardStyle, borderTop: '3px solid #16a34a' }}>
          <span style={labelStyle}>Inspector Recorded</span>
          <span style={{ ...valueStyle, color: '#16a34a' }}>
            {formatCurrencyPlain(inspectorTotal)}
          </span>
        </div>

        {/* Card 2: LEM CLAIMED */}
        <div style={{ ...cardStyle, borderTop: '3px solid #1e3a5f' }}>
          <span style={labelStyle}>LEM Claimed</span>
          <span style={{ ...valueStyle, color: '#1e3a5f' }}>
            {formatCurrencyPlain(lemTotal)}
          </span>
        </div>

        {/* Card 3: VARIANCE */}
        <div style={{ ...cardStyle, borderTop: `3px solid ${varianceBorder}` }}>
          <span style={labelStyle}>Variance</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ ...valueStyle, color: varianceStatusColor }}>
              {formatCurrency(varianceTotal)}
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: '700',
              color: 'white',
              backgroundColor: varianceStatusColor,
              padding: '2px 8px',
              borderRadius: '10px',
              letterSpacing: '0.5px',
            }}>
              {varianceStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Match summary text */}
      <div style={{
        marginTop: '8px',
        fontSize: '12px',
        color: '#6b7280',
        textAlign: 'center',
      }}>
        {matchedCount} matched | {unmatchedLemCount} LEM-only | {unmatchedInspectorCount} inspector-only
      </div>
    </div>
  )
}
