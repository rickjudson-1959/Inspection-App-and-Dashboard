// chiefConstructionHelpers.js
// Data aggregation for Legacy EGP Daily Construction Summary Report format
// Matches the exact format from Legacy Chief Reports/01-12-2026 Construction Summary Report KF.pdf

import { supabase } from './supabase'

const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

// =============================================
// PERSONNEL AGGREGATION (Legacy Grid Format)
// =============================================

/**
 * Aggregate personnel into EGP legacy grid format
 * Returns: primeResources, subcontractors, feiEmployee, totalSiteExposure, breakdown
 */
export function aggregatePersonnelForLegacy(reports) {
  const personnel = {
    primeResources: 0,
    primeSubcontractors: 0,
    feiEmployee: 0,
    feiSubcontractors: 0,
    totalSiteExposure: 0,
    breakdown: {
      deccaInspector: 0,
      envInspector: 0,
      envQP: 0,
      feiCompliance: 0,
      meridianSurvey: 0,
      feiOps: 0,
      ndt: 0,
      engineering: 0,
      other: 0
    }
  }

  reports.forEach(report => {
    const activities = report.activity_blocks || []

    activities.forEach(activity => {
      const labour = activity.labourEntries || activity.labour || []
      const contractor = (activity.contractor || '').toLowerCase()

      labour.forEach(worker => {
        const count = parseInt(worker.count) || 1
        const classification = (worker.classification || worker.role || '').toLowerCase()
        const hours = (parseFloat(worker.rt) || 0) + (parseFloat(worker.ot) || 0) + (parseFloat(worker.hours) || 0)

        // Total site exposure (headcount)
        personnel.totalSiteExposure += count

        // Categorize by contractor type
        if (contractor.includes('smjv') || contractor.includes('prime')) {
          personnel.primeResources += count
        } else if (contractor.includes('fei') || contractor.includes('fortis')) {
          personnel.feiEmployee += count
        } else {
          personnel.primeSubcontractors += count
        }

        // Categorize into EGP breakdown buckets
        if (classification.includes('decca') || (classification.includes('inspector') && !classification.includes('env'))) {
          personnel.breakdown.deccaInspector += count
        } else if (classification.includes('env') && classification.includes('inspector')) {
          personnel.breakdown.envInspector += count
        } else if (classification.includes('env') && (classification.includes('qp') || classification.includes('qualified'))) {
          personnel.breakdown.envQP += count
        } else if (classification.includes('compliance')) {
          personnel.breakdown.feiCompliance += count
        } else if (classification.includes('survey') || classification.includes('meridian')) {
          personnel.breakdown.meridianSurvey += count
        } else if (classification.includes('ops') || classification.includes('operations')) {
          personnel.breakdown.feiOps += count
        } else if (classification.includes('ndt') || classification.includes('xray') || classification.includes('radiograph')) {
          personnel.breakdown.ndt += count
        } else if (classification.includes('engineer')) {
          personnel.breakdown.engineering += count
        } else {
          personnel.breakdown.other += count
        }
      })
    })
  })

  return personnel
}

// =============================================
// PROGRESS AGGREGATION (Legacy Tables)
// =============================================

/**
 * Section definitions matching legacy report
 */
