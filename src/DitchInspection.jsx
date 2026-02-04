// ============================================================================
// DitchInspection.jsx - Specialized Ditch/Trench Inspection Component
// Date: January 2026
// Purpose: Comprehensive ditch inspection with pay item tracking,
//          geotagged photos, and "no-talk" transparency model
// ============================================================================

import React, { useState, useRef } from 'react'
import { useActivityAudit } from './useActivityAudit'
import ShieldedInput from './components/common/ShieldedInput.jsx'

// Format KP input to X+XXX format (e.g., 6500 -> 6+500)
function formatKP(kp) {
  if (!kp) return ''
  const str = String(kp).trim()
  if (str.includes('+')) return str
  const num = parseFloat(str)
  if (!isNaN(num)) {
    if (num >= 1000) {
      const km = Math.floor(num / 1000)
      const m = Math.round(num % 1000)
      return `${km}+${m.toString().padStart(3, '0')}`
    }
    if (num > 0 && num < 1000) {
      return `0+${Math.round(num).toString().padStart(3, '0')}`
    }
  }
  return str
}

function DitchInspection({
  data,
  onChange,
  contractor,
  foreman,
  reportDate,
  startKP,
  endKP,
  metersToday,
  logId,
  reportId
}) {
  // Audit trail hook
  const {
    initializeOriginalValues,
    initializeEntryValues,
    logFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'DitchInspection')

  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Collapsed sections state
  const [expandedSections, setExpandedSections] = useState({
    payItems: true,
    botChecklist: true,
    waterManagement: false,
    soilConditions: true,
    depthCompliance: true
  })


  // Default data structure
  const defaultData = {
    // Standard Measurements
    trenchWidth: '',
    trenchDepth: '',
    depthOfCoverRequired: '',
    depthOfCoverActual: '',

    // Padding/Bedding UPI
    paddingBedding: false,
    paddingBeddingFromKP: '',
    paddingBeddingToKP: '',
    paddingBeddingMeters: '',
    paddingMaterial: '',
    paddingBeddingVerified: false,

    // BOT Checklist
    botChecklist: {
      freeOfRocks: null,
      freeOfDebris: null,
      siltFencesIntact: null,
      wildlifeRamps: null,
      wildlifeGaps: null,
      gradeAcceptable: null,
      issues: ''
    },

    // Water Management
    waterManagement: {
      pumpingActivity: false,
      pumpingEquipment: '',
      pumpingHours: '',
      filterBagUsage: false,
      filterBagCount: '',
      dischargeLocation: '',
      dischargePermitNumber: '',
      notes: ''
    },

    // Soil & Compliance
    soilConditions: '',
    groundwaterEncountered: '',
    groundwaterDepth: '',
    dewateringRequired: '',
    minimumDepthMet: '',
    depthNotMetReason: '',
    depthNotMetSignoff: '',
    depthNotMetSignoffRole: '',
    depthNotMetDate: '',
    comments: ''
  }

  // Merge incoming data with defaults
  const ditchData = {
    ...defaultData,
    ...data,
    botChecklist: { ...defaultData.botChecklist, ...(data?.botChecklist || {}) },
    waterManagement: { ...defaultData.waterManagement, ...(data?.waterManagement || {}) }
  }

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
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

  const updateBOTChecklist = (field, value) => {
    onChange({
      ...ditchData,
      botChecklist: { ...ditchData.botChecklist, [field]: value }
    })
  }

  const updateWaterManagement = (field, value) => {
    onChange({
      ...ditchData,
      waterManagement: { ...ditchData.waterManagement, [field]: value }
    })
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

  const collapsibleHeaderStyle = {
    width: '100%',
    padding: '12px 15px',
    backgroundColor: '#e9ecef',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '10px'
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

  const checkboxContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px',
    backgroundColor: '#fff',
    borderRadius: '4px',
    border: '1px solid #dee2e6'
  }

  // Render BOT checklist item
  const renderBOTItem = (fieldName, label) => {
    const value = ditchData.botChecklist[fieldName]
    return (
      <div style={checkboxContainerStyle}>
        <label style={{ flex: 1, fontSize: '13px', cursor: 'pointer' }}>{label}</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => updateBOTChecklist(fieldName, true)}
            style={{
              padding: '6px 12px',
              backgroundColor: value === true ? '#28a745' : '#f8f9fa',
              color: value === true ? 'white' : '#333',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: value === true ? 'bold' : 'normal'
            }}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => updateBOTChecklist(fieldName, false)}
            style={{
              padding: '6px 12px',
              backgroundColor: value === false ? '#dc3545' : '#f8f9fa',
              color: value === false ? 'white' : '#333',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: value === false ? 'bold' : 'normal'
            }}
          >
            No
          </button>
        </div>
      </div>
    )
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
            <strong>From Activity:</strong>{' '}
            {reportDate && <>Date: <strong>{reportDate}</strong></>}
            {reportDate && contractor && ' | '}
            {contractor && <>Contractor: <strong>{contractor}</strong></>}
            {(reportDate || contractor) && foreman && ' | '}
            {foreman && <>Foreman: <strong>{foreman}</strong></>}
          </span>
          {(startKP || endKP) && (
            <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#d4c4e8', borderRadius: '4px' }}>
              <span style={{ fontSize: '13px', color: '#4a235a' }}>
                <strong>Chainage:</strong>{' '}
                {startKP && <>From: <strong>{startKP}</strong></>}
                {startKP && endKP && ' to '}
                {endKP && <>To: <strong>{endKP}</strong></>}
                {metersToday && <> | <strong style={{ color: '#155724' }}>{metersToday}m Today</strong></>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* TRENCH SPECIFICATIONS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>TRENCH SPECIFICATIONS</div>
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Trench Width (m)</label>
            <ShieldedInput
              type="text"
              inputMode="decimal"
              value={ditchData.trenchWidth}
              onFocus={() => handleFieldFocus('trenchWidth', ditchData.trenchWidth)}
              onChange={(val) => updateField('trenchWidth', val)}
              onBlur={(e) => handleFieldBlur('trenchWidth', e.target.value, 'Trench Width')}
              placeholder="As measured"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Trench Depth (m)</label>
            <ShieldedInput
              type="text"
              inputMode="decimal"
              value={ditchData.trenchDepth}
              onFocus={() => handleFieldFocus('trenchDepth', ditchData.trenchDepth)}
              onChange={(val) => updateField('trenchDepth', val)}
              onBlur={(e) => handleFieldBlur('trenchDepth', e.target.value, 'Trench Depth')}
              placeholder="As measured"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Depth of Cover Required (m)</label>
            <ShieldedInput
              type="text"
              inputMode="decimal"
              value={ditchData.depthOfCoverRequired}
              onFocus={() => handleFieldFocus('depthOfCoverRequired', ditchData.depthOfCoverRequired)}
              onChange={(val) => updateField('depthOfCoverRequired', val)}
              onBlur={(e) => handleFieldBlur('depthOfCoverRequired', e.target.value, 'Depth of Cover Required')}
              placeholder="Per spec"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Depth of Cover Actual (m)</label>
            <ShieldedInput
              type="text"
              inputMode="decimal"
              value={ditchData.depthOfCoverActual}
              onFocus={() => handleFieldFocus('depthOfCoverActual', ditchData.depthOfCoverActual)}
              onChange={(val) => updateField('depthOfCoverActual', val)}
              onBlur={(e) => handleFieldBlur('depthOfCoverActual', e.target.value, 'Depth of Cover Actual')}
              placeholder="As achieved"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* PAY ITEMS (UPIs) */}
      <div style={{
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#fff3cd',
        borderRadius: '8px',
        border: '2px solid #ffc107'
      }}>
        <button
          type="button"
          onClick={() => toggleSection('payItems')}
          style={{
            ...collapsibleHeaderStyle,
            backgroundColor: '#ffc107',
            color: '#333'
          }}
        >
          <span>PAY ITEMS (UPIs) - Inspector Verification Required</span>
          <span>{expandedSections.payItems ? '[-]' : '[+]'}</span>
        </button>

        {expandedSections.payItems && (
          <div style={{ marginTop: '10px' }}>
            {/* PADDING/BEDDING */}
            <div style={{
              padding: '15px',
              backgroundColor: '#fff',
              borderRadius: '6px',
              border: ditchData.paddingBedding ? '2px solid #28a745' : '1px solid #dee2e6'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  id="paddingBedding"
                  checked={ditchData.paddingBedding || false}
                  onChange={(e) => {
                    updateField('paddingBedding', e.target.checked)
                    handleFieldBlur('paddingBedding', e.target.checked, 'Padding/Bedding')
                  }}
                  style={{ width: '20px', height: '20px' }}
                />
                <label htmlFor="paddingBedding" style={{ fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Padding/Bedding Required
                </label>
              </div>

              {ditchData.paddingBedding && (
                <div style={{ marginLeft: '35px' }}>
                  <div style={gridStyle}>
                    <div>
                      <label style={labelStyle}>From KP</label>
                      <ShieldedInput
                        type="text"
                        value={ditchData.paddingBeddingFromKP || ''}
                        onFocus={() => handleFieldFocus('paddingBeddingFromKP', ditchData.paddingBeddingFromKP)}
                        onChange={(val) => updateField('paddingBeddingFromKP', val)}
                        onBlur={(e) => {
                          const formatted = formatKP(e.target.value)
                          if (formatted !== e.target.value) {
                            updateField('paddingBeddingFromKP', formatted)
                          }
                          handleFieldBlur('paddingBeddingFromKP', formatted, 'Padding/Bedding From KP')
                        }}
                        placeholder="e.g. 6+500"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>To KP</label>
                      <ShieldedInput
                        type="text"
                        value={ditchData.paddingBeddingToKP || ''}
                        onFocus={() => handleFieldFocus('paddingBeddingToKP', ditchData.paddingBeddingToKP)}
                        onChange={(val) => updateField('paddingBeddingToKP', val)}
                        onBlur={(e) => {
                          const formatted = formatKP(e.target.value)
                          if (formatted !== e.target.value) {
                            updateField('paddingBeddingToKP', formatted)
                          }
                          handleFieldBlur('paddingBeddingToKP', formatted, 'Padding/Bedding To KP')
                        }}
                        placeholder="e.g. 7+200"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Padding/Bedding Metres</label>
                      <ShieldedInput
                        type="text"
                        inputMode="decimal"
                        value={ditchData.paddingBeddingMeters}
                        onFocus={() => handleFieldFocus('paddingBeddingMeters', ditchData.paddingBeddingMeters)}
                        onChange={(val) => updateField('paddingBeddingMeters', val)}
                        onBlur={(e) => handleFieldBlur('paddingBeddingMeters', e.target.value, 'Padding/Bedding Metres')}
                        placeholder="Total metres"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Material Type</label>
                      <select
                        value={ditchData.paddingMaterial}
                        onFocus={() => handleFieldFocus('paddingMaterial', ditchData.paddingMaterial)}
                        onChange={(e) => {
                          updateField('paddingMaterial', e.target.value)
                          handleFieldBlur('paddingMaterial', e.target.value, 'Padding Material')
                        }}
                        style={selectStyle}
                      >
                        <option value="">Select material...</option>
                        <option value="sand">Sand</option>
                        <option value="screened">Screened Material</option>
                        <option value="imported">Imported Fill</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={ditchData.paddingBeddingVerified || false}
                          onChange={(e) => {
                            updateField('paddingBeddingVerified', e.target.checked)
                            handleFieldBlur('paddingBeddingVerified', e.target.checked, 'Padding/Bedding Verified')
                          }}
                          style={{ width: '18px', height: '18px' }}
                        />
                        <span style={{ fontSize: '13px', color: ditchData.paddingBeddingVerified ? '#28a745' : '#666' }}>
                          {ditchData.paddingBeddingVerified ? 'VERIFIED' : 'Verify'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* BOT CHECKLIST */}
      <div style={{
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#e7f3ff',
        borderRadius: '8px',
        border: '2px solid #17a2b8'
      }}>
        <button
          type="button"
          onClick={() => toggleSection('botChecklist')}
          style={{
            ...collapsibleHeaderStyle,
            backgroundColor: '#17a2b8',
            color: 'white'
          }}
        >
          <span>BOT (Bottom of Trench) CHECKLIST</span>
          <span>{expandedSections.botChecklist ? '[-]' : '[+]'}</span>
        </button>

        {expandedSections.botChecklist && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px', marginTop: '10px' }}>
            {renderBOTItem('freeOfRocks', 'BOT free of rocks?')}
            {renderBOTItem('freeOfDebris', 'BOT free of debris?')}
            {renderBOTItem('siltFencesIntact', 'Silt fences intact?')}
            {renderBOTItem('wildlifeRamps', 'Wildlife ramps in place?')}
            {renderBOTItem('wildlifeGaps', 'Wildlife gaps maintained?')}
            {renderBOTItem('gradeAcceptable', 'Grade acceptable?')}

            {/* BOT Issues */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>BOT Issues / Notes</label>
              <ShieldedInput
                as="textarea"
                value={ditchData.botChecklist.issues}
                onFocus={() => handleFieldFocus('botIssues', ditchData.botChecklist.issues)}
                onChange={(val) => updateBOTChecklist('issues', val)}
                onBlur={(e) => handleFieldBlur('botIssues', e.target.value, 'BOT Issues')}
                placeholder="Document any BOT issues or required corrections..."
                style={{
                  ...inputStyle,
                  minHeight: '60px',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* WATER MANAGEMENT */}
      <div style={sectionStyle}>
        <button
          type="button"
          onClick={() => toggleSection('waterManagement')}
          style={collapsibleHeaderStyle}
        >
          <span>WATER MANAGEMENT</span>
          <span>{expandedSections.waterManagement ? '[-]' : '[+]'}</span>
        </button>

        {expandedSections.waterManagement && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ditchData.waterManagement.pumpingActivity || false}
                  onChange={(e) => {
                    updateWaterManagement('pumpingActivity', e.target.checked)
                    handleFieldBlur('pumpingActivity', e.target.checked, 'Pumping Activity')
                  }}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Pumping Activity Today</span>
              </label>
            </div>

            {ditchData.waterManagement.pumpingActivity && (
              <div style={gridStyle}>
                <div>
                  <label style={labelStyle}>Pumping Equipment</label>
                  <ShieldedInput
                    type="text"
                    value={ditchData.waterManagement.pumpingEquipment}
                    onFocus={() => handleFieldFocus('pumpingEquipment', ditchData.waterManagement.pumpingEquipment)}
                    onChange={(val) => updateWaterManagement('pumpingEquipment', val)}
                    onBlur={(e) => handleFieldBlur('pumpingEquipment', e.target.value, 'Pumping Equipment')}
                    placeholder="e.g., 4&quot; trash pump"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Pumping Hours</label>
                  <ShieldedInput
                    type="text"
                    inputMode="decimal"
                    value={ditchData.waterManagement.pumpingHours}
                    onFocus={() => handleFieldFocus('pumpingHours', ditchData.waterManagement.pumpingHours)}
                    onChange={(val) => updateWaterManagement('pumpingHours', val)}
                    onBlur={(e) => handleFieldBlur('pumpingHours', e.target.value, 'Pumping Hours')}
                    placeholder="Hours"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <div style={{ marginTop: '15px', marginBottom: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ditchData.waterManagement.filterBagUsage || false}
                  onChange={(e) => {
                    updateWaterManagement('filterBagUsage', e.target.checked)
                    handleFieldBlur('filterBagUsage', e.target.checked, 'Filter Bag Usage')
                  }}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Filter Bags Used</span>
              </label>
            </div>

            {ditchData.waterManagement.filterBagUsage && (
              <div style={gridStyle}>
                <div>
                  <label style={labelStyle}>Filter Bag Count</label>
                  <ShieldedInput
                    type="text"
                    inputMode="decimal"
                    value={ditchData.waterManagement.filterBagCount}
                    onFocus={() => handleFieldFocus('filterBagCount', ditchData.waterManagement.filterBagCount)}
                    onChange={(val) => updateWaterManagement('filterBagCount', val)}
                    onBlur={(e) => handleFieldBlur('filterBagCount', e.target.value, 'Filter Bag Count')}
                    placeholder="Number used"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Discharge Location</label>
                  <ShieldedInput
                    type="text"
                    value={ditchData.waterManagement.dischargeLocation}
                    onFocus={() => handleFieldFocus('dischargeLocation', ditchData.waterManagement.dischargeLocation)}
                    onChange={(val) => updateWaterManagement('dischargeLocation', val)}
                    onBlur={(e) => handleFieldBlur('dischargeLocation', e.target.value, 'Discharge Location')}
                    placeholder="Where water is discharged"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Discharge Permit #</label>
                  <ShieldedInput
                    type="text"
                    value={ditchData.waterManagement.dischargePermitNumber}
                    onFocus={() => handleFieldFocus('dischargePermitNumber', ditchData.waterManagement.dischargePermitNumber)}
                    onChange={(val) => updateWaterManagement('dischargePermitNumber', val)}
                    onBlur={(e) => handleFieldBlur('dischargePermitNumber', e.target.value, 'Discharge Permit Number')}
                    placeholder="Permit number"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <div style={{ marginTop: '15px' }}>
              <label style={labelStyle}>Water Management Notes</label>
              <ShieldedInput
                as="textarea"
                value={ditchData.waterManagement.notes}
                onFocus={() => handleFieldFocus('waterManagementNotes', ditchData.waterManagement.notes)}
                onChange={(val) => updateWaterManagement('notes', val)}
                onBlur={(e) => handleFieldBlur('waterManagementNotes', e.target.value, 'Water Management Notes')}
                placeholder="Additional water management observations..."
                style={{
                  ...inputStyle,
                  minHeight: '60px',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* SOIL CONDITIONS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>SOIL CONDITIONS</div>
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
                <ShieldedInput
                  type="text"
                  inputMode="decimal"
                  value={ditchData.groundwaterDepth}
                  onFocus={() => handleFieldFocus('groundwaterDepth', ditchData.groundwaterDepth)}
                  onChange={(val) => updateField('groundwaterDepth', val)}
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

      {/* DEPTH COMPLIANCE */}
      <div style={{
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: ditchData.minimumDepthMet === 'No' ? '#f8d7da' : '#d4edda',
        borderRadius: '8px',
        border: ditchData.minimumDepthMet === 'No' ? '2px solid #dc3545' : '2px solid #28a745'
      }}>
        <div style={sectionHeaderStyle}>DEPTH COMPLIANCE</div>
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
              <option value="Yes">Yes - Spec Met</option>
              <option value="No">No - Signoff Required</option>
            </select>
          </div>
        </div>

        {/* Depth Not Met Section */}
        {ditchData.minimumDepthMet === 'No' && (
          <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#fff', borderRadius: '6px', border: '2px solid #dc3545' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#721c24', marginBottom: '12px' }}>
              MINIMUM DEPTH NOT MET - SIGNOFF REQUIRED
            </div>
            <div style={gridStyle}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Reason Minimum Depth Not Met *</label>
                <ShieldedInput
                  as="textarea"
                  value={ditchData.depthNotMetReason}
                  onFocus={() => handleFieldFocus('depthNotMetReason', ditchData.depthNotMetReason)}
                  onChange={(val) => updateField('depthNotMetReason', val)}
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
                <ShieldedInput
                  type="text"
                  value={ditchData.depthNotMetSignoff}
                  onFocus={() => handleFieldFocus('depthNotMetSignoff', ditchData.depthNotMetSignoff)}
                  onChange={(val) => updateField('depthNotMetSignoff', val)}
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
                <ShieldedInput
                  type="date"
                  value={ditchData.depthNotMetDate}
                  onFocus={() => handleFieldFocus('depthNotMetDate', ditchData.depthNotMetDate)}
                  onChange={(val) => updateField('depthNotMetDate', val)}
                  onBlur={(e) => handleFieldBlur('depthNotMetDate', e.target.value, 'Depth Signoff Date')}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* COMMENTS */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>COMMENTS</div>
        <ShieldedInput
          as="textarea"
          value={ditchData.comments}
          onFocus={() => handleFieldFocus('comments', ditchData.comments)}
          onChange={(val) => updateField('comments', val)}
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
    </div>
  )
}

export default DitchInspection
