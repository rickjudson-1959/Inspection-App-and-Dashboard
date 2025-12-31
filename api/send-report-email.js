export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

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
            <div class="section-title">Report Information</div>
            <div class="field"><span class="label">Date:</span> ${reportDate}</div>
            <div class="field"><span class="label">Inspector:</span> ${inspectorName}</div>
            <div class="field"><span class="label">Spread:</span> ${spread || 'N/A'}</div>
            <div class="field"><span class="label">Pipeline:</span> ${pipeline || 'N/A'}</div>
          </div>
          ${weather ? `<div class="section"><div class="section-title">Weather</div><div class="field">${weather}</div></div>` : ''}
          <div class="section">
            <div class="section-title">Activities</div>
            ${activities && activities.length > 0 ? activities.map(a => `<div class="activity-item"><div class="activity-type">${a.activityType || 'Activity'}</div><div class="kp-range">KP ${a.startKP || '?'} to ${a.endKP || '?'}</div>${a.contractor ? `<div>Contractor: ${a.contractor}</div>` : ''}</div>`).join('') : '<p>No activities</p>'}
          </div>
          ${safetyNotes ? `<div class="section"><div class="section-title">Safety Notes</div><div class="field">${safetyNotes}</div></div>` : ''}
        </div>
        <div class="footer"><p>Automated email from Pipe-Up | Report ID: ${reportId || 'N/A'}</p></div>
      </body>
      </html>
    `

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
      return res.status(500).json({ success: false, error: data.message || 'Failed to send email' })
    }

    return res.status(200).json({ success: true, data })

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
