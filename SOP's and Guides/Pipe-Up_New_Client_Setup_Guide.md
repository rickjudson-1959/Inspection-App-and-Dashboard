# Pipe-Up: New Client Setup Guide
## Step-by-Step Instructions for Supabase

---

## Before You Start

**You'll need:**
- Access to Supabase dashboard (supabase.com)
- Client information collected from Discovery Meeting
- 30-60 minutes

**Login to Supabase:**
1. Go to https://supabase.com
2. Sign in
3. Select your Pipe-Up project

---

## Step 1: Create the Organization

The organization is the client company (e.g., "ABC Pipeline Contractors").

### Using Table Editor (Easiest)

1. **Navigate:** Left sidebar → **Table Editor** → **organizations**

2. **Click:** "Insert row" button (top right)

3. **Fill in the fields:**

| Field | What to Enter | Example |
|-------|---------------|---------|
| `name` | Company legal name | ABC Pipeline Contractors Ltd. |
| `slug` | Short URL-friendly name (lowercase, no spaces) | abc-pipeline |
| `logo_url` | URL to company logo (optional for now) | *leave blank* |
| `primary_color` | Hex color for branding (optional) | #003366 |
| `address` | Company address | 123 Industrial Ave, Calgary, AB |
| `phone` | Company phone | 403-555-1234 |
| `email` | Company email | info@abcpipeline.com |

4. **Click:** "Save"

5. **Copy the `id`** - You'll need this UUID for the next steps!

### Using SQL Editor (Alternative)

1. **Navigate:** Left sidebar → **SQL Editor** → **New Query**

2. **Paste and modify:**

```sql
INSERT INTO organizations (name, slug, primary_color, address, phone, email)
VALUES (
  'ABC Pipeline Contractors Ltd.',
  'abc-pipeline',
  '#003366',
  '123 Industrial Ave, Calgary, AB',
  '403-555-1234',
  'info@abcpipeline.com'
)
RETURNING id;
```

3. **Click:** "Run"

