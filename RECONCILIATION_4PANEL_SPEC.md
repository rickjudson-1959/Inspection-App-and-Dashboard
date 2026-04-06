# RECONCILIATION 4-PANEL VIEW — IMPLEMENTATION SPEC

## Purpose
This spec defines exactly how to build the document upload and 4-panel reconciliation view for Pipe-Up. The goal: display contractor LEMs, contractor daily tickets, inspector ticket photos, and inspector reports side-by-side in a 4-panel view for billing reconciliation — all matched by **ticket_number**.

**CRITICAL DISTINCTION — Two panels are uploaded, two are pulled from existing app data:**
- **Contractor LEM** → Admin uploads externally (PDF/images from the contractor)
- **Contractor Daily Ticket** → Admin uploads externally (PDF/images from the contractor)
- **Inspector Ticket Photo** → ALREADY IN THE APP. The inspector photographs the daily ticket as part of their report workflow. These photos are stored in the `work-photos` Supabase Storage bucket, linked to the inspector's report. Do NOT ask the user to upload these.
- **Inspector Report** → ALREADY IN THE APP. The inspector fills out the report in the app. The manpower and equipment data lives in `daily_tickets` and `activity_blocks` tables. Do NOT ask the user to upload these. Render a formatted read-only view of the report data.

**Read this entire document before writing any code.**

---

## THE UNIVERSAL KEY: ticket_number

Every document in the reconciliation system is linked by `ticket_number`. This is the field log number printed on the contractor's daily ticket (e.g., "18198"). It appears on:
- The contractor's LEM (Labour & Equipment & Materials billing sheet)
- The contractor's daily ticket (foreman-signed timesheet)
- The inspector's photo of that ticket
- The inspector's daily report (which references the ticket)

**The entire system pivots on this one field.** If a document can't be associated with a ticket_number, it cannot appear in the 4-panel view.

---

## DATABASE

### Table: `reconciliation_documents`
Already created via SQL migration. **This table stores UPLOADED contractor documents only.** Inspector data comes from existing app tables (daily_tickets, activity_blocks, work-photos bucket).

Key columns:
- `org_id` — multi-tenant scoping (use `useOrgQuery` pattern)
- `ticket_number` — the join key
- `doc_type` — in practice, only `contractor_lem` and `contractor_ticket` will be inserted here (the table schema allows `inspector_photo` and `inspector_report` but those come from the app, not uploads)
- `file_urls` — text array of Supabase Storage URLs (supports multi-page)
- `page_count` — integer, total pages in this document
- `status` — enum: `pending`, `processing`, `ready`, `matched`, `error`
- `linked_lem_id` — FK to `contractor_lems.id` (when applicable)
- `linked_report_id` — FK to inspector report record (when applicable)
- `date`, `foreman` — context for display and filtering

### Existing app tables used by the 4-panel view
- `daily_tickets` — inspector report records. Contains manpower, equipment, and references to ticket photos. Join with `activity_blocks` for detailed data per activity.
- `activity_blocks` — detailed activity data within each report, including `labourEntries` and `equipmentEntries` JSONB fields
- **`work-photos` storage bucket** — inspector photographs including photos of the daily ticket. URLs are referenced from the daily_tickets record.

### Storage Bucket: `reconciliation-docs`
Already created. All uploaded files go here. Path convention:
```
{org_id}/{ticket_number}/{doc_type}/{filename}
```
Example: `abc123/18198/contractor_lem/page_1.pdf`

### View: `recon_package_status`
Already created. Shows one row per ticket_number with flags for which UPLOADED panels are populated. **Note: this view only tracks contractor uploads (LEM and Ticket). To show complete 4-panel status, the ReconciliationList component must also query `daily_tickets` to check for matching inspector reports and ticket photos.**

---

## COMPONENT 1: ReconciliationUpload.jsx

### What it does
Allows admin/owner to upload CONTRACTOR documents only for reconciliation. Handles multi-page documents correctly.

