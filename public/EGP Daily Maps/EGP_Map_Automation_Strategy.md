# EGP Daily Map — Automation Pipeline & Planned vs Actual Strategy

## What We Just Proved

We took a flat PDF daily work plan and a KML pipeline route file and turned them into an interactive map — automatically. The PDF parser extracted 30 crews and 64 KP locations with zero manual input. This is the foundation for a repeatable, daily automation.

---

## Part 1: Automating the Daily Map

### How It Works Today (Manual)
1. You receive the SMJV daily work plan PDF
2. You upload it along with the KML file
3. The script parses the PDF tables, extracts crew/KP data
4. KP values are interpolated to lat/lng coordinates on the pipeline route
5. An interactive HTML map is generated

### How It Would Work Automated

**Option A: Run It Yourself (Simplest — Start Here)**

You'd run a Python script on your laptop each morning. Takes 30 seconds.

Workflow:
1. Save the daily PDF to a folder on your computer (e.g., `C:\EGP\daily_reports\`)
2. Open a terminal and run: `python generate_map.py`
3. The script finds the latest PDF, parses it, generates the map HTML
4. Open the HTML file in your browser — done

What you need:
- Python installed on your laptop (free, one-time setup)
- The KML file saved locally (one-time — the route doesn't change)
- The Python script (I can build this for you as a ready-to-run package)

**Option B: Email-Triggered Automation (Medium Effort)**

If SMJV emails you the PDF every day, you can set up a simple automation:

1. A service like Zapier or Make.com watches your inbox for emails with "Daily Work Plan" in the subject
2. It saves the PDF attachment to a cloud folder (Google Drive or Dropbox)
3. A small server script runs the parser and generates the map
4. The map HTML is uploaded to pipe-up.ca and you get a Slack/email notification with the link

Cost: ~$20/month for Zapier + a small cloud server

**Option C: Built Into Pipe-Up (Product Feature)**

This is where it becomes a real SaaS feature:

1. Inspector submits daily report through Pipe-Up (not a PDF — structured data)
2. Pipe-Up already has the KP data and pipeline geometry loaded
3. The map generates automatically from the report data
4. PMT dashboard includes a "Map View" tab showing today's activity
5. Historical maps are archived — you can scrub through any day

This eliminates the PDF entirely. The data goes straight from the inspector's phone to the map.

---

## Part 2: Planned vs Actual — The Real Product Value

This is the feature that turns Pipe-Up from a nice reporting tool into something PMs and VPs will pay for. Here's the concept:

### Two Data Sources

| | Planned (DWP) | Actual (Inspector Reports) |
|---|---|---|
| **Source** | Daily Work Plan PDF from the contractor | Inspector's end-of-day field report |
| **Timing** | Issued morning of or night before | Submitted end of shift |
| **Contains** | What crews plan to do and where | What crews actually did and where |
| **Format today** | PDF table | PDF or Pipe-Up form |

### What the Map Shows

The Planned vs Actual map overlays both datasets on the pipeline route:

- **Blue diamonds** = Planned work (from the DWP)
- **Green circles** = Completed work (from inspector reports)
- **Red X marks** = Planned work that didn't happen
- **Orange lightning bolts** = Unplanned work (not in the DWP but happened)

### The KPIs That Matter

At the top of the map, four numbers:

1. **Completed** — How many planned activities were actually done
2. **Missed** — Planned activities that didn't happen
3. **Unplanned** — Work that happened but wasn't in the plan
4. **Plan Rate** — % of planned work completed (the headline number)

### Why This Is Powerful

**For you as Chief Inspector:**
- Morning: Open the DWP map to see where everyone should be
- Evening: Compare against inspector reports to see what actually happened
- Instantly spot crews that didn't execute their plan
- Catch unplanned work that might need investigation (why was there work at KP 8.5 that nobody planned?)

**For the PM/VP (your Pipe-Up customer):**
- They see Plan Adherence as a daily percentage — "Yesterday we hit 78% of the plan"
- They see trends over time — "Plan adherence has dropped from 85% to 72% over the last two weeks. Why?"
- They see spatial patterns — "The KP 29-31 section keeps showing missed work. What's the bottleneck?"
- They see contractor accountability — "Crew 7 has the lowest plan adherence. What's going on?"

**For Pipe-Up as a product:**
- No other tool in pipeline construction shows planned vs actual spatially
- This is the kind of visualization that sells itself in a demo
- It directly addresses the "flying blind between weekly reports" problem
- It creates daily accountability without adding work for the PM

### How Planned vs Actual Would Work in Pipe-Up

**Phase 1 (Now — Proof of Concept):**
- Planned data: Parse the contractor's DWP PDF (already working)
- Actual data: You manually note what happened (or use your inspector reports)
- Map generates with both layers
- This is what you demo to prospects

**Phase 2 (With Pilot Customer):**
- Planned data: Contractor uploads DWP to Pipe-Up (or emails it for auto-parse)
- Actual data: Inspectors submit structured reports through Pipe-Up
- Map auto-generates daily with full planned vs actual comparison
- Historical archive lets you pull up any day

**Phase 3 (Full Product):**
- Planned data feeds from contractor scheduling tools
- Actual data comes from inspector mobile app
- AI flags anomalies: "Crew 7 has been at KP 5+200 for 3 days but the plan shows 1 day"
- Weekly trend reports auto-generate showing plan adherence by crew, by section, by activity type
- Integration with cost tracking: "This unplanned work at KP 8.5 added $45K to the budget"

---

## Automation Technical Spec (For Option A — Run It Yourself)

### What the Script Does

```
Input:  Daily Work Plan PDF + KML file (one-time)
Output: Interactive HTML map file

Steps:
1. Parse PDF tables using pdfplumber
2. Extract crew names, disciplines, activity descriptions
3. Regex-extract KP values from activity text
4. Load KML and build KP-to-coordinate lookup table
5. Interpolate each KP to lat/lng on the pipeline route
6. Categorize activities by type (backfill, welding, grading, etc.)
7. Generate Leaflet.js HTML map with all markers
8. Save to output folder
```

### KP Extraction Patterns (Already Working)

The parser handles all these formats found in the DWP:
- `KP 14+638` → KP 14.638
- `kp 2+700` → KP 2.700
- `Kp 29+600` → KP 29.600
- `5+222` (no KP prefix) → KP 5.222
- `KP 14 yard` → KP 14.000
- `km 4.2` → KP 4.200
- `KP 2+300 - km5.4` → KP 2.300 and KP 5.400

### File Structure

```
EGP_Map_Generator/
├── generate_map.py          # Main script — run this
├── config.json              # Pipeline name, KML path, output path
├── data/
│   ├── doc.kml              # Pipeline route (one-time setup)
│   └── daily_reports/       # Drop PDFs here
├── output/
│   └── EGP_Daily_Map_YYYY-MM-DD.html
└── requirements.txt         # pdfplumber, lxml
```

---

## Next Steps

1. **Send Corry the Planned vs Actual map** — show her the concept
2. **I build you the standalone Python script** — ready to run on your laptop
3. **Include map screenshots in your Pipe-Up demo video** — this is demo gold
4. **Add the map view to your landing page** — screenshot it for the features section
5. **When you get a pilot customer** — build the planned vs actual into Pipe-Up proper
