// MiniMapWidget.jsx - Compact Pipeline Map for Inspector Report
// Shows current work area and GPS location with pipeline route data from DB

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, CircleMarker, Polygon, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabase'
import { useOrgQuery } from './utils/queryHelpers.js'

// Import regulatory zone data for overlay
import { REGULATORY_ZONES, ZONE_TYPE_CONFIG } from './regulatoryZones.js'

// Empty defaults for route data while loading
const EMPTY_ROUTE_DATA = {
  centerline: [],
  kpMarkers: [],
  welds: [],
  bends: [],
  footprint: [],
  openEnds: [],
  boreFaces: [],
  sagBends: [],
  kpRoute: [],
  defaultCenter: [49.60, -123.00],
}

// Hook: load pipeline route data from Supabase
function useRouteData(organizationId) {
  const cacheRef = useRef({ orgId: null, data: null })
  const [routeData, setRouteData] = useState(EMPTY_ROUTE_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [alignmentStatus, setAlignmentStatus] = useState(null) // 'loaded' | 'missing'
  const [constructionStatus, setConstructionStatus] = useState(null)

  useEffect(() => {
    if (!organizationId) {
      setLoading(false)
      return
    }

    // Return cached data if same org
    if (cacheRef.current.orgId === organizationId && cacheRef.current.data) {
      setRouteData(cacheRef.current.data)
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadRouteData() {
      setLoading(true)
      setError(null)
      try {
        // 1. Get active routes
        const { data: routes, error: routesErr } = await supabase
          .from('pipeline_routes')
          .select('id, name, layer_type, default_center_lat, default_center_lng')
          .eq('organization_id', organizationId)
          .eq('is_active', true)

        if (routesErr) throw routesErr
        if (cancelled) return

        const alignmentRoute = (routes || []).find(r => r.layer_type === 'alignment')
        const constructionRoute = (routes || []).find(r => r.layer_type === 'construction')

        setAlignmentStatus(alignmentRoute ? 'loaded' : 'missing')
        setConstructionStatus(constructionRoute ? 'loaded' : 'missing')

        // If no routes at all, return empty
        if (!alignmentRoute && !constructionRoute) {
          const emptyResult = { ...EMPTY_ROUTE_DATA }
          cacheRef.current = { orgId: organizationId, data: emptyResult }
          setRouteData(emptyResult)
          setLoading(false)
          return
        }

        // 2. Load all features in parallel
        const centerlineRouteId = (constructionRoute || alignmentRoute).id
        const [clRes, kpRes, wRes, bRes, fpRes, oeRes, bfRes, sbRes] = await Promise.all([
          // Centerline: prefer construction, fall back to alignment
          supabase.from('route_centerline').select('lat, lng, elevation').eq('route_id', centerlineRouteId).order('seq'),
          // KP markers: from alignment
          alignmentRoute
            ? supabase.from('route_kp_markers').select('kp, lat, lng, label').eq('route_id', alignmentRoute.id).order('kp')
            : Promise.resolve({ data: [] }),
          // Welds: from construction
          constructionRoute
            ? supabase.from('route_welds').select('weld_id, kp, lat, lng, weld_type, properties').eq('route_id', constructionRoute.id)
            : Promise.resolve({ data: [] }),
          // Bends: from construction
          constructionRoute
            ? supabase.from('route_bends').select('bend_id, kp, lat, lng, bend_type, properties').eq('route_id', constructionRoute.id)
            : Promise.resolve({ data: [] }),
          // Footprint: from alignment
          alignmentRoute
            ? supabase.from('route_footprint').select('name, polygon, properties').eq('route_id', alignmentRoute.id)
            : Promise.resolve({ data: [] }),
          // Open ends: from construction
          constructionRoute
            ? supabase.from('route_open_ends').select('name, kp, lat, lng, end_type, properties').eq('route_id', constructionRoute.id)
            : Promise.resolve({ data: [] }),
          // Bore faces: from construction
          constructionRoute
            ? supabase.from('route_bore_faces').select('name, kp, lat, lng, face_type, properties').eq('route_id', constructionRoute.id)
            : Promise.resolve({ data: [] }),
          // Sag bends: from construction
          constructionRoute
            ? supabase.from('route_sag_bends').select('name, kp, lat, lng, properties').eq('route_id', constructionRoute.id)
            : Promise.resolve({ data: [] }),
        ])

        if (cancelled) return

        // 3. Map DB fields to component fields (lng -> lon)
        const kpMarkers = (kpRes.data || []).map(m => ({
          name: m.label || `KP ${m.kp}`,
          kp: m.kp,
          lat: m.lat,
          lon: m.lng
        }))

        const kpRoute = kpMarkers.map(m => ({
          lat: m.lat,
          lon: m.lon,
          kp: m.kp,
          label: m.name
        }))

        // Default center from the route row, or first KP marker, or fallback
        const sourceRoute = constructionRoute || alignmentRoute
        let defaultCenter = [49.60, -123.00]
        if (sourceRoute?.default_center_lat && sourceRoute?.default_center_lng) {
          defaultCenter = [sourceRoute.default_center_lat, sourceRoute.default_center_lng]
        } else if (kpMarkers.length > 0) {
          const mid = kpMarkers[Math.floor(kpMarkers.length / 2)]
          defaultCenter = [mid.lat, mid.lon]
        }

        const result = {
          centerline: (clRes.data || []).map(p => ({ lat: p.lat, lon: p.lng })),
          kpMarkers,
          welds: (wRes.data || []).map(w => ({
            station: w.weld_id || '',
            lat: w.lat,
            lon: w.lng,
            description: w.properties?.description || w.weld_type || '',
            type: w.weld_type || ''
          })),
          bends: (bRes.data || []).map(b => ({
            station: b.bend_id || '',
            lat: b.lat,
            lon: b.lng,
            description: b.properties?.description || b.bend_type || '',
            type: b.bend_type || ''
          })),
          footprint: (fpRes.data || []).map(f => f.polygon || []),
          openEnds: (oeRes.data || []).map(o => ({
            station: o.name || '',
            lat: o.lat,
            lon: o.lng,
            description: o.properties?.description || '',
            type: o.end_type || ''
          })),
          boreFaces: (bfRes.data || []).map(b => ({
            station: b.name || '',
            lat: b.lat,
            lon: b.lng,
            description: b.properties?.description || '',
            type: b.face_type || ''
          })),
          sagBends: (sbRes.data || []).map(s => ({
            station: s.name || '',
            lat: s.lat,
            lon: s.lng,
            description: s.properties?.description || '',
            type: 'Bend-Sag'
          })),
          kpRoute,
          defaultCenter,
        }

        cacheRef.current = { orgId: organizationId, data: result }
        setRouteData(result)
      } catch (err) {
        console.error('MiniMapWidget: failed to load route data', err)
        if (!cancelled) setError(err.message || 'Failed to load route data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRouteData()
    return () => { cancelled = true }
  }, [organizationId])

  return { routeData, loading, error, alignmentStatus, constructionStatus }
}

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
  if (!route || route.length === 0) return null
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
  if (!route || route.length === 0) return null
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
  height = '250px',
  regulatoryZones
}) {
  const { organizationId } = useOrgQuery()
  const { routeData, loading: routeLoading, error: routeError, alignmentStatus, constructionStatus } = useRouteData(organizationId)

  const [expanded, setExpanded] = useState(true)
  const [userLocation, setUserLocation] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState(null)
  const [gpsKP, setGpsKP] = useState(null)
  const [showWelds, setShowWelds] = useState(false)
  const [showBends, setShowBends] = useState(false)
  const [showKPMarkers, setShowKPMarkers] = useState(true)
  const [showROW, setShowROW] = useState(true)
  const [showOpenEnds, setShowOpenEnds] = useState(true)
  const [showBoreFaces, setShowBoreFaces] = useState(true)
  const [showSagBends, setShowSagBends] = useState(false)
  const [showZones, setShowZones] = useState(true)
  const [zoneLegendOpen, setZoneLegendOpen] = useState(false)
  const [zoneTypeVisible, setZoneTypeVisible] = useState(() => {
    const initial = {}
    Object.keys(ZONE_TYPE_CONFIG).forEach(t => { initial[t] = true })
    return initial
  })

  // Use prop zones if provided, fall back to static import
  const zones = regulatoryZones || REGULATORY_ZONES

  // Derived data from DB route data
  const route = routeData.kpRoute               // KP markers as route for interpolation
  const routeCoords = routeData.centerline.map(p => [p.lat, p.lon])
  const pipelineStart = routeData.kpMarkers.length > 0 ? routeData.kpMarkers[0] : null
  const pipelineEnd = routeData.kpMarkers.length > 0 ? routeData.kpMarkers[routeData.kpMarkers.length - 1] : null

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

  // Pipeline start/end marker icons
  const startEndIcon = useMemo(() => L.divIcon({
    className: 'start-end-marker',
    html: '<div style="background-color:#e74c3c;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;background:white;border-radius:50%;"></div></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12]
  }), [])

  // Calculate work area positions
  const startKPValue = parseKPToKm(startKP)
  const endKPValue = parseKPToKm(endKP)

  const startPosition = startKPValue !== null && route.length > 0 ? interpolatePosition(route, startKPValue) : null
  const endPosition = endKPValue !== null && route.length > 0 ? interpolatePosition(route, endKPValue) : null

  // Calculate center and bounds
  let center = routeData.defaultCenter
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

  // Filter regulatory zones to those near the work area
  const filteredZones = useMemo(() => {
    if (startKPValue !== null && endKPValue !== null) {
      const bufferStart = startKPValue - 2
      const bufferEnd = endKPValue + 2
      return zones.filter(z => z.kp_start <= bufferEnd && z.kp_end >= bufferStart)
    }
    return zones
  }, [startKPValue, endKPValue, zones])

  // Zones that directly overlap the inspector's exact work area (for alert banner)
  const overlappingZones = useMemo(() => {
    if (startKPValue === null || endKPValue === null) return []
    return zones.filter(z => z.kp_start <= endKPValue && z.kp_end >= startKPValue)
  }, [startKPValue, endKPValue, zones])

  // Compute polyline coordinates for each filtered zone
  const zonePolylines = useMemo(() => {
    return filteredZones.map(zone => {
      const points = []
      const step = 0.1
      for (let kp = zone.kp_start; kp <= zone.kp_end; kp += step) {
        const pos = interpolatePosition(route, kp)
        if (pos) points.push([pos.lat, pos.lon])
      }
      // Always include the end point
      const endPos = interpolatePosition(route, zone.kp_end)
      if (endPos) points.push([endPos.lat, endPos.lon])
      return { ...zone, coords: points }
    })
  }, [filteredZones, route])

  // Determine alert banners for all overlapping zones (sorted by severity: red > amber > blue)
  const zoneAlerts = useMemo(() => {
    if (overlappingZones.length === 0) return []

    const alerts = []
    for (const z of overlappingZones) {
      const cfg = ZONE_TYPE_CONFIG[z.type]
      const isRed = z.status === 'CLOSED' || (z.type === 'safety' && z.status === 'ACTIVE TODAY')
      const isAmber = z.status_detail || z.status === 'PENDING'
      const isBlue = ['ACTIVE WORK', 'RESTRICTION ACTIVE', 'MONITORING', 'ACTIVE HAULING'].includes(z.status)

      if (isRed) {
        alerts.push({
          severity: 0,
          color: '#dc3545',
          bg: '#f8d7da',
          text: `You are working in: ${z.name} (${cfg.label} \u2014 ${z.status}${z.status_detail ? ' \u2014 ' + z.status_detail : ''})`
        })
      } else if (isAmber) {
        alerts.push({
          severity: 1,
          color: '#856404',
          bg: '#fff3cd',
          text: `You are working in: ${z.name} (${cfg.label} \u2014 ${z.status_detail || z.status})`
        })
      } else if (isBlue) {
        alerts.push({
          severity: 2,
          color: '#004085',
          bg: '#cce5ff',
          text: `You are working in: ${z.name} (${cfg.label} \u2014 ${z.status})`
        })
      }
    }

    // Sort by severity (red first, then amber, then blue)
    alerts.sort((a, b) => a.severity - b.severity)
    return alerts
  }, [overlappingZones])

  // Count zones per type for toggle labels
  const zoneTypeCounts = useMemo(() => {
    const counts = {}
    Object.keys(ZONE_TYPE_CONFIG).forEach(t => { counts[t] = 0 })
    filteredZones.forEach(z => { counts[z.type] = (counts[z.type] || 0) + 1 })
    return counts
  }, [filteredZones])

  // Helper: determine if a zone status should use dashed line
  const isWarningStatus = (zone) => {
    return ['PENDING', 'RESTRICTION ACTIVE', 'ACTIVE TODAY'].includes(zone.status) || !!zone.status_detail
  }

  // Status badge color
  const getStatusColor = (status) => {
    if (status === 'CLOSED' || status === 'ACTIVE TODAY') return '#F44336'
    if (status === 'PENDING') return '#FF9800'
    if (status === 'RESTRICTION ACTIVE') return '#FF9800'
    if (status === 'VALID' || status === 'OPEN') return '#4CAF50'
    return '#2196F3'
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
        
        // Find nearest KP (skip if route not loaded yet)
        const nearest = route.length > 0 ? findNearestKP(loc.lat, loc.lon, route) : null
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
            gap: '8px',
            alignItems: 'center',
            fontSize: '11px',
            backgroundColor: '#f8f9fa',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontWeight: 'bold', color: '#666', marginRight: '4px' }}>Layers:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input 
                type="checkbox" 
                checked={showKPMarkers} 
                onChange={(e) => setShowKPMarkers(e.target.checked)}
              />
              <span style={{ color: '#007bff' }}>KP ({routeData.kpMarkers.length})</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input 
                type="checkbox" 
                checked={showWelds} 
                onChange={(e) => setShowWelds(e.target.checked)}
              />
              <span style={{ color: '#dc3545' }}>Welds ({routeData.welds.length})</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input 
                type="checkbox" 
                checked={showBends} 
                onChange={(e) => setShowBends(e.target.checked)}
              />
              <span style={{ color: '#fd7e14' }}>Bends ({routeData.bends.length})</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input 
                type="checkbox" 
                checked={showROW} 
                onChange={(e) => setShowROW(e.target.checked)}
              />
              <span style={{ color: '#9b59b6' }}>Footprint ({routeData.footprint.length})</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input 
                type="checkbox" 
                checked={showOpenEnds} 
                onChange={(e) => setShowOpenEnds(e.target.checked)}
              />
              <span style={{ color: '#e74c3c' }}>Open Ends ({routeData.openEnds.length})</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input 
                type="checkbox" 
                checked={showBoreFaces} 
                onChange={(e) => setShowBoreFaces(e.target.checked)}
              />
              <span style={{ color: '#00bcd4' }}>HDD ({routeData.boreFaces.length})</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={showSagBends}
                onChange={(e) => setShowSagBends(e.target.checked)}
              />
              <span style={{ color: '#795548' }}>Sag Bends ({routeData.sagBends.length})</span>
            </label>
            <span style={{ borderLeft: '1px solid #ccc', height: '14px' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={showZones}
                onChange={(e) => setShowZones(e.target.checked)}
              />
              <span style={{ fontWeight: 'bold', color: '#333' }}>Zones ({filteredZones.length})</span>
            </label>
          </div>

          {/* Zone Alert Banners */}
          {showZones && zoneAlerts.map((alert, idx) => (
            <div key={`zone-alert-${idx}`} style={{
              padding: '8px 12px',
              backgroundColor: alert.bg,
              color: alert.color,
              fontSize: '12px',
              fontWeight: 'bold',
              borderBottom: '1px solid ' + alert.color + '33',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ fontSize: '14px' }}>{alert.color === '#dc3545' ? '\u26D4' : '\u26A0\uFE0F'}</span>
              {alert.text}
            </div>
          ))}

          {/* Loading overlay */}
          {routeLoading && (
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.7)',
              zIndex: 1001,
              pointerEvents: 'none'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '28px', height: '28px',
                  border: '3px solid #dee2e6',
                  borderTopColor: '#003366',
                  borderRadius: '50%',
                  animation: 'minimap-spin 0.8s linear infinite',
                  margin: '0 auto 8px'
                }} />
                <span style={{ fontSize: '12px', color: '#666' }}>Loading route data...</span>
              </div>
            </div>
          )}

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

            {/* Construction Footprint / ROW Boundary */}
            {showROW && routeData.footprint.map((polygon, idx) => (
              <Polygon
                key={`footprint-${idx}`}
                positions={polygon}
                pathOptions={{
                  color: '#9b59b6',
                  weight: 1,
                  fillColor: '#9b59b6',
                  fillOpacity: 0.2,
                  opacity: 0.6
                }}
              />
            ))}

            {/* Regulatory Zone Overlays (render before centerline so pipeline draws on top) */}
            {showZones && zonePolylines.map((zone, idx) => {
              if (!zoneTypeVisible[zone.type] || zone.coords.length < 2) return null
              const cfg = ZONE_TYPE_CONFIG[zone.type]
              const warning = isWarningStatus(zone)
              const isSafetyActive = zone.type === 'safety' && zone.status === 'ACTIVE TODAY'

              const popupContent = (
                <div style={{ fontSize: '11px', minWidth: '220px' }}>
                  <div style={{
                    fontWeight: 'bold',
                    color: cfg.color,
                    marginBottom: '5px',
                    borderBottom: '1px solid #eee',
                    paddingBottom: '3px',
                    fontSize: '12px'
                  }}>
                    {cfg.icon} {zone.name}
                  </div>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#666', marginBottom: '4px' }}>
                    {cfg.label}
                  </div>
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ color: '#e67e22', fontWeight: 'bold' }}>
                      KP {formatKP(zone.kp_start)} \u2014 {formatKP(zone.kp_end)}
                    </span>
                  </div>
                  <div style={{ marginBottom: '6px', lineHeight: '1.4' }}>
                    {zone.restriction}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      color: '#fff',
                      backgroundColor: getStatusColor(zone.status)
                    }}>
                      {zone.status}
                    </span>
                    {zone.status_detail && (
                      <span style={{ fontSize: '10px', color: '#e67e22', fontWeight: 'bold' }}>
                        {zone.status_detail}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '9px', color: '#999', marginTop: '4px' }}>
                    {zone.authority}
                  </div>
                </div>
              )

              return (
                <React.Fragment key={`zone-${idx}`}>
                  {/* Thick semi-transparent highlight */}
                  <Polyline
                    positions={zone.coords}
                    pathOptions={{
                      color: cfg.color,
                      weight: 14,
                      opacity: 0.25,
                      lineCap: 'round'
                    }}
                  >
                    <Popup>{popupContent}</Popup>
                  </Polyline>
                  {/* Border line */}
                  <Polyline
                    positions={zone.coords}
                    pathOptions={{
                      color: cfg.color,
                      weight: 4,
                      opacity: warning ? 0.9 : 0.7,
                      dashArray: warning ? '8, 6' : undefined,
                      lineCap: 'round',
                      className: isSafetyActive ? 'zone-pulse' : undefined
                    }}
                  >
                    <Popup>{popupContent}</Popup>
                  </Polyline>
                </React.Fragment>
              )
            })}

            {/* Pipeline Route */}
            <Polyline
              positions={routeCoords}
              pathOptions={{
                color: '#ff6600',
                weight: 4,
                opacity: 0.7
              }}
            />

            {/* Pipeline Start Marker (KP 0) */}
            {pipelineStart && (
              <Marker position={[pipelineStart.lat, pipelineStart.lon]} icon={startEndIcon}>
                <Popup>
                  <div style={{ fontSize: '12px', textAlign: 'center', minWidth: '150px' }}>
                    <div style={{ fontWeight: 'bold', color: '#e74c3c', marginBottom: '5px' }}>
                      🚩 PIPELINE START
                    </div>
                    <div><strong>{pipelineStart.name}</strong></div>
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '3px' }}>
                      Lat: {pipelineStart.lat.toFixed(6)}<br/>
                      Lon: {pipelineStart.lon.toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Pipeline End Marker (KP 38.47) */}
            {pipelineEnd && (
              <Marker position={[pipelineEnd.lat, pipelineEnd.lon]} icon={startEndIcon}>
                <Popup>
                  <div style={{ fontSize: '12px', textAlign: 'center', minWidth: '150px' }}>
                    <div style={{ fontWeight: 'bold', color: '#e74c3c', marginBottom: '5px' }}>
                      🏁 PIPELINE END
                    </div>
                    <div><strong>{pipelineEnd.name}</strong></div>
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '3px' }}>
                      Lat: {pipelineEnd.lat.toFixed(6)}<br/>
                      Lon: {pipelineEnd.lon.toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}

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
            {showKPMarkers && routeData.kpMarkers
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
            {showWelds && routeData.welds.map((weld, idx) => {
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
            {showBends && routeData.bends.map((bend, idx) => {
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

            {/* Open Ends from asbuilt survey */}
            {showOpenEnds && routeData.openEnds.map((openEnd, idx) => {
              // Parse station to KP
              const stationParts = openEnd.station.split('+')
              const kpValue = stationParts.length === 2 
                ? parseFloat(stationParts[0]) + parseFloat(stationParts[1]) / 1000 
                : 0
              
              // Icon color based on type
              const isBegin = openEnd.type === 'Begin'
              
              return (
                <CircleMarker
                  key={`openend-${idx}`}
                  center={[openEnd.lat, openEnd.lon]}
                  radius={7}
                  pathOptions={{
                    fillColor: isBegin ? '#27ae60' : '#e74c3c',
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 0.9
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: '11px', minWidth: '200px' }}>
                      <div style={{ 
                        fontWeight: 'bold', 
                        color: isBegin ? '#27ae60' : '#e74c3c', 
                        marginBottom: '5px', 
                        borderBottom: '1px solid #eee', 
                        paddingBottom: '3px' 
                      }}>
                        {isBegin ? '🟢 OPEN END - BEGIN' : '🔴 OPEN END - LEAVE'}
                      </div>
                      <table style={{ width: '100%', fontSize: '11px' }}>
                        <tbody>
                          <tr><td style={{ color: '#666' }}>Station:</td><td><strong>{openEnd.station}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>KP:</td><td><strong>{kpValue.toFixed(3)}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>Type:</td><td>{openEnd.type}</td></tr>
                          <tr><td style={{ color: '#666' }}>Lat:</td><td>{openEnd.lat.toFixed(6)}</td></tr>
                          <tr><td style={{ color: '#666' }}>Lon:</td><td>{openEnd.lon.toFixed(6)}</td></tr>
                        </tbody>
                      </table>
                      <div style={{ fontSize: '10px', color: '#888', marginTop: '5px', fontStyle: 'italic' }}>
                        {openEnd.description}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}

            {/* Bore Faces - HDD entry/exit points */}
            {showBoreFaces && routeData.boreFaces.map((bore, idx) => {
              // Parse station to KP
              const stationParts = bore.station.split('+')
              const kpValue = stationParts.length === 2 
                ? parseFloat(stationParts[0]) + parseFloat(stationParts[1]) / 1000 
                : 0
              
              // Determine if Begin or End
              const isBegin = bore.description.includes('Begin')
              
              return (
                <CircleMarker
                  key={`bore-${idx}`}
                  center={[bore.lat, bore.lon]}
                  radius={10}
                  pathOptions={{
                    fillColor: '#00bcd4',
                    color: '#fff',
                    weight: 3,
                    fillOpacity: 0.9
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: '11px', minWidth: '220px' }}>
                      <div style={{ 
                        fontWeight: 'bold', 
                        color: '#00bcd4', 
                        marginBottom: '5px', 
                        borderBottom: '1px solid #eee', 
                        paddingBottom: '3px' 
                      }}>
                        🔷 HDD / BORE FACE
                      </div>
                      <table style={{ width: '100%', fontSize: '11px' }}>
                        <tbody>
                          <tr><td style={{ color: '#666' }}>Station:</td><td><strong>{bore.station}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>KP:</td><td><strong>{kpValue.toFixed(3)}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>Type:</td><td>{isBegin ? 'Entry Point' : 'Exit Point'}</td></tr>
                          <tr><td style={{ color: '#666' }}>Crossing:</td><td>Railway (Track Bore)</td></tr>
                          <tr><td style={{ color: '#666' }}>Lat:</td><td>{bore.lat.toFixed(6)}</td></tr>
                          <tr><td style={{ color: '#666' }}>Lon:</td><td>{bore.lon.toFixed(6)}</td></tr>
                        </tbody>
                      </table>
                      <div style={{ fontSize: '10px', color: '#888', marginTop: '5px', fontStyle: 'italic' }}>
                        {bore.description}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}

            {/* Sag Bends - vertical bends */}
            {showSagBends && routeData.sagBends.map((sag, idx) => {
              // Parse station to KP
              const stationParts = sag.station.split('+')
              const kpValue = stationParts.length === 2 
                ? parseFloat(stationParts[0]) + parseFloat(stationParts[1]) / 1000 
                : 0
              
              // Parse angle from description (e.g., "Bend-Sag/03d00m")
              const descParts = sag.description.split('/')
              const angle = descParts[1] || ''
              
              return (
                <CircleMarker
                  key={`sag-${idx}`}
                  center={[sag.lat, sag.lon]}
                  radius={3}
                  pathOptions={{
                    fillColor: '#795548',
                    color: '#fff',
                    weight: 1,
                    fillOpacity: 0.8
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: '11px', minWidth: '180px' }}>
                      <div style={{ 
                        fontWeight: 'bold', 
                        color: '#795548', 
                        marginBottom: '5px', 
                        borderBottom: '1px solid #eee', 
                        paddingBottom: '3px' 
                      }}>
                        ↓ SAG BEND (Vertical)
                      </div>
                      <table style={{ width: '100%', fontSize: '11px' }}>
                        <tbody>
                          <tr><td style={{ color: '#666' }}>Station:</td><td><strong>{sag.station}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>KP:</td><td><strong>{kpValue.toFixed(3)}</strong></td></tr>
                          <tr><td style={{ color: '#666' }}>Direction:</td><td>↓ Sag (Vertical Down)</td></tr>
                          {angle && <tr><td style={{ color: '#666' }}>Angle:</td><td><strong>{angle}</strong></td></tr>}
                          <tr><td style={{ color: '#666' }}>Lat:</td><td>{sag.lat.toFixed(6)}</td></tr>
                          <tr><td style={{ color: '#666' }}>Lon:</td><td>{sag.lon.toFixed(6)}</td></tr>
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

          {/* No data overlay — shown on top of the tile layer when no route data exists */}
          {!routeLoading && alignmentStatus === 'missing' && constructionStatus === 'missing' && (
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1000,
              backgroundColor: 'rgba(255,255,255,0.92)',
              padding: '16px 24px',
              borderRadius: '8px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              pointerEvents: 'none',
              maxWidth: '280px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#333', marginBottom: '6px' }}>
                No pipeline route data uploaded
              </div>
              <div style={{ fontSize: '11px', color: '#666' }}>
                Upload KMZ files in Admin Portal &gt; Setup
              </div>
            </div>
          )}

          {/* Missing layer indicators */}
          {!routeLoading && (alignmentStatus === 'missing' || constructionStatus === 'missing') && !(alignmentStatus === 'missing' && constructionStatus === 'missing') && (
            <div style={{ padding: '6px 10px', backgroundColor: '#fff8e1', borderBottom: '1px solid #ffe082', fontSize: '11px', color: '#6d4c00' }}>
              {alignmentStatus === 'missing' && 'No alignment data uploaded — KP markers and footprint not available'}
              {constructionStatus === 'missing' && 'No construction data uploaded — welds, bends, and as-built centerline not available'}
            </div>
          )}

          {/* Route load error */}
          {routeError && (
            <div style={{ padding: '6px 10px', backgroundColor: '#f8d7da', fontSize: '11px', color: '#721c24' }}>
              Route data error: {routeError}
            </div>
          )}

          {/* Floating Zone Legend (collapsible, bottom-right of map) */}
          {showZones && (
            <div style={{
              position: 'absolute',
              bottom: '44px',
              right: '8px',
              zIndex: 1000,
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderRadius: '6px',
              boxShadow: '0 1px 5px rgba(0,0,0,0.3)',
              fontSize: '11px',
              minWidth: zoneLegendOpen ? '180px' : 'auto',
              overflow: 'hidden'
            }}>
              <div
                onClick={() => setZoneLegendOpen(!zoneLegendOpen)}
                style={{
                  padding: '5px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontWeight: 'bold',
                  color: '#333',
                  borderBottom: zoneLegendOpen ? '1px solid #eee' : 'none',
                  userSelect: 'none'
                }}
              >
                <span style={{ fontSize: '9px' }}>{zoneLegendOpen ? '\u25BC' : '\u25B6'}</span>
                Reg. Zones
                {!zoneLegendOpen && (
                  <span style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
                    {Object.entries(ZONE_TYPE_CONFIG).map(([type, cfg]) => (
                      zoneTypeCounts[type] > 0 && (
                        <span key={type} style={{
                          display: 'inline-block',
                          width: '10px',
                          height: '3px',
                          backgroundColor: zoneTypeVisible[type] !== false ? cfg.color : '#ccc',
                          borderRadius: '1px'
                        }} />
                      )
                    ))}
                  </span>
                )}
              </div>
              {zoneLegendOpen && (
                <div style={{ padding: '4px 0' }}>
                  {Object.entries(ZONE_TYPE_CONFIG).map(([type, cfg]) => {
                    if (zoneTypeCounts[type] === 0) return null
                    const active = zoneTypeVisible[type] !== false
                    return (
                      <div
                        key={type}
                        onClick={() => setZoneTypeVisible(prev => ({ ...prev, [type]: !prev[type] }))}
                        style={{
                          padding: '3px 8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          opacity: active ? 1 : 0.4,
                          userSelect: 'none'
                        }}
                      >
                        <span style={{
                          display: 'inline-block',
                          width: '14px',
                          height: '4px',
                          backgroundColor: cfg.color,
                          borderRadius: '1px',
                          flexShrink: 0
                        }} />
                        <span>{cfg.icon} {cfg.label.split(' ')[0]}</span>
                        <span style={{ marginLeft: 'auto', color: '#999', fontSize: '10px' }}>{zoneTypeCounts[type]}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div style={{ 
            padding: '8px 10px', 
            backgroundColor: '#f8f9fa', 
            fontSize: '10px',
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            borderTop: '1px solid #eee'
          }}>
            <span><span style={{ color: '#9b59b6', opacity: 0.5 }}>▓</span> Footprint</span>
            <span><span style={{ color: '#ff6600' }}>━</span> CL</span>
            <span><span style={{ color: '#e74c3c' }}>◉</span> Start/End</span>
            <span><span style={{ color: '#27ae60' }}>●</span><span style={{ color: '#e74c3c' }}>●</span> Open</span>
            <span><span style={{ color: '#00bcd4' }}>◆</span> HDD</span>
            <span><span style={{ color: '#007bff' }}>●</span> KP</span>
            <span><span style={{ color: '#dc3545' }}>●</span> Weld</span>
            <span><span style={{ color: '#fd7e14' }}>●</span> Bend</span>
            <span><span style={{ color: '#795548' }}>●</span> Sag</span>
          </div>
        </div>
      )}

      {/* CSS for markers */}
      <style>{`
        .work-area-marker, .user-location, .start-end-marker {
          background: transparent !important;
          border: none !important;
        }
        @keyframes zonePulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.3; }
        }
        .zone-pulse {
          animation: zonePulse 2s ease-in-out infinite;
        }
        @keyframes minimap-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
