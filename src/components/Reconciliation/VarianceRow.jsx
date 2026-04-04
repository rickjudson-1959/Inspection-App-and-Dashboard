import React, { useState } from 'react'
import { getVarianceColor, getVarianceIcon } from '../../utils/varianceCalculation.js'
import { getWorkerName, getEquipmentName } from '../../utils/nameMatchingUtils.js'

/**
 * VarianceRow — A single expandable row in the variance comparison table.
 * Inspector side is editable so admins can correct names, hours, and classifications.
 *
 * Props:
 *   result           — { lemEntry, inspectorEntry, confidence, matchMethod, status }
 *   itemType         — 'labour' or 'equipment'
 *   variance         — from calculateWorkerVariance or calculateEquipmentVariance
 *   onAction         — callback(action, notes) where action is 'accepted'|'disputed'|'adjusted'
 *   onInspectorEdit  — callback(field, value) called when admin edits inspector data
 *   savedStatus      — current status from DB if already reconciled
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
  if (confidence >= 0.9) return '#16a34a'
  if (confidence >= 0.7) return '#d97706'
  if (confidence >= 0.5) return '#ea580c'
  return '#dc2626'
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

// Compact input style for editable inspector fields
const inputStyle = {
  padding: '4px 6px',
  fontSize: '12px',
  border: '1px solid #d1d5db',
  borderRadius: '3px',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

const numberInputStyle = {
  ...inputStyle,
  width: '72px',
  textAlign: 'right',
}

const labelStyle = {
  fontSize: '11px',
  color: '#6b7280',
  marginBottom: '2px',
  fontWeight: '500',
}

const valueStyle = {
  fontSize: '12px',
  fontWeight: '600',
  color: '#1e3a5f',
}

export default function VarianceRow({ result, itemType, variance, onAction, onInspectorEdit, savedStatus }) {
  const [expanded, setExpanded] = useState(false)

  // Editable inspector fields for labour
  const [editedName, setEditedName] = useState(null)
  const [editedClassification, setEditedClassification] = useState(null)
  const [editedRT, setEditedRT] = useState(null)
  const [editedOT, setEditedOT] = useState(null)
  const [editedDT, setEditedDT] = useState(null)

  // Editable inspector fields for equipment
  const [editedHours, setEditedHours] = useState(null)
  const [editedType, setEditedType] = useState(null)
  const [editedUnitNumber, setEditedUnitNumber] = useState(null)

  // Action state
  const [disputeNotes, setDisputeNotes] = useState('')
  const [showDisputeInput, setShowDisputeInput] = useState(false)

  if (!result) return null

  const { lemEntry, inspectorEntry, confidence, matchMethod, status } = result

  // Determine display values for collapsed row
  const name = itemType === 'labour'
    ? (getWorkerName(lemEntry) || getWorkerName(inspectorEntry) || 'Unknown')
    : (getEquipmentName(lemEntry) || getEquipmentName(inspectorEntry) || 'Unknown')
  const classification = itemType === 'labour'
    ? (lemEntry?.type || lemEntry?.classification || inspectorEntry?.classification || '-')
    : (lemEntry?.equipment_id || inspectorEntry?.unitNumber || inspectorEntry?.unit_number || '-')

  // Hours and costs from variance
  const lemHoursTotal = variance?.lemHours?.total ?? 0
  const lemCost = variance?.lemCost ?? 0
  const inspectorHoursTotal = variance?.inspectorHours?.total ?? 0
  const varianceCost = variance?.variance?.cost?.total ?? 0

  // Background color based on cost variance
  const bgColor = getVarianceColor(varianceCost)
  const icon = getVarianceIcon(status)

  // --- Inspector current values (from entry or edits) ---
  const inspectorName = itemType === 'labour'
    ? (getWorkerName(inspectorEntry) || '')
    : (getEquipmentName(inspectorEntry) || '')
  const inspectorClassification = inspectorEntry?.classification || inspectorEntry?.type || ''

  // Labour hours from inspector
  const inspRT = num(inspectorEntry?.rtHours ?? inspectorEntry?.rt_hours ?? inspectorEntry?.rt ?? inspectorEntry?.hours ?? inspectorEntry?.jh ?? 0)
  const inspOT = num(inspectorEntry?.otHours ?? inspectorEntry?.ot_hours ?? inspectorEntry?.ot ?? 0)
  const inspDT = num(inspectorEntry?.dtHours ?? inspectorEntry?.dt_hours ?? inspectorEntry?.dt ?? 0)

  // Equipment fields from inspector
  const inspEquipType = inspectorEntry?.type || inspectorEntry?.equipment_type || ''
  const inspUnitNumber = inspectorEntry?.unitNumber || inspectorEntry?.unit_number || ''
  const inspEquipHours = num(inspectorEntry?.hours ?? inspectorEntry?.totalHours ?? 0)

  // --- Current display values (edited or original) ---
  const currentName = editedName !== null ? editedName : inspectorName
  const currentClassification = editedClassification !== null ? editedClassification : inspectorClassification
  const currentRT = editedRT !== null ? editedRT : String(inspRT)
  const currentOT = editedOT !== null ? editedOT : String(inspOT)
  const currentDT = editedDT !== null ? editedDT : String(inspDT)
  const currentEquipType = editedType !== null ? editedType : inspEquipType
  const currentUnitNumber = editedUnitNumber !== null ? editedUnitNumber : inspUnitNumber
  const currentEquipHours = editedHours !== null ? editedHours : String(inspEquipHours)

  // --- LEM values for display ---
  const lemName = itemType === 'labour'
    ? (getWorkerName(lemEntry) || 'N/A')
    : (getEquipmentName(lemEntry) || 'N/A')
  const lemClassification = lemEntry?.type || lemEntry?.classification || '-'
  const lemRT = num(lemEntry?.rt_hours ?? lemEntry?.rt ?? 0)
  const lemOT = num(lemEntry?.ot_hours ?? lemEntry?.ot ?? 0)
  const lemDT = num(lemEntry?.dt_hours ?? lemEntry?.dt ?? 0)
  const lemRTRate = num(lemEntry?.rt_rate)
  const lemOTRate = num(lemEntry?.ot_rate)
  const lemDTRate = num(lemEntry?.dt_rate)
  const lemEquipType = lemEntry?.type || lemEntry?.equipment_type || '-'
  const lemUnitNumber = lemEntry?.equipment_id || lemEntry?.unit_number || '-'
  const lemEquipHours = num(lemEntry?.hours ?? lemEntry?.totalHours ?? 0)
  const lemEquipRate = num(lemEntry?.rate)

  // Calculate inspector cost for labour using LEM rates
  const inspectorCostCalc = itemType === 'labour'
    ? (num(currentRT) * lemRTRate) + (num(currentOT) * lemOTRate) + (num(currentDT) * lemDTRate)
    : num(currentEquipHours) * lemEquipRate
  const varianceCalc = lemCost - inspectorCostCalc

  // --- Dirty check ---
  const isDirty = itemType === 'labour'
    ? (editedName !== null || editedClassification !== null || editedRT !== null || editedOT !== null || editedDT !== null)
    : (editedType !== null || editedUnitNumber !== null || editedHours !== null || editedName !== null || editedClassification !== null)

  // --- Handlers ---

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
    }
  }

  function handleSaveChanges() {
    if (!onInspectorEdit) return

    if (itemType === 'labour') {
      if (editedName !== null) onInspectorEdit('name', editedName)
      if (editedClassification !== null) onInspectorEdit('classification', editedClassification)
      if (editedRT !== null) onInspectorEdit('rt', num(editedRT))
      if (editedOT !== null) onInspectorEdit('ot', num(editedOT))
      if (editedDT !== null) onInspectorEdit('dt', num(editedDT))
    } else {
      if (editedName !== null) onInspectorEdit('name', editedName)
      if (editedType !== null) onInspectorEdit('type', editedType)
      if (editedUnitNumber !== null) onInspectorEdit('unitNumber', editedUnitNumber)
      if (editedHours !== null) onInspectorEdit('hours', num(editedHours))
    }

    // Reset edited state after save
    setEditedName(null)
    setEditedClassification(null)
    setEditedRT(null)
    setEditedOT(null)
    setEditedDT(null)
    setEditedHours(null)
    setEditedType(null)
    setEditedUnitNumber(null)
  }

  // --- Match info line ---
  const matchInfoText = status === 'lem_only'
    ? 'NO MATCH \u2014 LEM only'
    : status === 'inspector_only'
      ? 'NO MATCH \u2014 Inspector only'
      : `Matched: ${getMatchMethodLabel(matchMethod)} (${Math.round(confidence * 100)}% confidence)`
  const matchInfoColor = (status === 'lem_only' || status === 'inspector_only') ? '#dc2626' : '#6b7280'

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
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#fafbfc',
            borderTop: '1px solid #e5e7eb',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Side-by-side comparison */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '12px',
          }}>
            {/* LEM side (read-only) */}
            <div style={{
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              padding: '12px',
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: '700',
                color: '#1e40af',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '10px',
                paddingBottom: '6px',
                borderBottom: '1px solid #bfdbfe',
              }}>
                LEM (Contractor)
              </div>

              {itemType === 'labour' ? (
                <>
                  {/* Labour LEM fields */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={labelStyle}>Name</div>
                    <div style={valueStyle}>{lemName}</div>
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={labelStyle}>Classification</div>
                    <div style={valueStyle}>{lemClassification}</div>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <div>
                      <div style={labelStyle}>RT Hours</div>
                      <div style={valueStyle}>{formatHours(lemRT)}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>OT Hours</div>
                      <div style={valueStyle}>{formatHours(lemOT)}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>DT Hours</div>
                      <div style={valueStyle}>{formatHours(lemDT)}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <div style={labelStyle}>Rate</div>
                    <div style={{ fontSize: '11px', color: '#374151' }}>
                      {formatCurrency(lemRTRate)} RT
                      {lemOTRate > 0 && <> / {formatCurrency(lemOTRate)} OT</>}
                      {lemDTRate > 0 && <> / {formatCurrency(lemDTRate)} DT</>}
                    </div>
                  </div>
                  <div>
                    <div style={labelStyle}>LEM Cost</div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e3a5f' }}>
                      {formatCurrency(lemCost)}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Equipment LEM fields */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={labelStyle}>Type</div>
                    <div style={valueStyle}>{lemEquipType}</div>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={labelStyle}>Unit #</div>
                    <div style={valueStyle}>{lemUnitNumber}</div>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={labelStyle}>Hours</div>
                    <div style={valueStyle}>{formatHours(lemEquipHours)}</div>
                  </div>
                  {lemEquipRate > 0 && (
                    <div style={{ marginBottom: '6px' }}>
                      <div style={labelStyle}>Rate</div>
                      <div style={{ fontSize: '11px', color: '#374151' }}>
                        {formatCurrency(lemEquipRate)}/hr
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={labelStyle}>LEM Cost</div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e3a5f' }}>
                      {formatCurrency(lemCost)}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Inspector side (EDITABLE) */}
            <div style={{
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
              padding: '12px',
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: '700',
                color: '#166534',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '10px',
                paddingBottom: '6px',
                borderBottom: '1px solid #bbf7d0',
              }}>
                Inspector (Editable)
              </div>

              {itemType === 'labour' ? (
                <>
                  {/* Labour inspector editable fields */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={labelStyle}>Name</div>
                    <input
                      type="text"
                      value={currentName}
                      onChange={(e) => setEditedName(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={labelStyle}>Classification</div>
                    <input
                      type="text"
                      value={currentClassification}
                      onChange={(e) => setEditedClassification(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <div>
                      <div style={labelStyle}>RT Hours</div>
                      <input
                        type="number"
                        step="0.5"
                        value={currentRT}
                        onChange={(e) => setEditedRT(e.target.value)}
                        style={numberInputStyle}
                      />
                    </div>
                    <div>
                      <div style={labelStyle}>OT Hours</div>
                      <input
                        type="number"
                        step="0.5"
                        value={currentOT}
                        onChange={(e) => setEditedOT(e.target.value)}
                        style={numberInputStyle}
                      />
                    </div>
                    <div>
                      <div style={labelStyle}>DT Hours</div>
                      <input
                        type="number"
                        step="0.5"
                        value={currentDT}
                        onChange={(e) => setEditedDT(e.target.value)}
                        style={numberInputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <div style={labelStyle}>Inspector Cost (at LEM rates)</div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#166534' }}>
                      {formatCurrency(inspectorCostCalc)}
                    </div>
                  </div>
                  <div>
                    <div style={labelStyle}>Variance</div>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: varianceCalc === 0 ? '#16a34a' : varianceCalc > 0 ? '#dc2626' : '#3b82f6',
                    }}>
                      {varianceCalc > 0 ? '+' : ''}{formatCurrency(varianceCalc)}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Equipment inspector editable fields */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={labelStyle}>Type</div>
                    <input
                      type="text"
                      value={currentEquipType}
                      onChange={(e) => setEditedType(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={labelStyle}>Unit #</div>
                    <input
                      type="text"
                      value={currentUnitNumber}
                      onChange={(e) => setEditedUnitNumber(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={labelStyle}>Hours</div>
                    <input
                      type="number"
                      step="0.5"
                      value={currentEquipHours}
                      onChange={(e) => setEditedHours(e.target.value)}
                      style={numberInputStyle}
                    />
                  </div>
                  <div>
                    <div style={labelStyle}>Variance</div>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: varianceCalc === 0 ? '#16a34a' : varianceCalc > 0 ? '#dc2626' : '#3b82f6',
                    }}>
                      {varianceCalc > 0 ? '+' : ''}{formatCurrency(varianceCalc)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Match info line */}
          <div style={{
            fontSize: '11px',
            color: matchInfoColor,
            marginBottom: '12px',
            fontWeight: (status === 'lem_only' || status === 'inspector_only') ? '700' : '400',
          }}>
            {matchInfoText}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <button
              onClick={handleAccept}
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
              onClick={handleDispute}
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

            {isDirty && (
              <button
                onClick={handleSaveChanges}
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
                Save Changes
              </button>
            )}
          </div>

          {/* Dispute notes input */}
          {showDisputeInput && (
            <div style={{ marginTop: '8px' }}>
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
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
