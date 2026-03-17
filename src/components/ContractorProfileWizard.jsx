import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { pdfToImages } from '../utils/lemParser.js'
import LEMPageTagger from './LEMPageTagger.jsx'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

/**
 * ContractorProfileWizard — wizard to create a contractor LEM profile.
 *
 * Two upload modes:
 *   "separate" — Upload blank LEM template + blank daily ticket template as two files (onboarding)
 *   "combined" — Upload a single sample PDF and tag each page (when you already have a billing package)
 *
 * Props:
 *   organizationId: string
 *   existingProfile: object | null  — if editing an existing profile
 *   onComplete: () => void
 *   onCancel: () => void
 */
export default function ContractorProfileWizard({ organizationId, existingProfile, onComplete, onCancel }) {
  const { getOrgId } = useOrgQuery()
  const [step, setStep] = useState(1)
  const [uploadMode, setUploadMode] = useState('separate') // 'separate' | 'combined'
  const [contractorName, setContractorName] = useState(existingProfile?.contractor_name || '')
  const [poNumber, setPoNumber] = useState(existingProfile?.po_number || '')

  // Separate mode state
  const [lemFile, setLemFile] = useState(null)
  const [ticketFile, setTicketFile] = useState(null)
  const [lemImages, setLemImages] = useState([])
  const [ticketImages, setTicketImages] = useState([])

  // Combined mode state
  const [combinedFile, setCombinedFile] = useState(null)
  const [combinedImages, setCombinedImages] = useState([])
  const [tags, setTags] = useState({}) // { [pageIndex]: 'lem' | 'daily_ticket' | 'cover_sheet' }

  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [classificationGuide, setClassificationGuide] = useState(null)
  const [guideText, setGuideText] = useState('')
  const [saving, setSaving] = useState(false)

  // Load existing profile data if editing
  useEffect(() => {
    if (existingProfile?.classification_guide) {
      setClassificationGuide(existingProfile.classification_guide)
    }
    if (existingProfile?.sample_tags) {
      const restored = {}
      existingProfile.sample_tags.forEach((t, i) => { if (t) restored[i] = t })
      setTags(restored)
      setUploadMode('combined')
    }
  }, [existingProfile])

  // ── File preview helpers ──

  async function renderFilePreview(file, setImages) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext === 'pdf') {
      const images = await pdfToImages(file, 10, setProgress)
      setImages(images)
    } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'bmp'].includes(ext)) {
      const reader = new FileReader()
      reader.onload = () => setImages([reader.result.split(',')[1]])
      reader.readAsDataURL(file)
    }
  }

  async function handleLemFileSelect(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setLemFile(f); setLemImages([]); setError('')
    try { await renderFilePreview(f, setLemImages) } catch (err) { setError(`Failed to preview LEM template: ${err.message}`) }
    setProgress('')
  }

  async function handleTicketFileSelect(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setTicketFile(f); setTicketImages([]); setError('')
    try { await renderFilePreview(f, setTicketImages) } catch (err) { setError(`Failed to preview ticket template: ${err.message}`) }
    setProgress('')
  }

  async function handleCombinedUpload() {
    if (!combinedFile || !contractorName.trim() || !poNumber.trim()) {
      setError('Please enter a contractor name, PO number, and select a PDF file.')
      return
    }
    setLoading(true); setError('')
    try {
      const images = await pdfToImages(combinedFile, 50, setProgress)
      setCombinedImages(images)
      setProgress('')
      setStep(2) // go to tagging step
    } catch (err) {
      setError(`Failed to render PDF: ${err.message}`)
    }
    setLoading(false)
  }

  // ── Generate classification guide ──

  async function handleGenerateGuide() {
    if (!contractorName.trim() || !poNumber.trim()) {
      setError('Please enter a contractor name and PO number.')
      return
    }
    if (!ANTHROPIC_API_KEY) {
      setError('Anthropic API key not configured.')
      return
    }

    if (uploadMode === 'separate') {
      if (lemImages.length === 0) { setError('Please upload the blank LEM template.'); return }
      if (ticketImages.length === 0) { setError('Please upload the blank daily ticket template.'); return }
      await generateGuideFromSeparate()
    } else {
      const taggedPages = Object.keys(tags)
      if (taggedPages.length < 3) { setError('Please tag at least 3 pages before generating a profile.'); return }
      const hasLem = Object.values(tags).some(t => t === 'lem')
      const hasTicket = Object.values(tags).some(t => t === 'daily_ticket')
      if (!hasLem || !hasTicket) { setError('Please tag at least one LEM page and one Daily Ticket page.'); return }
      await generateGuideFromCombined()
    }
  }

  async function generateGuideFromSeparate() {
    setLoading(true); setError(''); setProgress('Analyzing templates with AI...')
    try {
      const content = []
      for (let i = 0; i < lemImages.length; i++) {
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: lemImages[i] } })
        content.push({ type: 'text', text: `This is page ${i + 1} of the contractor's BLANK LEM (Labour & Equipment Manifest) template.` })
      }
      for (let i = 0; i < ticketImages.length; i++) {
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: ticketImages[i] } })
        content.push({ type: 'text', text: `This is page ${i + 1} of the contractor's BLANK DAILY TICKET template.` })
      }
      content.push({ type: 'text', text: `I'm showing you blank template documents from ${contractorName}. The first set of pages is their LEM (billing summary) template. The second set is their Daily Ticket template.

Analyze the visual differences between these two document types and create a classification guide. When filled-in versions of these documents are submitted in a billing package, the app needs to tell them apart. Describe the specific visual features that distinguish each type:
- Layout patterns (table structure, column count, orientation)
- Header/footer elements (logos, form titles, form numbers)
- Presence of signature lines
- Financial data areas (rates, totals, dollar signs)
- Field labels and section headers
- Any unique identifiers or form numbers

Return ONLY a JSON classification guide (no markdown, no code fences):
{
  "contractor_name": "${contractorName}",
  "lem_indicators": ["list of visual features that identify LEM pages"],
  "ticket_indicators": ["list of visual features that identify daily ticket pages"],
  "cover_indicators": [],
  "lem_page_count": ${lemImages.length},
  "ticket_page_count": ${ticketImages.length},
  "page_numbering_pattern": "description of any page numbering",
  "grouping_pattern": "description of how LEMs and tickets are typically organized",
  "notes": "any other observations about this contractor's format"
}` })

      const guideJson = await callVisionAPI(content)
      setClassificationGuide(guideJson)
      setGuideText(buildGuideSummary(guideJson))
      setStep(uploadMode === 'separate' ? 2 : 3)
    } catch (err) {
      setError(`Failed to generate profile: ${err.message}`)
    }
    setLoading(false); setProgress('')
  }

  async function generateGuideFromCombined() {
    setLoading(true); setError(''); setProgress('Building classification guide from tagged samples...')
    try {
      const content = []
      const sortedIndices = Object.keys(tags).map(Number).sort((a, b) => a - b)
      for (const idx of sortedIndices) {
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: combinedImages[idx] } })
        content.push({ type: 'text', text: `Page ${idx + 1} is tagged as: ${tags[idx]}` })
      }
      content.push({ type: 'text', text: `I'm showing you example pages from ${contractorName}'s billing package. Each page has been tagged by a human as either 'lem', 'daily_ticket', or 'cover_sheet'.

Analyze the visual differences between these document types and create a classification guide. Describe the specific visual features that distinguish each type:
- Layout patterns (table structure, column count, orientation)
- Header/footer elements (logos, form titles, page numbers)
- Presence of signature lines
- Financial data (rates, totals, dollar signs)
- Handwritten vs typed content
- Any unique identifiers or form numbers

Return ONLY a JSON classification guide (no markdown, no code fences):
{
  "contractor_name": "${contractorName}",
  "lem_indicators": ["list of visual features that identify LEM pages"],
  "ticket_indicators": ["list of visual features that identify daily ticket pages"],
  "cover_indicators": ["list of visual features that identify cover/admin pages"],
  "page_numbering_pattern": "description of any page numbering",
  "grouping_pattern": "description of how LEMs and tickets are organized in the PDF",
  "notes": "any other observations about this contractor's format"
}` })

      const guideJson = await callVisionAPI(content)
      setClassificationGuide(guideJson)
      setGuideText(buildGuideSummary(guideJson))
      setStep(3)
    } catch (err) {
      setError(`Failed to generate profile: ${err.message}`)
    }
    setLoading(false); setProgress('')
  }

  async function callVisionAPI(content) {
    setProgress('Sending to Claude Vision...')
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 2000, messages: [{ role: 'user', content }] })
    })
    const data = await response.json()
    const responseText = data?.content?.[0]?.text || ''
    if (!responseText) throw new Error('No response from Claude Vision')
    try {
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      return JSON.parse(cleaned)
    } catch (parseErr) {
      console.error('Failed to parse guide JSON:', responseText)
      throw new Error('Claude returned invalid JSON. Please try again.')
    }
  }

  function buildGuideSummary(guide) {
    const lines = []
    lines.push(`Contractor: ${guide.contractor_name}`)
    lines.push('')
    lines.push('LEM pages look like:')
    ;(guide.lem_indicators || []).forEach(f => lines.push(`  - ${f}`))
    lines.push('')
    lines.push('Daily tickets look like:')
    ;(guide.ticket_indicators || []).forEach(f => lines.push(`  - ${f}`))
    if (guide.cover_indicators?.length > 0) {
      lines.push('')
      lines.push('Cover sheets look like:')
      guide.cover_indicators.forEach(f => lines.push(`  - ${f}`))
    }
    if (guide.lem_page_count || guide.ticket_page_count) {
      lines.push('')
      lines.push(`Template pages: ${guide.lem_page_count || '?'} LEM, ${guide.ticket_page_count || '?'} ticket`)
    }
    if (guide.page_numbering_pattern) { lines.push(''); lines.push(`Page numbering: ${guide.page_numbering_pattern}`) }
    if (guide.grouping_pattern) { lines.push(''); lines.push(`Grouping pattern: ${guide.grouping_pattern}`) }
    if (guide.notes) { lines.push(''); lines.push(`Notes: ${guide.notes}`) }
    return lines.join('\n')
  }

  // ── Save profile ──

  async function handleSave() {
    if (!classificationGuide) return
    setSaving(true); setError('')

    try {
      const orgId = organizationId || getOrgId()
      const sampleUrls = []
      const sampleTags = []
      setProgress('Uploading template images...')
      const contractorSlug = contractorName.trim().replace(/\s+/g, '_')

      if (uploadMode === 'separate') {
        // Upload LEM template pages
        for (let i = 0; i < lemImages.length; i++) {
          const url = await uploadImageToStorage(lemImages[i], `contractor-profiles/${orgId}/${contractorSlug}/lem_template_p${i + 1}.jpg`)
          if (url) sampleUrls.push(url)
          sampleTags.push('lem')
        }
        // Upload ticket template pages
        for (let i = 0; i < ticketImages.length; i++) {
          const url = await uploadImageToStorage(ticketImages[i], `contractor-profiles/${orgId}/${contractorSlug}/ticket_template_p${i + 1}.jpg`)
          if (url) sampleUrls.push(url)
          sampleTags.push('daily_ticket')
        }
      } else {
        // Combined: upload tagged pages
        const taggedIndices = Object.keys(tags).map(Number).sort((a, b) => a - b)
        for (const idx of taggedIndices) {
          const url = await uploadImageToStorage(combinedImages[idx], `contractor-profiles/${orgId}/${contractorSlug}/sample_p${idx + 1}.jpg`)
          if (url) sampleUrls.push(url)
        }
        for (let i = 0; i < combinedImages.length; i++) {
          sampleTags.push(tags[i] || null)
        }
      }

      const profileData = {
        organization_id: orgId,
        contractor_name: contractorName.trim(),
        po_number: poNumber.trim(),
        classification_guide: classificationGuide,
        sample_page_urls: sampleUrls,
        sample_tags: sampleTags,
        corrections: [],
        corrections_count: 0,
        updated_at: new Date().toISOString()
      }

      setProgress('Saving profile...')

      if (existingProfile?.id) {
        const { error: updateErr } = await supabase.from('contractor_lem_profiles').update(profileData).eq('id', existingProfile.id)
        if (updateErr) throw updateErr
      } else {
        profileData.created_by = (await supabase.auth.getUser()).data?.user?.id || null
        const { error: insertErr } = await supabase.from('contractor_lem_profiles').insert(profileData)
        if (insertErr) throw insertErr
      }

      setProgress('')
      onComplete?.()
    } catch (err) {
      setError(`Failed to save profile: ${err.message}`)
    }
    setSaving(false)
  }

  async function uploadImageToStorage(base64, filePath) {
    if (!base64) return null
    try {
      const bytes = atob(base64)
      const arr = new Uint8Array(bytes.length)
      for (let j = 0; j < bytes.length; j++) arr[j] = bytes.charCodeAt(j)
      const blob = new Blob([arr], { type: 'image/jpeg' })
      const { error: upErr } = await supabase.storage.from('lem-uploads').upload(filePath, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) { console.warn(`Storage upload warning: ${upErr.message}`); return null }
      const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(filePath)
      return urlData?.publicUrl || null
    } catch (e) {
      console.warn(`Failed to upload image:`, e.message)
      return null
    }
  }

  // ── Step logic ──
  // Separate: Step 1 (info + uploads) → Step 2 (review & save)
  // Combined: Step 1 (info + upload) → Step 2 (tag pages) → Step 3 (review & save)
  const isSeparate = uploadMode === 'separate'
  const reviewStep = isSeparate ? 2 : 3
  const totalSteps = isSeparate ? 2 : 3

  const stepLabels = isSeparate
    ? ['Contractor Info & Templates', 'Review & Save']
    : ['Upload Sample', 'Tag Pages', 'Review & Save']

  // Can advance from step 1?
  const canAdvanceStep1 = isSeparate
    ? (lemImages.length > 0 && ticketImages.length > 0 && contractorName.trim() && poNumber.trim())
    : (combinedFile && contractorName.trim() && poNumber.trim())

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
          <React.Fragment key={s}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: step >= s ? '#2563eb' : '#e5e7eb',
              color: step >= s ? 'white' : '#6b7280',
              fontWeight: '600', fontSize: '14px'
            }}>
              {s}
            </div>
            <span style={{ fontSize: '13px', color: step >= s ? '#1e40af' : '#9ca3af', fontWeight: step === s ? '600' : '400' }}>
              {stepLabels[s - 1]}
            </span>
            {s < totalSteps && <div style={{ flex: 1, height: '2px', backgroundColor: step > s ? '#2563eb' : '#e5e7eb' }} />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {progress && (
        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '16px', height: '16px', border: '2px solid #2563eb', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          {progress}
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 1: Contractor Info & Template Uploads
         ══════════════════════════════════════════════ */}
      {step === 1 && (
        <div>
          <h3 style={{ margin: '0 0 8px 0' }}>Set Up New Contractor Profile</h3>
          <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
            Enter the contractor's details and upload their document templates.
          </p>

          {/* Contractor name and PO */}
          <div style={{ display: 'flex', gap: '14px', marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>Contractor Name *</label>
              <input
                value={contractorName} onChange={e => setContractorName(e.target.value)}
                placeholder="e.g., Somerville Aecon"
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>PO Number *</label>
              <input
                value={poNumber} onChange={e => setPoNumber(e.target.value)}
                placeholder="e.g., PO-4410"
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Upload mode toggle */}
          <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #d1d5db' }}>
            <button
              onClick={() => setUploadMode('separate')}
              style={{
                flex: 1, padding: '10px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none',
                backgroundColor: isSeparate ? '#2563eb' : '#f9fafb',
                color: isSeparate ? 'white' : '#374151'
              }}
            >
              Upload Separately
            </button>
            <button
              onClick={() => setUploadMode('combined')}
              style={{
                flex: 1, padding: '10px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none',
                borderLeft: '1px solid #d1d5db',
                backgroundColor: !isSeparate ? '#2563eb' : '#f9fafb',
                color: !isSeparate ? 'white' : '#374151'
              }}
            >
              Upload Combined Sample
            </button>
          </div>

          {/* ── Separate mode: two upload slots ── */}
          {isSeparate && (
            <>
              <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
                Upload the contractor's blank LEM and daily ticket as separate files. Best for initial onboarding when you have the blank templates.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                {/* LEM Template Upload */}
                <div style={{ padding: '20px', border: '2px dashed #3b82f6', borderRadius: '8px', backgroundColor: '#eff6ff', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.7 }}>📋</div>
                  <h4 style={{ margin: '0 0 6px 0', color: '#1e40af', fontSize: '14px' }}>Blank LEM Template</h4>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 12px 0' }}>
                    Billing summary / cover letter form
                  </p>
                  <label style={{
                    display: 'inline-block', padding: '8px 20px', backgroundColor: '#2563eb', color: 'white',
                    borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '13px'
                  }}>
                    {lemFile ? 'Change File' : 'Choose File'}
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.bmp" onChange={handleLemFileSelect} style={{ display: 'none' }} />
                  </label>
                  {lemFile && <p style={{ fontSize: '11px', color: '#059669', marginTop: '8px', fontWeight: '500' }}>{lemFile.name}</p>}
                  {lemImages.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
                      {lemImages.map((img, i) => (
                        <img key={i} src={`data:image/jpeg;base64,${img}`} alt={`LEM page ${i + 1}`}
                          style={{ width: '80px', height: '110px', objectFit: 'cover', border: '2px solid #3b82f6', borderRadius: '4px' }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Daily Ticket Template Upload */}
                <div style={{ padding: '20px', border: '2px dashed #f59e0b', borderRadius: '8px', backgroundColor: '#fffbeb', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.7 }}>🎫</div>
                  <h4 style={{ margin: '0 0 6px 0', color: '#92400e', fontSize: '14px' }}>Blank Daily Ticket Template</h4>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 12px 0' }}>
                    Daily work ticket form
                  </p>
                  <label style={{
                    display: 'inline-block', padding: '8px 20px', backgroundColor: '#f59e0b', color: 'white',
                    borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '13px'
                  }}>
                    {ticketFile ? 'Change File' : 'Choose File'}
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.bmp" onChange={handleTicketFileSelect} style={{ display: 'none' }} />
                  </label>
                  {ticketFile && <p style={{ fontSize: '11px', color: '#059669', marginTop: '8px', fontWeight: '500' }}>{ticketFile.name}</p>}
                  {ticketImages.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
                      {ticketImages.map((img, i) => (
                        <img key={i} src={`data:image/jpeg;base64,${img}`} alt={`Ticket page ${i + 1}`}
                          style={{ width: '80px', height: '110px', objectFit: 'cover', border: '2px solid #f59e0b', borderRadius: '4px' }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '16px' }}>
                Accepts PDF or image files. The app uses these templates to recognize filled-in documents during billing reconciliation.
              </p>
            </>
          )}

          {/* ── Combined mode: single file upload ── */}
          {!isSeparate && (
            <>
              <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
                Upload a sample of their billing package (5-50 pages with both LEMs and daily tickets). You'll tag each page in the next step.
              </p>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>Sample PDF *</label>
                <input
                  type="file" accept=".pdf"
                  onChange={e => setCombinedFile(e.target.files?.[0] || null)}
                  style={{ fontSize: '14px' }}
                />
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                  Include examples of LEMs, daily tickets, and cover sheets if they have them.
                </p>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={onCancel} style={{ padding: '10px 20px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'white' }}>
              Cancel
            </button>
            <button
              onClick={isSeparate ? handleGenerateGuide : handleCombinedUpload}
              disabled={loading || !canAdvanceStep1}
              style={{
                padding: '10px 24px', fontSize: '14px', border: 'none', borderRadius: '6px',
                cursor: (loading || !canAdvanceStep1) ? 'not-allowed' : 'pointer',
                backgroundColor: '#2563eb', color: 'white', fontWeight: '600',
                opacity: (loading || !canAdvanceStep1) ? 0.5 : 1
              }}
            >
              {loading ? 'Processing...' : isSeparate ? 'Next: Generate Profile' : 'Next: Tag Pages'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 2 (combined only): Tag Pages
         ══════════════════════════════════════════════ */}
      {step === 2 && !isSeparate && (
        <div>
          <h3 style={{ margin: '0 0 8px 0' }}>Tag Each Page — {contractorName}</h3>
          <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
            Click each thumbnail and tell us what type of document it is. Tag at least 1 LEM page and 1 Daily Ticket page.
          </p>

          <LEMPageTagger
            pageImages={combinedImages}
            tags={tags}
            onTagChange={(idx, tag) => {
              setTags(prev => {
                const next = { ...prev }
                if (tag === null) delete next[idx]
                else next[idx] = tag
                return next
              })
            }}
            loading={false}
          />

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button onClick={() => setStep(1)} style={{ padding: '10px 20px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'white' }}>
              Back
            </button>
            <button
              onClick={handleGenerateGuide}
              disabled={loading || Object.keys(tags).length < 3}
              style={{ padding: '10px 24px', fontSize: '14px', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', backgroundColor: '#059669', color: 'white', fontWeight: '600' }}
            >
              {loading ? 'Generating...' : 'Generate Profile'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          REVIEW & SAVE (Step 2 for separate, Step 3 for combined)
         ══════════════════════════════════════════════ */}
      {step === reviewStep && (
        <div>
          <h3 style={{ margin: '0 0 8px 0' }}>Review Profile — {contractorName}</h3>
          <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
            {isSeparate
              ? 'The app analyzed both templates and learned these patterns. Review and confirm.'
              : 'The app learned these patterns from your tagged samples. Review and confirm.'}
          </p>

          {/* Side-by-side template thumbnails (separate mode) */}
          {isSeparate && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#1e40af' }}>LEM Template ({lemImages.length} page{lemImages.length !== 1 ? 's' : ''})</h4>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {lemImages.map((img, i) => (
                    <img key={i} src={`data:image/jpeg;base64,${img}`} alt={`LEM ${i + 1}`}
                      style={{ width: '60px', height: '82px', objectFit: 'cover', border: '1px solid #93c5fd', borderRadius: '3px' }} />
                  ))}
                </div>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#fffbeb', borderRadius: '6px', border: '1px solid #fde68a' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#92400e' }}>Daily Ticket Template ({ticketImages.length} page{ticketImages.length !== 1 ? 's' : ''})</h4>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {ticketImages.map((img, i) => (
                    <img key={i} src={`data:image/jpeg;base64,${img}`} alt={`Ticket ${i + 1}`}
                      style={{ width: '60px', height: '82px', objectFit: 'cover', border: '1px solid #fcd34d', borderRadius: '3px' }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Classification guide summary */}
          <div style={{
            backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px',
            padding: '20px', marginBottom: '20px', fontFamily: 'monospace', fontSize: '13px',
            whiteSpace: 'pre-wrap', lineHeight: '1.6', maxHeight: '350px', overflowY: 'auto'
          }}>
            {guideText}
          </div>

          {classificationGuide && (
            <details style={{ marginBottom: '16px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '13px', color: '#6b7280' }}>View raw JSON guide</summary>
              <pre style={{ backgroundColor: '#1f2937', color: '#e5e7eb', padding: '12px', borderRadius: '6px', fontSize: '11px', overflow: 'auto', maxHeight: '300px', marginTop: '8px' }}>
                {JSON.stringify(classificationGuide, null, 2)}
              </pre>
            </details>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setStep(isSeparate ? 1 : 2)} style={{ padding: '10px 20px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'white' }}>
              {isSeparate ? 'Back' : 'Back — Retag Pages'}
            </button>
            <button
              onClick={handleGenerateGuide} disabled={loading}
              style={{ padding: '10px 20px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', backgroundColor: '#fef3c7', color: '#92400e' }}
            >
              Regenerate
            </button>
            <button
              onClick={handleSave} disabled={saving}
              style={{ padding: '10px 24px', fontSize: '14px', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', backgroundColor: '#059669', color: 'white', fontWeight: '600' }}
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
