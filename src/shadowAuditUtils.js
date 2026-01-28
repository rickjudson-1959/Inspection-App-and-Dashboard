// shadowAuditUtils.js - Efficiency Audit Calculations
// Captures actual productive output versus billed hours for equipment and labor entries
// Supports both Asset-Specific and Systemic Crew-Wide delays

import { productionStatuses, defaultRates, dragReasonCategories } from './constants.js'

/**
 * Get multiplier for a production status
 * @param {string} status - Production status ('ACTIVE', 'SYNC_DELAY', 'MANAGEMENT_DRAG')
 * @returns {number} - Multiplier (1.0, 0.7, or 0.0)
 */
export function getStatusMultiplier(status) {
  const statusConfig = productionStatuses.find(s => s.value === status)
  return statusConfig ? statusConfig.multiplier : 1.0
}

/**
 * Check if a drag reason defaults to systemic (entire crew) impact
 * @param {string} dragReason - The drag reason value
 * @returns {boolean} - True if the reason defaults to systemic impact
 */
export function isSystemicReason(dragReason) {
  if (!dragReason) return false
  const reason = dragReasonCategories.find(r => r.value === dragReason || r.label === dragReason)
  return reason?.defaultSystemic || false
}

/**
 * Calculate shadow effective hours for a single entry
 * Shadow Effective Hours = Billed Hours × Multiplier (with manual override option)
 * @param {number} billedHours - Total hours billed
 * @param {string} status - Production status
 * @param {number|null} manualOverride - Manual override value (null = use auto-calc)
 * @returns {number} - Shadow effective hours
 */
export function calculateShadowHours(billedHours, status, manualOverride = null) {
  // If manual override is provided (not null/undefined), use it
  if (manualOverride !== null && manualOverride !== undefined) {
    return parseFloat(manualOverride) || 0
  }

  const multiplier = getStatusMultiplier(status)
  return (parseFloat(billedHours) || 0) * multiplier
}

/**
 * Calculate total billed hours for a block (labour + equipment)
 * @param {object} block - Activity block with labourEntries and equipmentEntries
 * @returns {number} - Total billed hours
 */
export function calculateTotalBilledHours(block) {
  let total = 0

  // Labour hours: (RT + OT) * count for each entry
  if (block.labourEntries) {
    for (const entry of block.labourEntries) {
      const rt = parseFloat(entry.rt) || 0
      const ot = parseFloat(entry.ot) || 0
      const count = parseFloat(entry.count) || 1
      total += (rt + ot) * count
    }
  }

  // Equipment hours: hours * count for each entry
  if (block.equipmentEntries) {
    for (const entry of block.equipmentEntries) {
      const hours = parseFloat(entry.hours) || 0
      const count = parseFloat(entry.count) || 1
      total += hours * count
    }
  }

  return total
}

/**
 * Calculate total shadow effective hours for a block
 * Handles both asset-specific and systemic delays
 * @param {object} block - Activity block with labourEntries, equipmentEntries, and optional systemicDelay
 * @returns {number} - Total shadow effective hours
 */
export function calculateTotalShadowHours(block) {
  // Check for systemic (entire crew) delay at block level
  const systemicDelay = block.systemicDelay
  if (systemicDelay?.active && systemicDelay?.status !== 'ACTIVE') {
    // Apply systemic multiplier to ALL entries
    const totalBilled = calculateTotalBilledHours(block)
    const multiplier = getStatusMultiplier(systemicDelay.status)
    return totalBilled * multiplier
  }

  // Otherwise, calculate per-entry shadow hours
  let total = 0

  // Labour shadow hours
  if (block.labourEntries) {
    for (const entry of block.labourEntries) {
      const rt = parseFloat(entry.rt) || 0
      const ot = parseFloat(entry.ot) || 0
      const count = parseFloat(entry.count) || 1
      const billedHours = (rt + ot) * count
      const status = entry.productionStatus || 'ACTIVE'
      const shadow = calculateShadowHours(billedHours, status, entry.shadowEffectiveHours)
      total += shadow
    }
  }

  // Equipment shadow hours
  if (block.equipmentEntries) {
    for (const entry of block.equipmentEntries) {
      const hours = parseFloat(entry.hours) || 0
      const count = parseFloat(entry.count) || 1
      const billedHours = hours * count
      const status = entry.productionStatus || 'ACTIVE'
      const shadow = calculateShadowHours(billedHours, status, entry.shadowEffectiveHours)
      total += shadow
    }
  }

  return total
}

