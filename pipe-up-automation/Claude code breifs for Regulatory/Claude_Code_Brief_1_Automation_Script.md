# BRIEF 1: EGP Daily Map & Compliance Report Automation Script

## What This Does
A Python script that takes a daily work plan PDF and a KML pipeline route file, and generates:
1. An interactive HTML map showing crew locations on the pipeline route
2. A Word document compliance report cross-referencing crew locations against regulatory zones

## How It's Used
Rick receives a daily PDF work plan from the contractor (SMJV) for the Eagle Mountain Woodfibre Gas Pipeline project in Squamish, BC. He saves the PDF to a folder, runs the script, and gets two output files — a map and a compliance report. Under 60 seconds.

## Folder Structure
```
pipe-up-automation/
├── generate.py              # Main script — this is the entry point
├── config.json              # Project settings (paths, project name, etc.)
├── requirements.txt         # pdfplumber, lxml, python-docx
├── data/
│   ├── doc.kml              # Pipeline route file (provided, doesn't change)
│   └── regulatory_zones.json # Zone database (provided, updated occasionally)
├── daily_reports/            # Drop PDF files here
└── output/                   # Generated files land here
    ├── EGP_Daily_Map_YYYY-MM-DD.html
    └── EGP_Compliance_Report_YYYY-MM-DD.docx
```

## config.json
```json
{
  "project_name": "SMJV — Eagle Mountain Woodfibre Gas Pipeline",
  "job_number": "Job #2330",
  "location": "Squamish, BC",
  "kml_path": "data/doc.kml",
  "zones_path": "data/regulatory_zones.json",
  "reports_dir": "daily_reports",
  "output_dir": "output",
  "kp_range": [0, 38.5],
  "map_center": [49.58, -123.0],
  "map_zoom": 11
}
```

## Step-by-Step Logic for generate.py

### Step 1: Find the Latest PDF
- Look in `daily_reports/` folder
- Find the most recent PDF by file modification date
- Extract the date from the filename if possible (format: `EGMP_Daily_Work_Plan_2330_-_Month_DD__YYYY.pdf`)
- If no date found in filename, use today's date

### Step 2: Parse the KML File (One-Time Cache)
- Parse `data/doc.kml` to extract KP markers
- IMPORTANT: The KML uses `<name>` tags. Some displays truncate it to `<n>` but the actual XML tag is `<name>`.
- Look for placemarks with names like "KP 7.7", "KP 24.9", etc.
- Extract the `<Point><coordinates>` for each KP marker: format is `longitude,latitude,altitude`
- Build a lookup dictionary: `{kp_float: [latitude, longitude]}`
- KP markers are at 100m intervals (0.0, 0.1, 0.2 ... 38.4, 38.47)
- Also extract the centerline geometry from `<LineString><coordinates>` elements (3 LineStrings that form the full route)
- Cache the parsed KML data as a JSON file (`data/kml_cache.json`) so it doesn't re-parse every run

**KML parsing approach:** Use regex, not XML parsing. The KML has namespace issues that cause lxml to choke. Pattern for KP markers:
```python
# Find <name>KP X.X</name> then search forward for <Point><coordinates>lng,lat,alt</coordinates>
name_pattern = re.compile(r'<name>(KP\s+([\d.]+))</name>')
# For each match, search forward in the text for the nearest Point/coordinates
```

### Step 3: Parse the PDF
- Use `pdfplumber` to extract tables from each page
- The PDF has a consistent structure:
  - Column 0: Fortis Inspector name (the person assigned to observe the crew)
  - Column 1: Discipline / Crew name (e.g., "CIVILS-GRADE/BLAST-CREW 7 - Wade Cuthbertson\nSub-Contractors\nEmployees")
  - Column 2: Sub/Employee counts (can be ignored for this purpose)
  - Column 3: Activity description (free text describing what the crew is doing and where)
- Skip rows where:
  - Column 0 is empty or None
  - Column 1 contains "DISCIPLINE" (header row)
  - Column 3 is empty or only contains sub/employee count info
  - The row is a title/summary row (contains "SMJV" or "Eagle Mountain")

### Step 4: Extract KP Locations from Activity Text
This is the critical parsing step. The activity text contains KP references in multiple formats. Use regex to find all of them:

