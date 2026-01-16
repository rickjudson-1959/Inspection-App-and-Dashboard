# PIPE-UP PROJECT MANIFEST
## Pipeline Inspector SaaS Application

**Last Updated:** January 16, 2026  
**Version:** 1.7  
**Stack:** React + Vite + Supabase + Vercel  
**Live URL:** https://app.pipe-up.ca  
**API Domain:** https://api.pipe-up.ca (custom domain verified)

---

## 📁 FILE INVENTORY (80+ files in /src)

### 📀 ROUTING & CORE
| File | Lines | Purpose |
|------|-------|---------|
| `main.jsx` | 5,400 | **ROUTER** - All routes defined here. Check this first! |
| `App.jsx` | 209,594 | Legacy main app (being phased out) |
| `AuthContext.jsx` | 3,501 | Authentication provider, user roles |
| `supabase.js` | 231 | Supabase client config |
| `constants.js` | 23,976 | **CRITICAL** - Activity types, quality fields, options |
| `projectConfig.js` | 5,046 | Project-specific settings |
| `auditHelpers.js` | ~300 | Audit trail utility functions (legacy) |
| `auditLogger.js` | ~200 | **V2** - Precision-based audit logging with auto-classification |
| `useActivityAudit.js` | ~150 | **CORE HOOK** - Reusable audit hook for ALL activity Log components |
| `egpRouteData.js` | ~180K | **NEW Jan 15** - EGP pipeline survey data extracted from KMZ |

### 📊 DASHBOARDS & ADMIN
| File | Lines | Purpose |
|------|-------|---------|
| `AdminPortal.jsx` | ~60K | Admin dashboard - users, reports, mats, audit |
| `Dashboard.jsx` | 56,566 | Main project dashboard |
| `ChiefDashboard.jsx` | 1,269 | **UPDATED Jan 16** - Chief Inspector view with Daily Summary data aggregation and display |
| `chiefReportHelpers.js` | 1,225 | **NEW Jan 16** - Helper functions for Chief Dashboard: report aggregation, welding progress, section progress |
| `EVMDashboard.jsx` | ~45K | **Earned Value Management** - Demo data with 4 views |
| `evmCalculations.js` | 16,576 | EVM calculation logic |
| `ReconciliationDashboard.jsx` | 92,740 | LEM reconciliation |
| `WeeklyExecutiveSummary.jsx` | 30,497 | Executive reports |
| `AuditDashboard.jsx` | ~1200 | **UPDATED Jan 13** - System-wide audit trail viewer with entity type filtering |
| `RegulatoryDashboard.jsx` | ~1200 | CER/BCER/AER compliance portal with 6 tabs |

### 📝 INSPECTOR REPORTS
| File | Lines | Purpose |
|------|-------|---------|
| `InspectorReport.jsx` | 4,712 | **UPDATED Jan 16** - Main daily inspection entry form, PDF export, added counterboreData persistence |
| `ActivityBlock.jsx` | 75,440 | **UPDATED Jan 15** - Fixed manpower/equipment/meters layout spacing |
| `ReportViewer.jsx` | 23,210 | Read-only report view for admin/chief |
| `ReportWorkflow.jsx` | 16,503 | Submit/approve/revision workflow |
| `RequestRevision.jsx` | 9,342 | Revision request handling |
| `MyReports.jsx` | 14,470 | Inspector's report history |
| `ReportsPage.jsx` | 15,398 | Reports listing/search |
| `InspectorApp.jsx` | 9,929 | Inspector app wrapper |

### 🤖 AI AGENTS & OCR
| File | Purpose |
|------|---------|
| `TopsoilReviewerAgent.js` | AI environmental compliance review |
| `TallySheetScanner.jsx` | OCR scanner for pipe tally sheets |

### 🔧 ACTIVITY-SPECIFIC LOGS (with Audit Trail)

