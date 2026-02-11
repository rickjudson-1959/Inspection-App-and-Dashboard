// ============================================================================
// PIPE-UP DATA EXPORT API - Power BI & SAP Ready
// February 11, 2026
// Provides structured data export for owner reporting systems
// Supports JSON (Power BI) and CSV (SAP/Project Controls) formats
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================================
// DATA STRUCTURES - SAP Compatible Field Names
// ============================================================================

interface ProgressRecord {
  // SAP-compatible field names (WBS-style)
  PROJECT_ID: string
  REPORT_DATE: string
  ACTIVITY_TYPE: string
  ACTIVITY_CODE: string  // SAP activity code mapping
  START_KP: string
  END_KP: string
  LENGTH_M: number
  SPREAD: string
  CONTRACTOR: string
  STATUS: string
  WEATHER_CONDITION: string
  CREW_SIZE: number
  EQUIPMENT_HOURS: number
  LABOUR_HOURS: number
  EFFICIENCY_PERCENT: number
  COMMENTS: string
}

interface WeldingRecord {
  PROJECT_ID: string
  REPORT_DATE: string
  WELD_ID: string
  WELD_TYPE: string  // Mainline, Tie-in, Repair
  WPS_NUMBER: string
  WELDER_ID: string
  PIPE_DIAMETER: string
  WALL_THICKNESS: string
  MATERIAL_GRADE: string
  KP_LOCATION: string
  STATUS: string  // Complete, In Progress, Repair
  NDT_STATUS: string
  VISUAL_RESULT: string
  RT_RESULT: string
  UT_RESULT: string
}

interface CostRecord {
  PROJECT_ID: string
  REPORT_DATE: string
  COST_CODE: string
  COST_CATEGORY: string  // Labour, Equipment, Materials
  DESCRIPTION: string
  QUANTITY: number
  UNIT: string
  UNIT_RATE: number
  TOTAL_COST: number
  CONTRACTOR: string
  SPREAD: string
}

interface EVMRecord {
  PROJECT_ID: string
  REPORT_DATE: string
  WBS_ELEMENT: string
  ACTIVITY_TYPE: string
  PLANNED_VALUE: number
  EARNED_VALUE: number
  ACTUAL_COST: number
  SPI: number  // Schedule Performance Index
  CPI: number  // Cost Performance Index
  VARIANCE: number
  PERCENT_COMPLETE: number
}

// ============================================================================
// ACTIVITY CODE MAPPING (for SAP WBS compatibility)
// ============================================================================

