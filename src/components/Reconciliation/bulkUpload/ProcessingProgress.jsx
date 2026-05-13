/**
 * ProcessingProgress — pre-confirmation summary + live progress
 * overlay during the save phase.
 */
import React from 'react'

export function PreConfirmationSummary({ groups, skipCount, ungroupedCount, onProcess, onClose, disabled }) {
  const complete = groups.filter(g => (g.lemPages?.length || 0) > 0 && (g.ticketPages?.length || 0) > 0).length
  const lemOnly = groups.filter(g => (g.lemPages?.length || 0) > 0 && (g.ticketPages?.length || 0) === 0).length
  const ticketOnly = groups.filter(g => (g.lemPages?.length || 0) === 0 && (g.ticketPages?.length || 0) > 0).length
  return (
    <div style={{
      padding: 14, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
      borderRadius: 6, marginTop: 12
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#166534', marginBottom: 6 }}>
            Ready to process — {groups.length} groups
          </div>
          <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
            ✓ <strong>{complete}</strong> complete (LEM + Ticket)<br />
            {lemOnly > 0 && <>⚠ <strong>{lemOnly}</strong> LEM-only (no ticket pages assigned)<br /></>}
            {ticketOnly > 0 && <>⚠ <strong>{ticketOnly}</strong> ticket-only (no LEM pages)<br /></>}
            🗑 <strong>{skipCount}</strong> pages in Skip/Unclassified<br />
            {ungroupedCount > 0
              ? <>⚠ <strong>{ungroupedCount}</strong> ungrouped pages remaining</>
              : <>✓ <strong>0</strong> ungrouped pages</>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={onProcess} disabled={disabled}
            style={{
              padding: '10px 18px',
              backgroundColor: disabled ? '#d1d5db' : '#16a34a',
              color: 'white', border: 'none', borderRadius: 6,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 600
            }}>
            Process All Groups
          </button>
        </div>
      </div>
    </div>
  )
}

export function ProcessingOverlay({ message, current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10200,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 8, padding: 28, minWidth: 380,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <div style={{
          width: 48, height: 48, margin: '0 auto 18px',
          border: '4px solid #e5e7eb', borderTopColor: '#16a34a', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <div style={{ textAlign: 'center', fontSize: 14, color: '#111827', marginBottom: 10 }}>{message}</div>
        {total > 0 && (
          <>
            <div style={{ width: '100%', height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#16a34a', transition: 'width 0.2s' }} />
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center' }}>{current} / {total} ({pct}%)</div>
          </>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}

export function CompletionScreen({ summary, onUploadAnother, onDone }) {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 14 }}>✓</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
        Saved {summary?.uploadedCount || 0} document row{summary?.uploadedCount === 1 ? '' : 's'}.
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        {summary?.matchCount || 0} LEM ↔ Ticket match{summary?.matchCount === 1 ? '' : 'es'} ·
        {' '}{summary?.lemExtractedCount || 0} LEM extraction{summary?.lemExtractedCount === 1 ? '' : 's'} completed
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={onUploadAnother}
          style={{ padding: '8px 16px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          Upload another
        </button>
        <button onClick={onDone}
          style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Done
        </button>
      </div>
    </div>
  )
}
