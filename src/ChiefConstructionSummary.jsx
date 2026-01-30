// ChiefConstructionSummary.jsx
// EGP Legacy Daily Construction Summary Report Dashboard
// Matches the format from Legacy Chief Reports/01-12-2026 Construction Summary Report KF.pdf

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'

// Import helper functions
import {
  aggregatePersonnelForLegacy,
  aggregateProgressForLegacy,
  aggregateWeldingForLegacy,
  generateKeyFocusWithAI,
  aggregateWeatherForLegacy,
  aggregatePhotosForLegacy,
  saveEGPSummary,
  loadEGPSummary
} from './chiefConstructionHelpers.js'

// Import PDF generator
import { downloadEGPConstructionPDF } from './chiefConstructionPDF.js'

// Import existing helper for fetching reports
import { fetchApprovedReportsForDate } from './chiefReportHelpers.js'

function ChiefConstructionSummary() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()

  // =============================================
  // STATE
  // =============================================

  // Report date
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])

  // Loading states
  const [loading, setLoading] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)
  const [saving, setSaving] = useState(false)

  // Source data
  const [sourceReports, setSourceReports] = useState([])

  // Key Focus section
  const [keyFocusNarrative, setKeyFocusNarrative] = useState('')
  const [keyFocusBullets, setKeyFocusBullets] = useState([])
  const [todaysProgress, setTodaysProgress] = useState('0.00%')

  // Safety Status
  const [safetyStatus, setSafetyStatus] = useState('')

  // Personnel Grid
  const [personnelData, setPersonnelData] = useState({
    primeResources: 0,
    primeSubcontractors: 0,
    feiEmployee: 0,
    feiSubcontractors: 0,
    totalSiteExposure: 0,
    breakdown: {
      deccaInspector: 0,
      envInspector: 0,
      envQP: 0,
      feiCompliance: 0,
      meridianSurvey: 0,
      feiOps: 0,
      ndt: 0,
      engineering: 0,
      other: 0
    }
  })

  // Weather
  const [weatherData, setWeatherData] = useState({
    tempHigh: null,
    tempLow: null,
    conditions: '',
    precipitation: 0,
    rowConditions: ''
  })

  // Progress tables
  const [progressData, setProgressData] = useState({
    plannedVsActual: [],
    targetCompletion: [],
    progressToDate: [],
    weekRange: { start: '', end: '' }
  })

  // Welding data
  const [weldingData, setWeldingData] = useState({
    byLM: [],
    byCount: [],
    repairs: [],
    totalRepairs: 0,
    repairRate: '0.0'
  })

  // Photos
  const [availablePhotos, setAvailablePhotos] = useState([])
  const [selectedPhotos, setSelectedPhotos] = useState([])

  // Signatures
  const [leadInspector, setLeadInspector] = useState('')
  const [constructionManager, setConstructionManager] = useState('')

  // Status
  const [existingSummary, setExistingSummary] = useState(null)

  // =============================================
  // DATA LOADING
  // =============================================

  async function loadDataForDate() {
    setLoading(true)
    console.log('=== Load Data clicked ===')
    console.log('Loading data for date:', reportDate)

    try {
      // Check for existing saved summary
      const existing = await loadEGPSummary(reportDate)
      if (existing) {
        console.log('Found existing summary:', existing)
        setExistingSummary(existing)
        // Restore saved data
        setKeyFocusBullets(existing.key_focus_bullets || [])
        setSafetyStatus(existing.safety_status || '')
        setPersonnelData(existing.personnel_data || personnelData)
        setWeatherData(existing.weather_data || weatherData)
        setLeadInspector(existing.lead_inspector || '')
        setConstructionManager(existing.construction_manager || '')
      }

      // Fetch inspector reports for the date
      const reports = await fetchApprovedReportsForDate(reportDate)
      console.log('Fetched reports:', reports.length)
      setSourceReports(reports)

      if (reports.length > 0) {
        // Aggregate personnel
        const personnel = aggregatePersonnelForLegacy(reports)
        console.log('Aggregated personnel:', personnel)
        setPersonnelData(personnel)

        // Aggregate progress
        const progress = await aggregateProgressForLegacy(reports, reportDate)
        console.log('Aggregated progress:', progress)
        setProgressData(progress)

        // Calculate today's progress percentage
        const totalPlannedToday = progress.plannedVsActual
          .filter(p => p.isTotal)
          .reduce((sum, p) => sum + (p.dailyPlanned || 0), 0)
        const totalActualToday = progress.plannedVsActual
          .filter(p => p.isTotal)
          .reduce((sum, p) => sum + (p.dailyActual || 0), 0)
        const progressPct = totalPlannedToday > 0
          ? ((totalActualToday / totalPlannedToday) * 100).toFixed(2)
          : '0.00'
        setTodaysProgress(`${progressPct}%`)

        // Aggregate welding
        const welding = await aggregateWeldingForLegacy(reports, reportDate)
        console.log('Aggregated welding:', welding)
        setWeldingData(welding)

        // Aggregate weather
        const weather = aggregateWeatherForLegacy(reports)
        console.log('Aggregated weather:', weather)
        setWeatherData(weather)

        // Aggregate photos
        const photos = aggregatePhotosForLegacy(reports)
        console.log('Aggregated photos:', photos.length)
        setAvailablePhotos(photos)
        // Auto-select first 6 photos
        setSelectedPhotos(photos.slice(0, 6))
      } else {
        // Reset data if no reports
        console.log('No reports found for this date')
        setPersonnelData({
          primeResources: 0,
          primeSubcontractors: 0,
          feiEmployee: 0,
          feiSubcontractors: 0,
          totalSiteExposure: 0,
          breakdown: {
            deccaInspector: 0,
            envInspector: 0,
            envQP: 0,
            feiCompliance: 0,
            meridianSurvey: 0,
            feiOps: 0,
            ndt: 0,
            engineering: 0,
            other: 0
          }
        })
        setProgressData({
          plannedVsActual: [],
          targetCompletion: [],
          progressToDate: [],
          weekRange: { start: '', end: '' }
        })
        setWeldingData({
          byLM: [],
          byCount: [],
          repairs: [],
          totalRepairs: 0,
          repairRate: '0.0'
        })
        setAvailablePhotos([])
        setSelectedPhotos([])
        setTodaysProgress('0.00%')
        alert(`No inspector reports found for ${reportDate}. Try a different date.`)
      }
    } catch (err) {
      console.error('Error loading data:', err)
      alert('Error loading data: ' + err.message)
    }

    setLoading(false)
    console.log('=== Load Data complete ===')
  }

  // =============================================
  // AI GENERATION
  // =============================================

  async function generateAINarrative() {
    console.log('Generate AI Narrative clicked')
    console.log('Source reports:', sourceReports.length)

    if (sourceReports.length === 0) {
      alert('No reports found for this date. Please click "Load Data" first.')
      return
    }

    setGeneratingAI(true)

    try {
      console.log('Calling generateKeyFocusWithAI...')
      const result = await generateKeyFocusWithAI(sourceReports, {
        personnel: personnelData,
        welding: weldingData,
        progressData: progressData
      })

      console.log('AI generated narrative result:', result)

      if (result.bullets && result.bullets.length > 0) {
        setKeyFocusBullets(result.bullets)
        alert(`Generated ${result.bullets.length} bullet points!`)
      } else {
        alert('AI returned empty response. Check console for details.')
      }
    } catch (err) {
      console.error('Error generating AI narrative:', err)
      alert('Error generating narrative: ' + err.message)
    }

    setGeneratingAI(false)
  }

  // =============================================
  // SAVE/EXPORT
  // =============================================

  async function saveDraft() {
    setSaving(true)

    try {
      const payload = {
        report_date: reportDate,
        project_name: 'Eagle Mountain Pipeline Project',
        contractor: 'SMJV',
        reported_by: userProfile?.full_name || userProfile?.email,
        reported_by_id: userProfile?.id,
        key_focus_narrative: keyFocusNarrative,
        key_focus_bullets: keyFocusBullets,
        safety_status: safetyStatus,
        personnel_data: personnelData,
        weather_data: weatherData,
        progress_data: progressData,
        welding_data: weldingData,
        selected_photo_ids: selectedPhotos.map(p => p.id),
        lead_inspector: leadInspector,
        construction_manager: constructionManager,
        status: 'draft'
      }

      const result = await saveEGPSummary(payload)

      if (result.success) {
        alert(result.isNew ? 'Summary report created!' : 'Summary report updated!')
        setExistingSummary(result.data)
      } else {
        throw new Error(result.error)
      }
    } catch (err) {
      console.error('Error saving:', err)
      alert('Error saving: ' + err.message)
    }

    setSaving(false)
  }

  function exportToPDF() {
    try {
      const filename = downloadEGPConstructionPDF({
        reportDate,
        reportNumber: `${reportDate.replace(/-/g, '')}DPR`,
        projectName: 'Eagle Mountain Pipeline Project',
        contractor: 'SMJV',
        reportedBy: userProfile?.full_name || 'Chief Inspector',
        keyFocusBullets,
        todaysProgress,
        safetyStatus,
        personnel: personnelData,
        weather: weatherData,
        progressData,
        weldingData,
        selectedPhotos,
        leadInspector,
        constructionManager
      })

      alert(`PDF exported: ${filename}`)
    } catch (err) {
      console.error('Error exporting PDF:', err)
      alert('Error exporting PDF: ' + err.message)
    }
  }

  // =============================================
  // BULLET MANAGEMENT
  // =============================================

  function addBullet() {
    setKeyFocusBullets([...keyFocusBullets, '< '])
  }

  function updateBullet(index, value) {
    const updated = [...keyFocusBullets]
    updated[index] = value
    setKeyFocusBullets(updated)
  }

  function removeBullet(index) {
    setKeyFocusBullets(keyFocusBullets.filter((_, i) => i !== index))
  }

  // =============================================
  // PHOTO SELECTION
  // =============================================

  function togglePhotoSelection(photo) {
    const isSelected = selectedPhotos.some(p => p.id === photo.id)

    if (isSelected) {
      setSelectedPhotos(selectedPhotos.filter(p => p.id !== photo.id))
    } else if (selectedPhotos.length < 6) {
      setSelectedPhotos([...selectedPhotos, photo])
    } else {
      alert('Maximum 6 photos can be selected for the report')
    }
  }

  // =============================================
  // HELPERS
  // =============================================

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  // =============================================
  // STYLES
  // =============================================

  const styles = {
    container: {
      fontFamily: 'Arial, sans-serif',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5'
    },
    header: {
      backgroundColor: '#1a5f2a',
      color: 'white',
      padding: '15px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    controls: {
      backgroundColor: 'white',
      padding: '15px 20px',
      borderBottom: '1px solid #ddd',
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      flexWrap: 'wrap'
    },
    button: (color) => ({
      padding: '10px 20px',
      backgroundColor: color,
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '14px'
    }),
    section: {
      backgroundColor: 'white',
      margin: '15px 20px',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      overflow: 'hidden'
    },
    sectionHeader: {
      backgroundColor: '#1a5f2a',
      color: 'white',
      padding: '10px 15px',
      fontSize: '14px',
      fontWeight: 'bold'
    },
    sectionBody: {
      padding: '15px'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '12px'
    },
    th: {
      backgroundColor: '#f8f9fa',
      padding: '8px 10px',
      textAlign: 'left',
      borderBottom: '2px solid #dee2e6',
      fontWeight: 'bold',
      fontSize: '11px'
    },
    td: {
      padding: '6px 10px',
      borderBottom: '1px solid #eee',
      fontSize: '11px'
    },
    grid: (cols) => ({
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: '10px'
    }),
    card: {
      backgroundColor: '#f8f9fa',
      padding: '10px',
      borderRadius: '4px',
      textAlign: 'center'
    },
    photoGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '10px'
    },
    photoThumb: (isSelected) => ({
      width: '100%',
      aspectRatio: '4/3',
      objectFit: 'cover',
      borderRadius: '4px',
      cursor: 'pointer',
      border: isSelected ? '3px solid #1a5f2a' : '2px solid #ddd'
    })
  }

  // =============================================
  // RENDER
  // =============================================

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px' }}>EGP Daily Construction Summary Report</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
            {userProfile?.full_name || userProfile?.email} - Legacy Format Generator
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => navigate('/chief-dashboard')} style={styles.button('#6c757d')}>
            Back to Dashboard
          </button>
          <button onClick={signOut} style={styles.button('#dc3545')}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <div>
          <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Report Date:</label>
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            style={{ padding: '8px', fontSize: '14px', border: '1px solid #ced4da', borderRadius: '4px' }}
          />
        </div>
        <button onClick={loadDataForDate} disabled={loading} style={styles.button('#007bff')}>
          {loading ? 'Loading...' : 'Load Data'}
        </button>
        <button onClick={generateAINarrative} disabled={generatingAI || sourceReports.length === 0} style={styles.button('#6f42c1')}>
          {generatingAI ? 'Generating...' : 'Generate AI Narrative'}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <button onClick={saveDraft} disabled={saving} style={styles.button('#28a745')}>
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={exportToPDF} style={styles.button('#fd7e14')}>
            Export PDF
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ padding: '10px 20px', backgroundColor: '#e7f3ff', borderBottom: '1px solid #b8daff' }}>
        <span style={{ marginRight: '20px' }}>{formatDate(reportDate)}</span>
        <span style={{ marginRight: '20px' }}>{sourceReports.length} inspector report(s) loaded</span>
        {existingSummary && (
          <span style={{ padding: '3px 10px', backgroundColor: existingSummary.status === 'published' ? '#d4edda' : '#fff3cd', borderRadius: '10px', fontSize: '12px' }}>
            {existingSummary.status === 'published' ? 'Published' : 'Draft Saved'}
          </span>
        )}
      </div>

      {/* SECTION 1 - SUMMARY */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>SECTION 1 - SUMMARY</div>
        <div style={styles.sectionBody}>
          {/* Key Focus */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '14px' }}>Key Focus of the Day</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#1a5f2a' }}>{todaysProgress}</span>
                <span style={{ fontSize: '12px', color: '#666' }}>Today's Progress</span>
              </div>
            </div>
            <div style={{ backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '4px', marginBottom: '10px' }}>
              {keyFocusBullets.map((bullet, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                  <input
                    type="text"
                    value={bullet}
                    onChange={(e) => updateBullet(idx, e.target.value)}
                    style={{ flex: 1, padding: '6px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                    placeholder="< Enter bullet point"
                  />
                  <button onClick={() => removeBullet(idx)} style={{ marginLeft: '5px', padding: '6px 10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    X
                  </button>
                </div>
              ))}
              <button onClick={addBullet} style={{ padding: '6px 12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                + Add Bullet
              </button>
            </div>
          </div>

          {/* Safety Status */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Safety Status</h3>
            <textarea
              value={safetyStatus}
              onChange={(e) => setSafetyStatus(e.target.value)}
              placeholder="Enter safety status notes..."
              style={{ width: '100%', height: '60px', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
            />
          </div>

          {/* Personnel Grid */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Personnel Onsite</h3>
            <div style={styles.grid(5)}>
              <div style={styles.card}>
                <div style={{ fontSize: '10px', color: '#666' }}>Prime Resources</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{personnelData.primeResources}</div>
              </div>
              <div style={styles.card}>
                <div style={{ fontSize: '10px', color: '#666' }}>Prime Subcontractors</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{personnelData.primeSubcontractors}</div>
              </div>
              <div style={styles.card}>
                <div style={{ fontSize: '10px', color: '#666' }}>FEI Employee</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{personnelData.feiEmployee}</div>
              </div>
              <div style={styles.card}>
                <div style={{ fontSize: '10px', color: '#666' }}>FEI Subcontractors</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{personnelData.feiSubcontractors}</div>
              </div>
              <div style={{ ...styles.card, backgroundColor: '#1a5f2a', color: 'white' }}>
                <div style={{ fontSize: '10px', opacity: 0.8 }}>Total Site Exposure</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{personnelData.totalSiteExposure}</div>
              </div>
            </div>
            <div style={{ ...styles.grid(5), marginTop: '10px' }}>
              {Object.entries(personnelData.breakdown || {}).map(([key, value]) => (
                <div key={key} style={styles.card}>
                  <div style={{ fontSize: '10px', color: '#666', textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Weather */}
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Daily Weather</h3>
            <div style={styles.grid(5)}>
              <div style={styles.card}>
                <div style={{ fontSize: '10px', color: '#666' }}>High Temp (C)</div>
                <input
                  type="number"
                  value={weatherData.tempHigh || ''}
                  onChange={(e) => setWeatherData({ ...weatherData, tempHigh: parseFloat(e.target.value) || null })}
                  style={{ width: '60px', padding: '4px', textAlign: 'center', border: '1px solid #ced4da', borderRadius: '4px' }}
                />
              </div>
              <div style={styles.card}>
                <div style={{ fontSize: '10px', color: '#666' }}>Low Temp (C)</div>
                <input
                  type="number"
                  value={weatherData.tempLow || ''}
                  onChange={(e) => setWeatherData({ ...weatherData, tempLow: parseFloat(e.target.value) || null })}
                  style={{ width: '60px', padding: '4px', textAlign: 'center', border: '1px solid #ced4da', borderRadius: '4px' }}
                />
              </div>
              <div style={styles.card}>
                <div style={{ fontSize: '10px', color: '#666' }}>ROW Conditions</div>
                <input
                  type="text"
                  value={weatherData.rowConditions || ''}
                  onChange={(e) => setWeatherData({ ...weatherData, rowConditions: e.target.value })}
                  style={{ width: '80px', padding: '4px', textAlign: 'center', border: '1px solid #ced4da', borderRadius: '4px' }}
                  placeholder="Wet/Dry"
                />
              </div>
              <div style={styles.card}>
                <div style={{ fontSize: '10px', color: '#666' }}>Conditions</div>
                <input
                  type="text"
                  value={weatherData.conditions || ''}
                  onChange={(e) => setWeatherData({ ...weatherData, conditions: e.target.value })}
                  style={{ width: '80px', padding: '4px', textAlign: 'center', border: '1px solid #ced4da', borderRadius: '4px' }}
                  placeholder="Rain/Clear"
                />
              </div>
              <div style={styles.card}>
                <div style={{ fontSize: '10px', color: '#666' }}>Precipitation (mm)</div>
                <input
                  type="number"
                  value={weatherData.precipitation || ''}
                  onChange={(e) => setWeatherData({ ...weatherData, precipitation: parseFloat(e.target.value) || 0 })}
                  style={{ width: '60px', padding: '4px', textAlign: 'center', border: '1px solid #ced4da', borderRadius: '4px' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2 - PROGRESS */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>SECTION 2 - PROGRESS</div>
        <div style={styles.sectionBody}>
          {/* Planned vs Actual */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
              Planned vs Actual
              {progressData.weekRange?.start && (
                <span style={{ fontWeight: 'normal', fontSize: '12px', color: '#666', marginLeft: '10px' }}>
                  Week: {progressData.weekRange.start} to {progressData.weekRange.end}
                </span>
              )}
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Section</th>
                    <th style={styles.th}>Start Date</th>
                    <th style={styles.th}>KP Start</th>
                    <th style={styles.th}>KP End</th>
                    <th style={styles.th}>Activity</th>
                    <th style={styles.th}>Daily Planned</th>
                    <th style={styles.th}>Daily Actual</th>
                    <th style={styles.th}>Delta</th>
                    <th style={styles.th}>Weekly Planned</th>
                    <th style={styles.th}>Weekly Actual</th>
                    <th style={styles.th}>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {progressData.plannedVsActual?.slice(0, 20).map((row, idx) => (
                    <tr key={idx} style={{ backgroundColor: row.isTotal ? '#d4edda' : idx % 2 === 0 ? 'white' : '#f8f9fa' }}>
                      <td style={{ ...styles.td, fontWeight: row.isTotal ? 'bold' : 'normal' }}>{row.section}</td>
                      <td style={styles.td}>{row.startDate?.substring(0, 10)}</td>
                      <td style={styles.td}>{row.kpStart || '-'}</td>
                      <td style={styles.td}>{row.kpEnd || '-'}</td>
                      <td style={styles.td}>{row.activity}</td>
                      <td style={styles.td}>{row.dailyPlanned?.toFixed(2) || '-'}</td>
                      <td style={styles.td}>{row.dailyActual?.toFixed(2) || '-'}</td>
                      <td style={{ ...styles.td, color: row.dailyDelta < 0 ? 'red' : 'inherit' }}>
                        {row.dailyDelta ? `(${Math.abs(row.dailyDelta).toFixed(2)})` : '-'}
                      </td>
                      <td style={styles.td}>{row.weeklyPlanned?.toFixed(2) || '-'}</td>
                      <td style={styles.td}>{row.weeklyActual?.toFixed(2) || '-'}</td>
                      <td style={{ ...styles.td, color: row.weeklyDelta < 0 ? 'red' : 'green' }}>
                        {row.weeklyDelta ? (row.weeklyDelta >= 0 ? row.weeklyDelta.toFixed(2) : `(${Math.abs(row.weeklyDelta).toFixed(2)})`) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Progress to Date */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Progress to Date</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Description</th>
                    <th style={styles.th}>Unit</th>
                    <th style={styles.th}>Total Planned</th>
                    <th style={styles.th}>Completed</th>
                    <th style={styles.th}>Remaining</th>
                    <th style={styles.th}>% Complete</th>
                    <th style={styles.th}>% Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {progressData.progressToDate?.map((row, idx) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#f8f9fa' }}>
                      <td style={styles.td}>{row.description}</td>
                      <td style={styles.td}>{row.unit}</td>
                      <td style={styles.td}>{row.totalPlanned?.toLocaleString()}</td>
                      <td style={styles.td}>{row.completedToDate?.toLocaleString()}</td>
                      <td style={styles.td}>{row.remaining?.toLocaleString()}</td>
                      <td style={{ ...styles.td, fontWeight: 'bold', color: '#1a5f2a' }}>{row.percentComplete}%</td>
                      <td style={styles.td}>{row.percentRemaining}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Welding Progress */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Welding by LM */}
            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Welding Progress (lm)</h3>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Weld Type</th>
                    <th style={styles.th}>Today</th>
                    <th style={styles.th}>Previous</th>
                    <th style={styles.th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {weldingData.byLM?.map((row, idx) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#f8f9fa' }}>
                      <td style={styles.td}>{row.weldType}</td>
                      <td style={styles.td}>{row.todayLm > 0 ? row.todayLm.toFixed(1) : '-'}</td>
                      <td style={styles.td}>{row.previousLm > 0 ? row.previousLm.toFixed(1) : '-'}</td>
                      <td style={{ ...styles.td, fontWeight: 'bold' }}>{row.totalLm > 0 ? row.totalLm.toFixed(1) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Welding by Count */}
            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Welding Progress (ea.)</h3>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Weld Type</th>
                    <th style={styles.th}>Today</th>
                    <th style={styles.th}>Previous</th>
                    <th style={styles.th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {weldingData.byCount?.map((row, idx) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#f8f9fa' }}>
                      <td style={styles.td}>{row.weldType}</td>
                      <td style={styles.td}>{row.today > 0 ? row.today : '-'}</td>
                      <td style={styles.td}>{row.previous > 0 ? row.previous : '-'}</td>
                      <td style={{ ...styles.td, fontWeight: 'bold' }}>{row.total > 0 ? row.total : '-'}</td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#d4edda', fontWeight: 'bold' }}>
                    <td style={styles.td}>Total</td>
                    <td style={styles.td}></td>
                    <td style={styles.td}></td>
                    <td style={styles.td}>{weldingData.byCount?.reduce((sum, w) => sum + (w.total || 0), 0)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Repairs */}
              <h4 style={{ margin: '15px 0 10px 0', fontSize: '12px' }}>Repairs</h4>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Today</th>
                    <th style={styles.th}>Previous</th>
                    <th style={styles.th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {weldingData.repairs?.map((row, idx) => (
                    <tr key={idx}>
                      <td style={styles.td}>{row.type}</td>
                      <td style={styles.td}>{row.today}</td>
                      <td style={styles.td}>{row.previous}</td>
                      <td style={styles.td}>{row.total}</td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#d4edda' }}>
                    <td style={{ ...styles.td, fontWeight: 'bold' }}>Total Repairs</td>
                    <td style={styles.td}></td>
                    <td style={styles.td}></td>
                    <td style={{ ...styles.td, fontWeight: 'bold' }}>{weldingData.totalRepairs}</td>
                  </tr>
                  <tr style={{ backgroundColor: '#fff3cd' }}>
                    <td style={{ ...styles.td, fontWeight: 'bold' }}>Repair Rate</td>
                    <td style={styles.td}></td>
                    <td style={styles.td}></td>
                    <td style={{ ...styles.td, fontWeight: 'bold', color: parseFloat(weldingData.repairRate) > 6.5 ? 'red' : 'inherit' }}>
                      {weldingData.repairRate}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2 - PICTURES */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>SECTION 2 - PICTURES (Select up to 6)</div>
        <div style={styles.sectionBody}>
          {/* Selected Photos Preview */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Selected Photos ({selectedPhotos.length}/6)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {selectedPhotos.map((photo, idx) => (
                <div key={photo.id || idx} style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', overflow: 'hidden', border: '2px solid #1a5f2a' }}>
                  {photo.url ? (
                    <img src={photo.url} alt="" style={{ width: '100%', height: '120px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9ecef' }}>
                      No Image
                    </div>
                  )}
                  <div style={{ padding: '8px', fontSize: '10px' }}>
                    <div style={{ fontWeight: 'bold' }}>{photo.kpLocation || 'Unknown KP'}</div>
                    <div style={{ color: '#666' }}>{photo.description?.substring(0, 30) || 'No description'}</div>
                    <button
                      onClick={() => togglePhotoSelection(photo)}
                      style={{ marginTop: '5px', padding: '3px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Available Photos */}
          {availablePhotos.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Available Photos ({availablePhotos.length})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                {availablePhotos.map((photo, idx) => {
                  const isSelected = selectedPhotos.some(p => p.id === photo.id)
                  return (
                    <div
                      key={photo.id || idx}
                      onClick={() => togglePhotoSelection(photo)}
                      style={{
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: isSelected ? '3px solid #1a5f2a' : '1px solid #ddd',
                        opacity: isSelected ? 0.7 : 1
                      }}
                    >
                      {photo.url ? (
                        <img src={photo.url} alt="" style={{ width: '100%', height: '60px', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9ecef', fontSize: '10px' }}>
                          No Image
                        </div>
                      )}
                      <div style={{ padding: '3px', fontSize: '8px', textAlign: 'center' }}>
                        {photo.kpLocation || 'KP ?'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SIGNATURE BLOCK */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>SIGNATURE BLOCK</div>
        <div style={styles.sectionBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold' }}>Lead Inspector (Signature)</label>
              <input
                type="text"
                value={leadInspector}
                onChange={(e) => setLeadInspector(e.target.value)}
                placeholder="Enter name"
                style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
              />
              <div style={{ marginTop: '10px' }}>
                <label style={{ fontSize: '12px' }}>Date: </label>
                <span style={{ fontWeight: 'bold' }}>{reportDate}</span>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold' }}>Construction Manager (Signature)</label>
              <input
                type="text"
                value={constructionManager}
                onChange={(e) => setConstructionManager(e.target.value)}
                placeholder="Enter name"
                style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
              />
              <div style={{ marginTop: '10px' }}>
                <label style={{ fontSize: '12px' }}>Date: </label>
                <span style={{ fontWeight: 'bold' }}>{reportDate}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '12px' }}>
        EGP Daily Progress Report Generator - Pipe-Up Inspection Management System
      </div>
    </div>
  )
}

export default ChiefConstructionSummary
