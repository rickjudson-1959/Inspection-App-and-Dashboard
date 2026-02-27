// ActivityBlock.jsx - Extracted from InspectorReport.jsx
// A single activity block component with all rendering logic
import React, { useState, useEffect, useMemo, memo } from 'react'
import { activityTypes, qualityFieldsByActivity, labourClassifications, equipmentTypes, timeLostReasons, productionStatuses, dragReasonCategories, impactScopes, responsiblePartyConfig } from './constants.js'
import { syncKPFromGPS } from './kpUtils.js'
import { supabase } from './supabase'
import { useOrgQuery } from './utils/queryHelpers.js'
import { calculateShadowHours, calculateTotalBilledHours, calculateTotalShadowHours, calculateInertiaRatio, hasSystemicDelay, getDelayType } from './shadowAuditUtils.js'

// Specialized log components
import MainlineWeldData from './MainlineWeldData.jsx'
import BendingLog from './BendingLog.jsx'
import StringingLog from './StringingLog.jsx'
import CoatingLog from './CoatingLog.jsx'
import ClearingLog from './ClearingLog.jsx'
import HDDLog from './HDDLog.jsx'
import PilingLog from './PilingLog.jsx'
import EquipmentCleaningLog from './EquipmentCleaningLog.jsx'
import HydrovacLog from './HydrovacLog.jsx'
import WelderTestingLog from './WelderTestingLog.jsx'
import HydrotestLog from './HydrotestLog.jsx'
import TieInCompletionLog from './TieInCompletionLog.jsx'
import DitchInspection from './DitchInspection.jsx'
import GradingLog from './GradingLog.jsx'
import CounterboreTransitionLog from './CounterboreTransitionLog.jsx'
import MachineCleanupLog from './MachineCleanupLog.jsx'
import FinalCleanupLog from './FinalCleanupLog.jsx'
import ConventionalBoreLog from './ConventionalBoreLog.jsx'
import BufferedSearch from './components/BufferedSearch.jsx'
import ShieldedInput from './components/common/ShieldedInput.jsx'
import { useMentorAuditor } from './hooks/useMentorAuditor.js'
import { getTipsForActivity } from './agents/MentorTipService.js'
import MentorTipOverlay from './components/MentorTipOverlay.jsx'

const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

// Parse KP format to metres
function parseKPToMetres(kp) {
  if (!kp) return null
  const str = String(kp).trim()
  const match = str.match(/^(\d+)\+(\d+)$/)
  if (match) {
    return parseInt(match[1]) * 1000 + parseInt(match[2])
  }
  const num = parseFloat(str)
  if (!isNaN(num)) {
    return num >= 100 ? num : num * 1000
  }
  return null
}

// Format metres to KP
function formatMetresToKP(metres) {
  if (metres === null || metres === undefined) return ''
  const km = Math.floor(metres / 1000)
  const m = Math.round(metres % 1000)
  return `${km}+${m.toString().padStart(3, '0')}`
}

// Format KP input to X+XXX format
// Converts "6500" to "6+500", leaves "6+500" unchanged
export function formatKP(kp) {
  if (!kp) return ''
  const str = String(kp).trim()

  // Already in correct format (has +)
  if (str.includes('+')) return str

  // Pure number - convert to KP format
  const num = parseFloat(str)
  if (!isNaN(num)) {
    // If it's a small number like 6.5, treat as 6+500
    if (num < 100 && str.includes('.')) {
      const parts = str.split('.')
      const km = parseInt(parts[0])
      const m = parseInt((parts[1] || '0').padEnd(3, '0').substring(0, 3))
      return `${km}+${m.toString().padStart(3, '0')}`
    }
    // If it's a whole number >= 1000, convert (6500 -> 6+500)
    if (num >= 1000) {
      const km = Math.floor(num / 1000)
      const m = Math.round(num % 1000)
      return `${km}+${m.toString().padStart(3, '0')}`
    }
    // If it's a number < 1000, assume it's metres from KP 0 (500 -> 0+500)
    if (num > 0 && num < 1000) {
      return `0+${Math.round(num).toString().padStart(3, '0')}`
    }
  }

  return str
}

// Merge overlapping ranges for display
function mergeRanges(ranges) {
  if (!ranges || ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    if (sorted[i].start <= last.end + 50) {
      last.end = Math.max(last.end, sorted[i].end)
    } else {
      merged.push(sorted[i])
    }
  }
  return merged
}

// Get full reason config from drag reason (by label or value)
function getReasonConfig(dragReason) {
  if (!dragReason) return null
  return dragReasonCategories.find(
    r => r.label === dragReason || r.value === dragReason
  ) || null
}

// Get responsible party from drag reason (by label or value)
function getResponsibleParty(dragReason) {
  const reasonConfig = getReasonConfig(dragReason)
  if (!reasonConfig || !reasonConfig.responsibleParty) return null
  return responsiblePartyConfig[reasonConfig.responsibleParty] || null
}

// Check if reason requires note when Standby is selected
function reasonRequiresNote(dragReason) {
  const reasonConfig = getReasonConfig(dragReason)
  return reasonConfig?.requiresNote === true
}

// Check if reason should lock Impact Scope to Entire Crew
function reasonLocksSystemic(dragReason) {
  const reasonConfig = getReasonConfig(dragReason)
  return reasonConfig?.lockSystemic === true
}

