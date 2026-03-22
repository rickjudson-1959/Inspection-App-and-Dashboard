import React, { useState, useEffect, useCallback } from 'react'
import { matchWorkers, matchEquipment } from '../../utils/nameMatchingUtils.js'
import {
  calculateWorkerVariance,
  calculateEquipmentVariance,
  calculateTotals,
} from '../../utils/varianceCalculation.js'
import VarianceSummaryBar from './VarianceSummaryBar.jsx'
import VarianceRow from './VarianceRow.jsx'
import { supabase } from '../../supabase'

/**
 * VarianceComparisonPanel — Main variance comparison panel that goes below
 * the 4-panel document viewer.
 *
 * Props:
 *   ticketNumber    — string
 *   lemData         — contractor_lems row (with labour_entries, equipment_entries)
 *   inspectorBlock  — activity_blocks entry (with labourEntries, equipmentEntries)
 *   organizationId  — for DB operations
 */

const sectionHeaderStyle = {
  padding: '10px 16px',
  fontSize: '13px',
  fontWeight: '700',
  color: '#1e3a5f',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  backgroundColor: '#f8fafc',
  borderBottom: '2px solid #1e3a5f',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const tableHeaderStyle = {
  display: 'grid',
  gridTemplateColumns: '32px 1fr 120px 80px 80px 80px 80px 32px 60px',
  alignItems: 'center',
  backgroundColor: '#f1f5f9',
  borderBottom: '1px solid #cbd5e1',
  fontSize: '11px',
  fontWeight: '600',
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
}

const thCell = {
  padding: '6px 10px',
}

export default function VarianceComparisonPanel({ ticketNumber, lemData, inspectorBlock, organizationId }) {
  const [labourResults, setLabourResults] = useState([])
  const [labourVariances, setLabourVariances] = useState([])
  const [equipmentResults, setEquipmentResults] = useState([])
  const [equipmentVariances, setEquipmentVariances] = useState([])
  const [totals, setTotals] = useState(null)
  const [savedStatuses, setSavedStatuses] = useState({}) // keyed by `${type}-${index}`
  const [processing, setProcessing] = useState(false)

  // Load existing reconciliation line items from DB
  const loadSavedStatuses = useCallback(async () => {
    if (!ticketNumber || !organizationId) return

    const { data } = await supabase
      .from('reconciliation_line_items')
      .select('item_key, status')
      .eq('ticket_number', ticketNumber)
      .eq('organization_id', organizationId)

    if (data) {
      const map = {}
      for (const row of data) {
        map[row.item_key] = row.status
      }
      setSavedStatuses(map)
    }
  }, [ticketNumber, organizationId])

  // Run matching and variance calculations on mount or data change
  useEffect(() => {
    if (!lemData && !inspectorBlock) return

    const lemLabour = lemData?.labour_entries || []
    const inspLabour = inspectorBlock?.labourEntries || []
    const lemEquip = lemData?.equipment_entries || []
    const inspEquip = inspectorBlock?.equipmentEntries || []

    // Match workers
    const workerMatches = matchWorkers(lemLabour, inspLabour)
    setLabourResults(workerMatches)

    // Calculate variance for each worker match
    const workerVars = workerMatches.map(match =>
      calculateWorkerVariance(match.lemEntry, match.inspectorEntry)
    )
    setLabourVariances(workerVars)

    // Match equipment
    const equipMatches = matchEquipment(lemEquip, inspEquip)
    setEquipmentResults(equipMatches)

    // Calculate variance for each equipment match
    const equipVars = equipMatches.map(match =>
      calculateEquipmentVariance(match.lemEntry, match.inspectorEntry)
    )
    setEquipmentVariances(equipVars)

    // Combine all variances for totals calculation
    const allVariances = [...workerVars, ...equipVars]
    const combinedResults = allVariances.map((v, i) => ({
      lemCost: v.lemCost,
      variance: v.variance,
      status: i < workerVars.length
        ? workerMatches[i]?.status
        : equipMatches[i - workerVars.length]?.status,
    }))
    setTotals(calculateTotals(combinedResults))

    // Load saved statuses
    loadSavedStatuses()
  }, [lemData, inspectorBlock, loadSavedStatuses])

  // Handle accept/dispute/adjust action for a line item
  async function handleAction(itemType, index, action, notes) {
    const itemKey = `${itemType}-${index}`
    setProcessing(true)

    try {
      // Determine the entry details for audit logging
      const result = itemType === 'labour' ? labourResults[index] : equipmentResults[index]
      const variance = itemType === 'labour' ? labourVariances[index] : equipmentVariances[index]
      const entryName = result?.lemEntry?.name || result?.inspectorEntry?.name || 'Unknown'

      // Upsert into reconciliation_line_items
      const { error: upsertError } = await supabase
        .from('reconciliation_line_items')
        .upsert({
          ticket_number: ticketNumber,
          organization_id: organizationId,
          item_key: itemKey,
          item_type: itemType,
          item_name: entryName,
          status: action,
          notes: notes || null,
          lem_cost: variance?.lemCost ?? 0,
          variance_cost: variance?.variance?.cost?.total ?? 0,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'ticket_number,organization_id,item_key',
        })

      if (upsertError) {
        console.error('Failed to save reconciliation status:', upsertError)
      }

      // Audit log
      await supabase.from('report_audit_log').insert({
        organization_id: organizationId,
        action: `reconciliation_${action}`,
        entity_type: 'reconciliation_line_item',
        entity_id: ticketNumber,
        details: {
          ticket_number: ticketNumber,
          item_key: itemKey,
          item_type: itemType,
          item_name: entryName,
          status: action,
          notes: notes || null,
          variance_cost: variance?.variance?.cost?.total ?? 0,
        },
        created_at: new Date().toISOString(),
      })

      // Update local state
      setSavedStatuses(prev => ({ ...prev, [itemKey]: action }))
    } catch (err) {
      console.error('Error saving reconciliation action:', err)
    } finally {
      setProcessing(false)
    }
  }

  // Bulk accept all matched items
  async function handleBulkAccept() {
    setProcessing(true)
    try {
      for (let i = 0; i < labourResults.length; i++) {
        if (labourResults[i].status === 'matched') {
          await handleAction('labour', i, 'accepted', '')
        }
      }
      for (let i = 0; i < equipmentResults.length; i++) {
        if (equipmentResults[i].status === 'matched') {
          await handleAction('equipment', i, 'accepted', '')
        }
      }
    } finally {
      setProcessing(false)
    }
  }

  // Bulk flag all variances
  async function handleBulkFlag() {
    setProcessing(true)
    try {
      for (let i = 0; i < labourResults.length; i++) {
        const v = labourVariances[i]
        if (v && (v.status === 'review' || v.status === 'minor')) {
          await handleAction('labour', i, 'disputed', 'Bulk flagged for review')
        }
      }
      for (let i = 0; i < equipmentResults.length; i++) {
        const v = equipmentVariances[i]
        if (v && (v.status === 'review' || v.status === 'minor')) {
          await handleAction('equipment', i, 'disputed', 'Bulk flagged for review')
        }
      }
    } finally {
      setProcessing(false)
    }
  }

  // Empty states
  if (!lemData) {
    return (
      <div style={{
        padding: '32px',
        textAlign: 'center',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        marginTop: '12px',
      }}>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
          No contractor LEM data found for this ticket. Upload a LEM to enable variance comparison.
        </p>
      </div>
    )
  }

  if (!inspectorBlock) {
    return (
      <div style={{
        padding: '32px',
        textAlign: 'center',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        marginTop: '12px',
      }}>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
          No inspector report found for this ticket.
        </p>
      </div>
    )
  }

  return (
    <div style={{
      marginTop: '12px',
      backgroundColor: 'white',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
      overflow: 'hidden',
    }}>
      {/* Summary bar */}
      <div style={{ padding: '16px' }}>
        <VarianceSummaryBar totals={totals} />
      </div>

      {/* Labour comparison section */}
      <div>
        <div style={sectionHeaderStyle}>
          <span>Labour Comparison</span>
          <span style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280' }}>
            {labourResults.length} {labourResults.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {/* Table header */}
        <div style={tableHeaderStyle}>
          <div style={thCell}></div>
          <div style={thCell}>Name</div>
          <div style={thCell}>Classification</div>
          <div style={{ ...thCell, textAlign: 'right' }}>LEM Hrs</div>
          <div style={{ ...thCell, textAlign: 'right' }}>LEM Cost</div>
          <div style={{ ...thCell, textAlign: 'right' }}>Insp. Hrs</div>
          <div style={{ ...thCell, textAlign: 'right' }}>Variance</div>
          <div style={{ ...thCell, textAlign: 'center' }}>Conf</div>
          <div style={{ ...thCell, textAlign: 'center' }}>Status</div>
        </div>

        {/* Labour rows */}
        {labourResults.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '12px', fontStyle: 'italic' }}>
            No labour entries to compare
          </div>
        ) : (
          labourResults.map((result, idx) => (
            <VarianceRow
              key={`labour-${idx}`}
              result={result}
              itemType="labour"
              variance={labourVariances[idx]}
              onAction={(action, notes) => handleAction('labour', idx, action, notes)}
              savedStatus={savedStatuses[`labour-${idx}`]}
            />
          ))
        )}
      </div>

      {/* Equipment comparison section */}
      <div style={{ marginTop: '8px' }}>
        <div style={sectionHeaderStyle}>
          <span>Equipment Comparison</span>
          <span style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280' }}>
            {equipmentResults.length} {equipmentResults.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {/* Table header */}
        <div style={tableHeaderStyle}>
          <div style={thCell}></div>
          <div style={thCell}>Equipment</div>
          <div style={thCell}>Type</div>
          <div style={{ ...thCell, textAlign: 'right' }}>LEM Hrs</div>
          <div style={{ ...thCell, textAlign: 'right' }}>LEM Cost</div>
          <div style={{ ...thCell, textAlign: 'right' }}>Insp. Hrs</div>
          <div style={{ ...thCell, textAlign: 'right' }}>Variance</div>
          <div style={{ ...thCell, textAlign: 'center' }}>Conf</div>
          <div style={{ ...thCell, textAlign: 'center' }}>Status</div>
        </div>

        {/* Equipment rows */}
        {equipmentResults.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '12px', fontStyle: 'italic' }}>
            No equipment entries to compare
          </div>
        ) : (
          equipmentResults.map((result, idx) => (
            <VarianceRow
              key={`equipment-${idx}`}
              result={result}
              itemType="equipment"
              variance={equipmentVariances[idx]}
              onAction={(action, notes) => handleAction('equipment', idx, action, notes)}
              savedStatus={savedStatuses[`equipment-${idx}`]}
            />
          ))
        )}
      </div>

      {/* Bulk action bar */}
      <div style={{
        padding: '12px 16px',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        borderTop: '2px solid #e5e7eb',
        backgroundColor: '#f8fafc',
      }}>
        <button
          onClick={handleBulkAccept}
          disabled={processing}
          style={{
            padding: '8px 20px',
            backgroundColor: processing ? '#86efac' : '#16a34a',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: processing ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: '600',
          }}
        >
          {processing ? 'Processing...' : 'Accept All Matches'}
        </button>
        <button
          onClick={handleBulkFlag}
          disabled={processing}
          style={{
            padding: '8px 20px',
            backgroundColor: processing ? '#fca5a5' : '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: processing ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: '600',
          }}
        >
          {processing ? 'Processing...' : 'Flag All Variances'}
        </button>
      </div>
    </div>
  )
}
