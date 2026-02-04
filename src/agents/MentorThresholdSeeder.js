// MentorThresholdSeeder.js - Generates threshold config from knowledge buckets
// Seeds mentor_threshold_config from WPS specs, contract config, and industry defaults

import { supabase } from '../supabase'

// ─────────────────────────────────────────────────────────────
// SEEDER: WPS Material Specs
// Creates thresholds from wps_material_specs table
// ─────────────────────────────────────────────────────────────
async function seedThresholdsFromWPS(orgId) {
  if (!orgId) return []

  const { data: specs, error } = await supabase
    .from('wps_material_specs')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)

  if (error || !specs?.length) {
    console.warn('[ThresholdSeeder] No WPS specs found for org:', orgId)
    return []
  }

  const thresholds = []

  for (const spec of specs) {
    // Preheat minimum temperature from WPS
    if (spec.preheat_min != null) {
      thresholds.push({
        organization_id: orgId,
        activity_type: 'Welding - Mainline',
        field_key: 'preheatTemp',
        min_value: spec.preheat_min,
        max_value: null,
        unit: '°C',
        severity: 'critical',
        alert_title: 'Preheat Below WPS Minimum',
        alert_message: 'Preheat temperature {value}°C is below the WPS minimum of {min}°C. This violates WPS {wps_number}.',
        recommended_action: 'Increase preheat to meet WPS requirements before welding proceeds.',
        reference_document: spec.wps_number || 'WPS Document',
        source_bucket: 'wps_material_specs',
        source_id: spec.id,
        is_active: true
      })
    }

    // Wall thickness range from WPS
    if (spec.wall_thickness_min != null || spec.wall_thickness_max != null) {
      thresholds.push({
        organization_id: orgId,
        activity_type: 'Stringing',
        field_key: 'wallThicknessSpec',
        min_value: spec.wall_thickness_min,
        max_value: spec.wall_thickness_max,
        unit: 'mm',
        severity: 'critical',
        alert_title: 'Wall Thickness Out of Spec',
        alert_message: 'Wall thickness {value}mm is outside the specified range of {min}-{max}mm.',
        recommended_action: 'Verify pipe tally and mill certification. Flag pipe for dimensional check.',
        reference_document: spec.wps_number || 'WPS Document',
        source_bucket: 'wps_material_specs',
        source_id: spec.id,
        is_active: true
      })
    }

    // Pipe diameter range from WPS
    if (spec.diameter_min != null || spec.diameter_max != null) {
      thresholds.push({
        organization_id: orgId,
        activity_type: 'Stringing',
        field_key: 'odMeasured',
        min_value: spec.diameter_min,
        max_value: spec.diameter_max,
        unit: 'mm',
        severity: 'warning',
        alert_title: 'Pipe Diameter Outside Tolerance',
        alert_message: 'OD measurement {value}mm is outside the WPS tolerance range of {min}-{max}mm.',
        recommended_action: 'Verify measurement method and check ovality. Flag if confirmed out of tolerance.',
        reference_document: spec.wps_number || 'WPS Document',
        source_bucket: 'wps_material_specs',
        source_id: spec.id,
        is_active: true
      })
    }
  }

  return thresholds
}

// ─────────────────────────────────────────────────────────────
// SEEDER: Contract Configuration
// Creates thresholds from contract_config table
// ─────────────────────────────────────────────────────────────
async function seedThresholdsFromContract(orgId) {
  if (!orgId) return []

  const { data: configs, error } = await supabase
    .from('contract_config')
    .select('*')
    .eq('organization_id', orgId)

  if (error || !configs?.length) {
    console.warn('[ThresholdSeeder] No contract config found for org:', orgId)
    return []
  }

  const thresholds = []
  const config = configs[0] // Use first config

  // KP bounds from contract
  if (config.kp_start != null || config.kp_end != null) {
    // Start KP lower bound
    if (config.kp_start != null) {
      thresholds.push({
        organization_id: orgId,
        activity_type: '*', // Applies to all activity types
        field_key: 'startKP',
        min_value: config.kp_start,
        max_value: config.kp_end,
        unit: 'km',
        severity: 'critical',
        alert_title: 'KP Outside Project Bounds',
        alert_message: 'Start KP {value} is outside the project boundaries ({min} to {max}).',
        recommended_action: 'Verify the KP value. This may indicate an entry error or work outside the contracted scope.',
        reference_document: 'Contract Scope of Work',
        source_bucket: 'contract_config',
        source_id: config.id,
        is_active: true
      })
    }
  }

  // Workday hours threshold
  if (config.standard_workday_hours != null) {
    thresholds.push({
      organization_id: orgId,
      activity_type: '*',
      field_key: 'hours',
      min_value: null,
      max_value: config.standard_workday_hours,
      unit: 'hours',
      severity: 'warning',
      alert_title: 'Hours Exceed Standard Workday',
      alert_message: 'Reported hours ({value}) exceed the standard workday of {max} hours.',
      recommended_action: 'Verify overtime authorization if hours are correct.',
      reference_document: 'Contract Terms - Working Hours',
      source_bucket: 'contract_config',
      source_id: config.id,
      is_active: true
    })
  }

  return thresholds
}

