// constants.js - Pipeline Inspector Report Constants
// Extracted from InspectorReport.jsx for cleaner code organization

// Project configuration - FortisBC Eagle Mountain - Woodfibre Gas Pipeline
export const PROJECT_NAME = "FortisBC EGP - Eagle Mountain Woodfibre Gas Pipeline"
export const PROJECT_SHORT = "EGP"

// Pipeline locations for weather lookup - EGP North Line (38.47km)
// KP 0+000 at Coquitlam to KP 38+470 at Woodfibre approach
// Data extracted from FortisBC provisional asbuilt KML
export const pipelineLocations = {
  'Coquitlam Start':    { lat: 49.525, lon: -122.84, name: 'Coquitlam Start', kpStart: 0, kpEnd: 10000 },
  'Indian Arm':         { lat: 49.56, lon: -122.94, name: 'Indian Arm', kpStart: 10000, kpEnd: 20000 },
  'Mid-Route':          { lat: 49.64, lon: -123.02, name: 'Mid-Route', kpStart: 20000, kpEnd: 30000 },
  'Woodfibre Approach': { lat: 49.71, lon: -123.12, name: 'Woodfibre Approach', kpStart: 30000, kpEnd: 38470 }
}

// Migration mapping for old KP-range pipeline values to new geographic names
export const pipelineMigrationMap = {
  'KP 0+000 to 10+000':  'Coquitlam Start',
  'KP 10+000 to 20+000': 'Indian Arm',
  'KP 20+000 to 30+000': 'Mid-Route',
  'KP 30+000 to 38+470': 'Woodfibre Approach'
}

// Spread definitions - maps spread to pipeline section
export const spreadOptions = ['Spread 1', 'Spread 2', 'Spread 3', 'Spread 4']

// Mapping of spread to pipeline section (auto-populates when spread is selected)
export const spreadToPipeline = {
  'Spread 1': 'Coquitlam Start',
  'Spread 2': 'Indian Arm',
  'Spread 3': 'Mid-Route',
  'Spread 4': 'Woodfibre Approach'
}

// Activity types for pipeline construction
export const activityTypes = [
  'Clearing',
  'Access',
  'Topsoil',
  'Grading',
  'Stringing',
  'Bending',
  'Welding - Mainline',
  'Welding - Section Crew',
  'Welding - Poor Boy',
  'Welding - Tie-in',
  'Coating',
  'Tie-in Coating',
  'Ditch',
  'Lower-in',
  'Backfill',
  'Tie-in Backfill',
  'Cleanup - Machine',
  'Cleanup - Final',
  'Hydrostatic Testing',
  'HDD',
  'HD Bores',
  'Piling',
  'Equipment Cleaning',
  'Hydrovac',
  'Welder Testing',
  'Frost Packing',
  'Pipe Yard',
  'Other'
]

