// chiefReportHelpers.js
// Data aggregation and AI narrative generation for Daily Construction Summary Reports

import { supabase } from './supabase'

const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

// =============================================
// PROJECT BASELINE & PROGRESS FUNCTIONS
// =============================================

/**
 * Fetch project baselines (planned values)
 */
export async function fetchProjectBaselines() {
  try {
    const { data, error } = await supabase
      .from('project_baselines')
      .select('*')
      .eq('is_active', true)
      .order('activity_type')

    if (error) throw error
    
    // Aggregate by activity type (sum multiple segments)
    const aggregated = {}
    ;(data || []).forEach(item => {
      const actType = item.activity_type
      if (!aggregated[actType]) {
        aggregated[actType] = {
          activity_type: actType,
          planned_metres: 0,
          budgeted_total: 0,
          planned_daily_rate: item.planned_daily_rate || 0
        }
      }
      aggregated[actType].planned_metres += parseFloat(item.planned_metres) || 0
      aggregated[actType].budgeted_total += parseFloat(item.budgeted_total) || 0
    })
    
    return Object.values(aggregated)
  } catch (err) {
    console.error('Error fetching project baselines:', err)
    return []
  }
}

/**
 * Calculate cumulative progress from all daily_tickets up to a given date
 */
export async function calculateCumulativeProgress(upToDate) {
  try {
    // Fetch all reports up to and including the date
    const { data: reports, error } = await supabase
      .from('daily_tickets')
      .select('id, date, activity_blocks')
      .lte('date', upToDate)
      .order('date', { ascending: true })

    if (error) throw error

    // Aggregate metres by activity type
    const progressByActivity = {}
    
    ;(reports || []).forEach(report => {
      const blocks = report.activity_blocks || []
      blocks.forEach(block => {
        const actType = block.activityType || 'Unknown'
        const metres = parseFloat(block.metres) || 0
        
        if (!progressByActivity[actType]) {
          progressByActivity[actType] = {
            activity_type: actType,
            completed_to_date: 0,
            report_count: 0
          }
        }
        progressByActivity[actType].completed_to_date += metres
        progressByActivity[actType].report_count += 1
      })
    })

    return Object.values(progressByActivity)
  } catch (err) {
    console.error('Error calculating cumulative progress:', err)
    return []
  }
}

/**
 * Calculate daily progress for a specific date
 */
export async function calculateDailyProgress(reportDate) {
  try {
    const { data: reports, error } = await supabase
      .from('daily_tickets')
      .select('id, date, activity_blocks, spread')
      .eq('date', reportDate)

    if (error) throw error

    // Aggregate by activity type and spread for the day
    const dailyProgress = {}
    
    ;(reports || []).forEach(report => {
      const spread = report.spread || 'Unknown'
      const blocks = report.activity_blocks || []
      
      blocks.forEach(block => {
        const actType = block.activityType || 'Unknown'
        const metres = parseFloat(block.metres) || 0
        const key = `${actType}|${spread}`
        
        if (!dailyProgress[key]) {
          dailyProgress[key] = {
            activity_type: actType,
            spread: spread,
            daily_actual_lm: 0,
            start_kp: block.startKP,
            end_kp: block.endKP
          }
        }
        dailyProgress[key].daily_actual_lm += metres
        
        // Track KP range
        if (block.startKP && (!dailyProgress[key].start_kp || block.startKP < dailyProgress[key].start_kp)) {
          dailyProgress[key].start_kp = block.startKP
        }
        if (block.endKP && (!dailyProgress[key].end_kp || block.endKP > dailyProgress[key].end_kp)) {
          dailyProgress[key].end_kp = block.endKP
        }
      })
    })

    return Object.values(dailyProgress)
  } catch (err) {
    console.error('Error calculating daily progress:', err)
    return []
  }
}

/**
 * Get month-to-date progress for a given month
 */
