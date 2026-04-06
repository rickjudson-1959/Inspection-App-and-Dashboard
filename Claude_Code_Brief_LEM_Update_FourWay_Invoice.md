# Brief: LEM Reconciliation UPDATE — Four-Way Comparison & Two-Stage Workflow

## Context
The base LEM reconciliation system is built (LEMUpload, LEMReconciliation, lemParser, lemMatcher, ticketNormalizer, database tables, ReconciliationDashboard tab). This brief adds two features that weren't in the original spec.

## UPDATE 1: Four-Way Comparison (not three-way)

### What Changed
The original brief compared three sources: our ticket photo, inspector report data, and the contractor's LEM summary. But the contractor sends their LEMs with **copies of the daily tickets attached**. Those ticket copies need to be compared against our original photos because the contractor may have altered tickets between the field and billing time.

### The Four Sources (linked by ticket number)

| # | Source | When Created | What It Captures | Already In App? |
|---|--------|-------------|-----------------|-----------------|
| 1 | **Our ticket photo** | Day of work | Photo taken by inspector before anything could change | YES — `ticketPhotos` in activity block |
| 2 | **Inspector report data** | Day of work | OCR'd + inspector-verified labour, equipment, hours | YES — `activity_blocks` in report |
| 3 | **Contractor's ticket copy** | End of month | Their PDF copy of the same daily ticket — may differ from original | NEW — extract from LEM attachment |
| 4 | **LEM summary line item** | End of month | Aggregated billing claim for that ticket | YES — `lem_line_items` table |

### What to Build

**A. Extract individual ticket images from the LEM PDF**

The contractor's LEM PDF bundle contains the LEM summary pages AND copies of the daily tickets as attachments or subsequent pages. During parsing (in `lemParser.js`), the system needs to:

1. Identify which pages are LEM summary pages and which are daily ticket copies
2. For ticket copy pages: extract the ticket number from the page, and store the page image linked to the corresponding `lem_line_items` record

Strategy for identifying ticket pages vs summary pages:
- Send each page to Claude Vision with a classification prompt:
```
Is this page:
A) A LEM summary/billing table listing multiple tickets
B) An individual daily ticket or timesheet for a single day/crew

If A, extract line items as before.
If B, extract the ticket number and return: { "page_type": "daily_ticket", "ticket_number": "..." }
```
- Store ticket page images in Supabase storage under `lem-uploads/{lem_id}/tickets/`
- Link each ticket image to its `lem_line_items` record via a new column

**B. Database change — add contractor ticket image reference**

```sql
ALTER TABLE lem_line_items ADD COLUMN contractor_ticket_url TEXT;
-- URL to the contractor's copy of the daily ticket (stored in lem-uploads bucket)
```

**C. Update the three-panel view to four panels**

The review panel in `LEMReconciliation.jsx` currently shows three columns. Update to four:

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│  OUR PHOTO       │  INSPECTOR DATA  │  THEIR COPY      │  LEM CLAIM       │
│  (Field Original)│  (Verified)      │  (Submitted)     │  (Billing)       │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│                  │                  │                  │                  │
│ [Inspector's     │ Ticket #: 014    │ [Contractor's    │ Ticket #: 014    │
│  photo from      │ Date: Feb 27     │  PDF copy of     │ Date: Feb 27     │
│  the field]      │ Crew: Weld 3     │  the same        │ Crew: Weld 3     │
│                  │                  │  ticket]         │                  │
│ Zoomable         │ LABOUR           │ Zoomable         │ LABOUR           │
│ Scrollable       │ J. Smith  8+3    │ Scrollable       │ J. Smith  8+4  ← │
│ Multi-page       │ M. Jones  8+3    │ Multi-page       │ M. Jones  8+4  ← │
│                  │ [5 more]         │                  │ K. Brown  8+4  ← │
│                  │                  │                  │                  │
│                  │ Total: 7 / 77h   │                  │ Total: 8 / 96h ← │
│                  │                  │                  │                  │
│                  │ EQUIPMENT        │                  │ EQUIPMENT        │
│                  │ Sideboom 11h     │                  │ Sideboom 12h   ← │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

**Panel 1 — Our Photo (leftmost):** The original ticket photo the inspector took in the field. Pulled from `ticketPhotos` in the matched activity block. This is the ground truth — ink on paper, signed by the inspector, photographed before anyone could change it.

