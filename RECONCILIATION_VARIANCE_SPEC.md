# RECONCILIATION VARIANCE COMPARISON — IMPLEMENTATION SPEC

## Purpose
Add a structured variance comparison below the 4-panel document viewer. This is the actual reconciliation — matching contractor billing line-by-line against what the inspector recorded, flagging discrepancies, and calculating overbilling.

**Read this entire document before writing any code.**

---

## DATA SOURCES

### Contractor side (what they're billing)
**Table:** `contractor_lems`
**Match by:** `field_log_id` = ticket_number
**Key fields:**
```javascript
{
  field_log_id: "18198",
  foreman: "Gerald Babchishin",
  date: "2014-01-20",
  total_labour_cost: 25800,
  total_equipment_cost: 17200,
  labour_entries: [
    {
      employee_id: "3928",
      name: "Chad Day",                    // NOTE: contractor format
      type: "Intermediate Operator",       // their classification
      rt_hours: 8, rt_rate: 57.74,
      ot_hours: 5, ot_rate: 86.62,
      dt_hours: 0, dt_rate: 115.49,
      sub: 85.00,                          // subsistence/per diem
      total: 980.02
    },
    // ... more workers
  ],
  equipment_entries: [
    {
      equipment_id: "OR1084",
      type: "CREWCAB - 1 TON",
      hours: 1,
      rate: 163.00,
      total: 163.00
    },
    // ... more equipment
  ]
}
```

### Inspector side (what was observed)
**Table:** `daily_tickets` → `activity_blocks`
**Match by:** `ticket_number` (or `field_log_id`) on `daily_tickets`
**Key fields:**
```javascript
// activity_blocks.labourEntries
[
  {
    employeeName: "C. Day",              // NOTE: inspector format — often abbreviated
    name: "Chad Day",                     // sometimes full, sometimes not
    classification: "Operator",           // may differ from contractor classification
    rtHours: 8,
    otHours: 5,
    dtHours: 0
  },
  // ... more workers
]

// activity_blocks.equipmentEntries
[
  {
    type: "Excavator",                   // inspector may use generic name
    description: "Cat 330",              // or may add detail here
    hours: 10,
    count: 1
  }
]
```

---

## FUZZY NAME MATCHING SYSTEM

### The problem
Contractor LEMs and inspector reports are filled out by different people using different naming conventions. The same person appears differently:

| Contractor LEM | Inspector Report | Same person? |
|---|---|---|
| Clayton Pickering | C. Pickering | YES |
| CHAD DAY | Chad Day | YES |
| Jonathan Harris | J. Harris | YES |
| Denis Arbour | Dennis Arbour | YES (typo) |
| ALLYN HANKEWICH | A. Hankewich | YES |
| Anthony Shaw | Tony Shaw | YES (nickname) |
| MacDonald, Tanner | Tanner MacDonald | YES (reversed) |
| Jean-Pierre Tremblay | JP Tremblay | YES (hyphenated) |
| Gerald Babchishin | Gerry Babchishin | YES (nickname) |
| Brad Whitworth | Bradley Whitworth | YES (nickname) |

### Matching algorithm — multi-pass with confidence scoring

Build a utility: `src/utils/nameMatchingUtils.js`

#### Step 0: Normalize both names
```javascript
function normalizeName(name) {
  if (!name) return '';
  return name
    .toUpperCase()                          // case insensitive
    .trim()
    .replace(/\s+/g, ' ')                  // collapse whitespace
    .replace(/[.,]/g, '')                   // remove punctuation
    .replace(/\s*-\s*/g, '-');             // normalize hyphens
}
```

#### Step 1: Extract name parts
```javascript
function extractNameParts(normalizedName) {
  // Handle "LAST, FIRST" format
  if (normalizedName.includes(',')) {
    const [last, first] = normalizedName.split(',').map(s => s.trim());
    return { first, last, full: `${first} ${last}` };
  }
  
  // Handle "FIRST LAST" format (may have middle names)
  const parts = normalizedName.split(' ').filter(Boolean);
  if (parts.length === 0) return { first: '', last: '', full: '' };
  if (parts.length === 1) return { first: '', last: parts[0], full: parts[0] };
  
  return {
    first: parts[0],
    last: parts[parts.length - 1],
    middle: parts.slice(1, -1).join(' '),
    full: parts.join(' ')
  };
}
```

#### Step 2: Multi-pass matching
Run these checks IN ORDER. Stop at the first match. Each pass has a confidence score.

