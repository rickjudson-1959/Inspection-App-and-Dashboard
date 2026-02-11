# PIPE-UP PIPELINE INSPECTOR PLATFORM
## Project Manifest - February 11, 2026

---

## 1. PROJECT OVERVIEW

**Project Name:** Pipe-Up Pipeline Inspector Platform
**Client:** FortisBC EGP - Eagle Mountain Woodfibre Gas Pipeline
**Production URL:** https://app.pipe-up.ca
**Repository:** https://github.com/rickjudson-1959/Inspection-App-and-Dashboard

### Project Simulation Status (Feb 2026)

| Metric | Value | Status |
|--------|-------|--------|
| **Simulation Period** | Jan 1 - Feb 28, 2026 | Active |
| **Overall Completion** | ~33% (1/3 complete) | Behind Schedule |
| **Schedule Performance Index (SPI)** | 0.78 | At Risk |
| **Cost Performance Index (CPI)** | 0.92 | Monitor |
| **Welding Progress** | 30% behind baseline | Critical |
| **Daily Reports Generated** | 60 days of data | Complete |
| **Technical Overrides** | High frequency | Review Required |

### Activity Progress Summary

| Phase | Planned Progress | Actual Progress | Variance |
|-------|-----------------|-----------------|----------|
| Access | 45% | 43% | -2% |
| Clearing | 42% | 39% | -3% |
| Stripping | 38% | 33% | -5% |
| Grading | 35% | 30% | -5% |
| Stringing | 30% | 25% | -5% |
| Bending | 25% | 20% | -5% |
| **Welding - Mainline** | 20% | **14%** | **-30%** |
| **Welding - Tie-in** | 10% | **6.5%** | **-35%** |
| Coating | 18% | 14% | -4% |
| Ditch | 22% | 17% | -5% |
| Lower-in | 12% | 9% | -3% |
| Backfill | 8% | 6% | -2% |
| Cleanup | 5% | 3% | -2% |

### Key Observations
- Welding activities significantly behind due to:
  - Material delivery delays (contractor)
  - Weather holds (neutral - winter conditions)
  - Coordination issues between spreads
  - Equipment breakdowns (welding rigs)
- Inertia Ratio averaging ~72% indicating systemic inefficiencies
- High frequency of management drag events
- Back-charge potential identified: ~$45,000 (contractor delays)

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

## 2. USER ROLES & ACCESS

| Role | Access Level |
|------|--------------|
| `super_admin` | Full system access |
| `admin` | Project administration |
| `chief_inspector` | Field inspection chief, report approval |
| `assistant_chief_inspector` | Assistant to chief |
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
- Labour classification tracking (72 classifications)
- Equipment hour recording (323 equipment types)
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
- From KP / To KP
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
│   └── chiefReportHelpers.js   # Report aggregation
│
├── offline/                     # PWA Offline Support (NEW - Jan 2026)
│   ├── db.js                   # IndexedDB schema
│   ├── syncManager.js          # Offline save & sync logic
│   ├── chainageCache.js        # KP data cache
│   ├── hooks.js                # useOnlineStatus, useSyncStatus
│   └── index.js                # Barrel export
│
└── Components/
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
├── 20260202_create_document_embeddings_only.sql  # Vector embeddings table
├── 20260210_add_contractor_schedule_category.sql # Contractor schedule category
└── [other migrations]

