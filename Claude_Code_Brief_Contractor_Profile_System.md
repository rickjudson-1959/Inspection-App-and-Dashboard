# Brief: Contractor LEM Profile System — Plug and Play Classification

## The Problem
Every contractor formats their LEMs and daily tickets differently. SMJV is different from Somerville, Somerville is different from Bannister, Bannister is different from Macro. The app needs to handle any format without code changes.

## The Solution
A contractor profile system. Teach the app once per contractor, then it auto-classifies every upload from that contractor going forward.

## How It Works

### One-Time Setup Per Contractor

1. **Admin uploads a sample** — 5-20 pages from the contractor's LEM package
2. **Admin tags each page** — clicks a button on each thumbnail:
   - 🔵 **LEM** — billing summary page with hours, rates, totals
   - 🟢 **Daily Ticket** — individual crew timesheet, signature lines
   - ⚪ **Cover Sheet** — tracking logs, admin pages, ignore these
3. **App learns the pattern** — sends the tagged samples to Claude Vision:

```
I'm showing you example pages from a contractor's billing package.
Each page has been tagged by a human as either 'lem', 'daily_ticket', or 'cover_sheet'.

Analyze the visual differences between these document types and create a classification guide.
Describe the specific visual features that distinguish each type:
- Layout patterns (table structure, column count, orientation)
- Header/footer elements (logos, form titles, page numbers)
- Presence of signature lines
- Financial data (rates, totals, dollar signs)
- Handwritten vs typed content
- Any unique identifiers or form numbers

Return ONLY a JSON classification guide:
{
  "contractor_name": "...",
  "lem_indicators": ["list of visual features that identify LEM pages"],
  "ticket_indicators": ["list of visual features that identify daily ticket pages"],
  "cover_indicators": ["list of visual features that identify cover/admin pages"],
  "page_numbering_pattern": "description of any page numbering (e.g., 'Page X of Y' in footer)",
  "grouping_pattern": "description of how LEMs and tickets are organized in the PDF",
  "notes": "any other observations about this contractor's format"
}
```

4. **Profile saved** — stored in the database, linked to contractor name and organization
5. **Admin reviews and confirms** — the classification guide is shown in plain English so the admin can verify it makes sense

### Every Upload After That

1. Admin uploads a LEM package PDF
2. Selects the contractor from a dropdown (profile already exists)
3. App auto-classifies every page using the stored profile
4. Shows results: "Found 63 LEMs, 58 tickets, 5 cover sheets. 4 pages need review."
5. Admin reviews any flagged pages, corrects if needed
6. Confirms → pairs are created → matched to inspector reports → four-panel view

### Profile Improvement Over Time

Every time the admin corrects a misclassification:
- The correction is stored as an additional training example
- After 10+ corrections, the app offers to retrain the profile with the expanded sample set
- Profiles get more accurate over time

### Manual Fallback

If auto-classification isn't working or the admin wants full control:
- Switch to "Manual Mode" — scroll through thumbnails and tag pages by hand
- Manual mode doubles as the profile training interface
- Admin can create pairs manually by selecting LEM pages + ticket pages

## Upload Flow

```
Admin clicks 'Upload LEM Package'
         ↓
Select contractor from dropdown
         ↓
    ┌─ Has profile? ─── NO ──→ 'Set Up New Contractor' wizard
    │                             (upload sample, tag pages, generate guide)
    │ YES                         
    ↓                             
Upload PDF                        
    ↓                             
Auto-classify all pages using stored profile
    ↓
Show classification results with page thumbnails
    ↓
Admin reviews flagged/low-confidence pages
    ↓
Admin corrects any misclassifications (fed back to profile)
    ↓
Confirm classifications
    ↓
Group into LEM/ticket pairs (using profile's grouping_pattern)
    ↓
Match pairs to inspector reports by date + crew
    ↓
Four-panel reconciliation view
```

## Contractor Profile Setup Wizard (UI)

### Screen 1: Upload Sample
```
┌────────────────────────────────────────────────────────┐
│  Set Up New Contractor Profile                          │
│                                                         │
│  Contractor Name: [SMJV___________________]             │
│                                                         │
│  Upload a sample of their LEM package (5-20 pages).     │
│  This teaches the app what their documents look like.   │
│                                                         │
│  [📎 Upload Sample PDF]                                 │
│                                                         │
└────────────────────────────────────────────────────────┘
```

### Screen 2: Tag Pages
```
┌────────────────────────────────────────────────────────┐
│  Tag Each Page                                          │
│                                                         │
│  Click each thumbnail and tell us what it is:           │
│                                                         │
│  [🔵 LEM]  [🟢 Daily Ticket]  [⚪ Cover/Ignore]        │
│                                                         │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐         │
│  │ p.1 │  │ p.2 │  │ p.3 │  │ p.4 │  │ p.5 │         │
│  │     │  │     │  │     │  │     │  │     │          │
│  │     │  │     │  │     │  │     │  │     │          │
│  │ ⚪  │  │ 🔵  │  │ 🔵  │  │ 🟢  │  │ 🔵  │         │
│  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘         │
│  Cover     LEM      LEM     Ticket    LEM              │
│                                                         │
│  Tagged: 5 of 12 pages                                  │
│                                                         │
│  [← Back]                         [Generate Profile →]  │
└────────────────────────────────────────────────────────┘
```

