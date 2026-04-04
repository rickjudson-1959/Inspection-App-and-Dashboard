import React, { useState, useEffect, useCallback } from 'react'
import { matchWorkers, matchEquipment, getWorkerName, getEquipmentName } from '../../utils/nameMatchingUtils.js'
import { calculateWorkerVariance, calculateEquipmentVariance, calculateTotals } from '../../utils/varianceCalculation.js'
import { extractLEMFromUrl } from '../../utils/lemParser.js'
import VarianceSummaryBar from './VarianceSummaryBar.jsx'
import VarianceRow from './VarianceRow.jsx'
import { supabase } from '../../supabase'

/**
 * VarianceComparisonPanel — Main variance comparison panel that goes below
 * the 4-panel document viewer.
 *
 * FUNDAMENTAL PRINCIPLE: The inspector report is the source of truth.
 * It ALWAYS displays, even without LEM data. The LEM is an overlay
 * for comparison when available.
 *
 * Props:
 *   ticketNumber          — string
 *   lemData               — contractor_lems row (with labour_entries, equipment_entries), or null
 *   inspectorBlock        — activity_blocks entry (with labourEntries, equipmentEntries)
 *   organizationId        — for DB operations
 *   onInspectorBlockChange — callback when inspector data is edited
 *   uploadedLemUrls       — array of uploaded LEM PDF URLs (for extraction)
 *   onLemDataExtracted    — callback after LEM data is extracted from uploads
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

// Simpler grid for inspector-only mode (no LEM comparison)
const inspectorOnlyTableHeaderStyle = {
  display: 'grid',
  gridTemplateColumns: '32px 1fr 120px 80px 80px 80px',
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

// Editable cell styles for inspector-only mode
const inspectorOnlyCellStyle = {
  padding: '6px 10px',
  fontSize: '12px',
}

const inspectorOnlyInputStyle = {
  padding: '4px 6px',
  fontSize: '12px',
  border: '1px solid #d1d5db',
  borderRadius: '3px',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

const inspectorOnlyNumberInputStyle = {
  padding: '4px 6px',
  fontSize: '12px',
  border: '1px solid #d1d5db',
  borderRadius: '3px',
  fontFamily: 'inherit',
  width: '68px',
  textAlign: 'right',
  boxSizing: 'border-box',
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatCurrency(value) {
  return num(value).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

export default function VarianceComparisonPanel({ ticketNumber, lemData, inspectorBlock, organizationId, onInspectorBlockChange, uploadedLemUrls, onLemDataExtracted }) {
  const [labourResults, setLabourResults] = useState([])
  const [labourVariances, setLabourVariances] = useState([])
  const [equipmentResults, setEquipmentResults] = useState([])
  const [equipmentVariances, setEquipmentVariances] = useState([])
  const [totals, setTotals] = useState(null)
  const [savedStatuses, setSavedStatuses] = useState({}) // keyed by `${type}-${index}`
  const [processing, setProcessing] = useState(false)

  // Rate cards for cost calculation
  const [labourRates, setLabourRates] = useState([])
  const [equipmentRates, setEquipmentRates] = useState([])

  // Load rate cards
  useEffect(() => {
    if (!organizationId) return
    async function loadRates() {
      try {
        const lr = await fetch(`/api/rates?table=labour_rates&organization_id=${organizationId}`)
        if (lr.ok) { const d = await lr.json(); if (Array.isArray(d)) setLabourRates(d) }
        const er = await fetch(`/api/rates?table=equipment_rates&organization_id=${organizationId}`)
        if (er.ok) { const d = await er.json(); if (Array.isArray(d)) setEquipmentRates(d) }
      } catch (e) { console.error('Failed to load rate cards:', e) }
    }
    loadRates()
  }, [organizationId])

  // Rate card matching — find the best matching rate for a classification or equipment type
  function findRate(name, rates, nameField) {
    if (!name || !rates?.length) return null
    const s = name.toLowerCase().trim()
    // Exact match
    const exact = rates.find(r => (r[nameField] || '').toLowerCase().trim() === s)
    if (exact) return exact
    // Contains match
    const contains = rates.find(r => {
      const k = (r[nameField] || '').toLowerCase().trim()
      return k.includes(s) || s.includes(k)
    })
    return contains || null
  }

  function calcInspectorLabourCost(entry) {
    const classification = entry.classification || ''
    const rate = findRate(classification, labourRates, 'classification')
    if (!rate) return 0
    const rt = num(entry.rt ?? entry.rtHours ?? entry.hours ?? 0)
    const ot = num(entry.ot ?? entry.otHours ?? 0)
    return (rt * num(rate.rate_st)) + (ot * num(rate.rate_ot || rate.rate_st))
  }

  function calcInspectorEquipCost(entry) {
    const type = entry.type || entry.equipment_type || ''
    const rate = findRate(type, equipmentRates, 'equipment_type')
    if (!rate) return 0
    const hours = num(entry.hours ?? 0)
    return hours * num(rate.rate_hourly || rate.rate)
  }

  // Local copy of inspector block for edits
  const [editableBlock, setEditableBlock] = useState(null)

  // Additional costs (small tools, per diem, etc.)
  const [additionalCosts, setAdditionalCosts] = useState([])
  const ADDITIONAL_COST_TYPES = [
    { value: 'small_tools', label: 'Small Tools' },
    { value: 'per_diem', label: 'Per Diem / Subsistence' },
    { value: 'travel', label: 'Travel' },
    { value: 'consumables', label: 'Consumables' },
    { value: 'ppe', label: 'PPE' },
    { value: 'other', label: 'Other' },
  ]

  const hasLem = !!lemData

  // Initialize editable block when inspector data changes
  useEffect(() => {
    if (inspectorBlock) {
      setEditableBlock(JSON.parse(JSON.stringify(inspectorBlock)))
    }
  }, [inspectorBlock])

  // Load additional costs from LEM
  useEffect(() => {
    const lemAdditional = lemData?.additional_costs || lemData?.small_tools ? [{
      type: 'small_tools',
      label: 'Small Tools',
      lemAmount: parseFloat(lemData.small_tools || 0),
      inspectorAmount: 0,
      inspectorNotes: ''
    }] : []
    setAdditionalCosts(lemAdditional)
  }, [lemData])

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

  // Run matching and variance calculations when BOTH lemData and editableBlock exist
  // When inspector-only, we still calculate inspector totals for the summary bar
  useEffect(() => {
    if (!editableBlock) return

    const inspLabour = editableBlock?.labourEntries || []
    const inspEquip = editableBlock?.equipmentEntries || []

    if (hasLem) {
      // FULL COMPARISON MODE — match and calculate variances
      const lemLabour = lemData?.labour_entries || []
      const lemEquip = lemData?.equipment_entries || []

      // Debug: log raw data structures
      if (lemLabour.length > 0) console.log('[Variance] LEM labour sample:', Object.keys(lemLabour[0]))
      if (inspLabour.length > 0) console.log('[Variance] Inspector labour sample:', Object.keys(inspLabour[0]))
      if (lemEquip.length > 0) console.log('[Variance] LEM equip sample:', Object.keys(lemEquip[0]))
      if (inspEquip.length > 0) console.log('[Variance] Inspector equip sample:', Object.keys(inspEquip[0]))

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
    } else {
      // INSPECTOR-ONLY MODE — calculate inspector totals using rate cards
      let inspectorTotalCost = 0

      for (const entry of inspLabour) {
        inspectorTotalCost += calcInspectorLabourCost(entry) * num(entry.count ?? 1)
      }

      for (const entry of inspEquip) {
        inspectorTotalCost += calcInspectorEquipCost(entry) * num(entry.count ?? 1)
      }

      setTotals({
        inspectorTotal: inspectorTotalCost,
        lemTotal: 0,
        varianceTotal: 0,
        matchedCount: 0,
        unmatchedLemCount: 0,
        unmatchedInspectorCount: inspLabour.length + inspEquip.length,
      })

      // Clear comparison data
      setLabourResults([])
      setLabourVariances([])
      setEquipmentResults([])
      setEquipmentVariances([])
    }
  }, [lemData, editableBlock, hasLem, loadSavedStatuses, labourRates, equipmentRates])

  // Handle inspector data edit — updates local editable block and notifies parent
  function handleInspectorEdit(itemType, index, field, value) {
    setEditableBlock(prev => {
      if (!prev) return prev
      const updated = JSON.parse(JSON.stringify(prev))
      const entries = itemType === 'labour' ? updated.labourEntries : updated.equipmentEntries

      if (hasLem) {
        // In comparison mode, use match results to find the correct entry
        const matchResult = itemType === 'labour' ? labourResults[index] : equipmentResults[index]

        if (matchResult?.inspectorEntry && entries) {
          const origEntry = matchResult.inspectorEntry
          const entryIdx = entries.findIndex(e => e === origEntry || (
            (e.employeeName === origEntry.employeeName || e.employee_name === origEntry.employee_name) &&
            (e.rt === origEntry.rt || e.hours === origEntry.hours)
          ))

          if (entryIdx >= 0) {
            applyFieldEdit(entries, entryIdx, itemType, field, value)
          }
        } else if (!matchResult?.inspectorEntry && value) {
          // LEM-only row — admin is adding a new inspector entry
          if (itemType === 'labour' && field === 'name') {
            updated.labourEntries = updated.labourEntries || []
            updated.labourEntries.push({ employeeName: value, classification: '', rt: 0, ot: 0, count: 1 })
          }
        }
      } else {
        // In inspector-only mode, index maps directly to the entries array
        if (entries && entries[index]) {
          applyFieldEdit(entries, index, itemType, field, value)
        }
      }

      // Notify parent to persist
      if (onInspectorBlockChange) {
        onInspectorBlockChange(updated)
      }
      return updated
    })
  }

  // Shared field edit logic
  function applyFieldEdit(entries, entryIdx, itemType, field, value) {
    const fieldMap = {
      name: itemType === 'labour' ? (entries[entryIdx].employeeName !== undefined ? 'employeeName' : 'employee_name') : null,
      classification: 'classification',
      rt: entries[entryIdx].rt !== undefined ? 'rt' : 'rtHours',
      ot: entries[entryIdx].ot !== undefined ? 'ot' : 'otHours',
      dt: entries[entryIdx].dt !== undefined ? 'dt' : 'dtHours',
      hours: 'hours',
      type: entries[entryIdx].type !== undefined ? 'type' : 'equipment_type',
      unitNumber: entries[entryIdx].unitNumber !== undefined ? 'unitNumber' : 'unit_number',
    }
    const actualField = fieldMap[field]
    if (actualField) {
      const isNumeric = ['rt', 'ot', 'dt', 'hours'].includes(field)
      entries[entryIdx][actualField] = isNumeric ? parseFloat(value) || 0 : value
    }
  }

  // Handle additional cost edit
  function handleAdditionalCostEdit(index, field, value) {
    setAdditionalCosts(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: field === 'inspectorAmount' ? parseFloat(value) || 0 : value }
      return updated
    })
  }

  function addAdditionalCost() {
    setAdditionalCosts(prev => [...prev, { type: 'small_tools', label: 'Small Tools', lemAmount: 0, inspectorAmount: 0, inspectorNotes: '' }])
  }

  // Handle accept/dispute/adjust action for a line item
  async function handleAction(itemType, index, action, notes) {
    const itemKey = `${itemType}-${index}`
    setProcessing(true)

    try {
      // Determine the entry details for audit logging
      const result = itemType === 'labour' ? labourResults[index] : equipmentResults[index]
      const variance = itemType === 'labour' ? labourVariances[index] : equipmentVariances[index]
      const entryName = itemType === 'labour'
        ? (getWorkerName(result?.lemEntry) || getWorkerName(result?.inspectorEntry) || 'Unknown')
        : (getEquipmentName(result?.lemEntry) || getEquipmentName(result?.inspectorEntry) || 'Unknown')

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

  // Extract LEM data from uploaded PDF (for LEMs uploaded before OCR was wired up)
  async function handleExtractFromUpload() {
    if (!uploadedLemUrls?.length) return
    setProcessing(true)
    try {
      const allLabour = []
      const allEquipment = []
      let totalLabourCost = 0
      let totalEquipCost = 0

      for (const url of uploadedLemUrls) {
        const extracted = await extractLEMFromUrl(url)
        if (extracted.labour) {
          for (const l of extracted.labour) {
            allLabour.push({
              name: l.employee_name || '', type: l.classification || '', employee_id: '',
              rt_hours: l.rt_hours || 0, ot_hours: l.ot_hours || 0, dt_hours: 0,
              rt_rate: l.rt_rate || 0, ot_rate: l.ot_rate || 0, dt_rate: 0,
              sub: 0, total: l.line_total || 0
            })
            totalLabourCost += l.line_total || 0
          }
        }
        if (extracted.equipment) {
          for (const e of extracted.equipment) {
            allEquipment.push({
              type: e.equipment_type || '', equipment_id: e.unit_number || '',
              hours: e.hours || 0, rate: e.rate || 0, total: e.line_total || 0
            })
            totalEquipCost += e.line_total || 0
          }
        }
      }

      if (allLabour.length > 0 || allEquipment.length > 0) {
        await supabase.from('contractor_lems').upsert({
          organization_id: organizationId,
          field_log_id: ticketNumber,
          labour_entries: allLabour,
          equipment_entries: allEquipment,
          total_labour_cost: totalLabourCost,
          total_equipment_cost: totalEquipCost,
        }, { onConflict: 'organization_id,field_log_id' })

        if (onLemDataExtracted) onLemDataExtracted()
      } else {
        alert('OCR could not extract any labour or equipment data from the uploaded LEM.')
      }
    } catch (err) {
      console.error('[LEM OCR] Extraction failed:', err)
      alert('Extraction failed: ' + err.message)
    }
    setProcessing(false)
  }

  // =========================================================================
  // RENDER: No inspector block at all
  // =========================================================================
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
          No inspector report found for this ticket. The inspector must submit a daily report with this ticket number.
        </p>
      </div>
    )
  }

  // =========================================================================
  // RENDER: Inspector data exists — always render it as primary
  // =========================================================================

  const inspLabour = editableBlock?.labourEntries || []
  const inspEquip = editableBlock?.equipmentEntries || []

  // Compute inspector-only cost using rate cards (not from entry — inspector doesn't enter rates)
  function getInspectorLabourCost(entry) {
    return calcInspectorLabourCost(entry) * num(entry.count ?? 1)
  }

  function getInspectorEquipCost(entry) {
    return calcInspectorEquipCost(entry) * num(entry.count ?? 1)
  }

  // Get the matched rate for display purposes
  function getLabourRate(entry) {
    const classification = entry.classification || ''
    return findRate(classification, labourRates, 'classification')
  }

  function getEquipRate(entry) {
    const type = entry.type || entry.equipment_type || ''
    return findRate(type, equipmentRates, 'equipment_type')
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
        <VarianceSummaryBar totals={totals} hasLem={hasLem} />
      </div>

      {/* Awaiting LEM banner (inspector-only mode) */}
      {!hasLem && (
        <div style={{
          margin: '0 16px 16px 16px',
          padding: '12px 16px',
          backgroundColor: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#0c4a6e', marginBottom: '4px' }}>
              Awaiting Contractor LEM
            </div>
            <div style={{ fontSize: '12px', color: '#475569' }}>
              Inspector data is the current baseline. When the LEM arrives, variances will be calculated.
            </div>
          </div>
          {uploadedLemUrls?.length > 0 && (
            <button onClick={handleExtractFromUpload} disabled={processing}
              style={{
                padding: '8px 20px',
                backgroundColor: processing ? '#9ca3af' : '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: processing ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '13px',
                whiteSpace: 'nowrap',
              }}>
              {processing ? 'Extracting...' : 'Extract LEM Data'}
            </button>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* LABOUR SECTION                                                     */}
      {/* ================================================================= */}
      <div>
        <div style={sectionHeaderStyle}>
          <span>{hasLem ? 'Labour Comparison' : "Inspector's Recorded Labour"}</span>
          <span style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280' }}>
            {hasLem
              ? `${labourResults.length} ${labourResults.length === 1 ? 'entry' : 'entries'}`
              : `${inspLabour.length} ${inspLabour.length === 1 ? 'entry' : 'entries'}`
            }
          </span>
        </div>

        {hasLem ? (
          <>
            {/* COMPARISON MODE — full table header */}
            <div style={tableHeaderStyle}>
              <div style={thCell}></div>
              <div style={thCell}>Name</div>
              <div style={thCell}>Classification</div>
              <div style={{ ...thCell, textAlign: 'right' }}>Insp. Hrs</div>
              <div style={{ ...thCell, textAlign: 'right' }}>Insp. Cost</div>
              <div style={{ ...thCell, textAlign: 'right' }}>LEM Hrs</div>
              <div style={{ ...thCell, textAlign: 'right' }}>LEM Cost</div>
              <div style={{ ...thCell, textAlign: 'center' }}>Conf</div>
              <div style={{ ...thCell, textAlign: 'center' }}>Status</div>
            </div>

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
                  onInspectorEdit={(field, value) => handleInspectorEdit('labour', idx, field, value)}
                  savedStatus={savedStatuses[`labour-${idx}`]}
                />
              ))
            )}
          </>
        ) : (
          <>
            {/* INSPECTOR-ONLY MODE — simpler editable table */}
            <div style={inspectorOnlyTableHeaderStyle}>
              <div style={thCell}></div>
              <div style={thCell}>Name</div>
              <div style={thCell}>Classification</div>
              <div style={{ ...thCell, textAlign: 'right' }}>RT</div>
              <div style={{ ...thCell, textAlign: 'right' }}>OT</div>
              <div style={{ ...thCell, textAlign: 'right' }}>Cost</div>
            </div>

            {inspLabour.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '12px', fontStyle: 'italic' }}>
                No labour entries recorded by inspector
              </div>
            ) : (
              inspLabour.map((entry, idx) => {
                const entryName = getWorkerName(entry)
                const classification = entry.classification || entry.type || ''
                const rt = num(entry.rtHours ?? entry.rt_hours ?? entry.rt ?? entry.hours ?? entry.jh ?? 0)
                const ot = num(entry.otHours ?? entry.ot_hours ?? entry.ot ?? 0)
                const cost = getInspectorLabourCost(entry)

                return (
                  <div
                    key={`labour-insp-${idx}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 1fr 120px 80px 80px 80px',
                      alignItems: 'center',
                      borderBottom: '1px solid #e5e7eb',
                      backgroundColor: idx % 2 === 0 ? 'white' : '#fafbfc',
                    }}
                  >
                    {/* Edit icon */}
                    <div style={{ ...inspectorOnlyCellStyle, textAlign: 'center', color: '#94a3b8', fontSize: '14px', cursor: 'default' }}>
                      <span title="Editable">&#9998;</span>
                    </div>

                    {/* Name — editable */}
                    <div style={inspectorOnlyCellStyle}>
                      <input
                        type="text"
                        value={entryName}
                        onChange={(e) => handleInspectorEdit('labour', idx, 'name', e.target.value)}
                        style={inspectorOnlyInputStyle}
                      />
                    </div>

                    {/* Classification — editable */}
                    <div style={inspectorOnlyCellStyle}>
                      <input
                        type="text"
                        value={classification}
                        onChange={(e) => handleInspectorEdit('labour', idx, 'classification', e.target.value)}
                        style={{ ...inspectorOnlyInputStyle, fontSize: '11px' }}
                      />
                    </div>

                    {/* RT — editable */}
                    <div style={{ ...inspectorOnlyCellStyle, textAlign: 'right' }}>
                      <input
                        type="number"
                        step="0.5"
                        value={rt}
                        onChange={(e) => handleInspectorEdit('labour', idx, 'rt', e.target.value)}
                        style={inspectorOnlyNumberInputStyle}
                      />
                    </div>

                    {/* OT — editable */}
                    <div style={{ ...inspectorOnlyCellStyle, textAlign: 'right' }}>
                      <input
                        type="number"
                        step="0.5"
                        value={ot}
                        onChange={(e) => handleInspectorEdit('labour', idx, 'ot', e.target.value)}
                        style={inspectorOnlyNumberInputStyle}
                      />
                    </div>

                    {/* Cost — calculated, read-only */}
                    <div style={{
                      ...inspectorOnlyCellStyle,
                      textAlign: 'right',
                      fontWeight: '600',
                      color: cost > 0 ? '#166534' : '#6b7280',
                    }}>
                      {cost > 0 ? formatCurrency(cost) : '--'}
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}
      </div>

      {/* ================================================================= */}
      {/* EQUIPMENT SECTION                                                  */}
      {/* ================================================================= */}
      <div style={{ marginTop: '8px' }}>
        <div style={sectionHeaderStyle}>
          <span>{hasLem ? 'Equipment Comparison' : "Inspector's Recorded Equipment"}</span>
          <span style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280' }}>
            {hasLem
              ? `${equipmentResults.length} ${equipmentResults.length === 1 ? 'entry' : 'entries'}`
              : `${inspEquip.length} ${inspEquip.length === 1 ? 'entry' : 'entries'}`
            }
          </span>
        </div>

        {hasLem ? (
          <>
            {/* COMPARISON MODE — full table header */}
            <div style={tableHeaderStyle}>
              <div style={thCell}></div>
              <div style={thCell}>Equipment</div>
              <div style={thCell}>Type</div>
              <div style={{ ...thCell, textAlign: 'right' }}>Insp. Hrs</div>
              <div style={{ ...thCell, textAlign: 'right' }}>Insp. Cost</div>
              <div style={{ ...thCell, textAlign: 'right' }}>LEM Hrs</div>
              <div style={{ ...thCell, textAlign: 'right' }}>LEM Cost</div>
              <div style={{ ...thCell, textAlign: 'center' }}>Conf</div>
              <div style={{ ...thCell, textAlign: 'center' }}>Status</div>
            </div>

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
                  onInspectorEdit={(field, value) => handleInspectorEdit('equipment', idx, field, value)}
                  savedStatus={savedStatuses[`equipment-${idx}`]}
                />
              ))
            )}
          </>
        ) : (
          <>
            {/* INSPECTOR-ONLY MODE — simpler editable table */}
            <div style={inspectorOnlyTableHeaderStyle}>
              <div style={thCell}></div>
              <div style={thCell}>Equipment</div>
              <div style={thCell}>Type / Unit #</div>
              <div style={{ ...thCell, textAlign: 'right' }}>Hours</div>
              <div style={{ ...thCell, textAlign: 'right' }}>Rate</div>
              <div style={{ ...thCell, textAlign: 'right' }}>Cost</div>
            </div>

            {inspEquip.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '12px', fontStyle: 'italic' }}>
                No equipment entries recorded by inspector
              </div>
            ) : (
              inspEquip.map((entry, idx) => {
                const equipName = getEquipmentName(entry)
                const unitNumber = entry.unitNumber || entry.unit_number || entry.equipment_id || ''
                const hours = num(entry.hours ?? entry.count ?? 0)
                const matchedRate = getEquipRate(entry)
                const rate = num(matchedRate?.rate_hourly || matchedRate?.rate || 0)
                const cost = getInspectorEquipCost(entry)

                return (
                  <div
                    key={`equip-insp-${idx}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 1fr 120px 80px 80px 80px',
                      alignItems: 'center',
                      borderBottom: '1px solid #e5e7eb',
                      backgroundColor: idx % 2 === 0 ? 'white' : '#fafbfc',
                    }}
                  >
                    {/* Edit icon */}
                    <div style={{ ...inspectorOnlyCellStyle, textAlign: 'center', color: '#94a3b8', fontSize: '14px', cursor: 'default' }}>
                      <span title="Editable">&#9998;</span>
                    </div>

                    {/* Equipment name — editable */}
                    <div style={inspectorOnlyCellStyle}>
                      <input
                        type="text"
                        value={equipName}
                        onChange={(e) => handleInspectorEdit('equipment', idx, 'type', e.target.value)}
                        style={inspectorOnlyInputStyle}
                      />
                    </div>

                    {/* Unit # — editable */}
                    <div style={inspectorOnlyCellStyle}>
                      <input
                        type="text"
                        value={unitNumber}
                        onChange={(e) => handleInspectorEdit('equipment', idx, 'unitNumber', e.target.value)}
                        style={{ ...inspectorOnlyInputStyle, fontSize: '11px' }}
                      />
                    </div>

                    {/* Hours — editable */}
                    <div style={{ ...inspectorOnlyCellStyle, textAlign: 'right' }}>
                      <input
                        type="number"
                        step="0.5"
                        value={hours}
                        onChange={(e) => handleInspectorEdit('equipment', idx, 'hours', e.target.value)}
                        style={inspectorOnlyNumberInputStyle}
                      />
                    </div>

                    {/* Rate — read-only display */}
                    <div style={{
                      ...inspectorOnlyCellStyle,
                      textAlign: 'right',
                      fontSize: '11px',
                      color: '#6b7280',
                    }}>
                      {rate > 0 ? `${formatCurrency(rate)}/hr` : '--'}
                    </div>

                    {/* Cost — calculated, read-only */}
                    <div style={{
                      ...inspectorOnlyCellStyle,
                      textAlign: 'right',
                      fontWeight: '600',
                      color: cost > 0 ? '#166534' : '#6b7280',
                    }}>
                      {cost > 0 ? formatCurrency(cost) : '--'}
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}
      </div>

      {/* ================================================================= */}
      {/* ADDITIONAL COSTS SECTION                                           */}
      {/* ================================================================= */}
      <div style={{ marginTop: '8px' }}>
        <div style={sectionHeaderStyle}>
          <span>Additional Costs</span>
          <button onClick={addAdditionalCost} style={{ padding: '2px 10px', fontSize: '11px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Add</button>
        </div>
        {additionalCosts.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '12px', fontStyle: 'italic' }}>
            No additional costs. Click "+ Add" for small tools, per diem, travel, etc.
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px 1fr', gap: '0', backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1', fontSize: '11px', fontWeight: '600', color: '#475569', textTransform: 'uppercase' }}>
              <div style={{ padding: '6px 10px' }}>Type</div>
              <div style={{ padding: '6px 10px', textAlign: 'right' }}>LEM Amount</div>
              <div style={{ padding: '6px 10px', textAlign: 'right' }}>Inspector Amount</div>
              <div style={{ padding: '6px 10px', textAlign: 'right' }}>Variance</div>
              <div style={{ padding: '6px 10px' }}>Notes</div>
            </div>
            {additionalCosts.map((cost, idx) => {
              const variance = (cost.lemAmount || 0) - (cost.inspectorAmount || 0)
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px 1fr', gap: '0', borderBottom: '1px solid #e5e7eb', backgroundColor: variance === 0 ? '#dcfce7' : variance > 0 ? '#fef2f2' : '#eff6ff' }}>
                  <div style={{ padding: '6px 10px' }}>
                    <select value={cost.type} onChange={e => { const t = ADDITIONAL_COST_TYPES.find(c => c.value === e.target.value); handleAdditionalCostEdit(idx, 'type', e.target.value); if (t) handleAdditionalCostEdit(idx, 'label', t.label) }}
                      style={{ padding: '3px 6px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '3px', width: '100%' }}>
                      {ADDITIONAL_COST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div style={{ padding: '6px 10px', textAlign: 'right', fontSize: '12px', fontWeight: '500' }}>
                    ${(cost.lemAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ padding: '4px 10px' }}>
                    <input type="number" value={cost.inspectorAmount || ''} onChange={e => handleAdditionalCostEdit(idx, 'inspectorAmount', e.target.value)}
                      placeholder="0.00" style={{ width: '100%', padding: '3px 6px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '3px', textAlign: 'right' }} />
                  </div>
                  <div style={{ padding: '6px 10px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: variance === 0 ? '#16a34a' : variance > 0 ? '#dc2626' : '#3b82f6' }}>
                    {variance > 0 ? '+' : ''}${variance.toFixed(2)}
                  </div>
                  <div style={{ padding: '4px 10px' }}>
                    <input type="text" value={cost.inspectorNotes || ''} onChange={e => handleAdditionalCostEdit(idx, 'inspectorNotes', e.target.value)}
                      placeholder="Notes..." style={{ width: '100%', padding: '3px 6px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '3px' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* BULK ACTION BAR (only shown when LEM comparison is active)         */}
      {/* ================================================================= */}
      {hasLem && (
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
      )}
    </div>
  )
}