const SECTION_DEFINITIONS = [
  { name: 'Hixon FSR', startDate: '2025-09-20', kpStart: '', kpEnd: '4+825' },
  { name: 'KP 5.0 - 6.3 Conventional', startDate: '2025-07-26', kpStart: '5+000', kpEnd: '6+340' },
  { name: 'Indian River Steep Slope', startDate: '2025-09-01', kpStart: '6+340', kpEnd: '7+050' },
  { name: 'KP 10.0 - 10.5 Conventional', startDate: '2025-11-18', kpStart: '10+000', kpEnd: '10+525' },
  { name: 'KP 10.5 - 11.9 In Road', startDate: '2026-06-13', kpStart: '10+525', kpEnd: '11+900' },
  { name: 'KP 12.3 - 14.9 Conventional', startDate: '2025-09-20', kpStart: '12+300', kpEnd: '14+930' },
  { name: 'KP 14.9 - 16.2 In Road', startDate: '2026-03-01', kpStart: '14+930', kpEnd: '16+280' },
  { name: 'KP 16.2 - 19.1 Conventional', startDate: '2025-09-20', kpStart: '16+280', kpEnd: '19+100' },
  { name: 'KP 19.1 - 21.2 In Road', startDate: '2026-09-05', kpStart: '19+100', kpEnd: '21+250' },
  { name: 'Double Gully South', startDate: '2025-09-20', kpStart: '21+825', kpEnd: '22+800' },
  { name: 'Double Gully', startDate: '2025-09-20', kpStart: '22+800', kpEnd: '22+950' },
  { name: 'Double Gully North', startDate: '2025-09-20', kpStart: '22+950', kpEnd: '24+461' },
  { name: 'KP 24.4 - 29.7 In Road', startDate: '2025-09-20', kpStart: '24+461', kpEnd: '29+780' },
  { name: 'Road 10 to Ray Creek', startDate: '2025-08-10', kpStart: '29+780', kpEnd: '30+800' },
  { name: 'Ray Basin to Ray Creek', startDate: '2026-03-05', kpStart: '30+950', kpEnd: '31+700' },
  { name: 'Ray Basin to Road 8', startDate: '2025-11-17', kpStart: '31+700', kpEnd: '32+800' },
  { name: 'Mt Mulligan Steep Slope', startDate: '2025-08-25', kpStart: '32+800', kpEnd: '33+200' },
  { name: 'Mt Mulligan to Valley Cliffe', startDate: '2025-08-25', kpStart: '33+200', kpEnd: '33+640' },
  { name: 'Valley Cliffe', startDate: '2025-10-25', kpStart: '33+640', kpEnd: '36+450' }
]

/**
 * Parse KP string to numeric value for comparison
 */
function parseKP(kpStr) {
  if (!kpStr) return null
  const cleaned = String(kpStr).replace('+', '').replace('KP', '').replace('km', '').trim()
  return parseFloat(cleaned) || null
}

/**
 * Determine which section a KP falls into
 */
function getSectionForKP(kpValue) {
  if (kpValue === null) return null

  for (const section of SECTION_DEFINITIONS) {
    const start = parseKP(section.kpStart) || 0
    const end = parseKP(section.kpEnd)
    if (end && kpValue >= start && kpValue <= end) {
      return section.name
    }
  }
  return null
}

/**
 * Aggregate progress for legacy Planned vs Actual table
 */
