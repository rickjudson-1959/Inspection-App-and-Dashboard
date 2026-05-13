/**
 * QuickAssignToolbar — speed-up controls above the thumbnail grid.
 *
 * "Assign from index sequentially":
 *   Walks the next un-grouped page + the next un-used index entry.
 *   Admin picks how many pages belong to that foreman (default 4).
 *   System creates a group, assigns those pages to LEM by default,
 *   advances both pointers, repeats until done.
 *
 * "Classify selected as ...":
 *   When the admin has shift-selected a batch of thumbnails, this
 *   bulk-sets their doc_type / sends them to the Skip bucket.
 */
import React, { useState } from 'react'

export default function QuickAssignToolbar({
  selectedCount,
  ungroupedCount,
  indexEntries,
  usedTicketNumbers,            // Set<string>
  onSequentialAssign,           // ({ entry, pageCount, slot }) => void
  onBulkClassify,               // (docType) => void
  onSendSelectedToSkip,         // () => void
  onStartOcr,
  onClearSelection,
  ocrStatus,                    // 'idle' | 'running' | 'done' | 'failed'
  ocrProgress                   // { done, total }
}) {
  const nextEntry = indexEntries.find(e => e.ticket_number && !usedTicketNumbers.has(String(e.ticket_number)))
  const [seqPageCount, setSeqPageCount] = useState(4)
  const [seqSlot, setSeqSlot] = useState('lemPages')

  return (
    <div style={{
      backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6,
      padding: 10, marginBottom: 10,
      display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'
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

      {/* Sequential assign */}
      {indexEntries.length > 0 && nextEntry && (
        <div style={{
          padding: '6px 10px', backgroundColor: '#f5f3ff',
          border: '1px solid #ddd6fe', borderRadius: 4,
          display: 'flex', gap: 8, alignItems: 'center', fontSize: 12
        }}>
          <span style={{ color: '#5b21b6' }}>
            Next: <strong>#{nextEntry.ticket_number}</strong> — {nextEntry.first_name} {nextEntry.last_name}
            {nextEntry.role && <span style={{ color: '#7c3aed' }}> ({nextEntry.role})</span>}
          </span>
          <label style={{ color: '#6b21a8' }}>pages:</label>
          <input type="number" min="1" max="20" value={seqPageCount}
            onChange={e => setSeqPageCount(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: 50, padding: '2px 4px', border: '1px solid #c4b5fd', borderRadius: 3, fontSize: 12 }} />
          <select value={seqSlot} onChange={e => setSeqSlot(e.target.value)}
            style={{ padding: '2px 4px', border: '1px solid #c4b5fd', borderRadius: 3, fontSize: 12 }}>
            <option value="lemPages">LEM</option>
            <option value="ticketPages">Ticket</option>
            <option value="otherPages">Other</option>
          </select>
          <button onClick={() => onSequentialAssign({ entry: nextEntry, pageCount: seqPageCount, slot: seqSlot })}
            style={{ padding: '4px 10px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Assign →
          </button>
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
