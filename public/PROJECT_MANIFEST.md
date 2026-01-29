# PIPE-UP PIPELINE INSPECTOR PLATFORM
## Project Manifest - January 26, 2026

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
| Backend | Supabase (PostgreSQL + Auth) |
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

---

## 5. SOURCE FILE STRUCTURE

```
/src/
├── main.jsx                    # App entry point
├── App.jsx                     # Routing & role-based access
├── AuthContext.jsx             # Authentication management
├── supabase.js                 # Supabase client
├── constants.js                # Activity types, classifications
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
    ├── SignaturePad.jsx
    ├── MapDashboard.jsx
    ├── OfflineStatusBar.jsx    # PWA status indicator (NEW - Jan 2026)
    └── [supporting components]

/supabase/migrations/
├── create_inspector_invoicing_tables.sql
├── create_trench_logs.sql
├── 20260120_add_padding_bedding_kp_columns.sql
├── 20260121_create_drilling_waste_logs.sql   # NEW - Directive 050
├── 20260121_create_bore_path_data.sql        # NEW - Steering log
└── [other migrations]
```

---

## 6. RECENT UPDATES (January 2026)

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
*Last Updated: January 26, 2026*