export async function aggregateProgressForLegacy(reports, reportDate) {
  // Get week boundaries (Monday to Sunday containing reportDate)
  const date = new Date(reportDate + 'T00:00:00')
  const dayOfWeek = date.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(date)
  weekStart.setDate(date.getDate() + mondayOffset)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  // Fetch weekly reports
  let weeklyReports = []
  try {
    const { data } = await supabase
      .from('daily_tickets')
      .select('id, date, activity_blocks')
      .gte('date', weekStartStr)
      .lte('date', weekEndStr)
    weeklyReports = data || []
  } catch (err) {
    console.error('Error fetching weekly reports:', err)
  }

  // Aggregate daily and weekly progress by section
  const progressBySection = {}

  // Initialize sections
  SECTION_DEFINITIONS.forEach(section => {
    progressBySection[section.name] = {
      section: section.name,
      startDate: section.startDate,
      kpStart: section.kpStart,
      kpEnd: section.kpEnd,
      civil: { dailyPlanned: 0, dailyActual: 0, weeklyPlanned: 0, weeklyActual: 0 },
      mechanical: { dailyPlanned: 0, dailyActual: 0, weeklyPlanned: 0, weeklyActual: 0 }
    }
  })

  // Process daily reports (today only)
  reports.forEach(report => {
    const blocks = report.activity_blocks || []
    blocks.forEach(block => {
      const activityType = block.activityType || ''
      const metres = parseFloat(block.metres) || 0
      const startKP = parseKP(block.startKP)

      const sectionName = getSectionForKP(startKP)
      if (!sectionName || !progressBySection[sectionName]) return

      const isMechanical = ['Welding', 'Stringing', 'Bending', 'Lowering', 'Coating', 'Tie-In', 'Backfill']
        .some(t => activityType.toLowerCase().includes(t.toLowerCase()))

      const category = isMechanical ? 'mechanical' : 'civil'
      progressBySection[sectionName][category].dailyActual += metres
    })
  })

  // Process weekly reports
  weeklyReports.forEach(report => {
    const blocks = report.activity_blocks || []
    blocks.forEach(block => {
      const activityType = block.activityType || ''
      const metres = parseFloat(block.metres) || 0
      const startKP = parseKP(block.startKP)

      const sectionName = getSectionForKP(startKP)
      if (!sectionName || !progressBySection[sectionName]) return

      const isMechanical = ['Welding', 'Stringing', 'Bending', 'Lowering', 'Coating', 'Tie-In', 'Backfill']
        .some(t => activityType.toLowerCase().includes(t.toLowerCase()))

      const category = isMechanical ? 'mechanical' : 'civil'
      progressBySection[sectionName][category].weeklyActual += metres
    })
  })

  // Build planned vs actual arrays
  const plannedVsActual = []

  // Add Civil rows
  SECTION_DEFINITIONS.forEach(section => {
    const data = progressBySection[section.name]
    plannedVsActual.push({
      section: section.name,
      startDate: section.startDate,
      kpStart: section.kpStart,
      kpEnd: section.kpEnd,
      activity: 'Civil',
      dailyPlanned: data.civil.dailyPlanned,
      dailyActual: data.civil.dailyActual,
      dailyDelta: data.civil.dailyActual - data.civil.dailyPlanned,
      weeklyPlanned: data.civil.weeklyPlanned,
      weeklyActual: data.civil.weeklyActual,
      weeklyDelta: data.civil.weeklyActual - data.civil.weeklyPlanned
    })
  })

  // Add Civil Total
  const civilTotals = Object.values(progressBySection).reduce((acc, s) => ({
    dailyPlanned: acc.dailyPlanned + s.civil.dailyPlanned,
    dailyActual: acc.dailyActual + s.civil.dailyActual,
    weeklyPlanned: acc.weeklyPlanned + s.civil.weeklyPlanned,
    weeklyActual: acc.weeklyActual + s.civil.weeklyActual
  }), { dailyPlanned: 0, dailyActual: 0, weeklyPlanned: 0, weeklyActual: 0 })

  plannedVsActual.push({
    section: 'Total Civil',
    startDate: '2025-07-26',
    kpStart: '',
    kpEnd: '',
    activity: 'Civil',
    dailyPlanned: civilTotals.dailyPlanned,
    dailyActual: civilTotals.dailyActual,
    dailyDelta: civilTotals.dailyActual - civilTotals.dailyPlanned,
    weeklyPlanned: civilTotals.weeklyPlanned,
    weeklyActual: civilTotals.weeklyActual,
    weeklyDelta: civilTotals.weeklyActual - civilTotals.weeklyPlanned,
    isTotal: true
  })

  // Add Mechanical rows
  SECTION_DEFINITIONS.forEach(section => {
    const data = progressBySection[section.name]
    plannedVsActual.push({
      section: section.name,
      startDate: section.startDate,
      kpStart: section.kpStart,
      kpEnd: section.kpEnd,
      activity: 'Mechanical',
      dailyPlanned: data.mechanical.dailyPlanned,
      dailyActual: data.mechanical.dailyActual,
      dailyDelta: data.mechanical.dailyActual - data.mechanical.dailyPlanned,
      weeklyPlanned: data.mechanical.weeklyPlanned,
      weeklyActual: data.mechanical.weeklyActual,
      weeklyDelta: data.mechanical.weeklyActual - data.mechanical.weeklyPlanned
    })
  })

  // Add Mechanical Total
  const mechTotals = Object.values(progressBySection).reduce((acc, s) => ({
    dailyPlanned: acc.dailyPlanned + s.mechanical.dailyPlanned,
    dailyActual: acc.dailyActual + s.mechanical.dailyActual,
    weeklyPlanned: acc.weeklyPlanned + s.mechanical.weeklyPlanned,
    weeklyActual: acc.weeklyActual + s.mechanical.weeklyActual
  }), { dailyPlanned: 0, dailyActual: 0, weeklyPlanned: 0, weeklyActual: 0 })

  plannedVsActual.push({
    section: 'Total Mechanical',
    startDate: '2025-07-15',
    kpStart: '',
    kpEnd: '',
    activity: 'Mechanical',
    dailyPlanned: mechTotals.dailyPlanned,
    dailyActual: mechTotals.dailyActual,
    dailyDelta: mechTotals.dailyActual - mechTotals.dailyPlanned,
    weeklyPlanned: mechTotals.weeklyPlanned,
    weeklyActual: mechTotals.weeklyActual,
    weeklyDelta: mechTotals.weeklyActual - mechTotals.weeklyPlanned,
    isTotal: true
  })

  // Build Progress to Date table
  const progressToDate = await buildProgressToDate(reportDate)

  // Build Target Completion table
  const targetCompletion = buildTargetCompletion()

  return {
    plannedVsActual,
    targetCompletion,
    progressToDate,
    weekRange: { start: weekStartStr, end: weekEndStr }
  }
}

