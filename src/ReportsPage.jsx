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
          <h1 style={{ margin: 0, fontSize: '24px' }}>Inspector Reports</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>{filteredReports.length} reports found</p>
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
                        <button style={{ padding: '6px 12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>View</button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default ReportsPage
