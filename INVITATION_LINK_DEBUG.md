# Invitation Link 404 Fix - Debugging Guide

## Problem
Invitation links are generating as `https://api.pipe-up.ca/auth/v1/verify` which returns 404.

## Root Cause
The `generateLink` function uses the `SUPABASE_URL` environment variable, which is set to the custom domain `api.pipe-up.ca`. Custom domains don't handle `/auth/v1/` routes correctly.

## Fix Applied
The edge function now **always uses** the actual Supabase project URL (`https://aatvckalnvojlykfgnmz.supabase.co`) for auth operations, ignoring the custom domain.

## How to Verify the Fix Works

### Step 1: Generate a NEW Invitation
- Old invitation links won't work (they use the old URL)
- You MUST invite a NEW user to get a new link with the correct format

### Step 2: Check the Link Format
After inviting, check the browser console. You should see:
```
🔗 Invitation Link: https://aatvckalnvojlykfgnmz.supabase.co/auth/v1/verify?...
```

**NOT:**
```
https://api.pipe-up.ca/auth/v1/verify?...
```

### Step 3: Verify in Supabase Logs
1. Go to Supabase Dashboard → Edge Functions → `invite-user` → Logs
2. Look for: `Using Supabase URL for auth: https://aatvckalnvojlykfgnmz.supabase.co`

### Step 4: Test the Link
- The link should now go to: `https://aatvckalnvojlykfgnmz.supabase.co/auth/v1/verify?...`
- After clicking, it should redirect to: `https://app.pipe-up.ca/reset-password`
- You should be able to set your password

## If Still Getting 404

### Check 1: Are you using a NEW invitation?
- Old links generated before the fix won't work
- Delete the old user and invite again

### Check 2: Verify in Supabase Dashboard
1. Go to Supabase Dashboard → Project Settings → API
2. Verify **Site URL** is: `https://app.pipe-up.ca`
3. Go to Authentication → URL Configuration
4. Verify **Redirect URLs** includes: `https://app.pipe-up.ca/reset-password`

### Check 3: Check the Actual Link
Copy the invitation link from the email and check:
- ✅ Should start with: `https://aatvckalnvojlykfgnmz.supabase.co/auth/v1/verify`
- ❌ Should NOT start with: `https://api.pipe-up.ca/auth/v1/verify`

If it still uses `api.pipe-up.ca`, the deployment might not have updated. Try:
1. Waiting 2-3 minutes for deployment to propagate
2. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
3. Inviting a new user again
