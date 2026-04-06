# Claude Code Prompt — Pipe-Up FEED Intelligence Module v2

## Context

You are building a new feature module for **Pipe-Up** (app.pipe-up.ca), a pipeline construction cost
intelligence and inspection SaaS. The stack is React 18 / Vite / Supabase (PostgreSQL + Auth + RLS) /
Vercel. All queries must be org-scoped via `useOrgQuery`. All financial writes require audit logging
via `auditLoggerV3.js`. Migrations are plain SQL for paste into the Supabase SQL Editor — never
file downloads.

The existing schema includes: `projects`, `lem_entries`, `invoices`, `inspector_reports`, and
`organizations`. You have access to `CLAUDE.md` for full project conventions.

This is v2 of the FEED module prompt. The basic form scaffolding already exists. This prompt
builds the full module: schema additions, the WBS entry and tagging workflow, the variance
dashboard, and the Phase 2 EPCM firm profile foundation.

---

## What is already built (do not rebuild)

- `FeedEstimateSetup.jsx` — basic form capturing: EPCM firm, estimate class, estimate date,
  total estimate (CAD), notes. Form creates a `feed_estimates` record and redirects on save.
- Route `/projects/:projectId/feed/setup` is registered.
- The `feed_estimates` table exists with: `id`, `org_id`, `project_id`, `epcm_firm`,
  `estimate_class`, `total_estimate`, `estimate_date`, `currency`, `meta`, `created_by`,
  `created_at`, `updated_at`.

---

## Step 1 — Schema additions and amendments

### 1a. Amend `feed_estimates` — add missing columns

The existing table is missing fields needed for accurate benchmarking and lifecycle tracking.
Output as plain ALTER TABLE SQL, paste-ready.

```sql
ALTER TABLE feed_estimates
  ADD COLUMN IF NOT EXISTS estimate_version       text DEFAULT 'V1',
  ADD COLUMN IF NOT EXISTS estimate_basis_year    integer,
  ADD COLUMN IF NOT EXISTS contingency_pct        numeric(5,2),
  ADD COLUMN IF NOT EXISTS escalation_pct         numeric(5,2),
  ADD COLUMN IF NOT EXISTS approval_status        text DEFAULT 'draft',
  -- 'draft' | 'approved_for_FID' | 'superseded'
  ADD COLUMN IF NOT EXISTS source_document_url    text,
  ADD COLUMN IF NOT EXISTS epcm_firm_id           uuid REFERENCES epcm_firms(id);
  -- FK to new epcm_firms table (Phase 2 — add after epcm_firms is created)
```

Note: `epcm_firm_id` FK should be added after `epcm_firms` table is created in Step 1e.
Add a partial unique index to prevent duplicate active estimates per project:

```sql
CREATE UNIQUE INDEX feed_estimates_one_active_per_project
  ON feed_estimates (project_id)
  WHERE approval_status != 'superseded';
```

### 1b. Create `feed_wbs_items`

WBS line items within a FEED estimate. These are the scope buckets the EPCM firm priced.

```
id                  uuid PK default gen_random_uuid()
org_id              uuid FK → organizations.id
feed_estimate_id    uuid FK → feed_estimates.id ON DELETE CASCADE
wbs_code            text                  -- e.g. "1.3.2"
scope_name          text NOT NULL         -- e.g. "HDD crossings"
scope_category      text                  -- see category enum below
estimated_amount    numeric(14,2)
unit                text                  -- '$/m' | 'lump_sum' | '$/unit' | '$/day'
unit_rate           numeric(10,2)
quantity            numeric(10,2)
basis_notes         text                  -- EPCM's estimating assumption for this line
sort_order          integer default 0
created_at          timestamptz default now()
updated_at          timestamptz default now()
```

