/**
 * LEM Line Item Matching Engine
 *
 * Matches LEM line items to inspector report activity blocks using:
 *   1. Exact ticket number match
 *   2. Normalized ticket number match
 *   3. Date + crew/foreman fallback
 *
 * Then calculates variance between LEM claims and inspector-verified data,
 * including rate-card-based independent cost verification that flags both
 * hour variances AND rate variances separately.
 */

import { ticketNumbersMatch, normalizeTicketNumber } from './ticketNormalizer.js'

/**
 * Fuzzy match a classification string against rate card entries.
 * Same logic as LEMReconciliation.jsx findBestMatch.
 */
function findRateMatch(search, candidates, keyFn) {
  if (!search || !candidates || candidates.length === 0) return null
  const s = (typeof search === 'string' ? search : String(search)).toLowerCase().trim()
  if (!s) return null
  // Exact
  let match = candidates.find(c => { try { return (keyFn(c) || '').toLowerCase().trim() === s } catch { return false } })
  if (match) return match
  // Contains
  match = candidates.find(c => {
    try { const k = (keyFn(c) || '').toLowerCase().trim(); return k && (k.includes(s) || s.includes(k)) } catch { return false }
  })
  if (match) return match
  // Word overlap
  const sWords = s.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean)
  if (sWords.length === 0) return null
  let bestScore = 0, best = null
  for (const c of candidates) {
    try {
      const k = (keyFn(c) || '').toLowerCase().trim()
      if (!k) continue
      const kWords = k.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean)
      const shared = sWords.filter(w => kWords.some(kw => kw.includes(w) || w.includes(kw))).length
      const score = shared / Math.max(sWords.length, kWords.length, 1)
      if (score > bestScore && score >= 0.5) { bestScore = score; best = c }
    } catch { continue }
  }
  return best
}

/**
 * Match a single LEM line item against all inspector reports
 * @param {Object} lemItem - The LEM line item
 * @param {Array} reports - All inspector reports (daily_reports rows with activity_blocks)
 * @returns {{ report, blockIndex, confidence }} or null
 */
export function findMatch(lemItem, reports) {
  const lemTicket = normalizeTicketNumber(lemItem.ticket_number)

  // STRATEGY 1 & 2: Ticket number match (exact and normalized)
  for (const report of reports) {
    const blocks = report.activity_blocks || []
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      if (ticketNumbersMatch(lemItem.ticket_number, block.ticketNumber)) {
        const isExact = normalizeTicketNumber(block.ticketNumber) === lemTicket
        return {
          report,
          blockIndex: i,
          block,
          confidence: isExact ? 'exact' : 'normalized'
        }
      }
    }
  }

  // STRATEGY 3: Date + foreman/crew match
  if (lemItem.work_date) {
    for (const report of reports) {
      if (report.date !== lemItem.work_date && report.selected_date !== lemItem.work_date) continue
      const blocks = report.activity_blocks || []
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        const foremanMatch = lemItem.foreman && block.foreman &&
          (block.foreman.toLowerCase().includes(lemItem.foreman.toLowerCase().split(' ')[0]) ||
           lemItem.foreman.toLowerCase().includes(block.foreman.toLowerCase().split(' ')[0]))
        const crewMatch = lemItem.crew_name && block.contractor &&
          block.contractor.toLowerCase().includes(lemItem.crew_name.toLowerCase().split(' ')[0])
        if (foremanMatch || crewMatch) {
          return {
            report,
            blockIndex: i,
            block,
            confidence: 'date_crew'
          }
        }
      }
    }
  }

  return null
}

/**
 * Calculate variance between a LEM line item and an inspector activity block.
 * If rate cards are provided, also computes independent cost (inspector hours × agreed rates)
 * and flags hour variances AND rate variances separately.
 *
 * @param {Object} lemItem - LEM line item with labour_entries, equipment_entries, totals
 * @param {Object} inspectorBlock - Inspector activity block with labourEntries, equipmentEntries
 * @param {Object} [rateCards] - { labourRates: [], equipmentRates: [] }
 */
