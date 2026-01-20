// weatherService.js
// Robust weather service with retries, fallbacks, caching, and offline support
// Version: 2.0

import { supabase } from './supabase'

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // Retry settings
  maxRetries: 2,
  retryDelayMs: 1000,
  
  // Timeout settings
  fetchTimeoutMs: 15000,
  geolocationTimeoutMs: 10000,
  
  // Cache settings (localStorage fallback)
  localCacheKey: 'pipeup_weather_cache',
  localCacheDurationMs: 30 * 60 * 1000, // 30 minutes
  
  // Default coordinates (Calgary, AB - fallback if geolocation fails)
  defaultCoords: {
    lat: 51.0447,
    lon: -114.0719
  }
}

// =============================================================================
// LOCAL CACHE (survives page refreshes, works offline)
// =============================================================================

function getLocalCache() {
  try {
    const cached = localStorage.getItem(CONFIG.localCacheKey)
    if (!cached) return null
    
    const parsed = JSON.parse(cached)
    const now = Date.now()
    
    // Check if cache is expired
    if (parsed.expiresAt && now > parsed.expiresAt) {
      console.log('[WeatherService] Local cache expired')
      localStorage.removeItem(CONFIG.localCacheKey)
      return null
    }
    
    console.log('[WeatherService] Using local cache')
    return parsed.data
  } catch (e) {
    console.error('[WeatherService] Local cache read error:', e)
    return null
  }
}

function setLocalCache(data) {
  try {
    const cacheEntry = {
      data: { ...data, fromLocalCache: true },
      expiresAt: Date.now() + CONFIG.localCacheDurationMs,
      savedAt: new Date().toISOString()
    }
    localStorage.setItem(CONFIG.localCacheKey, JSON.stringify(cacheEntry))
    console.log('[WeatherService] Saved to local cache')
  } catch (e) {
    console.error('[WeatherService] Local cache write error:', e)
  }
}

function clearLocalCache() {
  try {
    localStorage.removeItem(CONFIG.localCacheKey)
    console.log('[WeatherService] Local cache cleared')
  } catch (e) {
    // Ignore
  }
}

// =============================================================================
// GEOLOCATION WITH FALLBACK
// =============================================================================

/**
 * Gets current position with timeout and fallback
 * @returns {Promise<{lat: number, lon: number, source: string}>}
 */
export async function getCurrentPosition() {
  return new Promise((resolve) => {
    // Check if geolocation is available
    if (!navigator.geolocation) {
      console.warn('[WeatherService] Geolocation not supported, using default coordinates')
      resolve({ ...CONFIG.defaultCoords, source: 'default' })
      return
    }

    const timeoutId = setTimeout(() => {
      console.warn('[WeatherService] Geolocation timeout, using default coordinates')
      resolve({ ...CONFIG.defaultCoords, source: 'timeout_fallback' })
    }, CONFIG.geolocationTimeoutMs)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId)
        console.log('[WeatherService] Got GPS position')
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          source: 'gps'
        })
      },
      (error) => {
        clearTimeout(timeoutId)
        console.warn('[WeatherService] Geolocation error:', error.message)
        
        // Try to get last known position from cache
        const cached = getLocalCache()
        if (cached?.lat && cached?.lon) {
          console.log('[WeatherService] Using cached position')
          resolve({ lat: cached.lat, lon: cached.lon, source: 'cached_position' })
        } else {
          console.log('[WeatherService] Using default coordinates')
          resolve({ ...CONFIG.defaultCoords, source: 'error_fallback' })
        }
      },
      {
        enableHighAccuracy: false,
        timeout: CONFIG.geolocationTimeoutMs - 1000,
        maximumAge: 600000 // Accept positions up to 10 minutes old
      }
    )
  })
}

// =============================================================================
// FETCH WITH TIMEOUT AND RETRY
// =============================================================================

async function fetchWithTimeout(fetchFn, timeoutMs) {
  return Promise.race([
    fetchFn(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    )
  ])
}

