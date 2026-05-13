/**
 * GroupingArea — list of confirmed groups, plus drop zones to create
 * new groups and the Skip bucket.
 *
 * Each group exposes three slots (LEM / Ticket / Other). Pages can be
 * dragged from the thumbnail grid or between groups. The slots display
 * page numbers and show a + drop indicator when a drag is in progress.
 */
import React, { useState } from 'react'

export default function GroupingArea({
  groups,                    // [{ id, ticket_number, foreman_name, role, date, lemPages, ticketPages, otherPages }]
  indexEntries,              // for the "+ New from index" picker
  usedTicketNumbers,         // Set<string>
  skipPages,                 // number[]
  onCreateGroupFromIndex,    // (entry) => void
  onCreateEmptyGroup,        // () => void
  onUpdateGroupField,        // (groupId, field, value) => void
  onRemoveGroup,             // (groupId) => void
  onDropOnSlot,              // (groupId, slot, payload) => void
  onDropOnNewGroup,          // (payload) => void
  onDropOnSkip,              // (payload) => void
  onUnassignPages,           // (pageNumbers) => void
  onResumeSequential,        // (group) => void — re-open group in sequential mode
  seqWorkingGroupId,         // currently-active group, for highlighting
  selectedPageCount = 0,     // number of thumbnails currently selected
  onAddSelectedToSlot,       // (groupId, slot) => void — click-to-assign
  onAddSelectedToNewGroup,   // () => void — click-to-create-new-group
  onSendSelectedToSkip       // () => void — click-to-skip
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }

  const readPayload = (e) => {
    try {
      const raw = e.dataTransfer.getData('application/json')
      return raw ? JSON.parse(raw) : null
    } catch (_) { return null }
  }

  return (
    <div style={{
      marginTop: 14, padding: 12,
      backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 6
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>
          Document Groups ({groups.length})
        </h3>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setPickerOpen(o => !o)}
            style={{ padding: '5px 10px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Foreman picker / resume ▾
          </button>
          {pickerOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '110%', zIndex: 50,
              backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 280, maxHeight: 320, overflow: 'auto'
            }}>
              {indexEntries.length === 0 && (
                <div style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>
                  No index loaded. Use "+ New empty group" below.
                </div>
              )}
              {indexEntries.map((e, i) => {
                const used = e.ticket_number && usedTicketNumbers.has(String(e.ticket_number))
                // When used, find the existing group so the admin can
                // re-open it in sequential mode. When not used, create
                // a new empty group from the entry.
                const existingGroup = used
                  ? groups.find(g => String(g.ticket_number) === String(e.ticket_number))
                  : null
                return (
                  <div key={i}
                    onClick={() => {
                      if (used && existingGroup && onResumeSequential) {
                        onResumeSequential(existingGroup)
                      } else if (!used) {
                        onCreateGroupFromIndex(e)
                      }
                      setPickerOpen(false)
                    }}
                    style={{
                      padding: '7px 10px', cursor: 'pointer',
                      fontSize: 12, color: '#111827',
                      borderBottom: '1px solid #f3f4f6',
                      backgroundColor: used ? '#f5f3ff' : 'white'
                    }}>
                    <strong>#{e.ticket_number || '?'}</strong> — {e.first_name} {e.last_name}
                    {e.role && <span style={{ color: '#7c3aed', marginLeft: 4 }}>({e.role})</span>}
                    {used && <span style={{ marginLeft: 6, color: '#7c3aed', fontWeight: 600 }}>↻ resume / edit</span>}
                  </div>
                )
              })}
              <div onClick={() => { onCreateEmptyGroup(); setPickerOpen(false) }}
                style={{
                  padding: '8px 10px', cursor: 'pointer', fontSize: 12, color: '#374151',
                  borderTop: '1px solid #e5e7eb', fontWeight: 600,
                  backgroundColor: '#f9fafb'
                }}>
                + New empty group (no index entry)
              </div>
            </div>
          )}
        </div>
      </div>

      {groups.length === 0 && (
        <div style={{ padding: 18, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
          No groups yet — drag pages onto the "+ New group" zone below, or create one from the index.
        </div>
      )}

      {groups.map(g => (
        <GroupCard key={g.id} group={g}
          onUpdateGroupField={onUpdateGroupField}
          onRemoveGroup={onRemoveGroup}
          onDropOnSlot={onDropOnSlot}
          onUnassignPages={onUnassignPages}
          onResumeSequential={onResumeSequential}
          isActiveSeq={g.id === seqWorkingGroupId}
          selectedPageCount={selectedPageCount}
          onAddSelectedToSlot={onAddSelectedToSlot}
          handleDragOver={handleDragOver}
          readPayload={readPayload} />
      ))}

      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <div onDragOver={handleDragOver}
          onDrop={(e) => { const p = readPayload(e); if (p) onDropOnNewGroup(p) }}
          onClick={() => {
            if (selectedPageCount > 0 && onDropOnNewGroup) {
              // Synthesise a payload from the current selection so a
              // bare click works the same as a drop.
              // Workspace's handleDropOnNewGroup reads pageNumbers
              // from the payload; we pull the selection from the
              // assign-slot handler's closure since the workspace
              // owns selection.
              // The Add-to-slot path already clears selection — we
              // need the same flow for new-group. Trigger via
              // onAddSelectedToSlot with a sentinel "newGroup" key.
              onAddSelectedToNewGroup?.()
            }
          }}
          style={{
            flex: 1,
            padding: 14, border: '2px dashed #c4b5fd', borderRadius: 6,
            backgroundColor: '#faf5ff', textAlign: 'center',
            fontSize: 12, color: '#5b21b6',
            cursor: selectedPageCount > 0 ? 'pointer' : 'copy'
          }}>
          {selectedPageCount > 0
            ? `+ New group from ${selectedPageCount} selected page${selectedPageCount === 1 ? '' : 's'} — click here`
            : '+ New group (drop pages here to create)'}
        </div>
        <div onDragOver={handleDragOver}
          onDrop={(e) => { const p = readPayload(e); if (p) onDropOnSkip(p) }}
          onClick={() => {
            if (selectedPageCount > 0 && onSendSelectedToSkip) onSendSelectedToSkip()
          }}
          style={{
            flex: 1,
            padding: 14, border: '2px dashed #fca5a5', borderRadius: 6,
            backgroundColor: '#fef2f2', textAlign: 'center',
            fontSize: 12, color: '#991b1b',
            cursor: selectedPageCount > 0 ? 'pointer' : 'copy'
          }}>
          {selectedPageCount > 0
            ? `🗑 Send ${selectedPageCount} selected to Skip — click here`
            : `🗑 Skip / Unclassified (${skipPages.length}) — drop pages to ignore`}
        </div>
      </div>
    </div>
  )
}

function GroupCard({ group, onUpdateGroupField, onRemoveGroup, onDropOnSlot, onUnassignPages, onResumeSequential, isActiveSeq, selectedPageCount = 0, onAddSelectedToSlot, handleDragOver, readPayload }) {
  // Each chip can be picked up and dragged to another group's slot
  // (the receiving onDropOnSlot calls assignPagesToGroupSlot which
  // first calls removePagesFromAll, so a drag-between-groups is
  // effectively a move). Click on the chip body opens the page in
  // the lightbox via the parent (we don't have a reference here, so
  // the click target is "remove from this group" via the X button).
  const chipDragStart = (e, pageNumber) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ pageNumbers: [pageNumber] }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const slot = (label, key, pages, accentColor) => (
    <div onDragOver={handleDragOver}
      onDrop={(e) => { const p = readPayload(e); if (p) onDropOnSlot(group.id, key, p) }}
      style={{
        flex: 1, minWidth: 0,
        border: `1px dashed ${accentColor}`, backgroundColor: accentColor + '10',
        borderRadius: 4, padding: 6, fontSize: 11
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, color: accentColor }}>
          {label} <span style={{ color: '#6b7280', fontWeight: 400 }}>({pages.length})</span>
        </div>
        {/* Click-to-assign — primary input path because drag-and-drop
            is unreliable across browsers / touch devices. Active only
            when there is a selection on the thumbnail grid. */}
        {selectedPageCount > 0 && onAddSelectedToSlot && (
          <button type="button"
            onClick={() => onAddSelectedToSlot(group.id, key)}
            title={`Add ${selectedPageCount} selected page${selectedPageCount === 1 ? '' : 's'} to this slot`}
            style={{
              padding: '2px 8px', fontSize: 10, fontWeight: 700,
              backgroundColor: accentColor, color: 'white',
              border: 'none', borderRadius: 3, cursor: 'pointer',
              lineHeight: 1.4
            }}>
            + Add {selectedPageCount}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {pages.length === 0 && <span style={{ color: '#9ca3af' }}>(click + Add above, or drop pages here)</span>}
        {pages.map(n => (
          <span key={n}
            draggable
            onDragStart={(e) => chipDragStart(e, n)}
            title={`Page ${n} — drag to another group, or click × to send back to ungrouped`}
            style={{
              padding: '1px 4px 1px 6px', backgroundColor: 'white',
              border: '1px solid ' + accentColor, borderRadius: 3,
              color: accentColor, cursor: 'grab', userSelect: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 4
            }}>
            pg {n}
            <button type="button"
              onClick={(e) => { e.stopPropagation(); onUnassignPages([n]) }}
              title="Remove from this group"
              style={{
                width: 14, height: 14, lineHeight: 1,
                padding: 0, marginLeft: 2,
                backgroundColor: accentColor, color: 'white',
                border: 'none', borderRadius: '50%',
                fontSize: 10, fontWeight: 700, cursor: 'pointer'
              }}>×</button>
          </span>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{
      border: isActiveSeq ? '2px solid #7c3aed' : '1px solid #e5e7eb',
      borderRadius: 6, padding: 10, marginBottom: 8,
      backgroundColor: isActiveSeq ? '#faf5ff' : '#fafbfc',
      boxShadow: isActiveSeq ? '0 0 0 3px rgba(124,58,237,0.12)' : 'none'
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>Ticket #</span>
        <input value={group.ticket_number || ''} onChange={(e) => onUpdateGroupField(group.id, 'ticket_number', e.target.value)}
          placeholder="—"
          style={{ width: 90, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 12 }} />
        <span style={{ fontSize: 11, color: '#6b7280' }}>Foreman</span>
        <input value={group.foreman_name || ''} onChange={(e) => onUpdateGroupField(group.id, 'foreman_name', e.target.value)}
          placeholder="—"
          style={{ width: 170, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 12 }} />
        <span style={{ fontSize: 11, color: '#6b7280' }}>Role</span>
        <input value={group.role || ''} onChange={(e) => onUpdateGroupField(group.id, 'role', e.target.value)}
          placeholder="—"
          style={{ width: 140, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 12 }} />
        <span style={{ fontSize: 11, color: '#6b7280' }}>Date</span>
        <input type="date" value={group.date || ''} onChange={(e) => onUpdateGroupField(group.id, 'date', e.target.value)}
          style={{ padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 12 }} />
        <div style={{ flex: 1 }} />
        {/* Resume sequential mode for this foreman — lets the admin
            go BACK to fix a mistake (wrong LEM count, missed ticket
            page, etc.) without losing the rest of the workspace.
            Hidden while this group is already the active sequential
            target; "Done with foreman" in the toolbar exits. */}
        {onResumeSequential && !isActiveSeq && (
          <button onClick={() => onResumeSequential(group)}
            title="Re-open this foreman in sequential mode to fix a mistake"
            style={{ padding: '3px 9px', backgroundColor: 'white', color: '#5b21b6', border: '1px solid #c4b5fd', borderRadius: 3, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
            ↻ Resume / edit
          </button>
        )}
        {isActiveSeq && (
          <span style={{ padding: '3px 9px', backgroundColor: '#7c3aed', color: 'white', borderRadius: 3, fontSize: 11, fontWeight: 600 }}>
            ⚡ Editing now
          </span>
        )}
        <button onClick={() => onRemoveGroup(group.id)}
          style={{ padding: '3px 9px', backgroundColor: 'transparent', color: '#dc3545', border: '1px solid #dc3545', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
          ✕ Remove group
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {slot('LEM', 'lemPages', group.lemPages || [], '#1e40af')}
        {slot('Ticket', 'ticketPages', group.ticketPages || [], '#166534')}
        {slot('Other', 'otherPages', group.otherPages || [], '#6b7280')}
      </div>
    </div>
  )
}