export async function calculateMTDProgress(year, month) {
  try {
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0]
    
    const { data: reports, error } = await supabase
      .from('daily_tickets')
      .select('id, date, activity_blocks')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)

    if (error) throw error

    const mtdByActivity = {}
    
    ;(reports || []).forEach(report => {
      const blocks = report.activity_blocks || []
      blocks.forEach(block => {
        const actType = block.activityType || 'Unknown'
        const metres = parseFloat(block.metres) || 0
        
        if (!mtdByActivity[actType]) {
          mtdByActivity[actType] = { activity_type: actType, mtd_metres: 0 }
        }
        mtdByActivity[actType].mtd_metres += metres
      })
    })

    return Object.values(mtdByActivity)
  } catch (err) {
    console.error('Error calculating MTD progress:', err)
    return []
  }
}

/**
 * Build complete progress data for Daily Summary Report
 */
export async function buildProgressData(reportDate) {
  const [baselines, cumulative, daily, mtd] = await Promise.all([
    fetchProjectBaselines(),
    calculateCumulativeProgress(reportDate),
    calculateDailyProgress(reportDate),
    calculateMTDProgress(
      new Date(reportDate).getFullYear(),
      new Date(reportDate).getMonth() + 1
    )
  ])

  // Merge all data
  const activities = [
    'Clearing', 'Grading', 'Stringing', 'Bending', 
    'Welding - Mainline', 'Welding - Tie-in', 'Coating', 
    'Lowering-In', 'Backfill', 'Cleanup', 'HDD', 'Hydrotest'
  ]

  const progressData = activities.map(activity => {
    const baseline = baselines.find(b => b.activity_type === activity) || {}
    const cumulativeData = cumulative.find(c => c.activity_type === activity) || {}
    const dailyData = daily.filter(d => d.activity_type === activity)
    const mtdData = mtd.find(m => m.activity_type === activity) || {}
    
    const planned = parseFloat(baseline.planned_metres) || 0
    const completed = parseFloat(cumulativeData.completed_to_date) || 0
    const todayActual = dailyData.reduce((sum, d) => sum + (d.daily_actual_lm || 0), 0)
    const monthToDate = parseFloat(mtdData.mtd_metres) || 0
    
    return {
      activity_type: activity,
      total_planned: planned,
      completed_to_date: completed,
      remaining: planned - completed,
      percent_complete: planned > 0 ? ((completed / planned) * 100).toFixed(1) : 0,
      daily_actual: todayActual,
      daily_planned: parseFloat(baseline.planned_daily_rate) || 0,
      mtd_actual: monthToDate,
      daily_details: dailyData
    }
  })

  return progressData
}

// =============================================
// DATA AGGREGATION FUNCTIONS
// =============================================

/**
 * Fetch all approved inspector reports for a given date
 */
export async function fetchApprovedReportsForDate(reportDate) {
  try {
    console.log('Fetching approved reports for date:', reportDate)
    
    // Get all approved report IDs
    const { data: statusData, error: statusError } = await supabase
      .from('report_status')
      .select('report_id')
      .eq('status', 'approved')

    if (statusError) {
      console.error('Error fetching report_status:', statusError)
      throw statusError
    }

    console.log('Approved report IDs:', statusData)
    const approvedIds = (statusData || []).map(s => s.report_id)

    if (approvedIds.length === 0) {
      console.log('No approved reports found in report_status')
      // Fallback: get all reports for that date regardless of status
      const { data: allReports, error: allError } = await supabase
        .from('daily_tickets')
        .select('*')
        .eq('date', reportDate)
      
      console.log('All reports for date (fallback):', allReports?.length || 0)
      return allReports || []
    }

    // Get the actual reports for that date that are approved
    const { data: reports, error: reportsError } = await supabase
      .from('daily_tickets')
      .select('*')
      .eq('date', reportDate)
      .in('id', approvedIds)

    if (reportsError) {
      console.error('Error fetching daily_tickets:', reportsError)
      throw reportsError
    }

    console.log('Approved reports for date:', reports?.length || 0)
    
    // If no approved reports for this date, try without the date filter to debug
    if (!reports || reports.length === 0) {
      console.log('No approved reports for this specific date, checking all approved...')
      const { data: allApproved } = await supabase
        .from('daily_tickets')
        .select('id, date, inspector_name')
        .in('id', approvedIds)
      console.log('All approved reports (any date):', allApproved)
    }

    return reports || []
  } catch (err) {
    console.error('Error fetching approved reports:', err)
    return []
  }
}

