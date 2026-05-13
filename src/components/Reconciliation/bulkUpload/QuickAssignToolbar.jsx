/**
 * QuickAssignToolbar — sticky controls above the thumbnail grid.
 *
 * Sequential assign is a per-foreman 3-step state machine. For each
 * foreman the admin walks LEM -> Ticket -> Other, assigning pages
 * into the SAME group at each step. The toolbar only advances to the
 * next foreman after step 3 (or an explicit "Done with foreman").
 *
 * State (owned by the workspace, passed in):
 *   seqWorkingGroup  — the group being built (or null when no foreman
 *                      is in progress)
 *   seqStep          — 'lem' | 'ticket' | 'other'
 *
 * Actions:
 *   onSequentialStart(entry)              -> create group, enter step 'lem'
 *   onSequentialStep({ pageCount })       -> assign N pages to current
 *                                            step's slot, advance step
 *   onSequentialSkipStep()                -> advance step without
 *                                            assigning (foreman with no
 *                                            ticket, etc.)
 *   onSequentialDone()                    -> finish the current foreman
 *                                            at any step
 *
 * Bulk classify still applies to shift-selected pages independent of
 * the sequential flow.
 */
import React, { useState } from 'react'

// Sequential assign is a TWO-step walk per foreman: LEM, then Ticket.
// The last page of a LEM is usually data + signature; it goes in the
// LEM slot, NOT into a separate signature bucket. The "Other" slot
// still exists on each group for the rare edge case (standalone
// signature-only page, attachment) but the admin reaches it via
// drag-and-drop, not through this walk.
const STEP_LABEL = { lem: 'LEM', ticket: 'Daily Ticket' }
const STEP_NUMBER = { lem: 1, ticket: 2 }
const STEP_HINT = {
  lem: 'All pages of the foreman\'s LEM (usually 2 pages — the last page often has data AND a signature; it belongs here).',
  ticket: 'All pages of the foreman\'s daily ticket (usually 1-2 pages).'
}

