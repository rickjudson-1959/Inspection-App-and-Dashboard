import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { useAuth } from '../AuthContext.jsx'
import { parseLEMFile, saveParsedPairs, pdfToImages, groupPagesWithProfile, groupSequential, buildPairsFromGroups } from '../utils/lemParser.js'
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

  // Upload mode: 'combined' (single bundle) or 'separate' (LEM + tickets independently)
  const [uploadMode, setUploadMode] = useState('combined')

  // Form fields
  const [contractorName, setContractorName] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [lemNumber, setLemNumber] = useState('')
  const [file, setFile] = useState(null)

  // Separate mode: distinct files for LEM and tickets
  const [lemFile, setLemFile] = useState(null)
  const [ticketFiles, setTicketFiles] = useState([])
  const lemFileInputRef = useRef(null)
  const ticketFileInputRef = useRef(null)

  // Processing state
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [errors, setErrors] = useState([])
  const [preview, setPreview] = useState(null)
  const [rawPairs, setRawPairs] = useState([]) // full pair structures from classification

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
    setRawPairs([])
    setFlaggedPages([])
    setClassifications([])
    setShowReview(false)

    try {
      const files = Array.isArray(file) ? file : [file]
      let allPairs = []
      let allRawPairs = []
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
        allRawPairs = allRawPairs.concat(result.rawPairs || [])
        allErrors = allErrors.concat(result.errors.map(e => files.length > 1 ? `${f.name}: ${e}` : e))
        allClassifications = allClassifications.concat(result.classifications || [])
        allFlagged = allFlagged.concat(result.flaggedPages || [])
        if (!firstDocInfo && result.documentInfo?.contractor_name) firstDocInfo = result.documentInfo
      }

      setRawPairs(allRawPairs)

      setErrors(allErrors)
      setClassifications(allClassifications)

      // Show classification review:
      //   - With profile: only show flagged (low-confidence) pages
      //   - Without profile: show ALL pages so user can correct text-based misclassifications
      const pagesToReview = profile
        ? allFlagged
        : allClassifications.map((cls, idx) => ({ ...cls, pageIndex: idx })).filter(c => c.page_type === 'lem' || c.page_type === 'daily_ticket' || c.page_type === 'unknown')

      if (pagesToReview.length > 0) {
        setFlaggedPages(pagesToReview)
        setProgress('Rendering page thumbnails for review...')
        const f = Array.isArray(file) ? file[0] : file
        const maxPage = Math.max(...pagesToReview.map(fp => fp.pageIndex + 1))
        const images = await pdfToImages(f, maxPage, setProgress)
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

  // --- Separate mode: LEM file + ticket files uploaded independently ---
  // Each ticket FILE = one complete ticket (may have multiple pages).
  // LEM file = all pages are LEM summary pages.
  // We render images, upload to storage, and create pair records directly.
  async function handleParseSeparate() {
    if (!lemFile) { setErrors(['LEM summary file is required']); return }
    setUploading(true)
    setErrors([])
    setPreview(null)
    setRawPairs([])
    setShowReview(false)

    try {
      // Render LEM pages as images
      setProgress('Rendering LEM pages...')
      const lemImages = await pdfToImages(lemFile, 500, setProgress)
      setProgress(`${lemImages.length} LEM pages rendered.`)

      // Render each ticket file as images (all pages of one file = one ticket)
      const ticketGroups = [] // each entry: { fileName, images: [base64...] }
      for (let i = 0; i < ticketFiles.length; i++) {
        const tf = ticketFiles[i]
        setProgress(`Rendering ticket ${i + 1} of ${ticketFiles.length}: ${tf.name}...`)
        if (tf.type === 'application/pdf') {
          const imgs = await pdfToImages(tf, 100, setProgress)
          ticketGroups.push({ fileName: tf.name, images: imgs })
        } else {
          // Image file — read as base64
          const b64 = await new Promise(resolve => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result.split(',')[1])
            reader.readAsDataURL(tf)
          })
          ticketGroups.push({ fileName: tf.name, images: [b64] })
        }
      }

      // Build preview: one pair per ticket file (or one pair per LEM page if no tickets)
      const pairCount = Math.max(ticketGroups.length, lemImages.length > 0 ? 1 : 0)
      const pairs = []
      for (let i = 0; i < pairCount; i++) {
        pairs.push({
          pair_index: i,
          work_date: null,
          crew_name: null,
          lem_pages: i === 0 ? lemImages.length : 0,
          ticket_pages: ticketGroups[i]?.images?.length || 0,
          ticket_file: ticketGroups[i]?.fileName || null,
          // Store rendered images for save step
          _lemImages: i === 0 ? lemImages : [],
          _ticketImages: ticketGroups[i]?.images || []
        })
      }

      // Store for save
      setRawPairs(pairs)
      setPreview({ pairs, documentInfo: null, separateMode: true })

      setProgress('')
    } catch (err) {
      setErrors([`Parse failed: ${err.message}`])
      setProgress('')
    }
    setUploading(false)
  }

  // Save handler for separate mode — uploads images directly, creates pair records with URLs
  async function handleSaveSeparate() {
    if (!preview || !rawPairs.length) return
    if (!contractorName.trim()) { setErrors(['Contractor name is required']); return }
    setUploading(true)

    try {
      const orgId = getOrgId()

      // Upload source files to storage
      setProgress('Uploading files to storage...')
      let sourceFileUrl = null
      const allFiles = [lemFile, ...ticketFiles].filter(Boolean)
      const sourceFilename = allFiles.map(f => f.name).join(', ')
      for (const f of allFiles) {
        const filePath = `${orgId}/${Date.now()}-${f.name}`
        const { error: storageErr } = await supabase.storage.from('lem-uploads').upload(filePath, f)
        if (!storageErr && !sourceFileUrl) {
          const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(filePath)
          sourceFileUrl = urlData?.publicUrl || null
        }
      }

      // Create parent LEM record
      setProgress('Creating LEM record...')
      const profile = getSelectedProfile()
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
          total_claimed: rawPairs.length,
          status: 'parsed'
        })
        .select()
        .single()
      if (lemErr) throw lemErr

      // Upload rendered images and create pair records
      const base64ToBlob = (b64) => {
        const bytes = atob(b64)
        const arr = new Uint8Array(bytes.length)
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
        return new Blob([arr], { type: 'image/jpeg' })
      }

      for (let p = 0; p < rawPairs.length; p++) {
        const pair = rawPairs[p]
        setProgress(`Uploading images for pair ${p + 1} of ${rawPairs.length}...`)

        // Upload LEM page images
        const lemUrls = []
        for (let i = 0; i < (pair._lemImages || []).length; i++) {
          const path = `${lemRecord.id}/lem_pages/pair${p}_page${i}.jpg`
          const { error } = await supabase.storage.from('lem-uploads').upload(path, base64ToBlob(pair._lemImages[i]))
          if (!error) {
            const { data } = supabase.storage.from('lem-uploads').getPublicUrl(path)
            lemUrls.push(data?.publicUrl)
          }
        }

        // Upload ticket page images
        const ticketUrls = []
        for (let i = 0; i < (pair._ticketImages || []).length; i++) {
          const path = `${lemRecord.id}/ticket_pages/pair${p}_page${i}.jpg`
          const { error } = await supabase.storage.from('lem-uploads').upload(path, base64ToBlob(pair._ticketImages[i]))
          if (!error) {
            const { data } = supabase.storage.from('lem-uploads').getPublicUrl(path)
            ticketUrls.push(data?.publicUrl)
          }
        }

        // Insert pair record with URLs already populated
        await supabase.from('lem_reconciliation_pairs').insert({
          lem_upload_id: lemRecord.id,
          organization_id: orgId,
          pair_index: p,
          work_date: pair.work_date || null,
          crew_name: pair.crew_name || null,
          lem_page_urls: lemUrls,
          lem_page_indices: [],
          contractor_ticket_urls: ticketUrls,
          contractor_ticket_indices: [],
          po_number: profile?.po_number || null,
          status: 'pending'
        })
      }

      setProgress('Done!')
      resetForm()
      onUploadComplete?.(lemRecord)
    } catch (err) {
      console.error('Separate save error:', err)
      setErrors([`Save failed: ${err.message}`])
    }
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

    // Rebuild pairs from corrected classifications
    const hasCorrected = classifications.some(c => c?.corrected)
    if (hasCorrected) {
      console.log('[LEM Upload] Rebuilding pairs from corrected classifications...')
      const groups = profile
        ? groupPagesWithProfile(classifications)
        : groupSequential(
            classifications.map((c, i) => ({ ...c, originalIndex: i }))
              .filter(c => c.page_type === 'lem' || c.page_type === 'daily_ticket')
          )
      const newPairs = buildPairsFromGroups(groups)

      console.log(`[LEM Upload] Rebuilt: ${newPairs.length} pairs from ${groups.length} groups`)
      setRawPairs(newPairs)

      const pairSummaries = newPairs.map((pair, p) => {
        const allCls = [...(pair.lem?.classifications || []), ...(pair.ticket?.classifications || [])]
        return {
          pair_index: p,
          work_date: allCls.find(c => c.date)?.date || null,
          crew_name: allCls.find(c => c.crew)?.crew || null,
          lem_pages: pair.lem?.pageIndices?.length || 0,
          ticket_pages: pair.ticket?.pageIndices?.length || 0
        }
      })

      if (pairSummaries.length > 0) {
        setPreview(prev => ({ ...prev, pairs: pairSummaries }))
      }
    }
  }

  async function handleSave() {
    console.log('[LEM Save] handleSave clicked', { preview: !!preview, pairCount: preview?.pairs?.length, rawPairCount: rawPairs?.length })
    if (!preview || preview.pairs.length === 0) {
      console.warn('[LEM Save] No preview pairs — aborting')
      return
    }
    if (!contractorName.trim()) {
      setErrors(['Contractor name is required before saving.'])
      return
    }
    setUploading(true)
    setProgress('Creating LEM record...')

    try {
      const orgId = getOrgId()
      const profile = getSelectedProfile()

      // Upload original PDF(s) to storage
      let sourceFileUrl = null
      const allFiles = uploadMode === 'separate'
        ? [lemFile, ...ticketFiles].filter(Boolean)
        : Array.isArray(file) ? file : file ? [file] : []
      const files = allFiles
      const sourceFilename = files.map(f => f.name).join(', ')
      for (const f of files) {
        const filePath = `${orgId}/${Date.now()}-${f.name}`
        const { error: storageErr } = await supabase.storage.from('lem-uploads').upload(filePath, f)
        if (!storageErr && !sourceFileUrl) {
          const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(filePath)
          sourceFileUrl = urlData?.publicUrl || null
        }
      }

      // Create parent LEM record
      console.log('[LEM Save] Creating contractor_lem_uploads record...')
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
      console.log('[LEM Save] Created LEM record:', lemRecord.id)

      // Save pair records to DB (fast — no image rendering)
      setProgress('Saving pairs...')
      const f = uploadMode === 'separate' ? lemFile : (Array.isArray(file) ? file[0] : file)
      const { pairs: savedPairs, errors: saveErrors } = await saveParsedPairs(
        f, setProgress, lemRecord.id, orgId, rawPairs, profile?.po_number
      )
      const totalPairs = savedPairs.length
      console.log(`[LEM Save] saveParsedPairs returned: ${totalPairs} pairs, ${saveErrors.length} errors`)

      if (saveErrors.length > 0) {
        console.warn('[LEM Save] Save errors:', saveErrors)
        setErrors(prev => [...prev, ...saveErrors])
      }

      if (totalPairs === 0) {
        alert('Save failed — no pairs were created. Check console for errors.')
        return
      }

      // Update the LEM record status
      await supabase.from('contractor_lem_uploads')
        .update({ status: 'parsed', total_claimed: totalPairs })
        .eq('id', lemRecord.id)

      console.log(`[LEM Save] Done. ${totalPairs} pairs saved. Navigating to review...`)

      // Navigate immediately — images upload in background
      resetForm()
      onUploadComplete?.(lemRecord)
    } catch (err) {
      console.error('[LEM Save] handleSave error:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  function resetForm() {
    setFile(null)
    setLemFile(null)
    setTicketFiles([])
    setPreview(null)
    setRawPairs([])
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
    if (lemFileInputRef.current) lemFileInputRef.current.value = ''
    if (ticketFileInputRef.current) ticketFileInputRef.current.value = ''
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

      {/* Upload mode toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => { setUploadMode('combined'); resetForm() }}
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '500', fontSize: '13px',
            backgroundColor: uploadMode === 'combined' ? '#2563eb' : '#e5e7eb',
            color: uploadMode === 'combined' ? 'white' : '#374151' }}>
          Combined PDF
        </button>
        <button onClick={() => { setUploadMode('separate'); resetForm() }}
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '500', fontSize: '13px',
            backgroundColor: uploadMode === 'separate' ? '#2563eb' : '#e5e7eb',
            color: uploadMode === 'separate' ? 'white' : '#374151' }}>
          Separate Files
        </button>
        <span style={{ fontSize: '12px', color: '#6b7280', alignSelf: 'center', marginLeft: '8px' }}>
          {uploadMode === 'combined'
            ? 'Single PDF bundle with LEM summaries and daily tickets mixed together'
            : 'Upload LEM summary and daily tickets as separate files'}
        </span>
      </div>

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

      {/* Combined mode: single file input */}
      {uploadMode === 'combined' && (
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
      )}

      {/* Separate mode: LEM file + ticket files */}
      {uploadMode === 'separate' && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                LEM Summary File (PDF) *
              </label>
              <input
                ref={lemFileInputRef}
                type="file"
                accept=".pdf"
                onChange={e => {
                  setLemFile(e.target.files?.[0] || null)
                  setPreview(null); setErrors([])
                }}
                style={{ width: '100%' }}
              />
              {lemFile && <span style={{ fontSize: '11px', color: '#059669', marginTop: '4px', display: 'block' }}>{lemFile.name}</span>}
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                Daily Tickets (PDF or images — multiple allowed)
              </label>
              <input
                ref={ticketFileInputRef}
                type="file"
                accept=".pdf,image/*"
                multiple
                onChange={e => {
                  setTicketFiles(Array.from(e.target.files || []))
                  setPreview(null); setErrors([])
                }}
                style={{ width: '100%' }}
              />
              {ticketFiles.length > 0 && <span style={{ fontSize: '11px', color: '#059669', marginTop: '4px', display: 'block' }}>{ticketFiles.length} file(s) selected</span>}
            </div>
          </div>
          <button
            onClick={handleParseSeparate}
            disabled={!lemFile || uploading}
            style={{ padding: '8px 20px', backgroundColor: uploading ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: '500' }}
          >
            {uploading ? 'Processing...' : 'Parse Files'}
          </button>
        </div>
      )}

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
                  {preview.separateMode && <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Ticket File</th>}
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
                    {preview.separateMode && <td style={{ padding: '6px 8px', fontSize: '11px', color: '#6b7280' }}>{pair.ticket_file || '-'}</td>}
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
            <button onClick={preview?.separateMode ? handleSaveSeparate : handleSave} disabled={uploading}
              style={{ padding: '8px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
              {preview?.separateMode ? 'Save & Upload' : 'Save & Upload Images'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
