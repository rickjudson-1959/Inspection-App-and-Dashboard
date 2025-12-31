// kpUtils.js - GPS to Kilometre Post Conversion Utilities
// For Pipeline Inspector App - Demo Project

/**
 * Demo Pipeline Waypoints
 * Each waypoint has: lat, lon, kp (in metres)
 * 
 * Route: Edmonton → Calgary → Squamish (Demo/Training route)
 */
export const pipelineWaypoints = [
  // Edmonton Hub (Start)
  { lat: 53.5461, lon: -113.4938, kp: 0, name: 'Edmonton Hub' },
  
  // South of Edmonton
  { lat: 53.2000, lon: -113.6500, kp: 42000, name: 'Leduc Area' },
  
  // Wetaskiwin
  { lat: 52.9700, lon: -113.3700, kp: 75000, name: 'Wetaskiwin' },
  
  // Red Deer
  { lat: 52.2681, lon: -113.8112, kp: 145000, name: 'Red Deer' },
  
  // Airdrie
  { lat: 51.2917, lon: -114.0144, kp: 255000, name: 'Airdrie' },
  
  // Calgary Terminal
  { lat: 51.0447, lon: -114.0719, kp: 300000, name: 'Calgary Terminal' },
  
  // Banff (Mountain crossing)
  { lat: 51.1784, lon: -115.5708, kp: 420000, name: 'Banff' },
  
  // Golden
  { lat: 51.2980, lon: -116.9631, kp: 530000, name: 'Golden' },
  
  // Revelstoke
  { lat: 50.9981, lon: -118.1957, kp: 640000, name: 'Revelstoke' },
  
  // Kamloops
  { lat: 50.6745, lon: -120.3273, kp: 780000, name: 'Kamloops' },
  
  // Hope
  { lat: 49.3858, lon: -121.4419, kp: 900000, name: 'Hope' },
  
  // Squamish Terminal (End)
  { lat: 49.7016, lon: -123.1558, kp: 1000000, name: 'Squamish Terminal' }
]

/**
 * Northern Pipeline Waypoints (Edmonton to Fort McMurray)
 */
export const northernPipelineWaypoints = [
  { lat: 53.5461, lon: -113.4938, kp: 0, name: 'Edmonton Hub' },
  { lat: 54.0500, lon: -113.2000, kp: 58000, name: 'Athabasca' },
  { lat: 54.7700, lon: -112.2800, kp: 140000, name: 'Lac La Biche' },
  { lat: 55.5300, lon: -111.9500, kp: 230000, name: 'Conklin' },
  { lat: 56.2500, lon: -111.5000, kp: 310000, name: 'Anzac' },
  { lat: 56.7267, lon: -111.3790, kp: 365000, name: 'Fort McMurray' }
]

/**
 * Haversine formula to calculate distance between two GPS points
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in metres
 */
export function getDistanceMetres(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Earth's radius in metres
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Find the nearest point on a line segment to a given point
 * @param {number} px - Point X (longitude)
 * @param {number} py - Point Y (latitude)
 * @param {number} ax - Line start X
 * @param {number} ay - Line start Y
 * @param {number} bx - Line end X
 * @param {number} by - Line end Y
 * @returns {object} { x, y, t } where t is the interpolation factor (0-1)
 */
function nearestPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  
  if (dx === 0 && dy === 0) {
    // Segment is a point
    return { x: ax, y: ay, t: 0 }
  }
  
  // Calculate projection
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
  
  // Clamp t to [0, 1] to stay on segment
  t = Math.max(0, Math.min(1, t))
  
  return {
    x: ax + t * dx,
    y: ay + t * dy,
    t: t
  }
}

/**
 * Find the nearest segment and interpolated KP from GPS coordinates
 * @param {number} lat - User's latitude
 * @param {number} lon - User's longitude
 * @param {Array} waypoints - Pipeline waypoints array (default: main pipeline)
 * @returns {object} { kp, distanceFromROW, segmentStart, segmentEnd, nearestPoint, warning }
 */
