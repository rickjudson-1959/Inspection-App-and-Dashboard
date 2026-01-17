# PIPE-UP PROJECT MANIFEST
## Pipeline Inspector SaaS Application

**Last Updated:** January 17, 2026  
**Version:** 1.8  
**Stack:** React + Vite + Supabase + Vercel  
**Live URL:** https://app.pipe-up.ca  
**API Domain:** https://api.pipe-up.ca (custom domain verified)

---

## 📁 FILE INVENTORY (90+ files in /src)

### 📀 ROUTING & CORE
| File | Lines | Purpose |
|------|-------|---------|
| `main.jsx` | 5,400 | **ROUTER** - All routes defined here. Check this first! |
| `App.jsx` | ~300 | **UPDATED Jan 15** - Role-based routing with ProtectedRoute |
| `AuthContext.jsx` | 3,501 | Authentication provider, user roles |
| `ProtectedRoute.jsx` | ~100 | **NEW Jan 15** - Role-based access control & route guards |
| `ResetPassword.jsx` | ~200 | **UPDATED Jan 17** - Fixed redirect_to preservation |
| `supabase.js` | 231 | Supabase client config |
| `constants.js` | 23,976 | **CRITICAL** - Activity types, quality fields, options |
| `projectConfig.js` | 5,046 | Project-specific settings |
| `auditHelpers.js` | ~300 | Audit trail utility functions (legacy) |
| `auditLogger.js` | ~200 | **V2** - Precision-based audit logging with auto-classification |
| `useActivityAudit.js` | ~150 | **CORE HOOK** - Reusable audit hook for ALL activity Log components |
| `egpRouteData.js` | ~180K | EGP pipeline survey data extracted from KMZ |
| `chiefReportHelpers.js` | ~1100 | **UPDATED Jan 15** - Fixed aggregation functions for Daily Summary |

### 🔐 ROLE-BASED NAVIGATION & USER MANAGEMENT
| File | Lines | Purpose |
|------|-------|---------|
| `ProtectedRoute.jsx` | ~100 | **CORE** - Route guards, role config, access control |
| `MasterSwitcher.jsx` | ~130 | **ADMIN GOD MODE** - Dropdown to jump between all dashboards |
| `InviteUser.jsx` | ~200 | **UPDATED Jan 17** - Secure invitation with Edge Function |
| `ResetPassword.jsx` | ~200 | **UPDATED Jan 17** - Preserves redirect_to parameter |

### 📊 DASHBOARDS & ADMIN
| File | Lines | Purpose |
|------|-------|---------|
| `AdminPortal.jsx` | ~1070 | **UPDATED Jan 15** - Added MasterSwitcher + InviteUser modal |
| `Dashboard.jsx` | ~1100 | **UPDATED Jan 15** - CMT Dashboard with role navigation buttons |
| `ChiefDashboard.jsx` | ~1250 | **UPDATED Jan 15** - Fixed Daily Summary display, added navigation |
| `AssistantChiefDashboard.jsx` | ~4100 | Assistant Chief view |
| `NDTAuditorDashboard.jsx` | ~1500 | NDT Auditor specialized view |
| `EVMDashboard.jsx` | ~45K | **Earned Value Management** - Demo data with 4 views |
| `evmCalculations.js` | 16,576 | EVM calculation logic |
| `ReconciliationDashboard.jsx` | 92,740 | LEM reconciliation |
| `WeeklyExecutiveSummary.jsx` | 30,497 | Executive reports |
| `AuditDashboard.jsx` | ~1200 | System-wide audit trail viewer with entity type filtering |
| `RegulatoryDashboard.jsx` | ~1200 | CER/BCER/AER compliance portal with 6 tabs |

### 📝 INSPECTOR REPORTS
| File | Lines | Purpose |
|------|-------|---------|
| `InspectorReport.jsx` | ~167K | **MAIN FORM** - Daily inspection entry, PDF export |
| `ActivityBlock.jsx` | 75,440 | Fixed manpower/equipment/meters layout spacing |
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