/**
 * Aggregate personnel/manpower from all reports
 */
export function aggregatePersonnel(reports) {
  const personnel = {
    prime_resources: 0,
    fei_subcontractors: 0,
    total_site_exposure: 0,
    decca_inspector: 0,
    env_qp: 0,
    fei_compliance: 0,
    meridian_survey: 0,
    fei_employee: 0,
    fei_ops: 0,
    ndt: 0,
    engineering: 0,
    env_inspector: 0,
    safety: 0,
    other: 0,
    // Detailed breakdown
    by_contractor: {},
    by_classification: {}
  }

  reports.forEach(report => {
    const activities = report.activity_blocks || []
    
    activities.forEach(activity => {
      const labour = activity.labour || []
      
      labour.forEach(worker => {
        const count = parseInt(worker.count) || 1
        const classification = worker.classification || 'Other'
        const contractor = activity.contractor || 'Unknown'
        
        // Total exposure (hours worked)
        const hours = (parseFloat(worker.rt) || 0) + (parseFloat(worker.ot) || 0)
        personnel.total_site_exposure += hours * count
        
        // By classification
        if (!personnel.by_classification[classification]) {
          personnel.by_classification[classification] = 0
        }
        personnel.by_classification[classification] += count
        
        // By contractor
        if (!personnel.by_contractor[contractor]) {
          personnel.by_contractor[contractor] = 0
        }
        personnel.by_contractor[contractor] += count
        
        // Categorize into EGP-style buckets
        const classLower = classification.toLowerCase()
        if (classLower.includes('inspector') && classLower.includes('env')) {
          personnel.env_inspector += count
        } else if (classLower.includes('inspector')) {
          personnel.decca_inspector += count
        } else if (classLower.includes('survey')) {
          personnel.meridian_survey += count
        } else if (classLower.includes('ndt') || classLower.includes('xray')) {
          personnel.ndt += count
        } else if (classLower.includes('safety')) {
          personnel.safety += count
        } else if (classLower.includes('engineer')) {
          personnel.engineering += count
        } else {
          personnel.prime_resources += count
        }
      })
    })
  })

  return personnel
}

/**
 * Aggregate progress by activity type (Civil vs Mechanical)
 */
export function aggregateProgressBySection(reports) {
  const sections = {}

  reports.forEach(report => {
    const activities = report.activity_blocks || []
    
    activities.forEach(activity => {
      const activityType = activity.activityType || 'Unknown'
      const startKP = activity.startKP || ''
      const endKP = activity.endKP || ''
      const metres = parseFloat(activity.metres) || 0
      
      // Determine if Civil or Mechanical
      const isMechanical = ['Welding', 'Stringing', 'Bending', 'Lowering-In', 'Coating', 'Tie-In'].some(
        t => activityType.toLowerCase().includes(t.toLowerCase())
      )
      const category = isMechanical ? 'Mechanical' : 'Civil'
      
      // Create section key from KP range
      const sectionKey = startKP && endKP ? `KP ${startKP} - ${endKP}` : activityType
      
      if (!sections[sectionKey]) {
        sections[sectionKey] = {
          section_name: sectionKey,
          kp_start: startKP,
          kp_end: endKP,
          Civil: { daily_actual_lm: 0, activities: [] },
          Mechanical: { daily_actual_lm: 0, activities: [] }
        }
      }
      
      sections[sectionKey][category].daily_actual_lm += metres
      sections[sectionKey][category].activities.push({
        type: activityType,
        metres,
        inspector: report.inspector_name
      })
    })
  })

  return Object.values(sections)
}

