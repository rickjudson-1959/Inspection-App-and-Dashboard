# PIPE-UP PROJECT MANIFEST
## Pipeline Inspector SaaS Application

**Last Updated:** January 20, 2026  
**Version:** 2.0  
**Stack:** React + Vite + Supabase + Vercel  
**Live URL:** https://app.pipe-up.ca  
**API Domain:** https://api.pipe-up.ca (custom domain verified)

---

## 📁 FILE INVENTORY (95+ files in /src)

### 📀 ROUTING & CORE
| File | Lines | Purpose |
|------|-------|---------|
| `main.jsx` | 5,400+ | **ROUTER** - All routes defined here. Check this first! |
| `supabaseClient.js` | ~50 | Supabase connection config |
| `AuthContext.jsx` | ~200 | Auth state management with role-based access |

### 📝 INSPECTOR MODULE
| File | Lines | Purpose |
|------|-------|---------|
| `InspectorReport.jsx` | 4,713 | **MAIN FORM** - Daily inspection ticket entry |
| `constants.js` | 800+ | Activity types, quality fields, equipment lists, EGP pipeline data |
| `ActivityBlock.jsx` | ~600 | Collapsible activity sections with QA fields |
| `StringingLog.jsx` | ~400 | Joint tracking with OCR import |
| `WeldLog.jsx` | ~350 | Weld data capture |
| `CoatingLog.jsx` | ~300 | Coating inspection data |
| `BendingLog.jsx` | ~250 | Bending data capture |
| `GradingLog.jsx` | ~700 | Grading inspection with ALL collapsible sections |
| `TallySheetScanner.jsx` | ~300 | OCR camera/file upload for joint import |
| `TrackableItemsTracker.jsx` | ~400 | Mats, fencing, ramps with linking |

### 💼 ADMIN MODULE
| File | Lines | Purpose |
|------|-------|---------|
| `AdminPortal.jsx` | 1,200+ | **ADMIN HUB** - User management, reports, approvals, billing |
| `ReconciliationDashboard.jsx` | ~800 | LEM verification, billing reconciliation with audit logging |
| `auditLoggerV3.js` | ~150 | Centralized audit logging for all financial changes |

### 👷 CHIEF INSPECTOR MODULE
| File | Lines | Purpose |
|------|-------|---------|
| `ChiefInspectorPortal.jsx` | ~600 | Report queue, approval workflow |
| `ReportViewer.jsx` | 1,000+ | **FULL REPORT VIEW** - All report data with approve/reject buttons |

### 💰 INSPECTOR INVOICING MODULE
| File | Lines | Purpose |
|------|-------|---------|
| `InspectorInvoicing.jsx` | ~800 | Timesheet dashboard for inspectors |
| `TimesheetEditor.jsx` | ~600 | Create/edit timesheets with auto-population from daily tickets |
| `inspector_timesheets` | DB Table | Timesheet headers (date range, status, totals) |
| `inspector_timesheet_items` | DB Table | Line items linked to daily tickets |
| `inspector_rate_cards` | DB Table | Rate cards for billing calculations |

### 🔧 UTILITIES
| File | Purpose |
|------|---------|
| `pdfExport.js` | PDF generation for reports |
| `excelExport.js` | Excel export functionality |
| `weatherService.js` | Weather API integration |

---

## ✅ COMPLETED FEATURES (as of Jan 20, 2026)

### Core Inspection System
- ✅ Multi-activity daily inspection tickets
- ✅ 20 construction phase types (Clearing through Hydrostatic Testing)
- ✅ Collapsible sections for field usability
- ✅ Quality fields per activity type
- ✅ EGP Project pipeline breakdown (Indian Arm to Woodfibre LNG)
- ✅ Weather auto-fill from API
- ✅ Voice-to-text input support
- ✅ Photo capture and upload
- ✅ Trackable items (mats, fencing, ramps with linking)