async function fetchWithRetry(fetchFn, retries = CONFIG.maxRetries) {
  let lastError = null
  
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      console.log(`[WeatherService] Fetch attempt ${attempt}/${retries + 1}`)
      const result = await fetchWithTimeout(fetchFn, CONFIG.fetchTimeoutMs)
      return result
    } catch (error) {
      lastError = error
      console.warn(`[WeatherService] Attempt ${attempt} failed:`, error.message)
      
      if (attempt <= retries) {
        const delay = CONFIG.retryDelayMs * attempt
        console.log(`[WeatherService] Waiting ${delay}ms before retry`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  
  throw lastError
}

// =============================================================================
// MAIN WEATHER FETCH FUNCTION
// =============================================================================

/**
 * Fetches weather data with full error handling, retries, and caching
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {object} options - Options
 * @param {boolean} options.forceRefresh - Skip cache and fetch fresh data
 * @param {boolean} options.useLocalCacheOnError - Fall back to local cache on error
 * @returns {Promise<object|null>} Weather data or null on complete failure
 */
export async function fetchWeather(lat, lon, options = {}) {
  const { forceRefresh = false, useLocalCacheOnError = true } = options
  
  console.log(`[WeatherService] Fetching weather for: ${lat}, ${lon}`)
  console.log(`[WeatherService] Options: forceRefresh=${forceRefresh}`)

  // Validate inputs
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    console.error('[WeatherService] Invalid coordinates:', { lat, lon })
    return useLocalCacheOnError ? getLocalCache() : null
  }

  // Check local cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = getLocalCache()
    if (cached) {
      console.log('[WeatherService] Returning locally cached data')
      return cached
    }
  }

  try {
    const fetchFn = async () => {
      const { data, error } = await supabase.functions.invoke('get-weather', {
        body: { lat, lon, forceRefresh }
      })

      if (error) {
        console.error('[WeatherService] Supabase function error:', error)
        throw new Error(error.message || 'Edge function error')
      }

      if (data?.error) {
        console.error('[WeatherService] API returned error:', data.error)
        throw new Error(data.error)
      }

      return data
    }

    const data = await fetchWithRetry(fetchFn)
    
    // Save to local cache for offline use
    if (data) {
      // Add coordinates to cache for position fallback
      setLocalCache({ ...data, lat, lon })
    }

    console.log('[WeatherService] Successfully fetched weather:', data?.location)
    return data

  } catch (error) {
    console.error('[WeatherService] All fetch attempts failed:', error.message)
    
    // Fall back to local cache on error
    if (useLocalCacheOnError) {
      const cached = getLocalCache()
      if (cached) {
        console.log('[WeatherService] Returning stale cache after error')
        return { ...cached, stale: true, error: error.message }
      }
    }

    return null
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Gets weather for current location (handles everything)
 * @param {object} options - Options to pass to fetchWeather
 * @returns {Promise<object|null>} Weather data or null
 */
export async function fetchWeatherForCurrentLocation(options = {}) {
  try {
    const position = await getCurrentPosition()
    console.log(`[WeatherService] Position source: ${position.source}`)
    
    const weather = await fetchWeather(position.lat, position.lon, options)
    
    if (weather) {
      return {
        ...weather,
        positionSource: position.source
      }
    }
    
    return null
  } catch (error) {
    console.error('[WeatherService] fetchWeatherForCurrentLocation error:', error)
    return getLocalCache()
  }
}

/**
 * Formats weather data for display in inspection report fields
 * @param {object} weather - Weather data from API
 * @returns {object} Formatted weather for report fields
 */
export function formatWeatherForReport(weather) {
  if (!weather) {
    return {
      conditions: '',
      tempHigh: '',
      tempLow: '',
      precipitation: '',
      windSpeed: '',
      humidity: '',
      visibility: '',
      _error: 'No weather data available'
    }
  }

  const formatted = {
    conditions: weather.conditions || '',
    tempHigh: weather.tempHigh != null ? `${weather.tempHigh}` : '',
    tempLow: weather.tempLow != null ? `${weather.tempLow}` : '',
    temperature: weather.temperature != null ? `${weather.temperature}` : '',
    precipitation: weather.precipitation > 0 
      ? `${weather.precipitation} mm` 
      : '0',
    windSpeed: weather.windSpeed != null ? `${weather.windSpeed}` : '',
    humidity: weather.humidity != null ? `${weather.humidity}` : '',
    visibility: weather.visibility != null ? `${weather.visibility}` : '',
    location: weather.location || '',
    _meta: {
      cached: weather.cached || weather.fromLocalCache || false,
      stale: weather.stale || false,
      fetchedAt: weather.fetchedAt,
      positionSource: weather.positionSource
    }
  }

  // Add warning if data is stale
  if (weather.stale) {
    formatted._warning = 'Weather data may be outdated (offline mode)'
  }

  return formatted
}

/**
 * Checks if weather service is available (has API key configured)
 * @returns {Promise<boolean>}
 */
export async function checkWeatherServiceHealth() {
  try {
    // Try a quick fetch with default coordinates
    const { data, error } = await supabase.functions.invoke('get-weather', {
      body: { lat: CONFIG.defaultCoords.lat, lon: CONFIG.defaultCoords.lon }
    })
    
    if (error || data?.error) {
      console.error('[WeatherService] Health check failed:', error || data?.error)
      return false
    }
    
    return true
  } catch (e) {
    console.error('[WeatherService] Health check error:', e)
    return false
  }
}

/**
 * Clears all weather caches (local and forces refresh on next fetch)
 */
export function clearWeatherCache() {
  clearLocalCache()
  console.log('[WeatherService] All caches cleared')
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  fetchWeather,
  fetchWeatherForCurrentLocation,
  formatWeatherForReport,
  getCurrentPosition,
  checkWeatherServiceHealth,
  clearWeatherCache
}
