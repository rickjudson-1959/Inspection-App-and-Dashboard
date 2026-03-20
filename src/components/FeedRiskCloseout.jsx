import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { useAuth } from '../AuthContext.jsx'
import { logFeedAction } from '../utils/feedAuditLogger.js'

const OUTCOMES = ['resolved', 'escalated', 'monitoring']

const formatCurrency = (val) => {
  if (val == null || val === '') return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(val)
}

export default function FeedRiskCloseout({ risk, existingCloseout, projectId, onClose }) {
  const { addOrgFilter, getOrgId } = useOrgQuery()
  const { user } = useAuth()

  const [reports, setReports] = useState([])
  const [reportSearch, setReportSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    inspector_report_id: existingCloseout?.inspector_report_id || '',
    outcome: existingCloseout?.outcome || 'resolved',
    actual_cost_impact: existingCloseout?.actual_cost_impact != null ? String(existingCloseout.actual_cost_impact) : '',
    closed_date: existingCloseout?.closed_date || new Date().toISOString().split('T')[0],
    field_notes: existingCloseout?.field_notes || ''
  })

  useEffect(() => {
    loadReports()
  }, [])

  async function loadReports() {
    setLoading(true)
    try {
      let query = supabase
        .from('daily_reports')
        .select('id, date, inspector_name')
        .order('date', { ascending: false })
        .limit(200)
      query = addOrgFilter(query)
      const { data, error: fetchErr } = await query
      if (fetchErr) throw fetchErr
      setReports(data || [])
    } catch (err) {
      console.error('Error loading reports:', err)
    }
    setLoading(false)
  }

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const orgId = getOrgId()

    try {
      const closeoutRecord = {
        organization_id: orgId,
        risk_id: risk.id,
        inspector_report_id: form.inspector_report_id || null,
        outcome: form.outcome,
        actual_cost_impact: form.actual_cost_impact ? parseFloat(form.actual_cost_impact) : null,
        closed_date: form.closed_date || null,
        field_notes: form.field_notes || null,
        closed_by: user?.id || null
      }

      if (existingCloseout) {
        const { error: updateErr } = await supabase
          .from('feed_risk_closeouts')
          .update(closeoutRecord)
          .eq('id', existingCloseout.id)
        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase
          .from('feed_risk_closeouts')
          .insert(closeoutRecord)
        if (insertErr) throw insertErr
      }

      // Update the risk status based on outcome
      const newRiskStatus = form.outcome === 'escalated' ? 'escalated' : 'closed'
      await supabase
        .from('feed_risks')
        .update({ status: newRiskStatus })
        .eq('id', risk.id)

      await logFeedAction({
        action: 'feed_risk_closeout',
        entityType: 'feed_risk_closeout',
        entityId: risk.id,
        newValue: JSON.stringify({ outcome: form.outcome, actual_cost_impact: form.actual_cost_impact }),
        organizationId: orgId
      })

      onClose()
    } catch (err) {
      console.error('Error saving closeout:', err)
      setError(err.message || 'Failed to save closeout')
    }
    setSaving(false)
  }

  const filteredReports = reports.filter(r => {
    if (!reportSearch) return true
    const s = reportSearch.toLowerCase()
    return (
      (r.inspector_name || '').toLowerCase().includes(s) ||
      (r.date || '').includes(s)
    )
  })

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', padding: '16px 20px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', color: '#1a5f2a' }}>Risk Closeout</h3>
            <div style={{ fontSize: '13px', color: '#666' }}>
              <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', backgroundColor: '#ff980020', color: '#e65100' }}>
                {risk.severity}
              </span>
              <span style={{ marginLeft: '8px' }}>{risk.category}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>&#10005;</button>
        </div>

        {/* Risk Description */}
        <div style={{ padding: '12px 20px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #eee', fontSize: '13px' }}>
          <strong>Risk:</strong> {risk.risk_description}
          {risk.cost_allowance && (
            <span style={{ marginLeft: '12px', color: '#555' }}>Allowance: {formatCurrency(risk.cost_allowance)}</span>
          )}
        </div>

        {/* Form */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '8px 12px', backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: '6px', color: '#c00', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {/* Inspector Report Link */}
          <div>
            <label style={labelStyle}>Linked Inspector Report</label>
            <input
              type="text"
              value={reportSearch}
              onChange={e => setReportSearch(e.target.value)}
              placeholder="Search by inspector name or date..."
              style={{ ...inputStyle, marginBottom: '6px' }}
            />
            <select
              value={form.inspector_report_id}
              onChange={e => handleChange('inspector_report_id', e.target.value)}
              style={inputStyle}
            >
              <option value="">— Select report —</option>
              {(loading ? [] : filteredReports).map(r => (
                <option key={r.id} value={r.id}>
                  {r.date} — {r.inspector_name || 'Unknown Inspector'}
                </option>
              ))}
            </select>
          </div>

          {/* Outcome */}
          <div>
            <label style={labelStyle}>Outcome</label>
            <select
              value={form.outcome}
              onChange={e => handleChange('outcome', e.target.value)}
              style={inputStyle}
            >
              {OUTCOMES.map(o => (
                <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Actual Cost Impact */}
          <div>
            <label style={labelStyle}>Actual Cost Impact (CAD)</label>
            <input
              type="number"
              value={form.actual_cost_impact}
              onChange={e => handleChange('actual_cost_impact', e.target.value)}
              placeholder="0.00"
              step="0.01"
              style={inputStyle}
            />
            {risk.cost_allowance && form.actual_cost_impact && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: parseFloat(form.actual_cost_impact) > parseFloat(risk.cost_allowance) ? '#c62828' : '#2e7d32' }}>
                {parseFloat(form.actual_cost_impact) > parseFloat(risk.cost_allowance)
                  ? `Over allowance by ${formatCurrency(parseFloat(form.actual_cost_impact) - parseFloat(risk.cost_allowance))}`
                  : `Under allowance by ${formatCurrency(parseFloat(risk.cost_allowance) - parseFloat(form.actual_cost_impact))}`
                }
              </div>
            )}
          </div>

          {/* Closed Date */}
          <div>
            <label style={labelStyle}>Closed Date</label>
            <input
              type="date"
              value={form.closed_date}
              onChange={e => handleChange('closed_date', e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Field Notes */}
          <div>
            <label style={labelStyle}>Field Notes</label>
            <textarea
              value={form.field_notes}
              onChange={e => handleChange('field_notes', e.target.value)}
              placeholder="Describe field observations, mitigation measures taken, evidence..."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Save */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 24px',
                backgroundColor: saving ? '#ccc' : '#1a5f2a',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              {saving ? 'Saving...' : (existingCloseout ? 'Update Closeout' : 'Close Out Risk')}
            </button>
            <button onClick={onClose} style={{ padding: '10px 24px', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', backgroundColor: '#fff' }}>
              Cancel
            </button>
          </div>
        </div>
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
  backgroundColor: 'rgba(0,0,0,0.4)',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center'
}

const modalStyle = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  width: '600px',
  maxWidth: '90vw',
  maxHeight: '90vh',
  overflow: 'auto',
  boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
}

const labelStyle = {
  display: 'block',
  marginBottom: '4px',
  fontWeight: '600',
  fontSize: '13px',
  color: '#333'
}

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #ddd',
  borderRadius: '6px',
  fontSize: '14px',
  boxSizing: 'border-box'
}
