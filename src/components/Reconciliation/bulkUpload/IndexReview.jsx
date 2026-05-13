/**
 * IndexReview — editable table of extracted index entries.
 *
 * Renders inline in the workspace toolbar. Admin fixes OCR errors,
 * deletes garbage rows, adds missing entries, then locks the index
 * in as the foreman/ticket reference.
 */
import React from 'react'

export default function IndexReview({
  indexEntries,
  indexDate,
  onChangeDate,
  onUpdateEntry,
  onDeleteEntry,
  onAddEntry,
  onConfirm,
  onDismiss,
  source = 'page1'  // 'page1' | 'separate'
}) {
  const ticketNumbers = indexEntries.map(e => e.ticket_number).filter(Boolean).sort()
  const range = ticketNumbers.length > 0
    ? `${ticketNumbers[0]}–${ticketNumbers[ticketNumbers.length - 1]}`
    : '(none)'

  return (
    <div style={{
      border: '1px solid #ddd6fe', backgroundColor: '#faf5ff',
      borderRadius: 6, padding: 14, marginBottom: 12
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#5b21b6' }}>
            📋 Index page {source === 'separate' ? '(uploaded separately)' : 'detected'} — {indexEntries.length} foremen
          </div>
          <div style={{ fontSize: 12, color: '#6b21a8' }}>
            Ticket range: {range} · Edit any row below, then confirm to use as the assignment dropdown.
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#5b21b6', marginRight: 8 }}>Date:</label>
          <input type="date" value={indexDate || ''} onChange={(e) => onChangeDate(e.target.value)}
            style={{ padding: '4px 8px', border: '1px solid #c4b5fd', borderRadius: 4, fontSize: 12 }} />
        </div>
      </div>
      <div style={{ maxHeight: 220, overflow: 'auto', backgroundColor: 'white', borderRadius: 4, border: '1px solid #e9d5ff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f5f3ff' }}>
            <tr>
              <th style={thStyle}>Ticket #</th>
              <th style={thStyle}>First name</th>
              <th style={thStyle}>Last name</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {indexEntries.map((e, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={tdStyle}>
                  <input value={e.ticket_number || ''} onChange={ev => onUpdateEntry(i, 'ticket_number', ev.target.value)}
                    style={inputStyle} />
                </td>
                <td style={tdStyle}>
                  <input value={e.first_name || ''} onChange={ev => onUpdateEntry(i, 'first_name', ev.target.value)}
                    style={inputStyle} />
                </td>
                <td style={tdStyle}>
                  <input value={e.last_name || ''} onChange={ev => onUpdateEntry(i, 'last_name', ev.target.value)}
                    style={inputStyle} />
                </td>
                <td style={tdStyle}>
                  <input value={e.role || ''} onChange={ev => onUpdateEntry(i, 'role', ev.target.value)}
                    style={inputStyle} />
                </td>
                <td style={{ ...tdStyle, width: 32, textAlign: 'center' }}>
                  <button onClick={() => onDeleteEntry(i)} title="Delete row"
                    style={{ padding: '2px 7px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button onClick={onAddEntry}
          style={{ padding: '5px 10px', backgroundColor: 'white', color: '#5b21b6', border: '1px solid #c4b5fd', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
          + Add row
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={onDismiss}
          style={{ padding: '5px 12px', backgroundColor: 'white', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
          Dismiss (don't use as index)
        </button>
        <button onClick={onConfirm} disabled={indexEntries.length === 0}
          style={{
            padding: '6px 14px',
            backgroundColor: indexEntries.length === 0 ? '#d1d5db' : '#7c3aed',
            color: 'white', border: 'none', borderRadius: 4,
            cursor: indexEntries.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 12, fontWeight: 600
          }}>
          ✓ Use as reference ({indexEntries.length})
        </button>
      </div>
    </div>
  )
}

const thStyle = { textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: '#374151' }
const tdStyle = { padding: '4px 8px' }
const inputStyle = { width: '100%', padding: '3px 6px', border: '1px solid #e5e7eb', borderRadius: 3, fontSize: 12, boxSizing: 'border-box' }