/**
 * Aggregate welding data by type
 */
export async function aggregateWeldingProgress(reportDate) {
  const weldTypes = {
    'GMAW/FCAW Tie-Ins': { today_lm: 0, today_welds: 0, repairs_today: 0 },
    'GMAW/FCAW Stove Piping': { today_lm: 0, today_welds: 0, repairs_today: 0 },
    'GMAW/FCAW Poorboy': { today_lm: 0, today_welds: 0, repairs_today: 0 },
    'Section Crews (Crossings)': { today_lm: 0, today_welds: 0, repairs_today: 0 }
  }

  try {
    // Fetch mainline welds for the date
    const { data: mainlineWelds } = await supabase
      .from('mainline_welds')
      .select('*')
      .eq('weld_date', reportDate)

    // Fetch tie-in welds for the date
    const { data: tieinWelds } = await supabase
      .from('tiein_welds')
      .select('*')
      .eq('weld_date', reportDate)

    // Process mainline welds
    ;(mainlineWelds || []).forEach(weld => {
      const weldProcess = weld.weld_process || 'GMAW/FCAW'
      const weldType = weld.weld_type || 'Poorboy'
      const key = `${weldProcess} ${weldType}`
      
      if (weldTypes[key]) {
        weldTypes[key].today_welds += 1
        weldTypes[key].today_lm += parseFloat(weld.pipe_length) || 12.2 // Default joint length
      } else {
        weldTypes['GMAW/FCAW Poorboy'].today_welds += 1
        weldTypes['GMAW/FCAW Poorboy'].today_lm += parseFloat(weld.pipe_length) || 12.2
      }
      
      // Count repairs
      if (weld.repair_required || weld.is_repair) {
        weldTypes[key]?.repairs_today ? weldTypes[key].repairs_today += 1 : null
      }
    })

    // Process tie-in welds
    ;(tieinWelds || []).forEach(weld => {
      weldTypes['GMAW/FCAW Tie-Ins'].today_welds += 1
      weldTypes['GMAW/FCAW Tie-Ins'].today_lm += parseFloat(weld.pipe_length) || 0
      
      if (weld.repair_required || weld.is_repair) {
        weldTypes['GMAW/FCAW Tie-Ins'].repairs_today += 1
      }
    })

    // Get previous totals from welding_progress table
    const { data: previousProgress } = await supabase
      .from('welding_progress')
      .select('*')
      .lt('report_date', reportDate)
      .order('report_date', { ascending: false })
      .limit(1)

    // Calculate totals
    const result = Object.entries(weldTypes).map(([type, data]) => {
      const prev = (previousProgress || []).find(p => p.weld_type === type) || {}
      return {
        weld_type: type,
        today_lm: data.today_lm,
        previous_lm: prev.total_to_date_lm || 0,
        today_welds: data.today_welds,
        previous_welds: prev.total_welds || 0,
        repairs_today: data.repairs_today,
        repairs_previous: prev.repairs_total || 0
      }
    })

    return result
  } catch (err) {
    console.error('Error aggregating welding progress:', err)
    return Object.entries(weldTypes).map(([type, data]) => ({
      weld_type: type,
      ...data,
      previous_lm: 0,
      previous_welds: 0,
      repairs_previous: 0
    }))
  }
}

/**
 * Calculate welding repair rate
 */
export function calculateRepairRate(weldingProgress) {
  const totalWelds = weldingProgress.reduce((sum, w) => sum + (w.today_welds + w.previous_welds), 0)
  const totalRepairs = weldingProgress.reduce((sum, w) => sum + (w.repairs_today + w.repairs_previous), 0)
  
  if (totalWelds === 0) return 0
  return ((totalRepairs / totalWelds) * 100).toFixed(1)
}