**Pass 1 — Exact match (confidence: 1.0)**
```
Normalized names are identical.
"CHAD DAY" === "CHAD DAY" → match
```

**Pass 2 — Last name + first initial (confidence: 0.95)**
```
Last names match exactly AND first name starts with same letter.
"C. DAY" → last="DAY", firstInitial="C"
"CHAD DAY" → last="DAY", firstInitial="C"
→ match
```
This is the most common mismatch — inspectors frequently abbreviate first names.

**Pass 3 — Last name exact + first name Levenshtein ≤ 2 (confidence: 0.85)**
```
Last names match exactly AND first names are within edit distance 2.
"DENIS ARBOUR" vs "DENNIS ARBOUR" → last match, first edit distance = 1
→ match
```
Catches typos and minor spelling variations.

**Pass 4 — Last name exact + nickname lookup (confidence: 0.80)**
```
Last names match exactly AND first names are in the nickname table.
"TONY SHAW" vs "ANTHONY SHAW" → last match, Tony↔Anthony
→ match
```

Common pipeline crew nicknames to include:
```javascript
const NICKNAME_MAP = {
  'WILLIAM': ['WILL', 'BILL', 'BILLY', 'WILLY', 'LIAM'],
  'ROBERT': ['ROB', 'BOB', 'BOBBY', 'ROBBIE', 'BERT'],
  'RICHARD': ['RICK', 'RICH', 'DICK', 'RICKY'],
  'JAMES': ['JIM', 'JIMMY', 'JAMIE'],
  'JOHN': ['JACK', 'JOHNNY', 'JON'],
  'JOSEPH': ['JOE', 'JOEY'],
  'MICHAEL': ['MIKE', 'MIKEY', 'MICK'],
  'THOMAS': ['TOM', 'TOMMY'],
  'CHRISTOPHER': ['CHRIS', 'TOPHER'],
  'DANIEL': ['DAN', 'DANNY'],
  'MATTHEW': ['MATT', 'MATTY'],
  'ANTHONY': ['TONY'],
  'PATRICK': ['PAT', 'PADDY'],
  'EDWARD': ['ED', 'EDDIE', 'TED', 'TEDDY'],
  'GERALD': ['GERRY', 'JERRY'],
  'STEPHEN': ['STEVE', 'STEVIE'],
  'STEVEN': ['STEVE', 'STEVIE'],
  'TIMOTHY': ['TIM', 'TIMMY'],
  'KENNETH': ['KEN', 'KENNY'],
  'RONALD': ['RON', 'RONNIE'],
  'DONALD': ['DON', 'DONNIE'],
  'LAWRENCE': ['LARRY'],
  'RAYMOND': ['RAY'],
  'BRADLEY': ['BRAD'],
  'DOUGLAS': ['DOUG'],
  'JEFFREY': ['JEFF'],
  'GREGORY': ['GREG'],
  'NICHOLAS': ['NICK', 'NICKY'],
  'ALEXANDER': ['ALEX'],
  'BENJAMIN': ['BEN', 'BENNY'],
  'JONATHAN': ['JON', 'JONNY'],
  'FREDERICK': ['FRED', 'FREDDY'],
  'SAMUEL': ['SAM', 'SAMMY'],
  'JEAN-PIERRE': ['JP'],
  'JEAN-PAUL': ['JP'],
  'JEAN-LUC': ['JL'],
  'JEAN-MARC': ['JM'],
};

// Build reverse lookup at init time
// So 'TONY' → 'ANTHONY', 'GERRY' → 'GERALD', etc.
```

**Pass 5 — Last name Levenshtein ≤ 1 + first initial match (confidence: 0.70)**
```
Last names within edit distance 1 AND first initial matches.
"J. MACDONAD" vs "JONATHAN MACDONALD" → last edit distance 1, first initial J
→ match
```
Catches last name typos (missing letter, transposition).

**Pass 6 — Reversed name order (confidence: 0.75)**
```
Try swapping first/last and re-running passes 1-3.
"MACDONALD TANNER" vs "TANNER MACDONALD"
→ match after swap
```

**Pass 7 — Initials + last name (confidence: 0.65)**
```
One name is just initials + last name.
"JP TREMBLAY" vs "JEAN-PIERRE TREMBLAY" → last match, JP = J+P initials
→ match
```