/**
 * Build Progress to Date table (Clearing, Grading, etc.)
 */
async function buildProgressToDate(reportDate) {
  // Default planned totals from legacy report
  const activityTotals = {
    'Clearing': { unit: 'ha', totalPlanned: 162 },
    'Grubbing': { unit: 'ha', totalPlanned: 162 },
    'Grading / ROW Prep': { unit: 'lm', totalPlanned: 35355 },
    'Stringing': { unit: 'lm', totalPlanned: 35355 },
    'Bending': { unit: 'lm', totalPlanned: 35355 },
    'Welding': { unit: 'lm', totalPlanned: 35355 },
    'Coating': { unit: 'lm', totalPlanned: 35355 },
    'Trenching': { unit: 'lm', totalPlanned: 35355 },
    'Lowering-In': { unit: 'lm', totalPlanned: 35355 },
    'Crossings': { unit: 'ea.', totalPlanned: 120 },
    'Tie-ins': { unit: 'lm', totalPlanned: 35355 },
    'Backfill & Compaction': { unit: 'lm', totalPlanned: 35355 },
    'Machine & Final Cleanup': { unit: 'lm', totalPlanned: 17761 },
    'Squamish Urban Works': { unit: 'lm', totalPlanned: 1970 }
  }

  // Fetch cumulative progress from all reports up to date
  let cumulativeData = {}
  try {
    const { data: allReports } = await supabase
      .from('daily_tickets')
      .select('activity_blocks')
      .lte('date', reportDate)

    ;(allReports || []).forEach(report => {
      const blocks = report.activity_blocks || []
      blocks.forEach(block => {
        const actType = block.activityType || ''
        const metres = parseFloat(block.metres) || 0
        const hectares = parseFloat(block.hectares) || parseFloat(block.area) || 0
        const count = parseInt(block.count) || 0

        // Match to our activity categories
        Object.keys(activityTotals).forEach(key => {
          if (actType.toLowerCase().includes(key.toLowerCase().replace(' / ', '').replace('&', ''))) {
            if (!cumulativeData[key]) cumulativeData[key] = 0
            if (activityTotals[key].unit === 'ha') {
              cumulativeData[key] += hectares
            } else if (activityTotals[key].unit === 'ea.') {
              cumulativeData[key] += count || 1
            } else {
              cumulativeData[key] += metres
            }
          }
        })
      })
    })
  } catch (err) {
    console.error('Error fetching cumulative progress:', err)
  }

  // Build progress to date array
  return Object.entries(activityTotals).map(([description, config]) => {
    const completed = cumulativeData[description] || 0
    const remaining = config.totalPlanned - completed
    const percentComplete = config.totalPlanned > 0
      ? Math.round((completed / config.totalPlanned) * 100)
      : 0

    return {
      description,
      unit: config.unit,
      totalPlanned: config.totalPlanned,
      completedToDate: Math.round(completed),
      remaining: Math.max(0, Math.round(remaining)),
      percentComplete,
      percentRemaining: 100 - percentComplete
    }
  })
}