**Only two document types are uploaded — inspector data comes from the app automatically.**

### Upload flow — step by step

1. **User selects document type** from dropdown:
   - Contractor LEM
   - Contractor Daily Ticket
   *(Only these two. Inspector Photo and Inspector Report are NOT upload options — they come from existing app data.)*

2. **User enters ticket number** (required, text input)
   - Must be entered BEFORE upload begins
   - Validate: non-empty, alphanumeric + dashes allowed
   - Auto-trim whitespace

3. **User selects file(s)**
   - Accept: PDF, PNG, JPG, JPEG, TIFF
   - PDF: treat as single multi-page document → `page_count` = PDF page count, `file_urls` = [single URL]
   - Multiple images: treat as pages of ONE document → `page_count` = number of images, `file_urls` = [url1, url2, ...]
   - **CRITICAL: Multiple files for the same ticket + doc_type = ONE multi-page document, NOT separate documents**

4. **Upload to Supabase Storage**
   - Bucket: `reconciliation-docs`
   - Path: `{org_id}/{ticket_number}/{doc_type}/{filename}`
   - Collect all resulting public URLs

5. **Insert ONE row into `reconciliation_documents`**
   ```javascript
   {
     org_id: currentOrg.id,
     ticket_number: ticketNumber.trim(),
     doc_type: selectedDocType,
     file_urls: [url1, url2, ...],  // array of storage URLs
     page_count: fileCount,          // or PDF page count
     status: 'ready',
     date: dateInput || null,        // optional date picker
     foreman: foremanInput || null,  // optional text input
     uploaded_by: user.id
   }
   ```

6. **Show success message** with link to view in 4-panel

### UI layout
```
┌──────────────────────────────────────────────┐
│  Upload Document for Reconciliation          │
├──────────────────────────────────────────────┤
│                                              │
│  Ticket Number:  [ 18198          ]          │
│                                              │
│  Document Type:  [ Contractor LEM ▼ ]        │
│                  (LEM or Daily Ticket only)   │
│                                              │
│  Date (optional):    [ 2014-01-20  ]         │
│  Foreman (optional): [ Gerald B    ]         │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │                                        │  │
│  │   Drag & drop files here               │  │
│  │   or click to browse                   │  │
│  │                                        │  │
│  │   PDF, PNG, JPG, TIFF accepted         │  │
│  │   Multiple images = multi-page doc     │  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Selected: page_1.jpg, page_2.jpg (2 pages)  │
│                                              │
│  [ Upload Document ]                         │
│                                              │
└──────────────────────────────────────────────┘
```

### Error handling
- Duplicate upload (same org + ticket + doc_type): show "A [doc_type] already exists for ticket [number]. Replace it?" with confirm dialog
- Upload failure: show error, do NOT insert row
- Missing ticket number: block upload button, show validation message

---

## COMPONENT 2: ReconciliationList.jsx

### What it does
Shows all ticket_numbers with their 4-panel completion status. This is the entry point to the reconciliation workflow.

### Data source
Query the `recon_package_status` view:
```sql
SELECT * FROM recon_package_status
WHERE org_id = {currentOrg.id}
ORDER BY date DESC NULLS LAST, ticket_number DESC
```

### UI layout
A table/card list showing:
```
┌─────────────────────────────────────────────────────────────────┐
│  Reconciliation Packages                    [ Upload New ▲ ]    │
├──────────┬──────────┬──────────┬─────┬────┬───┬────┬───────────┤
│ Ticket # │ Date     │ Foreman  │ LEM │ TK │ PH│ RPT│ Status    │
├──────────┼──────────┼──────────┼─────┼────┼───┼────┼───────────┤
│ 18198    │ Jan 20   │ Gerald B │ ✓   │ ✓  │ ✓ │ ✓  │ Complete  │
│ 18199    │ Jan 20   │ Chuck B  │ ✓   │ ✓  │ ✗ │ ✓  │ Partial   │
│ 18204    │ Jan 20   │ Wade C   │ ✓   │ ✗  │ ✗ │ ✗  │ Partial   │
└──────────┴──────────┴──────────┴─────┴────┴───┴────┴───────────┘
```