`scope_category` enum values (store as text, validate in app):
`'mainline_install' | 'hdd_crossings' | 'road_water_crossings' | 'station_tieins' |
'hydro_test_commissioning' | 'mob_demob' | 'environmental_regulatory' | 'pm_inspection' |
'materials' | 'other'`

These categories are the standard WBS buckets used across projects — they enable cross-project
benchmarking by category.

### 1c. Create `feed_wbs_actuals`

Join table bridging LEM entries to WBS items. This is the financial core of the module.

```
id              uuid PK default gen_random_uuid()
org_id          uuid FK → organizations.id
wbs_item_id     uuid FK → feed_wbs_items.id ON DELETE CASCADE
lem_entry_id    uuid FK → lem_entries.id
actual_amount   numeric(14,2)
variance_note   text
tagged_by       uuid FK → auth.users.id
tagged_at       timestamptz default now()
```

### 1d. Create `feed_risks`

Risk register items identified during FEED.

```
id                  uuid PK default gen_random_uuid()
org_id              uuid FK → organizations.id
feed_estimate_id    uuid FK → feed_estimates.id ON DELETE CASCADE
risk_description    text NOT NULL
category            text   -- 'geotechnical' | 'constructability' | 'regulatory'
                           -- | 'schedule' | 'environmental'
severity            text   -- 'low' | 'medium' | 'high' | 'critical'
cost_allowance      numeric(14,2)
status              text default 'open'
                    -- 'open' | 'closed' | 'escalated' | 'not_encountered'
sort_order          integer default 0
created_at          timestamptz default now()
updated_at          timestamptz default now()
```

### 1e. Create `feed_risk_closeouts`

Inspector-authored closeout linking field evidence to a FEED risk item.

```
id                      uuid PK default gen_random_uuid()
org_id                  uuid FK → organizations.id
risk_id                 uuid FK → feed_risks.id ON DELETE CASCADE
inspector_report_id     uuid FK → inspector_reports.id
outcome                 text   -- 'resolved' | 'escalated' | 'monitoring'
actual_cost_impact      numeric(14,2)
closed_date             date
field_notes             text
closed_by               uuid FK → auth.users.id
created_at              timestamptz default now()
```

### 1f. Create `epcm_firms` — Phase 2 foundation (create now, use later)

Create this table now so the FK on `feed_estimates.epcm_firm_id` can be added. The UI for
managing EPCM firm profiles is Phase 2, but the data model should be in place from the start
so existing `feed_estimates` records can be back-filled.

```
id              uuid PK default gen_random_uuid()
org_id          uuid FK → organizations.id
name            text NOT NULL
short_name      text                   -- e.g. "WorleyParsons"
country         text DEFAULT 'CA'
website         text
contact_name    text
contact_email   text
notes           text
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

After creating `epcm_firms`, run the FK addition deferred from Step 1a:
```sql
ALTER TABLE feed_estimates
  ADD CONSTRAINT feed_estimates_epcm_firm_id_fkey
  FOREIGN KEY (epcm_firm_id) REFERENCES epcm_firms(id);
```

### 1g. RLS policies

Apply to all new/amended tables: `feed_wbs_items`, `feed_wbs_actuals`, `feed_risks`,
`feed_risk_closeouts`, `epcm_firms`.

Pattern (same as existing LEM tables):
```sql
-- SELECT
CREATE POLICY "{table}_select" ON {table}
  FOR SELECT USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    OR (auth.jwt() ->> 'role') = 'super_admin'
  );

-- INSERT
CREATE POLICY "{table}_insert" ON {table}
  FOR INSERT WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    OR (auth.jwt() ->> 'role') = 'super_admin'
  );

