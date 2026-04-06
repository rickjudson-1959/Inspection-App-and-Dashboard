# Brief: Simplified LEM Reconciliation — Visual Four-Panel Comparison

## What Changed
Replace the detailed field-by-field LEM parsing approach with a visual comparison tool. The app splits the contractor's PDF into LEM/ticket pairs, matches them to inspector reports by date and crew, and presents all four documents side by side. The human makes the comparison — the app just organizes and presents.

## Why This Is Better
- No need to parse every number off every LEM page (eliminates extraction errors)
- Massively fewer API calls (classify pages only, don't extract every field)
- Solves the 30,000 token/minute rate limit problem
- The admin already knows how to compare these documents — they just need them lined up
- Faster to process 200 LEM/ticket pairs
- More trustworthy — the admin sees the actual documents, not parsed data that might be wrong

## The Four Panels

| Panel | Source | Type | Already Exists? |
|-------|--------|------|-----------------|
| 1. Contractor LEM | From uploaded PDF | Image (zoomable) | NEW — extracted from upload |
| 2. Contractor Daily Ticket | From uploaded PDF | Image (zoomable) | NEW — extracted from upload |
| 3. Our Ticket Photo | From inspector report | Image (zoomable) | YES — `ticketPhotos` in activity block |
| 4. Inspector Report Data | From inspector report | Structured data | YES — `activity_blocks` in report |

Panels 1-3 are images. The admin reads them with their eyes. Panel 4 is the structured data the inspector verified in the app, including the cost calculation from rate cards.

## Processing Pipeline

### Step 1: Split PDF into Pages and Classify
Use the existing 3-phase pipeline (classify → group → but skip detailed extraction):

**Classify each page** (batches of 5, with rate limit delays):
```
Look at this page and classify it. Return only JSON:
{
  "page_type": "lem" or "daily_ticket",
  "date": "date or date range visible on this page (YYYY-MM-DD)",
  "crew": "crew name, discipline, or contractor name visible"
}

A LEM page typically has: a billing/summary format, column headers like Hours/Rate/Amount, subtotals, contractor letterhead or LEM reference number.

A daily ticket typically has: a single date, individual worker names, hours worked, foreman and inspector signature lines.
```

**Group pages** using the existing state machine:
- LEM → LEM = multi-page LEM (append)
- LEM → ticket = LEM complete, start reading ticket
- ticket → ticket = multi-page ticket (append)
- ticket → LEM = pair complete, start new group

Each group = one LEM/ticket pair.

### Step 2: Store Page Images
For each LEM/ticket pair:
- Convert LEM pages to images → store in `lem-uploads/{lem_id}/lem_pages/`
- Convert ticket pages to images → store in `lem-uploads/{lem_id}/ticket_pages/`
- Record URLs in the database

### Step 3: Match to Inspector Reports
For each pair, use the extracted date and crew name to find the matching inspector report:

```javascript
// Strategy 1: Date + contractor/crew name match
const match = await supabase
  .from('reports')
  .select('id, activity_blocks, report_date, inspector_name')
  .eq('organization_id', orgId)
  .eq('report_date', pairDate)
  // Search activity_blocks for matching contractor name
  
// Strategy 2: If crew name doesn't match exactly, fuzzy match
// (crew might be "Weld Crew 3" on LEM and "Welding Crew 3 - J. Smith" in report)

// Strategy 3: If no match found, flag as unmatched
```

From the matched report, pull:
- `ticketPhotos` — our original photo(s) from the field (Panel 3)
- Activity block data — labour entries, equipment entries, hours, classifications (Panel 4)
- Calculate costs using imported rate cards: hours × agreed rates (Panel 4)

### Step 4: Present the Four-Panel View

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│  CONTRACTOR LEM  │  CONTRACTOR      │  OUR TICKET      │  INSPECTOR       │
│                  │  DAILY TICKET    │  PHOTO           │  REPORT DATA     │
│  (What they're   │  (Attached to    │  (What we        │  (What the       │
│   billing)       │   their LEM)     │   photographed   │   inspector      │
│                  │                  │   in the field)  │   verified)      │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│                  │                  │                  │                  │
│ [LEM page        │ [Their ticket    │ [Our ticket      │ Crew: Weld 3     │
│  image(s)]       │  page image(s)]  │  photo(s) from   │ Date: Feb 27     │
│                  │                  │  activity block] │ Inspector: Smith  │
│ Zoomable         │ Zoomable         │ Zoomable         │                  │
│ Scrollable       │ Scrollable       │ Scrollable       │ LABOUR           │
│ Multi-page       │ Multi-page       │ Multi-page       │ J. Smith  W  8+3 │
│                  │                  │                  │ M. Jones  W  8+3 │
│                  │                  │                  │ [5 more...]      │
│                  │                  │                  │ Total: 7 / 77hrs │
│                  │                  │                  │                  │
│                  │                  │                  │ EQUIPMENT        │
│                  │                  │                  │ Sideboom  U-4421 │
│                  │                  │                  │   11 hrs         │
│                  │                  │                  │ Sideboom  U-4455 │
│                  │                  │                  │   11 hrs         │
│                  │                  │                  │ Total: 22 hrs    │
│                  │                  │                  │                  │
│                  │                  │                  │ COST (rate card) │
│                  │                  │                  │ Labour: $7,315   │
│                  │                  │                  │ Equip:  $3,300   │
│                  │                  │                  │ Total: $10,615   │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘

