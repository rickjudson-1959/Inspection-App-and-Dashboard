import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'

function ContractorLEMs() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  const [lems, setLems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedLem, setSelectedLem] = useState(null)
  const [filter, setFilter] = useState({ dateFrom: '', dateTo: '', foreman: '' })
  const [viewMode, setViewMode] = useState('summary')

  useEffect(() => {
    fetchLems()
  }, [])

  async function fetchLems() {
    setLoading(true)
    const { data, error } = await supabase
      .from('contractor_lems')
      .select('*')
      .order('date', { ascending: false })

    if (error) {
      console.error('Error fetching LEMs:', error)
    }
    setLems(data || [])
    setLoading(false)
  }

  function applyFilters() {
    let filtered = [...lems]
    if (filter.dateFrom) {
      filtered = filtered.filter(l => l.date >= filter.dateFrom)
    }
    if (filter.dateTo) {
      filtered = filtered.filter(l => l.date <= filter.dateTo)
    }
    if (filter.foreman) {
      filtered = filtered.filter(l => l.foreman?.toLowerCase().includes(filter.foreman.toLowerCase()))
    }
    return filtered
  }

  const filteredLems = applyFilters()

  // Calculate summary stats
  const totalLabour = filteredLems.reduce((sum, l) => sum + (l.total_labour_cost || 0), 0)
  const totalEquipment = filteredLems.reduce((sum, l) => sum + (l.total_equipment_cost || 0), 0)
  const totalWorkers = filteredLems.reduce((sum, l) => sum + (l.labour_entries?.length || 0), 0)
  const totalEquipmentItems = filteredLems.reduce((sum, l) => sum + (l.equipment_entries?.length || 0), 0)

  // Group by foreman for summary view
  const byForeman = filteredLems.reduce((acc, lem) => {
    const key = lem.foreman || 'Unknown'
    if (!acc[key]) {
      acc[key] = { lems: [], labourCost: 0, equipmentCost: 0, workers: 0 }
    }
    acc[key].lems.push(lem)
    acc[key].labourCost += lem.total_labour_cost || 0
    acc[key].equipmentCost += lem.total_equipment_cost || 0
    acc[key].workers += lem.labour_entries?.length || 0
    return acc
  }, {})

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading contractor LEMs...</div>
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#2c3e50', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>Contractor LEMs</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>{filteredLems.length} field logs</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => navigate('/admin')} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Back to Admin</button>
          <button onClick={() => navigate('/reconciliation')} style={{ padding: '10px 20px', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reconciliation</button>
          <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Total Labour Cost</h3>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#27ae60' }}>${totalLabour.toLocaleString()}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Total Equipment Cost</h3>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#3498db' }}>${totalEquipment.toLocaleString()}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Total Workers</h3>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#9b59b6' }}>{totalWorkers}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Equipment Items</h3>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#e67e22' }}>{totalEquipmentItems}</p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Date From</label>
              <input type="date" value={filter.dateFrom} onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Date To</label>
              <input type="date" value={filter.dateTo} onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Foreman</label>
              <input type="text" placeholder="Search..." value={filter.foreman} onChange={(e) => setFilter({ ...filter, foreman: e.target.value })} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '150px' }} />
            </div>
            <button onClick={() => setFilter({ dateFrom: '', dateTo: '', foreman: '' })} style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Clear</button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
              <button onClick={() => setViewMode('summary')} style={{ padding: '8px 16px', backgroundColor: viewMode === 'summary' ? '#2c3e50' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>By Foreman</button>
              <button onClick={() => setViewMode('list')} style={{ padding: '8px 16px', backgroundColor: viewMode === 'list' ? '#2c3e50' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>All LEMs</button>
            </div>
          </div>
        </div>

        {/* Summary by Foreman */}
        {viewMode === 'summary' && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#2c3e50', color: 'white' }}>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Foreman</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>LEMs</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>Workers</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Labour Cost</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Equipment Cost</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byForeman).map(([foreman, data]) => (
                  <tr key={foreman} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }} onClick={() => { setFilter({ ...filter, foreman }); setViewMode('list'); }}>
                    <td style={{ padding: '15px', fontWeight: 'bold' }}>{foreman}</td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>{data.lems.length}</td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>{data.workers}</td>
                    <td style={{ padding: '15px', textAlign: 'right', color: '#27ae60' }}>${data.labourCost.toLocaleString()}</td>
                    <td style={{ padding: '15px', textAlign: 'right', color: '#3498db' }}>${data.equipmentCost.toLocaleString()}</td>
                    <td style={{ padding: '15px', textAlign: 'right', fontWeight: 'bold' }}>${(data.labourCost + data.equipmentCost).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#2c3e50', color: 'white' }}>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Field Log ID</th>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Foreman</th>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Account</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>Workers</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Labour</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Equipment</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLems.map(lem => (
                  <tr key={lem.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '15px', fontWeight: 'bold' }}>{lem.field_log_id}</td>
                    <td style={{ padding: '15px' }}>{lem.date}</td>
                    <td style={{ padding: '15px' }}>{lem.foreman}</td>
                    <td style={{ padding: '15px' }}>{lem.account_number}</td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>{lem.labour_entries?.length || 0}</td>
                    <td style={{ padding: '15px', textAlign: 'right', color: '#27ae60' }}>${(lem.total_labour_cost || 0).toLocaleString()}</td>
                    <td style={{ padding: '15px', textAlign: 'right', color: '#3498db' }}>${(lem.total_equipment_cost || 0).toLocaleString()}</td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>
                      <button onClick={() => setSelectedLem(lem)} style={{ padding: '6px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '90%', maxWidth: '1200px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ backgroundColor: '#2c3e50', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0 }}>
              <div>
                <h2 style={{ margin: 0 }}>Field Log {selectedLem.field_log_id}</h2>
                <p style={{ margin: '5px 0 0 0', opacity: 0.8 }}>{selectedLem.foreman} - {selectedLem.date}</p>
              </div>
              <button onClick={() => setSelectedLem(null)} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '4px' }}>
                  <strong>Account:</strong> {selectedLem.account_number}
                </div>
                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '4px' }}>
                  <strong>Total:</strong> ${((selectedLem.total_labour_cost || 0) + (selectedLem.total_equipment_cost || 0)).toLocaleString()}
                </div>
              </div>

              <h3 style={{ borderBottom: '2px solid #2c3e50', paddingBottom: '10px' }}>Labour ({selectedLem.labour_entries?.length || 0} workers)</h3>
              <table style={{ width: '100%', marginBottom: '20px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#ecf0f1' }}>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>ID</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Name</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Classification</th>
                    <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>RT Hrs</th>
                    <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>RT Rate</th>
                    <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>OT Hrs</th>
                    <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>OT Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedLem.labour_entries || []).map((entry, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{entry.employee_id}</td>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{entry.name}</td>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{entry.type}</td>
                      <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>{entry.rt_hours}</td>
                      <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>${entry.rt_rate?.toFixed(2)}</td>
                      <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>{entry.ot_hours}</td>
                      <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>${entry.ot_rate?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ borderBottom: '2px solid #2c3e50', paddingBottom: '10px' }}>Equipment ({selectedLem.equipment_entries?.length || 0} items)</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#ecf0f1' }}>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Equipment ID</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Type</th>
                    <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>Hours</th>
                    <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedLem.equipment_entries || []).map((entry, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{entry.equipment_id}</td>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{entry.type}</td>
                      <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>{entry.hours}</td>
                      <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{entry.rate ? `$${entry.rate.toFixed(2)}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ContractorLEMs
