import './App.css'
import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

// ✅ Create .env.local file with:
// VITE_SUPABASE_URL=https://aatvckalnvojlykfgnmz.supabase.co
// VITE_SUPABASE_ANON_KEY=your_key_here

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

function App() {
  // REAL CONTRACT RATES from CX2-FC Project
  const labourRates = {
    'GENERAL LABOURER': 48.10,
    'APPRENTICE OPER/OILER': 49.44,
    'WELDER HELPER': 53.52,
    'BUS/ CREWCAB DRIVER': 56.73,
    'PRINCIPAL OPER 1': 64.24,
    'STRAW - OPERATOR': 64.24,
    'FRONT-END/TIE-IN WELDER': 82.20,
    'STRAW - FITTER': 82.81,
    'UA TIE-IN FOREMAN': 1952.31
  }

  // REAL EQUIPMENT from CX2-FC Project
  const equipmentRates = {
    'ATV/Gator': 45,
    'ARGO ATV Side By Side': 45,
    'Athey Wagon': 95,
    'Athey Wagon - 30 Tonne': 95,
    'Backhoe - Cat 315': 110,
    'Backhoe - Cat 320': 120,
    'Backhoe - Cat 324': 130,
    'Backhoe - Cat 330': 130,
    'Backhoe - Cat 336': 140,
    'Backhoe - Cat 345': 150,
    'Backhoe - Cat 365': 140,
    'Backhoe - Cat 374': 150
  }

  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedCrew, setSelectedCrew] = useState('')
  const [selectedChangeOrder, setSelectedChangeOrder] = useState('Base Contract')
  const [notes, setNotes] = useState('')
  const [filterCrew, setFilterCrew] = useState('')
  const [filterChangeOrder, setFilterChangeOrder] = useState('')
  const [labourEntries, setLabourEntries] = useState([])
  const [equipmentEntries, setEquipmentEntries] = useState([])
  const [employeeName, setEmployeeName] = useState('')
  const [employeeClass, setEmployeeClass] = useState('GENERAL LABOURER')
  const [rtHours, setRtHours] = useState('')
  const [otHours, setOtHours] = useState('')
  const [equipmentUnit, setEquipmentUnit] = useState('')
  const [equipmentDesc, setEquipmentDesc] = useState('')
  const [equipmentHours, setEquipmentHours] = useState('')

  useEffect(() => {
    loadPhotos()
  }, [])

  async function loadPhotos() {
    const { data } = await supabase.from('daily_tickets').select('*').order('created_at', { ascending: false })
    if (data) setPhotos(data)
  }

  async function uploadPhoto(event) {
    try {
      setUploading(true)
      const file = event.target.files[0]
      if (!file) return
      const fileExt = file.name.split('.').pop()
      const fileName = Date.now() + '.' + fileExt
      const { error: uploadError } = await supabase.storage.from('ticket-photos').upload(fileName, file)
      if (uploadError) throw uploadError
      const { error: dbError } = await supabase.from('daily_tickets').insert([{
        photo_url: fileName,
        date: selectedDate,
        crew: selectedCrew,
        change_order: selectedChangeOrder,
        notes: notes,
        labour_data: labourEntries,
        equipment_data: equipmentEntries,
        total_cost: calculateTotalCost(labourEntries, equipmentEntries)
      }])
      if (dbError) throw dbError
      alert('Ticket uploaded!')
      setNotes('')
      setLabourEntries([])
      setEquipmentEntries([])
      event.target.value = null
      loadPhotos()
    } catch (error) {
      alert('Error: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  function exportToExcel() {
    const data = filteredPhotos.map(photo => ({
      Date: new Date(photo.date).toLocaleDateString(),
      Crew: photo.crew || '',
      'Work Type': photo.change_order || '',
      Notes: photo.notes || '',
      'Photo File': photo.photo_url,
      'Total Cost': photo.total_cost || 0
    }))

    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tickets')
    XLSX.writeFile(workbook, `Pipeline_Tickets_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const filteredPhotos = photos.filter(photo => {
    if (filterCrew && photo.crew !== filterCrew) return false
    if (filterChangeOrder && photo.change_order !== filterChangeOrder) return false
    return true
  })

  function addLabourEntry() {
    if (!employeeName) return
    const entry = {
      name: employeeName,
      classification: employeeClass,
      rt: parseFloat(rtHours) || 0,
      ot: parseFloat(otHours) || 0
    }
    setLabourEntries([...labourEntries, entry])
    setEmployeeName('')
    setRtHours('')
    setOtHours('')
  }

  function addEquipmentEntry() {
    if (!equipmentUnit) return
    const entry = {
      unit: equipmentUnit,
      description: equipmentDesc,
      hours: parseFloat(equipmentHours) || 0
    }
    setEquipmentEntries([...equipmentEntries, entry])
    setEquipmentUnit('')
    setEquipmentDesc('')
    setEquipmentHours('')
  }

  function calculateTotalCost(labour, equipment) {
    let labourCost = 0
    labour.forEach(entry => {
      const rate = labourRates[entry.classification] || 0
      labourCost += (entry.rt * rate) + (entry.ot * rate * 1.5)
    })

    let equipmentCost = 0
    equipment.forEach(entry => {
      const rate = equipmentRates[entry.description] || 0
      equipmentCost += entry.hours * rate
    })

    return labourCost + equipmentCost
  }

  return (
    <div style={{ padding: '10px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Pipeline Inspector</h1>

      {/* Upload Section */}
      <div style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2>Upload Ticket</h2>

        <div style={{ marginBottom: '10px' }}>
          <label>Date: </label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label>Crew: </label>
          <select value={selectedCrew} onChange={(e) => setSelectedCrew(e.target.value)}>
            <option value="">Select...</option>
            <option value="Crew 1">Crew 1</option>
            <option value="Crew 2">Crew 2</option>
            <option value="Crew 3">Crew 3</option>
          </select>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label>Type: </label>
          <select value={selectedChangeOrder} onChange={(e) => setSelectedChangeOrder(e.target.value)}>
            <option value="Base Contract">Base Contract</option>
            <option value="Change Order #1">CO #1</option>
            <option value="Change Order #2">CO #2</option>
          </select>
        </div>

        {/* Labour Section */}
        <h3 style={{ marginTop: '20px', borderTop: '2px solid #ddd', paddingTop: '15px' }}>Labour</h3>
        <div className="form-grid-labour">
          <div>
            <label style={{ display: 'block', fontSize: '12px' }}>Employee Name</label>
            <input
              type="text"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="John Smith"
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px' }}>Classification</label>
            <select value={employeeClass} onChange={(e) => setEmployeeClass(e.target.value)} style={{ width: '100%', padding: '8px' }}>
              <option value="GENERAL LABOURER">General Labourer</option>
              <option value="APPRENTICE OPER/OILER">Apprentice Oper/Oiler</option>
              <option value="WELDER HELPER">Welder Helper</option>
              <option value="BUS/ CREWCAB DRIVER">Bus/Crewcab Driver</option>
              <option value="PRINCIPAL OPER 1">Principal Oper 1</option>
              <option value="STRAW - OPERATOR">Straw - Operator</option>
              <option value="FRONT-END/TIE-IN WELDER">Front-End/Tie-In Welder</option>
              <option value="STRAW - FITTER">Straw - Fitter</option>
              <option value="UA TIE-IN FOREMAN">UA Tie-In Foreman</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px' }}>RT Hours</label>
            <input
              type="number"
              value={rtHours}
              onChange={(e) => setRtHours(e.target.value)}
              placeholder="8"
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px' }}>OT Hours</label>
            <input
              type="number"
              value={otHours}
              onChange={(e) => setOtHours(e.target.value)}
              placeholder="0"
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={addLabourEntry}
              type="button"
              style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
            >
              Add
            </button>
          </div>
        </div>

        {labourEntries.length > 0 && (
          <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <strong>Employees ({labourEntries.length}):</strong>
            {labourEntries.map((entry, idx) => (
              <div key={idx} style={{ fontSize: '14px', marginTop: '5px' }}>
                {entry.name} - {entry.classification} (RT: {entry.rt}h, OT: {entry.ot}h)
              </div>
            ))}
          </div>
        )}

        {/* Equipment Section */}
        <h3 style={{ marginTop: '20px', borderTop: '2px solid #ddd', paddingTop: '15px' }}>Equipment</h3>
        <div className="form-grid-equipment">
          <div>
            <label style={{ display: 'block', fontSize: '12px' }}>Unit ID</label>
            <input
              type="text"
              value={equipmentUnit}
              onChange={(e) => setEquipmentUnit(e.target.value)}
              placeholder="EX-01"
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px' }}>Description</label>
            <select value={equipmentDesc} onChange={(e) => setEquipmentDesc(e.target.value)} style={{ width: '100%', padding: '8px' }}>
              <option value="">Select Equipment...</option>
              <option value="ATV/Gator">ATV/Gator</option>
              <option value="ARGO ATV Side By Side">ARGO ATV Side By Side</option>
              <option value="Athey Wagon">Athey Wagon</option>
              <option value="Athey Wagon - 30 Tonne">Athey Wagon - 30 Tonne</option>
              <option value="Backhoe - Cat 315">Backhoe - Cat 315</option>
              <option value="Backhoe - Cat 320">Backhoe - Cat 320</option>
              <option value="Backhoe - Cat 324">Backhoe - Cat 324</option>
              <option value="Backhoe - Cat 330">Backhoe - Cat 330</option>
              <option value="Backhoe - Cat 336">Backhoe - Cat 336</option>
              <option value="Backhoe - Cat 345">Backhoe - Cat 345</option>
              <option value="Backhoe - Cat 365">Backhoe - Cat 365</option>
              <option value="Backhoe - Cat 374">Backhoe - Cat 374</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px' }}>Hours</label>
            <input
              type="number"
              value={equipmentHours}
              onChange={(e) => setEquipmentHours(e.target.value)}
              placeholder="8"
              style={{ width: '100%', padding: '8px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={addEquipmentEntry}
              type="button"
              style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
            >
              Add
            </button>
          </div>
        </div>

        {equipmentEntries.length > 0 && (
          <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <strong>Equipment ({equipmentEntries.length}):</strong>
            {equipmentEntries.map((entry, idx) => (
              <div key={idx} style={{ fontSize: '14px', marginTop: '5px' }}>
                {entry.unit} - {entry.description} ({entry.hours}h)
              </div>
            ))}
          </div>
        )}

        {/* Notes and Upload */}
        <div style={{ marginBottom: '10px', marginTop: '20px' }}>
          <label>Notes: </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows="2" style={{ width: '300px' }} />
        </div>

        <div>
          <input type="file" accept="image/*" onChange={uploadPhoto} disabled={uploading} />
          {uploading && <span> Uploading...</span>}
        </div>
      </div>

      {/* Tickets List Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2>Tickets ({filteredPhotos.length} of {photos.length})</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={exportToExcel}
            style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Export to Excel
          </button>
          <select value={filterCrew} onChange={(e) => setFilterCrew(e.target.value)} style={{ padding: '8px' }}>
            <option value="">All Crews</option>
            <option value="Crew 1">Crew 1</option>
            <option value="Crew 2">Crew 2</option>
            <option value="Crew 3">Crew 3</option>
          </select>
          <select value={filterChangeOrder} onChange={(e) => setFilterChangeOrder(e.target.value)} style={{ padding: '8px' }}>
            <option value="">All Types</option>
            <option value="Base Contract">Base Contract</option>
            <option value="Change Order #1">CO #1</option>
            <option value="Change Order #2">CO #2</option>
          </select>
        </div>
      </div>

      {/* Tickets Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
        {filteredPhotos.map((p) => (
          <div key={p.id} style={{ border: '1px solid #ddd', padding: '10px', borderRadius: '4px' }}>
            <img
              src={supabaseUrl + '/storage/v1/object/public/ticket-photos/' + p.photo_url}
              style={{ width: '100%' }}
              alt="Ticket"
            />
            <div><strong>Date:</strong> {p.date}</div>
            {p.crew && <div><strong>Crew:</strong> {p.crew}</div>}
            {p.change_order && <div><strong>Type:</strong> {p.change_order}</div>}
            {p.notes && <div><em>{p.notes}</em></div>}
            {p.labour_data && p.labour_data.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '13px', backgroundColor: '#e8f4f8', padding: '8px', borderRadius: '4px' }}>
                <strong>Labour ({p.labour_data.length}):</strong>
                {p.labour_data.map((l, i) => (
                  <div key={i}>{l.name} - {l.classification} ({l.rt}h RT, {l.ot}h OT)</div>
                ))}
              </div>
            )}
            {p.equipment_data && p.equipment_data.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '13px', backgroundColor: '#fff3cd', padding: '8px', borderRadius: '4px' }}>
                <strong>Equipment ({p.equipment_data.length}):</strong>
                {p.equipment_data.map((e, i) => (
                  <div key={i}>{e.unit} - {e.description} ({e.hours}h)</div>
                ))}
              </div>
            )}
            {p.total_cost > 0 && (
              <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#d4edda', border: '2px solid #28a745', borderRadius: '4px', fontWeight: 'bold', fontSize: '16px', textAlign: 'center' }}>
                Daily Cost: ${p.total_cost.toFixed(2)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
