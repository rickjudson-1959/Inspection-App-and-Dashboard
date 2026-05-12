/**
 * BulkUploadModal — two-step bulk PDF upload with index reconciliation.
 *
 * Step A — Index page (one-time per date):
 *   The admin uploads a separate PDF containing the foreman-to-ticket
 *   lookup table. We OCR it, extract every row, and save to
 *   `ticket_indices` keyed by (org, date). If a saved index already
 *   exists for the chosen date, we offer to reuse it instead of
 *   re-OCRing.
 *
 * Step B — Package PDF:
 *   The 130-page bulk file. Every page is OCR'd, then reconciled
 *   against the index so:
 *     - LEM pages keep their printed "Field Log ID"
 *     - Daily-ticket pages either keep their handwritten number, or
 *       have it derived from foreman -> index lookup
 *     - Cross-validation flags mismatches
 *
 *   Grouping uses ticket number as the primary key (max 5 pages per
 *   group). Signature pages append to the preceding LEM. Special
 *   doc types (missed_time / weekly_summary / index_page) get their
 *   own dedicated bucket.
 *
 * Stages: idle -> indexProcessing -> indexReview -> packageIdle ->
 *          processing -> review -> saving -> done.
 */

import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../AuthContext.jsx'
import { useOrgQuery } from '../../utils/queryHelpers.js'
import {
  processPdfForReview, confirmAndSave, matchLemsToTickets,
  classifyIndexFile, saveTicketIndex, loadTicketIndex
} from '../../utils/bulkUploadProcessor.js'

const CONFIDENCE_COLOR = {
  high: { bg: '#d1fae5', fg: '#065f46', border: '#10b981' },
  medium: { bg: '#fef3c7', fg: '#92400e', border: '#f59e0b' },
  low: { bg: '#fee2e2', fg: '#991b1b', border: '#ef4444' }
}

