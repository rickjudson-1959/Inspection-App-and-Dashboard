// ============================================================================
// DrillingWasteManagement.jsx
// Directive 050 compliant drilling waste tracking for HDD operations
// Supports AER Pipeline Drilling Waste Disposal Form requirements
// Date: January 2026
// ============================================================================

import React, { useState, useRef } from 'react'
import { useActivityAudit } from './useActivityAudit'
import { extractGPSFromImage, formatGPSCoordinates } from './exifUtils'

// Common drilling fluid additives for searchable list
const ADDITIVE_OPTIONS = [
  // Bentonite products
  { type: 'bentonite', name: 'Bentonite (Wyoming)', unit: 'bags' },
  { type: 'bentonite', name: 'Bentonite (Premium Gel)', unit: 'bags' },
  { type: 'bentonite', name: 'Bentonite (High Yield)', unit: 'bags' },
  { type: 'bentonite', name: 'Aqua-Gel Gold Seal', unit: 'bags' },
  { type: 'bentonite', name: 'Baroid Quik-Gel', unit: 'bags' },
  // Soda Ash
  { type: 'soda_ash', name: 'Soda Ash (pH Control)', unit: 'bags' },
  { type: 'soda_ash', name: 'Soda Ash (Technical Grade)', unit: 'bags' },
  // Polymers
  { type: 'polymer', name: 'PAC-L (Low Viscosity)', unit: 'pails' },
  { type: 'polymer', name: 'PAC-R (Regular)', unit: 'pails' },
  { type: 'polymer', name: 'Drispac (Fluid Loss)', unit: 'pails' },
  { type: 'polymer', name: 'Xanthan Gum', unit: 'pails' },
  { type: 'polymer', name: 'PHPA (Shale Stabilizer)', unit: 'pails' },
  { type: 'polymer', name: 'CMC (Carboxymethyl Cellulose)', unit: 'pails' },
  // Other additives
  { type: 'other', name: 'Barite (Weighting Agent)', unit: 'bags' },
  { type: 'other', name: 'Calcium Chloride', unit: 'bags' },
  { type: 'other', name: 'Potassium Chloride', unit: 'bags' },
  { type: 'other', name: 'Lubricant (Bore-Lube)', unit: 'pails' },
  { type: 'other', name: 'Defoamer', unit: 'pails' },
  { type: 'other', name: 'Lost Circulation Material', unit: 'bags' }
]

// Disposal methods per Directive 050
const DISPOSAL_METHODS = [
  { value: 'mix_bury_cover', label: 'Mix-Bury-Cover (On-Site)' },
  { value: 'landfill', label: 'Landfill (Class II/III)' },
  { value: 'landspray', label: 'Landspray (Approved Site)' },
  { value: 'pump_off', label: 'Pump-off (Licensed Facility)' }
]

// Storage types
const STORAGE_TYPES = [
  { value: 'lined_pit', label: 'Lined Pit' },
  { value: 'steel_tank', label: 'Steel Tank' },
  { value: 'frac_tank', label: 'Frac Tank' },
  { value: 'poly_tank', label: 'Poly Tank' },
  { value: 'other', label: 'Other' }
]

