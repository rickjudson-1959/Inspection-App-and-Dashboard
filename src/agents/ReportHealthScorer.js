// ReportHealthScorer.js - Compute weighted report completeness score
// Phase 3: Warns (not blocks) if below threshold on submit

import { qualityFieldsByActivity } from '../constants.js'

// Default threshold - overridden by contract_config.health_score_threshold if available
const DEFAULT_HEALTH_THRESHOLD = 90

// Concealed-work activities that should have photos
const CONCEALED_WORK_ACTIVITIES = [
  'Lower-in', 'Backfill', 'Coating', 'HD Bores', 'HDD'
]

// ─────────────────────────────────────────────────────────────
// CATEGORY SCORERS
// Each returns { score: 0-100, weight, issues: string[] }
// ─────────────────────────────────────────────────────────────

/**
 * Photo Completeness (25% weight)
 * Concealed-work activities with photos / total concealed-work blocks
 */
function scorePhotoCompleteness(activityBlocks) {
  const concealedBlocks = activityBlocks.filter(
    b => CONCEALED_WORK_ACTIVITIES.includes(b.activityType)
  )

  if (concealedBlocks.length === 0) {
    return { score: 100, weight: 25, issues: [] }
  }

  const withPhotos = concealedBlocks.filter(
    b => b.workPhotos && b.workPhotos.length > 0
  )

  const score = Math.round((withPhotos.length / concealedBlocks.length) * 100)
  const issues = []

  const missing = concealedBlocks.filter(b => !b.workPhotos || b.workPhotos.length === 0)
  for (const block of missing) {
    issues.push(`Activity ${block.activityType} (KP ${block.startKP || '?'}) missing concealed-work photos`)
  }

  return { score, weight: 25, issues }
}

/**
 * Directive 050 Compliance (20% weight)
 * DrillingWasteManagement fields: volume balance, disposal facility, additives
 */
function scoreDirective050(activityBlocks) {
  // Check if any HDD or HD Bores blocks have wasteData
  const drillingBlocks = activityBlocks.filter(
    b => (b.activityType === 'HDD' || b.activityType === 'HD Bores') && b.wasteData
  )

  if (drillingBlocks.length === 0) {
    // No drilling activities = N/A, give full score
    return { score: 100, weight: 20, issues: [] }
  }

  let totalChecks = 0
  let passedChecks = 0
  const issues = []

  for (const block of drillingBlocks) {
    const wd = block.wasteData || {}

    // Volume balance check: hauled + storage == total mixed
    totalChecks++
    const totalMixed = parseFloat(wd.totalVolumeMixedM3) || 0
    const inStorage = parseFloat(wd.volumeInStorageM3) || 0
    const hauled = parseFloat(wd.volumeHauledM3) || 0
    if (totalMixed > 0 && Math.abs((hauled + inStorage) - totalMixed) < 0.5) {
      passedChecks++
    } else if (totalMixed > 0) {
      issues.push(`Volume balance mismatch: hauled(${hauled}) + storage(${inStorage}) != total(${totalMixed})`)
    } else {
      issues.push('Total volume mixed not recorded')
    }

    // Disposal facility when hauled > 0
    totalChecks++
    if (hauled > 0) {
      if (wd.disposalFacilityName) {
        passedChecks++
      } else {
        issues.push('Volume hauled > 0 but no disposal facility recorded')
      }
    } else {
      passedChecks++ // N/A
    }

    // Additive tracking
    totalChecks++
    if (wd.additives && wd.additives.length > 0) {
      passedChecks++
    } else {
      issues.push('No drilling fluid additives recorded')
    }
  }

  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100
  return { score, weight: 20, issues }
}

/**
 * Field Completeness (20% weight)
 * Filled qualityData fields / total required fields per qualityFieldsByActivity
 */
function scoreFieldCompleteness(activityBlocks) {
  let totalFields = 0
  let filledFields = 0
  const issues = []

  for (const block of activityBlocks) {
    if (!block.activityType) continue

    const fieldDefs = qualityFieldsByActivity[block.activityType]
    if (!fieldDefs || fieldDefs.length === 0) continue

    // Flatten fields (handle collapsible sections)
    const allFields = []
    for (const f of fieldDefs) {
      if (f.type === 'collapsible' && f.fields) {
        allFields.push(...f.fields)
      } else if (f.type !== 'info' && f.type !== 'header') {
        allFields.push(f)
      }
    }

    // Exclude calculated/readonly fields
    const requiredFields = allFields.filter(
      f => f.type !== 'calculated' && !f.readOnly
    )

    totalFields += requiredFields.length

    for (const field of requiredFields) {
      const value = block.qualityData?.[field.name]
      if (value !== undefined && value !== null && value !== '') {
        filledFields++
      }
    }

    const blockFilled = requiredFields.filter(
      f => block.qualityData?.[f.name] !== undefined &&
           block.qualityData?.[f.name] !== null &&
           block.qualityData?.[f.name] !== ''
    ).length

    if (requiredFields.length > 0 && blockFilled < requiredFields.length) {
      const missing = requiredFields.length - blockFilled
      issues.push(`${block.activityType} (KP ${block.startKP || '?'}): ${missing} quality field${missing !== 1 ? 's' : ''} incomplete`)
    }
  }

  const score = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 100
  return { score, weight: 20, issues }
}

