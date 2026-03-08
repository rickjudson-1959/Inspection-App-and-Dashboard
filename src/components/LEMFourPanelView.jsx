import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'

/**
 * Zoomable image panel — supports multi-page scroll, click-to-fullscreen
 */
function ImagePanel({ title, titleColor, borderColor, bgColor, urls, emptyText }) {
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
                style={{ width: `${zoom * 100}%`, maxWidth: 'none', borderRadius: '4px', cursor: 'pointer', transition: 'width 0.15s' }}
                onClick={() => setFullscreen(idx)}
              />
            </div>
          ))
        )}
      </div>

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
 * Inspector data panel (Panel 4) — structured data from matched report
 */
function InspectorDataPanel({ block, reportDate, inspector, calcLabourCost, calcEquipCost }) {
  if (!block) {
    return (
      <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', border: '2px solid #059669', padding: '14px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#166534', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>Inspector Report Data</h4>
        <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '12px', textAlign: 'center', marginTop: '40px' }}>No matching inspector report found</p>
      </div>
    )
  }

  const labour = block.labourEntries || []
  const equip = block.equipmentEntries || []
  const totalLabourCost = labour.reduce((s, e) => s + (calcLabourCost?.(e) || 0), 0)
  const totalEquipCost = equip.reduce((s, e) => s + (calcEquipCost?.(e) || 0), 0)
  const totalLabourHrs = labour.reduce((s, e) => s + (parseFloat(e.rt || e.hours || 0) || 0) + (parseFloat(e.ot || 0) || 0), 0)
  const totalEquipHrs = equip.reduce((s, e) => s + (parseFloat(e.hours || 0) || 0), 0)

  return (
    <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', border: '2px solid #059669', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid #059669' }}>
        <h4 style={{ margin: 0, color: '#166534', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>Inspector Report Data</h4>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', maxHeight: '70vh' }}>
        {/* Header info */}
        <div style={{ fontSize: '12px', color: '#374151', marginBottom: '10px', lineHeight: '1.6' }}>
          <div><strong>Crew:</strong> {block.contractor || '-'}</div>
          <div><strong>Date:</strong> {reportDate || '-'}</div>
          <div><strong>Inspector:</strong> {inspector || '-'}</div>
          <div><strong>Activity:</strong> {block.activityType || '-'}</div>
          {block.foreman && <div><strong>Foreman:</strong> {block.foreman}</div>}
          {block.ticketNumber && <div><strong>Ticket:</strong> {block.ticketNumber}</div>}
        </div>

        {/* Labour */}
        <h5 style={{ margin: '12px 0 4px 0', fontSize: '11px', textTransform: 'uppercase', color: '#166534', borderBottom: '1px solid #bbf7d0', paddingBottom: '4px' }}>
          Labour ({labour.length} workers, {Math.round(totalLabourHrs * 10) / 10} hrs)
        </h5>
        {labour.length > 0 ? (
          <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid #d1d5db' }}>
              <th style={{ textAlign: 'left', padding: '3px' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '3px' }}>Class</th>
              <th style={{ textAlign: 'center', padding: '3px' }}>RT</th>
              <th style={{ textAlign: 'center', padding: '3px' }}>OT</th>
              <th style={{ textAlign: 'right', padding: '3px' }}>Cost</th>
            </tr></thead>
            <tbody>
              {labour.map((e, i) => {
                const cost = calcLabourCost?.(e) || 0
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '2px 3px' }}>{e.name || e.employeeName || '-'}</td>
                    <td style={{ padding: '2px 3px' }}>{e.classification || e.trade || '-'}</td>
                    <td style={{ padding: '2px 3px', textAlign: 'center' }}>{e.rt || e.hours || 0}</td>
                    <td style={{ padding: '2px 3px', textAlign: 'center' }}>{e.ot || 0}</td>
                    <td style={{ padding: '2px 3px', textAlign: 'right', color: cost > 0 ? '#059669' : '#9ca3af' }}>{cost > 0 ? `$${Math.round(cost).toLocaleString()}` : '-'}</td>
                  </tr>
                )
              })}
              <tr style={{ borderTop: '2px solid #bbf7d0', fontWeight: '600' }}>
                <td colSpan={4} style={{ padding: '4px 3px', textAlign: 'right' }}>Labour Total:</td>
                <td style={{ padding: '4px 3px', textAlign: 'right', color: '#059669' }}>${Math.round(totalLabourCost).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        ) : <p style={{ fontSize: '11px', color: '#9ca3af' }}>No labour entries</p>}

        {/* Equipment */}
        <h5 style={{ margin: '12px 0 4px 0', fontSize: '11px', textTransform: 'uppercase', color: '#166534', borderBottom: '1px solid #bbf7d0', paddingBottom: '4px' }}>
          Equipment ({equip.length} units, {Math.round(totalEquipHrs * 10) / 10} hrs)
        </h5>
        {equip.length > 0 ? (
          <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid #d1d5db' }}>
              <th style={{ textAlign: 'left', padding: '3px' }}>Type</th>
              <th style={{ textAlign: 'left', padding: '3px' }}>Unit</th>
              <th style={{ textAlign: 'center', padding: '3px' }}>Hrs</th>
              <th style={{ textAlign: 'right', padding: '3px' }}>Cost</th>
            </tr></thead>
            <tbody>
              {equip.map((e, i) => {
                const cost = calcEquipCost?.(e) || 0
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '2px 3px' }}>{e.type || e.equipmentType || '-'}</td>
                    <td style={{ padding: '2px 3px' }}>{e.unitNumber || e.unit_number || '-'}</td>
                    <td style={{ padding: '2px 3px', textAlign: 'center' }}>{e.hours || 0}</td>
                    <td style={{ padding: '2px 3px', textAlign: 'right', color: cost > 0 ? '#d97706' : '#9ca3af' }}>{cost > 0 ? `$${Math.round(cost).toLocaleString()}` : '-'}</td>
                  </tr>
                )
              })}
              <tr style={{ borderTop: '2px solid #bbf7d0', fontWeight: '600' }}>
                <td colSpan={3} style={{ padding: '4px 3px', textAlign: 'right' }}>Equipment Total:</td>
                <td style={{ padding: '4px 3px', textAlign: 'right', color: '#d97706' }}>${Math.round(totalEquipCost).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        ) : <p style={{ fontSize: '11px', color: '#9ca3af' }}>No equipment entries</p>}

        {/* Cost summary */}
        <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#dcfce7', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#166534', textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px' }}>Total Cost (Rate Card)</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#059669' }}>
            ${Math.round(totalLabourCost + totalEquipCost).toLocaleString()}
          </div>
          <div style={{ fontSize: '10px', color: '#6b7280' }}>
            Labour: ${Math.round(totalLabourCost).toLocaleString()} | Equip: ${Math.round(totalEquipCost).toLocaleString()}
          </div>
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
  calcLabourCost,
  calcEquipCost,
  saving,
  poNumber,
  contractorName
}) {
  const [resolution, setResolution] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const pair = pairs[selectedPairIndex] || null

  // Match pair to inspector report
  const [matchedBlock, setMatchedBlock] = useState(null)
  const [matchedReport, setMatchedReport] = useState(null)

  useEffect(() => {
    if (!pair) { setMatchedBlock(null); setMatchedReport(null); return }

    if (pair.matched_report_id) {
      // Already matched — fetch the block
      const report = reports.find(r => r.id === pair.matched_report_id)
      if (report) {
        setMatchedReport(report)
        setMatchedBlock(report.activity_blocks?.[pair.matched_block_index] || null)
      }
      return
    }

    // Try auto-match by date + crew
    if (!pair.work_date) { setMatchedBlock(null); setMatchedReport(null); return }

    for (const report of reports) {
      if (report.date !== pair.work_date) continue
      const blocks = report.activity_blocks || []
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        const crewMatch = pair.crew_name && block.contractor &&
          (block.contractor.toLowerCase().includes((pair.crew_name || '').toLowerCase().split(' ')[0]) ||
           (pair.crew_name || '').toLowerCase().includes(block.contractor.toLowerCase().split(' ')[0]))
        if (crewMatch) {
          setMatchedReport(report)
          setMatchedBlock(block)
          return
        }
      }
      // If date matches but no crew match, use first block
      if (blocks.length > 0) {
        setMatchedReport(report)
        setMatchedBlock(blocks[0])
        return
      }
    }
    setMatchedBlock(null)
    setMatchedReport(null)
  }, [pair, reports])

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
              <InspectorDataPanel
                block={matchedBlock}
                reportDate={matchedReport?.date}
                inspector={matchedReport?.inspector_name}
                calcLabourCost={calcLabourCost}
                calcEquipCost={calcEquipCost}
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
                    {pair.status === 'accepted' ? 'Accepted' : pair.status === 'disputed' ? `Disputed: ${pair.resolution || ''}` : pair.status}
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
