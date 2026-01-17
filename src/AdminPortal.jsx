import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'
import ComplianceAuditTrail from './ComplianceAuditTrail.jsx'
import RateImport from './RateImport.jsx'

function AdminPortal() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  const [organizations, setOrganizations] = useState([])
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // Pending Approvals state
  const [pendingReports, setPendingReports] = useState([])
  const [loadingPending, setLoadingPending] = useState(false)

  // Mat Inventory state
  const [matInventory, setMatInventory] = useState([])
  const [matSummary, setMatSummary] = useState({ rigMats: 0, swampMats: 0 })
  const [recentMatMovements, setRecentMatMovements] = useState([])
  const [loadingMats, setLoadingMats] = useState(false)

  // Audit Activity state
  const [auditLog, setAuditLog] = useState([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  // All Reports state
  const [allReports, setAllReports] = useState([])
  const [loadingReports, setLoadingReports] = useState(false)

  const [newOrg, setNewOrg] = useState({ name: '', slug: '' })
  const [newProject, setNewProject] = useState({ name: '', shortCode: '', organizationId: '' })

  // Setup tab state
  const [selectedOrgForSetup, setSelectedOrgForSetup] = useState('')

  const isSuperAdmin = userProfile?.role === 'super_admin'

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (activeTab === 'approvals') fetchPendingApprovals()
    if (activeTab === 'mats') fetchMatData()
    if (activeTab === 'audit') fetchAuditLog()
    if (activeTab === 'reports') fetchAllReports()
  }, [activeTab])

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

  // ==================== PENDING APPROVALS ====================
  async function fetchPendingApprovals() {
    setLoadingPending(true)
    try {
      // Get all submitted reports
      const { data: statusData, error: statusError } = await supabase
        .from('report_status')
        .select('*')
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true })

      if (statusError) throw statusError

      // Get the actual report data for each
      const reportsWithData = []
      for (const status of (statusData || [])) {
        const { data: ticket } = await supabase
          .from('daily_tickets')
          .select('*')
          .eq('id', status.report_id)
          .single()

        if (ticket) {
          reportsWithData.push({
            ...status,
            ticket
          })
        }
      }

      setPendingReports(reportsWithData)
    } catch (err) {
      console.error('Error fetching pending approvals:', err)
    }
    setLoadingPending(false)
  }

  async function approveReport(reportId) {
    if (!confirm('Approve this report?')) return

    try {
      const now = new Date().toISOString()

      await supabase
        .from('report_status')
        .update({
          status: 'approved',
          reviewed_at: now,
          reviewed_by: userProfile?.id,
          reviewed_by_name: userProfile?.full_name || userProfile?.email,
          review_decision: 'approved',
          updated_at: now
        })
        .eq('report_id', reportId)

      // Log to audit
      await supabase.from('report_audit_log').insert({
        report_id: reportId,
        changed_by: userProfile?.id,
        changed_by_name: userProfile?.full_name || userProfile?.email,
        changed_by_role: userProfile?.role,
        change_type: 'approve'
      })

      fetchPendingApprovals()
      alert('Report approved')
    } catch (err) {
      console.error('Error approving:', err)
      alert('Error approving report')
    }
  }

  async function requestRevision(reportId, notes) {
    const revisionNotes = notes || prompt('Enter revision notes (what needs to be changed):')
    if (!revisionNotes) return

    try {
      const now = new Date().toISOString()

      await supabase
        .from('report_status')
        .update({
          status: 'revision_requested',
          reviewed_at: now,
          reviewed_by: userProfile?.id,
          reviewed_by_name: userProfile?.full_name || userProfile?.email,
          review_decision: 'revision_requested',
          revision_notes: revisionNotes,
          updated_at: now
        })
        .eq('report_id', reportId)

      // Log to audit
      await supabase.from('report_audit_log').insert({
        report_id: reportId,
        changed_by: userProfile?.id,
        changed_by_name: userProfile?.full_name || userProfile?.email,
        changed_by_role: userProfile?.role,
        change_type: 'revision_request',
        change_reason: revisionNotes
      })

      fetchPendingApprovals()
      alert('Revision requested')
    } catch (err) {
      console.error('Error requesting revision:', err)
      alert('Error requesting revision')
    }
  }

  // ==================== MAT INVENTORY ====================
  async function fetchMatData() {
    setLoadingMats(true)
    try {
      // Get all transactions to calculate inventory
      const { data: transactions } = await supabase
        .from('mat_transactions')
        .select('*')
        .order('created_at', { ascending: false })

      if (transactions) {
        // Calculate summary
        let rigTotal = 0
        let swampTotal = 0
        const locationMap = {}

        transactions.forEach(tx => {
          const multiplier = (tx.action === 'Deploy' || tx.action === 'Relocate') ? 1 :
                            (tx.action === 'Retrieve' || tx.action === 'Damaged') ? -1 : 0

          if (tx.mat_type === 'Rig Mat') {
            rigTotal += (tx.quantity || 0) * multiplier
          } else if (tx.mat_type === 'Swamp Mat') {
            swampTotal += (tx.quantity || 0) * multiplier
          }

          // Track by location
          if (tx.to_location && multiplier > 0) {
            const key = `${tx.to_location}-${tx.mat_type}`
            if (!locationMap[key]) {
              locationMap[key] = { location: tx.to_location, mat_type: tx.mat_type, count: 0 }
            }
            locationMap[key].count += tx.quantity || 0
          }
          if (tx.from_location && multiplier < 0) {
            const key = `${tx.from_location}-${tx.mat_type}`
            if (locationMap[key]) {
              locationMap[key].count -= tx.quantity || 0
            }
          }
        })

        setMatSummary({ rigMats: rigTotal, swampMats: swampTotal })
        setMatInventory(Object.values(locationMap).filter(item => item.count > 0))
        setRecentMatMovements(transactions.slice(0, 20))
      }
    } catch (err) {
      console.error('Error fetching mat data:', err)
    }
    setLoadingMats(false)
  }

  // ==================== AUDIT LOG ====================
  async function fetchAuditLog() {
    setLoadingAudit(true)
    try {
      const { data } = await supabase
        .from('report_audit_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(100)

      setAuditLog(data || [])
    } catch (err) {
      console.error('Error fetching audit log:', err)
    }
    setLoadingAudit(false)
  }

  // ==================== ALL REPORTS ====================
  async function fetchAllReports() {
    setLoadingReports(true)
    try {
      const { data: reports } = await supabase
        .from('daily_tickets')
        .select('id, date, inspector_name, spread, pipeline, activity_blocks')
        .order('date', { ascending: false })
        .limit(100)

      // Get statuses for all reports
      const { data: statuses } = await supabase
        .from('report_status')
        .select('report_id, status')

      const statusMap = {}
      ;(statuses || []).forEach(s => { statusMap[s.report_id] = s.status })

      const reportsWithStatus = (reports || []).map(r => ({
        ...r,
        status: statusMap[r.id] || 'draft'
      }))

      setAllReports(reportsWithStatus)
    } catch (err) {
      console.error('Error fetching reports:', err)
    }
    setLoadingReports(false)
  }

  // ==================== USER ROLE EDITOR ====================
  async function updateUserRole(userId, newRole) {
    if (!confirm(`Change this user's role to ${newRole}?`)) return

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole, user_role: newRole })
        .eq('id', userId)

      if (error) throw error

      fetchData()
      alert('Role updated successfully')
    } catch (err) {
      console.error('Error updating role:', err)
      alert('Error updating role: ' + err.message)
    }
  }

  async function deleteUser(userId, userEmail) {
    // Prevent deleting yourself
    if (userEmail === userProfile?.email) {
      alert('You cannot delete your own account')
      return
    }
    
    if (!confirm(`Are you sure you want to delete ${userEmail}?\n\nThis action cannot be undone. Any reports they created will be preserved.`)) {
      return
    }
    
    try {
      // Delete from user_profiles first
      const { error: profileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId)
      
      if (profileError) {
        console.error('Error deleting profile:', profileError)
        throw profileError
      }
      
      // Try to delete from auth.users via Edge Function
      try {
        await supabase.functions.invoke('delete-user', {
          body: { user_id: userId }
        })
      } catch (fnErr) {
        console.warn('Edge function not available - user removed from profiles but may need manual deletion from Auth:', fnErr)
      }
      
      fetchData()
      alert(`User ${userEmail} has been deleted successfully`)
      
    } catch (err) {
      console.error('Error deleting user:', err)
      alert('Error deleting user: ' + err.message)
    }
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

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleString()
  }

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>
  }

  const roleOptions = ['inspector', 'chief_inspector', 'cm', 'pm', 'executive', 'admin', 'super_admin']

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ backgroundColor: '#003366', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>Pipe-Up Admin Portal</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>{isSuperAdmin ? 'Super Admin' : 'Admin'} - {userProfile?.organizations?.name || 'All Organizations'}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>CMT Dashboard</button>
          <button onClick={() => navigate('/evm')} style={{ padding: '10px 20px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>EVM Dashboard</button>
          <button onClick={() => navigate('/reconciliation')} style={{ padding: '10px 20px', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reconciliation</button>
          <button onClick={() => navigate('/changes')} style={{ padding: '10px 20px', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Change Orders</button>
          <button onClick={() => navigate('/contractor-lems')} style={{ padding: '10px 20px', backgroundColor: '#2c3e50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Contractor LEMs</button>
          <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #ddd', padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {['overview', 'approvals', 'mats', 'audit', 'setup', 'organizations', 'projects', 'users', 'reports'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '15px 25px', border: 'none', backgroundColor: activeTab === tab ? '#003366' : 'transparent', color: activeTab === tab ? 'white' : '#333', cursor: 'pointer', fontSize: '14px', fontWeight: activeTab === tab ? 'bold' : 'normal', textTransform: 'capitalize', position: 'relative' }}>
              {tab === 'approvals' ? `Approvals ${pendingReports.length > 0 ? `(${pendingReports.length})` : ''}` : tab}
            </button>
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
              <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', cursor: 'pointer', border: pendingReports.length > 0 ? '2px solid #ffc107' : 'none' }} onClick={() => setActiveTab('approvals')}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Pending Approvals</h3>
                <p style={{ margin: 0, fontSize: '36px', fontWeight: 'bold', color: pendingReports.length > 0 ? '#ffc107' : '#28a745' }}>{pendingReports.length}</p>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PENDING APPROVALS TAB ==================== */}
        {activeTab === 'approvals' && (
          <div>
            <h2>📋 Pending Approvals</h2>
            <p style={{ color: '#666' }}>Reports submitted by inspectors awaiting your approval</p>
            
            {loadingPending ? (
              <p>Loading...</p>
            ) : pendingReports.length === 0 ? (
              <div style={{ backgroundColor: '#d4edda', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
                <p style={{ margin: 0, color: '#155724' }}>✓ No reports pending approval</p>
              </div>
            ) : (
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginTop: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Inspector</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Spread</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Activities</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Submitted</th>
                      <th style={{ padding: '15px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingReports.map(report => (
                      <tr key={report.report_id}>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.ticket?.date}</td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.submitted_by_name || report.ticket?.inspector_name}</td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.ticket?.spread || '-'}</td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
                          {(report.ticket?.activity_blocks || []).map(b => b.activityType).filter(Boolean).join(', ') || '-'}
                        </td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontSize: '12px', color: '#666' }}>
                          {formatDate(report.submitted_at)}
                        </td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                          <button onClick={() => navigate(`/inspector?edit=${report.report_id}`)} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' }}>
                            ✏️ Edit
                          </button>
                          <button onClick={() => approveReport(report.report_id)} style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' }}>
                            ✓ Approve
                          </button>
                          <button onClick={() => requestRevision(report.report_id)} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                            ↩ Revision
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================== MAT INVENTORY TAB ==================== */}
        {activeTab === 'mats' && (
          <div>
            <h2>🛤️ Mat Inventory</h2>
            <p style={{ color: '#666' }}>Current mat deployment across the project</p>

            {loadingMats ? (
              <p>Loading...</p>
            ) : (
              <>
                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' }}>
                  <div style={{ backgroundColor: '#e7f3ff', padding: '25px', borderRadius: '8px', border: '1px solid #b8daff', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 10px 0', color: '#004085', fontSize: '14px' }}>RIG MATS DEPLOYED</h3>
                    <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#004085' }}>{matSummary.rigMats}</p>
                  </div>
                  <div style={{ backgroundColor: '#d4edda', padding: '25px', borderRadius: '8px', border: '1px solid #c3e6cb', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 10px 0', color: '#155724', fontSize: '14px' }}>SWAMP MATS DEPLOYED</h3>
                    <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#155724' }}>{matSummary.swampMats}</p>
                  </div>
                  <div style={{ backgroundColor: '#fff3cd', padding: '25px', borderRadius: '8px', border: '1px solid #ffc107', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 10px 0', color: '#856404', fontSize: '14px' }}>TOTAL MATS OUT</h3>
                    <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#856404' }}>{matSummary.rigMats + matSummary.swampMats}</p>
                  </div>
                </div>

                {/* Inventory by Location */}
                <div style={{ marginTop: '30px' }}>
                  <h3>Mats by Location</h3>
                  {matInventory.length === 0 ? (
                    <p style={{ color: '#666' }}>No mats currently deployed</p>
                  ) : (
                    <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Location</th>
                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Mat Type</th>
                            <th style={{ padding: '15px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matInventory.map((item, idx) => (
                            <tr key={idx}>
                              <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{item.location}</td>
                              <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{item.mat_type}</td>
                              <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 'bold' }}>{item.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Recent Movements */}
                <div style={{ marginTop: '30px' }}>
                  <h3>Recent Movements</h3>
                  {recentMatMovements.length === 0 ? (
                    <p style={{ color: '#666' }}>No mat movements recorded</p>
                  ) : (
                    <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>Date</th>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>Action</th>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>Type</th>
                            <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #ddd', fontSize: '13px' }}>Qty</th>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>From</th>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>To</th>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>Crew</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentMatMovements.map((tx, idx) => (
                            <tr key={idx}>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{tx.report_date || formatDate(tx.created_at).split(',')[0]}</td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>
                                <span style={{ 
                                  padding: '3px 8px', 
                                  borderRadius: '3px', 
                                  fontSize: '11px', 
                                  backgroundColor: tx.action === 'Deploy' ? '#28a745' : tx.action === 'Retrieve' ? '#17a2b8' : tx.action === 'Damaged' ? '#dc3545' : '#ffc107',
                                  color: tx.action === 'Retrieve' || tx.action === 'Deploy' || tx.action === 'Damaged' ? 'white' : 'black'
                                }}>
                                  {tx.action}
                                </span>
                              </td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{tx.mat_type}</td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px', textAlign: 'right', fontWeight: 'bold' }}>{tx.quantity}</td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{tx.from_location || '-'}</td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{tx.to_location || '-'}</td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{tx.crew || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ==================== AUDIT LOG TAB ==================== */}
        {activeTab === 'audit' && (
          <ComplianceAuditTrail />
        )}

        {/* ==================== SETUP TAB ==================== */}
        {activeTab === 'setup' && (
          <div>
            <h2>⚙️ Client Setup</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>Add new clients and import rate sheets</p>
            
            {/* Add New Client Section */}
            <div style={{ 
              backgroundColor: 'white', 
              padding: '20px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              border: '2px solid #28a745'
            }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#28a745' }}>➕ Add New Client</h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Client/Organization Name *</label>
                  <input 
                    type="text" 
                    placeholder="e.g., FortisBC Energy Inc." 
                    value={newOrg.name} 
                    onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') })} 
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }} 
                  />
                </div>
                <div style={{ minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Slug (auto-generated)</label>
                  <input 
                    type="text" 
                    placeholder="fortisbc-energy-inc" 
                    value={newOrg.slug} 
                    onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })} 
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f8f9fa' }} 
                  />
                </div>
                <button 
                  onClick={async () => {
                    if (!newOrg.name) {
                      alert('Please enter a client name')
                      return
                    }
                    const { error } = await supabase.from('organizations').insert([{
                      name: newOrg.name,
                      slug: newOrg.slug || newOrg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                    }])
                    if (error) {
                      alert('Error creating client: ' + error.message)
                    } else {
                      alert(`✅ Client "${newOrg.name}" created successfully!`)
                      setNewOrg({ name: '', slug: '' })
                      fetchData()
                    }
                  }} 
                  style={{ padding: '10px 25px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', height: '42px' }}
                >
                  ➕ Add Client
                </button>
              </div>
              <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
                After adding a client, select them below to import their labour and equipment rates.
              </p>
            </div>

            {/* Organization Selector */}
            <div style={{ 
              backgroundColor: 'white', 
              padding: '20px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <label style={{ fontWeight: '600', marginRight: '15px', fontSize: '16px' }}>
                Select Client for Rate Import:
              </label>
              <select 
                value={selectedOrgForSetup}
                onChange={(e) => setSelectedOrgForSetup(e.target.value)}
                style={{ 
                  padding: '10px 15px', 
                  borderRadius: '4px', 
                  border: '1px solid #ddd', 
                  minWidth: '350px',
                  fontSize: '15px'
                }}
              >
                <option value="">-- Select Client --</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
              {!selectedOrgForSetup && (
                <p style={{ color: '#dc3545', marginTop: '10px', fontSize: '14px' }}>
                  ⚠️ Please select a client before importing rates
                </p>
              )}
            </div>

            {/* Rate Import Component */}
            <RateImport 
              organizationId={selectedOrgForSetup}
              organizationName={organizations.find(o => o.id === selectedOrgForSetup)?.name || ''}
              onComplete={(count) => {
                alert(`Successfully imported ${count} rates!`)
              }}
            />
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
            <p style={{ color: '#666', marginBottom: '20px' }}>Manage user accounts. Click the role dropdown to change a user's role, or use the Delete button to remove a user.</p>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Name</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Email</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Role</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Organization</th>
                    <th style={{ padding: '15px', textAlign: 'center', borderBottom: '1px solid #ddd', width: '120px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{user.full_name || '-'}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{user.email}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
                        <select 
                          value={user.role} 
                          onChange={(e) => updateUserRole(user.id, e.target.value)}
                          style={{ 
                            padding: '8px 12px', 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px', 
                            backgroundColor: '#fff',
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                          }}
                        >
                          {roleOptions.map(role => (
                            <option key={role} value={role} style={{ textTransform: 'capitalize' }}>
                              {role.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{user.organizations?.name || 'N/A'}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'center', width: '120px' }}>
                        <button
                          onClick={() => deleteUser(user.id, user.email)}
                          disabled={user.email === userProfile?.email}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: user.email === userProfile?.email ? '#ccc' : '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: user.email === userProfile?.email ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            minWidth: '100px',
                            display: 'inline-block'
                          }}
                          title={user.email === userProfile?.email ? 'Cannot delete yourself' : `Delete ${user.email}`}
                        >
                          🗑️ Delete User
                        </button>
                      </td>
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
            <p style={{ color: '#666' }}>View and edit all inspector reports. Click Edit to modify any report.</p>
            <div style={{ display: 'flex', gap: '20px', marginTop: '20px', marginBottom: '20px' }}>
              <button onClick={() => navigate('/reports')} style={{ padding: '15px 30px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>View Reports Page</button>
              <button onClick={() => exportMasterProduction()} style={{ padding: '15px 30px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>📋 Master Production Spreadsheet</button>
            </div>

            {loadingReports ? (
              <p>Loading reports...</p>
            ) : allReports.length === 0 ? (
              <p style={{ color: '#666' }}>No reports found</p>
            ) : (
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Inspector</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Spread</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Activities</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Status</th>
                      <th style={{ padding: '15px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allReports.map(report => (
                      <tr key={report.id}>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.date}</td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.inspector_name}</td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.spread || '-'}</td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontSize: '13px' }}>
                          {(report.activity_blocks || []).map(b => b.activityType).filter(Boolean).join(', ') || '-'}
                        </td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            backgroundColor:
                              report.status === 'approved' ? '#28a745' :
                              report.status === 'submitted' ? '#ffc107' :
                              report.status === 'revision_requested' ? '#dc3545' : '#6c757d',
                            color: report.status === 'submitted' ? '#000' : '#fff'
                          }}>
                            {report.status?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                          <button 
                            onClick={() => navigate(`/inspector?edit=${report.id}`)} 
                            style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            ✏️ Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default AdminPortal