/**
 * Chainage Integrity (15% weight)
 * All gaps/overlaps have documented reasons
 */
function scoreChainageIntegrity(activityBlocks) {
  // Group blocks by activity type
  const byType = {}
  for (const block of activityBlocks) {
    if (!block.activityType || !block.startKP || !block.endKP) continue
    if (!byType[block.activityType]) byType[block.activityType] = []
    byType[block.activityType].push(block)
  }

  let totalIssues = 0
  let documentedIssues = 0
  const issues = []

  for (const [type, blocks] of Object.entries(byType)) {
    if (blocks.length < 2) continue

    // Sort by startKP
    const sorted = [...blocks].sort(
      (a, b) => parseFloat(a.startKP) - parseFloat(b.startKP)
    )

    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = parseFloat(sorted[i - 1].endKP)
      const currStart = parseFloat(sorted[i].startKP)

      if (isNaN(prevEnd) || isNaN(currStart)) continue

      const diff = currStart - prevEnd
      if (Math.abs(diff) > 0.001) {
        totalIssues++
        const hasReason = sorted[i].chainageOverlapReason || sorted[i].chainageGapReason
        if (hasReason) {
          documentedIssues++
        } else {
          issues.push(`${type}: chainage ${diff > 0 ? 'gap' : 'overlap'} at KP ${prevEnd} without documented reason`)
        }
      }
    }
  }

  const score = totalIssues > 0 ? Math.round((documentedIssues / totalIssues) * 100) : 100
  return { score, weight: 15, issues }
}

/**
 * Labour/Equipment Documentation (10% weight)
 * Blocks with at least 1 labour + 1 equipment entry / total blocks
 */
function scoreLabourEquipment(activityBlocks) {
  const activeBlocks = activityBlocks.filter(b => b.activityType)

  if (activeBlocks.length === 0) {
    return { score: 100, weight: 10, issues: [] }
  }

  const documented = activeBlocks.filter(
    b => (b.labourEntries?.length > 0) && (b.equipmentEntries?.length > 0)
  )

  const score = Math.round((documented.length / activeBlocks.length) * 100)
  const issues = []

  for (const block of activeBlocks) {
    if (!block.labourEntries?.length && !block.equipmentEntries?.length) {
      issues.push(`${block.activityType} (KP ${block.startKP || '?'}): missing both labour and equipment entries`)
    } else if (!block.labourEntries?.length) {
      issues.push(`${block.activityType} (KP ${block.startKP || '?'}): missing labour entries`)
    } else if (!block.equipmentEntries?.length) {
      issues.push(`${block.activityType} (KP ${block.startKP || '?'}): missing equipment entries`)
    }
  }

  return { score, weight: 10, issues }
}

/**
 * Mentor Alert Resolution (10% weight)
 * Acknowledged alerts / total alerts (100 if no alerts)
 */
function scoreMentorAlertResolution(mentorAlerts) {
  const allAlerts = mentorAlerts || []

  if (allAlerts.length === 0) {
    return { score: 100, weight: 10, issues: [] }
  }

  const resolved = allAlerts.filter(
    a => a.status === 'acknowledged' || a.status === 'overridden' || a.status === 'resolved'
  )

  const score = Math.round((resolved.length / allAlerts.length) * 100)
  const issues = []

  const unresolved = allAlerts.filter(a => a.status === 'active')
  if (unresolved.length > 0) {
    issues.push(`${unresolved.length} mentor alert${unresolved.length !== 1 ? 's' : ''} unresolved`)
  }

  return { score, weight: 10, issues }
}

// ─────────────────────────────────────────────────────────────
// MAIN SCORER
// ─────────────────────────────────────────────────────────────

/**
 * Compute the overall health score for a report.
 *
 * @param {Array} activityBlocks - Activity block array
 * @param {Object} reportData - Report-level data (for contract config)
 * @param {Array} mentorAlerts - Flat array of mentor alert objects
 * @returns {Object} { score, details, passing }
 */
function computeHealthScore(activityBlocks, reportData, mentorAlerts) {
  const categories = {
    photoCompleteness: scorePhotoCompleteness(activityBlocks),
    directive050: scoreDirective050(activityBlocks),
    fieldCompleteness: scoreFieldCompleteness(activityBlocks),
    chainageIntegrity: scoreChainageIntegrity(activityBlocks),
    labourEquipment: scoreLabourEquipment(activityBlocks),
    mentorAlertResolution: scoreMentorAlertResolution(mentorAlerts)
  }

  // Calculate weighted average
  let weightedSum = 0
  let totalWeight = 0

  for (const category of Object.values(categories)) {
    weightedSum += category.score * category.weight
    totalWeight += category.weight
  }

  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 100
  const threshold = reportData?.healthScoreThreshold || DEFAULT_HEALTH_THRESHOLD

  return {
    score,
    details: categories,
    passing: score >= threshold,
    threshold
  }
}

export { computeHealthScore, DEFAULT_HEALTH_THRESHOLD }

export default { computeHealthScore, DEFAULT_HEALTH_THRESHOLD }
