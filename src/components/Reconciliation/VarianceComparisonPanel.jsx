import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../supabase'
import { calculateSplit, calculateCost, calculateVariance, loadProjectRules, getHolidayForDate } from '../../lib/contractCompliance.js'
import { normalizeName, extractNameParts, levenshtein } from '../../utils/nameMatchingUtils.js'

/**
 * VarianceComparisonPanel — Phase 4.4.5 Rebuild
 *
 * Master-anchored, three-way comparison per labour/equipment line:
 *   1. Contractor's claim (LEM) — raw OCR'd values
 *   2. Contract's requirement — what calculateSplit() returns for total hours + date
 *   3. Inspector's record — inspector's entry (post-4.4.4, equals contract requirement)
 *
 * Matching is by master_personnel_id / master_equipment_id — never by string.
 *
 * Props:
 *   ticketNumber, lemData, inspectorBlock, organizationId, reportDate,
 *   onInspectorBlockChange, uploadedLemUrls, uploadedLemDate, uploadedLemForeman, onLemDataExtracted
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatCurrency(n) {
  return num(n).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

/** Strip trailing parenthetical suffixes like (EP), (PB), lowercase, trim */
function normalizeLemName(raw) {
  if (!raw || typeof raw !== 'string') return ''
  return raw.toLowerCase().trim().replace(/\s*\([^)]*\)\s*$/, '').trim()
}

const CATEGORY_COLORS = {
  reconciled: '#16a34a',
  contract_violation: '#dc2626',
  hours_dispute: '#eab308',
  missing_on_lem: '#ea580c',
  ghost_on_lem: '#dc2626',
}

const CATEGORY_ICONS = {
  reconciled: '\u2713',
  contract_violation: '\uD83D\uDD34',
  hours_dispute: '\uD83D\uDFE1',
  missing_on_lem: '\uD83D\uDFE0',
  ghost_on_lem: '\uD83D\uDD34',
}

