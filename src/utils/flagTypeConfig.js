// ============================================================================
// FLAG TYPE CONFIGURATION
// February 2, 2026
// Static mapping of AI agent flag types to violation details, references, and risks
// ============================================================================

export const FLAG_TYPE_CONFIG = {
  WPS_MATERIAL_MISMATCH: {
    violationTitle: 'Weld Procedure Mismatch',
    anomalyType: 'Material/WPS Incompatibility',
    referenceTemplate: 'According to Project Specification Section 4.2 and CSA Z662 Clause 7.2.4, the base material must be listed in the qualified WPS.',
    sourceDocument: 'CSA Z662-19, Clause 7.2.4',
    sourcePage: 'Project Spec Section 4.2',
    riskTemplate: 'This weld is at risk of rejection during the final ITP compilation. Non-compliant welds may require cut-out and re-weld.',
    severity: 'critical',
    icon: '⚠️'
  },
  HOURS_EXCEEDED: {
    violationTitle: 'Labour Hours Exceeded',
    anomalyType: 'Overtime Threshold Breach',
    referenceTemplate: 'Per Contract Agreement Section 3.1, standard workday is {standardWorkday} hours. Actual: {actualHours} hours ({percentage}% over).',
    sourceDocument: 'Contract Agreement',
    sourcePage: 'Section 3.1 - Work Hours',
    riskTemplate: 'Overtime costs may be flagged during invoice reconciliation. Extended hours may indicate crew fatigue or scope creep.',
    severity: 'warning',
    icon: '⏰'
  },
  KP_OUT_OF_BOUNDS: {
    violationTitle: 'KP Outside Contract Bounds',
    anomalyType: 'Work Location Out of Scope',
    referenceTemplate: 'Contract defines work area from KP {startKp} to KP {endKp}. Activity recorded at KP {actualKp}.',
    sourceDocument: 'Contract Scope of Work',
    sourcePage: 'Appendix A - Work Limits',
    riskTemplate: 'Work performed outside contracted area may not be billable. Verify authorization for extended scope.',
    severity: 'critical',
    icon: '📍'
  },
  LOW_EFFICIENCY: {
    violationTitle: 'Low Efficiency Detected',
    anomalyType: 'Shadow Audit Efficiency Below Threshold',
    referenceTemplate: 'Shadow audit efficiency threshold is 70%. Current efficiency: {efficiency}%.',
    sourceDocument: 'Rick\'s Pipeline Handbook',
    sourcePage: 'Chapter 8 - Shadow Auditing Best Practices',
    riskTemplate: 'Low efficiency may indicate underreported shadow time or billing discrepancies.',
    severity: 'warning',
    icon: '📉'
  },
  FILLER_MATERIAL_MISMATCH: {
    violationTitle: 'Filler Material Not Qualified',
    anomalyType: 'Consumable Material Deviation',
    referenceTemplate: 'Per WPS {wpsNumber}, allowed filler materials are: {allowedFillers}. Used: {actualFiller}.',
    sourceDocument: 'WPS Qualification Record',
    sourcePage: 'AWS D1.1 Table 4.5',
    riskTemplate: 'Non-qualified filler material may result in weld rejection or reduced joint integrity.',
    severity: 'critical',
    icon: '🔩'
  },
  CHAINAGE_GAP: {
    violationTitle: 'Inconsistent Chainage',
    anomalyType: 'Chainage Gap Detected',
    referenceTemplate: 'Gap of {gapDistance}m detected between activity blocks. Typical allowance is 100m per API 1169 Section 6.4.',
    sourceDocument: 'API 1169',
    sourcePage: 'Section 6.4 - Pipeline Stationing',
    riskTemplate: 'Chainage gaps may indicate missing work documentation or data entry errors. Review station logs for completeness.',
    severity: 'warning',
    icon: '📊'
  },
  LABOUR_ANOMALY: {
    violationTitle: 'Labour Count Anomaly',
    anomalyType: 'Crew Size Deviation',
    referenceTemplate: 'Activity block reports {workerCount} workers. This exceeds typical crew size of {expectedCount} per spread allocation.',
    sourceDocument: 'Project Mobilization Plan',
    sourcePage: 'Section 2.3 - Crew Allocation',
    riskTemplate: 'Unusual labour counts may indicate billing errors or crew misallocation.',
    severity: 'info',
    icon: '👷'
  },
  MANAGEMENT_DRAG_SPIKE: {
    violationTitle: 'Management Drag Spike',
    anomalyType: 'Excessive Non-Productive Time',
    referenceTemplate: 'Greater than 30% of entries marked as MANAGEMENT_DRAG. Current: {percentage}%.',
    sourceDocument: 'Rick\'s Pipeline Handbook',
    sourcePage: 'Chapter 5 - Productivity Monitoring',
    riskTemplate: 'High management drag may indicate coordination issues or contractor delays affecting productivity.',
    severity: 'critical',
    icon: '⚡'
  },
  ITP_HOLD_POINT_MISSED: {
    violationTitle: 'ITP Hold Point Missed',
    anomalyType: 'Quality Hold Point Bypass',
    referenceTemplate: 'ITP Hold Point #{holdPointNumber} requires inspector witness before proceeding. Work continued without sign-off.',
    sourceDocument: 'Project ITP',
    sourcePage: 'Section 5.1 - Mandatory Hold Points',
    riskTemplate: 'Missed hold points may invalidate work and require re-inspection or re-work. Escalate to QA Manager immediately.',
    severity: 'critical',
    icon: '🛑'
  },
  COATING_THICKNESS_LOW: {
    violationTitle: 'Coating Thickness Below Minimum',
    anomalyType: 'Coating Deficiency',
    referenceTemplate: 'Minimum coating thickness per spec is {minThickness} mils. Recorded: {recordedValue} mils at station {station}.',
    sourceDocument: 'Coating Application Specification',
    sourcePage: 'Section 3.2 - DFT Requirements',
    riskTemplate: 'Insufficient coating thickness compromises corrosion protection. Joint may require stripping and re-coating per CSA Z245.30.',
    severity: 'critical',
    icon: '🎨'
  },
  COATING_THICKNESS_HIGH: {
    violationTitle: 'Coating Thickness Above Maximum',
    anomalyType: 'Coating Over-Application',
    referenceTemplate: 'Maximum coating thickness per spec is {maxThickness} mils. Recorded: {recordedValue} mils.',
    sourceDocument: 'Coating Application Specification',
    sourcePage: 'Section 3.2 - DFT Requirements',
    riskTemplate: 'Excessive coating may cause adhesion issues or cracking during bending. Evaluate for acceptance or repair.',
    severity: 'warning',
    icon: '🎨'
  },

  // =========================================================================
  // RAG-BASED SPECIFICATION VIOLATIONS
  // These flags are generated by AI analysis against project documents
  // =========================================================================

  SPEC_VIOLATION: {
    violationTitle: 'Specification Violation',
    anomalyType: 'Project Specification Non-Compliance',
    referenceTemplate: 'Per {sourceDocument}: {specRequirement}. Recorded value: {recordedValue}.',
    sourceDocument: 'Project Specification',
    sourcePage: 'As referenced in finding',
    riskTemplate: 'Work not meeting project specifications may require rework or rejection during QA review. Document the deviation and seek engineering approval if applicable.',
    severity: 'critical',
    icon: '📋'
  },
  COATING_VIOLATION: {
    violationTitle: 'Coating Thickness Out of Specification',
    anomalyType: 'Coating Parameter Deviation',
    referenceTemplate: 'Project Specification requires coating thickness of {specRequirement}. Recorded: {recordedValue} mils.',
    sourceDocument: 'Project Coating Specification',
    sourcePage: 'Section 4.1 - Field Joint Coating',
    riskTemplate: 'Insufficient coating thickness compromises corrosion protection and may lead to premature pipe failure. This joint may require stripping and re-coating.',
    severity: 'critical',
    icon: '🎨'
  },
  PROCEDURE_VIOLATION: {
    violationTitle: 'Procedure Not Followed',
    anomalyType: 'Procedural Non-Compliance',
    referenceTemplate: 'Per {sourceDocument}, the required procedure states: {specRequirement}. Actual practice: {recordedValue}.',
    sourceDocument: 'Approved Project Procedure',
    sourcePage: 'As referenced in finding',
    riskTemplate: 'Deviation from approved procedures may void warranty or certification. Work may need to be repeated following the correct procedure.',
    severity: 'critical',
    icon: '📝'
  },
  EQUIPMENT_MISMATCH: {
    violationTitle: 'Equipment/Specification Mismatch',
    anomalyType: 'Unapproved Equipment Usage',
    referenceTemplate: 'Equipment or specification "{recordedValue}" not found in approved project documentation.',
    sourceDocument: 'Project Equipment Register',
    sourcePage: 'Appendix C - Approved Equipment List',
    riskTemplate: 'Using unapproved equipment or specifications may result in non-compliant work. Verify with project engineer before proceeding.',
    severity: 'warning',
    icon: '🔧'
  },
  NDT_REJECTION: {
    violationTitle: 'NDT Rejection Not Addressed',
    anomalyType: 'Unresolved NDT Finding',
    referenceTemplate: 'NDT report #{reportNumber} indicates rejection at weld {weldId}. No repair documentation found.',
    sourceDocument: 'NDT Procedure',
    sourcePage: 'Section 7.2 - Repair Requirements',
    riskTemplate: 'Unaddressed NDT rejections must be repaired and re-inspected before acceptance. Weld is not qualified for service.',
    severity: 'critical',
    icon: '🔬'
  },
  WELDER_QUALIFICATION_EXPIRED: {
    violationTitle: 'Welder Qualification Expired',
    anomalyType: 'Personnel Certification Lapse',
    referenceTemplate: 'Welder {welderName} (Stencil: {stencil}) qualification expired on {expiryDate}. Work performed on {workDate}.',
    sourceDocument: 'CSA Z662',
    sourcePage: 'Clause 7.3 - Welder Qualification',
    riskTemplate: 'Welds performed by unqualified personnel may be rejected. Review all welds by this welder since qualification lapse.',
    severity: 'critical',
    icon: '👨‍🔧'
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
    anomalyType: 'Unclassified Anomaly',
    referenceTemplate: 'Review ticket details for compliance verification.',
    sourceDocument: 'Project Documentation',
    sourcePage: 'Manual Review Required',
    riskTemplate: 'This item requires manual review and verification.',
    severity: 'info',
    icon: '🔍'
  }
}
