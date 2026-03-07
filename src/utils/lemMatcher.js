/**
 * LEM Line Item Matching Engine
 *
 * Matches LEM line items to inspector report activity blocks using:
 *   1. Exact ticket number match
 *   2. Normalized ticket number match
 *   3. Date + crew/foreman fallback
 *
 * Then calculates variance between LEM claims and inspector-verified data.
 */

import { ticketNumbersMatch, normalizeTicketNumber } from './ticketNormalizer.js'

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
 * Calculate variance between a LEM line item and an inspector activity block
 */
export function calculateVariance(lemItem, inspectorBlock) {
  const details = []

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
      field: 'total_labour_hours',
      lem_value: lemLabourHours,
      inspector_value: inspLabourHours,
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
      field: 'total_equipment_hours',
      lem_value: lemEquipHours,
      inspector_value: inspEquipHours,
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
      lem_value: lemEquipCount,
      inspector_value: inspEquipCount,
      difference: lemEquipCount - inspEquipCount,
      severity: 'high'
    })
  }

  // --- COST COMPARISON ---
  const lemLabourCost = parseFloat(lemItem.total_labour_cost) || 0
  const lemEquipCost = parseFloat(lemItem.total_equipment_cost) || 0

  return {
    has_variance: details.length > 0,
    labour_hour_variance: labourHourVar,
    equipment_hour_variance: equipHourVar,
    labour_headcount_variance: lemHeadcount - inspHeadcount,
    equipment_count_variance: lemEquipCount - inspEquipCount,
    labour_cost_claimed: lemLabourCost,
    equipment_cost_claimed: lemEquipCost,
    details
  }
}

/**
 * Run matching + variance calculation for all line items in a LEM
 */
export function reconcileLEM(lineItems, reports) {
  return lineItems.map(item => {
    const match = findMatch(item, reports)
    if (!match) {
      return { ...item, match_status: 'unmatched', match_confidence: 'none', variance_data: null, matched_report_id: null, matched_block_index: null }
    }

    const variance = calculateVariance(item, match.block)
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
