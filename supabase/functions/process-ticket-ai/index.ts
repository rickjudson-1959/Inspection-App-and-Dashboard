// ============================================================================
// PIPE-UP AI AGENT - TICKET ANALYSIS EDGE FUNCTION
// February 1, 2026
// Analyzes daily_tickets against contract_config rules and flags anomalies
// Now includes RAG-based document retrieval for spec compliance validation
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Flag types for watcher analysis
type FlagType =
  | 'HOURS_EXCEEDED'
  | 'KP_OUT_OF_BOUNDS'
  | 'LOW_EFFICIENCY'
  | 'CHAINAGE_GAP'
  | 'LABOUR_ANOMALY'
  | 'EQUIPMENT_MISMATCH'
  | 'WPS_MATERIAL_MISMATCH'
  | 'MANAGEMENT_DRAG_SPIKE'
  | 'SPEC_VIOLATION'           // RAG-based spec violations
  | 'COATING_VIOLATION'        // Coating thickness out of spec
  | 'PROCEDURE_VIOLATION'      // Procedure not followed per docs

type Severity = 'critical' | 'warning' | 'info'

// RAG Document Match interface
interface DocumentMatch {
  id: string
  document_name: string
  document_category: string
  chunk_text: string
  similarity: number
}

interface AnalysisFlag {
  type: FlagType
  severity: Severity
  ticket_id: string
  ticket_date?: string
  activity_block_index?: number
  activity_type?: string
  contractor?: string
  message: string
  details: Record<string, unknown>
}

interface ContractConfig {
  standard_workday: number
  start_kp: string
  end_kp: string
  contract_number?: string
  default_diameter?: string
}

