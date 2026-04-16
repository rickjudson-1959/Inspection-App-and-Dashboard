import React, { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

export default function KMZUpload({ organizationId }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [description, setDescription] = useState('')
  const [groupName, setGroupName] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('__new__')
  const [expandedGroups, setExpandedGroups] = useState({})
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (organizationId) loadFiles()
  }, [organizationId])

  async function loadFiles() {
    setLoading(true)
    const { data } = await supabase
      .from('kmz_uploads')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('group_name', { ascending: true })
      .order('revision', { ascending: false })
    setFiles(data || [])
    setLoading(false)
  }

  // Group files by group_name
  const groups = {}
  for (const f of files) {
    const gn = f.group_name || f.filename
    if (!groups[gn]) groups[gn] = []
    groups[gn].push(f)
  }
  const groupNames = Object.keys(groups).sort()

  async function handleUpload(file) {
    if (!file || !file.name.toLowerCase().endsWith('.kmz')) {
      setError('Only .kmz files are accepted')
      return
    }

    const isNewGroup = selectedGroup === '__new__'
    const gn = isNewGroup ? (groupName.trim() || file.name.replace('.kmz', '')) : selectedGroup

    if (!gn) {
      setError('Please enter a group name or select an existing group')
      return
    }

    setUploading(true)
    setError('')

    try {
      const path = `${organizationId}/${Date.now()}_${file.name}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('kmz-files')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      // Calculate next revision number
      const existingInGroup = groups[gn] || []
      const maxRev = existingInGroup.reduce((max, f) => Math.max(max, f.revision || 0), -1)
      const nextRev = maxRev + 1

      // Mark all previous revisions in this group as not current
      if (existingInGroup.length > 0) {
        const ids = existingInGroup.filter(f => f.is_current).map(f => f.id)
        if (ids.length > 0) {
          for (const id of ids) {
            await supabase.from('kmz_uploads').update({ is_current: false }).eq('id', id)
          }
        }
      }

      // Insert new record as current
      const { error: dbError } = await supabase.from('kmz_uploads').insert({
        organization_id: organizationId,
        filename: file.name,
        storage_path: path,
        description: description || file.name,
        group_name: gn,
        revision: nextRev,
        is_current: true,
      })

      if (dbError) throw dbError

      setDescription('')
      setGroupName('')
      setSelectedGroup('__new__')
      await loadFiles()
    } catch (err) {
      setError('Upload failed: ' + err.message)
    }
    setUploading(false)
  }

  async function handleDelete(kmzFile) {
    if (!confirm(`Remove "${kmzFile.filename}" (Rev ${kmzFile.revision})?`)) return
    await supabase.from('kmz_uploads')
      .update({ is_active: false })
      .eq('id', kmzFile.id)

    // If this was the current revision, make the previous one current
    if (kmzFile.is_current && kmzFile.group_name) {
      const group = (groups[kmzFile.group_name] || []).filter(f => f.id !== kmzFile.id && f.is_active)
      if (group.length > 0) {
        const newest = group.sort((a, b) => (b.revision || 0) - (a.revision || 0))[0]
        await supabase.from('kmz_uploads').update({ is_current: true }).eq('id', newest.id)
      }
    }
    await loadFiles()
  }

  function toggleGroup(gn) {
    setExpandedGroups(prev => ({ ...prev, [gn]: !prev[gn] }))
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

  return (
    <div>
      {/* Existing files grouped by group_name */}
      {loading ? (
        <p style={{ color: '#666', fontSize: '13px' }}>Loading KMZ files...</p>
      ) : groupNames.length > 0 ? (
        <div style={{ marginBottom: '16px' }}>
          {groupNames.map(gn => {
            const groupFiles = groups[gn]
            const current = groupFiles.find(f => f.is_current) || groupFiles[0]
            const history = groupFiles.filter(f => f.id !== current.id)
            const isExpanded = expandedGroups[gn]
            const { data: urlData } = supabase.storage.from('kmz-files').getPublicUrl(current.storage_path)

            return (
              <div key={gn} style={{ marginBottom: '8px', border: '1px solid #dee2e6', borderRadius: '6px', overflow: 'hidden' }}>
                {/* Current revision header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f8f9fa' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#333' }}>{gn}</div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                      <a href={urlData?.publicUrl} download style={{ color: '#007bff', textDecoration: 'none' }}>
                        {current.filename}
                      </a>
                      <span style={{ marginLeft: '8px', padding: '1px 6px', borderRadius: '10px', backgroundColor: '#d4edda', color: '#155724', fontSize: '10px', fontWeight: '600' }}>
                        Rev {current.revision}
                      </span>
                      <span style={{ marginLeft: '8px', color: '#999', fontSize: '11px' }}>
                        {new Date(current.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                    {current.description && current.description !== current.filename && (
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{current.description}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {history.length > 0 && (
                      <button
                        onClick={() => toggleGroup(gn)}
                        style={{ padding: '4px 8px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                      >
                        {isExpanded ? 'Hide' : `${history.length} prev`}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(current)}
                      style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Previous revisions (expandable) */}
                {isExpanded && history.length > 0 && (
                  <div style={{ borderTop: '1px solid #dee2e6' }}>
                    {history.map(f => {
                      const { data: hUrl } = supabase.storage.from('kmz-files').getPublicUrl(f.storage_path)
                      return (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 6px 24px', backgroundColor: '#fff', borderBottom: '1px solid #f0f0f0' }}>
                          <div style={{ fontSize: '12px' }}>
                            <a href={hUrl?.publicUrl} download style={{ color: '#6c757d', textDecoration: 'none' }}>
                              {f.filename}
                            </a>
                            <span style={{ marginLeft: '8px', padding: '1px 6px', borderRadius: '10px', backgroundColor: '#e9ecef', color: '#6c757d', fontSize: '10px' }}>
                              Rev {f.revision}
                            </span>
                            <span style={{ marginLeft: '8px', color: '#999', fontSize: '11px' }}>
                              {new Date(f.uploaded_at).toLocaleDateString()}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDelete(f)}
                            style={{ padding: '2px 6px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}
                          >
                            Remove
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p style={{ color: '#999', fontSize: '13px', fontStyle: 'italic', marginBottom: '16px' }}>No KMZ files uploaded yet</p>
      )}

      {/* Upload section */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '14px', borderRadius: '6px', border: '1px solid #dee2e6' }}>
        {/* Group selector */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
              Add to group
            </label>
            <select
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
            >
              <option value="__new__">+ New group...</option>
              {groupNames.map(gn => (
                <option key={gn} value={gn}>{gn} (Rev {(groups[gn]?.[0]?.revision || 0)})</option>
              ))}
            </select>
          </div>

          {selectedGroup === '__new__' && (
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                Group name
              </label>
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="e.g., North Line As-Built"
                style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box', fontSize: '13px' }}
              />
            </div>
          )}

          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g., Updated with crossings"
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box', fontSize: '13px' }}
            />
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#28a745' : '#ced4da'}`,
            borderRadius: '8px',
            padding: '24px 20px',
            textAlign: 'center',
            backgroundColor: dragOver ? '#f0fff0' : '#fff',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".kmz"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          {uploading ? (
            <p style={{ color: '#28a745', fontWeight: '600', margin: 0 }}>Uploading...</p>
          ) : (
            <>
              <p style={{ fontSize: '14px', color: '#333', margin: '0 0 4px 0', fontWeight: '600' }}>
                Drop a .kmz file here or click to browse
              </p>
              <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
                {selectedGroup === '__new__' ? 'Creates a new file group' : `Adds as Rev ${((groups[selectedGroup]?.[0]?.revision || 0) + 1)} to "${selectedGroup}"`}
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
