// ============================================================================
// WELDING CHIEF HELPERS
// February 2026 - Pipe-Up Pipeline Inspector SaaS
// Data aggregation functions for Welding Chief Dashboard
// ============================================================================

import { supabase } from './supabase'

const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

/**
 * Aggregate welder statistics by welder ID
 * @param {object} supabaseClient - Supabase client instance
 * @param {string} orgId - Organization ID for filtering
 * @param {object} dateRange - { startDate, endDate } for filtering
 * @returns {Array} Array of welder stats: { welderId, welderName, totalWelds, repairs, repairRate }
 */
export async function aggregateWelderStats(supabaseClient, orgId, dateRange = null) {
  try {
    // Build query for weld_book
    let query = supabaseClient
      .from('weld_book')
      .select('welder_id, welder_name, acceptance_status, repair_count, weld_date')

    if (orgId) {
      query = query.eq('organization_id', orgId)
    }

    if (dateRange?.startDate) {
      query = query.gte('weld_date', dateRange.startDate)
    }
    if (dateRange?.endDate) {
      query = query.lte('weld_date', dateRange.endDate)
    }

    const { data: weldData, error } = await query

    if (error) {
      console.error('Error fetching weld_book data:', error)
      // Fallback to daily_tickets if weld_book doesn't exist
      return await aggregateWelderStatsFromTickets(supabaseClient, orgId, dateRange)
    }

    // Aggregate by welder
    const welderMap = {}

    for (const weld of (weldData || [])) {
      const welderKey = weld.welder_id || weld.welder_name || 'Unknown'
      const welderName = weld.welder_name || welderKey

      if (!welderMap[welderKey]) {
        welderMap[welderKey] = {
          welderId: welderKey,
          welderName: welderName,
          totalWelds: 0,
          repairs: 0
        }
      }

      welderMap[welderKey].totalWelds++

      // Count repairs
      const repairs = weld.repair_count || (weld.acceptance_status === 'repair' ? 1 : 0)
      welderMap[welderKey].repairs += repairs
    }

    // Calculate repair rates and sort by rate descending
    const stats = Object.values(welderMap)
      .map(w => ({
        ...w,
        repairRate: w.totalWelds > 0 ? (w.repairs / w.totalWelds * 100) : 0
      }))
      .sort((a, b) => b.repairRate - a.repairRate)

    return stats
  } catch (err) {
    console.error('Error aggregating welder stats:', err)
    return []
  }
}

/**
 * Fallback: Aggregate welder stats from daily_tickets activity_blocks
 */
async function aggregateWelderStatsFromTickets(supabaseClient, orgId, dateRange = null) {
  try {
    let query = supabaseClient
      .from('daily_tickets')
      .select('id, date, activity_blocks')

    if (orgId) {
      query = query.eq('organization_id', orgId)
    }

    if (dateRange?.startDate) {
      query = query.gte('date', dateRange.startDate)
    }
    if (dateRange?.endDate) {
      query = query.lte('date', dateRange.endDate)
    }

    const { data: tickets, error } = await query

    if (error) throw error

    const welderMap = {}

    for (const ticket of (tickets || [])) {
      const blocks = ticket.activity_blocks || []

      for (const block of blocks) {
        if (!block.activityType?.includes('Welding')) continue

        const weldData = block.weldData || {}
        const weldEntries = weldData.weldEntries || []
        const repairs = weldData.repairs || []

        // Track by crew type as pseudo-welder if no individual welder data
        const crewType = weldData.crewType || block.contractor || 'Unknown Crew'

        if (!welderMap[crewType]) {
          welderMap[crewType] = {
            welderId: crewType,
            welderName: crewType,
            totalWelds: 0,
            repairs: 0
          }
        }

        welderMap[crewType].totalWelds += weldData.weldsToday || weldEntries.length || 0
        welderMap[crewType].repairs += repairs.length || 0
      }
    }

    return Object.values(welderMap)
      .map(w => ({
        ...w,
        repairRate: w.totalWelds > 0 ? (w.repairs / w.totalWelds * 100) : 0
      }))
      .sort((a, b) => b.repairRate - a.repairRate)
  } catch (err) {
    console.error('Error aggregating welder stats from tickets:', err)
    return []
  }
}

/**
 * Extract welding-related comments from reports
 * @param {Array} reports - Array of daily_ticket reports
 * @returns {Array} Array of comments: { inspector, time, kp, comment, activityType }
 */