/**
 * Calculate inertia ratio (efficiency percentage)
 * Inertia Ratio = (Shadow Hours / Billed Hours) * 100
 * @param {object} block - Activity block
 * @returns {number} - Percentage (0-100)
 */
export function calculateInertiaRatio(block) {
  const billed = calculateTotalBilledHours(block)
  if (billed === 0) return 100 // No hours = 100% efficient

  const shadow = calculateTotalShadowHours(block)
  return (shadow / billed) * 100
}

/**
 * Calculate total burn rate for a block ($/hour)
 * @param {object} block - Activity block
 * @param {object} labourRates - Rate lookup by classification { [classification]: rate }
 * @param {object} equipmentRates - Rate lookup by equipment type { [type]: rate }
 * @returns {number} - Total hourly burn rate in dollars
 */
export function calculateBlockBurnRate(block, labourRates = {}, equipmentRates = {}) {
  let totalBurnRate = 0

  // Labour burn rate
  if (block.labourEntries) {
    for (const entry of block.labourEntries) {
      const count = parseFloat(entry.count) || 1
      const rate = labourRates[entry.classification] || defaultRates.labour
      totalBurnRate += rate * count
    }
  }

  // Equipment burn rate
  if (block.equipmentEntries) {
    for (const entry of block.equipmentEntries) {
      const count = parseFloat(entry.count) || 1
      const rate = equipmentRates[entry.type] || defaultRates.equipment
      totalBurnRate += rate * count
    }
  }

  return totalBurnRate
}

/**
 * Calculate value lost due to inefficiency
 * Value Lost = (Billed - Shadow) × Hourly Burn Rate
 * For systemic delays: uses total block burn rate
 * @param {object} block - Activity block
 * @param {object} labourRates - Rate lookup by classification { [classification]: rate }
 * @param {object} equipmentRates - Rate lookup by equipment type { [type]: rate }
 * @returns {number} - Total value lost in dollars
 */
export function calculateValueLost(block, labourRates = {}, equipmentRates = {}) {
  const systemicDelay = block.systemicDelay

  // For systemic delays, calculate based on total block burn rate
  if (systemicDelay?.active && systemicDelay?.status !== 'ACTIVE') {
    const totalBilled = calculateTotalBilledHours(block)
    const totalShadow = calculateTotalShadowHours(block)
    const hoursLost = totalBilled - totalShadow
    const blockBurnRate = calculateBlockBurnRate(block, labourRates, equipmentRates)

    // Value lost = hours lost × (burn rate / entries count) × entries count
    // Simplified: hoursLost × average hourly burn rate
    const avgBilledPerHour = totalBilled > 0 ? blockBurnRate : 0
    return hoursLost * avgBilledPerHour
  }

  // For asset-specific delays, calculate per-entry
  let totalValueLost = 0

  // Labour value lost
  if (block.labourEntries) {
    for (const entry of block.labourEntries) {
      const rt = parseFloat(entry.rt) || 0
      const ot = parseFloat(entry.ot) || 0
      const count = parseFloat(entry.count) || 1
      const billedHours = (rt + ot) * count
      const status = entry.productionStatus || 'ACTIVE'
      const shadowHours = calculateShadowHours(billedHours, status, entry.shadowEffectiveHours)
      const hoursLost = billedHours - shadowHours

      // Get rate from lookup or use default
      const rate = labourRates[entry.classification] || defaultRates.labour
      totalValueLost += hoursLost * rate
    }
  }

  // Equipment value lost
  if (block.equipmentEntries) {
    for (const entry of block.equipmentEntries) {
      const hours = parseFloat(entry.hours) || 0
      const count = parseFloat(entry.count) || 1
      const billedHours = hours * count
      const status = entry.productionStatus || 'ACTIVE'
      const shadowHours = calculateShadowHours(billedHours, status, entry.shadowEffectiveHours)
      const hoursLost = billedHours - shadowHours

      // Get rate from lookup or use default
      const rate = equipmentRates[entry.type] || defaultRates.equipment
      totalValueLost += hoursLost * rate
    }
  }

  return totalValueLost
}