#### Step 3: Return match results
```javascript
function matchWorkers(lemEntries, inspectorEntries) {
  const results = [];
  const unmatchedLem = [...lemEntries];
  const unmatchedInspector = [...inspectorEntries];
  
  // Run matching passes in order of confidence
  for (const pass of matchingPasses) {
    for (let i = unmatchedLem.length - 1; i >= 0; i--) {
      for (let j = unmatchedInspector.length - 1; j >= 0; j--) {
        const match = pass.check(unmatchedLem[i], unmatchedInspector[j]);
        if (match) {
          results.push({
            lemEntry: unmatchedLem[i],
            inspectorEntry: unmatchedInspector[j],
            confidence: match.confidence,
            matchMethod: match.method,  // e.g. "exact", "last+initial", "nickname"
            status: 'matched'
          });
          unmatchedLem.splice(i, 1);
          unmatchedInspector.splice(j, 1);
          break;
        }
      }
    }
  }
  
  // Remaining unmatched from LEM = billing for someone inspector didn't see
  for (const entry of unmatchedLem) {
    results.push({
      lemEntry: entry,
      inspectorEntry: null,
      confidence: 0,
      matchMethod: 'none',
      status: 'lem_only'  // 🚨 FLAG — potential ghost worker
    });
  }
  
  // Remaining unmatched from inspector = inspector saw someone not on LEM
  for (const entry of unmatchedInspector) {
    results.push({
      lemEntry: null,
      inspectorEntry: entry,
      confidence: 0,
      matchMethod: 'none',
      status: 'inspector_only'  // informational — not a billing issue
    });
  }
  
  return results;
}
```

#### Levenshtein distance function
```javascript
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (b[i - 1] === a[j - 1] ? 0 : 1)
      );
    }
  }
  return matrix[b.length][a.length];
}
```

---

## VARIANCE CALCULATION

### For each matched worker pair:
```javascript
function calculateWorkerVariance(lemEntry, inspectorEntry) {
  // LEM hours (what contractor billed)
  const lemRT = lemEntry.rt_hours || 0;
  const lemOT = lemEntry.ot_hours || 0;
  const lemDT = lemEntry.dt_hours || 0;
  const lemTotal = lemRT + lemOT + lemDT;
  
  // Inspector hours (what was observed)
  const insRT = inspectorEntry?.rtHours || inspectorEntry?.rt_hours || 0;
  const insOT = inspectorEntry?.otHours || inspectorEntry?.ot_hours || 0;
  const insDT = inspectorEntry?.dtHours || inspectorEntry?.dt_hours || 0;
  const insTotal = insRT + insOT + insDT;
  
  // Hour variances
  const rtVariance = lemRT - insRT;
  const otVariance = lemOT - insOT;
  const dtVariance = lemDT - insDT;
  const totalHourVariance = lemTotal - insTotal;
  
  // Cost variance (use LEM rates since that's what they're billing)
  const rtCostVariance = rtVariance * (lemEntry.rt_rate || 0);
  const otCostVariance = otVariance * (lemEntry.ot_rate || 0);
  const dtCostVariance = dtVariance * (lemEntry.dt_rate || 0);
  const totalCostVariance = rtCostVariance + otCostVariance + dtCostVariance;
  
  return {
    lemHours: { rt: lemRT, ot: lemOT, dt: lemDT, total: lemTotal },
    inspectorHours: { rt: insRT, ot: insOT, dt: insDT, total: insTotal },
    variance: {
      hours: { rt: rtVariance, ot: otVariance, dt: dtVariance, total: totalHourVariance },
      cost: { rt: rtCostVariance, ot: otCostVariance, dt: dtCostVariance, total: totalCostVariance }
    },
    lemCost: lemEntry.total || 0,
    status: getVarianceStatus(totalHourVariance, totalCostVariance)
  };
}

function getVarianceStatus(hourVariance, costVariance) {
  if (hourVariance === 0) return 'match';           // ✓ exact match
  if (hourVariance > 0 && hourVariance <= 1) return 'minor';  // ~ close enough (rounding)
  if (hourVariance > 1) return 'review';            // ⚠️ contractor billed more
  if (hourVariance < 0) return 'under';             // inspector saw more than billed (unusual)
  return 'match';
}
```

### For equipment matching:
Equipment matching is simpler — match on equipment type/description using contains/similarity.

