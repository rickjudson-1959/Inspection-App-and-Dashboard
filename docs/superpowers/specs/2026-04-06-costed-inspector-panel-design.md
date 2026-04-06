# Costed Inspector Panel — Design Spec

**Date:** April 6, 2026
**Status:** Approved
**Scope:** Reconciliation system simplification — add costs to Inspector Report panel, learning alias system, toggle variance comparison

---

## Problem

The current reconciliation workflow is impractical:
- The VarianceComparisonPanel tries to fuzzy-match inspector entries against LEM entries, producing duplicate rows and unreliable costs
- Costs are "hit and miss" because rate card matching fails silently with a hardcoded alias map of ~60 entries
- The inspector report (Panel 4) shows no costs at all — but inspector data is the source of truth for dashboards
- The setup is overly complex for the actual need: cost out the inspector's numbers

## Solution

Add cost columns directly to the InspectorReportPanel (Panel 4) with a learning alias system that grows over time from admin corrections. Tuck the LEM variance comparison behind a toggle.

---

## 1. InspectorReportPanel — Cost Columns

### Manpower Table

Add **Rate** and **Cost** columns to the existing table:

| Name | Classification | RT | OT | JH | Qty | Rate | Cost |
|------|---------------|----|----|-----|-----|------|------|
| Chuck Baran | UA Welder Foreman | 8 | 2 | 10 | 1 | $85.00 | $850.00 |
| Joe Smith | Operator | 10 | 0 | 10 | 1 | No rate found | $0.00 |

- **Rate lookup order:** Check `classification_aliases` table first (learned mappings), then exact match against rate card, then normalized contains match
- **Cost formula:** `(RT x ST_rate) + (OT x OT_rate)` per person, multiplied by Qty
- **No rate found:** Shows "No rate found" quietly in the Rate column, $0.00 in Cost — no red flags, no drama

### Equipment Table

Same pattern — add **Rate** and **Cost** columns:

| Type | Unit # | Hrs | Qty | Rate | Cost |
|------|--------|-----|-----|------|------|
| Sideboom | SB-04 | 10 | 1 | $125.00 | $1,250.00 |

- **Cost formula:** `Hours x Rate x Qty`

### Summary Footer

Below both tables, a summary block:

| | |
|---|---|
| **Labour Total** | $12,450.00 |
| **Equipment Total** | $4,800.00 |
| **Grand Total** | **$17,250.00** |

### Data Source

Rate cards loaded from `/api/rates` endpoint (existing secure server-side route). Same endpoint already used by the reconciliation system.

---

## 2. Inline Editing — Click and Fix

Panel 4 becomes inline-editable. No edit mode toggle — click any field to edit it directly.

### Editable Fields
- Name
- Classification (opens searchable rate card dropdown)
- RT, OT, JH hours
- Qty
- Equipment type (opens searchable equipment rate card dropdown)
- Equipment hours, qty

### Classification/Equipment Editing
When the admin clicks a classification or equipment type field:
- A **searchable dropdown** appears listing all entries from the rate card
- Admin picks the correct one
- Cost recalculates immediately

### Audit Logging
Every edit is logged via `auditLoggerV3.js`:
- Field changed
- Old value
- New value
- Who made the change
- When

### Persistence
Edits save back to `daily_reports.activity_blocks` — this is the data that feeds dashboards. Uses the existing `onInspectorBlockChange` callback pattern already wired up in `ReconFourPanelView.jsx`.

---

## 3. Learning Alias System

### New Table: `classification_aliases`

```sql
CREATE TABLE classification_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  alias_type TEXT NOT NULL CHECK (alias_type IN ('labour', 'equipment')),
  original_value TEXT NOT NULL,
  mapped_value TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: one mapping per original value per org per type
CREATE UNIQUE INDEX idx_classification_aliases_unique
  ON classification_aliases (organization_id, alias_type, lower(original_value));

-- RLS
ALTER TABLE classification_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read aliases"
  ON classification_aliases FOR SELECT
  USING (organization_id = auth.jwt() ->> 'organization_id');

CREATE POLICY "Admins can insert aliases"
  ON classification_aliases FOR INSERT
  WITH CHECK (organization_id = auth.jwt() ->> 'organization_id');
```

### Learning Flow

1. Inspector enters "Welder" as a classification
2. System checks `classification_aliases` — no match
3. System checks rate card — no exact or contains match
4. Panel shows "No rate found" next to the classification
5. Admin clicks the classification field — searchable dropdown of all rate card entries appears
6. Admin picks "Mainline Welder on Auto Weld Spread"
7. Cost calculates immediately
8. **Prompt appears:** "Save this mapping so 'Welder' always resolves to 'Mainline Welder on Auto Weld Spread'?" — **Yes** / **No**
9. If Yes: saved to `classification_aliases`. Next time any inspector types "Welder", it auto-resolves
10. If No: cost still applies for this ticket, no alias saved (for ambiguous terms that could map to different things depending on context)

Same flow for equipment types.

### Rate Lookup Order (Final)

1. Check `classification_aliases` for a learned mapping
2. Exact match against rate card classification name
3. Case-insensitive contains match against rate card
4. No match → "No rate found", $0.00

---

## 4. VarianceComparisonPanel Toggle

- **Hidden by default** — no longer renders below the 4-panel grid
- **"Show LEM Comparison" button** appears in the ticket header area, only when LEM data exists for the ticket
- Clicking toggles the variance panel open/closed below the grid
- No changes to the variance panel internals — just visibility

---

## 5. Files Changed

| File | Change |
|------|--------|
| `src/Components/Reconciliation/InspectorReportPanel.jsx` | Add Rate/Cost columns, inline editing, rate card loading, alias lookup, summary footer, learning prompt |
| `src/Components/Reconciliation/ReconFourPanelView.jsx` | Add toggle state for variance panel, pass rate card data to InspectorReportPanel, conditional render of VarianceComparisonPanel |
| `supabase/migrations/20260406_classification_aliases.sql` | New `classification_aliases` table with RLS |

### Files NOT Changed
- `VarianceComparisonPanel.jsx` — untouched, just hidden behind toggle
- `nameMatchingUtils.js` — not needed for the simplified flow
- `varianceCalculation.js` — not needed for the simplified flow
- `lemParser.js` — untouched

---

## 6. What This Does NOT Do

- Does not match inspector entries against LEM entries (that's the variance panel's job, behind the toggle)
- Does not auto-OCR LEMs (existing upload flow untouched)
- Does not change how data flows to dashboards (inspector data remains the source of truth)
- Does not remove the existing hardcoded alias maps in VarianceComparisonPanel — they stay for when the toggle is used