// Quality fields per activity type (API 1169 based)
export const qualityFieldsByActivity = {
  'Clearing': [], // Handled by ClearingLog component
  'Access': [
    { name: 'accessWidth', label: 'Access Width (m)', type: 'number' },
    { name: 'surfaceCondition', label: 'Surface Condition', type: 'select', options: ['Good', 'Fair', 'Poor'] },
    { name: 'drainageCulverts', label: 'Drainage/Culverts', type: 'select', options: ['Clear', 'Blocked', 'Installed to Spec'] },
    { name: 'escStatus', label: 'ESC Status (Silt Fence/Wattles)', type: 'select', options: ['Functional', 'Needs Maintenance', 'Missing'] },
    { name: 'mattingIntegrity', label: 'Matting Integrity', type: 'select', options: ['Secure', 'Gaps Detected', 'Repairs Needed'] },
    { name: 'gateFenceSecurity', label: 'Gate/Fence Security', type: 'select', options: ['Locked & Functional', 'Open', 'Damaged'] },
    { name: 'cleaningStationActive', label: 'Cleaning Station Active', type: 'select', options: ['Yes', 'No', 'N/A'] },
    { name: 'waterbarsFunctional', label: 'Waterbars Functional', type: 'select', options: ['Yes', 'No'] }
  ],
  'Topsoil': [
    // Horizon Separation & Stripping Depth Section
    { name: 'horizonSection', label: '🌍 Horizon Separation & Stripping Depth', type: 'collapsible', fields: [
      { name: 'horizonSeparationConfirmed', label: 'Horizon Separation Confirmed?', type: 'select', options: ['Pass', 'Fail', 'N/A'] },
      { name: 'colorChangeVisible', label: 'Color Change Visible?', type: 'select', options: ['Yes - Clear', 'Yes - Faint', 'No'] },
      { name: 'horizonPhotoTaken', label: '📷 Photo Taken?', type: 'select', options: ['Yes', 'No'] },
      { name: 'easSpecDepth', label: 'EAS Spec Depth (cm)', type: 'number', placeholder: 'From soil survey' },
      { name: 'actualDepth', label: 'Actual Depth (cm)', type: 'number' },
      { name: 'depthVariance', label: 'Depth Variance (cm)', type: 'calculated', formula: 'actualDepth - easSpecDepth' },
      { name: 'depthCompliance', label: 'Depth Compliance', type: 'calculated', formula: 'variance <= 2 ? Pass : Fail' },
      { name: 'measurementMethod', label: 'Measurement Method', type: 'select', options: ['Tape Measure', 'Survey Rod', 'Laser Level', 'Visual Estimate'] },
      { name: 'measurementPoints', label: '# of Measurement Points', type: 'number' }
    ]},
    
    // Admixture Assessment Section
    { name: 'admixtureSection', label: '🔬 Admixture Assessment', type: 'collapsible', fields: [
      { name: 'admixtureVisual', label: 'Visual Assessment', type: 'select', options: ['<5% - Acceptable', '5-15% - Monitor', '>15% - Fail'] },
      { name: 'admixtureCompliance', label: 'Compliance', type: 'select', options: ['Pass', 'Fail'] },
      { name: 'admixtureCause', label: 'Cause (if >5%)', type: 'select', options: ['N/A', 'Operator Error', 'Soil Conditions', 'Equipment Issue', 'Weather Related'] },
      { name: 'admixtureCorrectiveAction', label: 'Corrective Action', type: 'text', placeholder: 'Action taken if required' },
      { name: 'admixturePhotoTaken', label: '📷 Photo Taken?', type: 'select', options: ['Yes', 'No'] }
    ]},
    
    // Stockpile Management Section
    { name: 'stockpileSection', label: '📦 Stockpile Management', type: 'collapsible', fields: [
      { name: 'stockpileSeparationDistance', label: 'Separation Distance (m)', type: 'number', placeholder: 'Min 1.0m required' },
      { name: 'stockpileSeparationCompliance', label: 'Separation Compliance (≥1.0m)', type: 'select', options: ['Pass', 'Fail'] },
      { name: 'topsoilPileLocation', label: 'Topsoil Pile Location', type: 'select', options: ['Work Side', 'Spoil Side', 'Both Sides'] },
      { name: 'stockpilePhotoTaken', label: '📷 Photo Taken?', type: 'select', options: ['Yes', 'No'] }
    ]},
    
    // Windrows & Wildlife Passage Section
    { name: 'windrowSection', label: '🦌 Windrows & Wildlife Passage', type: 'collapsible', fields: [
      { name: 'windrowBreaksPresent', label: 'Breaks Present?', type: 'select', options: ['Yes', 'No', 'N/A'] },
      { name: 'windrowBreakSpacing', label: 'Break Spacing (m)', type: 'number', placeholder: 'Distance between breaks' },
      { name: 'wildlifePassageOK', label: 'Wildlife Passage OK?', type: 'select', options: ['Yes', 'No', 'N/A'] },
      { name: 'crossDrainageOK', label: 'Cross-Drainage OK?', type: 'select', options: ['Yes', 'No', 'N/A'] },
      { name: 'windrowPhotoTaken', label: '📷 Photo Taken?', type: 'select', options: ['Yes', 'No'] }
    ]},
    
    // Buffer & Setback Compliance Section
    { name: 'bufferSection', label: '🌿 Buffer & Setback Compliance', type: 'collapsible', fields: [
      { name: 'bufferZonesPresent', label: 'Buffer Zones Present?', type: 'select', options: ['Yes', 'No', 'N/A'] },
      { name: 'stakesVisible', label: 'Stakes Visible?', type: 'select', options: ['Yes - Clear', 'Yes - Partial', 'No - Missing', 'N/A'] },
      { name: 'strippingStoppedAtStakes', label: 'Stripping Stopped at Stakes?', type: 'select', options: ['Pass - Exact', 'Pass - Short of Stakes', 'Fail - Past Stakes', 'N/A'] },
      { name: 'bufferEncroachment', label: 'Buffer Encroachment?', type: 'select', options: ['None', 'Minor (<1m)', 'Significant (>1m) - NCR'] },
      { name: 'bufferKPLocation', label: 'Buffer Location (KP)', type: 'text', placeholder: 'KP of buffer zone' },
      { name: 'bufferGPSMarked', label: '📍 GPS Location Recorded?', type: 'select', options: ['Yes', 'No'] },
      { name: 'bufferPhotoTaken', label: '📷 Buffer Photo Taken?', type: 'select', options: ['Yes', 'No'] }
    ]},
    
    // Weather & Erosion Risk Section
    { name: 'weatherRiskSection', label: '🌧️ Weather & Erosion Risk', type: 'collapsible', fields: [
      { name: 'currentWeatherConditions', label: 'Current Conditions', type: 'select', options: ['Dry', 'Light Rain', 'Heavy Rain', 'Snow', 'Frost'] },
      { name: 'rainForecast24hr', label: 'Rain in Next 24hr?', type: 'select', options: ['No', 'Yes - Light', 'Yes - Heavy', 'Unknown'] },
      { name: 'pilesStabilizedBeforeRain', label: 'Piles Stabilized?', type: 'select', options: ['Yes', 'No - At Risk', 'In Progress', 'N/A'] },
      { name: 'erosionRiskLevel', label: 'Erosion Risk Level', type: 'select', options: ['Low', 'Medium', 'High - Monitor', 'Critical - Action Req'] },
      { name: 'escMeasuresInPlace', label: 'ESC Measures in Place?', type: 'select', options: ['Yes - Adequate', 'Yes - Partial', 'No - Required', 'N/A'] }
    ]}
  ],
  'Grading': [], // Handled by GradingLog component
  'Stringing': [
    // Pipe Receiving Inspection Section
    { name: 'pipeReceivingSection', label: '📦 PIPE RECEIVING INSPECTION', type: 'collapsible', fields: [
      { name: 'truckNumber', label: 'Truck/Load Number', type: 'text' },
      { name: 'tallyNumber', label: 'Tally Number', type: 'text' },
      { name: 'jointsReceived', label: '# Joints Received', type: 'number' },
      { name: 'pipeSize', label: 'Pipe Size (NPS)', type: 'select', options: ['4"', '6"', '8"', '10"', '12"', '16"', '20"', '24"', '30"', '36"', '42"'] },
      { name: 'pipeGrade', label: 'Pipe Grade', type: 'select', options: ['X42', 'X52', 'X60', 'X65', 'X70', 'X80'] },
      { name: 'wallThicknessSpec', label: 'Wall Thickness (mm)', type: 'number' },
      { name: 'coatingType', label: 'Coating Type', type: 'select', options: ['FBE', 'ARO', '3LPE', '3LPP', 'Concrete', 'Bare'] }
    ]},
    
    // Mill Certification Section
    { name: 'millCertSection', label: '📋 MILL CERTIFICATION VERIFICATION', type: 'collapsible', fields: [
      { name: 'heatNumbersRecorded', label: 'Heat Numbers Recorded?', type: 'select', options: ['Yes', 'No', 'Partial'] },
      { name: 'heatNumbersMatch', label: 'Heat Numbers Match Mill Cert?', type: 'select', options: ['Yes', 'No - Flagged', 'N/A'] },
      { name: 'wallThicknessVerified', label: 'Wall Thickness per Spec?', type: 'select', options: ['Yes', 'No - Flagged', 'N/A'] },
      { name: 'gradeMatchesSpec', label: 'Grade Matches Specification?', type: 'select', options: ['Yes', 'No - Flagged', 'N/A'] },
      { name: 'ndtCertPresent', label: 'NDT Certification Present?', type: 'select', options: ['Yes', 'No', 'N/A'] },
      { name: 'millCertPhotoTaken', label: '📷 Mill Cert Photo Taken?', type: 'select', options: ['Yes', 'No'] }
    ]},
    
    // Visual Inspection Section
    { name: 'visualInspectionSection', label: '👁️ VISUAL INSPECTION', type: 'collapsible', fields: [
      { name: 'coatingCondition', label: 'Coating Condition', type: 'select', options: ['Accept - No Damage', 'Minor Damage (<5%)', 'Major Damage (>5%) - Flagged', 'Coating Missing'] },
      { name: 'pipeEndCondition', label: 'Pipe End/Bevel Condition', type: 'select', options: ['Accept', 'Damaged - Minor', 'Damaged - Major', 'Needs Re-bevel'] },
      { name: 'dentsDeformations', label: 'Dents or Deformations?', type: 'select', options: ['None', 'Minor - Accept', 'Major - Flagged'] },
      { name: 'damageLocation', label: 'Damage Location/Description', type: 'text', placeholder: 'If damaged, describe location' },
      { name: 'visualInspectionPhoto', label: '📷 Damage Photo Taken?', type: 'select', options: ['Yes', 'No', 'N/A - No Damage'] }
    ]},
    
    // Dimensional Verification Section
    { name: 'dimensionalSection', label: '📏 DIMENSIONAL VERIFICATION', type: 'collapsible', fields: [
      { name: 'sampleFrequency', label: 'Sample Frequency', type: 'text', placeholder: 'e.g., 1 per 10 joints' },
      { name: 'odMeasured', label: 'OD Measurement (mm)', type: 'number' },
      { name: 'odWithinTolerance', label: 'OD Within Tolerance?', type: 'select', options: ['Yes', 'No - Flagged', 'N/A'] },
      { name: 'wtMeasured', label: 'Wall Thickness Measured (mm)', type: 'number' },
      { name: 'wtWithinTolerance', label: 'WT Within Tolerance?', type: 'select', options: ['Yes', 'No - Flagged', 'N/A'] },
      { name: 'ovalityCheck', label: 'Ovality Within Spec?', type: 'select', options: ['Yes', 'No - Flagged', 'N/A'] }
    ]},
    
    // Stringing Operations Section
    { name: 'stringingOpsSection', label: '🔧 STRINGING OPERATIONS', type: 'collapsible', fields: [
      { name: 'stringingMethod', label: 'Stringing Method', type: 'select', options: ['Conventional', 'Reverse Lay', 'Double Joint'] },
      { name: 'equipmentUsed', label: 'Equipment Used', type: 'select', options: ['Sideboom', 'Picker', 'Excavator', 'Multiple'] },
      { name: 'pipeHandling', label: 'Pipe Handling', type: 'select', options: ['Acceptable', 'Concerns Noted'] },
      { name: 'skidsBlocksUsed', label: 'Skids/Blocks Used?', type: 'select', options: ['Yes', 'No', 'N/A'] },
      { name: 'groundCondition', label: 'Ground Condition', type: 'select', options: ['Dry', 'Wet', 'Muddy', 'Frozen'] }
    ]},
    
    // Acceptance Section
    { name: 'acceptanceSection', label: '✅ ACCEPTANCE & DISPOSITION', type: 'collapsible', fields: [
      { name: 'pipeAccepted', label: 'Pipe Accepted?', type: 'select', options: ['Yes - All', 'Yes - Partial', 'No - Rejected'] },
      { name: 'rejectedJoints', label: '# Joints Rejected', type: 'number' },
      { name: 'rejectionReason', label: 'Rejection Reason', type: 'select', options: ['N/A', 'Coating Damage', 'Bevel Damage', 'Dents/Deformation', 'Wrong Spec', 'Mill Cert Issue', 'Other'] },
      { name: 'disposition', label: 'Rejected Pipe Disposition', type: 'select', options: ['N/A', 'Return to Mill', 'Repair On-site', 'Downgrade', 'Scrap'] },
      { name: 'acceptanceNotes', label: 'Notes', type: 'textarea', placeholder: 'Additional notes on acceptance/rejection...' }
    ]}
  ],
  'Bending': [
    { name: 'bendAngle', label: 'Bend Angle (°)', type: 'number' },
    { name: 'bendRadius', label: 'Bend Radius (m)', type: 'number' },
    { name: 'ovalityPercent', label: 'Ovality %', type: 'number' },
    { name: 'wrinkleCheck', label: 'Wrinkle Check', type: 'select', options: ['Pass', 'Fail', 'N/A'] },
    { name: 'bendTemp', label: 'Temperature (°C)', type: 'number' },
    { name: 'distanceToWeld', label: 'Distance to Nearest Weld (m)', type: 'number' }
  ],
  'Welding - Mainline': [
    { name: 'weldNumber', label: 'Weld Number', type: 'text' },
    { name: 'welderID', label: 'Welder ID', type: 'text' },
    { name: 'wpsNumber', label: 'WPS Number', type: 'text' },
    { name: 'preheatTemp', label: 'Preheat Temp (°C)', type: 'number' },
    { name: 'ndtType', label: 'NDT Type', type: 'select', options: ['RT', 'UT', 'MT', 'PT', 'None'] },
    { name: 'ndtResult', label: 'NDT Result', type: 'select', options: ['Accept', 'Reject', 'Pending'] },
    { name: 'repairRequired', label: 'Repair Required', type: 'select', options: ['Yes', 'No'] },
    { name: 'repairType', label: 'Repair Type', type: 'select', options: ['N/A', 'Root', 'Hot Pass', 'Fill', 'Cap', 'Full Cutout'] },
    { name: 'repairPass', label: 'Repair Pass #', type: 'text' },
    { name: 'rootOpening', label: 'Root Opening (mm)', type: 'number' },
    { name: 'hiLo', label: 'Hi-Lo (mm)', type: 'number' },
    { name: 'gap', label: 'Gap (mm)', type: 'number' }
  ],
  'Welding - Tie-in': [], // Handled by CounterboreTransitionLog component
  'Coating': [], // Handled by CoatingLog component
  'Ditch': [], // Handled by DitchLog component
  'Lower-in': [
    { name: 'beddingPadding', label: 'Bedding/Padding', type: 'select', options: ['Yes', 'No'], reminder: 'Remember to fill out the Bedding & Padding trackable item in the Trackable Items section.' },
    { name: 'clearance', label: 'Foreign Line Clearance (m)', type: 'number' },
    { name: 'liftPlanVerified', label: 'Lift Plan Verified', type: 'select', options: ['Yes', 'No'] },
    { name: 'equipmentInspected', label: 'Equipment Inspected', type: 'select', options: ['Yes', 'No'] }
  ],
  'Backfill': [
    { name: 'liftThickness', label: 'Lift Thickness (cm)', type: 'number' },
    { name: 'compactionPercent', label: 'Compaction %', type: 'number' },
    { name: 'rockShield', label: 'Rock Shield Used', type: 'select', options: ['Yes', 'No', 'N/A'] }
  ],
  'Tie-in Backfill': [], // Handled by TieInCompletionLog component
  'Tie-in Coating': [], // Handled by CoatingLog component
  'Pipe Yard': [], // Generic activity
  'Other': [], // Generic catch-all activity
  'Cleanup - Machine': [], // Handled by MachineCleanupLog component
  'Cleanup - Final': [], // Handled by FinalCleanupLog component
  'HDD': [], // Handled by HDDLog component
  'Piling': [], // Handled by PilingLog component
  'Equipment Cleaning': [], // Handled by EquipmentCleaningLog component
  'Hydrovac': [], // Handled by HydrovacLog component
  'Welder Testing': [], // Handled by WelderTestingLog component
  'Hydrostatic Testing': [], // Handled by HydrotestLog component
  'HD Bores': [
    { name: 'boreLength', label: 'Bore Length (m)', type: 'number' },
    { name: 'casingSize', label: 'Casing Size (in)', type: 'number' },
    { name: 'carrierPipeSize', label: 'Carrier Pipe Size (in)', type: 'number' },
    { name: 'annularSpace', label: 'Annular Space Filled', type: 'select', options: ['Yes', 'No'] }
  ],
  'Frost Packing': [
    { name: 'frostPackMaterial', label: 'Packing Material', type: 'select', options: ['Sand', 'Gravel', 'Select Fill', 'Screened Material', 'Other'] },
    { name: 'frostPackDepth', label: 'Cover Depth (cm)', type: 'number' },
    { name: 'frostPackMethod', label: 'Placement Method', type: 'select', options: ['Machine Placed', 'Hand Placed', 'Combination'] },
    { name: 'groundCondition', label: 'Ground Condition', type: 'select', options: ['Frozen', 'Partially Frozen', 'Thawed', 'Mixed'] },
    { name: 'frostDepth', label: 'Frost Depth (cm)', type: 'number' },
    { name: 'ambientTemp', label: 'Ambient Temp (°C)', type: 'number' },
    { name: 'pipeProtection', label: 'Pipe Protection in Place', type: 'select', options: ['Yes', 'No', 'N/A'] },
    { name: 'compactionAchieved', label: 'Compaction Achieved', type: 'select', options: ['Yes', 'No', 'N/A - Frozen'] }
  ]
}

