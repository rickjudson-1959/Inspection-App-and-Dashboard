import React, { useState } from 'react'
import { getVarianceColor, getVarianceIcon } from '../../utils/varianceCalculation.js'
import { getWorkerName, getEquipmentName } from '../../utils/nameMatchingUtils.js'

/**
 * VarianceRow — A single expandable row in the variance comparison table.
 *
 * Props:
 *   result      — one entry from matchWorkers/matchEquipment output:
 *                  { lemEntry, inspectorEntry, confidence, matchMethod, status }
 *   itemType    — 'labour' or 'equipment'
 *   variance    — output from calculateWorkerVariance or calculateEquipmentVariance
 *   onAction    — callback(action, notes) where action is 'accepted'|'disputed'|'adjusted'
 *   savedStatus — current status from DB if already reconciled
 */

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatCurrency(value) {
  return num(value).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

function formatHours(value) {
  return num(value).toFixed(1)
}

function getConfidenceColor(confidence) {
  if (confidence >= 0.9) return '#16a34a'   // green
  if (confidence >= 0.7) return '#d97706'   // yellow/amber
  if (confidence >= 0.5) return '#ea580c'   // orange
  return '#dc2626'                          // red
}

function getMatchMethodLabel(method) {
  switch (method) {
    case 'exact':                      return 'Exact name match'
    case 'last_exact_first_initial':   return 'Last name + first initial match'
    case 'last_exact_first_fuzzy':     return 'Last name exact, first name similar'
    case 'last_exact_nickname':        return 'Last name exact, nickname match'
    case 'last_fuzzy_first_initial':   return 'Last name similar, first initial match'
    case 'reversed_exact':             return 'Reversed name order, exact match'
    case 'reversed_last_first_initial':return 'Reversed name order, last + first initial'
    case 'reversed_last_first_fuzzy':  return 'Reversed name order, first name similar'
    case 'initials_last':              return 'Initials + last name match'
    case 'token_overlap':              return 'Token overlap match'
    case 'none':                       return 'No match found'
    default:                           return method || 'Unknown'
  }
}

function getSavedStatusBadge(status) {
  if (!status) return null
  const styles = {
    accepted: { bg: '#dcfce7', color: '#166534', label: 'Accepted' },
    disputed: { bg: '#fef2f2', color: '#991b1b', label: 'Disputed' },
    adjusted: { bg: '#dbeafe', color: '#1e40af', label: 'Adjusted' },
  }
  const s = styles[status] || { bg: '#f3f4f6', color: '#374151', label: status }
  return (
    <span style={{
      fontSize: '10px',
      fontWeight: '600',
      padding: '2px 6px',
      borderRadius: '8px',
      backgroundColor: s.bg,
      color: s.color,
      textTransform: 'uppercase',
      letterSpacing: '0.3px',
    }}>
      {s.label}
    </span>
  )
}

const cellStyle = {
  padding: '8px 10px',
  fontSize: '12px',
  whiteSpace: 'nowrap',
}

const miniHeaderStyle = {
  padding: '4px 8px',
  fontSize: '11px',
  fontWeight: '600',
  color: '#6b7280',
  textAlign: 'right',
  borderBottom: '1px solid #e5e7eb',
}

const miniCellStyle = {
  padding: '4px 8px',
  fontSize: '12px',
  textAlign: 'right',
  borderBottom: '1px solid #f3f4f6',
}

export default function VarianceRow({ result, itemType, variance, onAction, savedStatus }) {
  const [expanded, setExpanded] = useState(false)
  const [adjustedHours, setAdjustedHours] = useState('')
  const [disputeNotes, setDisputeNotes] = useState('')
  const [showDisputeInput, setShowDisputeInput] = useState(false)
  const [showAdjustInput, setShowAdjustInput] = useState(false)

  if (!result) return null

  const { lemEntry, inspectorEntry, confidence, matchMethod, status } = result

  // Determine display values
  const name = itemType === 'labour'
    ? (getWorkerName(lemEntry) || getWorkerName(inspectorEntry) || 'Unknown')
    : (getEquipmentName(lemEntry) || getEquipmentName(inspectorEntry) || 'Unknown')
  const classification = itemType === 'labour'
    ? (lemEntry?.type || lemEntry?.classification || inspectorEntry?.classification || '-')
    : (lemEntry?.equipment_id || inspectorEntry?.unitNumber || inspectorEntry?.unit_number || '-')

  // Hours and costs
  const lemHoursTotal = variance?.lemHours?.total ?? 0
  const lemCost = variance?.lemCost ?? 0
  const inspectorHoursTotal = variance?.inspectorHours?.total ?? 0
  const varianceCost = variance?.variance?.cost?.total ?? 0

  // Background color based on cost variance
  const bgColor = getVarianceColor(varianceCost)
  const icon = getVarianceIcon(status)

  function handleAccept() {
    if (onAction) onAction('accepted', '')
  }

  function handleDispute() {
    if (showDisputeInput && disputeNotes.trim()) {
      if (onAction) onAction('disputed', disputeNotes.trim())
      setShowDisputeInput(false)
      setDisputeNotes('')
    } else {
      setShowDisputeInput(true)
      setShowAdjustInput(false)
    }
  }

  function handleAdjust() {
    if (showAdjustInput && adjustedHours.trim()) {
      if (onAction) onAction('adjusted', `Adjusted hours: ${adjustedHours}`)
      setShowAdjustInput(false)
      setAdjustedHours('')
    } else {
      setShowAdjustInput(true)
      setShowDisputeInput(false)
    }
  }

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb' }}>
      {/* Collapsed row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr 120px 80px 80px 80px 80px 32px 60px',
          alignItems: 'center',
          backgroundColor: bgColor,
          cursor: 'pointer',
          transition: 'background-color 0.15s ease',
        }}
      >
        {/* Status icon */}
        <div style={{ ...cellStyle, textAlign: 'center', fontSize: '14px' }}>{icon}</div>

        {/* Name */}
        <div style={{ ...cellStyle, fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
          {status === 'lem_only' && (
            <span style={{ marginLeft: 6, fontSize: '10px', color: '#dc2626', fontWeight: '700' }}>LEM ONLY</span>
          )}
          {status === 'inspector_only' && (
            <span style={{ marginLeft: 6, fontSize: '10px', color: '#6b7280', fontWeight: '700' }}>INSPECTOR ONLY</span>
          )}
        </div>

        {/* Classification / Type */}
        <div style={{ ...cellStyle, color: '#6b7280', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {classification}
        </div>

        {/* LEM hours */}
        <div style={{ ...cellStyle, textAlign: 'right', fontWeight: '500' }}>
          {formatHours(lemHoursTotal)}
        </div>

        {/* LEM cost */}
        <div style={{ ...cellStyle, textAlign: 'right', fontWeight: '500' }}>
          {formatCurrency(lemCost)}
        </div>

        {/* Inspector hours */}
        <div style={{ ...cellStyle, textAlign: 'right', fontWeight: '500' }}>
          {formatHours(inspectorHoursTotal)}
        </div>

        {/* Variance cost */}
        <div style={{
          ...cellStyle,
          textAlign: 'right',
          fontWeight: '700',
          color: varianceCost === 0 ? '#16a34a' : varianceCost > 0 ? '#dc2626' : '#3b82f6',
        }}>
          {varianceCost > 0 ? '+' : ''}{formatCurrency(varianceCost)}
        </div>

        {/* Confidence badge */}
        <div style={{ ...cellStyle, textAlign: 'center' }}>
          {status === 'matched' && (
            <span style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: getConfidenceColor(confidence),
            }} title={`${Math.round(confidence * 100)}% confidence`} />
          )}
        </div>

        {/* Saved status badge */}
        <div style={{ ...cellStyle, textAlign: 'center' }}>
          {getSavedStatusBadge(savedStatus)}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fafbfc',
          borderTop: '1px solid #e5e7eb',
          transition: 'all 0.2s ease',
        }}>
          {/* Name comparison */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '12px', fontSize: '12px' }}>
            <div>
              <span style={{ color: '#6b7280' }}>LEM: </span>
              <strong style={{ color: '#1e3a5f' }}>{itemType === 'labour' ? getWorkerName(lemEntry) : getEquipmentName(lemEntry) || 'N/A'}</strong>
            </div>
            <span style={{ color: '#d1d5db' }}>&#8596;</span>
            <div>
              <span style={{ color: '#6b7280' }}>Inspector: </span>
              <strong style={{ color: '#16a34a' }}>{itemType === 'labour' ? getWorkerName(inspectorEntry) : getEquipmentName(inspectorEntry) || 'N/A'}</strong>
            </div>
          </div>

          {/* Match method and confidence */}
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '12px' }}>
            {getMatchMethodLabel(matchMethod)}, {Math.round(confidence * 100)}% confidence
          </div>

          {/* RT/OT/DT breakdown for labour */}
          {itemType === 'labour' && variance && (
            <div style={{ marginBottom: '12px' }}>
              <table style={{ width: '100%', maxWidth: '500px', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ ...miniHeaderStyle, textAlign: 'left' }}>Hour Type</th>
                    <th style={miniHeaderStyle}>LEM Hours</th>
                    <th style={miniHeaderStyle}>Rate</th>
                    <th style={miniHeaderStyle}>LEM Cost</th>
                    <th style={miniHeaderStyle}>Inspector Hours</th>
                    <th style={miniHeaderStyle}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...miniCellStyle, textAlign: 'left', fontWeight: '500' }}>Regular (RT)</td>
                    <td style={miniCellStyle}>{formatHours(variance.lemHours?.rt)}</td>
                    <td style={miniCellStyle}>{formatCurrency(num(lemEntry?.rt_rate))}</td>
                    <td style={miniCellStyle}>{formatCurrency(num(variance.lemHours?.rt) * num(lemEntry?.rt_rate))}</td>
                    <td style={miniCellStyle}>{formatHours(variance.inspectorHours?.rt)}</td>
                    <td style={{ ...miniCellStyle, fontWeight: '600', color: num(variance.variance?.hours?.rt) === 0 ? '#16a34a' : '#dc2626' }}>
                      {num(variance.variance?.hours?.rt) > 0 ? '+' : ''}{formatHours(variance.variance?.hours?.rt)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...miniCellStyle, textAlign: 'left', fontWeight: '500' }}>Overtime (OT)</td>
                    <td style={miniCellStyle}>{formatHours(variance.lemHours?.ot)}</td>
                    <td style={miniCellStyle}>{formatCurrency(num(lemEntry?.ot_rate))}</td>
                    <td style={miniCellStyle}>{formatCurrency(num(variance.lemHours?.ot) * num(lemEntry?.ot_rate))}</td>
                    <td style={miniCellStyle}>{formatHours(variance.inspectorHours?.ot)}</td>
                    <td style={{ ...miniCellStyle, fontWeight: '600', color: num(variance.variance?.hours?.ot) === 0 ? '#16a34a' : '#dc2626' }}>
                      {num(variance.variance?.hours?.ot) > 0 ? '+' : ''}{formatHours(variance.variance?.hours?.ot)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...miniCellStyle, textAlign: 'left', fontWeight: '500' }}>Double Time (DT)</td>
                    <td style={miniCellStyle}>{formatHours(variance.lemHours?.dt)}</td>
                    <td style={miniCellStyle}>{formatCurrency(num(lemEntry?.dt_rate))}</td>
                    <td style={miniCellStyle}>{formatCurrency(num(variance.lemHours?.dt) * num(lemEntry?.dt_rate))}</td>
                    <td style={miniCellStyle}>{formatHours(variance.inspectorHours?.dt)}</td>
                    <td style={{ ...miniCellStyle, fontWeight: '600', color: num(variance.variance?.hours?.dt) === 0 ? '#16a34a' : '#dc2626' }}>
                      {num(variance.variance?.hours?.dt) > 0 ? '+' : ''}{formatHours(variance.variance?.hours?.dt)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f0f0f0' }}>
                    <td style={{ ...miniCellStyle, textAlign: 'left', fontWeight: '700' }}>Total</td>
                    <td style={{ ...miniCellStyle, fontWeight: '700' }}>{formatHours(variance.lemHours?.total)}</td>
                    <td style={miniCellStyle}></td>
                    <td style={{ ...miniCellStyle, fontWeight: '700' }}>{formatCurrency(variance.lemCost)}</td>
                    <td style={{ ...miniCellStyle, fontWeight: '700' }}>{formatHours(variance.inspectorHours?.total)}</td>
                    <td style={{ ...miniCellStyle, fontWeight: '700', color: num(variance.variance?.cost?.total) === 0 ? '#16a34a' : '#dc2626' }}>
                      {formatCurrency(variance.variance?.cost?.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Equipment breakdown */}
          {itemType === 'equipment' && variance && (
            <div style={{ marginBottom: '12px', fontSize: '12px' }}>
              <div style={{ display: 'flex', gap: '32px' }}>
                <div>
                  <span style={{ color: '#6b7280' }}>LEM: </span>
                  <strong>{formatHours(variance.lemHours?.total)} hrs</strong>
                  {lemEntry?.rate && <span style={{ color: '#6b7280' }}> @ {formatCurrency(lemEntry.rate)}/hr</span>}
                  <span> = {formatCurrency(variance.lemCost)}</span>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>Inspector: </span>
                  <strong>{formatHours(variance.inspectorHours?.total)} hrs</strong>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>Variance: </span>
                  <strong style={{ color: num(variance.variance?.cost?.total) === 0 ? '#16a34a' : '#dc2626' }}>
                    {formatCurrency(variance.variance?.cost?.total)}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <button
              onClick={(e) => { e.stopPropagation(); handleAccept(); }}
              style={{
                padding: '6px 16px',
                backgroundColor: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
              }}
            >
              Accept
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); handleDispute(); }}
              style={{
                padding: '6px 16px',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
              }}
            >
              {showDisputeInput ? 'Submit Dispute' : 'Dispute'}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); handleAdjust(); }}
              style={{
                padding: '6px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
              }}
            >
              {showAdjustInput ? 'Submit Adjustment' : 'Adjust'}
            </button>
          </div>

          {/* Dispute notes input */}
          {showDisputeInput && (
            <div style={{ marginTop: '8px' }} onClick={(e) => e.stopPropagation()}>
              <textarea
                value={disputeNotes}
                onChange={(e) => setDisputeNotes(e.target.value)}
                placeholder="Describe the dispute reason..."
                style={{
                  width: '100%',
                  maxWidth: '500px',
                  padding: '8px',
                  border: '1px solid #fca5a5',
                  borderRadius: '4px',
                  fontSize: '12px',
                  minHeight: '60px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          )}

          {/* Adjusted hours input */}
          {showAdjustInput && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
              <label style={{ fontSize: '12px', color: '#374151' }}>Adjusted total hours:</label>
              <input
                type="number"
                step="0.5"
                value={adjustedHours}
                onChange={(e) => setAdjustedHours(e.target.value)}
                placeholder="e.g. 8.0"
                style={{
                  width: '80px',
                  padding: '6px 8px',
                  border: '1px solid #93c5fd',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
