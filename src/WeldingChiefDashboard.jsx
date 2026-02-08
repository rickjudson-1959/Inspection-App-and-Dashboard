import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'
import { useOrgQuery } from './utils/queryHelpers.js'
import TenantSwitcher from './components/TenantSwitcher.jsx'
import AIAgentStatusIcon from './components/AIAgentStatusIcon.jsx'
import AgentAuditFindingsPanel from './components/AgentAuditFindingsPanel.jsx'
import { useOrgPath } from './contexts/OrgContext.jsx'
import { getFlagTypeConfig, SEVERITY_COLORS } from './utils/flagTypeConfig.js'

// Import helper functions
import {
  aggregateWelderStats,
  extractWeldingComments,
  aggregateDailyWeldProduction,
  getWeldingAIFlags,
  extractWelderCertifications,
  fetchWPSSpecs,
  getDailyWeldSummary,
  getCumulativeWeldStats,
  fetchWeldingAILogs,
  extractDetailedWeldingActivities,
  extractIndividualWelds,
  extractAllRepairs,
  extractTieInData,
  aggregateProductionByLocation,
  generateWeldingChiefReport,
  saveWeldingChiefReport,
  fetchWeldingChiefReport
} from './weldingChiefHelpers.js'

// Import PDF generator
import { downloadWeldingChiefPDF } from './weldingChiefPDF.js'

// Import SignaturePad for digital signatures
import SignaturePad from './components/SignaturePad.jsx'

// Import Report Review components
import WeldingReportReviewTab from './components/WeldingReportReviewTab.jsx'

// ============================================================================
// WELDING CHIEF DASHBOARD
// February 2026 - Pipe-Up Pipeline Inspector SaaS
//
// TABS:
// 1. Overview (default) - KPIs, Today's Summary, AI Alerts
// 2. Welder Performance - Stats table with repair rate flagging
// 3. WPS Compliance - AI flags and WPS reference
// 4. Daily Reports - Comments and weld data by inspector
// 5. Welder Certifications - Qualification status and expiry alerts
// ============================================================================

