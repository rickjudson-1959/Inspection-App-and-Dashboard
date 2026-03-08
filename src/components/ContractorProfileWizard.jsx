import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { pdfToImages } from '../utils/lemParser.js'
import LEMPageTagger from './LEMPageTagger.jsx'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

/**
 * ContractorProfileWizard — 3-step wizard to create a contractor LEM profile.
 *
 * Step 1: Upload sample PDF (5-20 pages)
 * Step 2: Tag each page as LEM / Daily Ticket / Cover Sheet
 * Step 3: Generate classification guide via Claude Vision, review, and save
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
  const [contractorName, setContractorName] = useState(existingProfile?.contractor_name || '')
  const [file, setFile] = useState(null)
  const [pageImages, setPageImages] = useState([])
  const [tags, setTags] = useState({}) // { [pageIndex]: 'lem' | 'daily_ticket' | 'cover_sheet' }
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [classificationGuide, setClassificationGuide] = useState(null)
  const [guideText, setGuideText] = useState('') // plain text summary for admin review
  const [saving, setSaving] = useState(false)

  // Load existing profile tags if editing
  useEffect(() => {
    if (existingProfile?.sample_tags) {
      const restored = {}
      existingProfile.sample_tags.forEach((t, i) => { if (t) restored[i] = t })
      setTags(restored)
    }
    if (existingProfile?.classification_guide) {
      setClassificationGuide(existingProfile.classification_guide)
    }
  }, [existingProfile])

  // Step 1: Upload and render sample PDF
  async function handleUpload() {
    if (!file || !contractorName.trim()) {
      setError('Please enter a contractor name and select a PDF file.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const images = await pdfToImages(file, 50, setProgress)
      setPageImages(images)
      setProgress('')
      setStep(2)
    } catch (err) {
      setError(`Failed to render PDF: ${err.message}`)
    }
    setLoading(false)
  }

  // Step 2 → Step 3: Generate classification guide
  async function handleGenerateGuide() {
    const taggedPages = Object.keys(tags)
    if (taggedPages.length < 3) {
      setError('Please tag at least 3 pages before generating a profile.')
      return
    }

    // Need at least 1 LEM and 1 ticket tagged
    const hasLem = Object.values(tags).some(t => t === 'lem')
    const hasTicket = Object.values(tags).some(t => t === 'daily_ticket')
    if (!hasLem || !hasTicket) {
      setError('Please tag at least one LEM page and one Daily Ticket page.')
      return
    }

    if (!ANTHROPIC_API_KEY) {
      setError('Anthropic API key not configured.')
      return
    }

    setLoading(true)
    setError('')
    setProgress('Building classification guide from tagged samples...')

    try {
      // Build the Vision request with tagged sample pages
      const content = []

      // Add tagged page images with their labels
      const sortedIndices = taggedPages.map(Number).sort((a, b) => a - b)
      for (const idx of sortedIndices) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: pageImages[idx] }
        })
        content.push({
          type: 'text',
          text: `Page ${idx + 1} is tagged as: ${tags[idx]}`
        })
      }

      // Add the analysis prompt
      content.push({
        type: 'text',
        text: `I'm showing you example pages from ${contractorName}'s billing package. Each page has been tagged by a human as either 'lem', 'daily_ticket', or 'cover_sheet'.

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
}`
      })

      setProgress('Sending tagged samples to Claude Vision...')
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 2000,
          messages: [{ role: 'user', content }]
        })
      })

      const data = await response.json()
      const responseText = data?.content?.[0]?.text || ''

      if (!responseText) {
        throw new Error('No response from Claude Vision')
      }

      // Parse JSON from response (handle possible markdown fences)
      let guideJson
      try {
        const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        guideJson = JSON.parse(cleaned)
      } catch (parseErr) {
        console.error('Failed to parse guide JSON:', responseText)
        throw new Error('Claude returned invalid JSON. Please try again.')
      }

      setClassificationGuide(guideJson)

      // Build human-readable summary
      const summary = buildGuideSummary(guideJson)
      setGuideText(summary)
      setStep(3)
    } catch (err) {
      setError(`Failed to generate profile: ${err.message}`)
    }
    setLoading(false)
    setProgress('')
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
    if (guide.page_numbering_pattern) {
      lines.push('')
      lines.push(`Page numbering: ${guide.page_numbering_pattern}`)
    }
    if (guide.grouping_pattern) {
      lines.push('')
      lines.push(`Grouping pattern: ${guide.grouping_pattern}`)
    }
    if (guide.notes) {
      lines.push('')
      lines.push(`Notes: ${guide.notes}`)
    }
    return lines.join('\n')
  }

  // Step 3: Save profile to database
  async function handleSave() {
    if (!classificationGuide) return
    setSaving(true)
    setError('')

    try {
      const orgId = organizationId || getOrgId()

      // Upload sample page images to storage
      const sampleUrls = []
      const taggedIndices = Object.keys(tags).map(Number).sort((a, b) => a - b)
      setProgress('Uploading sample page images...')

      for (const idx of taggedIndices) {
        const base64 = pageImages[idx]
        if (!base64) continue
        try {
          const bytes = atob(base64)
          const arr = new Uint8Array(bytes.length)
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
          const blob = new Blob([arr], { type: 'image/jpeg' })
          const filePath = `contractor-profiles/${orgId}/${contractorName.trim().replace(/\s+/g, '_')}/sample_p${idx + 1}.jpg`
          const { error: upErr } = await supabase.storage
            .from('lem-uploads')
            .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true })
          if (!upErr) {
            const { data: urlData } = supabase.storage.from('lem-uploads').getPublicUrl(filePath)
            sampleUrls.push(urlData?.publicUrl || null)
          }
        } catch (e) {
          console.warn(`Failed to upload sample page ${idx + 1}:`, e.message)
        }
      }

      // Build sample_tags array (sparse — only tagged indices)
      const sampleTags = []
      for (let i = 0; i < pageImages.length; i++) {
        sampleTags.push(tags[i] || null)
      }

      const profileData = {
        organization_id: orgId,
        contractor_name: contractorName.trim(),
        classification_guide: classificationGuide,
        sample_page_urls: sampleUrls,
        sample_tags: sampleTags,
        corrections: [],
        corrections_count: 0,
        updated_at: new Date().toISOString()
      }

      setProgress('Saving profile...')

      if (existingProfile?.id) {
        // Update existing
        const { error: updateErr } = await supabase
          .from('contractor_lem_profiles')
          .update(profileData)
          .eq('id', existingProfile.id)
        if (updateErr) throw updateErr
      } else {
        // Insert new
        profileData.created_by = (await supabase.auth.getUser()).data?.user?.id || null
        const { error: insertErr } = await supabase
          .from('contractor_lem_profiles')
          .insert(profileData)
        if (insertErr) throw insertErr
      }

      setProgress('')
      onComplete?.()
    } catch (err) {
      setError(`Failed to save profile: ${err.message}`)
    }
    setSaving(false)
  }

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        {[1, 2, 3].map(s => (
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
              {s === 1 && 'Upload Sample'}
              {s === 2 && 'Tag Pages'}
              {s === 3 && 'Review & Save'}
            </span>
            {s < 3 && <div style={{ flex: 1, height: '2px', backgroundColor: step > s ? '#2563eb' : '#e5e7eb' }} />}
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

      {/* ── Step 1: Upload Sample ── */}
      {step === 1 && (
        <div>
          <h3 style={{ margin: '0 0 8px 0' }}>Set Up New Contractor Profile</h3>
          <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '20px' }}>
            Upload a sample of their LEM package (5-20 pages). This teaches the app what their documents look like.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>Contractor Name *</label>
              <input
                value={contractorName}
                onChange={e => setContractorName(e.target.value)}
                placeholder="e.g., Somerville Aecon"
                style={{ width: '100%', maxWidth: '400px', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>Sample PDF *</label>
              <input
                type="file"
                accept=".pdf"
                onChange={e => setFile(e.target.files?.[0] || null)}
                style={{ fontSize: '14px' }}
              />
              <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                Upload 5-50 pages from this contractor's LEM package. Include examples of LEMs, daily tickets, and cover sheets if they have them.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button onClick={onCancel} style={{ padding: '10px 20px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'white' }}>
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={loading || !file || !contractorName.trim()}
              style={{ padding: '10px 24px', fontSize: '14px', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', backgroundColor: '#2563eb', color: 'white', fontWeight: '600' }}
            >
              {loading ? 'Rendering...' : 'Next: Tag Pages'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Tag Pages ── */}
      {step === 2 && (
        <div>
          <h3 style={{ margin: '0 0 8px 0' }}>Tag Each Page — {contractorName}</h3>
          <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
            Click each thumbnail and tell us what type of document it is. Tag at least 1 LEM page and 1 Daily Ticket page.
          </p>

          <LEMPageTagger
            pageImages={pageImages}
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

      {/* ── Step 3: Review & Save ── */}
      {step === 3 && (
        <div>
          <h3 style={{ margin: '0 0 8px 0' }}>Review Profile — {contractorName}</h3>
          <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
            The app learned these patterns from your tagged samples. Review and confirm.
          </p>

          <div style={{
            backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px',
            padding: '20px', marginBottom: '20px', fontFamily: 'monospace', fontSize: '13px',
            whiteSpace: 'pre-wrap', lineHeight: '1.6', maxHeight: '400px', overflowY: 'auto'
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
            <button onClick={() => setStep(2)} style={{ padding: '10px 20px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'white' }}>
              Back — Retag Pages
            </button>
            <button
              onClick={handleGenerateGuide}
              disabled={loading}
              style={{ padding: '10px 20px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', backgroundColor: '#fef3c7', color: '#92400e' }}
            >
              Regenerate
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
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
