// CrossingSupport.jsx
// Billable pipe support tracking for Tie-in Backfill activities
// Links directly to trackable_items table for financial reconciliation

import React, { useState, useRef, useEffect } from 'react'
import { supabase } from './supabase'
import { useActivityAudit } from './useActivityAudit'
import { useOrgQuery } from './utils/queryHelpers.js'
import { extractGPSFromImage, formatGPSCoordinates } from './exifUtils'

// Material types with their specific field configurations
const SUPPORT_TYPES = [
  {
    id: 'sandbag_piers',
    label: 'Sandbag Piers',
    icon: '🏗️',
    color: '#fd7e14',
    itemName: 'Sandbag Piers',
    uom: 'Each',
    fields: [
      { name: 'totalBagCount', label: 'Total Bag Count', type: 'number', required: true },
      { name: 'numberOfPiers', label: 'Number of Piers', type: 'number', required: true },
      { name: 'bagsPerPier', label: 'Bags per Pier', type: 'number', computed: true },
      { name: 'pierHeight', label: 'Pier Height (mm)', type: 'number' },
      { name: 'bagMaterial', label: 'Bag Material', type: 'select', options: ['Burlap', 'Polypropylene', 'Other'] }
    ]
  },
  {
    id: 'polyurethane_foam',
    label: 'Polyurethane Foam',
    icon: '🧪',
    color: '#17a2b8',
    itemName: 'Polyurethane Foam Support',
    uom: 'm³',
    fields: [
      { name: 'volumeM3', label: 'Volume (m³)', type: 'number', step: '0.01' },
      { name: 'numberOfKits', label: 'Number of Kits', type: 'number' },
      { name: 'foamType', label: 'Foam Type', type: 'select', options: ['Rigid', 'Flexible', 'Two-Part Expanding'] },
      { name: 'manufacturer', label: 'Manufacturer', type: 'text' },
      { name: 'cureTime', label: 'Cure Time (min)', type: 'number' }
    ]
  },
  {
    id: 'native_subsoil',
    label: 'Native/Select Subsoil',
    icon: '🏔️',
    color: '#6c757d',
    itemName: 'Compacted Benching',
    uom: 'LM',
    fields: [
      { name: 'linearMeters', label: 'Linear Meters', type: 'number', step: '0.1', required: true },
      { name: 'benchWidth', label: 'Bench Width (mm)', type: 'number' },
      { name: 'benchHeight', label: 'Bench Height (mm)', type: 'number' },
      { name: 'compactionMethod', label: 'Compaction Method', type: 'select', options: ['Track Walking', 'Vibratory Plate', 'Jumping Jack', 'Roller'] },
      { name: 'materialSource', label: 'Material Source', type: 'select', options: ['Native', 'Select Fill', 'Imported'] }
    ]
  },
  {
    id: 'concrete_sleepers',
    label: 'Concrete Sleepers',
    icon: '🧱',
    color: '#28a745',
    itemName: 'Concrete Sleepers',
    uom: 'Each',
    fields: [
      { name: 'quantity', label: 'Quantity', type: 'number', required: true },
      { name: 'interfaceMaterial', label: 'Interface Material', type: 'select', options: ['Rubber Pad', 'Wood Lagging', 'Neoprene', 'HDPE', 'None'], required: true },
      { name: 'sleeperDimensions', label: 'Sleeper Dimensions', type: 'text', placeholder: 'e.g., 300x300x600mm' },
      { name: 'reinforcementType', label: 'Reinforcement', type: 'select', options: ['Standard Rebar', 'Fiber Reinforced', 'None'] },
      { name: 'anchorage', label: 'Anchorage Method', type: 'select', options: ['Embedded', 'Surface Mounted', 'Keyed', 'N/A'] }
    ]
  }
]

