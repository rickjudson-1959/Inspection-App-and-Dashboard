/**
 * BulkUploadModal — single-PDF bulk upload with auto-split, classify,
 * group, and match.
 *
 * Flow:
 *   Step 0: Drop / select a PDF
 *   Step 1: Processing — show progress as pages classify
 *   Step 2: Results — matched pairs, unmatched LEMs, unmatched tickets,
 *                     pages that couldn't be classified. Each row is
 *                     clickable to reclassify or reassign.
 *   Step 3: Confirm and Save — split into per-group documents, upload,
 *                              kick off LEM extraction, write
 *                              document_matches rows.
 *
 * The processor (utils/bulkUploadProcessor.js) does all the work; this
 * component is mostly UI plus the admin reassignment helpers (changing
 * a group's doc_type, editing the ticket number, dropping a match).
 */

import React, { useState, useRef } from 'react'
import { useAuth } from '../../AuthContext.jsx'
import { useOrgQuery } from '../../utils/queryHelpers.js'
import { processPdfForReview, confirmAndSave, matchLemsToTickets, buildMatchKey } from '../../utils/bulkUploadProcessor.js'

const CONFIDENCE_COLOR = {
  high: { bg: '#d1fae5', fg: '#065f46', border: '#10b981' },
  medium: { bg: '#fef3c7', fg: '#92400e', border: '#f59e0b' },
  low: { bg: '#fee2e2', fg: '#991b1b', border: '#ef4444' }
}