const ACTIVITY_CODES: Record<string, string> = {
  'Access': 'ACC-100',
  'Clearing': 'CLR-200',
  'Grading': 'GRD-300',
  'Topsoil': 'TOP-350',
  'Stringing': 'STR-400',
  'Bending': 'BND-450',
  'Welding - Mainline': 'WLD-500',
  'Welding - Section Crew': 'WLD-510',
  'Welding - Poor Boy': 'WLD-520',
  'Welding - Tie-in': 'WLD-530',
  'Coating': 'COT-600',
  'Ditch': 'DTH-700',
  'Lower-in': 'LOW-800',
  'Backfill': 'BKF-900',
  'Tie-in Completion': 'TIE-950',
  'Cleanup - Machine': 'CLN-1000',
  'Cleanup - Final': 'CLN-1100',
  'Hydrostatic Testing': 'HYD-1200',
  'HDD': 'HDD-1300',
  'Piling': 'PIL-1400',
  'Welder Testing': 'WTT-1500',
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getActivityCode(activityType: string): string {
  return ACTIVITY_CODES[activityType] || `OTH-${activityType.substring(0, 3).toUpperCase()}`
}

function parseKP(kp: string): number {
  if (!kp) return 0
  const parts = kp.split('+')
  return parseFloat(parts[0]) + (parseFloat(parts[1] || '0') / 1000)
}

function calculateLength(startKP: string, endKP: string): number {
  const start = parseKP(startKP)
  const end = parseKP(endKP)
  return Math.abs(end - start) * 1000  // Return in metres
}

function toCSV(data: any[], headers: string[]): string {
  const headerRow = headers.join(',')
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h]
      if (val === null || val === undefined) return ''
      if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    }).join(',')
  )
  return [headerRow, ...rows].join('\n')
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const organizationId = url.searchParams.get('organization_id')
    const dataType = url.searchParams.get('type') || 'progress'  // progress, welding, cost, evm, all
    const format = url.searchParams.get('format') || 'json'  // json or csv
    const startDate = url.searchParams.get('start_date')
    const endDate = url.searchParams.get('end_date')
    const apiKey = url.searchParams.get('api_key')  // Optional API key for external access

    // Validate required params
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: 'organization_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // Build date filter
    const dateFilter = {
      start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end: endDate || new Date().toISOString().split('T')[0]
    }

    // Get organization info
    const { data: org } = await supabase
      .from('organizations')
      .select('name, slug')
      .eq('id', organizationId)
      .single()

    const projectId = org?.slug?.toUpperCase() || 'PROJECT'

    // Fetch data based on type
    let responseData: any = {}

    // ========== PROGRESS DATA ==========
    if (dataType === 'progress' || dataType === 'all') {
      const { data: reports } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('report_date', dateFilter.start)
        .lte('report_date', dateFilter.end)
        .order('report_date', { ascending: true })

      const progressRecords: ProgressRecord[] = []

      for (const report of reports || []) {
        const blocks = report.activity_blocks || []
        for (const block of blocks) {
          // Calculate labour hours
          const labourHours = (block.labour || []).reduce((sum: number, l: any) => {
            return sum + (parseFloat(l.rt || 0) + parseFloat(l.ot || 0)) * (parseInt(l.count || 1))
          }, 0)

          // Calculate equipment hours
          const equipmentHours = (block.equipment || []).reduce((sum: number, e: any) => {
            return sum + parseFloat(e.hours || 0) * (parseInt(e.count || 1))
          }, 0)

          // Calculate crew size
          const crewSize = (block.labour || []).reduce((sum: number, l: any) => {
            return sum + parseInt(l.count || 1)
          }, 0)

          progressRecords.push({
            PROJECT_ID: projectId,
            REPORT_DATE: report.report_date,
            ACTIVITY_TYPE: block.activityType || '',
            ACTIVITY_CODE: getActivityCode(block.activityType || ''),
            START_KP: block.startKP || '',
            END_KP: block.endKP || '',
            LENGTH_M: calculateLength(block.startKP, block.endKP),
            SPREAD: report.spread || '',
            CONTRACTOR: block.contractor || '',
            STATUS: report.status || 'submitted',
            WEATHER_CONDITION: report.weather || '',
            CREW_SIZE: crewSize,
            EQUIPMENT_HOURS: equipmentHours,
            LABOUR_HOURS: labourHours,
            EFFICIENCY_PERCENT: block.efficiencyScore || 100,
            COMMENTS: block.comments || ''
          })
        }
      }

      responseData.progress = progressRecords
    }

    // ========== WELDING DATA ==========
    if (dataType === 'welding' || dataType === 'all') {
      const { data: reports } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('report_date', dateFilter.start)
        .lte('report_date', dateFilter.end)

      const weldingRecords: WeldingRecord[] = []

      for (const report of reports || []) {
        const blocks = report.activity_blocks || []
        for (const block of blocks) {
          // Check for welding activities
          const activityType = (block.activityType || '').toLowerCase()
          if (!activityType.startsWith('welding') && !activityType.includes('mainline welding') && !activityType.includes('welder testing')) {
            continue
          }

          // Get weld entries from weldData or mainlineWeldData
          const weldEntries = block.weldData?.weldEntries || block.mainlineWeldData?.weldEntries || []

          for (const weld of weldEntries) {
            weldingRecords.push({
              PROJECT_ID: projectId,
              REPORT_DATE: report.report_date,
              WELD_ID: weld.weldNumber || weld.weldId || '',
              WELD_TYPE: activityType.includes('tie-in') ? 'Tie-in' :
                        activityType.includes('repair') ? 'Repair' : 'Mainline',
              WPS_NUMBER: weld.wpsNumber || weld.wps || '',
              WELDER_ID: weld.welderId || weld.welder || '',
              PIPE_DIAMETER: weld.pipeDiameter || weld.diameter || '',
              WALL_THICKNESS: weld.wallThickness || '',
              MATERIAL_GRADE: weld.pipeGrade || weld.materialGrade || '',
              KP_LOCATION: block.startKP || '',
              STATUS: weld.status || 'Complete',
              NDT_STATUS: weld.ndtStatus || 'Pending',
              VISUAL_RESULT: weld.visualResult || weld.vt || '',
              RT_RESULT: weld.rtResult || weld.rt || '',
              UT_RESULT: weld.utResult || weld.ut || ''
            })
          }
        }
      }

      responseData.welding = weldingRecords
    }

    // ========== COST DATA (Labour & Equipment) ==========
    if (dataType === 'cost' || dataType === 'all') {
      const { data: reports } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('report_date', dateFilter.start)
        .lte('report_date', dateFilter.end)

      const costRecords: CostRecord[] = []

      for (const report of reports || []) {
        const blocks = report.activity_blocks || []
        for (const block of blocks) {
          // Labour costs
          for (const labour of block.labour || []) {
            const hours = (parseFloat(labour.rt || 0) + parseFloat(labour.ot || 0)) * parseInt(labour.count || 1)
            costRecords.push({
              PROJECT_ID: projectId,
              REPORT_DATE: report.report_date,
              COST_CODE: `LAB-${getActivityCode(block.activityType || '')}`,
              COST_CATEGORY: 'Labour',
              DESCRIPTION: `${labour.classification || 'Labour'} - ${block.activityType || 'Activity'}`,
              QUANTITY: hours,
              UNIT: 'Hours',
              UNIT_RATE: 0,  // Rate would come from rate cards
              TOTAL_COST: 0,  // Calculated externally
              CONTRACTOR: block.contractor || '',
              SPREAD: report.spread || ''
            })
          }

          // Equipment costs
          for (const equip of block.equipment || []) {
            const hours = parseFloat(equip.hours || 0) * parseInt(equip.count || 1)
            costRecords.push({
              PROJECT_ID: projectId,
              REPORT_DATE: report.report_date,
              COST_CODE: `EQP-${getActivityCode(block.activityType || '')}`,
              COST_CATEGORY: 'Equipment',
              DESCRIPTION: `${equip.type || 'Equipment'} - ${block.activityType || 'Activity'}`,
              QUANTITY: hours,
              UNIT: 'Hours',
              UNIT_RATE: 0,
              TOTAL_COST: 0,
              CONTRACTOR: block.contractor || '',
              SPREAD: report.spread || ''
            })
          }
        }
      }

      responseData.cost = costRecords
    }

    // ========== EVM DATA ==========
    if (dataType === 'evm' || dataType === 'all') {
      // Get baseline data if available
      const { data: baseline } = await supabase
        .from('project_baselines')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .single()

      const { data: reports } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('report_date', dateFilter.start)
        .lte('report_date', dateFilter.end)

      // Aggregate by activity type and date
      const evmByActivity: Record<string, EVMRecord> = {}

      for (const report of reports || []) {
        const blocks = report.activity_blocks || []
        for (const block of blocks) {
          const key = `${report.report_date}-${block.activityType}`
          const length = calculateLength(block.startKP, block.endKP)

          if (!evmByActivity[key]) {
            evmByActivity[key] = {
              PROJECT_ID: projectId,
              REPORT_DATE: report.report_date,
              WBS_ELEMENT: getActivityCode(block.activityType || ''),
              ACTIVITY_TYPE: block.activityType || '',
              PLANNED_VALUE: 0,
              EARNED_VALUE: length,  // Using metres as earned value proxy
              ACTUAL_COST: 0,
              SPI: 0,
              CPI: 0,
              VARIANCE: 0,
              PERCENT_COMPLETE: 0
            }
          } else {
            evmByActivity[key].EARNED_VALUE += length
          }
        }
      }

      responseData.evm = Object.values(evmByActivity)
    }

    // ========== METADATA ==========
    responseData.metadata = {
      organization_id: organizationId,
      organization_name: org?.name || 'Unknown',
      export_timestamp: new Date().toISOString(),
      date_range: dateFilter,
      record_counts: {
        progress: responseData.progress?.length || 0,
        welding: responseData.welding?.length || 0,
        cost: responseData.cost?.length || 0,
        evm: responseData.evm?.length || 0
      }
    }

    // ========== FORMAT RESPONSE ==========
    if (format === 'csv') {
      // Return CSV - pick the main data type
      let csvData = ''
      let filename = 'export.csv'

      if (dataType === 'progress' || dataType === 'all') {
        const headers = ['PROJECT_ID', 'REPORT_DATE', 'ACTIVITY_TYPE', 'ACTIVITY_CODE', 'START_KP', 'END_KP', 'LENGTH_M', 'SPREAD', 'CONTRACTOR', 'STATUS', 'WEATHER_CONDITION', 'CREW_SIZE', 'EQUIPMENT_HOURS', 'LABOUR_HOURS', 'EFFICIENCY_PERCENT', 'COMMENTS']
        csvData = toCSV(responseData.progress || [], headers)
        filename = `progress_${dateFilter.start}_${dateFilter.end}.csv`
      } else if (dataType === 'welding') {
        const headers = ['PROJECT_ID', 'REPORT_DATE', 'WELD_ID', 'WELD_TYPE', 'WPS_NUMBER', 'WELDER_ID', 'PIPE_DIAMETER', 'WALL_THICKNESS', 'MATERIAL_GRADE', 'KP_LOCATION', 'STATUS', 'NDT_STATUS', 'VISUAL_RESULT', 'RT_RESULT', 'UT_RESULT']
        csvData = toCSV(responseData.welding || [], headers)
        filename = `welding_${dateFilter.start}_${dateFilter.end}.csv`
      } else if (dataType === 'cost') {
        const headers = ['PROJECT_ID', 'REPORT_DATE', 'COST_CODE', 'COST_CATEGORY', 'DESCRIPTION', 'QUANTITY', 'UNIT', 'UNIT_RATE', 'TOTAL_COST', 'CONTRACTOR', 'SPREAD']
        csvData = toCSV(responseData.cost || [], headers)
        filename = `cost_${dateFilter.start}_${dateFilter.end}.csv`
      } else if (dataType === 'evm') {
        const headers = ['PROJECT_ID', 'REPORT_DATE', 'WBS_ELEMENT', 'ACTIVITY_TYPE', 'PLANNED_VALUE', 'EARNED_VALUE', 'ACTUAL_COST', 'SPI', 'CPI', 'VARIANCE', 'PERCENT_COMPLETE']
        csvData = toCSV(responseData.evm || [], headers)
        filename = `evm_${dateFilter.start}_${dateFilter.end}.csv`
      }

      return new Response(csvData, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      })
    }

    // Default: JSON response for Power BI
    return new Response(
      JSON.stringify(responseData, null, 2),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )

  } catch (error) {
    console.error('Export error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