export function calculateVariance(lemItem, inspectorBlock, rateCards) {
  const details = []
  const labourRates = rateCards?.labourRates || []
  const equipmentRates = rateCards?.equipmentRates || []

  // --- LABOUR COMPARISON ---
  const lemLabour = lemItem.labour_entries || []
  const inspLabour = inspectorBlock.labourEntries || []

  const lemLabourHours = lemLabour.reduce((sum, e) =>
    sum + (parseFloat(e.rt_hours) || 0) + (parseFloat(e.ot_hours) || 0) + (parseFloat(e.jh_hours) || 0), 0)
  const inspLabourHours = inspLabour.reduce((sum, e) =>
    sum + (parseFloat(e.rt) || parseFloat(e.hours) || 0) + (parseFloat(e.ot) || 0) + (parseFloat(e.jh) || 0), 0)

  const labourHourVar = Math.round((lemLabourHours - inspLabourHours) * 10) / 10
  if (labourHourVar !== 0) {
    details.push({
      field: 'labour_hours',
      category: 'hours',
      lem_value: Math.round(lemLabourHours * 10) / 10,
      inspector_value: Math.round(inspLabourHours * 10) / 10,
      difference: labourHourVar,
      severity: Math.abs(labourHourVar) > 8 ? 'high' : 'medium'
    })
  }

  // Headcount
  const lemHeadcount = lemLabour.reduce((sum, e) => sum + (parseInt(e.count) || 1), 0)
  const inspHeadcount = inspLabour.length
  if (lemHeadcount !== inspHeadcount) {
    details.push({
      field: 'labour_headcount',
      category: 'hours',
      lem_value: lemHeadcount,
      inspector_value: inspHeadcount,
      difference: lemHeadcount - inspHeadcount,
      severity: 'high'
    })
  }

  // --- EQUIPMENT COMPARISON ---
  const lemEquip = lemItem.equipment_entries || []
  const inspEquip = inspectorBlock.equipmentEntries || []

  const lemEquipHours = lemEquip.reduce((sum, e) =>
    sum + (parseFloat(e.hours) || 0) * (parseInt(e.count) || 1), 0)
  const inspEquipHours = inspEquip.reduce((sum, e) =>
    sum + (parseFloat(e.hours) || 0) * (parseInt(e.count) || 1), 0)

  const equipHourVar = Math.round((lemEquipHours - inspEquipHours) * 10) / 10
  if (equipHourVar !== 0) {
    details.push({
      field: 'equipment_hours',
      category: 'hours',
      lem_value: Math.round(lemEquipHours * 10) / 10,
      inspector_value: Math.round(inspEquipHours * 10) / 10,
      difference: equipHourVar,
      severity: Math.abs(equipHourVar) > 10 ? 'high' : 'medium'
    })
  }

  // Equipment count
  const lemEquipCount = lemEquip.reduce((sum, e) => sum + (parseInt(e.count) || 1), 0)
  const inspEquipCount = inspEquip.length
  if (lemEquipCount !== inspEquipCount) {
    details.push({
      field: 'equipment_count',
      category: 'hours',
      lem_value: lemEquipCount,
      inspector_value: inspEquipCount,
      difference: lemEquipCount - inspEquipCount,
      severity: 'high'
    })
  }

  // --- COST COMPARISON (rate-card-based) ---
  const lemLabourCost = parseFloat(lemItem.total_labour_cost) || 0
  const lemEquipCost = parseFloat(lemItem.total_equipment_cost) || 0
  const contractorTotalCost = lemLabourCost + lemEquipCost

  // Independent cost = inspector-verified hours × agreed rate card rates
  let independentLabourCost = 0
  let independentEquipCost = 0
  let labourRateIssues = [] // individual rate mismatches
  let equipRateIssues = []

  if (labourRates.length > 0) {
    for (const entry of inspLabour) {
      const classification = entry.classification || entry.trade || ''
      const rate = findRateMatch(classification, labourRates, r => r.classification || '')
      const rt = parseFloat(entry.rt || entry.hours || 0) || 0
      const ot = parseFloat(entry.ot || 0) || 0
      if (rate) {
        const stRate = parseFloat(rate.rate_st) || 0
        const otRate = parseFloat(rate.rate_ot) || 0
        independentLabourCost += (rt * stRate) + (ot * otRate)
      }
    }

    // Check if contractor's per-entry rates differ from rate card
    for (const entry of lemLabour) {
      const classification = entry.classification || ''
      const rate = findRateMatch(classification, labourRates, r => r.classification || '')
      if (rate && entry.rate) {
        const agreedRate = parseFloat(rate.rate_st) || 0
        const claimedRate = parseFloat(entry.rate) || 0
        if (agreedRate > 0 && claimedRate > 0 && Math.abs(claimedRate - agreedRate) > 0.01) {
          labourRateIssues.push({
            classification,
            agreed_rate: agreedRate,
            claimed_rate: claimedRate,
            difference: Math.round((claimedRate - agreedRate) * 100) / 100
          })
        }
      }
    }
  }

  if (equipmentRates.length > 0) {
    for (const entry of inspEquip) {
      const eqType = entry.type || entry.equipmentType || ''
      const rate = findRateMatch(eqType, equipmentRates, r => r.equipment_type || '')
      const hrs = parseFloat(entry.hours || 0) || 0
      const count = parseInt(entry.count || 1) || 1
      if (rate) {
        independentEquipCost += hrs * count * (parseFloat(rate.rate_hourly) || 0)
      }
    }

    for (const entry of lemEquip) {
      const eqType = entry.equipment_type || ''
      const rate = findRateMatch(eqType, equipmentRates, r => r.equipment_type || '')
      if (rate && entry.rate) {
        const agreedRate = parseFloat(rate.rate_hourly) || 0
        const claimedRate = parseFloat(entry.rate) || 0
        if (agreedRate > 0 && claimedRate > 0 && Math.abs(claimedRate - agreedRate) > 0.01) {
          equipRateIssues.push({
            equipment_type: eqType,
            agreed_rate: agreedRate,
            claimed_rate: claimedRate,
            difference: Math.round((claimedRate - agreedRate) * 100) / 100
          })
        }
      }
    }
  }

  independentLabourCost = Math.round(independentLabourCost * 100) / 100
  independentEquipCost = Math.round(independentEquipCost * 100) / 100
  const independentTotalCost = independentLabourCost + independentEquipCost

  // Cost variance: contractor claim vs independent calculation
  const costVariance = Math.round((contractorTotalCost - independentTotalCost) * 100) / 100
  const hasRateCards = labourRates.length > 0 || equipmentRates.length > 0

  if (hasRateCards && independentTotalCost > 0 && Math.abs(costVariance) > 1) {
    // Decompose: how much is from hour padding vs rate inflation?
    // Hour variance cost = (contractor hours - inspector hours) × agreed rates
    // Rate variance cost = contractor hours × (claimed rate - agreed rate)
    // For simplicity at the total level:
    const hourVarianceCost = independentTotalCost > 0
      ? Math.round(((lemLabourHours - inspLabourHours) / (inspLabourHours || 1)) * independentTotalCost * 100) / 100
      : 0
    const rateVarianceCost = Math.round((costVariance - hourVarianceCost) * 100) / 100

    details.push({
      field: 'total_cost_variance',
      category: 'cost',
      lem_value: contractorTotalCost,
      inspector_value: independentTotalCost,
      difference: costVariance,
      severity: Math.abs(costVariance) > 500 ? 'high' : 'medium'
    })

    if (Math.abs(hourVarianceCost) > 1) {
      details.push({
        field: 'cost_from_hour_padding',
        category: 'cost',
        lem_value: null,
        inspector_value: null,
        difference: hourVarianceCost,
        severity: Math.abs(hourVarianceCost) > 250 ? 'high' : 'medium',
        description: 'Extra cost due to claiming more hours than inspector verified'
      })
    }

    if (Math.abs(rateVarianceCost) > 1) {
      details.push({
        field: 'cost_from_rate_inflation',
        category: 'cost',
        lem_value: null,
        inspector_value: null,
        difference: rateVarianceCost,
        severity: Math.abs(rateVarianceCost) > 250 ? 'high' : 'medium',
        description: 'Extra cost due to billing at rates above the agreed rate card'
      })
    }
  }

  // Flag individual rate card mismatches
  if (labourRateIssues.length > 0) {
    details.push({
      field: 'labour_rate_mismatches',
      category: 'rates',
      lem_value: labourRateIssues.length,
      inspector_value: 0,
      difference: labourRateIssues.length,
      severity: 'high',
      rate_issues: labourRateIssues
    })
  }

  if (equipRateIssues.length > 0) {
    details.push({
      field: 'equipment_rate_mismatches',
      category: 'rates',
      lem_value: equipRateIssues.length,
      inspector_value: 0,
      difference: equipRateIssues.length,
      severity: 'high',
      rate_issues: equipRateIssues
    })
  }

  return {
    has_variance: details.length > 0,
    labour_hour_variance: labourHourVar,
    equipment_hour_variance: equipHourVar,
    labour_headcount_variance: lemHeadcount - inspHeadcount,
    equipment_count_variance: lemEquipCount - inspEquipCount,
    // Cost data
    contractor_labour_cost: lemLabourCost,
    contractor_equipment_cost: lemEquipCost,
    contractor_total_cost: contractorTotalCost,
    independent_labour_cost: independentLabourCost,
    independent_equipment_cost: independentEquipCost,
    independent_total_cost: independentTotalCost,
    cost_variance: costVariance,
    labour_rate_issues: labourRateIssues,
    equipment_rate_issues: equipRateIssues,
    details
  }
}

/**
 * Run matching + variance calculation for all line items in a LEM
 * @param {Array} lineItems - LEM line items
 * @param {Array} reports - Inspector daily reports
 * @param {Object} [rateCards] - { labourRates: [], equipmentRates: [] }
 */
export function reconcileLEM(lineItems, reports, rateCards) {
  return lineItems.map(item => {
    const match = findMatch(item, reports)
    if (!match) {
      return { ...item, match_status: 'unmatched', match_confidence: 'none', variance_data: null, matched_report_id: null, matched_block_index: null }
    }

    const variance = calculateVariance(item, match.block, rateCards)
    return {
      ...item,
      matched_report_id: match.report.id,
      matched_block_index: match.blockIndex,
      match_confidence: match.confidence,
      match_status: variance.has_variance ? 'variance' : 'clean',
      variance_data: variance,
      _matched_block: match.block,
      _matched_report: match.report
    }
  })
}
