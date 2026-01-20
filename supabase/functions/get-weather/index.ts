// supabase/functions/get-weather/index.ts
// Robust weather API proxy with caching, error handling, and comprehensive logging
// Version: 2.0

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// =============================================================================
// CONFIGURATION
// =============================================================================

const CACHE_DURATION_MINUTES = 15 // Cache weather data for 15 minutes
const REQUEST_TIMEOUT_MS = 10000 // 10 second timeout for OpenWeatherMap
const MAX_RETRIES = 2 // Retry failed requests up to 2 times

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// =============================================================================
// TYPES
// =============================================================================

interface WeatherRequest {
  lat: number
  lon: number
  forceRefresh?: boolean
}

interface WeatherResponse {
  conditions: string
  tempHigh: number | null
  tempLow: number | null
  temperature: number | null
  feelsLike: number | null
  precipitation: number
  precipitationType: 'rain' | 'snow' | 'none'
  windSpeed: number | null
  windGust: number | null
  windDirection: number | null
  humidity: number | null
  visibility: number | null
  pressure: number | null
  cloudCover: number | null
  icon: string | null
  location: string
  fetchedAt: string
  cached: boolean
  cacheKey?: string
}

interface CachedWeather {
  data: WeatherResponse
  expiresAt: number
}

// =============================================================================
// IN-MEMORY CACHE (per Edge Function instance)
// =============================================================================

const weatherCache = new Map<string, CachedWeather>()

function getCacheKey(lat: number, lon: number): string {
  // Round to 2 decimal places for cache key (about 1km precision)
  const roundedLat = Math.round(lat * 100) / 100
  const roundedLon = Math.round(lon * 100) / 100
  return `${roundedLat},${roundedLon}`
}