#### ✅ AUDIT TRAIL COMPLETE (12 components)
| File | Lines | Activity Type | Audit Status |
|------|-------|---------------|--------------|
| `useActivityAudit.js` | ~150 | **CORE HOOK** | ✅ **DEPLOYED** - Foundation for all auditing |
| `EquipmentCleaningLog.jsx` | ~400 | Equipment Cleaning | ✅ **DEPLOYED** - Full audit trail |
| `WelderTestingLog.jsx` | ~500 | Welder Testing | ✅ **DEPLOYED** - Full audit trail |
| `HydrovacLog.jsx` | ~450 | Hydrovac | ✅ **DEPLOYED** - Full audit trail |
| `TimberDeckLog.jsx` | ~400 | Timber Deck/TSP | ✅ **DEPLOYED** - Full audit trail |
| `PilingLog.jsx` | ~600 | Piling | ✅ **DEPLOYED** - Full audit trail |
| `HDDLog.jsx` | ~700 | HDD | ✅ **DEPLOYED** - Full audit trail |
| `DitchLog.jsx` | ~750 | Ditching | ✅ **DEPLOYED** - Full audit trail |
| `TieInCompletionLog.jsx` | ~950 | Tie-In Completion | ✅ **DEPLOYED** - Full audit trail |
| `GradingLog.jsx` | ~1000 | Grading | ✅ **DEPLOYED** - Full audit trail |
| `HydrotestLog.jsx` | ~1171 | Hydrostatic Testing | ✅ **DEPLOYED** - Full audit trail with pigging |
| `AuditDashboard.jsx` | ~1200 | Audit Viewer | ✅ **DEPLOYED** - Entity type filtering |

#### ✅ PREVIOUSLY AUDITED
| File | Lines | Activity Type | Audit Status |
|------|-------|---------------|--------------|
| `ClearingLog.jsx` | ~400 | Clearing | ✅ **AUDITED** - BCER soil/environmental |
| `StringingLog.jsx` | ~850 | Stringing | ✅ **AUDITED** |
| `BendingLog.jsx` | ~550 | Bending | ✅ **AUDITED** - ovality, bend angle |
| `MainlineWeldData.jsx` | 29,935 | Mainline Welding | ✅ **AUDITED** |
| `CoatingLog.jsx` | ~600 | Coating | ✅ **AUDITED** - cure tests, inspections |

### 📍 TRACKING & CROSSINGS
| File | Lines | Purpose |
|------|-------|---------|
| `CrossingsManager.jsx` | 42,273 | **CROSSINGS** - Foreign pipe, roads, utilities |
| `TrackableItemsTracker.jsx` | 23,520 | Mats, fencing, ramps, goal posts, etc. |
| `MatTracker.jsx` | 15,599 | Mat tracking (legacy) |
| `BaselineManager.jsx` | 32,728 | Project baselines |

### 🗺️ MAPPING
| File | Lines | Purpose |
|------|-------|---------|
| `PipelineMap.jsx` | 21,619 | Full pipeline map |
| `MapDashboard.jsx` | 9,146 | Map dashboard |
| `MiniMapWidget.jsx` | ~850 | **UPDATED Jan 15** - Real EGP survey data with all layers |
| `egpRouteData.js` | ~180K | **NEW Jan 15** - Extracted KMZ survey data |
| `kpUtils.js` | 9,928 | KP parsing/formatting utilities |

### 📧 NOTIFICATIONS
| File | Lines | Purpose |
|------|-------|---------|
| `send-report-email.js` | 7,150 | Email report function |
| `send-executive-summary-edge-function.ts` | 3,138 | Executive summary emails |

### 📂 OTHER
| File | Lines | Purpose |
|------|-------|---------|
| `ContractorLEMs.jsx` | 38,420 | Contractor LEM import/view |
| `RateImport.jsx` | 25,209 | Rate import |
| `ChangeManagement.jsx` | 28,692 | Change orders |
| `ComplianceAuditTrail.jsx` | 28,057 | Audit trail viewer |
| `SafetyRecognition.jsx` | 26,130 | Safety/Hazard recognition cards |
| `WildlifeSighting.jsx` | 24,576 | Wildlife sightings |

---

## 🗺️ EGP ROUTE DATA (NEW Jan 15)

### Data Extracted from FortisBC KMZ Files
| Data Type | Count | Source |
|-----------|-------|--------|
| Centerline coordinates | 774 | North Line asbuilt survey |
| KP markers | 367 | Every 100m from KP 0+000 to 38+470 |
| Welds | 451 | Field weld locations with IDs |
| Bends (horizontal) | 248 | Left/Right/Over bends with angles |
| Sag bends (vertical) | 108 | Vertical sag bends |
| Footprint polygons | 248 | Construction corridor boundaries |
| Open ends | 36 | Begin/Leave pipe string markers |
| Bore faces (HDD) | 2 | Railway crossing entry/exit |