/supabase/functions/
├── process-document/index.ts    # Document text extraction & embedding
├── process-ticket-ai/index.ts   # AI ticket analysis
└── mentor-nlq/index.ts          # Natural language query (Ask the Agent)
```

---

## 6. RECENT UPDATES (January/February 2026)

### PWA Offline Mode - Working Implementation (February 8, 2026)

**Version:** 2.0.0

**Status:** WORKING - Full offline support for field inspectors

**Custom Service Worker Architecture**
- Custom `injectManifest` strategy with Workbox
- Direct control over caching strategies and offline behavior
- Custom fetch handler serves cached `index.html` for all navigation requests
- 18 assets precached for offline use (~5 MB)

**Service Worker Files:**
```
src/sw-custom.js          # Custom Workbox service worker with explicit routes
public/sw-register.js     # Simple registration script
src/version.js            # App version constants for verification
```

**Caching Strategies Implemented:**
| Resource Type | Strategy | Cache Name | Configuration |
|---------------|----------|------------|---------------|
| Navigation | Custom Fetch | egp-inspector-v2-precache-v2 | Serves cached index.html for SPA routing |
| API (Supabase) | NetworkFirst | egp-inspector-v2-api | 24-hour expiration |
| Static Assets | CacheFirst | egp-inspector-v2-assets | 100 entries max, 30-day expiration |

**Service Worker Lifecycle:**
- `skipWaiting()` in install event - Activates immediately
- `clients.claim()` in activate event - Takes control of all pages
- `cleanupOutdatedCaches()` - Removes old cache versions
- Automatic updates via `registerType: 'autoUpdate'`

**Key Implementation Details:**
```javascript
// Install event - immediate activation
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// Activate event - claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Navigation requests - serve cached index.html
if (event.request.mode === 'navigate') {
  event.respondWith(
    caches.open(cacheNames.precache).then(cache => {
      // Find and serve index.html from precache
    })
  )
}
```

**Precaching Configuration (vite.config.js):**
```javascript
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw-custom.js',
  registerType: 'autoUpdate',
  injectRegister: false,
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
  }
})
```

**Version Indicator:**
- Displayed on login page: `v2.0.0 (2026-02-08)`
- Update `src/version.js` when deploying new versions
- Allows easy verification that users have latest version

**User Workflow for Offline Mode:**
1. User signs in while online (required for authentication)
2. Service worker caches app assets in background
3. User can go offline - app continues to work
4. Data saved to IndexedDB while offline
5. Data syncs automatically when back online

**Files Modified:**
- `vite.config.js` - injectManifest strategy configuration
- `index.html` - sw-register.js script tag
- `src/sw-custom.js` - Custom service worker with Workbox
- `public/sw-register.js` - Simplified registration script
- `src/version.js` - Version constants (NEW)
- `src/Login.jsx` - Version display (NEW)
- `package.json` - Version bumped to 2.0.0

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

### Session Handling & Auth Improvements (February 11, 2026)

**Better Token Refresh Failure Handling**
- AuthContext now handles auth events explicitly: `SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT`, `USER_UPDATED`, `PASSWORD_RECOVERY`
- When Supabase token refresh fails (400 error), users see a friendly message instead of silent logout
- Session error state (`sessionError`) tracks why sessions end
- Login page displays session expiry with yellow warning banner
- Console logging for auth events aids debugging (`[Auth] Event: ...`)

**New Auth Context Exports:**
- `sessionError` - String describing why session ended (e.g., "Your session has expired")
- `clearSessionError()` - Function to clear the error after displaying

**Files Modified:**
- `src/AuthContext.jsx` - Event-based auth handling, session error tracking
- `src/Login.jsx` - Session error display with warning styling

---

### AssistantChiefDashboard Fixes (February 11, 2026)

**Database Query Fixes**
- Fixed `column daily_reports.status does not exist` error
- Removed invalid `.eq('status', 'submitted')` filter (daily_reports table has no status column)
- Changed to date-based filtering (last 30 days) for recent reports
- Updated stats label from "Pending Review" to "Recent Reports (30d)"
- Disabled review submission feature with placeholder message (requires schema updates)

**Table Reference Corrections**
- `inspection_reports` → `daily_reports`
- `profiles` → `user_profiles`
- `report_date` → `date` column
- Disabled features for non-existent tables: `assistant_chief_reviews`, `inspector_assignments`

**Files Modified:**
- `src/AssistantChiefDashboard.jsx` - Query fixes, graceful feature degradation

---

### AI Agent Logs Query Fixes (February 11, 2026)

**Database Column Corrections**
- Fixed 400 Bad Request errors on `ai_agent_logs` queries in Welding Chief Dashboard
- Table uses array-based ticket tracking and date ranges, not single-ticket columns

**Column Mapping Corrections:**
| Incorrect | Correct |
|-----------|---------|
| `ticket_id` | `ticket_ids` (UUID array) |
| `ticket_date` | `date_range_start` / `date_range_end` |
| `analyzed_at` | `created_at` |

**Query Changes:**
- Select: `ticket_id, ticket_date` → `ticket_ids, date_range_start, date_range_end`
- Filter: `.eq('ticket_date', date)` → `.lte('date_range_start', date).gte('date_range_end', date)`
- Order: `.order('analyzed_at', ...)` → `.order('created_at', ...)`

**Files Modified:**
- `src/weldingChiefHelpers.js` - Fixed three query locations (lines 264, 421-425, 546)

---

### Chief / Welding Chief Report Separation (February 11, 2026)

**Report Routing by Activity Type**
- Reports are now routed to the appropriate dashboard based on activity type
- Welding Chief Dashboard only shows reports with welding activities
- Chief Dashboard shows all other reports (excludes welding reports)

**Welding Activity Detection (Prefix Matching):**
| Activity Prefix | Examples |
|-----------------|----------|
| `welding -` | Welding - Mainline, Welding - Section Crew, Welding - Poor Boy, Welding - Tie-in |
| `mainline welding` | Mainline Welding |
| `welder testing` | Welder Testing Log |

**Why Prefix Matching?**
- Previous `includes()` matching caused false positives
- "Tie-In Completion" was incorrectly matching "tie-in" (welding activity)
- Changed to `startsWith()` for precise activity type detection

**Helper Function:**
```javascript
function hasWeldingActivities(report) {
  const blocks = report?.activity_blocks || []
  return blocks.some(block => {
    const activityType = (block.activityType || '').toLowerCase()
    return WELDING_ACTIVITY_PREFIXES.some(prefix => activityType.startsWith(prefix))
  })
}
```

**Files Modified:**
- `src/ChiefDashboard.jsx` - Excludes welding reports from review queues
- `src/WeldingChiefDashboard.jsx` - Filters to only welding reports
- `src/components/WeldingReportReviewTab.jsx` - Precise welding activity matching

---

### AI Document Search & RAG System (February 10-11, 2026)

**Document Processing for AI Agent Search**
- RAG (Retrieval-Augmented Generation) architecture for document queries
- Documents processed, chunked, and embedded for semantic search
- AI Agent can search both Project Document Vault and Technical Resource Library

**Edge Function: `process-document`**
- Extracts text from PDF, DOCX, and plain text files
- Multiple PDF extraction methods (BT/ET blocks, text streams, readable strings)
- DOCX extraction via XML text element parsing
- Text chunking with 2000-char chunks and 300-char overlap
- Parallel embedding generation (batch size 5) for performance
- 50-second timeout protection for large documents
- Stores embeddings in `document_embeddings` table

**Vector Search Architecture**
- OpenAI `text-embedding-ada-002` model for embeddings (1536 dimensions)
- PostgreSQL pgvector extension for similarity search
- `match_documents` RPC function with configurable threshold (0.6 default)
- Dual search: Organization-specific + Global library documents
- Global documents use fixed org ID: `00000000-0000-0000-0000-000000000001`

**Auto-Indexing on Upload**
- Documents automatically indexed when uploaded via Admin Portal
- Visual feedback: Green badge shows indexed chunk count
- Error guidance for failed indexing (suggests .txt conversion for PDFs)

**Re-Index Buttons (Admin Portal)**
- "Re-index All Library Documents for AI" - Technical Resource Library
- "Re-index All Vault Documents for AI" - Project Document Vault
- Progress indicator during re-indexing
- Updates document `is_global` and `organization_id` for proper search

**Drawing Index System**
- `Typical_Drawings_Index.txt` - Searchable metadata for 35 typical drawings
- Contains drawing numbers, titles, page numbers, and rich keywords
- Allows AI to find specific drawings (e.g., "road bore crossing" → TYP-1002, Page 4)
- Quick reference sections by category (Crossings, Ditch, Valve Sites, etc.)

**New Database Table: `document_embeddings`**
```
id, organization_id, source_type, source_id, source_url
document_name, document_category, chunk_index, chunk_text
embedding (vector 1536), metadata (JSONB)
created_at, updated_at
```

**New Edge Functions:**
```
supabase/functions/process-document/index.ts   # Document processing & embedding
supabase/functions/mentor-nlq/index.ts         # Natural language query handler
```

**New Migration:**
```
supabase/migrations/20260210_add_contractor_schedule_category.sql
```

**Files Modified:**
- `src/AdminPortal.jsx` - Auto-indexing, re-index buttons, visual feedback
- Accept attributes updated for `.txt,.md,.csv` uploads
- All vault categories now support addenda (supporting documents)

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
- 10 document categories with traffic light status indicators:
  - Prime Contract, Scope of Work, IFC Drawings, Typical Drawings
  - Project Specifications, Weld Procedures (WPS), Contractor Schedule
  - ERP, EMP, ITP
- Green dot = uploaded, Red dot = missing
- Version control with automatic revision tracking (Rev 0, Rev 1, Rev 2...)
- Document history modal showing all versions with timestamps
- Addenda (supporting documents) support for ALL categories
- Auto-indexing for AI search on upload
- "Re-index All Vault Documents" button for batch processing
- Visual indicator showing indexed chunk count per document

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
- 5 global reference document categories:
  - API 1169 - Pipeline Construction Inspection
  - CSA Z662 - Oil & Gas Pipeline Systems
  - Practical Guide for Pipeline Construction Inspectors
  - Pipeline Inspector's Playbook
  - Pipeline Rules of Thumb
- Read-only access for all users
- Super Admin: Upload, Replace, Delete capabilities
- Documents marked as `is_global: true` for cross-org access
- AI-indexed for semantic search via "Ask the Agent" feature
- "Re-index All Library Documents" button for batch processing
- Available across all organizations (independent of org selection)

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
- Known issue: Section collapses on field changes (to be fixed)

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
*Last Updated: February 11, 2026 (Chief / Welding Chief Report Separation)*
