import React, { useState, useRef } from 'react'
import { useActivityAudit } from './useActivityAudit'

function DitchLog({ data, onChange, contractor, foreman, reportDate, startKP, endKP, metersToday, logId, reportId }) {
  // Audit trail hook
  const { 
    initializeOriginalValues,
    initializeEntryValues,
    logFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'DitchLog')
  
  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure
  const defaultData = {
    // Trench Specifications
    specifiedDepth: '',
    specifiedWidth: '',
    actualDepth: '',
    actualWidth: '',
    
    // Minimum Depth Check
    minimumDepthMet: '',
    depthNotMetReason: '',
    depthNotMetSignoff: '',
    depthNotMetSignoffRole: '',
    depthNotMetDate: '',
    
    // Soil Conditions
    soilConditions: '',
    groundwaterEncountered: '',
    groundwaterDepth: '',
    dewateringRequired: '',
    
    comments: ''
  }

  // Merge incoming data with defaults
  const ditchData = {
    ...defaultData,
    ...data
  }

  // Audit-aware field handlers
  const handleFieldFocus = (fieldName, currentValue) => {
    initializeOriginalValues(originalValuesRef, fieldName, currentValue)
  }

  const handleFieldBlur = (fieldName, newValue, displayName) => {
    logFieldChange(originalValuesRef, fieldName, newValue, displayName)
  }

  const updateField = (field, value) => {
    onChange({ ...ditchData, [field]: value })
  }

  // Styles
  const sectionStyle = {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #dee2e6'
  }

  const sectionHeaderStyle = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: '15px',
    paddingBottom: '8px',
    borderBottom: '2px solid #6f42c1'
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#666',
    marginBottom: '4px'
  }

  const inputStyle = {
    width: '100%',
    padding: '8px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box'
  }

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer'
  }

  return (
    <div style={{ marginTop: '15px' }}>
      {/* INHERITED INFO BAR */}
      {(contractor || foreman || reportDate || startKP || endKP) && (
        <div style={{
          padding: '12px 15px',
          backgroundColor: '#e2d5f1',
          borderRadius: '6px',
          marginBottom: '15px',
          border: '1px solid #6f42c1'
        }}>
          <span style={{ fontSize: '13px', color: '#4a235a' }}>
            <strong>📋 From Activity:</strong>{' '}
            {reportDate && <>Date: <strong>{reportDate}</strong></>}
            {reportDate && contractor && ' | '}
            {contractor && <>Contractor: <strong>{contractor}</strong></>}
            {(reportDate || contractor) && foreman && ' | '}
            {foreman && <>Foreman: <strong>{foreman}</strong></>}
          </span>
          {(startKP || endKP) && (
            <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#d4c4e8', borderRadius: '4px' }}>
              <span style={{ fontSize: '13px', color: '#4a235a' }}>
                <strong>📏 Chainage:</strong>{' '}
                {startKP && <>From: <strong>{startKP}</strong></>}
                {startKP && endKP && ' → '}
                {endKP && <>To: <strong>{endKP}</strong></>}
                {metersToday && <> | <strong style={{ color: '#155724' }}>{metersToday}m Today</strong></>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* TRENCH SPECIFICATIONS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📏 TRENCH SPECIFICATIONS</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Specified Depth (m)</label>
            <input
              type="number"
              step="0.01"
              value={ditchData.specifiedDepth}
              onFocus={() => handleFieldFocus('specifiedDepth', ditchData.specifiedDepth)}
              onChange={(e) => updateField('specifiedDepth', e.target.value)}
              onBlur={(e) => handleFieldBlur('specifiedDepth', e.target.value, 'Specified Depth')}
              placeholder="Per drawings"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Actual Depth (m)</label>
            <input
              type="number"
              step="0.01"
              value={ditchData.actualDepth}
              onFocus={() => handleFieldFocus('actualDepth', ditchData.actualDepth)}
              onChange={(e) => updateField('actualDepth', e.target.value)}
              onBlur={(e) => handleFieldBlur('actualDepth', e.target.value, 'Actual Depth')}
              placeholder="As measured"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Specified Width (m)</label>
            <input
              type="number"
              step="0.01"
              value={ditchData.specifiedWidth}
              onFocus={() => handleFieldFocus('specifiedWidth', ditchData.specifiedWidth)}
              onChange={(e) => updateField('specifiedWidth', e.target.value)}
              onBlur={(e) => handleFieldBlur('specifiedWidth', e.target.value, 'Specified Width')}
              placeholder="Per drawings"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Actual Width (m)</label>
            <input
              type="number"
              step="0.01"
              value={ditchData.actualWidth}
              onFocus={() => handleFieldFocus('actualWidth', ditchData.actualWidth)}
              onChange={(e) => updateField('actualWidth', e.target.value)}
              onBlur={(e) => handleFieldBlur('actualWidth', e.target.value, 'Actual Width')}
              placeholder="As measured"
              style={inputStyle}
            />
          </div>
        </div>

        {/* MINIMUM DEPTH CHECK */}
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#856404', marginBottom: '12px' }}>
            ⚠️ Minimum Depth Verification
          </div>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Minimum Depth Met?</label>
              <select
                value={ditchData.minimumDepthMet}
                onFocus={() => handleFieldFocus('minimumDepthMet', ditchData.minimumDepthMet)}
                onChange={(e) => {
                  updateField('minimumDepthMet', e.target.value)
                  handleFieldBlur('minimumDepthMet', e.target.value, 'Minimum Depth Met')
                }}
                style={{
                  ...selectStyle,
                  backgroundColor: ditchData.minimumDepthMet === 'Yes' ? '#d4edda' : 
                                  ditchData.minimumDepthMet === 'No' ? '#f8d7da' : 'white',
                  fontWeight: 'bold'
                }}
              >
                <option value="">Select...</option>
                <option value="Yes">✓ Yes - Spec Met</option>
                <option value="No">✗ No - Signoff Required</option>
              </select>
            </div>
          </div>
          
          {/* Depth Not Met Section */}
          {ditchData.minimumDepthMet === 'No' && (
            <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#f8d7da', borderRadius: '6px', border: '2px solid #dc3545' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#721c24', marginBottom: '10px' }}>
                🚨 MINIMUM DEPTH NOT MET - SIGNOFF REQUIRED
              </div>
              <div style={gridStyle}>
                <div style={{ gridColumn: 'span 3' }}>
                  <label style={labelStyle}>Reason Minimum Depth Not Met *</label>
                  <textarea
                    value={ditchData.depthNotMetReason}
                    onFocus={() => handleFieldFocus('depthNotMetReason', ditchData.depthNotMetReason)}
                    onChange={(e) => updateField('depthNotMetReason', e.target.value)}
                    onBlur={(e) => handleFieldBlur('depthNotMetReason', e.target.value, 'Depth Not Met Reason')}
                    placeholder="Explain why minimum depth could not be achieved..."
                    style={{
                      ...inputStyle,
                      minHeight: '80px',
                      resize: 'vertical'
                    }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Signoff Name *</label>
                  <input
                    type="text"
                    value={ditchData.depthNotMetSignoff}
                    onFocus={() => handleFieldFocus('depthNotMetSignoff', ditchData.depthNotMetSignoff)}
                    onChange={(e) => updateField('depthNotMetSignoff', e.target.value)}
                    onBlur={(e) => handleFieldBlur('depthNotMetSignoff', e.target.value, 'Depth Signoff Name')}
                    placeholder="Chief Inspector / CM"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Role *</label>
                  <select
                    value={ditchData.depthNotMetSignoffRole}
                    onFocus={() => handleFieldFocus('depthNotMetSignoffRole', ditchData.depthNotMetSignoffRole)}
                    onChange={(e) => {
                      updateField('depthNotMetSignoffRole', e.target.value)
                      handleFieldBlur('depthNotMetSignoffRole', e.target.value, 'Depth Signoff Role')
                    }}
                    style={selectStyle}
                  >
                    <option value="">Select...</option>
                    <option value="Chief Inspector">Chief Inspector</option>
                    <option value="Construction Manager">Construction Manager</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Engineer">Engineer</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date of Signoff</label>
                  <input
                    type="date"
                    value={ditchData.depthNotMetDate}
                    onFocus={() => handleFieldFocus('depthNotMetDate', ditchData.depthNotMetDate)}
                    onChange={(e) => updateField('depthNotMetDate', e.target.value)}
                    onBlur={(e) => handleFieldBlur('depthNotMetDate', e.target.value, 'Depth Signoff Date')}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SOIL CONDITIONS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>🌍 SOIL CONDITIONS</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Soil Conditions</label>
            <select
              value={ditchData.soilConditions}
              onFocus={() => handleFieldFocus('soilConditions', ditchData.soilConditions)}
              onChange={(e) => {
                updateField('soilConditions', e.target.value)
                handleFieldBlur('soilConditions', e.target.value, 'Soil Conditions')
              }}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Sand">Sand</option>
              <option value="Clay">Clay</option>
              <option value="Gravel">Gravel</option>
              <option value="Loam">Loam</option>
              <option value="Muskeg">Muskeg/Organic</option>
              <option value="Mixed">Mixed</option>
              <option value="Rock">Rock</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Groundwater Encountered?</label>
            <select
              value={ditchData.groundwaterEncountered}
              onFocus={() => handleFieldFocus('groundwaterEncountered', ditchData.groundwaterEncountered)}
              onChange={(e) => {
                updateField('groundwaterEncountered', e.target.value)
                handleFieldBlur('groundwaterEncountered', e.target.value, 'Groundwater Encountered')
              }}
              style={selectStyle}
            >
              <option value="">Select...</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
          {ditchData.groundwaterEncountered === 'Yes' && (
            <>
              <div>
                <label style={labelStyle}>Groundwater Depth (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={ditchData.groundwaterDepth}
                  onFocus={() => handleFieldFocus('groundwaterDepth', ditchData.groundwaterDepth)}
                  onChange={(e) => updateField('groundwaterDepth', e.target.value)}
                  onBlur={(e) => handleFieldBlur('groundwaterDepth', e.target.value, 'Groundwater Depth')}
                  placeholder="Depth to water"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Dewatering Required?</label>
                <select
                  value={ditchData.dewateringRequired}
                  onFocus={() => handleFieldFocus('dewateringRequired', ditchData.dewateringRequired)}
                  onChange={(e) => {
                    updateField('dewateringRequired', e.target.value)
                    handleFieldBlur('dewateringRequired', e.target.value, 'Dewatering Required')
                  }}
                  style={selectStyle}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* COMMENTS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>📝 COMMENTS</div>
        <textarea
          value={ditchData.comments}
          onFocus={() => handleFieldFocus('comments', ditchData.comments)}
          onChange={(e) => updateField('comments', e.target.value)}
          onBlur={(e) => handleFieldBlur('comments', e.target.value, 'Comments')}
          placeholder="Additional comments, observations, production notes..."
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '14px',
            minHeight: '80px',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* REMINDER FOR TRACKABLE ITEMS */}
      <div style={{
        padding: '12px 15px',
        backgroundColor: '#fff3cd',
        borderRadius: '6px',
        border: '1px solid #ffc107',
        marginTop: '10px'
      }}>
        <span style={{ fontSize: '13px', color: '#856404' }}>
          <strong>📋 Reminder:</strong> If you encountered <strong>Rock Trench</strong> or required <strong>Extra Depth</strong>, 
          please record these in the <strong>Trackable Items</strong> section below.
        </span>
      </div>
    </div>
  )
}

export default DitchLog
