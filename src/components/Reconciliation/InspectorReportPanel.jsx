import React, { useState, useCallback, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { supabase } from '../../supabase'

export default function InspectorReportPanel({ report, block, labourRates = [], equipmentRates = [], aliases = [], organizationId, onBlockChange, onAliasCreated }) {
  const [editingCell, setEditingCell] = useState(null) // { section, rowIdx, field }
  const [editValue, setEditValue] = useState('')
  const [dropdownFilter, setDropdownFilter] = useState('')
  const [showAliasPrompt, setShowAliasPrompt] = useState(null) // { originalValue, mappedValue, aliasType }
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const skipBlurRef = useRef(false)
  const [dropdownPos, setDropdownPos] = useState(null)

  // Focus input and calculate dropdown position when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom, left: rect.left, width: rect.width })
    } else {
      setDropdownPos(null)
    }
  }, [editingCell])

  // Close dropdown on outside click
  useEffect(() => {
    if (!editingCell) return
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setEditingCell(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [editingCell])

  if (!report || !block) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
        <p style={{ fontWeight: '600', marginBottom: 8 }}>No inspector report found for this ticket number</p>
        <p style={{ fontSize: 12, fontStyle: 'italic' }}>The inspector must submit a daily report referencing this ticket number</p>
      </div>
    )
  }

  const labourEntries = block.labourEntries || []
  const equipmentEntries = block.equipmentEntries || []

  // --- Rate lookup ---
  function findLabourRate(classification) {
    if (!classification) return null
    const cl = classification.toLowerCase().trim()
    // 1. Check learned aliases
    const alias = aliases.find(a => a.alias_type === 'labour' && a.original_value.toLowerCase().trim() === cl)
    const lookupName = alias ? alias.mapped_value : classification
    const ln = lookupName.toLowerCase().trim()
    // 2. Exact match
    let found = labourRates.find(r => (r.classification || '').toLowerCase().trim() === ln)
    if (found) return found
    // 3. Contains match
    found = labourRates.find(r => {
      const rc = (r.classification || '').toLowerCase()
      return rc.includes(ln) || ln.includes(rc)
    })
    return found || null
  }

  function findEquipmentRate(equipType) {
    if (!equipType) return null
    const et = equipType.toLowerCase().trim()
    // 1. Check learned aliases
    const alias = aliases.find(a => a.alias_type === 'equipment' && a.original_value.toLowerCase().trim() === et)
    const lookupName = alias ? alias.mapped_value : equipType
    const en = lookupName.toLowerCase().trim()
    // 2. Exact match
    let found = equipmentRates.find(r => (r.equipment_type || r.type || '').toLowerCase().trim() === en)
    if (found) return found
    // 3. Contains match
    found = equipmentRates.find(r => {
      const rc = (r.equipment_type || r.type || '').toLowerCase()
      return rc.includes(en) || en.includes(rc)
    })
    return found || null
  }

  function calcLabourCost(entry) {
    const rate = findLabourRate(entry.classification)
    if (!rate) return { rate: null, cost: 0 }
    const rt = parseFloat(entry.rt || entry.hours || 0)
    const ot = parseFloat(entry.ot || 0)
    const qty = parseInt(entry.count || 1)
    const stRate = parseFloat(rate.rate_st || rate.rate || 0)
    const otRate = parseFloat(rate.rate_ot || stRate * 1.5)
    const cost = ((rt * stRate) + (ot * otRate)) * qty
    return { rate: stRate, cost }
  }

  function calcEquipmentCost(entry) {
    const rate = findEquipmentRate(entry.type || entry.equipment_type)
    if (!rate) return { rate: null, cost: 0 }
    const hrs = parseFloat(entry.hours || 0)
    const qty = parseInt(entry.count || 1)
    const hrRate = parseFloat(rate.rate_hourly || rate.hourly_rate || rate.rate || 0)
    const cost = hrs * hrRate * qty
    return { rate: hrRate, cost }
  }

  // --- Totals ---
  const labourCosts = labourEntries.map(e => calcLabourCost(e))
  const equipmentCosts = equipmentEntries.map(e => calcEquipmentCost(e))
  const labourTotal = labourCosts.reduce((s, c) => s + c.cost, 0)
  const equipmentTotal = equipmentCosts.reduce((s, c) => s + c.cost, 0)
  const grandTotal = labourTotal + equipmentTotal

  function fmt(n) { return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' }) }

  // --- Inline editing ---
  function startEdit(section, rowIdx, field, currentValue, isDropdownField) {
    setEditingCell({ section, rowIdx, field })
    // For dropdown fields: start with empty input so the full list shows
    setEditValue(isDropdownField ? '' : (currentValue || ''))
    setDropdownFilter('')
  }

  function commitEdit(newValue, moveDown) {
    if (!editingCell || !onBlockChange) return
    // Prevent onBlur from double-committing when Enter moves to next row
    skipBlurRef.current = true
    setTimeout(() => { skipBlurRef.current = false }, 50)
    const { section, rowIdx, field } = editingCell
    const entries = section === 'labour' ? [...labourEntries] : [...equipmentEntries]
    const entry = { ...entries[rowIdx] }
    const fieldMap = {
      name: 'employeeName',
      classification: 'classification',
      rt: 'rt',
      ot: 'ot',
      jh: 'jh',
      count: 'count',
      type: 'type',
      unitNumber: 'unitNumber',
      hours: 'hours',
    }
    const key = fieldMap[field] || field
    const oldValue = entry[key] || ''

    // Don't save if value hasn't changed
    if (String(newValue) === String(oldValue)) {
      if (moveDown) {
        moveToNextRow(section, rowIdx, field)
      } else {
        setEditingCell(null)
      }
      return
    }

    entry[key] = newValue
    entries[rowIdx] = entry

    const updatedBlock = { ...block }
    if (section === 'labour') updatedBlock.labourEntries = entries
    else updatedBlock.equipmentEntries = entries

    const auditEntries = [{
      field: `${section}[${rowIdx}].${field}`,
      oldValue,
      newValue,
    }]

    onBlockChange(updatedBlock, auditEntries)

    if (moveDown) {
      moveToNextRow(section, rowIdx, field)
    } else {
      setEditingCell(null)
    }
  }

  function moveToNextRow(section, currentRowIdx, field) {
    const entries = section === 'labour' ? labourEntries : equipmentEntries
    const nextIdx = currentRowIdx + 1
    if (nextIdx < entries.length) {
      const entry = entries[nextIdx]
      const isDropdownField = (field === 'classification' || field === 'type')
      let currentValue = ''
      if (field === 'name') currentValue = entry.employeeName || entry.employee_name || entry.name || ''
      else if (field === 'classification') currentValue = entry.classification || ''
      else if (field === 'type') currentValue = entry.type || entry.equipment_type || ''
      else if (field === 'unitNumber') currentValue = entry.unitNumber || entry.unit_number || ''
      else currentValue = String(entry[field] || '')
      startEdit(section, nextIdx, field, currentValue, isDropdownField)
    } else {
      setEditingCell(null)
    }
  }

  function handleClassificationSelect(section, rowIdx, rateCardName) {
    const entries = section === 'labour' ? labourEntries : equipmentEntries
    const entry = entries[rowIdx]
    const originalValue = section === 'labour'
      ? (entry.classification || '')
      : (entry.type || entry.equipment_type || '')

    commitEdit(rateCardName)

    // Prompt to save alias if the original value is different
    if (originalValue && originalValue.toLowerCase().trim() !== rateCardName.toLowerCase().trim()) {
      setShowAliasPrompt({
        originalValue,
        mappedValue: rateCardName,
        aliasType: section === 'labour' ? 'labour' : 'equipment',
      })
    }
  }

  async function saveAlias(prompt) {
    try {
      const userId = (await supabase.auth.getUser()).data?.user?.id || null
      // Check if alias already exists
      const { data: existing } = await supabase.from('classification_aliases')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('alias_type', prompt.aliasType)
        .ilike('original_value', prompt.originalValue)
        .maybeSingle()

      if (existing) {
        await supabase.from('classification_aliases')
          .update({ mapped_value: prompt.mappedValue, created_by: userId })
          .eq('id', existing.id)
      } else {
        await supabase.from('classification_aliases').insert({
          organization_id: organizationId,
          alias_type: prompt.aliasType,
          original_value: prompt.originalValue,
          mapped_value: prompt.mappedValue,
          created_by: userId,
        })
      }

      if (onAliasCreated) {
        onAliasCreated({
          alias_type: prompt.aliasType,
          original_value: prompt.originalValue,
          mapped_value: prompt.mappedValue,
          organization_id: organizationId,
        })
      }
    } catch (e) {
      console.error('Failed to save alias:', e)
    }
    setShowAliasPrompt(null)
  }

  // --- Editable cell renderer (plain function, NOT a component — avoids unmount/remount on re-render) ---
  function renderCell(section, rowIdx, field, value, style, isDropdown, dropdownItems, dropdownKey) {
    const isEditing = editingCell?.section === section && editingCell?.rowIdx === rowIdx && editingCell?.field === field

    if (isEditing && isDropdown) {
      const filterText = editValue.toLowerCase().trim()
      const filtered = filterText.length === 0
        ? (dropdownItems || [])
        : (dropdownItems || []).filter(item => {
            const name = (item[dropdownKey] || '').toLowerCase()
            return name.includes(filterText)
          })
      return (
        <td style={{ ...style, padding: 0 }} ref={dropdownRef}>
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => { setEditValue(e.target.value); setDropdownFilter(e.target.value) }}
            onBlur={() => { if (!skipBlurRef.current) { if (editValue.trim()) commitEdit(editValue); else setEditingCell(null) } }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); if (editValue.trim()) commitEdit(editValue, true); else setEditingCell(null) }
              if (e.key === 'Escape') setEditingCell(null)
            }}
            placeholder="Type or pick from list..."
            style={{ width: '100%', padding: '4px 6px', fontSize: 12, border: '2px solid #3b82f6', borderRadius: 3, boxSizing: 'border-box' }}
          />
          {dropdownPos && ReactDOM.createPortal(
            <div style={{
              position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: Math.max(dropdownPos.width, 280),
              zIndex: 10000, maxHeight: 300, overflowY: 'auto', backgroundColor: 'white',
              border: '1px solid #d1d5db', borderRadius: '0 0 4px 4px', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            }}>
              {filtered.slice(0, 80).map((item, i) => (
                <div
                  key={i}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleClassificationSelect(section, rowIdx, item[dropdownKey])}
                  style={{
                    padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                    backgroundColor: i % 2 === 0 ? '#f9fafb' : 'white',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                  onMouseEnter={e => e.target.style.backgroundColor = '#dbeafe'}
                  onMouseLeave={e => e.target.style.backgroundColor = i % 2 === 0 ? '#f9fafb' : 'white'}
                >
                  {item[dropdownKey]}
                </div>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: '8px', fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>No matches</div>
              )}
            </div>,
            document.body
          )}
        </td>
      )
    }

    if (isEditing) {
      return (
        <td style={{ ...style, padding: 0 }}>
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => { if (!skipBlurRef.current) commitEdit(editValue) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitEdit(editValue, true) }
              if (e.key === 'Escape') setEditingCell(null)
            }}
            style={{
              width: '100%', padding: '4px 6px', fontSize: 12,
              border: '2px solid #3b82f6', borderRadius: 3,
              boxSizing: 'border-box', textAlign: style?.textAlign || 'left',
            }}
          />
        </td>
      )
    }

    return (
      <td
        style={{ ...style, cursor: 'pointer' }}
        onClick={() => startEdit(section, rowIdx, field, value, isDropdown)}
        title="Click to edit"
      >
        {value || '-'}
      </td>
    )
  }

  const cellStyle = { padding: '4px 6px', borderBottom: '1px solid #e5e7eb', fontSize: 12 }
  const headerStyle = { ...cellStyle, fontWeight: '600', backgroundColor: '#f0fdf4', color: '#166534' }

  return (
    <div style={{ height: '100%', overflow: 'auto', fontSize: 13 }}>
      {/* Alias learning prompt */}
      {showAliasPrompt && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          padding: '10px 14px', backgroundColor: '#eff6ff', borderBottom: '2px solid #3b82f6',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12,
        }}>
          <span style={{ flex: 1 }}>
            Save this mapping so <strong>"{showAliasPrompt.originalValue}"</strong> always resolves to <strong>"{showAliasPrompt.mappedValue}"</strong>?
          </span>
          <button
            onClick={() => saveAlias(showAliasPrompt)}
            style={{ padding: '4px 12px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: '600', fontSize: 12 }}
          >
            Yes
          </button>
          <button
            onClick={() => setShowAliasPrompt(null)}
            style={{ padding: '4px 12px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            No
          </button>
        </div>
      )}

      {/* Report header */}
      <div style={{ padding: '8px 12px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div><span style={{ color: '#6b7280', fontSize: 11 }}>Inspector:</span> <strong>{report.inspector_name}</strong></div>
          <div><span style={{ color: '#6b7280', fontSize: 11 }}>Date:</span> <strong>{report.date}</strong></div>
          {report.spread && <div><span style={{ color: '#6b7280', fontSize: 11 }}>Spread:</span> <strong>{report.spread}</strong></div>}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
          {block.activityType && <div><span style={{ color: '#6b7280', fontSize: 11 }}>Activity:</span> <strong>{block.activityType}</strong></div>}
          {block.contractor && <div><span style={{ color: '#6b7280', fontSize: 11 }}>Contractor:</span> <strong>{block.contractor}</strong></div>}
          {block.foreman && <div><span style={{ color: '#6b7280', fontSize: 11 }}>Foreman:</span> <strong>{block.foreman}</strong></div>}
          {block.ticketNumber && <div><span style={{ color: '#6b7280', fontSize: 11 }}>Ticket:</span> <strong>#{block.ticketNumber}</strong></div>}
        </div>
        {block.workDescription && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#374151', lineHeight: 1.4 }}>{block.workDescription}</div>
        )}
      </div>

      {/* Manpower table */}
      <div style={{ padding: '8px 12px' }}>
        <div style={{ fontWeight: '700', color: '#166534', fontSize: 12, marginBottom: 4 }}>
          MANPOWER ({labourEntries.length})
        </div>
        {labourEntries.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>No manpower entries</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headerStyle, textAlign: 'left' }}>Name</th>
                <th style={{ ...headerStyle, textAlign: 'left' }}>Classification</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 40 }}>RT</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 40 }}>OT</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 40 }}>JH</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 30 }}>Qty</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 65 }}>Rate</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 75 }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {labourEntries.map((e, i) => {
                const { rate, cost } = labourCosts[i]
                return (
                  <tr key={i}>
                    {renderCell('labour', i, 'name', e.employeeName || e.employee_name || e.name || '', cellStyle)}
                    {renderCell('labour', i, 'classification', e.classification || '', { ...cellStyle, color: '#6b7280' }, true, labourRates, 'classification')}
                    {renderCell('labour', i, 'rt', String(e.rt || e.hours || 0), { ...cellStyle, textAlign: 'right' })}
                    {renderCell('labour', i, 'ot', String(e.ot || 0), { ...cellStyle, textAlign: 'right' })}
                    {renderCell('labour', i, 'jh', String(e.jh || 0), { ...cellStyle, textAlign: 'right' })}
                    {renderCell('labour', i, 'count', String(e.count || 1), { ...cellStyle, textAlign: 'right' })}
                    <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: rate != null ? '#166534' : '#9ca3af', fontStyle: rate != null ? 'normal' : 'italic' }}>
                      {rate != null ? fmt(rate) : 'No rate found'}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', color: rate != null ? '#166534' : '#9ca3af' }}>
                      {fmt(cost)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f0fdf4' }}>
                <td colSpan={2} style={{ ...cellStyle, fontWeight: '600' }}>Total</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {labourEntries.reduce((s, e) => s + parseFloat(e.rt || e.hours || 0) * parseInt(e.count || 1), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {labourEntries.reduce((s, e) => s + parseFloat(e.ot || 0) * parseInt(e.count || 1), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {labourEntries.reduce((s, e) => s + parseFloat(e.jh || 0) * parseInt(e.count || 1), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {labourEntries.reduce((s, e) => s + parseInt(e.count || 1), 0)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}></td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '700', color: '#166534' }}>
                  {fmt(labourTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Equipment table */}
      <div style={{ padding: '8px 12px' }}>
        <div style={{ fontWeight: '700', color: '#166534', fontSize: 12, marginBottom: 4 }}>
          EQUIPMENT ({equipmentEntries.length})
        </div>
        {equipmentEntries.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>No equipment entries</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headerStyle, textAlign: 'left' }}>Type</th>
                <th style={{ ...headerStyle, textAlign: 'left', width: 60 }}>Unit #</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 40 }}>Hrs</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 30 }}>Qty</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 65 }}>Rate</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 75 }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {equipmentEntries.map((e, i) => {
                const { rate, cost } = equipmentCosts[i]
                return (
                  <tr key={i}>
                    {renderCell('equipment', i, 'type', e.type || e.equipment_type || '', cellStyle, true, equipmentRates, equipmentRates[0]?.equipment_type ? 'equipment_type' : 'type')}
                    {renderCell('equipment', i, 'unitNumber', e.unitNumber || e.unit_number || '', cellStyle)}
                    {renderCell('equipment', i, 'hours', String(e.hours || 0), { ...cellStyle, textAlign: 'right' })}
                    {renderCell('equipment', i, 'count', String(e.count || 1), { ...cellStyle, textAlign: 'right' })}
                    <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: rate != null ? '#166534' : '#9ca3af', fontStyle: rate != null ? 'normal' : 'italic' }}>
                      {rate != null ? fmt(rate) : 'No rate found'}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', color: rate != null ? '#166534' : '#9ca3af' }}>
                      {fmt(cost)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f0fdf4' }}>
                <td colSpan={2} style={{ ...cellStyle, fontWeight: '600' }}>Total</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {equipmentEntries.reduce((s, e) => s + parseFloat(e.hours || 0) * parseInt(e.count || 1), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {equipmentEntries.reduce((s, e) => s + parseInt(e.count || 1), 0)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}></td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '700', color: '#166534' }}>
                  {fmt(equipmentTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Grand total summary */}
      <div style={{
        margin: '4px 12px 8px', padding: '10px 14px',
        backgroundColor: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: '#374151' }}>Labour Total</span>
          <span style={{ fontWeight: '600', color: '#166534' }}>{fmt(labourTotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
          <span style={{ color: '#374151' }}>Equipment Total</span>
          <span style={{ fontWeight: '600', color: '#166534' }}>{fmt(equipmentTotal)}</span>
        </div>
        <div style={{ borderTop: '2px solid #166534', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ fontWeight: '700', color: '#166534' }}>Grand Total</span>
          <span style={{ fontWeight: '700', color: '#166534' }}>{fmt(grandTotal)}</span>
        </div>
      </div>

      {/* Rate card status + source badge */}
      {labourRates.length === 0 && equipmentRates.length === 0 && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: '#dc2626', backgroundColor: '#fef2f2', borderTop: '1px solid #fecaca' }}>
          No rate cards loaded — costs cannot be calculated. Import rate cards in Admin Portal &gt; Rate Import.
        </div>
      )}
      <div style={{ padding: '8px 12px', fontSize: 11, color: '#6b7280', fontStyle: 'italic', borderTop: '1px solid #e5e7eb' }}>
        Live data from inspector report — Report ID: {report.id} — Rate cards: {labourRates.length} labour, {equipmentRates.length} equipment
      </div>
    </div>
  )
}
