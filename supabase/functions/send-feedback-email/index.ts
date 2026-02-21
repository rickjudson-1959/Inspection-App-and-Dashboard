import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userName, userEmail, userRole, page, feedbackText } = await req.json()

    if (!feedbackText || !page) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: feedbackText, page' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Pipe-Up Feedback <noreply@pipe-up.ca>',
        to: ['rickjudson@telusmail.net'],
        subject: `Pipe-Up Feedback from ${userName || 'User'} (${page})`,
        html: emailHtml,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('Resend API error:', result)
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: result }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Feedback email error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