function DrillingWasteManagement({
  data,
  onChange,
  contractor,
  foreman,
  reportDate,
  boreId,
  crossingId,
  startKP,
  endKP,
  logId,
  reportId
}) {
  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState({
    volumeTracking: false,
    additives: false,
    disposal: false,
    testing: false,
    evidence: false,
    comments: false
  })

  const [showAdditives, setShowAdditives] = useState(data?.additives?.length > 0)
  const [additiveSearch, setAdditiveSearch] = useState('')
  const [processingPhoto, setProcessingPhoto] = useState(false)

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Collapsible section wrapper component
  const CollapsibleSection = ({ id, title, color = '#495057', bgColor = '#e9ecef', borderColor = '#dee2e6', contentBgColor = '#f8f9fa', required = false, children }) => (
    <div style={{ marginBottom: '10px' }}>
      <div
        style={{
          fontSize: '14px',
          fontWeight: 'bold',
          color: color,
          padding: '12px 15px',
          backgroundColor: bgColor,
          borderRadius: expandedSections[id] ? '6px 6px 0 0' : '6px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
          border: `1px solid ${borderColor}`
        }}
        onClick={() => toggleSection(id)}
      >
        <span>{title}{required && <span style={{ color: '#dc3545', marginLeft: '5px' }}>*</span>}</span>
        <span style={{ fontSize: '18px' }}>{expandedSections[id] ? '−' : '+'}</span>
      </div>
      {expandedSections[id] && (
        <div style={{
          padding: '15px',
          backgroundColor: contentBgColor,
          borderRadius: '0 0 6px 6px',
          border: `1px solid ${borderColor}`,
          borderTop: 'none'
        }}>
          {children}
        </div>
      )}
    </div>
  )

  // Audit trail hook
  const {
    initializeOriginalValues,
    initializeEntryValues,
    logFieldChange,
    logEntryFieldChange,
    logEntryAdd,
    logEntryDelete
  } = useActivityAudit(logId || reportId, 'DrillingWasteManagement')

  // Refs for tracking original values
  const originalValuesRef = useRef({})
  const entryValuesRef = useRef({})

  // Default structure
  const defaultData = {
    // Bore/Crossing Reference
    boreId: boreId || '',
    crossingId: crossingId || '',
    boreWeldId: '',

    // Mud Pit Locations
    entryPitKP: startKP || '',
    entryPitLatitude: '',
    entryPitLongitude: '',
    exitPitKP: endKP || '',
    exitPitLatitude: '',
    exitPitLongitude: '',

    // Volume Tracking
    totalVolumeMixedM3: '',
    volumeInStorageM3: '',
    volumeHauledM3: '',

    // Additives
    additives: [],

    // Disposal & Manifesting
    disposalMethod: '',
    manifestNumber: '',
    disposalFacilityName: '',
    disposalDate: '',

    // Vacuum Truck
    vacTruckHours: '',
    vacTruckEquipmentId: '',
    vacTruckOperator: '',

    // Testing & Compliance
    salinityTestPassed: null,
    toxicityTestPassed: null,
    metalsTestPassed: null,
    linedPitStorageConfirmed: null,
    salinityTestResult: '',
    toxicityTestResult: '',
    metalsTestResult: '',
    testLabName: '',
    testDate: '',

    // Storage
    storageType: '',
    storageCapacityM3: '',

    // Photos
    photos: [],

    comments: ''
  }

  const wasteData = {
    ...defaultData,
    ...data,
    additives: data?.additives || [],
    photos: data?.photos || []
  }

  // Audit handlers
  const handleFieldFocus = (fieldName, currentValue) => {
    initializeOriginalValues(originalValuesRef, fieldName, currentValue)
  }

  const handleFieldBlur = (fieldName, newValue, displayName) => {
    logFieldChange(originalValuesRef, fieldName, newValue, displayName)
  }

  const handleEntryFieldFocus = (entryId, fieldName, currentValue) => {
    initializeEntryValues(entryValuesRef, entryId, fieldName, currentValue)
  }

  const handleEntryFieldBlur = (entryId, fieldName, newValue, displayName, entryLabel) => {
    logEntryFieldChange(entryValuesRef, entryId, fieldName, newValue, displayName, entryLabel)
  }

  const updateField = (field, value) => {
    onChange({ ...wasteData, [field]: value })
  }

  // Additives management
  const filteredAdditives = ADDITIVE_OPTIONS.filter(a =>
    a.name.toLowerCase().includes(additiveSearch.toLowerCase()) ||
    a.type.toLowerCase().includes(additiveSearch.toLowerCase())
  )

  const addAdditive = (additive) => {
    const newAdditive = {
      id: Date.now(),
      type: additive.type,
      productName: additive.name,
      quantity: '',
      unit: additive.unit,
      batchNumber: '',
      supplier: '',
      notes: ''
    }
    onChange({ ...wasteData, additives: [...wasteData.additives, newAdditive] })
    logEntryAdd('Additive', additive.name)
    setAdditiveSearch('')
  }

  const addCustomAdditive = () => {
    const newAdditive = {
      id: Date.now(),
      type: 'other',
      productName: additiveSearch || 'Custom Additive',
      quantity: '',
      unit: 'bags',
      batchNumber: '',
      supplier: '',
      notes: ''
    }
    onChange({ ...wasteData, additives: [...wasteData.additives, newAdditive] })
    logEntryAdd('Additive', newAdditive.productName)
    setAdditiveSearch('')
  }

  const updateAdditive = (id, field, value) => {
    const updated = wasteData.additives.map(a => a.id === id ? { ...a, [field]: value } : a)
    onChange({ ...wasteData, additives: updated })
  }

  const removeAdditive = (id) => {
    const additive = wasteData.additives.find(a => a.id === id)
    onChange({ ...wasteData, additives: wasteData.additives.filter(a => a.id !== id) })
    logEntryDelete('Additive', additive?.productName || 'Additive')
  }

  // Photo upload with EXIF extraction
  const handlePhotoUpload = async (event, photoType, isMandatory = false) => {
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
          photoType: photoType,
          isMandatory: isMandatory,
          kpLocation: wasteData.entryPitKP || startKP || '',
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          gpsAccuracy: gpsData.accuracy,
          gpsAltitude: gpsData.altitude,
          gpsDirection: gpsData.direction,
          hasGPS: gpsData.hasGPS,
          description: '',
          preview: URL.createObjectURL(file)
        }
      }))

      onChange({ ...wasteData, photos: [...wasteData.photos, ...newPhotos] })
      logEntryAdd('Photo', `${photoType} photo`)
    } catch (err) {
      console.error('Photo upload error:', err)
    } finally {
      setProcessingPhoto(false)
    }
  }

  const removePhoto = (photoId) => {
    const photo = wasteData.photos.find(p => p.id === photoId)
    if (photo?.preview) {
      URL.revokeObjectURL(photo.preview)
    }
    onChange({ ...wasteData, photos: wasteData.photos.filter(p => p.id !== photoId) })
    logEntryDelete('Photo', photo?.photoType || 'Photo')
  }

  // Calculate volume balance
  const calculateVolumeBalance = () => {
    const mixed = parseFloat(wasteData.totalVolumeMixedM3) || 0
    const storage = parseFloat(wasteData.volumeInStorageM3) || 0
    const hauled = parseFloat(wasteData.volumeHauledM3) || 0
    return (mixed - storage - hauled).toFixed(2)
  }

  // Check if manifest photo is uploaded
  const hasManifestPhoto = wasteData.photos.some(p => p.photoType === 'manifest' || p.photoType === 'landfill_ticket')

  // Styles
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }
  const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }
  const checkboxContainerStyle = { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #dee2e6' }

  return (
    <div style={{ marginTop: '15px' }}>
      {/* INHERITED INFO BAR */}
      <div style={{ padding: '12px 15px', backgroundColor: '#17a2b8', borderRadius: '6px', marginBottom: '15px', border: '1px solid #138496' }}>
        <span style={{ fontSize: '14px', color: 'white', fontWeight: 'bold' }}>
          DIRECTIVE 050 - DRILLING WASTE MANAGEMENT
        </span>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#e9ecef' }}>
          {boreId && <>Bore ID: <strong>{boreId}</strong> | </>}
          {crossingId && <>Crossing: <strong>{crossingId}</strong> | </>}
          {reportDate && <>Date: <strong>{reportDate}</strong></>}
        </div>
      </div>

      {/* 1. MUD MIXING & VOLUME TRACKING */}
      <CollapsibleSection
        id="volumeTracking"
        title="MUD MIXING & VOLUME TRACKING"
        color="#0c5460"
        bgColor="#d1ecf1"
        borderColor="#17a2b8"
        contentBgColor="#e8f7fc"
      >
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Total Volume Mixed (m³)</label>
            <input type="text" inputMode="decimal" value={wasteData.totalVolumeMixedM3}
              onFocus={() => handleFieldFocus('totalVolumeMixedM3', wasteData.totalVolumeMixedM3)}
              onChange={(e) => updateField('totalVolumeMixedM3', e.target.value)}
              onBlur={(e) => handleFieldBlur('totalVolumeMixedM3', e.target.value, 'Total Volume Mixed')}
              placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Volume in Storage (m³)</label>
            <input type="text" inputMode="decimal" value={wasteData.volumeInStorageM3}
              onFocus={() => handleFieldFocus('volumeInStorageM3', wasteData.volumeInStorageM3)}
              onChange={(e) => updateField('volumeInStorageM3', e.target.value)}
              onBlur={(e) => handleFieldBlur('volumeInStorageM3', e.target.value, 'Volume in Storage')}
              placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Volume Hauled (m³)</label>
            <input type="text" inputMode="decimal" value={wasteData.volumeHauledM3}
              onFocus={() => handleFieldFocus('volumeHauledM3', wasteData.volumeHauledM3)}
              onChange={(e) => updateField('volumeHauledM3', e.target.value)}
              onBlur={(e) => handleFieldBlur('volumeHauledM3', e.target.value, 'Volume Hauled')}
              placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Volume Balance (m³)</label>
            <input type="text" value={calculateVolumeBalance()} readOnly
              style={{ ...inputStyle, backgroundColor: '#e9ecef', fontWeight: 'bold' }} />
          </div>
        </div>

        {/* Storage Info */}
        <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #17a2b8' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0c5460', marginBottom: '10px' }}>Storage Details</div>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Storage Type</label>
              <select value={wasteData.storageType}
                onFocus={() => handleFieldFocus('storageType', wasteData.storageType)}
                onChange={(e) => { updateField('storageType', e.target.value); handleFieldBlur('storageType', e.target.value, 'Storage Type') }}
                style={selectStyle}>
                <option value="">Select...</option>
                {STORAGE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Storage Capacity (m³)</label>
              <input type="text" inputMode="decimal" value={wasteData.storageCapacityM3}
                onFocus={() => handleFieldFocus('storageCapacityM3', wasteData.storageCapacityM3)}
                onChange={(e) => updateField('storageCapacityM3', e.target.value)}
                onBlur={(e) => handleFieldBlur('storageCapacityM3', e.target.value, 'Storage Capacity')}
                placeholder="0.00" style={inputStyle} />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. ADDITIVES LOG */}
      <CollapsibleSection
        id="additives"
        title="ADDITIVES LOG (Bentonite, Soda Ash, Polymers)"
        color="#856404"
        bgColor="#fff3cd"
        borderColor="#ffc107"
        contentBgColor="#fffef5"
      >
        {/* Searchable Additive Selector */}
        <div style={{ marginBottom: '15px' }}>
          <label style={labelStyle}>Search & Add Additive</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={additiveSearch}
              onChange={(e) => setAdditiveSearch(e.target.value)}
              placeholder="Type to search: bentonite, soda ash, polymer..."
              style={{ ...inputStyle, paddingRight: '80px' }}
            />
            {additiveSearch && (
              <button
                onClick={addCustomAdditive}
                style={{
                  position: 'absolute',
                  right: '5px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '4px 10px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                + Custom
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {additiveSearch && filteredAdditives.length > 0 && (
            <div style={{
              marginTop: '5px',
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              backgroundColor: 'white'
            }}>
              {filteredAdditives.map((additive, idx) => (
                <div
                  key={idx}
                  onClick={() => addAdditive(additive)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fff3cd'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <span>
                    <strong>{additive.name}</strong>
                    <span style={{ fontSize: '11px', color: '#666', marginLeft: '10px' }}>
                      ({additive.type})
                    </span>
                  </span>
                  <span style={{ fontSize: '11px', color: '#856404' }}>{additive.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Added Additives List */}
        {wasteData.additives.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            No additives logged. Use the search above to add bentonite, soda ash, or polymer products.
          </p>
        ) : (
          wasteData.additives.map((additive, idx) => (
            <div key={additive.id} style={{
              marginBottom: '10px',
              padding: '12px',
              backgroundColor: '#fff',
              borderRadius: '6px',
              border: '1px solid #ffc107'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong style={{ color: '#856404' }}>
                  {additive.productName}
                  <span style={{ fontSize: '11px', color: '#666', marginLeft: '8px' }}>({additive.type})</span>
                </strong>
                <button
                  onClick={() => removeAdditive(additive.id)}
                  style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                >
                  Remove
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Quantity</label>
                  <input type="text" inputMode="decimal" value={additive.quantity}
                    onFocus={() => handleEntryFieldFocus(additive.id, 'quantity', additive.quantity)}
                    onChange={(e) => updateAdditive(additive.id, 'quantity', e.target.value)}
                    onBlur={(e) => handleEntryFieldBlur(additive.id, 'quantity', e.target.value, 'Quantity', additive.productName)}
                    placeholder="0" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Unit</label>
                  <select value={additive.unit}
                    onChange={(e) => updateAdditive(additive.id, 'unit', e.target.value)}
                    style={selectStyle}>
                    <option value="bags">Bags</option>
                    <option value="pails">Pails</option>
                    <option value="kg">Kilograms</option>
                    <option value="liters">Liters</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Batch #</label>
                  <input type="text" value={additive.batchNumber}
                    onFocus={() => handleEntryFieldFocus(additive.id, 'batchNumber', additive.batchNumber)}
                    onChange={(e) => updateAdditive(additive.id, 'batchNumber', e.target.value)}
                    onBlur={(e) => handleEntryFieldBlur(additive.id, 'batchNumber', e.target.value, 'Batch Number', additive.productName)}
                    placeholder="Lot/Batch" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Supplier</label>
                  <input type="text" value={additive.supplier}
                    onFocus={() => handleEntryFieldFocus(additive.id, 'supplier', additive.supplier)}
                    onChange={(e) => updateAdditive(additive.id, 'supplier', e.target.value)}
                    onBlur={(e) => handleEntryFieldBlur(additive.id, 'supplier', e.target.value, 'Supplier', additive.productName)}
                    placeholder="Supplier name" style={inputStyle} />
                </div>
              </div>
            </div>
          ))
        )}
      </CollapsibleSection>

      {/* 3. DISPOSAL & MANIFESTING */}
      <CollapsibleSection
        id="disposal"
        title="DISPOSAL & MANIFESTING"
        color="#155724"
        bgColor="#d4edda"
        borderColor="#28a745"
        contentBgColor="#f0fff4"
      >
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Disposal Method</label>
            <select value={wasteData.disposalMethod}
              onFocus={() => handleFieldFocus('disposalMethod', wasteData.disposalMethod)}
              onChange={(e) => { updateField('disposalMethod', e.target.value); handleFieldBlur('disposalMethod', e.target.value, 'Disposal Method') }}
              style={selectStyle}>
              <option value="">Select...</option>
              {DISPOSAL_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Manifest Number</label>
            <input type="text" value={wasteData.manifestNumber}
              onFocus={() => handleFieldFocus('manifestNumber', wasteData.manifestNumber)}
              onChange={(e) => updateField('manifestNumber', e.target.value)}
              onBlur={(e) => handleFieldBlur('manifestNumber', e.target.value, 'Manifest Number')}
              placeholder="e.g., MAN-2026-001" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Disposal Facility Name</label>
            <input type="text" value={wasteData.disposalFacilityName}
              onFocus={() => handleFieldFocus('disposalFacilityName', wasteData.disposalFacilityName)}
              onChange={(e) => updateField('disposalFacilityName', e.target.value)}
              onBlur={(e) => handleFieldBlur('disposalFacilityName', e.target.value, 'Disposal Facility Name')}
              placeholder="Facility name" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Disposal Date</label>
            <input type="date" value={wasteData.disposalDate}
              onFocus={() => handleFieldFocus('disposalDate', wasteData.disposalDate)}
              onChange={(e) => updateField('disposalDate', e.target.value)}
              onBlur={(e) => handleFieldBlur('disposalDate', e.target.value, 'Disposal Date')}
              style={inputStyle} />
          </div>
        </div>

        {/* Vacuum Truck Tracking */}
        <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #28a745' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#155724', marginBottom: '10px' }}>Vacuum Truck Log</div>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Vac Truck Hours</label>
              <input type="text" inputMode="decimal" value={wasteData.vacTruckHours}
                onFocus={() => handleFieldFocus('vacTruckHours', wasteData.vacTruckHours)}
                onChange={(e) => updateField('vacTruckHours', e.target.value)}
                onBlur={(e) => handleFieldBlur('vacTruckHours', e.target.value, 'Vac Truck Hours')}
                placeholder="0.0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Equipment ID</label>
              <input type="text" value={wasteData.vacTruckEquipmentId}
                onFocus={() => handleFieldFocus('vacTruckEquipmentId', wasteData.vacTruckEquipmentId)}
                onChange={(e) => updateField('vacTruckEquipmentId', e.target.value)}
                onBlur={(e) => handleFieldBlur('vacTruckEquipmentId', e.target.value, 'Vac Truck Equipment ID')}
                placeholder="Unit #" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Operator</label>
              <input type="text" value={wasteData.vacTruckOperator}
                onFocus={() => handleFieldFocus('vacTruckOperator', wasteData.vacTruckOperator)}
                onChange={(e) => updateField('vacTruckOperator', e.target.value)}
                onBlur={(e) => handleFieldBlur('vacTruckOperator', e.target.value, 'Vac Truck Operator')}
                placeholder="Operator name" style={inputStyle} />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 4. TESTING & COMPLIANCE */}
      <CollapsibleSection
        id="testing"
        title="TESTING & COMPLIANCE (Directive 050)"
        color="#721c24"
        bgColor="#f8d7da"
        borderColor="#dc3545"
        contentBgColor="#fff5f5"
      >
        {/* Test Checkboxes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '15px' }}>
          <div style={{
            ...checkboxContainerStyle,
            backgroundColor: wasteData.salinityTestPassed === true ? '#d4edda' : wasteData.salinityTestPassed === false ? '#f8d7da' : '#f8f9fa'
          }}>
            <input type="checkbox"
              checked={wasteData.salinityTestPassed === true}
              onChange={(e) => {
                updateField('salinityTestPassed', e.target.checked ? true : null)
                handleFieldBlur('salinityTestPassed', e.target.checked, 'Salinity Test Passed')
              }}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label style={{ fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>Salinity Test Passed</label>
          </div>

          <div style={{
            ...checkboxContainerStyle,
            backgroundColor: wasteData.toxicityTestPassed === true ? '#d4edda' : wasteData.toxicityTestPassed === false ? '#f8d7da' : '#f8f9fa'
          }}>
            <input type="checkbox"
              checked={wasteData.toxicityTestPassed === true}
              onChange={(e) => {
                updateField('toxicityTestPassed', e.target.checked ? true : null)
                handleFieldBlur('toxicityTestPassed', e.target.checked, 'Toxicity Test Passed')
              }}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label style={{ fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>Toxicity Test Passed</label>
          </div>

          <div style={{
            ...checkboxContainerStyle,
            backgroundColor: wasteData.metalsTestPassed === true ? '#d4edda' : wasteData.metalsTestPassed === false ? '#f8d7da' : '#f8f9fa'
          }}>
            <input type="checkbox"
              checked={wasteData.metalsTestPassed === true}
              onChange={(e) => {
                updateField('metalsTestPassed', e.target.checked ? true : null)
                handleFieldBlur('metalsTestPassed', e.target.checked, 'Metals Test Passed')
              }}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label style={{ fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>Metals Test Passed</label>
          </div>

          <div style={{
            ...checkboxContainerStyle,
            backgroundColor: wasteData.linedPitStorageConfirmed === true ? '#d4edda' : wasteData.linedPitStorageConfirmed === false ? '#f8d7da' : '#f8f9fa'
          }}>
            <input type="checkbox"
              checked={wasteData.linedPitStorageConfirmed === true}
              onChange={(e) => {
                updateField('linedPitStorageConfirmed', e.target.checked ? true : null)
                handleFieldBlur('linedPitStorageConfirmed', e.target.checked, 'Lined Pit Storage Confirmed')
              }}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label style={{ fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>Lined Pit/Tank Storage Confirmed</label>
          </div>
        </div>

        {/* Test Results */}
        <div style={{ padding: '12px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #dc3545' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#721c24', marginBottom: '10px' }}>Test Results (for AER Reporting)</div>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Salinity Result</label>
              <input type="text" value={wasteData.salinityTestResult}
                onFocus={() => handleFieldFocus('salinityTestResult', wasteData.salinityTestResult)}
                onChange={(e) => updateField('salinityTestResult', e.target.value)}
                onBlur={(e) => handleFieldBlur('salinityTestResult', e.target.value, 'Salinity Test Result')}
                placeholder="mg/L or ppm" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Toxicity Result</label>
              <input type="text" value={wasteData.toxicityTestResult}
                onFocus={() => handleFieldFocus('toxicityTestResult', wasteData.toxicityTestResult)}
                onChange={(e) => updateField('toxicityTestResult', e.target.value)}
                onBlur={(e) => handleFieldBlur('toxicityTestResult', e.target.value, 'Toxicity Test Result')}
                placeholder="LC50 value" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Metals Result</label>
              <input type="text" value={wasteData.metalsTestResult}
                onFocus={() => handleFieldFocus('metalsTestResult', wasteData.metalsTestResult)}
                onChange={(e) => updateField('metalsTestResult', e.target.value)}
                onBlur={(e) => handleFieldBlur('metalsTestResult', e.target.value, 'Metals Test Result')}
                placeholder="Pass/Fail details" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Lab Name</label>
              <input type="text" value={wasteData.testLabName}
                onFocus={() => handleFieldFocus('testLabName', wasteData.testLabName)}
                onChange={(e) => updateField('testLabName', e.target.value)}
                onBlur={(e) => handleFieldBlur('testLabName', e.target.value, 'Test Lab Name')}
                placeholder="Testing laboratory" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Test Date</label>
              <input type="date" value={wasteData.testDate}
                onFocus={() => handleFieldFocus('testDate', wasteData.testDate)}
                onChange={(e) => updateField('testDate', e.target.value)}
                onBlur={(e) => handleFieldBlur('testDate', e.target.value, 'Test Date')}
                style={inputStyle} />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 5. EVIDENCE & ASSET LINK */}
      <CollapsibleSection
        id="evidence"
        title="EVIDENCE & ASSET LINK"
        color="#495057"
        bgColor="#e9ecef"
        borderColor="#6c757d"
        contentBgColor="#f8f9fa"
        required={true}
      >
        {/* Asset Links */}
        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Bore ID</label>
            <input type="text" value={wasteData.boreId}
              onFocus={() => handleFieldFocus('boreId', wasteData.boreId)}
              onChange={(e) => updateField('boreId', e.target.value)}
              onBlur={(e) => handleFieldBlur('boreId', e.target.value, 'Bore ID')}
              placeholder="e.g., HDD-001" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Crossing ID (Road/Rail)</label>
            <input type="text" value={wasteData.crossingId}
              onFocus={() => handleFieldFocus('crossingId', wasteData.crossingId)}
              onChange={(e) => updateField('crossingId', e.target.value)}
              onBlur={(e) => handleFieldBlur('crossingId', e.target.value, 'Crossing ID')}
              placeholder="e.g., RX-015" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Bore Weld ID</label>
            <input type="text" value={wasteData.boreWeldId}
              onFocus={() => handleFieldFocus('boreWeldId', wasteData.boreWeldId)}
              onChange={(e) => updateField('boreWeldId', e.target.value)}
              onBlur={(e) => handleFieldBlur('boreWeldId', e.target.value, 'Bore Weld ID')}
              placeholder="Weld joint ID" style={inputStyle} />
          </div>
        </div>

        {/* Mud Pit Geotagging */}
        <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #6c757d' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#495057', marginBottom: '10px' }}>Mud Pit Locations (6-decimal GPS precision)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            {/* Entry Pit */}
            <div style={{ padding: '10px', backgroundColor: '#e9ecef', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#495057', marginBottom: '8px' }}>ENTRY PIT</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>KP</label>
                  <input type="text" value={wasteData.entryPitKP}
                    onFocus={() => handleFieldFocus('entryPitKP', wasteData.entryPitKP)}
                    onChange={(e) => updateField('entryPitKP', e.target.value)}
                    onBlur={(e) => handleFieldBlur('entryPitKP', e.target.value, 'Entry Pit KP')}
                    placeholder="e.g., 5+250" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Latitude</label>
                  <input type="text" inputMode="decimal" value={wasteData.entryPitLatitude}
                    onFocus={() => handleFieldFocus('entryPitLatitude', wasteData.entryPitLatitude)}
                    onChange={(e) => updateField('entryPitLatitude', e.target.value)}
                    onBlur={(e) => handleFieldBlur('entryPitLatitude', e.target.value, 'Entry Pit Latitude')}
                    placeholder="49.123456" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Longitude</label>
                  <input type="text" inputMode="decimal" value={wasteData.entryPitLongitude}
                    onFocus={() => handleFieldFocus('entryPitLongitude', wasteData.entryPitLongitude)}
                    onChange={(e) => updateField('entryPitLongitude', e.target.value)}
                    onBlur={(e) => handleFieldBlur('entryPitLongitude', e.target.value, 'Entry Pit Longitude')}
                    placeholder="-122.123456" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* Exit Pit */}
            <div style={{ padding: '10px', backgroundColor: '#e9ecef', borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#495057', marginBottom: '8px' }}>EXIT PIT</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>KP</label>
                  <input type="text" value={wasteData.exitPitKP}
                    onFocus={() => handleFieldFocus('exitPitKP', wasteData.exitPitKP)}
                    onChange={(e) => updateField('exitPitKP', e.target.value)}
                    onBlur={(e) => handleFieldBlur('exitPitKP', e.target.value, 'Exit Pit KP')}
                    placeholder="e.g., 5+450" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Latitude</label>
                  <input type="text" inputMode="decimal" value={wasteData.exitPitLatitude}
                    onFocus={() => handleFieldFocus('exitPitLatitude', wasteData.exitPitLatitude)}
                    onChange={(e) => updateField('exitPitLatitude', e.target.value)}
                    onBlur={(e) => handleFieldBlur('exitPitLatitude', e.target.value, 'Exit Pit Latitude')}
                    placeholder="49.123456" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Longitude</label>
                  <input type="text" inputMode="decimal" value={wasteData.exitPitLongitude}
                    onFocus={() => handleFieldFocus('exitPitLongitude', wasteData.exitPitLongitude)}
                    onChange={(e) => updateField('exitPitLongitude', e.target.value)}
                    onBlur={(e) => handleFieldBlur('exitPitLongitude', e.target.value, 'Exit Pit Longitude')}
                    placeholder="-122.123456" style={inputStyle} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Manifest Photo Upload - MANDATORY */}
        <div style={{
          marginTop: '15px',
          padding: '15px',
          backgroundColor: hasManifestPhoto ? '#d4edda' : '#f8d7da',
          borderRadius: '6px',
          border: `2px solid ${hasManifestPhoto ? '#28a745' : '#dc3545'}`
        }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: hasManifestPhoto ? '#155724' : '#721c24', marginBottom: '10px' }}>
            {hasManifestPhoto ? '✓ Manifest Photo Uploaded' : '⚠️ MANDATORY: Upload Disposal Manifest / Landfill Ticket'}
          </div>

          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: processingPhoto ? 'wait' : 'pointer',
            fontSize: '13px',
            fontWeight: 'bold'
          }}>
            {processingPhoto ? 'Processing...' : 'Upload Manifest Photo'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handlePhotoUpload(e, 'manifest', true)}
              style={{ display: 'none' }}
              disabled={processingPhoto}
            />
          </label>

          <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#666' }}>
            GPS coordinates (6-decimal precision) will be extracted from the photo.
          </p>
        </div>

        {/* Additional Photo Uploads */}
        <div style={{ marginTop: '15px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#495057', marginBottom: '10px' }}>Additional Evidence Photos</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{
              padding: '8px 15px',
              backgroundColor: '#6c757d',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}>
              Storage/Pit Photo
              <input type="file" accept="image/*" capture="environment"
                onChange={(e) => handlePhotoUpload(e, 'storage')}
                style={{ display: 'none' }} />
            </label>
            <label style={{
              padding: '8px 15px',
              backgroundColor: '#6c757d',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}>
              Disposal Site Photo
              <input type="file" accept="image/*" capture="environment"
                onChange={(e) => handlePhotoUpload(e, 'disposal_site')}
                style={{ display: 'none' }} />
            </label>
            <label style={{
              padding: '8px 15px',
              backgroundColor: '#6c757d',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}>
              General Photo
              <input type="file" accept="image/*" capture="environment"
                onChange={(e) => handlePhotoUpload(e, 'general')}
                style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Photo Gallery */}
        {wasteData.photos.length > 0 && (
          <div style={{ marginTop: '15px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#495057', marginBottom: '10px' }}>
              Uploaded Photos ({wasteData.photos.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
              {wasteData.photos.map(photo => (
                <div key={photo.id} style={{
                  position: 'relative',
                  backgroundColor: '#fff',
                  borderRadius: '6px',
                  border: photo.isMandatory ? '2px solid #28a745' : '1px solid #dee2e6',
                  overflow: 'hidden'
                }}>
                  {photo.preview && (
                    <img src={photo.preview} alt={photo.filename}
                      style={{ width: '100%', height: '100px', objectFit: 'cover' }} />
                  )}
                  <div style={{ padding: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', marginBottom: '4px' }}>
                      {photo.photoType.replace('_', ' ').toUpperCase()}
                      {photo.isMandatory && <span style={{ color: '#28a745' }}> ✓</span>}
                    </div>
                    {photo.hasGPS ? (
                      <div style={{ fontSize: '9px', color: '#28a745' }}>
                        GPS: {photo.latitude?.toFixed(6)}, {photo.longitude?.toFixed(6)}
                      </div>
                    ) : (
                      <div style={{ fontSize: '9px', color: '#dc3545' }}>No GPS data</div>
                    )}
                    <button
                      onClick={() => removePhoto(photo.id)}
                      style={{
                        marginTop: '5px',
                        padding: '2px 6px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '10px'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* 6. COMMENTS */}
      <CollapsibleSection id="comments" title="COMMENTS">
        <textarea value={wasteData.comments}
          onFocus={() => handleFieldFocus('comments', wasteData.comments)}
          onChange={(e) => updateField('comments', e.target.value)}
          onBlur={(e) => handleFieldBlur('comments', e.target.value, 'Comments')}
          placeholder="Additional comments, observations, or notes regarding drilling waste management..."
          style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }} />
      </CollapsibleSection>

      {/* AER Export Notice */}
      <div style={{
        marginTop: '10px',
        padding: '10px 15px',
        backgroundColor: '#e2e3e5',
        borderRadius: '6px',
        border: '1px solid #6c757d',
        fontSize: '11px',
        color: '#495057'
      }}>
        <strong>AER Compliance:</strong> This data can be exported in a format that mirrors the AER Pipeline Drilling Waste Disposal Form requirements.
        All volume and hour inputs are audit-logged for regulatory compliance.
      </div>
    </div>
  )
}

export default DrillingWasteManagement
