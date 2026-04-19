import React, { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { useOrgQuery } from './utils/queryHelpers.js'

/**
 * MasterGaps — Admin view for unresolved and flagged rows across all reports.
 * Two tabs: Unresolved (needs_master_resolution, not flagged) and Flagged for Review.
 */
export default function MasterGaps() {
  const { organizationId } = useOrgQuery()
  const [activeTab, setActiveTab] = useState('unresolved')
  const [loading, setLoading] = useState(true)
  const [unresolvedData, setUnresolvedData] = useState({ labour: [], equipment: [] })
  const [flaggedData, setFlaggedData] = useState({ labour: [], equipment: [] })

  useEffect(() => {
    if (organizationId) loadData()
  }, [organizationId])

  async function loadData() {
    setLoading(true)
    try {
      // Load all reports with activity blocks
      let allReports = []
      let offset = 0
      while (true) {
        let q = supabase.from('daily_reports')
          .select('id, date, inspector_name, activity_blocks')
          .eq('organization_id', organizationId)
          .order('date', { ascending: false })
          .range(offset, offset + 199)
        const { data } = await q
        allReports.push(...(data || []))
        if (!data || data.length < 200) break
        offset += 200
      }

      // Extract unresolved and flagged entries
      const unresLabour = {}
      const unresEquip = {}
      const flagLabour = {}
      const flagEquip = {}

      for (const report of allReports) {
        for (const block of (report.activity_blocks || [])) {
          const ticket = block.ticketNumber || ''

          for (const l of (block.labourEntries || [])) {
            const name = (l.employeeName || l.employee_name || l.name || '').trim()
            if (!name) continue

            if (l.flagged_for_review) {
              if (!flagLabour[name]) flagLabour[name] = { name, count: 0, tickets: [], flaggedBy: l.flagged_by, flaggedAt: l.flagged_at, reason: l.flagged_reason }
              flagLabour[name].count++
              if (ticket && !flagLabour[name].tickets.includes(ticket)) flagLabour[name].tickets.push(ticket)
            } else if (l.needs_master_resolution) {
              if (!unresLabour[name]) unresLabour[name] = { name, count: 0, tickets: [], classification: l.classification || '' }
              unresLabour[name].count++
              if (ticket && !unresLabour[name].tickets.includes(ticket)) unresLabour[name].tickets.push(ticket)
            }
          }

          for (const e of (block.equipmentEntries || [])) {
            const unit = (e.unitNumber || e.unit_number || '').trim()
            if (!unit) continue

            if (e.flagged_for_review) {
              if (!flagEquip[unit]) flagEquip[unit] = { unit, count: 0, tickets: [], flaggedBy: e.flagged_by, flaggedAt: e.flagged_at, reason: e.flagged_reason }
              flagEquip[unit].count++
              if (ticket && !flagEquip[unit].tickets.includes(ticket)) flagEquip[unit].tickets.push(ticket)
            } else if (e.needs_master_resolution) {
              if (!unresEquip[unit]) unresEquip[unit] = { unit, count: 0, tickets: [], type: e.type || e.equipment_type || '' }
              unresEquip[unit].count++
              if (ticket && !unresEquip[unit].tickets.includes(ticket)) unresEquip[unit].tickets.push(ticket)
            }
          }
        }
      }

      setUnresolvedData({
        labour: Object.values(unresLabour).sort((a, b) => b.count - a.count),
        equipment: Object.values(unresEquip).sort((a, b) => b.count - a.count),
      })
      setFlaggedData({
        labour: Object.values(flagLabour).sort((a, b) => b.count - a.count),
        equipment: Object.values(flagEquip).sort((a, b) => b.count - a.count),
      })
    } catch (err) {
      console.error('MasterGaps load error:', err)
    }
    setLoading(false)
  }

  const cellStyle = { padding: '6px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13 }
  const headerStyle = { ...cellStyle, fontWeight: 600, backgroundColor: '#f9fafb', color: '#374151' }

  function renderTable(entries, type) {
    if (entries.length === 0) return <p style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic', padding: '12px 0' }}>None</p>
    const isLabour = type === 'labour'
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: 'left' }}>{isLabour ? 'Name' : 'Unit #'}</th>
            <th style={{ ...headerStyle, textAlign: 'right', width: 60 }}>Count</th>
            <th style={{ ...headerStyle, textAlign: 'left' }}>Tickets</th>
            {activeTab === 'flagged' && <th style={{ ...headerStyle, textAlign: 'left' }}>Reason</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={cellStyle}>{isLabour ? e.name : e.unit}</td>
              <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>{e.count}</td>
              <td style={{ ...cellStyle, fontSize: 11, color: '#6b7280' }}>{e.tickets.join(', ') || '—'}</td>
              {activeTab === 'flagged' && (
                <td style={{ ...cellStyle, fontSize: 11, color: '#7c3aed' }}>
                  {e.reason || '—'}
                  {e.flaggedAt && <span style={{ color: '#9ca3af', marginLeft: 6 }}>({new Date(e.flaggedAt).toLocaleDateString()})</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  const unresolvedTotal = unresolvedData.labour.length + unresolvedData.equipment.length
  const flaggedTotal = flaggedData.labour.length + flaggedData.equipment.length

  return (
    <div style={{ padding: '20px', maxWidth: 900 }}>
      <h2 style={{ margin: '0 0 16px 0', color: '#1e3a5f' }}>Master Gaps</h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
        <button
          onClick={() => setActiveTab('unresolved')}
          style={{
            padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            backgroundColor: activeTab === 'unresolved' ? '#fff' : 'transparent',
            color: activeTab === 'unresolved' ? '#1e3a5f' : '#6b7280',
            borderBottom: activeTab === 'unresolved' ? '2px solid #1e3a5f' : '2px solid transparent',
            marginBottom: -2,
          }}
        >
          Unresolved ({unresolvedTotal})
        </button>
        <button
          onClick={() => setActiveTab('flagged')}
          style={{
            padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            backgroundColor: activeTab === 'flagged' ? '#fff' : 'transparent',
            color: activeTab === 'flagged' ? '#7c3aed' : '#6b7280',
            borderBottom: activeTab === 'flagged' ? '2px solid #7c3aed' : '2px solid transparent',
            marginBottom: -2,
          }}
        >
          Flagged for Review ({flaggedTotal})
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading...</p>
      ) : activeTab === 'unresolved' ? (
        <>
          <h3 style={{ fontSize: 14, color: '#166534', margin: '0 0 8px 0' }}>Unresolved Labour ({unresolvedData.labour.length})</h3>
          {renderTable(unresolvedData.labour, 'labour')}
          <h3 style={{ fontSize: 14, color: '#166534', margin: '16px 0 8px 0' }}>Unresolved Equipment ({unresolvedData.equipment.length})</h3>
          {renderTable(unresolvedData.equipment, 'equipment')}
        </>
      ) : (
        <>
          <h3 style={{ fontSize: 14, color: '#7c3aed', margin: '0 0 8px 0' }}>Flagged Labour ({flaggedData.labour.length})</h3>
          {renderTable(flaggedData.labour, 'labour')}
          <h3 style={{ fontSize: 14, color: '#7c3aed', margin: '16px 0 8px 0' }}>Flagged Equipment ({flaggedData.equipment.length})</h3>
          {renderTable(flaggedData.equipment, 'equipment')}
        </>
      )}
    </div>
  )
}
