# Weather API Fix - Deployment Instructions

## The Problem
The OpenWeatherMap API key was being exposed client-side via Vite environment variables (`VITE_OPENWEATHER_API_KEY`), which:
- Shows as `undefined` when env vars aren't properly loaded
- Exposes your API key in the browser network tab
- Breaks on redeployments if env vars aren't set correctly

## The Solution
Move the API call to a **Supabase Edge Function** so:
- API key stays secure on the server (Supabase secrets)
- Never exposed to the client browser
- Won't break with Vercel redeployments
- More secure and reliable

---

## Deployment Steps

### Step 1: Install Supabase CLI (if not already installed)
```bash
npm install -g supabase
```

### Step 2: Login to Supabase
```bash
supabase login
```

### Step 3: Link to Your Project
```bash
cd ~/Documents/"Inspection App and Dashboard"
supabase link --project-ref YOUR_PROJECT_REF
```
(Find your project ref in Supabase Dashboard → Settings → General)

### Step 4: Create the Function Directory
```bash
mkdir -p supabase/functions/get-weather
```

### Step 5: Copy the Edge Function
Copy the `get-weather/index.ts` file to:
```
supabase/functions/get-weather/index.ts
```

### Step 6: Set the API Key as a Secret
```bash
supabase secrets set OPENWEATHER_API_KEY=your_actual_api_key_here
```

### Step 7: Deploy the Edge Function
```bash
supabase functions deploy get-weather
```

### Step 8: Update Your App Code
Replace your existing `weatherService.js` with the new version provided.

### Step 9: Remove Old Environment Variable (Optional)
You can now remove `VITE_OPENWEATHER_API_KEY` from Vercel since it's no longer needed.

### Step 10: Redeploy Your App
```bash
git add .
git commit -m "Move weather API to Edge Function for security"
git push origin main
```

---

## Testing

After deployment, test the Edge Function directly:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-weather \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"lat": 49.525, "lon": -122.84}'
```

You should get a JSON response with weather data.

---

## Troubleshooting

### "Weather service not configured" error
- The secret isn't set. Run: `supabase secrets set OPENWEATHER_API_KEY=your_key`
- Then redeploy: `supabase functions deploy get-weather`

### "401 Unauthorized" from OpenWeatherMap
- Your API key is invalid or expired
- Check your OpenWeatherMap account at https://openweathermap.org/api_keys

### Function not found
- Make sure the function is deployed: `supabase functions list`
- Check the function name matches exactly: `get-weather`

### CORS errors
- The Edge Function includes CORS headers, but make sure your Supabase URL is correct in `supabaseClient.js`

---

## Files Included

1. **get-weather/index.ts** - The Supabase Edge Function
2. **weatherService.js** - Updated client-side service that calls the Edge Function

---

## Benefits of This Approach

✅ API key is never exposed to the browser  
✅ Won't break on redeployments  
✅ Centralized secret management in Supabase  
✅ Can add rate limiting or caching later if needed  
✅ Easier to swap weather providers in the future  
