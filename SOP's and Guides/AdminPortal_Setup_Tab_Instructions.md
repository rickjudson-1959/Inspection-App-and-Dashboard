# Adding the Setup Tab to AdminPortal

## Step 1: Import the RateImport Component

At the top of AdminPortal.jsx, add:

```javascript
import RateImport from './RateImport'
```

## Step 2: Add 'setup' to the Tabs Array

Find the line with the tabs array (around line 536) and add 'setup':

```javascript
// BEFORE:
{['overview', 'approvals', 'mats', 'audit', 'organizations', 'projects', 'users', 'reports'].map(tab => (

// AFTER:
{['overview', 'approvals', 'mats', 'audit', 'setup', 'organizations', 'projects', 'users', 'reports'].map(tab => (
```

## Step 3: Add the Setup Tab Content

Find where the other tab contents are rendered (look for `{activeTab === 'audit' &&` etc.) and add:

```javascript
{/* SETUP TAB */}
{activeTab === 'setup' && (
  <div style={{ padding: '20px' }}>
    <RateImport 
      organizationId={selectedOrganizationId}
      organizationName={selectedOrganizationName}
      onComplete={(count) => {
        alert(`Successfully imported ${count} rates!`)
      }}
    />
  </div>
)}
```

## Step 4: Add Organization Selector (if not already present)

If you don't have an organization selector in your AdminPortal, add state and a dropdown:

```javascript
// Add to state declarations at top of component:
const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
const [selectedOrganizationName, setSelectedOrganizationName] = useState('')
const [organizations, setOrganizations] = useState([])

// Add useEffect to load organizations:
useEffect(() => {
  async function loadOrgs() {
    const { data } = await supabase.from('organizations').select('id, name').order('name')
    if (data) setOrganizations(data)
  }
  loadOrgs()
}, [])

// Add organization selector in the Setup tab (inside RateImport or above it):
<div style={{ marginBottom: '20px' }}>
  <label style={{ fontWeight: '600', marginRight: '10px' }}>Select Organization:</label>
  <select 
    value={selectedOrganizationId}
    onChange={(e) => {
      setSelectedOrganizationId(e.target.value)
      const org = organizations.find(o => o.id === e.target.value)
      setSelectedOrganizationName(org?.name || '')
    }}
    style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '300px' }}
  >
    <option value="">-- Select Organization --</option>
    {organizations.map(org => (
      <option key={org.id} value={org.id}>{org.name}</option>
    ))}
  </select>
</div>
```

## Step 5: Copy Template Files to Public Folder

Copy the CSV templates to your public folder so users can download them:

```bash
cp ~/Downloads/labour_rates_template.csv ~/Documents/"Inspection App and Dashboard"/public/
cp ~/Downloads/equipment_rates_template.csv ~/Documents/"Inspection App and Dashboard"/public/
```

## Step 6: Add Claude API Key (for OCR feature)

Add your Claude API key to your `.env` file:

```
VITE_CLAUDE_API_KEY=sk-ant-api03-xxxxx
```

Or hardcode it temporarily in RateImport.jsx for testing:

```javascript
const CLAUDE_API_KEY = 'sk-ant-api03-xxxxx'
```

## Step 7: Run the SQL Migration

In Supabase SQL Editor, run the contents of `rate_tables_migration.sql` to ensure the tables exist.

---

## Quick Test

1. Go to Admin Portal
2. Click "Setup" tab
3. Select an organization
4. Try uploading a CSV template
5. Review the preview
6. Click Import
7. Verify rates appear in Supabase Table Editor → labour_rates or equipment_rates
