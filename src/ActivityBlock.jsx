// ActivityBlock.jsx - Extracted from InspectorReport.jsx
// A single activity block component with all rendering logic
import React, { useState, memo } from 'react'
import { activityTypes, qualityFieldsByActivity, labourClassifications, equipmentTypes, timeLostReasons } from './constants.js'
import { syncKPFromGPS } from './kpUtils.js'

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
import DitchLog from './DitchLog.jsx'
import GradingLog from './GradingLog.jsx'
import CounterboreTransitionLog from './CounterboreTransitionLog.jsx'

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
  addLabourToBlock,
  updateLabourJH,
  removeLabourFromBlock,
  addEquipmentToBlock,
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

  // GPS KP Sync state
  const [syncingKP, setSyncingKP] = useState(false)
  const [kpSyncToast, setKpSyncToast] = useState(null) // { type: 'success' | 'warning' | 'error', message: string }

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
          reportId={null}
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
          reportId={null}
          existingData={block.bendData || {}}
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
          reportId={null}
          existingData={block.stringData || {}}
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
          reportId={null}
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
          reportId={null}
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
        <DitchLog
          data={block.ditchData || {}}
          onChange={(data) => updateDitchData(block.id, data)}
          contractor={block.contractor}
          foreman={block.foreman}
          reportDate={selectedDate}
          startKP={block.startKP}
          endKP={block.endKP}
          metersToday={calculateMetersToday(block)}
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

    // Default quality fields
    if (!qualityFieldsByActivity[block.activityType]) {
      return <p style={{ color: '#666', fontStyle: 'italic' }}>No quality checks defined for this activity</p>
    }

    const fields = qualityFieldsByActivity[block.activityType]
    if (fields.length === 0) {
      return <p style={{ color: '#666', fontStyle: 'italic' }}>Quality data handled by specialized component</p>
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
        {fields.map(field => (
          <div key={field.name}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>{field.label}</label>
            {field.type === 'select' ? (
              <select
                value={block.qualityData[field.name] || ''}
                onChange={(e) => updateQualityData(block.id, field.name, e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
              >
                <option value="">Select...</option>
                {field.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                value={block.qualityData[field.name] || ''}
                onChange={(e) => updateQualityData(block.id, field.name, e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  const status = blockChainageStatus || {}

  return (
    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '2px solid #007bff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '15px' }}>
        <h2 style={{ margin: 0, color: '#007bff' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Activity Type *</label>
          <select
            value={block.activityType}
            onChange={(e) => updateBlock(block.id, 'activityType', e.target.value)}
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
          >
            <option value="">Select Activity</option>
            {activityTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Contractor</label>
          <input
            type="text"
            value={block.contractor}
            onChange={(e) => updateBlock(block.id, 'contractor', e.target.value)}
            placeholder="Contractor name"
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Foreman</label>
          <input
            type="text"
            value={block.foreman}
            onChange={(e) => updateBlock(block.id, 'foreman', e.target.value)}
            placeholder="Foreman name"
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px' }}
          />
        </div>
        <div>
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={block.startKP}
              onChange={(e) => updateBlock(block.id, 'startKP', e.target.value)}
              placeholder="e.g. 5+250"
              style={{ 
                flex: 1, 
                padding: '10px', 
                border: status.hasOverlap ? '2px solid #dc3545' : status.hasGap ? '2px solid #ffc107' : '1px solid #ced4da', 
                borderRadius: '4px',
                backgroundColor: status.hasOverlap ? '#fff5f5' : status.hasGap ? '#fffbf0' : 'white'
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
              {syncingKP ? '⏳' : '📍'} GPS
            </button>
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
            End KP
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={block.endKP}
              onChange={(e) => updateBlock(block.id, 'endKP', e.target.value)}
              placeholder="e.g. 6+100"
              style={{ 
                flex: 1, 
                padding: '10px', 
                border: status.hasOverlap ? '2px solid #dc3545' : status.hasGap ? '2px solid #ffc107' : '1px solid #ced4da', 
                borderRadius: '4px',
                backgroundColor: status.hasOverlap ? '#fff5f5' : status.hasGap ? '#fffbf0' : 'white'
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
              {syncingKP ? '⏳' : '📍'} GPS
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
        gap: '15px', 
        marginBottom: '15px',
        padding: '12px',
        backgroundColor: '#e8f4f8',
        borderRadius: '6px',
        border: '1px solid #bee5eb'
      }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#0c5460' }}>
            📏 Metres Today
          </label>
          <input
            type="number"
            value={block.metersToday || ''}
            onChange={(e) => {
              updateBlock(block.id, 'metersToday', e.target.value)
              const today = parseFloat(e.target.value) || 0
              const previous = parseFloat(block.metersPrevious) || 0
              updateBlock(block.id, 'metersToDate', (today + previous).toString())
            }}
            placeholder="0"
            style={{ width: '100%', padding: '10px', border: '2px solid #17a2b8', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', textAlign: 'center' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>
            📊 Metres Previous
          </label>
          <input
            type="number"
            value={block.metersPrevious || ''}
            readOnly
            style={{ width: '100%', padding: '10px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '14px', textAlign: 'center', backgroundColor: '#e9ecef', color: '#666' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#155724' }}>
            ✓ Metres To Date
          </label>
          <input
            type="number"
            value={block.metersToDate || ''}
            readOnly
            style={{ width: '100%', padding: '10px', border: '2px solid #28a745', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#d4edda', color: '#155724' }}
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
      <div style={{ marginBottom: '20px' }}>
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
            backgroundColor: isListening === `workDescription_${block.id}` ? '#fff5f5' : 'white'
          }}
        />
        {isListening === `workDescription_${block.id}` && (
          <div style={{ marginTop: '5px', padding: '8px 10px', backgroundColor: '#f8d7da', borderRadius: '4px', fontSize: '12px', color: '#721c24' }}>
            <strong>🔴 Listening...</strong> Speak now. Say "period", "comma", or "new line" for punctuation.
          </div>
        )}
      </div>

      {/* Quality Checks */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px' }}>
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

      {/* Manpower */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#d4edda', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#155724' }}>👷 Manpower</h4>
        <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#155724' }}>
          RT = Regular Time | OT = Overtime | JH = Jump Hours (bonus)
        </p>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Employee Name</label>
            <input
              type="text"
              placeholder="Name"
              value={currentLabour.employeeName}
              onChange={(e) => setCurrentLabour({ ...currentLabour, employeeName: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div style={{ flex: 2, minWidth: '180px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Classification</label>
            <select
              value={currentLabour.classification}
              onChange={(e) => setCurrentLabour({ ...currentLabour, classification: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
            >
              <option value="">Select Classification</option>
              {labourClassifications.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={{ width: '60px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', color: '#155724' }}>RT</label>
            <input
              type="number"
              placeholder="8"
              value={currentLabour.rt}
              onChange={(e) => setCurrentLabour({ ...currentLabour, rt: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #28a745', borderRadius: '4px', backgroundColor: '#d4edda' }}
            />
          </div>
          <div style={{ width: '60px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', color: '#856404' }}>OT</label>
            <input
              type="number"
              placeholder="0"
              value={currentLabour.ot}
              onChange={(e) => setCurrentLabour({ ...currentLabour, ot: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ffc107', borderRadius: '4px', backgroundColor: '#fff3cd' }}
            />
          </div>
          <div style={{ width: '60px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', color: '#004085' }}>JH</label>
            <input
              type="number"
              placeholder="0"
              value={currentLabour.jh}
              onChange={(e) => setCurrentLabour({ ...currentLabour, jh: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #007bff', borderRadius: '4px', backgroundColor: '#cce5ff' }}
            />
          </div>
          <div style={{ width: '55px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Count</label>
            <input
              type="number"
              placeholder="1"
              value={currentLabour.count}
              onChange={(e) => setCurrentLabour({ ...currentLabour, count: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <button
            onClick={() => {
              addLabourToBlock(block.id, currentLabour.employeeName, currentLabour.classification, currentLabour.rt, currentLabour.ot, currentLabour.jh, currentLabour.count)
              setCurrentLabour({ employeeName: '', classification: '', rt: '', ot: '', jh: '', count: '1' })
            }}
            style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Add
          </button>
        </div>

        {block.labourEntries.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#c3e6cb' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Employee</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Classification</th>
                <th style={{ padding: '8px', textAlign: 'center', width: '55px' }}>RT</th>
                <th style={{ padding: '8px', textAlign: 'center', width: '55px' }}>OT</th>
                <th style={{ padding: '8px', textAlign: 'center', width: '65px' }}>JH</th>
                <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}>Cnt</th>
                <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {block.labourEntries.map(entry => {
                const rt = entry.rt !== undefined ? entry.rt : Math.min(entry.hours || 0, 8)
                const ot = entry.ot !== undefined ? entry.ot : Math.max(0, (entry.hours || 0) - 8)
                const jh = entry.jh !== undefined ? entry.jh : 0
                return (
                  <tr key={entry.id} style={{ backgroundColor: '#fff' }}>
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
                        style={{ width: '45px', padding: '4px', border: '1px solid #ced4da', borderRadius: '3px', textAlign: 'center', fontSize: '12px' }}
                      />
                    </td>
                    <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{entry.count}</td>
                    <td style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                      <button
                        onClick={() => removeLabourFromBlock(block.id, entry.id)}
                        style={{ padding: '2px 6px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
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

      {/* Equipment */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#cce5ff', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#004085' }}>🚜 Equipment</h4>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <select
            value={currentEquipment.type}
            onChange={(e) => setCurrentEquipment({ ...currentEquipment, type: e.target.value })}
            style={{ flex: 2, minWidth: '200px', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
          >
            <option value="">Select Equipment</option>
            {equipmentTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Hours"
            value={currentEquipment.hours}
            onChange={(e) => setCurrentEquipment({ ...currentEquipment, hours: e.target.value })}
            style={{ width: '80px', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
          />
          <input
            type="number"
            placeholder="Count"
            value={currentEquipment.count}
            onChange={(e) => setCurrentEquipment({ ...currentEquipment, count: e.target.value })}
            style={{ width: '80px', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
          />
          <button
            onClick={() => {
              addEquipmentToBlock(block.id, currentEquipment.type, currentEquipment.hours, currentEquipment.count)
              setCurrentEquipment({ type: '', hours: '', count: '' })
            }}
            style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Add
          </button>
        </div>

        {block.equipmentEntries.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#b8daff' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Equipment</th>
                <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Hours</th>
                <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Count</th>
                <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {block.equipmentEntries.map(entry => (
                <tr key={entry.id} style={{ backgroundColor: '#fff' }}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>{entry.type}</td>
                  <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{entry.hours}</td>
                  <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{entry.count}</td>
                  <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                    <button
                      onClick={() => removeEquipmentFromBlock(block.id, entry.id)}
                      style={{ padding: '2px 6px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
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

      {/* Time Lost */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8d7da', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#721c24' }}>⏱️ Time Lost</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Reason</label>
            <select
              value={block.timeLostReason || ''}
              onChange={(e) => updateBlock(block.id, 'timeLostReason', e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px' }}
            >
              <option value="">None</option>
              {timeLostReasons.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Hours Lost</label>
            <input
              type="number"
              value={block.timeLostHours || ''}
              onChange={(e) => updateBlock(block.id, 'timeLostHours', e.target.value)}
              placeholder="0"
              style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px' }}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Details</label>
              <VoiceButton fieldId={`timeLostDetails_${block.id}`} style={{ padding: '4px 8px', fontSize: '11px' }} />
            </div>
            <input
              type="text"
              value={block.timeLostDetails || ''}
              onChange={(e) => updateBlock(block.id, 'timeLostDetails', e.target.value)}
              placeholder="Describe reason for time lost... (use 🎤 for voice)"
              style={{ 
                width: '100%', 
                padding: '8px', 
                border: isListening === `timeLostDetails_${block.id}` ? '2px solid #dc3545' : '1px solid #ced4da', 
                borderRadius: '4px', 
                fontSize: '13px',
                backgroundColor: isListening === `timeLostDetails_${block.id}` ? '#fff5f5' : 'white'
              }}
            />
          </div>
        </div>
      </div>

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
                      style={{ width: '100%', padding: '4px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
                    />
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>
                    <input
                      type="text"
                      value={photo.description}
                      onChange={(e) => updatePhotoMetadata(block.id, photoIdx, 'description', e.target.value)}
                      placeholder="Description..."
                      style={{ width: '100%', padding: '4px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '12px' }}
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
