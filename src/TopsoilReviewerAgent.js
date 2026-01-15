// TopsoilReviewerAgent.js
// AI-powered environmental compliance review for Topsoil stripping activities
// Checks for BCER/CER soil handling requirements and weather-related risks

import { supabase } from './supabase'

// High-risk conditions that trigger alerts
const HIGH_RISK_CONDITIONS = {
  RAIN_WITH_UNSTABILIZED: {
    check: (weather, qa) => 
      weather?.precipitation > 5 && qa?.topsoilStabilized !== 'Yes',
    severity: 'HIGH',
    message: 'Rain forecast with unstabilized topsoil stockpiles - erosion risk',
    recommendedAction: 'Cover stockpiles or install additional ESC measures'
  },
  HIGH_ADMIXTURE: {
    check: (weather, qa) => 
      parseFloat(qa?.admixture) > 15,
    severity: 'HIGH',
    message: 'Admixture levels exceed 15% - subsoil contamination risk',
    recommendedAction: 'Reduce strip depth or adjust stripping technique'
  },
  BUFFER_ENCROACHMENT: {
    check: (weather, qa) => 
      parseFloat(qa?.bufferDistance) < 30 && qa?.waterBodyNearby === 'Yes',
    severity: 'CRITICAL',
    message: 'Stripping within 30m of waterbody without authorization',
    recommendedAction: 'Stop work and verify environmental permit conditions'
  },
  DEPTH_VARIANCE: {
    check: (weather, qa) => 
      Math.abs(parseFloat(qa?.actualDepth) - parseFloat(qa?.specifiedDepth)) > 0.02,
    severity: 'MEDIUM',
    message: 'Strip depth variance exceeds 2cm from specification',
    recommendedAction: 'Verify topsoil depth and adjust equipment'
  },
  STOCKPILE_SEPARATION: {
    check: (weather, qa) => 
      parseFloat(qa?.stockpileSeparation) < 1 && qa?.separateStockpiles === 'Yes',
    severity: 'HIGH',
    message: 'Topsoil and subsoil stockpiles separated by less than 1m',
    recommendedAction: 'Increase separation or install barrier'
  },
  HORIZON_MIXING: {
    check: (weather, qa) => 
      qa?.horizonSeparationConfirmed === 'Fail - Mixed Horizons',
    severity: 'HIGH',
    message: 'A and B soil horizons have been mixed',
    recommendedAction: 'Flag location for remediation during reclamation'
  }
}

// Alert thresholds
const ALERT_THRESHOLDS = {
  admixture: 15, // percent
  bufferDistance: 30, // metres from waterbody
  depthVariance: 0.02, // metres
  stockpileSeparation: 1, // metres
  rainThreshold: 5 // mm
}

/**
 * Review a Topsoil activity block for environmental compliance
 * @param {Object} activityData - The topsoil activity block data
 * @param {Object} weatherData - Current weather conditions
 * @param {Object} projectConfig - Project-specific configuration
 * @returns {Object} Review result with alerts, warnings, and recommendations
 */
export async function reviewTopsoilActivity(activityData, weatherData = {}, projectConfig = {}) {
  const alerts = []
  const warnings = []
  const passedChecks = []
  
  // Get QA data from the activity block
  const qa = activityData.qualityChecks || activityData.qaData || {}
  
  // Check each high-risk condition
  for (const [key, condition] of Object.entries(HIGH_RISK_CONDITIONS)) {
    try {
      if (condition.check(weatherData, qa)) {
        const alert = {
          type: key,
          severity: condition.severity,
          message: condition.message,
          recommendedAction: condition.recommendedAction,
          timestamp: new Date().toISOString()
        }
        
        if (condition.severity === 'CRITICAL' || condition.severity === 'HIGH') {
          alerts.push(alert)
        } else {
          warnings.push(alert)
        }
      } else {
        passedChecks.push(key)
      }
    } catch (err) {
      console.warn(`Error checking condition ${key}:`, err)
    }
  }
  
  // Additional weather-based checks
  if (weatherData.precipitation > 10) {
    warnings.push({
      type: 'HEAVY_RAIN',
      severity: 'MEDIUM',
      message: 'Heavy rain conditions - monitor for runoff',
      recommendedAction: 'Increase ESC inspection frequency'
    })
  }
  
  if (weatherData.tempLow < 0) {
    warnings.push({
      type: 'FROST_CONDITIONS',
      severity: 'LOW',
      message: 'Freezing conditions may affect soil workability',
      recommendedAction: 'Verify soil is not frozen before stripping'
    })
  }
  
  // Check stockpile management
  if (qa.stockpileLocation && !qa.stockpileMarked) {
    warnings.push({
      type: 'UNMARKED_STOCKPILE',
      severity: 'MEDIUM',
      message: 'Stockpile location not marked for reclamation',
      recommendedAction: 'Install stockpile markers and record GPS coordinates'
    })
  }
  
  // Horizon separation check
  if (qa.horizonSeparationConfirmed === 'Fail - Unclear Boundary') {
    warnings.push({
      type: 'UNCLEAR_HORIZON',
      severity: 'MEDIUM',
      message: 'A/B horizon boundary unclear - may need verification',
      recommendedAction: 'Consider test pits to verify boundary depth'
    })
  }
  
  // Compile results
  const result = {
    reportId: activityData.reportId,
    blockId: activityData.id,
    activityKP: `${activityData.startKP || ''} - ${activityData.endKP || ''}`,
    reviewedAt: new Date().toISOString(),
    alertCount: alerts.length,
    warningCount: warnings.length,
    passedCount: passedChecks.length,
    alerts,
    warnings,
    passedChecks,
    overallStatus: alerts.length > 0 ? 'ALERT' : warnings.length > 0 ? 'WARNING' : 'PASS'
  }
  
  // If there are high-severity alerts, notify Environmental Lead
  if (alerts.some(a => a.severity === 'HIGH' || a.severity === 'CRITICAL')) {
    result.notificationRequired = true
    result.notificationRecipient = projectConfig.environmentalLeadEmail || 'environmental@project.com'
  }
  
  return result
}

