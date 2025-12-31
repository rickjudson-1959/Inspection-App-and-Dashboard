// MiniMapWidget.jsx - Compact Pipeline Map for Inspector Report
// Shows current work area and GPS location

import React, { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// =====================================================
// FORTISBC EGP PIPELINE ROUTE
// Eagle Mountain - Woodfibre Gas Pipeline
// Coquitlam to Woodfibre LNG via Indian River
// 47km Mainline + 9km Tunnel = 56km Total
// =====================================================

const egpMainlineRoute = [
  // Coquitlam Interconnect Station (KP 0)
  { lat: 49.2838, lon: -122.7932, kp: 0, label: 'Coquitlam Station' },
  
  // North through Port Moody area
  { lat: 49.3100, lon: -122.8200, kp: 3 },
  
  // Enter Indian Arm / Buntzen Lake area
  { lat: 49.3450, lon: -122.8650, kp: 8 },
  
  // CN Rail Crossing (HDD)
  { lat: 49.3680, lon: -122.8800, kp: 9, label: 'Rail Crossing HDD' },
  
  // Highway 99 area
  { lat: 49.3950, lon: -122.9100, kp: 12, label: 'Hwy 99 Crossing' },
  
  // Indian River Valley entrance
  { lat: 49.4350, lon: -122.9500, kp: 16 },
  
  // Indian River HDD Crossing
  { lat: 49.4720, lon: -122.9850, kp: 19, label: 'Indian River HDD' },
  
  // Mid-line Block Valve (MLV-1)
  { lat: 49.5100, lon: -123.0200, kp: 24, label: 'MLV-1' },
  
  // Continue through watershed
  { lat: 49.5450, lon: -123.0550, kp: 28 },
  
  // Mamquam River area
  { lat: 49.5820, lon: -123.0900, kp: 35, label: 'Mamquam River HDD' },
  
  // Approach to tunnel portal
  { lat: 49.6100, lon: -123.1200, kp: 40 },
  
  // North Tunnel Portal
  { lat: 49.6350, lon: -123.1500, kp: 47, label: 'Tunnel Portal (North)' }
]

const egpTunnelRoute = [
  // North Tunnel Portal (KP 47)
  { lat: 49.6350, lon: -123.1500, kp: 47, label: 'Tunnel Portal (North)' },
  
  // Under Howe Sound / Coast Mountains
  { lat: 49.6500, lon: -123.1800, kp: 50 },
  { lat: 49.6600, lon: -123.2100, kp: 53 },
  
  // South Tunnel Portal / Woodfibre approach
  { lat: 49.6700, lon: -123.2400, kp: 56, label: 'Tunnel Portal (South)' }
]

const egpWoodfibreRoute = [
  // South Tunnel Portal
  { lat: 49.6700, lon: -123.2400, kp: 56, label: 'Tunnel Exit' },
  
  // Woodfibre LNG Delivery Station
  { lat: 49.6750, lon: -123.2550, kp: 57, label: 'Woodfibre LNG Station' }
]

// Combined full route for display
const egpFullRoute = [
  ...egpMainlineRoute,
  ...egpTunnelRoute.slice(1), // Skip duplicate portal point
  ...egpWoodfibreRoute.slice(1) // Skip duplicate exit point
]

// Legacy routes for backward compatibility
const demoPipelineRoute = egpFullRoute
const northernPipelineRoute = egpFullRoute

// Parse KP string to km value
function parseKPToKm(kpString) {
  if (!kpString) return null
  const str = String(kpString).trim()
  
  if (str.includes('+')) {
    const [km, m] = str.split('+')
    return (parseInt(km) || 0) + (parseInt(m) || 0) / 1000
  }
  
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

// Interpolate position along route for a given KP
function interpolatePosition(route, targetKP) {
  for (let i = 0; i < route.length - 1; i++) {
    const start = route[i]
    const end = route[i + 1]
    
    if (targetKP >= start.kp && targetKP <= end.kp) {
      const ratio = (targetKP - start.kp) / (end.kp - start.kp)
      return {
        lat: start.lat + (end.lat - start.lat) * ratio,
        lon: start.lon + (end.lon - start.lon) * ratio
      }
    }
  }
  if (targetKP > route[route.length - 1].kp) {
    return { lat: route[route.length - 1].lat, lon: route[route.length - 1].lon }
  }
  return { lat: route[0].lat, lon: route[0].lon }
}

// Find nearest KP from GPS coordinates
function findNearestKP(lat, lon, route) {
  let nearestKP = null
  let minDistance = Infinity
  
  for (let kp = 0; kp <= route[route.length - 1].kp; kp += 0.5) {
    const position = interpolatePosition(route, kp)
    if (position) {
      const distance = getDistanceKm(lat, lon, position.lat, position.lon)
      if (distance < minDistance) {
        minDistance = distance
        nearestKP = { kp, distance, lat: position.lat, lon: position.lon }
      }
    }
  }
  
  return nearestKP
}

// Haversine formula
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Format KP for display
function formatKP(kp) {
  const km = Math.floor(kp)
  const m = Math.round((kp - km) * 1000)
  return `${km}+${m.toString().padStart(3, '0')}`
}

// Component to fit bounds
function FitBounds({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30] })
    }
  }, [bounds, map])
  return null
}

