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

    // CRITICAL: Always use actual Supabase project URL (not custom domain) for auth operations
    // Custom domains (api.pipe-up.ca) do NOT handle /auth/v1/ routes correctly
    // Project ref: aatvckalnvojlykfgnmz
    // We must use the real Supabase URL, not the custom domain, for generateLink to work
    const actualSupabaseUrl = 'https://aatvckalnvojlykfgnmz.supabase.co'
    
    console.log('Using Supabase URL for auth:', actualSupabaseUrl)
    console.log('SUPABASE_URL env var was:', Deno.env.get('SUPABASE_URL'))
    
    const supabaseAdmin = createClient(
      actualSupabaseUrl,  // Always use actual Supabase URL, never custom domain
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
          // Map invitation role values to database role values
          const roleMapping: Record<string, string> = {
            'chief': 'chief_inspector',
            'exec': 'executive',
            'asst_chief': 'assistant_chief_inspector',
          }
          const dbRole = roleMapping[user_role] || user_role
          
          // User exists, just update profile
          await supabaseAdmin.from('user_profiles').upsert({
            id: existingUser.id,
            email: email.toLowerCase(),
            full_name,
            user_role: dbRole,
            role: dbRole,
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

    // Map invitation role values to database role values
    // Frontend uses short names (chief, exec, asst_chief) but database expects full names
    const roleMapping: Record<string, string> = {
      'chief': 'chief_inspector',
      'exec': 'executive',
      'asst_chief': 'assistant_chief_inspector',
      // All other roles stay the same
    }
    const dbRole = roleMapping[user_role] || user_role
    
    // Create user profile
    await supabaseAdmin.from('user_profiles').upsert({
      id: userData.user.id,
      email: email.toLowerCase(),
      full_name,
      user_role: dbRole, // Store the mapped role in both fields
      role: dbRole,
      status: 'invited',
      created_at: new Date().toISOString()
    }, { onConflict: 'id' })

    // Generate invitation link
    // IMPORTANT: For invitation links, users must set their password first
    // So we always redirect to /reset-password, then pass the final destination as a parameter
    const baseUrl = 'https://app.pipe-up.ca'
    
    // Determine final destination after password is set
    const finalDestination = redirect_to ? redirect_to : '/chief-dashboard'
    
    // Always redirect to reset-password first, with final destination as parameter
    // Format: /reset-password?redirect_to=/chief-dashboard
    const redirectPath = finalDestination.startsWith('/') ? finalDestination : `/${finalDestination}`
    const redirectUrl = `${baseUrl}/reset-password?redirect_to=${encodeURIComponent(redirectPath)}`
    
    const { data: tokenData, error: tokenError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: email.toLowerCase(),
      options: {
        redirectTo: redirectUrl
      }
    })

    if (tokenError) {
      console.error('❌ Error generating invite link:', tokenError)
      console.error('Error details:', JSON.stringify(tokenError, null, 2))
      // Continue anyway - user is created, they can use password reset
    } else if (tokenData?.properties?.action_link) {
      const generatedLink = tokenData.properties.action_link
      console.log('✅ Invitation link generated by Supabase')
      console.log('🔗 Original link from Supabase:', generatedLink)
      
      // CRITICAL FIX: Supabase's generateLink uses the custom domain from dashboard config
      // We must extract the token and reconstruct the link with the correct Supabase URL
      let inviteLink = generatedLink
      
      try {
        // Parse the URL to extract query parameters
        const url = new URL(generatedLink)
        const token = url.searchParams.get('token')
        const type = url.searchParams.get('type') || 'invite'
        const redirectTo = url.searchParams.get('redirect_to') || redirectUrl
        
        if (token) {
          // Reconstruct link with correct Supabase URL
          inviteLink = `${actualSupabaseUrl}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`
          console.log('🔧 Fixed link to use correct Supabase URL:', inviteLink.substring(0, 80) + '...')
          console.log('✅ Link now uses:', actualSupabaseUrl)
        } else {
          console.warn('⚠️ Could not extract token from link, using original')
        }
      } catch (parseError) {
        console.error('❌ Error parsing invitation link:', parseError)
        console.warn('⚠️ Using original link (may have wrong domain)')
      }
      
      // Verify the fixed link uses the correct domain
      if (inviteLink.includes('api.pipe-up.ca')) {
        console.error('⚠️ WARNING: Fixed link still uses custom domain!')
      } else if (inviteLink.includes('aatvckalnvojlykfgnmz.supabase.co')) {
        console.log('✅ Fixed link correctly uses Supabase project URL')
      }
      
      // Store the fixed link in tokenData for use below
      if (tokenData.properties) {
        tokenData.properties.action_link = inviteLink
      }
    } else {
      console.error('❌ No action_link in tokenData:', JSON.stringify(tokenData, null, 2))
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
      // Use the fixed link (tokenData.properties.action_link has been updated above)
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
