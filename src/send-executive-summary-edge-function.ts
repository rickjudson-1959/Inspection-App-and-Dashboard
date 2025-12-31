// supabase/functions/send-executive-summary/index.ts
// Deploy with: supabase functions deploy send-executive-summary

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, htmlContent, projectName } = await req.json()

    if (!to || !htmlContent) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, htmlContent' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Using Resend for email delivery
    // Sign up at https://resend.com and add RESEND_API_KEY to your Supabase secrets
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Pipe-Up Reports <reports@yourdomain.com>', // Update with your verified domain
        to: Array.isArray(to) ? to : [to],
        subject: subject || `📈 Weekly Project Health Report: ${projectName || 'Pipeline Project'}`,
        html: htmlContent,
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
      JSON.stringify({ success: true, messageId: result.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/*
SETUP INSTRUCTIONS:

1. Create Resend account at https://resend.com
2. Verify your domain or use their test domain
3. Get your API key from Resend dashboard
4. Add secret to Supabase:
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx

5. Deploy the function:
   supabase functions deploy send-executive-summary

6. Update WeeklyExecutiveSummary.jsx sendEmail function:

   const sendEmail = async () => {
     const { data, error } = await supabase.functions.invoke('send-executive-summary', {
       body: {
         to: recipientEmail,
         subject: `📈 Weekly Project Health Report: ${projectName} - ${formatDateRange(weeklyData.dateRange.startDate, weeklyData.dateRange.endDate)}`,
         htmlContent: emailHtml,
         projectName
       }
     })
     
     if (error) throw error
     setSuccess(`Email sent to ${recipientEmail}!`)
   }
*/