### MiniMapWidget Layer Toggles
- ✅ Footprint (248 polygons) - Purple shaded
- ✅ Centerline (774 points) - Orange line
- ✅ KP Markers (367) - Blue dots
- ✅ Welds (451) - Red dots
- ✅ Bends (248) - Orange dots
- ✅ Sag Bends (108) - Brown dots (off by default)
- ✅ Open Ends (36) - Green/Red dots
- ✅ HDD/Bore Faces (2) - Cyan dots
- ✅ Pipeline Start/End markers

---

## 🗄️ DATABASE TABLES (Supabase)

### Core Tables
| Table | Purpose |
|-------|---------|
| `daily_tickets` | Main inspection reports |
| `daily_reports` | Alternative report storage |
| `activity_blocks` | Activity data per report |
| `user_profiles` | User accounts & roles |
| `projects` | Project definitions |
| `organizations` | Organization/company data |

### Activity-Specific Tables
| Table | Purpose |
|-------|---------|
| `stringing_log` | Pipe stringing records |
| `stringing_daily_summary` | Daily stringing totals |
| `mainline_welds` | Mainline weld data |
| `tiein_welds` | Tie-in weld data |
| `weld_daily_summary` | Daily weld totals |
| `bend_daily_summary` | Daily bend totals |
| `bending_log` | Bending records |
| `clearing_inspections` | Clearing inspection data |
| `coating_types` | Coating type definitions |

### Tracking Tables
| Table | Purpose |
|-------|---------|
| `trackable_items` | Mats, fencing, ramps, goal posts |
| `mat_transactions` | Mat movement history |
| `crossings` | Pipeline crossings |
| `crossing_status_log` | Crossing status changes |

### Workflow & Audit Tables
| Table | Purpose |
|-------|---------|
| `report_status` | Approval workflow status |
| `report_audit_log` | **AUDIT TRAIL V2** - Enhanced with regulatory classification |
| `contract_config` | Project-specific audit settings |
| `pending_approvals` | Pending approval queue |

### Regulatory Compliance Tables
| Table | Purpose |
|-------|---------|
| `depth_of_cover` | CER/BCER burial depth measurements |
| `mtr_records` | Mill Test Report tracking |
| `environmental_commitments` | CER/BCER commitment tracking |
| `indigenous_participation` | CER indigenous employment |
| `soil_handling` | BCER topsoil/subsoil requirements |

### Configuration Tables
| Table | Purpose |
|-------|---------|
| `pipe_specifications` | Pipe spec definitions |
| `wall_thickness_options` | Wall thickness by pipe size |
| `project_design_spec` | Design specs by station |
| `pup_config` | Pup length configurations |
| `wps_configurations` | Welding procedure specs |
| `labour_rates` | Labour rate schedules |
| `equipment_rates` | Equipment rate schedules |

---

## 🔐 AUDIT TRAIL SYSTEM V2

### Database Schema (Enhanced)
```sql
report_audit_log (
  id UUID PRIMARY KEY,
  report_id UUID,
  report_date DATE,
  entity_type TEXT,           -- 'EquipmentCleaningLog', 'HydrovacLog', 'PilingLog', etc.
  entity_id TEXT,
  section TEXT,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  change_type TEXT,           -- 'create', 'edit', 'delete'
  changed_by UUID,
  changed_by_name TEXT,
  changed_by_role TEXT,
  change_reason TEXT,
  kp_start TEXT,
  kp_end TEXT,
  changed_at TIMESTAMPTZ,
  -- V2 Columns
  action_type TEXT,           -- 'field_change', 'entry_add', 'entry_delete', 'status_change'
  is_critical BOOLEAN,        -- Auto-flagged for regulatory fields
  regulatory_category TEXT,   -- 'integrity', 'environmental', 'soil_handling', 'indigenous_social', 'archaeological', 'general'
  joint_number TEXT,
  weld_number TEXT,
  metadata JSONB
)
```

