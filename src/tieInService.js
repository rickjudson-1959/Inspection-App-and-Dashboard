import { supabase } from './supabase'

/**
 * Save tie-in data to Supabase
 * @param {Array} tieIns - Array of tie-in objects from TieInWeldData component
 * @param {number} ticketId - The daily_reports ID to link to
 * @param {UUID} organizationId - The organization ID for multi-tenant support
 * @returns {Object} { success: boolean, error?: string, savedIds?: string[] }
 */
export async function saveTieInTicket(tieIns, ticketId, organizationId = null) {
  const savedIds = []
  
  try {
    // First, delete any existing tie-ins for this ticket (to handle updates)
    const { error: deleteError } = await supabase
      .from('tie_ins')
      .delete()
      .eq('ticket_id', ticketId)
    
    if (deleteError) {
      console.error('Error deleting existing tie-ins:', deleteError)
      // Continue anyway - might be first save
    }

    // Loop through each tie-in
    for (const tieIn of tieIns) {
      // Map component state to database columns
      const tieInRecord = {
        ticket_id: ticketId,
        tie_in_number: tieIn.tieInNumber,
        station: tieIn.station,
        pipe_size: tieIn.pipeSize || null,
        visual_result: tieIn.visualResult,
        nde_type: tieIn.ndeType,
        nde_result: tieIn.ndeResult,
        construction_direction: tieIn.constructionDirection,

        // PUP CUT
        pup_cut_length: parseDecimal(tieIn.pup?.cutLength),
        pup_cut_pipe_number: tieIn.pup?.cutPipeNumber || null,
        pup_cut_heat_number: tieIn.pup?.cutHeatNumber || null,
        pup_cut_wall_thickness: parseDecimal(tieIn.pup?.cutWallThickness),
        pup_cut_manufacturer: tieIn.pup?.cutManufacturer || null,

        // PUP ADDED
        pup_added_length: parseDecimal(tieIn.pup?.addedLength),
        pup_added_pipe_number: tieIn.pup?.addedPipeNumber || null,
        pup_added_heat_number: tieIn.pup?.addedHeatNumber || null,
        pup_added_wall_thickness: parseDecimal(tieIn.pup?.addedWallThickness),
        pup_added_manufacturer: tieIn.pup?.addedManufacturer || null,

        // U/S Pipe (was leftPipe)
        us_pipe_no: tieIn.pup?.leftPipeNo || null,
        us_heat_no: tieIn.pup?.leftHeatNo || null,
        us_shaw_no: tieIn.pup?.leftShawNo || null,
        us_wt: parseDecimal(tieIn.pup?.leftWt),
        us_mftr: tieIn.pup?.leftMftr || null,
        us_length: parseDecimal(tieIn.pup?.leftLength),

        // D/S Pipe (was rightPipe)
        ds_pipe_no: tieIn.pup?.rightPipeNo || null,
        ds_heat_no: tieIn.pup?.rightHeatNo || null,
        ds_shaw_no: tieIn.pup?.rightShawNo || null,
        ds_wt: parseDecimal(tieIn.pup?.rightWt),
        ds_mftr: tieIn.pup?.rightMftr || null,
        ds_length: parseDecimal(tieIn.pup?.rightLength),

        chainage: tieIn.pup?.chainage || null,
        organization_id: organizationId
      }

      // Insert parent tie_in record
      const { data: insertedTieIn, error: tieInError } = await supabase
        .from('tie_ins')
        .insert(tieInRecord)
        .select('id')
        .single()

      if (tieInError) {
        throw new Error(`Failed to insert tie-in ${tieIn.tieInNumber}: ${tieInError.message}`)
      }

      const newTieInId = insertedTieIn.id
      savedIds.push(newTieInId)

      // Insert child weld records if any exist
      if (tieIn.weldParams && tieIn.weldParams.length > 0) {
        const weldRecords = tieIn.weldParams.map(weld => ({
          tie_in_id: newTieInId,
          weld_number: weld.weldNumber,
          preheat: parseDecimal(weld.preheat),
          pass: weld.pass || null,
          side: weld.side || null,
          voltage: parseDecimal(weld.voltage),
          amperage: parseDecimal(weld.amperage),
          distance: parseDecimal(weld.distance),
          time_seconds: parseDecimal(weld.time),
          travel_speed: parseDecimal(weld.travelSpeed),
          heat_input: parseDecimal(weld.heatInput),
          wps_id: weld.wpsId || null,
          meets_wps: weld.meetsWPS,
          organization_id: organizationId
        }))

        const { error: weldsError } = await supabase
          .from('tie_in_welds')
          .insert(weldRecords)

        if (weldsError) {
          throw new Error(`Failed to insert welds for ${tieIn.tieInNumber}: ${weldsError.message}`)
        }
      }
    }

    return { success: true, savedIds }

  } catch (error) {
    console.error('Error saving tie-in ticket:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Load tie-in data from Supabase
 * @param {number} ticketId - The daily_reports ID to load from
 * @returns {Array} Array of tie-in objects matching component state structure
 */
export async function loadTieInTicket(ticketId) {
  try {
    // Load all tie-ins for this ticket
    const { data: tieIns, error: tieInsError } = await supabase
      .from('tie_ins')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at')

    if (tieInsError) throw tieInsError
    if (!tieIns || tieIns.length === 0) return []

    // Load all welds for these tie-ins
    const tieInIds = tieIns.map(t => t.id)
    const { data: welds, error: weldsError } = await supabase
      .from('tie_in_welds')
      .select('*')
      .in('tie_in_id', tieInIds)
      .order('created_at')

    if (weldsError) throw weldsError

    // Map database records back to component state structure
    return tieIns.map(tieIn => ({
      id: tieIn.id,
      tieInNumber: tieIn.tie_in_number,
      station: tieIn.station || '',
      pipeSize: tieIn.pipe_size || '',
      visualResult: tieIn.visual_result || '',
      ndeType: tieIn.nde_type || '',
      ndeResult: tieIn.nde_result || '',
      constructionDirection: tieIn.construction_direction || '',
      weldParams: (welds || [])
        .filter(w => w.tie_in_id === tieIn.id)
        .map(w => ({
          id: w.id,
          weldNumber: w.weld_number || '',
          preheat: w.preheat || '',
          pass: w.pass || '',
          side: w.side || '',
          voltage: w.voltage || '',
          amperage: w.amperage || '',
          distance: w.distance || '',
          time: w.time_seconds || '',
          travelSpeed: w.travel_speed || '',
          heatInput: w.heat_input || null,
          wpsId: w.wps_id || '',
          meetsWPS: w.meets_wps
        })),
      pup: {
        cutLength: tieIn.pup_cut_length || '',
        cutPipeNumber: tieIn.pup_cut_pipe_number || '',
        cutHeatNumber: tieIn.pup_cut_heat_number || '',
        cutWallThickness: tieIn.pup_cut_wall_thickness || '',
        cutManufacturer: tieIn.pup_cut_manufacturer || '',
        addedLength: tieIn.pup_added_length || '',
        addedPipeNumber: tieIn.pup_added_pipe_number || '',
        addedHeatNumber: tieIn.pup_added_heat_number || '',
        addedWallThickness: tieIn.pup_added_wall_thickness || '',
        addedManufacturer: tieIn.pup_added_manufacturer || '',
        leftPipeNo: tieIn.us_pipe_no || '',
        leftHeatNo: tieIn.us_heat_no || '',
        leftShawNo: tieIn.us_shaw_no || '',
        leftWt: tieIn.us_wt || '',
        leftMftr: tieIn.us_mftr || '',
        leftLength: tieIn.us_length || '',
        rightPipeNo: tieIn.ds_pipe_no || '',
        rightHeatNo: tieIn.ds_heat_no || '',
        rightShawNo: tieIn.ds_shaw_no || '',
        rightWt: tieIn.ds_wt || '',
        rightMftr: tieIn.ds_mftr || '',
        rightLength: tieIn.ds_length || '',
        chainage: tieIn.chainage || ''
      }
    }))

  } catch (error) {
    console.error('Error loading tie-in ticket:', error)
    return []
  }
}

// Helper function to safely parse decimals
function parseDecimal(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = parseFloat(value)
  return isNaN(parsed) ? null : parsed
}
