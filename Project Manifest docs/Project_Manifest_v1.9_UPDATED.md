# PIPE-UP PIPELINE INSPECTOR PLATFORM
## Project Manifest - February 4, 2026

---

## 1. PROJECT OVERVIEW

**Project Name:** Pipe-Up Pipeline Inspector Platform
**Client:** FortisBC EGP - Eagle Mountain Woodfibre Gas Pipeline
**Production URL:** https://app.pipe-up.ca
**Repository:** https://github.com/rickjudson-1959/Inspection-App-and-Dashboard

### Technology Stack
| Component | Technology |
|-----------|------------|
| Frontend | React 18.2.0 with Vite + PWA |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| AI Analysis | Anthropic Claude API (AI Agent) |
| Email API | Resend |
| Deployment | Vercel |
| PDF Generation | jsPDF + jsPDF-autotable |
| Excel Export | XLSX |
| Mapping | Leaflet + React-Leaflet |
| Charting | Recharts |
| Offline Storage | IndexedDB (idb) |
| Service Worker | Workbox (vite-plugin-pwa) |

---

## STANDING INSTRUCTIONS

> **FIELD GUIDE SYNC REQUIREMENT:** Any changes to the inspector's report (`InspectorReport.jsx`), activity blocks (`ActivityBlock.jsx`), or related form components must be reflected in the Pipe-Up Field Guide (`pipe-up-field-guide-agent-kb.md`). After making such changes, regenerate the field guide, re-upload it to the `field_guide` slot in the Technical Resource Library, and re-index it via the `process-document` edge function. The field guide is the AI agent's knowledge base — if it falls out of sync, inspectors will get incorrect guidance. **Check this at the start of every session and after every conversation compression.**

---

## 2. USER ROLES & ACCESS

| Role | Access Level |
|------|--------------|
| `super_admin` | Full system access |
| `admin` | Project administration |
| `chief_inspector` | Field inspection chief, report approval |
| `assistant_chief_inspector` | Assistant to chief |
| `welding_chief` | Welding operations monitoring & reporting |
| `inspector` | Field data entry |
| `pm` | Project manager dashboards |
| `cm` | Construction manager dashboards |
| `executive` | Executive dashboards & summaries |
| `ndt_auditor` | NDT monitoring & auditing |

---

## 3. CORE FEATURES

### Offline Mode (PWA)
- Full offline capability for field inspectors
- Reports saved to IndexedDB when offline
- Photos stored as blobs locally
- Automatic sync when connectivity restored
- Visual status bar (green=online, orange=offline)
- Pending report count and "Sync Now" button
- iOS/Android mobile optimized

### Inspector Field Entry
- Activity logging with KP (kilometer post) ranges
- Quality/compliance checklists per activity type
- Photo capture with GPS/EXIF geolocation extraction
- Labour classification tracking (127 classifications — merged from rate sheet + CX2-FC contract)
- Equipment hour recording (334 equipment types — merged from rate sheet + CX2-FC contract)
- Weather condition logging with offline cache
- Digital signature capture

### Activity Types (25 Supported)
1. Clearing
2. Access
3. Topsoil (with horizon separation tracking)
4. Grading
5. Stringing (pipe receiving inspection)
6. Bending
7. Welding - Mainline
8. Welding - Section Crew
9. Welding - Poor Boy
10. Welding - Tie-in
11. Coating
12. Ditch (with BOT checklist, pay items)
13. Lower-in
14. Backfill
15. Tie-in Completion
16. Cleanup - Machine
17. Cleanup - Final
18. Hydrostatic Testing
19. HDD (Horizontal Directional Drilling)
20. HD Bores
21. Piling
22. Equipment Cleaning
23. Hydrovac
24. Welder Testing
25. Counterbore/Transition

### Inspector Invoicing System
- Inspector profile management (company/banking info)
- Rate card configuration (daily rates, per diem, allowances)
- Timesheet entry with daily categorization
- Auto-calculation of invoice totals
- Workflow: Draft → Submitted → Review → Approved → Paid
- PDF invoice generation
- Email notifications on approval/revision
- Hire-on package completion

### Dashboards
- **CMT Dashboard** - Cost Management Tracking with progress charts
- **EVM Dashboard** - Earned Value Management metrics
- **Chief Dashboard** - Daily summaries, report approval, NDT tracking
- **Assistant Chief Dashboard** - Support functions
- **Welding Chief Dashboard** - Welding operations, welder performance, WPS compliance, daily reports with digital signature
- **Admin Portal** - User/org/project management
- **Inspector Invoicing** - Timesheet management
- **NDT Auditor Dashboard** - NDT monitoring
- **Reconciliation Dashboard** - Financial reconciliation

### Reporting & Export
- PDF report generation with all activity data
- Excel data export
- Weekly executive summary emails (automated)
- Audit trail reports
- Progress tracking by phase

### Document Control & Handover
- Project Document Vault with 9 categories
- Traffic light status (green=uploaded, red=missing)
- ITP Sign-off Matrix (3 roles required for ACTIVE status)
- Digital signature capture with timestamps
- Document version control (Rev 0, Rev 1, Rev 2...)
- Owner DC compatibility with custom metadata fields
- Sync status workflow (internal → transmitted → acknowledged → rejected)
- Transmittal Generator with PDF output
- Project Handover Package (ZIP with nested folders)
- SHA-256 manifest CSV for integrity verification
- Technical Resource Library (global read-only references)

---

## 4. DATABASE SCHEMA (SUPABASE)

### Inspector Invoicing Tables

**inspector_profiles**
- Company and banking information
- Profile completion status
- Cleared to work flag

**inspector_documents**
- Certifications, licenses, insurance
- Expiry date tracking
- Verification workflow

**inspector_rate_cards**
- Daily field rate, per diem, allowances
- Truck rate, km rate, thresholds
- Effective date ranges

**inspector_timesheets**
- Period dates, project info
- Summary totals (days, kms, amounts)
- Workflow status tracking
- Approval chain timestamps

**inspector_timesheet_lines**
- Daily line items
- Work type flags
- Auto-populated from daily tickets

### Ditch/Trench Inspection Tables

**trench_logs**
- Report linkage, KP range
- Trench measurements (width, depth, cover)
- Pay items (padding/bedding with From KP/To KP)
- BOT checklist (rocks, debris, silt fences, wildlife)
- Water management (pumping, filter bags)
- Soil conditions, depth compliance

**trench_log_photos**
- Geotagged photo evidence
- GPS coordinates (6-decimal precision)
- Photo type categorization

### HDD Drilling Waste Management Tables (NEW - January 2026)

**drilling_waste_logs**
- Report linkage, bore/crossing ID
- Mud mixing data (total volume, storage, hauled)
- Disposal tracking (method, location, manifest)
- Testing compliance (salinity, toxicity, metals)
- Certification (inspector sign-off)

**drilling_waste_additives**
- Product name, type, manufacturer
- Quantity used, units
- SDS availability tracking

**drilling_waste_photos**
- Geotagged evidence photos
- Photo types: mud_system, disposal, testing, manifest, spill, general
- GPS coordinates (6-decimal precision)

### HDD Steering/Bore Path Tables (NEW - January 2026)

**bore_path_logs**
- Report linkage, bore/crossing/weld ID
- Guidance system setup (type, frequency, calibration)
- Design vs actual entry/exit angles
- Pipe specifications for bending radius calculation
- Status tracking (within tolerance, complete, adjusted)

**bore_path_stations**
- Per-joint steering data entries
- Position data (depth, pitch, azimuth, KP)
- Offset from design (horizontal/vertical)
- Bending radius alerts

**bore_path_documents**
- Uploaded bore logs, steering reports
- GPS metadata from photos
- Document type categorization

### Trackable Items

**bedding_padding** (NEW - January 2026)
- Protection types: Bedding, Padding, Bedding and Padding, Pipe Protection, Rockshield, Lagging, Rockshield and Lagging
- KP Location (single field)
- Length, Material, Depth/Thickness
- Action, Equipment, Notes

### Document Control Tables (NEW - February 2026)

**project_documents**
- Organization-scoped document vault
- Category tracking (prime_contract, scope_of_work, ifc_drawings, etc.)
- Version control (version_number, is_current)
- ITP sign-offs (JSONB with role-based signatures)
- Owner DC sync status (internal, transmitted, acknowledged, rejected)
- Custom metadata (JSONB)
- Addenda support (is_addendum, parent_document_id)
- Global flag for Technical Resource Library

**transmittals**
- Transmittal tracking and generation
- Document linkage
- From/To parties
- Subject and notes

**contract_config**
- Per-organization project configuration
- Contract number, workday hours, AP email
- Project boundaries (start/end KP)
- Custom document fields (JSONB array)

---

## 5. SOURCE FILE STRUCTURE

