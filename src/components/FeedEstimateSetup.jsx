import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useOrgQuery, withOrgId } from '../utils/queryHelpers.js'
import { useOrgPath } from '../contexts/OrgContext.jsx'
import { useAuth } from '../AuthContext.jsx'
import { logFeedAction } from '../utils/feedAuditLogger.js'

const ESTIMATE_CLASSES = ['Class 2', 'Class 3', 'Class 4', 'Class 5']

export default function FeedEstimateSetup({ projectId, onSaved }) {
  const { addOrgFilter, getOrgId } = useOrgQuery()
  const { orgPath } = useOrgPath()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [existingId, setExistingId] = useState(null)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    epcm_firm: '',
    estimate_class: 'Class 3',
    estimate_date: '',
    total_estimate: '',
    notes: ''
  })

  useEffect(() => {
    loadExisting()
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
          estimate_class: data.estimate_class || 'Class 3',
          estimate_date: data.estimate_date || '',
          total_estimate: data.total_estimate != null ? String(data.total_estimate) : '',
          notes: data.meta?.notes || ''
        })
      }
    } catch (err) {
      console.error('Error loading FEED estimate:', err)
      setError('Failed to load existing estimate')
    }
    setLoading(false)
  }

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
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
        estimate_class: form.estimate_class,
        estimate_date: form.estimate_date || null,
        total_estimate: totalNum,
        currency: 'CAD',
        meta: { notes: form.notes || '' },
        created_by: user?.id || null
      }

      let result
      if (existingId) {
        const { updated_at, created_by, created_at, ...updateFields } = record
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
          total_estimate: totalNum
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
        {/* EPCM Firm */}
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

        {/* Estimate Class */}
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
