import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'
import MiniMapWidget from './MiniMapWidget.jsx'
import SafetyRecognition from './SafetyRecognition.jsx'
import WildlifeSighting from './WildlifeSighting.jsx'
import jsPDF from 'jspdf'
import ShadowAuditDashboard from './ShadowAuditDashboard.jsx'
import { useOrgQuery } from './utils/queryHelpers.js'
import TenantSwitcher from './components/TenantSwitcher.jsx'
import AIAgentStatusIcon from './components/AIAgentStatusIcon.jsx'
import AgentAuditFindingsPanel from './components/AgentAuditFindingsPanel.jsx'
import { useOrgPath } from './contexts/OrgContext.jsx'
import ProjectCalendar from './components/ProjectCalendar.jsx'

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
  const { orgPath } = useOrgPath()
  const { addOrgFilter, getOrgId, organizationId, isReady } = useOrgQuery()

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

  // AI Agent Audit Panel state
  const [auditPanelData, setAuditPanelData] = useState(null)
  const [loadingAuditPanel, setLoadingAuditPanel] = useState(false)

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
  const [complianceTab, setComplianceTab] = useState('overview') // overview, hazards, recognition, wildlife, inspector-reports
  
  // Field Entry State
  const [hazardEntries, setHazardEntries] = useState([])
  const [recognitionEntries, setRecognitionEntries] = useState([])
  const [wildlifeEntries, setWildlifeEntries] = useState([])
  const [inspectorSafetyNotes, setInspectorSafetyNotes] = useState([])
  const [inspectorEnvironmentNotes, setInspectorEnvironmentNotes] = useState([])
  
  // New Entry Forms
  const [newHazard, setNewHazard] = useState({ description: '', location_kp: '', severity: 'low', corrective_action: '' })
  const [newRecognition, setNewRecognition] = useState({ person_name: '', description: '', category: 'ppe' })
  const [newWildlife, setNewWildlife] = useState({ species: '', count: '1', behavior: '', location_kp: '' })
  const [showHazardForm, setShowHazardForm] = useState(false)
  const [showRecognitionForm, setShowRecognitionForm] = useState(false)
  const [showWildlifeForm, setShowWildlifeForm] = useState(false)
  
  // SafetyRecognition and WildlifeSighting component data
  const [safetyRecognitionData, setSafetyRecognitionData] = useState({ enabled: false, cards: [] })
  const [wildlifeSightingData, setWildlifeSightingData] = useState({ enabled: false, sightings: [] })
  
  // Compliance Issue Entry
  const [complianceEntries, setComplianceEntries] = useState([])
  const [showComplianceForm, setShowComplianceForm] = useState(false)
  const [selectedComplianceIssue, setSelectedComplianceIssue] = useState(null)
  const [newComplianceIssue, setNewComplianceIssue] = useState({
    category: 'safety',
    description: '',
    location_kp: '',
    severity: 'minor',
    // Notification tracking
    contractor_notified: false,
    contractor_notified_date: '',
    contractor_notified_person: '',
    safety_notified: false,
    safety_notified_date: '',
    environmental_notified: false,
    environmental_notified_date: '',
    land_dept_notified: false,
    land_dept_notified_date: '',
    chief_notified: false,
    chief_notified_date: '',
    // Resolution tracking
    contractor_addressed: false,
    contractor_addressed_date: '',
    contractor_response: '',
    // Closure
    loop_closed: false,
    loop_closed_date: '',
    loop_closed_by: '',
    closure_notes: ''
  })
  
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
  
  // Expanded map state
  const [showExpandedMap, setShowExpandedMap] = useState(false)
  
  // Report generation state
  const [generatingReport, setGeneratingReport] = useState(false)
  const [showReportPreview, setShowReportPreview] = useState(false)
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
  const [dailyReportData, setDailyReportData] = useState(null)
  
  // Voice input state
  const [speechSupported, setSpeechSupported] = useState(false)
  const [isListening, setIsListening] = useState(null)
  const recognitionRef = useRef(null)
  const listeningFieldRef = useRef(null)
  
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
    if (isReady()) {
      fetchAllData()
    }
  }, [organizationId])

  useEffect(() => {
    if (!isReady()) return
    if (activeTab === 'review') fetchPendingReports()
    if (activeTab === 'assignments') fetchAssignments()
    if (activeTab === 'deficiencies') fetchDeficiencies()
    if (activeTab === 'compliance') fetchComplianceIssues()
    if (activeTab === 'observation') fetchExistingObservation()
  }, [activeTab, deficiencyFilter, assignmentDate, observationDate, organizationId])

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
      // Fetch recent reports for review (last 30 days)
      // Note: daily_reports table doesn't have a status column
      // Use report_status table for status tracking if needed
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      let pendingQuery = supabase
        .from('daily_reports')
        .select('*')
        .gte('date', thirtyDaysAgo)
        .order('date', { ascending: false })
      pendingQuery = addOrgFilter(pendingQuery)
      const { data: pending, error: pendingError } = await pendingQuery

      if (pendingError) {
        console.error('Error fetching reports:', pendingError)
      }
      setPendingReports(pending || [])

      // Note: assistant_chief_reviews table not yet created
      // For now, just set empty array
      setReviewedByMe([])
    } catch (err) {
      console.error('Error fetching reports:', err)
    }
    setReviewLoading(false)
  }

  async function submitReview() {
    if (!selectedReport) return

    // Note: Assistant Chief review functionality requires database schema updates
    // The daily_reports table doesn't have assistant_review columns yet
    // TODO: Create assistant_chief_reviews table or add columns to daily_reports
    alert('Review submission feature coming soon. The database schema for assistant chief reviews is being set up.')
    setSelectedReport(null)
    setReviewNotes('')
    setReviewStatus('reviewed')
  }

  // =============================================
  // STAFF ASSIGNMENT FUNCTIONS
  // =============================================
  async function fetchInspectors() {
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, role')
        .eq('role', 'inspector')
        .order('full_name')
      
      setInspectors(data || [])
    } catch (err) {
      console.error('Error fetching inspectors:', err)
    }
  }

  async function fetchAssignments() {
    // Note: inspector_assignments table not yet created
    // For now, just set empty array to prevent errors
    setAssignments([])
  }

  async function saveAssignment() {
    // Note: inspector_assignments table not yet created
    alert('Inspector assignment feature coming soon. Please coordinate assignments directly with inspectors.')
    setShowAssignmentModal(false)
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

      query = addOrgFilter(query)
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
          created_at: new Date().toISOString(),
          organization_id: getOrgId()
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
      // 1. Fetch contractor deficiencies (existing)
      let defQuery = supabase
        .from('contractor_deficiencies')
        .select('*')
        .in('category', ['safety', 'environmental', 'regulatory'])
        .eq('status', 'open')
      defQuery = addOrgFilter(defQuery)
      const { data: deficiencyData } = await defQuery

      setComplianceIssues(deficiencyData || [])

      // 2. Fetch hazard entries from assistant chief
      let hazardQuery = supabase
        .from('field_hazard_entries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      hazardQuery = addOrgFilter(hazardQuery)
      const { data: hazards } = await hazardQuery

      setHazardEntries(hazards || [])

      // 3. Fetch positive recognition entries
      let recQuery = supabase
        .from('field_recognition_entries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      recQuery = addOrgFilter(recQuery)
      const { data: recognition } = await recQuery

      setRecognitionEntries(recognition || [])

      // 4. Fetch wildlife sightings
      let wildlifeQuery = supabase
        .from('field_wildlife_entries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      wildlifeQuery = addOrgFilter(wildlifeQuery)
      const { data: wildlife } = await wildlifeQuery

      setWildlifeEntries(wildlife || [])

      // 5. Fetch compliance issues logged by assistant chief
      let compQuery = supabase
        .from('compliance_issues')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      compQuery = addOrgFilter(compQuery)
      const { data: compIssues } = await compQuery

      setComplianceEntries(compIssues || [])

      // 6. Fetch recent inspector safety notes (last 7 days)
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)

      let safetyQuery = supabase
        .from('daily_reports')
        .select('id, date, safety_notes, inspector_name')
        .gte('date', weekAgo.toISOString().split('T')[0])
        .not('safety_notes', 'is', null)
        .neq('safety_notes', '')
        .order('date', { ascending: false })
      safetyQuery = addOrgFilter(safetyQuery)
      const { data: safetyNotes } = await safetyQuery

      setInspectorSafetyNotes(safetyNotes || [])

      // 7. Fetch recent inspector environmental notes
      let envQuery = supabase
        .from('daily_reports')
        .select('id, date, land_environment, inspector_name, wildlife_sighting')
        .gte('date', weekAgo.toISOString().split('T')[0])
        .order('date', { ascending: false })
      envQuery = addOrgFilter(envQuery)
      const { data: envNotes } = await envQuery

      setInspectorEnvironmentNotes(envNotes?.filter(n => n.land_environment || n.wildlife_sighting?.sightings?.length > 0) || [])

    } catch (err) {
      console.error('Error fetching compliance data:', err)
    }
    setComplianceLoading(false)
  }

  // Save Hazard Entry
  async function saveHazardEntry() {
    if (!newHazard.description) {
      alert('Please enter a hazard description')
      return
    }
    try {
      const { error } = await supabase
        .from('field_hazard_entries')
        .insert({
          description: newHazard.description,
          location_kp: newHazard.location_kp ? parseFloat(newHazard.location_kp) : null,
          severity: newHazard.severity,
          corrective_action: newHazard.corrective_action,
          reported_by: userProfile?.id,
          reported_by_name: userProfile?.full_name,
          entry_date: new Date().toISOString().split('T')[0],
          created_at: new Date().toISOString(),
          organization_id: getOrgId()
        })
      
      if (error) throw error
      alert('Hazard entry saved!')
      setNewHazard({ description: '', location_kp: '', severity: 'low', corrective_action: '' })
      setShowHazardForm(false)
      fetchComplianceIssues()
    } catch (err) {
      console.error('Error saving hazard:', err)
      alert('Error: ' + err.message)
    }
  }

  // Save Recognition Entry
  async function saveRecognitionEntry() {
    if (!newRecognition.person_name || !newRecognition.description) {
      alert('Please enter person name and description')
      return
    }
    try {
      const { error } = await supabase
        .from('field_recognition_entries')
        .insert({
          person_name: newRecognition.person_name,
          description: newRecognition.description,
          category: newRecognition.category,
          reported_by: userProfile?.id,
          reported_by_name: userProfile?.full_name,
          entry_date: new Date().toISOString().split('T')[0],
          created_at: new Date().toISOString(),
          organization_id: getOrgId()
        })
      
      if (error) throw error
      alert('Recognition saved!')
      setNewRecognition({ person_name: '', description: '', category: 'ppe' })
      setShowRecognitionForm(false)
      fetchComplianceIssues()
    } catch (err) {
      console.error('Error saving recognition:', err)
      alert('Error: ' + err.message)
    }
  }

  // Save Wildlife Entry
  async function saveWildlifeEntry() {
    if (!newWildlife.species) {
      alert('Please enter species name')
      return
    }
    try {
      const { error } = await supabase
        .from('field_wildlife_entries')
        .insert({
          species: newWildlife.species,
          count: parseInt(newWildlife.count) || 1,
          behavior: newWildlife.behavior,
          location_kp: newWildlife.location_kp ? parseFloat(newWildlife.location_kp) : null,
          reported_by: userProfile?.id,
          reported_by_name: userProfile?.full_name,
          entry_date: new Date().toISOString().split('T')[0],
          created_at: new Date().toISOString(),
          organization_id: getOrgId()
        })
      
      if (error) throw error
      alert('Wildlife sighting saved!')
      setNewWildlife({ species: '', count: '1', behavior: '', location_kp: '' })
      setShowWildlifeForm(false)
      fetchComplianceIssues()
    } catch (err) {
      console.error('Error saving wildlife:', err)
      alert('Error: ' + err.message)
    }
  }

  // Save Compliance Issue
  async function saveComplianceIssue() {
    if (!newComplianceIssue.description) {
      alert('Please enter issue description')
      return
    }
    try {
      const issueData = {
        ...newComplianceIssue,
        location_kp: newComplianceIssue.location_kp ? parseFloat(newComplianceIssue.location_kp) : null,
        reported_by: userProfile?.id,
        reported_by_name: userProfile?.full_name,
        entry_date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        organization_id: getOrgId()
      }
      
      if (selectedComplianceIssue) {
        // Update existing
        const { error } = await supabase
          .from('compliance_issues')
          .update({ ...issueData, updated_at: new Date().toISOString() })
          .eq('id', selectedComplianceIssue.id)
        
        if (error) throw error
        alert('Compliance issue updated!')
      } else {
        // Insert new
        const { error } = await supabase
          .from('compliance_issues')
          .insert(issueData)
        
        if (error) throw error
        alert('Compliance issue logged!')
      }
      
      resetComplianceForm()
      fetchComplianceIssues()
    } catch (err) {
      console.error('Error saving compliance issue:', err)
      alert('Error: ' + err.message)
    }
  }

  function resetComplianceForm() {
    setNewComplianceIssue({
      category: 'safety',
      description: '',
      location_kp: '',
      severity: 'minor',
      contractor_notified: false,
      contractor_notified_date: '',
      contractor_notified_person: '',
      safety_notified: false,
      safety_notified_date: '',
      environmental_notified: false,
      environmental_notified_date: '',
      land_dept_notified: false,
      land_dept_notified_date: '',
      chief_notified: false,
      chief_notified_date: '',
      contractor_addressed: false,
      contractor_addressed_date: '',
      contractor_response: '',
      loop_closed: false,
      loop_closed_date: '',
      loop_closed_by: '',
      closure_notes: ''
    })
    setSelectedComplianceIssue(null)
    setShowComplianceForm(false)
  }

  function editComplianceIssue(issue) {
    setNewComplianceIssue({
      category: issue.category || 'safety',
      description: issue.description || '',
      location_kp: issue.location_kp?.toString() || '',
      severity: issue.severity || 'minor',
      contractor_notified: issue.contractor_notified || false,
      contractor_notified_date: issue.contractor_notified_date || '',
      contractor_notified_person: issue.contractor_notified_person || '',
      safety_notified: issue.safety_notified || false,
      safety_notified_date: issue.safety_notified_date || '',
      environmental_notified: issue.environmental_notified || false,
      environmental_notified_date: issue.environmental_notified_date || '',
      land_dept_notified: issue.land_dept_notified || false,
      land_dept_notified_date: issue.land_dept_notified_date || '',
      chief_notified: issue.chief_notified || false,
      chief_notified_date: issue.chief_notified_date || '',
      contractor_addressed: issue.contractor_addressed || false,
      contractor_addressed_date: issue.contractor_addressed_date || '',
      contractor_response: issue.contractor_response || '',
      loop_closed: issue.loop_closed || false,
      loop_closed_date: issue.loop_closed_date || '',
      loop_closed_by: issue.loop_closed_by || '',
      closure_notes: issue.closure_notes || ''
    })
    setSelectedComplianceIssue(issue)
    setShowComplianceForm(true)
  }

  // Save SafetyRecognition cards to database
  async function saveSafetyRecognitionData() {
    if (!safetyRecognitionData.cards?.length) {
      alert('No cards to save')
      return
    }
    try {
      // Save each card as a safety recognition entry
      for (const card of safetyRecognitionData.cards) {
        const { error } = await supabase
          .from('assistant_chief_safety_cards')
          .insert({
            card_type: card.cardType,
            observer_name: card.observerName || userProfile?.full_name,
            observer_date: card.observerDate || new Date().toISOString().split('T')[0],
            observee_name: card.observeeName,
            location: card.location,
            company_type: card.companyType,
            cause_type: card.causeType,
            situation_description: card.situationDescription,
            what_could_have_happened: card.whatCouldHaveHappened,
            dialogue_occurred: card.dialogueOccurred,
            dialogue_comment: card.dialogueComment,
            questions_asked: card.questionsAsked,
            responses: card.responses,
            actions: card.actions,
            acknowledged: card.acknowledged,
            incident_number: card.incidentNumber,
            supervisor_signoff: card.supervisorSignoff,
            comments: card.comments,
            reported_by: userProfile?.id,
            created_at: new Date().toISOString(),
            organization_id: getOrgId()
          })
        
        if (error) throw error
      }
      
      alert(`Saved ${safetyRecognitionData.cards.length} safety card(s)!`)
      setSafetyRecognitionData({ enabled: false, cards: [] })
      fetchComplianceIssues()
    } catch (err) {
      console.error('Error saving safety cards:', err)
      alert('Error: ' + err.message)
    }
  }

  // Save WildlifeSighting data to database
  async function saveWildlifeSightingData() {
    if (!wildlifeSightingData.sightings?.length) {
      alert('No sightings to save')
      return
    }
    try {
      // Save each sighting
      for (const sighting of wildlifeSightingData.sightings) {
        const { error } = await supabase
          .from('assistant_chief_wildlife')
          .insert({
            sighting_date: sighting.date || new Date().toISOString().split('T')[0],
            sighting_time: sighting.time,
            inspector_name: sighting.inspector || userProfile?.full_name,
            crew: sighting.crew,
            species: sighting.species,
            other_species: sighting.otherSpecies,
            species_detail: sighting.speciesDetail,
            location: sighting.location,
            gps_coordinates: sighting.gpsCoordinates,
            number_of_animals: sighting.numberOfAnimals ? parseInt(sighting.numberOfAnimals) : null,
            gender: sighting.gender,
            age_group: sighting.ageGroup,
            activity: sighting.activity,
            mortality: sighting.mortality,
            mortality_cause: sighting.mortalityCause,
            comments: sighting.comments,
            photo_taken: sighting.photoTaken,
            reported_by: userProfile?.id,
            created_at: new Date().toISOString(),
            organization_id: getOrgId()
          })
        
        if (error) throw error
      }
      
      alert(`Saved ${wildlifeSightingData.sightings.length} wildlife sighting(s)!`)
      setWildlifeSightingData({ enabled: false, sightings: [] })
      fetchComplianceIssues()
    } catch (err) {
      console.error('Error saving wildlife sightings:', err)
      alert('Error: ' + err.message)
    }
  }

  // =============================================
  // DAILY REPORT GENERATION
  // =============================================
  
  // Gather all data for the daily report
  async function gatherDailyReportData() {
    const data = {
      date: reportDate,
      generatedAt: new Date().toISOString(),
      generatedBy: userProfile?.full_name,
      weather: weatherData,
      observation: null,
      complianceIssues: [],
      hazardEntries: [],
      safetyCards: [],
      wildlifeSightings: [],
      inspectorReports: []
    }

    try {
      // 1. Get observation for the date
      let obsQuery = supabase
        .from('assistant_chief_observations')
        .select('*')
        .eq('observation_date', reportDate)
        .eq('observer_id', userProfile?.id)
      obsQuery = addOrgFilter(obsQuery)
      const { data: obs } = await obsQuery.single()

      data.observation = obs

      // 2. Get compliance issues logged today
      let issuesQuery = supabase
        .from('compliance_issues')
        .select('*')
        .eq('entry_date', reportDate)
        .eq('reported_by', userProfile?.id)
      issuesQuery = addOrgFilter(issuesQuery)
      const { data: issues } = await issuesQuery

      data.complianceIssues = issues || []

      // 3. Get hazard entries for today
      let hazardsQuery = supabase
        .from('field_hazard_entries')
        .select('*')
        .eq('entry_date', reportDate)
        .eq('reported_by', userProfile?.id)
      hazardsQuery = addOrgFilter(hazardsQuery)
      const { data: hazards } = await hazardsQuery

      data.hazardEntries = hazards || []

      // 4. Get safety cards for today
      let cardsQuery = supabase
        .from('assistant_chief_safety_cards')
        .select('*')
        .eq('observer_date', reportDate)
        .eq('reported_by', userProfile?.id)
      cardsQuery = addOrgFilter(cardsQuery)
      const { data: cards } = await cardsQuery

      data.safetyCards = cards || []

      // 5. Get wildlife sightings for today
      let wildlifeQuery = supabase
        .from('assistant_chief_wildlife')
        .select('*')
        .eq('sighting_date', reportDate)
        .eq('reported_by', userProfile?.id)
      wildlifeQuery = addOrgFilter(wildlifeQuery)
      const { data: wildlife } = await wildlifeQuery

      data.wildlifeSightings = wildlife || []

      // 6. Get inspector reports for today (summary)
      let inspQuery = supabase
        .from('daily_reports')
        .select('id, inspector_name, date, safety_notes, land_environment')
        .eq('date', reportDate)
      inspQuery = addOrgFilter(inspQuery)
      const { data: inspReports } = await inspQuery

      data.inspectorReports = inspReports || []

    } catch (err) {
      console.error('Error gathering report data:', err)
    }

    return data
  }

  // Generate PDF Report
  async function generateDailyReport() {
    setGeneratingReport(true)
    
    try {
      const data = await gatherDailyReportData()
      setDailyReportData(data)
      
      const doc = new jsPDF()
      let y = 20
      const leftMargin = 20
      const pageWidth = 170
      const lineHeight = 6
      
      // Helper function to add text with word wrap
      const addWrappedText = (text, x, startY, maxWidth, fontSize = 10) => {
        doc.setFontSize(fontSize)
        const lines = doc.splitTextToSize(text || '', maxWidth)
        lines.forEach(line => {
          if (y > 270) {
            doc.addPage()
            y = 20
          }
          doc.text(line, x, y)
          y += lineHeight
        })
        return y
      }
      
      // Helper for section headers
      const addSectionHeader = (title, color = [0, 123, 255]) => {
        if (y > 250) {
          doc.addPage()
          y = 20
        }
        y += 5
        doc.setFillColor(...color)
        doc.rect(leftMargin - 5, y - 5, pageWidth + 10, 10, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text(title, leftMargin, y + 2)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        y += 15
      }
      
      // ==========================================
      // HEADER
      // ==========================================
      doc.setFillColor(44, 82, 130)
      doc.rect(0, 0, 220, 40, 'F')
      
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('Assistant Chief Inspector', leftMargin, 18)
      doc.text('Daily Field Report', leftMargin, 28)
      
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Date: ${data.date}`, 150, 18)
      doc.text(`Generated: ${new Date().toLocaleString()}`, 150, 25)
      doc.text(`By: ${data.generatedBy}`, 150, 32)
      
      doc.setTextColor(0, 0, 0)
      y = 50
      
      // ==========================================
      // WEATHER CONDITIONS
      // ==========================================
      if (data.weather?.conditions || data.observation?.weather_conditions) {
        addSectionHeader('Weather Conditions', [23, 162, 184])
        const weatherText = data.observation?.weather_conditions || 
          `${data.weather?.conditions || ''}, High: ${data.weather?.tempHigh || '-'}°C, Low: ${data.weather?.tempLow || '-'}°C, Wind: ${data.weather?.windSpeed || '-'} km/h`
        addWrappedText(weatherText, leftMargin, y, pageWidth)
        if (data.observation?.time_on_row) {
          addWrappedText(`Time on ROW: ${data.observation.time_on_row}`, leftMargin, y, pageWidth)
        }
        y += 5
      }
      
      // ==========================================
      // DAILY OBSERVATIONS
      // ==========================================
      if (data.observation) {
        const obs = data.observation
        
        // Safety Observations
        if (obs.safety_observations) {
          addSectionHeader('🦺 Safety Observations', [220, 53, 69])
          if (obs.safety_flagged) {
            doc.setTextColor(220, 53, 69)
            doc.setFont('helvetica', 'bold')
            doc.text('⚠️ FLAGGED FOR CHIEF REVIEW', leftMargin, y)
            doc.setTextColor(0, 0, 0)
            doc.setFont('helvetica', 'normal')
            y += lineHeight + 2
          }
          addWrappedText(obs.safety_observations, leftMargin, y, pageWidth)
          y += 5
        }
        
        // Environmental Compliance
        if (obs.environmental_compliance) {
          addSectionHeader('🌿 Environmental Compliance', [40, 167, 69])
          if (obs.environmental_flagged) {
            doc.setTextColor(40, 167, 69)
            doc.setFont('helvetica', 'bold')
            doc.text('⚠️ FLAGGED FOR CHIEF REVIEW', leftMargin, y)
            doc.setTextColor(0, 0, 0)
            doc.setFont('helvetica', 'normal')
            y += lineHeight + 2
          }
          addWrappedText(obs.environmental_compliance, leftMargin, y, pageWidth)
          y += 5
        }
        
        // Technical/Quality
        if (obs.technical_quality) {
          addSectionHeader('🔧 Technical / Quality', [23, 162, 184])
          if (obs.technical_flagged) {
            doc.setTextColor(23, 162, 184)
            doc.setFont('helvetica', 'bold')
            doc.text('⚠️ FLAGGED FOR CHIEF REVIEW', leftMargin, y)
            doc.setTextColor(0, 0, 0)
            doc.setFont('helvetica', 'normal')
            y += lineHeight + 2
          }
          addWrappedText(obs.technical_quality, leftMargin, y, pageWidth)
          y += 5
        }
        
        // Progress/Logistics
        if (obs.progress_logistics) {
          addSectionHeader('📊 Progress / Logistics', [255, 193, 7])
          if (obs.progress_flagged) {
            doc.setTextColor(133, 100, 4)
            doc.setFont('helvetica', 'bold')
            doc.text('⚠️ FLAGGED FOR CHIEF REVIEW', leftMargin, y)
            doc.setTextColor(0, 0, 0)
            doc.setFont('helvetica', 'normal')
            y += lineHeight + 2
          }
          addWrappedText(obs.progress_logistics, leftMargin, y, pageWidth)
          y += 5
        }
        
        // General Notes
        if (obs.general_notes) {
          addSectionHeader('📋 General Notes', [108, 117, 125])
          addWrappedText(obs.general_notes, leftMargin, y, pageWidth)
          y += 5
        }
      }
      
      // ==========================================
      // COMPLIANCE ISSUES
      // ==========================================
      if (data.complianceIssues.length > 0) {
        addSectionHeader(`🚨 Compliance Issues (${data.complianceIssues.length})`, [220, 53, 69])
        
        data.complianceIssues.forEach((issue, idx) => {
          doc.setFont('helvetica', 'bold')
          doc.text(`${idx + 1}. [${issue.severity?.toUpperCase()}] ${issue.category?.toUpperCase()}`, leftMargin, y)
          doc.setFont('helvetica', 'normal')
          y += lineHeight
          
          if (issue.location_kp) {
            doc.text(`   Location: KP ${issue.location_kp.toFixed(3)}`, leftMargin, y)
            y += lineHeight
          }
          
          addWrappedText(`   ${issue.description}`, leftMargin, y, pageWidth - 10)
          
          // Notification status
          const notifications = []
          if (issue.contractor_notified) notifications.push('Contractor')
          if (issue.safety_notified) notifications.push('Safety')
          if (issue.environmental_notified) notifications.push('Environmental')
          if (issue.chief_notified) notifications.push('Chief')
          
          if (notifications.length > 0) {
            doc.text(`   Notified: ${notifications.join(', ')}`, leftMargin, y)
            y += lineHeight
          }
          
          if (issue.contractor_addressed) {
            doc.setTextColor(40, 167, 69)
            doc.text(`   ✓ Contractor Addressed: ${issue.contractor_response || 'Yes'}`, leftMargin, y)
            doc.setTextColor(0, 0, 0)
            y += lineHeight
          }
          
          y += 5
        })
      }
      
      // ==========================================
      // HAZARD AWARENESS
      // ==========================================
      if (data.hazardEntries.length > 0) {
        addSectionHeader(`⚠️ Hazard Entries (${data.hazardEntries.length})`, [253, 126, 20])
        
        data.hazardEntries.forEach((hazard, idx) => {
          const severityColor = hazard.severity === 'high' ? [220, 53, 69] : 
                               hazard.severity === 'medium' ? [255, 193, 7] : [40, 167, 69]
          doc.setTextColor(...severityColor)
          doc.setFont('helvetica', 'bold')
          doc.text(`${idx + 1}. [${hazard.severity?.toUpperCase()}]`, leftMargin, y)
          doc.setTextColor(0, 0, 0)
          doc.setFont('helvetica', 'normal')
          
          if (hazard.location_kp) {
            doc.text(` - KP ${hazard.location_kp.toFixed(3)}`, leftMargin + 30, y)
          }
          y += lineHeight
          
          addWrappedText(`   ${hazard.description}`, leftMargin, y, pageWidth - 10)
          
          if (hazard.corrective_action) {
            doc.setTextColor(40, 167, 69)
            addWrappedText(`   ✓ Action: ${hazard.corrective_action}`, leftMargin, y, pageWidth - 10)
            doc.setTextColor(0, 0, 0)
          }
          y += 3
        })
      }
      
      // ==========================================
      // SAFETY RECOGNITION CARDS
      // ==========================================
      if (data.safetyCards.length > 0) {
        addSectionHeader(`🏆 Safety Cards (${data.safetyCards.length})`, [40, 167, 69])
        
        data.safetyCards.forEach((card, idx) => {
          const cardType = card.card_type === 'positive' ? 'Positive Recognition' : 'Hazard ID (SAFE)'
          doc.setFont('helvetica', 'bold')
          doc.text(`${idx + 1}. ${cardType}`, leftMargin, y)
          doc.setFont('helvetica', 'normal')
          y += lineHeight
          
          if (card.observee_name) {
            doc.text(`   Person: ${card.observee_name}`, leftMargin, y)
            y += lineHeight
          }
          if (card.location) {
            doc.text(`   Location: ${card.location}`, leftMargin, y)
            y += lineHeight
          }
          if (card.situation_description) {
            addWrappedText(`   ${card.situation_description}`, leftMargin, y, pageWidth - 10)
          }
          y += 3
        })
      }
      
      // ==========================================
      // WILDLIFE SIGHTINGS
      // ==========================================
      if (data.wildlifeSightings.length > 0) {
        addSectionHeader(`🦌 Wildlife Sightings (${data.wildlifeSightings.length})`, [32, 201, 151])
        
        data.wildlifeSightings.forEach((sighting, idx) => {
          const speciesList = Array.isArray(sighting.species) ? sighting.species.join(', ') : sighting.species
          doc.setFont('helvetica', 'bold')
          doc.text(`${idx + 1}. ${speciesList || 'Unknown'}`, leftMargin, y)
          doc.setFont('helvetica', 'normal')
          y += lineHeight
          
          if (sighting.number_of_animals) {
            doc.text(`   Count: ${sighting.number_of_animals}`, leftMargin, y)
            y += lineHeight
          }
          if (sighting.location) {
            doc.text(`   Location: ${sighting.location}`, leftMargin, y)
            y += lineHeight
          }
          if (sighting.activity) {
            addWrappedText(`   Activity: ${sighting.activity}`, leftMargin, y, pageWidth - 10)
          }
          if (sighting.mortality === 'yes') {
            doc.setTextColor(220, 53, 69)
            doc.text(`   ⚠️ Mortality: ${sighting.mortality_cause || 'Unknown cause'}`, leftMargin, y)
            doc.setTextColor(0, 0, 0)
            y += lineHeight
          }
          y += 3
        })
      }
      
      // ==========================================
      // INSPECTOR REPORTS SUMMARY
      // ==========================================
      if (data.inspectorReports.length > 0) {
        addSectionHeader(`📋 Inspector Reports Summary (${data.inspectorReports.length})`, [111, 66, 193])
        
        data.inspectorReports.forEach(report => {
          doc.setFont('helvetica', 'bold')
          doc.text(`• ${report.inspector_name}`, leftMargin, y)
          doc.setFont('helvetica', 'normal')
          y += lineHeight
          
          if (report.safety_notes) {
            addWrappedText(`  Safety: ${report.safety_notes.substring(0, 150)}...`, leftMargin, y, pageWidth - 10)
          }
          y += 3
        })
      }
      
      // ==========================================
      // FOOTER - SIGNATURE BLOCK
      // ==========================================
      if (y > 220) {
        doc.addPage()
        y = 20
      }
      
      y += 20
      doc.setDrawColor(0, 0, 0)
      doc.line(leftMargin, y, leftMargin + 80, y)
      doc.text('Assistant Chief Inspector Signature', leftMargin, y + 8)
      
      doc.line(leftMargin + 100, y, leftMargin + 160, y)
      doc.text('Date', leftMargin + 100, y + 8)
      
      y += 25
      doc.line(leftMargin, y, leftMargin + 80, y)
      doc.text('Chief Inspector Review', leftMargin, y + 8)
      
      doc.line(leftMargin + 100, y, leftMargin + 160, y)
      doc.text('Date', leftMargin + 100, y + 8)
      
      // ==========================================
      // SAVE PDF
      // ==========================================
      const fileName = `Assistant_Chief_Report_${data.date}.pdf`
      const pdfBlob = doc.output('blob')
      
      // Upload to Supabase Storage
      const filePath = `assistant-chief-reports/${fileName}`
      const { error: uploadError } = await supabase.storage
        .from('reports')
        .upload(filePath, pdfBlob, { upsert: true })
      
      if (uploadError) {
        console.error('Upload error:', uploadError)
        // Still allow download even if upload fails
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('reports')
        .getPublicUrl(filePath)
      
      // Save report record to database for Chief review
      const { error: dbError } = await supabase
        .from('assistant_chief_daily_reports')
        .upsert({
          report_date: data.date,
          reporter_id: userProfile?.id,
          reporter_name: userProfile?.full_name,
          pdf_url: urlData?.publicUrl,
          pdf_path: filePath,
          status: 'pending_review',
          observation_id: data.observation?.id,
          compliance_issues_count: data.complianceIssues.length,
          hazard_entries_count: data.hazardEntries.length,
          safety_cards_count: data.safetyCards.length,
          wildlife_sightings_count: data.wildlifeSightings.length,
          has_flagged_items: data.observation?.safety_flagged || data.observation?.environmental_flagged ||
                            data.observation?.technical_flagged || data.observation?.progress_flagged,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          organization_id: getOrgId()
        }, { onConflict: 'report_date,reporter_id' })
      
      if (dbError) {
        console.error('DB save error:', dbError)
      }
      
      // Download the PDF
      doc.save(fileName)
      
      alert(`Report generated and submitted for Chief review!\n\nFile: ${fileName}`)
      
    } catch (err) {
      console.error('Error generating report:', err)
      alert('Error generating report: ' + err.message)
    }
    
    setGeneratingReport(false)
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
      let historyQuery = supabase
        .from('assistant_chief_observations')
        .select('id, observation_date, safety_flagged, environmental_flagged, technical_flagged, progress_flagged, created_at')
        .eq('observer_id', userProfile?.id)
        .order('observation_date', { ascending: false })
        .limit(10)
      historyQuery = addOrgFilter(historyQuery)
      const { data: history } = await historyQuery

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
        updated_at: new Date().toISOString(),
        organization_id: getOrgId()
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

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      setSpeechSupported(true)
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      
      recognition.onstart = () => console.log('🎤 Voice started')
      recognition.onerror = (event) => {
        console.error('Speech error:', event.error)
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please allow microphone access in your browser settings.')
          setIsListening(null)
        } else if (event.error === 'network') {
          alert('Network error. Speech recognition requires an internet connection.')
          setIsListening(null)
        }
      }

      recognition.onresult = (event) => {
        const currentField = listeningFieldRef.current
        let finalTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          const isFinal = event.results[i].isFinal
          if (isFinal) {
            finalTranscript += transcript
          }
        }
        
        if (finalTranscript && currentField) {
          let processed = finalTranscript.trim()
          if (processed.length > 0) {
            processed = processed.charAt(0).toUpperCase() + processed.slice(1)
          }
          if (processed.length > 0 && !/[.!?,;:\-]$/.test(processed)) {
            processed += '.'
          }
          processed = processed + ' '
          
          // Update the appropriate field based on fieldId
          if (currentField === 'hazard_description') {
            setNewHazard(prev => ({ ...prev, description: (prev.description || '') + processed }))
          } else if (currentField === 'recognition_description') {
            setNewRecognition(prev => ({ ...prev, description: (prev.description || '') + processed }))
          } else if (currentField === 'compliance_description') {
            setNewComplianceIssue(prev => ({ ...prev, description: (prev.description || '') + processed }))
          } else {
            // Update the observation fields
            setObservation(prev => ({
              ...prev,
              [currentField]: (prev[currentField] || '') + processed
            }))
          }
        }
      }

      recognition.onend = () => {
        const currentField = listeningFieldRef.current
        if (currentField && recognitionRef.current) {
          try {
            recognitionRef.current.start()
          } catch (e) {
            console.log('Restart error:', e)
          }
        }
      }
      
      recognitionRef.current = recognition
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  // Start/stop voice input for a specific field
  function startVoiceInput(fieldId) {
    if (!speechSupported) {
      alert('Speech recognition is not supported in your browser. Try Chrome or Edge.')
      return
    }
    
    if (isListening === fieldId) {
      // Stop listening
      setIsListening(null)
      recognitionRef.current.stop()
      setTimeout(() => {
        if (!isListening) {
          listeningFieldRef.current = null
        }
      }, 1000)
    } else {
      // Stop any current listening first
      if (isListening) {
        recognitionRef.current.stop()
      }
      
      listeningFieldRef.current = fieldId
      setIsListening(fieldId)
      
      try {
        recognitionRef.current.start()
      } catch (e) {
        if (!e.message?.includes('already started')) {
          alert('Could not start voice recognition: ' + e.message)
          listeningFieldRef.current = null
          setIsListening(null)
        }
      }
    }
  }

  // Voice input button component
  const VoiceButton = ({ fieldId, style }) => {
    if (!speechSupported) {
      return (
        <button
          type="button"
          onClick={() => alert('Voice input is not supported in this browser.\n\nPlease use Chrome, Edge, or Safari.')}
          style={{
            padding: '8px 12px',
            backgroundColor: '#adb5bd',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            opacity: 0.6,
            ...style
          }}
          title="Voice input not supported"
        >
          🎤 Voice
        </button>
      )
    }
    
    return (
      <button
        type="button"
        onClick={() => startVoiceInput(fieldId)}
        style={{
          padding: '8px 12px',
          backgroundColor: isListening === fieldId ? '#dc3545' : '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          animation: isListening === fieldId ? 'pulse 1s infinite' : 'none',
          transition: 'all 0.3s ease',
          ...style
        }}
        title={isListening === fieldId ? 'Stop recording' : 'Start voice input'}
      >
        {isListening === fieldId ? '⏹️ Stop' : '🎤 Voice'}
      </button>
    )
  }

  // =============================================
  // STATS
  // =============================================
  async function fetchStats() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      // Recent reports (last 30 days)
      // Note: daily_reports table doesn't have a status column
      let pendingQuery = supabase
        .from('daily_reports')
        .select('*', { count: 'exact', head: true })
        .gte('date', thirtyDaysAgo)
      pendingQuery = addOrgFilter(pendingQuery)
      const { count: pendingCount } = await pendingQuery

      // Note: assistant_chief_reviews table not yet created - set to 0
      const reviewedCount = 0

      // Open deficiencies - wrap in try/catch in case table doesn't exist
      let deficiencyCount = 0
      try {
        let deficiencyQuery = supabase
          .from('contractor_deficiencies')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open')
        deficiencyQuery = addOrgFilter(deficiencyQuery)
        const { count } = await deficiencyQuery
        deficiencyCount = count || 0
      } catch (e) {
        console.log('contractor_deficiencies table not available')
      }

      // Note: inspector_assignments table not yet created - count inspectors instead
      let inspectorQuery = supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'inspector')
      inspectorQuery = addOrgFilter(inspectorQuery)
      const { count: inspectorCount } = await inspectorQuery

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px' }}>Assistant Chief Inspector Dashboard</h1>
              <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>
                {userProfile?.full_name || userProfile?.email} • Support & Oversight
              </p>
            </div>
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
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => navigate(orgPath('/chief-dashboard'))} style={{ padding: '10px 20px', backgroundColor: '#1a5f2a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Chief Dashboard
            </button>
            <button onClick={() => navigate(orgPath('/dashboard'))} style={{ padding: '10px 20px', backgroundColor: '#4a5568', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
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
            <div style={{ fontSize: '12px', color: '#666' }}>Recent Reports (30d)</div>
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
          <button style={tabStyle(activeTab === 'generate-report')} onClick={() => setActiveTab('generate-report')}>
            📄 Generate Report
          </button>
          <button style={tabStyle(activeTab === 'efficiency')} onClick={() => setActiveTab('efficiency')}>
            📊 Efficiency
          </button>
          <button style={tabStyle(activeTab === 'calendar')} onClick={() => setActiveTab('calendar')}>
            📅 Calendar
          </button>
        </div>
      </div>

      {/* Mini Map Widget - Always visible */}
      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px', position: 'relative' }}>
          <MiniMapWidget 
            kpStart={0}
            kpEnd={47}
            showGPS={true}
            height="200px"
          />
          <button
            onClick={() => setShowExpandedMap(true)}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              padding: '8px 12px',
              backgroundColor: 'rgba(255,255,255,0.95)',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              zIndex: 1000
            }}
          >
            🗺️ Expand Map
          </button>
        </div>
      </div>

      {/* Expanded Map Modal */}
      {showExpandedMap && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '15px 20px',
            backgroundColor: '#2c5282',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>🗺️ Pipeline Map - Full View</h2>
            <button
              onClick={() => setShowExpandedMap(false)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              ✕ Close
            </button>
          </div>
          <div style={{ flex: 1, padding: '20px' }}>
            <MiniMapWidget 
              kpStart={0}
              kpEnd={47}
              showGPS={true}
              height="calc(100vh - 120px)"
            />
          </div>
        </div>
      )}

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
                        <td style={tdStyle}>{report.date}</td>
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
                    {selectedReport.date} • {selectedReport.inspector?.full_name}
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
        {/* COMPLIANCE TAB - Expanded with Field Entries */}
        {/* ============================================= */}
        {activeTab === 'compliance' && (
          <div>
            {/* Sub-tab Navigation */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {[
                { id: 'overview', label: '📊 Overview', color: '#28a745' },
                { id: 'issues', label: '🚨 Compliance Issues', color: '#dc3545', count: complianceEntries.filter(c => !c.loop_closed).length },
                { id: 'hazards', label: '⚠️ Hazard Awareness', color: '#fd7e14', count: hazardEntries.length },
                { id: 'recognition', label: '⭐ Positive Recognition', color: '#ffc107', count: recognitionEntries.length },
                { id: 'wildlife', label: '🦌 Wildlife Sightings', color: '#17a2b8', count: wildlifeEntries.length },
                { id: 'inspector-reports', label: '📋 Inspector Reports', color: '#6f42c1', count: inspectorSafetyNotes.length }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setComplianceTab(tab.id)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: complianceTab === tab.id ? tab.color : 'white',
                    color: complianceTab === tab.id ? 'white' : '#333',
                    border: `2px solid ${tab.color}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: complianceTab === tab.id ? 'bold' : 'normal'
                  }}
                >
                  {tab.label} {tab.count > 0 && <span style={{ marginLeft: '5px', backgroundColor: complianceTab === tab.id ? 'rgba(255,255,255,0.3)' : tab.color, color: complianceTab === tab.id ? 'white' : 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>{tab.count}</span>}
                </button>
              ))}
            </div>

            {/* OVERVIEW Sub-tab */}
            {complianceTab === 'overview' && (
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#28a745')}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>📊 Safety & Environmental Overview</h2>
                  <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                    Aggregated view from all sources
                  </p>
                </div>
                <div style={{ padding: '20px' }}>
                  {complianceLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                      <div style={{ backgroundColor: '#fff5f5', padding: '20px', borderRadius: '8px', textAlign: 'center', borderLeft: '4px solid #dc3545' }}>
                        <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#dc3545' }}>{hazardEntries.filter(h => h.severity === 'high').length}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>High Severity Hazards</div>
                      </div>
                      <div style={{ backgroundColor: '#fff8e7', padding: '20px', borderRadius: '8px', textAlign: 'center', borderLeft: '4px solid #ffc107' }}>
                        <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffc107' }}>{recognitionEntries.length}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>Positive Recognitions</div>
                      </div>
                      <div style={{ backgroundColor: '#f0fff4', padding: '20px', borderRadius: '8px', textAlign: 'center', borderLeft: '4px solid #28a745' }}>
                        <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#28a745' }}>{wildlifeEntries.length}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>Wildlife Sightings</div>
                      </div>
                      <div style={{ backgroundColor: '#f0f7ff', padding: '20px', borderRadius: '8px', textAlign: 'center', borderLeft: '4px solid #17a2b8' }}>
                        <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#17a2b8' }}>{complianceIssues.length}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>Open Deficiencies</div>
                      </div>
                    </div>
                  )}
                  
                  {/* Recent Activity Feed */}
                  <h4 style={{ marginTop: '25px', marginBottom: '15px' }}>📰 Recent Activity (Last 7 Days)</h4>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {inspectorSafetyNotes.slice(0, 5).map(note => (
                      <div key={note.id} style={{ padding: '10px 15px', borderBottom: '1px solid #eee', fontSize: '13px' }}>
                        <span style={badgeStyle('#dc3545')}>SAFETY</span>
                        <span style={{ marginLeft: '10px', color: '#666' }}>{note.date} - {note.inspector_name}</span>
                        <p style={{ margin: '5px 0 0 0', color: '#333' }}>{note.safety_notes?.substring(0, 150)}...</p>
                      </div>
                    ))}
                    {inspectorSafetyNotes.length === 0 && (
                      <p style={{ color: '#666', fontStyle: 'italic' }}>No recent inspector safety notes</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* COMPLIANCE ISSUES Sub-tab */}
            {complianceTab === 'issues' && (
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#dc3545')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '18px' }}>🚨 Compliance Issue Tracker</h2>
                      <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                        Log, track, and close compliance issues with full notification lifecycle
                      </p>
                    </div>
                    <button
                      onClick={() => { resetComplianceForm(); setShowComplianceForm(true); }}
                      style={{ padding: '10px 20px', backgroundColor: '#fff', color: '#dc3545', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      + Log New Issue
                    </button>
                  </div>
                </div>
                <div style={{ padding: '20px' }}>
                  {/* New/Edit Compliance Issue Form */}
                  {showComplianceForm && (
                    <div style={{ backgroundColor: '#fff5f5', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '2px solid #dc3545' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h3 style={{ margin: 0, color: '#dc3545' }}>
                          {selectedComplianceIssue ? '✏️ Edit Compliance Issue' : '🚨 New Compliance Issue'}
                        </h3>
                        <button onClick={resetComplianceForm} style={{ padding: '5px 10px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                          ✕ Cancel
                        </button>
                      </div>

                      {/* Issue Details Section */}
                      <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                        <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#333' }}>📋 Issue Details</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                          <div>
                            <label style={labelStyle}>Category *</label>
                            <select value={newComplianceIssue.category} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, category: e.target.value })} style={inputStyle}>
                              <option value="safety">Safety</option>
                              <option value="environmental">Environmental</option>
                              <option value="technical">Technical / Quality</option>
                              <option value="regulatory">Regulatory</option>
                              <option value="land">Land / ROW</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label style={labelStyle}>Severity *</label>
                            <select value={newComplianceIssue.severity} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, severity: e.target.value })} style={inputStyle}>
                              <option value="minor">Minor - Awareness</option>
                              <option value="moderate">Moderate - Needs Action</option>
                              <option value="major">Major - Urgent</option>
                              <option value="critical">Critical - Stop Work</option>
                            </select>
                          </div>
                          <div>
                            <label style={labelStyle}>Location (KP)</label>
                            <input type="number" step="0.001" value={newComplianceIssue.location_kp} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, location_kp: e.target.value })} style={inputStyle} placeholder="0.000" />
                          </div>
                        </div>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                            <label style={labelStyle}>Issue Description *</label>
                            <VoiceButton fieldId="compliance_description" />
                          </div>
                          <textarea 
                            value={newComplianceIssue.description} 
                            onChange={e => setNewComplianceIssue({ ...newComplianceIssue, description: e.target.value })} 
                            style={{ ...inputStyle, height: '100px', border: isListening === 'compliance_description' ? '2px solid #dc3545' : '1px solid #ced4da' }} 
                            placeholder="Describe the compliance issue in detail..." 
                          />
                        </div>
                      </div>

                      {/* Notifications Section */}
                      <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                        <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#333' }}>📢 Notifications</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                          {/* Contractor Notified */}
                          <div style={{ padding: '10px', backgroundColor: newComplianceIssue.contractor_notified ? '#d4edda' : '#f8f9fa', borderRadius: '4px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                              <input type="checkbox" checked={newComplianceIssue.contractor_notified} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, contractor_notified: e.target.checked })} />
                              <strong>Contractor Notified</strong>
                            </label>
                            {newComplianceIssue.contractor_notified && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <input type="date" value={newComplianceIssue.contractor_notified_date} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, contractor_notified_date: e.target.value })} style={{ ...inputStyle, fontSize: '12px' }} />
                                <input type="text" value={newComplianceIssue.contractor_notified_person} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, contractor_notified_person: e.target.value })} style={{ ...inputStyle, fontSize: '12px' }} placeholder="Person name" />
                              </div>
                            )}
                          </div>
                          
                          {/* Safety Notified */}
                          <div style={{ padding: '10px', backgroundColor: newComplianceIssue.safety_notified ? '#d4edda' : '#f8f9fa', borderRadius: '4px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                              <input type="checkbox" checked={newComplianceIssue.safety_notified} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, safety_notified: e.target.checked })} />
                              <strong>Safety Inspector Notified</strong>
                            </label>
                            {newComplianceIssue.safety_notified && (
                              <input type="date" value={newComplianceIssue.safety_notified_date} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, safety_notified_date: e.target.value })} style={{ ...inputStyle, fontSize: '12px' }} />
                            )}
                          </div>
                          
                          {/* Environmental Notified */}
                          <div style={{ padding: '10px', backgroundColor: newComplianceIssue.environmental_notified ? '#d4edda' : '#f8f9fa', borderRadius: '4px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                              <input type="checkbox" checked={newComplianceIssue.environmental_notified} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, environmental_notified: e.target.checked })} />
                              <strong>Environmental Inspector Notified</strong>
                            </label>
                            {newComplianceIssue.environmental_notified && (
                              <input type="date" value={newComplianceIssue.environmental_notified_date} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, environmental_notified_date: e.target.value })} style={{ ...inputStyle, fontSize: '12px' }} />
                            )}
                          </div>
                          
                          {/* Land Department Notified */}
                          <div style={{ padding: '10px', backgroundColor: newComplianceIssue.land_dept_notified ? '#d4edda' : '#f8f9fa', borderRadius: '4px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                              <input type="checkbox" checked={newComplianceIssue.land_dept_notified} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, land_dept_notified: e.target.checked })} />
                              <strong>Land Department Notified</strong>
                            </label>
                            {newComplianceIssue.land_dept_notified && (
                              <input type="date" value={newComplianceIssue.land_dept_notified_date} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, land_dept_notified_date: e.target.value })} style={{ ...inputStyle, fontSize: '12px' }} />
                            )}
                          </div>
                          
                          {/* Chief Inspector Notified */}
                          <div style={{ padding: '10px', backgroundColor: newComplianceIssue.chief_notified ? '#d4edda' : '#f8f9fa', borderRadius: '4px', gridColumn: 'span 2' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                              <input type="checkbox" checked={newComplianceIssue.chief_notified} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, chief_notified: e.target.checked })} />
                              <strong>Chief Inspector Notified</strong>
                            </label>
                            {newComplianceIssue.chief_notified && (
                              <input type="date" value={newComplianceIssue.chief_notified_date} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, chief_notified_date: e.target.value })} style={{ ...inputStyle, fontSize: '12px', maxWidth: '200px' }} />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Contractor Response Section */}
                      <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                        <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#333' }}>🔧 Contractor Response</h4>
                        <div style={{ padding: '10px', backgroundColor: newComplianceIssue.contractor_addressed ? '#d4edda' : '#fff3cd', borderRadius: '4px', marginBottom: '10px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                            <input type="checkbox" checked={newComplianceIssue.contractor_addressed} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, contractor_addressed: e.target.checked })} />
                            <strong>Contractor Has Addressed Issue</strong>
                          </label>
                          {newComplianceIssue.contractor_addressed && (
                            <div>
                              <input type="date" value={newComplianceIssue.contractor_addressed_date} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, contractor_addressed_date: e.target.value })} style={{ ...inputStyle, fontSize: '12px', marginBottom: '10px', maxWidth: '200px' }} />
                              <textarea value={newComplianceIssue.contractor_response} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, contractor_response: e.target.value })} style={{ ...inputStyle, height: '60px' }} placeholder="What action did the contractor take?" />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Loop Closure Section */}
                      <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                        <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#333' }}>✅ Loop Closure</h4>
                        <div style={{ padding: '10px', backgroundColor: newComplianceIssue.loop_closed ? '#d4edda' : '#f8f9fa', borderRadius: '4px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                            <input type="checkbox" checked={newComplianceIssue.loop_closed} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, loop_closed: e.target.checked })} />
                            <strong style={{ color: newComplianceIssue.loop_closed ? '#28a745' : '#333' }}>Issue Resolved & Loop Closed</strong>
                          </label>
                          {newComplianceIssue.loop_closed && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <div>
                                <label style={{ fontSize: '11px', color: '#666' }}>Closed Date</label>
                                <input type="date" value={newComplianceIssue.loop_closed_date} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, loop_closed_date: e.target.value })} style={{ ...inputStyle, fontSize: '12px' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: '11px', color: '#666' }}>Closed By</label>
                                <input type="text" value={newComplianceIssue.loop_closed_by} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, loop_closed_by: e.target.value })} style={{ ...inputStyle, fontSize: '12px' }} placeholder="Name" />
                              </div>
                              <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ fontSize: '11px', color: '#666' }}>Closure Notes</label>
                                <textarea value={newComplianceIssue.closure_notes} onChange={e => setNewComplianceIssue({ ...newComplianceIssue, closure_notes: e.target.value })} style={{ ...inputStyle, height: '60px' }} placeholder="How was the issue ultimately resolved?" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Save Button */}
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button onClick={resetComplianceForm} style={{ padding: '12px 24px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                          Cancel
                        </button>
                        <button onClick={saveComplianceIssue} style={{ padding: '12px 24px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                          {selectedComplianceIssue ? '💾 Update Issue' : '💾 Save Issue'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Issues List */}
                  {!showComplianceForm && (
                    <>
                      {/* Filter buttons */}
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                        <span style={{ fontWeight: 'bold', lineHeight: '36px' }}>Filter:</span>
                        <button onClick={() => {}} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                          Open ({complianceEntries.filter(c => !c.loop_closed).length})
                        </button>
                        <button onClick={() => {}} style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                          Closed ({complianceEntries.filter(c => c.loop_closed).length})
                        </button>
                      </div>

                      {complianceEntries.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                          <p>No compliance issues logged</p>
                          <button onClick={() => setShowComplianceForm(true)} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                            Log First Issue
                          </button>
                        </div>
                      ) : (
                        <div>
                          {complianceEntries.filter(c => !c.loop_closed).map(issue => (
                            <div key={issue.id} style={{ 
                              padding: '15px', 
                              marginBottom: '10px', 
                              borderRadius: '8px',
                              backgroundColor: issue.severity === 'critical' ? '#f8d7da' : issue.severity === 'major' ? '#fff3cd' : '#f8f9fa',
                              borderLeft: `4px solid ${issue.severity === 'critical' ? '#dc3545' : issue.severity === 'major' ? '#ffc107' : issue.severity === 'moderate' ? '#17a2b8' : '#28a745'}`
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                                <div>
                                  <span style={badgeStyle(
                                    issue.category === 'safety' ? '#dc3545' :
                                    issue.category === 'environmental' ? '#28a745' :
                                    issue.category === 'land' ? '#6f42c1' : '#17a2b8'
                                  )}>
                                    {issue.category?.toUpperCase()}
                                  </span>
                                  <span style={{ ...badgeStyle(
                                    issue.severity === 'critical' ? '#dc3545' :
                                    issue.severity === 'major' ? '#ffc107' :
                                    issue.severity === 'moderate' ? '#17a2b8' : '#28a745'
                                  ), marginLeft: '5px' }}>
                                    {issue.severity?.toUpperCase()}
                                  </span>
                                  <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                                    {issue.entry_date} {issue.location_kp && `• KP ${issue.location_kp.toFixed(3)}`}
                                  </span>
                                </div>
                                <button onClick={() => editComplianceIssue(issue)} style={{ padding: '5px 10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                  ✏️ Edit
                                </button>
                              </div>
                              <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>{issue.description}</p>
                              
                              {/* Status indicators */}
                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px' }}>
                                <span style={{ padding: '3px 8px', borderRadius: '3px', backgroundColor: issue.contractor_notified ? '#28a745' : '#dc3545', color: 'white' }}>
                                  {issue.contractor_notified ? '✓' : '✗'} Contractor
                                </span>
                                <span style={{ padding: '3px 8px', borderRadius: '3px', backgroundColor: issue.safety_notified ? '#28a745' : '#6c757d', color: 'white' }}>
                                  {issue.safety_notified ? '✓' : '○'} Safety
                                </span>
                                <span style={{ padding: '3px 8px', borderRadius: '3px', backgroundColor: issue.environmental_notified ? '#28a745' : '#6c757d', color: 'white' }}>
                                  {issue.environmental_notified ? '✓' : '○'} Environmental
                                </span>
                                <span style={{ padding: '3px 8px', borderRadius: '3px', backgroundColor: issue.chief_notified ? '#28a745' : '#6c757d', color: 'white' }}>
                                  {issue.chief_notified ? '✓' : '○'} Chief
                                </span>
                                <span style={{ padding: '3px 8px', borderRadius: '3px', backgroundColor: issue.contractor_addressed ? '#28a745' : '#ffc107', color: issue.contractor_addressed ? 'white' : '#000' }}>
                                  {issue.contractor_addressed ? '✓ Addressed' : '⏳ Pending'}
                                </span>
                              </div>
                              
                              {issue.contractor_response && (
                                <div style={{ marginTop: '10px', padding: '8px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '4px', fontSize: '12px' }}>
                                  <strong>Contractor Response:</strong> {issue.contractor_response}
                                </div>
                              )}
                            </div>
                          ))}
                          
                          {/* Closed Issues (collapsed) */}
                          {complianceEntries.filter(c => c.loop_closed).length > 0 && (
                            <div style={{ marginTop: '20px' }}>
                              <h4 style={{ color: '#28a745' }}>✅ Closed Issues ({complianceEntries.filter(c => c.loop_closed).length})</h4>
                              {complianceEntries.filter(c => c.loop_closed).slice(0, 5).map(issue => (
                                <div key={issue.id} style={{ padding: '10px', marginBottom: '5px', backgroundColor: '#d4edda', borderRadius: '4px', fontSize: '13px' }}>
                                  <span style={badgeStyle('#28a745')}>CLOSED</span>
                                  <span style={{ marginLeft: '10px' }}>{issue.description?.substring(0, 100)}...</span>
                                  <span style={{ marginLeft: '10px', color: '#666', fontSize: '11px' }}>Closed: {issue.loop_closed_date}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* HAZARD AWARENESS Sub-tab */}
            {complianceTab === 'hazards' && (
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#fd7e14')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '18px' }}>⚠️ Hazard Awareness</h2>
                      <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                        Document field hazards observed during walkdowns
                      </p>
                    </div>
                    <button
                      onClick={() => setShowHazardForm(!showHazardForm)}
                      style={{ padding: '10px 20px', backgroundColor: '#fff', color: '#dc3545', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      {showHazardForm ? '✕ Cancel' : '+ Log Hazard'}
                    </button>
                  </div>
                </div>
                <div style={{ padding: '20px' }}>
                  {/* New Hazard Form */}
                  {showHazardForm && (
                    <div style={{ backgroundColor: '#fff5f5', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dc3545' }}>
                      <h4 style={{ margin: '0 0 15px 0', color: '#dc3545' }}>New Hazard Entry</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                        <div>
                          <label style={labelStyle}>Severity *</label>
                          <select value={newHazard.severity} onChange={e => setNewHazard({ ...newHazard, severity: e.target.value })} style={inputStyle}>
                            <option value="low">Low - Awareness</option>
                            <option value="medium">Medium - Needs Attention</option>
                            <option value="high">High - Immediate Action</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Location (KP)</label>
                          <input type="number" step="0.001" value={newHazard.location_kp} onChange={e => setNewHazard({ ...newHazard, location_kp: e.target.value })} style={inputStyle} placeholder="0.000" />
                        </div>
                      </div>
                      <div style={{ marginBottom: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <label style={labelStyle}>Hazard Description *</label>
                          <VoiceButton fieldId="hazard_description" />
                        </div>
                        <textarea 
                          value={newHazard.description} 
                          onChange={e => setNewHazard({ ...newHazard, description: e.target.value })} 
                          style={{ ...inputStyle, height: '80px', border: isListening === 'hazard_description' ? '2px solid #dc3545' : '1px solid #ced4da' }} 
                          placeholder="Describe the hazard..." 
                        />
                      </div>
                      <div style={{ marginBottom: '15px' }}>
                        <label style={labelStyle}>Corrective Action Taken</label>
                        <textarea value={newHazard.corrective_action} onChange={e => setNewHazard({ ...newHazard, corrective_action: e.target.value })} style={{ ...inputStyle, height: '60px' }} placeholder="What was done to address this hazard?" />
                      </div>
                      <button onClick={saveHazardEntry} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Save Hazard Entry
                      </button>
                    </div>
                  )}

                  {/* Hazard List */}
                  {hazardEntries.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                      <p>No hazard entries yet</p>
                      <button onClick={() => setShowHazardForm(true)} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        Log First Hazard
                      </button>
                    </div>
                  ) : (
                    <div>
                      {hazardEntries.map(hazard => (
                        <div key={hazard.id} style={{ padding: '15px', borderBottom: '1px solid #eee', borderLeft: `4px solid ${hazard.severity === 'high' ? '#dc3545' : hazard.severity === 'medium' ? '#ffc107' : '#28a745'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div>
                              <span style={badgeStyle(hazard.severity === 'high' ? '#dc3545' : hazard.severity === 'medium' ? '#ffc107' : '#28a745')}>
                                {hazard.severity?.toUpperCase()}
                              </span>
                              <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                                {hazard.entry_date} • {hazard.reported_by_name}
                                {hazard.location_kp && ` • KP ${hazard.location_kp.toFixed(3)}`}
                              </span>
                            </div>
                          </div>
                          <p style={{ margin: '10px 0 5px 0' }}>{hazard.description}</p>
                          {hazard.corrective_action && (
                            <p style={{ margin: 0, fontSize: '12px', color: '#28a745' }}>✓ Action: {hazard.corrective_action}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* POSITIVE RECOGNITION Sub-tab - Using SafetyRecognition Component */}
            {complianceTab === 'recognition' && (
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#ffc107')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '18px', color: '#000' }}>🏆 Safety Recognition / Hazard ID Cards</h2>
                      <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#333' }}>
                        Same cards used by field inspectors - Positive Recognition &amp; Hazard ID
                      </p>
                    </div>
                    <button
                      onClick={saveSafetyRecognitionData}
                      disabled={!safetyRecognitionData.cards?.length}
                      style={{ 
                        padding: '10px 20px', 
                        backgroundColor: safetyRecognitionData.cards?.length ? '#28a745' : '#ccc', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '4px', 
                        cursor: safetyRecognitionData.cards?.length ? 'pointer' : 'not-allowed', 
                        fontWeight: 'bold' 
                      }}
                    >
                      💾 Save Cards
                    </button>
                  </div>
                </div>
                <div style={{ padding: '20px' }}>
                  <SafetyRecognition
                    data={safetyRecognitionData}
                    onChange={setSafetyRecognitionData}
                    inspectorName={userProfile?.full_name || ''}
                    reportDate={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            )}

            {/* WILDLIFE SIGHTINGS Sub-tab - Using WildlifeSighting Component */}
            {complianceTab === 'wildlife' && (
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#20c997')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '18px' }}>🦌 Wildlife Sighting Records</h2>
                      <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                        Same form used by field inspectors - Full wildlife documentation
                      </p>
                    </div>
                    <button
                      onClick={saveWildlifeSightingData}
                      disabled={!wildlifeSightingData.sightings?.length}
                      style={{ 
                        padding: '10px 20px', 
                        backgroundColor: wildlifeSightingData.sightings?.length ? '#28a745' : '#ccc', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '4px', 
                        cursor: wildlifeSightingData.sightings?.length ? 'pointer' : 'not-allowed', 
                        fontWeight: 'bold' 
                      }}
                    >
                      💾 Save Sightings
                    </button>
                  </div>
                </div>
                <div style={{ padding: '20px' }}>
                  <WildlifeSighting
                    data={wildlifeSightingData}
                    onChange={setWildlifeSightingData}
                    inspectorName={userProfile?.full_name || ''}
                    reportDate={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            )}

            {/* INSPECTOR REPORTS Sub-tab */}
            {complianceTab === 'inspector-reports' && (
              <div style={cardStyle}>
                <div style={cardHeaderStyle('#6f42c1')}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>📋 Inspector Safety & Environmental Reports</h2>
                  <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                    Aggregated from daily inspection reports (last 7 days)
                  </p>
                </div>
                <div style={{ padding: '20px' }}>
                  {/* Safety Notes from Inspectors */}
                  <h4 style={{ marginTop: 0, color: '#dc3545' }}>🦺 Safety Observations from Inspectors</h4>
                  {inspectorSafetyNotes.length === 0 ? (
                    <p style={{ color: '#666', fontStyle: 'italic' }}>No safety notes in the last 7 days</p>
                  ) : (
                    <div style={{ marginBottom: '25px' }}>
                      {inspectorSafetyNotes.map(note => (
                        <div key={note.id} style={{ padding: '12px 15px', borderBottom: '1px solid #eee', borderLeft: '3px solid #dc3545' }}>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                            <strong>{note.inspector_name}</strong> • {note.date}
                          </div>
                          <p style={{ margin: 0, fontSize: '14px' }}>{note.safety_notes}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Environmental Notes from Inspectors */}
                  <h4 style={{ color: '#28a745' }}>🌿 Environmental Observations from Inspectors</h4>
                  {inspectorEnvironmentNotes.length === 0 ? (
                    <p style={{ color: '#666', fontStyle: 'italic' }}>No environmental notes in the last 7 days</p>
                  ) : (
                    <div>
                      {inspectorEnvironmentNotes.map(note => (
                        <div key={note.id} style={{ padding: '12px 15px', borderBottom: '1px solid #eee', borderLeft: '3px solid #28a745' }}>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                            <strong>{note.inspector_name}</strong> • {note.date}
                          </div>
                          {note.land_environment && <p style={{ margin: '0 0 5px 0', fontSize: '14px' }}>{note.land_environment}</p>}
                          {note.wildlife_sighting?.sightings?.length > 0 && (
                            <div style={{ backgroundColor: '#f0fff4', padding: '8px', borderRadius: '4px', marginTop: '5px' }}>
                              <strong style={{ fontSize: '12px' }}>🦌 Wildlife:</strong>
                              {note.wildlife_sighting.sightings.map((s, i) => (
                                <span key={i} style={{ marginLeft: '10px', fontSize: '12px' }}>{s.species} ({s.count})</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <VoiceButton fieldId="safety_observations" />
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
                    </div>
                    <textarea
                      value={observation.safety_observations}
                      onChange={e => setObservation({ ...observation, safety_observations: e.target.value })}
                      style={{ ...inputStyle, height: '120px', resize: 'vertical', border: isListening === 'safety_observations' ? '2px solid #dc3545' : '1px solid #ced4da' }}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <VoiceButton fieldId="environmental_compliance" />
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
                    </div>
                    <textarea
                      value={observation.environmental_compliance}
                      onChange={e => setObservation({ ...observation, environmental_compliance: e.target.value })}
                      style={{ ...inputStyle, height: '120px', resize: 'vertical', border: isListening === 'environmental_compliance' ? '2px solid #28a745' : '1px solid #ced4da' }}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <VoiceButton fieldId="technical_quality" />
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
                    </div>
                    <textarea
                      value={observation.technical_quality}
                      onChange={e => setObservation({ ...observation, technical_quality: e.target.value })}
                      style={{ ...inputStyle, height: '120px', resize: 'vertical', border: isListening === 'technical_quality' ? '2px solid #17a2b8' : '1px solid #ced4da' }}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <VoiceButton fieldId="progress_logistics" />
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
                    </div>
                    <textarea
                      value={observation.progress_logistics}
                      onChange={e => setObservation({ ...observation, progress_logistics: e.target.value })}
                      style={{ ...inputStyle, height: '120px', resize: 'vertical', border: isListening === 'progress_logistics' ? '2px solid #ffc107' : '1px solid #ced4da' }}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <label style={labelStyle}>📋 General Notes</label>
                      <VoiceButton fieldId="general_notes" />
                    </div>
                    <textarea
                      value={observation.general_notes}
                      onChange={e => setObservation({ ...observation, general_notes: e.target.value })}
                      style={{ ...inputStyle, height: '100px', resize: 'vertical', border: isListening === 'general_notes' ? '2px solid #6c757d' : '1px solid #ced4da' }}
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

        {/* ============================================= */}
        {/* GENERATE REPORT TAB */}
        {/* ============================================= */}
        {activeTab === 'generate-report' && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle('#28a745')}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>📄 Generate Daily Report</h2>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
                Compile all daily data into a PDF report for Chief review
              </p>
            </div>
            <div style={{ padding: '30px' }}>
              {/* Date Selection */}
              <div style={{ marginBottom: '30px', textAlign: 'center' }}>
                <label style={{ fontSize: '16px', fontWeight: 'bold', marginRight: '15px' }}>Report Date:</label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={e => setReportDate(e.target.value)}
                  style={{ padding: '12px 20px', fontSize: '16px', borderRadius: '4px', border: '2px solid #28a745' }}
                />
              </div>

              {/* Data Summary Preview */}
              <div style={{ backgroundColor: '#f8f9fa', padding: '25px', borderRadius: '8px', marginBottom: '30px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>📊 Report Will Include:</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                  <div style={{ padding: '15px', backgroundColor: '#fff', borderRadius: '8px', borderLeft: '4px solid #6f42c1' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#6f42c1' }}>📝</div>
                    <div style={{ fontWeight: 'bold', marginTop: '5px' }}>Daily Observations</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Safety, Environmental, Technical, Progress</div>
                  </div>
                  <div style={{ padding: '15px', backgroundColor: '#fff', borderRadius: '8px', borderLeft: '4px solid #dc3545' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc3545' }}>🚨</div>
                    <div style={{ fontWeight: 'bold', marginTop: '5px' }}>Compliance Issues</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Logged issues with notification status</div>
                  </div>
                  <div style={{ padding: '15px', backgroundColor: '#fff', borderRadius: '8px', borderLeft: '4px solid #fd7e14' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fd7e14' }}>⚠️</div>
                    <div style={{ fontWeight: 'bold', marginTop: '5px' }}>Hazard Entries</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Field hazards with corrective actions</div>
                  </div>
                  <div style={{ padding: '15px', backgroundColor: '#fff', borderRadius: '8px', borderLeft: '4px solid #28a745' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>🏆</div>
                    <div style={{ fontWeight: 'bold', marginTop: '5px' }}>Safety Cards</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Positive recognition & Hazard ID</div>
                  </div>
                  <div style={{ padding: '15px', backgroundColor: '#fff', borderRadius: '8px', borderLeft: '4px solid #20c997' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#20c997' }}>🦌</div>
                    <div style={{ fontWeight: 'bold', marginTop: '5px' }}>Wildlife Sightings</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Species observed on ROW</div>
                  </div>
                  <div style={{ padding: '15px', backgroundColor: '#fff', borderRadius: '8px', borderLeft: '4px solid #6f42c1' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#6f42c1' }}>📋</div>
                    <div style={{ fontWeight: 'bold', marginTop: '5px' }}>Inspector Summary</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Key notes from field inspectors</div>
                  </div>
                </div>
              </div>

              {/* Flagged Items Warning */}
              <div style={{ backgroundColor: '#fff3cd', padding: '20px', borderRadius: '8px', marginBottom: '30px', borderLeft: '4px solid #ffc107' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>🚩 Items Flagged for Chief Review</h4>
                <p style={{ margin: 0, fontSize: '14px', color: '#856404' }}>
                  Any sections marked "Flag for Chief" in your Daily Observation will be highlighted in the report for the Chief Inspector's attention.
                </p>
              </div>

              {/* Generate Button */}
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={generateDailyReport}
                  disabled={generatingReport}
                  style={{
                    padding: '20px 60px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    backgroundColor: generatingReport ? '#6c757d' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: generatingReport ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  {generatingReport ? '⏳ Generating Report...' : '📄 Generate & Submit Report'}
                </button>
                <p style={{ marginTop: '15px', fontSize: '13px', color: '#666' }}>
                  Report will be saved as PDF and submitted for Chief Inspector review
                </p>
              </div>

              {/* Previous Reports */}
              <div style={{ marginTop: '40px', borderTop: '1px solid #dee2e6', paddingTop: '30px' }}>
                <h4 style={{ marginTop: 0 }}>📁 Previous Reports</h4>
                <p style={{ color: '#666', fontSize: '13px' }}>
                  Your submitted reports will appear here once the database table is created.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ============================================= */}
        {/* EFFICIENCY TAB */}
        {/* ============================================= */}
        {activeTab === 'efficiency' && (
          <ShadowAuditDashboard />
        )}

        {/* ============================================= */}
        {/* CALENDAR TAB */}
        {/* ============================================= */}
        {activeTab === 'calendar' && (
          <ProjectCalendar />
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

      {/* AI Agent Audit Findings Panel */}
      <AgentAuditFindingsPanel
        isOpen={!!auditPanelData}
        onClose={() => setAuditPanelData(null)}
        ticket={auditPanelData?.ticket}
        flag={auditPanelData?.flag}
      />
    </div>
  )
}

export default AssistantChiefDashboard
