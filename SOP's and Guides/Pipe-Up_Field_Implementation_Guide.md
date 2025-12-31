# Pipe-Up Field Implementation Guide
## Client Onboarding & Rollout Checklist

---

## Overview

This document outlines what you need from a client company to implement Pipe-Up, and the steps to get them operational in the field.

**Typical Timeline:** 1-2 weeks from kickoff to field-ready

---

## Phase 1: Discovery Meeting (Day 1)

### What to Ask the Client

#### Company Information
- [ ] Company legal name
- [ ] Company logo (PNG, high resolution)
- [ ] Primary contact name, email, phone
- [ ] Billing contact (if different)
- [ ] Company address

#### Project Information
- [ ] Project name(s)
- [ ] Project location(s)
- [ ] Pipeline name / system
- [ ] Start KP and End KP
- [ ] Number of spreads
- [ ] Project start date
- [ ] Estimated duration
- [ ] Client/Owner name (e.g., FortisBC, Pembina, TC Energy)

#### Personnel - Who Will Use the System?

| Role | Info Needed | Typical Count |
|------|-------------|---------------|
| **Inspectors** | Name, email, phone, spread assignment | 2-10 |
| **Admin/PM** | Name, email | 1-3 |
| **Super Admin** | Name, email (usually the client contact) | 1 |
| **Contractors** | Company name, foreman names | 1-5 companies |

#### Rate Information (Critical for Reconciliation)
- [ ] Labour rate sheet (classifications + hourly rates)
- [ ] Equipment rate sheet (equipment types + hourly/daily rates)
- [ ] Overtime multipliers (1.5x, 2x thresholds)
- [ ] Per diem / LOA rates (if applicable)

**Example Labour Classifications:**
| Classification | Straight Time | Overtime |
|---------------|---------------|----------|
| Foreman | $95/hr | $142.50/hr |
| Operator | $85/hr | $127.50/hr |
| Labourer | $65/hr | $97.50/hr |
| Welder | $110/hr | $165/hr |

**Example Equipment:**
| Equipment Type | Rate |
|---------------|------|
| Excavator 200 | $185/hr |
| Side Boom | $250/hr |
| Welding Truck | $95/hr |

#### Existing Systems
- [ ] What do they use now? (Paper, Excel, other software)
- [ ] Do they have historical data to import?
- [ ] What reports do they currently generate?
- [ ] Who receives those reports?

---

## Phase 2: System Configuration (Days 2-3)

### Supabase Setup Checklist

#### 1. Create Organization
```
Table: organizations
- name: "ABC Pipeline Contractors"
- logo_url: [upload their logo to Supabase storage]
- primary_color: "#003366" (or their brand color)
- created_at: now()
```

#### 2. Create Project
```
Table: projects
- organization_id: [from step 1]
- name: "Eagle Mountain Phase 2"
- client_name: "FortisBC"
- start_kp: 0
- end_kp: 45.5
- status: "active"
- start_date: "2025-01-15"
```

#### 3. Create User Accounts

**For each user:**
1. Supabase Authentication → Invite User → Enter email
2. User receives email, sets password
3. Add to `user_profiles` table:

```
Table: user_profiles
- user_id: [from auth]
- email: "inspector@company.com"
- full_name: "John Smith"
- role: "inspector" | "admin" | "super_admin"
- organization_id: [from step 1]
- phone: "403-555-1234"
```

#### 4. Configure Rate Tables

**Labour Rates:**
```
Table: labour_rates (you may need to create this)
- organization_id
- classification: "Foreman"
- rate_st: 95.00
- rate_ot: 142.50
- rate_dt: 190.00
- effective_date: "2025-01-01"
```

**Equipment Rates:**
```
Table: equipment_rates
- organization_id
- equipment_type: "Excavator 200"
- rate_hourly: 185.00
- rate_daily: 1480.00
- effective_date: "2025-01-01"
```

#### 5. Configure Activity Types (if custom)
Default activities are already configured:
- Clearing, Grading, Stringing, Bending, Welding, Coating, Lowering-In, Backfill, Cleanup, Testing

Add custom activities if needed in the InspectorReport.jsx dropdown.

---

## Phase 3: Data Import (Days 3-4)

### If Client Has Existing Data

#### Import Personnel List
Prepare CSV with columns:
```
name, classification, company, employee_id
"John Smith", "Foreman", "ABC Contractors", "EMP-001"
"Jane Doe", "Operator", "ABC Contractors", "EMP-002"
```

#### Import Equipment List
Prepare CSV with columns:
```
unit_number, equipment_type, company, rate_hourly
"EX-701", "Excavator 200", "ABC Contractors", 185.00
"SB-101", "Side Boom", "ABC Contractors", 250.00
```

#### Import Historical LEMs (Optional)
If they want historical data for comparison, prepare CSV matching `contractor_lems` table structure.

---

## Phase 4: Training (Days 4-5)

### Inspector Training (1-2 hours)

**Topics to Cover:**
1. Logging in on mobile device
2. Creating a new daily report
3. Selecting date, spread, weather
4. Adding activity blocks
5. Recording labour (names, hours, classifications)
6. Recording equipment (unit numbers, hours)
7. Adding photos
8. Saving draft vs. submitting
9. Editing a submitted report

**Hands-On Exercise:**
- Have each inspector create a test report
- Walk through a realistic scenario from their actual work