const CATEGORY_LABELS = {
  reconciled: 'Reconciled',
  contract_violation: 'Contract Violation',
  hours_dispute: 'Hours Dispute',
  missing_on_lem: 'Missing on LEM',
  ghost_on_lem: 'Ghost on LEM',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VarianceComparisonPanel({
  ticketNumber,
  lemData,
  inspectorBlock,
  organizationId,
  reportDate,
  onInspectorBlockChange,
  uploadedLemUrls,
  uploadedLemDate,
  uploadedLemForeman,
  onLemDataExtracted,
}) {
  // ── Data loading state ──
  const [masterPersonnel, setMasterPersonnel] = useState([])
  const [masterEquipment, setMasterEquipment] = useState([])
  const [projectRules, setProjectRules] = useState(null)
  const [holiday, setHoliday] = useState(null)
  const [labourRates, setLabourRates] = useState([])
  const [equipmentRates, setEquipmentRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Reconciliation state ──
  const [lineStatuses, setLineStatuses] = useState({}) // key → { status, notes }
  const [saving, setSaving] = useState({})

  // ── Load reference data ──
  useEffect(() => {
    if (!organizationId) return
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        // Load master personnel (paginated)
        const allPersonnel = []
        let pOffset = 0
        while (true) {
          const { data, error: pErr } = await supabase
            .from('master_personnel')
            .select('id, name, classification')
            .eq('active', true)
            .range(pOffset, pOffset + 999)
          if (pErr) throw pErr
          if (!data || data.length === 0) break
          allPersonnel.push(...data)
          if (data.length < 1000) break
          pOffset += 1000
        }

        // Load master equipment (paginated)
        const allEquipment = []
        let eOffset = 0
        while (true) {
          const { data, error: eErr } = await supabase
            .from('master_equipment')
            .select('id, unit_number, classification')
            .eq('active', true)
            .range(eOffset, eOffset + 999)
          if (eErr) throw eErr
          if (!data || data.length === 0) break
          allEquipment.push(...data)
          if (data.length < 1000) break
          eOffset += 1000
        }

        // Load project rules — use first project in org
        let rules = { base_hours_per_day: 8, ot_multiplier: 1.5, dt_multiplier: 2.0, province: 'AB' }
        try {
          const { data: proj } = await supabase
            .from('projects')
            .select('id, province, base_hours_per_day, ot_multiplier, dt_multiplier')
            .limit(1)
            .single()
          if (proj) rules = proj
        } catch (e) { console.warn('Could not load project rules, using defaults:', e) }

        // Load holiday for report date
        let hol = null
        if (reportDate && rules.province) {
          try {
            hol = await getHolidayForDate(reportDate, rules.province)
          } catch (e) { console.warn('Holiday check failed:', e) }
        }

        // Load rate cards
        let lr = [], er = []
        try {
          const lRes = await fetch(`/api/rates?table=labour_rates&organization_id=${organizationId}`)
          if (lRes.ok) { const d = await lRes.json(); if (Array.isArray(d)) lr = d }
          const eRes = await fetch(`/api/rates?table=equipment_rates&organization_id=${organizationId}`)
          if (eRes.ok) { const d = await eRes.json(); if (Array.isArray(d)) er = d }
        } catch (e) { console.warn('Rate card load failed:', e) }

        // Load saved line item statuses
        const savedMap = {}
        try {
          const { data: savedItems } = await supabase
            .from('reconciliation_line_items')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('ticket_number', ticketNumber)
          for (const item of (savedItems || [])) {
            const key = `${item.item_type}-${item.lem_worker_name || item.inspector_worker_name || ''}`
            savedMap[key] = { status: item.status, notes: item.dispute_notes || '' }
          }
        } catch (e) { console.warn('Could not load saved statuses:', e) }

        if (!cancelled) {
          setMasterPersonnel(allPersonnel)
          setMasterEquipment(allEquipment)
          setProjectRules(rules)
          setHoliday(hol)
          setLabourRates(lr)
          setEquipmentRates(er)
          setLineStatuses(savedMap)
          setLoading(false)
        }
      } catch (e) {
        console.error('VarianceComparisonPanel load error:', e)
        if (!cancelled) {
          setError(e.message)
          setLoading(false)
        }
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [organizationId, reportDate, ticketNumber])

  // ── Resolve LEM labour entries to master IDs ──
  const resolvedLabour = useMemo(() => {
    if (!lemData?.labour_entries?.length || !masterPersonnel.length) return []

    // Build lookup maps
    const byNameExact = new Map() // lowercase name → master record
    for (const mp of masterPersonnel) {
      if (mp.name) byNameExact.set(mp.name.toLowerCase().trim(), mp)
    }

    return lemData.labour_entries.map(lemEntry => {
      const rawName = lemEntry.employee_name || lemEntry.name || ''
      const normalized = normalizeLemName(rawName)
      if (!normalized) {
        return { lemEntry, masterId: null, masterName: rawName, masterClassification: lemEntry.classification || '', matchMethod: 'none', confidence: 0 }
      }

      // Exact match
      if (byNameExact.has(normalized)) {
        const mp = byNameExact.get(normalized)
        return { lemEntry, masterId: mp.id, masterName: mp.name, masterClassification: mp.classification, matchMethod: 'exact', confidence: 1.0 }
      }

      // Fuzzy match — try extracting name parts and matching
      const lemParts = extractNameParts(normalizeName(rawName))
      let bestMatch = null
      let bestScore = Infinity

      for (const mp of masterPersonnel) {
        const mpParts = extractNameParts(normalizeName(mp.name))
        // Last name must match closely
        if (lemParts.last && mpParts.last) {
          const lastDist = levenshtein(lemParts.last, mpParts.last)
          if (lastDist <= 1) {
            // Check first name/initial
            if (lemParts.first && mpParts.first) {
              if (lemParts.first[0] === mpParts.first[0]) {
                const firstDist = levenshtein(lemParts.first, mpParts.first)
                const score = lastDist + firstDist
                if (score < bestScore) {
                  bestScore = score
                  bestMatch = mp
                }
              }
            }
          }
        }
      }

      if (bestMatch && bestScore <= 3) {
        return { lemEntry, masterId: bestMatch.id, masterName: bestMatch.name, masterClassification: bestMatch.classification, matchMethod: 'fuzzy', confidence: Math.max(0.6, 1 - bestScore * 0.1) }
      }

      return { lemEntry, masterId: null, masterName: rawName, masterClassification: lemEntry.classification || '', matchMethod: 'none', confidence: 0 }
    })
  }, [lemData, masterPersonnel])

  // ── Build matched rows ──
  const matchedRows = useMemo(() => {
    if (!projectRules || !reportDate) return []

    const inspLabour = inspectorBlock?.labourEntries || []
    const rows = []

    // Build inspector lookup by master_personnel_id
    const inspByMaster = new Map()
    for (const entry of inspLabour) {
      if (entry.master_personnel_id) {
        inspByMaster.set(entry.master_personnel_id, entry)
      }
    }

    // Also build inspector lookup by normalized name for fallback
    const inspByName = new Map()
    for (const entry of inspLabour) {
      const name = (entry.employeeName || entry.employee_name || entry.name || '').toLowerCase().trim()
      if (name) inspByName.set(name, entry)
    }

    const matchedInspectorIds = new Set()
    const matchedInspectorNames = new Set()

    // For each resolved LEM entry, find the inspector match
    for (const resolved of resolvedLabour) {
      const { lemEntry, masterId, masterName, masterClassification, matchMethod, confidence } = resolved
      let inspEntry = null

      // Match by master ID first
      if (masterId && inspByMaster.has(masterId)) {
        inspEntry = inspByMaster.get(masterId)
        matchedInspectorIds.add(masterId)
      }

      // Fallback: match by normalized name
      if (!inspEntry) {
        const normalized = normalizeLemName(lemEntry.employee_name || lemEntry.name || '')
        if (normalized && inspByName.has(normalized)) {
          inspEntry = inspByName.get(normalized)
          matchedInspectorNames.add(normalized)
        }
      }

      // Get hours
      const lemRt = num(lemEntry.rt_hours)
      const lemOt = num(lemEntry.ot_hours)
      const lemDt = num(lemEntry.dt_hours)
      const lemTotal = lemRt + lemOt + lemDt

      // Inspector hours
      const inspRt = inspEntry ? num(inspEntry.rt ?? inspEntry.rtHours ?? 0) : 0
      const inspOt = inspEntry ? num(inspEntry.ot ?? inspEntry.otHours ?? 0) : 0
      const inspDt = inspEntry ? num(inspEntry.dt ?? inspEntry.dtHours ?? 0) : 0
      const inspTotal = inspEntry
        ? num(inspEntry.total_hours ?? inspEntry.totalHours ?? (inspRt + inspOt + inspDt))
        : 0

      // Contract split from inspector's total hours
      const contractSplit = inspEntry
        ? calculateSplit(inspTotal, reportDate, projectRules, holiday)
        : calculateSplit(lemTotal, reportDate, projectRules, holiday)

      // Find rate card
      const classification = masterClassification || lemEntry.classification || ''
      const rateCard = findRateCard(classification, labourRates) || { rate_st: 0, rate_ot: 0, rate_dt: 0 }

      const lemSplit = { rt_hours: lemRt, ot_hours: lemOt, dt_hours: lemDt }
      const lemCost = calculateCost(lemSplit, rateCard)
      const contractCost = calculateCost(contractSplit, rateCard)
      const dollarImpact = lemCost - contractCost

      // Categorize
      let category = 'reconciled'
      if (!inspEntry) {
        category = 'ghost_on_lem'
      } else if (Math.abs(lemTotal - inspTotal) > 0.25) {
        category = 'hours_dispute'
      } else if (Math.abs(lemRt - contractSplit.rt_hours) > 0.01 ||
                 Math.abs(lemOt - contractSplit.ot_hours) > 0.01 ||
                 Math.abs(lemDt - contractSplit.dt_hours) > 0.01) {
        category = 'contract_violation'
      }

      rows.push({
        type: 'labour',
        masterId,
        name: masterName,
        classification: masterClassification || classification,
        matchMethod,
        confidence,
        category,
        lemEntry,
        inspEntry,
        lemSplit,
        contractSplit,
        inspectorSplit: { rt_hours: inspRt, ot_hours: inspOt, dt_hours: inspDt },
        lemCost,
        contractCost,
        dollarImpact,
        ruleDescription: contractSplit.rule_description,
      })
    }

    // Inspector-only entries (missing on LEM)
    for (const entry of inspLabour) {
      const masterId = entry.master_personnel_id
      const name = (entry.employeeName || entry.employee_name || entry.name || '').toLowerCase().trim()

      if (masterId && matchedInspectorIds.has(masterId)) continue
      if (!masterId && name && matchedInspectorNames.has(name)) continue

      const inspRt = num(entry.rt ?? entry.rtHours ?? 0)
      const inspOt = num(entry.ot ?? entry.otHours ?? 0)
      const inspDt = num(entry.dt ?? entry.dtHours ?? 0)
      const inspTotal = num(entry.total_hours ?? entry.totalHours ?? (inspRt + inspOt + inspDt))

      const contractSplit = calculateSplit(inspTotal, reportDate, projectRules, holiday)
      const classification = entry.classification || ''
      const rateCard = findRateCard(classification, labourRates) || { rate_st: 0, rate_ot: 0, rate_dt: 0 }
      const contractCost = calculateCost(contractSplit, rateCard)

      rows.push({
        type: 'labour',
        masterId: masterId || null,
        name: entry.employeeName || entry.employee_name || entry.name || 'Unknown',
        classification,
        matchMethod: 'none',
        confidence: 0,
        category: 'missing_on_lem',
        lemEntry: null,
        inspEntry: entry,
        lemSplit: { rt_hours: 0, ot_hours: 0, dt_hours: 0 },
        contractSplit,
        inspectorSplit: { rt_hours: inspRt, ot_hours: inspOt, dt_hours: inspDt },
        lemCost: 0,
        contractCost,
        dollarImpact: -contractCost, // Missing = underbilled
        ruleDescription: contractSplit.rule_description,
      })
    }

    return rows
  }, [resolvedLabour, inspectorBlock, projectRules, holiday, reportDate, labourRates])

  // ── Summary calculations ──
  const summary = useMemo(() => {
    const counts = { reconciled: 0, contract_violation: 0, hours_dispute: 0, missing_on_lem: 0, ghost_on_lem: 0 }
    const costs = { reconciled: 0, contract_violation: 0, hours_dispute: 0, missing_on_lem: 0, ghost_on_lem: 0 }
    let totalLemCost = 0
    let totalContractCost = 0

    for (const row of matchedRows) {
      counts[row.category]++
      costs[row.category] += row.dollarImpact
      totalLemCost += row.lemCost
      totalContractCost += row.contractCost
    }

    const needsReview = counts.contract_violation + counts.hours_dispute + counts.missing_on_lem + counts.ghost_on_lem
    const netVariance = totalLemCost - totalContractCost

    return { counts, costs, totalLemCost, totalContractCost, netVariance, needsReview, totalItems: matchedRows.length }
  }, [matchedRows])

  // ── Find rate card by classification ──
  function findRateCard(classification, rates) {
    if (!classification || !rates?.length) return null
    const s = classification.toLowerCase().trim()

    // Exact match
    for (const r of rates) {
      if ((r.classification || '').toLowerCase().trim() === s) return r
    }

    // Contains match
    for (const r of rates) {
      const rc = (r.classification || '').toLowerCase().trim()
      if (rc.includes(s) || s.includes(rc)) return r
    }

    return null
  }

  // ── Save line item decision ──
  const saveDecision = useCallback(async (row, status, notes = '') => {
    const key = `${row.type}-${row.name}`
    setSaving(prev => ({ ...prev, [key]: true }))

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const record = {
        organization_id: organizationId,
        ticket_number: ticketNumber,
        item_type: row.type,
        lem_worker_name: row.lemEntry ? (row.lemEntry.employee_name || row.lemEntry.name || '') : null,
        inspector_worker_name: row.inspEntry ? (row.inspEntry.employeeName || row.inspEntry.employee_name || '') : null,
        match_confidence: row.confidence,
        match_method: row.matchMethod,
        lem_rt_hours: num(row.lemSplit.rt_hours),
        lem_ot_hours: num(row.lemSplit.ot_hours),
        lem_dt_hours: num(row.lemSplit.dt_hours),
        lem_total_hours: num(row.lemSplit.rt_hours) + num(row.lemSplit.ot_hours) + num(row.lemSplit.dt_hours),
        lem_cost: row.lemCost,
        inspector_rt_hours: num(row.inspectorSplit.rt_hours),
        inspector_ot_hours: num(row.inspectorSplit.ot_hours),
        inspector_dt_hours: num(row.inspectorSplit.dt_hours),
        inspector_total_hours: num(row.inspectorSplit.rt_hours) + num(row.inspectorSplit.ot_hours) + num(row.inspectorSplit.dt_hours),
        variance_hours: (num(row.lemSplit.rt_hours) + num(row.lemSplit.ot_hours) + num(row.lemSplit.dt_hours)) -
                        (num(row.inspectorSplit.rt_hours) + num(row.inspectorSplit.ot_hours) + num(row.inspectorSplit.dt_hours)),
        variance_cost: row.dollarImpact,
        status,
        dispute_notes: notes || null,
        reconciled_by: user?.id || null,
        reconciled_at: new Date().toISOString(),
      }

      // Upsert — use ticket_number + item_type + worker name as natural key
      const { error: upsertErr } = await supabase
        .from('reconciliation_line_items')
        .upsert(record, {
          onConflict: 'organization_id,ticket_number,item_type,lem_worker_name',
          ignoreDuplicates: false,
        })

      if (upsertErr) {
        // Fallback: try insert
        const { error: insertErr } = await supabase
          .from('reconciliation_line_items')
          .insert(record)
        if (insertErr) throw insertErr
      }

      setLineStatuses(prev => ({ ...prev, [key]: { status, notes } }))
    } catch (e) {
      console.error('Failed to save reconciliation decision:', e)
      alert('Failed to save decision: ' + e.message)
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }))
    }
  }, [organizationId, ticketNumber])

  // ── Bulk actions ──
  const bulkAcceptReconciled = useCallback(async () => {
    const reconciled = matchedRows.filter(r => r.category === 'reconciled')
    for (const row of reconciled) {
      const key = `${row.type}-${row.name}`
      if (!lineStatuses[key]?.status) {
        await saveDecision(row, 'accepted')
      }
    }
  }, [matchedRows, lineStatuses, saveDecision])

  const bulkDisputeViolations = useCallback(async () => {
    const violations = matchedRows.filter(r => r.category === 'contract_violation')
    for (const row of violations) {
      const key = `${row.type}-${row.name}`
      if (!lineStatuses[key]?.status) {
        await saveDecision(row, 'disputed', 'Contract violation — split does not match contract rules')
      }
    }
  }, [matchedRows, lineStatuses, saveDecision])

  const bulkFlagGhosts = useCallback(async () => {
    const ghosts = matchedRows.filter(r => r.category === 'ghost_on_lem')
    for (const row of ghosts) {
      const key = `${row.type}-${row.name}`
      if (!lineStatuses[key]?.status) {
        await saveDecision(row, 'disputed', 'Ghost worker — not on inspector report')
      }
    }
  }, [matchedRows, lineStatuses, saveDecision])

  // ── Rendering ──

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
        Loading variance comparison data...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '16px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
        Error loading variance data: {error}
      </div>
    )
  }

  if (!matchedRows.length) {
    return (
      <div style={{ padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#6b7280', fontSize: '13px', textAlign: 'center' }}>
        No labour data to compare. Upload a LEM and ensure the inspector report has labour entries for this ticket.
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#fff' }}>
      {/* ── Summary Banner ── */}
      <div style={{ padding: '16px 20px', backgroundColor: '#f8fafc', borderBottom: '2px solid #1e3a5f' }}>
        <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e3a5f', marginBottom: '10px' }}>
          LEM Variance Analysis — Ticket #{ticketNumber}
          {reportDate && <span style={{ fontWeight: '400', fontSize: '13px', color: '#6b7280', marginLeft: '12px' }}>{reportDate}</span>}
          {projectRules?.province && <span style={{ fontWeight: '400', fontSize: '13px', color: '#6b7280', marginLeft: '8px' }}>({projectRules.province})</span>}
          {holiday && <span style={{ fontWeight: '400', fontSize: '12px', color: '#dc2626', marginLeft: '8px' }}>Stat Holiday: {holiday.name}</span>}
        </div>

        {summary.needsReview > 0 && (
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', marginBottom: '8px' }}>
            {summary.needsReview} item{summary.needsReview !== 1 ? 's' : ''} need review before this LEM can be approved
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '13px', marginBottom: '12px' }}>
          {summary.counts.contract_violation > 0 && (
            <span style={{ color: CATEGORY_COLORS.contract_violation }}>
              {CATEGORY_ICONS.contract_violation} {summary.counts.contract_violation} contract violation{summary.counts.contract_violation !== 1 ? 's' : ''} (net {formatCurrency(summary.costs.contract_violation)})
            </span>
          )}
          {summary.counts.hours_dispute > 0 && (
            <span style={{ color: CATEGORY_COLORS.hours_dispute }}>
              {CATEGORY_ICONS.hours_dispute} {summary.counts.hours_dispute} hours dispute{summary.counts.hours_dispute !== 1 ? 's' : ''} (net {formatCurrency(summary.costs.hours_dispute)})
            </span>
          )}
          {summary.counts.missing_on_lem > 0 && (
            <span style={{ color: CATEGORY_COLORS.missing_on_lem }}>
              {CATEGORY_ICONS.missing_on_lem} {summary.counts.missing_on_lem} missing on LEM ({formatCurrency(summary.costs.missing_on_lem)})
            </span>
          )}
          {summary.counts.ghost_on_lem > 0 && (
            <span style={{ color: CATEGORY_COLORS.ghost_on_lem }}>
              {CATEGORY_ICONS.ghost_on_lem} {summary.counts.ghost_on_lem} ghost worker{summary.counts.ghost_on_lem !== 1 ? 's' : ''} on LEM ({formatCurrency(summary.costs.ghost_on_lem)})
            </span>
          )}
          {summary.counts.reconciled > 0 && (
            <span style={{ color: CATEGORY_COLORS.reconciled }}>
              {CATEGORY_ICONS.reconciled} {summary.counts.reconciled} reconciled
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#475569' }}>
          <div>Total LEM cost if accepted as-is: <strong>{formatCurrency(summary.totalLemCost)}</strong></div>
          <div>Total cost per contract rules: <strong>{formatCurrency(summary.totalContractCost)}</strong></div>
          <div style={{ fontWeight: '700', color: summary.netVariance > 0.01 ? '#dc2626' : summary.netVariance < -0.01 ? '#ea580c' : '#16a34a' }}>
            Net variance: {summary.netVariance > 0.01 ? `LEM overbilled by ${formatCurrency(summary.netVariance)}` :
                          summary.netVariance < -0.01 ? `LEM underbilled by ${formatCurrency(Math.abs(summary.netVariance))}` :
                          'No variance'}
          </div>
        </div>
      </div>

      {/* ── Bulk Actions ── */}
      <div style={{ padding: '10px 20px', backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {summary.counts.reconciled > 0 && (
          <button onClick={bulkAcceptReconciled} style={bulkBtnStyle('#16a34a')}>
            Accept All Reconciled ({summary.counts.reconciled})
          </button>
        )}
        {summary.counts.contract_violation > 0 && (
          <button onClick={bulkDisputeViolations} style={bulkBtnStyle('#dc2626')}>
            Dispute All Contract Violations ({summary.counts.contract_violation})
          </button>
        )}
        {summary.counts.ghost_on_lem > 0 && (
          <button onClick={bulkFlagGhosts} style={bulkBtnStyle('#dc2626')}>
            Flag All Ghost Workers ({summary.counts.ghost_on_lem})
          </button>
        )}
      </div>

      {/* ── Per-Row Display ── */}
      <div style={{ padding: '8px 0' }}>
        {matchedRows.map((row, idx) => {
          const key = `${row.type}-${row.name}`
          const savedStatus = lineStatuses[key]
          const isSaving = saving[key]
          const borderColor = CATEGORY_COLORS[row.category] || '#e2e8f0'

          return (
            <div
              key={idx}
              style={{
                margin: '6px 16px',
                padding: '12px 16px',
                borderLeft: `4px solid ${borderColor}`,
                borderRadius: '6px',
                backgroundColor: savedStatus?.status ? '#f8fafc' : '#fff',
                border: `1px solid ${borderColor}20`,
                borderLeftWidth: '4px',
                borderLeftColor: borderColor,
              }}
            >
              {/* Row header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e3a5f' }}>
                  <span style={{ marginRight: '6px' }}>{CATEGORY_ICONS[row.category]}</span>
                  {row.name}
                  {row.classification && (
                    <span style={{ fontWeight: '400', color: '#6b7280', marginLeft: '8px', fontSize: '12px' }}>
                      ({row.classification})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                  <span style={{ backgroundColor: `${borderColor}15`, color: borderColor, padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>
                    {CATEGORY_LABELS[row.category]}
                  </span>
                  {row.matchMethod !== 'none' && row.matchMethod !== 'exact' && (
                    <span style={{ marginLeft: '6px' }}>Match: {row.matchMethod} ({Math.round(row.confidence * 100)}%)</span>
                  )}
                </div>
              </div>

              {/* Three-line comparison */}
              <div style={{ fontSize: '13px', fontFamily: 'monospace', lineHeight: '1.8' }}>
                {/* LEM line */}
                {row.lemEntry && (
                  <div style={{ color: '#475569' }}>
                    <span style={{ display: 'inline-block', width: '130px', fontWeight: '600', fontFamily: 'inherit' }}>LEM claims:</span>
                    <span style={{ display: 'inline-block', width: '80px', textAlign: 'right' }}>{num(row.lemSplit.rt_hours).toFixed(1)} RT</span>
                    <span style={{ display: 'inline-block', width: '80px', textAlign: 'right' }}>{num(row.lemSplit.ot_hours).toFixed(1)} OT</span>
                    <span style={{ display: 'inline-block', width: '80px', textAlign: 'right' }}>{num(row.lemSplit.dt_hours).toFixed(1)} DT</span>
                    <span style={{ marginLeft: '16px', fontWeight: '600' }}>{formatCurrency(row.lemCost)}</span>
                  </div>
                )}

                {/* Contract line */}
                <div style={{ color: '#1e3a5f' }}>
                  <span style={{ display: 'inline-block', width: '130px', fontWeight: '600', fontFamily: 'inherit' }}>Contract rules:</span>
                  <span style={{ display: 'inline-block', width: '80px', textAlign: 'right' }}>{num(row.contractSplit.rt_hours).toFixed(1)} RT</span>
                  <span style={{ display: 'inline-block', width: '80px', textAlign: 'right' }}>{num(row.contractSplit.ot_hours).toFixed(1)} OT</span>
                  <span style={{ display: 'inline-block', width: '80px', textAlign: 'right' }}>{num(row.contractSplit.dt_hours).toFixed(1)} DT</span>
                  <span style={{ marginLeft: '16px', fontWeight: '600' }}>{formatCurrency(row.contractCost)}</span>
                </div>

                {/* Inspector line */}
                {row.inspEntry && (
                  <div style={{ color: '#059669' }}>
                    <span style={{ display: 'inline-block', width: '130px', fontWeight: '600', fontFamily: 'inherit' }}>Inspector:</span>
                    <span style={{ display: 'inline-block', width: '80px', textAlign: 'right' }}>{num(row.inspectorSplit.rt_hours).toFixed(1)} RT</span>
                    <span style={{ display: 'inline-block', width: '80px', textAlign: 'right' }}>{num(row.inspectorSplit.ot_hours).toFixed(1)} OT</span>
                    <span style={{ display: 'inline-block', width: '80px', textAlign: 'right' }}>{num(row.inspectorSplit.dt_hours).toFixed(1)} DT</span>
                    {row.category === 'reconciled' && <span style={{ marginLeft: '16px', color: '#16a34a' }}>{CATEGORY_ICONS.reconciled} matches contract</span>}
                  </div>
                )}
              </div>

              {/* Rule description */}
              {row.ruleDescription && (
                <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic', marginTop: '4px' }}>
                  Rule: {row.ruleDescription}
                </div>
              )}

              {/* Dollar impact */}
              {Math.abs(row.dollarImpact) > 0.01 && (
                <div style={{
                  fontSize: '13px', fontWeight: '600', marginTop: '4px',
                  color: row.dollarImpact > 0 ? '#dc2626' : '#ea580c',
                }}>
                  Variance: LEM {row.dollarImpact > 0 ? 'overbilled' : 'underbilled'} by {formatCurrency(Math.abs(row.dollarImpact))}
                </div>
              )}

              {/* Status badge if already decided */}
              {savedStatus?.status && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: savedStatus.status === 'accepted' ? '#16a34a' : '#dc2626', fontWeight: '600' }}>
                  {savedStatus.status === 'accepted' ? 'ACCEPTED' : 'DISPUTED'}
                  {savedStatus.notes && <span style={{ fontWeight: '400', color: '#6b7280', marginLeft: '8px' }}>— {savedStatus.notes}</span>}
                </div>
              )}

              {/* Action buttons */}
              {!savedStatus?.status && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  {row.category === 'reconciled' && (
                    <button
                      onClick={() => saveDecision(row, 'accepted')}
                      disabled={isSaving}
                      style={actionBtnStyle('#16a34a', isSaving)}
                    >
                      {isSaving ? 'Saving...' : 'Accept'}
                    </button>
                  )}

                  {row.category === 'contract_violation' && (
                    <>
                      <button
                        onClick={() => saveDecision(row, 'accepted', 'Accepted LEM as-is despite contract violation')}
                        disabled={isSaving}
                        style={actionBtnStyle('#6b7280', isSaving)}
                      >
                        Accept LEM as-is
                      </button>
                      <button
                        onClick={() => saveDecision(row, 'disputed', 'Contract violation — split does not match contract rules')}
                        disabled={isSaving}
                        style={actionBtnStyle('#dc2626', isSaving)}
                      >
                        Dispute — request correction
                      </button>
                    </>
                  )}

                  {row.category === 'hours_dispute' && (
                    <>
                      <button
                        onClick={() => saveDecision(row, 'accepted', 'Accepted LEM hours despite inspector discrepancy')}
                        disabled={isSaving}
                        style={actionBtnStyle('#6b7280', isSaving)}
                      >
                        Accept LEM as-is
                      </button>
                      <button
                        onClick={() => saveDecision(row, 'disputed', 'Hours dispute — LEM hours do not match inspector record')}
                        disabled={isSaving}
                        style={actionBtnStyle('#eab308', isSaving)}
                      >
                        Dispute — request correction
                      </button>
                    </>
                  )}

                  {row.category === 'missing_on_lem' && (
                    <button
                      onClick={() => saveDecision(row, 'disputed', 'Worker present on inspector report but missing on LEM')}
                      disabled={isSaving}
                      style={actionBtnStyle('#ea580c', isSaving)}
                    >
                      Dispute — not on LEM
                    </button>
                  )}

                  {row.category === 'ghost_on_lem' && (
                    <button
                      onClick={() => saveDecision(row, 'disputed', 'Ghost worker — not on inspector report')}
                      disabled={isSaving}
                      style={actionBtnStyle('#dc2626', isSaving)}
                    >
                      Dispute — ghost worker
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Style helpers ──

function bulkBtnStyle(color) {
  return {
    padding: '6px 14px',
    backgroundColor: color,
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
  }
}

function actionBtnStyle(color, disabled) {
  return {
    padding: '5px 12px',
    backgroundColor: disabled ? '#d1d5db' : color,
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    opacity: disabled ? 0.6 : 1,
  }
}
