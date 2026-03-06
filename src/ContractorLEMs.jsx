import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { useOrgPath } from './contexts/OrgContext.jsx'
import { useOrgQuery } from './utils/queryHelpers.js'
import { supabase } from './supabase'

const MAX_DAILY_HOURS = 16
const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

function ContractorLEMs() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  const { orgPath } = useOrgPath()
  const { getOrgId } = useOrgQuery()
  const [lems, setLems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedLem, setSelectedLem] = useState(null)
  const [filter, setFilter] = useState({ dateFrom: '', dateTo: '', foreman: '', crew: '' })
  const [viewMode, setViewMode] = useState('crew')
  const [expandedCrew, setExpandedCrew] = useState(null)
  const [validationAlerts, setValidationAlerts] = useState([])
  const [showAlerts, setShowAlerts] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPreview, setUploadPreview] = useState(null)
  const [uploadErrors, setUploadErrors] = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchLems()
  }, [])

  async function fetchLems() {
    setLoading(true)
    const { data, error } = await supabase
      .from('contractor_lems')
      .select('*')
      .order('date', { ascending: false })

    if (error) {
      console.error('Error fetching LEMs:', error)
    }
    setLems(data || [])
    
    // Run validation checks
    const alerts = runValidationChecks(data || [])
    setValidationAlerts(alerts)
    
    setLoading(false)
  }

  // Determine crew from account number or foreman
  function determineCrew(lem) {
    const foreman = lem.foreman || ''
    const accountNum = lem.account_number || ''
    
    if (accountNum.includes('2145') || foreman.includes('Whitworth')) return 'Mainline Welding'
    if (accountNum.includes('2146') || foreman.includes('Untinen')) return 'Tie-In Welding'
    if (accountNum.includes('2160') || foreman.includes('Nelson')) return 'Ditching'
    if (accountNum.includes('2180') || foreman.includes('Cook')) return 'Lowering-In'
    if (accountNum.includes('2190') || foreman.includes('Langlois')) return 'Backfill'
    return 'General'
  }

  // Run validation checks across all LEMs
  function runValidationChecks(lemsData) {
    const alerts = []
    
    // Group by date for cross-LEM validation
    const workersByDate = {}
    const equipmentByDate = {}
    const foremenByDate = {}

    lemsData.forEach(lem => {
      const date = lem.date
      const foreman = lem.foreman || 'Unknown'
      const crew = determineCrew(lem)
      const labourEntries = lem.labour_entries || []
      const equipmentEntries = lem.equipment_entries || []

      // Track foreman by date
      if (!foremenByDate[date]) foremenByDate[date] = {}
      if (!foremenByDate[date][foreman]) foremenByDate[date][foreman] = []
      foremenByDate[date][foreman].push({ crew, lemId: lem.field_log_id })

      // Track workers by date
      if (!workersByDate[date]) workersByDate[date] = {}
      labourEntries.forEach(entry => {
        const workerName = entry.name || entry.type || 'Unknown'
        const hours = (parseFloat(entry.rt_hours) || 0) + (parseFloat(entry.ot_hours) || 0)
        
        if (!workersByDate[date][workerName]) workersByDate[date][workerName] = []
        workersByDate[date][workerName].push({ 
          lem: lem.field_log_id, 
          hours, 
          crew, 
          foreman 
        })
      })

      // Track equipment by date
      if (!equipmentByDate[date]) equipmentByDate[date] = {}
      equipmentEntries.forEach(entry => {
        const equipId = entry.equipment_id || entry.type || 'Unknown'
        const hours = parseFloat(entry.hours) || 0
        
        if (!equipmentByDate[date][equipId]) equipmentByDate[date][equipId] = []
        equipmentByDate[date][equipId].push({ 
          lem: lem.field_log_id, 
          hours, 
          crew, 
          foreman 
        })
      })
    })

    // Check foreman on multiple crews same day
    Object.entries(foremenByDate).forEach(([date, foremen]) => {
      Object.entries(foremen).forEach(([foreman, assignments]) => {
        const uniqueCrews = [...new Set(assignments.map(a => a.crew))]
        if (uniqueCrews.length > 1) {
          alerts.push({
            type: 'foreman_duplicate',
            severity: 'high',
            date,
            subject: foreman,
            details: `Foreman charged to ${uniqueCrews.length} crews: ${uniqueCrews.join(', ')}`,
            assignments
          })
        }
      })
    })

    // Check workers with excessive hours or duplicates
    Object.entries(workersByDate).forEach(([date, workers]) => {
      Object.entries(workers).forEach(([workerName, assignments]) => {
        const totalHours = assignments.reduce((sum, a) => sum + a.hours, 0)
        const uniqueCrews = [...new Set(assignments.map(a => a.crew))]
        
        if (totalHours > MAX_DAILY_HOURS) {
          alerts.push({
            type: 'worker_excessive_hours',
            severity: 'high',
            date,
            subject: workerName,
            details: `${totalHours} hours charged (max ${MAX_DAILY_HOURS}). Crews: ${uniqueCrews.join(', ')}`,
            assignments,
            totalHours
          })
        } else if (assignments.length > 1 && uniqueCrews.length > 1) {
          alerts.push({
            type: 'worker_multiple_crews',
            severity: 'medium',
            date,
            subject: workerName,
            details: `Split between ${uniqueCrews.length} crews (${totalHours} total hrs): ${uniqueCrews.join(', ')}`,
            assignments,
            totalHours
          })
        }
      })
    })

    // Check equipment with excessive hours or duplicates
    Object.entries(equipmentByDate).forEach(([date, equipment]) => {
      Object.entries(equipment).forEach(([equipId, assignments]) => {
        const totalHours = assignments.reduce((sum, a) => sum + a.hours, 0)
        const uniqueCrews = [...new Set(assignments.map(a => a.crew))]
        
        if (totalHours > MAX_DAILY_HOURS) {
          alerts.push({
            type: 'equipment_excessive_hours',
            severity: 'high',
            date,
            subject: equipId,
            details: `${totalHours} hours charged (max ${MAX_DAILY_HOURS}). Crews: ${uniqueCrews.join(', ')}`,
            assignments,
            totalHours
          })
        } else if (assignments.length > 1 && uniqueCrews.length > 1) {
          alerts.push({
            type: 'equipment_multiple_crews',
            severity: 'medium',
            date,
            subject: equipId,
            details: `Used by ${uniqueCrews.length} crews (${totalHours} total hrs): ${uniqueCrews.join(', ')}`,
            assignments,
            totalHours
          })
        }
      })
    })

    // Sort by severity then date
    return alerts.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1
      return b.date.localeCompare(a.date)
    })
  }

  // PDF/Image upload with OCR
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Convert a PDF file to an array of page images (JPEG base64) using pdf.js from CDN
  async function pdfToImages(file) {
    // Dynamically load pdf.js if not already loaded
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
        script.onload = resolve
        script.onerror = () => reject(new Error('Failed to load PDF.js'))
        document.head.appendChild(script)
      })
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const images = []
    const maxPages = Math.min(pdf.numPages, 20) // Limit to 20 pages

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i)
      const scale = 2.0 // High quality for OCR
      const viewport = page.getViewport({ scale })

      // Render the page as-is first
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport }).promise

      // If page is landscape (wider than tall), rotate it 90° clockwise to portrait
      // This handles sideways-scanned LEMs
      if (viewport.width > viewport.height * 1.2) {
        const rotatedCanvas = document.createElement('canvas')
        rotatedCanvas.width = viewport.height
        rotatedCanvas.height = viewport.width
        const rCtx = rotatedCanvas.getContext('2d')
        rCtx.translate(rotatedCanvas.width, 0)
        rCtx.rotate(Math.PI / 2)
        rCtx.drawImage(canvas, 0, 0)
        images.push(rotatedCanvas.toDataURL('image/jpeg', 0.9).split(',')[1])
      } else {
        images.push(canvas.toDataURL('image/jpeg', 0.9).split(',')[1])
      }
    }

    return images
  }

  async function handleLEMFileSelect(event) {
    const files = Array.from(event.target.files)
    if (files.length === 0) return
    setUploadErrors([])
    setUploadPreview(null)

    const valid = files.filter(f =>
      f.type === 'application/pdf' ||
      f.type.startsWith('image/')
    )
    if (valid.length !== files.length) {
      setUploadErrors(['Only PDF and image files (JPG, PNG) are accepted.'])
      return
    }

    if (!anthropicApiKey) {
      setUploadErrors(['Claude API key not configured. Add VITE_ANTHROPIC_API_KEY to your .env file.'])
      return
    }

    setUploading(true)
    const allExtracted = []
    const errors = []

    for (const file of valid) {
      try {
        // Check file size (max ~30MB for API)
        if (file.size > 30 * 1024 * 1024) {
          errors.push(`${file.name}: File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum 30MB.`)
          continue
        }

        const isPDF = file.type === 'application/pdf'

        // Build image content blocks - for PDFs, convert each page to an image
        let allImageBlocks = []
        if (isPDF) {
          const pageImages = await pdfToImages(file)
          allImageBlocks = pageImages.map(base64 => ({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
          }))
        } else {
          const base64 = await fileToBase64(file)
          allImageBlocks = [{
            type: 'image',
            source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 }
          }]
        }

        // Process in batches of 5 pages to avoid token limits
        const PAGES_PER_BATCH = 5
        const batches = []
        for (let b = 0; b < allImageBlocks.length; b += PAGES_PER_BATCH) {
          batches.push(allImageBlocks.slice(b, b + PAGES_PER_BATCH))
        }

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
          const imageBlocks = batches[batchIdx]
          const pageStart = batchIdx * PAGES_PER_BATCH + 1
          const pageEnd = pageStart + imageBlocks.length - 1

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
            max_tokens: 16000,
            messages: [{
              role: 'user',
              content: [
                ...imageBlocks,
                {
                  type: 'text',
                  text: `You are looking at ${imageBlocks.length} page(s) of a contractor LEM (Labour, Equipment, Materials) document. You MUST extract data from EVERY page. Each page is typically a separate daily LEM/ticket.

Return ONLY a JSON array with one object PER LEM/ticket found across ALL ${imageBlocks.length} pages (no other text):
[
  {
    "field_log_id": "the ticket/field log number",
    "date": "YYYY-MM-DD format",
    "foreman": "foreman name",
    "contractor": "contractor company name if visible",
    "account_number": "account or cost code if visible",
    "labour_entries": [
      {
        "name": "employee full name",
        "employee_id": "employee ID if visible",
        "type": "classification (e.g. Welder, Labourer, Operator)",
        "rt_hours": number of regular hours,
        "rt_rate": hourly rate if visible (0 if not),
        "ot_hours": number of overtime hours (0 if none),
        "ot_rate": overtime rate if visible (0 if not)
      }
    ],
    "equipment_entries": [
      {
        "equipment_id": "equipment ID/unit number if visible",
        "type": "equipment type (e.g. Excavator, Side Boom)",
        "hours": number of hours,
        "rate": hourly rate if visible (0 if not)
      }
    ]
  }
]

CRITICAL RULES:
- There are ${imageBlocks.length} pages. Extract a LEM from EVERY page. Do NOT stop after the first page.
- List EVERY person as a SEPARATE entry with their full name. Do NOT group workers.
- List EVERY piece of equipment as a SEPARATE entry. Do NOT group equipment.
- Each page that has a different ticket number, date, or foreman is a SEPARATE LEM object.
- Use YYYY-MM-DD date format.
- If rates are not visible, use 0.
- Extract ALL entries you can read from ALL pages.
- Return ONLY the JSON array.`
                }
              ]
            }]
          })
        })

        if (!response.ok) {
          const errText = await response.text()
          errors.push(`${file.name} (pages ${pageStart}-${pageEnd}): API error ${response.status} - ${errText.substring(0, 200)}`)
          continue
        }

        const data = await response.json()
        const content = data.content[0]?.text || ''

        // Parse JSON array from response
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        if (!jsonMatch) {
          errors.push(`${file.name} (pages ${pageStart}-${pageEnd}): Could not extract data.`)
          continue
        }

        const extracted = JSON.parse(jsonMatch[0])
        const lemsFromBatch = Array.isArray(extracted) ? extracted : [extracted]

        lemsFromBatch.forEach(lem => {
          // Calculate total costs from entries
          const totalLabourCost = (lem.labour_entries || []).reduce((sum, e) => {
            return sum + ((parseFloat(e.rt_hours) || 0) * (parseFloat(e.rt_rate) || 0)) +
                         ((parseFloat(e.ot_hours) || 0) * (parseFloat(e.ot_rate) || 0))
          }, 0)
          const totalEquipmentCost = (lem.equipment_entries || []).reduce((sum, e) => {
            return sum + ((parseFloat(e.hours) || 0) * (parseFloat(e.rate) || 0))
          }, 0)

          allExtracted.push({
            field_log_id: lem.field_log_id || `LEM-${Date.now()}`,
            date: lem.date || '',
            foreman: lem.foreman || '',
            account_number: lem.account_number || '',
            labour_entries: lem.labour_entries || [],
            equipment_entries: lem.equipment_entries || [],
            total_labour_cost: totalLabourCost,
            total_equipment_cost: totalEquipmentCost,
            _source_file: file.name,
            _contractor: lem.contractor || ''
          })
        })
        } // end batch loop
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`)
      }
    }

    setUploadErrors(errors)
    setUploadPreview(allExtracted.length > 0 ? allExtracted : null)
    setUploading(false)
  }

  async function saveLEMs() {
    if (!uploadPreview || uploadPreview.length === 0) return
    setUploading(true)

    try {
      const orgId = getOrgId()
      const toInsert = uploadPreview.map(lem => ({
        field_log_id: lem.field_log_id,
        date: lem.date,
        foreman: lem.foreman,
        account_number: lem.account_number,
        labour_entries: lem.labour_entries,
        equipment_entries: lem.equipment_entries,
        total_labour_cost: lem.total_labour_cost,
        total_equipment_cost: lem.total_equipment_cost,
        organization_id: orgId
      }))

      // Check for duplicates
      const fieldLogIds = toInsert.map(l => l.field_log_id)
      const { data: existing } = await supabase
        .from('contractor_lems')
        .select('field_log_id')
        .in('field_log_id', fieldLogIds)

      const existingIds = new Set((existing || []).map(e => e.field_log_id))
      const newLems = toInsert.filter(l => !existingIds.has(l.field_log_id))
      const skipped = toInsert.length - newLems.length

      if (newLems.length === 0) {
        alert(`All ${toInsert.length} LEMs already exist in the system.`)
        setUploading(false)
        return
      }

      const { error } = await supabase.from('contractor_lems').insert(newLems)
      if (error) throw error

      const msg = skipped > 0
        ? `Saved ${newLems.length} LEMs. Skipped ${skipped} duplicates.`
        : `Saved ${newLems.length} LEMs successfully.`
      alert(msg)

      setShowUpload(false)
      setUploadPreview(null)
      setUploadErrors([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchLems()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  function applyFilters() {
    let filtered = [...lems]
    if (filter.dateFrom) {
      filtered = filtered.filter(l => l.date >= filter.dateFrom)
    }
    if (filter.dateTo) {
      filtered = filtered.filter(l => l.date <= filter.dateTo)
    }
    if (filter.foreman) {
      filtered = filtered.filter(l => l.foreman?.toLowerCase().includes(filter.foreman.toLowerCase()))
    }
    if (filter.crew) {
      filtered = filtered.filter(l => determineCrew(l) === filter.crew)
    }
    return filtered
  }

  const filteredLems = applyFilters()

  // Calculate summary stats
  const totalLabour = filteredLems.reduce((sum, l) => sum + (l.total_labour_cost || 0), 0)
  const totalEquipment = filteredLems.reduce((sum, l) => sum + (l.total_equipment_cost || 0), 0)
  const totalWorkers = filteredLems.reduce((sum, l) => sum + (l.labour_entries?.length || 0), 0)
  const totalEquipmentItems = filteredLems.reduce((sum, l) => sum + (l.equipment_entries?.length || 0), 0)
  const highAlerts = validationAlerts.filter(a => a.severity === 'high').length
  const mediumAlerts = validationAlerts.filter(a => a.severity === 'medium').length

  // Group by crew for crew view
  const byCrew = filteredLems.reduce((acc, lem) => {
    const crew = determineCrew(lem)
    if (!acc[crew]) {
      acc[crew] = { 
        crew,
        foremen: new Set(), 
        lems: [], 
        labourCost: 0, 
        equipmentCost: 0, 
        workers: new Set(),
        equipment: new Set(),
        totalLabourHours: 0,
        totalEquipmentHours: 0,
        dates: new Set()
      }
    }
    acc[crew].foremen.add(lem.foreman || 'Unknown')
    acc[crew].lems.push(lem)
    acc[crew].labourCost += lem.total_labour_cost || 0
    acc[crew].equipmentCost += lem.total_equipment_cost || 0
    acc[crew].dates.add(lem.date)
    
    // Track unique workers and equipment
    ;(lem.labour_entries || []).forEach(entry => {
      acc[crew].workers.add(entry.name || entry.type || 'Unknown')
      acc[crew].totalLabourHours += (parseFloat(entry.rt_hours) || 0) + (parseFloat(entry.ot_hours) || 0)
    })
    ;(lem.equipment_entries || []).forEach(entry => {
      acc[crew].equipment.add(entry.equipment_id || entry.type || 'Unknown')
      acc[crew].totalEquipmentHours += parseFloat(entry.hours) || 0
    })
    
    return acc
  }, {})

  // Convert to array and sort by total cost
  const crewData = Object.values(byCrew).map(c => ({
    ...c,
    foremen: Array.from(c.foremen),
    workers: Array.from(c.workers),
    equipment: Array.from(c.equipment),
    dates: Array.from(c.dates),
    totalCost: c.labourCost + c.equipmentCost
  })).sort((a, b) => b.totalCost - a.totalCost)

  // Group by foreman
  const byForeman = filteredLems.reduce((acc, lem) => {
    const key = lem.foreman || 'Unknown'
    if (!acc[key]) {
      acc[key] = { foreman: key, crew: determineCrew(lem), lems: [], labourCost: 0, equipmentCost: 0, workers: 0 }
    }
    acc[key].lems.push(lem)
    acc[key].labourCost += lem.total_labour_cost || 0
    acc[key].equipmentCost += lem.total_equipment_cost || 0
    acc[key].workers += lem.labour_entries?.length || 0
    return acc
  }, {})

  // Get unique crews for filter dropdown
  const uniqueCrews = [...new Set(lems.map(l => determineCrew(l)))].sort()

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading contractor LEMs...</div>
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#2c3e50', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>Contractor LEMs</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>{filteredLems.length} field logs</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowUpload(true)} style={{ padding: '10px 20px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Upload LEMs</button>
          <button onClick={() => navigate(orgPath('/admin'))} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Return to Admin Portal</button>
          <button onClick={() => navigate(orgPath('/reconciliation'))} style={{ padding: '10px 20px', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reconciliation</button>
          <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', marginBottom: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Total Labour Cost</h3>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#27ae60' }}>${totalLabour.toLocaleString()}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Total Equipment Cost</h3>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#3498db' }}>${totalEquipment.toLocaleString()}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Total Workers</h3>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#9b59b6' }}>{totalWorkers}</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Equipment Items</h3>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#e67e22' }}>{totalEquipmentItems}</p>
          </div>
          <div 
            onClick={() => setShowAlerts(!showAlerts)}
            style={{ 
              backgroundColor: highAlerts > 0 ? '#fee2e2' : 'white', 
              padding: '20px', 
              borderRadius: '8px', 
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              border: highAlerts > 0 ? '2px solid #dc3545' : 'none',
              cursor: 'pointer'
            }}
          >
            <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Validation Alerts</h3>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: highAlerts > 0 ? '#dc3545' : '#27ae60' }}>
              {validationAlerts.length}
            </p>
            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
              {highAlerts} high, {mediumAlerts} medium
            </p>
          </div>
        </div>

        {/* Alert Banner */}
        {highAlerts > 0 && (
          <div style={{ backgroundColor: '#fee2e2', border: '1px solid #dc3545', borderRadius: '8px', padding: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '24px' }}>🚨</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 'bold', color: '#dc3545' }}>{highAlerts} High-Priority Alert{highAlerts > 1 ? 's' : ''} Detected</p>
              <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>Workers or equipment may be double-charged. Click "Validation Alerts" card to review.</p>
            </div>
            <button 
              onClick={() => setShowAlerts(true)} 
              style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              View Alerts
            </button>
          </div>
        )}

        {/* Filters */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Crew</label>
              <select 
                value={filter.crew} 
                onChange={(e) => setFilter({ ...filter, crew: e.target.value })} 
                style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', minWidth: '150px' }}
              >
                <option value="">All Crews</option>
                {uniqueCrews.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Date From</label>
              <input type="date" value={filter.dateFrom} onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Date To</label>
              <input type="date" value={filter.dateTo} onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Foreman</label>
              <input type="text" placeholder="Search..." value={filter.foreman} onChange={(e) => setFilter({ ...filter, foreman: e.target.value })} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '150px' }} />
            </div>
            <button onClick={() => setFilter({ dateFrom: '', dateTo: '', foreman: '', crew: '' })} style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Clear</button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
              <button onClick={() => setViewMode('crew')} style={{ padding: '8px 16px', backgroundColor: viewMode === 'crew' ? '#2c3e50' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>By Crew</button>
              <button onClick={() => setViewMode('foreman')} style={{ padding: '8px 16px', backgroundColor: viewMode === 'foreman' ? '#2c3e50' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>By Foreman</button>
              <button onClick={() => setViewMode('list')} style={{ padding: '8px 16px', backgroundColor: viewMode === 'list' ? '#2c3e50' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>All LEMs</button>
            </div>
          </div>
        </div>

        {/* Crew View */}
        {viewMode === 'crew' && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#2c3e50', color: 'white' }}>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Crew</th>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Foremen</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>LEMs</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>Workers</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>Equipment</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Labour Cost</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Equipment Cost</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {crewData.map((data, idx) => (
                  <React.Fragment key={data.crew}>
                    <tr style={{ borderBottom: '1px solid #eee', backgroundColor: idx % 2 === 0 ? '#f9f9f9' : 'white' }}>
                      <td style={{ padding: '15px', fontWeight: 'bold', color: '#2c3e50' }}>{data.crew}</td>
                      <td style={{ padding: '15px' }}>
                        {data.foremen.map(f => (
                          <span key={f} style={{ display: 'inline-block', backgroundColor: '#e8e8e8', padding: '3px 8px', borderRadius: '4px', margin: '2px', fontSize: '13px' }}>{f}</span>
                        ))}
                      </td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>{data.lems.length}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>{data.workers.length}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>{data.equipment.length}</td>
                      <td style={{ padding: '15px', textAlign: 'right', color: '#27ae60' }}>${data.labourCost.toLocaleString()}</td>
                      <td style={{ padding: '15px', textAlign: 'right', color: '#3498db' }}>${data.equipmentCost.toLocaleString()}</td>
                      <td style={{ padding: '15px', textAlign: 'right', fontWeight: 'bold' }}>${data.totalCost.toLocaleString()}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        <button 
                          onClick={() => setExpandedCrew(expandedCrew === data.crew ? null : data.crew)} 
                          style={{ padding: '6px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                        >
                          {expandedCrew === data.crew ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {expandedCrew === data.crew && (
                      <tr>
                        <td colSpan="9" style={{ padding: '20px', backgroundColor: '#f0f7ff' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                            <div>
                              <h4 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>Workers ({data.workers.length})</h4>
                              <div style={{ maxHeight: '200px', overflow: 'auto', backgroundColor: 'white', borderRadius: '4px', padding: '10px' }}>
                                {data.workers.map(w => (
                                  <div key={w} style={{ padding: '5px 0', borderBottom: '1px solid #eee', fontSize: '13px' }}>{w}</div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h4 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>Equipment ({data.equipment.length})</h4>
                              <div style={{ maxHeight: '200px', overflow: 'auto', backgroundColor: 'white', borderRadius: '4px', padding: '10px' }}>
                                {data.equipment.map(e => (
                                  <div key={e} style={{ padding: '5px 0', borderBottom: '1px solid #eee', fontSize: '13px' }}>{e}</div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h4 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>Summary</h4>
                              <div style={{ backgroundColor: 'white', borderRadius: '4px', padding: '15px' }}>
                                <p style={{ margin: '5px 0', fontSize: '14px' }}><strong>Labour Hours:</strong> {data.totalLabourHours.toLocaleString()}</p>
                                <p style={{ margin: '5px 0', fontSize: '14px' }}><strong>Equipment Hours:</strong> {data.totalEquipmentHours.toLocaleString()}</p>
                                <p style={{ margin: '5px 0', fontSize: '14px' }}><strong>Days Active:</strong> {data.dates.length}</p>
                                <p style={{ margin: '5px 0', fontSize: '14px' }}><strong>Avg Cost/Day:</strong> ${Math.round(data.totalCost / data.dates.length).toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Foreman View */}
        {viewMode === 'foreman' && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#2c3e50', color: 'white' }}>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Crew</th>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Foreman</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>LEMs</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>Workers</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Labour Cost</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Equipment Cost</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byForeman)
                  .sort(([,a], [,b]) => (b.labourCost + b.equipmentCost) - (a.labourCost + a.equipmentCost))
                  .map(([foreman, data], idx) => (
                    <tr key={foreman} style={{ borderBottom: '1px solid #eee', backgroundColor: idx % 2 === 0 ? '#f9f9f9' : 'white' }}>
                      <td style={{ padding: '15px', color: '#666' }}>{data.crew}</td>
                      <td style={{ padding: '15px', fontWeight: 'bold' }}>{foreman}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>{data.lems.length}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>{data.workers}</td>
                      <td style={{ padding: '15px', textAlign: 'right', color: '#27ae60' }}>${data.labourCost.toLocaleString()}</td>
                      <td style={{ padding: '15px', textAlign: 'right', color: '#3498db' }}>${data.equipmentCost.toLocaleString()}</td>
                      <td style={{ padding: '15px', textAlign: 'right', fontWeight: 'bold' }}>${(data.labourCost + data.equipmentCost).toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#2c3e50', color: 'white' }}>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Crew</th>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Field Log ID</th>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Foreman</th>
                  <th style={{ padding: '15px', textAlign: 'left' }}>Account</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>Workers</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Labour</th>
                  <th style={{ padding: '15px', textAlign: 'right' }}>Equipment</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLems.map((lem, idx) => (
                  <tr key={lem.id} style={{ borderBottom: '1px solid #eee', backgroundColor: idx % 2 === 0 ? '#f9f9f9' : 'white' }}>
                    <td style={{ padding: '15px', color: '#666' }}>{determineCrew(lem)}</td>
                    <td style={{ padding: '15px', fontWeight: 'bold' }}>{lem.field_log_id}</td>
                    <td style={{ padding: '15px' }}>{lem.date}</td>
                    <td style={{ padding: '15px' }}>{lem.foreman}</td>
                    <td style={{ padding: '15px' }}>{lem.account_number}</td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>{lem.labour_entries?.length || 0}</td>
                    <td style={{ padding: '15px', textAlign: 'right', color: '#27ae60' }}>${(lem.total_labour_cost || 0).toLocaleString()}</td>
                    <td style={{ padding: '15px', textAlign: 'right', color: '#3498db' }}>${(lem.total_equipment_cost || 0).toLocaleString()}</td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>
                      <button onClick={() => setSelectedLem(lem)} style={{ padding: '6px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload LEMs Modal */}
      {showUpload && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '90%', maxWidth: '1000px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ backgroundColor: '#27ae60', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1 }}>
              <div>
                <h2 style={{ margin: 0 }}>Upload Contractor LEMs</h2>
                <p style={{ margin: '5px 0 0 0', opacity: 0.9 }}>Upload PDF or photo of contractor LEMs — data is extracted automatically</p>
              </div>
              <button onClick={() => { setShowUpload(false); setUploadPreview(null); setUploadErrors([]); if (fileInputRef.current) fileInputRef.current.value = '' }} style={{ padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ padding: '20px' }}>
              {/* Instructions */}
              <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#0369a1' }}>How it works</h4>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#334155' }}>
                  1. Upload PDF or photo files of the contractor's LEMs
                </p>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#334155' }}>
                  2. Claude Vision reads the documents and extracts all labour and equipment entries
                </p>
                <p style={{ margin: '0', fontSize: '13px', color: '#334155' }}>
                  3. Review the extracted data, then save to the system for reconciliation
                </p>
              </div>

              {/* File Input */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Select LEM files</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  multiple
                  onChange={handleLEMFileSelect}
                  disabled={uploading}
                  style={{ padding: '12px', border: '2px dashed #d1d5db', borderRadius: '8px', width: '100%', cursor: uploading ? 'not-allowed' : 'pointer', backgroundColor: '#f9fafb' }}
                />
                <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#6b7280' }}>Accepts PDF, JPG, PNG. You can select multiple files.</p>
              </div>

              {/* Scanning indicator */}
              {uploading && !uploadPreview && (
                <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f0fdf4', borderRadius: '8px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px', animation: 'pulse 2s infinite' }}>Scanning documents...</div>
                  <p style={{ color: '#166534', fontWeight: '500' }}>Claude is reading the LEM documents and extracting data.</p>
                  <p style={{ color: '#6b7280', fontSize: '13px' }}>This may take a moment per file.</p>
                </div>
              )}

              {/* Errors */}
              {uploadErrors.length > 0 && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#991b1b' }}>Issues ({uploadErrors.length})</h4>
                  <div style={{ maxHeight: '150px', overflow: 'auto' }}>
                    {uploadErrors.map((err, i) => (
                      <p key={i} style={{ margin: '4px 0', fontSize: '13px', color: '#991b1b' }}>{err}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
              {uploadPreview && uploadPreview.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 12px 0', color: '#166534' }}>Extracted: {uploadPreview.length} LEMs — review before saving</h4>
                  <div style={{ maxHeight: '400px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                    {uploadPreview.map((lem, idx) => (
                      <div key={idx} style={{ borderBottom: '2px solid #e5e7eb', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <div>
                            <span style={{ fontWeight: 'bold', fontSize: '16px', marginRight: '12px' }}>{lem.field_log_id}</span>
                            <span style={{ color: '#6b7280', fontSize: '13px' }}>{lem.date} | {lem.foreman}</span>
                            {lem._contractor && <span style={{ marginLeft: '12px', backgroundColor: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{lem._contractor}</span>}
                            {lem.account_number && <span style={{ marginLeft: '8px', color: '#6b7280', fontSize: '12px' }}>Acct: {lem.account_number}</span>}
                          </div>
                          <span style={{ fontSize: '12px', color: '#9ca3af' }}>{lem._source_file}</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          {/* Labour */}
                          <div style={{ backgroundColor: '#f9fafb', borderRadius: '6px', padding: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#27ae60', textTransform: 'uppercase', marginBottom: '6px' }}>
                              Labour ({lem.labour_entries.length})
                            </div>
                            {lem.labour_entries.length === 0 ? (
                              <div style={{ fontSize: '12px', color: '#9ca3af' }}>No labour entries</div>
                            ) : lem.labour_entries.map((e, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0', borderBottom: '1px solid #e5e7eb' }}>
                                <span>{e.name || e.employee_id} <span style={{ color: '#6b7280' }}>({e.type})</span></span>
                                <span style={{ fontFamily: 'monospace' }}>{(parseFloat(e.rt_hours) || 0) + (parseFloat(e.ot_hours) || 0)}hrs</span>
                              </div>
                            ))}
                          </div>

                          {/* Equipment */}
                          <div style={{ backgroundColor: '#f9fafb', borderRadius: '6px', padding: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#3498db', textTransform: 'uppercase', marginBottom: '6px' }}>
                              Equipment ({lem.equipment_entries.length})
                            </div>
                            {lem.equipment_entries.length === 0 ? (
                              <div style={{ fontSize: '12px', color: '#9ca3af' }}>No equipment entries</div>
                            ) : lem.equipment_entries.map((e, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0', borderBottom: '1px solid #e5e7eb' }}>
                                <span>{e.equipment_id ? `${e.equipment_id} - ` : ''}{e.type}</span>
                                <span style={{ fontFamily: 'monospace' }}>{e.hours}hrs</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                    <button
                      onClick={() => { setUploadPreview(null); setUploadErrors([]); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      style={{ padding: '10px 24px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                    <button
                      onClick={saveLEMs}
                      disabled={uploading}
                      style={{ padding: '10px 24px', backgroundColor: uploading ? '#9ca3af' : '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '15px' }}
                    >
                      {uploading ? 'Saving...' : `Save ${uploadPreview.length} LEMs`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Validation Alerts Modal */}
      {showAlerts && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '90%', maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ backgroundColor: highAlerts > 0 ? '#dc3545' : '#27ae60', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0 }}>
              <div>
                <h2 style={{ margin: 0 }}>Validation Alerts</h2>
                <p style={{ margin: '5px 0 0 0', opacity: 0.9 }}>{validationAlerts.length} issue{validationAlerts.length !== 1 ? 's' : ''} found</p>
              </div>
              <button onClick={() => setShowAlerts(false)} style={{ padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ padding: '20px' }}>
              {validationAlerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <span style={{ fontSize: '48px' }}>✅</span>
                  <p style={{ color: '#27ae60', fontWeight: 'bold', fontSize: '18px' }}>No Validation Issues Found</p>
                  <p style={{ color: '#666' }}>All workers and equipment appear to be properly assigned.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {validationAlerts.map((alert, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        padding: '15px', 
                        borderRadius: '8px', 
                        borderLeft: `4px solid ${alert.severity === 'high' ? '#dc3545' : '#f39c12'}`,
                        backgroundColor: alert.severity === 'high' ? '#fee2e2' : '#fef3cd'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '20px' }}>{alert.severity === 'high' ? '🚨' : '⚠️'}</span>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 'bold', 
                          padding: '3px 8px', 
                          borderRadius: '4px',
                          backgroundColor: alert.severity === 'high' ? '#dc3545' : '#f39c12',
                          color: 'white',
                          textTransform: 'uppercase'
                        }}>
                          {alert.type.replace(/_/g, ' ')}
                        </span>
                        <span style={{ color: '#666', fontSize: '13px' }}>{alert.date}</span>
                      </div>
                      <p style={{ margin: '0 0 8px 30px', fontWeight: 'bold', color: '#333' }}>{alert.subject}</p>
                      <p style={{ margin: '0 0 0 30px', color: '#666', fontSize: '14px' }}>{alert.details}</p>
                      {alert.assignments && (
                        <div style={{ marginLeft: '30px', marginTop: '10px', fontSize: '13px', color: '#666' }}>
                          <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>Breakdown:</p>
                          <ul style={{ margin: 0, paddingLeft: '20px' }}>
                            {alert.assignments.map((a, i) => (
                              <li key={i}>{a.crew}: {a.hours}hrs (LEM: {a.lem || a.lemId})</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '90%', maxWidth: '1200px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ backgroundColor: '#2c3e50', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0 }}>
              <div>
                <h2 style={{ margin: 0 }}>Field Log {selectedLem.field_log_id}</h2>
                <p style={{ margin: '5px 0 0 0', opacity: 0.8 }}>{determineCrew(selectedLem)} - {selectedLem.foreman} - {selectedLem.date}</p>
              </div>
              <button onClick={() => setSelectedLem(null)} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '4px' }}>
                  <strong>Account:</strong> {selectedLem.account_number}
                </div>
                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '4px' }}>
                  <strong>Total:</strong> ${((selectedLem.total_labour_cost || 0) + (selectedLem.total_equipment_cost || 0)).toLocaleString()}
                </div>
              </div>

              <h3 style={{ borderBottom: '2px solid #2c3e50', paddingBottom: '10px' }}>Labour ({selectedLem.labour_entries?.length || 0} workers)</h3>
              <table style={{ width: '100%', marginBottom: '20px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#ecf0f1' }}>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>ID</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Name</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Classification</th>
                    <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>RT Hrs</th>
                    <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>RT Rate</th>
                    <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>OT Hrs</th>
                    <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>OT Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedLem.labour_entries || []).map((entry, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{entry.employee_id}</td>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{entry.name}</td>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{entry.type}</td>
                      <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>{entry.rt_hours}</td>
                      <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>${entry.rt_rate?.toFixed(2)}</td>
                      <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>{entry.ot_hours}</td>
                      <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>${entry.ot_rate?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ borderBottom: '2px solid #2c3e50', paddingBottom: '10px' }}>Equipment ({selectedLem.equipment_entries?.length || 0} items)</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#ecf0f1' }}>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Equipment ID</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Type</th>
                    <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>Hours</th>
                    <th style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedLem.equipment_entries || []).map((entry, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{entry.equipment_id}</td>
                      <td style={{ padding: '10px', border: '1px solid #ddd' }}>{entry.type}</td>
                      <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #ddd' }}>{entry.hours}</td>
                      <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{entry.rate ? `$${entry.rate.toFixed(2)}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ContractorLEMs
