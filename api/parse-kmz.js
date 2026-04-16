import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

// ============================================================
// AUTH
// ============================================================

async function verifyAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header')
  }
  const token = authHeader.replace('Bearer ', '')

  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SERVICE_ROLE_KEY }
  })
  if (!resp.ok) throw new Error('Invalid or expired authentication token')
  const user = await resp.json()
  if (!user?.id) throw new Error('Could not identify user from token')

  const profileResp = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user.id}&select=id,role,organization_id`,
    { headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY, 'Content-Type': 'application/json' } }
  )
  if (!profileResp.ok) throw new Error('Could not load user profile')
  const profiles = await profileResp.json()
  if (!profiles || profiles.length === 0) throw new Error('User profile not found')

  const profile = profiles[0]
  if (!['admin', 'super_admin'].includes(profile.role)) {
    throw new Error('Permission denied — admin or super_admin role required')
  }
  return { userId: user.id, role: profile.role, organizationId: profile.organization_id }
}

// ============================================================
// KML PARSER
//
// Classification rules — naming conventions observed in the wild:
//
// CONSTRUCTION LAYER (as-built KMZ from survey):
//   - Welds: description contains "weld" (not "bend"). Folder: "Welds"
//   - Bends: description contains "bend-left", "bend-right", "bend-over"
//            Folders: "Bend Lefts", "Bend Overs", "Bend Rights"
//   - Sag bends: description contains "bend-sag". Folder: "Bend Sags"
//   - Open ends: description contains "open end" or "leave". Folder: "Open Ends"
//   - Bore faces: description contains "bore face" or "track bore". Folder: "Bore Faces"
//   - Centerline: LineString geometry in "Centerline" folder — many 2-point segments
//   - Railway crossings: description starts with "X-Railway" — goes to unclassified
//
// ALIGNMENT LAYER (design KMZ from GIS):
//   - KP markers: name matches /^KP\s+[\d.]+/ — Folders: "PROPOSED KP (100 m)", "PROPOSED KP (1 km)"
//   - PKP markers: name matches /^PKP\s+[\d.]+/ — construction KP offsets, treated as KP markers
//   - Footprints: Polygon geometry (direct or inside MultiGeometry). Folder: "CONSTRUCTION FOOTPRINT"
//   - Centerline: LineString inside MultiGeometry in "PROPOSED PIPELINE" folder — 3 segments to concatenate
//   - OGC Corridor: MultiGeometry polygon — goes to unclassified (not footprint)
//
// Both layers may have features in unexpected folders. The parser classifies
// primarily by geometry type + name/description patterns, not folder names.
// Anything that doesn't match goes to unclassified with full diagnostics.
// ============================================================

// Classification rules for Point features — order matters (first match wins)
const POINT_RULES = [
  { test: (n) => /^KP\s+[\d.]+/i.test(n), type: 'kp_marker' },
  { test: (n) => /^PKP\s+[\d.]+/i.test(n), type: 'kp_marker' },
  { test: (n, d) => /\bweld/i.test(d) && !/\bbend/i.test(d), type: 'weld' },
  { test: (n, d) => /\bbend[-\s]?sag/i.test(d) || /\bsag\s*bend/i.test(d), type: 'sag_bend' },
  { test: (n, d) => /\bbend/i.test(d), type: 'bend' },
  { test: (n, d) => /\bopen\s*end/i.test(d) || /\bleave\b/i.test(d), type: 'open_end' },
  { test: (n, d) => /\bbore\s*face/i.test(d) || /\btrack\s*bore/i.test(d), type: 'bore_face' },
  // Folder-based classification as fallback
  { test: (n, d, f) => /\bbend\s*left/i.test(f), type: 'bend' },
  { test: (n, d, f) => /\bbend\s*right/i.test(f), type: 'bend' },
  { test: (n, d, f) => /\bbend\s*over/i.test(f), type: 'bend' },
  { test: (n, d, f) => /\bbend\s*sag/i.test(f), type: 'sag_bend' },
  { test: (n, d, f) => /\bweld/i.test(f) && !/\bbend/i.test(f), type: 'weld' },
  { test: (n, d, f) => /\bopen\s*end/i.test(f), type: 'open_end' },
  { test: (n, d, f) => /\bbore\s*face/i.test(f), type: 'bore_face' },
]

function parseStation(station) {
  if (!station) return null
  const match = station.match(/(\d+)\+(\d+\.?\d*)/)
  if (!match) return null
  return parseFloat(match[1]) + parseFloat(match[2]) / 1000
}

function extractType(desc) {
  if (!desc) return null
  const match = desc.match(/^([^/]+)/)
  return match ? match[1].trim() : desc.substring(0, 50)
}

function parseKML(kmlText) {
  // Fix common namespace issues (xsi: undeclared in some GIS exports)
  kmlText = kmlText.replace(
    /xmlns:atom="[^"]*"/,
    '$& xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
  )
  // If xsi was already declared, remove the duplicate
  const xsiCount = (kmlText.match(/xmlns:xsi/g) || []).length
  if (xsiCount > 1) {
    let first = true
    kmlText = kmlText.replace(/xmlns:xsi="[^"]*"/g, (m) => {
      if (first) { first = false; return m }
      return ''
    })
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (tagName) => ['Placemark', 'Folder', 'LineString', 'Polygon', 'Point'].includes(tagName),
  })
  const doc = parser.parse(kmlText)

  // Navigate to the root content — handle kml>Document, kml>Folder>Document, etc.
  const kml = doc.kml || doc.KML || doc
  let root = kml
  if (kml.Document) root = kml.Document
  else if (kml.Folder) {
    const f = Array.isArray(kml.Folder) ? kml.Folder[0] : kml.Folder
    root = f.Document || f
  }

  const result = {
    centerlineSegments: [],  // collect all segments, concatenate later
    kpMarkers: [],
    welds: [],
    bends: [],
    footprint: [],
    openEnds: [],
    boreFaces: [],
    sagBends: [],
    unclassified: [],
    metadata: { startKP: null, endKP: null, lengthKm: null },
  }

  // Recursively collect Placemarks with folder path
  function collectPlacemarks(node, path) {
    const marks = []
    if (!node) return marks
    if (node.Placemark) {
      const pms = Array.isArray(node.Placemark) ? node.Placemark : [node.Placemark]
      for (const pm of pms) marks.push({ pm, path })
    }
    if (node.Folder) {
      const folders = Array.isArray(node.Folder) ? node.Folder : [node.Folder]
      for (const f of folders) {
        const folderName = f.name || 'unnamed'
        marks.push(...collectPlacemarks(f, `${path}/${folderName}`))
      }
    }
    if (node.Document) {
      const docs = Array.isArray(node.Document) ? node.Document : [node.Document]
      for (const d of docs) {
        const docName = d.name || 'Document'
        marks.push(...collectPlacemarks(d, `${path}/${docName}`))
      }
    }
    return marks
  }

  const rootName = root.name || 'root'
  const placemarks = collectPlacemarks(root, rootName)

  for (const { pm, path } of placemarks) {
    const name = String(pm.name || '').trim()
    const desc = String(pm.description || name).trim()

    // Extract all geometries — handle MultiGeometry wrapping
    const geometries = []

    function extractGeometries(node) {
      if (node.Point) {
        const pts = Array.isArray(node.Point) ? node.Point : [node.Point]
        for (const p of pts) geometries.push({ type: 'Point', geom: p })
      }
      if (node.LineString) {
        const lss = Array.isArray(node.LineString) ? node.LineString : [node.LineString]
        for (const ls of lss) geometries.push({ type: 'LineString', geom: ls })
      }
      if (node.Polygon) {
        const pgs = Array.isArray(node.Polygon) ? node.Polygon : [node.Polygon]
        for (const pg of pgs) geometries.push({ type: 'Polygon', geom: pg })
      }
      if (node.MultiGeometry) {
        const mgs = Array.isArray(node.MultiGeometry) ? node.MultiGeometry : [node.MultiGeometry]
        for (const mg of mgs) extractGeometries(mg)
      }
    }
    extractGeometries(pm)

    for (const { type: geoType, geom } of geometries) {
      if (geoType === 'Point') {
        const coordStr = String(geom.coordinates || '').trim()
        const parts = coordStr.split(',').map(Number)
        if (parts.length < 2) continue
        const [lng, lat] = parts
        if (!isFinite(lat) || !isFinite(lng)) continue

        // Classify using rules
        let classified = false
        for (const rule of POINT_RULES) {
          if (rule.test(name, desc, path)) {
            switch (rule.type) {
              case 'kp_marker': {
                const kpMatch = name.match(/(?:KP|PKP)\s+([\d.]+)/i)
                const kp = kpMatch ? parseFloat(kpMatch[1]) : null
                result.kpMarkers.push({ name, kp, lat, lng })
                break
              }
              case 'weld':
                result.welds.push({ station: name, lat, lng, description: desc, type: extractType(desc) })
                break
              case 'sag_bend':
                result.sagBends.push({ station: name, lat, lng, description: desc, type: 'Bend-Sag' })
                break
              case 'bend':
                result.bends.push({ station: name, lat, lng, description: desc, type: extractType(desc) })
                break
              case 'open_end':
                result.openEnds.push({ station: name, lat, lng, description: desc, type: extractType(desc) })
                break
              case 'bore_face':
                result.boreFaces.push({ station: name, lat, lng, description: desc, type: 'HDD' })
                break
            }
            classified = true
            break
          }
        }

        if (!classified) {
          result.unclassified.push({
            name, description: desc, lat, lng,
            folder_path: path, geometry_type: 'Point',
          })
        }

      } else if (geoType === 'LineString') {
        const coordStr = String(geom.coordinates || '').trim()
        const points = coordStr.split(/\s+/).filter(Boolean).map(s => {
          const [lng, lat, elev] = s.split(',').map(Number)
          return { lat, lng, elevation: isFinite(elev) ? elev : null }
        }).filter(p => isFinite(p.lat) && isFinite(p.lng))

        if (points.length > 0) {
          result.centerlineSegments.push(points)
        }

      } else if (geoType === 'Polygon') {
        const outer = geom.outerBoundaryIs?.LinearRing?.coordinates
        if (!outer) continue
        const coordStr = String(outer).trim()
        const coords = coordStr.split(/\s+/).filter(Boolean).map(s => {
          const [lng, lat] = s.split(',').map(Number)
          return [lat, lng]
        }).filter(c => isFinite(c[0]) && isFinite(c[1]))
        if (coords.length > 2) {
          result.footprint.push({ name: name || 'Polygon', coordinates: coords })
        }
      }
    }
  }

  // Concatenate centerline segments into one ordered sequence
  // Strategy: stitch segments by nearest endpoint
  const segments = result.centerlineSegments
  const centerline = []

  if (segments.length === 1) {
    centerline.push(...segments[0])
  } else if (segments.length > 1) {
    // Start with the first segment
    const used = new Set()
    let chain = [...segments[0]]
    used.add(0)

    function dist(a, b) {
      const dlat = a.lat - b.lat
      const dlng = a.lng - b.lng
      return Math.sqrt(dlat * dlat + dlng * dlng)
    }

    const MAX_GAP_DEG = 0.0001 // ~11 metres — flag gaps larger than this

    for (let iter = 0; iter < segments.length; iter++) {
      let bestIdx = -1
      let bestDist = Infinity
      let bestReverse = false
      let bestEnd = 'tail' // attach to tail or head

      const head = chain[0]
      const tail = chain[chain.length - 1]

      for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue
        const seg = segments[i]
        const segStart = seg[0]
        const segEnd = seg[seg.length - 1]

        // Try attaching to tail
        const d1 = dist(tail, segStart)  // tail → seg start (normal)
        const d2 = dist(tail, segEnd)    // tail → seg end (reversed)
        // Try attaching to head
        const d3 = dist(head, segEnd)    // seg end → head (normal)
        const d4 = dist(head, segStart)  // seg start → head (reversed)

        const dMin = Math.min(d1, d2, d3, d4)
        if (dMin < bestDist) {
          bestDist = dMin
          bestIdx = i
          if (dMin === d1) { bestReverse = false; bestEnd = 'tail' }
          else if (dMin === d2) { bestReverse = true; bestEnd = 'tail' }
          else if (dMin === d3) { bestReverse = false; bestEnd = 'head' }
          else { bestReverse = true; bestEnd = 'head' }
        }
      }

      if (bestIdx === -1) break
      used.add(bestIdx)

      let seg = [...segments[bestIdx]]
      if (bestReverse) seg.reverse()

      // Skip first point if it duplicates the junction point
      const junction = bestEnd === 'tail' ? chain[chain.length - 1] : chain[0]
      if (dist(junction, seg[0]) < 0.0000001) {
        seg = seg.slice(1)
      }

      if (bestEnd === 'tail') {
        chain.push(...seg)
      } else {
        chain.unshift(...seg)
      }

      // Flag gaps > ~11m in diagnostics
      if (bestDist > MAX_GAP_DEG) {
        result.unclassified.push({
          name: `Centerline gap: ${(bestDist * 111000).toFixed(1)}m`,
          description: `Gap between centerline segments at junction point`,
          lat: junction.lat,
          lng: junction.lng,
          folder_path: 'Centerline/gap',
          geometry_type: 'diagnostic',
        })
      }
    }

    centerline.push(...chain)
  }

  // Deduplicate KP markers (100m and 1km folders overlap)
  const kpMap = new Map()
  for (const m of result.kpMarkers) {
    if (m.kp === null) continue
    const key = Math.round(m.kp * 10) / 10 // round to 0.1 KP
    const existing = kpMap.get(key)
    if (!existing || (m.name || '').length > (existing.name || '').length) {
      kpMap.set(key, m) // keep the more precise entry
    }
  }
  const dedupedKP = [...kpMap.values()].sort((a, b) => a.kp - b.kp)

  // Calculate metadata
  if (dedupedKP.length > 0) {
    const kps = dedupedKP.map(m => m.kp).filter(k => k != null)
    result.metadata.startKP = kps[0]
    result.metadata.endKP = kps[kps.length - 1]
    result.metadata.lengthKm = Math.round((kps[kps.length - 1] - kps[0]) * 1000) / 1000
  } else if (centerline.length > 0) {
    // Estimate from centerline coordinates
    result.metadata.startKP = 0
  }

  return {
    centerline,
    kpMarkers: dedupedKP,
    welds: result.welds,
    bends: result.bends,
    footprint: result.footprint,
    openEnds: result.openEnds,
    boreFaces: result.boreFaces,
    sagBends: result.sagBends,
    unclassified: result.unclassified,
    metadata: result.metadata,
  }
}

// ============================================================
// HANDLER
// ============================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server missing Supabase configuration' })
  }

  let caller
  try {
    caller = await verifyAuth(req.headers.authorization)
  } catch (err) {
    return res.status(401).json({ error: err.message })
  }

  const { storage_path, route_name, description, kmz_upload_id, organization_id, layer_type } = req.body

  if (!storage_path || !route_name) {
    return res.status(400).json({ error: 'Missing required fields: storage_path, route_name' })
  }

  const orgId = (caller.role === 'super_admin' && organization_id)
    ? organization_id
    : caller.organizationId

  if (!orgId) {
    return res.status(400).json({ error: 'Could not determine organization' })
  }

  try {
    // 1. Download KMZ
    const storagePath = storage_path.startsWith('kmz-files/') ? storage_path : `kmz-files/${storage_path}`
    const downloadUrl = `${SUPABASE_URL}/storage/v1/object/${storagePath}`
    const dlResp = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY }
    })
    if (!dlResp.ok) throw new Error(`Failed to download KMZ: ${dlResp.status} ${dlResp.statusText}`)
    const kmzBuffer = await dlResp.arrayBuffer()

    // 2. Unzip
    const zip = await JSZip.loadAsync(kmzBuffer)
    const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'))
    if (!kmlFile) throw new Error('No .kml file found inside the KMZ archive')
    const kmlText = await zip.files[kmlFile].async('string')

    // 3. Parse KML
    const parsed = parseKML(kmlText)

    if (parsed.centerline.length === 0 && parsed.kpMarkers.length === 0 &&
        parsed.welds.length === 0 && parsed.footprint.length === 0) {
      throw new Error('KML parsed but no recognizable route data found')
    }

    // 4. Build RPC payload
    const rpcPayload = {
      organization_id: orgId,
      kmz_upload_id: kmz_upload_id || null,
      name: route_name,
      description: description || null,
      layer_type: layer_type || 'construction',
      total_length_m: parsed.metadata.lengthKm ? parsed.metadata.lengthKm * 1000 : null,
      kp_start: parsed.metadata.startKP,
      kp_end: parsed.metadata.endKP,
      default_center_lat: parsed.centerline.length > 0
        ? parsed.centerline[Math.floor(parsed.centerline.length / 2)].lat
        : (parsed.kpMarkers[0]?.lat || null),
      default_center_lng: parsed.centerline.length > 0
        ? parsed.centerline[Math.floor(parsed.centerline.length / 2)].lng
        : (parsed.kpMarkers[0]?.lng || null),

      centerline: parsed.centerline.map((pt, i) => ({
        seq: i, lat: pt.lat, lng: pt.lng, elevation: pt.elevation,
      })),
      kp_markers: parsed.kpMarkers.map(m => ({
        kp: m.kp, lat: m.lat, lng: m.lng, label: m.name,
      })),
      welds: parsed.welds.map(w => ({
        weld_id: w.station, kp: parseStation(w.station),
        lat: w.lat, lng: w.lng, weld_type: w.type,
        properties: { description: w.description },
      })),
      bends: parsed.bends.map(b => ({
        bend_id: b.station, kp: parseStation(b.station),
        lat: b.lat, lng: b.lng, bend_type: b.type,
        properties: { description: b.description },
      })),
      footprint: parsed.footprint.map(f => ({
        name: f.name, polygon: f.coordinates,
      })),
      open_ends: parsed.openEnds.map(o => ({
        name: o.station, kp: parseStation(o.station),
        lat: o.lat, lng: o.lng, end_type: o.type,
        properties: { description: o.description },
      })),
      bore_faces: parsed.boreFaces.map(b => ({
        name: b.station, kp: parseStation(b.station),
        lat: b.lat, lng: b.lng, face_type: b.type,
        properties: { description: b.description },
      })),
      sag_bends: parsed.sagBends.map(s => ({
        name: s.station, kp: parseStation(s.station),
        lat: s.lat, lng: s.lng,
        properties: { description: s.description },
      })),
      unclassified: parsed.unclassified,
    }

    // 5. Call RPC — single Postgres transaction
    const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/insert_pipeline_route`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload: rpcPayload }),
    })

    if (!rpcResp.ok) {
      const errText = await rpcResp.text()
      throw new Error(`Database transaction failed: ${errText}`)
    }

    const rpcResult = await rpcResp.json()

    // 6. Audit log
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/report_audit_log`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'apikey': SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{
          organization_id: orgId,
          action: 'kmz_parse_complete',
          entity_type: 'pipeline_route',
          entity_id: rpcResult.route_id,
          details: {
            route_name, storage_path, layer_type: layer_type || 'construction',
            counts: rpcResult.counts,
            unclassified_count: parsed.unclassified.length,
            parsed_by: caller.userId,
            metadata: parsed.metadata,
          },
          created_at: new Date().toISOString(),
        }]),
      })
    } catch (auditErr) {
      console.error('Audit log failed (non-fatal):', auditErr.message)
    }

    // 7. Response
    const totalClassified = (parsed.centerline.length + parsed.kpMarkers.length +
      parsed.welds.length + parsed.bends.length + parsed.footprint.length +
      parsed.openEnds.length + parsed.boreFaces.length + parsed.sagBends.length)

    return res.status(200).json({
      success: true,
      route_id: rpcResult.route_id,
      route_name,
      organization_id: orgId,
      layer_type: rpcResult.layer_type,
      superseded_route_id: rpcResult.superseded_route_id || null,
      counts: rpcResult.counts,
      metadata: parsed.metadata,
      summary: `Parsed ${totalClassified + parsed.unclassified.length} features. ${parsed.unclassified.length} unclassified${parsed.unclassified.length > 0 ? ' — review before using.' : '.'}`,
      unclassified: parsed.unclassified,
    })

  } catch (err) {
    console.error('KMZ parse error:', err)
    return res.status(500).json({ error: `KMZ parse failed: ${err.message}` })
  }
}
