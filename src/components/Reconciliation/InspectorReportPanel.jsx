import React, { useState, useCallback, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { supabase } from '../../supabase'

export default function InspectorReportPanel({ report, block, labourRates = [], equipmentRates = [], aliases = [], organizationId, onBlockChange, onAliasCreated, sameDayEntries = { labour: [], equipment: [] }, employeeRoster = [] }) {
  const [editingCell, setEditingCell] = useState(null) // { section, rowIdx, field }
  const [editValue, setEditValue] = useState('')
  const [dropdownFilter, setDropdownFilter] = useState('')
  const [showAliasPrompt, setShowAliasPrompt] = useState(null) // { originalValue, mappedValue, aliasType }
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const portalRef = useRef(null)
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

  // Close dropdown on outside click — check both the cell and the portal dropdown
  useEffect(() => {
    if (!editingCell) return
    function handleClick(e) {
      const inCell = dropdownRef.current && dropdownRef.current.contains(e.target)
      const inPortal = portalRef.current && portalRef.current.contains(e.target)
      if (!inCell && !inPortal) {
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
  // Normalize whitespace and punctuation for matching
  function norm(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim() }
  // Extract meaningful tokens (words and numbers) for fuzzy matching
  function tokens(s) { return norm(s).replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean) }

  function findLabourRate(classification) {
    if (!classification) return null
    const cl = norm(classification)
    // 1. Check learned aliases
    const alias = aliases.find(a => a.alias_type === 'labour' && norm(a.original_value) === cl)
    const lookupName = alias ? alias.mapped_value : classification
    const ln = norm(lookupName)
    // 2. Exact match (normalized whitespace)
    let found = labourRates.find(r => norm(r.classification) === ln)
    if (found) return found
    // 3. Contains match
    found = labourRates.find(r => {
      const rc = norm(r.classification)
      return rc.includes(ln) || ln.includes(rc)
    })
    if (found) return found
    // 4. Token overlap — all tokens from the lookup must appear in the rate card name
    const lookupTokens = tokens(lookupName)
    if (lookupTokens.length >= 2) {
      found = labourRates.find(r => {
        const rateTokens = tokens(r.classification)
        return lookupTokens.every(t => rateTokens.some(rt => rt.includes(t) || t.includes(rt)))
      })
    }
    return found || null
  }

  function findEquipmentRate(equipType) {
    if (!equipType) return null
    const et = norm(equipType)
    // 1. Check learned aliases
    const alias = aliases.find(a => a.alias_type === 'equipment' && norm(a.original_value) === et)
    const lookupName = alias ? alias.mapped_value : equipType
    const en = norm(lookupName)
    // 2. Exact match (normalized whitespace)
    let found = equipmentRates.find(r => norm(r.equipment_type || r.type) === en)
    if (found) return found
    // 3. Contains match
    found = equipmentRates.find(r => {
      const rc = norm(r.equipment_type || r.type)
      return rc.includes(en) || en.includes(rc)
    })
    if (found) return found
    // 4. Token overlap
    const lookupTokens = tokens(lookupName)
    if (lookupTokens.length >= 2) {
      found = equipmentRates.find(r => {
        const rateTokens = tokens(r.equipment_type || r.type)
        return lookupTokens.every(t => rateTokens.some(rt => rt.includes(t) || t.includes(rt)))
      })
    }
    return found || null
  }

  function calcLabourCost(entry) {
    const rate = findLabourRate(entry.classification)
    if (!rate) return { rtRate: null, otRate: null, dtRate: null, rateType: null, subs: 0, cost: 0 }
    const rtHrs = parseFloat(entry.rt || entry.hours || 0)
    const otHrs = parseFloat(entry.ot || 0)
    const dtHrs = parseFloat(entry.dt || 0)
    const rateType = rate.rate_type || (parseFloat(rate.rate_st || 0) >= 100 ? 'weekly' : 'hourly')
    const subs = parseFloat(rate.rate_subs || 0)

    if (rateType === 'weekly') {
      // rate_st is the daily rate for salaried/indirect workers — use as-is
      const dailyRate = parseFloat(rate.rate_st || 0)
      const otRate = parseFloat(rate.rate_ot || 0)
      const dtRate = parseFloat(rate.rate_dt || 0)
      const cost = dailyRate + (otHrs * otRate) + (dtHrs * dtRate) + subs
      return { rtRate: dailyRate, otRate, dtRate, rateType: 'daily', subs, cost }
    } else {
      const stRate = parseFloat(rate.rate_st || 0)
      const otRate = parseFloat(rate.rate_ot || stRate * 1.5)
      const dtRate = parseFloat(rate.rate_dt || stRate * 2)
      const cost = (rtHrs * stRate) + (otHrs * otRate) + (dtHrs * dtRate) + subs
      return { rtRate: stRate, otRate, dtRate, rateType: 'hourly', subs, cost }
    }
  }

  function calcEquipmentCost(entry) {
    const rate = findEquipmentRate(entry.type || entry.equipment_type)
    if (!rate) return { rate: null, cost: 0 }
    const qty = parseInt(entry.count || 1)
    // Equipment is a daily all-in rate — cost = daily rate per day, not multiplied by hours
    const dailyRate = parseFloat(rate.rate_daily || rate.rate_hourly || 0)
    const cost = dailyRate * qty
    return { rate: dailyRate, rateType: 'daily', cost }
  }

  // --- Duplicate detection ---
  function getLabourDuplicateWarning(entry, rowIdx) {
    const name = (entry.employeeName || entry.employee_name || entry.name || '').toLowerCase().trim()
    if (!name) return null
    const warnings = []

    // Same ticket: check if this name appears elsewhere in this ticket's entries
    labourEntries.forEach((other, otherIdx) => {
      if (otherIdx === rowIdx) return
      const otherName = (other.employeeName || other.employee_name || other.name || '').toLowerCase().trim()
      if (otherName === name) warnings.push('Duplicate on this ticket')
    })

    // Cross-ticket same day
    for (const other of sameDayEntries.labour) {
      if (other.name === name) {
        warnings.push(`Also on ticket #${other.ticket}`)
        break
      }
    }

    return warnings.length > 0 ? warnings.join(' | ') : null
  }

  function getEquipmentDuplicateWarning(entry, rowIdx) {
    const type = (entry.type || entry.equipment_type || '').toLowerCase().trim()
    const unit = (entry.unitNumber || entry.unit_number || '').toLowerCase().trim()
    if (!type) return null
    const warnings = []

    // Same ticket: check for same type AND unit number (or just type if no unit)
    equipmentEntries.forEach((other, otherIdx) => {
      if (otherIdx === rowIdx) return
      const otherType = (other.type || other.equipment_type || '').toLowerCase().trim()
      const otherUnit = (other.unitNumber || other.unit_number || '').toLowerCase().trim()
      if (otherType === type && (!unit || !otherUnit || otherUnit === unit)) {
        warnings.push('Duplicate on this ticket')
      }
    })

    // Cross-ticket same day
    for (const other of sameDayEntries.equipment) {
      if (other.type === type && (!unit || !other.unit || other.unit === unit)) {
        warnings.push(`Also on ticket #${other.ticket}`)
        break
      }
    }

    return warnings.length > 0 ? warnings.join(' | ') : null
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
      dt: 'dt',
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

  function removeRow(section, rowIdx) {
    if (!onBlockChange) return
    const entries = section === 'labour' ? [...labourEntries] : [...equipmentEntries]
    const removed = entries[rowIdx]
    const removedName = section === 'labour'
      ? (removed.employeeName || removed.employee_name || removed.name || 'unknown')
      : (removed.type || removed.equipment_type || 'unknown')
    if (!confirm(`Remove "${removedName}" from this ticket?`)) return
    entries.splice(rowIdx, 1)
    const updatedBlock = { ...block }
    if (section === 'labour') updatedBlock.labourEntries = entries
    else updatedBlock.equipmentEntries = entries
    onBlockChange(updatedBlock, [{ field: `${section}[${rowIdx}]`, oldValue: removedName, newValue: 'REMOVED' }])
  }

  function moveRow(section, fromIdx, toIdx) {
    if (!onBlockChange) return
    const entries = section === 'labour' ? [...labourEntries] : [...equipmentEntries]
    if (toIdx < 0 || toIdx >= entries.length) return
    const [moved] = entries.splice(fromIdx, 1)
    entries.splice(toIdx, 0, moved)
    const updatedBlock = { ...block }
    if (section === 'labour') updatedBlock.labourEntries = entries
    else updatedBlock.equipmentEntries = entries
    onBlockChange(updatedBlock, [{ field: `${section}[${fromIdx}→${toIdx}]`, oldValue: `position ${fromIdx}`, newValue: `position ${toIdx}` }])
  }

  function addLabourEntry() {
    if (!onBlockChange) return
    const newEntry = { employeeName: '', classification: '', rt: '0', ot: '0', dt: '0', count: '1' }
    const updatedBlock = { ...block, labourEntries: [...labourEntries, newEntry] }
    onBlockChange(updatedBlock, [{ field: 'labour[new]', oldValue: '', newValue: 'Added new employee row' }])
    // Start editing the name field of the new row
    setTimeout(() => startEdit('labour', labourEntries.length, 'name', ''), 50)
  }

  function addEquipmentEntry() {
    if (!onBlockChange) return
    const newEntry = { type: '', unitNumber: '', hours: '0', count: '1' }
    const updatedBlock = { ...block, equipmentEntries: [...equipmentEntries, newEntry] }
    onBlockChange(updatedBlock, [{ field: 'equipment[new]', oldValue: '', newValue: 'Added new equipment row' }])
    setTimeout(() => startEdit('equipment', equipmentEntries.length, 'type', '', true), 50)
  }

  function handleEmployeeSelect(rowIdx, selectedName) {
    // Find the employee in the roster to get their classification
    const rosterEntry = employeeRoster.find(r => r.employeeName === selectedName)
    if (!rosterEntry || !onBlockChange) {
      commitEdit(selectedName)
      return
    }

    // Save name and auto-fill classification in one update
    const entries = [...labourEntries]
    const entry = { ...entries[rowIdx] }
    const oldName = entry.employeeName || entry.employee_name || entry.name || ''
    const oldClassification = entry.classification || ''
    entry.employeeName = selectedName
    entry.classification = rosterEntry.classification
    entries[rowIdx] = entry

    const updatedBlock = { ...block, labourEntries: entries }
    const auditEntries = [
      { field: `labour[${rowIdx}].name`, oldValue: oldName, newValue: selectedName },
    ]
    if (oldClassification !== rosterEntry.classification) {
      auditEntries.push({ field: `labour[${rowIdx}].classification`, oldValue: oldClassification, newValue: rosterEntry.classification })
    }
    onBlockChange(updatedBlock, auditEntries)
    setEditingCell(null)
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
  function renderCell(section, rowIdx, field, value, style, isDropdown, dropdownItems, dropdownKey, onSelectItem) {
    const isEditing = editingCell?.section === section && editingCell?.rowIdx === rowIdx && editingCell?.field === field

    if (isEditing && isDropdown) {
      const filterText = editValue.toLowerCase().trim()
      let filtered = filterText.length === 0
        ? (dropdownItems || [])
        : (dropdownItems || []).filter(item => {
            const name = (item[dropdownKey] || '').toLowerCase()
            return name.includes(filterText)
          })
      // Also search aliases — if typing "straw", find alias matches and add their mapped rate card entries
      if (filterText.length > 0 && aliases.length > 0) {
        const aliasType = (field === 'classification' || field === 'name') ? 'labour' : 'equipment'
        const matchedAliases = aliases.filter(a => a.alias_type === aliasType && a.original_value.toLowerCase().includes(filterText))
        for (const alias of matchedAliases) {
          const mappedLC = alias.mapped_value.toLowerCase().trim()
          const alreadyInList = filtered.some(item => (item[dropdownKey] || '').toLowerCase().trim() === mappedLC)
          if (!alreadyInList) {
            const rateEntry = (dropdownItems || []).find(item => norm(item[dropdownKey]) === norm(alias.mapped_value))
            if (rateEntry) {
              filtered = [rateEntry, ...filtered]
            }
          }
        }
      }
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
            <div ref={portalRef} style={{
              position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: Math.max(dropdownPos.width, 280),
              zIndex: 10000, maxHeight: 300, overflowY: 'auto', backgroundColor: 'white',
              border: '1px solid #d1d5db', borderRadius: '0 0 4px 4px', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            }}>
              {filtered.slice(0, 80).map((item, i) => (
                <div
                  key={i}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onSelectItem ? onSelectItem(rowIdx, item[dropdownKey]) : handleClassificationSelect(section, rowIdx, item[dropdownKey])}
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
                {onBlockChange && <th style={{ ...headerStyle, width: 28 }}></th>}
                <th style={{ ...headerStyle, textAlign: 'left' }}>Name</th>
                <th style={{ ...headerStyle, textAlign: 'left' }}>Classification</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 35 }}>RT Hrs</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 55 }}>RT Rate</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 35 }}>OT Hrs</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 55 }}>OT Rate</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 35 }}>DT Hrs</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 55 }}>DT Rate</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 55 }}>Subs</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 75 }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {labourEntries.map((e, i) => {
                const lc = labourCosts[i]
                const dupeWarning = getLabourDuplicateWarning(e, i)
                return (
                  <React.Fragment key={i}>
                    <tr>
                      {onBlockChange && (
                        <td style={{ ...cellStyle, padding: '2px', textAlign: 'center', width: 38 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <button onClick={() => moveRow('labour', i, i - 1)} disabled={i === 0}
                                style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', fontSize: 10, color: i === 0 ? '#d1d5db' : '#6b7280', padding: 0, lineHeight: 1 }}>&#9650;</button>
                              <button onClick={() => moveRow('labour', i, i + 1)} disabled={i === labourEntries.length - 1}
                                style={{ border: 'none', background: 'none', cursor: i === labourEntries.length - 1 ? 'default' : 'pointer', fontSize: 10, color: i === labourEntries.length - 1 ? '#d1d5db' : '#6b7280', padding: 0, lineHeight: 1 }}>&#9660;</button>
                            </div>
                            <button onClick={() => removeRow('labour', i)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#dc2626', padding: 0, lineHeight: 1, fontWeight: 'bold' }} title="Remove row">&#10005;</button>
                          </div>
                        </td>
                      )}
                      {renderCell('labour', i, 'name', e.employeeName || e.employee_name || e.name || '', cellStyle, true, employeeRoster, 'employeeName', handleEmployeeSelect)}
                      {renderCell('labour', i, 'classification', e.classification || '', { ...cellStyle, color: '#6b7280' }, true, labourRates, 'classification')}
                      {renderCell('labour', i, 'rt', String(e.rt || e.hours || 0), { ...cellStyle, textAlign: 'right' })}
                      <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: lc.rtRate != null ? '#166534' : '#9ca3af' }}>
                        {lc.rtRate != null ? `${fmt(lc.rtRate)}${lc.rateType === 'weekly' ? '/day' : ''}` : '—'}
                      </td>
                      {renderCell('labour', i, 'ot', String(e.ot || 0), { ...cellStyle, textAlign: 'right' })}
                      <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: lc.otRate ? '#166534' : '#9ca3af' }}>
                        {lc.otRate ? fmt(lc.otRate) : '—'}
                      </td>
                      {renderCell('labour', i, 'dt', String(e.dt || 0), { ...cellStyle, textAlign: 'right' })}
                      <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: lc.dtRate ? '#166534' : '#9ca3af' }}>
                        {lc.dtRate ? fmt(lc.dtRate) : '—'}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: '#166534' }}>
                        {lc.subs ? fmt(lc.subs) : '—'}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', color: lc.rtRate != null ? '#166534' : '#9ca3af' }}>
                        {fmt(lc.cost)}
                      </td>
                    </tr>
                    {dupeWarning && (
                      <tr>
                        <td colSpan={onBlockChange ? 11 : 10} style={{ padding: '2px 6px', fontSize: 11, color: '#dc2626', backgroundColor: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                          &#9888; {dupeWarning}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f0fdf4' }}>
                <td colSpan={onBlockChange ? 3 : 2} style={{ ...cellStyle, fontWeight: '600' }}>Total</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {labourEntries.reduce((s, e) => s + parseFloat(e.rt || e.hours || 0), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle }}></td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {labourEntries.reduce((s, e) => s + parseFloat(e.ot || 0), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle }}></td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {labourEntries.reduce((s, e) => s + parseFloat(e.dt || 0), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle }}></td>
                <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: '#166534' }}>
                  {fmt(labourCosts.reduce((s, c) => s + (c.subs || 0), 0))}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '700', color: '#166534' }}>
                  {fmt(labourTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
        {onBlockChange && (
          <button
            onClick={addLabourEntry}
            style={{ marginTop: 6, padding: '4px 12px', fontSize: 11, backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: '600' }}
          >
            + Add Employee
          </button>
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
                {onBlockChange && <th style={{ ...headerStyle, width: 28 }}></th>}
                <th style={{ ...headerStyle, textAlign: 'left' }}>Type</th>
                <th style={{ ...headerStyle, textAlign: 'left', width: 60 }}>Unit #</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 40 }}>Hrs</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 65 }}>Rate</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 75 }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {equipmentEntries.map((e, i) => {
                const { rate, cost } = equipmentCosts[i]
                const dupeWarning = getEquipmentDuplicateWarning(e, i)
                return (
                  <React.Fragment key={i}>
                    <tr>
                      {onBlockChange && (
                        <td style={{ ...cellStyle, padding: '2px', textAlign: 'center', width: 38 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <button onClick={() => moveRow('equipment', i, i - 1)} disabled={i === 0}
                                style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', fontSize: 10, color: i === 0 ? '#d1d5db' : '#6b7280', padding: 0, lineHeight: 1 }}>&#9650;</button>
                              <button onClick={() => moveRow('equipment', i, i + 1)} disabled={i === equipmentEntries.length - 1}
                                style={{ border: 'none', background: 'none', cursor: i === equipmentEntries.length - 1 ? 'default' : 'pointer', fontSize: 10, color: i === equipmentEntries.length - 1 ? '#d1d5db' : '#6b7280', padding: 0, lineHeight: 1 }}>&#9660;</button>
                            </div>
                            <button onClick={() => removeRow('equipment', i)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#dc2626', padding: 0, lineHeight: 1, fontWeight: 'bold' }} title="Remove row">&#10005;</button>
                          </div>
                        </td>
                      )}
                      {renderCell('equipment', i, 'type', e.type || e.equipment_type || '', cellStyle, true, equipmentRates, equipmentRates[0]?.equipment_type ? 'equipment_type' : 'type')}
                      {renderCell('equipment', i, 'unitNumber', e.unitNumber || e.unit_number || '', cellStyle)}
                      {renderCell('equipment', i, 'hours', String(e.hours || 0), { ...cellStyle, textAlign: 'right' })}
                      <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: rate != null ? '#166534' : '#9ca3af', fontStyle: rate != null ? 'normal' : 'italic' }}>
                        {rate != null ? `${fmt(rate)}/day` : 'No rate found'}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', color: rate != null ? '#166534' : '#9ca3af' }}>
                        {fmt(cost)}
                      </td>
                    </tr>
                    {dupeWarning && (
                      <tr>
                        <td colSpan={onBlockChange ? 6 : 5} style={{ padding: '2px 6px', fontSize: 11, color: '#dc2626', backgroundColor: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                          &#9888; {dupeWarning}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f0fdf4' }}>
                <td colSpan={onBlockChange ? 3 : 2} style={{ ...cellStyle, fontWeight: '600' }}>Total</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {equipmentEntries.reduce((s, e) => s + parseFloat(e.hours || 0) * parseInt(e.count || 1), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}></td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '700', color: '#166534' }}>
                  {fmt(equipmentTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
        {onBlockChange && (
          <button
            onClick={addEquipmentEntry}
            style={{ marginTop: 6, padding: '4px 12px', fontSize: 11, backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: '600' }}
          >
            + Add Equipment
          </button>
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
