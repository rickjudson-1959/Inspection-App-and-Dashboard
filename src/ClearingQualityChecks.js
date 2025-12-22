/**
 * CLEARING ACTIVITY - QUALITY CHECKS CONFIGURATION
 * Based on API 1169 and Pipeline Construction Inspector Responsibilities
 * 
 * Usage: Import this into your InspectorReport.jsx and replace the existing
 * 'Clearing' quality checks with this expanded configuration.
 */

export const ClearingQualityChecks = [
  // =====================================================
  // SECTION 1: RIGHT-OF-WAY & BOUNDARIES
  // =====================================================
  {
    section: 'Right-of-Way & Boundaries',
    fields: [
      { 
        name: 'rowWidthDesign', 
        label: 'Design ROW Width (m)', 
        type: 'number',
        placeholder: 'Per route sheets',
        required: true
      },
      { 
        name: 'rowWidthActual', 
        label: 'Actual ROW Width (m)', 
        type: 'number',
        placeholder: 'Field measured',
        required: true
      },
      { 
        name: 'rowWidthCompliant', 
        label: 'ROW Width Compliant?', 
        type: 'select', 
        options: ['Yes', 'No - Over Width', 'No - Under Width'],
        required: true
      },
      { 
        name: 'rowAlignmentVerified', 
        label: 'ROW Alignment Verified Against Route Sheets?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A'],
        required: true
      },
      { 
        name: 'boundariesFlagged', 
        label: 'Boundaries Flagged & Visible?', 
        type: 'select', 
        options: ['Yes', 'No', 'Partially'],
        required: true
      },
      { 
        name: 'twsStaked', 
        label: 'Temporary Workspace (TWS) Staked?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      },
      { 
        name: 'legalSurveyPinsProtected', 
        label: 'Legal Survey Pins Marked/Protected?', 
        type: 'select', 
        options: ['Yes', 'No', 'None Present', 'N/A'],
        required: true
      }
    ]
  },

  // =====================================================
  // SECTION 2: PRE-CLEARING APPROVALS & COMPLIANCE
  // =====================================================
  {
    section: 'Pre-Clearing Approvals & Compliance',
    fields: [
      { 
        name: 'cgrPlanApproved', 
        label: 'CGR Plan Approved & On-Site?', 
        type: 'select', 
        options: ['Yes', 'No'],
        tooltip: 'Clear, Grade and Reclamation Plan',
        required: true
      },
      { 
        name: 'cgrPlanCompliance', 
        label: 'Work Compliant with CGR Plan?', 
        type: 'select', 
        options: ['Yes', 'No', 'Partial Deviation']
      },
      { 
        name: 'offRowApprovalsInPlace', 
        label: 'Off-ROW Work Approvals in Place?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A - No Off-ROW Work'],
        required: true
      },
      { 
        name: 'constructionLineListReviewed', 
        label: 'Construction Line List Reviewed?', 
        type: 'select', 
        options: ['Yes', 'No'],
        tooltip: 'Check for landowner requirements and restrictions'
      },
      { 
        name: 'landownerRestrictionsNoted', 
        label: 'Landowner Restrictions Noted?', 
        type: 'select', 
        options: ['Yes - Compliant', 'Yes - Non-Compliant', 'No Restrictions', 'N/A']
      },
      { 
        name: 'landAgentContact', 
        label: 'Land Agent Contact Maintained?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      }
    ]
  },

  // =====================================================
  // SECTION 3: ENVIRONMENTAL COMPLIANCE
  // =====================================================
  {
    section: 'Environmental Compliance',
    fields: [
      { 
        name: 'environmentalInspectorLiaison', 
        label: 'Liaised with Environmental Inspector?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A'],
        required: true
      },
      { 
        name: 'timingConstraintsMet', 
        label: 'Timing Constraints Met?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A'],
        tooltip: 'Wildlife windows, seasonal restrictions'
      },
      { 
        name: 'wildlifeRegulationsCompliant', 
        label: 'Wildlife Regulations Compliant?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      },
      { 
        name: 'rarePlantProtection', 
        label: 'Rare Plant Areas Protected?', 
        type: 'select', 
        options: ['Yes', 'No', 'None Identified', 'N/A']
      },
      { 
        name: 'asrdCommitmentsMet', 
        label: 'ASRD Commitments Met?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A'],
        tooltip: 'Alberta Sustainable Resource Development'
      },
      { 
        name: 'groundDisturbanceCompliant', 
        label: 'Ground Disturbance per Contract Docs?', 
        type: 'select', 
        options: ['Yes', 'No'],
        required: true
      }
    ]
  },

  // =====================================================
  // SECTION 4: BURIED FACILITIES & UTILITIES
  // =====================================================
  {
    section: 'Buried Facilities & Utilities',
    fields: [
      { 
        name: 'buriedFacilitiesIdentified', 
        label: 'Buried Facilities Identified?', 
        type: 'select', 
        options: ['Yes', 'No', 'None Present'],
        required: true
      },
      { 
        name: 'locatesComplete', 
        label: 'Utility Locates Complete?', 
        type: 'select', 
        options: ['Yes', 'No', 'Pending', 'N/A']
      },
      { 
        name: 'handExposingComplete', 
        label: 'Hand/Hydrovac Exposing Complete?', 
        type: 'select', 
        options: ['Yes', 'No', 'In Progress', 'N/A'],
        tooltip: 'Required prior to grading per specifications'
      },
      { 
        name: 'foreignCrossingsMarked', 
        label: 'Foreign Crossings Marked?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      }
    ]
  },

  // =====================================================
  // SECTION 5: OVERHEAD POWER LINES
  // =====================================================
  {
    section: 'Overhead Power Lines',
    fields: [
      { 
        name: 'powerLinesPresent', 
        label: 'Overhead Power Lines Present?', 
        type: 'select', 
        options: ['Yes', 'No'],
        required: true
      },
      { 
        name: 'powerLinesIdentified', 
        label: 'Power Lines Identified per Specs?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      },
      { 
        name: 'powerLinesMarked', 
        label: 'Power Lines Marked per Safety Req?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A'],
        tooltip: 'Project Safety requirements'
      },
      { 
        name: 'powerLinesClearance', 
        label: 'Adequate Clearance Maintained?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      },
      { 
        name: 'powerLineVoltage', 
        label: 'Power Line Voltage (if known)', 
        type: 'text', 
        placeholder: 'e.g., 25kV, 138kV'
      }
    ]
  },

  // =====================================================
  // SECTION 6: TIMBER SALVAGE
  // =====================================================
  {
    section: 'Timber Salvage',
    fields: [
      { 
        name: 'timberSalvageRequired', 
        label: 'Timber Salvage Required?', 
        type: 'select', 
        options: ['Yes', 'No'],
        required: true
      },
      { 
        name: 'timberSalvageCompliant', 
        label: 'Timber Harvesting per TSP Requirements?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A'],
        tooltip: 'Timber Salvage Plan compliance'
      },
      { 
        name: 'merchantableTimberSalvaged', 
        label: 'Merchantable Timber Salvaged?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      },
      { 
        name: 'timberDisposalMethod', 
        label: 'Timber Disposal Method', 
        type: 'select', 
        options: ['Decked for Haul', 'Mulched', 'Burned', 'Rollback', 'Mixed Methods', 'N/A']
      },
      { 
        name: 'timberDecksCreated', 
        label: 'Timber Decks Created Today?', 
        type: 'select', 
        options: ['Yes', 'No'],
        tooltip: 'If Yes, complete Timber Deck Log below'
      }
    ]
  },

  // =====================================================
  // SECTION 7: GRUBBING & STRIPPING
  // =====================================================
  {
    section: 'Grubbing & Stripping',
    fields: [
      { 
        name: 'grubbingComplete', 
        label: 'Grubbing Complete?', 
        type: 'select', 
        options: ['Yes', 'No', 'In Progress', 'N/A']
      },
      { 
        name: 'stumpHeightCompliant', 
        label: 'Stump Height Compliant?', 
        type: 'select', 
        options: ['Pass', 'Fail', 'N/A'],
        required: true
      },
      { 
        name: 'stumpHeightMax', 
        label: 'Max Stump Height Observed (cm)', 
        type: 'number',
        placeholder: 'Specification typically ≤15cm'
      },
      { 
        name: 'topsoilStripped', 
        label: 'Topsoil Stripped & Stockpiled?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      },
      { 
        name: 'topsoilSeparation', 
        label: 'Topsoil Separated from Subsoil?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      }
    ]
  },

  // =====================================================
  // SECTION 8: WATERCOURSE CROSSINGS
  // =====================================================
  {
    section: 'Watercourse Crossings',
    fields: [
      { 
        name: 'watercoursePresent', 
        label: 'Watercourse in Work Area?', 
        type: 'select', 
        options: ['Yes', 'No'],
        required: true
      },
      { 
        name: 'watercourseAccessCompliant', 
        label: 'Access Clearing per Specifications?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      },
      { 
        name: 'equipmentCrossingInstalled', 
        label: 'Equipment Crossing Installed?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      },
      { 
        name: 'equipmentCrossingType', 
        label: 'Crossing Type', 
        type: 'select', 
        options: ['Temporary Bridge', 'Mat Crossing', 'Culvert', 'Ford', 'Other', 'N/A']
      },
      { 
        name: 'regulatoryApprovalCompliant', 
        label: 'Compliant with Regulatory Approvals?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A'],
        tooltip: 'DFO, AEP, Water Act approvals'
      },
      { 
        name: 'erosionControlsInstalled', 
        label: 'Erosion Controls Installed?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      }
    ]
  },

  // =====================================================
  // SECTION 9: TEMPORARY FENCING
  // =====================================================
  {
    section: 'Temporary Fencing',
    fields: [
      { 
        name: 'tempFencingRequired', 
        label: 'Temporary Fencing Required?', 
        type: 'select', 
        options: ['Yes', 'No'],
        required: true
      },
      { 
        name: 'tempFencingInstalled', 
        label: 'Temporary Fencing Installed?', 
        type: 'select', 
        options: ['Yes', 'No', 'In Progress', 'N/A']
      },
      { 
        name: 'tempFencingType', 
        label: 'Fencing Type', 
        type: 'select', 
        options: ['Page Wire', 'Barbed Wire', 'Electric', 'Snow Fence', 'Construction Fence', 'Other', 'N/A']
      },
      { 
        name: 'tempFencingLength', 
        label: 'Fencing Length Installed (m)', 
        type: 'number',
        placeholder: 'Total meters'
      },
      { 
        name: 'gatesInstalled', 
        label: 'Gates Installed?', 
        type: 'select', 
        options: ['Yes', 'No', 'N/A']
      },
      { 
        name: 'gatesCount', 
        label: 'Number of Gates', 
        type: 'number'
      }
    ]
  },

  // =====================================================
  // SECTION 10: GENERAL OBSERVATIONS
  // =====================================================
  {
    section: 'General Observations',
    fields: [
      { 
        name: 'weatherConditions', 
        label: 'Weather Conditions', 
        type: 'select', 
        options: ['Clear', 'Cloudy', 'Rain', 'Snow', 'Fog', 'Windy']
      },
      { 
        name: 'groundConditions', 
        label: 'Ground Conditions', 
        type: 'select', 
        options: ['Dry', 'Wet', 'Frozen', 'Muddy', 'Saturated']
      },
      { 
        name: 'safetyIssuesObserved', 
        label: 'Safety Issues Observed?', 
        type: 'select', 
        options: ['None', 'Yes - Reported', 'Yes - Corrected']
      },
      { 
        name: 'ncrRequired', 
        label: 'NCR Required?', 
        type: 'select', 
        options: ['No', 'Yes - Issued', 'Yes - Pending'],
        tooltip: 'Non-Conformance Report'
      },
      { 
        name: 'inspectorNotes', 
        label: 'Inspector Notes', 
        type: 'textarea',
        placeholder: 'Additional observations, issues, or comments...'
      }
    ]
  }
];

/**
 * FLAT ARRAY FORMAT
 * Use this if your app expects a flat array instead of sectioned format
 */
export const ClearingQualityChecksFlat = ClearingQualityChecks.reduce((acc, section) => {
  return [...acc, ...section.fields];
}, []);

/**
 * DEFAULT VALUES
 * Use for initializing form state
 */
export const ClearingDefaultValues = ClearingQualityChecksFlat.reduce((acc, field) => {
  acc[field.name] = '';
  return acc;
}, {});

/**
 * REQUIRED FIELDS
 * For validation
 */
export const ClearingRequiredFields = ClearingQualityChecksFlat
  .filter(field => field.required)
  .map(field => field.name);

export default ClearingQualityChecks;