// Time lost reasons
export const timeLostReasons = [
  'Weather',
  'Environmental',
  'Landowner Concerns',
  'Move Arounds',
  'Material Lay',
  'Safety Issue',
  'Equipment Breakdown',
  'Waiting on Materials',
  'Other'
]

// Field Activity Status definitions (inspector-friendly terminology)
export const productionStatuses = [
  { value: 'ACTIVE', label: 'Full Production', icon: '🚀', multiplier: 1.0, color: '#28a745', tooltip: 'Working at expected pace' },
  { value: 'SYNC_DELAY', label: 'Partial Work', icon: '⏳', multiplier: 0.7, color: '#ffc107', tooltip: 'Slowed by materials, sync, or minor site issues' },
  { value: 'MANAGEMENT_DRAG', label: 'Standby', icon: '🛑', multiplier: 0.0, color: '#dc3545', tooltip: 'Waiting for permits, instructions, or regulatory clearance' }
]

// Efficiency Audit - Impact Scope definitions
export const impactScopes = [
  { value: 'ASSET_ONLY', label: 'Asset Only', description: 'Affects single entry' },
  { value: 'ENTIRE_CREW', label: 'Entire Crew', description: 'Affects all entries in block' }
]

// Delay Reason Categories with Accountability Mapping
// - responsibleParty: 'owner' | 'contractor' | 'neutral' | 'unknown'
// - defaultSystemic: true = auto-select "Entire Crew" impact
// - lockSystemic: true = FORCE "Entire Crew" and disable toggle (e.g., environmental windows)
// - requiresNote: true = must provide detail in reliability_notes when Standby selected
//
// OWNER ISSUE: Permits, Land Access, First Nations, Environmental Windows, Engineering
// CONTRACTOR ISSUE: Mechanical, Supervisory, ROW, Rework, Materials, Grade
// NEUTRAL (Act of God): Extreme Weather, Force Majeure
export const dragReasonCategories = [
  // ═══════════════════════════════════════════════════════════════════════════
  // OWNER RESPONSIBILITY - Regulatory, permits, environmental windows, engineering
  // ═══════════════════════════════════════════════════════════════════════════
  { value: 'waiting_permits', label: 'Waiting for permits', defaultSystemic: true, lockSystemic: false, responsibleParty: 'owner', requiresNote: false },
  { value: 'land_access', label: 'Land access issue', defaultSystemic: true, lockSystemic: false, responsibleParty: 'owner', requiresNote: false },
  { value: 'first_nations_monitor', label: 'First Nations monitor', defaultSystemic: true, lockSystemic: false, responsibleParty: 'owner', requiresNote: false },

  // Environmental Windows - LOCK to Entire Crew (affects whole spread)
  { value: 'salmon_fish_window', label: 'Salmon fish window', defaultSystemic: true, lockSystemic: true, responsibleParty: 'owner', requiresNote: false },
  { value: 'coastal_tailed_frog', label: 'Coastal tailed frog habitat', defaultSystemic: true, lockSystemic: true, responsibleParty: 'owner', requiresNote: false },
  { value: 'bird_nesting_window', label: 'Bird nesting window', defaultSystemic: true, lockSystemic: true, responsibleParty: 'owner', requiresNote: false },
  { value: 'environmental_window', label: 'Other environmental window', defaultSystemic: true, lockSystemic: true, responsibleParty: 'owner', requiresNote: false },

  // Engineering & Regulatory
  { value: 'engineering_change', label: 'Engineering change order', defaultSystemic: true, lockSystemic: false, responsibleParty: 'owner', requiresNote: false },
  { value: 'regulatory_hold', label: 'Regulatory hold', defaultSystemic: true, lockSystemic: false, responsibleParty: 'owner', requiresNote: false },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRACTOR RESPONSIBILITY - Mechanical, supervisory, logistics, workmanship
  // All contractor issues require notes when Standby status is selected
  // ═══════════════════════════════════════════════════════════════════════════
  { value: 'mechanical_breakdown', label: 'Mechanical breakdown', defaultSystemic: false, lockSystemic: false, responsibleParty: 'contractor', requiresNote: true },
  { value: 'supervisory_latency', label: 'Supervisory latency', defaultSystemic: false, lockSystemic: false, responsibleParty: 'contractor', requiresNote: true },
  { value: 'row_congestion', label: 'ROW congestion', defaultSystemic: false, lockSystemic: false, responsibleParty: 'contractor', requiresNote: true },
  { value: 'ditch_sloughing', label: 'Ditch sloughing / rework', defaultSystemic: false, lockSystemic: false, responsibleParty: 'contractor', requiresNote: true },
  { value: 'missing_materials', label: 'Missing material / logistics', defaultSystemic: false, lockSystemic: false, responsibleParty: 'contractor', requiresNote: true },
  { value: 'incorrect_grade', label: 'Incorrect grade', defaultSystemic: false, lockSystemic: false, responsibleParty: 'contractor', requiresNote: true },
  { value: 'crew_shortage', label: 'Crew shortage', defaultSystemic: false, lockSystemic: false, responsibleParty: 'contractor', requiresNote: true },
  { value: 'illness_personal', label: 'Illness / personal reason', defaultSystemic: false, lockSystemic: false, responsibleParty: 'contractor', requiresNote: false },
  { value: 'coordination_delay', label: 'Coordination delay', defaultSystemic: false, lockSystemic: false, responsibleParty: 'contractor', requiresNote: true },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEUTRAL (Act of God) - Weather, force majeure, safety
  // ═══════════════════════════════════════════════════════════════════════════
  { value: 'extreme_weather', label: 'Extreme weather', defaultSystemic: true, lockSystemic: true, responsibleParty: 'neutral', requiresNote: false },
  { value: 'force_majeure', label: 'Force majeure', defaultSystemic: true, lockSystemic: true, responsibleParty: 'neutral', requiresNote: false },
  { value: 'safety_standdown', label: 'Safety stand-down', defaultSystemic: true, lockSystemic: false, responsibleParty: 'neutral', requiresNote: false },

  // ═══════════════════════════════════════════════════════════════════════════
  // UNKNOWN - Custom/other (requires note to explain)
  // ═══════════════════════════════════════════════════════════════════════════
  { value: 'other', label: 'Other', defaultSystemic: false, lockSystemic: false, responsibleParty: 'unknown', requiresNote: true }
]