-- UPDATE / DELETE — same pattern
```

### 1h. Indexes

```sql
CREATE INDEX ON feed_wbs_items (feed_estimate_id);
CREATE INDEX ON feed_wbs_items (org_id, scope_category);
CREATE INDEX ON feed_wbs_actuals (wbs_item_id);
CREATE INDEX ON feed_wbs_actuals (lem_entry_id);
CREATE INDEX ON feed_risks (feed_estimate_id);
CREATE INDEX ON feed_risk_closeouts (risk_id);
CREATE INDEX ON epcm_firms (org_id);
CREATE INDEX ON feed_estimates (epcm_firm_id);
```

---

## Step 2 — Database views

### 2a. `feed_wbs_variance` — per-line-item variance

```sql
CREATE OR REPLACE VIEW feed_wbs_variance AS
SELECT
  w.id,
  w.org_id,
  w.feed_estimate_id,
  w.wbs_code,
  w.scope_name,
  w.scope_category,
  w.estimated_amount,
  w.unit_rate,
  w.quantity,
  w.basis_notes,
  w.sort_order,
  COALESCE(SUM(a.actual_amount), 0)                           AS actual_amount,
  COALESCE(SUM(a.actual_amount), 0) - w.estimated_amount      AS variance_amount,
  CASE WHEN w.estimated_amount > 0
    THEN ROUND(
      ((COALESCE(SUM(a.actual_amount), 0) - w.estimated_amount)
        / w.estimated_amount) * 100, 1
    )
    ELSE NULL
  END                                                          AS variance_pct,
  COUNT(a.id)                                                  AS tagged_lem_count
FROM feed_wbs_items w
LEFT JOIN feed_wbs_actuals a ON a.wbs_item_id = w.id
GROUP BY w.id;
```

Apply org-scoped RLS to this view.

### 2b. `feed_estimate_summary` — rolled-up estimate-level metrics

Used by the dashboard header cards and the EPCM firm scoring engine (Phase 2).

```sql
CREATE OR REPLACE VIEW feed_estimate_summary AS
SELECT
  e.id                                                        AS feed_estimate_id,
  e.org_id,
  e.project_id,
  e.epcm_firm,
  e.epcm_firm_id,
  e.estimate_class,
  e.estimate_version,
  e.estimate_basis_year,
  e.contingency_pct,
  e.escalation_pct,
  e.approval_status,
  e.total_estimate,
  e.estimate_date,
  COALESCE(SUM(v.actual_amount), 0)                           AS total_actual,
  COALESCE(SUM(v.actual_amount), 0) - e.total_estimate        AS total_variance_amount,
  CASE WHEN e.total_estimate > 0
    THEN ROUND(
      ((COALESCE(SUM(v.actual_amount), 0) - e.total_estimate)
        / e.total_estimate) * 100, 1
    )
    ELSE NULL
  END                                                          AS total_variance_pct,
  CASE
    WHEN ABS(ROUND(
      ((COALESCE(SUM(v.actual_amount), 0) - e.total_estimate)
        / NULLIF(e.total_estimate, 0)) * 100, 1)) <= 5  THEN 'A'
    WHEN ABS(ROUND(
      ((COALESCE(SUM(v.actual_amount), 0) - e.total_estimate)
        / NULLIF(e.total_estimate, 0)) * 100, 1)) <= 10 THEN 'B'
    WHEN ABS(ROUND(
      ((COALESCE(SUM(v.actual_amount), 0) - e.total_estimate)
        / NULLIF(e.total_estimate, 0)) * 100, 1)) <= 20 THEN 'C'
    ELSE 'D'
  END                                                          AS epcm_accuracy_grade,
  COUNT(DISTINCT v.id)                                         AS wbs_item_count,
  COUNT(DISTINCT v.id) FILTER (WHERE v.actual_amount > 0)     AS wbs_items_with_actuals