```javascript
function matchEquipment(lemEquipment, inspectorEquipment) {
  // Equipment names vary wildly:
  // LEM: "CREWCAB - 1 TON"  Inspector: "1 Ton Truck"
  // LEM: "EXCAVATOR - CAT 330"  Inspector: "Cat 330 Excavator"
  
  // Strategy: tokenize both, count shared tokens
  function tokenize(str) {
    return (str || '').toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);  // drop single chars
  }
  
  function tokenOverlap(a, b) {
    const tokensA = new Set(tokenize(a));
    const tokensB = new Set(tokenize(b));
    let shared = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) shared++;
    }
    const total = Math.max(tokensA.size, tokensB.size);
    return total > 0 ? shared / total : 0;
  }
  
  // Match if token overlap > 0.3 (at least 1 shared meaningful word)
  // "CAT 330 EXCAVATOR" vs "EXCAVATOR CAT 330" → overlap 1.0
  // "CREWCAB 1 TON" vs "1 TON TRUCK" → shares "TON" → 0.33
}
```

---

## UI COMPONENT: VarianceComparisonPanel.jsx

### Location
Add this BELOW the 4-panel document viewer in LEMFourPanelView.jsx.

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│  RECONCILIATION SUMMARY                                   Ticket #18198 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ LEM CLAIMED  │  │ INSPECTOR    │  │ TOTAL VARIANCE           │  │
│  │ $12,450.00   │  │ $11,200.00   │  │ +$1,250.00  ⚠️ REVIEW   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  LABOUR COMPARISON                                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Name          │ Class.    │ LEM Hrs │ LEM $    │ Insp Hrs │ Var $ │
│  ─────────────────────────────────────────────────────────────────  │
│  ✓ C. Day      │ Int. Op.  │ 13.0    │ $980.02  │ 13.0     │ $0   │
│     match: "Chad Day" ↔ "C. Day" (95% last+initial)               │
│                                                                     │
│  ⚠️ C. Pickering│ Straw Op │ 15.0    │ $1,273   │ 12.0     │+$289 │
│     match: "Clayton Pickering" ↔ "C. Pickering" (95%)             │
│                                                                     │
│  🚨 D. Arbour  │ Gen Lab  │ 14.0    │ $903     │ —        │+$903 │
│     NO MATCH in inspector report — billing for unobserved worker   │
│                                                                     │
│  [ Accept All Matches ] [ Flag All Variances ] [ Export to PDF ]   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  EQUIPMENT COMPARISON                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Equipment      │ LEM Hrs │ LEM $    │ Insp Hrs │ Variance $       │
│  ─────────────────────────────────────────────────────────────────  │
│  ✓ Crewcab 1T   │ 1       │ $163     │ 1        │ $0              │
│  ⚠️ Cat 330 Exc │ 12      │ $2,400   │ 10       │ +$400           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Row details (expandable on click)
Clicking a row expands to show:
- Full name from LEM and full name from inspector report
- Match method and confidence ("Last name + first initial match, 95% confidence")
- RT / OT / DT breakdown side by side
- Rate × hours calculation showing where the cost variance comes from
- Action buttons: Accept / Dispute / Adjust

### Match confidence indicator
Show next to each matched pair:
- 🟢 95-100%: high confidence match (exact or last+initial)
- 🟡 70-94%: medium confidence (nickname, typo correction)
- 🟠 50-69%: low confidence — auditor should verify this is the same person
- 🔴 <50% or no match: flag

### Colour coding for variance
- Green background: $0 variance (exact match)
- Light yellow: variance under $100 (minor — likely rounding)
- Orange: variance $100-$500 (review)
- Red: variance over $500 (flag — potential overbilling)
- Dark red: LEM-only worker with no inspector match (ghost worker risk)

---

## ACTIONS

### Per row:
1. **Accept** — auditor confirms this line is correct. Sets row status to `accepted`.
2. **Dispute** — opens text input for dispute notes. Sets row status to `disputed`. Note is saved.
3. **Adjust** — auditor enters corrected hours. System recalculates cost at LEM rates. Saves original + adjusted amounts. Sets row status to `adjusted`.

### Bulk actions:
1. **Accept All Matches** — accepts all rows with ✓ status (zero variance)
2. **Flag All Variances** — disputes all rows with variance > threshold
3. **Export to PDF** — generates a reconciliation report PDF

