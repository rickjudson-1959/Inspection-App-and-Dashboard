import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'
import jsPDF from 'jspdf'
import MasterSwitcher from './MasterSwitcher.jsx'
import ShadowAuditDashboard from './ShadowAuditDashboard.jsx'

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

// ============================================================================
// CHIEF DASHBOARD - REGULATORY SUMMARY ENGINE v2.0
// January 2026 - Pipe-Up Pipeline Inspector SaaS
// 
// TABS:
// 1. Report Review (original)
// 2. Daily Summary Report (original) 
// 3. NDT Monitoring (NEW) - Repair rates and welder flagging
// 4. Regulatory/Auditor View (NEW) - Read-only disagreement log
// 5. Photo Gallery (NEW) - Geotagged photos with direction/accuracy
// 6. Personnel Summary (NEW) - Site exposure breakdown
// ============================================================================

function ChiefDashboard() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  
  // Tab state - now includes new tabs
  const [activeTab, setActiveTab] = useState('review')
  
  // =============================================
  // REVIEW TAB STATE (original)
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
  // DAILY SUMMARY TAB STATE (original)
  // =============================================
  const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [generatingNarrative, setGeneratingNarrative] = useState(false)
  const [summaryData, setSummaryData] = useState(null)
  const [sourceReports, setSourceReports] = useState([])
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  
  // Editable fields (original)
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
  const [fullProgressData, setFullProgressData] = useState([])

  // =============================================
  // NEW: NDT MONITORING STATE
  // =============================================
  const [ndtStats, setNdtStats] = useState({
    totalWelds: 0,
    totalRepairs: 0,
    repairRate: 0,
    targetRate: 6.5,
    welderStats: []
  })
  const [ndtLoading, setNdtLoading] = useState(false)

  // =============================================
  // NEW: AUDITOR VIEW STATE
  // =============================================
  const [auditDisagreements, setAuditDisagreements] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)

  // =============================================
  // NEW: GEOTAGGED GALLERY STATE
  // =============================================
  const [galleryPhotos, setGalleryPhotos] = useState([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [selectedGalleryPhoto, setSelectedGalleryPhoto] = useState(null)

  // =============================================
  // NEW: PERSONNEL SUMMARY STATE
  // =============================================
  const [personnelSummary, setPersonnelSummary] = useState({
    totalExposure: 0,
    inspectorBreakdown: [],
    individualInspectors: []
  })
  const [personnelLoading, setPersonnelLoading] = useState(false)

  // =============================================
  // LIFECYCLE
  // =============================================
  useEffect(() => { fetchAllData() }, [])
  
  useEffect(() => {
    // Load data when switching to new tabs
    if (activeTab === 'ndt') fetchNDTStats()
    if (activeTab === 'regulatory') fetchAuditDisagreements()
    if (activeTab === 'gallery') fetchGalleryPhotos()
    if (activeTab === 'personnel') fetchPersonnelSummary()
  }, [activeTab])

  // =============================================
  // REVIEW TAB FUNCTIONS (original - preserved)
  // =============================================
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
  // DAILY SUMMARY TAB FUNCTIONS (original - preserved)
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
    const welding = await aggregateWeldingProgress(summaryDate, reports)
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

  // Export to PDF (EGP format) - preserved from original
  function exportToPDF() {
    const doc = new jsPDF('p', 'mm', 'letter')
    const pageWidth = 215.9
    const margin = 15
    let y = 15

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
    
    doc.text(`Report Date: ${formatDateForDisplay(summaryDate)}`, margin, y)
    doc.text(`Report Number: ${summaryDate.replace(/-/g, '')}DPR`, margin + 80, y)
    y += 6
    doc.text(`Contractor: SMJV`, margin, y)
    doc.text(`Reported By: ${userProfile?.full_name || 'Chief Inspector'}`, margin + 80, y)

    y += 12
    doc.setFillColor(26, 95, 42)
    doc.rect(margin, y - 4, pageWidth - (margin * 2), 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.text('SECTION 1 - SUMMARY', margin + 3, y + 1)

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
        if (y > 260) { doc.addPage(); y = 20 }
        doc.text(line, margin + 3, y)
        y += 4.5
      })
    })

    y = 270
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 5
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y)
    doc.text('Page 1 of 1', pageWidth - margin - 20, y)

    doc.save(`${summaryDate}_Construction_Summary_Report.pdf`)
  }

  // =============================================
  // NEW: NDT MONITORING FUNCTIONS
  // =============================================
  async function fetchNDTStats() {
    setNdtLoading(true)
    try {
      // Fetch from weld_book table
      const { data: weldData } = await supabase
        .from('weld_book')
        .select('weld_number, welder_id, welder_name, nde_status, repair_count')
      
      const welderMap = {}
      let totalWelds = 0
      let totalRepairs = 0
      
      for (const weld of (weldData || [])) {
        totalWelds++
        const repairs = weld.repair_count || (weld.nde_status === 'repair' ? 1 : 0)
        if (repairs > 0) totalRepairs += repairs
        
        const welderKey = weld.welder_id || weld.welder_name || 'Unknown'
        if (!welderMap[welderKey]) {
          welderMap[welderKey] = { name: weld.welder_name || welderKey, welds: 0, repairs: 0 }
        }
        welderMap[welderKey].welds++
        welderMap[welderKey].repairs += repairs
      }
      
      const repairRate = totalWelds > 0 ? (totalRepairs / totalWelds * 100) : 0
      const welderStats = Object.values(welderMap)
        .map(w => ({ ...w, rate: w.welds > 0 ? (w.repairs / w.welds * 100) : 0 }))
        .sort((a, b) => b.rate - a.rate)
      
      setNdtStats({ totalWelds, totalRepairs, repairRate, targetRate: 6.5, welderStats })
    } catch (err) {
      console.error('Error fetching NDT stats:', err)
    }
    setNdtLoading(false)
  }

  // =============================================
  // NEW: AUDITOR VIEW FUNCTIONS
  // =============================================
  async function fetchAuditDisagreements() {
    setAuditLoading(true)
    try {
      const { data: disagreements } = await supabase
        .from('ndt_inspections')
        .select('id, weld_id, inspection_number, method, inspection_date, technician_name, interpretation_result, interpretation_agree, comments')
        .eq('interpretation_agree', false)
        .order('inspection_date', { ascending: false })
      
      const enriched = []
      for (const d of (disagreements || [])) {
        let weldDetails = null
        if (d.weld_id) {
          const { data: weld } = await supabase
            .from('weld_book')
            .select('weld_number, welder_name, pipe_diameter, wall_thickness, kp')
            .eq('id', d.weld_id)
            .single()
          weldDetails = weld
        }
        enriched.push({ ...d, weldDetails })
      }
      
      setAuditDisagreements(enriched)
    } catch (err) {
      console.error('Error fetching audit disagreements:', err)
    }
    setAuditLoading(false)
  }

  // =============================================
  // NEW: GEOTAGGED GALLERY FUNCTIONS
  // =============================================
  async function fetchGalleryPhotos() {
    setGalleryLoading(true)
    try {
      const { data: tickets } = await supabase
        .from('daily_tickets')
        .select('id, date, inspector_name, activity_blocks, photos')
        .order('date', { ascending: false })
        .limit(50)
      
      const photos = []
      for (const ticket of (tickets || [])) {
        const blocks = ticket.activity_blocks || []
        for (const block of blocks) {
          if (block.photos?.length > 0) {
            for (const photo of block.photos) {
              if (photo.latitude || photo.location?.latitude) {
                photos.push({
                  id: photo.id || `${ticket.id}_${photos.length}`,
                  url: photo.url || photo.path,
                  thumbnail: photo.thumbnail || photo.url,
                  latitude: photo.latitude || photo.location?.latitude,
                  longitude: photo.longitude || photo.location?.longitude,
                  direction: photo.direction || photo.direction_deg || photo.heading,
                  accuracy: photo.accuracy || photo.accuracy_m || photo.location?.accuracy,
                  timestamp: photo.timestamp,
                  caption: photo.caption || photo.description,
                  ticketDate: ticket.date,
                  inspector: ticket.inspector_name,
                  activity: block.activityType,
                  kp: block.startKP
                })
              }
            }
          }
        }
      }
      setGalleryPhotos(photos)
    } catch (err) {
      console.error('Error fetching gallery photos:', err)
    }
    setGalleryLoading(false)
  }

  // =============================================
  // NEW: PERSONNEL SUMMARY FUNCTIONS
  // =============================================
  async function fetchPersonnelSummary() {
    setPersonnelLoading(true)
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data: tickets } = await supabase
        .from('daily_tickets')
        .select('id, date, personnel, inspector_name, spread')
        .gte('date', thirtyDaysAgo)
      
      let totalExposure = 0
      const inspectorMap = {}
      const categoryMap = { Decca: 0, Environmental: 0, Engineering: 0, Safety: 0, 'QA/QC': 0, Welding: 0, Other: 0 }
      
      for (const ticket of (tickets || [])) {
        const personnel = ticket.personnel?.entries || []
        for (const person of personnel) {
          totalExposure++
          const category = categorizeInspector(person.role || person.company || person.discipline)
          categoryMap[category] = (categoryMap[category] || 0) + 1
          
          const key = person.name || person.inspector_name || 'Unknown'
          if (!inspectorMap[key]) {
            inspectorMap[key] = { name: key, company: person.company, role: person.role, days: 0, lastSeen: null }
          }
          inspectorMap[key].days++
          if (!inspectorMap[key].lastSeen || ticket.date > inspectorMap[key].lastSeen) {
            inspectorMap[key].lastSeen = ticket.date
          }
        }
      }
      
      const inspectorBreakdown = Object.entries(categoryMap)
        .map(([category, count]) => ({ category, count }))
        .filter(c => c.count > 0)
        .sort((a, b) => b.count - a.count)
      
      const individualInspectors = Object.values(inspectorMap).sort((a, b) => b.days - a.days).slice(0, 20)
      
      setPersonnelSummary({ totalExposure, inspectorBreakdown, individualInspectors })
    } catch (err) {
      console.error('Error fetching personnel summary:', err)
    }
    setPersonnelLoading(false)
  }

  function categorizeInspector(roleOrCompany) {
    if (!roleOrCompany) return 'Other'
    const lower = roleOrCompany.toLowerCase()
    if (lower.includes('decca') || lower.includes('chief') || lower.includes('pipeline')) return 'Decca'
    if (lower.includes('env') || lower.includes('wildlife') || lower.includes('erosion')) return 'Environmental'
    if (lower.includes('eng') || lower.includes('design') || lower.includes('fortis')) return 'Engineering'
    if (lower.includes('safety') || lower.includes('hse') || lower.includes('sso')) return 'Safety'
    if (lower.includes('qa') || lower.includes('qc') || lower.includes('quality')) return 'QA/QC'
    if (lower.includes('weld') || lower.includes('nde') || lower.includes('ndt') || lower.includes('x-ray')) return 'Welding'
    return 'Other'
  }

  // =============================================
  // HELPER FUNCTIONS
  // =============================================
  const formatDateTime = (dateStr) => dateStr ? new Date(dateStr).toLocaleString() : ''
  const formatDateForDisplay = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }
  const getKPRange = (activities) => {
    if (!activities || activities.length === 0) return '-'
    const starts = activities.map(a => a.startKP).filter(Boolean)
    const ends = activities.map(a => a.endKP).filter(Boolean)
    if (starts.length === 0 && ends.length === 0) return '-'
    return starts[0] + ' - ' + ends[ends.length - 1]
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
  // STYLES
  // =============================================
  const tabButtonStyle = (isActive) => ({
    padding: '15px 20px',
    backgroundColor: isActive ? '#fff' : '#f8f9fa',
    border: 'none',
    borderBottom: isActive ? '3px solid #1a5f2a' : '3px solid transparent',
    cursor: 'pointer',
    fontWeight: isActive ? 'bold' : 'normal',
    fontSize: '14px',
    whiteSpace: 'nowrap'
  })

  const cardStyle = { backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '20px', overflow: 'hidden' }
  const cardHeaderStyle = (color) => ({ backgroundColor: color, padding: '15px 20px', color: color === '#ffc107' ? '#000' : 'white' })
  const tableStyle = { width: '100%', borderCollapse: 'collapse' }
  const thStyle = { padding: '12px 15px', textAlign: 'left', borderBottom: '1px solid #ddd', backgroundColor: '#f8f9fa', fontSize: '12px', fontWeight: 'bold' }
  const tdStyle = { padding: '12px 15px', borderBottom: '1px solid #eee', fontSize: '14px' }

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
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>{userProfile?.full_name || userProfile?.email} • Regulatory Summary Engine v2.0</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Only show GOD MODE for super_admin */}
          {(userProfile?.role === 'super_admin' || userProfile?.user_role === 'super_admin') && (
            <MasterSwitcher compact />
          )}
          <button onClick={() => navigate('/chief-summary')} style={{ padding: '10px 16px', backgroundColor: '#fd7e14', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>📊 EGP Summary Report</button>
          <button onClick={() => navigate('/inspector-invoicing')} style={{ padding: '10px 16px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>💰 Inspector Invoicing</button>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>📊 View CMT Stats</button>
          <button onClick={() => navigate('/auditor-dashboard')} style={{ padding: '10px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🔬 NDT Queue</button>
          <button onClick={() => { localStorage.removeItem('pipeup_inspector_draft'); navigate('/inspector') }} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ New Report</button>
          <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {/* Tab Navigation - Now includes new tabs */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #ddd', padding: '0 20px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: '0', minWidth: 'max-content' }}>
          <button onClick={() => setActiveTab('review')} style={tabButtonStyle(activeTab === 'review')}>
            📋 Report Review
            {pendingReports.length > 0 && <span style={{ marginLeft: '8px', backgroundColor: '#ffc107', color: '#000', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{pendingReports.length}</span>}
          </button>
          <button onClick={() => { setActiveTab('summary'); loadSummaryForDate() }} style={tabButtonStyle(activeTab === 'summary')}>📊 Daily Summary</button>
          <button onClick={() => setActiveTab('ndt')} style={tabButtonStyle(activeTab === 'ndt')}>🔬 NDT Monitoring</button>
          <button onClick={() => setActiveTab('regulatory')} style={tabButtonStyle(activeTab === 'regulatory')}>📋 Auditor View</button>
          <button onClick={() => setActiveTab('gallery')} style={tabButtonStyle(activeTab === 'gallery')}>📷 Photo Gallery</button>
          <button onClick={() => setActiveTab('personnel')} style={tabButtonStyle(activeTab === 'personnel')}>👷 Personnel</button>
          <button onClick={() => setActiveTab('efficiency')} style={tabButtonStyle(activeTab === 'efficiency')}>📊 Efficiency</button>
        </div>
      </div>

      {/* ============ REVIEW TAB ============ */}
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

          {/* Pending Reports */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#ffc107')}><h2 style={{ margin: 0, fontSize: '18px' }}>Reports Awaiting Your Review</h2></div>
            {pendingReports.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}><p style={{ fontSize: '18px', margin: 0 }}>✅ All caught up! No reports pending.</p></div>
            ) : (
              <table style={tableStyle}>
                <thead><tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={thStyle}>Date</th><th style={thStyle}>Inspector</th><th style={thStyle}>Spread</th>
                  <th style={thStyle}>Activities</th><th style={thStyle}>KP Range</th><th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                </tr></thead>
                <tbody>
                  {pendingReports.map(report => (
                    <tr key={report.report_id}>
                      <td style={{ ...tdStyle, fontWeight: 'bold' }}>{report.ticket?.date}</td>
                      <td style={tdStyle}>{report.submitted_by_name || report.ticket?.inspector_name}</td>
                      <td style={tdStyle}>{report.ticket?.spread || '-'}</td>
                      <td style={{ ...tdStyle, fontSize: '13px' }}>{(report.ticket?.activity_blocks || []).map(b => b.activityType).filter(Boolean).join(', ') || '-'}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#28a745' }}>{getKPRange(report.ticket?.activity_blocks)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
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
            <div style={cardStyle}>
              <div style={cardHeaderStyle('#dc3545')}><h2 style={{ margin: 0, fontSize: '18px' }}>Returned for Revision</h2></div>
              <table style={tableStyle}>
                <thead><tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={thStyle}>Date</th><th style={thStyle}>Inspector</th><th style={thStyle}>Reason</th>
                </tr></thead>
                <tbody>
                  {rejectedReports.map(report => (
                    <tr key={report.report_id}>
                      <td style={tdStyle}>{report.ticket?.date}</td>
                      <td style={tdStyle}>{report.submitted_by_name || report.ticket?.inspector_name}</td>
                      <td style={{ ...tdStyle, color: '#dc3545', fontStyle: 'italic' }}>"{report.revision_notes}"</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Approved Reports */}
          {approvedReports.length > 0 && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle('#28a745')}><h2 style={{ margin: 0, fontSize: '18px' }}>Recently Approved</h2></div>
              <table style={tableStyle}>
                <thead><tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={thStyle}>Date</th><th style={thStyle}>Inspector</th><th style={thStyle}>Activities</th><th style={thStyle}>Approved On</th>
                </tr></thead>
                <tbody>
                  {approvedReports.map(report => (
                    <tr key={report.report_id}>
                      <td style={tdStyle}>{report.ticket?.date}</td>
                      <td style={tdStyle}>{report.submitted_by_name || report.ticket?.inspector_name}</td>
                      <td style={{ ...tdStyle, fontSize: '13px' }}>{(report.ticket?.activity_blocks || []).map(b => b.activityType).filter(Boolean).join(', ') || '-'}</td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: '#666' }}>{formatDateTime(report.reviewed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============ DAILY SUMMARY TAB ============ */}
      {activeTab === 'summary' && (
        <div style={{ padding: '30px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Report Date:</label>
                <input type="date" value={summaryDate} onChange={(e) => setSummaryDate(e.target.value)} style={{ padding: '10px', fontSize: '16px', border: '1px solid #ced4da', borderRadius: '4px' }} />
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
                <button onClick={publishSummaryReport} disabled={saving} style={{ padding: '10px 25px', backgroundColor: '#fd7e14', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>📤 Publish</button>
                <button onClick={exportToPDF} style={{ padding: '10px 25px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>📄 Export PDF</button>
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
            <div style={{ textAlign: 'center', padding: '50px' }}><p style={{ fontSize: '18px', color: '#666' }}>⏳ Loading summary data...</p></div>
          ) : (
            <div style={{ padding: '20px' }}>
              {/* Welding Progress */}
              {weldingProgress && weldingProgress.length > 0 && (
                <div style={{ marginBottom: '30px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>🔬 Welding Progress</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#1e3a5f', color: 'white' }}>
                          <th style={{ padding: '10px', textAlign: 'left' }}>Weld Type</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Today (LM)</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Previous (LM)</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Today (Welds)</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Previous (Welds)</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Repairs Today</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Repairs Previous</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weldingProgress.map((weld, idx) => (
                          <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#f8f9fa' : 'white', borderBottom: '1px solid #dee2e6' }}>
                            <td style={{ padding: '10px', fontWeight: 'bold' }}>{weld.weld_type}</td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>{weld.today_lm?.toFixed(1) || '0.0'}</td>
                            <td style={{ padding: '10px', textAlign: 'right', color: '#666' }}>{weld.previous_lm?.toFixed(1) || '0.0'}</td>
                            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{weld.today_welds || 0}</td>
                            <td style={{ padding: '10px', textAlign: 'right', color: '#666' }}>{weld.previous_welds || 0}</td>
                            <td style={{ padding: '10px', textAlign: 'right', color: weld.repairs_today > 0 ? '#dc3545' : '#666', fontWeight: weld.repairs_today > 0 ? 'bold' : 'normal' }}>
                              {weld.repairs_today || 0}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right', color: '#666' }}>{weld.repairs_previous || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Section Progress */}
              {sectionProgress && sectionProgress.length > 0 && (
                <div style={{ marginBottom: '30px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>📊 Section Progress</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#1e3a5f', color: 'white' }}>
                          <th style={{ padding: '10px', textAlign: 'left' }}>Section</th>
                          <th style={{ padding: '10px', textAlign: 'left' }}>Category</th>
                          <th style={{ padding: '10px', textAlign: 'left' }}>Activity</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Metres (LM)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionProgress.map((section, idx) => (
                          Object.entries(section).map(([category, data]) => (
                            (data.activities || []).map((activity, actIdx) => (
                              <tr key={`${idx}-${category}-${actIdx}`} style={{ backgroundColor: actIdx % 2 === 0 ? '#f8f9fa' : 'white', borderBottom: '1px solid #dee2e6' }}>
                                {actIdx === 0 && (
                                  <td rowSpan={(data.activities || []).length} style={{ padding: '10px', fontWeight: 'bold', verticalAlign: 'top' }}>
                                    {section.section || 'Unknown'}
                                  </td>
                                )}
                                {actIdx === 0 && (
                                  <td rowSpan={(data.activities || []).length} style={{ padding: '10px', verticalAlign: 'top' }}>
                                    {category}
                                  </td>
                                )}
                                <td style={{ padding: '10px' }}>{activity.type}</td>
                                <td style={{ padding: '10px', textAlign: 'right' }}>{activity.metres?.toFixed(1) || '0.0'}</td>
                              </tr>
                            ))
                          ))
                        )).flat(2)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Personnel Summary */}
              {personnelData && Object.keys(personnelData).length > 0 && (
                <div style={{ marginBottom: '30px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>👷 Personnel Summary</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                    {Object.entries(personnelData).filter(([key, value]) => key !== 'total_site_exposure' && typeof value === 'number').map(([key, value]) => (
                      <div key={key} style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                        <div style={{ fontSize: '12px', color: '#666', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {personnelData.total_site_exposure && (
                    <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '4px' }}>
                      <strong>Total Site Exposure:</strong> {personnelData.total_site_exposure}
                    </div>
                  )}
                </div>
              )}

              {/* Weather Data */}
              {weatherData && (weatherData.description || weatherData.temp_high_f) && (
                <div style={{ marginBottom: '30px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>🌤️ Weather</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                    {weatherData.description && <div><strong>Conditions:</strong> {weatherData.description}</div>}
                    {weatherData.temp_high_f && <div><strong>High:</strong> {weatherData.temp_high_f}°F</div>}
                    {weatherData.temp_low_f && <div><strong>Low:</strong> {weatherData.temp_low_f}°F</div>}
                    {weatherData.precipitation_mm && <div><strong>Precipitation:</strong> {weatherData.precipitation_mm}mm</div>}
                    {weatherData.wind_speed_kmh && <div><strong>Wind:</strong> {weatherData.wind_speed_kmh} km/h</div>}
                  </div>
                </div>
              )}

              {/* Source Reports Info */}
              {sourceReports.length > 0 && (
                <div style={{ marginBottom: '30px', backgroundColor: '#e7f3ff', padding: '15px', borderRadius: '8px' }}>
                  <strong>📋 Source Reports ({sourceReports.length}):</strong>
                  <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px' }}>
                    {sourceReports.map((report, idx) => (
                      <li key={report.id} style={{ marginBottom: '5px' }}>
                        Report ID {report.id} - {report.inspector_name} - {report.spread || 'Unknown Spread'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Debug Info (can be removed later) */}
              {process.env.NODE_ENV === 'development' && (
                <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px', fontSize: '12px' }}>
                  <strong>Debug Info:</strong>
                  <pre style={{ marginTop: '10px', fontSize: '11px', overflow: 'auto' }}>
                    Welding Progress: {JSON.stringify(weldingProgress, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============ NDT MONITORING TAB (NEW) ============ */}
      {activeTab === 'ndt' && (
        <div style={{ padding: '30px' }}>
          {ndtLoading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}><p>Loading NDT data...</p></div>
          ) : (
            <>
              {/* Repair Rate Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
                <div style={{
                  padding: '30px', borderRadius: '8px', textAlign: 'center',
                  backgroundColor: ndtStats.repairRate > ndtStats.targetRate ? '#f8d7da' : '#d4edda',
                  border: `2px solid ${ndtStats.repairRate > ndtStats.targetRate ? '#dc3545' : '#28a745'}`
                }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#495057' }}>PROJECT REPAIR RATE</h3>
                  <p style={{ margin: 0, fontSize: '56px', fontWeight: 'bold', color: ndtStats.repairRate > ndtStats.targetRate ? '#dc3545' : '#28a745' }}>
                    {ndtStats.repairRate.toFixed(1)}%
                  </p>
                  <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>Target: ≤{ndtStats.targetRate}% | {ndtStats.totalRepairs} repairs / {ndtStats.totalWelds} welds</p>
                </div>
                <div style={{ padding: '30px', borderRadius: '8px', textAlign: 'center', backgroundColor: 'white', border: '1px solid #dee2e6' }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#495057' }}>TOTAL WELDS</h3>
                  <p style={{ margin: 0, fontSize: '56px', fontWeight: 'bold', color: '#17a2b8' }}>{ndtStats.totalWelds}</p>
                </div>
                <div style={{ padding: '30px', borderRadius: '8px', textAlign: 'center', backgroundColor: 'white', border: '1px solid #dee2e6' }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#495057' }}>TOTAL REPAIRS</h3>
                  <p style={{ margin: 0, fontSize: '56px', fontWeight: 'bold', color: '#ffc107' }}>{ndtStats.totalRepairs}</p>
                </div>
              </div>

              {/* Welder Performance Table */}
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#6f42c1')}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>🔬 Welder Performance - Repair Rate by Welder</h2>
                  <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>⚠️ Welders exceeding 5% threshold are flagged</p>
                </div>
                <table style={tableStyle}>
                  <thead><tr><th style={thStyle}>Status</th><th style={thStyle}>Welder</th><th style={thStyle}>Total Welds</th><th style={thStyle}>Repairs</th><th style={thStyle}>Repair Rate</th></tr></thead>
                  <tbody>
                    {ndtStats.welderStats.length === 0 ? (
                      <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#666' }}>No welder data available</td></tr>
                    ) : (
                      ndtStats.welderStats.map((welder, idx) => (
                        <tr key={idx} style={{ backgroundColor: welder.rate > 5 ? '#fff3cd' : 'transparent' }}>
                          <td style={tdStyle}>{welder.rate > 5 ? <span style={{ color: '#dc3545', fontWeight: 'bold' }}>⚠️ FLAG</span> : <span style={{ color: '#28a745' }}>✓ OK</span>}</td>
                          <td style={{ ...tdStyle, fontWeight: 'bold' }}>{welder.name}</td>
                          <td style={tdStyle}>{welder.welds}</td>
                          <td style={tdStyle}>{welder.repairs}</td>
                          <td style={{ ...tdStyle, fontWeight: 'bold', color: welder.rate > 5 ? '#dc3545' : welder.rate > 3 ? '#ffc107' : '#28a745' }}>{welder.rate.toFixed(1)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ AUDITOR VIEW TAB (NEW) ============ */}
      {activeTab === 'regulatory' && (
        <div style={{ padding: '30px' }}>
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#dc3545')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>📋 Auditor View - Interpretation Disagreements (Read-Only)</h2>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>NDT inspections where Level III disagreed with operator interpretation</p>
            </div>
            {auditLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading audit data...</div>
            ) : auditDisagreements.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p style={{ fontSize: '18px', margin: 0 }}>✅ No interpretation disagreements found</p>
                <p style={{ margin: '10px 0 0 0', fontSize: '14px' }}>All operator interpretations have been confirmed by Level III review</p>
              </div>
            ) : (
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>Date</th><th style={thStyle}>Inspection #</th><th style={thStyle}>Weld</th><th style={thStyle}>Method</th><th style={thStyle}>Technician</th><th style={thStyle}>Operator Call</th><th style={thStyle}>Comments</th></tr></thead>
                <tbody>
                  {auditDisagreements.map((item, idx) => (
                    <tr key={idx} style={{ backgroundColor: '#fff3cd' }}>
                      <td style={tdStyle}>{item.inspection_date}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{item.inspection_number}</td>
                      <td style={tdStyle}>{item.weldDetails ? <><strong>{item.weldDetails.weld_number}</strong><br /><span style={{ fontSize: '11px', color: '#666' }}>KP {item.weldDetails.kp}</span></> : '-'}</td>
                      <td style={tdStyle}>{item.method}</td>
                      <td style={tdStyle}>{item.technician_name}</td>
                      <td style={{ ...tdStyle, fontWeight: 'bold', color: item.interpretation_result === 'accept' ? '#28a745' : '#dc3545' }}>{item.interpretation_result?.toUpperCase()}</td>
                      <td style={{ ...tdStyle, fontSize: '12px', maxWidth: '200px' }}>{item.comments || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ padding: '15px 20px', backgroundColor: '#f8f9fa', borderTop: '1px solid #dee2e6', fontSize: '12px', color: '#666' }}>🔒 This view is read-only for audit purposes. Data cannot be modified from this interface.</div>
          </div>
        </div>
      )}

      {/* ============ PHOTO GALLERY TAB (NEW) ============ */}
      {activeTab === 'gallery' && (
        <div style={{ padding: '30px' }}>
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#28a745')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>📷 Geotagged Photo Gallery</h2>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>Photos with Direction (deg), Lat/Long, and GPS Accuracy (m)</p>
            </div>
            {galleryLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading photos...</div>
            ) : galleryPhotos.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}><p style={{ fontSize: '18px', margin: 0 }}>No geotagged photos found</p></div>
            ) : (
              <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
                {galleryPhotos.map((photo, idx) => (
                  <div key={photo.id || idx} onClick={() => setSelectedGalleryPhoto(photo)} style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', overflow: 'hidden', border: '1px solid #dee2e6', cursor: 'pointer' }}>
                    <div style={{ height: '150px', backgroundColor: '#e9ecef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {photo.url ? <img src={photo.thumbnail || photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '48px' }}>📷</span>}
                    </div>
                    <div style={{ padding: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>{photo.ticketDate} • {photo.inspector}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '11px' }}>
                        <div><span style={{ color: '#666' }}>Lat:</span> <span style={{ fontFamily: 'monospace' }}>{photo.latitude?.toFixed(6) || '-'}</span></div>
                        <div><span style={{ color: '#666' }}>Lon:</span> <span style={{ fontFamily: 'monospace' }}>{photo.longitude?.toFixed(6) || '-'}</span></div>
                        <div><span style={{ color: '#666' }}>Dir:</span> <span style={{ fontFamily: 'monospace' }}>{photo.direction ? `${photo.direction}°` : '-'}</span></div>
                        <div><span style={{ color: '#666' }}>Acc:</span> <span style={{ fontFamily: 'monospace' }}>{photo.accuracy ? `±${photo.accuracy}m` : '-'}</span></div>
                      </div>
                      {photo.kp && <div style={{ marginTop: '8px', fontSize: '11px', color: '#28a745', fontWeight: 'bold' }}>KP {photo.kp} • {photo.activity}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ PERSONNEL TAB (NEW) ============ */}
      {activeTab === 'personnel' && (
        <div style={{ padding: '30px' }}>
          {personnelLoading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}><p>Loading personnel data...</p></div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', marginBottom: '20px' }}>
                <div style={{ padding: '30px', borderRadius: '8px', textAlign: 'center', backgroundColor: 'white', border: '2px solid #17a2b8' }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#495057' }}>TOTAL SITE EXPOSURE</h3>
                  <p style={{ margin: 0, fontSize: '56px', fontWeight: 'bold', color: '#17a2b8' }}>{personnelSummary.totalExposure}</p>
                  <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>Person-days (Last 30 days)</p>
                </div>
                <div style={cardStyle}>
                  <div style={cardHeaderStyle('#6c757d')}><h2 style={{ margin: 0, fontSize: '18px' }}>👷 Inspector Breakdown by Category</h2></div>
                  <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px' }}>
                    {personnelSummary.inspectorBreakdown.map((cat, idx) => (
                      <div key={idx} style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px', textAlign: 'center', border: '1px solid #dee2e6' }}>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#495057' }}>{cat.count}</div>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>{cat.category}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={cardHeaderStyle('#17a2b8')}><h2 style={{ margin: 0, fontSize: '18px' }}>📋 Individual Inspector Summary (Top 20 by days)</h2></div>
                <table style={tableStyle}>
                  <thead><tr><th style={thStyle}>Inspector</th><th style={thStyle}>Company</th><th style={thStyle}>Role</th><th style={thStyle}>Days on Site</th><th style={thStyle}>Last Active</th></tr></thead>
                  <tbody>
                    {personnelSummary.individualInspectors.length === 0 ? (
                      <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#666' }}>No personnel data available</td></tr>
                    ) : (
                      personnelSummary.individualInspectors.map((person, idx) => (
                        <tr key={idx}>
                          <td style={{ ...tdStyle, fontWeight: 'bold' }}>{person.name}</td>
                          <td style={tdStyle}>{person.company || '-'}</td>
                          <td style={tdStyle}>{person.role || '-'}</td>
                          <td style={{ ...tdStyle, fontWeight: 'bold', color: '#17a2b8' }}>{person.days}</td>
                          <td style={{ ...tdStyle, fontSize: '12px', color: '#666' }}>{person.lastSeen}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ EFFICIENCY TAB ============ */}
      {activeTab === 'efficiency' && (
        <div style={{ padding: '30px' }}>
          <ShadowAuditDashboard />
        </div>
      )}

      {/* Photo Detail Modal */}
      {selectedGalleryPhoto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedGalleryPhoto(null)}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', maxWidth: '800px', maxHeight: '90vh', overflow: 'auto', margin: '20px' }} onClick={(e) => e.stopPropagation()}>
            {selectedGalleryPhoto.url && <img src={selectedGalleryPhoto.url} alt="" style={{ width: '100%', maxHeight: '500px', objectFit: 'contain', backgroundColor: '#000' }} />}
            <div style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 15px 0' }}>{selectedGalleryPhoto.caption || 'Field Photo'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '14px' }}>
                <div><strong>Date:</strong> {selectedGalleryPhoto.ticketDate}</div>
                <div><strong>Inspector:</strong> {selectedGalleryPhoto.inspector}</div>
                <div><strong>Latitude:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedGalleryPhoto.latitude?.toFixed(6)}</span></div>
                <div><strong>Longitude:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedGalleryPhoto.longitude?.toFixed(6)}</span></div>
                <div><strong>Direction:</strong> {selectedGalleryPhoto.direction ? `${selectedGalleryPhoto.direction}°` : 'N/A'}</div>
                <div><strong>Accuracy:</strong> {selectedGalleryPhoto.accuracy ? `±${selectedGalleryPhoto.accuracy}m` : 'N/A'}</div>
                {selectedGalleryPhoto.activity && <div><strong>Activity:</strong> {selectedGalleryPhoto.activity}</div>}
                {selectedGalleryPhoto.kp && <div><strong>KP:</strong> {selectedGalleryPhoto.kp}</div>}
              </div>
              <button onClick={() => setSelectedGalleryPhoto(null)} style={{ marginTop: '20px', padding: '10px 24px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '30px', maxWidth: '500px', width: '90%' }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#dc3545' }}>Reject Report</h2>
            <p style={{ color: '#666', marginBottom: '15px' }}>Report from <strong>{rejectingReport?.ticket?.inspector_name}</strong> on <strong>{rejectingReport?.ticket?.date}</strong></p>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>Reason for rejection:</label>
            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain what needs to be corrected..." style={{ width: '100%', height: '120px', padding: '12px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }} />
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