```
/src/
├── main.jsx                    # App entry point (imports App.jsx)
├── App.jsx                     # Routing & multi-tenant org-scoped access
├── AuthContext.jsx             # Authentication management
├── ProtectedRoute.jsx          # Role-based route protection
├── supabase.js                 # Supabase client
├── constants.js                # Activity types, classifications
│
├── contexts/
│   └── OrgContext.jsx          # Multi-tenant organization context
│
├── utils/
│   └── queryHelpers.js         # Org-scoped query helpers (useOrgQuery)
│
├── Dashboards/
│   ├── Dashboard.jsx           # CMT Dashboard
│   ├── EVMDashboard.jsx        # Earned Value Management
│   ├── ChiefDashboard.jsx      # Chief Inspector
│   ├── AssistantChiefDashboard.jsx
│   ├── WeldingChiefDashboard.jsx  # Welding Chief (NEW - Feb 2026)
│   ├── AdminPortal.jsx         # Administration
│   ├── InspectorInvoicingDashboard.jsx
│   └── NDTAuditorDashboard.jsx
│
├── Reports/
│   ├── InspectorReport.jsx     # Main field report form
│   ├── ActivityBlock.jsx       # Activity module component
│   ├── ReportViewer.jsx        # Report display
│   └── ReportsPage.jsx
│
├── Activity Logs/
│   ├── BendingLog.jsx
│   ├── ClearingLog.jsx
│   ├── CoatingLog.jsx
│   ├── DitchInspection.jsx     # Ditch with DB integration
│   ├── GradingLog.jsx
│   ├── HDDLog.jsx              # Collapsible sections, waste mgmt, steering log
│   ├── HDDSteeringLog.jsx      # NEW - Bore path tracking (Jan 2026)
│   ├── DrillingWasteManagement.jsx  # NEW - Directive 050 (Jan 2026)
│   ├── HydrotestLog.jsx
│   ├── MainlineWeldData.jsx
│   ├── PilingLog.jsx
│   ├── StringingLog.jsx
│   ├── TieInCompletionLog.jsx
│   └── [+12 more log components]
│
├── Invoicing/
│   ├── HireOnPackage.jsx       # Inspector onboarding
│   ├── TimesheetEditor.jsx     # Timesheet entry
│   ├── TimesheetReview.jsx     # Admin review
│   └── InvoicePDF.jsx          # PDF generation
│
├── Utilities/
│   ├── auditLoggerV3.js        # Audit trail logging
│   ├── useActivityAudit.js     # Audit React hook
│   ├── weatherService.js       # Weather API integration
│   ├── exifUtils.js            # Photo GPS extraction
│   ├── kpUtils.js              # KP formatting
│   ├── chiefReportHelpers.js   # Report aggregation
│   ├── weldingChiefHelpers.js  # Welding Chief data aggregation (NEW - Feb 2026)
│   └── weldingChiefPDF.js      # Welding Chief PDF generation (NEW - Feb 2026)
│
├── offline/                     # PWA Offline Support (NEW - Jan 2026)
│   ├── db.js                   # IndexedDB schema
│   ├── syncManager.js          # Offline save & sync logic
│   ├── chainageCache.js        # KP data cache
│   ├── hooks.js                # useOnlineStatus, useSyncStatus
│   └── index.js                # Barrel export
│
└── Components/
    ├── common/
    │   ├── ShieldedInput.jsx    # Ref-Shield input (focus-locked local state) (NEW - Feb 2026)
    │   └── ShieldedSearch.jsx   # Ref-Shield search with 300ms debounce (NEW - Feb 2026)
    ├── BufferedInput.jsx        # Re-export → ShieldedInput (backward compat)
    ├── BufferedSearch.jsx       # Re-export → ShieldedSearch (backward compat)
    ├── TrackableItemsTracker.jsx
    ├── SignaturePad.jsx         # Digital signature capture (ITP sign-offs)
    ├── TenantSwitcher.jsx       # Organization switcher dropdown
    ├── AIAgentStatusIcon.jsx    # AI Watcher status indicator (NEW - Feb 2026)
    ├── MapDashboard.jsx
    ├── OfflineStatusBar.jsx     # PWA status indicator (NEW - Jan 2026)
    └── [supporting components]

/supabase/migrations/
├── create_inspector_invoicing_tables.sql
├── create_trench_logs.sql
├── 20260120_add_padding_bedding_kp_columns.sql
├── 20260121_create_drilling_waste_logs.sql   # Directive 050
├── 20260121_create_bore_path_data.sql        # Steering log
├── 20260131_create_contract_config.sql       # Project governance
├── 20260131_01_create_memberships_table.sql  # Multi-tenant
├── 20260201_create_project_documents.sql     # Document vault
├── 20260201_add_signoffs_column.sql          # ITP signatures
├── 20260201_document_versioning.sql          # Version control
├── 20260201_document_metadata.sql            # Owner DC fields
├── 20260201_document_sync_status.sql         # Sync tracking
├── 20260201_create_signatures_bucket.sql     # Signature storage
├── 20260201_create_handovers_bucket.sql      # Handover ZIP storage
├── 20260201_create_ai_agent_tables.sql       # AI agent logs
├── 20260202_create_wps_material_specs.sql    # WPS material validation
└── [other migrations]
```

---

## 6. RECENT UPDATES (January/February 2026)

### Report-Aware AI Agent, Health Check UX & Multi-Page Ticket Fix (February 19, 2026)

**AI agent can now answer questions about the inspector's current report, health check messages tell you exactly where to fix issues, multi-page ticket photos accumulate instead of replacing**

1. **Report-aware AI agent (v2.4.0)** — The "Ask the Agent" panel now passes a complete report context summary to the mentor-nlq edge function. Includes: report header (date, inspector, spread, weather), all activity blocks (contractor, KP range, metres, labour entries with names/hours, equipment with unit numbers, quality field values, work descriptions, time lost), safety notes, and health score. Inspectors can ask "how many workers on my trenching block?" or "what's my total metres today?" and get accurate answers. Updated system prompt prioritizes report data for report-specific questions while still using RAG knowledge base for specs/standards.

2. **Health check messages specific and actionable** — Every health check issue now includes the block number, activity type, and exact section to navigate to. Examples: `Block #2 "Backfill" (KP 12) — add concealed-work photos in the "Work Photos" section`, `Block #1 "Welding" (KP 78) — 5 quality fields to complete. Open "Quality Checks" and fill in → Preheat: Field1 | Visual Inspection: Field2`. Quality field issues grouped by collapsible section name.

3. **Multi-page ticket photo accumulation** — Fixed bug where adding a second ticket photo page replaced the first. `processTicketOCR` now appends new photos to existing ones. OCR only processes new photos to avoid duplicating labour/equipment entries. Save logic merges new uploads with existing saved filenames for edit mode. Remove button clears all photo state including plural saved URLs.

4. **Illness/personal reason added as downtime option** — New drag reason under Contractor Responsibility for when a worker is absent due to illness or personal reasons. No note required (privacy).

**Field Guide updated to v3.5** — Re-uploaded and re-indexed.

**Files Modified:**
```
src/InspectorReport.jsx        # Report context memo, useMemo import, pass reportContext to panel
src/components/AskTheAgentPanel.jsx  # Accept/pass reportContext prop, updated placeholder text
src/agents/NLQueryService.js    # Pass report_context to edge function
supabase/functions/mentor-nlq/index.ts  # Accept report_context, include in system prompt, max_tokens 800
src/agents/ReportHealthScorer.js  # Block numbers, activity types, section navigation in all issues
src/ActivityBlock.jsx           # Ticket photo accumulation, Remove clears all state
src/constants.js                # illness_personal drag reason
src/version.js                  # 2.3.8 → 2.4.0
```

---

### Trackable Items DB Schema Gap Fix & PDF Improvements (February 19, 2026)

**Fixed silent data loss: 29 missing DB columns added, dynamic save, enriched PDF descriptions**

1. **29 missing DB columns added** — The `trackable_items` table was missing columns for many type-specific form fields. Data entered by inspectors was silently discarded on save. Added columns via migration: `length`, `rock_type`, `equipment`, `depth_achieved`, `spec_depth`, `extra_depth_amount`, `total_depth`, `reason`, `in_drawings`, `approved_by`, `protection_type`, `material`, `ramp_material`, `mats_used`, `mat_count`, `utility_owner`, `post_material`, `material_compliant`, `authorized_clearance`, `posted_height`, `danger_sign`, `reflective_signage`, `grounding_required`, `grounding_installed`, `offset_distance`, `offset_compliant`, `upi_type`, `weld_number`, `status`.

2. **Dynamic saveItem function** — Replaced hardcoded 12-field save with dynamic approach that iterates over each item type's field definitions and persists all fields with matching DB columns. Added `TRACKABLE_DB_COLUMNS` set and `FIELD_TO_DB` mapping for field name mismatches (e.g., `inspection_pass` → `inspection_status`).

3. **Bedding & Padding added to PDF** — Added `bedding_padding` to PDF typeLabels and description builder with protection type, material, depth, and length.

4. **Enriched PDF descriptions for all types** — Goalposts now include safety compliance fields (material, height, offset compliance). Ramps include material, foreign owner, crossing ID. Rock trench includes spec depth and equipment. Extra depth includes reason and approver. Access fixed from `road_type` (non-existent) to `access_type`.

5. **Equipment cleaning field mapping fixed** — PDF description now handles both `inspection_pass` (form field name) and `inspection_status` (DB column name).

6. **Console logging for PDF trackable items** — Added `[PDF]` prefixed logs showing in-memory count, DB fallback query results, and render count for debugging.

**Field Guide updated to v3.4** — Re-uploaded and re-indexed.

**Migration:**
```
supabase/migrations/20260219_add_trackable_items_columns.sql  # 29 ALTER TABLE ADD COLUMN
```

**Files Modified:**
```
src/TrackableItemsTracker.jsx  # TRACKABLE_DB_COLUMNS, FIELD_TO_DB, dynamic saveItem
src/InspectorReport.jsx        # PDF bedding_padding, enriched descriptions, logging
src/version.js                 # 2.3.7 → 2.3.8
```

