// PipelineMap.jsx - Interactive Pipeline Map Component
// Requires: npm install leaflet react-leaflet

import React, { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default marker icons in Leaflet + Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom marker icons
const createCustomIcon = (color, label) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 30px;
        height: 30px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="
          transform: rotate(45deg);
          color: white;
          font-weight: bold;
          font-size: 10px;
        ">${label}</span>
      </div>
    `,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42]
  })
}

const kpMarkerIcon = L.divIcon({
  className: 'kp-marker',
  html: `
    <div style="
      background-color: #ffc107;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid #856404;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    "></div>
  `,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  popupAnchor: [0, -8]
})

const userLocationIcon = L.divIcon({
  className: 'user-location',
  html: `
    <div style="
      background-color: #007bff;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 4px solid white;
      box-shadow: 0 0 0 2px #007bff, 0 2px 10px rgba(0,0,0,0.3);
      animation: pulse 2s infinite;
    "></div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -12]
})

// Demo Pipeline Locations (from constants.js)
const pipelineLocations = {
  'Pipeline A - Edmonton Hub': { lat: 53.5461, lon: -113.4938, name: 'Edmonton, AB', kpStart: 0 },
  'Pipeline B - Calgary Terminal': { lat: 51.0447, lon: -114.0719, name: 'Calgary, AB', kpStart: 280 },
  'Pipeline C - Fort McMurray': { lat: 56.7267, lon: -111.3790, name: 'Fort McMurray, AB', kpStart: 0 }
}

// Demo pipeline route (Edmonton to Calgary with waypoints)
// This simulates a ~280km pipeline route
const demoPipelineRoute = [
  { lat: 53.5461, lon: -113.4938, kp: 0 },      // Edmonton
  { lat: 53.3000, lon: -113.6000, kp: 30 },     // South of Edmonton
  { lat: 53.0000, lon: -113.8000, kp: 65 },     // Wetaskiwin area
  { lat: 52.7000, lon: -113.9000, kp: 100 },    // Ponoka area
  { lat: 52.2700, lon: -113.8100, kp: 140 },    // Red Deer area
  { lat: 51.9000, lon: -113.9000, kp: 180 },    // Innisfail area
  { lat: 51.5500, lon: -114.0500, kp: 220 },    // Airdrie area
  { lat: 51.0447, lon: -114.0719, kp: 280 }     // Calgary
]

// Northern pipeline route (Edmonton to Fort McMurray)
const northernPipelineRoute = [
  { lat: 53.5461, lon: -113.4938, kp: 0 },      // Edmonton
  { lat: 54.0000, lon: -113.2000, kp: 50 },     // North of Edmonton
  { lat: 54.5000, lon: -112.8000, kp: 105 },    // Athabasca area
  { lat: 55.1500, lon: -112.5000, kp: 180 },    // Lac La Biche area
  { lat: 55.8000, lon: -111.8000, kp: 260 },    // Anzac area
  { lat: 56.7267, lon: -111.3790, kp: 350 }     // Fort McMurray
]

// Generate KP markers along a route
function generateKPMarkers(route, interval = 10) {
  const markers = []
  
  for (let kp = 0; kp <= route[route.length - 1].kp; kp += interval) {
    // Find position along route for this KP
    const position = interpolatePosition(route, kp)
    if (position) {
      markers.push({ ...position, kp })
    }
  }
  
  return markers
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
  return null
}

// Calculate nearest KP from a clicked point
function findNearestKP(clickLat, clickLon, route) {
  let nearestKP = null
  let minDistance = Infinity
  
  // Check every 0.5 KP for precision
  for (let kp = 0; kp <= route[route.length - 1].kp; kp += 0.5) {
    const position = interpolatePosition(route, kp)
    if (position) {
      const distance = getDistanceKm(clickLat, clickLon, position.lat, position.lon)
      if (distance < minDistance) {
        minDistance = distance
        nearestKP = { kp, distance, lat: position.lat, lon: position.lon }
      }
    }
  }
  
  return nearestKP
}

// Haversine formula to calculate distance between two points
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371 // Earth's radius in km
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

// Component to handle map clicks
function MapClickHandler({ onMapClick, selectedPipeline }) {
  useMapEvents({
    click: (e) => {
      const route = selectedPipeline === 'north' ? northernPipelineRoute : demoPipelineRoute
      const nearestKP = findNearestKP(e.latlng.lat, e.latlng.lng, route)
      onMapClick(e.latlng, nearestKP)
    }
  })
  return null
}

// Component to fly to user location
function FlyToLocation({ position }) {
  const map = useMap()
  useEffect(() => {
    if (position) {
      map.flyTo([position.lat, position.lon], 14, { duration: 1.5 })
    }
  }, [position, map])
  return null
}