### Activity-Specific Logs with Collapsible Sections
- ✅ **GradingLog.jsx** - ALL sections collapsible (Jan 20):
  - 🛤️ ROW CONDITIONS
  - ⚠️ PILE SEPARATION (yellow highlight)
  - 🌱 TOPSOIL STATUS
  - 💧 DRAINAGE
  - 🌿 ENVIRONMENTAL CONTROLS (green highlight)
  - 🚧 SOFT SPOTS / PROBLEM AREAS (yellow highlight)
  - 🚗 ACCESS & CROSSINGS (blue highlight)
  - 📝 COMMENTS
- ✅ **TopsoilLog** - Collapsible sections
- ⚠️ **StringingLog** - Quality checks need restoration (identified Jan 20)

### OCR & Data Import
- ✅ Tally sheet OCR scanner (Claude Vision)
- ✅ Joint data extraction and preview
- ✅ Import selected joints to StringingLog
- ✅ Source tracking (`tally_sheet`) for audit

### Workflow & Approvals
- ✅ Submit → Review → Approve/Reject workflow
- ✅ Revision notes with status tracking
- ✅ Email notifications on status changes
- ✅ Report status badges throughout UI

### ReportViewer (Updated Jan 19)
- ✅ Full report display for Admin/Chief Inspector
- ✅ All sections rendered: Report Info, Weather, Activities, Manpower, Equipment, Quality Checks, Specialized Data, Trackable Items, Safety, Wildlife, Visitors, UPI, Comments, Photos
- ✅ **Approve/Reject buttons** directly on report view
- ✅ Rejection modal with required revision notes
- ✅ Status updates without leaving page
- ✅ Role-based button visibility (Chief Inspector, Admin, Super Admin only)

### AdminPortal (Updated Jan 19)
- ✅ **Pending Approvals tab** - View button opens ReportViewer
- ✅ **Inspector Reports tab** - View button alongside Edit button
- ✅ User management with delete functionality
- ✅ Delete user Edge Function (preserves reports, removes auth)

### Billing & Reconciliation
- ✅ LEM verification workflow
- ✅ Side-by-side digital vs. uploaded timesheet comparison
- ✅ Discrepancy notes (mandatory for disputes)
- ✅ Batch invoice creation
- ✅ Status tracking: Open → Matched → Ready for Billing → Invoiced
- ✅ Full audit logging via auditLoggerV3.js
- ✅ "No Talk" transparency - all adjustments visible

### Inspector Invoicing System
- ✅ **Phase 1:** Inspector profile with rate cards
- ✅ **Phase 2:** Invoicing dashboard with timesheet list
- ✅ **Phase 3:** Timesheet editor with auto-population
  - Select date range
  - Auto-populate from daily tickets
  - Edit per diem, mileage, notes
  - Preview invoice calculations
  - Submit for review
- ⏳ **Phase 4:** Admin Review Queue (next)
- ⏳ **Phase 5:** Approval workflow with notifications
- ⏳ **Phase 6:** Rate card management and reporting

### Audit Trail System
- ✅ Report header changes
- ✅ Weather changes
- ✅ Time changes
- ✅ Notes changes
- ✅ Activity block add/delete
- ✅ Workflow actions (submit/resubmit)
- ✅ Financial adjustments (auditLoggerV3)
- ⏳ Quality field changes within blocks
- ⏳ Specialized log changes (Stringing, Weld, Coating, Bending)
- ⏳ Trackable item changes
- ⏳ UPI quantity changes
- ⏳ Labour/Equipment entry changes
- ⏳ Photo additions/deletions

### Infrastructure
- ✅ Custom domain verified (app.pipe-up.ca, api.pipe-up.ca)
- ✅ Auth emails working
- ✅ Supabase Edge Functions deployed
- ✅ GitHub → Vercel CI/CD pipeline

---

## 🗄️ DATABASE TABLES

### Core Tables
| Table | Purpose |
|-------|---------|
| `daily_tickets` | Inspector report data (JSON blob) |
| `report_status` | Workflow status tracking |
| `report_audit_log` | Change history for reports |
| `user_profiles` | User data with roles |
| `trackable_items` | Mats, fencing, equipment inventory |