---

### Welding, Downtime & Trackable Items Fixes (February 17, 2026)

**Heat input, downtime display, and KP simplification from continued field testing**

1. **Weld heat input auto-calculation at creation** — New weld entries now calculate heat input immediately from default voltage/amperage/travelSpeed values instead of starting as null. Previously, heat input only calculated when an inspector manually edited one of the three trigger fields — if they accepted defaults, it stayed null (showed as "-"). Also backfills existing saved entries that have valid parameters but null heat input. Fixed in both MainlineWeldData.jsx and TieInWeldData.jsx.

2. **Time Tracking section renamed** — "Time Tracking" section in Mainline Weld Data renamed to "Total Weld Time Tracking" for clarity.

3. **Downtime display inverted** — "Down hrs:" and "Standby hrs:" inputs in labour and equipment flag rows now show time NOT worked (actual downtime) instead of productive hours. Previously the label said "Down hrs" but displayed productive hours, which was confusing. The underlying shadow data model (shadowEffectiveHours = productive hours) is unchanged, so all dashboard calculations remain correct.

4. **Trackable items KP simplified** — Replaced "From KP" / "To KP" field pair with a single "KP" field across all 8 trackable item types that used the pair (mats, rock trench, extra depth, bedding & padding, fencing, access roads, erosion control, weld UPI). Types that already used single KP (ramps, goalposts, hydrovac, signage, equipment cleaning) were unchanged.

5. **Health score lists specific incomplete fields** — The Field Completeness section of the Report Health Score now lists the actual field labels that are missing (e.g., "Preheat Temp, Interpass Temp, Root Bead Visual") instead of just showing "12 quality fields incomplete". Inspectors now know exactly which fields to fill in.

6. **Pre-submit trackable items modal completed** — The "STOP! Check Trackable Items" confirmation modal now lists all 13 trackable item types. Previously missing Bedding & Padding and Weld UPI Items.

**Field Guide updated to v2.7** — Re-uploaded and re-indexed (version 8).

**Files Modified:**
```
src/MainlineWeldData.jsx      # Heat input at creation, backfill, section rename
src/TieInWeldData.jsx         # Heat input at creation, backfill
src/ActivityBlock.jsx         # Downtime display inverted for labour + equipment
src/TrackableItemsTracker.jsx # Single KP field, save mapping cleanup
src/InspectorReport.jsx       # PDF descriptions, save mapping, trackable items modal
src/ReportViewer.jsx          # Single KP column in trackable items table
src/CrossingSupport.jsx       # Removed redundant from_kp/to_kp
src/agents/ReportHealthScorer.js  # List specific incomplete field names
pipe-up-field-guide-agent-kb.md  # v2.4 → v2.7
```

---

### Self-Healing Recovery & Work Photo Edit Fix (February 17, 2026)

**Made the app bulletproof — automatic recovery from stale caches, fixed crash when editing reports with photos**

1. **Self-healing recovery system** — Added an inline script to `index.html` that runs BEFORE React and catches any module load failures (MIME type errors, missing chunks, failed dynamic imports). On failure it shows an "Updating App" spinner, clears all caches, unregisters the service worker, and reloads with a cache-busting URL. Max 2 automatic retries with a manual "Try Again" button as fallback. Users never see a blank page.

2. **Service worker CacheFirst removed** — The `CacheFirst` strategy for scripts/styles/images was caching old JS chunk files indefinitely. After deployments, the old SW served stale chunk URLs that no longer existed on the server, causing Vercel to return HTML 404 pages → "MIME type text/html" errors. Removed the runtime asset cache entirely — precaching handles versioned assets with proper cache invalidation.

3. **Catch-all fetch handler removed** — The SW had a broad `caches.match(event.request, { ignoreSearch: true })` handler that intercepted ALL same-origin requests and could serve wrong cached content. Now only navigation requests are intercepted (for offline SPA support).

4. **SW registration race condition fixed** — `sw-register.js` was aggressively reloading the page on every `updatefound` and `controllerchange` event, racing with `UpdatePrompt.jsx`'s cache-clearing flow. Removed the auto-reload — `UpdatePrompt` now handles the full update lifecycle.

5. **Work photo edit crash fixed** — Editing a saved report with work photos crashed with `TypeError: Failed to execute 'createObjectURL'`. Saved photos are database metadata (filenames, URLs) not File objects. Fixed by pre-computing Supabase storage URLs during edit mode loading and updating the renderer to handle both new File uploads and saved URL strings. Re-saving preserves existing photos without re-uploading.

6. **Stale `inspector_email` field removed** — The online save path still had `inspector_email: userProfile?.email` which wrote to a non-existent column in `daily_reports`. Removed.

7. **Version bumped to 2.3.7** — Triggers `UpdatePrompt`'s auto-cache-clear for all existing users on next visit.

**Field Guide updated to v3.3** — Re-uploaded and re-indexed.

**Files Modified:**
```
index.html                 # Self-healing recovery script (runs before React)
public/sw-register.js      # Removed aggressive auto-reload, log-only on SW events
src/sw-custom.js           # Removed CacheFirst, removed catch-all fetch handler, clear stale caches on activate
src/InspectorReport.jsx    # Pre-compute work photo URLs for edit mode, preserve saved photos on re-save, remove inspector_email
src/ActivityBlock.jsx       # Handle saved photo URLs in renderer, instanceof File guards
src/version.js             # 2.3.6 → 2.3.7
pipe-up-field-guide-agent-kb.md  # v3.2 → v3.3
```

---

### Editable Fields, Visitor Save, Timesheet Fixes (February 19, 2026)

**Fixed 6 issues from Access Report field testing — dropdown clipping, editable fields, visitor save, timesheet routing, truck & KM auto-populate**

1. **SearchableSelect dropdown clipping fixed** — Dropdowns in labour/equipment tables were clipped by the table's `overflowX: auto` wrapper. Changed from `position: absolute` to `position: fixed` with viewport coordinates calculated via `getBoundingClientRect()`. Dropdown auto-closes on scroll to prevent stale positioning. z-index bumped to 9999.

2. **All table fields now editable** — Labour count, equipment hours, and equipment count were plain text after OCR entry. Changed to editable input fields so inspectors can correct any value after OCR import or manual entry. All fields in both tables (name, classification, RT, OT, JH, count for labour; type, unit number, hours, count for equipment) are now fully editable.

3. **Visitor data auto-saved on report submit** — If the inspector typed into the visitor Name/Company/Position fields but didn't click "Add Visitor," the data was silently lost. Now the save function auto-captures any filled visitor input fields before saving, ensuring data is never lost.

4. **Timesheet Review route allows inspectors** — The `timesheet-review` route was restricted to chief/admin roles only. Inspectors clicking "Review" on their submitted timesheets were bounced back. Added `inspector` to the allowed roles.

5. **Truck defaults to true for every field day** — Timesheet auto-populate only checked truck when `km_driven > 0`. Since every inspector has a truck, truck is now assumed for all field days.

6. **KMs auto-populate from correct field** — The report saves mileage as `inspector_mileage` but the timesheet was reading `km_driven` (non-existent column). Fixed to read `inspector_mileage` with `km_driven` as fallback.

**Field Guide updated to v3.2** — Re-uploaded and re-indexed.

**Files Modified:**
```
src/ActivityBlock.jsx       # position:fixed dropdown, editable hours/count fields, scroll close
src/InspectorReport.jsx     # Auto-capture unsaved visitor data on save
src/App.jsx                 # Add inspector role to timesheet-review route
src/TimesheetEditor.jsx     # Truck=true default, read inspector_mileage for KMs
pipe-up-field-guide-agent-kb.md  # v3.1 → v3.2
```

---

### Classification Sync & Dashboard Rate Integration (February 19, 2026)

**Merged rate sheet classifications into inspector dropdowns and fixed dashboard rate reads**

1. **Labour classifications expanded (72 → 127)** — All classifications from the imported contractor rate sheet merged into `constants.js`. Inspectors can now select every billable classification from the dropdown (e.g., Aboriginal Coordinator, EMT, Paramedic, Backend Welder, Bending Engineer, Mandrel Operator, etc.). Names use the rate sheet format (Title Case) for exact matching with imported rates.

2. **Equipment types expanded (317 → 334)** — 17 new equipment types from the rate sheet added (e.g., Aqua Dams, D5 LPG C/W Roto Slasher, Snow Blower attachment, SUV - Expedition/Lexus/Denali). All existing entries preserved.

3. **Reconciliation Dashboard rate reads fixed** — Changed from `supabase.from('labour_rates')` (blocked by RLS, returned empty arrays) to `/api/rates` server-side endpoint. Cost calculations now correctly look up imported rates by classification name.

**Field Guide updated to v3.1** — Re-uploaded and re-indexed.

**Files Modified:**
```
src/constants.js              # Labour 72→127, Equipment 317→334
src/ReconciliationDashboard.jsx  # Rate reads via /api/rates
pipe-up-field-guide-agent-kb.md  # v3.0 → v3.1
```

---

### Rate Import — Server-Side API Route & Bug Fixes (February 19, 2026)

**Moved rate database operations to a Vercel serverless function after discovering Supabase blocks `sb_secret_` keys from browser use**

After the AI-first rate import redesign, field testing revealed multiple issues in the import pipeline:

