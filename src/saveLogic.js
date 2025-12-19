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
        // Map the PUP/Pipe details
        cut_length: tieIn.pup.cutLength,
        cut_heat_no: tieIn.pup.cutHeatNumber,
        added_length: tieIn.pup.addedLength,
        added_heat_no: tieIn.pup.addedHeatNumber,
        us_pipe_no: tieIn.pup.leftPipeNo,   
        us_heat_no: tieIn.pup.leftHeatNo,
        ds_pipe_no: tieIn.pup.rightPipeNo, 
        ds_heat_no: tieIn.pup.rightHeatNo,
        kp_chainage: tieIn.pup.chainage
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
    const weldRows = tieIn.weldParams.map(weld => ({
      tie_in_id: tieInId, // LINK TO PARENT
      weld_number: weld.weldNumber,
      pass_type: weld.pass,
      side: weld.side,
      volts: weld.voltage,
      amps: weld.amperage,
      travel_speed: weld.travelSpeed,
      heat_input: weld.heatInput,
      wps_id: weld.wpsId,
      preheat: weld.preheat
    }));

    if (weldRows.length > 0) {
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