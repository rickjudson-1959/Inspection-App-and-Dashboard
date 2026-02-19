# PIPE-UP FIELD INSPECTION GUIDE — AGENT KNOWLEDGE BASE
## Version: 3.2 | Standard: API 1169 | Source: InspectorReport.jsx + ActivityBlock.jsx | Updated: 2026-02-19

> This document is the authoritative reference for the Pipe-Up AI Agent. It is derived directly from the application source code and reflects the exact fields, logic, activity types, and workflows an inspector encounters in the app.

---

## BRAND & COMPLIANCE CONTEXT

- **Application Name**: Pipe-Up
- **Tagline**: Connect. Learn. Lead.
- **Colors**: Professional Blue (#003366), Burnt Orange (#CC5500)
- **Typography**: Montserrat (headers), Open Sans (body)
- **Tone**: Approachable, collaborative, professional. Speak to inspectors as experienced peers.
- **Audit Trail**: Every report is auto-assigned a unique Document ID and SHA-256 Hash. Inspectors do not need to do anything — the system handles compliance automatically.
- **Governing Standard**: API 1169 (Pipeline Construction Inspection)
- **Mentor Agent**: A real-time AI auditor runs in the background, checking field values against thresholds and flagging anomalies. Alerts appear in a sidebar with severity levels.
- **Health Score**: Each report is scored by the ReportHealthScorer — visible to inspectors and reviewers.

---

## SECTION 1: REPORT HEADER — INITIALIZING A DAILY REPORT

Every inspection day begins by filling out the Report Header. This creates the audit-trailed record that all activity blocks attach to.

### Header Fields (exact field names from source)

| Field | UI Label | Type | Auto-Populated? | Notes |
|---|---|---|---|---|
| `inspectorName` | Inspector Name | Text | YES — from user profile (`userProfile.full_name`) | Can also restore from draft or localStorage project config |
| `selectedDate` | Report Date | Date | YES — defaults to today | Format: YYYY-MM-DD |
| `spread` | Spread | Dropdown | NO — inspector selects | Options come from `spreadOptions` in constants.js |
| `pipeline` | Pipeline Name | Text | YES — auto-fills when Spread is selected via `spreadToPipeline` mapping | |
| `afe` | AFE/Contract # | Text | YES — auto-fetched from `contract_config` table for the organization | Can be manually overridden |
| `weather` | Weather | Text | YES — from Auto-Fetch Weather | Main condition (e.g., "Clear", "Rain", "Snow") |
| `precipitation` | Precipitation | Number | YES — from Auto-Fetch Weather | mm of rain in last hour |
| `tempHigh` | Temp High | Number | YES — from Auto-Fetch Weather | Celsius |
| `tempLow` | Temp Low | Number | YES — from Auto-Fetch Weather | Celsius |
| `windSpeed` | Wind Speed | Number | YES — from Auto-Fetch Weather | km/h (converted from m/s x 3.6) |
| `rowCondition` | ROW Condition | Text | NO — inspector enters | e.g., "Dry", "Muddy", "Frozen", "Snow-covered" |
| `startTime` | Start Time | Time | NO — inspector enters | Beginning of inspection day |
| `stopTime` | Stop Time | Time | NO — inspector enters | End of inspection day |

### Step-by-Step Initialization

1. **Identity & Date**: Inspector name auto-populates from your login profile. Confirm the date (defaults to today).
2. **Spread Selection**: Select your assigned Spread from the dropdown. The Pipeline Name and AFE/Contract # auto-populate based on the Spread-to-Pipeline mapping and organization contract config.
3. **Auto-Fetch Weather**: Tap the "Auto-Fetch Weather" button. The app uses the pipeline's GPS coordinates (from `pipelineLocations`) to call the OpenWeatherMap API. It fills Weather condition, Temp High/Low, Wind Speed, and Precipitation.
   - **Important**: Weather is fetched based on the pipeline location, NOT your device's GPS. If the pipeline isn't selected yet, the button will prompt you to select one first.
   - **Manual fallback**: If the API fails or you're offline, enter weather data manually. Always record weather — it affects coating cure times, welding parameters, and supports downtime justifications.
4. **Field Baseline**: Enter the ROW Condition and your Start Time.

### Additional Report-Level Fields

| Field | Purpose |
|---|---|
| `safetyNotes` | Free-text safety observations for the day |
| `safetyRecognitionData` | Toggle-able Safety Recognition cards for recognizing safe behavior |
| `wildlifeSightingData` | Toggle-able Wildlife Sighting log |
| `landEnvironment` | Land and environmental observations |
| `visitors` | Log of site visitors (name, company, position). Auto-saved on report submit — if visitor fields are filled but not yet "Added," the save function captures them automatically. |
| `inspectorMileage` | Inspector's mileage/KMs for the day. Used by timesheet auto-populate for KM tracking. |
| `inspectorEquipment` | Inspector's equipment used |
| `unitPriceItemsEnabled` | Toggle for Unit Price Items tracking |
| `unitPriceData` | Unit price items and comments |

### Key Terms
- **Spread**: A geographic segment of the pipeline project assigned to a specific construction crew and inspector.
- **AFE (Authorization for Expenditure)**: The financial tracking number for the project.
- **ROW (Right-of-Way)**: The strip of land where the pipeline is being constructed.
- **Pipeline Location**: Each pipeline has stored GPS coordinates used for weather fetching and KP calculations.

---

## SECTION 2: ACTIVITY BLOCKS

A report contains one or more **Activity Blocks**. Each block represents a single construction activity observed that day. Inspectors can add multiple blocks to capture multiple activities.

### Activity Block Structure (exact fields from source)

| Field | Type | Notes |
|---|---|---|
| `activityType` | Searchable dropdown | Selected from `activityTypes` in constants.js — type to filter |
| `contractor` | Text | Contractor company name (can auto-fill from OCR) |
| `foreman` | Text | Foreman name (can auto-fill from OCR) |
| `startKP` | KP format | Start chainage — supports GPS Sync. Format: `X+XXX` (e.g., `6+500`) |
| `endKP` | KP format | End chainage — supports GPS Sync |
| `workDescription` | Textarea (6 rows) | Free-text description — supports Voice Input. Resizable vertically. |
| `metersToday` | Number | Auto-calculated from endKP minus startKP, or manual entry |
| `metersPrevious` | Number | Auto-populated from previous reports for the same activity type |
| `ticketNumber` | Text | Contractor ticket number (can auto-fill from OCR) |
| `ticketPhoto` / `ticketPhotos` | File upload (single or multi) | Photo(s) of contractor daily ticket — triggers OCR scanning. Multi-page tickets show page count in indicator and all pages in modal viewer |
| `workPhotos` | File uploads | Work progress photos with metadata (caption, location) |
| `labourEntries` | Array | Personnel logged (name, classification, RT, OT, JH, count). All fields are editable inline after OCR — name (with crew roster autocomplete), classification (searchable dropdown), RT, OT, JH, and count. |
| `equipmentEntries` | Array | Equipment logged (type, unit number, hours, count). All fields are editable inline after OCR — type (searchable dropdown), unit number, hours, and count. |
| `qualityData` | Object | Activity-specific quality check fields |
| `timeLostReason` | Dropdown | From `timeLostReasons` — None, Weather, Equipment, etc. |
| `timeLostHours` | Number | Hours lost to the selected reason |
| `timeLostDetails` | Textarea | Details about time lost — supports Voice Input |

### KP (Chainage) System

- **Format**: `X+XXX` where X is kilometres and XXX is metres. Example: `6+500` = 6,500 metres from KP 0.
- **Auto-conversion**: The app converts raw numbers to KP format. `6500` becomes `6+500`. `6.5` becomes `6+500`. `500` becomes `0+500`.
- **GPS KP Sync**: Tap the GPS button next to Start KP or End KP. The app uses your device's GPS to calculate the nearest KP on the pipeline centerline and auto-fills the field. If you initially deny GPS permission, the app shows instructions on how to re-enable it (tap the lock icon in the browser address bar → set Location to Allow → reload).
- **Chainage Overlap Detection**: The app checks your KP range against other blocks in the same report (same activity type) and historical reports from previous days. If an overlap is detected, a warning appears. You can provide a reason (e.g., rework, correction).
- **Chainage Gap Detection**: If there's uncovered chainage between the last reported KP and your current start KP, the app flags a gap.
- **Suggested Start KP**: When you select an activity type, the app shows where the last work ended so you can continue from the right point.

### Metres Today Calculation
The app auto-calculates metersToday as the absolute difference between endKP and startKP. Previous metres are auto-fetched from historical reports for the same activity type and pipeline.

---

## SECTION 3: ACTIVITY TYPES & SPECIALIZED LOGS

Each activity type may trigger a specialized log component with activity-specific fields. Here is the complete mapping from the source code:

### Activities with Specialized Log Components

| Activity Type (exact name in app) | Component | Key Fields |
|---|---|---|
| **Welding - Mainline** | MainlineWeldData | Weld numbers, joint numbers, heat numbers, WPS reference, preheat temp, interpass temp, voltage, amperage, travel speed, heat input (auto-calculated from defaults and on parameter change), welder IDs, NDE results. Section labeled "Total Weld Time Tracking" for time tracking. |
| **Welding - Section Crew** | MainlineWeldData | Same as Mainline Welding |
| **Welding - Poor Boy** | MainlineWeldData | Same as Mainline Welding |
| **Welding - Tie-in** | CounterboreTransitionLog | Counterbore measurements, transition data, upstream/downstream joint numbers |
| **Bending** | BendingLog | Dmax, Dmin, ovality calculation, bend angle, bend location |
| **Stringing** | StringingLog | Joint numbers, heat numbers, pipe tally, joint layout |
| **Coating** | CoatingLog | Ambient temp, humidity, coating type/product, holiday test results |
| **Clearing** | ClearingLog | Timber deck IDs, species, volumes, slash disposal |
| **HDD** | HDDLog | Entry/exit KP, bore depth, drilling fluid, pullback data |
| **HD Bores** | ConventionalBoreLog | Conventional bore data, casing details |
| **Piling** | PilingLog | Pile type, depth, driving records |
| **Equipment Cleaning** | EquipmentCleaningLog | Equipment ID, cleaning method, inspector verification |
| **Hydrovac** | HydrovacLog | Hydrovac Contractor/Foreman (in header), facility details (station, owner, P/X, type, depth, boundary, GPS) |
| **Welder Testing** | WelderTestingLog | Welder qualifications, test results, spread, weather conditions |
| **Hydrostatic Testing** | HydrotestLog | Start/end pressure, test duration, pressure log attachment |
| **Ditch** | DitchInspection | Trench width, depth, minimum cover check, soil conditions |
| **Grading** | GradingLog | ROW width, grade measurements, soft spots (KP, length, treatment) |
| **Tie-in Completion** | TieInCompletionLog | CP leads, anodes, crossing clearances, as-built measurements |
| **Cleanup - Machine** | MachineCleanupLog | See detailed breakdown below |
| **Cleanup - Final** | FinalCleanupLog | See detailed breakdown below |

### Activities with Quality Check Fields (from qualityFieldsByActivity)
Activities not in the specialized log list above use generic quality check fields defined in constants.js. These render as a grid of input fields, dropdowns, and collapsible sections. If an activity has no defined quality fields, the message "No quality checks defined for this activity" appears.

### Detailed: Cleanup - Machine (MachineCleanupLog)

This is one of the most comprehensive logs, with these sub-sections:

**Subsoil Restoration & De-compaction**: Ripping depth (cm), number of passes, decompaction confirmed (Y/N), rock pick required (Y/N), rock volume removed (m3), contour matching restored (Y/N), drainage patterns restored (Y/N).

**Trench & Crown Management**: Settlement crown height (cm), crown relief gaps installed (Y/N), mechanical compaction (Y/N), compaction equipment type, number of lifts.

**Debris & Asset Recovery Checklist**: Skids/lath removed, welding rods cleared, trash cleared, temporary bridges removed, ramps removed, all debris cleared.

**Drain Tile Repairs** (if applicable): Per-tile entries with KP, diameter, material, repair type, status.

**Erosion & Sediment Control**: Water bars installed (linear metres), diversion berms, silt fence status, straw wattles status.

**Additional Fields**: Soil type, land use category, specialized rock picking, imported fill volume, photos, comments.

### Detailed: Cleanup - Final (FinalCleanupLog)

**Topsoil Replacement**: Target depth (cm), actual replaced depth (cm), depth compliance, replaced in dry conditions (Y/N), grade matches surrounding (Y/N), final rock pick complete (Y/N), stoniness matches adjacent (Y/N), ad-mixing observed (flagged as deficiency with notes).

**Revegetation & Seeding**: Seed mix ID, application rate (kg/ha), seeding method, total seed used (kg), fertilizer type, fertilizer bags used, seed tag photo (required for verification).

**Permanent Erosion & Sediment Control**: Permanent silt fences (metres), final water bars (count), erosion control blankets (m2), rip rap (m3), check dams (count).

---

## SECTION 4: OCR TICKET SCANNING

### How It Works
1. In any activity block, upload a photo of the contractor's daily ticket (paper timesheet).
2. The app sends the image to Claude Vision (claude-sonnet-4) for OCR processing.
3. Claude extracts: ticket number, contractor name, foreman name, labour entries (name, classification, RT, OT, count), and equipment entries (type, hours, count, unit number).
4. The extracted data auto-populates the Labour and Equipment sections of that activity block.

### Multi-Page Support
You can upload multiple photos for a single ticket (e.g., front and back, or multi-page tickets). Claude processes all pages and combines the data without duplicating entries. When multiple pages are uploaded:
- The indicator shows "X pages attached" instead of a single filename.
- The photo modal displays all pages in a scrollable view with "Page X of Y" labels.
- All page filenames are saved to the database (not just the first page).

### Classification Matching
The OCR attempts to match extracted job titles to the app's 127 labour classifications (e.g., General Labourer, Principal Oper 1, Utility Welder, Welder Helper, General Foreman, Bus/Crewcab Driver, Mechanic/Serviceman/Lubeman, Apprentice Oper/Oiler, Backend Welder on Auto Weld Spread, EMT, Paramedic, Aboriginal Coordinator, Bending Engineer) and 334 equipment types (e.g., Backhoe - Cat 330, Sideboom - Cat 583, Dozer - D6T, Grader - Cat G14, Loader - Cat 966, Picker Truck - 15 Ton, Welding Rig, Lincoln Welder, Pickup - 3/4 Ton, Water Truck, Fuel Truck - Tandem, Lowboy Trailer, Generator - 60 kW, Air Compressor - 900 CFM, ATV/Gator, SUV - Expedition/Lexus/Denali). These classifications are merged from the contractor's rate sheet and the CX2-FC contract to ensure every billable classification is available. Matching is case-insensitive.

### Equipment from OCR
OCR-extracted equipment entries are accepted even when hours are 0 (e.g., idle equipment on standby). Only the equipment type is required — hours default to 0 and can be edited after scanning.

### After Scanning
Always review the extracted data. The OCR is highly accurate but should be verified against the physical ticket. All auto-populated fields are editable inline:
- **Labour**: Employee name (with crew roster autocomplete) and classification (searchable dropdown) can be corrected directly in the table.
- **Equipment**: Equipment type (searchable dropdown) and unit number can be corrected directly in the table.
- The crew roster autocomplete builds over time — names from all activity blocks are saved to localStorage for future suggestions.

---

## SECTION 5: VOICE INPUT

### Supported Fields
Voice input (speech-to-text) is available for: workDescription (activity work description), timeLostDetails (time lost details), safetyNotes (safety notes), landEnvironment (land/environment observations).

### How to Use
1. Tap the microphone Voice button next to any supported field.
2. Speak clearly. The button turns red and shows Stop while recording.
3. Speech is converted to text and appended to the field. Punctuation is auto-added.
4. Tap Stop when finished. The recognition restarts automatically if you pause.

### Spoken Punctuation
You can say punctuation words and they will be converted: "period" becomes a full stop, "comma" becomes a comma, "question mark" becomes ?, "new line" becomes a line break, "new paragraph" becomes a double line break.

### Browser Support
Speech recognition works in Chrome, Edge, and Safari. It requires an internet connection. Firefox is not supported.

---

## SECTION 6: THE SHADOW EFFICIENCY AUDIT

### Overview
The Shadow Efficiency Audit runs inside every activity block. It tracks how crew time is categorized against productivity statuses. This data powers the Inertia Ratio visible on the executive dashboard.

### Production Status Options (from productionStatuses)

Each labour and equipment entry can be flagged with a production status:

| Status | Label | Shadow Multiplier | Meaning |
|---|---|---|---|
| (default) | Working | 100% productive | Crew is actively advancing the project. No hours input shown. |
| SYNC_DELAY | Downtime | 70% productive | Crew is waiting but may do limited work — coordination issues, waiting for materials, minor holdups. Label shows **"Down hrs:"** — enter the hours NOT worked (downtime). The system calculates productive hours automatically. |
| MANAGEMENT_DRAG | Standby | 0% productive | Complete work stoppage due to decisions outside crew control — permits, regulatory holds, waiting for instructions. Label shows **"Standby hrs:"** — enter the hours NOT worked (standby time). The system calculates productive hours automatically. |

### Drag Reasons (from dragReasonCategories)

When a non-Working status is selected, a Drag Reason is required. Common reasons include: Weather, Ground Conditions, Equipment Breakdown, Waiting for Third Party, Material Shortage, Access Issues, Regulatory Hold, Safety Stand-down, First Nations Monitor, Bird Nesting Window, Environmental Window, Landowner Access Issue.

Each drag reason has a Responsible Party (Owner, Contractor, Regulatory, Shared) auto-assigned based on the reason, an Impact Scope indicator (single crew member or entire crew), and some reasons lock to Systemic (entire crew) automatically or require a note.

### Custom Drag Reasons
Inspectors can type custom reasons not in the predefined list. Custom reasons are saved to localStorage for reuse.

### Inertia Ratio Calculation
Inertia Ratio = Total Shadow Hours divided by Total Billed Hours. Shadow Hours = Actual hours multiplied by production multiplier (100% for Working, 70% for Sync Delay, 0% for Management Drag). Billed Hours = Total RT + OT hours logged.

### Inspector's Role
Accurately categorize each labour and equipment entry's production status. The system calculates everything else. Honest, precise logging is what makes the Inertia Ratio meaningful.

---

## SECTION 7: AUTO-SAVE & DRAFT SYSTEM

- The app auto-saves your report to localStorage every 1.5 seconds when any field changes (debounced).
- A periodic backup runs every 30 seconds.
- Drafts are kept for 7 days before expiring.
- When you open a new report, if a draft exists, you'll see a prompt to Restore Draft or Start Fresh.
- Everything is saved except file uploads (photos cannot be serialized). Re-upload photos after restoring a draft.
- Drafts are automatically cleared after a successful save/submit.
- Use the "Clear Draft & Start Fresh" button to manually discard a draft.

---

## SECTION 8: REPORT SUBMISSION & WORKFLOW

### Submit Flow
1. Inspector fills out the report and clicks Submit Report.
2. A Trackable Items modal appears asking: "Have you checked ALL trackable items?" — listing Mats, Rock Trench, Extra Depth Ditch, Bedding & Padding, Temporary Fencing, Ramps, Goal Posts (Power Lines), Access Roads, Hydrovac Holes, Erosion Control, Signage & Flagging, Equipment Cleaning, Weld UPI Items (all 13 types).
3. If confirmed, the report saves to Supabase and goes to the Chief Inspector for review.
4. Reports with welding activities (Welding - Mainline, Welding - Section Crew, Welding - Poor Boy, Welding - Tie-in, Welder Testing) also require Welding Chief review.

### Report Statuses
Draft (saved but not submitted), Submitted (sent to Chief Inspector), Approved (Chief Inspector approved), Revision Requested (Chief Inspector requested changes with notes).

### Editing Reports
Inspectors can edit their own reports. Admin, Chief Inspector, Assistant Chief, and Welding Chief can edit any report. Revision notes from the Chief Inspector display when editing a flagged report. All edits are tracked in the audit trail.

### Offline Mode
If offline, the report saves locally via syncManager. A pending count badge shows reports waiting to sync. Reports sync automatically when connectivity returns.

### PDF Export
Click "Download PDF Copy" to generate a comprehensive PDF of the entire report. The PDF includes:
- **Report header**: Date, inspector, spread, pipeline, AFE, start/end time
- **Weather**: Conditions, temps, wind, precipitation, ROW condition
- **Per activity block**: Activity type, contractor, foreman, start/end KP, metres today/previous, ticket number, work description
- **Manpower table**: Employee name, classification, RT, OT, JH, qty, production status, productive hours, drag reason
- **Equipment table**: Equipment type, unit number, hours, qty, production status, productive hours, drag reason
- **Quality checks**: All fields including collapsible sections (Topsoil horizon separation, Stringing pipe receiving, etc.)
- **Specialized logs**: Full data from all 18 specialized log components (Welding, Bending, Stringing, Coating, Clearing, Ditch, Tie-In, HDD, Grading, Hydrovac, Piling, HD Bores, Equipment Cleaning, Machine Cleanup, Final Cleanup, Welder Testing, Hydrostatic Testing, Counterbore/Transition)
- **Hydrovac**: Contractor/foreman, facility details table
- **Safety**: Safety notes, safety recognition cards, wildlife sightings
- **Land & environment**: Environmental observations
- **Site visitors**: Name, company, position
- **Trackable items**: All categories including Weld UPI Items
- **Unit price items**: Category, item, qty, unit, KP, notes
- **Inspector info**: Mileage, equipment used
- **Document certification**: Document ID, SHA-256 hash, generation timestamp

---

## SECTION 9: TRACKABLE ITEMS

Trackable items are project-wide assets and quantities tracked across reports. Categories include: Mats, Rock Trench, Extra Depth Ditch, Temporary Fencing, Ramps, Goal Posts (Power Lines), Access Roads, Hydrovac Holes, Erosion Control, Signage & Flagging, Equipment Cleaning, Weld UPI Items.

### Auto-Save
Trackable item entries auto-save to Supabase when the inspector leaves a field (on blur). There is no manual Save button — only a Remove button to delete entries.

### Hydrovac Holes
Hydrovac holes are tracked as individual entries in Trackable Items (hole type, action, quantity, KP location, depth, foreign line owner, notes). The Hydrovac Contractor and Foreman are entered once in the HydrovacLog quality checks header — not per hole.

### Single KP Location
All trackable item types use a single **KP** field for location (not From KP / To KP). Enter the chainage where the item is located (e.g., `5+200`).

### Weld UPI Items
The Weld UPI Items category tracks welding-related unit price items such as cut outs, repairs, reworks, and NDT fail repairs. Fields include:
- **UPI Type**: Cut Out, Repair, Rework, NDT Fail Repair, Other
- **Weld Number(s)**: The weld identifier(s) affected (e.g., W-001)
- **KP**: Location chainage
- **Quantity**: Number of items
- **Reason**: N/A, NDT Failure, CAP Failure, Visual Defect, Inspector Request, Other
- **Status**: Completed - Passed, In Progress, Pending Re-test
- **Notes**: Additional details

---

## SECTION 10: APP FEATURES QUICK REFERENCE

| Feature | What It Does | Where / How |
|---|---|---|
| Auto-Fetch Weather | Pulls weather from OpenWeatherMap using pipeline coordinates | Report header — button |
| Auto-Populate Name | Fills inspector name from login profile | Report header — automatic |
| Auto-Populate AFE | Fills AFE from organization's contract config | Report header — automatic |
| Spread to Pipeline Mapping | Auto-fills Pipeline Name when Spread is selected | Report header — on selection |
| GPS KP Sync | Calculates KP from device GPS and pipeline centerline | Activity block — GPS icon next to KP fields |
| Chainage Overlap Detection | Warns if KP range overlaps historical reports | Activity block — automatic |
| Suggested Start KP | Shows where last work ended for this activity type | Activity block — on activity selection |
| OCR Ticket Scanning | Claude Vision extracts data from contractor ticket photos | Activity block — upload ticket photo |
| Crew Roster Autocomplete | Suggests known worker names when typing in labour name fields | Labour name inputs — builds over time via localStorage |
| Inline Edit After OCR | Edit ALL labour fields (name, classification, RT, OT, JH, count) and ALL equipment fields (type, unit number, hours, count) directly in table | Labour/equipment table rows |
| Voice-to-Text | Speech recognition for text fields | Microphone button on supported fields |
| Auto-Calculate Metres | Calculates metres from KP range | Activity block — automatic |
| Auto-Populate Previous Metres | Fetches cumulative metres from historical reports | Activity block — automatic |
| Ovality Calculator | Auto-calculates ovality % from Dmax/Dmin | Bending activity — automatic |
| Minimum Cover Flag | Flags trench depth below spec | Ditch activity — automatic |
| Seed Tag Photo Requirement | Requires seed tag photo for Final Cleanup | Cleanup - Final activity |
| Auto-Save Draft | Saves to localStorage every 1.5s + 30s intervals | Automatic |
| Draft Restore | Prompts to restore or discard saved draft | On new report load |
| Mentor Agent | Real-time field auditing with alerts | Sidebar — alert badges |
| Health Score | Report quality score | Report header indicator |
| Production Status Flags | Working / Sync Delay / Management Drag | Labour/equipment rows |
| Inertia Ratio | Shadow Hours / Billed Hours efficiency score | Executive Dashboard |
| Document ID + SHA-256 | Automatic tamper-proof audit trail | Every saved report |
| PDF Export | Comprehensive PDF with all report data | Submit section — button |
| Offline Mode | Save locally and sync when connected | Automatic when offline |
| Guided Tour | Step-by-step walkthrough | Help button |
| Trackable Items Tracker | Log project-wide tracked assets (auto-saves on blur) | Collapsible section |
| Report Workflow | Submit to Chief Inspector Review to Approve/Revise | Submit button + statuses |

---

## SECTION 11: LABOUR & EQUIPMENT ENTRIES

### Labour Entry Fields
employeeName (full name — with searchable crew roster autocomplete dropdown), classification (from 127 labourClassifications e.g. General Labourer, Principal Oper 1, Utility Welder, Welder Helper, General Foreman, EMT, Paramedic, Aboriginal Coordinator — searchable dropdown), rt (regular time hours, first 8), ot (overtime hours, beyond 8), jh (jump hours/bonus, separate from RT/OT), count (number of workers, editable input, usually 1). All fields (name, classification, RT, OT, JH, count) are editable inline after entry or OCR. Classifications are merged from the contractor's rate sheet and CX2-FC contract — the Reconciliation Dashboard matches these names against imported rates for cost calculations.

### Equipment Entry Fields
type (from 334 equipmentTypes e.g. Backhoe - Cat 330, Sideboom - Cat 583, Dozer - D6T, Welding Rig, Pickup - 3/4 Ton, Water Truck, SUV - Expedition/Lexus/Denali — searchable dropdown), unitNumber (asset ID/fleet number e.g. "U-1234"), hours (hours of use — editable input, can be 0 for idle/standby equipment), count (number of units — editable input, usually 1). All fields (type, unit number, hours, count) are editable inline after entry or OCR.

### RT/OT Auto-Split from OCR
When OCR extracts total hours from a ticket, the app auto-splits: RT = min(totalHours, 8), OT = max(0, totalHours - 8).

---

## SECTION 12: GLOSSARY OF KEY TERMS

| Term | Definition |
|---|---|
| AFE | Authorization for Expenditure — the financial tracking number for the project |
| Activity Block | A single construction activity section within a daily report |
| Anode | A sacrificial metal component in the cathodic protection system |
| API 1169 | American Petroleum Institute standard for Pipeline Construction Inspection |
| Backfill | Returning excavated material to the trench after pipe installation |
| Bedding/Padding | Select material placed around the pipe to protect coating |
| Cathodic Protection (CP) | Electrochemical system that prevents pipe corrosion |
| Chainage | Linear distance along the pipeline from a reference point (KP 0) |
| Counterbore | Machining the pipe end to a specific internal diameter for tie-in welding |
| CP Leads | Wires connecting the pipe to the cathodic protection system |
| Crossing Clearance | Distance between pipeline and other utilities at crossings |
| Dmax/Dmin | Maximum and minimum diameter measurements at a pipe bend |
| Document ID | Unique identifier auto-assigned to every Pipe-Up report |
| Drag Reason | Documented cause of non-productive time |
| Field Joint Coating | Corrosion protection applied at weld locations in the field |
| GPS KP Sync | Feature that calculates chainage from device GPS and pipeline centerline |
| Heat Number | Manufacturer's batch tracking number for steel pipe |
| Holiday | A defect in pipe coating that exposes bare steel |
| Holiday Test (Jeeping) | Electrical test to detect coating defects using a high-voltage probe |
| Hydrostatic Test | Pressure test filling the pipeline with water to verify it is leak-free |
| Inertia Ratio | Shadow Hours divided by Billed Hours — real-time efficiency metric |
| Joint Number | Sequential identifier for each pipe joint on the project |
| JH (Jump Hours) | Bonus hours paid to workers — separate from RT and OT |
| KP | Kilometre Post — distance along the pipeline in X+XXX format |
| Lower-in | Using sidebooms to place the welded pipeline into the trench |
| Management Drag | Complete work stoppage due to decisions outside crew control (0% productive) |
| Mat Tracker | Pipe-Up feature for logging access mat movements |
| Mentor Agent | AI-powered real-time auditor that checks field values against thresholds |
| Minimum Cover | Required minimum depth of soil above the top of the pipe |
| OCR Ticket Scanning | Claude Vision-powered extraction of data from contractor ticket photos |
| Ovality | Pipe deformation from a perfect circle, expressed as a percentage |
| Pipe Tally | Running count and record of all pipe joints on the project |
| Production Status | Working, Sync Delay, or Management Drag classification for efficiency tracking |
| Ripping | Using a deep ripper to de-compact soil after heavy equipment use |
| ROW | Right-of-Way — the strip of land designated for pipeline construction |
| Seed Mix ID | Product identifier for the seed blend used in restoration |
| Seed Tag | Physical label on seed bag showing composition and lot number — photo required |
| SHA-256 Hash | Cryptographic hash for tamper-proof report verification |
| Shadow Hours | Adjusted hours based on production status multiplier |
| Spread | A geographic segment of the pipeline project |
| Stringing | Distributing pipe joints along the ROW before welding |
| Sync Delay | Crew waiting but doing limited work — coordination issues (70% productive) |
| Tie-in | A weld connecting two pre-assembled pipeline sections |
| Timber Deck | Designated area where salvaged timber is stacked and cataloged |
| Trackable Items | Project-wide tracked assets (mats, fencing, erosion control, etc.) |
| Trench Crown | Deliberate mound of soil over the pipeline trench for settlement |
| UPI | Unit Price Item — a tracked line item for billing (e.g., weld cut outs, repairs, reworks) |
| WPS | Welding Procedure Specification — approved parameters for each weld type |

---

## SECTION 13: COMMON INSPECTOR QUESTIONS

**Q: How do I start my day in the app?**
A: Open a new Daily Report. Your name auto-fills from your login. Select your Spread (Pipeline Name and AFE auto-populate). Tap Auto-Fetch Weather. Enter ROW Condition and Start Time. Then add Activity Blocks for each activity you'll inspect.

**Q: What if the weather button doesn't work?**
A: Make sure you've selected a Pipeline first — weather is fetched based on the pipeline's GPS coordinates, not your device. If the API is down or you're offline, enter weather manually.

**Q: How do I scan a contractor ticket?**
A: In an activity block, upload a photo of the contractor's daily ticket. The app will automatically run OCR using Claude Vision to extract labour and equipment data. Review the extracted data and make any corrections.

**Q: Can I scan a multi-page ticket?**
A: Yes. Upload multiple photos for a single ticket. The app processes all pages together and combines the data without duplicates. The indicator will show "X pages attached" and the photo viewer displays all pages in a scrollable view with page numbers.

**Q: How does voice input work?**
A: Tap the microphone Voice button next to any text field (work description, safety notes, comments). Speak clearly — text is transcribed in real-time. Tap Stop when done. Works in Chrome, Edge, and Safari.

**Q: What's the difference between Downtime and Standby?**
A: Downtime (labeled "Down hrs:" in the app) means the crew is waiting but may do some limited work (70% productive) — things like coordination issues or waiting for materials to arrive. Standby (labeled "Standby hrs:" in the app) means a complete work stoppage due to decisions outside crew control (0% productive) — permits, regulatory holds, waiting for instructions. In both cases, enter the hours NOT worked — the system calculates productive hours automatically. When you change a worker's status to Downtime or Standby, the hours field starts blank so you can enter the actual downtime amount.

**Q: The app is warning me about a chainage overlap. What do I do?**
A: The app detected that your KP range overlaps with a previous report for the same activity. If this is intentional (rework, correction), provide a reason in the overlap explanation field. If it's a mistake, adjust your Start/End KP.

**Q: The trench looks shallow — how do I check minimum cover?**
A: Select the "Ditch" activity type. The DitchInspection component will prompt you for trench width and depth. The app automatically checks against minimum cover requirements and flags if insufficient.

**Q: Why can't I complete the Final Cleanup activity?**
A: The Cleanup - Final log requires a seed tag photo. Upload a clear photo of the physical seed tag showing mix composition and lot number.

**Q: What are Trackable Items and why does a modal pop up before I submit?**
A: Trackable Items are project-wide assets (mats, fencing, erosion control, weld UPI items, etc.) that need to be logged consistently. The pre-submit modal reminds you to check all categories before submission.

**Q: What happens if I lose internet while filling out a report?**
A: The app has offline mode. Your report auto-saves to your device. When connectivity returns, it syncs automatically. You'll see a pending count badge showing reports waiting to sync.

**Q: What is the Mentor Agent and why am I seeing alerts?**
A: The Mentor Agent is an AI auditor that checks your field entries in real-time against expected ranges and thresholds. If a value seems unusual (e.g., abnormal preheat temperature), it flags an alert. You can acknowledge, override with a reason, or dismiss alerts.

**Q: How do I edit a submitted report?**
A: From the Previous Reports list, select the report to edit. If the Chief Inspector has requested a revision, you'll see their notes. Make corrections and re-submit. All edits are tracked in the audit trail.

**Q: Do I need to do anything for the audit trail?**
A: No. Every report is automatically assigned a unique Document ID and SHA-256 Hash. Your job is to log accurate, complete data — the system handles compliance.

**Q: What is the Health Score?**
A: The Health Score is calculated by the ReportHealthScorer based on completeness and quality of your report data. It's visible to you and reviewers as a quality indicator. If quality fields are incomplete, the Field Completeness section lists the specific field names that are missing (e.g., "Preheat Temp, Interpass Temp, Root Bead Visual") so you know exactly what to fill in.

**Q: Can I download a PDF of my report?**
A: Yes. Click "Download PDF Copy" at the bottom of the report. The PDF includes all activity blocks, specialized log data, labour/equipment tables, and quality checks.

**Q: What is the KP format and how does auto-conversion work?**
A: KP stands for Kilometre Post. Format is X+XXX (e.g., 6+500 means 6.5 km). If you type 6500, the app converts it to 6+500. If you type 6.5, it converts to 6+500. If you type 500, it converts to 0+500.

**Q: How does GPS KP Sync work?**
A: Tap the GPS icon next to the Start KP or End KP field. The app reads your device's GPS coordinates, calculates the nearest point on the pipeline centerline, and auto-fills the KP value. It also shows your distance from the ROW centerline. If you accidentally block GPS permission, follow the on-screen instructions to re-enable it in your browser settings.

**Q: OCR got a worker's name or equipment type wrong — can I fix it?**
A: Yes. All labour and equipment fields are editable directly in the table after OCR. Tap the name to type a correction — a searchable dropdown will show matching crew names from the running roster as you type. Tap a suggestion to select it. Classification and equipment type also have searchable dropdowns.

**Q: I got a popup saying "Please enter classification and at least one hour type" on a saved report — why?**
A: This was a validation bug that occurred when OCR set hours to exactly 0 (zero). The app was treating 0 as "empty" because of how JavaScript evaluates numbers. This has been fixed — entries with 0 hours are now accepted. If you see this on an old draft, re-entering any value in RT, OT, or JH will clear the issue.

**Q: How do I upload labour or equipment rates?**
A: Go to the Admin Portal → Import Rate Sheets tab. Select the Labour Rates or Equipment Rates sub-tab. Upload the contractor's rate sheet — any format works: CSV, Excel (.xlsx/.xls), PDF, or even a photo of the document. AI reads the file automatically and extracts every classification or equipment type with its rates. You'll see a preview table where you can edit, add, or delete rows before importing. Click the blue "Import X Rates" button at the bottom to save them to the database. OT (1.5x) and DT (2x) are auto-calculated if only straight time is provided. You can also click "enter rates manually" to type them in by hand. Rate data is saved via a secure server-side API route — the database key never touches the browser.

**Q: I uploaded rates but they disappeared when I switched tabs?**
A: This was a bug that has been fixed. Previously, switching between Labour and Equipment tabs could show empty tables due to a database permission issue. The fix routes all rate reads and writes through a server-side API (`/api/rates`) that uses the database service key securely. If you uploaded rates before this fix, they may not have saved — re-upload the CSV files and click Import.

**Q: How do I create a timesheet from my daily reports?**
A: Click the "My Invoices" button at the top of any report or from the Inspector App. This takes you to the My Timesheets & Invoices page. Click "Create New Timesheet," select the date range, and click "Auto-Populate from Daily Tickets." The system pulls data from your submitted daily reports: activities become work descriptions, your inspector mileage becomes KMs, truck is automatically checked for every field day, and equipment flags (ATV, radio, FOB) are detected from your inspector equipment selections. You can review and adjust any line before submitting.

**Q: I added a visitor but it didn't show up in the PDF — what happened?**
A: Previously, if you typed into the visitor Name/Company/Position fields but didn't click "Add Visitor," the data was lost on save. This has been fixed — the save function now automatically captures any filled visitor input fields and adds them to the visitor list before saving, so your data is preserved even if you forget to click the Add button.

**Q: I can't access my timesheet review after submitting — it sends me back to the report page?**
A: This was a routing permission issue that has been fixed. The timesheet review page now allows inspector access so you can view your submitted timesheets. Click "Review" from the My Timesheets & Invoices page to see your timesheet details.

---

*End of Pipe-Up Field Inspection Guide — Agent Knowledge Base v3.2*
*Source: InspectorReport.jsx (7,650+ lines) + ActivityBlock.jsx (3,170+ lines)*
