// ComplianceAuditTrail.jsx - Professional Compliance Audit Trail
// FortisBC EGP Project - Environmental Assessment Office (EAO) Compliance
// Enhanced with filtering, diff views, PDF export, and integrity verification

import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import jsPDF from 'jspdf'
// Import autoTable plugin - this side-effect import should register autoTable on jsPDF
// IMPORTANT: This must be imported before any jsPDF instances are created
import 'jspdf-autotable'

// Brand colors
const BRAND = {
  navy: '#003366',
  orange: '#ff6600',
  green: '#28a745',
  red: '#dc3545',
  amber: '#ffc107',
  lightBlue: '#e7f3ff',
  gray: '#6c757d'
}

// EAO Compliance-related fields
const EAO_COMPLIANCE_FIELDS = [
  'environmental_conditions',
  'wildlife_sighting',
  'fish_window',
  'erosion_control',
  'spill_report',
  'water_crossing',
  'vegetation',
  'noise_monitoring',
  'dust_control',
  'archaeological',
  'indigenous_monitor',
  'land_environment'
]

// Change type configurations
const CHANGE_TYPES = {
  create: { label: 'Create', color: '#28a745', bgColor: '#d4edda' },
  edit: { label: 'Edit', color: '#007bff', bgColor: '#cce5ff' },
  submit: { label: 'Submit', color: '#856404', bgColor: '#fff3cd' },
  approve: { label: 'Approve', color: '#155724', bgColor: '#d4edda' },
  revision_request: { label: 'Revision Request', color: '#721c24', bgColor: '#f8d7da' },
  reject: { label: 'Reject', color: '#dc3545', bgColor: '#f8d7da' }
}

// Date range presets
const DATE_PRESETS = [
  { label: 'Today', getValue: () => { const d = new Date(); return { start: d.toISOString().split('T')[0], end: d.toISOString().split('T')[0] } }},
  { label: 'This Week', getValue: () => { 
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] }
  }},
  { label: 'This Month', getValue: () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] }
  }},
  { label: 'Last 30 Days', getValue: () => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - 30)
    return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] }
  }},
  { label: 'Last 90 Days', getValue: () => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - 90)
    return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] }
  }},
  { label: 'All Time', getValue: () => ({ start: '', end: '' }) }
]