/**
 * Aggregate overall progress (Clearing, Grading, etc.)
 */
export function aggregateOverallProgress(reports, projectTotals = {}) {
  // Default project totals (can be overridden from project config)
  const defaults = {
    'Clearing': { total: 162, unit: 'ha' },
    'Grubbing': { total: 162, unit: 'ha' },
    'Grading / ROW Prep': { total: 35355, unit: 'lm' },
    'Stringing': { total: 35355, unit: 'lm' },
    'Bending': { total: 35355, unit: 'lm' },
    'Welding': { total: 35355, unit: 'lm' },
    'Coating': { total: 35355, unit: 'lm' },
    'Lowering-In': { total: 35355, unit: 'lm' },
    'Backfill & Compaction': { total: 35355, unit: 'lm' },
    'Tie-ins': { total: 35355, unit: 'lm' },
    'Trenching': { total: 35355, unit: 'lm' },
    'Crossings': { total: 120, unit: 'ea.' },
    'Machine & Final Cleanup': { total: 17761, unit: 'lm' }
  }

  const progress = {}

  // Initialize with defaults
  Object.entries({ ...defaults, ...projectTotals }).forEach(([desc, config]) => {
    progress[desc] = {
      description: desc,
      unit_of_measure: config.unit,
      total_planned: config.total,
      completed_to_date: 0
    }
  })

  // Aggregate from reports
  reports.forEach(report => {
    const activities = report.activity_blocks || []
    
    activities.forEach(activity => {
      const activityType = activity.activityType || ''
      const metres = parseFloat(activity.metres) || 0
      const hectares = parseFloat(activity.hectares) || parseFloat(activity.area) || 0
      const count = parseInt(activity.count) || 0

      // Match activity to progress category
      Object.keys(progress).forEach(key => {
        if (activityType.toLowerCase().includes(key.toLowerCase())) {
          if (progress[key].unit_of_measure === 'ha') {
            progress[key].completed_to_date += hectares
          } else if (progress[key].unit_of_measure === 'ea.') {
            progress[key].completed_to_date += count || 1
          } else {
            progress[key].completed_to_date += metres
          }
        }
      })
    })
  })

  return Object.values(progress)
}

/**
 * Extract weather data from reports
 */
export function aggregateWeather(reports) {
  // Find the most complete weather data from any report
  let weather = {
    description: '',
    temp_high_f: null,
    temp_low_f: null,
    precipitation_mm: null,
    humidity_pct: null,
    wind_speed_kmh: null
  }

  reports.forEach(report => {
    if (report.weather_conditions && !weather.description) {
      weather.description = report.weather_conditions
    }
    if (report.weather_high_temp && !weather.temp_high_f) {
      // Convert C to F if needed
      const temp = parseFloat(report.weather_high_temp)
      weather.temp_high_f = temp < 50 ? Math.round(temp * 9/5 + 32) : temp
    }
    if (report.weather_low_temp && !weather.temp_low_f) {
      const temp = parseFloat(report.weather_low_temp)
      weather.temp_low_f = temp < 50 ? Math.round(temp * 9/5 + 32) : temp
    }
    if (report.weather_precipitation) {
      weather.precipitation_mm = parseFloat(report.weather_precipitation) || 0
    }
    if (report.weather_wind_speed) {
      weather.wind_speed_kmh = parseFloat(report.weather_wind_speed) || 0
    }
  })

  return weather
}

/**
 * Extract and group photos by KP location
 */
