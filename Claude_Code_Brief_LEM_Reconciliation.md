# Brief: LEM PDF Ingestion & Three-Way Reconciliation

## What This Does
Adds the ability to upload contractor LEM (Labour and Equipment Manifest) PDFs into the Reconciliation Dashboard. The system parses each LEM, matches every line item to existing inspector report data using the **ticket number** as the primary key, and flags discrepancies between what the contractor is billing and what the inspector signed for in the field.

## The Three-Way Match
The reconciliation links three data sources through the ticket number:

| Source | When Created | What It Contains | Where It Lives Now |
|--------|-------------|------------------|-------------------|
| **Contractor Daily Ticket** (photo) | Day of work | Original handwritten/printed ticket signed by inspector. The physical source of truth. | Stored as `ticketPhotos` in the activity block (Supabase storage) |
| **Inspector Report** (verified data) | Day of work | OCR'd + inspector-verified labour (names, classifications, RT/OT/JH, count) and equipment (type, unit#, hours, count). Independently observed. | Stored in `activity_blocks` within each report (Supabase) |
| **Contractor LEM** (billing claim) | Billing time (weekly/monthly) | Aggregated from daily tickets. What the contractor claims they're owed. Submitted as locked PDF. | **NEW — this brief adds this** |

**The ticket number (`ticketNumber` field in ActivityBlock.jsx) is the key that connects all three.**

## Current State of the App

### What Already Exists
- `ticketNumber` field captured per activity block (text input + OCR extraction)
- `ticketPhotos` — photo(s) of the original contractor ticket stored per activity block
- OCR via Claude Vision extracts labour and equipment data from ticket photos
- 127 labour classifications and 334 equipment types (from rate sheet + CX2-FC contract)
- Imported contractor rate cards for cost calculations
- `ReconciliationDashboard.jsx` — already has:
  - Three-way match tab (Contractor LEM vs. Timesheet vs. Inspector)
  - Billing status management
  - Invoice batching
  - Disputes and corrections
  - Crossing support reconciliation
  - Crossing variance (bore integrity audit)
  - Trackable items reconciliation (14 categories)

### What's Missing (This Brief Adds)
1. LEM PDF upload and parsing
2. LEM line item storage in the database
3. Automated matching of LEM line items to inspector report activity blocks via ticket number
4. Variance calculation and flagging between LEM claims and inspector-verified data
5. Reconciliation summary view showing matched, unmatched, and disputed items

## Implementation

### 1. Database Schema

**New table: `contractor_lems`**
```sql
CREATE TABLE contractor_lems (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  contractor_name TEXT NOT NULL,
  lem_period_start DATE,
  lem_period_end DATE,
  lem_number TEXT,              -- Contractor's LEM reference number
  source_filename TEXT NOT NULL,
  source_file_url TEXT,         -- Supabase storage URL for original PDF
  total_labour_hours NUMERIC(10,2),
  total_equipment_hours NUMERIC(10,2),
  total_labour_cost NUMERIC(12,2),
  total_equipment_cost NUMERIC(12,2),
  total_claimed NUMERIC(12,2),
  status TEXT DEFAULT 'uploaded', -- uploaded, parsing, parsed, reconciling, reconciled, disputed, approved
  parse_errors JSONB DEFAULT '[]',
  notes TEXT,
  CONSTRAINT valid_status CHECK (status IN ('uploaded', 'parsing', 'parsed', 'reconciling', 'reconciled', 'disputed', 'approved'))
);

-- RLS: org-scoped
ALTER TABLE contractor_lems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own org LEMs" ON contractor_lems
  FOR ALL USING (organization_id = (SELECT organization_id FROM memberships WHERE user_id = auth.uid()));
```

