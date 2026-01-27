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
