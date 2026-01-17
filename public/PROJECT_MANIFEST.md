# PIPE-UP PROJECT MANIFEST
## Pipeline Inspector SaaS Application

**Last Updated:** January 17, 2026  
**Version:** 1.9  
**Stack:** React + Vite + Supabase + Vercel  
**Live URL:** https://app.pipe-up.ca  
**API Domain:** https://api.pipe-up.ca (custom domain verified)

---

## 🚧 IN PROGRESS: BILLING RECONCILIATION SYSTEM

### What's Being Built
Adding billing workflow to ReconciliationDashboard per Corry's requirements:

1. **Match View** - Side-by-side: Inspector ticket vs Contractor LEM vs Timesheet photo + **THE MONEY**
2. **Status Workflow:**
   - `open` → Needs review
   - `matched` → Everything lines up
   - `disputed` → Has discrepancies
   - `ready_for_billing` → Approved, waiting for invoice
   - `invoiced` → Assigned to invoice #XXX

3. **Billing Batches** - Group "Ready for Billing" items into invoice batches
4. **Full Visibility** - See ALL tickets, filter by status, totals at each stage

### Database Changes Applied (Jan 17)
```sql
-- Added to contractor_lems table:
ALTER TABLE contractor_lems ADD COLUMN billing_status TEXT DEFAULT 'open';
ALTER TABLE contractor_lems ADD COLUMN billing_batch_id UUID;
ALTER TABLE contractor_lems ADD COLUMN ready_for_billing_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contractor_lems ADD COLUMN ready_for_billing_by TEXT;
ALTER TABLE contractor_lems ADD COLUMN invoiced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contractor_lems ADD COLUMN invoice_number TEXT;

-- New table for invoice groupings:
CREATE TABLE billing_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_number TEXT,
  invoice_number TEXT,
  contractor TEXT,
  total_labour_cost NUMERIC(12,2) DEFAULT 0,
  total_equipment_cost NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  lem_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  invoiced_at TIMESTAMP WITH TIME ZONE,
  invoiced_by TEXT
);
```

### Next Steps
- [ ] Add "Billing" view mode to ReconciliationDashboard
- [ ] Checkboxes to select LEMs for billing batch
- [ ] "Mark Ready for Billing" action
- [ ] Create billing batch / assign invoice number
- [ ] Totals display at each status level
- [ ] Third-party timesheets (hydrovac, blasting, survey)

---

## 📁 FILE INVENTORY (90+ files in /src)

### 📀 ROUTING & CORE
| File | Lines | Purpose |
|------|-------|---------|
| `main.jsx` | 5,400 | **ROUTER** - All routes defined here |
| `App.jsx` | ~300 | Role-based routing with ProtectedRoute |
| `AuthContext.jsx` | 3,501 | Authentication provider, user roles |
| `ProtectedRoute.jsx` | ~100 | Role-based access control & route guards |
| `ResetPassword.jsx` | ~200 | Fixed redirect_to preservation |
| `supabase.js` | 231 | Supabase client config |
| `constants.js` | 23,976 | **CRITICAL** - Activity types, quality fields, options |

### 🔐 ROLE-BASED NAVIGATION & USER MANAGEMENT
| File | Purpose |
|------|---------|
| `ProtectedRoute.jsx` | Route guards, role config, access control |
| `MasterSwitcher.jsx` | **ADMIN GOD MODE** - Dropdown to jump between dashboards |
| `InviteUser.jsx` | Secure invitation with Edge Function |
| `ResetPassword.jsx` | Preserves redirect_to parameter |

### 📊 DASHBOARDS & ADMIN
| File | Lines | Purpose |
|------|-------|---------|
| `AdminPortal.jsx` | ~1085 | **UPDATED Jan 17** - Added Delete User button |
| `Dashboard.jsx` | ~1100 | CMT Dashboard with role navigation |
| `ChiefDashboard.jsx` | ~1250 | Fixed Daily Summary display |
| `EVMDashboard.jsx` | ~45K | Earned Value Management |
| `ReconciliationDashboard.jsx` | ~1481 | **IN PROGRESS** - Adding billing workflow |
| `ContractorLEMs.jsx` | ~38K | Contractor LEM import/view |

### 📝 INSPECTOR REPORTS
| File | Purpose |
|------|---------|
| `InspectorReport.jsx` | Main daily inspection entry form |
| `ActivityBlock.jsx` | Activity data with labour/equipment |
| `ReportViewer.jsx` | Read-only report view |

---

## 🔐 ROLE-BASED ACCESS SYSTEM

### User Roles & Landing Pages
| Role | Landing Page |
|------|--------------|
| `super_admin` | `/admin` |
| `admin` | `/admin` |
| `executive` | `/evm-dashboard` |
| `cm` | `/cmt-dashboard` |
| `pm` | `/cmt-dashboard` |
| `chief_inspector` | `/chief-dashboard` |
| `assistant_chief_inspector` | `/assistant-chief` |
| `ndt_auditor` | `/ndt-auditor` |
| `inspector` | `/field-entry` |

---

## 📧 INVITATION SYSTEM

