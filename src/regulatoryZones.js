// regulatoryZones.js - Regulatory zone data for MiniMapWidget overlay
// Static proof-of-concept data (mirrors pipe-up-automation/data/regulatory_zones.json)
// In production this would come from the database

export const REGULATORY_ZONES = [
  {
    name: "Ray Creek Crossing",
    type: "fisheries",
    kp_start: 31.0,
    kp_end: 31.3,
    restriction: "No in-stream work Mar 1 - Jun 15 & Sep 1 - Nov 15",
    status: "OPEN",
    authority: "DFO / Fisheries Act"
  },
  {
    name: "Mamquam River Crossing",
    type: "fisheries",
    kp_start: 29.2,
    kp_end: 29.8,
    restriction: "No in-stream work Mar 1 - Jun 30 & Aug 15 - Nov 30",
    status: "OPEN",
    status_detail: "CLOSES IN 2 DAYS",
    authority: "DFO / Fisheries Act"
  },
  {
    name: "Stawamus River Zone",
    type: "fisheries",
    kp_start: 33.5,
    kp_end: 34.2,
    restriction: "No in-stream work Mar 15 - Jun 30",
    status: "OPEN",
    authority: "DFO / Fisheries Act"
  },
  {
    name: "Slope B/C Glacier - Steep Terrain ESA",
    type: "environmental",
    kp_start: 5.3,
    kp_end: 6.8,
    restriction: "Enhanced erosion control required. No work during heavy rain events. Mandatory spotter.",
    status: "ACTIVE WORK",
    authority: "BCER Permit Condition #47"
  },
  {
    name: "Wetland Complex",
    type: "environmental",
    kp_start: 3.4,
    kp_end: 3.8,
    restriction: "30m setback from wetland boundary. Silt fencing mandatory. Turbidity monitoring required.",
    status: "MONITORING",
    authority: "BCER / BC Water Sustainability Act"
  },
  {
    name: "Mountain Goat Winter Range",
    type: "environmental",
    kp_start: 7.0,
    kp_end: 11.0,
    restriction: "Helicopter operations restricted Dec 1 - Apr 15. Minimize noise 0600-0900.",
    status: "RESTRICTION ACTIVE",
    authority: "BCER Permit Condition #62 / BC Wildlife Act"
  },
  {
    name: "GD-2026-041 - Hixon Section",
    type: "ground_disturbance",
    kp_start: 2.0,
    kp_end: 6.5,
    restriction: "Active GD permit. Pre-disturbance assessment complete. Valid through Mar 31, 2026.",
    status: "VALID",
    authority: "SMJV GD Program / OGC Act"
  },
  {
    name: "GD-2026-038 - Mid Section",
    type: "ground_disturbance",
    kp_start: 10.0,
    kp_end: 15.5,
    restriction: "Active GD permit. Archaeological monitor required KP 12+200 to 12+800.",
    status: "VALID",
    authority: "SMJV GD Program / Heritage Conservation Act"
  },
  {
    name: "GD-2026-042 - South Section",
    type: "ground_disturbance",
    kp_start: 18.5,
    kp_end: 21.0,
    restriction: "Active GD permit. Monitoring well MW-14 within 50m at KP 19+400.",
    status: "VALID",
    authority: "SMJV GD Program"
  },
  {
    name: "GD-2026-039 - Mamquam/Urban",
    type: "ground_disturbance",
    kp_start: 29.0,
    kp_end: 32.0,
    restriction: "Active GD permit. Retaining wall zone KP 31. Geotechnical monitoring mandatory.",
    status: "VALID",
    authority: "SMJV GD Program / Municipal Permit"
  },
  {
    name: "GD PENDING - Stawamus FSR",
    type: "ground_disturbance",
    kp_start: 33.0,
    kp_end: 35.0,
    restriction: "GD checklist under review. Road upgrades planned KM 0-3.5. Awaiting final sign-off.",
    status: "PENDING",
    authority: "SMJV GD Program"
  },
  {
    name: "Knotweed Contamination Zone",
    type: "invasive_species",
    kp_start: 33.6,
    kp_end: 33.9,
    restriction: "Contaminated topsoil - mandatory offsite disposal (GFL Abbotsford). Equipment wash mandatory on exit.",
    status: "ACTIVE HAULING",
    authority: "BC Weed Control Act / BCER Condition #71"
  },
  {
    name: "Blast Exclusion Zone - Active",
    type: "safety",
    kp_start: 4.8,
    kp_end: 5.1,
    restriction: "Active blasting operations. 500m exclusion during blast events. Blast schedule posted daily.",
    status: "ACTIVE TODAY",
    authority: "WorkSafeBC / SMJV Blast Plan"
  },
  {
    name: "Helicopter Operations Zone",
    type: "safety",
    kp_start: 30.8,
    kp_end: 31.0,
    restriction: "Heli pad active. 100m ground exclusion during flight ops. Hard hat mandatory.",
    status: "ACTIVE TODAY",
    authority: "Transport Canada / WorkSafeBC"
  }
]

export const ZONE_TYPE_CONFIG = {
  fisheries: { label: "Fisheries Timing Windows", color: "#00BCD4", icon: "\uD83D\uDC1F" },
  environmental: { label: "Environmental Sensitive Areas", color: "#FF9800", icon: "\u26F0\uFE0F" },
  ground_disturbance: { label: "Ground Disturbance Permits", color: "#FFC107", icon: "\uD83D\uDCCB" },
  invasive_species: { label: "Invasive Species Zones", color: "#E91E63", icon: "\u2623\uFE0F" },
  safety: { label: "Safety / Exclusion Zones", color: "#F44336", icon: "\uD83D\uDCA5" }
}
