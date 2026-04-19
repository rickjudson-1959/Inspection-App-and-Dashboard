import React, { useState, useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { supabase } from '../../supabase'
import { normalizeName, extractNameParts, levenshtein } from '../../utils/nameMatchingUtils.js'

/**
 * ResolveRowModal — diagnostic-first resolution workflow for unmatched rows.
 * Shows top 5 fuzzy-matched candidates from master before allowing creation.
 *
 * Props:
 *   open, onClose, entryType ('labour'|'equipment'), sourceValue (OCR string),
 *   projectId, organizationId, dailyReportId, rowContext ({ blockId, entryIndex, currentHours, reportDate, ticketNumber }),
 *   onResolved (callback), currentUserRole, labourRates, equipmentRates
 */
export default function ResolveRowModal({
  open, onClose, entryType = 'labour', sourceValue = '', projectId, organizationId,
  dailyReportId, rowContext = {}, onResolved, currentUserRole = '',
  labourRates = [], equipmentRates = []
}) {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('candidates') // 'candidates' | 'add_new' | 'flag'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Add-new form state
  const [newName, setNewName] = useState(sourceValue)
  const [newClassification, setNewClassification] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [showClassDropdown, setShowClassDropdown] = useState(false)

  // Flag form state
  const [flagReason, setFlagReason] = useState('')

  const isAdmin = ['admin', 'super_admin'].includes(currentUserRole)
  const isLabour = entryType === 'labour'

  // Reset on open
  useEffect(() => {
    if (open) {
      setView('candidates')
      setError('')
      setNewName(sourceValue)
      setNewClassification('')
      setClassFilter('')
      setFlagReason('')
      loadCandidates()
    }
  }, [open, sourceValue])

  async function loadCandidates() {
    setLoading(true)
    try {
      const table = isLabour ? 'master_personnel' : 'master_equipment'
      const nameField = isLabour ? 'name' : 'unit_number'

      // Load all active master entries for this project (paginated)
      let allEntries = []
      let offset = 0
      while (true) {
        const { data } = await supabase.from(table)
          .select('id, ' + nameField + ', classification')
          .eq('project_id', projectId)
          .eq('active', true)
          .range(offset, offset + 999)
        allEntries.push(...(data || []))
        if (!data || data.length < 1000) break
        offset += 1000
      }

      // Score each against sourceValue
      const scored = allEntries.map(entry => {
        const masterValue = entry[nameField] || ''
        const score = isLabour
          ? scoreNameMatch(sourceValue, masterValue)
          : scoreUnitMatch(sourceValue, masterValue)
        return { ...entry, masterValue, score }
      })

      // Filter ≥0.4 and take top 5
      const top5 = scored
        .filter(s => s.score >= 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

      setCandidates(top5)
    } catch (err) {
      console.error('Failed to load candidates:', err)
    }
    setLoading(false)
  }

  // --- Scoring functions ---

  function scoreNameMatch(source, master) {
    const sNorm = normalizeName(source)
    const mNorm = normalizeName(master)
    if (!sNorm || !mNorm) return 0

    // Pass 1: exact match
    if (sNorm === mNorm) return 1.0

    const sParts = extractNameParts(sNorm)
    const mParts = extractNameParts(mNorm)

    // Pass 2: last name match + first initial
    if (sParts.last === mParts.last && sParts.first && mParts.first && sParts.first[0] === mParts.first[0]) return 0.95

    // Pass 3: Levenshtein on full normalized name
    const maxLen = Math.max(sNorm.length, mNorm.length)
    if (maxLen === 0) return 0
    const lev = levenshtein(sNorm, mNorm)
    const levScore = 1 - (lev / maxLen)
    if (levScore >= 0.85) return levScore

    // Pass 4: last name exact + first name Levenshtein
    if (sParts.last === mParts.last && sParts.first && mParts.first) {
      const firstLev = levenshtein(sParts.first, mParts.first)
      const firstMax = Math.max(sParts.first.length, mParts.first.length)
      const firstScore = 1 - (firstLev / firstMax)
      if (firstScore >= 0.6) return 0.7 + (firstScore * 0.15)
    }

    // Pass 5: reversed name order (FIRST LAST vs LAST FIRST)
    const sReversed = `${sParts.first} ${sParts.last}`.trim()
    const mReversed = `${mParts.first} ${mParts.last}`.trim()
    const sAsLastFirst = `${sParts.last} ${sParts.first}`.trim()
    if (sReversed === mNorm || sAsLastFirst === mNorm) return 0.9

    // Pass 6: fall back to overall Levenshtein
    if (levScore >= 0.4) return levScore

    return 0
  }

  function scoreUnitMatch(source, master) {
    const s = (source || '').toLowerCase().trim()
    const m = (master || '').toLowerCase().trim()
    if (!s || !m) return 0

    // Exact match
    if (s === m) return 1.0

    // Digits extraction — "OR1822" → "1822"
    const sDigits = s.replace(/[^0-9]/g, '')
    const mDigits = m.replace(/[^0-9]/g, '')
    if (sDigits && mDigits && sDigits === mDigits) return 0.85

    // Contains match
    if (m.includes(s) || s.includes(m)) return 0.75

    // Token overlap
    const sTokens = s.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean)
    const mTokens = m.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean)
    if (sTokens.length > 0 && mTokens.length > 0) {
      const overlap = sTokens.filter(t => mTokens.some(mt => mt.includes(t) || t.includes(mt))).length
      const score = overlap / Math.max(sTokens.length, mTokens.length)
      if (score >= 0.5) return 0.4 + (score * 0.3)
    }

    // Levenshtein
    const maxLen = Math.max(s.length, m.length)
    const lev = levenshtein(s, m)
    const levScore = 1 - (lev / maxLen)
    if (levScore >= 0.4) return levScore

    return 0
  }

  function matchDotColor(score) {
    if (score >= 0.85) return '#059669' // green
    if (score >= 0.6) return '#eab308'  // yellow
    return '#f97316' // orange
  }

  // --- Actions ---

  async function handlePickExisting(candidate) {
    setSaving(true)
    setError('')
    try {
      // Log resolution decision
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('resolution_decisions').insert({
        organization_id: organizationId,
        project_id: projectId,
        daily_report_id: dailyReportId || null,
        entry_type: entryType,
        source_value: sourceValue,
        resolution_type: 'picked_existing',
        master_id_resolved: candidate.id,
        candidates_shown: candidates.map(c => ({ id: c.id, name: c.masterValue, score: Math.round(c.score * 100) })),
        resolved_by: user?.id,
        notes: null,
      })

      if (onResolved) {
        onResolved({
          type: 'picked',
          master_id: candidate.id,
          master_name: candidate.masterValue,
          master_classification: candidate.classification,
        })
      }
      onClose()
    } catch (err) {
      setError('Failed to save: ' + err.message)
    }
    setSaving(false)
  }

  async function handleAddNew() {
    if (!newName.trim()) { setError(isLabour ? 'Name is required' : 'Unit number is required'); return }
    if (!newClassification) { setError('Classification is required'); return }

    setSaving(true)
    setError('')
    try {
      const table = isLabour ? 'master_personnel' : 'master_equipment'
      const nameField = isLabour ? 'name' : 'unit_number'
      const rateField = isLabour ? 'labour_rate_id' : 'equipment_rate_id'
      const rates = isLabour ? labourRates : equipmentRates
      const classKey = isLabour ? 'classification' : (rates[0]?.equipment_type ? 'equipment_type' : 'type')

      // Find matching rate
      const matchedRate = rates.find(r => (r[classKey] || '').toLowerCase().trim() === newClassification.toLowerCase().trim())
      if (!matchedRate) { setError('Classification does not match any rate card entry'); setSaving(false); return }

      // Check duplicate
      const { data: existing } = await supabase.from(table).select('id, ' + nameField).eq('project_id', projectId).ilike(nameField, newName.trim()).limit(1)
      if (existing && existing.length > 0) {
        setError(`"${existing[0][nameField]}" already exists in master — pick from the candidates instead.`)
        setSaving(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()

      // Insert into master
      const insertData = {
        organization_id: organizationId,
        project_id: projectId,
        [nameField]: newName.trim(),
        classification: newClassification,
        [rateField]: matchedRate.id,
        active: true,
        created_by: user?.id || null,
      }
      const { data: inserted, error: insertErr } = await supabase.from(table).insert(insertData).select().single()
      if (insertErr) throw insertErr

      // Log resolution decision
      await supabase.from('resolution_decisions').insert({
        organization_id: organizationId,
        project_id: projectId,
        daily_report_id: dailyReportId || null,
        entry_type: entryType,
        source_value: sourceValue,
        resolution_type: 'added_new',
        master_id_resolved: inserted.id,
        candidates_shown: candidates.map(c => ({ id: c.id, name: c.masterValue, score: Math.round(c.score * 100) })),
        resolved_by: user?.id,
        notes: `Added new ${isLabour ? 'person' : 'unit'}: ${newName.trim()} as ${newClassification}`,
      })

      if (onResolved) {
        onResolved({
          type: 'added',
          master_id: inserted.id,
          master_name: newName.trim(),
          master_classification: newClassification,
          rate: matchedRate,
        })
      }
      onClose()
    } catch (err) {
      setError('Failed to add: ' + err.message)
    }
    setSaving(false)
  }

  async function handleFlag() {
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()

      await supabase.from('resolution_decisions').insert({
        organization_id: organizationId,
        project_id: projectId,
        daily_report_id: dailyReportId || null,
        entry_type: entryType,
        source_value: sourceValue,
        resolution_type: 'flagged',
        candidates_shown: candidates.map(c => ({ id: c.id, name: c.masterValue, score: Math.round(c.score * 100) })),
        resolved_by: user?.id,
        notes: flagReason || null,
      })

      if (onResolved) {
        onResolved({ type: 'flagged', reason: flagReason })
      }
      onClose()
    } catch (err) {
      setError('Failed to flag: ' + err.message)
    }
    setSaving(false)
  }

  async function handleCancel() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('resolution_decisions').insert({
        organization_id: organizationId,
        project_id: projectId,
        daily_report_id: dailyReportId || null,
        entry_type: entryType,
        source_value: sourceValue,
        resolution_type: 'cancelled',
        candidates_shown: candidates.map(c => ({ id: c.id, name: c.masterValue, score: Math.round(c.score * 100) })),
        resolved_by: user?.id,
      })
    } catch (e) { /* non-fatal */ }
    onClose()
  }

  if (!open) return null

  // Classification dropdown for add-new view
  const rates = isLabour ? labourRates : equipmentRates
  const classKey = isLabour ? 'classification' : (rates[0]?.equipment_type ? 'equipment_type' : 'type')
  const classOptions = [...new Set(rates.map(r => r[classKey] || '').filter(Boolean))].sort()
  const filteredClasses = classFilter.trim()
    ? classOptions.filter(c => c.toLowerCase().includes(classFilter.toLowerCase()))
    : classOptions
  const matchedRate = newClassification
    ? rates.find(r => (r[classKey] || '').toLowerCase().trim() === newClassification.toLowerCase().trim())
    : null

  const modalContent = (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 20000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={handleCancel}>
      <div style={{
        backgroundColor: 'white', borderRadius: 8, padding: 0,
        maxWidth: 520, width: '92%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#1e3a5f' }}>Resolve this row</h3>
          <button onClick={handleCancel} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        {/* Source context */}
        <div style={{ padding: '12px 20px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>From the report:</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1e3a5f' }}>"{sourceValue}"</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
            {rowContext.currentHours ? `${rowContext.currentHours} hours` : ''}
            {rowContext.reportDate ? ` · ${rowContext.reportDate}` : ''}
            {dailyReportId ? ` · Report #${dailyReportId}` : ''}
            {rowContext.ticketNumber ? ` · Ticket #${rowContext.ticketNumber}` : ''}
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* CANDIDATES VIEW */}
          {view === 'candidates' && (
            <>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#6b7280' }}>Searching master...</div>
              ) : candidates.length > 0 ? (
                <>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>
                    Did you mean one of these {isLabour ? 'people' : 'units'} already in master?
                  </div>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
                    {candidates.map((c, idx) => (
                      <div key={c.id} style={{
                        padding: '10px 14px', borderBottom: idx < candidates.length - 1 ? '1px solid #f3f4f6' : 'none',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: matchDotColor(c.score), display: 'inline-block' }} />
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{c.masterValue}</span>
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>({Math.round(c.score * 100)}% match)</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, marginLeft: 14 }}>{c.classification}</div>
                        </div>
                        <button
                          onClick={() => handlePickExisting(c)}
                          disabled={saving}
                          style={{
                            padding: '5px 12px', backgroundColor: '#059669', color: 'white',
                            border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                          }}
                        >
                          This one
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ padding: '12px 0', fontSize: 13, color: '#6b7280', fontStyle: 'italic', marginBottom: 16 }}>
                  No close matches found in master.
                </div>
              )}

              {/* Bottom actions */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>None of the above?</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => { setView('add_new'); setNewName(sourceValue); setNewClassification(''); setError('') }}
                    disabled={!isAdmin}
                    title={!isAdmin ? 'Only admins can add new records to master. Pick a candidate, flag for review, or contact your admin.' : ''}
                    style={{
                      padding: '8px 14px', backgroundColor: isAdmin ? '#2563eb' : '#e5e7eb',
                      color: isAdmin ? 'white' : '#9ca3af', border: 'none', borderRadius: 4,
                      cursor: isAdmin ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    Add as new {isLabour ? 'person' : 'unit'}
                  </button>
                  <button
                    onClick={() => { setView('flag'); setFlagReason(''); setError('') }}
                    style={{ padding: '8px 14px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  >
                    Flag for review
                  </button>
                  <button
                    onClick={handleCancel}
                    style={{ padding: '8px 14px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ADD NEW VIEW */}
          {view === 'add_new' && (
            <>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
                Add a new {isLabour ? 'person' : 'unit'} to the project master:
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{isLabour ? 'Name' : 'Unit Number'} *</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 12, position: 'relative' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Classification *</label>
                <div onClick={() => setShowClassDropdown(true)} style={{
                  width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14,
                  boxSizing: 'border-box', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 38, backgroundColor: '#fff',
                }}>
                  {showClassDropdown ? (
                    <input type="text" value={classFilter} onChange={e => setClassFilter(e.target.value)} placeholder="Type to search..."
                      autoFocus onKeyDown={e => { if (e.key === 'Escape') setShowClassDropdown(false) }}
                      style={{ border: 'none', outline: 'none', width: '100%', fontSize: 14, padding: 0 }} />
                  ) : (
                    <span style={{ color: newClassification ? '#333' : '#999' }}>{newClassification || 'Select classification...'}</span>
                  )}
                  <span style={{ color: '#666', marginLeft: 8 }}>▼</span>
                </div>
                {showClassDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, maxHeight: 180, overflowY: 'auto',
                    backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '0 0 4px 4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                    {filteredClasses.slice(0, 30).map((cls, i) => (
                      <div key={cls} onMouseDown={e => e.preventDefault()} onClick={() => { setNewClassification(cls); setShowClassDropdown(false); setClassFilter('') }}
                        style={{ padding: '8px 10px', fontSize: 13, cursor: 'pointer', backgroundColor: cls === newClassification ? '#e3f2fd' : '#fff', borderBottom: '1px solid #f3f4f6' }}
                        onMouseEnter={e => e.target.style.backgroundColor = '#dbeafe'} onMouseLeave={e => e.target.style.backgroundColor = cls === newClassification ? '#e3f2fd' : '#fff'}>
                        {cls}
                      </div>
                    ))}
                    {filteredClasses.length === 0 && <div style={{ padding: 10, color: '#999', textAlign: 'center', fontSize: 13 }}>No matches</div>}
                  </div>
                )}
              </div>

              {matchedRate && (
                <div style={{ marginBottom: 12, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 4, backgroundColor: '#f9fafb', fontSize: 13, color: '#374151' }}>
                  Rate: {isLabour
                    ? `${matchedRate.rate_type === 'weekly' ? 'Weekly' : 'Hourly'}: ST $${matchedRate.rate_st} | OT $${matchedRate.rate_ot}`
                    : `Daily: $${matchedRate.rate_daily || matchedRate.rate_hourly || 0}`}
                </div>
              )}

              <div style={{ padding: '8px 10px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, fontSize: 11, color: '#92400e', marginBottom: 12 }}>
                ⚠ This adds a permanent record to the project master.
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAddNew} disabled={saving} style={{
                  padding: '8px 14px', backgroundColor: saving ? '#9ca3af' : '#059669', color: 'white',
                  border: 'none', borderRadius: 4, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                }}>{saving ? 'Adding...' : 'Add to Master'}</button>
                <button onClick={() => setView('candidates')} style={{ padding: '8px 14px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>Back</button>
              </div>
            </>
          )}

          {/* FLAG VIEW */}
          {view === 'flag' && (
            <>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>
                Flag this row for review by an admin:
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Why are you flagging? (optional)</label>
                <textarea value={flagReason} onChange={e => setFlagReason(e.target.value)} rows={3} placeholder="Helps whoever reviews this later..."
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleFlag} disabled={saving} style={{
                  padding: '8px 14px', backgroundColor: saving ? '#9ca3af' : '#7c3aed', color: 'white',
                  border: 'none', borderRadius: 4, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                }}>{saving ? 'Flagging...' : 'Confirm Flag'}</button>
                <button onClick={() => setView('candidates')} style={{ padding: '8px 14px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>Back</button>
              </div>
            </>
          )}

          {error && (
            <div style={{ marginTop: 10, padding: '8px 10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, fontSize: 12, color: '#dc2626' }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return ReactDOM.createPortal(modalContent, document.body)
}
