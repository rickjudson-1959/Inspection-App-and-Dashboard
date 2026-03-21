# Claude Code Instructions for Pipe-Up Pipeline Inspector Platform

## Standing Instructions

### Field Guide Sync Requirement
Any changes to the inspector's report (`src/InspectorReport.jsx`), activity blocks (`src/ActivityBlock.jsx`), or related form components (e.g., `TrackableItemsTracker.jsx`, `UnitPriceItemsLog.jsx`, quality field constants) **must** be reflected in the Pipe-Up Field Guide.

After making such changes:
1. Regenerate `pipe-up-field-guide-agent-kb.md` to reflect the new/modified fields
2. Re-upload it to the `field_guide` slot in the Technical Resource Library via the Admin Portal or programmatically
3. Re-index it via the `process-document` edge function (document ID may change on re-upload)

The field guide is the AI agent's knowledge base for inspector mentoring. If it falls out of sync, inspectors will get incorrect guidance.

**Check this at the start of every new session and after every conversation compression.**

---

## Key References
- **Project Manifest:** `src/PROJECT_MANIFEST.md`
- **Production URL:** https://app.pipe-up.ca
- **Deployment:** Vercel (auto-deploys on push to main)
- **Database:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Field Guide DB record:** category `field_guide` in `project_documents` table (is_global: true)
- **Repository:** https://github.com/rickjudson-1959/Inspection-App-and-Dashboard

---

## Technology Stack
| Component | Technology |
|-----------|------------|
| Frontend | React 18.2.0 with Vite + PWA |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| AI Analysis | Anthropic Claude API (claude-sonnet-4 for OCR/Vision) |
| Email API | Resend |
| Deployment | Vercel |
| PDF Generation | jsPDF + jsPDF-autotable |
| Offline Storage | IndexedDB (idb) via Workbox PWA |

---

## Architecture — Key Files

### Core Entry Points
- `src/main.jsx` — App entry point
- `src/App.jsx` — Routing & multi-tenant org-scoped access
- `src/AuthContext.jsx` — Authentication
- `src/contexts/OrgContext.jsx` — Multi-tenant organization context
- `src/supabase.js` — Supabase client
- `src/constants.js` — Activity types, labour classifications (127), equipment types (334)

### Critical Report Components (Field Guide Sync Required)
- `src/Reports/InspectorReport.jsx` — Main field report form (8,400+ lines)
- `src/Reports/ActivityBlock.jsx` — Activity module component (3,400+ lines)
- `src/Components/TrackableItemsTracker.jsx` — 14 trackable item categories

### Reconciliation System (Highest Priority Feature)
- `src/Components/LEMReconciliation.jsx` — Visual four-panel reconciliation UI
- `src/Components/LEMFourPanelView.jsx` — Four-panel comparison: LEM | Ticket | Our Photo | Inspector Report PDF
- `src/Components/LEMUpload.jsx` — LEM PDF upload, parse, preview, save
- `src/Components/InvoiceUpload.jsx` — Invoice upload with Claude Vision parsing
- `src/Components/InvoiceComparison.jsx` — Invoice vs reconciliation approve/reject workflow
- `src/utils/lemParser.js` — pdf.js extraction + Claude Vision page classification
- `src/utils/lemMatcher.js` — Three-strategy matching engine (exact → normalized → date+crew)
- `src/utils/ticketNormalizer.js` — Ticket number normalization (strips prefixes)

### Compliance Automation (Python, separate from React app)
- `pipe-up-automation/generate.py` — PDF → HTML map + Word report
- `pipe-up-automation/parse_permits.py` — BCER permit PDF parser
- `pipe-up-automation/cvi_engine.py` — Capital Variance Index engine

### Utilities
- `src/utils/queryHelpers.js` — Org-scoped query helpers (useOrgQuery)
- `src/Utilities/auditLoggerV3.js` — Audit trail logging
- `src/Utilities/weatherService.js` — Weather API integration
- `src/Utilities/exifUtils.js` — Photo GPS extraction
- `src/offline/` — PWA offline support (IndexedDB schema, syncManager, chainageCache)

---

## Database — Critical Tables

### LEM Reconciliation (March 2026 — Most Recent)
- `contractor_lem_uploads` — Parent LEM records, org-scoped with RLS
- `lem_reconciliation_pairs` — Visual pairs: lem_page_urls, contractor_ticket_urls, matched_report_id, resolution status
- `contractor_invoices` — Gated behind approved LEMs only (hard gate)

### Document Control
- `project_documents` — Org-scoped vault, ITP sign-offs (JSONB), Owner DC sync status, is_global flag for field guide
- `transmittals` — Transmittal tracking

### Inspector Invoicing
- `inspector_profiles`, `inspector_documents`, `inspector_rate_cards`
- `inspector_timesheets`, `inspector_timesheet_lines`

### Field Data
- `trackable_items` — 14 categories, common columns: action, quantity, unit, from_kp, to_kp, kp_location, report_id, organization_id
- `trench_logs` + `trench_log_photos` — Ditch inspection with GPS-tagged photos
- `bore_path_logs` + `bore_path_stations` — HDD steering data
- `drilling_waste_logs` + `drilling_waste_additives` — Directive 050 compliance

