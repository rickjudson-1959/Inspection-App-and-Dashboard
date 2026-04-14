import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return new Response(
        JSON.stringify({ error: 'Token and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const actualSupabaseUrl = 'https://aatvckalnvojlykfgnmz.supabase.co'

    const supabaseAdmin = createClient(
      actualSupabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Hash the token to look it up in the database
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token))
    const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

    // Look up the invitation
    const { data: invitation, error: lookupError } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('accepted_at', null)
      .single()

    if (lookupError || !invitation) {
      return new Response(
        JSON.stringify({ error: 'Invalid or already-used invitation link' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check expiration
    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'This invitation has expired. Please ask your administrator to send a new one.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find the auth user by email
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
    const authUser = authUsers?.users?.find(u => u.email === invitation.email)

    if (!authUser) {
      return new Response(
        JSON.stringify({ error: 'User account not found. Please contact your administrator.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Set the user's password and confirm their email
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password: password,
      email_confirm: true
    })

    if (updateError) {
      return new Response(
        JSON.stringify({ error: `Failed to set password: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Mark invitation as accepted
    await supabaseAdmin.from('user_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)

    // Update user profile status to active
    await supabaseAdmin.from('user_profiles')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('email', invitation.email)

    // Sign in the user to create a session
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: invitation.email,
      password: password
    })

    if (signInError) {
      // Password was set but sign-in failed — user can log in manually
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Password set successfully. Please log in.',
          redirect_to: '/login'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account activated successfully',
        session: signInData.session,
        redirect_to: invitation.redirect_to || '/login'
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