**Materials to Provide:**
- Login credentials
- Quick reference card (1-page)
- Support contact info

### Admin Training (2-3 hours)

**Topics to Cover:**
1. Dashboard overview
2. Reviewing/approving reports
3. Reconciliation workflow:
   - Viewing LEM vs Inspector comparison
   - Fixing discrepancies
   - Flagging for contractor
   - Emailing dispute log
4. Audit trail
5. Exporting reports (PDF, CSV)
6. User management

**Hands-On Exercise:**
- Process a sample reconciliation
- Generate a PDF report
- Add a new user

---

## Phase 5: Pilot Period (Week 2)

### Soft Launch Checklist

- [ ] 1-2 inspectors using system on real project
- [ ] Daily check-ins for first 3 days
- [ ] Collect feedback on:
  - Ease of use
  - Missing fields
  - Workflow issues
  - Mobile performance
- [ ] Make quick adjustments as needed

### Go-Live Checklist

- [ ] All inspectors trained and have credentials
- [ ] All rate tables configured
- [ ] Test reports reviewed and approved
- [ ] Reconciliation workflow tested end-to-end
- [ ] Client admin comfortable with portal
- [ ] Support contact established

---

## What You Need to Collect (Summary)

### Minimum Required (Can't Start Without These)

| Item | Why It's Needed |
|------|-----------------|
| Company name | Organization setup |
| Project name & KP range | Project setup |
| User list with emails | Account creation |
| Labour rate sheet | Reconciliation calculations |
| Equipment rate sheet | Reconciliation calculations |

### Nice to Have (Can Add Later)

| Item | Why It's Helpful |
|------|------------------|
| Company logo | Branding on reports |
| Personnel master list | Auto-complete in forms |
| Equipment master list | Auto-complete in forms |
| Historical LEM data | Baseline comparison |

---

## Client Onboarding Form

Use this form during your discovery meeting:

```
═══════════════════════════════════════════════════════════════
PIPE-UP CLIENT ONBOARDING FORM
═══════════════════════════════════════════════════════════════

COMPANY INFORMATION
───────────────────────────────────────────────────────────────
Company Name: _____________________________________________
Primary Contact: _____________________________________________
Email: _____________________________________________
Phone: _____________________________________________
Address: _____________________________________________

PROJECT INFORMATION
───────────────────────────────────────────────────────────────
Project Name: _____________________________________________
Client/Owner: _____________________________________________
Location: _____________________________________________
Start KP: __________ End KP: __________
Number of Spreads: __________
Start Date: _____________________________________________

USERS
───────────────────────────────────────────────────────────────
Number of Inspectors: __________
Number of Admins: __________

Inspector 1: _________________ Email: _________________
Inspector 2: _________________ Email: _________________
Inspector 3: _________________ Email: _________________
(attach additional sheet if needed)

Admin 1: _________________ Email: _________________
Admin 2: _________________ Email: _________________

CONTRACTOR INFORMATION
───────────────────────────────────────────────────────────────
Contractor Company: _____________________________________________
Foreman Name(s): _____________________________________________

RATES
───────────────────────────────────────────────────────────────
□ Labour rate sheet attached
□ Equipment rate sheet attached
□ Will provide later

CURRENT SYSTEMS
───────────────────────────────────────────────────────────────
What do you use now? □ Paper □ Excel □ Other: ____________
Do you have historical data to import? □ Yes □ No

NOTES
───────────────────────────────────────────────────────────────
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

═══════════════════════════════════════════════════════════════
```

---

## Pricing Considerations

### What to Charge?

**Typical SaaS Pricing Models:**

| Model | Structure | Example |
|-------|-----------|---------|
| Per User | Monthly fee per inspector | $50-150/user/month |
| Per Project | Flat fee per active project | $500-2000/project/month |
| Percentage | % of LEM value processed | 0.5-2% of LEM value |
| Hybrid | Base fee + per user | $500/mo + $25/user |

**One-Time Fees:**
| Item | Range |
|------|-------|
| Setup/Onboarding | $500-2000 |
| Training | $500-1500 |
| Data Migration | $500-1000 |
| Custom Development | Hourly or quoted |

**Value Proposition for Pricing:**
- "If we catch just ONE hour of overbilling per day at $125/hr, that's $3,750/month in savings"
- "Reduces admin time by 10+ hours/week"
- "Eliminates paper filing and lost reports"
- "Audit-ready documentation for regulators"

---

## Post-Implementation Support

### Ongoing Support Model

| Level | Response Time | Includes |
|-------|---------------|----------|
| Email Support | 24-48 hours | Bug reports, questions |
| Priority Support | 4 hours | Critical issues |
| Phone Support | Same day | Training, complex issues |

### Regular Check-ins
- Week 1: Daily
- Week 2-4: Every other day
- Month 2+: Weekly then monthly

---

## Red Flags / Deal Breakers

Watch out for:
- No clear decision maker
- Can't provide rate sheets
- Want extensive customization before trial
- Unwilling to do pilot period
- No dedicated admin on their side

---

## Success Metrics

Track these to prove value:

| Metric | How to Measure |
|--------|----------------|
| Reports submitted | Count in dashboard |
| Discrepancies caught | Disputes flagged |
| $ variance identified | Sum of dispute values |
| Time saved | Client feedback |
| User adoption | Active users / total users |

---

*Document Version: 1.0*
*Last Updated: December 30, 2025*
