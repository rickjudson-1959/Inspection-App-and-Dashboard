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

  // --- Separate mode: parse LEM and ticket files independently ---
  async function handleParseSeparate() {
    if (!lemFile) { setErrors(['LEM file is required']); return }
    setUploading(true)
    setErrors([])
    setPreview(null)
    setRawPairs([])
    setShowReview(false)

    try {
      await ensurePdfJs()

      // Extract dates/crew from LEM pages
      const lemBuffer = await lemFile.arrayBuffer()
      const lemPdf = await window.pdfjsLib.getDocument({ data: lemBuffer }).promise
      const lemPageCount = lemPdf.numPages
      setProgress(`Extracting data from ${lemPageCount} LEM pages...`)

      const lemClassifications = []
      for (let i = 1; i <= lemPageCount; i++) {
        const page = await lemPdf.getPage(i)
        const text = await page.getTextContent()
        const pageText = text.items.map(item => item.str).join(' ')
        lemClassifications.push({
          page_type: 'lem',
          confidence: 1.0,
          date: extractDateFromText(pageText),
          crew: extractCrewFromText(pageText),
          originalIndex: i - 1
        })
      }

      // Extract dates/crew from ticket pages
      const ticketClassifications = []
      let ticketPageOffset = lemPageCount
      const allTicketFiles = ticketFiles.length > 0 ? ticketFiles : []

      for (const tf of allTicketFiles) {
        if (tf.type === 'application/pdf') {
          const tBuffer = await tf.arrayBuffer()
          const tPdf = await window.pdfjsLib.getDocument({ data: tBuffer }).promise
          setProgress(`Extracting data from ${tf.name} (${tPdf.numPages} pages)...`)
          for (let i = 1; i <= tPdf.numPages; i++) {
            const page = await tPdf.getPage(i)
            const text = await page.getTextContent()
            const pageText = text.items.map(item => item.str).join(' ')
            ticketClassifications.push({
              page_type: 'daily_ticket',
              confidence: 1.0,
              date: extractDateFromText(pageText),
              crew: extractCrewFromText(pageText),
              originalIndex: ticketPageOffset++
            })
          }
        } else {
          // Image file — treat as single ticket page
          ticketClassifications.push({
            page_type: 'daily_ticket',
            confidence: 1.0,
            date: null,
            crew: null,
            originalIndex: ticketPageOffset++
          })
        }
      }

      setProgress('Building pairs...')

      // Pair by date matching
      const pairs = []
      const usedTickets = new Set()

      // Group LEM pages by date
      const lemByDate = {}
      lemClassifications.forEach((c, i) => {
        const date = c.date || `lem_page_${i}`
        if (!lemByDate[date]) lemByDate[date] = { classifications: [], pageIndices: [] }
        lemByDate[date].classifications.push(c)
        lemByDate[date].pageIndices.push(i)
      })

      // For each LEM date group, find matching ticket pages
      Object.entries(lemByDate).forEach(([date, lemGroup]) => {
        const matchingTickets = { classifications: [], pageIndices: [] }
        ticketClassifications.forEach((tc, ti) => {
          if (usedTickets.has(ti)) return
          if (tc.date === date || (!tc.date && !usedTickets.has(ti))) {
            // Match by date, or assign unmatched tickets to LEM groups in order
            if (tc.date === date) {
              matchingTickets.classifications.push(tc)
              matchingTickets.pageIndices.push(tc.originalIndex)
              usedTickets.add(ti)
            }
          }
        })

        pairs.push({
          lem: { classifications: lemGroup.classifications, pageIndices: lemGroup.pageIndices },
          ticket: matchingTickets.pageIndices.length > 0 ? matchingTickets : null
        })
      })

      // Assign any remaining unmatched tickets to pairs that have no tickets
      const unmatchedTickets = ticketClassifications.filter((_, i) => !usedTickets.has(i))
      let unmatchedIdx = 0
      pairs.forEach(p => {
        if (!p.ticket && unmatchedIdx < unmatchedTickets.length) {
          const tc = unmatchedTickets[unmatchedIdx++]
          p.ticket = { classifications: [tc], pageIndices: [tc.originalIndex] }
        }
      })

      setRawPairs(pairs)

      const pairSummaries = pairs.map((pair, p) => {
        const allCls = [...(pair.lem?.classifications || []), ...(pair.ticket?.classifications || [])]
        return {
          pair_index: p,
          work_date: allCls.find(c => c.date)?.date || null,
          crew_name: allCls.find(c => c.crew)?.crew || null,
          lem_pages: pair.lem?.pageIndices?.length || 0,
          ticket_pages: pair.ticket?.pageIndices?.length || 0
        }
      })

      setClassifications([...lemClassifications, ...ticketClassifications])

      if (pairSummaries.length > 0) {
        setPreview({ pairs: pairSummaries, documentInfo: { contractor_name: lemClassifications.find(c => c.crew)?.crew || null } })
      } else {
        setErrors(['No pairs could be built from the uploaded files.'])
      }

      // Auto-fill
      const firstDate = lemClassifications.find(c => c.date)?.date
      const lastDate = [...lemClassifications].reverse().find(c => c.date)?.date
      if (firstDate && !periodStart) setPeriodStart(firstDate)
      if (lastDate && !periodEnd) setPeriodEnd(lastDate)
    } catch (err) {
      setErrors([`Parse failed: ${err.message}`])
    }
    setProgress('')
    setUploading(false)
  }

  // Re-export text extraction helpers for separate mode
  function extractDateFromText(text) {
    const MONTH_MAP = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
    let m = text.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    m = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2}),?\s*(\d{4})/i)
    if (m) return `${m[3]}-${MONTH_MAP[m[1].toLowerCase().slice(0,3)]}-${m[2].padStart(2,'0')}`
    m = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
    if (m) { const a = parseInt(m[1]); if (a > 12) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` }
    return null
  }

  function extractCrewFromText(text) {
    let m = text.match(/(?:crew|contractor|company)\s*[:]\s*([^\n,;]{3,40})/i)
    if (m) { let name = m[1].replace(/\s{2,}.*$/, '').replace(/\s*date\s*:.*/i, '').trim(); if (name.length >= 3) return name }
    m = text.match(/foreman\s*[:]\s*([^\n,;]{3,30})/i)
    if (m) return m[1].replace(/\s{2,}.*$/, '').trim()
    return null
  }

  async function ensurePdfJs() {
    if (window.pdfjsLib) return
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      script.onload = resolve
      script.onerror = () => reject(new Error('Failed to load PDF.js'))
      document.head.appendChild(script)
    })
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
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
