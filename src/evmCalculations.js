// evmCalculations.js - Earned Value Management Calculations
// Integrates project_baselines with daily_reports for real-time EVM metrics

import { supabase } from './supabase'

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

// Parse KP string to metres
export function parseKPToMetres(kpString) {
  if (!kpString) return null
  const str = String(kpString).trim()
  if (str.includes('+')) {
    const [km, m] = str.split('+')
    return (parseInt(km) || 0) * 1000 + (parseInt(m) || 0)
  }
  const num = parseFloat(str)
  return isNaN(num) ? null : num * 1000
}

// Format metres to KP string
export function formatMetresToKP(metres) {
  if (metres === null || metres === undefined) return ''
  const km = Math.floor(metres / 1000)
  const m = Math.round(metres % 1000)
  return `${km}+${m.toString().padStart(3, '0')}`
}

// Format currency
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-CA', { 
    style: 'currency', 
    currency: 'CAD', 
    maximumFractionDigits: 0 
  }).format(amount || 0)
}

// =====================================================
// FETCH BASELINE DATA
// =====================================================

/**
 * Fetch all project baselines
 */
export async function fetchBaselines(filters = {}) {
  let query = supabase
    .from('project_baselines')
    .select('*')
    .eq('is_active', true)
    .order('planned_start_date')

  if (filters.spread) {
    query = query.eq('spread', filters.spread)
  }
  if (filters.activityType) {
    query = query.eq('activity_type', filters.activityType)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching baselines:', error)
    return []
  }

  return data || []
}

/**
 * Fetch baseline summary by activity type
 */
export async function fetchBaselineSummary() {
  const { data, error } = await supabase
    .from('evm_baseline_summary')
    .select('*')

  if (error) {
    console.error('Error fetching baseline summary:', error)
    return []
  }

  return data || []
}

// =====================================================
// FETCH ACTUAL DATA FROM DAILY TICKETS
// =====================================================

/**
 * Aggregate actual production from daily_reports
 */
export async function fetchActualProduction(filters = {}) {
  const { startDate, endDate, spread, activityType } = filters

  let query = supabase
    .from('daily_reports')
    .select('*')
    .order('date')

  if (startDate) {
    query = query.gte('date', startDate)
  }
  if (endDate) {
    query = query.lte('date', endDate)
  }
  if (spread) {
    query = query.eq('spread', spread)
  }

  const { data: reports, error } = await query

  if (error) {
    console.error('Error fetching actual production:', error)
    return null
  }

  // Aggregate by activity type
  const actuals = {}
  let totalLabourHours = 0
  let totalLabourCost = 0
  let totalEquipmentHours = 0
  let totalEquipmentCost = 0

  reports?.forEach(report => {
    const blocks = report.activity_blocks || []

    blocks.forEach(block => {
      const activity = block.activityType
      if (!activity) return
      if (activityType && activity !== activityType) return

      // Initialize activity if not exists
      if (!actuals[activity]) {
        actuals[activity] = {
          activityType: activity,
          actualMetres: 0,
          labourHours: 0,
          labourCost: 0,
          equipmentHours: 0,
          equipmentCost: 0,
          reportCount: 0,
          minKP: null,
          maxKP: null
        }
      }

      // Calculate metres
      const startM = parseKPToMetres(block.startKP)
      const endM = parseKPToMetres(block.endKP)
      if (startM !== null && endM !== null) {
        const metres = Math.abs(endM - startM)
        actuals[activity].actualMetres += metres

        // Track KP range
        if (actuals[activity].minKP === null || startM < actuals[activity].minKP) {
          actuals[activity].minKP = startM
        }
        if (actuals[activity].maxKP === null || endM > actuals[activity].maxKP) {
          actuals[activity].maxKP = endM
        }
      }

      actuals[activity].reportCount++

      // Aggregate labour (default rate $85/hr if not specified)
      block.labourEntries?.forEach(entry => {
        const hours = ((entry.rt || 0) + (entry.ot || 0)) * (entry.count || 1)
        const rate = entry.rate || 85
        actuals[activity].labourHours += hours
        actuals[activity].labourCost += hours * rate
        totalLabourHours += hours
        totalLabourCost += hours * rate
      })

      // Aggregate equipment (default rate $150/hr if not specified)
      block.equipmentEntries?.forEach(entry => {
        const hours = entry.hours || 0
        const rate = entry.rate || 150
        actuals[activity].equipmentHours += hours
        actuals[activity].equipmentCost += hours * rate
        totalEquipmentHours += hours
        totalEquipmentCost += hours * rate
      })
    })
  })

  return {
    byActivity: actuals,
    totals: {
      labourHours: totalLabourHours,
      labourCost: totalLabourCost,
      equipmentHours: totalEquipmentHours,
      equipmentCost: totalEquipmentCost,
      totalCost: totalLabourCost + totalEquipmentCost
    },
    reportCount: reports?.length || 0
  }
}

