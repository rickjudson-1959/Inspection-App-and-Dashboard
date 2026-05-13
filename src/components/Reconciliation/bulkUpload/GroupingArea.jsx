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
  onUnassignPages            // (pageNumbers) => void
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
            + New group from index ▾
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
                return (
                  <div key={i}
                    onClick={() => { if (!used) { onCreateGroupFromIndex(e); setPickerOpen(false) } }}
                    style={{
                      padding: '7px 10px', cursor: used ? 'not-allowed' : 'pointer',
                      fontSize: 12, color: used ? '#9ca3af' : '#111827',
                      borderBottom: '1px solid #f3f4f6',
                      backgroundColor: used ? '#f9fafb' : 'white'
                    }}>
                    <strong>#{e.ticket_number || '?'}</strong> — {e.first_name} {e.last_name}
                    {e.role && <span style={{ color: '#7c3aed', marginLeft: 4 }}>({e.role})</span>}
                    {used && <span style={{ marginLeft: 6, color: '#10b981' }}>✓ assigned</span>}
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
          handleDragOver={handleDragOver}
          readPayload={readPayload} />
      ))}

      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <div onDragOver={handleDragOver}
          onDrop={(e) => { const p = readPayload(e); if (p) onDropOnNewGroup(p) }}
          style={{
            flex: 1,
            padding: 14, border: '2px dashed #c4b5fd', borderRadius: 6,
            backgroundColor: '#faf5ff', textAlign: 'center',
            fontSize: 12, color: '#5b21b6', cursor: 'copy'
          }}>
          + New group (drop pages here to create)
        </div>
        <div onDragOver={handleDragOver}
          onDrop={(e) => { const p = readPayload(e); if (p) onDropOnSkip(p) }}
          style={{
            flex: 1,
            padding: 14, border: '2px dashed #fca5a5', borderRadius: 6,
            backgroundColor: '#fef2f2', textAlign: 'center',
            fontSize: 12, color: '#991b1b', cursor: 'copy'
          }}>
          🗑 Skip / Unclassified ({skipPages.length}) — drop pages to ignore
        </div>
      </div>
    </div>
  )
}

function GroupCard({ group, onUpdateGroupField, onRemoveGroup, onDropOnSlot, onUnassignPages, handleDragOver, readPayload }) {
  const slot = (label, key, pages, accentColor) => (
    <div onDragOver={handleDragOver}
      onDrop={(e) => { const p = readPayload(e); if (p) onDropOnSlot(group.id, key, p) }}
      style={{
        flex: 1, minWidth: 0,
        border: `1px dashed ${accentColor}`, backgroundColor: accentColor + '10',
        borderRadius: 4, padding: 6, fontSize: 11
      }}>
      <div style={{ fontWeight: 600, color: accentColor, marginBottom: 4 }}>
        {label} <span style={{ color: '#6b7280', fontWeight: 400 }}>({pages.length})</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {pages.length === 0 && <span style={{ color: '#9ca3af' }}>(drop pages)</span>}
        {pages.map(n => (
          <span key={n}
            title="Click to remove from this group"
            onClick={() => onUnassignPages([n])}
            style={{
              padding: '1px 6px', backgroundColor: 'white',
              border: '1px solid ' + accentColor, borderRadius: 3,
              color: accentColor, cursor: 'pointer'
            }}>
            pg {n}
          </span>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 8,
      backgroundColor: '#fafbfc'
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
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
