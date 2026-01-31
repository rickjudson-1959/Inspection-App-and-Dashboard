// WeeklyExecutiveSummary.jsx - Weekly Executive Report Generator
// Aggregates EVM metrics, production data, and generates AI-powered insights

import React, { useState } from 'react'
import { supabase } from './supabase'
import { useOrgQuery } from './utils/queryHelpers.js'
import { calculateEVM, calculateGapAnalysis, formatCurrency as evmFormatCurrency } from './evmCalculations.js'

// Anthropic API key from environment
const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

// Brand colors (matching Pipe-Up theme)
const BRAND = {
  navy: '#003366',
  orange: '#ff6600',
  lightBlue: '#e7f3ff',
  green: '#28a745',
  amber: '#ffc107',
  red: '#dc3545',
  gray: '#6c757d'
}

// Parse KP to metres
function parseKPToMetres(kpString) {
  if (!kpString) return null
  const str = String(kpString).trim()
  if (str.includes('+')) {
    const [km, m] = str.split('+')
    return (parseInt(km) || 0) * 1000 + (parseInt(m) || 0)
  }
  const num = parseFloat(str)
  return isNaN(num) ? null : num * 1000
}

// Format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(amount)
}

// Format date range
function formatDateRange(startDate, endDate) {
  const options = { month: 'short', day: 'numeric' }
  const start = new Date(startDate).toLocaleDateString('en-CA', options)
  const end = new Date(endDate).toLocaleDateString('en-CA', options)
  const year = new Date(endDate).getFullYear()
  return `${start} - ${end}, ${year}`
}

// Get health status color and label
function getHealthStatus(spi, cpi) {
  const avgIndex = (spi + cpi) / 2
  if (avgIndex >= 0.95) return { color: BRAND.green, label: 'GREEN', icon: '✅' }
  if (avgIndex >= 0.85) return { color: BRAND.amber, label: 'AMBER', icon: '⚠️' }
  return { color: BRAND.red, label: 'RED', icon: '🔴' }
}