- ✓ = document uploaded or data found (green)
- ✗ = document missing or no data (red/grey)
- Clicking a row opens the 4-panel view for that ticket
- "Complete" = all 4 sources present
- "Partial" = 1-3 sources present
- Filter by: date range, status (complete/partial), foreman

**Data source per column:**
- LEM: `reconciliation_documents` where `doc_type = 'contractor_lem'`
- TK: `reconciliation_documents` where `doc_type = 'contractor_ticket'`
- PH: `daily_tickets` → check for ticket photo URL (timesheet_photo_url or work_photos reference)
- RPT: `daily_tickets` → check if a report exists for this ticket_number

---

## COMPONENT 3: LEMFourPanelView.jsx (REWRITE)

### What it does
Given a ticket_number, displays all 4 documents side by side in a 2x2 grid. Each panel has a page navigator for multi-page documents.

### Data fetching — THREE SOURCES, not one

The 4-panel view pulls data from three different places:

```javascript
// 1. Uploaded contractor documents (LEM + Daily Ticket)
const { data: uploadedDocs } = await supabase
  .from('reconciliation_documents')
  .select('*')
  .eq('org_id', currentOrg.id)
  .eq('ticket_number', ticketNumber);

// 2. Inspector report data from daily_tickets + activity_blocks
//    Match by ticket_number (stored as field_log_id or ticket_number in daily_tickets)
const { data: inspectorReport } = await supabase
  .from('daily_tickets')
  .select('*, activity_blocks(*)')
  .eq('org_id', currentOrg.id)
  .eq('ticket_number', ticketNumber)
  .single();

// 3. Inspector's ticket photo from work-photos bucket
//    The photo filename or metadata contains the ticket number.
//    Check the inspector report's photo references — the ticket photo URL
//    is stored in the report's work_photos array or as timesheet_photo_url.
//    Pull it from the report record, NOT by listing the storage bucket.
const ticketPhotoUrl = inspectorReport?.timesheet_photo_url 
  || inspectorReport?.work_photos?.find(p => p.description?.includes('ticket'))?.url
  || null;

// Organize into panels
const panels = {
  lem:     uploadedDocs?.find(d => d.doc_type === 'contractor_lem') || null,
  ticket:  uploadedDocs?.find(d => d.doc_type === 'contractor_ticket') || null,
  photo:   ticketPhotoUrl ? { file_urls: [ticketPhotoUrl], page_count: 1 } : null,
  report:  inspectorReport || null,
};
```

**IMPORTANT:** The `photo` and `report` panels use DIFFERENT data shapes than the uploaded docs. The DocumentPanel component must handle both:
- Uploaded docs: `{ file_urls: [...], page_count: N }` → render PDF/image viewer
- Inspector photo: `{ file_urls: [url], page_count: 1 }` → render image viewer with zoom/rotate
- Inspector report: a `daily_tickets` row with `activity_blocks` → render FORMATTED DATA view (not a document)