// Main PipelineMap Component
export default function PipelineMap({ 
  height = '500px',
  showKPMarkers = true,
  kpInterval = 20,
  onKPClick,
  initialCenter,
  initialZoom = 7
}) {
  const [mapStyle, setMapStyle] = useState('satellite') // 'satellite' | 'street' | 'topo'
  const [userLocation, setUserLocation] = useState(null)
  const [locatingUser, setLocatingUser] = useState(false)
  const [locationError, setLocationError] = useState(null)
  const [clickedPoint, setClickedPoint] = useState(null)
  const [nearestKP, setNearestKP] = useState(null)
  const [selectedPipeline, setSelectedPipeline] = useState('south') // 'south' | 'north'
  const [showROWBuffer, setShowROWBuffer] = useState(true)

  // Tile layer URLs
  const tileLayers = {
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri'
    },
    street: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors'
    },
    topo: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri'
    }
  }

  // Get current pipeline route
  const currentRoute = selectedPipeline === 'north' ? northernPipelineRoute : demoPipelineRoute
  const routeCoords = currentRoute.map(p => [p.lat, p.lon])
  const kpMarkers = showKPMarkers ? generateKPMarkers(currentRoute, kpInterval) : []

  // Get user's GPS location
  const getUserLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser')
      return
    }

    setLocatingUser(true)
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        setUserLocation({
          lat: latitude,
          lon: longitude,
          accuracy: accuracy
        })
        setLocatingUser(false)

        // Check if user is near the pipeline
        const nearestKP = findNearestKP(latitude, longitude, currentRoute)
        if (nearestKP && nearestKP.distance < 1) { // Within 1km
          console.log(`📍 User is near KP ${formatKP(nearestKP.kp)} (${(nearestKP.distance * 1000).toFixed(0)}m from ROW)`)
        }
      },
      (error) => {
        setLocatingUser(false)
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location permission denied. To re-enable: tap the lock/settings icon in your browser address bar → set Location to Allow → then reload the page.')
            break
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information unavailable.')
            break
          case error.TIMEOUT:
            setLocationError('Location request timed out.')
            break
          default:
            setLocationError('An unknown error occurred.')
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
  }

  // Handle map click
  const handleMapClick = (latlng, nearestKPResult) => {
    setClickedPoint(latlng)
    setNearestKP(nearestKPResult)
    
    if (onKPClick && nearestKPResult) {
      onKPClick(nearestKPResult)
    }
  }

  // Default center (Edmonton)
  const center = initialCenter || [53.5461, -113.4938]

  return (
    <div style={{ position: 'relative' }}>
      {/* Map Controls */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {/* Map Style Selector */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          padding: '8px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '5px', color: '#333' }}>Map Style</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['satellite', 'street', 'topo'].map(style => (
              <button
                key={style}
                onClick={() => setMapStyle(style)}
                style={{
                  padding: '6px 10px',
                  fontSize: '11px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: mapStyle === style ? '#007bff' : '#e9ecef',
                  color: mapStyle === style ? 'white' : '#333',
                  textTransform: 'capitalize'
                }}
              >
                {style === 'topo' ? 'Terrain' : style}
              </button>
            ))}
          </div>
        </div>

        {/* Pipeline Selector */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          padding: '8px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '5px', color: '#333' }}>Pipeline</div>
          <select
            value={selectedPipeline}
            onChange={(e) => setSelectedPipeline(e.target.value)}
            style={{
              padding: '6px',
              fontSize: '11px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              width: '100%'
            }}
          >
            <option value="south">Edmonton → Calgary (280km)</option>
            <option value="north">Edmonton → Ft McMurray (350km)</option>
          </select>
        </div>

        {/* ROW Buffer Toggle */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          padding: '8px'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showROWBuffer}
              onChange={(e) => setShowROWBuffer(e.target.checked)}
            />
            Show ROW Buffer (30m)
          </label>
        </div>

        {/* GPS Location Button */}
        <button
          onClick={getUserLocation}
          disabled={locatingUser}
          style={{
            padding: '10px',
            backgroundColor: locatingUser ? '#6c757d' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: locatingUser ? 'wait' : 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}
        >
          {locatingUser ? (
            <>⏳ Locating...</>
          ) : (
            <>📍 My Location</>
          )}
        </button>

        {locationError && (
          <div style={{
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '8px',
            borderRadius: '6px',
            fontSize: '11px',
            maxWidth: '150px'
          }}>
            {locationError}
          </div>
        )}
      </div>

      {/* Nearest KP Info Panel */}
      {nearestKP && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          zIndex: 1000,
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          padding: '15px',
          minWidth: '200px'
        }}>
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '5px' }}>NEAREST CHAINAGE</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#003366' }}>
            KP {formatKP(nearestKP.kp)}
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
            {nearestKP.distance < 1 
              ? `${(nearestKP.distance * 1000).toFixed(0)}m from ROW`
              : `${nearestKP.distance.toFixed(2)}km from ROW`
            }
          </div>
          {nearestKP.distance > 5 && (
            <div style={{ 
              fontSize: '11px', 
              color: '#dc3545', 
              marginTop: '8px',
              padding: '5px 8px',
              backgroundColor: '#f8d7da',
              borderRadius: '4px'
            }}>
              ⚠️ Point is far from pipeline ROW
            </div>
          )}
          <button
            onClick={() => {
              setClickedPoint(null)
              setNearestKP(null)
            }}
            style={{
              marginTop: '10px',
              padding: '5px 10px',
              fontSize: '11px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* User Location Info */}
      {userLocation && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          backgroundColor: '#d4edda',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          padding: '12px',
          fontSize: '12px'
        }}>
          <div style={{ fontWeight: 'bold', color: '#155724', marginBottom: '3px' }}>📍 Your Location</div>
          <div style={{ color: '#155724' }}>
            {userLocation.lat.toFixed(5)}, {userLocation.lon.toFixed(5)}
          </div>
          <div style={{ color: '#666', fontSize: '10px', marginTop: '3px' }}>
            Accuracy: ±{userLocation.accuracy?.toFixed(0) || '?'}m
          </div>
        </div>
      )}

      {/* The Map */}
      <MapContainer
        center={center}
        zoom={initialZoom}
        style={{ height, width: '100%', borderRadius: '8px' }}
      >
        {/* Tile Layer */}
        <TileLayer
          key={mapStyle}
          url={tileLayers[mapStyle].url}
          attribution={tileLayers[mapStyle].attribution}
        />

        {/* Labels overlay for satellite view */}
        {mapStyle === 'satellite' && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            attribution=""
          />
        )}

        {/* Click Handler */}
        <MapClickHandler onMapClick={handleMapClick} selectedPipeline={selectedPipeline} />

        {/* Fly to user location */}
        {userLocation && <FlyToLocation position={userLocation} />}

        {/* Pipeline Route */}
        <Polyline
          positions={routeCoords}
          pathOptions={{
            color: '#ff6600',
            weight: 5,
            opacity: 0.8
          }}
        />

        {/* ROW Buffer (30m each side = 60m total) */}
        {showROWBuffer && routeCoords.map((coord, idx) => (
          <Circle
            key={`row-${idx}`}
            center={coord}
            radius={30}
            pathOptions={{
              color: '#ff6600',
              fillColor: '#ff6600',
              fillOpacity: 0.1,
              weight: 0
            }}
          />
        ))}

        {/* Terminal Markers */}
        {Object.entries(pipelineLocations).map(([key, loc]) => (
          <Marker
            key={key}
            position={[loc.lat, loc.lon]}
            icon={createCustomIcon(
              key.includes('Edmonton') ? '#28a745' : 
              key.includes('Calgary') ? '#dc3545' : '#17a2b8',
              key.includes('Edmonton') ? 'E' : 
              key.includes('Calgary') ? 'C' : 'F'
            )}
          >
            <Popup>
              <div style={{ textAlign: 'center' }}>
                <strong>{key}</strong>
                <br />
                <span style={{ color: '#666' }}>{loc.name}</span>
                <br />
                <span style={{ fontSize: '12px', color: '#007bff' }}>KP {formatKP(loc.kpStart)}</span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* KP Markers */}
        {kpMarkers.filter(m => m.kp % kpInterval === 0).map((marker) => (
          <Marker
            key={`kp-${marker.kp}`}
            position={[marker.lat, marker.lon]}
            icon={kpMarkerIcon}
          >
            <Popup>
              <div style={{ textAlign: 'center', fontWeight: 'bold' }}>
                KP {formatKP(marker.kp)}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Clicked Point */}
        {clickedPoint && (
          <Circle
            center={[clickedPoint.lat, clickedPoint.lng]}
            radius={50}
            pathOptions={{
              color: '#007bff',
              fillColor: '#007bff',
              fillOpacity: 0.3
            }}
          />
        )}

        {/* User Location Marker */}
        {userLocation && (
          <>
            {/* Accuracy circle */}
            <Circle
              center={[userLocation.lat, userLocation.lon]}
              radius={userLocation.accuracy || 50}
              pathOptions={{
                color: '#007bff',
                fillColor: '#007bff',
                fillOpacity: 0.1,
                weight: 1
              }}
            />
            {/* User marker */}
            <Marker
              position={[userLocation.lat, userLocation.lon]}
              icon={userLocationIcon}
            >
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <strong>Your Location</strong>
                  <br />
                  <span style={{ fontSize: '11px', color: '#666' }}>
                    Accuracy: ±{userLocation.accuracy?.toFixed(0) || '?'}m
                  </span>
                </div>
              </Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      {/* CSS for animations */}
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.7); }
          70% { box-shadow: 0 0 0 15px rgba(0, 123, 255, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0); }
        }
        .custom-marker {
          background: transparent !important;
          border: none !important;
        }
        .kp-marker {
          background: transparent !important;
          border: none !important;
        }
        .user-location {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 8px;
        }
      `}</style>
    </div>
  )
}
