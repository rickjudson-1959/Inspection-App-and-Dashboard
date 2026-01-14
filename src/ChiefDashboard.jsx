import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'
import jsPDF from 'jspdf'

// Import helper functions
import {
  fetchApprovedReportsForDate,
  aggregatePersonnel,
  aggregateProgressBySection,
  aggregateWeldingProgress,
  calculateRepairRate,
  aggregateOverallProgress,
  aggregateWeather,
  aggregatePhotos,
  extractSafetyEvents,
  generateKeyFocusNarrative,
  generateSafetyStatus,
  saveDailySummary,
  saveSectionProgress,
  saveWeldingProgress,
  saveReportPhotos,
  fetchDailySummary,
  buildProgressData,
  fetchProjectBaselines,
  calculateCumulativeProgress,
  calculateMTDProgress
} from './chiefReportHelpers.js'

function ChiefDashboard() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  
  // Tab state
  const [activeTab, setActiveTab] = useState('review')
  
  // =============================================
  // REVIEW TAB STATE
  // =============================================
  const [pendingReports, setPendingReports] = useState([])
  const [approvedReports, setApprovedReports] = useState([])
  const [rejectedReports, setRejectedReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingReport, setRejectingReport] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [stats, setStats] = useState({ reviewedThisWeek: 0, approvedThisWeek: 0, rejectedThisWeek: 0 })

  // =============================================
  // DAILY SUMMARY TAB STATE
  // =============================================
  const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [generatingNarrative, setGeneratingNarrative] = useState(false)
  const [summaryData, setSummaryData] = useState(null)
  const [sourceReports, setSourceReports] = useState([])
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  
  // Editable fields
  const [keyFocusNarrative, setKeyFocusNarrative] = useState('')
  const [keyFocusBullets, setKeyFocusBullets] = useState([])
  const [safetyStatus, setSafetyStatus] = useState('')
  const [safetyBullets, setSafetyBullets] = useState([])
  const [personnelData, setPersonnelData] = useState({})
  const [sectionProgress, setSectionProgressData] = useState([])
  const [weldingProgress, setWeldingProgressData] = useState([])
  const [overallProgress, setOverallProgressData] = useState([])
  const [weatherData, setWeatherData] = useState({})
  const [photosData, setPhotosData] = useState({ all: [], byKP: {} })
  const [selectedPhotos, setSelectedPhotos] = useState([])
  const [fullProgressData, setFullProgressData] = useState([]) // From project_baselines + daily_tickets

  // =============================================
  // REVIEW TAB FUNCTIONS
  // =============================================
  useEffect(() => { fetchAllData() }, [])

  async function fetchAllData() {
    setLoading(true)
    await Promise.all([fetchPendingReports(), fetchApprovedReports(), fetchRejectedReports(), fetchStats()])
    setLoading(false)
  }

  async function fetchPendingReports() {
    try {
      const { data: statusData } = await supabase.from('report_status').select('*').eq('status', 'submitted').order('submitted_at', { ascending: true })
      const reportsWithData = []
      for (const status of (statusData || [])) {
        const { data: ticket } = await supabase.from('daily_tickets').select('*').eq('id', status.report_id).single()
        if (ticket) reportsWithData.push({ ...status, ticket })
      }
      setPendingReports(reportsWithData)
    } catch (err) { console.error('Error:', err) }
  }

  async function fetchApprovedReports() {
    try {
      const { data: statusData } = await supabase.from('report_status').select('*').eq('status', 'approved').order('reviewed_at', { ascending: false }).limit(10)
      const reportsWithData = []
      for (const status of (statusData || [])) {
        const { data: ticket } = await supabase.from('daily_tickets').select('*').eq('id', status.report_id).single()
        if (ticket) reportsWithData.push({ ...status, ticket })
      }
      setApprovedReports(reportsWithData)
    } catch (err) { console.error('Error:', err) }
  }

  async function fetchRejectedReports() {
    try {
      const { data: statusData } = await supabase.from('report_status').select('*').eq('status', 'revision_requested').order('reviewed_at', { ascending: false })
      const reportsWithData = []
      for (const status of (statusData || [])) {
        const { data: ticket } = await supabase.from('daily_tickets').select('*').eq('id', status.report_id).single()
        if (ticket) reportsWithData.push({ ...status, ticket })
      }
      setRejectedReports(reportsWithData)
    } catch (err) { console.error('Error:', err) }
  }

  async function fetchStats() {
    try {
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      const { data: auditData } = await supabase.from('report_audit_log').select('change_type').gte('changed_at', oneWeekAgo.toISOString()).in('change_type', ['approve', 'revision_request'])
      const approved = (auditData || []).filter(a => a.change_type === 'approve').length
      const rejected = (auditData || []).filter(a => a.change_type === 'revision_request').length
      setStats({ reviewedThisWeek: approved + rejected, approvedThisWeek: approved, rejectedThisWeek: rejected })
    } catch (err) { console.error('Error:', err) }
  }

  async function acceptReport(reportId) {
    if (!confirm('Accept this report?')) return
    try {
      const now = new Date().toISOString()
      await supabase.from('report_status').update({ status: 'approved', reviewed_at: now, reviewed_by: userProfile?.id, reviewed_by_name: userProfile?.full_name || userProfile?.email, review_decision: 'approved', updated_at: now }).eq('report_id', reportId)
      await supabase.from('report_audit_log').insert({ report_id: reportId, changed_by: userProfile?.id, changed_by_name: userProfile?.full_name || userProfile?.email, changed_by_role: userProfile?.role, change_type: 'approve' })
      fetchAllData()
    } catch (err) { console.error('Error:', err); alert('Error accepting report') }
  }

  function openRejectModal(report) {
    setRejectingReport(report)
    setRejectionReason('')
    setShowRejectModal(true)
  }

  async function submitRejection() {
    if (!rejectionReason.trim()) { alert('Please enter a reason'); return }
    try {
      const now = new Date().toISOString()
      await supabase.from('report_status').update({ status: 'revision_requested', reviewed_at: now, reviewed_by: userProfile?.id, reviewed_by_name: userProfile?.full_name || userProfile?.email, review_decision: 'revision_requested', revision_notes: rejectionReason, updated_at: now }).eq('report_id', rejectingReport.report_id)
      await supabase.from('report_audit_log').insert({ report_id: rejectingReport.report_id, changed_by: userProfile?.id, changed_by_name: userProfile?.full_name || userProfile?.email, changed_by_role: userProfile?.role, change_type: 'revision_request', change_reason: rejectionReason })
      setShowRejectModal(false)
      setRejectingReport(null)
      setRejectionReason('')
      fetchAllData()
    } catch (err) { console.error('Error:', err); alert('Error rejecting report') }
  }

  // =============================================
  // DAILY SUMMARY TAB FUNCTIONS
  // =============================================
  async function loadSummaryForDate() {
    setSummaryLoading(true)
    console.log('Loading summary for date:', summaryDate)
    try {
      const existingSummary = await fetchDailySummary(summaryDate)
      console.log('Existing summary:', existingSummary)
      
      if (existingSummary) {
        setSummaryData(existingSummary)
        setKeyFocusNarrative(existingSummary.key_focus_narrative || '')
        setKeyFocusBullets(existingSummary.key_focus_bullets || [])
        setSafetyStatus(existingSummary.safety_status || '')
        setSafetyBullets(existingSummary.safety_bullets || [])
        setPersonnelData(existingSummary.personnel_onsite || {})
        setSectionProgressData(existingSummary.section_progress || [])
        setWeldingProgressData(existingSummary.welding_progress || [])
        setOverallProgressData(existingSummary.overall_progress || [])
        setWeatherData({
          description: existingSummary.weather_description,
          temp_high_f: existingSummary.temp_high_f,
          temp_low_f: existingSummary.temp_low_f,
          precipitation_mm: existingSummary.precipitation_mm,
          humidity_pct: existingSummary.humidity_pct,
          wind_speed_kmh: existingSummary.wind_speed_kmh
        })
        setPhotosData({ all: existingSummary.photos || [], byKP: groupPhotosByKP(existingSummary.photos || []) })
        setSelectedPhotos((existingSummary.photos || []).slice(0, 6).map(p => p.id || p.photo_url))
      }

      const reports = await fetchApprovedReportsForDate(summaryDate)
      console.log('Fetched reports for date:', reports?.length, reports)
      setSourceReports(reports)

      // Fetch real progress data from project_baselines and daily_tickets
      console.log('Building progress data from baselines and tickets...')
      const progressData = await buildProgressData(summaryDate)
      console.log('Progress data:', progressData)
      setFullProgressData(progressData)

      if (!existingSummary && reports.length > 0) {
        console.log('Aggregating from reports...')
        await aggregateFromReports(reports)
      } else if (!existingSummary && reports.length === 0) {
        console.log('No reports found, resetting data')
        resetSummaryData()
      }
    } catch (err) {
      console.error('Error loading summary:', err)
    }
    setSummaryLoading(false)
  }

  function groupPhotosByKP(photos) {
    const grouped = {}
    photos.forEach(photo => {
      const kp = photo.kp_location || 'Unknown'
      if (!grouped[kp]) grouped[kp] = []
      grouped[kp].push(photo)
    })
    return grouped
  }

  function resetSummaryData() {
    setSummaryData(null)
    setKeyFocusNarrative('')
    setKeyFocusBullets([])
    setSafetyStatus('')
    setSafetyBullets([])
    setPersonnelData({})
    setSectionProgressData([])
    setWeldingProgressData([])
    setOverallProgressData([])
    setWeatherData({})
    setPhotosData({ all: [], byKP: {} })
    setSelectedPhotos([])
  }

  async function aggregateFromReports(reports) {
    const personnel = aggregatePersonnel(reports)
    const sections = aggregateProgressBySection(reports)
    const welding = await aggregateWeldingProgress(summaryDate)
    const overall = aggregateOverallProgress(reports)
    const weather = aggregateWeather(reports)
    const photos = aggregatePhotos(reports)
    const safety = extractSafetyEvents(reports)

    setPersonnelData(personnel)
    setSectionProgressData(sections)
    setWeldingProgressData(welding)
    setOverallProgressData(overall)
    setWeatherData(weather)
    setPhotosData(photos)
    setSelectedPhotos(photos.all.slice(0, 6).map((p, i) => p.photo_url || i))
    setSummaryData(prev => ({
      ...prev,
      safety_events: safety,
      swa_events: safety.swa_count,
      chain_up_required: safety.chain_up_required
    }))
  }

  async function generateAINarrative() {
    if (sourceReports.length === 0) {
      alert('No approved reports found for this date')
      return
    }

    setGeneratingNarrative(true)
    try {
      const keyFocus = await generateKeyFocusNarrative(sourceReports, {
        personnel: personnelData,
        welding: weldingProgress,
        safety: summaryData?.safety_events || {}
      })
      
      setKeyFocusNarrative(keyFocus.narrative)
      setKeyFocusBullets(keyFocus.bullets)

      const safety = await generateSafetyStatus(
        summaryData?.safety_events || { swa_count: 0, hazards: [], chain_up_required: false },
        weatherData
      )
      
      setSafetyStatus(safety.status)
      setSafetyBullets(safety.bullets)
    } catch (err) {
      console.error('Error generating AI narrative:', err)
      alert('Error generating narrative. Please try again.')
    }
    setGeneratingNarrative(false)
  }

  async function saveSummaryReport() {
    setSaving(true)
    try {
      const summaryPayload = {
        report_date: summaryDate,
        project_name: 'Eagle Mountain Pipeline Project',
        contractor: 'SMJV',
        reported_by: userProfile?.full_name || userProfile?.email,
        reported_by_id: userProfile?.id,
        weather_description: weatherData.description,
        temp_high_f: weatherData.temp_high_f,
        temp_low_f: weatherData.temp_low_f,
        precipitation_mm: weatherData.precipitation_mm,
        humidity_pct: weatherData.humidity_pct,
        wind_speed_kmh: weatherData.wind_speed_kmh,
        key_focus_narrative: keyFocusNarrative,
        key_focus_bullets: keyFocusBullets,
        safety_status: safetyStatus,
        safety_bullets: safetyBullets,
        personnel_onsite: personnelData,
        swa_events: summaryData?.swa_events || 0,
        chain_up_required: summaryData?.chain_up_required || false,
        avalanche_risk_level: 'OPEN',
        status: 'draft'
      }

      const result = await saveDailySummary(summaryPayload)
      if (!result.success) throw new Error(result.error)

      const summaryId = result.data.id
      await saveSectionProgress(summaryId, summaryDate, sectionProgress)
      await saveWeldingProgress(summaryId, summaryDate, weldingProgress)
      
      const photosToSave = photosData.all.filter(p => selectedPhotos.includes(p.photo_url || p.id))
      await saveReportPhotos(summaryId, summaryDate, photosToSave)

      alert(result.isNew ? 'Daily Summary Report created!' : 'Daily Summary Report updated!')
      await loadSummaryForDate()
    } catch (err) {
      console.error('Error saving summary:', err)
      alert('Error saving report: ' + err.message)
    }
    setSaving(false)
  }

  async function publishSummaryReport() {
    if (!confirm('Publish this Daily Summary Report?')) return
    
    setSaving(true)
    try {
      await saveSummaryReport()
      
      const { error } = await supabase
        .from('daily_construction_summary')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('report_date', summaryDate)

      if (error) throw error
      alert('Report published successfully!')
      await loadSummaryForDate()
    } catch (err) {
      console.error('Error publishing:', err)
      alert('Error publishing report')
    }
    setSaving(false)
  }

  // Export to PDF (EGP format)
  function exportToPDF() {
    const doc = new jsPDF('p', 'mm', 'letter')
    const pageWidth = 215.9
    const margin = 15
    let y = 15

    // Header
    doc.setFillColor(26, 95, 42)
    doc.rect(0, 0, pageWidth, 20, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('EAGLE MOUNTAIN – WOODFIBRE GAS PIPELINE PROJECT', margin, 13)
    doc.setFontSize(8)
    doc.text('DAILY CONSTRUCTION SUMMARY REPORT (EGP)', pageWidth - margin - 60, 13)

    y = 28
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    
    // Report info
    doc.text(`Report Date: ${formatDateForDisplay(summaryDate)}`, margin, y)
    doc.text(`Report Number: ${summaryDate.replace(/-/g, '')}DPR`, margin + 80, y)
    y += 6
    doc.text(`Contractor: SMJV`, margin, y)
    doc.text(`Reported By: ${userProfile?.full_name || 'Chief Inspector'}`, margin + 80, y)

    // Section 1 Header
    y += 12
    doc.setFillColor(26, 95, 42)
    doc.rect(margin, y - 4, pageWidth - (margin * 2), 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.text('SECTION 1 - SUMMARY', margin + 3, y + 1)

    // Key Focus
    y += 12
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.text('Key Focus of the Day', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)

    keyFocusBullets.forEach(bullet => {
      const text = bullet.replace(/^<\s*/, '• ')
      const lines = doc.splitTextToSize(text, pageWidth - (margin * 2) - 5)
      lines.forEach(line => {
        if (y > 260) {
          doc.addPage()
          y = 20
        }
        doc.text(line, margin + 3, y)
        y += 4.5
      })
    })

    // Personnel
    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Personnel Onsite', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    
    const personnelRows = [
      ['Prime Resources', personnelData.prime_resources || 0],
      ['Inspectors', personnelData.decca_inspector || 0],
      ['Environmental', personnelData.env_inspector || 0],
      ['Engineering', personnelData.engineering || 0],
      ['Total Site Exposure (hrs)', Math.round(personnelData.total_site_exposure || 0)]
    ]
    
    personnelRows.forEach(row => {
      doc.text(`${row[0]}: ${row[1]}`, margin + 3, y)
      y += 4.5
    })

    // Weather
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.text('Daily Weather', margin + 90, y - (personnelRows.length * 4.5) - 5)
    doc.setFont('helvetica', 'normal')
    doc.text(`High: ${weatherData.temp_high_f || 'N/A'}°F  Low: ${weatherData.temp_low_f || 'N/A'}°F`, margin + 93, y - (personnelRows.length * 4.5))
    doc.text(`Precipitation: ${weatherData.precipitation_mm || 0} mm`, margin + 93, y - (personnelRows.length * 4.5) + 4.5)
    doc.text(`Wind: ${weatherData.wind_speed_kmh || 0} km/h`, margin + 93, y - (personnelRows.length * 4.5) + 9)

    // Safety Status
    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Safety Status', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    
    safetyBullets.forEach(bullet => {
      const text = bullet.replace(/^<\s*/, '• ')
      const lines = doc.splitTextToSize(text, pageWidth - (margin * 2) - 5)
      lines.forEach(line => {
        if (y > 260) {
          doc.addPage()
          y = 20
        }
        doc.text(line, margin + 3, y)
        y += 4.5
      })
    })

    // Section 2 Header
    y += 10
    if (y > 240) {
      doc.addPage()
      y = 20
    }
    doc.setFillColor(26, 95, 42)
    doc.rect(margin, y - 4, pageWidth - (margin * 2), 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('SECTION 2 - PROGRESS', margin + 3, y + 1)

    // Welding Progress
    y += 12
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.text('Welding Progress', margin, y)
    y += 6
    
    // Welding table header
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y - 3, pageWidth - (margin * 2), 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('Weld Type', margin + 2, y)
    doc.text('Today (m)', margin + 70, y)
    doc.text('Previous (m)', margin + 95, y)
    doc.text('Total (m)', margin + 125, y)
    doc.text('Repairs', margin + 155, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    weldingProgress.forEach(weld => {
      doc.text(weld.weld_type || '', margin + 2, y)
      doc.text(String(weld.today_lm || 0), margin + 70, y)
      doc.text(String(weld.previous_lm || 0), margin + 95, y)
      doc.text(String((weld.today_lm || 0) + (weld.previous_lm || 0)), margin + 125, y)
      doc.text(String((weld.repairs_today || 0) + (weld.repairs_previous || 0)), margin + 155, y)
      y += 4.5
    })

    // Repair Rate
    y += 3
    const repairRate = calculateRepairRate(weldingProgress)
    doc.setFont('helvetica', 'bold')
    doc.text(`Repair Rate: ${repairRate}%`, margin + 2, y)

    // Footer
    y = 270
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 5
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y)
    doc.text('Page 1 of 1', pageWidth - margin - 20, y)

    // Save
    doc.save(`${summaryDate}_Construction_Summary_Report.pdf`)
  }

  // Helper functions
  const formatDateTime = (dateStr) => dateStr ? new Date(dateStr).toLocaleString() : ''
  const getKPRange = (activities) => {
    if (!activities || activities.length === 0) return '-'
    const starts = activities.map(a => a.startKP).filter(Boolean)
    const ends = activities.map(a => a.endKP).filter(Boolean)
    if (starts.length === 0 && ends.length === 0) return '-'
    return starts[0] + ' - ' + ends[ends.length - 1]
  }

  const formatDateForDisplay = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  const togglePhotoSelection = (photoId) => {
    setSelectedPhotos(prev => {
      if (prev.includes(photoId)) return prev.filter(id => id !== photoId)
      else if (prev.length < 6) return [...prev, photoId]
      else { alert('Maximum 6 photos'); return prev }
    })
  }

  const addKeyFocusBullet = () => setKeyFocusBullets([...keyFocusBullets, '< '])
  const removeKeyFocusBullet = (index) => setKeyFocusBullets(keyFocusBullets.filter((_, i) => i !== index))
  const updateKeyFocusBullet = (index, value) => {
    const updated = [...keyFocusBullets]
    updated[index] = value
    setKeyFocusBullets(updated)
  }

  const addSafetyBullet = () => setSafetyBullets([...safetyBullets, '< '])
  const removeSafetyBullet = (index) => setSafetyBullets(safetyBullets.filter((_, i) => i !== index))
  const updateSafetyBullet = (index, value) => {
    const updated = [...safetyBullets]
    updated[index] = value
    setSafetyBullets(updated)
  }

  // =============================================
  // RENDER
  // =============================================
  if (loading && activeTab === 'review') {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#1a5f2a', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>Chief Inspector Dashboard</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>{userProfile?.full_name || userProfile?.email}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => navigate('/inspector')} style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>New Report</button>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 20px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Dashboard</button>
          <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #ddd', padding: '0 30px' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          <button
            onClick={() => setActiveTab('review')}
            style={{
              padding: '15px 30px',
              backgroundColor: activeTab === 'review' ? '#fff' : '#f8f9fa',
              border: 'none',
              borderBottom: activeTab === 'review' ? '3px solid #1a5f2a' : '3px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'review' ? 'bold' : 'normal',
              fontSize: '16px'
            }}
          >
            📋 Report Review
            {pendingReports.length > 0 && (
              <span style={{ marginLeft: '8px', backgroundColor: '#ffc107', color: '#000', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                {pendingReports.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('summary'); loadSummaryForDate() }}
            style={{
              padding: '15px 30px',
              backgroundColor: activeTab === 'summary' ? '#fff' : '#f8f9fa',
              border: 'none',
              borderBottom: activeTab === 'summary' ? '3px solid #1a5f2a' : '3px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'summary' ? 'bold' : 'normal',
              fontSize: '16px'
            }}
          >
            📊 Daily Summary Report
          </button>
        </div>
      </div>

      {/* REVIEW TAB CONTENT */}
      {activeTab === 'review' && (
        <div style={{ padding: '30px' }}>
          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
            <div style={{ backgroundColor: '#d4edda', padding: '25px', borderRadius: '8px', textAlign: 'center', border: '1px solid #28a745' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#155724', fontSize: '14px' }}>APPROVED THIS WEEK</h3>
              <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#155724' }}>{stats.approvedThisWeek}</p>
            </div>
            <div style={{ backgroundColor: '#f8d7da', padding: '25px', borderRadius: '8px', textAlign: 'center', border: '1px solid #dc3545' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#721c24', fontSize: '14px' }}>RETURNED FOR REVISION</h3>
              <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#721c24' }}>{stats.rejectedThisWeek}</p>
            </div>
            <div style={{ backgroundColor: '#e7f3ff', padding: '25px', borderRadius: '8px', textAlign: 'center', border: '1px solid #007bff' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#004085', fontSize: '14px' }}>TOTAL REVIEWED</h3>
              <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#004085' }}>{stats.reviewedThisWeek}</p>
            </div>
          </div>

          {/* Pending Reports Table */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
            <div style={{ backgroundColor: '#ffc107', padding: '15px 20px', borderRadius: '8px 8px 0 0' }}>
              <h2 style={{ margin: 0, color: '#000', fontSize: '18px' }}>Reports Awaiting Your Review</h2>
            </div>
            {pendingReports.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p style={{ fontSize: '18px', margin: 0 }}>✅ All caught up! No reports pending.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Inspector</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Spread</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Activities</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>KP Range</th>
                    <th style={{ padding: '15px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingReports.map(report => (
                    <tr key={report.report_id}>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>{report.ticket?.date}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.submitted_by_name || report.ticket?.inspector_name}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.ticket?.spread || '-'}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{(report.ticket?.activity_blocks || []).map(b => b.activityType).filter(Boolean).join(', ') || '-'}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontFamily: 'monospace', color: '#28a745' }}>{getKPRange(report.ticket?.activity_blocks)}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                        <button onClick={() => navigate(`/report?id=${report.ticket?.id || report.report_id}`)} style={{ padding: '8px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '8px' }}>View</button>
                        <button onClick={() => acceptReport(report.report_id)} style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '8px', fontWeight: 'bold' }}>Accept</button>
                        <button onClick={() => openRejectModal(report)} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Rejected Reports */}
          {rejectedReports.length > 0 && (
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
              <div style={{ backgroundColor: '#dc3545', padding: '15px 20px', borderRadius: '8px 8px 0 0' }}>
                <h2 style={{ margin: 0, color: 'white', fontSize: '18px' }}>Returned for Revision</h2>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Inspector</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rejectedReports.map(report => (
                    <tr key={report.report_id}>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.ticket?.date}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.submitted_by_name || report.ticket?.inspector_name}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', color: '#dc3545', fontStyle: 'italic' }}>"{report.revision_notes}"</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Approved Reports */}
          {approvedReports.length > 0 && (
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <div style={{ backgroundColor: '#28a745', padding: '15px 20px', borderRadius: '8px 8px 0 0' }}>
                <h2 style={{ margin: 0, color: 'white', fontSize: '18px' }}>Recently Approved</h2>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Inspector</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Activities</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Approved On</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedReports.map(report => (
                    <tr key={report.report_id}>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.ticket?.date}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.submitted_by_name || report.ticket?.inspector_name}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{(report.ticket?.activity_blocks || []).map(b => b.activityType).filter(Boolean).join(', ') || '-'}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontSize: '12px', color: '#666' }}>{formatDateTime(report.reviewed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DAILY SUMMARY TAB CONTENT */}
      {activeTab === 'summary' && (
        <div style={{ padding: '30px' }}>
          {/* Date Selector & Actions */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Report Date:</label>
                <input
                  type="date"
                  value={summaryDate}
                  onChange={(e) => setSummaryDate(e.target.value)}
                  style={{ padding: '10px', fontSize: '16px', border: '1px solid #ced4da', borderRadius: '4px' }}
                />
              </div>
              <button onClick={loadSummaryForDate} disabled={summaryLoading} style={{ padding: '10px 25px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {summaryLoading ? '⏳ Loading...' : '🔄 Load Data'}
              </button>
              <button onClick={generateAINarrative} disabled={generatingNarrative || sourceReports.length === 0} style={{ padding: '10px 25px', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {generatingNarrative ? '🤖 Generating...' : '🤖 Generate AI Narrative'}
              </button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                <button onClick={saveSummaryReport} disabled={saving} style={{ padding: '10px 25px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {saving ? '⏳ Saving...' : '💾 Save Draft'}
                </button>
                <button onClick={publishSummaryReport} disabled={saving} style={{ padding: '10px 25px', backgroundColor: '#fd7e14', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  📤 Publish
                </button>
                <button onClick={exportToPDF} style={{ padding: '10px 25px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  📄 Export PDF
                </button>
              </div>
            </div>
            
            <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <span style={{ fontSize: '14px', color: '#666' }}>📅 {formatDateForDisplay(summaryDate)}</span>
              <span style={{ fontSize: '14px', color: '#666' }}>📋 {sourceReports.length} approved inspector report(s)</span>
              {summaryData?.status && (
                <span style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', backgroundColor: summaryData.status === 'published' ? '#d4edda' : '#fff3cd', color: summaryData.status === 'published' ? '#155724' : '#856404' }}>
                  {summaryData.status === 'published' ? '✅ Published' : '📝 Draft'}
                </span>
              )}
            </div>
          </div>

          {summaryLoading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              <p style={{ fontSize: '18px', color: '#666' }}>⏳ Loading report data...</p>
            </div>
          ) : sourceReports.length === 0 && !summaryData ? (
            <div style={{ backgroundColor: '#fff3cd', padding: '30px', borderRadius: '8px', textAlign: 'center' }}>
              <p style={{ fontSize: '18px', color: '#856404', margin: 0 }}>⚠️ No approved inspector reports found for {summaryDate}</p>
              <p style={{ color: '#856404', marginTop: '10px' }}>Approve inspector reports in the Review tab first.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* SECTION 1 - KEY FOCUS */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <div style={{ backgroundColor: '#1a5f2a', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
                  <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>📋 Key Focus of the Day</h3>
                </div>
                <div style={{ padding: '20px' }}>
                  {keyFocusBullets.map((bullet, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                      <input
                        type="text"
                        value={bullet}
                        onChange={(e) => updateKeyFocusBullet(idx, e.target.value)}
                        style={{ flex: 1, padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px' }}
                      />
                      <button onClick={() => removeKeyFocusBullet(idx)} style={{ padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                    </div>
                  ))}
                  <button onClick={addKeyFocusBullet} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}>+ Add Bullet</button>
                </div>
              </div>

              {/* SAFETY STATUS */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <div style={{ backgroundColor: '#dc3545', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
                  <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>🦺 Safety Status</h3>
                </div>
                <div style={{ padding: '20px' }}>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Status Summary:</label>
                    <input
                      type="text"
                      value={safetyStatus}
                      onChange={(e) => setSafetyStatus(e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                      placeholder="Overall safety status..."
                    />
                  </div>
                  {safetyBullets.map((bullet, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                      <input
                        type="text"
                        value={bullet}
                        onChange={(e) => updateSafetyBullet(idx, e.target.value)}
                        style={{ flex: 1, padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px' }}
                      />
                      <button onClick={() => removeSafetyBullet(idx)} style={{ padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                    </div>
                  ))}
                  <button onClick={addSafetyBullet} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}>+ Add Bullet</button>
                </div>
              </div>

              {/* PERSONNEL */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <div style={{ backgroundColor: '#17a2b8', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
                  <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>👷 Personnel Onsite</h3>
                </div>
                <div style={{ padding: '20px' }}>
                  <table style={{ width: '100%', fontSize: '14px' }}>
                    <tbody>
                      {[
                        ['Prime Resources', 'prime_resources'],
                        ['Inspectors (Decca)', 'decca_inspector'],
                        ['Environmental QP', 'env_qp'],
                        ['Engineering', 'engineering'],
                        ['NDT', 'ndt'],
                        ['Safety', 'safety'],
                        ['Survey (Meridian)', 'meridian_survey']
                      ].map(([label, key]) => (
                        <tr key={key}>
                          <td style={{ padding: '8px 0' }}>{label}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                            <input
                              type="number"
                              value={personnelData[key] || 0}
                              onChange={(e) => setPersonnelData({...personnelData, [key]: parseInt(e.target.value) || 0})}
                              style={{ width: '60px', padding: '4px', textAlign: 'right', border: '1px solid #ced4da', borderRadius: '4px' }}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid #1a5f2a' }}>
                        <td style={{ padding: '12px 0', fontWeight: 'bold', color: '#1a5f2a' }}>Total Site Exposure (hrs)</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '18px', color: '#1a5f2a' }}>{Math.round(personnelData.total_site_exposure || 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* WEATHER */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <div style={{ backgroundColor: '#6c757d', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
                  <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>🌤️ Daily Weather</h3>
                </div>
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: '#666' }}>High (°F)</label>
                      <input type="number" value={weatherData.temp_high_f || ''} onChange={(e) => setWeatherData({...weatherData, temp_high_f: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#666' }}>Low (°F)</label>
                      <input type="number" value={weatherData.temp_low_f || ''} onChange={(e) => setWeatherData({...weatherData, temp_low_f: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#666' }}>Precipitation (mm)</label>
                      <input type="number" value={weatherData.precipitation_mm || ''} onChange={(e) => setWeatherData({...weatherData, precipitation_mm: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#666' }}>Wind (km/h)</label>
                      <input type="number" value={weatherData.wind_speed_kmh || ''} onChange={(e) => setWeatherData({...weatherData, wind_speed_kmh: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }} />
                    </div>
                  </div>
                  <div style={{ marginTop: '15px' }}>
                    <label style={{ fontSize: '12px', color: '#666' }}>Conditions</label>
                    <input type="text" value={weatherData.description || ''} onChange={(e) => setWeatherData({...weatherData, description: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }} placeholder="e.g., Clear skies, light snow..." />
                  </div>
                </div>
              </div>

              {/* WELDING PROGRESS - Full Width */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', gridColumn: '1 / -1' }}>
                <div style={{ backgroundColor: '#fd7e14', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
                  <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>🔥 Welding Progress</h3>
                </div>
                <div style={{ padding: '20px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa' }}>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Weld Type</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Today (m)</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Previous (m)</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Total (m)</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Today Welds</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Total Welds</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Repairs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weldingProgress.map((weld, idx) => (
                        <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                          <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>{weld.weld_type}</td>
                          <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{weld.today_lm?.toFixed(1) || 0}</td>
                          <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{weld.previous_lm?.toFixed(1) || 0}</td>
                          <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>{((weld.today_lm || 0) + (weld.previous_lm || 0)).toFixed(1)}</td>
                          <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{weld.today_welds || 0}</td>
                          <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>{(weld.today_welds || 0) + (weld.previous_welds || 0)}</td>
                          <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee', color: '#dc3545' }}>{(weld.repairs_today || 0) + (weld.repairs_previous || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#e9ecef', fontWeight: 'bold' }}>
                        <td style={{ padding: '12px' }}>TOTALS</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{weldingProgress.reduce((sum, w) => sum + (w.today_lm || 0), 0).toFixed(1)}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{weldingProgress.reduce((sum, w) => sum + (w.previous_lm || 0), 0).toFixed(1)}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{weldingProgress.reduce((sum, w) => sum + (w.today_lm || 0) + (w.previous_lm || 0), 0).toFixed(1)}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{weldingProgress.reduce((sum, w) => sum + (w.today_welds || 0), 0)}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{weldingProgress.reduce((sum, w) => sum + (w.today_welds || 0) + (w.previous_welds || 0), 0)}</td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#dc3545' }}>{weldingProgress.reduce((sum, w) => sum + (w.repairs_today || 0) + (w.repairs_previous || 0), 0)}</td>
                      </tr>
                      <tr>
                        <td colSpan="7" style={{ padding: '12px', backgroundColor: '#fff3cd', color: '#856404' }}>
                          <strong>Repair Rate: {calculateRepairRate(weldingProgress)}%</strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* SECTION 2 - PROGRESS (PLANNED vs ACTUAL) - Full Width */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', gridColumn: '1 / -1' }}>
                <div style={{ backgroundColor: '#007bff', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
                  <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>📊 Section 2 - Progress (Planned vs Actual)</h3>
                </div>
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Civil Progress */}
                    <div>
                      <h4 style={{ margin: '0 0 10px 0', color: '#1a5f2a', borderBottom: '2px solid #1a5f2a', paddingBottom: '5px' }}>Civil Progress (lm)</h4>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#e9ecef' }}>
                            <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #dee2e6' }}>Section</th>
                            <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>Daily Plan</th>
                            <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>Daily Actual</th>
                            <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(sectionProgress.filter(s => s.activity_type === 'Civil' || s.Civil?.daily_actual_lm > 0) || []).map((section, idx) => {
                            const planned = section.daily_planned_lm || section.Civil?.daily_planned_lm || 0
                            const actual = section.daily_actual_lm || section.Civil?.daily_actual_lm || 0
                            const delta = actual - planned
                            return (
                              <tr key={idx}>
                                <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{section.section_name}</td>
                                <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>{planned}</td>
                                <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>{actual}</td>
                                <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6', color: delta >= 0 ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
                                  {delta >= 0 ? '+' : ''}{delta}
                                </td>
                              </tr>
                            )
                          })}
                          {sectionProgress.filter(s => s.activity_type === 'Civil' || s.Civil?.daily_actual_lm > 0).length === 0 && (
                            <tr><td colSpan="4" style={{ padding: '15px', textAlign: 'center', color: '#666', border: '1px solid #dee2e6' }}>No civil progress data</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Mechanical Progress */}
                    <div>
                      <h4 style={{ margin: '0 0 10px 0', color: '#fd7e14', borderBottom: '2px solid #fd7e14', paddingBottom: '5px' }}>Mechanical Progress (lm)</h4>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#e9ecef' }}>
                            <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #dee2e6' }}>Section</th>
                            <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>Daily Plan</th>
                            <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>Daily Actual</th>
                            <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(sectionProgress.filter(s => s.activity_type === 'Mechanical' || s.Mechanical?.daily_actual_lm > 0) || []).map((section, idx) => {
                            const planned = section.daily_planned_lm || section.Mechanical?.daily_planned_lm || 0
                            const actual = section.daily_actual_lm || section.Mechanical?.daily_actual_lm || 0
                            const delta = actual - planned
                            return (
                              <tr key={idx}>
                                <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{section.section_name}</td>
                                <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>{planned}</td>
                                <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>{actual}</td>
                                <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6', color: delta >= 0 ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
                                  {delta >= 0 ? '+' : ''}{delta}
                                </td>
                              </tr>
                            )
                          })}
                          {sectionProgress.filter(s => s.activity_type === 'Mechanical' || s.Mechanical?.daily_actual_lm > 0).length === 0 && (
                            <tr><td colSpan="4" style={{ padding: '15px', textAlign: 'center', color: '#666', border: '1px solid #dee2e6' }}>No mechanical progress data</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* TARGET FOR JANUARY - Full Width */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', gridColumn: '1 / -1' }}>
                <div style={{ backgroundColor: '#6f42c1', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
                  <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>🎯 Target for {new Date(summaryDate).toLocaleString('default', { month: 'long' })}</h3>
                </div>
                <div style={{ padding: '20px' }}>
                  <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa' }}>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Activity</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Daily Target</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Daily Actual</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>MTD Actual</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fullProgressData.filter(p => p.total_planned > 0).map((item, idx) => {
                        const dailyTarget = item.daily_planned || 0
                        const dailyActual = item.daily_actual || 0
                        const mtdActual = item.mtd_actual || 0
                        const variance = dailyActual - dailyTarget
                        return (
                          <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                            <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>{item.activity_type}</td>
                            <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{dailyTarget.toLocaleString()} lm</td>
                            <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee', fontWeight: 'bold', color: dailyActual > 0 ? '#28a745' : '#666' }}>{dailyActual.toLocaleString()} lm</td>
                            <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{mtdActual.toLocaleString()} lm</td>
                            <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee', color: variance >= 0 ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
                              {variance >= 0 ? '+' : ''}{variance.toLocaleString()}
                            </td>
                          </tr>
                        )
                      })}
                      {fullProgressData.filter(p => p.total_planned > 0).length === 0 && (
                        <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No baseline data found. Check project_baselines table.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* PROGRESS TO DATE - Full Width */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', gridColumn: '1 / -1' }}>
                <div style={{ backgroundColor: '#20c997', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
                  <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>📈 Progress to Date</h3>
                </div>
                <div style={{ padding: '20px' }}>
                  <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa' }}>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '25%' }}>Activity</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Total Planned</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Completed</th>
                        <th style={{ padding: '10px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Remaining</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '30%' }}>% Complete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fullProgressData.filter(p => p.total_planned > 0).map((item, idx) => {
                        const completed = item.completed_to_date || 0
                        const total = item.total_planned || 0
                        const remaining = item.remaining || (total - completed)
                        const pct = parseFloat(item.percent_complete) || 0
                        return (
                          <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                            <td style={{ padding: '10px', borderBottom: '1px solid #eee', fontWeight: '500' }}>{item.activity_type}</td>
                            <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{total.toLocaleString()} lm</td>
                            <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee', color: completed > 0 ? '#28a745' : '#666', fontWeight: 'bold' }}>{completed.toLocaleString()}</td>
                            <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #eee', color: '#dc3545' }}>{remaining.toLocaleString()}</td>
                            <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ flex: 1, backgroundColor: '#e9ecef', borderRadius: '10px', height: '20px', overflow: 'hidden' }}>
                                  <div style={{ 
                                    width: `${Math.min(pct, 100)}%`, 
                                    height: '100%', 
                                    backgroundColor: pct >= 90 ? '#28a745' : pct >= 50 ? '#ffc107' : '#17a2b8',
                                    borderRadius: '10px',
                                    transition: 'width 0.3s ease'
                                  }}></div>
                                </div>
                                <span style={{ fontSize: '12px', fontWeight: 'bold', minWidth: '40px' }}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      {fullProgressData.filter(p => p.total_planned > 0).length === 0 && (
                        <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No baseline data found. Check project_baselines table.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* PHOTOS - Full Width */}
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', gridColumn: '1 / -1' }}>
                <div style={{ backgroundColor: '#28a745', padding: '12px 20px', borderRadius: '8px 8px 0 0' }}>
                  <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>📷 Report Photos (Select up to 6)</h3>
                </div>
                <div style={{ padding: '20px' }}>
                  {photosData.all.length === 0 ? (
                    <p style={{ color: '#666', textAlign: 'center' }}>No photos found in inspector reports for this date.</p>
                  ) : (
                    <>
                      <p style={{ marginBottom: '15px', color: '#666' }}>Selected: {selectedPhotos.length}/6 photos</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                        {photosData.all.map((photo, idx) => {
                          const photoId = photo.photo_url || photo.id || idx
                          const isSelected = selectedPhotos.includes(photoId)
                          return (
                            <div
                              key={idx}
                              onClick={() => togglePhotoSelection(photoId)}
                              style={{
                                border: isSelected ? '3px solid #28a745' : '1px solid #ddd',
                                borderRadius: '8px',
                                padding: '10px',
                                cursor: 'pointer',
                                backgroundColor: isSelected ? '#d4edda' : '#fff'
                              }}
                            >
                              {photo.photo_url ? (
                                <img src={photo.photo_url} alt={photo.description} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px' }} />
                              ) : (
                                <div style={{ width: '100%', height: '120px', backgroundColor: '#e9ecef', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                                  📷 No Preview
                                </div>
                              )}
                              <p style={{ fontSize: '11px', margin: '8px 0 0 0', color: '#333' }}>{photo.description || 'No description'}</p>
                              <p style={{ fontSize: '10px', margin: '4px 0 0 0', color: '#666' }}>📍 {photo.kp_location || 'Unknown KP'}</p>
                              {photo.latitude && photo.longitude && (
                                <p style={{ fontSize: '9px', margin: '2px 0 0 0', color: '#999' }}>
                                  {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
                                  {photo.direction_deg && ` | ${photo.direction_deg}°`}
                                  {photo.accuracy_m && ` | ±${photo.accuracy_m}m`}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '30px', maxWidth: '500px', width: '90%' }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#dc3545' }}>Reject Report</h2>
            <p style={{ color: '#666', marginBottom: '15px' }}>Report from <strong>{rejectingReport?.ticket?.inspector_name}</strong> on <strong>{rejectingReport?.ticket?.date}</strong></p>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>Reason for rejection:</label>
            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain what needs to be corrected..." style={{ width: '100%', height: '120px', padding: '12px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px' }} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRejectModal(false)} style={{ padding: '12px 24px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitRejection} style={{ padding: '12px 24px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Send Back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChiefDashboard
