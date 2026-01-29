// ActivityBlock.jsx - Extracted from InspectorReport.jsx
// A single activity block component with all rendering logic
import React, { useState, useEffect, memo } from 'react'
import { activityTypes, qualityFieldsByActivity, labourClassifications, equipmentTypes, timeLostReasons, productionStatuses, dragReasonCategories, impactScopes, responsiblePartyConfig } from './constants.js'
import { syncKPFromGPS } from './kpUtils.js'
import { supabase } from './supabase'
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

// Get responsible party from drag reason (by label or value)
function getResponsibleParty(dragReason) {
  if (!dragReason) return null
  const reasonConfig = dragReasonCategories.find(
    r => r.label === dragReason || r.value === dragReason
  )
  if (!reasonConfig || !reasonConfig.responsibleParty) return null
  return responsiblePartyConfig[reasonConfig.responsibleParty] || null
}

// SearchableSelect component - type to filter dropdown
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  style = {}
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = React.useRef(null)
  const inputRef = React.useRef(null)

  // Filter options based on search text - matches all words in any order
  const filteredOptions = options.filter(opt => {
    if (!searchText.trim()) return true
    const optLower = opt.toLowerCase().replace(/-/g, ' ')
    const searchWords = searchText.toLowerCase().split(/\s+/).filter(w => w)
    return searchWords.every(word => optLower.includes(word))
  })

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setSearchText('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0)
  }, [searchText])

  const handleSelect = (opt) => {
    onChange(opt)
    setIsOpen(false)
    setSearchText('')
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
        setSearchText('')
        break
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      <div
        tabIndex={0}
        onClick={() => {
          setIsOpen(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        onFocus={() => {
          // Open dropdown when tabbing into the component
          if (!isOpen) {
            setIsOpen(true)
            setTimeout(() => inputRef.current?.focus(), 0)
          }
        }}
        onKeyDown={(e) => {
          // Handle Enter/Space when focused but closed
          if (!isOpen && (e.key === 'Enter' || e.key === ' ')) {
            setIsOpen(true)
            setTimeout(() => inputRef.current?.focus(), 0)
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
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type to search..."
            style={{
              border: 'none',
              outline: 'none',
              width: '100%',
              fontSize: '14px',
              padding: 0,
              backgroundColor: 'transparent'
            }}
            autoFocus
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
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          border: '1px solid #ced4da',
          borderRadius: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          maxHeight: '250px',
          overflowY: 'auto',
          marginTop: '2px'
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
  updateLabourJH,
  updateLabourProductionStatus,
  updateLabourShadowHours,
  updateLabourDragReason,
  updateLabourContractorNote,
  removeLabourFromBlock,
  addEquipmentToBlock,
  updateEquipmentProductionStatus,
  updateEquipmentShadowHours,
  updateEquipmentDragReason,
  updateEquipmentContractorNote,
  updateSystemicDelay,
  removeEquipmentFromBlock,
  handleWorkPhotosSelect,
  updatePhotoMetadata,
  removeWorkPhoto,
  // For section toggle
  setActivityBlocks,
  activityBlocks
}) {
  // Local state for input fields
  const [currentLabour, setCurrentLabour] = useState({ 
    employeeName: '', 
    classification: '', 
    rt: '', 
    ot: '', 
    jh: '', 
    count: '1' 
  })
  const [currentEquipment, setCurrentEquipment] = useState({ type: '', hours: '', count: '' })
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [ocrError, setOcrError] = useState(null)
  
  // Collapsible QA sections state (for Access activity)
  const [expandedSections, setExpandedSections] = useState({})
  
  const toggleSection = (sectionName) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }))
  }

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
        
        // Fetch all previous reports
        const { data: reports, error } = await supabase
          .from('daily_tickets')
          .select('activity_blocks, date')
          .lt('date', selectedDate)
          .order('date', { ascending: false })
        
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

  // OCR Processing for contractor tickets
  const processTicketOCR = async (blockId, imageFile) => {
    setOcrProcessing(true)
    setOcrError(null)
    
    try {
      const reader = new FileReader()
      const base64Promise = new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(imageFile)
      })
      
      const base64Image = await base64Promise
      
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
                source: { type: 'base64', media_type: imageFile.type, data: base64Image }
              },
              {
                type: 'text',
                text: `Extract labour and equipment data from this contractor daily ticket. Return JSON only:
{
  "ticketNumber": "string or null",
  "contractor": "string or null", 
  "foreman": "string or null",
  "labour": [{"classification": "string", "rt": number, "ot": number, "count": number}],
  "equipment": [{"type": "string", "hours": number, "count": number}]
}

Match classifications to: ${labourClassifications.slice(0, 20).join(', ')}...
Match equipment to: ${equipmentTypes.slice(0, 20).join(', ')}...`
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
        
        if (data.labour && Array.isArray(data.labour)) {
          data.labour.forEach(l => {
            if (l.classification) {
              addLabourToBlock(blockId, '', l.classification, l.rt || 0, l.ot || 0, 0, l.count || 1)
            }
          })
        }
        
        if (data.equipment && Array.isArray(data.equipment)) {
          data.equipment.forEach(e => {
            if (e.type) {
              addEquipmentToBlock(blockId, e.type, e.hours || 0, e.count || 1)
            }
          })
        }
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

    if (block.activityType === 'Coating') {
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

    if (block.activityType === 'Tie-in Completion') {
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
          <textarea
            value={block.qualityData[field.name] || ''}
            onChange={(e) => updateQualityData(block.id, field.name, e.target.value)}
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
            type={field.type}
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
  const individualStatusTooltips = {
    ACTIVE: 'Active: Working efficiently at full productivity (100%)',
    SYNC_DELAY: 'Sync Delay: Partial work - waiting for materials, coordination issues (70% productivity)',
    MANAGEMENT_DRAG: 'Mgmt Drag: Complete stop - permits, regulatory, instructions needed (0% productivity)'
  }

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
              title={individualStatusTooltips[status.value]}
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
              {status.value === 'ACTIVE' ? '✓' : status.value === 'SYNC_DELAY' ? '⏳' : '⛔'}
            </button>
          ))}
          {needsReason && onReasonChange && (
            <span
              style={{ fontSize: '9px', color: '#6f42c1', cursor: 'pointer', marginLeft: '4px' }}
              onClick={() => setShowReasonInput(!showReasonInput)}
              title="Click to add/edit delay reason"
            >
              {reason ? '✎' : '+reason'}
            </span>
          )}
        </div>
        {showReasonInput && needsReason && onReasonChange && (
          <input
            type="text"
            value={reason || ''}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Delay reason..."
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '15px', marginBottom: '20px', overflow: 'hidden' }}>
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
        <div style={{ overflow: 'hidden', minWidth: 0 }}>
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
                padding: '8px 12px',
                backgroundColor: syncingKP ? '#6c757d' : '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: syncingKP ? 'wait' : 'pointer',
                fontSize: '12px',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {syncingKP ? '...' : 'GPS'}
            </button>
          </div>
        </div>
        <div style={{ overflow: 'hidden', minWidth: 0 }}>
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
                padding: '8px 12px',
                backgroundColor: syncingKP ? '#6c757d' : '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: syncingKP ? 'wait' : 'pointer',
                fontSize: '12px',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
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
            type="number"
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
            type="number"
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
            type="number"
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
            <textarea
              value={chainageReasons[block.id]?.overlapReason || ''}
              onChange={(e) => setChainageReasons({
                ...chainageReasons,
                [block.id]: { ...chainageReasons[block.id], overlapReason: e.target.value }
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
            <textarea
              value={chainageReasons[block.id]?.gapReason || ''}
              onChange={(e) => setChainageReasons({
                ...chainageReasons,
                [block.id]: { ...chainageReasons[block.id], gapReason: e.target.value }
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
        <textarea
          value={block.workDescription}
          onChange={(e) => updateBlock(block.id, 'workDescription', e.target.value)}
          placeholder="Describe the work performed... (use 🎤 for voice input)"
          rows={3}
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

      {/* Quality Checks */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px', overflow: 'hidden' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#856404' }}>⚙️ Quality Checks</h4>
        {renderQualityFields()}
      </div>

      {/* Daily Contractor Ticket */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '8px' }}>
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
          <label style={{ padding: '10px 20px', backgroundColor: '#17a2b8', color: 'white', borderRadius: '4px', cursor: ocrProcessing ? 'wait' : 'pointer', fontSize: '14px', opacity: ocrProcessing ? 0.7 : 1 }}>
            {ocrProcessing ? '⏳ Processing...' : '📷 Scan Ticket (OCR)'}
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
        </div>
        {ocrError && (
          <p style={{ color: '#dc3545', fontSize: '13px', margin: '10px 0' }}>{ocrError}</p>
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
              ⏱️ Did the entire crew experience a delay?
            </span>
            <button
              type="button"
              onClick={() => updateSystemicDelay(block.id, { active: true, status: 'SYNC_DELAY', reason: '' })}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 'bold',
                backgroundColor: '#6f42c1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Report Crew Delay
            </button>
          </div>
        ) : (
          // Full controls when active
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '14px', color: systemicStatusConfig?.color || '#dc3545' }}>
                ⚠️ Crew-Wide Delay Active
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
                ✕ Cancel
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
                        {s.value === 'SYNC_DELAY' ? '⏳ Sync Delay' : '⛔ Mgmt Drag'}
                      </button>
                    </div>
                  ))}
                </div>
                {/* Explanation text below buttons */}
                <div style={{ fontSize: '10px', color: '#666', maxWidth: '280px', lineHeight: '1.3' }}>
                  <strong>⏳ Sync Delay</strong>: Partial work (70%) - waiting for materials, coordination<br/>
                  <strong>⛔ Mgmt Drag</strong>: Full stop (0%) - permits, regulatory, instructions needed
                </div>
              </div>

              {/* Delay Reason - simple text input with info box */}
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#666' }}>
                    Delay Reason:
                  </label>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#6f42c1',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                    onClick={() => alert(delayReasonExamples)}
                  >
                    [see examples]
                  </span>
                </div>
                <input
                  type="text"
                  value={reasonInputValue}
                  onChange={(e) => {
                    setReasonInputValue(e.target.value)
                  }}
                  onBlur={() => {
                    // Save custom reason and update block if not empty
                    if (reasonInputValue.trim()) {
                      saveCustomReason(reasonInputValue)
                      updateSystemicDelay(block.id, { ...block.systemicDelay, reason: reasonInputValue.trim() })
                    }
                  }}
                  placeholder="Type delay reason..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    border: `1px solid ${systemicStatusConfig?.color || '#ced4da'}`,
                    borderRadius: '4px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
              This delay applies to ALL manpower and equipment entries below.
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
            <input
              type="text"
              placeholder="Name"
              value={currentLabour.employeeName}
              onChange={(e) => setCurrentLabour({ ...currentLabour, employeeName: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
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
              type="number"
              placeholder="8"
              value={currentLabour.rt}
              onChange={(e) => setCurrentLabour({ ...currentLabour, rt: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #28a745', borderRadius: '4px', backgroundColor: '#d4edda', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#856404' }}>OT</label>
            <input
              type="number"
              placeholder="0"
              value={currentLabour.ot}
              onChange={(e) => setCurrentLabour({ ...currentLabour, ot: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ffc107', borderRadius: '4px', backgroundColor: '#fff3cd', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#004085' }}>JH</label>
            <input
              type="number"
              placeholder="0"
              value={currentLabour.jh}
              onChange={(e) => setCurrentLabour({ ...currentLabour, jh: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #007bff', borderRadius: '4px', backgroundColor: '#cce5ff', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Count</label>
            <input
              type="number"
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '700px' }}>
              <thead>
                <tr style={{ backgroundColor: '#c3e6cb' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Employee</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Classification</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '45px' }}>RT</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '45px' }}>OT</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '55px' }}>JH</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}>Cnt</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '75px', backgroundColor: '#e2d5f1' }}>Status</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '55px', backgroundColor: '#e2d5f1' }}>Shadow</th>
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
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #dee2e6' }}>{entry.employeeName || '-'}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #dee2e6', fontSize: '12px' }}>{entry.classification}</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: '#d4edda' }}>{rt}</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: ot > 0 ? '#fff3cd' : '#fff' }}>{ot > 0 ? ot : '-'}</td>
                        <td style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: jh > 0 ? '#cce5ff' : '#fff' }}>
                          <input
                            type="number"
                            value={jh || ''}
                            onChange={(e) => updateLabourJH(block.id, entry.id, e.target.value)}
                            placeholder="0"
                            style={{ width: '40px', padding: '4px', border: '1px solid #ced4da', borderRadius: '3px', textAlign: 'center', fontSize: '12px' }}
                          />
                        </td>
                        <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{entry.count}</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: '#f8f5fc' }}>
                          <ProductionStatusToggle
                            value={prodStatus}
                            onChange={(status) => updateLabourProductionStatus(block.id, entry.id, status)}
                          />
                        </td>
                        <td style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: '#f8f5fc' }}>
                          <input
                            type="number"
                            value={entry.shadowEffectiveHours !== null && entry.shadowEffectiveHours !== undefined ? entry.shadowEffectiveHours : shadowHours.toFixed(1)}
                            onChange={(e) => updateLabourShadowHours(block.id, entry.id, e.target.value)}
                            style={{
                              width: '45px',
                              padding: '4px',
                              border: `1px solid ${statusConfig?.color || '#ced4da'}`,
                              borderRadius: '3px',
                              textAlign: 'center',
                              fontSize: '12px',
                              backgroundColor: entry.shadowEffectiveHours !== null ? '#fff3cd' : '#fff'
                            }}
                            title={entry.shadowEffectiveHours !== null ? 'Manual override' : 'Auto-calculated'}
                          />
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
                      {/* Drag Reason Row - shown when status is not ACTIVE */}
                      {prodStatus !== 'ACTIVE' && (
                        <tr style={{ backgroundColor: statusConfig?.color === '#ffc107' ? '#fffbf0' : '#fff5f5' }}>
                          <td colSpan={9} style={{ padding: '6px 8px', borderBottom: '1px solid #dee2e6' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', fontWeight: 'bold', color: statusConfig?.color }}>
                                Delay Reason:
                              </span>
                              <select
                                value={dragReasonCategories.some(r => r.label === entry.dragReason) ? entry.dragReason : '_custom'}
                                onChange={(e) => {
                                  if (e.target.value !== '_custom') {
                                    updateLabourDragReason(block.id, entry.id, e.target.value)
                                  }
                                }}
                                style={{
                                  padding: '4px 8px',
                                  border: `1px solid ${statusConfig?.color || '#ced4da'}`,
                                  borderRadius: '4px',
                                  fontSize: '12px'
                                }}
                              >
                                <option value="">-- Select common reason --</option>
                                {dragReasonCategories.map(r => (
                                  <option key={r.value} value={r.label}>
                                    {r.label} {r.responsibleParty === 'contractor' ? '🔧' : r.responsibleParty === 'owner' ? '🏛️' : ''}
                                  </option>
                                ))}
                                <option value="_custom">-- Or type custom below --</option>
                              </select>
                              <span style={{ fontSize: '11px', color: '#666' }}>or</span>
                              <input
                                type="text"
                                value={entry.dragReason || ''}
                                onChange={(e) => updateLabourDragReason(block.id, entry.id, e.target.value)}
                                onBlur={(e) => {
                                  if (e.target.value.trim()) {
                                    saveCustomReason(e.target.value)
                                  }
                                }}
                                placeholder="Type custom reason..."
                                style={{
                                  flex: 1,
                                  padding: '4px 8px',
                                  border: `1px solid ${statusConfig?.color || '#ced4da'}`,
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  minWidth: '150px',
                                  maxWidth: '250px'
                                }}
                              />
                              {/* Responsible Party Badge - auto-assigned based on drag reason */}
                              {(() => {
                                const party = getResponsibleParty(entry.dragReason)
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
                                      border: `1px solid ${party.color}`,
                                      whiteSpace: 'nowrap'
                                    }}
                                    title={`Accountability: ${party.label}`}
                                  >
                                    {party.icon} {party.label}
                                  </span>
                                )
                              })()}
                            </div>
                            {/* Mandatory Contractor Drag Note - required when contractor + Management Drag */}
                            {(() => {
                              const party = getResponsibleParty(entry.dragReason)
                              const isContractorManagementDrag = party?.label === 'Contractor' && prodStatus === 'MANAGEMENT_DRAG'
                              if (!isContractorManagementDrag) return null
                              return (
                                <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f8d7da', borderRadius: '4px', border: '1px solid #dc3545' }}>
                                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#721c24', marginBottom: '4px' }}>
                                    🔧 Contractor Failure Detail <span style={{ color: '#dc3545' }}>* Required</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={entry.contractorDragNote || ''}
                                    onChange={(e) => updateLabourContractorNote(block.id, entry.id, e.target.value)}
                                    placeholder="e.g., Ditch not dug to spec, Foreman absent from ROW, Equipment not maintained..."
                                    style={{
                                      width: '100%',
                                      padding: '6px 8px',
                                      border: entry.contractorDragNote?.trim() ? '1px solid #28a745' : '2px solid #dc3545',
                                      borderRadius: '4px',
                                      fontSize: '12px',
                                      boxSizing: 'border-box',
                                      backgroundColor: entry.contractorDragNote?.trim() ? '#fff' : '#fff5f5'
                                    }}
                                  />
                                  {!entry.contractorDragNote?.trim() && (
                                    <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#dc3545' }}>
                                      Explain the specific contractor failure for accountability tracking
                                    </p>
                                  )}
                                </div>
                              )
                            })()}
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
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px auto', gap: '15px', marginBottom: '15px', alignItems: 'end' }}>
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
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Hours</label>
            <input
              type="number"
              placeholder="Hours"
              value={currentEquipment.hours}
              onChange={(e) => setCurrentEquipment({ ...currentEquipment, hours: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Count</label>
            <input
              type="number"
              placeholder="Count"
              value={currentEquipment.count}
              onChange={(e) => setCurrentEquipment({ ...currentEquipment, count: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={() => {
              addEquipmentToBlock(block.id, currentEquipment.type, currentEquipment.hours, currentEquipment.count)
              setCurrentEquipment({ type: '', hours: '', count: '' })
            }}
            style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '38px' }}
          >
            Add
          </button>
        </div>

        {block.equipmentEntries.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '550px' }}>
              <thead>
                <tr style={{ backgroundColor: '#b8daff' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Equipment</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>Hours</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}>Count</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '75px', backgroundColor: '#e2d5f1' }}>Status</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '55px', backgroundColor: '#e2d5f1' }}>Shadow</th>
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
                        <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>{entry.type}</td>
                        <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{entry.hours}</td>
                        <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{entry.count}</td>
                        <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: '#f8f5fc' }}>
                          <ProductionStatusToggle
                            value={prodStatus}
                            onChange={(status) => updateEquipmentProductionStatus(block.id, entry.id, status)}
                          />
                        </td>
                        <td style={{ padding: '2px', textAlign: 'center', borderBottom: '1px solid #dee2e6', backgroundColor: '#f8f5fc' }}>
                          <input
                            type="number"
                            value={entry.shadowEffectiveHours !== null && entry.shadowEffectiveHours !== undefined ? entry.shadowEffectiveHours : shadowHours.toFixed(1)}
                            onChange={(e) => updateEquipmentShadowHours(block.id, entry.id, e.target.value)}
                            style={{
                              width: '45px',
                              padding: '4px',
                              border: `1px solid ${statusConfig?.color || '#ced4da'}`,
                              borderRadius: '3px',
                              textAlign: 'center',
                              fontSize: '12px',
                              backgroundColor: entry.shadowEffectiveHours !== null ? '#fff3cd' : '#fff'
                            }}
                            title={entry.shadowEffectiveHours !== null ? 'Manual override' : 'Auto-calculated'}
                          />
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
                      {/* Drag Reason Row - shown when status is not ACTIVE */}
                      {prodStatus !== 'ACTIVE' && (
                        <tr style={{ backgroundColor: statusConfig?.color === '#ffc107' ? '#fffbf0' : '#fff5f5' }}>
                          <td colSpan={6} style={{ padding: '6px 8px', borderBottom: '1px solid #dee2e6' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', fontWeight: 'bold', color: statusConfig?.color }}>
                                Delay Reason:
                              </span>
                              <select
                                value={dragReasonCategories.some(r => r.label === entry.dragReason) ? entry.dragReason : '_custom'}
                                onChange={(e) => {
                                  if (e.target.value !== '_custom') {
                                    updateEquipmentDragReason(block.id, entry.id, e.target.value)
                                  }
                                }}
                                style={{
                                  padding: '4px 8px',
                                  border: `1px solid ${statusConfig?.color || '#ced4da'}`,
                                  borderRadius: '4px',
                                  fontSize: '12px'
                                }}
                              >
                                <option value="">-- Select common reason --</option>
                                {dragReasonCategories.map(r => (
                                  <option key={r.value} value={r.label}>
                                    {r.label} {r.responsibleParty === 'contractor' ? '🔧' : r.responsibleParty === 'owner' ? '🏛️' : ''}
                                  </option>
                                ))}
                                <option value="_custom">-- Or type custom below --</option>
                              </select>
                              <span style={{ fontSize: '11px', color: '#666' }}>or</span>
                              <input
                                type="text"
                                value={entry.dragReason || ''}
                                onChange={(e) => updateEquipmentDragReason(block.id, entry.id, e.target.value)}
                                onBlur={(e) => {
                                  if (e.target.value.trim()) {
                                    saveCustomReason(e.target.value)
                                  }
                                }}
                                placeholder="Type custom reason..."
                                style={{
                                  flex: 1,
                                  padding: '4px 8px',
                                  border: `1px solid ${statusConfig?.color || '#ced4da'}`,
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  minWidth: '150px',
                                  maxWidth: '250px'
                                }}
                              />
                              {/* Responsible Party Badge - auto-assigned based on drag reason */}
                              {(() => {
                                const party = getResponsibleParty(entry.dragReason)
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
                                      border: `1px solid ${party.color}`,
                                      whiteSpace: 'nowrap'
                                    }}
                                    title={`Accountability: ${party.label}`}
                                  >
                                    {party.icon} {party.label}
                                  </span>
                                )
                              })()}
                            </div>
                            {/* Mandatory Contractor Drag Note - required when contractor + Management Drag */}
                            {(() => {
                              const party = getResponsibleParty(entry.dragReason)
                              const isContractorManagementDrag = party?.label === 'Contractor' && prodStatus === 'MANAGEMENT_DRAG'
                              if (!isContractorManagementDrag) return null
                              return (
                                <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f8d7da', borderRadius: '4px', border: '1px solid #dc3545' }}>
                                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#721c24', marginBottom: '4px' }}>
                                    🔧 Contractor Failure Detail <span style={{ color: '#dc3545' }}>* Required</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={entry.contractorDragNote || ''}
                                    onChange={(e) => updateEquipmentContractorNote(block.id, entry.id, e.target.value)}
                                    placeholder="e.g., Equipment not maintained, Inadequate rigging, Operator error..."
                                    style={{
                                      width: '100%',
                                      padding: '6px 8px',
                                      border: entry.contractorDragNote?.trim() ? '1px solid #28a745' : '2px solid #dc3545',
                                      borderRadius: '4px',
                                      fontSize: '12px',
                                      boxSizing: 'border-box',
                                      backgroundColor: entry.contractorDragNote?.trim() ? '#fff' : '#fff5f5'
                                    }}
                                  />
                                  {!entry.contractorDragNote?.trim() && (
                                    <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#dc3545' }}>
                                      Explain the specific contractor failure for accountability tracking
                                    </p>
                                  )}
                                </div>
                              )
                            })()}
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

      {/* Truth Trigger - Productivity Mismatch Detection */}
      {(() => {
        // Calculate metrics for this block
        const totalBilledHours = calculateTotalBilledHours(block)
        const totalShadowHours = calculateTotalShadowHours(block)
        const inertiaRatio = totalBilledHours > 0 ? (totalShadowHours / totalBilledHours) * 100 : 0

        // Calculate linear metres (KP Difference)
        let linearMetres = 0
        if (block.startKP && block.endKP) {
          const startM = parseKPToMetres(block.startKP)
          const endM = parseKPToMetres(block.endKP)
          if (startM !== null && endM !== null) {
            linearMetres = Math.abs(endM - startM)
          }
        }

        // Check if any entry is marked as ACTIVE (multiplier 1.0)
        const hasActiveEntries = [
          ...(block.labourEntries || []),
          ...(block.equipmentEntries || [])
        ].some(entry => (entry.productionStatus || 'ACTIVE') === 'ACTIVE')

        // Truth Trigger conditions:
        // 1. High efficiency (>= 80%) but low/no progress (< 50m)
        // 2. OR: Any entry marked ACTIVE but KP difference is 0
        const highEfficiencyLowProgress = inertiaRatio >= 80 && linearMetres < 50 && totalBilledHours > 0
        const activeButZeroProgress = hasActiveEntries && linearMetres === 0 && totalBilledHours > 0

        const isTruthTrigger = highEfficiencyLowProgress || activeButZeroProgress

        if (!isTruthTrigger) return null

        // Determine trigger reason for display
        const triggerReason = activeButZeroProgress && linearMetres === 0
          ? 'Production Status marked "Active" but KP difference is 0'
          : `Inertia Ratio: ${inertiaRatio.toFixed(0)}% (high productivity) | Linear Metres: ${linearMetres}m (low progress)`

        return (
          <div style={{
            padding: '15px',
            backgroundColor: '#f8d7da',
            borderRadius: '8px',
            border: '2px solid #dc3545',
            marginBottom: '15px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '24px' }}>🚨</span>
              <div>
                <h4 style={{ margin: 0, color: '#721c24', fontSize: '14px' }}>
                  Productivity Mismatch Detected
                </h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#856404' }}>
                  {triggerReason}
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#721c24', marginBottom: '6px' }}>
                Please explain the cause of low progress: <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <textarea
                value={block.reliability_notes || ''}
                onChange={(e) => updateBlock(block.id, 'reliability_notes', e.target.value)}
                placeholder="Examples: Setup day for new spread, equipment mobilization, safety stand-down for training, waiting for survey crew, material delivery delays..."
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '10px',
                  border: block.reliability_notes?.trim() ? '1px solid #28a745' : '2px solid #dc3545',
                  borderRadius: '4px',
                  fontSize: '13px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  backgroundColor: block.reliability_notes?.trim() ? '#fff' : '#fff5f5'
                }}
                required
              />
              {!block.reliability_notes?.trim() && (
                <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#dc3545', fontWeight: 'bold' }}>
                  This explanation is required before submitting the report.
                </p>
              )}
            </div>

            <div style={{ fontSize: '11px', color: '#666', padding: '8px', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: '4px' }}>
              <strong>Why this matters:</strong> High productive time with minimal progress may indicate
              data entry issues or legitimate circumstances (mobilization, setup, weather). Your explanation
              helps verify data integrity and provides context for project analysis.
            </div>
          </div>
        )
      })()}

      {/* Work Photos */}
      <div style={{ padding: '15px', backgroundColor: '#e9ecef', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#495057' }}>📷 Work Photos</h4>
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
              {block.workPhotos.map((photo, photoIdx) => (
                <tr key={photoIdx} style={{ backgroundColor: '#fff' }}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', textAlign: 'center' }}>
                    <img 
                      src={URL.createObjectURL(photo.file)} 
                      alt={`Photo ${photoIdx + 1}`}
                      style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                      onClick={() => window.open(URL.createObjectURL(photo.file), '_blank')}
                    />
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6', fontSize: '12px' }}>{photo.file.name}</td>
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// Wrap in React.memo for performance - only re-render when props change
export default memo(ActivityBlock)