interface AnalysisResult {
  flags: AnalysisFlag[]
  summary: string | null
  metrics: {
    tickets_analyzed: number
    flags_raised: number
    efficiency_score: number
    critical_count: number
    warning_count: number
    info_count: number
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  // Initialize Supabase client with service role
  const supabase = createClient(
    SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  try {
    const body = await req.json()
    const {
      ticket_ids,           // Optional: specific ticket UUIDs to analyze
      organization_id,      // Required: for multi-tenant filtering
      trigger_source = 'manual',  // 'webhook' | 'cron' | 'manual'
      date = null           // Optional: specific date to analyze (defaults to today)
    } = body

    if (!organization_id) {
      throw new Error('organization_id is required')
    }

    console.log(`[AI Agent] Starting analysis for org: ${organization_id}, trigger: ${trigger_source}`)

    // =========================================================================
    // 1. FETCH CONTRACT CONFIG FOR VALIDATION RULES
    // =========================================================================
    const { data: config, error: configError } = await supabase
      .from('contract_config')
      .select('*')
      .eq('organization_id', organization_id)
      .single()

    if (configError && configError.code !== 'PGRST116') {
      console.error('[AI Agent] Config fetch error:', configError)
    }

    // Default config values if not set
    const contractConfig: ContractConfig = {
      standard_workday: config?.standard_workday || 10,
      start_kp: config?.start_kp || '0+000',
      end_kp: config?.end_kp || '999+999',
      contract_number: config?.contract_number,
      default_diameter: config?.default_diameter
    }

    console.log(`[AI Agent] Config loaded: workday=${contractConfig.standard_workday}h, KP range=${contractConfig.start_kp} to ${contractConfig.end_kp}`)

    // =========================================================================
    // 2. FETCH DAILY TICKETS TO ANALYZE
    // =========================================================================
    let ticketsQuery = supabase
      .from('daily_tickets')
      .select('*')
      .eq('organization_id', organization_id)
      .order('date', { ascending: false })

    if (ticket_ids && ticket_ids.length > 0) {
      // Analyze specific tickets
      ticketsQuery = ticketsQuery.in('id', ticket_ids)
    } else if (date) {
      // Analyze specific date
      ticketsQuery = ticketsQuery.eq('date', date)
    } else {
      // Default: analyze today's tickets
      const today = new Date().toISOString().split('T')[0]
      ticketsQuery = ticketsQuery.eq('date', today)
    }

    const { data: tickets, error: ticketsError } = await ticketsQuery

    if (ticketsError) {
      throw new Error(`Failed to fetch tickets: ${ticketsError.message}`)
    }

    if (!tickets || tickets.length === 0) {
      console.log('[AI Agent] No tickets to analyze')

      // Log empty analysis
      await logAnalysis(supabase, {
        organization_id,
        trigger_source,
        ticket_ids: [],
        result: {
          flags: [],
          summary: 'No tickets found for analysis.',
          metrics: {
            tickets_analyzed: 0,
            flags_raised: 0,
            efficiency_score: 100,
            critical_count: 0,
            warning_count: 0,
            info_count: 0
          }
        },
        processing_ms: Date.now() - startTime,
        status: 'completed'
      })

      return new Response(
        JSON.stringify({
          success: true,
          message: 'No tickets to analyze',
          flags: [],
          tickets_analyzed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[AI Agent] Analyzing ${tickets.length} tickets`)

    // =========================================================================
    // 2.5 FETCH WPS MATERIAL SPECS FOR VALIDATION
    // =========================================================================
    const { data: wpsSpecs } = await supabase
      .from('wps_material_specs')
      .select('wps_number, allowed_base_materials, allowed_filler_materials, wps_name')
      .eq('organization_id', organization_id)
      .eq('is_active', true)

    // Build WPS lookup map for fast validation
    const wpsLookup: Record<string, { allowedMaterials: string[], allowedFillers: string[], name: string }> = {}
    for (const spec of (wpsSpecs || [])) {
      wpsLookup[spec.wps_number.toUpperCase()] = {
        allowedMaterials: (spec.allowed_base_materials || []).map((m: string) => m.toUpperCase()),
        allowedFillers: (spec.allowed_filler_materials || []).map((m: string) => m.toUpperCase()),
        name: spec.wps_name || spec.wps_number
      }
    }

    console.log(`[AI Agent] Loaded ${Object.keys(wpsLookup).length} WPS specifications for validation`)

    // =========================================================================
    // 3. RUN ANALYSIS ON EACH TICKET (Rule-based)
    // =========================================================================
    const allFlags: AnalysisFlag[] = []
    let totalBilledHours = 0
    let totalShadowHours = 0

    for (const ticket of tickets) {
      const ticketFlags = analyzeTicket(ticket, contractConfig, wpsLookup)
      allFlags.push(...ticketFlags)

      // Calculate efficiency metrics
      const { billed, shadow } = calculateTicketEfficiency(ticket)
      totalBilledHours += billed
      totalShadowHours += shadow
    }

    const overallEfficiency = totalBilledHours > 0
      ? (totalShadowHours / totalBilledHours) * 100
      : 100

    console.log(`[AI Agent] Rule-based analysis complete: ${allFlags.length} flags raised, efficiency: ${overallEfficiency.toFixed(1)}%`)

    // =========================================================================
    // 3.5 RUN RAG-BASED SPEC COMPLIANCE ANALYSIS
    // Searches document_embeddings for project specs and validates ticket values
    // =========================================================================
    if (OPENAI_API_KEY) {
      console.log('[AI Agent] Starting RAG-based spec compliance analysis...')

      for (const ticket of tickets) {
        try {
          const ragFlags = await analyzeWithRAG(supabase, ticket, organization_id)
          allFlags.push(...ragFlags)
        } catch (ragErr) {
          console.error(`[AI Agent] RAG analysis error for ticket ${ticket.id}:`, ragErr)
        }
      }

      const specViolations = allFlags.filter(f =>
        ['SPEC_VIOLATION', 'COATING_VIOLATION', 'PROCEDURE_VIOLATION'].includes(f.type)
      ).length

      console.log(`[AI Agent] RAG analysis complete: ${specViolations} spec violations found`)
    } else {
      console.log('[AI Agent] Skipping RAG analysis - OPENAI_API_KEY not configured')
    }

    console.log(`[AI Agent] Total analysis complete: ${allFlags.length} flags raised`)

    // =========================================================================
    // 4. GENERATE AI SUMMARY (if flags found)
    // =========================================================================
    let aiSummary: string | null = null
    let tokensInput = 0
    let tokensOutput = 0

    if (allFlags.length > 0 && ANTHROPIC_API_KEY) {
      console.log('[AI Agent] Generating AI summary...')

      const summaryResult = await generateAISummary(allFlags, tickets, contractConfig)
      aiSummary = summaryResult.summary
      tokensInput = summaryResult.tokensInput
      tokensOutput = summaryResult.tokensOutput

      console.log(`[AI Agent] AI summary generated (${tokensInput + tokensOutput} tokens)`)
    } else if (allFlags.length === 0) {
      aiSummary = `All ${tickets.length} ticket(s) passed validation. No anomalies detected.`
    }

    // =========================================================================
    // 5. BUILD RESULT AND LOG TO DATABASE
    // =========================================================================
    const result: AnalysisResult = {
      flags: allFlags,
      summary: aiSummary,
      metrics: {
        tickets_analyzed: tickets.length,
        flags_raised: allFlags.length,
        efficiency_score: Math.round(overallEfficiency * 10) / 10,
        critical_count: allFlags.filter(f => f.severity === 'critical').length,
        warning_count: allFlags.filter(f => f.severity === 'warning').length,
        info_count: allFlags.filter(f => f.severity === 'info').length
      }
    }

    const processingMs = Date.now() - startTime

    // Log to ai_agent_logs
    await logAnalysis(supabase, {
      organization_id,
      trigger_source,
      ticket_ids: tickets.map((t: { id: string }) => t.id),
      date_range_start: tickets[tickets.length - 1]?.date,
      date_range_end: tickets[0]?.date,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      result,
      processing_ms: processingMs,
      status: 'completed'
    })

    console.log(`[AI Agent] Analysis logged. Processing time: ${processingMs}ms`)

    // =========================================================================
    // 6. RETURN RESPONSE
    // =========================================================================
    return new Response(
      JSON.stringify({
        success: true,
        tickets_analyzed: tickets.length,
        flags: allFlags,
        summary: aiSummary,
        metrics: result.metrics,
        processing_ms: processingMs
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[AI Agent] Error:', error)

    // Log failed analysis
    try {
      const body = await req.clone().json().catch(() => ({}))
      await logAnalysis(supabase, {
        organization_id: body.organization_id,
        trigger_source: body.trigger_source || 'manual',
        ticket_ids: [],
        result: { flags: [], summary: null, metrics: { tickets_analyzed: 0, flags_raised: 0, efficiency_score: 0, critical_count: 0, warning_count: 0, info_count: 0 } },
        processing_ms: Date.now() - startTime,
        status: 'failed',
        error_message: error.message
      })
    } catch (logError) {
      console.error('[AI Agent] Failed to log error:', logError)
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})


// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

// WPS lookup type
interface WPSLookup {
  [key: string]: {
    allowedMaterials: string[]
    allowedFillers: string[]
    name: string
  }
}

/**
 * Analyze a single ticket against contract config rules
 */
function analyzeTicket(
  ticket: any,
  config: ContractConfig,
  wpsLookup: WPSLookup = {}
): AnalysisFlag[] {
  const flags: AnalysisFlag[] = []
  const blocks = ticket.activity_blocks || []

  const standardWorkday = config.standard_workday
  const startKPMeters = parseKP(config.start_kp)
  const endKPMeters = parseKP(config.end_kp)

  blocks.forEach((block: any, index: number) => {
    // -------------------------------------------------------------------------
    // CHECK 1: HOURS_EXCEEDED
    // Flag if average hours per worker exceeds standard workday
    // -------------------------------------------------------------------------
    const { avgHoursPerWorker, totalHours, workerCount } = calculateBlockHours(block)

    if (avgHoursPerWorker > standardWorkday * 1.5) {
      // Critical: More than 150% of workday
      flags.push({
        type: 'HOURS_EXCEEDED',
        severity: 'critical',
        ticket_id: ticket.id,
        ticket_date: ticket.date,
        activity_block_index: index,
        activity_type: block.activityType,
        contractor: block.contractor,
        message: `Critical: Average hours (${avgHoursPerWorker.toFixed(1)}h) exceeds 150% of standard workday (${standardWorkday}h)`,
        details: {
          avg_hours: avgHoursPerWorker,
          total_hours: totalHours,
          worker_count: workerCount,
          standard_workday: standardWorkday,
          threshold: '150%'
        }
      })
    } else if (avgHoursPerWorker > standardWorkday * 1.2) {
      // Warning: More than 120% of workday
      flags.push({
        type: 'HOURS_EXCEEDED',
        severity: 'warning',
        ticket_id: ticket.id,
        ticket_date: ticket.date,
        activity_block_index: index,
        activity_type: block.activityType,
        contractor: block.contractor,
        message: `Warning: Average hours (${avgHoursPerWorker.toFixed(1)}h) exceeds 120% of standard workday (${standardWorkday}h)`,
        details: {
          avg_hours: avgHoursPerWorker,
          total_hours: totalHours,
          worker_count: workerCount,
          standard_workday: standardWorkday,
          threshold: '120%'
        }
      })
    }

    // -------------------------------------------------------------------------
    // CHECK 2: KP_OUT_OF_BOUNDS
    // Flag if activity KP is outside project boundaries
    // -------------------------------------------------------------------------
    const blockStartKP = parseKP(block.startKP)
    const blockEndKP = parseKP(block.endKP)

    if (blockStartKP !== null && startKPMeters !== null && endKPMeters !== null) {
      if (blockStartKP < startKPMeters || blockStartKP > endKPMeters) {
        flags.push({
          type: 'KP_OUT_OF_BOUNDS',
          severity: 'critical',
          ticket_id: ticket.id,
          ticket_date: ticket.date,
          activity_block_index: index,
          activity_type: block.activityType,
          contractor: block.contractor,
          message: `Critical: Start KP (${block.startKP}) is outside project boundaries (${config.start_kp} to ${config.end_kp})`,
          details: {
            reported_start_kp: block.startKP,
            reported_end_kp: block.endKP,
            project_start_kp: config.start_kp,
            project_end_kp: config.end_kp
          }
        })
      }
    }

    if (blockEndKP !== null && startKPMeters !== null && endKPMeters !== null) {
      if (blockEndKP < startKPMeters || blockEndKP > endKPMeters) {
        flags.push({
          type: 'KP_OUT_OF_BOUNDS',
          severity: 'critical',
          ticket_id: ticket.id,
          ticket_date: ticket.date,
          activity_block_index: index,
          activity_type: block.activityType,
          contractor: block.contractor,
          message: `Critical: End KP (${block.endKP}) is outside project boundaries (${config.start_kp} to ${config.end_kp})`,
          details: {
            reported_start_kp: block.startKP,
            reported_end_kp: block.endKP,
            project_start_kp: config.start_kp,
            project_end_kp: config.end_kp
          }
        })
      }
    }

    // -------------------------------------------------------------------------
    // CHECK 3: LOW_EFFICIENCY
    // Flag if shadow hours / billed hours < 70%
    // -------------------------------------------------------------------------
    const { efficiency, billed, shadow, hasDelays } = calculateBlockEfficiency(block)

    if (billed > 0 && efficiency < 50) {
      // Critical: Less than 50% efficiency
      flags.push({
        type: 'LOW_EFFICIENCY',
        severity: 'critical',
        ticket_id: ticket.id,
        ticket_date: ticket.date,
        activity_block_index: index,
        activity_type: block.activityType,
        contractor: block.contractor,
        message: `Critical: Efficiency score (${efficiency.toFixed(0)}%) is below 50% threshold`,
        details: {
          efficiency_score: efficiency,
          billed_hours: billed,
          shadow_hours: shadow,
          has_delay_entries: hasDelays,
          threshold: '50%'
        }
      })
    } else if (billed > 0 && efficiency < 70) {
      // Warning: Less than 70% efficiency
      flags.push({
        type: 'LOW_EFFICIENCY',
        severity: 'warning',
        ticket_id: ticket.id,
        ticket_date: ticket.date,
        activity_block_index: index,
        activity_type: block.activityType,
        contractor: block.contractor,
        message: `Warning: Efficiency score (${efficiency.toFixed(0)}%) is below 70% threshold`,
        details: {
          efficiency_score: efficiency,
          billed_hours: billed,
          shadow_hours: shadow,
          has_delay_entries: hasDelays,
          threshold: '70%'
        }
      })
    }

    // -------------------------------------------------------------------------
    // CHECK 4: MANAGEMENT_DRAG_SPIKE
    // Flag if >30% of labour entries are MANAGEMENT_DRAG
    // -------------------------------------------------------------------------
    if (block.labourEntries && block.labourEntries.length > 0) {
      const dragCount = block.labourEntries.filter(
        (e: any) => e.productionStatus === 'MANAGEMENT_DRAG'
      ).length
      const dragPercent = (dragCount / block.labourEntries.length) * 100

      if (dragPercent > 30) {
        flags.push({
          type: 'MANAGEMENT_DRAG_SPIKE',
          severity: 'critical',
          ticket_id: ticket.id,
          ticket_date: ticket.date,
          activity_block_index: index,
          activity_type: block.activityType,
          contractor: block.contractor,
          message: `Critical: ${dragPercent.toFixed(0)}% of labour marked as MANAGEMENT_DRAG (threshold: 30%)`,
          details: {
            drag_count: dragCount,
            total_labour: block.labourEntries.length,
            drag_percent: dragPercent,
            threshold: '30%'
          }
        })
      }
    }

    // -------------------------------------------------------------------------
    // CHECK 5: LABOUR_ANOMALY (Info level)
    // Flag unusually high labour counts for verification
    // -------------------------------------------------------------------------
    if (block.labourEntries && block.labourEntries.length > 50) {
      flags.push({
        type: 'LABOUR_ANOMALY',
        severity: 'info',
        ticket_id: ticket.id,
        ticket_date: ticket.date,
        activity_block_index: index,
        activity_type: block.activityType,
        contractor: block.contractor,
        message: `Info: High labour count (${block.labourEntries.length} entries) - verify accuracy`,
        details: {
          labour_count: block.labourEntries.length,
          threshold: 50
        }
      })
    }

    // -------------------------------------------------------------------------
    // CHECK 6: WPS_MATERIAL_MISMATCH
    // Flag if material used is not approved for the specified WPS
    // Supports both block-level (block.wps, block.material) and
    // weldData-level (block.weldData.weldEntries[].wpsId, block.weldData.pipeGrade)
    // -------------------------------------------------------------------------

    // First check block-level wps/material (direct fields)
    if (block.wps && block.material && Object.keys(wpsLookup).length > 0) {
      const wpsNumber = String(block.wps).toUpperCase().trim()
      const material = String(block.material).toUpperCase().trim()
      const wpsSpec = wpsLookup[wpsNumber]

      if (wpsSpec) {
        const materialMatches = wpsSpec.allowedMaterials.some(allowed =>
          material.includes(allowed) || allowed.includes(material)
        )

        if (!materialMatches) {
          flags.push({
            type: 'WPS_MATERIAL_MISMATCH',
            severity: 'critical',
            ticket_id: ticket.id,
            ticket_date: ticket.date,
            activity_block_index: index,
            activity_type: block.activityType,
            contractor: block.contractor,
            message: `Critical: Material "${block.material}" is NOT approved for ${block.wps} (${wpsSpec.name})`,
            details: {
              wps_used: block.wps,
              wps_name: wpsSpec.name,
              material_reported: block.material,
              allowed_materials: wpsSpec.allowedMaterials,
              validation_result: 'MATERIAL_NOT_IN_APPROVED_LIST'
            }
          })
        }
      } else if (Object.keys(wpsLookup).length > 0) {
        flags.push({
          type: 'EQUIPMENT_MISMATCH',
          severity: 'warning',
          ticket_id: ticket.id,
          ticket_date: ticket.date,
          activity_block_index: index,
          activity_type: block.activityType,
          contractor: block.contractor,
          message: `Warning: WPS "${block.wps}" not found in approved specifications`,
          details: {
            wps_used: block.wps,
            material_reported: block.material,
            available_wps: Object.keys(wpsLookup),
            validation_result: 'WPS_NOT_FOUND'
          }
        })
      }
    }

    // Also check weldData.weldEntries for WPS usage (mainline welding data structure)
    if (block.weldData?.weldEntries && Array.isArray(block.weldData.weldEntries)) {
      const pipeGrade = block.weldData.pipeGrade || block.pipeGrade // Check both locations

      for (const weldEntry of block.weldData.weldEntries) {
        if (weldEntry.wpsId && Object.keys(wpsLookup).length > 0) {
          const wpsNumber = String(weldEntry.wpsId).toUpperCase().trim()
          const wpsSpec = wpsLookup[wpsNumber]

          // If we have both WPS and pipe grade, validate the combination
          if (wpsSpec && pipeGrade) {
            const material = String(pipeGrade).toUpperCase().trim()
            const materialMatches = wpsSpec.allowedMaterials.some(allowed =>
              material.includes(allowed) || allowed.includes(material)
            )

            if (!materialMatches) {
              flags.push({
                type: 'WPS_MATERIAL_MISMATCH',
                severity: 'critical',
                ticket_id: ticket.id,
                ticket_date: ticket.date,
                activity_block_index: index,
                activity_type: block.activityType,
                contractor: block.contractor,
                message: `Critical: Pipe grade "${pipeGrade}" is NOT approved for ${weldEntry.wpsId} (${wpsSpec.name})`,
                details: {
                  wps_used: weldEntry.wpsId,
                  wps_name: wpsSpec.name,
                  weld_number: weldEntry.weldNumber || weldEntry.id,
                  pipe_grade: pipeGrade,
                  allowed_materials: wpsSpec.allowedMaterials,
                  validation_result: 'MATERIAL_NOT_IN_APPROVED_LIST'
                }
              })
            }
          } else if (!wpsSpec && Object.keys(wpsLookup).length > 0) {
            // WPS not found in our specs
            flags.push({
              type: 'EQUIPMENT_MISMATCH',
              severity: 'warning',
              ticket_id: ticket.id,
              ticket_date: ticket.date,
              activity_block_index: index,
              activity_type: block.activityType,
              contractor: block.contractor,
              message: `Warning: WPS "${weldEntry.wpsId}" not found in approved specifications`,
              details: {
                wps_used: weldEntry.wpsId,
                weld_number: weldEntry.weldNumber || weldEntry.id,
                available_wps: Object.keys(wpsLookup),
                validation_result: 'WPS_NOT_FOUND'
              }
            })
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // CHECK 7: FILLER_MATERIAL_MISMATCH (if filler electrode is specified)
    // -------------------------------------------------------------------------
    if (block.wps && block.fillerMaterial && Object.keys(wpsLookup).length > 0) {
      const wpsNumber = String(block.wps).toUpperCase().trim()
      const filler = String(block.fillerMaterial).toUpperCase().trim()
      const wpsSpec = wpsLookup[wpsNumber]

      if (wpsSpec && wpsSpec.allowedFillers.length > 0) {
        const fillerMatches = wpsSpec.allowedFillers.some(allowed =>
          filler.includes(allowed) || allowed.includes(filler)
        )

        if (!fillerMatches) {
          flags.push({
            type: 'EQUIPMENT_MISMATCH',
            severity: 'critical',
            ticket_id: ticket.id,
            ticket_date: ticket.date,
            activity_block_index: index,
            activity_type: block.activityType,
            contractor: block.contractor,
            message: `Critical: Filler material "${block.fillerMaterial}" is NOT approved for ${block.wps}`,
            details: {
              wps_used: block.wps,
              wps_name: wpsSpec.name,
              filler_reported: block.fillerMaterial,
              allowed_fillers: wpsSpec.allowedFillers,
              validation_result: 'FILLER_NOT_IN_APPROVED_LIST'
            }
          })
        }
      }
    }
  })

  return flags
}

/**
 * Calculate hours for an activity block
 */
function calculateBlockHours(block: any): { avgHoursPerWorker: number, totalHours: number, workerCount: number } {
  let totalHours = 0
  let workerCount = 0

  if (block.labourEntries) {
    for (const entry of block.labourEntries) {
      const rt = parseFloat(entry.rt) || 0
      const ot = parseFloat(entry.ot) || 0
      const count = parseFloat(entry.count) || 1

      totalHours += (rt + ot) * count
      workerCount += count
    }
  }

  const avgHoursPerWorker = workerCount > 0 ? totalHours / workerCount : 0

  return { avgHoursPerWorker, totalHours, workerCount }
}

/**
 * Calculate efficiency for an activity block
 */
function calculateBlockEfficiency(block: any): { efficiency: number, billed: number, shadow: number, hasDelays: boolean } {
  let totalBilled = 0
  let totalShadow = 0
  let hasDelays = false

  if (block.labourEntries) {
    for (const entry of block.labourEntries) {
      const rt = parseFloat(entry.rt) || 0
      const ot = parseFloat(entry.ot) || 0
      const count = parseFloat(entry.count) || 1
      const billed = (rt + ot) * count
      totalBilled += billed

      // Use shadow hours if available, otherwise calculate from status
      if (entry.shadowEffectiveHours !== undefined && entry.shadowEffectiveHours !== null) {
        totalShadow += parseFloat(entry.shadowEffectiveHours) || 0
      } else {
        // Apply status multiplier
        const status = entry.productionStatus || 'ACTIVE'
        let multiplier = 1.0
        if (status === 'SYNC_DELAY') {
          multiplier = 0.7
          hasDelays = true
        } else if (status === 'MANAGEMENT_DRAG') {
          multiplier = 0.0
          hasDelays = true
        }
        totalShadow += billed * multiplier
      }
    }
  }

  const efficiency = totalBilled > 0 ? (totalShadow / totalBilled) * 100 : 100

  return { efficiency, billed: totalBilled, shadow: totalShadow, hasDelays }
}

/**
 * Calculate total efficiency for a ticket
 */
function calculateTicketEfficiency(ticket: any): { billed: number, shadow: number } {
  let totalBilled = 0
  let totalShadow = 0

  const blocks = ticket.activity_blocks || []
  for (const block of blocks) {
    const { billed, shadow } = calculateBlockEfficiency(block)
    totalBilled += billed
    totalShadow += shadow
  }

  return { billed: totalBilled, shadow: totalShadow }
}

/**
 * Parse KP string to meters (e.g., "6+500" -> 6500)
 */
function parseKP(kp: any): number | null {
  if (!kp) return null

  const str = String(kp).trim()

  // Match format "X+XXX" (e.g., "6+500")
  const plusMatch = str.match(/^(\d+)\+(\d+)$/)
  if (plusMatch) {
    return parseInt(plusMatch[1]) * 1000 + parseInt(plusMatch[2])
  }

  // Try as plain number
  const num = parseFloat(str)
  if (!isNaN(num)) {
    // If < 100, assume it's kilometers and convert
    return num < 100 ? num * 1000 : num
  }

  return null
}


// =============================================================================
// AI SUMMARY GENERATION
// =============================================================================

/**
 * Generate AI narrative summary of analysis flags
 */
async function generateAISummary(
  flags: AnalysisFlag[],
  tickets: any[],
  config: ContractConfig
): Promise<{ summary: string, tokensInput: number, tokensOutput: number }> {

  if (!ANTHROPIC_API_KEY) {
    return {
      summary: `Analysis found ${flags.length} flag(s) requiring attention.`,
      tokensInput: 0,
      tokensOutput: 0
    }
  }

  const prompt = buildAnalysisPrompt(flags, tickets, config)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[AI Agent] Anthropic API error:', errorText)
      return {
        summary: `Analysis found ${flags.length} flag(s). AI summary unavailable.`,
        tokensInput: 0,
        tokensOutput: 0
      }
    }

    const data = await response.json()
    const summary = data.content?.[0]?.text || `Analysis found ${flags.length} flag(s).`

    return {
      summary,
      tokensInput: data.usage?.input_tokens || 0,
      tokensOutput: data.usage?.output_tokens || 0
    }

  } catch (error) {
    console.error('[AI Agent] AI summary generation error:', error)
    return {
      summary: `Analysis found ${flags.length} flag(s). Error generating AI summary.`,
      tokensInput: 0,
      tokensOutput: 0
    }
  }
}

/**
 * Build the prompt for AI analysis summary
 */
function buildAnalysisPrompt(flags: AnalysisFlag[], tickets: any[], config: ContractConfig): string {
  const criticalFlags = flags.filter(f => f.severity === 'critical')
  const warningFlags = flags.filter(f => f.severity === 'warning')

  // Group flags by contractor
  const byContractor: Record<string, AnalysisFlag[]> = {}
  for (const flag of flags) {
    const contractor = flag.contractor || 'Unknown'
    if (!byContractor[contractor]) byContractor[contractor] = []
    byContractor[contractor].push(flag)
  }

  // Group flags by type for summary
  const byType: Record<string, number> = {}
  for (const flag of flags) {
    byType[flag.type] = (byType[flag.type] || 0) + 1
  }

  // Check for WPS-related issues specifically
  const wpsMaterialFlags = flags.filter(f => f.type === 'WPS_MATERIAL_MISMATCH')
  const equipmentFlags = flags.filter(f => f.type === 'EQUIPMENT_MISMATCH')

  // RAG-based spec violations
  const specViolations = flags.filter(f => f.type === 'SPEC_VIOLATION')
  const coatingViolations = flags.filter(f => f.type === 'COATING_VIOLATION')
  const procedureViolations = flags.filter(f => f.type === 'PROCEDURE_VIOLATION')
  const totalSpecIssues = specViolations.length + coatingViolations.length + procedureViolations.length

  return `You are a Pipeline Construction Inspector AI analyzing daily field reports. Provide a brief executive summary (2-3 sentences) of the analysis results.

PROJECT CONFIGURATION:
- Standard Workday: ${config.standard_workday} hours
- Project KP Range: ${config.start_kp} to ${config.end_kp}

ANALYSIS RESULTS:
- Tickets Analyzed: ${tickets.length}
- Critical Issues: ${criticalFlags.length}
- Warnings: ${warningFlags.length}
- WPS/Material Violations: ${wpsMaterialFlags.length}
- Equipment/Procedure Issues: ${equipmentFlags.length}
- Specification Violations (from Project Docs): ${totalSpecIssues}
  - Coating Thickness Violations: ${coatingViolations.length}
  - Procedure Violations: ${procedureViolations.length}
  - Other Spec Violations: ${specViolations.length}

FLAGS DETECTED:
${flags.slice(0, 12).map(f => `- [${f.severity.toUpperCase()}] ${f.type}: ${f.message}`).join('\n')}
${flags.length > 12 ? `\n... and ${flags.length - 12} more flags` : ''}

CONTRACTORS WITH ISSUES:
${Object.entries(byContractor).map(([c, f]) => `- ${c}: ${f.length} flag(s)`).join('\n')}

Provide a concise summary focusing on:
1. COATING_VIOLATION flags (CRITICAL - coating thickness out of spec requires immediate attention)
2. WPS/Material violations (CRITICAL - stop work may be required if wrong materials used)
3. SPEC_VIOLATION flags (values not matching project specifications)
4. Hours/efficiency anomalies requiring investigation
5. Which contractors need follow-up

IMPORTANT:
- COATING_VIOLATION flags mean recorded thickness is outside the project specification range - highlight prominently
- WPS_MATERIAL_MISMATCH flags indicate potential weld quality issues
- SPEC_VIOLATION flags are based on comparison with actual project documents

Keep response under 120 words. Be specific and actionable.`
}


// =============================================================================
// DATABASE LOGGING
// =============================================================================

interface LogParams {
  organization_id: string
  trigger_source: string
  ticket_ids: string[]
  date_range_start?: string
  date_range_end?: string
  tokens_input?: number
  tokens_output?: number
  result: AnalysisResult
  processing_ms: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message?: string
}

/**
 * Log analysis to ai_agent_logs table
 */
async function logAnalysis(supabase: any, params: LogParams): Promise<void> {
  try {
    const { error } = await supabase.from('ai_agent_logs').insert({
      organization_id: params.organization_id,
      query_type: 'ticket_analysis',
      trigger_source: params.trigger_source,
      ticket_ids: params.ticket_ids,
      date_range_start: params.date_range_start,
      date_range_end: params.date_range_end,
      model_used: params.tokens_input ? 'claude-sonnet-4-20250514' : null,
      tokens_input: params.tokens_input || null,
      tokens_output: params.tokens_output || null,
      analysis_result: params.result,
      flags_raised: params.result.metrics.flags_raised,
      flags_by_severity: {
        critical: params.result.metrics.critical_count,
        warning: params.result.metrics.warning_count,
        info: params.result.metrics.info_count
      },
      status: params.status,
      error_message: params.error_message || null,
      processing_duration_ms: params.processing_ms,
      completed_at: params.status === 'completed' ? new Date().toISOString() : null
    })

    if (error) {
      console.error('[AI Agent] Failed to log analysis:', error)
    }
  } catch (err) {
    console.error('[AI Agent] Log error:', err)
  }
}


// =============================================================================
// RAG (RETRIEVAL AUGMENTED GENERATION) FUNCTIONS
// =============================================================================

/**
 * Generate embedding vector using OpenAI's text-embedding-ada-002
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) {
    console.log('[AI Agent] OpenAI API key not configured - RAG disabled')
    return null
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text.slice(0, 8000) // Truncate to model limit
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[AI Agent] OpenAI embedding error:', errorText)
      return null
    }

    const data = await response.json()
    return data.data?.[0]?.embedding || null
  } catch (err) {
    console.error('[AI Agent] Embedding generation error:', err)
    return null
  }
}

/**
 * Search document embeddings for relevant context
 */
async function searchDocuments(
  supabase: any,
  queryText: string,
  organizationId: string,
  category?: string,
  matchCount: number = 5,
  matchThreshold: number = 0.7
): Promise<DocumentMatch[]> {
  // Generate embedding for query
  const embedding = await generateEmbedding(queryText)

  if (!embedding) {
    console.log('[AI Agent] Could not generate embedding for RAG query')
    return []
  }

  try {
    // Use the match_documents function
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter_org_id: organizationId,
      filter_category: category || null
    })

    if (error) {
      console.error('[AI Agent] Document search error:', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('[AI Agent] RAG search error:', err)
    return []
  }
}

/**
 * Extract measurable values from ticket for spec validation
 */
function extractMeasurableFields(ticket: any): { field: string, value: any, unit: string, context: string }[] {
  const measurables: { field: string, value: any, unit: string, context: string }[] = []
  const blocks = ticket.activity_blocks || []

  for (const block of blocks) {
    // Coating data
    if (block.coatingData) {
      const cd = block.coatingData
      if (cd.dftReadings && Array.isArray(cd.dftReadings)) {
        for (const reading of cd.dftReadings) {
          if (reading.thickness !== undefined && reading.thickness !== null) {
            measurables.push({
              field: 'coating_thickness',
              value: parseFloat(reading.thickness),
              unit: 'mils',
              context: `Coating DFT reading at ${reading.location || 'unspecified location'}, coating type: ${cd.coatingType || 'unknown'}`
            })
          }
        }
      }
      if (cd.thickness !== undefined) {
        measurables.push({
          field: 'coating_thickness',
          value: parseFloat(cd.thickness),
          unit: 'mils',
          context: `Coating thickness for ${cd.coatingType || 'coating'} application`
        })
      }
      if (cd.minThickness !== undefined) {
        measurables.push({
          field: 'coating_min_thickness',
          value: parseFloat(cd.minThickness),
          unit: 'mils',
          context: `Minimum coating thickness recorded`
        })
      }
    }

    // Weld data
    if (block.weldData) {
      const wd = block.weldData
      if (wd.pipeGrade) {
        measurables.push({
          field: 'pipe_grade',
          value: wd.pipeGrade,
          unit: '',
          context: `Pipe grade used for welding activity`
        })
      }
      if (wd.pipeDiameter) {
        measurables.push({
          field: 'pipe_diameter',
          value: parseFloat(wd.pipeDiameter),
          unit: 'inches',
          context: `Pipe diameter for weld`
        })
      }
      if (wd.wallThickness) {
        measurables.push({
          field: 'wall_thickness',
          value: parseFloat(wd.wallThickness),
          unit: 'inches',
          context: `Pipe wall thickness`
        })
      }
    }

    // Backfill data
    if (block.backfillData) {
      const bf = block.backfillData
      if (bf.coverDepth !== undefined) {
        measurables.push({
          field: 'cover_depth',
          value: parseFloat(bf.coverDepth),
          unit: 'meters',
          context: `Backfill cover depth over pipe`
        })
      }
      if (bf.padding_thickness !== undefined) {
        measurables.push({
          field: 'padding_thickness',
          value: parseFloat(bf.padding_thickness),
          unit: 'mm',
          context: `Padding thickness for pipe protection`
        })
      }
    }

    // NDT data
    if (block.ndtData) {
      const ndt = block.ndtData
      if (ndt.repairRate !== undefined) {
        measurables.push({
          field: 'repair_rate',
          value: parseFloat(ndt.repairRate),
          unit: '%',
          context: `NDT repair rate for welds inspected`
        })
      }
    }

    // Generic inspection values
    if (block.inspectionValues && typeof block.inspectionValues === 'object') {
      for (const [key, val] of Object.entries(block.inspectionValues)) {
        if (typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)))) {
          measurables.push({
            field: key,
            value: parseFloat(val as string),
            unit: '',
            context: `Inspection value: ${key}`
          })
        }
      }
    }
  }

  return measurables
}

/**
 * Perform RAG-based spec compliance analysis
 */
async function analyzeWithRAG(
  supabase: any,
  ticket: any,
  organizationId: string
): Promise<AnalysisFlag[]> {
  const flags: AnalysisFlag[] = []

  // Extract measurable values from ticket
  const measurables = extractMeasurableFields(ticket)

  if (measurables.length === 0) {
    console.log(`[AI Agent] No measurable fields found in ticket ${ticket.id}`)
    return flags
  }

  console.log(`[AI Agent] Found ${measurables.length} measurable fields for RAG analysis`)

  // Build query for document search based on measurable fields
  const uniqueFields = [...new Set(measurables.map(m => m.field))]
  const queryTerms = [
    'specification requirements',
    'acceptable range',
    'minimum maximum',
    ...uniqueFields.map(f => f.replace(/_/g, ' '))
  ]

  // Search for relevant specifications
  const searchQuery = `${queryTerms.join(' ')} thickness tolerance limits requirements`
  const relevantDocs = await searchDocuments(
    supabase,
    searchQuery,
    organizationId,
    undefined, // Search all categories
    10,        // Get more documents for context
    0.65       // Lower threshold to get more matches
  )

  if (relevantDocs.length === 0) {
    console.log('[AI Agent] No relevant documents found for RAG analysis')
    return flags
  }

  console.log(`[AI Agent] Found ${relevantDocs.length} relevant document chunks`)

  // Build context from retrieved documents
  const documentContext = relevantDocs.map(doc =>
    `[${doc.document_name} - ${doc.document_category}]:\n${doc.chunk_text}`
  ).join('\n\n---\n\n')

  // Build measurables summary
  const measurablesSummary = measurables.map(m =>
    `- ${m.field}: ${m.value} ${m.unit} (${m.context})`
  ).join('\n')

  // Use Claude to analyze compliance
  if (!ANTHROPIC_API_KEY) {
    console.log('[AI Agent] Anthropic API key not configured - skipping RAG compliance check')
    return flags
  }

  const ragPrompt = `You are a Pipeline Construction Quality Inspector AI. Your task is to check if the recorded field values comply with the project specifications.

## RECORDED VALUES FROM DAILY TICKET
Ticket ID: ${ticket.id}
Date: ${ticket.date}
Spread: ${ticket.spread || 'Not specified'}

${measurablesSummary}

## RELEVANT PROJECT SPECIFICATIONS
The following excerpts are from the project's specification documents (API 1169, Project Specs, Procedures):

${documentContext}

## YOUR TASK
Compare each recorded value against the specifications. For each value:
1. Find the applicable specification requirement
2. Determine if the value is within acceptable limits
3. If out of spec, identify the violation

Return a JSON array of violations found. Each violation should have:
- field: the field name that's out of spec
- recorded_value: the value that was recorded
- spec_requirement: what the spec says (e.g., "20-25 mils per Project Spec Section 5.2")
- violation_type: "BELOW_MIN" | "ABOVE_MAX" | "NOT_ALLOWED" | "MISSING_REQUIREMENT"
- severity: "critical" | "warning"
- message: A clear explanation of the violation

If ALL values are within spec, return an empty array: []

IMPORTANT:
- Only flag clear violations where the spec explicitly states a requirement
- Coating thickness is particularly important - flag any readings outside the specified range
- For welding, check material compatibility and procedure compliance
- Be specific about which document/section the requirement comes from

Return ONLY valid JSON, no other text.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: ragPrompt
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[AI Agent] RAG analysis API error:', errorText)
      return flags
    }

    const data = await response.json()
    const responseText = data.content?.[0]?.text || '[]'

    // Parse the JSON response
    let violations: any[] = []
    try {
      const cleanedText = responseText.replace(/```json|```/g, '').trim()
      violations = JSON.parse(cleanedText)
    } catch (parseErr) {
      console.error('[AI Agent] Failed to parse RAG response:', parseErr)
      return flags
    }

    // Convert violations to flags
    for (const v of violations) {
      const flagType: FlagType = v.field?.toLowerCase().includes('coating')
        ? 'COATING_VIOLATION'
        : v.field?.toLowerCase().includes('procedure') || v.field?.toLowerCase().includes('wps')
          ? 'PROCEDURE_VIOLATION'
          : 'SPEC_VIOLATION'

      flags.push({
        type: flagType,
        severity: v.severity === 'critical' ? 'critical' : 'warning',
        ticket_id: ticket.id,
        ticket_date: ticket.date,
        activity_type: ticket.activity_blocks?.[0]?.activityType,
        contractor: ticket.activity_blocks?.[0]?.contractor,
        message: v.message || `${v.field} violation: recorded ${v.recorded_value}, spec requires ${v.spec_requirement}`,
        details: {
          field: v.field,
          recorded_value: v.recorded_value,
          spec_requirement: v.spec_requirement,
          violation_type: v.violation_type,
          source_documents: relevantDocs.map(d => d.document_name).slice(0, 3)
        }
      })
    }

    console.log(`[AI Agent] RAG analysis found ${flags.length} spec violations`)
    return flags

  } catch (err) {
    console.error('[AI Agent] RAG analysis error:', err)
    return flags
  }
}
