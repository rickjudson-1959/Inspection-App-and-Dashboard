// ============================================================================
// AUDIT LOGGER V3 - Precision-Based Smart Diffing
// Date: January 15, 2026
// Purpose: Field-level audit logging with configurable precision rounding
// ============================================================================

import { supabase } from './supabase'

// ============================================================================
// PRECISION MAP
// Defines decimal places for different field types to prevent false-positive
// audit entries from floating point comparison issues
// ============================================================================
export const PRECISION_MAP = {
  // GPS coordinates - 6 decimal places (~0.1m accuracy)
  latitude: 6,
  longitude: 6,
  lat: 6,
  lon: 6,
  lng: 6,
  gps: 6,
  coordinate: 6,
  
  // KP/Station - 3 decimal places (1m accuracy)
  kp: 3,
  station: 3,
  chainage: 3,
  
  // Lengths, depths, distances - 2 decimal places
  length: 2,
  depth: 2,
  distance: 2,
  height: 2,
  width: 2,
  offset: 2,
  elevation: 2,
  cover: 2,
  meters: 2,
  lm: 2,

  // Trench/Ditch specific - 2 decimal places
  trench_width: 2,
  trench_depth: 2,
  depth_of_cover: 2,
  rock_ditch_meters: 2,
  extra_depth_meters: 2,
  padding_meters: 2,
  pumping_hours: 2,
  groundwater_depth: 2,

  // Filter bag count - 0 decimal places (whole numbers)
  filter_bag_count: 0,

  // Drilling Waste Management (Directive 050) - 2 decimal places
  total_volume_mixed_m3: 2,
  volume_in_storage_m3: 2,
  volume_hauled_m3: 2,
  storage_capacity_m3: 2,
  vac_truck_hours: 2,
  mud_weight: 1,
  viscosity: 0,
  fluid_loss: 1,
  grout_volume: 2,
  grout_pressure: 1,

  // Conventional Bore - Annular Space & Grouting
  calculated_annulus_volume: 4,
  actual_grout_pumped_m3: 4,
  grout_variance_percent: 1,
  winch_tension: 0,
  total_water_used_m3: 2,
  mud_volume_m3: 2,
  start_pitch_percent: 1,
  exit_pitch_percent: 1,
  casing_diameter_inches: 2,
  carrier_diameter_inches: 2,
  bore_length: 2,

  // Wall thickness - 3 decimal places (critical for pipe specs)
  wall_thickness: 3,
  wt: 3,
  thickness: 3,
  
  // Diameters - 1 decimal place
  diameter: 1,
  od: 1,
  id: 1,
  nps: 1,
  
  // Film density (RT) - 2 decimal places
  density: 2,
  film_density: 2,
  
  // Geometric unsharpness - 4 decimal places (precision critical)
  geometric_unsharpness: 4,
  ug: 4,
  unsharpness: 4,
  
  // Angles - 1 decimal place
  angle: 1,
  bend_angle: 1,
  probe_angle: 1,
  ovality: 1,
  
  // Pressures - 1 decimal place
  pressure: 1,
  kpa: 1,
  psi: 1,
  
  // Temperatures - 1 decimal place
  temp: 1,
  temperature: 1,
  
  // Speeds - 2 decimal places
  speed: 2,
  crawler_speed: 2,
  
  // Percentages - 1 decimal place
  percent: 1,
  rate: 1,
  sensitivity: 1,
  
  // Volumes - 1 decimal place
  volume: 1,
  litres: 1,
  liters: 1,
  
  // Weights - 2 decimal places
  weight: 2,
  mass: 2,
  
  // Time durations - 0 decimal places (whole minutes/hours)
  hours: 0,
  minutes: 0,
  duration: 0,
  
  // Default for unknown numeric fields
  default: 2
}