// Responsible party display configuration for Accountability Constraint
export const responsiblePartyConfig = {
  owner: { label: 'Owner', color: '#1976d2', bgColor: '#e3f2fd', icon: '🏛️' },
  contractor: { label: 'Contractor', color: '#dc3545', bgColor: '#f8d7da', icon: '🔧' },
  neutral: { label: 'Neutral', color: '#6c757d', bgColor: '#e9ecef', icon: '⚖️' },
  unknown: { label: 'Unknown', color: '#856404', bgColor: '#fff3cd', icon: '❓' }
}

// Efficiency Audit - Default hourly burn rates
export const defaultRates = { labour: 85, equipment: 150 }

// Labour classifications — merged from rate sheet + CX2-FC contract (127 classifications)
export const labourClassifications = [
  'Aboriginal Coordinator',
  'Appren./Oiler (Night Shift)',
  'Apprentice Oper/Oiler',
  'Articulated Dump Driver',
  'Assistant Project Engineer',
  'Assistant Superintendent',
  'Backend Welder on Auto Weld Spread (QI Applies)',
  'Backend Welder on Stick Weld Spread (QI Applies)',
  'Bending Engineer (Foreman)',
  'Bending Machine Operators',
  'Bombardier/Nodwell Driver',
  'Boom Operator - Shack, Prep/Trans. Machine',
  'Buffer/Grinder Helper',
  'Bus/Crewcab Driver',
  'Camp Manager',
  'Construction Manager',
  'Contract Administrator',
  'Cost Planner/Scheduler',
  'Driller/Conc. Saw/Powderman',
  'Dump Truck Driver 12-23 Yds',
  'Dump Truck Driver 8-11 Yds',
  'Dump Truck Driver < 8 YDS',
  'Electrical Foreman',
  'EMT',
  'End Prep/Transition Fitter on Auto Weld Spread (QI Applies)',
  'End Prep/Transition Fitter on Stick Weld Spread (QI Applies)',
  'Engineering Manager',
  'Environmental Coordinator',
  'Equipment Clerk',
  'Equipment Manager',
  'Farm Tractor Driver (For Transport)',
  'Field Engineer',
  'Flat Deck < 5 Ton',
  'Flat Deck > 5 Ton',
  'Flat Deck Winch < 5 Ton',
  'Flat Deck Winch > 5 Ton',
  'Forklift Driver (Warehouse)',
  'Front-End/Tie-In Welder on Auto Weld Spread (QI Applies)',
  'Front-End/Tie-In Welder on Stick Weld Spread (QI Applies)',
  'Fuel Truck Driver\'s Helper',
  'Fuel/Water Truck Driver',
  'General Foreman',
  'General Labourer',
  'Graded Helper',
  'Graded Tech. Helper',
  'Ground Disturbance Supervisor',
  'Highboy Driver',
  'Interm. Oper 2 (Night Shift)',
  'Intermediate Oper',
  'Labourer Job Steward',
  'Landman',
  'Lowbed/Multipurpose Driver',
  'Mandrel Operator on Auto Weld Spread (QI Applies)',
  'Mandrel Operator on Stick Weld Spread (QI Applies)',
  'Master Mechanic',
  'Materials Coordinator',
  'Measureman',
  'Mech./Service/Utility Weld Helper',
  'Mech/Serv/Weld Help (Night Shift)',
  'Mechanic/Serviceman/Lubeman',
  'Mechanic/Serviceman/Lubeman (Night Shift)',
  'Night Watchman/Security',
  'Non-Welder Journeyman/Fitter on Auto Weld Spread (QI Applies)',
  'Non-Welder Journeyman/Fitter on Stick Weld Spread (QI Applies)',
  'Office Clerk',
  'Office Clerk (Local Hire)',
  'Office Manager',
  'Operator Job Steward',
  'Paramedic',
  'Paymaster',
  'Picker Truck Driver < 12 Ton',
  'Picker Truck Driver > 12 Ton',
  'Pickup/Pilot Car Driver',
  'Pneumatic Tools/Nozzleman',
  'Powersaw Operator',
  'Preheater Helper',
  'Princ. Oper 1 (Night Shift)',
  'Princ. Oper 2 (Night Shift)',
  'Principal Oper 1',
  'Principal Oper 2',
  'Project Accountant',
  'Project Administrator',
  'Project Engineer',
  'Project Planner',
  'Purchasing Agent',
  'Quality Control Supervisor',
  'Quality Control Technician',
  'Repair Welder Stick or Auto Weld Spread (QI Applies)',
  'Safety Coordinator',
  'Semi-Trailer (Fuel/Water) Driver',
  'Senior Safety Coordinator',
  'Set-In/Set Up Drivers (Bend & Weld)',
  'Skid/Bed Truck Driver',
  'Spacer/Stabber on Auto Weld Spread (QI Applies)',
  'Spacer/Stabber on Stick Weld Spread (QI Applies)',
  'Spec Labour (Carpenter, Etc.)',
  'Specialty Princ. Oper',
  'Specialty Princ. Oper. (Night Shift)',
  'STRAW - FITTER ON AUTO WELD SPREAD',
  'STRAW - FITTER ON STICK WELD SPREAD',
  'STRAW - LABOURER',
  'STRAW - OPERATOR',
  'Stringing Tractor Drivers',
  'Stringing Truck Driver',
  'Sub Foreman',
  'Superintendent',
  'Swamper/Drill Helper',
  'Teamster - Steward',
  'Time Keeper',
  'Transportation Clerk',
  'Transportation Coordinator',
  'UA Bore/HDD Support Foreman',
  'UA Job Steward on Auto Weld Spread (QI Applies)',
  'UA Job Steward on Stick Weld Spread (QI Applies)',
  'UA Lower-In Foreman',
  'UA Pipe Foreman',
  'UA Test Foreman',
  'UA Tie-In Foreman',
  'UA Welder Foreman',
  'Utility Foreman',
  'Utility Welder',
  'Utility Welder (Night Shift)',
  'Warehouseman 1',
  'Warehouseman 2',
  'Welder Helper',
  'Welding Technician Foreman',
  'Welding Technician on Stick or Auto Weld Spread (QI Applies)'
]