export default function BulkUploadModal({ open, onClose, onComplete }) {
  const { user } = useAuth()
  const { getOrgId } = useOrgQuery()

  // ── Stage + progress ─────────────────────────────────────────────────────
  const [stage, setStage] = useState('idle')
  // idle | indexProcessing | indexReview | packageIdle | processing | review | saving | done | error
  const [progressMsg, setProgressMsg] = useState('')
  const [progressCurrent, setProgressCurrent] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  // ── Index step ───────────────────────────────────────────────────────────
  const [indexDate, setIndexDate] = useState('')
  const [indexFile, setIndexFile] = useState(null)
  const [existingIndex, setExistingIndex] = useState(null) // row from DB if any
  const [indexEntries, setIndexEntries] = useState([])     // editable list
  const [indexId, setIndexId] = useState(null)
  const indexFileRef = useRef(null)

  // ── Package step ─────────────────────────────────────────────────────────
  const [packageFile, setPackageFile] = useState(null)
  const packageFileRef = useRef(null)
  const [pages, setPages] = useState([])
  const [groups, setGroups] = useState([])
  const [matchResult, setMatchResult] = useState(null)
  const [previewGroup, setPreviewGroup] = useState(null)
  const [saveSummary, setSaveSummary] = useState(null)
  const [bulkUploadId] = useState(() => crypto.randomUUID())

  // Auto-check for an existing index whenever the date is set
  useEffect(() => {
    if (!open || !indexDate) { setExistingIndex(null); return }
    let cancelled = false
    ;(async () => {
      const orgId = getOrgId()
      if (!orgId) return
      try {
        const row = await loadTicketIndex(orgId, indexDate)
        if (!cancelled) setExistingIndex(row)
      } catch (e) {
        if (!cancelled) setExistingIndex(null)
      }
    })()
    return () => { cancelled = true }
  }, [open, indexDate])

  if (!open) return null

  const reset = () => {
    setStage('idle')
    setProgressMsg(''); setProgressCurrent(0); setProgressTotal(0)
    setError(''); setWarning('')
    setIndexDate(''); setIndexFile(null); setExistingIndex(null)
    setIndexEntries([]); setIndexId(null)
    setPackageFile(null)
    setPages([]); setGroups([]); setMatchResult(null)
    setPreviewGroup(null); setSaveSummary(null)
  }

  // ── Index step handlers ──────────────────────────────────────────────────

  const handleIndexFileSelect = (selected) => {
    setError('')
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.pdf')) {
      setError('Index must be a PDF.')
      return
    }
    setIndexFile(selected)
  }

  const processIndexFile = async () => {
    if (!indexFile) return
    setStage('indexProcessing'); setError(''); setWarning('')
    try {
      const result = await classifyIndexFile(indexFile, (msg, cur, tot) => {
        setProgressMsg(msg)
        if (typeof cur === 'number') setProgressCurrent(cur)
        if (typeof tot === 'number') setProgressTotal(tot)
      })
      if (!result.date && !indexDate) {
        setWarning('Could not detect a date on the index page. Set it manually before saving.')
      } else if (!indexDate && result.date) {
        setIndexDate(result.date)
      }
      // Compose a single warning message from any sanity-check findings.
      // The index OCR is hallucination-prone (one field test produced
      // 299 entries from a one-page index) so the user MUST review the
      // result table before saving — we tell them what to look for.
      const warnings = []
      if (result.errors?.length) {
        warnings.push(`${result.errors.length} OCR error${result.errors.length === 1 ? '' : 's'} occurred while reading pages.`)
      }
      if (result.excessive) {
        warnings.push(`OCR returned an unusually high number of entries (${result.entries.length}). This usually means the model hallucinated rows that aren't on the page. Delete any row that doesn't look like a real person before saving.`)
      }
      if (result.filteredEquipmentCount > 0) {
        warnings.push(`${result.filteredEquipmentCount} entr${result.filteredEquipmentCount === 1 ? 'y' : 'ies'} that looked like equipment (no vowels, contained digits, or matched equipment keywords) were filtered out automatically.`)
      }
      // Compare Claude's self-reported visible row count against what we
      // accepted — large gap = caller should sanity check.
      const reported = (result.perPageRowCount || []).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0)
      if (reported > 0 && Math.abs(reported - result.entries.length) > 5) {
        warnings.push(`Claude reported ${reported} visible rows but the cleaned list has ${result.entries.length}. Verify nothing was dropped that shouldn't have been (or added that shouldn't have been).`)
      }
      if (warnings.length) setWarning(warnings.join(' '))
      setIndexEntries(result.entries)
      setStage('indexReview')
    } catch (err) {
      console.error('[BulkUpload] index OCR failed:', err)
      setError(err.message === 'CREDIT_BALANCE_TOO_LOW'
        ? 'Anthropic API credit balance too low. Top up and re-run.'
        : err.message || 'Index OCR failed.')
      setStage('idle')
    }
  }

  const useExistingIndex = () => {
    if (!existingIndex) return
    setIndexEntries(existingIndex.entries || [])
    setIndexId(existingIndex.id)
    setStage('packageIdle')
  }

  const saveIndexAndContinue = async () => {
    const orgId = getOrgId()
    if (!orgId || !indexDate) {
      setError('Date is required before saving the index.')
      return
    }
    if (indexEntries.length === 0) {
      setError('Index has no entries.')
      return
    }
    try {
      const saved = await saveTicketIndex({
        orgId,
        projectId: null,
        indexDate,
        entries: indexEntries,
        sourceFile: indexFile,
        uploadedBy: user?.id || null
      })
      setIndexId(saved.id)
      setStage('packageIdle')
    } catch (err) {
      setError(err.message || 'Failed to save index.')
    }
  }

  const updateIndexEntry = (i, field, value) => {
    setIndexEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e))
  }
  const deleteIndexEntry = (i) => {
    setIndexEntries(prev => prev.filter((_, idx) => idx !== i))
  }
  const addIndexEntry = () => {
    setIndexEntries(prev => [...prev, { first_name: '', last_name: '', role: '', ticket_number: '' }])
  }

  // ── Package step handlers ────────────────────────────────────────────────

  const handlePackageFileSelect = (selected) => {
    setError('')
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.pdf')) {
      setError('Package must be a PDF.')
      return
    }
    setPackageFile(selected)
  }

  const startProcessing = async () => {
    if (!packageFile) return
    setStage('processing'); setError(''); setWarning('')
    try {
      const ticketIndex = { entries: indexEntries }
      const { pages: classifiedPages, groups: g, matchResult: m } = await processPdfForReview(
        packageFile,
        (msg, cur, tot) => {
          setProgressMsg(msg)
          if (typeof cur === 'number') setProgressCurrent(cur)
          if (typeof tot === 'number') setProgressTotal(tot)
        },
        {
          ticketIndex,
          onCreditError: (partial) => {
            setWarning(`OCR credit balance ran out after page ${partial.length}. Progress saved — top up credit and re-process.`)
          }
        }
      )
      setPages(classifiedPages)
      setGroups(g)
      setMatchResult(m)
      setStage('review')
    } catch (err) {
      console.error('[BulkUpload] processing failed:', err)
      setError(err.message === 'CREDIT_BALANCE_TOO_LOW'
        ? 'Anthropic API credit balance too low. Top up and re-run.'
        : err.message || 'Processing failed.')
      setStage('error')
    }
  }

  const reclassifyGroup = (groupId, newDocType) => {
    setGroups(prev => {
      const next = prev.map(g => g.id === groupId ? { ...g, doc_type: newDocType, needs_review: newDocType === 'unknown' } : g)
      setMatchResult(matchLemsToTickets(next, { hasIndex: indexEntries.length > 0 }))
      return next
    })
  }

  const editGroupField = (groupId, field, value) => {
    setGroups(prev => {
      const next = prev.map(g => g.id === groupId ? { ...g, [field]: value } : g)
      setMatchResult(matchLemsToTickets(next, { hasIndex: indexEntries.length > 0 }))
      return next
    })
  }

  const handleSave = async () => {
    if (!matchResult) return
    setStage('saving'); setError('')
    try {
      const result = await confirmAndSave({
        sourceFile: packageFile,
        groups,
        matchResult,
        orgId: getOrgId(),
        projectId: null,
        uploadedBy: user?.id || null,
        bulkUploadId,
        onProgress: (msg, cur, tot) => {
          setProgressMsg(msg)
          if (typeof cur === 'number') setProgressCurrent(cur)
          if (typeof tot === 'number') setProgressTotal(tot)
        }
      })
      setSaveSummary(result)
      setStage('done')
      onComplete?.()
    } catch (err) {
      console.error('[BulkUpload] save failed:', err)
      setError(err.message || 'Save failed.')
      setStage('review')
    }
  }

  // ── UI fragments ─────────────────────────────────────────────────────────

  const overlay = (children) => (
    <div onClick={() => { if (!['indexProcessing', 'processing', 'saving'].includes(stage)) onClose() }}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: 'white', borderRadius: 8, maxWidth: '1100px', width: '100%',
          maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
        {children}
      </div>
    </div>
  )

  const header = (title, subtitle) => (
    <div style={{
      padding: '18px 24px', borderBottom: '1px solid #e5e7eb',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>{title}</h2>
        {subtitle && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <button type="button"
        onClick={() => { if (!['indexProcessing', 'processing', 'saving'].includes(stage)) onClose() }}
        disabled={['indexProcessing', 'processing', 'saving'].includes(stage)}
        style={{
          padding: '6px 12px', backgroundColor: 'transparent', color: '#6b7280',
          border: '1px solid #d1d5db', borderRadius: 6,
          cursor: ['indexProcessing', 'processing', 'saving'].includes(stage) ? 'not-allowed' : 'pointer',
          fontSize: 13
        }}
      >Close</button>
    </div>
  )

  const errorBanner = () => error && (
    <div style={{ margin: '12px 24px', padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 13 }}>
      {error}
    </div>
  )
  const warningBanner = () => warning && (
    <div style={{ margin: '12px 24px', padding: '10px 14px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, color: '#92400e', fontSize: 13 }}>
      {warning}
    </div>
  )

  // ── Stage: idle — pick a date + index PDF ────────────────────────────────
  if (stage === 'idle' || stage === 'error') {
    return overlay(
      <>
        {header('Bulk Upload — Step 1 of 2: Index Page', 'Upload the foreman / ticket-number lookup PDF for this date.')}
        {errorBanner()}
        {warningBanner()}
        <div style={{ padding: 24, flex: 1, overflow: 'auto' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              Index date <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input type="date" value={indexDate} onChange={e => setIndexDate(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: 200 }} />
          </div>

          {existingIndex && (
            <div style={{ padding: 14, marginBottom: 16, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
              <div style={{ fontSize: 13, color: '#1e40af', marginBottom: 8 }}>
                <strong>Existing index found for {indexDate}</strong> — {existingIndex.entries?.length || 0} foreman entries
                <span style={{ color: '#6b7280', marginLeft: 6 }}>(uploaded {new Date(existingIndex.updated_at).toLocaleString()})</span>
              </div>
              <button type="button" onClick={useExistingIndex}
                style={{ padding: '6px 14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Use this index → continue to package upload
              </button>
              <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 12 }}>or upload a new one below to replace it</span>
            </div>
          )}

          <div onClick={() => indexFileRef.current?.click()}
            style={{
              border: '2px dashed #d1d5db', borderRadius: 8, padding: '32px 20px',
              textAlign: 'center', cursor: 'pointer', backgroundColor: '#f9fafb'
            }}>
            <div style={{ fontSize: 14, color: '#374151', marginBottom: 6 }}>
              Drop or click to upload the <strong>index PDF</strong>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              The page that lists foremen and their Field Log numbers
            </div>
            <input ref={indexFileRef} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => handleIndexFileSelect(e.target.files?.[0])} />
          </div>

          {indexFile && (
            <div style={{ marginTop: 14, padding: 12, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 13, color: '#166534' }}>
              <strong>{indexFile.name}</strong> · {(indexFile.size / 1024 / 1024).toFixed(1)} MB
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={processIndexFile} disabled={!indexFile}
            style={{
              padding: '8px 16px',
              backgroundColor: indexFile ? '#2563eb' : '#d1d5db', color: 'white',
              border: 'none', borderRadius: 6, cursor: indexFile ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600
            }}>
            OCR Index
          </button>
        </div>
      </>
    )
  }

  // ── Stage: index processing ──────────────────────────────────────────────
  if (stage === 'indexProcessing' || stage === 'processing' || stage === 'saving') {
    const pct = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0
    const title = stage === 'indexProcessing' ? 'Reading index…'
      : stage === 'saving' ? 'Saving documents…'
      : 'Processing package…'
    return overlay(
      <>
        {header(title, packageFile?.name || indexFile?.name)}
        {warningBanner()}
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, margin: '0 auto 20px',
            border: '4px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <div style={{ fontSize: 14, color: '#111827', marginBottom: 10 }}>{progressMsg}</div>
          {progressTotal > 0 && (
            <>
              <div style={{ width: '100%', height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#2563eb', transition: 'width 0.2s' }} />
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{progressCurrent} / {progressTotal} ({pct}%)</div>
            </>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </>
    )
  }

  // ── Stage: index review (edit before saving) ─────────────────────────────
  if (stage === 'indexReview') {
    const reviewSubtitle = `Date: ${indexDate || '(set below)'} · ${indexEntries.length} entries · review and delete any garbage rows before saving`
    return overlay(
      <>
        {header(`Index — review ${indexEntries.length} entries`, reviewSubtitle)}
        {errorBanner()}
        {warningBanner()}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {!indexDate && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginRight: 8 }}>Index date:</label>
              <input type="date" value={indexDate} onChange={e => setIndexDate(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={thStyle}>Ticket #</th>
                <th style={thStyle}>First name</th>
                <th style={thStyle}>Last name</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {indexEntries.map((e, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}>
                    <input value={e.ticket_number || ''} onChange={ev => updateIndexEntry(i, 'ticket_number', ev.target.value)}
                      style={inputStyle} />
                  </td>
                  <td style={tdStyle}>
                    <input value={e.first_name || ''} onChange={ev => updateIndexEntry(i, 'first_name', ev.target.value)}
                      style={inputStyle} />
                  </td>
                  <td style={tdStyle}>
                    <input value={e.last_name || ''} onChange={ev => updateIndexEntry(i, 'last_name', ev.target.value)}
                      style={inputStyle} />
                  </td>
                  <td style={tdStyle}>
                    <input value={e.role || ''} onChange={ev => updateIndexEntry(i, 'role', ev.target.value)}
                      style={inputStyle} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button type="button" onClick={() => deleteIndexEntry(i)}
                      style={{ padding: '2px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addIndexEntry}
            style={{ marginTop: 10, padding: '6px 12px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            + Add row
          </button>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={() => setStage('idle')}
            style={{ padding: '8px 16px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Back
          </button>
          <button onClick={saveIndexAndContinue} disabled={!indexDate || indexEntries.length === 0}
            style={{
              padding: '8px 16px',
              backgroundColor: (indexDate && indexEntries.length) ? '#16a34a' : '#d1d5db',
              color: 'white', border: 'none', borderRadius: 6,
              cursor: (indexDate && indexEntries.length) ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600
            }}>
            Save index → upload package
          </button>
        </div>
      </>
    )
  }

  // ── Stage: package idle (index is locked in; pick the package PDF) ──────
  if (stage === 'packageIdle') {
    return overlay(
      <>
        {header('Bulk Upload — Step 2 of 2: Package PDF',
          `Index loaded: ${indexEntries.length} foreman entries for ${indexDate}`)}
        {errorBanner()}
        <div style={{ padding: 24 }}>
          <div onClick={() => packageFileRef.current?.click()}
            style={{
              border: '2px dashed #d1d5db', borderRadius: 8, padding: '40px 20px',
              textAlign: 'center', cursor: 'pointer', backgroundColor: '#f9fafb'
            }}>
            <div style={{ fontSize: 14, color: '#374151', marginBottom: 6 }}>
              Drop or click to upload the <strong>package PDF</strong>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              All LEMs + daily tickets for {indexDate}
            </div>
            <input ref={packageFileRef} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => handlePackageFileSelect(e.target.files?.[0])} />
          </div>
          {packageFile && (
            <div style={{ marginTop: 14, padding: 12, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 13, color: '#166534' }}>
              <strong>{packageFile.name}</strong> · {(packageFile.size / 1024 / 1024).toFixed(1)} MB
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={() => setStage('idle')}
            style={{ padding: '8px 16px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            ← Re-do index
          </button>
          <button onClick={startProcessing} disabled={!packageFile}
            style={{
              padding: '8px 16px',
              backgroundColor: packageFile ? '#2563eb' : '#d1d5db', color: 'white',
              border: 'none', borderRadius: 6,
              cursor: packageFile ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600
            }}>
            Process Package
          </button>
        </div>
      </>
    )
  }

  // ── Stage: review ────────────────────────────────────────────────────────
  if (stage === 'review') {
    const { matches = [], unmatchedLems = [], unmatchedTickets = [], needsReview = [], specials = [] } = matchResult || {}
    const totalGroups = groups.length
    const totalPages = pages.length

    return overlay(
      <>
        {header(`Bulk Upload Results — ${totalPages} pages processed`,
          `${totalGroups} groups · ${matches.length} matched pair${matches.length === 1 ? '' : 's'}`)}
        {errorBanner()}
        {warningBanner()}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

          <SectionHeader title="Matched pairs (LEM ↔ Daily Ticket)" count={matches.length} color="#10b981" />
          {matches.length === 0 && <EmptyHint>No automatic matches yet.</EmptyHint>}
          {matches.map((m, idx) => (
            <MatchRow key={`m-${idx}`} match={m} onPreview={setPreviewGroup} />
          ))}

          <SectionHeader title="Unmatched LEMs (no corresponding ticket found)" count={unmatchedLems.length} color="#f59e0b" />
          {unmatchedLems.map(g => (
            <UnmatchedRow key={g.id} group={g} label="LEM" onPreview={setPreviewGroup}
              onReclassify={reclassifyGroup} onEdit={editGroupField} />
          ))}

          <SectionHeader title="Unmatched Tickets (no corresponding LEM found)" count={unmatchedTickets.length} color="#f59e0b" />
          {unmatchedTickets.map(g => (
            <UnmatchedRow key={g.id} group={g} label="Ticket" onPreview={setPreviewGroup}
              onReclassify={reclassifyGroup} onEdit={editGroupField} />
          ))}

          <SectionHeader title="Special pages (missed time, weekly summary, index)" count={specials.length} color="#8b5cf6" />
          {specials.map(g => (
            <UnmatchedRow key={g.id} group={g} label={specialLabel(g.doc_type)}
              onPreview={setPreviewGroup} onReclassify={reclassifyGroup} onEdit={editGroupField} special />
          ))}

          <SectionHeader title="Pages that couldn't be classified" count={needsReview.length} color="#ef4444" />
          {needsReview.map(g => (
            <UnmatchedRow key={g.id} group={g} label="Unclassified" onPreview={setPreviewGroup}
              onReclassify={reclassifyGroup} onEdit={editGroupField} unclassified />
          ))}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {needsReview.length > 0 && `${needsReview.length} group${needsReview.length === 1 ? '' : 's'} still need classification.`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}
              style={{ padding: '8px 16px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              Cancel
            </button>
            <button onClick={handleSave}
              style={{ padding: '8px 16px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Confirm and Save
            </button>
          </div>
        </div>

        {previewGroup && <GroupPreview group={previewGroup} pages={pages} onClose={() => setPreviewGroup(null)} />}
      </>
    )
  }

  // ── Stage: done ─────────────────────────────────────────────────────────
  if (stage === 'done') {
    return overlay(
      <>
        {header('Bulk upload complete', packageFile?.name)}
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 10 }}>
            {saveSummary?.uploadedCount || 0} document{saveSummary?.uploadedCount === 1 ? '' : 's'} saved.
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            {saveSummary?.matchCount || 0} match record{saveSummary?.matchCount === 1 ? '' : 's'} written.
            {saveSummary?.skippedUnknown > 0 && ` ${saveSummary.skippedUnknown} unclassified group${saveSummary.skippedUnknown === 1 ? '' : 's'} skipped.`}
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={() => reset()}
            style={{ padding: '8px 16px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Upload another
          </button>
          <button onClick={() => { reset(); onClose() }}
            style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Done
          </button>
        </div>
      </>
    )
  }

  return null
}

// ── Section helpers ────────────────────────────────────────────────────────

function specialLabel(docType) {
  if (docType === 'missed_time') return 'Missed Time'
  if (docType === 'weekly_summary') return 'Weekly Summary'
  if (docType === 'index_page') return 'Index Page'
  return docType
}

function SectionHeader({ title, count, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, marginBottom: 8 }}>
      <div style={{ width: 4, height: 18, backgroundColor: color, borderRadius: 2 }} />
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>{title}</h3>
      <span style={{ fontSize: 12, color: '#6b7280' }}>({count})</span>
    </div>
  )
}

function EmptyHint({ children }) {
  return <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 0 12px 14px', fontStyle: 'italic' }}>{children}</div>
}

function MatchRow({ match, onPreview }) {
  const { lem, ticket, method, confidence } = match
  const methodLabel = method === 'ticket_number' ? '#-match'
    : method === 'date_foreman_crew' ? 'date+foreman+crew'
    : 'manual'
  const conf = lem.ticket_number_confidence
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: 16, color: '#10b981' }}>✓</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: '#111827' }}>
          <strong style={{ color: conf === 'low' || conf === 'medium' ? '#92400e' : '#111827', backgroundColor: conf === 'low' || conf === 'medium' ? '#fef3c7' : 'transparent', padding: conf === 'low' || conf === 'medium' ? '1px 4px' : 0, borderRadius: 3 }}>
            Ticket #{lem.ticket_number || ticket.ticket_number || '—'}
          </strong>
          {' '}— {lem.foreman_name || '—'} · {lem.crew_or_spread || '—'} · {lem.date || '—'}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
          LEM ({lem.pages.length} pg) ↔ Ticket ({ticket.pages.length} pg) · method: {methodLabel} · confidence {Math.round(confidence * 100)}%
        </div>
      </div>
      <button onClick={() => onPreview({ ...lem, _label: 'LEM' })} style={ghostButton}>View LEM</button>
      <button onClick={() => onPreview({ ...ticket, _label: 'Ticket' })} style={ghostButton}>View Ticket</button>
    </div>
  )
}

function UnmatchedRow({ group, label, onPreview, onReclassify, onEdit, unclassified, special }) {
  const conf = group.ticket_number_confidence
  const confColor = conf && CONFIDENCE_COLOR[conf]
  const iconColor = unclassified ? '#ef4444' : special ? '#8b5cf6' : '#f59e0b'
  const icon = unclassified ? '❌' : special ? '◆' : '⚠'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: 16, color: iconColor }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: '#111827' }}>
          <strong>{label}</strong>
          {group.ticket_number && (
            <span style={{ marginLeft: 6, color: confColor?.fg || '#111827', backgroundColor: confColor?.bg || 'transparent', padding: confColor ? '1px 5px' : 0, borderRadius: 3 }}>
              #{group.ticket_number}{conf ? ` (${conf})` : ''}
            </span>
          )}
          {' '}— {group.foreman_name || '—'} · {group.crew_or_spread || '—'} · {group.date || '—'} · ({group.pages.length} pg)
        </div>
        {group.overflow_warning && (
          <div style={{ fontSize: 11, color: '#92400e', marginTop: 3 }}>⚠ {group.overflow_warning}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 11, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ color: '#6b7280' }}>Classify:</label>
          <select value={group.doc_type} onChange={e => onReclassify(group.id, e.target.value)}
            style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4 }}>
            <option value="lem">LEM</option>
            <option value="daily_ticket">Daily Ticket</option>
            <option value="signature_page">Signature Page</option>
            <option value="missed_time">Missed Time</option>
            <option value="weekly_summary">Weekly Summary</option>
            <option value="index_page">Index Page</option>
            <option value="unknown">Unknown</option>
          </select>
          <label style={{ color: '#6b7280', marginLeft: 6 }}>Ticket #:</label>
          <input value={group.ticket_number || ''} onChange={e => onEdit(group.id, 'ticket_number', e.target.value)}
            placeholder="—" style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4, width: 80 }} />
          <label style={{ color: '#6b7280', marginLeft: 6 }}>Foreman:</label>
          <input value={group.foreman_name || ''} onChange={e => onEdit(group.id, 'foreman_name', e.target.value)}
            placeholder="—" style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4, width: 130 }} />
          <label style={{ color: '#6b7280', marginLeft: 6 }}>Crew:</label>
          <input value={group.crew_or_spread || ''} onChange={e => onEdit(group.id, 'crew_or_spread', e.target.value)}
            placeholder="—" style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4, width: 90 }} />
        </div>
      </div>
      <button onClick={() => onPreview(group)} style={ghostButton}>View pages</button>
    </div>
  )
}

function GroupPreview({ group, pages, onClose }) {
  const pageNumbers = group.pages.map(p => p.pageNumber)
  const matching = pages.filter(p => pageNumbers.includes(p.pageNumber))
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10010, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ backgroundColor: 'white', borderRadius: 8, maxWidth: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>
            {group._label || group.doc_type} — {group.ticket_number || '(no ticket #)'} · {group.foreman_name || '—'} · {group.date || '—'}
          </h3>
          <button onClick={onClose} style={{ padding: '6px 14px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>✕ Close</button>
        </div>
        <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {matching.map(p => (
            <div key={p.pageNumber}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                Page {p.pageNumber} · doc_type: {p.classification.doc_type} · ticket #: {p.classification.ticket_number || '—'} ({p.classification.ticket_number_confidence || 'no #'})
                {p.classification.ticket_derived_from_index && ' · derived from index'}
                {p.classification.mismatch_with_index && ' · ⚠ foreman mismatch with index'}
              </div>
              <img src={`data:image/jpeg;base64,${p.imageBase64}`} alt={`Page ${p.pageNumber}`}
                style={{ maxWidth: '100%', border: '1px solid #d1d5db', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── style fragments ────────────────────────────────────────────────────────
const thStyle = { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }
const tdStyle = { padding: '6px 10px', fontSize: 13, color: '#111827' }
const inputStyle = { width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }
const ghostButton = {
  padding: '4px 10px', backgroundColor: 'white', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 11
}