// =====================================================
// CORE EVM CALCULATIONS
// =====================================================

/**
 * Calculate EVM metrics for a single activity
 * 
 * @param {object} baseline - Baseline data for this activity
 * @param {object} actual - Actual production data
 * @param {Date} asOfDate - Date to calculate PV for (default: today)
 * @returns {object} EVM metrics
 */
export function calculateActivityEVM(baseline, actual, asOfDate = new Date()) {
  const today = asOfDate instanceof Date ? asOfDate : new Date(asOfDate)
  
  // Parse dates
  const startDate = new Date(baseline.planned_start_date)
  const endDate = new Date(baseline.planned_end_date)
  const totalDuration = (endDate - startDate) / (1000 * 60 * 60 * 24) // days
  const daysElapsed = Math.max(0, (today - startDate) / (1000 * 60 * 60 * 24))

  // Calculate percent of schedule elapsed
  let percentScheduleElapsed = 0
  if (today >= endDate) {
    percentScheduleElapsed = 100
  } else if (today > startDate) {
    percentScheduleElapsed = (daysElapsed / totalDuration) * 100
  }

  // PLANNED VALUE (PV) - Budgeted Cost of Work Scheduled
  // How much work SHOULD be done by now × unit cost
  const plannedMetresToDate = (baseline.planned_metres * percentScheduleElapsed) / 100
  const plannedValue = plannedMetresToDate * baseline.budgeted_unit_cost

  // EARNED VALUE (EV) - Budgeted Cost of Work Performed
  // Actual metres completed × budgeted unit cost
  const actualMetres = actual?.actualMetres || 0
  const earnedValue = actualMetres * baseline.budgeted_unit_cost

  // ACTUAL COST (AC) - Actual Cost of Work Performed
  // Real labour + equipment costs from daily reports
  const actualCost = (actual?.labourCost || 0) + (actual?.equipmentCost || 0)

  // If no actual cost recorded, estimate from baseline rates
  const estimatedActualCost = actualCost > 0 ? actualCost : 
    (actual?.labourHours || 0) * baseline.labour_rate_per_hour +
    (actual?.equipmentHours || 0) * baseline.equipment_rate_per_hour

  // PERFORMANCE INDICES
  // SPI = EV / PV (Schedule Performance Index)
  // > 1 = ahead of schedule, < 1 = behind schedule
  const spi = plannedValue > 0 ? earnedValue / plannedValue : 1

  // CPI = EV / AC (Cost Performance Index)
  // > 1 = under budget, < 1 = over budget
  const cpi = estimatedActualCost > 0 ? earnedValue / estimatedActualCost : 1

  // VARIANCES
  // Schedule Variance (SV) = EV - PV
  const scheduleVariance = earnedValue - plannedValue

  // Cost Variance (CV) = EV - AC
  const costVariance = earnedValue - estimatedActualCost

  // FORECASTS
  const budgetAtCompletion = baseline.budgeted_total || 
    (baseline.planned_metres * baseline.budgeted_unit_cost)

  // Estimate at Completion (EAC) = BAC / CPI
  const estimateAtCompletion = cpi > 0 ? budgetAtCompletion / cpi : budgetAtCompletion

  // Variance at Completion (VAC) = BAC - EAC
  const varianceAtCompletion = budgetAtCompletion - estimateAtCompletion

  // SCHEDULE ANALYSIS
  // Planned metres vs actual metres gap
  const metresVariance = actualMetres - plannedMetresToDate
  const metresVariancePercent = plannedMetresToDate > 0 
    ? (metresVariance / plannedMetresToDate) * 100 
    : 0

  // Days ahead/behind
  const daysVariance = totalDuration > 0 
    ? (metresVariance / baseline.planned_metres) * totalDuration 
    : 0

  return {
    // Baseline info
    activityType: baseline.activity_type,
    spread: baseline.spread,
    plannedMetres: baseline.planned_metres,
    budgetedUnitCost: baseline.budgeted_unit_cost,
    budgetAtCompletion,
    plannedStartDate: baseline.planned_start_date,
    plannedEndDate: baseline.planned_end_date,

    // Progress
    plannedMetresToDate: Math.round(plannedMetresToDate),
    actualMetres: Math.round(actualMetres),
    percentPlanned: Math.round(percentScheduleElapsed),
    percentComplete: Math.round((actualMetres / baseline.planned_metres) * 100),

    // Core EVM values
    plannedValue: Math.round(plannedValue),
    earnedValue: Math.round(earnedValue),
    actualCost: Math.round(estimatedActualCost),

    // Performance indices
    spi: parseFloat(spi.toFixed(2)),
    cpi: parseFloat(cpi.toFixed(2)),

    // Variances
    scheduleVariance: Math.round(scheduleVariance),
    costVariance: Math.round(costVariance),
    metresVariance: Math.round(metresVariance),
    metresVariancePercent: parseFloat(metresVariancePercent.toFixed(1)),
    daysVariance: parseFloat(daysVariance.toFixed(1)),

    // Forecasts
    estimateAtCompletion: Math.round(estimateAtCompletion),
    varianceAtCompletion: Math.round(varianceAtCompletion),

    // Status
    isAheadOfSchedule: spi >= 1,
    isUnderBudget: cpi >= 1,
    healthStatus: getHealthStatus(spi, cpi)
  }
}

