// supabase/functions/get-weather/index.ts
// Secure weather API proxy - keeps API key server-side

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { lat, lon } = await req.json()
    
    // Validate inputs
    if (!lat || !lon) {
      return new Response(
        JSON.stringify({ error: 'lat and lon are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get API key from Supabase secrets
    const apiKey = Deno.env.get('OPENWEATHER_API_KEY')
    if (!apiKey) {
      console.error('OPENWEATHER_API_KEY not set in Supabase secrets')
      return new Response(
        JSON.stringify({ error: 'Weather service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch from OpenWeatherMap
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
    const weatherRes = await fetch(weatherUrl)
    const weatherData = await weatherRes.json()

    if (!weatherRes.ok) {
      console.error('OpenWeather API error:', weatherData)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch weather data', details: weatherData.message }),
        { status: weatherRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Format response for Pipe-Up app
    // Capitalizes first letter of conditions for cleaner display
    const conditions = weatherData.weather?.[0]?.description || 'Unknown'
    const formattedConditions = conditions.charAt(0).toUpperCase() + conditions.slice(1)

    const formatted = {
      // Weather conditions
      conditions: formattedConditions,
      
      // Temperatures (already in Celsius from units=metric)
      tempHigh: weatherData.main?.temp_max ? Math.round(weatherData.main.temp_max) : null,
      tempLow: weatherData.main?.temp_min ? Math.round(weatherData.main.temp_min) : null,
      temperature: weatherData.main?.temp ? Math.round(weatherData.main.temp) : null,
      feelsLike: weatherData.main?.feels_like ? Math.round(weatherData.main.feels_like) : null,
      
      // Precipitation (mm in last hour if available)
      precipitation: weatherData.rain?.['1h'] || weatherData.snow?.['1h'] || 0,
      precipitationType: weatherData.rain ? 'rain' : weatherData.snow ? 'snow' : 'none',
      
      // Wind (convert m/s to km/h)
      windSpeed: weatherData.wind?.speed ? Math.round(weatherData.wind.speed * 3.6) : null,
      windGust: weatherData.wind?.gust ? Math.round(weatherData.wind.gust * 3.6) : null,
      windDirection: weatherData.wind?.deg || null,
      
      // Other
      humidity: weatherData.main?.humidity || null,
      visibility: weatherData.visibility ? Math.round(weatherData.visibility / 1000) : null, // Convert to km
      pressure: weatherData.main?.pressure || null,
      cloudCover: weatherData.clouds?.all || null,
      
      // Icon code for display (e.g., "01d" for clear sky day)
      icon: weatherData.weather?.[0]?.icon || null,
      
      // Location confirmation
      location: weatherData.name || 'Unknown',
      
      // Timestamp
      fetchedAt: new Date().toISOString()
    }

    return new Response(
      JSON.stringify(formatted),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Weather function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