Feb 27, 2026  |  Welding Crew 3  |  Ticket #2330-0227-014

[✅ Accept]  [⚠ Dispute]  [🔴 Ticket Altered]  [→ Next]
```

**Panel 1 — Contractor LEM (image only):**
The LEM page(s) from the contractor's uploaded PDF. Multi-page LEMs show all pages in a scrollable view. Pinch to zoom on mobile, scroll-wheel on desktop.

**Panel 2 — Contractor Daily Ticket (image only):**
The daily ticket page(s) that were attached to the LEM in the same PDF. Same zoom/scroll behavior.

**Panel 3 — Our Ticket Photo (image only):**
The photo(s) the inspector took in the field. Pulled from `ticketPhotos` on the matched activity block. This is the ground truth — taken before anyone could change anything.

**Panel 4 — Inspector Report Data (structured):**
The verified data from the inspector's report. Shows:
- Header: crew name, date, inspector name, activity type, KP range
- Labour table: each worker's name, classification, RT, OT, JH hours
- Equipment table: type, unit number, hours
- Totals: headcount, total hours
- Cost calculation: labour hours × rate card rates, equipment hours × rate card rates, total cost
- This is the only panel with numbers the system calculated — everything else is images

**Image viewer features (all three image panels):**
- Pinch to zoom / scroll-wheel zoom
- Click to expand to full screen
- Multi-page scroll with page indicators (Page 1 of 3)
- High-resolution — must be readable, these contain handwritten entries

### Step 5: Navigation and Status Tracking

**Left sidebar — list of all LEM/ticket pairs:**
```
📋 LEM Reconciliation: SMJV February 2026
   198 pairs found | 0 accepted | 0 disputed | 198 pending

   Feb 15
     Welding Crew 3          ○ Pending
     Backfill Crew 1         ○ Pending
     Grading Crew 7          ○ Pending
   Feb 16
     Welding Crew 3          ○ Pending
     Coating Crew 2          ○ Pending
   ...
   
   ─── UNMATCHED (4) ───
     Feb 17 — Unknown Crew    ❌ No inspector report found
     Feb 22 — Civils Crew 9   ❌ No inspector report found