**Panel 2 — Inspector Data:** The structured data from the inspector's report. Labour entries, equipment entries, hours, classifications. This is what the inspector verified in the app after OCR.

**Panel 3 — Their Copy (new):** The contractor's PDF copy of the same daily ticket, submitted with the LEM. Pulled from `contractor_ticket_url` on the `lem_line_items` record. The admin compares this visually against Panel 1. If the contractor altered the ticket after the inspector signed it, the differences will be visible here.

**Panel 4 — LEM Claim (rightmost):** The parsed LEM summary data for this ticket number. The billing claim with labour and equipment totals.

**New variance type — Ticket Tampering:**
If the admin visually identifies that Panel 1 (our photo) and Panel 3 (their copy) don't match, they can flag a "Ticket Altered" dispute. Add a new resolution option:

```
Resolution options:
○ Accept LEM (approve contractor's numbers)
● Accept Inspector (approve field-verified numbers)
○ Split / Custom (manually adjust specific lines)
○ Dispute — Variance (numbers don't match)
○ Dispute — Ticket Altered (contractor's copy differs from our original) ← NEW
```

When "Ticket Altered" is selected, the system should:
- Flag the line item with `resolution: 'ticket_altered'`
- Require resolution notes explaining what changed
- Auto-escalate to PM/CM notification via email
- This is a serious finding — it means the contractor is submitting modified documentation

**D. Responsive layout for four panels:**
- Wide screens (>1600px): All four panels side by side
- Large screens (1200-1600px): Photos stack vertically on left (our photo above their copy), data panels side by side on right
- Medium screens (900-1200px): Two rows — photos on top row, data panels on bottom row
- Mobile (<900px): All four stack vertically

## UPDATE 2: Two-Stage Workflow — Reconciliation Gate Before Invoice

### What Changed
The contractor does NOT send the invoice with the LEMs. The process is:
1. Contractor sends LEMs + ticket copies for reconciliation
2. Your team reconciles everything in the app
3. Reconciliation gets approved
4. ONLY THEN does the contractor send the actual invoice
5. Invoice is compared against the approved reconciliation
6. If it matches, approve for payment. If it doesn't, reject.

The reconciliation approval is the gate. No invoice can be processed until LEMs are reconciled.

### What to Build

**A. New database table: `contractor_invoices`**

```sql
CREATE TABLE IF NOT EXISTS contractor_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  lem_id UUID REFERENCES contractor_lem_uploads(id),  -- MUST link to an approved LEM
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  contractor_name TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE,
  invoice_period_start DATE,
  invoice_period_end DATE,
  source_filename TEXT NOT NULL,
  source_file_url TEXT,           -- PDF stored in Supabase storage

  -- Invoice totals (parsed from PDF)
  invoice_labour_hours NUMERIC(10,2) DEFAULT 0,
  invoice_equipment_hours NUMERIC(10,2) DEFAULT 0,
  invoice_labour_cost NUMERIC(12,2) DEFAULT 0,
  invoice_equipment_cost NUMERIC(12,2) DEFAULT 0,
  invoice_subtotal NUMERIC(12,2) DEFAULT 0,
  invoice_tax NUMERIC(12,2) DEFAULT 0,
  invoice_total NUMERIC(12,2) DEFAULT 0,

  -- Reconciliation comparison
  reconciled_labour_cost NUMERIC(12,2),    -- Approved amount from reconciliation
  reconciled_equipment_cost NUMERIC(12,2), -- Approved amount from reconciliation
  reconciled_total NUMERIC(12,2),          -- Approved total from reconciliation
  variance_amount NUMERIC(12,2),           -- Invoice total - reconciled total
  variance_percentage NUMERIC(5,2),        -- Variance as percentage

  -- Status
  status TEXT DEFAULT 'uploaded',
  -- uploaded: PDF received
  -- parsed: Totals extracted
  -- matched: Compared against reconciled LEM
  -- approved: Invoice matches reconciliation, cleared for payment
  -- rejected: Invoice doesn't match, sent back to contractor
  -- paid: Payment issued

  rejection_reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  payment_date DATE,
  payment_reference TEXT,
  notes TEXT,

  CONSTRAINT valid_invoice_status CHECK (status IN ('uploaded', 'parsed', 'matched', 'approved', 'rejected', 'paid')),
  CONSTRAINT must_have_reconciled_lem FOREIGN KEY (lem_id) REFERENCES contractor_lem_uploads(id)
);

-- RLS
ALTER TABLE contractor_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation for contractor_invoices"
ON contractor_invoices FOR ALL
USING (
  organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON contractor_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_lem ON contractor_invoices(lem_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON contractor_invoices(status);
```

