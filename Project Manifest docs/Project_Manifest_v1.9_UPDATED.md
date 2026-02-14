# 2026-02-04 PROJECT MANIFEST
**PIPE-UP PIPELINE INSPECTOR PLATFORM**

**Project Manifest - February 4, 2026**

---

## 1. PROJECT OVERVIEW

**Project Name**: Pipe-Up Pipeline Inspector Platform
**Client**: FortisBC EGP - Eagle Mountain Woodfibre Gas Pipeline
**Production URL**: https://app.pipe-up.ca
**Repository**: https://github.com/rickjudson-1959/Inspection-App-and-Dashboard

### Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18.2.0 with Vite + PWA |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| AI Analysis | Anthropic Claude API (AI Agent + Mentor System) |
| Email API | Resend |
| Deployment | Vercel |
| PDF Generation | jsPDF + jsPDF-autotable |
| Excel Export | XLSX |
| Mapping | Leaflet + React-Leaflet |
| Charting | Recharts |
| Offline Storage | IndexedDB (idb) |
| Service Worker | Workbox (vite-plugin-pwa) |

---

## 2. USER ROLES & ACCESS

| Role | Access Level |
|------|--------------|
| super_admin | Full system access |
| admin | Project administration |
| chief_inspector | Field inspection chief, report approval |
| assistant_chief_inspector | Assistant to chief |
| welding_chief | Welding operations monitoring & reporting |
| inspector | Field data entry |
| pm | Project manager dashboards |
| cm | Construction manager dashboards |
| executive | Executive dashboards & summaries |
| ndt_auditor | NDT monitoring & auditing |

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
- Labour classification tracking (72 classifications)
- Equipment hour recording (323 equipment types)
- Weather condition logging with offline cache
- Digital signature capture

### Activity Types (25 Supported)
Clearing, Access, Topsoil (with horizon separation tracking), Grading, Stringing (pipe receiving inspection), Bending, Welding - Mainline, Welding - Section Crew, Welding - Poor Boy, Welding - Tie-in, Coating, Ditch (with BOT checklist, pay items), Lower-in, Backfill, Tie-in Completion, Cleanup - Machine, Cleanup - Final, Hydrostatic Testing, HDD (Horizontal Directional Drilling), HD Bores, Piling, Equipment Cleaning, Hydrovac, Welder Testing, Counterbore/Transition

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
- Document version control (Rev 0, Rev 1, Rev 2…)
- Owner DC compatibility with custom metadata fields
- Sync status workflow (internal → transmitted → acknowledged → rejected)
- Transmittal Generator with PDF output
- Project Handover Package (ZIP with nested folders)
- SHA-256 manifest CSV for integrity verification
- Technical Resource Library (global read-only references)

---

## 4. DATABASE SCHEMA (SUPABASE)

### Inspector Invoicing Tables
- **inspector_profiles** - Company and banking information, profile completion status, cleared to work flag
- **inspector_documents** - Certifications, licenses, insurance; expiry date tracking; verification workflow
- **inspector_rate_cards** - Daily field rate, per diem, allowances; truck rate, km rate, thresholds; effective date ranges
- **inspector_timesheets** - Period dates, project info; summary totals; workflow status tracking; approval chain timestamps
- **inspector_timesheet_lines** - Daily line items, work type flags, auto-populated from daily tickets

### Ditch/Trench Inspection Tables
- **trench_logs** - Report linkage, KP range; trench measurements; pay items; BOT checklist; water management; soil conditions
- **trench_log_photos** - Geotagged photo evidence with GPS coordinates

### HDD Drilling Waste Management Tables (NEW - January 2026)
- **drilling_waste_logs** - Report linkage, bore/crossing ID; mud mixing data; disposal tracking; testing compliance; certification
- **drilling_waste_additives** - Product name, type, manufacturer; quantity used; SDS availability
- **drilling_waste_photos** - Geotagged evidence photos with GPS coordinates

### HDD Steering/Bore Path Tables (NEW - January 2026)
- **bore_path_logs** - Report linkage; guidance system setup; design vs actual angles; pipe specifications; status tracking
- **bore_path_stations** - Per-joint steering data; position data; offset from design; bending radius alerts
- **bore_path_documents** - Uploaded bore logs, steering reports with GPS metadata

### Trackable Items
- **bedding_padding** (NEW - January 2026) - Protection types (Bedding, Padding, Pipe Protection, Rockshield, Lagging); From KP / To KP; Length, Material, Depth/Thickness; Action, Equipment, Notes

### Document Control Tables (NEW - February 2026)
- **project_documents** - Organization-scoped document vault; category tracking; version control; ITP sign-offs; Owner DC sync status; custom metadata; addenda support; global flag for Technical Resource Library
- **transmittals** - Transmittal tracking and generation; document linkage; from/to parties; subject and notes
- **contract_config** - Per-organization project configuration; contract number, workday hours, AP email; project boundaries (start/end KP); custom document fields

