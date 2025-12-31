// projectConfig.js - FortisBC EGP Project Configuration
// Eagle Mountain – Woodfibre Gas Pipeline
// Easily switch between projects by changing this file

export const PROJECT_CONFIG = {
  // Project Identity
  name: 'FortisBC EGP Project',
  fullName: 'Eagle Mountain – Woodfibre Gas Pipeline',
  client: 'FortisBC',
  contractor: '', // Your company name
  projectNumber: 'EGP-2024',
  
  // Pipeline Specifications
  specs: {
    totalLength: 56, // km
    mainlineLength: 47, // km
    tunnelLength: 9, // km
    pipeDiameter: 24, // inches (NPS 24)
    pipeGrade: 'X70',
    maxOperatingPressure: 9930, // kPa
    rowWidth: 18, // metres
  },
  
  // Project Budget & Schedule
  budget: {
    totalBudget: 400000000, // $400M
    contingency: 0.15, // 15%
    labourRate: 95, // $/hr average
    equipmentRate: 200, // $/hr average
  },
  
  schedule: {
    startDate: '2024-01-15',
    targetCompletion: '2025-09-30',
    peakWorkforce: 600,
  },
  
  // Production Targets
  targets: {
    weldingMetresPerDay: { min: 400, max: 600, target: 500 },
    clearingMetresPerDay: { min: 800, max: 1200, target: 1000 },
    gradingMetresPerDay: { min: 600, max: 900, target: 750 },
  },
  
  // Map Configuration
  map: {
    defaultCenter: [49.50, -123.00], // Squamish area
    defaultZoom: 10,
    startPoint: { lat: 49.2838, lon: -122.7932, name: 'Coquitlam Station' },
    endPoint: { lat: 49.6750, lon: -123.2550, name: 'Woodfibre LNG' },
  },
  
  // Spreads / Segments
  spreads: [
    { id: 'EGP Mainline', name: 'Mainline Segment', startKP: '0+000', endKP: '47+000' },
    { id: 'EGP Tunnel', name: 'Tunnel Segment', startKP: '47+000', endKP: '56+000' },
    { id: 'EGP Crossings', name: 'Special Crossings', startKP: '0+000', endKP: '56+000' },
    { id: 'EGP Facilities', name: 'Valve Stations & Facilities', startKP: '0+000', endKP: '56+000' },
  ],
  
  // Environmental & Regulatory Presets
  environmental: {
    sensitiveAreas: [
      'Coastal Tailed Frog habitat (KP 15-25)',
      'Indian River salmon spawning area (KP 18-20)',
      'Mamquam River riparian zone (KP 34-36)',
      'Old growth forest buffer (KP 28-32)',
    ],
    fishWindows: {
      salmonSpawning: { start: 'Aug 15', end: 'Nov 15', restriction: 'No instream work' },
      cohoRearing: { start: 'Mar 1', end: 'Jun 15', restriction: 'Reduced activity' },
    },
    permits: [
      'BC Environmental Assessment Certificate',
      'Federal Impact Assessment Act Decision',
      'Water Sustainability Act Section 11',
      'Heritage Conservation Act Section 12.4',
    ],
  },
  
  // Common Comments Presets for Inspector Report
  commentPresets: {
    environmental: [
      'Environmental monitor on site. No wildlife encounters.',
      'Sediment and erosion controls inspected - effective.',
      'Coastal Tailed Frog survey completed - no observations.',
      'Fish salvage completed prior to dewatering.',
      'Noise monitoring within permitted levels.',
      'Dust suppression active on access roads.',
    ],
    safety: [
      'Tailgate safety meeting held - all hands attended.',
      'JSA reviewed for lifting operations.',
      'Confined space entry permit in place for tunnel work.',
      'Stop work authority exercised - corrected and resumed.',
      'Near miss reported and documented.',
      'Emergency response drill conducted.',
    ],
    quality: [
      'AUT inspection passed - no reportable indications.',
      'Weld repair completed and re-inspected.',
      'Holiday detection completed - coating acceptable.',
      'Alignment survey confirmed within tolerance.',
      'Material traceability verified.',
      'NDE reports filed.',
    ],
    weather: [
      'Operations suspended due to heavy rain.',
      'Reduced visibility - flagging in place.',
      'Wind restrictions on crane operations.',
      'Frozen ground conditions - modified procedures.',
      'Heat stress protocols in effect.',
    ],
    geohazards: [
      'Steep slope monitoring in place.',
      'Rock fall protection installed.',
      'Groundwater encountered - dewatering active.',
      'Unstable soil conditions - engineering review requested.',
      'Blast monitoring for nearby structures.',
    ],
  },
  
  // Key Milestones
  milestones: [
    { name: 'Construction Start', date: '2024-01-15', kp: '0+000' },
    { name: 'Tunnel Breakthrough', date: '2025-03-01', kp: '56+000' },
    { name: 'Mainline Welding Complete', date: '2024-10-15', kp: '47+000' },
    { name: 'Hydrotest Complete', date: '2025-07-15', kp: '56+000' },
    { name: 'In-Service', date: '2025-09-30', kp: '56+000' },
  ],
}

// Export individual configs for easy importing
export const PROJECT_NAME = PROJECT_CONFIG.name
export const PROJECT_SPECS = PROJECT_CONFIG.specs
export const PROJECT_BUDGET = PROJECT_CONFIG.budget
export const PROJECT_SPREADS = PROJECT_CONFIG.spreads
export const COMMENT_PRESETS = PROJECT_CONFIG.commentPresets
export const ENVIRONMENTAL_AREAS = PROJECT_CONFIG.environmental.sensitiveAreas

export default PROJECT_CONFIG
