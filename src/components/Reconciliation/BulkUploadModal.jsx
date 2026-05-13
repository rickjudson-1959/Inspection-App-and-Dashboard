/**
 * BulkUploadModal — single-upload bulk PDF processing.
 *
 * One file. One process. Page 1 of the package PDF is assumed to be
 * the foreman/ticket index page; the system OCRs it first, asks the
 * admin to confirm the extracted foreman list, then processes pages
 * 2..N using the confirmed index as the lookup for ticket-number
 * derivation and cross-validation.
 *
 * If page 1 doesn't look like an index (fewer than 5 valid entries
 * after the equipment filter), the system skips the index step and
 * processes every page normally.
 *
 * Stages: idle -> indexProcessing -> indexReview (skip if not
 *         detected) -> processing -> review -> saving -> done.
 */

import React, { useState, useRef } from 'react'
import { useAuth } from '../../AuthContext.jsx'
import { useOrgQuery } from '../../utils/queryHelpers.js'
import {
  extractIndexFromPage1, processPackagePages,
  confirmAndSave, matchLemsToTickets
} from '../../utils/bulkUploadProcessor.js'

const CONFIDENCE_COLOR = {
  high: { bg: '#d1fae5', fg: '#065f46', border: '#10b981' },
  medium: { bg: '#fef3c7', fg: '#92400e', border: '#f59e0b' },
  low: { bg: '#fee2e2', fg: '#991b1b', border: '#ef4444' }
}

