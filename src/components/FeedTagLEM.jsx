import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { logFeedAction } from '../utils/feedAuditLogger.js'

const formatCurrency = (val) => {
  if (val == null || val === '') return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(val)
}

export default function FeedTagLEM({ wbsItem, projectId, onClose }) {
  const { addOrgFilter, getOrgId } = useOrgQuery()

  const [lemEntries, setLemEntries] = useState([])
  const [taggedEntries, setTaggedEntries] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [tagging, setTagging] = useState(false)

  useEffect(() => {
    loadData()
  }, [wbsItem.id])

  async function loadData() {
    setLoading(true)
    try {
      // Load already-tagged actuals for this WBS item
      let taggedQuery = supabase
        .from('feed_wbs_actuals')
        .select('*, lem_entry:lem_line_items(id, ticket_number, work_date, crew_name, activity_description, line_total)')
        .eq('wbs_item_id', wbsItem.id)
      taggedQuery = addOrgFilter(taggedQuery)
      const { data: tagged, error: tagErr } = await taggedQuery
      if (tagErr) throw tagErr
      setTaggedEntries(tagged || [])

      // Load all LEM line items for the project (untagged ones)
      const taggedLemIds = (tagged || []).map(t => t.lem_entry_id)

      let lemQuery = supabase
        .from('lem_line_items')
        .select('id, ticket_number, work_date, crew_name, activity_description, line_total, foreman')
        .order('work_date', { ascending: false })
      lemQuery = addOrgFilter(lemQuery)
      const { data: lems, error: lemErr } = await lemQuery
      if (lemErr) throw lemErr

      // Filter out already-tagged entries
      const untagged = (lems || []).filter(l => !taggedLemIds.includes(l.id))
      setLemEntries(untagged)
    } catch (err) {
      console.error('Error loading LEM data for tagging:', err)
    }
    setLoading(false)
  }

  function toggleSelect(lemId) {
    setSelected(prev =>
      prev.includes(lemId) ? prev.filter(id => id !== lemId) : [...prev, lemId]
    )
  }

  async function tagSelected() {
    if (selected.length === 0) return
    setTagging(true)
    const orgId = getOrgId()

    try {
      const records = selected.map(lemId => {
        const lem = lemEntries.find(l => l.id === lemId)
        return {
          organization_id: orgId,
          wbs_item_id: wbsItem.id,
          lem_entry_id: lemId,
          actual_amount: lem?.line_total || 0
        }
      })

      const { error } = await supabase
        .from('feed_wbs_actuals')
        .insert(records)

      if (error) throw error

      await logFeedAction({
        action: 'feed_wbs_actual_tag',
        entityType: 'feed_wbs_actual',
        entityId: wbsItem.id,
        newValue: `Tagged ${selected.length} LEM entries`,
        metadata: { lem_ids: selected },
        organizationId: orgId
      })

      setSelected([])
      await loadData()
    } catch (err) {
      console.error('Error tagging LEMs:', err)
    }
    setTagging(false)
  }

  async function untagEntry(actualId, lemTicket) {
    const orgId = getOrgId()
    try {
      const { error } = await supabase
        .from('feed_wbs_actuals')
        .delete()
        .eq('id', actualId)

      if (error) throw error

      await logFeedAction({
        action: 'feed_wbs_actual_untag',
        entityType: 'feed_wbs_actual',
        entityId: actualId,
        oldValue: lemTicket,
        organizationId: orgId
      })

      await loadData()
    } catch (err) {
      console.error('Error untagging LEM:', err)
    }
  }

  const filteredLems = lemEntries.filter(lem => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      (lem.ticket_number || '').toLowerCase().includes(s) ||
      (lem.crew_name || '').toLowerCase().includes(s) ||
      (lem.activity_description || '').toLowerCase().includes(s) ||
      (lem.foreman || '').toLowerCase().includes(s)
    )
  })

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', padding: '16px 20px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', color: '#1a5f2a' }}>Tag LEMs to WBS Item</h3>
            <div style={{ fontSize: '13px', color: '#666' }}>
              <strong>{wbsItem.wbs_code}</strong> — {wbsItem.scope_name}
              <span style={{ marginLeft: '12px' }}>Est: {formatCurrency(wbsItem.estimated_amount)}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>&#10005;</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {/* Currently Tagged */}
          {taggedEntries.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#333' }}>
                Currently Tagged ({taggedEntries.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {taggedEntries.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#e8f5e9', borderRadius: '6px', fontSize: '13px' }}>
                    <div>
                      <strong>{t.lem_entry?.ticket_number || '—'}</strong>
                      <span style={{ marginLeft: '8px', color: '#555' }}>
                        {t.lem_entry?.work_date} — {t.lem_entry?.crew_name || ''}
                      </span>
                      <span style={{ marginLeft: '8px' }}>{formatCurrency(t.actual_amount)}</span>
                    </div>
                    <button
                      onClick={() => untagEntry(t.id, t.lem_entry?.ticket_number)}
                      style={{ padding: '2px 8px', fontSize: '11px', border: '1px solid #c62828', borderRadius: '4px', cursor: 'pointer', color: '#c62828', backgroundColor: '#fff' }}
                    >
                      Unlink
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search + Available LEMs */}
          <div style={{ marginBottom: '12px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#333' }}>
              Available LEM Entries ({filteredLems.length})
            </h4>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by ticket #, crew, activity..."
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px' }}
            />
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>Loading LEM entries...</div>
          ) : filteredLems.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
              {search ? 'No matching LEM entries' : 'No untagged LEM entries available'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {filteredLems.map(lem => {
                const isSelected = selected.includes(lem.id)
                return (
                  <div
                    key={lem.id}
                    onClick={() => toggleSelect(lem.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: isSelected ? '#e3f2fd' : '#fff',
                      border: isSelected ? '1px solid #1565c0' : '1px solid #eee',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      transition: 'all 0.1s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{ cursor: 'pointer' }}
                      />
                      <div>
                        <strong>{lem.ticket_number || '—'}</strong>
                        <span style={{ marginLeft: '8px', color: '#555' }}>
                          {lem.work_date} — {lem.crew_name || 'No crew'}
                        </span>
                        {lem.activity_description && (
                          <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{lem.activity_description}</div>
                        )}
                      </div>
                    </div>
                    <span style={{ fontWeight: '600' }}>{formatCurrency(lem.line_total)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer with tag button */}
        {selected.length > 0 && (
          <div style={{ borderTop: '1px solid #ddd', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
            <span style={{ fontSize: '13px', color: '#333' }}>
              {selected.length} selected — Total: {formatCurrency(
                lemEntries.filter(l => selected.includes(l.id)).reduce((sum, l) => sum + (parseFloat(l.line_total) || 0), 0)
              )}
            </span>
            <button
              onClick={tagSelected}
              disabled={tagging}
              style={{
                padding: '8px 20px',
                backgroundColor: tagging ? '#ccc' : '#1565c0',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: tagging ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '13px'
              }}
            >
              {tagging ? 'Tagging...' : `Tag ${selected.length} to WBS`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backgroundColor: 'rgba(0,0,0,0.3)',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'flex-end'
}

const panelStyle = {
  width: '560px',
  maxWidth: '90vw',
  backgroundColor: '#fff',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  boxShadow: '-4px 0 20px rgba(0,0,0,0.15)'
}
