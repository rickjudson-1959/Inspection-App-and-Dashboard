import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { supabase } from '../../supabase'

/**
 * AddToMasterModal — In-app master editor for one-off additions.
 * Opens from the "+ Add to Master" button on unmatched rows in InspectorReportPanel.
 *
 * Props:
 *   isOpen (bool)
 *   onClose ()
 *   onAdded ({ masterId, name/unitNumber, classification, rateId }) — callback after successful insert
 *   type ('labour' | 'equipment')
 *   prefillName (string) — OCR'd name or unit number to pre-fill
 *   organizationId (string)
 *   labourRates (array) — for classification dropdown (labour variant)
 *   equipmentRates (array) — for classification dropdown (equipment variant)
 */
export default function AddToMasterModal({ isOpen, onClose, onAdded, type = 'labour', prefillName = '', organizationId, labourRates = [], equipmentRates = [] }) {
  const [name, setName] = useState(prefillName)
  const [classification, setClassification] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [showClassDropdown, setShowClassDropdown] = useState(false)
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [projectId, setProjectId] = useState(null)
  const [projectName, setProjectName] = useState('')

  // Reset form when modal opens with new prefill
  useEffect(() => {
    if (isOpen) {
      setName(prefillName)
      setClassification('')
      setClassFilter('')
      setActive(true)
      setError('')
      setSaving(false)
    }
  }, [isOpen, prefillName])

  // Load project for this org
  useEffect(() => {
    if (!organizationId || !isOpen) return
    async function loadProject() {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .limit(1)
      if (data && data.length > 0) {
        setProjectId(data[0].id)
        setProjectName(data[0].name)
      }
    }
    loadProject()
  }, [organizationId, isOpen])

  if (!isOpen) return null

  const isLabour = type === 'labour'
  const rates = isLabour ? labourRates : equipmentRates
  const classKey = isLabour ? 'classification' : (rates[0]?.equipment_type ? 'equipment_type' : 'type')

  // Get unique classification names from rates
  const classOptions = [...new Set(rates.map(r => r[classKey] || '').filter(Boolean))].sort()

  // Filter classifications
  const filteredClasses = classFilter.trim()
    ? classOptions.filter(c => c.toLowerCase().includes(classFilter.toLowerCase()))
    : classOptions

  // Find the rate row that matches selected classification
  const matchedRate = classification
    ? rates.find(r => (r[classKey] || '').toLowerCase().trim() === classification.toLowerCase().trim())
    : null

  // Normalization for duplicate check (case-insensitive + trimmed + suffix-stripped)
  function normalize(s) {
    return (s || '').toLowerCase().trim().replace(/\s*\([^)]*\)\s*$/, '').trim()
  }

  async function handleSave() {
    setError('')

    if (!name.trim()) {
      setError(isLabour ? 'Name is required' : 'Unit number is required')
      return
    }
    if (!classification) {
      setError('Classification is required — pick from the dropdown')
      return
    }
    if (!matchedRate) {
      setError('Selected classification does not match any rate card entry')
      return
    }
    if (!projectId) {
      setError('No project found for this organization')
      return
    }

    setSaving(true)

    try {
      const table = isLabour ? 'master_personnel' : 'master_equipment'
      const nameField = isLabour ? 'name' : 'unit_number'
      const rateField = isLabour ? 'labour_rate_id' : 'equipment_rate_id'

      // Check for existing duplicate (case-insensitive)
      const { data: existing } = await supabase
        .from(table)
        .select('id, ' + nameField)
        .eq('project_id', projectId)
        .ilike(nameField, name.trim())
        .limit(1)

      if (existing && existing.length > 0) {
        const existingName = existing[0][nameField]
        setError(`This ${isLabour ? 'name' : 'unit number'} already exists in master as "${existingName}" — pick from the dropdown instead.`)
        setSaving(false)
        return
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()

      // INSERT into master table
      const insertData = {
        organization_id: organizationId,
        project_id: projectId,
        [nameField]: name.trim(),
        classification: isLabour ? classification : undefined,
        [rateField]: matchedRate.id,
        active: active,
        created_by: user?.id || null,
      }
      // Equipment uses 'classification' field for the equipment type description
      if (!isLabour) {
        insertData.classification = classification
      }

      const { data: inserted, error: insertErr } = await supabase
        .from(table)
        .insert(insertData)
        .select()
        .single()

      if (insertErr) throw insertErr

      // Audit log
      try {
        await supabase.from('report_audit_log').insert({
          organization_id: organizationId,
          change_type: isLabour ? 'master_personnel_linked' : 'master_equipment_linked',
          section: 'AddToMasterModal',
          field_name: isLabour ? 'master_personnel_id' : 'master_equipment_id',
          new_value: JSON.stringify({
            master_id: inserted.id,
            name: name.trim(),
            classification,
            rate_id: matchedRate.id,
            source: 'manual_add_to_master',
          }),
          changed_by_name: user?.email || 'admin',
          changed_by_role: 'admin',
        })
      } catch (ae) { console.warn('Audit log failed:', ae) }

      // Callback to parent — auto-link the row and refresh roster
      if (onAdded) {
        onAdded({
          masterId: inserted.id,
          name: name.trim(),
          unitNumber: isLabour ? undefined : name.trim(),
          classification,
          rateId: matchedRate.id,
          rate: matchedRate,
        })
      }

      onClose()
    } catch (err) {
      setError('Failed to add: ' + err.message)
    }
    setSaving(false)
  }

  const modalContent = (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 20000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white', borderRadius: 8, padding: '24px',
        maxWidth: 480, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 16, color: '#1e3a5f' }}>
            Add to Master {isLabour ? 'Personnel' : 'Equipment'}
          </h3>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Project: {projectName || 'Loading...'}
          </div>
        </div>

        {/* Name / Unit Number field */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            {isLabour ? 'Name' : 'Unit Number'} *
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>

        {/* Classification dropdown */}
        <div style={{ marginBottom: 14, position: 'relative' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Classification *
          </label>
          <div
            onClick={() => setShowClassDropdown(true)}
            style={{
              width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 4,
              fontSize: 14, boxSizing: 'border-box', cursor: 'pointer', backgroundColor: '#fff',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 38,
            }}
          >
            {showClassDropdown ? (
              <input
                type="text"
                value={classFilter}
                onChange={e => setClassFilter(e.target.value)}
                placeholder="Type to search..."
                autoFocus
                style={{ border: 'none', outline: 'none', width: '100%', fontSize: 14, padding: 0 }}
                onKeyDown={e => { if (e.key === 'Escape') setShowClassDropdown(false) }}
              />
            ) : (
              <span style={{ color: classification ? '#333' : '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {classification || 'Select classification...'}
              </span>
            )}
            <span style={{ color: '#666', marginLeft: 8 }}>▼</span>
          </div>
          {showClassDropdown && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              maxHeight: 200, overflowY: 'auto', backgroundColor: 'white',
              border: '1px solid #d1d5db', borderRadius: '0 0 4px 4px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}>
              {filteredClasses.length === 0 ? (
                <div style={{ padding: 10, color: '#999', textAlign: 'center', fontSize: 13 }}>No matches</div>
              ) : (
                filteredClasses.slice(0, 50).map((cls, i) => (
                  <div
                    key={cls}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      setClassification(cls)
                      setShowClassDropdown(false)
                      setClassFilter('')
                    }}
                    style={{
                      padding: '8px 10px', fontSize: 13, cursor: 'pointer',
                      backgroundColor: cls === classification ? '#e3f2fd' : i % 2 === 0 ? '#f9fafb' : '#fff',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                    onMouseEnter={e => e.target.style.backgroundColor = '#dbeafe'}
                    onMouseLeave={e => e.target.style.backgroundColor = cls === classification ? '#e3f2fd' : i % 2 === 0 ? '#f9fafb' : '#fff'}
                  >
                    {cls}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Rate Card (read-only) */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Rate Card</label>
          <div style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 4, backgroundColor: '#f9fafb', fontSize: 13, color: '#374151' }}>
            {matchedRate
              ? isLabour
                ? `${matchedRate.rate_type === 'weekly' ? 'Weekly' : 'Hourly'}: ST $${matchedRate.rate_st} | OT $${matchedRate.rate_ot}${matchedRate.rate_dt ? ` | DT $${matchedRate.rate_dt}` : ''}`
                : `Daily: $${matchedRate.rate_daily || matchedRate.rate_hourly || 0}`
              : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Select a classification to see rate</span>
            }
          </div>
        </div>

        {/* Active checkbox */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            Active
          </label>
        </div>

        {/* Warning */}
        <div style={{ padding: '8px 10px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, fontSize: 11, color: '#92400e', marginBottom: 16 }}>
          ⚠ This adds a permanent record to the project master. You can deactivate later but cannot fully delete if any reports reference this record.
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '8px 10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, fontSize: 12, color: '#dc2626', marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 16px', backgroundColor: saving ? '#9ca3af' : '#059669', color: 'white',
              border: 'none', borderRadius: 4, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {saving ? 'Adding...' : 'Add to Master'}
          </button>
        </div>
      </div>
    </div>
  )

  return ReactDOM.createPortal(modalContent, document.body)
}