function WeldingChiefDashboard() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  const { orgPath } = useOrgPath()
  const { addOrgFilter, organizationId, getOrgId, isReady } = useOrgQuery()

  // Tab state
  const [activeTab, setActiveTab] = useState('overview')

  // Date selection
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])

  // Loading states
  const [loading, setLoading] = useState(true)

  // Data states
  const [dailySummary, setDailySummary] = useState({
    totalWelds: 0,
    totalRepairs: 0,
    repairRate: 0,
    activeAlerts: 0,
    byCrewType: []
  })
  const [cumulativeStats, setCumulativeStats] = useState({
    totalWelds: 0,
    totalRepairs: 0,
    repairRate: 0
  })
  const [welderPerformance, setWelderPerformance] = useState([])
  const [wpsSpecs, setWpsSpecs] = useState([])
  const [weldingFlags, setWeldingFlags] = useState([])
  const [weldingComments, setWeldingComments] = useState([])
  const [certifications, setCertifications] = useState([])

  // Detailed weld data states
  const [detailedActivities, setDetailedActivities] = useState([])
  const [individualWelds, setIndividualWelds] = useState([])
  const [allRepairs, setAllRepairs] = useState([])
  const [tieInRecords, setTieInRecords] = useState([])
  const [productionByLocation, setProductionByLocation] = useState([])

  // View mode for Daily Reports tab
  const [reportsViewMode, setReportsViewMode] = useState('activities') // activities | welds | repairs | tieins

  // Expanded activity IDs
  const [expandedActivities, setExpandedActivities] = useState(new Set())

  // Daily Report state
  const [dailyReport, setDailyReport] = useState(null)
  const [reportGenerating, setReportGenerating] = useState(false)
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])

  // AI Agent Audit Panel state
  const [auditPanelData, setAuditPanelData] = useState(null)
  const [loadingAuditPanel, setLoadingAuditPanel] = useState(false)

  // Digital signature state
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [pendingSignatureAction, setPendingSignatureAction] = useState(null) // 'download' when signing for PDF

  // Pending review count for badge
  const [pendingReviewCount, setPendingReviewCount] = useState(0)

  // Repair rate thresholds
  const REPAIR_RATE_THRESHOLDS = {
    green: 5,    // <= 5% is good
    yellow: 8,   // 5-8% is warning
    red: 8       // > 8% is critical
  }

  // =============================================
  // LIFECYCLE
  // =============================================
  useEffect(() => {
    if (isReady()) {
      loadAllData()
    }
  }, [organizationId])

  useEffect(() => {
    if (isReady() && activeTab === 'overview') {
      loadDailySummary()
    }
  }, [selectedDate, organizationId])

  useEffect(() => {
    if (!isReady()) return

    if (activeTab === 'performance') loadWelderPerformance()
    if (activeTab === 'compliance') loadComplianceData()
    if (activeTab === 'reports') loadReportsData()
    if (activeTab === 'certifications') loadCertifications()
  }, [activeTab, organizationId, selectedDate])

  // =============================================
  // DATA LOADING FUNCTIONS
  // =============================================
  async function loadAllData() {
    setLoading(true)
    await Promise.all([
      loadDailySummary(),
      loadCumulativeStats()
    ])
    setLoading(false)
  }

  async function loadDailySummary() {
    try {
      const summary = await getDailyWeldSummary(supabase, getOrgId(), selectedDate)
      setDailySummary(summary)
    } catch (err) {
      console.error('Error loading daily summary:', err)
    }
  }

  async function loadCumulativeStats() {
    try {
      const stats = await getCumulativeWeldStats(supabase, getOrgId())
      setCumulativeStats(stats)
    } catch (err) {
      console.error('Error loading cumulative stats:', err)
    }
  }

  async function loadWelderPerformance() {
    try {
      const stats = await aggregateWelderStats(supabase, getOrgId())
      setWelderPerformance(stats)
    } catch (err) {
      console.error('Error loading welder performance:', err)
    }
  }

  async function loadComplianceData() {
    try {
      // Load WPS specs
      const specs = await fetchWPSSpecs(supabase, getOrgId())
      setWpsSpecs(specs)

      // Load AI logs with welding flags
      const logs = await fetchWeldingAILogs(supabase, getOrgId(), 100)
      const allFlags = []
      for (const log of logs) {
        allFlags.push(...(log.weldingFlags || []))
      }
      setWeldingFlags(allFlags)
    } catch (err) {
      console.error('Error loading compliance data:', err)
    }
  }

  async function loadReportsData() {
    try {
      // Fetch reports for selected date
      let query = supabase
        .from('daily_reports')
        .select('*')
        .eq('date', selectedDate)
        .order('created_at', { ascending: false })

      query = addOrgFilter(query)
      const { data: reports, error } = await query

      if (error) throw error

      // Extract all detailed data
      const comments = extractWeldingComments(reports || [])
      setWeldingComments(comments)

      const activities = extractDetailedWeldingActivities(reports || [])
      setDetailedActivities(activities)

      const welds = extractIndividualWelds(reports || [])
      setIndividualWelds(welds)

      const repairs = extractAllRepairs(reports || [])
      setAllRepairs(repairs)

      const tieIns = extractTieInData(reports || [])
      setTieInRecords(tieIns)

      const locations = aggregateProductionByLocation(reports || [])
      setProductionByLocation(locations)
    } catch (err) {
      console.error('Error loading reports data:', err)
    }
  }

  async function loadCertifications() {
    try {
      // Fetch recent reports with welder testing data
      let query = supabase
        .from('daily_reports')
        .select('*')
        .order('date', { ascending: false })
        .limit(200)

      query = addOrgFilter(query)
      const { data: reports, error } = await query

      if (error) throw error

      const certs = extractWelderCertifications(reports || [])
      setCertifications(certs)
    } catch (err) {
      console.error('Error loading certifications:', err)
    }
  }

  async function handleGenerateReport() {
    setReportGenerating(true)
    try {
      // Fetch all data for the report date
      let query = supabase
        .from('daily_reports')
        .select('*')
        .eq('date', reportDate)
        .order('created_at', { ascending: false })

      query = addOrgFilter(query)
      const { data: reports, error } = await query

      if (error) throw error

      // Extract all detailed data
      const activities = extractDetailedWeldingActivities(reports || [])
      const repairs = extractAllRepairs(reports || [])
      const tieIns = extractTieInData(reports || [])
      const comments = extractWeldingComments(reports || [])
      const summary = await getDailyWeldSummary(supabase, getOrgId(), reportDate)
      const welderStats = await aggregateWelderStats(supabase, getOrgId())
      const aiLogs = await fetchWeldingAILogs(supabase, getOrgId(), 50)
      const flags = []
      for (const log of aiLogs) {
        flags.push(...(log.weldingFlags || []))
      }

      // Generate the report
      const report = await generateWeldingChiefReport({
        date: reportDate,
        activities,
        repairs,
        tieIns,
        comments,
        dailySummary: summary,
        welderPerformance: welderStats,
        weldingFlags: flags
      })

      setDailyReport(report)
    } catch (err) {
      console.error('Error generating report:', err)
      alert('Error generating report. Please try again.')
    } finally {
      setReportGenerating(false)
    }
  }

  // =============================================
  // HELPER FUNCTIONS
  // =============================================
  function getRepairRateColor(rate) {
    if (rate <= REPAIR_RATE_THRESHOLDS.green) return '#28a745'
    if (rate <= REPAIR_RATE_THRESHOLDS.yellow) return '#ffc107'
    return '#dc3545'
  }

  function getRepairRateStatus(rate) {
    if (rate <= REPAIR_RATE_THRESHOLDS.green) return 'OK'
    if (rate <= REPAIR_RATE_THRESHOLDS.yellow) return 'WATCH'
    return 'FLAG'
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  // Handle signature for PDF download
  function handleSignAndDownload() {
    setPendingSignatureAction('download')
    setShowSignaturePad(true)
  }

  function handleSignatureSave(signatureData) {
    setShowSignaturePad(false)

    if (pendingSignatureAction === 'download' && dailyReport) {
      // Download PDF with signature
      downloadWeldingChiefPDF(dailyReport, {
        reportDate: reportDate,
        preparedBy: userProfile?.full_name || 'Welding Chief',
        projectName: 'Pipeline Construction Project',
        signatureData: {
          imageData: signatureData.imageData,
          signerName: userProfile?.full_name || 'Welding Chief',
          signerTitle: 'Welding Chief Inspector',
          timestamp: signatureData.timestamp
        }
      })
    }

    setPendingSignatureAction(null)
  }

  function handleSignatureCancel() {
    setShowSignaturePad(false)
    setPendingSignatureAction(null)
  }

  // =============================================
  // STYLES
  // =============================================
  const tabButtonStyle = (isActive) => ({
    padding: '15px 20px',
    backgroundColor: isActive ? '#fff' : '#f8f9fa',
    border: 'none',
    borderBottom: isActive ? '3px solid #6f42c1' : '3px solid transparent',
    cursor: 'pointer',
    fontWeight: isActive ? 'bold' : 'normal',
    fontSize: '14px',
    whiteSpace: 'nowrap'
  })

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginBottom: '20px',
    overflow: 'hidden'
  }

  const cardHeaderStyle = (color) => ({
    backgroundColor: color,
    padding: '15px 20px',
    color: color === '#ffc107' ? '#000' : 'white'
  })

  const tableStyle = { width: '100%', borderCollapse: 'collapse' }
  const thStyle = {
    padding: '12px 15px',
    textAlign: 'left',
    borderBottom: '1px solid #ddd',
    backgroundColor: '#f8f9fa',
    fontSize: '12px',
    fontWeight: 'bold'
  }
  const tdStyle = {
    padding: '12px 15px',
    borderBottom: '1px solid #eee',
    fontSize: '14px'
  }

  const kpiCardStyle = {
    padding: '25px',
    borderRadius: '8px',
    textAlign: 'center',
    border: '1px solid #dee2e6'
  }

  // =============================================
  // RENDER
  // =============================================
  if (loading && activeTab === 'overview') {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading Welding Chief Dashboard...</div>
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#6f42c1', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>Welding Chief Dashboard</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>
            {userProfile?.full_name || userProfile?.email} • Weld Production & Quality Monitoring
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <TenantSwitcher compact />
          <AIAgentStatusIcon
            organizationId={organizationId}
            onFlagClick={async (ticketId, flagData) => {
              setLoadingAuditPanel(true)
              try {
                const { data: ticket, error } = await supabase
                  .from('daily_reports')
                  .select('*')
                  .eq('id', ticketId)
                  .single()

                if (error) throw error

                setAuditPanelData({
                  ticket,
                  flag: flagData
                })
              } catch (err) {
                console.error('Error fetching flagged ticket:', err)
                alert(`Error loading ticket #${ticketId}`)
              } finally {
                setLoadingAuditPanel(false)
              }
            }}
          />
          <button onClick={() => navigate(orgPath('/auditor-dashboard?readonly=true&from=welding-chief'))} style={{ padding: '10px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            NDT Queue
          </button>
          <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #ddd', padding: '0 20px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: '0', minWidth: 'max-content' }}>
          <button onClick={() => setActiveTab('overview')} style={tabButtonStyle(activeTab === 'overview')}>
            📊 Overview
          </button>
          <button onClick={() => setActiveTab('performance')} style={tabButtonStyle(activeTab === 'performance')}>
            👷 Welder Performance
            {welderPerformance.filter(w => w.repairRate > REPAIR_RATE_THRESHOLDS.yellow).length > 0 && (
              <span style={{ marginLeft: '8px', backgroundColor: '#dc3545', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                {welderPerformance.filter(w => w.repairRate > REPAIR_RATE_THRESHOLDS.yellow).length}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab('compliance')} style={tabButtonStyle(activeTab === 'compliance')}>
            📋 WPS Compliance
            {weldingFlags.filter(f => f.severity === 'critical').length > 0 && (
              <span style={{ marginLeft: '8px', backgroundColor: '#dc3545', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                {weldingFlags.filter(f => f.severity === 'critical').length}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab('reports')} style={tabButtonStyle(activeTab === 'reports')}>
            📝 Daily Reports
          </button>
          <button onClick={() => setActiveTab('review')} style={tabButtonStyle(activeTab === 'review')}>
            ✅ Report Review
            {pendingReviewCount > 0 && (
              <span style={{ marginLeft: '8px', backgroundColor: '#ffc107', color: '#000', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                {pendingReviewCount}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab('certifications')} style={tabButtonStyle(activeTab === 'certifications')}>
            🎓 Certifications
            {certifications.filter(c => c.status === 'Expired' || c.isExpiringSoon).length > 0 && (
              <span style={{ marginLeft: '8px', backgroundColor: '#ffc107', color: '#000', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                {certifications.filter(c => c.status === 'Expired' || c.isExpiringSoon).length}
              </span>
            )}
          </button>
          <button onClick={() => setActiveTab('dailyreport')} style={tabButtonStyle(activeTab === 'dailyreport')}>
            📄 Generate Report
          </button>
        </div>
      </div>

      {/* ============ OVERVIEW TAB ============ */}
      {activeTab === 'overview' && (
        <div style={{ padding: '30px' }}>
          {/* Date Selector */}
          <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <label style={{ fontWeight: 'bold' }}>Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ padding: '10px', fontSize: '14px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
            <span style={{ fontSize: '14px', color: '#666' }}>{formatDate(selectedDate)}</span>
          </div>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
            <div style={{ ...kpiCardStyle, backgroundColor: '#e3f2fd', borderColor: '#007bff' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#0056b3', fontSize: '14px' }}>DAILY WELD COUNT</h3>
              <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#007bff' }}>{dailySummary.totalWelds}</p>
              <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>Welds completed today</p>
            </div>

            <div style={{
              ...kpiCardStyle,
              backgroundColor: dailySummary.repairRate > REPAIR_RATE_THRESHOLDS.yellow ? '#f8d7da' : '#d4edda',
              borderColor: getRepairRateColor(dailySummary.repairRate)
            }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#495057', fontSize: '14px' }}>DAILY REPAIR RATE</h3>
              <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: getRepairRateColor(dailySummary.repairRate) }}>
                {dailySummary.repairRate.toFixed(1)}%
              </p>
              <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
                {dailySummary.totalRepairs} repair(s) today
              </p>
            </div>

            <div style={{
              ...kpiCardStyle,
              backgroundColor: cumulativeStats.repairRate > REPAIR_RATE_THRESHOLDS.yellow ? '#fff3cd' : '#d4edda',
              borderColor: getRepairRateColor(cumulativeStats.repairRate)
            }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#495057', fontSize: '14px' }}>CUMULATIVE REPAIR RATE</h3>
              <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: getRepairRateColor(cumulativeStats.repairRate) }}>
                {cumulativeStats.repairRate.toFixed(1)}%
              </p>
              <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
                {cumulativeStats.totalRepairs} / {cumulativeStats.totalWelds} total welds
              </p>
            </div>

            <div style={{
              ...kpiCardStyle,
              backgroundColor: dailySummary.activeAlerts > 0 ? '#f8d7da' : '#d4edda',
              borderColor: dailySummary.activeAlerts > 0 ? '#dc3545' : '#28a745'
            }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#495057', fontSize: '14px' }}>ACTIVE AI ALERTS</h3>
              <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: dailySummary.activeAlerts > 0 ? '#dc3545' : '#28a745' }}>
                {dailySummary.activeAlerts}
              </p>
              <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
                Critical welding violations
              </p>
            </div>
          </div>

          {/* Today's Weld Summary Table */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#6f42c1')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Today's Weld Summary by Crew</h2>
            </div>
            {dailySummary.byCrewType.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p style={{ fontSize: '16px', margin: 0 }}>No welding activity recorded for {formatDate(selectedDate)}</p>
              </div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Crew Type</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Welds Completed</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Repairs</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Repair Rate</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySummary.byCrewType.map((crew, idx) => (
                    <tr key={idx} style={{ backgroundColor: crew.repairRate > REPAIR_RATE_THRESHOLDS.yellow ? '#fff3cd' : 'transparent' }}>
                      <td style={{ ...tdStyle, fontWeight: 'bold' }}>{crew.crewType}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{crew.weldsCompleted}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{crew.repairs}</td>
                      <td style={{
                        ...tdStyle,
                        textAlign: 'center',
                        fontWeight: 'bold',
                        color: getRepairRateColor(crew.repairRate)
                      }}>
                        {crew.repairRate.toFixed(1)}%
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          backgroundColor: getRepairRateColor(crew.repairRate),
                          color: crew.repairRate <= REPAIR_RATE_THRESHOLDS.yellow ? '#fff' : '#fff'
                        }}>
                          {getRepairRateStatus(crew.repairRate)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* AI Alert Banner - Show if there are critical flags */}
          {dailySummary.activeAlerts > 0 && (
            <div style={{
              ...cardStyle,
              border: '2px solid #dc3545'
            }}>
              <div style={cardHeaderStyle('#dc3545')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>⚠️</span>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '18px' }}>Critical WPS/Welding Violations Detected</h2>
                    <p style={{ margin: '5px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
                      {dailySummary.activeAlerts} critical alert(s) require immediate attention
                    </p>
                  </div>
                </div>
              </div>
              <div style={{ padding: '20px' }}>
                <p style={{ margin: '0 0 15px 0', color: '#666' }}>
                  Review the WPS Compliance tab for detailed violation information. Critical flags may include:
                </p>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#666' }}>
                  <li>WPS Material Mismatch</li>
                  <li>Filler Material Non-Compliance</li>
                  <li>Preheat Temperature Violations</li>
                </ul>
                <button
                  onClick={() => setActiveTab('compliance')}
                  style={{
                    marginTop: '15px',
                    padding: '10px 20px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  View WPS Compliance Details
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ WELDER PERFORMANCE TAB ============ */}
      {activeTab === 'performance' && (
        <div style={{ padding: '30px' }}>
          {/* Flagged Welders Alert */}
          {welderPerformance.filter(w => w.repairRate > REPAIR_RATE_THRESHOLDS.yellow).length > 0 && (
            <div style={{
              backgroundColor: '#fff3cd',
              border: '2px solid #ffc107',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '24px' }}>⚠️</span>
                <h3 style={{ margin: 0, color: '#856404' }}>Flagged Welders - Repair Rate Above {REPAIR_RATE_THRESHOLDS.yellow}%</h3>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {welderPerformance.filter(w => w.repairRate > REPAIR_RATE_THRESHOLDS.yellow).map((welder, idx) => (
                  <span key={idx} style={{
                    padding: '6px 12px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}>
                    {welder.welderName}: {welder.repairRate.toFixed(1)}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Welder Stats Table */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#17a2b8')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Welder Performance Statistics</h2>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                Green: &lt;{REPAIR_RATE_THRESHOLDS.green}% | Yellow: {REPAIR_RATE_THRESHOLDS.green}-{REPAIR_RATE_THRESHOLDS.yellow}% | Red: &gt;{REPAIR_RATE_THRESHOLDS.yellow}%
              </p>
            </div>
            {welderPerformance.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p style={{ fontSize: '16px', margin: 0 }}>No welder data available</p>
              </div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '50px' }}>Status</th>
                    <th style={thStyle}>Welder ID</th>
                    <th style={thStyle}>Welder Name</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Total Welds</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Repairs</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Repair Rate (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {welderPerformance.map((welder, idx) => (
                    <tr key={idx} style={{
                      backgroundColor: welder.repairRate > REPAIR_RATE_THRESHOLDS.yellow ? '#f8d7da' :
                                       welder.repairRate > REPAIR_RATE_THRESHOLDS.green ? '#fff3cd' : 'transparent'
                    }}>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: getRepairRateColor(welder.repairRate)
                        }} />
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{welder.welderId}</td>
                      <td style={{ ...tdStyle, fontWeight: 'bold' }}>{welder.welderName}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{welder.totalWelds}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{welder.repairs}</td>
                      <td style={{
                        ...tdStyle,
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '16px',
                        color: getRepairRateColor(welder.repairRate)
                      }}>
                        {welder.repairRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ============ WPS COMPLIANCE TAB ============ */}
      {activeTab === 'compliance' && (
        <div style={{ padding: '30px' }}>
          {/* Active AI Flags Panel */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#dc3545')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>AI-Detected Welding Violations</h2>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                WPS Material Mismatch, Filler Material Mismatch, Preheat Violations
              </p>
            </div>
            {weldingFlags.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <span style={{ fontSize: '48px' }}>✅</span>
                <p style={{ fontSize: '16px', margin: '10px 0 0 0' }}>No active welding violations detected</p>
              </div>
            ) : (
              <div style={{ padding: '0' }}>
                {weldingFlags.map((flag, idx) => {
                  const config = getFlagTypeConfig(flag.type)
                  const colors = SEVERITY_COLORS[flag.severity] || SEVERITY_COLORS.info
                  return (
                    <div
                      key={idx}
                      onClick={async () => {
                        if (flag.ticket_id) {
                          const { data: ticket } = await supabase
                            .from('daily_reports')
                            .select('*')
                            .eq('id', flag.ticket_id)
                            .single()

                          setAuditPanelData({ ticket, flag })
                        }
                      }}
                      style={{
                        padding: '20px',
                        borderBottom: '1px solid #eee',
                        backgroundColor: colors.bg,
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                        <span style={{ fontSize: '24px' }}>{config.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                            <h4 style={{ margin: 0, color: colors.text }}>{config.anomalyType}</h4>
                            <span style={{
                              padding: '2px 8px',
                              backgroundColor: colors.badge,
                              color: 'white',
                              borderRadius: '4px',
                              fontSize: '11px',
                              textTransform: 'uppercase'
                            }}>
                              {flag.severity}
                            </span>
                          </div>
                          <p style={{ margin: '0 0 10px 0', color: '#333', fontSize: '14px' }}>{flag.message}</p>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            Ticket Date: {flag.ticket_date} | Detected: {new Date(flag.analyzed_at).toLocaleString()}
                          </div>
                        </div>
                        <span style={{ color: '#999', fontSize: '20px' }}>→</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* WPS Reference Table */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#6c757d')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>WPS Material Specifications Reference</h2>
            </div>
            {wpsSpecs.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p style={{ fontSize: '16px', margin: 0 }}>No WPS specifications loaded</p>
              </div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>WPS Number</th>
                    <th style={thStyle}>Base Materials</th>
                    <th style={thStyle}>Filler Materials</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Min Preheat (°C)</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Max Heat Input</th>
                  </tr>
                </thead>
                <tbody>
                  {wpsSpecs.map((spec, idx) => (
                    <tr key={idx}>
                      <td style={{ ...tdStyle, fontWeight: 'bold', fontFamily: 'monospace' }}>{spec.wps_number}</td>
                      <td style={tdStyle}>
                        {Array.isArray(spec.base_materials) ? spec.base_materials.join(', ') : spec.base_materials || '-'}
                      </td>
                      <td style={tdStyle}>
                        {Array.isArray(spec.filler_materials) ? spec.filler_materials.join(', ') : spec.filler_materials || '-'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{spec.min_preheat || '-'}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{spec.max_heat_input || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ============ DAILY REPORTS TAB ============ */}
      {activeTab === 'reports' && (
        <div style={{ padding: '30px' }}>
          {/* Date Selector and View Mode */}
          <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 'bold' }}>Select Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ padding: '10px', fontSize: '14px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
            <button
              onClick={loadReportsData}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6f42c1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Load Reports
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
              {[
                { key: 'activities', label: 'Activities', count: detailedActivities.length },
                { key: 'welds', label: 'Weld Log', count: individualWelds.length },
                { key: 'repairs', label: 'Repairs', count: allRepairs.length },
                { key: 'tieins', label: 'Tie-Ins', count: tieInRecords.length }
              ].map(view => (
                <button
                  key={view.key}
                  onClick={() => setReportsViewMode(view.key)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: reportsViewMode === view.key ? '#6f42c1' : '#e9ecef',
                    color: reportsViewMode === view.key ? 'white' : '#333',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  {view.label} ({view.count})
                </button>
              ))}
            </div>
          </div>

          {/* Activities View */}
          {reportsViewMode === 'activities' && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle('#28a745')}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Welding Activities - {formatDate(selectedDate)}</h2>
              </div>
              {detailedActivities.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  <p style={{ fontSize: '16px', margin: 0 }}>No welding activities for this date</p>
                </div>
              ) : (
                <div>
                  {detailedActivities.map((activity, idx) => {
                    const isExpanded = expandedActivities.has(activity.reportId + '-' + idx)
                    return (
                      <div key={idx} style={{ borderBottom: '1px solid #eee' }}>
                        {/* Activity Header - Clickable */}
                        <div
                          onClick={() => {
                            const key = activity.reportId + '-' + idx
                            const newExpanded = new Set(expandedActivities)
                            if (isExpanded) newExpanded.delete(key)
                            else newExpanded.add(key)
                            setExpandedActivities(newExpanded)
                          }}
                          style={{
                            padding: '15px 20px',
                            backgroundColor: idx % 2 === 0 ? 'white' : '#f8f9fa',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '15px'
                          }}
                        >
                          <span style={{ fontSize: '18px' }}>{isExpanded ? '▼' : '▶'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                              <span style={{ fontWeight: 'bold', color: '#333' }}>{activity.activityType}</span>
                              <span style={{ padding: '2px 8px', backgroundColor: '#6f42c1', color: 'white', borderRadius: '4px', fontSize: '11px' }}>
                                {activity.crewType || 'N/A'}
                              </span>
                              {activity.weldsToday > 0 && (
                                <span style={{ padding: '2px 8px', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', fontSize: '11px' }}>
                                  {activity.weldsToday} welds
                                </span>
                              )}
                              {activity.repairs.length > 0 && (
                                <span style={{ padding: '2px 8px', backgroundColor: '#dc3545', color: 'white', borderRadius: '4px', fontSize: '11px' }}>
                                  {activity.repairs.length} repair(s)
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: '#666' }}>
                              <span><strong>Location:</strong> KP {activity.startKP || '?'} - {activity.endKP || '?'}</span>
                              <span><strong>Contractor:</strong> {activity.contractor || 'N/A'}</span>
                              <span><strong>Foreman:</strong> {activity.foreman || 'N/A'}</span>
                              <span><strong>Inspector:</strong> {activity.inspector}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', fontSize: '12px', color: '#666' }}>
                            <div>{activity.startTime} - {activity.endTime}</div>
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div style={{ padding: '0 20px 20px 50px', backgroundColor: '#f8f9fa' }}>
                            {/* Weld Entries */}
                            {activity.weldEntries.length > 0 && (
                              <div style={{ marginBottom: '15px' }}>
                                <h4 style={{ margin: '10px 0', fontSize: '14px', color: '#333' }}>Weld Entries ({activity.weldEntries.length})</h4>
                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ ...tableStyle, fontSize: '12px' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ ...thStyle, padding: '8px' }}>Weld #</th>
                                        <th style={{ ...thStyle, padding: '8px' }}>Preheat</th>
                                        <th style={{ ...thStyle, padding: '8px' }}>Pass</th>
                                        <th style={{ ...thStyle, padding: '8px' }}>Side</th>
                                        <th style={{ ...thStyle, padding: '8px' }}>Voltage</th>
                                        <th style={{ ...thStyle, padding: '8px' }}>Amperage</th>
                                        <th style={{ ...thStyle, padding: '8px' }}>Travel Speed</th>
                                        <th style={{ ...thStyle, padding: '8px' }}>Heat Input</th>
                                        <th style={{ ...thStyle, padding: '8px' }}>WPS</th>
                                        <th style={{ ...thStyle, padding: '8px' }}>Meets WPS</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {activity.weldEntries.map((entry, eidx) => (
                                        <tr key={eidx}>
                                          <td style={{ ...tdStyle, padding: '6px 8px', fontFamily: 'monospace', fontWeight: 'bold' }}>{entry.weldNumber}</td>
                                          <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>{entry.preheat}°C</td>
                                          <td style={{ ...tdStyle, padding: '6px 8px' }}>{entry.pass}</td>
                                          <td style={{ ...tdStyle, padding: '6px 8px' }}>{entry.side}</td>
                                          <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>{entry.voltage}V</td>
                                          <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>{entry.amperage}A</td>
                                          <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>{entry.travelSpeed}</td>
                                          <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>{entry.heatInput || '-'}</td>
                                          <td style={{ ...tdStyle, padding: '6px 8px' }}>{entry.wpsId || '-'}</td>
                                          <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>
                                            {entry.meetsWPS === true ? <span style={{ color: '#28a745' }}>✓</span> :
                                             entry.meetsWPS === false ? <span style={{ color: '#dc3545' }}>✗</span> : '-'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Repairs */}
                            {activity.repairs.length > 0 && (
                              <div style={{ marginBottom: '15px' }}>
                                <h4 style={{ margin: '10px 0', fontSize: '14px', color: '#dc3545' }}>Repairs ({activity.repairs.length})</h4>
                                <table style={{ ...tableStyle, fontSize: '12px' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ ...thStyle, padding: '8px', backgroundColor: '#f8d7da' }}>Weld #</th>
                                      <th style={{ ...thStyle, padding: '8px', backgroundColor: '#f8d7da' }}>Defect Code</th>
                                      <th style={{ ...thStyle, padding: '8px', backgroundColor: '#f8d7da' }}>Defect Name</th>
                                      <th style={{ ...thStyle, padding: '8px', backgroundColor: '#f8d7da' }}>Clock Position</th>
                                      <th style={{ ...thStyle, padding: '8px', backgroundColor: '#f8d7da' }}>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {activity.repairs.map((repair, ridx) => (
                                      <tr key={ridx} style={{ backgroundColor: '#fff5f5' }}>
                                        <td style={{ ...tdStyle, padding: '6px 8px', fontFamily: 'monospace', fontWeight: 'bold' }}>{repair.weldNumber}</td>
                                        <td style={{ ...tdStyle, padding: '6px 8px', fontWeight: 'bold', color: '#dc3545' }}>{repair.defectCode}</td>
                                        <td style={{ ...tdStyle, padding: '6px 8px' }}>{repair.defectName}</td>
                                        <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>{repair.clockPosition || '-'}</td>
                                        <td style={{ ...tdStyle, padding: '6px 8px' }}>
                                          <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            backgroundColor: repair.status === 'completed' ? '#28a745' : '#ffc107',
                                            color: repair.status === 'completed' ? 'white' : '#000'
                                          }}>
                                            {repair.status}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Tie-Ins */}
                            {activity.tieIns.length > 0 && (
                              <div style={{ marginBottom: '15px' }}>
                                <h4 style={{ margin: '10px 0', fontSize: '14px', color: '#8b4513' }}>Tie-Ins ({activity.tieIns.length})</h4>
                                <table style={{ ...tableStyle, fontSize: '12px' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ ...thStyle, padding: '8px' }}>Tie-In #</th>
                                      <th style={{ ...thStyle, padding: '8px' }}>Station</th>
                                      <th style={{ ...thStyle, padding: '8px' }}>Visual</th>
                                      <th style={{ ...thStyle, padding: '8px' }}>NDE Type</th>
                                      <th style={{ ...thStyle, padding: '8px' }}>NDE Result</th>
                                      <th style={{ ...thStyle, padding: '8px' }}>Direction</th>
                                      <th style={{ ...thStyle, padding: '8px' }}>Weld Params</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {activity.tieIns.map((ti, tidx) => (
                                      <tr key={tidx}>
                                        <td style={{ ...tdStyle, padding: '6px 8px', fontFamily: 'monospace', fontWeight: 'bold', color: '#8b4513' }}>{ti.tieInNumber}</td>
                                        <td style={{ ...tdStyle, padding: '6px 8px' }}>{ti.station}</td>
                                        <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>
                                          <span style={{ color: ti.visualResult === 'Accept' ? '#28a745' : ti.visualResult === 'Reject' ? '#dc3545' : '#666' }}>
                                            {ti.visualResult || '-'}
                                          </span>
                                        </td>
                                        <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>{ti.ndeType || '-'}</td>
                                        <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>
                                          <span style={{ color: ti.ndeResult === 'Accept' ? '#28a745' : ti.ndeResult === 'Reject' ? '#dc3545' : '#666' }}>
                                            {ti.ndeResult || '-'}
                                          </span>
                                        </td>
                                        <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>{ti.constructionDirection || '-'}</td>
                                        <td style={{ ...tdStyle, padding: '6px 8px', textAlign: 'center' }}>{ti.weldParamsCount}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Visual Inspection Range */}
                            {(activity.visualsFrom || activity.visualsTo) && (
                              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                                <strong>Visual Inspection Range:</strong> {activity.visualsFrom} - {activity.visualsTo}
                              </div>
                            )}

                            {/* Downtime */}
                            {activity.downTimeHours > 0 && (
                              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                                <strong>Downtime:</strong> {activity.downTimeHours} hours - {activity.downTimeReason}
                              </div>
                            )}

                            {/* Comments */}
                            {(activity.comments || activity.qualityComments) && (
                              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
                                <strong>Comments:</strong> {activity.comments || activity.qualityComments}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Individual Welds View */}
          {reportsViewMode === 'welds' && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle('#17a2b8')}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Weld Log - {formatDate(selectedDate)}</h2>
              </div>
              {individualWelds.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  <p style={{ fontSize: '16px', margin: 0 }}>No individual weld entries for this date</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Weld #</th>
                        <th style={thStyle}>Location (KP)</th>
                        <th style={thStyle}>Crew</th>
                        <th style={thStyle}>Contractor</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Preheat</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Voltage</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Amperage</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Heat Input</th>
                        <th style={thStyle}>WPS</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Meets WPS</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Repair?</th>
                        <th style={thStyle}>Inspector</th>
                      </tr>
                    </thead>
                    <tbody>
                      {individualWelds.map((weld, idx) => (
                        <tr key={idx} style={{ backgroundColor: weld.hasRepair ? '#fff5f5' : (idx % 2 === 0 ? 'white' : '#f8f9fa') }}>
                          <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold' }}>{weld.weldNumber}</td>
                          <td style={tdStyle}>{weld.startKP} - {weld.endKP}</td>
                          <td style={tdStyle}>{weld.crewType}</td>
                          <td style={tdStyle}>{weld.contractor}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{weld.preheat}°C</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{weld.voltage}V</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{weld.amperage}A</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{weld.heatInput || '-'}</td>
                          <td style={tdStyle}>{weld.wpsId || '-'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            {weld.meetsWPS === true ? <span style={{ color: '#28a745', fontWeight: 'bold' }}>✓</span> :
                             weld.meetsWPS === false ? <span style={{ color: '#dc3545', fontWeight: 'bold' }}>✗</span> : '-'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            {weld.hasRepair && <span style={{ color: '#dc3545', fontWeight: 'bold' }}>YES</span>}
                          </td>
                          <td style={tdStyle}>{weld.inspector}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Repairs View */}
          {reportsViewMode === 'repairs' && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle('#dc3545')}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Repair Log - {formatDate(selectedDate)}</h2>
              </div>
              {allRepairs.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  <span style={{ fontSize: '48px' }}>✅</span>
                  <p style={{ fontSize: '16px', margin: '10px 0 0 0' }}>No repairs required for this date</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Weld #</th>
                        <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Location (KP)</th>
                        <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Defect Code</th>
                        <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Defect Name</th>
                        <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Clock Position</th>
                        <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Crew</th>
                        <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Contractor</th>
                        <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Status</th>
                        <th style={{ ...thStyle, backgroundColor: '#f8d7da' }}>Inspector</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRepairs.map((repair, idx) => (
                        <tr key={idx} style={{ backgroundColor: '#fff5f5' }}>
                          <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold' }}>{repair.weldNumber}</td>
                          <td style={tdStyle}>{repair.startKP} - {repair.endKP}</td>
                          <td style={{ ...tdStyle, fontWeight: 'bold', color: '#dc3545' }}>{repair.defectCode}</td>
                          <td style={tdStyle}>{repair.defectName}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{repair.clockPosition || '-'}</td>
                          <td style={tdStyle}>{repair.crewType}</td>
                          <td style={tdStyle}>{repair.contractor}</td>
                          <td style={tdStyle}>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              backgroundColor: repair.status === 'completed' ? '#28a745' : '#ffc107',
                              color: repair.status === 'completed' ? 'white' : '#000'
                            }}>
                              {repair.status}
                            </span>
                          </td>
                          <td style={tdStyle}>{repair.inspector}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tie-Ins View */}
          {reportsViewMode === 'tieins' && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle('#8b4513')}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Tie-In Log - {formatDate(selectedDate)}</h2>
              </div>
              {tieInRecords.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  <p style={{ fontSize: '16px', margin: 0 }}>No tie-in activities for this date</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Tie-In #</th>
                        <th style={thStyle}>Station (KP)</th>
                        <th style={thStyle}>Location</th>
                        <th style={thStyle}>Pipe Size</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Visual</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>NDE Type</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>NDE Result</th>
                        <th style={thStyle}>Direction</th>
                        <th style={thStyle}>Contractor</th>
                        <th style={thStyle}>Inspector</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>PUP Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tieInRecords.map((ti, idx) => (
                        <tr key={idx} style={{ backgroundColor: ti.ndeResult === 'Reject' ? '#fff5f5' : (idx % 2 === 0 ? 'white' : '#f8f9fa') }}>
                          <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold', color: '#8b4513' }}>{ti.tieInNumber}</td>
                          <td style={tdStyle}>{ti.station}</td>
                          <td style={tdStyle}>{ti.startKP} - {ti.endKP}</td>
                          <td style={tdStyle}>{ti.pipeSize || '-'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              backgroundColor: ti.visualResult === 'Accept' ? '#d4edda' : ti.visualResult === 'Reject' ? '#f8d7da' : '#e9ecef',
                              color: ti.visualResult === 'Accept' ? '#155724' : ti.visualResult === 'Reject' ? '#721c24' : '#666'
                            }}>
                              {ti.visualResult || '-'}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{ti.ndeType || '-'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              backgroundColor: ti.ndeResult === 'Accept' ? '#d4edda' : ti.ndeResult === 'Reject' ? '#f8d7da' : '#e9ecef',
                              color: ti.ndeResult === 'Accept' ? '#155724' : ti.ndeResult === 'Reject' ? '#721c24' : '#666'
                            }}>
                              {ti.ndeResult || '-'}
                            </span>
                          </td>
                          <td style={tdStyle}>{ti.constructionDirection || '-'}</td>
                          <td style={tdStyle}>{ti.contractor}</td>
                          <td style={tdStyle}>{ti.inspector}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            {ti.hasPupData && <span style={{ color: '#8b4513' }}>✓</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Comments Section (Always visible at bottom) */}
          {weldingComments.length > 0 && (
            <div style={{ ...cardStyle, marginTop: '20px' }}>
              <div style={cardHeaderStyle('#6c757d')}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Inspector Comments ({weldingComments.length})</h2>
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {weldingComments.map((comment, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px 20px',
                      borderBottom: '1px solid #eee',
                      backgroundColor: idx % 2 === 0 ? 'white' : '#f8f9fa'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 'bold', color: '#333' }}>{comment.inspector}</span>
                        <span style={{ padding: '2px 8px', backgroundColor: '#e9ecef', borderRadius: '4px', fontSize: '11px' }}>
                          {comment.activityType}
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#666' }}>
                        {comment.time && `${comment.time} | `}KP {comment.kp || 'N/A'}
                      </span>
                    </div>
                    <p style={{ margin: 0, color: '#495057', fontSize: '13px' }}>{comment.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ REPORT REVIEW TAB ============ */}
      {activeTab === 'review' && (
        <WeldingReportReviewTab onPendingCountChange={setPendingReviewCount} />
      )}

      {/* ============ CERTIFICATIONS TAB ============ */}
      {activeTab === 'certifications' && (
        <div style={{ padding: '30px' }}>
          {/* Certification Alerts */}
          {certifications.filter(c => c.status === 'Expired' || c.isExpiringSoon).length > 0 && (
            <div style={{
              backgroundColor: '#f8d7da',
              border: '2px solid #dc3545',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '24px' }}>🚨</span>
                <h3 style={{ margin: 0, color: '#721c24' }}>Certification Alerts</h3>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {certifications.filter(c => c.status === 'Expired').map((cert, idx) => (
                  <li key={`exp-${idx}`} style={{ color: '#721c24', marginBottom: '5px' }}>
                    <strong>{cert.welderName}</strong> - Qualification EXPIRED on {cert.expiryDate}
                  </li>
                ))}
                {certifications.filter(c => c.isExpiringSoon && c.status !== 'Expired').map((cert, idx) => (
                  <li key={`soon-${idx}`} style={{ color: '#856404', marginBottom: '5px' }}>
                    <strong>{cert.welderName}</strong> - Qualification expiring on {cert.expiryDate}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Active Welders Table */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#20c997')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Welder Qualification Status</h2>
            </div>
            {certifications.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p style={{ fontSize: '16px', margin: 0 }}>No welder certification data available</p>
                <p style={{ fontSize: '13px', color: '#999', marginTop: '10px' }}>
                  Certification data is populated from Welder Testing Log entries
                </p>
              </div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Welder Name</th>
                    <th style={thStyle}>Project ID</th>
                    <th style={thStyle}>ABSA No.</th>
                    <th style={thStyle}>Weld Procedure</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Test Date</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Expiry Date</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Pass/Fail</th>
                  </tr>
                </thead>
                <tbody>
                  {certifications.map((cert, idx) => (
                    <tr key={idx} style={{
                      backgroundColor: cert.status === 'Expired' ? '#f8d7da' :
                                       cert.isExpiringSoon ? '#fff3cd' :
                                       cert.status === 'Requires Retest' ? '#fff3cd' : 'transparent'
                    }}>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          backgroundColor: cert.status === 'Active' ? '#28a745' :
                                          cert.status === 'Expired' ? '#dc3545' : '#ffc107',
                          color: cert.status === 'Active' || cert.status === 'Expired' ? 'white' : '#000'
                        }}>
                          {cert.status}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 'bold' }}>{cert.welderName}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{cert.projectId || '-'}</td>
                      <td style={tdStyle}>{cert.absaNo || '-'}</td>
                      <td style={tdStyle}>{cert.weldProcedure || '-'}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{cert.testDate || '-'}</td>
                      <td style={{
                        ...tdStyle,
                        textAlign: 'center',
                        fontWeight: cert.isExpiringSoon || cert.status === 'Expired' ? 'bold' : 'normal',
                        color: cert.status === 'Expired' ? '#dc3545' : cert.isExpiringSoon ? '#856404' : 'inherit'
                      }}>
                        {cert.expiryDate || '-'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{
                          color: cert.passFail === 'Pass' ? '#28a745' : cert.passFail === 'Fail' ? '#dc3545' : '#666'
                        }}>
                          {cert.passFail || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ============ DAILY REPORT TAB ============ */}
      {activeTab === 'dailyreport' && (
        <div style={{ padding: '30px' }}>
          {/* Report Date Selector and Generate Button */}
          <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 'bold' }}>Report Date:</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              style={{ padding: '10px', fontSize: '14px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
            <button
              onClick={handleGenerateReport}
              disabled={reportGenerating}
              style={{
                padding: '12px 24px',
                backgroundColor: reportGenerating ? '#6c757d' : '#6f42c1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: reportGenerating ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              {reportGenerating ? '⏳ Generating Report...' : '🤖 Generate AI Report'}
            </button>
            {dailyReport && (
              <>
                <button
                  onClick={handleSignAndDownload}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  ✍️ Sign & Download PDF
                </button>
                <button
                  onClick={() => downloadWeldingChiefPDF(dailyReport, {
                    reportDate: reportDate,
                    preparedBy: userProfile?.full_name || 'Welding Chief',
                    projectName: 'Pipeline Construction Project'
                  })}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  📥 Download (Unsigned)
                </button>
                <button
                  onClick={() => window.print()}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#495057',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  🖨️ Print
                </button>
              </>
            )}
          </div>

          {/* No Report Yet */}
          {!dailyReport && !reportGenerating && (
            <div style={{ ...cardStyle, padding: '60px', textAlign: 'center' }}>
              <span style={{ fontSize: '64px' }}>📄</span>
              <h2 style={{ margin: '20px 0 10px 0', color: '#333' }}>Welding Chief Daily Report</h2>
              <p style={{ color: '#666', maxWidth: '500px', margin: '0 auto 20px auto' }}>
                Select a date and click "Generate AI Report" to create a comprehensive daily welding report
                with production summaries, quality analysis, and inspector observations.
              </p>
            </div>
          )}

          {/* Loading State */}
          {reportGenerating && (
            <div style={{ ...cardStyle, padding: '60px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', animation: 'spin 2s linear infinite' }}>⚙️</div>
              <h2 style={{ margin: '20px 0 10px 0', color: '#6f42c1' }}>Generating Report...</h2>
              <p style={{ color: '#666' }}>
                Analyzing welding data and generating AI narrative. This may take a moment.
              </p>
            </div>
          )}

          {/* Generated Report */}
          {dailyReport && !reportGenerating && (
            <div className="welding-report-printable">
              {/* Report Header */}
              <div style={{ ...cardStyle, marginBottom: '20px' }}>
                <div style={{ backgroundColor: '#6f42c1', color: 'white', padding: '25px 30px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h1 style={{ margin: 0, fontSize: '24px' }}>WELDING CHIEF DAILY REPORT</h1>
                      <p style={{ margin: '5px 0 0 0', fontSize: '16px', opacity: 0.9 }}>
                        {formatDate(reportDate)} • Pipeline Construction Project
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '14px' }}>
                      <div>Prepared by: {userProfile?.full_name || 'Welding Chief'}</div>
                      <div>Generated: {new Date().toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {/* Executive Summary */}
                <div style={{ padding: '25px 30px', borderBottom: '1px solid #eee' }}>
                  <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#333', borderBottom: '2px solid #6f42c1', paddingBottom: '10px' }}>
                    EXECUTIVE SUMMARY
                  </h2>
                  <p style={{ margin: 0, fontSize: '15px', lineHeight: '1.7', color: '#333' }}>
                    {dailyReport.executiveSummary || 'No summary available.'}
                  </p>
                </div>
              </div>

              {/* Production Summary */}
              <div style={{ ...cardStyle, marginBottom: '20px' }}>
                <div style={cardHeaderStyle('#28a745')}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>PRODUCTION SUMMARY</h2>
                </div>
                <div style={{ padding: '20px 30px' }}>
                  <p style={{ margin: '0 0 15px 0', fontSize: '14px', lineHeight: '1.6', color: '#333' }}>
                    {dailyReport.productionSummary?.narrative || 'No production data available.'}
                  </p>
                  {dailyReport.productionSummary?.bullets?.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {dailyReport.productionSummary.bullets.map((bullet, idx) => (
                        <li key={idx} style={{ marginBottom: '8px', fontSize: '14px', color: '#333' }}>
                          {bullet.replace(/^[<\-•]\s*/, '')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Quality & Repairs */}
              <div style={{ ...cardStyle, marginBottom: '20px' }}>
                <div style={cardHeaderStyle('#dc3545')}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>QUALITY & REPAIRS</h2>
                </div>
                <div style={{ padding: '20px 30px' }}>
                  <p style={{ margin: '0 0 15px 0', fontSize: '14px', lineHeight: '1.6', color: '#333' }}>
                    {dailyReport.qualityAndRepairs?.narrative || 'No quality issues to report.'}
                  </p>
                  {dailyReport.qualityAndRepairs?.bullets?.length > 0 && (
                    <ul style={{ margin: '0 0 15px 0', paddingLeft: '20px' }}>
                      {dailyReport.qualityAndRepairs.bullets.map((bullet, idx) => (
                        <li key={idx} style={{ marginBottom: '8px', fontSize: '14px', color: '#333' }}>
                          {bullet.replace(/^[<\-•]\s*/, '')}
                        </li>
                      ))}
                    </ul>
                  )}
                  {dailyReport.qualityAndRepairs?.flaggedWelders?.length > 0 && (
                    <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '6px', marginTop: '15px' }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#856404', fontSize: '14px' }}>⚠️ Flagged Welders</h4>
                      <ul style={{ margin: 0, paddingLeft: '20px' }}>
                        {dailyReport.qualityAndRepairs.flaggedWelders.map((welder, idx) => (
                          <li key={idx} style={{ fontSize: '13px', color: '#856404' }}>{welder}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Tie-In Operations */}
              <div style={{ ...cardStyle, marginBottom: '20px' }}>
                <div style={cardHeaderStyle('#8b4513')}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>TIE-IN OPERATIONS</h2>
                </div>
                <div style={{ padding: '20px 30px' }}>
                  <p style={{ margin: '0 0 15px 0', fontSize: '14px', lineHeight: '1.6', color: '#333' }}>
                    {dailyReport.tieInOperations?.narrative || 'No tie-in operations today.'}
                  </p>
                  {dailyReport.tieInOperations?.bullets?.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {dailyReport.tieInOperations.bullets.map((bullet, idx) => (
                        <li key={idx} style={{ marginBottom: '8px', fontSize: '14px', color: '#333' }}>
                          {bullet.replace(/^[<\-•]\s*/, '')}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Inspector Observations */}
              <div style={{ ...cardStyle, marginBottom: '20px' }}>
                <div style={cardHeaderStyle('#17a2b8')}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>INSPECTOR OBSERVATIONS</h2>
                </div>
                <div style={{ padding: '20px 30px' }}>
                  <p style={{ margin: '0 0 15px 0', fontSize: '14px', lineHeight: '1.6', color: '#333' }}>
                    {dailyReport.inspectorObservations?.narrative || 'No observations recorded.'}
                  </p>
                  {dailyReport.inspectorObservations?.keyComments?.length > 0 && (
                    <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '6px' }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#333', fontSize: '14px' }}>Key Comments:</h4>
                      {dailyReport.inspectorObservations.keyComments.map((comment, idx) => (
                        <div key={idx} style={{
                          padding: '10px 15px',
                          backgroundColor: 'white',
                          borderLeft: '3px solid #17a2b8',
                          marginBottom: '10px',
                          fontSize: '13px',
                          color: '#333'
                        }}>
                          "{comment}"
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Items */}
              {dailyReport.actionItems?.length > 0 && (
                <div style={{ ...cardStyle, marginBottom: '20px' }}>
                  <div style={cardHeaderStyle('#ffc107')}>
                    <h2 style={{ margin: 0, fontSize: '18px', color: '#000' }}>ACTION ITEMS</h2>
                  </div>
                  <div style={{ padding: '20px 30px' }}>
                    <ol style={{ margin: 0, paddingLeft: '25px' }}>
                      {dailyReport.actionItems.map((item, idx) => (
                        <li key={idx} style={{ marginBottom: '10px', fontSize: '14px', color: '#333' }}>
                          {item}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {/* Report Footer */}
              <div style={{ textAlign: 'center', padding: '20px', color: '#666', fontSize: '12px' }}>
                <p style={{ margin: 0 }}>
                  This report was generated using AI analysis of daily welding inspection data.
                  <br />
                  Report Date: {reportDate} | Generated: {new Date().toISOString()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Agent Audit Findings Panel */}
      <AgentAuditFindingsPanel
        isOpen={!!auditPanelData}
        onClose={() => setAuditPanelData(null)}
        ticket={auditPanelData?.ticket}
        flag={auditPanelData?.flag}
      />

      {/* Digital Signature Pad Modal */}
      {showSignaturePad && (
        <SignaturePad
          onSave={handleSignatureSave}
          onCancel={handleSignatureCancel}
          signerName={userProfile?.full_name || 'Welding Chief'}
          signerRole="Welding Chief Inspector"
        />
      )}
    </div>
  )
}

export default WeldingChiefDashboard