**B. Storage bucket**
Create `contractor-invoices` bucket in Supabase Storage (private).

**C. Invoice upload — gated by reconciliation status**

In the ReconciliationDashboard, add an "Invoices" tab or section. The upload flow enforces the gate:

1. User clicks "Upload Invoice"
2. System shows a dropdown of **approved LEMs only** — LEMs with status = 'approved'
3. If no approved LEMs exist, show message: "No approved reconciliations available. Complete LEM reconciliation before uploading invoices."
4. User selects the approved LEM this invoice corresponds to
5. User enters: invoice number, invoice date, contractor name (auto-filled from LEM)
6. User uploads the invoice PDF
7. System parses the invoice for totals (Claude Vision — extract total labour cost, equipment cost, subtotal, tax, total)
8. System automatically compares invoice totals against the approved reconciliation totals from the linked LEM

**D. Invoice vs Reconciliation comparison view**

Simple comparison — not as complex as the four-panel LEM review:

```
┌────────────────────────────────────────────────────────────────┐
│  INVOICE vs APPROVED RECONCILIATION                            │
│  Invoice #: INV-2026-0247  |  LEM Ref: LEM-2330-FEB           │
│  Contractor: SMJV  |  Period: Feb 1-28, 2026                  │
├──────────────────┬──────────────────┬──────────────────────────┤
│                  │ Reconciled       │ Invoice Claims           │
│                  │ (Approved)       │ (Submitted)              │
├──────────────────┼──────────────────┼──────────────────────────┤
│ Labour Hours     │ 4,106            │ 4,106            ✅      │
│ Labour Cost      │ $389,700         │ $389,700         ✅      │
│ Equipment Hours  │ 2,098            │ 2,098            ✅      │
│ Equipment Cost   │ $314,700         │ $314,700         ✅      │
│ Subtotal         │ $704,400         │ $704,400         ✅      │
│ Tax (GST 5%)     │ —                │ $35,220                  │
│ TOTAL            │ $704,400         │ $739,620                 │
├──────────────────┴──────────────────┴──────────────────────────┤
│  Status: MATCH ✅  (variance: $0.00 before tax)                │
│                                                                │
│  [Approve for Payment]    [Reject — Return to Contractor]      │
└────────────────────────────────────────────────────────────────┘
```

If the invoice totals DON'T match the reconciliation:

```
├──────────────────┼──────────────────┼──────────────────────────┤
│ Labour Cost      │ $389,700         │ $397,200         ⚠ +$7,500│
│ Equipment Cost   │ $314,700         │ $314,700         ✅      │
│ Subtotal         │ $704,400         │ $711,900         ⚠       │
├──────────────────┴──────────────────┴──────────────────────────┤
│  Status: VARIANCE ⚠  (+$7,500 / +1.06%)                       │
│                                                                │
│  The invoice claims $7,500 more than the approved              │
│  reconciliation. This must be resolved before payment.         │
│                                                                │
│  Rejection Reason: [text field — required if rejecting]        │
│                                                                │
│  [Approve Anyway]    [Reject — Return to Contractor]           │
└────────────────────────────────────────────────────────────────┘
```

- **Approve for Payment:** Sets invoice status to 'approved', records approver and timestamp
- **Reject:** Sets status to 'rejected', requires rejection reason, sends email notification to contractor (via Resend)
- **Approve Anyway:** Available for admin/PM roles only, requires notes explaining why the variance is accepted (e.g., "Approved change order CO-047 accounts for $7,500 difference")

**E. Workflow status on the LEM tab**

Update the LEM list view to show the invoice status alongside reconciliation status:

```
| LEM Ref        | Contractor | Period      | Recon Status | Invoice Status | Action      |
|----------------|-----------|-------------|--------------|----------------|-------------|
| LEM-2330-FEB   | SMJV      | Feb 1-28    | ✅ Approved   | ✅ Paid         | View        |
| LEM-2330-MAR-1 | SMJV      | Mar 1-15    | ✅ Approved   | ⏳ Awaiting     | Upload Inv  |
| LEM-2330-MAR-2 | SMJV      | Mar 16-31   | 🔄 Reconciling| 🚫 Blocked     | Continue    |
| LEM-4410-FEB   | FKM       | Feb 1-28    | ⚠ Disputed   | 🚫 Blocked     | Resolve     |
```