function getFromCache(key: string): WeatherResponse | null {
  const cached = weatherCache.get(key)
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[CACHE HIT] Key: ${key}`)
    return { ...cached.data, cached: true, cacheKey: key }
  }
  if (cached) {
    console.log(`[CACHE EXPIRED] Key: ${key}`)
    weatherCache.delete(key)
  }
  return null
}

function setCache(key: string, data: WeatherResponse): void {
  const expiresAt = Date.now() + (CACHE_DURATION_MINUTES * 60 * 1000)
  weatherCache.set(key, { data, expiresAt })
  console.log(`[CACHE SET] Key: ${key}, Expires: ${new Date(expiresAt).toISOString()}`)
  
  // Clean up old entries (keep cache size manageable)
  if (weatherCache.size > 100) {
    const now = Date.now()
    for (const [k, v] of weatherCache.entries()) {
      if (v.expiresAt < now) {
        weatherCache.delete(k)
      }
    }
  }
}

// =============================================================================
// FETCH WITH TIMEOUT AND RETRY
// =============================================================================

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

async function fetchWithRetry(url: string, retries: number = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      console.log(`[FETCH] Attempt ${attempt}/${retries + 1}`)
      const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS)
      
      if (response.ok) {
        return response
      }
      
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response
      }
      
      lastError = new Error(`HTTP ${response.status}`)
      console.log(`[FETCH] Attempt ${attempt} failed: ${response.status}`)
      
    } catch (error) {
      lastError = error as Error
      console.log(`[FETCH] Attempt ${attempt} error: ${error.message}`)
    }
    
    // Wait before retry (exponential backoff)
    if (attempt <= retries) {
      const delay = Math.pow(2, attempt - 1) * 500 // 500ms, 1000ms, 2000ms...
      console.log(`[FETCH] Waiting ${delay}ms before retry`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError || new Error('Fetch failed after retries')
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateCoordinates(lat: unknown, lon: unknown): { valid: boolean; error?: string } {
  if (lat === undefined || lat === null || lon === undefined || lon === null) {
    return { valid: false, error: 'lat and lon are required' }
  }
  
  const latNum = Number(lat)
  const lonNum = Number(lon)
  
  if (isNaN(latNum) || isNaN(lonNum)) {
    return { valid: false, error: 'lat and lon must be valid numbers' }
  }
  
  if (latNum < -90 || latNum > 90) {
    return { valid: false, error: 'lat must be between -90 and 90' }
  }
  
  if (lonNum < -180 || lonNum > 180) {
    return { valid: false, error: 'lon must be between -180 and 180' }
  }
  
  return { valid: true }
}

// =============================================================================
// WEATHER DATA FORMATTING
// =============================================================================

function formatWeatherResponse(weatherData: any): WeatherResponse {
  const conditions = weatherData.weather?.[0]?.description || 'Unknown'
  const formattedConditions = conditions.charAt(0).toUpperCase() + conditions.slice(1)

  return {
    conditions: formattedConditions,
    tempHigh: weatherData.main?.temp_max != null ? Math.round(weatherData.main.temp_max) : null,
    tempLow: weatherData.main?.temp_min != null ? Math.round(weatherData.main.temp_min) : null,
    temperature: weatherData.main?.temp != null ? Math.round(weatherData.main.temp) : null,
    feelsLike: weatherData.main?.feels_like != null ? Math.round(weatherData.main.feels_like) : null,
    precipitation: weatherData.rain?.['1h'] || weatherData.snow?.['1h'] || 0,
    precipitationType: weatherData.rain ? 'rain' : weatherData.snow ? 'snow' : 'none',
    windSpeed: weatherData.wind?.speed != null ? Math.round(weatherData.wind.speed * 3.6) : null,
    windGust: weatherData.wind?.gust != null ? Math.round(weatherData.wind.gust * 3.6) : null,
    windDirection: weatherData.wind?.deg || null,
    humidity: weatherData.main?.humidity || null,
    visibility: weatherData.visibility != null ? Math.round(weatherData.visibility / 1000) : null,
    pressure: weatherData.main?.pressure || null,
    cloudCover: weatherData.clouds?.all || null,
    icon: weatherData.weather?.[0]?.icon || null,
    location: weatherData.name || 'Unknown',
    fetchedAt: new Date().toISOString(),
    cached: false
  }
}

// =============================================================================
// DATABASE LOGGING (Optional - logs to Supabase for debugging)
// =============================================================================

async function logWeatherRequest(
  supabase: any,
  lat: number,
  lon: number,
  success: boolean,
  error?: string,
  cached?: boolean
): Promise<void> {
  try {
    // Only log if the table exists - won't fail if it doesn't
    await supabase.from('weather_api_logs').insert({
      lat,
      lon,
      success,
      error_message: error || null,
      cached: cached || false,
      created_at: new Date().toISOString()
    })
  } catch (e) {
    // Silently ignore if table doesn't exist
    console.log('[LOG] Weather logging skipped (table may not exist)')
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8)
  console.log(`[${requestId}] ========== NEW REQUEST ==========`)
  console.log(`[${requestId}] Method: ${req.method}`)
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] CORS preflight response`)
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST
  if (req.method !== 'POST') {
    console.log(`[${requestId}] Method not allowed: ${req.method}`)
    return new Response(
      JSON.stringify({ error: 'Method not allowed', requestId }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Initialize Supabase client for logging (optional)
  let supabase: any = null
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (supabaseUrl && supabaseKey) {
      supabase = createClient(supabaseUrl, supabaseKey)
    }
  } catch (e) {
    console.log(`[${requestId}] Supabase client init skipped`)
  }

  try {
    // Parse request body
    let body: WeatherRequest
    try {
      body = await req.json()
    } catch (e) {
      console.log(`[${requestId}] Invalid JSON body`)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body', requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { lat, lon, forceRefresh } = body
    console.log(`[${requestId}] Coordinates: ${lat}, ${lon}, forceRefresh: ${forceRefresh}`)

    // Validate coordinates
    const validation = validateCoordinates(lat, lon)
    if (!validation.valid) {
      console.log(`[${requestId}] Validation failed: ${validation.error}`)
      return new Response(
        JSON.stringify({ error: validation.error, requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check cache first (unless force refresh)
    const cacheKey = getCacheKey(lat, lon)
    if (!forceRefresh) {
      const cachedData = getFromCache(cacheKey)
      if (cachedData) {
        console.log(`[${requestId}] Returning cached data`)
        await logWeatherRequest(supabase, lat, lon, true, undefined, true)
        return new Response(
          JSON.stringify({ ...cachedData, requestId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Get API key
    const apiKey = Deno.env.get('OPENWEATHER_API_KEY')
    if (!apiKey) {
      console.error(`[${requestId}] OPENWEATHER_API_KEY not set`)
      await logWeatherRequest(supabase, lat, lon, false, 'API key not configured')
      return new Response(
        JSON.stringify({ 
          error: 'Weather service not configured', 
          details: 'Contact administrator to set up API key',
          requestId 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch from OpenWeatherMap
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
    console.log(`[${requestId}] Fetching from OpenWeatherMap`)
    
    let weatherRes: Response
    try {
      weatherRes = await fetchWithRetry(weatherUrl)
    } catch (error) {
      console.error(`[${requestId}] Fetch failed after retries:`, error.message)
      await logWeatherRequest(supabase, lat, lon, false, `Fetch failed: ${error.message}`)
      return new Response(
        JSON.stringify({ 
          error: 'Weather service temporarily unavailable', 
          details: 'Please try again in a few moments',
          requestId 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const weatherData = await weatherRes.json()

    if (!weatherRes.ok) {
      console.error(`[${requestId}] OpenWeather API error:`, weatherData)
      await logWeatherRequest(supabase, lat, lon, false, `API error: ${weatherData.message}`)
      
      // Handle specific error codes
      if (weatherRes.status === 401) {
        return new Response(
          JSON.stringify({ 
            error: 'Weather service authentication failed', 
            details: 'API key may be invalid or expired',
            requestId 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      if (weatherRes.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Weather service rate limit exceeded', 
            details: 'Please try again in a few minutes',
            requestId 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch weather data', 
          details: weatherData.message || 'Unknown error',
          requestId 
        }),
        { status: weatherRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Format and cache response
    const formatted = formatWeatherResponse(weatherData)
    setCache(cacheKey, formatted)
    
    console.log(`[${requestId}] Success - Location: ${formatted.location}, Temp: ${formatted.temperature}°C`)
    await logWeatherRequest(supabase, lat, lon, true)

    return new Response(
      JSON.stringify({ ...formatted, requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error(`[${requestId}] Unexpected error:`, error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message,
        requestId 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