```
Pattern 1: "KP 14+638", "kp 2+700", "Kp 29+600"
  Regex: (?:KP|Kp|kp)\s*(\d{1,3})\+(\d{1,4})
  Conversion: km + meters/1000 → KP value
  Example: KP 14+638 → 14.638

Pattern 2: "5+222", "19+195" (no KP prefix, just number+number)
  Regex: (?<!\d)(\d{1,2})\+(\d{2,4})(?!\d)
  Conversion: same as above
  Sanity check: result must be between 0 and 38.5 (the pipeline range)

Pattern 3: "KP 14 yard", "kp14", "KP 14" (whole KP, no chainage)
  Regex: (?:KP|Kp|kp)\s*(\d{1,3})(?:\s|$|[^+\d])
  Conversion: just the number as a float
  Sanity check: must be between 0 and 38.5

Pattern 4: "km 4.2", "KM 3.6" (kilometer references)
  Regex: (?:km|KM)\s*(\d{1,3}(?:\.\d+)?)
  Conversion: float value directly
  Sanity check: must be between 0 and 38.5
```

Only include crews that have at least one valid KP location.

### Step 5: Interpolate KP Values to Coordinates
For each KP value extracted from the activity text, find its lat/lng position on the pipeline:
- Find the two nearest KP markers that bracket the value (e.g., for KP 14.638, find KP 14.6 and KP 14.7)
- Linear interpolation between them:
  ```
  t = (target_kp - lower_kp) / (upper_kp - lower_kp)
  lat = lower_lat + t * (upper_lat - lower_lat)
  lng = lower_lng + t * (upper_lng - lower_lng)
  ```
- If the KP value is outside the known range, clamp to the nearest endpoint

### Step 6: Categorize Activities
Assign each crew an activity category based on keywords in the activity text:
```
"backfill" → Backfill (#2196F3 blue)
"ditch" → Ditching (#FF9800 orange)
"grad" or "blast" → Grading/Blasting (#795548 brown)
"weld" or "stove" or "bend" → Welding (#F44336 red)
"coat" or "jeep" → Coating (#9C27B0 purple)
"drill" or "split" or "grout" or "nail" → Drilling (#607D8B gray)
"crush" → Crushing (#FF5722 deep orange)
"pump" → Pump Support (#00BCD4 cyan)
"tie" → Tie-in (#E91E63 pink)
"ecb" or "road" or "barricade" or "bypass" → Civil/Roads (#3F51B5 indigo)
"haul" or "truck" → Hauling (#8BC34A light green)
"test" or "wqt" → Testing/QC (#FFC107 amber)
default → Other (#9E9E9E gray)
```

### Step 7: Cross-Reference Against Regulatory Zones
Load `data/regulatory_zones.json`. For each crew KP location, check if it falls within any regulatory zone's KP range. Record every intersection as a "finding" with:
- Crew name, inspector, activity, KP
- Zone name, type, status, restriction, authority
- Severity: HIGH if zone status is PENDING/RESTRICTION ACTIVE/ACTIVE TODAY or has a status_detail; MONITOR if ACTIVE WORK/ACTIVE HAULING/MONITORING; COMPLIANT if VALID/OPEN

### Step 8: Generate Compliance Alerts
Automatically generate alerts by checking:
- Any fisheries zone closing within 7 days with active work in it → HIGH
- Any crew in a PENDING GD zone → MEDIUM
- Any active safety zone with crew work inside → MEDIUM
- Wildlife/environmental restrictions in effect with activity in zone → LOW

Use the report date and parse the restriction text to calculate days-until-closing for fisheries windows.

### Step 9: Generate the HTML Map
Build a self-contained HTML file using Leaflet.js (loaded from unpkg CDN). Embed ALL data as JavaScript variables. The map includes:

