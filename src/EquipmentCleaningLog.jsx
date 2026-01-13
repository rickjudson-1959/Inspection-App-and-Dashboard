import React, { useEffect } from 'react'
import { useActivityAudit } from './useActivityAudit'

function CleaningLog({ data, onChange, inspector, reportDate, reportId, currentUser }) {
  const { initializeEntryValues, logEntryFieldChange, logEntryAdd, logEntryDelete, originalEntriesRef } = useActivityAudit({
    reportId, reportDate, entityType: 'equipment_cleaning', currentUser
  })

  const defaultData = { entries: [] }
  const cleaningData = { ...defaultData, ...data, entries: data?.entries || [] }

  useEffect(() => { initializeEntryValues(cleaningData.entries) }, [cleaningData.entries])

  const addEntry = () => {
    const newEntry = { id: Date.now(), date: '', unitItem: '', cleaningLevel: '', photosTaken: '', lsd: '', directionOfTravel: '' }
    onChange({ ...cleaningData, entries: [...cleaningData.entries, newEntry] })
    logEntryAdd(newEntry, 'Equipment Cleaning', 'New cleaning entry added')
  }

  const updateEntry = (id, field, value) => {
    onChange({ ...cleaningData, entries: cleaningData.entries.map(e => e.id === id ? { ...e, [field]: value } : e) })
  }

  const handleBlur = (id, field) => {
    const entry = cleaningData.entries.find(e => e.id === id)
    if (entry) logEntryFieldChange(id, field, entry[field], 'Equipment Cleaning', { kpStart: entry.lsd })
  }

  const removeEntry = (id) => {
    const entry = cleaningData.entries.find(e => e.id === id)
    if (entry) logEntryDelete(entry, 'Equipment Cleaning', `${entry.unitItem || 'Item'} | Level ${entry.cleaningLevel || '?'} | ${entry.lsd || 'N/A'}`)
    onChange({ ...cleaningData, entries: cleaningData.entries.filter(e => e.id !== id) })
    delete originalEntriesRef.current[id]
  }

  const sectionStyle = { marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }
  const sectionHeaderStyle = { fontSize: '14px', fontWeight: 'bold', color: '#495057', marginBottom: '15px', paddingBottom: '8px', borderBottom: '2px solid #28a745' }
  const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '13px' }
  const thStyle = { padding: '10px 8px', backgroundColor: '#28a745', color: 'white', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', border: '1px solid #1e7e34' }
  const tdStyle = { padding: '6px', border: '1px solid #dee2e6', textAlign: 'center', verticalAlign: 'middle' }
  const tableInputStyle = { width: '100%', padding: '6px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px', textAlign: 'center', boxSizing: 'border-box' }
  const selectStyle = { ...tableInputStyle, cursor: 'pointer' }

  return (
    <div style={{ marginTop: '15px' }}>
      {(inspector || reportDate) && (
        <div style={{ padding: '12px 15px', backgroundColor: '#d1ecf1', borderRadius: '6px', marginBottom: '15px', border: '1px solid #bee5eb' }}>
          <span style={{ fontSize: '13px', color: '#0c5460' }}>
            <strong>📋 From Report:</strong> {reportDate && <>Date: <strong>{reportDate}</strong></>}{reportDate && inspector && ' | '}{inspector && <>Inspector: <strong>{inspector}</strong></>}
          </span>
        </div>
      )}

      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🧹 EQUIPMENT CLEANING LOG</div>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 0, borderBottom: 'none' }}>📋 CLEANING ENTRIES</div>
          <button onClick={addEntry} style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>+ Add Entry</button>
        </div>

        {cleaningData.entries.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>No cleaning entries. Click "Add Entry" to log equipment cleaning.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: '100px' }}>Date</th>
                  <th style={{ ...thStyle, width: '150px' }}>Unit/Item</th>
                  <th style={{ ...thStyle, width: '100px' }}>Level</th>
                  <th style={{ ...thStyle, width: '90px' }}>Photos?</th>
                  <th style={{ ...thStyle, width: '120px' }}>LSD</th>
                  <th style={thStyle}>Direction/Destination</th>
                  <th style={{ ...thStyle, width: '50px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {cleaningData.entries.map(entry => (
                  <tr key={entry.id} style={{ backgroundColor: entry.cleaningLevel === '3' ? '#fff3cd' : 'white' }}>
                    <td style={tdStyle}><input type="date" value={entry.date} onChange={(e) => updateEntry(entry.id, 'date', e.target.value)} onBlur={() => handleBlur(entry.id, 'date')} style={tableInputStyle}/></td>
                    <td style={tdStyle}><input type="text" value={entry.unitItem} onChange={(e) => updateEntry(entry.id, 'unitItem', e.target.value)} onBlur={() => handleBlur(entry.id, 'unitItem')} style={tableInputStyle} placeholder="e.g. boots, quad"/></td>
                    <td style={tdStyle}>
                      <select value={entry.cleaningLevel} onChange={(e) => updateEntry(entry.id, 'cleaningLevel', e.target.value)} onBlur={() => handleBlur(entry.id, 'cleaningLevel')} style={selectStyle}>
                        <option value="">Select...</option>
                        <option value="1">Level 1</option>
                        <option value="2">Level 2</option>
                        <option value="3">Level 3</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <select value={entry.photosTaken} onChange={(e) => updateEntry(entry.id, 'photosTaken', e.target.value)} onBlur={() => handleBlur(entry.id, 'photosTaken')} style={{ ...selectStyle, backgroundColor: entry.cleaningLevel === '3' && !entry.photosTaken ? '#f8d7da' : 'white' }}>
                        <option value="">Select...</option>
                        <option value="yes">YES ✓</option>
                        <option value="no">NO ✗</option>
                      </select>
                      {entry.cleaningLevel === '3' && entry.photosTaken !== 'yes' && <div style={{ fontSize: '10px', color: '#dc3545', marginTop: '2px' }}>Required for L3</div>}
                    </td>
                    <td style={tdStyle}><input type="text" value={entry.lsd} onChange={(e) => updateEntry(entry.id, 'lsd', e.target.value)} onBlur={() => handleBlur(entry.id, 'lsd')} style={tableInputStyle} placeholder="Location"/></td>
                    <td style={tdStyle}><input type="text" value={entry.directionOfTravel} onChange={(e) => updateEntry(entry.id, 'directionOfTravel', e.target.value)} onBlur={() => handleBlur(entry.id, 'directionOfTravel')} style={tableInputStyle} placeholder="Next LSD"/></td>
                    <td style={tdStyle}><button onClick={() => removeEntry(entry.id)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cleaningData.entries.length > 0 && (
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#495057' }}>
            <strong>Summary:</strong> Level 1: {cleaningData.entries.filter(e => e.cleaningLevel === '1').length} | Level 2: {cleaningData.entries.filter(e => e.cleaningLevel === '2').length} | Level 3: {cleaningData.entries.filter(e => e.cleaningLevel === '3').length} | <strong>Total: {cleaningData.entries.length}</strong>
          </div>
        )}
      </div>

      <div style={{ ...sectionStyle, backgroundColor: '#e7f3ff', borderColor: '#007bff' }}>
        <div style={{ ...sectionHeaderStyle, borderBottomColor: '#007bff' }}>ℹ️ CLEANING LEVEL REFERENCE</div>
        <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
          {[
            { level: '1', bg: '#6c757d', desc: 'Mechanical Cleaning (scraping, brushing, removing visible debris)' },
            { level: '2', bg: '#17a2b8', desc: 'Pressure Wash' },
            { level: '3', bg: '#ffc107', color: '#000', desc: 'Disinfect (Bleach with 1% to 2% solution to point of runoff, let stand for 15 min)' }
          ].map(l => (
            <div key={l.level} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ backgroundColor: l.bg, color: l.color || 'white', padding: '2px 10px', borderRadius: '4px', fontWeight: 'bold', minWidth: '60px', textAlign: 'center' }}>Level {l.level}</span>
              <span>{l.desc}</span>
            </div>
          ))}
          <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
            <strong>⚠️ Level 3 Requirements:</strong> Geo-referenced photos are required and must be documented.
          </div>
        </div>
      </div>
    </div>
  )
}

export default CleaningLog