// Equipment types — merged from rate sheet + CX2-FC contract (334 types)
export const equipmentTypes = [
  '1 Ton Sandblast Unit',
  '100Kw Generator',
  '2 Ton Sandblast Unit',
  '2" Water Pump',
  '42" Mandrel',
  '5 Ton Sandblast Unit',
  '5 Ton Stake Truck',
  '60\' Portable Bridge',
  'Air Booster',
  'Air Compressor - 1000 CFM',
  'Air Compressor - 1000 CFM x 350 PSI',
  'Air Compressor - 1200 CFM',
  'Air Compressor - 1250 CFM x 350 PSI (Oil Free)',
  'Air Compressor - 1300 CFM x 365 PSI',
  'Air Compressor - 150 to 185 CFM',
  'Air Compressor - 1500 CFM',
  'Air Compressor - 200 to 250 CFM',
  'Air Compressor - 300 to 400 CFM',
  'Air Compressor - 780 to 850 CFM',
  'Air Compressor - 900 CFM',
  'Air Compressor - 900 CFM x 350 PSI',
  'Air Dryer - 2600 CFM x 350 PSI',
  'Air Dryer -To Handle 2600 CFM x 350 PSI',
  'Almand Heater',
  'Aqua Dams 2.2M x 30M',
  'ARGO ATV Side By Side',
  'Articulated Dump Truck - 30 Ton',
  'Articulated Dump Truck - 35 Ton',
  'Articulated Dump Truck - 40 Ton',
  'Athey Wagon',
  'Athey Wagon - 30 Tonne',
  'ATV/Gator',
  'Automatic Welding Tractor',
  'Automobile',
  'Backfill Blade Attach. for Cat 330-345 Hoes',
  'Backhoe - Cat 315 (or equivalent)',
  'Backhoe - Cat 320 (or equivalent)',
  'Backhoe - Cat 322 (or equivalent)',
  'Backhoe - Cat 324 (or equivalent)',
  'Backhoe - Cat 325 (or equivalent)',
  'Backhoe - Cat 329 (or equivalent)',
  'Backhoe - Cat 330 (or equivalent)',
  'Backhoe - Cat 330 c/w Thumb',
  'Backhoe - Cat 330 Longstick',
  'Backhoe - Cat 336 (or equivalent)',
  'Backhoe - Cat 345 (or equivalent)',
  'Backhoe - Cat 345 c/w Thumb',
  'Backhoe - Cat 345 Longstick',
  'Backhoe - Cat 365',
  'Backhoe - Cat 374',
  'Backhoe - Hitachi 870LC',
  'Backhoe - Link Belt 1400 Long Stick',
  'Bending Machine 16-30"',
  'Bending Machine 20-36"',
  'Bending Machine 32-42"',
  'Bending Machine 36-48"',
  'Boat & Motor',
  'Boat & Motor (No Trailer)',
  'Booster for Lowboy',
  'Bus',
  'Cabbed Argo Side by Side c/w Trailer',
  'Cable Clam/Board - LS 98 Linkbelt',
  'Coating Pre-Heat Generator & Coil',
  'Coating Truck - 5 Ton',
  'Coating Tuck - 5 Ton',
  'Compressor Hoses - 2" x 50\'',
  'Compressor Trailer',
  'Cradle Bore Machine & Auger',
  'CRC Auto Weld Pack',
  'Crewcab - 1 Ton',
  'Crewcab - 3/4 Ton',
  'D5 LPG C/W Tyalta Roto Slasher',
  'Diesel Generator 185Kw',
  'Diesel Heater 185Kw',
  'Diesel Heater 390,000 BTU',
  'Ditch Witch 1330 & Trailer',
  'Ditching Wheel - BG 930',
  'Ditching Wheel - Jetco 7254',
  'Ditching Wheel - McKenzie 710',
  'Ditching Wheel - TA 77',
  'Ditching Wheel - Trenco 1360',
  'Ditching Wheel Trailer',
  'Dozer - Bush Rake Attachment',
  'Dozer - Cat U Blade',
  'Dozer - D10 (or equivalent)',
  'Dozer - D4 (or equivalent)',
  'Dozer - D4 LGP (or equivalent)',
  'Dozer - D4LGP (or equivalent)',
  'Dozer - D5 (or equivalent)',
  'Dozer - D5 LGP (or equivalent)',
  'Dozer - D6H (or equivalent)',
  'Dozer - D6N (or equivalent)',
  'Dozer - D6N LGP (or equivalent)',
  'Dozer - D6R (or equivalent)',
  'Dozer - D6R LGP (or equivalent)',
  'Dozer - D6T (or equivalent)',
  'Dozer - D6T LGP (or equivalent)',
  'Dozer - D7E (or equivalent)',
  'Dozer - D7R (or equivalent)',
  'Dozer - D7R LGP (or equivalent)',
  'Dozer - D8T (or equivalent)',
  'Dozer - D9T (or equivalent)',
  'Dual 100 Kw Generator',
  'Dual 60 Kw Generator',
  'Enviro-Pads',
  'Farm Implement - Brush Hog',
  'Farm Implement - Chisel Plow',
  'Farm Implement - Cultivator',
  'Farm Implement - Disc',
  'Farm Implement - Mower',
  'Farm Implement - Post Pounder',
  'Farm Implement - Rock Picker',
  'Farm Implement - Rock Rake',
  'Farm Implement - Subsoiler',
  'Farm Tractor - Challenger 75',
  'Farm Tractor - Challenger MT844',
  'Farm Tractor - Challenger MT845',
  'Farm Tractor - Wheel < 100 HP',
  'Farm Tractor - Wheel > 100 HP',
  'Fence Truck - 1 Ton',
  'Fill Pipe - 8" (2.5Km)',
  'Fill Pipe - Load of 660 m',
  'Flatdeck - 1 Ton',
  'Flatdeck - 2 Ton',
  'Flatdeck - 3 Ton',
  'Flatdeck - 5 Ton',
  'Flatdeck - 8 Ton',
  'Flatdeck Bottle Truck',
  'Floc Water Tank',
  'Forklift - Zoom Boom',
  'Frozen Topsoil Cutter (Attachment)',
  'Fuel Tank',
  'Fuel Tank - 2500 Litre Skid',
  'Fuel Truck - Single Axle',
  'Fuel Truck - Tandem',
  'Gas Powered Auger',
  'Generator - 10 kW',
  'Generator - 100 kW',
  'Generator - 20 kW',
  'Generator - 2500 Watt',
  'Generator - 30 kW',
  'Generator - 3000 Watt',
  'Generator - 3500 Watt',
  'Generator - 5 kW',
  'Generator - 5000 Watt',
  'Generator - 60 kW',
  'Generator - 6500 Watt',
  'Generator Pump & Light 15-20kW',
  'Generator Pump & Light 8-10kW',
  'Generator Pump Pkg 35kW',
  'Generator Pump Pkg 75kW',
  'Grader - Cat G12',
  'Grader - Cat G14',
  'Grader - Cat G140',
  'Grader - Cat G16',
  'Grader - Cat G160',
  'Highboy Trailer',
  'Hoe - Bucket Rake Attachment',
  'Hoe - Chuck Blade Attachment',
  'Hoe Attachment - Snow Blower',
  'Hoe Pac Attachment for Cat 324-336 Hoes',
  'Hoe Ram Attachment for Cat 330/345',
  'Hydraulic Clam - Cat 330 Longstick',
  'Hydraulic Road Sweeper',
  'Hydrovac Truck',
  'Induction Coil',
  'Jeep for Lowboy',
  'Light Tower - 20 kW',
  'Light Tower - 6 kW',
  'Lincoln Welder',
  'Loader - Cat 930',
  'Loader - Cat 950',
  'Loader - Cat 966',
  'Loader - Cat 980',
  'Loader - Cat 988',
  'Loader - Cat IT 28',
  'Loader - Cat IT 38',
  'Loader - Cat IT 62',
  'Loader Attachment - Pipe/Pole Grapple',
  'Lowboy Trailer',
  'Lowboy Trailer (40 Wheeler)',
  'Lowboy Trailer (48 Wheeler)',
  'Lowboy/Highboy Truck Tractor',
  'Mainline Sandblast Unit - Dual',
  'Mandrel',
  'Mechanics Rig',
  'Mulcher',
  'Nodwell - 6 Man & Mat. Size',
  'Non-Articulated Dump Truck',
  'Office Trailer',
  'Ozzie Padder',
  'Packer - Crowfoot',
  'Packer- Crowfoot',
  'Panther T8 All Terrain Dump Vehicle',
  'Picker - 45 Ton',
  'Picker Truck - 10 Ton',
  'Picker Truck - 12 Ton',
  'Picker Truck - 15 Ton',
  'Picker Truck - 17 Ton',
  'Picker Truck - 25 Ton',
  'Picker Truck - 30 Ton',
  'Picker Truck - 8 Ton',
  'Picker/Hiab Truck - 1 Ton',
  'Picker/Hiab Truck - 3 Ton',
  'Pickup - 1/2 Ton',
  'Pickup - 3/4 Ton',
  'Pigging Head (10")',
  'Pigging Head (16")',
  'Pigging Head (20")',
  'Pigging Head (24")',
  'Pigging Head (30")',
  'Pigging Head (36")',
  'Pigging Head (42")',
  'Pipe Ramming Tool',
  'Pipe Rollers (80,000lb)',
  'Pipeline Roller Cradles (Each)',
  'Plate Tamper - Walk Behind (1000Lb)',
  'Plate Tamper- Walk Behind (1000Lb)',
  'Pole Trailer',
  'Port Heater BT400-460H',
  'Portable Bridge 60"',
  'Portable Heater BT400-460H',
  'Portable Plug In Panel with Generator',
  'Portable Shop',
  'Portable Shop Heater - Allmand',
  'Power Dozer',
  'Power Unit for Induction Coil',
  'Powersaw',
  'Pressure Washer - Landa MCV4',
  'Propane Station Unit',
  'Propane/Preheat Truck',
  'Rake - Hoe Attachment',
  'Rig Mat - 8\' x 20\'',
  'Rig Mat - 8\' x 30\'',
  'Rig Mat - 8\' x 40\'',
  'Ripper Shank for Cat 345 Backhoe',
  'Rock Splitter',
  'Roller Packer 90" Contour',
  'Rolli Cradles & Spreader Bars',
  'Rubber Tired Hoe',
  'Rubber Tired Hoe - Cat 420/430',
  'Scissor Neck Trailer',
  'Screw Anchor Attachment (Single) to Hoe',
  'Self Centering Pallet Forks',
  'Service Truck',
  'Shamrock Backhoe 320',
  'Sheeps Foot Drum Packer',
  'Shoring Box',
  'Sideboom - Cat 561/PL61',
  'Sideboom - Cat 571',
  'Sideboom - Cat 572',
  'Sideboom - Cat 572R',
  'Sideboom - Cat 583',
  'Sideboom - Cat 583T',
  'Sideboom - Cat 587T',
  'Sideboom - Cat 594',
  'Sideboom - Liebherr RL64',
  'Silt Fence Installation Attachment',
  'Skagit',
  'Skid Mounted - Mainline Coating Unit',
  'Skid Sloop',
  'Skid Steer',
  'Skid Steer C/W Auger Attachment',
  'Skid Truck Tractor',
  'Sled',
  'Slop Tanks',
  'Sno Cat',
  'Sno Cat - Piston Bully PF 300',
  'Snow Making Equipment',
  'Snow Vehicles (Snowmobiles)',
  'Snowmobile',
  'Snowplow/Sander Truck',
  'Solar Road Sign Boards',
  'Spray Coating Truck',
  'Stepdeck Trailer',
  'Storage Containers',
  'Storage Trailer/Van',
  'Stringing Truck Tractor',
  'Strong Box Snow Pusher',
  'Suburban',
  'Surge Tank',
  'SUV - Expedition/ Lexus/ Denali/ Yukon/ Navigator',
  'Swamp Mats (Set of 4)',
  'Swenson Spreader',
  'Tag-A-Long Trailer (10 Ton)',
  'Tag-A-Long Trailer (20 Ton)',
  'Tag-A-Long Trailer (6 Ton)',
  'Tag-A-Long Trailer (Farm Wagon)',
  'Tag-A-Long Trailer (Utility)',
  'Tesmac Ditcher',
  'Test - 1 " Squeeze Pump',
  'Test - 1" Squeeze Pump',
  'Test - 3" Squeeze Pump',
  'Test - Boiler',
  'Test - Fill Pump 10 x 8',
  'Test - Fill Pump 6 x 6',
  'Test - Fill Pump 8 x 6',
  'Test - Honda Squeeze Pump',
  'Test Trailer & Instrumentation',
  'Texas Winch Truck',
  'Track Bore Machine & Auger',
  'Track Morooka',
  'Trailer - B - Train',
  'Trailer - B-Train',
  'Transition Machine (Includes Power Unit)',
  'Transition Machine (Without Power Unit)',
  'Trombone Trailer',
  'Utility Welder Rig',
  'Viking Power Dozer',
  'Wacker 1301 - Ground Heater and Generator',
  'Wacker, 1301 - Ground Heater and Generator',
  'Warehouse Trailer/Van',
  'Warehouse Trailer/Van Diesel Heated Storage',
  'Wash Unit - Steam, Water Truck',
  'Washroom Trailer',
  'Water Canon',
  'Water Pump - 10" Electric',
  'Water Pump - 2"',
  'Water Pump - 3"',
  'Water Pump - 4"',
  'Water Pump - 6"',
  'Water Pump - 8"',
  'Water Tank for Test',
  'Water Tank Trailer',
  'Water Truck',
  'Weld - Auto Repair Shack',
  'Weld - Buffing Tractor (ATV Style)',
  'Weld - Internal Repair Unit',
  'Weld - Quad Welder/Tack Rig',
  'Weld - Sleigh',
  'Weld - Weld Platform (Attachment)',
  'Weld - Welding Shack',
  'Welding Machine',
  'Welding Rig'
]

// Create empty activity block
export function createEmptyActivity() {
  return {
    id: Date.now() + Math.random(),
    activityType: '',
    contractor: '',
    foreman: '',
    ticketNumber: '',
    startKP: '',
    endKP: '',
    metersToday: '',
    metersPrevious: '',
    metersToDate: '',
    workDescription: '',
    labourEntries: [],
    equipmentEntries: [],
    qualityData: {},
    workPhotos: [],
    timeLostReason: '',
    timeLostHours: '',
    timeLostDetails: ''
  }
}
