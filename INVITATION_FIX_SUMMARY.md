# Invitation System Fix Summary
## Date: January 17, 2026

## Problem
1. Invitation links were returning "404: NOT_FOUND Code: DEPLOYMENT_NOT_FOUND" when clicked
2. After setting password, users were redirected to the wrong dashboard (e.g., Inspector page instead of Chief Dashboard)
3. Role mapping between invitation form values and database roles was incorrect

## Root Causes
1. **Invitation links using custom domain**: Supabase's `generateLink()` was returning links with `https://api.pipe-up.ca/auth/v1/verify` instead of `https://aatvckalnvojlykfgnmz.supabase.co/auth/v1/verify`. Custom domains don't handle `/auth/v1/` routes correctly.
2. **Missing redirect_to preservation**: The `redirect_to` parameter was being lost when Supabase processed the invitation token.
3. **Role mapping mismatch**: Invitation form uses short role names (`chief`, `exec`, `asst_chief`) but database expects full names (`chief_inspector`, `executive`, `assistant_chief_inspector`).

## Changes Made

### 1. Fixed Invitation Link URL Generation
**File**: `supabase/functions/invite-user/index.ts`

**Problem**: `generateLink()` was using custom domain (`api.pipe-up.ca`) which doesn't handle auth routes.

**Solution**: Extract the token from `generateLink()`'s response and manually reconstruct the link with the correct Supabase project URL.

**Changes**:
- Always use actual Supabase URL (`https://aatvckalnvojlykfgnmz.supabase.co`) for auth operations
- Extract token from `action_link` response
- Reconstruct link with correct domain: `${actualSupabaseUrl}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${redirectTo}`

**Code Example**:
```typescript
// CRITICAL FIX: Supabase's generateLink uses the custom domain from dashboard config
// We must extract the token and reconstruct the link with the correct Supabase URL
let inviteLink = generatedLink

try {
  // Parse the URL to extract query parameters
  const url = new URL(generatedLink)
  const token = url.searchParams.get('token')
  const type = url.searchParams.get('type') || 'invite'
  const redirectTo = url.searchParams.get('redirect_to') || redirectUrl
  
  if (token) {
    // Reconstruct link with correct Supabase URL
    inviteLink = `${actualSupabaseUrl}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`
  }
} catch (parseError) {
  console.error('❌ Error parsing invitation link:', parseError)
}
```

### 2. Fixed Redirect URL to Always Go to Password Reset First
**File**: `supabase/functions/invite-user/index.ts`

**Problem**: Invitation links were redirecting directly to final destination, bypassing password reset.

**Solution**: Always redirect to `/reset-password` first, passing the final destination as a query parameter.

**Changes**:
- Changed `redirectTo` to always be `/reset-password?redirect_to=/chief-dashboard` (or appropriate dashboard)
- Format: `${baseUrl}/reset-password?redirect_to=${encodeURIComponent(redirectPath)}`

**Code Example**:
```typescript
// Always redirect to reset-password first, with final destination as parameter
const finalDestination = redirect_to ? redirect_to : '/chief-dashboard'
const redirectPath = finalDestination.startsWith('/') ? finalDestination : `/${finalDestination}`
const redirectUrl = `${baseUrl}/reset-password?redirect_to=${encodeURIComponent(redirectPath)}`
```

### 3. Fixed Password Reset Redirect Logic
**File**: `src/ResetPassword.jsx`

**Problem**: `redirect_to` parameter was being lost after Supabase processed the token, causing fallback to role-based redirect (which might be wrong).

**Solution**: Store `redirect_to` parameter immediately on component load, before Supabase modifies the URL.

**Changes**:
- Added `storedRedirectTo` state to preserve the redirect parameter
- Store `redirect_to` in `useEffect` hook immediately when component loads
- Prioritize stored `redirect_to` over role-based redirect
- Added logging to debug redirect decisions

**Code Example**:
```typescript
const [storedRedirectTo, setStoredRedirectTo] = useState(null)

useEffect(() => {
  // Store redirect_to parameter immediately before Supabase might modify the URL
  const redirectTo = searchParams.get('redirect_to')
  if (redirectTo) {
    let decodedRedirectTo = decodeURIComponent(redirectTo)
    // Extract path from full URL if needed
    try {
      const url = new URL(decodedRedirectTo)
      decodedRedirectTo = url.pathname + url.search
    } catch {
      if (!decodedRedirectTo.startsWith('/')) {
        decodedRedirectTo = `/${decodedRedirectTo}`
      }
    }
    setStoredRedirectTo(decodedRedirectTo)
  }
  // ... rest of useEffect
}, [searchParams])

function getRedirectPath() {
  // First priority: Use stored redirect_to from URL
  if (storedRedirectTo) {
    return storedRedirectTo
  }
  // ... fallback to role-based redirect
}
```