export default function BulkUploadModal({ open, onClose, onComplete }) {
  const { user } = useAuth()
  const { getOrgId } = useOrgQuery()

  // ── stage + progress ──────────────────────────────────────────────────────
  const [stage, setStage] = useState('idle')
  // idle | indexProcessing | indexReview | processing | review | saving | done | error
  const [progressMsg, setProgressMsg] = useState('')
  const [progressCurrent, setProgressCurrent] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  // ── package + index ───────────────────────────────────────────────────────
  const [packageFile, setPackageFile] = useState(null)
  const packageFileRef = useRef(null)
  const [allPagesCache, setAllPagesCache] = useState([])
  const [indexDate, setIndexDate] = useState('')
  const [indexEntries, setIndexEntries] = useState([])
  const [indexDetected, setIndexDetected] = useState(false)

  // ── processed results ─────────────────────────────────────────────────────
  const [pages, setPages] = useState([])
  const [groups, setGroups] = useState([])
  const [matchResult, setMatchResult] = useState(null)
  const [previewGroup, setPreviewGroup] = useState(null)
  const [saveSummary, setSaveSummary] = useState(null)
  const [bulkUploadId] = useState(() => crypto.randomUUID())

  if (!open) return null

  const isProcessingStage = ['indexProcessing', 'processing', 'saving'].includes(stage)

  const reset = () => {
    setStage('idle')
    setProgressMsg(''); setProgressCurrent(0); setProgressTotal(0)
    setError(''); setWarning('')
    setPackageFile(null); setAllPagesCache([])
    setIndexDate(''); setIndexEntries([]); setIndexDetected(false)
    setPages([]); setGroups([]); setMatchResult(null)
    setPreviewGroup(null); setSaveSummary(null)
  }

  // ── handlers ──────────────────────────────────────────────────────────────

  const handlePackageFileSelect = (selected) => {
    setError('')
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.pdf')) {
      setError('Bulk upload accepts PDFs only.')
      return
    }
    setPackageFile(selected)
  }

  const startIndexExtraction = async () => {
    if (!packageFile) return
    setStage('indexProcessing'); setError(''); setWarning('')
    try {
      const detection = await extractIndexFromPage1(packageFile,
        (msg, cur, tot) => {
          setProgressMsg(msg)
          if (typeof cur === 'number') setProgressCurrent(cur)
          if (typeof tot === 'number') setProgressTotal(tot)
        }
      )
      setAllPagesCache(detection.allPages)

      if (!detection.detected) {
        // Page 1 doesn't look like an index — process every page
        setIndexDetected(false)
        setWarning('Page 1 does not look like a foreman index. Processing every page without an index lookup.')
        await runPackageProcessing(detection.allPages, 0, null)
        return
      }

      // Page 1 IS an index. Surface for admin review.
      setIndexDetected(true)
      setIndexEntries(detection.index.entries)
      if (detection.index.date) setIndexDate(detection.index.date)

      // Build warning banner about the OCR diagnostics
      const meta = detection.indexMeta || {}
      const warnings = []
      if (meta.excessive) {
        warnings.push(`OCR returned an unusually high number of entries (${detection.index.entries.length}). Review carefully and delete any row that isn't a real person.`)
      }
      const filteredOut = (meta.raw_count || 0) - (meta.raw_count - (meta.people_count || 0))
      if (meta.people_count > 0) {
        warnings.push(`${meta.people_count} entr${meta.people_count === 1 ? 'y' : 'ies'} that looked like equipment were filtered out automatically.`)
      }
      const reportedCount = Number.isFinite(meta.row_count_visible) ? meta.row_count_visible : null
      if (reportedCount && Math.abs(reportedCount - detection.index.entries.length) > 5) {
        warnings.push(`Claude reported ${reportedCount} visible rows but the cleaned list has ${detection.index.entries.length}. Verify nothing was dropped or hallucinated.`)
      }
      if (warnings.length) setWarning(warnings.join(' '))

      setStage('indexReview')
    } catch (err) {
      console.error('[BulkUpload] index extraction failed:', err)
      setError(err.message === 'CREDIT_BALANCE_TOO_LOW'
        ? 'Anthropic API credit balance too low. Top up and re-run.'
        : err.message || 'Index extraction failed.')
      setStage('idle')
    }
  }

  const runPackageProcessing = async (allPages, startIndex, ticketIndex) => {
    setStage('processing'); setError('')
    try {
      const result = await processPackagePages({
        allPages,
        startIndex,
        ticketIndex,
        onProgress: (msg, cur, tot) => {
          setProgressMsg(msg)
          if (typeof cur === 'number') setProgressCurrent(cur)
          if (typeof tot === 'number') setProgressTotal(tot)
        },
        onCreditError: (partial) => {
          setWarning(`OCR credit balance ran out after page ${partial.length + startIndex}. Progress saved — top up credit and re-process.`)
        }
      })
      setPages(result.pages)
      setGroups(result.groups)
      setMatchResult(result.matchResult)
      setStage('review')
    } catch (err) {
      console.error('[BulkUpload] processing failed:', err)
      setError(err.message === 'CREDIT_BALANCE_TOO_LOW'
        ? 'Anthropic API credit balance too low. Top up and re-run.'
        : err.message || 'Processing failed.')
      setStage('error')
    }
  }

  const confirmIndexAndContinue = async () => {
    const ticketIndex = { entries: indexEntries, date: indexDate || null }
    await runPackageProcessing(allPagesCache, 1, ticketIndex)
  }

  const skipIndexAndProcessAll = async () => {
    // Escape hatch: admin says page 1 isn't actually an index, process
    // every page normally.
    await runPackageProcessing(allPagesCache, 0, null)
  }

  // index review row edits
  const updateIndexEntry = (i, field, value) => {
    setIndexEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e))
  }
  const deleteIndexEntry = (i) => {
    setIndexEntries(prev => prev.filter((_, idx) => idx !== i))
  }
  const addIndexEntry = () => {
    setIndexEntries(prev => [...prev, { first_name: '', last_name: '', role: '', ticket_number: '' }])
  }

  // review-stage edits
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

  // ── UI fragments ──────────────────────────────────────────────────────────

  const overlay = (children) => (
    <div onClick={() => { if (!isProcessingStage) onClose() }}
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
    <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>{title}</h2>
        {subtitle && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <button type="button"
        onClick={() => { if (!isProcessingStage) onClose() }}
        disabled={isProcessingStage}
        style={{
          padding: '6px 12px', backgroundColor: 'transparent', color: '#6b7280',
          border: '1px solid #d1d5db', borderRadius: 6,
          cursor: isProcessingStage ? 'not-allowed' : 'pointer', fontSize: 13
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

  // ── stage: idle — pick PDF ───────────────────────────────────────────────
  if (stage === 'idle' || stage === 'error') {
    return overlay(
      <>
        {header('Bulk Upload — Contractor Package PDF',
          'Single PDF containing the foreman index on page 1, plus all LEMs and daily tickets.')}
        {errorBanner()}
        {warningBanner()}
        <div style={{ padding: 24, flex: 1, overflow: 'auto' }}>
          <div onClick={() => packageFileRef.current?.click()}
            style={{
              border: '2px dashed #d1d5db', borderRadius: 8, padding: '40px 20px',
              textAlign: 'center', cursor: 'pointer', backgroundColor: '#f9fafb'
            }}>
            <div style={{ fontSize: 14, color: '#374151', marginBottom: 6 }}>
              Drop a PDF here or click to browse
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              Page 1 is auto-OCR'd as the foreman index. You'll review the
              extracted list before the rest of the pages are processed.
            </div>
            <input ref={packageFileRef} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => handlePackageFileSelect(e.target.files?.[0])} />
          </div>
          {packageFile && (
            <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 13, color: '#166534' }}>
              <strong>{packageFile.name}</strong> · {(packageFile.size / 1024 / 1024).toFixed(1)} MB
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={startIndexExtraction} disabled={!packageFile}
            style={{
              padding: '8px 16px',
              backgroundColor: packageFile ? '#2563eb' : '#d1d5db', color: 'white',
              border: 'none', borderRadius: 6, cursor: packageFile ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600
            }}>
            Process PDF
          </button>
        </div>
      </>
    )
  }

  // ── stages: indexProcessing / processing / saving (spinner) ──────────────
  if (isProcessingStage) {
    const pct = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0
    const title = stage === 'indexProcessing' ? 'Reading page 1 (index)…'
      : stage === 'saving' ? 'Saving documents…'
      : 'Processing package pages…'
    return overlay(
      <>
        {header(title, packageFile?.name)}
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

  // ── stage: indexReview — confirm extracted foreman list ──────────────────
  if (stage === 'indexReview') {
    const ticketNumbers = indexEntries.map(e => e.ticket_number).filter(Boolean).sort()
    const range = ticketNumbers.length > 0
      ? `${ticketNumbers[0]}–${ticketNumbers[ticketNumbers.length - 1]}`
      : '(none)'
    return overlay(
      <>
        {header(`Confirm index — ${indexEntries.length} foremen found`,
          `Ticket range: ${range}${indexDate ? ` · Date: ${indexDate}` : ''}`)}
        {errorBanner()}
        {warningBanner()}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginRight: 8 }}>Date:</label>
            <input type="date" value={indexDate} onChange={e => setIndexDate(e.target.value)}
              style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }} />
          </div>
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
                    <input value={e.ticket_number || ''} onChange={ev => updateIndexEntry(i, 'ticket_number', ev.target.value)} style={inputStyle} />
                  </td>
                  <td style={tdStyle}>
                    <input value={e.first_name || ''} onChange={ev => updateIndexEntry(i, 'first_name', ev.target.value)} style={inputStyle} />
                  </td>
                  <td style={tdStyle}>
                    <input value={e.last_name || ''} onChange={ev => updateIndexEntry(i, 'last_name', ev.target.value)} style={inputStyle} />
                  </td>
                  <td style={tdStyle}>
                    <input value={e.role || ''} onChange={ev => updateIndexEntry(i, 'role', ev.target.value)} style={inputStyle} />
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
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={skipIndexAndProcessAll}
            style={{ padding: '8px 14px', backgroundColor: 'white', color: '#92400e', border: '1px solid #fbbf24', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            This isn't an index — process all pages anyway
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}
              style={{ padding: '8px 16px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              Cancel
            </button>
            <button onClick={confirmIndexAndContinue} disabled={indexEntries.length === 0}
              style={{
                padding: '8px 16px',
                backgroundColor: indexEntries.length === 0 ? '#d1d5db' : '#16a34a',
                color: 'white', border: 'none', borderRadius: 6,
                cursor: indexEntries.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600
              }}>
              Confirm index → process remaining pages
            </button>
          </div>
        </div>
      </>
    )
  }

  // ── stage: review ────────────────────────────────────────────────────────
  if (stage === 'review') {
    const { matches = [], unmatchedLems = [], unmatchedTickets = [], needsReview = [], specials = [] } = matchResult || {}
    const totalGroups = groups.length
    const totalPages = pages.length

    return overlay(
      <>
        {header(`Bulk Upload Results — ${totalPages} pages processed`,
          `${totalGroups} groups · ${matches.length} matched pair${matches.length === 1 ? '' : 's'}${indexDetected ? ' · using page-1 index' : ' · no index'}`)}
        {errorBanner()}
        {warningBanner()}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <SectionHeader title="Matched pairs (LEM ↔ Daily Ticket)" count={matches.length} color="#10b981" />
          {matches.length === 0 && <EmptyHint>No automatic matches yet.</EmptyHint>}
          {matches.map((m, idx) => <MatchRow key={`m-${idx}`} match={m} onPreview={setPreviewGroup} />)}

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

  // ── stage: done ──────────────────────────────────────────────────────────
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

// ── helpers ────────────────────────────────────────────────────────────────

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
    : method === 'date_foreman_crew' ? 'date+foreman+crew' : 'manual'
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
