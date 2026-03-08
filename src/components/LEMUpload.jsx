import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { useAuth } from '../AuthContext.jsx'
import { parseLEMFile, pdfToImages } from '../utils/lemParser.js'
import LEMClassificationReview from './LEMClassificationReview.jsx'
import ContractorProfileWizard from './ContractorProfileWizard.jsx'

export default function LEMUpload({ onUploadComplete }) {
  const { userProfile } = useAuth()
  const { getOrgId, addOrgFilter } = useOrgQuery()
  const fileInputRef = useRef(null)

  // Contractor profiles
  const [profiles, setProfiles] = useState([])
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [showNewProfile, setShowNewProfile] = useState(false)

  // Form fields
  const [contractorName, setContractorName] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [lemNumber, setLemNumber] = useState('')
  const [file, setFile] = useState(null)

  // Processing state
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [errors, setErrors] = useState([])
  const [preview, setPreview] = useState(null)

  // Classification review state
  const [flaggedPages, setFlaggedPages] = useState([])
  const [classifications, setClassifications] = useState([])
  const [flaggedImages, setFlaggedImages] = useState([])
  const [showReview, setShowReview] = useState(false)

  // Load contractor profiles
  useEffect(() => {
    loadProfiles()
  }, [])

  async function loadProfiles() {
    try {
      const orgId = getOrgId()
      if (!orgId) return
      const { data } = await supabase
        .from('contractor_lem_profiles')
        .select('id, contractor_name, po_number, classification_guide, corrections_count')
        .eq('organization_id', orgId)
        .order('contractor_name')
      setProfiles(data || [])
    } catch (err) {
      console.error('Failed to load profiles:', err)
    }
  }

  function getSelectedProfile() {
    if (!selectedProfileId) return null
    return profiles.find(p => p.id === selectedProfileId) || null
  }

  // When profile is selected, auto-fill contractor name
  function handleProfileSelect(profileId) {
    setSelectedProfileId(profileId)
    const profile = profiles.find(p => p.id === profileId)
    if (profile) {
      setContractorName(profile.contractor_name)
    }
  }

  async function handleParse() {
    if (!file) return
    setUploading(true)
    setErrors([])
    setPreview(null)
    setFlaggedPages([])
    setClassifications([])
    setShowReview(false)

    try {
      const files = Array.isArray(file) ? file : [file]
      let allPairs = []
      let allErrors = []
      let allClassifications = []
      let allFlagged = []
      let firstDocInfo = null
      const profile = getSelectedProfile()

      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        if (files.length > 1) setProgress(`Processing file ${i + 1} of ${files.length}: ${f.name}...`)

        const result = await parseLEMFile(f, setProgress, null, null, profile)
        allPairs = allPairs.concat(result.pairs)
        allErrors = allErrors.concat(result.errors.map(e => files.length > 1 ? `${f.name}: ${e}` : e))
        allClassifications = allClassifications.concat(result.classifications || [])
        allFlagged = allFlagged.concat(result.flaggedPages || [])
        if (!firstDocInfo && result.documentInfo?.contractor_name) firstDocInfo = result.documentInfo
      }

      setErrors(allErrors)
      setClassifications(allClassifications)

      // If there are flagged pages, render their thumbnails and show review
      if (allFlagged.length > 0) {
        setFlaggedPages(allFlagged)
        setProgress('Rendering flagged page thumbnails...')
        const f = Array.isArray(file) ? file[0] : file
        const images = await pdfToImages(f, Math.max(...allFlagged.map(fp => fp.pageIndex + 1)), setProgress)
        setFlaggedImages(images)
        setShowReview(true)
      }

      if (allPairs.length > 0) {
        setPreview({ pairs: allPairs, documentInfo: firstDocInfo })
      } else if (allErrors.length === 0 && allFlagged.length === 0) {
        setErrors(['No LEM/ticket pairs found. The file(s) may not contain recognizable LEM data.'])
      }

      // Auto-fill fields
      if (firstDocInfo) {
        if (firstDocInfo.contractor_name && !contractorName.trim()) setContractorName(firstDocInfo.contractor_name)
        if (firstDocInfo.period_start && !periodStart) setPeriodStart(firstDocInfo.period_start)
        if (firstDocInfo.period_end && !periodEnd) setPeriodEnd(firstDocInfo.period_end)
        if (firstDocInfo.lem_number && !lemNumber.trim()) setLemNumber(firstDocInfo.lem_number)
      }
    } catch (err) {
      setErrors([`Parse failed: ${err.message}`])
    }
    setProgress('')
    setUploading(false)
  }

  function handleClassificationCorrection(pageIndex, newType) {
    setClassifications(prev => {
      const next = [...prev]
      if (next[pageIndex]) {
        next[pageIndex] = { ...next[pageIndex], page_type: newType, confidence: 1.0, corrected: true }
      }
      return next
    })
  }

  function handleConfirmClassifications() {
    setShowReview(false)
    // Save corrections to the profile if we have one
    const profile = getSelectedProfile()
    if (profile) {
      const correctedPages = classifications.filter(c => c?.corrected)
      if (correctedPages.length > 0) {
        supabase.from('contractor_lem_profiles')
          .update({
            corrections: [...(profile.corrections || []), ...correctedPages.map(c => ({ page_type: c.page_type, date: c.date }))],
            corrections_count: (profile.corrections_count || 0) + correctedPages.length,
            updated_at: new Date().toISOString()
          })
          .eq('id', profile.id)
          .then(() => console.log('Profile corrections saved'))
      }
    }
  }

  async function handleSave() {
    if (!preview || preview.pairs.length === 0) return
    if (!contractorName.trim()) {
      setErrors(['Contractor name is required before saving.'])
      return
    }
    setUploading(true)

    try {
      const orgId = getOrgId()
      const profile = getSelectedProfile()

      // Upload original PDF(s) to storage
      let sourceFileUrl = null
      const files = Array.isArray(file) ? file : file ? [file] : []
      const sourceFilename = files.map(f => f.name).join(', ')
      for (const f of files) {
        const filePath = `lem-uploads/${orgId}/${Date.now()}-${f.name}`
        const { error: storageErr } = await supabase.storage.from('lem-uploads').upload(filePath, f)
        if (!storageErr && !sourceFileUrl) {
          const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(filePath)
          sourceFileUrl = urlData?.publicUrl || null
        }
      }

      // Create parent LEM record with profile reference
      const { data: lemRecord, error: lemErr } = await supabase
        .from('contractor_lem_uploads')
        .insert({
          organization_id: orgId,
          uploaded_by: userProfile?.id || null,
          contractor_name: contractorName.trim(),
          lem_period_start: periodStart || null,
          lem_period_end: periodEnd || null,
          lem_number: lemNumber.trim() || null,
          source_filename: sourceFilename,
          source_file_url: sourceFileUrl,
          profile_id: profile?.id || null,
          po_number: profile?.po_number || null,
          total_claimed: 0,
          status: 'uploaded'
        })
        .select()
        .single()

      if (lemErr) throw lemErr

      // Re-parse with lemId to upload images and create pair records
      setProgress('Uploading page images and creating pairs...')
      let totalPairs = 0
      for (const f of files) {
        const { pairs, errors: uploadErrors } = await parseLEMFile(f, setProgress, lemRecord.id, orgId, profile)
        totalPairs += pairs.length
        if (uploadErrors.length > 0) {
          setErrors(prev => [...prev, ...uploadErrors])
        }
      }

      // Update the LEM record status
      await supabase.from('contractor_lem_uploads')
        .update({ status: 'parsed', total_claimed: totalPairs })
        .eq('id', lemRecord.id)

      alert(`Saved: ${totalPairs} LEM/ticket pairs ready for visual reconciliation.`)
      resetForm()
      onUploadComplete?.()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  function resetForm() {
    setFile(null)
    setPreview(null)
    setContractorName('')
    setPeriodStart('')
    setPeriodEnd('')
    setLemNumber('')
    setSelectedProfileId('')
    setErrors([])
    setProgress('')
    setFlaggedPages([])
    setClassifications([])
    setShowReview(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // New profile wizard inline
  if (showNewProfile) {
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <ContractorProfileWizard
          organizationId={getOrgId()}
          onComplete={() => {
            setShowNewProfile(false)
            loadProfiles()
            alert('Contractor profile created! You can now select it from the dropdown.')
          }}
          onCancel={() => setShowNewProfile(false)}
        />
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h3 style={{ margin: '0 0 16px 0' }}>Upload Contractor LEM</h3>

      {/* Contractor profile selector */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '16px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
            Contractor Profile
          </label>
          <select
            value={selectedProfileId}
            onChange={e => handleProfileSelect(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', backgroundColor: 'white' }}
          >
            <option value="">-- No profile (text-based classification) --</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.po_number ? `${p.po_number} — ` : ''}{p.contractor_name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowNewProfile(true)}
          style={{ padding: '8px 14px', fontSize: '13px', border: '1px solid #2563eb', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'white', color: '#2563eb', fontWeight: '500', whiteSpace: 'nowrap' }}
        >
          + New Profile
        </button>
      </div>

      {selectedProfileId && (
        <div style={{ fontSize: '12px', color: '#059669', backgroundColor: '#f0fdf4', padding: '8px 12px', borderRadius: '6px', marginBottom: '16px', border: '1px solid #bbf7d0' }}>
          Using Claude Vision classification with {getSelectedProfile()?.contractor_name} profile.
          {getSelectedProfile()?.corrections_count > 0 && ` (${getSelectedProfile().corrections_count} corrections applied)`}
        </div>
      )}

      {!selectedProfileId && profiles.length === 0 && (
        <div style={{ fontSize: '12px', color: '#92400e', backgroundColor: '#fffbeb', padding: '8px 12px', borderRadius: '6px', marginBottom: '16px', border: '1px solid #fde68a' }}>
          No contractor profiles set up yet. For scanned PDFs, create a profile first — text-based classification only works for digital/typed PDFs.
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/*"
          multiple
          onChange={e => {
            const files = Array.from(e.target.files || [])
            setFile(files.length === 1 ? files[0] : files.length > 1 ? files : null)
            setPreview(null); setErrors([]); setShowReview(false)
          }}
          style={{ flex: 1 }}
        />
        <button
          onClick={handleParse}
          disabled={!file || uploading}
          style={{ padding: '8px 20px', backgroundColor: uploading ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: '500', whiteSpace: 'nowrap' }}
        >
          {uploading ? 'Processing...' : Array.isArray(file) ? `Parse ${file.length} LEMs` : 'Parse LEM'}
        </button>
      </div>

      {/* Progress indicator */}
      {uploading && (
        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '20px', height: '20px', border: '3px solid #2563eb', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: '600', color: '#1e40af', fontSize: '14px' }}>{progress || 'Starting...'}</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                {selectedProfileId
                  ? 'Vision classification may take several minutes for large files. Progress is saved — you can safely refresh.'
                  : 'Large files may take several minutes. Do not close this tab.'}
              </p>
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '8px 12px', marginBottom: '12px' }}>
          {errors.map((e, i) => <p key={i} style={{ margin: '4px 0', fontSize: '13px', color: '#b91c1c' }}>{e}</p>)}
        </div>
      )}

      {/* Classification review for flagged pages */}
      {showReview && flaggedPages.length > 0 && (
        <LEMClassificationReview
          flaggedPages={flaggedPages}
          pageImages={flaggedImages}
          onCorrect={handleClassificationCorrection}
          onConfirm={handleConfirmClassifications}
          totalPages={classifications.length}
          classifications={classifications}
        />
      )}

      {preview && (
        <div>
          <h4 style={{ margin: '16px 0 8px 0' }}>
            {preview.pairs.length} LEM/Ticket Pairs Found
          </h4>

          {/* Document info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Contractor Name *</label>
              <input value={contractorName} onChange={e => setContractorName(e.target.value)} placeholder="Auto-filled from profile" style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Period Start</label>
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Period End</label>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>LEM Reference #</label>
              <input value={lemNumber} onChange={e => setLemNumber(e.target.value)} placeholder="Auto-filled from LEM" style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Pair summary table */}
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Pair #</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Crew</th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>LEM Pages</th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Ticket Pages</th>
                </tr>
              </thead>
              <tbody>
                {preview.pairs.map((pair, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '500' }}>{idx + 1}</td>
                    <td style={{ padding: '6px 8px' }}>{pair.work_date || '-'}</td>
                    <td style={{ padding: '6px 8px' }}>{pair.crew_name || '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{pair.lem_pages || 0}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: (pair.ticket_pages || 0) === 0 ? '#dc2626' : 'inherit' }}>
                      {pair.ticket_pages || 0}{(pair.ticket_pages || 0) === 0 ? ' (missing)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button onClick={resetForm}
              style={{ padding: '8px 16px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={uploading}
              style={{ padding: '8px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
              Save & Upload Images
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