**New table: `lem_line_items`**
```sql
CREATE TABLE lem_line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lem_id UUID REFERENCES contractor_lems(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  ticket_number TEXT,            -- THE KEY — matches activity_blocks.ticketNumber
  work_date DATE,
  crew_name TEXT,
  activity_description TEXT,
  
  -- Labour claimed
  labour_entries JSONB DEFAULT '[]',
  -- Each entry: { classification, employee_name, rt_hours, ot_hours, jh_hours, count, rt_rate, ot_rate, jh_rate, line_total }
  total_labour_hours NUMERIC(10,2),
  total_labour_cost NUMERIC(12,2),
  
  -- Equipment claimed
  equipment_entries JSONB DEFAULT '[]',
  -- Each entry: { equipment_type, unit_number, hours, count, rate, line_total }
  total_equipment_hours NUMERIC(10,2),
  total_equipment_cost NUMERIC(12,2),
  
  -- Line total
  line_total NUMERIC(12,2),
  
  -- Matching
  matched_report_id UUID,        -- Links to the inspector report
  matched_block_index INTEGER,   -- Which activity block in that report
  match_status TEXT DEFAULT 'unmatched',
  -- unmatched: no inspector report found for this ticket number
  -- matched: ticket number found, comparison pending
  -- clean: matched and no discrepancies
  -- variance: matched but discrepancies found
  -- disputed: flagged for review
  -- resolved: dispute resolved
  
  -- Variance data (populated after matching)
  variance_data JSONB,
  -- { labour_hour_variance, equipment_hour_variance, labour_cost_variance, equipment_cost_variance, 
  --   labour_count_variance, detail: [{ field, lem_value, inspector_value, difference }] }
  
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  
  CONSTRAINT valid_match_status CHECK (match_status IN ('unmatched', 'matched', 'clean', 'variance', 'disputed', 'resolved'))
);

-- RLS: org-scoped
ALTER TABLE lem_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own org LEM items" ON lem_line_items
  FOR ALL USING (organization_id = (SELECT organization_id FROM memberships WHERE user_id = auth.uid()));

-- Index for fast ticket number lookups
CREATE INDEX idx_lem_line_items_ticket ON lem_line_items(ticket_number, organization_id);
CREATE INDEX idx_lem_line_items_lem ON lem_line_items(lem_id);
CREATE INDEX idx_lem_line_items_date ON lem_line_items(work_date, organization_id);
```

### 2. LEM PDF Upload (UI)

Add to ReconciliationDashboard.jsx — either as a new tab or integrated into the existing three-way match tab:

**Upload Flow:**
1. User clicks "Upload Contractor LEM"
2. File picker accepts PDF only
3. User enters: contractor name, LEM period (start/end dates), LEM reference number (optional)
4. PDF is uploaded to Supabase storage bucket
5. Record created in `contractor_lems` table with status = 'uploaded'
6. Parsing begins automatically (or on button click)

### 3. LEM PDF Parsing

**Approach: Claude Vision / Claude API**

Contractor LEMs vary in format — some are generated from accounting software (structured tables), some are Excel exports saved as PDF, some are hand-formatted. Use the same Claude API approach that already works for ticket OCR.

**Parsing Flow:**
1. Convert each PDF page to an image (or extract text with pdfplumber first)
2. Send to Claude API with a structured prompt:

```
You are parsing a contractor Labour and Equipment Manifest (LEM) for a pipeline construction project. 

Extract every line item from this LEM page. Each line item represents one daily ticket.

For each line item, extract:
- ticket_number: The contractor's daily ticket number/reference
- work_date: The date of work (YYYY-MM-DD)
- crew_name: Crew or discipline name
- activity_description: What work was performed

For labour entries on each line item:
- employee_name (if listed)
- classification (job title/trade)
- rt_hours (regular time - first 8 hours)
- ot_hours (overtime - beyond 8 hours)
- jh_hours (jump hours/bonus hours, if listed)
- count (number of workers if grouped)
- rate (hourly rate if shown)
- line_total (dollar amount if shown)

For equipment entries on each line item:
- equipment_type (machine name/description)
- unit_number (fleet/asset number)
- hours (hours of use)
- count (number of units if grouped)
- rate (hourly rate if shown)
- line_total (dollar amount if shown)

Return ONLY valid JSON array. Each element is one daily ticket/line item.
If a page contains headers, subtotals, or summary rows only (no individual ticket data), return an empty array.
```

3. Parse the response and insert into `lem_line_items`
4. Update `contractor_lems` status to 'parsed'
5. Store any parsing errors/warnings in `parse_errors` JSONB

**Important: The ticket number format must be normalized.** 
The inspector might enter "2330-0227-014" while the LEM might show "2330-0227-014" or "#014" or "Ticket 014" or "DT-014". Build a normalization function that strips common prefixes and matches on the numeric core. Also support fuzzy matching by date + crew name when ticket numbers don't match exactly.

