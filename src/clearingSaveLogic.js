/**
 * CLEARING INSPECTION SAVE LOGIC
 * Functions for saving and loading clearing inspection data
 */

import { supabase } from './supabase';

/**
 * Save a clearing inspection to the database
 * @param {Object} formData - The form data from ClearingInspectionForm
 * @param {UUID} dailyReportId - The parent daily report ID
 * @param {UUID} projectId - The project ID
 * @param {UUID} activityBlockId - Optional activity block ID
 * @param {UUID} organizationId - The organization ID for multi-tenant support
 * @returns {Object} - { data, error }
 */
export const saveClearingInspection = async (formData, dailyReportId, projectId, activityBlockId = null, organizationId = null) => {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    
    // Map form field names to database column names
    const dbRecord = {
      daily_report_id: dailyReportId,
      project_id: projectId,
      activity_block_id: activityBlockId,
      
      // Section 1: Right-of-Way & Boundaries
      row_width_design: parseFloat(formData.rowWidthDesign) || null,
      row_width_actual: parseFloat(formData.rowWidthActual) || null,
      row_width_compliant: formData.rowWidthCompliant || null,
      row_alignment_verified: formData.rowAlignmentVerified || null,
      boundaries_flagged: formData.boundariesFlagged || null,
      tws_staked: formData.twsStaked || null,
      legal_survey_pins_protected: formData.legalSurveyPinsProtected || null,
      
      // Section 2: Pre-Clearing Approvals & Compliance
      cgr_plan_approved: formData.cgrPlanApproved || null,
      cgr_plan_compliance: formData.cgrPlanCompliance || null,
      off_row_approvals_in_place: formData.offRowApprovalsInPlace || null,
      construction_line_list_reviewed: formData.constructionLineListReviewed || null,
      landowner_restrictions_noted: formData.landownerRestrictionsNoted || null,
      land_agent_contact: formData.landAgentContact || null,
      
      // Section 3: Environmental Compliance
      environmental_inspector_liaison: formData.environmentalInspectorLiaison || null,
      timing_constraints_met: formData.timingConstraintsMet || null,
      wildlife_regulations_compliant: formData.wildlifeRegulationsCompliant || null,
      rare_plant_protection: formData.rarePlantProtection || null,
      asrd_commitments_met: formData.asrdCommitmentsMet || null,
      ground_disturbance_compliant: formData.groundDisturbanceCompliant || null,
      
      // Section 4: Buried Facilities & Utilities
      buried_facilities_identified: formData.buriedFacilitiesIdentified || null,
      locates_complete: formData.locatesComplete || null,
      hand_exposing_complete: formData.handExposingComplete || null,
      foreign_crossings_marked: formData.foreignCrossingsMarked || null,
      
      // Section 5: Overhead Power Lines
      power_lines_present: formData.powerLinesPresent || null,
      power_lines_identified: formData.powerLinesIdentified || null,
      power_lines_marked: formData.powerLinesMarked || null,
      power_lines_clearance: formData.powerLinesClearance || null,
      power_line_voltage: formData.powerLineVoltage || null,
      
      // Section 6: Timber Salvage
      timber_salvage_required: formData.timberSalvageRequired || null,
      timber_salvage_compliant: formData.timberSalvageCompliant || null,
      merchantable_timber_salvaged: formData.merchantableTimberSalvaged || null,
      timber_disposal_method: formData.timberDisposalMethod || null,
      timber_decks_created: formData.timberDecksCreated || null,
      
      // Section 7: Grubbing & Stripping
      grubbing_complete: formData.grubbingComplete || null,
      stump_height_compliant: formData.stumpHeightCompliant || null,
      stump_height_max: parseFloat(formData.stumpHeightMax) || null,
      topsoil_stripped: formData.topsoilStripped || null,
      topsoil_separation: formData.topsoilSeparation || null,
      
      // Section 8: Watercourse Crossings
      watercourse_present: formData.watercoursePresent || null,
      watercourse_access_compliant: formData.watercourseAccessCompliant || null,
      equipment_crossing_installed: formData.equipmentCrossingInstalled || null,
      equipment_crossing_type: formData.equipmentCrossingType || null,
      regulatory_approval_compliant: formData.regulatoryApprovalCompliant || null,
      erosion_controls_installed: formData.erosionControlsInstalled || null,
      
      // Section 9: Temporary Fencing
      temp_fencing_required: formData.tempFencingRequired || null,
      temp_fencing_installed: formData.tempFencingInstalled || null,
      temp_fencing_type: formData.tempFencingType || null,
      temp_fencing_length: parseFloat(formData.tempFencingLength) || null,
      gates_installed: formData.gatesInstalled || null,
      gates_count: parseInt(formData.gatesCount) || null,
      
      // Section 10: General Observations
      weather_conditions: formData.weatherConditions || null,
      ground_conditions: formData.groundConditions || null,
      safety_issues_observed: formData.safetyIssuesObserved || null,
      ncr_required: formData.ncrRequired || null,
      inspector_notes: formData.inspectorNotes || null,
      
      // Location Data (if provided)
      start_kp: parseFloat(formData.startKp) || null,
      end_kp: parseFloat(formData.endKp) || null,
      gps_latitude: parseFloat(formData.gpsLatitude) || null,
      gps_longitude: parseFloat(formData.gpsLongitude) || null,
      
      // Metadata
      inspector_id: user?.id || null,
      inspector_name: formData.inspectorName || user?.email || null,
      inspection_date: formData.inspectionDate || new Date().toISOString().split('T')[0],
      status: formData.status || 'draft',
      organization_id: organizationId
    };

    // Check if record exists for this daily report
    const { data: existing } = await supabase
      .from('clearing_inspections')
      .select('id')
      .eq('daily_report_id', dailyReportId)
      .single();

    let result;
    
    if (existing) {
      // Update existing record
      result = await supabase
        .from('clearing_inspections')
        .update(dbRecord)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new record
      result = await supabase
        .from('clearing_inspections')
        .insert(dbRecord)
        .select()
        .single();
    }

    if (result.error) throw result.error;

    return { data: result.data, error: null };
    
  } catch (error) {
    console.error('Error saving clearing inspection:', error);
    return { data: null, error };
  }
};