### Usage Pattern
```jsx
import { useActivityAudit } from './useActivityAudit.js'

function SomeLog({ logId, reportId, data, onUpdate }) {
  const { createAuditProps, logEntryAdd, logEntryDelete, logEntryFieldChange } = useActivityAudit({
    entityType: 'SomeLog',
    logId,
    reportId
  })

  return (
    <input
      {...createAuditProps('fieldName', data.fieldName, 'Section Name')}
      value={data.fieldName || ''}
      onChange={(e) => onUpdate('fieldName', e.target.value)}
    />
  )
}
```

### Tracked Operations
1. **Field Changes**: onFocus captures original → onBlur logs if changed
2. **Nested Fields**: Parent.field pattern for nested objects (e.g., `backfill.method`)
3. **Entry Additions**: Logged when adding entries to arrays
4. **Entry Deletions**: Logged with entry identifier when removing
5. **Entry Field Changes**: Tracked per-entry with entry label context

---

## 🛤️ ROUTES (in main.jsx)

| Route | Component | Access |
|-------|-----------|--------|
| `/` | Dashboard | All authenticated |
| `/admin` | AdminPortal | admin+ |
| `/chief` | ChiefDashboard | chief_inspector+ |
| `/inspector` | InspectorReport | All authenticated |
| `/inspector?edit=ID` | InspectorReport (edit mode) | Admin/Chief |
| `/report?id=ID` | ReportViewer | Admin/Chief/PM/CM |
| `/crossings` | CrossingsManager | Admin/Chief/PM/CM |
| `/evm` | EVMDashboard | Admin/PM/CM/Chief/Exec |
| `/reconciliation` | ReconciliationDashboard | Admin/PM/CM/Chief |
| `/changes` | ChangeManagement | Admin/PM/CM/Chief |
| `/reports` | ReportsPage | Admin/PM/CM/Chief |
| `/contractor-lems` | ContractorLEMs | Admin/PM/CM/Chief |
| `/audit` | AuditDashboard | Admin/Chief |
| `/regulatory` | RegulatoryDashboard | Admin/Chief/Auditor |
| `/map` | MapDashboard | All authenticated |

---

## 👤 USER ROLES

| Role | Access Level |
|------|--------------|
| `super_admin` | Everything |
| `admin` | Everything except super_admin functions |
| `chief_inspector` | Reports, approvals, dashboards |
| `pm` | Project Manager - dashboards, reports |
| `cm` | Construction Manager - dashboards, reports |
| `executive` | Executive dashboards only |
| `inspector` | Own reports only |
| `auditor` | Read-only regulatory dashboard access |

---

## 📄 RECENT CHANGES LOG