/**
 * Build Target Completion table (Q1 targets)
 */
function buildTargetCompletion() {
  // Target completion sections from legacy report
  return [
    { section: 'Hixon FSR', startDate: '2025-09-20', targetKPStart: '', targetKPEnd: '4+825', activity: 'Mechanical', q1Target: 466, cumulative: 0, percentComplete: 0, weeklyActual: 0 },
    { section: 'KP 10.0 - 10.5 Conventional', startDate: '2025-11-01', targetKPStart: '10+000', targetKPEnd: '10+525', activity: 'Mechanical', q1Target: 253, cumulative: 0, percentComplete: 0, weeklyActual: 0 },
    { section: 'KP 24.4 - 29.7 In Road', startDate: '2025-09-20', targetKPStart: '24+461', targetKPEnd: '29+780', activity: 'Mechanical', q1Target: 390, cumulative: 0, percentComplete: 0, weeklyActual: 0 },
    { section: 'Ray Basin to Road 8', startDate: '2025-09-25', targetKPStart: '31+700', targetKPEnd: '32+800', activity: 'Mechanical', q1Target: 255, cumulative: 0, percentComplete: 0, weeklyActual: 0 },
    { section: 'Mt Mulligan Steep Slope', startDate: '2025-11-30', targetKPStart: '32+800', targetKPEnd: '33+200', activity: 'Mechanical', q1Target: 222, cumulative: 0, percentComplete: 0, weeklyActual: 0 }
  ]
}

// =============================================
// WELDING AGGREGATION (Legacy Format)
// =============================================

/**
 * Aggregate welding data for legacy format
 * Returns both LM (linear metres) and count (weld count) tables
 */