1. **Supabase blocks secret keys in browser** — The `sb_secret_` format service role key is explicitly rejected by Supabase when used from a browser (`401 Forbidden: Secret API keys can only be used in a protected environment`). All rate read/write/delete operations moved to a new Vercel serverless function (`/api/rates.js`) that uses the service role key server-side.

2. **Server-side API route** — Created `/api/rates.js` handling GET (read rates), POST (import rates), and DELETE (clear rates). The browser calls `/api/rates?table=labour_rates&organization_id=xxx` — no database keys touch the client.

3. **AI extraction truncation** — Large rate sheets exceeded the 4096 `max_tokens` default, producing truncated JSON without a closing `]`. Increased to 16384 tokens. Added `parseRateJSON()` recovery function that finds the last complete `}` in truncated output, trims the incomplete entry, and appends `]`.

4. **Diagnostic error messages** — Replaced generic "AI could not extract" with specific failure reasons surfaced in the UI: missing API key, network error, HTTP status code, empty response, or the actual Claude response text.

5. **RLS empty-array behavior** — Supabase RLS returns empty arrays (not errors) for unauthorized reads. The original fallback logic never triggered because "empty" looked like "success". Now moot since all reads go through the server-side API route with the service role key.

6. **Model ID mismatch** — Rate import was using `claude-sonnet-4-5-20250929` while the working OCR used `claude-sonnet-4-20250514`. Aligned to the working model.

**Field Guide updated to v3.0** — Re-uploaded and re-indexed.

**Files Created:**
```
api/rates.js                  # Vercel serverless function for rate DB operations
```

**Files Modified:**
```
src/RateImport.jsx            # Calls /api/rates instead of Supabase direct, truncation recovery, diagnostics
pipe-up-field-guide-agent-kb.md  # v2.9 → v3.0
```

---

### AI-First Rate Import (February 17, 2026)

**Redesigned rate import to use AI extraction for any file format**

The rate import system was redesigned from a rigid CSV-parser-first approach to an AI-first approach. Every contractor's rate sheet will be different — different column names, formats, file types. Instead of trying to anticipate every variation with alias tables, all files now go through Claude for extraction.

1. **Single upload path** — Removed the CSV vs OCR method toggle. One "Choose File" button accepts any format: CSV, Excel (.xlsx/.xls), PDF, or images (PNG, JPG, etc.).

2. **AI reads everything** — CSV and Excel files are read as text (XLSX library converts Excel to CSV), then sent to Claude's text API. PDFs and images go through Claude Vision. The AI prompt tells Claude to expect any column naming convention and extract classifications/equipment with rates.

3. **Excel (.xlsx/.xls) support** — Added XLSX library import to RateImport.jsx. Excel files are converted to CSV text via `XLSX.utils.sheet_to_csv()` before AI extraction.

4. **Fixed API key** — Was referencing non-existent `VITE_CLAUDE_API_KEY`, now uses correct `VITE_ANTHROPIC_API_KEY`.

5. **Updated model** — Uses `claude-sonnet-4-5-20250929` with `anthropic-dangerous-direct-browser-access` header for browser API calls.

6. **Manual entry fallback** — "Enter rates manually" link allows typing rates by hand without uploading a file.

**Field Guide updated to v2.9** — Re-uploaded and re-indexed (version 10, 24 chunks, 0 errors).

**Files Modified:**
```
src/RateImport.jsx            # AI-first redesign, XLSX support, fixed API key
pipe-up-field-guide-agent-kb.md  # v2.8 → v2.9
```

---

### Labour/Equipment UX & Rate Import Fixes (February 17, 2026)

**Post-OCR editing, validation, and rate import fixes from continued field testing**

1. **Labour validation false positive fixed** — The "Please enter classification and at least one hour type" alert fired incorrectly on saved reports where OCR set hours to exactly 0. Root cause: JavaScript `!0` evaluates to `true`, so the truthiness check rejected valid entries with zero hours. Fixed with explicit empty/null/undefined checks.

2. **RT/OT hours now editable** — Regular Time and Overtime columns in the labour table were rendered as plain text after OCR. Now editable inline inputs matching the JH column style. The `updateLabourField` function keeps the `hours` total in sync when RT or OT changes.

3. **Downtime hours start blank** — When changing a worker's status to Downtime or Standby, the hours field now starts blank (empty) so the inspector can enter the actual downtime amount. Previously it was pre-populated with a calculated value which was confusing.

4. **SearchableNameInput component** — New autocomplete component for employee names. Replaces native `<datalist>` (which works poorly on mobile Safari). Shows a tappable dropdown of matching crew names from the running roster as you type. Applied to both new entry forms and existing labour entry rows.

5. **Rate Import system fixed** — Complete rewrite of `src/RateImport.jsx`. Smart CSV parser with flexible column name aliases (e.g., "Classification", "Position", "Title" all work). Handles quoted fields, tab/semicolon delimiters. Auto-calculates OT (1.5x) and DT (2x) if only ST provided. Uses service role key via REST API to bypass RLS (was failing silently with anon key). Added existing rates display table with "Clear All" button.

**Field Guide updated to v2.8** — Re-uploaded and re-indexed (version 9, 24 chunks, 0 errors).

**Files Modified:**
```
src/InspectorReport.jsx       # Labour validation fix, updateLabourField hours sync
src/ActivityBlock.jsx         # RT/OT editable inputs, blank downtime, SearchableNameInput
src/RateImport.jsx            # Complete rewrite — smart CSV parser, service role key
public/labour_rates_template.csv   # New template file
public/equipment_rates_template.csv # New template file
pipe-up-field-guide-agent-kb.md  # v2.7 → v2.8
```

---

### PDF Export — Complete Data Coverage Audit (February 17, 2026)

**Comprehensive audit and fix of PDF export to include ALL report data**

After field tester Corrine Barta reported missing data in downloaded PDFs, a full audit of `exportToPDF()` against every form field identified and fixed 7 gaps:

1. **Metres Today / Previous** — Added to each activity block's details box. Previously only showed contractor, foreman, start/end KP.

2. **Ticket Number** — Added to activity block details. The contractor daily ticket number was entered but never appeared in the PDF.

3. **Equipment Unit Number** — Added UNIT # column to equipment table. Unit numbers were tracked in the form but missing from PDF output.

4. **Collapsible quality check sections** — Activities like Topsoil (~25 fields across 6 sections) and Stringing (~20 fields across 6 sections) use collapsible sections in `qualityFieldsByActivity`. The PDF renderer only handled flat fields, completely skipping all collapsible data. Fixed with recursive section rendering including sub-headers.

5. **Hydrovac section** — Removed stale holes summary reference (data was removed from HydrovacLog). Added contractor/foreman row. Fixed facility table to use correct field names (station, owner, P/X, facilityType, depthM, boundary, gpsCoordinates, comments).

6. **Weld UPI trackable items** — Added `weld_upi` to type labels and description builders (UPI type, weld number, quantity, KP range, reason, status).

7. **Signage & Access Roads trackable items** — Added specific description builders instead of generic fallback.

**Field Guide updated to v2.4** — Re-uploaded and re-indexed.

**Files Modified:**
```
src/InspectorReport.jsx       # exportToPDF() — all 7 gaps fixed
pipe-up-field-guide-agent-kb.md  # v2.3 → v2.4
```

---

### Inspector Report UX Improvements — Continued Field Testing (February 17, 2026)

**Post-OCR inline editing, hydrovac consolidation, and usability fixes from continued field testing**

1. **Labour name/classification editable after OCR** — Employee names and classifications in the labour table are now editable inline (text input with crew roster autocomplete for names, searchable dropdown for classifications). Previously these were read-only after OCR.

2. **Equipment type editable after OCR** — Equipment type in the equipment table is now a searchable dropdown, matching the labour editability pattern.

3. **Crew name autocomplete** — A running crew roster is collected from all labour entries across activity blocks and persisted to localStorage (`pipeup_crew_roster`). Name fields suggest known crew members as you type.

4. **Fixed duplicate entry IDs** — OCR-added entries in rapid succession got identical IDs (`Date.now()` in a loop), causing edits to one unit number to affect all entries. Fixed with `Date.now() + Math.random()`.

5. **Work Description textarea height** — Increased from 3 rows to 6 rows for better visibility. Still vertically resizable.

6. **GPS permission denied message** — Now shows specific re-enable instructions ("tap the lock icon in your browser address bar → set Location to Allow → reload") instead of a vague "Please enable GPS access" message.

7. **Hydrovac Contractor/Foreman moved to header** — Hydrovac Contractor and Hydrovac Foreman fields now appear inline beside the "HYDROVAC INFORMATION" header in quality checks, entered once per report instead of per hole.

8. **Hydrovac holes consolidated** — Removed duplicate HOLES SUMMARY table from HydrovacLog (individual holes tracked in Trackable Items instead). Removed per-hole contractor field from Trackable Items (now entered once in HydrovacLog header).

9. **Trackable Items auto-save** — Removed manual "Save" button from trackable item entries. Items now auto-save to Supabase on blur (when the inspector leaves a field). Only the "Remove" button remains.

10. **General Comments section removed** — Removed from the inspector report form to free up space. Inspectors use Work Description in activity blocks for observations. Existing report data preserved for PDF export and report viewer.

**Field Guide updated to v2.3** — Re-uploaded and re-indexed.