```

- Click any row to load its four-panel view
- Status icons: ○ Pending, ✅ Accepted, ⚠ Disputed, 🔴 Ticket Altered, ❌ Unmatched
- Filter by status (show all, show pending only, show disputed only)
- Sort by date (default) or by crew
- Progress bar at top showing completion percentage

**Keyboard navigation for speed:**
- Right arrow or N = Next pair
- A = Accept
- D = Dispute
- Left arrow = Previous pair

The admin should be able to blast through clean matches quickly — glance at all four, everything looks the same, hit A, next. Spend time only on the ones that don't match.

### Step 6: Resolution Actions

**Accept** — All four documents agree. Mark as accepted. No notes required.

**Dispute — Variance** — The numbers on the LEM don't match what the inspector reported. Requires notes explaining the discrepancy. Examples: "LEM shows 8 welders, inspector signed for 7", "Equipment hours inflated by 2 hrs per unit"

**Dispute — Ticket Altered** — The contractor's ticket copy (Panel 2) visually differs from our original photo (Panel 3). This is serious — it means the contractor modified the daily ticket after the inspector signed it. Requires notes. Auto-escalates notification to PM/CM.

**Skip** — Come back to this one later. Status stays pending.

### Step 7: Summary View

After all pairs are reviewed, show a reconciliation summary:

```
RECONCILIATION SUMMARY — SMJV February 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total LEM/Ticket Pairs:     198
Accepted:                   181  (91%)
Disputed — Variance:          9  ( 5%)
Disputed — Ticket Altered:    4  ( 2%)
Unmatched:                    4  ( 2%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Approve Reconciliation]    [Export Dispute Report PDF]
```

**Approve Reconciliation** — Only available when all pairs are reviewed (none pending). Sets the LEM upload status to 'approved'. This unlocks the invoice gate.

**Export Dispute Report** — Generates a PDF listing every disputed item with the admin's notes. This is what gets sent back to the contractor.

## Database Changes

### Simplify `lem_line_items` or replace with `lem_pairs`

The existing `lem_line_items` table was designed for parsed field data. For the visual approach, we need simpler storage:

```sql
-- Option: Add image columns to existing lem_line_items
ALTER TABLE lem_line_items ADD COLUMN lem_page_urls JSONB DEFAULT '[]';
ALTER TABLE lem_line_items ADD COLUMN contractor_ticket_urls JSONB DEFAULT '[]';

-- Or create a simpler table if starting fresh:
CREATE TABLE IF NOT EXISTS lem_reconciliation_pairs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lem_upload_id UUID REFERENCES contractor_lem_uploads(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  
  -- Classification data (minimal — just enough to match)
  work_date DATE,
  crew_name TEXT,
  
  -- Document images (stored in Supabase storage)
  lem_page_urls JSONB DEFAULT '[]',           -- URLs to LEM page images
  contractor_ticket_urls JSONB DEFAULT '[]',  -- URLs to contractor's ticket page images
  
  -- Matched inspector report
  matched_report_id UUID,
  matched_block_index INTEGER,
  match_method TEXT,  -- 'date_crew', 'manual', 'unmatched'
  
  -- Resolution
  status TEXT DEFAULT 'pending',
  resolution TEXT,        -- 'accepted', 'disputed_variance', 'disputed_ticket_altered'
  resolution_notes TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  
  CONSTRAINT valid_pair_status CHECK (status IN ('pending', 'accepted', 'disputed', 'skipped'))
);

ALTER TABLE lem_reconciliation_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation for lem_reconciliation_pairs"
ON lem_reconciliation_pairs FOR ALL
USING (
  organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
);

CREATE INDEX idx_lem_pairs_upload ON lem_reconciliation_pairs(lem_upload_id);
CREATE INDEX idx_lem_pairs_date ON lem_reconciliation_pairs(work_date, organization_id);
CREATE INDEX idx_lem_pairs_status ON lem_reconciliation_pairs(status);
```

## Responsive Layout

- **Wide screens (>1600px):** All four panels side by side
- **Large screens (1200-1600px):** 2x2 grid — images on top row, our photo + inspector data on bottom
- **Medium screens (900-1200px):** 2x2 grid with smaller images
- **Mobile (<900px):** Vertical stack — swipe between panels, or tabs (LEM | Their Ticket | Our Photo | Report)

## Performance

- Classification only extracts date and crew name — minimal API tokens per page
- Batch classification: 5 pages per batch, 15-second delay between batches
- For 400-600 pages: ~20-30 minutes processing (classification only)
- Page images stored as JPEGs at reasonable resolution (150 DPI is enough to read handwriting)
- Progress indicator with page count, pair count, and estimated time remaining

## Files to Create/Modify

```
NEW:
  supabase/migrations/YYYYMMDD_lem_visual_reconciliation.sql
  src/components/LEMFourPanelView.jsx     — The four-panel comparison view
  src/components/LEMPairList.jsx          — Left sidebar navigation list
  src/components/LEMReconcileSummary.jsx  — Summary view after all reviewed

MODIFY:
  src/utils/lemParser.js          — Simplify: classify + store images only, no field extraction
  src/components/LEMUpload.jsx    — Update progress display
  src/components/LEMReconciliation.jsx  — Replace with four-panel visual approach
  src/ReconciliationDashboard.jsx — Wire up new components
```