### Screen 3: Review Profile
```
┌────────────────────────────────────────────────────────┐
│  Contractor Profile: SMJV                               │
│                                                         │
│  The app learned these patterns:                        │
│                                                         │
│  LEM pages look like:                                   │
│  • Tabular billing format with RT/OT/DT columns         │
│  • Dollar amounts and rate calculations                 │
│  • Multi-employee summary rows                          │
│  • Company letterhead "SMJV" with form number           │
│  • "Page X of Y" numbering in footer                    │
│                                                         │
│  Daily tickets look like:                               │
│  • Single date, one crew                                │
│  • Handwritten entries                                  │
│  • Foreman and inspector signature lines                │
│  • "Page 1 of 1" or no page numbering                  │
│                                                         │
│  Cover sheets look like:                                │
│  • Employee tracking log format                         │
│  • Checkmark columns, no financial data                 │
│  • Administrative header "Timesheets Handed In"         │
│                                                         │
│  Grouping pattern:                                      │
│  • Cover sheet(s) first, then LEMs, then daily tickets  │
│  • LEMs use "Page X of Y" for multi-page grouping       │
│                                                         │
│  [Edit]  [Retrain with more pages]  [✅ Save Profile]   │
└────────────────────────────────────────────────────────┘
```

## Classification Using Profile

For each page in a full upload, send the page image + the stored profile:

```
You are classifying pages from a contractor's LEM billing package.

This contractor's documents have these characteristics:
[insert stored classification_guide JSON]

Look at this page and classify it. Return ONLY JSON:
{
  "page_type": "lem" or "daily_ticket" or "cover_sheet",
  "confidence": 0.0 to 1.0,
  "date": "date if visible (YYYY-MM-DD)",
  "crew": "crew name if visible",
  "page_number": "X of Y if visible, or null"
}
```

**Rate limit handling:**
- Process 1 page every 3 seconds (20 per minute)
- Each classification call uses ~2,000 tokens (image + short prompt + short response)
- 20 pages × 2,000 tokens = 40,000 tokens/minute — close to limit
- If 429 error: exponential backoff (30s, 60s, 120s)
- Save progress after each page — resume from where it stopped
- Show progress bar with estimated time remaining
- For 126 pages at 3 seconds each: ~6-7 minutes total

**Grouping after classification:**

Use the profile's `grouping_pattern` and `page_numbering_pattern` to group pages:

Strategy 1 — Page numbers: If pages have "Page X of Y" numbering, group consecutive pages with the same "of Y" value. When "of Y" changes or resets to "Page 1", new group starts.

Strategy 2 — Sequential by type: If no page numbers, use the state machine:
- Same type as previous = append to current group
- Different type = new group
- But respect the profile's grouping pattern (e.g., "LEMs come in blocks of 2-3 pages, tickets are always 1 page")

Strategy 3 — Date-based: If pages have dates, group LEM pages and ticket pages that share the same date.

After grouping, pair LEM groups with ticket groups by date and crew name.

## Database

```sql
CREATE TABLE IF NOT EXISTS contractor_lem_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  contractor_name TEXT NOT NULL,
  classification_guide JSONB NOT NULL,
  sample_page_urls JSONB DEFAULT '[]',
  sample_tags JSONB DEFAULT '[]',
  corrections JSONB DEFAULT '[]',
  corrections_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  
  UNIQUE(organization_id, contractor_name)
);

ALTER TABLE contractor_lem_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation for contractor_lem_profiles"
ON contractor_lem_profiles FOR ALL
USING (
  organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
);
```

## Files to Create/Modify

```
NEW:
  supabase/migrations/YYYYMMDD_create_contractor_lem_profiles.sql
  src/components/ContractorProfileWizard.jsx    — Setup wizard (upload, tag, review)
  src/components/LEMPageTagger.jsx              — Thumbnail strip with tagging buttons
  src/components/LEMClassificationReview.jsx    — Post-classification review/correction UI

MODIFY:
  src/utils/lemParser.js           — Use contractor profile for classification
  src/components/LEMUpload.jsx     — Add contractor selection dropdown, profile check
  src/components/LEMReconciliation.jsx — Wire up profile-based flow
  src/ReconciliationDashboard.jsx  — Add contractor profile management section
```

## Why This Works for Any Contractor

- SMJV sends LEMs as alternating pairs? Profile captures that grouping pattern.
- Somerville sends a 70-page LEM block followed by individual tickets? Profile captures that.
- Bannister sends each LEM as a separate PDF? Profile handles single-LEM uploads too.
- Macro uses a completely different form layout? Profile learns their visual patterns.
- New contractor on a new project? Admin tags 10 pages in 5 minutes and the profile is built.
- Contractor changes their form? Retrain with a new sample.

The app doesn't care what the format is. It learns each contractor's format from examples and applies it going forward. Plug and play.
