// generate-meeting-agenda/index.ts - AI-powered management meeting agenda generator
// Uses Goodhart's Law efficiency metrics to create data-driven meeting agendas

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

interface EfficiencyMetrics {
  totalBilledHours: number
  totalShadowHours: number
  totalValueLost: number
  overallInertiaRatio: number
  systemicDelayCount: number
  assetDelayCount: number
  delayReasonBreakdown: Record<string, number>
  partyBreakdown: {
    owner: number
    contractor: number
    neutral: number
    unknown: number
    total: number
  }
  spreadComparison: Array<{
    spread: string
    billed: number
    shadow: number
    valueLost: number
    inertiaRatio: number
    systemicCount: number
    assetCount: number
  }>
  reliability: {
    overallReliability: string
    overallProductionRatio: number
    overallQualityRate: number
    totalReworkCost: number
    criticalAlerts: Array<{ type: string; severity: string; activityType: string }>
    unreliableBlocks: number
    questionableBlocks: number
    trueCostOfCompletion: number
  }
  reportCount: number
  dateRange: { start: string; end: string }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { organization_id, metrics, meeting_date, custom_focus } = await req.json()

    if (!organization_id || !metrics) {
      return new Response(
        JSON.stringify({ error: 'organization_id and metrics are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    })

    // Get organization name
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organization_id)
      .single()

    const orgName = orgData?.name || 'Project'
    const effMetrics = metrics as EfficiencyMetrics

    // Format the metrics into a readable summary for Claude
    const metricsContext = formatMetricsForAI(effMetrics)

    const systemPrompt = `You are an experienced pipeline construction project manager creating weekly management meeting agendas. You analyze efficiency metrics and operational data to identify key discussion points, action items, and areas requiring management attention.

Your agenda should be:
- Action-oriented with clear discussion topics
- Data-driven, referencing specific metrics
- Prioritized by impact and urgency
- Practical for a 60-90 minute management meeting
- Professional but conversational in tone

Format the agenda as structured markdown with clear sections.`

    const userPrompt = `Create a weekly management meeting agenda for ${orgName} based on the following efficiency and operational metrics from the past week:

${metricsContext}

${custom_focus ? `Additional focus area requested: ${custom_focus}` : ''}

Meeting date: ${meeting_date || 'This Week'}

Please create a comprehensive agenda that:
1. Opens with a 5-minute efficiency health check summary
2. Addresses any critical reliability alerts or data quality issues
3. Reviews spreads/crews with concerning inertia ratios (under 80%)
4. Discusses systemic delays and their root causes
5. Reviews the accountability breakdown (Owner vs Contractor issues)
6. Identifies action items and assigns ownership where logical
7. Includes time estimates for each agenda item
8. Ends with next steps and follow-ups

Format the agenda in clear markdown with headers, bullet points, and tables where appropriate.`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    })

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text()
      console.error('Claude API error:', errBody)
      return new Response(
        JSON.stringify({ error: 'AI processing failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeResponse.json()
    const agenda = claudeData.content?.[0]?.text || 'Unable to generate agenda.'

    // Log to ai_agent_logs
    await supabase.from('ai_agent_logs').insert({
      organization_id,
      query_type: 'meeting_agenda',
      query_text: `Weekly management meeting agenda for ${meeting_date || 'this week'}`,
      result_summary: agenda.substring(0, 500),
      documents_searched: 0,
      metadata: {
        meeting_date,
        custom_focus,
        metrics_summary: {
          inertiaRatio: effMetrics.overallInertiaRatio,
          valueLost: effMetrics.totalValueLost,
          reportCount: effMetrics.reportCount,
          reliability: effMetrics.reliability?.overallReliability
        },
        model: 'claude-sonnet-4-20250514'
      }
    })

    return new Response(
      JSON.stringify({
        agenda,
        organization: orgName,
        generatedAt: new Date().toISOString(),
        metricsUsed: {
          inertiaRatio: effMetrics.overallInertiaRatio,
          valueLost: effMetrics.totalValueLost,
          reliability: effMetrics.reliability?.overallReliability,
          reportCount: effMetrics.reportCount
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('generate-meeting-agenda error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function formatMetricsForAI(metrics: EfficiencyMetrics): string {
  const lines: string[] = []

  lines.push(`## Efficiency Summary (${metrics.dateRange?.start || 'Last 7 days'} to ${metrics.dateRange?.end || 'Today'})`)
  lines.push(`- Reports Analyzed: ${metrics.reportCount}`)
  lines.push(`- Overall Inertia Ratio: ${metrics.overallInertiaRatio?.toFixed(1) || 0}%`)
  lines.push(`- Total Billed Hours: ${metrics.totalBilledHours?.toFixed(1) || 0}`)
  lines.push(`- Total Shadow Hours: ${metrics.totalShadowHours?.toFixed(1) || 0}`)
  lines.push(`- Value Lost (Time Inefficiency): $${(metrics.totalValueLost || 0).toLocaleString()}`)
  lines.push('')

  if (metrics.reliability) {
    lines.push(`## Data Reliability (Goodhart's Law Protection)`)
    lines.push(`- Overall Reliability: ${metrics.reliability.overallReliability}`)
    lines.push(`- Production Ratio: ${metrics.reliability.overallProductionRatio?.toFixed(1) || 0}%`)
    lines.push(`- Quality Rate: ${metrics.reliability.overallQualityRate?.toFixed(1) || 0}%`)
    lines.push(`- Rework Cost: $${(metrics.reliability.totalReworkCost || 0).toLocaleString()}`)
    lines.push(`- True Cost of Completion: $${(metrics.reliability.trueCostOfCompletion || 0).toLocaleString()}`)
    lines.push(`- Unreliable Blocks: ${metrics.reliability.unreliableBlocks || 0}`)
    lines.push(`- Questionable Blocks: ${metrics.reliability.questionableBlocks || 0}`)

    if (metrics.reliability.criticalAlerts?.length > 0) {
      lines.push('')
      lines.push(`### Critical Alerts`)
      metrics.reliability.criticalAlerts.slice(0, 10).forEach(alert => {
        lines.push(`- [${alert.severity?.toUpperCase()}] ${alert.type}: ${alert.activityType}`)
      })
    }
    lines.push('')
  }

  lines.push(`## Delay Analysis`)
  lines.push(`- Systemic Delays: ${metrics.systemicDelayCount || 0} (crew-wide stoppages)`)
  lines.push(`- Asset-Specific Delays: ${metrics.assetDelayCount || 0} (individual equipment/labour)`)

  if (metrics.delayReasonBreakdown && Object.keys(metrics.delayReasonBreakdown).length > 0) {
    lines.push('')
    lines.push(`### Delay Reasons by Value Lost`)
    const sortedReasons = Object.entries(metrics.delayReasonBreakdown)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 8)
    sortedReasons.forEach(([reason, value]) => {
      const label = formatReasonLabel(reason)
      lines.push(`- ${label}: $${(value as number).toLocaleString()}`)
    })
  }
  lines.push('')

  if (metrics.partyBreakdown && metrics.partyBreakdown.total > 0) {
    lines.push(`## Accountability Breakdown`)
    lines.push(`- Owner Issues: $${(metrics.partyBreakdown.owner || 0).toLocaleString()} (${((metrics.partyBreakdown.owner / metrics.partyBreakdown.total) * 100).toFixed(0)}%)`)
    lines.push(`- Contractor Issues: $${(metrics.partyBreakdown.contractor || 0).toLocaleString()} (${((metrics.partyBreakdown.contractor / metrics.partyBreakdown.total) * 100).toFixed(0)}%)`)
    lines.push(`- Neutral (Force Majeure): $${(metrics.partyBreakdown.neutral || 0).toLocaleString()} (${((metrics.partyBreakdown.neutral / metrics.partyBreakdown.total) * 100).toFixed(0)}%)`)
    lines.push(`- Back-Charge Potential: $${(metrics.partyBreakdown.contractor || 0).toLocaleString()}`)
    lines.push('')
  }

  if (metrics.spreadComparison?.length > 0) {
    lines.push(`## Spread/Crew Performance`)
    const sorted = [...metrics.spreadComparison].sort((a, b) => a.inertiaRatio - b.inertiaRatio)
    sorted.slice(0, 8).forEach(spread => {
      const status = spread.inertiaRatio >= 90 ? '✅' : spread.inertiaRatio >= 70 ? '⚠️' : '🔴'
      lines.push(`- ${status} ${spread.spread}: ${spread.inertiaRatio?.toFixed(0)}% efficiency, $${(spread.valueLost || 0).toLocaleString()} lost, ${spread.systemicCount || 0} systemic delays`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

function formatReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    waiting_permits: 'Waiting for Permits',
    waiting_instructions: 'Waiting for Instructions',
    waiting_materials: 'Waiting for Materials',
    coordination_delay: 'Coordination Delay',
    weather_hold: 'Weather Hold',
    safety_standdown: 'Safety Stand-down',
    equipment_breakdown: 'Equipment Breakdown',
    first_nations_monitor: 'First Nations Monitor',
    bird_window: 'Bird Nesting Window',
    environmental_window: 'Environmental Window',
    landowner_access: 'Landowner Access Issue',
    regulatory_hold: 'Regulatory Hold',
    other: 'Other',
    unspecified: 'Unspecified'
  }
  return labels[reason] || reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}
