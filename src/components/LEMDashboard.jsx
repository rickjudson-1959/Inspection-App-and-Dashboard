import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { useOrgPath } from '../contexts/OrgContext.jsx'
import TicketEntry from './TicketEntry.jsx'

// ---------------------------------------------------------------------------
// Status badge helper — consistent colored pills matching existing Pipe-Up UI
// ---------------------------------------------------------------------------
function StatusBadge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: '600',
      color: 'white',
      backgroundColor: color,
      whiteSpace: 'nowrap'
    }}>
      {label}
    </span>
  )
}

function categoryBadge(category) {
  const map = {
    direct:      { label: 'Direct',      bg: '#2563eb' },
    indirect:    { label: 'Indirect',    bg: '#d97706' },
    third_party: { label: 'Third Party', bg: '#7c3aed' }
  }
  const cfg = map[category] || { label: category || '-', bg: '#6b7280' }
  return <StatusBadge label={cfg.label} color={cfg.bg} />
}

function ticketStatusBadge(status) {
  const map = {
    entered:     { label: 'Entered',     color: '#6b7280' },
    matched:     { label: 'Matched',     color: '#2563eb' },
    reconciled:  { label: 'Reconciled',  color: '#059669' },
    approved:    { label: 'Approved',    color: '#047857' }
  }
  const cfg = map[status] || { label: status || '-', color: '#6b7280' }
  return <StatusBadge label={cfg.label} color={cfg.color} />
}

function lemStatusBadge(status) {
  if (!status) return <StatusBadge label="Awaiting LEM" color="#9ca3af" />
  const map = {
    uploaded:   { label: 'Uploaded',   color: '#6b7280' },
    parsed:     { label: 'Parsed',     color: '#2563eb' },
    reconciled: { label: 'Reconciled', color: '#d97706' },
    approved:   { label: 'Approved',   color: '#059669' }
  }
  const cfg = map[status] || { label: status, color: '#6b7280' }
  return <StatusBadge label={cfg.label} color={cfg.color} />
}

function invoiceStatusBadge(status) {
  if (!status) return <span style={{ color: '#9ca3af', fontSize: '12px' }}>-</span>
  const map = {
    pending:  { label: 'Pending',  color: '#d97706' },
    approved: { label: 'Approved', color: '#059669' },
    rejected: { label: 'Rejected', color: '#dc2626' },
    paid:     { label: 'Paid',     color: '#2563eb' }
  }
  const cfg = map[status] || { label: status, color: '#6b7280' }
  return <StatusBadge label={cfg.label} color={cfg.color} />
}