### Storage Buckets
- `lem-uploads` — LEM PDFs and extracted page images
- `contractor-invoices` — Invoice PDFs
- `signatures` — Digital signature captures
- `handovers` — Project handover ZIP files

---

## User Roles (Role-Based Access)
| Role | Access |
|------|--------|
| `super_admin` | Full system access |
| `admin` | Project administration |
| `chief_inspector` | Report approval, field oversight |
| `assistant_chief_inspector` | Support functions |
| `welding_chief` | Welding operations + reports |
| `inspector` | Field data entry |
| `pm` / `cm` | Project manager / Construction manager dashboards |
| `executive` | Executive dashboards |
| `ndt_auditor` | NDT monitoring |

---

## Security Conventions (CRITICAL — Enterprise Clients)
- **All data isolated by organization** via Supabase RLS — never write queries that cross org boundaries
- **Audit logging required** on any write to billing, reconciliation, or invoice tables (use `auditLoggerV3.js`)
- **Claude Vision OCR** processes images transiently — no raw image data stored in DB (only URLs to storage)
- **LEM → Invoice hard gate** — `contractor_invoices` records can only be created after the parent `contractor_lem_uploads` is in `approved` status. Never bypass this gate.
- **SHA-256 hashes** are auto-assigned on every report save — do not modify the document certification logic
- **Rate card data** reads and writes through server-side API route (`/api/rates`) — never expose the DB service key to the browser

---

## Supabase Migration Conventions
- SQL migrations = plain text only, formatted for **direct paste into the Supabase SQL Editor**
- Do NOT generate migration files as downloadable attachments
- Always include RLS policies in new table migrations
- Name migrations with ISO date prefix: `YYYYMMDD_description.sql`
- Check existing migrations in `supabase/migrations/` before adding columns that may already exist

---

## Agentic Workflow Rules (READ BEFORE AUTONOMOUS WORK)

### Hard Stops — Always Ask Before Proceeding
- **NEVER push to main** — always create a feature branch and flag for Rick's review
- **NEVER run destructive SQL** (DROP TABLE, DELETE without WHERE clause, TRUNCATE) without explicit confirmation
- **NEVER modify RLS policies** without explicit instruction — these protect client data isolation
- **NEVER alter the audit logging logic** in `auditLoggerV3.js` or remove audit calls from reconciliation/billing flows
- **NEVER bypass the LEM → Invoice gate** in code logic

### Field Guide Sync Check
Before finishing ANY session that touched `InspectorReport.jsx`, `ActivityBlock.jsx`, `TrackableItemsTracker.jsx`, or any quality field constants:
1. Flag that field guide sync is required
2. List exactly which fields/components changed
3. Do NOT mark work as complete until sync is acknowledged

### Agent Teams Scope (when running parallel agents)
- **Frontend agent:** works in `src/components/`, `src/pages/`, `src/Dashboards/` only
- **DB/migration agent:** works in `supabase/migrations/` and edge functions only
- **Automation agent:** works in `pipe-up-automation/` only (Python, separate from React app)
- **Agents must not merge their own branches** — flag parent agent to diff and review first
- **Context window note:** Sonnet is the default model for agentic sub-tasks; use Opus only for complex reasoning tasks

---

## Current Sprint Focus
<!-- UPDATE THIS AT THE START OF EVERY SESSION — agents use this to scope their work -->
- [ ] [Rick: describe what you're working on this session, e.g., "Billing reconciliation diff view improvements", "HydrotestLog PDF export", etc.]

---

## Known Patterns & Conventions

### ShieldedInput / ShieldedSearch
New input components (`ShieldedInput.jsx`, `ShieldedSearch.jsx`) replaced `BufferedInput` and `BufferedSearch` in February 2026. Use ShieldedInput for any new focus-locked inputs. `BufferedInput`/`BufferedSearch` still exist as re-exports for backward compat — do not remove them.

### Org-Scoped Queries
Always use `useOrgQuery` from `src/utils/queryHelpers.js` for any Supabase query that should be filtered by organization. Never use raw `.eq('organization_id', ...)` manually — use the helper.

### Activity Type Names (exact, case-sensitive)
Exact names matter for quality field lookups. Key ones: `"Welding - Tie-in"`, `"Cleanup - Machine"`, `"Cleanup - Final"`, `"HD Bores"`, `"Hydrostatic Testing"`, `"Tie-in Backfill"`, `"Tie-in Coating"`. Check `constants.js` for full list before adding new activity-specific logic.

### PDF Generation
All specialized log PDFs use `jsPDF` + `jsPDF-autotable`. The PDF for a report fetches trackable items from the DB (not just local state) — always ensure DB data is committed before PDF generation is triggered.

### Offline Mode
Any new data that needs to work offline must be handled via `src/offline/syncManager.js` and `src/offline/db.js` (IndexedDB schema). New table schemas need corresponding IndexedDB object stores if they should support offline entry.

---

## What NOT to Change Without Discussion
- `src/Utilities/auditLoggerV3.js` — audit trail logic
- RLS policies in any migration
- The SHA-256 document certification block in report save logic
- The LEM → Invoice approval gate in `InvoiceUpload.jsx` / `InvoiceComparison.jsx`
- `src/offline/db.js` schema without a matching Supabase migration