export function aggregatePhotos(reports) {
  const photos = []

  reports.forEach(report => {
    const activities = report.activity_blocks || []
    
    activities.forEach(activity => {
      // Check for photos in the activity
      if (activity.photos && Array.isArray(activity.photos)) {
        activity.photos.forEach((photo, idx) => {
          photos.push({
            source_report_id: report.id,
            kp_location: activity.startKP || activity.endKP || '',
            location_description: `${activity.activityType} at KP ${activity.startKP || ''}`,
            photo_url: photo.url || photo,
            description: photo.description || photo.caption || `${activity.activityType}`,
            latitude: photo.latitude || activity.latitude,
            longitude: photo.longitude || activity.longitude,
            direction_deg: photo.direction || photo.heading,
            accuracy_m: photo.accuracy,
            taken_at: photo.timestamp || report.created_at
          })
        })
      }
      
      // Check for ticket photo
      if (activity.ticketPhotoUrl) {
        photos.push({
          source_report_id: report.id,
          kp_location: activity.startKP || '',
          location_description: `Contractor Ticket - ${activity.contractor || 'Unknown'}`,
          photo_url: activity.ticketPhotoUrl,
          description: `Contractor ticket for ${activity.activityType}`,
          latitude: null,
          longitude: null
        })
      }
    })
  })

  // Group by KP
  const grouped = {}
  photos.forEach(photo => {
    const kp = photo.kp_location || 'Unknown Location'
    if (!grouped[kp]) grouped[kp] = []
    grouped[kp].push(photo)
  })

  return { all: photos, byKP: grouped }
}

/**
 * Extract safety events (SWA, hazards, etc.)
 */
export function extractSafetyEvents(reports) {
  const events = {
    swa_count: 0,
    hazards: [],
    recognitions: [],
    chain_up_required: false,
    stop_work_events: []
  }

  reports.forEach(report => {
    // Check safety notes
    const safetyNotes = report.safety_notes || ''
    if (safetyNotes.toLowerCase().includes('swa') || safetyNotes.toLowerCase().includes('stop work')) {
      events.swa_count += 1
      events.stop_work_events.push({
        report_id: report.id,
        inspector: report.inspector_name,
        notes: safetyNotes
      })
    }
    
    if (safetyNotes.toLowerCase().includes('chain') && safetyNotes.toLowerCase().includes('up')) {
      events.chain_up_required = true
    }

    // Check safety recognition cards
    if (report.safety_recognition_enabled && report.safety_recognition_cards) {
      const cards = report.safety_recognition_cards || []
      cards.forEach(card => {
        if (card.type === 'hazard' || card.cardType === 'hazard') {
          events.hazards.push({
            report_id: report.id,
            ...card
          })
        } else {
          events.recognitions.push({
            report_id: report.id,
            ...card
          })
        }
      })
    }
  })

  return events
}


// =============================================
// AI NARRATIVE GENERATION
// =============================================

/**
 * Generate AI narrative for "Key Focus of the Day"
 */
