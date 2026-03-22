import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useOrgQuery } from '../../utils/queryHelpers.js'
import { useOrgPath } from '../../contexts/OrgContext.jsx'
import DocumentPanel from './DocumentPanel.jsx'

/**
 * ReconFourPanelView — 4-panel document comparison keyed by ticket_number.
 *
 * Queries reconciliation_documents for all docs matching a ticket_number,
 * organizes them into 4 panels (LEM, Ticket, Photo, Report), and renders
 * each with DocumentPanel.
 */
export default function ReconFourPanelView({ ticketNumber: ticketProp }) {
  const params = useParams()
  const navigate = useNavigate()
  const { orgPath } = useOrgPath()
  const { getOrgId, organizationId } = useOrgQuery()
  const ticketNumber = ticketProp || params.ticketNumber

  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState({ date: null, foreman: null })

  useEffect(() => {
    if (ticketNumber && organizationId) loadDocs()
  }, [ticketNumber, organizationId])

  async function loadDocs() {
    setLoading(true)
    const orgId = getOrgId()
    const { data, error } = await supabase
      .from('reconciliation_documents')
      .select('*')
      .eq('org_id', orgId)
      .eq('ticket_number', ticketNumber)

    if (!error && data) {
      setDocs(data)
      // Extract date/foreman from first doc that has it
      const withDate = data.find(d => d.date)
      const withForeman = data.find(d => d.foreman)
      setMeta({ date: withDate?.date || null, foreman: withForeman?.foreman || null })
    }
    setLoading(false)
  }

  // Organize docs by type
  const panels = {
    lem: docs.find(d => d.doc_type === 'contractor_lem') || null,
    ticket: docs.find(d => d.doc_type === 'contractor_ticket') || null,
    photo: docs.find(d => d.doc_type === 'inspector_photo') || null,
    report: docs.find(d => d.doc_type === 'inspector_report') || null,
  }

  function handleUpload(docType) {
    // Navigate to upload pre-filled with ticket number and doc type
    navigate(orgPath(`/reconciliation/upload?ticket=${ticketNumber}&type=${docType}`))
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading documents for ticket #{ticketNumber}...</div>
  }

  return (
    <div style={{ padding: '16px', height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate(orgPath('/reconciliation'))}
            style={{ padding: '6px 12px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
          >
            &larr; Back
          </button>
          <div>
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#1e3a5f' }}>Ticket #{ticketNumber}</span>
            {meta.foreman && <span style={{ marginLeft: '12px', fontSize: '14px', color: '#6b7280' }}>{meta.foreman}</span>}
            {meta.date && <span style={{ marginLeft: '12px', fontSize: '14px', color: '#6b7280' }}>{meta.date}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#9ca3af', alignSelf: 'center' }}>
            {docs.length} of 4 documents uploaded
          </span>
        </div>
      </div>

      {/* 4-panel grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '10px', minHeight: 0 }}>
        <DocumentPanel
          title="Contractor LEM"
          subtitle="What they're billing"
          document={panels.lem}
          emptyMessage="No LEM uploaded for this ticket"
          onUpload={() => handleUpload('contractor_lem')}
          color="#d97706"
        />
        <DocumentPanel
          title="Contractor Daily Ticket"
          subtitle="Foreman-signed timesheet"
          document={panels.ticket}
          emptyMessage="No daily ticket uploaded for this ticket"
          onUpload={() => handleUpload('contractor_ticket')}
          color="#dc2626"
        />
        <DocumentPanel
          title="Inspector Ticket Photo"
          subtitle="Photo of the ticket"
          document={panels.photo}
          emptyMessage="No inspector photo uploaded for this ticket"
          onUpload={() => handleUpload('inspector_photo')}
          color="#374151"
        />
        <DocumentPanel
          title="Inspector Report"
          subtitle="What inspector observed"
          document={panels.report}
          emptyMessage="No inspector report uploaded for this ticket"
          onUpload={() => handleUpload('inspector_report')}
          color="#059669"
        />
      </div>
    </div>
  )
}
