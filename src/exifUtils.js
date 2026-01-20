// ============================================================================
// EXIF UTILS - GPS Extraction from Images
// Date: January 2026
// Purpose: Extract GPS coordinates and metadata from geotagged photos
// Precision: 6 decimal places per PRECISION_MAP
// ============================================================================

/**
 * Extract GPS coordinates and metadata from an image file's EXIF data
 * Uses native browser APIs (no external library required)
 *
 * @param {File} imageFile - The image file to extract GPS from
 * @returns {Promise<Object>} GPS data object
 */
export async function extractGPSFromImage(imageFile) {
  const result = {
    latitude: null,
    longitude: null,
    direction: null,
    accuracy: null,
    altitude: null,
    hasGPS: false,
    timestamp: null,
    error: null
  }

  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await imageFile.arrayBuffer()
    const dataView = new DataView(arrayBuffer)

    // Check for JPEG format (starts with 0xFFD8)
    if (dataView.getUint16(0) !== 0xFFD8) {
      result.error = 'Not a JPEG image'
      return result
    }

    // Find EXIF marker (0xFFE1)
    let offset = 2
    const length = dataView.byteLength

    while (offset < length - 4) {
      const marker = dataView.getUint16(offset)

      if (marker === 0xFFE1) {
        // Found EXIF marker
        const exifLength = dataView.getUint16(offset + 2)
        const exifData = parseExifData(dataView, offset + 4, exifLength - 2)

        if (exifData.gps) {
          result.latitude = roundTo6Decimals(exifData.gps.latitude)
          result.longitude = roundTo6Decimals(exifData.gps.longitude)
          result.direction = exifData.gps.direction ? roundTo1Decimal(exifData.gps.direction) : null
          result.altitude = exifData.gps.altitude ? roundTo2Decimals(exifData.gps.altitude) : null
          result.hasGPS = result.latitude !== null && result.longitude !== null
          result.timestamp = exifData.dateTime || null
        }

        break
      }

      // Skip to next marker
      if ((marker & 0xFF00) === 0xFF00) {
        offset += 2 + dataView.getUint16(offset + 2)
      } else {
        offset++
      }
    }
  } catch (err) {
    console.error('EXIF extraction error:', err)
    result.error = err.message
  }

  return result
}

/**
 * Parse EXIF data from DataView
 */
function parseExifData(dataView, start, length) {
  const result = { gps: null, dateTime: null }

  try {
    // Check for "Exif" marker
    const exifString = String.fromCharCode(
      dataView.getUint8(start),
      dataView.getUint8(start + 1),
      dataView.getUint8(start + 2),
      dataView.getUint8(start + 3)
    )

    if (exifString !== 'Exif') {
      return result
    }

    // Skip "Exif\0\0" (6 bytes)
    const tiffStart = start + 6

    // Determine byte order (II = little endian, MM = big endian)
    const byteOrder = dataView.getUint16(tiffStart)
    const littleEndian = byteOrder === 0x4949 // 'II'

    // Get IFD0 offset
    const ifd0Offset = dataView.getUint32(tiffStart + 4, littleEndian)

    // Parse IFD0 to find GPS IFD pointer
    const ifd0Start = tiffStart + ifd0Offset
    const numEntries = dataView.getUint16(ifd0Start, littleEndian)

    let gpsIFDOffset = null

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifd0Start + 2 + (i * 12)
      const tag = dataView.getUint16(entryOffset, littleEndian)

      // GPS IFD Pointer tag = 0x8825
      if (tag === 0x8825) {
        gpsIFDOffset = dataView.getUint32(entryOffset + 8, littleEndian)
        break
      }
    }

    // Parse GPS IFD if found
    if (gpsIFDOffset) {
      result.gps = parseGPSIFD(dataView, tiffStart + gpsIFDOffset, tiffStart, littleEndian)
    }
  } catch (err) {
    console.warn('EXIF parse error:', err)
  }

  return result
}

/**
 * Parse GPS IFD from EXIF data
 */
function parseGPSIFD(dataView, gpsStart, tiffStart, littleEndian) {
  const gps = {
    latitude: null,
    longitude: null,
    direction: null,
    altitude: null
  }

  try {
    const numEntries = dataView.getUint16(gpsStart, littleEndian)

    let latRef = null
    let lonRef = null
    let latDMS = null
    let lonDMS = null

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = gpsStart + 2 + (i * 12)
      const tag = dataView.getUint16(entryOffset, littleEndian)
      const type = dataView.getUint16(entryOffset + 2, littleEndian)
      const count = dataView.getUint32(entryOffset + 4, littleEndian)
      const valueOffset = entryOffset + 8

      switch (tag) {
        case 1: // GPSLatitudeRef (N or S)
          latRef = String.fromCharCode(dataView.getUint8(valueOffset))
          break

        case 2: // GPSLatitude
          latDMS = readRationalArray(dataView, valueOffset, tiffStart, count, littleEndian)
          break

        case 3: // GPSLongitudeRef (E or W)
          lonRef = String.fromCharCode(dataView.getUint8(valueOffset))
          break

        case 4: // GPSLongitude
          lonDMS = readRationalArray(dataView, valueOffset, tiffStart, count, littleEndian)
          break

        case 6: // GPSAltitude
          const altOffset = dataView.getUint32(valueOffset, littleEndian)
          const altNum = dataView.getUint32(tiffStart + altOffset, littleEndian)
          const altDen = dataView.getUint32(tiffStart + altOffset + 4, littleEndian)
          gps.altitude = altNum / altDen
          break

        case 17: // GPSImgDirection
          const dirOffset = dataView.getUint32(valueOffset, littleEndian)
          const dirNum = dataView.getUint32(tiffStart + dirOffset, littleEndian)
          const dirDen = dataView.getUint32(tiffStart + dirOffset + 4, littleEndian)
          gps.direction = dirNum / dirDen
          break
      }
    }

    // Convert DMS to decimal
    if (latDMS && latDMS.length === 3) {
      gps.latitude = dmsToDecimal(latDMS[0], latDMS[1], latDMS[2], latRef)
    }

    if (lonDMS && lonDMS.length === 3) {
      gps.longitude = dmsToDecimal(lonDMS[0], lonDMS[1], lonDMS[2], lonRef)
    }
  } catch (err) {
    console.warn('GPS IFD parse error:', err)
  }

  return gps
}