export default function BulkUploadModal({ open, onClose, onComplete }) {
  const { user } = useAuth()
  const { getOrgId } = useOrgQuery()
  const fileInputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [stage, setStage] = useState('idle') // idle | processing | review | saving | done | error
  const [progressMsg, setProgressMsg] = useState('')
  const [progressCurrent, setProgressCurrent] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [pages, setPages] = useState([])      // [{ pageNumber, classification }]
  const [groups, setGroups] = useState([])    // groupPagesIntoDocuments result, mutable
  const [matchResult, setMatchResult] = useState(null)
  const [previewGroup, setPreviewGroup] = useState(null) // group whose pages we're previewing
  const [saveSummary, setSaveSummary] = useState(null)
  const [bulkUploadId] = useState(() => crypto.randomUUID())

  if (!open) return null

  const reset = () => {
    setFile(null)
    setStage('idle')
    setProgressMsg(''); setProgressCurrent(0); setProgressTotal(0)
    setError(''); setWarning('')
    setPages([]); setGroups([]); setMatchResult(null)
    setPreviewGroup(null); setSaveSummary(null)
  }

  const handleFileSelect = (selected) => {
    setError('')
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.pdf')) {
      setError('Bulk upload accepts PDFs only. Convert images to a single PDF first.')
      return
    }
    setFile(selected)
  }

  const startProcessing = async () => {
    if (!file) return
    setStage('processing')
    setError(''); setWarning('')
    try {
      const { pages: classifiedPages, groups: g, matchResult: m } = await processPdfForReview(
        file,
        (msg, cur, tot) => {
          setProgressMsg(msg)
          if (typeof cur === 'number') setProgressCurrent(cur)
          if (typeof tot === 'number') setProgressTotal(tot)
        },
        {
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
      console.error('[BulkUploadModal] processing failed:', err)
      if (err.message === 'CREDIT_BALANCE_TOO_LOW') {
        setError('Anthropic API credit balance too low. Top up and re-run.')
      } else {
        setError(err.message || 'Processing failed.')
      }
      setStage('error')
    }
  }

  // ── Review-step mutations: admin overrides ────────────────────────────────

  const reclassifyGroup = (groupId, newDocType) => {
    setGroups(prev => {
      const next = prev.map(g => g.id === groupId ? { ...g, doc_type: newDocType, needs_review: newDocType === 'unknown' } : g)
      // Re-run the matcher so the matched-pairs section updates live.
      setMatchResult(matchLemsToTickets(next))
      return next
    })
  }

  const editGroupField = (groupId, field, value) => {
    setGroups(prev => {
      const next = prev.map(g => {
        if (g.id !== groupId) return g
        const updated = { ...g, [field]: value }
        // Re-build match_key when key fields change
        if (['date', 'foreman_name', 'crew_or_spread'].includes(field)) {
          updated.match_key = buildMatchKey(updated)
        }
        return updated
      })
      setMatchResult(matchLemsToTickets(next))
      return next
    })
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!matchResult) return
    setStage('saving')
    setError('')
    try {
      const result = await confirmAndSave({
        sourceFile: file,
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
      console.error('[BulkUploadModal] save failed:', err)
      setError(err.message || 'Save failed.')
      setStage('review') // back to review so the admin can retry
    }
  }

  // ── UI fragments ──────────────────────────────────────────────────────────

  const overlay = (children) => (
    <div onClick={() => { if (stage !== 'processing' && stage !== 'saving') onClose() }}
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
      <button
        type="button"
        onClick={() => { if (stage !== 'processing' && stage !== 'saving') onClose() }}
        disabled={stage === 'processing' || stage === 'saving'}
        style={{
          padding: '6px 12px', backgroundColor: 'transparent', color: '#6b7280',
          border: '1px solid #d1d5db', borderRadius: 6,
          cursor: (stage === 'processing' || stage === 'saving') ? 'not-allowed' : 'pointer',
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

  // ── Stage: idle (pick a PDF) ──────────────────────────────────────────────
  if (stage === 'idle' || stage === 'error') {
    return overlay(
      <>
        {header('Bulk Upload — Contractor PDFs', 'Single PDF containing one or more LEMs and daily tickets')}
        {errorBanner()}
        <div style={{ padding: 24, flex: 1, overflow: 'auto' }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed #d1d5db', borderRadius: 8, padding: '40px 20px',
              textAlign: 'center', cursor: 'pointer', backgroundColor: '#f9fafb'
            }}
          >
            <div style={{ fontSize: 14, color: '#374151', marginBottom: 6 }}>
              Drop a PDF here or click to browse
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              Pages are auto-classified as LEM or Daily Ticket and grouped into documents.
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={(e) => handleFileSelect(e.target.files?.[0])} />
          </div>
          {file && (
            <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0', fontSize: 13, color: '#166534' }}>
              <strong>{file.name}</strong> · {(file.size / 1024 / 1024).toFixed(1)} MB
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={startProcessing} disabled={!file}
            style={{
              padding: '8px 16px',
              backgroundColor: file ? '#2563eb' : '#d1d5db', color: 'white',
              border: 'none', borderRadius: 6, cursor: file ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600
            }}>
            Process PDF
          </button>
        </div>
      </>
    )
  }

  // ── Stage: processing ─────────────────────────────────────────────────────
  if (stage === 'processing' || stage === 'saving') {
    const pct = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0
    return overlay(
      <>
        {header(stage === 'processing' ? 'Processing PDF…' : 'Saving documents…', file?.name)}
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

  // ── Stage: review ─────────────────────────────────────────────────────────
  if (stage === 'review') {
    const { matches = [], unmatchedLems = [], unmatchedTickets = [], needsReview = [] } = matchResult || {}
    const totalGroups = groups.length
    const totalPages = pages.length

    return overlay(
      <>
        {header(`Bulk Upload Results — ${totalPages} pages processed`,
          `${totalGroups} document group${totalGroups === 1 ? '' : 's'} identified · ${matches.length} matched pair${matches.length === 1 ? '' : 's'}`)}
        {errorBanner()}
        {warningBanner()}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

          {/* Matched pairs */}
          <SectionHeader title={`Matched pairs (LEM ↔ Daily Ticket)`} count={matches.length} color="#10b981" />
          {matches.length === 0 && <EmptyHint>No automatic matches yet.</EmptyHint>}
          {matches.map((m, idx) => (
            <MatchRow key={`m-${idx}`} match={m} onPreview={setPreviewGroup}
              onReclassify={reclassifyGroup} onEdit={editGroupField} />
          ))}

          {/* Unmatched LEMs */}
          <SectionHeader title="Unmatched LEMs (no corresponding ticket found)" count={unmatchedLems.length} color="#f59e0b" />
          {unmatchedLems.map(g => (
            <UnmatchedRow key={g.id} group={g} label="LEM" onPreview={setPreviewGroup}
              onReclassify={reclassifyGroup} onEdit={editGroupField} />
          ))}

          {/* Unmatched tickets */}
          <SectionHeader title="Unmatched Tickets (no corresponding LEM found)" count={unmatchedTickets.length} color="#f59e0b" />
          {unmatchedTickets.map(g => (
            <UnmatchedRow key={g.id} group={g} label="Ticket" onPreview={setPreviewGroup}
              onReclassify={reclassifyGroup} onEdit={editGroupField} />
          ))}

          {/* Pages that couldn't be classified */}
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

        {/* Preview overlay: show the actual pages of a group */}
        {previewGroup && <GroupPreview group={previewGroup} pages={pages} onClose={() => setPreviewGroup(null)} />}
      </>
    )
  }

  // ── Stage: done ──────────────────────────────────────────────────────────
  if (stage === 'done') {
    return overlay(
      <>
        {header('Bulk upload complete', file?.name)}
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
          <button onClick={() => { reset() }}
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

function MatchRow({ match, onPreview, onReclassify, onEdit }) {
  const { lem, ticket, method, confidence } = match
  const methodLabel = method === 'ticket_number' ? '#-match' : method === 'date_foreman_crew' ? 'date+foreman+crew' : 'manual'
  const conf = lem.ticket_number_confidence
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: 16, color: '#10b981' }}>✓</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: '#111827' }}>
          <strong style={{ color: conf === 'low' ? '#92400e' : conf === 'medium' ? '#92400e' : '#111827', backgroundColor: conf === 'low' || conf === 'medium' ? '#fef3c7' : 'transparent', padding: conf === 'low' || conf === 'medium' ? '1px 4px' : 0, borderRadius: 3 }}>
            Ticket #{lem.ticket_number || ticket.ticket_number || '—'}
          </strong>
          {' '}— {lem.foreman_name || '—'} · {lem.crew_or_spread || '—'} · {lem.date || '—'}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
          LEM ({lem.pages.length} pg) ↔ Ticket ({ticket.pages.length} pg) · method: {methodLabel} · confidence {Math.round(confidence * 100)}%
        </div>
      </div>
      <button onClick={() => onPreview({ ...lem, _label: 'LEM' })}
        style={ghostButton}>View LEM</button>
      <button onClick={() => onPreview({ ...ticket, _label: 'Ticket' })}
        style={ghostButton}>View Ticket</button>
    </div>
  )
}

function UnmatchedRow({ group, label, onPreview, onReclassify, onEdit, unclassified }) {
  const conf = group.ticket_number_confidence
  const confColor = conf && CONFIDENCE_COLOR[conf]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: 16, color: unclassified ? '#ef4444' : '#f59e0b' }}>{unclassified ? '❌' : '⚠'}</span>
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
        <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 11, alignItems: 'center' }}>
          <label style={{ color: '#6b7280' }}>Classify:</label>
          <select value={group.doc_type} onChange={(e) => onReclassify(group.id, e.target.value)}
            style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4 }}>
            <option value="lem">LEM</option>
            <option value="daily_ticket">Daily Ticket</option>
            <option value="unknown">Unknown</option>
          </select>
          <label style={{ color: '#6b7280', marginLeft: 8 }}>Ticket #:</label>
          <input value={group.ticket_number || ''} onChange={(e) => onEdit(group.id, 'ticket_number', e.target.value)}
            placeholder="—" style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4, width: 80 }} />
          <label style={{ color: '#6b7280', marginLeft: 8 }}>Foreman:</label>
          <input value={group.foreman_name || ''} onChange={(e) => onEdit(group.id, 'foreman_name', e.target.value)}
            placeholder="—" style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4, width: 130 }} />
          <label style={{ color: '#6b7280', marginLeft: 8 }}>Crew:</label>
          <input value={group.crew_or_spread || ''} onChange={(e) => onEdit(group.id, 'crew_or_spread', e.target.value)}
            placeholder="—" style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4, width: 90 }} />
        </div>
      </div>
      <button onClick={() => onPreview(group)} style={ghostButton}>View pages</button>
    </div>
  )
}

function GroupPreview({ group, pages, onClose }) {
  const pageNumbers = group.pages.map(p => p.pageNumber)
  // pages[] holds { pageNumber, imageBase64, classification } — find the matching image objects.
  const matching = pages.filter(p => pageNumbers.includes(p.pageNumber))
  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10010,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: 'white', borderRadius: 8, maxWidth: '95vw', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column', padding: 16, overflow: 'hidden'
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>
            {group._label || (group.doc_type === 'lem' ? 'LEM' : group.doc_type === 'daily_ticket' ? 'Ticket' : 'Unclassified')} — {group.ticket_number || '(no ticket #)'} · {group.foreman_name || '—'} · {group.date || '—'}
          </h3>
          <button onClick={onClose} style={{ padding: '6px 14px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>✕ Close</button>
        </div>
        <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {matching.map(p => (
            <div key={p.pageNumber}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                Page {p.pageNumber} · doc_type: {p.classification.doc_type} · ticket #: {p.classification.ticket_number || '—'} ({p.classification.ticket_number_confidence || 'no #'})
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

const ghostButton = {
  padding: '4px 10px', backgroundColor: 'white', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 11
}