| Date | Files Changed | What Changed |
|------|---------------|--------------|
| **Jan 16, 2026** | `ChiefDashboard.jsx` | **MAJOR FIX** - Restored Daily Summary UI to display aggregated data (welding progress, section progress, personnel, weather) |
| **Jan 16, 2026** | `chiefReportHelpers.js` | **NEW** - Created helper functions for Chief Dashboard: `fetchApprovedReportsForDate`, `aggregateWeldingProgress`, `aggregateProgressBySection`, `aggregatePersonnel`, `aggregateWeather`, etc. |
| **Jan 16, 2026** | `chiefReportHelpers.js` | **FIXED** - Fixed `aggregateWeldingProgress` to extract welding data from `activity_blocks` in reports instead of querying non-existent database tables |
| **Jan 16, 2026** | `chiefReportHelpers.js` | **ENHANCED** - Added JSON parsing for `activity_blocks` in case Supabase stores them as JSON strings |
| **Jan 16, 2026** | `chiefReportHelpers.js` | **ENHANCED** - Added comprehensive debug logging for data extraction diagnosis |
| **Jan 16, 2026** | `InspectorReport.jsx` | **FIXED** - Added `counterboreData` to saved activity blocks for tie-in welding data persistence |
| **Jan 16, 2026** | `InspectorReport.jsx` | **CLEANUP** - Removed orphaned Topsoil AI review code that was causing syntax errors |
| **Jan 15, 2026** | `egpRouteData.js` | **NEW** - Extracted all EGP survey data from KMZ files |
| **Jan 15, 2026** | `MiniMapWidget.jsx` | **MAJOR UPDATE** - Real survey data: 774 centerline pts, 367 KP markers, 451 welds, 248 bends, 108 sag bends, 248 footprint polygons, 36 open ends, 2 HDD bore faces |
| **Jan 15, 2026** | `ActivityBlock.jsx` | **UPDATED** - Fixed manpower/equipment/meters layout with CSS grid, proper spacing, box-sizing |
| **Jan 13, 2026** | `HydrotestLog.jsx` | **DEPLOYED** - Full audit trail with pigging section |
| **Jan 13, 2026** | `useActivityAudit.js` | **DEPLOYED** - Core audit hook for all Log components |
| **Jan 13, 2026** | `EquipmentCleaningLog.jsx` | **DEPLOYED** - Full audit trail |
| **Jan 13, 2026** | `WelderTestingLog.jsx` | **DEPLOYED** - Full audit trail |
| **Jan 13, 2026** | `HydrovacLog.jsx` | **DEPLOYED** - Full audit trail |
| **Jan 13, 2026** | `TimberDeckLog.jsx` | **DEPLOYED** - Full audit trail |
| **Jan 13, 2026** | `PilingLog.jsx` | **DEPLOYED** - Full audit trail |
| **Jan 13, 2026** | `HDDLog.jsx` | **DEPLOYED** - Full audit trail |
| **Jan 13, 2026** | `DitchLog.jsx` | **DEPLOYED** - Full audit trail |
| **Jan 13, 2026** | `TieInCompletionLog.jsx` | **DEPLOYED** - Full audit trail |
| **Jan 13, 2026** | `GradingLog.jsx` | **DEPLOYED** - Full audit trail |
| **Jan 13, 2026** | `AuditDashboard.jsx` | **DEPLOYED** - Added entity type filtering |
| **Jan 11, 2026** | `auditLogger.js` | Precision-based audit logging with auto-classification |
| **Jan 11, 2026** | `BendingLog.jsx` | Full audit trail integration |
| **Jan 11, 2026** | `CoatingLog.jsx` | Full audit trail integration |
| **Jan 11, 2026** | `ClearingLog.jsx` | Full audit trail integration (BCER compliance) |
| **Jan 11, 2026** | `RegulatoryDashboard.jsx` | 6-tab compliance portal |
| **Jan 9, 2026** | `auditHelpers.js` | Comprehensive audit trail utility functions |
| **Jan 9, 2026** | Supabase | Custom domain `api.pipe-up.ca` verified and active |

---

## 📧 EMAIL & DOMAIN CONFIGURATION

### Custom Domains (✅ All Verified)
| Domain | Purpose | Status |
|--------|---------|--------|
| `app.pipe-up.ca` | Main application | ✅ Active (Vercel) |
| `api.pipe-up.ca` | Supabase API | ✅ Active |

### SMTP Configuration
- Provider: Zoho Mail
- Host: smtp.zoho.com
- Port: 465
- Sender: noreply@pipe-up.ca
- Status: ✅ Working

---

## ⚠️ KNOWN ISSUES / TODO

### High Priority
- [ ] Test audit dashboard with real data across all entity types
- [ ] Add CSV export to AuditDashboard

### Medium Priority
- [x] Chief's Daily Summary feature (aggregate multiple inspector reports) - **COMPLETED Jan 16, 2026**
- [ ] Add AI reviewer agents for Blasting, Coating, Grading
- [ ] Large App.jsx (209K) - legacy code being migrated out

### Low Priority
- [ ] PDF export - verify all Log data displays correctly
- [ ] Mobile optimization for field use

---

## 📋 SESSION CHECKLIST

When starting a new session with Claude, upload:

1. **Always:** `PROJECT_MANIFEST.md` (this file)
2. **Always:** `main.jsx` (routes)
3. **If working on activities:** `constants.js`
4. **If working on audit:** `useActivityAudit.js`
5. **If working on maps:** `MiniMapWidget.jsx`, `egpRouteData.js`
6. **If debugging:** The specific component + related files
7. **If adding features:** Related components

---

## 🏗️ ARCHITECTURE NOTES

### Activity System
- Activities defined in `constants.js` → `qualityFieldsByActivity`
- Rendered by `ActivityBlock.jsx`
- Most activities have dedicated Log components with full audit trail
- Collapsible sections use `type: 'collapsible'` with nested `fields`