// SearchableSelect component - type to filter dropdown
// Uses BufferedSearch for debounced filtering + focus shield
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  style = {}
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })
  const containerRef = React.useRef(null)

  // Filter options based on debounced filter text - matches all words in any order
  const filteredOptions = options.filter(opt => {
    if (!filterText.trim()) return true
    const optLower = opt.toLowerCase().replace(/-/g, ' ')
    const searchWords = filterText.toLowerCase().split(/\s+/).filter(w => w)
    return searchWords.every(word => optLower.includes(word))
  })

  // Close dropdown when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setFilterText('')
      }
    }
    const handleScroll = () => {
      if (isOpen) {
        setIsOpen(false)
        setFilterText('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOpen])

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightedIndex(0)
  }, [filterText])

  const handleSelect = (opt) => {
    onChange(opt)
    setIsOpen(false)
    setFilterText('')
  }

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        )
        e.preventDefault()
        break
      case 'ArrowUp':
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0)
        e.preventDefault()
        break
      case 'Enter':
        if (filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex])
        }
        e.preventDefault()
        break
      case 'Escape':
        setIsOpen(false)
        setFilterText('')
        break
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      <div
        tabIndex={0}
        onClick={() => {
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 280) })
          }
          setIsOpen(true)
        }}
        onFocus={() => {
          if (!isOpen) {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect()
              setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 280) })
            }
            setIsOpen(true)
          }
        }}
        onKeyDown={(e) => {
          if (!isOpen && (e.key === 'Enter' || e.key === ' ')) {
            setIsOpen(true)
            e.preventDefault()
          }
        }}
        style={{
          width: '100%',
          padding: '8px',
          border: '1px solid #ced4da',
          borderRadius: '4px',
          backgroundColor: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          minHeight: '38px'
        }}
      >
        {isOpen ? (
          <BufferedSearch
            value={filterText}
            onSearch={(text) => setFilterText(text)}
            onKeyDown={handleKeyDown}
            placeholder="Type to search..."
            autoFocus
            debounceMs={150}
            style={{
              border: 'none',
              outline: 'none',
              width: '100%',
              fontSize: '14px',
              padding: 0,
              backgroundColor: 'transparent'
            }}
          />
        ) : (
          <span style={{
            color: value ? '#333' : '#999',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '14px'
          }}>
            {value || placeholder}
          </span>
        )}
        <span style={{ marginLeft: '8px', color: '#666' }}>▼</span>
      </div>

      {isOpen && (
        <div style={{
          position: 'fixed',
          top: dropdownPos.top,
          left: dropdownPos.left,
          width: dropdownPos.width,
          backgroundColor: '#fff',
          border: '1px solid #ced4da',
          borderRadius: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          maxHeight: '250px',
          overflowY: 'auto'
        }}>
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '10px', color: '#999', textAlign: 'center', fontSize: '13px' }}>
              No matches found
            </div>
          ) : (
            filteredOptions.map((opt, idx) => (
              <div
                key={opt}
                onClick={() => handleSelect(opt)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  backgroundColor: idx === highlightedIndex ? '#e3f2fd' :
                                   opt === value ? '#f5f5f5' : '#fff',
                  borderBottom: idx < filteredOptions.length - 1 ? '1px solid #f0f0f0' : 'none',
                  fontSize: '13px'
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                {opt}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// SearchableNameInput - free-text input with autocomplete dropdown
// Allows typing new names OR selecting from known crew names
function SearchableNameInput({ value, onChange, suggestions, placeholder = 'Name', style = {} }) {
  const [isFocused, setIsFocused] = useState(false)
  const [filterText, setFilterText] = useState('')
  const containerRef = React.useRef(null)

  const filtered = suggestions.filter(name => {
    const search = (filterText || value || '').toLowerCase()
    if (!search) return true
    return name.toLowerCase().includes(search)
  })

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsFocused(false)
        setFilterText('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const showDropdown = isFocused && filtered.length > 0 && (filterText || value || '').length > 0

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => {
          onChange(e.target.value)
          setFilterText(e.target.value)
          setIsFocused(true)
        }}
        onFocus={() => {
          setIsFocused(true)
          setFilterText(value || '')
        }}
        placeholder={placeholder}
        style={{ width: '100%', padding: '4px', border: '1px solid #ced4da', borderRadius: '3px', fontSize: '12px', boxSizing: 'border-box' }}
      />
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          border: '1px solid #ced4da',
          borderRadius: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          maxHeight: '180px',
          overflowY: 'auto',
          marginTop: '2px'
        }}>
          {filtered.slice(0, 10).map(name => (
            <div
              key={name}
              onClick={() => {
                onChange(name)
                setIsFocused(false)
                setFilterText('')
              }}
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                backgroundColor: name === value ? '#e3f2fd' : '#fff',
                borderBottom: '1px solid #f0f0f0',
                fontSize: '12px'
              }}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActivityBlock({
  block,
  blockIndex,
  // Context data
  selectedDate,
  spread,
  afe,
  weather,
  tempHigh,
  tempLow,
  inspectorName,
  // Audit trail props
  reportId,
  currentUser,
  // Chainage status
  blockChainageStatus,
  chainageReasons,
  setChainageReasons,
  // Voice state
  isListening,
  VoiceButton,
  // Handlers
  updateActivityBlock,
  removeActivityBlock,
  updateQualityData,
  updateWeldData,
  updateBendData,
  updateStringData,
  updateCoatingData,
  updateClearingData,
  updateHDDData,
  updatePilingData,
  updateCleaningLogData,
  updateHydrovacData,
  updateWelderTestingData,
  updateHydrotestData,
  updateTieInCompletionData,
  updateDitchData,
  updateGradingData,
  updateCounterboreData,
  updateMachineCleanupData,
  updateFinalCleanupData,
  updateConventionalBoreData,
  addLabourToBlock,
  updateLabourField,
  updateLabourJH,
  updateLabourProductionStatus,
  updateLabourShadowHours,
  updateLabourDragReason,
  updateLabourContractorNote,
  removeLabourFromBlock,
  addEquipmentToBlock,
  updateEquipmentField,
  updateEquipmentProductionStatus,
  updateEquipmentShadowHours,
  updateEquipmentDragReason,
  updateEquipmentContractorNote,
  updateEquipmentUnitNumber,
  updateSystemicDelay,
  removeEquipmentFromBlock,
  handleWorkPhotosSelect,
  updatePhotoMetadata,
  removeWorkPhoto,
  // For section toggle
  setActivityBlocks,
  activityBlocks,
  // Mentor agent props
  organizationId,
  onMentorAlert
}) {
  // Org-scoped query hook
  const { addOrgFilter } = useOrgQuery()

  // Mentor agent: real-time field auditing
  const mentor = useMentorAuditor({
    activityType: block.activityType,
    blockId: String(block.id),
    reportId,
    organizationId,
    userId: currentUser?.id
  })

  // Local state for input fields
  const [currentLabour, setCurrentLabour] = useState({
    employeeName: '',
    classification: '',
    rt: '',
    ot: '',
    jh: '',
    count: '1'
  })
  const [currentEquipment, setCurrentEquipment] = useState({ type: '', hours: '', count: '', unitNumber: '' })
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [ocrError, setOcrError] = useState(null)
  const [ocrSuccess, setOcrSuccess] = useState(false)
  const [showTicketPhoto, setShowTicketPhoto] = useState(false)
  
  // Build known crew names from all blocks + localStorage for autocomplete
  const knownCrewNames = useMemo(() => {
    const names = new Set()
    // Collect from all activity blocks in this report
    if (activityBlocks) {
      activityBlocks.forEach(b => {
        b.labourEntries?.forEach(e => {
          if (e.employeeName?.trim()) names.add(e.employeeName.trim())
        })
      })
    }
    // Merge with saved crew roster from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('pipeup_crew_roster') || '[]')
      saved.forEach(n => names.add(n))
    } catch {}
    return [...names].sort()
  }, [activityBlocks])

  // Persist new names to localStorage crew roster
  useEffect(() => {
    if (knownCrewNames.length > 0) {
      try {
        const saved = JSON.parse(localStorage.getItem('pipeup_crew_roster') || '[]')
        const merged = [...new Set([...saved, ...knownCrewNames])].sort()
        localStorage.setItem('pipeup_crew_roster', JSON.stringify(merged))
      } catch {}
    }
  }, [knownCrewNames])

  // Track which labour/equipment rows have their flag panel open
  const [openFlagRows, setOpenFlagRows] = useState({})
  const toggleFlagRow = (entryId) => {
    setOpenFlagRows(prev => ({ ...prev, [entryId]: !prev[entryId] }))
  }

  // Collapsible QA sections state (for Access activity)
  const [expandedSections, setExpandedSections] = useState({})
  
  const toggleSection = (sectionName) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }))
  }

  // Propagate mentor alerts to parent
  useEffect(() => {
    if (onMentorAlert) {
      onMentorAlert(block.id, mentor.alerts)
    }
  }, [mentor.alerts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mentor tips: fetch when activity type changes
  const [mentorTips, setMentorTips] = useState([])
  const [showMentorTips, setShowMentorTips] = useState(false)

  useEffect(() => {
    if (!block.activityType || !organizationId) {
      setMentorTips([])
      setShowMentorTips(false)
      return
    }

    // Temporarily disabled mentor tips to avoid OpenAI API errors during threshold testing
    // TODO: Re-enable after implementing server-side edge function for tip generation
    /*
    // Check localStorage for "don't show again" preference
    const dismissed = localStorage.getItem(`mentor_tips_dismissed_${block.activityType}`)
    if (dismissed === 'true') return

    getTipsForActivity(block.activityType, organizationId).then(tips => {
      if (tips.length > 0) {
        setMentorTips(tips)
        setShowMentorTips(true)
      }
    })
    */
  }, [block.activityType, organizationId])

  // GPS KP Sync state
  const [syncingKP, setSyncingKP] = useState(false)
  const [kpSyncToast, setKpSyncToast] = useState(null) // { type: 'success' | 'warning' | 'error', message: string }

  // Track if we've already auto-populated GD fields - removed, using onBlur instead
  
  // Track if previous data has been loaded
  const [previousDataLoaded, setPreviousDataLoaded] = useState(false)

  // Delay reason autocomplete state
  const [showReasonSuggestions, setShowReasonSuggestions] = useState(false)
  const [reasonInputValue, setReasonInputValue] = useState('')
  const [customReasons, setCustomReasons] = useState(() => {
    try {
      const saved = localStorage.getItem('customDelayReasons')
      return saved ? JSON.parse(saved) : []
    } catch (e) {
      return []
    }
  })

  // Combined list of all reasons (default + custom)
  const allReasons = [
    ...dragReasonCategories,
    ...customReasons.map(r => ({ value: r, label: r, defaultSystemic: false, isCustom: true }))
  ]

  // Filter suggestions based on input
  const filteredSuggestions = reasonInputValue
    ? allReasons.filter(r => r.label.toLowerCase().includes(reasonInputValue.toLowerCase()))
    : allReasons

  // Save custom reason to localStorage
  const saveCustomReason = (reason) => {
    if (!reason || reason.trim() === '') return
    const trimmed = reason.trim()
    // Check if it already exists in default or custom reasons
    const existsInDefault = dragReasonCategories.some(r => r.label.toLowerCase() === trimmed.toLowerCase())
    const existsInCustom = customReasons.some(r => r.toLowerCase() === trimmed.toLowerCase())
    if (!existsInDefault && !existsInCustom) {
      const updated = [...customReasons, trimmed]
      setCustomReasons(updated)
      try {
        localStorage.setItem('customDelayReasons', JSON.stringify(updated))
      } catch (e) {
        // localStorage may be blocked in incognito
      }
    }
  }

  // Status button tooltips
  const statusTooltips = {
    SYNC_DELAY: 'Sync Delay: Crew is waiting but may do limited work - coordination issues, waiting for materials/equipment to arrive, minor holdups. Counts as 70% productive time.',
    MANAGEMENT_DRAG: 'Management Drag: Complete work stoppage due to decisions outside crew control - permits, regulatory holds, waiting for instructions, environmental windows. Counts as 0% productive time.'
  }

  // Delay reason examples tooltip
  const delayReasonExamples = `Common delay reasons (you can type your own):
• Waiting for permits
• Waiting for instructions
• Waiting for materials
• Coordination delay
• Weather hold
• Safety stand-down
• Equipment breakdown
• First Nations monitor
• Bird nesting window
• Environmental window
• Landowner access issue
• Regulatory hold`

  // Sync reason input with block's systemic delay reason
  useEffect(() => {
    const reason = block.systemicDelay?.reason || ''
    // Find the label for this reason value
    const reasonConfig = dragReasonCategories.find(r => r.value === reason) ||
      customReasons.map(r => ({ value: r, label: r })).find(r => r.value === reason)
    setReasonInputValue(reasonConfig?.label || reason)
  }, [block.systemicDelay?.reason, customReasons])

  // Load previous metres and holes from historical reports when activity type changes
  useEffect(() => {
    if (!block.activityType || !selectedDate || previousDataLoaded) return
    
    const loadPreviousData = async () => {
      try {
        console.log(`Loading previous data for ${block.activityType}, date < ${selectedDate}`)
        
        // Fetch all previous reports (org-scoped)
        const { data: reports, error } = await addOrgFilter(
          supabase
            .from('daily_reports')
            .select('activity_blocks, date')
            .lt('date', selectedDate)
        ).order('date', { ascending: false })
        
        if (error) {
          console.error('Error fetching previous data:', error)
          return
        }
        
        console.log(`Found ${reports?.length || 0} previous reports`)
        
        // Sum up metres and holes for matching activity type
        let totalPreviousMetres = 0
        let totalParallelHoles = 0
        let totalCrossingHoles = 0
        
        if (reports) {
          for (const report of reports) {
            const blocks = report.activity_blocks || []
            for (const b of blocks) {
              if (b.activityType === block.activityType) {
                // Metres - try metersToday first, then calculate from KP
                let metres = parseFloat(b.metersToday) || 0
                if (metres === 0 && b.startKP && b.endKP) {
                  const startM = parseKPToMetres(b.startKP)
                  const endM = parseKPToMetres(b.endKP)
                  if (startM !== null && endM !== null) {
                    metres = Math.abs(endM - startM)
                  }
                }
                totalPreviousMetres += metres
                console.log(`  Report ${report.date}: ${b.startKP}-${b.endKP} = ${metres}m`)
                
                // Holes from qualityData
                if (b.qualityData) {
                  const parallel = parseFloat(b.qualityData.parallelHolesToday) || 0
                  const crossing = parseFloat(b.qualityData.crossingHolesToday) || 0
                  totalParallelHoles += parallel
                  totalCrossingHoles += crossing
                  console.log(`  Holes: ${parallel} parallel, ${crossing} crossing`)
                }
              }
            }
          }
        }
        
        console.log(`TOTALS for ${block.activityType}: ${totalPreviousMetres}m, ${totalParallelHoles} parallel holes, ${totalCrossingHoles} crossing holes`)
        
        // Update previous fields
        if (totalPreviousMetres > 0) {
          console.log(`Calling updateBlock for metersPrevious: ${totalPreviousMetres}`)
          updateBlock(block.id, 'metersPrevious', totalPreviousMetres.toString())
        }
        
        // Update previous holes for Ground Disturbance
        if (block.activityType === 'Ground Disturbance') {
          if (totalParallelHoles > 0) {
            console.log(`Calling updateQualityData for parallelHolesPrevious: ${totalParallelHoles}`)
            updateQualityData(block.id, 'parallelHolesPrevious', totalParallelHoles.toString())
          }
          if (totalCrossingHoles > 0) {
            console.log(`Calling updateQualityData for crossingHolesPrevious: ${totalCrossingHoles}`)
            updateQualityData(block.id, 'crossingHolesPrevious', totalCrossingHoles.toString())
          }
        }
        
        setPreviousDataLoaded(true)
      } catch (err) {
        console.error('Error loading previous data:', err)
      }
    }
    
    loadPreviousData()
  }, [block.activityType, selectedDate, previousDataLoaded])

  // Handle GPS KP Sync
  const handleSyncKP = async (field = 'startKP') => {
    setSyncingKP(true)
    setKpSyncToast(null)

    try {
      const result = await syncKPFromGPS('main') // Use main pipeline

      if (!result.success) {
        setKpSyncToast({ type: 'error', message: result.error })
        return
      }

      // Update the KP field
      updateBlock(block.id, field, result.kpFormatted)

      // Show appropriate toast
      if (result.warning) {
        setKpSyncToast({ 
          type: 'warning', 
          message: result.warning,
          detail: `Synced to ${result.kpFormatted} (${result.distanceFromROW}m from ROW)`
        })
      } else {
        setKpSyncToast({ 
          type: 'success', 
          message: `KP synced to ${result.kpFormatted}`,
          detail: result.isOnROW 
            ? `✓ On ROW (${result.distanceFromROW}m from centerline)`
            : `${result.distanceFromROW}m from ROW centerline`
        })
      }

      // Auto-hide success toast after 4 seconds
      if (!result.warning) {
        setTimeout(() => setKpSyncToast(null), 4000)
      }

    } catch (err) {
      setKpSyncToast({ type: 'error', message: err.message || 'Failed to sync KP' })
    } finally {
      setSyncingKP(false)
    }
  }

  // Helper: updateBlock shorthand
  const updateBlock = (blockId, field, value) => updateActivityBlock(blockId, field, value)

  // Helper to calculate meters today from KP
  const calculateMetersToday = (block) => {
    if (block.startKP && block.endKP) {
      const startM = parseKPToMetres(block.startKP)
      const endM = parseKPToMetres(block.endKP)
      if (startM !== null && endM !== null) {
        return Math.abs(endM - startM).toFixed(0)
      }
    }
    return ''
  }

  // OCR Processing for contractor tickets (supports multiple pages)
  const processTicketOCR = async (blockId, imageFiles) => {
    const newFiles = Array.isArray(imageFiles) ? imageFiles : [imageFiles]
    setOcrProcessing(true)
    setOcrError(null)
    setOcrSuccess(false)

    // Append new photos to any existing ones (supports adding pages one at a time)
    const existingPhotos = block.ticketPhotos || (block.ticketPhoto ? [block.ticketPhoto] : [])
    // Only keep existing File objects (not saved URLs from DB)
    const existingFiles = existingPhotos.filter(p => p instanceof File)
    const allFiles = [...existingFiles, ...newFiles]

    // Save accumulated photos (first file as ticketPhoto for backward compat)
    if (!block.ticketPhoto || !(block.ticketPhoto instanceof File)) {
      updateBlock(blockId, 'ticketPhoto', allFiles[0])
    }
    updateBlock(blockId, 'ticketPhotos', allFiles)

    // OCR only processes the NEW photos to avoid duplicating entries from previous pages
    const files = newFiles

    try {
      // Convert all images to base64
      const imageContents = await Promise.all(files.map(file => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve({
            type: 'image',
            source: { type: 'base64', media_type: file.type, data: reader.result.split(',')[1] }
          })
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      }))

      const pageNote = files.length > 1
        ? `\n\nThis ticket spans ${files.length} pages/photos. Combine ALL labour and equipment from ALL pages into a single unified list. Do not duplicate entries that appear on multiple pages.`
        : ''

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
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              ...imageContents,
              {
                type: 'text',
                text: `Extract labour and equipment data from this contractor daily ticket. Return JSON only:
{
  "ticketNumber": "string or null",
  "contractor": "string or null",
  "foreman": "string or null",
  "labour": [{"name": "employee full name", "classification": "string", "rt": number, "ot": number, "count": 1}],
  "equipment": [{"type": "string", "hours": number, "count": 1, "unitNumber": "string or null"}]
}

CRITICAL - Individual Entries Required:
- List EVERY person as a SEPARATE entry with their full name. Do NOT group workers together.
- If the ticket shows "John Smith - Labourer - 10hrs" and "Mike Jones - Labourer - 10hrs", return TWO separate entries, not one entry with count: 2.
- List EVERY piece of equipment as a SEPARATE entry. Do NOT group equipment together.
- Each entry must have count: 1. Never use count > 1.
- Extract the employee's full name exactly as written on the ticket.

For equipment unitNumber, extract the unit number, asset ID, or fleet number if visible on the ticket (e.g., "U-1234", "EQ-507", "Unit 42").

Match classifications to: ${labourClassifications.slice(0, 20).join(', ')}...
Match equipment to: ${equipmentTypes.slice(0, 20).join(', ')}...${pageNote}`
              }
            ]
          }]
        })
      })
      
      if (!response.ok) throw new Error('API request failed')
      
      const result = await response.json()
      const text = result.content[0].text
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])

        if (data.ticketNumber) updateBlock(blockId, 'ticketNumber', data.ticketNumber)
        if (data.contractor) updateBlock(blockId, 'contractor', data.contractor)
        if (data.foreman) updateBlock(blockId, 'foreman', data.foreman)

        // Dedup: check existing entries to avoid doubling when same ticket is scanned twice
        const existingLabour = block.labourEntries || []
        const existingEquipment = block.equipmentEntries || []

        if (data.labour && Array.isArray(data.labour)) {
          data.labour.forEach(l => {
            if (l.classification) {
              // Skip if an entry with same name + classification already exists
              const isDuplicate = existingLabour.some(
                e => (e.employeeName || '').toLowerCase() === (l.name || '').toLowerCase() &&
                     (e.classification || '').toLowerCase() === (l.classification || '').toLowerCase()
              )
              if (!isDuplicate) {
                addLabourToBlock(blockId, l.name || '', l.classification, l.rt || 0, l.ot || 0, 0, 1)
              }
            }
          })
        }

        if (data.equipment && Array.isArray(data.equipment)) {
          data.equipment.forEach(e => {
            if (e.type) {
              // Skip if an entry with same type + unit number already exists
              const isDuplicate = existingEquipment.some(
                ex => (ex.type || '').toLowerCase() === (e.type || '').toLowerCase() &&
                      (ex.unitNumber || '').toLowerCase() === (e.unitNumber || '').toLowerCase()
              )
              if (!isDuplicate) {
                addEquipmentToBlock(blockId, e.type, e.hours || 0, 1, e.unitNumber || '')
              }
            }
          })
        }

        setOcrSuccess(true)
      }
    } catch (err) {
      console.error('OCR Error:', err)
      setOcrError('Failed to process ticket. Please enter data manually.')
    } finally {
      setOcrProcessing(false)
    }
  }

  // Render quality fields for an activity
  const renderQualityFields = () => {
    if (!block.activityType) {
      return <p style={{ color: '#666', fontStyle: 'italic' }}>Select an activity type to see quality checks</p>
    }

    // Use appropriate weld component based on activity type
    if (block.activityType === 'Welding - Tie-in') {
      return (
        <CounterboreTransitionLog
          data={block.counterboreData || {}}
          onChange={(data) => updateCounterboreData(block.id, data)}
          contractor={block.contractor}
          foreman={block.foreman}
          reportDate={selectedDate}
          startKP={block.startKP}
          endKP={block.endKP}
          spread={spread}
          afe={afe}
        />
      )
    }

    if (block.activityType === 'Welding - Mainline' || block.activityType === 'Welding - Section Crew' || block.activityType === 'Welding - Poor Boy') {
      return (
        <MainlineWeldData
          contractor={block.contractor}
          foreman={block.foreman}
          blockId={block.id}
          reportId={reportId}
          reportDate={selectedDate}
          currentUser={currentUser}
          existingData={block.weldData || {}}
          onDataChange={(data) => updateWeldData(block.id, data)}
        />
      )
    }

    if (block.activityType === 'Bending') {
      return (
        <BendingLog
          contractor={block.contractor}
          foreman={block.foreman}
          blockId={block.id}
          reportId={reportId}
          reportDate={selectedDate}
          currentUser={currentUser}
          existingData={block.bendingData || {}}
          onDataChange={(data) => updateBendData(block.id, data)}
        />
      )
    }

    if (block.activityType === 'Stringing') {
      return (
        <StringingLog
          contractor={block.contractor}
          foreman={block.foreman}
          blockId={block.id}
          reportId={reportId}
          reportDate={selectedDate}
          currentUser={currentUser}
          existingData={block.stringingData || {}}
          onDataChange={(data) => updateStringData(block.id, data)}
        />
      )
    }

    if (block.activityType === 'Coating' || block.activityType === 'Tie-in Coating') {
      return (
        <CoatingLog
          contractor={block.contractor}
          foreman={block.foreman}
          blockId={block.id}
          reportId={reportId}
          reportDate={selectedDate}
          currentUser={currentUser}
          existingData={block.coatingData || {}}
          onDataChange={(data) => updateCoatingData(block.id, data)}
        />
      )
    }

    if (block.activityType === 'Clearing') {
      return (
        <ClearingLog
          contractor={block.contractor}
          foreman={block.foreman}
          blockId={block.id}
          reportId={reportId}
          reportDate={selectedDate}
          currentUser={currentUser}
          organizationId={organizationId}
          mentorAuditor={mentor}
          existingData={block.clearingData || {}}
          onDataChange={(data) => updateClearingData(block.id, data)}
        />
      )
    }

    if (block.activityType === 'HDD') {
      return (
        <HDDLog
          data={block.hddData || {}}
          onChange={(data) => updateHDDData(block.id, data)}
          contractor={block.contractor}
          foreman={block.foreman}
          reportDate={selectedDate}
          startKP={block.startKP}
          endKP={block.endKP}
          metersToday={calculateMetersToday(block)}
          logId={block.id}
          reportId={reportId}
          organizationId={organizationId}
          mentorAuditor={mentor}
        />
      )
    }

    if (block.activityType === 'HD Bores') {
      return (
        <ConventionalBoreLog
          data={block.conventionalBoreData || {}}
          onChange={(data) => updateConventionalBoreData(block.id, data)}
          contractor={block.contractor}
          foreman={block.foreman}
          reportDate={selectedDate}
          startKP={block.startKP}
          endKP={block.endKP}
          metersToday={calculateMetersToday(block)}
          logId={block.id}
          reportId={reportId}
        />
      )
    }

    if (block.activityType === 'Piling') {
      return (
        <PilingLog
          data={block.pilingData || {}}
          onChange={(data) => updatePilingData(block.id, data)}
        />
      )
    }

    if (block.activityType === 'Equipment Cleaning') {
      return (
        <EquipmentCleaningLog
          data={block.cleaningLogData || {}}
          onChange={(data) => updateCleaningLogData(block.id, data)}
          inspector={inspectorName}
          reportDate={selectedDate}
        />
      )
    }

    if (block.activityType === 'Hydrovac') {
      return (
        <HydrovacLog
          data={block.hydrovacData || {}}
          onChange={(data) => updateHydrovacData(block.id, data)}
        />
      )
    }

    if (block.activityType === 'Welder Testing') {
      return (
        <WelderTestingLog
          data={block.welderTestingData || {}}
          onChange={(data) => updateWelderTestingData(block.id, data)}
          spread={spread}
          weather={weather}
          tempHigh={tempHigh}
          tempLow={tempLow}
          contractor={block.contractor}
          foreman={block.foreman}
        />
      )
    }

    if (block.activityType === 'Hydrostatic Testing') {
      return (
        <HydrotestLog
          data={block.hydrotestData || {}}
          onChange={(data) => updateHydrotestData(block.id, data)}
          contractor={block.contractor}
          foreman={block.foreman}
          reportDate={selectedDate}
          startKP={block.startKP}
          endKP={block.endKP}
          metersToday={calculateMetersToday(block)}
          logId={block.id}
          reportId={reportId}
        />
      )
    }

    if (block.activityType === 'Ditch') {
      return (
        <DitchInspection
          data={block.ditchData || {}}
          onChange={(data) => updateDitchData(block.id, data)}
          contractor={block.contractor}
          foreman={block.foreman}
          reportDate={selectedDate}
          startKP={block.startKP}
          endKP={block.endKP}
          metersToday={calculateMetersToday(block)}
          logId={block.id}
          reportId={reportId}
        />
      )
    }

    if (block.activityType === 'Grading') {
      return (
        <GradingLog
          data={block.gradingData || {}}
          onChange={(data) => updateGradingData(block.id, data)}
          contractor={block.contractor}
          foreman={block.foreman}
          reportDate={selectedDate}
          startKP={block.startKP}
          endKP={block.endKP}
          metersToday={calculateMetersToday(block)}
        />
      )
    }

    if (block.activityType === 'Tie-in Backfill') {
      return (
        <TieInCompletionLog
          data={block.tieInCompletionData || {}}
          onChange={(data) => updateTieInCompletionData(block.id, data)}
          contractor={block.contractor}
          foreman={block.foreman}
          reportDate={selectedDate}
          startKP={block.startKP}
          endKP={block.endKP}
          metersToday={calculateMetersToday(block)}
        />
      )
    }

    if (block.activityType === 'Cleanup - Machine') {
      return (
        <MachineCleanupLog
          data={block.machineCleanupData || {}}
          onChange={(data) => updateMachineCleanupData(block.id, data)}
          contractor={block.contractor}
          foreman={block.foreman}
          reportDate={selectedDate}
          startKP={block.startKP}
          endKP={block.endKP}
          metersToday={calculateMetersToday(block)}
          logId={block.id}
          reportId={reportId}
        />
      )
    }

    if (block.activityType === 'Cleanup - Final') {
      return (
        <FinalCleanupLog
          data={block.finalCleanupData || {}}
          onChange={(data) => updateFinalCleanupData(block.id, data)}
          contractor={block.contractor}
          foreman={block.foreman}
          reportDate={selectedDate}
          startKP={block.startKP}
          endKP={block.endKP}
          metersToday={calculateMetersToday(block)}
          logId={block.id}
          reportId={reportId}
        />
      )
    }

    // Default quality fields
    if (!qualityFieldsByActivity[block.activityType]) {
      return <p style={{ color: '#666', fontStyle: 'italic' }}>No quality checks defined for this activity</p>
    }

    const fields = qualityFieldsByActivity[block.activityType]
    if (fields.length === 0) {
      return <p style={{ color: '#666', fontStyle: 'italic' }}>Quality data handled by specialized component</p>
    }

    // Separate core fields from collapsible sections
    const coreFields = fields.filter(f => f.type !== 'collapsible' && f.type !== 'info')
    const collapsibleSections = fields.filter(f => f.type === 'collapsible')
    const infoFields = fields.filter(f => f.type === 'info')
    
    return (
      <div>
        {/* Core fields in a responsive row */}
        {coreFields.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '15px',
            marginBottom: '15px'
          }}>
            {coreFields.map(field => renderSingleField(field, block))}
          </div>
        )}
        
        {/* Collapsible sections */}
        {collapsibleSections.map(field => {
          const isExpanded = expandedSections[field.name]
          const hasData = field.fields?.some(f => block.qualityData[f.name])
          
          return (
            <div key={field.name} style={{ 
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              marginBottom: '10px',
              overflow: 'hidden'
            }}>
              <div 
                onClick={() => toggleSection(field.name)}
                style={{
                  padding: '12px 15px',
                  backgroundColor: isExpanded ? '#e9ecef' : '#f8f9fa',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: isExpanded ? '1px solid #dee2e6' : 'none'
                }}
              >
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
                  {field.label}
                  {hasData && <span style={{ color: '#28a745', marginLeft: '8px' }}>●</span>}
                </span>
                <span style={{ fontSize: '12px', color: '#6c757d' }}>
                  {isExpanded ? '▼ Collapse' : '▶ Expand'}
                </span>
              </div>
              
              {isExpanded && (
                <div style={{ 
                  padding: '15px',
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                  gap: '15px' 
                }}>
                  {field.fields?.map(subField => renderSingleField(subField, block))}
                </div>
              )}
            </div>
          )
        })}
        
        {/* Info notes */}
        {infoFields.map(field => (
          <div key={field.name} style={{
            padding: '10px 15px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '6px',
            marginTop: '10px',
            fontSize: '13px',
            color: '#856404'
          }}>
            {field.label}
          </div>
        ))}
      </div>
    )
  }
  
  // Helper function to render a single field
  const renderSingleField = (field, block) => {
    // Skip header types (legacy)
    if (field.type === 'header') {
      return null
    }
    
    // Special handling for crossing verifications
    if (field.type === 'crossing-verifications') {
      return (
        <div key={field.name} style={{ gridColumn: '1 / -1' }}>
          {renderCrossingVerifications(block)}
        </div>
      )
    }
    // Textarea handling
    if (field.type === 'textarea') {
      return (
        <div key={field.name} style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>{field.label}</label>
          <ShieldedInput
            as="textarea"
            value={block.qualityData[field.name] || ''}
            onChange={(val) => updateQualityData(block.id, field.name, val)}
            placeholder={field.placeholder || ''}
            rows={3}
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>
      )
    }
    
    return (
      <div key={field.name} style={{
        padding: '12px',
        backgroundColor: '#f8f9fa',
        borderRadius: '6px',
        border: '1px solid #dee2e6',
        minHeight: '80px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', lineHeight: '1.3' }}>{field.label}</label>
        {field.type === 'select' ? (
          <select
            value={block.qualityData[field.name] || ''}
            onChange={(e) => {
              updateQualityData(block.id, field.name, e.target.value)
              // Show reminder popup if field has reminder and value is Yes
              if (field.reminder && e.target.value === 'Yes') {
                alert(field.reminder)
              }
            }}
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', backgroundColor: 'white', boxSizing: 'border-box' }}
          >
            <option value="">Select...</option>
            {field.options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <input
            type={field.type === 'number' ? 'text' : field.type}
            inputMode={field.type === 'number' ? 'decimal' : undefined}
            value={
              // For To Date fields, calculate dynamically
              field.name === 'parallelHolesToDate'
                ? (block.qualityData.parallelHolesToday
                    ? (parseFloat(block.qualityData.parallelHolesToday) || 0) + (parseFloat(block.qualityData.parallelHolesPrevious) || 0)
                    : '')
                : field.name === 'crossingHolesToDate'
                ? (block.qualityData.crossingHolesToday
                    ? (parseFloat(block.qualityData.crossingHolesToday) || 0) + (parseFloat(block.qualityData.crossingHolesPrevious) || 0)
                    : '')
                : (block.qualityData[field.name] || '')
            }
            readOnly={field.readOnly}
            onChange={(e) => {
              updateQualityData(block.id, field.name, e.target.value)
              // Auto-calculate To Date for holes
              if (field.name === 'parallelHolesToday') {
                const today = parseFloat(e.target.value) || 0
                const previous = parseFloat(block.qualityData.parallelHolesPrevious) || 0
                updateQualityData(block.id, 'parallelHolesToDate', (today + previous).toString())
              }
              if (field.name === 'crossingHolesToday') {
                const today = parseFloat(e.target.value) || 0
                const previous = parseFloat(block.qualityData.crossingHolesPrevious) || 0
                updateQualityData(block.id, 'crossingHolesToDate', (today + previous).toString())
              }
            }}
            onBlur={(e) => {
              // Mentor agent: audit field on blur (post-sync moment)
              if (field.type === 'number' && e.target.value) {
                mentor.auditField(field.name, e.target.value)
              }
            }}
            placeholder={field.placeholder || ''}
            style={{
              width: '100%',
              padding: '10px',
              border: field.highlight ? '2px solid #28a745' : '1px solid #ced4da',
              borderRadius: '4px',
              backgroundColor: field.readOnly ? '#e9ecef' : 'white',
              boxSizing: 'border-box'
            }}
          />
        )}
      </div>
    )
  }

  // Render crossing verifications for Ground Disturbance activity
  function renderCrossingVerifications(block) {
    const verifications = block.qualityData.crossingVerifications || []
    
    const addVerification = () => {
      const newVerification = {
        id: Date.now(),
        kp: '',
        crossingId: '',
        owner: '',
        crossingType: '',
        expectedDepth: '',
        actualDepth: '',
        pOrX: 'X',
        verifiedType: '',
        status: 'verified',
        boundary: '',
        northing: '',
        easting: '',
        notes: ''
      }
      const updated = [...verifications, newVerification]
      updateQualityData(block.id, 'crossingVerifications', updated)
    }
    
    const updateVerification = (vId, field, value) => {
      const updated = verifications.map(v => 
        v.id === vId ? { ...v, [field]: value } : v
      )
      updateQualityData(block.id, 'crossingVerifications', updated)
    }
    
    const removeVerification = (vId) => {
      const updated = verifications.filter(v => v.id !== vId)
      updateQualityData(block.id, 'crossingVerifications', updated)
    }
    
    return (
      <div style={{ 
        backgroundColor: '#f8f9fa', 
        padding: '15px', 
        borderRadius: '8px',
        border: '2px solid #fd7e14',
        marginTop: '10px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h4 style={{ margin: 0, color: '#fd7e14' }}>📍 Crossing Verifications ({verifications.length})</h4>
          <button
            type="button"
            onClick={addVerification}
            style={{
              padding: '8px 16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            + Add Verification
          </button>
        </div>
        
        {verifications.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            No crossing verifications added. Click "Add Verification" to record a hydrovac dig.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {verifications.map((v, idx) => (
              <div key={v.id} style={{ 
                backgroundColor: 'white', 
                padding: '15px', 
                borderRadius: '8px',
                border: '1px solid #ddd',
                position: 'relative'
              }}>
                <div style={{ 
                  position: 'absolute', 
                  top: '-10px', 
                  left: '10px', 
                  backgroundColor: '#fd7e14', 
                  color: 'white',
                  padding: '2px 10px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  #{idx + 1}
                </div>
                <button
                  type="button"
                  onClick={() => removeVerification(v.id)}
                  style={{
                    position: 'absolute',
                    top: '5px',
                    right: '5px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ✕
                </button>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginTop: '10px' }}>
                  {/* KP */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>KP Location *</label>
                    <input
                      type="text"
                      value={v.kp}
                      onChange={(e) => updateVerification(v.id, 'kp', e.target.value)}
                      placeholder="e.g., 5+200"
                      style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                    />
                  </div>
                  
                  {/* P or X */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Hole Type</label>
                    <select
                      value={v.pOrX}
                      onChange={(e) => updateVerification(v.id, 'pOrX', e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    >
                      <option value="X">X - Crossing</option>
                      <option value="P">P - Parallel</option>
                    </select>
                  </div>
                  
                  {/* Owner */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Owner/Operator</label>
                    <input
                      type="text"
                      value={v.owner}
                      onChange={(e) => updateVerification(v.id, 'owner', e.target.value)}
                      placeholder="e.g., Nova, Telus"
                      style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  
                  {/* Crossing Type */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Type</label>
                    <select
                      value={v.verifiedType}
                      onChange={(e) => updateVerification(v.id, 'verifiedType', e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    >
                      <option value="">Select...</option>
                      <option value="SP">SP - Steel Pipe</option>
                      <option value="PP">PP - Plastic Pipe</option>
                      <option value="C">C - Cable</option>
                      <option value="OT">OT - Other</option>
                    </select>
                  </div>
                  
                  {/* Actual Depth */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Actual Depth (m) *</label>
                    <input
                      type="text"
                      value={v.actualDepth}
                      onChange={(e) => updateVerification(v.id, 'actualDepth', e.target.value)}
                      placeholder="e.g., 1.85"
                      style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  
                  {/* Status */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Status</label>
                    <select
                      value={v.status}
                      onChange={(e) => updateVerification(v.id, 'status', e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    >
                      <option value="verified">Verified</option>
                      <option value="not_found">Not Found</option>
                      <option value="location_adjusted">Location Adjusted</option>
                      <option value="depth_different">Depth Different than Expected</option>
                    </select>
                  </div>
                  
                  {/* Boundaries */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Boundary</label>
                    <select
                      value={v.boundary || ''}
                      onChange={(e) => updateVerification(v.id, 'boundary', e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    >
                      <option value="">Select...</option>
                      <option value="C/L">C/L - Centerline</option>
                      <option value="North">North</option>
                      <option value="South">South</option>
                      <option value="E of ROW">E of ROW</option>
                      <option value="W of ROW">W of ROW</option>
                    </select>
                  </div>
                  
                  {/* GPS */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Northing</label>
                    <input
                      type="text"
                      value={v.northing}
                      onChange={(e) => updateVerification(v.id, 'northing', e.target.value)}
                      placeholder="e.g., 5943040"
                      style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Easting</label>
                    <input
                      type="text"
                      value={v.easting}
                      onChange={(e) => updateVerification(v.id, 'easting', e.target.value)}
                      placeholder="e.g., 351848"
                      style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  
                  {/* Notes */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Notes</label>
                    <input
                      type="text"
                      value={v.notes}
                      onChange={(e) => updateVerification(v.id, 'notes', e.target.value)}
                      placeholder="Any observations, discrepancies, etc."
                      style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Production Status Toggle Component for Efficiency Audit
  // Field Activity Status Toggle - inspector-friendly terminology
  const ProductionStatusToggle = ({ value, onChange, onReasonChange, reason }) => {
    const [showReasonInput, setShowReasonInput] = useState(false)
    const needsReason = value === 'SYNC_DELAY' || value === 'MANAGEMENT_DRAG'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          {productionStatuses.map(status => (
            <button
              key={status.value}
              type="button"
              onClick={() => {
                onChange(status.value)
                if (status.value !== 'ACTIVE') {
                  setShowReasonInput(true)
                } else {
                  setShowReasonInput(false)
                  if (onReasonChange) onReasonChange('')
                }
              }}
              title={status.tooltip}
              style={{
                padding: '4px 6px',
                fontSize: '10px',
                fontWeight: value === status.value ? 'bold' : 'normal',
                backgroundColor: value === status.value ? status.color : '#e9ecef',
                color: value === status.value ? 'white' : '#666',
                border: `1px solid ${value === status.value ? status.color : '#ced4da'}`,
                borderRadius: '3px',
                cursor: 'pointer',
                minWidth: '24px',
                transition: 'all 0.15s ease'
              }}
            >
              {status.icon}
            </button>
          ))}
          {needsReason && onReasonChange && (
            <span
              style={{ fontSize: '9px', color: '#6f42c1', cursor: 'pointer', marginLeft: '4px' }}
              onClick={() => setShowReasonInput(!showReasonInput)}
              title="Click to add/edit reason"
            >
              {reason ? '✎' : '+why'}
            </span>
          )}
        </div>
        {showReasonInput && needsReason && onReasonChange && (
          <input
            type="text"
            value={reason || ''}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Reason..."
            title={delayReasonExamples}
            style={{
              padding: '3px 6px',
              fontSize: '10px',
              border: '1px solid #ced4da',
              borderRadius: '3px',
              width: '120px'
            }}
          />
        )}
      </div>
    )
  }

  const status = blockChainageStatus || {}

  // Determine if systemic delay is active for visual highlighting
  const systemicDelayActive = hasSystemicDelay(block)
  const systemicDelayStatus = block.systemicDelay?.status
  const systemicStatusConfig = systemicDelayActive ? productionStatuses.find(s => s.value === systemicDelayStatus) : null

  // Container styling based on systemic delay state
  const containerStyle = {
    backgroundColor: systemicDelayActive
      ? (systemicDelayStatus === 'MANAGEMENT_DRAG' ? '#fff5f5' : '#fffbf0')
      : '#fff',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
    border: systemicDelayActive
      ? `3px solid ${systemicStatusConfig?.color || '#dc3545'}`
      : '2px solid #007bff',
    boxShadow: systemicDelayActive
      ? `0 0 10px ${systemicStatusConfig?.color || '#dc3545'}40`
      : '0 2px 4px rgba(0,0,0,0.1)',
    overflow: 'hidden',
    transition: 'all 0.3s ease'
  }

  return (
    <div style={containerStyle}>
      {/* Systemic Delay Banner - shown when entire crew is affected */}
      {systemicDelayActive && (
        <div style={{
          backgroundColor: systemicStatusConfig?.color || '#dc3545',
          color: 'white',
          padding: '10px 15px',
          margin: '-20px -20px 15px -20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 'bold'
        }}>
          <span>
            {systemicDelayStatus === 'MANAGEMENT_DRAG' ? '⛔' : '⏳'} SYSTEMIC DELAY - ENTIRE CREW AFFECTED
          </span>
          <span style={{ fontSize: '12px', opacity: 0.9 }}>
            {block.systemicDelay?.reason || 'No reason specified'}
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: systemicDelayActive ? `2px solid ${systemicStatusConfig?.color}` : '2px solid #007bff', paddingBottom: '10px', marginBottom: '15px' }}>
        <h2 style={{ margin: 0, color: systemicDelayActive ? systemicStatusConfig?.color : '#007bff' }}>
          ACTIVITY {blockIndex + 1}: {block.activityType || '(Select Type)'}
        </h2>
        <button
          onClick={() => removeActivityBlock(block.id)}
          style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
        >
          Remove Activity
        </button>
      </div>

      {/* Activity Type & Basic Info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '20px', overflow: 'visible' }}>
        <div style={{ overflow: 'hidden', minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Activity Type *</label>
          <select
            value={block.activityType}
            onChange={(e) => updateBlock(block.id, 'activityType', e.target.value)}
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
          >
            <option value="">Select Activity</option>
            {activityTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div style={{ overflow: 'hidden', minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Contractor</label>
          <input
            type="text"
            value={block.contractor}
            onChange={(e) => updateBlock(block.id, 'contractor', e.target.value)}
            onBlur={(e) => {
              // Copy to GD Contractor if Ground Disturbance and not already set
              if (block.activityType === 'Ground Disturbance' && e.target.value && !block.qualityData?.gdContractor) {
                updateQualityData(block.id, 'gdContractor', e.target.value)
              }
            }}
            placeholder="Contractor name"
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ overflow: 'hidden', minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Foreman</label>
          <input
            type="text"
            value={block.foreman}
            onChange={(e) => updateBlock(block.id, 'foreman', e.target.value)}
            onBlur={(e) => {
              // Copy to GD Foreman if Ground Disturbance and not already set
              if (block.activityType === 'Ground Disturbance' && e.target.value && !block.qualityData?.gdForeman) {
                updateQualityData(block.id, 'gdForeman', e.target.value)
              }
            }}
            placeholder="Foreman name"
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
            Start KP
            {status.suggestedStartKP && !block.startKP && (
              <button
                onClick={() => updateBlock(block.id, 'startKP', status.suggestedStartKP)}
                style={{ marginLeft: '8px', padding: '2px 8px', fontSize: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
              >
                Use {status.suggestedStartKP}
              </button>
            )}
          </label>
          <div style={{ display: 'flex', gap: '8px', minWidth: 0 }}>
            <input
              type="text"
              value={block.startKP || ''}
              onChange={(e) => updateBlock(block.id, 'startKP', e.target.value)}
              onBlur={(e) => {
                // Auto-format KP value (6500 -> 6+500)
                const formattedKP = formatKP(e.target.value)
                if (formattedKP !== e.target.value) {
                  updateBlock(block.id, 'startKP', formattedKP)
                }
                // Auto-calculate meters today on blur (after user finishes typing)
                if (formattedKP && block.endKP) {
                  const startM = parseKPToMetres(formattedKP)
                  const endM = parseKPToMetres(block.endKP)
                  if (startM !== null && endM !== null) {
                    const metersToday = Math.abs(endM - startM)
                    updateBlock(block.id, 'metersToday', metersToday.toString())
                    const previous = parseFloat(block.metersPrevious) || 0
                    updateBlock(block.id, 'metersToDate', (metersToday + previous).toString())
                  }
                }
              }}
              placeholder="e.g. 5+250"
              style={{
                flex: 1,
                padding: '10px',
                border: status.hasOverlap ? '2px solid #dc3545' : status.hasGap ? '2px solid #ffc107' : '1px solid #ced4da',
                borderRadius: '4px',
                backgroundColor: status.hasOverlap ? '#fff5f5' : status.hasGap ? '#fffbf0' : 'white',
                boxSizing: 'border-box'
              }}
            />
            <button
              onClick={() => handleSyncKP('startKP')}
              disabled={syncingKP}
              title="Sync from GPS"
              style={{
                padding: '8px 10px',
                backgroundColor: syncingKP ? '#6c757d' : '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: syncingKP ? 'wait' : 'pointer',
                fontSize: '12px',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0
              }}
            >
              {syncingKP ? '...' : 'GPS'}
            </button>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
            End KP
          </label>
          <div style={{ display: 'flex', gap: '8px', minWidth: 0 }}>
            <input
              type="text"
              value={block.endKP || ''}
              onChange={(e) => updateBlock(block.id, 'endKP', e.target.value)}
              onBlur={(e) => {
                // Auto-format KP value (6500 -> 6+500)
                const formattedKP = formatKP(e.target.value)
                if (formattedKP !== e.target.value) {
                  updateBlock(block.id, 'endKP', formattedKP)
                }
                // Auto-calculate meters today on blur (after user finishes typing)
                if (block.startKP && formattedKP) {
                  const startM = parseKPToMetres(block.startKP)
                  const endM = parseKPToMetres(formattedKP)
                  if (startM !== null && endM !== null) {
                    const metersToday = Math.abs(endM - startM)
                    const previous = parseFloat(block.metersPrevious) || 0
                    const toDate = metersToday + previous
                    // Update all three fields
                    updateBlock(block.id, 'metersToday', metersToday.toString())
                    setTimeout(() => {
                      updateBlock(block.id, 'metersToDate', toDate.toString())
                    }, 50)
                  }
                }
              }}
              placeholder="e.g. 6+100"
              style={{
                flex: 1,
                padding: '10px',
                border: status.hasOverlap ? '2px solid #dc3545' : status.hasGap ? '2px solid #ffc107' : '1px solid #ced4da',
                borderRadius: '4px',
                backgroundColor: status.hasOverlap ? '#fff5f5' : status.hasGap ? '#fffbf0' : 'white',
                boxSizing: 'border-box'
              }}
            />
            <button
              onClick={() => handleSyncKP('endKP')}
              disabled={syncingKP}
              title="Sync from GPS"
              style={{
                padding: '8px 10px',
                backgroundColor: syncingKP ? '#6c757d' : '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: syncingKP ? 'wait' : 'pointer',
                fontSize: '12px',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0
              }}
            >
              {syncingKP ? '...' : 'GPS'}
            </button>
          </div>
        </div>
      </div>

      {/* KP Sync Toast Notification */}
      {kpSyncToast && (
        <div style={{
          marginBottom: '15px',
          padding: '12px 15px',
          borderRadius: '6px',
          backgroundColor: kpSyncToast.type === 'success' ? '#d4edda' : 
                          kpSyncToast.type === 'warning' ? '#fff3cd' : '#f8d7da',
          border: `1px solid ${kpSyncToast.type === 'success' ? '#c3e6cb' : 
                              kpSyncToast.type === 'warning' ? '#ffc107' : '#f5c6cb'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '13px',
              color: kpSyncToast.type === 'success' ? '#155724' : 
                     kpSyncToast.type === 'warning' ? '#856404' : '#721c24'
            }}>
              {kpSyncToast.type === 'success' && '✓ '}
              {kpSyncToast.type === 'warning' && '⚠️ '}
              {kpSyncToast.type === 'error' && '✕ '}
              {kpSyncToast.message}
            </div>
            {kpSyncToast.detail && (
              <div style={{ 
                fontSize: '12px', 
                marginTop: '4px',
                color: kpSyncToast.type === 'success' ? '#155724' : 
                       kpSyncToast.type === 'warning' ? '#856404' : '#721c24',
                opacity: 0.8
              }}>
                {kpSyncToast.detail}
              </div>
            )}
          </div>
          <button
            onClick={() => setKpSyncToast(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              opacity: 0.6,
              padding: '0 4px'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* METRES TRACKING */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '20px', 
        marginBottom: '15px',
        padding: '15px',
        backgroundColor: '#e8f4f8',
        borderRadius: '6px',
        border: '1px solid #bee5eb'
      }}>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', color: '#0c5460' }}>
            📏 Metres Today
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={block.metersToday || calculateMetersToday(block) || ''}
            onChange={(e) => {
              updateBlock(block.id, 'metersToday', e.target.value)
            }}
            placeholder="0"
            style={{ width: '100%', padding: '10px', border: '2px solid #17a2b8', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', color: '#666' }}>
            📊 Metres Previous
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={block.metersPrevious || ''}
            readOnly
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', textAlign: 'center', backgroundColor: '#e9ecef', color: '#666', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', color: '#155724' }}>
            ✓ Metres To Date
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={
              (parseFloat(block.metersToday || calculateMetersToday(block) || 0) + parseFloat(block.metersPrevious || 0)) || ''
            }
            readOnly
            style={{ width: '100%', padding: '10px', border: '2px solid #28a745', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#d4edda', color: '#155724', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Chainage Warnings */}
      {status.hasOverlap && (
        <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f8d7da', border: '2px solid #dc3545', borderRadius: '6px' }}>
          <strong style={{ color: '#721c24', fontSize: '14px' }}>⚠️ CHAINAGE OVERLAP DETECTED</strong>
          {status.overlaps?.map((overlap, idx) => (
            <p key={idx} style={{ margin: '8px 0', fontSize: '13px', color: '#721c24' }}>
              Overlaps with previous work: {overlap.startKP} to {overlap.endKP} ({overlap.metres}m overlap)
            </p>
          ))}
          <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#fff', borderRadius: '4px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#721c24', marginBottom: '5px' }}>
              ✍️ Reason for overlap (REQUIRED to save):
            </label>
            <ShieldedInput
              as="textarea"
              value={chainageReasons[block.id]?.overlapReason || ''}
              onChange={(val) => setChainageReasons({
                ...chainageReasons,
                [block.id]: { ...chainageReasons[block.id], overlapReason: val }
              })}
              placeholder="e.g., Re-work required due to coating damage, Tie-in weld at station..."
              rows={2}
              style={{
                width: '100%',
                padding: '8px',
                border: chainageReasons[block.id]?.overlapReason ? '2px solid #28a745' : '2px solid #dc3545',
                borderRadius: '4px',
                fontSize: '13px'
              }}
            />
          </div>
        </div>
      )}

      {status.hasGap && (
        <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#fff3cd', border: '2px solid #ffc107', borderRadius: '6px' }}>
          <strong style={{ color: '#856404', fontSize: '14px' }}>📍 CHAINAGE GAP DETECTED</strong>
          {status.gaps?.map((gap, idx) => (
            <p key={idx} style={{ margin: '8px 0', fontSize: '13px', color: '#856404' }}>
              Unrecorded section: {gap.startKP} to {gap.endKP} ({gap.metres}m gap)
            </p>
          ))}
          <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#fff', borderRadius: '4px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#856404', marginBottom: '5px' }}>
              ✍️ Reason for gap (REQUIRED to save):
            </label>
            <ShieldedInput
              as="textarea"
              value={chainageReasons[block.id]?.gapReason || ''}
              onChange={(val) => setChainageReasons({
                ...chainageReasons,
                [block.id]: { ...chainageReasons[block.id], gapReason: val }
              })}
              placeholder="e.g., Section completed by another crew, Road crossing permit pending..."
              rows={2}
              style={{
                width: '100%',
                padding: '8px',
                border: chainageReasons[block.id]?.gapReason ? '2px solid #28a745' : '2px solid #ffc107',
                borderRadius: '4px',
                fontSize: '13px'
              }}
            />
          </div>
        </div>
      )}

      {/* Existing Coverage Info */}
      {block.activityType && status.coverage?.length > 0 && (
        <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e7f3ff', border: '1px solid #b8daff', borderRadius: '6px' }}>
          <strong style={{ color: '#004085', fontSize: '12px' }}>📊 Existing {block.activityType} Coverage:</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' }}>
            {mergeRanges(status.coverage).slice(0, 5).map((range, idx) => (
              <span key={idx} style={{ padding: '2px 8px', backgroundColor: '#cce5ff', borderRadius: '3px', fontSize: '11px', color: '#004085' }}>
                {formatMetresToKP(range.start)} → {formatMetresToKP(range.end)}
              </span>
            ))}
            {status.coverage.length > 5 && (
              <span style={{ padding: '2px 8px', fontSize: '11px', color: '#004085' }}>
                +{status.coverage.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Work Description */}
      <div style={{ marginBottom: '20px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Work Description</label>
          <VoiceButton fieldId={`workDescription_${block.id}`} />
        </div>
        <ShieldedInput
          as="textarea"
          value={block.workDescription}
          onChange={(val) => updateBlock(block.id, 'workDescription', val)}
          placeholder="Describe the work performed... (use 🎤 for voice input)"
          rows={6}
          style={{
            width: '100%',
            padding: '10px',
            border: isListening === `workDescription_${block.id}` ? '2px solid #dc3545' : '1px solid #ced4da',
            borderRadius: '4px',
            resize: 'vertical',
            backgroundColor: isListening === `workDescription_${block.id}` ? '#fff5f5' : 'white',
            boxSizing: 'border-box'
          }}
        />
        {isListening === `workDescription_${block.id}` && (
          <div style={{ marginTop: '5px', padding: '8px 10px', backgroundColor: '#f8d7da', borderRadius: '4px', fontSize: '12px', color: '#721c24' }}>
            <strong>🔴 Listening...</strong> Speak now. Say "period", "comma", or "new line" for punctuation.
          </div>
        )}
      </div>

      {/* Mentor Tips Overlay */}
      {showMentorTips && mentorTips.length > 0 && (
        <MentorTipOverlay
          tips={mentorTips}
          activityType={block.activityType}
          onDismiss={() => setShowMentorTips(false)}
          onDontShowAgain={(type) => {
            localStorage.setItem(`mentor_tips_dismissed_${type}`, 'true')
            setShowMentorTips(false)
          }}
        />
      )}

      {/* Quality Checks */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px', overflow: 'hidden' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#856404' }}>⚙️ Quality Checks</h4>
        {renderQualityFields()}
      </div>

      {/* Daily Contractor Ticket */}
      <div data-tour="contractor-ticket" style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#004085' }}>📋 Daily Contractor Ticket</h4>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Ticket #:</label>
          <input
            type="text"
            placeholder="Enter ticket number"
            value={block.ticketNumber || ''}
            onChange={(e) => updateBlock(block.id, 'ticketNumber', e.target.value)}
            style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', width: '150px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {/* Take Photo with Camera */}
          <label style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', cursor: ocrProcessing ? 'wait' : 'pointer', fontSize: '14px', opacity: ocrProcessing ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {ocrProcessing ? '⏳ Processing...' : '📷 Take Photo'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                if (e.target.files[0]) {
                  processTicketOCR(block.id, e.target.files[0])
                }
              }}
              style={{ display: 'none' }}
              disabled={ocrProcessing}
            />
          </label>
          {/* Upload from Gallery/Files - supports multiple pages */}
          <label style={{ padding: '10px 20px', backgroundColor: '#17a2b8', color: 'white', borderRadius: '4px', cursor: ocrProcessing ? 'wait' : 'pointer', fontSize: '14px', opacity: ocrProcessing ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {ocrProcessing ? '⏳ Processing...' : '📁 Upload Photo(s)'}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) {
                  processTicketOCR(block.id, Array.from(e.target.files))
                }
              }}
              style={{ display: 'none' }}
              disabled={ocrProcessing}
            />
          </label>
        </div>
        <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
          Take a photo or upload images of the contractor's ticket. For multi-page tickets, you can add pages one at a time or select all at once — AI will combine data from all pages.
        </p>
        {ocrProcessing && (
          <div style={{ padding: '10px', backgroundColor: '#cce5ff', borderRadius: '6px', border: '1px solid #b8daff', margin: '10px 0' }}>
            <span style={{ color: '#004085', fontSize: '13px', fontWeight: 'bold' }}>⏳ Photo received — extracting labour & equipment data...</span>
          </div>
        )}
        {ocrError && (
          <p style={{ color: '#dc3545', fontSize: '13px', margin: '10px 0' }}>{ocrError}</p>
        )}
        {ocrSuccess && !ocrProcessing && (
          <div style={{ padding: '10px', backgroundColor: '#d4edda', borderRadius: '6px', border: '1px solid #c3e6cb', margin: '10px 0' }}>
            <span style={{ color: '#155724', fontSize: '13px', fontWeight: 'bold' }}>✓ Ticket scanned — labour and equipment data added below. Review and correct if needed.</span>
          </div>
        )}

        {/* Show ticket photo if one exists (either new upload or saved from database) */}
        {(block.ticketPhoto || block.savedTicketPhotoUrl || block.savedTicketPhotoUrls?.length > 0) && (
          <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#d4edda', borderRadius: '6px', border: '1px solid #c3e6cb' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ color: '#155724', fontSize: '13px', fontWeight: 'bold' }}>
                ✓ {block.ticketPhotos?.length > 1
                  ? `${block.ticketPhotos.length} pages attached`
                  : block.savedTicketPhotoUrls?.length > 1
                    ? `${block.savedTicketPhotoUrls.length} pages attached`
                    : `Ticket photo attached: ${block.ticketPhoto?.name || block.savedTicketPhotoName || 'Photo'}`
                }
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowTicketPhoto(true)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  👁️ View Photo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateBlock(block.id, 'ticketPhoto', null)
                    updateBlock(block.id, 'ticketPhotos', null)
                    updateBlock(block.id, 'savedTicketPhotoUrl', null)
                    updateBlock(block.id, 'savedTicketPhotoName', null)
                    updateBlock(block.id, 'savedTicketPhotoUrls', null)
                    updateBlock(block.id, 'savedTicketPhotoNames', null)
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ✕ Remove
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ticket Photo Modal */}
        {showTicketPhoto && (block.ticketPhoto || block.savedTicketPhotoUrl || block.savedTicketPhotoUrls?.length > 0) && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.85)',
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
            onClick={() => setShowTicketPhoto(false)}
          >
            <div style={{
              backgroundColor: 'white',
              padding: '15px',
              borderRadius: '8px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>📋 Contractor Ticket Photo</h3>
                <button
                  onClick={() => setShowTicketPhoto(false)}
                  style={{
                    padding: '8px 16px',
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
              <div style={{ overflow: 'auto', flex: 1 }}>
                {block.ticketPhotos?.length > 1 ? (
                  block.ticketPhotos.map((photo, idx) => (
                    <div key={idx} style={{ marginBottom: idx < block.ticketPhotos.length - 1 ? '15px' : 0, borderBottom: idx < block.ticketPhotos.length - 1 ? '2px solid #dee2e6' : 'none', paddingBottom: idx < block.ticketPhotos.length - 1 ? '15px' : 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '5px' }}>Page {idx + 1} of {block.ticketPhotos.length}</div>
                      <img
                        src={photo instanceof File ? URL.createObjectURL(photo) : photo}
                        alt={`Contractor Ticket Page ${idx + 1}`}
                        style={{ maxWidth: '100%', objectFit: 'contain' }}
                      />
                    </div>
                  ))
                ) : block.savedTicketPhotoUrls?.length > 1 ? (
                  block.savedTicketPhotoUrls.map((url, idx) => (
                    <div key={idx} style={{ marginBottom: idx < block.savedTicketPhotoUrls.length - 1 ? '15px' : 0, borderBottom: idx < block.savedTicketPhotoUrls.length - 1 ? '2px solid #dee2e6' : 'none', paddingBottom: idx < block.savedTicketPhotoUrls.length - 1 ? '15px' : 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '5px' }}>Page {idx + 1} of {block.savedTicketPhotoUrls.length}</div>
                      <img
                        src={url}
                        alt={`Contractor Ticket Page ${idx + 1}`}
                        style={{ maxWidth: '100%', objectFit: 'contain' }}
                      />
                    </div>
                  ))
                ) : (
                  <img
                    src={block.ticketPhoto instanceof File ? URL.createObjectURL(block.ticketPhoto) : (block.savedTicketPhotoUrl || '')}
                    alt="Contractor Ticket"
                    style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 100px)', objectFit: 'contain' }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Crew Delay - Only show toggle when NOT active, show full controls when active */}
      <div style={{
        marginBottom: '20px',
        padding: '12px 15px',
        backgroundColor: systemicDelayActive ? (systemicDelayStatus === 'MANAGEMENT_DRAG' ? '#f8d7da' : '#fff3cd') : '#f8f9fa',
        borderRadius: '8px',
        border: systemicDelayActive ? `2px solid ${systemicStatusConfig?.color}` : '1px solid #dee2e6'
      }}>
        {!block.systemicDelay?.active ? (
          // Simple toggle when not active
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '13px', color: '#666' }}>
              ⏱️ Did the entire crew have reduced productivity?
            </span>
            <button
              type="button"
              onClick={() => updateSystemicDelay(block.id, { active: true, status: 'SYNC_DELAY', reason: '' })}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 'bold',
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Report Site Condition
            </button>
          </div>
        ) : (
          // Full controls when active
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '14px', color: systemicStatusConfig?.color || '#dc3545' }}>
                ⚠️ Site Condition Affecting Crew
              </span>
              <button
                type="button"
                onClick={() => updateSystemicDelay(block.id, { active: false })}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ✕ Clear
              </button>
            </div>
            {/* Status Buttons with Tooltips */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {productionStatuses.filter(s => s.value !== 'ACTIVE').map(s => (
                    <div key={s.value} style={{ position: 'relative' }} className="tooltip-container">
                      <button
                        type="button"
                        onClick={() => updateSystemicDelay(block.id, { ...block.systemicDelay, status: s.value })}
                        style={{
                          padding: '8px 14px',
                          fontSize: '12px',
                          fontWeight: block.systemicDelay?.status === s.value ? 'bold' : 'normal',
                          backgroundColor: block.systemicDelay?.status === s.value ? s.color : '#e9ecef',
                          color: block.systemicDelay?.status === s.value ? 'white' : '#666',
                          border: `1px solid ${block.systemicDelay?.status === s.value ? s.color : '#ced4da'}`,
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        {s.icon} {s.label}
                      </button>
                    </div>
                  ))}
                </div>
                {/* Explanation text below buttons */}
                <div style={{ fontSize: '10px', color: '#666', maxWidth: '320px', lineHeight: '1.3' }}>
                  <strong>⏳ Partial Work</strong>: Slowed by materials, sync, or minor site issues<br/>
                  <strong>🛑 Standby</strong>: Waiting for permits, instructions, or regulatory clearance
                </div>
              </div>

              {/* Delay Reason - dropdown with accountability mapping */}
              <div style={{ flex: 1, minWidth: '250px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#666' }}>
                    Site Condition:
                  </label>
                  {/* Show lock indicator if reason locks to systemic */}
                  {reasonLocksSystemic(block.systemicDelay?.reason) && (
                    <span style={{ fontSize: '10px', color: '#dc3545', fontWeight: 'bold' }}>
                      🔒 Affects Entire Crew
                    </span>
                  )}
                </div>
                <select
                  value={dragReasonCategories.some(r => r.label === block.systemicDelay?.reason) ? block.systemicDelay?.reason : '_custom'}
                  onChange={(e) => {
                    if (e.target.value !== '_custom' && e.target.value !== '') {
                      updateSystemicDelay(block.id, { ...block.systemicDelay, reason: e.target.value })
                      setReasonInputValue(e.target.value)
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    border: `1px solid ${systemicStatusConfig?.color || '#ced4da'}`,
                    borderRadius: '4px',
                    marginBottom: '6px'
                  }}
                >
                  <option value="">-- Select reason --</option>
                  <optgroup label="🏛️ Owner / Regulatory">
                    {dragReasonCategories.filter(r => r.responsibleParty === 'owner').map(r => (
                      <option key={r.value} value={r.label}>{r.label} {r.lockSystemic ? '🔒' : ''}</option>
                    ))}
                  </optgroup>
                  <optgroup label="🔧 Contractor Issue">
                    {dragReasonCategories.filter(r => r.responsibleParty === 'contractor').map(r => (
                      <option key={r.value} value={r.label}>{r.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="⚖️ Neutral (Act of God)">
                    {dragReasonCategories.filter(r => r.responsibleParty === 'neutral').map(r => (
                      <option key={r.value} value={r.label}>{r.label} {r.lockSystemic ? '🔒' : ''}</option>
                    ))}
                  </optgroup>
                  <option value="_custom">-- Or type custom below --</option>
                </select>
                {/* Custom reason input */}
                {(!dragReasonCategories.some(r => r.label === block.systemicDelay?.reason) || block.systemicDelay?.reason === '') && (
                  <input
                    type="text"
                    value={reasonInputValue}
                    onChange={(e) => setReasonInputValue(e.target.value)}
                    onBlur={() => {
                      if (reasonInputValue.trim()) {
                        saveCustomReason(reasonInputValue)
                        updateSystemicDelay(block.id, { ...block.systemicDelay, reason: reasonInputValue.trim() })
                      }
                    }}
                    placeholder="Type custom reason..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '12px',
                      border: `1px solid ${systemicStatusConfig?.color || '#ced4da'}`,
                      borderRadius: '4px',
                      boxSizing: 'border-box'
                    }}
                  />
                )}
                {/* Responsible Party Badge */}
                {block.systemicDelay?.reason && (
                  <div style={{ marginTop: '6px' }}>
                    {(() => {
                      const party = getResponsibleParty(block.systemicDelay?.reason)
                      if (!party) return null
                      return (
                        <span
                          style={{
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            borderRadius: '12px',
                            backgroundColor: party.bgColor,
                            color: party.color,
                            border: `1px solid ${party.color}`
                          }}
                        >
                          {party.icon} {party.label} Issue
                        </span>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
              {reasonLocksSystemic(block.systemicDelay?.reason)
                ? '🔒 This condition affects the entire crew and cannot be scoped to individual assets.'
                : 'This condition applies to ALL manpower and equipment entries below.'
              }
            </div>
          </>
        )}
      </div>

      {/* Manpower */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#d4edda', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#155724' }}>👷 Manpower</h4>
        <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#155724' }}>
          RT = Regular Time | OT = Overtime | JH = Jump Hours (bonus)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 70px 70px 70px 70px auto', gap: '10px', marginBottom: '15px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Employee Name</label>
            <SearchableNameInput
              value={currentLabour.employeeName}
              onChange={(val) => setCurrentLabour({ ...currentLabour, employeeName: val })}
              suggestions={knownCrewNames}
              placeholder="Name"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Classification</label>
            <SearchableSelect
              value={currentLabour.classification}
              onChange={(val) => setCurrentLabour({ ...currentLabour, classification: val })}
              options={labourClassifications}
              placeholder="Select Classification"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#155724' }}>RT</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="8"
              value={currentLabour.rt}
              onChange={(e) => setCurrentLabour({ ...currentLabour, rt: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #28a745', borderRadius: '4px', backgroundColor: '#d4edda', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#856404' }}>OT</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={currentLabour.ot}
              onChange={(e) => setCurrentLabour({ ...currentLabour, ot: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ffc107', borderRadius: '4px', backgroundColor: '#fff3cd', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#004085' }}>JH</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={currentLabour.jh}
              onChange={(e) => setCurrentLabour({ ...currentLabour, jh: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #007bff', borderRadius: '4px', backgroundColor: '#cce5ff', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Count</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="1"
              value={currentLabour.count}
              onChange={(e) => setCurrentLabour({ ...currentLabour, count: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={() => {
              addLabourToBlock(block.id, currentLabour.employeeName, currentLabour.classification, currentLabour.rt, currentLabour.ot, currentLabour.jh, currentLabour.count)
              setCurrentLabour({ employeeName: '', classification: '', rt: '', ot: '', jh: '', count: '1' })
            }}
            style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '38px' }}
          >
            Add
          </button>
        </div>

        {block.labourEntries.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '550px' }}>
              <thead>
                <tr style={{ backgroundColor: '#c3e6cb' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Employee</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Classification</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '45px' }}>RT</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '45px' }}>OT</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '55px' }}>JH</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}>Cnt</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}></th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {block.labourEntries.map(entry => {
                  const rt = entry.rt !== undefined ? entry.rt : Math.min(entry.hours || 0, 8)
                  const ot = entry.ot !== undefined ? entry.ot : Math.max(0, (entry.hours || 0) - 8)
                  const jh = entry.jh !== undefined ? entry.jh : 0
                  const billedHours = (rt + ot) * (entry.count || 1)
                  const prodStatus = entry.productionStatus || 'ACTIVE'
                  const shadowHours = calculateShadowHours(billedHours, prodStatus, entry.shadowEffectiveHours)
                  const statusConfig = productionStatuses.find(s => s.value === prodStatus)
                  return (
                    <React.Fragment key={entry.id}>
                      <tr style={{ backgroundColor: '#fff' }}>
                        <td style={{ padding: '2px 4px', borderBottom: '1px solid #dee2e6' }}>
                          <SearchableNameInput
                            value={entry.employeeName || ''}
                            onChange={(val) => updateLabourField(block.id, entry.id, 'employeeName', val)}
                            suggestions={knownCrewNames}
                            placeholder="Name"
                          />
                        </td>
                        <td style={{ padding: '2px 4px', borderBottom: '1px solid #dee2e6', fontSize: '12px' }}>
                          <SearchableSelect
                            value={entry.classification}
                            onChange={(val) => updateLabourField(block.id, entry.id, 'classification', val)}
                            options={labourClassifications}
                            placeholder="Select"
                          />
                        </td>
                        <td style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: '#d4edda' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={rt || ''}
                            onChange={(e) => updateLabourField(block.id, entry.id, 'rt', parseFloat(e.target.value) || 0)}
                            style={{ width: '40px', padding: '4px', border: '1px solid #28a745', borderRadius: '3px', textAlign: 'center', fontSize: '12px', backgroundColor: '#d4edda' }}
                          />
                        </td>
                        <td style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: ot > 0 ? '#fff3cd' : '#fff' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={ot || ''}
                            onChange={(e) => updateLabourField(block.id, entry.id, 'ot', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            style={{ width: '40px', padding: '4px', border: '1px solid #ffc107', borderRadius: '3px', textAlign: 'center', fontSize: '12px', backgroundColor: ot > 0 ? '#fff3cd' : '#fff' }}
                          />
                        </td>
                        <td style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: jh > 0 ? '#cce5ff' : '#fff' }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={jh || ''}
                            onChange={(e) => updateLabourJH(block.id, entry.id, e.target.value)}
                            placeholder="0"
                            style={{ width: '40px', padding: '4px', border: '1px solid #ced4da', borderRadius: '3px', textAlign: 'center', fontSize: '12px' }}
                          />
                        </td>
                        <td style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                          <input
                            type="number"
                            value={entry.count || ''}
                            onChange={(e) => updateLabourField(block.id, entry.id, 'count', parseInt(e.target.value) || 0)}
                            placeholder="0"
                            style={{
                              width: '50px',
                              padding: '4px',
                              border: '1px solid #ced4da',
                              borderRadius: '3px',
                              textAlign: 'center',
                              fontSize: '12px'
                            }}
                          />
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                          <button
                            type="button"
                            onClick={() => toggleFlagRow(entry.id)}
                            title={prodStatus !== 'ACTIVE' ? `Flagged: ${prodStatus === 'SYNC_DELAY' ? 'Downtime' : 'Standby'}` : 'Flag downtime or standby'}
                            style={{
                              padding: '4px 8px',
                              fontSize: '13px',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              backgroundColor: prodStatus === 'MANAGEMENT_DRAG' ? '#dc3545' : prodStatus === 'SYNC_DELAY' ? '#ffc107' : openFlagRows[entry.id] ? '#6c757d' : '#e9ecef',
                              color: prodStatus !== 'ACTIVE' || openFlagRows[entry.id] ? 'white' : '#666'
                            }}
                          >
                            {prodStatus === 'MANAGEMENT_DRAG' ? '!' : prodStatus === 'SYNC_DELAY' ? '!' : '\u270E'}
                          </button>
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                          <button
                            onClick={() => removeLabourFromBlock(block.id, entry.id)}
                            style={{ padding: '2px 6px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                      {/* Flag Detail Row - shown when flag button is clicked or entry is already flagged */}
                      {(openFlagRows[entry.id] || prodStatus !== 'ACTIVE') && (
                        <tr style={{ backgroundColor: prodStatus === 'MANAGEMENT_DRAG' ? '#fff5f5' : prodStatus === 'SYNC_DELAY' ? '#fffbf0' : '#f8f9fa' }}>
                          <td colSpan={8} style={{ padding: '10px 12px', borderBottom: '1px solid #dee2e6' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>Status:</span>
                                {[
                                  { value: 'ACTIVE', label: 'Working', color: '#28a745' },
                                  { value: 'SYNC_DELAY', label: 'Downtime', color: '#ffc107' },
                                  { value: 'MANAGEMENT_DRAG', label: 'Standby', color: '#dc3545' }
                                ].map(s => (
                                  <button
                                    key={s.value}
                                    type="button"
                                    onClick={() => {
                                      updateLabourProductionStatus(block.id, entry.id, s.value)
                                      if (s.value === 'ACTIVE') {
                                        setOpenFlagRows(prev => ({ ...prev, [entry.id]: false }))
                                      }
                                    }}
                                    style={{
                                      padding: '5px 12px',
                                      fontSize: '12px',
                                      fontWeight: prodStatus === s.value ? 'bold' : 'normal',
                                      backgroundColor: prodStatus === s.value ? s.color : '#e9ecef',
                                      color: prodStatus === s.value ? 'white' : '#333',
                                      border: `1px solid ${prodStatus === s.value ? s.color : '#ced4da'}`,
                                      borderRadius: '4px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {s.label}
                                  </button>
                                ))}
                                {prodStatus !== 'ACTIVE' && (
                                  <span style={{ fontSize: '11px', color: '#666', marginLeft: '8px' }}>
                                    {prodStatus === 'SYNC_DELAY' ? 'Down hrs:' : 'Standby hrs:'} <input
                                      type="text"
                                      inputMode="decimal"
                                      value={entry.shadowEffectiveHours !== null && entry.shadowEffectiveHours !== undefined ? (billedHours - parseFloat(entry.shadowEffectiveHours)).toFixed(1) : ''}
                                      onChange={(e) => {
                                        const downtimeVal = parseFloat(e.target.value)
                                        if (e.target.value === '' || isNaN(downtimeVal)) {
                                          updateLabourShadowHours(block.id, entry.id, '')
                                        } else {
                                          const productiveHrs = Math.max(0, billedHours - downtimeVal)
                                          updateLabourShadowHours(block.id, entry.id, productiveHrs.toString())
                                        }
                                      }}
                                      placeholder="0.0"
                                      style={{ width: '45px', padding: '3px', border: '1px solid #ced4da', borderRadius: '3px', textAlign: 'center', fontSize: '12px' }}
                                    />
                                  </span>
                                )}
                              </div>
                              {prodStatus !== 'ACTIVE' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>Reason:</span>
                                  <select
                                    value={dragReasonCategories.some(r => r.label === entry.dragReason) ? entry.dragReason : '_custom'}
                                    onChange={(e) => { if (e.target.value !== '_custom') updateLabourDragReason(block.id, entry.id, e.target.value) }}
                                    style={{ padding: '4px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                                  >
                                    <option value="">-- Select reason --</option>
                                    {dragReasonCategories.map(r => (
                                      <option key={r.value} value={r.label}>{r.label} {r.responsibleParty === 'contractor' ? '🔧' : r.responsibleParty === 'owner' ? '🏛️' : ''}</option>
                                    ))}
                                    <option value="_custom">-- Custom --</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={dragReasonCategories.some(r => r.label === entry.dragReason) ? '' : (entry.dragReason || '')}
                                    onChange={(e) => updateLabourDragReason(block.id, entry.id, e.target.value)}
                                    onBlur={(e) => { if (e.target.value.trim()) saveCustomReason(e.target.value) }}
                                    placeholder="Or type custom reason..."
                                    style={{ flex: 1, padding: '4px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px', minWidth: '150px', maxWidth: '250px' }}
                                  />
                                  {(() => {
                                    const party = getResponsibleParty(entry.dragReason)
                                    if (!party) return null
                                    return <span style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 'bold', borderRadius: '12px', backgroundColor: party.bgColor, color: party.color, border: `1px solid ${party.color}`, whiteSpace: 'nowrap' }}>{party.icon} {party.label}</span>
                                  })()}
                                </div>
                              )}
                              {(() => {
                                const party = getResponsibleParty(entry.dragReason)
                                const needsNote = reasonRequiresNote(entry.dragReason) && prodStatus === 'MANAGEMENT_DRAG'
                                if (!needsNote) return null
                                const isContractor = party?.label === 'Contractor'
                                return (
                                  <div style={{ padding: '8px', backgroundColor: '#f8d7da', borderRadius: '4px', border: '1px solid #dc3545' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#721c24', marginBottom: '4px' }}>
                                      {isContractor ? '🔧 Contractor Issue Detail' : 'Issue Detail'} <span style={{ color: '#dc3545' }}>* Required</span>
                                    </label>
                                    <input type="text" value={entry.contractorDragNote || ''} onChange={(e) => updateLabourContractorNote(block.id, entry.id, e.target.value)}
                                      placeholder={isContractor ? "e.g., Ditch sloughing at KP 12+500, Foreman absent from ROW..." : "Describe the specific issue..."}
                                      style={{ width: '100%', padding: '6px 8px', border: entry.contractorDragNote?.trim() ? '1px solid #28a745' : '2px solid #dc3545', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                )
                              })()}
                            </div>
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
      </div>

      {/* Equipment */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#cce5ff', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#004085' }}>🚜 Equipment</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px auto', gap: '10px', marginBottom: '15px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Equipment Type</label>
            <SearchableSelect
              value={currentEquipment.type}
              onChange={(val) => setCurrentEquipment({ ...currentEquipment, type: val })}
              options={equipmentTypes}
              placeholder="Select Equipment"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Unit #</label>
            <input
              type="text"
              placeholder="Unit #"
              value={currentEquipment.unitNumber}
              onChange={(e) => setCurrentEquipment({ ...currentEquipment, unitNumber: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Hours</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Hours"
              value={currentEquipment.hours}
              onChange={(e) => setCurrentEquipment({ ...currentEquipment, hours: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Count</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Count"
              value={currentEquipment.count}
              onChange={(e) => setCurrentEquipment({ ...currentEquipment, count: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={() => {
              addEquipmentToBlock(block.id, currentEquipment.type, currentEquipment.hours, currentEquipment.count, currentEquipment.unitNumber)
              setCurrentEquipment({ type: '', hours: '', count: '', unitNumber: '' })
            }}
            style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '38px' }}
          >
            Add
          </button>
        </div>

        {block.equipmentEntries.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '450px' }}>
              <thead>
                <tr style={{ backgroundColor: '#b8daff' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Equipment</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Unit #</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>Hours</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}>Count</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}></th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {block.equipmentEntries.map(entry => {
                  const billedHours = (parseFloat(entry.hours) || 0) * (entry.count || 1)
                  const prodStatus = entry.productionStatus || 'ACTIVE'
                  const shadowHours = calculateShadowHours(billedHours, prodStatus, entry.shadowEffectiveHours)
                  const statusConfig = productionStatuses.find(s => s.value === prodStatus)
                  return (
                    <React.Fragment key={entry.id}>
                      <tr style={{ backgroundColor: '#fff' }}>
                        <td style={{ padding: '2px 4px', borderBottom: '1px solid #dee2e6' }}>
                          <SearchableSelect
                            value={entry.type}
                            onChange={(val) => updateEquipmentField(block.id, entry.id, 'type', val)}
                            options={equipmentTypes}
                            placeholder="Select"
                          />
                        </td>
                        <td style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                          <input
                            type="text"
                            value={entry.unitNumber || ''}
                            onChange={(e) => updateEquipmentUnitNumber(block.id, entry.id, e.target.value)}
                            placeholder="—"
                            style={{
                              width: '70px',
                              padding: '4px',
                              border: '1px solid #ced4da',
                              borderRadius: '3px',
                              textAlign: 'center',
                              fontSize: '12px'
                            }}
                          />
                        </td>
                        <td style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                          <input
                            type="number"
                            value={entry.hours || ''}
                            onChange={(e) => updateEquipmentField(block.id, entry.id, 'hours', e.target.value)}
                            placeholder="0"
                            style={{
                              width: '60px',
                              padding: '4px',
                              border: '1px solid #ced4da',
                              borderRadius: '3px',
                              textAlign: 'center',
                              fontSize: '12px'
                            }}
                          />
                        </td>
                        <td style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                          <input
                            type="number"
                            value={entry.count || ''}
                            onChange={(e) => updateEquipmentField(block.id, entry.id, 'count', e.target.value)}
                            placeholder="0"
                            style={{
                              width: '60px',
                              padding: '4px',
                              border: '1px solid #ced4da',
                              borderRadius: '3px',
                              textAlign: 'center',
                              fontSize: '12px'
                            }}
                          />
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                          <button
                            type="button"
                            onClick={() => toggleFlagRow(`eq_${entry.id}`)}
                            title={prodStatus !== 'ACTIVE' ? `Flagged: ${prodStatus === 'SYNC_DELAY' ? 'Downtime' : 'Standby'}` : 'Flag downtime or standby'}
                            style={{
                              padding: '4px 8px',
                              fontSize: '13px',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              backgroundColor: prodStatus === 'MANAGEMENT_DRAG' ? '#dc3545' : prodStatus === 'SYNC_DELAY' ? '#ffc107' : openFlagRows[`eq_${entry.id}`] ? '#6c757d' : '#e9ecef',
                              color: prodStatus !== 'ACTIVE' || openFlagRows[`eq_${entry.id}`] ? 'white' : '#666'
                            }}
                          >
                            {prodStatus === 'MANAGEMENT_DRAG' ? '!' : prodStatus === 'SYNC_DELAY' ? '!' : '\u270E'}
                          </button>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                          <button
                            onClick={() => removeEquipmentFromBlock(block.id, entry.id)}
                            style={{ padding: '2px 6px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                      {/* Flag Detail Row - shown when flag button is clicked or entry is already flagged */}
                      {(openFlagRows[`eq_${entry.id}`] || prodStatus !== 'ACTIVE') && (
                        <tr style={{ backgroundColor: prodStatus === 'MANAGEMENT_DRAG' ? '#fff5f5' : prodStatus === 'SYNC_DELAY' ? '#fffbf0' : '#f8f9fa' }}>
                          <td colSpan={6} style={{ padding: '10px 12px', borderBottom: '1px solid #dee2e6' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>Status:</span>
                                {[
                                  { value: 'ACTIVE', label: 'Working', color: '#28a745' },
                                  { value: 'SYNC_DELAY', label: 'Downtime', color: '#ffc107' },
                                  { value: 'MANAGEMENT_DRAG', label: 'Standby', color: '#dc3545' }
                                ].map(s => (
                                  <button
                                    key={s.value}
                                    type="button"
                                    onClick={() => {
                                      updateEquipmentProductionStatus(block.id, entry.id, s.value)
                                      if (s.value === 'ACTIVE') {
                                        setOpenFlagRows(prev => ({ ...prev, [`eq_${entry.id}`]: false }))
                                      }
                                    }}
                                    style={{
                                      padding: '5px 12px',
                                      fontSize: '12px',
                                      fontWeight: prodStatus === s.value ? 'bold' : 'normal',
                                      backgroundColor: prodStatus === s.value ? s.color : '#e9ecef',
                                      color: prodStatus === s.value ? 'white' : '#333',
                                      border: `1px solid ${prodStatus === s.value ? s.color : '#ced4da'}`,
                                      borderRadius: '4px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {s.label}
                                  </button>
                                ))}
                                {prodStatus !== 'ACTIVE' && (
                                  <span style={{ fontSize: '11px', color: '#666', marginLeft: '8px' }}>
                                    {prodStatus === 'SYNC_DELAY' ? 'Down hrs:' : 'Standby hrs:'} <input
                                      type="text"
                                      inputMode="decimal"
                                      value={entry.shadowEffectiveHours !== null && entry.shadowEffectiveHours !== undefined ? (billedHours - parseFloat(entry.shadowEffectiveHours)).toFixed(1) : ''}
                                      onChange={(e) => {
                                        const downtimeVal = parseFloat(e.target.value)
                                        if (e.target.value === '' || isNaN(downtimeVal)) {
                                          updateEquipmentShadowHours(block.id, entry.id, '')
                                        } else {
                                          const productiveHrs = Math.max(0, billedHours - downtimeVal)
                                          updateEquipmentShadowHours(block.id, entry.id, productiveHrs.toString())
                                        }
                                      }}
                                      placeholder="0.0"
                                      style={{ width: '45px', padding: '3px', border: '1px solid #ced4da', borderRadius: '3px', textAlign: 'center', fontSize: '12px' }}
                                    />
                                  </span>
                                )}
                              </div>
                              {prodStatus !== 'ACTIVE' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>Reason:</span>
                                  <select
                                    value={dragReasonCategories.some(r => r.label === entry.dragReason) ? entry.dragReason : '_custom'}
                                    onChange={(e) => { if (e.target.value !== '_custom') updateEquipmentDragReason(block.id, entry.id, e.target.value) }}
                                    style={{ padding: '4px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                                  >
                                    <option value="">-- Select reason --</option>
                                    {dragReasonCategories.map(r => (
                                      <option key={r.value} value={r.label}>{r.label} {r.responsibleParty === 'contractor' ? '🔧' : r.responsibleParty === 'owner' ? '🏛️' : ''}</option>
                                    ))}
                                    <option value="_custom">-- Custom --</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={dragReasonCategories.some(r => r.label === entry.dragReason) ? '' : (entry.dragReason || '')}
                                    onChange={(e) => updateEquipmentDragReason(block.id, entry.id, e.target.value)}
                                    onBlur={(e) => { if (e.target.value.trim()) saveCustomReason(e.target.value) }}
                                    placeholder="Or type custom reason..."
                                    style={{ flex: 1, padding: '4px 8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px', minWidth: '150px', maxWidth: '250px' }}
                                  />
                                  {(() => {
                                    const party = getResponsibleParty(entry.dragReason)
                                    if (!party) return null
                                    return <span style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 'bold', borderRadius: '12px', backgroundColor: party.bgColor, color: party.color, border: `1px solid ${party.color}`, whiteSpace: 'nowrap' }}>{party.icon} {party.label}</span>
                                  })()}
                                </div>
                              )}
                              {(() => {
                                const party = getResponsibleParty(entry.dragReason)
                                const needsNote = reasonRequiresNote(entry.dragReason) && prodStatus === 'MANAGEMENT_DRAG'
                                if (!needsNote) return null
                                const isContractor = party?.label === 'Contractor'
                                return (
                                  <div style={{ padding: '8px', backgroundColor: '#f8d7da', borderRadius: '4px', border: '1px solid #dc3545' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#721c24', marginBottom: '4px' }}>
                                      {isContractor ? '🔧 Contractor Issue Detail' : 'Issue Detail'} <span style={{ color: '#dc3545' }}>* Required</span>
                                    </label>
                                    <input type="text" value={entry.contractorDragNote || ''} onChange={(e) => updateEquipmentContractorNote(block.id, entry.id, e.target.value)}
                                      placeholder={isContractor ? "e.g., Equipment not maintained, Inadequate rigging, Operator error..." : "Describe the specific issue..."}
                                      style={{ width: '100%', padding: '6px 8px', border: entry.contractorDragNote?.trim() ? '1px solid #28a745' : '2px solid #dc3545', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                )
                              })()}
                            </div>
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
      </div>

      {/* Verification Summary - Billed vs Productive Hours */}
      {(() => {
        // Calculate metrics for this block
        const totalBilledHours = calculateTotalBilledHours(block)
        const totalShadowHours = calculateTotalShadowHours(block)
        const productivePercent = totalBilledHours > 0 ? (totalShadowHours / totalBilledHours) * 100 : 100
        const nonWorkingHours = totalBilledHours - totalShadowHours

        // Calculate linear metres (KP Difference)
        let linearMetres = 0
        if (block.startKP && block.endKP) {
          const startM = parseKPToMetres(block.startKP)
          const endM = parseKPToMetres(block.endKP)
          if (startM !== null && endM !== null) {
            linearMetres = Math.abs(endM - startM)
          }
        }

        // Check if any entry is marked as Full Production
        const hasActiveEntries = [
          ...(block.labourEntries || []),
          ...(block.equipmentEntries || [])
        ].some(entry => (entry.productionStatus || 'ACTIVE') === 'ACTIVE')

        // Verification needed conditions:
        // 1. High productivity % but low/no progress (< 50m)
        // 2. OR: Any entry marked Full Production but KP difference is 0
        const highProductivityLowProgress = productivePercent >= 80 && linearMetres < 50 && totalBilledHours > 0
        const fullProductionButZeroProgress = hasActiveEntries && linearMetres === 0 && totalBilledHours > 0
        const needsVerification = highProductivityLowProgress || fullProductionButZeroProgress

        // Always show verification summary when there are hours
        if (totalBilledHours === 0) return null

        return (
          <div style={{
            padding: '15px',
            backgroundColor: needsVerification ? '#fff3cd' : '#e8f5e9',
            borderRadius: '8px',
            border: needsVerification ? '2px solid #ffc107' : '1px solid #c3e6cb',
            marginBottom: '15px'
          }}>
            {/* Verification Summary Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, color: '#495057', fontSize: '14px' }}>
                📋 Verification Summary
              </h4>
              {!needsVerification && (
                <span style={{ fontSize: '12px', color: '#28a745', fontWeight: 'bold' }}>✓ Verified</span>
              )}
            </div>

            {/* Billed vs Productive Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: needsVerification ? '15px' : '0' }}>
              <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#495057' }}>{totalBilledHours.toFixed(1)}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Billed Hours</div>
              </div>
              <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#28a745' }}>{totalShadowHours.toFixed(1)}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Productive Hours</div>
              </div>
              <div style={{ textAlign: 'center', padding: '10px', backgroundColor: nonWorkingHours > 0 ? '#fff3cd' : '#fff', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: nonWorkingHours > 0 ? '#856404' : '#28a745' }}>{nonWorkingHours.toFixed(1)}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Non-Working Hours</div>
              </div>
            </div>

            {/* Additional context needed */}
            {needsVerification && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '18px' }}>📝</span>
                  <span style={{ fontSize: '12px', color: '#856404' }}>
                    {fullProductionButZeroProgress && linearMetres === 0
                      ? 'Full production status set but no KP progress recorded'
                      : `${productivePercent.toFixed(0)}% productive time with ${linearMetres}m progress`}
                  </span>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#495057', marginBottom: '6px' }}>
                    Please add a note explaining site conditions: <span style={{ color: '#dc3545' }}>*</span>
                  </label>
                  <ShieldedInput
                    as="textarea"
                    value={block.reliability_notes || ''}
                    onChange={(val) => updateBlock(block.id, 'reliability_notes', val)}
                    placeholder="Examples: Setup day for new spread, equipment mobilization, safety stand-down, waiting for survey crew..."
                    style={{
                      width: '100%',
                      minHeight: '70px',
                      padding: '10px',
                      border: block.reliability_notes?.trim() ? '1px solid #28a745' : '2px solid #ffc107',
                      borderRadius: '4px',
                      fontSize: '13px',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      backgroundColor: block.reliability_notes?.trim() ? '#fff' : '#fffbf0'
                    }}
                  />
                  {!block.reliability_notes?.trim() && (
                    <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#856404' }}>
                      A brief note helps document the site conditions accurately.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )
      })()}

      {/* Work Photos */}
      <div style={{ padding: '15px', backgroundColor: '#e9ecef', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#495057' }}>📷 Work Photos</h4>
        {['Lower-in', 'Backfill', 'Coating', 'HD Bores', 'HDD', 'Frost Packing'].includes(block.activityType) && (
          <div style={{
            padding: '10px 12px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '6px',
            marginBottom: '12px',
            fontSize: '13px',
            color: '#856404'
          }}>
            <strong>Concealed-work activity</strong> — This work will be permanently buried or hidden. Take photos <strong>before</strong> it is covered up (e.g., pipe position, coating condition, padding placement). These photos serve as visual evidence for audit and regulatory compliance.
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
          <label style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>
            📁 Upload from Gallery
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleWorkPhotosSelect(block.id, e)}
              style={{ display: 'none' }}
            />
          </label>
          <label style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>
            📷 Take Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleWorkPhotosSelect(block.id, e)}
              style={{ display: 'none' }}
            />
          </label>
          <span style={{ color: '#666', fontSize: '13px', alignSelf: 'center' }}>
            {block.workPhotos.length > 0 ? `${block.workPhotos.length} photo(s) added` : 'No photos yet'}
          </span>
        </div>
        
        {block.workPhotos.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginTop: '15px' }}>
            <thead>
              <tr style={{ backgroundColor: '#dee2e6' }}>
                <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Preview</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Filename</th>
                <th style={{ padding: '8px', textAlign: 'left', width: '120px' }}>Location (KP)</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {block.workPhotos.map((photo, photoIdx) => {
                // Handle both new File objects and saved photos from database
                const photoSrc = photo.file instanceof File ? URL.createObjectURL(photo.file) : photo.savedUrl || null
                const photoName = photo.file instanceof File ? photo.file.name : (photo.originalName || photo.filename || 'Saved photo')
                return (
                <tr key={photoIdx} style={{ backgroundColor: '#fff' }}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', textAlign: 'center' }}>
                    {photoSrc ? (
                    <img
                      src={photoSrc}
                      alt={`Photo ${photoIdx + 1}`}
                      style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                      onClick={() => window.open(photoSrc, '_blank')}
                    />
                    ) : (
                    <span style={{ fontSize: '11px', color: '#999' }}>No preview</span>
                    )}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', fontSize: '12px' }}>{photoName}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                    <input
                      type="text"
                      value={photo.location}
                      onChange={(e) => updatePhotoMetadata(block.id, photoIdx, 'location', e.target.value)}
                      placeholder="e.g. 5+250"
                      style={{ width: '100%', padding: '4px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                    <input
                      type="text"
                      value={photo.description}
                      onChange={(e) => updatePhotoMetadata(block.id, photoIdx, 'description', e.target.value)}
                      placeholder="Description..."
                      style={{ width: '100%', padding: '4px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                    <button
                      onClick={() => removeWorkPhoto(block.id, photoIdx)}
                      style={{ padding: '2px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Wrap in React.memo for performance - only re-render when props change
export default memo(ActivityBlock)