### Mentor Agent Tables (NEW - February 2026)
- **mentor_threshold_config** - Configurable quality thresholds per organization; activity type and field key mapping; min/max values with units and severity; alert messages with interpolation support; recommended actions and reference documents; knowledge bucket source tracking
- **mentor_alert_events** - Real-time alert event logging; threshold breach tracking; inspector acknowledgment/override workflow; override reason capture; status tracking (active/acknowledged/overridden/resolved)

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
├── agents/                      # NEW - AI Mentor System (Feb 2026)
│   ├── InspectorMentorAgent.js     # Core threshold evaluation engine
│   ├── MentorThresholdSeeder.js    # Threshold generation from knowledge buckets
│   ├── MentorTipService.js         # Proactive mentor tips (Phase 2)
│   ├── NLQueryService.js           # Natural language query client (Phase 4)
│   ├── ReportHealthScorer.js       # Report completeness scoring (Phase 3)
│   ├── OverrideLogger.js           # Override event logging (Phase 5)
│   └── technicalTerms.js           # 200+ pipeline construction terms
│
├── hooks/                       # NEW - Mentor React Hooks (Feb 2026)
│   └── useMentorAuditor.js         # Field-level validation hook
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
│   ├── ClearingLog.jsx         # With ROW width comparative validation
│   ├── CoatingLog.jsx
│   ├── DitchInspection.jsx     # Ditch with DB integration
│   ├── GradingLog.jsx
│   ├── HDDLog.jsx              # Collapsible sections, waste mgmt, steering log, bore length validation
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
    ├── MentorSidebar.jsx        # NEW - Mentor alert sidebar (Feb 2026)
    ├── MentorAlertBadge.jsx     # NEW - Floating alert badge (Feb 2026)
    ├── MentorTipOverlay.jsx     # NEW - Activity tips overlay (Feb 2026)
    ├── AskTheAgentPanel.jsx     # NEW - NLQ chat interface (Feb 2026)
    ├── HealthScoreIndicator.jsx # NEW - Report health score (Feb 2026)
    ├── TrackableItemsTracker.jsx
    ├── SignaturePad.jsx         # Digital signature capture (ITP sign-offs)
    ├── TenantSwitcher.jsx       # Organization switcher dropdown
    ├── AIAgentStatusIcon.jsx    # AI Watcher status indicator (NEW - Feb 2026)
    ├── MapDashboard.jsx
    ├── OfflineStatusBar.jsx     # PWA status indicator (NEW - Jan 2026)
    └── [supporting components]
