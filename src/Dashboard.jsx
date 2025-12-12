import React, { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ComposedChart, Cell
} from 'recharts'
import EVMDashboard from './EVMDashboard'
import { supabase } from './supabase'

// Phase colors
const phaseColors = {
  'Clearing': '#8B4513',
  'Access': '#A0522D',
  'Topsoil': '#CD853F',
  'Stripping': '#D2691E',
  'Grading': '#DAA520',
  'Stringing': '#9370DB',
  'Bending': '#4169E1',
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
  'Reclamation': '#228B22'
}

// Planned targets (example - would come from project config)
const plannedTargets = {
  'Clearing': { metres: 50000, costPerMetre: 15 },
  'Stripping': { metres: 50000, costPerMetre: 20 },
  'Grading': { metres: 50000, costPerMetre: 25 },
  'Stringing': { metres: 50000, costPerMetre: 30 },
  'Bending': { metres: 50000, costPerMetre: 50 },
  'Welding - Mainline': { metres: 50000, costPerMetre: 150 },
  'Coating': { metres: 50000, costPerMetre: 40 },
  'Ditch': { metres: 50000, costPerMetre: 35 },
  'Lower-in': { metres: 50000, costPerMetre: 45 },
  'Backfill': { metres: 50000, costPerMetre: 25 },
  'Cleanup': { metres: 50000, costPerMetre: 20 },
  'Hydrostatic Testing': { metres: 50000, costPerMetre: 60 }
}