export function extractWeldingComments(reports) {
  const comments = []

  for (const report of (reports || [])) {
    const blocks = report.activity_blocks || []

    for (const block of blocks) {
      // Only process welding-related activities
      if (!block.activityType?.toLowerCase().includes('weld')) continue

      // Extract comments from various fields
      const commentSources = [
        block.comments,
        block.generalComments,
        block.qualityChecks?.comments,
        block.weldData?.comments,
        block.workDescription
      ]

      for (const commentText of commentSources) {
        if (commentText && commentText.trim()) {
          comments.push({
            inspector: report.inspector_name || 'Unknown',
            reportId: report.id,
            date: report.date,
            time: block.startTime || '',
            kp: block.startKP || block.endKP || '',
            comment: commentText.trim(),
            activityType: block.activityType,
            contractor: block.contractor || ''
          })
        }
      }
    }
  }

  return comments.sort((a, b) => {
    // Sort by date descending, then by time
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return (b.time || '').localeCompare(a.time || '')
  })
}

/**
 * Aggregate daily weld production by crew type
 * @param {Array} reports - Array of daily_ticket reports
 * @returns {Object} { byCrewType: [...], totalWelds, totalRepairs, repairRate }
 */
export function aggregateDailyWeldProduction(reports) {
  const byCrewType = {}
  let totalWelds = 0
  let totalRepairs = 0

  for (const report of (reports || [])) {
    const blocks = report.activity_blocks || []

    for (const block of blocks) {
      if (!block.activityType?.toLowerCase().includes('weld')) continue

      const weldData = block.weldData || {}
      const counterboreData = block.counterboreData || {}

      // Determine crew type
      let crewType = 'Other'
      if (block.activityType === 'Welding - Mainline') {
        crewType = weldData.crewType || 'Main Gang'
      } else if (block.activityType === 'Welding - Section Crew') {
        crewType = 'Section Crew'
      } else if (block.activityType === 'Welding - Poor Boy') {
        crewType = 'Poor Boy'
      } else if (block.activityType === 'Welding - Tie-in') {
        crewType = 'Tie-In Crew'
      }

      if (!byCrewType[crewType]) {
        byCrewType[crewType] = {
          crewType,
          weldsCompleted: 0,
          repairs: 0,
          repairRate: 0
        }
      }

      // Count welds
      const weldsToday = weldData.weldsToday ||
                         weldData.weldEntries?.length ||
                         counterboreData.transitions?.length ||
                         0
      byCrewType[crewType].weldsCompleted += weldsToday
      totalWelds += weldsToday

      // Count repairs
      const repairsToday = weldData.repairs?.length || 0
      byCrewType[crewType].repairs += repairsToday
      totalRepairs += repairsToday
    }
  }

  // Calculate repair rates
  const crewArray = Object.values(byCrewType).map(crew => ({
    ...crew,
    repairRate: crew.weldsCompleted > 0
      ? (crew.repairs / crew.weldsCompleted * 100)
      : 0
  }))

  return {
    byCrewType: crewArray,
    totalWelds,
    totalRepairs,
    repairRate: totalWelds > 0 ? (totalRepairs / totalWelds * 100) : 0
  }
}

/**
 * Filter AI agent logs for welding-specific flags
 * @param {Array} aiLogs - Array of ai_agent_logs entries
 * @returns {Array} Filtered array of welding-related flags
 */
export function getWeldingAIFlags(aiLogs) {
  const weldingFlagTypes = [
    'WPS_MATERIAL_MISMATCH',
    'FILLER_MATERIAL_MISMATCH',
    'PREHEAT_VIOLATION',
    'WELDER_QUALIFICATION_EXPIRED',
    'NDT_REJECTION'
  ]

  const flags = []

  for (const log of (aiLogs || [])) {
    const analysisResult = log.analysis_result || {}
    const logFlags = analysisResult.flags || []

    for (const flag of logFlags) {
      if (weldingFlagTypes.includes(flag.type)) {
        flags.push({
          ...flag,
          ticket_id: log.ticket_id,
          ticket_date: log.ticket_date,
          analyzed_at: log.analyzed_at,
          log_id: log.id
        })
      }
    }
  }

  return flags.sort((a, b) => {
    // Sort by severity (critical first), then by date
    const severityOrder = { critical: 0, warning: 1, info: 2 }
    const aSev = severityOrder[a.severity] ?? 3
    const bSev = severityOrder[b.severity] ?? 3
    if (aSev !== bSev) return aSev - bSev
    return (b.analyzed_at || '').localeCompare(a.analyzed_at || '')
  })
}

/**
 * Extract welder certifications from WelderTestingLog data in daily_tickets
 * @param {Array} reports - Array of daily_ticket reports
 * @returns {Array} Certification data: { welderName, projectId, qualDate, status, ... }
 */
