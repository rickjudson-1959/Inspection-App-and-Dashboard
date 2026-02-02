// ============================================================================
// FLAG TYPE CONFIGURATION
// February 2, 2026
// Authoritative, technical, safety-focused voice with industry terminology
// Risk explanations explain downstream impacts on ITP, hydro-test, and QA
// ============================================================================

export const FLAG_TYPE_CONFIG = {
  WPS_MATERIAL_MISMATCH: {
    violationTitle: 'WPS/Base Material Non-Compliance',
    anomalyType: 'Base Material Not Qualified to WPS',
    referenceTemplate: 'Per CSA Z662 Clause 7.2.4 and Project WPS {wpsNumber}, base material must be listed in the qualified Weld Procedure Specification. Material "{recordedValue}" is not approved.',
    sourceDocument: 'CSA Z662-19, Clause 7.2.4',
    sourcePage: 'Project WPS Qualification Record',
    riskTemplate: `TECHNICAL RISK:
• This weld joint is at risk of rejection during final ITP compilation
• Non-compliant welds require cut-out and re-weld per CSA Z662 Clause 7.11
• Delay to mainline tie-in schedule if weld is in critical path
• Potential NDE re-examination of all welds by this crew using same material`,
    severity: 'critical',
    icon: '⚠️'
  },
  HOURS_EXCEEDED: {
    violationTitle: 'Labour Hours Exceed Contract Threshold',
    anomalyType: 'Overtime Threshold Breach',
    referenceTemplate: 'Contract Section 3.1 specifies standard workday of {standardWorkday} hours. Recorded: {actualHours} hours ({percentage}% over threshold).',
    sourceDocument: 'Contract Agreement',
    sourcePage: 'Section 3.1 - Work Hours & Overtime',
    riskTemplate: `TECHNICAL RISK:
• Extended shifts increase fatigue-related safety incidents on Right-of-Way
• Overtime costs flagged during invoice reconciliation may trigger audit
• Crew fatigue compromises quality of work (welding, coating application)
• May indicate scope creep or unreported delays requiring variance`,
    severity: 'warning',
    icon: '⏰'
  },
  KP_OUT_OF_BOUNDS: {
    violationTitle: 'Work Location Outside Contract Limits',
    anomalyType: 'Activity Recorded Beyond Authorized Right-of-Way',
    referenceTemplate: 'Contract ROW limits: KP {startKp} to KP {endKp}. Activity recorded at KP {actualKp} - outside authorized work area.',
    sourceDocument: 'Contract Scope of Work',
    sourcePage: 'Appendix A - Right-of-Way Limits',
    riskTemplate: `TECHNICAL RISK:
• Work performed outside contracted ROW may not be billable
• Potential trespass on adjacent landowner property
• Insurance coverage may not apply outside defined work limits
• Requires immediate variance authorization from Project Manager`,
    severity: 'critical',
    icon: '📍'
  },
  LOW_EFFICIENCY: {
    violationTitle: 'Shadow Audit Efficiency Below Threshold',
    anomalyType: 'Productivity Variance Detected',
    referenceTemplate: 'Shadow audit efficiency threshold: 70%. Current efficiency: {efficiency}%. Billed: {billed_hours}h, Verified shadow: {shadow_hours}h.',
    sourceDocument: 'Rick\'s Pipeline Handbook',
    sourcePage: 'Chapter 8 - Shadow Auditing & Productivity Verification',
    riskTemplate: `TECHNICAL RISK:
• Low efficiency indicates potential billing discrepancy
• May signal unreported standby time or equipment delays
• Shadow hours not supporting billed hours requires invoice adjustment
• Pattern of low efficiency triggers contractor performance review`,
    severity: 'warning',
    icon: '📉'
  },
  FILLER_MATERIAL_MISMATCH: {
    violationTitle: 'Filler Metal Not Qualified to WPS',
    anomalyType: 'Consumable Non-Compliance',
    referenceTemplate: 'WPS {wpsNumber} specifies approved filler metals: {allowedFillers}. Electrode used: {actualFiller} - not in qualified list.',
    sourceDocument: 'WPS Qualification Record',
    sourcePage: 'AWS D1.1 / CSA W48 Filler Metal Classification',
    riskTemplate: `TECHNICAL RISK:
• Weld mechanical properties may not meet design requirements
• Joint integrity compromised - potential in-service failure risk
• All welds using this consumable require NDE re-examination
• Filler metal traceability documentation incomplete for ITP`,
    severity: 'critical',
    icon: '🔩'
  },
  CHAINAGE_GAP: {
    violationTitle: 'Inconsistent Chainage in Daily Record',
    anomalyType: 'Station Gap Detected',
    referenceTemplate: 'Gap of {gapDistance}m detected between activity blocks. Per API 1169 Section 6.4, continuous chainage documentation required.',
    sourceDocument: 'API 1169',
    sourcePage: 'Section 6.4 - Pipeline Stationing & Documentation',
    riskTemplate: `TECHNICAL RISK:
• Gap in record may indicate undocumented work on the Right-of-Way
• Missing chainage creates traceability gap in as-built documentation
• Could delay hydro-test authorization pending record completion
• Regulatory audit finding if gaps not reconciled before close-out`,
    severity: 'warning',
    icon: '📊'
  },
  LABOUR_ANOMALY: {
    violationTitle: 'Unusual Crew Size Reported',
    anomalyType: 'Labour Count Exceeds Typical Allocation',
    referenceTemplate: 'Activity block reports {workerCount} personnel. Typical crew allocation: {expectedCount} per spread mobilization plan.',
    sourceDocument: 'Project Mobilization Plan',
    sourcePage: 'Section 2.3 - Spread Crew Allocation',
    riskTemplate: `TECHNICAL RISK:
• Verify crew count against contractor daily sign-in sheets
• Unusual headcount may indicate billing error or miscoding
• Large crews in confined area increase safety incident potential
• Cross-reference with equipment utilization for validation`,
    severity: 'info',
    icon: '👷'
  },
  MANAGEMENT_DRAG_SPIKE: {
    violationTitle: 'Excessive Management Drag Reported',
    anomalyType: 'Non-Productive Time Exceeds Threshold',
    referenceTemplate: 'Management drag threshold: 30%. Current: {percentage}% of labour entries coded as MANAGEMENT_DRAG.',
    sourceDocument: 'Rick\'s Pipeline Handbook',
    sourcePage: 'Chapter 5 - Delay Classification & Accountability',
    riskTemplate: `TECHNICAL RISK:
• High management drag indicates coordination failures
• Contractor standby claims may be disputed without root cause
• Schedule impact - spread production rate below baseline
• Requires variance report and corrective action plan`,
    severity: 'critical',
    icon: '⚡'
  },
  ITP_HOLD_POINT_MISSED: {
    violationTitle: 'ITP Hold Point Bypassed',
    anomalyType: 'Quality Hold Point Not Witnessed',
    referenceTemplate: 'ITP Hold Point #{holdPointNumber} requires Third-Party Inspector witness before proceeding. Work continued without verification sign-off.',
    sourceDocument: 'Project ITP',
    sourcePage: 'Section 5.1 - Mandatory Hold Points',
    riskTemplate: `TECHNICAL RISK:
• CRITICAL: Work beyond hold point may require complete re-work
• ITP integrity compromised - regulatory non-compliance risk
• Stop work order may be issued pending investigation
• Escalate immediately to QA Manager and Chief Inspector`,
    severity: 'critical',
    icon: '🛑'
  },
  COATING_THICKNESS_LOW: {
    violationTitle: 'Field Joint Coating Below Specification',
    anomalyType: 'DFT Reading Below Minimum',
    referenceTemplate: 'Minimum DFT per spec: {minThickness} mils. Recorded at station {station}: {recordedValue} mils. Holiday detection required.',
    sourceDocument: 'Coating Application Specification',
    sourcePage: 'Section 3.2 - Dry Film Thickness Requirements',
    riskTemplate: `TECHNICAL RISK:
• Insufficient coating thickness compromises corrosion protection
• Joint requires stripping and re-coating per CSA Z245.30
• Holiday detection test required before Lower-in
• Delay to lowering-in schedule if multiple joints affected`,
    severity: 'critical',
    icon: '🎨'
  },
  COATING_THICKNESS_HIGH: {
    violationTitle: 'Field Joint Coating Above Maximum',
    anomalyType: 'DFT Reading Exceeds Upper Limit',
    referenceTemplate: 'Maximum DFT per spec: {maxThickness} mils. Recorded: {recordedValue} mils. Evaluate for adhesion and flexibility.',
    sourceDocument: 'Coating Application Specification',
    sourcePage: 'Section 3.2 - DFT Requirements',
    riskTemplate: `TECHNICAL RISK:
• Excessive coating thickness may cause adhesion failure during bending
• Risk of coating disbondment at field bends and sags
• Evaluate acceptance per engineering disposition
• Document deviation for as-built records`,
    severity: 'warning',
    icon: '🎨'
  },

  // =========================================================================
  // RAG-BASED SPECIFICATION VIOLATIONS
  // These flags are generated by AI analysis against uploaded project documents
  // =========================================================================

  SPEC_VIOLATION: {
    violationTitle: 'Project Specification Non-Compliance',
    anomalyType: 'Value Outside Engineering Specification',
    referenceTemplate: 'Per {sourceDocument}: {specRequirement}. Recorded value: {recordedValue}.',
    sourceDocument: 'Project Specification',
    sourcePage: 'As cited in finding',
    riskTemplate: `TECHNICAL RISK:
• Work not meeting project specifications may require rework
• Engineering disposition required before proceeding
• Document deviation for NCR tracking if accepted as-is
• May impact downstream activities (hydro-test, tie-in, commissioning)`,
    severity: 'critical',
    icon: '📋'
  },
  COATING_VIOLATION: {
    violationTitle: 'Field Joint Coating Out of Specification',
    anomalyType: 'Coating Parameter Deviation',
    referenceTemplate: 'Project Specification requires: {specRequirement}. Recorded: {recordedValue}.',
    sourceDocument: 'Project Coating Specification',
    sourcePage: 'Section 4.1 - Field Joint Coating',
    riskTemplate: `TECHNICAL RISK:
• Coating non-compliance compromises long-term corrosion protection
• Joint requires Holiday Detection before Lower-in authorization
• May require stripping and re-application per CSA Z245.30
• Cathodic protection design assumes coating integrity - failure accelerates corrosion`,
    severity: 'critical',
    icon: '🎨'
  },
  PROCEDURE_VIOLATION: {
    violationTitle: 'Procedure Non-Compliance',
    anomalyType: 'Work Not Per Approved Procedure',
    referenceTemplate: 'Per {sourceDocument}: {specRequirement}. Actual practice: {recordedValue}.',
    sourceDocument: 'Approved Project Procedure',
    sourcePage: 'As cited in finding',
    riskTemplate: `TECHNICAL RISK:
• Deviation from approved procedures may void certification
• Work may need to be repeated following correct procedure
• Quality records incomplete - ITP sign-off at risk
• Escalate to QA for procedural compliance review`,
    severity: 'critical',
    icon: '📝'
  },
  EQUIPMENT_MISMATCH: {
    violationTitle: 'Equipment/Specification Not in Approved List',
    anomalyType: 'Unapproved Equipment or Material',
    referenceTemplate: 'Equipment/specification "{recordedValue}" not found in approved project documentation.',
    sourceDocument: 'Project Equipment Register',
    sourcePage: 'Appendix C - Approved Equipment List',
    riskTemplate: `TECHNICAL RISK:
• Using unapproved equipment may result in non-compliant work
• Calibration and certification status unknown
• Verify with Project Engineer before authorizing continued use
• Document equipment substitution for as-built records`,
    severity: 'warning',
    icon: '🔧'
  },
  NDT_REJECTION: {
    violationTitle: 'NDT Rejection Unresolved',
    anomalyType: 'Weld Repair Not Documented',
    referenceTemplate: 'NDE Report #{reportNumber} indicates rejection at weld {weldId}. Repair and re-examination documentation not found.',
    sourceDocument: 'NDT Procedure',
    sourcePage: 'Section 7.2 - Repair & Re-examination Requirements',
    riskTemplate: `TECHNICAL RISK:
• CRITICAL: Rejected weld cannot be placed in service
• Weld repair must follow approved repair procedure
• Re-examination required to same acceptance criteria
• Missing repair records will block ITP close-out`,
    severity: 'critical',
    icon: '🔬'
  },
  WELDER_QUALIFICATION_EXPIRED: {
    violationTitle: 'Welder Qualification Lapsed',
    anomalyType: 'Personnel Certification Expired',
    referenceTemplate: 'Welder {welderName} (Stencil: {stencil}) qualification expired {expiryDate}. Work performed on {workDate}.',
    sourceDocument: 'CSA Z662',
    sourcePage: 'Clause 7.3 - Welder Qualification Maintenance',
    riskTemplate: `TECHNICAL RISK:
• CRITICAL: All welds by this welder since expiry require review
• Welds may require NDE re-examination or cut-out
• Verify welder re-qualification status immediately
• Stop work for this welder pending qualification verification`,
    severity: 'critical',
    icon: '👨‍🔧'
  },
  WALL_THICKNESS_MISMATCH: {
    violationTitle: 'Wall Thickness Does Not Match Drawings',
    anomalyType: 'Pipe Wall Thickness Deviation',
    referenceTemplate: 'Engineering drawings specify wall thickness: {specRequirement}. Recorded: {recordedValue}.',
    sourceDocument: 'Engineering Line List',
    sourcePage: 'Pipe Schedule & Wall Thickness',
    riskTemplate: `TECHNICAL RISK:
• Wall thickness affects MAOP calculation per CSA Z662 Clause 4.3
• Wrong wall thickness may require pipe replacement
• Verify against MTR (Mill Test Report) for traceability
• Hydro-test pressure based on minimum wall - verify before test`,
    severity: 'critical',
    icon: '📐'
  },
  COVER_DEPTH_VIOLATION: {
    violationTitle: 'Depth of Cover Below Minimum',
    anomalyType: 'Insufficient Burial Depth',
    referenceTemplate: 'Minimum depth of cover per {sourceDocument}: {specRequirement}. Recorded: {recordedValue}.',
    sourceDocument: 'CSA Z662 / Crossing Agreement',
    sourcePage: 'Clause 4.7 - Depth of Cover Requirements',
    riskTemplate: `TECHNICAL RISK:
• Insufficient cover exposes pipeline to third-party damage
• Regulatory non-compliance - CSA Z662 minimum cover requirements
• May require excavation and re-grade before commissioning
• Document chainage for remediation tracking`,
    severity: 'critical',
    icon: '⛏️'
  },
  PREHEAT_VIOLATION: {
    violationTitle: 'Preheat Temperature Below WPS Minimum',
    anomalyType: 'Welding Preheat Non-Compliance',
    referenceTemplate: 'WPS {wpsNumber} requires minimum preheat: {specRequirement}. Recorded: {recordedValue}.',
    sourceDocument: 'Weld Procedure Specification',
    sourcePage: 'Essential Variables - Preheat',
    riskTemplate: `TECHNICAL RISK:
• Insufficient preheat increases hydrogen cracking risk
• Weld mechanical properties may not meet requirements
• All welds at below-spec preheat require NDE review
• Cold weather welding procedures may apply - verify ambient conditions`,
    severity: 'critical',
    icon: '🌡️'
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
    riskTemplate: `TECHNICAL RISK:
• This item requires manual review and verification
• Consult with Chief Inspector for disposition
• Document findings in daily inspection report`,
    severity: 'info',
    icon: '🔍'
  }
}
