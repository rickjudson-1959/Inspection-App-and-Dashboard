import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ComposedChart, Cell, PieChart, Pie, Area, AreaChart
} from 'recharts'
import { useAuth } from './AuthContext.jsx'
import EVMDashboard from './EVMDashboard'
import { supabase } from './supabase'
import ShadowAuditDashboard from './ShadowAuditDashboard.jsx'
import { aggregateReliabilityScore, calculateTotalBilledHours, calculateTotalShadowHours, calculateValueLost, aggregateValueLostByParty } from './shadowAuditUtils.js'
import { MetricInfoIcon, MetricIntegrityModal, useMetricIntegrityModal } from './components/MetricIntegrityInfo.jsx'
import { useOrgQuery } from './utils/queryHelpers.js'
import { useOrgPath } from './contexts/OrgContext.jsx'

// ============================================================================
// CMT DASHBOARD - Eagle Mountain - Woodfibre Gas Pipeline (EGP)
// FortisBC | NPS 24 | 47km Mainline + 9km TBM Tunnel
// ============================================================================

// EGP Project Configuration
const EGP_PROJECT = {
  name: 'FortisBC EGP Project',
  fullName: 'Eagle Mountain - Woodfibre Gas Pipeline',
  client: 'FortisBC Energy Inc.',
  contractor: 'SA Energy Group (Somerville Aecon JV)',
  totalBudget: 400000000,
  totalLength: 56000,
  mainlineLength: 47000,
  tunnelLength: 9000,
  pipeSpec: 'NPS 24 x 0.500" WT, X70',
  baselineStart: '2025-07-01',
  baselineFinish: '2026-06-30'
}

// Phase colors matching EVM Dashboard
const phaseColors = {
  'Clearing': '#8B4513',
  'Access': '#A0522D',
  'Topsoil': '#CD853F',
  'Stripping': '#D2691E',
  'Grading': '#DAA520',
  'Stringing': '#9370DB',
  'Bending': '#4169E1',
  'Welding': '#DC143C',
  'Welding - Mainline': '#DC143C',
  'Welding - Tie-in': '#FF6347',
  'Coating': '#FF8C00',
  'Ditch': '#32CD32',
  'Lower-in': '#1E90FF',
  'Backfill': '#8B008B',
  'Tie-ins': '#C71585',
  'Cleanup': '#20B2AA',
  'Cleanup - Machine': '#20B2AA',
  'Cleanup - Final': '#3CB371',
  'Hydrostatic Testing': '#FF1493',
  'HDD': '#6A5ACD',
  'HD Bores': '#7B68EE',
  'Reclamation': '#228B22',
  'Tunnel': '#4B0082'
}

// EGP Planned targets (realistic for 56km project)
const plannedTargets = {
  'Clearing': { metres: 47000, costPerMetre: 45, rate: '800-1,200 m/day' },
  'Stripping': { metres: 47000, costPerMetre: 35, rate: '600-900 m/day' },
  'Grading': { metres: 47000, costPerMetre: 85, rate: '500-800 m/day' },
  'Stringing': { metres: 47000, costPerMetre: 35, rate: '2,000-3,000 m/day' },
  'Bending': { metres: 47000, costPerMetre: 65, rate: '400-600 m/day' },
  'Welding - Mainline': { metres: 47000, costPerMetre: 285, rate: '400-600 m/day' },
  'Coating': { metres: 47000, costPerMetre: 95, rate: '500-800 m/day' },
  'Ditch': { metres: 47000, costPerMetre: 75, rate: '600-900 m/day' },
  'Lower-in': { metres: 47000, costPerMetre: 145, rate: '800-1,200 m/day' },
  'Backfill': { metres: 47000, costPerMetre: 55, rate: '1,000-1,500 m/day' },
  'Cleanup': { metres: 47000, costPerMetre: 25, rate: '500-800 m/day' },
  'Hydrostatic Testing': { metres: 47000, costPerMetre: 120, rate: 'Per section' },
  'HDD': { metres: 2800, costPerMetre: 1250, rate: '50-150 m/day' },
  'Tunnel': { metres: 9000, costPerMetre: 2850, rate: '15-25 m/day' }
}

// Generate EGP-specific demo data
function generateEGPDemoData(dateRange) {
  const today = new Date()
  const projectStart = new Date(EGP_PROJECT.baselineStart)
  
  // Generate daily data for the selected range
  const dailyArray = []
  const numDays = Math.min(dateRange, Math.floor((today - projectStart) / (1000 * 60 * 60 * 24)))
  
  for (let i = Math.max(0, numDays - dateRange); i <= numDays; i++) {
    const date = new Date(projectStart)
    date.setDate(date.getDate() + i)
    
    // Simulate realistic daily progress with some variance
    const dayFactor = 0.8 + (Math.sin(i * 0.3) * 0.2)
    const weatherImpact = i % 7 === 6 ? 0.3 : 1 // Reduced progress on "weather days"
    
    dailyArray.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: date.toISOString().split('T')[0],
      'Welding - Mainline': Math.floor(450 * dayFactor * weatherImpact),
      'Coating': Math.floor(520 * dayFactor * weatherImpact),
      'Ditch': Math.floor(680 * dayFactor * weatherImpact),
      'Lower-in': Math.floor(720 * dayFactor * weatherImpact),
      'Clearing': Math.floor(950 * dayFactor * weatherImpact),
      'Grading': Math.floor(620 * dayFactor * weatherImpact),
      labourHours: Math.floor(2800 * dayFactor * weatherImpact),
      equipmentHours: Math.floor(1400 * dayFactor * weatherImpact)
    })
  }
  
  // Calculate totals based on elapsed time
  const daysElapsed = numDays
  const progressFactor = Math.min(daysElapsed / 365, 1) * 0.92 // 92% of planned (slightly behind)
  
  const phaseProgress = {
    'Clearing': Math.floor(47000 * progressFactor * 1.05),
    'Grading': Math.floor(47000 * progressFactor * 0.98),
    'Stringing': Math.floor(47000 * progressFactor * 0.95),
    'Welding - Mainline': Math.floor(47000 * progressFactor * 0.88),
    'Coating': Math.floor(47000 * progressFactor * 0.85),
    'Ditch': Math.floor(47000 * progressFactor * 0.82),
    'Lower-in': Math.floor(47000 * progressFactor * 0.75),
    'Backfill': Math.floor(47000 * progressFactor * 0.68),
    'HDD': Math.floor(2800 * progressFactor * 0.72),
    'Tunnel': Math.floor(9000 * progressFactor * 0.45)
  }
  
  const phaseCosts = {}
  Object.keys(phaseProgress).forEach(phase => {
    const target = plannedTargets[phase] || { costPerMetre: 50 }
    phaseCosts[phase] = phaseProgress[phase] * target.costPerMetre
  })
  
  const totalLabourHours = dailyArray.reduce((sum, d) => sum + d.labourHours, 0)
  const totalEquipmentHours = dailyArray.reduce((sum, d) => sum + d.equipmentHours, 0)
  const totalCost = Object.values(phaseCosts).reduce((sum, c) => sum + c, 0)
  
  const phaseCompletion = Object.keys(phaseProgress).map(phase => ({
    phase,
    actual: phaseProgress[phase],
    planned: plannedTargets[phase]?.metres || 47000,
    actualPercent: ((phaseProgress[phase] / (plannedTargets[phase]?.metres || 47000)) * 100).toFixed(1),
    cost: phaseCosts[phase] || 0
  }))
  
  return {
    dailyArray,
    phaseProgress,
    phaseCosts,
    phaseCompletion,
    totalLabourHours,
    totalEquipmentHours,
    totalCost,
    avgDailyCost: totalCost / Math.max(dailyArray.length, 1),
    projectedCost: (totalCost / Math.max(dailyArray.length, 1)) * 30,
    totalTimeLost: Math.floor(daysElapsed * 0.8), // ~0.8 hours lost per day on average
    reportCount: dailyArray.length
  }
}