export function extractWelderCertifications(reports) {
  const certifications = []
  const weldersSeen = new Set()

  for (const report of (reports || [])) {
    const blocks = report.activity_blocks || []

    for (const block of blocks) {
      // Check for WelderTestingLog data
      const welderTests = block.welderTestingData?.welderTests || []

      for (const test of welderTests) {
        const welderKey = test.welderName || test.welderProjectId

        if (!welderKey || weldersSeen.has(welderKey)) continue
        weldersSeen.add(welderKey)

        // Calculate status based on test results
        let status = 'Active'
        if (test.passFail === 'Fail' && test.repairsPassFail !== 'Pass') {
          status = 'Requires Retest'
        } else if (!test.testDate) {
          status = 'Unknown'
        }

        // Check for expiry (typically 6 months from test date)
        let expiryDate = null
        let isExpiringSoon = false
        if (test.testDate) {
          const testDateObj = new Date(test.testDate)
          expiryDate = new Date(testDateObj)
          expiryDate.setMonth(expiryDate.getMonth() + 6)

          // Check if expiring within 30 days
          const thirtyDaysFromNow = new Date()
          thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
          isExpiringSoon = expiryDate <= thirtyDaysFromNow

          if (expiryDate < new Date()) {
            status = 'Expired'
          }
        }

        certifications.push({
          welderName: test.welderName || 'Unknown',
          projectId: test.welderProjectId || '',
          absaNo: test.welderAbsaNo || '',
          testDate: test.testDate || '',
          expiryDate: expiryDate?.toISOString().split('T')[0] || '',
          weldProcedure: test.weldProcedure || '',
          wallThicknessDiameter: test.wallThicknessDiameter || '',
          testMaterial: test.testMaterial || '',
          passFail: test.passFail || '',
          repairsPassFail: test.repairsPassFail || '',
          status,
          isExpiringSoon,
          sourceReportId: report.id,
          sourceDate: report.date
        })
      }
    }
  }

  return certifications.sort((a, b) => {
    // Sort by status (expired/expiring first), then by name
    const statusOrder = { 'Expired': 0, 'Requires Retest': 1, 'Unknown': 2, 'Active': 3 }
    const aOrder = statusOrder[a.status] ?? 4
    const bOrder = statusOrder[b.status] ?? 4
    if (aOrder !== bOrder) return aOrder - bOrder
    return (a.welderName || '').localeCompare(b.welderName || '')
  })
}

/**
 * Fetch WPS material specifications for compliance checking
 * @param {object} supabaseClient - Supabase client
 * @param {string} orgId - Organization ID
 * @returns {Array} WPS specs
 */