### Inspector Invoicing Tables
| Table | Purpose |
|-------|---------|
| `inspector_profiles` | Inspector-specific data (company, GST#, address) |
| `inspector_timesheets` | Timesheet headers |
| `inspector_timesheet_items` | Line items linked to daily_tickets |
| `inspector_rate_cards` | Billing rates per inspector |

### Billing Tables
| Table | Purpose |
|-------|---------|
| `lem_records` | Labour/Equipment/Materials data |
| `billing_reconciliation` | Verification records |
| `billing_audit_log` | Financial change tracking |

---

## 🔐 RLS POLICIES

```sql
-- Reports
CREATE POLICY "Allow authenticated users to read reports" 
ON daily_tickets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to read report status" 
ON report_status FOR SELECT TO authenticated USING (true);

-- Audit Logs
CREATE POLICY "Users can view audit logs" 
ON report_audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert audit logs" 
ON report_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- Inspector Invoicing
CREATE POLICY "Inspectors can view own timesheets"
ON inspector_timesheets FOR SELECT TO authenticated 
USING (inspector_id = auth.uid());

CREATE POLICY "Admins can view all timesheets"
ON inspector_timesheets FOR SELECT TO authenticated 
USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));
```

---

## 🚀 DEPLOYMENT

```bash
# From project directory
cd ~/Documents/"Inspection App and Dashboard"
git add .
git commit -m "Update"
git push origin main
# Vercel auto-deploys from main branch
```

---

## ⚠️ KNOWN ISSUES / IN PROGRESS

| Issue | Status | Notes |
|-------|--------|-------|
| StringingLog quality checks | Needs fix | Should have collapsible sections like GradingLog |
| TrackableItemsTracker | Intermittent | Items sometimes save with null report_id on new reports |
| ReportWorkflow.jsx import | Fixed | Had broken supabaseClient import path |

---

## 📋 DEVELOPMENT ROADMAP

### Immediate (Phase 4-6 Invoicing)
1. Admin Review Queue for timesheets
2. Timesheet approval workflow with notifications
3. Rate card management UI
4. Invoice PDF generation
5. Reporting dashboard

### Short-term
1. Fix StringingLog collapsible quality sections
2. Complete audit logging for all components
3. Chief's Aggregate Report (multiple inspector reports)
4. Audit History Viewer UI panel
5. Dashboard analytics and charts

### Medium-term
1. Mobile-optimized field interface
2. Offline capability with sync
3. API 1169 compliance checklist integration
4. Contractor portal (read-only access)

---

## 📞 KEY CONTACTS

- **David Pfeiffer** - FortisBC Director of Major Projects (expressed interest in testing)
- **Dave Fitton** - Senior welding inspector (invited to test welding reports)
- **Pembina Pipeline** - Industry contact
- **Michels Canada** - Industry contact

---

## 🔄 RECENT CHANGES LOG

| Date | What Changed |
|------|--------------|
| **Jan 20, 2026** | GradingLog.jsx - ALL sections now collapsible |
| **Jan 20, 2026** | Identified StringingLog quality checks need restoration |
| **Jan 20, 2026** | Fixed ReportWorkflow.jsx supabaseClient import error |
| **Jan 19, 2026** | ReportViewer - Approve/Reject buttons added |
| **Jan 19, 2026** | AdminPortal - View buttons added to Approvals & Reports tabs |
| **Jan 17, 2026** | Delete User functionality with Edge Function |
| **Jan 17, 2026** | Billing Reconciliation with "No Talk" transparency |

---

## 📝 NOTES

- Daily tickets use integer IDs (not UUIDs) - handle accordingly in joins
- Inspector timesheet items link via `daily_ticket_id` foreign key
- All financial changes require audit logging via auditLoggerV3
- "No Talk" transparency means no behind-the-scenes adjustments
- Rick prefers SQL as copyable text for Supabase SQL Editor (not file downloads)

---

*Keep this manifest updated when making significant changes!*
