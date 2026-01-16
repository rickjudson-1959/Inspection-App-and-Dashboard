# Weekly Executive Summary Email - Setup Instructions

## Overview
The weekly executive summary email feature automatically sends a weekly project health report to executives every Monday at 9:00 AM UTC.

## Components

### 1. Edge Function
- **Location:** `supabase/functions/send-weekly-executive-summary/index.ts`
- **Deploy:** `supabase functions deploy send-weekly-executive-summary`

### 2. Configuration

#### Option A: Environment Variable (Recommended)
1. Go to Supabase Dashboard → Project Settings → Edge Functions → Secrets
2. Add a new secret:
   - **Name:** `EXECUTIVE_EMAILS`
   - **Value:** `executive1@example.com,executive2@example.com` (comma-separated)

#### Option B: Database Table
Create a table to store email addresses:
```sql
CREATE TABLE executive_email_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_addresses TEXT[] NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO executive_email_config (email_addresses) 
VALUES (ARRAY['executive1@example.com', 'executive2@example.com']);
```

### 3. Scheduling Options

#### Option 1: Supabase pg_cron (If Available)
If pg_cron extension is enabled in your Supabase project:

1. Enable pg_cron in Supabase Dashboard:
   - Go to Database → Extensions
   - Enable "pg_cron"

2. Run the migration:
   ```bash
   supabase db push
   ```
   Or manually run the SQL from `supabase/migrations/20260116_weekly_executive_email_cron.sql`

3. Verify the job is scheduled:
   ```sql
   SELECT * FROM cron.job;
   ```

#### Option 2: External Cron Service (Recommended if pg_cron not available)

Use a free cron service like:
- **cron-job.org**
- **EasyCron**
- **GitHub Actions** (if using GitHub)

**Setup:**
1. Create an account on the cron service
2. Create a new cron job:
   - **URL:** `https://aatvckalnvojlykfgnmz.supabase.co/functions/v1/send-weekly-executive-summary`
   - **Method:** POST
   - **Headers:**
     - `Authorization: Bearer YOUR_SUPABASE_ANON_KEY`
     - `Content-Type: application/json`
   - **Body:** `{}`
   - **Schedule:** `0 9 * * 1` (Every Monday at 9:00 AM UTC)

#### Option 3: Vercel Cron Jobs (If using Vercel Pro)
If you have Vercel Pro, you can use Vercel Cron:

1. Create `vercel.json` cron configuration:
```json
{
  "crons": [{
    "path": "/api/cron/weekly-email",
    "schedule": "0 9 * * 1"
  }]
}
```

2. Create API route to trigger the edge function

### 4. Manual Testing

Test the function manually:

```bash
curl -X POST https://aatvckalnvojlykfgnmz.supabase.co/functions/v1/send-weekly-executive-summary \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Or test with specific emails:
```bash
curl -X POST https://aatvckalnvojlykfgnmz.supabase.co/functions/v1/send-weekly-executive-summary \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"emails": ["test@example.com"]}'
```

### 5. Verification

Check if emails are being sent:
1. Check Supabase Edge Function logs in Dashboard
2. Check Resend email logs (if using Resend dashboard)
3. Verify emails are received by executives

### 6. Troubleshooting

**Issue: "No executive email addresses configured"**
- Solution: Set `EXECUTIVE_EMAILS` environment variable or create `executive_email_config` table

**Issue: "RESEND_API_KEY not configured"**
- Solution: Add `RESEND_API_KEY` to Supabase Edge Function secrets

**Issue: Cron job not running**
- Check cron service logs
- Verify the edge function URL is correct
- Verify authorization header includes valid anon key
- Test the function manually first

**Issue: Emails not sending**
- Check Resend API logs
- Verify email addresses are valid
- Check spam/junk folders
- Verify Resend domain is configured correctly

## Customization

To customize the email content:
1. Edit `supabase/functions/send-weekly-executive-summary/index.ts`
2. Modify the `htmlContent` generation
3. Add more data aggregation from reports
4. Redeploy: `supabase functions deploy send-weekly-executive-summary`

## Schedule Customization

To change the schedule:
- **Daily:** `0 9 * * *` (Every day at 9:00 AM UTC)
- **Weekly (Monday):** `0 9 * * 1` (Every Monday at 9:00 AM UTC)
- **Bi-weekly (Mondays):** Not supported directly - use cron service with custom logic
- **Monthly (1st of month):** `0 9 1 * *` (1st of every month at 9:00 AM UTC)