### UI layout — 2x2 grid
```
┌──────────────────────────────┬──────────────────────────────┐
│  CONTRACTOR LEM              │  CONTRACTOR DAILY TICKET     │
│  (What they're billing)      │  (Foreman-signed timesheet)  │
│                              │                              │
│  ┌────────────────────────┐  │  ┌────────────────────────┐  │
│  │                        │  │  │                        │  │
│  │   [Document viewer]    │  │  │   [Document viewer]    │  │
│  │   PDF or image render  │  │  │   PDF or image render  │  │
│  │                        │  │  │                        │  │
│  └────────────────────────┘  │  └────────────────────────┘  │
│  ◀ Page 1 of 4 ▶            │  ◀ Page 1 of 2 ▶            │
├──────────────────────────────┼──────────────────────────────┤
│  INSPECTOR TICKET PHOTO      │  INSPECTOR REPORT            │
│  (Photo from inspector app)  │  (Manpower & equipment data) │
│                              │                              │
│  ┌────────────────────────┐  │  ┌────────────────────────┐  │
│  │                        │  │  │ Foreman: Gerald B      │  │
│  │   [Image viewer]       │  │  │ Date: Jan 20, 2014     │  │
│  │   with zoom            │  │  │                        │  │
│  │                        │  │  │ MANPOWER:              │  │
│  └────────────────────────┘  │  │ J. Smith  Welder  10hr │  │
│  🔍 Zoom  ↻ Rotate          │  │ B. Jones  Labor    8hr │  │
│  ⚠️ Auto-linked from report  │  │                        │  │
│                              │  │ EQUIPMENT:             │  │
│                              │  │ Cat 330 Excavator 10hr │  │
│                              │  │ Bus              10hr  │  │
│                              │  └────────────────────────┘  │
│                              │  ⚠️ Live data from app        │
└──────────────────────────────┴──────────────────────────────┘

Ticket #18198 — Gerald Babchishin — Jan 20, 2014     [ Flag Discrepancy ]
```

### Panel rendering logic

**Panels 1 & 2 (Contractor LEM, Contractor Daily Ticket) — uploaded documents:**
1. If `panels[type]` is null → show empty state: "No [doc type] uploaded for this ticket" with upload button
2. If `file_urls` contains a PDF URL (ends in `.pdf`) → render with PDF viewer (iframe or react-pdf)
3. If `file_urls` contains image URLs → render with image viewer (img tag with zoom/rotate)
4. Multi-page navigation:
   - For PDFs: page navigation within the PDF viewer
   - For images: cycle through `file_urls` array with prev/next buttons
   - Show "Page X of Y" indicator

**Panel 3 (Inspector Ticket Photo) — auto-linked from app:**
1. If `panels.photo` is null → show: "No ticket photo found in inspector reports for this ticket number"
   - Do NOT show an upload button — this photo comes from the inspector's report workflow
   - Instead show a note: "The inspector must photograph the daily ticket when submitting their report"
2. If photo exists → render with ImageViewer (same as uploaded images — zoom, rotate, fullscreen)

**Panel 4 (Inspector Report) — formatted data view from database:**
1. If `panels.report` is null → show: "No inspector report found for this ticket number"
   - Do NOT show an upload button — this is live app data
2. If report exists → render a **formatted read-only view** showing:
   - Report header: inspector name, date, spread
   - **Manpower table**: worker name, classification, RT hours, OT hours, DT hours
   - **Equipment table**: equipment type, hours, count
   - Activity description / comments from activity_blocks
   - This is a scrollable data panel, NOT a document viewer
   - Style it to match the existing report display in the app (reference InspectorReport.jsx and ReportsPage.jsx for the data structure)

### Panel features
- **Zoom**: click-to-zoom or pinch-to-zoom on all panels
- **Rotate**: rotate button for images (tickets are often photographed sideways)
- **Fullscreen**: expand any single panel to full screen for detailed review
- **Page navigation**: prev/next for multi-page documents
- **Download**: link to download original file

### Responsive behavior
- Desktop (>1200px): 2x2 grid
- Tablet (768-1200px): 2x2 grid with smaller panels
- Mobile (<768px): single column stack, one panel at a time with tab navigation

---

## COMPONENT 4: DocumentPanel.jsx (NEW — shared panel component)

### What it does
Reusable panel component used by LEMFourPanelView for each of the 4 panels.