/**
 * Determine if block has an active systemic delay
 * @param {object} block - Activity block
 * @returns {boolean} - True if systemic delay is active
 */
export function hasSystemicDelay(block) {
  return block.systemicDelay?.active && block.systemicDelay?.status !== 'ACTIVE'
}

/**
 * Get the delay type classification
 * @param {object} block - Activity block
 * @returns {string} - 'NONE', 'ASSET_SPECIFIC', or 'SYSTEMIC'
 */
export function getDelayType(block) {
  if (hasSystemicDelay(block)) {
    return 'SYSTEMIC'
  }

  // Check if any individual entries have delays
  const hasLabourDelays = block.labourEntries?.some(e => e.productionStatus && e.productionStatus !== 'ACTIVE')
  const hasEquipmentDelays = block.equipmentEntries?.some(e => e.productionStatus && e.productionStatus !== 'ACTIVE')

  if (hasLabourDelays || hasEquipmentDelays) {
    return 'ASSET_SPECIFIC'
  }

  return 'NONE'
}

/**
 * Generate shadow audit summary for a block
 * @param {object} block - Activity block
 * @param {object} labourRates - Rate lookup by classification
 * @param {object} equipmentRates - Rate lookup by equipment type
 * @returns {object} - Summary object with all metrics
 */
export function generateShadowAuditSummary(block, labourRates = {}, equipmentRates = {}) {
  const totalBilledHours = calculateTotalBilledHours(block)
  const totalShadowHours = calculateTotalShadowHours(block)
  const inertiaRatio = calculateInertiaRatio(block)
  const totalValueLost = calculateValueLost(block, labourRates, equipmentRates)
  const delayType = getDelayType(block)
  const blockBurnRate = calculateBlockBurnRate(block, labourRates, equipmentRates)

  return {
    totalBilledHours: Math.round(totalBilledHours * 100) / 100,
    totalShadowHours: Math.round(totalShadowHours * 100) / 100,
    inertiaRatio: Math.round(inertiaRatio * 10) / 10, // Store as percentage
    totalValueLost: Math.round(totalValueLost * 100) / 100,
    delayType, // 'NONE', 'ASSET_SPECIFIC', or 'SYSTEMIC'
    blockBurnRate: Math.round(blockBurnRate * 100) / 100,
    systemicDelay: block.systemicDelay || null
  }
}

// ============================================================================
// GOODHART'S LAW PROTECTION - Triangulation & Data Reliability
// Prevents gaming of efficiency metrics by cross-referencing:
// - Inertia Ratio (I_R): Time spent efficiency
// - Linear Metres (L_M): Actual production output
// - Quality Pass Rate (Q_R): Work integrity
// ============================================================================

/**
 * Default daily production targets by activity type (metres per day)
 * These are baseline expectations for a full crew day
 */
export const dailyProductionTargets = {
  'Welding - Mainline': 400,      // ~25-30 joints per day
  'Welding - Section Crew': 300,
  'Welding - Tie-in': 100,
  'Stringing': 1500,
  'Bending': 800,
  'Coating': 600,
  'Ditch': 500,
  'Lower-in': 800,
  'Backfill': 1000,
  'Grading': 1200,
  'Clearing': 800,
  'Cleanup - Machine': 1500,
  'Cleanup - Final': 1000,
  'HDD': 200,                     // Varies greatly by conditions
  'Hydrostatic Testing': 5000,    // Per test section
  'default': 500
}