/**
 * Get health status based on SPI and CPI
 */
function getHealthStatus(spi, cpi) {
  const avg = (spi + cpi) / 2
  if (avg >= 0.95) return { color: '#28a745', label: 'GREEN', icon: '✅' }
  if (avg >= 0.85) return { color: '#ffc107', label: 'AMBER', icon: '⚠️' }
  return { color: '#dc3545', label: 'RED', icon: '🔴' }
}

// =====================================================
// MAIN EVM CALCULATION FUNCTION
// =====================================================

/**
 * Calculate full EVM metrics for the project
 * 
 * @param {object} options
 * @param {string} options.spread - Filter by spread
 * @param {Date} options.asOfDate - Calculate as of this date
 * @param {string} options.startDate - Actuals from this date
 * @param {string} options.endDate - Actuals to this date
 */
export async function calculateEVM(options = {}) {
  const { spread, asOfDate = new Date(), startDate, endDate } = options

  try {
    // Fetch baselines
    const baselines = await fetchBaselines({ spread })
    if (!baselines.length) {
      console.warn('No baselines found')
      return null
    }

    // Fetch actuals
    const actualsData = await fetchActualProduction({ spread, startDate, endDate })
    if (!actualsData) {
      console.warn('No actuals data')
      return null
    }

    // Calculate EVM for each activity
    const byActivity = {}
    let totalPV = 0
    let totalEV = 0
    let totalAC = 0
    let totalBAC = 0

    baselines.forEach(baseline => {
      const activity = baseline.activity_type
      const actual = actualsData.byActivity[activity] || null

      const evm = calculateActivityEVM(baseline, actual, asOfDate)
      
      // Aggregate by activity (combine spreads)
      if (!byActivity[activity]) {
        byActivity[activity] = {
          ...evm,
          spreads: [baseline.spread]
        }
      } else {
        // Combine metrics from multiple spreads
        byActivity[activity].plannedMetres += evm.plannedMetres
        byActivity[activity].plannedMetresToDate += evm.plannedMetresToDate
        byActivity[activity].actualMetres += evm.actualMetres
        byActivity[activity].plannedValue += evm.plannedValue
        byActivity[activity].earnedValue += evm.earnedValue
        byActivity[activity].actualCost += evm.actualCost
        byActivity[activity].budgetAtCompletion += evm.budgetAtCompletion
        byActivity[activity].spreads.push(baseline.spread)
      }

      totalPV += evm.plannedValue
      totalEV += evm.earnedValue
      totalAC += evm.actualCost
      totalBAC += evm.budgetAtCompletion
    })

    // Recalculate indices for combined activities
    Object.values(byActivity).forEach(activity => {
      activity.spi = activity.plannedValue > 0 
        ? parseFloat((activity.earnedValue / activity.plannedValue).toFixed(2))
        : 1
      activity.cpi = activity.actualCost > 0 
        ? parseFloat((activity.earnedValue / activity.actualCost).toFixed(2))
        : 1
      activity.percentComplete = activity.plannedMetres > 0
        ? Math.round((activity.actualMetres / activity.plannedMetres) * 100)
        : 0
      activity.healthStatus = getHealthStatus(activity.spi, activity.cpi)
    })

    // Calculate project-level metrics
    const projectSPI = totalPV > 0 ? totalEV / totalPV : 1
    const projectCPI = totalAC > 0 ? totalEV / totalAC : 1
    const projectEAC = projectCPI > 0 ? totalBAC / projectCPI : totalBAC
    const projectVAC = totalBAC - projectEAC

    // Find critical activities (SPI < 0.9 or CPI < 0.9)
    const criticalActivities = Object.values(byActivity)
      .filter(a => a.spi < 0.9 || a.cpi < 0.9)
      .sort((a, b) => (a.spi + a.cpi) - (b.spi + b.cpi))

    return {
      // Summary metrics
      summary: {
        plannedValue: Math.round(totalPV),
        earnedValue: Math.round(totalEV),
        actualCost: Math.round(totalAC),
        budgetAtCompletion: Math.round(totalBAC),
        estimateAtCompletion: Math.round(projectEAC),
        varianceAtCompletion: Math.round(projectVAC),
        spi: parseFloat(projectSPI.toFixed(2)),
        cpi: parseFloat(projectCPI.toFixed(2)),
        scheduleVariance: Math.round(totalEV - totalPV),
        costVariance: Math.round(totalEV - totalAC),
        healthStatus: getHealthStatus(projectSPI, projectCPI)
      },

      // By activity breakdown
      byActivity,

      // Critical items needing attention
      criticalActivities,

      // Raw data for debugging
      reportCount: actualsData.reportCount,
      baselineCount: baselines.length,
      asOfDate: asOfDate.toISOString().split('T')[0]
    }

  } catch (err) {
    console.error('Error calculating EVM:', err)
    return null
  }
}