#### ✅ AUDIT TRAIL COMPLETE (11 components)
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
| `AuditDashboard.jsx` | ~1200 | Audit Viewer | ✅ **DEPLOYED** - Entity type filtering |

#### ⬜ AUDIT TRAIL PENDING (1 component)
| File | Lines | Activity Type | Audit Status |
|------|-------|---------------|--------------|
| `HydrotestLog.jsx` | ~1685 | Hydrostatic Testing | ❌ **PENDING** - Most complex component |

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
| `MiniMapWidget.jsx` | ~850 | Real EGP survey data with all layers |
| `egpRouteData.js` | ~180K | Extracted KMZ survey data |
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

## 🔐 ROLE-BASED ACCESS SYSTEM

### User Roles & Landing Pages
| Role | Landing Page | Display Name |
|------|--------------|--------------|
| `super_admin` | `/admin` | Super Administrator |
| `admin` | `/admin` | Administrator |
| `executive` | `/evm-dashboard` | Executive |
| `cm` | `/cmt-dashboard` | Construction Manager |
| `pm` | `/cmt-dashboard` | Project Manager |
| `chief_inspector` | `/chief-dashboard` | Chief Inspector |
| `assistant_chief_inspector` | `/assistant-chief` | Assistant Chief Inspector |
| `ndt_auditor` | `/ndt-auditor` | NDT Auditor |
| `inspector` | `/field-entry` | Field Inspector |

### Role Access Matrix
| Role | Field Entry | NDT | Asst Chief | Chief | CMT | EVM | Admin |
|------|-------------|-----|------------|-------|-----|-----|-------|
| `super_admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `executive` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `cm` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `pm` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `chief_inspector` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `assistant_chief_inspector` | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `ndt_auditor` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `inspector` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Navigation Buttons by Dashboard
| Dashboard | Buttons Available |
|-----------|-------------------|
| **Chief Dashboard** | 📊 View CMT Stats, 🔬 NDT Queue, + New Report |
| **CMT Dashboard** | 💰 View Financials (EVM), 👔 Chief Dashboard |
| **EVM Dashboard** | 📊 View Construction (CMT) |
| **Admin Portal** | 📧 Invite User, 📊 CMT, 💰 EVM, 👔 Chief |

### MasterSwitcher (Admin God Mode)
- Only visible to `admin` and `super_admin` roles
- Gold "🔑 GOD MODE" dropdown button in header
- Instant navigation to any dashboard

---

## 📧 INVITATION SYSTEM (UPDATED Jan 17)

### How It Works
1. Admin clicks "📧 Invite User" in Admin Portal
2. Fills in email, name, and role
3. Edge Function creates user in auth.users
4. Edge Function creates user_profiles record with role
5. Edge Function sends invitation email via Resend
6. User clicks link → goes to `/reset-password` to set password
7. After password set → redirects to role-specific dashboard

### Edge Function: `invite-user`
**Location:** `supabase/functions/invite-user/index.ts`

**Key Features:**
- Uses actual Supabase URL (not custom domain) for auth links
- Extracts token and reconstructs link with correct domain
- Maps form roles to database roles:
  - `chief` → `chief_inspector`
  - `exec` → `executive`
  - `asst_chief` → `assistant_chief_inspector`
- Creates user_profiles record with role
- Sends email via Resend SMTP

### Email Configuration
- **Provider:** Resend
- **SMTP Host:** smtp.resend.com
- **Sender:** auth@pipe-up.ca
- **Domain:** pipe-up.ca (verified)

### Troubleshooting Invites
1. Check Edge Function logs: **Edge Functions** → **invite-user** → **Logs**
2. Check Resend dashboard for email delivery status
3. User should check spam/updates folder
4. Verify SMTP settings in Supabase → Project Settings → Authentication

---

## 👤 USER MANAGEMENT

### Deleting Users
Users can be deleted from **Authentication** → **Users** in Supabase. Reports created by deleted users are preserved (created_by set to NULL).

**Database constraint fix applied (Jan 17):**
```sql
ALTER TABLE daily_tickets DROP CONSTRAINT daily_tickets_created_by_fkey;
ALTER TABLE daily_tickets 
ADD CONSTRAINT daily_tickets_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
```

### Manual User Deletion (if UI fails)
```sql
-- Delete from user_profiles first
DELETE FROM user_profiles WHERE email = 'user@example.com';

