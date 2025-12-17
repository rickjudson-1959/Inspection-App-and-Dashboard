import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'

function ReportsPage() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ dateFrom: '', dateTo: '', inspector: '', spread: '' })
  const [selectedReport, setSelectedReport] = useState(null)

  const isSuperAdmin = userProfile?.role === 'super_admin'

  useEffect(() => {
    fetchReports()
  }, [])

  async function fetchReports() {
    setLoading(true)
    let query = supabase
      .from('daily_tickets')
      .select('*')
      .order('date', { ascending: false })

    if (!isSuperAdmin && userProfile?.organization_id) {
      query = query.eq('organization_id', userProfile.organization_id)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching reports:', error)
    }
    setReports(data || [])
    setLoading(false)
  }

  function applyFilters() {
    let filtered = [...reports]
    if (filter.dateFrom) {
      filtered = filtered.filter(r => r.date >= filter.dateFrom)
    }
    if (filter.dateTo) {
      filtered = filtered.filter(r => r.date <= filter.dateTo)
    }
    if (filter.inspector) {
      filtered = filtered.filter(r => r.inspector_name?.toLowerCase().includes(filter.inspector.toLowerCase()))
    }
    if (filter.spread) {
      filtered = filtered.filter(r => r.spread?.toLowerCase().includes(filter.spread.toLowerCase()))
    }
    return filtered
  }

  const filteredReports = applyFilters()

  function getReportTotals(report) {
    const blocks = report.activity_blocks || []
    let totalLabour = 0
    let totalEquipment = 0
    let activities = []

    blocks.forEach(block => {
      if (block.activityType) activities.push(block.activityType)
      if (block.labourEntries) {
        block.labourEntries.forEach(entry => {
          totalLabour += ((entry.rt || 0) + (entry.ot || 0)) * (entry.count || 1)
        })
      }
      if (block.equipmentEntries) {
        block.equipmentEntries.forEach(entry => {
          totalEquipment += (entry.hours || 0) * (entry.count || 1)
        })
      }
    })

    return { totalLabour, totalEquipment, activities: [...new Set(activities)] }
  }

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading reports...</div>
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ backgroundColor: '#003366', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>Clearwater Pipeline - Demo Project</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>Inspector Reports | {filteredReports.length} reports found</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => navigate('/admin')} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Back to Admin</button>
          <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', padding: '20px', borderBottom: '1px solid #ddd' }}>
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
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Inspector</label>
            <input type="text" placeholder="Search..." value={filter.inspector} onChange={(e) => setFilter({ ...filter, inspector: e.target.value })} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '150px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Spread</label>
            <input type="text" placeholder="Search..." value={filter.spread} onChange={(e) => setFilter({ ...filter, spread: e.target.value })} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '150px' }} />
          </div>
          <button onClick={() => setFilter({ dateFrom: '', dateTo: '', inspector: '', spread: '' })} style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Clear</button>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Date</th>
                <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Inspector</th>
                <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Spread</th>
                <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Activities</th>
                <th style={{ padding: '15px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Labour Hrs</th>
                <th style={{ padding: '15px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Equip Hrs</th>
                <th style={{ padding: '15px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#666' }}>No reports found</td>
                </tr>
              ) : (
                filteredReports.map(report => {
                  const totals = getReportTotals(report)
                  return (
                    <tr key={report.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '15px' }}>{report.date}</td>
                      <td style={{ padding: '15px' }}>{report.inspector_name || '-'}</td>
                      <td style={{ padding: '15px' }}>{report.spread || '-'}</td>
                      <td style={{ padding: '15px' }}>{totals.activities.join(', ') || '-'}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>{totals.totalLabour.toFixed(1)}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>{totals.totalEquipment.toFixed(1)}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        <button onClick={() => setSelectedReport(report)} style={{ padding: '6px 12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>View</button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedReport && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '90%', maxWidth: '1000px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ backgroundColor: '#003366', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0 }}>
              <h2 style={{ margin: 0 }}>Daily Inspector Report - {selectedReport.date}</h2>
              <button onClick={() => setSelectedReport(null)} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                <div><strong>Date:</strong> {selectedReport.date}</div>
                <div><strong>Inspector:</strong> {selectedReport.inspector_name || '-'}</div>
                <div><strong>Spread:</strong> {selectedReport.spread || '-'}</div>
                <div><strong>Crew:</strong> {selectedReport.crew || '-'}</div>
                <div><strong>Change Order:</strong> {selectedReport.change_order || 'Base Contract'}</div>
              </div>

              {selectedReport.notes && (
                <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <strong>Notes:</strong>
                  <p style={{ margin: '10px 0 0 0' }}>{selectedReport.notes}</p>
                </div>
              )}

              {selectedReport.activity_blocks && selectedReport.activity_blocks.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ borderBottom: '2px solid #003366', paddingBottom: '10px' }}>Activity Blocks</h3>
                  {selectedReport.activity_blocks.map((block, idx) => (
                    <div key={idx} style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '4px', marginBottom: '15px' }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#003366' }}>{block.activityType || 'Activity ' + (idx + 1)}</h4>
                      
                      {block.chainageStart && (
                        <div style={{ marginBottom: '10px' }}>
                          <strong>Chainage:</strong> {block.chainageStart} to {block.chainageEnd}
                        </div>
                      )}

                      {block.labourEntries && block.labourEntries.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                          <strong>Labour:</strong>
                          <table style={{ width: '100%', marginTop: '5px', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#e9ecef' }}>
                                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #ddd' }}>Classification</th>
                                <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>Count</th>
                                <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>RT</th>
                                <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>OT</th>
                              </tr>
                            </thead>
                            <tbody>
                              {block.labourEntries.map((entry, i) => (
                                <tr key={i}>
                                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>{entry.classification || '-'}</td>
                                  <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>{entry.count || 1}</td>
                                  <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>{entry.rt || 0}</td>
                                  <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>{entry.ot || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {block.equipmentEntries && block.equipmentEntries.length > 0 && (
                        <div>
                          <strong>Equipment:</strong>
                          <table style={{ width: '100%', marginTop: '5px', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#e9ecef' }}>
                                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #ddd' }}>Type</th>
                                <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>Count</th>
                                <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>Hours</th>
                              </tr>
                            </thead>
                            <tbody>
                              {block.equipmentEntries.map((entry, i) => (
                                <tr key={i}>
                                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>{entry.type || '-'}</td>
                                  <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>{entry.count || 1}</td>
                                  <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>{entry.hours || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedReport.weather && (
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ borderBottom: '2px solid #003366', paddingBottom: '10px' }}>Weather</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                    <div><strong>Conditions:</strong> {selectedReport.weather.conditions || '-'}</div>
                    <div><strong>Temp:</strong> {selectedReport.weather.temperature || '-'}°C</div>
                    <div><strong>Wind:</strong> {selectedReport.weather.wind || '-'}</div>
                    <div><strong>Precipitation:</strong> {selectedReport.weather.precipitation || '-'}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportsPage
