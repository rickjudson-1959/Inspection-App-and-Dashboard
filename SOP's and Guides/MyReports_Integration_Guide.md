# My Reports Feature - Integration Guide

## Overview

This feature allows inspectors to:
1. View a list of their submitted reports
2. Edit any of their past reports
3. Receive direct links from admins to edit specific reports
4. See when an admin has requested a revision

## Files Created

| File | Purpose |
|------|---------|
| `MyReports.jsx` | List view of inspector's reports with filtering and edit buttons |
| `InspectorApp.jsx` | Wrapper component handling navigation between new/edit/list views |
| `RequestRevision.jsx` | Modal for admins to request changes and generate edit links |
| `migration_revision_request.sql` | Database migration for revision tracking |

## Installation Steps

### 1. Run Database Migration

In Supabase SQL Editor, run the contents of `migration_revision_request.sql`:

```sql
-- This adds:
-- - revision_requested (boolean)
-- - revision_notes (text)
-- - revision_requested_by (uuid)
-- - revision_requested_at (timestamp)
-- - inspector_email index
-- - Helper functions
```

### 2. Copy Component Files

```bash
# Copy all new components to your src folder
cp ~/Downloads/MyReports.jsx ~/Documents/"Inspection App and Dashboard"/src/
cp ~/Downloads/InspectorApp.jsx ~/Documents/"Inspection App and Dashboard"/src/
cp ~/Downloads/RequestRevision.jsx ~/Documents/"Inspection App and Dashboard"/src/
```

### 3. Update App.jsx

Replace the inspector route with InspectorApp:

```jsx
// Before:
import InspectorReport from './InspectorReport'

// After:
import InspectorApp from './InspectorApp'

// In your render:
// Before:
{userRole === 'inspector' && <InspectorReport user={user} />}

// After:
{userRole === 'inspector' && (
  <InspectorApp 
    user={user} 
    onSignOut={handleSignOut}
  />
)}
```

### 4. Update InspectorReport.jsx to Support Edit Mode

Add these props and modify the component:

```jsx
function InspectorReport({ 
  user, 
  editMode = false,           // NEW
  editReportId = null,        // NEW
  editReportData = null,      // NEW
  onSaveComplete = null       // NEW
}) {
  // ... existing state ...

  // Load existing report data when in edit mode
  useEffect(() => {
    if (editMode && editReportData) {
      loadExistingReport(editReportData)
    }
  }, [editMode, editReportData])

  function loadExistingReport(report) {
    // Populate form state with existing data
    setReportDate(report.report_date || '')
    setInspectorName(report.inspector_name || '')
    setSpread(report.spread || '')
    setAfe(report.afe || '')
    setPipeline(report.pipeline || '')
    setStartTime(report.start_time || '')
    setStopTime(report.stop_time || '')
    
    // Weather
    setWeather({
      conditions: report.weather_conditions || '',
      precipitation: report.weather_precipitation || '',
      highTemp: report.weather_high_temp || '',
      lowTemp: report.weather_low_temp || '',
      windSpeed: report.weather_wind_speed || '',
      rowCondition: report.row_condition || ''
    })
    
    // Activity blocks
    setActivityBlocks(report.activity_blocks || [])
    
    // Labour and equipment (from related tables)
    setLabourEntries(report.labourEntries || [])
    setEquipmentEntries(report.equipmentEntries || [])
    
    // Photos
    setPhotos(report.photos || [])
    
    // Safety
    setSafetyNotes(report.safety_notes || '')
    // ... etc for other fields
  }

  // Modify save function to handle updates
  async function handleSave() {
    // ... validation ...

    const reportData = {
      // ... all your fields ...
    }

    let result
    if (editMode && editReportId) {
      // UPDATE existing report
      result = await supabase
        .from('daily_reports')
        .update(reportData)
        .eq('id', editReportId)
        .select()
        .single()
      
      // Clear revision request flag if it was set
      if (editReportData?.revision_requested) {
        await supabase.rpc('clear_revision_request', {
          p_report_id: editReportId
        })
      }

      // Log the edit to audit
      await supabase.from('report_audit_log').insert({
        report_id: editReportId,
        action: 'updated',
        changed_by: user.id,
        changes: reportData,
        created_at: new Date().toISOString()
      })
    } else {
      // INSERT new report
      result = await supabase
        .from('daily_reports')
        .insert(reportData)
        .select()
        .single()
    }

    if (result.error) throw result.error

    // Call callback if provided
    if (onSaveComplete) {
      onSaveComplete(result.data.id)
    }

    // Show success message
    alert(editMode ? 'Report updated successfully!' : 'Report saved successfully!')
  }

  // ... rest of component ...
}
```

### 5. Add Request Revision Button to Admin Dashboard

In your admin reports table, add a button:

```jsx
import RequestRevision from './RequestRevision'

// State
const [showRevisionModal, setShowRevisionModal] = useState(false)
const [selectedReport, setSelectedReport] = useState(null)

// In your table row actions:
<button onClick={() => {
  setSelectedReport(report)
  setShowRevisionModal(true)
}}>
  Request Revision
</button>

// Add modal at end of component:
{showRevisionModal && selectedReport && (
  <RequestRevision
    reportId={selectedReport.id}
    reportDate={selectedReport.report_date}
    inspectorName={selectedReport.inspector_name}
    inspectorEmail={selectedReport.inspector_email}
    onClose={() => setShowRevisionModal(false)}
    onSuccess={() => {
      setShowRevisionModal(false)
      fetchReports() // Refresh the list
    }}
  />
)}
```

## URL Routing

The feature supports these URLs:

| URL | View |
|-----|------|
| `/inspector` | New report form |
| `/my-reports` | List of inspector's reports |
| `/report/edit/{id}` | Edit specific report |

Direct links work automatically - when an inspector clicks a link like:
`https://app.pipe-up.ca/report/edit/abc-123-def`

The InspectorApp component detects the URL, loads the report, and shows the edit form.

## Workflow

### Inspector Self-Correction
1. Inspector realizes they made an error
2. Clicks "My Reports" tab
3. Finds the report, clicks "Edit"
4. Makes changes
5. Saves - changes logged to audit

### Admin-Requested Revision
1. Admin reviews report, sees issue
2. Clicks "Request Revision" button
3. Enters notes about what needs fixing
4. Copies the direct edit link
5. Sends link to inspector (email, Slack, etc.)
6. Inspector clicks link, sees revision notes banner
7. Makes required changes
8. Saves - revision_requested flag cleared automatically

## Database Schema Additions

```sql
-- daily_reports table additions
revision_requested: boolean (default false)
revision_notes: text
revision_requested_by: uuid (references auth.users)
revision_requested_at: timestamp with time zone
inspector_email: text (indexed)

-- report_audit_log entries
action: 'updated' | 'revision_requested' | 'revision_cleared'
changes: jsonb (the changed data)
```

## Permissions

- Inspectors can only see/edit their own reports (filtered by inspector_email)
- Admins, Chief Inspectors, Assistant Chiefs can see all reports
- Admins, Chief Inspectors, Assistant Chiefs can request revisions
- All edits are logged to report_audit_log

## Testing

1. Submit a report as an inspector
2. Go to "My Reports" - verify it appears
3. Click Edit - verify data loads
4. Make a change and save - verify audit log entry
5. As admin, request revision on that report
6. As inspector, verify the revision banner appears
7. Make change and save - verify revision flag clears