**Files Modified:**
```
src/ActivityBlock.jsx         # Inline editing, crew autocomplete, textarea height, useMemo import
src/InspectorReport.jsx       # updateLabourField, updateEquipmentField, unique IDs, removed General Comments UI
src/HydrovacLog.jsx           # Contractor/Foreman in header, removed HOLES SUMMARY table
src/TrackableItemsTracker.jsx # weld_upi, removed hydrovac contractor field, auto-save on blur
src/PipelineMap.jsx           # GPS permission message
src/kpUtils.js                # GPS permission message
pipe-up-field-guide-agent-kb.md  # v2.2 → v2.3
```

---

### Inspector Report Fixes — Corrine Barta Field Testing (February 17, 2026)

**Fixed 4 issues identified during field testing by Corrine Barta**

1. **Multi-page ticket photo display & save** — When a multi-page ticket is scanned, the indicator now shows "X pages attached" (instead of just the first filename), the photo modal displays all pages in a scrollable view with "Page X of Y" labels, and all filenames are saved to the database as a `ticketPhotos` array (not just the first page). Edit mode loads URLs for all saved pages.

2. **OCR equipment validation** — `addEquipmentToBlock()` was silently rejecting equipment with 0 hours because `!0 === true`. Changed validation from `if (!type || !hours)` to `if (!type)`. Equipment can legitimately have 0 hours (idle/standby).

3. **Context-aware production status labels** — Labour and equipment entries set to Downtime now show "Down hrs:" and entries set to Standby show "Standby hrs:" instead of the misleading "Productive hrs:" label.

4. **Weld UPI trackable items** — Added new `weld_upi` category to TrackableItemsTracker with fields: UPI Type (Cut Out, Repair, Rework, NDT Fail Repair, Other), Weld Number(s), From/To KP, Quantity, Reason, Status, Notes. Updated the reminder banner to include "Weld UPI Items".

**Field Guide updated to v2.1** — Re-uploaded and re-indexed (20 chunks, 0 embedding errors).

**Files Modified:**
```
src/ActivityBlock.jsx         # Multi-page photo modal, context-aware labels
src/InspectorReport.jsx       # Equipment validation fix, multi-page save, reminder banner
src/TrackableItemsTracker.jsx # weld_upi item type
pipe-up-field-guide-agent-kb.md  # v2.0 → v2.1
```

---

### Technical Resource Library - Field Guide & Supporting Docs (February 14, 2026)

**Added standalone Field Guide resource and supporting document capability**

- Added `field_guide` as 6th standalone category in the Technical Resource Library
- Pipe-Up Field Guide (agent knowledge base) indexed for AI search (19 sections, 31K chars)
- **Add Supporting Doc** button added to every library item (super_admin only)
- Supporting docs use existing addendum pattern (`is_addendum`, `parent_document_id`)
- Supporting docs displayed in both Admin Portal and Inspector Reference Library views
- New `uploadLibrarySupportingDoc()` function with auto-indexing for AI search
- Added `field_guide` to DB `valid_category` constraint
- Storage RLS policy updated to allow authenticated uploads to `documents` bucket

**Files Modified:**
```
src/AdminPortal.jsx          # New category, upload function, supporting doc UI
src/ReferenceLibrary.jsx     # New category, supporting docs display
supabase/migrations/20260214_add_field_guide_category.sql
```

### PDF Export - Complete Data Coverage (February 12, 2026)

**Ensured every field from the inspector's report appears in the PDF export**

After auditing every form field against the PDF generation code, found and fixed multiple gaps:

**Missing fields added:**
- **AFE / Contract #** — Added to Report Info header alongside Date, Inspector, Spread, Pipeline
- **ROW Condition** — Added to Weather Conditions section
- **Unit Price Items** — Entire new section with table (category, item, qty, unit, KP location, notes) + comments + summary count
- **Hydrostatic Testing** — Replaced placeholder text with actual data fields: test section, test pressure (kPa), hold time (hrs), water source, result (color-coded pass/fail), pressure drop (PSI)

**Text truncation removed (full content now renders):**
- Work Description — was limited to 4 lines
- Safety Notes, Land & Environment, General Comments — were limited to 3 lines each
- Time Lost Details — was truncated to 95 characters
- Safety Recognition cards — situation (3 lines), potential outcome (2 lines), comments (2 lines)
- Wildlife Sightings — activity and notes were limited to 2 lines each
- Trackable Items — descriptions (2 lines) and notes (1 line)

All long text sections now use per-line `checkPageBreak()` so content flows across pages properly.

**Files Modified:**
- `src/InspectorReport.jsx` — `exportToPDF()` function: added AFE, ROW Condition, Unit Price Items section, hydrotest data, removed all `.slice()` truncation

---

### God Mode Access for Company Admins (February 12, 2026)

**Extended MasterSwitcher God Mode to company admin users**

Previously God Mode (the dashboard quick-jump dropdown) was restricted to `super_admin` only. Now company `admin` users also have access for their respective organization.

- MasterSwitcher component role check updated to allow both `admin` and `super_admin`
- Removed MasterSwitcher from ChiefDashboard — only AdminPortal renders it
- NDT Auditor back-button navigation updated to recognize `admin` role for God Mode routing
- TenantSwitcher (org switching) remains `super_admin` only — admins stay within their own org

**Files Modified:**
- `src/MasterSwitcher.jsx` — Role check includes `admin`
- `src/ChiefDashboard.jsx` — Removed MasterSwitcher import and render
- `src/NDTAuditorDashboard.jsx` — Back button includes `admin` role

---

### Simplified Shadow Audit - Exception-Based Flagging (February 12, 2026)

**Replaced per-row status columns with on-demand flag button**

The shadow audit / efficiency tracking system was too complex for field inspectors — every labour and equipment row showed a 3-button status toggle and a "Productive" hours column, making it look like every row required interaction.

**Before:** 2 extra columns per row (Field Status + Productive) always visible on every entry.

**After:** Clean tables with a small pencil button per row. Tapping it expands a detail panel with:
- **Working** / **Downtime** / **Standby** status buttons (friendly labels replacing ACTIVE/SYNC_DELAY/MANAGEMENT_DRAG)
- Reason dropdown and custom text input (only when Downtime or Standby selected)
- Productive hours field (auto-calculated, editable)
- Mandatory contractor issue detail when applicable

Flagged rows show an amber (Downtime) or red (Standby) indicator. Unflagged rows stay clean — no extra fields visible.

**What stayed the same:**
- Crew-wide "Report Site Condition" toggle (unchanged)
- Verification Summary (billed vs productive hours comparison)
- All underlying data structures (`productionStatus`, `shadowEffectiveHours`, `dragReason`)
- Dashboard calculations and shadow audit utilities
- Previous UI archived as git tag `v2.3.6-shadow-audit-full` for rollback

**Files Modified:**
- `src/ActivityBlock.jsx` — Replaced inline status/productive columns with flag button + expandable detail panel for both labour and equipment tables

---

### OCR Improvements - Individual Entries & Multi-Page Tickets (February 12, 2026)

**Improved AI extraction from contractor daily ticket photos**

Two enhancements to the OCR ticket scanning feature:

1. **Individual labour and equipment entries** — Updated AI prompts in both `ActivityBlock.jsx` and `InspectorReport.jsx` to require each person listed as a separate entry with their full name, instead of grouping workers together (e.g., "3 General Labourers"). Same for equipment — each piece listed individually. Employee names are now passed through to the labour form fields.

2. **Multi-page ticket support** — Contractor tickets that span multiple pages can now be processed in a single OCR scan:
   - "Upload Photo(s)" button accepts multiple file selection
   - All page images sent to Claude in a single API call
   - AI combines labour and equipment data from all pages into one unified list without duplicating entries
   - `max_tokens` increased from 2000 to 4000 for larger multi-page responses
   - All pages uploaded to Supabase storage on save (named `ticket_..._p1.jpg`, `ticket_..._p2.jpg`, etc.)
   - First photo preserved as `ticketPhoto` for backward compatibility

**Files Modified:**
- `src/ActivityBlock.jsx` — Updated OCR prompt, `processTicketOCR()` accepts multiple files, multi-select upload UI
- `src/InspectorReport.jsx` — Updated OCR prompt, multi-page photo upload on save

---

### Build Optimization - Vendor Chunk Splitting (February 12, 2026)

**Fixed Vite build warnings and optimized bundle size**

Two build warnings resolved:

1. **jspdf import inconsistency** — `AdminPortal.jsx` used a dynamic `await import('jspdf')` while 7 other files imported it statically. Replaced with static import to eliminate the warning (no code-splitting benefit since jspdf was already in the main bundle).

2. **Main bundle too large (4,656 KB)** — Added `manualChunks` configuration to `vite.config.js` to split vendor libraries into separate cached chunks:

| Chunk | Contents | Size |
|-------|----------|------|
| `vendor-react` | react, react-dom, react-router-dom | 178 KB |
| `vendor-charts` | recharts | 395 KB |
| `vendor-maps` | leaflet, react-leaflet | 155 KB |
| `vendor-pdf` | jspdf, jspdf-autotable | 419 KB |
| `vendor-spreadsheet` | xlsx | 283 KB |
| `vendor-supabase` | @supabase/supabase-js | 172 KB |

**Result:** Main bundle reduced from 4,656 KB to 3,034 KB (35% reduction). Vendor chunks are independently cacheable by the browser and PWA service worker.

**Files Modified:**
- `vite.config.js` — Added `build.rollupOptions.output.manualChunks` configuration
- `src/AdminPortal.jsx` — Replaced dynamic jspdf import with static import

