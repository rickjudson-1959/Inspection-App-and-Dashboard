# BRIEF 2: Inspector Report Minimap — Regulatory Zone Overlay

## Context
The Pipe-Up inspector report (InspectorReport.jsx) has a "Map" button in the header bar that toggles a pipeline minimap. Currently the map shows the pipeline centerline and KP markers so inspectors can verify chainage locations. We want to add regulatory zone overlays so inspectors can see what restrictions apply to their work area.

## The Concept
When an inspector is working at KP 29+600, they should see — right on their minimap — that they're inside the Mamquam River fisheries zone and that the timing window closes in 2 days. This changes how they document their work. They write better notes, take the right photos, and flag the right things.

The inspector does NOT need to see the full project view. They need a zoomed-in view of their section of pipe with relevant regulatory context.

## What to Add

### 1. Regulatory Zone Overlay Layer
When the minimap is expanded, draw regulatory zones along the pipeline as colored, semi-transparent highlighted sections:

- **Fisheries zones** — Cyan (#00BCD4), dashed border if timing window is active
- **Environmental sensitive areas** — Orange (#FF9800)
- **Ground disturbance permits** — Green (#4CAF50), yellow (#FFC107) if PENDING
- **Invasive species zones** — Pink (#E91E63)
- **Safety/exclusion zones** — Red (#F44336), pulsing if ACTIVE TODAY

Each zone is drawn as a thick semi-transparent line segment along the pipeline centerline between its start KP and end KP.

### 2. Zone Data Source
The regulatory zones should be loaded from a project-level configuration (same `regulatory_zones.json` structure as Brief 1). In the current proof-of-concept, this can be hardcoded or loaded from a static JSON file. In production, it would come from the project settings in the database.

Zone data structure:
```json
{
  "name": "Mamquam River Crossing",
  "type": "fisheries",
  "kp_start": 29.2,
  "kp_end": 29.8,
  "restriction": "No in-stream work Mar 1 - Jun 30 & Aug 15 - Nov 30",
  "status": "OPEN",
  "status_detail": "CLOSES IN 2 DAYS",
  "authority": "DFO / Fisheries Act"
}
```

### 3. Zone Filtering (Inspector's View Only)
The minimap should only show zones relevant to the inspector's current work area. Filter logic:

1. Get the inspector's Start KP and End KP from the report form
2. Define a buffer zone: show zones within +/- 2 KP of their work area
3. Only render zones where the zone's KP range overlaps with (inspector_start_kp - 2) to (inspector_end_kp + 2)
4. If the inspector hasn't entered chainages yet, show all zones (full pipeline view)

### 4. Zone Popups
When an inspector taps/clicks on a highlighted zone segment on the map, show a popup with:
- Zone name (bold, colored by zone type)
- Zone type label (e.g., "FISHERIES TIMING WINDOW")
- KP range (e.g., "KP 29.2 — KP 29.8")
- Restriction text
- Status with color coding (green = OPEN/VALID, amber = PENDING/ACTIVE, red = CLOSED)
- Authority (e.g., "DFO / Fisheries Act")

### 5. Zone Alert Banner (Optional but Valuable)
If the inspector's chainages fall within or overlap a regulatory zone, show a subtle alert banner at the top of the minimap:

```
⚠ You are working in: Mamquam River Crossing (Fisheries — CLOSES IN 2 DAYS)
```

Color the banner by severity:
- Red background: Zone is CLOSED or ACTIVE TODAY (safety)
- Amber background: Zone has a status_detail (warning) or is PENDING
- Blue background: Zone is ACTIVE WORK or RESTRICTION ACTIVE (informational)
- No banner if all overlapping zones are VALID/OPEN

### 6. Zone Legend (Collapsible)
Add a small collapsible legend in the corner of the minimap:
- Small colored lines matching each zone type
- Click to toggle zone types on/off
- Collapsed by default to save screen space

### 7. Visual Style
Match the existing minimap style. The map already uses:
- Dark CartoDB tiles or similar dark basemap
- Blue pipeline centerline
- KP markers at regular intervals

The zone overlays should:
- Be semi-transparent (opacity ~0.25 for the thick highlight, ~0.7 for the border line)
- Not obscure the pipeline centerline or KP markers
- Use the zone type colors defined above
- Have a slightly thicker border line on top of the semi-transparent fill
- Zones with warning/active status should have dashed borders

### 8. Responsive Behavior
The minimap can be in two states:
1. **Collapsed** — Small preview, no zone details needed
2. **Expanded** — Full map view with zones, popups, legend, and alert banner

Zone overlays should only render when the map is expanded to avoid performance issues on mobile.

## Technical Notes

### KP to Coordinate Mapping
The minimap already has the pipeline centerline geometry and KP markers. Use the same KP-to-coordinate interpolation logic that exists in the map component:
- Take the zone's kp_start and kp_end
- Find the pipeline coordinates for that range
- Draw the zone highlight along those coordinates

### What NOT to Add
- Do NOT show other crews' locations (that's the PM's view)
- Do NOT show planned vs actual data (that's the PM's view)
- Do NOT show the compliance report data
- Do NOT add any additional data entry fields for the inspector

### Integration Point
The zone data should be passed as a prop to the map component:
```jsx
<PipelineMap
  centerline={centerlineCoords}
  kpMarkers={kpMarkers}
  regulatoryZones={regulatoryZones}  // NEW
  inspectorStartKP={formData.startKP}  // For filtering
  inspectorEndKP={formData.endKP}      // For filtering
  currentDate={formData.date}          // For timing window calculations
/>
```

### Status Calculations
For fisheries zones with defined timing windows, the component should parse the restriction text or use additional date fields to calculate:
- Is the window currently open or closed?
- How many days until the next window change?
- Display this in the popup and alert banner

In the proof of concept, the `status` and `status_detail` fields are pre-calculated. In production, add `window_start` and `window_end` date fields to the zone schema so the component can calculate status dynamically.

## Files That Need Changes
1. The map component used in InspectorReport.jsx (wherever the minimap logic lives)
2. A new data file or prop for regulatory zones
3. Possibly a new `ZoneOverlay` or `RegulatoryLayer` sub-component

## Reference Files
The following HTML files show the exact visual style and zone rendering approach to replicate:
- `EGP_Regulatory_Compliance_Map.html` — Full regulatory map with all zone types rendered
- `EGP_Daily_Map_Feb27.html` — Crew activity map with the dark theme styling

Both files use Leaflet.js. The React minimap may use a different mapping library — adapt the rendering approach accordingly but keep the visual style consistent.
