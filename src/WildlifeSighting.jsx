import React, { useState } from 'react'

function WildlifeSighting({ data, onChange, inspectorName, reportDate }) {
  const [showForm, setShowForm] = useState(data?.enabled || false)

  // Default structure
  const defaultData = {
    enabled: false,
    sightings: []
  }

  // Merge incoming data with defaults
  const wildlifeData = {
    ...defaultData,
    ...data,
    sightings: data?.sightings || []
  }

  // Wildlife species list
  const speciesList = [
    // Birds
    { category: 'Birds', species: ['Owl', 'Hawk', 'Eagle', 'Falcon', 'Trumpeter Swan', 'Common Nighthawk', 'Rusty Blackbird', 'Duck', 'Songbird'] },
    // Large Mammals
    { category: 'Large Mammals', species: ['Moose', 'Caribou', 'Elk', 'Mule Deer', 'Whitetail Deer', 'Black Bear', 'Grizzly Bear'] },
    // Medium/Small Mammals
    { category: 'Other Mammals', species: ['Wolf', 'Coyote', 'Fox', 'Wolverine', 'Weasel', 'Beaver'] },
    // Amphibians/Reptiles
    { category: 'Amphibians/Reptiles', species: ['Salamander', 'Toad', 'Frog'] },
    // Signs
    { category: 'Signs/Habitat', species: ['Stick Nest', 'Mineral Lick', 'Squirrel Midden', 'Burrow', 'Bear Den', 'Tracks', 'Scat'] }
  ]

  const toggleForm = () => {
    const newEnabled = !showForm
    setShowForm(newEnabled)
    onChange({ ...wildlifeData, enabled: newEnabled })
  }

  const addSighting = () => {
    const newSighting = {
      id: Date.now(),
      date: reportDate || '',
      time: '',
      inspector: inspectorName || '',
      crew: '',
      species: [],
      otherSpecies: '',
      speciesDetail: '',
      location: '',
      gpsCoordinates: '',
      numberOfAnimals: '',
      gender: '',
      ageGroup: '',
      activity: '',
      mortality: '',
      mortalityCause: '',
      comments: '',
      photoTaken: false,
      photos: []
    }
    onChange({ ...wildlifeData, sightings: [...wildlifeData.sightings, newSighting] })
  }

  const updateSighting = (sightingId, field, value) => {
    const updated = wildlifeData.sightings.map(sighting => {
      if (sighting.id === sightingId) {
        return { ...sighting, [field]: value }
      }
      return sighting
    })
    onChange({ ...wildlifeData, sightings: updated })
  }

  const toggleSpecies = (sightingId, species) => {
    const updated = wildlifeData.sightings.map(sighting => {
      if (sighting.id === sightingId) {
        const currentSpecies = sighting.species || []
        if (currentSpecies.includes(species)) {
          return { ...sighting, species: currentSpecies.filter(s => s !== species) }
        } else {
          return { ...sighting, species: [...currentSpecies, species] }
        }
      }
      return sighting
    })
    onChange({ ...wildlifeData, sightings: updated })
  }

  const removeSighting = (sightingId) => {
    onChange({ ...wildlifeData, sightings: wildlifeData.sightings.filter(s => s.id !== sightingId) })
  }

  const handlePhotoUpload = (sightingId, files) => {
    const updated = wildlifeData.sightings.map(sighting => {
      if (sighting.id === sightingId) {
        const newPhotos = Array.from(files).map(file => ({
          id: Date.now() + Math.random(),
          file: file,
          name: file.name,
          preview: URL.createObjectURL(file)
        }))
        return { 
          ...sighting, 
          photos: [...(sighting.photos || []), ...newPhotos],
          photoTaken: true
        }
      }
      return sighting
    })
    onChange({ ...wildlifeData, sightings: updated })
  }

  const removePhoto = (sightingId, photoId) => {
    const updated = wildlifeData.sightings.map(sighting => {
      if (sighting.id === sightingId) {
        const filteredPhotos = (sighting.photos || []).filter(p => p.id !== photoId)
        return { 
          ...sighting, 
          photos: filteredPhotos,
          photoTaken: filteredPhotos.length > 0
        }
      }
      return sighting
    })
    onChange({ ...wildlifeData, sightings: updated })
  }

  // Styles
  const sectionStyle = {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #dee2e6'
  }

  const cardStyle = {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    border: '2px solid #20c997',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
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

  const textareaStyle = {
    ...inputStyle,
    minHeight: '60px',
    resize: 'vertical'
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px'
  }

  const checkboxGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '6px'
  }

  const checkboxStyle = {
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '4px 8px',
    backgroundColor: '#f8f9fa',
    borderRadius: '4px',
    border: '1px solid #dee2e6'
  }

  const checkedStyle = {
    ...checkboxStyle,
    backgroundColor: '#d4edda',
    borderColor: '#28a745'
  }

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <div>
          <h4 style={{ margin: 0, color: '#20c997', fontSize: '14px' }}>🦌 Wildlife Sighting Records</h4>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
            Document wildlife observations and signs
          </p>
        </div>
        <button
          onClick={toggleForm}
          style={{
            padding: '8px 16px',
            backgroundColor: showForm ? '#dc3545' : '#20c997',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          {showForm ? '− Hide Sightings' : '+ Add Wildlife Sighting'}
        </button>
      </div>

      {showForm && (
        <div>
          {/* Add Sighting Button */}
          <div style={{ marginBottom: '15px' }}>
            <button
              onClick={addSighting}
              style={{
                padding: '10px 20px',
                backgroundColor: '#20c997',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              + New Sighting
            </button>
          </div>

          {/* Sightings List */}
          {wildlifeData.sightings.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
              No wildlife sightings recorded. Click "New Sighting" to add one.
            </p>
          ) : (
            wildlifeData.sightings.map((sighting, index) => (
              <div key={sighting.id} style={cardStyle}>
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '10px', borderBottom: '2px solid #20c997' }}>
                  <h4 style={{ margin: 0, color: '#0ca678' }}>
                    🦌 Wildlife Sighting #{index + 1}
                    {sighting.species?.length > 0 && (
                      <span style={{ fontWeight: 'normal', fontSize: '13px', marginLeft: '10px' }}>
                        ({sighting.species.join(', ')})
                      </span>
                    )}
                  </h4>
                  <button
                    onClick={() => removeSighting(sighting.id)}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Remove
                  </button>
                </div>

                {/* Basic Info */}
                <div style={{ ...gridStyle, marginBottom: '15px' }}>
                  <div>
                    <label style={labelStyle}>Date</label>
                    <input
                      type="date"
                      value={sighting.date}
                      onChange={(e) => updateSighting(sighting.id, 'date', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Time</label>
                    <input
                      type="time"
                      value={sighting.time}
                      onChange={(e) => updateSighting(sighting.id, 'time', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Inspector</label>
                    <input
                      type="text"
                      value={sighting.inspector}
                      onChange={(e) => updateSighting(sighting.id, 'inspector', e.target.value)}
                      placeholder="Inspector name"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Crew</label>
                    <input
                      type="text"
                      value={sighting.crew}
                      onChange={(e) => updateSighting(sighting.id, 'crew', e.target.value)}
                      placeholder="Crew name"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Species Selection */}
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ ...labelStyle, marginBottom: '10px' }}>Wildlife Species or Sign (Select all that apply)</label>
                  
                  {speciesList.map(category => (
                    <div key={category.category} style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#495057', marginBottom: '5px' }}>
                        {category.category}
                      </div>
                      <div style={checkboxGridStyle}>
                        {category.species.map(species => (
                          <label
                            key={species}
                            style={(sighting.species || []).includes(species) ? checkedStyle : checkboxStyle}
                          >
                            <input
                              type="checkbox"
                              checked={(sighting.species || []).includes(species)}
                              onChange={() => toggleSpecies(sighting.id, species)}
                              style={{ marginRight: '6px' }}
                            />
                            {species}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Other Species */}
                  <div style={{ marginTop: '10px' }}>
                    <label style={labelStyle}>Other Species (if not listed)</label>
                    <input
                      type="text"
                      value={sighting.otherSpecies}
                      onChange={(e) => updateSighting(sighting.id, 'otherSpecies', e.target.value)}
                      placeholder="e.g. Lynx, Porcupine, etc."
                      style={inputStyle}
                    />
                  </div>

                  {/* Species Detail */}
                  <div style={{ marginTop: '10px' }}>
                    <label style={labelStyle}>Species Detail (subspecies, coloring, etc.)</label>
                    <input
                      type="text"
                      value={sighting.speciesDetail}
                      onChange={(e) => updateSighting(sighting.id, 'speciesDetail', e.target.value)}
                      placeholder="e.g. Red Fox, Great Grey Owl"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Location */}
                <div style={{ ...gridStyle, marginBottom: '15px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={labelStyle}>Location (UTM, road, pipeline name, KP)</label>
                    <input
                      type="text"
                      value={sighting.location}
                      onChange={(e) => updateSighting(sighting.id, 'location', e.target.value)}
                      placeholder="e.g. KP 5+250, near access road"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>GPS Coordinates</label>
                    <input
                      type="text"
                      value={sighting.gpsCoordinates}
                      onChange={(e) => updateSighting(sighting.id, 'gpsCoordinates', e.target.value)}
                      placeholder="e.g. 54.1234, -118.5678"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Animal Details */}
                <div style={{ ...gridStyle, marginBottom: '15px' }}>
                  <div>
                    <label style={labelStyle}>Number of Animals</label>
                    <input
                      type="number"
                      value={sighting.numberOfAnimals}
                      onChange={(e) => updateSighting(sighting.id, 'numberOfAnimals', e.target.value)}
                      placeholder="Count"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Gender</label>
                    <select
                      value={sighting.gender}
                      onChange={(e) => updateSighting(sighting.id, 'gender', e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Unknown">Unknown</option>
                      <option value="Mixed">Mixed Group</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Age Group</label>
                    <select
                      value={sighting.ageGroup}
                      onChange={(e) => updateSighting(sighting.id, 'ageGroup', e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Select...</option>
                      <option value="Adult">Adult</option>
                      <option value="Juvenile">Juvenile</option>
                      <option value="Calf/Fawn">Calf/Fawn</option>
                      <option value="Mixed">Mixed Ages</option>
                      <option value="Unknown">Unknown</option>
                    </select>
                  </div>
                </div>

                {/* Activity */}
                <div style={{ marginBottom: '15px' }}>
                  <label style={labelStyle}>Activity (feeding, resting, walking, crossing ROW, etc.)</label>
                  <textarea
                    value={sighting.activity}
                    onChange={(e) => updateSighting(sighting.id, 'activity', e.target.value)}
                    placeholder="Describe animal activity..."
                    style={textareaStyle}
                  />
                </div>

                {/* Mortality */}
                <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
                  <label style={{ ...labelStyle, color: '#856404' }}>Mortality (if applicable)</label>
                  <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
                    <label style={{ cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`mortality-${sighting.id}`}
                        checked={sighting.mortality === 'no'}
                        onChange={() => updateSighting(sighting.id, 'mortality', 'no')}
                        style={{ marginRight: '5px' }}
                      />
                      No Mortality
                    </label>
                    <label style={{ cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`mortality-${sighting.id}`}
                        checked={sighting.mortality === 'yes'}
                        onChange={() => updateSighting(sighting.id, 'mortality', 'yes')}
                        style={{ marginRight: '5px' }}
                      />
                      Mortality Observed
                    </label>
                  </div>
                  {sighting.mortality === 'yes' && (
                    <div>
                      <label style={labelStyle}>Suspected Cause (road collision, predation, hunting, etc.)</label>
                      <input
                        type="text"
                        value={sighting.mortalityCause}
                        onChange={(e) => updateSighting(sighting.id, 'mortalityCause', e.target.value)}
                        placeholder="Describe suspected cause..."
                        style={inputStyle}
                      />
                    </div>
                  )}
                </div>

                {/* Photo Upload Section */}
                <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#e8f8f5', borderRadius: '8px', border: '1px solid #20c997' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ ...labelStyle, marginBottom: 0, color: '#0ca678' }}>
                      📷 Wildlife Photos ({(sighting.photos || []).length})
                    </label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <label style={{
                        padding: '8px 16px',
                        backgroundColor: '#20c997',
                        color: 'white',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold'
                      }}>
                        📁 Upload from Gallery
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => handlePhotoUpload(sighting.id, e.target.files)}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <label style={{
                        padding: '8px 16px',
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold'
                      }}>
                        📸 Take Photo
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handlePhotoUpload(sighting.id, e.target.files)}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Photo Previews */}
                  {(sighting.photos || []).length > 0 && (
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
                      gap: '10px',
                      marginTop: '10px'
                    }}>
                      {(sighting.photos || []).map(photo => (
                        <div key={photo.id} style={{ position: 'relative' }}>
                          <img
                            src={photo.preview}
                            alt={photo.name}
                            style={{
                              width: '100%',
                              height: '100px',
                              objectFit: 'cover',
                              borderRadius: '4px',
                              border: '2px solid #20c997'
                            }}
                          />
                          <button
                            onClick={() => removePhoto(sighting.id, photo.id)}
                            style={{
                              position: 'absolute',
                              top: '-8px',
                              right: '-8px',
                              width: '24px',
                              height: '24px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '50%',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ×
                          </button>
                          <div style={{ 
                            fontSize: '10px', 
                            color: '#666', 
                            marginTop: '4px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {photo.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(sighting.photos || []).length === 0 && (
                    <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', margin: '10px 0 0 0', fontSize: '13px' }}>
                      No photos uploaded. Use buttons above to add wildlife photos.
                    </p>
                  )}
                </div>

                {/* Comments */}
                <div>
                  <label style={labelStyle}>Other Comments</label>
                  <textarea
                    value={sighting.comments}
                    onChange={(e) => updateSighting(sighting.id, 'comments', e.target.value)}
                    placeholder="Any additional observations..."
                    style={textareaStyle}
                  />
                </div>
              </div>
            ))
          )}

          {/* Summary */}
          {wildlifeData.sightings.length > 0 && (
            <div style={{ padding: '10px', backgroundColor: '#d1f2eb', borderRadius: '4px', fontSize: '13px' }}>
              <strong>Summary:</strong>{' '}
              {wildlifeData.sightings.length} sighting(s) |{' '}
              Total animals: {wildlifeData.sightings.reduce((sum, s) => sum + (parseInt(s.numberOfAnimals) || 0), 0)} |{' '}
              Photos: {wildlifeData.sightings.reduce((sum, s) => sum + (s.photos?.length || 0), 0)} |{' '}
              Species: {[...new Set(wildlifeData.sightings.flatMap(s => s.species || []))].join(', ') || 'None selected'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default WildlifeSighting