export async function aggregateWeldingForLegacy(reports, reportDate) {
  const weldTypes = {
    'GMAW/FCAW Tie-Ins': { fromStation: '000+000', toStation: '000+000', todayLm: 0, previousLm: 0, todayWelds: 0, previousWelds: 0 },
    'GMAW/FCAW Stove Piping': { fromStation: '000+000', toStation: '000+000', todayLm: 0, previousLm: 0, todayWelds: 0, previousWelds: 0 },
    'GMAW/FCAW Poorboy': { fromStation: '000+000', toStation: '000+000', todayLm: 0, previousLm: 0, todayWelds: 0, previousWelds: 0 },
    'SMAW Poorboy (N/A)': { fromStation: '000+000', toStation: '000+000', todayLm: 0, previousLm: 0, todayWelds: 0, previousWelds: 0 },
    'Section Crews (Crossings)': { fromStation: '000+000', toStation: '000+000', todayLm: 0, previousLm: 0, todayWelds: 0, previousWelds: 0 },
    'EGP South - GMAW/FCAW Tie-Ins': { fromStation: '000+000', toStation: '000+000', todayLm: 0, previousLm: 0, todayWelds: 0, previousWelds: 0 },
    'EGP South - GMAW/FCAW Poorboy': { fromStation: '000+000', toStation: '000+000', todayLm: 0, previousLm: 0, todayWelds: 0, previousWelds: 0 }
  }

  const repairs = {
    'Tie-Ins': { today: 0, previous: 0 },
    'Poorboy': { today: 0, previous: 0 },
    'EGP South - Tie-Ins': { today: 0, previous: 0 },
    'EGP South - Poorboy': { today: 0, previous: 0 }
  }

  // Process today's reports
  reports.forEach(report => {
    const blocks = report.activity_blocks || []
    blocks.forEach(block => {
      if (!block.activityType?.toLowerCase().includes('weld')) return

      const weldData = block.weldData || {}
      const counterboreData = block.counterboreData || {}
      const weldsToday = weldData.weldsToday || weldData.weldEntries?.length || 0
      const metresPerJoint = 12.2 // Standard joint length

      // Determine weld type
      let key = 'GMAW/FCAW Poorboy'
      if (block.activityType.includes('Tie-in') || block.activityType.includes('Tie-In')) {
        key = 'GMAW/FCAW Tie-Ins'
      } else if (block.activityType.includes('Section')) {
        key = 'Section Crews (Crossings)'
      } else if (block.activityType.includes('Stove') || block.activityType.includes('Mainline')) {
        key = 'GMAW/FCAW Stove Piping'
      }

      // Update from/to stations
      if (block.startKP && weldTypes[key]) {
        weldTypes[key].fromStation = block.startKP
      }
      if (block.endKP && weldTypes[key]) {
        weldTypes[key].toStation = block.endKP
      }

      // Add weld counts and metres
      if (weldTypes[key]) {
        weldTypes[key].todayWelds += weldsToday
        weldTypes[key].todayLm += (parseFloat(block.metresToday) || weldsToday * metresPerJoint)
      }

      // Track repairs
      const repairEntries = weldData.repairs || []
      const repairCount = repairEntries.length || (weldData.weldEntries || []).filter(w =>
        w.repairRequired === 'Yes' || w.repairRequired === true
      ).length

      if (key.includes('Tie-In')) {
        repairs['Tie-Ins'].today += repairCount
      } else {
        repairs['Poorboy'].today += repairCount
      }
    })
  })

  // Fetch previous totals
  try {
    const { data: previousReports } = await supabase
      .from('daily_tickets')
      .select('activity_blocks')
      .lt('date', reportDate)

    ;(previousReports || []).forEach(report => {
      const blocks = report.activity_blocks || []
      blocks.forEach(block => {
        if (!block.activityType?.toLowerCase().includes('weld')) return

        const weldData = block.weldData || {}
        const weldsCount = weldData.weldsToday || weldData.weldEntries?.length || 0
        const metresPerJoint = 12.2

        let key = 'GMAW/FCAW Poorboy'
        if (block.activityType.includes('Tie-in') || block.activityType.includes('Tie-In')) {
          key = 'GMAW/FCAW Tie-Ins'
        } else if (block.activityType.includes('Section')) {
          key = 'Section Crews (Crossings)'
        } else if (block.activityType.includes('Stove') || block.activityType.includes('Mainline')) {
          key = 'GMAW/FCAW Stove Piping'
        }

        if (weldTypes[key]) {
          weldTypes[key].previousWelds += weldsCount
          weldTypes[key].previousLm += (parseFloat(block.metresToday) || weldsCount * metresPerJoint)
        }

        // Previous repairs
        const repairEntries = weldData.repairs || []
        const repairCount = repairEntries.length || (weldData.weldEntries || []).filter(w =>
          w.repairRequired === 'Yes' || w.repairRequired === true
        ).length

        if (key.includes('Tie-In')) {
          repairs['Tie-Ins'].previous += repairCount
        } else {
          repairs['Poorboy'].previous += repairCount
        }
      })
    })
  } catch (err) {
    console.error('Error fetching previous welding data:', err)
  }

  // Build welding by LM array
  const byLM = Object.entries(weldTypes).map(([weldType, data]) => ({
    weldType,
    fromStation: data.fromStation,
    toStation: data.toStation,
    todayLm: data.todayLm,
    previousLm: data.previousLm,
    totalLm: data.todayLm + data.previousLm
  }))

  // Build welding by count array
  const byCount = Object.entries(weldTypes).map(([weldType, data]) => ({
    weldType,
    today: data.todayWelds,
    previous: data.previousWelds,
    total: data.todayWelds + data.previousWelds
  }))

  // Calculate totals
  const totalWelds = byCount.reduce((sum, w) => sum + w.total, 0)
  const totalRepairs = Object.values(repairs).reduce((sum, r) => sum + r.today + r.previous, 0)
  const repairRate = totalWelds > 0 ? ((totalRepairs / totalWelds) * 100).toFixed(1) : '0.0'

  // Build repairs array
  const repairsArray = Object.entries(repairs).map(([type, data]) => ({
    type,
    today: data.today,
    previous: data.previous,
    total: data.today + data.previous
  }))

  return {
    byLM,
    byCount,
    repairs: repairsArray,
    totalRepairs,
    repairRate
  }
}

