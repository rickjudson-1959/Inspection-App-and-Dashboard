// Vercel API Route: /api/send-report-email
// Place this file at: api/send-report-email.js

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { to, inspectorName, reportDate, spread, pipeline, activities, weather, safetyNotes, reportId } = req.body

    if (!to || !inspectorName || !reportDate) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Build email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
          .header { background-color: #003366; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; background-color: #fff; }
          .section { margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #007bff; }
          .section-title { font-weight: bold; color: #003366; margin-bottom: 10px; font-size: 16px; }
          .field { margin: 8px 0; }
          .label { font-weight: bold; color: #666; }
          .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
          .activity-item { padding: 10px; margin: 8px 0; background-color: #fff; border-radius: 4px; border: 1px solid #dee2e6; }
          .activity-type { font-weight: bold; color: #007bff; }
          .kp-range { color: #28a745; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">Daily Inspector Report</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Pipe-Up Pipeline Inspection System</p>
        </div>
        
        <div class="content">
          <div class="section">
            <div class="section-title">📋 Report Information</div>
            <div class="field"><span class="label">Date:</span> ${reportDate}</div>
            <div class="field"><span class="label">Inspector:</span> ${inspectorName}</div>
            <div class="field"><span class="label">Spread:</span> ${spread || 'N/A'}</div>
            <div class="field"><span class="label">Pipeline:</span> ${pipeline || 'N/A'}</div>
          </div>

          ${weather ? `
          <div class="section">
            <div class="section-title">🌤️ Weather Conditions</div>
            <div class="field">${weather}</div>
          </div>
          ` : ''}

          <div class="section">
            <div class="section-title">🔧 Activities Summary</div>
            ${activities && activities.length > 0 ? activities.map(a => `
              <div class="activity-item">
                <div class="activity-type">${a.activityType || 'Activity'}</div>
                <div class="kp-range">KP ${a.startKP || '?'} → ${a.endKP || '?'}</div>
                ${a.contractor ? `<div><span class="label">Contractor:</span> ${a.contractor}</div>` : ''}
                ${a.foreman ? `<div><span class="label">Foreman:</span> ${a.foreman}</div>` : ''}
                ${a.workDescription ? `<div style="margin-top: 5px; font-size: 13px; color: #666;">${a.workDescription.substring(0, 300)}${a.workDescription.length > 300 ? '...' : ''}</div>` : ''}
              </div>
            `).join('') : '<p style="color: #666; font-style: italic;">No activities recorded</p>'}
          </div>

          ${safetyNotes ? `
          <div class="section" style="border-left-color: #ffc107;">
            <div class="section-title">⚠️ Safety Notes</div>
            <div class="field">${safetyNotes}</div>
          </div>
          ` : ''}
        </div>

        <div class="footer">
          <p style="margin: 0 0 5px 0;">This is an automated email from Pipe-Up Pipeline Inspection System.</p>
          <p style="margin: 0 0 5px 0; font-family: monospace; font-size: 11px;">Report ID: ${reportId || 'N/A'}</p>
          <p style="margin: 0;">© ${new Date().getFullYear()} Pipe-Up. All rights reserved.</p>
        </div>
      </body>
      </html>
    `

    // Send email via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Pipe-Up Reports <reports@pipe-up.ca>',
        to: [to],
        subject: `Daily Inspector Report - ${reportDate} - ${inspectorName}`,
        html: emailHtml,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Resend error:', data)
      return res.status(500).json({ success: false, error: data.message || 'Failed to send email' })
    }

    return res.status(200).json({ success: true, data })

  } catch (error) {
    console.error('Email error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
}
