import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { supabase } from '../../supabase'
import { useAuth } from '../../AuthContext.jsx'
import ResolveRowModal from './ResolveRowModal.jsx'
import AdminOverridePopover from './AdminOverridePopover.jsx'
import { levenshtein } from '../../utils/nameMatchingUtils.js'

export default function InspectorReportPanel({ report, block, labourRates = [], equipmentRates = [], aliases = [], organizationId, onBlockChange, onAliasCreated, sameDayEntries = { labour: [], equipment: [] }, employeeRoster = [], equipmentRoster = [], lemData = null, reportDate = null, hasLemPdf = false, lemPdfUrls = [], onLemExtracted }) {
  const [editingCell, setEditingCell] = useState(null) // { section, rowIdx, field }
  const [editValue, setEditValue] = useState('')
  const [dropdownFilter, setDropdownFilter] = useState('')
  const [showAliasPrompt, setShowAliasPrompt] = useState(null) // { originalValue, mappedValue, aliasType }
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const portalRef = useRef(null)
  const skipBlurRef = useRef(false)
  const [dropdownPos, setDropdownPos] = useState(null)
  const { userProfile } = useAuth()
  const currentUserRole = userProfile?.role || ''
  const [projectId, setProjectId] = useState(null)

  // Load project ID for this org
  useEffect(() => {
    if (!organizationId) return
    supabase.from('projects').select('id').limit(1).then(({ data }) => {
      if (data?.[0]) setProjectId(data[0].id)
    })
  }, [organizationId])

  const [masterModal, setMasterModal] = useState({ open: false, type: 'labour', prefill: '', rowIdx: null, section: null })
  const [toast, setToast] = useState(null)
  const [dupeResolve, setDupeResolve] = useState(null) // { section, rowIdx, masterId, masterName, existingRowIdx, existingEntry, pendingAction }
  const [dragState, setDragState] = useState({ section: null, fromIdx: null, overIdx: null })
  const [overridePopover, setOverridePopover] = useState(null) // { section, rowIdx, field, fieldLabel, currentValue, inputType, anchorRect }
  const [lemExtracting, setLemExtracting] = useState(false)
  const isAdminRole = ['admin', 'super_admin'].includes(currentUserRole)

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
    if (cl.includes('straw') || cl.includes('filter')) {
      console.log(`[RATE DEBUG] classification="${classification}" norm="${cl}" alias=${alias ? `"${alias.mapped_value}"` : 'none'} lookupName="${lookupName}" ln="${ln}" aliasCount=${aliases.length} rateCount=${labourRates.length}`)
    }
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
    // 3. Contains match — full lookup name in rate card OR full rate card name in lookup
    found = equipmentRates.find(r => {
      const rc = norm(r.equipment_type || r.type)
      return rc.includes(en) || en.includes(rc)
    })
    if (found) return found
    // 4. Token overlap — ALL lookup tokens must match AND at least 50% of rate card tokens must be covered
    const lookupTokens = tokens(lookupName)
    if (lookupTokens.length >= 2) {
      found = equipmentRates.find(r => {
        const rateTokens = tokens(r.equipment_type || r.type)
        const matchedLookup = lookupTokens.filter(t => rateTokens.some(rt => rt.includes(t) || t.includes(rt)))
        const matchedRate = rateTokens.filter(rt => lookupTokens.some(t => rt.includes(t) || t.includes(rt)))
        return matchedLookup.length === lookupTokens.length && matchedRate.length >= Math.ceil(rateTokens.length * 0.5)
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
    // Per-person subs override from personnel_roster takes priority over classification rate
    const rosterEntry = entry.master_personnel_id
      ? employeeRoster.find(r => r.masterId === entry.master_personnel_id)
      : null
    const subs = rosterEntry?.rateSubsOverride != null
      ? parseFloat(rosterEntry.rateSubsOverride)
      : parseFloat(rate.rate_subs || 0)

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
    const hours = parseFloat(entry.hours || 0)
    if (hours <= 0) return { rate: null, cost: 0 }
    const rate = findEquipmentRate(entry.type || entry.equipment_type)
    if (!rate) return { rate: null, cost: 0 }
    const rateType = rate.rate_type || 'daily'
    if (rateType === 'hourly') {
      const hourlyRate = parseFloat(rate.rate_hourly || 0)
      return { rate: hourlyRate, rateType: 'hourly', cost: hourlyRate * hours }
    }
    // Daily all-in rate — cost = daily rate per day
    const dailyRate = parseFloat(rate.rate_daily || rate.rate_hourly || 0)
    return { rate: dailyRate, rateType: 'daily', cost: dailyRate }
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
    if (!type && !unit) return null
    const warnings = []

    // Same ticket: check by unit number (primary) or type+unit combo
    equipmentEntries.forEach((other, otherIdx) => {
      if (otherIdx === rowIdx) return
      const otherUnit = (other.unitNumber || other.unit_number || '').toLowerCase().trim()
      // Unit number match is the strongest signal for duplicate equipment
      if (unit && otherUnit && otherUnit === unit) {
        warnings.push('Duplicate unit on this ticket')
      }
    })

    // Cross-ticket same day — by unit number
    if (unit) {
      for (const other of sameDayEntries.equipment) {
        if (other.unit && other.unit === unit) {
          warnings.push(`Also on ticket #${other.ticket}`)
          break
        }
      }
    }

    return warnings.length > 0 ? warnings.join(' | ') : null
  }

  // --- Totals (unmatched rows contribute $0) ---
  const labourCosts = labourEntries.map(e => {
    if (e.needs_master_resolution) return { rtRate: null, otRate: null, dtRate: null, rateType: null, subs: 0, cost: 0 }
    return calcLabourCost(e)
  })
  const equipmentCosts = equipmentEntries.map(e => {
    if (e.needs_master_resolution) return { rate: null, cost: 0 }
    return calcEquipmentCost(e)
  })
  const labourTotal = labourCosts.reduce((s, c) => s + c.cost, 0)
  const equipmentTotal = equipmentCosts.reduce((s, c) => s + c.cost, 0)
  const grandTotal = labourTotal + equipmentTotal

  // --- Master resolution counts ---
  const unresolvedLabour = labourEntries.filter(e => e.needs_master_resolution && !e.flagged_for_review).length
  const unresolvedEquip = equipmentEntries.filter(e => e.needs_master_resolution && !e.flagged_for_review).length
  const flaggedLabour = labourEntries.filter(e => e.flagged_for_review).length
  const flaggedEquip = equipmentEntries.filter(e => e.flagged_for_review).length
  const totalFlagged = flaggedLabour + flaggedEquip
  const hasUnresolved = unresolvedLabour > 0 || unresolvedEquip > 0 || totalFlagged > 0

  // Normalize name for variance comparison: lowercase, trim, collapse whitespace, strip suffixes like (PB)/(EP)/(TI)
  function normV(s) {
    return (s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/\s*\([^)]*\)\s*$/, '')
  }

  // Generate inline reason text for red variance rows
  function varianceReasonText(v) {
    if (!v || !v.isRed) return null
    if (v.category === 'missing_on_lem') return '\u26A0 Not on LEM'
    if (v.category === 'ghost_on_lem') return '\u26A0 On LEM, not on report'
    const lemRT = v.lemSplit?.rt_hours || 0, lemOT = v.lemSplit?.ot_hours || 0, lemDT = v.lemSplit?.dt_hours || 0
    const iRT = v.inspectorSplit?.rt_hours || 0, iOT = v.inspectorSplit?.ot_hours || 0, iDT = v.inspectorSplit?.dt_hours || 0
    const lemTotal = lemRT + lemOT + lemDT
    const inspTotal = iRT + iOT + iDT
    if (v.category === 'hours_mismatch') return `\u26A0 LEM: ${lemTotal} hrs, inspector: ${inspTotal} hrs`
    if (v.category === 'split_mismatch') return `\u26A0 LEM: ${lemRT} RT ${lemOT} OT${lemDT ? ` ${lemDT} DT` : ''}, inspector: ${iRT} RT ${iOT} OT${iDT ? ` ${iDT} DT` : ''}`
    return '\u26A0 Variance detected'
  }

  // --- Per-row variance: inspector vs LEM comparison ---
  const labourVarianceMap = useMemo(() => {
    if (!lemData) return {}

    const lemLabour = lemData.labour_entries || []
    const map = {}

    for (let i = 0; i < labourEntries.length; i++) {
      const entry = labourEntries[i]
      const inspName = normV(entry.employeeName || entry.employee_name || entry.name || '')
      if (!inspName) continue

      // Find matching LEM row by normalized name, then fuzzy fallback
      let lemMatch = lemLabour.find(l => normV(l.employee_name || l.name || '') === inspName)

      if (!lemMatch) {
        lemMatch = lemLabour.find(l => {
          const lemName = normV(l.employee_name || l.name || '')
          if (!lemName) return false
          const maxLen = Math.max(lemName.length, inspName.length)
          if (maxLen === 0) return false
          return (1 - levenshtein(lemName, inspName) / maxLen) >= 0.8
        })
      }

      const inspSplit = {
        rt_hours: parseFloat(entry.rt || 0),
        ot_hours: parseFloat(entry.ot || 0),
        dt_hours: parseFloat(entry.dt || 0),
      }
      const inspTotal = inspSplit.rt_hours + inspSplit.ot_hours + inspSplit.dt_hours

      if (!lemMatch) {
        map[i] = { category: 'missing_on_lem', isRed: true, lemSplit: null, inspectorSplit: inspSplit }
        continue
      }

      const lemSplit = {
        rt_hours: parseFloat(lemMatch.rt_hours || lemMatch.rt || 0),
        ot_hours: parseFloat(lemMatch.ot_hours || lemMatch.ot || 0),
        dt_hours: parseFloat(lemMatch.dt_hours || lemMatch.dt || 0),
      }
      const lemTotal = lemSplit.rt_hours + lemSplit.ot_hours + lemSplit.dt_hours

      // Compare inspector vs LEM
      let category = 'reconciled'
      if (Math.abs(lemTotal - inspTotal) > 0.01) {
        category = 'hours_mismatch'
      } else if (
        Math.abs(lemSplit.rt_hours - inspSplit.rt_hours) > 0.01 ||
        Math.abs(lemSplit.ot_hours - inspSplit.ot_hours) > 0.01 ||
        Math.abs(lemSplit.dt_hours - inspSplit.dt_hours) > 0.01
      ) {
        category = 'split_mismatch'
      }

      map[i] = {
        category,
        isRed: category !== 'reconciled',
        lemSplit,
        inspectorSplit: inspSplit,
        lemName: lemMatch.employee_name || lemMatch.name || '',
      }
    }

    return map
  }, [labourEntries, lemData])

  // Ghost rows — on LEM but not on inspector report
  const ghostLabourRows = useMemo(() => {
    if (!lemData) return []
    const lemLabour = lemData.labour_entries || []
    const inspNames = new Set(labourEntries.map(e =>
      normV(e.employeeName || e.employee_name || e.name || '')
    ).filter(Boolean))

    return lemLabour.filter(l => {
      const lemName = normV(l.employee_name || l.name || '')
      if (!lemName) return false
      // Check if any inspector name is close enough (case-insensitive)
      for (const inspName of inspNames) {
        if (inspName === lemName) return false
        const maxLen = Math.max(lemName.length, inspName.length)
        if (maxLen > 0 && (1 - levenshtein(lemName, inspName) / maxLen) >= 0.8) return false
      }
      return true
    })
  }, [lemData, labourEntries])

  const redVarianceCount = Object.values(labourVarianceMap).filter(v => v.isRed).length

  // --- Add to Master modal handlers ---
  function openMasterModal(section, rowIdx, prefillValue) {
    setMasterModal({ open: true, type: section === 'labour' ? 'labour' : 'equipment', prefill: prefillValue, rowIdx, section })
  }

  function handleMasterAdded(result) {
    if (!onBlockChange || masterModal.rowIdx === null) return
    const { section, rowIdx } = masterModal

    // Handle flagged resolution
    if (result.type === 'flagged') {
      const entries = section === 'labour' ? [...labourEntries] : [...equipmentEntries]
      const entry = { ...entries[rowIdx] }
      entry.flagged_for_review = true
      entry.flagged_by = result.flaggedBy || null
      entry.flagged_at = new Date().toISOString()
      entry.flagged_reason = result.reason || null
      entries[rowIdx] = entry
      const updatedBlock = { ...block }
      if (section === 'labour') updatedBlock.labourEntries = entries
      else updatedBlock.equipmentEntries = entries
      onBlockChange(updatedBlock, [{ field: `${section}[${rowIdx}].flagged_for_review`, oldValue: 'false', newValue: 'true' }])
      setToast('🔖 Flagged for review')
      setTimeout(() => setToast(null), 4000)
      return
    }

    // Normalize field names — ResolveRowModal sends snake_case, old AddToMasterModal sent camelCase
    const masterId = result.master_id || result.masterId
    const masterName = result.master_name || result.name
    const masterClassification = result.master_classification || result.classification

    const doCommit = () => {
      const entries = section === 'labour' ? [...labourEntries] : [...equipmentEntries]
      const entry = { ...entries[rowIdx] }

      if (section === 'labour') {
        entry.employeeName = masterName
        entry.classification = masterClassification
        entry.master_personnel_id = masterId
        entry.needs_master_resolution = false
        entry.flagged_for_review = false
      } else {
        entry.unitNumber = result.unitNumber || masterName
        entry.type = masterClassification
        entry.classification = masterClassification
        entry.master_equipment_id = masterId
        entry.needs_master_resolution = false
        entry.flagged_for_review = false
      }
      entries[rowIdx] = entry

      const updatedBlock = { ...block }
      if (section === 'labour') updatedBlock.labourEntries = entries
      else updatedBlock.equipmentEntries = entries

      onBlockChange(updatedBlock, [{
        field: `${section}[${rowIdx}].master_${section === 'labour' ? 'personnel' : 'equipment'}_id`,
        oldValue: 'null',
        newValue: masterId,
      }])

      if (onAliasCreated) {
        onAliasCreated({ alias_type: section === 'labour' ? 'labour' : 'equipment', original_value: masterName, mapped_value: masterClassification })
      }

      setToast(`✓ Resolved to ${masterName}`)
      setTimeout(() => setToast(null), 4000)
    }

    // Check for duplicate master ID on this ticket
    if (masterId && checkForDuplicateMaster(section, rowIdx, masterId, masterName, doCommit)) {
      return
    }
    doCommit()
  }

  // --- Pre-resolution duplicate detection ---
  // Check if resolving a row to a given master ID would create a duplicate on this ticket
  function checkForDuplicateMaster(section, rowIdx, masterId, masterName, pendingAction) {
    const entries = section === 'labour' ? labourEntries : equipmentEntries
    const idField = section === 'labour' ? 'master_personnel_id' : 'master_equipment_id'
    for (let i = 0; i < entries.length; i++) {
      if (i === rowIdx) continue
      if (entries[i][idField] === masterId) {
        // Duplicate found — show resolution modal
        setDupeResolve({ section, rowIdx, masterId, masterName, existingRowIdx: i, existingEntry: entries[i], pendingAction })
        return true
      }
    }
    return false
  }

  function handleDupeMerge() {
    if (!dupeResolve || !onBlockChange) return
    const { section, rowIdx, existingRowIdx, masterId, masterName } = dupeResolve
    const entries = section === 'labour' ? [...labourEntries] : [...equipmentEntries]
    const sourceRow = entries[rowIdx]
    const targetRow = { ...entries[existingRowIdx] }

    if (section === 'labour') {
      // Sum hours onto existing row
      targetRow.rt = (parseFloat(targetRow.rt || 0) + parseFloat(sourceRow.rt || sourceRow.hours || 0)).toString()
      targetRow.ot = (parseFloat(targetRow.ot || 0) + parseFloat(sourceRow.ot || 0)).toString()
      targetRow.dt = (parseFloat(targetRow.dt || 0) + parseFloat(sourceRow.dt || 0)).toString()
      // Subs: keep the higher value (paid once per person per day)
      const targetSubs = parseFloat(targetRow.subs || 0)
      const sourceSubs = parseFloat(sourceRow.subs || 0)
      if (sourceSubs > targetSubs) targetRow.subs = sourceSubs
    } else {
      // Equipment: sum hours
      targetRow.hours = (parseFloat(targetRow.hours || 0) + parseFloat(sourceRow.hours || 0)).toString()
    }

    entries[existingRowIdx] = targetRow
    // Remove the source row
    entries.splice(rowIdx, 1)

    const updatedBlock = { ...block }
    if (section === 'labour') updatedBlock.labourEntries = entries
    else updatedBlock.equipmentEntries = entries

    onBlockChange(updatedBlock, [{
      field: `${section}[${rowIdx}]`,
      oldValue: `merged into row ${existingRowIdx}`,
      newValue: `duplicate_merged: ${masterName}`,
    }])

    setDupeResolve(null)
    setToast(`✓ Merged hours into existing ${masterName} row`)
    setTimeout(() => setToast(null), 4000)
  }

  function handleDupeKeepSeparate() {
    if (!dupeResolve) return
    const { pendingAction } = dupeResolve
    setDupeResolve(null)
    // Execute the original action that was pending
    if (pendingAction) pendingAction()
  }

  function handleDupeCancel() {
    setDupeResolve(null)
  }

  // --- Admin override handlers ---
  async function handleOverrideSave({ value, reason }) {
    if (!overridePopover || !onBlockChange) return
    const { section, rowIdx, field } = overridePopover
    const entries = section === 'labour' ? [...labourEntries] : [...equipmentEntries]
    const entry = { ...entries[rowIdx] }
    const oldValue = entry[field]
    entry[field] = value
    entry[`${field}_override`] = { by: currentUserRole, at: new Date().toISOString(), reason, oldValue }
    entries[rowIdx] = entry
    const updatedBlock = { ...block }
    if (section === 'labour') updatedBlock.labourEntries = entries
    else updatedBlock.equipmentEntries = entries
    onBlockChange(updatedBlock, [{ field: `${section}[${rowIdx}].${field}`, oldValue: String(oldValue), newValue: String(value) }])
    setToast(`✓ Override applied: ${overridePopover.fieldLabel}`)
    setTimeout(() => setToast(null), 3000)
    setOverridePopover(null)
  }

  function handleOverrideRemove() {
    if (!overridePopover || !onBlockChange) return
    const { section, rowIdx, field } = overridePopover
    const entries = section === 'labour' ? [...labourEntries] : [...equipmentEntries]
    const entry = { ...entries[rowIdx] }
    const overrideInfo = entry[`${field}_override`]
    if (overrideInfo?.oldValue !== undefined) entry[field] = overrideInfo.oldValue
    delete entry[`${field}_override`]
    entries[rowIdx] = entry
    const updatedBlock = { ...block }
    if (section === 'labour') updatedBlock.labourEntries = entries
    else updatedBlock.equipmentEntries = entries
    onBlockChange(updatedBlock, [{ field: `${section}[${rowIdx}].${field}`, oldValue: 'override', newValue: 'reverted' }])
    setToast('Override removed')
    setTimeout(() => setToast(null), 3000)
    setOverridePopover(null)
  }

  // Pencil icon for admin override — renders inline next to a cell value
  function PencilIcon({ section, rowIdx, field, fieldLabel, currentValue, inputType = 'text' }) {
    if (!isAdminRole || !onBlockChange) return null
    const entry = (section === 'labour' ? labourEntries : equipmentEntries)[rowIdx]
    const hasOverride = !!entry?.[`${field}_override`]
    return (
      <span
        onClick={(e) => {
          e.stopPropagation()
          const rect = e.currentTarget.getBoundingClientRect()
          setOverridePopover({ section, rowIdx, field, fieldLabel, currentValue, inputType, anchorRect: rect })
        }}
        style={{ cursor: 'pointer', fontSize: 10, color: hasOverride ? '#2563eb' : '#d1d5db', marginLeft: 3, position: 'relative', display: 'inline-block' }}
        title={hasOverride ? `Overridden: ${entry[`${field}_override`]?.reason || ''}` : `Override ${fieldLabel}`}
      >
        &#9998;
        {hasOverride && <span style={{ position: 'absolute', top: -2, right: -4, width: 5, height: 5, borderRadius: '50%', backgroundColor: '#2563eb' }} />}
      </span>
    )
  }

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

  // --- Drag-and-drop row reordering ---
  function handleDragStart(section, idx, e) {
    setDragState({ section, fromIdx: idx, overIdx: null })
    e.dataTransfer.effectAllowed = 'move'
    // Make the drag image slightly transparent
    if (e.target) e.target.style.opacity = '0.5'
  }
  function handleDragEnd(e) {
    if (e.target) e.target.style.opacity = '1'
    if (dragState.section && dragState.fromIdx !== null && dragState.overIdx !== null && dragState.fromIdx !== dragState.overIdx) {
      moveRow(dragState.section, dragState.fromIdx, dragState.overIdx)
    }
    setDragState({ section: null, fromIdx: null, overIdx: null })
  }
  function handleDragOver(section, idx, e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragState.section === section && dragState.overIdx !== idx) {
      setDragState(prev => ({ ...prev, overIdx: idx }))
    }
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
    const rosterEntry = employeeRoster.find(r => r.employeeName === selectedName)
    if (!rosterEntry || !onBlockChange) {
      commitEdit(selectedName)
      return
    }

    const masterId = rosterEntry.masterId
    const doCommit = () => {
      const entries = [...labourEntries]
      const entry = { ...entries[rowIdx] }
      const oldName = entry.employeeName || entry.employee_name || entry.name || ''
      const oldClassification = entry.classification || ''
      entry.employeeName = selectedName
      entry.classification = rosterEntry.classification
      entry.master_personnel_id = masterId || null
      entry.needs_master_resolution = !masterId
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

    // Check for duplicate master ID on this ticket before committing
    if (masterId && checkForDuplicateMaster('labour', rowIdx, masterId, selectedName, doCommit)) {
      setEditingCell(null) // Close the dropdown while modal is showing
      return
    }
    doCommit()
  }

  function handleEquipmentUnitSelect(rowIdx, selectedUnit) {
    const fleetEntry = equipmentRoster.find(r => r.unitNumber === selectedUnit)
    if (!fleetEntry || !onBlockChange) {
      commitEdit(selectedUnit)
      return
    }

    const masterId = fleetEntry.masterId
    const doCommit = () => {
      const entries = [...equipmentEntries]
      const entry = { ...entries[rowIdx] }
      const oldUnit = entry.unitNumber || entry.unit_number || ''
      const oldType = entry.type || entry.equipment_type || ''
      entry.unitNumber = selectedUnit
      entry.unit_number = selectedUnit
      if (fleetEntry.equipmentType) {
        entry.type = fleetEntry.equipmentType
        entry.equipment_type = fleetEntry.equipmentType
      }
      entry.master_equipment_id = masterId || null
      entry.needs_master_resolution = !masterId
      entries[rowIdx] = entry

      const updatedBlock = { ...block, equipmentEntries: entries }
      const auditEntries = [
        { field: `equipment[${rowIdx}].unitNumber`, oldValue: oldUnit, newValue: selectedUnit },
      ]
      if (oldType !== (fleetEntry.equipmentType || '')) {
        auditEntries.push({ field: `equipment[${rowIdx}].type`, oldValue: oldType, newValue: fleetEntry.equipmentType })
      }
      onBlockChange(updatedBlock, auditEntries)
      setEditingCell(null)
    }

    if (masterId && checkForDuplicateMaster('equipment', rowIdx, masterId, selectedUnit, doCommit)) {
      setEditingCell(null)
      return
    }
    doCommit()
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

      {/* LEM extraction prompt */}
      {hasLemPdf && !lemData && (
        <div style={{ margin: '4px 12px', padding: '8px 12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
          <strong>&#9888; LEM uploaded but structured data not yet extracted.</strong>
          <button
            disabled={lemExtracting}
            onClick={async () => {
              if (lemExtracting) return
              setLemExtracting(true)
              try {
                const { extractLEMFromUrl } = await import('../../utils/lemParser.js')
                if (!lemPdfUrls.length) { setToast('No LEM PDF URL found'); setLemExtracting(false); return }
                const result = await extractLEMFromUrl(lemPdfUrls[0])
                if (result?.error) {
                  setToast('Extraction error: ' + result.error); setLemExtracting(false); return
                }
                if (!result || (!result.labour?.length && !result.equipment?.length)) {
                  setToast('OCR returned no data — check the PDF'); setLemExtracting(false); return
                }
                const record = {
                  organization_id: organizationId,
                  field_log_id: String(block?.ticketNumber || ''),
                  date: reportDate,
                  labour_entries: result.labour || [],
                  equipment_entries: result.equipment || [],
                  total_labour_cost: result.totals?.total_labour_cost || 0,
                  total_equipment_cost: result.totals?.total_equipment_cost || 0,
                  reconciliation_status: 'pending',
                  billing_status: 'open',
                }
                // Check if row already exists, then update or insert
                const { data: existing } = await supabase.from('contractor_lems')
                  .select('id').eq('field_log_id', record.field_log_id).eq('organization_id', organizationId).maybeSingle()
                const { error: saveErr } = existing?.id
                  ? await supabase.from('contractor_lems').update(record).eq('id', existing.id)
                  : await supabase.from('contractor_lems').insert(record)
                if (saveErr) { setToast('Save failed: ' + saveErr.message); setLemExtracting(false); return }
                setToast(`Extracted ${result.labour?.length || 0} labour + ${result.equipment?.length || 0} equipment`)
                if (onLemExtracted) onLemExtracted()
              } catch (err) {
                console.error('LEM extraction failed:', err)
                setToast('Extraction failed: ' + (err.message || 'unknown error'))
              }
              setLemExtracting(false)
            }}
            style={{ marginLeft: 8, padding: '4px 12px', backgroundColor: lemExtracting ? '#9ca3af' : '#1e3a5f', color: 'white', border: 'none', borderRadius: 4, cursor: lemExtracting ? 'wait' : 'pointer', fontSize: 11, fontWeight: '600' }}
          >
            {lemExtracting ? 'Extracting...' : 'Extract now'}
          </button>
        </div>
      )}

      {/* Master resolution banner */}
      {(hasUnresolved || redVarianceCount > 0 || ghostLabourRows.length > 0) && (
        <div style={{ margin: '4px 12px', padding: '8px 12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>&#9888;</span>
          <span>
            {(unresolvedLabour + unresolvedEquip) > 0 && `${unresolvedLabour + unresolvedEquip} need resolution`}
            {(unresolvedLabour + unresolvedEquip) > 0 && totalFlagged > 0 && ' · '}
            {totalFlagged > 0 && `${totalFlagged} flagged for review`}
            {(hasUnresolved) && ' · Cost totals exclude these rows until resolved.'}
            {redVarianceCount > 0 && `${hasUnresolved ? ' · ' : ''}${redVarianceCount} red (variance with LEM)`}
            {ghostLabourRows.length > 0 && `${hasUnresolved || redVarianceCount > 0 ? ' · ' : ''}${ghostLabourRows.length} on LEM but not reported`}
          </span>
        </div>
      )}

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
                const isUnmatched = e.needs_master_resolution
                const isFlagged = e.flagged_for_review
                const variance = labourVarianceMap[i]
                const isRedVariance = variance?.isRed && !isUnmatched && !isFlagged
                const rowBorder = isFlagged ? { borderLeft: '4px solid #7c3aed' }
                  : isUnmatched ? { borderLeft: '4px solid #eab308' }
                  : isRedVariance ? { borderLeft: '4px solid #ef4444', backgroundColor: '#fef2f2' }
                  : {}
                return (
                  <React.Fragment key={i}>
                    <tr
                      style={{ ...rowBorder, ...(dragState.section === 'labour' && dragState.overIdx === i ? { borderTop: '3px solid #3b82f6' } : {}) }}
                      onDragOver={e => handleDragOver('labour', i, e)}
                    >
                      {onBlockChange && (
                        <td style={{ ...cellStyle, padding: '2px', textAlign: 'center', width: 32 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span
                              draggable
                              onDragStart={e => handleDragStart('labour', i, e)}
                              onDragEnd={handleDragEnd}
                              style={{ cursor: 'grab', fontSize: 14, color: '#9ca3af', userSelect: 'none', lineHeight: 1 }}
                              title="Drag to reorder"
                            >&#9776;</span>
                            <button onClick={() => removeRow('labour', i)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#dc2626', padding: 0, lineHeight: 1, fontWeight: 'bold' }} title="Remove row">&#10005;</button>
                          </div>
                        </td>
                      )}
                      {renderCell('labour', i, 'name', e.employeeName || e.employee_name || e.name || '',
                        isUnmatched ? { ...cellStyle, backgroundColor: '#fffbeb' } : cellStyle,
                        true, employeeRoster, 'employeeName', handleEmployeeSelect)}
                      {isUnmatched
                        ? <td style={{ ...cellStyle, color: '#9ca3af', fontStyle: 'italic', fontSize: 11 }}>
                            — Pick from master —
                            {onBlockChange && <button onClick={() => openMasterModal('labour', i, e.employeeName || e.employee_name || e.name || '')} style={{ marginLeft: 6, padding: '1px 6px', fontSize: 10, backgroundColor: e.flagged_for_review ? '#7c3aed' : '#f59e0b', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>{e.flagged_for_review ? 'Review Flag' : 'Resolve'}</button>}
                          </td>
                        : renderCell('labour', i, 'classification', e.classification || '', { ...cellStyle, color: '#6b7280' }, true, labourRates, 'classification')}
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
                        <PencilIcon section="labour" rowIdx={i} field="subs" fieldLabel="Subsistence" currentValue={lc.subs || 0} inputType="number" />
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', color: lc.rtRate != null ? '#166534' : '#9ca3af' }}>
                        {fmt(lc.cost)}
                        <PencilIcon section="labour" rowIdx={i} field="cost" fieldLabel="Cost" currentValue={lc.cost || 0} inputType="number" />
                      </td>
                    </tr>
                    {dupeWarning && (
                      <tr>
                        <td colSpan={onBlockChange ? 11 : 10} style={{ padding: '2px 6px', fontSize: 11, color: '#dc2626', backgroundColor: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                          &#9888; {dupeWarning}
                        </td>
                      </tr>
                    )}
                    {isRedVariance && varianceReasonText(variance) && (
                      <tr>
                        <td colSpan={onBlockChange ? 11 : 10} style={{ padding: '2px 6px', fontSize: 11, color: '#b91c1c', backgroundColor: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                          {varianceReasonText(variance)}
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
                <th style={{ ...headerStyle, textAlign: 'left', width: 70 }}>Unit #</th>
                <th style={{ ...headerStyle, textAlign: 'left' }}>Classification</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 40 }}>Hrs</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 65 }}>Rate</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 75 }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {equipmentEntries.map((e, i) => {
                const { rate, cost } = equipmentCosts[i]
                const dupeWarning = getEquipmentDuplicateWarning(e, i)
                const isUnmatched = e.needs_master_resolution
                const isFlagged = e.flagged_for_review
                const rowBorder = isFlagged ? { borderLeft: '4px solid #7c3aed' } : isUnmatched ? { borderLeft: '4px solid #eab308' } : {}
                return (
                  <React.Fragment key={i}>
                    <tr
                      style={{ ...rowBorder, ...(dragState.section === 'equipment' && dragState.overIdx === i ? { borderTop: '3px solid #3b82f6' } : {}) }}
                      onDragOver={e2 => handleDragOver('equipment', i, e2)}
                    >
                      {onBlockChange && (
                        <td style={{ ...cellStyle, padding: '2px', textAlign: 'center', width: 32 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span
                              draggable
                              onDragStart={ev => handleDragStart('equipment', i, ev)}
                              onDragEnd={handleDragEnd}
                              style={{ cursor: 'grab', fontSize: 14, color: '#9ca3af', userSelect: 'none', lineHeight: 1 }}
                              title="Drag to reorder"
                            >&#9776;</span>
                            <button onClick={() => removeRow('equipment', i)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#dc2626', padding: 0, lineHeight: 1, fontWeight: 'bold' }} title="Remove row">&#10005;</button>
                          </div>
                        </td>
                      )}
                      {renderCell('equipment', i, 'unitNumber', e.unitNumber || e.unit_number || '',
                        isUnmatched ? { ...cellStyle, backgroundColor: '#fffbeb' } : cellStyle,
                        true, equipmentRoster, 'unitNumber', handleEquipmentUnitSelect)}
                      {isUnmatched
                        ? <td style={{ ...cellStyle, color: '#9ca3af', fontStyle: 'italic', fontSize: 11 }}>
                            — Pick from master —
                            {onBlockChange && <button onClick={() => openMasterModal('equipment', i, e.unitNumber || e.unit_number || '')} style={{ marginLeft: 6, padding: '1px 6px', fontSize: 10, backgroundColor: e.flagged_for_review ? '#7c3aed' : '#f59e0b', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}>{e.flagged_for_review ? 'Review Flag' : 'Resolve'}</button>}
                          </td>
                        : renderCell('equipment', i, 'type', e.type || e.equipment_type || '', cellStyle, true, equipmentRates, equipmentRates[0]?.equipment_type ? 'equipment_type' : 'type')}
                      {renderCell('equipment', i, 'hours', String(e.hours || 0), { ...cellStyle, textAlign: 'right' })}
                      <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: rate != null ? '#166534' : '#9ca3af', fontStyle: rate != null ? 'normal' : 'italic' }}>
                        {rate != null ? `${fmt(rate)}/day` : isUnmatched ? '$0.00' : 'No rate found'}
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

      {/* Ghost rows — on LEM but not reported */}
      {ghostLabourRows.length > 0 && (
        <div style={{ padding: '8px 12px', marginTop: '8px' }}>
          <div style={{ fontWeight: '700', color: '#dc2626', fontSize: 12, marginBottom: 4 }}>
            ON LEM BUT NOT REPORTED ({ghostLabourRows.length})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headerStyle, textAlign: 'left', backgroundColor: '#fef2f2', color: '#dc2626' }}>Name</th>
                <th style={{ ...headerStyle, textAlign: 'left', backgroundColor: '#fef2f2', color: '#dc2626' }}>Classification</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 40, backgroundColor: '#fef2f2', color: '#dc2626' }}>RT</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 40, backgroundColor: '#fef2f2', color: '#dc2626' }}>OT</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 40, backgroundColor: '#fef2f2', color: '#dc2626' }}>DT</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 70, backgroundColor: '#fef2f2', color: '#dc2626' }}>LEM Cost</th>
              </tr>
            </thead>
            <tbody>
              {ghostLabourRows.map((g, i) => (
                <tr key={`ghost-${i}`} style={{ borderLeft: '4px solid #ef4444', backgroundColor: '#fef2f2' }}>
                  <td style={cellStyle}>{g.employee_name || g.name || '\u2014'}</td>
                  <td style={{ ...cellStyle, color: '#6b7280' }}>{g.classification || '\u2014'}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{g.rt_hours || g.rt || 0}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{g.ot_hours || g.ot || 0}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{g.dt_hours || g.dt || 0}</td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>{fmt(parseFloat(g.line_total || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

      {/* Resolve Row modal */}
      <ResolveRowModal
        open={masterModal.open}
        onClose={() => setMasterModal({ open: false, type: 'labour', prefill: '', rowIdx: null, section: null })}
        onResolved={handleMasterAdded}
        entryType={masterModal.type}
        sourceValue={masterModal.prefill}
        projectId={projectId}
        organizationId={organizationId}
        dailyReportId={report?.id}
        rowContext={{
          blockId: block?.id,
          entryIndex: masterModal.rowIdx,
          currentHours: masterModal.section === 'labour'
            ? parseFloat(labourEntries[masterModal.rowIdx]?.rt || 0) + parseFloat(labourEntries[masterModal.rowIdx]?.ot || 0)
            : parseFloat(equipmentEntries[masterModal.rowIdx]?.hours || 0),
          reportDate: report?.date,
          ticketNumber: block?.ticketNumber,
        }}
        currentUserRole={currentUserRole}
        labourRates={labourRates}
        equipmentRates={equipmentRates}
      />

      {/* Duplicate resolution modal */}
      {dupeResolve && ReactDOM.createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 20000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={handleDupeCancel}>
          <div style={{
            backgroundColor: 'white', borderRadius: 8, padding: 24,
            maxWidth: 480, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#b45309' }}>
              &#9888; Duplicate Detected
            </h3>
            <p style={{ fontSize: 13, color: '#333', margin: '0 0 8px 0' }}>
              <strong>"{dupeResolve.masterName}"</strong> is already entered on this ticket
              {dupeResolve.section === 'labour' && dupeResolve.existingEntry && (
                <span> ({dupeResolve.existingEntry.rt || 0} RT hrs, {dupeResolve.existingEntry.ot || 0} OT, {dupeResolve.existingEntry.dt || 0} DT)</span>
              )}
              {dupeResolve.section === 'equipment' && dupeResolve.existingEntry && (
                <span> ({dupeResolve.existingEntry.hours || 0} hrs)</span>
              )}
              .
            </p>
            <p style={{ fontSize: 13, color: '#333', margin: '0 0 16px 0' }}>
              This row would create a duplicate. What would you like to do?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={handleDupeMerge} style={{
                padding: '10px 16px', backgroundColor: '#059669', color: 'white',
                border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600, textAlign: 'left',
              }}>
                Merge hours into existing row
                <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.9, marginTop: 2 }}>
                  {dupeResolve.section === 'labour'
                    ? 'Sums RT/OT/DT onto the existing row, keeps higher subs value. Deletes this row.'
                    : 'Sums hours onto the existing row. Deletes this row.'}
                </div>
              </button>
              <button onClick={handleDupeKeepSeparate} style={{
                padding: '10px 16px', backgroundColor: '#2563eb', color: 'white',
                border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600, textAlign: 'left',
              }}>
                Keep as separate row
                <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.9, marginTop: 2 }}>
                  Both rows will show a duplicate warning. Use this if the person worked two shifts.
                </div>
              </button>
              <button onClick={handleDupeCancel} style={{
                padding: '10px 16px', backgroundColor: '#e5e7eb', color: '#374151',
                border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
              }}>
                Cancel — no change
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Admin override popover */}
      {overridePopover && (
        <AdminOverridePopover
          open={!!overridePopover}
          onClose={() => setOverridePopover(null)}
          anchorRect={overridePopover.anchorRect}
          fieldLabel={overridePopover.fieldLabel}
          currentValue={overridePopover.currentValue}
          inputType={overridePopover.inputType}
          onSave={handleOverrideSave}
          onRemoveOverride={handleOverrideRemove}
          hasExistingOverride={!!(
            (overridePopover.section === 'labour' ? labourEntries : equipmentEntries)
            [overridePopover.rowIdx]?.[`${overridePopover.field}_override`]
          )}
          existingOverrideInfo={
            (overridePopover.section === 'labour' ? labourEntries : equipmentEntries)
            [overridePopover.rowIdx]?.[`${overridePopover.field}_override`] || null
          }
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', backgroundColor: '#059669', color: 'white',
          borderRadius: 6, fontSize: 13, fontWeight: 600, zIndex: 20001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