### 4. Automated Matching Engine

After parsing, run the matching engine:

```javascript
// For each LEM line item:
async function matchLEMItem(lemItem, organizationId) {
  
  // STRATEGY 1: Exact ticket number match
  // Query activity_blocks where ticketNumber matches
  const exactMatch = await supabase
    .from('reports')
    .select('id, activity_blocks, report_date, inspector_name')
    .eq('organization_id', organizationId)
    .contains('activity_blocks', [{ ticketNumber: lemItem.ticket_number }]);
  
  if (exactMatch) return { match: exactMatch, confidence: 'exact' };
  
  // STRATEGY 2: Normalized ticket number match
  // Strip prefixes, try numeric portion only
  const normalizedTicket = normalizeTicketNumber(lemItem.ticket_number);
  // Search with normalized version...
  
  // STRATEGY 3: Date + crew/contractor match
  // If no ticket number match, try matching by date and crew name
  const dateCrewMatch = await supabase
    .from('reports')
    .select('id, activity_blocks, report_date, inspector_name')
    .eq('organization_id', organizationId)
    .eq('report_date', lemItem.work_date)
    .contains('activity_blocks', [{ contractor: lemItem.crew_name }]);
  
  if (dateCrewMatch) return { match: dateCrewMatch, confidence: 'date_crew' };
  
  // STRATEGY 4: Unmatched
  return { match: null, confidence: 'none' };
}
```

### 5. Variance Calculation

Once matched, compare every field:

```javascript
function calculateVariance(lemItem, inspectorBlock) {
  const variances = [];
  
  // --- LABOUR COMPARISON ---
  // Sum total labour hours from LEM
  const lemLabourHours = lemItem.labour_entries.reduce((sum, e) => 
    sum + (e.rt_hours || 0) + (e.ot_hours || 0) + (e.jh_hours || 0), 0);
  
  // Sum total labour hours from inspector report
  const inspLabour = inspectorBlock.labour || [];
  const inspLabourHours = inspLabour.reduce((sum, e) => 
    sum + (parseFloat(e.rt) || 0) + (parseFloat(e.ot) || 0) + (parseFloat(e.jh) || 0), 0);
  
  if (lemLabourHours !== inspLabourHours) {
    variances.push({
      field: 'total_labour_hours',
      lem_value: lemLabourHours,
      inspector_value: inspLabourHours,
      difference: lemLabourHours - inspLabourHours,
      severity: Math.abs(lemLabourHours - inspLabourHours) > 8 ? 'high' : 'medium'
    });
  }
  
  // Compare headcount
  const lemHeadcount = lemItem.labour_entries.reduce((sum, e) => sum + (e.count || 1), 0);
  const inspHeadcount = inspLabour.length; // Each labour entry is one person (count field)
  
  if (lemHeadcount !== inspHeadcount) {
    variances.push({
      field: 'labour_headcount',
      lem_value: lemHeadcount,
      inspector_value: inspHeadcount,
      difference: lemHeadcount - inspHeadcount,
      severity: 'high' // Headcount discrepancy is always significant
    });
  }
  
  // --- EQUIPMENT COMPARISON ---
  const lemEquipHours = lemItem.equipment_entries.reduce((sum, e) => 
    sum + (e.hours || 0) * (e.count || 1), 0);
  
  const inspEquip = inspectorBlock.equipment || [];
  const inspEquipHours = inspEquip.reduce((sum, e) => 
    sum + (parseFloat(e.hours) || 0) * (parseFloat(e.count) || 1), 0);
  
  if (lemEquipHours !== inspEquipHours) {
    variances.push({
      field: 'total_equipment_hours',
      lem_value: lemEquipHours,
      inspector_value: inspEquipHours,
      difference: lemEquipHours - inspEquipHours,
      severity: Math.abs(lemEquipHours - inspEquipHours) > 10 ? 'high' : 'medium'
    });
  }
  
  // --- COST COMPARISON (if rates available) ---
  // Use imported rate cards to calculate expected cost from inspector data
  // Compare against LEM claimed cost
  // This catches rate discrepancies in addition to hour discrepancies
  
  // --- PER-PERSON COMPARISON ---
  // For each person in the LEM, try to find matching person in inspector data
  // Compare individual hours (catches padding on specific workers)
  
  return {
    has_variance: variances.length > 0,
    total_labour_hour_variance: lemLabourHours - inspLabourHours,
    total_equipment_hour_variance: lemEquipHours - inspEquipHours,
    total_labour_cost_variance: (lemItem.total_labour_cost || 0) - calculateInspectorLabourCost(inspLabour),
    total_equipment_cost_variance: (lemItem.total_equipment_cost || 0) - calculateInspectorEquipmentCost(inspEquip),
    details: variances
  };
}
```