Invoice Status values:
- 🚫 **Blocked** — LEM not yet approved, can't upload invoice
- ⏳ **Awaiting** — LEM approved, invoice not yet received
- 📄 **Uploaded** — Invoice received, being parsed
- ✅ **Matched** — Invoice matches reconciliation
- ⚠ **Variance** — Invoice doesn't match
- ✅ **Approved** — Cleared for payment
- ❌ **Rejected** — Sent back to contractor
- 💰 **Paid** — Payment issued

**F. The complete end-to-end workflow enforced by the app:**

```
STAGE 1: RECONCILIATION
  Contractor sends LEMs + daily ticket copies
         ↓
  Admin uploads LEM PDF into app
         ↓
  System parses LEM + extracts ticket copies
         ↓
  System matches each line item to inspector reports via ticket number
         ↓
  Admin reviews four-way comparison for each variance
  (our photo | inspector data | their ticket copy | LEM claim)
         ↓
  Admin resolves all variances (accept inspector / accept LEM / dispute / ticket altered)
         ↓
  All items resolved → Admin clicks "Approve Reconciliation"
         ↓
  LEM status = 'approved'
  ═══════════════════════════════════════════════════
  GATE: Invoice upload is now unlocked for this LEM
  ═══════════════════════════════════════════════════

STAGE 2: INVOICE VERIFICATION
  Contractor sends invoice (after reconciliation is agreed)
         ↓
  Admin uploads invoice PDF, links it to the approved LEM
         ↓
  System parses invoice totals
         ↓
  System compares invoice totals against approved reconciliation totals
         ↓
  Match → Approve for Payment → Mark as Paid when payment issued
  No Match → Reject with reason → Back to contractor
```

## Files to Create/Modify

```
NEW:
  supabase/migrations/YYYYMMDD_lem_four_way_and_invoices.sql
    — ALTER lem_line_items ADD contractor_ticket_url
    — ALTER lem_line_items ADD resolution option 'ticket_altered'
    — CREATE contractor_invoices table
  src/components/InvoiceUpload.jsx          — Invoice upload widget (gated by LEM approval)
  src/components/InvoiceComparison.jsx      — Invoice vs reconciliation comparison view

MODIFY:
  src/utils/lemParser.js
    — Add page classification (summary vs daily ticket)
    — Store ticket page images to lem-uploads/{lem_id}/tickets/
    — Link images to lem_line_items.contractor_ticket_url
  src/components/LEMReconciliation.jsx
    — Expand three-panel to four-panel layout
    — Add "Ticket Altered" resolution option
    — Add responsive breakpoints for four panels
  src/components/LEMUpload.jsx
    — Update status display to show invoice status alongside recon status
  src/ReconciliationDashboard.jsx
    — Add "Invoices" tab or section
    — Wire up InvoiceUpload and InvoiceComparison components
  PROJECT_MANIFEST.md
    — Document new tables and components
  pipe-up-field-guide-agent-kb.md
    — Document reconciliation workflow for inspectors (ticket number importance)
```

## Important Notes

1. **The gate is the key feature.** The system must prevent invoice upload until the linked LEM is approved. This is a hard block, not a warning. No approved LEM = no invoice upload.

2. **Ticket number becomes even more critical.** With four-way matching, every ticket without a number is a broken link. Consider adding a Health Score penalty for missing `ticketNumber` in `ReportHealthScorer.js` — maybe 5-10% weight. Inspectors need to capture this consistently.

3. **Ticket tampering is a serious flag.** The "Ticket Altered" dispute should generate an email to the PM/CM and create an audit trail entry. This is documented evidence of a contractor submitting modified paperwork.

4. **The invoice comparison is simple by design.** By the time the invoice arrives, all the hard work is done in reconciliation. The invoice check is just: do the totals match what we already agreed? Yes = pay. No = reject.

5. **This feeds the CVI.** Approved invoice amounts become the definitive ACWP. The flow is: field data → reconciliation → approved invoice → ACWP → CVI calculation.

6. **Create a new Supabase storage bucket** called `contractor-invoices` (private) for storing invoice PDFs.