// ============================================================================
// REGULATORY CATEGORY PATTERNS
// Auto-classify fields for regulatory compliance tracking
// ============================================================================
const REGULATORY_PATTERNS = {
  integrity: [
    'weld', 'pressure', 'wall_thickness', 'wt', 'nde', 'ndt', 'rt', 'ut',
    'defect', 'repair', 'cutout', 'density', 'sensitivity', 'technique',
    'calibration', 'hydro', 'test'
  ],
  environmental: [
    'wildlife', 'erosion', 'topsoil', 'subsoil', 'sediment', 'water',
    'species', 'nesting', 'habitat', 'contamination', 'spill', 'drainage',
    'drilling_waste', 'mud', 'disposal', 'manifest', 'salinity', 'toxicity',
    'metals', 'bentonite', 'polymer', 'additive', 'landfill', 'landspray'
  ],
  soil_handling: [
    'topsoil', 'subsoil', 'stockpile', 'segregation', 'stripping',
    'salvage', 'replacement', 'compaction'
  ],
  indigenous_social: [
    'indigenous', 'first_nation', 'cultural', 'heritage', 'artifact',
    'participation', 'employment', 'community'
  ],
  archaeological: [
    'archaeological', 'artifact', 'heritage', 'cultural', 'historic',
    'burial', 'discovery'
  ]
}

// Critical fields that should always be flagged
const CRITICAL_FIELDS = [
  'interpretation_result',
  'acceptance_status',
  'technique_shot_approved',
  'defect',
  'repair',
  'cutout',
  'wall_thickness',
  'pressure',
  'test_result',
  'visual_check',
  'nde_status'
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the precision (decimal places) for a given field name
 */
export function getPrecision(fieldName) {
  if (!fieldName) return PRECISION_MAP.default
  
  const lowerField = fieldName.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  
  // Check for exact match first
  if (PRECISION_MAP[lowerField] !== undefined) {
    return PRECISION_MAP[lowerField]
  }
  
  // Check for partial match
  for (const [key, precision] of Object.entries(PRECISION_MAP)) {
    if (key !== 'default' && lowerField.includes(key)) {
      return precision
    }
  }
  
  return PRECISION_MAP.default
}

/**
 * Round a value to the appropriate precision for a field
 */
export function roundToPrecision(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return value
  }
  
  const numValue = parseFloat(value)
  if (isNaN(numValue)) {
    return value // Return original if not a number
  }
  
  const precision = getPrecision(fieldName)
  const multiplier = Math.pow(10, precision)
  return Math.round(numValue * multiplier) / multiplier
}

/**
 * Compare two values using precision-aware comparison
 * Returns true if values are different (should log audit)
 */
export function valuesAreDifferent(oldVal, newVal, fieldName) {
  // Handle null/undefined/empty string cases
  const oldEmpty = oldVal === null || oldVal === undefined || oldVal === ''
  const newEmpty = newVal === null || newVal === undefined || newVal === ''
  
  // Both empty = no change
  if (oldEmpty && newEmpty) return false
  
  // One empty, one not = change
  if (oldEmpty !== newEmpty) return true
  
  // For booleans
  if (typeof oldVal === 'boolean' || typeof newVal === 'boolean') {
    return Boolean(oldVal) !== Boolean(newVal)
  }
  
  // For numeric values, apply precision rounding
  const oldNum = parseFloat(oldVal)
  const newNum = parseFloat(newVal)
  
  if (!isNaN(oldNum) && !isNaN(newNum)) {
    const roundedOld = roundToPrecision(oldNum, fieldName)
    const roundedNew = roundToPrecision(newNum, fieldName)
    return roundedOld !== roundedNew
  }
  
  // For strings, trim and compare
  return String(oldVal).trim() !== String(newVal).trim()
}

/**
 * Determine the regulatory category for a field
 */
export function getRegulatoryCategory(fieldName, section) {
  const searchStr = `${fieldName} ${section || ''}`.toLowerCase()
  
  for (const [category, patterns] of Object.entries(REGULATORY_PATTERNS)) {
    if (patterns.some(pattern => searchStr.includes(pattern))) {
      return category
    }
  }
  
  return 'general'
}

/**
 * Determine if a field change is critical
 */
export function isCriticalField(fieldName) {
  const lowerField = fieldName.toLowerCase()
  return CRITICAL_FIELDS.some(critical => lowerField.includes(critical))
}

/**
 * Format a value for display in audit log
 */