---

### Shielded Input Architecture (February 4, 2026)

**Project-wide fix for the "single-digit input" bug**
Inspectors could only type 1 character in form fields before the value was lost/reset. Root causes identified and fixed:

1. **CollapsibleSection unmount/remount** - `CollapsibleSection` was defined as an arrow function inside the render function of GradingLog and HDDSteeringLog. React treated each render's new function reference as a different component type, causing full unmount/remount of the subtree on every keystroke — destroying all child state. **Fix:** Extracted CollapsibleSection to module level.

2. **Parent re-render overwriting typed text** - React state updates from `onDataChange` callbacks triggered parent re-renders that pushed new prop values into inputs mid-keystroke, resetting the displayed value. **Fix:** Created ShieldedInput with the Ref-Shield pattern.

3. **Search field clearing during filter operations** - Equipment/Manpower SearchableSelect inputs cleared while typing because filtering triggered re-renders. **Fix:** Created ShieldedSearch with 300ms debounce.

**ShieldedInput / ShieldedSearch — Ref-Shield Pattern:**
- `localValue` state is the **sole display source** while the input is focused
- Prop updates are **blocked** while the user is typing (focus shield)
- Syncs from props only on `onBlur` or when not focused
- Wrapped in `React.memo` to skip re-renders when props haven't changed
- Password manager defense attributes: `data-bwignore`, `data-1p-ignore`, `data-lpignore`, `autoComplete="off"`, `spellCheck: false`
- Verification logging: `console.log('[ShieldedSystem] Prop Sync Blocked - User is Typing')`
- `onChange` passes **string value** directly (NOT an event object)

**131 raw DOM elements replaced across 12 files:**

| File | Inputs | Textareas | Total |
|------|--------|-----------|-------|
| CoatingLog.jsx | 44 | 1 | 45 |
| HDDLog.jsx | 23 | 1 | 24 |
| ConventionalBoreLog.jsx | 22 | 1 | 23 |
| ClearingLog.jsx | 11 | 1 | 12 |
| FinalCleanupLog.jsx | 0 | 7 | 7 |
| MachineCleanupLog.jsx | 0 | 6 | 6 |
| ActivityBlock.jsx | 0 | 5 | 5 |
| DitchInspection.jsx | 0 | 4 | 4 |
| EquipmentCleaningLog.jsx | 3 | 0 | 3 |
| TieInCompletionLog.jsx | 0 | 1 | 1 |
| PilingLog.jsx | 0 | 1 | 1 |
| CounterboreTransitionLog.jsx | 0 | 1 | 1 |

**Backward Compatibility:**
- `BufferedInput.jsx` re-exports from `ShieldedInput.jsx`
- `BufferedSearch.jsx` re-exports from `ShieldedSearch.jsx`
- Existing imports in GradingLog, HDDSteeringLog, MainlineWeldData, TieInWeldData continue working unchanged

**New Files Created:**
```
src/components/common/ShieldedInput.jsx   # Ref-Shield input component
src/components/common/ShieldedSearch.jsx  # Ref-Shield search with debounce
```

---

### Equipment Unit Number Column (February 3, 2026)

**Unit # tracking for Equipment section**
- New column added to Equipment table in ActivityBlock.jsx
- Editable inline cell for manual entry
- OCR extraction support: AI prompt updated to extract unitNumber from contractor tickets
- Grid layout updated from 4 to 5 columns to accommodate Unit #

**Files Modified:**
- `src/ActivityBlock.jsx` - Unit # form field, table column, OCR prompt
- `src/InspectorReport.jsx` - `addEquipmentToBlock` accepts unitNumber parameter, new `updateEquipmentUnitNumber` function

---

### Grading Equipment Dropdown Removal (February 3, 2026)

**Removed duplicate Grading Equipment from ROW Conditions quality checks**
- Grading equipment is already tracked in the Manpower & Equipment section
- Removed `gradingEquipment` dropdown and `equipmentOther` text field from GradingLog quality checks
- Removed corresponding fields from default data object

**Files Modified:**
- `src/GradingLog.jsx` - Removed quality check fields and default data

---

### AI Agent "Watcher" System (February 2, 2026)

**Pipe-Up AI Agent - Intelligent Ticket Analysis**
- Real-time analysis of daily construction tickets
- Flags anomalies and compliance issues automatically
- Green pulse animation when all clear, red pulse for critical flags

**AI Agent Status Icon (AdminPortal Header)**
- Visual status indicator with 5 states:
  - 🤖 Gray (Idle) - No recent analysis
  - ⚡ Blue pulse (Analyzing) - Processing tickets
  - ✅ Green pulse (Clear) - No issues detected
  - ⚠️ Yellow (Warning) - Review recommended
  - 🚨 Red pulse (Flagged) - Critical issues requiring attention
- Click to view detailed analysis results
- Clickable flags navigate to affected tickets
- Real-time Supabase subscription for live updates

**Analysis Rules (7 Checks)**
| Flag Type | Severity | Rule |
|-----------|----------|------|
| HOURS_EXCEEDED | Warning/Critical | Avg hours > 120%/150% of standard workday |
| KP_OUT_OF_BOUNDS | Critical | Activity KP outside project boundaries |
| LOW_EFFICIENCY | Warning/Critical | Shadow hours / billed hours < 70%/50% |
| MANAGEMENT_DRAG_SPIKE | Critical | >30% labour marked as MANAGEMENT_DRAG |
| LABOUR_ANOMALY | Info | >50 workers in single activity block |
| WPS_MATERIAL_MISMATCH | Critical | Pipe material not approved for WPS |
| EQUIPMENT_MISMATCH | Warning | WPS not found in approved specifications |

**WPS Material Validation**
- `wps_material_specs` table stores approved materials per WPS
- Validates pipe grade against WPS allowed materials list
- Flags critical violations (e.g., X65 Steel used with WPS-02 which only allows X70/X80)
- Supports both block-level and weldData.weldEntries validation

**AI-Generated Summaries**
- Anthropic Claude API generates executive summaries of flagged issues
- Prioritizes WPS/Material violations as potential stop-work items
- Identifies contractors requiring investigation
- Provides actionable recommendations

**New Database Tables:**
```
ai_agent_logs           # Analysis results and metrics
wps_material_specs      # WPS allowed materials configuration
```

**New Edge Function:**
```
supabase/functions/process-ticket-ai/index.ts
```

**New Component:**
```
src/components/AIAgentStatusIcon.jsx
```

**Files Modified:**
- `src/AdminPortal.jsx` - AI Agent icon in header, flagged ticket modal
- `src/utils/queryHelpers.js` - Fixed isReady() for org filtering

---

### Welding Chief Dashboard (February 2, 2026)

**New Dashboard for Welding Operations Management**
- Dedicated dashboard for Welding Chief Inspector role
- 6-tab interface: Overview, Welder Performance, WPS Compliance, Daily Reports, Certifications, Generate Report

**Overview Tab**
- KPI cards: Daily Weld Count, Cumulative Repair Rate, Active AI Alerts
- Today's Weld Summary Table by crew type
- AI Alert Banner for critical WPS/filler/preheat violations

**Welder Performance Tab**
- Welder Stats Table: ID, Total Welds, Repairs, Repair Rate (%)
- Status Badges: Green (<5%), Yellow (5-8%), Red (>8%)
- Flagged Welders Alert Box

**WPS Compliance Tab**
- Active AI Flags Panel for WPS_MATERIAL_MISMATCH, FILLER_MATERIAL_MISMATCH, PREHEAT_VIOLATION
- Integration with AgentAuditFindingsPanel

**Daily Reports Tab**
- Date Selector with Load Reports button
- Detailed Activities Table with weld counts, repairs, locations
- Individual Welds Log with weld numbers and visual results
- Repairs Table with defect codes
- Tie-In Data with station and NDE results
- Inspector Comments Feed

**Certifications Tab**
- Active Welders Table with qualification status
- Expiry date highlighting

**Generate Report Tab**
- AI-generated daily welding report (with fallback when API unavailable)
- Sections: Executive Summary, Production Summary, Quality & Repairs, Tie-In Operations, Inspector Observations, Action Items
- PDF Download with Digital Signature
- Sign & Download button opens SignaturePad
- Signature embedded in PDF with verification
- Document ID for turnover tracking

**New Files Created:**
```
src/WeldingChiefDashboard.jsx   # Main dashboard component
src/weldingChiefHelpers.js      # Data aggregation functions
src/weldingChiefPDF.js          # PDF generation with signature support
```

**Routing & Permissions:**
- Route: `/:orgSlug/welding-chief`
- Allowed roles: welding_chief, chief, chief_inspector, admin, super_admin
- Added to MasterSwitcher God Mode menu

---

### Organization Filtering Fix (February 2, 2026)

**Super Admin Data Filtering**
- Fixed issue where super admins saw all organizations' data regardless of selection
- All `addOrgFilter()` calls now use `forceFilter=true` for selected organization
- Data state resets when switching organizations (prevents stale data)
- `isReady()` now requires `organizationId` before queries execute

**Files Modified:**
- `src/AdminPortal.jsx` - Force org filtering, state reset on org change
- `src/utils/queryHelpers.js` - Updated isReady() logic

---

### Document Control & Project Handover System (February 1, 2026)

