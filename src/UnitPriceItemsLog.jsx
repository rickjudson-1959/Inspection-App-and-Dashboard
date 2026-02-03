import React, { useState } from 'react'

function UnitPriceItemsLog({ data, onChange, reportDate, spread, afe }) {
  // Predefined unit price item categories and items
  // NOTE: In production, these would come from project setup by Admin
  const itemCategories = {
    'Pipeline Markers & Signs': [
      { name: 'Pipeline Marker Post', unit: 'each' },
      { name: 'Aerial Marker', unit: 'each' },
      { name: 'Warning Sign - Standard', unit: 'each' },
      { name: 'Warning Sign - Bilingual', unit: 'each' },
      { name: 'Road Crossing Sign', unit: 'each' },
      { name: 'Fence Sign', unit: 'each' },
      { name: 'Gate Sign', unit: 'each' },
      { name: 'Foreign Crossing Marker', unit: 'each' },
      { name: 'Valve Marker', unit: 'each' },
      { name: 'Cased Crossing Marker', unit: 'each' }
    ],
    'Anchors & Weights': [
      { name: 'Screw Anchor - Small', unit: 'each' },
      { name: 'Screw Anchor - Medium', unit: 'each' },
      { name: 'Screw Anchor - Large', unit: 'each' },
      { name: 'Concrete Weight - Saddle', unit: 'each' },
      { name: 'Concrete Weight - Set-On', unit: 'each' },
      { name: 'Concrete Weight - Bolt-On', unit: 'each' },
      { name: 'River Weight', unit: 'each' }
    ],
    'Cathodic Protection': [
      { name: 'Test Station Post', unit: 'each' },
      { name: 'Test Lead - Standard', unit: 'each' },
      { name: 'Test Lead - Thermite Weld', unit: 'each' },
      { name: 'Anode - Magnesium', unit: 'each' },
      { name: 'Anode - Zinc', unit: 'each' },
      { name: 'Rectifier Installation', unit: 'each' }
    ],
    'Casing & Crossings': [
      { name: 'Casing Spacer', unit: 'each' },
      { name: 'Casing End Seal', unit: 'each' },
      { name: 'Casing Vent', unit: 'each' },
      { name: 'Carrier Pipe Spacer', unit: 'each' }
    ],
    'Ground Protection': [
      { name: 'Matting - Access', unit: 'each' },
      { name: 'Matting - Swamp', unit: 'each' },
      { name: 'Corduroy', unit: 'm³' },
      { name: 'Geotextile', unit: 'm²' },
      { name: 'Rig Mat', unit: 'each' }
    ],
    'Padding & Protection': [
      { name: 'Rock Shield', unit: 'lin m' },
      { name: 'Padding - Sand (Imported)', unit: 'm³' },
      { name: 'Padding - Screened Material', unit: 'm³' },
      { name: 'Foam Padding', unit: 'lin m' },
      { name: 'Concrete Coating Repair', unit: 'each' }
    ],
    'Environmental': [
      { name: 'Silt Fence', unit: 'lin m' },
      { name: 'Straw Bales', unit: 'each' },
      { name: 'Erosion Blanket', unit: 'm²' },
      { name: 'Sediment Trap', unit: 'each' },
      { name: 'Turbidity Curtain', unit: 'lin m' },
      { name: 'Spill Kit', unit: 'each' }
    ],
    'Miscellaneous': [
      { name: 'Trench Breaker', unit: 'each' },
      { name: 'Warning Tape', unit: 'lin m' },
      { name: 'Locate Wire', unit: 'lin m' },
      { name: 'Temporary Fence', unit: 'lin m' },
      { name: 'Gate Installation', unit: 'each' },
      { name: 'Culvert', unit: 'each' }
    ]
  }

  const defaultData = {
    items: [],
    comments: ''
  }

  const unitPriceData = {
    ...defaultData,
    ...data,
    items: data?.items || []
  }

  const updateField = (field, value) => {
    onChange({ ...unitPriceData, [field]: value })
  }

  // Item management
  const addItem = (category = '', itemName = '', unit = 'each') => {
    const newItem = {
      id: Date.now(),
      category: category,
      itemName: itemName,
      customItem: '',
      quantity: '',
      unit: unit,
      locationKP: '',
      notes: '',
      installedDate: reportDate || ''
    }
    onChange({ ...unitPriceData, items: [...unitPriceData.items, newItem] })
  }

  const updateItem = (id, field, value) => {
    const updatedItems = unitPriceData.items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value }
        // If selecting a predefined item, set the unit
        if (field === 'itemName' && item.category) {
          const categoryItems = itemCategories[item.category] || []
          const selectedItem = categoryItems.find(i => i.name === value)
          if (selectedItem) {
            updated.unit = selectedItem.unit
          }
        }
        return updated
      }
      return item
    })
    onChange({ ...unitPriceData, items: updatedItems })
  }

  const removeItem = (id) => {
    onChange({ ...unitPriceData, items: unitPriceData.items.filter(item => item.id !== id) })
  }

  // Styles
  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    color: '#495057',
    marginBottom: '3px'
  }

  const inputStyle = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '13px',
    boxSizing: 'border-box'
  }

  const selectStyle = {
    ...inputStyle,
    backgroundColor: 'white'
  }

  return (
    <div>
      {/* QUICK ADD BUTTONS */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ ...labelStyle, marginBottom: '6px' }}>Quick Add:</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {Object.keys(itemCategories).map(category => (
            <button
              key={category}
              onClick={() => addItem(category, '', 'each')}
              style={{
                padding: '4px 10px',
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                whiteSpace: 'nowrap'
              }}
            >
              + {category}
            </button>
          ))}
          <button
            onClick={() => addItem('Custom', '', 'each')}
            style={{
              padding: '4px 10px',
              backgroundColor: '#e7f3ff',
              border: '1px solid #007bff',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              color: '#007bff'
            }}
          >
            + Custom Item
          </button>
        </div>
      </div>

      {/* ITEMS LIST */}
      {unitPriceData.items.length === 0 ? (
        <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px', margin: 0, fontSize: '13px' }}>
          Click a category above to add unit price items installed today.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {unitPriceData.items.map((item, index) => (
            <div 
              key={item.id} 
              style={{ 
                border: '1px solid #dee2e6', 
                borderRadius: '6px', 
                padding: '10px',
                backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', color: '#6f42c1', fontSize: '12px' }}>
                  #{index + 1} - {item.category}
                </span>
                <button
                  onClick={() => removeItem(item.id)}
                  style={{
                    padding: '2px 8px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                {/* Item Selection or Custom */}
                {item.category === 'Custom' ? (
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={labelStyle}>Item Description *</label>
                    <input
                      type="text"
                      value={item.customItem}
                      onChange={(e) => updateItem(item.id, 'customItem', e.target.value)}
                      placeholder="Enter item description"
                      style={inputStyle}
                    />
                  </div>
                ) : (
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={labelStyle}>Item *</label>
                    <select
                      value={item.itemName}
                      onChange={(e) => updateItem(item.id, 'itemName', e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">Select item...</option>
                      {(itemCategories[item.category] || []).map(i => (
                        <option key={i.name} value={i.name}>{i.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label style={labelStyle}>Quantity *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                    placeholder="Qty"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Unit</label>
                  <select
                    value={item.unit}
                    onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                    style={selectStyle}
                  >
                    <option value="each">each</option>
                    <option value="lin m">lin m</option>
                    <option value="m²">m²</option>
                    <option value="m³">m³</option>
                    <option value="kg">kg</option>
                    <option value="tonne">tonne</option>
                    <option value="lot">lot</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Location (KP)</label>
                  <input
                    type="text"
                    value={item.locationKP}
                    onChange={(e) => updateItem(item.id, 'locationKP', e.target.value)}
                    placeholder="e.g. 5+250"
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>Notes</label>
                  <input
                    type="text"
                    value={item.notes}
                    onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
                    placeholder="Additional notes..."
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUMMARY */}
      {unitPriceData.items.length > 0 && (
        <div style={{ 
          marginTop: '10px', 
          padding: '8px 12px', 
          backgroundColor: '#d4edda', 
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 'bold',
          color: '#155724'
        }}>
          ✓ {unitPriceData.items.length} unit price item(s) recorded
        </div>
      )}

      {/* COMMENTS */}
      {unitPriceData.items.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <label style={labelStyle}>Comments</label>
          <textarea
            value={unitPriceData.comments}
            onChange={(e) => updateField('comments', e.target.value)}
            placeholder="Additional comments about unit price items..."
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '13px',
              minHeight: '50px',
              resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
        </div>
      )}
    </div>
  )
}

export default UnitPriceItemsLog
