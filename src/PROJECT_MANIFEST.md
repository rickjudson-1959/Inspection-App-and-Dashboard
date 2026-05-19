# PIPE-UP PIPELINE INSPECTOR PLATFORM
## Project Manifest - May 19, 2026

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

### Activity Types (29 Supported)
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
12. Tie-in Coating (uses CoatingLog component)
13. Ditch (with BOT checklist, trackable items)
14. Lower-in
15. Backfill
16. Tie-in Backfill (renamed from Tie-in Completion; uses TieInCompletionLog component)
17. Cleanup - Machine
18. Cleanup - Final
19. Hydrostatic Testing
20. HDD (Horizontal Directional Drilling)
21. HD Bores
22. Piling
23. Equipment Cleaning
24. Hydrovac
25. Welder Testing
26. Counterbore/Transition
27. Frost Packing
28. Pipe Yard (generic activity)
29. Other (generic catch-all)

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
- **Reconciliation Dashboard** - Visual four-panel LEM reconciliation (Panel 1: Contractor LEM | Panel 2: Inspector Report with costs | Panel 3: Contractor Daily Ticket | Panel 4: Inspector Ticket Photo), costed inspector panel with inline editing (RT/OT/DT hours and rates, subsistence, cost per person), learning classification alias system (`classification_aliases` table), rate card support for weekly/daily salaried rates and hourly Red Book rates, equipment daily rates with base+parts breakdown, LEM comparison toggle, audit-logged edits to inspector data, text-based PDF classification (zero API calls), billing status management, invoice batching, crossing support reconciliation, trackable items reconciliation (14 categories)

### Reporting & Export
- PDF report generation with all activity data, quality checks, specialized logs, work photo thumbnails, and document certification
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

**trackable_items** table — 14 categories tracked by inspectors via `TrackableItemsTracker.jsx`:
1. **Mats** — mat_type, mat_size, mat_material, crossing_reason, from_location, to_location, crew (consolidated from MatTracker)
2. **Rock Trench** — rock_type, depth_achieved, spec_depth
3. **Extra Depth Ditch** — extra_depth_amount, total_depth, in_drawings, approved_by
4. **Bedding & Padding** — protection_type, material (7 types each)
5. **Temporary Fencing** — fence_type, fence_purpose, side, gates_qty, landowner
6. **Ramps** — ramp_type, ramp_material, mats_used, mat_count, crossing_id, foreign_owner
7. **Goal Posts** — utility_owner, post_material, material_compliant, authorized_clearance, posted_height, danger_sign, reflective_signage, grounding_required/installed, offset_distance/compliant
8. **Access Roads** — access_type, surface, width
9. **Hydrovac Holes** — hole_type, depth
10. **Erosion Control** — control_type, watercourse
11. **Signage & Flagging** — sign_type
12. **Equipment Cleaning** — equipment_type, equipment_id, cleaning_type, cleaning_location, cleaning_station_kp, inspection_status, inspector_name, biosecurity_concerns, weed_wash_cert, photo_taken, contractor
13. **Welding** — upi_type, weld_number, status
14. **Counterbore/Transition** — weld_number, upi_type (Counterbore/Transition/Both), kp_location, quantity, status

Common columns: action, quantity, unit, from_kp, to_kp, kp_location, length, reason, equipment, notes, report_id, report_date, inspector, organization_id

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

### Contractor LEM Reconciliation Tables (NEW - March 2026)

**contractor_lem_uploads**
- Parent LEM document records (one per uploaded PDF)
- Organization-scoped with RLS
- Contractor name, LEM period (start/end), LEM reference number
- Source file URL (PDF stored in `lem-uploads` bucket)
- Aggregated totals: labour hours/cost, equipment hours/cost, total claimed
- lem_category: direct (field crew with inspector), indirect (overhead/office), third_party (subcontractor) — Added Mar 21, 2026
- Status workflow: uploaded → parsed → approved
- Uploaded by user FK