**Base layers:**
- Dark CartoDB tiles (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`)
- Pipeline centerline (blue polyline from KML LineString data)
- KP kilometer markers (whole numbers only: KP 0, KP 1, ... KP 38)

**Crew layer:**
- Colored circle markers at each crew KP location
- Color by activity category
- Popup: inspector name, crew name, activity description, KP value

**Regulatory zone layers (toggleable):**
- Each zone drawn as a thick semi-transparent colored line along the pipeline route between its start/end KP
- Color by zone type (cyan=fisheries, orange=environmental, green=GD, pink=invasive, red=safety)
- Zones with warning statuses get dashed lines
- Zone start markers with KP labels
- Popup: zone name, type, KP range, status, restriction, authority

**Alert markers:**
- Pulsing icons at alert locations
- HIGH severity pulses red

**Sidebar:**
- Compliance alert cards (sorted HIGH→LOW, clickable to zoom)
- Zone layer toggles (click to show/hide each zone type)
- Activity legend
- Crew list (clickable to zoom)

**Header:**
- Project name, date, on-site totals, alert severity badges

**Styling:**
- Dark theme: background #0f1923, navy #0B1D33, accent orange #E8913A
- Font: system-ui / Segoe UI
- Responsive sidebar

Reference implementations (use these for exact CSS/JS patterns):
- EGP_Daily_Map_Feb27.html
- EGP_Regulatory_Compliance_Map.html

### Step 10: Generate the Word Compliance Report
Use `python-docx` library. The report structure:

**Page 1: Summary**
- Title: "DAILY REGULATORY COMPLIANCE REPORT"
- Subtitle: Project name, date, job number, location
- Summary table (4 columns): Total Findings | Action Required | Monitor | Compliant
- Summary paragraph describing the findings

**Page 2: Compliance Alerts**
- Table: Severity | Alert Title | Detail | Location (KP)
- Color-coded severity cells (red HIGH, amber MEDIUM, blue LOW)

**Pages 3+: Zone Sections (one per type)**
Each section has:
- Zone summary table: Name | KP Range | Status | Restriction | Authority
- Crews operating in that zone: Crew Name | KP | Activity | Zone Name
- Status cells conditionally colored (green=VALID/OPEN, amber=PENDING/ACTIVE, red=CLOSED)

**Final Section: Complete Crew-Zone Intersection Log**
- Every intersection in one master table
- This is the audit trail for regulators

**Last Section: Signature Block**
- Prepared By / Reviewed By lines with blanks

**Formatting:**
- US Letter, portrait, 1" side margins, 0.75" top/bottom
- Font: Arial throughout (11pt body, 9pt table cells)
- Header: "CONFIDENTIAL — EGP Regulatory Compliance Report — [Date]"
- Footer: "Pipe-Up Regulatory Compliance Engine | Page X"
- Alternating row shading in all tables (white / light gray)
- Navy header rows with white text

### Step 11: Terminal Output
```
═══════════════════════════════════════════
  Pipe-Up Daily Compliance Report
  Eagle Mountain Woodfibre Gas Pipeline
  February 27, 2026
═══════════════════════════════════════════
  PDF Parsed:    [filename]
  Crews Found:   30
  KP Locations:  64
  Zone Crossings: 93
    Action Required: 13
    Monitor:         12
    Compliant:       72
  Alerts:        4
═══════════════════════════════════════════
  Output:
    → output/EGP_Daily_Map_2026-02-27.html
    → output/EGP_Compliance_Report_2026-02-27.docx
═══════════════════════════════════════════
```

---

## Important Notes for Claude Code

1. **KML tag name:** The actual XML tag is `<name>`, not `<n>`. Some displays truncate it.

2. **KML parsing:** Use regex, not XML parsing. The KML has `xsi:schemaLocation` without defining the xsi namespace, which causes lxml to fail. Use `recover=True` if you must use lxml, but regex is more reliable here.

3. **Three LineStrings:** The KML has 3 `<LineString>` elements. Concatenate all three coordinate arrays to form the complete centerline.

4. **Out-of-range KPs:** Some activity text references KPs like "100+850" or "101+200". These are a different pipeline section — filter out anything outside 0-38.5.

5. **Self-contained HTML:** All data embedded as JS variables. Only external dependencies are Leaflet CDN and CartoDB tiles.

6. **Python only:** Use `python-docx` for the Word report. Keep everything in Python so the script is one file.

7. **Windows compatible:** Rick runs this on a Windows laptop. Use `pathlib` for all file paths. No bash commands.

8. **CLI flag:** Include `--date YYYY-MM-DD` flag to process older PDFs by matching the date in the filename. Default behavior: process the most recent PDF in the folder.

9. **Sample PDF included:** `EGMP_Daily_Work_Plan_2330_-_February_27__2026.pdf` is the reference test file.

---

## Data Files to Provide

1. `data/doc.kml` — The pipeline KML file (copy from uploads)
2. `data/regulatory_zones.json` — The zone database (JSON provided below)
3. `daily_reports/EGMP_Daily_Work_Plan_2330_-_February_27__2026.pdf` — Sample PDF for testing

### data/regulatory_zones.json
```json
{
  "zones": [
    {
      "name": "Ray Creek Crossing",
      "type": "fisheries",
      "kp_start": 31.0,
      "kp_end": 31.3,
      "restriction": "No in-stream work Mar 1 - Jun 15 & Sep 1 - Nov 15",
      "status": "OPEN",
      "authority": "DFO / Fisheries Act"
    },
    {
      "name": "Mamquam River Crossing",
      "type": "fisheries",
      "kp_start": 29.2,
      "kp_end": 29.8,
      "restriction": "No in-stream work Mar 1 - Jun 30 & Aug 15 - Nov 30",
      "status": "OPEN",
      "status_detail": "CLOSES IN 2 DAYS",
      "authority": "DFO / Fisheries Act"
    },
    {
      "name": "Stawamus River Zone",
      "type": "fisheries",
      "kp_start": 33.5,
      "kp_end": 34.2,
      "restriction": "No in-stream work Mar 15 - Jun 30",
      "status": "OPEN",
      "authority": "DFO / Fisheries Act"
    },
    {
      "name": "Slope B/C Glacier - Steep Terrain ESA",
      "type": "environmental",
      "kp_start": 5.3,
      "kp_end": 6.8,
      "restriction": "Enhanced erosion control required. No work during heavy rain events. Mandatory spotter.",
      "status": "ACTIVE WORK",
      "authority": "BCER Permit Condition #47"
    },
    {
      "name": "Wetland Complex",
      "type": "environmental",
      "kp_start": 3.4,
      "kp_end": 3.8,
      "restriction": "30m setback from wetland boundary. Silt fencing mandatory. Turbidity monitoring required.",
      "status": "MONITORING",
      "authority": "BCER / BC Water Sustainability Act"
    },
    {
      "name": "Mountain Goat Winter Range",
      "type": "environmental",
      "kp_start": 7.0,
      "kp_end": 11.0,
      "restriction": "Helicopter operations restricted Dec 1 - Apr 15. Minimize noise 0600-0900.",
      "status": "RESTRICTION ACTIVE",
      "authority": "BCER Permit Condition #62 / BC Wildlife Act"
    },
    {
      "name": "GD-2026-041 - Hixon Section",
      "type": "ground_disturbance",
      "kp_start": 2.0,
      "kp_end": 6.5,
      "restriction": "Active GD permit. Pre-disturbance assessment complete. Valid through Mar 31, 2026.",
      "status": "VALID",
      "authority": "SMJV GD Program / OGC Act"
    },
    {
      "name": "GD-2026-038 - Mid Section",
      "type": "ground_disturbance",
      "kp_start": 10.0,
      "kp_end": 15.5,
      "restriction": "Active GD permit. Archaeological monitor required KP 12+200 to 12+800.",
      "status": "VALID",
      "authority": "SMJV GD Program / Heritage Conservation Act"
    },
    {
      "name": "GD-2026-042 - South Section",
      "type": "ground_disturbance",
      "kp_start": 18.5,
      "kp_end": 21.0,
      "restriction": "Active GD permit. Monitoring well MW-14 within 50m at KP 19+400.",
      "status": "VALID",
      "authority": "SMJV GD Program"
    },
    {
      "name": "GD-2026-039 - Mamquam/Urban",
      "type": "ground_disturbance",
      "kp_start": 29.0,
      "kp_end": 32.0,
      "restriction": "Active GD permit. Retaining wall zone KP 31. Geotechnical monitoring mandatory.",
      "status": "VALID",
      "authority": "SMJV GD Program / Municipal Permit"
    },
    {
      "name": "GD PENDING - Stawamus FSR",
      "type": "ground_disturbance",
      "kp_start": 33.0,
      "kp_end": 35.0,
      "restriction": "GD checklist under review. Road upgrades planned KM 0-3.5. Awaiting final sign-off.",
      "status": "PENDING",
      "authority": "SMJV GD Program"
    },
    {
      "name": "Knotweed Contamination Zone",
      "type": "invasive_species",
      "kp_start": 33.6,
      "kp_end": 33.9,
      "restriction": "Contaminated topsoil - mandatory offsite disposal (GFL Abbotsford). Equipment wash mandatory on exit.",
      "status": "ACTIVE HAULING",
      "authority": "BC Weed Control Act / BCER Condition #71"
    },
    {
      "name": "Blast Exclusion Zone - Active",
      "type": "safety",
      "kp_start": 4.8,
      "kp_end": 5.1,
      "restriction": "Active blasting operations. 500m exclusion during blast events. Blast schedule posted daily.",
      "status": "ACTIVE TODAY",
      "authority": "WorkSafeBC / SMJV Blast Plan"
    },
    {
      "name": "Helicopter Operations Zone",
      "type": "safety",
      "kp_start": 30.8,
      "kp_end": 31.0,
      "restriction": "Heli pad active. 100m ground exclusion during flight ops. Hard hat mandatory.",
      "status": "ACTIVE TODAY",
      "authority": "Transport Canada / WorkSafeBC"
    }
  ],
  "zone_type_config": {
    "fisheries": { "label": "Fisheries Timing Windows", "color": "#00BCD4" },
    "environmental": { "label": "Environmental Sensitive Areas", "color": "#FF9800" },
    "ground_disturbance": { "label": "Ground Disturbance Permits", "color": "#4CAF50" },
    "invasive_species": { "label": "Invasive Species Zones", "color": "#E91E63" },
    "safety": { "label": "Safety / Exclusion Zones", "color": "#F44336" }
  }
}
```