/**
 * Read array of rational values from EXIF
 */
function readRationalArray(dataView, valueOffset, tiffStart, count, littleEndian) {
  const offset = dataView.getUint32(valueOffset, littleEndian)
  const values = []

  for (let i = 0; i < count; i++) {
    const pos = tiffStart + offset + (i * 8)
    const numerator = dataView.getUint32(pos, littleEndian)
    const denominator = dataView.getUint32(pos + 4, littleEndian)
    values.push(numerator / (denominator || 1))
  }

  return values
}

/**
 * Convert DMS (degrees, minutes, seconds) to decimal degrees
 */
function dmsToDecimal(degrees, minutes, seconds, direction) {
  let decimal = degrees + (minutes / 60) + (seconds / 3600)

  // South and West are negative
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal
  }

  return decimal
}

/**
 * Round to 6 decimal places (GPS precision ~0.1m)
 */
function roundTo6Decimals(value) {
  if (value === null || value === undefined || isNaN(value)) return null
  return Math.round(value * 1000000) / 1000000
}

/**
 * Round to 2 decimal places
 */
function roundTo2Decimals(value) {
  if (value === null || value === undefined || isNaN(value)) return null
  return Math.round(value * 100) / 100
}

/**
 * Round to 1 decimal place
 */
function roundTo1Decimal(value) {
  if (value === null || value === undefined || isNaN(value)) return null
  return Math.round(value * 10) / 10
}

/**
 * Validate GPS coordinates against expected KP location
 * Used to verify photo was taken at the claimed location
 *
 * @param {Object} gpsData - GPS data from extractGPSFromImage
 * @param {string} expectedKP - Expected KP location (e.g., "5+250")
 * @param {number} toleranceMeters - Acceptable distance tolerance in meters (default 100m)
 * @returns {Object} Validation result
 */
export function validateGPSAgainstKP(gpsData, expectedKP, toleranceMeters = 100) {
  const result = {
    isValid: false,
    distanceMeters: null,
    warning: null
  }

  // If no GPS data, can't validate
  if (!gpsData || !gpsData.hasGPS) {
    result.warning = 'No GPS data in photo'
    return result
  }

  // If no expected KP, skip validation
  if (!expectedKP) {
    result.warning = 'No expected KP provided'
    result.isValid = true // Allow it if no KP to compare
    return result
  }

  // This would need pipeline centerline data to properly validate
  // For now, we'll just note that GPS was extracted
  result.isValid = true
  result.warning = 'KP validation requires pipeline centerline data'

  return result
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 *
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
export function calculateGPSDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return roundTo2Decimals(R * c)
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180)
}

/**
 * Format GPS coordinates for display
 *
 * @param {number} latitude - Latitude in decimal degrees
 * @param {number} longitude - Longitude in decimal degrees
 * @returns {string} Formatted coordinates
 */
export function formatGPSCoordinates(latitude, longitude) {
  if (latitude === null || longitude === null) {
    return 'No GPS data'
  }

  const latDir = latitude >= 0 ? 'N' : 'S'
  const lonDir = longitude >= 0 ? 'E' : 'W'

  return `${Math.abs(latitude).toFixed(6)}° ${latDir}, ${Math.abs(longitude).toFixed(6)}° ${lonDir}`
}

/**
 * Alternative: Use browser's Geolocation API if EXIF extraction fails
 * This gets the device's current location (not the photo's location)
 *
 * @returns {Promise<Object>} GPS data object
 */
export async function getCurrentDeviceGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        latitude: null,
        longitude: null,
        accuracy: null,
        hasGPS: false,
        error: 'Geolocation not supported'
      })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: roundTo6Decimals(position.coords.latitude),
          longitude: roundTo6Decimals(position.coords.longitude),
          accuracy: roundTo2Decimals(position.coords.accuracy),
          altitude: position.coords.altitude ? roundTo2Decimals(position.coords.altitude) : null,
          hasGPS: true,
          error: null
        })
      },
      (error) => {
        resolve({
          latitude: null,
          longitude: null,
          accuracy: null,
          hasGPS: false,
          error: error.message
        })
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
  })
}

export default {
  extractGPSFromImage,
  validateGPSAgainstKP,
  calculateGPSDistance,
  formatGPSCoordinates,
  getCurrentDeviceGPS
}
