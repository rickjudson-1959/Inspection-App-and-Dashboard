import React, { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

const LAYER_TYPES = [
  { value: '', label: '— Select layer type —' },
  { value: 'alignment', label: 'Alignment (centerline, KP markers, footprint)' },
  { value: 'construction', label: 'Construction (as-built welds, bends, progress)' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'row', label: 'Right-of-Way (ROW)' },
  { value: 'other', label: 'Other' },
]

export default function KMZUpload({ organizationId }) {
  const [files, setFiles] = useState([])
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // Upload form state
  const [layerType, setLayerType] = useState('')
  const [routeName, setRouteName] = useState('')
  const [description, setDescription] = useState('')
  const fileInputRef = useRef(null)

  // Parse results state
  const [parseResult, setParseResult] = useState(null)
  const [showUnclassified, setShowUnclassified] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState(false)

  useEffect(() => {
    if (organizationId) loadData()
  }, [organizationId])

  async function loadData() {
    setLoading(true)
    const { data: routeData } = await supabase
      .from('pipeline_routes')
      .select('id, name, layer_type, is_active, kp_start, kp_end, total_length_m, created_at, unclassified_features, superseded_route_id')
      .eq('organization_id', organizationId)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })
    setRoutes(routeData || [])
    setLoading(false)
  }

  // Find the active route that would be superseded by a given layer type
  function getSupersededRoute(lt) {
    if (!lt) return null
    return routes.find(r => r.layer_type === lt && r.is_active) || null
  }

  async function handleUpload(file) {
    if (!file || !file.name.toLowerCase().endsWith('.kmz')) {
      setError('Only .kmz files are accepted')
      return
    }
    if (!layerType) {
      setError('Please select a layer type before uploading')
      return
    }

    const autoName = routeName.trim() || `${file.name.replace('.kmz', '')} (${layerType})`

    setUploading(true)
    setError('')
    setParseResult(null)
    setPendingConfirmation(false)

    try {
      const path = `${organizationId}/${Date.now()}_${file.name}`

      // Step 1: Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('kmz-files')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      // Step 2: Record in kmz_uploads
      const { data: uploadRecord, error: dbError } = await supabase.from('kmz_uploads').insert({
        organization_id: organizationId,
        filename: file.name,
        storage_path: path,
        description: description || file.name,
      }).select().single()
      if (dbError) throw dbError

      setUploading(false)
      setParsing(true)

      // Step 3: Parse KMZ via API route
      const session = await supabase.auth.getSession()
      const token = session.data?.session?.access_token
      if (!token) throw new Error('Not authenticated — please log in again')

      const parseResp = await fetch('/api/parse-kmz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          storage_path: path,
          route_name: autoName,
          description: description || null,
          layer_type: layerType,
          kmz_upload_id: uploadRecord?.id || null,
          organization_id: organizationId,
        }),
      })

      const result = await parseResp.json()
      if (!parseResp.ok || result.error) {
        throw new Error(result.error || `Parse failed: ${parseResp.status}`)
      }

      setParseResult(result)

      // If unclassified > 0, require confirmation
      const unclassifiedCount = result.counts?.unclassified || 0
      if (unclassifiedCount > 0) {
        setPendingConfirmation(true)
      } else {
        await loadData()
      }

      // Audit log
      try {
        const supersededRoute = result.superseded_route_id
          ? routes.find(r => r.id === result.superseded_route_id) : null
        await supabase.from('report_audit_log').insert({
          organization_id: organizationId,
          action: 'kmz_upload_and_parse',
          entity_type: 'pipeline_route',
          entity_id: result.route_id,
          details: {
            filename: file.name,
            layer_type: layerType,
            route_name: autoName,
            counts: result.counts,
            superseded_route_id: result.superseded_route_id || null,
            superseded_route_name: supersededRoute?.name || null,
          },
          created_at: new Date().toISOString(),
        })
      } catch (e) { console.warn('Audit log failed:', e) }

      setRouteName('')
      setDescription('')
      setLayerType('')

    } catch (err) {
      setError(err.message)
    }
    setUploading(false)
    setParsing(false)
  }

  async function confirmWithUnclassified() {
    setPendingConfirmation(false)
    setParseResult(null)
    await loadData()
  }

  async function rejectWithUnclassified() {
    if (!parseResult?.route_id) return

    // Deactivate the rejected route
    await supabase.from('pipeline_routes')
      .update({ is_active: false })
      .eq('id', parseResult.route_id)

    // Restore the superseded route if one was flipped
    if (parseResult.superseded_route_id) {
      await supabase.from('pipeline_routes')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', parseResult.superseded_route_id)

      // Audit the restore
      try {
        const restoredRoute = routes.find(r => r.id === parseResult.superseded_route_id)
        await supabase.from('report_audit_log').insert({
          organization_id: organizationId,
          action: 'kmz_reject_restore_superseded',
          entity_type: 'pipeline_route',
          entity_id: parseResult.superseded_route_id,
          details: {
            rejected_route_id: parseResult.route_id,
            rejected_route_name: parseResult.route_name,
            restored_route_name: restoredRoute?.name || 'unknown',
            reason: 'Admin rejected upload with unclassified features — restored previous active route',
          },
          created_at: new Date().toISOString(),
        })
      } catch (e) { console.warn('Audit log failed:', e) }
    }

    setPendingConfirmation(false)
    setParseResult(null)
    setError('Route rejected and deactivated.' + (parseResult.superseded_route_id ? ' Previous route restored.' : ''))
    await loadData()
  }

  async function handleDeleteRoute(route) {
    if (!confirm(`Remove "${route.name}" and deactivate it?\nData is preserved in history.`)) return
    await supabase.from('pipeline_routes')
      .update({ is_active: false })
      .eq('id', route.id)
    await loadData()
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  function handleFileSelect(e) {
    const file = e.target.files[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  const activeRoutes = routes.filter(r => r.is_active)
  const inactiveRoutes = routes.filter(r => !r.is_active)
  const supersededRoute = getSupersededRoute(layerType)

  return (
    <div>
      {/* Active route layers */}
      {loading ? (
        <p style={{ color: '#666', fontSize: '13px' }}>Loading...</p>
      ) : activeRoutes.length > 0 ? (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>Active Layers</div>
          {activeRoutes.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: '4px', border: '1px solid #dee2e6', borderRadius: '6px', backgroundColor: '#f8f9fa' }}>
              <div>
                <span style={{ fontWeight: '600', fontSize: '13px' }}>{r.name}</span>
                <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600',
                  backgroundColor: r.layer_type === 'alignment' ? '#dbeafe' : r.layer_type === 'construction' ? '#dcfce7' : '#fef3c7',
                  color: r.layer_type === 'alignment' ? '#1e40af' : r.layer_type === 'construction' ? '#166534' : '#92400e',
                }}>
                  {r.layer_type}
                </span>
                {r.kp_start != null && r.kp_end != null && (
                  <span style={{ marginLeft: '8px', fontSize: '11px', color: '#666' }}>KP {r.kp_start}–{r.kp_end}</span>
                )}
                <span style={{ marginLeft: '8px', fontSize: '11px', color: '#999' }}>{new Date(r.created_at).toLocaleDateString()}</span>
                {r.unclassified_features && r.unclassified_features.length > 0 && (
                  <span style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '10px', fontSize: '10px', backgroundColor: '#fef2f2', color: '#dc2626' }}>
                    {r.unclassified_features.length} unclassified
                  </span>
                )}
              </div>
              <button onClick={() => handleDeleteRoute(r)}
                style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: '#999', fontSize: '13px', fontStyle: 'italic', marginBottom: '16px' }}>No pipeline route data uploaded yet</p>
      )}

      {/* Inactive routes (history) */}
      {inactiveRoutes.length > 0 && (
        <details style={{ marginBottom: '16px', fontSize: '12px' }}>
          <summary style={{ cursor: 'pointer', color: '#666' }}>{inactiveRoutes.length} superseded layer(s)</summary>
          {inactiveRoutes.map(r => (
            <div key={r.id} style={{ padding: '4px 12px', color: '#999', fontSize: '11px' }}>
              {r.name} ({r.layer_type}) — {new Date(r.created_at).toLocaleDateString()}
            </div>
          ))}
        </details>
      )}

      {/* Parse results */}
      {parseResult && (
        <div style={{ marginBottom: '16px', padding: '14px', borderRadius: '6px', border: `2px solid ${pendingConfirmation ? '#f59e0b' : '#059669'}`, backgroundColor: pendingConfirmation ? '#fffbeb' : '#f0fdf4' }}>
          <div style={{ fontWeight: '700', fontSize: '14px', color: pendingConfirmation ? '#92400e' : '#166534', marginBottom: '8px' }}>
            {pendingConfirmation ? 'Review Required' : 'Parse Successful'}
          </div>
          <p style={{ fontSize: '13px', color: '#333', margin: '0 0 8px 0' }}>{parseResult.summary}</p>

          {/* Superseding notice — show which route was replaced */}
          {parseResult.superseded_route_id && (() => {
            const prev = routes.find(r => r.id === parseResult.superseded_route_id)
            return (
              <p style={{ fontSize: '12px', color: '#b45309', margin: '0 0 8px 0', fontStyle: 'italic' }}>
                Superseded: <strong>{prev?.name || 'previous route'}</strong> ({parseResult.layer_type}) has been deactivated. {pendingConfirmation ? 'If you reject this upload, the previous route will be restored.' : 'Previous data preserved in history.'}
              </p>
            )
          })()}

          {/* Feature counts */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            {Object.entries(parseResult.counts || {}).filter(([k, v]) => v > 0 && k !== 'unclassified').map(([k, v]) => (
              <span key={k} style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                {k.replace(/_/g, ' ')}: {v}
              </span>
            ))}
          </div>

          {/* Unclassified details */}
          {(parseResult.counts?.unclassified || 0) > 0 && (
            <div style={{ marginTop: '8px' }}>
              <button onClick={() => setShowUnclassified(!showUnclassified)}
                style={{ padding: '4px 10px', fontSize: '11px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {showUnclassified ? 'Hide' : 'Review'} {parseResult.counts.unclassified} unclassified feature(s)
              </button>
              {showUnclassified && (
                <div style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '11px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#fef2f2' }}>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Name</th>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Type</th>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Folder</th>
                        <th style={{ padding: '4px 6px', textAlign: 'right' }}>Lat</th>
                        <th style={{ padding: '4px 6px', textAlign: 'right' }}>Lng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(parseResult.unclassified || []).map((u, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #fee2e2' }}>
                          <td style={{ padding: '3px 6px' }}>{u.name}</td>
                          <td style={{ padding: '3px 6px', color: '#666' }}>{u.geometry_type}</td>
                          <td style={{ padding: '3px 6px', color: '#999', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.folder_path}</td>
                          <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{u.lat?.toFixed(4)}</td>
                          <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{u.lng?.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Confirmation buttons */}
          {pendingConfirmation && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
              <button onClick={confirmWithUnclassified}
                style={{ padding: '8px 16px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                Accept — keep route active
              </button>
              <button onClick={rejectWithUnclassified}
                style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                Reject — deactivate route{parseResult.superseded_route_id ? ' and restore previous' : ''}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upload section */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '14px', borderRadius: '6px', border: '1px solid #dee2e6' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
              Layer Type <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <select
              value={layerType}
              onChange={e => setLayerType(e.target.value)}
              style={{ width: '100%', padding: '8px', border: `1px solid ${!layerType && error ? '#dc2626' : '#ced4da'}`, borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
            >
              {LAYER_TYPES.map(lt => (
                <option key={lt.value} value={lt.value}>{lt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Route Name</label>
            <input type="text" value={routeName} onChange={e => setRouteName(e.target.value)}
              placeholder="Auto-generated from filename if blank"
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box', fontSize: '13px' }} />
          </div>

          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional notes"
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box', fontSize: '13px' }} />
          </div>
        </div>

        {/* Supersede warning — shows specific route name */}
        {supersededRoute && (
          <div style={{ padding: '8px 12px', marginBottom: '10px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', fontSize: '12px', color: '#92400e' }}>
            Uploading a new <strong>{layerType}</strong> layer will supersede: <strong>{supersededRoute.name}</strong> (uploaded {new Date(supersededRoute.created_at).toLocaleDateString()}). The previous layer will be kept in history.
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => {
            if (!layerType) { setError('Please select a layer type before uploading'); return }
            fileInputRef.current?.click()
          }}
          style={{
            border: `2px dashed ${dragOver ? '#059669' : '#ced4da'}`,
            borderRadius: '8px', padding: '24px 20px', textAlign: 'center',
            backgroundColor: dragOver ? '#f0fff0' : '#fff',
            cursor: 'pointer', transition: 'all 0.2s',
            opacity: !layerType ? 0.6 : 1,
          }}
        >
          <input ref={fileInputRef} type="file" accept=".kmz" onChange={handleFileSelect} style={{ display: 'none' }} />
          {uploading ? (
            <p style={{ color: '#059669', fontWeight: '600', margin: 0 }}>Uploading to storage...</p>
          ) : parsing ? (
            <p style={{ color: '#2563eb', fontWeight: '600', margin: 0 }}>Parsing KML data — this may take a moment...</p>
          ) : (
            <>
              <p style={{ fontSize: '14px', color: '#333', margin: '0 0 4px 0', fontWeight: '600' }}>
                Drop a .kmz file here or click to browse
              </p>
              <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
                {layerType ? `Will be parsed as "${layerType}" layer` : 'Select a layer type first'}
              </p>
            </>
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '4px', color: '#721c24', fontSize: '13px' }}>
          {error}
        </div>
      )}
    </div>
  )
}
