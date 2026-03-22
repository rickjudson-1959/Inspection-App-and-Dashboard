import React from 'react'

/**
 * InspectorReportPanel — Formatted read-only view of inspector report data.
 * Shows manpower table + equipment table from activity_blocks, NOT a document.
 *
 * Props:
 *   report: daily_reports row with activity_blocks
 *   block: the specific activity block matching the ticket number
 */
export default function InspectorReportPanel({ report, block }) {
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
  const cellStyle = { padding: '4px 6px', borderBottom: '1px solid #e5e7eb', fontSize: 12 }
  const headerStyle = { ...cellStyle, fontWeight: '600', backgroundColor: '#f0fdf4', color: '#166534' }

  return (
    <div style={{ height: '100%', overflow: 'auto', fontSize: 13 }}>
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
                <th style={{ ...headerStyle, textAlign: 'right', width: 45 }}>RT</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 45 }}>OT</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 45 }}>JH</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 35 }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {labourEntries.map((e, i) => (
                <tr key={i}>
                  <td style={cellStyle}>{e.employeeName || e.employee_name || e.name || '-'}</td>
                  <td style={{ ...cellStyle, color: '#6b7280' }}>{e.classification || '-'}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{e.rt || e.hours || 0}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{e.ot || 0}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{e.jh || 0}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{e.count || 1}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f0fdf4' }}>
                <td colSpan={2} style={{ ...cellStyle, fontWeight: '600' }}>Total</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {labourEntries.reduce((s, e) => s + parseFloat(e.rt || e.hours || 0) * (parseInt(e.count || 1)), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {labourEntries.reduce((s, e) => s + parseFloat(e.ot || 0) * (parseInt(e.count || 1)), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {labourEntries.reduce((s, e) => s + parseFloat(e.jh || 0) * (parseInt(e.count || 1)), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {labourEntries.reduce((s, e) => s + (parseInt(e.count || 1)), 0)}
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
                <th style={{ ...headerStyle, textAlign: 'left', width: 70 }}>Unit #</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 45 }}>Hrs</th>
                <th style={{ ...headerStyle, textAlign: 'right', width: 35 }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {equipmentEntries.map((e, i) => (
                <tr key={i}>
                  <td style={cellStyle}>{e.type || e.equipment_type || '-'}</td>
                  <td style={cellStyle}>{e.unitNumber || e.unit_number || '-'}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{e.hours || 0}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{e.count || 1}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f0fdf4' }}>
                <td colSpan={2} style={{ ...cellStyle, fontWeight: '600' }}>Total</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {equipmentEntries.reduce((s, e) => s + parseFloat(e.hours || 0) * (parseInt(e.count || 1)), 0).toFixed(1)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '600' }}>
                  {equipmentEntries.reduce((s, e) => s + (parseInt(e.count || 1)), 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Source badge */}
      <div style={{ padding: '8px 12px', fontSize: 11, color: '#6b7280', fontStyle: 'italic', borderTop: '1px solid #e5e7eb' }}>
        Live data from inspector report — Report ID: {report.id}
      </div>
    </div>
  )
}
