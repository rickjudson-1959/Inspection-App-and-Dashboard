import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useOrgQuery } from '../utils/queryHelpers.js'
import { useOrgPath } from '../contexts/OrgContext.jsx'
import { useAuth } from '../AuthContext.jsx'
import { logFeedAction } from '../utils/feedAuditLogger.js'

const ESTIMATE_CLASSES = ['Class 2', 'Class 3', 'Class 4', 'Class 5']

const APPROVAL_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved_for_FID', label: 'Approved for FID' },
  { value: 'superseded', label: 'Superseded' }
]

export default function FeedEstimateSetup({ projectId, onSaved }) {
  const { addOrgFilter, getOrgId } = useOrgQuery()
  const { orgPath } = useOrgPath()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [existingId, setExistingId] = useState(null)
  const [error, setError] = useState(null)

  // EPCM firm profiles for the linked selector
  const [epcmFirms, setEpcmFirms] = useState([])

  const [form, setForm] = useState({
    epcm_firm: '',
    epcm_firm_id: null,
    estimate_class: 'Class 3',
    estimate_date: '',
    total_estimate: '',
    estimate_version: 'V1',
    estimate_basis_year: '',
    contingency_pct: '',
    escalation_pct: '',
    approval_status: 'draft',
    source_document_url: '',
    notes: ''
  })

  useEffect(() => {
    loadExisting()
    loadEpcmFirms()
  }, [projectId])

  async function loadExisting() {
    setLoading(true)
    try {
      let query = supabase
        .from('feed_estimates')
        .select('*')
      if (projectId) {
        query = query.eq('project_id', projectId)
      }
      query = addOrgFilter(query)
      const { data, error: fetchErr } = await query.maybeSingle()

      if (fetchErr) throw fetchErr
      if (data) {
        setExistingId(data.id)
        setForm({
          epcm_firm: data.epcm_firm || '',
          epcm_firm_id: data.epcm_firm_id || null,
          estimate_class: data.estimate_class || 'Class 3',
          estimate_date: data.estimate_date || '',
          total_estimate: data.total_estimate != null ? String(data.total_estimate) : '',
          estimate_version: data.estimate_version || 'V1',
          estimate_basis_year: data.estimate_basis_year != null ? String(data.estimate_basis_year) : '',
          contingency_pct: data.contingency_pct != null ? String(data.contingency_pct) : '',
          escalation_pct: data.escalation_pct != null ? String(data.escalation_pct) : '',
          approval_status: data.approval_status || 'draft',
          source_document_url: data.source_document_url || '',
          notes: data.meta?.notes || ''
        })
      }
    } catch (err) {
      console.error('Error loading FEED estimate:', err)
      setError('Failed to load existing estimate')
    }
    setLoading(false)
  }

  async function loadEpcmFirms() {
    try {
      let query = supabase.from('epcm_firms').select('id, name, short_name').order('name')
      query = addOrgFilter(query)
      const { data } = await query
      setEpcmFirms(data || [])
    } catch (err) {
      console.warn('Could not load EPCM firms:', err)
    }
  }

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleFirmSelect(firmId) {
    if (!firmId) {
      handleChange('epcm_firm_id', null)
      return
    }
    const firm = epcmFirms.find(f => f.id === firmId)
    setForm(prev => ({
      ...prev,
      epcm_firm_id: firmId,
      epcm_firm: firm ? (firm.short_name || firm.name) : prev.epcm_firm
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const orgId = getOrgId()
      const totalNum = form.total_estimate ? parseFloat(form.total_estimate) : null

      const record = {
        organization_id: orgId,
        project_id: projectId || null,
        epcm_firm: form.epcm_firm || null,
        epcm_firm_id: form.epcm_firm_id || null,
        estimate_class: form.estimate_class,
        estimate_date: form.estimate_date || null,
        total_estimate: totalNum,
        estimate_version: form.estimate_version || 'V1',
        estimate_basis_year: form.estimate_basis_year ? parseInt(form.estimate_basis_year) : null,
        contingency_pct: form.contingency_pct ? parseFloat(form.contingency_pct) : null,
        escalation_pct: form.escalation_pct ? parseFloat(form.escalation_pct) : null,
        approval_status: form.approval_status,
        source_document_url: form.source_document_url || null,
        currency: 'CAD',
        meta: { notes: form.notes || '' },
        created_by: user?.id || null
      }

      let result
      if (existingId) {
        const { created_by, ...updateFields } = record
        const { data, error: updateErr } = await supabase
          .from('feed_estimates')
          .update(updateFields)
          .eq('id', existingId)
          .select()
          .single()
        if (updateErr) throw updateErr
        result = data
      } else {
        const { data, error: insertErr } = await supabase
          .from('feed_estimates')
          .insert(record)
          .select()
          .single()
        if (insertErr) throw insertErr
        result = data
        setExistingId(result.id)
      }

      await logFeedAction({
        action: 'feed_estimate_upsert',
        entityType: 'feed_estimate',
        entityId: result.id,
        newValue: JSON.stringify({
          epcm_firm: form.epcm_firm,
          estimate_class: form.estimate_class,
          total_estimate: totalNum,
          estimate_version: form.estimate_version,
          approval_status: form.approval_status
        }),
        organizationId: orgId
      })

      if (onSaved) {
        onSaved(result)
      }
    } catch (err) {
      console.error('Error saving FEED estimate:', err)
      setError(err.message || 'Failed to save estimate')
    }
    setSaving(false)
  }

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading FEED estimate...</div>
  }

  return (
    <div style={{ padding: '20px', maxWidth: '700px' }}>
      <h3 style={{ margin: '0 0 20px', color: '#1a5f2a' }}>
        {existingId ? 'Edit FEED Estimate' : 'Set Up FEED Estimate'}
      </h3>

      {error && (
        <div style={{ padding: '10px 15px', backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: '6px', marginBottom: '16px', color: '#c00' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* EPCM Firm (text) */}
        <div>
          <label style={labelStyle}>EPCM Firm</label>
          <input
            type="text"
            value={form.epcm_firm}
            onChange={e => handleChange('epcm_firm', e.target.value)}
            placeholder="e.g. AECON, Ledcor, SA Energy Group"
            style={inputStyle}
          />
        </div>

        {/* EPCM Firm Profile (linked) */}
        <div>
          <label style={labelStyle}>EPCM Firm Profile (optional)</label>
          <select
            value={form.epcm_firm_id || ''}
            onChange={e => handleFirmSelect(e.target.value || null)}
            style={inputStyle}
          >
            <option value="">-- No linked profile --</option>
            {epcmFirms.map(f => (
              <option key={f.id} value={f.id}>{f.name}{f.short_name ? ` (${f.short_name})` : ''}</option>
            ))}
          </select>
          <p style={helperStyle}>Link to an EPCM firm profile for cross-project scoring (Phase 2).</p>
        </div>

        {/* Estimate Class + Version — side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Estimate Class</label>
            <select
              value={form.estimate_class}
              onChange={e => handleChange('estimate_class', e.target.value)}
              style={inputStyle}
            >
              {ESTIMATE_CLASSES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Estimate Version</label>
            <input
              type="text"
              value={form.estimate_version}
              onChange={e => handleChange('estimate_version', e.target.value)}
              placeholder="V1"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Estimate Date */}
        <div>
          <label style={labelStyle}>Estimate Date</label>
          <input
            type="date"
            value={form.estimate_date}
            onChange={e => handleChange('estimate_date', e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Total Estimate */}
        <div>
          <label style={labelStyle}>Total Estimate (CAD)</label>
          <input
            type="number"
            value={form.total_estimate}
            onChange={e => handleChange('total_estimate', e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            style={inputStyle}
          />
        </div>

        {/* Estimate Basis Year */}
        <div>
          <label style={labelStyle}>Estimate Basis Year</label>
          <input
            type="number"
            value={form.estimate_basis_year}
            onChange={e => handleChange('estimate_basis_year', e.target.value)}
            placeholder="e.g. 2023"
            min="2000"
            max="2099"
            style={inputStyle}
          />
          <p style={helperStyle}>The year unit rates were benchmarked from. Used for inflation normalization.</p>
        </div>

        {/* Contingency + Escalation — side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Contingency %</label>
            <input
              type="number"
              value={form.contingency_pct}
              onChange={e => handleChange('contingency_pct', e.target.value)}
              placeholder="e.g. 15"
              step="0.1"
              min="0"
              max="100"
              style={inputStyle}
            />
            <p style={helperStyle}>Typical Class 3: 15–20%</p>
          </div>
          <div>
            <label style={labelStyle}>Escalation %</label>
            <input
              type="number"
              value={form.escalation_pct}
              onChange={e => handleChange('escalation_pct', e.target.value)}
              placeholder="e.g. 3.5"
              step="0.1"
              min="0"
              max="100"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Approval Status */}
        <div>
          <label style={labelStyle}>Approval Status</label>
          <select
            value={form.approval_status}
            onChange={e => handleChange('approval_status', e.target.value)}
            style={inputStyle}
          >
            {APPROVAL_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Source Document URL */}
        <div>
          <label style={labelStyle}>FEED Report Link</label>
          <input
            type="text"
            value={form.source_document_url}
            onChange={e => handleChange('source_document_url', e.target.value)}
            placeholder="SharePoint or S3 URL"
            style={inputStyle}
          />
          <p style={helperStyle}>Link to the FEED estimate report for traceability.</p>
        </div>

        {/* Notes / Assumptions */}
        <div>
          <label style={labelStyle}>Notes / Assumptions</label>
          <textarea
            value={form.notes}
            onChange={e => handleChange('notes', e.target.value)}
            placeholder="Key assumptions, scope exclusions, contingency basis..."
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {/* Save Button */}
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
            {saving ? 'Saving...' : (existingId ? 'Update Estimate' : 'Create Estimate')}
          </button>
        </div>
      </div>
    </div>
  )
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

const helperStyle = {
  margin: '4px 0 0',
  fontSize: '11px',
  color: '#999'
}
