import './App.css'
import { saveTieInTicket } from './saveLogic.js'
import { useAuth } from './AuthContext.jsx'
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import GuidedTour, { useGuidedTour, TourHelpButton, TOUR_STEPS } from './components/GuidedTour.jsx'
import { useSearchParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { supabase } from './supabase'
import { useOrgQuery } from './utils/queryHelpers.js'
import { useOrgPath } from './contexts/OrgContext.jsx'
import AIAgentStatusIcon from './components/AIAgentStatusIcon.jsx'
import AskTheAgentPanel from './components/AskTheAgentPanel.jsx'
import FeedbackButton from './components/FeedbackButton.jsx'

// Offline mode imports
import { syncManager, chainageCache, useOnlineStatus, useSyncStatus } from './offline'

// Import constants from separate file
import {
  PROJECT_NAME,
  PROJECT_SHORT,
  pipelineLocations,
  spreadOptions,
  spreadToPipeline,
  activityTypes,
  qualityFieldsByActivity,
  timeLostReasons,
  labourClassifications,
  equipmentTypes,
  createEmptyActivity,
  dragReasonCategories
} from './constants.js'

// Import ActivityBlock component (handles all specialized logs internally)
import ActivityBlock from './ActivityBlock.jsx'

// Import shadow audit utils for efficiency tracking
import { generateShadowAuditSummary } from './shadowAuditUtils.js'

// Mentor agent components
import MentorSidebar from './components/MentorSidebar.jsx'
import MentorAlertBadge from './components/MentorAlertBadge.jsx'
import { computeHealthScore } from './agents/ReportHealthScorer.js'
import HealthScoreIndicator from './components/HealthScoreIndicator.jsx'
import { logOverride } from './agents/OverrideLogger.js'

// Report-level components (not part of activity blocks)
import SafetyRecognition from './SafetyRecognition.jsx'
import WildlifeSighting from './WildlifeSighting.jsx'
import UnitPriceItemsLog from './UnitPriceItemsLog.jsx'
import MatTracker from './MatTracker.jsx'
import TrackableItemsTracker from './TrackableItemsTracker.jsx'
import ReportWorkflow from './ReportWorkflow.jsx'
import MiniMapWidget from './MiniMapWidget.jsx'
const weatherApiKey = import.meta.env.VITE_WEATHER_API_KEY
const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

// Constants now imported from constants.js


import { APP_VERSION } from './version.js'

function InspectorReport({
  editReportId: editReportIdProp,
  editReportData: editReportDataProp,
  editMode: editModeProp
} = {}) {
  // Log version only once on mount
  useEffect(() => {
    console.log('[InspectorReport] Component mounted, version:', APP_VERSION)
  }, [])
  const { signOut, userProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { orgPath } = useOrgPath()
  const { addOrgFilter, getOrgId, isReady, organizationId } = useOrgQuery()
  const [saving, setSaving] = useState(false)

  // Offline mode hooks
  const isOnline = useOnlineStatus()
  const { pendingCount, syncStatus } = useSyncStatus()
  const [offlineSaveSuccess, setOfflineSaveSuccess] = useState(false)

  // Guided tour
  const { runTour, stepIndex, handleTourCallback, startTour } = useGuidedTour('inspectorReport', TOUR_STEPS.inspectorReport)

  // Edit mode - prefer props from InspectorApp, fallback to URL params
  const editReportIdFromUrl = searchParams.get('edit')
  const editReportId = editReportIdProp || editReportIdFromUrl
  console.log('[InspectorReport] editReportId:', editReportId, '(prop:', editReportIdProp, ', url:', editReportIdFromUrl, ')')
  const [isEditMode, setIsEditMode] = useState(false)
  const [originalReportData, setOriginalReportData] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)

  // User role and report tracking
  const [currentUserRole, setCurrentUserRole] = useState('inspector')
  const [currentReportId, setCurrentReportId] = useState(null)

  // Previous reports for dropdown
  const [previousReports, setPreviousReports] = useState([])
  const [loadingPreviousReports, setLoadingPreviousReports] = useState(false)

  // Header fields
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [inspectorName, setInspectorName] = useState('')
  const [spread, setSpread] = useState('')
  const [afe, setAfe] = useState('')
  const [pipeline, setPipeline] = useState('')
  
  // Unit Price Items (report-level toggle)
  const [unitPriceItemsEnabled, setUnitPriceItemsEnabled] = useState(false)
  const [unitPriceData, setUnitPriceData] = useState({ items: [], comments: '' })
  
  // Weather fields
  const [weather, setWeather] = useState('')
  const [precipitation, setPrecipitation] = useState('')
  const [tempHigh, setTempHigh] = useState('')
  const [tempLow, setTempLow] = useState('')
  const [windSpeed, setWindSpeed] = useState('')
  const [rowCondition, setRowCondition] = useState('')
  const [fetchingWeather, setFetchingWeather] = useState(false)

  // Time tracking
  const [startTime, setStartTime] = useState('')
  const [stopTime, setStopTime] = useState('')

  // Activity blocks (main data structure)
  const [activityBlocks, setActivityBlocks] = useState([createEmptyActivity()])

  // Mentor agent state - accumulated alerts from all blocks
  const [mentorAlerts, setMentorAlerts] = useState({})
  const [mentorSidebarOpen, setMentorSidebarOpen] = useState(false)

  // Health score state
  const [healthScore, setHealthScore] = useState(null)

  // Current labour/equipment entry fields (for each activity block)
  const [currentLabour, setCurrentLabour] = useState({ employeeName: '', classification: '', rt: '', ot: '', jh: '', count: '1' })
  const [currentEquipment, setCurrentEquipment] = useState({ type: '', hours: '', count: '' })

  // General fields
  const [safetyNotes, setSafetyNotes] = useState('')
  const [safetyRecognitionData, setSafetyRecognitionData] = useState({ enabled: false, cards: [] })
  const [wildlifeSightingData, setWildlifeSightingData] = useState({ enabled: false, sightings: [] })
  
  // Trackable items pending save (for new reports)
  const [trackableItemsData, setTrackableItemsData] = useState([])
  const [landEnvironment, setLandEnvironment] = useState('')
  const [generalComments, setGeneralComments] = useState('')
  const [visitors, setVisitors] = useState([])
  const [visitorName, setVisitorName] = useState('')
  const [visitorCompany, setVisitorCompany] = useState('')
  const [visitorPosition, setVisitorPosition] = useState('')

  // Inspector info
  const [inspectorMileage, setInspectorMileage] = useState('')
  const [inspectorEquipment, setInspectorEquipment] = useState([])

  // Voice input
  const [isListening, setIsListening] = useState(null) // Stores field ID that's currently listening
  const [speechSupported, setSpeechSupported] = useState(false)
  const recognitionRef = useRef(null)
  const listeningFieldRef = useRef(null) // Track current field in a ref for the callback

  // OCR Ticket Scanning
  const [scanningBlock, setScanningBlock] = useState(null)

  // Auto-save / Draft functionality
  const [draftSaved, setDraftSaved] = useState(false)
  const [showDraftIndicator, setShowDraftIndicator] = useState(false)
  const [draftRestorePrompt, setDraftRestorePrompt] = useState(false)
  const [pendingDraft, setPendingDraft] = useState(null)
  const draftTimeoutRef = useRef(null)
  const DRAFT_STORAGE_KEY = 'pipeup_inspector_draft'

  // Chainage tracking (moved here for auto-save dependency)
  const [chainageReasons, setChainageReasons] = useState({}) // { blockId: { overlapReason: '', gapReason: '' } }

  // Pipeline Map visibility
  const [showMap, setShowMap] = useState(true)
  const [showExpandedMap, setShowExpandedMap] = useState(false)

  // Close expanded map on browser back button instead of navigating away
  useEffect(() => {
    if (showExpandedMap) {
      window.history.pushState({ expandedMap: true }, '')
      const handlePopState = (e) => {
        setShowExpandedMap(false)
      }
      window.addEventListener('popstate', handlePopState)
      return () => window.removeEventListener('popstate', handlePopState)
    }
  }, [showExpandedMap])

  // Collapsible sections
  const [trackableItemsExpanded, setTrackableItemsExpanded] = useState(false)

  // Document search panel
  const [showDocSearch, setShowDocSearch] = useState(false)
  
  // Trackable Items confirmation modal
  const [showTrackableItemsModal, setShowTrackableItemsModal] = useState(false)

  // Welding activity prefixes that require Welding Chief review
  // Uses startsWith() to avoid false positives (e.g., "Tie-In Completion" matching "tie-in")
  const WELDING_ACTIVITY_PREFIXES = [
    'welding -',       // Welding - Mainline, Welding - Section Crew, Welding - Poor Boy, Welding - Tie-in
    'mainline welding',
    'welder testing'   // Welder Testing Log
  ]

  // Check if activity blocks contain welding activities
  function hasWeldingActivities(blocks) {
    return blocks?.some(block => {
      const activityType = (block.activityType || '').toLowerCase()
      return WELDING_ACTIVITY_PREFIXES.some(prefix => activityType.startsWith(prefix))
    })
  }

  // Add visitor
  function addVisitor() {
    if (!visitorName.trim()) {
      alert('Please enter a visitor name')
      return
    }
    setVisitors([...visitors, {
      name: visitorName.trim(),
      company: visitorCompany.trim(),
      position: visitorPosition.trim()
    }])
    setVisitorName('')
    setVisitorCompany('')
    setVisitorPosition('')
  }

  // Convert image file to base64
  async function imageToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Scan contractor ticket using Claude Vision
  async function scanTicketWithOCR(blockId) {
    const block = activityBlocks.find(b => b.id === blockId)
    if (!block?.ticketPhoto) {
      alert('Please upload a ticket photo first')
      return
    }

    if (!anthropicApiKey) {
      alert('Claude API key not configured. Add VITE_ANTHROPIC_API_KEY to your .env file.')
      return
    }

    setScanningBlock(blockId)
    console.log('Starting OCR scan for block:', blockId)

    try {
      const base64Image = await imageToBase64(block.ticketPhoto)
      const mediaType = block.ticketPhoto.type || 'image/jpeg'
      console.log('Image converted to base64, type:', mediaType)

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Image
                }
              },
              {
                type: 'text',
                text: `Analyze this contractor daily ticket/timesheet. Extract the following information and return it as JSON only (no other text):

{
  "contractor": "contractor company name if visible",
  "foreman": "foreman name if visible",
  "date": "date if visible",
  "personnel": [
    {
      "name": "employee full name",
      "classification": "job title/classification (e.g., PRINCIPAL OPER 1, GENERAL LABOURER, WELDER HELPER)",
      "hours": number of hours worked,
      "jh": number of jump hours/bonus hours if there is a separate JH column (0 if not present),
      "count": 1
    }
  ],
  "equipment": [
    {
      "type": "equipment type/description (e.g., Backhoe - Cat 330, Sideboom - Cat 583)",
      "hours": number of hours,
      "count": 1
    }
  ],
  "workDescription": "brief description of work performed if visible"
}

CRITICAL - Individual Entries Required:
- List EVERY person as a SEPARATE entry with their full name. Do NOT group workers together.
- If the ticket shows "John Smith - Labourer - 10hrs" and "Mike Jones - Labourer - 10hrs", return TWO separate entries, not one entry with count: 2.
- List EVERY piece of equipment as a SEPARATE entry. Do NOT group equipment together.
- Each entry must have count: 1. Never use count > 1.
- Extract the employee's full name exactly as written on the ticket.
- Extract ALL personnel entries you can read
- Extract ALL equipment entries you can read
- Use standard classification names where possible
- If hours aren't clear, estimate based on typical 8-10 hour days
- JH (Jump Hours) is bonus hours - only include if there's a separate JH column on the ticket
- Return ONLY the JSON object, no explanation`
              }
            ]
          }]
        })
      })

      console.log('API response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error:', errorText)
        throw new Error(`API request failed: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      console.log('API response data:', data)
      
      const content = data.content[0]?.text || ''
      console.log('Extracted content:', content)
      
      // Parse JSON from response
      let extracted
      try {
        // Try to extract JSON from the response (in case there's extra text)
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          extracted = JSON.parse(jsonMatch[0])
          console.log('Parsed extracted data:', extracted)
        } else {
          throw new Error('No JSON found in response')
        }
      } catch (parseError) {
        console.error('Failed to parse OCR response:', content, parseError)
        alert('Could not parse ticket data. Response was:\n\n' + content.substring(0, 500))
        setScanningBlock(null)
        return
      }

      // Update block with extracted data
      setActivityBlocks(blocks => blocks.map(b => {
        if (b.id !== blockId) return b

        const updatedBlock = { ...b }

        // Update contractor and foreman if found
        if (extracted.contractor) {
          updatedBlock.contractor = extracted.contractor
          console.log('Set contractor:', extracted.contractor)
        }
        if (extracted.foreman) {
          updatedBlock.foreman = extracted.foreman
          console.log('Set foreman:', extracted.foreman)
        }
        if (extracted.workDescription) {
          updatedBlock.workDescription = updatedBlock.workDescription 
            ? updatedBlock.workDescription + '\n' + extracted.workDescription 
            : extracted.workDescription
          console.log('Set workDescription:', extracted.workDescription)
        }

        // Add personnel entries with RT/OT/JH calculation
        if (extracted.personnel && Array.isArray(extracted.personnel)) {
          const newLabourEntries = extracted.personnel.map((p, idx) => {
            const totalHours = parseFloat(p.hours) || 8
            const rt = Math.min(totalHours, 8)
            const ot = Math.max(0, totalHours - 8)
            return {
              id: Date.now() + idx,
              employeeName: p.name || '',
              classification: matchClassification(p.classification) || p.classification || 'GENERAL LABOURER',
              hours: totalHours,
              rt,
              ot,
              jh: parseFloat(p.jh) || 0, // Jump Hours - only if specified on ticket
              count: parseInt(p.count) || 1
            }
          })
          console.log('Adding labour entries:', newLabourEntries)
          updatedBlock.labourEntries = [...(b.labourEntries || []), ...newLabourEntries]
        }

        // Add equipment entries
        if (extracted.equipment && Array.isArray(extracted.equipment)) {
          const newEquipmentEntries = extracted.equipment.map((e, idx) => ({
            id: Date.now() + 1000 + idx,
            type: matchEquipment(e.type) || e.type || 'Other',
            hours: parseFloat(e.hours) || 8,
            count: parseInt(e.count) || 1
          }))
          console.log('Adding equipment entries:', newEquipmentEntries)
          updatedBlock.equipmentEntries = [...(b.equipmentEntries || []), ...newEquipmentEntries]
        }

        console.log('Updated block:', updatedBlock)
        return updatedBlock
      }))

      // Show summary
      const personnelCount = extracted.personnel?.length || 0
      const equipmentCount = extracted.equipment?.length || 0
      alert(`✅ Ticket scanned successfully!\n\nExtracted:\n• ${personnelCount} personnel entries\n• ${equipmentCount} equipment entries\n${extracted.contractor ? '• Contractor: ' + extracted.contractor : ''}\n${extracted.foreman ? '• Foreman: ' + extracted.foreman : ''}\n\nPlease scroll down to review the Manpower and Equipment sections.`)

    } catch (error) {
      console.error('OCR Error:', error)
      alert('Error scanning ticket: ' + error.message)
    }

    setScanningBlock(null)
  }

  // Match extracted classification to our list
  function matchClassification(extracted) {
    if (!extracted) return null
    const upper = extracted.toUpperCase().trim()
    
    // Exact match
    const exact = labourClassifications.find(c => c === upper)
    if (exact) return exact
    
    // Partial match
    const partial = labourClassifications.find(c => 
      c.includes(upper) || upper.includes(c) ||
      c.replace(/[^A-Z0-9]/g, '').includes(upper.replace(/[^A-Z0-9]/g, ''))
    )
    if (partial) return partial
    
    // Keyword matching
    const keywords = {
      'WELDER': 'UTILITY WELDER',
      'OPERATOR': 'PRINCIPAL OPER 1',
      'LABOURER': 'GENERAL LABOURER',
      'LABORER': 'GENERAL LABOURER',
      'FOREMAN': 'GENERAL FOREMAN',
      'DRIVER': 'BUS/ CREWCAB DRIVER',
      'MECHANIC': 'MECHANIC/ SERVICEMAN/ LUBEMAN',
      'HELPER': 'WELDER HELPER',
      'FITTER': 'STRAW - FITTER ON AUTO WELD SPREAD',
      'OILER': 'APPRENTICE OPER/OILER'
    }
    
    for (const [keyword, classification] of Object.entries(keywords)) {
      if (upper.includes(keyword)) return classification
    }
    
    return null
  }

  // Match extracted equipment to our list
  function matchEquipment(extracted) {
    if (!extracted) return null
    const lower = extracted.toLowerCase().trim()
    
    // Exact match (case insensitive)
    const exact = equipmentTypes.find(e => e.toLowerCase() === lower)
    if (exact) return exact
    
    // Partial match
    const partial = equipmentTypes.find(e => 
      e.toLowerCase().includes(lower) || lower.includes(e.toLowerCase())
    )
    if (partial) return partial
    
    // Keyword matching
    const keywords = {
      'backhoe': 'Backhoe - Cat 330 (or equivalent)',
      'excavator': 'Backhoe - Cat 330 (or equivalent)',
      'hoe': 'Backhoe - Cat 330 (or equivalent)',
      'sideboom': 'Sideboom - Cat 583',
      'pipelayer': 'Sideboom - Cat 583',
      'dozer': 'Dozer - D6T (or equivalent)',
      'bulldozer': 'Dozer - D6T (or equivalent)',
      'cat d': 'Dozer - D6T (or equivalent)',
      'grader': 'Grader - Cat G14',
      'loader': 'Loader - Cat 966',
      'picker': 'Picker Truck - 15 Ton',
      'crane': 'Picker Truck - 25 Ton',
      'welder': 'Welding Rig',
      'welding': 'Welding Rig',
      'lincoln': 'Lincoln Welder',
      'truck': 'Pickup - 3/4 Ton',
      'pickup': 'Pickup - 3/4 Ton',
      'water': 'Water Truck',
      'fuel': 'Fuel Truck - Tandem',
      'lowboy': 'Lowboy Trailer',
      'lowbed': 'Lowboy Trailer',
      'trailer': 'Lowboy Trailer',
      'generator': 'Generator - 60 kW',
      'compressor': 'Air Compressor - 900 CFM',
      'atv': 'ATV/Gator',
      'gator': 'ATV/Gator'
    }
    
    for (const [keyword, equipment] of Object.entries(keywords)) {
      if (lower.includes(keyword)) return equipment
    }
    
    return null
  }

  // ============================================
  // AUTO-SAVE / DRAFT FUNCTIONALITY
  // ============================================

  // Initialize chainage cache for offline overlap checking (org-scoped)
  useEffect(() => {
    chainageCache.init(organizationId)
  }, [organizationId])

  // Check for existing draft on component mount
  useEffect(() => {
    // Don't check for draft if we're in edit mode
    if (isEditMode || editReportId) return

    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (savedDraft) {
        const draft = JSON.parse(savedDraft)
        // Check if draft is less than 7 days old
        const draftAge = Date.now() - (draft.savedAt || 0)
        const sevenDays = 7 * 24 * 60 * 60 * 1000
        
        if (draftAge < sevenDays && draft.activityBlocks?.length > 0) {
          setPendingDraft(draft)
          setDraftRestorePrompt(true)
        } else {
          // Draft is too old, clear it
          localStorage.removeItem(DRAFT_STORAGE_KEY)
        }
      }
    } catch (err) {
      console.error('Error checking for draft:', err)
      localStorage.removeItem(DRAFT_STORAGE_KEY)
    }
  }, [isEditMode, editReportId])

  // Auto-save to localStorage when key fields change
  useEffect(() => {
    // Don't auto-save if we're in edit mode or haven't made any changes
    if (isEditMode || editReportId) return
    // Don't auto-save if showing restore prompt
    if (draftRestorePrompt) return

    // Debounce the save to avoid excessive writes
    if (draftTimeoutRef.current) {
      clearTimeout(draftTimeoutRef.current)
    }

    draftTimeoutRef.current = setTimeout(() => {
      // Only save if there's meaningful data
      const hasData = inspectorName || 
                      spread || 
                      activityBlocks.some(b => b.activityType || b.workDescription || b.labourEntries.length > 0) ||
                      safetyNotes ||
                      generalComments

      if (!hasData) return

      try {
        const draftData = {
          savedAt: Date.now(),
          selectedDate,
          inspectorName,
          spread,
          afe,
          pipeline,
          weather,
          precipitation,
          tempHigh,
          tempLow,
          windSpeed,
          rowCondition,
          startTime,
          stopTime,
          // Activity blocks (excluding file objects which can't be serialized)
          activityBlocks: activityBlocks.map(block => ({
            ...block,
            workPhotos: [], // Can't serialize File objects
            ticketPhoto: null
          })),
          safetyNotes,
          safetyRecognitionData,
          wildlifeSightingData,
          landEnvironment,
          generalComments,
          visitors,
          inspectorMileage,
          unitPriceItemsEnabled,
          unitPriceData,
          chainageReasons
        }

        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData))
        setDraftSaved(true)
        
        // Show the indicator briefly
        setShowDraftIndicator(true)
        setTimeout(() => setShowDraftIndicator(false), 2000)
        
        console.log('📝 Draft auto-saved')
      } catch (err) {
        console.error('Error saving draft:', err)
      }
    }, 1500) // 1.5 second debounce

    return () => {
      if (draftTimeoutRef.current) {
        clearTimeout(draftTimeoutRef.current)
      }
    }
  }, [
    selectedDate, inspectorName, spread, afe, pipeline,
    weather, precipitation, tempHigh, tempLow, windSpeed, rowCondition,
    startTime, stopTime, activityBlocks, safetyNotes, safetyRecognitionData,
    wildlifeSightingData, landEnvironment, generalComments, visitors,
    inspectorMileage, unitPriceItemsEnabled, unitPriceData, chainageReasons,
    isEditMode, editReportId, draftRestorePrompt
  ])

  // Periodic auto-save every 30 seconds with popup notification
  useEffect(() => {
    // Don't run in edit mode
    if (isEditMode || editReportId) return
    if (draftRestorePrompt) return

    const intervalId = setInterval(() => {
      // Only save if there's meaningful data
      const hasData = inspectorName || 
                      spread || 
                      activityBlocks.some(b => b.activityType || b.workDescription || b.labourEntries.length > 0) ||
                      safetyNotes ||
                      generalComments

      if (!hasData) return

      try {
        const draftData = {
          savedAt: Date.now(),
          selectedDate,
          inspectorName,
          spread,
          afe,
          pipeline,
          weather,
          precipitation,
          tempHigh,
          tempLow,
          windSpeed,
          rowCondition,
          startTime,
          stopTime,
          activityBlocks: activityBlocks.map(block => ({
            ...block,
            workPhotos: [],
            ticketPhoto: null
          })),
          safetyNotes,
          safetyRecognitionData,
          wildlifeSightingData,
          landEnvironment,
          generalComments,
          visitors,
          inspectorMileage,
          unitPriceItemsEnabled,
          unitPriceData,
          chainageReasons
        }

        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData))
        setDraftSaved(true)
        
        // Show the popup indicator
        setShowDraftIndicator(true)
        setTimeout(() => setShowDraftIndicator(false), 2000)
        
        console.log('📝 Auto-save (30s interval)')
      } catch (err) {
        console.error('Error in periodic auto-save:', err)
      }
    }, 30000) // 30 seconds

    return () => clearInterval(intervalId)
  }, [
    selectedDate, inspectorName, spread, afe, pipeline,
    weather, precipitation, tempHigh, tempLow, windSpeed, rowCondition,
    startTime, stopTime, activityBlocks, safetyNotes, safetyRecognitionData,
    wildlifeSightingData, landEnvironment, generalComments, visitors,
    inspectorMileage, unitPriceItemsEnabled, unitPriceData, chainageReasons,
    isEditMode, editReportId, draftRestorePrompt
  ])

  // Restore draft data
  function restoreDraft() {
    if (!pendingDraft) return

    try {
      setSelectedDate(pendingDraft.selectedDate || new Date().toISOString().split('T')[0])
      setInspectorName(pendingDraft.inspectorName || '')
      setSpread(pendingDraft.spread || '')
      setAfe(pendingDraft.afe || '')
      setPipeline(pendingDraft.pipeline || '')
      setWeather(pendingDraft.weather || '')
      setPrecipitation(pendingDraft.precipitation || '')
      setTempHigh(pendingDraft.tempHigh || '')
      setTempLow(pendingDraft.tempLow || '')
      setWindSpeed(pendingDraft.windSpeed || '')
      setRowCondition(pendingDraft.rowCondition || '')
      setStartTime(pendingDraft.startTime || '')
      setStopTime(pendingDraft.stopTime || '')
      setActivityBlocks(pendingDraft.activityBlocks || [createEmptyActivity()])
      setSafetyNotes(pendingDraft.safetyNotes || '')
      setSafetyRecognitionData(pendingDraft.safetyRecognitionData || { enabled: false, cards: [] })
      setWildlifeSightingData(pendingDraft.wildlifeSightingData || { enabled: false, sightings: [] })
      setLandEnvironment(pendingDraft.landEnvironment || '')
      setGeneralComments(pendingDraft.generalComments || '')
      setVisitors(pendingDraft.visitors || [])
      setInspectorMileage(pendingDraft.inspectorMileage || '')
      setUnitPriceItemsEnabled(pendingDraft.unitPriceItemsEnabled || false)
      setUnitPriceData(pendingDraft.unitPriceData || { items: [], comments: '' })
      setChainageReasons(pendingDraft.chainageReasons || {})

      console.log('✅ Draft restored successfully')
    } catch (err) {
      console.error('Error restoring draft:', err)
      alert('Error restoring draft. Starting with a fresh report.')
    }

    setDraftRestorePrompt(false)
    setPendingDraft(null)
  }

  // Decline draft and start fresh
  function declineDraft() {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    setDraftRestorePrompt(false)
    setPendingDraft(null)
    console.log('🗑️ Draft declined and cleared')
  }

  // Manually clear draft
  function clearDraft() {
    if (confirm('Are you sure you want to clear the saved draft? This will reset the form to empty.')) {
      localStorage.removeItem(DRAFT_STORAGE_KEY)
      setDraftSaved(false)
      setActivityBlocks([createEmptyActivity()])
      setVisitors([])
      setSafetyNotes('')
      setSafetyRecognitionData({ enabled: false, cards: [] })
      setWildlifeSightingData({ enabled: false, sightings: [] })
      setLandEnvironment('')
      setGeneralComments('')
      setInspectorMileage('')
      setUnitPriceItemsEnabled(false)
      setUnitPriceData({ items: [], comments: '' })
      setChainageReasons({})
      console.log('🗑️ Draft cleared manually')
    }
  }

  // Clear draft after successful save (called from saveReport)
  function clearDraftAfterSave() {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    setDraftSaved(false)
    console.log('🗑️ Draft cleared after successful save')
  }

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      setSpeechSupported(true)
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true // Get interim results too
      recognition.lang = 'en-US'
      
      // Debug events
      recognition.onstart = () => console.log('🎤 STARTED - speak now!')
      recognition.onaudiostart = () => console.log('🔊 AUDIO CAPTURING')
      recognition.onsoundstart = () => console.log('📢 SOUND DETECTED')
      recognition.onspeechstart = () => console.log('💬 SPEECH DETECTED')
      recognition.onspeechend = () => console.log('💬 SPEECH ENDED')
      
      recognition.onerror = (event) => {
        console.error('❌ Speech error:', event.error)
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please allow microphone access in your browser settings.')
          setIsListening(null)
        } else if (event.error === 'no-speech') {
          console.log('No speech detected, continuing...')
        } else if (event.error === 'aborted') {
          console.log('Speech recognition aborted')
        } else if (event.error === 'network') {
          alert('Network error. Speech recognition requires an internet connection.')
          setIsListening(null)
        } else {
          console.log('Speech error (non-fatal):', event.error)
        }
      }

      recognition.onresult = (event) => {
        const currentField = listeningFieldRef.current
        console.log('📝 RESULT - field:', currentField)
        
        let finalTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          const isFinal = event.results[i].isFinal
          console.log(isFinal ? '✅ FINAL:' : '⏳ INTERIM:', transcript)
          if (isFinal) {
            finalTranscript += transcript
          }
        }
        
        if (finalTranscript && currentField) {
          // Simple text processing
          let processed = finalTranscript.trim()
          if (processed.length > 0) {
            processed = processed.charAt(0).toUpperCase() + processed.slice(1)
          }
          if (processed.length > 0 && !/[.!?,;:\-]$/.test(processed)) {
            processed += '.'
          }
          processed = processed + ' '
          
          console.log('💾 SAVING:', processed, 'to:', currentField)
          
          if (currentField === 'safetyNotes') {
            setSafetyNotes(prev => prev + processed)
          } else if (currentField === 'landEnvironment') {
            setLandEnvironment(prev => prev + processed)
          } else if (currentField === 'generalComments') {
            setGeneralComments(prev => prev + processed)
          } else if (currentField.startsWith('workDescription_')) {
            const blockId = parseFloat(currentField.split('_')[1])
            console.log('Updating workDescription for blockId:', blockId)
            setActivityBlocks(blocks => blocks.map(block => {
              if (block.id === blockId) {
                console.log('Found matching block, appending text')
                return { ...block, workDescription: block.workDescription + processed }
              }
              return block
            }))
          } else if (currentField.startsWith('timeLostDetails_')) {
            const blockId = parseFloat(currentField.split('_')[1])
            setActivityBlocks(blocks => blocks.map(block => {
              if (block.id === blockId) {
                return { ...block, timeLostDetails: (block.timeLostDetails || '') + processed }
              }
              return block
            }))
          }
        }
      }

      recognition.onend = () => {
        const currentField = listeningFieldRef.current
        console.log('🛑 ENDED, field:', currentField)
        // Only restart if we still have a field (not stopped by user)
        if (currentField && recognitionRef.current) {
          try {
            recognitionRef.current.start()
            console.log('🔄 Restarted')
          } catch (e) {
            console.log('Restart error:', e)
          }
        }
      }
      
      recognitionRef.current = recognition
      console.log('✅ Speech recognition ready')
    } else {
      console.log('❌ Speech recognition NOT supported')
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  // Process transcript to add punctuation
  function processTranscript(text, isNewSentence = false) {
    let processed = text.trim()
    
    // Convert spoken punctuation to symbols
    const punctuationMap = {
      ' period': '.',
      ' full stop': '.',
      ' comma': ',',
      ' question mark': '?',
      ' exclamation mark': '!',
      ' exclamation point': '!',
      ' colon': ':',
      ' semicolon': ';',
      ' dash': ' -',
      ' hyphen': '-',
      ' open quote': '"',
      ' close quote': '"',
      ' open parenthesis': '(',
      ' close parenthesis': ')',
      ' new line': '\n',
      ' new paragraph': '\n\n'
    }
    
    Object.entries(punctuationMap).forEach(([spoken, symbol]) => {
      const regex = new RegExp(spoken, 'gi')
      processed = processed.replace(regex, symbol)
    })
    
    // Capitalize first letter if it's a new sentence
    if (isNewSentence && processed.length > 0) {
      processed = processed.charAt(0).toUpperCase() + processed.slice(1)
    }
    
    // Capitalize after periods, question marks, exclamation marks
    processed = processed.replace(/([.!?]\s*)([a-z])/g, (match, punct, letter) => {
      return punct + letter.toUpperCase()
    })
    
    // Add period at end if it doesn't end with punctuation
    if (processed.length > 0 && !/[.!?,;:\-]$/.test(processed)) {
      processed += '.'
    }
    
    return processed + ' '
  }

  // Check if text ends with sentence-ending punctuation
  function endsWithSentence(text) {
    return /[.!?]\s*$/.test(text.trim())
  }

  // Start voice input for a specific field
  function startVoiceInput(fieldId) {
    if (!speechSupported) {
      alert('Speech recognition is not supported in your browser. Try Chrome or Edge.')
      return
    }
    
    if (isListening === fieldId) {
      // Stop listening - DON'T clear the ref yet, let final results come through
      console.log('Stopping voice recognition for:', fieldId)
      setIsListening(null)
      recognitionRef.current.stop()
      
      // Clear the ref after delay to allow final results to save
      setTimeout(() => {
        if (!isListening) { // Only clear if still stopped
          listeningFieldRef.current = null
          console.log('Field ref cleared')
        }
      }, 1000)
    } else {
      // Stop any current listening first
      if (isListening) {
        recognitionRef.current.stop()
      }
      
      // Set field ref and start
      listeningFieldRef.current = fieldId
      console.log('Starting voice recognition for:', fieldId)
      setIsListening(fieldId)
      
      try {
        recognitionRef.current.start()
        console.log('Recognition started')
      } catch (e) {
        if (e.message && e.message.includes('already started')) {
          console.log('Recognition already running')
        } else {
          console.error('Recognition start error:', e)
          alert('Could not start voice recognition: ' + e.message)
          listeningFieldRef.current = null
          setIsListening(null)
        }
      }
    }
  }

  // Voice input button component
  const VoiceButton = ({ fieldId, style }) => {
    // Check if speech is supported
    if (!speechSupported) {
      return (
        <button
          type="button"
          onClick={() => alert('Voice input is not supported in this browser.\n\nPlease use Chrome, Edge, or Safari for voice input.')}
          style={{
            padding: '8px 12px',
            backgroundColor: '#adb5bd',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            opacity: 0.6,
            ...style
          }}
          title="Voice input not supported in this browser (use Chrome, Edge, or Safari)"
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
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          animation: isListening === fieldId ? 'pulse 1s infinite, recordingPulse 1.5s infinite' : 'none',
          transition: 'all 0.3s ease',
          ...style
        }}
        title={isListening === fieldId ? 'Stop recording' : 'Start voice input'}
      >
        {isListening === fieldId ? '⏹️ Stop' : '🎤 Voice'}
      </button>
    )
  }

  // Chainage overlap warnings
  const [overlapWarnings, setOverlapWarnings] = useState([])
  
  // Existing chainages by activity type (fetched from DB)
  const [existingChainages, setExistingChainages] = useState({})
  // Block-level chainage status (overlap/gap warnings per block)
  const [blockChainageStatus, setBlockChainageStatus] = useState({})
  // Note: chainageReasons state is declared earlier in the file (needed for auto-save)

  // Helper to parse KP string to metres
  function parseKPToMetres(kpStr) {
    if (!kpStr) return null
    const str = String(kpStr).trim()
    // Handle format like "5+250" (5km + 250m = 5250m)
    if (str.includes('+')) {
      const [km, m] = str.split('+')
      return (parseFloat(km) || 0) * 1000 + (parseFloat(m) || 0)
    }
    // Handle plain number (assume metres or km based on size)
    const num = parseFloat(str)
    if (isNaN(num)) return null
    return num < 100 ? num * 1000 : num
  }

  // Format metres to KP string
  function formatMetresToKP(metres) {
    if (metres === null || metres === undefined) return ''
    const km = Math.floor(metres / 1000)
    const m = Math.round(metres % 1000)
    return `${km}+${m.toString().padStart(3, '0')}`
  }

  // Fetch existing chainages for all activity types
  async function fetchExistingChainages() {
    try {
      let query = supabase
        .from('daily_reports')
        .select('id, date, activity_blocks')

      // Add organization filter
      query = addOrgFilter(query)

      // Exclude current report when editing to prevent self-overlap detection
      if (currentReportId) {
        query = query.neq('id', currentReportId)
      }

      const { data: reports, error } = await query
      
      if (error || !reports) return

      // Build a map of activity type -> array of {start, end, date} ranges
      const chainageMap = {}
      
      reports.forEach(report => {
        const blocks = report.activity_blocks || []
        blocks.forEach(block => {
          if (!block.activityType || !block.startKP || !block.endKP) return
          
          const startM = parseKPToMetres(block.startKP)
          const endM = parseKPToMetres(block.endKP)
          if (startM === null || endM === null) return

          if (!chainageMap[block.activityType]) {
            chainageMap[block.activityType] = []
          }
          
          chainageMap[block.activityType].push({
            start: Math.min(startM, endM),
            end: Math.max(startM, endM),
            startKP: block.startKP,
            endKP: block.endKP,
            date: report.date
          })
        })
      })

      // Sort each activity's ranges by start position
      Object.keys(chainageMap).forEach(activity => {
        chainageMap[activity].sort((a, b) => a.start - b.start)
      })

      setExistingChainages(chainageMap)
      console.log('Loaded existing chainages:', chainageMap)
    } catch (err) {
      console.error('Error fetching chainages:', err)
    }
  }

  // Analyze a block's chainage for overlaps and gaps
  function analyzeBlockChainage(block) {
    const result = {
      hasOverlap: false,
      hasGap: false,
      overlaps: [],
      gaps: [],
      suggestedStartKP: null,
      coverage: []
    }

    if (!block.activityType) return result

    const existingRanges = existingChainages[block.activityType] || []
    
    // Calculate suggested next start KP (where last work ended)
    if (existingRanges.length > 0) {
      const lastEnd = Math.max(...existingRanges.map(r => r.end))
      result.suggestedStartKP = formatMetresToKP(lastEnd)
      result.coverage = existingRanges
    }

    // If no KP entered yet, just return suggestions
    if (!block.startKP || !block.endKP) return result

    const blockStart = parseKPToMetres(block.startKP)
    const blockEnd = parseKPToMetres(block.endKP)
    if (blockStart === null || blockEnd === null) return result

    const blockMin = Math.min(blockStart, blockEnd)
    const blockMax = Math.max(blockStart, blockEnd)

    // Check for overlaps with existing ranges
    existingRanges.forEach(range => {
      if (blockMin < range.end && range.start < blockMax) {
        result.hasOverlap = true
        const overlapStart = Math.max(blockMin, range.start)
        const overlapEnd = Math.min(blockMax, range.end)
        result.overlaps.push({
          range,
          overlapStart,
          overlapEnd,
          startKP: formatMetresToKP(overlapStart),
          endKP: formatMetresToKP(overlapEnd),
          metres: Math.abs(overlapEnd - overlapStart)
        })
      }
    })

    // Check for gaps - find if there's uncovered chainage before this block's start
    if (existingRanges.length > 0 && blockMin > 0) {
      // Merge existing ranges to find coverage
      const merged = mergeRanges(existingRanges)
      
      // Check if there's a gap between last coverage and this block's start
      const lastCoveredEnd = merged.length > 0 ? Math.max(...merged.map(r => r.end)) : 0
      
      if (blockMin > lastCoveredEnd + 10) { // 10m tolerance
        result.hasGap = true
        result.gaps.push({
          start: lastCoveredEnd,
          end: blockMin,
          startKP: formatMetresToKP(lastCoveredEnd),
          endKP: formatMetresToKP(blockMin),
          metres: blockMin - lastCoveredEnd
        })
      }
    }

    return result
  }

  // Merge overlapping ranges into continuous coverage
  function mergeRanges(ranges) {
    if (ranges.length === 0) return []
    
    const sorted = [...ranges].sort((a, b) => a.start - b.start)
    const merged = [{ ...sorted[0] }]
    
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const last = merged[merged.length - 1]
      
      if (current.start <= last.end + 10) { // 10m tolerance for "continuous"
        last.end = Math.max(last.end, current.end)
      } else {
        merged.push({ ...current })
      }
    }
    
    return merged
  }

  // Update block chainage status when blocks or existing chainages change
  useEffect(() => {
    const newStatus = {}
    activityBlocks.forEach(block => {
      newStatus[block.id] = analyzeBlockChainage(block)
    })
    setBlockChainageStatus(newStatus)
  }, [activityBlocks, existingChainages])

  // Fetch existing chainages on mount, when date changes, or when entering edit mode
  useEffect(() => {
    fetchExistingChainages()
  }, [selectedDate, currentReportId])

  // Check for chainage overlaps within current report
  function checkChainageOverlaps(blocks) {
    const warnings = []
    
    // Group blocks by activity type
    const byActivity = {}
    blocks.forEach((block, idx) => {
      if (!block.activityType || !block.startKP || !block.endKP) return
      if (!byActivity[block.activityType]) byActivity[block.activityType] = []
      byActivity[block.activityType].push({
        index: idx + 1,
        start: parseKPToMetres(block.startKP),
        end: parseKPToMetres(block.endKP),
        startKP: block.startKP,
        endKP: block.endKP
      })
    })

    // Check for overlaps within each activity type
    Object.entries(byActivity).forEach(([activity, ranges]) => {
      for (let i = 0; i < ranges.length; i++) {
        for (let j = i + 1; j < ranges.length; j++) {
          const a = ranges[i]
          const b = ranges[j]
          if (a.start === null || a.end === null || b.start === null || b.end === null) continue
          
          // Normalize ranges (start should be less than end)
          const aMin = Math.min(a.start, a.end)
          const aMax = Math.max(a.start, a.end)
          const bMin = Math.min(b.start, b.end)
          const bMax = Math.max(b.start, b.end)
          
          // Check for overlap
          if (aMin < bMax && bMin < aMax) {
            warnings.push({
              type: 'current',
              activity,
              message: `⚠️ ${activity}: Activity #${a.index} (${a.startKP}-${a.endKP}) overlaps with Activity #${b.index} (${b.startKP}-${b.endKP})`
            })
          }
        }
      }
    })

    return warnings
  }

  // Check for overlaps with historical data
  async function checkHistoricalOverlaps(blocks) {
    const warnings = []
    
    // Get unique activity types with KP data
    const activitiesToCheck = blocks.filter(b => b.activityType && b.startKP && b.endKP)
    console.log('Activities to check for overlaps:', activitiesToCheck.length)
    if (activitiesToCheck.length === 0) return warnings

    try {
      // Fetch existing reports (org-scoped)
      let query = supabase
        .from('daily_reports')
        .select('date, spread, activity_blocks')
        .neq('date', selectedDate) // Exclude current date

      query = addOrgFilter(query)

      // Exclude current report when editing
      if (currentReportId) {
        query = query.neq('id', currentReportId)
      }

      const { data: existingReports, error } = await query

      console.log('Fetched existing reports:', existingReports?.length || 0, 'Error:', error)
      if (error || !existingReports) return warnings

      // Check each current block against historical data
      activitiesToCheck.forEach(block => {
        const blockStart = parseKPToMetres(block.startKP)
        const blockEnd = parseKPToMetres(block.endKP)
        console.log(`Checking ${block.activityType}: ${block.startKP} (${blockStart}m) - ${block.endKP} (${blockEnd}m)`)
        if (blockStart === null || blockEnd === null) return

        const blockMin = Math.min(blockStart, blockEnd)
        const blockMax = Math.max(blockStart, blockEnd)

        existingReports.forEach(report => {
          const histBlocks = report.activity_blocks || []
          histBlocks.forEach(histBlock => {
            if (histBlock.activityType !== block.activityType) return
            
            const histStart = parseKPToMetres(histBlock.startKP)
            const histEnd = parseKPToMetres(histBlock.endKP)
            if (histStart === null || histEnd === null) return

            const histMin = Math.min(histStart, histEnd)
            const histMax = Math.max(histStart, histEnd)

            console.log(`  Comparing to ${report.date}: ${histBlock.startKP}-${histBlock.endKP} (${histMin}-${histMax}m)`)

            // Check for overlap
            if (blockMin < histMax && histMin < blockMax) {
              console.log('  ⚠️ OVERLAP DETECTED!')
              warnings.push({
                type: 'historical',
                activity: block.activityType,
                message: `⚠️ ${block.activityType}: KP ${block.startKP}-${block.endKP} overlaps with report from ${report.date} (${histBlock.startKP}-${histBlock.endKP})`
              })
            }
          })
        })
      })
    } catch (err) {
      console.error('Error checking historical overlaps:', err)
    }

    console.log('Total overlap warnings:', warnings.length)
    return warnings
  }

  // Load project config
  useEffect(() => {
    const saved = localStorage.getItem('projectConfig')
    if (saved) {
      const config = JSON.parse(saved)
      if (config.projectName) setPipeline(config.projectName)
      if (config.inspectorName) setInspectorName(config.inspectorName)
      if (config.defaultSpread) setSpread(config.defaultSpread)
    }
  }, [])

  // Auto-populate inspector name from user profile
  useEffect(() => {
    // Skip if in edit mode (name will be loaded from saved report)
    if (isEditMode || editReportId) return

    // Skip if name is already set (from draft restore or localStorage)
    if (inspectorName) return

    // Set from user profile
    if (userProfile?.full_name) {
      setInspectorName(userProfile.full_name)
    }
  }, [userProfile, isEditMode, editReportId, inspectorName])

  // Auto-populate AFE/Contract # from contract_config for new reports
  useEffect(() => {
    async function fetchContractConfig() {
      // Skip if in edit mode (AFE will be loaded from saved report)
      if (isEditMode || editReportId) return

      // Skip if AFE is already set (from draft restore)
      if (afe) return

      // Wait for org context to be ready
      if (!organizationId) return

      try {
        const { data: config, error } = await supabase
          .from('contract_config')
          .select('contract_number')
          .eq('organization_id', organizationId)
          .single()

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows returned (not an error, just no config yet)
          console.error('Error fetching contract config:', error)
          return
        }

        if (config?.contract_number) {
          setAfe(config.contract_number)
        }
      } catch (err) {
        console.error('Error fetching contract config for AFE:', err)
      }
    }

    fetchContractConfig()
  }, [organizationId, isEditMode, editReportId, afe])

  // Set user role from userProfile (from AuthContext)
  useEffect(() => {
    if (userProfile?.role) {
      setCurrentUserRole(userProfile.role)
      console.log('User role set from profile:', userProfile.role)
    }
  }, [userProfile])

  // Fetch previous reports for this inspector
  useEffect(() => {
    async function fetchPreviousReports() {
      if (!userProfile?.id) return
      
      setLoadingPreviousReports(true)
      try {
        // Get the inspector's name and email for matching
        const userName = (userProfile.full_name || '').trim()
        const userEmail = (userProfile.email || '').trim()
        
        console.log('Fetching reports for user:', { userName, userEmail, userId: userProfile.id })
        
        // First try: fetch ALL reports without filter to check RLS
        const { data: allData, error: allError } = await supabase
          .from('daily_reports')
          .select('id, date, spread, pipeline, inspector_name, activity_blocks')
          .order('date', { ascending: false })
          .limit(100)
        
        console.log('All reports query result:', { count: allData?.length || 0, error: allError })
        
        if (allError) {
          console.error('Query error:', allError)
          throw allError
        }
        
        // Log first few reports to see what inspector_name values look like
        if (allData && allData.length > 0) {
          console.log('Sample reports:', allData.slice(0, 5).map(r => ({ 
            id: r.id, 
            date: r.date, 
            inspector_name: r.inspector_name 
          })))
        }
        
        // Filter client-side for this user's reports
        const myReports = (allData || []).filter(report => {
          const reportInspector = (report.inspector_name || '').toLowerCase().trim()
          const userNameLower = (userName || '').toLowerCase()
          const userEmailLower = (userEmail || '').toLowerCase()
          
          // Check various matching conditions
          if (userName && reportInspector === userNameLower) return true
          if (userEmail && reportInspector === userEmailLower) return true
          if (userName && reportInspector.includes(userNameLower)) return true
          if (userEmail && reportInspector.includes(userEmailLower)) return true
          
          // Also check if the report inspector name is contained in user's name/email
          if (reportInspector && userName && userNameLower.includes(reportInspector)) return true
          if (reportInspector && userEmail && userEmailLower.includes(reportInspector)) return true
          
          return false
        })
        
        console.log('Filtered to my reports:', myReports.length)
        
        // Limit to 50 most recent
        const limitedReports = myReports.slice(0, 50)
        
        // Fetch status for each report
        const reportsWithStatus = await Promise.all(limitedReports.map(async (report) => {
          const { data: statusData } = await supabase
            .from('report_status')
            .select('status, revision_notes')
            .eq('report_id', report.id)
            .maybeSingle()
          return { ...report, status: statusData?.status || 'draft', revision_notes: statusData?.revision_notes }
        }))
        
        setPreviousReports(reportsWithStatus)
      } catch (err) {
        console.error('Error fetching previous reports:', err)
        setPreviousReports([])
      }
      setLoadingPreviousReports(false)
    }
    fetchPreviousReports()
  }, [userProfile])

  // Helper function to populate form from report data
  function populateFormFromReport(report) {
    console.log('[Edit Mode] Populating form from report:', report.id)

    // Store original for comparison
    setOriginalReportData(report)
    setIsEditMode(true)
    setCurrentReportId(parseInt(report.id, 10))

    // Populate all fields from report
    setSelectedDate(report.report_date || report.date || '')
    setInspectorName(report.inspector_name || '')
    setSpread(report.spread || '')
    setAfe(report.afe || '')
    setPipeline(report.pipeline || '')
    setWeather(report.weather || '')
    setPrecipitation(report.precipitation || '')
    setTempHigh(report.temp_high || '')
    setTempLow(report.temp_low || '')
    setWindSpeed(report.wind_speed || '')
    setRowCondition(report.row_condition || '')
    setStartTime(report.start_time || '')
    setStopTime(report.stop_time || '')
    setSafetyNotes(report.safety_notes || '')
    setSafetyRecognitionData(report.safety_recognition || { enabled: false, cards: [] })
    setLandEnvironment(report.land_environment || '')
    setWildlifeSightingData(report.wildlife_sighting || { enabled: false, sightings: [] })
    setGeneralComments(report.general_comments || '')
    setVisitors(report.visitors || [])
    setInspectorMileage(report.inspector_mileage || '')
    setInspectorEquipment(report.inspector_equipment || [])
    setUnitPriceItemsEnabled(report.unit_price_items_enabled || false)
    setUnitPriceData(report.unit_price_data || { items: [], comments: '' })

    // Load activity blocks
    console.log('[Edit Mode] Activity blocks from report:', report.activity_blocks?.length, report.activity_blocks)
    if (report.activity_blocks && report.activity_blocks.length > 0) {
      const loadedChainageReasons = {}
      const loadedBlocks = report.activity_blocks.map((block, idx) => {
        const blockId = block.id || `block-${Date.now()}-${idx}`

        // Restore chainage reasons from saved data
        if (block.chainageOverlapReason || block.chainageGapReason) {
          loadedChainageReasons[blockId] = {
            overlapReason: block.chainageOverlapReason || '',
            gapReason: block.chainageGapReason || ''
          }
        }

        // Generate URL for existing ticket photo(s)
        let savedTicketPhotoUrl = null
        let savedTicketPhotoUrls = null
        console.log('[Edit Mode] Block ticketPhoto field:', block.ticketPhoto, 'type:', typeof block.ticketPhoto)
        if (block.ticketPhoto && typeof block.ticketPhoto === 'string') {
          const { data } = supabase.storage
            .from('ticket-photos')
            .getPublicUrl(block.ticketPhoto)
          savedTicketPhotoUrl = data?.publicUrl || null
          console.log('[Edit Mode] Loaded ticket photo URL:', savedTicketPhotoUrl)
        }
        // Generate URLs for all saved ticket photo pages
        if (block.ticketPhotos && Array.isArray(block.ticketPhotos) && block.ticketPhotos.length > 0) {
          savedTicketPhotoUrls = block.ticketPhotos.map(filename => {
            const { data } = supabase.storage
              .from('ticket-photos')
              .getPublicUrl(filename)
            return data?.publicUrl || null
          }).filter(Boolean)
          console.log('[Edit Mode] Loaded', savedTicketPhotoUrls.length, 'ticket photo URLs')
        }

        return {
          id: blockId,
          activityType: block.activityType || '',
          contractor: block.contractor || '',
          foreman: block.foreman || '',
          startKP: block.startKP || '',
          endKP: block.endKP || '',
          workDescription: block.workDescription || '',
          labourEntries: block.labourEntries || [],
          equipmentEntries: block.equipmentEntries || [],
          qualityData: block.qualityData || {},
          workPhotos: (block.workPhotos || []).map(photo => {
            // Generate preview URL for saved photos (they have filename but no File object)
            if (photo.filename && !photo.file) {
              const { data } = supabase.storage.from('work-photos').getPublicUrl(photo.filename)
              return { ...photo, savedUrl: data?.publicUrl || null }
            }
            return photo
          }),
          ticketPhoto: null,  // For new uploads
          ticketPhotos: null,  // For new multi-page uploads
          savedTicketPhotoUrl: savedTicketPhotoUrl,  // URL for existing photo
          savedTicketPhotoUrls: savedTicketPhotoUrls,  // URLs for all existing pages
          savedTicketPhotoName: block.ticketPhoto || null,  // Filename for display
          savedTicketPhotoNames: block.ticketPhotos || null,  // All filenames for multi-page
          timeLostReason: block.timeLostReason || 'None',
          timeLostHours: block.timeLostHours || '',
          timeLostDetails: block.timeLostDetails || '',
          metersToday: block.metersToday || '',
          metersPrevious: block.metersPrevious || '',
          ticketNumber: block.ticketNumber || '',
          weldData: block.weldData || null,
          bendingData: block.bendingData || null,
          stringingData: block.stringingData || null,
          coatingData: block.coatingData || null,
          clearingData: block.clearingData || null,
          counterboreData: block.counterboreData || null,
          hddData: block.hddData || null,
          pilingData: block.pilingData || null,
          hydrovacData: block.hydrovacData || null,
          welderTestingData: block.welderTestingData || null,
          hydrotestData: block.hydrotestData || null,
          tieInCompletionData: block.tieInCompletionData || null,
          ditchData: block.ditchData || null,
          gradingData: block.gradingData || null,
          cleaningLogData: block.cleaningLogData || null,
          machineCleanupData: block.machineCleanupData || null,
          finalCleanupData: block.finalCleanupData || null
        }
      })
      setActivityBlocks(loadedBlocks)
      setChainageReasons(loadedChainageReasons)
    }

    setLoadingReport(false)
    console.log('[Edit Mode] Form populated successfully')
  }

  // Load report for editing
  useEffect(() => {
    console.log('[Edit Mode] useEffect triggered:', { editReportId, editReportDataProp: !!editReportDataProp, hasUserProfile: !!userProfile })

    async function loadReportForEdit() {
      console.log('[Edit Mode] loadReportForEdit called:', { editReportId, editReportDataProp: !!editReportDataProp, userProfile: userProfile?.full_name })

      if (!editReportId) {
        console.log('[Edit Mode] No editReportId, skipping')
        return
      }
      if (!userProfile) {
        console.log('[Edit Mode] No userProfile yet, waiting...')
        return
      }

      // If editReportDataProp was passed (from InspectorApp), use it directly
      if (editReportDataProp) {
        console.log('[Edit Mode] Using editReportDataProp from parent')
        populateFormFromReport(editReportDataProp)
        return
      }

      console.log('[Edit Mode] Loading report from database:', editReportId)
      setLoadingReport(true)
      try {
        const { data: report, error } = await supabase
          .from('daily_reports')
          .select('*')
          .eq('id', editReportId)
          .single()

        console.log('[Edit Mode] Query result:', { report: report?.id, error })

        if (error) throw error
        if (!report) {
          alert('Report not found')
          navigate(orgPath('/inspector'))
          return
        }

        // Check if this inspector owns this report (unless they're admin/chief)
        const userRole = userProfile?.role
        const isAdminOrChief = ['super_admin', 'admin', 'chief_inspector', 'assistant_chief', 'welding_chief'].includes(userRole)

        if (!isAdminOrChief) {
          const reportInspector = (report.inspector_name || '').toLowerCase().trim()
          const userName = (userProfile.full_name || '').toLowerCase().trim()
          const userEmail = (userProfile.email || '').toLowerCase().trim()
          const userId = userProfile?.id

          // Check ownership multiple ways
          const ownsById = report.created_by === userId
          const ownsByName = reportInspector && userName && (
            reportInspector === userName ||
            reportInspector.includes(userName) ||
            userName.includes(reportInspector)
          )
          const ownsByEmail = reportInspector === userEmail

          console.log('[Edit Permission Check]', {
            reportInspector,
            userName,
            userEmail,
            userId,
            reportCreatedBy: report.created_by,
            ownsById,
            ownsByName,
            ownsByEmail
          })

          if (!ownsById && !ownsByName && !ownsByEmail) {
            alert('You can only edit your own reports.')
            navigate(orgPath('/field-entry'))
            return
          }
        }

        // Use the helper function to populate form
        populateFormFromReport(report)

        // Check if this report needs revision and show the notes
        const { data: statusData } = await supabase
          .from('report_status')
          .select('status, revision_notes')
          .eq('report_id', report.id)
          .maybeSingle()

        if (statusData?.status === 'revision_requested' && statusData?.revision_notes) {
          setTimeout(() => {
            alert(`⚠️ REVISION REQUESTED\n\nThe Chief Inspector has requested changes to this report:\n\n"${statusData.revision_notes}"\n\nPlease make the necessary corrections and save the report.`)
          }, 500)
        }
      } catch (err) {
        console.error('Error loading report:', err)
        alert('Error loading report: ' + err.message)
        setLoadingReport(false)
      }
    }

    loadReportForEdit()
  }, [editReportId, editReportDataProp, userProfile])

  // Fetch weather
  async function fetchWeather() {
    if (!pipeline || !pipelineLocations[pipeline]) {
      alert('Please select a pipeline first')
      return
    }
    
    setFetchingWeather(true)
    const loc = pipelineLocations[pipeline]
    
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${loc.lat}&lon=${loc.lon}&appid=${weatherApiKey}&units=metric`
      )
      const data = await response.json()
      
      setWeather(data.weather[0].main)
      setTempHigh(Math.round(data.main.temp_max))
      setTempLow(Math.round(data.main.temp_min))
      setWindSpeed(Math.round(data.wind.speed * 3.6)) // Convert m/s to km/h
      setPrecipitation(data.rain ? data.rain['1h'] || 0 : 0)
    } catch (error) {
      console.error('Weather fetch error:', error)
      alert('Failed to fetch weather data')
    }
    setFetchingWeather(false)
  }

  // Activity block management
  function addActivityBlock() {
    setActivityBlocks(prev => [...prev, createEmptyActivity()])
  }

  function removeActivityBlock(blockId) {
    if (activityBlocks.length === 1) {
      alert('You must have at least one activity')
      return
    }
    setActivityBlocks(prev => prev.filter(b => b.id !== blockId))
  }

  function updateActivityBlock(blockId, field, value) {
    setActivityBlocks(prev => {
      const updatedBlocks = prev.map(block =>
        block.id === blockId ? { ...block, [field]: value } : block
      )

      // Check for overlaps when KP or activity type changes
      if (field === 'startKP' || field === 'endKP' || field === 'activityType') {
        setOverlapWarnings(checkChainageOverlaps(updatedBlocks))
      }

      return updatedBlocks
    })
    
    // Fetch previous meters when activity type is selected
    if (field === 'activityType' && value) {
      fetchPreviousMeters(blockId, value)
    }
    
    // Fetch previous weld count when Coating activity is selected
    if (field === 'activityType' && value === 'Coating') {
      fetchPreviousWeldCount(blockId)
    }
  }

  // Fetch cumulative meters from previous reports for this activity type
  async function fetchPreviousMeters(blockId, activityType) {
    // Skip if pipeline not yet selected
    if (!pipeline) {
      return
    }

    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('activities, date')
        .eq('pipeline', pipeline)
        .order('date', { ascending: false })
        .neq('date', selectedDate) // Exclude current date
        .limit(100)
      
      if (error) {
        console.error('Error fetching previous meters:', error)
        return
      }
      
      let totalPreviousMeters = 0
      
      // Search through reports for matching activity types
      for (const report of data || []) {
        const activities = report.activities || []
        for (const activity of activities) {
          if (activity.activityType === activityType) {
            // Calculate meters from startKP and endKP
            if (activity.startKP && activity.endKP) {
              const startM = parseKPToMetres(activity.startKP)
              const endM = parseKPToMetres(activity.endKP)
              if (startM !== null && endM !== null) {
                totalPreviousMeters += Math.abs(endM - startM)
              }
            }
            // Also check for stored metersToday value
            if (activity.metersToday) {
              totalPreviousMeters += parseFloat(activity.metersToday) || 0
            }
          }
        }
      }
      
      // Update the block with previous meters
      setActivityBlocks(prev => prev.map(block => 
        block.id === blockId 
          ? { ...block, metersPrevious: totalPreviousMeters.toFixed(0) }
          : block
      ))
      
      console.log(`Previous meters for ${activityType}: ${totalPreviousMeters}m`)
    } catch (err) {
      console.error('Error in fetchPreviousMeters:', err)
    }
  }

  // Fetch cumulative weld count from previous Coating reports
  async function fetchPreviousWeldCount(blockId) {
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('activity_blocks')
        .order('report_date', { ascending: false })
        .limit(50)
      
      if (error) {
        console.error('Error fetching previous reports:', error)
        return
      }
      
      let totalPreviousWelds = 0
      
      // Search through reports for Coating activities with weld counts
      for (const report of data || []) {
        const blocks = report.activity_blocks || []
        for (const block of blocks) {
          if (block.activityType === 'Coating' && block.totalWeldsCoated) {
            // Found the most recent total - use it as our "previous"
            totalPreviousWelds = parseInt(block.totalWeldsCoated) || 0
            break
          }
        }
        if (totalPreviousWelds > 0) break
      }
      
      // Update the block with the previous count
      setActivityBlocks(prev => prev.map(block => 
        block.id === blockId 
          ? { ...block, weldsCoatedPreviously: totalPreviousWelds } 
          : block
      ))
    } catch (err) {
      console.error('Error fetching previous weld count:', err)
    }
  }

  // Mentor agent: accumulate alerts from all blocks (memoized to preserve React.memo on ActivityBlock)
  const handleMentorAlert = useCallback((blockId, blockAlerts) => {
    setMentorAlerts(prev => ({ ...prev, [blockId]: blockAlerts }))
    // Auto-open sidebar when critical alerts appear
    if (blockAlerts.some(a => a.severity === 'critical' && a.status === 'active')) {
      setMentorSidebarOpen(true)
    }
  }, [])

  // Debounced health score computation (1000ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      const flatAlerts = Object.values(mentorAlerts).flat()
      const result = computeHealthScore(activityBlocks, {}, flatAlerts)
      setHealthScore(result)
    }, 1000)
    return () => clearTimeout(timer)
  }, [activityBlocks, mentorAlerts])

  // Build compact report context for "Ask the Agent" so the AI can answer
  // questions about the inspector's current report data
  const reportContext = useMemo(() => {
    const lines = []

    // Report header
    lines.push(`Report Date: ${selectedDate}`)
    if (inspectorName) lines.push(`Inspector: ${inspectorName}`)
    if (spread) lines.push(`Spread: ${spread}`)
    if (afe) lines.push(`AFE: ${afe}`)
    if (pipeline) lines.push(`Pipeline: ${pipeline}`)
    if (weather) lines.push(`Weather: ${weather}`)
    if (tempHigh || tempLow) lines.push(`Temperature: High ${tempHigh || '?'}°C, Low ${tempLow || '?'}°C`)
    if (precipitation) lines.push(`Precipitation: ${precipitation}`)
    if (windSpeed) lines.push(`Wind: ${windSpeed} km/h`)
    if (rowCondition) lines.push(`ROW Condition: ${rowCondition}`)
    if (startTime || stopTime) lines.push(`Work Hours: ${startTime || '?'} to ${stopTime || '?'}`)

    // Activity blocks summary
    const activeBlocks = activityBlocks.filter(b => b.activityType)
    if (activeBlocks.length > 0) {
      lines.push('')
      lines.push(`--- ${activeBlocks.length} Activity Block(s) ---`)

      activeBlocks.forEach((block, idx) => {
        lines.push('')
        lines.push(`Block #${idx + 1}: ${block.activityType}`)
        if (block.contractor) lines.push(`  Contractor: ${block.contractor}`)
        if (block.foreman) lines.push(`  Foreman: ${block.foreman}`)
        if (block.startKP || block.endKP) lines.push(`  KP Range: ${block.startKP || '?'} to ${block.endKP || '?'}`)
        if (block.metersToday) lines.push(`  Metres Today: ${block.metersToday}`)
        if (block.metersPrevious) lines.push(`  Metres Previous: ${block.metersPrevious}`)
        if (block.ticketNumber) lines.push(`  Ticket #: ${block.ticketNumber}`)
        if (block.workDescription) lines.push(`  Work Description: ${block.workDescription}`)

        // Time lost
        if (block.timeLostReason && block.timeLostReason !== 'None') {
          lines.push(`  Time Lost: ${block.timeLostHours || '?'} hrs — ${block.timeLostReason}${block.timeLostDetails ? ' (' + block.timeLostDetails + ')' : ''}`)
        }

        // Labour summary
        if (block.labourEntries?.length > 0) {
          const totalRT = block.labourEntries.reduce((s, e) => s + (parseFloat(e.rt) || 0), 0)
          const totalOT = block.labourEntries.reduce((s, e) => s + (parseFloat(e.ot) || 0), 0)
          lines.push(`  Labour: ${block.labourEntries.length} worker(s), ${totalRT} RT hrs, ${totalOT} OT hrs`)
          block.labourEntries.forEach(e => {
            lines.push(`    - ${e.employeeName || 'Unnamed'} (${e.classification || '?'}): RT ${e.rt || 0}, OT ${e.ot || 0}${e.productionStatus && e.productionStatus !== 'ACTIVE' ? ' [' + e.productionStatus + ']' : ''}${e.dragReason ? ' — ' + e.dragReason : ''}`)
          })
        }

        // Equipment summary
        if (block.equipmentEntries?.length > 0) {
          const totalEqHrs = block.equipmentEntries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)
          lines.push(`  Equipment: ${block.equipmentEntries.length} unit(s), ${totalEqHrs} total hrs`)
          block.equipmentEntries.forEach(e => {
            lines.push(`    - ${e.type || '?'}${e.unitNumber ? ' (' + e.unitNumber + ')' : ''}: ${e.hours || 0} hrs${e.productionStatus && e.productionStatus !== 'ACTIVE' ? ' [' + e.productionStatus + ']' : ''}${e.dragReason ? ' — ' + e.dragReason : ''}`)
          })
        }

        // Quality data (non-empty fields)
        if (block.qualityData && Object.keys(block.qualityData).length > 0) {
          const filledFields = Object.entries(block.qualityData)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
          if (filledFields.length > 0) {
            lines.push(`  Quality Data (${filledFields.length} fields filled):`)
            filledFields.forEach(([key, val]) => {
              lines.push(`    ${key}: ${val}`)
            })
          }
        }

        // Work photos count
        const photoCount = block.workPhotos?.filter(p => p.file || p.filename)?.length || 0
        if (photoCount > 0) lines.push(`  Work Photos: ${photoCount}`)
      })
    }

    // Safety notes
    if (safetyNotes) {
      lines.push('')
      lines.push(`Safety Notes: ${safetyNotes}`)
    }

    // Health score
    if (healthScore) {
      lines.push('')
      lines.push(`Health Score: ${Math.round(healthScore.score)}/100 (${healthScore.passing ? 'PASSING' : 'BELOW THRESHOLD'})`)
    }

    return lines.join('\n')
  }, [selectedDate, inspectorName, spread, afe, pipeline, weather, tempHigh, tempLow, precipitation, windSpeed, rowCondition, startTime, stopTime, activityBlocks, safetyNotes, healthScore])

  // Flatten all mentor alerts for sidebar display
  const allMentorAlerts = Object.values(mentorAlerts).flat()
  const activeMentorAlerts = allMentorAlerts.filter(a => a.status === 'active')
  const mentorCriticalCount = activeMentorAlerts.filter(a => a.severity === 'critical').length
  const mentorWarningCount = activeMentorAlerts.filter(a => a.severity === 'warning').length

  function updateQualityData(blockId, fieldName, value) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          qualityData: { ...block.qualityData, [fieldName]: value }
        }
      }
      return block
    }))
  }

  function updateWeldData(blockId, weldData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          weldData: weldData
        }
      }
      return block
    }))
  }


  function updateBendData(blockId, bendData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          bendingData: bendData
        }
      }
      return block
    }))
  }

  function updateStringData(blockId, stringData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          stringingData: stringData
        }
      }
      return block
    }))
  }

  function updateCoatingData(blockId, coatingData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          coatingData: coatingData
        }
      }
      return block
    }))
  }

  function updateClearingData(blockId, clearingData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          clearingData: clearingData
        }
      }
      return block
    }))
  }

  function updateHDDData(blockId, hddData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          hddData: hddData
        }
      }
      return block
    }))
  }

  function updatePilingData(blockId, pilingData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          pilingData: pilingData
        }
      }
      return block
    }))
  }

  function updateCleaningLogData(blockId, cleaningLogData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          cleaningLogData: cleaningLogData
        }
      }
      return block
    }))
  }

  function updateHydrovacData(blockId, hydrovacData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          hydrovacData: hydrovacData
        }
      }
      return block
    }))
  }

  function updateWelderTestingData(blockId, welderTestingData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          welderTestingData: welderTestingData
        }
      }
      return block
    }))
  }

  function updateHydrotestData(blockId, hydrotestData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          hydrotestData: hydrotestData
        }
      }
      return block
    }))
  }

  function updateTieInCompletionData(blockId, tieInCompletionData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          tieInCompletionData: tieInCompletionData
        }
      }
      return block
    }))
  }

  function updateDitchData(blockId, ditchData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          ditchData: ditchData
        }
      }
      return block
    }))
  }

  function updateGradingData(blockId, gradingData) {
    console.log('[updateGradingData] rowWidth:', gradingData?.rowWidth, 'rowWidthSpec:', gradingData?.rowWidthSpec)
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          gradingData: gradingData
        }
      }
      return block
    }))
  }

  function updateCounterboreData(blockId, counterboreData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          counterboreData: counterboreData
        }
      }
      return block
    }))
  }

  function updateMachineCleanupData(blockId, machineCleanupData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          machineCleanupData: machineCleanupData
        }
      }
      return block
    }))
  }

  function updateFinalCleanupData(blockId, finalCleanupData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          finalCleanupData: finalCleanupData
        }
      }
      return block
    }))
  }

  function updateConventionalBoreData(blockId, conventionalBoreData) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          conventionalBoreData: conventionalBoreData
        }
      }
      return block
    }))
  }

  // Labour management for activity blocks
  // RT = Regular Time, OT = Overtime, JH = Jump Hours (bonus)
  function addLabourToBlock(blockId, employeeName, classification, rt, ot, jh, count) {
    // Check if at least one hour field has a value entered (including 0)
    const hasRT = rt !== '' && rt !== null && rt !== undefined
    const hasOT = ot !== '' && ot !== null && ot !== undefined
    const hasJH = jh !== '' && jh !== null && jh !== undefined
    if (!classification || (!hasRT && !hasOT && !hasJH)) {
      alert('Please enter classification and at least one hour type (RT, OT, or JH)')
      return
    }
    const rtVal = parseFloat(rt) || 0
    const otVal = parseFloat(ot) || 0
    const jhVal = parseFloat(jh) || 0
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: [...block.labourEntries, {
            id: Date.now() + Math.random(),
            employeeName: employeeName || '',
            classification,
            hours: rtVal + otVal, // Keep total for backwards compatibility
            rt: rtVal,
            ot: otVal,
            jh: jhVal,
            count: parseInt(count) || 1
          }]
        }
      }
      return block
    }))
  }

  // Update JH (Jump Hours) for a specific labour entry
  function updateLabourField(blockId, labourId, field, value) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: block.labourEntries.map(entry => {
            if (entry.id !== labourId) return entry
            const updated = { ...entry, [field]: value }
            // Keep total hours in sync when RT or OT changes
            if (field === 'rt' || field === 'ot') {
              updated.hours = (parseFloat(updated.rt) || 0) + (parseFloat(updated.ot) || 0)
            }
            return updated
          })
        }
      }
      return block
    }))
  }

  function updateLabourJH(blockId, labourId, jhValue) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: block.labourEntries.map(entry =>
            entry.id === labourId ? { ...entry, jh: parseFloat(jhValue) || 0 } : entry
          )
        }
      }
      return block
    }))
  }

  // Efficiency Audit - Labour handlers
  function updateLabourProductionStatus(blockId, labourId, status) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: block.labourEntries.map(entry =>
            entry.id === labourId ? { ...entry, productionStatus: status, shadowEffectiveHours: null } : entry
          )
        }
      }
      return block
    }))
  }

  function updateLabourShadowHours(blockId, labourId, hours) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: block.labourEntries.map(entry =>
            entry.id === labourId ? { ...entry, shadowEffectiveHours: hours === '' ? null : parseFloat(hours) } : entry
          )
        }
      }
      return block
    }))
  }

  function updateLabourDragReason(blockId, labourId, reason) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: block.labourEntries.map(entry =>
            entry.id === labourId ? { ...entry, dragReason: reason } : entry
          )
        }
      }
      return block
    }))
  }

  // Contractor Drag Note - required for contractor + management drag
  function updateLabourContractorNote(blockId, labourId, note) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: block.labourEntries.map(entry =>
            entry.id === labourId ? { ...entry, contractorDragNote: note } : entry
          )
        }
      }
      return block
    }))
  }

  // Efficiency Audit - Equipment handlers
  function updateEquipmentProductionStatus(blockId, equipmentId, status) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          equipmentEntries: block.equipmentEntries.map(entry =>
            entry.id === equipmentId ? { ...entry, productionStatus: status, shadowEffectiveHours: null } : entry
          )
        }
      }
      return block
    }))
  }

  function updateEquipmentShadowHours(blockId, equipmentId, hours) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          equipmentEntries: block.equipmentEntries.map(entry =>
            entry.id === equipmentId ? { ...entry, shadowEffectiveHours: hours === '' ? null : parseFloat(hours) } : entry
          )
        }
      }
      return block
    }))
  }

  function updateEquipmentDragReason(blockId, equipmentId, reason) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          equipmentEntries: block.equipmentEntries.map(entry =>
            entry.id === equipmentId ? { ...entry, dragReason: reason } : entry
          )
        }
      }
      return block
    }))
  }

  // Contractor Drag Note - required for contractor + management drag
  function updateEquipmentContractorNote(blockId, equipmentId, note) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          equipmentEntries: block.equipmentEntries.map(entry =>
            entry.id === equipmentId ? { ...entry, contractorDragNote: note } : entry
          )
        }
      }
      return block
    }))
  }

  function updateEquipmentField(blockId, equipmentId, field, value) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          equipmentEntries: block.equipmentEntries.map(entry =>
            entry.id === equipmentId ? { ...entry, [field]: value } : entry
          )
        }
      }
      return block
    }))
  }

  function updateEquipmentUnitNumber(blockId, equipmentId, unitNumber) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          equipmentEntries: block.equipmentEntries.map(entry =>
            entry.id === equipmentId ? { ...entry, unitNumber } : entry
          )
        }
      }
      return block
    }))
  }

  // Efficiency Audit - Systemic (Entire Crew) delay handler
  function updateSystemicDelay(blockId, systemicDelay) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          systemicDelay: systemicDelay
        }
      }
      return block
    }))
  }

  function removeLabourFromBlock(blockId, labourId) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: block.labourEntries.filter(l => l.id !== labourId)
        }
      }
      return block
    }))
  }

  // Equipment management for activity blocks
  function addEquipmentToBlock(blockId, type, hours, count, unitNumber) {
    if (!type) {
      alert('Please enter equipment type')
      return
    }
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          equipmentEntries: [...block.equipmentEntries, {
            id: Date.now() + Math.random(),
            type,
            hours: parseFloat(hours),
            count: parseInt(count) || 1,
            unitNumber: unitNumber || ''
          }]
        }
      }
      return block
    }))
  }

  function removeEquipmentFromBlock(blockId, equipmentId) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          equipmentEntries: block.equipmentEntries.filter(e => e.id !== equipmentId)
        }
      }
      return block
    }))
  }

  // Photo handling for activity blocks
  function handleTicketPhotoSelect(blockId, event) {
    const file = event.target.files[0]
    if (file) {
      updateActivityBlock(blockId, 'ticketPhoto', file)
    }
  }

  function handleWorkPhotosSelect(blockId, event) {
    const files = Array.from(event.target.files)
    const newPhotos = files.map(file => ({
      file: file,
      location: '',
      description: ''
    }))
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          workPhotos: [...block.workPhotos, ...newPhotos]
        }
      }
      return block
    }))
  }

  function updatePhotoMetadata(blockId, photoIndex, field, value) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        const updatedPhotos = [...block.workPhotos]
        updatedPhotos[photoIndex] = { ...updatedPhotos[photoIndex], [field]: value }
        return { ...block, workPhotos: updatedPhotos }
      }
      return block
    }))
  }

  function removeWorkPhoto(blockId, photoIndex) {
    setActivityBlocks(prev => prev.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          workPhotos: block.workPhotos.filter((_, i) => i !== photoIndex)
        }
      }
      return block
    }))
  }

  // Save report
  async function saveReport(alsoExport = false) {
    console.log('=== SAVE REPORT CALLED ===')
    console.log('isEditMode:', isEditMode)
    console.log('currentReportId:', currentReportId, 'type:', typeof currentReportId)
    
    if (!selectedDate || !inspectorName) {
      alert('Please fill in date and inspector name')
      return
    }

    // Auto-add any unsaved visitor data from input fields
    let finalVisitors = [...visitors]
    if (visitorName.trim()) {
      finalVisitors.push({
        name: visitorName.trim(),
        company: visitorCompany.trim(),
        position: visitorPosition.trim()
      })
      setVisitors(finalVisitors)
      setVisitorName('')
      setVisitorCompany('')
      setVisitorPosition('')
    }

    // Check for Blasting activities with incomplete safety requirements
    const blastingErrors = []
    for (const block of activityBlocks) {
      if (block.activityType === 'Blasting') {
        // Check misfire inspection - mandatory
        const misfireInspection = block.qualityData?.misfireInspection
        if (!misfireInspection || misfireInspection === 'Not Completed') {
          blastingErrors.push(`Blasting Activity (${block.startKP || 'No KP'} - ${block.endKP || 'No KP'}): Misfire Inspection must be completed before submitting`)
        }
        // Check post-blast sweep - mandatory
        const postBlastSweep = block.qualityData?.postBlastSweep
        if (!postBlastSweep || postBlastSweep === 'Not Completed') {
          blastingErrors.push(`Blasting Activity (${block.startKP || 'No KP'} - ${block.endKP || 'No KP'}): Post-Blast Fly-rock Sweep must be completed before submitting`)
        }
      }
    }

    if (blastingErrors.length > 0) {
      alert(
        '⛔ CANNOT SUBMIT - Blasting Safety Requirements Not Met\n\n' +
        blastingErrors.join('\n\n') +
        '\n\n⚠️ These are mandatory safety checks that must be completed before the report can be submitted.'
      )
      return
    }

    // Check if any blocks have overlaps/gaps without required reasons
    const missingReasons = []
    for (const block of activityBlocks) {
      const status = blockChainageStatus[block.id]
      if (status?.hasOverlap && !chainageReasons[block.id]?.overlapReason) {
        missingReasons.push(`Activity "${block.activityType || 'Unnamed'}": Missing reason for OVERLAP`)
      }
      if (status?.hasGap && !chainageReasons[block.id]?.gapReason) {
        missingReasons.push(`Activity "${block.activityType || 'Unnamed'}": Missing reason for GAP`)
      }
    }

    if (missingReasons.length > 0) {
      alert(
        '⛔ CANNOT SAVE - Missing Required Information\n\n' +
        'The following chainage issues require a reason:\n\n' +
        missingReasons.join('\n') +
        '\n\nPlease scroll up and provide reasons for all detected overlaps and gaps before saving.'
      )
      return
    }

    // Check for current report overlaps (between activity blocks in this report)
    const currentWarnings = checkChainageOverlaps(activityBlocks)
    if (currentWarnings.length > 0) {
      const proceed = confirm(
        'Chainage overlaps detected in current report:\n\n' +
        currentWarnings.map(w => w.message).join('\n') +
        '\n\nDo you want to continue saving anyway?'
      )
      if (!proceed) return
    }

    setSaving(true)

    try {
      // ==================== OFFLINE MODE ====================
      // If offline and not in edit mode, save to IndexedDB for later sync
      if (!isOnline && !isEditMode) {
        console.log('[InspectorReport] Saving report offline...')

        // Check overlaps using cached data
        const cachedOverlapWarnings = await chainageCache.checkOverlapsOffline(activityBlocks, selectedDate)
        if (cachedOverlapWarnings.length > 0) {
          setSaving(false)
          const warningMessages = cachedOverlapWarnings.slice(0, 5).map(w => w.message).join('\n')
          const proceed = confirm(
            '⚠️ CHAINAGE OVERLAP WARNING (Offline Check)\n\n' +
            warningMessages +
            '\n\nNote: This check uses cached data. A full check will occur when syncing online.\n\nClick OK to save anyway, or Cancel to go back and fix.'
          )
          if (!proceed) return
          setSaving(true)
        }

        // Build report data for offline storage
        const reportData = {
          date: selectedDate,
          spread: spread,
          afe: afe,
          inspector_name: inspectorName,
          pipeline: pipeline,
          weather: weather,
          precipitation: parseFloat(precipitation) || 0,
          temp_high: parseFloat(tempHigh) || null,
          temp_low: parseFloat(tempLow) || null,
          wind_speed: parseFloat(windSpeed) || null,
          row_condition: rowCondition,
          start_time: startTime || null,
          stop_time: stopTime || null,
          safety_notes: safetyNotes,
          safety_recognition: safetyRecognitionData,
          land_environment: landEnvironment,
          wildlife_sighting: wildlifeSightingData,
          general_comments: generalComments,
          visitors: finalVisitors,
          inspector_mileage: parseFloat(inspectorMileage) || null,
          inspector_equipment: inspectorEquipment,
          unit_price_items_enabled: unitPriceItemsEnabled,
          unit_price_data: unitPriceData,
          created_by: userProfile?.id || null,
          organization_id: getOrgId()
        }

        // Add chainage reasons to blocks
        const blocksWithReasons = activityBlocks.map(block => ({
          ...block,
          chainageOverlapReason: chainageReasons[block.id]?.overlapReason || null,
          chainageGapReason: chainageReasons[block.id]?.gapReason || null
        }))

        // Save to IndexedDB
        const offlineReportId = await syncManager.saveReportOffline(reportData, blocksWithReasons)

        // Clear localStorage draft
        localStorage.removeItem(DRAFT_STORAGE_KEY)
        setDraftSaved(false)

        setSaving(false)
        setOfflineSaveSuccess(true)

        alert(
          '✅ Report Saved Offline\n\n' +
          'Your report has been saved locally and will be automatically uploaded when you reconnect to the internet.\n\n' +
          `Offline Report ID: ${offlineReportId.substring(0, 8)}...`
        )

        // Clear the form for a new report
        setTimeout(() => {
          setOfflineSaveSuccess(false)
          // Reset to new report state
          setActivityBlocks([createEmptyActivity()])
          setVisitors([])
          setTrackableItemsData([])
          setSafetyRecognitionData({ enabled: false, cards: [] })
          setWildlifeSightingData({ enabled: false, sightings: [] })
          setSafetyNotes('')
          setLandEnvironment('')
          setGeneralComments('')
        }, 2000)

        return
      }

      // ==================== ONLINE MODE ====================
      // Check for historical overlaps with previously saved reports
      const historicalWarnings = await checkHistoricalOverlaps(activityBlocks)
      console.log('Historical overlap check complete. Warnings found:', historicalWarnings.length)
      
      if (historicalWarnings.length > 0) {
        setSaving(false)
        
        // Show warning in UI
        setOverlapWarnings(prev => [...prev, ...historicalWarnings])
        
        const warningMessages = historicalWarnings.slice(0, 10).map(w => w.message).join('\n')
        const moreCount = historicalWarnings.length > 10 ? `\n... and ${historicalWarnings.length - 10} more overlaps` : ''
        
        const proceed = confirm(
          '⚠️ CHAINAGE OVERLAP WARNING ⚠️\n\n' +
          'The following chainages overlap with previously saved reports:\n\n' +
          warningMessages + moreCount +
          '\n\nThis may indicate duplicate work entries.\n\nClick OK to save anyway, or Cancel to go back and fix.'
        )
        if (!proceed) return
        setSaving(true)
      }

      // If also exporting, do export first while data is in state
      if (alsoExport) {
        await exportToExcel()
      }

      // Upload photos for each activity block
      const processedBlocks = []
      
      for (const block of activityBlocks) {
        // Preserve existing ticket photo filename, or null if none
        let ticketPhotoFileName = block.savedTicketPhotoName || null
        let ticketPhotoFileNames = block.savedTicketPhotoNames || null
        const workPhotoData = []

        // Upload NEW ticket photo(s) (if user uploaded/took new ones)
        if (block.ticketPhotos && block.ticketPhotos.length > 0) {
          // Upload all new File objects
          const uploadedNames = []
          for (let i = 0; i < block.ticketPhotos.length; i++) {
            const file = block.ticketPhotos[i]
            if (!(file instanceof File)) continue
            const fileExt = file.name.split('.').pop()
            const fileName = `ticket_${Date.now()}_${block.id}_p${i + 1}.${fileExt}`
            const { error: uploadError } = await supabase.storage
              .from('ticket-photos')
              .upload(fileName, file)
            if (uploadError) {
              console.error(`Ticket photo page ${i + 1} upload error:`, uploadError)
            } else {
              uploadedNames.push(fileName)
              console.log(`[Save] Uploaded ticket photo page ${i + 1}:`, fileName)
            }
          }
          if (uploadedNames.length > 0) {
            // Merge with any existing saved filenames (for adding pages to existing ticket)
            const existingNames = block.savedTicketPhotoNames || (ticketPhotoFileName ? [ticketPhotoFileName] : [])
            const allNames = [...existingNames, ...uploadedNames]
            ticketPhotoFileName = allNames[0]
            ticketPhotoFileNames = allNames
            console.log(`[Save] Ticket photos: ${existingNames.length} existing + ${uploadedNames.length} new = ${allNames.length} total`)
          }
        } else if (ticketPhotoFileName) {
          console.log('[Save] Preserving existing ticket photo:', ticketPhotoFileName)
        }

        // Upload work photos (new ones) and preserve existing ones
        for (let i = 0; i < block.workPhotos.length; i++) {
          const photo = block.workPhotos[i]

          // Already-saved photo from database — preserve metadata without re-uploading
          if (photo.filename && !(photo.file instanceof File)) {
            workPhotoData.push({
              filename: photo.filename,
              originalName: photo.originalName || photo.filename,
              location: photo.location,
              description: photo.description,
              inspector: photo.inspector || inspectorName,
              date: photo.date || selectedDate,
              spread: photo.spread || spread,
              afe: photo.afe || afe
            })
            continue
          }

          // New photo — upload to storage
          const fileExt = photo.file.name.split('.').pop()
          const fileName = `work_${Date.now()}_${block.id}_${i}.${fileExt}`
          const { error: uploadError } = await supabase.storage
            .from('work-photos')
            .upload(fileName, photo.file)

          if (uploadError) {
            console.error('Work photo upload error:', uploadError)
            alert(`Failed to upload photo "${photo.file.name}": ${uploadError.message}`)
          } else {
            workPhotoData.push({
              filename: fileName,
              originalName: photo.file.name,
              location: photo.location,
              description: photo.description,
              inspector: inspectorName,
              date: selectedDate,
              spread: spread,
              afe: afe
            })
          }
        }

        // Helper to get responsible_party from drag reason
        const getResponsibleParty = (dragReason) => {
          if (!dragReason) return null
          const reasonConfig = dragReasonCategories.find(r => r.label === dragReason || r.value === dragReason)
          return reasonConfig?.responsibleParty || null
        }

        // Process labour entries with shadow audit data and accountability
        const processedLabourEntries = block.labourEntries.map(entry => ({
          ...entry,
          productionStatus: entry.productionStatus || 'ACTIVE',
          shadowEffectiveHours: entry.shadowEffectiveHours ?? null,
          dragReason: entry.dragReason || '',
          contractorDragNote: entry.contractorDragNote || '',
          responsible_party: getResponsibleParty(entry.dragReason)
        }))

        // Process equipment entries with shadow audit data and accountability
        const processedEquipmentEntries = block.equipmentEntries.map(entry => ({
          ...entry,
          productionStatus: entry.productionStatus || 'ACTIVE',
          shadowEffectiveHours: entry.shadowEffectiveHours ?? null,
          dragReason: entry.dragReason || '',
          contractorDragNote: entry.contractorDragNote || '',
          responsible_party: getResponsibleParty(entry.dragReason)
        }))

        // Create block with processed entries for shadow audit calculation
        const blockForAudit = {
          ...block,
          labourEntries: processedLabourEntries,
          equipmentEntries: processedEquipmentEntries
        }

        processedBlocks.push({
          id: block.id,
          activityType: block.activityType,
          contractor: block.contractor,
          foreman: block.foreman,
          ticketPhoto: ticketPhotoFileName,
          ticketPhotos: ticketPhotoFileNames,
          startKP: block.startKP,
          endKP: block.endKP,
          workDescription: block.workDescription,
          labourEntries: processedLabourEntries,
          equipmentEntries: processedEquipmentEntries,
          qualityData: block.qualityData,
          workPhotos: workPhotoData,
          timeLostReason: block.timeLostReason,
          timeLostHours: block.timeLostHours,
          timeLostDetails: block.timeLostDetails,
          chainageOverlapReason: chainageReasons[block.id]?.overlapReason || null,
          chainageGapReason: chainageReasons[block.id]?.gapReason || null,
          // Efficiency Audit summary
          shadowAuditSummary: generateShadowAuditSummary(blockForAudit),
          // Specialized data for different activity types
          weldData: block.weldData || null,
          bendingData: block.bendingData || null,
          stringingData: block.stringingData || null,
          coatingData: block.coatingData || null,
          clearingData: block.clearingData || null,
          counterboreData: block.counterboreData || null,
          ditchData: block.ditchData || null,
          hddData: block.hddData || null,
          pilingData: block.pilingData || null,
          hydrovacData: block.hydrovacData || null,
          welderTestingData: block.welderTestingData || null,
          hydrotestData: block.hydrotestData || null,
          tieInCompletionData: block.tieInCompletionData || null,
          gradingData: block.gradingData || null,
          cleaningLogData: block.cleaningLogData || null,
          machineCleanupData: block.machineCleanupData || null,
          finalCleanupData: block.finalCleanupData || null
        })
      }

      // Build report data object
      const reportData = {
        date: selectedDate,
        spread: spread,
        afe: afe,
        inspector_name: inspectorName,
        pipeline: pipeline,
        weather: weather,
        precipitation: parseFloat(precipitation) || 0,
        temp_high: parseFloat(tempHigh) || null,
        temp_low: parseFloat(tempLow) || null,
        wind_speed: parseFloat(windSpeed) || null,
        row_condition: rowCondition,
        start_time: startTime || null,
        stop_time: stopTime || null,
        activity_blocks: processedBlocks,
        safety_notes: safetyNotes,
        safety_recognition: safetyRecognitionData,
        land_environment: landEnvironment,
        wildlife_sighting: wildlifeSightingData,
        general_comments: generalComments,
        visitors: finalVisitors,
        inspector_mileage: parseFloat(inspectorMileage) || null,
        inspector_equipment: inspectorEquipment,
        unit_price_items_enabled: unitPriceItemsEnabled,
        unit_price_data: unitPriceData,
        created_by: userProfile?.id || null,
        organization_id: getOrgId()
      }

      // ==================== EDIT MODE ====================
      if (isEditMode && currentReportId) {
        // Prompt for edit reason
        const editReason = prompt('Please enter a reason for this edit:')
        if (!editReason) {
          setSaving(false)
          return
        }

        // Compare and log changes
        const changes = []
        if (originalReportData) {
          // Header fields
          if (originalReportData.date !== selectedDate) changes.push({ section: 'Header', field: 'date', old: originalReportData.date, new: selectedDate })
          if (originalReportData.inspector_name !== inspectorName) changes.push({ section: 'Header', field: 'inspector_name', old: originalReportData.inspector_name, new: inspectorName })
          if (originalReportData.spread !== spread) changes.push({ section: 'Header', field: 'spread', old: originalReportData.spread, new: spread })
          if (originalReportData.pipeline !== pipeline) changes.push({ section: 'Header', field: 'pipeline', old: originalReportData.pipeline, new: pipeline })
          
          // Weather fields
          if (originalReportData.weather !== weather) changes.push({ section: 'Weather', field: 'weather', old: originalReportData.weather, new: weather })
          if (String(originalReportData.temp_high) !== String(tempHigh)) changes.push({ section: 'Weather', field: 'temp_high', old: originalReportData.temp_high, new: tempHigh })
          if (String(originalReportData.temp_low) !== String(tempLow)) changes.push({ section: 'Weather', field: 'temp_low', old: originalReportData.temp_low, new: tempLow })
          
          // Time
          if (originalReportData.start_time !== startTime) changes.push({ section: 'Time', field: 'start_time', old: originalReportData.start_time, new: startTime })
          if (originalReportData.stop_time !== stopTime) changes.push({ section: 'Time', field: 'stop_time', old: originalReportData.stop_time, new: stopTime })
          
          // Notes
          if (originalReportData.safety_notes !== safetyNotes) changes.push({ section: 'Notes', field: 'safety_notes', old: originalReportData.safety_notes?.substring(0, 100), new: safetyNotes?.substring(0, 100) })
          if (originalReportData.land_environment !== landEnvironment) changes.push({ section: 'Notes', field: 'land_environment', old: originalReportData.land_environment?.substring(0, 100), new: landEnvironment?.substring(0, 100) })
          if (originalReportData.general_comments !== generalComments) changes.push({ section: 'Notes', field: 'general_comments', old: originalReportData.general_comments?.substring(0, 100), new: generalComments?.substring(0, 100) })
          
          // Activity blocks - log that they were modified
          if (JSON.stringify(originalReportData.activity_blocks) !== JSON.stringify(processedBlocks)) {
            changes.push({ section: 'Activities', field: 'activity_blocks', old: `${(originalReportData.activity_blocks || []).length} activities`, new: `${processedBlocks.length} activities` })
          }
        }

        // Update the report
        console.log('Updating report ID:', currentReportId, 'Type:', typeof currentReportId)
        console.log('Report data to save:', reportData)
        
        const { data: updateData, error: updateError, count } = await supabase
          .from('daily_reports')
          .update(reportData)
          .eq('id', currentReportId)
          .select()

        console.log('Update result:', { updateData, updateError, count })
        
        if (updateError) throw updateError
        
        if (!updateData || updateData.length === 0) {
          throw new Error('Update failed - no rows affected. Report ID may not exist.')
        }

        // Persist health score separately (non-blocking, tolerates missing column)
        persistHealthScore(currentReportId)

        // Log each change to audit trail
        for (const change of changes) {
          await supabase.from('report_audit_log').insert({
            report_id: currentReportId,
            report_date: selectedDate,
            changed_by: userProfile?.id,
            changed_by_name: userProfile?.full_name || userProfile?.email,
            changed_by_role: currentUserRole,
            change_type: 'edit',
            section: change.section,
            field_name: change.field,
            old_value: String(change.old || ''),
            new_value: String(change.new || ''),
            change_reason: editReason,
            organization_id: getOrgId()
          })
        }

        // If no specific field changes detected, still log the edit
        if (changes.length === 0) {
          await supabase.from('report_audit_log').insert({
            report_id: currentReportId,
            report_date: selectedDate,
            changed_by: userProfile?.id,
            changed_by_name: userProfile?.full_name || userProfile?.email,
            changed_by_role: currentUserRole,
            change_type: 'edit',
            change_reason: editReason,
            organization_id: getOrgId()
          })
        }

        // Update status back to submitted (resubmit for review)
        await supabase.from('report_status').update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          review_decision: null,
          revision_notes: null,
          updated_at: new Date().toISOString()
        }).eq('report_id', currentReportId)

        // Reset welding review status if this is a welding report
        if (hasWeldingActivities(activityBlocks)) {
          try {
            // Update existing welding review record to pending
            const { data: existingReview } = await supabase
              .from('welding_report_reviews')
              .select('id')
              .eq('report_id', currentReportId)
              .single()

            if (existingReview) {
              await supabase.from('welding_report_reviews').update({
                status: 'pending_review',
                revision_notes: null,
                updated_at: new Date().toISOString()
              }).eq('report_id', currentReportId)
            } else {
              // Create new review record if doesn't exist
              await supabase.from('welding_report_reviews').insert({
                report_id: currentReportId,
                organization_id: getOrgId(),
                status: 'pending_review'
              })
            }
            console.log('Reset welding review status to pending_review')
          } catch (weldingReviewErr) {
            console.warn('Could not update welding review record:', weldingReviewErr)
          }
        }

        alert(`Report updated successfully! ${changes.length} field(s) changed.\n\nThe report has been resubmitted for review.`)

        // Return to appropriate page based on role
        if (currentUserRole === 'inspector') {
          navigate(orgPath('/inspector'))
        } else if (currentUserRole === 'chief_inspector') {
          navigate(orgPath('/chief-dashboard'))
        } else {
          navigate(orgPath('/admin'))
        }

      } else {
        // ==================== CREATE MODE ====================
        const { data: insertedTicket, error: dbError } = await supabase.from('daily_reports').insert([reportData]).select('id').single()

        if (dbError) throw dbError

        const ticketId = insertedTicket.id
        setCurrentReportId(ticketId)

        // Persist health score separately (non-blocking, tolerates missing column)
        persistHealthScore(ticketId)

        // Log to audit trail
        await supabase.from('report_audit_log').insert({
          report_id: ticketId,
          report_date: selectedDate,
          changed_by: userProfile?.id,
          changed_by_name: inspectorName || userProfile?.email,
          changed_by_role: currentUserRole,
          change_type: 'create',
          organization_id: getOrgId()
        })

        // Initialize report status as submitted (ready for Chief review)
        await supabase.from('report_status').insert({
          report_id: ticketId,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          submitted_by: userProfile?.id,
          submitted_by_name: inspectorName || userProfile?.email,
          organization_id: getOrgId()
        })

        // Create welding review record if report has welding activities
        if (hasWeldingActivities(activityBlocks)) {
          try {
            await supabase.from('welding_report_reviews').insert({
              report_id: ticketId,
              organization_id: getOrgId(),
              status: 'pending_review'
            })
            console.log('Created welding review record for report:', ticketId)
          } catch (weldingReviewErr) {
            // Non-blocking - table may not exist yet
            console.warn('Could not create welding review record:', weldingReviewErr)
          }
        }

        // Save trackable items with the new report ID
        if (trackableItemsData && trackableItemsData.length > 0) {
          console.log('Saving trackable items for report:', ticketId)
          for (const item of trackableItemsData) {
            // Only save items that have data
            if (item.item_type && (item.quantity || item.action)) {
              const record = {
                project_id: pipeline || 'default',
                report_id: ticketId,
                report_date: selectedDate,
                inspector: inspectorName,
                item_type: item.item_type,
                action: item.action,
                quantity: item.quantity,
                kp_location: item.kp_location,
                mat_type: item.mat_type,
                mat_size: item.mat_size,
                fence_type: item.fence_type,
                fence_purpose: item.fence_purpose,
                side: item.side,
                ramp_type: item.ramp_type,
                gates_qty: item.gates_qty,
                landowner: item.landowner,
                notes: item.notes,
                organization_id: getOrgId()
              }

              try {
                await supabase.from('trackable_items').insert(record)
                console.log('Saved trackable item:', item.item_type)
              } catch (itemErr) {
                console.error('Error saving trackable item:', itemErr)
              }
            }
          }
        }

        // Save tie-in data if present
        for (const block of activityBlocks) {
          if (block.activityType === 'Welding - Tie-in' && block.weldData?.tieIns?.length > 0) {
            await saveTieInTicket({ tieIns: block.weldData.tieIns })
          }
        }

        // Save trench logs for Ditch activities
        for (const block of activityBlocks) {
          if (block.activityType === 'Ditch' && block.ditchData) {
            const ditchData = block.ditchData
            try {
              const trenchLogRecord = {
                report_id: ticketId,
                activity_block_id: block.id,
                date: selectedDate,
                kp_start: block.startKP,
                kp_end: block.endKP,
                inspector_id: userProfile?.id,
                inspector_name: inspectorName,
                contractor: block.contractor,
                foreman: block.foreman,
                spread: spread,
                // Standard measurements
                trench_width: parseFloat(ditchData.trenchWidth) || null,
                trench_depth: parseFloat(ditchData.trenchDepth) || null,
                depth_of_cover_required: parseFloat(ditchData.depthOfCoverRequired) || null,
                depth_of_cover_actual: parseFloat(ditchData.depthOfCoverActual) || null,
                // Padding/Bedding pay item
                padding_bedding: ditchData.paddingBedding || false,
                padding_bedding_from_kp: ditchData.paddingBeddingFromKP || null,
                padding_bedding_to_kp: ditchData.paddingBeddingToKP || null,
                padding_bedding_meters: parseFloat(ditchData.paddingBeddingMeters) || 0,
                padding_material: ditchData.paddingMaterial || null,
                padding_bedding_verified: ditchData.paddingBeddingVerified || false,
                // BOT Checklist
                bot_free_of_rocks: ditchData.botChecklist?.freeOfRocks,
                bot_free_of_debris: ditchData.botChecklist?.freeOfDebris,
                bot_silt_fences_intact: ditchData.botChecklist?.siltFencesIntact,
                bot_wildlife_ramps: ditchData.botChecklist?.wildlifeRamps,
                bot_wildlife_gaps: ditchData.botChecklist?.wildlifeGaps,
                bot_grade_acceptable: ditchData.botChecklist?.gradeAcceptable,
                bot_issues: ditchData.botChecklist?.issues || null,
                // Water Management
                pumping_activity: ditchData.waterManagement?.pumpingActivity || false,
                pumping_equipment: ditchData.waterManagement?.pumpingEquipment || null,
                pumping_hours: parseFloat(ditchData.waterManagement?.pumpingHours) || null,
                filter_bag_usage: ditchData.waterManagement?.filterBagUsage || false,
                filter_bag_count: parseInt(ditchData.waterManagement?.filterBagCount) || 0,
                discharge_location: ditchData.waterManagement?.dischargeLocation || null,
                discharge_permit_number: ditchData.waterManagement?.dischargePermitNumber || null,
                water_management_notes: ditchData.waterManagement?.notes || null,
                // Soil Conditions
                soil_conditions: ditchData.soilConditions || null,
                groundwater_encountered: ditchData.groundwaterEncountered === 'Yes',
                groundwater_depth: parseFloat(ditchData.groundwaterDepth) || null,
                dewatering_required: ditchData.dewateringRequired === 'Yes',
                // Depth Compliance
                minimum_depth_met: ditchData.minimumDepthMet === 'Yes',
                depth_not_met_reason: ditchData.depthNotMetReason || null,
                depth_not_met_signoff_name: ditchData.depthNotMetSignoff || null,
                depth_not_met_signoff_role: ditchData.depthNotMetSignoffRole || null,
                depth_not_met_signoff_date: ditchData.depthNotMetDate || null,
                comments: ditchData.comments || null,
                organization_id: getOrgId()
              }

              await supabase.from('trench_logs').insert(trenchLogRecord)
              console.log('Saved trench log for block:', block.id)
            } catch (trenchErr) {
              console.error('Error saving trench log:', trenchErr)
            }
          }
        }

        alert('Report submitted successfully!')

        // Clear the auto-saved draft after successful save
        clearDraftAfterSave()

        // Clear form
        setActivityBlocks([createEmptyActivity()])
        setVisitors([])
        setSafetyNotes('')
        setLandEnvironment('')
        setGeneralComments('')
        setInspectorMileage('')
      }

    } catch (error) {
      console.error('Save error:', error)
      alert('Error saving report: ' + error.message)
    }

    setSaving(false)
  }

  // Persist health score to daily_reports (non-blocking, tolerates missing column)
  async function persistHealthScore(reportId) {
    if (!reportId || !healthScore?.score) return
    try {
      await supabase
        .from('daily_reports')
        .update({
          health_score: healthScore.score,
          health_score_details: healthScore.details
        })
        .eq('id', reportId)
    } catch {
      // Column may not exist yet - silently ignore
    }
  }

  // Export to Excel
  async function exportToExcel() {
    const data = []
    
    // Header info
    data.push([`${PROJECT_NAME} – DAILY INSPECTOR REPORT`])
    data.push([''])
    data.push(['Date:', selectedDate, '', 'Inspector:', inspectorName])
    data.push(['Pipeline:', pipeline, '', 'Spread:', spread])
    data.push(['Start Time:', startTime, '', 'Stop Time:', stopTime])
    data.push([''])
    data.push(['WEATHER'])
    data.push(['Conditions:', weather, 'Precipitation:', precipitation + ' mm'])
    data.push(['High:', tempHigh + '°C', 'Low:', tempLow + '°C', 'Wind:', windSpeed + ' km/h'])
    data.push(['ROW Condition:', rowCondition])
    data.push([''])

    // Activity blocks
    activityBlocks.forEach((block, blockIndex) => {
      data.push(['═══════════════════════════════════════════════════════════'])
      data.push([`ACTIVITY ${blockIndex + 1}: ${block.activityType || 'Not Selected'}`])
      data.push(['═══════════════════════════════════════════════════════════'])
      data.push(['Contractor:', block.contractor, 'Foreman:', block.foreman])
      data.push(['Start KP:', block.startKP, 'End KP:', block.endKP])
      
      // Chainage reasons if any
      const overlapReason = chainageReasons[block.id]?.overlapReason
      const gapReason = chainageReasons[block.id]?.gapReason
      if (overlapReason) {
        data.push(['⚠️ Overlap Reason:', overlapReason])
      }
      if (gapReason) {
        data.push(['📍 Gap Reason:', gapReason])
      }
      
      data.push(['Work Description:', block.workDescription])
      data.push([''])

      // Quality data
      if (block.activityType && qualityFieldsByActivity[block.activityType]) {
        data.push(['QUALITY CHECKS:'])
        qualityFieldsByActivity[block.activityType].forEach(field => {
          const value = block.qualityData[field.name] || 'N/A'
          data.push([field.label + ':', value])
        })
        data.push([''])
      }

      // Labour
      if (block.labourEntries.length > 0) {
        data.push(['MANPOWER:'])
        data.push(['Employee', 'Classification', 'RT', 'OT', 'JH', 'Count'])
        block.labourEntries.forEach(entry => {
          const rt = entry.rt !== undefined ? entry.rt : Math.min(entry.hours || 0, 8)
          const ot = entry.ot !== undefined ? entry.ot : Math.max(0, (entry.hours || 0) - 8)
          const jh = entry.jh || 0
          data.push([entry.employeeName || '', entry.classification, rt, ot, jh, entry.count])
        })
        data.push([''])
      }

      // Equipment
      if (block.equipmentEntries.length > 0) {
        data.push(['EQUIPMENT:'])
        data.push(['Type', 'Hours', 'Count'])
        block.equipmentEntries.forEach(entry => {
          data.push([entry.type, entry.hours, entry.count])
        })
        data.push([''])
      }

      // Time Lost (per activity)
      if (block.timeLostReason) {
        data.push(['TIME LOST:'])
        data.push(['Reason:', block.timeLostReason, 'Hours:', block.timeLostHours || '0'])
        data.push(['Details:', block.timeLostDetails || 'N/A'])
        data.push([''])
      }

      // Photos
      if (block.workPhotos.length > 0) {
        data.push(['WORK PHOTOS:'])
        data.push(['Filename', 'Location (KP)', 'Description'])
        block.workPhotos.forEach(photo => {
          data.push([photo.file.name, photo.location || 'N/A', photo.description || 'N/A'])
        })
        data.push([''])
      }
    })

    // General sections
    data.push([''])
    data.push(['SAFETY NOTES:', safetyNotes || 'None'])
    data.push(['LAND/ENVIRONMENT:', landEnvironment || 'None'])
    data.push(['GENERAL COMMENTS:', generalComments || 'None'])

    // Visitors
    if (visitors.length > 0) {
      data.push([''])
      data.push(['VISITORS:'])
      data.push(['Name', 'Company', 'Position'])
      visitors.forEach(v => {
        data.push([v.name, v.company, v.position])
      })
    }

    // Inspector info
    data.push([''])
    data.push(['INSPECTOR INFO'])
    data.push(['Mileage:', inspectorMileage || 'N/A'])
    data.push(['Equipment:', inspectorEquipment.join(', ') || 'None'])

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [
      { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 20 }
    ]
    
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Report')

    // Photo log tab
    const allPhotos = []
    activityBlocks.forEach((block, blockIdx) => {
      if (block.ticketPhoto) {
        allPhotos.push({
          activity: block.activityType,
          type: 'Contractor Ticket',
          filename: block.ticketPhoto.name,
          location: 'N/A',
          description: 'Contractor daily ticket'
        })
      }
      block.workPhotos.forEach(photo => {
        allPhotos.push({
          activity: block.activityType,
          type: 'Work Photo',
          filename: photo.file.name,
          location: photo.location || 'Not specified',
          description: photo.description || 'No description'
        })
      })
    })

    if (allPhotos.length > 0) {
      const photoData = [
        ['PHOTO LOG'],
        [''],
        ['Date:', selectedDate, 'Inspector:', inspectorName],
        [''],
        ['#', 'Activity', 'Type', 'Filename', 'Location (KP)', 'Description']
      ]
      allPhotos.forEach((photo, idx) => {
        photoData.push([idx + 1, photo.activity, photo.type, photo.filename, photo.location, photo.description])
      })
      
      const photoWs = XLSX.utils.aoa_to_sheet(photoData)
      photoWs['!cols'] = [
        { wch: 5 }, { wch: 20 }, { wch: 16 }, { wch: 30 }, { wch: 15 }, { wch: 40 }
      ]
      XLSX.utils.book_append_sheet(wb, photoWs, 'Photo Log')
    }

    // Generate file with ID, date, and activity type
    const reportId = currentReportId ? `_ID${currentReportId}` : ''
    const activityTypes = activityBlocks
      .filter(b => b.activityType)
      .map(b => b.activityType.replace(/[^a-zA-Z0-9]/g, '_'))
      .slice(0, 3) // Limit to first 3 activity types
      .join('_')
    const activityPart = activityTypes ? `_${activityTypes}` : ''
    const filename = `${PROJECT_SHORT}_Report${reportId}_${selectedDate}${activityPart}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // Export to PDF - Professional Pipe-Up branded layout
  async function exportToPDF() {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15
    const contentWidth = pageWidth - (margin * 2)
    let y = 0

    // Fetch trackable items from DB if not already loaded (component may not be mounted)
    let pdfTrackableItems = trackableItemsData
    console.log('[PDF] Trackable items - in-memory count:', pdfTrackableItems?.length || 0, 'reportId:', currentReportId)
    if ((!pdfTrackableItems || pdfTrackableItems.length === 0) && currentReportId) {
      try {
        let query = supabase
          .from('trackable_items')
          .select('*')
          .eq('report_id', currentReportId)
          .order('created_at', { ascending: true })
        query = addOrgFilter(query)
        const { data, error } = await query
        if (error) {
          console.warn('[PDF] Trackable items DB query error:', error)
        } else {
          console.log('[PDF] Trackable items DB fallback returned:', data?.length || 0, 'items')
        }
        if (data && data.length > 0) {
          pdfTrackableItems = data
        }
      } catch (err) {
        console.warn('Could not fetch trackable items for PDF:', err)
      }
    }

    // Generate unique document ID and timestamp for legal compliance
    const documentId = `${PROJECT_SHORT}-RPT-${currentReportId || Date.now()}-${Date.now().toString(36).toUpperCase()}`
    const generationTimestamp = new Date().toISOString()
    const generationTimestampLocal = new Date().toLocaleString('en-CA', {
      timeZone: 'America/Edmonton',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })

    // Add PDF metadata for legal compliance
    doc.setProperties({
      title: `Daily Inspector Report - ${selectedDate}`,
      subject: `Pipeline Inspection Report for ${PROJECT_SHORT} - ${selectedDate}`,
      author: inspectorName || 'Unknown Inspector',
      creator: 'Pipe-Up Inspection Management System',
      producer: 'Pipe-Up v2.0 / jsPDF',
      keywords: `inspection, ${PROJECT_SHORT}, ${selectedDate}, ${spread}, ${documentId}`,
      creationDate: new Date(),
      modDate: new Date()
    })

    // PIPE-UP BRAND COLORS
    const BRAND = {
      navy: [10, 22, 40],
      navyLight: [26, 54, 93],
      orange: [245, 158, 11],
      orangeLight: [254, 243, 199],
      gray: [107, 114, 128],
      grayLight: [249, 250, 251],
      grayMid: [229, 231, 235],
      white: [255, 255, 255],
      black: [0, 0, 0],
      green: [16, 185, 129],
      greenLight: [220, 252, 231],
      blue: [59, 130, 246],
      blueLight: [219, 234, 254],
      red: [239, 68, 68],
      redLight: [254, 226, 226],
      yellowLight: [255, 248, 225],
    }

    const setColor = (color, type = 'fill') => {
      let r, g, b
      if (typeof color === 'string' && color.startsWith('#')) {
        // Handle hex color strings like '#e2d5f1'
        const hex = color.slice(1)
        r = parseInt(hex.substring(0, 2), 16)
        g = parseInt(hex.substring(2, 4), 16)
        b = parseInt(hex.substring(4, 6), 16)
      } else if (Array.isArray(color)) {
        // Handle RGB arrays like [255, 255, 255]
        r = color[0]
        g = color[1]
        b = color[2]
      } else {
        // Fallback to black
        r = 0; g = 0; b = 0
      }
      if (type === 'fill') doc.setFillColor(r, g, b)
      else if (type === 'text') doc.setTextColor(r, g, b)
      else if (type === 'draw') doc.setDrawColor(r, g, b)
    }

    const checkPageBreak = (neededSpace = 30) => {
      if (y > pageHeight - neededSpace - 25) {  // Extra 25 for footer clearance
        doc.addPage()
        addHeader()
        y = 45
      }
    }

    const addHeader = () => {
      setColor(BRAND.navy, 'fill')
      doc.rect(0, 0, pageWidth, 32, 'F')
      setColor(BRAND.orange, 'fill')
      doc.rect(0, 32, pageWidth, 3, 'F')
      setColor(BRAND.white, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('PIPE-UP', margin, 14)
      doc.setFontSize(14)
      doc.text('DAILY INSPECTOR REPORT', margin, 25)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(PROJECT_SHORT || 'EGP', pageWidth - margin, 14, { align: 'right' })
      doc.setFontSize(8)
      doc.text(selectedDate || '', pageWidth - margin, 22, { align: 'right' })
    }

    const addFooter = (pageNum, totalPages) => {
      const footerY = pageHeight - 8
      setColor(BRAND.grayMid, 'draw')
      doc.line(margin, footerY - 6, pageWidth - margin, footerY - 6)
      setColor(BRAND.gray, 'text')
      doc.setFontSize(6)
      doc.setFont('helvetica', 'normal')
      // First line: URLs and page
      doc.text('pipe-up.ca', margin, footerY - 2)
      doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, footerY - 2, { align: 'center' })
      doc.text(`Doc ID: ${documentId}`, pageWidth - margin, footerY - 2, { align: 'right' })
      // Second line: timestamp for legal compliance
      doc.setFontSize(5)
      doc.text(`Generated: ${generationTimestampLocal} MST | ISO: ${generationTimestamp}`, margin, footerY + 2)
    }

    const addSectionHeader = (title, bgColor = BRAND.navyLight) => {
      checkPageBreak(25)
      y += 3
      setColor(bgColor, 'fill')
      doc.roundedRect(margin, y, contentWidth, 7, 1, 1, 'F')
      setColor(BRAND.white, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text(title, margin + 4, y + 5)
      y += 10
    }

    const addSubHeader = (title, bgColor = BRAND.grayLight) => {
      checkPageBreak(15)
      setColor(bgColor, 'fill')
      doc.rect(margin, y, contentWidth, 5, 'F')
      setColor(BRAND.navy, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text(title, margin + 2, y + 3.5)
      y += 7
    }

    // Horizontal label: value format on same line
    const addField = (label, value, x, labelWidth = 35) => {
      setColor(BRAND.gray, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(label + ':', x, y)
      setColor(BRAND.black, 'text')
      doc.setFont('helvetica', 'bold')
      doc.text(String(value || 'N/A'), x + labelWidth, y)
    }

    // Fetch a remote image URL and return as base64 data URL for jsPDF
    const fetchImageAsBase64 = async (url) => {
      try {
        const response = await fetch(url)
        if (!response.ok) return null
        const blob = await response.blob()
        return new Promise((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(blob)
        })
      } catch (e) {
        console.warn('[PDF] Failed to fetch image:', url, e)
        return null
      }
    }

    // BUILD PDF
    addHeader()
    y = 42

    // ═══════════════════════════════════════════════════════════
    // REPORT INFO - Two column layout
    // ═══════════════════════════════════════════════════════════
    setColor(BRAND.grayLight, 'fill')
    doc.roundedRect(margin, y, contentWidth, 34, 2, 2, 'F')
    setColor(BRAND.grayMid, 'draw')
    doc.roundedRect(margin, y, contentWidth, 34, 2, 2, 'S')

    const leftCol = margin + 5
    const rightCol = pageWidth / 2 + 5

    y += 6
    addField('Date', selectedDate, leftCol, 28)
    addField('Inspector', inspectorName, rightCol, 28)
    y += 6
    addField('Spread', spread, leftCol, 28)
    addField('Pipeline', pipeline, rightCol, 28)
    y += 6
    addField('AFE / Contract #', afe || 'N/A', leftCol, 40)
    y += 6
    addField('Start Time', startTime, leftCol, 28)
    addField('End Time', stopTime, rightCol, 28)
    y += 14

    // ═══════════════════════════════════════════════════════════
    // WEATHER
    // ═══════════════════════════════════════════════════════════
    addSectionHeader('WEATHER CONDITIONS', BRAND.blue)
    
    setColor(BRAND.blueLight, 'fill')
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'F')
    y += 5
    addField('Conditions', weather, leftCol, 30)
    addField('Precipitation', `${precipitation || '0'} mm`, rightCol, 35)
    y += 6
    addField('High / Low', `${tempHigh || '--'}°C / ${tempLow || '--'}°C`, leftCol, 30)
    addField('Wind', `${windSpeed || '--'} km/h`, rightCol, 35)
    y += 6
    addField('ROW Condition', rowCondition || 'N/A', leftCol, 35)
    y += 8

    // ═══════════════════════════════════════════════════════════
    // ACTIVITIES
    // ═══════════════════════════════════════════════════════════
    for (let idx = 0; idx < activityBlocks.length; idx++) {
      const block = activityBlocks[idx]
      checkPageBreak(60)
      
      // Activity header bar
      y += 3
      setColor(BRAND.green, 'fill')
      doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
      
      // Number badge
      setColor(BRAND.white, 'fill')
      doc.circle(margin + 7, y + 4, 3.5, 'F')
      setColor(BRAND.green, 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text(String(idx + 1), margin + 7, y + 5.2, { align: 'center' })
      
      // Activity title
      setColor(BRAND.white, 'text')
      doc.setFontSize(10)
      doc.text(block.activityType || 'Activity Not Selected', margin + 14, y + 5.5)
      y += 11

      // Activity details box (height depends on whether ticket # is present)
      const detailsBoxHeight = block.ticketNumber ? 32 : 26
      setColor(BRAND.greenLight, 'fill')
      doc.roundedRect(margin, y, contentWidth, detailsBoxHeight, 2, 2, 'F')
      y += 5
      addField('Contractor', block.contractor, leftCol, 28)
      addField('Foreman', block.foreman, rightCol, 28)
      y += 6
      addField('Start KP', block.startKP, leftCol, 28)
      addField('End KP', block.endKP, rightCol, 28)
      y += 6
      // Calculate metres from KP if not explicitly stored
      let metresToday = block.metersToday
      if (!metresToday && block.startKP && block.endKP) {
        const startM = parseKPToMetres(block.startKP)
        const endM = parseKPToMetres(block.endKP)
        if (startM !== null && endM !== null) {
          metresToday = Math.abs(endM - startM).toFixed(0)
        }
      }
      addField('Metres Today', metresToday || '0', leftCol, 35)
      addField('Previous', block.metersPrevious || '0', rightCol, 28)
      y += 6
      if (block.ticketNumber) {
        addField('Ticket #', block.ticketNumber, leftCol, 28)
      }
      y += 6

      // Chainage warnings
      const overlapReason = chainageReasons[block.id]?.overlapReason
      const gapReason = chainageReasons[block.id]?.gapReason
      
      if (overlapReason) {
        const overlapLines = doc.splitTextToSize('OVERLAP: ' + overlapReason, contentWidth - 6)
        const overlapBoxHeight = Math.max(7, overlapLines.length * 4 + 3)
        checkPageBreak(overlapBoxHeight + 3)
        setColor(BRAND.redLight, 'fill')
        doc.roundedRect(margin, y, contentWidth, overlapBoxHeight, 1, 1, 'F')
        setColor(BRAND.red, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        overlapLines.forEach((line, li) => {
          doc.text(line, margin + 3, y + 4.5 + (li * 4))
        })
        y += overlapBoxHeight + 2
      }
      if (gapReason) {
        const gapLines = doc.splitTextToSize('GAP: ' + gapReason, contentWidth - 6)
        const gapBoxHeight = Math.max(7, gapLines.length * 4 + 3)
        checkPageBreak(gapBoxHeight + 3)
        setColor(BRAND.orangeLight, 'fill')
        doc.roundedRect(margin, y, contentWidth, gapBoxHeight, 1, 1, 'F')
        setColor(BRAND.orange, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        gapLines.forEach((line, li) => {
          doc.text(line, margin + 3, y + 4.5 + (li * 4))
        })
        y += gapBoxHeight + 2
      }

      // Work Description
      if (block.workDescription) {
        checkPageBreak(20)
        addSubHeader('Work Description')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        const lines = doc.splitTextToSize(block.workDescription, contentWidth - 6)
        lines.forEach(line => {
          checkPageBreak(5)
          doc.text(line, margin + 3, y)
          y += 4
        })
        y += 2
      }

      // Quality Checks
      if (block.activityType && qualityFieldsByActivity[block.activityType] && Object.keys(block.qualityData || {}).length > 0) {
        checkPageBreak(20)
        addSubHeader('Quality Checks', BRAND.orangeLight)
        const fields = qualityFieldsByActivity[block.activityType]

        // Helper to render a list of flat fields in 2-column layout
        const renderQualityFields = (fieldList) => {
          let fieldCount = 0
          fieldList.forEach(field => {
            if (field.type === 'info') return
            const value = block.qualityData[field.name]
            if (value !== undefined && value !== null && value !== '') {
              if (fieldCount > 0 && fieldCount % 2 === 0) y += 5
              checkPageBreak(8)
              const col = fieldCount % 2 === 0 ? leftCol : rightCol
              addField(field.label.replace(/^[^\w]*/, '').substring(0, 22), String(value), col, 50)
              fieldCount++
            }
          })
          if (fieldCount > 0) y += 6
        }

        // Separate flat fields from collapsible sections
        const flatFields = fields.filter(f => f.type !== 'collapsible' && f.type !== 'info')
        const collapsibleSections = fields.filter(f => f.type === 'collapsible')

        // Render flat fields first
        renderQualityFields(flatFields)

        // Render each collapsible section that has data
        collapsibleSections.forEach(section => {
          if (!section.fields) return
          const hasData = section.fields.some(f => {
            const v = block.qualityData[f.name]
            return v !== undefined && v !== null && v !== ''
          })
          if (hasData) {
            checkPageBreak(15)
            // Section sub-header (strip emoji)
            const sectionLabel = section.label.replace(/^[^\w]*/, '').substring(0, 40)
            setColor(BRAND.orangeLight, 'fill')
            doc.rect(margin + 2, y, contentWidth - 4, 4.5, 'F')
            setColor(BRAND.navy, 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text(sectionLabel, margin + 4, y + 3.2)
            y += 6
            renderQualityFields(section.fields)
          }
        })
      }

      // Systemic Delay (Entire Crew Impact) - if active
      if (block.systemicDelay?.active && block.systemicDelay?.status !== 'ACTIVE') {
        checkPageBreak(18)
        const sysStatus = block.systemicDelay.status
        const sysStatusLabel = sysStatus === 'SYNC_DELAY' ? 'Partial Work' : 'Standby'
        const sysColor = sysStatus === 'SYNC_DELAY' ? [245, 158, 11] : BRAND.red
        const sysBgColor = sysStatus === 'SYNC_DELAY' ? [255, 251, 235] : BRAND.redLight

        setColor(sysBgColor, 'fill')
        doc.roundedRect(margin, y, contentWidth, 12, 1, 1, 'F')
        setColor(sysColor, 'draw')
        doc.roundedRect(margin, y, contentWidth, 12, 1, 1, 'S')

        y += 4
        setColor(sysColor, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text('ENTIRE CREW IMPACT:', margin + 4, y)
        doc.text(sysStatusLabel, margin + 50, y)

        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        y += 5
        doc.text(`Reason: ${(block.systemicDelay.reason || 'Not specified').substring(0, 70)}`, margin + 4, y)
        y += 6
      }

      // Manpower Table
      if (block.labourEntries?.length > 0) {
        checkPageBreak(30)
        addSubHeader('Manpower', BRAND.greenLight)

        // Table header - includes Status and Productive Hours
        setColor(BRAND.green, 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6)
        doc.text('EMPLOYEE', margin + 2, y + 3.5)
        doc.text('CLASS', margin + 32, y + 3.5)
        doc.text('RT', margin + 58, y + 3.5)
        doc.text('OT', margin + 68, y + 3.5)
        doc.text('JH', margin + 78, y + 3.5)
        doc.text('QTY', margin + 88, y + 3.5)
        doc.text('STATUS', margin + 100, y + 3.5)
        doc.text('PROD', margin + 130, y + 3.5)
        doc.text('REASON', margin + 145, y + 3.5)
        y += 6

        // Table rows
        block.labourEntries.forEach((entry, i) => {
          checkPageBreak(8)
          if (i % 2 === 0) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 5, 'F')
          }
          const rt = entry.rt !== undefined ? entry.rt : Math.min(entry.hours || 0, 8)
          const ot = entry.ot !== undefined ? entry.ot : Math.max(0, (entry.hours || 0) - 8)
          const count = entry.count || 1
          const billedHours = (rt + ot) * count
          const status = entry.productionStatus || 'ACTIVE'
          const multiplier = status === 'ACTIVE' ? 1.0 : status === 'SYNC_DELAY' ? 0.7 : 0.0
          const prodHours = entry.shadowEffectiveHours !== null && entry.shadowEffectiveHours !== undefined
            ? entry.shadowEffectiveHours
            : billedHours * multiplier
          const statusLabel = status === 'ACTIVE' ? 'Full' : status === 'SYNC_DELAY' ? 'Partial' : 'Standby'

          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text((entry.employeeName || '-').substring(0, 14), margin + 2, y + 3)
          doc.text((entry.classification || '').substring(0, 12), margin + 32, y + 3)
          doc.text(String(rt || 0), margin + 58, y + 3)
          doc.text(String(ot || 0), margin + 68, y + 3)
          doc.text(String(entry.jh || 0), margin + 78, y + 3)
          doc.text(String(count), margin + 88, y + 3)
          // Color-code status
          if (status === 'ACTIVE') setColor(BRAND.green, 'text')
          else if (status === 'SYNC_DELAY') setColor([245, 158, 11], 'text')
          else setColor(BRAND.red, 'text')
          doc.text(statusLabel, margin + 100, y + 3)
          setColor(BRAND.black, 'text')
          doc.text(String(prodHours.toFixed(1)), margin + 130, y + 3)
          doc.text((entry.dragReason || '-').substring(0, 18), margin + 145, y + 3)
          y += 5
        })
        y += 3
      }

      // Equipment Table
      if (block.equipmentEntries?.length > 0) {
        checkPageBreak(30)
        addSubHeader('Equipment', BRAND.blueLight)

        // Table header - includes Status and Productive Hours
        setColor(BRAND.blue, 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6)
        doc.text('EQUIPMENT TYPE', margin + 2, y + 3.5)
        doc.text('UNIT #', margin + 55, y + 3.5)
        doc.text('HRS', margin + 78, y + 3.5)
        doc.text('QTY', margin + 90, y + 3.5)
        doc.text('STATUS', margin + 103, y + 3.5)
        doc.text('PROD', margin + 130, y + 3.5)
        doc.text('REASON', margin + 148, y + 3.5)
        y += 6

        // Table rows
        block.equipmentEntries.forEach((entry, i) => {
          checkPageBreak(8)
          if (i % 2 === 0) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 5, 'F')
          }
          const hours = entry.hours || 0
          const count = entry.count || 1
          const billedHours = hours * count
          const status = entry.productionStatus || 'ACTIVE'
          const multiplier = status === 'ACTIVE' ? 1.0 : status === 'SYNC_DELAY' ? 0.7 : 0.0
          const prodHours = entry.shadowEffectiveHours !== null && entry.shadowEffectiveHours !== undefined
            ? entry.shadowEffectiveHours
            : billedHours * multiplier
          const statusLabel = status === 'ACTIVE' ? 'Full' : status === 'SYNC_DELAY' ? 'Partial' : 'Standby'

          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text((entry.type || '').substring(0, 26), margin + 2, y + 3)
          doc.text((entry.unitNumber || '-').substring(0, 10), margin + 55, y + 3)
          doc.text(String(hours), margin + 78, y + 3)
          doc.text(String(count), margin + 90, y + 3)
          // Color-code status
          if (status === 'ACTIVE') setColor(BRAND.green, 'text')
          else if (status === 'SYNC_DELAY') setColor([245, 158, 11], 'text')
          else setColor(BRAND.red, 'text')
          doc.text(statusLabel, margin + 103, y + 3)
          setColor(BRAND.black, 'text')
          doc.text(String(prodHours.toFixed(1)), margin + 130, y + 3)
          doc.text((entry.dragReason || '-').substring(0, 15), margin + 148, y + 3)
          y += 5
        })
        y += 3
      }

      // Verification Summary - Shadow Audit Data
      const hasLabourData = block.labourEntries?.length > 0
      const hasEquipmentData = block.equipmentEntries?.length > 0
      const hasAnyEntries = hasLabourData || hasEquipmentData

      if (hasAnyEntries) {
        // Calculate totals for this block
        let totalBilled = 0
        let totalProductive = 0

        if (block.labourEntries) {
          block.labourEntries.forEach(entry => {
            const rt = entry.rt !== undefined ? entry.rt : Math.min(entry.hours || 0, 8)
            const ot = entry.ot !== undefined ? entry.ot : Math.max(0, (entry.hours || 0) - 8)
            const count = entry.count || 1
            const billed = (rt + ot) * count
            totalBilled += billed
            const status = entry.productionStatus || 'ACTIVE'
            const multiplier = status === 'ACTIVE' ? 1.0 : status === 'SYNC_DELAY' ? 0.7 : 0.0
            const prod = entry.shadowEffectiveHours !== null && entry.shadowEffectiveHours !== undefined
              ? entry.shadowEffectiveHours
              : billed * multiplier
            totalProductive += prod
          })
        }

        if (block.equipmentEntries) {
          block.equipmentEntries.forEach(entry => {
            const hours = entry.hours || 0
            const count = entry.count || 1
            const billed = hours * count
            totalBilled += billed
            const status = entry.productionStatus || 'ACTIVE'
            const multiplier = status === 'ACTIVE' ? 1.0 : status === 'SYNC_DELAY' ? 0.7 : 0.0
            const prod = entry.shadowEffectiveHours !== null && entry.shadowEffectiveHours !== undefined
              ? entry.shadowEffectiveHours
              : billed * multiplier
            totalProductive += prod
          })
        }

        const nonWorking = totalBilled - totalProductive
        const efficiency = totalBilled > 0 ? (totalProductive / totalBilled * 100) : 100

        // Only show if there's any non-productive time
        if (nonWorking > 0 || totalBilled !== totalProductive) {
          checkPageBreak(20)
          addSubHeader('Verification Summary', [243, 232, 255]) // Light purple

          setColor([243, 232, 255], 'fill')
          doc.roundedRect(margin, y, contentWidth, 12, 1, 1, 'F')
          y += 4

          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)

          // Billed Hours
          doc.text('Billed:', margin + 3, y)
          doc.setFont('helvetica', 'bold')
          doc.text(`${totalBilled.toFixed(1)}h`, margin + 18, y)

          // Productive Hours
          doc.setFont('helvetica', 'normal')
          doc.text('Productive:', margin + 38, y)
          setColor(BRAND.green, 'text')
          doc.setFont('helvetica', 'bold')
          doc.text(`${totalProductive.toFixed(1)}h`, margin + 60, y)

          // Non-Working Hours
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.text('Non-Working:', margin + 82, y)
          setColor(BRAND.red, 'text')
          doc.setFont('helvetica', 'bold')
          doc.text(`${nonWorking.toFixed(1)}h`, margin + 110, y)

          // Efficiency
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.text('Efficiency:', margin + 132, y)
          if (efficiency >= 90) setColor(BRAND.green, 'text')
          else if (efficiency >= 70) setColor([245, 158, 11], 'text')
          else setColor(BRAND.red, 'text')
          doc.setFont('helvetica', 'bold')
          doc.text(`${efficiency.toFixed(0)}%`, margin + 155, y)

          y += 10
        }
      }

      // Stringing Log - Pipe Joints
      if (block.activityType === 'Stringing' && block.stringingData?.jointEntries?.length > 0) {
        checkPageBreak(40)
        addSubHeader('Stringing Log - Pipe Joints', BRAND.blueLight)
        
        // Summary row
        setColor(BRAND.blueLight, 'fill')
        doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
        setColor(BRAND.navy, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(`Joints Today: ${block.stringingData.jointsToday || 0}`, margin + 4, y + 5)
        doc.text(`Total Length: ${(block.stringingData.totalLengthM || 0).toFixed(1)} m`, margin + 55, y + 5)
        doc.text(`Joints Previous: ${block.stringingData.jointsPrevious || 0}`, margin + 110, y + 5)
        y += 11
        
        // Filter to strung joints only
        const strungJoints = block.stringingData.jointEntries.filter(j => j.status === 'Strung')
        
        if (strungJoints.length > 0) {
          // Table header
          setColor(BRAND.blue, 'fill')
          doc.rect(margin, y, contentWidth, 5, 'F')
          setColor(BRAND.white, 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(6)
          doc.text('JOINT #', margin + 2, y + 3.5)
          doc.text('HEAT #', margin + 25, y + 3.5)
          doc.text('STATION', margin + 48, y + 3.5)
          doc.text('SIDE', margin + 68, y + 3.5)
          doc.text('SIZE', margin + 82, y + 3.5)
          doc.text('LENGTH', margin + 97, y + 3.5)
          doc.text('W.T.', margin + 118, y + 3.5)
          doc.text('COAT', margin + 133, y + 3.5)
          doc.text('VIS', margin + 150, y + 3.5)
          doc.text('SRC', margin + 163, y + 3.5)
          y += 6
          
          // Table rows
          strungJoints.forEach((joint, i) => {
            checkPageBreak(6)
            if (i % 2 === 0) {
              setColor(BRAND.grayLight, 'fill')
              doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
            }
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(String(joint.jointNumber || '-').substring(0, 12), margin + 2, y + 2.5)
            doc.text(String(joint.heatNumber || '-').substring(0, 12), margin + 25, y + 2.5)
            doc.text(String(joint.stationKP || '-').substring(0, 8), margin + 48, y + 2.5)
            doc.text(String(joint.sideOfRow || '-').substring(0, 4), margin + 68, y + 2.5)
            doc.text(String(joint.pipeSize || '-').substring(0, 5), margin + 82, y + 2.5)
            doc.text(String(joint.lengthM || '-').substring(0, 6), margin + 97, y + 2.5)
            doc.text(String(joint.wallThickness || '-').substring(0, 5), margin + 118, y + 2.5)
            doc.text(String(joint.coatingType || '-').substring(0, 5), margin + 133, y + 2.5)
            doc.text(joint.visualCheck ? 'Y' : 'N', margin + 151, y + 2.5)
            doc.text(joint.source === 'tally_sheet' ? 'OCR' : 'MAN', margin + 163, y + 2.5)
            y += 4.5
          })
          y += 3
          
          // Visual confirmation summary
          const confirmedCount = strungJoints.filter(j => j.visualCheck).length
          const unconfirmedCount = strungJoints.length - confirmedCount
          
          if (unconfirmedCount > 0) {
            setColor(BRAND.orangeLight, 'fill')
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
            setColor(BRAND.orange, 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text(`! ${unconfirmedCount} joint(s) awaiting visual confirmation`, margin + 4, y + 4)
            y += 8
          } else {
            setColor(BRAND.greenLight, 'fill')
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
            setColor(BRAND.green, 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text(`All ${confirmedCount} joints visually confirmed`, margin + 4, y + 4)
            y += 8
          }
        }
        y += 3
      }

      // Bending Log - Bend Data
      if (block.activityType === 'Bending' && block.bendingData?.bendEntries?.length > 0) {
        checkPageBreak(40)
        addSubHeader('Bending Log', BRAND.orangeLight)
        
        // Summary row
        setColor(BRAND.orangeLight, 'fill')
        doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
        setColor(BRAND.navy, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(`Bends Today: ${block.bendingData.bendsToday || 0}`, margin + 4, y + 5)
        doc.text(`Bends Previous: ${block.bendingData.bendsPrevious || 0}`, margin + 50, y + 5)
        doc.text(`Total Bends: ${block.bendingData.totalBends || 0}`, margin + 110, y + 5)
        y += 11
        
        // Table header
        setColor(BRAND.orange, 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6)
        doc.text('STATION', margin + 2, y + 3.5)
        doc.text('PIPE', margin + 32, y + 3.5)
        doc.text('WALL', margin + 52, y + 3.5)
        doc.text('COAT', margin + 65, y + 3.5)
        doc.text('ANGLE', margin + 82, y + 3.5)
        doc.text('TYPE', margin + 100, y + 3.5)
        doc.text('DMAX', margin + 125, y + 3.5)
        doc.text('DMIN', margin + 142, y + 3.5)
        doc.text('OVAL', margin + 158, y + 3.5)
        doc.text('STATUS', margin + 172, y + 3.5)
        y += 6
        
        // Table rows
        block.bendingData.bendEntries.forEach((bend, i) => {
          checkPageBreak(6)
          if (i % 2 === 0) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
          }
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(String(bend.stationKP || '-').substring(0, 10), margin + 2, y + 2.5)
          doc.text(String(bend.pipeSize || '-').substring(0, 8), margin + 32, y + 2.5)
          doc.text(String(bend.wallThickness || '-').substring(0, 6), margin + 52, y + 2.5)
          doc.text(String(bend.coatingType || '-').substring(0, 6), margin + 65, y + 2.5)
          doc.text(String(bend.bendAngle || '-').substring(0, 6), margin + 82, y + 2.5)
          doc.text(String(bend.bendType || '-').substring(0, 10), margin + 100, y + 2.5)
          doc.text(String(bend.dmax || '-').substring(0, 6), margin + 125, y + 2.5)
          doc.text(String(bend.dmin || '-').substring(0, 6), margin + 142, y + 2.5)
          doc.text(bend.ovalityPercent !== null && bend.ovalityPercent !== undefined ? `${parseFloat(bend.ovalityPercent).toFixed(2)}%` : '-', margin + 158, y + 2.5)
          // Status indicator
          if (bend.engineerApproval === true) {
            setColor(BRAND.green, 'text')
            doc.text('✓', margin + 174, y + 2.5)
          } else if (bend.ovalityPass === false) {
            setColor(BRAND.red, 'text')
            doc.text('✗', margin + 174, y + 2.5)
          } else {
            setColor(BRAND.gray, 'text')
            doc.text('-', margin + 174, y + 2.5)
          }
          setColor(BRAND.black, 'text')
          y += 4.5
        })
        y += 3
      }

      // Welding Log - Mainline Weld Data
      if ((block.activityType?.includes('Welding') || block.activityType?.includes('Weld')) && block.weldData) {
        checkPageBreak(50)
        addSubHeader('Mainline Weld Data', BRAND.blueLight)
        
        // Summary row
        setColor(BRAND.blueLight, 'fill')
        doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
        setColor(BRAND.navy, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(`Crew: ${block.weldData.crewType || 'N/A'}`, margin + 4, y + 5)
        doc.text(`Method: ${block.weldData.weldMethod || 'Manual'}`, margin + 50, y + 5)
        doc.text(`Welds Today: ${block.weldData.weldsToday || 0}`, margin + 95, y + 5)
        doc.text(`Total: ${block.weldData.totalWelds || 0}`, margin + 140, y + 5)
        y += 11
        
        // Weld entries table
        if (block.weldData.weldEntries && block.weldData.weldEntries.length > 0) {
          // Table header
          setColor(BRAND.blue, 'fill')
          doc.rect(margin, y, contentWidth, 5, 'F')
          setColor(BRAND.white, 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(6)
          doc.text('WELD #', margin + 2, y + 3.5)
          doc.text('PREHEAT', margin + 28, y + 3.5)
          doc.text('PASS', margin + 50, y + 3.5)
          doc.text('VOLTS', margin + 70, y + 3.5)
          doc.text('AMPS', margin + 88, y + 3.5)
          doc.text('TRAVEL', margin + 106, y + 3.5)
          doc.text('HEAT IN', margin + 126, y + 3.5)
          doc.text('WPS', margin + 148, y + 3.5)
          doc.text('OK', margin + 168, y + 3.5)
          y += 6
          
          // Table rows
          block.weldData.weldEntries.forEach((weld, i) => {
            checkPageBreak(6)
            if (i % 2 === 0) {
              setColor(BRAND.grayLight, 'fill')
              doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
            }
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(String(weld.weldNumber || '-').substring(0, 12), margin + 2, y + 2.5)
            doc.text(String(weld.preheat || '-'), margin + 28, y + 2.5)
            doc.text(String(weld.pass || '-').substring(0, 8), margin + 50, y + 2.5)
            doc.text(String(weld.voltage || '-'), margin + 70, y + 2.5)
            doc.text(String(weld.amperage || '-'), margin + 88, y + 2.5)
            doc.text(String(weld.travelSpeed || '-'), margin + 106, y + 2.5)
            doc.text(String(weld.heatInput || '-'), margin + 126, y + 2.5)
            doc.text(String(weld.wpsId || '-').substring(0, 10), margin + 148, y + 2.5)
            // WPS compliance indicator
            if (weld.meetsWPS === true) {
              setColor(BRAND.green, 'text')
              doc.text('✓', margin + 170, y + 2.5)
            } else if (weld.meetsWPS === false) {
              setColor(BRAND.red, 'text')
              doc.text('✗', margin + 170, y + 2.5)
            } else {
              setColor(BRAND.gray, 'text')
              doc.text('-', margin + 170, y + 2.5)
            }
            setColor(BRAND.black, 'text')
            y += 4.5
          })
          y += 3
        }
        
        // Visuals completed
        if (block.weldData.visualsFrom || block.weldData.visualsTo) {
          checkPageBreak(8)
          setColor(BRAND.grayLight, 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor(BRAND.navy, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.text(`Visuals Completed: ${block.weldData.visualsFrom || '-'} to ${block.weldData.visualsTo || '-'}`, margin + 4, y + 4)
          y += 8
        }
        
        // Repairs
        if (block.weldData.repairs && block.weldData.repairs.length > 0) {
          checkPageBreak(20)
          setColor(BRAND.orangeLight, 'fill')
          doc.roundedRect(margin, y, contentWidth, 5, 1, 1, 'F')
          setColor(BRAND.orange, 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text(`Visual Repairs Identified (${block.weldData.repairs.length})`, margin + 4, y + 3.5)
          y += 7
          
          block.weldData.repairs.forEach((repair, i) => {
            checkPageBreak(5)
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(`${repair.weldNumber || '-'} | ${repair.defectCode || '-'} - ${repair.defectName || '-'} | ${repair.clockPosition ? repair.clockPosition + " o'clock" : '-'}`, margin + 4, y + 2.5)
            y += 4
          })
          y += 2
        }
        
        // Time tracking
        if (block.weldData.startTime || block.weldData.endTime || block.weldData.totalWeldTime) {
          checkPageBreak(8)
          setColor(BRAND.grayLight, 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor(BRAND.navy, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          const timeInfo = []
          if (block.weldData.startTime) timeInfo.push(`Start: ${block.weldData.startTime}`)
          if (block.weldData.endTime) timeInfo.push(`End: ${block.weldData.endTime}`)
          if (block.weldData.totalWeldTime) timeInfo.push(`Weld Time: ${block.weldData.totalWeldTime} hrs`)
          if (block.weldData.downTimeHours > 0) timeInfo.push(`Down: ${block.weldData.downTimeHours} hrs (${block.weldData.downTimeReason || 'N/A'})`)
          doc.text(timeInfo.join('  |  '), margin + 4, y + 4)
          y += 8
        }
        
        y += 3
      }

      // Coating Log - Weld Data
      if (block.activityType === 'Coating' && block.coatingData?.welds?.length > 0) {
        checkPageBreak(40)
        addSubHeader('Coating Log - Welds', BRAND.blueLight)
        
        // Summary row
        setColor(BRAND.blueLight, 'fill')
        doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
        setColor(BRAND.navy, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(`Welds Coated: ${block.coatingData.welds.length}`, margin + 4, y + 5)
        y += 11
        
        // Table header
        setColor(BRAND.blue, 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6)
        doc.text('WELD #', margin + 2, y + 3.5)
        doc.text('KP', margin + 35, y + 3.5)
        doc.text('DIAM', margin + 55, y + 3.5)
        doc.text('WALL', margin + 75, y + 3.5)
        doc.text('GRADE', margin + 95, y + 3.5)
        doc.text('COMPANY', margin + 125, y + 3.5)
        y += 6
        
        // Table rows
        block.coatingData.welds.forEach((weld, i) => {
          checkPageBreak(6)
          if (i % 2 === 0) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
          }
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(String(weld.weldNumber || '-').substring(0, 12), margin + 2, y + 2.5)
          doc.text(String(weld.kp || '-').substring(0, 10), margin + 35, y + 2.5)
          doc.text(String(weld.diameter || '-').substring(0, 6), margin + 55, y + 2.5)
          doc.text(String(weld.wallThickness || '-').substring(0, 6), margin + 75, y + 2.5)
          doc.text(String(weld.grade || '-').substring(0, 8), margin + 95, y + 2.5)
          doc.text(String(weld.coatingCompany || '-').substring(0, 20), margin + 125, y + 2.5)
          y += 4.5
        })
        y += 3
      }

      // Clearing Log - Timber Decks
      if (block.activityType === 'Clearing' && block.clearingData?.timberDecks?.length > 0) {
        checkPageBreak(40)
        addSubHeader('Clearing Log - Timber Decks', BRAND.greenLight)
        
        // Summary row
        setColor(BRAND.greenLight, 'fill')
        doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
        setColor(BRAND.navy, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(`Timber Decks: ${block.clearingData.timberDecks.length}`, margin + 4, y + 5)
        y += 11
        
        // Table header
        setColor(BRAND.green, 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6)
        doc.text('DECK ID', margin + 2, y + 3.5)
        doc.text('START KP', margin + 35, y + 3.5)
        doc.text('END KP', margin + 65, y + 3.5)
        doc.text('SPECIES', margin + 95, y + 3.5)
        doc.text('CONDITION', margin + 130, y + 3.5)
        doc.text('VOL (m³)', margin + 165, y + 3.5)
        y += 6
        
        // Table rows
        block.clearingData.timberDecks.forEach((deck, i) => {
          checkPageBreak(6)
          if (i % 2 === 0) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
          }
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(String(deck.deckId || '-').substring(0, 12), margin + 2, y + 2.5)
          doc.text(String(deck.startKp || '-').substring(0, 10), margin + 35, y + 2.5)
          doc.text(String(deck.endKp || '-').substring(0, 10), margin + 65, y + 2.5)
          doc.text(String(deck.speciesSort || '-').substring(0, 12), margin + 95, y + 2.5)
          doc.text(String(deck.condition || '-').substring(0, 12), margin + 130, y + 2.5)
          doc.text(String(deck.volumeEstimate || '-').substring(0, 8), margin + 165, y + 2.5)
          y += 4.5
        })
        y += 3
      }

      // Ditch Inspection Log
      if (block.activityType === 'Ditch' && block.ditchData) {
        checkPageBreak(60)
        addSubHeader('Ditch Inspection', '#e2d5f1')

        // Trench Specifications row
        setColor('#e2d5f1', 'fill')
        doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
        setColor(BRAND.navy, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text('TRENCH SPECIFICATIONS', margin + 4, y + 5)
        y += 10

        // Specifications grid
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        const specs = []
        if (block.ditchData.trenchWidth) specs.push(`Width: ${block.ditchData.trenchWidth}m`)
        if (block.ditchData.trenchDepth) specs.push(`Depth: ${block.ditchData.trenchDepth}m`)
        if (block.ditchData.depthOfCoverRequired) specs.push(`Cover Req: ${block.ditchData.depthOfCoverRequired}m`)
        if (block.ditchData.depthOfCoverActual) specs.push(`Cover Actual: ${block.ditchData.depthOfCoverActual}m`)
        if (specs.length > 0) {
          doc.text(specs.join('  |  '), margin + 4, y + 3)
          y += 7
        }

        // Pay Items section
        if (block.ditchData.rockDitch || block.ditchData.extraDepth || block.ditchData.paddingBedding) {
          checkPageBreak(30)
          setColor('#fff3cd', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor('#856404', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text('PAY ITEMS (UPIs)', margin + 4, y + 4)
          y += 8

          // Pay items table header
          setColor('#ffc107', 'fill')
          doc.rect(margin, y, contentWidth, 5, 'F')
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(6)
          doc.text('PAY ITEM', margin + 2, y + 3.5)
          doc.text('METRES', margin + 70, y + 3.5)
          doc.text('VERIFIED', margin + 110, y + 3.5)
          doc.text('NOTES', margin + 140, y + 3.5)
          y += 6

          // Padding/Bedding row
          if (block.ditchData.paddingBedding) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 5, 'F')
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            const paddingKP = (block.ditchData.paddingBeddingFromKP || block.ditchData.paddingBeddingToKP)
              ? `Padding/Bedding (${block.ditchData.paddingBeddingFromKP || '?'} to ${block.ditchData.paddingBeddingToKP || '?'})`
              : 'Padding/Bedding'
            doc.text(paddingKP.substring(0, 40), margin + 2, y + 3)
            doc.text(String(block.ditchData.paddingBeddingMeters || 0), margin + 70, y + 3)
            setColor(block.ditchData.paddingBeddingVerified ? BRAND.green : BRAND.red, 'text')
            doc.text(block.ditchData.paddingBeddingVerified ? 'YES' : 'NO', margin + 110, y + 3)
            setColor(BRAND.black, 'text')
            doc.text(String(block.ditchData.paddingMaterial || '').substring(0, 25), margin + 140, y + 3)
            y += 5
          }
          y += 3
        }

        // BOT Checklist
        if (block.ditchData.botChecklist) {
          checkPageBreak(25)
          setColor('#e7f3ff', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor('#004085', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text('BOT (BOTTOM OF TRENCH) CHECKLIST', margin + 4, y + 4)
          y += 8

          const botItems = []
          if (block.ditchData.botChecklist.freeOfRocks !== null && block.ditchData.botChecklist.freeOfRocks !== undefined)
            botItems.push(`Rocks: ${block.ditchData.botChecklist.freeOfRocks ? 'Clear' : 'ISSUE'}`)
          if (block.ditchData.botChecklist.freeOfDebris !== null && block.ditchData.botChecklist.freeOfDebris !== undefined)
            botItems.push(`Debris: ${block.ditchData.botChecklist.freeOfDebris ? 'Clear' : 'ISSUE'}`)
          if (block.ditchData.botChecklist.siltFencesIntact !== null && block.ditchData.botChecklist.siltFencesIntact !== undefined)
            botItems.push(`Silt Fences: ${block.ditchData.botChecklist.siltFencesIntact ? 'OK' : 'ISSUE'}`)
          if (block.ditchData.botChecklist.wildlifeRamps !== null && block.ditchData.botChecklist.wildlifeRamps !== undefined)
            botItems.push(`Ramps: ${block.ditchData.botChecklist.wildlifeRamps ? 'OK' : 'ISSUE'}`)
          if (block.ditchData.botChecklist.wildlifeGaps !== null && block.ditchData.botChecklist.wildlifeGaps !== undefined)
            botItems.push(`Gaps: ${block.ditchData.botChecklist.wildlifeGaps ? 'OK' : 'ISSUE'}`)
          if (block.ditchData.botChecklist.gradeAcceptable !== null && block.ditchData.botChecklist.gradeAcceptable !== undefined)
            botItems.push(`Grade: ${block.ditchData.botChecklist.gradeAcceptable ? 'OK' : 'ISSUE'}`)

          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(botItems.join('  |  '), margin + 4, y + 3)
          y += 6

          if (block.ditchData.botChecklist.issues) {
            setColor('#f8d7da', 'fill')
            doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
            setColor('#721c24', 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(6)
            doc.text('Issues: ' + String(block.ditchData.botChecklist.issues).substring(0, 100), margin + 4, y + 5)
            y += 10
          }
        }

        // Water Management
        if (block.ditchData.waterManagement && (block.ditchData.waterManagement.pumpingActivity || block.ditchData.waterManagement.filterBagUsage)) {
          checkPageBreak(15)
          setColor('#d4edda', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor('#155724', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text('WATER MANAGEMENT', margin + 4, y + 4)
          y += 8

          const waterItems = []
          if (block.ditchData.waterManagement.pumpingActivity) {
            waterItems.push('Pumping: Yes')
            if (block.ditchData.waterManagement.pumpingEquipment) waterItems.push(`Equip: ${block.ditchData.waterManagement.pumpingEquipment}`)
            if (block.ditchData.waterManagement.pumpingHours) waterItems.push(`Hours: ${block.ditchData.waterManagement.pumpingHours}`)
          }
          if (block.ditchData.waterManagement.filterBagUsage) {
            waterItems.push('Filter Bags: Yes')
            if (block.ditchData.waterManagement.filterBagCount) waterItems.push(`Count: ${block.ditchData.waterManagement.filterBagCount}`)
            if (block.ditchData.waterManagement.dischargeLocation) waterItems.push(`Discharge: ${block.ditchData.waterManagement.dischargeLocation}`)
          }

          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(waterItems.join('  |  '), margin + 4, y + 3)
          y += 6
        }

        // Soil Conditions
        const soilItems = []
        if (block.ditchData.soilConditions) soilItems.push(`Soil: ${block.ditchData.soilConditions}`)
        if (block.ditchData.groundwaterEncountered) soilItems.push(`Groundwater: ${block.ditchData.groundwaterEncountered}`)
        if (block.ditchData.groundwaterDepth) soilItems.push(`GW Depth: ${block.ditchData.groundwaterDepth}m`)
        if (block.ditchData.dewateringRequired) soilItems.push(`Dewatering: ${block.ditchData.dewateringRequired}`)

        if (soilItems.length > 0) {
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(soilItems.join('  |  '), margin + 4, y + 3)
          y += 6
        }

        // Depth Compliance
        if (block.ditchData.minimumDepthMet) {
          checkPageBreak(15)
          const isCompliant = block.ditchData.minimumDepthMet === 'Yes'
          setColor(isCompliant ? '#d4edda' : '#f8d7da', 'fill')
          doc.roundedRect(margin, y, contentWidth, isCompliant ? 6 : 14, 1, 1, 'F')
          setColor(isCompliant ? '#155724' : '#721c24', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text(`DEPTH COMPLIANCE: ${block.ditchData.minimumDepthMet === 'Yes' ? 'MINIMUM DEPTH MET' : 'MINIMUM DEPTH NOT MET'}`, margin + 4, y + 4)

          if (!isCompliant) {
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            const signoffInfo = []
            if (block.ditchData.depthNotMetReason) signoffInfo.push(`Reason: ${block.ditchData.depthNotMetReason.substring(0, 50)}`)
            if (block.ditchData.depthNotMetSignoff) signoffInfo.push(`Signoff: ${block.ditchData.depthNotMetSignoff}`)
            if (block.ditchData.depthNotMetSignoffRole) signoffInfo.push(`Role: ${block.ditchData.depthNotMetSignoffRole}`)
            if (block.ditchData.depthNotMetDate) signoffInfo.push(`Date: ${block.ditchData.depthNotMetDate}`)
            doc.text(signoffInfo.join('  |  '), margin + 4, y + 10)
            y += 16
          } else {
            y += 8
          }
        }

        // Comments
        if (block.ditchData.comments) {
          checkPageBreak(12)
          setColor(BRAND.grayLight, 'fill')
          doc.roundedRect(margin, y, contentWidth, 10, 1, 1, 'F')
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(6)
          doc.text('Comments: ' + String(block.ditchData.comments).substring(0, 150), margin + 4, y + 6)
          y += 12
        }

        y += 3
      }

      // Tie-In Completion Log
      if (block.activityType === 'Tie-in Backfill' && block.tieInCompletionData) {
        checkPageBreak(80)
        addSubHeader('Tie-In Completion Data', '#e8f4f8')

        // Backfill Details
        if (block.tieInCompletionData.backfill && (block.tieInCompletionData.backfill.method || block.tieInCompletionData.backfill.liftThickness || block.tieInCompletionData.backfill.compactionMethod)) {
          checkPageBreak(25)
          setColor('#d4edda', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor('#155724', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text('BACKFILL DETAILS', margin + 4, y + 4)
          y += 8

          const backfillItems = []
          if (block.tieInCompletionData.backfill.method) backfillItems.push(`Method: ${block.tieInCompletionData.backfill.method}`)
          if (block.tieInCompletionData.backfill.liftThickness) backfillItems.push(`Lift: ${block.tieInCompletionData.backfill.liftThickness}`)
          if (block.tieInCompletionData.backfill.numberOfLifts) backfillItems.push(`# Lifts: ${block.tieInCompletionData.backfill.numberOfLifts}`)
          if (block.tieInCompletionData.backfill.compactionMethod) backfillItems.push(`Compaction: ${block.tieInCompletionData.backfill.compactionMethod}`)
          if (block.tieInCompletionData.backfill.compactionTestRequired) backfillItems.push(`Test Req: ${block.tieInCompletionData.backfill.compactionTestRequired}`)
          if (block.tieInCompletionData.backfill.compactionTestPassed) backfillItems.push(`Test: ${block.tieInCompletionData.backfill.compactionTestPassed}`)
          if (block.tieInCompletionData.backfill.paddingMaterial) backfillItems.push(`Padding: ${block.tieInCompletionData.backfill.paddingMaterial}`)
          if (block.tieInCompletionData.backfill.paddingDepth) backfillItems.push(`Depth: ${block.tieInCompletionData.backfill.paddingDepth}`)

          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(backfillItems.join('  |  '), margin + 4, y + 3)
          y += 8
        }

        // Cathodic Protection
        if (block.tieInCompletionData.cathodicProtection && block.tieInCompletionData.cathodicProtection.installed === 'Yes') {
          checkPageBreak(40)
          setColor('#e8f4f8', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor('#17a2b8', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text('CATHODIC PROTECTION (TEST LEADS)', margin + 4, y + 4)
          y += 8

          // Configuration & Leads
          const cpConfig = []
          if (block.tieInCompletionData.cathodicProtection.stationType) cpConfig.push(`Station: ${block.tieInCompletionData.cathodicProtection.stationType}`)
          if (block.tieInCompletionData.cathodicProtection.wireGauge) cpConfig.push(`Wire: ${block.tieInCompletionData.cathodicProtection.wireGauge}`)
          if (block.tieInCompletionData.cathodicProtection.insulationType) cpConfig.push(`Insulation: ${block.tieInCompletionData.cathodicProtection.insulationType}`)
          if (block.tieInCompletionData.cathodicProtection.wireColor) cpConfig.push(`Color: ${block.tieInCompletionData.cathodicProtection.wireColor}`)

          if (cpConfig.length > 0) {
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text('Config: ' + cpConfig.join('  |  '), margin + 4, y + 3)
            y += 5
          }

          // Connection (Exothermic Weld)
          const cpConnection = []
          if (block.tieInCompletionData.cathodicProtection.weldMethod) cpConnection.push(`Weld: ${block.tieInCompletionData.cathodicProtection.weldMethod}`)
          if (block.tieInCompletionData.cathodicProtection.surfacePrepWhiteMetal) cpConnection.push('Surface Prep: White Metal')
          if (block.tieInCompletionData.cathodicProtection.slagTestPassed) cpConnection.push('Slag Test: PASS')
          if (block.tieInCompletionData.cathodicProtection.slackULoopConfirmed) cpConnection.push('Slack/U-Loop: Confirmed')
          if (block.tieInCompletionData.cathodicProtection.encapsulationType) cpConnection.push(`Encap: ${block.tieInCompletionData.cathodicProtection.encapsulationType}`)

          if (cpConnection.length > 0) {
            doc.text('Connection: ' + cpConnection.join('  |  '), margin + 4, y + 3)
            y += 5
          }

          // Termination
          const cpTerm = []
          if (block.tieInCompletionData.cathodicProtection.terminalBoardPosition) cpTerm.push(`Terminal: ${block.tieInCompletionData.cathodicProtection.terminalBoardPosition}`)
          if (block.tieInCompletionData.cathodicProtection.conduitType) cpTerm.push(`Conduit: ${block.tieInCompletionData.cathodicProtection.conduitType}`)
          if (block.tieInCompletionData.cathodicProtection.testStationInstalled) cpTerm.push(`Test Station: ${block.tieInCompletionData.cathodicProtection.testStationInstalled}`)

          if (cpTerm.length > 0) {
            doc.text('Termination: ' + cpTerm.join('  |  '), margin + 4, y + 3)
            y += 5
          }

          // Installed by
          if (block.tieInCompletionData.cathodicProtection.installedBy || block.tieInCompletionData.cathodicProtection.thirdPartyName) {
            doc.text(`Installed By: ${block.tieInCompletionData.cathodicProtection.installedBy || 'N/A'} ${block.tieInCompletionData.cathodicProtection.thirdPartyName ? `(${block.tieInCompletionData.cathodicProtection.thirdPartyName})` : ''}`, margin + 4, y + 3)
            y += 5
          }

          // Record Status
          if (block.tieInCompletionData.cathodicProtection.recordStatus) {
            const statusColor = block.tieInCompletionData.cathodicProtection.recordStatus === 'Verified' ? BRAND.green : BRAND.orange
            setColor(statusColor, 'text')
            doc.setFont('helvetica', 'bold')
            doc.text(`Status: ${block.tieInCompletionData.cathodicProtection.recordStatus}`, margin + 4, y + 3)
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            y += 5
          }

          // Photos count
          if (block.tieInCompletionData.cathodicProtection.photos && block.tieInCompletionData.cathodicProtection.photos.length > 0) {
            doc.text(`[Photo] ${block.tieInCompletionData.cathodicProtection.photos.length} photo(s) attached`, margin + 4, y + 3)
            y += 5
          }

          y += 3
        }

        // Pipe Support / Crossing Support
        if (block.tieInCompletionData.pipeSupport && block.tieInCompletionData.pipeSupport.required === 'Yes') {
          checkPageBreak(35)
          setColor('#fff7ed', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor('#fd7e14', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text('PIPE SUPPORT (CROSSING SUPPORT)', margin + 4, y + 4)
          y += 8

          const supports = block.tieInCompletionData.pipeSupport.supports || []
          if (supports.length > 0) {
            // Table header
            setColor('#fd7e14', 'fill')
            doc.rect(margin, y, contentWidth, 5, 'F')
            setColor(BRAND.white, 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(6)
            doc.text('TYPE', margin + 2, y + 3.5)
            doc.text('KP', margin + 45, y + 3.5)
            doc.text('QTY', margin + 75, y + 3.5)
            doc.text('UOM', margin + 95, y + 3.5)
            doc.text('ELEV', margin + 115, y + 3.5)
            doc.text('WELD ID', margin + 135, y + 3.5)
            doc.text('STATUS', margin + 165, y + 3.5)
            y += 6

            supports.forEach((support, i) => {
              checkPageBreak(6)
              if (i % 2 === 0) {
                setColor(BRAND.grayLight, 'fill')
                doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
              }
              setColor(BRAND.black, 'text')
              doc.setFont('helvetica', 'normal')
              doc.setFontSize(6)
              doc.text(String(support.typeName || '-').substring(0, 18), margin + 2, y + 2.5)
              doc.text(String(support.kpLocation || '-').substring(0, 10), margin + 45, y + 2.5)

              // Get quantity based on type
              let qty = 0
              if (support.type === 'sandbag_piers') qty = support.numberOfPiers || 0
              else if (support.type === 'polyurethane_foam') qty = support.volumeM3 || support.numberOfKits || 0
              else if (support.type === 'native_subsoil') qty = support.linearMeters || 0
              else if (support.type === 'concrete_sleepers') qty = support.quantity || 0

              doc.text(String(qty), margin + 75, y + 2.5)
              doc.text(String(support.uom || '-').substring(0, 6), margin + 95, y + 2.5)

              // Elevation verified
              setColor(support.elevationVerified ? BRAND.green : BRAND.red, 'text')
              doc.text(support.elevationVerified ? 'YES' : 'NO', margin + 115, y + 2.5)
              setColor(BRAND.black, 'text')

              doc.text(String(support.parentWeldId || '-').substring(0, 12), margin + 135, y + 2.5)
              doc.text(String(support.recordStatus || '-').substring(0, 12), margin + 165, y + 2.5)
              y += 4.5
            })
            y += 3
          } else {
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text('Pipe support required but no entries recorded', margin + 4, y + 3)
            y += 6
          }
        }

        // Third Party Crossings
        if (block.tieInCompletionData.thirdPartyCrossings && block.tieInCompletionData.thirdPartyCrossings.length > 0) {
          checkPageBreak(25)
          setColor('#fce4ec', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor('#880e4f', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text(`THIRD PARTY CROSSINGS (${block.tieInCompletionData.thirdPartyCrossings.length})`, margin + 4, y + 4)
          y += 8

          block.tieInCompletionData.thirdPartyCrossings.forEach((crossing, i) => {
            checkPageBreak(6)
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            const crossingInfo = []
            if (crossing.utilityType) crossingInfo.push(crossing.utilityType)
            if (crossing.owner) crossingInfo.push(`Owner: ${crossing.owner}`)
            if (crossing.clearance) crossingInfo.push(`Clearance: ${crossing.clearance}m`)
            if (crossing.protectionMethod) crossingInfo.push(`Protection: ${crossing.protectionMethod}`)
            doc.text(`${i + 1}. ${crossingInfo.join('  |  ')}`, margin + 4, y + 3)
            y += 5
          })
          y += 3
        }

        // Anodes (array of anode entries)
        if (block.tieInCompletionData.anodes && Array.isArray(block.tieInCompletionData.anodes) && block.tieInCompletionData.anodes.length > 0) {
          checkPageBreak(20 + block.tieInCompletionData.anodes.length * 5)
          setColor('#e3f2fd', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor('#1565c0', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text(`ANODES (${block.tieInCompletionData.anodes.length})`, margin + 4, y + 4)
          y += 8

          // Table header
          setColor('#2196f3', 'fill')
          doc.rect(margin, y, contentWidth, 5, 'F')
          setColor('white', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(6)
          doc.text('TYPE', margin + 2, y + 3.5)
          doc.text('MANUFACTURER', margin + 35, y + 3.5)
          doc.text('SIZE', margin + 80, y + 3.5)
          doc.text('SERIAL #', margin + 110, y + 3.5)
          doc.text('LOCATION', margin + 150, y + 3.5)
          y += 6

          block.tieInCompletionData.anodes.forEach((anode, i) => {
            checkPageBreak(5)
            if (i % 2 === 0) {
              setColor(BRAND.grayLight, 'fill')
              doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
            }
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(String(anode.type || '-').substring(0, 15), margin + 2, y + 2.5)
            doc.text(String(anode.manufacturer || '-').substring(0, 20), margin + 35, y + 2.5)
            doc.text(String(anode.size || '-').substring(0, 12), margin + 80, y + 2.5)
            doc.text(String(anode.serialNumber || '-').substring(0, 15), margin + 110, y + 2.5)
            doc.text(String(anode.location || anode.kp || '-').substring(0, 15), margin + 150, y + 2.5)
            y += 4.5
          })
          y += 3
        }

        y += 3
      }

      // HDD (Horizontal Directional Drilling) Log
      if (block.activityType === 'HDD' && block.hddData) {
        checkPageBreak(60)
        addSubHeader('HDD Drilling Data', '#e1f5fe')

        // Basic Info
        const hddBasic = []
        if (block.hddData.drillContractor) hddBasic.push(`Contractor: ${block.hddData.drillContractor}`)
        if (block.hddData.mainlineContractor) hddBasic.push(`Mainline: ${block.hddData.mainlineContractor}`)
        if (block.hddData.drillLocationKP) hddBasic.push(`Location: KP ${block.hddData.drillLocationKP}`)
        if (block.hddData.drillLengthM) hddBasic.push(`Length: ${block.hddData.drillLengthM}m`)
        if (block.hddData.pipeSize) hddBasic.push(`Pipe: ${block.hddData.pipeSize}`)

        if (hddBasic.length > 0) {
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(hddBasic.join('  |  '), margin + 4, y + 3)
          y += 8
        }

        // Drilling Progress
        if (block.hddData.drillingProgress) {
          const progressItems = []
          const dp = block.hddData.drillingProgress
          if (dp.pilotHole?.toDateM) progressItems.push(`Pilot: ${dp.pilotHole.toDateM}m (${dp.pilotHole.percentComplete || 0}%)`)
          if (dp.ream1?.toDateM) progressItems.push(`Ream1: ${dp.ream1.toDateM}m (${dp.ream1.percentComplete || 0}%)`)
          if (dp.ream2?.toDateM) progressItems.push(`Ream2: ${dp.ream2.toDateM}m`)
          if (dp.swabPass?.toDateM) progressItems.push(`Swab: ${dp.swabPass.toDateM}m`)
          if (dp.pipePull?.toDateM) progressItems.push(`Pull: ${dp.pipePull.toDateM}m (${dp.pipePull.percentComplete || 0}%)`)

          if (progressItems.length > 0) {
            checkPageBreak(12)
            setColor('#0288d1', 'fill')
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
            setColor('white', 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text('DRILLING PROGRESS', margin + 4, y + 4)
            y += 8

            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(progressItems.join('  |  '), margin + 4, y + 3)
            y += 8
          }
        }

        // Activities
        if (block.hddData.activities) {
          const actItems = []
          const act = block.hddData.activities
          if (act.sitePreparation?.today) actItems.push(`Site Prep Today: ${act.sitePreparation.today}`)
          if (act.rigSetUp?.today) actItems.push(`Rig Setup: ${act.rigSetUp.today}`)
          if (act.setCasing?.today) actItems.push(`Set Casing: ${act.setCasing.today}`)

          if (actItems.length > 0) {
            doc.text('Activities: ' + actItems.join('  |  '), margin + 4, y + 3)
            y += 6
          }
        }

        if (block.hddData.comments) {
          checkPageBreak(12)
          setColor(BRAND.grayLight, 'fill')
          doc.roundedRect(margin, y, contentWidth, 10, 1, 1, 'F')
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(6)
          doc.text('Comments: ' + String(block.hddData.comments).substring(0, 150), margin + 4, y + 6)
          y += 12
        }
        y += 3
      }

      // Grading Log
      if (block.activityType === 'Grading' && block.gradingData) {
        checkPageBreak(50)
        addSubHeader('Grading Data', '#fff3e0')

        // ROW Conditions
        const rowItems = []
        if (block.gradingData.rowWidth) rowItems.push(`ROW Width: ${block.gradingData.rowWidth}m`)
        if (block.gradingData.rowCondition) rowItems.push(`Condition: ${block.gradingData.rowCondition}`)
        if (block.gradingData.accessMaintained) rowItems.push(`Access: ${block.gradingData.accessMaintained}`)

        if (rowItems.length > 0) {
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(rowItems.join('  |  '), margin + 4, y + 3)
          y += 6
        }

        // Pile Separation
        const pileItems = []
        if (block.gradingData.pileSeparationMaintained) pileItems.push(`Pile Sep: ${block.gradingData.pileSeparationMaintained}`)
        if (block.gradingData.topsoilPileLocation) pileItems.push(`Topsoil: ${block.gradingData.topsoilPileLocation}`)
        if (block.gradingData.subsoilPileLocation) pileItems.push(`Subsoil: ${block.gradingData.subsoilPileLocation}`)

        if (pileItems.length > 0) {
          doc.text(pileItems.join('  |  '), margin + 4, y + 3)
          y += 6
        }

        // Drainage
        const drainItems = []
        if (block.gradingData.drainageCondition) drainItems.push(`Drainage: ${block.gradingData.drainageCondition}`)
        if (block.gradingData.crownMaintained) drainItems.push(`Crown: ${block.gradingData.crownMaintained}`)
        if (block.gradingData.pondingObserved) drainItems.push(`Ponding: ${block.gradingData.pondingObserved}`)

        if (drainItems.length > 0) {
          doc.text(drainItems.join('  |  '), margin + 4, y + 3)
          y += 6
        }

        // Environmental Controls
        const envItems = []
        if (block.gradingData.siltFenceInstalled) envItems.push(`Silt Fence: ${block.gradingData.siltFenceInstalled}`)
        if (block.gradingData.siltFenceCondition) envItems.push(`Condition: ${block.gradingData.siltFenceCondition}`)
        if (block.gradingData.strawBales) envItems.push(`Straw Bales: ${block.gradingData.strawBales}`)
        if (block.gradingData.erosionBlankets) envItems.push(`Erosion Blankets: ${block.gradingData.erosionBlankets}`)
        if (block.gradingData.sedimentTraps) envItems.push(`Sed. Traps: ${block.gradingData.sedimentTraps}`)

        if (envItems.length > 0) {
          checkPageBreak(12)
          setColor('#e8f5e9', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor('#2e7d32', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text('ENVIRONMENTAL CONTROLS', margin + 4, y + 4)
          y += 8

          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(envItems.join('  |  '), margin + 4, y + 3)
          y += 6
        }

        // Soft Spots
        if (block.gradingData.softSpots?.enabled && block.gradingData.softSpots?.entries?.length > 0) {
          checkPageBreak(20)
          setColor('#ffebee', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor('#c62828', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text(`SOFT SPOTS (${block.gradingData.softSpots.entries.length})`, margin + 4, y + 4)
          y += 8

          block.gradingData.softSpots.entries.slice(0, 5).forEach((spot, i) => {
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            const spotInfo = []
            if (spot.kp) spotInfo.push(`KP: ${spot.kp}`)
            if (spot.length) spotInfo.push(`Length: ${spot.length}m`)
            if (spot.treatment) spotInfo.push(`Treatment: ${spot.treatment}`)
            doc.text(spotInfo.join('  |  '), margin + 4, y + 3)
            y += 5
          })
        }

        if (block.gradingData.comments) {
          checkPageBreak(12)
          setColor(BRAND.grayLight, 'fill')
          doc.roundedRect(margin, y, contentWidth, 10, 1, 1, 'F')
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(6)
          doc.text('Comments: ' + String(block.gradingData.comments).substring(0, 150), margin + 4, y + 6)
          y += 12
        }
        y += 3
      }

      // Machine Cleanup Log
      if (block.activityType === 'Cleanup - Machine' && block.machineCleanupData) {
        checkPageBreak(80)
        addSubHeader('Machine Cleanup Data', '#e8f5e9')

        // Subsoil Restoration
        if (block.machineCleanupData.subsoilRestoration) {
          const sr = block.machineCleanupData.subsoilRestoration
          const srItems = []
          if (sr.rippingDepthCm) srItems.push(`Ripping: ${sr.rippingDepthCm}cm`)
          if (sr.numberOfPasses) srItems.push(`Passes: ${sr.numberOfPasses}`)
          if (sr.decompactionConfirmed) srItems.push('Decompaction: YES')
          if (sr.rockPickRequired) srItems.push('Rock Pick: YES')
          if (sr.rockVolumeRemovedM3) srItems.push(`Rock Removed: ${sr.rockVolumeRemovedM3}m3`)
          if (sr.contourMatchingRestored) srItems.push('Contour: Restored')
          if (sr.drainagePatternsRestored) srItems.push('Drainage: Restored')

          if (srItems.length > 0) {
            setColor('#c8e6c9', 'fill')
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
            setColor('#2e7d32', 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text('SUBSOIL RESTORATION & DE-COMPACTION', margin + 4, y + 4)
            y += 8

            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(srItems.join('  |  '), margin + 4, y + 3)
            y += 8
          }
        }

        // Trench Crown
        if (block.machineCleanupData.trenchCrown) {
          const tc = block.machineCleanupData.trenchCrown
          const tcItems = []
          if (tc.settlementCrownHeightCm) tcItems.push(`Crown: ${tc.settlementCrownHeightCm}cm`)
          if (tc.crownReliefGapsInstalled) tcItems.push('Relief Gaps: YES')
          if (tc.mechanicalCompaction) tcItems.push('Mech. Compact: YES')
          if (tc.compactionEquipmentType) tcItems.push(`Equip: ${tc.compactionEquipmentType}`)
          if (tc.compactionNumberOfLifts) tcItems.push(`Lifts: ${tc.compactionNumberOfLifts}`)

          if (tcItems.length > 0) {
            checkPageBreak(15)
            setColor('#bbdefb', 'fill')
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
            setColor('#1565c0', 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text('TRENCH & CROWN MANAGEMENT', margin + 4, y + 4)
            y += 8

            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(tcItems.join('  |  '), margin + 4, y + 3)
            y += 8
          }
        }

        // Debris Recovery Checklist
        if (block.machineCleanupData.debrisRecovery) {
          const dr = block.machineCleanupData.debrisRecovery
          const drItems = []
          if (dr.skidsLathRemoved) drItems.push('Skids/Lath: Removed')
          if (dr.weldingRodsCleared) drItems.push('Welding Rods: Cleared')
          if (dr.trashCleared) drItems.push('Trash: Cleared')
          if (dr.temporaryBridgesRemoved) drItems.push('Temp Bridges: Removed')
          if (dr.rampsRemoved) drItems.push('Ramps: Removed')
          if (dr.allDebrisCleared) drItems.push('ALL DEBRIS CLEARED')

          if (drItems.length > 0) {
            checkPageBreak(15)
            setColor('#fff3e0', 'fill')
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
            setColor('#e65100', 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text('DEBRIS & ASSET RECOVERY', margin + 4, y + 4)
            y += 8

            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(drItems.join('  |  '), margin + 4, y + 3)
            y += 8
          }
        }

        // Drain Tile Repairs
        if (block.machineCleanupData.drainTileRepair?.applicable && block.machineCleanupData.drainTileRepair.tiles?.length > 0) {
          checkPageBreak(20 + block.machineCleanupData.drainTileRepair.tiles.length * 5)
          setColor('#e1f5fe', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor('#0277bd', 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text(`DRAIN TILE REPAIRS (${block.machineCleanupData.drainTileRepair.tiles.length})`, margin + 4, y + 4)
          y += 8

          block.machineCleanupData.drainTileRepair.tiles.slice(0, 5).forEach((tile, i) => {
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            const tileInfo = []
            if (tile.kp) tileInfo.push(`KP: ${tile.kp}`)
            if (tile.diameter) tileInfo.push(`${tile.diameter}"`)
            if (tile.material) tileInfo.push(tile.material)
            if (tile.repairType) tileInfo.push(tile.repairType)
            if (tile.status) tileInfo.push(`Status: ${tile.status}`)
            doc.text(`${i + 1}. ${tileInfo.join('  |  ')}`, margin + 4, y + 3)
            y += 5
          })
          y += 3
        }

        // Erosion Control
        if (block.machineCleanupData.erosionControl) {
          const ec = block.machineCleanupData.erosionControl
          const ecItems = []
          if (ec.waterBarsInstalled) ecItems.push(`Water Bars: ${ec.waterBarsLinearMeters || 0}m`)
          if (ec.diversionBermsInstalled) ecItems.push('Diversion Berms: YES')
          if (ec.siltFenceStatus) ecItems.push(`Silt Fence: ${ec.siltFenceStatus}`)
          if (ec.strawWattlesStatus) ecItems.push(`Straw Wattles: ${ec.strawWattlesStatus}`)

          if (ecItems.length > 0) {
            checkPageBreak(15)
            setColor('#fce4ec', 'fill')
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
            setColor('#880e4f', 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text('EROSION & SEDIMENT CONTROL', margin + 4, y + 4)
            y += 8

            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(ecItems.join('  |  '), margin + 4, y + 3)
            y += 8
          }
        }

        // Additional Info
        const addlItems = []
        if (block.machineCleanupData.soilType) addlItems.push(`Soil: ${block.machineCleanupData.soilType}`)
        if (block.machineCleanupData.landUseCategory) addlItems.push(`Land Use: ${block.machineCleanupData.landUseCategory}`)
        if (block.machineCleanupData.specializedRockPicking) addlItems.push('Specialized Rock Pick: YES')
        if (block.machineCleanupData.importedFillUsed) addlItems.push(`Imported Fill: ${block.machineCleanupData.importedFillVolume || 0}m3`)

        if (addlItems.length > 0) {
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(addlItems.join('  |  '), margin + 4, y + 3)
          y += 6
        }

        // Photos count
        if (block.machineCleanupData.photos && block.machineCleanupData.photos.length > 0) {
          doc.text(`[Photo] ${block.machineCleanupData.photos.length} photo(s) attached`, margin + 4, y + 3)
          y += 5
        }

        if (block.machineCleanupData.comments) {
          checkPageBreak(12)
          setColor(BRAND.grayLight, 'fill')
          doc.roundedRect(margin, y, contentWidth, 10, 1, 1, 'F')
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(6)
          doc.text('Comments: ' + String(block.machineCleanupData.comments).substring(0, 150), margin + 4, y + 6)
          y += 12
        }
        y += 3
      }

      // Final Cleanup Log
      if (block.activityType === 'Cleanup - Final' && block.finalCleanupData) {
        checkPageBreak(80)
        addSubHeader('Final Cleanup Data', '#efebe9')

        // Topsoil Replacement
        if (block.finalCleanupData.topsoilReplacement) {
          const tr = block.finalCleanupData.topsoilReplacement
          const trItems = []
          if (tr.targetDepthCm) trItems.push(`Target: ${tr.targetDepthCm}cm`)
          if (tr.actualReplacedDepthCm) trItems.push(`Actual: ${tr.actualReplacedDepthCm}cm`)
          if (tr.depthCompliance) trItems.push(`Compliance: ${tr.depthCompliance}`)
          if (tr.replacedInDryConditions) trItems.push('Dry Conditions: YES')
          if (tr.gradeMatchesSurrounding) trItems.push('Grade Match: YES')
          if (tr.finalRockPickComplete) trItems.push('Rock Pick: Complete')
          if (tr.stoninessMatchesAdjacent) trItems.push('Stoniness: Match')

          if (trItems.length > 0) {
            setColor('#d7ccc8', 'fill')
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
            setColor('#5d4037', 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text('TOPSOIL REPLACEMENT', margin + 4, y + 4)
            y += 8

            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(trItems.join('  |  '), margin + 4, y + 3)
            y += 8

            if (tr.admixingObserved) {
              setColor('#dc3545', 'text')
              doc.text('[!] AD-MIXING OBSERVED: ' + (tr.admixingNotes || 'See notes').substring(0, 80), margin + 4, y + 3)
              setColor(BRAND.black, 'text')
              y += 6
            }
          }
        }

        // Revegetation & Seeding
        if (block.finalCleanupData.revegetation) {
          const rv = block.finalCleanupData.revegetation
          const rvItems = []
          if (rv.seedMixId) rvItems.push(`Mix: ${rv.seedMixId}`)
          if (rv.applicationRateKgHa) rvItems.push(`Rate: ${rv.applicationRateKgHa} kg/ha`)
          if (rv.seedingMethod) rvItems.push(`Method: ${rv.seedingMethod}`)
          if (rv.totalSeedUsedKg) rvItems.push(`Total: ${rv.totalSeedUsedKg} kg`)
          if (rv.fertilizerType) rvItems.push(`Fert: ${rv.fertilizerType}`)
          if (rv.fertilizerBagsUsed) rvItems.push(`Bags: ${rv.fertilizerBagsUsed}`)

          if (rvItems.length > 0) {
            checkPageBreak(20)
            setColor('#c8e6c9', 'fill')
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
            setColor('#2e7d32', 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text('REVEGETATION & SEEDING', margin + 4, y + 4)
            y += 8

            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(rvItems.join('  |  '), margin + 4, y + 3)
            y += 6

            // Seed tag status
            const tagStatus = rv.seedTagPhotoUploaded ? '[Photo] Seed Tag Verified' : '[!] Seed Tag Photo Required'
            setColor(rv.seedTagPhotoUploaded ? '#28a745' : '#dc3545', 'text')
            doc.text(tagStatus, margin + 4, y + 3)
            setColor(BRAND.black, 'text')
            y += 8
          }
        }

        // Permanent ESC
        if (block.finalCleanupData.permanentESC) {
          const esc = block.finalCleanupData.permanentESC
          const escItems = []
          if (esc.permanentSiltFencesInstalled) escItems.push(`Silt Fence: ${esc.permanentSiltFenceMeters || 0}m`)
          if (esc.finalWaterBarsInstalled) escItems.push(`Water Bars: ${esc.finalWaterBarsCount || 0}`)
          if (esc.erosionControlBlanketsInstalled) escItems.push(`Blankets: ${esc.erosionControlBlanketM2 || 0}m2`)
          if (esc.ripRapInstalled) escItems.push(`Rip Rap: ${esc.ripRapM3 || 0}m3`)
          if (esc.checkDamsInstalled) escItems.push(`Check Dams: ${esc.checkDamsCount || 0}`)

          if (escItems.length > 0) {
            checkPageBreak(15)
            setColor('#b3e5fc', 'fill')
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
            setColor('#0277bd', 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text('PERMANENT EROSION CONTROL (AS-BUILT)', margin + 4, y + 4)
            y += 8

            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(escItems.join('  |  '), margin + 4, y + 3)
            y += 8
          }
        }

        // Asset Restoration
        if (block.finalCleanupData.assetRestoration) {
          const ar = block.finalCleanupData.assetRestoration
          const arItems = []
          if (ar.permanentFencesReinstalled) arItems.push(`Fence: ${ar.fenceLinearMeters || 0}m (${ar.fenceType || 'N/A'})`)
          if (ar.gatesFunctional) arItems.push(`Gates: ${ar.gatesCount || 0}`)
          if (ar.pipelineMarkersInstalled) arItems.push(`Markers: ${ar.markersCount || 0}`)
          if (ar.cattleGuardsRestored) arItems.push('Cattle Guards: Restored')
          if (ar.accessRoadsRestored) arItems.push('Access Roads: Restored')

          if (arItems.length > 0) {
            checkPageBreak(15)
            setColor('#e1bee7', 'fill')
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
            setColor('#6a1b9a', 'text')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.text('ASSET RESTORATION', margin + 4, y + 4)
            y += 8

            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(arItems.join('  |  '), margin + 4, y + 3)
            y += 6

            // Landowner walkthrough
            if (ar.landownerWalkthroughCompleted) {
              doc.text(`Landowner Walkthrough: ${ar.landownerWalkthroughDate || 'Date N/A'} - ${ar.landownerName || 'Name N/A'}`, margin + 4, y + 3)
              y += 5
              if (ar.landownerConcerns) {
                doc.text(`Concerns: ${ar.landownerConcerns.substring(0, 80)}`, margin + 4, y + 3)
                y += 5
              }
            }
            y += 3
          }
        }

        // Final Status
        const statusItems = []
        if (block.finalCleanupData.preConstructionLandUse) statusItems.push(`Land Use: ${block.finalCleanupData.preConstructionLandUse}`)
        if (block.finalCleanupData.seedMixMatchesLandType) statusItems.push('Seed Mix Match: YES')
        if (block.finalCleanupData.finalInspectionComplete) statusItems.push('Final Inspection: COMPLETE')
        if (block.finalCleanupData.readyForLandownerRelease) statusItems.push('READY FOR RELEASE')

        if (statusItems.length > 0) {
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(statusItems.join('  |  '), margin + 4, y + 3)
          y += 6
        }

        // Photos
        const totalPhotos = (block.finalCleanupData.photos?.length || 0) + (block.finalCleanupData.seedTagPhotos?.length || 0)
        if (totalPhotos > 0) {
          doc.text(`[Photo] ${totalPhotos} photo(s) attached`, margin + 4, y + 3)
          y += 5
        }

        if (block.finalCleanupData.comments) {
          checkPageBreak(12)
          setColor(BRAND.grayLight, 'fill')
          doc.roundedRect(margin, y, contentWidth, 10, 1, 1, 'F')
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(6)
          doc.text('Comments: ' + String(block.finalCleanupData.comments).substring(0, 150), margin + 4, y + 6)
          y += 12
        }
        y += 3
      }

      // Welding - Tie-in Log
      if (block.activityType === 'Welding - Tie-in' && block.weldData?.tieIns?.length > 0) {
        checkPageBreak(40)
        addSubHeader('Tie-In Weld Data', '#fff3e0')

        // Summary row
        setColor('#fff3e0', 'fill')
        doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
        setColor(BRAND.navy, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(`Tie-Ins: ${block.weldData.tieIns.length}`, margin + 4, y + 5)
        if (block.weldData.pipeSize) doc.text(`Pipe: ${block.weldData.pipeSize}`, margin + 50, y + 5)
        y += 11

        // Table header
        setColor('#fd7e14', 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6)
        doc.text('WELD #', margin + 2, y + 3.5)
        doc.text('LOCATION', margin + 35, y + 3.5)
        doc.text('US JOINT', margin + 65, y + 3.5)
        doc.text('DS JOINT', margin + 95, y + 3.5)
        doc.text('WPS', margin + 125, y + 3.5)
        doc.text('STATUS', margin + 155, y + 3.5)
        y += 6

        // Table rows
        block.weldData.tieIns.forEach((tieIn, i) => {
          checkPageBreak(6)
          if (i % 2 === 0) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
          }
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(String(tieIn.weldNumber || tieIn.tieInNumber || '-').substring(0, 12), margin + 2, y + 2.5)
          doc.text(String(tieIn.location || tieIn.kp || '-').substring(0, 12), margin + 35, y + 2.5)
          doc.text(String(tieIn.usJointNumber || '-').substring(0, 12), margin + 65, y + 2.5)
          doc.text(String(tieIn.dsJointNumber || '-').substring(0, 12), margin + 95, y + 2.5)
          doc.text(String(tieIn.wpsId || '-').substring(0, 12), margin + 125, y + 2.5)
          doc.text(String(tieIn.status || 'In Progress').substring(0, 12), margin + 155, y + 2.5)
          y += 4.5
        })
        y += 3
      }

      // Conventional Bore (HD Bores) Log
      if (block.activityType === 'HD Bores' && block.conventionalBoreData) {
        checkPageBreak(50)
        addSubHeader('Conventional Bore Data', '#e3f2fd')

        // Basic Info
        const boreBasic = []
        if (block.conventionalBoreData.boreMethod) boreBasic.push(`Method: ${block.conventionalBoreData.boreMethod}`)
        if (block.conventionalBoreData.boreContractor) boreBasic.push(`Contractor: ${block.conventionalBoreData.boreContractor}`)
        if (block.conventionalBoreData.crossingType) boreBasic.push(`Crossing: ${block.conventionalBoreData.crossingType}`)
        if (block.conventionalBoreData.boreLengthM) boreBasic.push(`Length: ${block.conventionalBoreData.boreLengthM}m`)
        if (block.conventionalBoreData.casingSize) boreBasic.push(`Casing: ${block.conventionalBoreData.casingSize}`)

        if (boreBasic.length > 0) {
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(boreBasic.join('  |  '), margin + 4, y + 3)
          y += 8
        }

        // Progress
        const progressItems = []
        if (block.conventionalBoreData.progressTodayM) progressItems.push(`Today: ${block.conventionalBoreData.progressTodayM}m`)
        if (block.conventionalBoreData.progressToDateM) progressItems.push(`To Date: ${block.conventionalBoreData.progressToDateM}m`)
        if (block.conventionalBoreData.percentComplete) progressItems.push(`Complete: ${block.conventionalBoreData.percentComplete}%`)

        if (progressItems.length > 0) {
          setColor('#1976d2', 'fill')
          doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F')
          setColor(BRAND.white, 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text('PROGRESS: ' + progressItems.join('  |  '), margin + 4, y + 4)
          y += 8
        }

        if (block.conventionalBoreData.comments) {
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(6)
          doc.text('Comments: ' + String(block.conventionalBoreData.comments).substring(0, 100), margin + 4, y + 3)
          y += 6
        }
        y += 3
      }

      // Piling Log
      if (block.activityType === 'Piling' && block.pilingData) {
        checkPageBreak(50)
        addSubHeader('Piling Data', '#fce4ec')

        // Basic Info
        const pilingBasic = []
        if (block.pilingData.pilingContractor) pilingBasic.push(`Contractor: ${block.pilingData.pilingContractor}`)
        if (block.pilingData.pileDriverNumber) pilingBasic.push(`Driver #: ${block.pilingData.pileDriverNumber}`)
        if (block.pilingData.pileNo) pilingBasic.push(`Pile #: ${block.pilingData.pileNo}`)
        if (block.pilingData.pileTypeSize) pilingBasic.push(`Type/Size: ${block.pilingData.pileTypeSize}`)

        if (pilingBasic.length > 0) {
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(pilingBasic.join('  |  '), margin + 4, y + 3)
          y += 6
        }

        // Pile Details
        const pileDetails = []
        if (block.pilingData.finalLength) pileDetails.push(`Final Length: ${block.pilingData.finalLength}`)
        if (block.pilingData.noOfSplices) pileDetails.push(`Splices: ${block.pilingData.noOfSplices}`)
        if (block.pilingData.hammerType) pileDetails.push(`Hammer: ${block.pilingData.hammerType}`)
        if (block.pilingData.hammerWeightKg) pileDetails.push(`Weight: ${block.pilingData.hammerWeightKg}kg`)
        if (block.pilingData.dropDistanceM) pileDetails.push(`Drop: ${block.pilingData.dropDistanceM}m`)
        if (block.pilingData.refusalCriteria) pileDetails.push(`Refusal: ${block.pilingData.refusalCriteria}`)

        if (pileDetails.length > 0) {
          doc.text(pileDetails.join('  |  '), margin + 4, y + 3)
          y += 6
        }

        // Elevations
        const elevations = []
        if (block.pilingData.gradeElevation) elevations.push(`Grade: ${block.pilingData.gradeElevation}`)
        if (block.pilingData.cutOffElevation) elevations.push(`Cut-Off: ${block.pilingData.cutOffElevation}`)

        if (elevations.length > 0) {
          doc.text(elevations.join('  |  '), margin + 4, y + 3)
          y += 6
        }

        // Locations table
        if (block.pilingData.locations?.length > 0) {
          checkPageBreak(20)
          setColor('#e91e63', 'fill')
          doc.rect(margin, y, contentWidth, 5, 'F')
          setColor(BRAND.white, 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(6)
          doc.text('LOCATION', margin + 2, y + 3.5)
          doc.text('KP', margin + 60, y + 3.5)
          doc.text('NOTES', margin + 100, y + 3.5)
          y += 6

          block.pilingData.locations.forEach((loc, i) => {
            checkPageBreak(5)
            if (i % 2 === 0) {
              setColor(BRAND.grayLight, 'fill')
              doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
            }
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(String(loc.description || loc.location || '-').substring(0, 25), margin + 2, y + 2.5)
            doc.text(String(loc.kp || '-').substring(0, 15), margin + 60, y + 2.5)
            doc.text(String(loc.notes || '-').substring(0, 40), margin + 100, y + 2.5)
            y += 4.5
          })
        }

        if (block.pilingData.comments) {
          checkPageBreak(10)
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(6)
          doc.text('Comments: ' + String(block.pilingData.comments).substring(0, 100), margin + 4, y + 3)
          y += 6
        }
        y += 3
      }

      // Equipment Cleaning Log
      if (block.activityType === 'Equipment Cleaning' && block.cleaningLogData?.entries?.length > 0) {
        checkPageBreak(40)
        addSubHeader('Equipment Cleaning Log', '#c8e6c9')

        // Summary
        setColor('#c8e6c9', 'fill')
        doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
        setColor(BRAND.navy, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(`Equipment Cleaned: ${block.cleaningLogData.entries.length}`, margin + 4, y + 5)
        y += 11

        // Table header
        setColor('#28a745', 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6)
        doc.text('DATE', margin + 2, y + 3.5)
        doc.text('UNIT/ITEM', margin + 30, y + 3.5)
        doc.text('LEVEL', margin + 80, y + 3.5)
        doc.text('PHOTOS', margin + 110, y + 3.5)
        doc.text('LSD', margin + 135, y + 3.5)
        doc.text('DIRECTION', margin + 165, y + 3.5)
        y += 6

        // Table rows
        block.cleaningLogData.entries.forEach((entry, i) => {
          checkPageBreak(5)
          if (i % 2 === 0) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
          }
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(String(entry.date || '-').substring(0, 10), margin + 2, y + 2.5)
          doc.text(String(entry.unitItem || '-').substring(0, 20), margin + 30, y + 2.5)
          doc.text(String(entry.cleaningLevel || '-').substring(0, 10), margin + 80, y + 2.5)
          doc.text(String(entry.photosTaken || '-').substring(0, 8), margin + 110, y + 2.5)
          doc.text(String(entry.lsd || '-').substring(0, 12), margin + 135, y + 2.5)
          doc.text(String(entry.directionOfTravel || '-').substring(0, 15), margin + 165, y + 2.5)
          y += 4.5
        })
        y += 3
      }

      // Hydrovac Log
      if (block.activityType === 'Hydrovac' && block.hydrovacData) {
        checkPageBreak(50)
        addSubHeader('Hydrovac Data', '#e1f5fe')

        // Contractor / Foreman
        if (block.hydrovacData.contractor || block.hydrovacData.foreman) {
          setColor('#03a9f4', 'fill')
          doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
          setColor(BRAND.white, 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          const hvInfo = []
          if (block.hydrovacData.contractor) hvInfo.push(`Contractor: ${block.hydrovacData.contractor}`)
          if (block.hydrovacData.foreman) hvInfo.push(`Foreman: ${block.hydrovacData.foreman}`)
          doc.text(hvInfo.join('  |  '), margin + 4, y + 5)
          y += 11
        }

        // Facilities table
        if (block.hydrovacData.facilities?.length > 0) {
          setColor('#0288d1', 'fill')
          doc.rect(margin, y, contentWidth, 5, 'F')
          setColor(BRAND.white, 'text')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(6)
          doc.text('STATION', margin + 2, y + 3.5)
          doc.text('OWNER', margin + 28, y + 3.5)
          doc.text('P/X', margin + 55, y + 3.5)
          doc.text('TYPE', margin + 68, y + 3.5)
          doc.text('DEPTH', margin + 92, y + 3.5)
          doc.text('BNDRY', margin + 112, y + 3.5)
          doc.text('GPS', margin + 130, y + 3.5)
          doc.text('COMMENTS', margin + 158, y + 3.5)
          y += 6

          block.hydrovacData.facilities.forEach((fac, i) => {
            checkPageBreak(5)
            if (i % 2 === 0) {
              setColor(BRAND.grayLight, 'fill')
              doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
            }
            setColor(BRAND.black, 'text')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6)
            doc.text(String(fac.station || '-').substring(0, 12), margin + 2, y + 2.5)
            doc.text(String(fac.owner || '-').substring(0, 12), margin + 28, y + 2.5)
            doc.text(String(fac.px || '-').substring(0, 3), margin + 55, y + 2.5)
            doc.text(String(fac.facilityType || '-').substring(0, 10), margin + 68, y + 2.5)
            doc.text(String(fac.depthM || '-').substring(0, 6), margin + 92, y + 2.5)
            doc.text(String(fac.boundary || '-').substring(0, 3), margin + 112, y + 2.5)
            doc.text(String(fac.gpsCoordinates || '-').substring(0, 14), margin + 130, y + 2.5)
            doc.text(String(fac.comments || '-').substring(0, 12), margin + 158, y + 2.5)
            y += 4.5
          })
        }
        y += 3
      }

      // Welder Testing Log
      if (block.activityType === 'Welder Testing' && block.welderTestingData?.welderTests?.length > 0) {
        checkPageBreak(40)
        addSubHeader('Welder Testing Log', '#fff8e1')

        // Summary
        setColor('#fff8e1', 'fill')
        doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F')
        setColor(BRAND.navy, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        const passCount = block.welderTestingData.welderTests.filter(t => t.passFail === 'Pass').length
        const failCount = block.welderTestingData.welderTests.filter(t => t.passFail === 'Fail').length
        doc.text(`Welder Tests: ${block.welderTestingData.welderTests.length} (Pass: ${passCount}, Fail: ${failCount})`, margin + 4, y + 5)
        y += 11

        // Table header
        setColor('#ffc107', 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6)
        doc.text('WELDER', margin + 2, y + 3.5)
        doc.text('PROJECT ID', margin + 40, y + 3.5)
        doc.text('DATE', margin + 75, y + 3.5)
        doc.text('MATERIAL', margin + 100, y + 3.5)
        doc.text('RESULT', margin + 130, y + 3.5)
        doc.text('PROCEDURE', margin + 155, y + 3.5)
        y += 6

        // Table rows
        block.welderTestingData.welderTests.forEach((test, i) => {
          checkPageBreak(5)
          if (i % 2 === 0) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 4.5, 'F')
          }
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6)
          doc.text(String(test.welderName || '-').substring(0, 15), margin + 2, y + 2.5)
          doc.text(String(test.welderProjectId || '-').substring(0, 12), margin + 40, y + 2.5)
          doc.text(String(test.testDate || '-').substring(0, 10), margin + 75, y + 2.5)
          doc.text(String(test.testMaterial || '-').substring(0, 12), margin + 100, y + 2.5)
          // Color code pass/fail
          if (test.passFail === 'Pass') setColor(BRAND.green, 'text')
          else if (test.passFail === 'Fail') setColor(BRAND.red, 'text')
          doc.text(String(test.passFail || '-').substring(0, 8), margin + 130, y + 2.5)
          setColor(BRAND.black, 'text')
          doc.text(String(test.weldProcedure || '-').substring(0, 15), margin + 155, y + 2.5)
          y += 4.5
        })
        y += 3
      }

      // Hydrostatic Testing Log
      if (block.activityType === 'Hydrostatic Testing' && block.hydrotestData) {
        const ht = block.hydrotestData
        checkPageBreak(35)
        addSubHeader('Hydrostatic Testing', '#e8eaf6')

        setColor(BRAND.grayLight, 'fill')
        doc.roundedRect(margin + 2, y, contentWidth - 4, 22, 2, 2, 'F')
        y += 5
        addField('Test Section', ht.testSection || 'N/A', leftCol, 30)
        addField('Test Pressure', ht.testPressure ? `${ht.testPressure} kPa` : 'N/A', rightCol, 35)
        y += 6
        addField('Hold Time', ht.holdTime ? `${ht.holdTime} hrs` : 'N/A', leftCol, 30)
        addField('Water Source', ht.waterSource || 'N/A', rightCol, 35)
        y += 6
        const resultColor = ht.testResult === 'Pass' ? BRAND.green : ht.testResult === 'Fail' ? BRAND.red : BRAND.black
        setColor(BRAND.gray, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.text('Result:', leftCol, y)
        setColor(resultColor, 'text')
        doc.setFont('helvetica', 'normal')
        doc.text(ht.testResult || 'Pending', leftCol + 18, y)
        if (ht.pressureDropPSI) {
          setColor(BRAND.gray, 'text')
          doc.setFont('helvetica', 'bold')
          doc.text('Pressure Drop:', rightCol, y)
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.text(`${ht.pressureDropPSI} PSI`, rightCol + 35, y)
        }
        y += 10
      }

      // Quality Checks
      if (block.qualityData && Object.keys(block.qualityData).length > 0) {
        const qualityEntries = Object.entries(block.qualityData).filter(([key, val]) => val && val !== '' && val !== 'N/A')
        if (qualityEntries.length > 0) {
          checkPageBreak(25)
          addSubHeader('Quality Checks', BRAND.orangeLight)
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          
          // Display quality checks in two columns
          let col = 0
          let rowY = y
          qualityEntries.forEach(([key, val], idx) => {
            checkPageBreak(5)
            const displayKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
            const xPos = col === 0 ? margin + 2 : margin + contentWidth / 2
            doc.setFont('helvetica', 'bold')
            doc.text(`${displayKey}:`, xPos, rowY)
            doc.setFont('helvetica', 'normal')
            doc.text(String(val).substring(0, 25), xPos + 35, rowY)
            
            if (col === 1) {
              rowY += 4
              col = 0
            } else {
              col = 1
            }
          })
          y = rowY + 4
        }
      }

      // Time Lost
      if (block.timeLostReason && block.timeLostHours) {
        checkPageBreak(18)
        addSubHeader('Time Lost', BRAND.redLight)
        setColor(BRAND.red, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(`${block.timeLostReason} - ${block.timeLostHours} hours`, margin + 2, y)
        y += 4
        if (block.timeLostDetails) {
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          const detailLines = doc.splitTextToSize(block.timeLostDetails, contentWidth - 6)
          detailLines.forEach(line => {
            checkPageBreak(5)
            doc.text(line, margin + 2, y)
            y += 4
          })
          y += 1
        }
      }
      // ─── WORK PHOTOS ───
      if (block.workPhotos && block.workPhotos.length > 0) {
        checkPageBreak(30)
        addSubHeader('Work Photos', BRAND.yellowLight)

        for (let pi = 0; pi < block.workPhotos.length; pi++) {
          const photo = block.workPhotos[pi]
          checkPageBreak(28)

          // Resolve image to base64 for jsPDF
          let imgData = null
          try {
            if (photo.savedUrl) {
              imgData = await fetchImageAsBase64(photo.savedUrl)
            } else if (photo.file instanceof File) {
              const raw = await imageToBase64(photo.file)
              imgData = `data:image/jpeg;base64,${raw}`
            }
          } catch (e) {
            console.warn('[PDF] Skipping photo', pi, e)
          }

          if (imgData) {
            try {
              doc.addImage(imgData, 'JPEG', margin + 2, y, 30, 22)
            } catch (e) {
              console.warn('[PDF] addImage failed for photo', pi, e)
              imgData = null
            }
          }

          // Metadata text beside thumbnail
          const textX = imgData ? margin + 35 : margin + 2
          setColor(BRAND.gray, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          if (photo.location) {
            doc.text(`Location: KP ${photo.location}`, textX, y + 6)
          }
          if (photo.description) {
            const descLines = doc.splitTextToSize(photo.description, contentWidth - (textX - margin) - 4)
            descLines.forEach((line, li) => {
              if (li < 3) doc.text(line, textX, y + 11 + (li * 4))
            })
          }
          if (!imgData) {
            setColor(BRAND.grayMid, 'text')
            doc.setFontSize(7)
            doc.text('[Photo unavailable]', margin + 2, y + 6)
          }

          y += 25
        }
      }

      y += 5
    }

    // ═══════════════════════════════════════════════════════════
    // NOTES
    // ═══════════════════════════════════════════════════════════
    if (safetyNotes || landEnvironment || generalComments) {
      checkPageBreak(45)
      addSectionHeader('NOTES & OBSERVATIONS', BRAND.orange)
      
      if (safetyNotes) {
        checkPageBreak(20)
        addSubHeader('Safety Notes')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const lines = doc.splitTextToSize(safetyNotes, contentWidth - 6)
        lines.forEach(line => {
          checkPageBreak(5)
          doc.text(line, margin + 2, y)
          y += 4
        })
        y += 3
      }

      if (landEnvironment) {
        checkPageBreak(20)
        addSubHeader('Land & Environment')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const lines = doc.splitTextToSize(landEnvironment, contentWidth - 6)
        lines.forEach(line => {
          checkPageBreak(5)
          doc.text(line, margin + 2, y)
          y += 4
        })
        y += 3
      }

      if (generalComments) {
        checkPageBreak(20)
        addSubHeader('General Comments')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const lines = doc.splitTextToSize(generalComments, contentWidth - 6)
        lines.forEach(line => {
          checkPageBreak(5)
          doc.text(line, margin + 2, y)
          y += 4
        })
        y += 3
      }
    }

    // ═══════════════════════════════════════════════════════════
    // VISITORS
    // ═══════════════════════════════════════════════════════════
    if (visitors?.length > 0) {
      checkPageBreak(25)
      addSectionHeader('SITE VISITORS', BRAND.gray)
      setColor(BRAND.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      visitors.forEach(v => {
        checkPageBreak(6)
        doc.text(`• ${v.name || 'N/A'} - ${v.company || 'N/A'} (${v.position || 'N/A'})`, margin + 2, y)
        y += 5
      })
      y += 2
    }

    // ═══════════════════════════════════════════════════════════
    // SAFETY RECOGNITION
    // ═══════════════════════════════════════════════════════════
    if (safetyRecognitionData?.cards && safetyRecognitionData.cards.length > 0) {
      checkPageBreak(25)
      addSectionHeader('SAFETY RECOGNITION', BRAND.green)
      setColor(BRAND.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      safetyRecognitionData.cards.forEach((card, idx) => {
        checkPageBreak(35)
        doc.setFont('helvetica', 'bold')
        const cardTitle = card.cardType === 'safe' ? 'HAZARD ID CARD' : 'POSITIVE RECOGNITION'
        doc.text(`${idx + 1}. ${cardTitle}`, margin + 2, y)
        y += 4
        doc.setFont('helvetica', 'normal')
        
        // Observer and observee info
        doc.text(`Observer: ${card.observerName || 'Unknown'} | Date: ${card.observerDate || 'N/A'}`, margin + 5, y)
        y += 4
        doc.text(`Person Observed: ${card.observeeName || 'N/A'} | Company: ${card.companyType || 'N/A'}`, margin + 5, y)
        y += 4
        doc.text(`Location: ${card.location || 'N/A'}`, margin + 5, y)
        y += 4
        
        // Situation description
        if (card.situationDescription) {
          const lines = doc.splitTextToSize(`Situation: ${card.situationDescription}`, contentWidth - 10)
          lines.forEach(line => {
            checkPageBreak(5)
            doc.text(line, margin + 5, y)
            y += 4
          })
        }

        // What could have happened (for hazard cards)
        if (card.cardType === 'safe' && card.whatCouldHaveHappened) {
          const lines = doc.splitTextToSize(`Potential Outcome: ${card.whatCouldHaveHappened}`, contentWidth - 10)
          lines.forEach(line => {
            checkPageBreak(5)
            doc.text(line, margin + 5, y)
            y += 4
          })
        }

        // Actions
        if (card.actions?.length > 0) {
          checkPageBreak(5)
          doc.text(`Actions (${card.actions.length}):`, margin + 5, y)
          y += 4
          card.actions.forEach((action, aIdx) => {
            if (action.action) {
              checkPageBreak(5)
              doc.text(`  • ${action.action} (By: ${action.byWhom || 'TBD'}, Due: ${action.dueDate || 'TBD'})`, margin + 8, y)
              y += 4
            }
          })
        }

        // Comments
        if (card.comments) {
          const lines = doc.splitTextToSize(`Comments: ${card.comments}`, contentWidth - 10)
          lines.forEach(line => {
            checkPageBreak(5)
            doc.text(line, margin + 5, y)
            y += 4
          })
        }
        
        y += 4
      })
      y += 2
    }

    // ═══════════════════════════════════════════════════════════
    // WILDLIFE SIGHTINGS
    // ═══════════════════════════════════════════════════════════
    if (wildlifeSightingData?.sightings && wildlifeSightingData.sightings.length > 0) {
      checkPageBreak(25)
      addSectionHeader('WILDLIFE SIGHTINGS', BRAND.orange)
      setColor(BRAND.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      wildlifeSightingData.sightings.forEach((sighting, idx) => {
        checkPageBreak(25)
        doc.setFont('helvetica', 'bold')
        const speciesText = Array.isArray(sighting.species) && sighting.species.length > 0 
          ? sighting.species.join(', ') 
          : sighting.otherSpecies || 'Unknown Species'
        doc.text(`${idx + 1}. ${speciesText} (Count: ${sighting.numberOfAnimals || 1})`, margin + 2, y)
        y += 4
        doc.setFont('helvetica', 'normal')
        
        // Location and time
        doc.text(`Location: ${sighting.location || 'N/A'} | Time: ${sighting.time || 'N/A'}`, margin + 5, y)
        y += 4
        
        // GPS if provided
        if (sighting.gpsCoordinates) {
          doc.text(`GPS: ${sighting.gpsCoordinates}`, margin + 5, y)
          y += 4
        }
        
        // Gender and age
        if (sighting.gender || sighting.ageGroup) {
          doc.text(`Gender: ${sighting.gender || 'N/A'} | Age: ${sighting.ageGroup || 'N/A'}`, margin + 5, y)
          y += 4
        }
        
        // Activity
        if (sighting.activity) {
          const lines = doc.splitTextToSize(`Activity: ${sighting.activity}`, contentWidth - 10)
          lines.forEach(line => {
            checkPageBreak(5)
            doc.text(line, margin + 5, y)
            y += 4
          })
        }

        // Mortality
        if (sighting.mortality === 'yes') {
          checkPageBreak(5)
          doc.setTextColor(220, 53, 69) // Red
          doc.text(`[!] MORTALITY: ${sighting.mortalityCause || 'Cause unknown'}`, margin + 5, y)
          doc.setTextColor(0, 0, 0)
          y += 4
        }

        // Comments
        if (sighting.comments) {
          const lines = doc.splitTextToSize(`Notes: ${sighting.comments}`, contentWidth - 10)
          lines.forEach(line => {
            checkPageBreak(5)
            doc.text(line, margin + 5, y)
            y += 4
          })
        }
        
        // Photo count
        if (sighting.photos?.length > 0) {
          doc.text(`[Photo] ${sighting.photos.length} photo(s) attached`, margin + 5, y)
          y += 4
        }
        
        y += 2
      })
      y += 2
    }

    // ═══════════════════════════════════════════════════════════
    // TRACKABLE ITEMS
    // ═══════════════════════════════════════════════════════════
    if (pdfTrackableItems && pdfTrackableItems.length > 0) {
      checkPageBreak(30)
      addSectionHeader('TRACKABLE ITEMS', [111, 66, 193]) // Purple

      // Group items by type
      const groupedItems = pdfTrackableItems.reduce((acc, item) => {
        const type = item.item_type || 'other'
        if (!acc[type]) acc[type] = []
        acc[type].push(item)
        return acc
      }, {})
      
      // Type labels (no emojis for PDF compatibility)
      const typeLabels = {
        mats: 'Mats',
        fencing: 'Temporary Fencing',
        ramps: 'Ramps',
        goalposts: 'Goal Posts',
        access: 'Access Roads',
        hydrovac: 'Hydrovac Holes',
        erosion: 'Erosion Control',
        signage: 'Signage',
        equipment_cleaning: 'Equipment Cleaning',
        rock_trench: 'Rock Trench',
        extra_depth: 'Extra Depth Ditch',
        bedding_padding: 'Bedding & Padding',
        weld_upi: 'Weld UPI Items'
      }
      
      Object.entries(groupedItems).forEach(([type, items]) => {
        checkPageBreak(20)
        // Sub-header for item type
        setColor(BRAND.grayLight, 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor([111, 66, 193], 'text') // Purple
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(`${typeLabels[type] || type.toUpperCase()} (${items.length})`, margin + 2, y + 3.5)
        y += 7
        
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        
        items.forEach((item, idx) => {
          checkPageBreak(15)
          
          // Build item description based on type
          let description = ''
          
          if (type === 'mats') {
            description = `${item.action || ''} ${item.quantity || ''} x ${item.mat_type || ''} (${item.mat_size || ''}) at KP ${item.kp_location || ''}`
          } else if (type === 'fencing') {
            description = `${item.action || ''} ${item.length || ''}m ${item.fence_type || ''} at KP ${item.kp_location || ''}`
          } else if (type === 'ramps') {
            description = `${item.action || ''} ${item.quantity || ''} x ${item.ramp_type || ''} (${item.ramp_material || ''}) at KP ${item.kp_location || ''}${item.foreign_owner ? ' - ' + item.foreign_owner : ''}${item.crossing_id ? ' [' + item.crossing_id + ']' : ''}`
          } else if (type === 'goalposts') {
            description = `${item.action || ''} ${item.quantity || ''} set(s) at KP ${item.kp_location || ''} - ${item.utility_owner || ''}${item.post_material ? ', ' + item.post_material : ''}${item.posted_height ? ', Height: ' + item.posted_height + 'm' : ''}${item.material_compliant ? ' [' + item.material_compliant + ']' : ''}${item.offset_compliant ? ' [Offset: ' + item.offset_compliant + ']' : ''}`
          } else if (type === 'equipment_cleaning') {
            description = `${item.action || ''}: ${item.equipment_type || ''} (${item.equipment_id || ''}) - ${item.inspection_pass || item.inspection_status || ''}`
          } else if (type === 'hydrovac') {
            description = `${item.action || ''} ${item.quantity || ''} x ${item.hole_type || ''} at KP ${item.kp_location || ''}`
          } else if (type === 'erosion') {
            description = `${item.action || ''} ${item.quantity || ''} ${item.unit || ''} ${item.control_type || ''} at KP ${item.kp_location || ''}`
          } else if (type === 'rock_trench') {
            description = `${item.length || ''}m ${item.rock_type || ''} at KP ${item.kp_location || ''}, Depth: ${item.depth_achieved || ''}m${item.spec_depth ? ' (Spec: ' + item.spec_depth + 'm)' : ''}${item.equipment ? ', ' + item.equipment : ''}`
          } else if (type === 'extra_depth') {
            description = `${item.length || ''}m extra depth at KP ${item.kp_location || ''}, Total: ${item.total_depth || ''}m${item.reason ? ', Reason: ' + item.reason : ''}${item.approved_by ? ', Approved: ' + item.approved_by : ''}`
          } else if (type === 'bedding_padding') {
            description = `${item.action || ''} ${item.protection_type || 'Bedding/Padding'}: ${item.material || ''} (${item.depth || ''}mm) at KP ${item.kp_location || ''}, ${item.length || ''}m`
          } else if (type === 'weld_upi') {
            description = `${item.upi_type || ''} - Weld ${item.weld_number || 'N/A'}, Qty: ${item.quantity || ''} at KP ${item.kp_location || ''} | Reason: ${item.reason || 'N/A'} | Status: ${item.status || 'N/A'}`
          } else if (type === 'signage') {
            description = `${item.action || ''} ${item.quantity || ''} x ${item.sign_type || 'Sign'} at KP ${item.kp_location || ''}`
          } else if (type === 'access') {
            description = `${item.action || ''} ${item.access_type || 'Access Road'} at KP ${item.kp_location || ''}, ${item.surface || ''} ${item.width ? item.width + 'm wide' : ''}${item.length ? ', ' + item.length + 'm long' : ''}`
          } else {
            description = `${item.action || ''} at KP ${item.kp_location || ''}`
          }
          
          const lines = doc.splitTextToSize(`${idx + 1}. ${description}`, contentWidth - 4)
          lines.forEach(line => {
            checkPageBreak(4)
            doc.text(line, margin + 2, y)
            y += 3.5
          })

          // Notes if present
          if (item.notes) {
            setColor(BRAND.gray, 'text')
            const noteLines = doc.splitTextToSize(`   Notes: ${item.notes}`, contentWidth - 8)
            noteLines.forEach(line => {
              checkPageBreak(4)
              doc.text(line, margin + 4, y)
              y += 3.5
            })
            setColor(BRAND.black, 'text')
          }
        })
        y += 3
      })
      y += 2
      console.log('[PDF] Rendered', pdfTrackableItems.length, 'trackable items in PDF')
    } else {
      console.log('[PDF] No trackable items to render (in-memory:', trackableItemsData?.length || 0, ', reportId:', currentReportId, ')')
    }

    // ═══════════════════════════════════════════════════════════
    // UNIT PRICE ITEMS
    // ═══════════════════════════════════════════════════════════
    if (unitPriceItemsEnabled && unitPriceData?.items?.length > 0) {
      checkPageBreak(30)
      addSectionHeader('UNIT PRICE ITEMS', [111, 66, 193]) // Purple

      // Table header
      const upiColWidths = [8, 35, 45, 15, 15, 22, contentWidth - 140]
      const upiHeaders = ['#', 'Category', 'Item', 'Qty', 'Unit', 'KP', 'Notes']

      setColor([240, 235, 248], 'fill')
      doc.rect(margin, y, contentWidth, 5, 'F')
      setColor([111, 66, 193], 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6)
      let upiX = margin + 2
      upiHeaders.forEach((h, i) => {
        doc.text(h, upiX, y + 3.5)
        upiX += upiColWidths[i]
      })
      y += 7

      setColor(BRAND.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)

      unitPriceData.items.forEach((item, idx) => {
        checkPageBreak(6)

        if (idx % 2 === 0) {
          setColor(BRAND.grayLight, 'fill')
          doc.rect(margin, y - 2, contentWidth, 5, 'F')
        }

        setColor(BRAND.black, 'text')
        upiX = margin + 2
        const itemName = item.category === 'Custom' ? (item.customItem || 'Custom') : (item.itemName || 'N/A')
        const rowData = [
          String(idx + 1),
          (item.category || 'N/A').substring(0, 20),
          itemName.substring(0, 28),
          String(item.quantity || ''),
          item.unit || '',
          item.locationKP || '',
          (item.notes || '').substring(0, 35)
        ]
        rowData.forEach((val, i) => {
          doc.text(val, upiX, y + 1)
          upiX += upiColWidths[i]
        })
        y += 5
      })

      // Comments
      if (unitPriceData.comments) {
        y += 2
        setColor(BRAND.gray, 'text')
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7)
        const commentLines = doc.splitTextToSize(`Comments: ${unitPriceData.comments}`, contentWidth - 6)
        commentLines.forEach(line => {
          checkPageBreak(5)
          doc.text(line, margin + 2, y)
          y += 3.5
        })
        setColor(BRAND.black, 'text')
      }

      // Summary
      y += 2
      setColor([111, 66, 193], 'text')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.text(`Total: ${unitPriceData.items.length} unit price item(s) recorded`, margin + 2, y)
      setColor(BRAND.black, 'text')
      y += 8
    }

    // ═══════════════════════════════════════════════════════════
    // INSPECTOR INFO
    // ═══════════════════════════════════════════════════════════
    checkPageBreak(35)  // Ensure enough space for section + footer
    addSectionHeader('INSPECTOR INFORMATION', BRAND.navy)
    
    setColor(BRAND.grayLight, 'fill')
    doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F')
    y += 5
    addField('Mileage', `${inspectorMileage || '0'} km`, leftCol, 25)
    addField('Equipment Used', (inspectorEquipment || []).join(', ') || 'None', rightCol, 40)
    y += 12

    // ═══════════════════════════════════════════════════════════
    // DIGITAL CERTIFICATION / LEGAL COMPLIANCE SECTION
    // ═══════════════════════════════════════════════════════════
    checkPageBreak(40)
    y += 5
    setColor([120, 80, 160], 'fill') // Purple for certification
    doc.roundedRect(margin, y, contentWidth, 7, 1, 1, 'F')
    setColor(BRAND.white, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('DOCUMENT CERTIFICATION', margin + 4, y + 5)
    y += 10

    // Certification box
    setColor([248, 245, 252], 'fill')
    doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'F')
    setColor([180, 160, 200], 'draw')
    doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'S')

    y += 5
    setColor(BRAND.gray, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('This document was electronically generated and is subject to audit verification.', margin + 3, y)
    y += 4
    doc.text(`Document ID: ${documentId}`, margin + 3, y)
    doc.text(`Report ID: ${currentReportId || 'DRAFT'}`, margin + 80, y)
    y += 4
    doc.text(`Generated: ${generationTimestampLocal} MST`, margin + 3, y)
    doc.text(`ISO 8601: ${generationTimestamp}`, margin + 80, y)
    y += 4
    doc.text(`Project: ${PROJECT_SHORT}`, margin + 3, y)
    doc.text(`Inspector: ${inspectorName || 'Unknown'}`, margin + 80, y)
    y += 4
    doc.setFontSize(6)
    setColor([100, 100, 100], 'text')
    doc.text('Integrity verification hash will be stored in system audit trail upon report submission.', margin + 3, y)
    y += 8

    // ═══════════════════════════════════════════════════════════
    // FOOTERS
    // ═══════════════════════════════════════════════════════════
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      addFooter(i, pageCount)
    }

    // SAVE - filename with ID, date, and activity type
    const reportId = currentReportId ? `_ID${currentReportId}` : ''
    const activityTypes = activityBlocks
      .filter(b => b.activityType)
      .map(b => b.activityType.replace(/[^a-zA-Z0-9]/g, '_'))
      .slice(0, 3) // Limit to first 3 activity types
      .join('_')
    const activityPart = activityTypes ? `_${activityTypes}` : ''
    const filename = `${PROJECT_SHORT}_Report${reportId}_${selectedDate}${activityPart}.pdf`

    // Generate PDF blob for hash and storage
    const pdfBlob = doc.output('blob')

    // Generate SHA-256 hash for document integrity verification
    let pdfHash = null
    try {
      const arrayBuffer = await pdfBlob.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      pdfHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    } catch (hashError) {
      console.error('PDF hash generation error:', hashError)
    }

    // Upload PDF to Supabase storage if report has been saved
    let pdfStorageUrl = null
    if (currentReportId) {
      try {
        const storagePath = `reports/${selectedDate}/${filename}`
        const { error: uploadError } = await supabase.storage
          .from('report-pdfs')
          .upload(storagePath, pdfBlob, {
            contentType: 'application/pdf',
            upsert: true // Allow overwrite if regenerated
          })

        if (uploadError) {
          console.error('PDF storage upload error:', uploadError)
        } else {
          // Get public URL
          const { data: urlData } = supabase.storage
            .from('report-pdfs')
            .getPublicUrl(storagePath)
          pdfStorageUrl = urlData?.publicUrl

          // Update report record with PDF info
          await supabase
            .from('daily_reports')
            .update({
              pdf_hash: pdfHash,
              pdf_storage_url: pdfStorageUrl,
              pdf_document_id: documentId,
              pdf_generated_at: generationTimestamp
            })
            .eq('id', currentReportId)
        }
      } catch (storageError) {
        console.error('PDF storage error:', storageError)
      }
    }

    // Log PDF generation to audit trail
    try {
      await supabase.from('report_audit_log').insert({
        report_id: currentReportId,
        entity_type: 'pdf_generation',
        entity_id: documentId,
        section: 'PDF Export',
        field_name: 'pdf_generated',
        old_value: null,
        new_value: filename,
        action_type: 'pdf_export',
        change_type: 'create',
        regulatory_category: 'document_control',
        is_critical: true,
        metadata: {
          document_id: documentId,
          sha256_hash: pdfHash,
          storage_url: pdfStorageUrl,
          timestamp_iso: generationTimestamp,
          timestamp_local: generationTimestampLocal,
          file_size_bytes: pdfBlob.size,
          page_count: pageCount,
          inspector: inspectorName,
          project: PROJECT_SHORT,
          spread: spread,
          date: selectedDate
        },
        changed_at: generationTimestamp,
        organization_id: getOrgId()
      })
    } catch (auditError) {
      console.error('PDF audit log error:', auditError)
    }

    // Save locally for user
    doc.save(filename)

    // Show confirmation with hash for user reference
    if (pdfHash) {
      console.log(`PDF Generated - Document ID: ${documentId}, SHA-256: ${pdfHash.substring(0, 16)}...`)
    }
  }

  // Export Master Production Spreadsheet (CLX2 Format)
  async function exportMasterProduction() {
    // Fetch all reports from database
    const { data: reports, error } = await supabase
      .from('daily_reports')
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

    // Helper to parse KP string to metres
    const parseKP = (kpStr) => {
      if (!kpStr) return null
      const str = String(kpStr).trim()
      // Handle format like "5+250" (5km + 250m = 5250m)
      if (str.includes('+')) {
        const [km, m] = str.split('+')
        return (parseFloat(km) || 0) * 1000 + (parseFloat(m) || 0)
      }
      // Handle plain number (assume metres or km based on size)
      const num = parseFloat(str)
      if (isNaN(num)) return null
      return num < 100 ? num * 1000 : num // If < 100, assume km
    }

    // Format metres back to KP string
    const formatKP = (metres) => {
      if (metres === null || metres === undefined) return ''
      const km = Math.floor(metres / 1000)
      const m = Math.round(metres % 1000)
      return `${km}+${m.toString().padStart(3, '0')}`
    }

    // Activity types in order for columns
    const phases = [
      'Clearing', 'Access', 'Topsoil', 'Grading', 'Stringing', 'Bending',
      'Welding - Mainline',
  'Welding - Section Crew',
  'Welding - Poor Boy', 'Welding - Tie-in', 'Coating', 'Lowering-in',
      'Backfill', 'Hydro Test', 'Tie-in Backfill', 'Tie-in Coating', 'Cleanup - Machine', 'Cleanup - Final',
      'HDD', 'HD Bores', 'Frost Packing', 'Pipe Yard', 'Other'
    ]

    // Build header row
    const headers = ['Date', 'Spread', 'Inspector']
    phases.forEach(phase => {
      headers.push(`${phase} From`, `${phase} To`, `${phase} M`)
    })
    headers.push('Total Metres', 'Labour Hours', 'Equipment Hours', 'Time Lost')

    // Process reports into rows
    const dataRows = []
    let grandTotalMetres = 0
    let grandTotalLabour = 0
    let grandTotalEquipment = 0
    let grandTotalTimeLost = 0

    // Phase totals for summary
    const phaseTotals = {}
    phases.forEach(p => { phaseTotals[p] = { metres: 0, minKP: null, maxKP: null } })

    reports.forEach(report => {
      const row = [
        report.date || '',
        report.spread || '',
        report.inspector_name || ''
      ]

      let dayTotalMetres = 0
      let dayLabourHours = 0
      let dayEquipmentHours = 0
      let dayTimeLost = 0

      // Get activity blocks (handle both new and old format)
      const blocks = report.activity_blocks || []

      // Build a map of activity data for this report
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

        // Update phase totals
        if (phaseTotals[actType]) {
          phaseTotals[actType].metres += metres
          if (startM !== null) {
            if (phaseTotals[actType].minKP === null || startM < phaseTotals[actType].minKP) {
              phaseTotals[actType].minKP = startM
            }
          }
          if (endM !== null) {
            if (phaseTotals[actType].maxKP === null || endM > phaseTotals[actType].maxKP) {
              phaseTotals[actType].maxKP = endM
            }
          }
        }

        // Calculate labour hours
        if (block.labourEntries) {
          block.labourEntries.forEach(entry => {
            dayLabourHours += (entry.hours || 0) * (entry.count || 1)
          })
        }

        // Calculate equipment hours
        if (block.equipmentEntries) {
          block.equipmentEntries.forEach(entry => {
            dayEquipmentHours += (entry.hours || 0) * (entry.count || 1)
          })
        }

        // Time lost
        dayTimeLost += parseFloat(block.timeLostHours) || 0
      })

      // Add columns for each phase
      phases.forEach(phase => {
        const data = activityMap[phase]
        if (data) {
          row.push(data.startKP || '', data.endKP || '', data.metres || 0)
          dayTotalMetres += data.metres || 0
        } else {
          row.push('', '', '')
        }
      })

      // Add totals columns
      row.push(dayTotalMetres, dayLabourHours.toFixed(1), dayEquipmentHours.toFixed(1), dayTimeLost.toFixed(1))

      grandTotalMetres += dayTotalMetres
      grandTotalLabour += dayLabourHours
      grandTotalEquipment += dayEquipmentHours
      grandTotalTimeLost += dayTimeLost

      dataRows.push(row)
    })

    // Build worksheet data
    const wsData = []
    
    // Title section
    wsData.push([`${PROJECT_NAME} – MASTER PRODUCTION SPREADSHEET`])
    wsData.push([`Generated: ${new Date().toLocaleString()}`])
    wsData.push([`Pipeline: ${pipeline || 'All'}`])
    wsData.push([`Total Reports: ${reports.length}`])
    wsData.push([''])

    // Summary section
    wsData.push(['=== PRODUCTION SUMMARY ==='])
    wsData.push(['Phase', 'From KP', 'To KP', 'Total Metres'])
    phases.forEach(phase => {
      const data = phaseTotals[phase]
      if (data.metres > 0) {
        wsData.push([
          phase,
          formatKP(data.minKP),
          formatKP(data.maxKP),
          data.metres
        ])
      }
    })
    wsData.push(['GRAND TOTAL', '', '', grandTotalMetres])
    wsData.push([''])
    wsData.push(['Total Labour Hours:', grandTotalLabour.toFixed(1)])
    wsData.push(['Total Equipment Hours:', grandTotalEquipment.toFixed(1)])
    wsData.push(['Total Time Lost:', grandTotalTimeLost.toFixed(1)])
    wsData.push([''])

    // Daily detail section
    wsData.push(['=== DAILY PRODUCTION DETAIL ==='])
    wsData.push(headers)
    dataRows.forEach(row => wsData.push(row))

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    
    // Set column widths
    const colWidths = [{ wch: 12 }, { wch: 10 }, { wch: 15 }]
    phases.forEach(() => {
      colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 8 })
    })
    colWidths.push({ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 })
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Production')

    // Add Phase Summary sheet
    const summaryData = [
      ['PHASE PRODUCTION SUMMARY'],
      [''],
      ['Phase', 'Start KP', 'End KP', 'Total Metres', 'Reports']
    ]
    
    phases.forEach(phase => {
      const data = phaseTotals[phase]
      if (data.metres > 0) {
        // Count reports with this activity
        const reportCount = reports.filter(r => 
          (r.activity_blocks || []).some(b => b.activityType === phase)
        ).length
        summaryData.push([
          phase,
          formatKP(data.minKP),
          formatKP(data.maxKP),
          data.metres,
          reportCount
        ])
      }
    })
    summaryData.push([''])
    summaryData.push(['TOTALS', '', '', grandTotalMetres, reports.length])

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
    summaryWs['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    // Generate filename
    const today = new Date().toISOString().split('T')[0]
    const filename = `${PROJECT_SHORT}_Master_Production_Spread_${spread || 'All'}_${today}.xlsx`
    XLSX.writeFile(wb, filename)
  }


  // Main render
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {/* Voice Input Animation Styles */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes recordingPulse {
          0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(220, 53, 69, 0); }
          100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); }
        }
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(-10px); }
          15% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
      `}</style>

      {/* Draft Restore Prompt Modal */}
      {draftRestorePrompt && pendingDraft && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '12px',
            maxWidth: '500px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>📋</div>
            <h2 style={{ margin: '0 0 15px 0', color: '#003366' }}>Unsaved Draft Found</h2>
            <p style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>
              We found an auto-saved draft from your previous session.
            </p>
            <div style={{ 
              backgroundColor: '#f8f9fa', 
              padding: '12px', 
              borderRadius: '6px', 
              marginBottom: '20px',
              fontSize: '13px',
              color: '#495057'
            }}>
              <strong>Date:</strong> {pendingDraft.selectedDate || 'Not set'}<br/>
              <strong>Inspector:</strong> {pendingDraft.inspectorName || 'Not set'}<br/>
              <strong>Activities:</strong> {pendingDraft.activityBlocks?.filter(b => b.activityType).length || 0} recorded<br/>
              <strong>Saved:</strong> {pendingDraft.savedAt ? new Date(pendingDraft.savedAt).toLocaleString() : 'Unknown'}
            </div>
            <p style={{ margin: '0 0 20px 0', color: '#666', fontSize: '14px' }}>
              Would you like to restore this draft?
            </p>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
              <button
                onClick={restoreDraft}
                style={{
                  padding: '12px 30px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                ✓ Restore Draft
              </button>
              <button
                onClick={declineDraft}
                style={{
                  padding: '12px 30px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft Saved Indicator */}
      {showDraftIndicator && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#28a745',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fadeInOut 2s ease-in-out'
        }}>
          <span style={{ 
            width: '10px', 
            height: '10px', 
            backgroundColor: '#90EE90', 
            borderRadius: '50%',
            display: 'inline-block'
          }}></span>
          Draft Saved
        </div>
      )}

      {/* Guided Tour */}
      <GuidedTour
        steps={TOUR_STEPS.inspectorReport}
        run={runTour}
        stepIndex={stepIndex}
        onCallback={handleTourCallback}
      />

      {/* Header */}
      <div
        data-tour="header"
        style={{
          backgroundColor: isEditMode ? '#856404' : '#003366',
          color: 'white',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
        {/* Top row - Title */}
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <h1 style={{ margin: 0, fontSize: '16px' }}>{PROJECT_NAME}</h1>
          <h2 style={{ margin: '5px 0 0 0', fontSize: '20px' }}>
            {isEditMode ? '✏️ EDITING REPORT' : 'Daily Inspector Report'}
          </h2>
          {isEditMode && (
            <p style={{ margin: '5px 0 0 0', fontSize: '11px', opacity: 0.9 }}>
              Changes will be logged to audit trail
            </p>
          )}
        </div>
        
        {/* Bottom row - Buttons (wraps on mobile) */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          {isEditMode && (
            <button
              onClick={() => {
                const confirmLeave = window.confirm('Are you sure you want to leave? Any unsaved changes will be lost.')
                if (!confirmLeave) return

                if (currentUserRole === 'inspector') {
                  navigate(orgPath('/inspector'))
                } else if (currentUserRole === 'chief_inspector') {
                  navigate(orgPath('/chief-dashboard'))
                } else {
                  navigate(orgPath('/admin'))
                }
              }}
              style={{ padding: '8px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              {currentUserRole === 'inspector' ? '← Back' : currentUserRole === 'chief_inspector' ? '← Chief' : '← Admin'}
            </button>
          )}
          
          {/* Previous Reports Dropdown - Always show for inspectors when not editing */}
          {!isEditMode && (
            <select
              onChange={(e) => {
                if (e.target.value) {
                  // Clear any draft so it doesn't interfere
                  localStorage.removeItem('pipeup_inspector_draft')
                  const targetUrl = `${orgPath('/field-entry')}?edit=${e.target.value}`
                  console.log('[InspectorReport] Loading report from dropdown:', targetUrl)
                  navigate(targetUrl)
                }
              }}
              style={{
                padding: '8px 10px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: previousReports.some(r => r.status === 'revision_requested') ? '#dc3545' : 
                                loadingPreviousReports ? '#6c757d' : 
                                previousReports.length === 0 ? '#6c757d' : '#ffc107',
                color: previousReports.some(r => r.status === 'revision_requested') ? 'white' : 
                      loadingPreviousReports || previousReports.length === 0 ? 'white' : '#000',
                fontWeight: 'bold',
                cursor: previousReports.length === 0 ? 'default' : 'pointer',
                fontSize: '12px',
                maxWidth: '200px'
              }}
              defaultValue=""
              disabled={loadingPreviousReports || previousReports.length === 0}
            >
              <option value="">
                {loadingPreviousReports ? '⏳ Loading...' :
                 previousReports.length === 0 ? '📋 No Saved Reports' :
                 previousReports.some(r => r.status === 'revision_requested') ? '⚠️ REVISION REQUESTED' : 
                 `📋 My Reports (${previousReports.length})`}
              </option>
              {previousReports.map(report => {
                const statusEmoji = report.status === 'revision_requested' ? '🔴 NEEDS FIX: ' 
                  : report.status === 'approved' ? '✅ ' 
                  : report.status === 'submitted' ? '📤 ' 
                  : '📝 '
                
                // Extract activity types from activity_blocks
                const activityTypes = (report.activity_blocks || [])
                  .filter(block => block.activityType)
                  .map(block => block.activityType)
                  .slice(0, 2) // Limit to first 2 activity types
                  .join(', ')
                
                const activityText = activityTypes ? ` - ${activityTypes}` : ''
                
                return (
                  <option key={report.id} value={report.id} style={{ color: report.status === 'revision_requested' ? 'red' : 'inherit' }}>
                    {statusEmoji}ID {report.id} - {report.date}{activityText}
                  </option>
                )
              })}
            </select>
          )}
          
          <button
            onClick={() => setShowMap(!showMap)}
            style={{
              padding: '8px 12px',
              backgroundColor: showMap ? '#28a745' : '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            🗺️ {showMap ? 'Hide Map' : 'Map'}
          </button>

          <TourHelpButton onClick={startTour} />

          <AIAgentStatusIcon organizationId={organizationId} />

          <button
            onClick={signOut}
            style={{ padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Floating Agent Button - Always visible bottom-right */}
      <button
        data-tour="ask-agent"
        onClick={() => setShowDocSearch(!showDocSearch)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 16px rgba(79, 70, 229, 0.4)',
          cursor: 'pointer',
          fontSize: '24px',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease'
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(79, 70, 229, 0.5)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(79, 70, 229, 0.4)' }}
        title="Ask the Agent"
      >
        {showDocSearch ? '×' : '💬'}
      </button>

      {/* Agent Panel - Floating above the button */}
      {showDocSearch && (
        <div style={{
          position: 'fixed',
          bottom: '92px',
          right: '24px',
          width: '380px',
          maxHeight: 'calc(100vh - 140px)',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          zIndex: 10001,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 16px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Ask the Agent</div>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>Your report, specs & procedures</div>
            </div>
            <button
              onClick={() => setShowDocSearch(false)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              ×
            </button>
          </div>
          <div style={{ padding: '12px', overflowY: 'auto', flex: 1 }}>
            <AskTheAgentPanel
              activityType={activityBlocks[0]?.activityType || ''}
              organizationId={organizationId}
              blockId={activityBlocks[0]?.id || 'main'}
              reportContext={reportContext}
            />
          </div>
        </div>
      )}

      {/* Pipeline Map Section */}
      {showMap && (
        <div style={{ marginBottom: '20px', position: 'relative' }}>
          <MiniMapWidget 
            startKP={activityBlocks[0]?.startKP || ''}
            endKP={activityBlocks[0]?.endKP || ''}
            pipeline={pipeline || 'south'}
            height="350px"
            onKPSync={(gpsData) => {
              // When GPS syncs, could auto-fill KP field
              console.log('GPS synced:', gpsData)
              // Optionally update the first activity block's startKP
              // setActivityBlocks(blocks => blocks.map((b, i) => 
              //   i === 0 ? { ...b, startKP: gpsData.kpFormatted } : b
              // ))
            }}
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
      )}

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
            backgroundColor: '#007bff',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, fontSize: '18px' }}>🗺️ Pipeline Map - Full View</h2>
            <button
              onClick={() => window.history.back()}
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
              startKP={activityBlocks[0]?.startKP || ''}
              endKP={activityBlocks[0]?.endKP || ''}
              pipeline={pipeline || 'south'}
              height="calc(100vh - 120px)"
              onKPSync={(gpsData) => {
                console.log('GPS synced:', gpsData)
              }}
            />
          </div>
        </div>
      )}

      {/* Loading indicator for edit mode */}
      {loadingReport && (
        <div style={{ backgroundColor: '#fff3cd', padding: '20px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#856404' }}>Loading report for editing...</p>
        </div>
      )}

      {/* SECTION 1: HEADER */}
      <div data-tour="date-picker" style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
        <div style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, color: '#333' }}>REPORT INFORMATION</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Date *</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Inspector Name *</label>
            <input
              type="text"
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              placeholder="Your name"
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Spread</label>
            <select
              value={spread}
              onChange={(e) => {
                const selectedSpread = e.target.value
                setSpread(selectedSpread)
                if (spreadToPipeline[selectedSpread]) {
                  setPipeline(spreadToPipeline[selectedSpread])
                }
              }}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            >
              <option value="">Select Spread...</option>
              {spreadOptions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Pipeline</label>
            <select
              value={pipeline}
              onChange={(e) => setPipeline(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            >
              <option value="">Select Pipeline</option>
              {Object.keys(pipelineLocations).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>AFE / Contract #</label>
            <input
              type="text"
              value={afe}
              onChange={(e) => setAfe(e.target.value)}
              placeholder="Auto-filled from config"
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box', backgroundColor: afe ? '#e8f5e9' : 'white' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Stop Time</label>
            <input
              type="time"
              value={stopTime}
              onChange={(e) => setStopTime(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: WEATHER */}
      <div data-tour="weather" style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, color: '#333' }}>WEATHER</h2>
          <button
            onClick={fetchWeather}
            disabled={fetchingWeather}
            style={{ padding: '6px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', height: '32px' }}
          >
            {fetchingWeather ? 'Fetching...' : '🌤️ Auto-Fetch Weather'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Conditions</label>
            <input
              type="text"
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              placeholder="Clear, Cloudy, Rain..."
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Precipitation (mm)</label>
            <input
              type="text"
              inputMode="decimal"
              value={precipitation}
              onChange={(e) => setPrecipitation(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>High Temp (°C)</label>
            <input
              type="text"
              inputMode="numeric"
              value={tempHigh}
              onChange={(e) => setTempHigh(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Low Temp (°C)</label>
            <input
              type="text"
              inputMode="numeric"
              value={tempLow}
              onChange={(e) => setTempLow(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Wind (km/h)</label>
            <input
              type="text"
              inputMode="numeric"
              value={windSpeed}
              onChange={(e) => setWindSpeed(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ROW Condition</label>
            <select
              value={rowCondition}
              onChange={(e) => setRowCondition(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            >
              <option value="">Select...</option>
              <option value="Dry">Dry</option>
              <option value="Wet">Wet</option>
              <option value="Muddy">Muddy</option>
              <option value="Frozen">Frozen</option>
              <option value="Snow Covered">Snow Covered</option>
            </select>
          </div>
        </div>
      </div>

      {/* REPORT WORKFLOW - Submit/Approve/Audit Trail */}
      <ReportWorkflow
        reportId={currentReportId}
        reportDate={selectedDate}
        currentUser={{
          id: userProfile?.id,
          name: inspectorName || userProfile?.email,
          email: userProfile?.email,
          role: currentUserRole
        }}
        onStatusChange={(status) => console.log('Report status:', status)}
      />

      {/* ACTIVITIES SECTION HEADER */}
      <div
        data-tour="activity-blocks"
        style={{
          backgroundColor: '#007bff',
          padding: '15px 20px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
        <div>
          <h2 style={{ margin: 0, color: 'white' }}>📋 ACTIVITIES ({activityBlocks.length})</h2>
          <p style={{ margin: '5px 0 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '13px' }}>
            Add activities for each crew you're inspecting today
          </p>
        </div>
      </div>

      {/* ACTIVITY BLOCKS */}
      {activityBlocks.map((block, blockIndex) => (
        <ActivityBlock
          key={block.id}
          block={block}
          blockIndex={blockIndex}
          // Context data
          selectedDate={selectedDate}
          spread={spread}
          afe={afe}
          weather={weather}
          tempHigh={tempHigh}
          tempLow={tempLow}
          inspectorName={inspectorName}
          // Audit trail props
          reportId={currentReportId}
          currentUser={{
            id: userProfile?.id,
            name: inspectorName || userProfile?.email,
            email: userProfile?.email,
            role: currentUserRole
          }}
          // Chainage status
          blockChainageStatus={blockChainageStatus[block.id]}
          chainageReasons={chainageReasons}
          setChainageReasons={setChainageReasons}
          // Voice state
          isListening={isListening}
          VoiceButton={VoiceButton}
          // Handlers
          updateActivityBlock={updateActivityBlock}
          removeActivityBlock={removeActivityBlock}
          updateQualityData={updateQualityData}
          updateWeldData={updateWeldData}
          updateBendData={updateBendData}
          updateStringData={updateStringData}
          updateCoatingData={updateCoatingData}
          updateClearingData={updateClearingData}
          updateHDDData={updateHDDData}
          updatePilingData={updatePilingData}
          updateCleaningLogData={updateCleaningLogData}
          updateHydrovacData={updateHydrovacData}
          updateWelderTestingData={updateWelderTestingData}
          updateHydrotestData={updateHydrotestData}
          updateTieInCompletionData={updateTieInCompletionData}
          updateDitchData={updateDitchData}
          updateGradingData={updateGradingData}
          updateCounterboreData={updateCounterboreData}
          updateMachineCleanupData={updateMachineCleanupData}
          updateFinalCleanupData={updateFinalCleanupData}
          updateConventionalBoreData={updateConventionalBoreData}
          addLabourToBlock={addLabourToBlock}
          updateLabourField={updateLabourField}
          updateLabourJH={updateLabourJH}
          updateLabourProductionStatus={updateLabourProductionStatus}
          updateLabourShadowHours={updateLabourShadowHours}
          updateLabourDragReason={updateLabourDragReason}
          updateLabourContractorNote={updateLabourContractorNote}
          removeLabourFromBlock={removeLabourFromBlock}
          addEquipmentToBlock={addEquipmentToBlock}
          updateEquipmentField={updateEquipmentField}
          updateEquipmentProductionStatus={updateEquipmentProductionStatus}
          updateEquipmentShadowHours={updateEquipmentShadowHours}
          updateEquipmentDragReason={updateEquipmentDragReason}
          updateEquipmentContractorNote={updateEquipmentContractorNote}
          updateEquipmentUnitNumber={updateEquipmentUnitNumber}
          updateSystemicDelay={updateSystemicDelay}
          removeEquipmentFromBlock={removeEquipmentFromBlock}
          handleWorkPhotosSelect={handleWorkPhotosSelect}
          updatePhotoMetadata={updatePhotoMetadata}
          removeWorkPhoto={removeWorkPhoto}
          // For section toggle
          setActivityBlocks={setActivityBlocks}
          activityBlocks={activityBlocks}
          // Mentor agent props
          organizationId={organizationId}
          onMentorAlert={handleMentorAlert}
        />
      ))}

      {/* Add Activity Button */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button
          onClick={addActivityBlock}
          style={{ padding: '15px 40px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
        >
          + Add Another Activity
        </button>
      </div>

      {/* TRACKABLE ITEMS - Collapsible */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', marginBottom: '20px', border: '2px solid #6f42c1', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div 
          onClick={() => setTrackableItemsExpanded(!trackableItemsExpanded)}
          style={{ 
            padding: '15px 20px',
            backgroundColor: trackableItemsExpanded ? '#6f42c1' : '#f8f9fa',
            color: trackableItemsExpanded ? 'white' : '#6f42c1',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: trackableItemsExpanded ? '2px solid #6f42c1' : 'none'
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px' }}>📦 TRACKABLE ITEMS</h2>
          <span style={{ fontSize: '14px' }}>
            {trackableItemsExpanded ? '▼ Collapse' : '▶ Expand'}
          </span>
        </div>
        
        {trackableItemsExpanded && (
          <div style={{ padding: '20px' }}>
            {/* Reminder Banner */}
            <div style={{
              padding: '12px 15px',
              backgroundColor: '#fff3cd',
              borderRadius: '6px',
              border: '1px solid #ffc107',
              marginBottom: '15px'
            }}>
              <div style={{ fontSize: '14px', color: '#856404', fontWeight: 'bold', marginBottom: '5px' }}>
                ⚠️ REMINDER: Review All Trackable Items
              </div>
              <div style={{ fontSize: '13px', color: '#856404' }}>
                Before submitting, check each category below to ensure nothing is missed:
                <strong> Mats, Rock Trench, Extra Depth, Fencing, Ramps, Goal Posts, Access Roads, Hydrovac, Erosion Control, Signage, Equipment Cleaning, Weld UPI Items</strong>
              </div>
            </div>
            
            <TrackableItemsTracker
              projectId={pipeline || 'default'}
              reportDate={selectedDate}
              reportId={currentReportId}
              inspector={inspectorName}
              onDataChange={(data) => setTrackableItemsData(data)}
            />
          </div>
        )}
      </div>

      {/* SAFETY / ENVIRONMENT / COMMENTS */}
      <div data-tour="safety-section" style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
        <div style={{ borderBottom: '2px solid #28a745', paddingBottom: '10px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, color: '#333' }}>SAFETY / ENVIRONMENT / COMMENTS</h2>
        </div>
        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Safety Notes</label>
            <VoiceButton fieldId="safetyNotes" />
          </div>
          <textarea
            value={safetyNotes}
            onChange={(e) => setSafetyNotes(e.target.value)}
            rows={3}
            placeholder="Safety observations, incidents, hazards... (use 🎤 for voice input)"
            style={{ 
              width: '100%', 
              padding: '10px', 
              border: isListening === 'safetyNotes' ? '2px solid #dc3545' : '1px solid #ced4da', 
              borderRadius: '4px',
              backgroundColor: isListening === 'safetyNotes' ? '#fff5f5' : 'white'
            }}
          />
          {isListening === 'safetyNotes' && (
            <div style={{ marginTop: '5px', padding: '5px 10px', backgroundColor: '#f8d7da', borderRadius: '4px', fontSize: '12px', color: '#721c24' }}>
              🔴 Listening... Say "period", "comma" for punctuation. Click Stop when done.
            </div>
          )}
        </div>

        {/* Safety Recognition Cards */}
        <SafetyRecognition
          data={safetyRecognitionData}
          onChange={setSafetyRecognitionData}
          inspectorName={inspectorName}
          reportDate={selectedDate}
        />

        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Land & Environment</label>
            <VoiceButton fieldId="landEnvironment" />
          </div>
          <textarea
            value={landEnvironment}
            onChange={(e) => setLandEnvironment(e.target.value)}
            rows={3}
            placeholder="Environmental conditions, landowner issues... (use 🎤 for voice input)"
            style={{ 
              width: '100%', 
              padding: '10px', 
              border: isListening === 'landEnvironment' ? '2px solid #dc3545' : '1px solid #ced4da', 
              borderRadius: '4px',
              backgroundColor: isListening === 'landEnvironment' ? '#fff5f5' : 'white'
            }}
          />
          {isListening === 'landEnvironment' && (
            <div style={{ marginTop: '5px', padding: '5px 10px', backgroundColor: '#f8d7da', borderRadius: '4px', fontSize: '12px', color: '#721c24' }}>
              🔴 Listening... Say "period", "comma" for punctuation. Click Stop when done.
            </div>
          )}
        </div>

        {/* Wildlife Sighting Records */}
        <WildlifeSighting
          data={wildlifeSightingData}
          onChange={setWildlifeSightingData}
          inspectorName={inspectorName}
          reportDate={selectedDate}
        />

      </div>

      {/* INSPECTOR INFO */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
        <div style={{ borderBottom: '2px solid #17a2b8', paddingBottom: '10px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, color: '#333' }}>INSPECTOR INFORMATION</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', alignItems: 'start' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Mileage (km)</label>
            <input
              type="text"
              inputMode="numeric"
              value={inspectorMileage}
              onChange={(e) => setInspectorMileage(e.target.value)}
              placeholder="km driven"
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ gridColumn: 'span 4' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Equipment Used</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', height: '32px' }}>
              {['ATV', 'UTV', 'Radio', 'Gas Fob'].map(eq => (
                <label key={eq} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
                  <input
                    type="checkbox"
                    checked={inspectorEquipment.includes(eq)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setInspectorEquipment([...inspectorEquipment, eq])
                      } else {
                        setInspectorEquipment(inspectorEquipment.filter(x => x !== eq))
                      }
                    }}
                  />
                  {eq}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CHAINAGE OVERLAP CHECK */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
        <button
          onClick={async () => {
            const currentWarnings = checkChainageOverlaps(activityBlocks)
            const historicalWarnings = await checkHistoricalOverlaps(activityBlocks)
            const allWarnings = [...currentWarnings, ...historicalWarnings]
            setOverlapWarnings(allWarnings)
            if (allWarnings.length === 0) {
              alert('✅ No chainage overlaps detected!')
            }
          }}
          style={{ padding: '10px 25px', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
        >
          🔍 Check for Chainage Overlaps
        </button>
        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>
          Check current report against saved reports for duplicate chainages
        </p>
      </div>

      {/* CHAINAGE OVERLAP WARNINGS */}
      {overlapWarnings.length > 0 && (
        <div style={{ backgroundColor: '#fff3cd', border: '2px solid #ffc107', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ margin: 0, color: '#856404' }}>⚠️ Chainage Overlap Warnings ({overlapWarnings.length})</h4>
            <button
              onClick={() => setOverlapWarnings([])}
              style={{ padding: '4px 12px', backgroundColor: '#856404', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              Dismiss
            </button>
          </div>
          {overlapWarnings.map((warning, idx) => (
            <p key={idx} style={{ margin: '5px 0', color: '#856404', fontSize: '14px' }}>
              {warning.message}
            </p>
          ))}
          <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#856404' }}>
            Please review the KP ranges above. Overlapping chainages may indicate duplicate work entries.
          </p>
        </div>
      )}

      {/* VISITORS */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
        <div style={{ borderBottom: '2px solid #6c757d', paddingBottom: '10px', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, color: '#333' }}>VISITORS</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            placeholder="Name"
            style={{ flex: 1, minWidth: '150px', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
          />
          <input
            type="text"
            value={visitorCompany}
            onChange={(e) => setVisitorCompany(e.target.value)}
            placeholder="Company"
            style={{ flex: 1, minWidth: '150px', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
          />
          <input
            type="text"
            value={visitorPosition}
            onChange={(e) => setVisitorPosition(e.target.value)}
            placeholder="Position"
            style={{ flex: 1, minWidth: '150px', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
          />
          <button
            onClick={addVisitor}
            style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Add Visitor
          </button>
        </div>
        {visitors.length > 0 && (
          <div style={{ marginTop: '15px' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '10px', color: '#333' }}>Visitor List:</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {visitors.map((visitor, idx) => (
                <div key={idx} style={{ 
                  padding: '10px', 
                  backgroundColor: 'white', 
                  border: '1px solid #dee2e6', 
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>
                    <strong>{visitor.name}</strong>
                    {visitor.company && ` - ${visitor.company}`}
                    {visitor.position && ` (${visitor.position})`}
                  </span>
                  <button
                    onClick={() => setVisitors(visitors.filter((_, i) => i !== idx))}
                    style={{ 
                      padding: '5px 10px', 
                      backgroundColor: '#dc3545', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>


      {/* SAVE BUTTONS */}
      <div data-tour="save-button" style={{ backgroundColor: '#e9ecef', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        {/* Draft Status Indicator */}
        {draftSaved && !isEditMode && (
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '15px',
            padding: '8px 15px',
            backgroundColor: '#d4edda',
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            margin: '0 auto 15px auto',
            width: 'fit-content'
          }}>
            <span style={{ 
              width: '8px', 
              height: '8px', 
              backgroundColor: '#28a745', 
              borderRadius: '50%',
              display: 'inline-block'
            }}></span>
            <span style={{ fontSize: '13px', color: '#155724' }}>
              Draft auto-saved locally
            </span>
          </div>
        )}
        
        {/* Health Score Indicator */}
        <HealthScoreIndicator healthScore={healthScore} />

        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowTrackableItemsModal(true)}
            disabled={saving}
            style={{
              padding: '20px 60px',
              backgroundColor: isOnline ? '#28a745' : '#ff9800',
              color: 'white',
              border: healthScore && !healthScore.passing ? '3px solid #ca8a04' : 'none',
              borderRadius: '8px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '20px',
              fontWeight: 'bold',
              boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
            }}
          >
            {saving
              ? '⏳ Submitting...'
              : isOnline
                ? '✅ Submit Report'
                : '📴 Save Offline'}
          </button>
          {pendingCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              backgroundColor: '#dc3545',
              color: 'white',
              borderRadius: '50%',
              padding: '2px 8px',
              fontSize: '12px',
              fontWeight: 'bold'
            }}>
              {pendingCount}
            </span>
          )}
        </div>

        <p style={{ textAlign: 'center', margin: '15px 0 0 0', fontSize: '13px', color: '#666' }}>
          {isOnline
            ? 'Submitting will save your report and send it to the Chief Inspector for review'
            : 'You are offline. Report will be saved locally and synced when connected.'}
        </p>

        {/* Secondary options */}
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '20px' }}>
          <button
            onClick={() => exportToPDF()}
            style={{ padding: '10px 25px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
          >
            📄 Download PDF Copy
          </button>
        </div>
        
        {/* Clear Draft Button */}
        {draftSaved && !isEditMode && (
          <div style={{ textAlign: 'center', marginTop: '15px' }}>
            <button
              onClick={clearDraft}
              style={{ 
                padding: '8px 20px', 
                backgroundColor: 'transparent', 
                color: '#6c757d', 
                border: '1px solid #6c757d', 
                borderRadius: '4px', 
                cursor: 'pointer', 
                fontSize: '13px'
              }}
            >
              🗑️ Clear Draft & Start Fresh
            </button>
          </div>
        )}
      </div>

      {/* TRACKABLE ITEMS CONFIRMATION MODAL */}
      {showTrackableItemsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '50px',
              marginBottom: '15px'
            }}>
              ⚠️
            </div>
            <h2 style={{
              margin: '0 0 15px 0',
              color: '#856404',
              fontSize: '24px'
            }}>
              STOP! Check Trackable Items
            </h2>
            <div style={{
              backgroundColor: '#fff3cd',
              border: '2px solid #ffc107',
              borderRadius: '8px',
              padding: '15px',
              marginBottom: '20px',
              textAlign: 'left'
            }}>
              <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#856404' }}>
                Have you checked ALL trackable items?
              </p>
              <ul style={{ margin: '0', paddingLeft: '20px', color: '#856404', fontSize: '14px' }}>
                <li>🛤️ Mats</li>
                <li>🪨 Rock Trench</li>
                <li>📐 Extra Depth Ditch</li>
                <li>🛏️ Bedding & Padding</li>
                <li>🚧 Temporary Fencing</li>
                <li>🛤️ Ramps</li>
                <li>⚡ Goal Posts (Power Lines)</li>
                <li>🚜 Access Roads</li>
                <li>🚿 Hydrovac Holes</li>
                <li>🌊 Erosion Control</li>
                <li>🚧 Signage & Flagging</li>
                <li>🧹 Equipment Cleaning</li>
                <li>⚙️ Weld UPI Items</li>
              </ul>
            </div>
            <p style={{ margin: '0 0 20px 0', color: '#666', fontSize: '14px' }}>
              Missing trackable items can cause project tracking issues. Please confirm you have reviewed all categories.
            </p>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowTrackableItemsModal(false)}
                style={{
                  padding: '12px 30px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                ← Go Back & Check
              </button>
              <button
                onClick={() => {
                  setShowTrackableItemsModal(false)
                  saveReport(false)
                }}
                style={{
                  padding: '12px 30px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                ✅ Yes, Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mentor Agent: Sidebar + Badge */}
      <MentorSidebar
        isOpen={mentorSidebarOpen}
        onClose={() => setMentorSidebarOpen(false)}
        alerts={allMentorAlerts}
        onAcknowledge={(alertId) => {
          setMentorAlerts(prev => {
            const updated = {}
            for (const [blockId, blockAlerts] of Object.entries(prev)) {
              updated[blockId] = blockAlerts.map(a =>
                a.id === alertId ? { ...a, status: 'acknowledged' } : a
              )
            }
            return updated
          })
        }}
        onOverride={(alertId, reason) => {
          // Find the alert for logging
          const alert = allMentorAlerts.find(a => a.id === alertId)
          if (alert) {
            logOverride({
              reportId: currentReportId,
              blockId: alert.blockId,
              alertId: alert.dbId || alertId,
              alertType: alert.alertType,
              alertSeverity: alert.severity,
              alertMessage: alert.message,
              overrideReason: reason,
              fieldKey: alert.fieldKey,
              fieldValue: alert.fieldValue,
              thresholdExpected: null,
              organizationId
            })
          }
          setMentorAlerts(prev => {
            const updated = {}
            for (const [blockId, blockAlerts] of Object.entries(prev)) {
              updated[blockId] = blockAlerts.map(a =>
                a.id === alertId ? { ...a, status: 'overridden', overrideReason: reason } : a
              )
            }
            return updated
          })
        }}
        onDismiss={(alertId) => {
          setMentorAlerts(prev => {
            const updated = {}
            for (const [blockId, blockAlerts] of Object.entries(prev)) {
              updated[blockId] = blockAlerts.filter(a => a.id !== alertId)
            }
            return updated
          })
        }}
      />
      {!mentorSidebarOpen && (
        <MentorAlertBadge
          alertCount={activeMentorAlerts.length}
          criticalCount={mentorCriticalCount}
          warningCount={mentorWarningCount}
          onClick={() => setMentorSidebarOpen(true)}
        />
      )}

      <FeedbackButton pageName="inspector_report" userProfile={userProfile} organizationId={organizationId} />
    </div>
  )
}

export default InspectorReport