// Generate crew-specific quality data
function getCrewData(crewType) {
  const baseValues = {
    'Clearing': { base: 950, variance: 150, passRate: 97 },
    'Stripping': { base: 780, variance: 120, passRate: 96 },
    'Grading': { base: 620, variance: 100, passRate: 95 },
    'Stringing': { base: 2200, variance: 300, passRate: 98 },
    'Bending': { base: 85, variance: 15, passRate: 96 },
    'Welding': { base: 48, variance: 8, passRate: 91 },
    'Tie-in Welding': { base: 14, variance: 4, passRate: 88 },
    'Coating': { base: 580, variance: 80, passRate: 95 },
    'Ditch': { base: 680, variance: 100, passRate: 97 },
    'Lower-in': { base: 720, variance: 90, passRate: 98 },
    'Backfill': { base: 850, variance: 110, passRate: 97 },
    'Machine Cleanup': { base: 520, variance: 70, passRate: 95 },
    'Final Cleanup': { base: 480, variance: 60, passRate: 94 },
    'Hydrostatic Test': { base: 3500, variance: 500, passRate: 100 },
    'HDD': { base: 85, variance: 25, passRate: 92 },
    'Tunnel': { base: 18, variance: 5, passRate: 94 }
  }
  
  const seed = crewType.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const config = baseValues[crewType] || { base: 500, variance: 100, passRate: 95 }
  
  const dates = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dates.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
  }
  
  return dates.map((date, idx) => {
    const count = Math.floor(config.base + (Math.sin(seed + idx) * config.variance))
    const failRate = (100 - config.passRate) + (Math.sin(seed + idx * 2) * 2)
    const failed = Math.max(0, Math.floor(count * failRate / 100))
    const passed = count - failed
    const passRate = ((passed / count) * 100).toFixed(1)
    
    return {
      date,
      count,
      passed,
      failed,
      passRate,
      failRate: (100 - parseFloat(passRate)).toFixed(1)
    }
  })
}

// Spread/Crew performance data
const spreadData = [
  {
    name: 'Spread 1 - Mainline North',
    foreman: 'Brad Whitworth',
    kpRange: '0+000 to 20+000',
    labourCount: 145,
    equipmentUnits: 42,
    welders: 24,
    spi: 0.93,
    dailyMetres: 520,
    status: 'On Track'
  },
  {
    name: 'Spread 2 - Mainline South',
    foreman: 'Gary Nelson',
    kpRange: '20+000 to 40+000',
    labourCount: 158,
    equipmentUnits: 48,
    welders: 28,
    spi: 0.88,
    dailyMetres: 485,
    status: 'Monitor - Rock delays'
  },
  {
    name: 'Spread 3 - Portal & Crossings',
    foreman: 'Mike Thompson',
    kpRange: '40+000 to 47+000 + HDDs',
    labourCount: 92,
    equipmentUnits: 28,
    welders: 12,
    spi: 0.96,
    dailyMetres: 380,
    status: 'On Track'
  },
  {
    name: 'TBM Tunnel Crew',
    foreman: 'James Wilson (Herrenknecht)',
    kpRange: 'Tunnel KP 47 to 56',
    labourCount: 85,
    equipmentUnits: 15,
    welders: 0,
    spi: 0.82,
    dailyMetres: 18,
    status: 'At Risk - Ground conditions'
  }
]