-- Clear auth sessions
DELETE FROM auth.sessions WHERE user_id = 'USER_UUID';
DELETE FROM auth.refresh_tokens WHERE user_id = 'USER_UUID';
DELETE FROM auth.identities WHERE user_id = 'USER_UUID';

-- Delete from auth.users
DELETE FROM auth.users WHERE id = 'USER_UUID';
```

---

## 🗄️ DATABASE TABLES (Supabase)

### Core Tables
| Table | Purpose |
|-------|---------|
| `daily_tickets` | Main inspection reports |
| `daily_reports` | Alternative report storage |
| `activity_blocks` | Activity data per report |
| `user_profiles` | User accounts & roles (includes `user_role` column) |
| `projects` | Project definitions |
| `organizations` | Organization/company data |

### Activity-Specific Tables
| Table | Purpose |
|-------|---------|
| `stringing_log` | Pipe stringing records |
| `mainline_welds` | Mainline weld data |
| `tiein_welds` | Tie-in weld data |
| `bending_log` | Bending records |
| `clearing_inspections` | Clearing inspection data |

### Tracking Tables
| Table | Purpose |
|-------|---------|
| `trackable_items` | Mats, fencing, ramps, goal posts |
| `mat_transactions` | Mat movement history |
| `crossings` | Pipeline crossings |

### Workflow & Audit Tables
| Table | Purpose |
|-------|---------|
| `report_status` | Approval workflow status |
| `report_audit_log` | **AUDIT TRAIL V2** - Enhanced with regulatory classification |
| `pending_approvals` | Pending approval queue |

---

## 🛣️ ROUTES

| Route | Component | Access |
|-------|-----------|--------|
| `/login` | Login | Public |
| `/reset-password` | ResetPassword | Public (with token) |
| `/` | RootRedirect | Redirects based on role |
| `/field-entry` | InspectorReport | Inspector, Chief, Admin |
| `/ndt-auditor` | NDTAuditorDashboard | NDT Auditor, Chief, Admin |
| `/assistant-chief` | AssistantChiefDashboard | Asst Chief, Chief, Admin |
| `/chief-dashboard` | ChiefDashboard | Chief, Asst Chief, CM, PM, Admin |
| `/cmt-dashboard` | Dashboard | CM, PM, Chief, Asst Chief, Exec, Admin |
| `/evm-dashboard` | EVMDashboard | Exec, CM, PM, Admin |
| `/admin` | AdminPortal | Admin, Super Admin |

---

## 📄 RECENT CHANGES LOG

| Date | Files Changed | What Changed |
|------|---------------|--------------|
| **Jan 17, 2026** | `invite-user/index.ts` | **FIXED** - Invitation links now use correct Supabase URL, role mapping added |
| **Jan 17, 2026** | `ResetPassword.jsx` | **FIXED** - Preserves redirect_to parameter after password set |
| **Jan 17, 2026** | `InviteUser.jsx` | **UPDATED** - Improved error handling for email failures |
| **Jan 17, 2026** | Database | **FIXED** - daily_tickets foreign key changed to ON DELETE SET NULL |
| **Jan 15, 2026** | `ProtectedRoute.jsx` | **NEW** - Role-based route guards and access control |
| **Jan 15, 2026** | `MasterSwitcher.jsx` | **NEW** - Admin God Mode dropdown navigation |
| **Jan 15, 2026** | `App.jsx` | **REPLACED** - Role-based routing with ProtectedRoute wrappers |
| **Jan 15, 2026** | `ChiefDashboard.jsx` | **UPDATED** - Fixed Daily Summary display, added navigation |
| **Jan 15, 2026** | `Dashboard.jsx` | **UPDATED** - Added MasterSwitcher + navigation buttons |
| **Jan 15, 2026** | `AdminPortal.jsx` | **UPDATED** - Added MasterSwitcher + InviteUser modal |
| **Jan 13, 2026** | `useActivityAudit.js` | Core audit hook for all Log components |

---

## 📧 EMAIL & DOMAIN CONFIGURATION

### Custom Domains (✅ All Verified)
| Domain | Purpose | Status |
|--------|---------|--------|
| `app.pipe-up.ca` | Main application | ✅ Active (Vercel) |
| `api.pipe-up.ca` | Supabase API | ✅ Active |
| `pipe-up.ca` | Resend email domain | ✅ Verified |

### SMTP Configuration (Resend)
- **Host:** smtp.resend.com
- **Port:** 465
- **Username:** resend
- **Password:** Resend API Key (full access)
- **Sender:** auth@pipe-up.ca

---

## ⚠️ KNOWN ISSUES / TODO

### High Priority
- [ ] **HydrotestLog.jsx** - Last remaining Log component needing audit trail
- [ ] Add **Remove User** button to Admin Portal UI

### Medium Priority
- [ ] Add AI reviewer agents for Blasting, Coating, Grading
- [ ] Implement Anthropic API key for AI narrative generation

### Low Priority
- [ ] PDF export - verify all Log data displays correctly
- [ ] Mobile optimization for field use

### ✅ COMPLETED
- [x] Role-based navigation system (Jan 15)
- [x] ProtectedRoute security guards (Jan 15)
- [x] Admin God Mode (MasterSwitcher) (Jan 15)
- [x] User invitation workflow with Edge Function (Jan 17)
- [x] Fixed invitation link 404 errors (Jan 17)
- [x] Fixed role mapping in invitations (Jan 17)
- [x] Fixed redirect after password reset (Jan 17)
- [x] User deletion preserves reports (Jan 17)
- [x] Chief Dashboard Daily Summary display fix (Jan 15)

---

## 📋 SESSION CHECKLIST

When starting a new session with Claude, upload:

1. **Always:** `PROJECT_MANIFEST.md` (this file)
2. **Always:** `App.jsx` (routing)
3. **If working on activities:** `constants.js`
4. **If working on audit:** `useActivityAudit.js`
5. **If working on roles/auth:** `ProtectedRoute.jsx`, `AuthContext.jsx`
6. **If working on invites:** `InviteUser.jsx`, Edge Function code
7. **If debugging:** The specific component + related files

---

## 🏗️ ARCHITECTURE NOTES

### Invitation Flow
1. Admin fills form in `InviteUser.jsx`
2. Calls Edge Function `invite-user`
3. Edge Function:
   - Creates auth user via `generateLink()`
   - Extracts token, reconstructs link with correct Supabase URL
   - Creates `user_profiles` record with mapped role
   - Sends email via Resend
4. User clicks link → Supabase verifies token → redirects to `/reset-password`
5. `ResetPassword.jsx` preserves `redirect_to` param
6. After password set → redirects to role-specific dashboard

### Role Mapping (Form → Database)
| Form Value | Database Value |
|------------|----------------|
| `chief` | `chief_inspector` |
| `exec` | `executive` |
| `asst_chief` | `assistant_chief_inspector` |
| Others | Same as form value |

---

## 🔐 REQUIRED SQL (Already Applied)

### User Deletion Fix (Jan 17)
```sql
ALTER TABLE daily_tickets ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE daily_tickets DROP CONSTRAINT daily_tickets_created_by_fkey;
ALTER TABLE daily_tickets 
ADD CONSTRAINT daily_tickets_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
```

### Role-Based Auth (Jan 15)
```sql
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS user_role TEXT;
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_role ON user_profiles(user_role);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
```

---

*Keep this file updated when making significant changes!*
