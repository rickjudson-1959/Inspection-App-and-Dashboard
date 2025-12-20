import { supabase } from './supabase'

export async function saveTieInTicket(ticketData) {
  if (!ticketData || !ticketData.tieIns || ticketData.tieIns.length === 0) {
    alert("No tie-in data to save!");
    return;
  }

  console.log("Starting Save...", ticketData);

  // 1. Loop through every Tie-In created in the form
  for (const tieIn of ticketData.tieIns) {
    
    // A. Insert the Parent Record (The Tie-In itself)
    const { data: tieInRecord, error: tieInError } = await supabase
      .from('tie_ins')
      .insert({
        tie_in_number: tieIn.tieInNumber,
        station: tieIn.station,
        visual_result: tieIn.visualResult,
        nde_type: tieIn.ndeType,
        nde_result: tieIn.ndeResult,
        direction: tieIn.constructionDirection,
        
        // PUP CUT details
        cut_length: tieIn.pup?.cutLength || null,
        cut_pipe_no: tieIn.pup?.cutPipeNumber || null,
        cut_heat_no: tieIn.pup?.cutHeatNumber || null,
        cut_wall_thickness: tieIn.pup?.cutWallThickness || null,
        cut_manufacturer: tieIn.pup?.cutManufacturer || null,
        
        // PUP ADDED details
        added_length: tieIn.pup?.addedLength || null,
        added_pipe_no: tieIn.pup?.addedPipeNumber || null,
        added_heat_no: tieIn.pup?.addedHeatNumber || null,
        added_wall_thickness: tieIn.pup?.addedWallThickness || null,
        added_manufacturer: tieIn.pup?.addedManufacturer || null,
        
        // U/S (Upstream) Pipe details
        us_pipe_no: tieIn.pup?.leftPipeNo || null,
        us_heat_no: tieIn.pup?.leftHeatNo || null,
        us_shaw_no: tieIn.pup?.leftShawNo || null,
        us_wt: tieIn.pup?.leftWt || null,
        us_mftr: tieIn.pup?.leftMftr || null,
        us_length: tieIn.pup?.leftLength || null,
        
        // D/S (Downstream) Pipe details
        ds_pipe_no: tieIn.pup?.rightPipeNo || null,
        ds_heat_no: tieIn.pup?.rightHeatNo || null,
        ds_shaw_no: tieIn.pup?.rightShawNo || null,
        ds_wt: tieIn.pup?.rightWt || null,
        ds_mftr: tieIn.pup?.rightMftr || null,
        ds_length: tieIn.pup?.rightLength || null,
        
        // Chainage
        kp_chainage: tieIn.pup?.chainage || null
      })
      .select()
      .single();

    if (tieInError) {
      console.error("Error saving Tie-In:", tieInError);
      alert(`Error saving Tie-In ${tieIn.tieInNumber}: ${tieInError.message}`);
      return; // Stop if parent fails
    }

    const tieInId = tieInRecord.id; // Get the ID Supabase just created

    // B. Insert the Children (The Weld Passes)
    if (tieIn.weldParams && tieIn.weldParams.length > 0) {
      const weldRows = tieIn.weldParams.map(weld => ({
        tie_in_id: tieInId, // LINK TO PARENT
        weld_number: weld.weldNumber,
        pass_type: weld.pass,
        side: weld.side,
        volts: weld.voltage || null,
        amps: weld.amperage || null,
        distance: weld.distance || null,
        time_seconds: weld.time || null,
        travel_speed: weld.travelSpeed || null,
        heat_input: weld.heatInput || null,
        wps_id: weld.wpsId || null,
        preheat: weld.preheat || null,
        meets_wps: weld.meetsWPS
      }));

      const { error: weldError } = await supabase
        .from('tie_in_welds')
        .insert(weldRows);
      
      if (weldError) {
        console.error("Error saving welds:", weldError);
        alert(`Error saving welds for ${tieIn.tieInNumber}`);
      }
    }
  }

  alert("Ticket Saved Successfully!");
}