function CrossingSupport({
  data,
  onChange,
  reportId,
  reportDate,
  startKP,
  endKP,
  projectId,
  inspector,
  logId
}) {
  // Track support entries
  const [supports, setSupports] = useState(data?.supports || [])
  const [expandedSupport, setExpandedSupport] = useState(null)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [savingToTrackable, setSavingToTrackable] = useState(false)

  // Multi-tenant support
  const { getOrgId } = useOrgQuery()

  // Audit trail hook
  const {
    initializeOriginalValues,
    logFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'CrossingSupport')

  const originalValuesRef = useRef({})

  // Sync supports with parent
  useEffect(() => {
    if (data?.supports) {
      setSupports(data.supports)
    }
  }, [data?.supports])

  // Notify parent of changes
  const updateParent = (newSupports) => {
    setSupports(newSupports)
    onChange({ ...data, supports: newSupports })
  }

  // Add new support entry
  const addSupport = (typeId) => {
    const supportType = SUPPORT_TYPES.find(t => t.id === typeId)
    const newSupport = {
      id: Date.now(),
      type: typeId,
      typeName: supportType.label,
      itemName: supportType.itemName,
      uom: supportType.uom,
      kpLocation: startKP || '',
      // Data inheritance fields
      parentWeldId: '',
      inheritedCoatingType: '',
      inheritedWallThickness: '',
      // Validation
      elevationVerified: false,
      recordStatus: 'Pending Review',
      // Photo evidence
      photos: [],
      // Financial tracking
      savedToTrackable: false,
      trackableItemId: null,
      // Notes
      notes: '',
      // Initialize type-specific fields
      ...supportType.fields.reduce((acc, field) => {
        acc[field.name] = ''
        return acc
      }, {})
    }

    const newSupports = [...supports, newSupport]
    updateParent(newSupports)
    setExpandedSupport(newSupport.id)
    logEntryAdd('Crossing Support', `${supportType.label} added`)
  }

  // Update support field
  const updateSupport = (supportId, field, value) => {
    const newSupports = supports.map(s => {
      if (s.id === supportId) {
        const updated = { ...s, [field]: value }

        // Auto-calculate bags per pier for sandbag type
        if (s.type === 'sandbag_piers' && (field === 'totalBagCount' || field === 'numberOfPiers')) {
          const bags = field === 'totalBagCount' ? parseFloat(value) : parseFloat(s.totalBagCount)
          const piers = field === 'numberOfPiers' ? parseFloat(value) : parseFloat(s.numberOfPiers)
          if (bags && piers && piers > 0) {
            updated.bagsPerPier = Math.round(bags / piers)
          }
        }

        return updated
      }
      return s
    })
    updateParent(newSupports)
  }

  // Handle field focus for audit
  const handleFieldFocus = (supportId, fieldName, currentValue) => {
    const key = `${supportId}_${fieldName}`
    if (!originalValuesRef.current[key]) {
      originalValuesRef.current[key] = currentValue
    }
  }

  // Handle field blur for audit logging
  const handleFieldBlur = (supportId, fieldName, newValue, displayName) => {
    const key = `${supportId}_${fieldName}`
    const originalValue = originalValuesRef.current[key]

    if (originalValue !== undefined && originalValue !== newValue) {
      const support = supports.find(s => s.id === supportId)
      const entryLabel = support ? `${support.typeName} at ${support.kpLocation || 'KP N/A'}` : 'Support Entry'
      logFieldChange(originalValuesRef, key, newValue, `${displayName} (${entryLabel})`)
    }
  }

  // Remove support entry
  const removeSupport = async (supportId) => {
    const support = supports.find(s => s.id === supportId)

    // If saved to trackable items, remove from there too
    if (support?.trackableItemId) {
      try {
        await supabase.from('trackable_items').delete().eq('id', support.trackableItemId)
      } catch (err) {
        console.error('Error removing trackable item:', err)
      }
    }

    const newSupports = supports.filter(s => s.id !== supportId)
    updateParent(newSupports)
    logEntryDelete('Crossing Support', support?.typeName || 'Support Entry')
  }

  // Photo upload with EXIF extraction
  const handlePhotoUpload = async (supportId, event) => {
    const files = Array.from(event.target.files)
    if (files.length === 0) return

    setProcessingPhoto(true)

    try {
      const newPhotos = await Promise.all(files.map(async (file) => {
        const gpsData = await extractGPSFromImage(file)

        return {
          id: Date.now() + Math.random(),
          file: file,
          filename: file.name,
          photoType: 'support_evidence',
          kpLocation: supports.find(s => s.id === supportId)?.kpLocation || startKP || '',
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          gpsAccuracy: gpsData.accuracy,
          gpsDirection: gpsData.direction,
          gpsAltitude: gpsData.altitude,
          hasGPS: gpsData.hasGPS,
          exifExtracted: gpsData.hasGPS,
          uploadedAt: new Date().toISOString()
        }
      }))

      const support = supports.find(s => s.id === supportId)
      const currentPhotos = support?.photos || []
      updateSupport(supportId, 'photos', [...currentPhotos, ...newPhotos])
      logEntryAdd('Support Photo', `${newPhotos.length} photo(s) uploaded for ${support?.typeName}`)
    } catch (err) {
      console.error('Photo upload error:', err)
    } finally {
      setProcessingPhoto(false)
    }
  }

  // Remove photo
  const removePhoto = (supportId, photoId) => {
    const support = supports.find(s => s.id === supportId)
    const photos = support?.photos || []
    updateSupport(supportId, 'photos', photos.filter(p => p.id !== photoId))
    logEntryDelete('Support Photo', 'Photo removed')
  }

  // Save to trackable_items table for billing
  const saveToTrackableItems = async (supportId) => {
    const support = supports.find(s => s.id === supportId)
    if (!support) return

    setSavingToTrackable(true)

    try {
      // Determine quantity based on support type
      let quantity = 0
      if (support.type === 'sandbag_piers') {
        quantity = parseFloat(support.numberOfPiers) || 0
      } else if (support.type === 'polyurethane_foam') {
        quantity = parseFloat(support.volumeM3) || parseFloat(support.numberOfKits) || 0
      } else if (support.type === 'native_subsoil') {
        quantity = parseFloat(support.linearMeters) || 0
      } else if (support.type === 'concrete_sleepers') {
        quantity = parseFloat(support.quantity) || 0
      }

      // Build the trackable item record
      const trackableRecord = {
        project_id: projectId || 'default',
        report_id: reportId,
        report_date: reportDate,
        inspector: inspector,
        item_type: 'crossing_support',
        action: 'Install',
        quantity: quantity,
        kp_location: support.kpLocation,
        organization_id: getOrgId(),
        notes: JSON.stringify({
          supportType: support.type,
          typeName: support.typeName,
          itemName: support.itemName,
          uom: support.uom,
          parentWeldId: support.parentWeldId,
          inheritedCoatingType: support.inheritedCoatingType,
          inheritedWallThickness: support.inheritedWallThickness,
          elevationVerified: support.elevationVerified,
          // Type-specific details
          ...SUPPORT_TYPES.find(t => t.id === support.type)?.fields.reduce((acc, field) => {
            if (support[field.name]) acc[field.name] = support[field.name]
            return acc
          }, {}),
          // Photo evidence
          photoCount: support.photos?.length || 0,
          hasGPSEvidence: support.photos?.some(p => p.hasGPS) || false
        })
      }

      let result
      if (support.trackableItemId) {
        // Update existing
        const { data, error } = await supabase
          .from('trackable_items')
          .update(trackableRecord)
          .eq('id', support.trackableItemId)
          .select()
        if (error) throw error
        result = data?.[0]
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('trackable_items')
          .insert(trackableRecord)
          .select()
        if (error) throw error
        result = data?.[0]
      }

      if (result) {
        updateSupport(supportId, 'savedToTrackable', true)
        updateSupport(supportId, 'trackableItemId', result.id)
        logEntryAdd('Trackable Item', `${support.typeName} saved to billing - Qty: ${quantity} ${support.uom}`)
      }
    } catch (err) {
      console.error('Error saving to trackable items:', err)
      alert('Error saving to trackable items: ' + err.message)
    } finally {
      setSavingToTrackable(false)
    }
  }

  // Get quantity for display
  const getQuantity = (support) => {
    if (support.type === 'sandbag_piers') return support.numberOfPiers || 0
    if (support.type === 'polyurethane_foam') return support.volumeM3 || support.numberOfKits || 0
    if (support.type === 'native_subsoil') return support.linearMeters || 0
    if (support.type === 'concrete_sleepers') return support.quantity || 0
    return 0
  }

  // Styles
  const sectionStyle = {
    marginBottom: '15px',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    overflow: 'hidden'
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

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px'
  }

  return (
    <div>
      {/* Add Support Buttons */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        marginBottom: '15px'
      }}>
        {SUPPORT_TYPES.map(type => (
          <button
            key={type.id}
            onClick={() => addSupport(type.id)}
            style={{
              padding: '10px 15px',
              backgroundColor: type.color,
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>{type.icon}</span>
            <span>+ {type.label}</span>
          </button>
        ))}
      </div>

      {/* Support Entries */}
      {supports.length === 0 ? (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          color: '#666',
          fontStyle: 'italic',
          backgroundColor: '#f8f9fa',
          borderRadius: '6px'
        }}>
          No pipe supports recorded. Click a button above to add a support type.
        </div>
      ) : (
        supports.map((support, idx) => {
          const supportType = SUPPORT_TYPES.find(t => t.id === support.type)
          const isExpanded = expandedSupport === support.id
          const hasPhoto = support.photos?.length > 0
          const hasGPS = support.photos?.some(p => p.hasGPS)
          const isTechnicalRisk = !support.elevationVerified

          return (
            <div
              key={support.id}
              style={{
                ...sectionStyle,
                border: `2px solid ${supportType?.color || '#dee2e6'}`,
                backgroundColor: isTechnicalRisk && support.savedToTrackable ? '#fff8e1' : '#fff'
              }}
            >
              {/* Header */}
              <div
                onClick={() => setExpandedSupport(isExpanded ? null : support.id)}
                style={{
                  padding: '12px 15px',
                  backgroundColor: isExpanded ? supportType?.color : '#f8f9fa',
                  color: isExpanded ? 'white' : '#333',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{supportType?.icon}</span>
                  <span>{supportType?.label} #{idx + 1}</span>
                  {support.kpLocation && <span style={{ fontWeight: 'normal', fontSize: '12px' }}>@ {support.kpLocation}</span>}
                  {support.savedToTrackable && <span style={{ backgroundColor: '#28a745', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>BILLABLE</span>}
                  {isTechnicalRisk && support.savedToTrackable && <span style={{ backgroundColor: '#ffc107', color: '#333', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>TECH RISK</span>}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px' }}>
                    Qty: <strong>{getQuantity(support)} {support.uom}</strong>
                  </span>
                  {hasPhoto && <span title="Has photo evidence">📷</span>}
                  {hasGPS && <span title="Has GPS coordinates">📍</span>}
                  <span>{isExpanded ? '▼' : '▶'}</span>
                </span>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{ padding: '15px' }}>
                  {/* Technical Risk Warning */}
                  {isTechnicalRisk && support.savedToTrackable && (
                    <div style={{
                      padding: '10px',
                      backgroundColor: '#fff3cd',
                      border: '1px solid #ffc107',
                      borderRadius: '6px',
                      marginBottom: '15px',
                      fontSize: '13px',
                      color: '#856404'
                    }}>
                      ⚠️ <strong>Technical Risk Flag:</strong> Elevation not verified. This item will be flagged in Reconciliation Dashboard.
                    </div>
                  )}

                  {/* Location & Inheritance Section */}
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#e8f4f8',
                    borderRadius: '6px',
                    marginBottom: '15px',
                    border: '1px solid #17a2b8'
                  }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#17a2b8', fontWeight: 'bold' }}>
                      🔗 LOCATION & DATA INHERITANCE
                    </h4>
                    <div style={gridStyle}>
                      <div>
                        <label style={labelStyle}>KP Location *</label>
                        <input
                          type="text"
                          value={support.kpLocation}
                          onFocus={() => handleFieldFocus(support.id, 'kpLocation', support.kpLocation)}
                          onChange={(e) => updateSupport(support.id, 'kpLocation', e.target.value)}
                          onBlur={(e) => handleFieldBlur(support.id, 'kpLocation', e.target.value, 'KP Location')}
                          placeholder="e.g., 5+250"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Parent Weld/Pipe ID (Lookup)</label>
                        <input
                          type="text"
                          value={support.parentWeldId}
                          onFocus={() => handleFieldFocus(support.id, 'parentWeldId', support.parentWeldId)}
                          onChange={(e) => updateSupport(support.id, 'parentWeldId', e.target.value)}
                          onBlur={(e) => handleFieldBlur(support.id, 'parentWeldId', e.target.value, 'Parent Weld ID')}
                          placeholder="e.g., W-1234 or Pipe ID"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Inherited Coating Type</label>
                        <input
                          type="text"
                          value={support.inheritedCoatingType}
                          onFocus={() => handleFieldFocus(support.id, 'inheritedCoatingType', support.inheritedCoatingType)}
                          onChange={(e) => updateSupport(support.id, 'inheritedCoatingType', e.target.value)}
                          onBlur={(e) => handleFieldBlur(support.id, 'inheritedCoatingType', e.target.value, 'Inherited Coating Type')}
                          placeholder="Auto-populated or manual"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Inherited Wall Thickness (mm)</label>
                        <input
                          type="text"
                          value={support.inheritedWallThickness}
                          onFocus={() => handleFieldFocus(support.id, 'inheritedWallThickness', support.inheritedWallThickness)}
                          onChange={(e) => updateSupport(support.id, 'inheritedWallThickness', e.target.value)}
                          onBlur={(e) => handleFieldBlur(support.id, 'inheritedWallThickness', e.target.value, 'Inherited Wall Thickness')}
                          placeholder="Auto-populated or manual"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Type-Specific Fields */}
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '6px',
                    marginBottom: '15px',
                    border: `1px solid ${supportType?.color}`
                  }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', color: supportType?.color, fontWeight: 'bold' }}>
                      {supportType?.icon} {supportType?.label.toUpperCase()} DETAILS
                    </h4>
                    <div style={gridStyle}>
                      {supportType?.fields.map(field => (
                        <div key={field.name}>
                          <label style={labelStyle}>
                            {field.label} {field.required && '*'}
                          </label>
                          {field.type === 'select' ? (
                            <select
                              value={support[field.name] || ''}
                              onFocus={() => handleFieldFocus(support.id, field.name, support[field.name])}
                              onChange={(e) => {
                                updateSupport(support.id, field.name, e.target.value)
                                handleFieldBlur(support.id, field.name, e.target.value, field.label)
                              }}
                              style={selectStyle}
                              disabled={field.computed}
                            >
                              <option value="">Select...</option>
                              {field.options?.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={field.type}
                              step={field.step}
                              value={support[field.name] || ''}
                              onFocus={() => handleFieldFocus(support.id, field.name, support[field.name])}
                              onChange={(e) => updateSupport(support.id, field.name, e.target.value)}
                              onBlur={(e) => handleFieldBlur(support.id, field.name, e.target.value, field.label)}
                              placeholder={field.placeholder || ''}
                              style={{
                                ...inputStyle,
                                backgroundColor: field.computed ? '#e9ecef' : 'white'
                              }}
                              readOnly={field.computed}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Verification Section */}
                  <div style={{
                    padding: '12px',
                    backgroundColor: support.elevationVerified ? '#d4edda' : '#fff3cd',
                    borderRadius: '6px',
                    marginBottom: '15px',
                    border: `1px solid ${support.elevationVerified ? '#28a745' : '#ffc107'}`
                  }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', color: support.elevationVerified ? '#155724' : '#856404', fontWeight: 'bold' }}>
                      ✓ AUDIT & VALIDATION
                    </h4>
                    <div style={gridStyle}>
                      <div>
                        <label style={labelStyle}>Elevation Verified *</label>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px',
                          backgroundColor: '#fff',
                          borderRadius: '4px',
                          border: '1px solid #ced4da'
                        }}>
                          <input
                            type="checkbox"
                            checked={support.elevationVerified || false}
                            onChange={(e) => {
                              updateSupport(support.id, 'elevationVerified', e.target.checked)
                              handleFieldBlur(support.id, 'elevationVerified', e.target.checked, 'Elevation Verified')
                            }}
                            style={{ width: '20px', height: '20px' }}
                          />
                          <span style={{
                            fontSize: '13px',
                            color: support.elevationVerified ? '#28a745' : '#856404',
                            fontWeight: 'bold'
                          }}>
                            {support.elevationVerified ? 'Verified ✓' : 'NOT VERIFIED - Technical Risk'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Record Status</label>
                        <select
                          value={support.recordStatus || 'Pending Review'}
                          onChange={(e) => {
                            updateSupport(support.id, 'recordStatus', e.target.value)
                            handleFieldBlur(support.id, 'recordStatus', e.target.value, 'Record Status')
                          }}
                          style={selectStyle}
                        >
                          <option value="Pending Review">Pending Review</option>
                          <option value="Verified">Verified</option>
                          <option value="Flagged">Flagged for Review</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Photo Evidence Section */}
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#e8f5e9',
                    borderRadius: '6px',
                    marginBottom: '15px',
                    border: '1px solid #28a745'
                  }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#28a745', fontWeight: 'bold' }}>
                      📷 MANDATORY GEOTAGGED PHOTO EVIDENCE
                    </h4>

                    {support.photos?.length > 0 ? (
                      <div style={{ marginBottom: '10px' }}>
                        {support.photos.map(photo => (
                          <div key={photo.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            marginBottom: '8px',
                            padding: '10px',
                            backgroundColor: '#fff',
                            borderRadius: '4px',
                            border: '1px solid #dee2e6'
                          }}>
                            <span style={{ fontSize: '12px', flex: 1 }}>{photo.filename}</span>
                            {photo.hasGPS ? (
                              <span
                                style={{ fontSize: '11px', color: '#28a745', backgroundColor: '#d4edda', padding: '2px 8px', borderRadius: '10px' }}
                                title={formatGPSCoordinates(photo.latitude, photo.longitude)}
                              >
                                📍 {photo.latitude?.toFixed(6)}, {photo.longitude?.toFixed(6)}
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#dc3545', backgroundColor: '#f8d7da', padding: '2px 8px', borderRadius: '10px' }}>
                                ⚠️ No GPS
                              </span>
                            )}
                            <button
                              onClick={() => removePhoto(support.id, photo.id)}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: '#dc3545', fontSize: '12px', marginBottom: '10px', fontWeight: 'bold' }}>
                        ⚠️ No photo evidence. A geotagged photo is required for Three-Way Match verification.
                      </p>
                    )}

                    <label style={{
                      display: 'inline-block',
                      padding: '10px 20px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      borderRadius: '4px',
                      cursor: processingPhoto ? 'wait' : 'pointer',
                      fontSize: '13px',
                      fontWeight: 'bold'
                    }}>
                      {processingPhoto ? 'Processing...' : '📷 Upload Geotagged Photo'}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handlePhotoUpload(support.id, e)}
                        style={{ display: 'none' }}
                        disabled={processingPhoto}
                      />
                    </label>
                    <p style={{ margin: '8px 0 0 0', fontSize: '10px', color: '#666' }}>
                      GPS coordinates (6-decimal precision) and KP location extracted for Three-Way Match.
                    </p>
                  </div>

                  {/* Notes */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={labelStyle}>Notes</label>
                    <textarea
                      value={support.notes || ''}
                      onFocus={() => handleFieldFocus(support.id, 'notes', support.notes)}
                      onChange={(e) => updateSupport(support.id, 'notes', e.target.value)}
                      onBlur={(e) => handleFieldBlur(support.id, 'notes', e.target.value, 'Notes')}
                      placeholder="Additional notes, observations..."
                      style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      onClick={() => saveToTrackableItems(support.id)}
                      disabled={savingToTrackable || !support.kpLocation || getQuantity(support) === 0}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: support.savedToTrackable ? '#28a745' : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: savingToTrackable || !support.kpLocation || getQuantity(support) === 0 ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        opacity: savingToTrackable || !support.kpLocation || getQuantity(support) === 0 ? 0.6 : 1
                      }}
                    >
                      {savingToTrackable ? 'Saving...' : support.savedToTrackable ? '✓ Updated in Billing' : '💰 Save to Trackable Items'}
                    </button>

                    <button
                      onClick={() => removeSupport(support.id)}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px'
                      }}
                    >
                      🗑️ Remove
                    </button>
                  </div>

                  {/* Billing Status */}
                  {support.savedToTrackable && (
                    <div style={{
                      marginTop: '15px',
                      padding: '10px',
                      backgroundColor: '#d4edda',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: '#155724',
                      border: '1px solid #28a745'
                    }}>
                      ✓ <strong>Billable Item Created:</strong> {support.itemName} | Qty: {getQuantity(support)} {support.uom} | KP: {support.kpLocation}
                      <br />
                      <span style={{ fontSize: '11px' }}>Tagged as "Crossing Support" in Reconciliation Dashboard</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      {/* Summary */}
      {supports.length > 0 && (
        <div style={{
          marginTop: '15px',
          padding: '15px',
          backgroundColor: '#e9ecef',
          borderRadius: '6px',
          border: '1px solid #ced4da'
        }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#495057' }}>
            📊 CROSSING SUPPORT SUMMARY
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {SUPPORT_TYPES.map(type => {
              const typeSupports = supports.filter(s => s.type === type.id)
              if (typeSupports.length === 0) return null
              const totalQty = typeSupports.reduce((sum, s) => sum + getQuantity(s), 0)
              const billableCount = typeSupports.filter(s => s.savedToTrackable).length
              const riskCount = typeSupports.filter(s => !s.elevationVerified && s.savedToTrackable).length

              return (
                <div key={type.id} style={{
                  padding: '10px',
                  backgroundColor: '#fff',
                  borderRadius: '4px',
                  borderLeft: `4px solid ${type.color}`
                }}>
                  <div style={{ fontWeight: 'bold', color: type.color, marginBottom: '5px' }}>
                    {type.icon} {type.label}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    Entries: {typeSupports.length} | Total: {totalQty} {type.uom}
                    <br />
                    Billable: {billableCount}/{typeSupports.length}
                    {riskCount > 0 && <span style={{ color: '#ffc107' }}> | ⚠️ {riskCount} Tech Risk</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default CrossingSupport