// ─────────────────────────────────────────────────────────────
// SEEDER: Industry Standard Defaults
// Hardcoded thresholds based on pipeline construction standards
// ─────────────────────────────────────────────────────────────
function seedDefaultThresholds(orgId) {
  if (!orgId) return []

  return [
    // HD Bores - Grout variance tolerance
    {
      organization_id: orgId,
      activity_type: 'HD Bores',
      field_key: 'grout_variance',
      min_value: null,
      max_value: 5,
      unit: '%',
      severity: 'warning',
      alert_title: 'Grout Variance Exceeds 5%',
      alert_message: 'Grout variance of {value}% exceeds the allowable tolerance of {max}%.',
      recommended_action: 'Re-check grout mix ratio and pump calibration. Document any variance justification.',
      reference_document: 'CSA Z662, Clause 6.3.11',
      source_bucket: null,
      source_id: null,
      is_active: true
    },
    // Bending - Bend angle limit
    {
      organization_id: orgId,
      activity_type: 'Bending',
      field_key: 'bendAngle',
      min_value: null,
      max_value: 90,
      unit: '°',
      severity: 'critical',
      alert_title: 'Bend Angle Exceeds Maximum',
      alert_message: 'Bend angle of {value}° exceeds the maximum allowable of {max}°.',
      recommended_action: 'Do not install bend. Review alignment drawings for alternative routing.',
      reference_document: 'CSA Z662, Clause 6.2.2',
      source_bucket: null,
      source_id: null,
      is_active: true
    },
    // Bending - Ovality limit
    {
      organization_id: orgId,
      activity_type: 'Bending',
      field_key: 'ovalityPercent',
      min_value: null,
      max_value: 3,
      unit: '%',
      severity: 'critical',
      alert_title: 'Ovality Exceeds 3% Limit',
      alert_message: 'Ovality of {value}% exceeds the CSA Z662 limit of {max}%.',
      recommended_action: 'Reject bend. Straighten or scrap pipe per specification.',
      reference_document: 'CSA Z662, Clause 6.2.2.4',
      source_bucket: null,
      source_id: null,
      is_active: true
    },
    // Backfill - Cover depth minimum
    {
      organization_id: orgId,
      activity_type: 'Backfill',
      field_key: 'coverDepth',
      min_value: 0.6,
      max_value: null,
      unit: 'm',
      severity: 'critical',
      alert_title: 'Cover Depth Below Minimum',
      alert_message: 'Cover depth of {value}m is below the minimum required depth of {min}m.',
      recommended_action: 'Do not proceed with backfill until cover depth meets specification. Consider additional padding.',
      reference_document: 'CSA Z662, Clause 6.3.8',
      source_bucket: null,
      source_id: null,
      is_active: true
    },
    // Backfill - Compaction percent range
    {
      organization_id: orgId,
      activity_type: 'Backfill',
      field_key: 'compactionPercent',
      min_value: 90,
      max_value: null,
      unit: '%',
      severity: 'warning',
      alert_title: 'Compaction Below Required Level',
      alert_message: 'Compaction of {value}% is below the minimum required level of {min}%.',
      recommended_action: 'Additional compaction passes required before proceeding.',
      reference_document: 'Project Specification - Backfill Requirements',
      source_bucket: null,
      source_id: null,
      is_active: true
    },
    // Topsoil - Admixture limit
    {
      organization_id: orgId,
      activity_type: 'Topsoil',
      field_key: 'admixture_percent',
      min_value: null,
      max_value: 15,
      unit: '%',
      severity: 'critical',
      alert_title: 'Admixture Exceeds 15%',
      alert_message: 'Admixture contamination of {value}% exceeds the maximum allowable of {max}%.',
      recommended_action: 'Stop stripping and re-grade cutting edge. Photo-document contamination zone.',
      reference_document: 'Environmental Protection Plan, Soil Handling Protocol',
      source_bucket: null,
      source_id: null,
      is_active: true
    },
    // Topsoil - Stockpile separation
    {
      organization_id: orgId,
      activity_type: 'Topsoil',
      field_key: 'stockpileSeparationDistance',
      min_value: 1.0,
      max_value: null,
      unit: 'm',
      severity: 'warning',
      alert_title: 'Stockpile Separation Below Minimum',
      alert_message: 'Stockpile separation of {value}m is below the required minimum of {min}m.',
      recommended_action: 'Increase separation between topsoil and subsoil piles to prevent contamination.',
      reference_document: 'Environmental Protection Plan, Soil Handling Protocol',
      source_bucket: null,
      source_id: null,
      is_active: true
    },
    // Welding - Root opening tolerance
    {
      organization_id: orgId,
      activity_type: 'Welding - Mainline',
      field_key: 'rootOpening',
      min_value: 1.0,
      max_value: 3.2,
      unit: 'mm',
      severity: 'warning',
      alert_title: 'Root Opening Outside Tolerance',
      alert_message: 'Root opening of {value}mm is outside the typical range of {min}-{max}mm.',
      recommended_action: 'Verify WPS root opening requirements. Adjust fit-up if needed.',
      reference_document: 'API 1104, Section 7',
      source_bucket: null,
      source_id: null,
      is_active: true
    },
    // Welding - Hi-Lo tolerance
    {
      organization_id: orgId,
      activity_type: 'Welding - Mainline',
      field_key: 'hiLo',
      min_value: null,
      max_value: 1.6,
      unit: 'mm',
      severity: 'warning',
      alert_title: 'Hi-Lo Exceeds Tolerance',
      alert_message: 'Hi-Lo measurement of {value}mm exceeds the tolerance of {max}mm.',
      recommended_action: 'Adjust pipe alignment. Use internal clamp or re-fit.',
      reference_document: 'API 1104, Section 7.3',
      source_bucket: null,
      source_id: null,
      is_active: true
    },
    // Lower-in - Foreign line clearance
    {
      organization_id: orgId,
      activity_type: 'Lower-in',
      field_key: 'clearance',
      min_value: 0.3,
      max_value: null,
      unit: 'm',
      severity: 'critical',
      alert_title: 'Foreign Line Clearance Below Minimum',
      alert_message: 'Foreign line clearance of {value}m is below the minimum required clearance of {min}m.',
      recommended_action: 'Stop lower-in at this location. Notify engineering for crossing design review.',
      reference_document: 'CSA Z662, Clause 6.3.10',
      source_bucket: null,
      source_id: null,
      is_active: true
    },
    // Access - Width minimum
    {
      organization_id: orgId,
      activity_type: 'Access',
      field_key: 'accessWidth',
      min_value: 5.0,
      max_value: null,
      unit: 'm',
      severity: 'info',
      alert_title: 'Access Width Below Typical',
      alert_message: 'Access width of {value}m is below the typical minimum of {min}m for pipeline construction access.',
      recommended_action: 'Verify access width is adequate for equipment passage. Document if restricted by ROW constraints.',
      reference_document: 'Project Access Road Specification',
      source_bucket: null,
      source_id: null,
      is_active: true
    },
    // HD Bores - Bore length sanity check
    {
      organization_id: orgId,
      activity_type: 'HD Bores',
      field_key: 'boreLength',
      min_value: 1,
      max_value: 500,
      unit: 'm',
      severity: 'warning',
      alert_title: 'Bore Length Unusual',
      alert_message: 'Bore length of {value}m is outside the typical range of {min}-{max}m.',
      recommended_action: 'Verify bore length measurement. This may indicate an entry error.',
      reference_document: 'Bore Crossing Design',
      source_bucket: null,
      source_id: null,
      is_active: true
    }
  ]
}

