# Pipe-Up Application Management
## Standard Operating Procedure (SOP) for Non-Technical Administrators

**Document Version:** 1.0  
**Last Updated:** December 30, 2025  
**Application:** Pipe-Up Pipeline Inspector Platform  
**URL:** https://app.pipe-up.ca

---

## Table of Contents

1. [Overview](#1-overview)
2. [Account Access & Credentials](#2-account-access--credentials)
3. [Platform Guide: GitHub](#3-platform-guide-github)
4. [Platform Guide: Supabase](#4-platform-guide-supabase)
5. [Platform Guide: Vercel](#5-platform-guide-vercel)
6. [Platform Guide: Cursor IDE](#6-platform-guide-cursor-ide)
7. [Working with Claude AI](#7-working-with-claude-ai)
8. [Common Tasks & Workflows](#8-common-tasks--workflows)
9. [Troubleshooting](#9-troubleshooting)
10. [Emergency Contacts](#10-emergency-contacts)

---

## 1. Overview

### What is Pipe-Up?
Pipe-Up is a web-based pipeline inspection management platform built for the oil & gas construction industry. It allows inspectors to submit daily reports, tracks contractor billing (LEMs), and provides administrative dashboards for project oversight.

### Technology Stack (Plain English)
| Component | What It Does | Platform |
|-----------|--------------|----------|
| **Frontend** | The screens users see and interact with | React (JavaScript) |
| **Database** | Stores all the data (reports, users, LEMs) | Supabase |
| **Hosting** | Makes the app available on the internet | Vercel |
| **Code Storage** | Keeps all code files safe with version history | GitHub |
| **Code Editor** | Where you edit the application code | Cursor IDE |
| **AI Assistant** | Helps write and modify code using plain English | Claude AI |

### How Changes Get Made
```
1. You describe what you want to Claude AI
2. Claude writes the code
3. You copy the code into Cursor IDE
4. Cursor saves it to GitHub
5. Vercel automatically publishes the update
6. Users see the changes on app.pipe-up.ca
```

---

## 2. Account Access & Credentials

### Required Accounts

| Platform | URL | Purpose |
|----------|-----|---------|
| GitHub | github.com | Code storage |
| Supabase | supabase.com | Database |
| Vercel | vercel.com | Hosting |
| Cursor | cursor.sh | Code editor |
| Claude | claude.ai | AI assistant |

### Credential Storage
**IMPORTANT:** Store all credentials in a secure password manager (e.g., 1Password, LastPass, Bitwarden).

For each account, you need:
- Email address
- Password
- Two-factor authentication (2FA) recovery codes
- API keys (where applicable)

### Transferring Access
When onboarding a new administrator:
1. Add them as a collaborator on GitHub repository
2. Invite them to the Supabase organization
3. Add them to the Vercel team
4. Share password manager vault access
5. Walk through this SOP together

---

## 3. Platform Guide: GitHub

### What is GitHub?
GitHub stores all the application code and keeps a history of every change ever made. Think of it as a "Google Docs for code" with unlimited undo history.

### Accessing GitHub
1. Go to **github.com**
2. Log in with credentials
3. Navigate to your repository (e.g., `github.com/yourusername/pipe-up`)

### Key Concepts

| Term | Meaning |
|------|---------|
| **Repository (Repo)** | A folder containing all your project files |
| **Commit** | A saved snapshot of changes |
| **Branch** | A separate version of the code (like making a copy before editing) |
| **Main/Master** | The primary, live version of the code |
| **Pull** | Download latest changes from GitHub |
| **Push** | Upload your changes to GitHub |

### What You'll Do on GitHub
- **View code files** - Browse what's in the application
- **See change history** - Click "Commits" to see all past changes
- **Review who changed what** - Each commit shows author and date
- **Rollback if needed** - Revert to previous versions if something breaks

### GitHub Safety Rules
✅ Always work on the `main` branch for simplicity  
✅ Write clear commit messages describing what changed  
❌ Never delete the repository  
❌ Don't edit code directly on GitHub (use Cursor instead)

---

## 4. Platform Guide: Supabase

### What is Supabase?
Supabase is your database - it stores all the actual data: user accounts, inspection reports, contractor LEMs, equipment lists, etc.

### Accessing Supabase
1. Go to **supabase.com**
2. Log in with credentials
3. Select your project (e.g., "Pipe-Up Production")

### Key Areas

#### Table Editor
- View and edit data directly
- Like a spreadsheet for your database
- **Location:** Left sidebar → "Table Editor"

**Important Tables:**
| Table | Contains |
|-------|----------|
| `user_profiles` | User accounts and roles |
| `daily_reports` | Inspector reports |
| `contractor_lems` | Contractor billing records |
| `organizations` | Company/client information |
| `projects` | Project details |
| `disputes` | Flagged billing discrepancies |

#### SQL Editor
- Run database commands
- Used for migrations (adding new columns/tables)
- **Location:** Left sidebar → "SQL Editor"

#### Authentication
- Manage user accounts
- Reset passwords
- **Location:** Left sidebar → "Authentication"

### Common Supabase Tasks

**View all users:**
1. Table Editor → `user_profiles`
2. Browse or search the list

**Change a user's role:**
1. Table Editor → `user_profiles`
2. Find the user
3. Click on their row
4. Change `role` field (e.g., "inspector" to "admin")
5. Click "Save"

**Run a migration (add new database column):**
1. SQL Editor → "New Query"
2. Paste the SQL code Claude provides
3. Click "Run"
4. Verify with "Success" message

### Supabase Safety Rules
✅ Always backup before major changes  
✅ Test changes on one record first  
❌ Never delete tables without backup  
❌ Don't modify `id` or `created_at` fields

---

## 5. Platform Guide: Vercel

### What is Vercel?
Vercel hosts your application - it's what makes app.pipe-up.ca accessible on the internet. When you push code to GitHub, Vercel automatically rebuilds and publishes the updated app.

### Accessing Vercel
1. Go to **vercel.com**
2. Log in with credentials
3. Select your project

### Key Areas

#### Deployments
- See all published versions
- View deployment status (Building, Ready, Error)
- Rollback to previous versions

#### Domains
- Manage app.pipe-up.ca settings
- Add custom domains

#### Environment Variables
- Store sensitive settings (API keys, secrets)
- **Never share these publicly**

#### Logs
- View real-time application activity
- Debug errors

### Understanding Deployment Status

| Status | Meaning |
|--------|---------|
| 🟢 **Ready** | Deployment successful, live on website |
| 🟡 **Building** | Currently processing your changes |
| 🔴 **Error** | Something failed, check logs |
| ⚪ **Canceled** | Deployment was stopped |

### Common Vercel Tasks

**Check if deployment succeeded:**
1. Go to Vercel dashboard
2. Look at latest deployment
3. Should show "Ready" with green checkmark

**Rollback to previous version:**
1. Deployments tab
2. Find a previous "Ready" deployment
3. Click "..." menu → "Promote to Production"

**View error logs:**
1. Click on failed deployment
2. Select "Logs" tab
3. Look for red error messages

### Vercel Safety Rules
✅ Wait for deployments to complete before testing  
✅ Keep at least 5 recent successful deployments  
❌ Don't delete environment variables without backup  
❌ Don't change domain settings without understanding impact

---

## 6. Platform Guide: Cursor IDE

### What is Cursor?
Cursor is a code editor - think of it as "Microsoft Word for code." It's where you open, edit, and save the application files. Cursor has built-in AI assistance.

### Installing Cursor
1. Go to **cursor.sh**
2. Download for your operating system
3. Install and open
4. Sign in with your account

### Opening Your Project
1. File → Open Folder
2. Navigate to: `Documents/Inspection App and Dashboard`
3. Click "Open"

### Understanding the Interface

```
┌─────────────────────────────────────────────────────────────┐
│  File  Edit  View  ...                              [icons] │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  EXPLORER    │          CODE EDITOR                         │
│              │                                              │
│  📁 src      │   // This is where code appears              │
│    📄 App.jsx│   import React from 'react'                  │
│    📄 main.js│   ...                                        │
│  📁 public   │                                              │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│  TERMINAL                                                   │
│  $ npm run dev                                              │
└─────────────────────────────────────────────────────────────┘
```

| Area | Purpose |
|------|---------|
| **Explorer** (left) | Browse project files |
| **Editor** (center) | View and edit code |
| **Terminal** (bottom) | Run commands |

### Key Files Location
All the main application code is in the `src` folder:

| File | Purpose |
|------|---------|
| `InspectorReport.jsx` | The inspection form |
| `AdminPortal.jsx` | Admin dashboard |
| `ReconciliationDashboard.jsx` | LEM reconciliation |
| `Dashboard.jsx` | User dashboard |
| `supabase.js` | Database connection |

### Essential Terminal Commands

Open terminal: View → Terminal (or Ctrl+`)

| Command | What It Does |
|---------|--------------|
| `npm run dev` | Start local development server |
| `npm run build` | Build for production |
| `Ctrl+C` | Stop the running server |

### Copying Files from Claude

When Claude provides a file:
1. Claude gives you a download link
2. Download the file to `~/Downloads/`
3. Open Terminal in Cursor
4. Run: `cp ~/Downloads/FileName.jsx ~/Documents/"Inspection App and Dashboard"/src/`
5. The file appears in your Explorer

### Saving and Publishing Changes

**Method 1: Using Cursor's Git Integration**
1. Make changes to files
2. Click "Source Control" icon (left sidebar, looks like branching lines)
3. See changed files listed
4. Type a commit message (e.g., "Added email feature to disputes")
5. Click "Commit"
6. Click "Sync Changes" (pushes to GitHub → auto-deploys to Vercel)

**Method 2: Using Terminal**
```bash
git add .
git commit -m "Your message describing changes"
git push
```

### Cursor Safety Rules
✅ Always save files (Ctrl+S) before committing  
✅ Test locally with `npm run dev` before pushing  
✅ Write descriptive commit messages  
❌ Don't delete files you don't understand  
❌ Don't edit `node_modules` folder (it's auto-generated)

---

## 7. Working with Claude AI

### What is Claude?
Claude is an AI assistant that can write, modify, and explain code. You describe what you want in plain English, and Claude produces the code.

### Accessing Claude
1. Go to **claude.ai**
2. Log in with your account
3. Start a new conversation

### How to Ask Claude for Changes

#### Be Specific
❌ Bad: "Fix the reconciliation page"  
✅ Good: "On the Reconciliation Dashboard, add a button that exports all disputed items to a PDF"

#### Provide Context
❌ Bad: "Add a new field"  
✅ Good: "In the Inspector Report form, add a new dropdown field called 'Weather Conditions' with options: Clear, Rain, Snow, Fog"

#### Reference Existing Features
✅ "Make it work like the existing email feature but for approvals"  
✅ "Use the same Navy and Orange color scheme"

### Template for Requesting Changes

```
I need to make a change to Pipe-Up:

**Current behavior:** [What happens now]

**Desired behavior:** [What you want to happen]

**Location:** [Which page/component]

**Details:**
- [Specific requirement 1]
- [Specific requirement 2]

Please provide the updated code file.
```

### Example Requests

**Adding a new field:**
```
I need to add a new field to the Inspector Report.

Field name: "Permit Number"
Field type: Text input
Location: In the header section, after "Spread"
Required: Yes

Please update InspectorReport.jsx with this change.
```

**Changing colors:**
```
On the Admin Portal, change the header background color 
from blue to the Pipe-Up navy (#003366).

The file is AdminPortal.jsx.
```

**Adding a feature:**
```
On the Disputes tab in ReconciliationDashboard.jsx, add a 
"Mark All as Resolved" button that:
1. Changes all displayed disputes to "resolved" status
2. Logs the action to the audit trail
3. Shows a confirmation message

Use the same button style as the existing "Export Report" button.
```

### After Claude Responds

1. **Review the explanation** - Claude will explain what changed
2. **Download the file** - Click the download link
3. **Copy to your project** - Use the cp command in terminal
4. **Test locally** - Run `npm run dev` and verify it works
5. **Commit and push** - Save to GitHub and deploy

### When Things Don't Work

Tell Claude:
```
The change didn't work. Here's the error I see:

[Paste the error message from browser console or terminal]

The file is [filename]. Please fix it.
```

### Continuing Conversations

Claude remembers your conversation history. You can:
- Reference previous changes: "Actually, undo that last change"
- Build on features: "Now add a print button to that same page"
- Ask for explanations: "What does that code do?"

---

## 8. Common Tasks & Workflows

### Task: Add a New User

**Using Supabase:**
1. Authentication → Users → "Invite user"
2. Enter email address
3. User receives email to set password

**Then set their role:**
1. Table Editor → `user_profiles`
2. Find the new user
3. Set `role` to: `inspector`, `admin`, or `super_admin`
4. Set `organization_id` if applicable

### Task: Change User Role/Permissions

1. Supabase → Table Editor → `user_profiles`
2. Find user by email or name
3. Edit the `role` field
4. Save

### Task: View All Inspection Reports

1. Supabase → Table Editor → `daily_reports`
2. Use filters to narrow by date, inspector, project
3. Click a row to see full details

### Task: Export Data

**From Supabase:**
1. Table Editor → Select table
2. Click "Export" (top right)
3. Choose CSV format
4. Download

### Task: Fix a Bug

1. **Identify the error** - Note what's wrong and any error messages
2. **Find the file** - Determine which component is affected
3. **Ask Claude** - Describe the problem with the error message
4. **Get the fix** - Download Claude's updated file
5. **Test locally** - Run `npm run dev` and verify
6. **Deploy** - Commit and push to GitHub

### Task: Add a New Feature

1. **Document requirements** - Write down exactly what you need
2. **Ask Claude** - Use the template above
3. **Review the code** - Claude explains what it does
4. **Copy files** - Move to your project
5. **Run migrations** - If Claude provides SQL, run it in Supabase
6. **Test thoroughly** - Try all scenarios locally
7. **Deploy** - Commit and push

### Task: Rollback a Bad Deployment

**If the app is broken after a deployment:**

1. **Vercel Dashboard** → Deployments
2. Find the last working deployment (green "Ready" status)
3. Click "..." → "Promote to Production"
4. Wait for redeployment
5. Verify app.pipe-up.ca works

**To also revert the code:**
1. Go to GitHub → Commits
2. Find the commit before the bad change
3. Click "Revert"
4. Confirm the revert commit

---

## 9. Troubleshooting

### "The page won't load"

1. Check Vercel deployment status - is it "Ready"?
2. Check browser console for errors (F12 → Console tab)
3. Try a different browser or incognito mode
4. Check if it's just you or all users (ask someone else to try)

### "I see an error message on screen"

1. Screenshot the error
2. Open browser console (F12) and screenshot any red messages
3. Note what you were doing when it happened
4. Ask Claude to help fix it with these details

### "My changes aren't showing up"

1. Did you save the file? (Ctrl+S)
2. Did you commit and push?
3. Check Vercel - is deployment complete?
4. Hard refresh the browser (Ctrl+Shift+R)
5. Clear browser cache

### "Database query failed (400 error)"

This usually means:
- A column doesn't exist - Run the SQL migration Claude provided
- Wrong data type - Check you're sending the right format
- Missing required field - Ensure all required fields have values

### "Cannot connect to Supabase"

1. Check your internet connection
2. Verify Supabase URL in `src/supabase.js` is correct
3. Check Supabase dashboard - is the project paused?
4. Verify API keys haven't expired

### "npm run dev doesn't work"

1. Make sure you're in the right folder
2. Run `npm install` first
3. Check for error messages
4. Try deleting `node_modules` folder and running `npm install` again

---

## 10. Emergency Contacts

### Technical Support

| Issue | Contact |
|-------|---------|
| Application Bug | [Developer Contact] |
| Database Emergency | [Database Admin] |
| Domain/DNS Issues | [IT Contact] |

### Platform Support

| Platform | Support URL |
|----------|-------------|
| Supabase | supabase.com/support |
| Vercel | vercel.com/support |
| GitHub | support.github.com |

### Recovery Information

**If all else fails:**
- Code is backed up on GitHub (can be recovered)
- Database has point-in-time recovery in Supabase
- Vercel keeps deployment history

---

## Quick Reference Card

### Daily Workflow
```
1. Open Cursor
2. Open project folder
3. Run: npm run dev
4. Make changes with Claude's help
5. Test at localhost:5173
6. Commit and push
7. Verify on app.pipe-up.ca
```

### Key URLs
- **Live App:** https://app.pipe-up.ca
- **GitHub:** https://github.com/[your-repo]
- **Supabase:** https://supabase.com/dashboard
- **Vercel:** https://vercel.com/dashboard

### Key Commands
| Action | Command |
|--------|---------|
| Start dev server | `npm run dev` |
| Copy Claude's file | `cp ~/Downloads/File.jsx ~/Documents/"Inspection App and Dashboard"/src/` |
| Save to GitHub | `git add . && git commit -m "message" && git push` |

---

*Document maintained by: [Your Name]*  
*For questions about this SOP, contact: [Contact Info]*