FROM feed_estimates e
LEFT JOIN feed_wbs_variance v ON v.feed_estimate_id = e.id
GROUP BY e.id;
```

Apply org-scoped RLS to this view.

### 2c. `feed_category_benchmarks` — cross-project benchmark view (Phase 2 foundation)

Create now but the UI consuming it is Phase 2. This is the accumulating intelligence layer —
every project added builds the benchmark dataset.

```sql
CREATE OR REPLACE VIEW feed_category_benchmarks AS
SELECT
  w.org_id,
  w.scope_category,
  COUNT(DISTINCT w.feed_estimate_id)                          AS project_count,
  ROUND(AVG(v.variance_pct), 1)                               AS avg_variance_pct,
  ROUND(MIN(v.variance_pct), 1)                               AS min_variance_pct,
  ROUND(MAX(v.variance_pct), 1)                               AS max_variance_pct,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
    (ORDER BY v.variance_pct), 1)                             AS median_variance_pct,
  ROUND(AVG(w.unit_rate), 2)                                  AS avg_unit_rate
FROM feed_wbs_items w
JOIN feed_wbs_variance v ON v.id = w.id
WHERE v.actual_amount > 0
GROUP BY w.org_id, w.scope_category;
```

---

## Step 3 — Amend `FeedEstimateSetup.jsx`

The existing form captures basic fields. Extend it to include the new columns without
removing any existing functionality.

### Additional fields to add

After "Total Estimate (CAD)":

**Estimate version** (text input, default "V1"):
```
label: "Estimate version"
placeholder: "V1"
field: estimate_version
```

**Estimate basis year** (number input, 4-digit year):
```
label: "Estimate basis year"
placeholder: e.g. 2023
helperText: "The year unit rates were benchmarked from. Used for inflation normalization."
field: estimate_basis_year
```

**Contingency %** and **Escalation %** — side by side in a two-column grid:
```
label: "Contingency %"      field: contingency_pct   type: number, step: 0.1
label: "Escalation %"       field: escalation_pct    type: number, step: 0.1
helperText on contingency: "Typical Class 3: 15–20%"
```

**Approval status** (select):
```
label: "Approval status"
options: Draft | Approved for FID | Superseded
field: approval_status
values: draft | approved_for_FID | superseded
```

**Source document URL** (text input):
```
label: "FEED report link"
placeholder: "SharePoint or S3 URL"
helperText: "Link to the FEED estimate report for traceability."
field: source_document_url
```

**EPCM firm selector** (searchable select from `epcm_firms`):
```
label: "EPCM firm (linked profile)"
helperText: "Optional — link to an EPCM firm profile for cross-project scoring."
field: epcm_firm_id
nullable: true
```
If no EPCM firms exist yet, show a "Create firm profile" link → `/epcm-firms/new`.
The plain text `epcm_firm` field should remain for backwards compatibility and auto-populate
when a firm profile is selected.

On save: audit log with action `'feed_estimate_upsert'`, include changed fields in the
audit payload diff.

After save, redirect to `/projects/:projectId/feed/wbs` instead of the dashboard —
the WBS table is the next logical step.

---

## Step 4 — Build `FeedWBSTable.jsx`

This is the core data entry screen. It is where the EPCM estimate gets broken into scope
buckets and actuals get tagged to each bucket.

### Layout

Full-width table below a summary bar. Summary bar shows:
- Total estimated (sum of all WBS items)
- Total actual (sum of tagged LEMs)
- Remaining untagged LEM spend (project total LEM spend minus tagged amount)
- A progress indicator: "X of Y LEM entries tagged"

### Table columns

| Column | Source | Editable |
|---|---|---|
| WBS code | `feed_wbs_items.wbs_code` | Yes, inline |
| Scope name | `feed_wbs_items.scope_name` | Yes, inline |
| Category | `feed_wbs_items.scope_category` | Yes, select dropdown |
| Estimated ($) | `feed_wbs_items.estimated_amount` | Yes, inline currency |
| Unit / rate / qty | collapsed expand row | Yes |
| Basis notes | `feed_wbs_items.basis_notes` | Yes, inline text |
| Actual LEM ($) | `feed_wbs_variance.actual_amount` | No — read-only |
| Variance ($) | `feed_wbs_variance.variance_amount` | No — computed |
| Variance (%) | `feed_wbs_variance.variance_pct` | No — computed |
| Tagged LEMs | `feed_wbs_variance.tagged_lem_count` | No — count badge |
| Actions | | Tag LEMs button, delete row |

### Variance colour rules

Apply to both variance columns:
- Green (`--color-success`): variance_pct between -5% and +5%
- Amber (`--color-warning`): variance_pct between -15% and -5%, or +5% to +15%
- Red (`--color-danger`): variance_pct beyond ±15%
- Gray: no actuals tagged yet (variance_pct is null)

### Row interactions

- **Add row**: button below table, inserts a blank row at bottom with cursor focus on scope_name
- **Delete row**: icon button per row, confirm before delete, audit-logged
- **Drag to reorder**: drag handle column (left), updates `sort_order` on drop via batch update
- **Inline edit**: click any editable cell to edit in place, save on blur or Enter
- **Tag LEMs**: opens `FeedTagLEM` slide-over for the selected WBS item

### Predefined WBS templates

Add a "Load template" button above the table. When clicked, show a modal with standard WBS
templates the user can apply to pre-populate rows:

```
Standard pipeline template (8 rows):
  1.1  Mainline pipe installation         mainline_install
  1.2  HDD crossings                      hdd_crossings
  1.3  Road / watercourse crossings       road_water_crossings
  1.4  Compressor / station tie-ins       station_tieins
  1.5  Hydrostatic test & commissioning   hydro_test_commissioning
  1.6  Spread mob / demob                 mob_demob
  1.7  Environmental & regulatory         environmental_regulatory
  1.8  PM, field inspection & QC          pm_inspection