function Dashboard({ onBackToReport }) {
  const { signOut, userProfile } = useAuth()
  const navigate = useNavigate()
  const { orgPath } = useOrgPath()
  const { addOrgFilter, organizationId, isReady, isSuperAdmin } = useOrgQuery()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState(30)
  const [selectedCrewType, setSelectedCrewType] = useState('Welding')
  const [showEVM, setShowEVM] = useState(false)

  // Metric Integrity Info modal
  const metricInfoModal = useMetricIntegrityModal()
  const [activeTab, setActiveTab] = useState('overview')

  // Red Alert Explanation modal
  const [showExplanationModal, setShowExplanationModal] = useState(false)

  // Photo search state
  const [photoSearchDate, setPhotoSearchDate] = useState('')
  const [photoSearchLocation, setPhotoSearchLocation] = useState('')
  const [photoSearchInspector, setPhotoSearchInspector] = useState('')

  useEffect(() => {
    console.log('[Dashboard] useEffect - isReady:', isReady(), 'orgId:', organizationId, 'isSuperAdmin:', isSuperAdmin)
    if (isReady()) {
      loadReports()
    } else {
      console.log('[Dashboard] Not ready, skipping loadReports')
    }
  }, [dateRange, organizationId, isSuperAdmin])

  async function loadReports() {
    setLoading(true)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - dateRange)

    try {
      let query = supabase
        .from('daily_reports')
        .select('*')
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true })

      // Add organization filter
      query = addOrgFilter(query)

      const { data, error } = await query

      if (!error && data) {
        setReports(data)
      }
    } catch (e) {
      console.error('Load error:', e)
    }
    setLoading(false)
  }

  // Use demo data if no real reports
  const metrics = useMemo(() => {
    if (reports.length === 0) {
      return generateEGPDemoData(dateRange)
    }
    
    // Calculate from real reports (keeping existing logic)
    const dailyData = {}
    const phaseProgress = {}
    const phaseCosts = {}
    let totalLabourHours = 0
    let totalEquipmentHours = 0
    let totalTimeLost = 0

    reports.forEach(report => {
      const date = report.date
      if (!date) return
      
      if (!dailyData[date]) {
        dailyData[date] = { date, totalCost: 0, phases: {}, labourHours: 0, equipmentHours: 0 }
      }

      if (report.activity_blocks && Array.isArray(report.activity_blocks)) {
        report.activity_blocks.forEach(block => {
          const phase = block.activityType
          if (!phase) return

          let progress = 0
          if (block.startKP && block.endKP) {
            const start = parseFloat(block.startKP.replace('+', '.')) || 0
            const end = parseFloat(block.endKP.replace('+', '.')) || 0
            progress = Math.abs(end - start) * 1000
          }

          if (!dailyData[date].phases[phase]) dailyData[date].phases[phase] = 0
          dailyData[date].phases[phase] += progress

          if (!phaseProgress[phase]) phaseProgress[phase] = 0
          phaseProgress[phase] += progress

          if (!phaseCosts[phase]) phaseCosts[phase] = 0
          
          let blockLabourHours = 0
          if (block.labourEntries && Array.isArray(block.labourEntries)) {
            block.labourEntries.forEach(entry => {
              const hours = (entry.hours || 0) * (entry.count || 1)
              blockLabourHours += hours
              totalLabourHours += hours
              dailyData[date].labourHours += hours
            })
          }

          if (block.equipmentEntries && Array.isArray(block.equipmentEntries)) {
            block.equipmentEntries.forEach(entry => {
              const hours = (entry.hours || 0) * (entry.count || 1)
              totalEquipmentHours += hours
              dailyData[date].equipmentHours += hours
            })
          }

          const costPerMetre = plannedTargets[phase]?.costPerMetre || 50
          phaseCosts[phase] += progress > 0 ? progress * costPerMetre : blockLabourHours * 85

          if (block.timeLostHours) {
            totalTimeLost += parseFloat(block.timeLostHours) || 0
          }
        })
      }
    })

    const dailyArray = Object.values(dailyData).map(d => ({
      date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: d.date,
      labourHours: d.labourHours,
      equipmentHours: d.equipmentHours,
      ...d.phases
    }))

    const totalCost = totalLabourHours * 85 + totalEquipmentHours * 165
    const avgDailyCost = totalCost / Math.max(Object.keys(dailyData).length, 1)

    const phaseCompletion = Object.keys(phaseProgress).map(phase => ({
      phase,
      actual: phaseProgress[phase],
      planned: plannedTargets[phase]?.metres || 47000,
      actualPercent: ((phaseProgress[phase] / (plannedTargets[phase]?.metres || 47000)) * 100).toFixed(1),
      cost: phaseCosts[phase] || 0
    }))

    // If real data is minimal, supplement with demo data
    if (Object.keys(phaseProgress).length < 3) {
      return generateEGPDemoData(dateRange)
    }

    // Calculate reliability score (Goodhart's Law protection)
    const allBlocks = reports.flatMap(r => r.activity_blocks || [])
    const reliabilityData = aggregateReliabilityScore(allBlocks)

    // Calculate total value lost for efficiency metrics
    let totalValueLost = 0
    let totalBilledHours = 0
    let totalShadowHours = 0
    allBlocks.forEach(block => {
      totalBilledHours += calculateTotalBilledHours(block)
      totalShadowHours += calculateTotalShadowHours(block)
      totalValueLost += calculateValueLost(block, {}, {})
    })

    // Calculate value lost by responsible party (Accountability Constraint)
    const valueLostByParty = aggregateValueLostByParty(allBlocks, {}, {})

    return {
      dailyArray,
      totalCost,
      avgDailyCost,
      projectedCost: avgDailyCost * 30,
      phaseProgress,
      phaseCosts,
      phaseCompletion,
      totalLabourHours,
      totalEquipmentHours,
      totalTimeLost,
      reportCount: reports.length,
      // Reliability & Efficiency metrics
      reliability: reliabilityData,
      efficiency: {
        totalBilledHours,
        totalShadowHours,
        totalValueLost,
        inertiaRatio: totalBilledHours > 0 ? (totalShadowHours / totalBilledHours) * 100 : 100,
        valueLostByParty
      }
    }
  }, [reports, dateRange])

  // Extract productivity mismatch alerts with their explanations
  const productivityAlerts = useMemo(() => {
    if (reports.length === 0) return []

    const alerts = []
    reports.forEach(report => {
      if (report.activity_blocks && Array.isArray(report.activity_blocks)) {
        report.activity_blocks.forEach(block => {
          // Check for Truth Trigger condition
          let totalBilled = 0
          let totalShadow = 0
          let hasActiveEntries = false

          if (block.labourEntries) {
            block.labourEntries.forEach(entry => {
              const rt = parseFloat(entry.rt) || 0
              const ot = parseFloat(entry.ot) || 0
              const count = entry.count || 1
              const billed = (rt + ot) * count
              totalBilled += billed

              const prodStatus = entry.productionStatus || 'ACTIVE'
              if (prodStatus === 'ACTIVE') hasActiveEntries = true
              const multiplier = prodStatus === 'ACTIVE' ? 1.0 : prodStatus === 'SYNC_DELAY' ? 0.7 : 0.0
              totalShadow += entry.shadowEffectiveHours !== null ? parseFloat(entry.shadowEffectiveHours) : billed * multiplier
            })
          }
          if (block.equipmentEntries) {
            block.equipmentEntries.forEach(entry => {
              const hours = (parseFloat(entry.hours) || 0) * (entry.count || 1)
              totalBilled += hours

              const prodStatus = entry.productionStatus || 'ACTIVE'
              if (prodStatus === 'ACTIVE') hasActiveEntries = true
              const multiplier = prodStatus === 'ACTIVE' ? 1.0 : prodStatus === 'SYNC_DELAY' ? 0.7 : 0.0
              totalShadow += entry.shadowEffectiveHours !== null ? parseFloat(entry.shadowEffectiveHours) : hours * multiplier
            })
          }

          const inertiaRatio = totalBilled > 0 ? (totalShadow / totalBilled) * 100 : 0

          // Calculate linear metres (KP Difference)
          let linearMetres = 0
          if (block.startKP && block.endKP) {
            const parseKP = (kp) => {
              if (!kp) return null
              const str = String(kp).trim()
              const match = str.match(/^(\d+)\+(\d+)$/)
              if (match) return parseInt(match[1]) * 1000 + parseInt(match[2])
              const num = parseFloat(str)
              return !isNaN(num) ? (num >= 100 ? num : num * 1000) : null
            }
            const startM = parseKP(block.startKP)
            const endM = parseKP(block.endKP)
            if (startM !== null && endM !== null) {
              linearMetres = Math.abs(endM - startM)
            }
          }

          // Truth Trigger conditions:
          // 1. High efficiency (>= 80%) but low/no progress (< 50m)
          // 2. OR: Any entry marked ACTIVE but KP difference is 0
          const highEfficiencyLowProgress = inertiaRatio >= 80 && linearMetres < 50 && totalBilled > 0
          const activeButZeroProgress = hasActiveEntries && linearMetres === 0 && totalBilled > 0

          if (highEfficiencyLowProgress || activeButZeroProgress) {
            const triggerType = activeButZeroProgress && linearMetres === 0
              ? 'Active status with zero KP progress'
              : 'High efficiency, low progress'

            alerts.push({
              date: report.date,
              inspector: report.inspector_name,
              spread: report.spread,
              activityType: block.activityType,
              inertiaRatio: inertiaRatio.toFixed(0),
              linearMetres,
              explanation: block.reliability_notes || null,
              startKP: block.startKP,
              endKP: block.endKP,
              triggerType,
              severity: linearMetres === 0 ? 'red' : 'amber'
            })
          }
        })
      }
    })

    return alerts.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [reports])

  // Photo helper functions
  function getFilteredPhotos() {
    const allPhotos = []
    reports.forEach(report => {
      if (report.activity_blocks && Array.isArray(report.activity_blocks)) {
        report.activity_blocks.forEach(block => {
          if (block.workPhotos && Array.isArray(block.workPhotos)) {
            block.workPhotos.forEach(photo => {
              if (typeof photo === 'string') {
                allPhotos.push({ filename: photo, originalName: photo, date: report.date, inspector: report.inspector_name, spread: report.spread, location: '', description: '', activityType: block.activityType })
              } else {
                allPhotos.push({ ...photo, date: photo.date || report.date, inspector: photo.inspector || report.inspector_name, spread: photo.spread || report.spread, activityType: block.activityType })
              }
            })
          }
        })
      }
    })
    
    return allPhotos.filter(photo => {
      if (photoSearchDate && photo.date !== photoSearchDate) return false
      if (photoSearchLocation && !photo.location?.toLowerCase().includes(photoSearchLocation.toLowerCase())) return false
      if (photoSearchInspector && photo.inspector !== photoSearchInspector) return false
      return true
    })
  }

  function getAllInspectors() {
    const inspectors = new Set()
    reports.forEach(report => {
      if (report.inspector_name) inspectors.add(report.inspector_name)
    })
    return [...inspectors]
  }

  function getTotalPhotoCount() {
    let count = 0
    reports.forEach(report => {
      if (report.activity_blocks) {
        report.activity_blocks.forEach(block => {
          count += block.workPhotos?.length || 0
        })
      }
    })
    return count || Math.floor(metrics.reportCount * 2.5) // Demo fallback
  }

  const formatCurrency = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`
    return `$${value.toFixed(0)}`
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Loading CMT Dashboard...</h2>
        <p>{EGP_PROJECT.fullName}</p>
      </div>
    )
  }

  if (showEVM) {
    return <EVMDashboard onBack={() => setShowEVM(false)} />
  }

  // Calculate workforce totals from spread data
  const workforceTotals = spreadData.reduce((acc, s) => ({
    labour: acc.labour + s.labourCount,
    equipment: acc.equipment + s.equipmentUnits,
    welders: acc.welders + s.welders
  }), { labour: 0, equipment: 0, welders: 0 })

  return (
    <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
          <div>
            <h1 style={{ margin: '0 0 5px 0', fontSize: '26px', color: '#1a237e' }}>📊 CMT Dashboard</h1>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
              <strong>{EGP_PROJECT.name}</strong> | {EGP_PROJECT.fullName}
            </p>
            <p style={{ margin: '3px 0 0', color: '#888', fontSize: '12px' }}>
              {EGP_PROJECT.client} | {EGP_PROJECT.contractor} | {EGP_PROJECT.pipeSpec}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(parseInt(e.target.value))}
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px' }}
            >
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
              <option value={180}>Last 6 Months</option>
              <option value={365}>All Time</option>
            </select>
            <button
              onClick={() => navigate(orgPath('/evm-dashboard'))}
              style={{ padding: '10px 16px', backgroundColor: '#20c997', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              View Financials (EVM)
            </button>
            <button
              onClick={() => navigate(orgPath('/chief-dashboard'))}
              style={{ padding: '10px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Chief Dashboard
            </button>
            <button
              onClick={signOut}
              style={{ padding: '10px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ borderBottom: '2px solid #ddd', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            {[
              { id: 'overview', label: '📋 Overview' },
              { id: 'progress', label: '📏 Progress' },
              { id: 'productivity', label: '⚡ Productivity' },
              { id: 'efficiency', label: '💸 Efficiency' },
              { id: 'quality', label: '✅ Quality' },
              { id: 'crews', label: '👷 Crews' },
              { id: 'photos', label: '📷 Photos' },
              { id: 'reports', label: '📄 Reports' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '3px solid #1a237e' : '3px solid transparent',
                  backgroundColor: activeTab === tab.id ? 'white' : 'transparent',
                  color: activeTab === tab.id ? '#1a237e' : '#666',
                  fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                  cursor: 'pointer',
                  fontSize: '13px',
                  borderRadius: '4px 4px 0 0'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
          {/* Report Summary */}
          <div style={{ backgroundColor: '#1a237e', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
            PROJECT OVERVIEW - {dateRange === 365 ? 'All Time' : `Last ${dateRange} Days`}
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <div style={{ padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#007bff' }}>{metrics?.reportCount || 0}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Reports</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#d4edda', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#28a745' }}>{Object.keys(metrics?.phaseProgress || {}).length}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Active Phases</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#856404' }}>{(metrics?.totalLabourHours || 0).toLocaleString()}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Labour Hours</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#cce5ff', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#004085' }}>{(metrics?.totalEquipmentHours || 0).toLocaleString()}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Equipment Hours</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#2e7d32' }}>{workforceTotals.labour}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Total Workforce</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f8d7da', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#721c24' }}>{metrics?.totalTimeLost || 0}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Hours Lost</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#e2d5f1', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#6f42c1' }}>{getTotalPhotoCount()}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Work Photos</div>
              </div>
            </div>

            {/* Efficiency & Reliability Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>Efficiency & Reliability</h4>
              <button
                onClick={metricInfoModal.open}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  backgroundColor: '#e8eaf6',
                  border: '1px solid #1a237e',
                  borderRadius: '15px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  color: '#1a237e',
                  fontWeight: '600'
                }}
              >
                <span style={{ fontSize: '14px' }}>ℹ️</span> Learn More
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
              {/* Reliability Shield */}
              <div style={{
                padding: '15px',
                backgroundColor: metrics?.reliability?.bgColor || '#d4edda',
                borderRadius: '8px',
                textAlign: 'center',
                border: `2px solid ${metrics?.reliability?.color || '#28a745'}`,
                position: 'relative'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '4px' }}>
                  {metrics?.reliability?.icon || '🛡️'}
                </div>
                <div style={{
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: metrics?.reliability?.color || '#28a745'
                }}>
                  {metrics?.reliability?.overallScore || 100}%
                </div>
                <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold' }}>
                  Data Reliability
                </div>
                <div style={{
                  fontSize: '9px',
                  color: metrics?.reliability?.color || '#28a745',
                  marginTop: '2px'
                }}>
                  {metrics?.reliability?.label || 'Reliable'}
                </div>
                {/* View Explanations button for Amber/Red Alerts */}
                {productivityAlerts.length > 0 && (
                  <button
                    onClick={() => setShowExplanationModal(true)}
                    style={{
                      marginTop: '8px',
                      padding: '4px 8px',
                      fontSize: '10px',
                      backgroundColor: productivityAlerts.some(a => a.severity === 'red') ? '#dc3545' : '#ffc107',
                      color: productivityAlerts.some(a => a.severity === 'red') ? 'white' : '#333',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    🔍 View {productivityAlerts.length} Alert{productivityAlerts.length > 1 ? 's' : ''}
                  </button>
                )}
              </div>

              {/* Efficiency Score */}
              <div style={{
                padding: '15px',
                backgroundColor: metrics?.efficiency?.inertiaRatio >= 90 ? '#d4edda' :
                                metrics?.efficiency?.inertiaRatio >= 70 ? '#fff3cd' : '#f8d7da',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '26px',
                  fontWeight: 'bold',
                  color: metrics?.efficiency?.inertiaRatio >= 90 ? '#28a745' :
                         metrics?.efficiency?.inertiaRatio >= 70 ? '#856404' : '#dc3545'
                }}>
                  {(metrics?.efficiency?.inertiaRatio || 100).toFixed(0)}%
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>Efficiency</div>
                <div style={{ fontSize: '9px', color: '#999' }}>
                  {(metrics?.efficiency?.totalShadowHours || 0).toFixed(0)}/{(metrics?.efficiency?.totalBilledHours || 0).toFixed(0)} hrs
                </div>
              </div>

              {/* Value Lost */}
              <div style={{ padding: '15px', backgroundColor: '#f8d7da', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#dc3545' }}>
                  ${((metrics?.efficiency?.totalValueLost || 0) / 1000).toFixed(0)}K
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>Value Lost</div>
                <div style={{ fontSize: '9px', color: '#999' }}>Due to inefficiency</div>
              </div>

              {/* Contractor Drag - Accountability Constraint */}
              <div style={{
                padding: '15px',
                backgroundColor: (metrics?.efficiency?.valueLostByParty?.contractor || 0) > 0 ? '#f8d7da' : '#d4edda',
                borderRadius: '8px',
                textAlign: 'center',
                border: (metrics?.efficiency?.valueLostByParty?.contractor || 0) > 0 ? '2px solid #dc3545' : '1px solid #28a745'
              }}>
                <div style={{ fontSize: '16px', marginBottom: '2px' }}>🔧</div>
                <div style={{
                  fontSize: '22px',
                  fontWeight: 'bold',
                  color: (metrics?.efficiency?.valueLostByParty?.contractor || 0) > 0 ? '#dc3545' : '#28a745'
                }}>
                  ${((metrics?.efficiency?.valueLostByParty?.contractor || 0) / 1000).toFixed(0)}K
                </div>
                <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold' }}>Contractor Drag</div>
                <div style={{ fontSize: '9px', color: '#999', marginTop: '2px' }}>
                  {metrics?.efficiency?.valueLostByParty?.total > 0
                    ? `${((metrics?.efficiency?.valueLostByParty?.contractor || 0) / metrics.efficiency.valueLostByParty.total * 100).toFixed(0)}% of total loss`
                    : 'No drag recorded'}
                </div>
              </div>

              {/* Alert Summary */}
              <div style={{
                padding: '15px',
                backgroundColor: (metrics?.reliability?.redCount || 0) > 0 ? '#f8d7da' :
                                (metrics?.reliability?.amberCount || 0) > 0 ? '#fff3cd' : '#d4edda',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px' }}>
                    <span style={{ color: '#28a745' }}>●</span> {metrics?.reliability?.greenCount || 0}
                  </span>
                  <span style={{ fontSize: '12px' }}>
                    <span style={{ color: '#ffc107' }}>●</span> {metrics?.reliability?.amberCount || 0}
                  </span>
                  <span style={{ fontSize: '12px' }}>
                    <span style={{ color: '#dc3545' }}>●</span> {metrics?.reliability?.redCount || 0}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold' }}>Block Status</div>
                <div style={{ fontSize: '9px', color: '#999' }}>
                  {metrics?.reliability?.blockCount || 0} blocks analyzed
                </div>
              </div>
            </div>

            {/* Responsibility Breakdown - Pie Chart */}
            {(metrics?.efficiency?.valueLostByParty?.total || 0) > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>
                  🔧 Responsibility Breakdown - Value Lost by Party
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px', alignItems: 'center' }}>
                  {/* Pie Chart */}
                  <div style={{ height: '200px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Contractor', value: metrics?.efficiency?.valueLostByParty?.contractor || 0, fill: '#dc3545' },
                            { name: 'Owner', value: metrics?.efficiency?.valueLostByParty?.owner || 0, fill: '#1976d2' },
                            { name: 'Neutral', value: metrics?.efficiency?.valueLostByParty?.neutral || 0, fill: '#6c757d' },
                            { name: 'Unknown', value: metrics?.efficiency?.valueLostByParty?.unknown || 0, fill: '#ffc107' }
                          ].filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          labelLine={true}
                        >
                          {[
                            { fill: '#dc3545' },
                            { fill: '#1976d2' },
                            { fill: '#6c757d' },
                            { fill: '#ffc107' }
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `$${(value / 1000).toFixed(1)}K`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Breakdown Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                    {/* Contractor Drag */}
                    <div style={{
                      padding: '12px',
                      backgroundColor: '#f8d7da',
                      borderRadius: '8px',
                      borderLeft: '4px solid #dc3545'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '18px' }}>🔧</span>
                        <span style={{ fontWeight: 'bold', color: '#dc3545' }}>Contractor</span>
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#dc3545' }}>
                        ${((metrics?.efficiency?.valueLostByParty?.contractor || 0) / 1000).toFixed(1)}K
                      </div>
                      <div style={{ fontSize: '10px', color: '#666' }}>
                        {metrics?.efficiency?.valueLostByParty?.total > 0
                          ? `${((metrics?.efficiency?.valueLostByParty?.contractor || 0) / metrics.efficiency.valueLostByParty.total * 100).toFixed(1)}% of total`
                          : '0%'}
                      </div>
                    </div>

                    {/* Owner Drag */}
                    <div style={{
                      padding: '12px',
                      backgroundColor: '#e3f2fd',
                      borderRadius: '8px',
                      borderLeft: '4px solid #1976d2'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '18px' }}>🏛️</span>
                        <span style={{ fontWeight: 'bold', color: '#1976d2' }}>Owner</span>
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1976d2' }}>
                        ${((metrics?.efficiency?.valueLostByParty?.owner || 0) / 1000).toFixed(1)}K
                      </div>
                      <div style={{ fontSize: '10px', color: '#666' }}>
                        {metrics?.efficiency?.valueLostByParty?.total > 0
                          ? `${((metrics?.efficiency?.valueLostByParty?.owner || 0) / metrics.efficiency.valueLostByParty.total * 100).toFixed(1)}% of total`
                          : '0%'}
                      </div>
                    </div>

                    {/* Neutral */}
                    <div style={{
                      padding: '12px',
                      backgroundColor: '#e9ecef',
                      borderRadius: '8px',
                      borderLeft: '4px solid #6c757d'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '18px' }}>⚖️</span>
                        <span style={{ fontWeight: 'bold', color: '#6c757d' }}>Neutral</span>
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#6c757d' }}>
                        ${((metrics?.efficiency?.valueLostByParty?.neutral || 0) / 1000).toFixed(1)}K
                      </div>
                      <div style={{ fontSize: '10px', color: '#666' }}>
                        Weather, Force Majeure, Safety
                      </div>
                    </div>

                    {/* Unknown/Other */}
                    <div style={{
                      padding: '12px',
                      backgroundColor: '#fff3cd',
                      borderRadius: '8px',
                      borderLeft: '4px solid #ffc107'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '18px' }}>❓</span>
                        <span style={{ fontWeight: 'bold', color: '#856404' }}>Unknown</span>
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#856404' }}>
                        ${((metrics?.efficiency?.valueLostByParty?.unknown || 0) / 1000).toFixed(1)}K
                      </div>
                      <div style={{ fontSize: '10px', color: '#666' }}>
                        Custom/Other reasons
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary insight */}
                {(metrics?.efficiency?.valueLostByParty?.contractor || 0) > 0 && (
                  <div style={{
                    marginTop: '15px',
                    padding: '12px',
                    backgroundColor: '#f8d7da',
                    borderRadius: '8px',
                    border: '1px solid #dc3545',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <span style={{ fontSize: '24px' }}>⚠️</span>
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#721c24', fontSize: '13px' }}>
                        Contractor Performance Alert
                      </div>
                      <div style={{ fontSize: '12px', color: '#856404' }}>
                        ${((metrics?.efficiency?.valueLostByParty?.contractor || 0) / 1000).toFixed(1)}K in value lost is attributable to contractor issues
                        (Mechanical, Latency, ROW Congestion, Rework, Materials). Review contractor drag notes for details.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Activity breakdown */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Active Construction Phases</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {Object.entries(metrics?.phaseProgress || {}).map(([phase, metres]) => (
                  <div 
                    key={phase}
                    style={{ 
                      padding: '8px 15px', 
                      backgroundColor: phaseColors[phase] || '#666',
                      color: 'white',
                      borderRadius: '20px',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span style={{ fontWeight: 'bold' }}>{phase}</span>
                    <span style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>
                      {metres > 0 ? `${(metres / 1000).toFixed(1)}km` : 'Active'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cost Metrics */}
          <div style={{ backgroundColor: '#DC143C', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
            COST METRICS
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Total Cost (Period)</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#333' }}>{formatCurrency(metrics?.totalCost || 0)}</div>
                <div style={{ fontSize: '11px', color: '#999' }}>All phases combined</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Avg Daily Cost</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#333' }}>{formatCurrency(metrics?.avgDailyCost || 0)}</div>
                <div style={{ fontSize: '11px', color: '#999' }}>Per day average</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Project Budget</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#1a237e' }}>{formatCurrency(EGP_PROJECT.totalBudget)}</div>
                <div style={{ fontSize: '11px', color: '#999' }}>Total BAC</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>30-Day Projection</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#dc3545' }}>{formatCurrency(metrics?.projectedCost || 0)}</div>
                <div style={{ fontSize: '11px', color: '#999' }}>Burn rate projection</div>
              </div>
            </div>

            {/* Daily Cost Chart */}
            <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>Daily Labour & Equipment Hours</h4>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={metrics?.dailyArray || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="labourHours" fill="#1976d2" name="Labour Hours" />
                <Bar dataKey="equipmentHours" fill="#ff9800" name="Equipment Hours" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* PROGRESS TAB */}
      {activeTab === 'progress' && (
        <>
          <div style={{ backgroundColor: '#32CD32', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
            PROGRESS BY PHASE
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
            {/* Daily Progress Chart */}
            <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>Daily Linear Metres by Phase</h4>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={metrics?.dailyArray || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="Clearing" stackId="1" fill="#8B4513" stroke="#8B4513" name="Clearing" />
                <Area type="monotone" dataKey="Grading" stackId="1" fill="#DAA520" stroke="#DAA520" name="Grading" />
                <Area type="monotone" dataKey="Ditch" stackId="1" fill="#32CD32" stroke="#32CD32" name="Ditch" />
                <Area type="monotone" dataKey="Lower-in" stackId="1" fill="#1E90FF" stroke="#1E90FF" name="Lower-in" />
              </AreaChart>
            </ResponsiveContainer>

            {/* Phase Progress Table */}
            <div style={{ marginTop: '25px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>Phase Completion Summary</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Phase</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Actual</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Planned</th>
                    <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Complete</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', width: '250px' }}>Progress</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(metrics?.phaseCompletion || []).map((phase, idx) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 ? '#f8f9fa' : 'white' }}>
                      <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                        <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: phaseColors[phase.phase] || '#666', borderRadius: '2px', marginRight: '8px' }}></span>
                        <strong>{phase.phase}</strong>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #dee2e6', fontWeight: 'bold' }}>{(phase.actual / 1000).toFixed(1)} km</td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #dee2e6', color: '#666' }}>{(phase.planned / 1000).toFixed(1)} km</td>
                      <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                        <span style={{ color: parseFloat(phase.actualPercent) >= 90 ? '#28a745' : parseFloat(phase.actualPercent) >= 70 ? '#ffc107' : '#dc3545', fontWeight: 'bold' }}>
                          {phase.actualPercent}%
                        </span>
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                        <div style={{ height: '16px', backgroundColor: '#e9ecef', borderRadius: '8px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(parseFloat(phase.actualPercent), 100)}%`, backgroundColor: phaseColors[phase.phase] || '#666', borderRadius: '8px' }} />
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{formatCurrency(phase.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* PRODUCTIVITY TAB */}
      {activeTab === 'productivity' && (
        <>
          <div style={{ backgroundColor: '#FF8C00', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
            PRODUCTIVITY METRICS
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
            {/* Productivity Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '25px' }}>
              {[
                { phase: 'Welding - Mainline', color: '#DC143C', label: 'ML Welding (Welds/Day)', values: [45, 48, 42, 51] },
                { phase: 'Coating', color: '#FF8C00', label: 'ML Coating (m/Day)', values: [520, 580, 495, 545] },
                { phase: 'Ditch', color: '#32CD32', label: 'Ditch Excavators (m/Day)', values: [680, 720, 650, 695] },
                { phase: 'Lower-in', color: '#1E90FF', label: 'Sidebooms (m/Day)', values: [720, 780, 690, 745] }
              ].map((item, idx) => (
                <div key={idx} style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: item.color, marginBottom: '10px' }}>{item.label}</div>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={[
                      { name: 'Crew 1', value: item.values[0] },
                      { name: 'Crew 2', value: item.values[1] }
                    ]}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill={item.color} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>

            {/* Productivity KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
              <div style={{ padding: '15px', backgroundColor: '#fff5f5', borderRadius: '8px', border: '1px solid #ffcccc' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Welding Rate</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#DC143C' }}>46.5/day</div>
                <div style={{ fontSize: '11px', color: '#999' }}>Target: 45/day</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#fff8e6', borderRadius: '8px', border: '1px solid #ffe0b2' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Coating Rate</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#FF8C00' }}>535m/day</div>
                <div style={{ fontSize: '11px', color: '#999' }}>Target: 520m/day</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '8px', border: '1px solid #c8e6c9' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Ditch Productivity</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#32CD32' }}>44.9m/hr</div>
                <div style={{ fontSize: '11px', color: '#999' }}>6,800m in 152hrs</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '8px', border: '1px solid #bbdefb' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Lower-in Productivity</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#1E90FF' }}>47.2m/hr</div>
                <div style={{ fontSize: '11px', color: '#999' }}>7,200m in 153hrs</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* EFFICIENCY TAB - Efficiency Audit Dashboard */}
      {activeTab === 'efficiency' && (
        <ShadowAuditDashboard />
      )}

      {/* QUALITY TAB */}
      {activeTab === 'quality' && (
        <>
          <div style={{ backgroundColor: '#9370DB', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
            QUALITY METRICS
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
            {/* Quality KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '25px' }}>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>Weld First Pass Rate</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>91.2%</div>
                <div style={{ fontSize: '11px', color: '#999' }}>1,248 of 1,369 welds</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>Coating Holiday Rate</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ffc107' }}>4.8%</div>
                <div style={{ fontSize: '11px', color: '#999' }}>62 holidays in 1,291 joints</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>Overall Quality Rate</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>95.2%</div>
                <div style={{ fontSize: '11px', color: '#999' }}>All phases combined</div>
              </div>
            </div>

            {/* Crew Selection */}
            <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Crew Performance Detail</h4>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', flexWrap: 'wrap' }}>
              {['Welding', 'Tie-in Welding', 'Coating', 'Ditch', 'Lower-in', 'HDD', 'Tunnel'].map(crew => (
                <button
                  key={crew}
                  onClick={() => setSelectedCrewType(crew)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    backgroundColor: selectedCrewType === crew ? '#9370DB' : '#e9ecef',
                    color: selectedCrewType === crew ? 'white' : '#333'
                  }}
                >
                  {crew}
                </button>
              ))}
            </div>

            {/* Quality Detail Table */}
            <div style={{ backgroundColor: '#f8f5ff', padding: '15px', borderRadius: '8px', border: '1px solid #d8c8f0' }}>
              <h5 style={{ fontSize: '13px', fontWeight: 'bold', color: '#9370DB', marginBottom: '15px' }}>
                {selectedCrewType} - Quality Detail (Last 7 Days)
              </h5>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Date</th>
                    <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>{['Welding', 'Tie-in Welding'].includes(selectedCrewType) ? 'Welds' : 'Metres'}</th>
                    <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6', color: '#28a745' }}>Passed</th>
                    <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6', color: '#dc3545' }}>Failed</th>
                    <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Pass Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {getCrewData(selectedCrewType).map((row, idx) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>{row.date}</td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6', fontWeight: 'bold' }}>{row.count}</td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6', color: '#28a745' }}>{row.passed}</td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6', color: '#dc3545' }}>{row.failed}</td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                        <span style={{ color: parseFloat(row.passRate) >= 95 ? '#28a745' : parseFloat(row.passRate) >= 90 ? '#ffc107' : '#dc3545', fontWeight: 'bold' }}>
                          {row.passRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* CREWS TAB */}
      {activeTab === 'crews' && (
        <>
          <div style={{ backgroundColor: '#1565c0', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
            CREW / SPREAD PERFORMANCE
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px', marginBottom: '25px' }}>
              <div style={{ padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Total Workforce</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1565c0' }}>{workforceTotals.labour}</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Equipment Units</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2e7d32' }}>{workforceTotals.equipment}</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#fff3e0', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Welders</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef6c00' }}>{workforceTotals.welders}</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#fce4ec', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Active Spreads</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#c2185b' }}>{spreadData.length}</div>
              </div>
              <div style={{ padding: '15px', backgroundColor: '#f3e5f5', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#666' }}>Peak Workforce</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#7b1fa2' }}>{EGP_PROJECT.peakWorkforce || 650}</div>
              </div>
            </div>

            {/* Spread Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              {spreadData.map((spread, i) => {
                const spiColor = spread.spi >= 1.0 ? '#28a745' : spread.spi >= 0.9 ? '#ffc107' : '#dc3545'
                return (
                  <div key={i} style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', borderLeft: `4px solid ${spiColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                      <div>
                        <h4 style={{ margin: '0 0 5px 0', fontSize: '15px' }}>{spread.name}</h4>
                        <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Foreman: {spread.foreman}</p>
                        <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#888' }}>{spread.kpRange}</p>
                      </div>
                      <span style={{ 
                        padding: '4px 10px', 
                        backgroundColor: spread.status === 'On Track' ? '#e8f5e9' : spread.status.includes('Monitor') ? '#fff3e0' : '#ffebee',
                        color: spread.status === 'On Track' ? '#2e7d32' : spread.status.includes('Monitor') ? '#ef6c00' : '#c62828',
                        borderRadius: '12px', fontSize: '11px', fontWeight: '600'
                      }}>
                        {spread.status}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#666' }}>SPI</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: spiColor }}>{spread.spi.toFixed(2)}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#666' }}>Daily m</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>{spread.dailyMetres}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#666' }}>Labour</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>{spread.labourCount}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#666' }}>Equip</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>{spread.equipmentUnits}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#666' }}>Welders</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>{spread.welders}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* PHOTOS TAB */}
      {activeTab === 'photos' && (
        <>
          <div style={{ backgroundColor: '#6f42c1', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
            WORK PHOTO SEARCH
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
            {/* Search Filters */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>Date</label>
                <input type="date" value={photoSearchDate} onChange={(e) => setPhotoSearchDate(e.target.value)} style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>Location/KP</label>
                <input type="text" value={photoSearchLocation} onChange={(e) => setPhotoSearchLocation(e.target.value)} placeholder="Search location..." style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', width: '150px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#666' }}>Inspector</label>
                <select value={photoSearchInspector} onChange={(e) => setPhotoSearchInspector(e.target.value)} style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}>
                  <option value="">All Inspectors</option>
                  {getAllInspectors().map(insp => <option key={insp} value={insp}>{insp}</option>)}
                </select>
              </div>
              <div style={{ alignSelf: 'flex-end' }}>
                <button onClick={() => { setPhotoSearchDate(''); setPhotoSearchLocation(''); setPhotoSearchInspector(''); }} style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Photo Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
              {getFilteredPhotos().length > 0 ? (
                getFilteredPhotos().map((photo, idx) => (
                  <div key={idx} style={{ border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f8f9fa' }}>
                    <div style={{ height: '160px', backgroundColor: '#e9ecef', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}
                      onClick={() => window.open(`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${photo.filename}`, '_blank')}>
                      <img 
                        src={`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${photo.filename}`}
                        alt={photo.description || photo.originalName}
                        style={{ maxWidth: '100%', maxHeight: '160px', objectFit: 'cover', width: '100%', height: '160px' }}
                        onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<div style="color: #999; font-size: 12px;">📷 Image</div>' }}
                      />
                    </div>
                    <div style={{ padding: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#6f42c1', marginBottom: '8px' }}>{photo.originalName || photo.filename}</div>
                      <div style={{ fontSize: '11px', color: '#666' }}>
                        <div><strong>Date:</strong> {photo.date}</div>
                        <div><strong>Inspector:</strong> {photo.inspector}</div>
                        {photo.activityType && <div><strong>Activity:</strong> {photo.activityType}</div>}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#666' }}>
                  {reports.length === 0 ? 'No reports loaded. Photos will appear when inspectors upload them.' : 'No photos match your search criteria.'}
                </div>
              )}
            </div>

            {/* Photo Stats */}
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f3e5f5', borderRadius: '8px', display: 'flex', gap: '30px' }}>
              <div><span style={{ fontSize: '12px', color: '#666' }}>Total Photos:</span><span style={{ fontSize: '16px', fontWeight: 'bold', marginLeft: '8px' }}>{getTotalPhotoCount()}</span></div>
              <div><span style={{ fontSize: '12px', color: '#666' }}>Filtered:</span><span style={{ fontSize: '16px', fontWeight: 'bold', marginLeft: '8px' }}>{getFilteredPhotos().length}</span></div>
            </div>
          </div>
        </>
      )}

      {/* REPORTS TAB */}
      {activeTab === 'reports' && (
        <>
          <div style={{ backgroundColor: '#28a745', color: 'white', padding: '10px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
            RECENT INSPECTION REPORTS
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
            {reports.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {reports.slice(-15).reverse().map((report, idx) => (
                  <div key={idx} style={{ border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ backgroundColor: '#f8f9fa', padding: '12px 15px', borderBottom: '1px solid #dee2e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 'bold', color: '#333' }}>{report.date}</span>
                        <span style={{ marginLeft: '15px', color: '#666' }}>Inspector: {report.inspector_name}</span>
                        <span style={{ marginLeft: '15px', color: '#666' }}>Spread: {report.spread || 'N/A'}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#999' }}>
                        {report.activity_blocks?.length || 0} activit{report.activity_blocks?.length === 1 ? 'y' : 'ies'}
                      </div>
                    </div>
                    
                    {report.activity_blocks && report.activity_blocks.length > 0 && (
                      <div style={{ padding: '15px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                          {report.activity_blocks.map((block, blockIdx) => (
                            <div key={blockIdx} style={{ padding: '10px 15px', backgroundColor: phaseColors[block.activityType] || '#6c757d', color: 'white', borderRadius: '8px', fontSize: '13px', minWidth: '200px' }}>
                              <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{block.activityType || 'Activity'}</div>
                              <div style={{ fontSize: '11px', opacity: 0.9 }}>
                                {block.contractor && <div>Contractor: {block.contractor}</div>}
                                {block.startKP && block.endKP && <div>KP: {block.startKP} → {block.endKP}</div>}
                                {block.labourEntries?.length > 0 && <div>Labour: {block.labourEntries.reduce((sum, e) => sum + (e.count || 1), 0)} workers</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>📄</div>
                <div>No reports loaded for this period.</div>
                <div style={{ fontSize: '12px', marginTop: '5px' }}>Demo data is displayed in other tabs.</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: '#999', padding: '15px', borderTop: '1px solid #ddd' }}>
        <p style={{ margin: 0 }}>Generated by <strong>Pipe-Up</strong> | {EGP_PROJECT.name} | {EGP_PROJECT.pipeSpec}</p>
        <p style={{ margin: '5px 0 0' }}>Demo Data - For Demonstration Purposes</p>
      </div>

      {/* Metric Integrity Info Modal */}
      <MetricIntegrityModal isOpen={metricInfoModal.isOpen} onClose={metricInfoModal.close} />

      {/* Red Alert Explanations Modal */}
      {showExplanationModal && (
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
          zIndex: 10000,
          padding: '20px'
        }} onClick={() => setShowExplanationModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
          >
            {/* Header */}
            <div style={{
              backgroundColor: '#dc3545',
              color: 'white',
              padding: '15px 20px',
              borderRadius: '12px 12px 0 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px' }}>
                  🚨 Productivity Mismatch Alerts
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
                  Inspector explanations for high efficiency with low progress
                </p>
              </div>
              <button
                onClick={() => setShowExplanationModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: 'white',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '18px'
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '20px' }}>
              {productivityAlerts.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#666' }}>No alerts to display.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {productivityAlerts.map((alert, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '15px',
                        backgroundColor: alert.explanation ? '#f8f9fa' : '#fff5f5',
                        border: `1px solid ${alert.severity === 'red' ? '#f5c6cb' : '#ffeeba'}`,
                        borderRadius: '8px',
                        borderLeft: `4px solid ${alert.severity === 'red' ? '#dc3545' : '#ffc107'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 'bold', color: '#333', fontSize: '14px' }}>
                              {alert.activityType || 'Unknown Activity'}
                            </span>
                            <span style={{
                              padding: '2px 6px',
                              fontSize: '9px',
                              fontWeight: 'bold',
                              borderRadius: '10px',
                              backgroundColor: alert.severity === 'red' ? '#dc3545' : '#ffc107',
                              color: alert.severity === 'red' ? 'white' : '#333'
                            }}>
                              {alert.severity === 'red' ? 'RED' : 'AMBER'}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                            {alert.date} | {alert.inspector || 'Unknown'} | {alert.spread || 'N/A'}
                          </div>
                          {alert.startKP && alert.endKP && (
                            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                              KP: {alert.startKP} → {alert.endKP}
                            </div>
                          )}
                          <div style={{ fontSize: '10px', color: '#856404', marginTop: '4px', fontStyle: 'italic' }}>
                            Trigger: {alert.triggerType}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '12px' }}>
                            <span style={{ color: alert.severity === 'red' ? '#dc3545' : '#856404', fontWeight: 'bold' }}>
                              {alert.inertiaRatio}% efficiency
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#666' }}>
                            {alert.linearMetres}m progress
                          </div>
                        </div>
                      </div>

                      <div style={{
                        padding: '10px',
                        backgroundColor: alert.explanation ? '#e8f5e9' : '#ffebee',
                        borderRadius: '4px',
                        borderLeft: `3px solid ${alert.explanation ? '#28a745' : '#dc3545'}`
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }}>
                          Inspector Explanation:
                        </div>
                        <div style={{ fontSize: '13px', color: '#333' }}>
                          {alert.explanation || (
                            <span style={{ color: '#dc3545', fontStyle: 'italic' }}>
                              No explanation provided - awaiting inspector input
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div style={{
                marginTop: '20px',
                padding: '12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-around',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#dc3545' }}>
                    {productivityAlerts.length}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666' }}>Total Alerts</div>
                </div>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#28a745' }}>
                    {productivityAlerts.filter(a => a.explanation).length}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666' }}>With Explanation</div>
                </div>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ffc107' }}>
                    {productivityAlerts.filter(a => !a.explanation).length}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666' }}>Pending</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
