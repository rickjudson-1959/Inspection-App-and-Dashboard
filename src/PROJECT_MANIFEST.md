# PIPE-UP PIPELINE INSPECTOR PLATFORM
## Project Manifest - March 22, 2026

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
- **Reconciliation Dashboard** - Visual four-panel LEM reconciliation (Contractor LEM image | Contractor Ticket image | Our Ticket Photo | Inspector Report Data), text-based PDF classification (zero API calls), left sidebar pair list with status filters and progress tracking, keyboard navigation (A=Accept, N=Next), resolution workflow (Accept/Dispute-Variance/Dispute-Ticket Altered/Skip), billing status management, invoice batching, crossing support reconciliation, crossing variance (bore integrity audit), trackable items reconciliation (14 categories with filter chips, summary cards, detail table with type-specific columns, inventory net position panel), inspector reports sub-view with rate card cost calculations

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

### Storage Buckets (Reconciliation)

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
│   ├── lemParser.js            # LEM PDF parser: pdf.js text extraction, content-marker classification, adjacency pairing, background image upload + Claude Vision OCR extraction of LEM billing line items (extractLEMLineItems, extractAllLEMLineItems) with structured labour/equipment/totals output (Updated Mar 21, 2026)
│   ├── lemMatcher.js           # Three-strategy matching engine: exact ticket → normalized ticket → date+crew fallback, variance calculation (NEW - Mar 2026)
│   └── ticketNormalizer.js     # Ticket number normalization: strips prefixes, handles format variations (NEW - Mar 2026)
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
    │   ├── ReconciliationUpload.jsx  # Upload form — contractor LEM and daily ticket only (inspector data auto-linked)
    │   ├── ReconciliationList.jsx    # Ticket list with 4-column completion status (LEM/TK/PH/RPT), merges recon_package_status + daily_reports
    │   ├── ReconFourPanelView.jsx   # 2x2 grid — fetches from 3 sources: reconciliation_documents, daily_reports, ticket-photos bucket
    │   ├── DocumentPanel.jsx        # Reusable panel with PDF/image viewer, fullscreen expand (⛶), zoom, rotate, page nav, panelType routing
    │   ├── InspectorReportPanel.jsx # Formatted read-only manpower + equipment tables from activity_blocks (not a document upload)
    │   ├── PdfViewer.jsx            # pdf.js canvas renderer with page navigation
    │   └── ImageViewer.jsx          # Image renderer with ctrl+scroll zoom, click-to-fullscreen
    ├── MapDashboard.jsx
    ├── OfflineStatusBar.jsx     # PWA status indicator (NEW - Jan 2026)
    └── [supporting components]

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
└── [other migrations]
```

---

## 6. RECENT UPDATES (January–March 2026)

### 4-Panel Reconciliation System — ticket_number Keyed (March 22, 2026)

**New reconciliation system matching documents by ticket_number across 4 panels. Two panels are uploaded by admin (contractor LEM + contractor daily ticket), two are auto-linked from existing inspector data in the app (ticket photo + formatted report).**

1. **Architecture** — ticket_number is the universal join key. All four document sources converge on this field:
   - Panel 1 (Contractor LEM): uploaded by admin to `reconciliation_documents` table
   - Panel 2 (Contractor Daily Ticket): uploaded by admin to `reconciliation_documents` table
   - Panel 3 (Inspector Ticket Photo): auto-linked from `ticketPhotos` in `daily_reports` → `activity_blocks` — NOT uploaded
   - Panel 4 (Inspector Report): formatted read-only manpower + equipment tables from `daily_reports` → `activity_blocks` — NOT uploaded

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

10. **Admin Portal updates** — Ticket # column in Reports tab, Exports tab (separated from Reports), tab-aware back navigation, forced org filtering for super admins, "All time" date range option, "Pipeline Project" + "4-Way Reconciliation" title

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
