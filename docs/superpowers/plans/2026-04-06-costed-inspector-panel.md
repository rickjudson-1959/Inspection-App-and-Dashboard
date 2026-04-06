# Costed Inspector Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cost columns to the Inspector Report panel (Panel 4 in the 4-panel reconciliation view) with inline editing, a learning alias system backed by a Supabase table, and hide the VarianceComparisonPanel behind a toggle.

**Architecture:** InspectorReportPanel.jsx gets rate card loading, alias lookup, cost calculation, inline editing with audit logging, and a learning prompt. ReconFourPanelView.jsx passes new props and wraps VarianceComparisonPanel in a toggle. A new `classification_aliases` Supabase table stores learned mappings. No new components are created — this is all enhancement of existing files.

**Tech Stack:** React 18, Supabase (PostgreSQL + RLS), `/api/rates` serverless endpoint (Vercel), `report_audit_log` table for audit trail.

**Spec:** `docs/superpowers/specs/2026-04-06-costed-inspector-panel-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `supabase/migrations/20260406_classification_aliases.sql` | New DB table for learned alias mappings | Create |
| `src/Components/Reconciliation/InspectorReportPanel.jsx` | Panel 4: inspector data with costs, inline editing, alias learning | Modify (currently 146 lines, read-only) |
| `src/Components/Reconciliation/DocumentPanel.jsx` | Passes new props through to InspectorReportPanel | Modify (add props pass-through) |
| `src/Components/Reconciliation/ReconFourPanelView.jsx` | Loads rate cards + aliases, passes to Panel 4, toggles variance panel | Modify |

---

## Task 1: Create classification_aliases migration

**Files:**
- Create: `supabase/migrations/20260406_classification_aliases.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Classification Aliases — Learning alias system for rate card matching
-- Admin corrections are saved here so the system learns over time

CREATE TABLE IF NOT EXISTS classification_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  alias_type TEXT NOT NULL CHECK (alias_type IN ('labour', 'equipment')),
  original_value TEXT NOT NULL,
  mapped_value TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- One mapping per original value per org per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_classification_aliases_unique
  ON classification_aliases (organization_id, alias_type, lower(original_value));

-- RLS
ALTER TABLE classification_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read aliases"
  ON classification_aliases FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert aliases"
  ON classification_aliases FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update aliases"
  ON classification_aliases FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Copy the SQL above and paste it into the Supabase SQL Editor at the project dashboard. Run it. Verify the table exists with:

```sql
SELECT * FROM classification_aliases LIMIT 0;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260406_classification_aliases.sql
git commit -m "feat: add classification_aliases table for learning rate card mappings"
```

---

## Task 2: Load rate cards and aliases in ReconFourPanelView

**Files:**
- Modify: `src/Components/Reconciliation/ReconFourPanelView.jsx`

This task adds rate card loading and alias loading to the parent view, then passes them down to DocumentPanel → InspectorReportPanel. It also wraps VarianceComparisonPanel in a toggle.

- [ ] **Step 1: Add state and loading for rate cards and aliases**

At the top of the component, after the existing state declarations (after line 36 `const [meta, setMeta] = useState(...)`), add:

```jsx
const [labourRates, setLabourRates] = useState([])
const [equipmentRates, setEquipmentRates] = useState([])
const [aliases, setAliases] = useState([])
const [showVariance, setShowVariance] = useState(false)
```

- [ ] **Step 2: Load rate cards and aliases inside loadAllData()**

At the end of the `loadAllData()` function, before `setLoading(false)` (before line 116), add:

```jsx
// --- Load rate cards ---
try {
  const lr = await fetch(`/api/rates?table=labour_rates&organization_id=${organizationId}`)
  if (lr.ok) { const d = await lr.json(); if (Array.isArray(d)) setLabourRates(d) }
  const er = await fetch(`/api/rates?table=equipment_rates&organization_id=${organizationId}`)
  if (er.ok) { const d = await er.json(); if (Array.isArray(d)) setEquipmentRates(d) }
} catch (e) { console.error('Failed to load rate cards:', e) }

// --- Load learned aliases ---
try {
  let aq = supabase.from('classification_aliases').select('*')
  aq = addOrgFilter(aq, true)
  const { data: aliasRows } = await aq
  setAliases(aliasRows || [])
} catch (e) { console.error('Failed to load aliases:', e) }
```