4. **Copy the returned `id`** (UUID like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

---

## Step 2: Create the Project

The project is the specific pipeline job (e.g., "Eagle Mountain Phase 2").

### Using Table Editor

1. **Navigate:** Table Editor → **projects**

2. **Click:** "Insert row"

3. **Fill in the fields:**

| Field | What to Enter | Example |
|-------|---------------|---------|
| `organization_id` | UUID from Step 1 | a1b2c3d4-e5f6-... |
| `name` | Project name | Eagle Mountain Phase 2 |
| `client_name` | Owner/client | FortisBC |
| `pipeline_name` | Pipeline system name | FortisBC Gas Transmission |
| `start_kp` | Starting kilometer post | 0 |
| `end_kp` | Ending kilometer post | 45.5 |
| `status` | Project status | active |
| `start_date` | Project start date | 2025-01-15 |
| `end_date` | Estimated end (optional) | 2025-06-30 |
| `location` | General location | Coquitlam to Chilliwack, BC |
| `num_spreads` | Number of spreads | 2 |

4. **Click:** "Save"

5. **Copy the project `id`** for later use

### Using SQL Editor

```sql
INSERT INTO projects (
  organization_id,
  name,
  client_name,
  pipeline_name,
  start_kp,
  end_kp,
  status,
  start_date,
  location,
  num_spreads
)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- organization_id from Step 1
  'Eagle Mountain Phase 2',
  'FortisBC',
  'FortisBC Gas Transmission',
  0,
  45.5,
  'active',
  '2025-01-15',
  'Coquitlam to Chilliwack, BC',
  2
)
RETURNING id;
```

---

## Step 3: Create User Accounts

You need to create accounts for the client's admins and inspectors.

### 3A: Create Auth User (Required First)

1. **Navigate:** Left sidebar → **Authentication** → **Users**

2. **Click:** "Add user" → "Create new user"

3. **Fill in:**
   - Email: `john.smith@abcpipeline.com`
   - Password: Generate a temporary one (they'll reset it)
   - Check "Auto Confirm User" ✓

4. **Click:** "Create user"

5. **Copy the User UID** (shown in the user list)

6. **Repeat** for each user

### 3B: Create User Profile

After creating the auth user, add their profile:

1. **Navigate:** Table Editor → **user_profiles**

2. **Click:** "Insert row"

3. **Fill in:**

| Field | What to Enter | Example |
|-------|---------------|---------|
| `user_id` | UUID from Auth step | (paste from 3A) |
| `email` | Same email as auth | john.smith@abcpipeline.com |
| `full_name` | Full name | John Smith |
| `role` | Their role | `admin` or `inspector` |
| `organization_id` | From Step 1 | a1b2c3d4-e5f6-... |
| `phone` | Phone number | 403-555-1234 |

4. **Click:** "Save"

### Role Options

| Role | Access Level |
|------|--------------|
| `inspector` | Can create/edit own reports |
| `admin` | Can view all reports, approve, reconcile |
| `super_admin` | Full access including user management |

### SQL for Multiple Users (Faster)

After creating auth users, add profiles in bulk:

```sql
INSERT INTO user_profiles (user_id, email, full_name, role, organization_id, phone)
VALUES
  -- Admin
  ('auth-uuid-1', 'john.smith@abcpipeline.com', 'John Smith', 'admin', 'org-uuid', '403-555-1001'),
  -- Inspectors
  ('auth-uuid-2', 'jane.doe@abcpipeline.com', 'Jane Doe', 'inspector', 'org-uuid', '403-555-1002'),
  ('auth-uuid-3', 'bob.wilson@abcpipeline.com', 'Bob Wilson', 'inspector', 'org-uuid', '403-555-1003');
```

---

## Step 4: Add Contractor Information

Contractors are the companies submitting LEMs (Labour Equipment Materials).

### 4A: Create Contractor Record

1. **Navigate:** Table Editor → **contractors** (create table if it doesn't exist)

2. **Insert row:**

| Field | What to Enter | Example |
|-------|---------------|---------|
| `organization_id` | Client's org ID | a1b2c3d4-e5f6-... |
| `project_id` | Project ID | (from Step 2) |
| `name` | Contractor company name | XYZ Construction Inc. |
| `contact_name` | Main contact | Mike Johnson |
| `contact_email` | Contact email | mike@xyzconstruction.com |
| `contact_phone` | Contact phone | 403-555-9999 |

### 4B: Add Contractor Personnel (For Auto-Complete)

If the client provides a personnel list, add to **contractor_personnel**:

```sql
INSERT INTO contractor_personnel (contractor_id, name, classification, employee_id)
VALUES
  ('contractor-uuid', 'RANDY LANGLOIS', 'Foreman', 'EMP-001'),
  ('contractor-uuid', 'DAVE PARKER', 'Operator', 'EMP-002'),
  ('contractor-uuid', 'JIM FOSTER', 'Labourer', 'EMP-003'),
  ('contractor-uuid', 'SARAH CHEN', 'Welder', 'EMP-004');
```

### 4C: Add Contractor Equipment (For Auto-Complete)

```sql
INSERT INTO contractor_equipment (contractor_id, unit_number, equipment_type, rate_hourly)
VALUES
  ('contractor-uuid', 'EX-701', 'Excavator 200', 185.00),
  ('contractor-uuid', 'EX-702', 'Excavator 200', 185.00),
  ('contractor-uuid', 'SB-101', 'Side Boom', 250.00),
  ('contractor-uuid', 'GR-101', 'Grader', 165.00),
  ('contractor-uuid', 'WT-001', 'Welding Truck', 95.00);
```

---

## Step 5: Configure Rate Tables

Rates are **critical** for reconciliation to calculate cost variances.

### 5A: Labour Rates

1. **Navigate:** Table Editor → **labour_rates** (or create if needed)

2. **Add rates for each classification:**

```sql
INSERT INTO labour_rates (organization_id, classification, rate_st, rate_ot, rate_dt, effective_date)
VALUES
  ('org-uuid', 'Foreman', 95.00, 142.50, 190.00, '2025-01-01'),
  ('org-uuid', 'Operator', 85.00, 127.50, 170.00, '2025-01-01'),
  ('org-uuid', 'Labourer', 65.00, 97.50, 130.00, '2025-01-01'),
  ('org-uuid', 'Welder', 110.00, 165.00, 220.00, '2025-01-01'),
  ('org-uuid', 'Pipe Fitter', 100.00, 150.00, 200.00, '2025-01-01'),
  ('org-uuid', 'Swamper', 55.00, 82.50, 110.00, '2025-01-01');
```

| Field | Meaning |
|-------|---------|
| `rate_st` | Straight time (regular hours) |
| `rate_ot` | Overtime (usually 1.5x) |
| `rate_dt` | Double time (usually 2x) |

### 5B: Equipment Rates

```sql
INSERT INTO equipment_rates (organization_id, equipment_type, rate_hourly, rate_daily, effective_date)
VALUES
  ('org-uuid', 'Excavator 200', 185.00, 1480.00, '2025-01-01'),
  ('org-uuid', 'Excavator 300', 225.00, 1800.00, '2025-01-01'),
  ('org-uuid', 'Side Boom', 250.00, 2000.00, '2025-01-01'),
  ('org-uuid', 'Grader', 165.00, 1320.00, '2025-01-01'),
  ('org-uuid', 'Dozer D6', 175.00, 1400.00, '2025-01-01'),
  ('org-uuid', 'Welding Truck', 95.00, 760.00, '2025-01-01'),
  ('org-uuid', 'Pickup Truck', 45.00, 360.00, '2025-01-01');
```

---

## Step 6: Verify Setup

### 6A: Test User Login

1. Open a new browser (incognito mode)
2. Go to https://app.pipe-up.ca
3. Log in with one of the user accounts you created
4. Verify they see the correct organization/project

### 6B: Test Inspector Report

1. Log in as an inspector
2. Create a new report
3. Verify:
   - Correct project appears
   - Can add activities
   - Can add labour/equipment
   - Can save and submit

### 6C: Test Admin Portal

1. Log in as an admin
2. Go to Admin Portal
3. Verify:
   - Can see submitted reports
   - Reconciliation shows correct data
   - Can approve/flag items

---

## Quick Reference: Table Relationships

```
organizations
    │
    ├── projects (organization_id)
    │       │
    │       └── daily_tickets (project_id) ── Inspector Reports
    │
    ├── user_profiles (organization_id)
    │
    ├── contractors (organization_id)
    │       │
    │       ├── contractor_personnel
    │       ├── contractor_equipment
    │       └── contractor_lems ── Billing Records
    │
    ├── labour_rates (organization_id)
    │
    └── equipment_rates (organization_id)
```

---

## Common Issues & Fixes

### "User can't log in"
- Check Authentication → Users → Is user confirmed?
- Check user_profiles → Does profile exist with matching user_id?

### "User sees wrong project"
- Check user_profiles → Is organization_id correct?
- Check projects → Is project status "active"?

### "Reconciliation shows $0 variance"
- Check labour_rates → Are rates configured for this organization?
- Check equipment_rates → Are rates configured?

### "Inspector can't save report"
- Check user_profiles → Is role set to "inspector" or higher?
- Check browser console for errors (F12)

---

## Complete Setup Checklist

Use this checklist when setting up a new client:

```
CLIENT: _______________________  DATE: ___________

ORGANIZATION
☐ Created organization record
☐ Organization ID: _______________________

PROJECT
☐ Created project record
☐ Linked to organization
☐ Project ID: _______________________
☐ KP range configured: _____ to _____

USERS
☐ Admin account created
   Email: _______________________
☐ Inspector 1: _______________________
☐ Inspector 2: _______________________
☐ Inspector 3: _______________________
☐ All user_profiles created with correct org_id

CONTRACTOR
☐ Contractor record created
☐ Personnel list imported (if provided)
☐ Equipment list imported (if provided)

RATES
☐ Labour rates configured
☐ Equipment rates configured

TESTING
☐ Admin can log in and see dashboard
☐ Inspector can log in and create report
☐ Test report submitted successfully
☐ Test report visible in admin portal
☐ Reconciliation calculates correctly

HANDOFF
☐ Credentials sent to client
☐ Training scheduled
☐ Support contact provided
```

---

## SQL Scripts for Common Tasks

### Export All Users for an Organization

```sql
SELECT full_name, email, role, phone
FROM user_profiles
WHERE organization_id = 'your-org-uuid'
ORDER BY role, full_name;
```

### Deactivate a User

```sql
UPDATE user_profiles
SET role = 'inactive'
WHERE email = 'user@example.com';
```

### Change Project Status

```sql
UPDATE projects
SET status = 'completed'
WHERE id = 'project-uuid';
```

### Clone Rates from Another Organization

```sql
-- Copy labour rates
INSERT INTO labour_rates (organization_id, classification, rate_st, rate_ot, rate_dt, effective_date)
SELECT 
  'new-org-uuid',  -- New organization
  classification,
  rate_st,
  rate_ot,
  rate_dt,
  '2025-01-01'     -- New effective date
FROM labour_rates
WHERE organization_id = 'existing-org-uuid';
```

---

## Need Help?

If you get stuck:
1. Check this guide again
2. Look at the error message in Supabase
3. Ask Claude: "I'm trying to [task] in Supabase and getting [error]"

---

*Document Version: 1.0*
*Last Updated: December 30, 2025*