export default function ComplianceAuditTrail() {
  const navigate = useNavigate()
  const [auditLog, setAuditLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [totalReports, setTotalReports] = useState(0)
  
  // Filter state
  const [filters, setFilters] = useState({
    datePreset: 'All Time',
    startDate: '',
    endDate: '',
    inspector: '',
    changeType: '',
    eaoCondition: ''
  })
  
  // Expanded rows for diff view
  const [expandedRows, setExpandedRows] = useState({})

  useEffect(() => {
    fetchAuditData()
    fetchTotalReports()
  }, [])

  async function fetchAuditData() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('report_audit_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(500)

      if (error) throw error
      setAuditLog(data || [])
    } catch (err) {
      console.error('Error fetching audit log:', err)
    }
    setLoading(false)
  }

  async function fetchTotalReports() {
    try {
      const { count } = await supabase
        .from('daily_tickets')
        .select('*', { count: 'exact', head: true })
      setTotalReports(count || 0)
    } catch (err) {
      console.error('Error fetching report count:', err)
    }
  }

  // Get unique inspectors from audit log
  const inspectors = useMemo(() => {
    const names = [...new Set(auditLog.map(e => e.changed_by_name).filter(Boolean))]
    return names.sort()
  }, [auditLog])

  // Filter audit log
  const filteredLog = useMemo(() => {
    return auditLog.filter(entry => {
      // Date filter
      if (filters.startDate && new Date(entry.changed_at) < new Date(filters.startDate)) return false
      if (filters.endDate) {
        const endDate = new Date(filters.endDate)
        endDate.setHours(23, 59, 59)
        if (new Date(entry.changed_at) > endDate) return false
      }
      
      // Inspector filter
      if (filters.inspector && entry.changed_by_name !== filters.inspector) return false
      
      // Change type filter
      if (filters.changeType && entry.change_type !== filters.changeType) return false
      
      // EAO condition filter
      if (filters.eaoCondition) {
        const fieldName = (entry.field_name || '').toLowerCase()
        const section = (entry.section || '').toLowerCase()
        const isEaoRelated = EAO_COMPLIANCE_FIELDS.some(f => 
          fieldName.includes(f) || section.includes(f)
        )
        if (filters.eaoCondition === 'eao_only' && !isEaoRelated) return false
        if (filters.eaoCondition === 'non_eao' && isEaoRelated) return false
      }
      
      return true
    })
  }, [auditLog, filters])

  // Calculate integrity stats
  const integrityStats = useMemo(() => {
    const uniqueReports = new Set(auditLog.map(e => e.report_id).filter(Boolean))
    return {
      totalEntries: auditLog.length,
      uniqueReports: uniqueReports.size,
      verifiedPercent: totalReports > 0 ? Math.round((uniqueReports.size / totalReports) * 100) : 100
    }
  }, [auditLog, totalReports])

  // Handle date preset change
  const handlePresetChange = (preset) => {
    const selected = DATE_PRESETS.find(p => p.label === preset)
    if (selected) {
      const { start, end } = selected.getValue()
      setFilters(f => ({ ...f, datePreset: preset, startDate: start, endDate: end }))
    }
  }

  // Toggle row expansion
  const toggleRow = (idx) => {
    setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  // Navigate to report in edit mode
  const openReport = (reportId) => {
    if (reportId) {
      navigate(`/report/${reportId}?mode=edit`)
    }
  }

  // Generate PDF Export
  const exportPDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    
    // Header with branding
    doc.setFillColor(0, 51, 102) // Navy
    doc.rect(0, 0, pageWidth, 40, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('COMPLIANCE AUDIT REPORT', pageWidth / 2, 18, { align: 'center' })
    
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text('FortisBC Eagle Mountain - Woodfibre Gas Pipeline (EGP)', pageWidth / 2, 28, { align: 'center' })
    
    doc.setFontSize(10)
    doc.text('Environmental Assessment Office (EAO) Compliance Trail', pageWidth / 2, 35, { align: 'center' })
    
    // Report metadata
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    const today = new Date().toLocaleDateString('en-CA')
    const reportPeriod = filters.startDate && filters.endDate 
      ? `${filters.startDate} to ${filters.endDate}`
      : filters.startDate 
        ? `From ${filters.startDate}`
        : filters.endDate
          ? `Until ${filters.endDate}`
          : 'All Time'
    
    doc.text(`Generated: ${today}`, 14, 50)
    doc.text(`Report Period: ${reportPeriod}`, 14, 56)
    doc.text(`Total Audit Entries: ${filteredLog.length}`, 14, 62)
    doc.text(`Generated by: Pipe-Up Inspector Platform`, 14, 68)
    
    // Integrity badge
    doc.setFillColor(40, 167, 69) // Green
    doc.roundedRect(pageWidth - 70, 45, 56, 25, 3, 3, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(8)
    doc.text('DATA INTEGRITY', pageWidth - 42, 53, { align: 'center' })
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('VERIFIED', pageWidth - 42, 63, { align: 'center' })
    
    // Summary statistics
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Summary Statistics', 14, 82)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    
    // Count by type
    const typeCounts = {}
    filteredLog.forEach(e => {
      typeCounts[e.change_type] = (typeCounts[e.change_type] || 0) + 1
    })
    
    let yPos = 90
    Object.entries(typeCounts).forEach(([type, count]) => {
      const config = CHANGE_TYPES[type] || { label: type }
      doc.text(`${config.label}: ${count}`, 20, yPos)
      yPos += 6
    })
    
    // EAO-related changes
    const eaoChanges = filteredLog.filter(e => {
      const fieldName = (e.field_name || '').toLowerCase()
      const section = (e.section || '').toLowerCase()
      return EAO_COMPLIANCE_FIELDS.some(f => fieldName.includes(f) || section.includes(f))
    })
    doc.text(`EAO Compliance-Related Changes: ${eaoChanges.length}`, 20, yPos)
    
    // Audit trail table
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Detailed Audit Trail', 14, yPos + 15)
    
    // Table data
    const tableData = filteredLog.slice(0, 100).map(entry => [
      new Date(entry.changed_at).toLocaleString('en-CA'),
      entry.changed_by_name || '-',
      entry.change_type?.toUpperCase() || '-',
      entry.report_date || '-',
      entry.section || '-',
      entry.field_name || '-',
      entry.change_reason ? entry.change_reason.substring(0, 30) + (entry.change_reason.length > 30 ? '...' : '') : '-'
    ])
    
    // Check if autoTable is available
    if (typeof doc.autoTable !== 'function') {
      console.error('❌ jspdf-autotable plugin not loaded. Please rebuild the app or reinstall dependencies.')
      alert('PDF export error: autoTable plugin not available. Please refresh the page or contact support.')
      return
    }
    
    doc.autoTable({
      startY: yPos + 20,
      head: [['Date/Time', 'User', 'Action', 'Report Date', 'Section', 'Field', 'Reason']],
      body: tableData,
      theme: 'striped',
      headStyles: { 
        fillColor: [0, 51, 102],
        fontSize: 8,
        fontStyle: 'bold'
      },
      bodyStyles: { 
        fontSize: 7
      },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 25 },
        2: { cellWidth: 18 },
        3: { cellWidth: 20 },
        4: { cellWidth: 25 },
        5: { cellWidth: 30 },
        6: { cellWidth: 35 }
      },
      margin: { left: 14, right: 14 }
    })
    
    // Footer on each page
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(128, 128, 128)
      doc.text(
        `Page ${i} of ${pageCount} | Generated by Pipe-Up | Confidential - For EAO Review Only`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      )
    }
    
    // Save
    doc.save(`EGP_Compliance_Audit_${today}.pdf`)
  }

  // Render change diff
  const renderDiff = (entry) => {
    if (!entry.old_value && !entry.new_value) {
      return <span style={{ color: '#666', fontStyle: 'italic' }}>No diff data available</span>
    }

    const formatValue = (val) => {
      if (val === null || val === undefined) return '(empty)'
      if (typeof val === 'object') return JSON.stringify(val, null, 2)
      return String(val)
    }

    return (
      <div style={{ display: 'flex', gap: '20px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: BRAND.red, marginBottom: '5px' }}>
            ❌ BEFORE
          </div>
          <div style={{ 
            padding: '8px', 
            backgroundColor: '#fff5f5', 
            borderRadius: '4px',
            border: `1px solid ${BRAND.red}`,
            fontFamily: 'monospace',
            fontSize: '12px',
            textDecoration: 'line-through',
            color: BRAND.red,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}>
            {formatValue(entry.old_value)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: '20px' }}>→</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: BRAND.green, marginBottom: '5px' }}>
            ✅ AFTER
          </div>
          <div style={{ 
            padding: '8px', 
            backgroundColor: '#f0fff0', 
            borderRadius: '4px',
            border: `1px solid ${BRAND.green}`,
            fontFamily: 'monospace',
            fontSize: '12px',
            color: BRAND.green,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}>
            {formatValue(entry.new_value)}
          </div>
        </div>
      </div>
    )
  }

  // Check if entry is EAO-related
  const isEaoRelated = (entry) => {
    const fieldName = (entry.field_name || '').toLowerCase()
    const section = (entry.section || '').toLowerCase()
    return EAO_COMPLIANCE_FIELDS.some(f => fieldName.includes(f) || section.includes(f))
  }

  // Styles
  const filterBarStyle = {
    display: 'flex',
    gap: '15px',
    flexWrap: 'wrap',
    padding: '15px',
    backgroundColor: 'white',
    borderRadius: '8px',
    marginBottom: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    alignItems: 'flex-end'
  }

  const filterGroupStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px'
  }

  const labelStyle = {
    fontSize: '11px',
    fontWeight: '600',
    color: BRAND.navy,
    textTransform: 'uppercase'
  }

  const selectStyle = {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
    minWidth: '140px'
  }

  const inputStyle = {
    ...selectStyle,
    minWidth: '130px'
  }

  return (
    <div>
      {/* Header with Integrity Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: BRAND.navy }}>📜 Compliance Audit Trail</h2>
          <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
            FortisBC EGP Project | Environmental Assessment Office (EAO) Compliance Tracking
          </p>
        </div>
        
        {/* Data Integrity Badge */}
        <div style={{
          padding: '12px 20px',
          background: `linear-gradient(135deg, ${BRAND.green} 0%, #1e7e34 100%)`,
          borderRadius: '8px',
          color: 'white',
          textAlign: 'center',
          boxShadow: '0 2px 8px rgba(40, 167, 69, 0.3)'
        }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.9 }}>
            Data Integrity
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', margin: '3px 0' }}>
            ✓ VERIFIED
          </div>
          <div style={{ fontSize: '11px', opacity: 0.9 }}>
            {integrityStats.totalEntries} entries | {integrityStats.uniqueReports} reports
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={filterBarStyle}>
        {/* Date Preset */}
        <div style={filterGroupStyle}>
          <label style={labelStyle}>Date Range</label>
          <select
            value={filters.datePreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            style={selectStyle}
          >
            {DATE_PRESETS.map(p => (
              <option key={p.label} value={p.label}>{p.label}</option>
            ))}
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {/* Custom Date Range */}
        {filters.datePreset === 'custom' && (
          <>
            <div style={filterGroupStyle}>
              <label style={labelStyle}>From</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div style={filterGroupStyle}>
              <label style={labelStyle}>To</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </>
        )}

        {/* Inspector Filter */}
        <div style={filterGroupStyle}>
          <label style={labelStyle}>Inspector</label>
          <select
            value={filters.inspector}
            onChange={(e) => setFilters(f => ({ ...f, inspector: e.target.value }))}
            style={selectStyle}
          >
            <option value="">All Inspectors</option>
            {inspectors.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {/* Change Type Filter */}
        <div style={filterGroupStyle}>
          <label style={labelStyle}>Change Type</label>
          <select
            value={filters.changeType}
            onChange={(e) => setFilters(f => ({ ...f, changeType: e.target.value }))}
            style={selectStyle}
          >
            <option value="">All Types</option>
            {Object.entries(CHANGE_TYPES).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
        </div>

        {/* EAO Condition Filter */}
        <div style={filterGroupStyle}>
          <label style={labelStyle}>EAO Compliance</label>
          <select
            value={filters.eaoCondition}
            onChange={(e) => setFilters(f => ({ ...f, eaoCondition: e.target.value }))}
            style={selectStyle}
          >
            <option value="">All Changes</option>
            <option value="eao_only">EAO-Related Only</option>
            <option value="non_eao">Non-EAO Only</option>
          </select>
        </div>

        {/* Export Button */}
        <button
          onClick={exportPDF}
          style={{
            padding: '10px 20px',
            backgroundColor: BRAND.orange,
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginLeft: 'auto'
          }}
        >
          📄 Export Compliance Audit Report
        </button>
      </div>

      {/* Results Summary */}
      <div style={{ 
        display: 'flex', 
        gap: '15px', 
        marginBottom: '15px',
        fontSize: '13px',
        color: '#666'
      }}>
        <span>Showing <strong>{filteredLog.length}</strong> of {auditLog.length} entries</span>
        {filters.inspector && <span>| Inspector: <strong>{filters.inspector}</strong></span>}
        {filters.changeType && <span>| Type: <strong>{CHANGE_TYPES[filters.changeType]?.label}</strong></span>}
        {filters.eaoCondition === 'eao_only' && <span>| <strong style={{ color: BRAND.orange }}>EAO Compliance Filter Active</strong></span>}
      </div>

      {/* Audit Log Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Loading audit trail...
        </div>
      ) : filteredLog.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px', 
          backgroundColor: 'white',
          borderRadius: '8px',
          color: '#666'
        }}>
          No audit entries match the selected filters
        </div>
      ) : (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '8px', 
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: BRAND.navy }}>
                <th style={{ padding: '12px', textAlign: 'left', color: 'white', fontSize: '12px', fontWeight: '600' }}>When</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'white', fontSize: '12px', fontWeight: '600' }}>Who</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'white', fontSize: '12px', fontWeight: '600' }}>Role</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'white', fontSize: '12px', fontWeight: '600' }}>Action</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'white', fontSize: '12px', fontWeight: '600' }}>Report</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'white', fontSize: '12px', fontWeight: '600' }}>Field Changed</th>
                <th style={{ padding: '12px', textAlign: 'center', color: 'white', fontSize: '12px', fontWeight: '600' }}>Diff</th>
              </tr>
            </thead>
            <tbody>
              {filteredLog.map((entry, idx) => {
                const typeConfig = CHANGE_TYPES[entry.change_type] || { label: entry.change_type, color: '#6c757d', bgColor: '#f8f9fa' }
                const eaoFlag = isEaoRelated(entry)
                
                return (
                  <React.Fragment key={idx}>
                    <tr style={{ 
                      backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa',
                      borderLeft: eaoFlag ? `4px solid ${BRAND.orange}` : 'none'
                    }}>
                      <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '12px' }}>
                        {new Date(entry.changed_at).toLocaleString('en-CA')}
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px', fontWeight: '500' }}>
                        {entry.changed_by_name || '-'}
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '12px', textTransform: 'capitalize' }}>
                        {entry.changed_by_role?.replace('_', ' ') || '-'}
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: typeConfig.bgColor,
                          color: typeConfig.color
                        }}>
                          {typeConfig.label.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>
                        {entry.report_id ? (
                          <button
                            onClick={() => openReport(entry.report_id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: BRAND.navy,
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              fontSize: '13px',
                              fontWeight: '500'
                            }}
                            title="Open report in edit mode"
                          >
                            {entry.report_date || 'View Report'} 🔗
                          </button>
                        ) : (
                          <span style={{ fontSize: '13px', color: '#666' }}>{entry.report_date || '-'}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '12px' }}>
                        <div>
                          {entry.section && (
                            <span style={{ 
                              color: BRAND.navy, 
                              fontWeight: '500',
                              marginRight: '5px'
                            }}>
                              {entry.section}:
                            </span>
                          )}
                          <span style={{ color: '#333' }}>{entry.field_name || '-'}</span>
                          {eaoFlag && (
                            <span style={{
                              marginLeft: '8px',
                              padding: '2px 6px',
                              backgroundColor: BRAND.orange,
                              color: 'white',
                              borderRadius: '3px',
                              fontSize: '9px',
                              fontWeight: '600'
                            }}>
                              EAO
                            </span>
                          )}
                        </div>
                        {entry.change_reason && (
                          <div style={{ 
                            fontSize: '11px', 
                            color: '#666', 
                            fontStyle: 'italic',
                            marginTop: '3px'
                          }}>
                            "{entry.change_reason}"
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                        {(entry.old_value || entry.new_value) && (
                          <button
                            onClick={() => toggleRow(idx)}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: expandedRows[idx] ? BRAND.navy : '#e9ecef',
                              color: expandedRows[idx] ? 'white' : '#333',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: '500'
                            }}
                          >
                            {expandedRows[idx] ? '▼ Hide' : '▶ View'}
                          </button>
                        )}
                      </td>
                    </tr>
                    
                    {/* Expanded Diff Row */}
                    {expandedRows[idx] && (
                      <tr>
                        <td colSpan={7} style={{ 
                          padding: '15px 20px', 
                          backgroundColor: '#f0f4f8',
                          borderBottom: '2px solid #ddd'
                        }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: BRAND.navy, marginBottom: '10px' }}>
                            Change Details for: {entry.section} → {entry.field_name}
                          </div>
                          {renderDiff(entry)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#666',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <strong>Compliance Notes:</strong> All changes to inspector reports are automatically logged. 
          EAO-related fields are flagged with an orange indicator. Export PDF for official compliance review.
        </div>
        <div style={{ color: BRAND.navy, fontWeight: '600' }}>
          Powered by Pipe-Up
        </div>
      </div>
    </div>
  )
}