export async function fetchWPSSpecs(supabaseClient, orgId = null) {
  try {
    let query = supabaseClient
      .from('wps_material_specs')
      .select('*')
      .order('wps_number')

    if (orgId) {
      query = query.eq('organization_id', orgId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching WPS specs:', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('Error in fetchWPSSpecs:', err)
    return []
  }
}

/**
 * Aggregate daily weld summary for KPI cards
 * @param {object} supabaseClient - Supabase client
 * @param {string} orgId - Organization ID
 * @param {string} date - Date to aggregate (YYYY-MM-DD)
 * @returns {Object} { totalWelds, totalRepairs, repairRate, activeAlerts }
 */
export async function getDailyWeldSummary(supabaseClient, orgId, date) {
  try {
    // Fetch reports for the date
    let ticketQuery = supabaseClient
      .from('daily_tickets')
      .select('id, date, activity_blocks')
      .eq('date', date)

    if (orgId) {
      ticketQuery = ticketQuery.eq('organization_id', orgId)
    }

    const { data: tickets, error: ticketError } = await ticketQuery

    if (ticketError) throw ticketError

    // Aggregate from reports
    const production = aggregateDailyWeldProduction(tickets || [])

    // Get active AI alerts for welding
    let alertQuery = supabaseClient
      .from('ai_agent_logs')
      .select('id, ticket_id, ticket_date, analysis_result')
      .eq('ticket_date', date)

    if (orgId) {
      alertQuery = alertQuery.eq('organization_id', orgId)
    }

    const { data: aiLogs, error: alertError } = await alertQuery

    let activeAlerts = 0
    if (!alertError && aiLogs) {
      const weldingFlags = getWeldingAIFlags(aiLogs)
      activeAlerts = weldingFlags.filter(f => f.severity === 'critical').length
    }

    return {
      totalWelds: production.totalWelds,
      totalRepairs: production.totalRepairs,
      repairRate: production.repairRate,
      activeAlerts,
      byCrewType: production.byCrewType
    }
  } catch (err) {
    console.error('Error getting daily weld summary:', err)
    return {
      totalWelds: 0,
      totalRepairs: 0,
      repairRate: 0,
      activeAlerts: 0,
      byCrewType: []
    }
  }
}

/**
 * Get cumulative project weld statistics
 * @param {object} supabaseClient - Supabase client
 * @param {string} orgId - Organization ID
 * @returns {Object} Cumulative stats
 */
export async function getCumulativeWeldStats(supabaseClient, orgId) {
  try {
    // Try weld_book first
    let query = supabaseClient
      .from('weld_book')
      .select('id, acceptance_status, repair_count', { count: 'exact' })

    if (orgId) {
      query = query.eq('organization_id', orgId)
    }

    const { count: totalWelds, data, error } = await query

    if (error) {
      // Fallback to daily_tickets
      return await getCumulativeWeldStatsFromTickets(supabaseClient, orgId)
    }

    let totalRepairs = 0
    for (const weld of (data || [])) {
      totalRepairs += weld.repair_count || (weld.acceptance_status === 'repair' ? 1 : 0)
    }

    return {
      totalWelds: totalWelds || 0,
      totalRepairs,
      repairRate: totalWelds > 0 ? (totalRepairs / totalWelds * 100) : 0
    }
  } catch (err) {
    console.error('Error getting cumulative weld stats:', err)
    return { totalWelds: 0, totalRepairs: 0, repairRate: 0 }
  }
}

async function getCumulativeWeldStatsFromTickets(supabaseClient, orgId) {
  try {
    let query = supabaseClient
      .from('daily_tickets')
      .select('activity_blocks')

    if (orgId) {
      query = query.eq('organization_id', orgId)
    }

    const { data: tickets, error } = await query

    if (error) throw error

    let totalWelds = 0
    let totalRepairs = 0

    for (const ticket of (tickets || [])) {
      const blocks = ticket.activity_blocks || []

      for (const block of blocks) {
        if (!block.activityType?.toLowerCase().includes('weld')) continue

        const weldData = block.weldData || {}
        totalWelds += weldData.weldsToday || weldData.weldEntries?.length || 0
        totalRepairs += weldData.repairs?.length || 0
      }
    }

    return {
      totalWelds,
      totalRepairs,
      repairRate: totalWelds > 0 ? (totalRepairs / totalWelds * 100) : 0
    }
  } catch (err) {
    console.error('Error getting cumulative stats from tickets:', err)
    return { totalWelds: 0, totalRepairs: 0, repairRate: 0 }
  }
}

/**
 * Fetch welding-related AI agent logs with flags
 * @param {object} supabaseClient - Supabase client
 * @param {string} orgId - Organization ID
 * @param {number} limit - Number of records to fetch
 * @returns {Array} AI logs with welding flags
 */
export async function fetchWeldingAILogs(supabaseClient, orgId, limit = 50) {
  try {
    let query = supabaseClient
      .from('ai_agent_logs')
      .select('*')
      .order('analyzed_at', { ascending: false })
      .limit(limit)

    if (orgId) {
      query = query.eq('organization_id', orgId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching AI logs:', error)
      return []
    }

    // Filter to only logs with welding-related flags
    const weldingLogs = []
    for (const log of (data || [])) {
      const flags = getWeldingAIFlags([log])
      if (flags.length > 0) {
        weldingLogs.push({
          ...log,
          weldingFlags: flags
        })
      }
    }

    return weldingLogs
  } catch (err) {
    console.error('Error in fetchWeldingAILogs:', err)
    return []
  }
}

/**
 * Extract comprehensive welding activity data from reports
 * Includes location, weld entries, repairs, tie-ins, NDT data
 * @param {Array} reports - Array of daily_ticket reports
 * @returns {Array} Detailed welding activities
 */
export function extractDetailedWeldingActivities(reports) {
  const activities = []

  for (const report of (reports || [])) {
    const blocks = report.activity_blocks || []

    for (const block of blocks) {
      // Only process welding-related activities
      if (!block.activityType?.toLowerCase().includes('weld')) continue

      const weldData = block.weldData || {}
      const counterboreData = block.counterboreData || {}
      const tieInData = block.tieInData || {}

      const activity = {
        // Report info
        reportId: report.id,
        reportDate: report.date,
        inspector: report.inspector_name || 'Unknown',
        spread: report.spread || '',

        // Activity info
        activityType: block.activityType,
        contractor: block.contractor || weldData.contractor || tieInData.contractor || '',
        foreman: block.foreman || weldData.foreman || tieInData.foreman || '',

        // Location
        startKP: block.startKP || '',
        endKP: block.endKP || '',

        // Time
        startTime: block.startTime || weldData.startTime || '',
        endTime: block.endTime || weldData.endTime || '',

        // Crew/Method info
        crewType: weldData.crewType || '',
        weldMethod: weldData.weldMethod || '',

        // Weld counts
        weldsToday: weldData.weldsToday || 0,
        weldsPrevious: weldData.weldsPrevious || 0,
        totalWelds: weldData.totalWelds || (weldData.weldsToday || 0) + (weldData.weldsPrevious || 0),

        // Visual inspection
        visualsFrom: weldData.visualsFrom || '',
        visualsTo: weldData.visualsTo || '',

        // Detailed weld entries
        weldEntries: (weldData.weldEntries || []).map(entry => ({
          weldNumber: entry.weldNumber || '',
          preheat: entry.preheat || '',
          pass: entry.pass || '',
          side: entry.side || '',
          voltage: entry.voltage || '',
          amperage: entry.amperage || '',
          travelSpeed: entry.travelSpeed || '',
          heatInput: entry.heatInput || '',
          wpsId: entry.wpsId || '',
          meetsWPS: entry.meetsWPS
        })),

        // Repairs
        repairs: (weldData.repairs || []).map(repair => ({
          weldNumber: repair.weldNumber || repair.originalWeldNumber || '',
          defectCode: repair.defectCode || '',
          defectName: repair.defectName || repair.defect || '',
          clockPosition: repair.clockPosition || '',
          repairWeldNumber: repair.repairWeldNumber || '',
          repairDate: repair.repairDate || '',
          status: repair.status || 'pending'
        })),

        // Downtime
        downTimeHours: weldData.downTimeHours || 0,
        downTimeReason: weldData.downTimeReason || '',
        totalWeldTime: weldData.totalWeldTime || '',

        // Tie-in specific data
        tieIns: (tieInData.tieIns || counterboreData.transitions || []).map(ti => ({
          tieInNumber: ti.tieInNumber || ti.transitionNumber || '',
          station: ti.station || ti.kp || '',
          visualResult: ti.visualResult || '',
          ndeType: ti.ndeType || '',
          ndeResult: ti.ndeResult || '',
          constructionDirection: ti.constructionDirection || '',
          weldParamsCount: ti.weldParams?.length || 0,
          weldParams: ti.weldParams || [],
          pup: ti.pup || {}
        })),

        // Pipe size (for tie-ins)
        pipeSize: tieInData.pipeSize || counterboreData.pipeSize || '',

        // Comments
        comments: block.comments || block.generalComments || weldData.comments || '',
        qualityComments: block.qualityData?.comments || ''
      }

      activities.push(activity)
    }
  }

  return activities.sort((a, b) => {
    // Sort by date, then by start time
    if (a.reportDate !== b.reportDate) return b.reportDate.localeCompare(a.reportDate)
    return (a.startTime || '').localeCompare(b.startTime || '')
  })
}

/**
 * Get all individual weld entries from reports with full details
 * @param {Array} reports - Array of daily_ticket reports
 * @returns {Array} Individual weld entries with context
 */
export function extractIndividualWelds(reports) {
  const welds = []

  for (const report of (reports || [])) {
    const blocks = report.activity_blocks || []

    for (const block of blocks) {
      if (!block.activityType?.toLowerCase().includes('weld')) continue

      const weldData = block.weldData || {}
      const weldEntries = weldData.weldEntries || []

      for (const entry of weldEntries) {
        welds.push({
          // Context
          reportId: report.id,
          reportDate: report.date,
          inspector: report.inspector_name || '',
          contractor: block.contractor || weldData.contractor || '',
          foreman: block.foreman || weldData.foreman || '',
          crewType: weldData.crewType || '',
          activityType: block.activityType,
          startKP: block.startKP || '',
          endKP: block.endKP || '',

          // Weld details
          weldNumber: entry.weldNumber || '',
          preheat: entry.preheat || '',
          pass: entry.pass || '',
          side: entry.side || '',
          voltage: entry.voltage || '',
          amperage: entry.amperage || '',
          distance: entry.distance || '',
          time: entry.time || '',
          travelSpeed: entry.travelSpeed || '',
          heatInput: entry.heatInput || '',
          wpsId: entry.wpsId || '',
          meetsWPS: entry.meetsWPS,

          // Was this weld repaired?
          hasRepair: (weldData.repairs || []).some(r => r.weldNumber === entry.weldNumber)
        })
      }
    }
  }

  return welds
}

/**
 * Get all repairs with full details
 * @param {Array} reports - Array of daily_ticket reports
 * @returns {Array} All repair records with context
 */
export function extractAllRepairs(reports) {
  const repairs = []

  for (const report of (reports || [])) {
    const blocks = report.activity_blocks || []

    for (const block of blocks) {
      if (!block.activityType?.toLowerCase().includes('weld')) continue

      const weldData = block.weldData || {}
      const repairList = weldData.repairs || []

      for (const repair of repairList) {
        repairs.push({
          // Context
          reportId: report.id,
          reportDate: report.date,
          inspector: report.inspector_name || '',
          contractor: block.contractor || weldData.contractor || '',
          crewType: weldData.crewType || '',
          activityType: block.activityType,
          startKP: block.startKP || '',
          endKP: block.endKP || '',

          // Repair details
          weldNumber: repair.weldNumber || repair.originalWeldNumber || '',
          defectCode: repair.defectCode || '',
          defectName: repair.defectName || repair.defect || '',
          clockPosition: repair.clockPosition || '',
          repairWeldNumber: repair.repairWeldNumber || '',
          repairDate: repair.repairDate || '',
          status: repair.status || 'pending',
          notes: repair.notes || ''
        })
      }
    }
  }

  return repairs.sort((a, b) => b.reportDate.localeCompare(a.reportDate))
}

/**
 * Get all tie-in records with NDE data
 * @param {Array} reports - Array of daily_ticket reports
 * @returns {Array} Tie-in records with NDE results
 */
export function extractTieInData(reports) {
  const tieIns = []

  for (const report of (reports || [])) {
    const blocks = report.activity_blocks || []

    for (const block of blocks) {
      if (block.activityType !== 'Welding - Tie-in') continue

      const tieInData = block.tieInData || block.counterboreData || {}
      const tieInList = tieInData.tieIns || tieInData.transitions || []

      for (const ti of tieInList) {
        tieIns.push({
          // Context
          reportId: report.id,
          reportDate: report.date,
          inspector: report.inspector_name || '',
          contractor: block.contractor || tieInData.contractor || '',
          foreman: block.foreman || tieInData.foreman || '',
          startKP: block.startKP || '',
          endKP: block.endKP || '',

          // Tie-in details
          tieInNumber: ti.tieInNumber || '',
          station: ti.station || '',
          pipeSize: tieInData.pipeSize || '',
          constructionDirection: ti.constructionDirection || '',

          // Inspection results
          visualResult: ti.visualResult || '',
          ndeType: ti.ndeType || '',
          ndeResult: ti.ndeResult || '',

          // Weld parameters summary
          weldParamsCount: ti.weldParams?.length || 0,
          weldParams: ti.weldParams || [],

          // PUP data
          pup: ti.pup || {},
          hasPupData: !!(ti.pup?.cutLength || ti.pup?.addedLength)
        })
      }
    }
  }

  return tieIns.sort((a, b) => b.reportDate.localeCompare(a.reportDate))
}

/**
 * Get production summary by location (KP ranges)
 * @param {Array} reports - Array of daily_ticket reports
 * @returns {Array} Production by KP range
 */
export function aggregateProductionByLocation(reports) {
  const locations = {}

  for (const report of (reports || [])) {
    const blocks = report.activity_blocks || []

    for (const block of blocks) {
      if (!block.activityType?.toLowerCase().includes('weld')) continue

      const kpKey = `${block.startKP || '?'} - ${block.endKP || '?'}`
      const weldData = block.weldData || {}

      if (!locations[kpKey]) {
        locations[kpKey] = {
          startKP: block.startKP || '',
          endKP: block.endKP || '',
          totalWelds: 0,
          repairs: 0,
          activities: [],
          contractors: new Set(),
          inspectors: new Set()
        }
      }

      locations[kpKey].totalWelds += weldData.weldsToday || 0
      locations[kpKey].repairs += (weldData.repairs || []).length
      locations[kpKey].activities.push({
        date: report.date,
        type: block.activityType,
        welds: weldData.weldsToday || 0
      })
      if (block.contractor) locations[kpKey].contractors.add(block.contractor)
      if (report.inspector_name) locations[kpKey].inspectors.add(report.inspector_name)
    }
  }

  return Object.values(locations).map(loc => ({
    ...loc,
    contractors: Array.from(loc.contractors),
    inspectors: Array.from(loc.inspectors),
    repairRate: loc.totalWelds > 0 ? (loc.repairs / loc.totalWelds * 100) : 0
  }))
}

// =============================================
// AI NARRATIVE GENERATION FOR WELDING CHIEF REPORT
// =============================================

/**
 * Generate comprehensive Welding Chief Daily Report
 * @param {Object} params - Report parameters
 * @param {string} params.date - Report date
 * @param {Array} params.activities - Detailed welding activities
 * @param {Array} params.repairs - All repairs
 * @param {Array} params.tieIns - Tie-in records
 * @param {Array} params.comments - Inspector comments
 * @param {Object} params.dailySummary - Daily summary stats
 * @param {Array} params.welderPerformance - Welder stats
 * @param {Array} params.weldingFlags - AI-detected flags
 * @returns {Object} Generated report with narrative and sections
 */
export async function generateWeldingChiefReport(params) {
  const {
    date,
    activities = [],
    repairs = [],
    tieIns = [],
    comments = [],
    dailySummary = {},
    welderPerformance = [],
    weldingFlags = []
  } = params

  console.log('=== generateWeldingChiefReport called ===')
  console.log('Date:', date)
  console.log('Activities:', activities.length)
  console.log('Repairs:', repairs.length)
  console.log('API Key present:', !!anthropicApiKey)

  if (!anthropicApiKey) {
    console.warn('Anthropic API key not configured')
    return {
      narrative: 'API key not configured. Please add VITE_ANTHROPIC_API_KEY to generate AI narratives.',
      sections: buildManualReportSections(params),
      generated: false
    }
  }

  // Build context for AI
  const contextSummary = buildReportContext(params)

  const prompt = `You are a Welding Chief Inspector writing a Daily Welding Report for a pipeline construction project.

Based on the following welding data from today, generate a professional daily report with:

1. EXECUTIVE SUMMARY (2-3 sentences overview of the day's welding operations)

2. PRODUCTION SUMMARY
- Total welds completed by crew type
- Progress against targets
- Notable achievements or concerns

3. QUALITY & REPAIRS
- Repair rate analysis
- Defect types encountered
- Welders flagged for performance issues

4. TIE-IN OPERATIONS (if applicable)
- Tie-ins completed
- NDE results (RT/UT)
- Visual inspection status

5. INSPECTOR OBSERVATIONS
- Key comments from welding inspectors
- Issues noted in the field
- Recommendations

6. ACTION ITEMS
- Follow-up items for tomorrow
- Welders requiring attention
- Quality concerns to address

TODAY'S DATA:
${contextSummary}

Respond in JSON format:
{
  "executiveSummary": "Brief 2-3 sentence overview",
  "productionSummary": {
    "narrative": "Production paragraph",
    "bullets": ["< Bullet 1", "< Bullet 2"]
  },
  "qualityAndRepairs": {
    "narrative": "Quality paragraph",
    "bullets": ["< Bullet 1", "< Bullet 2"],
    "flaggedWelders": ["Welder name - issue"]
  },
  "tieInOperations": {
    "narrative": "Tie-in paragraph or 'No tie-in operations today'",
    "bullets": ["< Bullet 1"]
  },
  "inspectorObservations": {
    "narrative": "Observations paragraph",
    "keyComments": ["Comment 1", "Comment 2"]
  },
  "actionItems": ["Action 1", "Action 2"]
}

Only output valid JSON, no other text.`

  try {
    console.log('Calling Anthropic API for welding report...')
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
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

    if (!response.ok) {
      const errorText = await response.text()
      console.error('API Error:', response.status, errorText)
      return {
        narrative: `API Error: ${response.status}`,
        sections: buildManualReportSections(params),
        generated: false
      }
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    console.log('Raw API response:', text.substring(0, 500))

    // Parse JSON response
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())

    return {
      executiveSummary: parsed.executiveSummary || '',
      productionSummary: parsed.productionSummary || { narrative: '', bullets: [] },
      qualityAndRepairs: parsed.qualityAndRepairs || { narrative: '', bullets: [], flaggedWelders: [] },
      tieInOperations: parsed.tieInOperations || { narrative: 'No tie-in operations today', bullets: [] },
      inspectorObservations: parsed.inspectorObservations || { narrative: '', keyComments: [] },
      actionItems: parsed.actionItems || [],
      generated: true,
      rawData: params
    }
  } catch (err) {
    console.error('Error generating welding report:', err)
    return {
      narrative: 'Error generating report. Please review data manually.',
      sections: buildManualReportSections(params),
      generated: false,
      error: err.message
    }
  }
}

/**
 * Build context string for AI prompt
 */
function buildReportContext(params) {
  const {
    date,
    activities,
    repairs,
    tieIns,
    comments,
    dailySummary,
    welderPerformance,
    weldingFlags
  } = params

  let context = `Date: ${date}\n\n`

  // Production stats
  context += `PRODUCTION STATISTICS:\n`
  context += `- Total Welds Today: ${dailySummary.totalWelds || 0}\n`
  context += `- Total Repairs: ${dailySummary.totalRepairs || 0}\n`
  context += `- Daily Repair Rate: ${(dailySummary.repairRate || 0).toFixed(1)}%\n`

  if (dailySummary.byCrewType?.length > 0) {
    context += `\nBy Crew Type:\n`
    for (const crew of dailySummary.byCrewType) {
      context += `- ${crew.crewType}: ${crew.weldsCompleted} welds, ${crew.repairs} repairs (${crew.repairRate.toFixed(1)}%)\n`
    }
  }

  // Activities detail
  if (activities.length > 0) {
    context += `\nWELDING ACTIVITIES (${activities.length}):\n`
    for (const act of activities.slice(0, 10)) {
      context += `- ${act.activityType} at KP ${act.startKP}-${act.endKP}`
      context += ` | Contractor: ${act.contractor} | Welds: ${act.weldsToday}`
      if (act.repairs.length > 0) context += ` | Repairs: ${act.repairs.length}`
      context += `\n`
    }
  }

  // Repairs detail
  if (repairs.length > 0) {
    context += `\nREPAIRS (${repairs.length}):\n`
    for (const repair of repairs.slice(0, 10)) {
      context += `- Weld ${repair.weldNumber}: ${repair.defectCode} (${repair.defectName})`
      context += ` at KP ${repair.startKP} | Crew: ${repair.crewType}\n`
    }
  }

  // Tie-ins
  if (tieIns.length > 0) {
    context += `\nTIE-IN OPERATIONS (${tieIns.length}):\n`
    for (const ti of tieIns) {
      context += `- ${ti.tieInNumber} at ${ti.station}`
      context += ` | Visual: ${ti.visualResult || 'Pending'}`
      context += ` | NDE: ${ti.ndeType || 'N/A'} - ${ti.ndeResult || 'Pending'}\n`
    }
  }

  // Welder performance issues
  const flaggedWelders = welderPerformance.filter(w => w.repairRate > 8)
  if (flaggedWelders.length > 0) {
    context += `\nFLAGGED WELDERS (>8% repair rate):\n`
    for (const w of flaggedWelders) {
      context += `- ${w.welderName}: ${w.repairRate.toFixed(1)}% repair rate (${w.repairs}/${w.totalWelds})\n`
    }
  }

  // AI-detected flags
  if (weldingFlags.length > 0) {
    context += `\nAI-DETECTED QUALITY FLAGS (${weldingFlags.length}):\n`
    for (const flag of weldingFlags.slice(0, 5)) {
      context += `- ${flag.type}: ${flag.message}\n`
    }
  }

  // Inspector comments
  if (comments.length > 0) {
    context += `\nINSPECTOR COMMENTS (${comments.length}):\n`
    for (const c of comments.slice(0, 8)) {
      context += `- ${c.inspector} (${c.activityType}): "${c.comment.substring(0, 150)}..."\n`
    }
  }

  return context
}

/**
 * Build manual report sections when AI is unavailable
 */
function buildManualReportSections(params) {
  const {
    activities,
    repairs,
    tieIns,
    comments,
    dailySummary,
    welderPerformance
  } = params

  return {
    production: {
      totalWelds: dailySummary.totalWelds || 0,
      byCrewType: dailySummary.byCrewType || [],
      repairRate: dailySummary.repairRate || 0
    },
    repairs: repairs.slice(0, 20),
    tieIns: tieIns,
    flaggedWelders: welderPerformance.filter(w => w.repairRate > 8),
    comments: comments.slice(0, 15)
  }
}

/**
 * Save Welding Chief Daily Report to database
 */
export async function saveWeldingChiefReport(supabaseClient, orgId, report) {
  try {
    const { data, error } = await supabaseClient
      .from('welding_chief_reports')
      .upsert({
        organization_id: orgId,
        report_date: report.date,
        executive_summary: report.executiveSummary,
        production_summary: report.productionSummary,
        quality_and_repairs: report.qualityAndRepairs,
        tiein_operations: report.tieInOperations,
        inspector_observations: report.inspectorObservations,
        action_items: report.actionItems,
        raw_data: report.rawData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'organization_id,report_date'
      })
      .select()

    if (error) throw error
    return data
  } catch (err) {
    console.error('Error saving welding chief report:', err)
    throw err
  }
}

/**
 * Fetch existing Welding Chief Daily Report
 */
export async function fetchWeldingChiefReport(supabaseClient, orgId, date) {
  try {
    const { data, error } = await supabaseClient
      .from('welding_chief_reports')
      .select('*')
      .eq('organization_id', orgId)
      .eq('report_date', date)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  } catch (err) {
    console.error('Error fetching welding chief report:', err)
    return null
  }
}

export default {
  aggregateWelderStats,
  extractWeldingComments,
  aggregateDailyWeldProduction,
  getWeldingAIFlags,
  extractWelderCertifications,
  fetchWPSSpecs,
  getDailyWeldSummary,
  getCumulativeWeldStats,
  fetchWeldingAILogs,
  extractDetailedWeldingActivities,
  extractIndividualWelds,
  extractAllRepairs,
  extractTieInData,
  aggregateProductionByLocation,
  generateWeldingChiefReport,
  saveWeldingChiefReport,
  fetchWeldingChiefReport
}