```

Applying a template inserts the rows but does not overwrite any existing rows. Estimated
amounts remain blank for the user to fill in.

### Mutations

All creates, updates, and deletes on `feed_wbs_items` must be audit-logged via
`auditLoggerV3.js` with action `'feed_wbs_item_mutation'` and a payload including the
`feed_estimate_id`, `wbs_item_id`, mutation type, and changed fields.

---

## Step 5 — Build `FeedTagLEM.jsx`

Slide-over panel triggered from the Tag LEMs button in `FeedWBSTable`.

### Header

Shows the selected WBS item: scope name, WBS code, estimated amount, current actual total.

### Currently tagged section

List of already-tagged LEM entries for this WBS item. Each row shows:
- LEM entry date, description/activity, amount
- Unlink button (removes the `feed_wbs_actuals` record, audit-logged)

### Tag new LEMs section

Searchable list of `lem_entries` for this project that are either:
- Not yet tagged to any WBS item, OR
- Tagged to a different WBS item (allow re-tagging with a warning)

Search filters: date range, activity type, amount range.

Each untagged LEM row shows a checkbox. On "Tag selected":
1. Creates `feed_wbs_actuals` records for each selected LEM
2. `actual_amount` on each record copies from `lem_entries.amount`
3. Audit-logs each tag with action `'feed_lem_tagged'`
4. Refreshes the WBS table row's actual and variance columns

### Partial tagging

A LEM entry may represent mixed scope (e.g. a crew day that covered both mainline and an HDD).
Allow the user to enter a custom `actual_amount` on the `feed_wbs_actuals` record that differs
from the full LEM amount, with a mandatory `variance_note` explaining the split.

---

## Step 6 — Build `FeedDashboard.jsx`

The primary FEED view. Accessed from the FEED tab on the project detail page.

### Metric cards (top row, 4 cards)

1. **FEED estimate** — `feed_estimate_summary.total_estimate`, with estimate class badge
   and estimate version badge (e.g. "Class 3 · V1")
2. **Actual LEM spend** — `feed_estimate_summary.total_actual`, with "X of Y items tagged"
   sub-label
3. **Total variance** — `feed_estimate_summary.total_variance_amount` and
   `total_variance_pct` on the same card. Dollar amount large, percentage smaller below it.
   Colour-coded by variance band.
4. **EPCM accuracy grade** — `feed_estimate_summary.epcm_accuracy_grade` large centred
   letter (A/B/C/D), coloured green/amber/orange/red respectively. Sub-label:
   "Based on ±X% overall variance"

### Estimate metadata row

Below cards, a single row of secondary info:
- EPCM firm name (linked to firm profile if `epcm_firm_id` is set)
- Estimate class and version
- Estimate basis year
- Contingency % and escalation % if set
- Approval status badge
- Source document link (if set): "View FEED report →"

### Variance chart

Horizontal grouped bar chart (Chart.js) — one row per WBS item, sorted by sort_order.
Each row has two bars: estimated (gray) and actual (colour-coded by variance band).
X-axis in dollars. Show variance % as a label at the end of the actual bar.

Chart title: "Estimated vs actual by scope"
Legend: "Estimated" (gray) / "Actual" (colour per band) / variance band legend

### Category benchmark callout (if data exists in `feed_category_benchmarks`)

Below chart, show a small insight panel. For each WBS category where this project's
variance deviates significantly from the cross-project median (>5% difference), surface
an insight chip:

Example:
> "HDD crossings — this project ran +32.9% over estimate.
>  Your portfolio median for HDD crossings is +14.2%.
>  This crossing ran 18.7% above your typical HDD overrun."

Only show if there are at least 2 other projects with data for that category. Otherwise
show a "Not enough data for benchmarks yet — add more projects." placeholder.

### Risk register summary strip

Below the chart, a compact horizontal strip showing:
- Open risks: count + total cost allowance
- Closed risks: count + total actual cost impact
- Escalated risks: count
- "View full risk register →" link

### Cost bridge waterfall (optional — add if time permits)

A waterfall chart showing: FEED estimate → scope adjustments → HDD overrun → mob overrun →
etc → actual total. Uses Chart.js with a floating bar technique. This is the most compelling
executive view — if time is short, skip and add in Phase 2.

---

## Step 7 — Build `FeedRiskRegister.jsx`

Table of `feed_risks` for the FEED estimate, with inline add/edit and inspector closeout workflow.

### Table columns

| Column | Notes |
|---|---|
| Risk description | Inline editable |
| Category | Select badge, inline editable |
| Severity | Select badge, colour-coded: low=gray, medium=amber, high=coral, critical=red |
| Cost allowance ($) | Inline currency |
| Status | Badge — open / closed / escalated / not_encountered |
| Actual cost impact | From `feed_risk_closeouts.actual_cost_impact` if closed |
| Variance to allowance | Actual minus allowance, colour-coded |
| Actions | Closeout button (if open/escalated), view closeout (if closed), delete |

### Risk closeout flow

"Closeout" button opens `FeedRiskCloseout` as a modal (not a separate route). On save:
- Creates `feed_risk_closeouts` record
- Updates `feed_risks.status` to the outcome value
- Audit-logs with action `'feed_risk_closeout'`
- Refreshes the risk table row

### Add risk

Button below table: "Add risk". Inserts a blank row. Required fields: description, category,
severity. Cost allowance optional.

All mutations audit-logged with action `'feed_risk_mutation'`.

---

## Step 8 — Route structure

Register these routes under the existing project detail layout:

```
/projects/:projectId/feed                   → FeedDashboard
/projects/:projectId/feed/setup             → FeedEstimateSetup  (existing — amend)
/projects/:projectId/feed/wbs               → FeedWBSTable
/projects/:projectId/feed/risks             → FeedRiskRegister
```

Remove the old per-item routes (`/feed/wbs/:itemId/tag`, `/feed/risks/:riskId/closeout`) —
these are now handled as slide-overs and modals within the parent page.

---

## Step 9 — Navigation integration

### FEED tab on project detail

Add a "FEED" tab to the project detail tab bar. Visibility rule:
- Always visible to `project_manager` role and above
- Visible to all roles if `feed_estimates` record exists for the project

If no FEED estimate exists yet, the tab content is an empty state card:
```
Title: "No FEED estimate linked"
Body:  "Link a FEED (Front End Engineering Design) estimate to start tracking
        EPCM estimating accuracy and connecting scope to field spend."
