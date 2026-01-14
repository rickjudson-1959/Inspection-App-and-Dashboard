// AuditDashboard.jsx - Enhanced system-wide audit trail viewer
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './AuthContext.jsx'

export default function AuditDashboard() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  
  const [auditEntries, setAuditEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    userId: '',
    reportId: '',
    section: '',
    changeType: '',
    entityType: '',
    criticalOnly: false,
    regulatoryCategory: ''
  })
  const [users, setUsers] = useState([])
  const [sections, setSections] = useState([])
  const [entityTypes, setEntityTypes] = useState([])
  const [regulatoryCategories, setRegulatoryCategories] = useState([])
  const [stats, setStats] = useState({ total: 0, creates: 0, edits: 0, deletes: 0, critical: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const pageSize = 50

  useEffect(() => { loadInitialData() }, [])
  useEffect(() => { loadAuditEntries() }, [filters, currentPage])

  async function loadInitialData() {
    const { data: userData } = await supabase.from('report_audit_log').select('changed_by_email').not('changed_by_email', 'is', null)
    if (userData) setUsers([...new Set(userData.map(u => u.changed_by_email))].filter(Boolean))
    const { data: sectionData } = await supabase.from('report_audit_log').select('section').not('section', 'is', null)
    if (sectionData) setSections([...new Set(sectionData.map(s => s.section))].filter(Boolean).sort())
    const { data: entityData } = await supabase.from('report_audit_log').select('entity_type').not('entity_type', 'is', null)
    if (entityData) setEntityTypes([...new Set(entityData.map(e => e.entity_type))].filter(Boolean).sort())
    const { data: regData } = await supabase.from('report_audit_log').select('regulatory_category').not('regulatory_category', 'is', null)
    if (regData) setRegulatoryCategories([...new Set(regData.map(r => r.regulatory_category))].filter(Boolean).sort())
  }

  async function loadAuditEntries() {
    setLoading(true)
    let query = supabase.from('report_audit_log').select('*', { count: 'exact' }).order('changed_at', { ascending: false })
    if (filters.dateFrom) query = query.gte('changed_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('changed_at', filters.dateTo + 'T23:59:59')
    if (filters.userId) query = query.eq('changed_by_email', filters.userId)
    if (filters.reportId) query = query.eq('report_id', filters.reportId)
    if (filters.section) query = query.eq('section', filters.section)
    if (filters.changeType) query = query.eq('change_type', filters.changeType)
    if (filters.entityType) query = query.eq('entity_type', filters.entityType)
    if (filters.criticalOnly) query = query.eq('is_critical', true)
    if (filters.regulatoryCategory) query = query.eq('regulatory_category', filters.regulatoryCategory)
    const from = (currentPage - 1) * pageSize
    query = query.range(from, from + pageSize - 1)
    const { data, error, count } = await query
    if (!error) {
      setAuditEntries(data || [])
      setTotalCount(count || 0)
      setStats({ total: count || 0, creates: data?.filter(e => e.change_type === 'create').length || 0, edits: data?.filter(e => e.change_type === 'edit').length || 0, deletes: data?.filter(e => e.change_type === 'delete').length || 0, critical: data?.filter(e => e.is_critical).length || 0 })
    }
    setLoading(false)
  }

  function handleFilterChange(field, value) { setFilters(prev => ({ ...prev, [field]: value })); setCurrentPage(1) }
  function clearFilters() { setFilters({ dateFrom: '', dateTo: '', userId: '', reportId: '', section: '', changeType: '', entityType: '', criticalOnly: false, regulatoryCategory: '' }); setCurrentPage(1) }

  async function exportToCSV() {
    setExporting(true)
    try {
      // Fetch ALL matching records (not just current page)
      let allData = []
      let page = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        let query = supabase.from('report_audit_log').select('*').order('changed_at', { ascending: false })
        if (filters.dateFrom) query = query.gte('changed_at', filters.dateFrom + 'T00:00:00')
        if (filters.dateTo) query = query.lte('changed_at', filters.dateTo + 'T23:59:59')
        if (filters.userId) query = query.eq('changed_by_email', filters.userId)
        if (filters.reportId) query = query.eq('report_id', filters.reportId)
        if (filters.section) query = query.eq('section', filters.section)
        if (filters.changeType) query = query.eq('change_type', filters.changeType)
        if (filters.entityType) query = query.eq('entity_type', filters.entityType)
        if (filters.criticalOnly) query = query.eq('is_critical', true)
        if (filters.regulatoryCategory) query = query.eq('regulatory_category', filters.regulatoryCategory)
        
        query = query.range(page * batchSize, (page + 1) * batchSize - 1)
        const { data, error } = await query
        
        if (error) throw error
        if (data && data.length > 0) {
          allData = [...allData, ...data]
          page++
          if (data.length < batchSize) hasMore = false
        } else {
          hasMore = false
        }
      }

      if (!allData.length) {
        alert('No data to export')
        setExporting(false)
        return
      }

      const headers = [
        'Timestamp',
        'Report ID',
        'Report Date',
        'User Name',
        'User Email',
        'Role',
        'Change Type',
        'Action Type',
        'Entity Type',
        'Section',
        'Field Name',
        'Old Value',
        'New Value',
        'KP Start',
        'KP End',
        'Joint Number',
        'Weld Number',
        'Heat Number',
        'MTR Number',
        'Critical',
        'Regulatory Category',
        'Change Reason',
        'Latitude',
        'Longitude'
      ]

      const rows = allData.map(e => [
        e.changed_at ? new Date(e.changed_at).toISOString() : '',
        e.report_id || '',
        e.report_date || '',
        e.changed_by_name || '',
        e.changed_by_email || '',
        e.changed_by_role || '',
        e.change_type || '',
        e.action_type || '',
        e.entity_type || '',
        e.section || '',
        e.field_name || '',
        e.old_value || '',
        e.new_value || '',
        e.kp_start || '',
        e.kp_end || '',
        e.joint_number || '',
        e.weld_number || '',
        e.heat_number || '',
        e.mtr_number || '',
        e.is_critical ? 'YES' : 'NO',
        e.regulatory_category || '',
        e.change_reason || '',
        e.latitude || '',
        e.longitude || ''
      ])

      // Create CSV with proper escaping
      const escapeCsvField = (field) => {
        const str = String(field)
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      const csv = [
        headers.join(','),
        ...rows.map(r => r.map(escapeCsvField).join(','))
      ].join('\n')

      // Add BOM for Excel compatibility with special characters
      const BOM = '\uFEFF'
      const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      
      // Generate filename with filter context
      let filename = 'audit_log'
      if (filters.entityType) filename += `_${filters.entityType}`
      if (filters.dateFrom || filters.dateTo) filename += `_${filters.dateFrom || 'start'}_to_${filters.dateTo || 'now'}`
      filename += `_${new Date().toISOString().split('T')[0]}.csv`
      
      link.download = filename
      link.click()
      URL.revokeObjectURL(link.href)

      alert(`Exported ${allData.length} records to CSV`)
    } catch (err) {
      console.error('Export error:', err)
      alert('Export failed: ' + err.message)
    }
    setExporting(false)
  }

  const totalPages = Math.ceil(totalCount / pageSize)
  
  const getTypeStyle = t => ({
    create: { bg: '#d4edda', text: '#155724', label: '+ CREATE' },
    edit: { bg: '#fff3cd', text: '#856404', label: '✏️ EDIT' },
    delete: { bg: '#f8d7da', text: '#721c24', label: '🗑️ DELETE' }
  }[t] || { bg: '#e9ecef', text: '#495057', label: t || '?' })

  // Updated entity labels to match actual entity_type values from Log components
  const getEntityLabel = t => ({
    // New Log component entity types (as stored in DB)
    'EquipmentCleaningLog': '🧹 Equipment Cleaning',
    'WelderTestingLog': '🔥 Welder Testing',
    'HydrovacLog': '🚿 Hydrovac',
    'TimberDeckLog': '🪵 Timber Deck/TSP',
    'PilingLog': '🪵 Piling',
    'HDDLog': '🔩 HDD',
    'DitchLog': '🚜 Ditching',
    'TieInCompletionLog': '🔗 Tie-In Completion',
    'GradingLog': '🛤️ Grading',
    'HydrotestLog': '💧 Hydrotest',
    // Legacy entity types (lowercase)
    'bending': '🔧 Bending',
    'coating': '🎨 Coating',
    'clearing': '🌲 Clearing',
    'stringing': '📏 Stringing',
    'welding': '⚡ Welding',
    'ditching': '🚜 Ditching',
    'grading': '🛤️ Grading',
    'hdd': '🔩 HDD',
    'hydrotest': '💧 Hydrotest',
    'hydrovac': '🚿 Hydrovac',
    'piling': '🪵 Piling',
    'tiein': '🔗 Tie-In',
    'equipment_cleaning': '🧹 Cleaning',
    // Previously audited components
    'BendingLog': '🔧 Bending',
    'CoatingLog': '🎨 Coating',
    'ClearingLog': '🌲 Clearing',
    'StringingLog': '📏 Stringing',
    'MainlineWeldData': '⚡ Mainline Welding'
  }[t] || t || '-')

  const getRegBadge = c => ({
    integrity: { bg: '#dc3545', label: '🔴 INTEGRITY' },
    environmental: { bg: '#28a745', label: '🌿 ENV' },
    soil_handling: { bg: '#6c757d', label: '🌍 SOIL' },
    indigenous_social: { bg: '#6f42c1', label: '👥 INDIG' },
    archaeological: { bg: '#fd7e14', label: '🏛️ ARCH' },
    general: { bg: '#17a2b8', label: 'ℹ️ GEN' }
  }[c])

  const inp = { padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', width: '100%' }
  const btn = { padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }

  return (
    <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '20px', borderRadius: '8px 8px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>📋 Audit Dashboard</h1>
          <p style={{ margin: '8px 0 0', opacity: 0.8, fontSize: '14px' }}>System-wide change tracking • All Log components audited</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', opacity: 0.8 }}>{userProfile?.email}</span>
          <button onClick={() => navigate(-1)} style={{ ...btn, backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}>← Back</button>
          <button onClick={signOut} style={{ ...btn, backgroundColor: '#dc3545', color: 'white' }}>Logout</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', marginBottom: '20px' }}>
        {[
          { l: 'Total', v: stats.total, bg: '#e3f2fd', c: '#1565c0' },
          { l: 'Creates', v: stats.creates, bg: '#d4edda', c: '#155724' },
          { l: 'Edits', v: stats.edits, bg: '#fff3cd', c: '#856404' },
          { l: 'Deletes', v: stats.deletes, bg: '#f8d7da', c: '#721c24' },
          { l: '⚠️ Critical', v: stats.critical, bg: '#f5c6cb', c: '#721c24' }
        ].map((s, i) =>
          <div key={i} style={{ backgroundColor: s.bg, padding: '15px', textAlign: 'center', border: '1px solid #dee2e6' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: s.c }}>{s.v}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>{s.l}</div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#1e3a5f' }}>🔍 Filters</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.criticalOnly} onChange={e => handleFilterChange('criticalOnly', e.target.checked)} style={{ width: '16px', height: '16px' }} />
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#dc3545' }}>⚠️ Critical Only</span>
            </label>
            <button onClick={clearFilters} style={{ ...btn, backgroundColor: '#6c757d', color: 'white' }}>Clear</button>
            <button onClick={exportToCSV} disabled={exporting} style={{ ...btn, backgroundColor: exporting ? '#6c757d' : '#28a745', color: 'white', opacity: exporting ? 0.7 : 1 }}>
              {exporting ? '⏳ Exporting...' : '📥 Export CSV'}
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: '12px' }}>
          <div><label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>Date From</label><input type="date" value={filters.dateFrom} onChange={e => handleFilterChange('dateFrom', e.target.value)} style={inp} /></div>
          <div><label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>Date To</label><input type="date" value={filters.dateTo} onChange={e => handleFilterChange('dateTo', e.target.value)} style={inp} /></div>
          <div><label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>User</label><select value={filters.userId} onChange={e => handleFilterChange('userId', e.target.value)} style={inp}><option value="">All</option>{users.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
          <div><label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>Report ID</label><input type="number" value={filters.reportId} onChange={e => handleFilterChange('reportId', e.target.value)} placeholder="ID..." style={inp} /></div>
          <div><label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>Entity</label><select value={filters.entityType} onChange={e => handleFilterChange('entityType', e.target.value)} style={inp}><option value="">All</option>{entityTypes.map(t => <option key={t} value={t}>{getEntityLabel(t)}</option>)}</select></div>
          <div><label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>Section</label><select value={filters.section} onChange={e => handleFilterChange('section', e.target.value)} style={inp}><option value="">All</option>{sections.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>Type</label><select value={filters.changeType} onChange={e => handleFilterChange('changeType', e.target.value)} style={inp}><option value="">All</option><option value="create">Create</option><option value="edit">Edit</option><option value="delete">Delete</option></select></div>
          <div><label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>Regulatory</label><select value={filters.regulatoryCategory} onChange={e => handleFilterChange('regulatoryCategory', e.target.value)} style={inp}><option value="">All</option>{regulatoryCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        </div>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: 'white', border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ backgroundColor: '#e9ecef', padding: '12px 20px', borderBottom: '1px solid #dee2e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold', color: '#495057' }}>{loading ? 'Loading...' : `${totalCount.toLocaleString()} entries`}</span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} style={{ padding: '4px 10px', border: '1px solid #ccc', borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', backgroundColor: 'white' }}>First</button>
              <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} style={{ padding: '4px 10px', border: '1px solid #ccc', borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', backgroundColor: 'white' }}>←</button>
              <span style={{ fontSize: '13px' }}>{currentPage}/{totalPages}</span>
              <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages} style={{ padding: '4px 10px', border: '1px solid #ccc', borderRadius: '4px', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', backgroundColor: 'white' }}>→</button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages} style={{ padding: '4px 10px', border: '1px solid #ccc', borderRadius: '4px', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', backgroundColor: 'white' }}>Last</button>
            </div>
          )}
        </div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading...</div>
        ) : auditEntries.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📭</div>
            <div>No audit entries found</div>
            <div style={{ fontSize: '12px', marginTop: '5px', color: '#888' }}>Entries will appear as users edit reports with audit-enabled Log components</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  {['Time', 'Report', 'User', 'Type', 'Entity', 'Section', 'Field', 'Old', 'New', 'KP', 'Status'].map(h => (
                    <th key={h} style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '2px solid #dee2e6', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((e, i) => {
                  const ts = getTypeStyle(e.change_type)
                  const rb = getRegBadge(e.regulatory_category)
                  return (
                    <tr key={e.id || i} onClick={() => setSelectedEntry(e)} style={{ cursor: 'pointer', backgroundColor: e.is_critical ? '#fff5f5' : i % 2 ? '#f8f9fa' : 'white', borderLeft: e.is_critical ? '4px solid #dc3545' : 'none' }}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', fontSize: '12px' }}>
                        <div>{e.changed_at ? new Date(e.changed_at).toLocaleDateString() : '-'}</div>
                        <div style={{ color: '#888', fontSize: '10px' }}>{e.changed_at ? new Date(e.changed_at).toLocaleTimeString() : ''}</div>
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                        {e.report_id ? <a href={`/report?id=${e.report_id}`} onClick={ev => ev.stopPropagation()} style={{ color: '#007bff', fontWeight: 'bold' }}>#{e.report_id}</a> : '-'}
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.changed_by_name || e.changed_by_email?.split('@')[0] || '?'}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                        <span style={{ backgroundColor: ts.bg, color: ts.text, padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>{ts.label}</span>
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', fontSize: '12px' }}>{getEntityLabel(e.entity_type)}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.section || '-'}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.field_name || '-'}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', maxWidth: '100px', fontSize: '11px' }}>
                        {e.old_value ? <span style={{ backgroundColor: '#f8d7da', padding: '1px 4px', borderRadius: '3px' }}>{String(e.old_value).slice(0, 30)}{e.old_value?.length > 30 ? '...' : ''}</span> : '-'}
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', maxWidth: '100px', fontSize: '11px' }}>
                        {e.new_value ? <span style={{ backgroundColor: '#d4edda', padding: '1px 4px', borderRadius: '3px' }}>{String(e.new_value).slice(0, 30)}{e.new_value?.length > 30 ? '...' : ''}</span> : '-'}
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', fontFamily: 'monospace', fontSize: '12px' }}>{e.kp_start || '-'}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                        {e.is_critical && <span style={{ backgroundColor: '#dc3545', color: 'white', padding: '1px 4px', borderRadius: '4px', fontSize: '10px' }}>⚠️</span>}
                        {rb && <span style={{ backgroundColor: rb.bg, color: 'white', padding: '1px 4px', borderRadius: '4px', fontSize: '10px', marginLeft: '2px' }}>{rb.label}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '8px', fontSize: '13px', color: '#1565c0' }}>
        <strong>ℹ️ Info:</strong> All changes are logged with regulatory classification. Critical fields flagged automatically. Click any row for details. CSV export includes all filtered records.
      </div>

      {/* Modal */}
      {selectedEntry && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => setSelectedEntry(null)}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', maxWidth: '700px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={ev => ev.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>📋 Entry Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
              <div><strong>Report ID:</strong> {selectedEntry.report_id}</div>
              <div><strong>Report Date:</strong> {selectedEntry.report_date}</div>
              <div><strong>Changed At:</strong> {selectedEntry.changed_at ? new Date(selectedEntry.changed_at).toLocaleString() : '-'}</div>
              <div><strong>Changed By:</strong> {selectedEntry.changed_by_name || selectedEntry.changed_by_email}</div>
              <div><strong>Role:</strong> {selectedEntry.changed_by_role || '-'}</div>
              <div><strong>Change Type:</strong> {selectedEntry.change_type}</div>
              <div><strong>Action Type:</strong> {selectedEntry.action_type || '-'}</div>
              <div><strong>Entity Type:</strong> {getEntityLabel(selectedEntry.entity_type)}</div>
              <div><strong>Section:</strong> {selectedEntry.section}</div>
              <div><strong>Field:</strong> {selectedEntry.field_name}</div>
              <div><strong>KP:</strong> {selectedEntry.kp_start}{selectedEntry.kp_end ? ` - ${selectedEntry.kp_end}` : ''}</div>
              <div><strong>Critical:</strong> {selectedEntry.is_critical ? '⚠️ YES' : 'No'}</div>
              <div><strong>Regulatory:</strong> {selectedEntry.regulatory_category || '-'}</div>
              {selectedEntry.joint_number && <div><strong>Joint #:</strong> {selectedEntry.joint_number}</div>}
              {selectedEntry.weld_number && <div><strong>Weld #:</strong> {selectedEntry.weld_number}</div>}
              {selectedEntry.heat_number && <div><strong>Heat #:</strong> {selectedEntry.heat_number}</div>}
              {selectedEntry.mtr_number && <div><strong>MTR #:</strong> {selectedEntry.mtr_number}</div>}
            </div>
            <div style={{ marginTop: '15px' }}>
              <div><strong>Old Value:</strong></div>
              <div style={{ backgroundColor: '#f8d7da', padding: '10px', borderRadius: '4px', marginTop: '5px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selectedEntry.old_value || '(empty)'}</div>
            </div>
            <div style={{ marginTop: '15px' }}>
              <div><strong>New Value:</strong></div>
              <div style={{ backgroundColor: '#d4edda', padding: '10px', borderRadius: '4px', marginTop: '5px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selectedEntry.new_value || '(empty)'}</div>
            </div>
            {selectedEntry.change_reason && (
              <div style={{ marginTop: '15px' }}>
                <div><strong>Change Reason:</strong></div>
                <div style={{ backgroundColor: '#fff3cd', padding: '10px', borderRadius: '4px', marginTop: '5px' }}>{selectedEntry.change_reason}</div>
              </div>
            )}
            <button onClick={() => setSelectedEntry(null)} style={{ ...btn, backgroundColor: '#6c757d', color: 'white', marginTop: '20px' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