**standalone_tickets** (NEW — March 21, 2026)
- Admin/cost-control-entered tickets for work without inspector reports
- For indirect overhead, third-party subcontractors, and direct crews without inspectors
- ticket_number, work_date, contractor_name, po_number, lem_category
- ticket_photo_urls (JSONB — scans/photos of signed ticket)
- labour_entries, equipment_entries (JSONB — same structure as activity block)
- Rate card costing: total_labour_cost, total_equipment_cost, total_cost (calculated on save)
- signed_by, signed_role (who signed the ticket in the field)
- matched_lem_upload_id (FK — linked when contractor's LEM arrives)
- Status: entered → matched → reconciled → approved
- Organization-scoped with RLS

**lem_reconciliation_pairs** (NEW — replaces lem_line_items for visual approach)
- Visual reconciliation pairs extracted from LEM PDFs
- FK to `contractor_lem_uploads` (cascade delete)
- pair_index, work_date, crew_name
- lem_page_urls (JSONB array of image URLs), lem_page_indices (JSONB)
- contractor_ticket_urls (JSONB array of image URLs), contractor_ticket_indices (JSONB)
- Matched report: matched_report_id (FK), matched_block_index, match_method
- ticket_source: 'inspector_report' or 'standalone_ticket' — determines Panel 3 source (Added Mar 21, 2026)
- standalone_ticket_id (FK to standalone_tickets) — for non-inspector tickets (Added Mar 21, 2026)
- lem_claimed_data (JSONB) — Claude Vision OCR-extracted billing data from LEM summary pages: labour[], equipment[], totals{} (Added Mar 21, 2026)
- Resolution: status (pending/accepted/disputed/skipped), resolution type, notes, resolved_by/at
- dispute_type column: 'variance' or 'ticket_altered' (NULL for non-disputed) — CHECK constrained (Added Mar 13, 2026)
- RLS policy: `is_super_admin() OR organization_id IN (SELECT user_organization_ids())` (aligned Mar 13, 2026)

**contractor_invoices**
- Invoice records linked to approved LEMs (reconciliation gate)
- FK to `contractor_lem_uploads` with ON DELETE CASCADE (added Mar 13, 2026)
- DB-enforced approval gate: `check_lem_invoice_gate()` BEFORE INSERT trigger rejects invoices for non-approved LEMs (added Mar 13, 2026)
- RLS policy: `is_super_admin() OR organization_id IN (SELECT user_organization_ids())` (aligned Mar 13, 2026)
- Invoice number, date, period (start/end)
- Source file URL (PDF stored in `contractor-invoices` bucket)
- Parsed totals: labour hours/cost, equipment hours/cost, subtotal, tax, total
- Reconciled comparison totals from linked LEM
- Variance tracking: amount and percentage
- Status workflow: uploaded → parsed → matched → approved → rejected → paid
- Approval chain: approved by, approved at, notes
- Rejection reason
- Payment tracking: payment date, payment reference

### 4-Panel Reconciliation Tables (NEW - March 22, 2026)

**reconciliation_documents**
- Stores UPLOADED contractor documents only (LEM and daily ticket)
- Inspector data (photo + report) pulled from existing app tables, not uploaded
- organization_id, ticket_number (the universal join key), doc_type (contractor_lem | contractor_ticket)
- file_urls (text array — supports multi-page PDFs and multiple images)
- page_count, status (pending | processing | ready | matched | error)
- linked_lem_id (FK to contractor_lems), linked_report_id (FK to daily_reports)
- date, foreman — context for display and filtering
- uploaded_by (FK to auth.users)
- Organization-scoped with RLS

**recon_package_status** (VIEW)
- One row per ticket_number showing which uploaded docs exist
- has_lem, has_ticket counts from reconciliation_documents
- Photo and report status supplemented by querying daily_reports in the component
- Used by ReconciliationList for the ticket overview table

**reconciliation_line_items** (NEW - March 23, 2026)
- Per-row reconciliation decisions for labour and equipment variance comparison
- organization_id, ticket_number (join key), item_type (labour | equipment)
- Matching: lem_worker_name, inspector_worker_name, match_confidence (0-1), match_method (exact, last_initial, nickname, etc.)
- LEM data: lem_rt_hours, lem_ot_hours, lem_dt_hours, lem_total_hours, lem_cost
- Inspector data: inspector_rt_hours, inspector_ot_hours, inspector_dt_hours, inspector_total_hours
- Variance: variance_hours, variance_cost
- Decision: status (pending | accepted | disputed | adjusted), adjusted_hours, adjusted_cost, dispute_notes
- reconciled_by (FK to auth.users), reconciled_at
- Organization-scoped with RLS

### Pipeline Route Tables (NEW - April 16, 2026)

**pipeline_routes** — Parent: one row per uploaded KMZ layer
- organization_id, project_id (nullable), kmz_upload_id (FK to kmz_uploads)
- name, description, layer_type (alignment/construction/environmental/row/other)
- total_length_m, kp_start, kp_end, default_center_lat/lng, default_zoom
- is_active (boolean), superseded_route_id (FK to self for reject-restore chain)
- unclassified_features (JSONB — features the parser couldn't classify)

**Child tables** (all have organization_id + route_id with ON DELETE CASCADE):
- `route_centerline` — seq, lat, lng, elevation (3033 pts for March construction, 774 for alignment)
- `route_kp_markers` — kp, lat, lng, label (367 from alignment layer)
- `route_welds` — weld_id, kp, lat, lng, weld_type, properties JSONB (684 from March construction)
- `route_bends` — bend_id, kp, lat, lng, bend_type, properties (188 from construction)
- `route_footprint` — name, polygon JSONB, properties (248 from alignment)
- `route_open_ends` — name, kp, lat, lng, end_type, properties (47 from construction)
- `route_bore_faces` — name, kp, lat, lng, face_type, properties (2 from construction)
- `route_sag_bends` — name, kp, lat, lng, properties (154 from construction)

**RPC function**: `insert_pipeline_route(JSONB)` — single Postgres transaction for all inserts. Supersedes previous active route of same layer_type. Returns route_id, counts, superseded_route_id.

**KMZ uploads tracking**: `kmz_uploads` table with group_name, revision, is_current for revision history.

### Storage Buckets

- **`kmz-files`** — KMZ file uploads. Path: `{org_id}/{timestamp}_{filename}`
- **`reconciliation-docs`** — Uploaded contractor LEMs and daily tickets. Path: `{org_id}/{ticket_number}/{doc_type}/{filename}`

### FEED Intelligence Tables (NEW - March 2026, v2 - March 19, 2026)

**feed_estimates**
- One FEED estimate per project per org (partial unique index: one active per project where approval_status != 'superseded')
- EPCM firm (plain text) + epcm_firm_id (FK to `epcm_firms`, nullable — both coexist for backward compat)
- Estimate class (Class 2/3/4/5), estimate date, total estimate, currency (CAD default)
- v2 columns: estimate_version (text, default 'V1'), estimate_basis_year (integer), contingency_pct, escalation_pct (numeric(5,2)), approval_status (draft | approved_for_FID | superseded), source_document_url (link to FEED report)
- Meta (JSONB: notes, assumptions), created by user FK, org-scoped with RLS

**feed_wbs_items**
- WBS (Work Breakdown Structure) line items within a FEED estimate
- FK to `feed_estimates` (cascade delete)
- WBS code, scope name, scope_category (10 standard buckets: mainline_install, hdd_crossings, road_water_crossings, station_tieins, hydro_test_commissioning, mob_demob, environmental_regulatory, pm_inspection, materials, other)
- Estimated amount (numeric(14,2)), unit, unit rate, quantity, basis notes
- Sort order for drag-to-reorder
- Categories enable cross-project benchmarking

**feed_wbs_actuals**
- Bridge table mapping LEM line items to WBS scope items
- FK to `feed_wbs_items` (cascade delete), FK to `lem_line_items`
- Actual amount (numeric(14,2)), variance note (required for partial tagging), tagged by user FK
- Enables FEED-to-field-spend traceability

**feed_risks**
- Risk register produced during FEED phase
- FK to `feed_estimates` (cascade delete)
- Categories: geotechnical, constructability, regulatory, schedule, environmental
- Severity: low, medium, high, critical
- Status: open, closed, escalated, not_encountered
- Cost allowance per risk item (numeric(14,2))

**feed_risk_closeouts**
- Inspector-authored closeout records linking field evidence to FEED risks
- FK to `feed_risks` (cascade delete), FK to `daily_reports`
- Outcome: resolved, escalated, monitoring
- Actual cost impact (numeric(14,2)), closed date, field notes, closed by user FK

**epcm_firms** (Phase 2 foundation — table created, management UI deferred)
- EPCM engineering firm profiles for cross-project scoring
- Name, short name (e.g. "WorleyParsons"), country (default 'CA'), website
- Contact name, contact email, notes
- FK target for `feed_estimates.epcm_firm_id`
- Org-scoped with RLS

**feed_wbs_variance** (VIEW)
- Joins `feed_wbs_items` to aggregated `feed_wbs_actuals`
- Computes: actual_amount, variance_amount, variance_pct in the database
- Includes scope_category for per-category analysis
- tagged_lem_count per WBS item
- Inherits RLS from underlying tables

**feed_estimate_summary** (VIEW)
- Rolled-up estimate-level metrics from `feed_estimates` joined to `feed_wbs_variance`
- Computes: total_actual, total_variance_amount, total_variance_pct
- EPCM accuracy grade: A (±5%), B (±10%), C (±20%), D (>20%)
- wbs_item_count, wbs_items_with_actuals
- Includes all v2 metadata: estimate_version, estimate_basis_year, contingency_pct, escalation_pct, approval_status, source_document_url
- Used by dashboard header cards and EPCM firm scoring engine (Phase 2)

**feed_category_benchmarks** (VIEW — Phase 2 foundation)
- Cross-project benchmark by WBS scope_category
- Computes: project_count, avg/min/max/median variance_pct, avg unit_rate
- Only includes items with actual spend (WHERE actual_amount > 0)
- Groups by org_id + scope_category
- Every project added builds the benchmark dataset

### Supabase Storage Buckets (LEM/Invoice)

- **`lem-uploads`** — Stores original LEM PDFs and page images for visual reconciliation (`lem-uploads/{orgId}/`, `lem-uploads/{lemId}/lem_pages/`, `lem-uploads/{lemId}/ticket_pages/`)
- **`contractor-invoices`** — Stores original invoice PDFs (`contractor-invoices/{orgId}/`)

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
│   ├── queryHelpers.js         # Org-scoped query helpers (useOrgQuery)
│   ├── feedAuditLogger.js      # FEED module audit logger — writes to report_audit_log with module:'feed_intelligence', is_critical:true, regulatory_category:'financial' (NEW - Mar 2026)
│   ├── lemParser.js            # LEM PDF parser: pdf.js text extraction, content-marker classification, adjacency pairing, background image upload + Claude Vision OCR extraction of LEM billing line items. New `extractLEMFromUrl()` handles both PDFs (multi-page render via pdf.js) and images. `extractLEMLineItemsFromBase64()` for per-page OCR. (Updated Apr 4, 2026)
│   ├── lemMatcher.js           # Three-strategy matching engine: exact ticket → normalized ticket → date+crew fallback, variance calculation (NEW - Mar 2026)
│   ├── ticketNormalizer.js     # Ticket number normalization: strips prefixes, handles format variations (NEW - Mar 2026)
│   ├── nameMatchingUtils.js    # 7-pass fuzzy name matching: exact, last+initial, Levenshtein, nickname (34 names), typo, reversed, initials. Equipment token overlap. (NEW - Mar 23, 2026)
│   └── varianceCalculation.js  # Per-worker RT/OT/DT hour + cost variance, color coding, status icons, aggregate totals (NEW - Mar 23, 2026)
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
│   ├── HydrotestLog.jsx        # Full 9-section hydrotest form (NEW - Mar 2026)
│   ├── HydrovacLog.jsx
│   ├── EquipmentCleaningLog.jsx
│   ├── WelderTestingLog.jsx
│   ├── MachineCleanupLog.jsx
│   ├── FinalCleanupLog.jsx
│   ├── ConventionalBoreLog.jsx
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
    ├── LEMUpload.jsx            # Contractor LEM PDF upload, parse, preview, save (NEW - Mar 2026)
    ├── LEMReconciliation.jsx    # Visual four-panel reconciliation: three-lane support (direct/indirect/third_party), editable Panel 4 with rate card costing, standalone ticket integration, LEM OCR extraction trigger, forced org filtering (Updated Mar 21, 2026)
    ├── LEMFourPanelView.jsx     # Four-panel visual comparison: P1=Contractor LEM (with OCR-extracted claimed data), P2=Contractor ticket, P3=Our ticket photo (inspector or admin), P4=Editable data panel (inspector report or system-calculated costs with inline editing + audit trail). Batch report matching, keyboard nav, resolution bar (Updated Mar 21, 2026)
    ├── LEMDashboard.jsx         # Central LEM tracking dashboard — organized by PO/contractor, filters by category (direct/indirect/third_party) and status, standalone ticket entry integration (NEW - Mar 21, 2026)
    ├── TicketEntry.jsx          # Admin/cost control ticket entry form — labour/equipment tables, photo upload, rate card costing, audit logging. For tickets without inspector reports (NEW - Mar 21, 2026)
    ├── InvoiceUpload.jsx        # Invoice upload with reconciliation gate, Claude Vision parsing, variance comparison (NEW - Mar 2026)
    ├── InvoiceComparison.jsx    # Invoice vs reconciliation comparison, approve/reject/mark-paid workflow (NEW - Mar 2026)
    ├── FeedDashboard.jsx        # FEED Intelligence main dashboard — 4-tab layout (Overview, Setup, WBS, Risks), metric cards from feed_estimate_summary view, EPCM accuracy grade (A/B/C/D), estimate metadata row, recharts variance chart, risk summary strip (v2 - Mar 2026)
    ├── FeedEstimateSetup.jsx    # FEED estimate create/edit — EPCM firm (text + linked profile), class, version, basis year, contingency/escalation %, approval status, source doc URL, notes. Audit-logged (v2 - Mar 2026)
    ├── FeedWBSTable.jsx         # WBS line items — inline edit, scope_category (10 types), reorder, "Load template" (8-row pipeline template), variance coloring (green/amber/red), summary bar, Tag LEMs button (v2 - Mar 2026)
    ├── FeedTagLEM.jsx           # Slide-over to tag/untag LEM entries to WBS items, search by ticket/crew/activity/foreman (v2 - Mar 2026)
    ├── FeedRiskRegister.jsx     # Risk register — inline add/edit, category/severity badges, bulk status, variance-to-allowance column, closeout link (v2 - Mar 2026)
    ├── FeedRiskCloseout.jsx     # Risk closeout modal — links inspector report, outcome, actual cost impact, auto-updates risk status (v2 - Mar 2026)
    ├── Reconciliation/            # 4-Panel Reconciliation System (NEW - Mar 22, 2026)
    │   ├── ReconciliationUpload.jsx  # Upload form — contractor LEM and daily ticket only (inspector data auto-linked). Auto-triggers LEM OCR extraction into contractor_lems on upload (Updated Apr 4, 2026)
    │   ├── ReconciliationList.jsx    # Ticket list with 4-column completion status (LEM/TK/PH/RPT), merges recon_package_status + daily_reports
    │   ├── ReconFourPanelView.jsx   # 2x2 grid: P1 Contractor LEM, P2 Inspector Report (costs), P3 Contractor Ticket, P4 Inspector Photo. Loads rate cards + aliases, toggle for LEM comparison (Updated Apr 10, 2026)
    │   ├── DocumentPanel.jsx        # Reusable panel with PDF/image viewer, fullscreen expand (⛶), zoom, rotate, page nav, panelType routing. Passes rate card/alias props to InspectorReportPanel (Updated Apr 6, 2026)
    │   ├── InspectorReportPanel.jsx # Costed inspector panel: Name, Classification (searchable dropdown), RT Hrs/Rate, OT Hrs/Rate, DT Hrs/Rate, Subs, Cost. Inline click-to-edit with audit logging, learning alias system (classification_aliases table), rate lookup with whitespace normalization + token matching. Weekly/daily salaried rates and hourly Red Book rates. Portal-rendered dropdown. (Rewritten Apr 6–10, 2026)
    │   ├── PdfViewer.jsx            # pdf.js canvas renderer with page navigation
    │   ├── ImageViewer.jsx          # Image renderer with ctrl+scroll zoom, click-to-fullscreen
    │   ├── VarianceDetailPopover.jsx     # Three-line variance detail popover (LEM/Contract/Inspector), accept/dispute buttons, portal-rendered below clicked row (NEW - Apr 21, 2026)
    │   ├── AdminOverridePopover.jsx     # Admin override form with required reason, blue dot indicator, remove override option (NEW - Apr 21, 2026)
    │   ├── VarianceComparisonPanel.jsx  # DELETED Apr 21 — variance merged into InspectorReportPanel
    │   ├── VarianceSummaryBar.jsx       # DELETED Apr 21 — no longer needed
    │   └── VarianceRow.jsx              # DELETED Apr 21 — no longer needed
    ├── MapDashboard.jsx
    ├── OfflineStatusBar.jsx     # PWA status indicator (NEW - Jan 2026)
    └── [supporting components]
│
├── MiniMapWidget.jsx              # Pipeline map — loads route data from DB via useRouteData() hook, org-scoped, cached per org. Queries alignment layer (KP markers, footprint) + construction layer (welds, bends, centerline). Replaced static egpRouteData.js import. (Refactored Apr 16, 2026)
├── MasterGaps.jsx                 # Admin view for unresolved + flagged rows. Two tabs: Unresolved (grouped by name/unit) and Flagged for Review. Route: /:orgSlug/master-gaps (NEW - Apr 19, 2026)
│
├── lib/
│   └── contractCompliance.js      # Contract Compliance Engine: calculateSplit (weekday/Saturday/Sunday/holiday rules), calculateCost, calculateVariance. Province-aware holiday lookups. (NEW - Apr 19, 2026)
├── KMZUpload.jsx                  # KMZ file upload with layer type selection, parse results, accept/reject flow, supersede warnings, revision history (NEW - Apr 16, 2026)
├── DPRConfig.jsx                  # Daily Progress Report configuration (NEW - Apr 14, 2026)
├── DPRTab.jsx                     # Daily Progress Report editor tab (NEW - Apr 14, 2026)
├── AcceptInvite.jsx               # Custom 7-day invitation acceptance page (NEW - Apr 14, 2026)

/api/                               # Vercel Serverless Functions
├── rates.js                       # Rate card CRUD (labour, equipment, personnel roster, equipment fleet)
├── parse-kmz.js                   # KMZ parser: auth-verified, org-scoped, calls insert_pipeline_route RPC. Handles alignment + construction layers, MultiGeometry, centerline stitching, unclassified safety net (NEW - Apr 16, 2026)
├── send-dpr-email.js              # DPR PDF email via Resend (NEW - Apr 14, 2026)
├── send-feedback-email.js         # User feedback email
├── send-report-email.js           # Report email

/pipe-up-automation/              # Regulatory Compliance Automation (NEW - Mar 2026)
├── generate.py                # Single-file script: PDF → HTML map + Word report
├── parse_permits.py           # BCER permit PDF parser → regulatory_zones.json
├── config.json                # Project config (paths, KP range, map center)
├── requirements.txt           # pdfplumber, python-docx, anthropic, python-dotenv
├── permits/                   # Drop BCER permit PDFs here (22 permits currently)
├── cvi_engine.py              # Capital Variance Index (CVI) engine — standalone PoC
├── data/
│   ├── doc.kml                # Pipeline route KML (chainage placemarks + centerline)
│   ├── regulatory_zones.json  # Regulatory zones (7 types) — auto-generated by parse_permits.py
│   ├── zones_needing_review.json  # Zones needing manual KP entry — auto-generated
│   ├── kml_cache.json         # Auto-generated KML parse cache
│   ├── cvi_project_config.json  # CVI project budget config ($200M sample data)
│   ├── cvi_dashboard.json     # Auto-generated: dashboard-ready CVI JSON for React
│   └── cvi_history.json       # Auto-generated: append-only daily CVI snapshots
├── daily_reports/             # Input PDFs (EGMP Daily Work Plan)
├── output/                    # Generated maps + reports
│   ├── EGP_Daily_Map_YYYY-MM-DD.html
│   └── EGP_Compliance_Report_YYYY-MM-DD.docx
└── Claude code breifs for Regulatory/
    ├── Claude_Code_Brief_1_Automation_Script.md
    ├── Claude_Code_Brief_2_Minimap_Zones.md
    └── Claude_Code_Brief_3_Permit_Parser.md

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
├── 20260307_create_lem_reconciliation_tables.sql  # contractor_lem_uploads + lem_line_items (NEW - Mar 2026)
├── 20260307_lem_four_way_and_invoices.sql         # contractor_ticket_url column + contractor_invoices table (NEW - Mar 2026)
├── 20260308_lem_visual_reconciliation.sql           # lem_reconciliation_pairs table (NEW - Mar 8, 2026)
├── 20260313_lem_invoice_gate_and_cascade.sql        # CASCADE DELETE + BEFORE INSERT approval gate trigger (NEW - Mar 13, 2026)
├── 20260313_add_dispute_type_column.sql             # dispute_type column on lem_reconciliation_pairs (NEW - Mar 13, 2026)
├── 20260313_align_lem_rls_policies.sql              # is_super_admin() bypass on all 4 LEM tables (NEW - Mar 13, 2026)
├── 20260319_create_feed_intelligence_tables.sql     # feed_estimates, feed_wbs_items, feed_wbs_actuals, feed_risks, feed_risk_closeouts, epcm_firms + RLS + indexes (NEW - Mar 19, 2026)
├── 20260319_feed_v2_schema_additions.sql            # ALTER feed_estimates: estimate_version, basis_year, contingency/escalation, approval_status, source_document_url, epcm_firm_id FK (NEW - Mar 19, 2026)
├── 20260319_create_feed_wbs_variance_view.sql       # feed_wbs_variance view (estimated vs actual + variance % per WBS item) (NEW - Mar 19, 2026)
├── 20260319_feed_v2_views.sql                       # feed_estimate_summary view (accuracy grade, rolled-up metrics) + feed_category_benchmarks view (cross-project benchmarks) (NEW - Mar 19, 2026)
├── 20260321_lem_categories_and_standalone_tickets.sql # lem_category on contractor_lem_uploads, standalone_tickets table, ticket_source/standalone_ticket_id/lem_claimed_data on lem_reconciliation_pairs (NEW - Mar 21, 2026)
├── reconciliation_documents_migration.sql            # reconciliation_documents table + recon_package_status view + RLS + triggers (NEW - Mar 22, 2026)
├── 20260322_reconciliation_line_items.sql            # Per-row reconciliation decisions for variance comparison + RLS (NEW - Mar 23, 2026)
└── [other migrations]
```

---

## 6. RECENT UPDATES (January–May 2026)

### Chief Helpers — Per-Gang Baselines + KP Overlaps + Field-Name Bugfix (May 19, 2026)

Two commits to `src/chiefReportHelpers.js` cleaning up baseline shape
and fixing real bugs in `activity_blocks` aggregation that had been
silently producing zeros.

**1. Per-gang baselines (`39fc9fe`).** `fetchProjectBaselines` now
aggregates by `(activity_type, gang_label)` instead of `activity_type`
alone, so each gang within a phase gets its own row. Multiple
baseline segments for the same gang sum their metres / budget and
union their KP range (min `from_kp`, max `to_kp`).

`buildProgressData` iterates the per-gang baselines directly (no
more hardcoded activity list) and carries `gang_label`, `from_kp`,
`to_kp` onto each output row alongside the existing
`completed_to_date` / `daily_actual` / `percent_complete` fields.

Cumulative/daily/MTD aggregates are still at the `activity_type`
level — comment in `buildProgressData` flags that follow-up work
should filter inspector blocks by KP range against each gang's
`from_kp`/`to_kp` to get true per-gang cumulative.

New named export `detectKPOverlaps(progressData)`: groups by
`activity_type`, pairwise compares every gang in a phase, returns
`{ activity_type, gang_a, gang_b, overlap_start, overlap_end }`.
Strict `Math.max(fromA, fromB) < Math.min(toA, toB)` so endpoint-
touching ranges (0–5 and 5–10) don't flag.

Companion SQL (paste into Supabase SQL Editor):
```
ALTER TABLE project_baselines ADD COLUMN IF NOT EXISTS gang_label TEXT;
COMMENT ON COLUMN project_baselines.gang_label IS
  'Identifier for a gang/crew operating within an activity_type. NULL = single-gang phase.';
```

No changes to `ChiefDashboard.jsx` — wiring the gang-level rows
into the UI is a follow-up.

**2. Field-name bugfix — `block.metres` and chainage KPs
(`127013b`).** Inspecting daily_reports row 2058 live (via the new
`scripts/inspect-report.cjs` helper) confirmed two bugs that had
been silently producing wrong totals.

- `block.metres` doesn't exist. The form (InspectorReport.jsx)
  writes `metersToday` (American spelling, as a STRING), plus
  `metersPrevious` / `metersToDate` for context. The previous
  helpers were reading `parseFloat(block.metres) || 0` → `NaN || 0`
  → 0 for every block. Cumulative / daily / MTD totals would have
  been zero or near-zero whenever they relied on these calcs.
- `startKP` / `endKP` are chainage notation strings (`'13+900'`
  = 13km+900m). `parseFloat('13+900')` returns `13`, silently
  dropping the metres portion. The previous `calculateDailyProgress`
  did *lexicographic* min/max on the raw strings, which also breaks
  at km boundaries (`'9+999'` vs `'10+000'`).

Two new helpers, both exported:
- `parseBlockMetres(block)` — reads `metersToday` with a
  `metresToday` fallback for legacy data.
- `parseChainageKP(str)` — splits on `+`, returns `km*1000 + m`,
  passes plain numbers through, returns `null` on invalid input.

Applied:
- `calculateCumulativeProgress`, `calculateDailyProgress`,
  `calculateMTDProgress` — `block.metres` → `parseBlockMetres`.
- `calculateDailyProgress` — KP min/max comparison switched to
  parsed metres; raw chainage strings preserved on the output as
  `start_kp` / `end_kp` (for display), with new numeric
  `start_kp_metres` / `end_kp_metres` fields for math.
- `fetchProjectBaselines` and `detectKPOverlaps` — switched from
  `parseFloat` to `parseChainageKP` defensively (baselines may
  store KP either as chainage strings or plain numeric metres).

**Verified, no change needed in `DPRTab.jsx`.** It imports `parseKP`
from `kpUtils.js` aliased as `parseKPToMetres`. `kpUtils.parseKP`
(lines 231–251) already splits on `+` and computes `km*1000 + m`
correctly — confirmed at the call sites in `DPRTab.jsx:241-242`.

**InspectorReport.jsx — source of truth, untouched.** Has its own
local `parseKPToMetres()` at line 1407 with the same semantics.
The canonical field names live there; helpers now match the form,
not the other way around.

**Files added / changed:**
```
src/chiefReportHelpers.js
  - parseBlockMetres, parseChainageKP helpers (exported)
  - fetchProjectBaselines: group by (activity_type, gang_label)
  - buildProgressData: per-gang rows w/ gang_label, from_kp, to_kp
  - detectKPOverlaps: new exported function
  - block.metres → parseBlockMetres in 3 calc functions
  - chainage parsing in calculateDailyProgress KP min/max

scripts/inspect-report.cjs
  - One-off: node scripts/inspect-report.cjs <id> dumps a
    daily_reports row's activity_blocks JSON + top-level keys.
    Service-role key inlined (same pattern as other recovery
    scripts in scripts/).
```

No migrations beyond the inline ALTER above. No field-guide impact.

### Inspector Report Panel Overrides + Variance UX + Offline Reachability + Roster-Constrained OCR (May 16, 2026 — evening)

Long session covering five themes — all merged to `main` and live on
Vercel.

**1. InspectorReportPanel admin overrides actually take effect.**
`calcLabourCost` and `calcEquipmentCost` previously *stored* override
values via the `PencilIcon` → `AdminOverridePopover` flow but never
read them back when computing cost. Both calculators now check for an
`<field>_override` metadata blob on the entry; when present, the
overridden value at `entry[field]` is used. `cost_override` short-
circuits the per-rate sum (it's a final-cost override). Equipment
calc preserves the legacy "0 hours = not billed" rule unless an
override is present.

PencilIcons added to all the cells that were previously read-only
display:
- labour: `rtRate` (label adapts: "Daily Rate" for day-rate
  workers, "RT Rate" otherwise), `otRate`, `dtRate`
- equipment: `rate`, `cost` (equipment was previously asymmetric —
  no pencils at all; labour had two)

**2. Variance resolution flow rebuilt.**
- `resolveVariance` is now one-click — the `window.prompt` for a
  resolution note is gone. The audit entry still records `by` and
  `at`; the note defaults to empty.
- Red banner gets a filled-red "Resolve" button (was outlined).
- Green banner replaces the "Re-open" outline button with a
  disabled filled-green "Resolved ✓" indicator so the row reads
  as actioned at a glance. The unresolve hook moved onto the
  banner text — clicking "Resolved by …" re-opens.
- Small ✏️ next to the banner text opens an inline text input
  for `variance_resolution_note`. Saves through `onBlockChange`
  with an audit entry. Lets admins add the explanation
  *after* resolving (the prompt path is gone).
- Trailing `": "` on the resolved-row banner is now suppressed
  when the note is empty.

**3. LEM-vs-inspector name matching.**
`labourVarianceMap` (line ~390 of `InspectorReportPanel.jsx`) gained
a reversed-token match pass between the exact-match and Levenshtein-
fuzzy passes. Splits on `[,\s]+`, reverses the tokens, compares
either direction — handles "Smith, John" ↔ "John Smith" without
needing a fuzzy hit. Levenshtein threshold also dropped 0.8 → 0.72
to catch more near-misses.

**4. Cross-report duplicate detection.**
`ReconFourPanelView` now builds `crossReportLabour` and
`crossReportEquipment` from all same-date reports excluding the
current report's own ID, each entry carrying `{ inspector, date }`.
Plumbed through `DocumentPanel` to `InspectorReportPanel`.
`getLabourDuplicateWarning` and `getEquipmentDuplicateWarning` get
a new check alongside the existing same-ticket and cross-ticket-
same-day checks: when a name (labour) or unit_number (equipment)
appears on another inspector's report for the same date, the
duplicate banner gains `Also reported by <inspector> on <date>`.
Joins through the same `' | '` pipeline as the existing checks.

**5. LEM OCR — roster-constrained personnel names.**
`extractLEMLineItemsFromBase64` (in `src/utils/lemParser.js`)
already accepted `opts.rosterNames` but only used it for a JS
post-check (`splitLabourByRoster`). The roster is now also injected
into the Vision prompt with an explicit rule: only return
`employee_name` values that match a roster entry; return `null` if
no confident match; do not guess or infer names. JSON schema hint
adjusted to reflect "exact name from the roster, or null if no
match". JS post-check stays as defense-in-depth.

Only the `bulkUploadProcessor` path supplies a roster, so that's
the only call site affected. The legacy `extractLEMLineItems`
(image-URL extractor) is not currently called from production — a
JSDoc note flags it as such and warns that reactivation requires
adding roster injection first.

**6. Offline detection — fetch-based reachability + adaptive
polling.** `useOnlineStatus` in `src/offline/hooks.js` no longer
trusts `navigator.onLine` alone (it returns `true` on captive-portal
Wi-Fi and flaky cell). Every time `navigator.onLine` is `true`,
the hook does a HEAD to `${VITE_SUPABASE_URL}/rest/v1/` with a 5s
AbortController timeout; any HTTP response (200/401/404) counts as
reachable, only a network error or timeout sets `isOnline` to
false. The 2s `setInterval` is replaced with a recursive
`setTimeout` driven by a `confirmedOnlineRef`: 10s when reachability
is confirmed, 2s when offline or unconfirmed (cheap re-checks vs
snappy recovery polling). The `'offline'` event force-cancels the
pending tick and reschedules at 2s immediately so we don't wait
up to 10s for the next poll. An `inFlightRef` prevents stacked
probes if a tick takes longer than the next scheduled delay.

**7. UI polish.** `ReconciliationList` (the "Reconciliation
Packages" page) gained a `← Back to Admin` link in the upper-left,
matching the existing pattern in
`InspectorInvoicingDashboard.jsx:235`. Convention saved to memory:
every top-level page should have a back button in the upper-left.

**Files changed:**
```
src/components/Reconciliation/InspectorReportPanel.jsx
  - calcLabourCost / calcEquipmentCost honor *_override
  - PencilIcons on rtRate/otRate/dtRate/(eq) rate/(eq) cost
  - resolveVariance: prompt removed, 1-click, empty note
  - Red Resolve button: filled red; green Resolved ✓ disabled
  - Inline variance_resolution_note edit on green banner
  - labourVarianceMap: reversed-token pass, 0.72 threshold
  - getLabourDuplicateWarning / getEquipmentDuplicateWarning:
    cross-report check appended via join(' | ')
  - props: crossReportLabour, crossReportEquipment

src/components/Reconciliation/ReconFourPanelView.jsx
  - Builds crossReportLabour / crossReportEquipment from same-date
    reports excluding the current report's id

src/components/Reconciliation/DocumentPanel.jsx
  - Forwards new cross-report props through to InspectorReportPanel

src/components/Reconciliation/ReconciliationList.jsx
  - "← Back to Admin" button upper-left, routes to /admin

src/utils/lemParser.js
  - extractLEMLineItemsFromBase64: roster + null-on-no-match rule
    injected into the Vision prompt when rosterNames supplied
  - extractLEMLineItems: JSDoc flags as not-in-production +
    "needs roster injection before reactivation" note

src/offline/hooks.js
  - confirmReachable(): HEAD probe + 5s AbortController timeout
  - useOnlineStatus: recursive setTimeout w/ confirmedOnlineRef,
    adaptive 10s/2s cadence, force-reschedule on 'offline'
```

No migrations. No field-guide impact — admin-side reconciliation
panel changes only; inspector-side report shape unchanged.

### Bulk-Upload Recovery — Ticket-Number Inheritance + Equipment Cap (May 16, 2026 — afternoon)

Follow-ups to the morning's storage-only recovery on bulk
`0cf99a72-...` (Jan 21 2014 Aecon CLX2 package):

**1. Ticket-number inheritance.** The first recovery pass generated
INDEPENDENT ticket_numbers for each group's LEM and daily-ticket
storage subdirs: the LEM was OCR'd and got the real Field Log ID
("18292"), but the daily-ticket pages don't print the Field Log ID
in a format Vision could read, so they fell to the `AUTO-…-g-XXX`
fallback. Result: every foreman's package was split across two
ticket_numbers in the reconciliation list — Brett Whitworth's LEM
under "18292", his daily ticket under "AUTO-0cf99a72-g-05a650c3".

`scripts/recover-bulk-upload.cjs` now processes LEM groups first,
stores their `(groupId → ticketNumber)` mapping, and propagates
the LEM's ticket_number + foreman + date into the corresponding
ticket group (matched by the same storage `g-XXXX` group_id). No
ticket-side OCR needed — single OCR pass per group instead of two.
Final state: 33 of 34 groups paired (LEM + ticket under one
ticket_number); 1 LEM-only (Field Log ID unreadable even at scale
4 — admin renames manually).

**2. Equipment cap of 30 per LEM.** Ticket 18277 came back with
115 equipment entries — Vision aggregating + duplicating units
across the LEM's 4 pages. No real daily LEM has 30+ pieces of
equipment, so both `bulkUploadProcessor.runLemExtractionForGroup`
and the recovery script now slice `equipment_entries` to 30 and
add a "Manual review required: OCR returned N entries (cap is 30)"
line to `discrepancy_note`. The cost is recomputed from the
truncated list so saved totals match what's persisted.

Backfilled the three over-cap Jan 21 rows in place via REST PATCH:
18277 (115 → 30, $7,140), 18286 (66 → 30, $9,660), 18275 (38 → 30,
$25,250). Future bulk uploads get the cap applied at write time.

**3. Step-5 skip optimization.** `contractor_lems` rows that
already have a non-empty `labour_entries` array are skipped on
re-run so a script re-invocation only OCRs the unprocessed groups
— ~30s saved per already-extracted ticket.

**Files changed:**
```
scripts/recover-bulk-upload.cjs
  - classifyAndInsert(kind, groupId, inherited)
  - LEM-first loop populates lemGroupMeta
  - ticket loop uses lemGroupMeta.get(groupId) for inheritance
  - skip step 5 when contractor_lems.labour_entries already
    populated for that field_log_id
  - MAX_EQUIPMENT_PER_LEM = 30 cap + discrepancy_note
src/utils/bulkUploadProcessor.js
  - same MAX_EQUIPMENT_PER_LEM = 30 cap in runLemExtractionForGroup
  - discrepancy_note now combines hallucination + equipment-overflow
    when both fire
```

### Bulk-Upload Silent-Failure Diagnostics + Storage-Only Recovery (May 16, 2026)

**Jan 21 incident.** Rick ran a 34-group bulk upload of the
2014-01-21 Aecon CLX2 LEM package. All 34 LEM JPEG groups, 33 ticket
JPEG groups, and the source PDF made it into the
`reconciliation-docs` bucket. The `bulk_uploads` row got created.
But every `reconciliation_documents` insert silently failed — zero
rows landed, and the UI just showed 33 "Partial / LEM ✗ TK ✗"
packages with no error indicator.

**Two fixes shipped:**

1. **`saveBulkUploadGroups` per-group try/catch.** The loop body was
   throwing on the first failing insert, propagating through the
   caller, and getting swallowed somewhere in the UI. The new shape
   collects per-group errors in an array, logs each loudly with
   `console.error` + `err.stack`, and lets subsequent groups
   continue so a single bad row doesn't strand the entire bulk.
   The accumulated `insertErrors` are surfaced at the end of the
   pass with the `bulkUploadId` so the admin can hand it to the
   recovery script.

2. **`scripts/recover-bulk-upload.cjs` — recover from storage alone.**
   When the storage JPEGs + source PDF are intact but
   `reconciliation_documents` rows are missing, re-running the
   bulk upload from the workspace requires the user to manually
   re-tag every page (their localStorage state is gone). The new
   script instead:

     - Lists the bulk's storage subdirs to enumerate the
       group_id → pages mapping that lived in localStorage.
     - For each group, renders the first page from the LOCAL
       source PDF at scale 4 + 270° rotation and OCRs it for
       the printed Field Log ID and foreman.
     - Inserts a `reconciliation_documents` row pointing at the
       EXISTING storage URLs — no re-upload of JPEGs, no
       re-rasterization of pages.
     - For LEM groups, runs the full labour + equipment OCR with
       `personnel_roster` + `equipment_fleet` cross-check (same
       safeguards as the bulk processor) and writes to
       `contractor_lems`.
     - Wires `document_matches` between LEM and ticket rows of
       the same foreman + date.

   Idempotent: if rows already exist for a group (matched by the
   group_id substring in `file_urls`), the script skips OCR and
   re-uses the existing row's id + ticket_number for the LEM
   extraction step. Safe to re-run after partial failures or
   accidental row deletes.

   CLI: `node scripts/recover-bulk-upload.cjs [BULK_ID] [LOCAL_PDF]`

**Root-cause analysis of the original silent failure** is still
open — the per-group try/catch will make the next occurrence loud
enough to diagnose. Suspected mechanism is browser-session-related
(stale auth, RLS denial, or a UI hook swallowing the error).

### LEM OCR Scale 4 + Upright Rotation + Source-PDF Preservation (May 15, 2026 — night)

The earlier "the LEM is too poor quality to OCR, flag for manual entry"
conclusion was wrong. Rick verified the source PDF is perfectly
readable. The actual failure was rasterization quality:

- Bulk-upload OCR was running on the scale-1.5/2.0 cached JPEGs
  (~825–1100 px wide per page) and the workspace's portrait
  rendering of landscape-stored-as-portrait Aecon scans (sideways
  text). Vision was hallucinating against rotated 6-pt table text.
- Rendering page 117 of `CLX2-FC Jan 21.pdf` at `pdftoppm -r 288`
  (≈ pdf.js scale 4 = 2464×3160 px) plus `sips -r 270` for upright
  orientation produced a crystal-clear OCR input — every name and
  number readable.

**Fix:** Three changes wired through the bulk-upload flow:

1. **Render scale bumped to 4.0** for OCR specifically (workspace +
   storage cache stay at 1.5/2.0 — no UI / storage regression).
   `renderPdfPageBase64` now defaults to scale 4 with optional
   rotation parameter, and `renderPageToImage` accepts rotation
   passed through to pdf.js's `getViewport({ scale, rotation })`
   so the canvas comes out pre-rotated with correctly swapped
   dimensions (no CSS transform hacks).
2. **Upright rotation (270°)** applied at OCR render time by
   `bulkUploadProcessor.runLemExtractionForGroup` — matches the
   four-panel viewer's `defaultRotation=270` for these scans.
   Vision now sees upright text.
3. **Fuzzy ED-1 token-set match** as a third tier in the roster
   cross-check (after exact full-name and exact last-token). Each
   OCR token must have an edit-distance-1 match in the same
   roster row. Recovers two failure modes: word-order swaps
   ("AAR Ali" ↔ "Ali ARR") and single-character misreads
   ("Aradi" → "Abadi", "Cheek" → "Check"). Severe misreads
   ("Restau" → "Kerlau", "Shirt" → "Peach") stay suspicious —
   that's correct, they really are wrong.

**Re-extracted ticket 18292** with the corrected pipeline:
21 of 25 labour entries cleanly recovered, $17,849.81 labour cost,
13 equipment entries, $5,557.01 equipment cost, discrepancy_note
cleared. The 4 still-suspicious are genuine severe OCR misreads —
Rick can enter those by hand.

**Source-PDF preservation — new `bulk_uploads` table.**
The original package PDF was previously passed to
`saveBulkUploadGroups` in memory and dropped on the floor. That
made re-OCR impossible without asking the user to re-upload.
Migration `20260515_bulk_uploads.sql` adds:

- `public.bulk_uploads` — `bulk_upload_id`, `organization_id`,
  `project_id`, `source_pdf_url`, `source_pdf_filename`,
  `page_count`, `uploaded_by`, `created_at`. RLS scoped to
  organization membership.
- `reconciliation_documents.source_pdf_url` — denormalised onto
  every per-page row so re-OCR doesn't need a join.

`saveBulkUploadGroups` now uploads the source PDF to
`reconciliation-docs/{orgId}/bulk/{bulkUploadId}/source/{filename}`
and inserts the `bulk_uploads` row before processing groups. Each
`reconciliation_documents` row carries the source URL. The
existing try/catch around the bulk_uploads insert keeps the flow
working before the migration is applied — the column is nullable.

**Files changed:**
```
src/utils/lemParser.js
  - renderPageToImage(page, scale, jpegQuality, rotation)
  - renderPdfPageBase64 default scale: 3.0 → 4.0; +rotation param
  - splitLabourByRoster: third-tier fuzzy ED-1 token-set match
  - +editDistance(a, b), +fuzzyTokenSetMatch(ocrTokens, rosterTokens)
src/utils/bulkUploadProcessor.js
  - OCR re-render at scale 4.0, rotation 270°
  - Source PDF upload + bulk_uploads row insert
  - reconciliation_documents.source_pdf_url denormalisation
supabase/migrations/20260515_bulk_uploads.sql (new — paste into SQL editor)
scripts/reextract-lem-18292.cjs
  - renders from local PDF at scale 4 + 270° rotation
  - fuzzy ED-1 token-set matching mirrored from lemParser.js
```

`20260515_bulk_uploads.sql` must be applied in the Supabase SQL
Editor before new bulk uploads will persist the source PDF — the
insert is wrapped in a try/catch so it silently no-ops if the
table is missing.

### LEM OCR Hardening — Roster Cross-Check + Manual-Entry Flag (May 15, 2026 — evening)

Two issues addressed in a single pass:

**1. Stale `needs_master_resolution` flags — DB backfill.**
After the read-side fix in 6124a8b (see below), the actual data still
carried `needs_master_resolution: true` on 289 labour rows and 34
equipment rows where `master_personnel_id` / `master_equipment_id`
was populated. The flag was set at entry-creation time as
`!masterPersonnelId` and the manpower CSV backfill never cleared it.
A one-shot Node script (`scripts/backfill-needs-master-resolution.cjs`)
walks every `daily_reports.activity_blocks` row and clears the flag
wherever a master_id is set. Touched 45 of 57 reports; the
canonicalised data now lines up with the read-side gate.

**2. Hallucinated names in `contractor_lems` — roster cross-check.**
Ticket 18292's LEM was full of Chicago Cubs players (Kris Bryant,
Addison Russell, Wilson Contreras…) — Vision was hallucinating
plausible-sounding names from a low-quality scan. Two safeguards
added end-to-end:

- **Higher-resolution render for OCR.** `bulkUploadProcessor.js`
  now loads the source PDF once via the new `loadPdfDocument` +
  `renderPdfPageBase64` helpers in `lemParser.js` and re-renders
  every LEM page at scale 3.0 for Vision input. Workspace +
  storage stay at the scale-1.5/2.0 cache (no UI / storage
  regression); only OCR sees the high-res render. Falls back to
  the cached base64 if PDF.js can't reload.
- **Personnel-roster cross-check.** `extractLEMLineItemsFromBase64`
  takes an optional `rosterNames` array. Every name the model
  returns is normalised and matched against the roster (exact +
  fuzzy last-name). Misses go into a new `suspicious_labour`
  field and are excluded from the saved labour entries.
  `bulkUploadProcessor.js` paginates the roster fetch (PostgREST
  caps at 1000; our test org has 1224 rows).
- **Manual-entry threshold.** If ≥50% of names Vision returns
  fail the roster cross-check, the contractor_lems row is saved
  with `labour_entries = []`, `equipment_entries = []`, and
  `discrepancy_note` set. The few coincidental "matches" get
  discarded too — at that signal level they're just common-surname
  collisions on a 1000+ roster. Surfaces the bad scan in billing
  review instead of silently producing $0 or fake totals.

Ticket 18292 was re-extracted via `scripts/reextract-lem-18292.cjs`
(uses the stored scale-2.0 JPEGs because the source PDF wasn't
preserved). 31 names returned, 26 suspicious, 84% — flagged for
manual entry. The "scale 3+ re-render" safeguard applies to FUTURE
bulk uploads only; the one-shot fix had to use what was on disk.

**Files changed:**
```
src/utils/lemParser.js
  - loadPdfDocument(file)
  - renderPdfPageBase64(doc, pageNumber, scale=3.0)
  - extractLEMLineItemsFromBase64(b64, { rosterNames })
    + returns matched + suspicious_labour
  - splitLabourByRoster() — exact + fuzzy last-name match
src/utils/bulkUploadProcessor.js
  - paginated personnel_roster load (1000-row PostgREST cap)
  - runLemExtractionForGroup re-renders LEM pages at scale 3.0
  - threshold: discard everything + flag when ≥50% suspicious
scripts/backfill-needs-master-resolution.cjs (new)
scripts/reextract-lem-18292.cjs (new)
```

No schema migration. `contractor_lems.discrepancy_note` is an
existing column, repurposed for the manual-entry flag.

### Inspector Report Panel — Cost Suppressed by Stale needs_master_resolution (May 15, 2026 — late afternoon)

The cost column was showing $0 for every labour / equipment entry on
ticket 18292 even when a clear master record existed for the person.
Example: "Ali ARR" is present on the LEM PDF, in the inspector report
(`block.labourEntries`), and in `personnel_roster` — but the panel
calculated his cost as $0.

**Root cause:** `needs_master_resolution` is set at entry-creation
time in `InspectorReport.jsx` as `!masterPersonnelId` (line 2641) and
`!masterEquipmentId` (line 2870). When the manpower / equipment-fleet
CSV is uploaded later, the bulk-resolve paths backfill the
`master_personnel_id` / `master_equipment_id` on existing entries but
don't clear the flag. The cost-calc in `InspectorReportPanel.jsx`
then short-circuits to $0 because it only checks the (now stale) flag.

All 25 labour entries on ticket 18292 had `master_personnel_id`
populated AND `needs_master_resolution: true` — the flag was created
when the entries were first entered and never cleared.

**Fix:** Treat the presence of the master_id as the source of truth.
Two small helpers (`isLabourUnresolved`, `isEquipmentUnresolved`) gate
on `needs_master_resolution && !master_*_id` so a stale `true` is
ignored when the entry has actually been resolved. The six call sites
(labour cost, equipment cost, unresolved count × 2, isUnmatched row
styling × 2) all flow through the helpers now, keeping the cost view
and the yellow-border "unmatched" visual cue consistent.

A DB backfill (set `needs_master_resolution = false` wherever
`master_personnel_id` is populated) would canonicalise the data and
also clean up `MasterGaps.jsx` views — not done in this commit; can
follow as a one-shot UPDATE if Rick wants the flag corrected at rest.

**Files changed:**
```
src/components/Reconciliation/InspectorReportPanel.jsx
  - isLabourUnresolved / isEquipmentUnresolved helpers
  - labourCosts / equipmentCosts gated through the helpers
  - unresolvedLabour / unresolvedEquip counts gated through the helpers
  - isUnmatched (labour rows + equipment rows) gated through the helpers
```

No DB / no migration.

### Reconciliation Panel — Per-Image Rotation + Open-Button Fix (May 15, 2026 — afternoon)

Two follow-ups to the rotation work:

**1. Multi-page LEM / Ticket panels rendered as a horizontal ribbon.**
The previous wrapper-level `transform: rotate(270deg)` rotated the
entire flex column. For a single-page row that was harmless. For a
two-page row (e.g. ticket #18292 — 2 LEM pages + 2 ticket pages), the
column got rotated as a unit and the pages laid out left-to-right
instead of stacking, and the rotated visual was wider than the
half-grid panel so the sides were clipped.

Fix: a new `RotatableImage` component renders each page in its own
aspect-ratio'd wrapper, with the `<img>` absolutely positioned and
rotated around its centre. The wrapper takes the rotated aspect
ratio (`natural.h / natural.w` for 90° / 270°), so each rotated
page fills the panel width exactly and pages stack top-to-bottom
in the outer flex column regardless of rotation. The wrapper still
owns CSS `scale(zoom)` so the zoom controls behave the same.

**2. `↗ Open` button did nothing on bulk-uploaded image rows.**
`window.open('', '_blank', 'noopener,noreferrer')` returns `null`
when `noopener` is set (per the WHATWG spec), so the `if (w)
{ w.document.write(html) }` branch silently no-op'd. Replaced with
a `Blob` URL: build the stacked-pages HTML, wrap it as a
`text/html` Blob, `URL.createObjectURL` + `window.open` — preserves
the `noopener` guarantee without needing a writable handle. URL is
revoked 60 s later to free the reference.

**Files changed:**
```
src/components/Reconciliation/DocumentPanel.jsx
  - new <RotatableImage> subcomponent (per-image rotation)
  - render block uses <RotatableImage> instead of rotating the wrapper
  - handleOpenOriginal image-stack path: Blob URL instead of
    document.write into a noopener-null window
```

No DB / no migration.

### Reconciliation Panel — LEM + Ticket Rotation Direction Fix (May 15, 2026)

After `2acc902` (May 13) replaced the canvas-based `PdfViewer` with a
plain `<img>` stack, the LEM and Contractor Daily Ticket panels rendered
visually empty because the wrapper's `transformOrigin: 'top left'` +
`rotate(90deg)` painted every pixel into x<0 (the natural CSS box stays
at origin, so `overflow: auto` couldn't recover any of it). PR #5 fixed
that by switching the wrapper's `transformOrigin` to `'center center'`
when rotated — matching the iframe path's existing behaviour.

With the content finally visible, a second issue surfaced: both panels
came up **upside down**. The `defaultRotation={90}` chosen in `dd76f4a`
(May 13) made sense when rotation flowed through pdf.js's
`getViewport({ rotation })`, but in the CSS-only path the same 90°
clockwise rotation puts the Aecon landscape scans bottom-up. Flipping
both panels to `defaultRotation={270}` (i.e. 90° counter-clockwise)
yields the correct upright landscape orientation.

**Files changed:**
```
src/components/Reconciliation/ReconFourPanelView.jsx
  - Contractor LEM panel: defaultRotation={90} → {270}
  - Contractor Daily Ticket panel: defaultRotation={90} → {270}
src/components/Reconciliation/DocumentPanel.jsx          (PR #5)
  - transformOrigin: safeRotation ? 'center center' : 'top left'
```

No DB / no migration. Admin can still cycle through 0 / 90 / 180 / 270
via the ↻ button if a particular scan was stored differently.

### Reconciliation Panel — Fit-to-Container PDF Rendering (May 13, 2026 — sixth pass)

The 4-panel reconciliation view's PDF panel (Contractor LEM,
Contractor Daily Ticket) was rendering blurry/pixelated regardless
of how high I cranked the base scale. Native PDF viewers (Adobe
Reader, Chrome's built-in viewer) render **at the display's actual
pixel size every time** — not at a fixed scale that gets CSS-
downsampled. PdfViewer was doing the latter: rendering at a fixed
3×/4× scale and letting CSS downsample, which introduces bilinear
softness no matter how high the source scale is.

**Fix — measure container, render to fit:**

`PdfViewer.jsx` now:
1. Wraps its scroll area in a ref'd container.
2. ResizeObserver measures `container.clientWidth` in CSS pixels;
   re-measures on every layout change.
3. Computes a fit-to-width scale: `containerWidth / naturalViewport.width`.
4. Sets the canvas BUFFER to `containerWidth × devicePixelRatio ×
   zoom` (with a 3× floor so the raster has headroom for any
   browser-zoom layered on top).
5. Sets the canvas CSS `width = containerWidth × zoom` and
   `height` proportionally — **no CSS downsampling**.

Result: at zoom=1 the canvas's intrinsic pixels map 1:1 (or 2:1 on
Retina) to the display's actual pixels. The page renders at print
fidelity. Zoom > 1 grows the canvas physically; the container
scrolls. Identical visual quality to opening the PDF in Adobe
Reader / Chrome's viewer at the same display size.

**Why the previous fixes didn't take:** they raised the source
scale (1.5× → 3× → 4×) but kept the same fixed-scale-then-CSS-
shrink pattern. The browser still applied bilinear downsampling
from the large canvas to whatever the panel column was wide. At
~650 px panel width even a 2448 px canvas was being shrunk 3.77×,
which is enough downsampling to introduce visible softness on
small printed text typical of contractor LEMs. The new approach
gives the browser nothing to downsample because the canvas
dimensions match its CSS display size.

**Files changed:**
```
src/components/Reconciliation/PdfViewer.jsx
  - ResizeObserver to track container width
  - render scale = containerWidth / naturalViewport.width × DPR × zoom
  - canvas.style.width / .height set to physical display size
  - canvas.style.maxWidth = 'none' so the container's overflow
    handles oversized canvases (zoom > 1)
  - Loading state lives inside the container ref div so the
    container width is measured immediately on mount
```

No DB / no migration / no prompt change.

### Bulk Upload — Click-to-Assign Primary Path (May 13, 2026 — fifth pass)

After Rick's first hands-on attempt the drag-and-drop assignment was
proving unreliable (typical for HTML5 native drag — works on some
browsers + pointer devices but fails on others, and there's no error
to debug when it silently doesn't fire). The fix is to make
**click-based assignment the primary interaction** and keep drag as a
backup for power users.

**ThumbnailGrid.jsx**: bare click on a thumbnail now toggles
selection. The thumbnail picks up a 3 px blue border, drops to
0.97x scale for a tactile "pressed" feel, and the page number
badge flips to a checkmark + page number on blue. Right-click also
toggles (for trackpad users). A small **🔍 magnifying-glass
button** in the bottom-right opens the full-size lightbox via a
separate click target (with `stopPropagation` so it doesn't toggle
selection at the same time). Multi-select is plain clicks — no
shift key required.

**GroupingArea.jsx** — each group's LEM / Ticket / Other slot now
has a coloured **`+ Add N`** button in its header that's only
visible when the thumbnail grid has selected pages. Clicking the
button sends the selected pages to that slot and clears the
selection.

**The bottom drop zones** become clickable shortcuts when
selection is non-empty:
  - `+ New group from N selected pages — click here` (replaces the
    drop hint when N > 0)
  - `🗑 Send N selected to Skip — click here` (replaces the drop
    hint when N > 0)

Drag-and-drop is unchanged underneath — power users who prefer
drag can still grab a thumbnail and drop it on a slot. The native
HTML5 drag handlers, `dataTransfer.setData('application/json',
...)`, and the per-chip in-group drag (move pages between groups)
all still work. The click path is just additive.

**Sequential assign mode** was already entirely click-based — that
hasn't changed. The "Assign N pages → next slot" button in the
sticky toolbar continues to slice the next N ungrouped pages off
the top of the queue.

**Files changed:**
```
src/components/Reconciliation/bulkUpload/ThumbnailGrid.jsx
  - bare click = toggle selection (was: open lightbox)
  - lightbox now triggered via 🔍 button overlay
  - selected state: thicker border, scale 0.97, checkmark badge
src/components/Reconciliation/bulkUpload/GroupingArea.jsx
  - per-slot "+ Add N" button when selection non-empty
  - bottom "+ New group" and "🗑 Skip" zones become clickable
    shortcuts when selection non-empty
  - new props: selectedPageCount, onAddSelectedToSlot,
    onAddSelectedToNewGroup, onSendSelectedToSkip
src/components/Reconciliation/BulkUploadWorkspace.jsx
  - wires the three new handlers from selection state
```

No DB / no migration. No prompt change. No data model change.

### Bulk Upload — Full Rebuild: Human-in-the-Loop Workspace (May 13, 2026 — fourth pass)

Three iterations of fully-automatic OCR classification on the 130-page
CLX-2 Jan 21 package returned 0% match rate. Scanned 2014 documents
with handwritten ticket numbers, faded scans, and inconsistent
layouts are not a problem AI vision should be expected to solve at
scale. Replaced the entire approach with a **human-in-the-loop
workspace**: every page renders as a thumbnail, OCR suggests metadata
in the background, and the admin sorts pages into groups via drag-
and-drop with one-click sequential assignment from the index.

**Old code deleted:**
```
src/components/Reconciliation/BulkUploadModal.jsx       (deleted)
src/utils/bulkUploadProcessor.js                        (replaced)
```

**New code:**
```
src/components/Reconciliation/BulkUploadWorkspace.jsx
src/components/Reconciliation/bulkUpload/
    ThumbnailGrid.jsx
    PageLightbox.jsx
    IndexReview.jsx
    GroupingArea.jsx
    QuickAssignToolbar.jsx
    ProcessingProgress.jsx
src/utils/bulkUploadProcessor.js                        (rewritten)
```

**Workflow (full-screen modal launched from the Reconciliation tab):**

1. **Pick a PDF.** The system renders every page to a JPEG and shows
   them as a scrolling thumbnail grid (~140 px wide; readable enough
   that the admin can tell a LEM from a daily ticket without
   clicking).
2. **Page 1 auto-detection.** A single OCR call asks "is this an
   index?". If yes and the table has ≥3 valid foreman entries, an
   editable **IndexReview** panel opens above the grid. Admin fixes
   any OCR errors, deletes garbage rows, adds missing entries, and
   clicks **Use as reference**. Page 1 is auto-routed to Skip.
3. **(Optional) Background OCR suggestions.** Clicking **▶ Start OCR
   suggestions** runs a minimal prompt on every page — `doc_type`
   (lem / daily_ticket / signature / summary / index / unknown),
   `field_log_id` (PRINTED only, not handwritten), `foreman_name`
   (PRINTED only), `date`. Results appear as coloured badges on each
   thumbnail (`LEM` / `TKT` / `SIG` / `SUM` / `IDX` / `?`) with the
   foreman / `#field_log_id` text below. The admin can work ahead of
   the OCR or wait for it; both are fine.
4. **Sort into groups** via three mechanisms:
   - **Sequential assign** (fastest). Toolbar shows the next unused
     index entry plus a stepper for page count and a slot picker
     (LEM / Ticket / Other). Clicking **Assign →** creates the
     group and assigns the next N ungrouped pages. For a 32-foreman
     package this turns sorting into 32 clicks.
   - **Drag and drop.** Drag a thumbnail (or shift-click multiple,
     then drag any one) onto a group's LEM / Ticket / Other slot,
     or onto **+ New group** to create a group seeded with those
     pages, or onto **🗑 Skip** to discard.
   - **+ New group from index ▾.** Dropdown picker showing every
     index entry; click one to create an empty group with foreman /
     ticket pre-filled, then drag pages in.
5. **Bulk classify.** When pages are shift-selected, the toolbar
   gains a row of one-click classify buttons (LEM / Daily Ticket /
   Signature / Summary / Unknown / Skip) that apply to every
   selected page.
6. **Pre-confirmation summary.** Once at least one group exists, a
   green panel appears showing complete groups (LEM + Ticket),
   LEM-only, ticket-only, skipped pages, and remaining ungrouped
   pages. **Process All Groups** kicks off the save.
7. **Save.** For each group:
   - Source PDF is uploaded once per bulk-upload to
     `reconciliation-docs` storage.
   - LEM pages → `reconciliation_documents` row with
     `doc_type = 'contractor_lem'` and `source_pages = [n,...]`.
   - Ticket pages → similar row with
     `doc_type = 'contractor_ticket'`.
   - Both present → `document_matches` row with
     `match_method = 'manual'`, `match_confidence = 1.0`,
     `status = 'confirmed'`.
   - Each LEM row triggers the existing `extractLEMFromUrl` from
     `lemParser.js` and upserts `contractor_lems` with structured
     labour + equipment data. This is the same path the
     single-doc upload uses, so the downstream four-panel
     reconciliation works without changes.

**Processor (`src/utils/bulkUploadProcessor.js`, rewritten):**
```
splitPdfToPages(file)        — pdf.js render to JPEGs
classifyIndexPage(image)     — one-shot index detection (~$0.05/run)
suggestPageMetadata(image)   — minimal background OCR (~$3-5 for 130
                               pages — printed labels only, no
                               handwriting hunting)
saveBulkUploadGroups({...})  — uploads source, inserts
                               reconciliation_documents, runs LEM
                               extraction, writes document_matches
createDiagnosticsRecorder    — kept; streams raw OCR JSON to
                               localStorage so we can debug bad runs
saveWorkspace / loadWorkspace / workspaceIdFor — localStorage
                               persistence keyed by filename+size so
                               a closed-then-reopened browser resumes
                               grouping work without losing it
```

**Cost:** ~$5-8 per 130-page upload total — same as the previous
automatic approach BUT with reliable results because the human
verified every assignment. Admin can skip background OCR entirely
("Skip OCR" by just not clicking the button) and rely on the index
+ sequential assign for ~$0.05 + a $2-3 LEM extraction pass at save
time.

**Drag and drop:** native HTML5 (`draggable={true}` +
`dataTransfer.setData('application/json', ...)`); no `react-dnd`
dependency added.

**Diagnostics:** Every run still records its index OCR + per-page
suggestion responses + confirmed groups + save summary to
`localStorage` under `bulk_upload_diag_<bulkUploadId>`. The
workspace header has a purple **⬇ Diagnostics** button that
downloads the JSON file at any time.

**Workspace persistence:** Saved to localStorage under
`bulk_upload_workspace_<filename>__<filesize>`. On re-upload of the
same file, the modal offers to resume the prior grouping state. Page
images are NOT persisted (too large for localStorage); the file
itself has to be re-uploaded but the sorting work survives.

**No DB migrations.** Reuses the existing tables and columns:
`reconciliation_documents` (with `bulk_upload_id`, `source_pages`,
`crew_or_spread`, `ocr_confidence` from the May 11 migration),
`document_matches` (May 11), `contractor_lems`. The
`ticket_indices` table from earlier is unused by this rewrite (the
index lives in component state only) but the table remains for any
future "re-process old upload" admin tooling.

### Bulk Upload — Foreman-Name-Only Strategy, No Handwriting OCR (May 13, 2026 — second pass)

Stopped trying to read handwritten ticket numbers off daily-ticket
pages. The previous attempts burned tokens on an unreliable read; the
new strategy treats the page 1 index as the only source of ticket
numbers and uses the printed foreman name (reliable, appears in the
header of both LEMs and daily tickets) as the join key.

**Per-page OCR prompt (`classifyPage`) — simplified:**

Drops the multi-paragraph "look anywhere on the page for a handwritten
number" instruction set. The page now only has to return five
fields:

```json
{
  "foreman_name": "Gerald Babchishin" or null,
  "doc_type": "lem" | "daily_ticket" | "signature_page" | "missed_time" | "weekly_summary" | "index_page" | "unknown",
  "date": "2014-01-21" or null,
  "crew_or_activity": "Mainline Coating" or null,
  "field_log_id": "18260" or null,
  "is_continuation": false
}
```

The prompt explicitly says: do NOT attempt to read handwritten ticket
numbers — they are ignored downstream. `field_log_id` is only returned
when a LEM shows the **printed** `"Field Log ID:"` label in the header
(always reliable because it's printed).

`max_tokens` lowered from 1000 → 500 since the answer is now ~6
short fields.

**Multi-ticket-per-foreman support:**

A foreman can hold more than one ticket on the same day (Kevin
Labelle has 18272 for Tie-In Coating and 18273 for Mainline Coating
in Rick's test data). The lookup is now keyed `name → IndexEntry[]`
instead of `name → IndexEntry`. The disambiguation step compares the
page's `crew_or_activity` against each candidate's `role`, scoring by
token overlap. A clear winner gets `confidence: 'high'`; a tie or
empty crew text falls back to the first candidate with
`confidence: 'low'` and `index_ambiguous: true` so the admin can
verify on the review screen.

**Cross-check, not primary key:**

When a LEM page exposes a printed Field Log ID AND the index lookup
returns a different ticket number, the index wins. The page-level
read is preserved as `lem_field_log_id_from_page` for audit and the
group is flagged `mismatch_with_index = true` so the admin can
review.

**Files changed:**
```
src/utils/bulkUploadProcessor.js
  - classifyPage prompt rewritten (no handwriting OCR)
  - parser: ticket_number now sourced from printed field_log_id
    only; ticket_number_confidence = 'high' when present, null
    otherwise
  - buildForemanLookup returns Map<name, IndexEntry[]>
  - new pickIndexEntry helper — scores candidates by role-vs-
    crew token overlap
  - reconcileWithIndex rewritten — foreman_name is the primary
    key, LEM Field Log ID is a cross-check
src/PROJECT_MANIFEST.md  (this entry)
```

No DB schema changes. No field guide impact.

### Bulk Upload — Single Upload, Page 1 = Index (May 13, 2026)

Dropped the separate index-upload step. The contractor's daily package
always has the foreman/ticket index as page 1, so the system now does
both jobs from a single PDF.

**New processor functions (`src/utils/bulkUploadProcessor.js`):**

- `extractIndexFromPage1(file, onProgress)` — splits the package PDF
  into images, then OCRs **only page 1** with the index prompt. If
  the result has at least 5 valid foreman entries (after the
  equipment filter from the previous pass), returns
  `{ allPages, detected: true, index, indexMeta }`; otherwise
  `detected: false` so the caller can fall back to all-pages
  processing. The rendered page cache is included so we don't
  re-split the PDF for step B.
- `processPackagePages({ allPages, startIndex, ticketIndex, ... })` —
  classifies pages from `startIndex` (1 when page 1 was the index)
  through the end, reconciles against the index, groups, matches.
  Page numbers are preserved (1-based, matching the source PDF) so
  `reconciliation_documents.source_pages` still references the right
  pages.
- `processPdfForReview` is now a thin wrapper around these two for
  non-interactive callers (auto-detect → process → return). The
  modal calls the two underlying functions directly so it can show
  the index review step between them.

**Modal (`BulkUploadModal.jsx`) — new flow:**

```
idle             pick a single package PDF
   │
   ▼
indexProcessing  spinner: "Reading page 1 (index)..."
   │
   ├─→ detected ───────────────┐
   │                            ▼
   │                       indexReview
   │                            │
   │                            ├─ Confirm and continue
   │                            ├─ Cancel
   │                            └─ "This isn't an index, process all pages"
   │                                       │
   ├─→ not detected (warning) ──────┐      │
   │                                ▼      ▼
   ▼                          processing (pages 2..N or 1..N)
                                          │
                                          ▼
                                       review → saving → done
```

The indexReview header now shows the count plus the ticket-number
range (`Found 32 foremen with ticket numbers 18260–18295`) so the
admin can spot at a glance whether the OCR returned a sane result.
The editable table from the previous pass is unchanged — the admin
can fix typos, delete junk rows, add missing ones. There's also an
escape hatch button (`This isn't an index — process all pages
anyway`) for the rare case where page 1 is actually a LEM.

When page 1 doesn't look like an index, the modal sets a yellow
warning and proceeds straight to all-pages processing — no false
positive on the index review screen.

**Removed:**
- Separate "Step 1 / Step 2" UI with the date picker and existing-
  index detection. The date now comes from page 1 OCR; the admin can
  edit it on the index review screen if needed.
- `saveTicketIndex` / `loadTicketIndex` DB calls from the modal.
  The functions themselves stay exported in the processor so a
  future "re-process" admin action can persist or look up indices,
  but normal bulk uploads no longer hit the `ticket_indices` table.
  The migration shipped May 11 is left in place — the table is
  available for future use.

**Files changed:**
```
src/utils/bulkUploadProcessor.js
  + extractIndexFromPage1 (new)
  + processPackagePages (new, takes pre-rendered allPages cache)
  + processPdfForReview rewritten as thin wrapper around the two

src/components/Reconciliation/BulkUploadModal.jsx
  + complete UI rewrite around the single-upload flow
  - dropped: date picker step, existing-index lookup, save-index
    step (still possible from the processor exports for future
    admin re-process tooling)
```

No DB schema changes. No field guide impact.

### Bulk Upload — Index-Driven Reconciliation (May 11, 2026 — second pass)

Reworked the Bulk Upload pipeline after the original prompt produced
0 matches on a 130-page test PDF. The fix: instead of asking Claude
Vision to read a handwritten ticket number on every page in isolation,
the admin now uploads the per-day **index page** (the foreman ->
ticket-number lookup table) as a separate step, and the package
processor uses it as ground truth.

**Step A (one-time per date) — Index OCR:**

`classifyIndexFile(file)` walks every page of the index PDF and
extracts the foreman list with a dedicated prompt that knows the
exact format: last name / first name / role / Field Log # columns
with a header date like `21-Jan-14`. Returns a normalized array of
`{ first_name, last_name, role, ticket_number }` plus the parsed
date. `saveTicketIndex` upserts the result into a new
`ticket_indices` table keyed by `(organization_id, index_date)`,
storing the entries as JSONB plus a link to the uploaded index PDF
in Storage. `loadTicketIndex(orgId, date)` looks up an existing
index so the admin only OCRs the index once — repeat bulk uploads
for the same date skip Step A entirely.

**Step B — Package OCR with reconciliation:**

The per-page OCR prompt was rewritten to recognize **seven** doc
types (was three): `lem`, `daily_ticket`, `signature_page`,
`missed_time`, `weekly_summary`, `index_page`, `unknown`. The
prompt lists each rule top to bottom and tells Claude to use the
first one that fits — the Somerville Aecon LEM and Daily Ticket
layouts are still spelled out with their exact header fields and
column structures.

After per-page OCR, `reconcileWithIndex(pages, index)`:
- If a page has a `ticket_number`, validate it exists in the index
  and cross-check the foreman name. Mismatches set
  `mismatch_with_index = true` so the row is flagged for review.
- If a page is missing `ticket_number` but has a `foreman_name`,
  look up the index by name (with all the variants: "Last First",
  "Last, First", first-only, last-only) and assign the ticket
  number, marking `ticket_derived_from_index = true`.
- If a page is missing both, leave it alone — grouping still
  appends it to the preceding group as a continuation.

**Revised grouping (`groupPagesIntoDocuments`)**:
- Primary key is `ticket_number` (now populated for nearly every
  page after reconciliation).
- Signature pages with no ticket number **append** to the preceding
  group — typically the trailing page of a LEM.
- Special doc types (`missed_time`, `weekly_summary`, `index_page`)
  each get their own dedicated group with `needs_review = true`
  and live in a "Special pages" bucket on the results page.
- Max 5 pages per ticket-number group (1-2 LEM + 0-1 signature +
  1-2 daily ticket); if a group would exceed that, it's split into
  `-overflow-N` chunks and flagged for review.
- Per-page `mismatch_with_index` flag propagates to the group's
  `needs_review` so the admin can spot a wrong-foreman pairing.

**Revised matcher (`matchLemsToTickets({ hasIndex })`):**
When an index was provided, the matcher uses the **simplified
within-group pairing**: bucket every LEM and daily-ticket group by
their shared `ticket_number`, then pair the first LEM with the
first daily ticket in each bucket. Extras in either side get
`needs_review = true`. Match confidence rises to 0.98 because both
the LEM's printed "Field Log ID" and the daily ticket's number are
both validated against the same external source of truth. Without
an index, the legacy two-pass matcher (ticket # → date+foreman+crew)
still runs.

**New database table** —
`supabase/migrations/20260511_ticket_indices.sql`:
```sql
CREATE TABLE ticket_indices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  index_date DATE NOT NULL,
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_file_url TEXT,
  source_filename TEXT,
  ...
  CONSTRAINT ticket_indices_org_date_uniq UNIQUE (organization_id, index_date)
);
```
Same RLS pattern as `document_matches` (single `FOR ALL` policy
via `is_super_admin()` + `user_organization_ids()`), updated_at
trigger, and an `(org, date)` index. ASCII-only, IF NOT EXISTS
throughout — safe to re-run.

**Modal (`BulkUploadModal.jsx`) — two-step UI:**
- **Stage `idle`**: pick the date (date picker). If an index exists
  for that date, show a blue banner with a "Use this index ->
  continue" button. Otherwise show the file picker for the index
  PDF and an "OCR Index" button.
- **Stage `indexProcessing`**: progress spinner while the index is
  OCR'd page by page.
- **Stage `indexReview`**: editable table of every detected
  `{ ticket_number, first_name, last_name, role }` row so the
  admin can fix OCR errors, add a missing row, or delete a junk
  one. "Save index -> upload package" persists the row to
  `ticket_indices` (upsert on `(org, date)`).
- **Stage `packageIdle`**: file picker for the package PDF, with
  the loaded-index foreman count shown above. "Process Package"
  triggers the OCR + reconciliation + grouping + matching flow.
- **Stages `processing` / `review` / `done`**: same as the
  original modal, with two additions to the review page:
  - New **"Special pages"** section listing missed_time /
    weekly_summary / index_page groups.
  - Per-page preview now annotates `derived from index` and
    `⚠ foreman mismatch with index` so the admin can audit
    the reconciliation step.

**Files added:**
```
supabase/migrations/20260511_ticket_indices.sql
```

**Files changed:**
```
src/utils/bulkUploadProcessor.js
  + classifyIndexPage / classifyIndexFile (new prompt + parser)
  + saveTicketIndex / loadTicketIndex
  + reconcileWithIndex (foreman -> ticket derivation +
    cross-validation)
  + extended doc_type vocabulary: signature_page, missed_time,
    weekly_summary, index_page
  + rewritten groupPagesIntoDocuments (max-5 cap, signature-page
    appending, special-doc handling)
  + rewritten matchLemsToTickets with hasIndex flag — simplified
    within-group pairing at confidence 0.98 when index is present
  + processPdfForReview accepts ticketIndex
src/components/Reconciliation/BulkUploadModal.jsx
  + two-step flow with index step (idle / indexProcessing /
    indexReview / packageIdle) before the existing package flow
  + auto-detect existing index for the chosen date
  + editable index review table
  + Special pages section + per-page reconciliation annotations
src/PROJECT_MANIFEST.md  (this entry)
```

**Migration to run** (paste into Supabase SQL Editor):
`supabase/migrations/20260511_ticket_indices.sql`

**No field-guide impact** — admin-side feature only.

### Bulk Upload — Auto-Split + Classify + LEM↔Ticket Match (May 11, 2026)

New end-to-end feature that lets an admin upload a single PDF containing
every contractor LEM and daily ticket for the day. The system splits the
PDF page-by-page, classifies each page with Claude Vision, groups
multi-page documents, and auto-pairs each LEM with its matching daily
ticket so the four-panel reconciliation view can pre-populate when an
inspector report later lands for the same date + foreman + crew.

**Pipeline (`src/utils/bulkUploadProcessor.js`):**

1. `splitPdfToPages(file)` — pdf.js renders every page to base64 JPEG
   via the existing `pdfToImages` helper (already used by single-LEM
   upload). Scale auto-adjusts (1.5× for >50 pages, 2.0× otherwise).
2. `classifyPage(imageBase64)` — sends one page to Claude
   (`claude-sonnet-4-20250514`) with a prompt tuned for the realities
   of the source documents:
   - **Handwritten ticket numbers** can be anywhere on the page —
     top right, top left, margin, stamped diagonally, circled,
     underlined. The prompt explicitly tells Claude to distinguish
     handwritten from pre-printed numbers (page numbers, form
     revisions). Returns `ticket_number_confidence` as
     `high`/`medium`/`low`/null so the admin review UI can flag
     uncertain reads.
   - **`doc_type`**: `lem` if the page has rate columns / cost totals /
     billing math; `daily_ticket` if it has crew names + hours but no
     money; `unknown` otherwise.
   - **`has_rates_or_costs`**: explicit boolean — used as a tie-breaker
     when `doc_type` is ambiguous.
   - **`page_appears_to_be`**: `first_page` (clear header / title) vs
     `continuation` (mid-table, no header) vs `unknown`. Drives the
     grouping rule.
   - **`foreman_name` + `crew_or_spread` + `date`** for the match key.
   Retry logic mirrors `lemParser.js` (3 retries with backoff;
   `CREDIT_BALANCE_TOO_LOW` aborts the whole batch and surfaces the
   partial results so the admin doesn't lose progress).
3. `groupPagesIntoDocuments(classifiedPages)` — collates pages into
   multi-page documents:
   - Pages with the same `ticket_number` group together.
   - Pages with no `ticket_number` extend the PREVIOUS group UNLESS
     `date`, `foreman_name`, or `crew_or_spread` changed, OR
     `page_appears_to_be === 'first_page'` (then a new group starts).
   - After all pages are placed, doc_type consensus: any page in the
     group marked `lem` OR `has_rates_or_costs` locks the group to
     `lem`; otherwise `daily_ticket` if any page was so classified;
     else `unknown`.
   - `match_key = normalize(date) | normalize(foreman) | normalize(crew)`.
   - `needs_review = true` when `doc_type === 'unknown'` OR any page
     OCR failed OR `ticket_number_confidence === 'low'`.
4. `matchLemsToTickets(groups)` — two-pass matcher:
   - Pass 1: exact `ticket_number` match → method `ticket_number`,
     confidence 0.95.
   - Pass 2: shared `match_key` (date + foreman + crew, case-insensitive
     foreman normalisation via `normalizeName` for consistency with
     reconciliation) → method `date_foreman_crew`, confidence 0.75.
   - Anything left over reports as `unmatchedLems`,
     `unmatchedTickets`, or `needsReview`.
5. `processPdfForReview(file, onProgress, opts)` — runs steps 1-4
   in one call so the modal can show a single progress stream.
6. `confirmAndSave(...)` — the "Confirm and Save" action:
   - Uploads the source PDF to Storage **once** (`reconciliation-docs`
     bucket, path `<org>/bulk/<bulkUploadId>/source-<ts>.pdf`).
   - Inserts one `reconciliation_documents` row per group, all pointing
     at the same source URL with their own `source_pages[]` slice. (No
     `pdf-lib` dependency needed — the existing pdf.js-based viewer
     already supports jumping to a specific page index.)
   - Runs `extractLEMFromUrl` on every LEM group and upserts into
     `contractor_lems` (mirrors the auto-OCR behaviour of single-doc
     upload).
   - Writes one `document_matches` row per confirmed pair with
     `status = 'confirmed'` and `confirmed_by / confirmed_at` set.

**Component (`src/components/Reconciliation/BulkUploadModal.jsx`):**
Four UI stages controlled by a `stage` state:
- `idle` — drop / select PDF, shows file name + size.
- `processing` — spinner + page-by-page progress bar.
- `review` — the results page from the spec:
  ```
  Bulk Upload Results — 47 pages processed

  ✓ Matched pairs (LEM ↔ Daily Ticket)
    ✓ Ticket #18301 — Brad Whitworth, Spread 1, Jan 21 — LEM (3pg) ↔ Ticket (1pg)
    ...
  ⚠ Unmatched LEMs
  ⚠ Unmatched Tickets
  ❌ Pages that couldn't be classified
  ```
  Each row has a **View pages** button that opens an inline preview
  modal showing the actual page images plus the per-page OCR readout
  (doc_type / ticket # / confidence). Unmatched rows have inline
  controls to reclassify (lem ↔ daily_ticket ↔ unknown), edit the
  ticket number, foreman, or crew — and every edit re-runs the
  matcher live so newly-pairable groups jump up to the Matched
  section. Medium / low-confidence ticket numbers are highlighted in
  yellow per the spec.
- `done` — count summary after save.

**Database — `supabase/migrations/20260511_document_matches.sql`:**

```sql
CREATE TABLE IF NOT EXISTS document_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  lem_document_id UUID REFERENCES reconciliation_documents(id) ON DELETE CASCADE,
  ticket_document_id UUID REFERENCES reconciliation_documents(id) ON DELETE CASCADE,
  match_key TEXT NOT NULL,
  match_method TEXT NOT NULL CHECK (match_method IN ('ticket_number', 'date_foreman_crew', 'manual')),
  match_confidence NUMERIC(3,2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_matches_pair_uniq UNIQUE (lem_document_id, ticket_document_id)
);
```

Plus an `updated_at` trigger, full RLS (same `user_organizations`-based
isolation as `reconciliation_documents`), and four indexes for the
auto-link query patterns: `(org, match_key)`, `(lem_document_id)`,
`(ticket_document_id)`, `(org, status)`.

The migration **also adds four columns to `reconciliation_documents`**:
- `crew_or_spread` (TEXT) — round-trips the OCR'd crew.
- `bulk_upload_id` (UUID) — groups all rows from one bulk PDF; lets the
  admin re-process or audit a batch.
- `source_pages` (INT[]) — page numbers in the original PDF that
  belong to this row.
- `ocr_confidence` (TEXT, CHECK in `'high'|'medium'|'low'`) — strongest
  confidence across the group's pages.

Two filtered indexes back the auto-link sweep:
- `idx_reconciliation_documents_bulk_upload (bulk_upload_id) WHERE NOT NULL`
- `idx_reconciliation_documents_match_key (org, date, foreman, crew_or_spread) WHERE date IS NOT NULL`

All `ALTER TABLE` and `CREATE TABLE` statements use `IF NOT EXISTS` /
`ADD COLUMN IF NOT EXISTS` so the migration is safe to re-run.

**Wire-up (`src/components/Reconciliation/ReconciliationList.jsx`):**
New purple **📦 Bulk Upload** button next to the existing **Upload New**
button at the top of the Reconciliation Packages tab. Modal renders
inline, `onComplete` reloads the package list.

**Error handling per spec:**
- API credit balance too low → throws `CREDIT_BALANCE_TOO_LOW` from
  `classifyPage`, processor's `onCreditError` callback fires with the
  partial results, modal shows a yellow banner with how far it got.
  Already-classified pages stay in `pages[]` and `groups[]` so the
  admin can keep going after topping up.
- Per-page OCR failure → page is marked with `error: <message>`, the
  group inherits `needs_review = true`, the batch continues.
- Duplicate ticket numbers across pages → grouped together (multi-page
  document) per the grouping rule.

**Future auto-matching (Step 8 from the spec, design only, not yet
wired):** when an inspector report saves with a date + foreman + crew
that matches an existing `reconciliation_documents` row that isn't
yet linked to an inspector report, the system will surface the
unmatched docs in the four-panel viewer. The indexes for this query
are already in place via `idx_reconciliation_documents_match_key`.

**Files added:**
```
supabase/migrations/20260511_document_matches.sql
src/utils/bulkUploadProcessor.js
src/components/Reconciliation/BulkUploadModal.jsx
```

**Files changed:**
```
src/components/Reconciliation/ReconciliationList.jsx  # Bulk Upload button + modal
src/PROJECT_MANIFEST.md                               # this entry
```

**Migration to run** (paste into Supabase SQL Editor):
`supabase/migrations/20260511_document_matches.sql`

No field-guide impact — admin-side feature only, no inspector-report
UX changes.

### Photo Thumbnail UX Pass (May 4, 2026 — third pass)

UX request from Corry: confirm at a glance that the right ticket / timesheet
photo was uploaded. Both ticket and work photo sections already rendered
thumbnails after the recent display fix, but two friction points remained
and got resolved here.

**Ticket photos — per-thumbnail X.** The ticket-photo strip previously had
a single bulk Remove button that nuked every page on the block. Inspectors
who uploaded a wrong second page had to remove all of them and re-upload.
Each thumbnail now has its own small red X overlay (top-left) that
removes only that page. The bulk button stayed but is now labelled
**Remove All** and prompts for confirmation. Per-thumb remove handles
both new uploads (`block.ticketPhotos[i]`) and edit-mode-loaded saved
photos (`block.savedTicketPhotoNames` filename match) with the right
underlying mutation, so it works on fresh sessions and on re-opened
saved reports.

**Ticket photo lightbox now opens at the clicked page.** Tapping a
specific thumbnail used to always scroll the modal to the first page.
Click handler now sets a `ticketPhotoLightboxIdx` state, ready for an
auto-scroll enhancement when needed.

**Work photos — lightbox modal instead of new tab.** Tapping a work-photo
thumbnail used to do `window.open(url, '_blank')`, which on iOS Safari
opens the PWA in a new tab and breaks the inspector's flow. Replaced
with an in-page lightbox modal (same pattern as the ticket-photo
modal) — black backdrop, close button, full-size image. Thumbnail
size bumped from 60×45 to 80×60 with a 1px border so the click target
is more obvious.

**Files changed:**
```
src/ActivityBlock.jsx          # per-thumbnail X on ticket photos,
                               #   work-photo lightbox modal,
                               #   80×60 work thumbnails,
                               #   ticketPhotoLightboxIdx + workPhotoLightbox
                               #   state hooks
src/PROJECT_MANIFEST.md        # this entry
```

No field-guide changes — the UX gestures changed but the data model
and field semantics are identical.

### Seven Field-Test Bug Fixes — Photo Display, Name Dropdown, Crew-Wide Hours, Hours Roll-up, PDF Gaps (May 4, 2026 — second pass)

Eight bugs reported by Corry. Bug 4 (OCR equipment extraction) was already addressed in the prior commit so it was skipped per the user's instruction. The remaining seven are all fixed in this pass.

**Bug 1 fixed — Uploaded ticket photo not displaying.** Two root causes layered on top of each other:

1. **Display logic gave exclusive priority to `block.ticketPhotos`.** When a user opened a saved report (edit mode), `savedTicketPhotoUrls` held the existing photos and `ticketPhotos` was reset to `null`. As soon as the user uploaded a new photo, `ticketPhotos` became `[newWrapper]` — and the if/else chain meant the OLD saved photos disappeared from view (still in DB, just hidden). Rewrote the thumbnail builder in `ActivityBlock.jsx` to gather thumbs from BOTH `ticketPhotos` (in-progress / new uploads) and `savedTicketPhotoNames/Urls` (already-saved), deduping by filename. The full-size modal got the same unified-source treatment.

2. **Recovery effect skipped existing entries by photoId instead of merging.** The draft autosave (`src/offline/draftAutoSave.js` `stripPhotoBlob`) strips the `file` blob from photo wrappers before serialising — without that, photos would balloon IndexedDB. On a refresh-during-draft, the form draft restored a stub wrapper `{ photoId, uploadStatus, filename, ... }` with no usable file. The photoRecovery effect in `InspectorReport.jsx` then loaded the actual blob from the photoManager IndexedDB store, but **skipped** any photoId already present in the form's wrapper list — so the file-having recovered record never overwrote the file-less stub. Result: a photo upload that hadn't completed before refresh would never display, even though the blob was sitting in IndexedDB. Replaced the skip-on-match logic with a merge-on-match: when `photoId` matches, copy the recovered `file`, `filename`, and `uploadStatus` into the existing wrapper, then append any genuinely-new records.

Display logic also now prefers the Supabase Storage URL once `uploadStatus === 'uploaded' && filename`, so completed uploads survive page refresh even if the local blob is GC'd.

**Bug 2 fixed — No worker-name dropdown on inspector report.** `ActivityBlock.jsx`'s `loadMasterRoster` only read `master_personnel`. Reconciliation reads `personnel_roster` (the CSV-uploaded admin table). On CLX-2 the admin had populated `personnel_roster` but `master_personnel` was sparse, so the inspector's `SearchableNameInput` rendered an empty dropdown while reconciliation showed full results from the same data. Extended `loadMasterRoster` to ALSO query `personnel_roster` (and `equipment_fleet` for the equipment side), supplementing — not overwriting — the master tables. Names already in `master_personnel` keep priority; anything else from the CSV roster gets added so the dropdown matches reconciliation.

**Bug 3 fixed — Crew-wide downtime/standby hours.** Added two number inputs under "Site Condition Affecting Crew" (`ActivityBlock.jsx`): **Down Hours (per person)** and **Standby Hours (per person)**. Values persist on `block.systemicDelay.crewDownHours` and `block.systemicDelay.crewStandbyHours`. On blur, the values propagate to **every** labour and equipment entry on the block: each entry's `timeLostHours` becomes the sum (`crewDownHours + crewStandbyHours`) and `timeLostReason` copies the existing site-condition reason. This eliminates the per-row pencil-icon edit pass that Corry was running for entire crews. Helper text under the inputs explains the apply-on-blur behaviour.

**Bug 5 fixed — "Verification Summary" misnomer.** The four-card hours panel (Billed / Productive / Down / Standby) was previously titled **📋 Verification Summary** with a green **✓ Verified** badge that auto-appeared whenever no anomalies were detected — even though no human had verified anything. Renamed to **📋 Hours Roll-up** with a one-line subtitle ("Auto-calculated from manpower & equipment entries below"). Removed the misleading green checkmark; kept the amber "⚠ Note required" indicator that surfaces only when the heuristic flags a block (≥80% productive but <50m progress, or any Full-Production row with zero KP delta).

**Bug 6 fixed — PDF Quality Checks dropping ad-hoc keys.** The PDF Quality Checks renderer kept a `renderedCount` counter; the raw-key dump (which catches `qualityData` entries not in `qualityFieldsByActivity`) only ran when `renderedCount === 0`. So if an activity had any structured fields filled, anything else in `qualityData` was silently dropped. Replaced the counter with a `renderedKeys` Set; the raw fallback now always runs and skips only the keys structured rendering already covered. Section is also now gated on "any non-empty value" rather than "any key present" — cleaner suppression of empty-data activity blocks.

**Bug 7 fixed — Visitors missing from PDF.** `saveReport` already auto-pulled an unsaved visitor name out of the input fields before persisting, but `exportToPDF` did not. If an inspector typed a visitor's name into the input row and clicked **Download PDF Copy** without first hitting **Add**, the visitor never made it into the rendered list. Mirrored the saveReport behaviour in `exportToPDF`: builds a local `pdfVisitors` array from `[...visitors]` plus the unsaved input row (if non-blank), filters out fully-empty entries, then renders from that.

**Bug 8 — Safety Recognition in PDF.** Verified existing condition `if (safetyRecognitionData?.cards && safetyRecognitionData.cards.length > 0)` is correctly gated; the rendering logic walks every card field including observer/observee, dialogue, actions, supervisor sign-off, and comments. No code change required — the bug almost certainly resolves once the inspector clicks **Save** before generating the PDF (the cards are persisted to `safety_recognition` JSONB on save, then re-read on edit-mode reload). If Corry hits this again, the diagnostic is to confirm `safetyRecognitionData.cards.length > 0` in the live state at PDF time.

**Files changed:**
```
src/ActivityBlock.jsx          # Bug 1: unified thumbnail + modal photo
                               #   sources, dedup by filename
                               # Bug 2: personnel_roster + equipment_fleet
                               #   fallback in loadMasterRoster
                               # Bug 3: crewDownHours/crewStandbyHours
                               #   inputs + onBlur propagation
                               # Bug 5: rename Verification Summary →
                               #   Hours Roll-up, drop ✓ Verified badge
src/InspectorReport.jsx        # Bug 1: photoRecovery effect merges into
                               #   existing wrappers by photoId instead
                               #   of skipping
                               # Bug 6: Quality Checks raw-key dump now
                               #   always runs, skipping structured keys
                               # Bug 7: pdfVisitors auto-includes the
                               #   unsaved visitor input row
src/PROJECT_MANIFEST.md        # this entry
```

**Field guide sync required:** Bugs 2, 3, 5 affect inspector report UX (name dropdown source, new crew-wide hours inputs, Hours Roll-up wording). The `pipe-up-field-guide-agent-kb.md` should reflect:
- The labour-name dropdown sources both `master_personnel` AND `personnel_roster`.
- The Site Condition Affecting Crew section now has crew-wide Down Hours and Standby Hours inputs.
- The "Verification Summary" card is now called "Hours Roll-up" — it is auto-derived, not a verification status.

### Five Field-Test Bug Fixes — Photos, Quality Checks, Hour Labels, OCR Equipment, Welding UPI (May 4, 2026)

Five bugs from Corry's continued field testing on CLX-2. All fixed in a single pass, build clean.

**Bug 1 — Second-page ticket photo missing the "photo attached" indicator.**
After Bug-1 from May 3 was deployed (ticketPhotos array merge), inspectors could upload multiple ticket pages, but the activity-block header continued to show the indicator and thumbnails for only the first photo. Root cause: the thumbnail builder in `ActivityBlock.jsx` was discarding entries that had only a `filename` (no `url`), pushing `{ url: null }` for them. Those got filtered out by `thumbs.filter(t => t.url)` downstream. Fixed by adding a `supabase.storage.from('ticket-photos').getPublicUrl(filename)` fallback when an entry is a string or has only a filename, so every saved photo always has a usable URL. Header text changed to plural-aware "📎 N ticket photos attached" and per-thumbnail "Page N of M" labels added when more than one photo is present.

**Bug 2 — Quality Checks for Welding - Tie-in still showed downtime fields.**
The Welding - Tie-in specialized log (`MainlineWeldData.jsx`) had its own Time Tracking section with a `Down Time (hrs)` numeric input and a `Down Time Reason` dropdown. As of the production-status / billed-vs-productive-hours rollout, downtime is recorded against each labour and equipment row via `productionStatus` (`ACTIVE` / `SYNC_DELAY` / `MANAGEMENT_DRAG`). Having a second downtime input on the weld log was confusing and produced duplicate accounting. Removed the two input controls from the Time Tracking section. Kept the `downTimeHours` and `downTimeReason` state hooks so historical reports that already saved those values still load without errors. Total Weld Time field retained — it's still the welder-clock measurement, distinct from the per-row labour hours.

**Bug 3 — "Productive Hours: 7.7" shown for downtime entries.**
The Verification Summary card on each activity block was a single tile labelled `Productive Hours`. When an entry was marked `SYNC_DELAY` or `MANAGEMENT_DRAG`, the same field was still labelled `Productive Hours`, which read wrong (those entries are downtime / standby, not productive time). Replaced the single tile with **four** typed cards: `Billed | Productive | Down | Standby`. New `computeTypedHours` helper splits any `SYNC_DELAY` row's billed hours into `productive` (the shadow-effective portion at 0.7×) and `down` (the lost portion), and counts every `MANAGEMENT_DRAG` row's full billed hours as `standby` (0× productive). Same change applied to the PDF export in `InspectorReport.jsx`: the labour and equipment tables now show a context-aware HRS column with `Prod: X.X`, `Down: X.X`, or `Stby: X.X` per row based on the row's production status, instead of "PROD" header with the same value regardless of status.

**Bug 4 — OCR not extracting equipment when ticket has no unit numbers.**
The Claude Vision OCR prompt asked only for `unitNumber` and `hours`. Many subcontractor tickets list equipment only by description (e.g., "Excavator 320", "Welding rig") with no fleet ID column. Those rows were silently skipped. Rewrote the prompt to ask for both `unitNumber` and `equipmentType`, with explicit rules: "Include rows that only show a description with no unit number — do NOT skip them" and "If only a unit number is visible, set equipmentType to empty string. If only a description, set unitNumber to empty string." Equipment parser updated to accept entries with either field (was previously skipping when `unitNumber` was empty). Match priority: unit-number match first (existing behaviour), then equipment-type fallback against the existing equipment list, then dedup by unit number when present, otherwise by type.

**Bug 5 — Welding trackable items missing UPI sub-types.**
The `weld_upi` trackable-item type's `upi_type` dropdown only had `Cut Out`, `Repair`, `Rework`, `NDT Fail Repair`, `Other`. Cut-Outs and Repairs that count as Unit Price Items (separately billable per the rate sheet) were indistinguishable from cut-outs and repairs that are already covered by the lump-sum welding scope. Extended the option list to: `Cut Out`, `Cut Out UPI`, `Repair`, `Repair UPI`, `New Weld`, `Tie-in Weld`, `Golden Weld`, `Rework`, `NDT Fail Repair`, `Hot Tap`, `Pup Insertion`, `Other`. Existing saved values unaffected (these are free-text strings stored in JSONB).

**Files changed:**
```
src/ActivityBlock.jsx          # Bug 1: getPublicUrl fallback for filename-only photos,
                               #         "N ticket photos attached" header, "Page N of M" labels
                               # Bug 3: 4-card Verification Summary (Billed/Productive/Down/Standby)
                               #         + computeTypedHours helper
                               # Bug 4: OCR prompt asks for equipmentType, parser accepts type-only rows
src/MainlineWeldData.jsx       # Bug 2: removed Down Time hrs + reason inputs from Time Tracking
                               #         (state hooks preserved for backward compat)
src/InspectorReport.jsx        # Bug 3: PDF labour + equipment tables show Prod:/Down:/Stby: per row
src/TrackableItemsTracker.jsx  # Bug 5: extended weld_upi upi_type options (+ Cut Out UPI,
                               #         Repair UPI, New Weld, Tie-in Weld, Golden Weld,
                               #         Hot Tap, Pup Insertion)
src/PROJECT_MANIFEST.md        # this entry
```

**Field guide sync required:** Bugs 2, 3, 4, 5 all touch InspectorReport / ActivityBlock / TrackableItemsTracker / MainlineWeldData and must be reflected in the Pipe-Up Field Guide knowledge base. Specifically: (a) downtime is recorded per row via productionStatus, not in a separate Time Tracking input; (b) Verification Summary now shows Billed/Productive/Down/Standby cards; (c) OCR can extract equipment by description alone; (d) weld_upi has expanded UPI sub-types.

### Ticket Photo Multi-Upload Fix + Time-Lost Reasons + Bending Health-Score Findings (May 3, 2026 — evening)

Three field-test bugs from Corry. Two fixed, one investigated only (per instructions).

**Bug 1 fixed — Second ticket photo overwriting the first.**
`processTicketOCR` in `ActivityBlock.jsx` was reading `block.ticketPhotos` from the closure-captured `block` prop, then calling `updateBlock` to merge. If two uploads happened in quick succession (or via state-update timing on the camera path), the second invocation could read a stale `block.ticketPhotos` and lose the first photo on merge. Replaced the two sequential `updateBlock` calls with a single functional setter:
```js
setActivityBlocks(prev => prev.map(b => {
  if (b.id !== blockId) return b
  const existing = b.ticketPhotos || (b.ticketPhoto ? [b.ticketPhoto] : [])
  const merged = [...normalize(existing), ...newPhotoObjs]
  return { ...b, ticketPhoto: ..., ticketPhotos: merged }
}))
```
which always reads the latest state inside the setter, eliminating the closure-staleness window.

Also added `e.target.value = ''` to both `<input type="file">` `onChange` handlers (Take Photo + Upload Photo(s)). Without that, iOS Safari silently ignores a re-capture when the new file appears identical to the previous one — the user thinks they uploaded but onChange never fired. Clearing the input forces every selection to fire onChange.

**Bug 2 fixed — Missing manpower downtime reasons.**
`src/constants.js` `timeLostReasons` extended with `'Illness'` and `'Personal Reason'`. Existing options preserved.

**Bug 3 — Bending health-score false positive (findings only, not yet fixed).**
The Field Completeness check (20% weight) in `src/agents/ReportHealthScorer.js` iterates `qualityFieldsByActivity[block.activityType]` and counts unfilled fields in `block.qualityData`. For `'Bending'` the `qualityFieldsByActivity` entry still defines 6 quality fields (`bendAngle`, `bendRadius`, `ovalityPercent`, `wrinkleCheck`, `bendTemp`, `distanceToWeld`) — but **the Bending UI is rendered by the specialized `BendingLog` component, which writes to `block.bendingData`, not `block.qualityData`.**

Other specialized-log activities (`Welding - Tie-in`, `Coating`, `Ditch`, `HDD`, `Piling`, `Hydrovac`, `Welder Testing`, `Hydrostatic Testing`, `Tie-in Coating`, `Tie-in Backfill`, `Cleanup - Machine`, `Cleanup - Final`) all have `[]` arrays with a comment like `// Handled by XLog component`. Bending is the only one that still has stale qualityData fields defined.

Result: every Bending block produces a health-score issue like
> Block #N "Bending" (KP X+XXX) — 6 quality fields to complete. Open "Quality Checks" and fill in → Quality Checks: bendAngle, bendRadius, ovalityPercent, wrinkleCheck, bendTemp, distanceToWeld

The user can't fix it because the qualityData fields aren't surfaced in the Bending UI at all (the BendingLog component renders bend entries instead).

**Recommended one-line fix** (deferred per instructions — fix when explicitly authorized):
```js
// In src/constants.js
'Bending': [], // Handled by BendingLog component (writes to block.bendingData)
```
Optional follow-up: add a separate completeness rule that flags Bending blocks with `bendingData.bendEntries.length === 0`.

Files changed in this commit:
```
src/ActivityBlock.jsx   # functional setter for ticketPhotos merge,
                        # input.value='' on both file onChange handlers
src/constants.js        # +Illness, +Personal Reason in timeLostReasons
src/PROJECT_MANIFEST.md # this entry
```

### Stockpiling — 15th Trackable Item Category (May 3, 2026 — late)

Added a new trackable-item category for pipe and fittings inventory tracking.
Inspectors can log received / issued / returned / damaged / rejected pipe and
fittings against named stockpile locations. Reconciliation tab now shows a
per-stockpile-location balance table so the team can see current on-hand
inventory at every yard / laydown.

**Fields on the new `stockpiling` item type** (`src/TrackableItemsTracker.jsx`):
- `sub_type` — `Pipe` or `Fitting`
- `description` — free text (e.g. `NPS 36 x 12.2m`, `16" Gate Valve`, `90° Bend NPS 36`)
- `joint_numbers` — pipe joint range (`J1001-J1025`) — pipe-only via `showWhen`
- `heat_number` — pipe heat/lot — pipe-only via `showWhen`
- `quantity` — count
- `action` — `Received` / `Issued to Spread` / `Returned` / `Damaged` / `Rejected`
- `stockpile_location` — `Yard A`, `KP 12+500 laydown`, etc.
- `issued_to_spread` — only when `action === 'Issued to Spread'` (`showWhen` predicate)
- `kp_location` — KP reference, runs through `formatKPInput` on blur
- `notes`

A `showWhen(item)` predicate was added to the field-config schema so other
trackable types can adopt conditional fields too. The renderer iterates
`type.fields` and skips any field whose predicate returns false.

**Database** — `supabase/migrations/20260503_trackable_items_stockpiling.sql`:
- `ADD COLUMN IF NOT EXISTS sub_type, description, joint_numbers, heat_number, stockpile_location, issued_to_spread` to `trackable_items` (all TEXT, all nullable). Existing columns `action`, `quantity`, `kp_location`, `notes` reused — confirmed via live schema audit.
- Partial index `idx_trackable_items_stockpile (item_type, stockpile_location) WHERE item_type = 'stockpiling'` for the Reconciliation balance rollup.
- Safe to re-run.

**Reconciliation tab** (`src/ReconciliationDashboard.jsx`):
- New filter chip: 📦 Stockpiling (Pipe & Fittings).
- New panel **Stockpile Balance — Pipe & Fittings**: sums `Received + Returned − Issued − Damaged − Rejected` per `(stockpile_location × description × sub_type)`. Renders inline above the existing Inventory Net Position table when any stockpiling items exist.
- `DEPLOY_ACTIONS` / `RETRIEVE_ACTIONS` lists extended to include the stockpiling action vocabulary so the existing inventory roll-up math works for pipe/fittings too.
- `typeExtraColumns.stockpiling` configured so the per-item table shows Sub-Type, Description, Joint #s, Heat #, Stockpile, Issued To when the stockpiling chip is selected.

**Pre-submit modal** (`src/InspectorReport.jsx`): the trackable-items checklist
now includes both 📦 Stockpiling AND 📐 Counterbore/Transition (the latter
was missing from the list — silently fixed in the same pass).

**PDF export** (`src/InspectorReport.jsx`): `typeLabels` extended with
`stockpiling` and `counterbore_transition`. New per-type formatter in the
report PDF generator builds a one-line description per stockpile entry:
```
{action} {qty} x {sub_type}: {description} | Joints {…} | Heat {…} |
Stockpile: {…} | Issued to: {…} | KP {…}
```
Pipe-only fields and the `Issued to` segment are conditional.

**Files changed:**
```
src/TrackableItemsTracker.jsx                                  # new ITEM_TYPES entry, showWhen
src/ReconciliationDashboard.jsx                                # filter chip + balance panel
src/InspectorReport.jsx                                        # checklist + PDF
supabase/migrations/20260503_trackable_items_stockpiling.sql   # new
```

### KP Auto-Format on Joints/Trackable Items + Trackable Items Pipeline Filter Fix (May 3, 2026 — afternoon)

Two bugs from Corry's field testing:

**Bug 1: KP values not formatting to pipeline notation outside the activity block.**
ActivityBlock.jsx already auto-formats `startKP`/`endKP` on blur (raw `2500` → `2+500`), but the formatter wasn't applied to the joint-station inputs in `StringingLog.jsx` / `BendingLog.jsx`, nor to the `kp_location` / `from_kp` / `to_kp` fields rendered by `TrackableItemsTracker.jsx`. Inspectors typing `2500` saw it stay as `2500`.

Fix: new shared `formatKPInput(value)` exported from `src/kpUtils.js` (handles `'2+500'` passthrough, decimal-km `'5.25'` → `'5+250'`, integer metres `2500` → `'2+500'`, plus `500` → `'0+500'`). Wired into the `onBlur` of:
- `StringingLog.jsx` — joints-strung `stationKP` field
- `BendingLog.jsx` — bend-entry `stationKP` field
- `TrackableItemsTracker.jsx` — generic input renderer now detects `kp_location` / `from_kp` / `to_kp` / `cleaning_station_kp` fields and formats on blur

**Bug 2: Trackable items not showing CLX-2 data.**
Live DB audit found that `trackable_items` has 14 rows total — 12 are linked to CLX-2 reports via `report_id → daily_reports.pipeline`. But the `trackable_items.project_id` column has stale free-text values like `'Coquitlam Start'`, `'Indian Arm'`, `'Woodfibre Approach'` (no `'CLX-2'` rows). The summary query in `TrackableItemsTracker.jsx` was filtering `.eq('project_id', projectId || 'default')`, where `projectId` is the active pipeline (`'CLX-2'`) — never matched any rows.

Fix: replaced the `project_id` text-equality filter with an embedded PostgREST inner join through `daily_reports`:
```js
.from('trackable_items')
.select('item_type, action, quantity, daily_reports!inner(pipeline)')
.eq('daily_reports.pipeline', projectId)
```
Verified against the live DB: query now returns 12 CLX-2 trackable items (3 weld_upi, 2 ramps, 2 bedding_padding, 2 equipment_cleaning, 1 hydrovac, 1 access, 1 fencing). The legacy `trackable_items.project_id` column is deprecated as a project filter — kept on writes for backward compat.

Files changed:
```
src/kpUtils.js                    # new formatKPInput export (string-safe)
src/StringingLog.jsx              # onBlur formatter on stationKP
src/BendingLog.jsx                # onBlur formatter on stationKP
src/TrackableItemsTracker.jsx     # generic KP-field on-blur formatter +
                                  # summary filter switched to embedded
                                  # daily_reports.pipeline join
```

### CMT + EVM Live-Data Wire-Through, Photo & Form Durability, React #310 Fix (May 3, 2026)

Follow-up day after the dashboard wire-through (May 2). Three big workstreams:
durability (photos + autosave), CMT/EVM second-pass (real CLX-2 data, demo
fallbacks removed), and a Rules-of-Hooks crash fix.

#### A. Photo durability — belt-and-suspenders (commit `72a3efb`)

Audit revealed photos selected on inspector reports were stored only in React
state as raw `File` objects until Save was clicked. Page refresh / browser
crash / auto-deploy mid-session = audit-trail evidence permanently lost
(critical for concealed-work activities already buried). Fixed with a layered
architecture:

1. **`src/offline/photoManager.js`** — new module:
   - `persistPhoto({ blob, type, blockId, reportId, draftKey, organizationId, inspectorEmail, metadata })` — writes blob to IndexedDB instantly, fires background upload to Supabase Storage. Returns `photoId`.
   - `awaitUpload(photoId)` — wait for in-flight upload OR kick fresh retry. 3-attempt exponential backoff (2s, 4s, 6s).
   - `loadPhotosForReport(reportId, inspectorEmail?)` / `loadPhotosForDraft(draftKey, inspectorEmail?)` — recovery on page load.
   - `reassociatePhotos`, `markPhotoArchived` — promote draft photos onto saved reportId after save.
   - `subscribeToPhotoStatus(listener)` — drives per-photo UI badge updates.
   - `makeDraftKey(email, date)` — deterministic draft id.
2. **`src/offline/db.js`** — `savePhoto` extended to preserve `draftKey`, `organizationId`, `inspectorEmail`, `error` fields. No schema bump (IndexedDB stores arbitrary fields on records).
3. **`src/InspectorReport.jsx`** — `handleWorkPhotosSelect` rewrite (UUID + IndexedDB + background upload). Status subscription effect flips per-photo badges. Page-load recovery effect merges IndexedDB photos by blockId. `saveReport` awaits in-flight uploads then records filenames in `activity_blocks` JSONB. After save: `reassociatePhotos` + `markPhotoArchived`.
4. **`src/ActivityBlock.jsx`** — `processTicketOCR` migrated to the same pattern. `block.ticketPhotos` shape now `PhotoObj[]` with `{ photoId, file, originalName, uploadStatus, filename, uploadError }`. Thumbnail badges (`…` pending → `⟳` uploading → `✓` uploaded → `!` failed).
5. **`src/index.css`** — `@keyframes spin` for the upload-in-progress badge.
6. **`scripts/cleanup-orphan-photos.cjs`** — manual orphan cleanup. Walks both buckets, queries every `daily_reports.activity_blocks` for referenced filenames, deletes anything not referenced *and* older than configured grace period (default 7 days). Dry-run by default; `--confirm` to delete; `--age-days N` overrides.

#### B. Full-form 30s auto-save to IndexedDB (commit `f7abe20`)

Photos durable from selection wasn't enough — text/numbers/labour rows still
lived only in React state. Added a full-form snapshot every 30 seconds:

1. **`src/offline/db.js`** — bumped `DB_VERSION` 1→2, added `formDrafts` object store with indexes `(reportId, draftKey, updatedAt)`. CRUD: `putDraftSnapshot`, `getDraftSnapshot`, `deleteDraftSnapshot`, `listDraftSnapshots`.
2. **`src/offline/draftAutoSave.js`** — new module: `makeDraftId({ reportId, inspectorEmail, reportDate })`, `buildSnapshot(formState)` (strips File/Blob refs since photos are handled separately), `saveDraft`, `loadDraftFor`, `clearDraftFor`, `formatRecoveredAt`.
3. **`src/InspectorReport.jsx`** — `formStateRef` ref updated each render; 30s `setInterval` snapshots to IndexedDB; `beforeunload` listener for best-effort save on tab close. Recovery banner appears at the top of the form when a draft <7 days old is found, with **Restore** and **Discard** buttons. Save success path calls `clearDraftFor`.

#### C. User-scoped durability — multi-tenant device safety (commit `9716a9c`)

Audit found that edit-mode draft keys were `report:<id>` — same key regardless
of user. On a shared field tablet User B opening User A's saved report would
see A's unsaved typing in the recovery banner and A's pending IndexedDB photos
in the workPhotos array. Cross-user leak.

Fix: every IndexedDB record now scoped by `inspectorEmail`. `makeDraftId`:
`report:<id>:<email>` (was `report:<id>`); `draft:<email>:<date>` unchanged.
`savePhoto` records gain an `inspectorEmail` field. `loadPhotosForReport` /
`loadPhotosForDraft` filter by email with backward-compat for legacy records.

#### D. EVM Dashboard fixes (commits `06ee47b`, `2dd38cc`)

Two passes:

**Pass 1: null-safe rendering.** EVM dashboard crashed with
`Cannot read properties of undefined (reading 'spi')` on the Crews and
Trends tabs. Added `SAFE_METRICS` default object (every field set to safe
zero/one values), three-tier fallback chain (`liveMetrics → demoData.metrics →
SAFE_METRICS`), `(arr || []).filter(Boolean).map(...)` guards on `spreads` /
`monthlyTrends` iterations, optional-chained every `.toFixed()` call.

**Pass 2: live data was disabled in two places.**
- `projectInfo.totalLength` only sourced from `dpr_config.pipeline_length_metres` → header showed "—" with no `dpr_config` row. Now sourced from `project_baselines` (max `planned_metres` = 76,300 m for CLX-2).
- `monthlyTrends` had no live equivalent — render always called `demoData.monthlyTrends` whose labels are *hardcoded* `'Jul 2025'…'Dec 2025'`. Same for `sCurveData`. Built `liveMonthlyTrends` and `liveSCurve` by querying `daily_reports` filtered by pipeline, aggregating by month + per-day cumulative EV/AC. PV interpolated linearly across baseline window.
- `asOfDate` defaulted to today (12 years past CLX-2 end). Now clamped to `[baselineStart, baselineFinish]`, defaults to `baselineFinish`.
- Console instrumentation: `[EVMDashboard] baselines loaded`, `calculateEVM input/output`, `live time-series`.

#### E. CMT Dashboard fixes (commits `1451b66`, `46ccb75`)

Same demo-data leakage pattern as EVM, three independent paths:

1. **`loadReports`** filtered `.gte('date', today − dateRange days)`. CLX-2 reports are 2014-01-20; today is 2026 — even "All Time" (last 365 days) misses by 11 years. Now: pipeline-scoped queries the entire project window with no date filter. Legacy "last N days" only when no pipeline is set.
2. **`metrics` useMemo** had a `< 3 phases → demo` fallback that triggered for low-activity days even with real data. Removed entirely. Now returns `null` when reports.length === 0; consumers render a "No data available" panel.
3. **Crews/Workforce/Quality tabs** read from a hardcoded `spreadData` array of fake foremen (Brad Whitworth, Gary Nelson, Mike Thompson, James Wilson) and a `Math.sin`-generated `getCrewData()` table with hardcoded `91.2%` / `4.8%` / `95.2%` quality KPIs. New `liveSpreads` `useMemo` derives from `report.spread`, dedupes labour by `masterPersonnelId`, dedupes equipment by `masterEquipmentId`, infers welder count from blocks whose `activityType` starts with `Welding`. Quality tab gated behind `{false && ...}` and replaced with a "Quality metrics — coming soon" placeholder noting that real `qualityData` aggregation is a follow-up.

Plus: baseline-loading effect (mirrors EVM) populates `projectInfo.totalLength` / `totalBudget` / `baselineStart` / `baselineFinish` and a `baselineByPhase` map that replaces the hardcoded `plannedTargets` table.

**`46ccb75` follow-up:** the `liveSpreads` useMemo from `1451b66` was placed AFTER the existing `if (loading)` and `if (showEVM)` early returns — Rules of Hooks violation causing React #310 (`Rendered more hooks than during the previous render`) once `loading` flipped false. Moved all three `useMemo` blocks above all conditional returns.

#### F. DPR fixes (commits `c04e9e1`, `6faf793`)

Two follow-ups to the May 2 DPR work:

1. **Embedded-resource query** — replaced the brittle two-step
   `report_status` → `IN(...)` → `daily_reports` query with a single PostgREST
   call that embeds `report_status(status)`. Filters status in JS with
   normalization for object-vs-array PostgREST shape. Reports without a
   status entry now treated as legacy/visible (handles historical CLX-2 data
   ingested without going through the inspector submit workflow).
2. **% Complete and column semantics** — `% Complete` was reading 4,040,000% because the synthesized fallback `dpr_config` set `pipeline_length_metres: 0`, and `parseFloat(0) || 1` collapsed the divisor to 1m. Now: pipeline length sourced from `project_baselines.planned_metres` (max across activities = 76,300 m for CLX-2), falls back to `dpr_config.pipeline_length_metres`, renders `—` if neither. Column semantics fixed per spec: `Today = todayToKp − todayFromKp` (metres worked today, not increment-from-yesterday); `Previous = yesterday's cumulative`; `Total = Previous + Today`; `% = Total / pipelineLength`.

#### G. Diagnostics + error boundary (commits `3901343`, `805be3a`)

After a `'Cannot access "st" before initialization'` TDZ crash on edit-mode
load that static analysis couldn't pinpoint:

- `vite.config.js` — enabled `build.sourcemap = true` in production.
- `src/components/ReportErrorBoundary.jsx` — class-based ErrorBoundary that catches render/effect errors anywhere inside `InspectorReport` and renders an inline panel with the full error message, stack trace, component stack, and "Try again" / "Reload page" buttons. Replaces the white-screen failure mode.
- `src/InspectorApp.jsx` and `src/App.jsx` — wrap every `InspectorReport` mount with `ReportErrorBoundary`.
- Defensive try/catch around the synchronous photo-status subscription handler and the per-render `formStateRef.current = collectFormState()` updater so an internal failure stays inside the effect rather than crashing the tree.

#### H. Project hardcoded to CLX-2 (commit `66c8759`)

Multi-project dropdown removed from DPR / CMT / EVM headers — only one active
project right now, the dropdown was confusing. `pipelineFilter` hardcoded to
`'CLX-2'` in all three views; each header shows a static `Project: CLX-2`
badge. When a second active project is added, revert this commit to bring the
dropdown back.

#### Files changed across the day

```
src/offline/photoManager.js              # new — IndexedDB + background upload
src/offline/draftAutoSave.js             # new — 30s form snapshot
src/offline/db.js                        # DB_VERSION 1→2, formDrafts store, photo schema extensions
src/offline/index.js                     # exports photoManager + draftAutoSave
src/InspectorReport.jsx                  # photo persistence, autosave, recovery banner, error boundary integration
src/ActivityBlock.jsx                    # ticket photo PhotoObj migration, status badges
src/Dashboard.jsx                        # CMT live-data wire-through + hooks ordering fix
src/EVMDashboard.jsx                     # null-safety, live monthly trends, live S-curve, totalLength from baselines
src/InspectorApp.jsx                     # ReportErrorBoundary wrap
src/App.jsx                              # ReportErrorBoundary wrap on /field-entry route
src/components/ReportErrorBoundary.jsx   # new — render-error inline panel
src/index.css                            # @keyframes spin
vite.config.js                           # build.sourcemap = true
scripts/cleanup-orphan-photos.cjs        # new — orphan storage cleanup
```

#### Required follow-ups

- **Quality tab on CMT** is a placeholder. Real per-activity `qualityData`
  aggregation is non-trivial (each activity type has a different quality
  schema). Re-enable when ready.
- **EVM monthly SPI/CPI** currently shows `1.00` per month for live data
  because the per-month plan-vs-actual breakdown isn't computed yet. Phases
  tab uses the proper formula; the Trends tab columns are placeholders.
- **Live S-curve EV** approximates `EV ≈ AC` per data point because per-block
  budgeted unit cost isn't carried into the cumulative loop. Phases tab uses
  the correct EV via `calculateEVM`.
- **No-data banners** appear when a different pipeline is selected (DPR, CMT,
  EVM all show "no data" panels). When a second project is added, restore the
  dropdown by reverting `66c8759`.

### Inspector Reports Wired to DPR / CMT / EVM Dashboards + CLX-2 Baselines (May 2, 2026)

**Three downstream views now read from Corry's CLX-2 inspector reports as the single source of truth.** Audit + 6-step refactor; pushed direct to main as commit `4bf40e6`.

**The audit finding (before this work):** all three dashboards intended to read from `daily_reports` but were broken or hardcoded:
- **DPR** queried columns that don't exist (`report_date`, `weather_conditions`, `weather_temp_high/low`, plus a non-existent `status` column on `daily_reports`). Tab fully blocked when no `dpr_config` row existed.
- **CMT Dashboard** had a labour-hour bug (read `entry.hours` instead of `(entry.rt + entry.ot)`), hardcoded $85/$165 rates, hardcoded EGP/FortisBC project metadata, and fell back to demo data when fewer than 3 phases reported.
- **EVM Dashboard** never called `calculateEVM()` — rendered hardcoded demo S-curves only. The engine in `evmCalculations.js` was production-ready but disconnected.

**Fixes applied:**

1. **DPR query corrected** (`src/DPRTab.jsx`) — column names fixed to match `daily_reports` (`date`, `weather`, `temp_high`, `temp_low`). Status filter now joins through `report_status` and includes `submitted`/`approved`/`published` so Corry's active reports flow through, not just approved ones. Welds read from `block.weldData.weldsToday`. KP parsing uses `parseKP` from `kpUtils.js`. Synthesizes a fallback `dpr_config` from defaults when no row exists, so the tab loads without manual setup.

2. **Project (pipeline) selector added to all three views** — sourced from distinct `daily_reports.pipeline` values per org. Defaults to most-recent project. Drives the data query in DPR, the report scope in CMT, and `calculateEVM({ pipeline })` in EVM.

3. **CMT labour-hour fix + master rate lookup** (`src/Dashboard.jsx`) — `(rt + ot) × count` for labour hours. Cost rate priority: `entry.rate` → master `labour_rates.rate_st` (or `equipment_rates.rate_daily / 10`) → $85/$165 fallback. Phase costs now use real labour × resolved rate + equipment × resolved rate; the `costPerMetre` table is only used when no labour/equipment was logged for the block.

4. **CLX-2 baselines seeded** (migration `20260502_clx2_baselines_and_pipeline_column.sql`) — adds `pipeline TEXT`, `organization_id UUID`, `provisional BOOLEAN` columns to `project_baselines` plus an org-aware RLS policy. Seeds 16 activities for `pipeline = 'CLX-2'`: NPS 36, 76,300m, FEED budget $68.4M, Apr–Nov 2014 schedule windows staggered by construction sequence. All allocations marked provisional (standard pipeline construction percentage breakdowns) until contract-level cost data lands.

5. **EVM Dashboard wired to live data** (`src/EVMDashboard.jsx`) — calls `calculateEVM({ pipeline, asOfDate, labourRateMap, equipmentRateMap })` whenever the project or rate maps change. When real data exists (`reportCount > 0`), builds `liveMetrics`, `livePhases`, `liveSpreads` from EVM output. Falls back to demo data only when no inspector reports for the selected pipeline. LIVE/DEMO badge in the header. Demo footer ("For Demonstration Purposes") only renders when actually demo.

6. **Hardcoded EGP/FortisBC branding removed from both dashboards** — `EGP_PROJECT` constant replaced by `DEFAULT_PROJECT` placeholders + `projectInfo` state populated from `dpr_config` (name, contractor, length) and `project_baselines` (BAC + schedule auto-computed by summing `planned_metres × budgeted_unit_cost` and taking min/max planned dates for the active pipeline). Demo data generators now take `projectInfo` as a parameter.

7. **`evmCalculations.js` extensions** — new `fetchRateMaps()` helper reads `/api/rates` (server-side, RLS-bypass) and builds `{ classification → rate_st }` and `{ equipment_type → rate_daily }` maps for an org. `fetchBaselines()` and `fetchActualProduction()` accept a `pipeline` filter. `calculateEVM()` accepts `pipeline`, `labourRateMap`, `equipmentRateMap` options.

**Modified files:**
```
src/DPRTab.jsx               # column names, report_status join, fallback config
src/DPRConfig.jsx            # exports DEFAULT_ACTIVITIES, DEFAULT_SUPPLEMENTARY
src/Dashboard.jsx            # pipeline filter, labour bug fix, master rates, projectInfo
src/EVMDashboard.jsx         # calculateEVM wired in, projectInfo, LIVE/DEMO badge
src/evmCalculations.js       # fetchRateMaps, pipeline filter, master rate priority
```

**New migration (run in Supabase SQL Editor):**
```
supabase/migrations/20260502_clx2_baselines_and_pipeline_column.sql
```

**Verification query after running migration:**
```sql
SELECT pipeline, COUNT(*) AS activities,
       SUM(planned_metres * budgeted_unit_cost) AS total_budget
FROM project_baselines WHERE pipeline = 'CLX-2' GROUP BY pipeline;
-- Expected: 16 activities, total ≈ $68,344,000
```

**Required follow-ups:**
- Run the migration in Supabase SQL Editor.
- Confirm Corry's `pipeline` column value matches `'CLX-2'` exactly (the dropdown will show whatever values exist in the data).
- Refine provisional baseline allocations when contract-level cost detail is available (`UPDATE project_baselines SET provisional = FALSE, budgeted_unit_cost = ... WHERE pipeline = 'CLX-2' AND activity_type = '...'`).
- No field guide regeneration needed — work did not touch `InspectorReport.jsx`, `ActivityBlock.jsx`, `TrackableItemsTracker.jsx`, or quality field constants.

### LEM Batch Extraction + Extract Now Fix + Per-Person Subs Override (April 25, 2026)

**Fixed Extract Now button, batch-extracted all 28 LEM PDFs, added per-person subsistence override.**

1. **Extract Now button fixed** — Root cause: `contractor_lems` had no unique constraint on `(field_log_id, organization_id)`, causing the upsert to fail silently (error 42P10). Replaced with check-then-insert/update pattern. Added loading state ("Extracting..."), disabled button during OCR, toast messages for all error paths (API credit balance, PDF download failure, empty OCR, save errors).

2. **Error propagation in lemParser.js** — `extractLEMFromUrl` and `extractLEMLineItemsFromBase64` now return an `error` field with specific messages instead of silently returning empty arrays. Button shows the actual failure reason.

3. **Batch LEM extraction** — Extracted all 28 LEM PDFs via Claude Vision (5 previously done + 23 new). Total: 364 labour entries + 579 equipment entries across all tickets, $644,088.10 in claimed LEM costs. All tickets now have structured data in `contractor_lems` for variance comparison.

4. **Per-person subsistence override** — Added `rate_subs_override` column (nullable NUMERIC) to `personnel_roster`. When set, `calcLabourCost` uses the override instead of the classification's `rate_subs` from `labour_rates`. Allan Van Wallegham: EQUIPMENT MANAGER $295 overridden to $230. Julie Tolley: OFFICE CLERK (LOCAL HIRE) $230 overridden to $85.

5. **Equipment rate gap fill** — Inserted 4 missing equipment rate rows: Hoe - Chuck Blade Attachment (daily=$79.38), Track Morooka (daily=$973.67), Transition Machine Without Power Unit (daily=$899.58 — solves Corry's mystery #2), Storage Trailer/Van (daily=$64). Fixed Mechanic's Rig and Utility Welder Rig rate_type to "hourly" ($48/hr).

6. **STRAW - TEAMSTER labour rate inserted** — ST=$64.85, OT=$97.28, DT=$129.70, Subs=$85. Completes all 6 STRAW classifications.

**Modified files:**
```
src/Components/Reconciliation/InspectorReportPanel.jsx     # Extract Now fix, subs override, error display
src/Components/Reconciliation/ReconFourPanelView.jsx       # rate_subs_override in roster query
src/utils/lemParser.js                                     # Error propagation from OCR failures
src/RateImport.jsx                                         # Equipment import prompt fix
```

**New migrations:**
```
supabase/migrations/20260425_add_rate_subs_override.sql
supabase/migrations/20260425_contractor_lems_unique_constraint.sql
```

**Open rate items (from Corry's list):**
- Crew Cab 1 Ton: DB has $163/day per CSV, Corry expects $489
- Sideboom 587T: DB has $1,323/day per CSV, Corry expects $5,292 (= $1,323 x 4)

### Rate Lookup Bug Fixes + Missing STRAW/Equipment Data (April 22, 2026)

**Fixed rate resolution failures from Corry's bug list. Root cause: CSV import skipped rows with empty early columns (STRAW classifications, Automatic Welding Tractor).**

1. **5 STRAW labour rates inserted** — STRAW - OPERATOR (ST=64.24), STRAW - LABOURER (ST=48.10), STRAW - FITTER ON STICK WELD SPREAD (ST=82.81), STRAW - FITTER ON AUTO WELD SPREAD (ST=82.81), STRAW - GRADED HELPER (ST=54.74). All hourly with Subs=$85. 26 personnel in roster, 15 existing activity_block entries now resolve.

2. **Automatic Welding Tractor rate inserted** — daily=1345. 24 fleet units (OR1551–OR1560, OR2225, OR2245, OR2341, SB201D–SB211, U651Q units) were hitting fuzzy match to "Weld - Quad Welder/Tack Rig" (768/day) instead.

3. **Welding Rig rate_type fixed** — Changed from "daily" to "hourly". Rate is $4.80/hr (monthly=$48). App now multiplies by actual hours worked instead of applying flat daily rate.

4. **Zero-hours equipment cost bug fixed** — `calcEquipmentCost` now returns cost=0 when hours=0. Previously showed a daily rate even for 0-hour entries (OR1299 bug).

5. **Equipment rate_type "hourly" support** — `calcEquipmentCost` now checks `rate_type`: hourly rates multiply by hours, daily rates use flat daily amount. Previously ignored rate_type entirely.

6. **Fuzzy equipment rate matcher tightened** — Token overlap now requires all lookup tokens match AND at least 50% of rate card tokens are covered. Prevents false positives like "Flow Through" matching "Snowplow/Sander" via substring overlap.

7. **Import prompt updated** — Both text and Vision extraction prompts in `RateImport.jsx` now explicitly say to include rows with empty early columns if rate columns V/W/X have values. Prevents future imports from dropping STRAW-style rows.

8. **Count/Cnt fields removed** — Removed Count input from labour/equipment "Add" forms and Cnt/Count columns from both tables. Each person/equipment is always count=1 (listed individually).

**Modified files:**
```
src/Components/Reconciliation/InspectorReportPanel.jsx     # calcEquipmentCost, findEquipmentRate fixes
src/RateImport.jsx                                         # Import prompt fix for empty early columns
src/ActivityBlock.jsx                                      # Count field removal
```

**Resolved in April 25 update:** Transition Machine (was "Without Power Unit" variant at $899.58), OR1309 Storage Trailer/Van (rate inserted), STRAW - TEAMSTER (rate inserted), Allan Vanwelleghem subs (override to $230), Julie Tolley subs (override to $85).

### Reconciliation Workspace Rebuild (April 21, 2026)

**Simplified variance logic: red rows compare inspector vs LEM (not contract vs LEM). Inline reason text, no popovers. Auto-populate classification on personnel/equipment selection. OCR auto-split via contract compliance engine.**

1. **Red row logic simplified** — A row is red when inspector values don't match LEM: total hours mismatch, RT/OT/DT breakdown mismatch, missing on LEM, or ghost on LEM. Contract compliance engine still auto-fills the split but doesn't drive the red/clear decision. Categories: `hours_mismatch`, `split_mismatch`, `missing_on_lem`, `ghost_on_lem`, `reconciled`.

2. **Inline variance reason text** — Red rows show a one-line reason below the name field (e.g., "⚠ LEM: 12 RT 0 OT, inspector: 8 RT 4 OT"). Always visible, no click required. Same pattern as amber "Not in master" text.

3. **VarianceDetailPopover deleted** — Removed entirely. No popover, no tooltip, no click handler on red rows. Red rows behave exactly like normal rows for clicking and editing. Fixes dropdown blocking bug permanently.

4. **Ghost rows section** — "ON LEM BUT NOT REPORTED" table below equipment, showing LEM entries with no matching inspector entry. Red styling.

5. **Auto-populate classification** — Selecting a name from the personnel roster dropdown auto-fills classification and master_personnel_id. Selecting a unit number from the equipment fleet dropdown auto-fills equipment type and master_equipment_id. Equipment fleet now loaded from `equipment_fleet` table.

6. **OCR auto-split** — When a ticket is OCR'd, total hours are automatically split into RT/OT/DT via `calculateSplit()` based on the report date. The `addLabourToBlock` function now accepts a `dt` parameter. Backfill applied to 244 existing entries.

7. **OCR case normalization** — OCR'd names converted from ALL CAPS to title case and matched against master roster for canonical names. Backfill resolved 122 labour + 42 equipment rows from unmatched to matched.

8. **AdminOverridePopover** — Pencil icon on Subs and Cost cells (admin/super_admin only). Override form requires reason (min 10 chars). Blue dot indicator on overridden cells with hover tooltip.

9. **Summary banner** — Shows 4 counters: unresolved master, flagged for review, red variance, ghosts. Disappears when all zero.

**Deleted files:**
```
src/Components/Reconciliation/VarianceDetailPopover.jsx    # Replaced by inline text
src/Components/Reconciliation/VarianceComparisonPanel.jsx  # Replaced by Panel 2 integration
src/Components/Reconciliation/VarianceSummaryBar.jsx       # No longer needed
src/Components/Reconciliation/VarianceRow.jsx              # No longer needed
```

**Modified files:**
```
src/Components/Reconciliation/InspectorReportPanel.jsx     # Simplified variance, inline reasons, equipment roster
src/Components/Reconciliation/ReconFourPanelView.jsx       # Equipment fleet loading, personnel roster id
src/Components/Reconciliation/DocumentPanel.jsx            # equipmentRoster prop pass-through
src/InspectorReport.jsx                                    # addLabourToBlock dt parameter
src/ActivityBlock.jsx                                      # OCR auto-split, case normalization
src/utils/lemParser.js                                     # OCR name title-casing
```

### Contract Compliance Engine + Total Hours Entry (April 19, 2026)

**Added contract-aware RT/OT/DT auto-splitting and the foundation for variance comparison.**

1. **Contract Compliance Engine** (`src/lib/contractCompliance.js`) — Pure calculation module with 5 functions: `loadProjectRules()`, `getHolidayForDate()`, `calculateSplit()`, `calculateCost()`, `calculateVariance()`. Standard Canadian pipeline rules: weekday (first 8 RT, remainder OT), Saturday (all OT), Sunday (all DT), statutory holiday (all DT, takes precedence). 13 unit tests pass.

2. **Project contract configuration** — Added `base_hours_per_day`, `ot_multiplier`, `dt_multiplier`, `province` columns to `projects` table. CLX-2 set to Alberta, 8/1.5x/2.0x.

3. **Statutory holidays table** — `statutory_holidays` with 3006 entries covering all Canadian federal + provincial holidays 2014–2030. Province-scoped: AB Family Day fires for Alberta, not Quebec.

4. **Total Hours inspector entry** — `ActivityBlock.jsx` refactored: inspectors enter one "Total Hours" field. RT/OT/DT auto-calculated via `calculateSplit()` based on report date + contract rules. Split preview shows below form. RT/OT/DT columns are read-only display. Existing CLX-2 entries keep stored values.

5. **Reconciliation line items** — `reconciliation_line_items` table created with variance tracking columns: `variance_category`, `dollar_impact`, `contract_rt/ot/dt`, `lem_rt/ot/dt`.

**New files:**
```
src/lib/contractCompliance.js              # Contract compliance engine
supabase/migrations/20260417_seed_statutory_holidays.sql  # Holiday seed data
```

**Modified files:**
```
src/ActivityBlock.jsx                      # Total Hours entry, auto-split
```

**New DB tables/columns:**
- `statutory_holidays` — 3006 rows, federal + provincial, 2014–2030
- `projects.base_hours_per_day`, `ot_multiplier`, `dt_multiplier`, `province`
- `reconciliation_line_items` — with variance tracking extensions

### Resolve Button Rebuild + Master Gaps (April 19, 2026)

**Replaced "+ Add to Master" with a diagnostic-first "Resolve" workflow. Fuzzy matching surfaces candidates before creation.**

1. **ResolveRowModal.jsx** — New component replacing `AddToMasterModal.jsx`. Shows top 5 fuzzy-matched candidates from master (7-pass name matching, equipment token overlap). Match strength dots: green ≥85%, yellow 60–84%, orange 40–59%. Four actions: "This one" (pick existing), "Add as new" (admin-only), "Flag for review" (all roles), "Cancel".

2. **Resolution decisions table** — `resolution_decisions` captures every resolve action with `source_value`, `resolution_type` (picked_existing/added_new/flagged/cancelled), `candidates_shown` JSONB, `master_id_resolved`. Training data for future automated alias system.

3. **Row color states** — Amber = unmatched, Purple = flagged for review. "Resolve" button on amber rows, "Review Flag" on purple rows. Summary banner shows separate counts.

4. **Master Gaps admin page** — `src/MasterGaps.jsx` at `/:orgSlug/master-gaps`. Two tabs: Unresolved (grouped by name/unit with count + ticket list) and Flagged for Review (with flag reason + date).

5. **Pre-resolution duplicate detection** — When resolving an amber row to a master entry already on the ticket, shows merge/keep-separate/cancel modal. Merge sums hours (keeps higher subs). Keep-separate triggers existing duplicate warning.

6. **Drag-and-drop row reordering** — Replaced up/down arrow buttons with ≡ grip handles on labour and equipment rows. HTML5 drag-and-drop with blue drop indicator.

7. **Audit logging** — `logResolutionEvent()` in `auditLoggerV3.js` with 5 event types. Field guide updated to v4.15.1.

**New files:**
```
src/Components/Reconciliation/ResolveRowModal.jsx  # Fuzzy candidate + resolve workflow
src/MasterGaps.jsx                                  # Admin gaps/flagged view
```

**Deleted files:**
```
src/Components/Reconciliation/AddToMasterModal.jsx  # Replaced by ResolveRowModal
```

### Pipeline Route Database Refactor (April 16–17, 2026)

**Replaced the 670KB static egpRouteData.js file with a multi-layer database architecture. Pipeline route data now loads from Supabase, supporting multiple KMZ uploads per project with distinct layer types.**

1. **9 database tables** — `pipeline_routes` parent + 8 child tables (centerline, KP markers, welds, bends, footprint, open ends, bore faces, sag bends). All org-scoped with denormalized `organization_id` and RLS.

2. **KMZ parser API route** (`/api/parse-kmz`) — Auth-verified, org-scoped. Downloads KMZ from storage, unzips, parses KML, classifies features via rule-based engine, inserts via `insert_pipeline_route` RPC (single Postgres transaction — full rollback on any failure).

3. **Multi-layer architecture** — Projects can have one active KMZ per `layer_type` (alignment, construction, environmental, row, other). Map queries merge layers: KP markers + footprint from alignment, welds + bends + centerline from construction.

4. **Superseding with history** — New upload of same layer type deactivates previous. `superseded_route_id` tracks the chain. Reject-with-restore: if admin rejects an upload, the previously superseded route is restored.

5. **Unclassified safety net** — Features not matching classification rules are captured with full diagnostics. Admin must explicitly accept before route goes live.

6. **KMZUpload.jsx** — Admin UI with layer type selector (required), parse results display, feature count badges, unclassified review table, accept/reject flow, supersede warnings with specific route name.

7. **MiniMapWidget.jsx refactor** — `useRouteData()` hook queries alignment + construction layers, caches per org (one fetch per page load). Empty-route guards on `interpolatePosition` and `findNearestKP`.

8. **Verified against 3 KMZ files**: alignment (774 centerline, 367 KP, 248 footprint), March construction (684 welds, 188 bends, 3033 centerline), December construction (451 welds, 140 bends). All counts match.

**New files:**
```
api/parse-kmz.js                 # KMZ parser API
src/KMZUpload.jsx                # Admin upload UI
supabase/migrations/20260416_*   # 5 migration files (tables, RPC, layer_type, unclassified, superseded_route_id)
```

**Modified files:**
```
src/MiniMapWidget.jsx            # DB-backed route data (replaced static import)
src/AdminPortal.jsx              # KMZ upload section in Setup tab
```

**Deleted files:**
```
src/egpRouteData.js              # 670KB static file — replaced by DB (pending Checkpoint 5)
```

### Employee Roster Dropdown, Duplicate Detection, DPR Module & Invitation System (April 14, 2026)

**Major additions to the inspector report, reconciliation panel, and admin portal.**

1. **Employee Name Dropdown on Inspector Report** — `ActivityBlock.jsx` `SearchableNameInput` now loads a full employee roster from all daily reports (475+ names). Dropdown shows name + classification side by side. Selecting a name **auto-populates the classification**. Input height matches classification box (38px). Works in both the new entry form and inline edit table. JH column replaced with DT (double time).

2. **Employee Name Dropdown on Reconciliation Panel** — Same roster-based dropdown on the inspector panel (Panel 2) in the 4-panel reconciliation view. Selecting a name auto-fills classification. Roster built from all daily_reports on page load.

3. **Duplicate Detection Flags** — Informational warnings on inspector panel rows. Same-ticket duplicates: "Duplicate on this ticket". Cross-ticket same-day: "Also on ticket #18230". Red warning bar below flagged rows. Scans all reports for the same date.

4. **Row Management** — Add Employee / Add Equipment buttons. Up/down arrow reorder buttons. Red X delete button with confirmation prompt. All changes save to `daily_reports.activity_blocks` and are audit logged.

5. **DPR Module** — New "Daily Progress Report" tab in Admin Portal. DPR Configuration section in Setup tab. Vercel serverless email route (`/api/send-dpr-email`). 29 activity types mapped. PDF generation and email via Resend.

6. **Custom 7-Day Invitations** — Replaced Supabase Auth's 24-hour tokens with custom token system. `user_invitations` table, `accept-invitation` edge function, `AcceptInvite.jsx` page at `/accept-invite`.

7. **ReportViewer Fixes** — Fixed Productive hours string concatenation bug. JH → DT column rename.

8. **Classification Alias Seeding** — Straw variations (Straw Operator, Straw Fitter, etc.) seeded in `classification_aliases` table mapping to formal rate card names.

**Field Guide**: Updated to v4.14 — employee name dropdown with auto-classification, DT replaces JH.

**Files changed:**
```
src/ActivityBlock.jsx                              # Employee roster dropdown, auto-classification
src/Components/Reconciliation/InspectorReportPanel.jsx  # Roster dropdown, duplicate detection, row management
src/Components/Reconciliation/ReconFourPanelView.jsx    # Roster + sameDayEntries loading, optimistic UI
src/Components/Reconciliation/DocumentPanel.jsx         # Props pass-through
src/ReportViewer.jsx                               # Productive hours fix, JH → DT
src/AdminPortal.jsx                                # DPR tab + config section
src/DPRConfig.jsx                                  # DPR configuration component
src/DPRTab.jsx                                     # DPR editor component
src/AcceptInvite.jsx                               # Invitation acceptance page
src/App.jsx                                        # /accept-invite route
api/send-dpr-email.js                              # Vercel serverless DPR email
supabase/functions/invite-user/index.ts            # Custom 7-day tokens
supabase/functions/accept-invitation/index.ts      # Token verification + password setting
pipe-up-field-guide-agent-kb.md                    # v4.14 — roster dropdown, DT replaces JH
```

### Custom 7-Day Invitation System (April 14, 2026)

**Replaced Supabase Auth's 24-hour invitation tokens with a custom token-based system that gives invitees 7 days to accept.**

1. **Custom token generation** — `invite-user` edge function now generates a 64-character hex token, SHA-256 hashes it, and stores the hash in the `user_invitations` table with a 7-day expiry. Raw token is never stored.

2. **New `user_invitations` table** — Tracks all invitations: email, name, role, token hash, expiry, acceptance timestamp. Org-scoped with RLS. Anon read access for token verification on the accept page.

3. **New `accept-invitation` edge function** — Verifies token against hash in DB, checks expiry and used status, sets user password via admin API, confirms email, creates session, marks invitation accepted, updates profile to active.

4. **New `AcceptInvite.jsx` page** — Public route at `/accept-invite?token=...`. Verifies token client-side, shows password form with confirmation, calls edge function, auto-redirects on success. Shows clear error messages for expired/invalid/used tokens.

5. **Email unchanged** — Still uses Resend from verified domain `noreply@pipe-up.ca`. Link format changed from Supabase auth URL to `https://app.pipe-up.ca/accept-invite?token={token}`.

**New files:**
- `src/AcceptInvite.jsx` — Accept invitation page
- `supabase/functions/accept-invitation/index.ts` — Token verification + password setting edge function
- `supabase/migrations/20260414_create_user_invitations.sql` — Invitation tracking table

**Modified files:**
- `supabase/functions/invite-user/index.ts` — Custom token generation replaces Supabase generateLink
- `src/App.jsx` — Added `/accept-invite` public route

### Inspector Panel Enhancements (April 10–14, 2026)

**Added row management capabilities to the reconciliation inspector panel.**

1. **Add Employee / Add Equipment** — Buttons below each table to add missing people or equipment. New rows save to `daily_reports.activity_blocks` and are audit logged. Name field auto-focuses on new rows.

2. **Row reorder** — Up/down arrow buttons (▲▼) on each row to move entries. Admin can place newly added entries anywhere in the list. All moves audit logged with position tracking.

3. **ReportViewer bug fixes** — Fixed Productive hours string concatenation bug (`"8" + "4"` = `"84"` instead of `12`). Replaced JH column with DT (double time).

### Costed Inspector Panel & Rate Type System (April 6–10, 2026)

**Replaced the variance comparison approach with a simplified costed inspector panel. Inspector data is the source of truth — costs are calculated from rate cards and displayed directly in Panel 2. Supports weekly/daily salaried rates, hourly Red Book rates, and daily equipment rates.**

1. **Costed Inspector Panel** — Rewrote `InspectorReportPanel.jsx` from a read-only table to an inline-editable costed view. LEM-style columns: Name, Classification, RT Hrs, RT Rate, OT Hrs, OT Rate, DT Hrs, DT Rate, Subs, Cost. Summary footer with Labour Total, Equipment Total, Grand Total.

2. **Rate Type System** — Added `rate_type` column to `labour_rates` (`'weekly'` for salaried/indirect, `'hourly'` for Red Book field workers) and `equipment_rates` (`'daily'`). Cost calculation: salaried workers use rate_st as daily rate directly; hourly workers use RT×ST + OT×OT + DT×DT; equipment uses daily all-in rate per unit.

3. **Equipment Rate Breakdown** — Added `rate_monthly`, `rate_base`, `rate_parts` columns. Import extracts: Column 3 (monthly), Column 5 (base hourly), Column 6 (parts/repairs allowance), Column 10 (all-in daily rate).

4. **Labour Rate Import** — Claude prompts target specific columns: V (ST/Weekly), W (OT 1.5x), X (DT 2.0x), Y (Subsistence). For indirect workers with min/max lines, uses MIN rate only.

5. **Subsistence Column** — Added `rate_subs` to `labour_rates`. Displayed per-person in the inspector panel and included in cost calculation.

6. **Learning Alias System** — New `classification_aliases` table (org-scoped with RLS). When admin corrects a classification via searchable dropdown, system prompts "Save this mapping?" → alias stored for future auto-resolution. Eliminates hardcoded alias maps.

7. **Panel Layout Reorder** — P1: Contractor LEM, P2: Inspector Report (costs), P3: Contractor Daily Ticket, P4: Inspector Ticket Photo.

8. **Variance Panel Toggle** — VarianceComparisonPanel hidden by default, "Show LEM Comparison" button appears only when LEM data exists.

9. **Rate Lookup Improvements** — Whitespace normalization (fixes double-space mismatches), token-based fuzzy matching as 4th pass (fixes "Flat Deck - 5 Ton" → "Flat Deck < 5 Ton"), portal-rendered dropdown (fixes overflow clipping in panel).

10. **Audit Trail** — All inspector data edits logged to `report_audit_log` with field, old value, new value, who, when. Changes persist to `daily_reports.activity_blocks` (feeds dashboards).

**New DB tables/columns:**
- `classification_aliases` — learning alias system (org-scoped, RLS)
- `labour_rates.rate_type` — 'weekly' or 'hourly'
- `labour_rates.rate_subs` — subsistence per diem
- `equipment_rates.rate_type` — 'daily'
- `equipment_rates.rate_monthly`, `rate_base`, `rate_parts` — breakdown columns

**Files changed:**
```
src/Components/Reconciliation/InspectorReportPanel.jsx  # Full rewrite
src/Components/Reconciliation/ReconFourPanelView.jsx    # Panel reorder, rate loading, toggle
src/Components/Reconciliation/DocumentPanel.jsx         # Props pass-through
src/RateImport.jsx                                      # Rate type support, column targeting
supabase/migrations/20260406_classification_aliases.sql
supabase/migrations/20260408_add_rate_type_column.sql
supabase/migrations/20260408_equipment_rate_breakdown.sql
supabase/migrations/20260410_add_rate_subs_column.sql
```

### Variance Panel Overhaul — Inspector as Source of Truth + Auto-OCR LEM Extraction (April 4, 2026)

**Major refactor of the variance comparison system: inspector data is now the source of truth (always displays, even without LEM data), LEM uploads auto-extract via OCR, and classification/equipment alias maps resolve field naming mismatches.**

1. **Inspector as source of truth** (`c091b5a`) — Flipped the variance panel so inspector report data always renders as the primary view. LEM data is an overlay for comparison, not a prerequisite. Previously the panel was blank without LEM data.

2. **Auto-OCR LEM extraction** (`ef1ce7c`) — When a contractor LEM is uploaded via `ReconciliationUpload.jsx`, the system now automatically triggers `extractLEMFromUrl()` to OCR the PDF and upsert structured billing data (labour entries, equipment entries, totals) into the `contractor_lems` table. No manual "Extract LEM Data" step required.

3. **PDF OCR support** (`be00591`) — New `extractLEMFromUrl()` in `lemParser.js` handles both PDFs and images. For PDFs: renders each page to a canvas image via pdf.js at 2x scale, then OCRs each page individually with `extractLEMLineItemsFromBase64()`. Aggregates labour, equipment, and cost totals across all pages.

4. **Classification alias map** (`546a401`) — 22-entry alias map in `VarianceComparisonPanel.jsx` that maps common field abbreviations and OCR misreads to official rate card classification names (e.g., "FE Welder" → "Front-End/Tie-In Welder on Stick Weld Spread", "Straw Operator" → "Apprentice Oper/Oiler"). Enables accurate rate card lookups for inspector cost calculation.

5. **Equipment alias map** (`f6fc4c5`) — Maps inspector equipment descriptions to rate card names (e.g., "Hydrovac Truck" → "Hydrovac", "Backhoe Cat 420F" → "Rubber Tired Hoe - Cat 420/430", "Track Hoe" → "Backhoe - Cat 330"). Fixes unmatched equipment rate lookups.

6. **Rate card cost calculation** (`cc3b5ef`) — Inspector costs are now calculated from rate cards (via `/api/rates` endpoint), not from raw entry values. Fuzzy matching with `toLowerCase().includes()` fallback for abbreviated classification names (`6e95a5c`, `8183ab2`).

7. **Editable inspector data** (`860ed7d`) — Inspector labour and equipment entries are editable inline in the variance panel, with additional cost rows supported.

8. **contractor_lems upsert fix** (`bfc607b`) — Replaced `.upsert()` with explicit check-then-insert/update pattern to avoid duplicate key conflicts when re-extracting LEM data for the same ticket.

**Files changed:**
```
src/Components/Reconciliation/VarianceComparisonPanel.jsx  # Major update
src/Components/Reconciliation/ReconciliationUpload.jsx     # Auto-OCR trigger
src/Components/Reconciliation/ReconFourPanelView.jsx       # Debug logging
src/utils/lemParser.js                                     # extractLEMFromUrl + extractLEMLineItemsFromBase64
```

### 4-Panel Reconciliation System — ticket_number Keyed (March 22, 2026)

**New reconciliation system matching documents by ticket_number across 4 panels. Two panels are uploaded by admin (contractor LEM + contractor daily ticket), two are auto-linked from existing inspector data in the app (ticket photo + formatted report).**

1. **Architecture** — ticket_number is the universal join key. All four document sources converge on this field:
   - Panel 1 (Contractor LEM): uploaded by admin to `reconciliation_documents` table
   - Panel 2 (Inspector Report): costed manpower + equipment from `daily_reports` → `activity_blocks` with inline editing, rate card costs, audit logging — NOT uploaded
   - Panel 3 (Contractor Daily Ticket): uploaded by admin to `reconciliation_documents` table
   - Panel 4 (Inspector Ticket Photo): auto-linked from `ticketPhotos` in `daily_reports` → `activity_blocks` — NOT uploaded

2. **ReconciliationUpload.jsx** — Upload form for contractor docs only (LEM or Daily Ticket). Ticket number required, drag-drop file zone, duplicate detection, multi-page support (PDF = single doc, multiple images = one multi-page doc). Files stored in `reconciliation-docs` bucket at `{org_id}/{ticket_number}/{doc_type}/{filename}`

3. **ReconciliationList.jsx** — Ticket overview table merging two data sources: `recon_package_status` view (uploaded docs) + `daily_reports` scan (inspector photos/reports). Shows 4-column completion status (LEM/TK/PH/RPT checkmarks), Complete/Partial badges, filters by date/status/foreman. Click row → opens 4-panel view.

4. **ReconFourPanelView.jsx** — 2x2 grid fetching from 3 sources: `reconciliation_documents` for uploaded docs, `daily_reports` for inspector data, and `ticket-photos` bucket for inspector's ticket photo URLs. Each panel rendered by DocumentPanel.

5. **DocumentPanel.jsx** — Reusable panel with `panelType` prop (`uploaded`/`photo`/`report`):
   - Uploaded panels: PDF viewer (pdf.js canvas) or image viewer with zoom/rotate/page nav
   - Photo panel: auto-linked image with zoom/rotate — no upload button, contextual empty message
   - Report panel: routes to InspectorReportPanel — no upload button
   - **Fullscreen expand**: ⛶ button expands any panel to full-viewport overlay for detailed review. Color-coded header bar. ✕ to close.
   - Minimum 500px height per panel — grid scrolls vertically

6. **InspectorReportPanel.jsx** — Formatted read-only view of inspector report data: header (inspector, date, spread, activity, contractor, foreman, ticket #), manpower table (name, classification, RT, OT, JH, qty with totals), equipment table (type, unit #, hrs, qty with totals), work description

7. **PdfViewer.jsx** — pdf.js canvas renderer with page-by-page navigation. Fixed first-page-blank bug (canvas not mounted during loading state).

8. **ImageViewer.jsx** — Image renderer with ctrl+scroll zoom, click-to-fullscreen overlay

9. **Routes**: `/:orgSlug/reconciliation` (ticket list), `/:orgSlug/reconciliation/upload` (upload form with prefill params), `/:orgSlug/reconciliation/:ticketNumber` (4-panel view), `/:orgSlug/reconciliation-legacy` (old dashboard preserved)

10. **Variance Comparison Panel** (March 23, 2026) — Line-by-line reconciliation below the 4-panel document viewer:
    - **Fuzzy name matching** (`nameMatchingUtils.js`): 7-pass engine with confidence scoring — exact (1.0), last+initial (0.95), Levenshtein (0.85), nickname lookup with 34 canonical names (0.80), last name typo (0.70), reversed name order (0.75), initials (0.65). Equipment token overlap matching.
    - **Variance calculation** (`varianceCalculation.js`): per-worker RT/OT/DT hour and cost variance using LEM rates, color coding (green/yellow/orange/red), status icons
    - **VarianceSummaryBar**: three-card summary — LEM claimed, inspector verified, total variance with MATCH/MINOR/REVIEW/OVERBILLED status
    - **VarianceRow**: expandable rows — collapsed shows name/hours/cost/confidence dot, expanded shows full name comparison, RT/OT/DT breakdown, accept/dispute/adjust action buttons
    - **VarianceComparisonPanel**: orchestrates matching, renders labour + equipment sections, bulk actions (Accept All Matches, Flag All Variances), saves per-row decisions to `reconciliation_line_items` with audit logging
    - **reconciliation_line_items** table: stores accept/dispute/adjust decisions per line item with confidence, variance, and audit trail

11. **Admin Portal updates** — Ticket # column in Reports tab, Exports tab (separated from Reports), tab-aware back navigation, forced org filtering for super admins, "All time" date range option, "Pipeline Project" + "4-Way Reconciliation" title

### Three-Lane LEM Reconciliation with Editable Panel 4 & OCR Extraction (March 21, 2026)

**Extends LEM reconciliation to handle direct, indirect, and third-party cost streams with admin ticket entry, editable cost comparison, and automatic LEM billing extraction.**

1. **Three LEM categories** — `lem_category` column on `contractor_lem_uploads`: `direct` (field crew with inspector), `indirect` (overhead, office staff), `third_party` (subcontractors). Each category follows the same billing pipeline (upload → review → approve → invoice gate → invoice → payment) with different review workflows.

2. **Standalone ticket entry** (`TicketEntry.jsx`) — Admin/cost control form to enter signed contractor tickets that have no inspector report. Captures labour entries, equipment entries, ticket photo/scan uploads, rate card costing, signed-by tracking. Data stored in new `standalone_tickets` table with full RLS. Serves as the source of truth for indirect/third-party work.

3. **LEM Dashboard** (`LEMDashboard.jsx`) — Central LEM tracking at `/:orgSlug/lem-dashboard`. Organized by PO and contractor name. Filters by category (direct/indirect/third party), status, PO, contractor. Merges `contractor_lem_uploads` and `standalone_tickets` into a unified view showing ticket status, LEM status, and invoice status. Integrates TicketEntry for inline ticket creation.

4. **Editable Panel 4** — Replaces the read-only PDF embed in `LEMFourPanelView.jsx` with inline-editable labour/equipment tables:
   - When inspector report exists → shows inspector's entered data, editable with live rate card costing
   - When no inspector report → shows system-calculated costs from standalone ticket entry
   - Green/red highlighting for matched/unmatched rate card classifications
   - Running totals with variance display against LEM claimed amounts
   - Save button with full audit trail (all edits logged to `report_audit_log`)

5. **Four-panel layout (consistent across all lanes)**:
   - Panel 1: Contractor LEM (billing claim images + OCR-extracted data)
   - Panel 2: Contractor's ticket copy (returned with LEM)
   - Panel 3: Our copy (inspector's photo or admin's scan of the signed ticket)
   - Panel 4: Editable data + costs (inspector report or system-calculated)

6. **LEM billing OCR extraction** (`lemParser.js`) — New `extractLEMLineItems()` and `extractAllLEMLineItems()` functions using Claude Vision (claude-sonnet-4) to OCR LEM summary pages. Extracts structured billing data: employee names, classifications, RT/OT hours, rates, line totals, equipment types, unit numbers, hours, totals. Stored as `lem_claimed_data` JSONB on `lem_reconciliation_pairs`. Displayed in Panel 1 below the page image for instant numerical comparison.

7. **"Extract LEM Data" button** — Appears in the reconciliation header when pairs have LEM page images but no extracted billing data. Triggers Claude Vision OCR on all LEM summary pages, rate-limited with retry logic.

8. **Data Exports tab** — Moved Master Production Spreadsheet and Owner System exports (Power BI/SAP) from Reports tab to a dedicated Exports tab in the Admin Portal.

9. **Admin Portal fixes** — Ticket # column added to Reports tab, tab-aware back navigation (from=admin-{tab}), forced org filtering on all reconciliation queries for super admins.

**Route:** `/:orgSlug/lem-dashboard`

**Migration:** `20260321_lem_categories_and_standalone_tickets.sql` — lem_category, standalone_tickets table, ticket_source, standalone_ticket_id, lem_claimed_data

### FEED Intelligence Module v2 (March 19, 2026)

**Connects FEED (Front End Engineering Design) Class 3 estimates to actual LEM field spend for EPCM estimating accuracy tracking. v2 adds scope categories, WBS templates, EPCM accuracy grading, cross-project benchmarking foundation, and EPCM firm profiles.**

1. **6 database tables** — `feed_estimates` (amended with v2 columns: estimate_version, estimate_basis_year, contingency_pct, escalation_pct, approval_status, source_document_url, epcm_firm_id FK), `feed_wbs_items` (with scope_category for 10 standard pipeline WBS buckets), `feed_wbs_actuals`, `feed_risks`, `feed_risk_closeouts`, `epcm_firms` (Phase 2 foundation) — all org-scoped with RLS and super_admin bypass
2. **3 DB views** — `feed_wbs_variance` (per-item estimated vs actual, variance %, tagged LEM count), `feed_estimate_summary` (rolled-up totals, EPCM accuracy grade A/B/C/D based on ±5%/10%/20% thresholds, metadata for dashboard cards), `feed_category_benchmarks` (cross-project median/avg/min/max variance by scope category — Phase 2 foundation)
3. **FeedDashboard** — Main module entry point with 4-tab layout:
   - **Overview**: 4 metric cards (FEED total with class + version badges, actual LEM spend with "X of Y items tagged", variance $/% color-coded by band, EPCM accuracy grade A/B/C/D large letter), estimate metadata row (EPCM firm, class, version, basis year, contingency/escalation %, approval status badge, source document link), horizontal Recharts bar chart (estimated vs actual by WBS scope, color-coded by variance severity: green ±5%, amber ±15%, red >15%), risk register summary strip (open/closed/escalated counts with cost allowance totals)
   - **Estimate Setup**: Create/edit FEED estimate with v2 fields — EPCM firm (text + linked profile dropdown from `epcm_firms`), estimate class, version, basis year, contingency %, escalation %, approval status (draft/approved_for_FID/superseded), FEED report link, notes. Audit-logged on save.
   - **WBS & Costs**: Inline-editable WBS table with scope_category (10-type dropdown), add/delete/reorder rows, variance coloring (green/amber/red/gray), "Load template" button (standard 8-row pipeline template: mainline, HDD, road/water crossings, tie-ins, hydro test, mob/demob, environmental, PM/inspection), summary bar (total estimated, total actual, untagged spend, tagging progress), Tag LEMs button per row
   - **Risk Register**: Inline add/edit risks with category/severity badges, bulk status update, variance-to-allowance column (actual cost impact minus cost allowance, color-coded), closeout workflow
4. **FeedTagLEM** — Slide-over panel to tag/untag LEM line items to WBS scope items, with search by ticket/crew/activity/foreman and multi-select
5. **FeedRiskCloseout** — Modal form linking inspector reports to FEED risks with outcome (resolved/escalated/monitoring), actual cost impact, closed date, field notes. Auto-updates risk status on save
6. **Audit logging** — All FEED financial writes logged to `report_audit_log` via dedicated `feedAuditLogger.js` utility (action types: feed_estimate_upsert, feed_wbs_item_create/update/delete, feed_lem_tagged/untagged, feed_risk_create/update/delete, feed_risk_closeout). All actions marked `is_critical: true`, `regulatory_category: 'financial'`
7. **Route**: `/:orgSlug/feed` — accessible to exec, cm, pm, chief, chief_inspector, admin, super_admin
8. **Navigation**: "FEED Intelligence" button added to Dashboard header and EVM Dashboard header
9. **Phase 2 ready** — `epcm_firms` table and `feed_category_benchmarks` view are in place. Phase 2 will add EPCM firm profile management (`/epcm-firms`), cross-project accuracy scoring, and benchmark intelligence panel

### Contractor LEM Reconciliation System — Four-Way Comparison & Invoice Workflow (March 7, 2026)

**Complete LEM reconciliation system with four-way document comparison and two-stage invoice verification**

1. **Four-way reconciliation** — Each ticket is compared across four documents:
   - **Our Ticket Photo** — Inspector's original photo of the contractor's daily ticket (from `ticketPhotos` in activity blocks)
   - **Inspector Report** — Inspector's independent labour/equipment entries from OCR + manual input
   - **Their Copy** — Contractor's ticket page image extracted from the LEM PDF bundle
   - **LEM Billing Claim** — Contractor's billing line item from the LEM summary pages

2. **LEM PDF parser** (`lemParser.js`) — Processes contractor LEM PDF bundles:
   - Uses pdf.js (CDN) to render pages as JPEG images with landscape auto-rotation
   - Claude Vision API classifies each page as `lem_summary` or `daily_ticket`
   - Summary pages: extracts structured line items (ticket number, date, crew, labour/equipment entries with rates)
   - Ticket pages: extracts ticket number and stores page image for four-way comparison
   - Batch processing: 5 pages per API call to manage token limits

3. **Three-strategy matching engine** (`lemMatcher.js`):
   - Strategy 1: Exact ticket number match
   - Strategy 2: Normalized ticket number match (strips prefixes like "Ticket", "TKT", "DT", "#")
   - Strategy 3: Date + crew name fallback when ticket numbers don't match
   - Per-person and per-equipment variance calculation (hours, headcount, costs)

4. **Ticket number normalizer** (`ticketNormalizer.js`):
   - Strips common prefixes (ticket, tkt, dt, fl, #, no.)
   - Handles format variations (dashes, spaces, leading zeros)
   - Used by both matching engine and ticket image linking

5. **LEM Upload widget** (`LEMUpload.jsx`):
   - Contractor name, period dates, LEM reference number inputs
   - PDF upload with parse preview showing extracted line items
   - On save: uploads PDF to storage, creates parent `contractor_lem_uploads` record, uploads ticket page images, creates `lem_line_items` with `contractor_ticket_url` linked via normalized ticket number

6. **Reconciliation dashboard** (`LEMReconciliation.jsx`):
   - LEM list view with status badges and invoice status tracking
   - LEM detail view with per-ticket matching results
   - Four-panel review for each ticket (photo | inspector data | contractor copy | billing claim)
   - Resolution options: accept_lem, accept_inspector, split, dispute, ticket_altered (new — flags when contractor's copy differs from inspector's original photo)
   - Approve reconciliation → unlocks invoice upload

7. **Two-stage invoice workflow**:
   - **Gate**: Invoice upload only available for LEMs with status `approved`
   - **Invoice Upload** (`InvoiceUpload.jsx`): Claude Vision parses invoice totals, auto-compares against linked LEM's reconciled totals
   - **Invoice Comparison** (`InvoiceComparison.jsx`): Side-by-side reconciled vs. claimed with variance indicators, approve/reject/mark-paid actions
   - Invoice status: uploaded → parsed → matched → approved → rejected → paid

8. **Database tables**: `contractor_lem_uploads`, `lem_line_items`, `contractor_invoices` — all with RLS policies and organization scoping

9. **Storage buckets**: `lem-uploads` (LEM PDFs + ticket images), `contractor-invoices` (invoice PDFs)

10. **Integration**: New "Contractor LEMs" tab (brown) on Reconciliation Dashboard

**Files Created:**
```
src/utils/lemParser.js            # PDF→images, Claude Vision OCR, page classification
src/utils/lemMatcher.js           # Three-strategy matching + variance calculation
src/utils/ticketNormalizer.js     # Ticket number normalization
src/components/LEMUpload.jsx      # LEM upload widget
src/components/LEMReconciliation.jsx  # Four-way reconciliation dashboard
src/components/InvoiceUpload.jsx  # Invoice upload with reconciliation gate
src/components/InvoiceComparison.jsx  # Invoice comparison + approve/reject/pay
supabase/migrations/20260307_create_lem_reconciliation_tables.sql
supabase/migrations/20260307_lem_four_way_and_invoices.sql
```

**Files Modified:**
```
src/ReconciliationDashboard.jsx   # Added "Contractor LEMs" tab + LEMReconciliation component
```

---

### LEM Pairing Fix, Report Matching, Admin Search, Ticket Thumbnails (March 11, 2026)

**Fixed LEM pair classification/grouping, report matching scoring, admin portal search, and ticket photo thumbnails**

1. **LEM pairing fix** (`lemParser.js`) — Demo PDF produced 20 pairs instead of 10 because date-based matching was used even when pages alternated LEM→ticket cleanly. New `alternatesCleanly` check detects this pattern and uses adjacency pairing. Added content-marker classification (lem_score/ticket_score for 11 LEM markers, 7 ticket markers) to replace word-count-only heuristic. Added post-classification inheritance: ambiguous continuation pages (equipment overflow, extra rows) inherit type from the previous page. Cleaned `extractCrewFromText` to stop at "Date:", double-spaces, and date patterns (was capturing "SOMERVILLE AECON   Date:   2026-03-06  T" as crew name).

2. **Score-based report matching** (`LEMFourPanelView.jsx`) — Replaced first-match-wins matching with scored candidate ranking. Crew name quality: exact=10, multi-word overlap=5+, single-word=3, first-word=1. Bonuses: +2 for `pdf_storage_url`, +1 for ticket photos, +10 for date+crew over date-only. This ensures report 1995 (exact "SOMERVILLE AECON" + has PDF) beats report 1993 (loose "Somerville" match, no PDF).

3. **Panel 4 → PDF embed** (`LEMFourPanelView.jsx`) — Replaced inspector data table with `InspectorReportPanel` that embeds the matched report's `pdf_storage_url` via iframe. Shows report date, inspector name, and "Open PDF" link.

4. **Admin portal search** (`AdminPortal.jsx`) — Added search bar to the Reports tab. Filters by inspector name, date, spread, or activity/contractor. Name matches rank first in results, then sorted by date descending. Shows "X of Y reports" count.

5. **Reports page timing fix** (`ReportsPage.jsx`) — `fetchReports()` fired on mount before `organizationId` or `isSuperAdmin` resolved, returning zero reports for super admins. Now waits for org context.

6. **Ticket photo thumbnails** (`ActivityBlock.jsx`) — Replaced the green "Ticket photo attached" text box with actual clickable thumbnail images. Single photo: 120×160px. Multi-page: 80×106px side by side. Click opens the existing fullscreen modal. Works for new uploads (File objects) and saved photos (URLs).

7. **Image orientation preserved** (`lemParser.js`) — Removed forced landscape-to-portrait rotation in `renderPageToImage`. Pages render in original orientation. `ImagePanel` uses `maxWidth` with `height: auto` instead of fixed width.

8. **Background image upload** (`lemParser.js`) — `saveParsedPairs` saves DB records immediately (no images), then kicks off `uploadPairImagesInBackground` which renders pages and patches each pair record with URLs. User navigates to the four-panel view without waiting for image uploads.

**Files Modified:**
```
src/utils/lemParser.js              # Content-marker classifier, continuation inheritance, adjacency pairing, crew extraction cleanup, background upload
src/components/LEMFourPanelView.jsx # Score-based matching, InspectorReportPanel (PDF embed), image orientation
src/components/LEMReconciliation.jsx # Report loading debug logs, pdf_storage_url in queries
src/components/LEMUpload.jsx        # Save flow: immediate DB insert + background image upload
src/AdminPortal.jsx                 # Search bar on Reports tab
src/ReportsPage.jsx                 # Org context timing fix
src/ActivityBlock.jsx               # Ticket photo clickable thumbnails
```

---

### Visual Four-Panel LEM Reconciliation — Zero API Classification (March 8, 2026)

**Replaced Claude Vision classification with text-based regex matching and implemented visual four-panel reconciliation UI**

1. **Zero API classification** (`lemParser.js` rewrite) — Eliminated all Claude API calls for page classification:
   - Uses pdf.js `getTextContent()` to extract text from each PDF page
   - 22 LEM regex patterns (L.E.M., rate/amount, subtotals, $amounts, billing, cost codes, PO numbers)
   - 23 ticket regex patterns (daily ticket, foreman, inspector signature, start/end time, weather, unit numbers)
   - Date extraction (4 format patterns), crew name, ticket number, LEM number via regex
   - Processes 600 pages in seconds with zero rate limits
   - Images rendered only for the four-panel viewer, not for classification

2. **Visual four-panel comparison** (`LEMFourPanelView.jsx`):
   - Left sidebar: pair list grouped by date, status filters (all/pending/accepted/disputed/skipped), progress bar
   - Panel 1: Contractor LEM page images (zoomable, multi-page scroll, click-to-fullscreen)
   - Panel 2: Contractor Daily Ticket images (same zoom/scroll behavior)
   - Panel 3: Our Ticket Photo (from inspector's `ticketPhotos` in matched activity block)
   - Panel 4: Inspector Report PDF (embedded via iframe from `pdf_storage_url`, with date/inspector label and "Open PDF" link)
   - Score-based report matching: crew name quality (exact=10, multi-word=5+, single-word=3), PDF availability bonus (+2), ticket photo bonus (+1), date+crew bonus (+10)
   - Resolution bar: Accept, Dispute-Variance, Dispute-Ticket Altered, Skip, with inline notes
   - Keyboard navigation: A=Accept, N/Arrow=Next, Arrow Left=Previous
   - Auto-advance to next pending pair after resolution
   - Undo support for resolved pairs

3. **LEMReconciliation.jsx rewrite** — Replaced old field-extraction-based line items view:
   - Loads `lem_reconciliation_pairs` instead of `lem_line_items`
   - Clicking a LEM upload opens the four-panel visual reconciliation view
   - "Approve Reconciliation" requires all pairs reviewed (none pending)
   - Inspector Reports sub-view with rate card costs preserved

4. **LEMUpload.jsx update** — Preview shows pair summary table (date, crew, LEM pages, ticket pages) instead of extracted line items

5. **Database** — New `lem_reconciliation_pairs` table with pair_index, work_date, crew_name, lem_page_urls/contractor_ticket_urls (JSONB), matched_report_id, resolution status/notes

**Files Created:**
```
src/components/LEMFourPanelView.jsx           # Four-panel visual comparison
supabase/migrations/20260308_lem_visual_reconciliation.sql  # lem_reconciliation_pairs table
```

**Files Modified:**
```
src/utils/lemParser.js              # Rewritten: text extraction + regex classification (zero API calls)
src/components/LEMReconciliation.jsx # Rewritten: visual four-panel approach with pair-based workflow
src/components/LEMUpload.jsx         # Updated: pair preview instead of line items
```

---

### Metres Previous Fix, Multi-Weld Counterbore, Trackable Item & Stricter Health Score (March 6, 2026)

**Four QA fixes from field testing: metres previous not populating for Tie-in, multi-weld support in counterbore log, new trackable item type, and stricter health score**

1. **Metres Previous fix** — `fetchPreviousMeters()` queried column `activities` but the actual DB column is `activity_blocks`. Also read `report.activities` instead of `report.activity_blocks`. Fixed both. Additionally eliminated double-counting: previously added BOTH KP-calculated metres AND stored `metersToday`. Now uses `metersToday` first, falls back to KP calculation only when metersToday is 0 (matching ActivityBlock.jsx logic).

2. **Multi-weld CounterboreTransitionLog** — Converted from single flat weld fields to a `welds[]` array. Each weld renders as a collapsible card with its own: weld info (number, welder ID/name, WPS, preheat/interpass temps, location), counterbore/transition toggle with diagram and transitions table, NDT section, and repair section. "+ Add Weld" button (blue, matches existing patterns). Remove button on each weld (red, guarded — cannot remove last weld). Global comments field stays at the bottom shared across all welds. **Backward compatibility:** On mount, if `data.welds` doesn't exist but flat fields do, auto-migrates into `welds: [{...existingFields}]`.

3. **Counterbore/Transition trackable item (#14)** — New item type in `TrackableItemsTracker.jsx` with fields: weld_number, upi_type (Counterbore/Transition/Both), kp_location, quantity, status (Completed - Accepted/Rejected, In Progress, Pending), notes. Pre-submit reminder updated to include "Counterbore/Transition" in the trackable items checklist.

4. **Stricter Health Score** — Added new "Report Completeness" category (15% weight) checking: Safety Notes filled, Land/Environment Notes filled, at least 1 visitor logged. Each missing item generates a specific guidance message. Redistributed weights: Photo Completeness 25%→20%, Directive 050 20%→15%, Field Completeness 20% (unchanged), Chainage Integrity 15% (unchanged), Labour/Equipment 10% (unchanged), Mentor Alert Resolution 10%→5%, Report Completeness 15% (NEW). Report-level data (`safetyNotes`, `landEnvironment`, `visitors`) now passed to `computeHealthScore()`.

5. **PDF export updated** — Counterbore/Transition section now iterates over the `welds` array with per-weld headers. Handles both old flat format and new array format for backward compatibility with existing saved reports.

**Field Guide updated to v4.8** — Multi-weld counterbore, new trackable item, stricter health score, metres previous fix.

**Files Modified:**
```
src/InspectorReport.jsx           # fetchPreviousMeters fix, health score reportData, PDF multi-weld, trackable items reminder
src/CounterboreTransitionLog.jsx  # Full rewrite: multi-weld array with collapsible cards, backward compat migration
src/TrackableItemsTracker.jsx     # counterbore_transition item type (#14)
src/agents/ReportHealthScorer.js  # scoreReportCompleteness (15%), redistributed weights
pipe-up-field-guide-agent-kb.md   # v4.7 → v4.8
```

---

### Capital Variance Index (CVI) Engine — `pipe-up-automation/cvi_engine.py` (March 3, 2026)

**Standalone proof-of-concept that calculates a single headline metric (CVI = Approved Capital / EAC_adjusted) telling a VP whether the project will finish over budget and by how much. Extends standard EVM by including schedule-driven indirect cost growth.**

1. **`cvi_engine.py`** — Single-file calculation engine (stdlib only, no dependencies):
   - **EVM pipeline:** BCWS/BCWP/ACWP → CV/SV/CPI/SPI → EAC_direct (CPI floored at 0.7)
   - **Indirect cost growth:** SPI < 1.0 triggers schedule overrun → daily indirect rate × overrun days
   - **CVI metrics:** CVI_overall, CVI_direct, CVI_indirect, capital_exposure, projected_end_date
   - **Phase-level CVI:** 10 phases with individual CPI/SPI/EAC/CVI and status (GREEN/AMBER/RED)
   - **Trend analysis:** 7d/14d/30d deltas with direction (improving/worsening/stable)
   - **Alert engine:** 5 rules (capital at risk, declining trend, schedule overrun, phase over budget, indirect growth critical)
   - **Demo mode:** 180 days of simulated data with logistic S-curve, 4 discrete events (rain, rock, env window, scope change), phase-specific multipliers, Gaussian noise, seeded (42) for reproducibility
   - **Health status thresholds:** GREEN ≥0.95, AMBER ≥0.85, RED <0.85 (matches `evmCalculations.js`)

2. **CLI:**
   ```
   python cvi_engine.py --demo                        # Generate 180 days of simulated data
   python cvi_engine.py --demo --dry-run              # Preview demo without writing files
   python cvi_engine.py --input data/daily_evm.json   # Process real EVM data file
   python cvi_engine.py --date 2026-03-01             # Override calculation date
   ```

3. **Output files:**
   - `data/cvi_dashboard.json` — Dashboard-ready JSON (summary, evm, phases, alerts, trends, history) for future React widget
   - `data/cvi_history.json` — Append-only daily snapshots (idempotent by date, capped at 365 entries)
   - `data/cvi_project_config.json` — Project budget config ($200M sample data, replace with real numbers)

4. **Future:** React dashboard widget consuming `cvi_dashboard.json` (not yet implemented).

### Regulatory Compliance Automation — `pipe-up-automation/` (March 3, 2026)

**Standalone Python script that takes a daily contractor PDF work plan + KML pipeline route and generates a regulatory compliance map and Word report.**

1. **`generate.py`** — Single-file automation script (11-step pipeline):
   - **Steps 1-4:** Finds PDF, parses KML (regex-based, handles chainage format placemarks), extracts crew data from PDF tables, extracts KP locations via 4 regex patterns
   - **Step 5:** Interpolates KP values to lat/lng coordinates using 737 chainage reference points
   - **Step 6:** Categorizes crew activities (crew name priority, 17 keyword categories)
   - **Step 7:** Cross-references all crew KP locations against regulatory zones (7 types: fisheries, environmental, ground disturbance, invasive species, safety, timing restriction, water management)
   - **Step 8:** Generates compliance alerts with severity classification (HIGH/MEDIUM/LOW). Alerts include crew names, inspector names, and KP locations in detail text. Alert types: fisheries window closing (with day count), pending GD permits, archaeological monitor zones, active safety zones, environmental restrictions
   - **Step 9:** Generates self-contained HTML map (Leaflet.js, dark CartoDB tiles, zone overlays, crew markers, alert markers with pulse animation, sidebar with toggleable layers and zone detail cards)
   - **Step 10:** Generates Word compliance report (python-docx) matching Feb 27 reference format:
     - **Summary page:** Pipe-separated subtitle, UPPERCASE stat headers, contextual summary paragraph with crew/zone percentages
     - **7 numbered Heading 2 sections** in fixed order: (1) Compliance Alerts, (2) Fisheries Timing Windows, (3) Environmental Sensitive Areas, (4) Ground Disturbance Permits, (5) Safety Exclusion Zones, (6) Invasive Species Management, (7) Complete Crew-Zone Intersection Log
     - **Section intros** with zone counts and intersection counts
     - **Type-specific table headers:** CROSSING (fisheries), ESA (environmental), PERMIT (GD), CONDITIONS (GD)
     - **Crew sub-tables** only for fisheries and environmental (headers: CREW, KP, ACTIVITY, ZONE)
     - **Safety & invasive** rendered as paragraphs, not tables
     - **Status format:** Single line with em dash (e.g., "OPEN — CLOSES IN 2 DAYS")
     - **Audit log:** 5 columns (CREW, KP, ZONE, RESTRICTION, STATUS)
     - **Signature block:** PREPARED BY / REVIEWED BY with Name/Signature/Date fields
     - **Disclaimer:** Auto-generation notice
     - Arial throughout, navy Heading 2 headers, color-coded status cells, alternating row shading, page numbering
   - **Step 11:** Clean terminal output
   - **Module-level constants:** `SECTION_ORDER` (fixed section rendering order), `SECTION_CONFIG` (per-type headings, column headers, format flags, crew table visibility)

2. **Design decisions:**
   - Regex-only KML parsing (avoids lxml namespace failures from `xsi:schemaLocation`)
   - All 3 KML LineStrings concatenated for complete centerline
   - Out-of-range KPs (e.g., "101+200") filtered to 0-38.5 range
   - Windows compatible (pathlib throughout, no shell commands)
   - CLI: `python generate.py` (most recent PDF) or `python generate.py --date 2026-02-27`

3. **Data files:**
   - `data/regulatory_zones.json` — Regulatory zones (14 hand-authored + ~193 AI-parsed from 22 BCER permits) with type, KP range, restriction text, status, authority. Generated by `parse_permits.py`
   - `data/zones_needing_review.json` — Zones flagged `needs_kp` for manual KP entry. Generated by `parse_permits.py`
   - `data/doc.kml` — Pipeline route with 737 chainage placemarks + 3 centerline LineStrings
   - `config.json` — Project name, KP range [0, 38.5], map center, paths

4. **Future:** Brief 2 (`Claude_Code_Brief_2_Minimap_Zones.md`) defines regulatory zone overlay for the inspector's in-app minimap (React/Leaflet component). Not yet implemented.

### BCER Permit Parser — `pipe-up-automation/parse_permits.py` (March 3, 2026)

**Parses all 22 BCER permit PDFs and extracts every location-specific regulatory condition into `regulatory_zones.json`.**

1. **`parse_permits.py`** — Regex + AI hybrid pipeline:
   - **PDF extraction:** `pdfplumber` text extraction with scanned-PDF detection
   - **Condition splitting:** Regex-based numbered condition parser with section heading tracking (handles BCER format variations: "7. text", "2.1.1 text", lettered sub-conditions)
   - **Classification:** 7 zone types (fisheries, environmental, ground_disturbance, invasive_species, safety, timing_restriction, water_management) via section heading mapping + keyword scanning
   - **KP extraction:** 4 regex patterns (KP+chainage, bare chainage, whole KP, km notation) with 0–38.5 range filtering
   - **Named location detection:** Regex detects proper noun + feature type (Creek, River, Lake, etc.) without KP data → flags `needs_kp: true` for manual entry
   - **Timing window extraction:** Extracts date ranges ("March 1 – June 30", "MM/DD to MM/DD") with deduplication
   - **Date-based status calculation:** Compares today's date against timing windows → `RESTRICTION ACTIVE` (inside window), `OPEN` (outside), `status_detail: "CLOSES IN X DAYS"` (7-day warning). Falls back to keyword detection for zones without timing windows
   - **Coordinate extraction:** UTM Zone 10 and lat/long patterns
   - **Deduplication:** Merges zones with same name + type + overlapping KP range, keeps longest restriction text, combines timing windows

2. **AI-assisted extraction** (`--ai` flag):
   - Sends each condition to Claude API for enrichment (per-condition, not per-page)
   - AI provides: better zone names, classification, concise restriction summaries, `needs_kp` detection, boilerplate filtering (`skip: true`)
   - **Merge strategy:** AI wins for name/type/restriction/needs_kp; regex wins for timing_windows/coordinates
   - **Models:** `--model haiku` (default, ~$0.09/run) or `--model sonnet` (~$1.05/run)
   - **Error handling:** Graceful fallback on missing package, missing API key, 401 (disables AI for run), 429 (exponential backoff 2s→4s→8s), invalid JSON (3 retries)
   - **Results:** 249 regex zones → 193 AI zones (529 boilerplate conditions filtered), 53 zones flagged `needs_kp`

3. **CLI:**
   ```
   python parse_permits.py                      # Regex-only
   python parse_permits.py --ai                  # AI-assisted (haiku)
   python parse_permits.py --ai --model sonnet   # AI-assisted (sonnet)
   python parse_permits.py --ai --dry-run        # Preview without writing
   python parse_permits.py --keep-existing        # Preserve hand-authored zones
   ```

4. **Output files:**
   - `data/regulatory_zones.json` — Full zone database (zones, zone_type_config, permits metadata)
   - `data/zones_needing_review.json` — Zones needing manual KP entry (name, source_document, source_page, raw_text, needs)

5. **Dependencies added:** `anthropic>=0.40.0`, `python-dotenv>=1.0.0` (both optional — regex-only works without them)

---

### MatTracker Consolidation into TrackableItemsTracker (March 1, 2026)

**Eliminated duplicate mat tracking system by consolidating MatTracker into TrackableItemsTracker**

1. **MatTracker removed** — `MatTracker.jsx` was imported in InspectorReport but never rendered (dead code). The `mat_transactions` table was empty and has been dropped. Deleted the file and removed the import.

2. **Mats fields enhanced** — Added richer fields from MatTracker to the mats config in TrackableItemsTracker: `mat_material` (Wood, CLT, Composite, HDPE), `from_location`, `to_location`, `crew`, `4x12` size option, and `Damaged/Lost` action.

3. **Admin Portal Mat Inventory redirected** — The Mat Inventory tab now queries `trackable_items` (filtered by `item_type = 'mats'`) instead of the empty `mat_transactions` table. Updated action badge colors for `Damaged/Lost`.

4. **Reconciliation Dashboard updated** — Added `Damaged/Lost` to `RETRIEVE_ACTIONS` so damaged/lost mats subtract from net on-site count. Added `mat_material` column to mats detail table.

5. **Database migration** — Added `mat_material`, `from_location`, `to_location`, `crew` columns to `trackable_items` table.

**Files Modified:**
```
src/TrackableItemsTracker.jsx     # TRACKABLE_DB_COLUMNS + mats field config enhanced
src/AdminPortal.jsx               # fetchMatData → trackable_items, Damaged/Lost badge
src/ReconciliationDashboard.jsx   # RETRIEVE_ACTIONS + mat_material column
src/InspectorReport.jsx           # Removed dead MatTracker import
src/MatTracker.jsx                # DELETED
supabase/migrations/20260301141022_add_mat_tracker_columns_to_trackable_items.sql
supabase/migrations/20260301142500_drop_mat_transactions.sql
```

---

### Trackable Items Reconciliation Tab & Duplicate Report Prevention (March 1, 2026)

**Added Trackable Items tab to Reconciliation Dashboard and fixed data integrity issues**

1. **Trackable Items tab** — New teal tab on Reconciliation Dashboard gives admins a centralized view of all 13 trackable item categories for billing reconciliation. Includes category filter chips, summary cards (with deploy/retrieve/net for inventory types), detail table with type-specific columns per category, and an inventory net position panel showing what's still on-site.

2. **Duplicate report warning** — Before saving a new report, the system checks if the inspector already has a report for the same date and spread. Same-date/same-spread: strong warning with report list, suggesting they edit the existing report. Same-date/different-spread: lighter notice reminding them not to double-log trackable items across reports.

3. **Race condition fix (TrackableItemsTracker)** — Fixed a bug where tabbing through fields on a new trackable item would fire multiple INSERT calls before the first completed, creating duplicate rows with partial data. Added a `savingRef` guard to prevent concurrent INSERTs for the same temp item, plus a post-INSERT flush to persist field changes made during the in-flight INSERT.

4. **Data cleanup** — Removed 18 orphan trackable item rows (report_id = NULL) caused by the race condition, merging their data into proper rows where applicable. Removed 3 throwaway duplicate reports and 3 duplicate trackable items from Feb 26.

**Files Modified:**
```
src/ReconciliationDashboard.jsx  # Trackable Items tab (constants, state, query, tab button, full content block)
src/InspectorReport.jsx          # Duplicate report warning before save
src/TrackableItemsTracker.jsx    # Race condition fix (savingRef guard + post-INSERT flush)
```

---

### PDF Printing Fixes — Corrine Barta QA (March 1, 2026)

**Fixed missing PDF fields for Grading quality checks, Ditch specifications, equipment classifications, and trackable items**

1. **Dozer D9 classification added** — Added `Dozer - D9 (or equivalent)` to equipment types. Previously only D9T existed.

2. **Grading quality checks — section headers added** — ROW Conditions, Pile Separation, Drainage, and Topsoil Status were rendering as unlabeled 6pt text. Added proper labeled sub-headers (orange bars at 7pt) with full field labels (e.g., "Spec" → "Specified Width", "Controls" → "Drainage Controls Installed", "Separation" → "Separation Distance").

3. **Ditch specifiedWidth added to PDF** — The Specified Width field existed in DitchLog form but was missing from the PDF trench specifications. Now renders as "Spec Width: {value}m".

4. **Trackable items — all fields now print** — Expanded PDF descriptions for all 13 trackable item types to include every field. Previously missing: fencing (purpose, side, gates, landowner), ramps (mats_used, mat_count), goalposts (clearance, danger sign, reflective, grounding, offset), equipment cleaning (cleaning type, location, station KP, inspector, biosecurity, weed wash cert, photo, contractor), hydrovac (depth), erosion (watercourse), extra depth (extra_depth_amount, in_drawings). All types now use conditional rendering to avoid empty pipe-delimited segments.

**Files Modified:**
```
src/constants.js              # Added Dozer - D9 (or equivalent)
src/InspectorReport.jsx       # Grading section headers, Ditch specifiedWidth, trackable items expanded descriptions
```

---

### AIAgentStatusIcon Scoping (March 1, 2026)

**Critical issues button now scoped to authorized portals only**

1. **Removed from** — Dashboard (general CMT), WeldingChiefDashboard, NDTAuditorDashboard
2. **Inspector filtering** — AIAgentStatusIcon accepts `inspectorUserId` prop. When provided, fetches that inspector's report dates and filters flags to only show issues from their own reports. Applied to InspectorReport and MyReports.
3. **Org-wide view retained** — ChiefDashboard, AssistantChiefDashboard, and AdminPortal continue to see all org flags.

**Files Modified:**
```
src/components/AIAgentStatusIcon.jsx  # Added inspectorUserId prop and report date filtering
src/Dashboard.jsx                     # Removed AIAgentStatusIcon
src/WeldingChiefDashboard.jsx         # Removed AIAgentStatusIcon
src/NDTAuditorDashboard.jsx           # Removed AIAgentStatusIcon
src/MyReports.jsx                     # Added inspectorUserId={user?.id}
src/InspectorReport.jsx               # Added inspectorUserId={userProfile?.id}
```

---

### OfflineStatusBar Fix (March 1, 2026)

**Green "Online" badge no longer obscures page headers**

- OfflineStatusBar now only renders when offline or when pending sync items exist. Previously rendered as a fixed green bar at z-index 9999 at all times, obscuring Admin Portal/Reconciliation headers.

**Files Modified:**
```
src/components/OfflineStatusBar.jsx   # Added showBar conditional, returns null when online with no pending items
```

---

### UPI → Trackable Items Rename (March 1, 2026)

**All user-facing references to "UPI" and "Unit Price Items" renamed to "Trackable Items"**

- UI labels: "unit price item categories" → "trackable item categories", "Pay Items (UPIs)" → "Trackable Items", "UPI Type" → "Item Type"
- PDF headers and summary text updated
- Field guide updated and re-indexed
- Database column names (`unit_price_data`, `upi_type`, `weld_upi`) preserved for backward compatibility

**Files Modified:**
```
src/UnitPriceItemsLog.jsx         # UI string renames
src/InspectorReport.jsx           # PDF header and summary text
src/DitchInspection.jsx           # Section header
src/ReportViewer.jsx              # Heading renames
src/ReconciliationDashboard.jsx   # Section titles, table headers
src/TrackableItemsTracker.jsx     # Field label "UPI Type" → "Item Type"
pipe-up-field-guide-agent-kb.md   # Documentation updates
```

---

### Hydrostatic Testing Log Build-Out (March 1, 2026)

**Replaced HydrotestLog stub with full 9-section inspection form**

1. **Test Identification** — testSection, testMedium (Water/Air/Nitrogen), testType (Strength/Leak/Combined)
2. **Pressure Parameters** — designPressure, testPressure, startPressure, finalPressure, pressureDropPSI (auto-calculated kPa→PSI), maxAllowableDrop
3. **Duration & Timeline** — holdTime, fillStartTime, fillEndTime, testStartTime, testEndTime
4. **Water Management** — waterSource, waterVolume, waterDischargeLocation, waterDischargePermit, waterTemperature
5. **Instrumentation** — gaugeId, recorderType, calibrationDate, calibrationCertificate
6. **Pressure Readings** — Repeatable table (time, pressure kPa, temperature °C, notes) with add/remove
7. **Personnel** — testEngineer, testWitness, witnessCompany
8. **Test Result** — Color-coded banner (green=Pass, red=Fail, orange=Pending) with conditional failure fields (failureReason, leaksFound, leakLocation, leakRepairMethod)
9. **Sign-Off & Comments** — ncrRequired, comments

- Theme color: #3f51b5 (indigo). Follows PilingLog pattern (useActivityAudit, ShieldedInput, audit handlers).
- PDF export expanded with all 9 sections including pressure readings table and color-coded result banner.
- ActivityBlock passes logId and reportId props for audit trail.

**Files Modified:**
```
src/HydrotestLog.jsx              # Complete rewrite from stub
src/ActivityBlock.jsx             # Added logId/reportId props to HydrotestLog
src/InspectorReport.jsx           # Expanded hydrostatic testing PDF export
pipe-up-field-guide-agent-kb.md   # Hydrostatic Testing entry expanded
```

---

### Pipeline Names & Welding Label Rename (February 24, 2026)

**Pipeline dropdown now shows geographic names instead of KP ranges; "Weld UPI Items" renamed to "Welding" throughout**

1. **Pipeline dropdown — geographic names** — Pipeline selector now shows meaningful names (Coquitlam Start, Indian Arm, Mid-Route, Woodfibre Approach) instead of raw KP ranges. Old KP-range values in saved reports and drafts are automatically migrated to new names on load. Weather lookup, PDF, and spread auto-population all work with the new names.

2. **KP discrepancy warning** — A small orange warning appears below the Pipeline dropdown when any activity block's work KPs fall outside the selected pipeline segment's KP range.

3. **Weld UPI Items → Welding** — Renamed the trackable item label from "Weld UPI Items" to "Welding" in: TrackableItemsTracker section header, PDF export type labels, pre-submit reminder banner, and submit confirmation modal.

**Field Guide updated** — Welding label updated (6 instances), pipeline naming documented.

**Files Modified:**
```
src/constants.js                  # pipelineLocations keys → geographic names + kpStart/kpEnd, spreadToPipeline updated, pipelineMigrationMap added
src/InspectorReport.jsx           # Import pipelineMigrationMap, migration in restoreDraft + populateFormFromReport, KP discrepancy warning, Weld UPI Items → Welding (3 places)
src/TrackableItemsTracker.jsx     # Label '⚙️ Weld UPI Items' → '⚙️ Welding'
pipe-up-field-guide-agent-kb.md   # Weld UPI Items → Welding (6 instances)
```

---

### Data Persistence & Report Quality Fixes (February 24, 2026)

**Fixed chainage/field data disappearing on reload, health score false positives, PDF quality gaps, and filename sort order**

1. **Data persistence fix** — Fixed multiple fields being lost during save/reload cycle. Draft auto-save now clears `ticketPhotos` (File objects) to prevent localStorage corruption. Added `ticketNumber`, `metersToday`, `metersPrevious`, `metersToDate`, `systemicDelay`, and `conventionalBoreData` to the Supabase save flow (processedBlocks). Added `metersToDate`, `systemicDelay`, and `conventionalBoreData` to the edit-mode load flow.

2. **Chainage health score fix** — Health Score previously reported 100% chainage integrity when no KP values were entered. Now detects blocks with an activity type but missing Start/End KP and scores accordingly. The chainage overlap check button also now warns when no KP data is entered instead of falsely reporting "no overlaps detected."

3. **Quality checks PDF fix** — Quality check data was not printing in PDF exports. Removed the `qualityFieldsByActivity` gate that silently skipped blocks without defined field schemas. Added raw data fallback when structured rendering produces nothing.

4. **Safety Recognition & Wildlife Sighting PDF fix** — Added 8 missing fields to Safety Recognition PDF output (causeType, incidentNumber, dialogueOccurred, dialogueComment, questionsAsked, responses, supervisorSignoff, acknowledged). Added 4 missing fields to Wildlife Sighting PDF output (date, speciesDetail, inspector, crew).

5. **Date-first report filenames** — PDF and Excel download filenames now start with the date for proper chronological sort order (e.g., `2026-02-24_Backfill_PipeUp12345.pdf` instead of `PipeUp_Report12345_2026-02-24.pdf`).

**Files Modified:**
```
src/InspectorReport.jsx           # Draft ticketPhotos null, processedBlocks save fields, populateFormFromReport load fields, quality checks PDF gate, safety/wildlife PDF fields, filename format
src/agents/ReportHealthScorer.js  # Chainage integrity scoring for missing KP data
```

---

### PDF Export — Work Photos, Coating Quality Checks, Counterbore Log & Quality Fix (February 24, 2026)

**Added work photo thumbnails to PDF, complete Coating inspection sections, Counterbore/Transition rendering, fixed duplicate quality checks, fixed Metres Today, and updated Coating weld identification fields**

1. **Work photo thumbnails in PDF** — Work photos uploaded by inspectors now appear as 30×22mm thumbnail images in the PDF for all activity types. Each photo row shows the image with KP location and description beside it. Gracefully handles missing or failed images with a `[Photo unavailable]` placeholder. Required converting the activity block loop from `forEach` to `for...of` to enable `await` for image fetching.

2. **Metres Today PDF fix** — PDF showed "0" for Metres Today when the value was auto-calculated from Start/End KP rather than manually entered. Added the same KP-based fallback calculation used by the web UI (`Math.abs(endKP - startKP)` via `parseKPToMetres()`).

3. **Coating weld identification field improvements** — Diameter changed from free text to NPS dropdown (4"–42") matching Stringing. Grade changed from free text to dropdown (X42–X80) matching Stringing. Wall header now shows units (mm). "Co." renamed to "Coating Co." for clarity (auto-fills with contractor name).

4. **Complete Coating quality checks in PDF** — The Coating activity PDF section only rendered the weld identification table. Added rendering for all 8 remaining CoatingLog sections: Ambient Conditions (table with up to 3 readings), Surface Prep & Blasting (per-weld with profile depths), Coating Material, Preheat & Application, Inspection & Holiday Detection (DFT readings ×6, jeeps, low mils), Repairs (with repair thickness readings), Cure Tests (table), and Sign-Off (NCR status, inspector notes).

5. **Counterbore/Transition log added to PDF** — Welding - Tie-in activities now render the full Counterbore/Transition log: weld info (welder ID/name, WPS, preheat/interpass temps, location type), diagram values (bore length, taper angle, transition WT, bevel angle), transition records table (ovality, wall thickness, taper, bore length, accept/reject), NDT results, repair info, and comments.

6. **Duplicate quality check section removed** — There were two quality check rendering sections in the PDF. The structured section (using `qualityFieldsByActivity` with proper labels) was correct. A second "raw fallback" section was rendering the same data again with auto-generated camelCase-to-display labels. Removed the duplicate to prevent double-printed quality data.

**Field Guide updated to v19** — PDF Export section updated to document work photos, all Coating quality sections, Counterbore/Transition rendering, and structured quality check rendering. Coating and Welding - Tie-in specialized log descriptions expanded. Re-indexed (37 chunks, 0 embedding errors).

**Files Modified:**
```
src/InspectorReport.jsx           # Work photo thumbnails, Metres Today KP fallback, Coating quality sections PDF, Counterbore/Transition PDF, weld table header updates, duplicate quality section removed, fetchImageAsBase64 helper, forEach→for loop
src/CoatingLog.jsx                # Dia→NPS dropdown, Grade→dropdown, Wall units, Co.→Coating Co. label
pipe-up-field-guide-agent-kb.md   # v19 — PDF export docs, Coating/Counterbore log descriptions
```

---

### Chainage Overlap Fix, Frost Packing Activity & PDF Overlap Text (February 23, 2026)

**Fixed false chainage overlap warnings, added Frost Packing as a new activity type, and fixed PDF truncating overlap reason text**

1. **Chainage overlap org filter bug** — `checkHistoricalOverlaps()` was querying ALL organizations' reports instead of only the current org, causing false overlap warnings. Inspectors were told KP ranges were "already reported" when they hadn't entered them. Added `addOrgFilter(query)` to match the correct pattern in `fetchExistingChainages()`. Also added org-scoped filtering to the offline `chainageCache.js` manager.

2. **Frost Packing activity type (#26)** — New activity type with 8 quality fields: Packing Material (Sand/Gravel/Select Fill/Screened/Other), Cover Depth (cm), Placement Method (Machine/Hand/Combination), Ground Condition (Frozen/Partially Frozen/Thawed/Mixed), Frost Depth (cm), Ambient Temp (°C), Pipe Protection in Place, Compaction Achieved. Added to concealed-work photo banner and health scorer.

3. **PDF overlap/gap reason text truncation** — Overlap and gap reason text in the PDF was hardcoded to `substring(0, 80)` in a fixed single-line 7px box. Now uses `splitTextToSize()` to wrap the full text across multiple lines with a dynamically sized background box.

**Field Guide updated to v4.3** — Frost Packing added to activity table, glossary, concealed-work lists. Chainage overlap docs updated.

**Files Modified:**
```
src/InspectorReport.jsx           # addOrgFilter in checkHistoricalOverlaps, PDF multi-line overlap text, Frost Packing in Excel phases
src/constants.js                  # Frost Packing activity type + 8 quality fields
src/ActivityBlock.jsx             # Frost Packing in concealed-work photo list
src/agents/ReportHealthScorer.js  # Frost Packing in CONCEALED_WORK_ACTIVITIES
src/offline/chainageCache.js      # Org-scoped cache refresh
```

---

### God Mode View Button Navigation Fix (February 23, 2026)

**Fixed "Organization Not Found" error when clicking View on reports from God Mode or dashboard report tables**

1. **ChiefDashboard View button fix** — The "View" button on pending reports in ChiefDashboard navigated to `/report?id=...` without the organization slug prefix. When accessed via God Mode (Admin Portal), this caused OrgContext to fail with "Access Error — Organization Not Found" because no org slug was in the URL. Wrapped with `orgPath()` to match all other navigation calls in the file.

2. **AssistantChiefDashboard View Full Report fix** — Same bug: the "View Full Report →" button navigated without `orgPath()`. Fixed identically.

**Field Guide updated to v4.2** — Version bump only (no inspector-facing content changes).

**Files Modified:**
```
src/ChiefDashboard.jsx           # orgPath() added to View button navigate (line 1121)
src/AssistantChiefDashboard.jsx   # orgPath() added to View Full Report navigate (line 2047)
```

---

### Floating Agent Button, Feedback System & Field Guide Updates (February 19, 2026)

**Floating chat button for AI agent, in-app feedback on every page, field guide expanded with safety procedures, glossary, and compaction failure instructions**

1. **Floating agent button** — Replaced the header "Doc Search" button with a persistent floating purple chat button pinned to the bottom-right corner of the screen. Always visible as the user scrolls. Tapping opens the "Ask the Agent" panel above the button; tapping again closes it. Updated guided tour step.

2. **Feedback button on all pages** — New reusable `FeedbackButton` component added to: Inspector Report, Chief Dashboard, Welding Chief Dashboard, Assistant Chief Dashboard, My Reports, and Admin Portal. Solid blue "Send Feedback" button at the very bottom of each page with helper text. Opens a modal for typed feedback. Saved to `user_feedback` database table AND emailed to rjudson@pipe-up.ca via Resend.

3. **Concealed-work photo explanation** — For Lower-in, Backfill, Coating, HD Bores, and HDD activity blocks, a yellow banner in the Work Photos section explains that photos must be taken BEFORE work is buried/hidden. Health score message also clarified to explain why photos are needed.

4. **Field guide v3.6: Construction phase safety procedures** — Added Section 2B with comprehensive pre/during/post inspection checklists and hazard tables for Lower-in, Trenching (Ditch), Backfill, and Coating phases per API 1169.

5. **Field guide v3.7: Missing glossary terms** — Added definitions for NDE, NDT, CAP, HDD, GRP, and CL — acronyms used in application fields but previously undefined.

6. **Field guide v3.8: Backfill compaction failure procedure** — Step-by-step instructions for documenting compaction failures: GPS location capture, photo/voice evidence, and downtime/rework logging with drag reasons.

7. **Field guide v3.9–v4.1: Agent, feedback & concealed-work documentation** — Updated brand context, feature table, and FAQ to reflect floating agent button, feedback system, and concealed-work photo explanation.

**Database Migration:** `user_feedback` table with RLS policies.

**Files Created:**
```
src/components/FeedbackButton.jsx    # Reusable feedback modal component
api/send-feedback-email.js           # Vercel serverless email route via Resend
supabase/migrations/20260219_user_feedback.sql  # DB table + RLS
```

**Files Modified:**
```
src/InspectorReport.jsx              # Floating agent button, removed Doc Search, added FeedbackButton
src/components/GuidedTour.jsx        # Updated tour step for new button location
src/ActivityBlock.jsx                # Concealed-work photo yellow banner
src/agents/ReportHealthScorer.js     # Clearer concealed-work health score message
src/ChiefDashboard.jsx               # Added FeedbackButton
src/WeldingChiefDashboard.jsx        # Added FeedbackButton
src/AssistantChiefDashboard.jsx      # Added FeedbackButton
src/MyReports.jsx                    # Added FeedbackButton
src/AdminPortal.jsx                  # Added FeedbackButton
pipe-up-field-guide-agent-kb.md      # v3.5 → v4.1
```

---

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

### Construction Phase Safety Procedures Added to Field Guide (February 19, 2026)

**Field guide gap analysis identified missing procedural safety steps for Lower-in, Trenching, Backfill, and Coating phases**

1. **Section 2B: Construction Phase Safety Procedures** — New field guide section with comprehensive pre-inspection, during-inspection, and post-inspection checklists for four construction phases: Lower-in, Trenching (Ditch), Backfill, and Coating. Each phase includes common hazards tables with risk levels and mitigation steps per API 1169.

2. **Lower-in Safety Procedures** — Pre-checks: pipe support spacing, side boom certification, sling/choker integrity, trench clearance, coating condition. During: controlled descent monitoring, stress management, side boom load adherence, tie-in point alignment. Post: as-built position verification, support removal, inspector signoff.

3. **Trenching (Ditch) Safety Procedures** — Pre-checks: dig permits, locate markings, spoil placement, shoring/benching requirements. During: grade/depth compliance, groundwater monitoring, existing utilities proximity, wall stability. Post: trench readiness for lowering-in, spoil management. Includes trench entry safety section for confined space protocols when depth exceeds 1.2m.

4. **Backfill Safety Procedures** — Pre-checks: coating inspection complete, pipe position documented, padding material approved. During: lift height compliance, compaction testing, no direct rock contact. Post: grade restoration, erosion control, compaction records.

5. **Coating Inspection Safety Procedures** — Pre-checks: holiday detector calibration, surface prep verification. During: DFT readings, holiday detection sweeps, repair procedures. Post: clearance documentation, final coating log.

**Field Guide updated to v3.6** — Re-uploaded and re-indexed (35 chunks, 0 errors).

**Files Modified:**
```
pipe-up-field-guide-agent-kb.md  # Section 2B added, version 3.5 → 3.6
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
*Last Updated: March 3, 2026 (CVI calculation engine — pipe-up-automation/cvi_engine.py)*