/**
 * Default rework cost multiplier by activity type
 * Represents cost to redo failed work as percentage of original
 */
export const reworkCostMultipliers = {
  'Welding - Mainline': 3.0,      // Weld repair is expensive
  'Welding - Section Crew': 2.5,
  'Welding - Tie-in': 2.5,
  'Coating': 1.5,
  'Ditch': 1.8,
  'HDD': 4.0,                     // HDD rework is very costly
  'default': 1.5
}

/**
 * Calculate linear metres achieved from block data
 * Extracts progress from KP ranges and activity-specific data
 * @param {object} block - Activity block
 * @returns {number} - Linear metres achieved
 */
export function calculateLinearMetres(block) {
  // Try to get from KP range first
  if (block.kpStart && block.kpEnd) {
    const start = parseKPToMetres(block.kpStart)
    const end = parseKPToMetres(block.kpEnd)
    if (start !== null && end !== null) {
      return Math.abs(end - start)
    }
  }

  // Check activity-specific data for linear progress
  if (block.weldData?.jointNumbers?.length > 0) {
    // Estimate based on joint count (average 12m per joint)
    return block.weldData.jointNumbers.length * 12
  }

  if (block.stringData?.pipeTallied) {
    return parseFloat(block.stringData.pipeTallied) || 0
  }

  if (block.ditchData?.totalLength) {
    return parseFloat(block.ditchData.totalLength) || 0
  }

  // Default: no measurable linear progress
  return 0
}

/**
 * Parse KP format to metres
 * @param {string} kp - KP string (e.g., "6+500" or "6500")
 * @returns {number|null} - Metres or null if invalid
 */
function parseKPToMetres(kp) {
  if (!kp) return null
  const str = String(kp).trim()
  const match = str.match(/^(\d+)\+(\d+)$/)
  if (match) {
    return parseInt(match[1]) * 1000 + parseInt(match[2])
  }
  const num = parseFloat(str)
  if (!isNaN(num)) {
    return num >= 100 ? num : num * 1000
  }
  return null
}

/**
 * Calculate quality pass rate from block data
 * Examines quality checklists and defect data
 * @param {object} block - Activity block
 * @returns {number} - Pass rate as percentage (0-100)
 */
export function calculateQualityPassRate(block) {
  let totalChecks = 0
  let passedChecks = 0

  // Check weld data for repair rates
  if (block.weldData) {
    const totalJoints = block.weldData.jointNumbers?.length || 0
    const repairJoints = block.weldData.repairJoints?.length || 0
    if (totalJoints > 0) {
      totalChecks += totalJoints
      passedChecks += (totalJoints - repairJoints)
    }
  }

  // Check quality data object
  if (block.qualityData) {
    const qualityFields = Object.entries(block.qualityData)
    for (const [key, value] of qualityFields) {
      // Skip non-boolean fields
      if (typeof value === 'boolean') {
        totalChecks++
        if (value === true) passedChecks++
      } else if (value === 'pass' || value === 'yes' || value === 'compliant') {
        totalChecks++
        passedChecks++
      } else if (value === 'fail' || value === 'no' || value === 'non-compliant') {
        totalChecks++
      }
    }
  }

  // Check coating data for holiday detection
  if (block.coatingData?.holidaysFound > 0) {
    totalChecks += block.coatingData.holidaysFound
    passedChecks += (block.coatingData.holidaysRepaired || 0)
  }

  // If no quality data available, assume 100%
  if (totalChecks === 0) return 100

  return (passedChecks / totalChecks) * 100
}

/**
 * Verify efficiency metrics for data reliability
 * Triangulates I_R, L_M, and Q_R to detect gaming
 * @param {object} block - Activity block
 * @param {number} plannedDailyTarget - Expected metres per day (optional)
 * @returns {object} - Verification result with reliability score and alerts
 */
