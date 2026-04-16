import React, { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

export default function KMZUpload({ organizationId }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [description, setDescription] = useState('')
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
      .order('uploaded_at', { ascending: false })
    setFiles(data || [])
    setLoading(false)
  }

  async function handleUpload(file) {
    if (!file || !file.name.toLowerCase().endsWith('.kmz')) {
      setError('Only .kmz files are accepted')
      return
    }

    setUploading(true)
    setError('')

    try {
      const path = `${organizationId}/${file.name}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('kmz-files')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage.from('kmz-files').getPublicUrl(path)

      // Save record
      const { error: dbError } = await supabase.from('kmz_uploads').insert({
        organization_id: organizationId,
        filename: file.name,
        storage_path: path,
        description: description || file.name,
      })

      if (dbError) throw dbError

      setDescription('')
      await loadFiles()
    } catch (err) {
      setError('Upload failed: ' + err.message)
    }
    setUploading(false)
  }

  async function handleDelete(kmzFile) {
    if (!confirm(`Remove "${kmzFile.filename}"?`)) return
    await supabase.from('kmz_uploads')
      .update({ is_active: false })
      .eq('id', kmzFile.id)
    await loadFiles()
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
      {/* Existing files */}
      {loading ? (
        <p style={{ color: '#666', fontSize: '13px' }}>Loading KMZ files...</p>
      ) : files.length > 0 ? (
        <div style={{ marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Filename</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Uploaded</th>
                <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map(f => {
                const { data: urlData } = supabase.storage.from('kmz-files').getPublicUrl(f.storage_path)
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '8px' }}>
                      <a href={urlData?.publicUrl} download style={{ color: '#007bff', textDecoration: 'none' }}>
                        {f.filename}
                      </a>
                    </td>
                    <td style={{ padding: '8px', color: '#666' }}>{f.description || '—'}</td>
                    <td style={{ padding: '8px', color: '#666', fontSize: '12px' }}>
                      {new Date(f.uploaded_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDelete(f)}
                        style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: '#999', fontSize: '13px', fontStyle: 'italic', marginBottom: '16px' }}>No KMZ files uploaded yet</p>
      )}

      {/* Description input */}
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g., North Line As-Built April 2026"
          style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box', fontSize: '13px' }}
        />
      </div>

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#28a745' : '#ced4da'}`,
          borderRadius: '8px',
          padding: '30px 20px',
          textAlign: 'center',
          backgroundColor: dragOver ? '#f0fff0' : '#f8f9fa',
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
              Pipeline centerline, as-built, or KP reference files
            </p>
          </>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '4px', color: '#721c24', fontSize: '13px' }}>
          {error}
        </div>
      )}
    </div>
  )
}