export function getKPFromGPS(lat, lon, waypoints = pipelineWaypoints) {
  if (!waypoints || waypoints.length < 2) {
    throw new Error('At least 2 waypoints required')
  }

  let nearestKP = null
  let minDistance = Infinity
  let nearestSegment = null
  let nearestPoint = null

  // Check each segment
  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = waypoints[i]
    const end = waypoints[i + 1]

    // Find nearest point on this segment
    const nearest = nearestPointOnSegment(
      lon, lat,           // User's position (x, y)
      start.lon, start.lat, // Segment start
      end.lon, end.lat      // Segment end
    )

    // Calculate distance from user to nearest point on segment
    const distance = getDistanceMetres(lat, lon, nearest.y, nearest.x)

    if (distance < minDistance) {
      minDistance = distance
      
      // Interpolate KP based on position along segment
      const segmentKPLength = end.kp - start.kp
      const interpolatedKP = start.kp + (nearest.t * segmentKPLength)
      
      nearestKP = interpolatedKP
      nearestSegment = { start, end }
      nearestPoint = { lat: nearest.y, lon: nearest.x }
    }
  }

  // Generate warning if too far from ROW
  let warning = null
  if (minDistance > 500) {
    warning = `Warning: You appear to be ${Math.round(minDistance)}m off the Right-of-Way. KP sync may be inaccurate.`
  }

  return {
    kp: Math.round(nearestKP), // KP in metres
    kpFormatted: formatKP(nearestKP),
    distanceFromROW: Math.round(minDistance),
    segmentStart: nearestSegment?.start,
    segmentEnd: nearestSegment?.end,
    nearestPoint,
    warning,
    isOnROW: minDistance <= 30, // Within 30m of centerline
    isNearROW: minDistance <= 500 // Within 500m
  }
}

/**
 * Format KP value (in metres) to standard KP string
 * @param {number} kpMetres - KP value in metres
 * @returns {string} Formatted KP string (e.g., "5+250")
 */
export function formatKP(kpMetres) {
  if (kpMetres === null || kpMetres === undefined || isNaN(kpMetres)) {
    return ''
  }
  
  const km = Math.floor(kpMetres / 1000)
  const m = Math.round(kpMetres % 1000)
  return `${km}+${m.toString().padStart(3, '0')}`
}

/**
 * Parse KP string back to metres
 * @param {string} kpString - KP string (e.g., "5+250")
 * @returns {number|null} KP value in metres, or null if invalid
 */
export function parseKP(kpString) {
  if (!kpString) return null
  
  const str = String(kpString).trim()
  
  // Handle format like "5+250"
  if (str.includes('+')) {
    const [km, m] = str.split('+')
    const kmNum = parseInt(km) || 0
    const mNum = parseInt(m) || 0
    return kmNum * 1000 + mNum
  }
  
  // Handle plain number (assume km if < 1000, else metres)
  const num = parseFloat(str)
  if (!isNaN(num)) {
    return num < 1000 ? num * 1000 : num
  }
  
  return null
}

/**
 * Get user's current GPS position
 * @returns {Promise<{lat: number, lon: number, accuracy: number}>}
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy
        })
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('Location permission denied. Please enable GPS access.'))
            break
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Location information unavailable.'))
            break
          case error.TIMEOUT:
            reject(new Error('Location request timed out. Please try again.'))
            break
          default:
            reject(new Error('An unknown error occurred while getting location.'))
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    )
  })
}

/**
 * Main function: Get KP from current GPS and return formatted result
 * @param {string} pipeline - Which pipeline ('main' or 'north')
 * @returns {Promise<object>} KP result with formatted string and metadata
 */
export async function syncKPFromGPS(pipeline = 'main') {
  try {
    // Get current GPS position
    const position = await getCurrentPosition()
    
    // Select waypoints based on pipeline
    const waypoints = pipeline === 'north' ? northernPipelineWaypoints : pipelineWaypoints
    
    // Calculate KP from GPS
    const result = getKPFromGPS(position.lat, position.lon, waypoints)
    
    return {
      success: true,
      kpFormatted: result.kpFormatted,
      kpMetres: result.kp,
      distanceFromROW: result.distanceFromROW,
      gpsPosition: position,
      nearestPoint: result.nearestPoint,
      segmentStart: result.segmentStart?.name,
      segmentEnd: result.segmentEnd?.name,
      warning: result.warning,
      isOnROW: result.isOnROW,
      isNearROW: result.isNearROW
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Validate a KP against GPS location
 * @param {string} kpString - The KP entered by user
 * @param {number} lat - GPS latitude
 * @param {number} lon - GPS longitude
 * @param {number} toleranceMetres - Allowed difference (default 1000m)
 * @returns {object} Validation result
 */
export function validateKPAgainstGPS(kpString, lat, lon, toleranceMetres = 1000) {
  const enteredKP = parseKP(kpString)
  if (enteredKP === null) {
    return { valid: false, message: 'Invalid KP format' }
  }

  const gpsResult = getKPFromGPS(lat, lon)
  const difference = Math.abs(gpsResult.kp - enteredKP)

  if (difference > toleranceMetres) {
    return {
      valid: false,
      message: `KP mismatch: You entered ${kpString} but GPS suggests ${gpsResult.kpFormatted} (${Math.round(difference / 1000)}km difference)`,
      suggestedKP: gpsResult.kpFormatted,
      difference
    }
  }

  return {
    valid: true,
    message: 'KP matches GPS location',
    difference
  }
}
