import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'
import MiniMapWidget from './MiniMapWidget.jsx'

// Weather API Key
const weatherApiKey = import.meta.env.VITE_WEATHER_API_KEY

// Pipeline locations for weather fetching
const pipelineLocations = {
  'EGP-ML-NORTH': { lat: 49.4720, lon: -122.9850, name: 'Eagle Mountain North' },
  'EGP-ML-SOUTH': { lat: 49.3100, lon: -122.8200, name: 'Eagle Mountain South' },
  'default': { lat: 49.4720, lon: -122.9850, name: 'Project Site' }
}

// ============================================================================
// ASSISTANT CHIEF INSPECTOR DASHBOARD
// January 2026 - Pipe-Up Pipeline Inspector SaaS
// 
// Roles & Responsibilities:
// - Review inspector reports (optional review - Chief can approve independently)
// - Assist with staff assignments and logistics
// - Track contractor deficiencies and rectification
// - Support inspectors with daily report preparation
// - Monitor contractor compliance
// - Interface with contractor supervisory staff
// ============================================================================

function AssistantChiefDashboard() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  
  // Tab state
  const [activeTab, setActiveTab] = useState('review')
  
  // =============================================
  // REPORT REVIEW STATE
  // =============================================
  const [pendingReports, setPendingReports] = useState([])
  const [reviewedByMe, setReviewedByMe] = useState([])
  const [reviewLoading, setReviewLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewStatus, setReviewStatus] = useState('reviewed') // reviewed, needs_revision, recommended
  
  // =============================================
  // STAFF ASSIGNMENTS STATE
  // =============================================
  const [inspectors, setInspectors] = useState([])
  const [assignments, setAssignments] = useState([])
  const [assignmentDate, setAssignmentDate] = useState(new Date().toISOString().split('T')[0])
  const [showAssignmentModal, setShowAssignmentModal] = useState(false)
  const [newAssignment, setNewAssignment] = useState({
    inspector_id: '',
    activity: '',
    kp_start: '',
    kp_end: '',
    notes: ''
  })
  
  // =============================================
  // DEFICIENCY TRACKING STATE
  // =============================================
  const [deficiencies, setDeficiencies] = useState([])
  const [deficiencyFilter, setDeficiencyFilter] = useState('open') // open, in_progress, resolved, all
  const [showDeficiencyModal, setShowDeficiencyModal] = useState(false)
  const [newDeficiency, setNewDeficiency] = useState({
    category: 'technical',
    description: '',
    location_kp: '',
    severity: 'minor',
    contractor_notified: false,
    due_date: ''
  })
  
  // =============================================
  // COMPLIANCE STATE
  // =============================================
  const [complianceIssues, setComplianceIssues] = useState([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  
  // =============================================
  // DAILY OBSERVATION STATE
  // =============================================
  const [observationDate, setObservationDate] = useState(new Date().toISOString().split('T')[0])
  const [observation, setObservation] = useState({
    safety_observations: '',
    safety_flagged: false,
    environmental_compliance: '',
    environmental_flagged: false,
    technical_quality: '',
    technical_flagged: false,
    progress_logistics: '',
    progress_flagged: false,
    general_notes: '',
    weather_conditions: '',
    time_on_row: ''
  })
  const [observationPhotos, setObservationPhotos] = useState([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [savingObservation, setSavingObservation] = useState(false)
  const [existingObservation, setExistingObservation] = useState(null)
  const [observationHistory, setObservationHistory] = useState([])
  
  // Weather state
  const [weatherData, setWeatherData] = useState({
    conditions: '',
    tempHigh: '',
    tempLow: '',
    windSpeed: '',
    precipitation: ''
  })
  const [fetchingWeather, setFetchingWeather] = useState(false)
  
  // =============================================
  // STATS
  // =============================================
  const [stats, setStats] = useState({
    pendingReview: 0,
    reviewedToday: 0,
    openDeficiencies: 0,
    activeInspectors: 0,
    complianceIssues: 0
  })

  // =============================================
  // LIFECYCLE
  // =============================================
  useEffect(() => {
    fetchAllData()
  }, [])
  
  useEffect(() => {
    if (activeTab === 'review') fetchPendingReports()
    if (activeTab === 'assignments') fetchAssignments()
    if (activeTab === 'deficiencies') fetchDeficiencies()
    if (activeTab === 'compliance') fetchComplianceIssues()
    if (activeTab === 'observation') fetchExistingObservation()
  }, [activeTab, deficiencyFilter, assignmentDate, observationDate])

  async function fetchAllData() {
    await Promise.all([
      fetchPendingReports(),
      fetchInspectors(),
      fetchStats()
    ])
  }

  // =============================================
  // REPORT REVIEW FUNCTIONS
  // =============================================
  async function fetchPendingReports() {
    setReviewLoading(true)
    try {
      // Fetch reports pending review (submitted but not yet approved by Chief)
      const { data: pending } = await supabase
        .from('inspection_reports')
        .select(`
          *,
          inspector:profiles!inspection_reports_inspector_id_fkey(full_name, email)
        `)
        .eq('status', 'submitted')
        .order('report_date', { ascending: false })
      
      setPendingReports(pending || [])
      
      // Fetch reports I've reviewed today
      const today = new Date().toISOString().split('T')[0]
      const { data: reviewed } = await supabase
        .from('assistant_chief_reviews')
        .select(`
          *,
          report:inspection_reports(id, report_date, inspector_id, kp_start, kp_end)
        `)
        .eq('reviewer_id', userProfile?.id)
        .gte('reviewed_at', today)
      
      setReviewedByMe(reviewed || [])
    } catch (err) {
      console.error('Error fetching reports:', err)
    }
    setReviewLoading(false)
  }

  async function submitReview() {
    if (!selectedReport) return
    
    try {
      // Save review to assistant_chief_reviews table
      const { error } = await supabase
        .from('assistant_chief_reviews')
        .insert({
          report_id: selectedReport.id,
          reviewer_id: userProfile?.id,
          reviewer_name: userProfile?.full_name,
          status: reviewStatus,
          notes: reviewNotes,
          reviewed_at: new Date().toISOString()
        })
      
      if (error) throw error
      
      // If needs revision, update report status
      if (reviewStatus === 'needs_revision') {
        await supabase
          .from('inspection_reports')
          .update({ 
            assistant_review_status: 'needs_revision',
            assistant_review_notes: reviewNotes
          })
          .eq('id', selectedReport.id)
      }
      
      alert('Review submitted successfully!')
      setSelectedReport(null)
      setReviewNotes('')
      setReviewStatus('reviewed')
      fetchPendingReports()
      fetchStats()
    } catch (err) {
      console.error('Error submitting review:', err)
      alert('Error: ' + err.message)
    }
  }

  // =============================================
  // STAFF ASSIGNMENT FUNCTIONS
  // =============================================
  async function fetchInspectors() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('role', 'inspector')
        .order('full_name')
      
      setInspectors(data || [])
    } catch (err) {
      console.error('Error fetching inspectors:', err)
    }
  }

  async function fetchAssignments() {
    try {
      const { data } = await supabase
        .from('inspector_assignments')
        .select(`
          *,
          inspector:profiles(full_name, email)
        `)
        .eq('assignment_date', assignmentDate)
        .order('created_at', { ascending: false })
      
      setAssignments(data || [])
    } catch (err) {
      console.error('Error fetching assignments:', err)
    }
  }

  async function saveAssignment() {
    if (!newAssignment.inspector_id || !newAssignment.activity) {
      alert('Please select an inspector and activity')
      return
    }
    
    try {
      const { error } = await supabase
        .from('inspector_assignments')
        .insert({
          inspector_id: newAssignment.inspector_id,
          activity: newAssignment.activity,
          kp_start: newAssignment.kp_start ? parseFloat(newAssignment.kp_start) : null,
          kp_end: newAssignment.kp_end ? parseFloat(newAssignment.kp_end) : null,
          notes: newAssignment.notes,
          assignment_date: assignmentDate,
          assigned_by: userProfile?.id,
          created_at: new Date().toISOString()
        })
      
      if (error) throw error
      
      alert('Assignment saved!')
      setShowAssignmentModal(false)
      setNewAssignment({ inspector_id: '', activity: '', kp_start: '', kp_end: '', notes: '' })
      fetchAssignments()
    } catch (err) {
      console.error('Error saving assignment:', err)
      alert('Error: ' + err.message)
    }
  }

  // =============================================
  // DEFICIENCY TRACKING FUNCTIONS
  // =============================================
  async function fetchDeficiencies() {
    try {
      let query = supabase
        .from('contractor_deficiencies')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (deficiencyFilter !== 'all') {
        query = query.eq('status', deficiencyFilter)
      }
      
      const { data } = await query.limit(50)
      setDeficiencies(data || [])
    } catch (err) {
      console.error('Error fetching deficiencies:', err)
    }
  }

  async function saveDeficiency() {
    if (!newDeficiency.description) {
      alert('Please enter a description')
      return
    }
    
    try {
      const { error } = await supabase
        .from('contractor_deficiencies')
        .insert({
          category: newDeficiency.category,
          description: newDeficiency.description,
          location_kp: newDeficiency.location_kp ? parseFloat(newDeficiency.location_kp) : null,
          severity: newDeficiency.severity,
          contractor_notified: newDeficiency.contractor_notified,
          due_date: newDeficiency.due_date || null,
          status: 'open',
          reported_by: userProfile?.id,
          reported_by_name: userProfile?.full_name,
          created_at: new Date().toISOString()
        })
      
      if (error) throw error
      
      alert('Deficiency logged!')
      setShowDeficiencyModal(false)
      setNewDeficiency({ category: 'technical', description: '', location_kp: '', severity: 'minor', contractor_notified: false, due_date: '' })
      fetchDeficiencies()
      fetchStats()
    } catch (err) {
      console.error('Error saving deficiency:', err)
      alert('Error: ' + err.message)
    }
  }

  async function updateDeficiencyStatus(id, newStatus) {
    try {
      const updates = { status: newStatus }
      if (newStatus === 'resolved') {
        updates.resolved_at = new Date().toISOString()
        updates.resolved_by = userProfile?.id
      }
      
      const { error } = await supabase
        .from('contractor_deficiencies')
        .update(updates)
        .eq('id', id)
      
      if (error) throw error
      fetchDeficiencies()
      fetchStats()
    } catch (err) {
      console.error('Error updating deficiency:', err)
    }
  }

  // =============================================
  // COMPLIANCE FUNCTIONS
  // =============================================
  async function fetchComplianceIssues() {
    setComplianceLoading(true)
    try {
      // Aggregate compliance issues from various sources
      const { data: deficiencyData } = await supabase
        .from('contractor_deficiencies')
        .select('*')
        .in('category', ['safety', 'environmental', 'regulatory'])
        .eq('status', 'open')
      
      setComplianceIssues(deficiencyData || [])
    } catch (err) {
      console.error('Error fetching compliance:', err)
    }
    setComplianceLoading(false)
  }

  // =============================================
  // DAILY OBSERVATION FUNCTIONS
  // =============================================
  async function fetchExistingObservation() {
    try {
      // Check if observation exists for this date
      const { data } = await supabase
        .from('assistant_chief_observations')
        .select('*')
        .eq('observation_date', observationDate)
        .eq('observer_id', userProfile?.id)
        .single()
      
      if (data) {
        setExistingObservation(data)
        setObservation({
          safety_observations: data.safety_observations || '',
          safety_flagged: data.safety_flagged || false,
          environmental_compliance: data.environmental_compliance || '',
          environmental_flagged: data.environmental_flagged || false,
          technical_quality: data.technical_quality || '',
          technical_flagged: data.technical_flagged || false,
          progress_logistics: data.progress_logistics || '',
          progress_flagged: data.progress_flagged || false,
          general_notes: data.general_notes || '',
          weather_conditions: data.weather_conditions || '',
          time_on_row: data.time_on_row || ''
        })
        // Fetch associated photos
        if (data.id) {
          const { data: photos } = await supabase
            .from('observation_photos')
            .select('*')
            .eq('observation_id', data.id)
            .order('created_at', { ascending: false })
          setObservationPhotos(photos || [])
        }
      } else {
        // Reset form for new observation
        setExistingObservation(null)
        setObservation({
          safety_observations: '',
          safety_flagged: false,
          environmental_compliance: '',
          environmental_flagged: false,
          technical_quality: '',
          technical_flagged: false,
          progress_logistics: '',
          progress_flagged: false,
          general_notes: '',
          weather_conditions: '',
          time_on_row: ''
        })
        setObservationPhotos([])
      }
      
      // Fetch observation history
      const { data: history } = await supabase
        .from('assistant_chief_observations')
        .select('id, observation_date, safety_flagged, environmental_flagged, technical_flagged, progress_flagged, created_at')
        .eq('observer_id', userProfile?.id)
        .order('observation_date', { ascending: false })
        .limit(10)
      
      setObservationHistory(history || [])
    } catch (err) {
      // No existing observation - that's fine
      setExistingObservation(null)
    }
  }

  async function saveObservation() {
    setSavingObservation(true)
    try {
      const observationData = {
        observation_date: observationDate,
        observer_id: userProfile?.id,
        observer_name: userProfile?.full_name,
        safety_observations: observation.safety_observations,
        safety_flagged: observation.safety_flagged,
        environmental_compliance: observation.environmental_compliance,
        environmental_flagged: observation.environmental_flagged,
        technical_quality: observation.technical_quality,
        technical_flagged: observation.technical_flagged,
        progress_logistics: observation.progress_logistics,
        progress_flagged: observation.progress_flagged,
        general_notes: observation.general_notes,
        weather_conditions: observation.weather_conditions,
        time_on_row: observation.time_on_row,
        updated_at: new Date().toISOString()
      }
      
      if (existingObservation) {
        // Update existing
        const { error } = await supabase
          .from('assistant_chief_observations')
          .update(observationData)
          .eq('id', existingObservation.id)
        
        if (error) throw error
      } else {
        // Insert new
        observationData.created_at = new Date().toISOString()
        const { data, error } = await supabase
          .from('assistant_chief_observations')
          .insert(observationData)
          .select()
          .single()
        
        if (error) throw error
        setExistingObservation(data)
      }
      
      alert('Observation saved successfully!')
      fetchExistingObservation()
    } catch (err) {
      console.error('Error saving observation:', err)
      alert('Error: ' + err.message)
    }
    setSavingObservation(false)
  }

  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    
    // Must have an observation saved first
    if (!existingObservation) {
      alert('Please save the observation first before adding photos')
      return
    }
    
    setUploadingPhoto(true)
    try {
      // Get geolocation
      let geoData = { latitude: null, longitude: null, accuracy: null, direction: null }
      
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000
            })
          })
          geoData = {
            latitude: parseFloat(position.coords.latitude.toFixed(6)),
            longitude: parseFloat(position.coords.longitude.toFixed(6)),
            accuracy: parseFloat(position.coords.accuracy.toFixed(1)),
            direction: position.coords.heading ? parseFloat(position.coords.heading.toFixed(1)) : null
          }
        } catch (geoErr) {
          console.warn('Geolocation error:', geoErr)
        }
      }
      
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `observation_${existingObservation.id}_${Date.now()}.${fileExt}`
      const filePath = `observation-photos/${fileName}`
      
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(filePath, file)
      
      if (uploadError) throw uploadError
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(filePath)
      
      // Save photo record with geotag data
      const { error: dbError } = await supabase
        .from('observation_photos')
        .insert({
          observation_id: existingObservation.id,
          photo_url: urlData.publicUrl,
          file_path: filePath,
          latitude: geoData.latitude,
          longitude: geoData.longitude,
          accuracy_m: geoData.accuracy,
          direction_deg: geoData.direction,
          caption: '',
          taken_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
      
      if (dbError) throw dbError
      
      // Refresh photos
      fetchExistingObservation()
      alert('Photo uploaded successfully!')
    } catch (err) {
      console.error('Error uploading photo:', err)
      alert('Error uploading photo: ' + err.message)
    }
    setUploadingPhoto(false)
    event.target.value = '' // Reset input
  }

  async function deletePhoto(photoId) {
    if (!confirm('Delete this photo?')) return
    
    try {
      const { error } = await supabase
        .from('observation_photos')
        .delete()
        .eq('id', photoId)
      
      if (error) throw error
      fetchExistingObservation()
    } catch (err) {
      console.error('Error deleting photo:', err)
    }
  }

  // Auto-fetch weather
  async function fetchWeather() {
    setFetchingWeather(true)
    const loc = pipelineLocations['default']
    
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${loc.lat}&lon=${loc.lon}&appid=${weatherApiKey}&units=metric`
      )
      const data = await response.json()
      
      const conditions = data.weather[0].main
      const tempHigh = Math.round(data.main.temp_max)
      const tempLow = Math.round(data.main.temp_min)
      const windSpeed = Math.round(data.wind.speed * 3.6) // m/s to km/h
      const precipitation = data.rain ? data.rain['1h'] || 0 : 0
      
      setWeatherData({ conditions, tempHigh, tempLow, windSpeed, precipitation })
      
      // Auto-populate the weather field if empty
      if (!observation.weather_conditions) {
        const weatherString = `${conditions}, ${tempHigh}°C (High) / ${tempLow}°C (Low), Wind: ${windSpeed} km/h`
        setObservation(prev => ({ ...prev, weather_conditions: weatherString }))
      }
    } catch (error) {
      console.error('Weather fetch error:', error)
    }
    setFetchingWeather(false)
  }

  // Auto-fetch weather when observation tab is opened
  useEffect(() => {
    if (activeTab === 'observation' && !weatherData.conditions) {
      fetchWeather()
    }
  }, [activeTab])

  // =============================================
  // STATS
  // =============================================
  async function fetchStats() {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      // Pending reports
      const { count: pendingCount } = await supabase
        .from('inspection_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'submitted')
      
      // My reviews today
      const { count: reviewedCount } = await supabase
        .from('assistant_chief_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('reviewer_id', userProfile?.id)
        .gte('reviewed_at', today)
      
      // Open deficiencies
      const { count: deficiencyCount } = await supabase
        .from('contractor_deficiencies')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')
      
      // Active inspectors (with assignments today)
      const { count: inspectorCount } = await supabase
        .from('inspector_assignments')
        .select('inspector_id', { count: 'exact', head: true })
        .eq('assignment_date', today)
      
      setStats({
        pendingReview: pendingCount || 0,
        reviewedToday: reviewedCount || 0,
        openDeficiencies: deficiencyCount || 0,
        activeInspectors: inspectorCount || 0,
        complianceIssues: 0
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }

  // =============================================
  // STYLES
  // =============================================
  const tabStyle = (isActive) => ({
    padding: '15px 25px',
    backgroundColor: isActive ? '#2c5282' : 'transparent',
    color: isActive ? 'white' : '#2c5282',
    border: isActive ? 'none' : '1px solid #2c5282',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: isActive ? 'bold' : 'normal',
    fontSize: '14px'
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
    color: 'white'
  })
  
  const tableStyle = { width: '100%', borderCollapse: 'collapse' }
  const thStyle = { padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid #ddd', backgroundColor: '#f8f9fa', fontSize: '12px', fontWeight: 'bold' }
  const tdStyle = { padding: '12px 15px', borderBottom: '1px solid #eee', fontSize: '14px' }
  const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold', color: '#495057' }
  const badgeStyle = (color) => ({ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', backgroundColor: color, color: 'white' })

  // =============================================
  // ACTIVITY OPTIONS
  // =============================================
  const activityOptions = [
    'Clearing', 'Grading', 'Stringing', 'Bending', 'Welding - Mainline',
    'Welding - Tie-ins', 'NDT', 'Coating', 'Lowering-In', 'Backfill',
    'Hydrostatic Testing', 'Cleanup', 'Restoration', 'HDD', 'Bore',
    'Road Crossing', 'Environmental Monitoring', 'Safety', 'General'
  ]

  // =============================================
  // RENDER
  // =============================================
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#2c5282', color: 'white', padding: '20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px' }}>👷 Assistant Chief Inspector Dashboard</h1>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>
              {userProfile?.full_name || userProfile?.email} • Support & Oversight
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => navigate('/chief')} style={{ padding: '10px 20px', backgroundColor: '#1a5f2a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Chief Dashboard
            </button>
            <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 20px', backgroundColor: '#4a5568', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Main Dashboard
            </button>
            <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #ddd', padding: '15px 20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '40px', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ffc107' }}>{stats.pendingReview}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Pending Review</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>{stats.reviewedToday}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Reviewed Today</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#17a2b8' }}>{stats.activeInspectors}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Inspectors Assigned</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: stats.openDeficiencies > 0 ? '#dc3545' : '#28a745' }}>{stats.openDeficiencies}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Open Deficiencies</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #ddd', padding: '15px 20px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '10px' }}>
          <button style={tabStyle(activeTab === 'review')} onClick={() => setActiveTab('review')}>
            📋 Report Review {stats.pendingReview > 0 && <span style={{ marginLeft: '8px', backgroundColor: '#ffc107', color: '#000', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{stats.pendingReview}</span>}
          </button>
          <button style={tabStyle(activeTab === 'assignments')} onClick={() => setActiveTab('assignments')}>
            👥 Staff Assignments
          </button>
          <button style={tabStyle(activeTab === 'deficiencies')} onClick={() => setActiveTab('deficiencies')}>
            ⚠️ Deficiency Tracking {stats.openDeficiencies > 0 && <span style={{ marginLeft: '8px', backgroundColor: '#dc3545', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{stats.openDeficiencies}</span>}
          </button>
          <button style={tabStyle(activeTab === 'compliance')} onClick={() => setActiveTab('compliance')}>
            ✅ Compliance Monitor
          </button>
          <button style={tabStyle(activeTab === 'observation')} onClick={() => setActiveTab('observation')}>
            📝 Daily Observation
          </button>
        </div>
      </div>

      {/* Mini Map Widget - Always visible */}
      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <MiniMapWidget 
            kpStart={0}
            kpEnd={47}
            showGPS={true}
            height="200px"
          />
        </div>
      </div>

      <div style={{ padding: '0 20px 20px 20px', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* ============================================= */}
        {/* REPORT REVIEW TAB */}
        {/* ============================================= */}
        {activeTab === 'review' && (
          <div style={{ display: 'grid', gridTemplateColumns: selectedReport ? '1fr 1fr' : '1fr', gap: '20px' }}>
            {/* Report List */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle('#ffc107')}>
                <h2 style={{ margin: 0, fontSize: '18px', color: '#000' }}>📋 Reports Pending Review</h2>
                <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#333' }}>
                  Review reports to assist inspectors • Chief can approve independently
                </p>
              </div>
              {reviewLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>
              ) : pendingReports.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  <p style={{ fontSize: '16px' }}>✅ All reports have been reviewed!</p>
                </div>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Inspector</th>
                      <th style={thStyle}>KP Range</th>
                      <th style={thStyle}>Status</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingReports.map(report => (
                      <tr key={report.id} style={{ backgroundColor: selectedReport?.id === report.id ? '#e7f3ff' : 'transparent' }}>
                        <td style={tdStyle}>{report.report_date}</td>
                        <td style={tdStyle}>{report.inspector?.full_name || 'Unknown'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                          {report.kp_start?.toFixed(3)} - {report.kp_end?.toFixed(3)}
                        </td>
                        <td style={tdStyle}>
                          <span style={badgeStyle('#ffc107')}>SUBMITTED</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button
                            onClick={() => setSelectedReport(report)}
                            style={{ padding: '6px 12px', backgroundColor: '#2c5282', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Review Panel */}
            {selectedReport && (
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#2c5282')}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>✍️ Review Report</h2>
                  <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                    {selectedReport.report_date} • {selectedReport.inspector?.full_name}
                  </p>
                </div>
                <div style={{ padding: '20px' }}>
                  {/* Report Summary */}
                  <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h4 style={{ margin: '0 0 10px 0' }}>Report Details</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
                      <div><strong>KP Range:</strong> {selectedReport.kp_start?.toFixed(3)} - {selectedReport.kp_end?.toFixed(3)}</div>
                      <div><strong>Weather:</strong> {selectedReport.weather_conditions || '-'}</div>
                      <div><strong>Submitted:</strong> {new Date(selectedReport.submitted_at || selectedReport.created_at).toLocaleString()}</div>
                    </div>
                    <button
                      onClick={() => navigate(`/report?id=${selectedReport.id}`)}
                      style={{ marginTop: '15px', padding: '8px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      View Full Report →
                    </button>
                  </div>

                  {/* Review Status */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>Review Status</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {[
                        { value: 'reviewed', label: '✓ Reviewed', color: '#28a745' },
                        { value: 'recommended', label: '⭐ Recommended for Approval', color: '#17a2b8' },
                        { value: 'needs_revision', label: '⚠️ Needs Revision', color: '#dc3545' }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setReviewStatus(opt.value)}
                          style={{
                            flex: 1,
                            padding: '12px',
                            backgroundColor: reviewStatus === opt.value ? opt.color : '#f8f9fa',
                            color: reviewStatus === opt.value ? 'white' : '#333',
                            border: `2px solid ${opt.color}`,
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: reviewStatus === opt.value ? 'bold' : 'normal'
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Review Notes */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>
                      Review Notes {reviewStatus === 'needs_revision' && <span style={{ color: '#dc3545' }}>* Required</span>}
                    </label>
                    <textarea
                      value={reviewNotes}
                      onChange={e => setReviewNotes(e.target.value)}
                      placeholder={reviewStatus === 'needs_revision' 
                        ? 'Describe what needs to be revised...' 
                        : 'Optional notes for the Chief Inspector or inspector...'}
                      style={{ ...inputStyle, height: '120px', resize: 'vertical' }}
                    />
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setSelectedReport(null); setReviewNotes(''); setReviewStatus('reviewed'); }}
                      style={{ padding: '12px 24px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitReview}
                      disabled={reviewStatus === 'needs_revision' && !reviewNotes.trim()}
                      style={{
                        padding: '12px 24px',
                        backgroundColor: reviewStatus === 'needs_revision' && !reviewNotes.trim() ? '#ccc' : '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: reviewStatus === 'needs_revision' && !reviewNotes.trim() ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Submit Review
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================= */}
        {/* STAFF ASSIGNMENTS TAB */}
        {/* ============================================= */}
        {activeTab === 'assignments' && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#17a2b8')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>👥 Inspector Assignments</h2>
                  <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                    Manage daily inspector work assignments
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={assignmentDate}
                    onChange={e => setAssignmentDate(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '4px', border: 'none' }}
                  />
                  <button
                    onClick={() => setShowAssignmentModal(true)}
                    style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    + Add Assignment
                  </button>
                </div>
              </div>
            </div>
            {assignments.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p>No assignments for {assignmentDate}</p>
                <button
                  onClick={() => setShowAssignmentModal(true)}
                  style={{ marginTop: '10px', padding: '10px 20px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Create First Assignment
                </button>
              </div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Inspector</th>
                    <th style={thStyle}>Activity</th>
                    <th style={thStyle}>KP Range</th>
                    <th style={thStyle}>Notes</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(a => (
                    <tr key={a.id}>
                      <td style={tdStyle}><strong>{a.inspector?.full_name}</strong></td>
                      <td style={tdStyle}>{a.activity}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                        {a.kp_start ? `${a.kp_start.toFixed(3)} - ${a.kp_end?.toFixed(3)}` : '-'}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '12px', maxWidth: '200px' }}>{a.notes || '-'}</td>
                      <td style={tdStyle}>
                        <span style={badgeStyle('#28a745')}>ASSIGNED</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ============================================= */}
        {/* DEFICIENCY TRACKING TAB */}
        {/* ============================================= */}
        {activeTab === 'deficiencies' && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#dc3545')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>⚠️ Contractor Deficiency Tracking</h2>
                  <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                    Track and monitor contractor deficiencies and rectification
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <select
                    value={deficiencyFilter}
                    onChange={e => setDeficiencyFilter(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '4px', border: 'none' }}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="all">All</option>
                  </select>
                  <button
                    onClick={() => setShowDeficiencyModal(true)}
                    style={{ padding: '10px 20px', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    + Log Deficiency
                  </button>
                </div>
              </div>
            </div>
            {deficiencies.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p>No {deficiencyFilter === 'all' ? '' : deficiencyFilter} deficiencies found</p>
              </div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Location</th>
                    <th style={thStyle}>Severity</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deficiencies.map(d => (
                    <tr key={d.id}>
                      <td style={tdStyle}>{new Date(d.created_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>
                        <span style={badgeStyle(
                          d.category === 'safety' ? '#dc3545' :
                          d.category === 'environmental' ? '#28a745' :
                          d.category === 'technical' ? '#17a2b8' : '#6c757d'
                        )}>
                          {d.category?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: '250px' }}>{d.description}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{d.location_kp ? `KP ${d.location_kp.toFixed(3)}` : '-'}</td>
                      <td style={tdStyle}>
                        <span style={badgeStyle(
                          d.severity === 'critical' ? '#dc3545' :
                          d.severity === 'major' ? '#ffc107' : '#28a745'
                        )}>
                          {d.severity?.toUpperCase()}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={badgeStyle(
                          d.status === 'open' ? '#dc3545' :
                          d.status === 'in_progress' ? '#ffc107' : '#28a745'
                        )}>
                          {d.status?.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {d.status === 'open' && (
                          <button onClick={() => updateDeficiencyStatus(d.id, 'in_progress')} style={{ padding: '4px 8px', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '5px', fontSize: '11px' }}>
                            Start
                          </button>
                        )}
                        {d.status === 'in_progress' && (
                          <button onClick={() => updateDeficiencyStatus(d.id, 'resolved')} style={{ padding: '4px 8px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ============================================= */}
        {/* COMPLIANCE TAB */}
        {/* ============================================= */}
        {activeTab === 'compliance' && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#28a745')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>✅ Contractor Compliance Monitor</h2>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                Monitor contractor compliance with contract requirements
              </p>
            </div>
            <div style={{ padding: '20px' }}>
              {complianceLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
              ) : complianceIssues.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#28a745' }}>
                  <p style={{ fontSize: '18px', margin: 0 }}>✅ No open compliance issues</p>
                  <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
                    All safety, environmental, and regulatory items are in compliance
                  </p>
                </div>
              ) : (
                <div>
                  <h4 style={{ marginTop: 0 }}>⚠️ Open Compliance Issues ({complianceIssues.length})</h4>
                  {complianceIssues.map(issue => (
                    <div key={issue.id} style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', marginBottom: '10px', borderLeft: '4px solid #ffc107' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                          <span style={badgeStyle(
                            issue.category === 'safety' ? '#dc3545' :
                            issue.category === 'environmental' ? '#28a745' : '#17a2b8'
                          )}>
                            {issue.category?.toUpperCase()}
                          </span>
                          <p style={{ margin: '10px 0 5px 0', fontWeight: 'bold' }}>{issue.description}</p>
                          <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                            {issue.location_kp ? `KP ${issue.location_kp.toFixed(3)} • ` : ''}
                            Reported {new Date(issue.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => updateDeficiencyStatus(issue.id, 'in_progress')}
                          style={{ padding: '8px 16px', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Address Issue
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================= */}
        {/* DAILY OBSERVATION TAB */}
        {/* ============================================= */}
        {activeTab === 'observation' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
            {/* Main Observation Form */}
            <div>
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#6f42c1')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '18px' }}>📝 Daily Field Observation Report</h2>
                      <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                        Independent leadership oversight documentation
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        type="date"
                        value={observationDate}
                        onChange={e => setObservationDate(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '4px', border: 'none' }}
                      />
                      {existingObservation && (
                        <span style={{ backgroundColor: '#28a745', color: 'white', padding: '4px 10px', borderRadius: '4px', fontSize: '11px' }}>
                          ✓ Saved
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ padding: '20px' }}>
                  {/* Header Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
                    <div>
                      <label style={labelStyle}>Weather Conditions</label>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                          type="text"
                          value={observation.weather_conditions}
                          onChange={e => setObservation({ ...observation, weather_conditions: e.target.value })}
                          style={{ ...inputStyle, flex: 1 }}
                          placeholder="e.g., Clear, 15°C, light wind"
                        />
                        <button
                          onClick={fetchWeather}
                          disabled={fetchingWeather}
                          style={{
                            padding: '10px 15px',
                            backgroundColor: fetchingWeather ? '#ccc' : '#17a2b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: fetchingWeather ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {fetchingWeather ? '...' : '🔄 Fetch'}
                        </button>
                      </div>
                      {weatherData.conditions && (
                        <div style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
                          Current: {weatherData.conditions}, {weatherData.tempHigh}°C / {weatherData.tempLow}°C, Wind: {weatherData.windSpeed} km/h
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>Time on ROW</label>
                      <input
                        type="text"
                        value={observation.time_on_row}
                        onChange={e => setObservation({ ...observation, time_on_row: e.target.value })}
                        style={inputStyle}
                        placeholder="e.g., 07:00 - 17:30"
                      />
                    </div>
                  </div>

                  {/* Safety Observations */}
                  <div style={{ marginBottom: '25px', backgroundColor: '#fff5f5', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #dc3545' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <label style={{ ...labelStyle, margin: 0, color: '#dc3545', fontSize: '14px' }}>
                        🦺 Safety Observations
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={observation.safety_flagged}
                          onChange={e => setObservation({ ...observation, safety_flagged: e.target.checked })}
                        />
                        <span style={{ color: observation.safety_flagged ? '#dc3545' : '#666', fontWeight: observation.safety_flagged ? 'bold' : 'normal' }}>
                          🚩 Flag for Chief
                        </span>
                      </label>
                    </div>
                    <textarea
                      value={observation.safety_observations}
                      onChange={e => setObservation({ ...observation, safety_observations: e.target.value })}
                      style={{ ...inputStyle, height: '120px', resize: 'vertical' }}
                      placeholder="Document safety observations, toolbox talks attended, PPE compliance, hazard identifications, near misses, safety recognitions..."
                    />
                    {observation.safety_flagged && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#dc3545' }}>
                        ⚠️ This section will be highlighted for the Chief Inspector's review
                      </p>
                    )}
                  </div>

                  {/* Environmental Compliance */}
                  <div style={{ marginBottom: '25px', backgroundColor: '#f0fff4', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #28a745' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <label style={{ ...labelStyle, margin: 0, color: '#28a745', fontSize: '14px' }}>
                        🌿 Environmental Compliance
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={observation.environmental_flagged}
                          onChange={e => setObservation({ ...observation, environmental_flagged: e.target.checked })}
                        />
                        <span style={{ color: observation.environmental_flagged ? '#28a745' : '#666', fontWeight: observation.environmental_flagged ? 'bold' : 'normal' }}>
                          🚩 Flag for Chief
                        </span>
                      </label>
                    </div>
                    <textarea
                      value={observation.environmental_compliance}
                      onChange={e => setObservation({ ...observation, environmental_compliance: e.target.value })}
                      style={{ ...inputStyle, height: '120px', resize: 'vertical' }}
                      placeholder="Document environmental compliance, topsoil segregation, erosion control, wildlife sightings, watercourse crossings, spill prevention..."
                    />
                    {observation.environmental_flagged && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#28a745' }}>
                        ⚠️ This section will be highlighted for the Chief Inspector's review
                      </p>
                    )}
                  </div>

                  {/* Technical/Quality */}
                  <div style={{ marginBottom: '25px', backgroundColor: '#f0f7ff', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #17a2b8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <label style={{ ...labelStyle, margin: 0, color: '#17a2b8', fontSize: '14px' }}>
                        🔧 Technical / Quality Observations
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={observation.technical_flagged}
                          onChange={e => setObservation({ ...observation, technical_flagged: e.target.checked })}
                        />
                        <span style={{ color: observation.technical_flagged ? '#17a2b8' : '#666', fontWeight: observation.technical_flagged ? 'bold' : 'normal' }}>
                          🚩 Flag for Chief
                        </span>
                      </label>
                    </div>
                    <textarea
                      value={observation.technical_quality}
                      onChange={e => setObservation({ ...observation, technical_quality: e.target.value })}
                      style={{ ...inputStyle, height: '120px', resize: 'vertical' }}
                      placeholder="Document technical observations, welding quality, coating inspection, pipe handling, specification compliance, workmanship issues..."
                    />
                    {observation.technical_flagged && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#17a2b8' }}>
                        ⚠️ This section will be highlighted for the Chief Inspector's review
                      </p>
                    )}
                  </div>

                  {/* Progress/Logistics */}
                  <div style={{ marginBottom: '25px', backgroundColor: '#fff8e7', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #ffc107' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <label style={{ ...labelStyle, margin: 0, color: '#856404', fontSize: '14px' }}>
                        📊 Progress / Logistics
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={observation.progress_flagged}
                          onChange={e => setObservation({ ...observation, progress_flagged: e.target.checked })}
                        />
                        <span style={{ color: observation.progress_flagged ? '#856404' : '#666', fontWeight: observation.progress_flagged ? 'bold' : 'normal' }}>
                          🚩 Flag for Chief
                        </span>
                      </label>
                    </div>
                    <textarea
                      value={observation.progress_logistics}
                      onChange={e => setObservation({ ...observation, progress_logistics: e.target.value })}
                      style={{ ...inputStyle, height: '120px', resize: 'vertical' }}
                      placeholder="Document progress observations, crew counts, equipment utilization, material deliveries, schedule concerns, contractor coordination..."
                    />
                    {observation.progress_flagged && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#856404' }}>
                        ⚠️ This section will be highlighted for the Chief Inspector's review
                      </p>
                    )}
                  </div>

                  {/* General Notes */}
                  <div style={{ marginBottom: '25px' }}>
                    <label style={labelStyle}>📋 General Notes</label>
                    <textarea
                      value={observation.general_notes}
                      onChange={e => setObservation({ ...observation, general_notes: e.target.value })}
                      style={{ ...inputStyle, height: '100px', resize: 'vertical' }}
                      placeholder="Any additional observations, contractor interface notes, meetings attended, action items..."
                    />
                  </div>

                  {/* Save Button */}
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={saveObservation}
                      disabled={savingObservation}
                      style={{
                        padding: '15px 40px',
                        backgroundColor: savingObservation ? '#6c757d' : '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: savingObservation ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        fontSize: '16px'
                      }}
                    >
                      {savingObservation ? 'Saving...' : existingObservation ? '💾 Update Observation' : '💾 Save Observation'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Photo Upload Section */}
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#17a2b8')}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>📷 Geotagged Photos</h3>
                  <p style={{ margin: '5px 0 0 0', fontSize: '11px', opacity: 0.8 }}>
                    Photos are automatically tagged with GPS coordinates
                  </p>
                </div>
                <div style={{ padding: '20px' }}>
                  {/* Upload Button */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{
                      display: 'inline-block',
                      padding: '12px 24px',
                      backgroundColor: existingObservation ? '#17a2b8' : '#ccc',
                      color: 'white',
                      borderRadius: '4px',
                      cursor: existingObservation ? 'pointer' : 'not-allowed',
                      fontWeight: 'bold'
                    }}>
                      {uploadingPhoto ? 'Uploading...' : '📷 Add Photo'}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoUpload}
                        disabled={!existingObservation || uploadingPhoto}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {!existingObservation && (
                      <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
                        Save observation first to enable photo uploads
                      </p>
                    )}
                  </div>

                  {/* Photo Grid */}
                  {observationPhotos.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                      {observationPhotos.map(photo => (
                        <div key={photo.id} style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', overflow: 'hidden' }}>
                          <div style={{ height: '150px', backgroundColor: '#ddd' }}>
                            {photo.photo_url && (
                              <img src={photo.photo_url} alt="Observation" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                          </div>
                          <div style={{ padding: '10px', fontSize: '10px', fontFamily: 'monospace', color: '#666' }}>
                            <div>📍 {photo.latitude?.toFixed(6)}, {photo.longitude?.toFixed(6)}</div>
                            <div>🧭 {photo.direction_deg ? `${photo.direction_deg.toFixed(1)}°` : '-'} | 📏 ±{photo.accuracy_m?.toFixed(1)}m</div>
                            <div style={{ marginTop: '5px' }}>
                              <button
                                onClick={() => deletePhoto(photo.id)}
                                style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '30px', color: '#666' }}>
                      No photos added yet
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar - History */}
            <div>
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#6c757d')}>
                  <h3 style={{ margin: 0, fontSize: '14px' }}>📅 Recent Observations</h3>
                </div>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {observationHistory.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                      No previous observations
                    </div>
                  ) : (
                    observationHistory.map(obs => (
                      <div
                        key={obs.id}
                        onClick={() => setObservationDate(obs.observation_date)}
                        style={{
                          padding: '12px 15px',
                          borderBottom: '1px solid #eee',
                          cursor: 'pointer',
                          backgroundColor: obs.observation_date === observationDate ? '#e7f3ff' : 'transparent'
                        }}
                      >
                        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{obs.observation_date}</div>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          {obs.safety_flagged && <span style={{ fontSize: '10px', backgroundColor: '#dc3545', color: 'white', padding: '2px 6px', borderRadius: '3px' }}>Safety</span>}
                          {obs.environmental_flagged && <span style={{ fontSize: '10px', backgroundColor: '#28a745', color: 'white', padding: '2px 6px', borderRadius: '3px' }}>Env</span>}
                          {obs.technical_flagged && <span style={{ fontSize: '10px', backgroundColor: '#17a2b8', color: 'white', padding: '2px 6px', borderRadius: '3px' }}>Tech</span>}
                          {obs.progress_flagged && <span style={{ fontSize: '10px', backgroundColor: '#ffc107', color: '#000', padding: '2px 6px', borderRadius: '3px' }}>Progress</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Flagged Summary */}
              <div style={{ ...cardStyle, marginTop: '20px' }}>
                <div style={{ padding: '15px', backgroundColor: '#f8f9fa' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#495057' }}>🚩 Flagged for Chief</h4>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {(observation.safety_flagged || observation.environmental_flagged || observation.technical_flagged || observation.progress_flagged) ? (
                      <ul style={{ margin: 0, paddingLeft: '20px' }}>
                        {observation.safety_flagged && <li style={{ color: '#dc3545' }}>Safety Observations</li>}
                        {observation.environmental_flagged && <li style={{ color: '#28a745' }}>Environmental</li>}
                        {observation.technical_flagged && <li style={{ color: '#17a2b8' }}>Technical/Quality</li>}
                        {observation.progress_flagged && <li style={{ color: '#856404' }}>Progress/Logistics</li>}
                      </ul>
                    ) : (
                      <p style={{ margin: 0, fontStyle: 'italic' }}>No sections flagged</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================= */}
      {/* ASSIGNMENT MODAL */}
      {/* ============================================= */}
      {showAssignmentModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '500px', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ backgroundColor: '#17a2b8', padding: '20px', color: 'white' }}>
              <h2 style={{ margin: 0 }}>Add Inspector Assignment</h2>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={labelStyle}>Inspector *</label>
                <select value={newAssignment.inspector_id} onChange={e => setNewAssignment({ ...newAssignment, inspector_id: e.target.value })} style={inputStyle}>
                  <option value="">-- Select Inspector --</option>
                  {inspectors.map(i => (
                    <option key={i.id} value={i.id}>{i.full_name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={labelStyle}>Activity *</label>
                <select value={newAssignment.activity} onChange={e => setNewAssignment({ ...newAssignment, activity: e.target.value })} style={inputStyle}>
                  <option value="">-- Select Activity --</option>
                  {activityOptions.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={labelStyle}>KP Start</label>
                  <input type="number" step="0.001" value={newAssignment.kp_start} onChange={e => setNewAssignment({ ...newAssignment, kp_start: e.target.value })} style={inputStyle} placeholder="0.000" />
                </div>
                <div>
                  <label style={labelStyle}>KP End</label>
                  <input type="number" step="0.001" value={newAssignment.kp_end} onChange={e => setNewAssignment({ ...newAssignment, kp_end: e.target.value })} style={inputStyle} placeholder="0.000" />
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={newAssignment.notes} onChange={e => setNewAssignment({ ...newAssignment, notes: e.target.value })} style={{ ...inputStyle, height: '80px' }} placeholder="Special instructions..." />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAssignmentModal(false)} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveAssignment} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Save Assignment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================= */}
      {/* DEFICIENCY MODAL */}
      {/* ============================================= */}
      {showDeficiencyModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '500px', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ backgroundColor: '#dc3545', padding: '20px', color: 'white' }}>
              <h2 style={{ margin: 0 }}>Log Contractor Deficiency</h2>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={labelStyle}>Category *</label>
                  <select value={newDeficiency.category} onChange={e => setNewDeficiency({ ...newDeficiency, category: e.target.value })} style={inputStyle}>
                    <option value="technical">Technical</option>
                    <option value="safety">Safety</option>
                    <option value="environmental">Environmental</option>
                    <option value="regulatory">Regulatory</option>
                    <option value="quality">Quality</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Severity *</label>
                  <select value={newDeficiency.severity} onChange={e => setNewDeficiency({ ...newDeficiency, severity: e.target.value })} style={inputStyle}>
                    <option value="minor">Minor</option>
                    <option value="major">Major</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={labelStyle}>Description *</label>
                <textarea value={newDeficiency.description} onChange={e => setNewDeficiency({ ...newDeficiency, description: e.target.value })} style={{ ...inputStyle, height: '100px' }} placeholder="Describe the deficiency..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={labelStyle}>Location (KP)</label>
                  <input type="number" step="0.001" value={newDeficiency.location_kp} onChange={e => setNewDeficiency({ ...newDeficiency, location_kp: e.target.value })} style={inputStyle} placeholder="0.000" />
                </div>
                <div>
                  <label style={labelStyle}>Due Date</label>
                  <input type="date" value={newDeficiency.due_date} onChange={e => setNewDeficiency({ ...newDeficiency, due_date: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={newDeficiency.contractor_notified} onChange={e => setNewDeficiency({ ...newDeficiency, contractor_notified: e.target.checked })} />
                  Contractor has been notified
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowDeficiencyModal(false)} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveDeficiency} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Log Deficiency</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AssistantChiefDashboard