/**
 * Load a clearing inspection from the database
 * @param {UUID} dailyReportId - The daily report ID
 * @returns {Object} - { data, error }
 */
export const loadClearingInspection = async (dailyReportId) => {
  try {
    const { data, error } = await supabase
      .from('clearing_inspections')
      .select('*')
      .eq('daily_report_id', dailyReportId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned

    if (!data) {
      return { data: null, error: null };
    }

    // Map database columns back to form field names
    const formData = {
      // Section 1
      rowWidthDesign: data.row_width_design?.toString() || '',
      rowWidthActual: data.row_width_actual?.toString() || '',
      rowWidthCompliant: data.row_width_compliant || '',
      rowAlignmentVerified: data.row_alignment_verified || '',
      boundariesFlagged: data.boundaries_flagged || '',
      twsStaked: data.tws_staked || '',
      legalSurveyPinsProtected: data.legal_survey_pins_protected || '',
      
      // Section 2
      cgrPlanApproved: data.cgr_plan_approved || '',
      cgrPlanCompliance: data.cgr_plan_compliance || '',
      offRowApprovalsInPlace: data.off_row_approvals_in_place || '',
      constructionLineListReviewed: data.construction_line_list_reviewed || '',
      landownerRestrictionsNoted: data.landowner_restrictions_noted || '',
      landAgentContact: data.land_agent_contact || '',
      
      // Section 3
      environmentalInspectorLiaison: data.environmental_inspector_liaison || '',
      timingConstraintsMet: data.timing_constraints_met || '',
      wildlifeRegulationsCompliant: data.wildlife_regulations_compliant || '',
      rarePlantProtection: data.rare_plant_protection || '',
      asrdCommitmentsMet: data.asrd_commitments_met || '',
      groundDisturbanceCompliant: data.ground_disturbance_compliant || '',
      
      // Section 4
      buriedFacilitiesIdentified: data.buried_facilities_identified || '',
      locatesComplete: data.locates_complete || '',
      handExposingComplete: data.hand_exposing_complete || '',
      foreignCrossingsMarked: data.foreign_crossings_marked || '',
      
      // Section 5
      powerLinesPresent: data.power_lines_present || '',
      powerLinesIdentified: data.power_lines_identified || '',
      powerLinesMarked: data.power_lines_marked || '',
      powerLinesClearance: data.power_lines_clearance || '',
      powerLineVoltage: data.power_line_voltage || '',
      
      // Section 6
      timberSalvageRequired: data.timber_salvage_required || '',
      timberSalvageCompliant: data.timber_salvage_compliant || '',
      merchantableTimberSalvaged: data.merchantable_timber_salvaged || '',
      timberDisposalMethod: data.timber_disposal_method || '',
      timberDecksCreated: data.timber_decks_created || '',
      
      // Section 7
      grubbingComplete: data.grubbing_complete || '',
      stumpHeightCompliant: data.stump_height_compliant || '',
      stumpHeightMax: data.stump_height_max?.toString() || '',
      topsoilStripped: data.topsoil_stripped || '',
      topsoilSeparation: data.topsoil_separation || '',
      
      // Section 8
      watercoursePresent: data.watercourse_present || '',
      watercourseAccessCompliant: data.watercourse_access_compliant || '',
      equipmentCrossingInstalled: data.equipment_crossing_installed || '',
      equipmentCrossingType: data.equipment_crossing_type || '',
      regulatoryApprovalCompliant: data.regulatory_approval_compliant || '',
      erosionControlsInstalled: data.erosion_controls_installed || '',
      
      // Section 9
      tempFencingRequired: data.temp_fencing_required || '',
      tempFencingInstalled: data.temp_fencing_installed || '',
      tempFencingType: data.temp_fencing_type || '',
      tempFencingLength: data.temp_fencing_length?.toString() || '',
      gatesInstalled: data.gates_installed || '',
      gatesCount: data.gates_count?.toString() || '',
      
      // Section 10
      weatherConditions: data.weather_conditions || '',
      groundConditions: data.ground_conditions || '',
      safetyIssuesObserved: data.safety_issues_observed || '',
      ncrRequired: data.ncr_required || '',
      inspectorNotes: data.inspector_notes || '',
      
      // Location
      startKp: data.start_kp?.toString() || '',
      endKp: data.end_kp?.toString() || '',
      gpsLatitude: data.gps_latitude?.toString() || '',
      gpsLongitude: data.gps_longitude?.toString() || '',
      
      // Metadata
      inspectorName: data.inspector_name || '',
      inspectionDate: data.inspection_date || '',
      status: data.status || 'draft'
    };

    return { data: formData, error: null };
    
  } catch (error) {
    console.error('Error loading clearing inspection:', error);
    return { data: null, error };
  }
};

/**
 * Submit a clearing inspection (change status from draft to submitted)
 * @param {UUID} inspectionId - The inspection ID
 * @returns {Object} - { data, error }
 */
export const submitClearingInspection = async (inspectionId) => {
  try {
    const { data, error } = await supabase
      .from('clearing_inspections')
      .update({ 
        status: 'submitted',
        submitted_at: new Date().toISOString()
      })
      .eq('id', inspectionId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
    
  } catch (error) {
    console.error('Error submitting clearing inspection:', error);
    return { data: null, error };
  }
};

/**
 * Get clearing inspection compliance score
 * @param {UUID} inspectionId - The inspection ID
 * @returns {Object} - { score, error }
 */
export const getClearingComplianceScore = async (inspectionId) => {
  try {
    const { data, error } = await supabase
      .rpc('calculate_clearing_compliance_score', { inspection_id: inspectionId });

    if (error) throw error;

    return { score: data, error: null };
    
  } catch (error) {
    console.error('Error getting compliance score:', error);
    return { score: null, error };
  }
};

/**
 * Get clearing inspections for a project within a date range
 * @param {UUID} projectId - The project ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Object} - { data, error }
 */
export const getClearingInspectionsByDateRange = async (projectId, startDate, endDate) => {
  try {
    const { data, error } = await supabase
      .from('clearing_inspections')
      .select('*')
      .eq('project_id', projectId)
      .gte('inspection_date', startDate)
      .lte('inspection_date', endDate)
      .order('inspection_date', { ascending: true })
      .order('start_kp', { ascending: true });

    if (error) throw error;

    return { data, error: null };
    
  } catch (error) {
    console.error('Error getting clearing inspections:', error);
    return { data: null, error };
  }
};

/**
 * Get NCR tracking data for a project
 * @param {UUID} projectId - The project ID
 * @returns {Object} - { data, error }
 */
export const getClearingNCRs = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('clearing_ncr_tracking')
      .select('*')
      .eq('project_id', projectId)
      .order('inspection_date', { ascending: false });

    if (error) throw error;

    return { data, error: null };
    
  } catch (error) {
    console.error('Error getting NCRs:', error);
    return { data: null, error };
  }
};

export default {
  saveClearingInspection,
  loadClearingInspection,
  submitClearingInspection,
  getClearingComplianceScore,
  getClearingInspectionsByDateRange,
  getClearingNCRs
};
