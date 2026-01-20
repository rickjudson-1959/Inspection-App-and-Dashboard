# Weather Edge Function - Complete Deployment Guide

## Overview

This package provides a robust, production-ready weather API solution for Pipe-Up that:

- ✅ Keeps API keys secure on the server (never exposed to browser)
- ✅ Includes 15-minute server-side caching (reduces API calls)
- ✅ Has 30-minute client-side caching (works offline)
- ✅ Automatic retries with exponential backoff
- ✅ Graceful fallbacks when offline or API fails
- ✅ Comprehensive error handling and logging
- ✅ Request validation and sanitization
- ✅ Optional database logging for monitoring

---

## Package Contents

```
weather-edge-function/
├── get-weather/
│   └── index.ts              # Supabase Edge Function (deploy this)
├── weatherService.js          # Client-side service (replace existing)
├── weather_logging_migration.sql  # Optional logging table
├── test-weather-function.sh   # Test script to verify deployment
└── DEPLOYMENT_GUIDE.md        # This file
```

---

## Prerequisites

1. **Supabase CLI installed**
   ```bash
   npm install -g supabase
   ```

2. **Logged into Supabase**
   ```bash
   supabase login
   ```

3. **OpenWeatherMap API Key**
   - Get one free at: https://openweathermap.org/api
   - Free tier allows 1,000 calls/day (plenty with caching)

---

## Step-by-Step Deployment

### Step 1: Navigate to Your Project

```bash
cd ~/Documents/"Inspection App and Dashboard"
```

### Step 2: Link Supabase (if not already linked)

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Find your project ref in: **Supabase Dashboard → Settings → General → Reference ID**

### Step 3: Create the Function Directory

```bash
mkdir -p supabase/functions/get-weather
```

### Step 4: Copy the Edge Function

Copy `get-weather/index.ts` to your project:

```bash
cp /path/to/downloaded/get-weather/index.ts supabase/functions/get-weather/index.ts
```

Or manually copy the contents of `get-weather/index.ts` into:
```
supabase/functions/get-weather/index.ts
```

### Step 5: Set the API Key Secret

```bash
supabase secrets set OPENWEATHER_API_KEY=your_actual_api_key_here
```

**Important:** Replace `your_actual_api_key_here` with your real OpenWeatherMap API key.

### Step 6: Deploy the Edge Function

```bash
supabase functions deploy get-weather
```

You should see:
```
Deploying function get-weather...
Function get-weather deployed successfully!
```

### Step 7: Verify Deployment

List your deployed functions:
```bash
supabase functions list
```

You should see `get-weather` in the list.

### Step 8: Test the Function

Set environment variables:
```bash
export SUPABASE_URL=https://your-project-ref.supabase.co
export SUPABASE_ANON_KEY=your-anon-key-here
```

Run the test script:
```bash
chmod +x test-weather-function.sh
./test-weather-function.sh
```

Or test manually with curl:
```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-weather" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"lat": 51.0447, "lon": -114.0719}'
```

Expected response:
```json
{
  "conditions": "Clear sky",
  "tempHigh": 5,
  "tempLow": -2,
  "temperature": 3,
  "windSpeed": 15,
  "humidity": 45,
  "location": "Calgary",
  "cached": false,
  "fetchedAt": "2026-01-20T..."
}
```

### Step 9: Update Your App Code

Replace your existing `src/weatherService.js` with the new `weatherService.js` from this package.

### Step 10: Remove Old Environment Variable

In **Vercel Dashboard → Your Project → Settings → Environment Variables**:
- Delete `VITE_OPENWEATHER_API_KEY` (no longer needed)

### Step 11: Deploy Your App

```bash
git add .
git commit -m "Migrate weather API to Edge Function for reliability"
git push origin main
```

### Step 12: Test in Production

1. Go to https://app.pipe-up.ca
2. Start a new inspector report
3. Weather should auto-populate
4. Check browser console for `[WeatherService]` logs

---

## Optional: Enable API Logging

If you want to monitor API usage and debug issues:

1. Open **Supabase Dashboard → SQL Editor**
2. Paste and run the contents of `weather_logging_migration.sql`
3. The Edge Function will automatically start logging requests

View logs with:
```sql
-- Recent requests
SELECT * FROM weather_api_logs ORDER BY created_at DESC LIMIT 50;

-- Hourly stats
SELECT * FROM weather_api_stats;

-- Recent errors
SELECT * FROM weather_api_logs WHERE success = false ORDER BY created_at DESC;
```

---

## How It Works

### Request Flow

```
Browser (Inspector Report)
    ↓
weatherService.js (checks local cache)
    ↓
Supabase Edge Function (checks server cache)
    ↓
OpenWeatherMap API (if cache miss)
    ↓
Response cached at both levels
    ↓
Weather data displayed in form
```

### Caching Strategy

| Cache Level | Duration | Purpose |
|-------------|----------|---------|
| Server (Edge Function) | 15 min | Reduce API calls, share across users |
| Client (localStorage) | 30 min | Offline support, instant load |

### Retry Logic

- Failed requests retry up to 2 times
- Exponential backoff: 500ms, 1000ms, 2000ms
- Falls back to cached data if all retries fail

### Offline Behavior

When offline or API unavailable:
1. Returns cached data with `stale: true` flag
2. UI can show "Weather data may be outdated" warning
3. Users can still submit reports

---

## Troubleshooting

### "Weather service not configured"
**Cause:** API key not set in Supabase secrets

**Fix:**
```bash
supabase secrets set OPENWEATHER_API_KEY=your_key
supabase functions deploy get-weather
```

### "401 Unauthorized" from OpenWeatherMap
**Cause:** Invalid or expired API key

**Fix:**
1. Check your key at https://openweathermap.org/api_keys
2. Update the secret: `supabase secrets set OPENWEATHER_API_KEY=new_key`
3. Redeploy: `supabase functions deploy get-weather`

### Weather not loading in app
**Check:**
1. Browser console for `[WeatherService]` errors
2. Network tab for failed requests to `/functions/v1/get-weather`
3. Supabase logs: **Dashboard → Edge Functions → get-weather → Logs**

### "Geolocation error" in console
**Cause:** Browser blocked location access

**Fix:**
- Check browser permissions for app.pipe-up.ca
- App will fall back to default coordinates (Calgary)

### Function not found (404)
**Cause:** Function not deployed or wrong URL

**Fix:**
```bash
supabase functions list  # Verify deployment
supabase functions deploy get-weather  # Redeploy if needed
```

---

## Maintenance

### Update API Key
```bash
supabase secrets set OPENWEATHER_API_KEY=new_key
supabase functions deploy get-weather
```

### View Function Logs
```bash
supabase functions logs get-weather
```

Or in Dashboard: **Edge Functions → get-weather → Logs**

### Clear Client Cache
In browser console:
```javascript
localStorage.removeItem('pipeup_weather_cache')
```

---

## Security Notes

- API key is stored in Supabase secrets (encrypted)
- Never logged or exposed in responses
- Client only sees weather data, not the key
- Edge Function validates all inputs
- Rate limiting handled by OpenWeatherMap (1000/day free)

---

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Supabase Edge Function logs
3. Test with the provided test script
4. Check browser console for client-side errors

---

*Last Updated: January 20, 2026*
*Version: 2.0*