// =============================================
// AI NARRATIVE GENERATION
// =============================================

/**
 * Generate Key Focus narrative with AI
 * Returns narrative summary and bullet points in EGP format
 */
export async function generateKeyFocusWithAI(reports, aggregatedData) {
  if (!anthropicApiKey) {
    return {
      narrative: '',
      bullets: [
        '< API key not configured for AI narrative generation',
        '< Please add VITE_ANTHROPIC_API_KEY to enable this feature'
      ]
    }
  }

  // Build context from reports
  const reportSummaries = reports.map(report => {
    const activities = report.activity_blocks || []
    const activitySummary = activities.map(a => {
      const metres = a.metres || 0
      const workDesc = a.workDescription || ''
      return `- ${a.activityType}: ${a.contractor || 'N/A'} at KP ${a.startKP || 'N/A'} to KP ${a.endKP || 'N/A'}, ${metres}m. ${workDesc.substring(0, 100)}`
    }).join('\n')

    return `
Inspector: ${report.inspector_name || 'Unknown'}
Spread: ${report.spread || 'N/A'}
Activities:
${activitySummary}
General Comments: ${report.general_comments || 'None'}
Safety Notes: ${report.safety_notes || 'None'}
`
  }).join('\n---\n')

  // Calculate today's progress
  const todaysProgress = aggregatedData.progressData?.plannedVsActual
    ?.filter(p => p.dailyActual > 0)
    ?.map(p => `${p.section} (${p.activity}): ${p.dailyActual.toFixed(1)} lm`)
    ?.join(', ') || 'No progress recorded'

  const prompt = `You are a Chief Pipeline Inspector writing the "Key Focus of the Day" section for an EGP (Eagle Mountain - Woodfibre Gas Pipeline) Daily Construction Summary Report.

Based on the following inspector reports from today, write 6-10 bullet points highlighting the key activities.

FORMAT REQUIREMENTS:
- Each bullet MUST start with "< " (less-than symbol followed by space)
- Include specific KP/KM locations when available
- Include specific equipment, crew actions, and work descriptions
- Be concise but specific - match the style of professional construction daily reports
- If there is no progress, state "No Progress today" as the first bullet

INSPECTOR REPORTS:
${reportSummaries}

TODAY'S PROGRESS:
${todaysProgress}

PERSONNEL ON SITE:
- Total Site Exposure: ${aggregatedData.personnel?.totalSiteExposure || 0}
- Prime Resources: ${aggregatedData.personnel?.primeResources || 0}

WELDING TODAY:
${aggregatedData.welding?.byCount?.filter(w => w.today > 0).map(w => `- ${w.weldType}: ${w.today} welds`).join('\n') || '- No welding today'}

Respond in JSON format:
{
  "bullets": ["< First bullet point", "< Second bullet point", ...]
}

Only output valid JSON, no other text.`

  try {
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
          content: prompt
        }]
      })
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'

    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())

    return {
      narrative: '',
      bullets: parsed.bullets || []
    }
  } catch (err) {
    console.error('Error generating AI narrative:', err)
    return {
      narrative: '',
      bullets: ['< Error generating narrative. Please review reports manually.']
    }
  }
}

// =============================================
// WEATHER AGGREGATION
// =============================================

/**
 * Aggregate weather data from reports
 */