// =====================================================
// GAP ANALYSIS
// =====================================================

/**
 * Calculate the gap between planned and actual progress
 * Returns specific KP variance for each activity
 */
export async function calculateGapAnalysis(options = {}) {
  const evmData = await calculateEVM(options)
  if (!evmData) return null

  const gaps = Object.entries(evmData.byActivity).map(([activity, data]) => {
    const plannedKP = formatMetresToKP(data.plannedMetresToDate)
    const actualKP = formatMetresToKP(data.actualMetres)
    const gapMetres = data.actualMetres - data.plannedMetresToDate

    return {
      activityType: activity,
      plannedKP,
      actualKP,
      gapMetres,
      gapFormatted: formatMetresToKP(Math.abs(gapMetres)),
      status: gapMetres >= 0 ? 'AHEAD' : 'BEHIND',
      spi: data.spi,
      daysVariance: data.daysVariance,
      recommendation: gapMetres < -1000 
        ? `⚠️ ${activity} is ${formatMetresToKP(Math.abs(gapMetres))} behind. Consider adding resources.`
        : gapMetres > 1000
        ? `✅ ${activity} is ${formatMetresToKP(gapMetres)} ahead of schedule.`
        : `➡️ ${activity} is tracking to plan.`
    }
  }).sort((a, b) => a.gapMetres - b.gapMetres) // Most behind first

  return {
    gaps,
    summary: evmData.summary,
    mostBehind: gaps[0],
    mostAhead: gaps[gaps.length - 1]
  }
}

// =====================================================
// EXPORT DEFAULT
// =====================================================

export default {
  calculateEVM,
  calculateGapAnalysis,
  fetchBaselines,
  fetchBaselineSummary,
  fetchActualProduction,
  calculateActivityEVM,
  parseKPToMetres,
  formatMetresToKP,
  formatCurrency
}
