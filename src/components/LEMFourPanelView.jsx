import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../supabase'

/**
 * Zoomable image panel — supports multi-page scroll, click-to-fullscreen
 */
function ImagePanel({ title, titleColor, borderColor, bgColor, urls, emptyText, claimedData }) {
  const [zoom, setZoom] = useState(1)
  const [fullscreen, setFullscreen] = useState(null) // index of fullscreen image
  const containerRef = useRef(null)

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setZoom(z => Math.max(0.5, Math.min(5, z + (e.deltaY > 0 ? -0.2 : 0.2))))
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (el) el.addEventListener('wheel', handleWheel, { passive: false })
    return () => { if (el) el.removeEventListener('wheel', handleWheel) }
  }, [handleWheel])

  const images = (urls || []).filter(Boolean)

  return (
    <div style={{ backgroundColor: bgColor, borderRadius: '8px', border: `2px solid ${borderColor}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 14px 6px', borderBottom: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, color: titleColor, fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>{title}</h4>
        {images.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', color: '#6b7280' }}>{images.length} page{images.length !== 1 ? 's' : ''}</span>
            <button onClick={() => setZoom(z => Math.min(5, z + 0.3))} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '3px', cursor: 'pointer', padding: '1px 5px', fontSize: '12px' }}>+</button>
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.3))} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '3px', cursor: 'pointer', padding: '1px 5px', fontSize: '12px' }}>-</button>
            <button onClick={() => setZoom(1)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '3px', cursor: 'pointer', padding: '1px 5px', fontSize: '10px' }}>1:1</button>
          </div>
        )}
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto', padding: '8px', minHeight: '200px', maxHeight: '70vh' }}>
        {images.length === 0 ? (
          <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '12px', textAlign: 'center', marginTop: '40px' }}>{emptyText}</p>
        ) : (
          images.map((url, idx) => (
            <div key={idx} style={{ marginBottom: '8px', textAlign: 'center' }}>
              {images.length > 1 && <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>Page {idx + 1} of {images.length}</div>}
              <img
                src={url}
                alt={`${title} page ${idx + 1}`}
                style={{ maxWidth: `${zoom * 100}%`, height: 'auto', borderRadius: '4px', cursor: 'pointer', transition: 'max-width 0.15s' }}
                onClick={() => setFullscreen(idx)}
              />
            </div>
          ))
        )}
      </div>

      {/* Claimed data summary (from LEM OCR extraction) */}
      {claimedData && (claimedData.labour?.length > 0 || claimedData.equipment?.length > 0) && (
        <div style={{ borderTop: `1px solid ${borderColor}`, padding: '6px 8px', fontSize: '10px', maxHeight: '35%', overflow: 'auto' }}>
          <div style={{ fontWeight: '700', color: titleColor, marginBottom: '3px' }}>
            Claimed: ${(claimedData.totals?.grand_total || 0).toLocaleString()}
            <span style={{ fontWeight: '400', color: '#6b7280', marginLeft: '8px' }}>
              {claimedData.labour?.length || 0} labour, {claimedData.equipment?.length || 0} equipment
            </span>
          </div>
          {claimedData.labour?.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '1px 3px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '1px 3px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>Class</th>
                  <th style={{ textAlign: 'right', padding: '1px 3px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>RT</th>
                  <th style={{ textAlign: 'right', padding: '1px 3px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>OT</th>
                  <th style={{ textAlign: 'right', padding: '1px 3px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>$</th>
                </tr>
              </thead>
              <tbody>
                {claimedData.labour.map((l, i) => (
                  <tr key={i}>
                    <td style={{ padding: '1px 3px' }}>{l.employee_name}</td>
                    <td style={{ padding: '1px 3px', color: '#6b7280' }}>{l.classification}</td>
                    <td style={{ padding: '1px 3px', textAlign: 'right' }}>{l.rt_hours || 0}</td>
                    <td style={{ padding: '1px 3px', textAlign: 'right' }}>{l.ot_hours || 0}</td>
                    <td style={{ padding: '1px 3px', textAlign: 'right', fontWeight: '500' }}>${(l.line_total || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {claimedData.equipment?.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '1px 3px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>Equipment</th>
                  <th style={{ textAlign: 'right', padding: '1px 3px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>Hrs</th>
                  <th style={{ textAlign: 'right', padding: '1px 3px', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>$</th>
                </tr>
              </thead>
              <tbody>
                {claimedData.equipment.map((e, i) => (
                  <tr key={i}>
                    <td style={{ padding: '1px 3px' }}>{e.equipment_type} {e.unit_number ? `(${e.unit_number})` : ''}</td>
                    <td style={{ padding: '1px 3px', textAlign: 'right' }}>{e.hours || 0}</td>
                    <td style={{ padding: '1px 3px', textAlign: 'right', fontWeight: '500' }}>${(e.line_total || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Fullscreen overlay */}
      {fullscreen !== null && (
        <div onClick={() => setFullscreen(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={images[fullscreen]} alt="Fullscreen" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain' }} />
          <div style={{ position: 'absolute', top: '20px', right: '20px', color: 'white', fontSize: '14px', opacity: 0.7 }}>Click anywhere to close</div>
          {images.length > 1 && (
            <div style={{ position: 'absolute', bottom: '20px', display: 'flex', gap: '12px' }}>
              <button onClick={(e) => { e.stopPropagation(); setFullscreen(Math.max(0, fullscreen - 1)) }}
                disabled={fullscreen === 0}
                style={{ padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>Prev</button>
              <span style={{ color: 'white', alignSelf: 'center' }}>Page {fullscreen + 1} of {images.length}</span>
              <button onClick={(e) => { e.stopPropagation(); setFullscreen(Math.min(images.length - 1, fullscreen + 1)) }}
                disabled={fullscreen === images.length - 1}
                style={{ padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Editable Panel 4 — shows inspector report data or system-calculated costs
 * with inline editing capability and live rate card costing.
 * All edits are audit-logged.
 */
function EditableDataPanel({ report, block, standaloneTicket, labourRates, equipmentRates, onDataChange }) {
  const [labourEntries, setLabourEntries] = useState([])
  const [equipmentEntries, setEquipmentEntries] = useState([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Source label
  const source = report ? 'Inspector Report' : standaloneTicket ? 'Admin Entry' : null
  const sourceDate = report?.date || standaloneTicket?.work_date || null
  const sourceAuthor = report?.inspector_name || (standaloneTicket ? 'Cost Control' : null)

  // Initialize entries from data source
  useEffect(() => {
    if (block) {
      setLabourEntries((block.labourEntries || []).map((e, i) => ({ ...e, _idx: i })))
      setEquipmentEntries((block.equipmentEntries || []).map((e, i) => ({ ...e, _idx: i })))
    } else if (standaloneTicket) {
      setLabourEntries((standaloneTicket.labour_entries || []).map((e, i) => ({ ...e, _idx: i })))
      setEquipmentEntries((standaloneTicket.equipment_entries || []).map((e, i) => ({ ...e, _idx: i })))
    } else {
      setLabourEntries([])
      setEquipmentEntries([])
    }
    setDirty(false)
    setSaved(false)
  }, [block, standaloneTicket])

  // Rate card matching (fuzzy)
  function findRate(name, rates) {
    if (!name || !rates?.length) return null
    const s = name.toLowerCase().trim()
    return rates.find(r => {
      const k = (r.classification || r.equipment_type || '').toLowerCase().trim()
      return k === s
    }) || rates.find(r => {
      const k = (r.classification || r.equipment_type || '').toLowerCase().trim()
      return k.includes(s) || s.includes(k)
    }) || null
  }

  function calcLabourCost(entry) {
    const rate = findRate(entry.classification || entry.name, labourRates)
    if (!rate) return 0
    const rt = parseFloat(entry.rt || entry.hours || 0)
    const ot = parseFloat(entry.ot || 0)
    return (rt * (parseFloat(rate.rate_st) || 0)) + (ot * (parseFloat(rate.rate_ot || rate.rate_st) || 0))
  }

  function calcEquipCost(entry) {
    const rate = findRate(entry.equipment_type || entry.type, equipmentRates)
    if (!rate) return 0
    return parseFloat(entry.hours || 0) * (parseFloat(rate.rate) || 0)
  }

  function updateLabour(idx, field, value) {
    setLabourEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
    setDirty(true)
    setSaved(false)
  }

  function updateEquipment(idx, field, value) {
    setEquipmentEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
    setDirty(true)
    setSaved(false)
  }

  // Totals
  const totalLabourCost = labourEntries.reduce((s, e) => s + calcLabourCost(e) * (parseInt(e.count || 1)), 0)
  const totalEquipCost = equipmentEntries.reduce((s, e) => s + calcEquipCost(e) * (parseInt(e.count || 1)), 0)
  const totalLabourHrs = labourEntries.reduce((s, e) => s + (parseFloat(e.rt || e.hours || 0) + parseFloat(e.ot || 0)) * (parseInt(e.count || 1)), 0)
  const totalEquipHrs = equipmentEntries.reduce((s, e) => s + parseFloat(e.hours || 0) * (parseInt(e.count || 1)), 0)

  async function handleSave() {
    setSaving(true)
    try {
      if (report && block && onDataChange) {
        await onDataChange({
          type: 'inspector_report',
          reportId: report.id,
          labourEntries: labourEntries.map(({ _idx, ...e }) => e),
          equipmentEntries: equipmentEntries.map(({ _idx, ...e }) => e)
        })
      } else if (standaloneTicket && onDataChange) {
        await onDataChange({
          type: 'standalone_ticket',
          ticketId: standaloneTicket.id,
          labourEntries: labourEntries.map(({ _idx, ...e }) => e),
          equipmentEntries: equipmentEntries.map(({ _idx, ...e }) => e)
        })
      }
      setDirty(false)
      setSaved(true)
    } catch (err) {
      console.error('Panel 4 save error:', err)
    }
    setSaving(false)
  }

  const cellStyle = { padding: '3px 4px', fontSize: '11px', border: '1px solid #e5e7eb' }
  const inputStyle = { width: '100%', padding: '2px 4px', fontSize: '11px', border: '1px solid #d1d5db', borderRadius: '2px', boxSizing: 'border-box' }
  const numInputStyle = { ...inputStyle, width: '50px', textAlign: 'right' }

  if (!source) {
    return (
      <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', border: '2px solid #059669', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid #059669' }}>
          <h4 style={{ margin: 0, color: '#166534', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>Our Data</h4>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
          <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '12px', textAlign: 'center' }}>No matching data source found</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', border: '2px solid #059669', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid #059669', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, color: '#166534', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>
          {source}
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {sourceDate && <span style={{ fontSize: '10px', color: '#6b7280' }}>{sourceDate}</span>}
          {sourceAuthor && <span style={{ fontSize: '10px', color: '#6b7280' }}>| {sourceAuthor}</span>}
          {dirty && (
            <button onClick={handleSave} disabled={saving}
              style={{ fontSize: '10px', padding: '2px 8px', backgroundColor: saving ? '#9ca3af' : '#059669', color: 'white', border: 'none', borderRadius: '3px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          {saved && <span style={{ fontSize: '10px', color: '#059669', fontWeight: '600' }}>Saved</span>}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '6px', fontSize: '11px' }}>
        {/* Labour table */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontWeight: '700', color: '#374151', marginBottom: '4px', fontSize: '11px' }}>
            Labour ({labourEntries.length}) — {totalLabourHrs.toFixed(1)} hrs — ${totalLabourCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0fdf4' }}>
                <th style={{ ...cellStyle, textAlign: 'left', fontWeight: '600' }}>Name</th>
                <th style={{ ...cellStyle, textAlign: 'left', fontWeight: '600' }}>Classification</th>
                <th style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', width: '45px' }}>RT</th>
                <th style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', width: '45px' }}>OT</th>
                <th style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', width: '35px' }}>Qty</th>
                <th style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', width: '65px' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {labourEntries.map((e, i) => {
                const cost = calcLabourCost(e) * (parseInt(e.count || 1))
                const hasRate = !!findRate(e.classification || e.name, labourRates)
                return (
                  <tr key={i}>
                    <td style={cellStyle}>
                      <input value={e.employee_name || e.name || ''} onChange={ev => updateLabour(i, e.employee_name !== undefined ? 'employee_name' : 'name', ev.target.value)} style={inputStyle} />
                    </td>
                    <td style={cellStyle}>
                      <input value={e.classification || ''} onChange={ev => updateLabour(i, 'classification', ev.target.value)} style={{ ...inputStyle, color: hasRate ? '#059669' : '#dc2626' }} />
                    </td>
                    <td style={cellStyle}>
                      <input type="number" value={e.rt || e.hours || ''} onChange={ev => updateLabour(i, e.rt !== undefined ? 'rt' : 'hours', ev.target.value)} style={numInputStyle} />
                    </td>
                    <td style={cellStyle}>
                      <input type="number" value={e.ot || ''} onChange={ev => updateLabour(i, 'ot', ev.target.value)} style={numInputStyle} />
                    </td>
                    <td style={cellStyle}>
                      <input type="number" value={e.count || '1'} onChange={ev => updateLabour(i, 'count', ev.target.value)} style={{ ...numInputStyle, width: '35px' }} />
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '500', color: hasRate ? '#059669' : '#dc2626' }}>
                      ${cost.toFixed(0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Equipment table */}
        <div>
          <div style={{ fontWeight: '700', color: '#374151', marginBottom: '4px', fontSize: '11px' }}>
            Equipment ({equipmentEntries.length}) — {totalEquipHrs.toFixed(1)} hrs — ${totalEquipCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0fdf4' }}>
                <th style={{ ...cellStyle, textAlign: 'left', fontWeight: '600' }}>Type</th>
                <th style={{ ...cellStyle, textAlign: 'left', fontWeight: '600', width: '60px' }}>Unit #</th>
                <th style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', width: '45px' }}>Hrs</th>
                <th style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', width: '35px' }}>Qty</th>
                <th style={{ ...cellStyle, textAlign: 'right', fontWeight: '600', width: '65px' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {equipmentEntries.map((e, i) => {
                const cost = calcEquipCost(e) * (parseInt(e.count || 1))
                const hasRate = !!findRate(e.equipment_type || e.type, equipmentRates)
                return (
                  <tr key={i}>
                    <td style={cellStyle}>
                      <input value={e.equipment_type || e.type || ''} onChange={ev => updateEquipment(i, e.equipment_type !== undefined ? 'equipment_type' : 'type', ev.target.value)} style={{ ...inputStyle, color: hasRate ? '#059669' : '#dc2626' }} />
                    </td>
                    <td style={cellStyle}>
                      <input value={e.unit_number || e.unitNumber || ''} onChange={ev => updateEquipment(i, e.unit_number !== undefined ? 'unit_number' : 'unitNumber', ev.target.value)} style={inputStyle} />
                    </td>
                    <td style={cellStyle}>
                      <input type="number" value={e.hours || ''} onChange={ev => updateEquipment(i, 'hours', ev.target.value)} style={numInputStyle} />
                    </td>
                    <td style={cellStyle}>
                      <input type="number" value={e.count || '1'} onChange={ev => updateEquipment(i, 'count', ev.target.value)} style={{ ...numInputStyle, width: '35px' }} />
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '500', color: hasRate ? '#059669' : '#dc2626' }}>
                      ${cost.toFixed(0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Totals bar */}
        <div style={{ marginTop: '8px', padding: '6px 8px', backgroundColor: '#dcfce7', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '12px', color: '#166534' }}>
          <span>Total: ${(totalLabourCost + totalEquipCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span>{(totalLabourHrs + totalEquipHrs).toFixed(1)} hrs</span>
        </div>
      </div>
    </div>
  )
}

/**
 * LEMFourPanelView — The core visual reconciliation component
 * Shows four panels: Contractor LEM, Contractor Ticket, Our Photo, Inspector Data
 */
export default function LEMFourPanelView({
  pairs,
  selectedPairIndex,
  onSelectPair,
  onResolve,
  reports,
  saving,
  poNumber,
  contractorName,
  labourRates = [],
  equipmentRates = [],
  standaloneTickets = [],
  onPanel4DataChange
}) {
  const [resolution, setResolution] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const pair = pairs[selectedPairIndex] || null

  // Match ALL pairs to inspector reports in one pass, so each block is claimed only once., so each block is claimed only once.
  // This prevents multiple pairs from showing the same ticket photo.
  const allMatches = useMemo(() => {
    if (!pairs.length || !reports.length) return []

    const pairContractor = (contractorName || '').toLowerCase().trim()

    function crewScore(blockContractor, pairCrew) {
      if (!blockContractor) return 0
      const bc = blockContractor.toLowerCase().trim()
      let best = 0
      for (const search of [pairCrew, pairContractor]) {
        if (!search) continue
        if (bc === search) { best = Math.max(best, 10); continue }
        const sWords = search.split(/\s+/).filter(w => w.length > 2)
        const bWords = bc.split(/\s+/).filter(w => w.length > 2)
        const shared = sWords.filter(sw => bWords.some(bw => bw.includes(sw) || sw.includes(bw))).length
        if (shared >= 2) { best = Math.max(best, 5 + shared); continue }
        if (shared === 1) { best = Math.max(best, 3); continue }
        const firstWord = search.split(/\s+/)[0]
        if (firstWord && firstWord.length > 2 && (bc.includes(firstWord) || search.includes(bc.split(/\s+/)[0]))) {
          best = Math.max(best, 1)
        }
      }
      return best
    }

    // Foreman matching: pair.crew_name (which Vision extracts as foreman) vs block.foreman
    function foremanScore(blockForeman, pairCrew) {
      if (!blockForeman || !pairCrew) return 0
      const bf = blockForeman.toLowerCase().trim()
      const pc = pairCrew.toLowerCase().trim()
      if (bf === pc) return 15 // exact foreman match is strongest signal
      // Check if last names match (most reliable for partial matches)
      const bfWords = bf.split(/\s+/).filter(w => w.length > 2)
      const pcWords = pc.split(/\s+/).filter(w => w.length > 2)
      const shared = pcWords.filter(pw => bfWords.some(bw => bw === pw)).length
      if (shared >= 1) return 12 // last name match
      // Fuzzy: substring match on any word
      const fuzzy = pcWords.filter(pw => bfWords.some(bw => bw.includes(pw) || pw.includes(bw))).length
      if (fuzzy >= 1) return 8
      return 0
    }

    // Track claimed report+block combos so no two pairs share a block
    const claimedBlocks = new Set() // "reportId:blockIdx"

    const matches = pairs.map(p => {
      // Pre-matched pairs use their stored match
      if (p.matched_report_id) {
        const report = reports.find(r => r.id === p.matched_report_id)
        if (report) {
          const key = `${report.id}:${p.matched_block_index}`
          claimedBlocks.add(key)
          return { report, block: report.activity_blocks?.[p.matched_block_index] || null }
        }
      }

      const pairCrew = (p.crew_name || '').toLowerCase().trim()

      // Helper: check if a date is within +/- 1 day of the pair date
      function isNearDate(reportDate) {
        if (!p.work_date || !reportDate) return false
        const pd = new Date(p.work_date + 'T00:00:00')
        const rd = new Date(reportDate + 'T00:00:00')
        return Math.abs(pd - rd) <= 86400000 // 1 day in ms
      }

      // Helper: score a block candidate
      function scoreBlock(report, block, bi, reason) {
        const key = `${report.id}:${bi}`
        if (claimedBlocks.has(key)) return null
        const cs = crewScore(block.contractor, pairCrew)
        const fs = foremanScore(block.foreman, pairCrew)
        const photos = block.ticketPhotos?.length > 0 ? block.ticketPhotos : block.ticketPhoto ? [block.ticketPhoto] : []
        const hasPhotos = photos.filter(Boolean).length > 0
        const hasPdf = !!report.pdf_storage_url
        let score = Math.max(cs, fs) + (hasPdf ? 2 : 0) + (hasPhotos ? 1 : 0)
        if (reason.startsWith('date') && (cs > 0 || fs > 0)) score += 10
        return { report, block, blockIdx: bi, score, reason: `${reason}(crew=${cs},foreman=${fs})` }
      }

      const candidates = []

      // Tier 1: Exact date match — all unclaimed blocks
      if (p.work_date) {
        const dateMatches = reports.filter(r => r.date === p.work_date)
        for (const report of dateMatches) {
          const blocks = report.activity_blocks || []
          for (let bi = 0; bi < blocks.length; bi++) {
            const c = scoreBlock(report, blocks[bi], bi, 'date')
            if (c) candidates.push(c)
          }
        }
      }

      // Tier 2: Near-date match (+/- 1 day) — only if no exact date candidates
      if (candidates.length === 0 && p.work_date) {
        const nearMatches = reports.filter(r => r.date !== p.work_date && isNearDate(r.date))
        for (const report of nearMatches) {
          const blocks = report.activity_blocks || []
          for (let bi = 0; bi < blocks.length; bi++) {
            const c = scoreBlock(report, blocks[bi], bi, 'near-date')
            if (c) { c.score = Math.max(0, c.score - 2); candidates.push(c) } // slight penalty
          }
        }
      }

      // Tier 3: Crew/foreman match across all reports — only if still nothing
      if (candidates.length === 0 && (pairCrew || pairContractor)) {
        for (const report of reports) {
          const blocks = report.activity_blocks || []
          for (let bi = 0; bi < blocks.length; bi++) {
            const cs = crewScore(blocks[bi].contractor, pairCrew)
            const fs = foremanScore(blocks[bi].foreman, pairCrew)
            if (cs > 0 || fs > 0) {
              const c = scoreBlock(report, blocks[bi], bi, 'crew-only')
              if (c) candidates.push(c)
            }
          }
        }
      }

      // Tier 4: Any unclaimed report with a PDF (last resort — at least show the PDF)
      if (candidates.length === 0 && p.work_date) {
        const dateMatches = reports.filter(r => r.date === p.work_date && r.pdf_storage_url)
        for (const report of dateMatches) {
          const blocks = report.activity_blocks || []
          for (let bi = 0; bi < blocks.length; bi++) {
            const key = `${report.id}:${bi}`
            if (!claimedBlocks.has(key)) {
              candidates.push({ report, block: blocks[bi], blockIdx: bi, score: 1, reason: 'date-any-block' })
            }
          }
          // If ALL blocks claimed, still offer the report (with block[0]) for the PDF panel
          if (candidates.length === 0 && blocks.length > 0) {
            candidates.push({ report, block: blocks[0], blockIdx: 0, score: 0, reason: 'date-pdf-only' })
          }
        }
      }

      // Pick best unclaimed candidate
      candidates.sort((a, b) => b.score - a.score)
      // Deduplicate: if same report+blockIdx appears multiple times, keep highest score
      const seen = new Set()
      const uniqueCandidates = candidates.filter(c => {
        const key = `${c.report.id}:${c.blockIdx}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      if (uniqueCandidates.length > 0) {
        const best = uniqueCandidates[0]
        const key = `${best.report.id}:${best.blockIdx}`
        claimedBlocks.add(key)
        console.log(`[LEM Match] Pair ${p.pair_index}: ✓ report ${best.report.id} block[${best.blockIdx}] score=${best.score} reason=${best.reason}`)
        return { report: best.report, block: best.block }
      }

      console.log(`[LEM Match] Pair ${p.pair_index}: ✗ No match`)
      return { report: null, block: null }
    })

    return matches
  }, [pairs, reports, contractorName])

  // Current pair's match
  const matchedReport = allMatches[selectedPairIndex]?.report || null
  const matchedBlock = allMatches[selectedPairIndex]?.block || null

  // Get ticket photos from matched block
  const ticketPhotoUrls = (() => {
    if (!matchedBlock) return []
    const photos = matchedBlock.ticketPhotos?.length > 0 ? matchedBlock.ticketPhotos : matchedBlock.ticketPhoto ? [matchedBlock.ticketPhoto] : []
    return photos.filter(Boolean).map(p => {
      if (typeof p === 'string' && p.startsWith('http')) return p
      if (typeof p === 'string') return supabase.storage.from('ticket-photos').getPublicUrl(p).data?.publicUrl
      return null
    }).filter(Boolean)
  })()

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      switch (e.key) {
        case 'ArrowRight': case 'n': case 'N':
          if (selectedPairIndex < pairs.length - 1) onSelectPair(selectedPairIndex + 1)
          break
        case 'ArrowLeft':
          if (selectedPairIndex > 0) onSelectPair(selectedPairIndex - 1)
          break
        case 'a': case 'A':
          if (pair && pair.status === 'pending') handleResolve('accepted')
          break
        case 'd': case 'D':
          // Don't auto-resolve dispute — needs notes
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedPairIndex, pairs.length, pair])

  function handleResolve(res, notes = '') {
    if (!pair) return
    onResolve(pair.id, res, notes)
    setResolution('')
    setResolutionNotes('')
    // Auto-advance to next pending
    const nextPending = pairs.findIndex((p, i) => i > selectedPairIndex && p.status === 'pending')
    if (nextPending >= 0) onSelectPair(nextPending)
  }

  // Pair list grouping by date
  const filteredPairs = statusFilter === 'all' ? pairs : pairs.filter(p => p.status === statusFilter)
  const pairsByDate = {}
  filteredPairs.forEach((p, origIdx) => {
    const date = p.work_date || 'Unknown Date'
    if (!pairsByDate[date]) pairsByDate[date] = []
    // Find original index in the full pairs array
    const realIdx = pairs.indexOf(p)
    pairsByDate[date].push({ ...p, _idx: realIdx })
  })

  const statusIcon = (status) => {
    switch (status) {
      case 'accepted': return { icon: 'Accepted', color: '#059669', bg: '#dcfce7' }
      case 'disputed': return { icon: 'Disputed', color: '#dc2626', bg: '#fee2e2' }
      case 'skipped': return { icon: 'Skipped', color: '#6b7280', bg: '#f3f4f6' }
      default: return { icon: 'Pending', color: '#d97706', bg: '#fef3c7' }
    }
  }

  const accepted = pairs.filter(p => p.status === 'accepted').length
  const disputed = pairs.filter(p => p.status === 'disputed').length
  const pending = pairs.filter(p => p.status === 'pending').length
  const skipped = pairs.filter(p => p.status === 'skipped').length
  const progress = pairs.length > 0 ? Math.round(((accepted + disputed) / pairs.length) * 100) : 0

  return (
    <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 200px)', minHeight: '600px' }}>
      {/* Left sidebar — pair list */}
      <div style={{ width: '280px', flexShrink: 0, backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Progress header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
            {accepted} accepted | {disputed} disputed | {pending} pending
          </div>
          <div style={{ height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, backgroundColor: progress === 100 ? '#059669' : '#2563eb', transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{progress}% reviewed</div>
        </div>

        {/* Filter */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {['all', 'pending', 'accepted', 'disputed', 'skipped'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              style={{ padding: '2px 8px', fontSize: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                backgroundColor: statusFilter === f ? '#2563eb' : '#f3f4f6',
                color: statusFilter === f ? 'white' : '#6b7280',
                fontWeight: statusFilter === f ? '600' : '400' }}>
              {f === 'all' ? `All (${pairs.length})` : `${f} (${pairs.filter(p => p.status === f).length})`}
            </button>
          ))}
        </div>

        {/* Pair list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {Object.entries(pairsByDate).map(([date, datePairs]) => (
            <div key={date}>
              <div style={{ padding: '6px 14px', backgroundColor: '#f9fafb', fontSize: '11px', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0 }}>
                {date}
              </div>
              {datePairs.map(p => {
                const si = statusIcon(p.status)
                const isSelected = p._idx === selectedPairIndex
                return (
                  <div key={p.id || p._idx} onClick={() => onSelectPair(p._idx)}
                    style={{
                      padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                      backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                      borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent'
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: isSelected ? '600' : '400', color: '#374151' }}>
                        {p.crew_name || `Pair ${p.pair_index + 1}`}
                      </span>
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', backgroundColor: si.bg, color: si.color, fontWeight: '500' }}>
                        {si.icon}
                      </span>
                    </div>
                    {p.crew_name && <div style={{ fontSize: '10px', color: '#9ca3af' }}>Pair #{p.pair_index + 1}</div>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Right content — four panels + resolution */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
        {!pair ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            Select a pair from the sidebar to begin review
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {poNumber && (
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#2563eb', marginRight: '8px', padding: '2px 8px', backgroundColor: '#dbeafe', borderRadius: '4px' }}>
                    {poNumber}
                  </span>
                )}
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  {pair.work_date || 'Unknown Date'} — {pair.crew_name || contractorName || `Pair #${pair.pair_index + 1}`}
                </span>
                <span style={{ marginLeft: '12px', fontSize: '11px', color: '#6b7280' }}>
                  Pair {selectedPairIndex + 1} of {pairs.length}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#9ca3af' }}>
                <span>A = Accept</span>
                <span>N/Arrow = Next</span>
                <span>Arrow Left = Prev</span>
              </div>
            </div>

            {/* Four panels — 2x2 grid */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '10px', minHeight: 0 }}>
              <ImagePanel
                title="Contractor LEM"
                titleColor="#854d0e"
                borderColor="#d97706"
                bgColor="#fefce8"
                urls={pair.lem_page_urls}
                emptyText="No LEM pages"
                claimedData={pair.lem_claimed_data}
              />
              <ImagePanel
                title="Contractor Daily Ticket"
                titleColor="#991b1b"
                borderColor="#dc2626"
                bgColor="#fef2f2"
                urls={pair.contractor_ticket_urls}
                emptyText="No ticket pages (missing)"
              />
              <ImagePanel
                title="Our Ticket Photo"
                titleColor="#374151"
                borderColor="#374151"
                bgColor="#f9fafb"
                urls={ticketPhotoUrls}
                emptyText="No ticket photo from inspector"
              />
              <EditableDataPanel
                report={matchedReport}
                block={matchedBlock}
                standaloneTicket={!matchedReport ? standaloneTickets.find(t =>
                  t.work_date === pair.work_date && (
                    (t.ticket_number && pair.crew_name && t.ticket_number === pair.crew_name) ||
                    t.work_date === pair.work_date
                  )
                ) : null}
                labourRates={labourRates}
                equipmentRates={equipmentRates}
                onDataChange={onPanel4DataChange}
              />
            </div>

            {/* Resolution bar */}
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {pair.status === 'pending' ? (
                <>
                  <button onClick={() => handleResolve('accepted')} disabled={saving}
                    style={{ padding: '8px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
                    Accept
                  </button>
                  <button onClick={() => setResolution(resolution === 'dispute' ? '' : 'dispute')}
                    style={{ padding: '8px 16px', backgroundColor: resolution === 'dispute' ? '#d97706' : '#fef3c7', color: resolution === 'dispute' ? 'white' : '#854d0e', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
                    Dispute - Variance
                  </button>
                  <button onClick={() => setResolution(resolution === 'ticket_altered' ? '' : 'ticket_altered')}
                    style={{ padding: '8px 16px', backgroundColor: resolution === 'ticket_altered' ? '#dc2626' : '#fee2e2', color: resolution === 'ticket_altered' ? 'white' : '#991b1b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}>
                    Ticket Altered
                  </button>
                  <button onClick={() => handleResolve('skipped')} disabled={saving}
                    style={{ padding: '8px 16px', backgroundColor: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Skip
                  </button>

                  {(resolution === 'dispute' || resolution === 'ticket_altered') && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: '300px' }}>
                      <input
                        value={resolutionNotes}
                        onChange={e => setResolutionNotes(e.target.value)}
                        placeholder={resolution === 'ticket_altered' ? 'Describe what was altered...' : 'Describe the variance...'}
                        style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                        onKeyDown={e => { if (e.key === 'Enter' && resolutionNotes.trim()) handleResolve(resolution === 'ticket_altered' ? 'disputed_ticket_altered' : 'disputed_variance', resolutionNotes) }}
                      />
                      <button onClick={() => handleResolve(resolution === 'ticket_altered' ? 'disputed_ticket_altered' : 'disputed_variance', resolutionNotes)}
                        disabled={!resolutionNotes.trim() || saving}
                        style={{ padding: '8px 16px', backgroundColor: resolution === 'ticket_altered' ? '#dc2626' : '#d97706', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', whiteSpace: 'nowrap' }}>
                        Submit
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
                  <span style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', ...(() => { const si = statusIcon(pair.status); return { backgroundColor: si.bg, color: si.color } })() }}>
                    {pair.status === 'accepted' ? 'Accepted' : pair.status === 'disputed' ? `Disputed: ${pair.dispute_type === 'ticket_altered' ? 'Ticket Altered' : pair.dispute_type === 'variance' ? 'Variance' : pair.resolution || 'Unknown'}` : pair.status}
                  </span>
                  {pair.resolution_notes && <span style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>{pair.resolution_notes}</span>}
                  <button onClick={() => onResolve(pair.id, 'pending', '')} style={{ marginLeft: 'auto', padding: '6px 12px', backgroundColor: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                    Undo
                  </button>
                </div>
              )}

              {/* Nav buttons */}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button onClick={() => onSelectPair(selectedPairIndex - 1)} disabled={selectedPairIndex <= 0}
                  style={{ padding: '8px 12px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: selectedPairIndex > 0 ? 'pointer' : 'not-allowed' }}>Prev</button>
                <button onClick={() => onSelectPair(selectedPairIndex + 1)} disabled={selectedPairIndex >= pairs.length - 1}
                  style={{ padding: '8px 12px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: selectedPairIndex < pairs.length - 1 ? 'pointer' : 'not-allowed' }}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