export function verifyEfficiency(block, plannedDailyTarget = null) {
  const activityType = block.activityType || 'default'
  const target = plannedDailyTarget || dailyProductionTargets[activityType] || dailyProductionTargets.default

  // Calculate the three pillars
  const inertiaRatio = calculateInertiaRatio(block) / 100  // Convert to 0-1 scale
  const linearMetres = calculateLinearMetres(block)
  const qualityPassRate = calculateQualityPassRate(block) / 100  // Convert to 0-1 scale

  // Calculate production ratio (actual vs target)
  const productionRatio = target > 0 ? linearMetres / target : 1

  const alerts = []
  let reliabilityScore = 100
  let productivityDragPenalty = 0
  let reworkCost = 0

  // ALERT 1: High inertia but low production (Goodhart's Law violation)
  // If I_R > 0.9 but L_M < 80% of target
  if (inertiaRatio > 0.9 && productionRatio < 0.8 && linearMetres > 0) {
    alerts.push({
      type: 'PRODUCTIVITY_DRAG',
      severity: 'high',
      message: `High time efficiency (${(inertiaRatio * 100).toFixed(0)}%) but low output (${(productionRatio * 100).toFixed(0)}% of target)`,
      detail: `Expected ${target}m, achieved ${linearMetres}m`
    })
    // Apply productivity drag penalty: reduce effective inertia ratio
    productivityDragPenalty = (0.9 - productionRatio) * 0.3  // Up to 30% penalty
    reliabilityScore -= 25
  }

  // ALERT 2: Quality issues requiring rework
  // If Q_R < 90%, include rework cost
  if (qualityPassRate < 0.9 && linearMetres > 0) {
    const reworkMultiplier = reworkCostMultipliers[activityType] || reworkCostMultipliers.default
    const failureRate = 1 - qualityPassRate
    const blockBurnRate = calculateBlockBurnRate(block, {}, {})
    const billedHours = calculateTotalBilledHours(block)

    // Rework cost = failed work × hours × burn rate × multiplier
    reworkCost = failureRate * billedHours * blockBurnRate * reworkMultiplier * 0.1  // Scale factor

    alerts.push({
      type: 'QUALITY_REWORK',
      severity: qualityPassRate < 0.7 ? 'high' : 'medium',
      message: `Quality pass rate ${(qualityPassRate * 100).toFixed(0)}% - rework cost estimated`,
      detail: `Estimated rework cost: $${reworkCost.toFixed(0)}`
    })
    reliabilityScore -= (1 - qualityPassRate) * 30  // Up to 30% reduction
  }

  // ALERT 3: Metric mismatch - all three pillars should correlate
  // High production + high quality + low inertia = legitimate delays
  // High inertia + low production + low quality = potential gaming
  if (inertiaRatio > 0.85 && productionRatio < 0.5 && qualityPassRate < 0.85) {
    alerts.push({
      type: 'METRIC_MISMATCH',
      severity: 'critical',
      message: 'Metrics do not align - high hours, low pipe, quality issues',
      detail: 'Recommend investigation: time spent not translating to quality output'
    })
    reliabilityScore -= 35
  }

  // ALERT 4: Zero production with high hours
  if (linearMetres === 0 && calculateTotalBilledHours(block) > 16) {
    alerts.push({
      type: 'NO_MEASURABLE_OUTPUT',
      severity: 'medium',
      message: 'No measurable linear progress recorded',
      detail: 'Verify KP range is captured or activity type has production data'
    })
    reliabilityScore -= 10
  }

  // Calculate adjusted value lost (including rework)
  const baseValueLost = calculateValueLost(block, {}, {})
  const adjustedValueLost = baseValueLost + reworkCost

  // Calculate adjusted inertia (with productivity drag penalty)
  const adjustedInertiaRatio = Math.max(0, inertiaRatio - productivityDragPenalty)

  // Determine overall reliability status
  let reliabilityStatus = 'RELIABLE'
  if (reliabilityScore < 50) {
    reliabilityStatus = 'UNRELIABLE'
  } else if (reliabilityScore < 75) {
    reliabilityStatus = 'QUESTIONABLE'
  } else if (alerts.length > 0) {
    reliabilityStatus = 'REVIEW_NEEDED'
  }

  return {
    // Raw metrics
    inertiaRatio: Math.round(inertiaRatio * 1000) / 10,  // As percentage
    linearMetres: Math.round(linearMetres),
    qualityPassRate: Math.round(qualityPassRate * 1000) / 10,  // As percentage
    productionRatio: Math.round(productionRatio * 1000) / 10,  // As percentage of target

    // Adjusted metrics (True Cost of Completion)
    adjustedInertiaRatio: Math.round(adjustedInertiaRatio * 1000) / 10,
    adjustedValueLost: Math.round(adjustedValueLost * 100) / 100,
    productivityDragPenalty: Math.round(productivityDragPenalty * 1000) / 10,
    reworkCost: Math.round(reworkCost * 100) / 100,

    // Reliability assessment
    reliabilityScore: Math.max(0, Math.round(reliabilityScore)),
    reliabilityStatus,
    alerts,

    // Reference data
    plannedTarget: target,
    activityType
  }
}