function Dashboard({ onBackToReport }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState(7) // Last 7 days
  const [selectedCrewType, setSelectedCrewType] = useState('Clearing')

  // Generate sample data for each crew type (will be replaced with real data from reports)
  function getCrewData(crewType) {
    // Seed random based on crew type for consistent demo data
    const seed = crewType.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const baseValues = {
      'Clearing': { base: 850, variance: 150, passRate: 96 },
      'Stripping': { base: 720, variance: 120, passRate: 95 },
      'Grading': { base: 680, variance: 100, passRate: 94 },
      'Stringing': { base: 1200, variance: 200, passRate: 98 },
      'Bending': { base: 45, variance: 10, passRate: 97 },
      'Welding': { base: 42, variance: 8, passRate: 92 },
      'Tie-in Welding': { base: 12, variance: 4, passRate: 89 },
      'Coating': { base: 520, variance: 80, passRate: 95 },
      'Ditch': { base: 620, variance: 100, passRate: 97 },
      'Lower-in': { base: 580, variance: 90, passRate: 98 },
      'Backfill': { base: 650, variance: 110, passRate: 96 },
      'Machine Cleanup': { base: 480, variance: 70, passRate: 94 },
      'Final Cleanup': { base: 420, variance: 60, passRate: 93 },
      'Hydrostatic Test': { base: 2500, variance: 500, passRate: 100 }
    }
    
    const config = baseValues[crewType] || { base: 500, variance: 100, passRate: 95 }
    
    return [
      'Nov-01', 'Nov-02', 'Nov-03', 'Nov-04', 'Nov-05', 'Nov-06', 'Nov-07'
    ].map((date, idx) => {
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
  const [showEVM, setShowEVM] = useState(false)
  
  // Photo search state
  const [photoSearchDate, setPhotoSearchDate] = useState('')
  const [photoSearchLocation, setPhotoSearchLocation] = useState('')
  const [photoSearchInspector, setPhotoSearchInspector] = useState('')

  // Get filtered photos based on search criteria
  function getFilteredPhotos() {
    const allPhotos = []
    
    reports.forEach(report => {
      // New structure: photos are inside activity_blocks
      if (report.activity_blocks && Array.isArray(report.activity_blocks)) {
        report.activity_blocks.forEach(block => {
          if (block.workPhotos && Array.isArray(block.workPhotos)) {
            block.workPhotos.forEach(photo => {
              // Handle both old format (just filename string) and new format (object with metadata)
              if (typeof photo === 'string') {
                allPhotos.push({
                  filename: photo,
                  originalName: photo,
                  date: report.date,
                  inspector: report.inspector_name,
                  spread: report.spread,
                  location: '',
                  description: '',
                  activityType: block.activityType
                })
              } else {
                allPhotos.push({
                  ...photo,
                  date: photo.date || report.date,
                  inspector: photo.inspector || report.inspector_name,
                  spread: photo.spread || report.spread,
                  activityType: block.activityType
                })
              }
            })
          }
        })
      }
      
      // Also check old structure for backward compatibility
      if (report.work_photos && Array.isArray(report.work_photos)) {
        report.work_photos.forEach(photo => {
          if (typeof photo === 'string') {
            allPhotos.push({
              filename: photo,
              originalName: photo,
              date: report.date,
              inspector: report.inspector_name,
              spread: report.spread,
              location: '',
              description: ''
            })
          } else {
            allPhotos.push({
              ...photo,
              date: photo.date || report.date,
              inspector: photo.inspector || report.inspector_name,
              spread: photo.spread || report.spread
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

  // Get all inspectors from photos for dropdown
  function getAllInspectors() {
    const inspectors = new Set()
    reports.forEach(report => {
      if (report.inspector_name) inspectors.add(report.inspector_name)
      if (report.activity_blocks) {
        report.activity_blocks.forEach(block => {
          if (block.workPhotos) {
            block.workPhotos.forEach(photo => {
              if (photo.inspector) inspectors.add(photo.inspector)
            })
          }
        })
      }
    })
    return [...inspectors]
  }

  // Count total photos across all reports
  function getTotalPhotoCount() {
    let count = 0
    reports.forEach(report => {
      if (report.activity_blocks) {
        report.activity_blocks.forEach(block => {
          count += block.workPhotos?.length || 0
        })
      }
      // Backward compatibility
      count += report.work_photos?.length || 0
    })
    return count
  }

  // Count reports with photos
  function getReportsWithPhotosCount() {
    return reports.filter(report => {
      if (report.activity_blocks) {
        return report.activity_blocks.some(block => block.workPhotos?.length > 0)
      }
      return report.work_photos?.length > 0
    }).length
  }

  useEffect(() => {
    loadReports()
  }, [dateRange])

  async function loadReports() {
    setLoading(true)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - dateRange)
    
    try {
      const { data, error } = await supabase
        .from('daily_tickets')
        .select('*')
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true })

      console.log('Dashboard loaded reports:', data?.length || 0, 'Error:', error)
      
      if (!error && data) {
        setReports(data)
      } else if (error) {
        console.error('Supabase error:', error)
        // Try loading without date filter as fallback
        const { data: allData, error: allError } = await supabase
          .from('daily_tickets')
          .select('*')
          .order('date', { ascending: false })
          .limit(50)
        
        if (!allError && allData) {
          setReports(allData)
          console.log('Loaded all reports as fallback:', allData.length)
        }
      }
    } catch (e) {
      console.error('Load error:', e)
    }
    setLoading(false)
  }

  // Calculate metrics from reports
  const metrics = useMemo(() => {
    if (reports.length === 0) return null

    // Daily data aggregation
    const dailyData = {}
    const phaseProgress = {}
    const phaseCosts = {}
    const crewPerformance = {}
    let totalLabourHours = 0
    let totalEquipmentHours = 0
    let totalTimeLost = 0

    reports.forEach(report => {
      const date = report.date // Using correct field name
      if (!date) return
      
      if (!dailyData[date]) {
        dailyData[date] = { date, totalCost: 0, phases: {}, labourHours: 0, equipmentHours: 0 }
      }

      // Process activity blocks (new structure)
      if (report.activity_blocks && Array.isArray(report.activity_blocks)) {
        report.activity_blocks.forEach(block => {
          const phase = block.activityType
          if (!phase) return

          // Calculate progress from KP values
          let progress = 0
          if (block.startKP && block.endKP) {
            const start = parseFloat(block.startKP.replace('+', '.')) || 0
            const end = parseFloat(block.endKP.replace('+', '.')) || 0
            progress = Math.abs(end - start) * 1000 // Convert to metres
          }

          // Daily phase progress
          if (!dailyData[date].phases[phase]) {
            dailyData[date].phases[phase] = 0
          }
          dailyData[date].phases[phase] += progress

          // Total phase progress
          if (!phaseProgress[phase]) {
            phaseProgress[phase] = 0
          }
          phaseProgress[phase] += progress

          // Phase costs (estimated from labour hours)
          if (!phaseCosts[phase]) {
            phaseCosts[phase] = 0
          }
          
          // Sum labour hours for this block
          let blockLabourHours = 0
          if (block.labourEntries && Array.isArray(block.labourEntries)) {
            block.labourEntries.forEach(entry => {
              const hours = (entry.hours || 0) * (entry.count || 1)
              blockLabourHours += hours
              totalLabourHours += hours
              dailyData[date].labourHours += hours

              // Track crew performance
              const key = entry.classification
              if (!crewPerformance[key]) {
                crewPerformance[key] = {
                  classification: entry.classification,
                  totalHours: 0,
                  daysWorked: 0,
                  dates: new Set()
                }
              }
              crewPerformance[key].totalHours += hours
              crewPerformance[key].dates.add(date)
              crewPerformance[key].daysWorked = crewPerformance[key].dates.size
            })
          }

          // Sum equipment hours for this block
          if (block.equipmentEntries && Array.isArray(block.equipmentEntries)) {
            block.equipmentEntries.forEach(entry => {
              const hours = (entry.hours || 0) * (entry.count || 1)
              totalEquipmentHours += hours
              dailyData[date].equipmentHours += hours
            })
          }

          // Estimate cost (labour hours * $75/hr average)
          const costPerMetre = plannedTargets[phase]?.costPerMetre || 30
          phaseCosts[phase] += progress > 0 ? progress * costPerMetre : blockLabourHours * 75

          // Track time lost
          if (block.timeLostHours) {
            totalTimeLost += parseFloat(block.timeLostHours) || 0
          }
        })
      }

      // Backward compatibility: check old structure
      if (report.activities && Array.isArray(report.activities)) {
        report.activities.forEach(activity => {
          const phase = activity.type
          const progress = activity.progress || 0

          if (!dailyData[date].phases[phase]) {
            dailyData[date].phases[phase] = 0
          }
          dailyData[date].phases[phase] += progress

          if (!phaseProgress[phase]) {
            phaseProgress[phase] = 0
          }
          phaseProgress[phase] += progress

          if (!phaseCosts[phase]) {
            phaseCosts[phase] = 0
          }
          const costPerMetre = plannedTargets[phase]?.costPerMetre || 30
          phaseCosts[phase] += progress * costPerMetre
        })
      }
    })

    // Convert to arrays for charts
    const dailyArray = Object.values(dailyData).map(d => ({
      date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: d.date,
      labourHours: d.labourHours,
      equipmentHours: d.equipmentHours,
      ...d.phases
    }))

    // Total costs (estimated from labour)
    const totalCost = totalLabourHours * 75 + totalEquipmentHours * 150
    const avgDailyCost = totalCost / Math.max(Object.keys(dailyData).length, 1)
    const projectedCost = avgDailyCost * 30

    // Phase completion percentages
    const phaseCompletion = Object.keys(phaseProgress).map(phase => ({
      phase,
      actual: phaseProgress[phase],
      planned: plannedTargets[phase]?.metres || 50000,
      actualPercent: ((phaseProgress[phase] / (plannedTargets[phase]?.metres || 50000)) * 100).toFixed(1),
      plannedPercent: 100,
      cost: phaseCosts[phase] || 0
    }))

    return {
      dailyArray,
      totalCost,
      avgDailyCost,
      projectedCost,
      phaseProgress,
      phaseCosts,
      phaseCompletion,
      crewPerformance: Object.values(crewPerformance),
      totalLabourHours,
      totalEquipmentHours,
      totalTimeLost,
      reportCount: reports.length
    }
  }, [reports])

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Loading Dashboard...</h2>
      </div>
    )
  }

  const formatCurrency = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`
    return `$${value.toFixed(0)}`
  }

  // If showing EVM dashboard, render it
  if (showEVM) {
    return <EVMDashboard onBack={() => setShowEVM(false)} />
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={onBackToReport}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#007bff', 
            cursor: 'pointer', 
            fontSize: '14px',
            marginBottom: '10px'
          }}
        >
          ← Back to Daily Report
        </button>
        <h1 style={{ margin: '0 0 5px 0', fontSize: '24px' }}>Executive Dashboard - Pipeline Inspector</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
            Pipeline Project - {dateRange === 365 ? 'All Time' : `Last ${dateRange} Days`} Performance
            <select 
              value={dateRange} 
              onChange={(e) => setDateRange(parseInt(e.target.value))}
              style={{ marginLeft: '15px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
              <option value={365}>All Time</option>
            </select>
          </p>
          <button
            onClick={() => setShowEVM(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            📊 EVM Dashboard
          </button>
        </div>
      </div>

      {/* REPORT SUMMARY */}
      <div style={{ backgroundColor: '#17a2b8', color: 'white', padding: '8px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        REPORT SUMMARY
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '15px' }}>
          <div style={{ padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#007bff' }}>{metrics?.reportCount || 0}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Reports Loaded</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#d4edda', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>{Object.keys(metrics?.phaseProgress || {}).length}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Active Phases</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#856404' }}>{(metrics?.totalLabourHours || 0).toLocaleString()}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Labour Hours</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#cce5ff', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#004085' }}>{(metrics?.totalEquipmentHours || 0).toLocaleString()}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Equipment Hours</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f8d7da', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#721c24' }}>{metrics?.totalTimeLost || 0}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Hours Lost</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#e2d5f1', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#6f42c1' }}>{getTotalPhotoCount()}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>Work Photos</div>
          </div>
        </div>

        {/* Activity breakdown */}
        {Object.keys(metrics?.phaseProgress || {}).length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Activity Breakdown</h4>
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
                    {metres > 0 ? `${metres.toLocaleString()}m` : 'Active'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 1: COST METRICS */}
      <div style={{ backgroundColor: '#DC143C', color: 'white', padding: '8px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        SECTION 1: COST METRICS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '25px' }}>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Total Project Cost (YTD)</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#333' }}>{formatCurrency(metrics?.totalCost || 0)}</div>
            <div style={{ fontSize: '11px', color: '#999' }}>All phases combined</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Cost Variance</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>+6.0%</div>
            <div style={{ fontSize: '11px', color: '#999' }}>vs Planned Budget</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Avg Daily Cost</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#333' }}>{formatCurrency(metrics?.avgDailyCost || 0)}</div>
            <div style={{ fontSize: '11px', color: '#999' }}>Per day average</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Projected 30-Day Cost</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc3545' }}>{formatCurrency(metrics?.projectedCost || 0)}</div>
            <div style={{ fontSize: '11px', color: '#999' }}>Burn rate projection</div>
          </div>
        </div>

        {/* Daily Cost by Phase Chart */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>Daily Cost by Phase</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={metrics?.dailyArray || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, '']} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Welding - Mainline" stackId="a" fill="#DC143C" name="Welding" />
              <Bar dataKey="Coating" stackId="a" fill="#FF8C00" name="Coating" />
              <Bar dataKey="Ditch" stackId="a" fill="#32CD32" name="Ditch" />
              <Bar dataKey="Lower-in" stackId="a" fill="#1E90FF" name="Lower-in" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cost Per Phase - Actual vs Planned */}
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>Cost Per Phase - Actual vs Planned</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart 
              data={metrics?.phaseCompletion?.slice(0, 4) || []} 
              layout="vertical"
              margin={{ left: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="phase" type="category" tick={{ fontSize: 12 }} width={70} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="cost" fill="#1E90FF" name="Actual" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION 2: PROGRESS METRICS */}
      <div style={{ backgroundColor: '#32CD32', color: 'white', padding: '8px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        SECTION 2: PROGRESS METRICS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
        {/* Daily Linear Metres by Phase */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>Daily Linear Metres by Phase</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={metrics?.dailyArray || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="Welding - Mainline" stroke="#DC143C" name="Welding" strokeWidth={2} />
              <Line type="monotone" dataKey="Coating" stroke="#FF8C00" name="Coating" strokeWidth={2} />
              <Line type="monotone" dataKey="Ditch" stroke="#32CD32" name="Ditch" strokeWidth={2} />
              <Line type="monotone" dataKey="Lower-in" stroke="#1E90FF" name="Lower-in" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Phase Completion Summary */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>Phase Completion Summary - Actual vs Planned %</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart 
              data={metrics?.phaseCompletion?.slice(0, 4) || []} 
              layout="vertical"
              margin={{ left: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
              <YAxis dataKey="phase" type="category" tick={{ fontSize: 12 }} width={70} />
              <Tooltip formatter={(value) => [`${value}%`, '']} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="actualPercent" name="Actual %" radius={[0, 4, 4, 0]}>
                {(metrics?.phaseCompletion || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={phaseColors[entry.phase] || '#8884d8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Progress KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
          {(metrics?.phaseCompletion?.slice(0, 4) || []).map((phase, idx) => (
            <div key={idx} style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>{phase.phase} Progress</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: phaseColors[phase.phase] || '#333' }}>
                {phase.actual.toLocaleString()}m
              </div>
              <div style={{ fontSize: '11px', color: '#999' }}>Total linear metres</div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: PRODUCTIVITY METRICS */}
      <div style={{ backgroundColor: '#FF8C00', color: 'white', padding: '8px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        SECTION 3: PRODUCTIVITY METRICS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
        <div style={{ marginBottom: '15px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>Crew/Equipment Productivity Comparison - All Phases</h3>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
            Identify high and low performers across welding crews, coating crews, and earthwork equipment
          </p>
        </div>

        {/* Productivity Charts Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '25px' }}>
          {['Welding - Mainline', 'Coating', 'Ditch', 'Lower-in'].map((phase, idx) => {
            const colors = ['#DC143C', '#FF8C00', '#32CD32', '#1E90FF']
            return (
              <div key={phase} style={{ backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: colors[idx], marginBottom: '10px' }}>
                  {phase === 'Welding - Mainline' ? 'ML Welding Crew (Welds per Day)' :
                   phase === 'Coating' ? 'ML Coating Crew (Metres per Day)' :
                   phase === 'Ditch' ? 'Ditch Equipment (Excavators - Metres per Day)' :
                   'Lower-in Equipment (Sidebooms - Metres per Day)'}
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={[
                    { name: 'Crew 1', value: 180 + idx * 25 },
                    { name: 'Crew 2', value: 145 + idx * 20 }
                  ]}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill={colors[idx]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })}
        </div>

        {/* Productivity Summary Table */}
        <div style={{ marginBottom: '25px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '10px' }}>Productivity Summary</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Category</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Top Performer</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Action Items</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>ML Welding</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Crew 1</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6', color: '#666' }}>Review training needs</td>
              </tr>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>ML Coating</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Crew 1</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6', color: '#666' }}>Monitor quality consistency</td>
              </tr>
              <tr>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Ditch</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Excavator 1</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6', color: '#666' }}>Check maintenance logs</td>
              </tr>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Lower-in</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Sideboom 1</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6', color: '#666' }}>Review operator skills</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Productivity Rate KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Ditch Productivity</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#32CD32' }}>44.9m/hr</div>
            <div style={{ fontSize: '11px', color: '#999' }}>6200m in 138hrs</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Lower-in Productivity</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1E90FF' }}>45.3m/hr</div>
            <div style={{ fontSize: '11px', color: '#999' }}>6435m in 142hrs</div>
          </div>
        </div>
      </div>

      {/* SECTION 4: QUALITY METRICS */}
      <div style={{ backgroundColor: '#9370DB', color: 'white', padding: '8px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        SECTION 4: QUALITY METRICS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
        {/* Quality KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '25px' }}>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Weld First Pass Rate</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>91.8%</div>
            <div style={{ fontSize: '11px', color: '#999' }}>423 of 461 welds</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Coating Holiday Rate</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc3545' }}>5.17%</div>
            <div style={{ fontSize: '11px', color: '#999' }}>23 holidays in 445 welds</div>
          </div>
          <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>Coating Quality Rate</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>94.8%</div>
            <div style={{ fontSize: '11px', color: '#999' }}>422 of 445 welds defect-free</div>
          </div>
        </div>

        {/* Crew Performance Detail Viewer */}
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Crew Performance Detail Viewer - Drill-Down by Crew Type</h4>
          <p style={{ fontSize: '11px', color: '#666', marginBottom: '15px' }}>
            Click any crew button to view detailed daily performance metrics. Focus on quality and efficiency - not linear metres (shown in Section 2)
          </p>
          
          {/* Crew Type Tabs - in pipeline construction order */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', flexWrap: 'wrap' }}>
            {[
              'Clearing', 'Stripping', 'Grading', 'Stringing', 'Bending', 
              'Welding', 'Tie-in Welding', 'Coating', 'Ditch', 'Lower-in', 
              'Backfill', 'Machine Cleanup', 'Final Cleanup', 'Hydrostatic Test'
            ].map(crew => (
              <button
                key={crew}
                onClick={() => setSelectedCrewType(crew)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  backgroundColor: selectedCrewType === crew ? '#DC143C' : '#e9ecef',
                  color: selectedCrewType === crew ? 'white' : '#333'
                }}
              >
                {crew}
              </button>
            ))}
          </div>

          {/* Quality Detail Table - Dynamic based on selected crew */}
          <div style={{ backgroundColor: '#fff5f5', padding: '15px', borderRadius: '8px', border: '1px solid #ffcccc' }}>
            <h5 style={{ fontSize: '13px', fontWeight: 'bold', color: '#DC143C', marginBottom: '15px' }}>
              {selectedCrewType} Crew - Quality Detail
            </h5>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Date</th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>
                    {['Welding', 'Tie-in Welding'].includes(selectedCrewType) ? 'Welds' : 'Metres'}
                  </th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '2px solid #dee2e6', color: '#28a745' }}>
                    {['Welding', 'Tie-in Welding'].includes(selectedCrewType) ? 'First Pass' : 'Completed'}
                  </th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '2px solid #dee2e6', color: '#dc3545' }}>
                    {['Welding', 'Tie-in Welding'].includes(selectedCrewType) ? 'Repairs' : 'Rework'}
                  </th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>
                    {['Welding', 'Tie-in Welding'].includes(selectedCrewType) ? 'First Pass %' : 'Quality %'}
                  </th>
                  <th style={{ padding: '8px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>
                    {['Welding', 'Tie-in Welding'].includes(selectedCrewType) ? 'Repair Rate %' : 'Rework Rate %'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {getCrewData(selectedCrewType).map((row, idx) => (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #dee2e6' }}>{row.date}</td>
                    <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{row.count}</td>
                    <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6', color: '#28a745' }}>{row.passed}</td>
                    <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6', color: '#dc3545' }}>{row.failed}</td>
                    <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>{row.passRate}%</td>
                    <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #dee2e6', color: '#dc3545' }}>{row.failRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 5: GAP ANALYSIS */}
      <div style={{ backgroundColor: '#4169E1', color: 'white', padding: '8px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        SECTION 5: CHAINAGE GAP ANALYSIS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
          Visual representation of completed chainage per phase. Red sections indicate gaps requiring attention.
        </p>
        
        {/* Progress Bars per Phase - stable placeholder values */}
        {[
          { phase: 'Clearing', completion: 72 },
          { phase: 'Stripping', completion: 65 },
          { phase: 'Grading', completion: 58 },
          { phase: 'Ditch', completion: 45 },
          { phase: 'Lower-in', completion: 38 },
          { phase: 'Backfill', completion: 32 }
        ].map(({ phase, completion }, idx) => {
          return (
            <div key={phase} style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{phase}</span>
                <span style={{ fontSize: '12px', color: '#666' }}>{completion}% complete</span>
              </div>
              <div style={{ height: '24px', backgroundColor: '#e9ecef', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${completion}%`, 
                    backgroundColor: phaseColors[phase] || '#007bff',
                    borderRadius: '4px 0 0 4px'
                  }} 
                />
                {/* Gap indicators */}
                {idx > 0 && idx < 4 && (
                  <div 
                    style={{ 
                      position: 'absolute',
                      left: `${completion - 10}%`,
                      top: 0,
                      width: '3%',
                      height: '100%',
                      backgroundColor: '#dc3545'
                    }} 
                  />
                )}
              </div>
            </div>
          )
        })}

        {/* Gap Table */}
        <div style={{ marginTop: '25px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '10px' }}>Identified Gaps Requiring Action</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#fff3cd' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Phase</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Gap Location</th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Gap Length</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Grading</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>12+450 to 12+800</td>
                <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>350m</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>
                  <span style={{ padding: '2px 8px', backgroundColor: '#fff3cd', borderRadius: '4px', fontSize: '11px' }}>Pending</span>
                </td>
              </tr>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Ditch</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>8+200 to 8+650</td>
                <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>450m</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>
                  <span style={{ padding: '2px 8px', backgroundColor: '#dc3545', color: 'white', borderRadius: '4px', fontSize: '11px' }}>Critical</span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>Lower-in</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>5+000 to 5+200</td>
                <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>200m</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #dee2e6' }}>
                  <span style={{ padding: '2px 8px', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', fontSize: '11px' }}>Scheduled</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 6: PHOTO BROWSER */}
      <div style={{ backgroundColor: '#6f42c1', color: 'white', padding: '8px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        SECTION 6: PHOTO BROWSER
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
          Search and view work photos by date or location. Click on a photo to view full size.
        </p>
        
        {/* Search Filters */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Search by Date</label>
            <input 
              type="date"
              value={photoSearchDate}
              onChange={(e) => setPhotoSearchDate(e.target.value)}
              style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Search by Location (KP)</label>
            <input 
              type="text"
              value={photoSearchLocation}
              onChange={(e) => setPhotoSearchLocation(e.target.value)}
              placeholder="e.g. 5+250"
              style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', width: '120px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Inspector</label>
            <select 
              value={photoSearchInspector}
              onChange={(e) => setPhotoSearchInspector(e.target.value)}
              style={{ padding: '8px', border: '1px solid #ced4da', borderRadius: '4px' }}
            >
              <option value="">All Inspectors</option>
              {getAllInspectors().map(insp => (
                <option key={insp} value={insp}>{insp}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { setPhotoSearchDate(''); setPhotoSearchLocation(''); setPhotoSearchInspector(''); }}
            style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Clear Filters
          </button>
        </div>

        {/* Photo Results */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
          {getFilteredPhotos().length > 0 ? (
            getFilteredPhotos().map((photo, idx) => (
              <div key={idx} style={{ border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f8f9fa' }}>
                {/* Image Thumbnail */}
                <div 
                  style={{ 
                    height: '160px', 
                    backgroundColor: '#e9ecef', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    overflow: 'hidden',
                    cursor: 'pointer'
                  }}
                  onClick={() => window.open(`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${photo.filename}`, '_blank')}
                >
                  <img 
                    src={`https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/work-photos/${photo.filename}`}
                    alt={photo.description || photo.originalName}
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '160px', 
                      objectFit: 'cover',
                      width: '100%',
                      height: '160px'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                      e.target.parentElement.innerHTML = '<div style="color: #999; font-size: 12px; text-align: center;">Image not found<br/>Check work-photos bucket</div>'
                    }}
                  />
                </div>
                {/* Photo Details */}
                <div style={{ padding: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#6f42c1', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {photo.originalName || photo.filename}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666' }}>
                    <div><strong>Date:</strong> {photo.date}</div>
                    <div><strong>Location:</strong> {photo.location || 'Not specified'}</div>
                    <div><strong>Inspector:</strong> {photo.inspector}</div>
                    {photo.description && <div style={{ marginTop: '4px' }}><strong>Notes:</strong> {photo.description}</div>}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '30px', color: '#666' }}>
              {reports.length === 0 ? 'No reports loaded. Adjust date range above.' : 'No photos match your search criteria.'}
            </div>
          )}
        </div>

        {/* Photo Stats */}
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e9ecef', borderRadius: '8px', display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '12px', color: '#666' }}>Total Photos:</span>
            <span style={{ fontSize: '16px', fontWeight: 'bold', marginLeft: '8px' }}>
              {getTotalPhotoCount()}
            </span>
          </div>
          <div>
            <span style={{ fontSize: '12px', color: '#666' }}>Reports with Photos:</span>
            <span style={{ fontSize: '16px', fontWeight: 'bold', marginLeft: '8px' }}>
              {getReportsWithPhotosCount()}
            </span>
          </div>
          <div>
            <span style={{ fontSize: '12px', color: '#666' }}>Filtered Results:</span>
            <span style={{ fontSize: '16px', fontWeight: 'bold', marginLeft: '8px' }}>
              {getFilteredPhotos().length}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 7: RECENT REPORTS */}
      <div style={{ backgroundColor: '#28a745', color: 'white', padding: '8px 15px', borderRadius: '4px 4px 0 0', fontWeight: 'bold' }}>
        SECTION 7: RECENT REPORTS
      </div>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '0 0 4px 4px', marginBottom: '20px', border: '1px solid #ddd' }}>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
          Most recent inspection reports with activity details.
        </p>
        
        {reports.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {reports.slice(-10).reverse().map((report, idx) => (
              <div key={idx} style={{ border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden' }}>
                {/* Report Header */}
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
                
                {/* Activities */}
                {report.activity_blocks && report.activity_blocks.length > 0 && (
                  <div style={{ padding: '15px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {report.activity_blocks.map((block, blockIdx) => (
                        <div 
                          key={blockIdx}
                          style={{ 
                            padding: '10px 15px', 
                            backgroundColor: phaseColors[block.activityType] || '#6c757d',
                            color: 'white',
                            borderRadius: '8px',
                            fontSize: '13px',
                            minWidth: '200px'
                          }}
                        >
                          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{block.activityType || 'No Type'}</div>
                          <div style={{ fontSize: '11px', opacity: 0.9 }}>
                            {block.contractor && <div>Contractor: {block.contractor}</div>}
                            {block.startKP && block.endKP && <div>KP: {block.startKP} → {block.endKP}</div>}
                            {block.labourEntries?.length > 0 && <div>Labour: {block.labourEntries.reduce((sum, e) => sum + (e.count || 1), 0)} workers</div>}
                            {block.equipmentEntries?.length > 0 && <div>Equipment: {block.equipmentEntries.length} types</div>}
                            {block.timeLostHours && parseFloat(block.timeLostHours) > 0 && (
                              <div style={{ color: '#ffcccc' }}>⏱️ {block.timeLostHours}h lost - {block.timeLostReason}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* General notes if present */}
                    {report.general_comments && (
                      <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '12px', color: '#666' }}>
                        <strong>Comments:</strong> {report.general_comments}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Empty state for reports without activity_blocks */}
                {(!report.activity_blocks || report.activity_blocks.length === 0) && (
                  <div style={{ padding: '15px', color: '#999', fontStyle: 'italic', fontSize: '13px' }}>
                    No activity blocks recorded (legacy format or empty report)
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px', color: '#666' }}>
            No reports loaded. Adjust date range above.
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
