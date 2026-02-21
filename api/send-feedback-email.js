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
    const { userName, userEmail, userRole, page, feedbackText } = req.body

    if (!feedbackText || !page) {
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
          .section { margin-bottom: 15px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #CC5500; }
          .label { font-weight: bold; color: #666; }
          .feedback { white-space: pre-wrap; padding: 12px; background: #fff; border: 1px solid #dee2e6; border-radius: 4px; margin-top: 8px; }
          .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0; font-size: 22px;">User Feedback</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Pipe-Up Pipeline Inspection Platform</p>
        </div>
        <div class="content">
          <div class="section">
            <div><span class="label">From:</span> ${userName || 'Unknown'} (${userEmail || 'no email'})</div>
            <div><span class="label">Role:</span> ${userRole || 'N/A'}</div>
            <div><span class="label">Page:</span> ${page}</div>
            <div><span class="label">Time:</span> ${new Date().toISOString()}</div>
          </div>
          <div class="section">
            <div class="label">Feedback:</div>
            <div class="feedback">${feedbackText}</div>
          </div>
        </div>
        <div class="footer"><p>Submitted via Pipe-Up in-app feedback</p></div>
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
        from: 'Pipe-Up Feedback <noreply@pipe-up.ca>',
        to: ['rjudson@pipe-up.ca'],
        subject: `Pipe-Up Feedback from ${userName || 'User'} (${page})`,
        html: emailHtml,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Resend error:', data)
      return res.status(500).json({ error: 'Failed to send email', details: data })
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Feedback email error:', error)
    return res.status(500).json({ error: error.message })
  }
}