### Props
```javascript
{
  title: string,           // "Contractor LEM"
  subtitle: string,        // "What they're billing"
  panelType: string,       // "uploaded" | "photo" | "report"
  document: object | null, // reconciliation_documents row (for uploaded/photo)
  reportData: object | null, // daily_tickets row with activity_blocks (for report panel)
  emptyMessage: string,    // "No LEM uploaded for this ticket"
  onUpload: function|null, // callback for upload panels, null for auto-linked panels
  color: string,           // panel header accent color
}
```

### Internal state
```javascript
const [currentPage, setCurrentPage] = useState(0);
const [zoom, setZoom] = useState(1);
const [rotation, setRotation] = useState(0);
```

### Rendering
```javascript
// For uploaded docs and inspector photo
if (panelType === 'uploaded' || panelType === 'photo') {
  if (!document) return <EmptyPanel message={emptyMessage} onUpload={onUpload} />;
  
  const currentUrl = document.file_urls[currentPage];
  const isPdf = currentUrl.toLowerCase().endsWith('.pdf');
  
  if (isPdf) {
    return <PdfViewer url={currentUrl} page={currentPage} zoom={zoom} />;
  } else {
    return <ImageViewer url={currentUrl} zoom={zoom} rotation={rotation} />;
  }
}

// For inspector report — render formatted data, not a document
if (panelType === 'report') {
  if (!reportData) return <EmptyPanel message={emptyMessage} />;
  return <InspectorReportPanel report={reportData} />;
}
```

---

## INTEGRATION POINTS

### 1. Connecting to existing contractor_lems data
When a contractor LEM is uploaded AND the ticket number matches an existing `contractor_lems` record:
- Set `linked_lem_id` to the matching `contractor_lems.id`
- This allows the variance calculation to pull structured data from `contractor_lems` while displaying the original document in the panel

### 2. Inspector Report panel (LIVE APP DATA — NOT an upload)
The inspector report panel queries `daily_tickets` joined with `activity_blocks` by ticket_number. It renders a **formatted read-only view** showing:
- Header: inspector name, date, spread, activity type
- Manpower table: names, classifications, hours (RT/OT/DT) from `activity_blocks.labourEntries`
- Equipment table: types, hours, counts from `activity_blocks.equipmentEntries`
- This is the same data the inspector entered via InspectorReport.jsx

**How to find the matching report:** Query `daily_tickets` where `ticket_number` (or `field_log_id`) matches. The exact column name may vary — check the daily_tickets schema for whichever column stores the ticket/field log number.

### 3. Inspector Ticket Photo (ALREADY IN APP — NOT an upload)
The inspector photographs the contractor's daily ticket as part of their report submission. This photo is stored in the `work-photos` Supabase Storage bucket. The URL is referenced in the inspector's report record — look for:
- `timesheet_photo_url` field on the report
- Or entries in the `work_photos` JSON array where description/location references the ticket
- The photo is linked to the report, which is linked to the ticket_number

**Do NOT ask the user to re-upload this photo.** Pull it automatically from the report data.

### 4. ReconciliationList status indicators
The list view needs to check BOTH sources for completeness:
- LEM column (✓/✗): check `reconciliation_documents` for `contractor_lem` doc_type
- Ticket column (✓/✗): check `reconciliation_documents` for `contractor_ticket` doc_type
- Photo column (✓/✗): check if matching inspector report has a ticket photo URL
- Report column (✓/✗): check if a `daily_tickets` record exists for this ticket_number

The `recon_package_status` view only tracks uploaded docs. For a complete status, you'll need to supplement it with a query against `daily_tickets` for the photo and report columns. Consider creating a more comprehensive view or doing this in the component.

### 5. Navigation from ReconciliationList
Clicking a ticket row should navigate to `/reconciliation/{ticket_number}` and render LEMFourPanelView with that ticket number.

---

