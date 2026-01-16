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
    const { email, full_name, user_role, redirect_to } = await req.json()

    if (!email || !full_name || !user_role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, full_name, user_role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: existingUser } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single()

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: 'A user with this email already exists' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create user account first (without sending Supabase's default email)
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      email_confirm: false, // User needs to confirm via the invitation link
      user_metadata: {
        full_name: full_name,
        user_role: user_role,
        invited_at: new Date().toISOString()
      }
    })

    if (createError) {
      // If user already exists in auth, try to get them
      if (createError.message?.includes('already registered')) {
        const { data: existingAuthUser } = await supabaseAdmin.auth.admin.listUsers()
        const existingUser = existingAuthUser?.users?.find(u => u.email === email.toLowerCase())
        
        if (existingUser) {
          // User exists, just update profile
          await supabaseAdmin.from('user_profiles').upsert({
            id: existingUser.id,
            email: email.toLowerCase(),
            full_name,
            user_role,
            role: user_role,
            status: 'invited',
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' })
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: `User already exists. Profile updated.`, 
              user_id: existingUser.id,
              note: 'Invitation email not sent - user already registered'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Failed to create user account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create user profile
    await supabaseAdmin.from('user_profiles').upsert({
      id: userData.user.id,
      email: email.toLowerCase(),
      full_name,
      user_role,
      role: user_role,
      status: 'invited',
      created_at: new Date().toISOString()
    }, { onConflict: 'id' })

    // Generate password reset token (this acts as the invitation link)
    const redirectUrl = redirect_to || 'https://app.pipe-up.ca/inspector'
    const { data: tokenData, error: tokenError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: email.toLowerCase(),
      options: {
        redirectTo: redirectUrl
      }
    })

    if (tokenError) {
      console.error('Error generating invite link:', tokenError)
      // Continue anyway - user is created, they can use password reset
    }

    // Send custom invitation email via Resend
    let emailSent = false
    let emailError = null
    let emailMessageId = null

    if (!RESEND_API_KEY) {
      emailError = 'RESEND_API_KEY not configured in edge function secrets'
      console.error(emailError)
    } else if (!tokenData?.properties?.action_link) {
      emailError = 'Failed to generate invitation link'
      console.error('Token generation failed:', tokenError)
    } else {
      const inviteLink = tokenData.properties.action_link
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1e3a5f; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 4px; margin: 15px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>You've been invited to Pipe-Up</h1>
    </div>
    <div class="content">
      <p>Hello ${full_name},</p>
      <p>You've been invited to join the Pipe-Up Pipeline Inspector platform as a <strong>${user_role}</strong>.</p>
      <p>Click the button below to set your password and get started:</p>
      <a href="${inviteLink}" class="button">Accept Invitation & Set Password</a>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; font-size: 12px; color: #666;">${inviteLink}</p>
      <p>This link will expire in 7 days.</p>
    </div>
    <div class="footer">
      <p>This invitation was sent from Pipe-Up Platform</p>
    </div>
  </div>
</body>
</html>
      `.trim()

      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Pipe-Up <noreply@pipe-up.ca>', // Verified domain in Resend 
            to: email.toLowerCase(),
            subject: `You've been invited to Pipe-Up Pipeline Inspector`,
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
          console.log('Email sent successfully via Resend. Message ID:', emailResult.id)
        } else {
          emailError = 'Resend API returned success but no message ID'
          console.error('Unexpected Resend response:', emailResult)
        }
      } catch (emailErr) {
        emailError = `Email send error: ${emailErr.message || 'Unknown error'}`
        console.error('Error sending invitation email:', emailErr)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: emailSent 
          ? `User account created and invitation email sent to ${email}` 
          : `User account created. Email ${emailError ? `failed: ${emailError}` : 'not sent'}`,
        user_id: userData.user.id,
        email_sent: emailSent,
        email_message_id: emailMessageId,
        email_error: emailError,
        invitation_link: tokenData?.properties?.action_link || null
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