### 6. Reconciliation Dashboard UI

**LEM Management Section:**

**Upload area:**
- Drag-and-drop or click to upload LEM PDF
- Fields: contractor name, period start/end, LEM reference number
- Upload button → shows parsing progress
- List of uploaded LEMs with status badges (parsing, parsed, reconciling, reconciled, approved)

**Reconciliation Summary (per LEM):**

Header cards:
| Total Line Items | Matched (Clean) | Matched (Variance) | Unmatched | Disputed |
|-----------------|-----------------|--------------------| ----------|----------|
| 47              | 31 (66%)        | 9 (19%)            | 5 (11%)   | 2 (4%)   |

Financial summary:
| | LEM Claims | Inspector Verified | Variance |
|---|---|---|---|
| Labour Hours | 4,280 | 4,106 | +174 hrs ($16,530) |
| Equipment Hours | 2,150 | 2,098 | +52 hrs ($7,800) |
| **Total** | **$892,400** | **$868,070** | **+$24,330** |

**Line Item Detail Table:**
| Ticket # | Date | Crew | LEM Labour Hrs | Inspector Labour Hrs | Variance | LEM Equip Hrs | Inspector Equip Hrs | Variance | Status | Action |
|----------|------|------|---------------|---------------------|----------|--------------|--------------------| ---------|--------|--------|
| 2330-0227-014 | Feb 27 | Welding Crew 3 | 96 | 84 | **+12** | 24 | 22 | **+2** | ⚠ Variance | Review |
| 2330-0227-015 | Feb 27 | Backfill Crew 1 | 80 | 80 | 0 | 16 | 16 | 0 | ✅ Clean | — |
| 2330-0228-003 | Feb 28 | Grading Crew 7 | — | — | — | — | — | — | ❌ Unmatched | Find Match |

**Clicking "Review" on a variance row opens a full-width three-panel comparison view:**

```
┌─────────────────────┬─────────────────────┬─────────────────────┐
│  ORIGINAL TICKET    │  INSPECTOR REPORT   │  CONTRACTOR LEM     │
│  (Source of Truth)  │  (Verified in App)  │  (Billing Claim)    │
├─────────────────────┼─────────────────────┼─────────────────────┤
│                     │                     │                     │
│  [Ticket Photo]     │  Ticket #: 014      │  Ticket #: 014      │
│  Zoomable image     │  Date: Feb 27       │  Date: Feb 27       │
│  of the original    │  Crew: Weld Crew 3  │  Crew: Weld Crew 3  │
│  daily ticket       │                     │                     │
│  signed by the      │  LABOUR             │  LABOUR             │
│  inspector          │  J. Smith  Welder   │  J. Smith  Welder   │
│                     │    RT: 8  OT: 3     │    RT: 8  OT: 4  ← │
│  If multi-page,     │  M. Jones  Welder   │  M. Jones  Welder   │
│  all pages shown    │    RT: 8  OT: 3     │    RT: 8  OT: 4  ← │
│  in scrollable      │  [5 more workers]   │  [5 more workers]   │
│  viewer with        │                     │  K. Brown  Helper ← │
│  page numbers       │  Total: 7 workers   │  Total: 8 workers ← │
│                     │  Total: 77 hrs      │  Total: 96 hrs   ← │
│                     │                     │                     │
│                     │  EQUIPMENT          │  EQUIPMENT          │
│                     │  Sideboom 583       │  Sideboom 583       │
│                     │    U-4421  11 hrs   │    U-4421  12 hrs ← │
│                     │  Sideboom 583       │  Sideboom 583       │
│                     │    U-4455  11 hrs   │    U-4455  12 hrs ← │
│                     │                     │                     │
│                     │  Total: 22 hrs      │  Total: 24 hrs   ← │
├─────────────────────┴─────────────────────┴─────────────────────┤
│  VARIANCE SUMMARY                                               │
│  Labour: +1 worker, +19 hours (+$1,805)                         │
│  Equipment: +2 hours (+$540)                                    │
│  Total Variance: +$2,345                                        │
├─────────────────────────────────────────────────────────────────┤
│  RESOLUTION                                                     │
│  ○ Accept LEM (approve contractor's numbers)                    │
│  ● Accept Inspector (approve field-verified numbers)            │
│  ○ Split / Custom (manually adjust specific lines)              │
│  ○ Dispute (flag and return to contractor)                      │
│                                                                 │
│  Resolution Notes: [text field]                                 │
│                                                                 │
│  [Approve]  [Dispute]  [Save Draft]                             │
└─────────────────────────────────────────────────────────────────┘
```