**Project Document Vault (Admin Portal → Setup)**
- 9 document categories with traffic light status indicators:
  - Prime Contract, Scope of Work, IFC Drawings, Typical Drawings
  - Project Specifications, Weld Procedures (WPS), ERP, EMP, ITP
- Green dot = uploaded, Red dot = missing
- Version control with automatic revision tracking (Rev 0, Rev 1, Rev 2...)
- Document history modal showing all versions with timestamps
- Addenda support for Project Specs, Weld Procedures, and ITP

**ITP Sign-off Matrix & Digital Signatures**
- Three required sign-offs: Chief Welding Inspector, Chief Inspector, Construction Manager
- STATIONARY status: Document uploaded but not fully approved
- ACTIVE status: All three signatures captured
- Digital signature pad with timestamp and signer name
- Signature reset prompt when uploading new ITP revision
- Signatures stored in Supabase Storage (`signatures` bucket)

**Owner Document Control (DC) Compatibility**
- Custom metadata fields configurable per organization
- Transmittal Generator with PDF output
- Sync status tracking: internal → transmitted → acknowledged → rejected
- Owner transmittal ID and comments capture
- DC Status Report CSV export

**Document Sync Health Widget (Admin Portal → Overview)**
- Visual status bar showing sync distribution
- Critical alerts for rejected documents requiring revision
- Warning for documents pending transmittal
- Color-coded legend (Yellow=Internal, Blue=Transmitted, Green=Acknowledged, Red=Rejected)

**Project Handover Package (Admin Portal → Handover)**
- Pre-flight audit checking critical documents
- Validates ITP signature completion
- ZIP generation with nested folder structure:
  - 01_Governance (contracts, SOW, ITP)
  - 02_Engineering (drawings, specs, procedures)
  - 03_Field_Reports (daily tickets, addenda)
  - 04_Compliance (ERP, EMP, permits)
- Manifest CSV with SHA-256 hashes (Web Crypto API)
- Custom metadata columns from Owner DC fields
- Handover history with download links

**Technical Resource Library (Admin Portal → Setup)**
- 6 global reference document categories:
  - API 1169 - Pipeline Construction Inspection
  - CSA Z662 - Oil & Gas Pipeline Systems
  - Practical Guide for Pipeline Construction Inspectors
  - Pipeline Inspector's Playbook
  - Pipeline Rules of Thumb
  - Pipe-Up Field Guide (Agent knowledge base)
- Read-only access for all users
- Super Admin: Upload, Replace, Delete capabilities
- **Add Supporting Doc** button on each library item (super_admin)
- Supporting documents displayed under parent in both Admin and Inspector views
- Documents marked as `is_global: true` for cross-org access
- AI indexing via `process-document` edge function for RAG search

**New Database Tables:**
```
project_documents     # Document vault with version control
transmittals          # Transmittal tracking
```

**New Database Columns (project_documents):**
```
sync_status           # internal, transmitted, acknowledged, rejected
owner_transmittal_id  # Owner's transmittal reference
owner_comments        # Owner feedback
transmitted_at        # Timestamp
acknowledged_at       # Timestamp
sign_offs             # JSONB for ITP signatures
version_number        # Revision tracking
is_current            # Active version flag
is_addendum           # Supporting document flag
parent_document_id    # Links addenda to parent
is_global             # Technical library flag
metadata              # Custom DC metadata (JSONB)
```

**New Database Columns (contract_config):**
```
custom_document_fields  # JSONB array of custom metadata field definitions
```

**New Storage Buckets:**
```
signatures            # ITP digital signature images
handovers             # Generated ZIP packages
```

**Files Created:**
```
supabase/migrations/20260201_create_project_documents.sql
supabase/migrations/20260201_add_signoffs_column.sql
supabase/migrations/20260201_add_technical_library.sql
supabase/migrations/20260201_create_signatures_bucket.sql
supabase/migrations/20260201_document_versioning.sql
supabase/migrations/20260201_create_handovers_bucket.sql
supabase/migrations/20260201_document_metadata.sql
supabase/migrations/20260201_document_sync_status.sql
```

---

### Project Governance & Auto-Populate Features (February 1, 2026)

**New Database Table: `contract_config`**
- Per-organization project configuration settings
- Fields: contract_number, standard_workday, ap_email, start_kp, end_kp, default_diameter, per_diem_rate
- One config per organization (unique constraint)
- RLS policies for authenticated users

**Project Governance Section (Admin Portal → Setup)**
- Contract Number / AFE configuration
- Standard Workday Hours setting
- AP Email for invoice routing
- Project Boundaries (Start KP / End KP)
- Default Diameter setting
- Per Diem Rate configuration
- Config Status indicator (Complete/Incomplete based on required fields)

**Inspector Report Auto-Populate Features**
- AFE/Contract # field added to report header (after Pipeline)
- Auto-fills from organization's contract_config.contract_number
- Light green background when auto-filled
- Inspector Name auto-fills from user profile (full_name)
- Both skip auto-populate when editing existing reports or restoring drafts

**Super Admin Features (Admin Portal)**
- Fleet Onboarding tab: Provision new organizations with admin users
- Usage Statistics tab: Cross-organization activity summary (reports, tickets, last activity)
- Both tabs only visible to super_admin role

**Files Created:**
```
supabase/migrations/20260131_create_contract_config.sql
```

**Files Modified:**
- `src/AdminPortal.jsx` - Project Governance section, Fleet Onboarding, Usage Statistics
- `src/InspectorReport.jsx` - AFE field UI, auto-populate for AFE and inspector name

---

### Multi-Tenant Architecture (January 31, 2026)

**URL Structure Change**
- All authenticated routes now use org-scoped URLs: `/:orgSlug/dashboard`, `/:orgSlug/field-entry`, etc.
- Legacy routes (`/dashboard`, `/chief-dashboard`) redirect to org-scoped versions
- Root path (`/`) redirects users to their default organization's landing page based on role

**New Database Table: `memberships`**
- Many-to-many relationship between users and organizations
- Fields: user_id, organization_id, role, is_default
- Supports users belonging to multiple organizations
- Default organization preference per user

**New Context: OrgContext (`src/contexts/OrgContext.jsx`)**
- Provides organization data throughout the app
- Tracks current organization, user memberships, and super_admin status
- Handles organization switching and validation
- Exports `useOrg()` hook for components

**New Query Helpers (`src/utils/queryHelpers.js`)**
- `useOrgQuery()` hook: Provides `addOrgFilter()`, `getOrgId()`, `organizationId`, `isSuperAdmin`
- Automatically filters database queries by current organization
- Super admins can bypass org filtering when needed

**New Navigation Helper: `useOrgPath()`**
- Returns `orgPath()` function to prefix paths with org slug
- Example: `orgPath('/dashboard')` returns `/default/dashboard`

**Routing Changes (App.jsx)**
- `RootRedirect` component determines user's default org and landing page
- `OrgRoutes` component wraps all org-scoped routes with `OrgProvider`
- All 20+ routes moved to org-scoped structure

**CMT Dashboard Cleanup**
- Removed God Mode (MasterSwitcher) component
- Removed organization dropdown (TenantSwitcher) component
- Cleaner interface for regular users

**Files Created:**
```
src/contexts/OrgContext.jsx      # Organization context provider
src/utils/queryHelpers.js        # Org-scoped query helpers
src/components/TenantSwitcher.jsx # Org switcher (for admin use)
```

**Files Modified:**
- `src/App.jsx` - Complete routing overhaul for multi-tenancy
- `src/ProtectedRoute.jsx` - Org validation and role-based redirects
- `src/main.jsx` - Simplified to use App.jsx routing
- `src/Dashboard.jsx` - Removed God Mode and TenantSwitcher
- Multiple dashboard components - Added `useOrgQuery()` for data filtering

---

### Chief Dashboard - Daily Summary Enhancements (January 29, 2026)

**AI-Generated Narrative**
- Anthropic Claude API integration for auto-generating Key Focus bullets
- Analyzes inspector reports and aggregates construction activity data
- Generates 6-10 bullet points summarizing daily progress
- Safety status generation with weather and SWA event context

**Daily Summary Tab Features**
- Date picker to select report date
- Load Data button to fetch approved inspector reports
- Generate AI button to create narrative from report data
- Save Draft to persist summaries to database
- Publish functionality for finalizing reports

**Enhanced PDF Export**
- Section 1: Key Focus bullets (AI-generated)
- Section 2: Welding Progress table (weld types, LM, counts, repairs)
- Section 3: Section Progress table (by category and activity)
- Section 4: Personnel Summary (all personnel counts)
- Section 5: Crew Activity Progress (contractor, activity, KP range, metres, work description)
- Automatic page breaks and footers

**New Database Table: `daily_construction_summary`**
- Stores draft and published daily summaries
- Fields: report_date, key_focus_bullets, safety_status, personnel_data, weather_data, progress_data, welding_data
- RLS policies for chief, admin, and manager roles

**New Environment Variable**
- `VITE_ANTHROPIC_API_KEY` - Required for AI narrative generation

**Files Modified:**
- `src/ChiefDashboard.jsx` - Daily Summary tab with PDF export
- `src/chiefReportHelpers.js` - AI generation functions
- `src/ProtectedRoute.jsx` - Improved allowedRoles handling

---

### Searchable Dropdowns & Efficiency Audit (January 27, 2026)

