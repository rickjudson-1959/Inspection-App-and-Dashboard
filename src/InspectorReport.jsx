import './App.css'
import { saveTieInTicket } from './saveLogic.js'
import { useAuth } from './AuthContext.jsx'
import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { supabase } from './supabase'

// Import constants from separate file
import { 
  PROJECT_NAME, 
  PROJECT_SHORT, 
  pipelineLocations, 
  activityTypes, 
  qualityFieldsByActivity, 
  timeLostReasons, 
  labourClassifications, 
  equipmentTypes, 
  createEmptyActivity 
} from './constants.js'

// Import ActivityBlock component (handles all specialized logs internally)
import ActivityBlock from './ActivityBlock.jsx'

// Report-level components (not part of activity blocks)
import SafetyRecognition from './SafetyRecognition.jsx'
import WildlifeSighting from './WildlifeSighting.jsx'
import UnitPriceItemsLog from './UnitPriceItemsLog.jsx'
import MatTracker from './MatTracker.jsx'
import ReportWorkflow from './ReportWorkflow.jsx'
import MiniMapWidget from './MiniMapWidget.jsx'
const weatherApiKey = import.meta.env.VITE_WEATHER_API_KEY
const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

// Constants now imported from constants.js


function InspectorReport() {
  const { signOut, userProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  // Edit mode
  const editReportId = searchParams.get('edit')
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

  // Collapsible sections
  const [trackableItemsExpanded, setTrackableItemsExpanded] = useState(false)


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

Important:
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
      const { data: reports, error } = await supabase
        .from('daily_tickets')
        .select('date, activity_blocks')
      
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

  // Fetch existing chainages on mount and when date changes
  useEffect(() => {
    fetchExistingChainages()
  }, [selectedDate])

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
      // Fetch existing reports
      const { data: existingReports, error } = await supabase
        .from('daily_tickets')
        .select('date, spread, activity_blocks')
        .neq('date', selectedDate) // Exclude current date

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
          .from('daily_tickets')
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

  // Load report for editing
  useEffect(() => {
    async function loadReportForEdit() {
      if (!editReportId) return
      if (!userProfile) return // Wait for user profile to load
      
      setLoadingReport(true)
      try {
        const { data: report, error } = await supabase
          .from('daily_tickets')
          .select('*')
          .eq('id', editReportId)
          .single()

        if (error) throw error
        if (!report) {
          alert('Report not found')
          navigate('/inspector')
          return
        }

        // Check if this inspector owns this report (unless they're admin/chief)
        const userRole = userProfile?.role
        const isAdminOrChief = ['super_admin', 'admin', 'chief_inspector'].includes(userRole)
        
        if (!isAdminOrChief) {
          const reportInspector = (report.inspector_name || '').toLowerCase()
          const userName = (userProfile.full_name || '').toLowerCase()
          const userEmail = (userProfile.email || '').toLowerCase()
          
          if (reportInspector !== userName && reportInspector !== userEmail) {
            alert('You can only edit your own reports.')
            navigate('/inspector')
            return
          }
        }

        // Store original for comparison
        setOriginalReportData(report)
        setIsEditMode(true)
        setCurrentReportId(parseInt(editReportId, 10))

        // Populate all fields from report
        setSelectedDate(report.date || '')
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
              workPhotos: [],  // Photos can't be re-loaded easily
              ticketPhoto: null,
              timeLostReason: block.timeLostReason || 'None',
              timeLostHours: block.timeLostHours || '',
              timeLostDetails: block.timeLostDetails || '',
              weldData: block.weldData || null,
              bendingData: block.bendingData || null,
              stringingData: block.stringingData || null,
              coatingData: block.coatingData || null,
              clearingData: block.clearingData || null,
              counterboreData: block.counterboreData || null
            }
          })
          setActivityBlocks(loadedBlocks)
          setChainageReasons(loadedChainageReasons)
        }

        console.log('Report loaded for editing:', report.id)
        
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
      }
      setLoadingReport(false)
    }

    loadReportForEdit()
  }, [editReportId, userProfile])

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
    setActivityBlocks([...activityBlocks, createEmptyActivity()])
  }

  function removeActivityBlock(blockId) {
    if (activityBlocks.length === 1) {
      alert('You must have at least one activity')
      return
    }
    setActivityBlocks(activityBlocks.filter(b => b.id !== blockId))
  }

  function updateActivityBlock(blockId, field, value) {
    const updatedBlocks = activityBlocks.map(block => 
      block.id === blockId ? { ...block, [field]: value } : block
    )
    setActivityBlocks(updatedBlocks)
    
    // Check for overlaps when KP or activity type changes
    if (field === 'startKP' || field === 'endKP' || field === 'activityType') {
      const warnings = checkChainageOverlaps(updatedBlocks)
      setOverlapWarnings(warnings)
    }
    
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
    try {
      const { data, error } = await supabase
        .from('inspector_reports')
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

  function updateQualityData(blockId, fieldName, value) {
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          counterboreData: counterboreData
        }
      }
      return block
    }))
  }

  // Labour management for activity blocks
  // RT = Regular Time, OT = Overtime, JH = Jump Hours (bonus)
  function addLabourToBlock(blockId, employeeName, classification, rt, ot, jh, count) {
    if (!classification || (!rt && !ot && !jh)) {
      alert('Please enter classification and at least one hour type (RT, OT, or JH)')
      return
    }
    const rtVal = parseFloat(rt) || 0
    const otVal = parseFloat(ot) || 0
    const jhVal = parseFloat(jh) || 0
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          labourEntries: [...block.labourEntries, {
            id: Date.now(),
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
  function updateLabourJH(blockId, labourId, jhValue) {
    setActivityBlocks(activityBlocks.map(block => {
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

  function removeLabourFromBlock(blockId, labourId) {
    setActivityBlocks(activityBlocks.map(block => {
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
  function addEquipmentToBlock(blockId, type, hours, count) {
    if (!type || !hours) {
      alert('Please enter equipment type and hours')
      return
    }
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          equipmentEntries: [...block.equipmentEntries, {
            id: Date.now(),
            type,
            hours: parseFloat(hours),
            count: parseInt(count) || 1
          }]
        }
      }
      return block
    }))
  }

  function removeEquipmentFromBlock(blockId, equipmentId) {
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
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
    setActivityBlocks(activityBlocks.map(block => {
      if (block.id === blockId) {
        const updatedPhotos = [...block.workPhotos]
        updatedPhotos[photoIndex] = { ...updatedPhotos[photoIndex], [field]: value }
        return { ...block, workPhotos: updatedPhotos }
      }
      return block
    }))
  }

  function removeWorkPhoto(blockId, photoIndex) {
    setActivityBlocks(activityBlocks.map(block => {
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
        let ticketPhotoFileName = null
        const workPhotoData = []

        // Upload ticket photo
        if (block.ticketPhoto) {
          const fileExt = block.ticketPhoto.name.split('.').pop()
          ticketPhotoFileName = `ticket_${Date.now()}_${block.id}.${fileExt}`
          const { error: uploadError } = await supabase.storage
            .from('ticket-photos')
            .upload(ticketPhotoFileName, block.ticketPhoto)
          if (uploadError) {
            console.error('Ticket photo upload error:', uploadError)
          }
        }

        // Upload work photos
        for (let i = 0; i < block.workPhotos.length; i++) {
          const photo = block.workPhotos[i]
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

        processedBlocks.push({
          id: block.id,
          activityType: block.activityType,
          contractor: block.contractor,
          foreman: block.foreman,
          ticketPhoto: ticketPhotoFileName,
          startKP: block.startKP,
          endKP: block.endKP,
          workDescription: block.workDescription,
          labourEntries: block.labourEntries,
          equipmentEntries: block.equipmentEntries,
          qualityData: block.qualityData,
          workPhotos: workPhotoData,
          timeLostReason: block.timeLostReason,
          timeLostHours: block.timeLostHours,
          timeLostDetails: block.timeLostDetails,
          chainageOverlapReason: chainageReasons[block.id]?.overlapReason || null,
          chainageGapReason: chainageReasons[block.id]?.gapReason || null,
          // Specialized data for different activity types
          weldData: block.weldData || null,
          bendingData: block.bendingData || null,
          stringingData: block.stringingData || null,
          coatingData: block.coatingData || null,
          clearingData: block.clearingData || null,
          counterboreData: block.counterboreData || null
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
        visitors: visitors,
        inspector_mileage: parseFloat(inspectorMileage) || null,
        inspector_equipment: inspectorEquipment,
        unit_price_items_enabled: unitPriceItemsEnabled,
        unit_price_data: unitPriceData,
        created_by: userProfile?.id || null
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
          .from('daily_tickets')
          .update(reportData)
          .eq('id', currentReportId)
          .select()

        console.log('Update result:', { updateData, updateError, count })
        
        if (updateError) throw updateError
        
        if (!updateData || updateData.length === 0) {
          throw new Error('Update failed - no rows affected. Report ID may not exist.')
        }

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
            change_reason: editReason
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
            change_reason: editReason
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

        alert(`Report updated successfully! ${changes.length} field(s) changed.\n\nThe report has been resubmitted for review.`)
        
        // Return to appropriate page based on role
        if (currentUserRole === 'inspector') {
          window.location.href = '/inspector'
        } else if (currentUserRole === 'chief_inspector') {
          navigate('/chief')
        } else {
          navigate('/admin')
        }

      } else {
        // ==================== CREATE MODE ====================
        const { data: insertedTicket, error: dbError } = await supabase.from('daily_tickets').insert([reportData]).select('id').single()

        if (dbError) throw dbError

        const ticketId = insertedTicket.id
        setCurrentReportId(ticketId)

        // Log to audit trail
        await supabase.from('report_audit_log').insert({
          report_id: ticketId,
          report_date: selectedDate,
          changed_by: userProfile?.id,
          changed_by_name: inspectorName || userProfile?.email,
          changed_by_role: currentUserRole,
          change_type: 'create'
        })

        // Initialize report status as submitted (ready for Chief review)
        await supabase.from('report_status').insert({
          report_id: ticketId,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          submitted_by: userProfile?.id,
          submitted_by_name: inspectorName || userProfile?.email
        })

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
                from_kp: item.from_kp,
                to_kp: item.to_kp,
                kp_location: item.kp_location,
                mat_type: item.mat_type,
                mat_size: item.mat_size,
                fence_type: item.fence_type,
                fence_purpose: item.fence_purpose,
                side: item.side,
                ramp_type: item.ramp_type,
                gates_qty: item.gates_qty,
                landowner: item.landowner,
                notes: item.notes
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
    }

    const setColor = (color, type = 'fill') => {
      if (type === 'fill') doc.setFillColor(color[0], color[1], color[2])
      else if (type === 'text') doc.setTextColor(color[0], color[1], color[2])
      else if (type === 'draw') doc.setDrawColor(color[0], color[1], color[2])
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
      doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3)
      setColor(BRAND.gray, 'text')
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text('pipe-up.ca', margin, footerY)
      doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, footerY, { align: 'center' })
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, footerY, { align: 'right' })
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

    // BUILD PDF
    addHeader()
    y = 42

    // ═══════════════════════════════════════════════════════════
    // REPORT INFO - Two column layout
    // ═══════════════════════════════════════════════════════════
    setColor(BRAND.grayLight, 'fill')
    doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'F')
    setColor(BRAND.grayMid, 'draw')
    doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'S')
    
    const leftCol = margin + 5
    const rightCol = pageWidth / 2 + 5
    
    y += 6
    addField('Date', selectedDate, leftCol, 28)
    addField('Inspector', inspectorName, rightCol, 28)
    y += 6
    addField('Spread', spread, leftCol, 28)
    addField('Pipeline', pipeline, rightCol, 28)
    y += 6
    addField('Start Time', startTime, leftCol, 28)
    addField('End Time', stopTime, rightCol, 28)
    y += 14

    // ═══════════════════════════════════════════════════════════
    // WEATHER
    // ═══════════════════════════════════════════════════════════
    addSectionHeader('WEATHER CONDITIONS', BRAND.blue)
    
    setColor(BRAND.blueLight, 'fill')
    doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'F')
    y += 5
    addField('Conditions', weather, leftCol, 30)
    addField('Precipitation', `${precipitation || '0'} mm`, rightCol, 35)
    y += 6
    addField('High / Low', `${tempHigh || '--'}°C / ${tempLow || '--'}°C`, leftCol, 30)
    addField('Wind', `${windSpeed || '--'} km/h`, rightCol, 35)
    y += 8

    // ═══════════════════════════════════════════════════════════
    // ACTIVITIES
    // ═══════════════════════════════════════════════════════════
    activityBlocks.forEach((block, idx) => {
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

      // Activity details box
      setColor(BRAND.greenLight, 'fill')
      doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'F')
      y += 5
      addField('Contractor', block.contractor, leftCol, 28)
      addField('Foreman', block.foreman, rightCol, 28)
      y += 6
      addField('Start KP', block.startKP, leftCol, 28)
      addField('End KP', block.endKP, rightCol, 28)
      y += 6

      // Chainage warnings
      const overlapReason = chainageReasons[block.id]?.overlapReason
      const gapReason = chainageReasons[block.id]?.gapReason
      
      if (overlapReason) {
        checkPageBreak(12)
        setColor(BRAND.redLight, 'fill')
        doc.roundedRect(margin, y, contentWidth, 7, 1, 1, 'F')
        setColor(BRAND.red, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text('OVERLAP: ' + overlapReason.substring(0, 80), margin + 3, y + 4.5)
        y += 9
      }
      if (gapReason) {
        checkPageBreak(12)
        setColor(BRAND.orangeLight, 'fill')
        doc.roundedRect(margin, y, contentWidth, 7, 1, 1, 'F')
        setColor(BRAND.orange, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text('GAP: ' + gapReason.substring(0, 80), margin + 3, y + 4.5)
        y += 9
      }

      // Work Description
      if (block.workDescription) {
        checkPageBreak(20)
        addSubHeader('Work Description')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        const lines = doc.splitTextToSize(block.workDescription, contentWidth - 6)
        doc.text(lines.slice(0, 4), margin + 3, y)
        y += Math.min(lines.length, 4) * 4 + 2
      }

      // Quality Checks
      if (block.activityType && qualityFieldsByActivity[block.activityType] && Object.keys(block.qualityData || {}).length > 0) {
        checkPageBreak(20)
        addSubHeader('Quality Checks', BRAND.orangeLight)
        const fields = qualityFieldsByActivity[block.activityType]
        let fieldCount = 0
        fields.forEach(field => {
          const value = block.qualityData[field.name]
          if (value) {
            if (fieldCount > 0 && fieldCount % 2 === 0) y += 5
            const col = fieldCount % 2 === 0 ? leftCol : rightCol
            addField(field.label.substring(0, 18), value, col, 45)
            fieldCount++
          }
        })
        y += 6
      }

      // Manpower Table
      if (block.labourEntries?.length > 0) {
        checkPageBreak(30)
        addSubHeader('Manpower', BRAND.greenLight)
        
        // Table header
        setColor(BRAND.green, 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.text('EMPLOYEE', margin + 2, y + 3.5)
        doc.text('CLASSIFICATION', margin + 38, y + 3.5)
        doc.text('RT', pageWidth - margin - 36, y + 3.5)
        doc.text('OT', pageWidth - margin - 26, y + 3.5)
        doc.text('JH', pageWidth - margin - 16, y + 3.5)
        doc.text('QTY', pageWidth - margin - 8, y + 3.5)
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
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.text((entry.employeeName || '-').substring(0, 15), margin + 2, y + 3)
          doc.text((entry.classification || '').substring(0, 18), margin + 38, y + 3)
          doc.text(String(rt || 0), pageWidth - margin - 36, y + 3)
          doc.text(String(ot || 0), pageWidth - margin - 26, y + 3)
          doc.text(String(entry.jh || 0), pageWidth - margin - 16, y + 3)
          doc.text(String(entry.count || 1), pageWidth - margin - 8, y + 3)
          y += 5
        })
        y += 3
      }

      // Equipment Table
      if (block.equipmentEntries?.length > 0) {
        checkPageBreak(30)
        addSubHeader('Equipment', BRAND.blueLight)
        
        // Table header
        setColor(BRAND.blue, 'fill')
        doc.rect(margin, y, contentWidth, 5, 'F')
        setColor(BRAND.white, 'text')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.text('EQUIPMENT TYPE', margin + 2, y + 3.5)
        doc.text('HOURS', pageWidth - margin - 22, y + 3.5)
        doc.text('QTY', pageWidth - margin - 8, y + 3.5)
        y += 6
        
        // Table rows
        block.equipmentEntries.forEach((entry, i) => {
          checkPageBreak(8)
          if (i % 2 === 0) {
            setColor(BRAND.grayLight, 'fill')
            doc.rect(margin, y - 0.5, contentWidth, 5, 'F')
          }
          setColor(BRAND.black, 'text')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.text((entry.type || '').substring(0, 40), margin + 2, y + 3)
          doc.text(String(entry.hours || 0), pageWidth - margin - 22, y + 3)
          doc.text(String(entry.count || 1), pageWidth - margin - 8, y + 3)
          y += 5
        })
        y += 3
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
          doc.text(block.timeLostDetails.substring(0, 95), margin + 2, y)
          y += 5
        }
      }
      y += 5
    })

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
        doc.text(lines.slice(0, 3), margin + 2, y)
        y += Math.min(lines.length, 3) * 4 + 3
      }
      
      if (landEnvironment) {
        checkPageBreak(20)
        addSubHeader('Land & Environment')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const lines = doc.splitTextToSize(landEnvironment, contentWidth - 6)
        doc.text(lines.slice(0, 3), margin + 2, y)
        y += Math.min(lines.length, 3) * 4 + 3
      }
      
      if (generalComments) {
        checkPageBreak(20)
        addSubHeader('General Comments')
        setColor(BRAND.black, 'text')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const lines = doc.splitTextToSize(generalComments, contentWidth - 6)
        doc.text(lines.slice(0, 3), margin + 2, y)
        y += Math.min(lines.length, 3) * 4 + 3
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
          doc.text(lines.slice(0, 3), margin + 5, y)
          y += Math.min(lines.length, 3) * 4
        }
        
        // What could have happened (for hazard cards)
        if (card.cardType === 'safe' && card.whatCouldHaveHappened) {
          const lines = doc.splitTextToSize(`Potential Outcome: ${card.whatCouldHaveHappened}`, contentWidth - 10)
          doc.text(lines.slice(0, 2), margin + 5, y)
          y += Math.min(lines.length, 2) * 4
        }
        
        // Actions
        if (card.actions?.length > 0) {
          doc.text(`Actions (${card.actions.length}):`, margin + 5, y)
          y += 4
          card.actions.forEach((action, aIdx) => {
            if (action.action) {
              doc.text(`  • ${action.action} (By: ${action.byWhom || 'TBD'}, Due: ${action.dueDate || 'TBD'})`, margin + 8, y)
              y += 4
            }
          })
        }
        
        // Comments
        if (card.comments) {
          const lines = doc.splitTextToSize(`Comments: ${card.comments}`, contentWidth - 10)
          doc.text(lines.slice(0, 2), margin + 5, y)
          y += Math.min(lines.length, 2) * 4
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
          doc.text(lines.slice(0, 2), margin + 5, y)
          y += Math.min(lines.length, 2) * 4
        }
        
        // Mortality
        if (sighting.mortality === 'yes') {
          doc.setTextColor(220, 53, 69) // Red
          doc.text(`⚠️ MORTALITY: ${sighting.mortalityCause || 'Cause unknown'}`, margin + 5, y)
          doc.setTextColor(0, 0, 0)
          y += 4
        }
        
        // Comments
        if (sighting.comments) {
          const lines = doc.splitTextToSize(`Notes: ${sighting.comments}`, contentWidth - 10)
          doc.text(lines.slice(0, 2), margin + 5, y)
          y += Math.min(lines.length, 2) * 4
        }
        
        // Photo count
        if (sighting.photos?.length > 0) {
          doc.text(`📷 ${sighting.photos.length} photo(s) attached`, margin + 5, y)
          y += 4
        }
        
        y += 2
      })
      y += 2
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
    doc.save(filename)
  }

  // Export Master Production Spreadsheet (CLX2 Format)
  async function exportMasterProduction() {
    // Fetch all reports from database
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
      'Backfill', 'Hydro Test', 'Tie-in Completion', 'Cleanup - Machine', 'Cleanup - Final',
      'HDD', 'HD Bores', 'Other'
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

      {/* Header */}
      <div style={{ 
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
                  window.location.href = '/inspector'
                } else if (currentUserRole === 'chief_inspector') {
                  navigate('/chief')
                } else {
                  navigate('/admin')
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
                  navigate(`/inspector?edit=${e.target.value}`)
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
          
          <button
            onClick={signOut}
            style={{ padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
          >
            Sign Out
          </button>
        </div>
      </div>

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
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
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
            <input
              type="text"
              value={spread}
              onChange={(e) => setSpread(e.target.value)}
              placeholder="Spread number"
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>AFE #</label>
            <input
              type="text"
              value={afe}
              onChange={(e) => setAfe(e.target.value)}
              placeholder="AFE number"
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
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
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
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
              type="number"
              value={precipitation}
              onChange={(e) => setPrecipitation(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>High Temp (°C)</label>
            <input
              type="number"
              value={tempHigh}
              onChange={(e) => setTempHigh(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Low Temp (°C)</label>
            <input
              type="number"
              value={tempLow}
              onChange={(e) => setTempLow(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '11px', height: '32px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Wind (km/h)</label>
            <input
              type="number"
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
      <div style={{ 
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
        <button
          onClick={addActivityBlock}
          style={{ 
            padding: '12px 24px', 
            backgroundColor: '#28a745', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer', 
            fontSize: '15px', 
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        >
          + Add Activity
        </button>
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
          addLabourToBlock={addLabourToBlock}
          updateLabourJH={updateLabourJH}
          removeLabourFromBlock={removeLabourFromBlock}
          addEquipmentToBlock={addEquipmentToBlock}
          removeEquipmentFromBlock={removeEquipmentFromBlock}
          handleWorkPhotosSelect={handleWorkPhotosSelect}
          updatePhotoMetadata={updatePhotoMetadata}
          removeWorkPhoto={removeWorkPhoto}
          // For section toggle
          setActivityBlocks={setActivityBlocks}
          activityBlocks={activityBlocks}
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
            <p style={{ color: '#666', fontStyle: 'italic' }}>
              Trackable items tracking is currently being updated. Please use the Mat Tracker section for material tracking.
            </p>
          </div>
        )}
      </div>

      {/* SAFETY / ENVIRONMENT / COMMENTS */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #dee2e6' }}>
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

        {/* UNIT PRICE ITEMS TOGGLE */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>General Comments</label>
            <VoiceButton fieldId="generalComments" />
          </div>
          <textarea
            value={generalComments}
            onChange={(e) => setGeneralComments(e.target.value)}
            rows={3}
            placeholder="Other observations... (use 🎤 for voice input)"
            style={{ 
              width: '100%', 
              padding: '10px', 
              border: isListening === 'generalComments' ? '2px solid #dc3545' : '1px solid #ced4da', 
              borderRadius: '4px',
              backgroundColor: isListening === 'generalComments' ? '#fff5f5' : 'white'
            }}
          />
          {isListening === 'generalComments' && (
            <div style={{ marginTop: '5px', padding: '5px 10px', backgroundColor: '#f8d7da', borderRadius: '4px', fontSize: '12px', color: '#721c24' }}>
              🔴 Listening... Say "period", "comma" for punctuation. Click Stop when done.
            </div>
          )}
        </div>
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
              type="number"
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
      <div style={{ backgroundColor: '#e9ecef', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
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
        
        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => saveReport(false)}
            disabled={saving}
            style={{ 
              padding: '20px 60px', 
              backgroundColor: '#28a745', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: saving ? 'not-allowed' : 'pointer', 
              fontSize: '20px', 
              fontWeight: 'bold',
              boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
            }}
          >
            {saving ? '⏳ Submitting...' : '✅ Submit Report'}
          </button>
        </div>
        
        <p style={{ textAlign: 'center', margin: '15px 0 0 0', fontSize: '13px', color: '#666' }}>
          Submitting will save your report and send it to the Chief Inspector for review
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
    </div>
  )
}

export default InspectorReport
