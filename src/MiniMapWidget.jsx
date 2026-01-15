// MiniMapWidget.jsx - Compact Pipeline Map for Inspector Report
// Shows current work area and GPS location with REAL EGP survey data

import React, { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, CircleMarker, Polygon, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Import actual EGP route data extracted from FortisBC KMZ files
import EGP_ROUTE_DATA from './egpRouteData.js'

// =====================================================
// EGP PIPELINE ROUTE DATA (from FortisBC Provisional Asbuilt KMZ)
// North Line: KP 0+000 to KP 38+470
// 774 centerline points, 367 KP markers, 451 welds, 248 bends
// =====================================================

// Convert route coordinates to format used by map
const egpRouteCoordinates = EGP_ROUTE_DATA.route.coordinates

// KP markers from survey data
const egpKPMarkers = EGP_ROUTE_DATA.kpMarkers

// Welds and bends for display
const egpWelds = EGP_ROUTE_DATA.welds
const egpBends = EGP_ROUTE_DATA.bends

// Create route array with KP values for interpolation
const egpFullRoute = egpKPMarkers.map(m => ({
  lat: m.lat,
  lon: m.lon,
  kp: m.kp,
  label: m.name
}))

// Legacy routes for backward compatibility
const demoPipelineRoute = egpFullRoute
const northernPipelineRoute = egpFullRoute

// Calculate ROW buffer polygon (30m on each side of centerline)
// Returns array of [lat, lon] pairs forming a polygon
function calculateROWBuffer(routeCoords, bufferMeters = 30) {
  if (!routeCoords || routeCoords.length < 2) return []
  
  const leftSide = []
  const rightSide = []
  
  // Convert meters to approximate degrees (at ~49° latitude, 1° ≈ 111km for lat, ~73km for lon)
  const latOffset = bufferMeters / 111000
  const lonOffset = bufferMeters / 73000 // Adjusted for latitude
  
  for (let i = 0; i < routeCoords.length; i++) {
    const curr = routeCoords[i]
    
    // Calculate perpendicular direction
    let bearing = 0
    if (i < routeCoords.length - 1) {
      const next = routeCoords[i + 1]
      bearing = Math.atan2(next.lon - curr.lon, next.lat - curr.lat)
    } else if (i > 0) {
      const prev = routeCoords[i - 1]
      bearing = Math.atan2(curr.lon - prev.lon, curr.lat - prev.lat)
    }
    
    // Perpendicular offset (90 degrees)
    const perpLat = Math.cos(bearing + Math.PI / 2) * latOffset
    const perpLon = Math.sin(bearing + Math.PI / 2) * lonOffset
    
    leftSide.push([curr.lat + perpLat, curr.lon + perpLon])
    rightSide.push([curr.lat - perpLat, curr.lon - perpLon])
  }
  
  // Create closed polygon: left side forward, right side backward
  return [...leftSide, ...rightSide.reverse(), leftSide[0]]
}

// Pre-calculate ROW buffer polygon
const rowBufferPolygon = calculateROWBuffer(egpRouteCoordinates, 30)

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
  const [showWelds, setShowWelds] = useState(false)
  const [showBends, setShowBends] = useState(false)
  const [showKPMarkers, setShowKPMarkers] = useState(true)
  const [showROW, setShowROW] = useState(true)

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

  // Select route based on pipeline (both use EGP data now)
  const route = egpFullRoute
  
  // Use actual centerline coordinates for the polyline (774 points)
  const routeCoords = egpRouteCoordinates.map(p => [p.lat, p.lon])

  // Calculate work area positions
  const startKPValue = parseKPToKm(startKP)
  const endKPValue = parseKPToKm(endKP)
  
  const startPosition = startKPValue !== null ? interpolatePosition(route, startKPValue) : null
  const endPosition = endKPValue !== null ? interpolatePosition(route, endKPValue) : null

  // Calculate center and bounds
  let center = [49.60, -123.00] // Default: EGP North Line mid-point
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

          {/* Layer Toggles */}
          <div style={{ 
            padding: '8px 10px', 
            borderBottom: '1px solid #eee',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            fontSize: '11px',
            backgroundColor: '#f8f9fa'
          }}>
            <span style={{ fontWeight: 'bold', color: '#666' }}>Layers:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showKPMarkers} 
                onChange={(e) => setShowKPMarkers(e.target.checked)}
              />
              <span style={{ color: '#007bff' }}>KP Markers ({egpKPMarkers.length})</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showWelds} 
                onChange={(e) => setShowWelds(e.target.checked)}
              />
              <span style={{ color: '#dc3545' }}>Welds ({egpWelds.length})</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showBends} 
                onChange={(e) => setShowBends(e.target.checked)}
              />
              <span style={{ color: '#fd7e14' }}>Bends ({egpBends.length})</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showROW} 
                onChange={(e) => setShowROW(e.target.checked)}
              />
              <span style={{ color: '#9b59b6' }}>ROW (30m)</span>
            </label>
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

            {/* ROW Buffer (30m corridor) */}
            {showROW && rowBufferPolygon.length > 0 && (
              <Polygon
                positions={rowBufferPolygon}
                pathOptions={{
                  color: '#9b59b6',
                  weight: 1,
                  fillColor: '#9b59b6',
                  fillOpacity: 0.15,
                  dashArray: '5, 5'
                }}
              />
            )}

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

            {/* KP Markers from survey data */}
            {showKPMarkers && egpKPMarkers
              .filter((_, idx) => idx % 10 === 0) // Show every 10th to avoid clutter (every 1km)
              .map((kp, idx) => (
                <CircleMarker
                  key={`kp-${idx}`}
                  center={[kp.lat, kp.lon]}
                  radius={4}
                  pathOptions={{
                    fillColor: '#007bff',
                    color: '#fff',
                    weight: 1,
                    fillOpacity: 0.8
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: '11px', minWidth: '160px' }}>
                      <div style={{ fontWeight: 'bold', color: '#007bff', marginBottom: '5px', borderBottom: '1px solid #eee', paddingBottom: '3px' }}>
                        🔵 KP MARKER
                      </div>
                      <table style={{ width: '100%', fontSize: '11px' }}>
                        <tbody>
                          <tr><td style={{ color: '#666' }}>KP:</td><td><strong>{kp.name}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>Km:</td><td>{kp.kp.toFixed(1)}</td></tr>
                          <tr><td style={{ color: '#666' }}>Lat:</td><td>{kp.lat.toFixed(6)}</td></tr>
                          <tr><td style={{ color: '#666' }}>Lon:</td><td>{kp.lon.toFixed(6)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </Popup>
                </CircleMarker>
              ))
            }

            {/* Welds from asbuilt data */}
            {showWelds && egpWelds.map((weld, idx) => {
              // Parse station to KP (e.g., "38+374.58" -> KP 38.374)
              const stationParts = weld.station.split('+')
              const kpValue = stationParts.length === 2 
                ? parseFloat(stationParts[0]) + parseFloat(stationParts[1]) / 1000 
                : 0
              // Parse weld type from description (e.g., "Weld-Field/CN-SC-0002")
              const descParts = weld.description.split('/')
              const weldType = descParts[0] || 'Unknown'
              const weldId = descParts[1] || ''
              
              return (
                <CircleMarker
                  key={`weld-${idx}`}
                  center={[weld.lat, weld.lon]}
                  radius={3}
                  pathOptions={{
                    fillColor: '#dc3545',
                    color: '#fff',
                    weight: 1,
                    fillOpacity: 0.9
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: '11px', minWidth: '180px' }}>
                      <div style={{ fontWeight: 'bold', color: '#dc3545', marginBottom: '5px', borderBottom: '1px solid #eee', paddingBottom: '3px' }}>
                        🔴 WELD
                      </div>
                      <table style={{ width: '100%', fontSize: '11px' }}>
                        <tbody>
                          <tr><td style={{ color: '#666' }}>Station:</td><td><strong>{weld.station}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>KP:</td><td><strong>{kpValue.toFixed(3)}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>Type:</td><td>{weldType}</td></tr>
                          {weldId && <tr><td style={{ color: '#666' }}>Weld ID:</td><td>{weldId}</td></tr>}
                          <tr><td style={{ color: '#666' }}>Lat:</td><td>{weld.lat.toFixed(6)}</td></tr>
                          <tr><td style={{ color: '#666' }}>Lon:</td><td>{weld.lon.toFixed(6)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}

            {/* Bends from asbuilt data */}
            {showBends && egpBends.map((bend, idx) => {
              // Parse station to KP (e.g., "32+674.54" -> KP 32.674)
              const stationParts = bend.station.split('+')
              const kpValue = stationParts.length === 2 
                ? parseFloat(stationParts[0]) + parseFloat(stationParts[1]) / 1000 
                : 0
              // Parse bend type from description (e.g., "Bend-Left/26d15m")
              const descParts = bend.description.split('/')
              const bendType = descParts[0] || 'Unknown'
              const bendAngle = descParts[1] || ''
              // Determine direction
              const direction = bendType.includes('Left') ? '← Left' 
                : bendType.includes('Right') ? '→ Right'
                : bendType.includes('Over') ? '↑ Over'
                : bendType.includes('Under') ? '↓ Under'
                : bendType
              
              return (
                <CircleMarker
                  key={`bend-${idx}`}
                  center={[bend.lat, bend.lon]}
                  radius={4}
                  pathOptions={{
                    fillColor: '#fd7e14',
                    color: '#fff',
                    weight: 1,
                    fillOpacity: 0.9
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: '11px', minWidth: '180px' }}>
                      <div style={{ fontWeight: 'bold', color: '#fd7e14', marginBottom: '5px', borderBottom: '1px solid #eee', paddingBottom: '3px' }}>
                        🟠 BEND
                      </div>
                      <table style={{ width: '100%', fontSize: '11px' }}>
                        <tbody>
                          <tr><td style={{ color: '#666' }}>Station:</td><td><strong>{bend.station}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>KP:</td><td><strong>{kpValue.toFixed(3)}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>Direction:</td><td>{direction}</td></tr>
                          {bendAngle && <tr><td style={{ color: '#666' }}>Angle:</td><td><strong>{bendAngle}</strong></td></tr>}
                          <tr><td style={{ color: '#666' }}>Lat:</td><td>{bend.lat.toFixed(6)}</td></tr>
                          <tr><td style={{ color: '#666' }}>Lon:</td><td>{bend.lon.toFixed(6)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}

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
            gap: '12px',
            flexWrap: 'wrap',
            borderTop: '1px solid #eee'
          }}>
            <span><span style={{ color: '#9b59b6', opacity: 0.5 }}>▓▓</span> ROW (30m)</span>
            <span><span style={{ color: '#ff6600' }}>━━</span> Centerline</span>
            <span><span style={{ color: '#28a745' }}>━━</span> Work Area</span>
            <span><span style={{ color: '#007bff' }}>●</span> KP Markers</span>
            <span><span style={{ color: '#dc3545' }}>●</span> Welds</span>
            <span><span style={{ color: '#fd7e14' }}>●</span> Bends</span>
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
