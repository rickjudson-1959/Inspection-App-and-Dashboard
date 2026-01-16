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
    const { email, full_name, user_role, redirect_to } = await req.json()

    if (!email || !full_name || !user_role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, full_name, user_role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Supabase automatically provides these environment variables to edge functions
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing. This should be automatically provided.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if user already exists (handle both user_profiles and auth.users)
    const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine, other errors are real problems
      console.error('Error checking existing user:', profileCheckError)
      return new Response(
        JSON.stringify({ error: 'Error checking for existing user', details: profileCheckError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (existingProfile) {
      return new Response(
        JSON.stringify({ error: 'A user with this email already exists' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.toLowerCase(),
      {
        data: { full_name, user_role, invited_at: new Date().toISOString() },
        redirectTo: redirect_to || 'https://app.pipe-up.ca'
      }
    )

    if (inviteError) {
      return new Response(
        JSON.stringify({ error: inviteError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (inviteData?.user) {
      await supabaseAdmin.from('user_profiles').upsert({
        id: inviteData.user.id,
        email: email.toLowerCase(),
        full_name,
        user_role,
        role: user_role,
        status: 'invited',
        created_at: new Date().toISOString()
      }, { onConflict: 'id' })
    }

    return new Response(
      JSON.stringify({ success: true, message: `Invitation sent to ${email}`, user_id: inviteData?.user?.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.stack || 'No additional details'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