/**
 * Send alert notification to Environmental Lead
 * @param {Object} reviewResult - Result from reviewTopsoilActivity
 * @param {Object} config - Configuration including email settings
 */
export async function sendEnvironmentalAlert(reviewResult, config = {}) {
  if (!reviewResult.notificationRequired) {
    return { sent: false, reason: 'No notification required' }
  }
  
  const alertSummary = reviewResult.alerts
    .map(a => `• ${a.type}: ${a.message}`)
    .join('\n')
  
  const emailBody = {
    to: reviewResult.notificationRecipient,
    subject: `🚨 TOPSOIL ALERT - ${reviewResult.overallStatus} - KP ${reviewResult.activityKP}`,
    html: `
      <h2>Environmental Compliance Alert</h2>
      <p><strong>Location:</strong> KP ${reviewResult.activityKP}</p>
      <p><strong>Time:</strong> ${new Date(reviewResult.reviewedAt).toLocaleString()}</p>
      <p><strong>Status:</strong> <span style="color: red; font-weight: bold;">${reviewResult.overallStatus}</span></p>
      
      <h3>Alerts (${reviewResult.alertCount})</h3>
      <ul>
        ${reviewResult.alerts.map(a => `
          <li>
            <strong>${a.type}</strong> (${a.severity})<br/>
            ${a.message}<br/>
            <em>Recommended Action: ${a.recommendedAction}</em>
          </li>
        `).join('')}
      </ul>
      
      ${reviewResult.warnings.length > 0 ? `
        <h3>Warnings (${reviewResult.warningCount})</h3>
        <ul>
          ${reviewResult.warnings.map(w => `<li>${w.type}: ${w.message}</li>`).join('')}
        </ul>
      ` : ''}
      
      <p>Please review and take appropriate action.</p>
      <p><em>This is an automated alert from the Pipe-Up inspection system.</em></p>
    `
  }
  
  try {
    // Use the existing send-report-email edge function or a dedicated alert function
    const { data, error } = await supabase.functions.invoke('send-report-email', {
      body: {
        to: emailBody.to,
        subject: emailBody.subject,
        htmlContent: emailBody.html,
        alertType: 'environmental'
      }
    })
    
    if (error) throw error
    
    return { sent: true, recipient: emailBody.to }
  } catch (err) {
    console.error('Failed to send environmental alert:', err)
    return { sent: false, error: err.message }
  }
}

/**
 * Integration hook - call this when a Topsoil activity block is saved
 * @param {Object} activityBlock - The saved activity block
 * @param {Object} reportData - The full report data including weather
 */
export async function onTopsoilActivitySaved(activityBlock, reportData = {}) {
  // Only process Topsoil activities
  if (activityBlock.activityType !== 'Topsoil') {
    return null
  }
  
  // Get weather data from report
  const weatherData = {
    weather: reportData.weather,
    precipitation: reportData.precipitation,
    tempHigh: reportData.temp_high,
    tempLow: reportData.temp_low
  }
  
  // Run the review
  const reviewResult = await reviewTopsoilActivity(activityBlock, weatherData, {
    environmentalLeadEmail: reportData.environmentalLeadEmail || 'environmental@project.com'
  })
  
  // Log the review result
  console.log('Topsoil Review Result:', reviewResult)
  
  // Send alerts if needed
  if (reviewResult.notificationRequired) {
    const notificationResult = await sendEnvironmentalAlert(reviewResult)
    reviewResult.notificationSent = notificationResult.sent
    reviewResult.notificationError = notificationResult.error
  }
  
  return reviewResult
}

export default {
  reviewTopsoilActivity,
  sendEnvironmentalAlert,
  onTopsoilActivitySaved,
  HIGH_RISK_CONDITIONS,
  ALERT_THRESHOLDS
}
