# Email Setup Instructions - Resend Domain Verification

## Current Issue
Resend is currently using the test domain (`onboarding@resend.dev`) which only allows sending emails to your verified email address (rjudson@protonmail.com).

To send invitation emails to other recipients, you need to verify your domain in Resend.

## Solution: Verify Your Domain in Resend

### Step 1: Verify Domain in Resend Dashboard

1. Go to https://resend.com/domains
2. Click **"Add Domain"**
3. Enter your domain: `pipe-up.ca` (or your actual domain)
4. Follow Resend's instructions to add DNS records:
   - **SPF Record**: Add the SPF record to your DNS
   - **DKIM Records**: Add the DKIM records (CNAME records)
   - **Domain Verification**: Add the domain verification record

### Step 2: Wait for Verification

- DNS changes can take a few minutes to a few hours to propagate
- Resend will show the verification status in the dashboard
- Wait until all records show as "Verified" (green checkmarks)

### Step 3: Update Edge Function

Once your domain is verified, update the `from` address in the edge function:

**File:** `supabase/functions/invite-user/index.ts`

**Change this line:**
```typescript
from: 'Pipe-Up <onboarding@resend.dev>',
```

**To:**
```typescript
from: 'Pipe-Up <noreply@pipe-up.ca>',  // Or your verified email address
```

**Also update in:**
- `supabase/functions/send-executive-summary/index.ts`
- `supabase/functions/send-weekly-executive-summary/index.ts`

### Step 4: Redeploy Edge Functions

```bash
supabase functions deploy invite-user
supabase functions deploy send-executive-summary
supabase functions deploy send-weekly-executive-summary
```

## Alternative: Temporary Workaround

If you need to send invitations immediately while setting up domain verification:

1. **Send test invitations to your own email** (rjudson@protonmail.com) - these will work with the test domain
2. **Manually send invitation links** to other users using the invitation link from the console logs
3. **Or wait until domain verification is complete** (recommended for production)

## Checking Email Status

After verifying your domain and updating the code:

1. Try inviting a user
2. Check browser console for the "Invite response" log
3. Check Resend Dashboard → Emails to see delivery status
4. If emails still don't arrive, check:
   - Spam/junk folders
   - Resend delivery logs
   - Domain verification status

## Resend Dashboard

- **Domain Management**: https://resend.com/domains
- **Email Logs**: https://resend.com/emails
- **API Keys**: https://resend.com/api-keys