// ─────────────────────────────────────────────────────────────
// REFRESH: Upsert all thresholds, deactivate stale ones
// ─────────────────────────────────────────────────────────────
async function refreshAllThresholds(orgId) {
  if (!orgId) return { inserted: 0, deactivated: 0 }

  // Gather all thresholds from all seeders
  const wpsThresholds = await seedThresholdsFromWPS(orgId)
  const contractThresholds = await seedThresholdsFromContract(orgId)
  const defaultThresholds = seedDefaultThresholds(orgId)

  const allThresholds = [...wpsThresholds, ...contractThresholds, ...defaultThresholds]

  let inserted = 0
  let deactivated = 0

  // Track which (activity_type, field_key) combos we've seeded
  const seededKeys = new Set()

  for (const threshold of allThresholds) {
    const key = `${threshold.activity_type}::${threshold.field_key}`
    seededKeys.add(key)

    // Upsert: insert or update on conflict
    const { error } = await supabase
      .from('mentor_threshold_config')
      .upsert(threshold, {
        onConflict: 'organization_id,activity_type,field_key'
      })

    if (!error) {
      inserted++
    } else {
      console.warn('[ThresholdSeeder] Upsert failed:', error.message, threshold.field_key)
    }
  }

  // Deactivate thresholds that were auto-seeded but are no longer in seed results
  // Only deactivate those with a source_bucket (auto-seeded), not manually created ones
  const { data: existing } = await supabase
    .from('mentor_threshold_config')
    .select('id, activity_type, field_key, source_bucket')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .not('source_bucket', 'is', null)

  if (existing) {
    for (const row of existing) {
      const key = `${row.activity_type}::${row.field_key}`
      if (!seededKeys.has(key)) {
        await supabase
          .from('mentor_threshold_config')
          .update({ is_active: false })
          .eq('id', row.id)
        deactivated++
      }
    }
  }

  console.log(`[ThresholdSeeder] Refresh complete: ${inserted} upserted, ${deactivated} deactivated`)
  return { inserted, deactivated }
}

export {
  seedThresholdsFromWPS,
  seedThresholdsFromContract,
  seedDefaultThresholds,
  refreshAllThresholds
}

export default {
  seedThresholdsFromWPS,
  seedThresholdsFromContract,
  seedDefaultThresholds,
  refreshAllThresholds
}