**Three-Panel Implementation Details:**

- **Left Panel (Original Ticket):** Renders the `ticketPhotos` from the matched activity block using Supabase storage URLs. Zoomable (pinch on mobile, scroll-wheel on desktop). If multi-page ticket, shows all pages in a vertical scroll with page numbers. This is the paper trail — the thing the inspector physically signed.

- **Middle Panel (Inspector Report):** Pulls labour and equipment data from the matched `activity_blocks` entry in the inspector's report. Shows every labour entry (name, classification, RT, OT, JH, count) and every equipment entry (type, unit#, hours, count). Also shows: inspector name, report date, activity type, KP range, work description. Links to the full report if the admin wants to see more context.

- **Right Panel (Contractor LEM):** Shows the parsed LEM line item data for this ticket number. Same structure as the middle panel so fields align horizontally for easy comparison.

- **Discrepancy Highlighting:** Any field where the LEM value differs from the inspector value gets highlighted:
  - Red background: Difference exceeds threshold (e.g., headcount mismatch, >2 hours variance per person)
  - Amber background: Minor variance (e.g., 0.5-2 hour difference — could be rounding)
  - Arrow indicator (←) on the LEM column pointing to the discrepant value

- **Row-Level Matching:** The system attempts to match individual workers and equipment across all three sources by name/classification and unit number. If the LEM lists a worker or piece of equipment that doesn't appear in the inspector's report at all, that entire row is highlighted red with a "NOT IN INSPECTOR REPORT" tag.

- **Variance Summary Bar:** Below the three panels, a summary bar shows total variance in hours and dollars for both labour and equipment. Color-coded: green if zero variance, amber if minor, red if significant.

- **Resolution Section:** Below the summary. Four options:
  1. **Accept LEM** — Approve the contractor's numbers (rare — usually only when the inspector made an error)
  2. **Accept Inspector** — Approve the field-verified numbers (most common resolution)
  3. **Split / Custom** — Admin can manually set the approved value for each line (for partial agreements)
  4. **Dispute** — Flag the item and generate a dispute notice for the contractor

  Resolution notes are mandatory when choosing anything other than "Accept Inspector" — the admin must document why they're siding with the LEM or splitting the difference.

- **Responsive Layout:** On wide screens (>1400px), all three panels display side by side. On medium screens (900-1400px), the ticket photo collapses to a thumbnail that expands on click, and the two data panels remain side by side. On mobile, all three stack vertically with the ticket photo collapsible.

**Clicking "Find Match" on an unmatched row shows:**
- Fuzzy match suggestions (by date, crew, activity type)
- Manual match option (search by date range and select a report)
- "No Match — Flag for Review" option (contractor is billing for a ticket that has no inspector record)

### 7. Ticket Number Normalization

```javascript
function normalizeTicketNumber(raw) {
  if (!raw) return null;
  // Remove common prefixes
  let normalized = raw.toString().trim()
    .replace(/^(ticket|tkt|dt|#|no\.?)\s*/i, '')
    .replace(/\s+/g, '')
    .toUpperCase();
  return normalized;
}

function ticketNumbersMatch(lemTicket, inspectorTicket) {
  const a = normalizeTicketNumber(lemTicket);
  const b = normalizeTicketNumber(inspectorTicket);
  if (!a || !b) return false;
  
  // Exact match after normalization
  if (a === b) return true;
  
  // One contains the other (handles "2330-0227-014" vs "014")
  if (a.includes(b) || b.includes(a)) return true;
  
  // Match on last segment (handles different prefix formats)
  const aLast = a.split(/[-_]/).pop();
  const bLast = b.split(/[-_]/).pop();
  if (aLast === bLast && aLast.length >= 3) return true;
  
  return false;
}
```