/**
 * Aggregate efficiency verification across multiple blocks/reports
 * For dashboard-level True Cost of Completion
 * @param {Array} blocks - Array of activity blocks
 * @returns {object} - Aggregated verification metrics
 */
export function aggregateEfficiencyVerification(blocks) {
  let totalLinearMetres = 0
  let totalPlannedMetres = 0
  let totalQualityChecks = 0
  let totalQualityPassed = 0
  let totalReworkCost = 0
  let totalProductivityDragPenalty = 0
  const allAlerts = []
  let unreliableCount = 0
  let questionableCount = 0

  for (const block of blocks) {
    const verification = verifyEfficiency(block)

    totalLinearMetres += verification.linearMetres
    totalPlannedMetres += verification.plannedTarget
    totalReworkCost += verification.reworkCost
    totalProductivityDragPenalty += verification.productivityDragPenalty

    // Aggregate quality
    if (verification.qualityPassRate < 100) {
      totalQualityChecks += 100
      totalQualityPassed += verification.qualityPassRate
    }

    // Collect critical alerts
    for (const alert of verification.alerts) {
      if (alert.severity === 'critical' || alert.severity === 'high') {
        allAlerts.push({
          ...alert,
          activityType: block.activityType,
          blockId: block.id
        })
      }
    }

    if (verification.reliabilityStatus === 'UNRELIABLE') unreliableCount++
    if (verification.reliabilityStatus === 'QUESTIONABLE') questionableCount++
  }

  const overallProductionRatio = totalPlannedMetres > 0
    ? (totalLinearMetres / totalPlannedMetres) * 100
    : 100

  const overallQualityRate = totalQualityChecks > 0
    ? (totalQualityPassed / totalQualityChecks) * 100
    : 100

  // Calculate overall data reliability
  let overallReliability = 'RELIABLE'
  if (unreliableCount > blocks.length * 0.2) {
    overallReliability = 'UNRELIABLE'
  } else if (questionableCount > blocks.length * 0.3) {
    overallReliability = 'QUESTIONABLE'
  } else if (allAlerts.length > 0) {
    overallReliability = 'REVIEW_NEEDED'
  }

  return {
    totalLinearMetres,
    totalPlannedMetres,
    overallProductionRatio: Math.round(overallProductionRatio * 10) / 10,
    overallQualityRate: Math.round(overallQualityRate * 10) / 10,
    totalReworkCost: Math.round(totalReworkCost * 100) / 100,
    avgProductivityDragPenalty: blocks.length > 0
      ? Math.round((totalProductivityDragPenalty / blocks.length) * 1000) / 10
      : 0,
    criticalAlerts: allAlerts,
    unreliableBlocks: unreliableCount,
    questionableBlocks: questionableCount,
    overallReliability,
    blockCount: blocks.length
  }
}