### Edge Functions Deployed
| Function | Purpose |
|----------|---------|
| `invite-user` | Secure user invitations with role assignment |
| `delete-user` | **NEW Jan 17** - Delete users from auth.users |

### How Invites Work
1. Admin clicks "📧 Invite User" in Admin Portal
2. Edge Function creates user + profile with role
3. User receives email, sets password
4. Redirects to role-specific dashboard

### Role Mapping (Form → Database)
| Form Value | Database Value |
|------------|----------------|
| `chief` | `chief_inspector` |
| `exec` | `executive` |
| `asst_chief` | `assistant_chief_inspector` |

---

## 👤 USER MANAGEMENT

### Delete User (Admin Portal)
- Users tab now has "🗑️ Delete" button
- Your own account is disabled (can't delete yourself)
- Reports created by deleted users are preserved
- Uses `delete-user` Edge Function for auth.users cleanup

### Database Constraint (Applied Jan 17)
```sql
-- Reports stay when users are deleted
ALTER TABLE daily_tickets 
ADD CONSTRAINT daily_tickets_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
```

---

## 💰 RECONCILIATION & BILLING SYSTEM

### Current Features (Working)
- 3-way comparison: LEM vs Timesheet vs Inspector Report
- Dispute flagging and tracking
- Corrections with audit trail
- Email notifications to contractor

### Billing Status Flow (Being Added)
```
open → matched → ready_for_billing → invoiced
         ↓
      disputed → resolved → ready_for_billing
```

### Key Tables
| Table | Purpose |
|-------|---------|
| `contractor_lems` | Contractor daily logs with billing_status |
| `daily_tickets` | Inspector reports |
| `disputes` | Flagged discrepancies |
| `reconciliation_corrections` | Admin fixes |
| `billing_batches` | **NEW** - Invoice groupings |

---

## 🗄️ DATABASE TABLES

### Core Tables
| Table | Purpose |
|-------|---------|
| `daily_tickets` | Main inspection reports |
| `user_profiles` | User accounts & roles |
| `contractor_lems` | Contractor LEMs with billing status |
| `billing_batches` | **NEW** - Invoice batch groupings |

### Workflow Tables
| Table | Purpose |
|-------|---------|
| `disputes` | Flagged discrepancies |
| `reconciliation_corrections` | Admin corrections |
| `report_audit_log` | Audit trail |

---

## 🛣️ ROUTES

| Route | Component | Access |
|-------|-----------|--------|
| `/login` | Login | Public |
| `/admin` | AdminPortal | Admin |
| `/chief-dashboard` | ChiefDashboard | Chief, CM, PM, Admin |
| `/cmt-dashboard` | Dashboard | CM, PM, Chief, Exec, Admin |
| `/evm-dashboard` | EVMDashboard | Exec, CM, PM, Admin |
| `/reconciliation` | ReconciliationDashboard | Admin, CM |
| `/contractor-lems` | ContractorLEMs | Admin, CM |
| `/field-entry` | InspectorReport | Inspector, Chief, Admin |

---

## 📄 RECENT CHANGES LOG

| Date | What Changed |
|------|--------------|
| **Jan 17, 2026** | Added Delete User button to Admin Portal |
| **Jan 17, 2026** | Deployed `delete-user` Edge Function |
| **Jan 17, 2026** | Added billing columns to contractor_lems |
| **Jan 17, 2026** | Created billing_batches table |
| **Jan 17, 2026** | Fixed user deletion (reports preserved) |
| **Jan 17, 2026** | Fixed invitation system (role mapping, redirects) |
| **Jan 15, 2026** | Role-based navigation system |
| **Jan 15, 2026** | ProtectedRoute security guards |
| **Jan 15, 2026** | Admin God Mode (MasterSwitcher) |

---

## ⚠️ TODO LIST

### High Priority - In Progress
- [ ] **Billing view in ReconciliationDashboard** - Started, database ready

### High Priority
- [ ] Third-party timesheets (hydrovac, blasting, survey)
- [ ] HydrotestLog.jsx audit trail

### Medium Priority
- [ ] AI narrative generation for Chief Dashboard
- [ ] AI reviewer agents

### Completed ✅
- [x] Role-based navigation (Jan 15)
- [x] User invitation workflow (Jan 17)
- [x] User deletion from Admin Portal (Jan 17)
- [x] Billing database schema (Jan 17)

---

## 📋 SESSION CHECKLIST

When starting tomorrow's session, upload:

1. **Always:** `PROJECT_MANIFEST.md` (this file)
2. **For billing work:** `ReconciliationDashboard.jsx`
3. **If needed:** `ContractorLEMs.jsx`

### Where We Left Off
- Database tables created for billing workflow
- Next: Add "Billing" view mode to ReconciliationDashboard
- Need to implement: checkboxes, status actions, batch creation, totals

---

## 📧 EMAIL & DOMAIN CONFIGURATION

### Custom Domains (✅ All Verified)
| Domain | Purpose |
|--------|---------|
| `app.pipe-up.ca` | Main application (Vercel) |
| `api.pipe-up.ca` | Supabase API |
| `pipe-up.ca` | Resend email domain |

### SMTP (Resend)
- Host: smtp.resend.com
- Sender: auth@pipe-up.ca

---

*Keep this file updated when making significant changes!*