export async function generateKeyFocusNarrative(reports, aggregatedData) {
  if (!anthropicApiKey) {
    console.warn('Anthropic API key not configured')
    return {
      narrative: 'API key not configured. Please add VITE_ANTHROPIC_API_KEY to generate AI narratives.',
      bullets: []
    }
  }

  // Build context from reports
  const reportSummaries = reports.map(report => {
    const activities = report.activity_blocks || []
    const activitySummary = activities.map(a => {
      return `- ${a.activityType}: ${a.contractor || 'N/A'} worked from KP ${a.startKP || 'N/A'} to KP ${a.endKP || 'N/A'}, ${a.metres || 0} metres. ${a.qualityChecks?.comments || ''}`
    }).join('\n')
    
    return `
Inspector: ${report.inspector_name}
Spread: ${report.spread || 'N/A'}
Activities:
${activitySummary}
General Comments: ${report.general_comments || 'None'}
Safety Notes: ${report.safety_notes || 'None'}
`
  }).join('\n---\n')

  const prompt = `You are a Chief Pipeline Inspector writing the "Key Focus of the Day" section for a Daily Construction Summary Report on the Eagle Mountain - Woodfibre Gas Pipeline Project.

Based on the following inspector reports from today, write:
1. A brief narrative summary (2-3 sentences) of the overall day's activities
2. 6-10 bullet points highlighting specific key activities, using the exact format seen in professional construction daily reports

FORMAT FOR BULLETS:
- Use "<" before each bullet point
- Include specific KP/KM locations
- Include specific equipment and crew actions
- Be concise but specific

INSPECTOR REPORTS:
${reportSummaries}

AGGREGATED DATA:
- Total Personnel: ${aggregatedData.personnel?.total_site_exposure || 0} exposure hours
- Welding Progress Today: ${aggregatedData.welding?.reduce((sum, w) => sum + w.today_welds, 0) || 0} welds
- Safety Events: ${aggregatedData.safety?.swa_count || 0} SWA events

Respond in JSON format:
{
  "narrative": "Brief 2-3 sentence summary",
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
    
    // Parse JSON response
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    
    return {
      narrative: parsed.narrative || '',
      bullets: parsed.bullets || []
    }
  } catch (err) {
    console.error('Error generating AI narrative:', err)
    return {
      narrative: 'Error generating narrative. Please review reports manually.',
      bullets: []
    }
  }
}

/**
 * Generate safety status section
 */
export async function generateSafetyStatus(safetyEvents, weather) {
  if (!anthropicApiKey) {
    return {
      status: 'Safety status requires API key configuration.',
      bullets: []
    }
  }

  const prompt = `You are writing the "Safety Status" section for a pipeline construction daily report.

Safety Events Today:
- SWA (Stop Work Authority) Events: ${safetyEvents.swa_count}
- Hazards Identified: ${safetyEvents.hazards.length}
- Safety Recognitions: ${safetyEvents.recognitions.length}
- Chain-Up Required: ${safetyEvents.chain_up_required ? 'Yes' : 'No'}

Weather Conditions:
- Temperature: ${weather.temp_high_f || 'N/A'}°F high / ${weather.temp_low_f || 'N/A'}°F low
- Precipitation: ${weather.precipitation_mm || 0}mm
- Wind: ${weather.wind_speed_kmh || 0} km/h

Current Season: Winter (January) - Avalanche season runs November to April.

Generate 2-4 safety status bullet points appropriate for the conditions. Include avalanche safety reminders if applicable.

Respond in JSON format:
{
  "status": "Brief overall safety status",
  "bullets": ["< First bullet", "< Second bullet"]
}

Only output valid JSON.`

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
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    
    return {
      status: parsed.status || '',
      bullets: parsed.bullets || []
    }
  } catch (err) {
    console.error('Error generating safety status:', err)
    return {
      status: 'Review safety events manually.',
      bullets: []
    }
  }
}


// =============================================
// SAVE/PUBLISH FUNCTIONS
// =============================================

/**
 * Save or update daily construction summary
 */
export async function saveDailySummary(summaryData) {
  try {
    const { data: existing } = await supabase
      .from('daily_construction_summary')
      .select('id')
      .eq('report_date', summaryData.report_date)
      .single()

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('daily_construction_summary')
        .update({
          ...summaryData,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      return { success: true, data, isNew: false }
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('daily_construction_summary')
        .insert(summaryData)
        .select()
        .single()

      if (error) throw error
      return { success: true, data, isNew: true }
    }
  } catch (err) {
    console.error('Error saving daily summary:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Save section progress data
 */
export async function saveSectionProgress(summaryId, reportDate, sections) {
  try {
    // Delete existing for this date
    await supabase
      .from('section_progress')
      .delete()
      .eq('progress_date', reportDate)

    // Insert new data
    const records = []
    sections.forEach(section => {
      ['Civil', 'Mechanical'].forEach(activityType => {
        if (section[activityType]?.daily_actual_lm > 0) {
          records.push({
            summary_id: summaryId,
            progress_date: reportDate,
            section_name: section.section_name,
            kp_start: section.kp_start,
            kp_end: section.kp_end,
            activity_type: activityType,
            daily_actual_lm: section[activityType].daily_actual_lm
          })
        }
      })
    })

    if (records.length > 0) {
      const { error } = await supabase
        .from('section_progress')
        .insert(records)
      
      if (error) throw error
    }

    return { success: true }
  } catch (err) {
    console.error('Error saving section progress:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Save welding progress data
 */
export async function saveWeldingProgress(summaryId, reportDate, weldingData) {
  try {
    // Delete existing for this date
    await supabase
      .from('welding_progress')
      .delete()
      .eq('progress_date', reportDate)

    // Insert new data
    const records = weldingData.map(w => ({
      summary_id: summaryId,
      progress_date: reportDate,
      weld_type: w.weld_type,
      today_lm: w.today_lm,
      previous_lm: w.previous_lm,
      today_welds: w.today_welds,
      previous_welds: w.previous_welds,
      repairs_today: w.repairs_today,
      repairs_previous: w.repairs_previous
    }))

    if (records.length > 0) {
      const { error } = await supabase
        .from('welding_progress')
        .insert(records)
      
      if (error) throw error
    }

    return { success: true }
  } catch (err) {
    console.error('Error saving welding progress:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Save report photos
 */
export async function saveReportPhotos(summaryId, reportDate, photos) {
  try {
    // Delete existing for this date
    await supabase
      .from('report_photos')
      .delete()
      .eq('photo_date', reportDate)

    // Insert new photos
    const records = photos.map((photo, idx) => ({
      summary_id: summaryId,
      photo_date: reportDate,
      source_report_id: photo.source_report_id,
      kp_location: photo.kp_location,
      location_description: photo.location_description,
      photo_url: photo.photo_url,
      description: photo.description,
      latitude: photo.latitude,
      longitude: photo.longitude,
      direction_deg: photo.direction_deg,
      accuracy_m: photo.accuracy_m,
      taken_at: photo.taken_at,
      sort_order: idx
    }))

    if (records.length > 0) {
      const { error } = await supabase
        .from('report_photos')
        .insert(records)
      
      if (error) throw error
    }

    return { success: true }
  } catch (err) {
    console.error('Error saving report photos:', err)
    return { success: false, error: err.message }
  }
}


// =============================================
// FETCH EXISTING SUMMARY
// =============================================

/**
 * Fetch existing daily summary with all related data
 */
export async function fetchDailySummary(reportDate) {
  try {
    const { data: summary, error: summaryError } = await supabase
      .from('daily_construction_summary')
      .select('*')
      .eq('report_date', reportDate)
      .single()

    if (summaryError && summaryError.code !== 'PGRST116') throw summaryError
    if (!summary) return null

    // Fetch related data
    const [sectionProgress, weldingProgress, overallProgress, photos] = await Promise.all([
      supabase.from('section_progress').select('*').eq('summary_id', summary.id),
      supabase.from('welding_progress').select('*').eq('summary_id', summary.id),
      supabase.from('overall_progress').select('*').eq('summary_id', summary.id),
      supabase.from('report_photos').select('*').eq('summary_id', summary.id).order('sort_order')
    ])

    return {
      ...summary,
      section_progress: sectionProgress.data || [],
      welding_progress: weldingProgress.data || [],
      overall_progress: overallProgress.data || [],
      photos: photos.data || []
    }
  } catch (err) {
    console.error('Error fetching daily summary:', err)
    return null
  }
}


export default {
  fetchApprovedReportsForDate,
  aggregatePersonnel,
  aggregateProgressBySection,
  aggregateWeldingProgress,
  calculateRepairRate,
  aggregateOverallProgress,
  aggregateWeather,
  aggregatePhotos,
  extractSafetyEvents,
  generateKeyFocusNarrative,
  generateSafetyStatus,
  saveDailySummary,
  saveSectionProgress,
  saveWeldingProgress,
  saveReportPhotos,
  fetchDailySummary
}