### Audit logging (REQUIRED)
Every action must be logged via `auditLoggerV3.js`:
```javascript
{
  section: 'Reconciliation',
  field_name: 'Chad Day - Hours',
  old_value: '13',        // LEM claimed
  new_value: '13',        // accepted or adjusted value
  change_reason: 'Accepted - matches inspector report',
  // or
  change_reason: 'Disputed - worker not observed by inspector on this date'
}
```

---

## DATABASE: reconciliation_line_items table

Store per-row reconciliation decisions. Run this in Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS reconciliation_line_items (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  ticket_number   text NOT NULL,
  
  -- What type of line item
  item_type       text NOT NULL CHECK (item_type IN ('labour', 'equipment')),
  
  -- Matching
  lem_worker_name       text,
  inspector_worker_name text,
  match_confidence      numeric(5,4),   -- 0.0000 to 1.0000
  match_method          text,           -- 'exact', 'last_initial', 'nickname', etc.
  
  -- LEM data (contractor claimed)
  lem_rt_hours    numeric(6,2) DEFAULT 0,
  lem_ot_hours    numeric(6,2) DEFAULT 0,
  lem_dt_hours    numeric(6,2) DEFAULT 0,
  lem_total_hours numeric(6,2) DEFAULT 0,
  lem_cost        numeric(10,2) DEFAULT 0,
  
  -- Inspector data (observed)
  inspector_rt_hours    numeric(6,2) DEFAULT 0,
  inspector_ot_hours    numeric(6,2) DEFAULT 0,
  inspector_dt_hours    numeric(6,2) DEFAULT 0,
  inspector_total_hours numeric(6,2) DEFAULT 0,
  
  -- Variance
  variance_hours  numeric(6,2) DEFAULT 0,
  variance_cost   numeric(10,2) DEFAULT 0,
  
  -- Reconciliation decision
  status          text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'disputed', 'adjusted')),
  adjusted_hours  numeric(6,2),         -- only if status = 'adjusted'
  adjusted_cost   numeric(10,2),        -- only if status = 'adjusted'
  dispute_notes   text,                 -- only if status = 'disputed'
  
  -- Who made the decision
  reconciled_by   uuid REFERENCES auth.users(id),
  reconciled_at   timestamptz,
  
  -- Timestamps
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recon_items_ticket 
  ON reconciliation_line_items(organization_id, ticket_number);
CREATE INDEX IF NOT EXISTS idx_recon_items_status 
  ON reconciliation_line_items(organization_id, status);

-- RLS
ALTER TABLE reconciliation_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_full_access_recon_items"
  ON reconciliation_line_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'super_admin'
    )
  );

CREATE POLICY "org_members_read_recon_items"
  ON reconciliation_line_items FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "org_admins_write_recon_items"
  ON reconciliation_line_items FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );
```

---

## FILE STRUCTURE
```
src/
  Components/
    Reconciliation/
      VarianceComparisonPanel.jsx   — main comparison UI (NEW)
      VarianceSummaryBar.jsx        — top-level totals (NEW)
      VarianceRow.jsx               — expandable row component (NEW)
  utils/
    nameMatchingUtils.js            — fuzzy name matching (NEW)
    varianceCalculation.js          — hour/cost variance math (NEW)
```

---

## IMPLEMENTATION ORDER

1. Build `nameMatchingUtils.js` — the matching engine with all 7 passes + nickname map
2. Build `varianceCalculation.js` — hour and cost variance math
3. Run the SQL migration for `reconciliation_line_items`
4. Build `VarianceSummaryBar.jsx` — total claimed vs verified vs variance
5. Build `VarianceRow.jsx` — single row with expand/collapse, actions
6. Build `VarianceComparisonPanel.jsx` — fetches data, runs matching, renders table
7. Integrate into `LEMFourPanelView.jsx` — add below the document panels
8. Test with ticket 18198 — verify name matching works across different formats
9. Test accept/dispute/adjust actions and verify audit logging

---

## WHAT "DONE" LOOKS LIKE

- Open ticket 18198 in the 4-panel view
- Below the document panels, see the variance comparison
- Summary bar shows total LEM claimed, total inspector verified, and dollar variance
- Each worker from the LEM is matched (or flagged as unmatched) against inspector data
- Match confidence is shown — "C. Day" matched to "Chad Day" at 95% confidence
- Hour and cost variances are calculated and colour-coded
- Workers on the LEM but not in the inspector report are flagged in red
- Clicking a row expands to show RT/OT/DT breakdown and action buttons
- Accept/Dispute/Adjust actions work and log to audit trail
- Equipment comparison works the same way below the labour section