export function aggregateWeatherForLegacy(reports) {
  let weather = {
    tempHigh: null,
    tempLow: null,
    conditions: '',
    precipitation: 0,
    rowConditions: ''
  }

  reports.forEach(report => {
    // Temperature
    if (report.weather_high_temp && (weather.tempHigh === null || report.weather_high_temp > weather.tempHigh)) {
      weather.tempHigh = parseFloat(report.weather_high_temp)
    }
    if (report.weather_low_temp && (weather.tempLow === null || report.weather_low_temp < weather.tempLow)) {
      weather.tempLow = parseFloat(report.weather_low_temp)
    }
    if (report.temp_high && (weather.tempHigh === null || report.temp_high > weather.tempHigh)) {
      weather.tempHigh = parseFloat(report.temp_high)
    }
    if (report.temp_low && (weather.tempLow === null || report.temp_low < weather.tempLow)) {
      weather.tempLow = parseFloat(report.temp_low)
    }

    // Conditions
    if (report.weather_conditions && !weather.conditions) {
      weather.conditions = report.weather_conditions
    }
    if (report.weather && !weather.conditions) {
      weather.conditions = report.weather
    }

    // Precipitation
    const precip = parseFloat(report.weather_precipitation || report.precipitation) || 0
    if (precip > weather.precipitation) {
      weather.precipitation = precip
    }

    // ROW Conditions
    if (report.row_conditions && !weather.rowConditions) {
      weather.rowConditions = report.row_conditions
    }
  })

  return weather
}

// =============================================
// PHOTO AGGREGATION
// =============================================

/**
 * Aggregate photos for legacy 2x3 grid format
 */
export function aggregatePhotosForLegacy(reports) {
  const photos = []

  reports.forEach(report => {
    const blocks = report.activity_blocks || []

    blocks.forEach(block => {
      // Check for photos in the activity
      const blockPhotos = block.photos || []
      blockPhotos.forEach(photo => {
        photos.push({
          id: photo.id || `${report.id}_${photos.length}`,
          url: photo.url || photo.path,
          kpLocation: block.startKP || '',
          description: photo.description || photo.caption || `${block.activityType || 'Activity'}`,
          latitude: photo.latitude || photo.location?.latitude,
          longitude: photo.longitude || photo.location?.longitude,
          direction: photo.direction || photo.heading || photo.direction_deg,
          accuracy: photo.accuracy || photo.accuracy_m,
          timestamp: photo.timestamp || report.created_at,
          inspector: report.inspector_name,
          activity: block.activityType
        })
      })
    })

    // Also check for report-level photos
    const reportPhotos = report.photos || []
    reportPhotos.forEach(photo => {
      photos.push({
        id: photo.id || `${report.id}_${photos.length}`,
        url: photo.url || photo.path,
        kpLocation: '',
        description: photo.description || photo.caption || 'Site Photo',
        latitude: photo.latitude,
        longitude: photo.longitude,
        direction: photo.direction,
        accuracy: photo.accuracy,
        timestamp: photo.timestamp || report.created_at,
        inspector: report.inspector_name,
        activity: ''
      })
    })
  })

  return photos
}

// =============================================
// SAVE/LOAD FUNCTIONS
// =============================================

/**
 * Save EGP summary report
 */
export async function saveEGPSummary(summaryData) {
  try {
    const { data: existing } = await supabase
      .from('daily_construction_summary')
      .select('id')
      .eq('report_date', summaryData.report_date)
      .single()

    const payload = {
      ...summaryData,
      report_type: 'egp_legacy',
      updated_at: new Date().toISOString()
    }

    if (existing) {
      const { data, error } = await supabase
        .from('daily_construction_summary')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      return { success: true, data, isNew: false }
    } else {
      const { data, error } = await supabase
        .from('daily_construction_summary')
        .insert(payload)
        .select()
        .single()

      if (error) throw error
      return { success: true, data, isNew: true }
    }
  } catch (err) {
    console.error('Error saving EGP summary:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Load existing EGP summary
 */
export async function loadEGPSummary(reportDate) {
  try {
    const { data, error } = await supabase
      .from('daily_construction_summary')
      .select('*')
      .eq('report_date', reportDate)
      .eq('report_type', 'egp_legacy')
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  } catch (err) {
    console.error('Error loading EGP summary:', err)
    return null
  }
}

export default {
  aggregatePersonnelForLegacy,
  aggregateProgressForLegacy,
  aggregateWeldingForLegacy,
  generateKeyFocusWithAI,
  aggregateWeatherForLegacy,
  aggregatePhotosForLegacy,
  saveEGPSummary,
  loadEGPSummary
}