## FILE STRUCTURE
```
src/
  Components/
    Reconciliation/
      ReconciliationUpload.jsx    — upload form (contractor docs only)
      ReconciliationList.jsx      — ticket list with completion status
      LEMFourPanelView.jsx        — 2x2 document comparison (REWRITE existing)
      DocumentPanel.jsx           — single panel component for uploaded docs + photo (NEW)
      InspectorReportPanel.jsx    — formatted read-only report data view (NEW)
      PdfViewer.jsx               — PDF rendering component (NEW)
      ImageViewer.jsx             — image rendering with zoom/rotate (NEW)
```

### Route
Add to `main.jsx`:
```javascript
<Route path="/reconciliation" element={<ReconciliationList />} />
<Route path="/reconciliation/upload" element={<ReconciliationUpload />} />
<Route path="/reconciliation/:ticketNumber" element={<LEMFourPanelView />} />
```

---

## CONVENTIONS (MUST FOLLOW)

1. **All queries org-scoped** via `useOrgQuery` hook or manual `org_id` filter
2. **Audit logging** on all writes via `auditLoggerV3.js` (app-side, no DB trigger)
3. **SQL migrations as plain text** for paste into Supabase SQL Editor — never file downloads
4. **No bypassing the LEM-to-invoice hard gate** — reconciliation is view/compare only, not payment approval
5. **Storage paths** follow `{org_id}/{ticket_number}/{doc_type}/{filename}` convention
6. **Error states** must be visible — never silently fail on upload or fetch
7. **Inspector panels are read-only** — they display data from the app, not uploaded files. Never show upload buttons on the inspector photo or inspector report panels.

---

## IMPLEMENTATION ORDER

1. Run the SQL migration (reconciliation_documents table + view + triggers) — ALREADY DONE
2. Build ImageViewer.jsx (zoom, rotate, fullscreen — used by 3 of 4 panels)
3. Build PdfViewer.jsx (PDF rendering with page navigation)
4. Build DocumentPanel.jsx (the reusable panel for uploaded docs + auto-linked photo)
5. Build InspectorReportPanel.jsx (formatted read-only view of daily_tickets + activity_blocks data showing manpower and equipment)
6. Build ReconciliationUpload.jsx (upload form — contractor LEM and contractor daily ticket ONLY)
7. Build ReconciliationList.jsx (query recon_package_status view + supplement with daily_tickets check for photo/report columns)
8. Rewrite LEMFourPanelView.jsx — fetch from 3 sources (reconciliation_documents + daily_tickets + work-photos), wire up all 4 panels
9. Add routes to main.jsx
10. Test: upload contractor LEM and daily ticket for ticket 18198
11. Test: verify inspector photo auto-populates from the matching report
12. Test: verify inspector report panel shows formatted manpower + equipment data
13. Test: upload a multi-page LEM PDF, verify page navigation works
14. Test: check a ticket with missing inspector data — panels 3 & 4 should show appropriate "no data" messages (NOT upload buttons)

---

## WHAT "DONE" LOOKS LIKE

- Admin uploads a 4-page LEM PDF for ticket 18198 → one record, 4 pages viewable
- Admin uploads the contractor's 2-page daily ticket for 18198 → one record, 2 pages
- Inspector ticket photo for 18198 auto-populates from the inspector's report in the app — no upload needed
- Inspector report panel for 18198 shows a formatted table of manpower and equipment from the daily_tickets/activity_blocks data — no upload needed
- Navigate to /reconciliation → see ticket 18198 with status indicators for all 4 sources
- Click ticket 18198 → see 2x2 grid with all 4 panels populated
- Top-left: contractor LEM document with page navigation
- Top-right: contractor daily ticket document with page navigation
- Bottom-left: inspector's ticket photo with zoom and rotate
- Bottom-right: formatted inspector report data (manpower table + equipment table)
- Page through the 4-page LEM within its panel
- Zoom and rotate the inspector photo
- All panels independently scrollable/zoomable
- Panels with no data show contextual messages (e.g., "No inspector report found" — NOT "Upload" buttons for inspector panels)