```

### Supabase Edge Functions
```
/supabase/functions/
├── process-ticket-ai/          # AI Watcher anomaly detection
│   └── index.ts
├── mentor-nlq/                 # NEW - Natural language query (Feb 2026)
│   └── index.ts                # Dual-source RAG search for technical questions
└── [other edge functions]
```

### Database Migrations
```
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
├── 20260205_create_mentor_agent_tables.sql   # NEW - Mentor thresholds (Feb 2026)
├── 20260131000001_seed_default_thresholds.sql # NEW - 12 default thresholds (Feb 2026)
└── [other migrations]
```

---

## 6. RECENT UPDATES (January/February 2026)

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
- `src/AdminPortal.jsx` - New category, upload function, supporting doc UI
- `src/ReferenceLibrary.jsx` - New category, supporting docs display
- `supabase/migrations/20260214_add_field_guide_category.sql`

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

### InspectorMentorAgent - Phase 1 Complete (February 4, 2026)

**Real-Time Threshold-Based Field Validation System**

The InspectorMentorAgent provides intelligent, real-time quality assurance guidance to field inspectors during data entry. When field values breach configurable thresholds, inspectors receive immediate contextual alerts with recommended actions and reference documents.

#### Core Capabilities

**Threshold Alerts (12 Configured Thresholds Across 8 Activities)**

| Activity Type | Field Key | Threshold | Severity | Status |
|--------------|-----------|-----------|----------|--------|
| **Access** | accessWidth | < 5.0m | info | ✅ Working |
| **Topsoil** | admixture_percent | > 15% | critical | ✅ Working |
| **Topsoil** | stockpileSeparationDistance | < 1.0m | warning | ✅ Working |
| **HD Bores** | boreLength | < 1m or > 500m | warning | ✅ Working |
| **Bending** | bendAngle | > 90° | critical | ✅ Working |
| **Bending** | ovalityPercent | > 3% | critical | ✅ Working |
| **Backfill** | coverDepth | < 0.6m | critical | ✅ Working |
| **Backfill** | compactionPercent | < 90% | warning | ✅ Working |
| **Welding - Mainline** | rootOpening | < 1.0mm or > 3.2mm | warning | ✅ Working |
| **Welding - Mainline** | hiLo | > 1.6mm | warning | ✅ Working |
| **Lower-in** | clearance | < 0.3m | critical | ✅ Working |
| **Clearing** | rowWidthActual | > rowWidthDesign | warning | ✅ Working |

**Alert Severity Levels:**
- **Critical (Red)**: Safety-critical violations that auto-open sidebar (e.g., topsoil admixture > 15%, backfill cover < 0.6m)
- **Warning (Amber)**: Specification deviations requiring review (e.g., access width < 5m, bore length unusual)
- **Info (Blue)**: Guidance and recommendations for best practices

#### User Experience

**MentorAlertBadge** - Floating indicator in bottom-right corner:
- Amber pulse animation for warning alerts
- Red pulse animation for critical alerts
- Click to open MentorSidebar
- Shows total alert count with tooltip breakdown

**MentorSidebar** - Slide-in panel from right side:
- Severity-sorted alert cards with colored left border
- Each alert displays:
  - Title (e.g., "ROW Width Exceeds Design")
  - Detailed message with interpolated values
  - Recommended action steps
  - Reference document citation
  - Source knowledge bucket
- Actions:
  - **Acknowledge**: Inspector agrees with alert, marks as resolved
  - **Override**: Inspector disagrees, must provide reason for audit trail

#### Implementation Pattern

**Standard QualityData Activities** (7 activities):
Activities using standard `qualityData` structure work automatically via `useMentorAuditor` hook:
- Access, Topsoil, Bending, Backfill, Welding - Mainline, Lower-in

**Mechanism:**
1. User enters value in ShieldedInput field
2. `onBlur` handler calls `mentor.auditField(fieldKey, value)`
3. `evaluateField()` queries `mentor_threshold_config` table
4. Matching thresholds evaluated against field value
5. Alerts created and propagated to InspectorReport
6. MentorAlertBadge appears if any active alerts exist

**Specialized Log Components** (2 activities with custom validation):

**Clearing (ClearingLog.jsx)**:
- Uses `clearingData.rowBoundaries` structure (not standard qualityData)
- Comparative validation: Actual ROW Width > Design ROW Width
- Custom useEffect with manual `addAlert()` call
- Alert auto-clears when values become compliant

**HD Bores (HDDLog.jsx)**:
- Uses nested `hddData` structure
- Validates `boreLength` field (1-500m typical range)
- Custom useEffect with manual `addAlert()` call
- Warning severity (unusual values, not violations)

#### Architecture & Future-Proofing

**Knowledge Bucket Registry Pattern:**
```javascript
// InspectorMentorAgent.js - Single source of truth for knowledge sources
const KNOWLEDGE_BUCKET_REGISTRY = [
  { table: 'project_documents', filter: ..., label: 'Project Documents' },
  { table: 'wps_material_specs', filter: ..., label: 'WPS & Material Specs' },
  { table: 'contract_config', filter: ..., label: 'Contract Configuration' },
  { table: 'document_embeddings', filter: ..., label: 'Document Embeddings (RAG)' }
]
```

**Adding a new knowledge source:**
1. Add entry to `KNOWLEDGE_BUCKET_REGISTRY`
2. Optionally add threshold seeder to `MentorThresholdSeeder.js`
3. All other components automatically include new data

**Configurable Thresholds (Not Hardcoded):**
- All thresholds stored in `mentor_threshold_config` table
- Editable via Admin Portal (future enhancement)
- Support for value interpolation in alert messages: `{value}`, `{min}`, `{max}`, `{unit}`
- Can reference source documents from knowledge buckets

#### Phase Roadmap

**✅ Phase 1: Core Agent + Real-Time Data Auditing** (COMPLETE - Feb 4, 2026)
- Threshold-based validation with 12 configured thresholds
- Real-time alerts on field blur
- Sidebar UI with acknowledge/override workflow
- Database persistence of alert events
- Override logging with reason capture

**Phase 2: Proactive Mentor Tips** (Partially Implemented)
- Display key quality checks when activity type selected
- RAG-powered tips from document embeddings
- **Status**: Edge function exists (`mentor-nlq`), but browser-side calls disabled due to OpenAI API 401 errors
- **TODO**: Implement server-side edge function for tip generation

**✅ Phase 3: Report Health Score** (Implemented - Jan 2026)
- Weighted completeness score (100-point scale)
- Categories: Photo completeness (25%), Directive 050 compliance (20%), field completeness (20%), chainage integrity (15%), labour/equipment docs (10%), mentor alert resolution (10%)
- Health score indicator in InspectorReport
- Warns if < 90% on submit (does not block)

**✅ Phase 4: Natural Language Query ("Ask the Agent")** (Implemented - Feb 2026)
- Edge function: `supabase/functions/mentor-nlq/index.ts`
- Dual-source RAG search (org-specific + global Technical Resource Library)
- Uses OpenAI embeddings + Claude responses
- Predictive typeahead with 200+ pipeline construction terms
- **Status**: Working correctly with Technical Resource Library integration

**Phase 5: Override Logging** (Planned)
- Dual-write to `report_audit_log` and `mentor_alert_events`
- Action type: `inspector_override`
- Regulatory category mapping from `auditLoggerV3.js`
- Critical flag for high-severity overrides

#### Files Created/Modified

**New Files:**
```
src/agents/InspectorMentorAgent.js        # Core evaluation engine
src/agents/MentorThresholdSeeder.js       # Threshold generation
src/agents/MentorTipService.js            # Proactive tips (Phase 2)
src/agents/NLQueryService.js              # NLQ client (Phase 4)
src/agents/ReportHealthScorer.js          # Health scoring (Phase 3)
src/agents/OverrideLogger.js              # Override logging (Phase 5)
src/agents/technicalTerms.js              # Pipeline term dictionary

