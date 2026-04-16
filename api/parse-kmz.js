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
// ============================================================

// Known classification patterns — if a point doesn't match any of these,
// it goes into the unclassified bucket for admin review
const CLASSIFICATION_RULES = [
  { test: (n, d) => /^kp\s/i.test(n) || /\bkp\b/i.test(n), type: 'kp_marker' },
  { test: (n, d) => /\bweld/i.test(d) && !/\bbend/i.test(d), type: 'weld' },
  { test: (n, d) => /\bbend[-\s]?sag/i.test(d) || /\bsag\s*bend/i.test(d), type: 'sag_bend' },
  { test: (n, d) => /\bbend/i.test(d), type: 'bend' },
  { test: (n, d) => /\bopen\s*end/i.test(d) || /\bleave\b/i.test(d), type: 'open_end' },
  { test: (n, d) => /\bbore\s*face/i.test(d) || /\btrack\s*bore/i.test(d), type: 'bore_face' },
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

function getFolderPath(pm, folderMap) {
  // folderMap is built during traversal: placemark → folder path
  return folderMap.get(pm) || 'root'
}

function parseKML(kmlText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (tagName) => ['Placemark', 'Folder'].includes(tagName),
  })
  const doc = parser.parse(kmlText)

  const kml = doc.kml || doc.KML
  if (!kml) throw new Error('Invalid KML: no <kml> root element')
  const document = kml.Document || kml.document
  if (!document) throw new Error('Invalid KML: no <Document> element')

  const result = {
    centerline: [],
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

  // Recursively collect Placemarks with folder path for diagnostics
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
    return marks
  }

  const placemarks = collectPlacemarks(document, document.name || 'Document')

  for (const { pm, path } of placemarks) {
    const name = String(pm.name || '').trim()
    const desc = String(pm.description || name).trim()

    const point = pm.Point
    const lineString = pm.LineString
    const polygon = pm.Polygon

    if (point) {
      const coordStr = String(point.coordinates || '').trim()
      const parts = coordStr.split(',').map(Number)
      if (parts.length < 2) continue
      const [lng, lat, elev] = parts
      if (!isFinite(lat) || !isFinite(lng)) continue

      // Classify using rules
      let classified = false
      for (const rule of CLASSIFICATION_RULES) {
        if (rule.test(name, desc)) {
          switch (rule.type) {
            case 'kp_marker': {
              const kpMatch = name.match(/KP\s*([\d.]+)/i)
              const kp = kpMatch ? parseFloat(kpMatch[1]) : parseStation(name)
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
          name,
          description: desc,
          lat,
          lng,
          folder_path: path,
          geometry_type: 'Point',
        })
      }

    } else if (lineString) {
      const coordStr = String(lineString.coordinates || '').trim()
      const points = coordStr.split(/\s+/).filter(Boolean).map(s => {
        const [lng, lat, elev] = s.split(',').map(Number)
        return { lat, lng, elevation: isFinite(elev) ? elev : null }
      }).filter(p => isFinite(p.lat) && isFinite(p.lng))

      if (points.length > result.centerline.length) {
        result.centerline = points
      }

    } else if (polygon) {
      const outer = polygon.outerBoundaryIs?.LinearRing?.coordinates
        || polygon.outerBoundary?.LinearRing?.coordinates
      if (!outer) continue
      const coordStr = String(outer).trim()
      const coords = coordStr.split(/\s+/).filter(Boolean).map(s => {
        const [lng, lat] = s.split(',').map(Number)
        return [lat, lng]
      }).filter(c => isFinite(c[0]) && isFinite(c[1]))
      if (coords.length > 2) {
        result.footprint.push(coords)
      }
    }
  }

  // Calculate route metadata from KP markers
  if (result.kpMarkers.length > 0) {
    const kps = result.kpMarkers.map(m => m.kp).filter(k => k != null).sort((a, b) => a - b)
    result.metadata.startKP = kps[0]
    result.metadata.endKP = kps[kps.length - 1]
    result.metadata.lengthKm = Math.round((kps[kps.length - 1] - kps[0]) * 1000) / 1000
  }

  return result
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

  // 1. Verify auth
  let caller
  try {
    caller = await verifyAuth(req.headers.authorization)
  } catch (err) {
    return res.status(401).json({ error: err.message })
  }

  const { storage_path, route_name, description, kmz_upload_id, organization_id } = req.body

  if (!storage_path || !route_name) {
    return res.status(400).json({ error: 'Missing required fields: storage_path, route_name' })
  }

  // Org scoping: super_admin can target any org, others use their own
  const orgId = (caller.role === 'super_admin' && organization_id)
    ? organization_id
    : caller.organizationId

  if (!orgId) {
    return res.status(400).json({ error: 'Could not determine organization' })
  }

  try {
    // 2. Download KMZ from Supabase storage
    const storagePath = storage_path.startsWith('kmz-files/') ? storage_path : `kmz-files/${storage_path}`
    const downloadUrl = `${SUPABASE_URL}/storage/v1/object/${storagePath}`
    const dlResp = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY }
    })
    if (!dlResp.ok) throw new Error(`Failed to download KMZ from storage: ${dlResp.status} ${dlResp.statusText}`)
    const kmzBuffer = await dlResp.arrayBuffer()

    // 3. Unzip KMZ
    const zip = await JSZip.loadAsync(kmzBuffer)
    const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'))
    if (!kmlFile) throw new Error('No .kml file found inside the KMZ archive')
    const kmlText = await zip.files[kmlFile].async('string')

    // 4. Parse KML
    const parsed = parseKML(kmlText)

    if (parsed.centerline.length === 0 && parsed.kpMarkers.length === 0 && parsed.welds.length === 0) {
      throw new Error('KML parsed but no recognizable route data found (no centerline, KP markers, or welds)')
    }

    // 5. Build RPC payload — single JSONB object for the Postgres transaction
    const rpcPayload = {
      organization_id: orgId,
      kmz_upload_id: kmz_upload_id || null,
      name: route_name,
      description: description || null,
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

      footprint: parsed.footprint.map((coords, i) => ({
        name: `Polygon ${i + 1}`, polygon: coords,
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

    // 6. Call RPC — single Postgres transaction
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

    // 7. Audit log (non-fatal if it fails)
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
            route_name,
            storage_path,
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

    // 8. Return results with unclassified count prominently displayed
    const totalClassified = (parsed.centerline.length + parsed.kpMarkers.length +
      parsed.welds.length + parsed.bends.length + parsed.footprint.length +
      parsed.openEnds.length + parsed.boreFaces.length + parsed.sagBends.length)

    return res.status(200).json({
      success: true,
      route_id: rpcResult.route_id,
      route_name,
      organization_id: orgId,
      counts: rpcResult.counts,
      metadata: parsed.metadata,
      summary: `Parsed ${totalClassified + parsed.unclassified.length} features. ${parsed.unclassified.length} unclassified${parsed.unclassified.length > 0 ? ' — review before using.' : '.'}`,
      unclassified: parsed.unclassified,
    })

  } catch (err) {
    console.error('KMZ parse error:', err)
    return res.status(500).json({
      error: `KMZ parse failed: ${err.message}`,
    })
  }
}