### 8. Integration with Existing Reconciliation Dashboard

The LEM reconciliation should integrate with — not replace — the existing three-way match functionality. The existing tabs and features remain unchanged. Add:

- A new "Contractor LEMs" tab (or sub-tab within the existing three-way match)
- LEM upload widget
- LEM list with status
- Reconciliation detail view
- Variance summary cards that update the existing billing status management

### 9. Reporting

**LEM Reconciliation Report (PDF export):**
- Period covered
- Contractor name and LEM reference
- Summary table (total claimed vs verified vs variance)
- All variance items with ticket numbers, dates, and specific discrepancies
- Unmatched items flagged
- Resolution status for disputed items
- Signature blocks (Reviewed By, Approved By)

This report is what gets sent back to the contractor with the invoice: "We've reviewed your LEM. Here are the items we agree with, here are the items with discrepancies, and here's what we're approving for payment."

### 10. Workflow Integration

The LEM status flows through:
```
uploaded → parsing → parsed → reconciling → reconciled → approved
                                    ↓
                                disputed → resolved → approved
```

- **uploaded**: PDF received, in queue
- **parsing**: Claude API processing the PDF
- **parsed**: Line items extracted, ready for matching
- **reconciling**: Matching engine running / user reviewing matches
- **reconciled**: All items matched and variances resolved
- **disputed**: One or more items flagged, sent back to contractor
- **approved**: All items approved for payment

Notifications (via existing Resend email integration):
- Email to PM/CM when LEM is uploaded
- Email to admin when reconciliation is complete
- Email summary of variances to contractor (if dispute)

## Important Notes

1. **Ticket number is the primary key for matching.** The `ticketNumber` field already exists in every activity block. If inspectors aren't consistently entering it, this system won't work well. Consider making `ticketNumber` a required field (or at least a strong Health Score factor) to enforce data capture.

2. **LEM PDF formats vary.** Every contractor uses different software, different layouts, different column names. The Claude API parsing approach handles this variability the same way ticket OCR already does. Don't try to build rigid table parsers.

3. **Rate card matching.** The system already has imported rate cards (127 labour classifications, 334 equipment types). Use these to calculate expected costs from inspector data so you can compare against LEM costs. A variance in hours AND rates means the contractor is potentially padding both.

4. **Audit trail.** Every match, variance flag, resolution, and approval must be logged. This is the documentation that supports or disputes the contractor's invoice. The existing `auditLoggerV3.js` pattern should extend to cover LEM reconciliation actions.

5. **Multi-activity reports.** One inspector report can have multiple activity blocks, each with its own ticket number. One LEM PDF can contain dozens of ticket references. The matching must work at the activity block level, not the report level.

6. **This feeds the CVI.** Once LEMs are reconciled and approved, the approved amounts become the definitive ACWP (Actual Cost of Work Performed) that feeds into the CVI calculation engine. This closes the loop: field data → verified costs → CVI → capital exposure forecast.

## Files to Create/Modify
```
NEW:
  supabase/migrations/YYYYMMDD_create_lem_tables.sql    # contractor_lems + lem_line_items tables
  src/components/LEMUpload.jsx                           # Upload widget + parsing trigger
  src/components/LEMReconciliation.jsx                   # Matching + variance view
  src/utils/lemParser.js                                 # Claude API PDF parsing
  src/utils/lemMatcher.js                                # Ticket number matching + variance calc
  src/utils/ticketNormalizer.js                          # Ticket number normalization

MODIFY:
  src/ReconciliationDashboard.jsx                        # Add LEM tab + integrate components
  src/InspectorReport.jsx                                # Consider making ticketNumber higher priority in Health Score
  src/agents/ReportHealthScorer.js                       # Optional: score missing ticket numbers
  pipe-up-field-guide-agent-kb.md                        # Document LEM reconciliation workflow
  PROJECT_MANIFEST.md                                    # Add LEM tables and components
```

## Dependencies
- Existing: Supabase, Claude API (already used for ticket OCR), Resend (email)
- No new external dependencies required