CTA:   "Set up FEED estimate" → /projects/:projectId/feed/setup
```

### FEED tab sub-navigation

Within the FEED section, add a secondary nav row with three items:
- "Overview" → /feed (FeedDashboard)
- "WBS & costs" → /feed/wbs (FeedWBSTable)
- "Risk register" → /feed/risks (FeedRiskRegister)

---

## Phase 2 — EPCM Firm Profile (build later, schema is already in place)

Do not build this now. The `epcm_firms` table is created in Step 1f and the FK on
`feed_estimates.epcm_firm_id` is in place. When Phase 2 is ready, build:

### `/epcm-firms` — firm list

Global route (not project-scoped). Lists all `epcm_firms` for the org.
Each firm card shows:
- Firm name and contact
- Number of projects linked
- Cross-project accuracy grade (A/B/C/D) — computed from `feed_estimate_summary`
- Breakdown by scope category: which categories they consistently overrun or underrun

### `/epcm-firms/:firmId` — firm profile

- Firm details (editable)
- Projects table: all `feed_estimates` linked to this firm across projects, with
  estimate class, total estimate, total actual, variance %, accuracy grade
- Category scorecard: for each `scope_category`, show median variance % across all
  projects with this firm vs. org-wide median. Highlight where this firm is
  systematically worse or better than the portfolio average
- "Hire again?" signal: composite grade with plain-language summary

### Benchmark intelligence panel

Accessible from the EPCM firm profile and from `FeedDashboard`. Queries
`feed_category_benchmarks`. Shows:
- Portfolio median variance by category
- Current project's variance by category vs. portfolio median
- If sufficient data (3+ projects per category), surface a pre-construction validation
  flag: "Your HDD unit rate of $X/m is 28% below your portfolio average. Verify before FID."

---

## Conventions checklist

Before writing any code, re-read `CLAUDE.md`. Confirm:
- [ ] All queries go through `useOrgQuery` — zero direct Supabase calls in components
- [ ] All financial writes logged via `auditLoggerV3.js` with specific action strings
      as documented above
- [ ] RLS `super_admin` bypass on all new tables and views
- [ ] No migration files — plain SQL for Supabase SQL Editor paste only
- [ ] Currency stored as `numeric(14,2)` — never float
- [ ] All variance computation happens in DB views — never in the frontend
- [ ] No hardcoded org IDs anywhere
- [ ] Partial LEM tagging requires a `variance_note` — enforce in UI and DB check constraint
- [ ] `epcm_firm` (plain text) and `epcm_firm_id` (FK) coexist — do not remove the plain
      text field; it is needed for projects created before EPCM firm profiles existed

---

## Deliverables (in order)

1. SQL — `ALTER TABLE feed_estimates` additions (paste-ready)
2. SQL — `feed_wbs_items`, `feed_wbs_actuals`, `feed_risks`, `feed_risk_closeouts`,
   `epcm_firms` table creation + RLS + indexes (paste-ready)
3. SQL — `feed_wbs_variance`, `feed_estimate_summary`, `feed_category_benchmarks` views
4. Amended `FeedEstimateSetup.jsx`
5. `FeedWBSTable.jsx` + `FeedTagLEM.jsx` (slide-over)
6. `FeedDashboard.jsx`
7. `FeedRiskRegister.jsx` + `FeedRiskCloseout.jsx` (modal)
8. Route updates
9. Navigation tab + sub-nav

Start with item 1. Output each SQL block fully before moving to the next. Confirm schema
is complete before writing any React.
