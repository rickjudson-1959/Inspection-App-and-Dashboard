// supabase/functions/timesheet-notification/index.ts
// Sends email notifications when timesheets are approved or rejected

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { 
      timesheet_id, 
      action,  // 'approved' or 'revision_requested'
      revision_notes,
      reviewer_name 
    } = await req.json()

    if (!timesheet_id || !action) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: timesheet_id, action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = 'https://aatvckalnvojlykfgnmz.supabase.co'
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Fetch timesheet with inspector info
    const { data: timesheet, error: tsError } = await supabaseAdmin
      .from('inspector_timesheets')
      .select(`
        *,
        inspector_profiles (
          id,
          user_id,
          company_name
        )
      `)
      .eq('id', timesheet_id)
      .single()

    if (tsError || !timesheet) {
      return new Response(
        JSON.stringify({ error: 'Timesheet not found', details: tsError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get inspector's email from user_profiles
    const { data: userProfile, error: userError } = await supabaseAdmin
      .from('user_profiles')
      .select('email, full_name')
      .eq('id', timesheet.inspector_profiles?.user_id)
      .single()

    if (userError || !userProfile?.email) {
      return new Response(
        JSON.stringify({ error: 'Inspector email not found', details: userError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Format currency
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-CA', { 
        style: 'currency', 
        currency: 'CAD',
        minimumFractionDigits: 2
      }).format(amount || 0)
    }

    // Build email content based on action
    let subject: string
    let emailHtml: string
    const inspectorName = userProfile.full_name || timesheet.inspector_profiles?.company_name || 'Inspector'
    const periodStart = timesheet.period_start
    const periodEnd = timesheet.period_end
    const totalAmount = formatCurrency(timesheet.invoice_total || timesheet.total_amount || 0)

    if (action === 'approved') {
      subject = '✅ Your Timesheet Has Been Approved - Pipe-Up'
      emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f8f9fa; padding: 24px; border-radius: 0 0 8px 8px; }
    .amount-box { background: #d1fae5; border: 1px solid #6ee7b7; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0; }
    .amount { font-size: 28px; font-weight: bold; color: #065f46; }
    .details { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .button { display: inline-block; padding: 12px 24px; background: #059669; color: white; text-decoration: none; border-radius: 6px; margin: 15px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">✅ Timesheet Approved</h1>
    </div>
    <div class="content">
      <p>Hi ${inspectorName},</p>
      <p>Great news! Your timesheet has been approved${reviewer_name ? ` by ${reviewer_name}` : ''}.</p>
      
      <div class="amount-box">
        <div style="font-size: 14px; color: #065f46; margin-bottom: 4px;">APPROVED AMOUNT</div>
        <div class="amount">${totalAmount}</div>
      </div>
      
      <div class="details">
        <div class="detail-row">
          <span style="color: #6b7280;">Period</span>
          <span style="font-weight: 500;">${periodStart} to ${periodEnd}</span>
        </div>
        <div class="detail-row">
          <span style="color: #6b7280;">Status</span>
          <span style="font-weight: 500; color: #059669;">Approved ✓</span>
        </div>
      </div>
      
      <p>Payment will be processed according to the standard payment schedule.</p>
      
      <p style="text-align: center;">
        <a href="https://app.pipe-up.ca/inspector-invoicing" class="button">View in Pipe-Up</a>
      </p>
    </div>
    <div class="footer">
      <p>This notification was sent from Pipe-Up Pipeline Inspector Platform</p>
      <p>© ${new Date().getFullYear()} Pipe-Up. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `.trim()

    } else if (action === 'revision_requested') {
      subject = '↩️ Timesheet Revision Requested - Pipe-Up'
      emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f8f9fa; padding: 24px; border-radius: 0 0 8px 8px; }
    .revision-box { background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin: 20px 0; }
    .revision-label { font-size: 12px; font-weight: 600; color: #991b1b; margin-bottom: 8px; }
    .revision-notes { color: #b91c1c; font-style: italic; }
    .details { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .button { display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px; margin: 15px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">↩️ Revision Requested</h1>
    </div>
    <div class="content">
      <p>Hi ${inspectorName},</p>
      <p>Your timesheet for <strong>${periodStart} to ${periodEnd}</strong> requires revision${reviewer_name ? `. ${reviewer_name} has provided the following feedback` : ''}:</p>
      
      <div class="revision-box">
        <div class="revision-label">REVISION NOTES</div>
        <div class="revision-notes">${revision_notes || 'Please review and correct your timesheet.'}</div>
      </div>
      
      <div class="details">
        <div class="detail-row">
          <span style="color: #6b7280;">Period</span>
          <span style="font-weight: 500;">${periodStart} to ${periodEnd}</span>
        </div>
        <div class="detail-row">
          <span style="color: #6b7280;">Amount</span>
          <span style="font-weight: 500;">${totalAmount}</span>
        </div>
        <div class="detail-row">
          <span style="color: #6b7280;">Status</span>
          <span style="font-weight: 500; color: #dc2626;">Revision Requested</span>
        </div>
      </div>
      
      <p>Please log in to make the necessary corrections and resubmit your timesheet.</p>
      
      <p style="text-align: center;">
        <a href="https://app.pipe-up.ca/inspector-invoicing" class="button">Edit Timesheet</a>
      </p>
    </div>
    <div class="footer">
      <p>This notification was sent from Pipe-Up Pipeline Inspector Platform</p>
      <p>© ${new Date().getFullYear()} Pipe-Up. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `.trim()

    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Must be "approved" or "revision_requested"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send email via Resend
    let emailSent = false
    let emailError = null
    let emailMessageId = null

    if (!RESEND_API_KEY) {
      emailError = 'RESEND_API_KEY not configured'
      console.error(emailError)
    } else {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Pipe-Up <noreply@pipe-up.ca>',
            to: userProfile.email,
            subject: subject,
            html: emailHtml,
          }),
        })

        const emailResult = await emailResponse.json()

        if (!emailResponse.ok) {
          emailError = `Resend API error: ${JSON.stringify(emailResult)}`
          console.error('Resend email error:', emailResponse.status, emailResult)
        } else if (emailResult?.id) {
          emailSent = true
          emailMessageId = emailResult.id
          console.log(`✅ ${action} notification sent to ${userProfile.email}. Message ID:`, emailResult.id)
        } else {
          emailError = 'Resend API returned success but no message ID'
          console.error('Unexpected Resend response:', emailResult)
        }
      } catch (emailErr) {
        emailError = `Email send error: ${emailErr.message || 'Unknown error'}`
        console.error('Error sending notification email:', emailErr)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: emailSent,
        message: emailSent 
          ? `Notification email sent to ${userProfile.email}` 
          : `Email failed: ${emailError}`,
        email_sent: emailSent,
        email_message_id: emailMessageId,
        email_error: emailError,
        recipient: userProfile.email
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Timesheet notification error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
