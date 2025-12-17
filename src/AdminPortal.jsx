import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'

function AdminPortal() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  const [organizations, setOrganizations] = useState([])
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  const [newOrg, setNewOrg] = useState({ name: '', slug: '' })
  const [newProject, setNewProject] = useState({ name: '', shortCode: '', organizationId: '' })

  const isSuperAdmin = userProfile?.role === 'super_admin'

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const { data: orgs } = await supabase.from('organizations').select('*').order('name')
    setOrganizations(orgs || [])

    const { data: usersData } = await supabase.from('user_profiles').select('*, organizations(name)').order('email')
    setUsers(usersData || [])

    const { data: projectsData } = await supabase.from('projects').select('*, organizations(name)').order('name')
    setProjects(projectsData || [])

    setLoading(false)
  }

  async function createOrganization() {
    if (!newOrg.name || !newOrg.slug) {
      alert('Please fill in organization name and slug')
      return
    }
    const { error } = await supabase.from('organizations').insert([{
      name: newOrg.name,
      slug: newOrg.slug.toLowerCase().replace(/\s+/g, '-')
    }])
    if (error) {
      alert('Error: ' + error.message)
    } else {
      setNewOrg({ name: '', slug: '' })
      fetchData()
    }
  }

  async function createProject() {
    if (!newProject.name || !newProject.shortCode || !newProject.organizationId) {
      alert('Please fill in all project fields')
      return
    }
    const { error } = await supabase.from('projects').insert([{
      name: newProject.name,
      short_code: newProject.shortCode,
      organization_id: newProject.organizationId
    }])
    if (error) {
      alert('Error: ' + error.message)
    } else {
      setNewProject({ name: '', shortCode: '', organizationId: '' })
      fetchData()
    }
  }


  // Export Master Production Spreadsheet (CLX2 Format)
  async function exportMasterProduction() {
    const PROJECT_NAME = "Clearwater Pipeline - Demo Project"
    const PROJECT_SHORT = "CWP"
    
    const { data: reports, error } = await supabase
      .from('daily_tickets')
      .select('*')
      .order('date', { ascending: true })

    if (error) {
      alert('Error fetching reports: ' + error.message)
      return
    }

    if (!reports || reports.length === 0) {
      alert('No reports found in database')
      return
    }

    const parseKP = (kpStr) => {
      if (!kpStr) return null
      const str = String(kpStr).trim()
      if (str.includes('+')) {
        const [km, m] = str.split('+')
        return (parseFloat(km) || 0) * 1000 + (parseFloat(m) || 0)
      }
      const num = parseFloat(str)
      if (isNaN(num)) return null
      return num < 100 ? num * 1000 : num
    }

    const formatKP = (metres) => {
      if (metres === null || metres === undefined) return ''
      const km = Math.floor(metres / 1000)
      const m = Math.round(metres % 1000)
      return `${km}+${m.toString().padStart(3, '0')}`
    }

    const phases = [
      'Clearing', 'Access', 'Topsoil', 'Grading', 'Stringing', 'Bending',
      'Welding - Mainline', 'Welding - Tie-in', 'Coating', 'Lowering-in',
      'Backfill', 'Hydro Test', 'Tie-ins', 'Cleanup - Machine', 'Cleanup - Final',
      'HDD', 'HD Bores', 'Other'
    ]

    const headers = ['Date', 'Spread', 'Inspector']
    phases.forEach(phase => {
      headers.push(`${phase} From`, `${phase} To`, `${phase} M`)
    })
    headers.push('Total Metres', 'Labour Hours', 'Equipment Hours', 'Time Lost')

    const dataRows = []
    let grandTotalMetres = 0
    let grandTotalLabour = 0
    let grandTotalEquipment = 0
    let grandTotalTimeLost = 0

    const phaseTotals = {}
    phases.forEach(p => { phaseTotals[p] = { metres: 0, minKP: null, maxKP: null } })

    reports.forEach(report => {
      const row = [report.date || '', report.spread || '', report.inspector_name || '']
      let dayTotalMetres = 0
      let dayLabourHours = 0
      let dayEquipmentHours = 0
      let dayTimeLost = 0

      const blocks = report.activity_blocks || []
      const activityMap = {}
      
      blocks.forEach(block => {
        const actType = block.activityType || 'Other'
        const startM = parseKP(block.startKP)
        const endM = parseKP(block.endKP)
        const metres = (startM !== null && endM !== null) ? Math.abs(endM - startM) : 0

        if (!activityMap[actType]) {
          activityMap[actType] = { startKP: block.startKP, endKP: block.endKP, metres: 0 }
        }
        activityMap[actType].metres += metres

        if (phaseTotals[actType]) {
          phaseTotals[actType].metres += metres
          if (startM !== null && (phaseTotals[actType].minKP === null || startM < phaseTotals[actType].minKP)) {
            phaseTotals[actType].minKP = startM
          }
          if (endM !== null && (phaseTotals[actType].maxKP === null || endM > phaseTotals[actType].maxKP)) {
            phaseTotals[actType].maxKP = endM
          }
        }

        if (block.labourEntries) {
          block.labourEntries.forEach(entry => {
            dayLabourHours += (entry.hours || 0) * (entry.count || 1)
          })
        }
        if (block.equipmentEntries) {
          block.equipmentEntries.forEach(entry => {
            dayEquipmentHours += (entry.hours || 0) * (entry.count || 1)
          })
        }
        dayTimeLost += parseFloat(block.timeLostHours) || 0
      })

      phases.forEach(phase => {
        const data = activityMap[phase]
        if (data) {
          row.push(data.startKP || '', data.endKP || '', data.metres || 0)
          dayTotalMetres += data.metres || 0
        } else {
          row.push('', '', '')
        }
      })

      row.push(dayTotalMetres, dayLabourHours.toFixed(1), dayEquipmentHours.toFixed(1), dayTimeLost.toFixed(1))
      grandTotalMetres += dayTotalMetres
      grandTotalLabour += dayLabourHours
      grandTotalEquipment += dayEquipmentHours
      grandTotalTimeLost += dayTimeLost
      dataRows.push(row)
    })

    const wsData = []
    wsData.push([`${PROJECT_NAME} - MASTER PRODUCTION SPREADSHEET`])
    wsData.push([`Generated: ${new Date().toLocaleString()}`])
    wsData.push([`Total Reports: ${reports.length}`])
    wsData.push([''])
    wsData.push(['=== PRODUCTION SUMMARY ==='])
    wsData.push(['Phase', 'From KP', 'To KP', 'Total Metres'])
    
    phases.forEach(phase => {
      const data = phaseTotals[phase]
      if (data.metres > 0) {
        wsData.push([phase, formatKP(data.minKP), formatKP(data.maxKP), data.metres])
      }
    })
    
    wsData.push(['GRAND TOTAL', '', '', grandTotalMetres])
    wsData.push([''])
    wsData.push(['Total Labour Hours:', grandTotalLabour.toFixed(1)])
    wsData.push(['Total Equipment Hours:', grandTotalEquipment.toFixed(1)])
    wsData.push(['Total Time Lost:', grandTotalTimeLost.toFixed(1)])
    wsData.push([''])
    wsData.push(['=== DAILY PRODUCTION DETAIL ==='])
    wsData.push(headers)
    dataRows.forEach(row => wsData.push(row))

    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const colWidths = [{ wch: 12 }, { wch: 10 }, { wch: 15 }]
    phases.forEach(() => { colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 8 }) })
    colWidths.push({ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 })
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Production')

    const summaryData = [['PHASE PRODUCTION SUMMARY'], [''], ['Phase', 'Start KP', 'End KP', 'Total Metres', 'Reports']]
    phases.forEach(phase => {
      const data = phaseTotals[phase]
      if (data.metres > 0) {
        const reportCount = reports.filter(r => (r.activity_blocks || []).some(b => b.activityType === phase)).length
        summaryData.push([phase, formatKP(data.minKP), formatKP(data.maxKP), data.metres, reportCount])
      }
    })
    summaryData.push([''])
    summaryData.push(['TOTALS', '', '', grandTotalMetres, reports.length])

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
    summaryWs['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    const today = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `${PROJECT_SHORT}_Master_Production_${today}.xlsx`)
  }

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ backgroundColor: '#003366', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>Pipe-Up Admin Portal</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>{isSuperAdmin ? 'Super Admin' : 'Admin'} - {userProfile?.organizations?.name || 'All Organizations'}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Executive Dashboard</button>
          <button onClick={() => navigate('/evm')} style={{ padding: '10px 20px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>EVM Dashboard</button>
          <button onClick={() => navigate('/reconciliation')} style={{ padding: '10px 20px', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reconciliation</button>
          <button onClick={() => navigate('/changes')} style={{ padding: '10px 20px', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Change Orders</button>
          <button onClick={() => navigate('/contractor-lems')} style={{ padding: '10px 20px', backgroundColor: '#2c3e50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Contractor LEMs</button>
          <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #ddd', padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {['overview', 'organizations', 'projects', 'users', 'reports'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '15px 25px', border: 'none', backgroundColor: activeTab === tab ? '#003366' : 'transparent', color: activeTab === tab ? 'white' : '#333', cursor: 'pointer', fontSize: '14px', fontWeight: activeTab === tab ? 'bold' : 'normal', textTransform: 'capitalize' }}>{tab}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        
        {activeTab === 'overview' && (
          <div>
            <h2>Dashboard Overview</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '20px' }}>
              <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Organizations</h3>
                <p style={{ margin: 0, fontSize: '36px', fontWeight: 'bold', color: '#003366' }}>{organizations.length}</p>
              </div>
              <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Projects</h3>
                <p style={{ margin: 0, fontSize: '36px', fontWeight: 'bold', color: '#28a745' }}>{projects.length}</p>
              </div>
              <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Users</h3>
                <p style={{ margin: 0, fontSize: '36px', fontWeight: 'bold', color: '#17a2b8' }}>{users.length}</p>
              </div>
              <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Your Role</h3>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#6f42c1', textTransform: 'capitalize' }}>{userProfile?.role?.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'organizations' && isSuperAdmin && (
          <div>
            <h2>Organizations</h2>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <h3 style={{ margin: '0 0 15px 0' }}>Add New Organization</h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input type="text" placeholder="Organization Name" value={newOrg.name} onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', flex: 1, minWidth: '200px' }} />
                <input type="text" placeholder="Slug (e.g., fortis-bc)" value={newOrg.slug} onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', flex: 1, minWidth: '200px' }} />
                <button onClick={createOrganization} style={{ padding: '10px 25px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Add Organization</button>
              </div>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Name</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Slug</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map(org => (
                    <tr key={org.id}>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{org.name}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{org.slug}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{new Date(org.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div>
            <h2>Projects</h2>
            {isSuperAdmin && (
              <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 15px 0' }}>Add New Project</h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <select value={newProject.organizationId} onChange={(e) => setNewProject({ ...newProject, organizationId: e.target.value })} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', minWidth: '200px' }}>
                    <option value="">Select Organization</option>
                    {organizations.map(org => (<option key={org.id} value={org.id}>{org.name}</option>))}
                  </select>
                  <input type="text" placeholder="Project Name" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', flex: 1, minWidth: '200px' }} />
                  <input type="text" placeholder="Short Code (e.g., EGP)" value={newProject.shortCode} onChange={(e) => setNewProject({ ...newProject, shortCode: e.target.value })} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', width: '150px' }} />
                  <button onClick={createProject} style={{ padding: '10px 25px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Add Project</button>
                </div>
              </div>
            )}
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Project Name</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Code</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Organization</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(project => (
                    <tr key={project.id}>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{project.name}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{project.short_code}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{project.organizations?.name || 'N/A'}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{new Date(project.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <h2>Users</h2>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Name</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Email</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Role</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Organization</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{user.full_name || '-'}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{user.email}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', textTransform: 'capitalize' }}>{user.role?.replace('_', ' ')}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{user.organizations?.name || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div>
            <h2>Inspector Reports</h2>
            <p style={{ color: '#666' }}>View all submitted inspector reports across organizations.</p>
            <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
              <button onClick={() => navigate('/reports')} style={{ padding: '15px 30px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>View All Reports</button>
              <button onClick={() => exportMasterProduction()} style={{ padding: '15px 30px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>📋 Master Production Spreadsheet</button>
            </div>
            <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>Master Production exports all saved reports into CLX2 format with daily progress tracking by phase</p>
          </div>
        )}

      </div>
    </div>
  )
}

export default AdminPortal