- [ ] **Step 3: Pass rate data through DocumentPanel to InspectorReportPanel**

Change the Panel 4 `<DocumentPanel>` call (around line 205-213) to pass additional props:

```jsx
{/* Panel 4: Inspector Report (formatted data view — NOT uploaded) */}
<DocumentPanel
  title="Inspector Report"
  subtitle="Manpower & equipment costs"
  panelType="report"
  reportData={reportPanel}
  emptyMessage="No inspector report found for this ticket number"
  color="#059669"
  labourRates={labourRates}
  equipmentRates={equipmentRates}
  aliases={aliases}
  organizationId={organizationId}
  onBlockChange={async (updatedBlock, auditEntries) => {
    if (!inspectorReport) return
    const blocks = [...(inspectorReport.activity_blocks || [])]
    const blockIdx = blocks.findIndex(b =>
      b.ticketNumber && String(b.ticketNumber).trim() === String(ticketNumber).trim()
    )
    if (blockIdx >= 0) {
      blocks[blockIdx] = updatedBlock
      await supabase.from('daily_reports')
        .update({ activity_blocks: blocks })
        .eq('id', inspectorReport.id)
      // Audit log each change
      for (const entry of (auditEntries || [])) {
        await supabase.from('report_audit_log').insert({
          report_id: inspectorReport.id,
          report_date: inspectorReport.date,
          changed_by_name: 'Cost Control',
          changed_by_role: 'admin',
          change_type: 'reconciliation_edit',
          section: 'Inspector Report Panel',
          field_name: entry.field,
          old_value: String(entry.oldValue),
          new_value: String(entry.newValue),
          organization_id: organizationId
        })
      }
      setMatchedBlock(updatedBlock)
      setInspectorReport(prev => ({ ...prev, activity_blocks: blocks }))
    }
  }}
  onAliasCreated={(alias) => setAliases(prev => [...prev, alias])}
/>
```

- [ ] **Step 4: Wrap VarianceComparisonPanel in a toggle**

Replace the VarianceComparisonPanel section (lines 216-255) with:

```jsx
{/* LEM Comparison toggle — only show button when LEM data exists */}
{lemData && (
  <div style={{ textAlign: 'center' }}>
    <button
      onClick={() => setShowVariance(v => !v)}
      style={{
        padding: '6px 16px',
        backgroundColor: showVariance ? '#6b7280' : '#1e3a5f',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: '600',
      }}
    >
      {showVariance ? 'Hide LEM Comparison' : 'Show LEM Comparison'}
    </button>
  </div>
)}

{showVariance && (
  <VarianceComparisonPanel
    ticketNumber={ticketNumber}
    lemData={lemData}
    inspectorBlock={matchedBlock}
    organizationId={organizationId}
    onInspectorBlockChange={async (updatedBlock) => {
      if (!inspectorReport) return
      const blocks = [...(inspectorReport.activity_blocks || [])]
      const blockIdx = blocks.findIndex(b =>
        b.ticketNumber && String(b.ticketNumber).trim() === String(ticketNumber).trim()
      )
      if (blockIdx >= 0) {
        blocks[blockIdx] = updatedBlock
        await supabase.from('daily_reports')
          .update({ activity_blocks: blocks })
          .eq('id', inspectorReport.id)
        await supabase.from('report_audit_log').insert({
          report_id: inspectorReport.id,
          report_date: inspectorReport.date,
          changed_by_name: 'Cost Control',
          changed_by_role: 'admin',
          change_type: 'reconciliation_edit',
          section: 'Reconciliation Variance',
          field_name: `Ticket #${ticketNumber} inspector data`,
          new_value: 'Edited from variance comparison panel',
          organization_id: organizationId
        })
        setMatchedBlock(updatedBlock)
        setInspectorReport(prev => ({ ...prev, activity_blocks: blocks }))
      }
    }}
    uploadedLemUrls={panels.lem?.file_urls || []}
    uploadedLemDate={panels.lem?.date || meta.date || null}
    uploadedLemForeman={panels.lem?.foreman || meta.foreman || null}
    onLemDataExtracted={() => loadAllData()}
  />
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/Components/Reconciliation/ReconFourPanelView.jsx
git commit -m "feat: load rate cards/aliases in ReconFourPanelView, toggle variance panel"
```

---

## Task 3: Pass new props through DocumentPanel

**Files:**
- Modify: `src/Components/Reconciliation/DocumentPanel.jsx`

DocumentPanel needs to accept and forward the new rate/alias/editing props to InspectorReportPanel.

- [ ] **Step 1: Add new props to DocumentPanel signature**

Change the props destructuring (line 30-39) to:

```jsx
export default function DocumentPanel({
  title,
  subtitle,
  panelType = 'uploaded',
  document,
  reportData,
  emptyMessage = 'No document uploaded',
  onUpload,
  color = '#2563eb',
  labourRates,
  equipmentRates,
  aliases,
  organizationId,
  onBlockChange,
  onAliasCreated,
}) {
```

- [ ] **Step 2: Pass props to InspectorReportPanel**

Change the `renderContent` function where it renders InspectorReportPanel (around line 104-106) from:

```jsx
return reportData ? (
  <InspectorReportPanel report={reportData.report} block={reportData.block} />
) : (
```

To:

```jsx
return reportData ? (
  <InspectorReportPanel
    report={reportData.report}
    block={reportData.block}
    labourRates={labourRates || []}
    equipmentRates={equipmentRates || []}
    aliases={aliases || []}
    organizationId={organizationId}
    onBlockChange={onBlockChange}
    onAliasCreated={onAliasCreated}
  />
) : (
```

- [ ] **Step 3: Commit**

```bash
git add src/Components/Reconciliation/DocumentPanel.jsx
git commit -m "feat: pass rate card and alias props through DocumentPanel to InspectorReportPanel"
```

---

## Task 4: Rewrite InspectorReportPanel with costs and inline editing

**Files:**
- Modify: `src/Components/Reconciliation/InspectorReportPanel.jsx`

This is the main task. The panel goes from a 146-line read-only table to an inline-editable costed view with alias learning.

- [ ] **Step 1: Rewrite InspectorReportPanel.jsx**

Replace the entire file with the following implementation. Key changes from the current version:
- Accepts `labourRates`, `equipmentRates`, `aliases`, `organizationId`, `onBlockChange`, `onAliasCreated` props
- Rate lookup function: checks aliases first, then exact match, then case-insensitive contains
- Cost columns on both labour and equipment tables
- Summary footer with Labour Total, Equipment Total, Grand Total
- Inline click-to-edit on all fields
- Classification/equipment type fields open a searchable dropdown of rate card entries
- On classification change: prompt "Save this mapping?" if original value differs from mapped value
- All edits call `onBlockChange(updatedBlock, auditEntries)` which saves to `daily_reports` and audit logs

```jsx
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../../supabase'

export default function InspectorReportPanel({ report, block, labourRates = [], equipmentRates = [], aliases = [], organizationId, onBlockChange, onAliasCreated }) {
  const [editingCell, setEditingCell] = useState(null) // { section, rowIdx, field }
  const [editValue, setEditValue] = useState('')
  const [dropdownFilter, setDropdownFilter] = useState('')
  const [showAliasPrompt, setShowAliasPrompt] = useState(null) // { originalValue, mappedValue, aliasType }
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus()
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
    const hrRate = parseFloat(rate.rate || rate.hourly_rate || 0)
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
  function startEdit(section, rowIdx, field, currentValue) {
    setEditingCell({ section, rowIdx, field })
    setEditValue(currentValue || '')
    setDropdownFilter('')
  }

  function commitEdit(newValue) {
    if (!editingCell || !onBlockChange) return
    const { section, rowIdx, field } = editingCell
    const entries = section === 'labour' ? [...labourEntries] : [...equipmentEntries]
    const entry = { ...entries[rowIdx] }
    const oldValue = section === 'labour'
      ? (entry[field] || entry.employeeName || '')
      : (entry[field] || '')

    // Map field names to actual entry keys
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
      // Check if alias already exists (unique index is on lower(original_value))
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

  // --- Editable cell renderer ---
  function EditableCell({ section, rowIdx, field, value, style, isDropdown, dropdownItems, dropdownKey }) {
    const isEditing = editingCell?.section === section && editingCell?.rowIdx === rowIdx && editingCell?.field === field

    if (isEditing && isDropdown) {
      const filtered = (dropdownItems || []).filter(item => {
        const name = (item[dropdownKey] || '').toLowerCase()
        return name.includes(dropdownFilter.toLowerCase())
      })
      return (
        <td style={{ ...style, padding: 0, position: 'relative' }} ref={dropdownRef}>
          <input
            ref={inputRef}
            value={dropdownFilter}
            onChange={e => setDropdownFilter(e.target.value)}
            placeholder="Search..."
            style={{ width: '100%', padding: '4px 6px', fontSize: 12, border: '2px solid #3b82f6', borderRadius: 3, boxSizing: 'border-box' }}
          />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            maxHeight: 200, overflowY: 'auto', backgroundColor: 'white',
            border: '1px solid #d1d5db', borderRadius: '0 0 4px 4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            {filtered.slice(0, 50).map((item, i) => (
              <div
                key={i}
                onClick={() => handleClassificationSelect(section, rowIdx, item[dropdownKey])}
                style={{
                  padding: '6px 8px', fontSize: 12, cursor: 'pointer',
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
          </div>
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
            onBlur={() => commitEdit(editValue)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit(editValue)
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
        onClick={() => startEdit(section, rowIdx, field, value)}
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
                    <EditableCell section="labour" rowIdx={i} field="name" value={e.employeeName || e.employee_name || e.name || ''} style={cellStyle} />
                    <EditableCell section="labour" rowIdx={i} field="classification" value={e.classification || ''}
                      style={{ ...cellStyle, color: '#6b7280' }}
                      isDropdown dropdownItems={labourRates} dropdownKey="classification" />
                    <EditableCell section="labour" rowIdx={i} field="rt" value={String(e.rt || e.hours || 0)} style={{ ...cellStyle, textAlign: 'right' }} />
                    <EditableCell section="labour" rowIdx={i} field="ot" value={String(e.ot || 0)} style={{ ...cellStyle, textAlign: 'right' }} />
                    <EditableCell section="labour" rowIdx={i} field="jh" value={String(e.jh || 0)} style={{ ...cellStyle, textAlign: 'right' }} />
                    <EditableCell section="labour" rowIdx={i} field="count" value={String(e.count || 1)} style={{ ...cellStyle, textAlign: 'right' }} />
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
                    <EditableCell section="equipment" rowIdx={i} field="type" value={e.type || e.equipment_type || ''}
                      style={cellStyle}
                      isDropdown dropdownItems={equipmentRates} dropdownKey={equipmentRates[0]?.equipment_type ? 'equipment_type' : 'type'} />
                    <EditableCell section="equipment" rowIdx={i} field="unitNumber" value={e.unitNumber || e.unit_number || ''} style={cellStyle} />
                    <EditableCell section="equipment" rowIdx={i} field="hours" value={String(e.hours || 0)} style={{ ...cellStyle, textAlign: 'right' }} />
                    <EditableCell section="equipment" rowIdx={i} field="count" value={String(e.count || 1)} style={{ ...cellStyle, textAlign: 'right' }} />
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

      {/* Source badge */}
      <div style={{ padding: '8px 12px', fontSize: 11, color: '#6b7280', fontStyle: 'italic', borderTop: '1px solid #e5e7eb' }}>
        Live data from inspector report — Report ID: {report.id}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the app builds**

Run: `npm run build` (or `npx vite build`)

Expected: Build completes with no errors.

- [ ] **Step 3: Manual test**

1. Navigate to any reconciliation ticket that has an inspector report (e.g., `/:orgSlug/reconciliation/:ticketNumber`)
2. Verify Panel 4 shows Rate and Cost columns
3. Verify the summary footer shows Labour Total, Equipment Total, Grand Total
4. Click a classification — verify dropdown appears with rate card entries
5. Select a different classification — verify cost recalculates and alias prompt appears
6. Click Yes on alias prompt — verify it saves (check `classification_aliases` table in Supabase)
7. Click a name or hours field — verify inline edit works
8. Verify the VarianceComparisonPanel no longer appears by default
9. If LEM data exists, verify "Show LEM Comparison" button appears and toggles the panel

- [ ] **Step 4: Commit**

```bash
git add src/Components/Reconciliation/InspectorReportPanel.jsx
git commit -m "feat: costed inspector panel with inline editing and alias learning"
```

---

## Task 5: Final integration commit and push

- [ ] **Step 1: Verify all changes work together**

Run: `npm run build`

- [ ] **Step 2: Push to origin**

```bash
git push origin main
```

Vercel auto-deploys on push to main. Verify the live site at https://app.pipe-up.ca after deploy completes.