### 4. Fixed Role Mapping Between Form and Database
**File**: `supabase/functions/invite-user/index.ts`

**Problem**: Invitation form uses short role names (`chief`, `exec`, `asst_chief`) but database expects full names (`chief_inspector`, `executive`, `assistant_chief_inspector`).

**Solution**: Added role mapping to translate form values to database values.

**Changes**:
- Added `roleMapping` object to convert form roles to database roles
- Apply mapping when creating user profile
- Apply mapping when updating existing user profile

**Code Example**:
```typescript
// Map invitation role values to database role values
// Frontend uses short names (chief, exec, asst_chief) but database expects full names
const roleMapping: Record<string, string> = {
  'chief': 'chief_inspector',
  'exec': 'executive',
  'asst_chief': 'assistant_chief_inspector',
  // All other roles stay the same
}
const dbRole = roleMapping[user_role] || user_role

// Use dbRole when creating/updating user profile
await supabaseAdmin.from('user_profiles').upsert({
  id: userData.user.id,
  email: email.toLowerCase(),
  full_name,
  user_role: dbRole,
  role: dbRole, // Store mapped role in both fields
  status: 'invited',
  created_at: new Date().toISOString()
}, { onConflict: 'id' })
```

### 5. Improved Email Error Handling
**File**: `src/InviteUser.jsx`

**Changes**:
- Added check for `email_sent` status in response
- Show error message to user if email failed to send
- Still show invitation link in console for manual copying

**Code Example**:
```typescript
if (!fnData.email_sent) {
  const errorMsg = fnData.email_error || 'Email sending failed...'
  if (fnData.invitation_link) {
    setError(`Warning: ${errorMsg} The invitation link is available in the browser console.`)
  } else {
    setError(`Warning: ${errorMsg}`)
  }
  setLoading(false)
  return
}
```

## Files Modified

1. **`supabase/functions/invite-user/index.ts`**
   - Fixed invitation link URL generation (extract token, reconstruct with correct domain)
   - Changed redirect URL to always go to `/reset-password` first
   - Added role mapping (`chief` → `chief_inspector`, `exec` → `executive`, `asst_chief` → `assistant_chief_inspector`)
   - Enhanced logging for debugging

2. **`src/ResetPassword.jsx`**
   - Added `storedRedirectTo` state to preserve `redirect_to` parameter
   - Updated `getRedirectPath()` to prioritize stored `redirect_to`
   - Added logging for redirect decisions
   - Refresh user profile before redirect

3. **`src/InviteUser.jsx`**
   - Improved email error handling and user feedback

## Additional Files Created

1. **`INVITATION_LINK_DEBUG.md`** - Debugging guide for invitation links
2. **`SUPABASE_AUTH_CONFIG_CHECK.md`** - Guide for checking Supabase configuration
3. **`FIX_USER_ROLE.sql`** - SQL script to fix existing users with incorrect roles

## Testing Checklist

✅ Invitation links use correct Supabase URL (`aatvckalnvojlykfgnmz.supabase.co`)  
✅ Links redirect to `/reset-password` page first  
✅ `redirect_to` parameter is preserved after token verification  
✅ After setting password, users are redirected to correct dashboard  
✅ Role mapping works correctly (Chief Inspector → `/chief-dashboard`)  
✅ Email errors are displayed to user  
✅ Console logging helps with debugging  

## For Existing Users

If a user was invited before the role mapping fix, their role in the database might be incorrect (e.g., `chief` instead of `chief_inspector`). 

**Fix**: Run this SQL in Supabase Dashboard → SQL Editor:
```sql
UPDATE user_profiles
SET role = 'chief_inspector', user_role = 'chief_inspector'
WHERE email = 'user@example.com' 
  AND (role = 'chief' OR role = 'inspector');
```

Replace `'user@example.com'` with the actual email address.

## Key Takeaways

1. **Always use actual Supabase project URL for auth operations** - Custom domains don't handle `/auth/v1/` routes
2. **Store redirect parameters early** - Before Supabase or React Router modifies the URL
3. **Map form values to database values** - Don't assume they match
4. **Test the full flow** - From invitation email → password reset → dashboard redirect

## Related Issues Fixed

- Fixed "404: NOT_FOUND Code: DEPLOYMENT_NOT_FOUND" error
- Fixed incorrect redirect after password reset
- Fixed role-based redirect overriding invitation redirect
- Fixed role mapping mismatch between form and database