// ---------------------------------------------------------------------------
// LEMDashboard
// ---------------------------------------------------------------------------
export default function LEMDashboard() {
  const navigate = useNavigate()
  const { orgPath } = useOrgPath()
  const { addOrgFilter, organizationId, isReady } = useOrgQuery()

  // Data
  const [lemUploads, setLemUploads] = useState([])
  const [standaloneTickets, setStandaloneTickets] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [poFilter, setPoFilter] = useState('')
  const [contractorFilter, setContractorFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Ticket entry
  const [showTicketEntry, setShowTicketEntry] = useState(false)
  const [editingTicket, setEditingTicket] = useState(null)

  // Group by
  const [groupBy, setGroupBy] = useState('po')

  // Collapsible groups
  const [collapsedGroups, setCollapsedGroups] = useState({})

  // ----------- Data loading -----------
  useEffect(() => {
    if (isReady()) loadAll()
  }, [organizationId])

  async function loadAll() {
    setLoading(true)
    try {
      // 1. contractor_lem_uploads
      let lemQ = supabase.from('contractor_lem_uploads').select('*').order('uploaded_at', { ascending: false })
      lemQ = addOrgFilter(lemQ, true)
      const { data: lemData } = await lemQ

      // 2. standalone_tickets
      let ticketQ = supabase.from('standalone_tickets').select('*').order('created_at', { ascending: false })
      ticketQ = addOrgFilter(ticketQ, true)
      const { data: ticketData } = await ticketQ

      // 3. contractor_invoices
      let invQ = supabase.from('contractor_invoices').select('*').order('uploaded_at', { ascending: false })
      invQ = addOrgFilter(invQ, true)
      const { data: invData } = await invQ

      setLemUploads(lemData || [])
      setStandaloneTickets(ticketData || [])
      setInvoices(invData || [])
    } catch (err) {
      console.error('[LEMDashboard] Error loading data:', err)
    }
    setLoading(false)
  }

  // ----------- Derived values -----------

  // Unique PO numbers from both LEMs and standalone tickets
  const uniquePOs = useMemo(() => {
    const pos = new Set()
    lemUploads.forEach(l => { if (l.po_number) pos.add(l.po_number) })
    standaloneTickets.forEach(t => { if (t.po_number) pos.add(t.po_number) })
    return [...pos].sort()
  }, [lemUploads, standaloneTickets])

  // Unique contractor names
  const uniqueContractors = useMemo(() => {
    const names = new Set()
    lemUploads.forEach(l => { if (l.contractor_name) names.add(l.contractor_name) })
    standaloneTickets.forEach(t => { if (t.contractor_name) names.add(t.contractor_name) })
    return [...names].sort()
  }, [lemUploads, standaloneTickets])

  // Invoice lookup by lem_id
  const invoiceByLemId = useMemo(() => {
    const map = {}
    invoices.forEach(inv => { if (inv.lem_id) map[inv.lem_id] = inv })
    return map
  }, [invoices])

  // Merge LEMs and standalone tickets into unified rows
  const unifiedRows = useMemo(() => {
    const rows = []

    // LEM rows
    lemUploads.forEach(lem => {
      rows.push({
        id: lem.id,
        type: 'lem',
        date: lem.lem_period_start || lem.uploaded_at?.split('T')[0] || '',
        ticketNumber: lem.lem_number || lem.source_filename || '-',
        category: lem.lem_category || 'direct',
        contractorName: lem.contractor_name || '-',
        poNumber: lem.po_number || '',
        source: '-',
        ticketStatus: lem.status === 'approved' ? 'approved' : lem.status === 'reconciled' ? 'reconciled' : 'matched',
        lemStatus: lem.status,
        invoiceStatus: invoiceByLemId[lem.id]?.status || null,
        sortDate: lem.lem_period_start || lem.uploaded_at || '',
        raw: lem
      })
    })

    // Standalone ticket rows
    standaloneTickets.forEach(ticket => {
      const matchedLem = ticket.matched_lem_upload_id
        ? lemUploads.find(l => l.id === ticket.matched_lem_upload_id)
        : null

      rows.push({
        id: ticket.id,
        type: 'ticket',
        date: ticket.work_date || '',
        ticketNumber: ticket.ticket_number || '-',
        category: ticket.lem_category || 'third_party',
        contractorName: ticket.contractor_name || '-',
        poNumber: ticket.po_number || '',
        source: 'Admin Entry',
        ticketStatus: ticket.status || 'entered',
        lemStatus: matchedLem?.status || null,
        invoiceStatus: matchedLem ? (invoiceByLemId[matchedLem.id]?.status || null) : null,
        sortDate: ticket.work_date || ticket.created_at || '',
        raw: ticket
      })
    })

    return rows
  }, [lemUploads, standaloneTickets, invoiceByLemId])

  // Apply filters
  const filteredRows = useMemo(() => {
    return unifiedRows.filter(row => {
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
      if (poFilter && row.poNumber !== poFilter) return false
      if (contractorFilter && row.contractorName !== contractorFilter) return false
      if (statusFilter !== 'all') {
        // Status filter checks across ticket/LEM/invoice status
        if (statusFilter === 'entered' && row.ticketStatus !== 'entered') return false
        if (statusFilter === 'matched' && row.ticketStatus !== 'matched') return false
        if (statusFilter === 'reconciled' && row.ticketStatus !== 'reconciled' && row.lemStatus !== 'reconciled') return false
        if (statusFilter === 'approved' && row.ticketStatus !== 'approved' && row.lemStatus !== 'approved') return false
        if (statusFilter === 'invoiced' && !row.invoiceStatus) return false
        if (statusFilter === 'paid' && row.invoiceStatus !== 'paid') return false
      }
      return true
    })
  }, [unifiedRows, categoryFilter, poFilter, contractorFilter, statusFilter])

  // Group rows
  const groupedRows = useMemo(() => {
    const groups = {}
    filteredRows.forEach(row => {
      const key = groupBy === 'po'
        ? (row.poNumber || 'No PO')
        : (row.contractorName || 'Unknown Contractor')
      if (!groups[key]) groups[key] = []
      groups[key].push(row)
    })

    // Sort within each group by date descending
    Object.values(groups).forEach(arr =>
      arr.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''))
    )

    // Sort group keys alphabetically, with "No PO" / "Unknown Contractor" at end
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const fallback = groupBy === 'po' ? 'No PO' : 'Unknown Contractor'
      if (a === fallback) return 1
      if (b === fallback) return -1
      return a.localeCompare(b)
    })

    return sortedKeys.map(key => ({ key, rows: groups[key] }))
  }, [filteredRows, groupBy])

  function toggleGroup(key) {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ----------- Actions -----------

  function handleReview(row) {
    if (row.type === 'lem') {
      // Navigate to reconciliation with this LEM selected
      navigate(orgPath('/reconciliation'))
    }
  }

  function handleEditTicket(row) {
    if (row.type === 'ticket') {
      setEditingTicket(row.raw)
      setShowTicketEntry(true)
    }
  }

  function handleTicketSaved() {
    setShowTicketEntry(false)
    setEditingTicket(null)
    loadAll()
  }

  // ----------- Render -----------

  const thStyle = {
    color: 'white',
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap'
  }
  const tdStyle = {
    padding: '10px 12px',
    fontSize: '13px',
    borderBottom: '1px solid #f3f4f6'
  }

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280' }}>
        Loading LEM tracking data...
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* ---- Header ---- */}
      <div style={{
        backgroundColor: '#1e3a5f',
        color: 'white',
        padding: '20px 24px',
        borderRadius: '8px 8px 0 0',
        marginBottom: 0
      }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>LEM Tracking</h2>
        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
          All contractor LEMs and standalone tickets across direct, indirect, and third-party categories
        </p>
      </div>

      {/* ---- Filter Bar ---- */}
      <div style={{
        backgroundColor: 'white',
        padding: '14px 24px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
      }}>
        {/* Category filter - button group */}
        <div style={{ display: 'flex', gap: '2px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #d1d5db' }}>
          {[
            { value: 'all', label: 'All' },
            { value: 'direct', label: 'Direct' },
            { value: 'indirect', label: 'Indirect' },
            { value: 'third_party', label: 'Third Party' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setCategoryFilter(opt.value)}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: categoryFilter === opt.value ? '#1e3a5f' : '#f9fafb',
                color: categoryFilter === opt.value ? 'white' : '#374151'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* PO filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>PO:</span>
          <select
            value={poFilter}
            onChange={e => setPoFilter(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px' }}
          >
            <option value="">All POs</option>
            {uniquePOs.map(po => <option key={po} value={po}>{po}</option>)}
          </select>
        </div>

        {/* Contractor filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>Contractor:</span>
          <select
            value={contractorFilter}
            onChange={e => setContractorFilter(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px' }}
          >
            <option value="">All Contractors</option>
            {uniqueContractors.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>Status:</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px' }}
          >
            <option value="all">All Statuses</option>
            <option value="entered">Entered</option>
            <option value="matched">Matched</option>
            <option value="reconciled">Reconciled</option>
            <option value="approved">Approved</option>
            <option value="invoiced">Invoiced</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        {/* Group by toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>Group by:</span>
          <select
            value={groupBy}
            onChange={e => setGroupBy(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px' }}
          >
            <option value="po">PO Number</option>
            <option value="contractor">Contractor</option>
          </select>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Enter Ticket button */}
        <button
          onClick={() => { setEditingTicket(null); setShowTicketEntry(true) }}
          style={{
            padding: '8px 16px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '13px'
          }}
        >
          Enter Ticket
        </button>

        {/* Refresh */}
        <button
          onClick={loadAll}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '13px'
          }}
        >
          Refresh
        </button>
      </div>

      {/* ---- Ticket Entry Form ---- */}
      {showTicketEntry && (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '20px',
          marginTop: '16px',
          marginBottom: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1e3a5f' }}>
              {editingTicket ? 'Edit Ticket' : 'Enter New Ticket'}
            </h3>
            <button
              onClick={() => { setShowTicketEntry(false); setEditingTicket(null) }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Cancel
            </button>
          </div>
          <TicketEntry
            ticket={editingTicket}
            onSaved={handleTicketSaved}
            onCancel={() => { setShowTicketEntry(false); setEditingTicket(null) }}
          />
        </div>
      )}

      {/* ---- Summary counts ---- */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        margin: '16px 0'
      }}>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '3px solid #2563eb' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>{filteredRows.length}</div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Items</div>
        </div>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '3px solid #059669' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#059669' }}>
            {filteredRows.filter(r => r.lemStatus === 'approved' || r.ticketStatus === 'approved').length}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Approved</div>
        </div>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '3px solid #d97706' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#d97706' }}>
            {filteredRows.filter(r => !r.lemStatus || r.lemStatus === 'uploaded' || r.lemStatus === 'parsed').length}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Awaiting Reconciliation</div>
        </div>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: '3px solid #7c3aed' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#7c3aed' }}>
            {filteredRows.filter(r => r.invoiceStatus).length}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Invoiced</div>
        </div>
      </div>

      {/* ---- Main Table ---- */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {groupedRows.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
            {unifiedRows.length === 0
              ? 'No LEMs or tickets found. Upload a LEM or enter a ticket to get started.'
              : 'No items match the current filters.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#1e3a5f' }}>
                <th style={{ ...thStyle }}>Date</th>
                <th style={{ ...thStyle }}>Ticket #</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Type</th>
                <th style={{ ...thStyle }}>Contractor</th>
                <th style={{ ...thStyle }}>Source</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Ticket Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>LEM Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Invoice Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.map(group => {
                const isCollapsed = collapsedGroups[group.key]
                return (
                  <React.Fragment key={group.key}>
                    {/* Group header row */}
                    <tr
                      onClick={() => toggleGroup(group.key)}
                      style={{
                        backgroundColor: '#f0f4f8',
                        cursor: 'pointer',
                        borderBottom: '1px solid #e2e8f0'
                      }}
                    >
                      <td colSpan={9} style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', color: '#64748b', width: '16px', textAlign: 'center' }}>
                            {isCollapsed ? '\u25B6' : '\u25BC'}
                          </span>
                          <span style={{ fontWeight: '700', color: '#1e3a5f', fontSize: '14px' }}>
                            {groupBy === 'po' ? `PO: ${group.key}` : group.key}
                          </span>
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>
                            ({group.rows.length} item{group.rows.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Data rows */}
                    {!isCollapsed && group.rows.map(row => (
                      <tr
                        key={row.id}
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{row.date}</td>
                        <td style={{ ...tdStyle, fontWeight: '600' }}>{row.ticketNumber}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{categoryBadge(row.category)}</td>
                        <td style={{ ...tdStyle }}>{row.contractorName}</td>
                        <td style={{ ...tdStyle, color: '#6b7280', fontSize: '12px' }}>
                          {row.type === 'ticket' ? 'Admin Entry' : row.type === 'lem' ? '-' : '-'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{ticketStatusBadge(row.ticketStatus)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{lemStatusBadge(row.lemStatus)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{invoiceStatusBadge(row.invoiceStatus)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {row.type === 'lem' && (
                              <button
                                onClick={() => handleReview(row)}
                                style={{
                                  padding: '4px 12px',
                                  backgroundColor: '#2563eb',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  fontWeight: '500'
                                }}
                              >
                                Review
                              </button>
                            )}
                            {row.type === 'ticket' && (
                              <button
                                onClick={() => handleEditTicket(row)}
                                style={{
                                  padding: '4px 12px',
                                  backgroundColor: '#6b7280',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  fontWeight: '500'
                                }}
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