export function formatValueForAudit(value, fieldName) {
  if (value === null || value === undefined) return null
  if (value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  
  // Round numeric values for display
  const numValue = parseFloat(value)
  if (!isNaN(numValue)) {
    return String(roundToPrecision(numValue, fieldName))
  }
  
  return String(value)
}

// ============================================================================
// MAIN AUDIT LOGGER
// ============================================================================

/**
 * Log a field change to the audit trail
 */
export async function logFieldChange({
  reportId,
  entityType,
  entityId,
  section,
  fieldName,
  oldValue,
  newValue,
  kpStart,
  kpEnd,
  weldNumber,
  jointNumber,
  metadata = {},
  organizationId = null
}) {
  // Skip if no reportId (unsaved report)
  if (!reportId) {
    console.debug('Audit skip: No reportId')
    return null
  }
  
  // Skip if values aren't actually different (precision-aware)
  if (!valuesAreDifferent(oldValue, newValue, fieldName)) {
    console.debug(`Audit skip: No change for ${fieldName}`)
    return null
  }
  
  try {
    const auditEntry = {
      report_id: reportId,
      entity_type: entityType,
      entity_id: entityId,
      section: section,
      field_name: fieldName,
      old_value: formatValueForAudit(oldValue, fieldName),
      new_value: formatValueForAudit(newValue, fieldName),
      action_type: 'field_change',
      change_type: 'edit',
      kp_start: kpStart,
      kp_end: kpEnd,
      weld_number: weldNumber,
      joint_number: jointNumber,
      regulatory_category: getRegulatoryCategory(fieldName, section),
      is_critical: isCriticalField(fieldName),
      metadata: metadata,
      changed_at: new Date().toISOString(),
      organization_id: organizationId
    }

    const { data, error } = await supabase
      .from('report_audit_log')
      .insert(auditEntry)
      .select()
      .single()
    
    if (error) throw error
    
    console.debug(`Audit logged: ${fieldName} changed from "${oldValue}" to "${newValue}"`)
    return data
    
  } catch (err) {
    console.error('Audit log error:', err)
    return null
  }
}

/**
 * Log an entry addition (e.g., new weld, new reading)
 */
export async function logEntryAdd({
  reportId,
  entityType,
  entityId,
  section,
  entryType,
  entryLabel,
  metadata = {},
  organizationId = null
}) {
  if (!reportId) return null

  try {
    const auditEntry = {
      report_id: reportId,
      entity_type: entityType,
      entity_id: entityId,
      section: section,
      field_name: `${entryType} Added`,
      old_value: null,
      new_value: entryLabel,
      action_type: 'entry_add',
      change_type: 'create',
      regulatory_category: getRegulatoryCategory(entryType, section),
      is_critical: isCriticalField(entryType),
      metadata: metadata,
      changed_at: new Date().toISOString(),
      organization_id: organizationId
    }

    const { data, error } = await supabase
      .from('report_audit_log')
      .insert(auditEntry)
      .select()
      .single()
    
    if (error) throw error
    return data
    
  } catch (err) {
    console.error('Audit log error:', err)
    return null
  }
}

/**
 * Log an entry deletion
 */
export async function logEntryDelete({
  reportId,
  entityType,
  entityId,
  section,
  entryType,
  entryLabel,
  metadata = {},
  organizationId = null
}) {
  if (!reportId) return null

  try {
    const auditEntry = {
      report_id: reportId,
      entity_type: entityType,
      entity_id: entityId,
      section: section,
      field_name: `${entryType} Deleted`,
      old_value: entryLabel,
      new_value: null,
      action_type: 'entry_delete',
      change_type: 'delete',
      regulatory_category: getRegulatoryCategory(entryType, section),
      is_critical: true, // Deletions are always critical
      metadata: metadata,
      changed_at: new Date().toISOString(),
      organization_id: organizationId
    }

    const { data, error } = await supabase
      .from('report_audit_log')
      .insert(auditEntry)
      .select()
      .single()
    
    if (error) throw error
    return data
    
  } catch (err) {
    console.error('Audit log error:', err)
    return null
  }
}

/**
 * Log a status change (e.g., approval, rejection)
 */
export async function logStatusChange({
  reportId,
  entityType,
  entityId,
  oldStatus,
  newStatus,
  reason,
  metadata = {},
  organizationId = null
}) {
  if (!reportId) return null

  try {
    const auditEntry = {
      report_id: reportId,
      entity_type: entityType,
      entity_id: entityId,
      section: 'Status',
      field_name: 'status',
      old_value: oldStatus,
      new_value: newStatus,
      action_type: 'status_change',
      change_type: 'edit',
      change_reason: reason,
      regulatory_category: 'general',
      is_critical: true,
      metadata: metadata,
      changed_at: new Date().toISOString(),
      organization_id: organizationId
    }

    const { data, error } = await supabase
      .from('report_audit_log')
      .insert(auditEntry)
      .select()
      .single()
    
    if (error) throw error
    return data
    
  } catch (err) {
    console.error('Audit log error:', err)
    return null
  }
}

// ============================================================================
// REACT HOOK FOR COMPONENT-LEVEL AUDIT TRACKING
// ============================================================================

/**
 * Creates audit-aware props for form inputs
 * Usage: <input {...createAuditProps('fieldName', currentValue, 'Section Name')} />
 */
export function createAuditHelpers(config) {
  const {
    reportId,
    entityType,
    entityId,
    originalValuesRef
  } = config
  
  return {
    /**
     * Create onFocus/onBlur props for an input to track changes
     */
    createAuditProps: (fieldName, currentValue, section) => ({
      onFocus: () => {
        if (originalValuesRef.current) {
          originalValuesRef.current[fieldName] = currentValue
        }
      },
      onBlur: async () => {
        const originalValue = originalValuesRef.current?.[fieldName]
        if (valuesAreDifferent(originalValue, currentValue, fieldName)) {
          await logFieldChange({
            reportId,
            entityType,
            entityId,
            section,
            fieldName,
            oldValue: originalValue,
            newValue: currentValue
          })
        }
      }
    }),
    
    /**
     * Log entry field change (for items in arrays)
     */
    logEntryFieldChange: async (entryValuesRef, entryId, fieldName, newValue, displayName, entryLabel) => {
      const key = `${entryId}_${fieldName}`
      const oldValue = entryValuesRef.current?.[key]
      
      if (valuesAreDifferent(oldValue, newValue, fieldName)) {
        await logFieldChange({
          reportId,
          entityType,
          entityId: `${entityId}_${entryId}`,
          section: entityType,
          fieldName: `${displayName || fieldName} (${entryLabel})`,
          oldValue,
          newValue
        })
      }
    },
    
    /**
     * Initialize entry values for tracking
     */
    initializeEntryValue: (entryValuesRef, entryId, fieldName, value) => {
      if (entryValuesRef.current) {
        entryValuesRef.current[`${entryId}_${fieldName}`] = value
      }
    }
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================
/**
 * Convenience wrapper for logging inspector override events.
 * Used by the Mentor Agent's OverrideLogger for dual-write audit trail.
 */
export async function logInspectorOverride({
  reportId,
  entityId,
  fieldName,
  fieldValue,
  thresholdExpected,
  overrideReason,
  alertSeverity,
  alertType,
  blockId,
  organizationId = null
}) {
  try {
    const auditEntry = {
      report_id: reportId || null,
      entity_type: 'mentor_alert',
      entity_id: entityId,
      section: 'mentor_agent',
      field_name: fieldName,
      old_value: formatValueForAudit(thresholdExpected, fieldName),
      new_value: formatValueForAudit(fieldValue, fieldName),
      action_type: 'inspector_override',
      change_type: 'override',
      regulatory_category: getRegulatoryCategory(fieldName, 'mentor_agent'),
      is_critical: alertSeverity === 'critical' || isCriticalField(fieldName),
      metadata: {
        alert_type: alertType,
        alert_severity: alertSeverity,
        override_reason: overrideReason,
        block_id: blockId
      },
      changed_at: new Date().toISOString(),
      organization_id: organizationId
    }

    const { data, error } = await supabase
      .from('report_audit_log')
      .insert(auditEntry)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('Audit log error (inspector override):', err)
    return null
  }
}

export default {
  PRECISION_MAP,
  getPrecision,
  roundToPrecision,
  valuesAreDifferent,
  getRegulatoryCategory,
  isCriticalField,
  formatValueForAudit,
  logFieldChange,
  logEntryAdd,
  logEntryDelete,
  logStatusChange,
  logInspectorOverride,
  createAuditHelpers
}
