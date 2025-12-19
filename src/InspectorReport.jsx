import './App.css'
import { useAuth } from './AuthContext.jsx'
import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { supabase } from './supabase'
import MainlineWeldData from './MainlineWeldData.jsx'
import TieInWeldData from './TieInWeldData.jsx'

import BendingLog from './BendingLog.jsx'
const weatherApiKey = import.meta.env.VITE_WEATHER_API_KEY
const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

// Project configuration
const PROJECT_NAME = "Clearwater Pipeline - Demo Project"
const PROJECT_SHORT = "CWP"

// Pipeline locations for weather lookup
const pipelineLocations = {
  'Pipeline A': { lat: 53.5461, lon: -113.4938, name: 'Edmonton, AB' },
  'Pipeline B': { lat: 51.0447, lon: -114.0719, name: 'Calgary, AB' },
  'Pipeline C': { lat: 56.7267, lon: -111.3790, name: 'Fort McMurray, AB' }
}

// Activity types for pipeline construction
const activityTypes = [
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
  'Ditch',
  'Lower-in',
  'Backfill',
  'Tie-ins',
  'Cleanup - Machine',
  'Cleanup - Final',
  'Hydrostatic Testing',
  'HDD',
  'HD Bores'
]

// Quality fields per activity type (API 1169 based)
const qualityFieldsByActivity = {
  'Clearing': [
    { name: 'widthCompliance', label: 'Width Compliance (m)', type: 'number' },
    { name: 'environmentalMarkers', label: 'Environmental Markers in Place', type: 'select', options: ['Yes', 'No', 'N/A'] },
    { name: 'debrisRemoval', label: 'Debris Removal Complete', type: 'select', options: ['Yes', 'No', 'In Progress'] }
  ],
  'Access': [
    { name: 'accessWidth', label: 'Access Width (m)', type: 'number' },
    { name: 'surfaceCondition', label: 'Surface Condition', type: 'select', options: ['Good', 'Fair', 'Poor'] }
  ],
  'Topsoil': [
    { name: 'stripDepth', label: 'Strip Depth (cm)', type: 'number' },
    { name: 'stockpileLocation', label: 'Stockpile Location (KP)', type: 'text' }
  ],
  'Grading': [
    { name: 'gradeTolerance', label: 'Grade Tolerance (+/- cm)', type: 'number' },
    { name: 'slopePercent', label: 'Slope %', type: 'number' },
    { name: 'compactionPercent', label: 'Compaction %', type: 'number' }
  ],
  'Stringing': [
    { name: 'jointNumbers', label: 'Joint Numbers (from-to)', type: 'text' },
    { name: 'heatNumbers', label: 'Heat Numbers', type: 'text' },
    { name: 'coatingCondition', label: 'Coating Condition', type: 'select', options: ['Good', 'Damaged - Repaired', 'Damaged - Flagged'] },
    { name: 'millCertVerified', label: 'Mill Cert Verified', type: 'select', options: ['Yes', 'No'] }
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
  'Welding - Tie-in': [
    { name: 'weldNumber', label: 'Weld Number', type: 'text' },
    { name: 'welderID', label: 'Welder ID', type: 'text' },
    { name: 'wpsNumber', label: 'WPS Number', type: 'text' },
    { name: 'preheatTemp', label: 'Preheat Temp (°C)', type: 'number' },
    { name: 'locationType', label: 'Location Type', type: 'select', options: ['Road Crossing', 'Water Crossing', 'Foreign Line', 'Valve', 'Other'] },
    { name: 'ndtType', label: 'NDT Type', type: 'select', options: ['RT', 'UT', 'MT', 'PT', 'None'] },
    { name: 'ndtResult', label: 'NDT Result', type: 'select', options: ['Accept', 'Reject', 'Pending'] },
    { name: 'repairRequired', label: 'Repair Required', type: 'select', options: ['Yes', 'No'] },
    { name: 'repairType', label: 'Repair Type', type: 'select', options: ['N/A', 'Root', 'Hot Pass', 'Fill', 'Cap', 'Full Cutout'] },
    { name: 'repairPass', label: 'Repair Pass #', type: 'text' }
  ],
  'Coating': [
    { name: 'coatingType', label: 'Coating System', type: 'select', options: ['FBE', '3LPE', '3LPP', 'Tape Wrap', 'Shrink Sleeve', 'Other'] },
    { name: 'holidayVoltage', label: 'Holiday Test Voltage (V)', type: 'number' },
    { name: 'voltageConstant', label: 'Voltage Constant', type: 'number' },
    { name: 'dftThickness', label: 'DFT Thickness (mils)', type: 'number' },
    { name: 'equipmentID', label: 'Equipment ID/Serial', type: 'text' },
    { name: 'calibrationDate', label: 'Last Calibration Date', type: 'date' },
    { name: 'holidaysFound', label: 'Holidays Found', type: 'number' },
    { name: 'repairsCompleted', label: 'Repairs Completed', type: 'select', options: ['Yes', 'No', 'N/A'] },
    { name: 'retestPass', label: 'Retest Pass', type: 'select', options: ['Yes', 'No', 'N/A'] }
  ],
  'Ditch': [
    { name: 'trenchDepth', label: 'Trench Depth (m)', type: 'number' },
    { name: 'trenchWidth', label: 'Trench Width (m)', type: 'number' },
    { name: 'rockTrench', label: 'Rock Trench', type: 'select', options: ['Yes', 'No'] },
    { name: 'extraDepth', label: 'Extra Depth Required', type: 'select', options: ['Yes', 'No'] }
  ],
  'Lower-in': [
    { name: 'paddingDepth', label: 'Padding Depth (cm)', type: 'number' },
    { name: 'depthOfCover', label: 'Depth of Cover (m)', type: 'number' },
    { name: 'clearance', label: 'Clearance from Foreign Lines (m)', type: 'number' },
    { name: 'liftPlanVerified', label: 'Lift Plan Verified', type: 'select', options: ['Yes', 'No'] },
    { name: 'equipmentInspected', label: 'Equipment Inspected', type: 'select', options: ['Yes', 'No'] }
  ],
  'Backfill': [
    { name: 'liftThickness', label: 'Lift Thickness (cm)', type: 'number' },
    { name: 'compactionPercent', label: 'Compaction %', type: 'number' },
    { name: 'rockShield', label: 'Rock Shield Used', type: 'select', options: ['Yes', 'No', 'N/A'] }
  ],
  'Tie-ins': [
    { name: 'weldNumber', label: 'Weld Number', type: 'text' },
    { name: 'welderID', label: 'Welder ID', type: 'text' },
    { name: 'locationType', label: 'Location Type', type: 'select', options: ['Road Crossing', 'Water Crossing', 'Foreign Line', 'Valve', 'Other'] }
  ],
  'Cleanup - Machine': [
    { name: 'gradingComplete', label: 'Grading Complete', type: 'select', options: ['Yes', 'No', 'In Progress'] },
    { name: 'debrisRemoved', label: 'Debris Removed', type: 'select', options: ['Yes', 'No', 'In Progress'] }
  ],
  'Cleanup - Final': [
    { name: 'seedingComplete', label: 'Seeding Complete', type: 'select', options: ['Yes', 'No', 'In Progress'] },
    { name: 'fencingRestored', label: 'Fencing Restored', type: 'select', options: ['Yes', 'No', 'N/A'] }
  ],
  'Hydrostatic Testing': [
    { name: 'testPressure', label: 'Test Pressure (psi)', type: 'number' },
    { name: 'squeezeUpTime', label: 'Squeeze-up Time (min)', type: 'number' },
    { name: 'holdTime', label: 'Hold Time (hrs)', type: 'number' },
    { name: 'tempCompensation', label: 'Temp Compensation Applied', type: 'select', options: ['Yes', 'No'] },
    { name: 'testResult', label: 'Test Result', type: 'select', options: ['Pass', 'Fail', 'In Progress'] }
  ],
  'HDD': [
    { name: 'drillingPhase', label: 'Drilling Phase', type: 'select', options: ['Pilot Hole', 'Reaming', 'Pullback', 'Complete'] },
    { name: 'fluidType', label: 'Drilling Fluid Type', type: 'text' },
    { name: 'fluidViscosity', label: 'Fluid Viscosity', type: 'number' },
    { name: 'pullbackForce', label: 'Pullback Force (lbs)', type: 'number' },
    { name: 'entryAngle', label: 'Entry Angle (°)', type: 'number' },
    { name: 'exitAngle', label: 'Exit Angle (°)', type: 'number' }
  ],
  'HD Bores': [
    { name: 'boreLength', label: 'Bore Length (m)', type: 'number' },
    { name: 'casingSize', label: 'Casing Size (in)', type: 'number' },
    { name: 'carrierPipeSize', label: 'Carrier Pipe Size (in)', type: 'number' },
    { name: 'annularSpace', label: 'Annular Space Filled', type: 'select', options: ['Yes', 'No'] }
  ]
}

// Time lost reasons
const timeLostReasons = [
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

// Labour classifications
// Labour classifications from CX2-FC contract (72 classifications)
const labourClassifications = [
  'APPRENTICE OPER/OILER',
  'ASSISTANT PROJECT ENGINEER',
  'ASSISTANT SUPERINTENDENT',
  'BUS/ CREWCAB DRIVER',
  'CAMP MANAGER',
  'CONSTRUCTION MANAGER',
  'COST PLANNER/SCHEDULER',
  'DUMP TRUCK DRIVER 12-23 Yds',
  'ENGINEERING MANAGER',
  'ENVIRONMENTAL COORDINATOR',
  'EQUIPMENT CLERK',
  'EQUIPMENT MANAGER',
  'FIELD ENGINEER',
  'FLAT DECK < 5 TON',
  'FORKLIFT DRIVER (WAREHOUSE)',
  'FRONT-END/TIE-IN WELDER ON AUTO WELD SPREAD',
  'FRONT-END/TIE-IN WELDER ON STICK WELD SPREAD',
  'FUEL TRUCK DRIVERS HELPER',
  'FUEL/ WATER TRUCK DRIVER',
  'GENERAL FOREMAN',
  'GENERAL LABOURER',
  'INTERMEDIATE OPER',
  'LABOURER JOB STEWARD',
  'LANDMAN',
  'LOWBED/MULTIPURPOSE DRIVER',
  'MASTER MECHANIC',
  'MECH./SERVICE/ UTILITY WELD HELPER',
  'MECHANIC/ SERVICEMAN/ LUBEMAN',
  'MECHANIC/SERVICEMAN/LUBEMAN (NIGHT SHIFT)',
  'NIGHT WATCHMAN/ SECURITY',
  'NON-WELDER JOURNEYMAN/ FITTER ON AUTO WELD SPREAD',
  'NON-WELDER JOURNEYMAN/ FITTER ON STICK WELD SPREAD',
  'OFFICE CLERK',
  'OFFICE CLERK (LOCAL HIRE)',
  'OFFICE MANAGER',
  'OPERATOR JOB STEWARD',
  'PAYMASTER',
  'PICKER TRUCK DRIVER > 12 TON',
  'PICKUP/ PILOT CAR DRIVER',
  'PNEUMATIC TOOLS/NOZZLEMAN',
  'POWERSAW OPERATOR',
  'PRINC. OPER 1 (NIGHT SHIFT)',
  'PRINCIPAL OPER 1',
  'PRINCIPAL OPER 2',
  'PROJECT ADMINISTRATOR',
  'PROJECT ENGINEER',
  'PROJECT PLANNER',
  'PURCHASING AGENT',
  'QUALITY CONTROL SUPERVISOR',
  'QUALITY CONTROL TECHNICIAN',
  'SAFETY COORDINATOR',
  'SENIOR SAFETY COORDINATOR',
  'SET-IN/SET UP DRIVERS (BEND & WELD)',
  'SPEC LABOUR (CARPENTER, ETC.)',
  'STRAW - FITTER ON AUTO WELD SPREAD',
  'STRAW - FITTER ON STICK WELD SPREAD',
  'STRAW - LABOURER',
  'STRAW - OPERATOR',
  'SUPERINTENDENT',
  'SWAMPER/DRILL HELPER',
  'TEAMSTER - STEWARD',
  'TRANSPORTATION COORDINATOR',
  'UA JOB STEWARD ON AUTO WELD SPREAD',
  'UA LOWER-IN FOREMAN',
  'UA PIPE FOREMAN',
  'UA TEST FOREMAN',
  'UA TIE-IN FOREMAN',
  'UA WELDER FOREMAN',
  'UTILITY WELDER',
  'WAREHOUSEMAN 1',
  'WAREHOUSEMAN 2',
  'WELDER HELPER'
]

// Equipment types from CX2-FC contract (323 types)
const equipmentTypes = [
  '100Kw Generator',
  '1 Ton Sandblast Unit',
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
  'Almand Heater',
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
  'Booster for Lowboy',
  'Bus',
  'Cable Clam/Board - LS 98 Linkbelt',
  'Cabbed Argo Side by Side c/w Trailer',
  'Coating Pre-Heat Generator & Coil',
  'Coating Truck - 5 Ton',
  'Compressor Hoses - 2" x 50\'',
  'Compressor Trailer',
  'Cradle Bore Machine & Auger',
  'CRC Auto Weld Pack',
  'Crewcab - 1 Ton',
  'Crewcab - 3/4 Ton',
  'Diesel Generator 185Kw',
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
  'Hoe Pac Attachment for Cat 324-336 Hoes',
  'Hoe Ram Attachment for Cat 330/345',
  'Hydraulic Clam - Cat 330 Longstick',
  'Hydraulic Road Sweeper',
  'Hydrovac Truck',
  'Induction Coil',
  'Jeep for Lowboy',
  'Light Tower - 6 kW',
  'Light Tower - 20 kW',
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
  'Panther T8 All Terrain Dump Vehicle',
  'Picker - 45 Ton',
  'Picker Truck - 8 Ton',
  'Picker Truck - 10 Ton',
  'Picker Truck - 12 Ton',
  'Picker Truck - 15 Ton',
  'Picker Truck - 17 Ton',
  'Picker Truck - 25 Ton',
  'Picker Truck - 30 Ton',
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
  'Pole Trailer',
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
  'Skid Truck Tractor',
  'Sled',
  'Slop Tanks',
  'Sno Cat',
  'Sno Cat - Piston Bully PF 300',
  'Snow Making Equipment',
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
  'Swamp Mats (Set of 4)',
  'Swenson Spreader',
  'Tag-A-Long Trailer (6 Ton)',
  'Tag-A-Long Trailer (10 Ton)',
  'Tag-A-Long Trailer (20 Ton)',
  'Tag-A-Long Trailer (Farm Wagon)',
  'Tag-A-Long Trailer (Utility)',
  'Tesmac Ditcher',
  'Test - 1" Squeeze Pump',
  'Test - 3" Squeeze Pump',
  'Test - Boiler',
  'Test - Fill Pump 6 x 6',
  'Test - Fill Pump 8 x 6',
  'Test - Fill Pump 10 x 8',
  'Test - Honda Squeeze Pump',
  'Test Trailer & Instrumentation',
  'Texas Winch Truck',
  'Track Bore Machine & Auger',
  'Track Morooka',
  'Trailer - B-Train',
  'Transition Machine (Includes Power Unit)',
  'Transition Machine (Without Power Unit)',
  'Trombone Trailer',
  'Utility Welder Rig',
  'Viking Power Dozer',
  'Wacker 1301 - Ground Heater and Generator',
  'Warehouse Trailer/Van',
  'Warehouse Trailer/Van Diesel Heated Storage',
  'Wash Unit - Steam, Water Truck',
  'Washroom Trailer',
  'Water Canon',
  'Water Pump - 2"',
  'Water Pump - 3"',
  'Water Pump - 4"',
  'Water Pump - 6"',
  'Water Pump - 8"',
  'Water Pump - 10" Electric',
  'Water Tank Trailer',
  'Water Tank for Test',
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
function createEmptyActivity() {
  return {
    id: Date.now() + Math.random(),
    activityType: '',
    contractor: '',
    foreman: '',
    ticketNumber: '',
    startKP: '',
    endKP: '',
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

function InspectorReport() {
  const { signOut, userProfile } = useAuth()
  const [saving, setSaving] = useState(false)

  // Header fields
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [inspectorName, setInspectorName] = useState('')
  const [spread, setSpread] = useState('')
  const [pipeline, setPipeline] = useState('')
  
  // Weather fields
  const [weather, setWeather] = useState('')
  const [precipitation, setPrecipitation] = useState('')
  const [tempHigh, setTempHigh] = useState('')
  const [tempLow, setTempLow] = useState('')
  const [windSpeed, setWindSpeed] = useState('')
  const [rowCondition, setRowCondition] = useState('')
  const [fetchingWeather, setFetchingWeather] = useState(false)

  // Time tracking
  const [startTime, setStartTime] = useState('')
  const [stopTime, setStopTime] = useState('')

  // Activity blocks (main data structure)
  const [activityBlocks, setActivityBlocks] = useState([createEmptyActivity()])

  // Current labour/equipment entry fields (for each activity block)
  const [currentLabour, setCurrentLabour] = useState({ employeeName: '', classification: '', rt: '', ot: '', jh: '', count: '1' })
  const [currentEquipment, setCurrentEquipment] = useState({ type: '', hours: '', count: '' })

  // General fields
  const [safetyNotes, setSafetyNotes] = useState('')
  const [landEnvironment, setLandEnvironment] = useState('')
  const [generalComments, setGeneralComments] = useState('')
  const [visitors, setVisitors] = useState([])
  const [visitorName, setVisitorName] = useState('')
  const [visitorCompany, setVisitorCompany] = useState('')
  const [visitorPosition, setVisitorPosition] = useState('')

  // Inspector info
  const [inspectorMileage, setInspectorMileage] = useState('')
  const [inspectorEquipment, setInspectorEquipment] = useState([])

  // Voice input
  const [isListening, setIsListening] = useState(null) // Stores field ID that's currently listening
  const [speechSupported, setSpeechSupported] = useState(false)
  const recognitionRef = useRef(null)
  const listeningFieldRef = useRef(null) // Track current field in a ref for the callback

  // OCR Ticket Scanning
  const [scanningBlock, setScanningBlock] = useState(null)

  // Convert image file to base64
  async function imageToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Scan contractor ticket using Claude Vision
  async function scanTicketWithOCR(blockId) {
    const block = activityBlocks.find(b => b.id === blockId)
    if (!block?.ticketPhoto) {
      alert('Please upload a ticket photo first')
      return
    }

    if (!anthropicApiKey) {
      alert('Claude API key not configured. Add VITE_ANTHROPIC_API_KEY to your .env file.')
      return
    }

    setScanningBlock(blockId)
    console.log('Starting OCR scan for block:', blockId)

    try {
      const base64Image = await imageToBase64(block.ticketPhoto)
      const mediaType = block.ticketPhoto.type || 'image/jpeg'
      console.log('Image converted to base64, type:', mediaType)

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Image
                }
              },
              {
                type: 'text',
                text: `Analyze this contractor daily ticket/timesheet. Extract the following information and return it as JSON only (no other text):

{
  "contractor": "contractor company name if visible",
  "foreman": "foreman name if visible",
  "date": "date if visible",
  "personnel": [
    {
      "name": "employee full name",
      "classification": "job title/classification (e.g., PRINCIPAL OPER 1, GENERAL LABOURER, WELDER HELPER)",
      "hours": number of hours worked,
      "jh": number of jump hours/bonus hours if there is a separate JH column (0 if not present),
      "count": 1
    }
  ],
  "equipment": [
    {
      "type": "equipment type/description (e.g., Backhoe - Cat 330, Sideboom - Cat 583)",
      "hours": number of hours,
      "count": 1
    }
  ],
  "workDescription": "brief description of work performed if visible"
}

Important:
- Extract ALL personnel entries you can read
- Extract ALL equipment entries you can read
- Use standard classification names where possible
- If hours aren't clear, estimate based on typical 8-10 hour days
- JH (Jump Hours) is bonus hours - only include if there's a separate JH column on the ticket
- Return ONLY the JSON object, no explanation`
              }
            ]
          }]
        })
      })

      console.log('API response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error:', errorText)
        throw new Error(`API request failed: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      console.log('API response data:', data)
      
      const content = data.content[0]?.text || ''
      console.log('Extracted content:', content)
      
      // Parse JSON from response
      let extracted
      try {
        // Try to extract JSON from the response (in case there's extra text)
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          extracted = JSON.parse(jsonMatch[0])
          console.log('Parsed extracted data:', extracted)
        } else {
          throw new Error('No JSON found in response')
        }
      } catch (parseError) {
        console.error('Failed to parse OCR response:', content, parseError)
        alert('Could not parse ticket data. Response was:\n\n' + content.substring(0, 500))
        setScanningBlock(null)
        return
      }

      // Update block with extracted data
      setActivityBlocks(blocks => blocks.map(b => {
        if (b.id !== blockId) return b

        const updatedBlock = { ...b }

        // Update contractor and foreman if found
        if (extracted.contractor) {
          updatedBlock.contractor = extracted.contractor
          console.log('Set contractor:', extracted.contractor)
        }
        if (extracted.foreman) {
          updatedBlock.foreman = extracted.foreman
          console.log('Set foreman:', extracted.foreman)
        }
        if (extracted.workDescription) {
          updatedBlock.workDescription = updatedBlock.workDescription 
            ? updatedBlock.workDescription + '\n' + extracted.workDescription 
            : extracted.workDescription
          console.log('Set workDescription:', extracted.workDescription)
        }

        // Add personnel entries with RT/OT/JH calculation
        if (extracted.personnel && Array.isArray(extracted.personnel)) {
          const newLabourEntries = extracted.personnel.map((p, idx) => {
            const totalHours = parseFloat(p.hours) || 8
            const rt = Math.min(totalHours, 8)
            const ot = Math.max(0, totalHours - 8)
            return {
              id: Date.now() + idx,
              employeeName: p.name || '',
              classification: matchClassification(p.classification) || p.classification || 'GENERAL LABOURER',
              hours: totalHours,
              rt,
              ot,
              jh: parseFloat(p.jh) || 0, // Jump Hours - only if specified on ticket
              count: parseInt(p.count) || 1
            }
          })
          console.log('Adding labour entries:', newLabourEntries)
          updatedBlock.labourEntries = [...(b.labourEntries || []), ...newLabourEntries]
        }

        // Add equipment entries
        if (extracted.equipment && Array.isArray(extracted.equipment)) {
          const newEquipmentEntries = extracted.equipment.map((e, idx) => ({
            id: Date.now() + 1000 + idx,
            type: matchEquipment(e.type) || e.type || 'Other',
            hours: parseFloat(e.hours) || 8,
            count: parseInt(e.count) || 1
          }))
          console.log('Adding equipment entries:', newEquipmentEntries)
          updatedBlock.equipmentEntries = [...(b.equipmentEntries || []), ...newEquipmentEntries]
        }

        console.log('Updated block:', updatedBlock)
        return updatedBlock
      }))

      // Show summary
      const personnelCount = extracted.personnel?.length || 0
      const equipmentCount = extracted.equipment?.length || 0
      alert(`✅ Ticket scanned successfully!\n\nExtracted:\n• ${personnelCount} personnel entries\n• ${equipmentCount} equipment entries\n${extracted.contractor ? '• Contractor: ' + extracted.contractor : ''}\n${extracted.foreman ? '• Foreman: ' + extracted.foreman : ''}\n\nPlease scroll down to review the Manpower and Equipment sections.`)

    } catch (error) {
      console.error('OCR Error:', error)
      alert('Error scanning ticket: ' + error.message)
    }

    setScanningBlock(null)
  }

  // Match extracted classification to our list
  function matchClassification(extracted) {
    if (!extracted) return null
    const upper = extracted.toUpperCase().trim()
    
    // Exact match
    const exact = labourClassifications.find(c => c === upper)
    if (exact) return exact
    
    // Partial match
    const partial = labourClassifications.find(c => 
      c.includes(upper) || upper.includes(c) ||
      c.replace(/[^A-Z0-9]/g, '').includes(upper.replace(/[^A-Z0-9]/g, ''))
    )
    if (partial) return partial
    
    // Keyword matching
    const keywords = {
      'WELDER': 'UTILITY WELDER',
      'OPERATOR': 'PRINCIPAL OPER 1',
      'LABOURER': 'GENERAL LABOURER',
      'LABORER': 'GENERAL LABOURER',
      'FOREMAN': 'GENERAL FOREMAN',
      'DRIVER': 'BUS/ CREWCAB DRIVER',
      'MECHANIC': 'MECHANIC/ SERVICEMAN/ LUBEMAN',
      'HELPER': 'WELDER HELPER',
      'FITTER': 'STRAW - FITTER ON AUTO WELD SPREAD',
      'OILER': 'APPRENTICE OPER/OILER'
    }
    
    for (const [keyword, classification] of Object.entries(keywords)) {
      if (upper.includes(keyword)) return classification
    }
    
    return null
  }

  // Match extracted equipment to our list
  function matchEquipment(extracted) {
    if (!extracted) return null
    const lower = extracted.toLowerCase().trim()
    
    // Exact match (case insensitive)
    const exact = equipmentTypes.find(e => e.toLowerCase() === lower)
    if (exact) return exact
    
    // Partial match
    const partial = equipmentTypes.find(e => 
      e.toLowerCase().includes(lower) || lower.includes(e.toLowerCase())
    )
    if (partial) return partial
    
    // Keyword matching
    const keywords = {
      'backhoe': 'Backhoe - Cat 330 (or equivalent)',
      'excavator': 'Backhoe - Cat 330 (or equivalent)',
      'hoe': 'Backhoe - Cat 330 (or equivalent)',
      'sideboom': 'Sideboom - Cat 583',
      'pipelayer': 'Sideboom - Cat 583',
      'dozer': 'Dozer - D6T (or equivalent)',
      'bulldozer': 'Dozer - D6T (or equivalent)',
      'cat d': 'Dozer - D6T (or equivalent)',
      'grader': 'Grader - Cat G14',
      'loader': 'Loader - Cat 966',
      'picker': 'Picker Truck - 15 Ton',
      'crane': 'Picker Truck - 25 Ton',
      'welder': 'Welding Rig',
      'welding': 'Welding Rig',
      'lincoln': 'Lincoln Welder',
      'truck': 'Pickup - 3/4 Ton',
      'pickup': 'Pickup - 3/4 Ton',
      'water': 'Water Truck',
      'fuel': 'Fuel Truck - Tandem',
      'lowboy': 'Lowboy Trailer',
      'lowbed': 'Lowboy Trailer',
      'trailer': 'Lowboy Trailer',
      'generator': 'Generator - 60 kW',
      'compressor': 'Air Compressor - 900 CFM',
      'atv': 'ATV/Gator',
      'gator': 'ATV/Gator'
    }
    
    for (const [keyword, equipment] of Object.entries(keywords)) {
      if (lower.includes(keyword)) return equipment
    }
    
    return null
  }

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      setSpeechSupported(true)
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true // Get interim results too
      recognition.lang = 'en-US'
      
      // Debug events
      recognition.onstart = () => console.log('🎤 STARTED - speak now!')
      recognition.onaudiostart = () => console.log('🔊 AUDIO CAPTURING')
      recognition.onsoundstart = () => console.log('📢 SOUND DETECTED')
      recognition.onspeechstart = () => console.log('💬 SPEECH DETECTED')
      recognition.onspeechend = () => console.log('💬 SPEECH ENDED')
      
      recognition.onerror = (event) => {
        console.error('❌ Speech error:', event.error)
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please allow microphone access in your browser settings.')
          setIsListening(null)
        } else if (event.error === 'no-speech') {
          console.log('No speech detected, continuing...')
        } else if (event.error === 'aborted') {
          console.log('Speech recognition aborted')
        } else if (event.error === 'network') {
          alert('Network error. Speech recognition requires an internet connection.')
          setIsListening(null)
        } else {
          console.log('Speech error (non-fatal):', event.error)
        }
      }

      recognition.onresult = (event) => {
        const currentField = listeningFieldRef.current
        console.log('📝 RESULT - field:', currentField)
        
        let finalTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          const isFinal = event.results[i].isFinal
          console.log(isFinal ? '✅ FINAL:' : '⏳ INTERIM:', transcript)
          if (isFinal) {
            finalTranscript += transcript
          }
        }
        
        if (finalTranscript && currentField) {
          // Simple text processing
          let processed = finalTranscript.trim()
          if (processed.length > 0) {
            processed = processed.charAt(0).toUpperCase() + processed.slice(1)
          }
          if (processed.length > 0 && !/[.!?,;:\-]$/.test(processed)) {
            processed += '.'
          }
          processed = processed + ' '
          
          console.log('💾 SAVING:', processed, 'to:', currentField)
          
          if (currentField === 'safetyNotes') {
            setSafetyNotes(prev => prev + processed)
          } else if (currentField === 'landEnvironment') {
            setLandEnvironment(prev => prev + processed)
          } else if (currentField === 'generalComments') {
            setGeneralComments(prev => prev + processed)
          } else if (currentField.startsWith('workDescription_')) {
            const blockId = parseFloat(currentField.split('_')[1])
            console.log('Updating workDescription for blockId:', blockId)
            setActivityBlocks(blocks => blocks.map(block => {
              if (block.id === blockId) {
                console.log('Found matching block, appending text')
                return { ...block, workDescription: block.workDescription + processed }
              }
              return block
            }))
          } else if (currentField.startsWith('timeLostDetails_')) {
            const blockId = parseFloat(currentField.split('_')[1])
            setActivityBlocks(blocks => blocks.map(block => {
              if (block.id === blockId) {
                return { ...block, timeLostDetails: (block.timeLostDetails || '') + processed }
              }
              return block
            }))
          }
        }
      }

      recognition.onend = () => {
        const currentField = listeningFieldRef.current
        console.log('🛑 ENDED, field:', currentField)
        // Only restart if we still have a field (not stopped by user)
        if (currentField && recognitionRef.current) {
          try {
            recognitionRef.current.start()
            console.log('🔄 Restarted')
          } catch (e) {
            console.log('Restart error:', e)
          }
        }
      }
      
      recognitionRef.current = recognition
      console.log('✅ Speech recognition ready')
    } else {
      console.log('❌ Speech recognition NOT supported')
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  // Process transcript to add punctuation
  function processTranscript(text, isNewSentence = false) {
    let processed = text.trim()
    
    // Convert spoken punctuation to symbols
    const punctuationMap = {
      ' period': '.',
      ' full stop': '.',
      ' comma': ',',
      ' question mark': '?',
      ' exclamation mark': '!',
      ' exclamation point': '!',
      ' colon': ':',
      ' semicolon': ';',
      ' dash': ' -',
      ' hyphen': '-',
      ' open quote': '"',
      ' close quote': '"',
      ' open parenthesis': '(',
      ' close parenthesis': ')',
      ' new line': '\n',
      ' new paragraph': '\n\n'
    }
    
    Object.entries(punctuationMap).forEach(([spoken, symbol]) => {
      const regex = new RegExp(spoken, 'gi')
      processed = processed.replace(regex, symbol)
    })
    
    // Capitalize first letter if it's a new sentence
    if (isNewSentence && processed.length > 0) {
      processed = processed.charAt(0).toUpperCase() + processed.slice(1)
    }
    
    // Capitalize after periods, question marks, exclamation marks
    processed = processed.replace(/([.!?]\s*)([a-z])/g, (match, punct, letter) => {
      return punct + letter.toUpperCase()
    })
    
    // Add period at end if it doesn't end with punctuation
    if (processed.length > 0 && !/[.!?,;:\-]$/.test(processed)) {
      processed += '.'
    }
    
    return processed + ' '
  }

  // Check if text ends with sentence-ending punctuation
  function endsWithSentence(text) {
    return /[.!?]\s*$/.test(text.trim())
  }

  // Start voice input for a specific field
  function startVoiceInput(fieldId) {
    if (!speechSupported) {
      alert('Speech recognition is not supported in your browser. Try Chrome or Edge.')
      return
    }
    
    if (isListening === fieldId) {
      // Stop listening - DON'T clear the ref yet, let final results come through
      console.log('Stopping voice recognition for:', fieldId)
      setIsListening(null)
      recognitionRef.current.stop()
      
      // Clear the ref after delay to allow final results to save
      setTimeout(() => {
        if (!isListening) { // Only clear if still stopped
          listeningFieldRef.current = null
          console.log('Field ref cleared')
        }
      }, 1000)
    } else {
      // Stop any current listening first
      if (isListening) {
        recognitionRef.current.stop()
      }
      
      // Set field ref and start
      listeningFieldRef.current = fieldId
      console.log('Starting voice recognition for:', fieldId)
      setIsListening(fieldId)
      
      try {
        recognitionRef.current.start()
        console.log('Recognition started')
      } catch (e) {
        if (e.message && e.message.includes('already started')) {
          console.log('Recognition already running')
        } else {
          console.error('Recognition start error:', e)
          alert('Could not start voice recognition: ' + e.message)
          listeningFieldRef.current = null
          setIsListening(null)
        }
      }
    }
  }

  // Voice input button component
  const VoiceButton = ({ fieldId, style }) => (
    <button
      type="button"
      onClick={() => startVoiceInput(fieldId)}
      style={{
        padding: '8px 12px',
        backgroundColor: isListening === fieldId ? '#dc3545' : '#6c757d',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        animation: isListening === fieldId ? 'pulse 1s infinite, recordingPulse 1.5s infinite' : 'none',
        transition: 'all 0.3s ease',
        ...style
      }}
      title={isListening === fieldId ? 'Stop recording' : 'Start voice input'}
    >
      {isListening === fieldId ? '⏹️ Stop' : '🎤 Voice'}
    </button>
  )

  // Chainage overlap warnings
  const [overlapWarnings, setOverlapWarnings] = useState([])
  
  // Existing chainages by activity type (fetched from DB)
  const [existingChainages, setExistingChainages] = useState({})
  // Block-level chainage status (overlap/gap warnings per block)
  const [blockChainageStatus, setBlockChainageStatus] = useState({})
  // Reasons for chainage overlaps/gaps (required before saving)
  const [chainageReasons, setChainageReasons] = useState({}) // { blockId: { overlapReason: '', gapReason: '' } }

  // Helper to parse KP string to metres
  function parseKPToMetres(kpStr) {
    if (!kpStr) return null
    const str = String(kpStr).trim()
    // Handle format like "5+250" (5km + 250m = 5250m)
    if (str.includes('+')) {
      const [km, m] = str.split('+')
      return (parseFloat(km) || 0) * 1000 + (parseFloat(m) || 0)
    }
    // Handle plain number (assume metres or km based on size)
    const num = parseFloat(str)
    if (isNaN(num)) return null
    return num < 100 ? num * 1000 : num
  }

  // Format metres to KP string
  function formatMetresToKP(metres) {
    if (metres === null || metres === undefined) return ''
    const km = Math.floor(metres / 1000)
    const m = Math.round(metres % 1000)
    return `${km}+${m.toString().padStart(3, '0')}`
  }

  // Fetch existing chainages for all activity types
  async function fetchExistingChainages() {
    try {
      const { data: reports, error } = await supabase
        .from('daily_tickets')
        .select('date, activity_blocks')
      
      if (error || !reports) return

      // Build a map of activity type -> array of {start, end, date} ranges
      const chainageMap = {}
      
      reports.forEach(report => {
        const blocks = report.activity_blocks || []
        blocks.forEach(block => {
          if (!block.activityType || !block.startKP || !block.endKP) return
          
          const startM = parseKPToMetres(block.startKP)
          const endM = parseKPToMetres(block.endKP)
          if (startM === null || endM === null) return

          if (!chainageMap[block.activityType]) {
            chainageMap[block.activityType] = []
          }
          
          chainageMap[block.activityType].push({
            start: Math.min(startM, endM),
            end: Math.max(startM, endM),
            startKP: block.startKP,
            endKP: block.endKP,
            date: report.date
          })
        })
      })

      // Sort each activity's ranges by start position
      Object.keys(chainageMap).forEach(activity => {
        chainageMap[activity].sort((a, b) => a.start - b.start)
      })

      setExistingChainages(chainageMap)
      console.log('Loaded existing chainages:', chainageMap)
    } catch (err) {
      console.error('Error fetching chainages:', err)
    }
  }

  // Analyze a block's chainage for overlaps and gaps
  function analyzeBlockChainage(block) {
    const result = {
      hasOverlap: false,
      hasGap: false,
      overlaps: [],
      gaps: [],
      suggestedStartKP: null,
      coverage: []
    }

    if (!block.activityType) return result

    const existingRanges = existingChainages[block.activityType] || []
    
    // Calculate suggested next start KP (where last work ended)
    if (existingRanges.length > 0) {
      const lastEnd = Math.max(...existingRanges.map(r => r.end))
      result.suggestedStartKP = formatMetresToKP(lastEnd)
      result.coverage = existingRanges
    }

    // If no KP entered yet, just return suggestions
    if (!block.startKP || !block.endKP) return result

    const blockStart = parseKPToMetres(block.startKP)
    const blockEnd = parseKPToMetres(block.endKP)
    if (blockStart === null || blockEnd === null) return result

    const blockMin = Math.min(blockStart, blockEnd)
    const blockMax = Math.max(blockStart, blockEnd)

    // Check for overlaps with existing ranges
    existingRanges.forEach(range => {
      if (blockMin < range.end && range.start < blockMax) {
        result.hasOverlap = true
        result.overlaps.push({
          range,
          overlapStart: Math.max(blockMin, range.start),
          overlapEnd: Math.min(blockMax, range.end)
        })
      }
    })

    // Check for gaps - find if there's uncovered chainage before this block's start
    if (existingRanges.length > 0 && blockMin > 0) {
      // Merge existing ranges to find coverage
      const merged = mergeRanges(existingRanges)
      
      // Check if there's a gap between last coverage and this block's start
      const lastCoveredEnd = merged.length > 0 ? Math.max(...merged.map(r => r.end)) : 0
      
      if (blockMin > lastCoveredEnd + 10) { // 10m tolerance
        result.hasGap = true
        result.gaps.push({
          start: lastCoveredEnd,
          end: blockMin,
          startKP: formatMetresToKP(lastCoveredEnd),
          endKP: formatMetresToKP(blockMin),
          metres: blockMin - lastCoveredEnd
        })
      }
    }

    return result
  }

  // Merge overlapping ranges into continuous coverage
  function mergeRanges(ranges) {
    if (ranges.length === 0) return []
    
    const sorted = [...ranges].sort((a, b) => a.start - b.start)
    const merged = [{ ...sorted[0] }]
    
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const last = merged[merged.length - 1]
      
      if (current.start <= last.end + 10) { // 10m tolerance for "continuous"
        last.end = Math.max(last.end, current.end)
      } else {
        merged.push({ ...current })
      }
    }
    
    return merged
  }

  // Update block chainage status when blocks or existing chainages change
  useEffect(() => {
    const newStatus = {}
    activityBlocks.forEach(block => {
      newStatus[block.id] = analyzeBlockChainage(block)
    })
    setBlockChainageStatus(newStatus)
  }, [activityBlocks, existingChainages])

  // Fetch existing chainages on mount and when date changes
  useEffect(() => {
    fetchExistingChainages()
  }, [selectedDate])

  // Check for chainage overlaps within current report
  function checkChainageOverlaps(blocks) {
    const warnings = []
    
    // Group blocks by activity type
    const byActivity = {}
    blocks.forEach((block, idx) => {
      if (!block.activityType || !block.startKP || !block.endKP) return
      if (!byActivity[block.activityType]) byActivity[block.activityType] = []
      byActivity[block.activityType].push({
        index: idx + 1,
        start: parseKPToMetres(block.startKP),
        end: parseKPToMetres(block.endKP),
        startKP: block.startKP,
        endKP: block.endKP
      })
    })

    // Check for overlaps within each activity type
    Object.entries(byActivity).forEach(([activity, ranges]) => {
      for (let i = 0; i < ranges.length; i++) {
        for (let j = i + 1; j < ranges.length; j++) {
          const a = ranges[i]
          const b = ranges[j]
          if (a.start === null || a.end === null || b.start === null || b.end === null) continue
          
          // Normalize ranges (start should be less than end)
          const aMin = Math.min(a.start, a.end)
          const aMax = Math.max(a.start, a.end)
          const bMin = Math.min(b.start, b.end)
          const bMax = Math.max(b.start, b.end)
          
          // Check for overlap
          if (aMin < bMax && bMin < aMax) {
            warnings.push({
              type: 'current',
              activity,
              message: `⚠️ ${activity}: Activity #${a.index} (${a.startKP}-${a.endKP}) overlaps with Activity #${b.index} (${b.startKP}-${b.endKP})`
            })
          }
        }
      }
    })

    return warnings
  }

  // Check for overlaps with historical data
  async function checkHistoricalOverlaps(blocks) {
    const warnings = []
    
    // Get unique activity types with KP data
    const activitiesToCheck = blocks.filter(b => b.activityType && b.startKP && b.endKP)
    console.log('Activities to check for overlaps:', activitiesToCheck.length)
    if (activitiesToCheck.length === 0) return warnings

    try {
      // Fetch existing reports
      const { data: existingReports, error } = await supabase
        .from('daily_tickets')
        .select('date, spread, activity_blocks')
        .neq('date', selectedDate) // Exclude current date

      console.log('Fetched existing reports:', existingReports?.length || 0, 'Error:', error)
      if (error || !existingReports) return warnings

      // Check each current block against historical data
      activitiesToCheck.forEach(block => {
        const blockStart = parseKPToMetres(block.startKP)
        const blockEnd = parseKPToMetres(block.endKP)
        console.log(`Checking ${block.activityType}: ${block.startKP} (${blockStart}m) - ${block.endKP} (${blockEnd}m)`)
        if (blockStart === null || blockEnd === null) return

        const blockMin = Math.min(blockStart, blockEnd)
        const blockMax = Math.max(blockStart, blockEnd)

        existingReports.forEach(report => {
          const histBlocks = report.activity_blocks || []
          histBlocks.forEach(histBlock => {
            if (histBlock.activityType !== block.activityType) return
            
            const histStart = parseKPToMetres(histBlock.startKP)
            const histEnd = parseKPToMetres(histBlock.endKP)
            if (histStart === null || histEnd === null) return

            const histMin = Math.min(histStart, histEnd)
            const histMax = Math.max(histStart, histEnd)

            console.log(`  Comparing to ${report.date}: ${histBlock.startKP}-${histBlock.endKP} (${histMin}-${histMax}m)`)

            // Check for overlap
            if (blockMin < histMax && histMin < blockMax) {
              console.log('  ⚠️ OVERLAP DETECTED!')
              warnings.push({
                type: 'historical',
                activity: block.activityType,
                message: `⚠️ ${block.activityType}: KP ${block.startKP}-${block.endKP} overlaps with report from ${report.date} (${histBlock.startKP}-${histBlock.endKP})`
              })
            }
          })
        })
      })
    } catch (err) {
      console.error('Error checking historical overlaps:', err)
    }

    console.log('Total overlap warnings:', warnings.length)
    return warnings
  }

  // Load project config
  useEffect(() => {
    const saved = localStorage.getItem('projectConfig')
    if (saved) {
      const config = JSON.parse(saved)
      if (config.projectName) setPipeline(config.projectName)
      if (config.inspectorName) setInspectorName(config.inspectorName)
      if (config.defaultSpread) setSpread(config.defaultSpread)
    }
  }, [])

  // Fetch weather
  async function fetchWeather() {
    if (!pipeline || !pipelineLocations[pipeline]) {
      alert('Please select a pipeline first')
      return
    }
    
    setFetchingWeather(true)
    const loc = pipelineLocations[pipeline]
    
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${loc.lat}&lon=${loc.lon}&appid=${weatherApiKey}&units=metric`
      )
      const data = await response.json()
      
      setWeather(data.weather[0].main)
      setTempHigh(Math.round(data.main.temp_max))
      setTempLow(Math.round(data.main.temp_min))
      setWindSpeed(Math.round(data.wind.speed * 3.6)) // Convert m/s to km/h
      setPrecipitation(data.rain ? data.rain['1h'] || 0 : 0)
    } catch (error) {
      console.error('Weather fetch error:', error)
      alert('Failed to fetch weather data')
    }
    setFetchingWeather(false)
  }

  // Activity block management
  function addActivityBlock() {
    setActivityBlocks([...activityBlocks, createEmptyActivity()])
  }

  function removeActivityBlock(blockId) {
    if (activityBlocks.length === 1) {
      alert('You must have at least one activity')
      return
    }
    setActivityBlocks(activityBlocks.filter(b => b.id !== blockId))
  }

  function updateActivityBlock(blockId, field, value) {
    const updatedBlocks = activityBlocks.map(block => 
      block.id === blockId ? { ...block, [field]: value } : block
    )
    setActivityBlocks(updatedBlocks)
    
    // Check for overlaps when KP or activity type changes
    if (field === 'startKP' || field === 'endKP' || field === 'activityType') {
      const warnings = checkChainageOverlaps(updatedBlocks)
      setOverlapWarnings(warnings)
    }
  }

  function updateQualityData(blockId, fieldName, value) {
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          qualityData: { ...block.qualityData, [fieldName]: value }
        }
      }
      return block
    }))
  }

  function updateWeldData(blockId, weldData) {
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          weldData: weldData
        }
      }
      return block
    }))
  }


  function updateBendData(blockId, bendData) {
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          bendData: bendData
        }
      }
      return block
    }))
  }
  // Labour management for activity blocks
  // RT = Regular Time, OT = Overtime, JH = Jump Hours (bonus)
  function addLabourToBlock(blockId, employeeName, classification, rt, ot, jh, count) {
    if (!classification || (!rt && !ot && !jh)) {
      alert('Please enter classification and at least one hour type (RT, OT, or JH)')
      return
    }
    const rtVal = parseFloat(rt) || 0
    const otVal = parseFloat(ot) || 0
    const jhVal = parseFloat(jh) || 0
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: [...block.labourEntries, {
            id: Date.now(),
            employeeName: employeeName || '',
            classification,
            hours: rtVal + otVal, // Keep total for backwards compatibility
            rt: rtVal,
            ot: otVal,
            jh: jhVal,
            count: parseInt(count) || 1
          }]
        }
      }
      return block
    }))
  }

  // Update JH (Jump Hours) for a specific labour entry
  function updateLabourJH(blockId, labourId, jhValue) {
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: block.labourEntries.map(entry => 
            entry.id === labourId ? { ...entry, jh: parseFloat(jhValue) || 0 } : entry
          )
        }
      }
      return block
    }))
  }

  function removeLabourFromBlock(blockId, labourId) {
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: block.labourEntries.filter(l => l.id !== labourId)
        }
      }
      return block
    }))
  }

  // Equipment management for activity blocks
  function addEquipmentToBlock(blockId, type, hours, count) {
    if (!type || !hours) {
      alert('Please enter equipment type and hours')
      return
    }
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          equipmentEntries: [...block.equipmentEntries, {
            id: Date.now(),
            type,
            hours: parseFloat(hours),
            count: parseInt(count) || 1
          }]
        }
      }
      return block
    }))
  }

  function removeEquipmentFromBlock(blockId, equipmentId) {
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          equipmentEntries: block.equipmentEntries.filter(e => e.id !== equipmentId)
        }
      }
      return block
    }))
  }

  // Photo handling for activity blocks
  function handleTicketPhotoSelect(blockId, event) {
    const file = event.target.files[0]
    if (file) {
      updateActivityBlock(blockId, 'ticketPhoto', file)
    }
  }

  function handleWorkPhotosSelect(blockId, event) {
    const files = Array.from(event.target.files)
    const newPhotos = files.map(file => ({
      file: file,
      location: '',
      description: ''
    }))
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          workPhotos: [...block.workPhotos, ...newPhotos]
        }
      }
      return block
    }))
  }

  function updatePhotoMetadata(blockId, photoIndex, field, value) {
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        const updatedPhotos = [...block.workPhotos]
        updatedPhotos[photoIndex] = { ...updatedPhotos[photoIndex], [field]: value }
        return { ...block, workPhotos: updatedPhotos }
      }
      return block
    }))
  }

  function removeWorkPhoto(blockId, photoIndex) {
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          workPhotos: block.workPhotos.filter((_, i) => i !== photoIndex)
        }
      }
      return block
    }))
  }

  // Visitors
  function addVisitor() {
    if (!visitorName) {
      alert('Please enter visitor name')
      return
    }
    setVisitors([...visitors, { name: visitorName, company: visitorCompany, position: visitorPosition }])
    setVisitorName('')
    setVisitorCompany('')
    setVisitorPosition('')
  }

  // Save report
  async function saveReport(alsoExport = false) {
    if (!selectedDate || !inspectorName) {
      alert('Please fill in date and inspector name')
      return
    }

    // Check if any blocks have overlaps/gaps without required reasons
    const missingReasons = []
    for (const block of activityBlocks) {
      const status = blockChainageStatus[block.id]
      if (status?.hasOverlap && !chainageReasons[block.id]?.overlapReason) {
        missingReasons.push(`Activity "${block.activityType || 'Unnamed'}": Missing reason for OVERLAP`)
      }
      if (status?.hasGap && !chainageReasons[block.id]?.gapReason) {
        missingReasons.push(`Activity "${block.activityType || 'Unnamed'}": Missing reason for GAP`)
      }
    }

    if (missingReasons.length > 0) {
      alert(
        '⛔ CANNOT SAVE - Missing Required Information\n\n' +
        'The following chainage issues require a reason:\n\n' +
        missingReasons.join('\n') +
        '\n\nPlease scroll up and provide reasons for all detected overlaps and gaps before saving.'
      )
      return
    }

    // Check for current report overlaps (between activity blocks in this report)
    const currentWarnings = checkChainageOverlaps(activityBlocks)
    if (currentWarnings.length > 0) {
      const proceed = confirm(
        'Chainage overlaps detected in current report:\n\n' +
        currentWarnings.map(w => w.message).join('\n') +
        '\n\nDo you want to continue saving anyway?'
      )
      if (!proceed) return
    }

    setSaving(true)

    try {
      // Check for historical overlaps with previously saved reports
      const historicalWarnings = await checkHistoricalOverlaps(activityBlocks)
      console.log('Historical overlap check complete. Warnings found:', historicalWarnings.length)
      
      if (historicalWarnings.length > 0) {
        setSaving(false)
        
        // Show warning in UI
        setOverlapWarnings(prev => [...prev, ...historicalWarnings])
        
        const warningMessages = historicalWarnings.slice(0, 10).map(w => w.message).join('\n')
        const moreCount = historicalWarnings.length > 10 ? `\n... and ${historicalWarnings.length - 10} more overlaps` : ''
        
        const proceed = confirm(
          '⚠️ CHAINAGE OVERLAP WARNING ⚠️\n\n' +
          'The following chainages overlap with previously saved reports:\n\n' +
          warningMessages + moreCount +
          '\n\nThis may indicate duplicate work entries.\n\nClick OK to save anyway, or Cancel to go back and fix.'
        )
        if (!proceed) return
        setSaving(true)
      }

      // If also exporting, do export first while data is in state
      if (alsoExport) {
        await exportToExcel()
      }

      // Upload photos for each activity block
      const processedBlocks = []
      
      for (const block of activityBlocks) {
        let ticketPhotoFileName = null
        const workPhotoData = []

        // Upload ticket photo
        if (block.ticketPhoto) {
          const fileExt = block.ticketPhoto.name.split('.').pop()
          ticketPhotoFileName = `ticket_${Date.now()}_${block.id}.${fileExt}`
          const { error: uploadError } = await supabase.storage
            .from('ticket-photos')
            .upload(ticketPhotoFileName, block.ticketPhoto)
          if (uploadError) {
            console.error('Ticket photo upload error:', uploadError)
          }
        }

        // Upload work photos
        for (let i = 0; i < block.workPhotos.length; i++) {
          const photo = block.workPhotos[i]
          const fileExt = photo.file.name.split('.').pop()
          const fileName = `work_${Date.now()}_${block.id}_${i}.${fileExt}`
          const { error: uploadError } = await supabase.storage
            .from('work-photos')
            .upload(fileName, photo.file)
          
          if (uploadError) {
            console.error('Work photo upload error:', uploadError)
            alert(`Failed to upload photo "${photo.file.name}": ${uploadError.message}`)
          } else {
            workPhotoData.push({
              filename: fileName,
              originalName: photo.file.name,
              location: photo.location,
              description: photo.description,
              inspector: inspectorName,
              date: selectedDate,
              spread: spread
            })
          }
        }

        processedBlocks.push({
          activityType: block.activityType,
          contractor: block.contractor,
          foreman: block.foreman,
          ticketPhoto: ticketPhotoFileName,
          startKP: block.startKP,
          endKP: block.endKP,
          workDescription: block.workDescription,
          labourEntries: block.labourEntries,
          equipmentEntries: block.equipmentEntries,
          qualityData: block.qualityData,
          workPhotos: workPhotoData,
          timeLostReason: block.timeLostReason,
          timeLostHours: block.timeLostHours,
          timeLostDetails: block.timeLostDetails,
          chainageOverlapReason: chainageReasons[block.id]?.overlapReason || null,
          chainageGapReason: chainageReasons[block.id]?.gapReason || null
        })
      }

      // Save to database
      const { error: dbError } = await supabase.from('daily_tickets').insert([{
        date: selectedDate,
        spread: spread,
        inspector_name: inspectorName,
        pipeline: pipeline,
        weather: weather,
        precipitation: parseFloat(precipitation) || 0,
        temp_high: parseFloat(tempHigh) || null,
        temp_low: parseFloat(tempLow) || null,
        wind_speed: parseFloat(windSpeed) || null,
        row_condition: rowCondition,
        start_time: startTime || null,
        stop_time: stopTime || null,
        activity_blocks: processedBlocks,
        safety_notes: safetyNotes,
        land_environment: landEnvironment,
        general_comments: generalComments,
        visitors: visitors,
        inspector_mileage: parseFloat(inspectorMileage) || null,
        inspector_equipment: inspectorEquipment
      }])

      if (dbError) throw dbError

      alert('Report saved successfully!')

      // Clear form
      setActivityBlocks([createEmptyActivity()])
      setVisitors([])
      setSafetyNotes('')
      setLandEnvironment('')
      setGeneralComments('')
      setInspectorMileage('')

    } catch (error) {
      console.error('Save error:', error)
      alert('Error saving report: ' + error.message)
    }

    setSaving(false)
  }

  // Export to Excel
  async function exportToExcel() {
    const data = []
    
    // Header info
    data.push([`${PROJECT_NAME} – DAILY INSPECTOR REPORT`])
    data.push([''])
    data.push(['Date:', selectedDate, '', 'Inspector:', inspectorName])
    data.push(['Pipeline:', pipeline, '', 'Spread:', spread])
    data.push(['Start Time:', startTime, '', 'Stop Time:', stopTime])
    data.push([''])
    data.push(['WEATHER'])
    data.push(['Conditions:', weather, 'Precipitation:', precipitation + ' mm'])
    data.push(['High:', tempHigh + '°C', 'Low:', tempLow + '°C', 'Wind:', windSpeed + ' km/h'])
    data.push(['ROW Condition:', rowCondition])
    data.push([''])

    // Activity blocks
    activityBlocks.forEach((block, blockIndex) => {
      data.push(['═══════════════════════════════════════════════════════════'])
      data.push([`ACTIVITY ${blockIndex + 1}: ${block.activityType || 'Not Selected'}`])
      data.push(['═══════════════════════════════════════════════════════════'])
      data.push(['Contractor:', block.contractor, 'Foreman:', block.foreman])
      data.push(['Start KP:', block.startKP, 'End KP:', block.endKP])
      
      // Chainage reasons if any
      const overlapReason = chainageReasons[block.id]?.overlapReason
      const gapReason = chainageReasons[block.id]?.gapReason
      if (overlapReason) {
        data.push(['⚠️ Overlap Reason:', overlapReason])
      }
      if (gapReason) {
        data.push(['📍 Gap Reason:', gapReason])
      }
      
      data.push(['Work Description:', block.workDescription])
      data.push([''])

      // Quality data
      if (block.activityType && qualityFieldsByActivity[block.activityType]) {
        data.push(['QUALITY CHECKS:'])
        qualityFieldsByActivity[block.activityType].forEach(field => {
          const value = block.qualityData[field.name] || 'N/A'
          data.push([field.label + ':', value])
        })
        data.push([''])
      }

      // Labour
      if (block.labourEntries.length > 0) {
        data.push(['MANPOWER:'])
        data.push(['Employee', 'Classification', 'RT', 'OT', 'JH', 'Count'])
        block.labourEntries.forEach(entry => {
          const rt = entry.rt !== undefined ? entry.rt : Math.min(entry.hours || 0, 8)
          const ot = entry.ot !== undefined ? entry.ot : Math.max(0, (entry.hours || 0) - 8)
          const jh = entry.jh || 0
          data.push([entry.employeeName || '', entry.classification, rt, ot, jh, entry.count])
        })
        data.push([''])
      }

      // Equipment
      if (block.equipmentEntries.length > 0) {
        data.push(['EQUIPMENT:'])
        data.push(['Type', 'Hours', 'Count'])
        block.equipmentEntries.forEach(entry => {
          data.push([entry.type, entry.hours, entry.count])
        })
        data.push([''])
      }

      // Time Lost (per activity)
      if (block.timeLostReason) {
        data.push(['TIME LOST:'])
        data.push(['Reason:', block.timeLostReason, 'Hours:', block.timeLostHours || '0'])
        data.push(['Details:', block.timeLostDetails || 'N/A'])
        data.push([''])
      }

      // Photos
      if (block.workPhotos.length > 0) {
        data.push(['WORK PHOTOS:'])
        data.push(['Filename', 'Location (KP)', 'Description'])
        block.workPhotos.forEach(photo => {
          data.push([photo.file.name, photo.location || 'N/A', photo.description || 'N/A'])
        })
        data.push([''])
      }
    })

    // General sections
    data.push([''])
    data.push(['SAFETY NOTES:', safetyNotes || 'None'])
    data.push(['LAND/ENVIRONMENT:', landEnvironment || 'None'])
    data.push(['GENERAL COMMENTS:', generalComments || 'None'])

    // Visitors
    if (visitors.length > 0) {
      data.push([''])
      data.push(['VISITORS:'])
      data.push(['Name', 'Company', 'Position'])
      visitors.forEach(v => {
        data.push([v.name, v.company, v.position])
      })
    }

    // Inspector info
    data.push([''])
    data.push(['INSPECTOR INFO'])
    data.push(['Mileage:', inspectorMileage || 'N/A'])
    data.push(['Equipment:', inspectorEquipment.join(', ') || 'None'])

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [
      { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 20 }
    ]
    
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Report')

    // Photo log tab
    const allPhotos = []
    activityBlocks.forEach((block, blockIdx) => {
      if (block.ticketPhoto) {
        allPhotos.push({
          activity: block.activityType,
          type: 'Contractor Ticket',
          filename: block.ticketPhoto.name,
          location: 'N/A',
          description: 'Contractor daily ticket'
        })
      }
      block.workPhotos.forEach(photo => {
        allPhotos.push({
          activity: block.activityType,
          type: 'Work Photo',
          filename: photo.file.name,
          location: photo.location || 'Not specified',
          description: photo.description || 'No description'
        })
      })
    })

    if (allPhotos.length > 0) {
      const photoData = [
        ['PHOTO LOG'],
        [''],
        ['Date:', selectedDate, 'Inspector:', inspectorName],
        [''],
        ['#', 'Activity', 'Type', 'Filename', 'Location (KP)', 'Description']
      ]
      allPhotos.forEach((photo, idx) => {
        photoData.push([idx + 1, photo.activity, photo.type, photo.filename, photo.location, photo.description])
      })
      
      const photoWs = XLSX.utils.aoa_to_sheet(photoData)
      photoWs['!cols'] = [
        { wch: 5 }, { wch: 20 }, { wch: 16 }, { wch: 30 }, { wch: 15 }, { wch: 40 }
      ]
      XLSX.utils.book_append_sheet(wb, photoWs, 'Photo Log')
    }

    // Generate file
    const filename = `${PROJECT_SHORT}_Daily_Report_${selectedDate}_Spread_${spread || 'All'}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // Export to PDF - Professional Pipe-Up branded layout
  async function exportToPDF() {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15
    const contentWidth = pageWidth - (margin * 2)
    let y = 0

    // PIPE-UP BRAND COLORS
    const BRAND = {
      navy: [10, 22, 40],
      navyLight: [26, 54, 93],
      orange: [245, 158, 11],
      orangeLight: [254, 243, 199],
      gray: [107, 114, 128],
      grayLight: [249, 250, 251],
      grayMid: [229, 231, 235],
      white: [255, 255, 255],
      black: [0, 0, 0],
      green: [16, 185, 129],
      greenLight: [220, 252, 231],
      blue: [59, 130, 246],
      blueLight: [219, 234, 254],
      red: [239, 68, 68],
      redLight: [254, 226, 226],
    }

    const setColor = (color, type = 'fill') => {
      if (type === 'fill') doc.setFillColor(color[0], color[1], color[2])
      else if (type === 'text') doc.setTextColor(color[0], color[1], color[2])
      else if (type === 'draw') doc.setDrawColor(color[0], color[1], color[2])
    }

    const checkPageBreak = (neededSpace = 30) => {
      if (y > pageHeight - neededSpace - 15) {  // Extra 15 for footer clearance
        doc.addPage()
        addHeader()
        y = 45
      }
    }

    const addHeader = () => {
      setColor(BRAND.navy, 'fill')
      doc.rect(0, 0, pageWidth, 32, 'F')
      setColor(BRAND.orange, 'fill')
      doc.rect(0, 32, pageWidth, 3, 'F')
      setColor(BRAND.white, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('PIPE-UP', margin, 14)
      doc.setFontSize(14)
      doc.text('DAILY INSPECTOR REPORT', margin, 25)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(PROJECT_SHORT || 'EGP', pageWidth - margin, 14, { align: 'right' })
      doc.setFontSize(8)
      doc.text(selectedDate || '', pageWidth - margin, 22, { align: 'right' })
    }

    const addFooter = (pageNum, totalPages) => {
      const footerY = pageHeight - 8
      setColor(BRAND.grayMid, 'draw')
      doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3)
      setColor(BRAND.gray, 'text')
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text('pipe-up.ca', margin, footerY)
      doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, footerY, { align: 'center' })
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, footerY, { align: 'right' })
    }

    const addSectionHeader = (title, bgColor = BRAND.navyLight) => {
      checkPageBreak(25)
      y += 3
      setColor(bgColor, 'fill')
      doc.roundedRect(margin, y, contentWidth, 7, 1, 1, 'F')
      setColor(BRAND.white, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text(title, margin + 4, y + 5)
      y += 10
    }

    const addSubHeader = (title, bgColor = BRAND.grayLight) => {
      checkPageBreak(15)
      setColor(bgColor, 'fill')
      doc.rect(margin, y, contentWidth, 5, 'F')
      setColor(BRAND.navy, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text(title, margin + 2, y + 3.5)
      y += 7
    }

    // Horizontal label: value format on same line
    const addField = (label, value, x, labelWidth = 35) => {
      setColor(BRAND.gray, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(label + ':', x, y)
      setColor(BRAND.black, 'text')
      doc.setFont('helvetica', 'bold')
      doc.text(String(value || 'N/A'), x + labelWidth, y)
    }

    // BUILD PDF
    addHeader()
    y = 42

    // ═══════════════════════════════════════════════════════════
    // REPORT INFO - Two column layout
    // ═══════════════════════════════════════════════════════════
    setColor(BRAND.grayLight, 'fill')
    doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'F')
    setColor(BRAND.grayMid, 'draw')
    doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'S')
    
    const leftCol = margin + 5
    const rightCol = pageWidth / 2 + 5
    
    y += 6
    addField('Date', selectedDate, leftCol, 28)
    addField('Inspector', inspectorName, rightCol, 28)
    y += 6
    addField('Spread', spread, leftCol, 28)
    addField('Pipeline', pipeline, rightCol, 28)
    y += 6
    addField('Start Time', startTime, leftCol, 28)
    addField('End Time', stopTime, rightCol, 28)
    y += 14

    // ═══════════════════════════════════════════════════════════
    // WEATHER
    // ═══════════════════════════════════════════════════════════
    addSectionHeader('WEATHER CONDITIONS', BRAND.blue)
    
    setColor(BRAND.blueLight, 'fill')
    doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'F')
    y += 5
    addField('Conditions', weather, leftCol, 30)
    addField('Precipitation', `${precipitation || '0'} mm`, rightCol, 35)
    y += 6
    addField('High / Low', `${tempHigh || '--'}°C / ${tempLow || '--'}°C`, leftCol, 30)
    addField('Wind', `${windSpeed || '--'} km/h`, rightCol, 35)
    y += 8

    // ═══════════════════════════════════════════════════════════
    // ACTIVITIES
    // ═══════════════════════════════════════════════════════════
    activityBlocks.forEach((block, idx) => {
      checkPageBreak(60)
      
      // Activity header bar
      y += 3
      setColor(BRAND.green, 'fill')
      doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
      
      // Number badge
      setColor(BRAND.white, 'fill')
      doc.circle(margin + 7, y + 4, 3.5, 'F')
      setColor(BRAND.green, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text(String(idx + 1), margin + 7, y + 5.2, { align: 'center' })
      
      // Activity title
      setColor(BRAND.white, 'text')
      doc.setFontSize(10)
      doc.text(block.activityType || 'Activity Not Selected', margin + 14, y + 5.5)
      y += 11

      // Activity details box
      setColor(BRAND.greenLight, 'fill')
      doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'F')
      y += 5
      addField('Contractor', block.contractor, leftCol, 28)
      addField('Foreman', block.foreman, rightCol, 28)
      y += 6
      addField('Start KP', block.startKP, leftCol, 28)
      addField('End KP', block.endKP, rightCol, 28)
      y += 6

      // Chainage warnings
      const overlapReason = chainageReasons[block.id]?.overlapReason
      const gapReason = chainageReasons[block.id]?.gapReason
      
      if (overlapReason) {
        checkPageBreak(12)
        setColor(BRAND.redLight, 'fill')
        doc.roundedRect(margin, y, contentWidth, 7, 1, 1, 'F')
        setColor(BRAND.red, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text('OVERLAP: ' + overlapReason.substring(0, 80), margin + 3, y + 4.5)
        y += 9
      }
      if (gapReason) {
        checkPageBreak(12)
        setColor(BRAND.orangeLight, 'fill')
        doc.roundedRect(margin, y, contentWidth, 7, 1, 1, 'F')
        setColor(BRAND.orange, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text('GAP: ' + gapReason.substring(0, 80), margin + 3, y + 4.5)
        y += 9
      }

      // Work Description
      if (block.workDescription) {
        checkPageBreak(20)
        addSubHeader('Work Description')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        const lines = doc.splitTextToSize(block.workDescription, contentWidth - 6)
        doc.text(lines.slice(0, 4), margin + 3, y)
        y += Math.min(lines.length, 4) * 4 + 2
      }

      // Quality Checks
      if (block.activityType && qualityFieldsByActivity[block.activityType] && Object.keys(block.qualityData || {}).length > 0) {
        checkPageBreak(20)
        addSubHeader('Quality Checks', BRAND.orangeLight)
        const fields = qualityFieldsByActivity[block.activityType]
        let fieldCount = 0
        fields.forEach(field => {
          const value = block.qualityData[field.name]
          if (value) {
            if (fieldCount > 0 && fieldCount % 2 === 0) y += 5
            const col = fieldCount % 2 === 0 ? leftCol : rightCol
            addField(field.label.substring(0, 18), value, col, 45)
            fieldCount++
          }
        })
        y += 6
      }

      // Manpower Table
      if (block.labourEntries?.length > 0) {
        checkPageBreak(30)
        addSubHeader('Manpower', BRAND.greenLight)
        
        // Table header
        setColor(BRAND.green, 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.text('EMPLOYEE', margin + 2, y + 3.5)
        doc.text('CLASSIFICATION', margin + 38, y + 3.5)
        doc.text('RT', pageWidth - margin - 36, y + 3.5)
        doc.text('OT', pageWidth - margin - 26, y + 3.5)
        doc.text('JH', pageWidth - margin - 16, y + 3.5)
        doc.text('QTY', pageWidth - margin - 8, y + 3.5)
        y += 6
        
        // Table rows
        block.labourEntries.forEach((entry, i) => {
          checkPageBreak(8)
          if (i % 2 === 0) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 5, 'F')
          }
          const rt = entry.rt !== undefined ? entry.rt : Math.min(entry.hours || 0, 8)
          const ot = entry.ot !== undefined ? entry.ot : Math.max(0, (entry.hours || 0) - 8)
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.text((entry.employeeName || '-').substring(0, 15), margin + 2, y + 3)
          doc.text((entry.classification || '').substring(0, 18), margin + 38, y + 3)
          doc.text(String(rt || 0), pageWidth - margin - 36, y + 3)
          doc.text(String(ot || 0), pageWidth - margin - 26, y + 3)
          doc.text(String(entry.jh || 0), pageWidth - margin - 16, y + 3)
          doc.text(String(entry.count || 1), pageWidth - margin - 8, y + 3)
          y += 5
        })
        y += 3
      }

      // Equipment Table
      if (block.equipmentEntries?.length > 0) {
        checkPageBreak(30)
        addSubHeader('Equipment', BRAND.blueLight)
        
        // Table header
        setColor(BRAND.blue, 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.text('EQUIPMENT TYPE', margin + 2, y + 3.5)
        doc.text('HOURS', pageWidth - margin - 22, y + 3.5)
        doc.text('QTY', pageWidth - margin - 8, y + 3.5)
        y += 6
        
        // Table rows
        block.equipmentEntries.forEach((entry, i) => {
          checkPageBreak(8)
          if (i % 2 === 0) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 5, 'F')
          }
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.text((entry.type || '').substring(0, 40), margin + 2, y + 3)
          doc.text(String(entry.hours || 0), pageWidth - margin - 22, y + 3)
          doc.text(String(entry.count || 1), pageWidth - margin - 8, y + 3)
          y += 5
        })
        y += 3
      }

      // Time Lost
      if (block.timeLostReason && block.timeLostHours) {
        checkPageBreak(18)
        addSubHeader('Time Lost', BRAND.redLight)
        setColor(BRAND.red, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(`${block.timeLostReason} - ${block.timeLostHours} hours`, margin + 2, y)
        y += 4
        if (block.timeLostDetails) {
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.text(block.timeLostDetails.substring(0, 95), margin + 2, y)
          y += 5
        }
      }
      y += 5
    })

    // ═══════════════════════════════════════════════════════════
    // NOTES
    // ═══════════════════════════════════════════════════════════
    if (safetyNotes || landEnvironment || generalComments) {
      checkPageBreak(45)
      addSectionHeader('NOTES & OBSERVATIONS', BRAND.orange)
      
      if (safetyNotes) {
        checkPageBreak(20)
        addSubHeader('Safety Notes')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const lines = doc.splitTextToSize(safetyNotes, contentWidth - 6)
        doc.text(lines.slice(0, 3), margin + 2, y)
        y += Math.min(lines.length, 3) * 4 + 3
      }
      
      if (landEnvironment) {
        checkPageBreak(20)
        addSubHeader('Land & Environment')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const lines = doc.splitTextToSize(landEnvironment, contentWidth - 6)
        doc.text(lines.slice(0, 3), margin + 2, y)
        y += Math.min(lines.length, 3) * 4 + 3
      }
      
      if (generalComments) {
        checkPageBreak(20)
        addSubHeader('General Comments')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const lines = doc.splitTextToSize(generalComments, contentWidth - 6)
        doc.text(lines.slice(0, 3), margin + 2, y)
        y += Math.min(lines.length, 3) * 4 + 3
      }
    }

    // ═══════════════════════════════════════════════════════════
    // VISITORS
    // ═══════════════════════════════════════════════════════════
    if (visitors?.length > 0) {
      checkPageBreak(25)
      addSectionHeader('SITE VISITORS', BRAND.gray)
      setColor(BRAND.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      visitors.forEach(v => {
        checkPageBreak(6)
        doc.text(`• ${v.name || 'N/A'} - ${v.company || 'N/A'} (${v.position || 'N/A'})`, margin + 2, y)
        y += 5
      })
      y += 2
    }

    // ═══════════════════════════════════════════════════════════
    // INSPECTOR INFO
    // ═══════════════════════════════════════════════════════════
    checkPageBreak(35)  // Ensure enough space for section + footer
    addSectionHeader('INSPECTOR INFORMATION', BRAND.navy)
    
    setColor(BRAND.grayLight, 'fill')
    doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F')
    y += 5
    addField('Mileage', `${inspectorMileage || '0'} km`, leftCol, 25)
    addField('Equipment Used', (inspectorEquipment || []).join(', ') || 'None', rightCol, 40)
    y += 12

    // ═══════════════════════════════════════════════════════════
    // FOOTERS
    // ═══════════════════════════════════════════════════════════
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      addFooter(i, pageCount)
    }

    // SAVE
    const filename = `${PROJECT_SHORT}_Daily_Report_${selectedDate}_${spread || 'Report'}.pdf`
    doc.save(filename)
  }

  // Export Master Production Spreadsheet (CLX2 Format)
  async function exportMasterProduction() {
    // Fetch all reports from database
    const { data: reports, error } = await supabase
      .from('daily_tickets')
      .select('*')
      .order('date', { ascending: true })

    if (error) {
      alert('Error fetching reports: ' + error.message)
      return
    }

    if (!reports || reports.length === 0) {
      alert('No reports found in database')
      return
    }

    // Helper to parse KP string to metres
    const parseKP = (kpStr) => {
      if (!kpStr) return null
      const str = String(kpStr).trim()
      // Handle format like "5+250" (5km + 250m = 5250m)
      if (str.includes('+')) {
        const [km, m] = str.split('+')
        return (parseFloat(km) || 0) * 1000 + (parseFloat(m) || 0)
      }
      // Handle plain number (assume metres or km based on size)
      const num = parseFloat(str)
      if (isNaN(num)) return null
      return num < 100 ? num * 1000 : num // If < 100, assume km
    }

    // Format metres back to KP string
    const formatKP = (metres) => {
      if (metres === null || metres === undefined) return ''
      const km = Math.floor(metres / 1000)
      const m = Math.round(metres % 1000)
      return `${km}+${m.toString().padStart(3, '0')}`
    }

    // Activity types in order for columns
    const phases = [
      'Clearing', 'Access', 'Topsoil', 'Grading', 'Stringing', 'Bending',
      'Welding - Mainline',
  'Welding - Section Crew',
  'Welding - Poor Boy', 'Welding - Tie-in', 'Coating', 'Lowering-in',
      'Backfill', 'Hydro Test', 'Tie-ins', 'Cleanup - Machine', 'Cleanup - Final',
      'HDD', 'HD Bores', 'Other'
    ]

    // Build header row
    const headers = ['Date', 'Spread', 'Inspector']
    phases.forEach(phase => {
      headers.push(`${phase} From`, `${phase} To`, `${phase} M`)
    })
    headers.push('Total Metres', 'Labour Hours', 'Equipment Hours', 'Time Lost')

    // Process reports into rows
    const dataRows = []
    let grandTotalMetres = 0
    let grandTotalLabour = 0
    let grandTotalEquipment = 0
    let grandTotalTimeLost = 0

    // Phase totals for summary
    const phaseTotals = {}
    phases.forEach(p => { phaseTotals[p] = { metres: 0, minKP: null, maxKP: null } })

    reports.forEach(report => {
      const row = [
        report.date || '',
        report.spread || '',
        report.inspector_name || ''
      ]

      let dayTotalMetres = 0
      let dayLabourHours = 0
      let dayEquipmentHours = 0
      let dayTimeLost = 0

      // Get activity blocks (handle both new and old format)
      const blocks = report.activity_blocks || []

      // Build a map of activity data for this report
      const activityMap = {}
      blocks.forEach(block => {
        const actType = block.activityType || 'Other'
        const startM = parseKP(block.startKP)
        const endM = parseKP(block.endKP)
        const metres = (startM !== null && endM !== null) ? Math.abs(endM - startM) : 0

        if (!activityMap[actType]) {
          activityMap[actType] = { startKP: block.startKP, endKP: block.endKP, metres: 0 }
        }
        activityMap[actType].metres += metres

        // Update phase totals
        if (phaseTotals[actType]) {
          phaseTotals[actType].metres += metres
          if (startM !== null) {
            if (phaseTotals[actType].minKP === null || startM < phaseTotals[actType].minKP) {
              phaseTotals[actType].minKP = startM
            }
          }
          if (endM !== null) {
            if (phaseTotals[actType].maxKP === null || endM > phaseTotals[actType].maxKP) {
              phaseTotals[actType].maxKP = endM
            }
          }
        }

        // Calculate labour hours
        if (block.labourEntries) {
          block.labourEntries.forEach(entry => {
            dayLabourHours += (entry.hours || 0) * (entry.count || 1)
          })
        }

        // Calculate equipment hours
        if (block.equipmentEntries) {
          block.equipmentEntries.forEach(entry => {
            dayEquipmentHours += (entry.hours || 0) * (entry.count || 1)
          })
        }

        // Time lost
        dayTimeLost += parseFloat(block.timeLostHours) || 0
      })

      // Add columns for each phase
      phases.forEach(phase => {
        const data = activityMap[phase]
        if (data) {
          row.push(data.startKP || '', data.endKP || '', data.metres || 0)
          dayTotalMetres += data.metres || 0
        } else {
          row.push('', '', '')
        }
      })

      // Add totals columns
      row.push(dayTotalMetres, dayLabourHours.toFixed(1), dayEquipmentHours.toFixed(1), dayTimeLost.toFixed(1))

      grandTotalMetres += dayTotalMetres
      grandTotalLabour += dayLabourHours
      grandTotalEquipment += dayEquipmentHours
      grandTotalTimeLost += dayTimeLost

      dataRows.push(row)
    })

    // Build worksheet data
    const wsData = []
    
    // Title section
    wsData.push([`${PROJECT_NAME} – MASTER PRODUCTION SPREADSHEET`])
    wsData.push([`Generated: ${new Date().toLocaleString()}`])
    wsData.push([`Pipeline: ${pipeline || 'All'}`])
    wsData.push([`Total Reports: ${reports.length}`])
    wsData.push([''])

    // Summary section
    wsData.push(['=== PRODUCTION SUMMARY ==='])
    wsData.push(['Phase', 'From KP', 'To KP', 'Total Metres'])
    phases.forEach(phase => {
      const data = phaseTotals[phase]
      if (data.metres > 0) {
        wsData.push([
          phase,
          formatKP(data.minKP),
          formatKP(data.maxKP),
          data.metres
        ])
      }
    })
    wsData.push(['GRAND TOTAL', '', '', grandTotalMetres])
    wsData.push([''])
    wsData.push(['Total Labour Hours:', grandTotalLabour.toFixed(1)])
    wsData.push(['Total Equipment Hours:', grandTotalEquipment.toFixed(1)])
    wsData.push(['Total Time Lost:', grandTotalTimeLost.toFixed(1)])
    wsData.push([''])

    // Daily detail section
    wsData.push(['=== DAILY PRODUCTION DETAIL ==='])
    wsData.push(headers)
    dataRows.forEach(row => wsData.push(row))

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    
    // Set column widths
    const colWidths = [{ wch: 12 }, { wch: 10 }, { wch: 15 }]
    phases.forEach(() => {
      colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 8 })
    })
    colWidths.push({ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 })
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Production')

    // Add Phase Summary sheet
    const summaryData = [
      ['PHASE PRODUCTION SUMMARY'],
      [''],
      ['Phase', 'Start KP', 'End KP', 'Total Metres', 'Reports']
    ]
    
    phases.forEach(phase => {
      const data = phaseTotals[phase]
      if (data.metres > 0) {
        // Count reports with this activity
        const reportCount = reports.filter(r => 
          (r.activity_blocks || []).some(b => b.activityType === phase)
        ).length
        summaryData.push([
          phase,
          formatKP(data.minKP),
          formatKP(data.maxKP),
          data.metres,
          reportCount
        ])
      }
    })
    summaryData.push([''])
    summaryData.push(['TOTALS', '', '', grandTotalMetres, reports.length])

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
    summaryWs['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    // Generate filename
    const today = new Date().toISOString().split('T')[0]
    const filename = `${PROJECT_SHORT}_Master_Production_Spread_${spread || 'All'}_${today}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // Render quality fields for an activity
  function renderQualityFields(block) {
    if (!block.activityType) {
      return <p style={{ color: '#666', fontStyle: 'italic' }}>Select an activity type to see quality checks</p>
    }

    // Use appropriate weld component based on activity type
    if (block.activityType === 'Welding - Tie-in') {
      return (
        <TieInWeldData
          contractor={block.contractor}
          foreman={block.foreman}
          blockId={block.id}
          reportId={null}
          existingData={block.weldData || {}}
          onDataChange={(data) => updateWeldData(block.id, data)}
        />
      )
    }

    // Use MainlineWeldData for mainline, section crew, and poor boy welding
    if (block.activityType === 'Welding - Mainline' || block.activityType === 'Welding - Section Crew' || block.activityType === 'Welding - Poor Boy') {
      return (
        <MainlineWeldData
          contractor={block.contractor}
          foreman={block.foreman}
          blockId={block.id}
          reportId={null}
          existingData={block.weldData || {}}
          onDataChange={(data) => updateWeldData(block.id, data)}
        />
      )
    }

    // Use BendingLog for bending activity
    if (block.activityType === 'Bending') {
      return (
        <BendingLog
          contractor={block.contractor}
          foreman={block.foreman}
          blockId={block.id}
          reportId={null}
          existingData={block.bendData || {}}
          onDataChange={(data) => updateBendData(block.id, data)}
        />
      )
    }

    // Default quality fields for other activities
    if (!qualityFieldsByActivity[block.activityType]) {
      return <p style={{ color: '#666', fontStyle: 'italic' }}>No quality checks defined for this activity</p>
    }

    const fields = qualityFieldsByActivity[block.activityType]
    
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
        {fields.map(field => (
          <div key={field.name}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>
              {field.label}
            </label>
            {field.type === 'select' ? (
              <select
                value={block.qualityData[field.name] || ''}
                onChange={(e) => updateQualityData(block.id, field.name, e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px' }}
              >
                <option value="">Select...</option>
                {field.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                value={block.qualityData[field.name] || ''}
                onChange={(e) => updateQualityData(block.id, field.name, e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px' }}
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  // Main render
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {/* Voice Input Animation Styles */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes recordingPulse {
          0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(220, 53, 69, 0); }
          100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); }
        }
      `}</style>

      {/* Header */}
      <div style={{ backgroundColor: '#003366', color: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '18px' }}>{PROJECT_NAME}</h1>
          <h2 style={{ margin: '5px 0 0 0', fontSize: '24px' }}>Daily Inspector Report</h2>
        </div>
        <button
          onClick={signOut}
          style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
        >
          Sign Out
        </button>
      </div>

      {/* SECTION 1: HEADER */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
        <div style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, color: '#333' }}>REPORT INFORMATION</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Date *</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Inspector Name *</label>
            <input
              type="text"
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              placeholder="Your name"
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Spread</label>
            <input
              type="text"
              value={spread}
              onChange={(e) => setSpread(e.target.value)}
              placeholder="Spread number"
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Pipeline</label>
            <select
              value={pipeline}
              onChange={(e) => setPipeline(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            >
              <option value="">Select Pipeline</option>
              {Object.keys(pipelineLocations).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Stop Time</label>
            <input
              type="time"
              value={stopTime}
              onChange={(e) => setStopTime(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: WEATHER */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, color: '#333' }}>WEATHER</h2>
          <button
            onClick={fetchWeather}
            disabled={fetchingWeather}
            style={{ padding: '8px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {fetchingWeather ? 'Fetching...' : '🌤️ Auto-Fetch Weather'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Conditions</label>
            <input
              type="text"
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              placeholder="Clear, Cloudy, Rain..."
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Precipitation (mm)</label>
            <input
              type="number"
              value={precipitation}
              onChange={(e) => setPrecipitation(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>High Temp (°C)</label>
            <input
              type="number"
              value={tempHigh}
              onChange={(e) => setTempHigh(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Low Temp (°C)</label>
            <input
              type="number"
              value={tempLow}
              onChange={(e) => setTempLow(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Wind (km/h)</label>
            <input
              type="number"
              value={windSpeed}
              onChange={(e) => setWindSpeed(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>ROW Condition</label>
            <select
              value={rowCondition}
              onChange={(e) => setRowCondition(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            >
              <option value="">Select...</option>
              <option value="Dry">Dry</option>
              <option value="Wet">Wet</option>
              <option value="Muddy">Muddy</option>
              <option value="Frozen">Frozen</option>
              <option value="Snow Covered">Snow Covered</option>
            </select>
          </div>
        </div>
      </div>

      {/* ACTIVITY BLOCKS */}
      {activityBlocks.map((block, blockIndex) => (
        <div key={block.id} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '2px solid #007bff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '15px' }}>
            <h2 style={{ margin: 0, color: '#007bff' }}>
              ACTIVITY {blockIndex + 1}: {block.activityType || '(Select Type)'}
            </h2>
            <button
              onClick={() => removeActivityBlock(block.id)}
              style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              Remove Activity
            </button>
          </div>

          {/* Activity Type & Basic Info */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Activity Type *</label>
              <select
                value={block.activityType}
                onChange={(e) => updateActivityBlock(block.id, 'activityType', e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
              >
                <option value="">Select Activity</option>
                {activityTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Contractor</label>
              <input
                type="text"
                value={block.contractor}
                onChange={(e) => updateActivityBlock(block.id, 'contractor', e.target.value)}
                placeholder="Contractor name"
                style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Foreman</label>
              <input
                type="text"
                value={block.foreman}
                onChange={(e) => updateActivityBlock(block.id, 'foreman', e.target.value)}
                placeholder="Foreman name"
                style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
                Start KP
                {blockChainageStatus[block.id]?.suggestedStartKP && !block.startKP && (
                  <button
                    onClick={() => updateActivityBlock(block.id, 'startKP', blockChainageStatus[block.id].suggestedStartKP)}
                    style={{ marginLeft: '8px', padding: '2px 8px', fontSize: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
                    title="Use suggested start based on last recorded chainage"
                  >
                    Use {blockChainageStatus[block.id].suggestedStartKP}
                  </button>
                )}
              </label>
              <input
                type="text"
                value={block.startKP}
                onChange={(e) => updateActivityBlock(block.id, 'startKP', e.target.value)}
                placeholder="e.g. 5+250"
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  border: blockChainageStatus[block.id]?.hasOverlap ? '2px solid #dc3545' : 
                          blockChainageStatus[block.id]?.hasGap ? '2px solid #ffc107' : '1px solid #ced4da', 
                  borderRadius: '4px',
                  backgroundColor: blockChainageStatus[block.id]?.hasOverlap ? '#fff5f5' : 
                                   blockChainageStatus[block.id]?.hasGap ? '#fffbf0' : 'white'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>End KP</label>
              <input
                type="text"
                value={block.endKP}
                onChange={(e) => updateActivityBlock(block.id, 'endKP', e.target.value)}
                placeholder="e.g. 6+100"
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  border: blockChainageStatus[block.id]?.hasOverlap ? '2px solid #dc3545' : 
                          blockChainageStatus[block.id]?.hasGap ? '2px solid #ffc107' : '1px solid #ced4da', 
                  borderRadius: '4px',
                  backgroundColor: blockChainageStatus[block.id]?.hasOverlap ? '#fff5f5' : 
                                   blockChainageStatus[block.id]?.hasGap ? '#fffbf0' : 'white'
                }}
              />
            </div>
          </div>

          {/* Chainage Status Alerts */}
          {blockChainageStatus[block.id]?.hasOverlap && (
            <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f8d7da', border: '2px solid #dc3545', borderRadius: '6px' }}>
              <strong style={{ color: '#721c24', fontSize: '14px' }}>⚠️ CHAINAGE OVERLAP DETECTED</strong>
              {blockChainageStatus[block.id].overlaps.map((overlap, idx) => (
                <p key={idx} style={{ margin: '8px 0', fontSize: '13px', color: '#721c24' }}>
                  Your range overlaps with {overlap.range.date}: {overlap.range.startKP} - {overlap.range.endKP}
                </p>
              ))}
              <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#fff', borderRadius: '4px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#721c24', marginBottom: '5px' }}>
                  ✍️ Reason for overlap (REQUIRED to save):
                </label>
                <textarea
                  value={chainageReasons[block.id]?.overlapReason || ''}
                  onChange={(e) => setChainageReasons({
                    ...chainageReasons,
                    [block.id]: { ...chainageReasons[block.id], overlapReason: e.target.value }
                  })}
                  placeholder="e.g., Re-work required due to coating damage, Tie-in weld at station..."
                  rows={2}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    border: chainageReasons[block.id]?.overlapReason ? '2px solid #28a745' : '2px solid #dc3545',
                    borderRadius: '4px',
                    fontSize: '13px'
                  }}
                />
                {!chainageReasons[block.id]?.overlapReason && (
                  <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#dc3545', fontWeight: 'bold' }}>
                    ⛔ You must provide a reason before saving the report
                  </p>
                )}
              </div>
            </div>
          )}

          {blockChainageStatus[block.id]?.hasGap && (
            <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#fff3cd', border: '2px solid #ffc107', borderRadius: '6px' }}>
              <strong style={{ color: '#856404', fontSize: '14px' }}>📍 CHAINAGE GAP DETECTED</strong>
              {blockChainageStatus[block.id].gaps.map((gap, idx) => (
                <p key={idx} style={{ margin: '8px 0', fontSize: '13px', color: '#856404' }}>
                  Unrecorded section: {gap.startKP} to {gap.endKP} ({gap.metres}m gap)
                </p>
              ))}
              <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#fff', borderRadius: '4px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#856404', marginBottom: '5px' }}>
                  ✍️ Reason for gap (REQUIRED to save):
                </label>
                <textarea
                  value={chainageReasons[block.id]?.gapReason || ''}
                  onChange={(e) => setChainageReasons({
                    ...chainageReasons,
                    [block.id]: { ...chainageReasons[block.id], gapReason: e.target.value }
                  })}
                  placeholder="e.g., Section completed by another crew, Road crossing permit pending, Wetland area - environmental hold..."
                  rows={2}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    border: chainageReasons[block.id]?.gapReason ? '2px solid #28a745' : '2px solid #ffc107',
                    borderRadius: '4px',
                    fontSize: '13px'
                  }}
                />
                {!chainageReasons[block.id]?.gapReason && (
                  <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#856404', fontWeight: 'bold' }}>
                    ⛔ You must provide a reason before saving the report
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Existing Coverage Info */}
          {block.activityType && blockChainageStatus[block.id]?.coverage?.length > 0 && (
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e7f3ff', border: '1px solid #b8daff', borderRadius: '6px' }}>
              <strong style={{ color: '#004085', fontSize: '12px' }}>📊 Existing {block.activityType} Coverage:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' }}>
                {mergeRanges(blockChainageStatus[block.id].coverage).slice(0, 5).map((range, idx) => (
                  <span key={idx} style={{ padding: '2px 8px', backgroundColor: '#cce5ff', borderRadius: '3px', fontSize: '11px', color: '#004085' }}>
                    {formatMetresToKP(range.start)} → {formatMetresToKP(range.end)}
                  </span>
                ))}
                {blockChainageStatus[block.id].coverage.length > 5 && (
                  <span style={{ padding: '2px 8px', fontSize: '11px', color: '#004085' }}>
                    +{blockChainageStatus[block.id].coverage.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Work Description */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Work Description</label>
              <VoiceButton fieldId={`workDescription_${block.id}`} />
            </div>
            <textarea
              value={block.workDescription}
              onChange={(e) => updateActivityBlock(block.id, 'workDescription', e.target.value)}
              placeholder="Describe the work performed... (use 🎤 for voice input)"
              rows={3}
              style={{ 
                width: '100%', 
                padding: '10px', 
                border: isListening === `workDescription_${block.id}` ? '2px solid #dc3545' : '1px solid #ced4da', 
                borderRadius: '4px', 
                resize: 'vertical',
                backgroundColor: isListening === `workDescription_${block.id}` ? '#fff5f5' : 'white'
              }}
            />
            {isListening === `workDescription_${block.id}` && (
              <div style={{ marginTop: '5px', padding: '8px 10px', backgroundColor: '#f8d7da', borderRadius: '4px', fontSize: '12px', color: '#721c24' }}>
                <strong>🔴 Listening...</strong> Speak now. Say "period", "comma", or "new line" for punctuation. Click Stop when done.
              </div>
            )}
          </div>

          {/* Quality Checks */}
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#856404' }}>⚙️ Quality Checks</h4>
            {renderQualityFields(block)}
          </div>

          {/* Daily Contractor Ticket */}
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#004085' }}>📋 Daily Contractor Ticket</h4>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Ticket #:</label>
              <input
                type="text"
                placeholder="Enter ticket number"
                value={block.ticketNumber || ''}
                onChange={(e) => updateBlock(block.id, 'ticketNumber', e.target.value)}
                style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '150px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>
                📁 Upload from Gallery
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleTicketPhotoSelect(block.id, e)}
                  style={{ display: 'none' }}
                />
              </label>
              <label style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>
                📷 Take Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleTicketPhotoSelect(block.id, e)}
                  style={{ display: 'none' }}
                />
              </label>
              {block.ticketPhoto && (
                <button
                  onClick={() => scanTicketWithOCR(block.id)}
                  disabled={scanningBlock === block.id}
                  style={{ 
                    padding: '10px 20px', 
                    backgroundColor: scanningBlock === block.id ? '#6c757d' : '#17a2b8', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: scanningBlock === block.id ? 'wait' : 'pointer', 
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  {scanningBlock === block.id ? (
                    <>⏳ Scanning...</>
                  ) : (
                    <>🔍 Scan Ticket (OCR)</>
                  )}
                </button>
              )}
              {block.ticketPhoto && (
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>✓ {block.ticketPhoto.name}</span>
              )}
            </div>
            {block.ticketPhoto && (
              <div style={{ marginTop: '10px' }}>
                <img 
                  src={URL.createObjectURL(block.ticketPhoto)} 
                  alt="Ticket preview" 
                  style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '4px', border: '1px solid #dee2e6' }}
                />
                <button
                  onClick={() => updateActivityBlock(block.id, 'ticketPhoto', null)}
                  style={{ marginLeft: '10px', padding: '5px 10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                >
                  Remove
                </button>
              </div>
            )}
            {scanningBlock === block.id && (
              <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#d1ecf1', borderRadius: '4px', color: '#0c5460' }}>
                <strong>🔍 Scanning ticket with AI...</strong>
                <p style={{ margin: '5px 0 0 0', fontSize: '13px' }}>
                  Extracting personnel names, classifications, equipment, and hours. This may take a few seconds.
                </p>
              </div>
            )}
          </div>

          {/* Manpower */}
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#d4edda', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 5px 0', color: '#155724' }}>👷 Manpower</h4>
            <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#155724' }}>
              RT = Regular Time | OT = Overtime | JH = Jump Hours (bonus)
            </p>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Employee Name</label>
                <input
                  type="text"
                  placeholder="Name"
                  value={currentLabour.employeeName}
                  onChange={(e) => setCurrentLabour({ ...currentLabour, employeeName: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                />
              </div>
              <div style={{ flex: 2, minWidth: '180px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Classification</label>
                <select
                  value={currentLabour.classification}
                  onChange={(e) => setCurrentLabour({ ...currentLabour, classification: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                >
                  <option value="">Select Classification</option>
                  {labourClassifications.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div style={{ width: '60px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', color: '#155724' }}>RT</label>
                <input
                  type="number"
                  placeholder="8"
                  value={currentLabour.rt}
                  onChange={(e) => setCurrentLabour({ ...currentLabour, rt: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #28a745', borderRadius: '4px', backgroundColor: '#d4edda' }}
                />
              </div>
              <div style={{ width: '60px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', color: '#856404' }}>OT</label>
                <input
                  type="number"
                  placeholder="0"
                  value={currentLabour.ot}
                  onChange={(e) => setCurrentLabour({ ...currentLabour, ot: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ffc107', borderRadius: '4px', backgroundColor: '#fff3cd' }}
                />
              </div>
              <div style={{ width: '60px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', color: '#004085' }}>JH</label>
                <input
                  type="number"
                  placeholder="0"
                  value={currentLabour.jh}
                  onChange={(e) => setCurrentLabour({ ...currentLabour, jh: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #007bff', borderRadius: '4px', backgroundColor: '#cce5ff' }}
                />
              </div>
              <div style={{ width: '55px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Count</label>
                <input
                  type="number"
                  placeholder="1"
                  value={currentLabour.count}
                  onChange={(e) => setCurrentLabour({ ...currentLabour, count: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                />
              </div>
              <button
                onClick={() => {
                  addLabourToBlock(block.id, currentLabour.employeeName, currentLabour.classification, currentLabour.rt, currentLabour.ot, currentLabour.jh, currentLabour.count)
                  setCurrentLabour({ employeeName: '', classification: '', rt: '', ot: '', jh: '', count: '1' })
                }}
                style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Add
              </button>
            </div>

            {block.labourEntries.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#c3e6cb' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Employee</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Classification</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '55px' }}>RT</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '55px' }}>OT</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '65px' }}>JH</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}>Cnt</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {block.labourEntries.map(entry => {
                    // Calculate RT/OT if not already set (for backwards compatibility)
                    const rt = entry.rt !== undefined ? entry.rt : Math.min(entry.hours || 0, 8)
                    const ot = entry.ot !== undefined ? entry.ot : Math.max(0, (entry.hours || 0) - 8)
                    const jh = entry.jh !== undefined ? entry.jh : 0
                    return (
                      <tr key={entry.id} style={{ backgroundColor: '#fff' }}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #dee2e6' }}>{entry.employeeName || '-'}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #dee2e6', fontSize: '12px' }}>{entry.classification}</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: '#d4edda' }}>{rt}</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: ot > 0 ? '#fff3cd' : '#fff' }}>{ot > 0 ? ot : '-'}</td>
                        <td style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: jh > 0 ? '#cce5ff' : '#fff' }}>
                          <input
                            type="number"
                            value={jh || ''}
                            onChange={(e) => updateLabourJH(block.id, entry.id, e.target.value)}
                            placeholder="0"
                            style={{ 
                              width: '45px', 
                              padding: '4px', 
                              border: '1px solid #ced4da', 
                              borderRadius: '3px', 
                              textAlign: 'center',
                              fontSize: '12px'
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{entry.count}</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                          <button
                            onClick={() => removeLabourFromBlock(block.id, entry.id)}
                            style={{ padding: '2px 6px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Equipment */}
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#cce5ff', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#004085' }}>🚜 Equipment</h4>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <select
                value={currentEquipment.type}
                onChange={(e) => setCurrentEquipment({ ...currentEquipment, type: e.target.value })}
                style={{ flex: 2, minWidth: '200px', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
              >
                <option value="">Select Equipment</option>
                {equipmentTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Hours"
                value={currentEquipment.hours}
                onChange={(e) => setCurrentEquipment({ ...currentEquipment, hours: e.target.value })}
                style={{ width: '80px', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
              />
              <input
                type="number"
                placeholder="Count"
                value={currentEquipment.count}
                onChange={(e) => setCurrentEquipment({ ...currentEquipment, count: e.target.value })}
                style={{ width: '80px', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
              />
              <button
                onClick={() => {
                  addEquipmentToBlock(block.id, currentEquipment.type, currentEquipment.hours, currentEquipment.count)
                  setCurrentEquipment({ type: '', hours: '', count: '' })
                }}
                style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Add
              </button>
            </div>

            {block.equipmentEntries.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#b8daff' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Equipment</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Hours</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Count</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {block.equipmentEntries.map(entry => (
                    <tr key={entry.id} style={{ backgroundColor: '#fff' }}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>{entry.type}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{entry.hours}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{entry.count}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                        <button
                          onClick={() => removeEquipmentFromBlock(block.id, entry.id)}
                          style={{ padding: '2px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Time Lost */}
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8d7da', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#721c24' }}>⏱️ Time Lost</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Reason</label>
                <select
                  value={block.timeLostReason || ''}
                  onChange={(e) => updateActivityBlock(block.id, 'timeLostReason', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px' }}
                >
                  <option value="">None</option>
                  {timeLostReasons.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Hours Lost</label>
                <input
                  type="number"
                  value={block.timeLostHours || ''}
                  onChange={(e) => updateActivityBlock(block.id, 'timeLostHours', e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Details</label>
                  <VoiceButton fieldId={`timeLostDetails_${block.id}`} style={{ padding: '4px 8px', fontSize: '11px' }} />
                </div>
                <input
                  type="text"
                  value={block.timeLostDetails || ''}
                  onChange={(e) => updateActivityBlock(block.id, 'timeLostDetails', e.target.value)}
                  placeholder="Describe reason for time lost... (use 🎤 for voice)"
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    border: isListening === `timeLostDetails_${block.id}` ? '2px solid #dc3545' : '1px solid #ced4da', 
                    borderRadius: '4px', 
                    fontSize: '13px',
                    backgroundColor: isListening === `timeLostDetails_${block.id}` ? '#fff5f5' : 'white'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Work Photos */}
          <div style={{ padding: '15px', backgroundColor: '#e9ecef', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#495057' }}>📷 Work Photos</h4>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
              <label style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>
                📁 Upload from Gallery
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleWorkPhotosSelect(block.id, e)}
                  style={{ display: 'none' }}
                />
              </label>
              <label style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>
                📷 Take Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleWorkPhotosSelect(block.id, e)}
                  style={{ display: 'none' }}
                />
              </label>
              <span style={{ color: '#666', fontSize: '13px', alignSelf: 'center' }}>
                {block.workPhotos.length > 0 ? `${block.workPhotos.length} photo(s) added` : 'No photos yet'}
              </span>
            </div>
            
            {block.workPhotos.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginTop: '15px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#dee2e6' }}>
                    <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Preview</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Filename</th>
                    <th style={{ padding: '8px', textAlign: 'left', width: '120px' }}>Location (KP)</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {block.workPhotos.map((photo, photoIdx) => (
                    <tr key={photoIdx} style={{ backgroundColor: '#fff' }}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', textAlign: 'center' }}>
                        <img 
                          src={URL.createObjectURL(photo.file)} 
                          alt={`Photo ${photoIdx + 1}`}
                          style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                          onClick={() => window.open(URL.createObjectURL(photo.file), '_blank')}
                        />
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', fontSize: '12px' }}>{photo.file.name}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                        <input
                          type="text"
                          value={photo.location}
                          onChange={(e) => updatePhotoMetadata(block.id, photoIdx, 'location', e.target.value)}
                          placeholder="e.g. 5+250"
                          style={{ width: '100%', padding: '4px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                        />
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                        <input
                          type="text"
                          value={photo.description}
                          onChange={(e) => updatePhotoMetadata(block.id, photoIdx, 'description', e.target.value)}
                          placeholder="Description..."
                          style={{ width: '100%', padding: '4px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                        />
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                        <button
                          onClick={() => removeWorkPhoto(block.id, photoIdx)}
                          style={{ padding: '2px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ))}

      {/* Add Activity Button */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button
          onClick={addActivityBlock}
          style={{ padding: '15px 40px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
        >
          + Add Another Activity
        </button>
      </div>

      {/* SAFETY / ENVIRONMENT / COMMENTS */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
        <div style={{ borderBottom: '2px solid #28a745', paddingBottom: '10px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, color: '#333' }}>SAFETY / ENVIRONMENT / COMMENTS</h2>
        </div>
        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Safety Notes</label>
            <VoiceButton fieldId="safetyNotes" />
          </div>
          <textarea
            value={safetyNotes}
            onChange={(e) => setSafetyNotes(e.target.value)}
            rows={3}
            placeholder="Safety observations, incidents, hazards... (use 🎤 for voice input)"
            style={{ 
              width: '100%', 
              padding: '10px', 
              border: isListening === 'safetyNotes' ? '2px solid #dc3545' : '1px solid #ced4da', 
              borderRadius: '4px',
              backgroundColor: isListening === 'safetyNotes' ? '#fff5f5' : 'white'
            }}
          />
          {isListening === 'safetyNotes' && (
            <div style={{ marginTop: '5px', padding: '5px 10px', backgroundColor: '#f8d7da', borderRadius: '4px', fontSize: '12px', color: '#721c24' }}>
              🔴 Listening... Say "period", "comma" for punctuation. Click Stop when done.
            </div>
          )}
        </div>
        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Land & Environment</label>
            <VoiceButton fieldId="landEnvironment" />
          </div>
          <textarea
            value={landEnvironment}
            onChange={(e) => setLandEnvironment(e.target.value)}
            rows={3}
            placeholder="Environmental conditions, landowner issues... (use 🎤 for voice input)"
            style={{ 
              width: '100%', 
              padding: '10px', 
              border: isListening === 'landEnvironment' ? '2px solid #dc3545' : '1px solid #ced4da', 
              borderRadius: '4px',
              backgroundColor: isListening === 'landEnvironment' ? '#fff5f5' : 'white'
            }}
          />
          {isListening === 'landEnvironment' && (
            <div style={{ marginTop: '5px', padding: '5px 10px', backgroundColor: '#f8d7da', borderRadius: '4px', fontSize: '12px', color: '#721c24' }}>
              🔴 Listening... Say "period", "comma" for punctuation. Click Stop when done.
            </div>
          )}
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>General Comments</label>
            <VoiceButton fieldId="generalComments" />
          </div>
          <textarea
            value={generalComments}
            onChange={(e) => setGeneralComments(e.target.value)}
            rows={3}
            placeholder="Other observations... (use 🎤 for voice input)"
            style={{ 
              width: '100%', 
              padding: '10px', 
              border: isListening === 'generalComments' ? '2px solid #dc3545' : '1px solid #ced4da', 
              borderRadius: '4px',
              backgroundColor: isListening === 'generalComments' ? '#fff5f5' : 'white'
            }}
          />
          {isListening === 'generalComments' && (
            <div style={{ marginTop: '5px', padding: '5px 10px', backgroundColor: '#f8d7da', borderRadius: '4px', fontSize: '12px', color: '#721c24' }}>
              🔴 Listening... Say "period", "comma" for punctuation. Click Stop when done.
            </div>
          )}
        </div>
      </div>

      {/* VISITORS */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
        <div style={{ borderBottom: '2px solid #6c757d', paddingBottom: '10px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, color: '#333' }}>VISITORS</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            placeholder="Name"
            style={{ flex: 1, minWidth: '150px', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
          />
          <input
            type="text"
            value={visitorCompany}
            onChange={(e) => setVisitorCompany(e.target.value)}
            placeholder="Company"
            style={{ flex: 1, minWidth: '150px', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
          />
          <input
            type="text"
            value={visitorPosition}
            onChange={(e) => setVisitorPosition(e.target.value)}
            placeholder="Position"
            style={{ flex: 1, minWidth: '150px', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
          />
          <button
            onClick={addVisitor}
            style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Add Visitor
          </button>
        </div>
        {visitors.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#dee2e6' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Company</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Position</th>
              </tr>
            </thead>
            <tbody>
              {visitors.map((v, idx) => (
                <tr key={idx} style={{ backgroundColor: '#fff' }}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>{v.name}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>{v.company}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>{v.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* INSPECTOR INFO */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
        <div style={{ borderBottom: '2px solid #17a2b8', paddingBottom: '10px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, color: '#333' }}>INSPECTOR INFORMATION</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Mileage</label>
            <input
              type="number"
              value={inspectorMileage}
              onChange={(e) => setInspectorMileage(e.target.value)}
              placeholder="km driven"
              style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Equipment Used</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {['ATV', 'UTV', 'Radio', 'Gas Fob'].map(eq => (
                <label key={eq} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={inspectorEquipment.includes(eq)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setInspectorEquipment([...inspectorEquipment, eq])
                      } else {
                        setInspectorEquipment(inspectorEquipment.filter(x => x !== eq))
                      }
                    }}
                  />
                  {eq}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CHAINAGE OVERLAP CHECK */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
        <button
          onClick={async () => {
            const currentWarnings = checkChainageOverlaps(activityBlocks)
            const historicalWarnings = await checkHistoricalOverlaps(activityBlocks)
            const allWarnings = [...currentWarnings, ...historicalWarnings]
            setOverlapWarnings(allWarnings)
            if (allWarnings.length === 0) {
              alert('✅ No chainage overlaps detected!')
            }
          }}
          style={{ padding: '10px 25px', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
        >
          🔍 Check for Chainage Overlaps
        </button>
        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>
          Check current report against saved reports for duplicate chainages
        </p>
      </div>

      {/* CHAINAGE OVERLAP WARNINGS */}
      {overlapWarnings.length > 0 && (
        <div style={{ backgroundColor: '#fff3cd', border: '2px solid #ffc107', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ margin: 0, color: '#856404' }}>⚠️ Chainage Overlap Warnings ({overlapWarnings.length})</h4>
            <button
              onClick={() => setOverlapWarnings([])}
              style={{ padding: '4px 12px', backgroundColor: '#856404', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              Dismiss
            </button>
          </div>
          {overlapWarnings.map((warning, idx) => (
            <p key={idx} style={{ margin: '5px 0', color: '#856404', fontSize: '14px' }}>
              {warning.message}
            </p>
          ))}
          <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#856404' }}>
            Please review the KP ranges above. Overlapping chainages may indicate duplicate work entries.
          </p>
        </div>
      )}

      {/* SAVE BUTTONS */}
      <div style={{ backgroundColor: '#e9ecef', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '15px' }}>
          <button
            onClick={() => exportToExcel()}
            style={{ padding: '15px 30px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
          >
            📊 Excel Export
          </button>
          <button
            onClick={() => exportToPDF()}
            style={{ padding: '15px 30px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
          >
            📄 PDF Export
          </button>
          <button
            onClick={() => saveReport(true)}
            disabled={saving}
            style={{ padding: '15px 40px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
          >
            {saving ? 'Saving...' : '💾 Save & Export'}
          </button>
          <button
            onClick={() => saveReport(false)}
            disabled={saving}
            style={{ padding: '15px 30px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
          >
            {saving ? 'Saving...' : '💾 Save Only'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default InspectorReport
