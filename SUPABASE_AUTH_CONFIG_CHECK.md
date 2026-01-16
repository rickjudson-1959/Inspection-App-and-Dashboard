# Supabase Auth Configuration Check

## Problem
Invitation links are generating with `api.pipe-up.ca` instead of `aatvckalnvojlykfgnmz.supabase.co`, causing 404 errors.

## Root Cause Investigation

The `generateLink` function might be using Supabase Dashboard configuration instead of the URL we pass to `createClient`.

## Required Checks in Supabase Dashboard

### 1. Check Site URL
1. Go to: **Supabase Dashboard** → **Project Settings** → **API**
2. Find **Site URL**
3. **Should be:** `https://app.pipe-up.ca`
4. **Should NOT be:** `https://api.pipe-up.ca` or anything else

### 2. Check API URL Configuration
1. Go to: **Supabase Dashboard** → **Project Settings** → **API**
2. Find **Project URL** or **API URL**
3. Note what it says - this might be where the custom domain is coming from

### 3. Check Custom Domain Settings
1. Go to: **Supabase Dashboard** → **Project Settings** → **Custom Domains** (if available)
2. Check if `api.pipe-up.ca` is configured as a custom domain
3. If yes, this might be overriding the auth URL

### 4. Check Authentication URL Configuration
1. Go to: **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. Check **Site URL**
3. Check **Redirect URLs** - should include:
   - `https://app.pipe-up.ca/reset-password`
   - `https://app.pipe-up.ca/*`

## What to Do

### Option 1: Check the Actual Generated Link
1. Invite a new user
2. In the browser console, look for: `🔗 Full invitation link:`
3. Copy that link and check what domain it uses
4. If it still uses `api.pipe-up.ca`, the issue is in Supabase's configuration

### Option 2: Check Edge Function Logs
1. Go to: **Supabase Dashboard** → **Edge Functions** → **invite-user** → **Logs**
2. Look for the log output when you invite a user
3. Check what URL is being logged

### Option 3: Verify Supabase Environment Variables
The edge function might be reading `SUPABASE_URL` from environment variables that point to the custom domain.

## Next Steps

After checking the above:
1. Share what the **Site URL** is set to in Supabase Dashboard
2. Share what the **actual generated link** shows (from console or email)
3. Share what the **edge function logs** show

This will help determine if we need to:
- Update Supabase Dashboard settings
- Manually construct the invitation link
- Use a different approach to generate the link