export default function MiniMapWidget({ 
  startKP, 
  endKP, 
  pipeline = 'south',
  onKPSync,
  height = '250px'
}) {
  const [expanded, setExpanded] = useState(true)
  const [userLocation, setUserLocation] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState(null)
  const [gpsKP, setGpsKP] = useState(null)

  // Create icons using useMemo to avoid recreation on each render
  const workAreaIcon = useMemo(() => L.divIcon({
    className: 'work-area-marker',
    html: '<div style="background-color:#28a745;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.4);"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10]
  }), [])

  const userLocationIcon = useMemo(() => L.divIcon({
    className: 'user-location',
    html: '<div style="background-color:#007bff;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 2px #007bff,0 2px 8px rgba(0,0,0,0.3);"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10]
  }), [])

  // Select route based on pipeline
  const route = pipeline === 'north' ? northernPipelineRoute : demoPipelineRoute
  const routeCoords = route.map(p => [p.lat, p.lon])

  // Calculate work area positions
  const startKPValue = parseKPToKm(startKP)
  const endKPValue = parseKPToKm(endKP)
  
  const startPosition = startKPValue !== null ? interpolatePosition(route, startKPValue) : null
  const endPosition = endKPValue !== null ? interpolatePosition(route, endKPValue) : null

  // Calculate center and bounds
  let center = [49.50, -123.00] // Default: EGP project area (Squamish)
  let bounds = null
  
  if (startPosition && endPosition) {
    center = [
      (startPosition.lat + endPosition.lat) / 2,
      (startPosition.lon + endPosition.lon) / 2
    ]
    bounds = [
      [startPosition.lat, startPosition.lon],
      [endPosition.lat, endPosition.lon]
    ]
  } else if (startPosition) {
    center = [startPosition.lat, startPosition.lon]
  } else if (endPosition) {
    center = [endPosition.lat, endPosition.lon]
  }

  // Get user GPS location
  const getUserLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('GPS not supported')
      return
    }

    setLocating(true)
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy
        }
        setUserLocation(loc)
        
        // Find nearest KP
        const nearest = findNearestKP(loc.lat, loc.lon, route)
        setGpsKP(nearest)
        
        // Callback to parent
        if (onKPSync && nearest) {
          onKPSync({
            kp: nearest.kp,
            kpFormatted: formatKP(nearest.kp),
            distance: nearest.distance,
            lat: loc.lat,
            lon: loc.lon
          })
        }
        
        setLocating(false)
      },
      (error) => {
        setLocationError(error.message)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  return (
    <div style={{ 
      border: '1px solid #dee2e6', 
      borderRadius: '8px', 
      overflow: 'hidden',
      backgroundColor: 'white'
    }}>
      {/* Header */}
      <div 
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '10px 15px',
          backgroundColor: expanded ? '#003366' : '#f8f9fa',
          color: expanded ? 'white' : '#333',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: expanded ? '1px solid #dee2e6' : 'none'
        }}
      >
        <span style={{ fontWeight: 'bold', fontSize: '13px' }}>
          🗺️ Pipeline Map {startKP && endKP ? `(KP ${startKP} - ${endKP})` : ''}
        </span>
        <span>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div style={{ position: 'relative' }}>
          {/* Controls */}
          <div style={{ 
            padding: '10px', 
            borderBottom: '1px solid #eee',
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={getUserLocation}
              disabled={locating}
              style={{
                padding: '6px 12px',
                backgroundColor: locating ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: locating ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              {locating ? '📡 Locating...' : '📍 Sync GPS'}
            </button>

            {gpsKP && (
              <div style={{ 
                padding: '5px 10px', 
                backgroundColor: '#d4edda', 
                borderRadius: '4px',
                fontSize: '12px',
                color: '#155724'
              }}>
                <strong>GPS KP: {formatKP(gpsKP.kp)}</strong>
                <span style={{ marginLeft: '8px', opacity: 0.8 }}>
                  ({(gpsKP.distance * 1000).toFixed(0)}m from ROW)
                </span>
              </div>
            )}

            {locationError && (
              <div style={{ 
                padding: '5px 10px', 
                backgroundColor: '#f8d7da', 
                borderRadius: '4px',
                fontSize: '11px',
                color: '#721c24'
              }}>
                ⚠️ {locationError}
              </div>
            )}
          </div>

          {/* Map */}
          <MapContainer
            center={center}
            zoom={8}
            style={{ height, width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri"
            />
            
            {/* Labels overlay */}
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              attribution=""
            />

            {/* Fit to work area */}
            {bounds && <FitBounds bounds={bounds} />}

            {/* Pipeline Route */}
            <Polyline
              positions={routeCoords}
              pathOptions={{
                color: '#ff6600',
                weight: 4,
                opacity: 0.7
              }}
            />

            {/* Work Area Highlight (if start and end KP are set) */}
            {startPosition && endPosition && (
              <Polyline
                positions={[
                  [startPosition.lat, startPosition.lon],
                  [endPosition.lat, endPosition.lon]
                ]}
                pathOptions={{
                  color: '#28a745',
                  weight: 8,
                  opacity: 0.9
                }}
              />
            )}

            {/* Start KP Marker */}
            {startPosition && (
              <Marker position={[startPosition.lat, startPosition.lon]} icon={workAreaIcon}>
                <Popup>
                  <div style={{ textAlign: 'center' }}>
                    <strong>Start: KP {startKP}</strong>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* End KP Marker */}
            {endPosition && (
              <Marker position={[endPosition.lat, endPosition.lon]} icon={workAreaIcon}>
                <Popup>
                  <div style={{ textAlign: 'center' }}>
                    <strong>End: KP {endKP}</strong>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* User Location */}
            {userLocation && (
              <>
                <Circle
                  center={[userLocation.lat, userLocation.lon]}
                  radius={userLocation.accuracy || 50}
                  pathOptions={{
                    color: '#007bff',
                    fillColor: '#007bff',
                    fillOpacity: 0.15,
                    weight: 1
                  }}
                />
                <Marker position={[userLocation.lat, userLocation.lon]} icon={userLocationIcon}>
                  <Popup>
                    <div style={{ textAlign: 'center' }}>
                      <strong>Your Location</strong>
                      <br />
                      <span style={{ fontSize: '11px' }}>
                        {gpsKP && `Nearest: KP ${formatKP(gpsKP.kp)}`}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              </>
            )}
          </MapContainer>

          {/* Legend */}
          <div style={{ 
            padding: '8px 10px', 
            backgroundColor: '#f8f9fa', 
            fontSize: '11px',
            display: 'flex',
            gap: '15px',
            borderTop: '1px solid #eee'
          }}>
            <span><span style={{ color: '#ff6600' }}>━━</span> Pipeline Route</span>
            <span><span style={{ color: '#28a745' }}>━━</span> Today's Work Area</span>
            <span><span style={{ color: '#007bff' }}>●</span> Your Location</span>
          </div>
        </div>
      )}

      {/* CSS for markers */}
      <style>{`
        .work-area-marker, .user-location {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  )
}