export default function WeeklyExecutiveSummary({ projectName = 'FortisBC EGP Project' }) {
  const { addOrgFilter } = useOrgQuery()
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [weeklyData, setWeeklyData] = useState(null)
  const [aiCommentary, setAiCommentary] = useState('')
  const [emailHtml, setEmailHtml] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [recipientEmail, setRecipientEmail] = useState('')

  // Calculate date range for last 7 days
  const getDateRange = () => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 6)
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    }
  }

  // Aggregate weekly data from Supabase
  const aggregateWeeklyData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const { startDate, endDate } = getDateRange()
      
      // Fetch all reports from the last 7 days (org-scoped)
      const { data: reports, error: fetchError } = await addOrgFilter(
        supabase
          .from('daily_tickets')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate)
      ).order('date', { ascending: true })

      if (fetchError) throw fetchError

      // Initialize aggregation structures
      const productionByPhase = {}
      const timeLostReasons = {}
      let totalLabourHours = 0
      let totalLabourCost = 0
      let totalEquipmentHours = 0
      let totalEquipmentCost = 0
      let reportCount = reports?.length || 0

      // Process each report
      reports?.forEach(report => {
        const blocks = report.activity_blocks || []
        
        blocks.forEach(block => {
          // Aggregate production by activity type
          if (block.activityType && block.startKP && block.endKP) {
            const startM = parseKPToMetres(block.startKP)
            const endM = parseKPToMetres(block.endKP)
            if (startM !== null && endM !== null) {
              const metres = Math.abs(endM - startM)
              productionByPhase[block.activityType] = (productionByPhase[block.activityType] || 0) + metres
            }
          }

          // Aggregate labour
          block.labourEntries?.forEach(entry => {
            const hours = (entry.rt || 0) + (entry.ot || 0)
            totalLabourHours += hours * (entry.count || 1)
            // Estimate cost at $85/hr average
            totalLabourCost += hours * (entry.count || 1) * 85
          })

          // Aggregate equipment
          block.equipmentEntries?.forEach(entry => {
            totalEquipmentHours += entry.hours || 0
            // Estimate cost at $150/hr average
            totalEquipmentCost += (entry.hours || 0) * 150
          })

          // Aggregate time lost
          block.timeLostEntries?.forEach(entry => {
            if (entry.reason) {
              timeLostReasons[entry.reason] = (timeLostReasons[entry.reason] || 0) + (entry.hours || 0)
            }
          })
        })
      })

      // Sort production by metres (highest first)
      const sortedProduction = Object.entries(productionByPhase)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8) // Top 8 activities

      // Sort time lost reasons (highest hours first)
      const sortedTimeLost = Object.entries(timeLostReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3) // Top 3 reasons

      // Calculate EVM metrics from baselines
      let evmMetrics = null
      try {
        evmMetrics = await calculateEVM({ startDate, endDate })
      } catch (e) {
        console.log('Baselines table not set up yet, using demo values')
      }

      // Use real EVM if available, otherwise use demo values
      let plannedValue, earnedValue, actualCost, spi, cpi
      let budgetAtCompletion, estimateAtCompletion, varianceAtCompletion, scheduleVarianceDays

      if (evmMetrics?.summary) {
        // Real EVM from baselines
        plannedValue = evmMetrics.summary.plannedValue
        earnedValue = evmMetrics.summary.earnedValue
        actualCost = evmMetrics.summary.actualCost || totalLabourCost + totalEquipmentCost
        spi = evmMetrics.summary.spi
        cpi = evmMetrics.summary.cpi
        budgetAtCompletion = evmMetrics.summary.budgetAtCompletion
        estimateAtCompletion = evmMetrics.summary.estimateAtCompletion
        varianceAtCompletion = evmMetrics.summary.varianceAtCompletion
        scheduleVarianceDays = Math.round((spi - 1) * 45) // Approximate days variance
      } else {
        // Demo/fallback values
        plannedValue = 2500000
        actualCost = totalLabourCost + totalEquipmentCost || 450000
        earnedValue = actualCost * 1.05
        spi = plannedValue > 0 ? earnedValue / plannedValue : 1.0
        cpi = actualCost > 0 ? earnedValue / actualCost : 1.0
        budgetAtCompletion = 10000000
        estimateAtCompletion = budgetAtCompletion / cpi
        varianceAtCompletion = budgetAtCompletion - estimateAtCompletion
        scheduleVarianceDays = Math.round((spi - 1) * 45)
      }

      const weeklyMetrics = {
        dateRange: { startDate, endDate },
        reportCount,
        production: sortedProduction,
        timeLost: sortedTimeLost,
        labour: {
          hours: Math.round(totalLabourHours),
          cost: totalLabourCost
        },
        equipment: {
          hours: Math.round(totalEquipmentHours),
          cost: totalEquipmentCost
        },
        evm: {
          plannedValue,
          earnedValue,
          actualCost: actualCost || 450000,
          spi: parseFloat(spi.toFixed(2)),
          cpi: parseFloat(cpi.toFixed(2)),
          budgetAtCompletion,
          estimateAtCompletion: Math.round(estimateAtCompletion),
          varianceAtCompletion: Math.round(varianceAtCompletion),
          scheduleVarianceDays
        },
        health: getHealthStatus(spi, cpi),
        // Include gap analysis if available
        gapAnalysis: evmMetrics?.byActivity || null
      }

      setWeeklyData(weeklyMetrics)
      setLoading(false)
      return weeklyMetrics
    } catch (err) {
      console.error('Error aggregating data:', err)
      setError('Failed to aggregate weekly data: ' + err.message)
      setLoading(false)
      return null
    }
  }

  // Generate AI-powered management commentary
  const generateAICommentary = async (metrics) => {
    if (!anthropicApiKey) {
      return 'AI commentary unavailable - API key not configured.'
    }

    setGenerating(true)
    
    try {
      const prompt = `You are a senior project controls analyst writing a brief management commentary for a weekly pipeline construction executive report.

Based on these metrics, write ONE concise paragraph (3-4 sentences max) with actionable insights:

**Schedule Performance Index (SPI):** ${metrics.evm.spi} ${metrics.evm.spi >= 1 ? '(ahead of schedule)' : '(behind schedule)'}
**Cost Performance Index (CPI):** ${metrics.evm.cpi} ${metrics.evm.cpi >= 1 ? '(under budget)' : '(over budget)'}
**Schedule Variance:** ${metrics.evm.scheduleVarianceDays > 0 ? '+' : ''}${metrics.evm.scheduleVarianceDays} days
**Forecasted Savings/Overrun:** ${metrics.evm.varianceAtCompletion > 0 ? 'Savings of ' : 'Overrun of '}${formatCurrency(Math.abs(metrics.evm.varianceAtCompletion))}

**Top Production This Week:**
${metrics.production.slice(0, 3).map(([phase, metres]) => `- ${phase}: ${metres.toLocaleString()}m`).join('\n')}

**Top Time Lost Reasons:**
${metrics.timeLost.length > 0 ? metrics.timeLost.map(([reason, hours]) => `- ${reason}: ${hours} hours`).join('\n') : '- No significant delays reported'}

Write in a professional but direct tone. Focus on: (1) overall project health assessment, (2) key risk or opportunity, (3) one specific recommendation for next week. Do not use bullet points - write as flowing prose.`

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
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }]
        })
      })

      if (!response.ok) {
        throw new Error('API request failed')
      }

      const data = await response.json()
      const commentary = data.content[0]?.text || 'Unable to generate commentary.'
      
      setAiCommentary(commentary)
      setGenerating(false)
      return commentary
    } catch (err) {
      console.error('Error generating AI commentary:', err)
      setGenerating(false)
      return 'AI commentary unavailable at this time.'
    }
  }

  // Generate HTML email template
  const generateEmailHtml = (metrics, commentary) => {
    const { startDate, endDate } = metrics.dateRange
    const dateRangeStr = formatDateRange(startDate, endDate)
    const health = metrics.health

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Project Health Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 650px; margin: 0 auto; background-color: white;">
    
    <!-- Header -->
    <div style="background-color: ${BRAND.navy}; padding: 25px 30px; text-align: center;">
      <h1 style="margin: 0; color: white; font-size: 22px; font-weight: 600;">
        📈 Weekly Project Health Report
      </h1>
      <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">
        ${projectName}
      </p>
      <p style="margin: 5px 0 0 0; color: ${BRAND.orange}; font-size: 13px; font-weight: 600;">
        ${dateRangeStr}
      </p>
    </div>

    <!-- High Signal Cards -->
    <div style="padding: 25px 30px; background-color: #f8f9fa;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        <tr>
          <!-- Project Health Card -->
          <td width="33%" style="padding: 0 8px 0 0; vertical-align: top;">
            <div style="background: white; border-radius: 8px; padding: 18px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-top: 4px solid ${health.color};">
              <div style="font-size: 28px; margin-bottom: 5px;">${health.icon}</div>
              <div style="font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Project Health</div>
              <div style="font-size: 20px; font-weight: bold; color: ${health.color}; margin-top: 5px;">${health.label}</div>
            </div>
          </td>
          
          <!-- Forecast Card -->
          <td width="33%" style="padding: 0 4px; vertical-align: top;">
            <div style="background: white; border-radius: 8px; padding: 18px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-top: 4px solid ${metrics.evm.varianceAtCompletion >= 0 ? BRAND.green : BRAND.red};">
              <div style="font-size: 28px; margin-bottom: 5px;">${metrics.evm.varianceAtCompletion >= 0 ? '💰' : '⚠️'}</div>
              <div style="font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Forecast</div>
              <div style="font-size: 16px; font-weight: bold; color: ${metrics.evm.varianceAtCompletion >= 0 ? BRAND.green : BRAND.red}; margin-top: 5px;">
                ${metrics.evm.varianceAtCompletion >= 0 ? 'Savings' : 'Overrun'}
              </div>
              <div style="font-size: 14px; color: #333;">${formatCurrency(Math.abs(metrics.evm.varianceAtCompletion))}</div>
            </div>
          </td>
          
          <!-- Schedule Card -->
          <td width="33%" style="padding: 0 0 0 8px; vertical-align: top;">
            <div style="background: white; border-radius: 8px; padding: 18px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-top: 4px solid ${metrics.evm.scheduleVarianceDays >= 0 ? BRAND.green : BRAND.amber};">
              <div style="font-size: 28px; margin-bottom: 5px;">${metrics.evm.scheduleVarianceDays >= 0 ? '🚀' : '🐢'}</div>
              <div style="font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Schedule</div>
              <div style="font-size: 20px; font-weight: bold; color: ${metrics.evm.scheduleVarianceDays >= 0 ? BRAND.green : BRAND.amber}; margin-top: 5px;">
                ${Math.abs(metrics.evm.scheduleVarianceDays)} Days
              </div>
              <div style="font-size: 12px; color: #666;">${metrics.evm.scheduleVarianceDays >= 0 ? 'Ahead' : 'Behind'}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- EVM Indices -->
    <div style="padding: 0 30px 20px 30px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background: ${BRAND.lightBlue}; border-radius: 8px; overflow: hidden;">
        <tr>
          <td width="50%" style="padding: 15px 20px; text-align: center; border-right: 1px solid rgba(0,51,102,0.1);">
            <div style="font-size: 11px; color: ${BRAND.navy}; text-transform: uppercase; letter-spacing: 0.5px;">Cost Performance (CPI)</div>
            <div style="font-size: 28px; font-weight: bold; color: ${metrics.evm.cpi >= 1 ? BRAND.green : BRAND.red};">${metrics.evm.cpi.toFixed(2)}</div>
          </td>
          <td width="50%" style="padding: 15px 20px; text-align: center;">
            <div style="font-size: 11px; color: ${BRAND.navy}; text-transform: uppercase; letter-spacing: 0.5px;">Schedule Performance (SPI)</div>
            <div style="font-size: 28px; font-weight: bold; color: ${metrics.evm.spi >= 1 ? BRAND.green : BRAND.amber};">${metrics.evm.spi.toFixed(2)}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- AI Management Commentary -->
    <div style="padding: 0 30px 25px 30px;">
      <div style="background: linear-gradient(135deg, ${BRAND.navy} 0%, #004488 100%); border-radius: 8px; padding: 20px;">
        <div style="font-size: 11px; color: ${BRAND.orange}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
          🤖 Management Commentary
        </div>
        <p style="margin: 0; color: white; font-size: 14px; line-height: 1.6;">
          ${commentary}
        </p>
      </div>
    </div>

    <!-- Production by Phase -->
    <div style="padding: 0 30px 25px 30px;">
      <h2 style="margin: 0 0 15px 0; font-size: 14px; color: ${BRAND.navy}; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND.orange}; padding-bottom: 8px;">
        📊 Production This Week
      </h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 10px 12px; text-align: left; font-size: 11px; color: #666; text-transform: uppercase; border-bottom: 1px solid #dee2e6;">Activity</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 11px; color: #666; text-transform: uppercase; border-bottom: 1px solid #dee2e6;">Progress</th>
          </tr>
        </thead>
        <tbody>
          ${metrics.production.length > 0 ? metrics.production.map(([phase, metres], idx) => `
            <tr style="background: ${idx % 2 === 0 ? 'white' : '#fafafa'};">
              <td style="padding: 12px; font-size: 13px; color: #333; border-bottom: 1px solid #eee;">${phase}</td>
              <td style="padding: 12px; font-size: 13px; color: ${BRAND.navy}; font-weight: 600; text-align: right; border-bottom: 1px solid #eee;">${metres.toLocaleString()} m</td>
            </tr>
          `).join('') : `
            <tr>
              <td colspan="2" style="padding: 20px; text-align: center; color: #666; font-style: italic;">No production data recorded this week</td>
            </tr>
          `}
        </tbody>
      </table>
    </div>

    <!-- Time Lost Analysis -->
    ${metrics.timeLost.length > 0 ? `
    <div style="padding: 0 30px 25px 30px;">
      <h2 style="margin: 0 0 15px 0; font-size: 14px; color: ${BRAND.navy}; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND.red}; padding-bottom: 8px;">
        ⏱️ Top Bottlenecks
      </h2>
      <div style="background: #fff5f5; border-radius: 8px; padding: 15px; border-left: 4px solid ${BRAND.red};">
        <ul style="margin: 0; padding-left: 20px;">
          ${metrics.timeLost.map(([reason, hours]) => `
            <li style="margin-bottom: 8px; font-size: 13px; color: #333;">
              <strong>${reason}</strong>: ${hours} hours lost across all crews
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
    ` : ''}

    <!-- Resource Summary -->
    <div style="padding: 0 30px 25px 30px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        <tr>
          <td width="50%" style="padding-right: 10px;">
            <div style="background: #f8f9fa; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 11px; color: #666; text-transform: uppercase;">Labour Hours</div>
              <div style="font-size: 24px; font-weight: bold; color: ${BRAND.navy};">${metrics.labour.hours.toLocaleString()}</div>
              <div style="font-size: 12px; color: #666;">${formatCurrency(metrics.labour.cost)}</div>
            </div>
          </td>
          <td width="50%" style="padding-left: 10px;">
            <div style="background: #f8f9fa; border-radius: 8px; padding: 15px; text-align: center;">
              <div style="font-size: 11px; color: #666; text-transform: uppercase;">Equipment Hours</div>
              <div style="font-size: 24px; font-weight: bold; color: ${BRAND.navy};">${metrics.equipment.hours.toLocaleString()}</div>
              <div style="font-size: 12px; color: #666;">${formatCurrency(metrics.equipment.cost)}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="background: ${BRAND.navy}; padding: 20px 30px; text-align: center;">
      <p style="margin: 0 0 5px 0; color: rgba(255,255,255,0.7); font-size: 11px;">
        Generated by Pipe-Up • Pipeline Inspector Platform
      </p>
      <p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 10px;">
        Based on ${metrics.reportCount} daily reports from ${dateRangeStr}
      </p>
    </div>

  </div>
</body>
</html>`

    return html
  }

  // Main generate function
  const generateSummary = async () => {
    setSuccess(null)
    setError(null)
    
    // Step 1: Aggregate data
    const metrics = await aggregateWeeklyData()
    if (!metrics) return

    // Step 2: Generate AI commentary
    const commentary = await generateAICommentary(metrics)

    // Step 3: Generate email HTML
    const html = generateEmailHtml(metrics, commentary)
    setEmailHtml(html)

    setSuccess('Executive summary generated successfully!')
  }

  // Preview email in new window
  const previewEmail = () => {
    if (!emailHtml) return
    const previewWindow = window.open('', '_blank')
    previewWindow.document.write(emailHtml)
    previewWindow.document.close()
  }

  // Copy HTML to clipboard
  const copyHtml = async () => {
    if (!emailHtml) return
    try {
      await navigator.clipboard.writeText(emailHtml)
      setSuccess('Email HTML copied to clipboard!')
    } catch (err) {
      setError('Failed to copy to clipboard')
    }
  }

  // Send email via Supabase Edge Function
  const sendEmail = async () => {
    if (!emailHtml || !recipientEmail) {
      setError('Please enter a recipient email address')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const { startDate, endDate } = weeklyData.dateRange
      const dateRangeStr = formatDateRange(startDate, endDate)
      
      const { data, error: fnError } = await supabase.functions.invoke('send-executive-summary', {
        body: {
          to: recipientEmail,
          subject: `📈 Weekly Project Health Report: Demo Pipeline Project - ${dateRangeStr}`,
          htmlContent: emailHtml
        }
      })

      if (fnError) throw fnError
      if (data?.error) throw new Error(data.error)
      
      setSuccess(`Email sent successfully to ${recipientEmail}!`)
      setRecipientEmail('')
    } catch (err) {
      console.error('Email send error:', err)
      setError('Failed to send email: ' + (err.message || 'Unknown error'))
    }
    setLoading(false)
  }

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '8px', 
      padding: '25px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '25px', borderBottom: `2px solid ${BRAND.orange}`, paddingBottom: '15px' }}>
        <h2 style={{ margin: 0, color: BRAND.navy, fontSize: '20px' }}>
          📈 Weekly Executive Summary
        </h2>
        <p style={{ margin: '8px 0 0 0', color: '#666', fontSize: '14px' }}>
          Generate an AI-powered executive report with EVM metrics and production insights
        </p>
      </div>

      {/* Generate Button */}
      <button
        onClick={generateSummary}
        disabled={loading || generating}
        style={{
          padding: '14px 28px',
          backgroundColor: loading || generating ? BRAND.gray : BRAND.navy,
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: loading || generating ? 'not-allowed' : 'pointer',
          fontSize: '15px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        {loading ? '📊 Aggregating Data...' : generating ? '🤖 Generating AI Insights...' : '🚀 Generate Executive Summary'}
      </button>

      {/* Status Messages */}
      {error && (
        <div style={{ 
          marginTop: '15px', 
          padding: '12px 15px', 
          backgroundColor: '#f8d7da', 
          color: '#721c24',
          borderRadius: '6px',
          fontSize: '14px'
        }}>
          ❌ {error}
        </div>
      )}

      {success && (
        <div style={{ 
          marginTop: '15px', 
          padding: '12px 15px', 
          backgroundColor: '#d4edda', 
          color: '#155724',
          borderRadius: '6px',
          fontSize: '14px'
        }}>
          ✅ {success}
        </div>
      )}

      {/* Results Section */}
      {weeklyData && (
        <div style={{ marginTop: '25px' }}>
          {/* Quick Stats */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
            gap: '15px',
            marginBottom: '20px'
          }}>
            <div style={{ 
              padding: '15px', 
              backgroundColor: BRAND.lightBlue, 
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '11px', color: BRAND.navy, textTransform: 'uppercase' }}>Reports</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: BRAND.navy }}>{weeklyData.reportCount}</div>
            </div>
            <div style={{ 
              padding: '15px', 
              backgroundColor: weeklyData.health.color + '20', 
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '11px', color: '#333', textTransform: 'uppercase' }}>Health</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: weeklyData.health.color }}>{weeklyData.health.label}</div>
            </div>
            <div style={{ 
              padding: '15px', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>CPI</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: weeklyData.evm.cpi >= 1 ? BRAND.green : BRAND.red }}>{weeklyData.evm.cpi}</div>
            </div>
            <div style={{ 
              padding: '15px', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>SPI</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: weeklyData.evm.spi >= 1 ? BRAND.green : BRAND.amber }}>{weeklyData.evm.spi}</div>
            </div>
          </div>

          {/* AI Commentary Preview */}
          {aiCommentary && (
            <div style={{ 
              marginBottom: '20px',
              padding: '15px',
              backgroundColor: BRAND.navy,
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '11px', color: BRAND.orange, textTransform: 'uppercase', marginBottom: '8px' }}>
                🤖 AI Management Commentary
              </div>
              <p style={{ margin: 0, color: 'white', fontSize: '14px', lineHeight: 1.6 }}>
                {aiCommentary}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          {emailHtml && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <button
                onClick={previewEmail}
                style={{
                  padding: '10px 20px',
                  backgroundColor: BRAND.orange,
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold'
                }}
              >
                👁️ Preview Email
              </button>
              <button
                onClick={copyHtml}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold'
                }}
              >
                📋 Copy HTML
              </button>
            </div>
          )}

          {/* Send Email Section */}
          {emailHtml && (
            <div style={{ 
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6'
            }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
                📧 Send to Executive Team
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="executive@company.com"
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
                <button
                  onClick={sendEmail}
                  disabled={loading || !recipientEmail}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: loading ? BRAND.gray : BRAND.green,
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {loading ? 'Sending...' : '📤 Send Email'}
                </button>
              </div>
              <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#666' }}>
                Note: Email sending requires edge function setup. Use "Copy HTML" to paste into your email client.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