### Audit Trail Architecture (V2)
- `useActivityAudit.js` provides the core hook for all Log components
- `report_audit_log` table with auto-classification trigger
- Changes tracked with: entity_type, section, field_name, old/new values
- Regulatory category auto-assigned based on field patterns
- Critical flag auto-set for regulatory-sensitive fields
- ActivityBlock passes `logId` and `reportId` to all Log components

### Audit Props Pattern
```jsx
// In ActivityBlock.jsx, each Log component receives:
<SomeLog
  logId={activity.id}          // Activity block ID
  reportId={reportId}          // From InspectorReport state
  // ... other props
/>
```

### EGP Route Data Architecture (NEW)
- `egpRouteData.js` contains all extracted survey data
- Imported by `MiniMapWidget.jsx` for map display
- Data structure:
  - `route.coordinates` - 774 centerline points
  - `kpMarkers` - 367 KP markers with lat/lon
  - `welds` - 451 welds with station, description
  - `bends` - 248 horizontal bends
  - `sagBends` - 108 vertical sag bends
  - `footprint` - 248 polygon arrays for construction corridor
  - `openEnds` - 36 begin/leave markers
  - `boreFaces` - 2 HDD entry/exit points

### Trackable Items
- Managed by `TrackableItemsTracker.jsx`
- Types: Mats, Fencing, Ramps, Goal Posts, Hydrovac, Erosion Control, Signage, Equipment Cleaning, Access Roads

### Report Flow
1. Inspector fills `InspectorReport.jsx`
2. Saves to `daily_tickets` table with `activity_blocks` (JSON) containing all activity data
3. Audit log records all field changes with regulatory classification
4. Admin/Chief views via `ReportViewer.jsx` or edits via `InspectorReport.jsx?edit=ID`
5. Approval workflow via Reports tab in AdminPortal
6. Regulatory dashboard provides compliance views
7. AuditDashboard allows filtering by entity type

### Chief Dashboard Daily Summary (NEW Jan 16, 2026)
- Aggregates data from multiple inspector reports for a given date
- Helper functions in `chiefReportHelpers.js`:
  - `fetchApprovedReportsForDate()` - Fetches all submitted/approved reports for a date
  - `aggregateWeldingProgress()` - Extracts welding data from `activity_blocks` (weldsToday, weldEntries, repairs)
  - `aggregateProgressBySection()` - Aggregates activities by spread/category
  - `aggregatePersonnel()` - Sums personnel counts across all reports
  - `aggregateWeather()` - Extracts weather data from reports
  - `aggregatePhotos()` - Collects photos from all reports
- Data extraction:
  - Reads `activity_blocks` from `daily_tickets` table
  - Parses JSON if needed (handles both string and object formats)
  - Extracts specialized data: `weldData`, `bendingData`, `stringingData`, `coatingData`, `counterboreData`
  - Aggregates by activity type and displays in tables
- UI displays: Welding Progress table, Section Progress table, Personnel Summary, Weather Data, Source Reports list

---

## 🔐 RLS POLICIES REQUIRED

```sql
-- Allow authenticated users to view audit logs
CREATE POLICY "Users can view audit logs" 
ON report_audit_log FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert audit logs
CREATE POLICY "Users can insert audit logs" 
ON report_audit_log FOR INSERT TO authenticated WITH CHECK (true);
```

---

## 🧪 TESTING AUDIT TRAIL

After deploying audit-enabled components:

1. Open an **existing saved report** (must have reportId)
2. Edit a field in any audit-enabled Log component
3. Tab/click out of the field
4. Check audit log:

```sql
SELECT entity_type, field_name, section, old_value, new_value, changed_at
FROM report_audit_log 
ORDER BY changed_at DESC 
LIMIT 20;
```

### Expected Entity Types in AuditDashboard:
- EquipmentCleaningLog
- WelderTestingLog  
- HydrovacLog
- TimberDeckLog
- PilingLog
- HDDLog
- DitchLog
- TieInCompletionLog
- GradingLog
- HydrotestLog
- BendingLog
- CoatingLog
- ClearingLog
- StringingLog

---

*Keep this file updated when making significant changes!*