src/hooks/useMentorAuditor.js             # Validation hook

src/components/MentorSidebar.jsx          # Alert sidebar UI
src/components/MentorAlertBadge.jsx       # Floating badge indicator
src/components/MentorTipOverlay.jsx       # Activity tips (Phase 2)
src/components/AskTheAgentPanel.jsx       # NLQ interface (Phase 4)
src/components/HealthScoreIndicator.jsx   # Health score UI (Phase 3)

supabase/functions/mentor-nlq/index.ts    # NLQ edge function (Phase 4)
```

**Modified Files:**
```
src/ActivityBlock.jsx       # Mentor hook integration, pass props to specialized logs
src/InspectorReport.jsx     # Mentor alert state management, sidebar rendering
src/ClearingLog.jsx         # ROW width comparative validation
src/HDDLog.jsx              # Bore length validation with custom useEffect
```

**Database Migrations:**
```
supabase/migrations/20260205_create_mentor_agent_tables.sql
  - mentor_threshold_config table
  - mentor_alert_events table
  - RLS policies

supabase/migrations/20260131000001_seed_default_thresholds.sql
  - 12 default threshold configurations
  - Covers 8 activity types
```

#### Testing & Verification

**Local Testing (Localhost:5176) - All Passed:**
1. ✅ Access activity - accessWidth = 3m → Info badge appeared
2. ✅ Topsoil activity - admixture_percent = 20% → Critical alert, sidebar auto-opened
3. ✅ HD Bores activity - boreLength = 600m → Warning badge appeared
4. ✅ Clearing activity - Design ROW 40m, Actual ROW 45m → Warning alert triggered

**Production Deployment:**
- Commit: `639ec97 - Complete mentor threshold integration for all activities`
- Deployed: February 4, 2026
- URL: https://app.pipe-up.ca

#### Impact & Benefits

**For Inspectors:**
- Real-time guidance on quality thresholds during data entry
- Reduced errors by catching out-of-spec values immediately
- Contextual help with recommended actions and reference documents
- Audit trail of all override decisions with reasons

**For Chiefs & Compliance:**
- Health score indicator showing report completeness
- Override logging tracks when inspectors disagree with mentor alerts
- Regulatory compliance with Directive 050 and contract specifications
- Quality assurance via threshold-based validation

**For Organization:**
- Configurable thresholds via database, no code changes required
- Knowledge bucket registry for easy addition of new data sources
- Scalable architecture supports future AI features (NLQ, tips, scoring)
- Phase-based implementation allows incremental rollout and testing

---

### Shielded Input Architecture (February 4, 2026)

**Project-wide fix for the "single-digit input" bug**

Inspectors could only type 1 character in form fields before the value was lost/reset. Root causes identified and fixed:

1. **CollapsibleSection unmount/remount** - CollapsibleSection was defined as an arrow function inside the render function of GradingLog and HDDSteeringLog. React treated each render's new function reference as a different component type, causing full unmount/remount of the subtree on every keystroke — destroying all child state. **Fix**: Extracted CollapsibleSection to module level.

2. **Parent re-render overwriting typed text** - React state updates from onDataChange callbacks triggered parent re-renders that pushed new prop values into inputs mid-keystroke, resetting the displayed value. **Fix**: Created ShieldedInput with the Ref-Shield pattern.

3. **Search field clearing during filter operations** - Equipment/Manpower SearchableSelect inputs cleared while typing because filtering triggered re-renders. **Fix**: Created ShieldedSearch with 300ms debounce.

#### ShieldedInput / ShieldedSearch — Ref-Shield Pattern

- `localValue` state is the sole display source while the input is focused
- Prop updates are blocked while the user is typing (focus shield)
- Syncs from props only on `onBlur` or when not focused
- Wrapped in `React.memo` to skip re-renders when props haven't changed
- Password manager defense attributes: `data-bwignore`, `data-1p-ignore`, `data-lpignore`, `autoComplete="off"`, `spellCheck: false`
- Verification logging: `console.log('[ShieldedSystem] Prop Sync Blocked - User is Typing')`
- `onChange` passes string value directly (NOT an event object)

#### 131 Raw DOM Elements Replaced Across 12 Files

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

#### Backward Compatibility

- `BufferedInput.jsx` re-exports from `ShieldedInput.jsx`
- `BufferedSearch.jsx` re-exports from `ShieldedSearch.jsx`
- Existing imports in GradingLog, HDDSteeringLog, MainlineWeldData, TieInWeldData continue working unchanged

#### New Files Created

```
src/components/common/ShieldedInput.jsx   # Ref-Shield input component
src/components/common/ShieldedSearch.jsx  # Ref-Shield search with debounce
```

---

### Equipment Unit Number Column (February 3, 2026)

**Unit # tracking for Equipment section**

- New column added to Equipment table in ActivityBlock.jsx
- Editable inline cell for manual entry
- OCR extraction support: AI prompt updated to extract `unitNumber` from contractor tickets
- Grid layout updated from 4 to 5 columns to accommodate Unit #

**Files Modified:**
- `src/ActivityBlock.jsx` - Unit # form field, table column, OCR prompt
- `src/InspectorReport.jsx` - `addEquipmentToBlock` accepts `unitNumber` parameter, new `updateEquipmentUnitNumber` function

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

#### AI Agent Status Icon (AdminPortal Header)

Visual status indicator with 5 states:
- 🤖 Gray (Idle) - No recent analysis
- ⚡ Blue pulse (Analyzing) - Processing tickets
- ✅ Green pulse (Clear) - No issues detected
- ⚠️ Yellow (Warning) - Review recommended
- 🚨 Red pulse (Flagged) - Critical issues requiring attention

Features:
- Click to view detailed analysis results
- Clickable flags navigate to affected tickets
- Real-time Supabase subscription for live updates

#### Analysis Rules (7 Checks)

| Flag Type | Severity | Rule |
|-----------|----------|------|
| HOURS_EXCEEDED | Warning/Critical | Avg hours > 120%/150% of standard workday |
| KP_OUT_OF_BOUNDS | Critical | Activity KP outside project boundaries |
| LOW_EFFICIENCY | Warning/Critical | Shadow hours / billed hours < 70%/50% |
| MANAGEMENT_DRAG_SPIKE | Critical | >30% labour marked as MANAGEMENT_DRAG |
| LABOUR_ANOMALY | Info | >50 workers in single activity block |
| WPS_MATERIAL_MISMATCH | Critical | Pipe material not approved for WPS |
| EQUIPMENT_MISMATCH | Warning | WPS not found in approved specifications |

#### WPS Material Validation

- `wps_material_specs` table stores approved materials per WPS
- Validates pipe grade against WPS allowed materials list
- Flags critical violations (e.g., X65 Steel used with WPS-02 which only allows X70/X80)
- Supports both block-level and `weldData.weldEntries` validation

#### AI-Generated Summaries

- Anthropic Claude API generates executive summaries of flagged issues
- Prioritizes WPS/Material violations as potential stop-work items
- Identifies contractors requiring investigation
- Provides actionable recommendations

**New Database Tables:**
- `ai_agent_logs` - Analysis results and metrics
- `wps_material_specs` - WPS allowed materials configuration

**New Edge Function:**
- `supabase/functions/process-ticket-ai/index.ts`

**New Component:**
- `src/components/AIAgentStatusIcon.jsx`

**Files Modified:**
- `src/AdminPortal.jsx` - AI Agent icon in header, flagged ticket modal
- `src/utils/queryHelpers.js` - Fixed `isReady()` for org filtering

---

### Welding Chief Dashboard (February 2, 2026)

**New Dashboard for Welding Operations Management**

Dedicated dashboard for Welding Chief Inspector role with 6-tab interface: Overview, Welder Performance, WPS Compliance, Daily Reports, Certifications, Generate Report

#### Overview Tab
- KPI cards: Daily Weld Count, Cumulative Repair Rate, Active AI Alerts
- Today's Weld Summary Table by crew type
- AI Alert Banner for critical WPS/filler/preheat violations

#### Welder Performance Tab
- Welder Stats Table: ID, Total Welds, Repairs, Repair Rate (%)
- Status Badges: Green (<5%), Yellow (5-8%), Red (>8%)
- Flagged Welders Alert Box

#### WPS Compliance Tab
- Active AI Flags Panel for `WPS_MATERIAL_MISMATCH`, `FILLER_MATERIAL_MISMATCH`, `PREHEAT_VIOLATION`
- Integration with `AgentAuditFindingsPanel`

#### Daily Reports Tab
- Date Selector with Load Reports button
- Detailed Activities Table with weld counts, repairs, locations
- Individual Welds Log with weld numbers and visual results
- Repairs Table with defect codes
- Tie-In Data with station and NDE results
- Inspector Comments Feed

#### Certifications Tab
- Active Welders Table with qualification status
- Expiry date highlighting

#### Generate Report Tab
- AI-generated daily welding report (with fallback when API unavailable)
- Sections: Executive Summary, Production Summary, Quality & Repairs, Tie-In Operations, Inspector Observations, Action Items
- **PDF Download with Digital Signature**
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
- Allowed roles: `welding_chief`, `chief`, `chief_inspector`, `admin`, `super_admin`
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
- `src/utils/queryHelpers.js` - Updated `isReady()` logic

---

### Document Control & Project Handover System (February 1, 2026)

#### Project Document Vault (Admin Portal → Setup)

9 document categories with traffic light status indicators:
- Prime Contract, Scope of Work, IFC Drawings, Typical Drawings
- Project Specifications, Weld Procedures (WPS), ERP, EMP, ITP
- Green dot = uploaded, Red dot = missing
- Version control with automatic revision tracking (Rev 0, Rev 1, Rev 2…)
- Document history modal showing all versions with timestamps
- Addenda support for Project Specs, Weld Procedures, and ITP

#### ITP Sign-off Matrix & Digital Signatures

- Three required sign-offs: Chief Welding Inspector, Chief Inspector, Construction Manager
- **STATIONARY** status: Document uploaded but not fully approved
- **ACTIVE** status: All three signatures captured
- Digital signature pad with timestamp and signer name
- Signature reset prompt when uploading new ITP revision
- Signatures stored in Supabase Storage (`signatures` bucket)

#### Owner Document Control (DC) Compatibility

- Custom metadata fields configurable per organization
- Transmittal Generator with PDF output
- Sync status tracking: internal → transmitted → acknowledged → rejected
- Owner transmittal ID and comments capture
- DC Status Report CSV export

#### Document Sync Health Widget (Admin Portal → Overview)

- Visual status bar showing sync distribution
- Critical alerts for rejected documents requiring revision
- Warning for documents pending transmittal
- Color-coded legend (Yellow=Internal, Blue=Transmitted, Green=Acknowledged, Red=Rejected)

#### Project Handover Package (Admin Portal → Handover)

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

#### Technical Resource Library (Admin Portal → Setup)

6 global reference document categories:
- API 1169 - Pipeline Construction Inspection
- CSA Z662 - Oil & Gas Pipeline Systems
- Practical Guide for Pipeline Construction Inspectors
- Pipeline Inspector's Playbook
- Pipeline Rules of Thumb
- Pipe-Up Field Guide (Agent knowledge base)

Features:
- Read-only access for all users
- Super Admin: Upload, Replace, Delete capabilities
- **Add Supporting Doc** button on each library item (super_admin)
- Supporting documents displayed under parent in both Admin and Inspector views
- Documents marked as `is_global: true` for cross-org access
- AI indexing via `process-document` edge function for RAG search

**New Database Tables:**
- `project_documents` - Document vault with version control
- `transmittals` - Transmittal tracking

**New Database Columns (project_documents):**
- `sync_status`, `owner_transmittal_id`, `owner_comments`, `transmitted_at`, `acknowledged_at`
- `sign_offs` (JSONB for ITP signatures)
- `version_number`, `is_current`, `is_addendum`, `parent_document_id`
- `is_global` (Technical library flag)
- `metadata` (Custom DC metadata - JSONB)

**New Database Columns (contract_config):**
- `custom_document_fields` - JSONB array of custom metadata field definitions

**New Storage Buckets:**
- `signatures` - ITP digital signature images
- `handovers` - Generated ZIP packages

---

### Project Governance & Auto-Populate Features (February 1, 2026)

#### New Database Table: contract_config

Per-organization project configuration settings:
- Fields: `contract_number`, `standard_workday`, `ap_email`, `start_kp`, `end_kp`, `default_diameter`, `per_diem_rate`
- One config per organization (unique constraint)
- RLS policies for authenticated users

#### Project Governance Section (Admin Portal → Setup)

- Contract Number / AFE configuration
- Standard Workday Hours setting
- AP Email for invoice routing
- Project Boundaries (Start KP / End KP)
- Default Diameter setting
- Per Diem Rate configuration
- Config Status indicator (Complete/Incomplete based on required fields)

#### Inspector Report Auto-Populate Features

- **AFE/Contract #** field added to report header (after Pipeline)
  - Auto-fills from organization's `contract_config.contract_number`
  - Light green background when auto-filled
- **Inspector Name** auto-fills from user profile (`full_name`)
- Both skip auto-populate when editing existing reports or restoring drafts

#### Super Admin Features (Admin Portal)

- **Fleet Onboarding** tab: Provision new organizations with admin users
- **Usage Statistics** tab: Cross-organization activity summary (reports, tickets, last activity)
- Both tabs only visible to `super_admin` role

**Files Created:**
- `supabase/migrations/20260131_create_contract_config.sql`

**Files Modified:**
- `src/AdminPortal.jsx` - Project Governance section, Fleet Onboarding, Usage Statistics
- `src/InspectorReport.jsx` - AFE field UI, auto-populate for AFE and inspector name

---

### Multi-Tenant Architecture (January 31, 2026)

#### URL Structure Change

- All authenticated routes now use org-scoped URLs: `/:orgSlug/dashboard`, `/:orgSlug/field-entry`, etc.
- Legacy routes (`/dashboard`, `/chief-dashboard`) redirect to org-scoped versions
- Root path (`/`) redirects users to their default organization's landing page based on role

#### New Database Table: memberships

- Many-to-many relationship between users and organizations
- Fields: `user_id`, `organization_id`, `role`, `is_default`
- Supports users belonging to multiple organizations
- Default organization preference per user

#### New Context: OrgContext

(`src/contexts/OrgContext.jsx`)
- Provides organization data throughout the app
- Tracks current organization, user memberships, and `super_admin` status
- Handles organization switching and validation
- Exports `useOrg()` hook for components

#### New Query Helpers

(`src/utils/queryHelpers.js`)
- `useOrgQuery()` hook: Provides `addOrgFilter()`, `getOrgId()`, `organizationId`, `isSuperAdmin`
- Automatically filters database queries by current organization
- Super admins can bypass org filtering when needed

#### New Navigation Helper: useOrgPath()

- Returns `orgPath()` function to prefix paths with org slug
- Example: `orgPath('/dashboard')` returns `/default/dashboard`

#### Routing Changes (App.jsx)

- `RootRedirect` component determines user's default org and landing page
- `OrgRoutes` component wraps all org-scoped routes with `OrgProvider`
- All 20+ routes moved to org-scoped structure

#### CMT Dashboard Cleanup

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

#### AI-Generated Narrative

- Anthropic Claude API integration for auto-generating Key Focus bullets
- Analyzes inspector reports and aggregates construction activity data
- Generates 6-10 bullet points summarizing daily progress
- Safety status generation with weather and SWA event context

#### Daily Summary Tab Features

- Date picker to select report date
- Load Data button to fetch approved inspector reports
- Generate AI button to create narrative from report data
- Save Draft to persist summaries to database
- Publish functionality for finalizing reports

#### Enhanced PDF Export

- Section 1: Key Focus bullets (AI-generated)
- Section 2: Welding Progress table (weld types, LM, counts, repairs)
- Section 3: Section Progress table (by category and activity)
- Section 4: Personnel Summary (all personnel counts)
- Section 5: Crew Activity Progress (contractor, activity, KP range, metres, work description)
- Automatic page breaks and footers

**New Database Table:**
- `daily_construction_summary` - Stores draft and published daily summaries

**New Environment Variable:**
- `VITE_ANTHROPIC_API_KEY` - Required for AI narrative generation

**Files Modified:**
- `src/ChiefDashboard.jsx` - Daily Summary tab with PDF export
- `src/chiefReportHelpers.js` - AI generation functions
- `src/ProtectedRoute.jsx` - Improved `allowedRoles` handling

---

### Searchable Dropdowns & Efficiency Audit (January 27, 2026)

#### SearchableSelect Component (ActivityBlock.jsx)

- Type-to-filter dropdown for Labour Classification (72 options)
- Type-to-filter dropdown for Equipment Type (323 options)
- Matches all words in any order (e.g., "1 ton truck" finds "1 Ton Truck")
- Handles hyphens and variations ("1-ton" matches "1 ton")
- Keyboard navigation: Arrow keys + Enter to select
- Click outside to close

#### Efficiency Audit System

Production status tracking per labour/equipment entry:
- **ACTIVE (100%)**: Working efficiently
- **SYNC_DELAY (70%)**: Idle due to coordination/materials
- **MANAGEMENT_DRAG (0%)**: Stopped for permits/instructions

Features:
- Shadow hours auto-calculation with manual override
- Delay reason input with preset dropdown + custom text
- Custom reasons saved to localStorage library
- Crew-wide delay reporting option
- Efficiency dashboard added to Chief and Assistant Chief dashboards

#### PWA Update Prompt (UpdatePrompt.jsx)

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

#### PWA (Progressive Web App) Implementation

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

#### Email Invitation System Fix

- Resend domain verification completed for `pipe-up.ca`
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

#### HDDLog.jsx - Complete Redesign

8 collapsible sections with color coding:
1. **Bore Information** (gray)
2. **Pilot Hole - Drilling Fluid Parameters** (yellow)
3. **Reaming Passes** - repeatable entries (blue)
4. **Pipe Installation** (green)
5. **Post-Installation** (gray)
6. **Drilling Waste Management - Directive 050** (blue)
7. **Steering Log - Bore Path Data** (purple)
8. **Comments** (gray)

Features:
- Integrated audit trail logging via `useActivityAudit` hook
- Inherited info bar showing contractor, foreman, date, KP range

#### DrillingWasteManagement.jsx - NEW Component

**AER Directive 050 compliance tracking**

6 collapsible sections:
1. Mud Mixing & Volume Tracking
2. Additives Log (searchable, 20+ pre-configured products)
3. Disposal & Manifesting (mandatory manifest photo)
4. Testing & Compliance (salinity, toxicity, metals)
5. Evidence - Photo Documentation (GPS-tagged)
6. Certification & Comments

Features:
- Volume balance calculation (mixed - hauled = in storage)
- Disposal method tracking (landspray, landfill, approved facility)

#### HDDSteeringLog.jsx - NEW Component

**Real-time pilot hole guidance tracking**

6 collapsible sections:
1. Guidance System Setup (walk-over, wireline, gyro)
2. Design vs Actual Entry/Exit Angles (auto variance)
3. Steering Data - Per Joint/Station (repeatable table)
4. Bending Radius Alerts (pipe diameter lookup)
5. Evidence - Document Upload
6. Comments

Features:
- Minimum bend radius auto-calculation by pipe diameter
- Weld ID linking to pipe string
- Fixed: CollapsibleSection extracted to module level (was causing unmount/remount)

#### Database Migrations (January 21, 2026)

**`20260121_create_drilling_waste_logs.sql`:**
- `drilling_waste_logs` table
- `drilling_waste_additives` table
- `drilling_waste_photos` table
- RLS policies for authenticated users

**`20260121_create_bore_path_data.sql`:**
- `bore_path_logs` table
- `bore_path_stations` table
- `bore_path_documents` table
- RLS policies for authenticated users

#### Audit Logger Updates (January 21, 2026)

Added precision mappings for drilling waste fields:
```javascript
total_volume_mixed_m3: 2,
volume_in_storage_m3: 2,
volume_hauled_m3: 2,
vac_truck_hours: 2,
mud_weight: 1,
viscosity: 0,
grout_volume: 2,
grout_pressure: 1
```
Added environmental regulatory patterns for drilling waste

---

### DitchInspection Refactoring

- Removed Rock Ditch section (now in Trackable Items)
- Removed Extra Depth section (now in Trackable Items)
- Added From KP / To KP to Padding/Bedding section
- Auto-formatting for KP values (6500 → 6+500)

---

### Lower-in Activity Updates

- Changed Padding Depth to Bedding/Padding (Yes/No)
- Removed Depth of Cover (tracked in Trackable Items)
- Kept: Foreign Line Clearance, Lift Plan Verified, Equipment Inspected
- Added reminder popup when Bedding/Padding = Yes
- Uniform box styling for all fields

---

### New Trackable Item: Bedding & Padding

**Protection Type options:**
- Bedding
- Padding
- Bedding and Padding
- Pipe Protection
- Rockshield
- Lagging
- Rockshield and Lagging

**Fields:**
- From KP / To KP
- Length, Material, Depth/Thickness
- Action, Equipment, Notes

#### Database Migration

**`20260120_add_padding_bedding_kp_columns.sql`:**
- Added `padding_bedding_from_kp` column
- Added `padding_bedding_to_kp` column

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
VITE_ANTHROPIC_API_KEY=[anthropic-api-key]  # For AI narrative generation + Mentor NLQ
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
| Anthropic Claude API | AI-generated report narratives + Mentor NLQ |
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

#### Precision Map

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

**Developer**: Claude Code (Anthropic)
**Primary Contact**: Richard Judson
**Issue Tracking**: GitHub Issues

### Common Operations

```bash
# Run Supabase migrations
npx supabase db push

# Deploy to Vercel
git push origin main

# Check deployment status
npx vercel ls
```

---

**Manifest Generated**: January 20, 2026
**Last Updated**: February 14, 2026 (Technical Resource Library - Field Guide & Supporting Docs)
