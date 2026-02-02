// ============================================================================
// FLAG TYPE CONFIGURATION
// February 2, 2026
// Static mapping of AI agent flag types to violation details, references, and risks
// ============================================================================

export const FLAG_TYPE_CONFIG = {
  WPS_MATERIAL_MISMATCH: {
    violationTitle: 'Weld Procedure Mismatch',
    referenceTemplate: 'According to Project Specification Section 4.2 and CSA Z662 Clause 7.2.4, the base material must be listed in the qualified WPS.',
    riskTemplate: 'This weld is at risk of rejection during the final ITP compilation. Non-compliant welds may require cut-out and re-weld.',
    severity: 'critical',
    icon: '⚠️'
  },
  HOURS_EXCEEDED: {
    violationTitle: 'Labour Hours Exceeded',
    referenceTemplate: 'Per Contract Agreement Section 3.1, standard workday is {standardWorkday} hours. Actual: {actualHours} hours ({percentage}% over).',
    riskTemplate: 'Overtime costs may be flagged during invoice reconciliation. Extended hours may indicate crew fatigue or scope creep.',
    severity: 'warning',
    icon: '⏰'
  },
  KP_OUT_OF_BOUNDS: {
    violationTitle: 'KP Outside Contract Bounds',
    referenceTemplate: 'Contract defines work area from KP {startKp} to KP {endKp}. Activity recorded at KP {actualKp}.',
    riskTemplate: 'Work performed outside contracted area may not be billable. Verify authorization for extended scope.',
    severity: 'critical',
    icon: '📍'
  },
  LOW_EFFICIENCY: {
    violationTitle: 'Low Efficiency Detected',
    referenceTemplate: 'Shadow audit efficiency threshold is 70%. Current efficiency: {efficiency}%.',
    riskTemplate: 'Low efficiency may indicate underreported shadow time or billing discrepancies.',
    severity: 'warning',
    icon: '📉'
  },
  FILLER_MATERIAL_MISMATCH: {
    violationTitle: 'Filler Material Not Qualified',
    referenceTemplate: 'Per WPS {wpsNumber}, allowed filler materials are: {allowedFillers}. Used: {actualFiller}.',
    riskTemplate: 'Non-qualified filler material may result in weld rejection or reduced joint integrity.',
    severity: 'critical',
    icon: '🔩'
  },
  CHAINAGE_GAP: {
    violationTitle: 'Chainage Gap Detected',
    referenceTemplate: 'Gap of {gapDistance}m detected between activity blocks. Typical allowance is 100m.',
    riskTemplate: 'Chainage gaps may indicate missing work documentation or data entry errors.',
    severity: 'warning',
    icon: '📊'
  },
  LABOUR_ANOMALY: {
    violationTitle: 'Labour Count Anomaly',
    referenceTemplate: 'Activity block reports {workerCount} workers. This exceeds typical crew size of {expectedCount}.',
    riskTemplate: 'Unusual labour counts may indicate billing errors or crew misallocation.',
    severity: 'info',
    icon: '👷'
  },
  MANAGEMENT_DRAG_SPIKE: {
    violationTitle: 'Management Drag Spike',
    referenceTemplate: 'Greater than 30% of entries marked as MANAGEMENT_DRAG. Current: {percentage}%.',
    riskTemplate: 'High management drag may indicate coordination issues or contractor delays affecting productivity.',
    severity: 'critical',
    icon: '⚡'
  }
}

// Severity color mappings
export const SEVERITY_COLORS = {
  critical: {
    bg: '#fef2f2',
    border: '#fecaca',
    text: '#dc2626',
    badge: '#dc2626'
  },
  warning: {
    bg: '#fffbeb',
    border: '#fde68a',
    text: '#ca8a04',
    badge: '#ca8a04'
  },
  info: {
    bg: '#f0f9ff',
    border: '#bae6fd',
    text: '#0284c7',
    badge: '#6b7280'
  }
}

// Helper to interpolate template strings with actual values
export function interpolateTemplate(template, values = {}) {
  if (!template) return ''
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return values[key] !== undefined ? values[key] : match
  })
}

// Get config for a flag type with safe fallback
export function getFlagTypeConfig(flagType) {
  return FLAG_TYPE_CONFIG[flagType] || {
    violationTitle: flagType?.replace(/_/g, ' ') || 'Unknown Violation',
    referenceTemplate: 'Review ticket details for compliance verification.',
    riskTemplate: 'This item requires manual review and verification.',
    severity: 'info',
    icon: '🔍'
  }
}
