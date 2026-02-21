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
  const concealedBlocks = []
  activityBlocks.forEach((b, idx) => {
    if (CONCEALED_WORK_ACTIVITIES.includes(b.activityType)) {
      concealedBlocks.push({ ...b, _blockNum: idx + 1 })
    }
  })

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
    issues.push(`Block #${block._blockNum} "${block.activityType}" (KP ${block.startKP || '?'}) — this work will be buried/hidden. Add photos BEFORE it is covered up in the "Work Photos" section`)
  }

  return { score, weight: 25, issues }
}

/**
 * Directive 050 Compliance (20% weight)
 * DrillingWasteManagement fields: volume balance, disposal facility, additives
 */
function scoreDirective050(activityBlocks) {
  // Check if any HDD or HD Bores blocks have wasteData
  const drillingBlocks = []
  activityBlocks.forEach((b, idx) => {
    if ((b.activityType === 'HDD' || b.activityType === 'HD Bores') && b.wasteData) {
      drillingBlocks.push({ ...b, _blockNum: idx + 1 })
    }
  })

  if (drillingBlocks.length === 0) {
    // No drilling activities = N/A, give full score
    return { score: 100, weight: 20, issues: [] }
  }

  let totalChecks = 0
  let passedChecks = 0
  const issues = []

  for (const block of drillingBlocks) {
    const wd = block.wasteData || {}
    const loc = `Block #${block._blockNum} "${block.activityType}" (KP ${block.startKP || '?'})`

    // Volume balance check: hauled + storage == total mixed
    totalChecks++
    const totalMixed = parseFloat(wd.totalVolumeMixedM3) || 0
    const inStorage = parseFloat(wd.volumeInStorageM3) || 0
    const hauled = parseFloat(wd.volumeHauledM3) || 0
    if (totalMixed > 0 && Math.abs((hauled + inStorage) - totalMixed) < 0.5) {
      passedChecks++
    } else if (totalMixed > 0) {
      issues.push(`${loc} — volume balance mismatch: hauled(${hauled}) + storage(${inStorage}) ≠ total(${totalMixed}). Fix in "Drilling Waste Management" section`)
    } else {
      issues.push(`${loc} — enter "Total Volume Mixed" in the "Drilling Waste Management" section`)
    }

    // Disposal facility when hauled > 0
    totalChecks++
    if (hauled > 0) {
      if (wd.disposalFacilityName) {
        passedChecks++
      } else {
        issues.push(`${loc} — volume hauled > 0 but no disposal facility. Enter "Disposal Facility Name" in "Drilling Waste Management" section`)
      }
    } else {
      passedChecks++ // N/A
    }

    // Additive tracking
    totalChecks++
    if (wd.additives && wd.additives.length > 0) {
      passedChecks++
    } else {
      issues.push(`${loc} — add drilling fluid additives in the "Drilling Waste Management" section`)
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

  activityBlocks.forEach((block, idx) => {
    if (!block.activityType) return

    const fieldDefs = qualityFieldsByActivity[block.activityType]
    if (!fieldDefs || fieldDefs.length === 0) return

    const blockNum = idx + 1

    // Flatten fields (handle collapsible sections), tracking which section they belong to
    const allFields = []
    for (const f of fieldDefs) {
      if (f.type === 'collapsible' && f.fields) {
        for (const sub of f.fields) {
          allFields.push({ ...sub, _section: f.label || f.name })
        }
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

    const missingFields = requiredFields.filter(
      f => block.qualityData?.[f.name] === undefined ||
           block.qualityData?.[f.name] === null ||
           block.qualityData?.[f.name] === ''
    )

    if (missingFields.length > 0) {
      // Group missing fields by section for clarity
      const bySection = {}
      for (const f of missingFields) {
        const section = f._section || 'Quality Checks'
        if (!bySection[section]) bySection[section] = []
        bySection[section].push(f.label || f.name)
      }

      const loc = `Block #${blockNum} "${block.activityType}" (KP ${block.startKP || '?'})`
      const sectionDetails = Object.entries(bySection)
        .map(([section, fields]) => `${section}: ${fields.join(', ')}`)
        .join(' | ')
      issues.push(`${loc} — ${missingFields.length} quality field${missingFields.length !== 1 ? 's' : ''} to complete. Open "Quality Checks" and fill in → ${sectionDetails}`)
    }
  })

  const score = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 100
  return { score, weight: 20, issues }
}

/**
 * Chainage Integrity (15% weight)
 * All gaps/overlaps have documented reasons
 */
function scoreChainageIntegrity(activityBlocks) {
  // Group blocks by activity type, tracking block numbers
  const byType = {}
  activityBlocks.forEach((block, idx) => {
    if (!block.activityType || !block.startKP || !block.endKP) return
    if (!byType[block.activityType]) byType[block.activityType] = []
    byType[block.activityType].push({ ...block, _blockNum: idx + 1 })
  })

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
          const issueType = diff > 0 ? 'gap' : 'overlap'
          issues.push(`Block #${sorted[i]._blockNum} "${type}" — chainage ${issueType} between KP ${prevEnd} and KP ${currStart}. Check "Start KP" / "End KP" values at the top of the activity block`)
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
  const activeBlocks = []
  activityBlocks.forEach((b, idx) => {
    if (b.activityType) activeBlocks.push({ ...b, _blockNum: idx + 1 })
  })

  if (activeBlocks.length === 0) {
    return { score: 100, weight: 10, issues: [] }
  }

  const documented = activeBlocks.filter(
    b => (b.labourEntries?.length > 0) && (b.equipmentEntries?.length > 0)
  )

  const score = Math.round((documented.length / activeBlocks.length) * 100)
  const issues = []

  for (const block of activeBlocks) {
    const loc = `Block #${block._blockNum} "${block.activityType}" (KP ${block.startKP || '?'})`
    if (!block.labourEntries?.length && !block.equipmentEntries?.length) {
      issues.push(`${loc} — add labour and equipment. Upload a contractor ticket or manually add rows in the "Labour" and "Equipment" tables`)
    } else if (!block.labourEntries?.length) {
      issues.push(`${loc} — no labour entries. Upload a contractor ticket or add rows in the "Labour" table`)
    } else if (!block.equipmentEntries?.length) {
      issues.push(`${loc} — no equipment entries. Upload a contractor ticket or add rows in the "Equipment" table`)
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
    issues.push(`${unresolved.length} mentor alert${unresolved.length !== 1 ? 's' : ''} unresolved — look for the yellow alert banners within your activity blocks and tap "Acknowledge" or "Override" on each one`)
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