export default function QuickAssignToolbar({
  selectedCount,
  ungroupedCount,
  indexEntries,
  usedTicketNumbers,            // Set<string>
  onBulkClassify,               // (docType) => void
  onSendSelectedToSkip,         // () => void
  onStartOcr,
  onClearSelection,
  ocrStatus,                    // 'idle' | 'running' | 'done' | 'failed'
  ocrProgress,                  // { done, total }
  historyDepth = 0,
  onUndo,
  // Sequential assign
  seqWorkingGroup,              // group object or null
  seqStep = 'lem',
  onSequentialStart,
  onSequentialStep,
  onSequentialSkipStep,
  onSequentialDone
}) {
  const nextEntry = indexEntries.find(e => e.ticket_number && !usedTicketNumbers.has(String(e.ticket_number)))
  const [seqPageCount, setSeqPageCount] = useState(2)

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6,
      padding: 10, marginBottom: 10,
      display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
    }}>
      {/* OCR control */}
      <button onClick={onStartOcr} disabled={ocrStatus === 'running' || ocrStatus === 'done'}
        style={{
          padding: '6px 12px',
          backgroundColor: ocrStatus === 'idle' ? '#2563eb' : '#9ca3af',
          color: 'white', border: 'none', borderRadius: 4,
          cursor: ocrStatus === 'idle' ? 'pointer' : 'not-allowed',
          fontSize: 12, fontWeight: 600
        }}>
        {ocrStatus === 'idle' && '▶ Start OCR suggestions'}
        {ocrStatus === 'running' && `OCR ${ocrProgress.done}/${ocrProgress.total}`}
        {ocrStatus === 'done' && '✓ OCR done'}
        {ocrStatus === 'failed' && '⚠ OCR failed'}
      </button>

      {/* Undo last action */}
      <button onClick={onUndo} disabled={historyDepth === 0}
        title={historyDepth === 0 ? 'Nothing to undo' : `Undo (${historyDepth} step${historyDepth === 1 ? '' : 's'} available)`}
        style={{
          padding: '6px 10px',
          backgroundColor: historyDepth === 0 ? '#f3f4f6' : 'white',
          color: historyDepth === 0 ? '#9ca3af' : '#374151',
          border: '1px solid ' + (historyDepth === 0 ? '#e5e7eb' : '#d1d5db'),
          borderRadius: 4,
          cursor: historyDepth === 0 ? 'not-allowed' : 'pointer',
          fontSize: 12, fontWeight: 500
        }}>
        ↶ Undo{historyDepth > 0 ? ` (${historyDepth})` : ''}
      </button>

      {/* Sequential assign — TWO states:
            (a) No foreman in progress: show "Start with next foreman" button
            (b) Foreman in progress: show 3-step pager with assign / skip / done */}
      {indexEntries.length > 0 && !seqWorkingGroup && nextEntry && (
        <div style={{
          padding: '6px 10px', backgroundColor: '#f5f3ff',
          border: '1px solid #ddd6fe', borderRadius: 4,
          display: 'flex', gap: 8, alignItems: 'center', fontSize: 12
        }}>
          <span style={{ color: '#5b21b6' }}>
            Next foreman: <strong>#{nextEntry.ticket_number}</strong> — {nextEntry.first_name} {nextEntry.last_name}
            {nextEntry.role && <span style={{ color: '#7c3aed' }}> ({nextEntry.role})</span>}
          </span>
          <button onClick={() => onSequentialStart(nextEntry)}
            style={{ padding: '4px 10px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Start sequential →
          </button>
        </div>
      )}

      {indexEntries.length > 0 && !seqWorkingGroup && !nextEntry && (
        <div style={{
          padding: '6px 10px', backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0', borderRadius: 4,
          fontSize: 12, color: '#166534'
        }}>
          ✓ All foremen from the index have been started.
        </div>
      )}

      {seqWorkingGroup && (
        <div style={{
          padding: '8px 12px', backgroundColor: '#f5f3ff',
          border: '2px solid #7c3aed', borderRadius: 6,
          display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12,
          flexBasis: '100%'   // take full width when active so all controls fit
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#5b21b6', fontWeight: 600 }}>
              {seqWorkingGroup.foreman_name || '(no name)'} · #{seqWorkingGroup.ticket_number || '?'}
              {seqWorkingGroup.role && <span style={{ color: '#7c3aed', fontWeight: 400 }}> · {seqWorkingGroup.role}</span>}
            </span>
            <span style={{ color: '#6b21a8' }}>·</span>
            <StepPill label="LEM" filled={(seqWorkingGroup.lemPages || []).length > 0} active={seqStep === 'lem'} count={(seqWorkingGroup.lemPages || []).length} step={1} />
            <StepPill label="Ticket" filled={(seqWorkingGroup.ticketPages || []).length > 0} active={seqStep === 'ticket'} count={(seqWorkingGroup.ticketPages || []).length} step={2} />
            {(seqWorkingGroup.otherPages || []).length > 0 && (
              <span style={{ fontSize: 11, color: '#7c3aed', marginLeft: 4 }}>
                + {seqWorkingGroup.otherPages.length} Other (manual)
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={onSequentialDone}
              style={{ padding: '4px 10px', backgroundColor: 'white', color: '#5b21b6', border: '1px solid #c4b5fd', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              ✓ Done with this foreman
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#5b21b6', fontWeight: 600 }}>
              Step {STEP_NUMBER[seqStep]} of 2 — Select {STEP_LABEL[seqStep]} pages
            </span>
            <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>{STEP_HINT[seqStep]}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ color: '#6b21a8' }}>next</label>
            <input type="number" min="0" max="20" value={seqPageCount}
              onChange={e => setSeqPageCount(Math.max(0, parseInt(e.target.value) || 0))}
              style={{ width: 56, padding: '4px 6px', border: '1px solid #c4b5fd', borderRadius: 3, fontSize: 12 }} />
            <label style={{ color: '#6b21a8' }}>pages →</label>
            <button onClick={() => onSequentialStep({ pageCount: seqPageCount })}
              disabled={seqPageCount === 0}
              style={{
                padding: '5px 12px',
                backgroundColor: seqPageCount === 0 ? '#d1d5db' : '#7c3aed',
                color: 'white', border: 'none', borderRadius: 4,
                cursor: seqPageCount === 0 ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 600
              }}>
              Assign {STEP_LABEL[seqStep]} →
            </button>
            <button onClick={onSequentialSkipStep}
              style={{ padding: '4px 10px', backgroundColor: 'white', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
              Skip this step
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ color: '#6b21a8', fontSize: 11 }}>
              {ungroupedCount} ungrouped page{ungroupedCount === 1 ? '' : 's'} remaining
            </span>
          </div>
        </div>
      )}

      {/* Batch classify */}
      {selectedCount > 0 && (
        <div style={{
          padding: '6px 10px', backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe', borderRadius: 4,
          display: 'flex', gap: 6, alignItems: 'center', fontSize: 12
        }}>
          <span style={{ color: '#1e40af', fontWeight: 600 }}>{selectedCount} selected</span>
          <span style={{ color: '#3b82f6' }}>· classify as:</span>
          {['lem', 'daily_ticket', 'signature', 'summary', 'unknown'].map(dt => (
            <button key={dt} onClick={() => onBulkClassify(dt)}
              style={{ padding: '3px 8px', backgroundColor: 'white', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
              {dt.replace('_', ' ')}
            </button>
          ))}
          <button onClick={onSendSelectedToSkip}
            style={{ padding: '3px 8px', backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
            🗑 Skip
          </button>
          <button onClick={onClearSelection}
            style={{ padding: '3px 8px', backgroundColor: 'transparent', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
            clear
          </button>
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ fontSize: 12, color: '#6b7280' }}>
        <strong style={{ color: ungroupedCount > 0 ? '#92400e' : '#16a34a' }}>{ungroupedCount}</strong> ungrouped
      </div>
    </div>
  )
}

function StepPill({ label, filled, active, count, step }) {
  const fg = active ? '#5b21b6' : filled ? '#166534' : '#9ca3af'
  const bg = active ? '#ede9fe' : filled ? '#d1fae5' : '#f3f4f6'
  const border = active ? '#7c3aed' : filled ? '#10b981' : '#d1d5db'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 12,
      backgroundColor: bg, color: fg,
      border: `1px solid ${border}`,
      fontSize: 11, fontWeight: 600
    }}>
      {filled && !active ? '✓ ' : ''}{step}. {label} ({count})
    </span>
  )
}