**SearchableSelect Component (ActivityBlock.jsx)**
- Type-to-filter dropdown for Labour Classification (72 options)
- Type-to-filter dropdown for Equipment Type (323 options)
- Matches all words in any order (e.g., "1 ton truck" finds "1 Ton Truck")
- Handles hyphens and variations ("1-ton" matches "1 ton")
- Keyboard navigation: Arrow keys + Enter to select
- Click outside to close

**Efficiency Audit System**
- Production status tracking per labour/equipment entry:
  - ACTIVE (100%): Working efficiently
  - SYNC_DELAY (70%): Idle due to coordination/materials
  - MANAGEMENT_DRAG (0%): Stopped for permits/instructions
- Shadow hours auto-calculation with manual override
- Delay reason input with preset dropdown + custom text
- Custom reasons saved to localStorage library
- Crew-wide delay reporting option
- Efficiency dashboard added to Chief and Assistant Chief dashboards

**PWA Update Prompt (UpdatePrompt.jsx)**
- Automatic detection of new app versions
- "Update Now" / "Later" buttons
- Checks for updates every 5 minutes
- Dismissed prompt reappears after 30 minutes
- Solves field user update issues without cache clearing

**New Files:**
```
/src/components/
├── UpdatePrompt.jsx         # PWA update notification banner
└── OfflineStatusBar.jsx     # Mobile-friendly status indicator

/src/
├── shadowAuditUtils.js      # Efficiency audit calculations
└── ShadowAuditDashboard.jsx # Efficiency reporting dashboard
```

---

### PWA Offline Mode & Email System (January 26, 2026)

**PWA (Progressive Web App) Implementation**
- Full offline capability for field inspectors
- IndexedDB storage for pending reports and photos
- Automatic sync when back online
- Service worker with Workbox for asset caching

**New Files Created:**
```
/src/offline/
├── db.js                    # IndexedDB schema (pendingReports, photos stores)
├── syncManager.js           # Save offline, sync when online, retry logic
├── chainageCache.js         # Cached KP data for offline overlap checking
├── hooks.js                 # useOnlineStatus, useSyncStatus, usePWAInstall
└── index.js                 # Barrel export

/src/components/
└── OfflineStatusBar.jsx     # Mobile-friendly status indicator
```

**OfflineStatusBar.jsx Features:**
- Fixed bar at top of screen
- iOS safe-area-inset support for notched devices
- 44px minimum touch targets for mobile
- Shows: Online/Offline status, pending count, "Sync Now" button
- Color coding: Green (online), Orange (offline)

**InspectorReport.jsx Changes:**
- Offline-first save flow
- Photos stored as blobs in IndexedDB when offline
- "Save Offline" button when disconnected
- Automatic sync attempt on reconnect

**vite.config.js Updates:**
- Added VitePWA plugin configuration
- Workbox runtime caching for Supabase API
- PWA manifest with app icons

**Email Invitation System Fix:**
- Resend domain verification completed for pipe-up.ca
- DNS records configured in Vercel (not Bluehost - nameservers point to Vercel)
- Records added:
  - DKIM: `resend._domainkey` (TXT)
  - SPF: `send.pipe-up.ca` (TXT) - `v=spf1 include:amazonses.com ~all`
  - MX: `send.pipe-up.ca` - `feedback-smtp.us-east-1.amazonses.com`
  - DMARC: `_dmarc` (TXT) - `v=DMARC1; p=none;`
- Invitation emails now delivered automatically via Resend

**AdminPortal.jsx Updates:**
- Enhanced console logging for invitation links
- Colored/formatted output for easy link copying
- Fallback link display when email delivery fails

---

### HDD Module Redesign (January 21, 2026)

**HDDLog.jsx - Complete Redesign**
- 8 collapsible sections with color coding:
  1. Bore Information (gray)
  2. Pilot Hole - Drilling Fluid Parameters (yellow)
  3. Reaming Passes - repeatable entries (blue)
  4. Pipe Installation (green)
  5. Post-Installation (gray)
  6. Drilling Waste Management - Directive 050 (blue)
  7. Steering Log - Bore Path Data (purple)
  8. Comments (gray)
- Integrated audit trail logging via useActivityAudit hook
- Inherited info bar showing contractor, foreman, date, KP range

**DrillingWasteManagement.jsx - NEW Component**
- AER Directive 050 compliance tracking
- 6 collapsible sections:
  1. Mud Mixing & Volume Tracking
  2. Additives Log (searchable, 20+ pre-configured products)
  3. Disposal & Manifesting (mandatory manifest photo)
  4. Testing & Compliance (salinity, toxicity, metals)
  5. Evidence - Photo Documentation (GPS-tagged)
  6. Certification & Comments
- Volume balance calculation (mixed - hauled = in storage)
- Disposal method tracking (landspray, landfill, approved facility)

**HDDSteeringLog.jsx - NEW Component**
- Real-time pilot hole guidance tracking
- 6 collapsible sections:
  1. Guidance System Setup (walk-over, wireline, gyro)
  2. Design vs Actual Entry/Exit Angles (auto variance)
  3. Steering Data - Per Joint/Station (repeatable table)
  4. Bending Radius Alerts (pipe diameter lookup)
  5. Evidence - Document Upload
  6. Comments
- Minimum bend radius auto-calculation by pipe diameter
- Weld ID linking to pipe string
- Fixed: CollapsibleSection extracted to module level (was causing unmount/remount)

### Database Migrations (January 21, 2026)
- `20260121_create_drilling_waste_logs.sql`
  - drilling_waste_logs table
  - drilling_waste_additives table
  - drilling_waste_photos table
  - RLS policies for authenticated users

- `20260121_create_bore_path_data.sql`
  - bore_path_logs table
  - bore_path_stations table
  - bore_path_documents table
  - RLS policies for authenticated users

### Audit Logger Updates (January 21, 2026)
- Added precision mappings for drilling waste fields:
  - total_volume_mixed_m3: 2
  - volume_in_storage_m3: 2
  - volume_hauled_m3: 2
  - vac_truck_hours: 2
  - mud_weight: 1
  - viscosity: 0
  - grout_volume: 2
  - grout_pressure: 1
- Added environmental regulatory patterns for drilling waste

---

### DitchInspection Refactoring
- Removed Rock Ditch section (now in Trackable Items)
- Removed Extra Depth section (now in Trackable Items)
- Added From KP / To KP to Padding/Bedding section
- Auto-formatting for KP values (6500 → 6+500)

### Lower-in Activity Updates
- Changed Padding Depth to Bedding/Padding (Yes/No)
- Removed Depth of Cover (tracked in Trackable Items)
- Kept: Foreign Line Clearance, Lift Plan Verified, Equipment Inspected
- Added reminder popup when Bedding/Padding = Yes
- Uniform box styling for all fields

### New Trackable Item: Bedding & Padding
- Protection Type options:
  - Bedding
  - Padding
  - Bedding and Padding
  - Pipe Protection
  - Rockshield
  - Lagging
  - Rockshield and Lagging
- From KP / To KP fields
- Length, Material, Depth/Thickness, Action, Equipment, Notes

### Database Migrations
- `20260120_add_padding_bedding_kp_columns.sql`
  - Added padding_bedding_from_kp column
  - Added padding_bedding_to_kp column

---

## 7. DEPLOYMENT & ENVIRONMENT

### Vercel Configuration
- Auto-deployment from GitHub main branch
- Production URL: https://app.pipe-up.ca
- Edge functions for email notifications

### Environment Variables
```
VITE_SUPABASE_URL=https://aatvckalnvojlykfgnmz.supabase.co
VITE_SUPABASE_ANON_KEY=[anon-key]
VITE_ANTHROPIC_API_KEY=[anthropic-api-key]  # For AI narrative generation
```

### Build Commands
```bash
npm run dev      # Development server
npm run build    # Production build
npm run preview  # Preview production build
```

---

## 8. KEY INTEGRATIONS

| Integration | Purpose |
|-------------|---------|
| Supabase | Database, Auth, Storage, Edge Functions |
| Anthropic Claude API | AI-generated report narratives |
| Resend | Email notifications (approvals, summaries) |
| Weather API | Field condition logging |
| Leaflet | Pipeline route mapping |
| jsPDF | Report/Invoice PDF generation |
| XLSX | Excel data export |

---

## 9. AUDIT & COMPLIANCE

### Audit Logging (auditLoggerV3.js)
- Tracks all field changes with original/new values
- Precision mapping for numeric fields (2 decimal places)
- User identification and timestamps
- Report state transitions

### Precision Map
```javascript
// Trench/Ditch
trench_width: 2,
trench_depth: 2,
depth_of_cover: 2,
padding_meters: 2,
pumping_hours: 2,
groundwater_depth: 2,
filter_bag_count: 0,

// Drilling Waste (Directive 050)
total_volume_mixed_m3: 2,
volume_in_storage_m3: 2,
volume_hauled_m3: 2,
storage_capacity_m3: 2,
vac_truck_hours: 2,
mud_weight: 1,
viscosity: 0,
fluid_loss: 1,
grout_volume: 2,
grout_pressure: 1
```

---

## 10. SUPPORT & MAINTENANCE

**Developer:** Claude Code (Anthropic)
**Primary Contact:** Richard Judson
**Issue Tracking:** GitHub Issues

### Common Operations
- Run Supabase migrations: `npx supabase db push`
- Deploy to Vercel: `git push origin main`
- Check deployment status: `npx vercel ls`

---

*Manifest Generated: January 20, 2026*
*Last Updated: February 19, 2026 (Report-Aware AI Agent, Health Check UX, v2.4.0)*
